#!/usr/bin/env node
// scripts/outreach-reply-attach.cjs — replying with the conversation attached to it, and files.
//   node scripts/outreach-reply-attach.cjs   (≈ 8 s: one compile, NO NETWORK, NO MAILBOX, NO DATABASE)
//
// 🔴 FAILURE MODE, in the order it would hurt:
//    a reply carrying SOMEBODY ELSE'S ACTIVE MARKUP out under Dominic's address — a form posting to
//    an author's server, a script, a remote stylesheet — because a quoted email is copied into a
//    message we sign; a reply sent to an address nobody has ever written from, because the browser
//    said so; a reply that quietly becomes a ladder rung, so §57 thinks a chase was sent; a reply
//    that threads onto the WRONG message, so the prospect sees a new conversation; a retry that
//    re-composes WITHOUT the attachments, so Sent disagrees with what the prospect received; or file
//    bytes travelling through the send request, which is the one shape this whole design avoids.
//
// HOW: the REAL libs compiled from lib/, the REAL message composed by nodemailer's `streamTransport`
// (in memory, no socket), and a source census over the routes and the compose window.
const fs = require('fs'); const path = require('path'); const os = require('os')
const nodemailer = require('nodemailer')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
let fails = 0
const check = (ok, label) => { console.log(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }
const eq = (got, want, label) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  console.log(`  ${ok ? '✓' : '🔴'} ${label}`)
  if (!ok) { console.log(`      want: ${JSON.stringify(want)}`); console.log(`      got:  ${JSON.stringify(got)}`); fails++ }
}

