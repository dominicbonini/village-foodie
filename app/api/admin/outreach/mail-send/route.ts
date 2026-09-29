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
import { messagesTableProbe, dbDetail } from '@/lib/outreach-messages-table'
import { readFromName } from '@/lib/outreach-settings-read'
import { validateDoc, docPlainText, literalTokenRefusal } from '@/lib/outreach-doc'
import { prospectRefusal, retryRefusal, startsNewThread } from '@/lib/outreach-send-rules'

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
  /** Not a column — attached in-process so `mailFor` can put it on the From header. */
  from_name?: string | null
  message_id: string; in_reply_to: string | null; references: string | null
  subject: string | null; to_address: string | null; message_date: string | null
  html_body: string | null; text_body: string | null; sent_copy: string; attempts: number
}

interface ViewRow {
  id: string; direction: string; status: string; source: string
  subject: string | null; from_address: string | null; to_address: string | null
  message_date: string | null; mailbox: string | null; uid: number | null; uidvalidity: number | null
  html_body: string | null; text_body: string | null
}

interface ParentRow {
  message_id: string; references: string | null; subject: string | null; to_address: string | null
  message_date: string | null; html_body: string | null; text_body: string | null
  mailbox: string | null; uid: number | null; direction?: string | null
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
    .select('message_id, "references", subject, to_address, message_date, html_body, text_body, mailbox, uid, direction')
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
  parent: ParentRow, mailUser: string, mailPass: string,
): Promise<{ html: string | null; text: string | null }> {
  if (parent.html_body) return { html: parent.html_body, text: parent.text_body }
  if (!parent.mailbox || parent.uid == null) return { html: null, text: null }
  const c = makeImapClient(mailUser, mailPass)
  try {
    await c.connect()
    return await fetchBodiesByUid(c, parent.mailbox, parent.uid)
  } catch { return { html: null, text: null } } finally {
    try { await c.logout() } catch { /* already gone */ }
  }
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
  const mailUser = process.env.OUTREACH_MAIL_USER
  const mailPass = process.env.OUTREACH_MAIL_PASSWORD
  if (!mailUser || !mailPass) return refuse('The mailbox credentials are not set on this environment, so nothing can be sent.')
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
    const retried = await deliver(supabase, { ...row, from_name: await readFromName(supabase) }, { mailUser, mailPass, isTest: row.is_test, testRecipient })
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
    const bodies = await parentBodies(parent, mailUser, mailPass)
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
    const rowWithName = { ...row, from_name: await readFromName(supabase) }
    try { raw = await composeRaw(rowWithName) } catch (err) { return refuse(`That message could not be rebuilt (${sanitiseMailError(err)}).`) }
    const copy = await fileSentCopy(row, raw, row.message_date ? new Date(row.message_date) : new Date(), { mailUser, mailPass })
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

  // ── "VIEW" — one whole email, read-only ────────────────────────────────────────────────────────
  // 🔴 A SYSTEM-SENT ROW IS SERVED FROM THE DATABASE; AN IMPORTED OR RECEIVED ONE FROM THE MAILBOX.
  // The importer deliberately stores no body — the message is already in the mailbox and copying it
  // into Postgres would be a second, ageing copy of somebody else's words. So those are fetched by
  // mailbox+uid, READ-ONLY: EXAMINE, and `fetch` emits `BODY.PEEK[…]`, so opening an email here does
  // not mark it read in Outlook.
  // ⚠️ ATTACHMENTS ARE NAMED, NEVER FETCHED. Only the body parts are asked for, so no attachment
  // crosses the wire — the list comes from the body structure, which is metadata.
  if (action === 'view') {
    const rowId = String(body.message_row_id ?? '')
    const { data: existing } = await supabase.from('outreach_messages')
      .select('id, direction, status, source, subject, from_address, to_address, message_date, mailbox, uid, uidvalidity, html_body, text_body')
      .eq('id', rowId).maybeSingle()
    const row = existing as ViewRow | null
    if (!row) return refuse('That message is not in the log any more.')
    const head = {
      from: row.from_address, to: row.to_address, subject: row.subject,
      date: row.message_date, direction: row.direction, source: row.source,
    }
    if (row.html_body || row.text_body) {
      return NextResponse.json({
        ok: true, ...head, attachments: [],
        html: row.html_body, text: row.text_body, from_mailbox: false,
      })
    }
    if (!row.mailbox || row.uid == null) {
      return refuse('This email has no stored copy and no mailbox reference, so there is nothing to open. Run Import past emails.')
    }
    const c = makeImapClient(mailUser, mailPass)
    try {
      await c.connect()
      const fetched = await fetchMessageForView(c, row.mailbox, row.uid, row.uidvalidity)
      if (!fetched.ok) return refuse(fetched.error)
      return NextResponse.json({
        ok: true, ...head, attachments: fetched.attachments,
        html: fetched.html, text: fetched.text, from_mailbox: true, mailbox: row.mailbox,
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
        kind: typeof body.kind === 'string' ? body.kind : null,
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
  const toAddress = (truck?.contact_email ?? '').trim()

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

  // ── THREADING — a chase is a REPLY, or it is refused; a FIRST CONTACT never is ───────────────────
  const sendKind = typeof body.kind === 'string' ? body.kind : null
  const firstContact = startsNewThread(sendKind)
  const parentRow = firstContact ? undefined : await threadParent(prospectId)

  // Has this prospect been emailed before, according to the LADDER? If so a new thread would be wrong.
  const { count: emailedBefore } = await supabase
    .from('outreach_contacts').select('id', { count: 'exact', head: true })
    .eq('prospect_id', prospectId).eq('channel', 'email').eq('direction', 'outbound')

  let parent: { messageId: string; references: string | null; quoted: QuotedMessage } | null = null
  if (parentRow) {
    // 🔴 THE QUOTE IS THE PARENT'S OWN BODY. A system-sent parent stored it; an IMPORTED one did not —
    // the importer records an Outlook message's headers and leaves the body in the mailbox, where it
    // already is. So it is read back from Sent by uid, READ-ONLY. Only when neither source has it is
    // the chase refused, because a reply quoting nothing is not the email Dominic thinks he is sending.
    const { html: quotedHtml, text: quotedText } = await parentBodies(parentRow, mailUser, mailPass)
    if (!quotedHtml) {
      return refuse("I can't find the earlier email to reply to — run Import past emails, or check this truck's email address.")
    }
    parent = {
      messageId: parentRow.message_id,
      references: parentRow.references,
      quoted: {
        // 🔴 THE SAME NAME THE From HEADER CARRIES, so the quote header on a reply matches the email
        // it is quoting rather than showing a bare address under a named one.
        fromAddress: OUTREACH_FROM_ADDRESS, fromName,
        toAddress: parentRow.to_address ?? toAddress, toName: null,
        subject: parentRow.subject ?? subjectIn,
        date: parentRow.message_date ? new Date(parentRow.message_date) : new Date(),
        html: quotedHtml, text: quotedText,
      },
    }
  } else if (!firstContact && (emailedBefore ?? 0) > 0 && !isTest) {
    // 🔴 NEVER SILENTLY START A NEW THREAD. The log says this prospect has been emailed; a fresh subject
    // would arrive as an unrelated first approach, which is exactly the thing chasing in-thread avoids.
    return refuse("I can't find the earlier email to reply to — run Import past emails, or check this truck's email address.")
  }

  if (!parent && !subjectIn) return refuse('A first contact needs a subject.')

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
  const result = await deliver(supabase, { ...(insertedRow as Row), from_name: fromName }, { mailUser, mailPass, isTest, testRecipient })

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
