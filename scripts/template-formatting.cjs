#!/usr/bin/env node
// scripts/template-formatting.cjs — formatting in email templates, and the plans PDF a template can attach
// (docs/template-formatting-report.md, 15 October 2026).
//
//   node scripts/template-formatting.cjs        (fixtures only — no network, no database, no browser)
//
// 🔴 WHAT THIS GUARDS, IN THE ORDER IT WOULD HURT
//   1. A TEMPLATE THAT HAS NO FORMATTING STARTS RENDERING DIFFERENTLY. Every live template was written as
//      plain text; the markers must not change one byte of the email it builds. Compared against HEAD's
//      own `docFromTemplateText`, on bodies shaped like the live ones (a "- " line, conditions, <br>,
//      a triple blank line, the signature and opt-out lines).
//   2. FORMATTING LOST OR CHANGED BY THE EDITOR — markup → document → markup → document builds the same email.
//   3. A MARK THAT CROSSES A LINE — the resolver drops `?condition:` lines, so an open <b> must never span one.
//   4. A LINK WHOSE href IS NOT `LINK_RE` BECOMING A LINK — it would be refused at send, or worse, sent.
//   5. `{{plans_pdf}}` EMAILED AS TEXT, or the PDF not attached when a template asks for it.
// Every check is one function, run on the real code AND on a broken variant that must fail it.

const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process')
const { compile, REPO } = require('./_slot-interval-compile.cjs')
const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

/** `lib/outreach-doc.ts` imports nothing, so any version of its source can be loaded on its own. */
function docModule(src) {
  const { code } = esbuild.transformSync(src, { loader: 'ts', format: 'cjs', target: 'node20' })
  const m = { exports: {} }
  new Function('module', 'exports', 'require', code)(m, m.exports, require)
  return m.exports
}
const DOC_SRC = read('lib/outreach-doc.ts')
const NOW = docModule(DOC_SRC)
const HEAD = docModule(execFileSync('git', ['show', 'HEAD:lib/outreach-doc.ts'], { cwd: REPO, encoding: 'utf8' }))
/** A broken variant: the real source with one mistake patched in — refused if the patch does not apply. */
function variant(label, from, to) {
  if (!DOC_SRC.includes(from)) { console.log(`🔴 ${label}: THE PATCH DID NOT APPLY — its anchor has drifted`); process.exit(1) }
  return docModule(DOC_SRC.replace(from, to))
}

const c = compile(REPO, ['lib/outreach-template-render.ts', 'lib/outreach-doc.ts', 'lib/outreach-step.ts', 'lib/outreach-attachments.ts'], 'tplfmt')
try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(c.out, 'node_modules')) } catch { /* already */ }
const R = c.req('lib/outreach-template-render.js')
const A = c.req('lib/outreach-attachments.js')

const SETTINGS = { signatureLines: [{ text: 'Kind regards,' }, { text: '' }, { text: 'Dominic Bonini', bold: true }], optOut: 'Reply STOP and we will not write again.' }
const J = x => JSON.stringify(x)

/* ── fixtures: plain bodies shaped like the live ones, and formatted ones ── */
const PLAIN = [
  'Hi{{contact_name_prefixed}},\r\n\r\nI run villagefoodie.co.uk.\r\nWould {{truck_name}} like a demo?\r\n\r\n{{signature}}\r\n{{opt_out}}',
  'Hi,\n\nThree things:\n- Order ahead: customers order from their phone\n- Pay at Hatch\n- No app\n\n\n?next_event: See you at {{next_event_venue}} on {{next_event_day}}.\n?no_next_event: Hope the season is going well.\n\n{{signature}}',
  'Line one<br>line two\n\n1 thing: a number, not a list\n• not a bullet either? (yes it is — none live use it)\n\nCheers',
  'Hi,\n\n[[your rate]] per order. No 1. lists here.\n\n{{signature}}\n{{opt_out}}',
]
// The live bodies have no "• " or "1. " line; PLAIN[2] carries one on purpose and is checked separately.
const PLAIN_UNMARKED = [PLAIN[0], PLAIN[1], PLAIN[3]]
const FORMATTED = [
  'Hi,\n\n<b>Bold</b>, <i>italic</i>, <b>both <i>nested</i></b> and <small>small</small> / <large>large</large>.\nA <a href="https://hatchgrab.com/compare">link</a> and <a href="mailto:dominic@hatchgrab.com">mail</a>.',
  'Before the list:\n• first <b>bold</b> item\n• second item<br>with a second line\n1. one\n2. two\n\nAfter.',
  'A literal &lt;b> stays text, and so does a lone < sign.\n\\1. this paragraph starts like a list but is not\n\\• nor this',
  '?next_event: <b>See you at {{next_event_venue}}</b>\n?no_next_event: <i>Hope the season is going well.</i>\n\n{{plans_pdf}}\n{{signature}}',
]

