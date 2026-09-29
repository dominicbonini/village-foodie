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
import {
  makeImapClient, withReadOnlyMailbox, sanitiseMailError, structureOf, readWholeMessageLocked,
} from '@/lib/outreach-mail-box'
import { capHtml, bodyColumns, type StoredBodies } from '@/lib/outreach-mail-bodies'
import { addressesOf, headerBlockOf, headerValue } from '@/lib/outreach-mail-format'
import { resolveAccounts, pollSince, type MailAccount } from '@/lib/outreach-mail-accounts'
import { withinFirstLook } from '@/lib/outreach-mail-poll-rules'
import { messagesTableProbe, dbDetail } from '@/lib/outreach-messages-table'
import type {
  MailImportResult, ImportWalked, ImportPerProspect, ImportMismatch,
} from '@/lib/outreach-mail-import-result'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
// 🔴 THE PROBE IS SHARED, NOT COPIED. This route had its own `head: true` version — the one that read a
// missing table as present, because a HEAD response carries no error body — so the same wrong answer
// was wrong in two files and one fix would have left the other broken.

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })
  const probe = await messagesTableProbe(async () => {
    const { error } = await supabase.from('outreach_messages').select('id').limit(1)
    return { error }
  })
  if (!probe.ready) return NextResponse.json({ ok: false, migrationApplied: false, refusal: probe.refusal })

  // 🔴 EVERY CONFIGURED ACCOUNT. History lives in hello@ and new mail arrives at dominic@; an import
  // that walked only one of them would leave half the correspondence unrecorded.
  const accounts = resolveAccounts()
  if (!accounts.configured.length) return NextResponse.json({ ok: false, refusal: 'The mailbox credentials are not set on this environment.' })

  const errors: { step: string; error: string }[] = []
  /** Messages the importer deliberately did not touch, because reply pickup owns them. */
  let leftForPoll = 0
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
    account: MailAccount
    /** 🔴 STORED SO VIEW NEVER HAS TO OPEN THE MAILBOX AGAIN. `null` when this run did not read it. */
    bodies: StoredBodies | null
  }
  // 🔴 WHICH MESSAGES HAVE ALREADY BEEN LOOKED AT. `attachments` is an array once a message has been
  // read — `[]` when it has no attachments — so a non-null value means "we have its body, do not read
  // it again". Re-reading forty stored messages on every import would be pure cost.
  const { data: seenRows } = await supabase
    .from('outreach_messages').select('message_id').not('attachments', 'is', null).limit(5000)
  const bodiesKnown = new Set(((seenRows ?? []) as { message_id: string }[]).map(r => r.message_id))
  /** Per-run ceiling on body reads. The route's own budget is 60 seconds and a read is two round trips. */
  const MAX_BODY_READS = 40
  let bodyReads = 0

  const found: Found[] = []
  const walked: ImportWalked[] = []
  /** Messages actually READ, across every folder. `walked[].count` is what each folder HOLDS. */
  let read = 0

  for (const creds of accounts.configured) {
  // 🔴 THE SAME BOUNDARY THE POLL'S FIRST LOOK USES, from the same constant.
  const since = pollSince(creds.account)
  const client = makeImapClient(creds.user, creds.pass)
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
            uid: true, envelope: true, headers: ['references', 'in-reply-to'], internalDate: true,
          })) {
            read++
            // 🔴 THE IMPORTER IS HISTORY ONLY, AND IT WAS STEALING NEW MAIL FROM THE POLL.
            // On 29 September a Hotmail reply arrived at 20:57:07Z; the importer recorded it 27
            // seconds later as `mailbox_import` with no contact row, the poll then advanced its
            // watermark past it, found the `message_id` already recorded, skipped it — and the reply
            // was never logged. Two things read the same mailbox and only one of them logs contacts,
            // so the boundary between them has to be explicit. `POLL_SINCE` is that boundary, and it
            // is the same constant the poll's first look uses: before it is history, at or after it
            // belongs to reply pickup.
            // ⚠️ THE RACE STILL EXISTS FOR ANYTHING ALREADY RECORDED — see the poll's adoption pass,
            // which takes over the rows the importer grabbed before this rule existed.
            if (withinFirstLook(msg.internalDate, since)) { leftForPoll++; continue }
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
            // 🔴 `headerBlockOf`, NOT `msg.headers` BY HAND, AND NOT `bodyParts`. The shared helper
            // records where imapflow actually puts a header response; the diagnostic route read the
            // wrong map for a fortnight and reported `headers: []` the whole time.
            const raw = headerBlockOf(msg)
            const grab = (name: string) => headerValue(raw, name)
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
              account: creds.account,
              bodies: null,
            })
          }
          // 🔴 BODIES ARE READ AFTER THE WALK, NOT INSIDE IT. imapflow allows one command in flight and
          // the FETCH generator only lets the server continue once the consumer's `yield` returns, so a
          // body read issued inside the loop above would queue behind a FETCH that cannot finish until
          // it returns — a deadlock, not a slow path. The mailbox is still open here and nothing is in
          // flight.
          // ⚠️ ATTACHMENT CONTENTS ARE NEVER FETCHED: only the two text parts are named, and the
          // attachment list is metadata off the BODYSTRUCTURE the server already sent.
          for (const r of rows) {
            if (bodyReads >= MAX_BODY_READS) break
            if (bodiesKnown.has(r.message_id)) continue
            try {
              const struct = await structureOf(client, r.uid)
              if (!struct) continue
              const whole = await readWholeMessageLocked(client, r.uid, struct)
              const capped = capHtml(whole.html)
              r.bodies = { html: capped.html, text: whole.text, attachments: whole.attachments, truncated: capped.truncated }
              bodyReads++
            } catch (err) { fail(`bodies:${creds.account}/${path}:${r.uid}`, err) }
          }
          return rows
        })
        walked.push({ mailbox: `${creds.account}/${path}`, count: res.count, skipped: res.skipped })
        if (!res.skipped) found.push(...res.value)
      } catch (err) { fail(`mailbox:${creds.account}/${path}`, err) }
    }
  } catch (err) {
    fail(`imap:${creds.account}`, err)
  } finally {
    try { await client.logout() } catch { /* already gone */ }
  }
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
      // 🔴 THE ACCOUNT IT WAS READ FROM. Without it the uid above points at nothing.
      account: f.account,
      sent_copy: f.mailbox === OUTREACH_SENT_MAILBOX ? 'server_filed' : 'absent',
      // 🔴 WHAT THE EMAIL SAYS, WRITTEN DOWN. Absent only when this run did not read it — the poll's
      // backfill then fills it, 25 rows at a time.
      ...(f.bodies ? bodyColumns(f.bodies) : {}),
      // 🔴 IMPORTED MAIL IS HISTORY, SO IT IS ALREADY HANDLED. Everything this route records is now
      // strictly BEFORE the account's POLL_SINCE (see the guard in the walk), and the Today screen
      // shows unhandled inbound mail. Left null, one import would drop months of old replies into
      // the morning's work as if every one of them were waiting for an answer — which is exactly
      // what the CRM migration's one-off backfill had to undo for the rows already in the table.
      // ⚠️ OUTBOUND ROWS GET NOTHING: `handled_at` is a fact about an inbound message.
      ...(f.direction === 'inbound' ? { handled_at: new Date().toISOString() } : {}),
    }))
    // In chunks: one oversized statement is the thing that fails on a big mailbox.
    for (let i = 0; i < payload.length; i += 200) {
      const slice = payload.slice(i, i + 200)
      const { data, error } = await supabase
        .from('outreach_messages')
        .upsert(slice, { onConflict: 'message_id', ignoreDuplicates: true })
        .select('id')
      // 🔴 THE REASON TRAVELS WITH THE FAILURE, as it now does on the send. `fail('insert', error)`
      // recorded only a sanitised IMAP-shaped string; a PostgREST error has a code and a message that
      // name the table and the constraint, and without them a failed import is undiagnosable.
      if (error) fail('insert', { code: (error as { code?: string }).code, message: dbDetail(error) })
      else inserted += (data ?? []).length
    }
  }

  // ── BACKFILL — fill IN the thread headers that are missing, never OVER a value ──────────────────
  // 🔴 WHY A BACKFILL AND NOT A RE-IMPORT. `ignoreDuplicates` makes a second walk a no-op, by design:
  // it must not let the importer's thinner view overwrite a row this app wrote when it SENT a message.
  // But the first import ran while `headerBlockOf` was broken, so it recorded 37 rows with `in_reply_to`
  // and `"references"` NULL, and a no-op re-run can never repair them. This does.
  //
  // ⚠️ THREE CONDITIONS, AND EACH ONE IS A REFUSAL TO TOUCH SOMETHING:
  //   • `source = 'mailbox_import'` — a row this app SENT is never edited here. Its headers are what it
  //     actually put on the wire; the mailbox's copy is at best the same and at worst a rewrite.
  //   • only where the column IS NULL — a stored value always wins, so this cannot rewrite a thread.
  //   • only when the mailbox has something to put there — a null stays null rather than becoming ''.
  // Re-running remains safe: once filled, the rows no longer match, so a second run updates 0.
  let updated = 0
  if (found.length) {
    const byId = new Map(found.map(f => [f.message_id, f]))
    const { data: gaps, error: gapErr } = await supabase
      .from('outreach_messages')
      .select('id, message_id, in_reply_to, "references"')
      .eq('source', 'mailbox_import')
      .in('message_id', Array.from(byId.keys()).slice(0, 1000))
      .or('in_reply_to.is.null,references.is.null')
    if (gapErr) fail('backfill-read', { code: (gapErr as { code?: string }).code, message: dbDetail(gapErr) })
    for (const g of (gaps ?? []) as { id: string; message_id: string; in_reply_to: string | null; references: string | null }[]) {
      const f = byId.get(g.message_id)
      if (!f) continue
      const patch: Record<string, string> = {}
      if (g.in_reply_to == null && f.in_reply_to) patch.in_reply_to = f.in_reply_to
      if (g.references == null && f.references) patch.references = f.references
      if (!Object.keys(patch).length) continue
      const { error: upErr } = await supabase.from('outreach_messages')
        .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', g.id)
      if (upErr) fail('backfill-write', { code: (upErr as { code?: string }).code, message: dbDetail(upErr) })
      else updated++
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

  // (a) logged as emailed, but there is nothing to show for it. NAMED, not counted.
  const loggedButUnmatched: ImportMismatch[] = prospects
    .filter(p => emailedOut.has(p.id))
    .map(p => {
      const email = (p.discovery_trucks?.contact_email ?? '').trim()
      const c = perProspect.get(p.id)
      const name = p.discovery_trucks?.name ?? null
      if (!email) return { prospect_id: p.id, name, reason: 'no email address on the truck row' }
      if (!c || c.outbound === 0) return { prospect_id: p.id, name, reason: 'no matching message in the mailbox' }
      return null
    })
    .filter((m): m is ImportMismatch => m !== null)
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))

  // (b) a reply is sitting in the mailbox and the ladder does not know about it.
  const repliesNotLogged: ImportMismatch[] = Array.from(perProspect.entries())
    .filter(([id, c]) => c.inbound > 0 && !loggedIn.has(id))
    .map(([id, c]) => ({
      prospect_id: id, name: c.name, replies: c.inbound,
      reason: `${c.inbound} repl${c.inbound === 1 ? 'y' : 'ies'} in the mailbox, none logged`,
    }))
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))

  const perProspectOut: ImportPerProspect[] =
    Array.from(perProspect.entries()).map(([id, c]) => ({ prospect_id: id, ...c }))

  // 🔴 THE RETURN IS TYPED, and that is the fix for the NaNs. `MailImportResult` is the one declaration
  // of these field names; the panel imports the same type and reads no name it has invented.
  const result: MailImportResult = {
    ok: true, migrationApplied: true,
    read, walked, matched: found.length, recorded: inserted, updated, leftForPoll,
    bodiesStored: bodyReads,
    perProspect: perProspectOut,
    // ⚠️ REPORTED, NOT REPAIRED. Both lists are questions for Dominic: only he knows whether a missing
    // Sent message means the email never went, went from another account, or was filed somewhere else.
    mismatches: { loggedButUnmatched, repliesNotLogged },
    errors,
  }
  return NextResponse.json(result)
}
