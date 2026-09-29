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
import {
  planFetch, advanceWatermark, classifyIncoming, matchIncoming, matchOutgoing,
  bouncedOriginalId, stripQuotedHistory, isStuckSending, shouldAutoRetry, isOwnAddress,
  type PollState, type IncomingHeaders,
} from '@/lib/outreach-mail-poll-rules'
import {
  claimPollLock, releasePollLock, insertMessageOnce, claimRetry,
} from '@/lib/outreach-poll-claims'
import {
  resolveAccounts, credentialsFor, accountOfRow,
  type MailAccount, type AccountCredentials, type AccountSet,
} from '@/lib/outreach-mail-accounts'

/** The mailboxes walked for incoming mail, and the one walked for Dominic's own Outlook-sent mail. */
export const INCOMING_MAILBOXES = ['INBOX', 'Spam', 'Archive'] as const
export const POLL_MAILBOXES = [...INCOMING_MAILBOXES, OUTREACH_SENT_MAILBOX] as const

/**
 * 🔴 ONE WATERMARK SET PER ACCOUNT, AND THE LEGACY KEY IS UNCHANGED. `hello`'s watermarks stay under
 * `mail_poll_state`, exactly where Build 2 put them, so the switch does not make the poll re-read
 * hello@'s recent mail as if it were new. `dominic` gets its own key and therefore its own first look,
 * which baselines and processes nothing older — the same rule, applied to a mailbox that is new to us.
 */
const STATE_KEY: Record<MailAccount, string> = {
  hello: 'mail_poll_state',
  dominic: 'mail_poll_state_dominic',
}
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

/* 🔴 `takeLock` WAS HERE AND IT WAS NOT ATOMIC. It READ the lock, decided it was free, and THEN wrote
 * it — so two runs a millisecond apart both read "free" and both proceeded. `claimPollLock` in
 * `lib/outreach-poll-claims.ts` replaces it with statements that are themselves the test. */

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
  client: ImapFlow, path: string, state: PollState, summary: PollSummary, label: string,
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
      summary.baselined.push(label)
      return
    }
    if (plan.mode === 'none') { state[path] = { uidvalidity, lastUid: highestUid }; return }
    if (plan.mode === 'rescan') summary.rescanned.push(label)

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
    if (c === 0 && !state[path]) summary.baselined.push(label)
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

  // 🔴 EVERY CONFIGURED ACCOUNT, LEGACY FIRST. With only `hello` set this is exactly Build 2's run;
  // with both, hello@ is still WALKED — read-only — because replies to old threads still land there.
  const accounts = resolveAccounts()
  if (!accounts.configured.length) {
    return { ...summary, ok: false, skipped: 'The mailbox credentials are not set on this environment.' }
  }

  // 🔴 ATOMIC. `claimPollLock` is one statement that both tests and acts; the read-then-write version
  // it replaces let two runs a millisecond apart both decide the lock was free.
  if (!(await claimPollLock(supabase, now))) {
    return { ...summary, ok: true, skipped: 'Another check is already running — nothing was done.' }
  }

  try {
    const dir = await loadDirectory(supabase)

    for (const creds of accounts.configured) {
      try { await pollOneAccount(supabase, creds, dir, summary) }
      catch (err) { fail(`account:${creds.account}`, err) }
    }

    // ── HOUSEKEEPING ──────────────────────────────────────────────────────────────────────────────
    try { await housekeeping(supabase, accounts, now, summary) }
    catch (err) { fail('housekeeping', err) }
  } catch (err) {
    fail('poll', err)
    summary.ok = false
  } finally {
    await releasePollLock(supabase)
  }
  return summary
}

/**
 * One account: its own IMAP connection, its own watermarks, the same rules.
 * ⚠️ THE MATCHING, CLASSIFYING, LINKED-TRUCK SKIP AND OWN-ADDRESS RULES ARE UNCHANGED and are shared
 * between the accounts — a reply is a reply whichever mailbox it lands in.
 */
