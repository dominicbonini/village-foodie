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
  makeImapClient, withReadOnlyMailbox, mailboxStatus, decodePart, sanitiseMailError,
  structureOf, readWholeMessageLocked,
} from '@/lib/outreach-mail-box'
import { findPart, headerBlockOf, headerValue, addressesOf } from '@/lib/outreach-mail-format'
import {
  capHtml, bodyColumns, type StoredBodies,
} from '@/lib/outreach-mail-bodies'
import { logOutreachContact } from '@/lib/outreach-contact-log'
import { deliver, fileSentCopy, type DeliverRow } from '@/lib/outreach-mail-deliver'
import { composeRaw } from '@/lib/outreach-mail-envelope'
import { readFromName } from '@/lib/outreach-settings-read'
import {
  planFetch, advanceWatermark, emptyWatermark, withinFirstLook, classifyIncoming, matchIncoming, matchOutgoing,
  bouncedOriginalId, stripQuotedHistory, isStuckSending, shouldAutoRetry, isOwnAddress,
  replyTextFrom, messageIdsIn,
  type PollState, type IncomingHeaders,
} from '@/lib/outreach-mail-poll-rules'
import {
  claimPollLock, releasePollLock, insertMessageOnce, claimRetry, claimAdoption,
} from '@/lib/outreach-poll-claims'
import {
  resolveAccounts, credentialsFor, accountOfRow, pollSince,
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
  // 🔴 `_v2` IS THE RECOVERY. `mail_poll_state_dominic` holds the watermarks the 29 September cron
  // set by BASELINING — including the one on `dominic/INBOX` that was placed above a real reply and
  // swallowed it permanently. Moving to a new key gives every dominic@ folder a fresh first look,
  // which now reads by date from the mailbox's creation day and therefore picks that reply up.
  // ⚠️ THE OLD KEY IS LEFT IN PLACE, UNUSED, AND DELIBERATELY NOT DELETED. It is the only record of
  // what the broken run did; rewriting it would destroy the evidence, and deleting a row to fix a bug
  // is how the next person loses the ability to tell what happened.
  // ⚠️ hello@ KEEPS ITS EXISTING KEY. Its INBOX and Sent watermarks are correct — they were set by
  // runs that actually read those folders — and a fresh first look there would re-read a week of mail
  // for nothing. Its two EMPTY folders had no watermark at all, so they get one now regardless.
  dominic: 'mail_poll_state_dominic_v2',
}
/** A hard ceiling per mailbox per run, so one enormous backlog cannot run past the function timeout. */
const MAX_PER_MAILBOX = 200

/**
 * 🔴 ONE LINE PER FOLDER, SO "FOUND NOTHING" IS DIAGNOSABLE FROM THE SCREEN. On 29 September the
 * button reported all zeros and Dominic had no way to tell whether the reply had not arrived, had not
 * matched, or had been skipped by a watermark set a few minutes earlier by the cron. It was the third,
 * and nothing on screen could have said so. This says so.
 */
export interface FolderReport {
  folder: string
  mode: 'first_look' | 'incremental' | 'rescan' | 'none' | 'empty'
  /** Messages handed to the matcher this run — after the first-look date filter. */
  examined: number
  before: number | null
  after: number | null
  /** The first-look cut-off, when this run had one. */
  since: string | null
}

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
  /** 🔴 Replies to a TEST send — Dominic answering himself. Counted, never recorded. */
  repliesToTest: number
  /** Inbound rows whose contact message was empty and has now been filled in. See `repairReplyTexts`. */
  textsFilled: number
  /** Rows the importer had taken and this run took over and handled. See `adoptImportedMessages`. */
  adopted: number
  /** Rows given their stored bodies this run, so View no longer needs the mailbox for them. */
  bodiesFilled: number
  /** Mailboxes whose uidvalidity changed and were re-scanned. Reported, because it explains a spike. */
  rescanned: string[]
  /** Mailboxes given their first look, with the date it read from. */
  baselined: string[]
  /** Per folder: what was examined and how the watermark moved. See `FolderReport`. */
  folders: FolderReport[]
  errors: { step: string; error: string }[]
}

