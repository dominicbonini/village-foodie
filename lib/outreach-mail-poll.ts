// lib/outreach-mail-poll.ts — the reply poll: one routine, two triggers, and no writes to the mailbox.
//
// 🔴 READ-ONLY, AND THAT IS A PROPERTY OF THE CODE RATHER THAN AN INTENTION. Every mailbox is opened
// through `withReadOnlyMailbox`, which issues EXAMINE — the server itself then refuses a flag change —
// and every fetch emits `BODY.PEEK[…]`, so reading a reply does not mark it read in Outlook. There is
// no `messageFlagsAdd`, `messageMove`, `messageCopy`, `messageDelete` or `expunge` call anywhere in
// this file, and the harness runs a source census that fails if one appears.
// ⚠️ THE ONE MAILBOX WRITE IN THE WHOLE FEATURE is `appendToSent`, in `lib/outreach-mail-deliver.ts`,
// which only ever ADDS a copy of a message this app has just sent.
//
// 🔴 IT NEVER COMPOSES AN EMAIL. The only send it can cause is a retry of a row Dominic already sent,
// with the same stored bytes and the same Message-ID — see `shouldAutoRetry` for how narrow that is.
//
// 🔴 UNMATCHED MAIL IS NOT STORED, LOGGED OR NAMED. `hello@hatchgrab.com` receives order and support
// mail; most of what this reads is nothing to do with outreach. It is counted and forgotten.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ImapFlow } from 'imapflow'
import { OUTREACH_SENT_MAILBOX } from '@/lib/outreach-mail-config'
import {
  makeImapClient, withReadOnlyMailbox, mailboxCount, decodePart, sanitiseMailError,
} from '@/lib/outreach-mail-box'
import { findPart, headerBlockOf, headerValue, addressesOf } from '@/lib/outreach-mail-format'
import { logOutreachContact } from '@/lib/outreach-contact-log'
import { deliver, fileSentCopy, type DeliverRow } from '@/lib/outreach-mail-deliver'
import { composeRaw } from '@/lib/outreach-mail-envelope'
import { readFromName } from '@/lib/outreach-settings-read'
import { dbDetail } from '@/lib/outreach-messages-table'
import {
  planFetch, advanceWatermark, lockIsHeld, classifyIncoming, matchIncoming, matchOutgoing,
  bouncedOriginalId, stripQuotedHistory, isStuckSending, shouldAutoRetry, isOwnAddress,
  type PollState, type IncomingHeaders,
} from '@/lib/outreach-mail-poll-rules'

/** The mailboxes walked for incoming mail, and the one walked for Dominic's own Outlook-sent mail. */
export const INCOMING_MAILBOXES = ['INBOX', 'Spam', 'Archive'] as const
export const POLL_MAILBOXES = [...INCOMING_MAILBOXES, OUTREACH_SENT_MAILBOX] as const

const STATE_KEY = 'mail_poll_state'
const LOCK_KEY = 'mail_poll_lock'
/** A hard ceiling per mailbox per run, so one enormous backlog cannot run past the function timeout. */
const MAX_PER_MAILBOX = 200

export interface PollSummary {
  ok: boolean
  /** Set when the run did nothing because another run held the lock. */
  skipped?: string
  repliesLogged: number
  autoReplies: number
  bounces: number
  outlookSentRecorded: number
  retried: number
  markedUncertain: number
  copiesFiled: number
  ambiguous: number
  unmatched: number
  /** Mailboxes whose uidvalidity changed and were re-scanned. Reported, because it explains a spike. */
  rescanned: string[]
  /** Mailboxes seen for the first time; their history was deliberately skipped. */
  baselined: string[]
  errors: { step: string; error: string }[]
}

const emptySummary = (): PollSummary => ({
  ok: true, repliesLogged: 0, autoReplies: 0, bounces: 0, outlookSentRecorded: 0,
  retried: 0, markedUncertain: 0, copiesFiled: 0, ambiguous: 0, unmatched: 0,
  rescanned: [], baselined: [], errors: [],
})