/* ── the checks: each takes the module (real or broken) and returns true when it holds ── */
const CHECKS = [
  {
    name: '🔴 a template with no formatting builds the SAME email as before (doc and HTML, byte for byte)',
    broken: () => variant('dash-is-a-bullet', 'export const BULLET_LINE_RE = /^• /', 'export const BULLET_LINE_RE = /^[•-] /'),
    run: M => PLAIN_UNMARKED.every(b => J(M.docFromTemplateText(b, SETTINGS)) === J(HEAD.docFromTemplateText(b, SETTINGS))
      && M.docToHtml(M.docFromTemplateText(b, SETTINGS)) === HEAD.docToHtml(HEAD.docFromTemplateText(b, SETTINGS))),
  },
  {
    name: '🔴 the editor round trip (markup → document → markup) builds the same email, formatting included',
    broken: () => variant('no-escape', "s += n.text.replace(TAG_LIKE_RE, '&lt;')", 's += n.text'),
    run: M => [...PLAIN, ...FORMATTED].every(b => {
      const once = M.templateMarkupFromDoc(M.docFromTemplateMarkup(b))
      const twice = M.templateMarkupFromDoc(M.docFromTemplateMarkup(once))
      return once === twice && J(M.docFromTemplateText(once, SETTINGS)) === J(M.docFromTemplateText(b.replace(/\r\n/g, '\n'), SETTINGS))
    }),
  },
  {
    name: '🔴 the formatting reaches the email: <b>, <i>, sizes, links, <ul>/<ol>',
    broken: () => variant('bold-ignored', "const k = (m[2] === 'b' ? 'bold'", "const k = (m[2] === 'b' ? 'nothing'"),
    run: M => {
      const h = M.docToHtml(M.docFromTemplateText(FORMATTED[0] + '\n\n' + FORMATTED[1], SETTINGS))
      return /<b>Bold<\/b>/.test(h) && /<i>italic<\/i>/.test(h) && /<i><b>nested<\/b><\/i>/.test(h) /* docToHtml's own order: <i> outside <b> */
        && /<a href="https:\/\/hatchgrab\.com\/compare">link<\/a>/.test(h) && /<ul /.test(h) && /<ol /.test(h)
        && /font-size: 13\.333333px[^>]*>small</.test(h) && /second item<br>with a second line/.test(h)
    },
  },
  {
    name: '🔴 a mark never crosses a line — every stored line opens and closes its own tags',
    broken: () => variant('close-only-at-end', "  for (const l of linesOf(kids).map(markupFromInline)) {",
      "  for (const l of [markupFromInline(kids.filter(k => k.type === 'text'))]) {"),
    run: M => {
      const doc = { type: 'doc', content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'one', marks: [{ type: 'bold' }] }, { type: 'hardBreak' }, { type: 'text', text: 'two', marks: [{ type: 'bold' }] }] }] }
      const lines = M.templateMarkupFromDoc(doc).split('\n')
      return lines.length === 2 && lines.every(l => (l.match(/<b>/g) || []).length === (l.match(/<\/b>/g) || []).length)
    },
  },
  {
    name: '🔴 a link is a link only when its href passes LINK_RE — anything else stays text and sends',
    broken: () => variant('any-href', 'const ok = LINK_RE.test(m[3] ?? \'\')', 'const ok = true'),
    run: M => {
      const doc = M.docFromTemplateText('Click <a href="javascript:alert(1)">here</a> or <a href="//evil.co">there</a>', SETTINGS)
      return M.validateDoc(doc).ok === true && !J(doc).includes('"link"') && /javascript:alert/.test(M.docPlainText(doc))
    },
  },
  {
    name: '📎 {{plans_pdf}} on its own line is NOT in the email, and the template is read as asking for the PDF',
    broken: () => variant('plans-kept', "      if (PLANS_LINE_RE.test(line)) { flushProse(); continue }", ''),
    run: M => {
      const doc = M.docFromTemplateText(FORMATTED[3], SETTINGS)
      return !/plans_pdf/.test(M.docPlainText(doc)) && M.templateWantsPlansPdf(FORMATTED[3]) && !M.templateWantsPlansPdf(PLAIN[0])
        && M.literalTokenRefusal(doc) === null
        // …and in the Templates editor's own view the line is still there to see and delete
        && /\{\{plans_pdf\}\}/.test(M.docPlainText(M.docFromTemplateMarkup(FORMATTED[3])))
    },
  },
  {
    name: '📎 {{plans_pdf}} typed mid-sentence would be emailed as text — so it is refused at send',
    broken: () => variant('plans-not-refused', "if (/\\{\\{\\s*plans_pdf\\s*\\}\\}/.test(text)) {", 'if (false) {'),
    run: M => /plans_pdf/.test(M.literalTokenRefusal(M.docFromTemplateText('Here is our {{plans_pdf}} for you', SETTINGS)) ?? ''),
  },
]

