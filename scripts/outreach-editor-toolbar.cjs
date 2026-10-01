#!/usr/bin/env node
// scripts/outreach-editor-toolbar.cjs — the composer's editor: what it sends, and how it behaves.
//   node scripts/outreach-editor-toolbar.cjs              (≈ 5 s: one compile, NO NETWORK, NO DATABASE)
//   HG_RENDER=1 node scripts/outreach-editor-toolbar.cjs   (adds Chromium + WebKit; needs esbuild + a build)
//
// ── 🔴 FAILURE MODE, in the order it would hurt ────────────────────────────────────────────────────
//    A MARK OR NODE THE SERVER REFUSES — the operator writes an email, presses Send and is told the
//    document is invalid, having lost nothing but their time and their trust in the box;
//    a list that arrives as unindented prose, or a size that arrives as a class a client has stripped:
//    "exactly what is here is sent" is the one promise this editor makes;
//    the toolbar lying about the caret — a B that says "on" over plain text teaches the operator to
//    ignore the toolbar, and then they cannot tell bold from not-bold before sending;
//    and an `href` outside the allow-list, which is the only value in this schema that can execute.

const fs = require('fs'); const path = require('path')
const { compile, REPO } = require('./_slot-interval-compile.cjs')

let fails = 0
const ok = [], bad = []
const t = (n, c) => (c ? ok : bad).push(n)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

function buildLib(tag) {
  const c = compile(REPO, ['lib/outreach-doc.ts'], tag)
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(c.out, 'node_modules')) } catch { /* already */ }
  return c.req('lib/outreach-doc.js')
}

const tx = (text, marks) => marks ? { type: 'text', text, marks: marks.map(m => typeof m === 'string' ? { type: m } : m) } : { type: 'text', text }
const para = (...kids) => ({ type: 'paragraph', content: kids })
const item = (...kids) => ({ type: 'listItem', content: [para(...kids)] })

