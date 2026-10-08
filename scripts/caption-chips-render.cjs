#!/usr/bin/env node
// scripts/caption-chips-render.cjs — THE CAPTION TEMPLATE'S CHIPS, IN TWO REAL BROWSERS.
//
//   node scripts/caption-chips-render.cjs
//   HG_ENGINES=webkit node scripts/caption-chips-render.cjs      (one engine, when the other is broken)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THIS NEEDS A BROWSER, AND WHY IT NEEDS **TWO**
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ DOMINIC, 10 OCTOBER 2026: *"i went into edit template for weekly post. i tried to delete the 'list
// of days' from the template but it cleared all the template."*
//
// The chips are `contenteditable="false"` spans inside a `contenteditable` host, and the component's
// own comment said that "every engine treats such an element as ONE character — Backspace deletes it
// whole, the caret steps over it". **That is true of Chromium and it is not true of WebKit**, which is
// the engine this product is used in: Safari selects the whole host, or deletes far past the element.
// The feature was written and checked in the engine that happens to do the right thing for you.
//
// 🔴 SO THE CLAIM IS AN ENGINE-DIFFERENCE CLAIM, AND THE ONLY HONEST TEST IS TO PRESS THE KEY IN BOTH.
// No source check could have found this: the code was correct, the comment was wrong, and the engine
// nobody tested in was the one the operator uses.
//
// ⚠️ WHAT IS UNDER TEST IS `lib/weekly-post/caption-chips.ts`, COMPILED AND LOADED INTO THE PAGE —
// not a re-implementation. The fixture's own code is three lines of wiring (`keydown` → the exported
// handler → `preventDefault`), which is exactly what `SocialPosts.tsx` does and is asserted below.
// ⚠️ NO NETWORK, NO DATABASE, NO LIVE TRUCK: one `file://` page and two local browser builds.

const fs = require('fs')
const os = require('os')
const path = require('path')
const { compile } = require('./_slot-interval-compile.cjs')

const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

let fails = 0
const lines = []
const t = (ok, label) => { lines.push(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }

/* 🔴 THE REAL MODULE, COMPILED. ⚠️ `caption-template.ts` COMES WITH IT — the chips module imports the
 * grammar, and a fixture that stubbed it would be measuring a parser nobody ships. */
const c = compile(REPO, ['lib/weekly-post/caption-chips.ts'], 'capchips')
/* ⚠️ **AND EVERYTHING IT IMPORTS.** `caption-template` reaches `format`, `week`, `locale`, `caption`
 * and two modules outside this folder. ⛔ STUBBING ANY OF THEM WOULD BE MEASURING A PARSER NOBODY
 * SHIPS, so the whole graph goes into the page exactly as `tsc` wrote it. */
const compiled = (() => {
  const out = []
  const walk = (dir, prefix) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full, prefix + e.name + '/')
      else if (e.name.endsWith('.js')) out.push({ id: prefix + e.name.replace(/\.js$/, ''), code: fs.readFileSync(full, 'utf8') })
    }
  }
  walk(path.join(c.out, 'lib'), 'lib/')
  return out
})()

/**
 * The two compiled CommonJS modules, in one page, with a four-line loader.
 *
 * ⚠️ `require` IS A THREE-LINE SHIM rather than a bundler: two modules, one dependency between them,
 * and a build step here would be a build step to keep working. ⛔ THE MODULES THEMSELVES ARE UNTOUCHED
 * — they are read from the compiler's output exactly as `tsc` wrote them.
 */