const FILES = [
  'lib/outreach-quote-sanitise.ts', 'lib/outreach-attachments.ts', 'lib/outreach-reply-rules.ts',
  'lib/outreach-mail-message.ts', 'lib/outreach-mail-envelope.ts', 'lib/outreach-doc.ts',
  'lib/outreach-signature.ts',
]
function build(root, tag) {
  const { out, req } = compile(root, FILES, tag)
  // 🔴 THE COMPILE OUTPUT DIR NEEDS `node_modules`: `lib/outreach-mail-envelope.ts` imports
  // nodemailer at RUNTIME to compose the bytes.
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(out, 'node_modules')) } catch { /* already */ }
  return {
    Q: req('lib/outreach-quote-sanitise.js'),
    A: req('lib/outreach-attachments.js'),
    R: req('lib/outreach-reply-rules.js'),
    M: req('lib/outreach-mail-message.js'),
    E: req('lib/outreach-mail-envelope.js'),
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
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const readStripped = f => stripComments(read(f))

/** A prospect's reply, as it sits in `outreach_messages` after the poll recorded it. */
const THEIR_REPLY = {
  fromAddress: 'sam@example-truck.test', fromName: null,
  toAddress: 'dominic@hatchgrab.com', toName: null,
  subject: 'Re: Taking orders online',
  date: new Date('2026-09-29T20:57:00Z'),
  html: '<div>Thanks — how do I sign up?</div>',
  text: 'Thanks — how do I sign up?',
}
const DOC_SETTINGS = { signatureLines: [{ text: 'Kind regards,' }, { text: 'Dominic', bold: true }], optOut: null }

;(async () => {
  console.log('── BROKEN VARIANTS: MUST report FAILURE ─────────────────────────────────────────────────')
  const variant = (tag, file, patch) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `rep-${tag}-`))
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
    // V1 — THE ELEMENT STRIPPER GOES. A prospect's signature carries a tracking `<style>` or, worse,
    // a `<form>`; the reply we send puts it in front of everyone they forward it to, from our address.
    const v = variant('v1', 'lib/outreach-quote-sanitise.ts', src => src.replace(
      '  s = stripElements(s)', '  // removed'))
    const out = v.Q.sanitiseQuotedHtml('<div>hi</div><script>steal()</script><form action="https://evil.test"><input></form>')
    variantFails('V1', /<script/i.test(out) && /<form/i.test(out),
      "a quoted email's script and form are copied into the message we sign")
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V2 — `on*` ATTRIBUTES SURVIVE. An `onload`/`onclick` in quoted markup executes in a client that
    // renders it, in a message whose From is Dominic.
    const v = variant('v2', 'lib/outreach-quote-sanitise.ts', src => src.replace(
      '  s = stripEventAttributes(s)', '  // removed'))
    const out = v.Q.sanitiseQuotedHtml('<img src="x" onerror="steal()">')
    variantFails('V2', /onerror/i.test(out), 'an inline event handler survives into the sent email')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V3 — `javascript:` URLS SURVIVE. A quoted "click here" becomes a script link in our email.
    const v = variant('v3', 'lib/outreach-quote-sanitise.ts', src => src.replace(
      '  s = stripJavascriptUrls(s)', '  // removed'))
    const out = v.Q.sanitiseQuotedHtml('<a href="javascript:steal()">click</a>')
    variantFails('V3', /javascript:/i.test(out), 'a javascript: link survives into the sent email')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V4 — THE BODY IS NOT UNWRAPPED. A whole `<html><head>…` document nested inside a div renders
    // unpredictably; several clients drop everything after it, which silently loses the history.
    const v = variant('v4', 'lib/outreach-quote-sanitise.ts', src => src.replace(
      '  let s = bodyInnerHtml(String(html ?? \'\'))', "  let s = String(html ?? '')"))
    const out = v.Q.sanitiseQuotedHtml('<html><head><title>t</title></head><body><p>hi</p></body></html>')
    variantFails('V4', /<html|<head|<body/i.test(out), 'a whole document is embedded inside our message')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V5 — THE RECIPIENT ALLOW-LIST GOES. The browser could then name any address, and a reply
    // composed against one truck's thread could be delivered to somebody else entirely.
    const v = variant('v5', 'lib/outreach-reply-rules.ts', src => src.replace(
      '  if (!allowed.has(to)) {', '  if (false) {'))
    const r = v.R.replyRecipientRefusal({
      to: 'stranger@elsewhere.test', contactEmail: 'hello@example-truck.test', knownInboundFroms: [],
    })
    variantFails('V5', r === null, 'a reply is addressed to somebody who has never written to us')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V6 — A REPLY TO ANOTHER PROSPECT'S MESSAGE IS ALLOWED. Their words would be quoted into this
    // truck's inbox, and the thread headers would join two unrelated conversations.
    const v = variant('v6', 'lib/outreach-reply-rules.ts', src => src.replace(
      "  if (parent.prospect_id !== prospectId) return { refusal: 'That message belongs to a different prospect.' }",
      '  // removed'))
    const r = v.R.replyParentRefusal(
      { id: 'm1', prospect_id: 'OTHER', is_test: false, message_id: '<x@y>' }, 'p1')
    variantFails('V6', r === null, "one prospect's message can be replied to in another's thread")
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V7 — A TEST SEND CAN BE REPLIED TO. It went to Dominic's own address; the "reply" would quote
    // a message the prospect never received and thread onto an id they have never seen.
    const v = variant('v7', 'lib/outreach-reply-rules.ts', src => src.replace(
      "  if (parent.is_test === true) return { refusal: 'That was a test send to your own address — there is nobody to reply to.' }",
      '  // removed'))
    const r = v.R.replyParentRefusal(
      { id: 'm1', prospect_id: 'p1', is_test: true, message_id: '<x@y>' }, 'p1')
    variantFails('V7', r === null, 'a test send is offered as something to reply to')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V8 — THE TOTAL SIZE CHECK GOES. Three 4 MB files pass one at a time; together they are 12 MB,
    // ~16 MB on the wire after base64, and the far end bounces an email the prospect never sees.
    const v = variant('v8', 'lib/outreach-attachments.ts', src => src.replace(
      '  if (total > MAX_ATTACHMENT_BYTES) {\n    return { refusal: `Those files come to ${mb(total)}',
      '  if (false) {\n    return { refusal: `Those files come to ${mb(total)}'))
    const four = { filename: 'a.pdf', contentType: 'application/pdf', size: 4 * 1024 * 1024 }
    const r = v.A.attachmentSetRefusal([four, { ...four, filename: 'b.pdf' }, { ...four, filename: 'c.pdf' }])
    variantFails('V8', r === null, 'twelve megabytes of attachments are accepted for one email')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V9 — THE TYPE ALLOW-LIST GOES. Anything at all could be attached and sent from our domain.
    // ⚠️ THE PATCH MAKES THE ALLOW-LIST ACCEPT THE FILE'S OWN TYPE rather than deleting the guard's
    // `if`: deleting it left `allowedExts` undefined and the variant CRASHED on the next line, which
    // is a broken patch reporting a pass, not a proof. One change, one meaning — "the allow-list no
    // longer decides".
    const v = variant('v9', 'lib/outreach-attachments.ts', src => src.replace(
      '  const allowedExts = ALLOWED_ATTACHMENT_TYPES[String(file.contentType ?? \'\').toLowerCase()]',
      '  const allowedExts = [ext]'))
    const r = v.A.uploadRefusal({ filename: 'thing.exe', contentType: 'application/x-msdownload', size: 10 })
    variantFails('V9', r === null, 'an executable can be attached to an email sent from hatchgrab.com')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }
  {
    // V10 — AN ENTRY WITH NO STORAGE PATH IS ACCEPTED. That is the shape of "bytes in the request":
    // a `{filename, content}` object would become an attachment the server never fetched, and a
    // retry — which reads paths — could not reproduce it.
    const v = variant('v10', 'lib/outreach-attachments.ts', src => src.replace(
      "    if (typeof a.storagePath !== 'string' || !a.storagePath) continue", '    // removed'))
    const out = v.A.parseOutboundAttachments([{ filename: 'x.pdf', contentType: 'application/pdf', size: 3, content: 'AAAA' }])
    variantFails('V10', out.length === 1,
      'an attachment with no storage path is accepted — the door bytes would come through')
    fs.rmSync(v.tmp, { recursive: true, force: true })
  }

  const { Q, A, R, M, E, D } = build(REPO, 'repReal')

  console.log('\n── THE QUOTED HTML IS CLEANED BEFORE IT IS PUT IN OUR EMAIL ─────────────────────────────')
  {
    // 🔴 EVERY ELEMENT ON THE LIST, ONE AT A TIME, so a removal that silently stops working is caught.
    for (const tag of Q.STRIPPED_ELEMENTS) {
      const html = `<p>keep me</p><${tag}>danger</${tag}><p>and me</p>`
      const out = Q.sanitiseQuotedHtml(html)
      check(!new RegExp(`<${tag}\\b`, 'i').test(out) && out.includes('keep me') && out.includes('and me'),
        `<${tag}> is removed and the prose around it is kept`)
    }
    eq(Q.sanitiseQuotedHtml('<img src=x onerror="a()" onload=b()>'), '<img src=x>',
      '🔴 every on* handler goes, quoted or bare')
    check(!/javascript/i.test(Q.sanitiseQuotedHtml('<a href="javascript:a()">x</a>')),
      'a javascript: href goes')
    check(!/javascript/i.test(Q.sanitiseQuotedHtml('<a href="JaVaScRiPt:a()">x</a>')), '…however it is cased')
    check(!/javascript/i.test(Q.sanitiseQuotedHtml('<a href="java\tscript:a()">x</a>')), '…however it is spaced')
    check(!/javascript/i.test(Q.sanitiseQuotedHtml('<a href="&#106;avascript:a()">x</a>')),
      '🔴 …and however it is entity-encoded — the value is DECODED before the test')
    check(!/<script/i.test(Q.sanitiseQuotedHtml('<scr<script>ipt>a()</script>')),
      '🔴 a nested tag that only appears after one removal is removed too')
    eq(Q.sanitiseQuotedHtml('<html><head><style>p{display:none}</style></head><body><p>hi</p></body></html>'),
      '<p>hi</p>', "🔴 a whole document becomes the BODY's contents, and the head goes with it")
    check(Q.sanitiseQuotedHtml('<div style="color:red">red</div>').includes('style="color:red"'),
      '⚠️ PRESENTATION IS LEFT ALONE — a quoted email must still look like the email it is quoting')
    check(Q.sanitiseQuotedHtml('<a href="https://example.test/x">link</a>').includes('https://example.test/x'),
      '…and an ordinary link survives')
    eq(Q.sanitiseQuotedHtml(null), '', 'nothing in, nothing out')
  }

  console.log('\n── WHAT THE RECIPIENT ACTUALLY RECEIVES ─────────────────────────────────────────────────')
  {
    const built = M.buildMessage({
      doc: D.docFromTemplateText('Yes — here are the plans.', DOC_SETTINGS),
      subject: 'ignored on a reply', messageId: '<mine@hatchgrab.com>',
      parent: {
        messageId: '<theirs@example-truck.test>',
        references: '<first@hatchgrab.com>',
        quoted: { ...THEIR_REPLY, html: Q.sanitiseQuotedHtml(THEIR_REPLY.html) },
      },
    })
    eq(built.subject, 'Re: Taking orders online',
      '🔴 the subject is "Re: " + theirs, with the existing prefix stripping')
    eq(built.inReplyTo, '<theirs@example-truck.test>', 'In-Reply-To is the message being answered')
    eq(built.references, '<first@hatchgrab.com> <theirs@example-truck.test>',
      '🔴 References is THEIR chain plus THEIR id — the whole thread, not just the last hop')
    // 🔴 THE HISTORY IS IN THE MESSAGE, UNDER THE SIGNATURE, AS OUTLOOK WRITES IT.
    check(built.html.includes('<b>From: </b>sam@example-truck.test'),
      '🔴 the reference block names THEM, not us — it is their message being quoted')
    check(built.html.includes('<b>Subject: </b>Re: Taking orders online'), '…with the subject as captured')
    check(built.html.includes('<b>Date: </b>Tuesday, 29 September 2026 at 21:57'),
      '…and the date as captured, in London time')
    check(built.html.includes('Thanks — how do I sign up?'), '🔴 …followed by their actual words')
    check(built.html.indexOf('Kind regards,') < built.html.indexOf('mail-editor-reference-message-container'),
      '🔴 the signature comes BEFORE the quote block — a reply above the line')
    check(built.text.includes('From: sam@example-truck.test'), 'the text/plain part quotes too…')
    check(built.text.includes('Thanks — how do I sign up?'), '…including their text_body')
  }

  console.log('\n── WHO A REPLY MAY BE SENT TO ───────────────────────────────────────────────────────────')
  {
    const truck = 'hello@example-truck.test'
    const ok = (to, froms) => R.replyRecipientRefusal({ to, contactEmail: truck, knownInboundFroms: froms }) === null
    check(ok(truck, []), "the truck's own address is always allowed")
    check(ok('HELLO@Example-Truck.TEST', []), '…case-insensitively, on both sides')
    check(ok('sam@example-truck.test', ['sam@example-truck.test']),
      '🔴 a colleague who has actually written to us is allowed — that is the case this exists for')
    check(!ok('stranger@elsewhere.test', ['sam@example-truck.test']),
      '🔴 …and nobody else is, however the browser asks')
    check(!ok('', []), 'an empty address is refused rather than sent to nobody')
    check(!ok('sam@example-truck.test', []),
      "⚠️ …and a plausible address is still refused when no inbound message records it")

    const parent = { id: 'm1', prospect_id: 'p1', is_test: false, direction: 'inbound', message_id: '<x@y>' }
    eq(R.replyParentRefusal(parent, 'p1'), null, 'a real inbound message of this prospect can be replied to')
    check(!!R.replyParentRefusal({ ...parent, prospect_id: 'p2' }, 'p1'), "…another prospect's cannot")
    check(!!R.replyParentRefusal({ ...parent, is_test: true }, 'p1'), '…a test send cannot')
    check(!!R.replyParentRefusal({ ...parent, message_id: null }, 'p1'),
      '…and one with no Message-ID cannot, because the reply could not be threaded onto it')
    check(!!R.replyParentRefusal(null, 'p1'), '…nor can a message that has been deleted')
    eq(R.REPLY_KIND, 'reply', "the rung a reply is logged as is `reply`")
  }

  console.log('\n── A REPLY IS NEVER A RUNG, AND CARRIES NO OPT-OUT ──────────────────────────────────────')
  {
    // 🔴 `reply` IS NOT IN THE LADDER, so §57 counts nothing for it and the opt-out warning — which
    // is for ladder rungs — stays silent. Both facts come from the same list.
    const doc = D.docFromTemplateText('Thanks for getting back to me.', DOC_SETTINGS)
    eq(D.optOutWarning(doc, 'reply', 'Reply STOP to opt out.'), null,
      '🔴 a reply with no opt-out line produces no warning')
    check(!!D.optOutWarning(doc, '1_first_contact', 'Reply STOP to opt out.'),
      '⚠️ …while a first contact without one still does, unchanged')
    const SEND = readStripped('app/api/admin/outreach/mail-send/route.ts')
    check(/const sendKind = replyParent \? REPLY_KIND : /.test(SEND),
      '🔴 the SERVER decides the kind on a reply — a client cannot send `2_chase_1` with a reply id')
    check(/const firstContact = !replyParent && startsNewThread\(sendKind\)/.test(SEND),
      '…and a reply is never treated as a first contact')
    const UI = readStripped('components/admin/ComposeWindow.tsx')
    check(/const kindForSend = replyTo \? 'reply' :/.test(UI), '…and the window agrees with it')
  }

  console.log('\n── THE COMPOSED BYTES, WITH FILES ───────────────────────────────────────────────────────')
  {
    const built = M.buildMessage({
      doc: D.docFromTemplateText('Plans attached.', DOC_SETTINGS),
      subject: 'x', messageId: '<withfiles@hatchgrab.com>',
      parent: { messageId: '<theirs@example-truck.test>', references: null, quoted: THEIR_REPLY },
    })
    const row = {
      message_id: built.messageId, from_name: null,
      in_reply_to: built.inReplyTo, references: built.references,
      subject: built.subject, to_address: 'sam@example-truck.test',
      message_date: '2026-09-30T09:00:00Z',
      html_body: built.html, text_body: built.text,
      attachments: [
        { filename: 'hatchgrab-plans-and-features-2026-09-30.pdf', contentType: 'application/pdf', content: Buffer.from('%PDF-1.4 fake') },
        { filename: 'menu.png', contentType: 'image/png', content: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
      ],
    }
    const raw = await compose(E.mailFor(row))
    check(/multipart\/mixed/.test(header(raw, 'Content-Type')),
      '🔴 the message is multipart/mixed once it carries files')
    check(/Content-Type: multipart\/alternative/i.test(raw),
      '🔴 …WRAPPING the existing multipart/alternative — the html and text parts are untouched')
    check(/Content-Type: application\/pdf/i.test(raw), 'the PDF part declares its own type')
    check(/Content-Type: image\/png/i.test(raw), '…and so does the image')
    check(/Content-Disposition: attachment; filename=.*hatchgrab-plans-and-features-2026-09-30\.pdf/i.test(raw)
      || /filename="?hatchgrab-plans-and-features-2026-09-30\.pdf/i.test(raw),
      "🔴 each part carries its own filename, so it arrives named")
    check(/filename="?menu\.png/i.test(raw), '…both of them')
    check(/Content-Transfer-Encoding: base64/i.test(raw), 'the files are base64, as MIME requires')
    // 🔴 THE HEADER ALLOW-LIST STILL HOLDS. Only the VALUE of Content-Type changed — the set of
    // header NAMES on the message is the same one `ALLOWED_HEADERS` has always declared.
    eq(M.disallowedHeaders(raw), [],
      `🔴 no header outside the allow-list (${M.ALLOWED_HEADERS.length} names), attachments and all`)
    check(!/x-mailer/i.test(headerBlock(raw)), '…and still nothing that says "generated"')

    // ⚠️ AND WITHOUT FILES NOTHING CHANGED. Every earlier assertion about the shape of a message
    // depends on this: an empty list must compose byte-for-byte as it did before attachments existed.
    const plain = await compose(E.mailFor({ ...row, attachments: [] }))
    check(/multipart\/alternative/.test(header(plain, 'Content-Type')),
      '⚠️ with no files it is multipart/alternative exactly as before')
    check(!/Content-Disposition: attachment/i.test(plain), '…and carries no attachment part at all')
  }

  console.log('\n── RETRY RE-COMPOSES THE SAME MESSAGE ───────────────────────────────────────────────────')
  {
    // 🔴 SAME ROW, SAME FILES, SAME BYTES — minus the boundary and Date, which are generated per
    // composition by nodemailer and by design. The comparison strips both and compares the rest.
    const row = {
      message_id: '<same@hatchgrab.com>', from_name: null,
      in_reply_to: '<theirs@example-truck.test>', references: '<a@b>',
      subject: 'Re: Taking orders online', to_address: 'sam@example-truck.test',
      message_date: '2026-09-30T09:00:00Z',
      html_body: '<div>body</div>', text_body: 'body\n',
      attachments: [{ filename: 'plans.pdf', contentType: 'application/pdf', content: Buffer.from('%PDF-1.4 fake') }],
    }
    // ⚠️ THE MIME BOUNDARY IS RANDOM PER COMPOSITION — nodemailer writes `_NmP-<hex>-Part_N` — and
    // that is by design, not drift: two messages must not share a boundary. It is normalised here
    // and nothing else is, so every other byte (headers, structure, the base64 of the file itself)
    // is compared exactly. 🔎 `composeRaw` is what makes this matter in production: the bytes sent
    // are the bytes filed in Sent, composed ONCE.
    const normalise = raw => raw
      .replace(/_NmP-[0-9a-f]+-Part_\d+/gi, 'BOUNDARY')
      .replace(/boundary="[^"]+"/gi, 'boundary="BOUNDARY"')
    const first = normalise(await compose(E.mailFor(row)))
    const again = normalise(await compose(E.mailFor(row)))
    eq(first, again, '🔴 a second composition of the same row is byte-identical')
    check(first.includes('plans.pdf'), '…and it still carries the attachment')
    const withoutFiles = normalise(await compose(E.mailFor({ ...row, attachments: [] })))
    check(first !== withoutFiles,
      '⚠️ …which is only meaningful because dropping the files WOULD change the bytes')
  }

  console.log('\n── THE BYTES NEVER TRAVEL THROUGH THE SEND REQUEST ──────────────────────────────────────')
  {
    const SEND = readStripped('app/api/admin/outreach/mail-send/route.ts')
    const readsPathsOnly = src =>
      /parseOutboundAttachments\(body\.attachments\)/.test(src) && /loadAttachments\(supabase, declaredAttachments\)/.test(src)
    check(readsPathsOnly(SEND),
      '🔴 the send parses PATHS from the request and reads the bytes itself, server-side')
    check(!readsPathsOnly(SEND.replace('loadAttachments(supabase, declaredAttachments)', 'body.attachment_bytes')),
      '⚠️ …and the same census FAILS on a version that takes them from the request')
    // 🔴 THE CENSUS THAT MATTERS: no route in this feature decodes bytes out of a request body.
    for (const f of ['app/api/admin/outreach/mail-send/route.ts', 'app/api/admin/outreach/attachments/route.ts']) {
      const src = readStripped(f)
      check(!/Buffer\.from\([^)]*body\./.test(src) && !/base64/.test(src) && !/formData\(\)/.test(src),
        `🔴 ${f} never turns request content into bytes`)
    }
    const STORE = readStripped('lib/outreach-attachment-store.ts')
    check(/storage\.from\(ATTACHMENT_BUCKET\)\.download\(a\.storagePath\)/.test(STORE),
      'the only source of attachment bytes is the private bucket, by path')
    check(/return \{ ok: false, refusal: /.test(STORE),
      '🔴 …and a file that cannot be read refuses the send rather than sending without it')
    const ATT = readStripped('app/api/admin/outreach/attachments/route.ts')
    check(/createSignedUploadUrl\(path\)/.test(ATT), 'uploads go straight to storage on a signed URL')
    check(/createSignedUrl\(path, DOWNLOAD_TTL_SECONDS\)/.test(ATT) && /DOWNLOAD_TTL_SECONDS = 300/.test(ATT),
      'a download is a five-minute signed link…')
    check(!/getPublicUrl/.test(ATT), '🔴 …and nothing anywhere makes the bucket public')
    check(/pathBelongsToProspect\(path, prospectId\)/.test(ATT),
      'a download link is only issued for a path inside that prospect’s own folder')
  }

  console.log('\n── WHAT MAY BE ATTACHED ─────────────────────────────────────────────────────────────────')
  {
    eq(A.MAX_ATTACHMENT_BYTES, 10 * 1024 * 1024, 'ten megabytes per email, in total')
    const ok = (f) => A.uploadRefusal(f) === null
    check(ok({ filename: 'plans.pdf', contentType: 'application/pdf', size: 200_000 }), 'a PDF is allowed')
    check(ok({ filename: 'a.PNG', contentType: 'image/png', size: 10 }), '…a PNG, whatever its case')
    check(ok({ filename: 'a.jpeg', contentType: 'image/jpeg', size: 10 }), '…a JPEG under either extension')
    check(ok({ filename: 'a.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size: 10 }), '…a DOCX')
    check(ok({ filename: 'a.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 10 }), '…an XLSX')
    check(!ok({ filename: 'a.exe', contentType: 'application/x-msdownload', size: 10 }), '🔴 an executable is not')
    check(!ok({ filename: 'a.zip', contentType: 'application/zip', size: 10 }), '…nor an archive')
    check(!ok({ filename: 'a.exe', contentType: 'application/pdf', size: 10 }),
      '🔴 …nor a file whose extension and declared type disagree')
    check(!ok({ filename: 'big.pdf', contentType: 'application/pdf', size: 11 * 1024 * 1024 }), 'an 11 MB file is refused')
    check(!ok({ filename: 'empty.pdf', contentType: 'application/pdf', size: 0 }), 'an empty file is refused')
    const four = { filename: 'a.pdf', contentType: 'application/pdf', size: 4 * 1024 * 1024 }
    eq(A.attachmentSetRefusal([four, { ...four, filename: 'b.pdf' }]), null, 'two 4 MB files are fine together')
    check(!!A.attachmentSetRefusal([four, { ...four, filename: 'b.pdf' }, { ...four, filename: 'c.pdf' }]),
      '🔴 …and three are not: the limit is the TOTAL')
    eq(A.safeFilename('../../etc/passwd'), 'passwd', '🔴 a traversing filename cannot escape its folder')
    eq(A.safeFilename('a"b\nc.pdf'), 'abc.pdf', '…and one that would break a MIME header is cleaned')
    eq(A.storagePathFor('p1', 'uuid', 'plans.pdf'), 'prospects/p1/uuid-plans.pdf',
      'the path is the server\'s: prospect folder, uuid, name')
    check(A.pathBelongsToProspect('prospects/p1/x-a.pdf', 'p1'), 'a path inside the folder belongs to it')
    check(!A.pathBelongsToProspect('prospects/p2/x-a.pdf', 'p1'), '…and one outside it does not')
    eq(A.parseOutboundAttachments([{ filename: 'x.pdf', contentType: 'application/pdf', size: 3 }]), [],
      '🔴 an entry with no storagePath is not an attachment — there are no bytes to fetch')
    eq(A.parseOutboundAttachments(null), [], 'and an inbound row\'s null list yields none')
  }

  console.log('\n── THE PLANS PDF: THE APP ALREADY MAKES IT ──────────────────────────────────────────────')
  {
    // 🔴 CASE ONE OF THE TWO THE TASK DESCRIBES. `app/landing/features-pdf/route.ts` has generated
    // this document since V12.0, from `lib/plan-features.ts`. So there is no upload slot and no
    // stored file: the button generates a fresh copy from the live feature matrix.
    check(fs.existsSync(path.join(REPO, 'lib/plans-pdf.ts')), 'the generator is a lib both callers share')
    const LIB = readStripped('lib/plans-pdf.ts')
    check(/export function buildPlansPdfHtml/.test(LIB) && /export async function generatePlansPdf/.test(LIB),
      '…exporting the HTML builder and the PDF itself')
    check(/FEATURE_SECTIONS|TRANSACTION_ROWS/.test(LIB),
      '🔴 …still generated from lib/plan-features.ts, never from a copy of the markup')
    const ROUTE = readStripped('app/landing/features-pdf/route.ts')
    check(/generatePlansPdf\(\)/.test(ROUTE), "Admin's download button uses it…")
    check(/verifyAdmin\(\)/.test(ROUTE), '…and still has the gate that is the only thing between it and the internet')
    const ATT = readStripped('app/api/admin/outreach/attachments/route.ts')
    check(/generatePlansPdf\(\)/.test(ATT), '🔴 …and so does the attach button — ONE generator, two callers')
    check(/plansPdfFilename\(\)/.test(ATT) && /plansPdfFilename\(\)/.test(ROUTE),
      'both name the file the same way, from one function')
    const d = new Date('2026-09-30T12:00:00Z')
    eq(A.plansPdfFilename(d), 'hatchgrab-plans-and-features-2026-09-30.pdf',
      '🔴 hatchgrab-plans-and-features-YYYY-MM-DD.pdf, as asked')
    check(/upload\(path, pdf/.test(ATT),
      '⚠️ the generated copy is STORED like any other attachment, so a retry re-sends the same bytes')
    const UI = readStripped('components/admin/ComposeWindow.tsx')
    check(/action: 'plans_pdf'/.test(UI) && />\s*\{fileBusy === 'plans' \? 'Generating…' : 'Plans PDF'\}/.test(UI),
      'the button is in the compose toolbar and says when it is working')
  }

  console.log('\n── WHAT THE SCREEN DOES ─────────────────────────────────────────────────────────────────')
  {
    const UI = read('components/admin/ComposeWindow.tsx')
    check(/const \[quotedOpen, setQuotedOpen\] = useState\(true\)/.test(UI),
      '🔴 the earlier conversation is EXPANDED by default…')
    check(/if \(!isEmail \|\| replyTo\) return/.test(UI) && /action: 'quoted'/.test(UI),
      '…on a chase as well as a reply')
    check(/sandbox=""/.test(UI), '⚠️ and it is still rendered in a sandboxed iframe')
    check(/reply_to_message_id: replyTo\.messageId/.test(UI), 'the send names the message being answered')
    check(/ALLOWED_ATTACHMENT_EXTENSIONS\.join\(','\)/.test(UI), 'the picker offers only the allowed types')
    const PANEL = read('components/admin/OutreachPanel.tsx')
    check(/onReply=\{t => \{ setReplyTarget\(t\); setComposeOpen\(true\) \}\}/.test(PANEL),
      'the timeline’s Reply opens the composer on that message')
    check(/onReply=\{\(id, target\) => \{ openModal\(id\); setReplyIntent\(\{ prospectId: id, target \}\) \}\}/.test(PANEL),
      "…and so does Today's")
    check(/inbound && !m\.is_test && m\.status === 'received'/.test(PANEL),
      '🔴 Reply is offered on a real inbound message and nowhere else')
    check(/a\.storagePath && prospectId/.test(PANEL),
      '🔴 a Download link appears only where there is a file of ours to download…')
    check(/listed only, not downloaded/.test(PANEL),
      "⚠️ …and an inbound message's attachments stay names-only")
  }

  console.log(`\n${fails === 0 ? '✅ ALL CHECKS PASSED' : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
