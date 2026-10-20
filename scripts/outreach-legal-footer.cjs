#!/usr/bin/env node
// scripts/outreach-legal-footer.cjs — ⚠️ RE-PINNED (Dominic, 20 October 2026): outreach emails NO LONGER carry the company
// line ("HatchGrab Ltd · Company no. … · Registered office: …"); this proves it is gone from every email (a retry of an
// old row included) — and, unchanged, no send without an
// opt-out line (legal follow-ups, 19 October 2026; signed off by Dominic) — EXCEPT a test send and a reply to a
// message the prospect sent, which still get the company line (Dominic's answers, 19 October 2026), and a RETRY
// that rebuilds the stored message with today's line and applies the same rule (Part B2, Part D).
//
//   node scripts/outreach-legal-footer.cjs      (≈ 30 s: one tsc compile, one esbuild bundle, WebKit. NO NETWORK)
//
// 🔴 FAILURE MODE, in the order it would hurt: an outreach email leaves without the registered company line
//    (name, number, registered office) that a business email must carry; the line lands ABOVE the operator's
//    own sign-off or BELOW the quoted earlier email, where a reader takes it for part of somebody else's
//    message; or an email with no opt-out line is sent because the check only WARNED, or only looked at the
//    four ladder steps, or the composer and the server used two different definitions of "has an opt-out".
//
// HOW: Part A compiles the REAL builder (lib/outreach-mail-message.ts) and renders a UK and a US email through
// it — the document built by the REAL template expansion (`docFromTemplateText`) — and writes both parts to
// docs/legal-followups/, with a 600px WebKit screenshot of each. Part B runs the ONE opt-out definition
// (`optOutBlock`, lib/outreach-doc.ts). Part C mounts the REAL ComposeWindow in WebKit with every fetch
// stubbed (nothing can be sent) and reads the Send buttons. Part D reads the route's source for the order of
// the server check. The server REFUSAL itself is proved end to end by scripts/outreach-instant-send.cjs (the
// real route on an in-memory database), case "an email with no opt-out line is refused…".
// ⚠️ NOTHING IS SENT. There is no SMTP, no IMAP, no database and no fetch that leaves the page.
const fs = require('fs'); const os = require('os'); const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')

let fails = 0
const check = (ok, label, extra = '') => { console.log(`  ${ok ? '✓' : '🔴'} ${label}${extra ? ` · ${extra}` : ''}`); if (!ok) fails++ }
const eq = (got, want, label) => {
  const ok = got === want
  check(ok, label)
  if (!ok) { console.log(`      want: ${JSON.stringify(want)}`); console.log(`      got:  ${JSON.stringify(got)}`) }
}
const codeOf = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** The sentence Dominic signed off, byte for byte. */
const FOOTER = 'HatchGrab Ltd · Company no. 17381557 · Registered office: Rosedale, Bury Road, Wickham Street, CB8 8PD, United Kingdom'
/** The seed opt-out sentence (supabase/migrations/20260929_outreach_settings.sql), as the settings row holds it. */
const OPT = 'If you would rather not hear from me again, reply with "no thanks" and I will not contact you.'
const SETTINGS = {
  signatureLines: [{ text: 'Kind regards,' }, { text: '' }, { text: 'Dominic Bonini', bold: true }, { text: 'Founder, HatchGrab' }],
  optOut: OPT,
}
const OUT_DIR = path.join(REPO, 'docs/legal-followups')

const { req } = compile(REPO, ['lib/outreach-mail-message.ts', 'lib/outreach-doc.ts', 'lib/company.ts'], 'legal-footer')
const M = req('lib/outreach-mail-message.js')
const D = req('lib/outreach-doc.js')
const C = req('lib/company.js')

