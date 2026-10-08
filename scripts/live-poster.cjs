#!/usr/bin/env node
// scripts/live-poster.cjs — §2: the words the EDITOR draws, measured against the words the PNG has.
//
//   node scripts/live-poster.cjs        (NO NETWORK, NO DATABASE, NO REAL TRUCK ARTWORK)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT THIS GUARDS, AND WHY NOTHING ELSE COULD
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ **DOMINIC:** *"when i move a box the text stays in its old position for seconds."* §2's answer is
// that the editor draws every word itself, in the browser, from the renderer's own tree. The source
// harnesses can see that it CALLS `weeklyTree`; they cannot see whether the words land where the PNG
// puts them. **That is the only question that matters here**: a live stage that is fast and wrong is
// worse than the slow one it replaced, because an operator would trust it.
//
// 🔴 SO THIS RENDERS THE SAME DESIGN TWICE AND COMPARES THE PIXELS WITH THE DOM.
//   • satori draws the PNG. The blank is WHITE and the text is BLACK, so every inked pixel is text —
//     and `diffBounds` gives the box those pixels occupy.
//   • a real browser mounts the SAME `El[]` tree, through `LivePoster`'s own three translations
//     (lifted from the component, so the fixture cannot drift from it), with the SAME Oswald file.
//   • the two rectangles must agree to within a few pixels.
//
// ⚠️ A FEW PIXELS IS THE HONEST TOLERANCE AND THE REPORT SAYS WHY: yoga and a browser's flexbox are
// two engines, and a browser's `line-height: normal` includes the font's line gap where satori's does
// not. The claim is "the same words in the same place", not "byte-identical" — that is what
// "👁 Preview post" is for.
//
// ⛔ NO FONT IS FETCHED BY THE PAGE. The TTF is inlined as a data URI and registered with `FontFace`,
// which is what `live-fonts.ts` does with the bytes the GET returns — and it means this harness
// measures the drawing, not the plumbing. The page makes **zero** network requests and that is asserted.

const fs = require('fs')
const path = require('path')
const os = require('os')
const { compile } = require('./_slot-interval-compile.cjs')
const { decodePng, diffBounds } = require('./_png-decode.cjs')

const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

/* ══ 🔴 THE MODULE LIST IS **LIFTED FROM `weekly-post.cjs`**, NOT COPIED ══════════════════════════
 * ⛔ A SECOND COPY OF A TWENTY-ENTRY IMPORT LIST IS A SECOND LIST TO FORGET. `draw.ts` was added to
 * that one the day the poster tree moved out of `render.ts`; a hand-written list here would have gone
 * on compiling a graph the product no longer has. ⚠️ IT THROWS rather than falling back. */
const LIB = (() => {
  const src = read('scripts/weekly-post.cjs')
  const m = /\nconst LIB = \[([\s\S]*?)\n\]\n/.exec(src)
  if (!m) throw new Error('the module list could not be lifted from scripts/weekly-post.cjs')
  /* ⚠️ ONLY QUOTED **PATHS**, AND THE FIRST ATTEMPT DID NOT SAY SO. `/'([^']+)'/g` also matched the
   * apostrophes in that list's own prose — "harness's", "poster's" — and tsc was handed half a comment
   * as a file name. A lift has to match the shape of the thing it is lifting. */
  const files = [...m[1].matchAll(/'([\w./@-]+\.ts)'/g)].map(x => x[1])
  if (!files.includes('lib/weekly-post/draw.ts')) {
    throw new Error('the lifted module list has no draw.ts — this harness is about that file')
  }
  return files
})()

let fail = 0, pass = 0
const t = (ok, label) => {
  if (ok) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  🔴 ' + label) }
}
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 86 - s.length)))

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE REAL MODULES
// ════════════════════════════════════════════════════════════════════════════════════════════════

