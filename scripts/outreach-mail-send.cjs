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
  'lib/outreach-template-render.ts', 'lib/outreach-contact-log.ts', 'lib/outreach-doc.ts',
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
    D: req('lib/outreach-doc.js'),
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
/** The signature as `lib/outreach-doc.ts` takes it. Same rows, the shape the editor uses. */
const SIG_LINES = SIG.lines.map(l => ({ text: l.text, bold: l.bold }))
const DOC_SETTINGS = { signatureLines: SIG_LINES, optOut: OPT.text }
/** The template Dominic actually sends, tokens and all. */
const TEMPLATE_TEXT = 'Hi Sam,\n\nI build ordering for food trucks.\n\nWorth a look?\n\n{{signature}}\n\n{{opt_out}}'

/**
 * 🔴 THE FROZEN OUTPUT OF THE PREVIOUS BUILD, written out in full.
 * This is what the token-expansion sender produced for TEMPLATE_TEXT, and it is the markup Dominic
 * verified in his own inbox on 29 September. The editor pipeline — template → document → HTML — must
 * equal it byte for byte. ⚠️ IT IS A LITERAL, NOT A SECOND LIVE IMPLEMENTATION. Comparing two live
 * code paths only proves they agree; both can drift together. A frozen string cannot drift.
 */
const GOLDEN_HTML =
  `<div style="${P12}">Hi Sam,</div>` +
  `<div style="${P12}"><br></div>` +
  `<div style="${P12}">I build ordering for food trucks.</div>` +
  `<div style="${P12}"><br></div>` +
  `<div style="${P12}">Worth a look?</div>` +
  `<div style="${P12}"><br></div>` +
  `<div style="${P12}">Kind regards,</div>` +
  `<div style="${P12}">Dominic</div>` +
  `<div style="${P12}"><br></div>` +
  `<div style="${P12}"><br></div>` +
  `<div style="${P12}"><b>Dominic Bonini</b></div>` +
  `<div style="${P12}">Founder, HatchGrab</div>` +
  `<div style="${P12}">hatchgrab.com | villagefoodie.co.uk</div>` +
  `<div style="${P12}">07941 042 253</div>` +
  `<div style="${P12}"><br></div>` +
  `<div style="${P10}">If you would rather not hear from me again, reply with &quot;no thanks&quot; and I will not contact you.</div>`
