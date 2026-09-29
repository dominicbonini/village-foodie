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
  'lib/outreach-messages-table.ts', 'lib/outreach-mail-format.ts', 'lib/outreach-signature.ts',
  'lib/outreach-template-render.ts', 'lib/outreach-contact-log.ts',
]
function build(root, tag) {
  const { out, req } = compile(root, FILES, tag)
  // 🔴 THE COMPILE OUTPUT DIR NEEDS `node_modules`, and it is NOT the same directory as the patched
  // source tree. `lib/outreach-mail-envelope.ts` now does a RUNTIME `import nodemailer` — it composes
  // the raw bytes itself — where it used to import only types, which tsc erases. Without this link the
  // compiled module resolves `nodemailer` from a temp dir that has nothing in it.
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(out, 'node_modules')) } catch { /* already there */ }
  return {
    M: req('lib/outreach-mail-message.js'),
    R: req('lib/outreach-send-rules.js'),
    E: req('lib/outreach-mail-envelope.js'),
    T: req('lib/outreach-messages-table.js'),
    F: req('lib/outreach-mail-format.js'),
    S: req('lib/outreach-signature.js'),
    R2: req('lib/outreach-template-render.js'),
    L: req('lib/outreach-contact-log.js'),
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
/** The two settings rows, exactly as Dominic applied them on 29 September. */
const SIG = { lines: [
  { text: 'Kind regards,', bold: false },
  { text: 'Dominic', bold: false },
  { text: '', bold: false },
  { text: '', bold: false },
  { text: 'Dominic Bonini', bold: true },
  { text: 'Founder, HatchGrab', bold: false },
  { text: 'hatchgrab.com | villagefoodie.co.uk', bold: false },
  { text: '07941 042 253', bold: false },
] }
const OPT = { text: 'If you would rather not hear from me again, reply with "no thanks" and I will not contact you.' }
const SETTINGS = { signature: SIG, optOut: OPT }
const P12 = 'font-family: Aptos, Arial, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0);'
const P10 = 'font-family: Aptos, Arial, Helvetica, sans-serif; font-size: 13.333333px; color: rgb(0, 0, 0);'

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
    // V4 — A BOLD LINE GETS A DIV OF ITS OWN WITH NO STYLE, which is the captured markup and which is
    // exactly why "Dominic Bonini" arrived SMALLER than every other line in the email Dominic received:
    // an unstyled div inherits the mail client's default size.
    const v = variant('v4', 'lib/outreach-signature.ts', src => src.replace(
      '  const inner = line.text.trim() === \'\' ? \'<br>\' : escapeHtml(line.text)\n  return div(SIG_P_STYLE, line.bold ? `<b>${inner}</b>` : inner)',
      '  const inner = line.text.trim() === \'\' ? \'<br>\' : escapeHtml(line.text)\n  return line.bold ? `<div><b>${inner}</b></div>` : div(SIG_P_STYLE, inner)'))
    variantFails('V4', v.S.signatureBlockHtml(SIG).includes('<div><b>Dominic Bonini</b></div>'),
      'a bold line put in its own unstyled div: it inherits the client default and renders smaller')
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
    const built = M.buildMessage({ body: 'Hello.', subject: 'Taking orders online', messageId: '<v6@hatchgrab.com>', settings: SETTINGS })
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

  {
    // V9 — THE TOKENS STOP PASSING THROUGH THE COMPOSE RENDERER. They then resolve to nothing, so the
    // box shows `[[signature]]` and every message lists a "still to fill" field nobody can fill.
    const v = variant('v9', 'lib/outreach-template-render.ts', src => src.replace(
      "    case 'signature': return '{{signature}}'", '    // removed'))
    const tpl = { id: 't', label: 'T', channel: 'email', subject: 'S', body: '{{signature}}' }
    const ctx = { truckName: null, contactName: null, contactFirstName: null, contactLastName: null,
      website: null, orderUrl: null, nextEventDate: null, nextEventVenue: null, demoLink: null,
      compareLink: null, leadType: null }
    const out = v.R2.renderTemplate(tpl, ctx)
    variantFails('V9', out.body.includes('[[signature]]') && out.unresolved.includes('signature'),
      'the pass-through removed: {{signature}} renders as an unresolvable [[signature]] in the box')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V10 — THE TEXT PART STOPS STRIPPING HTML. This is the defect verbatim: `text_body` on the last
    // real send carried a literal `<br><br>`.
    const v = variant('v10', 'lib/outreach-signature.ts', src => src.replace(
      /export function stripHtmlToText\(s: string\): string \{[\s\S]*?\n\}/,
      'export function stripHtmlToText(s: string): string {\n  return String(s ?? \'\')\n}'))
    const { text } = v.S.expandBody('Hi Sam,<br><br>done.', SETTINGS)
    variantFails('V10', text.includes('<br>'),
      'the text/plain part carries `<br>` tags instead of line breaks')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V11 — A FIRST CONTACT IS ALLOWED TO THREAD. The exact production failure: a first contact to a
    // prospect whose imported history contained Dominic's own test emails went out as
    // "Re: Test email to me again".
    const v = variant('v11', 'lib/outreach-send-rules.ts', src => src.replace(
      "  return kind === FIRST_CONTACT_KIND", '  return false'))
    variantFails('V11', v.R.startsNewThread('1_first_contact') === false,
      'the first-contact rule removed: a first contact is eligible to reply to an earlier email')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V12 — THE SIGNATURE IS APPENDED AUTOMATICALLY AGAIN, so a message written deliberately without
    // one gets one anyway — and `{{opt_out}}` placement stops meaning anything.
    const v = variant('v12', 'lib/outreach-signature.ts', src => src.replace(
      '  return { html: htmlOut.join(\'\'), text: textOut.join(\'\\n\\n\') }',
      '  return { html: htmlOut.join(\'\') + signatureBlockHtml(values.signature ?? { lines: [] }), text: textOut.join(\'\\n\\n\') }'))
    const { html } = v.S.expandBody('Hi Sam, no token here.', SETTINGS)
    variantFails('V12', html.includes('Kind regards,'),
      'an automatic append restored: a message with no {{signature}} gets one anyway')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }

  const { M, R, E, T, F, S, R2, L } = build(REPO, 'omsReal')
  const SEND_ROUTE = fs.readFileSync(path.join(REPO, 'app/api/admin/outreach/mail-send/route.ts'), 'utf8')

  console.log('\n── THE SIGNATURE IS DATA, AND THE TOKEN PLACES IT ──────────────────────────────────────')
  {
    // 🔴 THE EXPECTED STRING IS WRITTEN OUT IN FULL, not assembled from the pieces the lib uses. A
    // check built from the lib's own constants would pass however they changed, which is no check.
    const want =
      `<div style="${P12}">Kind regards,</div>` +
      `<div style="${P12}">Dominic</div>` +
      `<div style="${P12}"><br></div>` +
      `<div style="${P12}"><br></div>` +
      `<div style="${P12}"><b>Dominic Bonini</b></div>` +
      `<div style="${P12}">Founder, HatchGrab</div>` +
      `<div style="${P12}">hatchgrab.com | villagefoodie.co.uk</div>` +
      `<div style="${P12}">07941 042 253</div>`
    eq(S.signatureBlockHtml(SIG), want, 'the signature block is the stored lines, each in a 12pt div')
    // 🔴 THE BUG THIS REPLACES: the captured block emitted `<div><b>Dominic Bonini</b></div>` with NO
    // style, so that line inherited the client default and arrived visibly SMALLER than the rest.
    check(want.includes(`<div style="${P12}"><b>Dominic Bonini</b></div>`),
      '🔴 a bold line is <b> INSIDE the 12pt div — never a div with no style')
    check(!/<div><b>/.test(want), '…so no unstyled div survives anywhere in the block')
    eq(S.optOutHtml(OPT), `<div style="${P10}">If you would rather not hear from me again, reply with &quot;no thanks&quot; and I will not contact you.</div>`,
      'the opt-out line is one 13.333333px div, quotes escaped')
    check(!/<a[\s>]/i.test(want), 'no <a> anywhere — the domains are plain text')
    eq(S.signatureBlockText(SIG).split('\n')[4], 'Dominic Bonini', 'the text form keeps the lines and the blanks')
    eq(S.parseSignature({ lines: [{ text: 'x' }] }).lines[0].bold, false, 'a missing `bold` parses as false')
    eq(S.parseSignature({ lines: [{ bold: true }] }), null, 'a line with no text is a malformed row, not a blank line')
    eq(S.parseOptOut({ text: '   ' }), null, 'a blank opt-out row is malformed — it is a legal sentence, not a field')
  }

  console.log('\n── TOKEN EXPANSION, IN BOTH PARTS ───────────────────────────────────────────────────────')
  {
    const body = 'Hi Sam,\n\nWorth a look?\n\n{{signature}}\n\n{{opt_out}}'
    const { html, text } = S.expandBody(body, SETTINGS)
    check(html.startsWith(`<div style="${P12}">Hi Sam,</div>`), 'the prose is still the captured paragraph div')
    check(html.includes(`<div style="${P12}"><b>Dominic Bonini</b></div>`), 'the signature block is expanded in place')
    check(html.includes(`<div style="${P10}">`), 'the opt-out is expanded at 10pt')
    check(html.indexOf('Kind regards,') > html.indexOf('Worth a look?'), 'and it lands where the token was')
    check(html.indexOf('rather not hear') > html.indexOf('07941 042 253'), 'the opt-out follows the signature, as the text says')
    // 🔴 SPACING IS WHATEVER THE TEXT SAYS. A blank line before the token is a spacer div — which is
    // the missing blank line between the last paragraph and "Kind regards," in the sent email.
    const spacers = html.split(`<div style="${P12}"><br></div>`).length - 1
    check(spacers >= 4, `blank lines become spacer divs (${spacers} of them here)`)
    check(text.includes('Kind regards,\nDominic'), 'the text part carries the signature lines')
    check(text.trim().endsWith('I will not contact you.'), 'and ends with the opt-out sentence')

    // 🔴 NOTHING IS APPENDED WHEN THE TOKEN IS ABSENT. This is the whole change, so it is asserted
    // directly rather than inferred from the presence of the token in the other test.
    const bare = S.expandBody('Hi Sam,\n\nWorth a look?', SETTINGS)
    check(!bare.html.includes('Kind regards,'), '🔴 no {{signature}} in the body ⇒ NO signature in the HTML')
    check(!bare.text.includes('Kind regards,'), '…and none in the text either')
    check(!bare.html.includes('rather not hear'), '…and no opt-out line appears from nowhere')

    eq(S.sendTimeTokensIn(body).join(','), 'signature,opt_out', 'both tokens are found, in order')
    eq(S.sendTimeTokensIn('a {{signature}} b').length, 0,
      '⚠️ a token mid-sentence is NOT a block and is left alone')
    eq(S.missingSettingsFor(body, { signature: null, optOut: OPT }).join(','), 'signature',
      'a body needing a row that is not there is reported — the send refuses on this')
    eq(S.missingSettingsFor('no tokens here', { signature: null, optOut: null }).length, 0,
      '…and a body needing nothing needs nothing')
  }

  console.log('\n── THE TOKENS SURVIVE THE COMPOSE RENDERER UNTOUCHED ────────────────────────────────────')
  {
    // 🔴 THEY RESOLVE TO THEMSELVES in `resolvedValue`, so `substitute` writes them back unchanged and
    // `unresolvedIn` never sees them. If they were merely unknown they would render as `[[signature]]`
    // and be listed as "still to fill" — a field the operator cannot fill, on every single message.
    const tpl = { id: 't', label: 'T', channel: 'email', subject: 'S', body: 'Hi{{contact_name_prefixed}},\n\n{{signature}}\n\n{{opt_out}}' }
    const ctx = { truckName: 'T', contactName: null, contactFirstName: null, contactLastName: null,
      website: null, orderUrl: null, nextEventDate: null, nextEventVenue: null, demoLink: null,
      compareLink: null, leadType: null }
    const out = R2.renderTemplate(tpl, ctx)
    check(out.body.includes('{{signature}}'), '{{signature}} is still literally in the rendered box')
    check(out.body.includes('{{opt_out}}'), '{{opt_out}} too')
    check(!out.body.includes('[[signature]]'), '…not turned into an unresolved marker')
    eq(out.unresolved.filter(u => u === 'signature' || u === 'opt_out').length, 0,
      '🔴 neither counts as "still to fill" — they are deferred, not outstanding')
    eq(R2.malformedTokensIn('{{signature}} {{opt_out}}').length, 0,
      'the malformed-token guard recognises both as well formed')
    check(R2.malformedTokensIn('{{Signature}}').length === 1,
      '…and still catches a mistyped one, which would otherwise reach a prospect verbatim')
    const ref = R2.resolvedTokenReference().map(t => t.name)
    check(ref.includes('signature') && ref.includes('opt_out'),
      'both appear in the Templates tab reference, derived from the code')
    check(R2.resolvedTokenReference().filter(t => t.name === 'signature')[0].documented,
      '…with a description, not marked undocumented')
  }

  console.log('\n── COPY AND LOG NEVER EMIT A RAW TOKEN ──────────────────────────────────────────────────')
  {
    // 🔴 THE CONTACT LOG IS THE RECORD OF WHAT WAS SENT. A row holding `{{signature}}` is not a record
    // of an email anybody received, and it is the thing read months later to decide what to say next.
    const out = S.expandToPlainText('Hi Sam,\n\n{{signature}}\n\n{{opt_out}}', SETTINGS)
    check(!out.includes('{{'), 'no `{{` survives into the copied / logged text')
    check(out.includes('Dominic Bonini'), 'the signature is there as plain text')
    check(out.includes('rather not hear from me again'), 'and so is the opt-out sentence')
    check(!/<[a-z]/i.test(out), 'and it is plain text — no tags at all')
  }

  console.log('\n── THE TEXT PART CARRIES NO HTML ────────────────────────────────────────────────────────')
  {
    // 🔴 THE DEFECT: `text_body` on the last real send contained a literal `<br><br>`. The old
    // `bodyText` passed the body through untouched, so a `<br>` typed in a template arrived as four
    // characters in the text/plain part — and as `&lt;br&gt;` in the HTML part, visible to the reader.
    const body = 'Hi Sam,<br><br>Line two &amp; three.\n\n{{signature}}'
    const { html, text } = S.expandBody(body, SETTINGS)
    check(!text.includes('<'), '🔴 the text part contains no "<" at all')
    check(text.includes('Hi Sam,\n\nLine two & three.'), '`<br><br>` became line breaks and `&amp;` decoded')
    check(html.includes('Hi Sam,<br><br>Line two'), 'and the HTML part uses real <br> tags, not escaped ones')
    check(!html.includes('&lt;br&gt;'), '…so the prospect never sees the characters "<br>"')
    eq(S.stripHtmlToText('<p>a</p><b>b</b>'), 'ab', 'any other tag is dropped from the text part')
    eq(S.stripHtmlToText('price &lt; 5'), 'price < 5', 'entities decode last, so an escaped < is not re-stripped')
    eq(S.stripHtmlToText('a &amp;lt; b'), 'a &lt; b', '…and `&amp;lt;` decodes ONCE, not twice')
  }

  console.log('\n── THE WARNINGS (warnings, not refusals) ────────────────────────────────────────────────')
  {
    eq(S.sendWarnings('{{signature}}\n\n{{opt_out}}', '1_first_contact').length, 0, 'both tokens present: no warning')
    eq(S.sendWarnings('no tokens', '1_first_contact').length, 2, 'a first contact with neither: two warnings')
    eq(S.sendWarnings('{{signature}}', '2_chase_1')[0], 'This outreach email has no {{opt_out}} line.',
      'a chase with no opt-out is named')
    eq(S.sendWarnings('{{signature}}', 'reply_handling').length, 0,
      '⚠️ a NON-ladder kind is not warned about an opt-out — a reply to a question is not a cold approach')
    eq(S.sendWarnings('{{opt_out}}', null)[0], 'No {{signature}} in this message — it will go without your signature.',
      'a missing signature is warned about whatever the kind')
  }

  console.log('\n── A FIRST CONTACT ──────────────────────────────────────────────────────────────────────')
  {
    const built = M.buildMessage({
      body: "Hi Sam,\n\nI build ordering for food trucks.\n\nWorth a look?",
      subject: 'Taking orders online', messageId: '<first@hatchgrab.com>', settings: SETTINGS,
    })
    eq(built.subject, 'Taking orders online', 'a first contact keeps the template subject — no Re:')
    eq(built.inReplyTo, null, 'no In-Reply-To')
    eq(built.references, null, 'no References')
    check(!built.html.includes('mail-editor-reference-message-container'), 'no quote block')
    check(built.html.startsWith('<div style="font-family: Aptos, Arial, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0);">Hi Sam,</div>'),
      'the first paragraph is the captured paragraph div')
    check(built.html.includes('<div style="font-family: Aptos, Arial, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0);"><br></div>'),
      'paragraphs are separated by an empty div of the same style, not a margin')
    // 🔴 ESCAPING IS STILL ESCAPING, with one deliberate hole: `<br>`. Everything else a truck name
    // could contain still cannot become markup.
    eq(S.expandBody("Bill & Ben's <Truck>", SETTINGS).html,
      `<div style="${P12}">Bill &amp; Ben's &lt;Truck&gt;</div>`,
      "a truck called `Bill & Ben's <Truck>` is escaped, not turned into markup")
  }

  console.log('\n── A CHASE IS A REPLY IN THREE PLACES AT ONCE ───────────────────────────────────────────')
  {
    const built = M.buildMessage({
      body: 'Just following up.', subject: 'ignored on a reply', messageId: '<chase@hatchgrab.com>',
      settings: SETTINGS,
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
      settings: SETTINGS,
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

  console.log('\n── THREADING: A FIRST CONTACT IS NEVER A REPLY ─────────────────────────────────────────')
  {
    // 🔴 THE PRODUCTION FAILURE: a first contact to ZZ Test Prospect went out as
    // "Re: Test email to me again", because the importer had matched Dominic's own September test
    // emails to that address and the rule was "reply whenever any earlier outbound email exists".
    check(R.startsNewThread('1_first_contact'), '🔴 1_first_contact starts a NEW thread, always')
    check(!R.startsNewThread('2_chase_1'), 'a chase does not')
    check(!R.startsNewThread('3_chase_2') && !R.startsNewThread('4_final_chase'), 'nor do the later rungs')
    check(!R.startsNewThread(null), 'an unstated kind does not start a new thread — it threads, and the refusal covers it')
    // The route must apply it BEFORE looking for a parent, or the lookup decides and the rule is decoration.
    check(/const firstContact = startsNewThread\(sendKind\)/.test(SEND_ROUTE),
      'the send resolves the rule into a variable before the parent lookup')
    check(/firstContact \? undefined : await threadParent\(prospectId\)/.test(SEND_ROUTE),
      '🔴 …and a first contact never even looks for a parent')
    check(/\.eq\('prospect_id', prospectId\)\.eq\('is_test', false\)/.test(SEND_ROUTE),
      'the parent lookup is no longer filtered to outbound — EITHER DIRECTION')
    check(/\.in\('status', \['sent', 'uncertain', 'received'\]\)/.test(SEND_ROUTE),
      "…and `received` counts, so a chase threads onto the prospect's REPLY when that is the latest")
    check(/is_test/.test(SEND_ROUTE.slice(SEND_ROUTE.indexOf('async function threadParent'), SEND_ROUTE.indexOf('async function threadParent') + 700)),
      '⚠️ a test send is still excluded from the thread — it went to Dominic, not the prospect')
    // The window must ask with the rung, or it promises a reply the send will not make.
    check(/searchParams\.get\('kind'\)/.test(SEND_ROUTE) && /if \(!startsNewThread\(kind\)\)/.test(SEND_ROUTE),
      '🔴 the GET the compose window calls applies the SAME rule, so the two cannot disagree')
  }

  console.log('\n── THE STAGE MOVES ON A REAL SEND, AND NOT ON A TEST ────────────────────────────────────')
  {
    // 🔴 THROUGH THE SAME WRITER AS THE Log BUTTON. `logOutreachContact` is the one place a rung is
    // written and the one place the conditional stage move lives; a send that did its own insert
    // would produce a ladder that disagreed with itself depending on which button was pressed.
    const calls = []
    const mock = (stageRow) => ({
      from(table) {
        const q = {
          _table: table, _filters: {},
          insert(v) { calls.push(['insert', table, v]); return q },
          update(v) { calls.push(['update', table, v]); return q },
          select() { return q },
          eq(col, val) { q._filters[col] = val; return q },
          single: async () => ({ data: { id: 'c1' }, error: null }),
          then: undefined,
        }
        // `.select('id, stage')` on the prospect update resolves to the moved row.
        q.then = (res) => res({ data: table === 'outreach_prospects' ? stageRow : null, error: null })
        return q
      },
    })
    const out = await L.logOutreachContact(mock([{ id: 'p1', stage: 'contacted' }]), {
      prospect_id: 'p1', channel: 'email', direction: 'outbound', kind: '1_first_contact', message: 'hi',
    })
    eq(out.ok, true, 'a rung is written')
    eq(out.stage, 'contacted', '🔴 not_contacted → contacted, reported back')
    const upd = calls.find(c => c[0] === 'update' && c[1] === 'outreach_prospects')
    check(!!upd && upd[2].stage === 'contacted', 'the move is an update to outreach_prospects')
    check(calls.some(c => c[0] === 'insert' && c[1] === 'outreach_contacts'), 'and the rung is a contact row')

    // ⚠️ A TEST WRITES NOTHING AT ALL, and the route is what guarantees it: the log block is guarded.
    check(/if \(!isTest && result\.status === 'sent'\) \{/.test(SEND_ROUTE),
      '🔴 the send logs ONLY for a non-test message the server accepted')
    const logBlock = SEND_ROUTE.slice(SEND_ROUTE.indexOf("if (!isTest && result.status === 'sent')"))
      .slice(0, SEND_ROUTE.slice(SEND_ROUTE.indexOf("if (!isTest && result.status === 'sent')")).indexOf('\n  }\n') + 4)
    check(/logOutreachContact\(/.test(logBlock), '…through logOutreachContact, inside that guard')
    // ⚠️ THE ROUTE DOES NAME `outreach_contacts` ONCE — a `count` for the threading decision. What it
    // must never do is WRITE one, so the assertion is about the write, not the name. (A first draft
    // banned the name outright and failed on that count, which is a read.)
    const contactRefs = SEND_ROUTE.match(/from\('outreach_contacts'\)[\s\S]{0,80}/g) ?? []
    eq(contactRefs.length, 1, 'the route touches outreach_contacts exactly once')
    check(/\.select\('id', \{ count: 'exact', head: true \}\)/.test(contactRefs[0]),
      '…and it is a COUNT for the threading decision, not a write')
    check(!contactRefs.some(r => /\.insert\(|\.upsert\(|\.update\(|\.delete\(/.test(r)),
      '🔴 the route never inserts, updates or deletes a contact row itself')
    check(!/from\('outreach_prospects'\)[\s\S]{0,120}\.update\(/.test(SEND_ROUTE),
      '…and never moves a stage itself, so a test send cannot move one')
    check(/message: expandToPlainText\(bodyIn, settingsRead\.values\)/.test(SEND_ROUTE),
      '🔴 the logged message is the EXPANDED text — a history row never holds a raw token')
  }

  console.log('\n── THE SENT COPY: ONE SET OF BYTES, SEARCH TWICE, THEN APPEND ──────────────────────────')
  {
    // 🔴 THE DEFECT: `info.message` is populated by the STREAM transport only. Over SMTP it is
    // undefined, so `raw` was null, the append branch was skipped, and nothing recorded a reason —
    // `sent_copy: 'absent'`, `last_error: null`, which is the row Dominic found.
    check(!/info as \{ message\?: Buffer \}/.test(SEND_ROUTE),
      '🔴 the route no longer reads the composed bytes off the SMTP result')
    check(/raw = await composeRaw\(row\)/.test(SEND_ROUTE), 'it composes them itself, once, before sending')
    check(/sendMail\(rawMailFor\(raw, row\)\)/.test(SEND_ROUTE), '…sends exactly those bytes')
    check(/appendToSent\(client, raw, date\)/.test(fs.readFileSync(path.join(REPO, 'app/api/admin/outreach/mail-send/route.ts'), 'utf8')),
      '…and appends exactly those bytes, so the Sent copy is byte-identical')
    check(/SENT_REFETCH_DELAY_MS = 3_000/.test(SEND_ROUTE), 'the second search waits ~3 seconds')
    const seq = SEND_ROUTE.slice(SEND_ROUTE.indexOf('async function fileSentCopy'))
    const iFind1 = seq.indexOf('findInSent')
    const iWait = seq.indexOf('SENT_REFETCH_DELAY_MS')
    const iFind2 = seq.indexOf('findInSent', iWait)
    const iAppend = seq.indexOf('appendToSent')
    check(iFind1 > 0 && iWait > iFind1 && iFind2 > iWait && iAppend > iFind2,
      '🔴 the order is search → wait → search → append, so a late-filed copy is never duplicated')
    check(/reason: `append refused/.test(SEND_ROUTE) || /append refused/.test(SEND_ROUTE),
      'a refused append records WHY')
    check(/last_error: `sent copy: \$\{copy\.reason\}`/.test(SEND_ROUTE),
      "🔴 an absent copy now writes its reason to last_error — the old row had 'absent' and null")
    check(/action === 'save_to_sent'/.test(SEND_ROUTE), 'and "Save to Sent" repeats the sequence')
    const save = SEND_ROUTE.slice(SEND_ROUTE.indexOf("action === 'save_to_sent'"), SEND_ROUTE.indexOf("action === 'view'"))
    check(!/transporter|sendMail/.test(save), '🔴 …and it never sends — no transport is even constructed on that path')
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