let pass = 0, fail = 0
const line = (good, label, detail) => { if (good) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  🔴 ${label}${detail ? `\n      ${detail}` : ''}`) } }
console.log('── the markup, on the real code and on a broken variant of each check ─────────────────────')
for (const ch of CHECKS) {
  let ok = false
  try { ok = ch.run(NOW) } catch (e) { line(false, ch.name, e.message); continue }
  line(ok, ch.name)
  let caught
  try { caught = !ch.run(ch.broken()) } catch { caught = true }
  line(caught, '   …and its broken variant fails it', caught ? '' : 'the variant passed — this check cannot fail')
}
line(J(NOW.docFromTemplateText(PLAIN[2], SETTINGS)) !== J(HEAD.docFromTemplateText(PLAIN[2], SETTINGS)),
  '⚠️ (control) a "• " line IS a list now — which is why no live template may carry one unnoticed (none does)')

console.log('── the resolver ────────────────────────────────────────────────────────────────────────')
const tpl = { id: 't', slug: 't', label: 'T', channel: 'email', subject: 'S', body: FORMATTED[3], defaults: {} }
const ctx = R.contextFromProspect({ name: 'Taco Fixture', contact_email: null, phone: null, website: null, order_url: null, demo: null, next_event_date: null, next_event_venue: null })
const out = R.renderTemplate(tpl, ctx)
line(/\{\{plans_pdf\}\}/.test(out.body) && !out.unresolved.includes('plans_pdf'),
  '{{plans_pdf}} survives the render untouched (like {{signature}}) and is not "still to fill"')
line(R.resolvedTokenReference().some(t => t.name === 'plans_pdf' && t.documented), '…and it is in "Insert token ▾", with its description')
line(/<i>Hope the season is going well\.<\/i>/.test(out.body) && !/See you at/.test(out.body),
  'a formatted ?condition: line is kept or dropped whole, its tags with it')
line(A.isPlansPdfFilename(A.plansPdfFilename(new Date('2026-10-15T09:00:00Z'))) && !A.isPlansPdfFilename('menu.pdf'),
  'the plans PDF is recognised by its own filename, so a template never attaches a second copy')

console.log('── the screens ─────────────────────────────────────────────────────────────────────────')
const TAB = stripComments(read('components/admin/TemplatesPanel.tsx'))
const COMPOSE = stripComments(read('components/admin/ComposeWindow.tsx'))
const EDITOR = stripComments(read('components/admin/RichEmailEditor.tsx'))
line(/<div className="flex-1 min-h-\[7rem\] flex flex-col" data-template-editor/.test(TAB)
  && !/<label[^>]*>\s*<TemplateBodyEditor/.test(TAB),
  '⛔ the email editor sits in a <div>, never a <label> (the 5 October bold bug)')
line(/<RichEmailEditor value=\{doc\} signatureLines=\{\[\]\} optOut=\{null\} templateTokens/.test(TAB)
  && /templateMarkupFromDoc\(d\)/.test(TAB) && /docFromTemplateMarkup\(body\)/.test(TAB),
  'Templates writes email in the compose window\'s own editor, and stores what it writes as template text')
line(/insertLines\(\[\{ text: '\{\{signature\}\}' \}\]\)/.test(EDITOR) && /insertLines\(\[\{ text: '\{\{opt_out\}\}' \}\]\)/.test(EDITOR),
  '…where Insert signature / Insert opt-out put the TOKENS, filled when the template is used')
line(/insertText\?\.\('\{\{plans_pdf\}\}', \{ ownLine: true \}\)/.test(TAB) && /emailOnlyHidden && t\.name === 'plans_pdf'/.test(TAB),
  '📎 the editor toolbar has a Plans PDF button, and WhatsApp templates are not offered {{plans_pdf}}')
// 🔴 THE PREVIEW SHOWS THE FORMATTING, LIVE: built from the UNSAVED draft, drawn by the send's own docToHtml.
line(/const tpl = toMessageTemplate\(\{ \.\.\.selected, \.\.\.draft \} as Row\)/.test(TAB)
  && /docToHtml\(docFromTemplateText\(m\.body, sendSettings\)\)/.test(TAB)
  && /dangerouslySetInnerHTML=\{\{ __html: preview\.html \}\}/.test(TAB)
  && /\}, \[selected, draft, previewProspect, forceNoEvent, sendSettings\]\)/.test(TAB),
  'the preview draws the email WITH its formatting, from the unsaved draft — every change shows as it is made')
{
  const live = R.renderWithFills({ ...tpl, body: 'Hi,\n\n<b>Bold now</b>' }, ctx, {})
  line(/<b>Bold now<\/b>/.test(NOW.docToHtml(NOW.docFromTemplateText(live.body, SETTINGS))),
    '…and the preview\'s own three calls turn a just-typed <b> into bold')
}
line(/if \(tpl\.channel === 'email' && templateWantsPlansPdf\(out\.body\)\) attachPlansForTemplateRef\.current\(\)/.test(COMPOSE)
  && /filesRef\.current\.some\(f => isPlansPdfFilename\(f\.filename\)\)/.test(COMPOSE)
  && /templateWantsPlansPdf\(seed\.body\)/.test(COMPOSE),
  '📎 compose attaches the PDF when such a template is chosen (or opened pre-chosen), never twice')

console.log('')
if (fail) { console.log(`🔴 ${fail} FAILED of ${pass + fail}`); process.exit(1) }
console.log(`✅ all ${pass} passed`)