const GOLDEN_TEXT =
  'Hi Sam,\n\nI build ordering for food trucks.\n\nWorth a look?\n\nKind regards,\nDominic\n\n\n' +
  'Dominic Bonini\nFounder, HatchGrab\nhatchgrab.com | villagefoodie.co.uk\n07941 042 253\n\n' +
  'If you would rather not hear from me again, reply with "no thanks" and I will not contact you.'

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
    const built = M.buildMessage({ doc: v.D.docFromTemplateText('Hello.', DOC_SETTINGS), subject: 'Taking orders online', messageId: '<v6@hatchgrab.com>' })
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
    // V10 — THE SCHEMA STOPS REFUSING AND STARTS IGNORING. A disallowed mark is dropped instead of
    // stopping the send, which is the sanitiser-shaped mistake `validateDoc` exists to avoid: a
    // blocklist that quietly lets through the first thing nobody thought of.
    const v = variant('v10', 'lib/outreach-doc.ts', src => src.replace(
      "            return { ok: false, error: `“${String(t)}” formatting is not allowed in an outreach email` }",
      '            continue'))
    const out = v.D.validateDoc({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link' }] }] }] })
    variantFails('V10', out.ok === true,
      'a disallowed mark is silently dropped instead of refusing the send')
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
    // V12 — AN EMPTY PARAGRAPH STOPS PRODUCING ITS `<br>` DIV. An empty div collapses to nothing in
    // most clients, so every blank line the operator typed — including the one above "Kind regards," —
    // silently disappears on the way to the prospect.
    const v = variant('v12', 'lib/outreach-doc.ts', src => src.replace(
      '    if (!kids.length) return `<div style="${P_STYLE}"><br></div>`',
      '    if (!kids.length) return `<div style="${P_STYLE}"></div>`'))
    const html = v.D.docToHtml(v.D.docFromTemplateText(TEMPLATE_TEXT, DOC_SETTINGS))
    variantFails('V12', html !== GOLDEN_HTML && html.includes('"></div>'),
      'an empty paragraph renders as an empty div: every blank line vanishes in most clients')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V13 — THE SERVER APPENDS THE SIGNATURE AGAIN, so a message written deliberately without one
    // gets one anyway and the whole "what is in the box is what is sent" rule is a lie.
    const v = variant('v13', 'lib/outreach-mail-message.ts', src => src.replace(
      '  const bodyH = docToHtml(input.doc)',
      "  const bodyH = docToHtml(input.doc) + '<div>Kind regards,</div>'"))
    const built = v.M.buildMessage({ doc: v.D.docFromTemplateText('Hi Sam.', DOC_SETTINGS), subject: 'S', messageId: '<v13@hatchgrab.com>' })
    variantFails('V13', built.html.includes('Kind regards,'),
      'the server appends to the document: the box stops being the email')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V14 — TEXT NODES STOP BEING ESCAPED. A prospect's own name could carry markup, and a pasted
    // `<script>` would stop being four-and-a-bit words of text.
    const v = variant('v14', 'lib/outreach-doc.ts', src => src.replace(
      '      let html = escapeHtml(k.text)', '      let html = k.text'))
    const html = v.D.docToHtml({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '<script>x</script>' }] }] })
    variantFails('V14', html.includes('<script>'),
      'text is no longer escaped: script-like text becomes a tag in the email')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }

  const { M, R, E, T, F, S, R2, L, D } = build(REPO, 'omsReal')
  const SEND_ROUTE = fs.readFileSync(path.join(REPO, 'app/api/admin/outreach/mail-send/route.ts'), 'utf8')
  /** The send itself lives here since Build 2 — see the re-anchor note in the Sent-copy section. */
  const DELIVER = fs.readFileSync(path.join(REPO, 'lib/outreach-mail-deliver.ts'), 'utf8')

  console.log('\n── THE SIGNATURE PANEL\'S OWN RENDERER ──────────────────────────────────────────────────')
  // ⚠️ `lib/outreach-signature.ts` NO LONGER BUILDS EMAILS — `lib/outreach-doc.ts` does. What is left
  // of it draws the Signature tab's preview, and these assertions cover that, plus the parsers every
  // reader of the settings rows shares.
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

  console.log('\n── TEMPLATE → DOCUMENT → THE SAME BYTES AS THE VERIFIED BUILD ─────────────────────────')
  {
    // 🔴 THE CONSISTENCY CHECK. The previous build expanded `{{signature}}` and `{{opt_out}}` on the
    // SERVER at send time; this build expands them into the EDITOR when the template is chosen and the
    // server converts the resulting document. The two must produce identical markup, because the old
    // output is the one Dominic read in his inbox.
    const doc = D.docFromTemplateText(TEMPLATE_TEXT, DOC_SETTINGS)
    eq(D.docToHtml(doc), GOLDEN_HTML, '🔴 template → document → HTML is byte-identical to the verified build')
    eq(D.docToText(doc), GOLDEN_TEXT, '…and so is the text part')
    check(!D.docToText(doc).includes('<'), 'the text part contains no "<" at all')
    check(!D.docToText(doc).includes('{{'), 'and no token survives into either part')
  }

  console.log('\n── THE DOCUMENT → THE CAPTURED MARKUP ───────────────────────────────────────────────────')
  {
    const t = (text, marks) => (marks ? { type: 'text', text, marks: marks.map(m => ({ type: m })) } : { type: 'text', text })
    const para = (...content) => ({ type: 'paragraph', content })
    eq(D.docToHtml({ type: 'doc', content: [para(t('plain'))] }), `<div style="${P12}">plain</div>`,
      'a paragraph is one 12pt div — never a <p>, never a margin')
    // 🔴 THE "Dominic Bonini rendered smaller" BUG. An unstyled <div><b>…</b></div> inherits the
    // client's default size; bold is a property of the text, not a reason to drop the style.
    eq(D.docToHtml({ type: 'doc', content: [para(t('Dominic Bonini', ['bold']))] }),
      `<div style="${P12}"><b>Dominic Bonini</b></div>`, '🔴 Bold is <b> INSIDE the 12pt div')
    // An empty div collapses to nothing in most clients, so a typed blank line would silently vanish.
    eq(D.docToHtml({ type: 'doc', content: [{ type: 'paragraph' }] }), `<div style="${P12}"><br></div>`,
      '🔴 an empty paragraph is the styled div containing <br>, not an empty div')
    eq(D.docToHtml({ type: 'doc', content: [para(t('a'), { type: 'hardBreak' }, t('b'))] }),
      `<div style="${P12}">a<br>b</div>`, 'a hard break is <br> inside the paragraph')
    eq(D.docToHtml({ type: 'doc', content: [para(t('small line', ['small']))] }),
      `<div style="${P10}">small line</div>`,
      '🔴 a paragraph that is ENTIRELY small becomes a 10pt DIV — what the captured opt-out line is')
    eq(D.docToHtml({ type: 'doc', content: [para(t('big '), t('small', ['small']))] }),
      `<div style="${P12}">big <span style="${P10}">small</span></div>`,
      '…and small MIXED into a 12pt paragraph becomes a span')
    eq(D.docToHtml({ type: 'doc', content: [para(t('a & b <c> "d"'))] }),
      `<div style="${P12}">a &amp; b &lt;c&gt; &quot;d&quot;</div>`, 'all text is HTML-escaped')
    eq(D.docToHtml({ type: 'doc', content: [para(t('x', ['bold', 'small']))] }),
      `<div style="${P10}"><b>x</b></div>`, 'bold AND small together: a 10pt div with <b> inside')
    eq(D.docToText({ type: 'doc', content: [para(t('a'), { type: 'hardBreak' }, t('b')), { type: 'paragraph' }, para(t('c'))] }),
      'a\nb\n\nc', 'the text part comes from the document, so there is nothing to strip')
  }

  console.log('\n── THE SCHEMA REFUSES; IT DOES NOT CLEAN ────────────────────────────────────────────────')
  {
    const ok = D.validateDoc({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] })
    eq(ok.ok, true, 'an allowed document validates')
    // 🔴 REFUSE, NEVER STRIP. A sanitiser that silently drops a node is one nobody ever checks, and the
    // first thing it gets wrong is emailed to a stranger under Dominic's name.
    const link = D.validateDoc({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs: { href: 'http://x' } }] }] }] })
    eq(link.ok, false, '🔴 a link mark is REFUSED')
    check(link.error.includes('link'), '…and the refusal names it')
    eq(D.validateDoc({ type: 'doc', content: [{ type: 'image', attrs: { src: 'x' } }] }).ok, false, 'an image node is refused')
    eq(D.validateDoc({ type: 'doc', content: [{ type: 'heading', content: [] }] }).ok, false, 'a heading is refused')
    eq(D.validateDoc({ type: 'doc', content: [{ type: 'bulletList', content: [] }] }).ok, false, 'a list is refused')
    eq(D.validateDoc({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'italic' }] }] }] }).ok,
      false, 'even a harmless-looking italic is refused — the mark list is two long, on purpose')
    eq(D.validateDoc(null).ok, false, 'no document at all is refused')
    eq(D.validateDoc({ type: 'doc', content: [] }).ok, false, 'an empty document is refused')
    // ⚠️ SCRIPT-LIKE TEXT IS TEXT. It cannot become markup, because the server ESCAPES every text node.
    const scripty = D.validateDoc({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '<script>alert(1)</script>' }] }] })
    eq(scripty.ok, true, 'text that looks like a script is still text, and validates')
    check(D.docToHtml(scripty.doc).includes('&lt;script&gt;'), '…and comes out escaped, never as a tag')
    // A stray attribute riding on a text node must not reach the HTML.
    const extra = D.validateDoc({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', attrs: { onerror: 'boom' } }] }] })
    eq(extra.ok, true, 'an unknown attribute does not fail validation…')
    check(!JSON.stringify(extra.doc).includes('onerror'), '…because the node is REBUILT from the allowed fields only')
  }

  console.log('\n── THE SERVER APPENDS NOTHING ───────────────────────────────────────────────────────────')
  {
    const doc = D.docFromTemplateText('Hi Sam,\n\nWorth a look?', DOC_SETTINGS)
    const html = D.docToHtml(doc)
    check(!html.includes('Kind regards,'), '🔴 a document with no signature produces no signature')
    check(!html.includes('rather not hear'), '…and no opt-out line appears from nowhere')
    const built = M.buildMessage({ doc, subject: 'S', messageId: '<x@hatchgrab.com>' })
    eq(built.html, html, '🔴 buildMessage adds NOTHING to the document on a first contact')
    // 🔴 A LITERAL TOKEN IS A REFUSAL. Nothing expands it any more, so it would be emailed verbatim.
    const typed = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '{{signature}}' }] }] }
    eq(D.literalTokenRefusal(typed),
      'Your message still contains {{signature}} — use Insert signature instead.',
      'a hand-typed {{signature}} is refused, and the sentence names the button')
    eq(D.literalTokenRefusal({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '{{opt_out}}' }] }] }),
      'Your message still contains {{opt_out}} — use Insert opt-out instead.', 'and so is {{opt_out}}')
    eq(D.literalTokenRefusal(doc), null, 'an ordinary document is not refused')
    const ROUTE = fs.readFileSync(path.join(REPO, 'app/api/admin/outreach/mail-send/route.ts'), 'utf8')
    check(!/expandBody|expandToPlainText|missingSettingsFor/.test(ROUTE),
      '🔴 the send route names no expansion function at all')
    check(/validateDoc\(body\.document\)/.test(ROUTE), 'it validates the document it is given')
    check(/literalTokenRefusal\(docIn\)/.test(ROUTE), '…and refuses a literal token')
  }

  console.log('\n── THE From HEADER, WITH AND WITHOUT A NAME ─────────────────────────────────────────────')
  {
    eq(D.fromDisplay(null, 'dominic@hatchgrab.com'), 'dominic@hatchgrab.com',
      'no name: the bare address, exactly as before this setting existed')
    eq(D.fromDisplay('   ', 'dominic@hatchgrab.com'), 'dominic@hatchgrab.com', 'a blank name is no name')
    eq(D.fromDisplay('Dominic Bonini', 'dominic@hatchgrab.com'), 'Dominic Bonini <dominic@hatchgrab.com>',
      'a name gives `Name <address>` — what the quote header on a reply shows')
    check(D.fromNameLooksLikeAddress('dominic@hatchgrab.com'), 'a name containing @ is flagged…')
    check(!D.fromNameLooksLikeAddress('Dominic Bonini'), '…and a plain one is not')
    // 🔴 THE COMPOSED BYTES ARE WHAT MATTERS, and nodemailer does the quoting — a comma in a display
    // name reads as an address separator unless the name is quoted, which is a spec detail worth
    // delegating rather than reimplementing.
    const doc = D.docFromTemplateText('Hi.', DOC_SETTINGS)
    const built = M.buildMessage({ doc, subject: 'S', messageId: '<n@hatchgrab.com>' })
    const bare = await compose(E.mailFor(ROW(built)))
    eq(header(bare, 'From'), 'dominic@hatchgrab.com', 'with no name the From header is the bare address')
    const named = await compose(E.mailFor({ ...ROW(built), from_name: 'Dominic Bonini' }))
    eq(header(named, 'From'), 'Dominic Bonini <dominic@hatchgrab.com>', 'with a name it is `Name <address>`')
    const comma = await compose(E.mailFor({ ...ROW(built), from_name: 'Bonini, Dominic' }))
    check(/^"Bonini, Dominic" <dominic@hatchgrab\.com>$/.test(header(comma, 'From')),
      '🔴 a name containing a comma is QUOTED, or the comma would read as a second recipient')
    const accent = await compose(E.mailFor({ ...ROW(built), from_name: 'Dominic Bonìni' }))
    check(/=\?UTF-8\?/.test(header(accent, 'From')) || header(accent, 'From').includes('Bonìni'),
      'a non-ASCII name is encoded rather than emitted raw')
    eq(M.disallowedHeaders(named).join(', ') || '(none)', '(none)',
      'a display name adds no header outside the allow-list')
  }

  console.log('\n── THE OPT-OUT WARNING (a warning, and the only one left) ───────────────────────────────')
  {
    const withOpt = D.docFromTemplateText(TEMPLATE_TEXT, DOC_SETTINGS)
    const without = D.docFromTemplateText('Hi Sam,\n\n{{signature}}', DOC_SETTINGS)
    eq(D.optOutWarning(withOpt, '1_first_contact', OPT.text), null, 'the sentence is there: no warning')
    eq(D.optOutWarning(without, '1_first_contact', OPT.text), 'This outreach email has no opt-out line.',
      'a first contact without it is warned about')
    eq(D.optOutWarning(without, '4_final_chase', OPT.text), 'This outreach email has no opt-out line.',
      'so is a final chase')
    eq(D.optOutWarning(without, 'reply_handling', OPT.text), null,
      '⚠️ a NON-ladder kind is not warned — a reply to a question is not a cold approach')
    eq(D.optOutWarning(without, null, OPT.text), null, 'nor is an unstated kind')
    // 🔴 IT CHECKS THE SENTENCE, NOT A TOKEN. Typed out by hand counts, because what a recipient needs
    // is the sentence and not the mechanism that put it there.
    const typedOut = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: OPT.text }] }] }
    eq(D.optOutWarning(typedOut, '1_first_contact', OPT.text), null,
      'the sentence typed by hand counts — it is the sentence that matters, not how it got there')
    const COMPOSE = fs.readFileSync(path.join(REPO, 'components/admin/ComposeWindow.tsx'), 'utf8')
    check(!/No \{\{signature\}\} in this message/.test(COMPOSE),
      'the "no signature" warning is gone — he can see the signature in the box now')
  }

  console.log('\n── A FIRST CONTACT ──────────────────────────────────────────────────────────────────────')
  {
    const built = M.buildMessage({
      doc: D.docFromTemplateText("Hi Sam,\n\nI build ordering for food trucks.\n\nWorth a look?", DOC_SETTINGS),
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
    // 🔴 ESCAPING IS STILL ESCAPING, with one deliberate hole: `<br>`. Everything else a truck name
    // could contain still cannot become markup.
    eq(D.docToHtml(D.docFromTemplateText("Bill & Ben's <Truck>", DOC_SETTINGS)),
      `<div style="${P12}">Bill &amp; Ben's &lt;Truck&gt;</div>`,
      "a truck called `Bill & Ben's <Truck>` is escaped, not turned into markup")
  }

  console.log('\n── A CHASE IS A REPLY IN THREE PLACES AT ONCE ───────────────────────────────────────────')
  {
    const built = M.buildMessage({
      doc: D.docFromTemplateText('Just following up.', DOC_SETTINGS),
      subject: 'ignored on a reply', messageId: '<chase@hatchgrab.com>',
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
      doc: D.docFromTemplateText('Just following up.', DOC_SETTINGS),
      subject: 'x', messageId: '<bytes@hatchgrab.com>',
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
          // ⚠️ `.is()`, `.lt()` AND `maybeSingle` WERE ADDED HERE (30 September 2026, CRM part 1) and
          // nothing this block asserts changed. The one writer now also (a) marks inbound messages
          // that arrived BEFORE this contact as handled — `.eq(direction).is(handled_at, null)
          // .lt(message_date, …)` on `outreach_messages` — and (b) reads the current stage before the
          // inbound move so the timeline can name what the prospect moved FROM. Both are recorded in
          // `calls`, so the assertions below still see exactly the writes they were written for.
          is(col, val) { q._filters[col] = val; return q },
          lt(col, val) { q._filters[col] = val; return q },
          single: async () => ({ data: { id: 'c1' }, error: null }),
          maybeSingle: async () => ({ data: { stage: 'not_contacted' }, error: null }),
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
    // 🔴 RESTATED 29 September (later the same day), NOT SILENTLY RE-ANCHORED. It used to read
    // `message: expandToPlainText(bodyIn, settingsRead.values)` — the send-time expansion. There is no
    // expansion any more: `bodyIn` IS the document's own plain text, which is a stronger form of the
    // same guarantee (a raw token cannot be in it, because a document holding one is refused outright).
    check(/const bodyIn = docPlainText\(docIn\)/.test(SEND_ROUTE),
      'the message text is the DOCUMENT\'s own text')
    check(/message: bodyIn/.test(SEND_ROUTE),
      '🔴 …and that is exactly what the contact log stores')
  }

  console.log('\n── THE SENT COPY: ONE SET OF BYTES, SEARCH TWICE, THEN APPEND ──────────────────────────')
  {
    // 🔴 THE DEFECT: `info.message` is populated by the STREAM transport only. Over SMTP it is
    // undefined, so `raw` was null, the append branch was skipped, and nothing recorded a reason —
    // `sent_copy: 'absent'`, `last_error: null`, which is the row Dominic found.
    check(!/info as \{ message\?: Buffer \}/.test(SEND_ROUTE + DELIVER),
      '🔴 the composed bytes are no longer read off the SMTP result')
    // 🔴 RE-ANCHORED 29 September (Build 2), AND SAID SO RATHER THAN DONE QUIETLY. `deliver` and
    // `fileSentCopy` were private to the send route until the reply poll needed to retry a temporary
    // failure; rather than copy them, they moved to `lib/outreach-mail-deliver.ts` and the route
    // imports them. Not one assertion below is weakened — each still names the same statement in the
    // same order — but they read the module that now holds it.
    // ⚠️ AND ONE IS ADDED WHILE THE ANCHOR IS OPEN: the route must not have grown its own copy back.
    check(/from '@\/lib\/outreach-mail-deliver'/.test(SEND_ROUTE),
      'the route IMPORTS the send rather than defining it')
    check(!/async function deliver\(|async function fileSentCopy\(/.test(SEND_ROUTE),
      '🔴 …and has no second copy of either')
    check(/raw = await composeRaw\(row\)/.test(DELIVER), 'it composes them itself, once, before sending')
    check(/sendMail\(rawMailFor\(raw, row\)\)/.test(DELIVER), '…sends exactly those bytes')
    check(/appendToSent\(client, raw, date\)/.test(DELIVER),
      '…and appends exactly those bytes, so the Sent copy is byte-identical')
    check(/SENT_REFETCH_DELAY_MS = 3_000/.test(DELIVER), 'the second search waits ~3 seconds')
    const seq = DELIVER.slice(DELIVER.indexOf('export async function fileSentCopy'))
    const iFind1 = seq.indexOf('findInSent')
    const iWait = seq.indexOf('SENT_REFETCH_DELAY_MS')
    const iFind2 = seq.indexOf('findInSent', iWait)
    const iAppend = seq.indexOf('appendToSent')
    check(iFind1 > 0 && iWait > iFind1 && iFind2 > iWait && iAppend > iFind2,
      '🔴 the order is search → wait → search → append, so a late-filed copy is never duplicated')
    check(/append refused/.test(DELIVER),
      'a refused append records WHY')
    check(/last_error: `sent copy: \$\{copy\.reason\}`/.test(DELIVER + SEND_ROUTE),
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
