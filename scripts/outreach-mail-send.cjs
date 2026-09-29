#!/usr/bin/env node
// scripts/outreach-mail-send.cjs — an outreach email that a prospect cannot tell from a hand-sent one,
// and a send that never goes twice.
//   node scripts/outreach-mail-send.cjs      (≈ 8 s: two compiles, NO NETWORK)
//
// 🔴 FAILURE MODE, in the order it would hurt: a prospect receives the SAME email twice, because an
//    uncertain send was retried without a human looking; an email goes to a truck that is already a
//    HatchGrab customer, or to one marked do-not-contact; the cap silently admits more than thirty
//    because its day is the wrong day; or the message arrives looking generated — an X-Mailer header, a
//    signature that is a near-miss of the captured one, or a chase that opens a new conversation because
//    the subject, In-Reply-To and References do not agree.
//
// HOW: the REAL libs compiled from lib/, and the REAL message composed by nodemailer's `streamTransport`
// with `buffer: true` — a transport that writes the RFC822 bytes to memory. No socket is opened, no
// mailbox is touched and no database is read. Every refusal below is the function the route calls.
const fs = require('fs'); const path = require('path'); const os = require('os')
const nodemailer = require('nodemailer')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }
const eq = (got, want, label) => {
  const ok = got === want
  console.log(`  ${ok ? '✓' : '🔴'} ${label}`)
  if (!ok) { console.log(`      want: ${JSON.stringify(want)}`); console.log(`      got:  ${JSON.stringify(got)}`); fails++ }
}

const FILES = [
  'lib/outreach-mail-message.ts', 'lib/outreach-send-rules.ts', 'lib/outreach-mail-envelope.ts',
  'lib/outreach-messages-table.ts', 'lib/outreach-mail-format.ts',
]
function build(root, tag) {
  const { req } = compile(root, FILES, tag)
  return {
    M: req('lib/outreach-mail-message.js'),
    R: req('lib/outreach-send-rules.js'),
    E: req('lib/outreach-mail-envelope.js'),
    T: req('lib/outreach-messages-table.js'),
    F: req('lib/outreach-mail-format.js'),
  }
}

/** Compose to memory and hand back the raw bytes. `streamTransport` never opens a socket. */
async function compose(mail) {
  const t = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows' })
  const info = await t.sendMail(mail)
  return info.message.toString('utf8')
}
const headerBlock = raw => raw.replace(/\r\n/g, '\n').split('\n\n')[0]
/** One unfolded header value, by name. */
function header(raw, name) {
  const lines = headerBlock(raw).split('\n')
  const out = []
  let on = false
  for (const l of lines) {
    if (/^[ \t]/.test(l)) { if (on) out.push(l.trim()); continue }
    on = l.toLowerCase().startsWith(`${name.toLowerCase()}:`)
    if (on) out.push(l.slice(l.indexOf(':') + 1).trim())
  }
  return out.join(' ')
}

// ── THE FIXTURES ────────────────────────────────────────────────────────────────────────────────────
// A parent as it sits in the log after a first contact, and a chase written on top of it.
const PARENT = {
  fromAddress: 'dominic@hatchgrab.com', fromName: '',
  toAddress: 'hello@example-truck.test', toName: null,
  subject: 'Taking orders online',
  // 13:07 London on Friday 11 September 2026 — BST, so 12:07Z.
  date: new Date('2026-09-11T12:07:00Z'),
  html: '<div>the original pitch</div>',
  text: 'the original pitch',
}
const ROW = built => ({
  message_id: built.messageId, in_reply_to: built.inReplyTo, references: built.references,
  subject: built.subject, to_address: 'hello@example-truck.test',
  message_date: '2026-09-25T09:00:00Z', html_body: built.html, text_body: built.text,
})

