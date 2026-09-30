// app/api/admin/outreach/mail-send/route.ts
// Send ONE outreach email, which Dominic has read, from his own mailbox, threaded onto the last one.
//
// 🔴 MANUAL ONLY. There is no scheduler, no queue drain and no automatic retry in this route or anywhere
// that calls it. One press of Send sends one email. Build 2 adds the reply poller; it is not here.
//
// ── THE ORDER OF OPERATIONS, AND WHY IT IS THIS ORDER ───────────────────────────────────────────────
//   1. every refusal, BEFORE the SMTP server is contacted;
//   2. the row is inserted as `sending` WITH ITS Message-ID — so a crash between here and the server
//      leaves evidence, and a double submit collides on `idempotency_key` instead of sending twice;
//   3. the send;
//   4. the contact log, through the SHARED path Log-only uses;
//   5. the Sent copy — found or appended, and never fatal.
// A failure at 4 or 5 never re-sends: the mail has gone, and the row says what is outstanding.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from '@/lib/auth/admin'
import { malformedTokensIn, unresolvedIn, isMustResolveToken } from '@/lib/outreach-template-render'
import { logOutreachContact } from '@/lib/outreach-contact-log'
import { OUTREACH_FROM_ADDRESS } from '@/lib/outreach-mail-config'
import { composeRaw } from '@/lib/outreach-mail-envelope'
// 🔴 THE SEND ITSELF MOVED OUT (29 September 2026) so the reply poll's automatic retry uses the same
// code rather than a copy of it. This route still owns every refusal; it no longer owns the socket.
import { deliver, fileSentCopy } from '@/lib/outreach-mail-deliver'
import {
  buildMessage, newMessageId, replySubject,
  type QuotedMessage,
} from '@/lib/outreach-mail-message'
import {
  makeImapClient, fetchBodiesByUid, fetchMessageForView, sanitiseMailError,
} from '@/lib/outreach-mail-box'
import {
  hasStoredBody, parseAttachments, isTruncated, capHtml, bodyColumns,
} from '@/lib/outreach-mail-bodies'
import { messagesTableProbe, dbDetail } from '@/lib/outreach-messages-table'
import { readFromName } from '@/lib/outreach-settings-read'
import { validateDoc, docPlainText, literalTokenRefusal } from '@/lib/outreach-doc'
import {
  resolveAccounts, accountForSend, credentialsFor, accountOfRow, type AccountSet,
} from '@/lib/outreach-mail-accounts'
import { prospectRefusal, retryRefusal, startsNewThread } from '@/lib/outreach-send-rules'
import {
  parseOutboundAttachments, attachmentSetRefusal, type OutboundAttachment,
} from '@/lib/outreach-attachments'
import { loadAttachments } from '@/lib/outreach-attachment-store'
import { sanitiseQuotedHtml } from '@/lib/outreach-quote-sanitise'
import {
  // ⚠️ `REPLY_KIND` IS NO LONGER IMPORTED HERE. The decision moved into `loggedKindFor`, which owns
  // the word and the rule together; importing the constant to not use it would read as though this
  // file still made the choice.
  replyRecipientRefusal, replyParentRefusal, replyRecipientFor, type ReplyParent,
} from '@/lib/outreach-reply-rules'
import { nextStep, type StepContact } from '@/lib/outreach-step'
import { CONTACT_KINDS } from '@/lib/outreach'
import { evaluateGuards, loggedKindFor, type Guard, type PriorSend } from '@/lib/outreach-sequence'
import { recordSendOverride } from '@/lib/outreach-events'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const refuse = (message: string, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, refusal: message, ...extra }, { status: 200 })

/**
 * 🔴 THE CAPABILITY PROBE. The migration is applied BY HAND, so this route must work out whether the
 * table exists rather than assume it. A `head` count costs nothing and answers definitively; PGRST205
 * (not in the schema cache) and 42P01 (no such table) both mean "not applied yet", and both must read as
 * a feature that is OFF rather than as an error page.
 */
/** The probe, bound to this route's client. The decision itself lives in `lib/outreach-messages-table`. */
async function messagesTable() {
  return messagesTableProbe(async () => {
    const { error } = await supabase.from('outreach_messages').select('id').limit(1)
    return { error }
  })
}

/** One `outreach_messages` row, as this route reads it back. */
interface Row {
  id: string; prospect_id: string; direction: string; status: string; is_test: boolean
  /** Which mailbox this message lives in. See lib/outreach-mail-accounts.ts. */
  account?: string | null
  /** Not a column — attached in-process so `mailFor` can put it on the From header. */
  from_name?: string | null
  message_id: string; in_reply_to: string | null; references: string | null
  subject: string | null; to_address: string | null; message_date: string | null
  html_body: string | null; text_body: string | null; sent_copy: string; attempts: number
  /** 🔴 PATHS, NOT BYTES. `parseOutboundAttachments` turns it into something the store can fetch. */
  attachments?: unknown
}

interface ViewRow {
  id: string; prospect_id: string; direction: string; status: string; source: string
  subject: string | null; from_address: string | null; to_address: string | null
  message_date: string | null; mailbox: string | null; uid: number | null; uidvalidity: number | null
  html_body: string | null; text_body: string | null; account?: string | null
  /** 🔴 `null` means "never looked"; an array means "looked" — `[]` when there are none. */
  attachments: unknown
}

interface ParentRow {
  message_id: string; references: string | null; subject: string | null; to_address: string | null
  message_date: string | null; html_body: string | null; text_body: string | null
  mailbox: string | null; uid: number | null; direction?: string | null; account?: string | null
}

/**
 * The email a chase replies to: the most recent NON-TEST message to or from this prospect.
 *
 * 🔴 EITHER DIRECTION, AND THAT IS THE CHANGE. It used to be outbound only, which meant a chase sent
 * after a prospect had replied threaded onto Dominic's own last email and quoted it — ignoring the
 * reply sitting between them. A conversation is a conversation; the latest message in it is the one a
 * reply attaches to, whoever sent it. `received` joins `sent` and `uncertain` for the same reason.
 * ⚠️ TESTS ARE EXCLUDED. A test goes to Dominic's own address and is not part of the correspondence.
 * 🔴 ONE LOOKUP, THREE CALLERS — the send, the GET that tells the compose window it is writing a chase,
 * and the `quoted` action that fetches the body for the Show toggle. Three copies of this ordering
 * would eventually disagree about WHICH email a reply attaches to, and the operator would be told one
 * thing on screen and send another.
 */
async function threadParent(prospectId: string): Promise<ParentRow | undefined> {
  const { data } = await supabase
    .from('outreach_messages')
    .select('message_id, "references", subject, to_address, message_date, html_body, text_body, mailbox, uid, direction, account')
    .eq('prospect_id', prospectId).eq('is_test', false)
    .in('status', ['sent', 'uncertain', 'received'])
    .order('message_date', { ascending: false, nullsFirst: false })
    .limit(1)
  return (data ?? [])[0] as ParentRow | undefined
}

