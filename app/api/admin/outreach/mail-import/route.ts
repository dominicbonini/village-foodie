// app/api/admin/outreach/mail-import/route.ts
// Read the mailbox and record every message that belongs to a prospect, so the app knows what has
// already been said before it sends anything new.
//
// 🔴 IT WRITES ONE TABLE AND READS THE REST. `outreach_messages` gains a row per message found; nothing
// is written to `outreach_contacts`, `outreach_prospects` or `discovery_trucks`. The ladder is
// Dominic's record of what he did, and an importer that edited it would be rewriting history from a
// mailbox that does not know what he meant.
//
// 🔴 RE-RUNNABLE. `message_id` is unique, so a second walk conflicts row by row instead of duplicating.
// Nothing is deleted and nothing is updated: an import is additive or it is a no-op.
//
// 🔴 EVERY MAILBOX IS READ-ONLY AND EVERY WALK CHECKS THE COUNT FIRST. Archive and Spam are empty, and
// `fetch('1:*')` on an empty mailbox throws — that produced the first diagnostic's two errors.
// `withReadOnlyMailbox` is the one helper that owns both rules.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { OUTREACH_IMPORT_MAILBOXES, OUTREACH_SENT_MAILBOX } from '@/lib/outreach-mail-config'
import { makeImapClient, withReadOnlyMailbox, sanitiseMailError } from '@/lib/outreach-mail-box'
import { addressesOf } from '@/lib/outreach-mail-format'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const MIGRATION_OFF = 'Email sending is off until the outreach_messages migration is applied.'