// ── SETTINGS: the watermark and the lock ────────────────────────────────────────────────────────────
async function readSetting(supabase: SupabaseClient, key: string): Promise<unknown> {
  const { data } = await supabase.from('outreach_settings').select('value').eq('key', key).maybeSingle()
  return (data as { value?: unknown } | null)?.value ?? null
}
async function writeSetting(supabase: SupabaseClient, key: string, value: unknown): Promise<void> {
  await supabase.from('outreach_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

/**
 * 🔴 TAKE THE LOCK, OR DO NOTHING. The cron runs every ten minutes and the button can be pressed at
 * any moment; two runs reading the same new reply would each insert a message row — unique on
 * `message_id`, so the second fails — but the CONTACT LOG has no such constraint, and the reply would
 * be logged twice. One reply, two rungs, and a ladder that cannot be read.
 * ⚠️ IT EXPIRES. A container frozen mid-poll never releases its lock, and a lock only a healthy run
 * can clear is a lock that turns one bad invocation into a permanent outage of the feature.
 */
async function takeLock(supabase: SupabaseClient, now: Date): Promise<boolean> {
  const held = await readSetting(supabase, LOCK_KEY)
  const takenAt = (held as { takenAt?: string } | null)?.takenAt ?? null
  if (lockIsHeld(takenAt, now)) return false
  await writeSetting(supabase, LOCK_KEY, { takenAt: now.toISOString() })
  return true
}
async function releaseLock(supabase: SupabaseClient): Promise<void> {
  try { await writeSetting(supabase, LOCK_KEY, { takenAt: null }) } catch { /* the stale check covers it */ }
}

// ── WHO IS WHO ──────────────────────────────────────────────────────────────────────────────────────
interface Directory {
  /** contact_email (lower-case) → prospect ids. More than one ⇒ ambiguous, never guessed. */
  byAddress: Map<string, string[]>
  /** Our own Message-IDs → prospect id. The certain match. */
  byMessageId: Map<string, string>
  /** Prospects linked to a HatchGrab truck. 🔴 Never auto-logged — see `loadDirectory`. */
  skip: Set<string>
  /** Prospects that already have an inbound reply row. Gates Outlook-sent logging. */
  hasReply: Set<string>
}

async function loadDirectory(supabase: SupabaseClient): Promise<Directory> {
  const byAddress = new Map<string, string[]>()
  const skip = new Set<string>()
  const { data: pRows } = await supabase
    .from('outreach_prospects')
    .select('id, discovery_trucks(contact_email, hatchgrab_truck_id)')
  type P = { id: string; discovery_trucks: { contact_email: string | null; hatchgrab_truck_id: string | null } | null }
  for (const row of (pRows ?? []) as unknown as P[]) {
    // 🔴 A LINKED HATCHGRAB TRUCK IS NOT A PROSPECT. It is a customer, a demo or the test truck, and
    // the send route already refuses to email one. Auto-logging its mail would put outreach contacts
    // and a `replied` stage on a row that is not in the outreach process at all.
    if (row.discovery_trucks?.hatchgrab_truck_id) { skip.add(row.id); continue }
    const e = (row.discovery_trucks?.contact_email ?? '').trim().toLowerCase()
    if (!e) continue
    byAddress.set(e, [...(byAddress.get(e) ?? []), row.id])
  }
  const byMessageId = new Map<string, string>()
  const hasReply = new Set<string>()
  const { data: mRows } = await supabase
    .from('outreach_messages').select('message_id, prospect_id, direction, status')
  for (const m of (mRows ?? []) as { message_id: string; prospect_id: string; direction: string; status: string }[]) {
    byMessageId.set(m.message_id, m.prospect_id)
    if (m.direction === 'inbound' && m.status === 'received') hasReply.add(m.prospect_id)
  }
  return { byAddress, byMessageId, skip, hasReply }
}

// ── READING ONE MESSAGE ─────────────────────────────────────────────────────────────────────────────
interface SeenMessage {
  uid: number
  messageId: string | null
  raw: string
  subject: string | null
  from: string[]
  to: string[]
  date: string | null
}

/** A header reader over the raw block, as the rules expect it. */
function headersOf(raw: string, subject: string | null, from: string | null): IncomingHeaders {
  return {
    get: (name: string) => headerValue(raw, name),
    subject,
    fromAddress: from,
    contentType: headerValue(raw, 'content-type'),
  }
}

/**
 * Walk one mailbox, newest work last, and hand each message to `onMessage`.
 * ⚠️ `withReadOnlyMailbox` CHECKS THE COUNT FIRST. Archive and Spam are empty today, and `fetch` on an
 * empty mailbox throws "Command failed" — that is what produced the first diagnostics run's two errors.
 */
async function walkMailbox(
  client: ImapFlow, path: string, state: PollState, summary: PollSummary,
  onMessage: (m: SeenMessage) => Promise<void>,
): Promise<void> {
  const res = await withReadOnlyMailbox(client, path, async () => {
    const mb = client.mailbox
    const uidvalidity = mb && typeof mb === 'object' && 'uidValidity' in mb ? String(mb.uidValidity) : '0'
    const highestUid = mb && typeof mb === 'object' && 'uidNext' in mb ? Math.max(0, Number(mb.uidNext) - 1) : 0
    const plan = planFetch(state[path], { uidvalidity, highestUid })
    if (plan.mode === 'baseline') {
      // 🔴 NOTHING OLD IS PROCESSED, EVER. See `planFetch`.
      state[path] = { uidvalidity, lastUid: plan.lastUid }
      summary.baselined.push(path)
      return
    }
    if (plan.mode === 'none') { state[path] = { uidvalidity, lastUid: highestUid }; return }
    if (plan.mode === 'rescan') summary.rescanned.push(path)

    const query = plan.mode === 'rescan'
      ? { since: new Date(Date.now() - plan.sinceDays * 86_400_000) }
      : `${plan.from}:*`
    const seenUids: number[] = []
    let n = 0
    for await (const msg of client.fetch(query as never, {
      uid: true, envelope: true, headers: true,
    }, { uid: plan.mode !== 'rescan' })) {
      if (n++ >= MAX_PER_MAILBOX) break
      seenUids.push(msg.uid)
      const env = msg.envelope
      await onMessage({
        uid: msg.uid,
        messageId: env?.messageId ?? null,
        raw: headerBlockOf(msg),
        subject: env?.subject ?? null,
        from: addressesOf(env?.from),
        to: [...addressesOf(env?.to), ...addressesOf(env?.cc)],
        date: env?.date ? new Date(env.date).toISOString() : null,
      })
    }
    state[path] = advanceWatermark(state[path], { uidvalidity, highestUid }, seenUids)
  })
  if (res.skipped) {
    // An empty mailbox is a state, not a failure — but its watermark still has to exist.
    const c = await mailboxCount(client, path)
    if (c === 0 && !state[path]) summary.baselined.push(path)
  }
}

/** The text body of a message, read by uid, READ-ONLY. Only used for a matched reply. */
async function readText(client: ImapFlow, path: string, uid: number): Promise<string | null> {
  try {
    const msg = await client.fetchOne(String(uid), { uid: true, bodyStructure: true }, { uid: true })
    if (!msg || typeof msg !== 'object' || !('bodyStructure' in msg)) return null
    const struct = (msg as { bodyStructure?: unknown }).bodyStructure
    if (!struct) return null
    const plain = findPart(struct as Parameters<typeof findPart>[0], 'text/plain')
    if (!plain) return null
    const full = await client.fetchOne(String(uid), { uid: true, bodyParts: [plain.part] }, { uid: true })
    const bp = (full && typeof full === 'object' && 'bodyParts' in full
      ? (full as { bodyParts?: Map<string, Buffer> }).bodyParts
      : undefined) ?? new Map<string, Buffer>()
    return decodePart(bp, plain.part, plain.encoding ?? null, plain.charset ?? null)
  } catch { return null }
}

/** The returned original inside a delivery report, for `bouncedOriginalId`. */
async function readReturnedPart(client: ImapFlow, uid: number): Promise<string | null> {
  try {
    const msg = await client.fetchOne(String(uid), { uid: true, bodyStructure: true }, { uid: true })
    const struct = (msg as { bodyStructure?: unknown } | null)?.bodyStructure
    if (!struct) return null
    const part = findPart(struct as Parameters<typeof findPart>[0], 'message/rfc822')
      ?? findPart(struct as Parameters<typeof findPart>[0], 'text/rfc822-headers')
    if (!part) return null
    const full = await client.fetchOne(String(uid), { uid: true, bodyParts: [part.part] }, { uid: true })
    const bp = (full && typeof full === 'object' && 'bodyParts' in full
      ? (full as { bodyParts?: Map<string, Buffer> }).bodyParts
      : undefined) ?? new Map<string, Buffer>()
    return decodePart(bp, part.part, part.encoding ?? null, part.charset ?? null)
  } catch { return null }
}

// ── THE RUN ─────────────────────────────────────────────────────────────────────────────────────────
export async function runReplyPoll(supabase: SupabaseClient): Promise<PollSummary> {
  const summary = emptySummary()
  const now = new Date()
  const fail = (step: string, err: unknown) => { summary.errors.push({ step, error: sanitiseMailError(err) }) }

  const user = process.env.OUTREACH_MAIL_USER
  const pass = process.env.OUTREACH_MAIL_PASSWORD
  if (!user || !pass) return { ...summary, ok: false, skipped: 'The mailbox credentials are not set on this environment.' }

  if (!(await takeLock(supabase, now))) {
    return { ...summary, ok: true, skipped: 'Another check is already running — nothing was done.' }
  }

  try {
    const dir = await loadDirectory(supabase)
    const state = ((await readSetting(supabase, STATE_KEY)) ?? {}) as PollState

    const client = makeImapClient(user, pass)
    try {
      await client.connect()

      // ── INCOMING ────────────────────────────────────────────────────────────────────────────────
      for (const path of INCOMING_MAILBOXES) {
        try {
          await walkMailbox(client, path, state, summary, async m => {
            if (!m.messageId) return                       // nothing to be idempotent on
            if (m.from.some(isOwnAddress)) return          // our own mail is not a reply to us
            const h = headersOf(m.raw, m.subject, m.from[0] ?? null)
            const match = matchIncoming({ get: h.get, fromAddress: h.fromAddress }, dir.byMessageId, dir.byAddress)
            if (match.kind === 'ambiguous') { summary.ambiguous++; return }
            if (match.kind === 'none') { summary.unmatched++; return }
            if (dir.skip.has(match.prospectId)) return     // a linked HatchGrab truck: never auto-logged
            // 🔴 IDEMPOTENT ON message_id. A message the importer already recorded is skipped here and
            // never logged a second time; so is one this poll saw on a previous run.
            if (dir.byMessageId.has(m.messageId)) return

            const kind = classifyIncoming(h)
            if (kind === 'bounce') { await handleBounce(supabase, client, dir, m, h, path, summary); return }
            if (kind === 'auto_reply') { await handleAutoReply(supabase, dir, m, path, match.prospectId, summary); return }
            await handleReply(supabase, client, dir, m, path, match.prospectId, summary)
          })
        } catch (err) { fail(`mailbox:${path}`, err) }
      }

      // ── OUTLOOK-SENT MAIL ───────────────────────────────────────────────────────────────────────
      try {
        await walkMailbox(client, OUTREACH_SENT_MAILBOX, state, summary, async m => {
          if (!m.messageId) return
          if (dir.byMessageId.has(m.messageId)) return     // a system send already has its row
          const match = matchOutgoing(m.to, dir.byAddress)
          if (match.kind === 'ambiguous') { summary.ambiguous++; return }
          if (match.kind === 'none') { summary.unmatched++; return }
          if (dir.skip.has(match.prospectId)) return
          await handleOutlookSent(supabase, dir, m, match.prospectId, summary)
        })
      } catch (err) { fail(`mailbox:${OUTREACH_SENT_MAILBOX}`, err) }
    } catch (err) {
      fail('imap', err)
    } finally {
      // 🔴 ALWAYS. A leaked IMAP connection is a session the mail host counts against a small limit.
      try { await client.logout() } catch { /* already gone */ }
    }

    await writeSetting(supabase, STATE_KEY, state)

    // ── HOUSEKEEPING ──────────────────────────────────────────────────────────────────────────────
    try { await housekeeping(supabase, { mailUser: user, mailPass: pass }, now, summary) }
    catch (err) { fail('housekeeping', err) }
  } catch (err) {
    fail('poll', err)
    summary.ok = false
  } finally {
    await releaseLock(supabase)
  }
  return summary
}

// ── THE THREE INCOMING OUTCOMES ─────────────────────────────────────────────────────────────────────
const messageRow = (m: SeenMessage, path: string, prospectId: string, status: string, direction: string) => ({
  prospect_id: prospectId,
  direction,
  status,
  is_test: false,
  source: 'poll',
  message_id: m.messageId!,
  in_reply_to: null as string | null,
  subject: m.subject,
  from_address: m.from[0] ?? null,
  to_address: m.to[0] ?? null,
  message_date: m.date,
  mailbox: path,
  uid: m.uid,
})

/**
 * 🔴 AN AUTO-REPLY IS RECORDED AND NEVER LOGGED. §57.1 exits a prospect's sequence on any inbound
 * CONTACT row, so logging an out-of-office would stop Dominic chasing a business that never answered.
 * The message row is still written, so the Emails list shows what arrived and View can open it.
 */
async function handleAutoReply(
  supabase: SupabaseClient, dir: Directory, m: SeenMessage, path: string, prospectId: string, summary: PollSummary,
) {
  const { error } = await supabase.from('outreach_messages').insert(messageRow(m, path, prospectId, 'auto_reply', 'inbound'))
  if (error) { summary.errors.push({ step: 'auto_reply', error: dbDetail(error) }); return }
  dir.byMessageId.set(m.messageId!, prospectId)
  summary.autoReplies++
}

/**
 * A delivery failure. The ORIGINAL row is marked `bounced` so the list and the modal can say
 * "Email bounced — check the address"; the report itself is recorded as an inbound `bounce`.
 * 🔴 NO CONTACT ROW AND NO STAGE CHANGE. A bounce is the absence of a conversation, not one.
 */
async function handleBounce(
  supabase: SupabaseClient, client: ImapFlow, dir: Directory, m: SeenMessage,
  h: IncomingHeaders, path: string, summary: PollSummary,
) {
  const returned = await readReturnedPart(client, m.uid)
  const originalId = bouncedOriginalId(returned, h)
  const prospectId = originalId ? dir.byMessageId.get(originalId) : undefined
  if (!prospectId) { summary.unmatched++; return }
  if (dir.skip.has(prospectId)) return
  if (originalId) {
    await supabase.from('outreach_messages')
      .update({ status: 'bounced', updated_at: new Date().toISOString() })
      .eq('message_id', originalId).eq('direction', 'outbound')
  }
  const { error } = await supabase.from('outreach_messages').insert({
    ...messageRow(m, path, prospectId, 'bounce', 'inbound'),
    in_reply_to: originalId,
  })
  if (error) { summary.errors.push({ step: 'bounce', error: dbDetail(error) }); return }
  dir.byMessageId.set(m.messageId!, prospectId)
  summary.bounces++
}

/**
 * A real reply: the row, then the rung, through the ONE writer.
 * 🔴 `logOutreachContact` AND NOT AN INSERT. It owns the conditional stage move (`contacted` →
 * `replied`, and never over a stage Dominic set by hand) and it is what §57 derives the next step from.
 * A parallel insert here would be a second ladder.
 */
async function handleReply(
  supabase: SupabaseClient, client: ImapFlow, dir: Directory, m: SeenMessage,
  path: string, prospectId: string, summary: PollSummary,
) {
  const text = await readText(client, path, m.uid)
  const { data: inserted, error } = await supabase.from('outreach_messages').insert({
    ...messageRow(m, path, prospectId, 'received', 'inbound'),
    text_body: text,
  }).select('id').single()
  if (error) { summary.errors.push({ step: 'reply', error: dbDetail(error) }); return }
  dir.byMessageId.set(m.messageId!, prospectId)
  dir.hasReply.add(prospectId)

  const logged = await logOutreachContact(supabase, {
    prospect_id: prospectId,
    channel: 'email',
    direction: 'inbound',
    kind: 'reply',
    message: stripQuotedHistory(text ?? ''),
    contacted_at: m.date,
  })
  if (!logged.ok) { summary.errors.push({ step: 'reply-log', error: logged.error ?? 'unknown' }); return }
  if (logged.id) {
    await supabase.from('outreach_messages')
      .update({ contact_id: logged.id }).eq('id', (inserted as { id: string }).id)
  }
  summary.repliesLogged++
}

/**
 * Mail Dominic sent from Outlook to a prospect.
 * ⚠️ IT IS LOGGED ONLY WHEN THE PROSPECT HAS ALREADY REPLIED, and then only as `reply`. Outlook is
 * where he answers people; the ladder rungs (1_… to 4_…) are what THIS page sends, and guessing that
 * a hand-sent email was a chase would put a rung on the ladder that §57 then counts. With no reply on
 * file the message is recorded and nothing is logged — the record is still useful, the inference is not.
 */
async function handleOutlookSent(
  supabase: SupabaseClient, dir: Directory, m: SeenMessage, prospectId: string, summary: PollSummary,
) {
  const { data: inserted, error } = await supabase.from('outreach_messages').insert({
    ...messageRow(m, OUTREACH_SENT_MAILBOX, prospectId, 'sent', 'outbound'),
    sent_copy: 'server_filed',
  }).select('id').single()
  if (error) { summary.errors.push({ step: 'outlook_sent', error: dbDetail(error) }); return }
  dir.byMessageId.set(m.messageId!, prospectId)
  summary.outlookSentRecorded++
  if (!dir.hasReply.has(prospectId)) return
  const logged = await logOutreachContact(supabase, {
    prospect_id: prospectId, channel: 'email', direction: 'outbound', kind: 'reply',
    message: m.subject ?? '', contacted_at: m.date,
  })
  if (logged.ok && logged.id) {
    await supabase.from('outreach_messages')
      .update({ contact_id: logged.id }).eq('id', (inserted as { id: string }).id)
  }
}

// ── HOUSEKEEPING ────────────────────────────────────────────────────────────────────────────────────
interface HouseRow extends DeliverRow {
  status: string
  is_test: boolean
  last_error: string | null
  created_at: string | null
  updated_at: string | null
  sent_copy: string
}

async function housekeeping(
  supabase: SupabaseClient, env: { mailUser: string; mailPass: string }, now: Date, summary: PollSummary,
) {
  const { data } = await supabase
    .from('outreach_messages')
    .select('id, message_id, in_reply_to, "references", subject, to_address, message_date, html_body, text_body, attempts, status, is_test, last_error, created_at, updated_at, sent_copy')
    .eq('direction', 'outbound')
    .in('status', ['sending', 'failed', 'sent'])
    .order('created_at', { ascending: false })
    .limit(200)
  const rows = (data ?? []) as unknown as HouseRow[]
  const fromName = await readFromName(supabase)

  for (const row of rows) {
    // 1 · a send whose conversation never came back
    if (isStuckSending(row, now)) {
      await supabase.from('outreach_messages').update({
        status: 'uncertain',
        last_error: 'no reply from the mail server; left as uncertain by the reply check',
        updated_at: new Date().toISOString(),
      }).eq('id', row.id).eq('status', 'sending')
      summary.markedUncertain++
      continue
    }
    // 2 · a temporary failure, recent, under the attempt ceiling
    if (shouldAutoRetry(row, now)) {
      const result = await deliver(supabase, { ...row, from_name: fromName }, {
        mailUser: env.mailUser, mailPass: env.mailPass, isTest: row.is_test,
      })
      summary.retried++
      // ⚠️ LOGGED EXACTLY AS A MANUAL SEND WOULD BE, including the rule that a test never logs.
      if (result.status === 'sent' && !row.is_test) {
        const { data: already } = await supabase
          .from('outreach_messages').select('contact_id, prospect_id').eq('id', row.id).maybeSingle()
        const a = already as { contact_id: string | null; prospect_id: string } | null
        if (a && !a.contact_id) {
          const logged = await logOutreachContact(supabase, {
            prospect_id: a.prospect_id, channel: 'email', direction: 'outbound',
            kind: null, message: row.text_body ?? '', contacted_at: null,
          })
          if (logged.ok && logged.id) {
            await supabase.from('outreach_messages').update({ contact_id: logged.id }).eq('id', row.id)
          }
        }
      }
      continue
    }
    // 3 · a sent message with no copy in Sent
    if (row.status === 'sent' && row.sent_copy === 'absent' && !row.is_test) {
      try {
        const raw = await composeRaw({ ...row, from_name: fromName })
        const copy = await fileSentCopy(
          { ...row, from_name: fromName }, raw,
          row.message_date ? new Date(row.message_date) : new Date(), env,
        )
        await supabase.from('outreach_messages').update({
          sent_copy: copy.sentCopy, mailbox: copy.mailbox, uid: copy.uid, uidvalidity: copy.uidvalidity,
          last_error: copy.sentCopy === 'absent' ? `sent copy: ${copy.reason}` : null,
          updated_at: new Date().toISOString(),
        }).eq('id', row.id)
        if (copy.sentCopy !== 'absent') summary.copiesFiled++
      } catch (err) {
        summary.errors.push({ step: 'sent-copy', error: sanitiseMailError(err) })
      }
    }
  }
}