/**
 * The parent's own body, for the quote block.
 *
 * 🔴 A SYSTEM-SENT PARENT STORED IT; AN IMPORTED ONE DID NOT. The importer records an Outlook message's
 * headers and leaves the body in the mailbox, where it already is — so it is read back by uid,
 * READ-ONLY (EXAMINE, and `fetch` emits `BODY.PEEK[…]`, so quoting an email does not mark it seen).
 * ⚠️ ONE IMPLEMENTATION FOR BOTH CALLERS. The send needs this to build the quote; the compose window's
 * Show toggle needs it to display the same thing. If they read it differently, the operator would be
 * shown one email and quote another.
 */
async function parentBodies(
  parent: ParentRow, accounts: AccountSet,
): Promise<{ html: string | null; text: string | null }> {
  if (parent.html_body) return { html: parent.html_body, text: parent.text_body }
  if (!parent.mailbox || parent.uid == null) return { html: null, text: null }
  // 🔴 THE ROW'S OWN ACCOUNT. `mailbox` + `uid` mean nothing outside the mailbox they were read from.
  const creds = credentialsFor(accounts, accountOfRow(parent))
  if (!creds) return { html: null, text: null }
  const c = makeImapClient(creds.user, creds.pass)
  try {
    await c.connect()
    return await fetchBodiesByUid(c, parent.mailbox, parent.uid)
  } catch { return { html: null, text: null } } finally {
    try { await c.logout() } catch { /* already gone */ }
  }
}

/**
 * The bytes of a stored row, attachments and all.
 *
 * 🔴 RETRY AND SAVE-TO-SENT MUST PRODUCE THE MESSAGE THAT WAS SENT, NOT A MESSAGE LIKE IT. Both
 * re-compose from the row; before attachments existed that was the stored Message-ID and the two
 * bodies, and it was enough. Now the row also names files, and a re-composition that skipped them
 * would file a copy in Sent with the attachments missing — a Sent folder that disagrees with what the
 * prospect received, which is precisely the record Dominic goes to when something is disputed.
 * ⚠️ IT REFUSES RATHER THAN DROPPING ONE. See `loadAttachments`.
 */
async function attachmentsForRow(row: { attachments?: unknown }): Promise<
  { ok: true; attachments: { filename: string; contentType: string; content: Buffer }[] } | { ok: false; refusal: string }
> {
  const stored = parseOutboundAttachments(row.attachments)
  if (!stored.length) return { ok: true, attachments: [] }
  return loadAttachments(supabase, stored)
}

