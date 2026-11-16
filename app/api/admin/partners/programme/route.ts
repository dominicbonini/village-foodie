// app/api/admin/partners/programme/route.ts — partners-2 (16 November 2026, docs/partners-2-report.md): the partner
// programme behind Admin › Partners — codes, the send queue, approval, the commission ledger, opt-outs and the CSV import.
//
//   GET ?view=overview            → { codes, uses, queue (today), lastSent, rules, schedule, sentToday }
//   GET ?view=queue               → today's plan (computed, not written) with each email's template and preview
//   GET ?view=ledger&partner_id=  → the partner's codes, referred trucks and month-by-month ledger
//   POST { action }               → code_save | plan_today | approve_today | set_approval | mark_paid | stop | import_csv
//
// 🔴 SERVER ONLY, behind verifyAdmin — every table here is service role only. Nothing here sends an email: the queue is only
// planned and approved; the scheduled sender (app/api/cron/partner-sends) is the only thing that sends, and only approved rows
// while approval mode is on.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { dbDetail } from '@/lib/outreach-messages-table'
import { planQueue, approveToday, readSchedule, readCountryRules, sentToday, stopSequence, templateSlugFor } from '@/lib/partner-programme'
import { partnerLedger } from '@/lib/partner-commission'
import { normaliseCode, DEAL_TYPES } from '@/lib/partner-codes'
import { offersFor, planNamer } from '@/lib/partner-codes-server'
import { readPlanCatalog } from '@/lib/plans-server'
import { renderPartnerText, withPostalAddress, offerValues } from '@/lib/partner-template'
import { planBulkAdd, PARTNER_COLUMNS } from '@/lib/partners'
import { SENDER_ZONE } from '@/lib/partner-send-schedule'
import { localDateOfInstant } from '@/lib/time-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const refuse = (message: string) => NextResponse.json({ ok: false, refusal: message })
const CODE_COLS = 'id, code, partner_id, deal_type, deal_value, deal_months, deal_plan_key, deal_currency, valid_until, max_uses, active, pct_year1, pct_year2, basis, notes, created_at'

export async function GET(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })
  const view = req.nextUrl.searchParams.get('view') ?? 'overview'
  const now = new Date()
  try {
    if (view === 'ledger') {
      const id = req.nextUrl.searchParams.get('partner_id') ?? ''
      if (!id) return refuse('partner_id required')
      return NextResponse.json({ ok: true, ledger: await partnerLedger(supabase, id) })
    }
    if (view === 'queue') {
      const plan = await planQueue(supabase, now)
      const { data: stored } = await supabase.from('outreach_send_queue').select('id, partner_id, step, scheduled_at, status, skip_reason')
        .eq('send_day', plan.sendDay)
      const ids = [...new Set([...plan.planned.map(p => p.partnerId), ...((stored ?? []) as { partner_id: string }[]).map(s => s.partner_id)])]
      const [{ data: partners }, offers, { data: postal }] = await Promise.all([
        ids.length ? supabase.from('partner_orgs').select('id, name, type, language, country_code, contact_name, email, timezone').in('id', ids) : Promise.resolve({ data: [] }),
        offersFor(supabase, now, ids),
        supabase.from('outreach_settings').select('value').eq('key', 'postal_address').maybeSingle(),
      ])
      const slugs = plan.planned.map(p => templateSlugFor((partners ?? []).find(x => x.id === p.partnerId) as { type: string; language: string | null }, p.step))
      const { data: templates } = slugs.length ? await supabase.from('outreach_templates').select('slug, subject, body, active').in('slug', slugs) : { data: [] }
      const namers: Record<string, (key: string) => string> = {}
      for (const l of new Set(((partners ?? []) as { language: string | null }[]).map(x => x.language || 'en'))) namers[l] = await planNamer(supabase, l)
      const items = plan.planned.map((p, i) => {
        const partner = (partners ?? []).find(x => x.id === p.partnerId) as Record<string, string | null>
        const code = offers.get(p.partnerId)
        const tpl = ((templates ?? []) as { slug: string; subject: string | null; body: string; active: boolean }[]).find(t => t.slug === slugs[i] && t.active)
        let preview: { subject: string; body: string } | null = null, problem: string | null = null
        if (!tpl) problem = `No approved template yet (${slugs[i]})`
        else if (!code) problem = 'No active code for this partner'
        else {
          const values = { contact_name: partner?.contact_name ?? undefined, org: partner?.name ?? undefined,
            ...offerValues(code, partner?.language, partner?.country_code, namers[partner?.language || 'en'] ?? (k => k)) }
          const s = renderPartnerText(tpl.subject ?? '', values)
          const b = renderPartnerText(withPostalAddress(tpl.body, (postal?.value as { text?: string } | null)?.text ?? null, partner?.country_code ?? null), values)
          if (s.ok && b.ok) preview = { subject: s.text, body: b.text }
          else problem = `Missing: ${[...(s.ok ? [] : s.missing), ...(b.ok ? [] : b.missing)].join(', ')}`
        }
        const stored1 = ((stored ?? []) as { partner_id: string; step: string; status: string }[]).find(s => s.partner_id === p.partnerId && s.step === p.step)
        return { ...p, template: slugs[i], preview, problem, status: stored1?.status ?? 'not_saved', timezone: partner?.timezone ?? null }
      })
      return NextResponse.json({ ok: true, plan: { ...plan, planned: items }, stored: stored ?? [] })
    }
    // overview
    const day = localDateOfInstant(now, SENDER_ZONE)
    const [{ data: codes, error: cErr }, { data: reds }, { data: queue }, { data: last }, rules, schedule, sent] = await Promise.all([
      supabase.from('partner_codes').select(CODE_COLS).order('created_at'),
      supabase.from('partner_code_redemptions').select('code_id'),
      supabase.from('outreach_send_queue').select('partner_id, step, scheduled_at, status').in('status', ['planned', 'approved']).gte('send_day', day),
      supabase.from('outreach_messages').select('partner_id, message_date').not('partner_id', 'is', null).eq('is_test', false)
        .order('message_date', { ascending: false }).limit(2000),
      readCountryRules(supabase), readSchedule(supabase), sentToday(supabase, now),
    ])
    if (cErr) return refuse(`The codes could not be read (${dbDetail(cErr)}).`)
    const uses: Record<string, number> = {}
    for (const r of (reds ?? []) as { code_id: string }[]) uses[r.code_id] = (uses[r.code_id] ?? 0) + 1
    const lastSent: Record<string, string> = {}
    for (const m of (last ?? []) as { partner_id: string; message_date: string }[]) if (!lastSent[m.partner_id]) lastSent[m.partner_id] = m.message_date
    // partners offer: the plans a percent-off / fixed-price code may name (active, public, not a trial), for the drawer's code form.
    const catalog = await readPlanCatalog(supabase as unknown as Parameters<typeof readPlanCatalog>[0])
    const paidPlans = catalog.plans.filter(p => p.active && p.isPublic && !p.isTrial).sort((a, b) => a.sortOrder - b.sortOrder).map(p => ({ key: p.key, name: p.name }))
    return NextResponse.json({ ok: true, codes: codes ?? [], uses, queue: queue ?? [], lastSent, rules, schedule, sentToday: sent.count, today: day, paidPlans })
  } catch (e) {
    return refuse(e instanceof Error ? e.message : String(e))
  }
}