const page = (template, wired) => `<!doctype html><html><head><meta charset="utf-8"><title>chips</title>
<style>body{font:14px system-ui;margin:0;padding:16px}
#host{min-height:6rem;border:1px solid #cbd5e1;border-radius:12px;padding:8px 12px;white-space:pre-wrap}
[data-caption-chip]{background:#ffedd5;border-radius:6px;padding:2px 6px;font-weight:700;color:#9a3412}
</style></head><body>
<div id="host" contenteditable="true" role="textbox"></div>
<script>
  /* ⚠️ A LAZY require(), SO THE ORDER THE MODULES ARE DEFINED IN DOES NOT MATTER — the graph has a
   * diamond in it (locale and caption both reach format) and a load order would be a second thing to
   * keep right. ⛔ RELATIVE IDS RESOLVE AGAINST THE REQUIRING FILE and @/ against the repo root,
   * which is what the tsconfig paths do on the server. */
  var __defs = {}, __mods = {}
  function define(id, body) { __defs[id] = body }
  function resolveId(from, id) {
    if (id.charAt(0) === '@') return id.slice(2)
    if (id.charAt(0) !== '.') return id
    var base = from.split('/').slice(0, -1)
    id.split('/').forEach(function (part) {
      if (part === '.') return
      if (part === '..') base.pop()
      else base.push(part)
    })
    return base.join('/')
  }
  function requireFrom(from, id) {
    var key = resolveId(from, id)
    if (__mods[key]) return __mods[key]
    if (!__defs[key]) throw new Error('no module ' + id + ' (as ' + key + ')')
    var module = { exports: {} }
    __mods[key] = module.exports
    __defs[key](module, function (x) { return requireFrom(key, x) })
    __mods[key] = module.exports
    return module.exports
  }
  ${compiled.map(m => `define(${JSON.stringify(m.id)}, function (module, require) { var exports = module.exports;\n${m.code}\n})`).join('\n')}
  var C = requireFrom('lib/x', './weekly-post/caption-chips')
  var host = document.getElementById('host')
  host.innerHTML = C.captionHtml(${JSON.stringify(template)})
  /* ⚠️ THE WIRING, AND IT IS THE COMPONENT'S OWN TWO LINES — asserted against the source below. */
  if (${wired ? 'true' : 'false'}) host.addEventListener('keydown', function (e) { if (C.handleChipDeleteKey(host, e.key)) e.preventDefault() })
  window.readTemplate = function () { return C.captionFromDom(host) }
  /* 🔴 THE CARET, PLACED THE WAY THE OPERATOR PLACES IT: immediately after the chip, which is where a
   * click at the end of that word leaves it. setStartAfter is a DOM position, not a character count,
   * so this is the same caret the browser gives an operator rather than an approximation of it. */
  window.caretAfterChip = function (id) {
    var chip = host.querySelector('[data-caption-chip="' + id + '"]')
    if (!chip) return false
    var r = document.createRange()
    r.setStartAfter(chip); r.collapse(true)
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r)
    host.focus()
    return true
  }
  window.selectChip = function (id) {
    var chip = host.querySelector('[data-caption-chip="' + id + '"]')
    if (!chip) return false
    var r = document.createRange()
    r.selectNode(chip)
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r)
    host.focus()
    return true
  }
  /* ⛔ THE CONTROL'S CARET MUST NOT BE BESIDE A CHIP. "The end of the field" was the first attempt and
   * it is wrong for this template: the last thing in it IS a chip, so an 'ordinary' Backspace there
   * correctly deleted one — and the control failed for the reason it exists to rule out. This puts the
   * caret after a run of plain words instead. */
  window.caretAfterText = function (needle) {
    var walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
    var node
    while ((node = walker.nextNode())) {
      var at = node.textContent.indexOf(needle)
      if (at < 0) continue
      var r = document.createRange()
      r.setStart(node, at + needle.length); r.collapse(true)
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r)
      host.focus()
      return true
    }
    return false
  }
</script></body></html>`

async function engines() {
  const want = (process.env.HG_ENGINES || 'chromium,webkit').toLowerCase()
  const out = []
  if (!want.includes('chromium')) out.push({ name: 'Chromium', skip: 'not requested (HG_ENGINES)' })
  else try {
    const puppeteer = require('puppeteer')
    const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 30000 })
    const page = await b.newPage()
    out.push({ name: 'Chromium', close: () => b.close(), page, press: k => page.keyboard.press(k) })
  } catch (e) { out.push({ name: 'Chromium', skip: String(e.message).split('\n')[0].slice(0, 110) }) }
  if (!want.includes('webkit')) out.push({ name: 'WebKit', skip: 'not requested (HG_ENGINES)' })
  else try {
    const { webkit } = require('playwright')
    const b = await webkit.launch()
    const page = await b.newPage()
    out.push({ name: 'WebKit', close: () => b.close(), page, press: k => page.keyboard.press(k) })
  } catch (e) { out.push({ name: 'WebKit', skip: String(e.message).split('\n')[0].slice(0, 110) }) }
  return out
}

/* 🔴 THE REAL WEEKLY SEED, FROM THE REAL FUNCTION — so the string under test is the one a truck has,
 * and a change to the seed cannot leave this fixture testing a template nobody owns. ⚠️ THE TRUCK NAME
 * IS PLAIN TEXT IN IT, not a chip: `{truck}` was a guess and the parser says otherwise. */