const c = compile(REPO, LIB, 'lp')
try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(c.out, 'node_modules')) } catch { /* there */ }
const M = {
  week: c.req('lib/weekly-post/week.js'),
  data: c.req('lib/weekly-post/week-data.js'),
  layout: c.req('lib/weekly-post/layout.js'),
  days: c.req('lib/weekly-post/days.js'),
  draw: c.req('lib/weekly-post/draw.js'),
  render: c.req('lib/weekly-post/render.js'),
  fonts: c.req('lib/weekly-post/fonts.js'),
  bundle: c.req('lib/weekly-post/font-bundle.js'),
}
const { ImageResponse } = require(path.join(REPO, 'node_modules/next/og.js'))

// ════════════════════════════════════════════════════════════════════════════════════════════════
// LivePoster's THREE TRANSLATIONS, LIFTED FROM THE COMPONENT
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ THE FIXTURE MOUNTS THE TREE THE WAY THE COMPONENT DOES, AND IT HAS TO PROVE IT. Every one of
// these is read out of the real source and the harness THROWS if it is not there — so a change to the
// component either changes this measurement or fails the run. ⚠️ THE MAPPER ITSELF IS SIX LINES, which
// is the whole reason `LivePoster` is believable: there is almost nothing in it to get wrong.

const LP = read('components/manage/LivePoster.tsx')
const LF = read('lib/weekly-post/live-fonts.ts')
const must = (re, what, src) => {
  if (!re.test(src)) throw new Error(`the fixture cannot be built: no ${what} found in the source`)
}
must(/out\.fontFamily = `"\$\{liveFamily\(fam\)\}"`/, "the family alias", LP)
must(/boxSizing: 'border-box'/, 'the border-box rule', LP)
must(/transform: `scale\(\$\{k\}\)`/, 'the one scale', LP)
must(/\[data-live-poster\] \*\{box-sizing:border-box;margin:0;padding:0\}/, 'the scoped reset', LP)
/* 🔴 THE ALIAS FUNCTION ITSELF, lifted as source and evaluated — so the page registers the face under
 * exactly the name the component will ask for. ⛔ RE-TYPING IT HERE WOULD BE THE BUG IT PREVENTS: a
 * face registered as one name and requested as another draws in the browser's default font, silently. */