async function messagesTableReady(): Promise<boolean> {
  try {
    const { error } = await supabase.from('outreach_messages').select('id', { count: 'exact', head: true }).limit(1)
    if (!error) return true
    const code = (error as { code?: string }).code
    return !(code === 'PGRST205' || code === '42P01' || /schema cache|does not exist/i.test(error.message ?? ''))
  } catch { return false }
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })
  if (!(await messagesTableReady())) return NextResponse.json({ ok: false, migrationApplied: false, refusal: MIGRATION_OFF })

  const user = process.env.OUTREACH_MAIL_USER
  const pass = process.env.OUTREACH_MAIL_PASSWORD
  if (!user || !pass) return NextResponse.json({ ok: false, refusal: 'The mailbox credentials are not set on this environment.' })

  const errors: { step: string; error: string }[] = []
  const fail = (step: string, err: unknown) => { errors.push({ step, error: sanitiseMailError(err) }) }

  // ── WHO WE ARE LOOKING FOR ───────────────────────────────────────────────────────────────────────
  const { data: pRows, error: pErr } = await supabase
    .from('outreach_prospects')
    .select('id, discovery_trucks(name, contact_email)')
  if (pErr) return NextResponse.json({ ok: false, refusal: 'The prospect list could not be read.' })
  type P = { id: string; discovery_trucks: { name: string | null; contact_email: string | null } | null }
  const prospects = (pRows ?? []) as unknown as P[]
  /** address → prospect. Lower-cased on both sides; an address is a case-insensitive identifier. */
  const byAddress = new Map<string, { id: string; name: string | null }>()
  for (const p of prospects) {
    const e = (p.discovery_trucks?.contact_email ?? '').trim().toLowerCase()
    if (e) byAddress.set(e, { id: p.id, name: p.discovery_trucks?.name ?? null })
  }

  // The ladder, for the two mismatch lists. READ ONLY — nothing here writes to it.
  const { data: cRows } = await supabase
    .from('outreach_contacts').select('prospect_id, direction, channel').eq('channel', 'email')
  const emailedOut = new Set<string>()
  const loggedIn = new Set<string>()
  for (const c of (cRows ?? []) as { prospect_id: string; direction: string | null }[]) {
    if (c.direction === 'outbound') emailedOut.add(c.prospect_id)
    if (c.direction === 'inbound') loggedIn.add(c.prospect_id)
  }

  interface Found {
    prospect_id: string; direction: 'outbound' | 'inbound'
    message_id: string; in_reply_to: string | null; references: string | null
    subject: string | null; from_address: string | null; to_address: string | null
    message_date: string | null; mailbox: string; uid: number; uidvalidity: string | null
  }
  const found: Found[] = []
  const walked: { mailbox: string; count: number; skipped: boolean }[] = []

  const client = makeImapClient(user, pass)
  try {
    await client.connect()
    for (const path of OUTREACH_IMPORT_MAILBOXES) {
      try {
        const res = await withReadOnlyMailbox(client, path, async () => {
          const mb = client.mailbox
          const uidValidity = mb && typeof mb === 'object' && 'uidValidity' in mb ? String(mb.uidValidity) : null
          const rows: Found[] = []
          // 🔴 PEEK. `client.fetch` emits BODY.PEEK[…]; `headers` is the only body-ish thing asked for and
          // it reads no message text. References and In-Reply-To are NOT on the envelope, so the real
          // headers are the only honest source for a thread chain.
          for await (const msg of client.fetch('1:*', {
            uid: true, envelope: true, headers: ['references', 'in-reply-to'],
          })) {
            const env = msg.envelope
            const from = addressesOf(env?.from)
            const to = [...addressesOf(env?.to), ...addressesOf(env?.cc)]
            // 🔴 DIRECTION IS DECIDED BY WHICH SIDE THE PROSPECT IS ON, not by which folder it sits in.
            // A reply can be filed anywhere; an outbound copy can be dragged out of Sent.
            const outMatch = to.map(a => byAddress.get(a)).find(Boolean)
            const inMatch = from.map(a => byAddress.get(a)).find(Boolean)
            const hit = outMatch ?? inMatch
            if (!hit) continue
            const messageId = env?.messageId
            if (!messageId) continue    // without one there is nothing to make it idempotent on
            const raw = (msg.headers ?? Buffer.from('')).toString('utf8')
            const grab = (name: string): string | null => {
              const m = new RegExp(`^${name}:\\s*([\\s\\S]*?)(?=\\n\\S|$)`, 'im').exec(raw)
              return m ? m[1].replace(/\\s+/g, ' ').trim() || null : null
            }
            rows.push({
              prospect_id: hit.id,
              direction: outMatch ? 'outbound' : 'inbound',
              message_id: messageId,
              in_reply_to: env?.inReplyTo ?? grab('in-reply-to'),
              references: grab('references'),
              subject: env?.subject ?? null,
              from_address: from[0] ?? null,
              to_address: to[0] ?? null,
              message_date: env?.date ? new Date(env.date).toISOString() : null,
              mailbox: path,
              uid: msg.uid,
              uidvalidity: uidValidity,
            })
          }
          return rows
        })
        walked.push({ mailbox: path, count: res.count, skipped: res.skipped })
        if (!res.skipped) found.push(...res.value)
      } catch (err) { fail(`mailbox:${path}`, err) }
    }
  } catch (err) {
    fail('imap', err)
  } finally {
    try { await client.logout() } catch { /* already gone */ }
  }

  // ── WRITE — additive, one table, conflicts ignored ───────────────────────────────────────────────
  // ⚠️ `ignoreDuplicates` makes a re-run a no-op rather than an update: a row this app wrote when it SENT
  // a message must not be overwritten by the importer's thinner view of the same message.
  let inserted = 0
  if (found.length) {
    const payload = found.map(f => ({
      prospect_id: f.prospect_id,
      direction: f.direction,
      status: f.direction === 'inbound' ? 'received' : 'sent',
      is_test: false,
      source: 'mailbox_import',
      message_id: f.message_id,
      in_reply_to: f.in_reply_to,
      references: f.references,
      subject: f.subject,
      from_address: f.from_address,
      to_address: f.to_address,
      message_date: f.message_date,
      mailbox: f.mailbox,
      uid: f.uid,
      uidvalidity: f.uidvalidity ? Number(f.uidvalidity) : null,
      sent_copy: f.mailbox === OUTREACH_SENT_MAILBOX ? 'server_filed' : 'absent',
    }))
    // In chunks: one oversized statement is the thing that fails on a big mailbox.
    for (let i = 0; i < payload.length; i += 200) {
      const slice = payload.slice(i, i + 200)
      const { data, error } = await supabase
        .from('outreach_messages')
        .upsert(slice, { onConflict: 'message_id', ignoreDuplicates: true })
        .select('id')
      if (error) fail('insert', error)
      else inserted += (data ?? []).length
    }
  }

  // ── WHAT DOMINIC IS SHOWN, AND WHAT IT DELIBERATELY DOES NOT FIX ────────────────────────────────
  const perProspect = new Map<string, { name: string | null; outbound: number; inbound: number }>()
  for (const f of found) {
    const cur = perProspect.get(f.prospect_id) ?? { name: null, outbound: 0, inbound: 0 }
    if (f.direction === 'outbound') cur.outbound++; else cur.inbound++
    perProspect.set(f.prospect_id, cur)
  }
  for (const [addr, hit] of byAddress) { void addr; const c = perProspect.get(hit.id); if (c) c.name = hit.name }

  // (a) logged as emailed, but there is nothing to show for it.
  const loggedButUnmatched = prospects
    .filter(p => emailedOut.has(p.id))
    .map(p => {
      const email = (p.discovery_trucks?.contact_email ?? '').trim()
      const c = perProspect.get(p.id)
      if (!email) return { prospect_id: p.id, name: p.discovery_trucks?.name ?? null, reason: 'no email address on the truck row' }
      if (!c || c.outbound === 0) return { prospect_id: p.id, name: p.discovery_trucks?.name ?? null, reason: 'no matching message in Sent' }
      return null
    })
    .filter(Boolean)

  // (b) a reply is sitting in the mailbox and the ladder does not know about it.
  const repliesNotLogged = Array.from(perProspect.entries())
    .filter(([id, c]) => c.inbound > 0 && !loggedIn.has(id))
    .map(([id, c]) => ({ prospect_id: id, name: c.name, replies: c.inbound }))

  return NextResponse.json({
    ok: true, migrationApplied: true,
    walked, found: found.length, inserted,
    perProspect: Array.from(perProspect.entries()).map(([id, c]) => ({ prospect_id: id, ...c })),
    // ⚠️ REPORTED, NOT REPAIRED. Both lists are questions for Dominic: only he knows whether a missing
    // Sent message means the email never went, went from another account, or was filed somewhere else.
    mismatches: { loggedButUnmatched, repliesNotLogged },
    errors,
  })
}