async function pollOneAccount(
  supabase: SupabaseClient, creds: AccountCredentials, dir: Directory, summary: PollSummary,
): Promise<void> {
  const fail = (step: string, err: unknown) => { summary.errors.push({ step, error: sanitiseMailError(err) }) }
  const stateKey = STATE_KEY[creds.account]
  const state = ((await readSetting(supabase, stateKey)) ?? {}) as PollState
  const label = (path: string) => `${creds.account}/${path}`

  const client = makeImapClient(creds.user, creds.pass)
  try {
    await client.connect()

    // ── INCOMING ──────────────────────────────────────────────────────────────────────────────────
    for (const path of INCOMING_MAILBOXES) {
      try {
        await walkMailbox(client, path, state, summary, label(path), async m => {
          if (!m.messageId) return                       // nothing to be idempotent on
          if (m.from.some(isOwnAddress)) return          // our own mail is not a reply to us
          const h = headersOf(m.raw, m.subject, m.from[0] ?? null)
          // 🔴 THREADING LOOKS ACROSS BOTH ACCOUNTS. `dir.byMessageId` is built from every row in the
          // table, so a reply arriving at dominic@ to an email sent from hello@ still matches its
          // thread — which is the common case for weeks after the switch.
          const match = matchIncoming({ get: h.get, fromAddress: h.fromAddress }, dir.byMessageId, dir.byAddress)
          if (match.kind === 'ambiguous') { summary.ambiguous++; return }
          if (match.kind === 'none') { summary.unmatched++; return }
          if (dir.skip.has(match.prospectId)) return     // a linked HatchGrab truck: never auto-logged
          // ⚠️ A CHEAP PRE-CHECK, NOT THE GUARD. It saves a round trip for the overwhelmingly common
          // case of a message seen on an earlier run. The GUARD is the insert itself — see
          // `insertMessageOnce`, and the note on the defect it fixes.
          if (dir.byMessageId.has(m.messageId)) return

          const kind = classifyIncoming(h)
          if (kind === 'bounce') { await handleBounce(supabase, client, dir, m, h, path, creds.account, summary); return }
          if (kind === 'auto_reply') { await handleAutoReply(supabase, dir, m, path, creds.account, match.prospectId, summary); return }
          await handleReply(supabase, client, dir, m, path, creds.account, match.prospectId, summary)
        })
      } catch (err) { fail(`mailbox:${label(path)}`, err) }
    }

    // ── OUTLOOK-SENT MAIL ─────────────────────────────────────────────────────────────────────────
    try {
      await walkMailbox(client, OUTREACH_SENT_MAILBOX, state, summary, label(OUTREACH_SENT_MAILBOX), async m => {
        if (!m.messageId) return
        if (dir.byMessageId.has(m.messageId)) return     // a system send already has its row
        const match = matchOutgoing(m.to, dir.byAddress)
        if (match.kind === 'ambiguous') { summary.ambiguous++; return }
        if (match.kind === 'none') { summary.unmatched++; return }
        if (dir.skip.has(match.prospectId)) return
        await handleOutlookSent(supabase, dir, m, creds.account, match.prospectId, summary)
      })
    } catch (err) { fail(`mailbox:${label(OUTREACH_SENT_MAILBOX)}`, err) }
  } catch (err) {
    fail(`imap:${creds.account}`, err)
  } finally {
    // 🔴 ALWAYS. A leaked IMAP connection is a session the mail host counts against a small limit.
    try { await client.logout() } catch { /* already gone */ }
  }

  await writeSetting(supabase, stateKey, state)
}