const ALIAS_SRC = (() => {
  const m = /export const liveFamily = \(family: string\): string =>\n\s*(`[^`]+`)/.exec(LF)
  if (!m) throw new Error('the fixture cannot be built: no liveFamily in lib/weekly-post/live-fonts.ts')
  return m[1]
})()
// eslint-disable-next-line no-new-func
const liveFamily = new Function('family', `return ${ALIAS_SRC}`)

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE FIXTURE DESIGN — ONE BLACK BOX OF WORDS ON A WHITE BLANK
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ ONE BOX, BECAUSE THE PNG IS READ AS **INK**. With seven day rows the inked pixels are one blob
// and "where is the heading?" has no answer. The heading alone, black on white, with every other item
// switched off, makes the bounding box of the ink the bounding box of the words.
// ⚠️ `keepReadable: false` AND NO BAND, for the same reason: a shadow spreads the ink past the glyphs
// and a band inks the whole rectangle. ⛔ AND IT IS NOT A SPECIAL DRAWING PATH — the switches are the
// product's own, so this is a design a truck could make.

const W = 600, H = 750
const TEXT = 'WEDNESDAY 14TH OCTOBER'

/**
 * ══ 🔴 A **TWO-LINE** BOX, AND IT IS THE CASE THE LINE HEIGHT IS ABOUT ═══════════════════════════
 *
 * ⛔ ONE LINE COULD NOT SHOW IT, AND THAT WAS A WRONG CONCLUSION CORRECTED BY MEASUREMENT. The first
 * draft of this harness reported the live words 17px above the PNG's and blamed the missing
 * `lineHeight` — but that reading included the "Powered by HatchGrab" text node, 600px down the page,
 * in the live bounding box. With one line properly measured, a browser's taller line box is still
 * CENTRED on the same place, so the ink lands within 2px either way.
 * 🔴 WHAT ACTUALLY DEPENDS ON IT IS **STACKING**. Two lines are two line boxes, and a browser's are
 * each a line gap taller — so the second line sits further down and the block is taller than the PNG's.
 * ⚠️ AND THE SAME MECHANISM IS WHY "Line spacing" NOW DRAWS AT ALL: `fit.ts` measured it and the tree
 * carried no `lineHeight`, so satori stacked at the font's natural height whatever was chosen.
 */
function fixtureTwoLines() {
  const l = fixtureLayout(0)
  return {
    ...l,
    heading: {
      ...l.heading,
      /* ⚠️ NARROW AND LONG, so `ifTooLong: 'twoLines'` really does split it — the product's own
       * setting, not a newline typed into the fixture. */
      text: 'WEDNESDAY 14TH OCTOBER', w: 240, h: 200, fontSize: 40,
      ifTooLong: 'twoLines',
    },
  }
}

function fixtureLayout(dx = 0) {
  const l = M.layout.defaultLayout(W, H)
  const off = b => ({ ...b, enabled: false })
  return {
    ...l,
    /* ⚠️ `days` IS DROPPED, so the legacy path draws the heading and nothing else. The seven-row model
     * is measured in `weekly-post.cjs`; this harness is about one box's words. */
    days: null,
    darken: 0,
    keepReadable: false,
    /* ══ 🔴 THE COLOUR GOES ON THE **SHARED LOOK**, AND THE FIRST DRAFT DID NOT ═════════════════════
     * ⛔ IT SET `color: '#000000'` ON THE HEADING AND THE PNG CAME OUT PURE WHITE — because the heading
     * FOLLOWS "Style all the writing" unless it owns its style, so `resolveTextBox` replaced the box's
     * colour with the shared white one. White text on a white blank leaves no ink, and the harness
     * correctly reported "the PNG has ink where the heading is: null".
     * 🔴 THAT IS THE ONE RESOLVER DOING EXACTLY ITS JOB, and the fixture has to respect it: a design's
     * colour lives in the shared look. ⚠️ `effects` IS REPLACED WHOLE, because `resolveTextBox` copies
     * the look's effects over the box's — so a `keepReadable` left on here would put a shadow round
     * every glyph and widen the ink. */
    textStyle: {
      ...l.textStyle,
      color: '#000000',
      effects: { ...l.textStyle.effects, keepReadable: false, band: false, shadow: 'none', outline: null },
    },
    heading: {
      ...l.heading,
      enabled: true,
      text: TEXT,
      x: 60 + dx, y: 120, w: 480, h: 90,
      fontSize: 44,
      color: '#000000',
      align: 'left',
      caps: false,
      tilt: 0,
      effects: { ...l.heading.effects, keepReadable: false, band: false, shadow: 'none', outline: null },
    },
    date: off(l.date), location: off(l.location), time: off(l.time),
    placePicture: { ...l.placePicture, enabled: false },
    notes: (l.notes ?? []).map(off),
  }
}

const range = M.week.weekRange('this', '2026-09-30T12:00:00Z')
const week = M.data.buildWeekData(range, [], [], { timeStyle: '12h', showCancelled: true })

/** A plain white blank, through satori — so the PNG's only ink is the text. */
async function whiteBlank() {
  const el = { type: 'div', props: { style: { display: 'flex', width: `${W}px`, height: `${H}px`, background: '#ffffff' } } }
  const buf = Buffer.from(await new ImageResponse(el, { width: W, height: H }).arrayBuffer())
  return 'data:image/png;base64,' + buf.toString('base64')
}

/**
 * ══ 🔴 WHERE THE WORDS ARE IN THE PNG — BY RENDERING IT **TWICE** ════════════════════════════════
 *
 * ⛔ THE FIRST VERSION DIFFED AGAINST A BUFFER OF WHITE PIXELS IT BUILT ITSELF, and it reported "no
 * ink" on a PNG that demonstrably had black glyphs in it — so the claim would have failed on correct
 * code. `_png-decode.cjs` says in its own header what this is for: *"rendering the poster twice — once
 * with the text and once without — and diffing tells you exactly which pixels the text put on the
 * page, with no assumption about colour, shadow, anti-aliasing or what the artwork underneath looks
 * like."* 🔴 SO THAT IS WHAT THIS DOES, which is both the documented use and the stronger measurement:
 * it needs no definition of "background" at all.
 */
function inkOf(withText, without) {
  const a = decodePng(without)
  const b = decodePng(withText)
  const d = diffBounds(a, b, null, 24)
  return d.empty ? null : d
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE PAGE
// ════════════════════════════════════════════════════════════════════════════════════════════════

const FONT_B64 = fs.readFileSync(path.join(REPO, 'assets/fonts/weekly-post/oswald-400.ttf')).toString('base64')

/**
 * ⚠️ THE MAPPER BELOW IS `LivePoster`'s, IN THE SAME ORDER AND WITH THE SAME THREE TRANSLATIONS — the
 * assertions above prove each one is still in the component. ⛔ IT DOES NOT FIT, WORD OR POSITION
 * ANYTHING: it walks `{ type, props: { style, children } }` and sets styles, which is all the component
 * does. A fixture that laid anything out would be measuring itself.
 */
function page(tree, shownW) {
  const alias = liveFamily('Oswald')
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:"${alias}";font-weight:400;font-style:normal;
    src:url(data:font/ttf;base64,${FONT_B64}) format('truetype')}
  html,body{margin:0;padding:0;background:#fff}
  [data-live-poster] *{box-sizing:border-box;margin:0;padding:0}
  </style></head><body>
  <div id="stage" style="position:relative;width:${shownW}px;height:${Math.round(shownW * H / W)}px;overflow:hidden"></div>
  <script>
  const TREE = ${JSON.stringify(tree)}
  const W = ${W}, H = ${H}, shownW = ${shownW}
  const alias = ${JSON.stringify(alias)}
  function styleFor(raw){
    const out = Object.assign({}, raw)
    if (typeof out.fontFamily === 'string') out.fontFamily = '"' + alias + '"'
    return out
  }
  function mount(node, into){
    if (node === undefined || node === null) return
    if (typeof node === 'string' || typeof node === 'number') { into.appendChild(document.createTextNode(String(node))); return }
    if (Array.isArray(node)) { node.forEach(n => mount(n, into)); return }
    const el = document.createElement(node.type === 'img' ? 'img' : 'div')
    if (node.type === 'img') el.src = String(node.props.src || '')
    el.setAttribute('data-el', node.type)
    Object.assign(el.style, styleFor(node.props.style || {}))
    into.appendChild(el)
    mount(node.props.children, el)
  }
  const root = document.createElement('div')
  root.setAttribute('data-live-poster', '')
  Object.assign(root.style, {
    position: 'absolute', left: '0', top: '0', width: W + 'px', height: H + 'px',
    transformOrigin: 'top left', transform: 'scale(' + (shownW / W) + ')', boxSizing: 'border-box',
    pointerEvents: 'none',
  })
  TREE.forEach(n => mount(n, root))
  document.getElementById('stage').appendChild(root)
  /* 🔴 THE BOUNDING BOX OF THE **TEXT NODES**, not of the boxes. A box is 480×90 whatever it holds;
   * the question is where the glyphs are. ⚠️ A \`Range\` OVER EACH TEXT NODE gives its line boxes. */
  window.inkBox = () => {
    const walk = (n, out) => {
      for (const k of n.childNodes) {
        if (k.nodeType === 3 && k.textContent.trim()) {
          const r = document.createRange(); r.selectNodeContents(k)
          for (const b of r.getClientRects()) if (b.width > 0 && b.height > 0) out.push(b)
        } else if (k.nodeType === 1) walk(k, out)
      }
      return out
    }
    /* ⛔ THE **FIRST** CHILD ONLY — THE HEADING BOX. "Powered by HatchGrab" is drawn in white on a
     * white blank, so it leaves no ink in the PNG and has nothing to be compared with; including its
     * text node stretched the live box to the foot of the page and the first version of this claim
     * failed on correct code (live 132–744 vs png 149–185). */
    const rects = walk(root.firstElementChild, [])
    if (!rects.length) return null
    const k = W / shownW
    return {
      x: Math.round(Math.min(...rects.map(r => r.left)) * k),
      y: Math.round(Math.min(...rects.map(r => r.top)) * k),
      right: Math.round(Math.max(...rects.map(r => r.right)) * k),
      bottom: Math.round(Math.max(...rects.map(r => r.bottom)) * k),
      count: rects.length,
    }
  }
  window.ready = document.fonts.ready.then(() => true)
  </script></body></html>`
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE ENGINES
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// 🔴 WEBKIT FIRST, BECAUSE THE DEVICE IS A MAC AND THE BROWSER IS SAFARI. Chromium is measured too
// when it is there. ⛔ AN ENGINE THAT IS MISSING IS **SAID**, never silently passed.

async function engines() {
  const out = []
  let pw = null
  try { pw = require(path.join(REPO, 'node_modules/playwright-core')) } catch { /* not installed */ }
  if (!pw) {
    try { pw = require(path.join(REPO, 'node_modules/playwright')) } catch { /* nor this */ }
  }
  if (!pw) return [{ name: 'playwright', skip: 'playwright is not installed' }]
  for (const name of ['webkit', 'chromium']) {
    try {
      const browser = await pw[name].launch()
      const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 }, deviceScaleFactor: 1 })
      out.push({ name, browser, ctx })
    } catch (e) {
      out.push({ name, skip: String(e.message || e).split('\n')[0] })
    }
  }
  return out
}

