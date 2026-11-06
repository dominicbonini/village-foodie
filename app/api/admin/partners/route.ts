// app/api/admin/partners/route.ts — Admin › Partners: the list, one partner's timeline, and every edit (partners-1).
//
//   GET                 → { partners }                      every partner, all columns
//   GET ?id=<uuid>      → { partner, messages, events }     one partner and its timeline (newest first)
//   POST { action }     → create | update | status | note
//
// 🔴 SERVER ONLY: the service role, behind verifyAdmin, as every outreach route. partner_orgs and partner_events have
// RLS on and no anon/authenticated grants (supabase/migrations/20261074_partners_1.sql).
// 🔴 EVERY STATUS CHANGE IS LOGGED in partner_events — `update` refuses a `status` key; `status` is its own action.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { dbDetail } from '@/lib/outreach-messages-table'
import { PARTNER_COLUMNS, validatePartnerPatch, statusChange, isPartnerStatus } from '@/lib/partners'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const refuse = (message: string, extra: Record<string, unknown> = {}) => NextResponse.json({ ok: false, refusal: message, ...extra })

/** A unique-index clash on the email, in words. */
const saveError = (e: { code?: string; message?: string } | null) =>
  e?.code === '23505' ? 'Another partner already has that email address.' : `That could not be saved (${dbDetail(e)}).`

const MESSAGE_COLS = 'id, direction, status, is_test, source, subject, from_address, to_address, message_date, created_at, sent_copy, attempts, last_error, text_body, attachments'

export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    const { data, error } = await supabase.from('partner_orgs').select(PARTNER_COLUMNS).order('name')
    if (error) return NextResponse.json({ ok: false, migrationApplied: false, refusal: dbDetail(error), partners: [] })
    return NextResponse.json({ ok: true, partners: data ?? [] })
  }
  const [{ data: partner, error: pErr }, { data: messages }, { data: events }] = await Promise.all([
    supabase.from('partner_orgs').select(PARTNER_COLUMNS).eq('id', id).maybeSingle(),
    supabase.from('outreach_messages').select(MESSAGE_COLS).eq('partner_id', id).order('message_date', { ascending: false, nullsFirst: false }),
    supabase.from('partner_events').select('id, kind, body, from_status, to_status, created_at').eq('partner_id', id).order('created_at', { ascending: false }),
  ])
  if (pErr || !partner) return refuse('That partner could not be read.')
  const msgs = ((messages ?? []) as { text_body?: string | null; attachments?: unknown }[]).map(({ text_body, attachments, ...m }) => ({
    ...m,
    preview: (text_body ?? '').replace(/\s+/g, ' ').trim().slice(0, 160) || null,
    has_body: !!text_body,
    attachment_count: Array.isArray(attachments) ? attachments.length : 0,
  }))
  return NextResponse.json({ ok: true, partner, messages: msgs, events: events ?? [] })
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad body' }, { status: 400 }) }
  const action = String(body.action ?? '')
  const now = new Date().toISOString()

  if (action === 'create') {
    const fields = (body.fields ?? {}) as Record<string, unknown>
    const v = validatePartnerPatch(fields, { creating: true })
    if (!v.ok) return refuse(v.error)
    // A new partner always starts at `to_contact` (the column default) — the status is never set from a form.
    const { data, error } = await supabase.from('partner_orgs').insert(v.patch).select(PARTNER_COLUMNS).single()
    if (error || !data) return refuse(saveError(error))
    return NextResponse.json({ ok: true, partner: data })
  }

  const id = String(body.id ?? '')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  if (action === 'update') {
    const v = validatePartnerPatch((body.fields ?? {}) as Record<string, unknown>)
    if (!v.ok) return refuse(v.error)
    if (!Object.keys(v.patch).length) return NextResponse.json({ ok: true, unchanged: true })
    const { data, error } = await supabase.from('partner_orgs').update({ ...v.patch, updated_at: now }).eq('id', id).select(PARTNER_COLUMNS).single()
    if (error || !data) return refuse(saveError(error))
    return NextResponse.json({ ok: true, partner: data })
  }

  if (action === 'status') {
    const { data: cur, error: cErr } = await supabase.from('partner_orgs').select('status').eq('id', id).maybeSingle()
    const from = (cur as { status?: unknown } | null)?.status
    if (cErr || !isPartnerStatus(from)) return refuse('That partner could not be read.')
    const sc = statusChange(from, body.status)
    if (!sc.ok) return refuse(sc.error)
    if (!sc.change) return NextResponse.json({ ok: true, unchanged: true })
    // 🔴 FILTERED ON THE OLD STATUS, so two tabs cannot both log a move from the same starting point.
    const { data, error } = await supabase.from('partner_orgs').update({ status: sc.change.to, updated_at: now })
      .eq('id', id).eq('status', from).select(PARTNER_COLUMNS)
    if (error) return refuse(saveError(error))
    if (!data || !data.length) return refuse('The status changed in the meantime — reload and try again.')
    const { error: eErr } = await supabase.from('partner_events').insert({ partner_id: id, ...sc.change.event })
    if (eErr) return refuse(`The status changed but the change could not be logged (${dbDetail(eErr)}).`)
    return NextResponse.json({ ok: true, partner: data[0] })
  }

  if (action === 'note') {
    const text = String(body.body ?? '').trim()
    if (!text) return refuse('Write the note first.')
    if (text.length > 5000) return refuse('A note is at most 5,000 characters.')
    const { data, error } = await supabase.from('partner_events').insert({ partner_id: id, kind: 'note', body: text })
      .select('id, kind, body, from_status, to_status, created_at').single()
    if (error || !data) return refuse(`The note could not be saved (${dbDetail(error)}).`)
    return NextResponse.json({ ok: true, event: data })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