/**
 * A code's fields, checked. Returns the row to write or an error in words. 🔴 partners offer (16 November 2026): NOTHING HAS A
 * DEFAULT — the deal, its length, its plan and the commission for year 1 and year 2 must each be given (0 is a choice, empty is not).
 * `paidPlans` are the plan keys a percent-off / fixed-price deal may name (active, public, not a trial).
 */
function codePatch(f: Record<string, unknown>, paidPlans: string[]): { ok: true; row: Record<string, unknown> } | { ok: false; error: string } {
  const code = normaliseCode(f.code)
  if (!/^[A-Z0-9-]{3,40}$/.test(code)) return { ok: false, error: 'A code is 3–40 letters, numbers or dashes.' }
  if (typeof f.partner_id !== 'string' || !f.partner_id) return { ok: false, error: 'Choose the partner.' }
  if (!(DEAL_TYPES as readonly string[]).includes(String(f.deal_type))) return { ok: false, error: 'Choose the deal.' }
  const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === ''
  const value = Number(f.deal_value), months = blank(f.deal_months) ? null : Number(f.deal_months)
  if (!Number.isInteger(value) || value <= 0) return { ok: false, error: 'The deal needs a whole number.' }
  const plan = blank(f.deal_plan_key) || f.deal_plan_key === 'any' ? null : String(f.deal_plan_key)
  const currency = blank(f.deal_currency) ? null : String(f.deal_currency).toUpperCase()
  if (f.deal_type === 'extra_trial_months' && value > 24) return { ok: false, error: 'At most 24 extra months.' }
  if (f.deal_type !== 'extra_trial_months' && (!months || !Number.isInteger(months) || months <= 0 || months > 60)) return { ok: false, error: 'Say for how many months (1–60) the price lasts.' }
  if (plan && !paidPlans.includes(plan)) return { ok: false, error: `${plan} is not an active paid plan.` }
  if (f.deal_type === 'percent_off' && value > 100) return { ok: false, error: 'A percentage off is 1–100%.' }
  if (f.deal_type === 'fixed_price' && !plan) return { ok: false, error: 'A fixed monthly price needs its plan.' }
  if (f.deal_type === 'fixed_price' && !/^[A-Z]{3}$/.test(currency ?? '')) return { ok: false, error: 'A fixed monthly price needs its currency.' }
  const until = String(f.valid_until ?? '').trim()
  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) return { ok: false, error: 'Valid until is a date (YYYY-MM-DD).' }
  const maxUses = blank(f.max_uses) ? null : Number(f.max_uses)
  if (maxUses !== null && (!Number.isInteger(maxUses) || maxUses <= 0)) return { ok: false, error: 'Max uses is a whole number, or empty for no limit.' }
  if (blank(f.pct_year1) || blank(f.pct_year2)) return { ok: false, error: 'Set the commission for year 1 and year 2 (0 is allowed).' }
  const p1 = Number(f.pct_year1), p2 = Number(f.pct_year2)
  if (!(p1 >= 0 && p1 <= 100 && p2 >= 0 && p2 <= 100)) return { ok: false, error: 'Commission is 0–100%.' }
  const isTrialDeal = f.deal_type === 'extra_trial_months'
  return { ok: true, row: { code, partner_id: f.partner_id, deal_type: f.deal_type, deal_value: value,
    deal_months: isTrialDeal ? null : months, deal_plan_key: isTrialDeal ? null : plan, deal_currency: f.deal_type === 'fixed_price' ? currency : null,
    valid_until: until || null, max_uses: maxUses,
    active: f.active !== false, pct_year1: p1, pct_year2: p2, notes: typeof f.notes === 'string' ? f.notes.slice(0, 2000) : null } }
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad body' }, { status: 400 }) }
  const action = String(body.action ?? '')
  const now = new Date()
  try {
    if (action === 'code_save') {
      const catalog = await readPlanCatalog(supabase as unknown as Parameters<typeof readPlanCatalog>[0])
      const v = codePatch((body.fields ?? {}) as Record<string, unknown>, catalog.plans.filter(p => p.active && p.isPublic && !p.isTrial).map(p => p.key))
      if (!v.ok) return refuse(v.error)
      const id = typeof body.id === 'string' ? body.id : null
      const q = id ? supabase.from('partner_codes').update({ ...v.row, updated_at: now.toISOString() }).eq('id', id) : supabase.from('partner_codes').insert(v.row)
      const { data, error } = await q.select(CODE_COLS).single()
      if (error) return refuse(error.code === '23505' ? 'That code is already taken.' : `The code could not be saved (${dbDetail(error)}).`)
      return NextResponse.json({ ok: true, code: data })
    }
    if (action === 'plan_today') return NextResponse.json({ ok: true, plan: await planQueue(supabase, now, { write: true }) })
    if (action === 'approve_today') return NextResponse.json({ ok: true, approved: await approveToday(supabase, now) })
    if (action === 'set_approval') {
      const { data } = await supabase.from('outreach_settings').select('value').eq('key', 'send_schedule').maybeSingle()
      const value = { ...((data?.value ?? {}) as Record<string, unknown>), approval_mode: body.on !== false }
      const { error } = await supabase.from('outreach_settings').upsert({ key: 'send_schedule', value, updated_at: now.toISOString() })
      if (error) return refuse(`The setting could not be saved (${dbDetail(error)}).`)
      return NextResponse.json({ ok: true, approvalMode: value.approval_mode })
    }
    if (action === 'mark_paid') {
      const month = String(body.month ?? ''), currency = String(body.currency ?? '').toUpperCase(), paidOn = String(body.paid_on ?? ''), reference = String(body.reference ?? '').trim()
      const amount = Number(body.amount_minor)
      if (!/^\d{4}-\d{2}$/.test(month) || !/^[A-Z]{3}$/.test(currency) || !/^\d{4}-\d{2}-\d{2}$/.test(paidOn) || !reference || !Number.isInteger(amount) || amount <= 0)
        return refuse('Mark paid needs the month, the currency, a positive amount, the date paid and a reference.')
      const { error } = await supabase.from('partner_commission_payments').insert({
        partner_id: String(body.partner_id ?? ''), month: `${month}-01`, currency, amount_minor: amount, paid_on: paidOn, reference })
      if (error) return refuse(`The payment could not be recorded (${dbDetail(error)}).`)
      return NextResponse.json({ ok: true })
    }
    if (action === 'stop') {
      const why = body.why === 'opt_out' ? 'opt_out' : 'manual'
      await stopSequence(supabase, String(body.partner_id ?? ''), why)
      return NextResponse.json({ ok: true })
    }
    if (action === 'import_csv') {
      const incoming = Array.isArray(body.rows) ? (body.rows as Record<string, unknown>[]).slice(0, 500) : []
      const { data: existing, error } = await supabase.from('partner_orgs').select('name, country_code, email')
      if (error) return refuse(`The partner list could not be read (${dbDetail(error)}).`)
      const plan = planBulkAdd((existing ?? []) as { name: string; country_code: string | null; email: string | null }[],
        incoming.map(r => ({ ...r, source: r.source ?? 'csv import' })))
      if (body.dry_run === true || !plan.add.length) return NextResponse.json({ ok: true, ...plan, inserted: 0 })
      // A CSV row is unverified until it is checked (only ✓ rows are ever sent automatically).
      const { data: ins, error: iErr } = await supabase.from('partner_orgs').insert(plan.add.map(r => ({ ...r, verify_status: 'unverified' }))).select(PARTNER_COLUMNS)
      if (iErr) return refuse(`The rows could not be added (${dbDetail(iErr)}).`)
      return NextResponse.json({ ok: true, ...plan, inserted: (ins ?? []).length })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    return refuse(e instanceof Error ? e.message : String(e))
  }
}