// ── THE CAPTURED SIGNATURE ──────────────────────────────────────────────────────────────────────────
// Written out here in full, once, as the thing the lib must equal.
const P = 'font-family: Aptos, Arial, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0);'
const SIGNATURE =
  `<div style="${P}">Kind regards,</div>` +
  `<div style="${P}">Dominic</div>` +
  '<div style="direction: ltr;"><b><br></b></div>' +
  '<div style="direction: ltr;"><b><br></b></div>' +
  '<div><b>Dominic Bonini</b></div>' +
  `<div style="${P}">Founder, HatchGrab</div>` +
  `<div style="${P}">hatchgrab.com | villagefoodie.co.uk</div>` +
  `<div style="${P}">07941 042 253</div>` +
  `<div style="${P}"><br></div>` +
  `<div style="${P}"><br></div>` +
  '<div style="font-family: Aptos, Arial, Helvetica, sans-serif; font-size: 13.333333px; color: rgb(0, 0, 0);">' +
  'If you would rather not hear from me again, reply with &quot;no thanks&quot; and I will not contact you.</div>'

;(async () => {
  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
  const variant = (tag, file, patch) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `oms-${tag}-`))
    fs.cpSync(path.join(REPO, 'lib'), path.join(tmp, 'lib'), { recursive: true })
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(tmp, 'node_modules')) } catch {}
    const f = path.join(tmp, file); const src = fs.readFileSync(f, 'utf8')
    const out = patch(src); if (out === src) { console.log(`🔴 ${tag}: the patch did not apply`); process.exit(1) }
    fs.writeFileSync(f, out)
    return { tmp, ...build(tmp, tag) }
  }
  const variantFails = (tag, bad, label) => {
    console.log(`  ${bad ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${tag} ${label}`)
    if (!bad) process.exit(1)
  }
  {
    // V1 — THE OLD TABLE PROBE, RESTORED. Its matcher was a whitelist of known failures with "present"
    // as the DEFAULT, and a `head: true` select returns an error with an EMPTY code and message — so a
    // MISSING TABLE read as present. That is what production did: the compose window offered Send and
    // the send failed at the insert. Any error must mean not ready.
    const v = variant('v1', 'lib/outreach-messages-table.ts', src => src.replace(
      /  if \(code === 'PGRST205'[\s\S]*?\n  \}\n  \/\/ Anything else[\s\S]*?\n  return \{ ready: false[^\n]*\n/,
      "  if (code === 'PGRST205' || code === '42P01' || /schema cache|does not exist/i.test(message)) {\n" +
      "    return { ready: false, refusal: MIGRATION_OFF }\n  }\n  return { ready: true }\n"))
    const empty = await v.T.messagesTableProbe(async () => ({ error: { code: '', message: '' } }))
    variantFails('V1', empty.ready === true,
      'the old whitelist matcher: an empty-bodied error reads as a table that is PRESENT')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V2 — AN UNCERTAIN ROW RETRIES ITSELF. The one failure that puts a second copy of a cold approach in
    // a prospect's inbox.
    const v = variant('v2', 'lib/outreach-send-rules.ts', src => src.replace(
      "  if (row.status === 'uncertain' && confirmUncertain !== true) {", '  if (false) {'))
    variantFails('V2', v.R.retryRefusal({ status: 'uncertain' }, false) === null,
      'the confirm requirement removed: an uncertain row retries with no human')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V3 — A LINKED HATCHGRAB TRUCK IS EMAILABLE. This is the rule that keeps a LIVE TRADING TRUCK out of
    // reach of the send route; without it Pizzeria Gusto's discovery row is just another prospect.
    const v = variant('v3', 'lib/outreach-send-rules.ts', src => src.replace(
      "  if (p.hatchgrab_truck_id) return { refusal: 'This row is linked to a HatchGrab truck, so outreach is never sent to it.' }",
      '  // removed'))
    variantFails('V3', v.R.prospectRefusal({ do_not_contact: false, contact_email: 'a@b.test', hatchgrab_truck_id: 'live-truck' }) === null,
      'the linked-truck rule removed: a HatchGrab truck is a valid outreach target')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V4 — ONE SPACER DIV FEWER IN THE SIGNATURE. Outlook's gap is literal empty divs; drop one and every
    // generated email is a visible near-miss of the ones already in the prospect's thread.
    const v = variant('v4', 'lib/outreach-mail-message.ts', src => src.replace(
      "    '<div style=\"direction: ltr;\"><b><br></b></div>',\n    '<div style=\"direction: ltr;\"><b><br></b></div>',",
      "    '<div style=\"direction: ltr;\"><b><br></b></div>',"))
    variantFails('V4', v.M.signatureHtml() !== SIGNATURE,
      'one spacer div removed: the signature no longer matches the captured bytes')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V5 — THE REPLY PREFIX IS STRIPPED ONCE. A thread that has been round twice becomes "Re: RE: FW: …",
    // which is what a machine writes and a person does not.
    const v = variant('v5', 'lib/outreach-mail-message.ts', src => src.replace(
      /  for \(;;\) \{[\s\S]*?\n  \}/, "  s = s.replace(/^\\s*(re|fw|fwd)\\s*:\\s*/i, '')"))
    variantFails('V5', v.M.replySubject('RE: FW: Taking orders online') !== 'Re: Taking orders online',
      'the prefix stripped once: a twice-round thread keeps its old prefixes')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V6 — A MACHINE HEADER IS ADDED. The realistic version of this mistake is not X-Mailer (nodemailer
    // 10 only stamps that when asked) but somebody adding a header to help themselves debug: a campaign
    // id, an unsubscribe header, a prospect id. Any one of them tells the recipient this was generated.
    const v = variant('v6', 'lib/outreach-mail-envelope.ts', src => src.replace(
      '    xMailer: false,', "    xMailer: 'HatchGrab outreach',\n    headers: { 'X-Outreach-Prospect': 'p-123' },"))
    const M = v.M
    const built = M.buildMessage({ body: 'Hello.', subject: 'Taking orders online', messageId: '<v6@hatchgrab.com>' })
    const raw = await compose(v.E.mailFor(ROW(built)))
    const extra = M.disallowedHeaders(raw)
    variantFails('V6', extra.includes('x-mailer') && extra.includes('x-outreach-prospect'),
      'an X-Mailer and a prospect-id header added: the composed message is no longer on the allow-list')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }

  {
    // V7 — THE HEADER BLOCK READ OUT OF `bodyParts`, which is where the two failed fixes looked. That
    // map never holds it: imapflow assigns a BODY[HEADER] response to `msg.headers`. This variant is
    // the exact shape of the bug that put `headers: []` in production for a fortnight.
    const v = variant('v7', 'lib/outreach-mail-format.ts', src => src.replace(
      '  const direct = asText(m.headers)\n  if (direct && direct.trim()) return direct\n', ''))
    const msg = { headers: Buffer.from('From: a@b.test\r\nSubject: x\r\n'), bodyParts: new Map() }
    variantFails('V7', v.F.headerBlockOf(msg) === '',
      '`msg.headers` ignored: the header block comes back empty, exactly as it did in production')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V8 — THE FOLDED-HEADER READER STOPS AT THE FIRST LINE. `References` on a thread that has been
    // round three times is folded, and one Message-ID out of four threads the next reply to the wrong
    // place. (The importer's own version had a worse variant of this: `/\\s+/g` as a REGEX LITERAL,
    // which matches a backslash followed by `s` and collapses nothing at all.)
    const v = variant('v8', 'lib/outreach-mail-format.ts', src => src.replace(
      "    if (/^[ \\t]/.test(line)) { if (on) parts.push(line.trim()); continue }",
      "    if (/^[ \\t]/.test(line)) continue"))
    const raw = 'References: <a@x>\r\n <b@x>\r\n <c@x>\r\nSubject: y\r\n'
    variantFails('V8', v.F.headerValue(raw, 'References') === '<a@x>',
      'continuation lines dropped: a folded References keeps only its first Message-ID')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }

  const { M, R, E, T, F } = build(REPO, 'omsReal')

  console.log('\n── THE SIGNATURE, BYTE FOR BYTE ─────────────────────────────────────────────────────────')
  // 🔴 THE EXPECTED STRING IS WRITTEN OUT IN FULL, not assembled from the same pieces the lib uses. A
  // check built from the lib's own constants would pass however they changed, which is no check at all.
  eq(M.signatureHtml(), SIGNATURE, 'signatureHtml() is the captured Outlook signature exactly')
  check(M.signatureHtml().split('<div style="direction: ltr;"><b><br></b></div>').length - 1 === 2,
    'both `direction: ltr` spacer divs are present')
  check(!/<a[\s>]/i.test(M.signatureHtml()), 'no <a> anywhere in the signature — the domains are plain text')
  check(M.signatureHtml().includes(M.OPTOUT_SENTENCE.replace(/"/g, '&quot;')),
    'the opt-out sentence is present, and its quotes are escaped')
  eq(M.signatureText().split('\n').pop(), M.OPTOUT_SENTENCE, 'the text part ends with the same opt-out sentence')

  console.log('\n── A FIRST CONTACT ──────────────────────────────────────────────────────────────────────')
  {
    const built = M.buildMessage({
      body: "Hi Sam,\n\nI build ordering for food trucks.\n\nWorth a look?",
      subject: 'Taking orders online', messageId: '<first@hatchgrab.com>',
    })
    eq(built.subject, 'Taking orders online', 'a first contact keeps the template subject — no Re:')
    eq(built.inReplyTo, null, 'no In-Reply-To')
    eq(built.references, null, 'no References')
    check(!built.html.includes('mail-editor-reference-message-container'), 'no quote block')
    check(built.html.startsWith('<div style="font-family: Aptos, Arial, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0);">Hi Sam,</div>'),
      'the first paragraph is the captured paragraph div')
    check(built.html.includes('<div style="font-family: Aptos, Arial, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0);"><br></div>'),
      'paragraphs are separated by an empty div of the same style, not a margin')
    eq(M.bodyHtml("Bill & Ben's <Truck>"),
      '<div style="font-family: Aptos, Arial, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0);">Bill &amp; Ben&#039;s &lt;Truck&gt;</div>'
        .replace('&#039;', "'"),
      "a truck called `Bill & Ben's <Truck>` is escaped, not turned into markup")
  }

  console.log('\n── A CHASE IS A REPLY IN THREE PLACES AT ONCE ───────────────────────────────────────────')
  {
    const built = M.buildMessage({
      body: 'Just following up.', subject: 'ignored on a reply', messageId: '<chase@hatchgrab.com>',
      parent: { messageId: '<parent@hatchgrab.com>', references: '<older@hatchgrab.com>', quoted: PARENT },
    })
    eq(built.subject, 'Re: Taking orders online', 'the subject is Re: + the parent subject')
    eq(built.inReplyTo, '<parent@hatchgrab.com>', 'In-Reply-To is the parent')
    eq(built.references, '<older@hatchgrab.com> <parent@hatchgrab.com>',
      "References is the parent's own chain PLUS the parent, space-separated")
    eq(M.replySubject('RE: FW: RE: Taking orders online'), 'Re: Taking orders online',
      'RE: FW: RE: is stripped repeatedly, not once')
    eq(M.replySubject('Re: Taking orders online'), 'Re: Taking orders online', 'Re: is not doubled')
    // 🔴 THE DATE LINE. en-GB's own long format has NO comma after the weekday; the captured header has
    // one, so it is assembled from parts. 13:07 London on 11 September 2026 is 12:07Z — BST.
    eq(M.referenceDate(PARENT.date), 'Friday, 11 September 2026 at 13:07',
      'the reference date is "Friday, 11 September 2026 at 13:07"')
    check(built.html.includes('<div id="mail-editor-reference-message-container">'), "Outlook's quote container is present")
    check(built.html.includes('<div id="mail-editor-reference-message-body">the original pitch</div>'.replace('the original pitch', '<div>the original pitch</div>')),
      "the parent's body is inside the reference body div")
    check(built.html.includes('<b>From: </b>dominic@hatchgrab.com &lt;dominic@hatchgrab.com&gt;<br>'),
      'the From line repeats the bare address in both halves, as the captured mail does')
    check(built.html.includes('<b>Date: </b>Friday, 11 September 2026 at 13:07<br>'), 'the Date line is in the quote header')
    check(built.html.includes('<b>Subject: </b>Taking orders online<br><br>'), 'the Subject line closes the quote header')
    check(built.html.indexOf('Kind regards,') < built.html.indexOf('mail-editor-reference-message-container'),
      'the signature comes BEFORE the quote block — a reply above the line, as Outlook writes it')
    check(built.text.includes('\nFrom: dominic@hatchgrab.com <dominic@hatchgrab.com>\n'), 'the text part quotes too')
  }

  console.log('\n── THE COMPOSED BYTES: THE ALLOWED HEADER SET AND NOTHING ELSE ──────────────────────────')
  {
    const built = M.buildMessage({
      body: 'Just following up.', subject: 'x', messageId: '<bytes@hatchgrab.com>',
      parent: { messageId: '<parent@hatchgrab.com>', references: '<older@hatchgrab.com>', quoted: PARENT },
    })
    const raw = await compose(E.mailFor(ROW(built)))
    const extra = M.disallowedHeaders(raw)
    eq(extra.join(', ') || '(none)', '(none)', `no header outside the allow-list (${M.ALLOWED_HEADERS.length} names)`)
    check(!/x-mailer/i.test(headerBlock(raw)), 'no X-Mailer — nodemailer does not get to sign the email')
    check(!/list-unsubscribe|precedence|auto-submitted|x-priority/i.test(headerBlock(raw)),
      'no List-Unsubscribe, Precedence, Auto-Submitted or X-Priority — none of the bulk markers')
    eq(header(raw, 'From'), 'dominic@hatchgrab.com', 'From is the bare address, as the captured mail has it')
    eq(header(raw, 'Message-ID'), '<bytes@hatchgrab.com>', "the Message-ID is the one the row was written with")
    eq(header(raw, 'In-Reply-To'), '<parent@hatchgrab.com>', 'In-Reply-To survives composition')
    eq(header(raw, 'References'), '<older@hatchgrab.com> <parent@hatchgrab.com>', 'References survives composition')
    eq(header(raw, 'Subject'), 'Re: Taking orders online', 'the Subject is the reply subject')
    check(/multipart\/alternative/.test(header(raw, 'Content-Type')), 'both parts are sent: multipart/alternative')
    check(!/http:\/\/|https:\/\//.test(raw.replace(/hatchgrab\.com|villagefoodie\.co\.uk/g, '')),
      'no tracking pixel and no rewritten link anywhere in the bytes')
  }

  console.log('\n── THE TABLE PROBE: ANY ERROR MEANS NOT READY ──────────────────────────────────────────')
  {
    const probe = (error) => T.messagesTableProbe(async () => ({ error }))
    eq((await probe(null)).ready, true, 'no error: the table is there')
    // 🔴 THE BUG. A `head: true` select gives PostgREST nowhere to put its error document, so a missing
    // table arrives as an error with an empty code AND an empty message.
    const empty = await probe({ code: '', message: '' })
    eq(empty.ready, false, '🔴 an error with an empty code and message reads as NOT ready')
    check(/could not be read/.test(empty.refusal), '…and says so, rather than reporting a bare "off"')
    const missing = await probe({ code: 'PGRST205', message: "Could not find the table 'public.outreach_messages' in the schema cache" })
    eq(missing.refusal, T.MIGRATION_OFF, 'PGRST205 gives the migration sentence')
    eq((await probe({ code: '42P01', message: 'relation "outreach_messages" does not exist' })).refusal,
      T.MIGRATION_OFF, '42P01 gives the migration sentence')
    const denied = await probe({ code: '42501', message: 'permission denied for table outreach_messages' })
    check(denied.refusal.includes('42501') && denied.refusal.includes('permission denied'),
      'a permission error carries its code AND its message to the screen')
    check(!denied.refusal.includes(T.MIGRATION_OFF), '…and is NOT reported as a missing migration')
    const thrown = await T.messagesTableProbe(async () => { throw new Error('socket hang up') })
    eq(thrown.ready, false, 'a select that THROWS is not ready either')
    eq(T.dbDetail({ code: '', message: '' }), 'the database returned no code or message',
      '⚠️ an empty error never renders as an empty string — that is how the bug hid')
  }

  console.log('\n── THE HEADER BLOCK COMES OFF `msg.headers` ─────────────────────────────────────────────')
  {
    // 🔴 imapflow: `if (partKey === 'header') { map.headers = value; break }` — the header section is
    // assigned to `headers` and never added to `bodyParts`.
    const hdr = 'From: a@b.test\r\nSubject: x\r\nReferences: <a@x>\r\n <b@x>\r\n\r\n'
    eq(F.headerBlockOf({ headers: Buffer.from(hdr), bodyParts: new Map() }), hdr,
      'a Buffer on `msg.headers` is the header block')
    eq(F.headerBlockOf({ headers: hdr }), hdr, 'a string works too')
    eq(F.headerBlockOf({}), '', 'a message with neither gives the empty string, not a throw')
    check(F.headerBlockOf({ bodyParts: new Map([['1', Buffer.from(hdr)]]) }) === hdr,
      '⚠️ the bodyParts fallback still works, in case imapflow stops special-casing the section')
    check(F.headerBlockOf({ bodyParts: new Map([['1', Buffer.from('just some body text')]]) }) === '',
      '…and does not mistake a decoded BODY part for a header block')
    eq(F.headerValue(hdr, 'Subject'), 'x', 'one header by name')
    eq(F.headerValue(hdr, 'subject'), 'x', 'the name is case-insensitive, as RFC5322 says')
    eq(F.headerValue(hdr, 'References'), '<a@x> <b@x>',
      '🔴 a FOLDED References is unfolded whole — every Message-ID, not just the first')
    eq(F.headerValue(hdr, 'In-Reply-To'), null, 'an absent header is null, not an empty string')
    eq(F.headerValue('Subject: a\r\n\r\nSubject: not a header, this is the body\r\n', 'Subject'), 'a',
      'the blank line ends the header block — a body line that looks like a header is not read')
  }

  console.log('\n── 🔴 THERE IS NO SEND-COUNT CHECK ANYWHERE ─────────────────────────────────────────────')
  {
    // The cap was removed on 29 September 2026. These assertions are what stops it coming back by
    // accident, and what proves the specific thing that went wrong: a test send refused on volume.
    check(!('capRefusal' in R), 'capRefusal is gone from the rules module')
    check(!('countsTowardCap' in R), 'countsTowardCap is gone')
    check(!('londonDayStartUtc' in R), 'londonDayStartUtc is gone')
    check(!('CAP_COUNTED_STATUSES' in R), 'CAP_COUNTED_STATUSES is gone')
    const ROUTE = fs.readFileSync(path.join(REPO, 'app/api/admin/outreach/mail-send/route.ts'), 'utf8')
    check(!/DAILY_SEND_CAP|capRefusal|countsTowardCap|londonDayStartUtc/.test(ROUTE),
      '🔴 the send route names no cap symbol')
    check(!/sentToday|dailyCap/.test(ROUTE), 'the route returns no send counter')
    // 🔴 THE FAILURE THAT PROMPTED THIS: 37 rows recorded by ONE import run read as 37 sends today —
    // the cap counted `created_at` with no filter on `source` — and refused the next message, a TEST,
    // which no count was ever meant to touch. What kills that whole class of bug is that the send path
    // now COUNTS NOTHING. `count: 'exact'` is how a counting query is written against this client, and
    // the only one left in the file is the ladder lookup that decides whether a chase must thread.
    const counts = ROUTE.match(/count: 'exact'/g) ?? []
    eq(counts.length, 1, "exactly one `count: 'exact'` remains in the send route")
    const around = ROUTE.slice(Math.max(0, ROUTE.indexOf("count: 'exact'") - 400), ROUTE.indexOf("count: 'exact'") + 200)
    check(/outreach_contacts/.test(around) && !/outreach_messages/.test(around),
      '…and it counts CONTACTS for the threading decision, not messages sent')
    check(!/is_test/.test(around), '…so nothing a test send does can be counted by it')
    const COMPOSE = fs.readFileSync(path.join(REPO, 'components/admin/ComposeWindow.tsx'), 'utf8')
    check(!/Sent today|dailyCap|capState/.test(COMPOSE), 'the compose window shows no "Sent today" counter')
    check(!/previewStale|loadPreview|Build preview/.test(COMPOSE),
      '🔴 the preview machinery is gone with it — no stale-preview gate stands between Send and a send')
  }

  console.log('\n── THE REFUSALS ─────────────────────────────────────────────────────────────────────────')
  {
    const ok = { do_not_contact: false, contact_email: 'hello@example-truck.test', hatchgrab_truck_id: null }
    eq(R.prospectRefusal(ok), null, 'an ordinary prospect with an address is sendable')
    eq(R.prospectRefusal({ ...ok, do_not_contact: true }).refusal, 'This prospect is marked do not contact.',
      'do_not_contact is refused')
    eq(R.prospectRefusal({ ...ok, contact_email: '   ' }).refusal, 'This prospect has no email address on its truck row.',
      'a blank address is refused, not sent to nobody')
    eq(R.prospectRefusal({ ...ok, hatchgrab_truck_id: 'a-live-truck' }).refusal,
      'This row is linked to a HatchGrab truck, so outreach is never sent to it.',
      '🔴 a prospect linked to a HatchGrab truck is refused — this is what puts a LIVE TRADING TRUCK out of reach')
    check(R.prospectRefusal({ do_not_contact: true, contact_email: null, hatchgrab_truck_id: 'x' }).refusal
      === 'This prospect is marked do not contact.', 'do-not-contact is reported first when several apply')
  }
  {
    eq(R.retryRefusal({ status: 'failed' }, false), null, 'a failed row retries freely — the server refused it')
    eq(R.retryRefusal({ status: 'sent' }, true).refusal, 'That message was already sent.',
      'a sent row never retries, confirm or no confirm')
    const u = R.retryRefusal({ status: 'uncertain' }, false)
    eq(u.refusal, 'May have been sent — check your Sent folder before retrying.', 'an uncertain row refuses without the confirm')
    check(u.needsConfirm === true, 'and it tells the UI to ask — needsConfirm')
    eq(R.retryRefusal({ status: 'uncertain' }, true), null, 'with the confirm, the operator may retry')
  }

  console.log('\n── FAILED vs UNCERTAIN ──────────────────────────────────────────────────────────────────')
  {
    eq(M.classifySendFailure({ code: 'EAUTH' }), 'failed', 'EAUTH — the credentials were refused')
    eq(M.classifySendFailure({ code: 'EENVELOPE', responseCode: 550 }), 'failed', 'a rejected recipient')
    eq(M.classifySendFailure({ responseCode: 451 }), 'failed', 'any 4xx reply is an answer')
    eq(M.classifySendFailure({ code: 'ETIMEDOUT' }), 'uncertain', 'a timeout mid-conversation is UNKNOWN, not failed')
    eq(M.classifySendFailure({ code: 'ESOCKET' }), 'uncertain', 'a dropped socket is UNKNOWN')
    eq(M.classifySendFailure(new Error('something nobody anticipated')), 'uncertain',
      '⚠️ an unrecognised error lands on the cautious side')
    eq(M.classifySendFailure(null), 'uncertain', 'even nothing at all lands on the cautious side')
  }

  console.log(`\n${fails === 0 ? '✅ ALL CHECKS PASSED' : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