const TPL = c.req('lib/weekly-post/caption-template.js')
const TEMPLATE = TPL.seedWeekTemplate('Pizza Kitchen')
const CHIP_COUNT = TPL.parseCaptionTemplate(TEMPLATE).filter(x => x.kind === 'label').length

;(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-chips-'))
  const file = path.join(tmp, 'chips.html')
  fs.writeFileSync(file, page(TEMPLATE, true))
  const url = 'file://' + file
  /* ⛔ **THE CONTROL PAGE: THE SAME FIELD WITH THE HANDLER NOT WIRED** — which is what shipped. Without
   * it this harness would prove that the editor works and nothing about whether the handler is what
   * makes it work. See the claim at the end. */
  const bare = path.join(tmp, 'chips-unwired.html')
  fs.writeFileSync(bare, page(TEMPLATE, false))
  const bareUrl = 'file://' + bare
  const unwired = []

  /* ══ ⚠️ THE WIRING IS THE COMPONENT'S, AND THAT IS ASSERTED ═══════════════════════════════════════
   * ⛔ A FIXTURE THAT HANDLED THE KEY ITS OWN WAY would prove its own cleverness and nothing about the
   * screen. These two claims are what make the page above a test of `SocialPosts.tsx`. */
  const SP = read('components/manage/SocialPosts.tsx')
  t(/if \(host && handleChipDeleteKey\(host, e\.key\)\) e\.preventDefault\(\)/.test(SP),
    'the editor wires the SAME exported handler this fixture drives')
  t(/onKeyDown=\{onKeyDown\}/.test(SP) && /onCopy=\{e => onCopyOrCut\(e, false\)\}/.test(SP)
    && /onCut=\{e => onCopyOrCut\(e, true\)\}/.test(SP),
    '…on the contentEditable host, with cut and copy beside it')
  t(/hasCaptionToken\(text\)\) document\.execCommand\('insertHTML', false, captionHtml\(text\)\)/.test(SP),
    '…and a pasted token comes back as a chip, which is what makes cut-and-paste a MOVE')

  let measured = 0
  for (const eng of await engines()) {
    if (eng.skip) { lines.push(`⚠️ ${eng.name}: SKIPPED — ${eng.skip}`); continue }
    measured++
    lines.push(`── ${eng.name} ────────────────────────────────────────────────────────────────`)
    const p = eng.page
    await p.goto(url)

    /* ⚠️ THE PREMISE: the field really did load the whole template, chips and all. A fixture that
     * loaded nothing would "lose only the chip" perfectly. */
    const start = await p.evaluate(() => window.readTemplate())
    t(start === TEMPLATE, `${eng.name}: the field holds the whole template to start with`)
    const chips = await p.evaluate(() => document.querySelectorAll('[data-caption-chip]').length)
    t(chips === CHIP_COUNT, `${eng.name}: …drawn as ${chips} chips, which is what the parser finds in it (${CHIP_COUNT})`)

    /* ══ 🔴 THE BUG: BACKSPACE WITH THE CARET AFTER {day-list} ════════════════════════════════════ */
    await p.evaluate(() => window.caretAfterChip('day-list'))
    await eng.press('Backspace')
    const afterBack = await p.evaluate(() => window.readTemplate())
    t(afterBack === TEMPLATE.replace('{day-list}', ''),
      `${eng.name}: 🔴 Backspace removes ONLY the chip (${JSON.stringify(afterBack).slice(0, 72)})`)
    /* ⛔ AND THE REST IS STILL THERE — the failure Dominic saw was an EMPTY field, so the honest claim
     * names what must survive rather than only what must go. */
    /* ⚠️ THE TRUCK'S NAME IS PLAIN TEXT IN THIS TEMPLATE, not a chip — `{truck}` was my guess and the
     * parser said otherwise, which is why the claim names what the seed really contains. */
    t(afterBack.includes('Pizza Kitchen') && afterBack.includes('{order-link}')
      && afterBack.includes('Order ahead:'),
      `${eng.name}: …and the other chip, the truck's name and every word survive`)

    /* ══ 🔴 DELETE, FROM THE OTHER SIDE ═══════════════════════════════════════════════════════════ */
    await p.goto(url)
    await p.evaluate(() => {
      const chip = document.querySelector('[data-caption-chip="day-list"]')
      const r = document.createRange()
      r.setStartBefore(chip); r.collapse(true)
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r)
      document.getElementById('host').focus()
    })
    await eng.press('Delete')
    const afterDel = await p.evaluate(() => window.readTemplate())
    t(afterDel === TEMPLATE.replace('{day-list}', ''),
      `${eng.name}: 🔴 Delete removes ONLY the chip, from the other side`)

    /* ══ 🔴 A CHIP THE OPERATOR HAS **SELECTED** — which is what clicking one does in WebKit ═══════ */
    await p.goto(url)
    await p.evaluate(() => window.selectChip('day-list'))
    await eng.press('Backspace')
    const afterSel = await p.evaluate(() => window.readTemplate())
    t(afterSel === TEMPLATE.replace('{day-list}', ''),
      `${eng.name}: 🔴 a selected chip deletes as one thing`)

    /* ══ ⛔ AND AN ORDINARY BACKSPACE IS STILL THE BROWSER'S ═══════════════════════════════════════
     * A handler that swallowed every Backspace would pass every claim above and make the field
     * unusable. With the caret at the very end, one press must remove exactly one CHARACTER. */
    await p.goto(url)
    const placed = await p.evaluate(() => window.caretAfterText('this week:'))
    t(placed === true, `${eng.name}: the control's caret is in plain text, not beside a chip`)
    await eng.press('Backspace')
    const afterChar = await p.evaluate(() => window.readTemplate())
    t(afterChar === TEMPLATE.replace('this week:', 'this week'),
      `${eng.name}: ⛔ CONTROL — an ordinary Backspace still deletes ONE CHARACTER (${JSON.stringify(afterChar).slice(0, 56)})`)
    t(afterChar.includes('{day-list}'),
      `${eng.name}: …and the chips are untouched by it`)

    /* ══ ⛔ THE CONTROL: THE SAME PRESS, WITH THE HANDLER NOT WIRED ════════════════════════════════
     * 🔴 THIS IS THE BUG AS IT SHIPPED. The engines disagree — which is the whole point, and is why no
     * source check and no single-engine test was ever going to find it. */
    await p.goto(bareUrl)
    await p.evaluate(() => window.caretAfterChip('day-list'))
    await eng.press('Backspace')
    const bareAfter = await p.evaluate(() => window.readTemplate())
    unwired.push({ engine: eng.name, ok: bareAfter === TEMPLATE.replace('{day-list}', ''), got: bareAfter })
    lines.push(`  ⚠️ ${eng.name}: unwired, the same press leaves ${JSON.stringify(bareAfter).slice(0, 60)}`)

    await eng.close()
  }

  if (!measured) { lines.push('🔴 no engine available — nothing was measured'); fails++ }
  /* ══ ⛔ **THE CONTROL'S OWN CLAIM — AND WHAT IT DOES AND DOES NOT SHOW** ═══════════════════════════
   * 🔴 WITHOUT THE HANDLER, THE PRESS DOES NOT DO WHAT THE OPERATOR ASKED. Measured: in BOTH engines,
   * headless, with the caret set against the chip through the DOM, the template comes back UNCHANGED —
   * the browsers decline to delete a `contenteditable="false"` child rather than treating it as one
   * character, which is the opposite of what the component's old comment claimed.
   * ⚠️ **IT IS NOT THE EXACT SYMPTOM DOMINIC SAW.** He reported the field being CLEARED, which is
   * Safari's behaviour with a real pointer-made selection and is not reproducible from a scripted
   * caret. Both are the same defect — the browser was trusted to treat a chip as one character and does
   * not — and this control is the half of it a harness can drive. Said out loud rather than claimed.
   * ⛔ "AT LEAST ONE ENGINE", not "WebKit": which engine misbehaves is a fact about browsers, and the
   * day one of them changes its mind this still measures the thing that matters. */
  if (measured) {
    const broken = unwired.filter(u => !u.ok).map(u => u.engine)
    t(broken.length > 0,
      `⛔ CONTROL: unwired, the chip is NOT deleted as one character (${broken.join(', ') || 'both engines did it unaided — the handler may be unnecessary'})`)
    for (const u of unwired.filter(x => x.ok)) {
      lines.push(`  ⚠️ ${u.engine} would have been fine on its own — the handler makes the two agree`)
    }
  }
  console.log(lines.join('\n'))
  console.log('')
  console.log(fails === 0 ? `✅ the chips delete and move correctly, in ${measured} engine(s)` : `🔴 ${fails} CHECK(S) FAILED`)
  process.exit(fails === 0 ? 0 : 1)
})().catch(e => { console.log('🔴 the harness threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : e)); process.exit(1) })