const emptySummary = (): PollSummary => ({
  ok: true, repliesLogged: 0, autoReplies: 0, bounces: 0, outlookSentRecorded: 0,
  retried: 0, markedUncertain: 0, copiesFiled: 0, ambiguous: 0, unmatched: 0,
  repliesToTest: 0, textsFilled: 0, adopted: 0, bodiesFilled: 0,
  rescanned: [], baselined: [], folders: [], errors: [],
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
  /** 🔴 Of those, the ones belonging to TEST sends. A reply to one is ignored — see `repliesToTest`. */
  testMessageIds: Set<string>
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
  const testMessageIds = new Set<string>()
  const hasReply = new Set<string>()
  const { data: mRows } = await supabase
    .from('outreach_messages').select('message_id, prospect_id, direction, status, is_test')
  for (const m of (mRows ?? []) as { message_id: string; prospect_id: string; direction: string; status: string; is_test: boolean }[]) {
    byMessageId.set(m.message_id, m.prospect_id)
    // 🔴 A TEST SEND IS NOT CORRESPONDENCE. Its replies are Dominic answering himself.
    if (m.is_test) testMessageIds.add(m.message_id)
    if (m.direction === 'inbound' && m.status === 'received') hasReply.add(m.prospect_id)
  }
  return { byAddress, byMessageId, testMessageIds, skip, hasReply }
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

/**
 * Does this message's thread resolve to TEST sends and nothing else?
 *
 * 🔴 "ONLY" IS LOAD-BEARING IN BOTH DIRECTIONS. A thread that touches any real send is a real
 * conversation and is handled normally — a prospect who was sent a test and later a real email has
 * one thread, and a reply in it is a reply. A thread that touches nothing but tests is Dominic
 * replying to himself, and recording it would put a `replied` stage on a conversation that never
 * happened. ⚠️ A message with no thread ids at all is NOT a reply to a test: it has no thread, so
 * this says no and the address match decides as before.
 */
function isReplyToTestOnly(h: Pick<IncomingHeaders, 'get'>, dir: Directory): boolean {
  const ids = [...messageIdsIn(h.get('in-reply-to')), ...messageIdsIn(h.get('references'))]
  const known = ids.filter(id => dir.byMessageId.has(id))
  if (!known.length) return false
  return known.every(id => dir.testMessageIds.has(id))
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
  since: Date,
  onMessage: (m: SeenMessage) => Promise<void>,
): Promise<void> {
  const before = state[path]
  let examined = 0
  let mode: FolderReport['mode'] = 'none'
  // ⚠️ RECORDED WHERE IT IS DECIDED, not inferred from `mode` afterwards — TypeScript narrows `mode`
  // past the closure that assigns it, and a comparison it believes is impossible is a comparison that
  // silently stops being made.
  let sinceUsed: string | null = null

  const res = await withReadOnlyMailbox(client, path, async () => {
    const mb = client.mailbox
    const uidvalidity = mb && typeof mb === 'object' && 'uidValidity' in mb ? String(mb.uidValidity) : '0'
    const highestUid = mb && typeof mb === 'object' && 'uidNext' in mb ? Math.max(0, Number(mb.uidNext) - 1) : 0
    const plan = planFetch(state[path], { uidvalidity, highestUid }, since)
    mode = plan.mode
    if (plan.mode === 'none') { state[path] = { uidvalidity, lastUid: highestUid }; return }
    if (plan.mode === 'rescan') summary.rescanned.push(label)
    if (plan.mode === 'first_look') {
      sinceUsed = since.toISOString()
      summary.baselined.push(`${label} (since ${sinceUsed})`)
    }

    // 🔴 A FIRST LOOK SEARCHES BY DATE. `SINCE` is a day, in the server's own timezone, so it is a
    // NARROWING and not the decision — `withinFirstLook` compares the exact internal date below.
    const query = plan.mode === 'rescan'
      ? { since: new Date(Date.now() - plan.sinceDays * 86_400_000) }
      : plan.mode === 'first_look'
        ? { since: plan.since }
        : `${plan.from}:*`
    const byUid = plan.mode === 'incremental'
    const seenUids: number[] = []
    // 🔴 DRAIN FIRST, HANDLE AFTERWARDS, AND THAT IS NOT A TIDY-UP — IT IS A DEADLOCK FIX.
    // imapflow allows ONE command in flight: `exec` queues, and the FETCH generator only lets the
    // server send the next message after the consumer's `yield` returns. A handler that ran INSIDE
    // this loop and issued its own fetch — reading a reply's body, or a bounce's returned original —
    // queued behind a FETCH that could not finish until the handler returned. Neither could proceed;
    // the run hung until the connection deadline killed it. So the loop now does nothing but collect,
    // and every handler runs below, with the mailbox still open and no fetch in flight.
    const batch: SeenMessage[] = []
    let n = 0
    for await (const msg of client.fetch(query as never, {
      uid: true, envelope: true, headers: true, internalDate: true,
    }, { uid: byUid })) {
      if (n++ >= MAX_PER_MAILBOX) break
      // ⚠️ THE WATERMARK ADVANCES OVER EVERY MESSAGE THE SEARCH RETURNED, including ones the date
      // filter rejects. They have been looked at; re-reading them next run would be pure cost.
      seenUids.push(msg.uid)
      if (plan.mode === 'first_look' && !withinFirstLook(msg.internalDate, plan.since)) continue
      examined++
      const env = msg.envelope
      batch.push({
        uid: msg.uid,
        messageId: env?.messageId ?? null,
        raw: headerBlockOf(msg),
        subject: env?.subject ?? null,
        from: addressesOf(env?.from),
        to: [...addressesOf(env?.to), ...addressesOf(env?.cc)],
        date: env?.date ? new Date(env.date).toISOString() : null,
      })
    }
    // ⚠️ THE WATERMARK MOVES WHETHER OR NOT A HANDLER THROWS, for the same reason it moves over
    // filtered messages: these have been read. A handler failure is reported, not re-read forever.
    state[path] = advanceWatermark(state[path], { uidvalidity, highestUid }, seenUids)
    for (const m of batch) await onMessage(m)
  })

  if (res.skipped) {
    // 🔴 AN EMPTY FOLDER GETS A WATERMARK TOO, AND THAT IS THE SECOND HALF OF THE 29 SEPTEMBER BUG.
    // `withReadOnlyMailbox` does not open an empty mailbox — correctly, because `fetch('1:*')` on one
    // throws — so this callback never ran and no watermark was ever stored. hello/Spam and
    // hello/Archive therefore reported "first look" on every run for hours, and the FIRST message to
    // arrive in one of them would have been baselined away by the next run.
    const st = await mailboxStatus(client, path)
    mode = 'empty'
    if (st && st.messages === 0 && !state[path]) {
      state[path] = emptyWatermark(st.uidvalidity)
    }
  }

  summary.folders.push({
    folder: label,
    mode,
    examined,
    before: before ? before.lastUid : null,
    after: state[path] ? state[path].lastUid : null,
    since: sinceUsed,
  })
}

/**
 * Everything the viewer will ever need from one message, read once, READ-ONLY.
 *
 * 🔴 STORED SO THAT OPENING IT LATER DOES NOT MEAN LOGGING IN. View took whole seconds because every
 * open connected to IMAP and downloaded the message again. The mailbox is the source of truth for
 * what arrived and a poor one for "show me that again": it needs a login, it can be slow, and a
 * message that has since been moved cannot be shown at all. Read here, at the one moment the mailbox
 * is already open and the message is certainly there, and written down with the row.
 *
 * 🔴 BOTH BODY PARTS ARE ASKED FOR, AND THAT IS THE EARLIER FIX PRESERVED. This once requested
 * `text/plain` and returned `null` the moment there was not one; Outlook.com sends HTML-only replies
 * routinely, so a real reply produced no text, and the contact row was logged empty while the same
 * email read live from the Emails list showed the words plainly.
 *
 * ⚠️ ATTACHMENTS ARE NAMED, NEVER FETCHED. Only the two text parts are named in the fetch; the list
 * of attachments comes off the BODYSTRUCTURE the server has already sent. No attachment content is
 * downloaded here, or stored anywhere, ever.
 * ⚠️ THE MAILBOX MUST ALREADY BE OPEN. Every caller is inside `walkMailbox` or `withReadOnlyMailbox`;
 * taking a second lock on the same client would queue behind the first one and never return.
 */
async function readBodies(client: ImapFlow, uid: number): Promise<StoredBodies | null> {
  try {
    const struct = await structureOf(client, uid)
    if (!struct) return null
    const whole = await readWholeMessageLocked(client, uid, struct)
    const capped = capHtml(whole.html)
    return { html: capped.html, text: whole.text, attachments: whole.attachments, truncated: capped.truncated }
  } catch { return null }
}

/**
 * The reply's TEXT, from bodies already read. The rule is unchanged — plain if there is plain, else
 * the HTML flattened — and only the source of the parts has moved.
 * ⚠️ `decodePart`, inside the reader, HANDLES THE CHARSET AND THE TRANSFER ENCODING — base64 and
 * quoted-printable both — so "non-empty after decoding" is a question this can actually answer.
 */
function textOfBodies(b: StoredBodies | null): string | null {
  if (!b) return null
  return replyTextFrom(b.text, b.html) || null
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

    // ── ADOPT, REPAIR, THEN HOUSEKEEPING ─────────────────────────────────────────────────────────────────
    // 🔴 AFTER THE WALK, NOT BEFORE IT. A message the walk is about to handle normally must not be
    // adopted out from under it; by here every folder has been read and what is left is what the
    // importer took.
    try { await adoptImportedMessages(supabase, accounts, dir, now, summary) }
    catch (err) { fail('adopt', err) }
    try { await repairReplyTexts(supabase, accounts, summary) }
    catch (err) { fail('repair', err) }
    try { await fillMissingBodies(supabase, accounts, summary) }
    catch (err) { fail('bodies', err) }
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
  // 🔴 THE FIRST-LOOK CUT-OFF FOR THIS ACCOUNT. See `POLL_SINCE` for why it is a date and not the
  // current top uid, and which real reply the old way lost.
  const since = pollSince(creds.account)
  const label = (path: string) => `${creds.account}/${path}`

  const client = makeImapClient(creds.user, creds.pass)
  try {
    await client.connect()

    // ── INCOMING ──────────────────────────────────────────────────────────────────────────────────
    for (const path of INCOMING_MAILBOXES) {
      try {
        await walkMailbox(client, path, state, summary, label(path), since, async m => {
          if (!m.messageId) return                       // nothing to be idempotent on
          if (m.from.some(isOwnAddress)) return          // our own mail is not a reply to us
          const h = headersOf(m.raw, m.subject, m.from[0] ?? null)
          // 🔴 THREADING LOOKS ACROSS BOTH ACCOUNTS. `dir.byMessageId` is built from every row in the
          // table, so a reply arriving at dominic@ to an email sent from hello@ still matches its
          // thread — which is the common case for weeks after the switch.
          // 🔴 A REPLY TO A TEST SEND IS IGNORED ENTIRELY, AND IT MUST NOT FALL THROUGH.
          // A test goes to Dominic's own address; replying to it is him answering himself. One such
          // reply was logged on 29 September as a real reply, moving the prospect to `replied` on a
          // conversation that never happened. ⚠️ THE `return` IS THE POINT: without it the code would
          // drop to the From-address match and log it anyway, because the reply genuinely does come
          // from the prospect's own address.
          if (isReplyToTestOnly(h, dir)) { summary.repliesToTest++; return }
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
          if (kind === 'auto_reply') { await handleAutoReply(supabase, client, dir, m, path, creds.account, match.prospectId, summary); return }
          await handleReply(supabase, client, dir, m, path, creds.account, match.prospectId, summary)
        })
      } catch (err) { fail(`mailbox:${label(path)}`, err) }
    }

    // ── OUTLOOK-SENT MAIL ─────────────────────────────────────────────────────────────────────────
    try {
      await walkMailbox(client, OUTREACH_SENT_MAILBOX, state, summary, label(OUTREACH_SENT_MAILBOX), since, async m => {
        if (!m.messageId) return
        if (dir.byMessageId.has(m.messageId)) return     // a system send already has its row
        const match = matchOutgoing(m.to, dir.byAddress)
        if (match.kind === 'ambiguous') { summary.ambiguous++; return }
        if (match.kind === 'none') { summary.unmatched++; return }
        if (dir.skip.has(match.prospectId)) return
        await handleOutlookSent(supabase, client, dir, m, creds.account, match.prospectId, summary)
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
  supabase: SupabaseClient, client: ImapFlow, dir: Directory, m: SeenMessage, path: string,
  account: MailAccount, prospectId: string, summary: PollSummary,
) {
  // ⚠️ AN AUTO-REPLY IS STILL AN EMAIL DOMINIC MAY OPEN, so its body is stored like any other's.
  const bodies = await readBodies(client, m.uid)
  const made = await insertMessageOnce(supabase, {
    ...messageRow(m, path, account, prospectId, 'auto_reply', 'inbound'),
    ...(bodies ? bodyColumns(bodies) : {}),
  })
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
  const bodies = await readBodies(client, m.uid)
  const made = await insertMessageOnce(supabase, {
    ...messageRow(m, path, account, prospectId, 'bounce', 'inbound'),
    in_reply_to: originalId,
    ...(bodies ? bodyColumns(bodies) : {}),
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
  // 🔴 READ ONCE, STORE EVERYTHING. The bodies and the attachment list are written with the row, so
  // View never has to open the mailbox for this message again.
  const bodies = await readBodies(client, m.uid)
  const text = textOfBodies(bodies)
  // 🔴 THE INSERT IS THE GATE, AND THIS IS THE FIX FOR THE BUILD-2 DEFECT. The old code checked an
  // IN-MEMORY map built at the start of the run, inserted, and then wrote the contact row whatever the
  // insert did. Two overlapping runs each built that map before either inserted, so both thought the
  // reply was new; the second INSERT failed on the unique `message_id` — and the code logged the
  // contact anyway. `outreach_contacts` has no such constraint, so one reply became two rungs and §57
  // read that ladder. Now only the run whose own insert RETURNED a row goes on to log.
  const made = await insertMessageOnce(supabase, {
    ...messageRow(m, path, account, prospectId, 'received', 'inbound'),
    ...(bodies ? bodyColumns(bodies) : { text_body: text }),
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
  supabase: SupabaseClient, client: ImapFlow, dir: Directory, m: SeenMessage, account: MailAccount,
  prospectId: string, summary: PollSummary,
) {
  // ⚠️ WHAT DOMINIC WROTE FROM OUTLOOK IS STORED TOO — a chase quotes it, and View opens it.
  const bodies = await readBodies(client, m.uid)
  // 🔴 THE SAME GATE AS A REPLY, for the same reason: this path logs a contact too.
  const made = await insertMessageOnce(supabase, {
    ...messageRow(m, OUTREACH_SENT_MAILBOX, account, prospectId, 'sent', 'outbound'),
    sent_copy: 'server_filed',
    ...(bodies ? bodyColumns(bodies) : {}),
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

// ── ADOPTING THE MAIL THE IMPORTER TOOK ────────────────────────────────────────────────────────────
/** How many imported rows one run may take over. Each costs an IMAP read inside a 60-second budget. */
const MAX_ADOPTIONS_PER_RUN = 20

/** The columns adoption needs. Deliberately not `*`: `html_body` can be a megabyte. */
interface ImportedRow {
  id: string
  prospect_id: string | null
  direction: string | null
  message_id: string | null
  subject: string | null
  from_address: string | null
  to_address: string | null
  message_date: string | null
  mailbox: string | null
  uid: number | null
  account: string | null
}

/**
 * Take over the new mail the importer recorded, and handle it as the poll would have.
 *
 * 🔴 THE ROWS THIS EXISTS FOR ARE ALREADY IN THE DATABASE, RECORDED AND UNLOGGED. On 29 September a
 * real reply arrived at 20:57:07Z and "Import past emails" was pressed 27 seconds later. The importer
 * wrote it as `mailbox_import` — it writes no contact rows, by design — and the poll then found the
 * `message_id` already in `dir.byMessageId`, treated it as seen, and skipped it. The reply was in the
 * Emails list and nowhere in the ladder. The importer no longer takes such mail (see its
 * `withinFirstLook` guard), but that fixes only the next one; this recovers the ones already taken.
 *
 * 🔴 THE CLAIM COMES FIRST AND IT IS THE PROTECTION. Adoption ends in `logOutreachContact`, which has
 * no unique constraint behind it, so two overlapping runs must not both reach it — `claimAdoption`
 * flips `mailbox_import` → `poll` in one filtered statement and only the run whose update returns a
 * row proceeds.
 *
 * ⚠️ ONLY MAIL AT OR AFTER THAT ACCOUNT'S `POLL_SINCE`. Everything before it is history: Dominic's
 * old Outlook correspondence, imported precisely so the app knows it happened, and logging contacts
 * for months of it would invent a ladder that was never climbed.
 */
async function adoptImportedMessages(
  supabase: SupabaseClient, accounts: AccountSet, dir: Directory, now: Date, summary: PollSummary,
): Promise<void> {
  const { data } = await supabase
    .from('outreach_messages')
    .select('id, prospect_id, direction, message_id, subject, from_address, to_address, message_date, mailbox, uid, account')
    .eq('source', 'mailbox_import')
    .is('contact_id', null)
    .not('mailbox', 'is', null)
    .not('uid', 'is', null)
    .order('message_date', { ascending: false })
    .limit(200)
  const rows = (data ?? []) as ImportedRow[]
  // 🔴 THE BOUNDARY IS PER ACCOUNT, so it is applied here and not in the query: the two mailboxes
  // have different `POLL_SINCE` values and one `gte` could only be wrong for one of them.
  const due = rows
    .filter(r => r.message_date && withinFirstLook(new Date(r.message_date), pollSince(accountOfRow(r))))
    .slice(0, MAX_ADOPTIONS_PER_RUN)
  if (!due.length) return

  const byAccount = new Map<string, ImportedRow[]>()
  for (const r of due) {
    const a = accountOfRow(r)
    byAccount.set(a, [...(byAccount.get(a) ?? []), r])
  }

  for (const [account, group] of byAccount) {
    const creds = credentialsFor(accounts, account as MailAccount)
    if (!creds) continue
    const client = makeImapClient(creds.user, creds.pass)
    try {
      await client.connect()
      for (const r of group) {
        if (!r.prospect_id) continue
        // 🔴 CLAIM, THEN READ. Losing the claim means another run owns it; there is nothing to do and
        // nothing to say about it.
        if (!(await claimAdoption(supabase, r.id, now))) continue
        const res = await withReadOnlyMailbox(client, r.mailbox!, async () => adoptOne(supabase, client, dir, r, summary))
        if (res.skipped) continue
        summary.adopted++
      }
    } catch (err) {
      summary.errors.push({ step: `adopt:${account}`, error: sanitiseMailError(err) })
    } finally {
      try { await client.logout() } catch { /* already gone */ }
    }
  }
}

/**
 * One adopted message, inside its already-open mailbox.
 *
 * 🔴 THE SAME FOUR OUTCOMES AS A NEW MESSAGE, and they are the same functions' rules: a test-only
 * thread is counted and never logged, an auto-reply is recorded and never logged, a bounce marks its
 * original and never logs, and only a real reply reaches `logOutreachContact`.
 * ⚠️ IT UPDATES WHERE THE HANDLERS INSERT, and that is the only difference. The row exists — the
 * importer wrote it — so `insertMessageOnce` has nothing to gate here; `claimAdoption`, already past,
 * is the gate instead.
 */
async function adoptOne(
  supabase: SupabaseClient, client: ImapFlow, dir: Directory, r: ImportedRow, summary: PollSummary,
): Promise<void> {
  const prospectId = r.prospect_id!
  const msg = await client.fetchOne(String(r.uid!), { uid: true, envelope: true, headers: true }, { uid: true })
  if (!msg || typeof msg !== 'object') {
    summary.errors.push({ step: 'adopt', error: `A recorded email is no longer at its place in ${r.mailbox}.` })
    return
  }
  const env = (msg as { envelope?: { messageId?: string; subject?: string; from?: { address?: string | null }[]; to?: { address?: string | null }[]; cc?: { address?: string | null }[]; date?: Date } }).envelope
  const m: SeenMessage = {
    uid: r.uid!,
    messageId: env?.messageId ?? r.message_id,
    raw: headerBlockOf(msg),
    subject: env?.subject ?? r.subject,
    from: env?.from ? addressesOf(env.from) : (r.from_address ? [r.from_address] : []),
    to: env?.to ? [...addressesOf(env.to), ...addressesOf(env.cc)] : (r.to_address ? [r.to_address] : []),
    date: env?.date ? new Date(env.date).toISOString() : r.message_date,
  }
  // 🔴 READ ONCE, STORE EVERYTHING — the same read a live reply gets, so View never opens the mailbox
  // for this message again.
  const bodies = await readBodies(client, m.uid)
  const stored = bodies ? bodyColumns(bodies) : {}
  const patch = async (extra: Record<string, unknown>) => {
    await supabase.from('outreach_messages')
      .update({ ...stored, ...extra, updated_at: new Date().toISOString() })
      .eq('id', r.id)
  }

  // ── OUTLOOK-SENT MAIL ────────────────────────────────────────────────────────────────────────────
  // ⚠️ THE EXISTING RULE, UNCHANGED: logged only when the prospect has already replied, and then only
  // as `reply`. Guessing that a hand-sent email was a chase would put a rung on the §57 ladder.
  if (r.direction === 'outbound') {
    await patch({})
    if (dir.skip.has(prospectId) || !dir.hasReply.has(prospectId)) return
    const logged = await logOutreachContact(supabase, {
      prospect_id: prospectId, channel: 'email', direction: 'outbound', kind: 'reply',
      message: m.subject ?? '', contacted_at: m.date,
    })
    if (logged.ok && logged.id) await supabase.from('outreach_messages').update({ contact_id: logged.id }).eq('id', r.id)
    return
  }

  const h = headersOf(m.raw, m.subject, m.from[0] ?? null)
  await patch({})
  if (dir.skip.has(prospectId)) return
  // 🔴 A REPLY TO A TEST SEND IS IGNORED ENTIRELY, and the `return` is the point here too.
  if (isReplyToTestOnly(h, dir)) { summary.repliesToTest++; return }

  const kind = classifyIncoming(h)
  if (kind === 'auto_reply') { await patch({ status: 'auto_reply' }); return }
  if (kind === 'bounce') {
    const returned = await readReturnedPart(client, m.uid)
    const originalId = bouncedOriginalId(returned, h)
    if (originalId) {
      await supabase.from('outreach_messages')
        .update({ status: 'bounced', updated_at: new Date().toISOString() })
        .eq('message_id', originalId).eq('direction', 'outbound')
    }
    await patch({ status: 'bounce', in_reply_to: originalId })
    return
  }

  const text = textOfBodies(bodies)
  await patch({ status: 'received' })
  const logged = await logOutreachContact(supabase, {
    prospect_id: prospectId,
    channel: 'email',
    direction: 'inbound',
    kind: 'reply',
    message: stripQuotedHistory(text ?? ''),
    contacted_at: m.date,
  })
  if (!logged.ok) { summary.errors.push({ step: 'adopt-log', error: logged.error ?? 'unknown' }); return }
  if (logged.id) await supabase.from('outreach_messages').update({ contact_id: logged.id }).eq('id', r.id)
  dir.hasReply.add(prospectId)
  summary.repliesLogged++
}

// ── REPAIRING REPLIES THAT WERE LOGGED WITHOUT THEIR TEXT ──────────────────────────────────────────
/** How many to repair per run. Each one costs an IMAP fetch, and the run has a 60-second budget. */
const MAX_REPAIRS_PER_RUN = 20

/**
 * Fill in the text of replies that were logged empty.
 *
 * 🔴 THE ROWS THIS EXISTS FOR ARE ALREADY IN THE DATABASE. Between the poll going live and the
 * HTML-fallback fix, every HTML-only reply was logged with an empty message — which the contact
 * popout renders as "No message was recorded with this contact". The email itself was never lost; it
 * is in the mailbox and the Emails list has always shown it. This reads it again and writes down what
 * it says.
 *
 * ⚠️ IT ONLY EVER FILLS A GAP. Both writes are filtered on the column being null or empty, so a
 * message Dominic has since edited, or one a later run already repaired, is never overwritten. That is
 * also what makes it safe to run on every poll: once a row has text it stops matching.
 */
async function repairReplyTexts(
  supabase: SupabaseClient, accounts: AccountSet, summary: PollSummary,
): Promise<void> {
  const { data } = await supabase
    .from('outreach_messages')
    .select('id, contact_id, account, mailbox, uid, text_body')
    .eq('direction', 'inbound')
    .not('contact_id', 'is', null)
    .not('mailbox', 'is', null)
    .not('uid', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200)
  const rows = (data ?? []) as {
    id: string; contact_id: string; account: string | null
    mailbox: string | null; uid: number | null; text_body: string | null
  }[]
  if (!rows.length) return

  // Which of those contact rows actually have nothing in them. One query, not one per row.
  const { data: contacts } = await supabase
    .from('outreach_contacts').select('id, message').in('id', rows.map(r => r.contact_id))
  const empty = new Set(
    ((contacts ?? []) as { id: string; message: string | null }[])
      .filter(c => !(c.message ?? '').trim())
      .map(c => c.id),
  )
  const todo = rows.filter(r => empty.has(r.contact_id)).slice(0, MAX_REPAIRS_PER_RUN)
  if (!todo.length) return

  // Grouped by account so each mailbox is opened once, not once per row.
  const byAccount = new Map<string, typeof todo>()
  for (const r of todo) {
    const a = accountOfRow(r)
    byAccount.set(a, [...(byAccount.get(a) ?? []), r])
  }

  for (const [account, group] of byAccount) {
    const creds = credentialsFor(accounts, account as MailAccount)
    if (!creds) continue
    const client = makeImapClient(creds.user, creds.pass)
    try {
      await client.connect()
      for (const r of group) {
        // 🔴 READ-ONLY, as everything here is: EXAMINE and a peek.
        // 🔴 THE SAME READ AS A LIVE REPLY, so a repaired row gets its stored bodies too and View
        // stops going to the mailbox for it.
        const res = await withReadOnlyMailbox(client, r.mailbox!, async () => readBodies(client, r.uid!))
        const bodies = res.skipped ? null : res.value
        const text = textOfBodies(bodies)
        const logged = stripQuotedHistory(text ?? '')
        // ⚠️ `stripQuotedHistory` NEVER RETURNS EMPTY — it gives the placeholder — so a message that
        // genuinely has no readable text stops being a blank row that reads as "they said nothing".
        const { data: filled } = await supabase
          .from('outreach_contacts')
          .update({ message: logged })
          .eq('id', r.contact_id)
          .or('message.is.null,message.eq.')          // 🔴 only where it is still empty
          .select('id')
        if (bodies && !(r.text_body ?? '').trim()) {
          await supabase.from('outreach_messages')
            .update({ ...bodyColumns(bodies), updated_at: new Date().toISOString() })
            .eq('id', r.id)
            .or('text_body.is.null,text_body.eq.')
        }
        if (filled && filled.length > 0) summary.textsFilled++
      }
    } catch (err) {
      summary.errors.push({ step: `repair:${account}`, error: sanitiseMailError(err) })
    } finally {
      try { await client.logout() } catch { /* already gone */ }
    }
  }
}

// ── FILLING IN THE BODIES OF EVERYTHING RECORDED BEFORE THEY WERE STORED ───────────────────────────
/** How many rows one run gives a stored body. Each is one IMAP read inside a 60-second budget. */
const MAX_BODY_FILLS_PER_RUN = 25

/**
 * Give stored bodies to rows recorded before anything stored them.
 *
 * 🔴 EVERY ROW THE IMPORTER HAS EVER WRITTEN HAS NO BODY. That was deliberate — "the message is
 * already in the mailbox" — and it is exactly why View had to log in to show a three-line reply. This
 * fills them in, newest first, because the newest are the ones Dominic opens.
 *
 * ⚠️ IT ONLY EVER FILLS A GAP, AND IT CANNOT THRASH. The filter is "no HTML, no text AND no
 * attachment list": once a row has been looked at, `attachments` is an array — `[]` when the message
 * genuinely has neither body part — so it stops matching and is never read again. Without that last
 * condition a message with no text parts at all would be re-read on every run forever.
 */
async function fillMissingBodies(
  supabase: SupabaseClient, accounts: AccountSet, summary: PollSummary,
): Promise<void> {
  const { data } = await supabase
    .from('outreach_messages')
    .select('id, account, mailbox, uid')
    .is('html_body', null)
    .is('text_body', null)
    .is('attachments', null)
    .not('mailbox', 'is', null)
    .not('uid', 'is', null)
    .order('message_date', { ascending: false })
    .limit(MAX_BODY_FILLS_PER_RUN)
  const rows = (data ?? []) as { id: string; account: string | null; mailbox: string | null; uid: number | null }[]
  if (!rows.length) return

  const byAccount = new Map<string, typeof rows>()
  for (const r of rows) {
    const a = accountOfRow(r)
    byAccount.set(a, [...(byAccount.get(a) ?? []), r])
  }

  for (const [account, group] of byAccount) {
    const creds = credentialsFor(accounts, account as MailAccount)
    if (!creds) continue
    const client = makeImapClient(creds.user, creds.pass)
    try {
      await client.connect()
      for (const r of group) {
        // 🔴 READ-ONLY, as everything here is: EXAMINE and a peek. Filling a body must not mark a
        // prospect's email read in Dominic's Outlook.
        const res = await withReadOnlyMailbox(client, r.mailbox!, async () => readBodies(client, r.uid!))
        const bodies = res.skipped ? null : res.value
        if (!bodies) continue
        const { data: filled } = await supabase
          .from('outreach_messages')
          .update({ ...bodyColumns(bodies), updated_at: new Date().toISOString() })
          .eq('id', r.id)
          .is('html_body', null)
          .is('text_body', null)     // 🔴 still only where there is nothing to overwrite
          .select('id')
        if (filled && filled.length > 0) summary.bodiesFilled++
      }
    } catch (err) {
      summary.errors.push({ step: `bodies:${account}`, error: sanitiseMailError(err) })
    } finally {
      try { await client.logout() } catch { /* already gone */ }
    }
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