export async function GET(req: NextRequest) {
  // The counter and the per-prospect list the compose window and the modal read.
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })
  const probe = await messagesTable()
  if (!probe.ready) return NextResponse.json({ ok: false, migrationApplied: false, refusal: probe.refusal })
  const prospectId = req.nextUrl.searchParams.get('prospect_id')
  let messages: unknown[] = []
  let thread: { subject: string; replySubject: string; date: string | null } | null = null
  if (prospectId) {
    const { data } = await supabase
      .from('outreach_messages')
      .select('id, direction, status, is_test, source, subject, to_address, message_date, sent_copy, attempts, last_error, created_at')
      .eq('prospect_id', prospectId)
      .order('created_at', { ascending: false })
    messages = data ?? []
    // 🔴 THE PARENT, FROM THE DATABASE ONLY. The compose window needs three things before a word is
    // typed: whether this is a chase, what the subject will be, and what to say the reply attaches to.
    // None of that needs the mailbox, so opening the window opens no IMAP connection — the quoted BODY
    // is fetched only if Dominic presses Show.
    // 🔴 THE WINDOW ASKS WITH THE RUNG IT IS ABOUT TO SEND, and gets the same answer the send will
    // give. Without the `kind` the GET could only answer "there is an earlier email", which is the
    // question that produced a first contact titled "Re: Test email to me again".
    const kind = req.nextUrl.searchParams.get('kind')
    if (!startsNewThread(kind)) {
      const parent = await threadParent(prospectId)
      if (parent) {
        thread = {
          subject: parent.subject ?? '',
          replySubject: replySubject(parent.subject ?? ''),
          date: parent.message_date,
        }
      }
    }
  }
  return NextResponse.json({ ok: true, migrationApplied: true, messages, thread })
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin(req))) return NextResponse.json({ error: 'Unauthorised' }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad body' }, { status: 400 }) }

  const action = String(body.action ?? 'send')
  const prospectId = String(body.prospect_id ?? '')
  const isTest = body.is_test === true
  const idempotencyKey = typeof body.idempotency_key === 'string' ? body.idempotency_key : null

  // ── REFUSAL 1a · the table ───────────────────────────────────────────────────────────────────────
  const probe = await messagesTable()
  if (!probe.ready) return refuse(probe.refusal, { migrationApplied: false })

  // ── REFUSAL 1b · the credentials ─────────────────────────────────────────────────────────────────
  // 🔴 THE SEND ASKS FOR THE PRIMARY ACCOUNT AND CANNOT BE HANDED THE LEGACY ONE. `accountForSend`
  // returns `dominic` when it is configured and `hello` otherwise — which is the fallback that makes
  // this deploy a no-op until Dominic adds the variables. There is no parameter here through which a
  // caller could name `hello` once `dominic` exists.
  const accounts = resolveAccounts()
  const sender = accountForSend(accounts)
  if (!sender) return refuse('The mailbox credentials are not set on this environment, so nothing can be sent.')
  const mailUser = sender.user
  const mailPass = sender.pass
  // ⚠️ NEVER RETURNED, NEVER LOGGED. Only its presence is ever reported.
  const testRecipient = process.env.OUTREACH_TEST_RECIPIENT
  if (isTest && !testRecipient) return refuse('OUTREACH_TEST_RECIPIENT is not set on this environment, so a test cannot be sent.')

  // ── RETRY — the same row, the same Message-ID, never a new one ───────────────────────────────────
  if (action === 'retry') {
    const rowId = String(body.message_row_id ?? '')
    const { data: existing } = await supabase.from('outreach_messages').select('*').eq('id', rowId).maybeSingle()
    const row = existing as Row | null
    if (!row) return refuse('That message is not in the log any more.')
    const stop = retryRefusal(row, body.confirm_uncertain === true)
    if (stop) return refuse(stop.refusal, stop.needsConfirm ? { needsConfirm: true } : {})
    // 🔴 A RETRY USES THE ROW'S OWN ACCOUNT. The message was composed against one mailbox's thread and
    // its Sent copy belongs beside the rest of that conversation; sending a legacy row's retry from the
    // new mailbox would file the copy in the wrong Sent folder and orphan the thread.
    const rowCreds = credentialsFor(accounts, accountOfRow(row))
    if (!rowCreds) return refuse(`The credentials for the ${accountOfRow(row)} mailbox are not set on this environment.`)
    // 🔴 THE SAME FILES, FROM THE SAME PATHS. A retry of a message that carried the plans PDF carries
    // the plans PDF; the bytes come back out of the bucket, so the composed message is identical.
    const retryFiles = await attachmentsForRow(row)
    if (!retryFiles.ok) return refuse(retryFiles.refusal)
    const retried = await deliver(supabase,
      { ...row, from_name: await readFromName(supabase), attachments: retryFiles.attachments },
      { mailUser: rowCreds.user, mailPass: rowCreds.pass, isTest: row.is_test, testRecipient })
    return NextResponse.json(retried.payload)
  }

  // ── "QUOTED" — the earlier email's body, for the Show toggle in the compose window ─────────────
  // 🔴 READ-ONLY, AND ONLY WHEN ASKED. Opening the compose window must not open an IMAP connection:
  // most of the time Dominic does not press Show, and a connect on every open would make the window
  // slow for a panel nobody looked at. Nothing is written and nothing is sent on this path.
  if (action === 'quoted') {
    if (!prospectId) return NextResponse.json({ error: 'prospect_id required' }, { status: 400 })
    const parent = await threadParent(prospectId)
    if (!parent) return refuse('There is no earlier email to quote.')
    // 🔴 THE QUOTE IS READ FROM THE PARENT'S OWN MAILBOX. A chase to a prospect whose history is in
    // hello@ still quotes it correctly after the switch.
    const bodies = await parentBodies(parent, accounts)
    if (!bodies.html) {
      return refuse("I can't find the earlier email to reply to — run Import past emails, or check this truck's email address.")
    }
    return NextResponse.json({
      ok: true, html: bodies.html, subject: parent.subject, date: parent.message_date,
    })
  }

  // ── "SAVE TO SENT" — repeat the filing sequence for a row whose copy is missing ────────────────
  // 🔴 IT NEVER SENDS. The email has already gone; this is about Dominic's own Sent folder and
  // nothing else. It re-composes the SAME bytes from the stored row — same Message-ID, same headers,
  // same bodies — searches Sent twice as the send does, and appends only if the copy really is not
  // there. Running it on a row whose copy arrived late finds it and records `server_filed`.
  if (action === 'save_to_sent') {
    const rowId = String(body.message_row_id ?? '')
    const { data: existing } = await supabase.from('outreach_messages').select('*').eq('id', rowId).maybeSingle()
    const row = existing as Row | null
    if (!row) return refuse('That message is not in the log any more.')
    if (row.status !== 'sent') return refuse('Only a message the server accepted can be filed in Sent.')
    if (row.sent_copy !== 'absent') return refuse('That message already has a copy in Sent.')
    let raw: Buffer
    // The same bytes the send produced, which means the same display name.
    // 🔴 THE SAME BYTES MEANS THE SAME ATTACHMENTS TOO. Without this the filed copy would be the
    // message minus its files, and the Sent folder would disagree with the prospect's inbox.
    const copyFiles = await attachmentsForRow(row)
    if (!copyFiles.ok) return refuse(copyFiles.refusal)
    const rowWithName = { ...row, from_name: await readFromName(supabase), attachments: copyFiles.attachments }
    try { raw = await composeRaw(rowWithName) } catch (err) { return refuse(`That message could not be rebuilt (${sanitiseMailError(err)}).`) }
    // 🔴 FILED IN THE ROW'S OWN ACCOUNT. A legacy message's copy belongs in hello@'s Sent folder,
    // beside the thread it is part of — not in the new mailbox where nothing else of that conversation
    // is. ⚠️ This is the one path on which the legacy account is still APPENDED to, and it is reachable
    // only for a row that was SENT from it before the switch.
    const copyCreds = credentialsFor(accounts, accountOfRow(row))
    if (!copyCreds) return refuse(`The credentials for the ${accountOfRow(row)} mailbox are not set on this environment.`)
    const copy = await fileSentCopy(rowWithName, raw, row.message_date ? new Date(row.message_date) : new Date(),
      { mailUser: copyCreds.user, mailPass: copyCreds.pass })
    await supabase.from('outreach_messages').update({
      sent_copy: copy.sentCopy, mailbox: copy.mailbox, uid: copy.uid, uidvalidity: copy.uidvalidity,
      last_error: copy.sentCopy === 'absent' ? `sent copy: ${copy.reason}` : null,
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)
    if (copy.sentCopy === 'absent') return refuse(`Still not in Sent — ${copy.reason}`)
    return NextResponse.json({
      ok: true, sent_copy: copy.sentCopy,
      message: copy.sentCopy === 'server_filed' ? 'It was already there — the server had filed it.' : 'Saved to your Sent folder.',
    })
  }

  // ── "VIEW" — one whole email, from the database ────────────────────────────────────────────────
  // 🔴 STORED BODIES FIRST, AND A LIVE READ IS NOW THE EXCEPTION THAT REPAIRS ITSELF. Every open used
  // to connect to IMAP, log in, select a mailbox and download the message, which is why View took
  // seconds; the mailbox is the source of truth for what ARRIVED and a poor one for "show me that
  // again". The poll, the importer and adoption all write the bodies down now, so this reads Postgres.
  // ⚠️ WHEN THERE IS NOTHING STORED IT IS READ LIVE **AND SAVED**. Otherwise the same row would be
  // fetched again on every open forever — a slow path that never gets faster is a slow path.
  // ⚠️ READ-ONLY EITHER WAY: EXAMINE, and `fetch` emits `BODY.PEEK[…]`, so opening an email here does
  // not mark it read in Outlook.
  // ⚠️ ATTACHMENTS ARE NAMED, NEVER FETCHED, AND NEVER STORED AS CONTENT. Only the body parts are
  // asked for; the list of names, types and sizes is metadata off the body structure.
  // ⚠️ AND STORED HTML IS STILL SOMEBODY ELSE'S MARKUP. It is rendered in the same `sandbox=""`
  // iframe it always was — coming out of our own database is not a claim about who wrote it.
  if (action === 'view') {
    const rowId = String(body.message_row_id ?? '')
    const { data: existing } = await supabase.from('outreach_messages')
      .select('id, prospect_id, direction, status, source, subject, from_address, to_address, message_date, mailbox, uid, uidvalidity, html_body, text_body, attachments, account')
      .eq('id', rowId).maybeSingle()
    const row = existing as ViewRow | null
    if (!row) return refuse('That message is not in the log any more.')
    // 🔴 THE HEADER LINE COMES FROM THE STORED COLUMNS, on both paths. From, To, Date and Subject were
    // recorded when the message was, and reading them from the mailbox to display them would be a
    // round trip to learn what we already wrote down.
    const head = {
      from: row.from_address, to: row.to_address, subject: row.subject,
      date: row.message_date, direction: row.direction, source: row.source,
      // 🔴 THE VIEWER NEEDS IT TO ASK FOR A DOWNLOAD LINK, and the attachments route checks the path
      // against it. ⚠️ An INBOUND row's attachments carry no `storagePath`, so no link is offered —
      // those files were never downloaded and there is nothing to hand over.
      prospect_id: row.prospect_id,
    }
    if (hasStoredBody(row)) {
      return NextResponse.json({
        ok: true, ...head,
        // 🔴 THE REAL LIST, NOT `[]`. This hard-coded an empty array, so a stored message with three
        // attachments said it had none — and the mailbox path beside it returned them properly.
        attachments: parseAttachments(row.attachments),
        html: row.html_body, text: row.text_body, from_mailbox: false,
        truncated: isTruncated(row.html_body),
      })
    }
    if (!row.mailbox || row.uid == null) {
      return refuse('This email has no stored copy and no mailbox reference, so there is nothing to open. Run Import past emails.')
    }
    // 🔴 VIEW OPENS THE ROW'S OWN ACCOUNT. An email imported from hello@ in September still opens
    // after the switch, because it is read from hello@ — where its uid still means what it meant.
    const viewCreds = credentialsFor(accounts, accountOfRow(row))
    if (!viewCreds) return refuse(`The credentials for the ${accountOfRow(row)} mailbox are not set on this environment, so that email cannot be opened.`)
    const c = makeImapClient(viewCreds.user, viewCreds.pass)
    try {
      await c.connect()
      const fetched = await fetchMessageForView(c, row.mailbox, row.uid, row.uidvalidity)
      if (!fetched.ok) return refuse(fetched.error)
      const capped = capHtml(fetched.html)
      // 🔴 SAVE WHAT WAS JUST READ. The next open of this row costs a query. ⚠️ Only where there is
      // nothing to overwrite: a stored body always wins over the mailbox's copy.
      await supabase.from('outreach_messages')
        .update({
          ...bodyColumns({ html: capped.html, text: fetched.text, attachments: fetched.attachments, truncated: capped.truncated }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .is('html_body', null)
        .is('text_body', null)
      return NextResponse.json({
        ok: true, ...head, attachments: fetched.attachments,
        html: capped.html, text: fetched.text, from_mailbox: true, mailbox: row.mailbox,
        truncated: capped.truncated,
      })
    } catch (err) {
      return refuse(`That email could not be read from the mailbox (${sanitiseMailError(err)}).`)
    } finally { try { await c.logout() } catch { /* already gone */ } }
  }

  // ── "LOG IT" — the email HAS gone and the contact log missed it ─────────────────────────────────
  // 🔴 THIS SENDS NOTHING. It exists because `sent, not logged` is a real outcome — the SMTP server
  // accepted the message and the database write after it failed — and the wrong fix for it is a retry,
  // which would put a second copy of a cold email in a prospect's inbox to repair a missing ROW.
  if (action === 'log_only') {
    const rowId = String(body.message_row_id ?? '')
    const { data: existing } = await supabase.from('outreach_messages').select('*').eq('id', rowId).maybeSingle()
    const row = existing as (Row & { contact_id: string | null; last_error: string | null }) | null
    if (!row) return refuse('That message is not in the log any more.')
    if (row.status !== 'sent') return refuse('Only a message the server accepted can be logged.')
    if (row.is_test) return refuse('A test send is not a contact, so it is never logged.')
    if (row.contact_id) return refuse('That message is already logged.')
    /* 🔴 THE STEP IS VALIDATED HERE, BECAUSE THIS IS NOW A BUTTON AND NOT ONLY A REPAIR. "Record as
     * Chase 1" writes a rung for an email sent from Outlook (the sequence report's §0c: those
     * arrive with no step at all). An unrecognised value would write a contact row `nextStep` cannot
     * read, and one blind row makes the WHOLE ladder report "can't tell" — the D1 rule. `null` is
     * still allowed, because that is what the original repair path wrote and it is a fact, not a
     * guess. */
    const recordKind = typeof body.kind === 'string' ? body.kind : null
    if (recordKind !== null && !(CONTACT_KINDS as readonly string[]).includes(recordKind)) {
      return refuse(`"${recordKind}" is not a step, so it was not recorded.`)
    }
    const { data: lp } = await supabase
      .from('outreach_prospects')
      .select('id, lead_type_at_first_contact, hu_ordering, hu_map, discovery_trucks(show_on_vf, excluded)')
      .eq('id', row.prospect_id).maybeSingle()
    const lpr = lp as unknown as {
      lead_type_at_first_contact: string | null; hu_ordering: boolean | null; hu_map: boolean | null
      discovery_trucks: { show_on_vf: boolean | null; excluded: boolean | null } | null
    } | null
    const logged = await logOutreachContact(
      supabase,
      {
        prospect_id: row.prospect_id, channel: 'email', direction: 'outbound',
        kind: recordKind,
        message: row.text_body ?? '', contacted_at: row.message_date,
      },
      {
        prospect: {
          hu_ordering: lpr?.hu_ordering ?? null, hu_map: lpr?.hu_map ?? null,
          show_on_vf: lpr?.discovery_trucks?.show_on_vf ?? null,
          excluded: lpr?.discovery_trucks?.excluded ?? null,
          futureEventCount: null,
          lead_type_at_first_contact: lpr?.lead_type_at_first_contact ?? null,
        },
        hasLeadTypeFreeze: true,
      },
    )
    if (!logged.ok) return refuse(`That could not be logged: ${logged.error ?? 'unknown'}`)
    await supabase.from('outreach_messages')
      .update({ contact_id: logged.id ?? null, last_error: null, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    return NextResponse.json({ ok: true, logged: true, ...(logged.warning ? { warning: logged.warning } : {}) })
  }

  if (!prospectId) return NextResponse.json({ error: 'prospect_id required' }, { status: 400 })

  // ── REFUSAL 6 · the idempotency key was already used ─────────────────────────────────────────────
  // Checked BEFORE anything is built, so a double submit costs one select and returns the first send's
  // verdict rather than producing a second email.
  if (idempotencyKey) {
    const { data: prior } = await supabase
      .from('outreach_messages').select('id, status, sent_copy, last_error').eq('idempotency_key', idempotencyKey).maybeSingle()
    if (prior) return NextResponse.json({ ok: true, duplicate: true, ...(prior as object) })
  }

  // ── THE PROSPECT, ITS TRUCK AND ITS LADDER ───────────────────────────────────────────────────────
  const { data: pRow, error: pErr } = await supabase
    .from('outreach_prospects')
    // The lead-type inputs come with it: `shouldFreezeLeadType` needs them at rung 1, and reading them
    // here is one round trip rather than a second select after the send.
    .select('id, stage, do_not_contact, lead_type_at_first_contact, discovery_truck_id, hu_ordering, hu_map, discovery_trucks(name, contact_email, hatchgrab_truck_id, show_on_vf, excluded)')
    .eq('id', prospectId).maybeSingle()
  if (pErr || !pRow) return refuse('That prospect could not be read.')
  const p = pRow as unknown as {
    id: string; stage: string | null; do_not_contact: boolean | null; lead_type_at_first_contact: string | null
    hu_ordering: boolean | null; hu_map: boolean | null
    discovery_trucks: {
      name: string | null; contact_email: string | null; hatchgrab_truck_id: string | null
      show_on_vf: boolean | null; excluded: boolean | null
    } | null
  }
  const truck = p.discovery_trucks

  // ── REFUSALS 2 AND 3 · do-not-contact, no address, and a linked HatchGrab truck ──────────────────
  // All three live in `lib/outreach-send-rules`, where the harness can run them. The linked-truck rule is
  // what keeps a LIVE TRADING TRUCK unreachable from this route.
  const blocked = prospectRefusal({
    do_not_contact: p.do_not_contact ?? null,
    contact_email: truck?.contact_email ?? null,
    hatchgrab_truck_id: truck?.hatchgrab_truck_id ?? null,
  })
  if (blocked) return refuse(blocked.refusal)
  let toAddress = (truck?.contact_email ?? '').trim()

  // ── A REPLY: WHICH MESSAGE, AND WHO IT GOES BACK TO ─────────────────────────────────────────────
  // 🔴 THE ONLY PATH ON WHICH THE BROWSER INFLUENCES THE RECIPIENT, AND IT IS A CLOSED SET. Every
  // other send addresses `discovery_trucks.contact_email`, read here, so a stale address on screen
  // cannot become the envelope. A reply has to go back to whoever actually wrote — which may be a
  // different mailbox at the same business — so the address is accepted only when it is the truck's
  // own, or the From of a non-test inbound message ALREADY RECORDED for this prospect.
  // 🔎 `lib/outreach-reply-rules.ts` holds both refusals and the harness stands on them.
  /* ⚠️ THE TICKBOX, AND IT ONLY EVER TAKES THE QUOTE AWAY. The threading headers are set either
   * way — see `buildMessage`. Absent ⇒ true, which is what every earlier client sends. */
  const includeQuote = body.include_quote !== false
  const replyToId = typeof body.reply_to_message_id === 'string' ? body.reply_to_message_id : ''
  let replyParent: ReplyParent | null = null
  if (replyToId) {
    const { data: rp } = await supabase.from('outreach_messages')
      .select('id, prospect_id, is_test, direction, message_id, "references", subject, from_address, to_address, message_date, html_body, text_body')
      .eq('id', replyToId).maybeSingle()
    replyParent = (rp ?? null) as ReplyParent | null
    const stop = replyParentRefusal(replyParent, prospectId)
    if (stop) return refuse(stop.refusal)

    // The address the window showed, checked against what the server holds.
    const { data: inboundRows } = await supabase.from('outreach_messages')
      .select('from_address').eq('prospect_id', prospectId).eq('direction', 'inbound').eq('is_test', false)
    const known = ((inboundRows ?? []) as { from_address: string | null }[]).map(r => r.from_address)
    // ⚠️ THE SAME RULE THE PAGE USES, from one place — see `replyRecipientFor`.
    const wanted = typeof body.to === 'string' && body.to.trim()
      ? body.to.trim()
      : (replyRecipientFor(replyParent) ?? '')
    const bad = replyRecipientRefusal({ to: wanted, contactEmail: truck?.contact_email ?? null, knownInboundFroms: known })
    if (bad) return refuse(bad.refusal)
    toAddress = wanted.trim()
  }

  const subjectIn = String(body.subject ?? '').trim()

  // ── THE DOCUMENT · validated against the schema, never passed through ───────────────────────────
  // 🔴 THE BROWSER SENDS A DOCUMENT, NOT HTML, AND THE SERVER GENERATES EVERY BYTE OF MARKUP. See
  // `lib/outreach-doc.ts`: HTML from a browser is an open set and "sanitise it" is a blocklist, which
  // is the wrong shape of defence for something emailed to strangers under Dominic's own name.
  // ⚠️ THE EDITOR ENFORCES THE SAME SCHEMA, AND THAT IS NOT WHY THIS IS SAFE. The document arrives
  // over HTTP; this is the guard.
  const parsed = validateDoc(body.document)
  if (!parsed.ok) return refuse(`That message could not be sent — ${parsed.error}.`)
  const docIn = parsed.doc
  const bodyIn = docPlainText(docIn)
  if (!bodyIn.trim()) return refuse('There is no message body to send.')

  // 🔴 A LITERAL TOKEN IS A REFUSAL. Nothing expands `{{signature}}` at send time any more, so it
  // would be emailed as those thirteen characters.
  const literal = literalTokenRefusal(docIn)
  if (literal) return refuse(literal)

  // ── REFUSAL 4 · the §58 guards, IMPORTED, not re-implemented ─────────────────────────────────────
  // 🔴 `malformedTokensIn` KEYS OFF THE DELIMITERS, NOT THE TOKEN PATTERN — §58.2 records why: a guard
  // that shares the resolver's regex is blind to exactly the mistakes the resolver cannot consume, and
  // `{{truck name}}` shipped on an active template because three guards shared one pattern. A second
  // copy here would be a fourth reader of that same blind spot.
  const whole = `${subjectIn}\n${bodyIn}`   // `bodyIn` is the DOCUMENT's text — the guards are unchanged
  const malformed = malformedTokensIn(whole)
  if (malformed.length) return refuse(`The message still contains a malformed token: ${malformed.join(', ')}`)
  const mustResolve = unresolvedIn(whole).filter(isMustResolveToken)
  if (mustResolve.length) return refuse(`The message needs a value that could not be resolved: ${mustResolve.join(', ')}`)

  // 🔴 THERE IS NO SEND-COUNT CHECK HERE, AND THERE IS NOT ONE ANYWHERE ELSE IN THIS FILE. A daily cap
  // of 30 stood between these two blocks until 29 September 2026; `lib/outreach-send-rules.ts` records
  // why it went. Nothing counts sends now — least of all a test send, which never did count and, with
  // the cap gone, has nothing left that could refuse it on volume.

  // 🔴 THE SEND-TIME SIGNATURE EXPANSION WAS HERE AND IS GONE. It read `outreach_settings`, refused a
  // send whose template named a row that was missing, and expanded `{{signature}}` / `{{opt_out}}`
  // into the message. None of that is right any more: the signature is expanded into the EDITOR when
  // the template is chosen, so it is visible and editable, and the server appends nothing at all.
  // The one setting the send still reads is the sender's display name, below — and that one can never
  // refuse, because its absence is the behaviour that shipped before it existed.

  // ── THE SENDER'S DISPLAY NAME ───────────────────────────────────────────────────────────────────
  // ⚠️ READ SERVER-SIDE, AND IT NEVER REFUSES. Recipients were seeing
  // "dominic@hatchgrab.com <dominic@hatchgrab.com>" because there was no name to show. An absent or
  // empty row falls back to the bare address — exactly what shipped before — so a settings problem
  // costs a display name and never an email.
  const fromName = await readFromName(supabase)
  /** Set by the guard block below from the server's own `nextStep`; null ⇒ fall back to the client's. */
  let derivedKind: string | null = null
  /**
   * 🔴 HAS THIS PROSPECT WRITTEN BACK? It is the difference between a conversation and a sequence,
   * and it decides two things: whether a reply is logged as `reply` or as the rung it really is, and
   * whether the sequence guards apply at all.
   * ⚠️ REPLYING TO MY OWN EMAIL IS NOT A CONVERSATION. Following up on a chase by answering the copy
   * in my Sent folder is still a chase — it is the step the ladder is on, it carries that step's
   * follow-up, and every guard applies to it. Only an INBOUND message makes it a reply.
   */
  let inConversation = false

  // ── THREADING — a chase is a REPLY, or it is refused; a FIRST CONTACT never is ───────────────────
  // 🔴 A REPLY IS `reply`, DECIDED HERE AND NOT BY THE BROWSER. `reply` is deliberately NOT one of
  // `CONTACT_KINDS`, so §57 counts no rung for it and the chase sequence is neither advanced nor
  // restarted by answering somebody. A client that sent `kind: '2_chase_1'` alongside a
  // `reply_to_message_id` would otherwise put a rung on the ladder for a courtesy reply.
  // ── 🔴 THE SEND-TIME GUARDS. IN THE SERVER, SO EVERY PATH GETS THEM ─────────────────────────────
  // The composer may show the same answers early; the DECISION is here. A second tab, an older
  // client, a repeated fetch or a curl all hit this wall. The step is RE-DERIVED from the prospect's
  // own rows — `nextStep`, the one derivation — rather than trusted from the request, so a client
  // that says "first contact" about a truck already chased twice does not get to.
  // ⚠️ A TEST SEND BYPASSES EVERY GUARD AND COUNTS TOWARDS NOTHING (3f): it goes to Dominic.
  const overrides: string[] = Array.isArray(body.override)
    ? (body.override as unknown[]).filter((x): x is string => typeof x === 'string') : []
  let firedGuards: Guard[] = []
  if (!isTest) {
    const { data: cRows } = await supabase
      .from('outreach_contacts').select('contacted_at, created_at, direction, kind, channel')
      .eq('prospect_id', prospectId)
    const contacts = (cRows ?? []) as (StepContact & { created_at?: string | null })[]
    // 🔴 THE MAILBOX AS WELL AS THE LADDER. An email sent from Outlook reaches the contact log only
    // when the prospect has already replied, and then only as `reply` — so a chase typed by hand
    // leaves a message row and no rung (report §0c). `contact_id` is the join: a message this system
    // sent already has one, and counting it again would double every rung.
    const { data: mRows } = await supabase
      .from('outreach_messages')
      .select('id, direction, is_test, contact_id, message_date, created_at, status')
      .eq('prospect_id', prospectId).eq('direction', 'outbound')
    const messages = (mRows ?? []) as {
      id: string; is_test: boolean | null; contact_id: string | null
      message_date: string | null; created_at: string | null; status: string | null
    }[]

    const step = nextStep({
      do_not_contact: p.do_not_contact, stage: p.stage,
      hatchgrab_truck_id: truck?.hatchgrab_truck_id ?? null,
      contact_email: truck?.contact_email ?? null,
      hu_ordering: p.hu_ordering, hu_map: p.hu_map,
      show_on_vf: truck?.show_on_vf ?? null, excluded: truck?.excluded ?? null,
      futureEventCount: null,
      lead_type_at_first_contact: p.lead_type_at_first_contact,
    }, contacts, new Date())

    // 🔴 AN INBOUND CONTACT OR THE LADDER'S OWN `replied` STOP — either is enough.
    inConversation = contacts.some(c => c.direction === 'inbound') || step.stopReason === 'replied'
    const priors: PriorSend[] = [
      ...contacts.filter(c => c.direction !== 'inbound').map(c => ({
        kind: c.kind ?? null, at: c.contacted_at ?? c.created_at ?? null, via: 'log' as const,
      })),
      ...messages.filter(m => !m.contact_id && m.status !== 'failed').map(m => ({
        kind: null, at: m.message_date ?? m.created_at ?? null, via: 'mailbox' as const,
        isTest: m.is_test === true,
      })),
    ]
    const lastEmailAt = messages
      .filter(m => m.is_test !== true)
      .map(m => m.message_date ?? m.created_at)
      .filter((x): x is string => !!x).sort().reverse()[0] ?? null

    // ── 3d · THE SAME ADDRESS ON ANOTHER PROSPECT ─────────────────────────────────────────────────
    // ⚠️ THREE SMALL QUERIES RATHER THAN A JOIN, because the address lives on `discovery_trucks` and
    // PostgREST cannot filter a parent by an embedded column without `!inner` and a second read.
    const others: { prospectName: string; address: string; lastOutboundAt: string | null }[] = []
    const addr = (truck?.contact_email ?? '').trim()
    if (addr) {
      // ⚠️ ESCAPED: `%` and `_` are wildcards in `ilike`, and an address may contain an underscore.
      const pattern = addr.replace(/[\\%_]/g, c => `\\${c}`)
      const { data: tRows } = await supabase
        .from('discovery_trucks').select('id, name, contact_email').ilike('contact_email', pattern)
      const trucks = (tRows ?? []) as { id: string; name: string | null; contact_email: string | null }[]
      const otherTruckIds = trucks.map(t => t.id)
      if (otherTruckIds.length > 1) {
        const { data: opRows } = await supabase
          .from('outreach_prospects').select('id, discovery_truck_id')
          .in('discovery_truck_id', otherTruckIds).neq('id', prospectId)
        const otherProspects = (opRows ?? []) as { id: string; discovery_truck_id: string }[]
        if (otherProspects.length > 0) {
          const { data: omRows } = await supabase
            .from('outreach_messages').select('prospect_id, message_date, created_at')
            .in('prospect_id', otherProspects.map(o => o.id))
            .eq('direction', 'outbound').eq('is_test', false)
          const om = (omRows ?? []) as { prospect_id: string; message_date: string | null; created_at: string | null }[]
          for (const o of otherProspects) {
            const last = om.filter(m => m.prospect_id === o.id)
              .map(m => m.message_date ?? m.created_at).filter((x): x is string => !!x)
              .sort().reverse()[0] ?? null
            const t = trucks.find(x => x.id === o.discovery_truck_id)
            others.push({
              prospectName: t?.name ?? 'another prospect',
              address: t?.contact_email ?? addr,
              lastOutboundAt: last,
            })
          }
        }
      }
    }

    firedGuards = evaluateGuards({
      // ⚠️ THE CONVERSATION EXEMPTION IS ABOUT WHO WROTE LAST, NOT ABOUT WHICH BUTTON WAS PRESSED.
      // It used to be `!!replyParent`, so replying to my OWN email would skip every guard — which is
      // exactly the path this build opens up, and would have been a way to send chase 1 twice.
      isReply: inConversation, step, priors, lastEmailAt,
      address: truck?.contact_email ?? null, others, now: new Date(),
    })
    const blocking = firedGuards.filter(g => !overrides.includes(g.id))
    if (blocking.length > 0) {
      // 🔴 NOTHING IS SENT AND NOTHING IS WRITTEN. The client shows the sentences and, if Dominic
      // means it, re-submits with `override: [ids]` — a deliberate second act, recorded below.
      return NextResponse.json({
        ok: false, needsConfirm: true,
        refusal: blocking.map(g => g.message).join(' '),
        guards: blocking.map(g => ({ id: g.id, kind: g.kind, message: g.message })),
      }, { status: 200 })
    }
    // ⚠️ THE OVERRIDE IS RECORDED BEFORE THE SEND, not after: if the send then fails, the fact that a
    // guard was waved through is still the thing worth having in the history.
    const waved = firedGuards.filter(g => overrides.includes(g.id))
    if (waved.length > 0) {
      await recordSendOverride(supabase, prospectId, waved.map(g => ({ id: g.id, message: g.message })))
    }
    // 🔴 3h · THE LOGGED KIND IS THE STEP THIS SEND WAS MADE FOR, NOT THE TEMPLATE'S TAG. It used to
    // be `selected?.servesKind ?? logFormKind` from the browser, so choosing a template tagged
    // "chase 1" for a first contact logged a chase-1 rung and skipped a step of the ladder.
    // ⚠️ ALSO WHEN REPLYING TO MY OWN EMAIL: the rung is what the ladder says, not `reply`.
    if (step.kind && (!replyParent || !inConversation)) derivedKind = step.kind
  }

  /* 🔴 A REPLY TO SOMEBODY WHO WROTE TO US IS `reply`; EVERYTHING ELSE IS A RUNG. `reply` is
   * deliberately not one of `CONTACT_KINDS`, so answering somebody neither advances the chase
   * sequence nor restarts it — but following up on my own email is not answering anybody, and
   * logging it as `reply` would leave the ladder where it was and let the same chase go twice. */
  const sendKind = loggedKindFor({
    hasParent: !!replyParent, inConversation, stepKind: derivedKind,
    clientKind: typeof body.kind === 'string' ? body.kind : null,
  })
  // ⚠️ AND A REPLY IS NEVER A FIRST CONTACT, whatever `startsNewThread` would say about its kind.
  const firstContact = !replyParent && startsNewThread(sendKind)
  const parentRow = replyParent ? undefined : (firstContact ? undefined : await threadParent(prospectId))

  // Has this prospect been emailed before, according to the LADDER? If so a new thread would be wrong.
  const { count: emailedBefore } = await supabase
    .from('outreach_contacts').select('id', { count: 'exact', head: true })
    .eq('prospect_id', prospectId).eq('channel', 'email').eq('direction', 'outbound')

  let parent: { messageId: string; references: string | null; quoted: QuotedMessage; quote?: boolean } | null = null
  if (replyParent) {
    // 🔴 THE REFERENCE BLOCK IS THE MESSAGE AS CAPTURED — their From, their Date, the To it was
    // addressed to, their Subject — because that is what a recipient expects to see above their own
    // words. Using our own From here (which is what the chase path does, correctly, since the chase
    // quotes OUR last email) would show the prospect a quote header attributing their message to us.
    const quotedHtml = sanitiseQuotedHtml(replyParent.html_body ?? '')
    if (!quotedHtml.trim()) {
      return refuse('That message has no stored body to quote, so the reply would arrive without the conversation. Open it once to fetch and store it, then reply.')
    }
    parent = {
      messageId: replyParent.message_id!,
      references: replyParent.references,
      quote: includeQuote,
      quoted: {
        fromAddress: replyParent.from_address ?? toAddress, fromName: null,
        toAddress: replyParent.to_address ?? OUTREACH_FROM_ADDRESS, toName: null,
        subject: replyParent.subject ?? '',
        date: replyParent.message_date ? new Date(replyParent.message_date) : new Date(),
        html: quotedHtml, text: replyParent.text_body,
      },
    }
  } else if (parentRow) {
    // 🔴 THE QUOTE IS THE PARENT'S OWN BODY. A system-sent parent stored it; an IMPORTED one did not —
    // the importer records an Outlook message's headers and leaves the body in the mailbox, where it
    // already is. So it is read back from Sent by uid, READ-ONLY. Only when neither source has it is
    // the chase refused, because a reply quoting nothing is not the email Dominic thinks he is sending.
    const { html: quotedHtml, text: quotedText } = await parentBodies(parentRow, accounts)
    // ⚠️ AND IT ONLY REFUSES WHEN THE QUOTE IS WANTED. With "Include previous email" unticked there
    // is nothing to quote, so a parent whose body was never stored is no longer a reason to refuse a
    // chase — the threading headers come from the row, which is already in hand.
    if (!quotedHtml && includeQuote) {
      return refuse("I can't find the earlier email to reply to — run Import past emails, or check this truck's email address.")
    }
    parent = {
      messageId: parentRow.message_id,
      references: parentRow.references,
      quote: includeQuote,
      quoted: {
        // 🔴 THE SAME NAME THE From HEADER CARRIES, so the quote header on a reply matches the email
        // it is quoting rather than showing a bare address under a named one.
        fromAddress: OUTREACH_FROM_ADDRESS, fromName,
        toAddress: parentRow.to_address ?? toAddress, toName: null,
        subject: parentRow.subject ?? subjectIn,
        date: parentRow.message_date ? new Date(parentRow.message_date) : new Date(),
        // ⚠️ SANITISED HERE TOO, AND THAT IS A CHANGE TO THE CHASE PATH. A chase usually quotes our
        // own last email, which is markup this app generated — but "usually" is not "always": once a
        // prospect has replied, `threadParent` correctly returns THEIR message, and it has been
        // embedding their raw HTML in an outgoing email since chases learned to thread onto a reply.
        html: sanitiseQuotedHtml(quotedHtml), text: quotedText,
      },
    }
  } else if (!firstContact && (emailedBefore ?? 0) > 0 && !isTest) {
    // 🔴 NEVER SILENTLY START A NEW THREAD. The log says this prospect has been emailed; a fresh subject
    // would arrive as an unrelated first approach, which is exactly the thing chasing in-thread avoids.
    return refuse("I can't find the earlier email to reply to — run Import past emails, or check this truck's email address.")
  }

  if (!parent && !subjectIn) return refuse('A first contact needs a subject.')

  // ── THE ATTACHMENTS · PATHS IN, BYTES READ SERVER-SIDE ─────────────────────────────────────────
  // 🔴 `parseOutboundAttachments` IS THE GUARD, NOT A PARSER. It keeps only entries that carry a
  // `storagePath` and drops everything else, so a request containing base64 content, a data: URI or
  // a URL yields an empty list rather than an attachment — there is no field on this path through
  // which file bytes can reach the mail server.
  const declaredAttachments: OutboundAttachment[] = parseOutboundAttachments(body.attachments)
  const tooBig = attachmentSetRefusal(declaredAttachments)
  if (tooBig) return refuse(tooBig.refusal)
  // ⚠️ READ BEFORE THE ROW IS INSERTED. A missing file must refuse without leaving a `sending` row
  // behind for the stuck-send sweep to turn into `uncertain`.
  const loaded = await loadAttachments(supabase, declaredAttachments)
  if (!loaded.ok) return refuse(loaded.refusal)

  // ── THE ROW GOES IN FIRST, WITH ITS Message-ID ───────────────────────────────────────────────────
  const messageId = newMessageId()
  const built = buildMessage({ doc: docIn, subject: subjectIn, messageId, parent, fromName })
  const recipient = isTest ? testRecipient! : toAddress

  // 🔴 `action: 'preview'` WAS HERE AND IS GONE (29 September 2026). It stopped at exactly this point
  // and returned the built HTML for a preview pane under the compose box. Dominic asked for it to go:
  // the pane restated the message he had just typed, and the "build the preview before you may send"
  // step made a one-press job into two. What it was protecting is still protected — the server builds
  // the final message HERE, from the text in the box, with every refusal above already run, so what is
  // sent is what `buildMessage` makes of what he wrote either way.
  const { data: insertedRow, error: insErr } = await supabase.from('outreach_messages').insert({
    prospect_id: prospectId,
    direction: 'outbound',
    status: 'sending',
    is_test: isTest,
    source: 'system',
    // 🔴 EXPLICIT, BECAUSE THE COLUMN HAS NO DEFAULT. An insert that forgot it fails loudly rather than
    // silently claiming the wrong mailbox — which is why the migration declines to give it one.
    account: sender.account,
    message_id: messageId,
    in_reply_to: built.inReplyTo,
    references: built.references,
    subject: built.subject,
    from_address: OUTREACH_FROM_ADDRESS,
    to_address: recipient,
    message_date: new Date().toISOString(),
    html_body: built.html,
    text_body: built.text,
    attempts: 0,
    // 🔴 PATHS AND METADATA, SO A RETRY CAN REBUILD THE SAME MESSAGE. Written as `[]` rather than
    // left null when there are none, because null means "nobody has looked" for an INBOUND row and
    // this row has been looked at exhaustively — we composed it.
    attachments: declaredAttachments,
    ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
  }).select('*').single()
  if (insErr || !insertedRow) {
    // A unique violation here IS the double-submit guard doing its job.
    if ((insErr as { code?: string } | null)?.code === '23505') {
      const { data: prior } = await supabase
        .from('outreach_messages').select('id, status, sent_copy, last_error').eq('idempotency_key', idempotencyKey ?? '').maybeSingle()
      if (prior) return NextResponse.json({ ok: true, duplicate: true, ...(prior as object) })
    }
    // 🔴 THE REASON TRAVELS WITH THE REFUSAL. This sentence read "The message could not be recorded, so
    // nothing was sent." and stopped there — which is what Dominic saw in production, with no way to
    // tell a missing table from a permission problem from a bad column. The code and message are
    // PostgREST's own; they name a table and a constraint, never a credential and never the test
    // address, neither of which is in this insert's payload or in an error about it.
    return refuse(`The message could not be recorded, so nothing was sent — ${dbDetail(insErr)}`)
  }

  // ⚠️ `from_name` RIDES ON THE ROW OBJECT, NOT IN THE TABLE. It is a setting, not a property of the
  // message, and storing a copy per row would mean a later retry used a stale name.
  // ⚠️ THE BYTES RIDE ON THE ROW OBJECT, NOT IN THE TABLE — like `from_name`. The table holds the
  // paths; these are what nodemailer turns into MIME parts.
  const result = await deliver(supabase,
    { ...(insertedRow as Row), attachments: loaded.attachments, from_name: fromName },
    { mailUser, mailPass, isTest, testRecipient })

  // ── THE CONTACT LOG — the shared path, and only for a real send the server accepted ──────────────
  // ⚠️ A TEST LOGS NOTHING. It goes to Dominic, not a prospect; a rung for it would corrupt the ladder
  // §57 derives the next step from.
  let logWarning: string | null = null
  if (!isTest && result.status === 'sent') {
    const kind = sendKind
    const leadInput = {
      hu_ordering: p.hu_ordering ?? null,
      hu_map: p.hu_map ?? null,
      show_on_vf: truck?.show_on_vf ?? null,
      excluded: truck?.excluded ?? null,
      futureEventCount: null,
      lead_type_at_first_contact: p.lead_type_at_first_contact,
    }
    const logged = await logOutreachContact(
      supabase,
      // 🔴 THE LOG STORES WHAT WAS SENT: the document's own plain text.
      { prospect_id: prospectId, channel: 'email', direction: 'outbound', kind, message: bodyIn, contacted_at: null },
      { prospect: leadInput, hasLeadTypeFreeze: true },
    )
    if (!logged.ok) {
      // 🔴 SENT BUT NOT LOGGED IS NOT A FAILED SEND, AND MUST NEVER BE RETRIED. The prospect has the
      // email. The row records it, and the UI offers a one-click "log it" rather than a Send.
      logWarning = 'Sent, not logged — use “log it” on this message.'
      await supabase.from('outreach_messages')
        .update({ last_error: `sent, not logged: ${logged.error ?? 'unknown'}` }).eq('id', (insertedRow as Row).id)
    } else {
      if (logged.id) await supabase.from('outreach_messages').update({ contact_id: logged.id }).eq('id', (insertedRow as Row).id)
      logWarning = logged.warning
    }
  }
  return NextResponse.json({ ...result.payload, ...(logWarning ? { logWarning } : {}) })
}