function run(D) {
  // ── 1 · THE SCHEMA TAKES LISTS AND THE NEW MARKS ────────────────────────────────────────────────
  const sample = { type: 'doc', content: [
    para(tx('Hi George,')),
    { type: 'bulletList', content: [item(tx('Online ordering')), item(tx('Pre-orders'), { type: 'hardBreak' }, tx('and queue-skippers'))] },
    { type: 'orderedList', content: [item(tx('Upload a menu')), item(tx('Go live'))] },
    para(tx('See '), tx('villagefoodie.co.uk', [{ type: 'link', attrs: { href: 'https://villagefoodie.co.uk' } }]),
      tx(' or '), tx('email me', [{ type: 'link', attrs: { href: 'mailto:dominic@hatchgrab.com' } }])),
    para(tx('Big news', ['large'])),
    para(tx('Small print', ['small'])),
    para(tx('emphasis', ['italic', 'bold'])),
  ] }
  const v = D.validateDoc(sample)
  t('🔴 the schema accepts bullet lists, numbered lists, italic, large and mailto links', v.ok === true)
  if (!v.ok) { t(`🔴 …it refused: ${v.error}`, false); return { ok, bad } }
  const html = D.docToHtml(v.doc)
  const text = D.docToText(v.doc)

  // ── 2 · WHAT IS SENT: INLINE STYLES ONLY ────────────────────────────────────────────────────────
  t('🔴 the sent HTML carries NO class attribute and NO <style> block',
    !/class=/.test(html) && !/<style/i.test(html))
  t('🔴 lists render as <ul>/<ol> with inline padding, and items carry the font inline',
    /<ul style="margin: 0; padding-left: 24px;">/.test(html)
    && /<ol style="margin: 0; padding-left: 24px;">/.test(html)
    && /<li style="font-family: Aptos[^"]*font-size: 12pt[^"]*margin: 0 0 4px;">/.test(html))
  t('⚠️ …and a two-line item keeps its marker beside the first line (a <br>, not a block)',
    /<li[^>]*>Pre-orders<br>and queue-skippers<\/li>/.test(html))
  t('🔴 links render as <a href> with the href escaped, http(s) and mailto alike',
    /<a href="https:\/\/villagefoodie\.co\.uk">villagefoodie\.co\.uk<\/a>/.test(html)
    && /<a href="mailto:dominic@hatchgrab\.com">email me<\/a>/.test(html))
  t('🔴 the three sizes are 10pt / 12pt / 14pt, inline, and Normal carries NO size span',
    /font-size: 13\.333333px/.test(html) && /font-size: 18\.666667px/.test(html)
    && /font-size: 12pt/.test(html) && !/>Hi George,<\/span>/.test(html))
  t('⚠️ bold is <b> and italic is <i> — the tags Outlook has the longest history with',
    /<i><b>emphasis<\/b><\/i>|<b><i>emphasis<\/i><\/b>/.test(html))

  // ── 3 · THE PLAIN-TEXT PART ─────────────────────────────────────────────────────────────────────
  t('🔴 bullets render as "• " and numbered items as "1. ", "2. "',
    /^• Online ordering$/m.test(text) && /^1\. Upload a menu$/m.test(text) && /^2\. Go live$/m.test(text))
  t('🔴 links render as "text (url)"', /villagefoodie\.co\.uk \(https:\/\/villagefoodie\.co\.uk\)/.test(text))
  t('⚠️ …with the mailto: scheme stripped, because the address is the useful part',
    /email me \(dominic@hatchgrab\.com\)/.test(text) && !/\(mailto:/.test(text))
  t('⚠️ a wrapped item is indented by its marker width, so it reads as one item',
    /^• Pre-orders\n  and queue-skippers$/m.test(text))
  t('🔴 and there is no markup anywhere in the plain part', !/[<>]/.test(text))

  // ── 4 · THE href ALLOW-LIST — THE ONLY VALUE HERE THAT CAN EXECUTE ──────────────────────────────
  const linked = href => D.validateDoc({ type: 'doc', content: [para(tx('x', [{ type: 'link', attrs: { href } }]))] })
  for (const good of ['https://a.co', 'http://a.co', 'https://a.co:8443/x?y=1', 'mailto:a@b.co', 'mailto:a@b.co?subject=Hi']) {
    t(`⚠️ allowed: ${good}`, linked(good).ok === true)
  }
  for (const bad2 of ['javascript:alert(1)', 'data:text/html,<script>', 'vbscript:x', 'file:///etc/passwd',
    '//evil.co', 'https://a.co/"onmouseover="x', 'mailto:nobody', 'javascript:alert(1)#https://a.co',
    'https://a.co#<script>']) {
    t(`🔴 refused: ${bad2}`, linked(bad2).ok === false)
  }

  // ── 5 · WHAT THE SCHEMA STILL REFUSES ───────────────────────────────────────────────────────────
  t('🔴 a heading, an image or a table is still refused', ['heading', 'image', 'table'].every(ty =>
    D.validateDoc({ type: 'doc', content: [{ type: ty, content: [] }] }).ok === false))
  t('🔴 a mark outside the five is refused',
    D.validateDoc({ type: 'doc', content: [para(tx('x', ['highlight']))] }).ok === false)
  t('🔴 Small and Large together are refused — they are two values of one property',
    D.validateDoc({ type: 'doc', content: [para(tx('x', ['small', 'large']))] }).ok === false)
  /* 🔴 A NESTED LIST IS REFUSED ON PURPOSE. Tab indents in the editor, so this is reachable; an
   * inline-styled nested list is one of the least reliable things in Outlook, and arriving flattened or
   * doubly bulleted is worse than a refusal that names the fix. */
  t('🔴 a list nested inside a list item is refused, naming the fix', (() => {
    const r = D.validateDoc({ type: 'doc', content: [{ type: 'bulletList', content: [
      { type: 'listItem', content: [para(tx('a')), { type: 'bulletList', content: [item(tx('b'))] }] }] }] })
    return r.ok === false && /unindent/.test(r.error)
  })())
  t('⚠️ an EMPTY list is dropped rather than refused — TipTap can leave one behind', (() => {
    const r = D.validateDoc({ type: 'doc', content: [para(tx('a')), { type: 'bulletList', content: [] }] })
    return r.ok === true && r.doc.content.length === 1
  })())
  t('🔴 validation REBUILDS, so a stray attribute cannot ride into the HTML', (() => {
    const r = D.validateDoc({ type: 'doc', content: [{ type: 'paragraph', attrs: { onclick: 'x' },
      content: [{ type: 'text', text: 'a', marks: [{ type: 'bold', attrs: { style: 'x' } }] }] }] })
    return r.ok === true && !JSON.stringify(r.doc).includes('onclick') && !JSON.stringify(r.doc).includes('style')
  })())

  // ── 6 · THE GREETING IS NOT BOLD — THE DOCUMENT IS NOT THE CAUSE ────────────────────────────────
  // 🔴 The reported bug was a bold greeting. This is the proof the BUILDER is innocent: the only bold in
  // a rendered template is the signature line that stores `bold: true`.
  t('🔴 a built template has a PLAIN greeting and bold only where the signature says so', (() => {
    const d = D.docFromTemplateText('Hi George,\n\nI run villagefoodie.co.uk.\n\n{{signature}}\n{{opt_out}}', {
      signatureLines: [{ text: 'Kind regards,' }, { text: '' }, { text: 'Dominic Bonini', bold: true }],
      optOut: 'Reply STOP and I will not contact you again.',
    })
    const bolds = [...JSON.stringify(d).matchAll(/"text":"([^"]*)","marks":\[\{"type":"bold"\}\]/g)].map(m => m[1])
    return bolds.length === 1 && bolds[0] === 'Dominic Bonini'
  })())
  return { ok, bad }
}

function census() {
  const o = [], b = []
  const tt = (n, c) => (c ? o : b).push(n)
  const E = stripComments(read('components/admin/RichEmailEditor.tsx'))

  tt('🔴 the active states are SUBSCRIBED through useEditorState, not read at render time',
    /const active = useEditorState\(\{/.test(E)
    && !/aria-pressed=\{editor\.isActive\(/.test(E)
    && !/shouldRerenderOnTransaction/.test(E))
  tt('🔴 the content effect skips this editor\'s own echo, however the parent held it',
    /if \(incoming === lastEmitted\.current\) return/.test(E)
    && /lastEmitted\.current = JSON\.stringify\(json\)/.test(E))
  tt('🔴 …and a replaced document lands the caret at the start with no stored marks',
    /editor\.commands\.setTextSelection\(1\)/.test(E)
    && /setStoredMarks\(null\)/.test(E))
  /* ── 🔴 THE EDITOR CANNOT BUILD WHAT THE SEND REFUSES (1 October 2026) ────────────────────────────
   * `validateDoc` refuses a nested list, and Tab used to nest — so the editor built the one shape the
   * send rejects, and the operator found out after writing the email. Tab/Shift-Tab are swallowed inside
   * a list item now. ⚠️ `true` MEANS HANDLED: returning false would let ListKeymap nest, and letting the
   * event reach the browser would move focus out of the editor, which is worse than nesting. */
  tt('🔴 Tab and Shift-Tab are swallowed inside a list item, above ListKeymap\'s priority',
    /const NoListIndent = Extension\.create\(\{/.test(E)
    && /priority: 1000/.test(E)
    && /const swallowInsideList = \(\) => this\.editor\.isActive\('listItem'\)/.test(E)
    && /return \{ Tab: swallowInsideList, 'Shift-Tab': swallowInsideList \}/.test(E)
    && /\n    NoListIndent,\n/.test(E))
  tt('⚠️ …and the send-time refusal is KEPT as a backstop for a document from elsewhere', (() => {
    const DOC = stripComments(read('lib/outreach-doc.ts'))
    return /cannot be emailed reliably/.test(DOC) && /unindent that item/.test(DOC)
  })())
  tt('🔴 a toolbar button does not take the selection with it',
    /const keepSelection = \(e: ReactMouseEvent\) => e\.preventDefault\(\)/.test(E)
    && (E.match(/onMouseDown=\{keepSelection\}/g) || []).length >= 9)
  tt('🔴 the four list pieces come from the maintained v3 package, and NOT StarterKit',
    /import \{ BulletList, OrderedList, ListItem, ListKeymap \} from '@tiptap\/extension-list'/.test(E)
    && !/StarterKit/.test(E))
  tt('⚠️ italic is the official extension; Small, Large and Link stay local',
    /import Italic from '@tiptap\/extension-italic'/.test(E)
    && /const Small = Mark\.create/.test(E) && /const Large = Mark\.create/.test(E)
    && /const Link = Mark\.create/.test(E))
  tt('🔴 the Link control validates against the schema\'s own LINK_RE, not a second regex',
    /LINK_RE\.test\(url\)/.test(E) && /from '@\/lib\/outreach-doc'/.test(E))
  tt('⚠️ the Size menu offers exactly three, and Normal unsets both marks',
    /unsetMark\('small'\)\.unsetMark\('large'\)/.test(E)
    && /unsetMark\('large'\)\.setMark\('small'\)/.test(E)
    && /unsetMark\('small'\)\.setMark\('large'\)/.test(E))
  tt('🔴 the pins are all 3.31.3 and the list package is the v3 one', (() => {
    const pkg = JSON.parse(read('package.json')).dependencies
    const tip = Object.entries(pkg).filter(([k]) => k.startsWith('@tiptap/'))
    return tip.length === 10 && tip.every(([, v]) => v === '3.31.3')
      && !!pkg['@tiptap/extension-list'] && !!pkg['@tiptap/extension-italic']
      && !pkg['@tiptap/starter-kit']
  })())
  // ── WHAT MAY NOT CHANGE ────────────────────────────────────────────────────────────────────────
  tt('🔴 the Templates editor is still a textarea — only the composer changed',
    /<textarea ref=\{bodyRef\}/.test(stripComments(read('components/admin/TemplatesPanel.tsx')))
    && !/RichEmailEditor/.test(read('components/admin/TemplatesPanel.tsx')))
  tt('🔴 EMAIL_FRAME_SANDBOX is allow-same-origin only', (() => {
    const W = stripComments(read('lib/outreach-workspace.ts'))
    return /export const EMAIL_FRAME_SANDBOX = 'allow-same-origin'/.test(W)
      && /FORBIDDEN_SANDBOX_TOKENS = \['allow-scripts'/.test(W)
  })())
  tt('🔴 one contact writer and one follow-up writer', (() => {
    const P = stripComments(read('components/admin/ProspectWorkspace.tsx'))
    return (P.match(/const applyFollowUp = useCallback/g) || []).length === 1
      && (P.match(/nextStep\(/g) || []).length === 1
  })())
  return { ok: o, bad: b }
}

;(async () => {
  const D = buildLib('real')
  const show = (title, r) => {
    console.log(`\n${title}`)
    for (const n of r.ok) console.log('  ✓ ' + n)
    for (const n of r.bad) console.log('  🔴 ' + n)
    fails += r.bad.length
    return r
  }
  const a = show('── WHAT IS SENT, AND WHAT IS REFUSED ───────────────────────────────────────────────────', run(D))
  const b = show('── THE EDITOR\'S WIRING ─────────────────────────────────────────────────────────────────', census())

  let browserPassed = 0
  console.log('\n── THE EDITOR IN A REAL BROWSER — CHROMIUM AND WEBKIT ──────────────────────────────────')
  if (process.env.HG_RENDER !== '1') {
    console.log('  ⚠️ SKIPPED — set HG_RENDER=1. It bundles the component with esbuild and needs local')
    console.log('     browser builds plus `next build` for the Tailwind bundle; the sweep must not depend')
    console.log('     on either. The run, with its numbers, is in docs/outreach-editor-toolbar-report.md.')
  } else {
    // 🔴 IT ACTUALLY RUNS NOW. This printed a pointer to the report, which is not a check — the gate has
    // to execute the browser work or it is documentation wearing a conditional.
    const { measure } = require('./outreach-editor-render.cjs')
    const res = await measure()
    for (const line of res.lines) console.log('  ' + line)
    fails += res.fails
    // ⚠️ COUNTED INTO THE TOTAL. The summary said "all 47 passed" while silently excluding every browser
    // assertion it had just run — a number that under-reports what was checked is its own small lie.
    browserPassed = res.lines.filter(l => l.startsWith('✓')).length
  }
  const total = a.ok.length + b.ok.length + browserPassed
  console.log(`\n${fails === 0
    ? `✅ all ${total} passed${browserPassed ? ` (${browserPassed} of them in a real browser)` : ''}`
    : `🔴 ${fails} CHECK(S) FAILED`}`)
  process.exit(fails === 0 ? 0 : 1)
})()