;(async () => {
  head('§2 · THE LIVE WORDS AND THE PNG, MEASURED AGAINST EACH OTHER')

  const blankUri = await whiteBlank()
  const fonts = M.bundle.makeFontBundle(M.fonts.bundledFontFiles(['oswald']))

  /**
   * The tree and the PNG for one layout — the SAME `weeklyTree` call behind both.
   *
   * ⚠️ THE "without" RENDER SWITCHES THE HEADING **OFF**, which is the product's own switch and not a
   * fixture trick: a disabled box draws nothing at all, band included, so the difference between the
   * two PNGs is exactly the glyphs.
   */
  const bothFor = async (dx, given) => {
    const layout = given ?? fixtureLayout(dx)
    const tree = M.draw.weeklyTree({ layout, week, fonts, country: 'GB', note: null })
    const withText = await M.render.renderWeeklyPost({ layout, week, blankDataUri: blankUri, country: 'GB' })
    const without = await M.render.renderWeeklyPost({
      layout: { ...layout, heading: { ...layout.heading, enabled: false } },
      week, blankDataUri: blankUri, country: 'GB',
    })
    return { tree, ink: inkOf(withText.png, without.png) }
  }

  const a = await bothFor(0)
  const b = await bothFor(60)
  const two = await bothFor(0, fixtureTwoLines())

  /* ══ 🔴 THE NODE-SIDE HALF: THE TREE IS A PURE FUNCTION OF THE LAYOUT ═══════════════════════════
   * ⛔ "IN THE SAME FRAME" IS A CLAIM ABOUT **COST**, and this is where it is provable: the tree is
   * built with no `await`, no fetch and no canvas, so a drag can rebuild it between two paints. A tree
   * builder that had to ask the server anything could not be called during a pointer move. */
  t(Array.isArray(a.tree.children) && a.tree.children.length > 0,
    `the tree is built synchronously, with no I/O (${a.tree.children.length} nodes)`)
  t(a.tree.W === W && a.tree.H === H && a.tree.scale === 1,
    `…in the PNG's own pixels (${a.tree.W}×${a.tree.H} at ×${a.tree.scale})`)
  t(JSON.stringify(a.tree.children) !== JSON.stringify(b.tree.children),
    'moving a box changes the tree — the words are not cached anywhere')
  t(!!a.ink && a.ink.right > a.ink.x && a.ink.bottom > a.ink.y,
    `the PNG has ink where the heading is (${a.ink && `${a.ink.x},${a.ink.y}–${a.ink.right},${a.ink.bottom}`})`)
  t(!!b.ink && Math.abs((b.ink.x - a.ink.x) - 60) <= 2,
    `…and moving the box 60px moves the PNG's ink 60px (${b.ink && b.ink.x - a.ink.x})`)

  /* ══ 🔴 "Line spacing" — THE SETTING THAT MEASURED AND NEVER DREW ═══════════════════════════════
   *
   * ⛔ **FOUND WHILE WIRING §2, AND IT IS A REAL BUG OF ITS OWN.** `fit.ts` has always multiplied the
   * line height by the operator's "Line spacing" when deciding whether the text FITS — and the element
   * tree carried no `lineHeight` at all, so satori stacked every line at the font's natural height
   * whatever they chose. A box was made tall enough for 160% and drawn at 100%.
   * 🔴 THE EXPLICIT `lineHeight` IN `lineEl` IS WHAT CLOSED IT, and this is the measurement that says
   * so: at 160% the two lines must stand further apart in the PNG, and with the `lineHeight` stripped
   * out of the tree they must fall back together.
   *
   * ⚠️ **AND THIS IS WHY THE CONTROL IS HERE AND NOT IN THE BROWSER.** A browser control was written
   * first and could not fail: Oswald's `hhea` line gap is ZERO, so a browser's `line-height: normal`
   * already equals `(ascender − descender) / upem` and stripping the rule moved the words by 1–2px.
   * ⛔ THE FIRST READING OF THAT MEASUREMENT WAS WRONG — it reported 17px and blamed the line height,
   * when the live bounding box had silently included "Powered by HatchGrab" 600px down the page. The
   * correction is recorded because the wrong number nearly justified the right change for the wrong
   * reason. 🔴 WHAT THE LINE HEIGHT IS REALLY FOR: this setting, and a font whose line gap is NOT zero,
   * where satori and a browser would otherwise stack lines differently.
   */
  {
    const wide = (sp) => {
      const l = fixtureTwoLines()
      return { ...l, heading: { ...l.heading, lineSpacing: sp } }
    }
    const at100 = await bothFor(0, wide(100))
    const at160 = await bothFor(0, wide(160))
    const span = r => (r ? r.bottom - r.y : 0)
    t(span(at160.ink) - span(at100.ink) > 10,
      `"Line spacing" really draws: 160% stands ${span(at160.ink) - span(at100.ink)}px taller than 100% `
      + `(${span(at100.ink)} → ${span(at160.ink)})`)

    /* ⛔ THE CONTROL: the SAME tree, painted with every `lineHeight` removed — which is the state the
     * renderer was in before §2. ⚠️ IT IS PAINTED HERE RATHER THAN THROUGH `render.ts`, because the
     * thing being removed is in the tree and not in a setting; the frame round it is `paint`'s own, so
     * the two PNGs differ in nothing else. */
    const stripLh = (n) => {
      if (!n || typeof n !== 'object') return
      if (n.props && n.props.style) delete n.props.style.lineHeight
      const ch = n.props && n.props.children
      if (Array.isArray(ch)) ch.forEach(stripLh)
      else if (ch && typeof ch === 'object') stripLh(ch)
    }
    const paintStripped = async (tree) => {
      const children = JSON.parse(JSON.stringify(tree.children))
      children.forEach(stripLh)
      const root = {
        type: 'div',
        props: {
          style: {
            display: 'flex', position: 'relative', width: `${W}px`, height: `${H}px`,
            backgroundImage: `url(${blankUri})`, backgroundSize: `${W}px ${H}px`,
            backgroundRepeat: 'no-repeat', backgroundColor: '#111827',
          },
          children,
        },
      }
      const loaded = fonts.satoriFonts().map(f => ({ ...f, data: M.bundle.asFontBuffer(f.data) }))
      return Buffer.from(await new ImageResponse(root, { width: W, height: H, fonts: loaded }).arrayBuffer())
    }
    const blankPng = await M.render.renderWeeklyPost({
      layout: { ...wide(160), heading: { ...wide(160).heading, enabled: false } },
      week, blankDataUri: blankUri, country: 'GB',
    })
    const noLh = inkOf(await paintStripped(at160.tree), blankPng.png)
    t(Math.abs(span(noLh) - span(at100.ink)) <= 2,
      `CONTROL: with every \`lineHeight\` stripped, 160% draws exactly like 100% `
      + `(${span(noLh)} vs ${span(at100.ink)}) — so the line height is what makes the setting real`)
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-live-poster-'))
  const write = (name, html) => { const f = path.join(tmp, name); fs.writeFileSync(f, html); return 'file://' + f }

  let measured = 0
  for (const eng of await engines()) {
    if (eng.skip) { console.log(`  ⚠️ ${eng.name}: SKIPPED — ${eng.skip}`); continue }
    measured++
    console.log(`  ── ${eng.name} ──────────────────────────────────────────────────────────`)
    const p = await eng.ctx.newPage()

    /* 🔴 EVERY REQUEST IS COUNTED. §2's promise is that the stage costs nothing per frame; a page that
     * fetched a font or a preview would be the old behaviour wearing new code. ⛔ `file://` NAVIGATION
     * IS NOT A REQUEST a route handler sees, so only sub-resources are counted — which is the thing
     * being claimed. */
    const requests = []
    p.on('request', r => { if (!r.url().startsWith('file://')) requests.push(r.url()) })

    for (const [tag, got, shownW] of [['at full size', a, W], ['scaled to the stage', a, 420]]) {
      await p.goto(write(`live-${tag.replace(/\s+/g, '-')}-${eng.name}.html`, page(got.tree.children, shownW)))
      await p.evaluate('window.ready')
      const dom = await p.evaluate('window.inkBox()')
      t(!!dom && dom.count > 0, `${eng.name} ${tag}: the words are drawn in the browser (${dom && dom.count} line box(es))`)
      if (!dom) continue

      /* ══ 🔴 THE CLAIM THIS HARNESS EXISTS FOR ══════════════════════════════════════════════════
       * ⚠️ 6px, AND THE REPORT SAYS WHY. A browser's `line-height: normal` includes the font's line
       * gap and satori's does not, so the vertical edges of a line box differ by about one gap; the
       * horizontal edges are the glyphs' own advances and agree far more closely. ⛔ A TOLERANCE OF 0
       * WOULD BE A CLAIM ABOUT TWO LAYOUT ENGINES BEING THE SAME PROGRAM, which they are not. */
      const near = (x, y) => Math.abs(x - y) <= 6
      t(near(dom.x, got.ink.x) && near(dom.right, got.ink.right),
        `${eng.name} ${tag}: the live words start and end where the PNG's do `
        + `(live ${dom.x}–${dom.right} vs png ${got.ink.x}–${got.ink.right})`)
      /* ══ 🔴 THE VERTICAL CLAIM IS ABOUT THE **LINE BOX ROUND THE INK**, NOT ABOUT THE INK ═════════
       * ⛔ THE FIRST VERSION COMPARED THE TWO TOP EDGES AND FAILED ON CORRECT CODE — live 132–198 vs
       * png 149–185. They are not the same measurement: the browser gives the **line box**, which
       * includes the ascent and descent the font reserves, and the PNG gives the **inked pixels**, which
       * for all-caps words with no descenders fill the middle of it. Demanding equality would have been
       * demanding that Oswald have no ascent.
       * 🔴 WHAT IS TRUE, AND IS THE CLAIM: the PNG's words sit INSIDE the live line box, and the two are
       * centred on the same place. ⚠️ THE CENTRE IS THE HALF THAT WOULD HAVE CAUGHT THE REAL BUG: before
       * the explicit `lineHeight`, the browser's line box was 34px taller than satori's, so a box with
       * `justifyContent: center` put the live words **17px above** the PNG's. */
      t(dom.y <= got.ink.y + 2 && dom.bottom >= got.ink.bottom - 2,
        `${eng.name} ${tag}: …and the PNG's words sit inside the live line `
        + `(line ${dom.y}–${dom.bottom} round ink ${got.ink.y}–${got.ink.bottom})`)
      const mid = r => (r.y + (r.bottom ?? r.y)) / 2
      t(near(mid(dom), mid(got.ink)),
        `${eng.name} ${tag}: …centred on the same height `
        + `(live ${mid(dom).toFixed(1)} vs png ${mid(got.ink).toFixed(1)})`)
    }

    /* ⚠️ THE MOVED BOX, IN THE BROWSER: the words move with it, by the same 60px, with no new request. */
    await p.goto(write(`live-moved-${eng.name}.html`, page(b.tree.children, W)))
    await p.evaluate('window.ready')
    const moved = await p.evaluate('window.inkBox()')
    t(!!moved && Math.abs((moved.x - 60) - a.ink.x) <= 6,
      `${eng.name}: a moved box's words move with it (${moved && moved.x} vs ${a.ink.x} + 60)`)
    t(requests.length === 0,
      `${eng.name}: the live stage makes NO network request (${requests.length})`)

    /* ══ ⛔ THE CONTROL — AND IT RESTORES THE FAILING SHAPE RATHER THAN DELETING A RULE ═════════════
     * 🔴 THE OLD STAGE DREW A **STALE** PNG: the outline had moved and the words had not. That is
     * exactly what mounting the OLD tree against the NEW box is, so the control is the bug itself —
     * and the measurement must refuse it. ⚠️ WITHOUT THIS, the claim above would pass on any page that
     * drew text anywhere near the right place. */
    await p.goto(write(`ctl-stale-${eng.name}.html`, page(a.tree.children, W)))
    await p.evaluate('window.ready')
    const stale = await p.evaluate('window.inkBox()')
    t(!!stale && Math.abs(stale.x - b.ink.x) > 20,
      `${eng.name} CONTROL: last frame's words do NOT match a moved box `
      + `(${stale && stale.x} vs ${b.ink.x}) — so "the words moved" is a measurement`)

    /* ══ 🔴 TWO LINES, LIVE AND IN THE PNG ══════════════════════════════════════════════════════
     * ⚠️ STACKING IS WHERE A LINE-HEIGHT DISAGREEMENT WOULD SHOW, so the two-line case is measured as
     * well as the one-line one. ⛔ THE CONTROL FOR THE EXPLICIT `lineHeight` IS **NOT** HERE — it could
     * not be. See the Line spacing section below, and the note on `lineHeight` in `draw.ts`. */
    await p.goto(write(`live-two-${eng.name}.html`, page(two.tree.children, W)))
    await p.evaluate('window.ready')
    const domTwo = await p.evaluate('window.inkBox()')
    t(!!domTwo && domTwo.count === 2, `${eng.name}: a two-line box draws two lines live (${domTwo && domTwo.count})`)
    t(!!domTwo && domTwo.y <= two.ink.y + 3 && domTwo.bottom >= two.ink.bottom - 3,
      `${eng.name}: …and the PNG's two lines sit inside them `
      + `(live ${domTwo && domTwo.y}–${domTwo && domTwo.bottom} round ink ${two.ink.y}–${two.ink.bottom})`)

    await p.close()
    await eng.browser.close()
  }

  console.log('')
  if (!measured) { console.log('🔴 NO ENGINE WAS AVAILABLE — nothing was measured'); process.exit(1) }
  if (fail) { console.log(`🔴 ${fail} CHECK(S) FAILED`); process.exit(1) }
  console.log(`✅ all ${pass} passed, in ${measured} engine(s)`)
})().catch(e => { console.error(e); process.exit(1) })