const PARENT = {
  fromAddress: 'dominic@hatchgrab.com', fromName: 'Dominic Bonini',
  toAddress: 'hello@fixture-burgers.test', toName: null,
  subject: 'Taking orders online',
  date: new Date('2026-10-12T09:30:00Z'),
  html: '<div>the original pitch</div>', text: 'the original pitch',
}
const EXAMPLES = {
  uk: {
    locale: 'en-GB', subject: 'Taking orders online at Fixture Burgers',
    template: 'Hi George,\n\nI’m Dominic from HatchGrab. We help food trucks take orders online, and I think it could suit Fixture Burgers on your Suffolk pitches.\n\nWould a ten-minute call next week be useful?\n\n{{signature}}\n{{opt_out}}',
  },
  us: {
    locale: 'en-US', subject: 'Taking orders online at Fixture Tacos',
    template: 'Hi Maria,\n\nI’m Dominic from HatchGrab. We help food trucks take orders online, and I think it could suit Fixture Tacos at your Austin stops.\n\nWould a ten-minute call next week be useful?\n\n{{signature}}\n{{opt_out}}',
  },
}

// ── PART A · THE BUILDER ────────────────────────────────────────────────────────────────────────────
// ⚠️ RE-PINNED (Dominic, 20 October 2026): the company line is REMOVED — no email carries it, in either part.
console.log('\nA · no outreach email carries the company line (removed 20 October 2026), in either part')
check(!('companyFooterLine' in M), 'the builder no longer exports a company-line function')
check(!/companyFooter/.test(JSON.stringify(JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-GB.json'), 'utf8')).outreach)), 'the `outreach.companyFooter` message is deleted')
const built = {}
for (const [k, ex] of Object.entries(EXAMPLES)) {
  const doc = D.docFromTemplateText(ex.template, SETTINGS)
  const b = M.buildMessage({ doc, subject: ex.subject, messageId: '<fixture@hatchgrab.com>', parent: null, fromName: 'Dominic Bonini', locale: ex.locale })
  built[k] = b
  check(!b.html.includes('Company no.') && !b.text.includes('Company no.') && !b.html.includes('Registered office') && !b.text.includes('Registered office'),
    `${k.toUpperCase()}: neither part carries the company line`)
  eq(b.html, D.docToHtml(doc), `${k.toUpperCase()}: the HTML part is exactly the document — nothing appended`)
  eq(b.text, `${D.docToText(doc)}\n`, `${k.toUpperCase()}: the text part is exactly the document — nothing appended`)
  eq(b.text.replace(/\n+$/, '').split('\n').pop(), OPT, `${k.toUpperCase()}: the text part's LAST line is the opt-out line again`)
  check(!/<[a-z]/i.test(b.text), `${k.toUpperCase()}: the text part carries no markup`)
}

// A reply / chase: no company line between the new message and the quote either.
{
  const doc = D.docFromTemplateText(EXAMPLES.uk.template, SETTINGS)
  const parent = { messageId: '<parent@hatchgrab.com>', references: null, quoted: PARENT }
  const r = M.buildMessage({ doc, subject: '', messageId: '<chase@hatchgrab.com>', parent, fromName: 'Dominic Bonini', locale: 'en-GB' })
  check(!r.html.includes('Company no.') && !r.text.includes('Company no.'), 'a chase that quotes the earlier email: no company line (HTML or text)')
  check(r.html.startsWith(D.docToHtml(doc)) && r.html.indexOf('mail-editor-reference-message-container') > 0, '…the new message is the document, then the quoted email')
  const n = M.buildMessage({ doc, subject: '', messageId: '<chase2@hatchgrab.com>', parent: { ...parent, quote: false }, fromName: 'Dominic Bonini', locale: 'en-GB' })
  check(n.html === D.docToHtml(doc) && n.text === `${D.docToText(doc)}\n`, 'a chase with "Include previous email" unticked: exactly the document')
}

// ── PART B · THE ONE OPT-OUT DEFINITION ──────────────────────────────────────────────────────────────
console.log('\nB · `optOutBlock` — the single definition the composer and the server both call')
{
  const withOpt = D.docFromTemplateText('Hello there\n\n{{signature}}\n{{opt_out}}', SETTINGS)
  const without = D.docFromTemplateText('Hello there\n\n{{signature}}', SETTINGS)
  const typedOut = D.docFromTemplateText(`Hello there\n\n${OPT.replace(/ /g, '  ')}`, SETTINGS)
  eq(D.optOutBlock(withOpt, OPT), null, 'the stored sentence is in the message: allowed')
  eq(D.optOutBlock(without, OPT), 'no_opt_out_line', 'the stored sentence is missing: BLOCKED (no longer only a warning)')
  eq(D.optOutBlock(typedOut, OPT), null, 'typed out by hand with different spacing still counts — the same whitespace rule the warning used')
  eq(D.optOutBlock(withOpt, null), 'no_opt_out_set_up', 'no opt-out sentence set up at all: BLOCKED — there is nothing that could count')
  eq(D.optOutBlock(withOpt, '   '), 'no_opt_out_set_up', '…and a blank one is the same')
  eq(D.optOutBlock.length, 2, 'it takes NO step/kind argument — the rule is the same for a first contact, a chase, a reply and a test')
  check(D.hasOptOutLine(withOpt, OPT) && !D.hasOptOutLine(without, OPT), '`hasOptOutLine` is the test inside it')
  check(!('optOutWarning' in D), 'the ladder-only WARNING is gone, so nothing can still treat a missing line as advisory')

  /* ⚠️ RE-PINNED (Dominic's answers, 19 October 2026, docs/legal-follow-ups-report.md): TWO EXEMPTIONS, decided by
   * `optOutExempt` before `optOutBlock` is asked — a test send, and a reply to a message the PROSPECT sent. */
  eq(D.optOutExempt({ isTest: true, parent: null }), true, 'EXEMPT: a test send (it goes only to Dominic\'s own address)')
  eq(D.optOutExempt({ isTest: false, parent: { direction: 'inbound', is_test: false } }), true, 'EXEMPT: a reply to a message the prospect sent (an inbound parent)')
  eq(D.optOutExempt({ isTest: false, parent: { direction: 'outbound', is_test: false } }), false, 'NOT exempt: a follow-up on OUR OWN earlier email (an outbound parent) — that is a chase')
  eq(D.optOutExempt({ isTest: false, parent: null }), false, 'NOT exempt: a first contact (no parent)')
  eq(D.optOutExempt({ isTest: false, parent: { direction: 'inbound', is_test: true } }), false, 'NOT exempt: a "reply" to a test row (never a real prospect\'s message)')
  eq(D.optOutExempt({ isTest: false, parent: { direction: null } }), false, 'NOT exempt: a parent whose direction is unknown (an older composer snapshot) — the safe answer')
  for (const [doc, name] of [[withOpt, 'with'], [without, 'without'], [typedOut, 'typed out']]) {
    eq(D.optOutBlockForText(D.docToText(doc), OPT), D.optOutBlock(doc, OPT), `the TEXT check (a retry's) agrees with the DOCUMENT check (a send's): ${name} the line`)
  }
}

// ── PART B2 · A RETRY DROPS AN OLD COMPANY LINE ────────────────────────────────────────────────────────
/* ⚠️ RE-PINNED (Dominic, 20 October 2026): a row built between 19 and 20 October 2026 carries the company line; a
 * retry rebuilds it to what `buildMessage` makes TODAY — so the line is dropped. A row built without it is unchanged.
 * Proved for a first contact, a reply with its quote, and a chase with the quote unticked. */
console.log('\nB2 · `rebuildStored` — a retry resends what `buildMessage` builds today (no company line)')
{
  const doc = D.docFromTemplateText('Hello there\n\n{{signature}}\n{{opt_out}}', SETTINGS)
  const quoted = { ...PARENT }
  const shapes = [
    ['a first contact', undefined],
    ['a reply with its quote', { messageId: '<p@x>', references: null, quoted }],
    ['a chase with "Include previous email" unticked', { messageId: '<p@x>', references: null, quoted, quote: false }],
  ]
  // What a row built on 19–20 October 2026 holds: today's bodies with the old line where the builder put it then —
  // after the document, above any quote (spacer, then the FOOTER_STYLE div; in the text, its own last paragraph).
  const spacer = '<div style="font-family: Aptos, Arial, Helvetica, sans-serif; font-size: 12pt; color: rgb(0, 0, 0);"><br></div>'
  const lineH = `${spacer}<div style="${M.FOOTER_STYLE}">${FOOTER}</div>`
  const withLine = (now) => {
    const docH = D.docToHtml(doc), docT = D.docToText(doc)
    return { html_body: docH + lineH + now.html.slice(docH.length), text_body: docT + `\n\n${FOOTER}` + now.text.slice(docT.length) }
  }
  for (const [label, parent] of shapes) {
    const today = M.buildMessage({ doc, subject: 'S', messageId: '<m@x>', parent, fromName: 'Dominic Bonini', locale: 'en-GB' })
    const old = withLine(today)
    check(old.html_body.includes(FOOTER) && old.text_body.includes(FOOTER), `${label}: the old row really carries the company line`)
    const r1 = M.rebuildStored(old, 'en-GB')
    check(!!r1 && r1.html === today.html && r1.text === today.text, `${label}: a row built WITH the line → exactly today's message, line dropped (HTML and text)`)
    const r2 = M.rebuildStored({ html_body: today.html, text_body: today.text }, 'en-GB')
    check(!!r2 && r2.html === today.html && r2.text === today.text, `${label}: a row built WITHOUT it → unchanged (idempotent)`)
    check(!!r1 && r1.newText === D.docToText(doc), `${label}: the opt-out rule reads the new part only — no quote, no company line`)
  }
  check(M.rebuildStored({ html_body: '<p>hand-made</p>', text_body: 'no trailing newline' }, 'en-GB') === null, 'a body `buildMessage` did not make is not rebuilt (the retry refuses)')
}

// ── PART D · THE ROUTE AND THE COMPOSER CALL THAT FUNCTION ───────────────────────────────────────────
console.log('\nD · where it is enforced')
{
  const ROUTE = codeOf(fs.readFileSync(path.join(REPO, 'app/api/admin/outreach/mail-send/route.ts'), 'utf8'))
  const CW = codeOf(fs.readFileSync(path.join(REPO, 'components/admin/ComposeWindow.tsx'), 'utf8'))
  const iBlock = ROUTE.indexOf('optOutBlock(docIn, ')
  check(iBlock > 0, 'the send route calls `optOutBlock` on the validated document')
  check(iBlock > 0 && iBlock < ROUTE.indexOf('const built = buildMessage(') && iBlock < ROUTE.indexOf("status: 'sending'"),
    '…BEFORE the message is built and before the `sending` row is inserted — a refusal leaves no half-sent row')
  check(/if \(optOutStop\) \{\s*return await flagged\(/.test(ROUTE), '…and refuses through `flagged`, the route\'s recorded-refusal path (the prospect is flagged on Today)')
  // ⚠️ RE-PINNED (Dominic's answers, 19 October 2026): the check runs unless `optOutExempt` — a test, or a reply to the prospect.
  check(/if \(!optOutExempt\(\{ isTest, parent: replyParent \}\)\) \{[^]{0,400}optOutBlock\(docIn, /.test(ROUTE), '…UNLESS the send is exempt (`optOutExempt({ isTest, parent: replyParent })`): a test, or a reply to a message the prospect sent')
  const iPrep = ROUTE.indexOf('const prep = await prepareRetry(supabase, row)'), iRetryDeliver = ROUTE.indexOf('const retried = await deliver(supabase,')
  check(iPrep > 0 && iPrep < iRetryDeliver && /if \(!prep\.ok\) return refuse\(prep\.refusal/.test(ROUTE) && /\{ \.\.\.prep\.row, from_name/.test(ROUTE),
    'the manual RETRY rebuilds and checks first (`prepareRetry`), refuses with its sentence, and resends the REBUILT row')
  const POLL = codeOf(fs.readFileSync(path.join(REPO, 'lib/outreach-mail-poll.ts'), 'utf8'))
  const pPrep = POLL.indexOf('const prep = await prepareRetry(supabase, row)'), pClaim = POLL.indexOf('if (!(await claimRetry(')
  check(pPrep > 0 && pPrep < pClaim && /deliver\(supabase, \{ \.\.\.prep\.row, from_name: fromName \}/.test(POLL) && /select\('id, prospect_id, message_id/.test(POLL),
    'the poll\'s AUTOMATIC retry does the same before it claims the row, and resends the rebuilt row')
  const PREP = codeOf(fs.readFileSync(path.join(REPO, 'lib/outreach-retry-rebuild.ts'), 'utf8'))
  check(/rebuildStored\(row, await localeForTruck\(\{ country \}\)\)/.test(PREP) && /optOutExempt\(\{ isTest: row\.is_test === true, parent \}\)/.test(PREP)
    && /optOutBlockForText\(rebuilt\.newText, /.test(PREP) && /t\('optOut\.unreadable'\)/.test(PREP) && /'optOut\.notSetUp' : 'optOut\.missing'/.test(PREP),
    '`prepareRetry`: the rebuild in the prospect\'s language, the same exemption, the same opt-out test on the new part, the send\'s own refusal words')
  check(/locale: footerLocale/.test(ROUTE) && /discovery_trucks\(name, contact_email, hatchgrab_truck_id, show_on_vf, excluded, country\)/.test(ROUTE),
    'the builder is handed the prospect truck\'s locale, read from its country')
  check(/optOutBlock\(doc, settings\.optOut\)/.test(CW), 'the composer calls the same `optOutBlock` on the document on screen')
  // ⚠️ RE-PINNED (Dominic's answers, 19 October 2026): Send test is exempt; a reply to the prospect is exempt.
  const testExpr = (/const testBlock: string \| null =([\s\S]*?)\n  const /.exec(CW) || [])[1] || 'optOut?'
  check(!/optOut/.test(testExpr) && /const sendBlock: string \| null =\s*testBlock \?\? optOutShown \?\?/.test(CW),
    'the composer blocks SEND only (`optOutShown` in `sendBlock`); Send test to me is not blocked')
  check(/const replyExempt = optOutExempt\(\{ isTest: false, parent: replyTo \? \{ direction: replyTo\.inbound \? 'inbound' : null \} : null \}\)/.test(CW)
    && /const optOutShown: string \| null = replyExempt \? null : optOutStop/.test(CW), '…and not for a reply to a message the prospect sent — the same `optOutExempt`')
}

// ── PART A (files) and PART C (composer, WebKit) ─────────────────────────────────────────────────────
async function browserParts() {
  const { webkit } = require(path.join(REPO, 'node_modules/playwright'))
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const wrap = (title, html) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>`
    + `<body style="margin:16px;background:#fff">\n<!-- The HTML part exactly as lib/outreach-mail-message.ts#buildMessage builds it, wrapped only so a browser reads it as UTF-8. -->\n${html}\n</body></html>\n`
  const b = await webkit.launch()
  try {
    console.log('\nA · the two example emails, written and photographed at 600px')
    for (const k of ['uk', 'us']) {
      const htmlFile = path.join(OUT_DIR, `outreach-${k}.html`)
      fs.writeFileSync(htmlFile, wrap(`Outreach example (${k.toUpperCase()})`, built[k].html))
      fs.writeFileSync(path.join(OUT_DIR, `outreach-${k}.txt`), built[k].text)
      const ctx = await b.newContext({ viewport: { width: 600, height: 400 } })
      const p = await ctx.newPage()
      await p.goto('file://' + htmlFile)
      const shot = path.join(OUT_DIR, `outreach-${k}-600.png`)
      await p.screenshot({ path: shot, fullPage: true })
      const last = await p.evaluate(() => { const d = [...document.body.querySelectorAll('div')]; return d[d.length - 1].textContent })
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
      eq(last, OPT, `${k.toUpperCase()}: the last line on the rendered page is the opt-out line — no company line (removed 20 October 2026)`)
      check(!overflow, `${k.toUpperCase()}: no horizontal scroll at 600px (the line wraps)`)
      check(fs.statSync(shot).size > 5000, `${k.toUpperCase()}: screenshot written`, path.relative(REPO, shot))
      await ctx.close()
    }

    console.log('\nC · the REAL ComposeWindow (WebKit, every fetch stubbed): Send is disabled without an opt-out line')
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'legal-footer-'))
    const ENTRY = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import ComposeWindow from '@/components/admin/ComposeWindow'
const SIG = { lines: [{ text: 'Kind regards,' }, { text: '' }, { text: 'Dominic Bonini', bold: true }] }
const MODE = (window as unknown as { MODE: string }).MODE
const OPT = MODE === 'notSetUp' ? null : { text: ${JSON.stringify(OPT)} }
const REPLY = MODE === 'replyInbound' ? { messageId: 'in-1', subject: 'Re: your trucks', fromAddress: 'george@example.invalid', date: '2026-10-18T09:00:00Z', inbound: true }
  : MODE === 'replyOwn' ? { messageId: 'out-1', subject: 'Taking orders online', fromAddress: 'george@example.invalid', date: '2026-10-12T09:00:00Z', inbound: false } : null
if (typeof crypto.randomUUID !== 'function') {
  (crypto as unknown as { randomUUID: () => string }).randomUUID = () => 'ffffffff-ffff-4fff-8fff-000000000001'
}
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof input === 'string' ? input : (input as Request).url ?? input)
  const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200, headers: { 'Content-Type': 'application/json' } })
  if (url.includes('/outreach/settings')) return json({ ok: true, signature: SIG, optOut: OPT })
  if (url.includes('/outreach/mail-send')) {
    if ((init?.method ?? 'GET').toUpperCase() === 'POST') throw new Error('the harness never posts a send')
    return json({ ok: true, thread: null })
  }
  return json({ ok: true })
}) as typeof window.fetch
const TPL = {
  id: 'fixture', label: 'Fixture', channel: 'email' as const, subject: 'A quick hello',
  body: MODE === 'with' ? 'Hi George,\\n\\nA fixture first contact.\\n\\n{{signature}}\\n{{opt_out}}' : 'Hi George,\\n\\nA fixture first contact.\\n\\n{{signature}}',
  sortOrder: 1, active: true,
}
const CTX = { truckName: 'Fixture Burgers', contactName: 'George', contactFirstName: 'George', contactLastName: null,
  website: null, orderUrl: null, nextEventDate: null, nextEventVenue: null, demoLink: null, compareLink: 'https://example.invalid/compare', leadType: null }
createRoot(document.getElementById('root')!).render(<div style={{ padding: 16, width: 900 }}>
  <ComposeWindow inline truckName="Fixture Burgers" prospectId="00000000-0000-0000-0000-000000000001" toEmail="george@example.invalid"
    offerable={[TPL] as never} suggestedId={null} initialTemplateId="fixture" ctx={CTX as never} whatsappConfirmed={false}
    templatesLoaded logFormKind="first_contact" onClose={() => {}} onLog={async () => true} replyTo={REPLY as never} />
</div>)
`
    fs.writeFileSync(path.join(tmp, 'entry.tsx'), ENTRY)
    await esbuild.build({
      entryPoints: [path.join(tmp, 'entry.tsx')], bundle: true, format: 'iife', jsx: 'automatic',
      outfile: path.join(tmp, 'bundle.js'), absWorkingDir: REPO, alias: { '@': REPO },
      nodePaths: [path.join(REPO, 'node_modules')],
      define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'warning',
      banner: { js: 'var process = { env: { NODE_ENV: "production" } };' },
    })
    const js = fs.readFileSync(path.join(tmp, 'bundle.js'), 'utf8')
    const page = mode => `<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div>`
      + `<script>window.MODE=${JSON.stringify(mode)}</script><script>${js}</script></body></html>`
    const MSG = JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-GB.json'), 'utf8')).outreach.optOut
    const state = async mode => {
      const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } })
      const p = await ctx.newPage()
      await p.setContent(page(mode), { waitUntil: 'load' })
      await p.waitForFunction(() => /Dominic Bonini/.test(document.querySelector('.ProseMirror')?.innerHTML ?? ''), undefined, { timeout: 15000 })
      await p.waitForTimeout(300)
      const s = await p.evaluate(() => {
        const btn = label => [...document.querySelectorAll('button')].find(x => x.textContent.trim() === label)
        const send = btn('Send'), test = btn('Send test to me')
        const line = document.querySelector('[data-company-line]')
        const box = document.querySelector('.ProseMirror')
        return { send: send ? { disabled: send.disabled, title: send.title } : null,
          test: test ? { disabled: test.disabled, title: test.title } : null, body: document.body.innerText,
          line: line ? { text: line.textContent, grey: line.classList.contains('text-slate-400'), editable: line.isContentEditable,
            below: box ? line.getBoundingClientRect().top >= box.getBoundingClientRect().bottom - 1 : false } : null }
      })
      await ctx.close()
      return s
    }
    const ok = await state('with')
    check(!!ok.send && ok.send.disabled === false && ok.test.disabled === false, 'with the opt-out line in the box: Send and Send test to me are enabled')
    check(!ok.body.includes(MSG.missing), '…and no opt-out sentence is shown')
    const no = await state('without')
    check(!!no.send && no.send.disabled === true && no.send.title === MSG.missing, 'WITHOUT it: Send is disabled, and its hover text says why', no.send && no.send.title)
    // ⚠️ RE-PINNED (Dominic's answer 2, 19 October 2026): a test send to his own address needs no opt-out line.
    check(no.test.disabled === false, '…but Send test to me is ENABLED (a test goes only to Dominic — exempt)', no.test && no.test.title)
    check(no.body.includes(MSG.missing), '…and the sentence is on screen beside the buttons, not only on hover')
    const ns = await state('notSetUp')
    check(!!ns.send && ns.send.disabled === true && ns.send.title === MSG.notSetUp, 'no opt-out sentence set up: Send is disabled with that reason', ns.send && ns.send.title)
    // ⚠️ ADDED (Dominic's answers 1 and 4, 19 October 2026)
    const ri = await state('replyInbound')
    check(!!ri.send && ri.send.disabled === false && !ri.body.includes(MSG.missing), 'a REPLY to a message the prospect sent, with no opt-out line: Send is ENABLED (exempt)', ri.send && ri.send.title)
    const ro = await state('replyOwn')
    check(!!ro.send && ro.send.disabled === true && ro.send.title === MSG.missing, 'a follow-up on OUR OWN email with no opt-out line: Send is still disabled', ro.send && ro.send.title)
    // ⚠️ RE-PINNED (Dominic, 20 October 2026): the read-only company line under the box is gone with the line itself.
    for (const [m, st] of [['with', ok], ['without', no], ['replyInbound', ri]]) {
      check(st.line === null && !st.body.includes('Company no.'), `${m}: no company line is shown under the box`, JSON.stringify(st.line))
    }
  } finally { await b.close() }
}

browserParts()
  .catch(e => { console.log(`  🔴 ${e && e.stack || e}`); fails++ })
  .finally(() => {
    console.log(fails === 0 ? '\n✅ no outreach email carries the company line (a retry of an old row included), and only a test or a reply to the prospect leaves without an opt-out line' : `\n🔴 ${fails} failure(s)`)
    process.exit(fails === 0 ? 0 : 1)
  })