// ── THE THREE INCOMING OUTCOMES ─────────────────────────────────────────────────────────────────────
const messageRow = (
  m: SeenMessage, path: string, account: MailAccount, prospectId: string, status: string, direction: string,
) => ({
  prospect_id: prospectId,
  direction,
  status,
  is_test: false,
  source: 'poll',
  // 🔴 THE ACCOUNT IT WAS FOUND IN, EXPLICITLY. `mailbox` + `uid` are meaningless without it, and the
  // column has no default precisely so that an insert cannot forget.
  account,
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
  supabase: SupabaseClient, dir: Directory, m: SeenMessage, path: string, account: MailAccount,
  prospectId: string, summary: PollSummary,
) {
  const made = await insertMessageOnce(supabase, messageRow(m, path, account, prospectId, 'auto_reply', 'inbound'))
  if (!made.created) {
    if (made.error) summary.errors.push({ step: 'auto_reply', error: made.error })
    return
  }
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
  h: IncomingHeaders, path: string, account: MailAccount, summary: PollSummary,
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
  const made = await insertMessageOnce(supabase, {
    ...messageRow(m, path, account, prospectId, 'bounce', 'inbound'),
    in_reply_to: originalId,
  })
  if (!made.created) {
    if (made.error) summary.errors.push({ step: 'bounce', error: made.error })
    return
  }
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
  path: string, account: MailAccount, prospectId: string, summary: PollSummary,
) {
  const text = await readText(client, path, m.uid)
  // 🔴 THE INSERT IS THE GATE, AND THIS IS THE FIX FOR THE BUILD-2 DEFECT. The old code checked an
  // IN-MEMORY map built at the start of the run, inserted, and then wrote the contact row whatever the
  // insert did. Two overlapping runs each built that map before either inserted, so both thought the
  // reply was new; the second INSERT failed on the unique `message_id` — and the code logged the
  // contact anyway. `outreach_contacts` has no such constraint, so one reply became two rungs and §57
  // read that ladder. Now only the run whose own insert RETURNED a row goes on to log.
  const made = await insertMessageOnce(supabase, {
    ...messageRow(m, path, account, prospectId, 'received', 'inbound'),
    text_body: text,
  })
  if (!made.created) {
    // ⚠️ NOT AN ERROR WHEN THE ROW SIMPLY EXISTS. Another run recorded this reply a moment ago; it is
    // logged, and logging it again is the exact thing being prevented.
    if (made.error) summary.errors.push({ step: 'reply', error: made.error })
    return
  }
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
    await supabase.from('outreach_messages').update({ contact_id: logged.id }).eq('id', made.id)
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
  supabase: SupabaseClient, dir: Directory, m: SeenMessage, account: MailAccount,
  prospectId: string, summary: PollSummary,
) {
  // 🔴 THE SAME GATE AS A REPLY, for the same reason: this path logs a contact too.
  const made = await insertMessageOnce(supabase, {
    ...messageRow(m, OUTREACH_SENT_MAILBOX, account, prospectId, 'sent', 'outbound'),
    sent_copy: 'server_filed',
  })
  if (!made.created) {
    if (made.error) summary.errors.push({ step: 'outlook_sent', error: made.error })
    return
  }
  dir.byMessageId.set(m.messageId!, prospectId)
  summary.outlookSentRecorded++
  if (!dir.hasReply.has(prospectId)) return
  const logged = await logOutreachContact(supabase, {
    prospect_id: prospectId, channel: 'email', direction: 'outbound', kind: 'reply',
    message: m.subject ?? '', contacted_at: m.date,
  })
  if (logged.ok && logged.id) {
    await supabase.from('outreach_messages').update({ contact_id: logged.id }).eq('id', made.id)
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
  supabase: SupabaseClient, accounts: AccountSet, now: Date, summary: PollSummary,
) {
  const { data } = await supabase
    .from('outreach_messages')
    .select('id, message_id, in_reply_to, "references", subject, to_address, message_date, html_body, text_body, attempts, status, is_test, last_error, created_at, updated_at, sent_copy, account')
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
      // 🔴 CLAIM IT FIRST, ATOMICALLY. `failed` → `sending` in one statement filtered on `failed`:
      // whoever's update returns a row owns the retry, and the loser's update matches nothing. Without
      // this, two overlapping polls could each re-send the same email to the same prospect.
      if (!(await claimRetry(supabase, row.id, now))) continue
      // ⚠️ THE ROW'S OWN ACCOUNT, not the primary — a legacy message retries from the mailbox its
      // thread lives in.
      const creds = credentialsFor(accounts, accountOfRow(row))
      if (!creds) { summary.errors.push({ step: 'retry', error: `no credentials for the ${accountOfRow(row)} mailbox` }); continue }
      const result = await deliver(supabase, { ...row, from_name: fromName }, {
        mailUser: creds.user, mailPass: creds.pass, isTest: row.is_test,
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
      const creds = credentialsFor(accounts, accountOfRow(row))
      if (!creds) continue
      try {
        const raw = await composeRaw({ ...row, from_name: fromName })
        const copy = await fileSentCopy(
          { ...row, from_name: fromName }, raw,
          row.message_date ? new Date(row.message_date) : new Date(),
          { mailUser: creds.user, mailPass: creds.pass },
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
