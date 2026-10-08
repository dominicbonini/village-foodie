#!/usr/bin/env node
// scripts/live-text-place.cjs — §2 again: are the LIVE WORDS INSIDE THE BOX THEY BELONG TO?
//
//   node scripts/live-text-place.cjs      (needs a local Chromium and/or WebKit · NO dev server, NO database)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE BUG THIS EXISTS FOR, IN THE OPERATOR'S OWN WORDS
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ *"the box being moved and the words it holds are in different places. The 'Week heading' box is
// selected at the TOP-LEFT of the poster, but its words are drawn at the BOTTOM-RIGHT, cut off at the
// poster's edge. In the same screenshot, all seven rows of 'The 7 days' show NO words at all, only
// empty tinted cells."*
//
// 🔴 **AND EVERY CHECK I HAD WAS GREEN**, which is the fact that decided the shape of this file.
//   • `scripts/live-poster.cjs` compares the TREE's pixels with the PNG's — and the tree was right.
//   • `scripts/design-editor.cjs` reads the source — and the source said all the right things.
//   • `scripts/social-tab-6-local.cjs` mounts the real editor on a mini-DOM — **which has no layout
//     engine at all**, so "where is this box on screen" is not a question it can be asked.
// ⛔ NOT ONE OF THEM COULD SEE A BOX AND ITS WORDS IN DIFFERENT PLACES, because none of them had both
// the real component and a real layout engine in the same process.
//
// ══ 🔴 SO THIS BUNDLES THE **REAL `DesignEditor`** AND MOUNTS IT IN A **REAL BROWSER** ══════════════
// esbuild (already a dependency, used by nothing else here) bundles the component — with React,
// `draw.ts`, `days.ts`, `fit.ts`, `live-fonts.ts` and `LivePoster` — into one browser script. A tiny
// local HTTP server serves the page, the app's own compiled stylesheet, and `/api/weekly-post?font=…`
// answered with **the committed Oswald file**, so the editor's own font path runs for real.
//
// Then it asks the only question that matters: **for every word drawn live, is it inside the box it
// belongs to?** Measured as rectangles, at Fit and zoomed in, in each engine.
//
// ⚠️ THE SERVER SERVES THE FONT AND NOTHING ELSE. No route handler, no database, no truck. The font
// request is the one thing the editor cannot do without, and answering it with the file that is
// committed in `assets/` is the same bytes the real GET returns (proved in `social-tab-7-report.md`).

const fs = require('fs')
const path = require('path')
const os = require('os')
const http = require('http')

const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

let fail = 0, pass = 0
const t = (ok, label) => {
  if (ok) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  🔴 ' + label) }
}
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 86 - s.length)))

/* ⚠️ THE APP'S OWN COMPILED STYLESHEET, with the same staleness check the sibling render harnesses
 * use: Tailwind only emits classes it finds, so a build from before this editor existed would lay the
 * whole page out as one column and every measurement would be about a screen nobody is served. */
function appCss() {
  const root = path.join(REPO, '.next/static')
  if (!fs.existsSync(root)) throw new Error('no .next/static — run `npx next build` first')
  const files = []
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name)
    if (e.isDirectory()) walk(f); else if (e.name.endsWith('.css')) files.push(f)
  } }
  walk(root)
  const css = files.map(f => fs.readFileSync(f, 'utf8')).join('\n')
  if (!/min-width:\s*900px/.test(css)) {
    throw new Error('the compiled CSS predates these screens — run `npx next build`')
  }
  /* ══ 🔴 AND THE RULE THAT MUST **NOT** BE HERE ═══════════════════════════════════════════════════
   * ⛔ **THIS IS WHERE THE BUG WAS FOUND, AND THE CHECK IS NOW ITS OPPOSITE.** The first version of
   * this harness asserted that `.origin-top-left` was in the compiled CSS, because `LivePoster` used
   * that class to scale the poster about its corner. It threw on the first run: **no compiled chunk
   * under `.next/static` contains the rule at all.** Tailwind emits only the utilities it finds in the
   * source at build time, and that class is used by exactly one file in this repository — created the
   * same day, after the build. The dev server rescanned and emitted it; the build never did.
   * 🔴 WITH NO RULE, `transform-origin` FALLS BACK TO THE ELEMENT'S CENTRE, and scaling a 1080×1350
   * layer about its centre is what put the heading's words at (540, 464) in a 460×575 stage and row 7's
   * at (361, 916) — off the right edge and 341px below the bottom one. Both reported symptoms.
   * ⚠️ SO THE PROPERTY IS INLINE NOW, and the claim is that no class is relied on: a geometric property
   * that can be absent from a stylesheet must not live in a stylesheet. The real check is in the
   * browser, below — `transform-origin` is read off the live layer's computed style. */
  /* ⚠️ THE **className**, NOT THE WORDS — and the first version of this guard did not say so and threw
   * on correct code, because `LivePoster`'s own note explains at length why the class is not used. It
   * is the second time in this round that a claim about code matched a comment about code; the lesson
   * is the same both times: read the construct, not the string. */
  const lp = read('components/manage/LivePoster.tsx')
  if (/className="[^"]*origin-top-left/.test(lp) || !/transformOrigin: 'top left'/.test(lp)) {
    throw new Error('LivePoster must set `transformOrigin` inline, not through a Tailwind class — see the note here')
  }
  return css
}

const ENTRY = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { DesignEditor } from '@/components/manage/DesignEditor'
import { defaultLayout } from '@/lib/weekly-post/layout'
import { weekRange } from '@/lib/weekly-post/week'
import { buildWeekData } from '@/lib/weekly-post/week-data'

const q = new URLSearchParams(location.search)
const W = 1080, H = 1350
/* ⛔ THE CONTROL. The blank is declared at twice the size the LAYOUT is in, which is the one way to
 * make the editor's box scale and the live tree's scale disagree from outside the component. */
const bgMul = q.get('breakScale') === '1' ? 2 : 1

const layout = defaultLayout(W, H)
const range = weekRange('this', '2026-09-30T12:00:00Z')
const EVENTS = [
  { id: 'e1', event_date: range.days[0], start_time: '17:00', end_time: '20:00', venue_name: 'Lavenham Village Hall', town: 'Lavenham', status: 'confirmed' },
  { id: 'e2', event_date: range.days[1], start_time: '17:30', end_time: '20:30', venue_name: 'Great Waldingfield Recreation Ground', town: 'Great Waldingfield', status: 'confirmed' },
  { id: 'e3', event_date: range.days[2], start_time: '12:00', end_time: '14:00', venue_name: 'Market Square', town: 'Sudbury', status: 'cancelled' },
  { id: 'e4', event_date: range.days[3], start_time: '11:00', end_time: '14:30', venue_name: 'Food Festival', town: 'Bury St Edmunds', status: 'confirmed' },
  { id: 'e5', event_date: range.days[4], start_time: '17:00', end_time: '21:00', venue_name: 'The Bull Inn', town: 'Cavendish', status: 'confirmed' },
  { id: 'e6', event_date: range.days[5], start_time: '12:00', end_time: '16:00', venue_name: 'Church Green', town: 'Long Melford', status: 'confirmed' },
  { id: 'e7', event_date: range.days[6], start_time: '10:00', end_time: '13:00', venue_name: 'The Kings Arms', town: 'Lavenham', status: 'confirmed' },
]
const week = buildWeekData(range, EVENTS, [], { timeStyle: '12h', showCancelled: true })

/* ⚠️ A 1×1 WHITE PNG. The blank's own pixels decide nothing here — the stage takes its shape from
 * \`background.width\`/\`height\`, which are passed explicitly — and an inline one fetches nothing. */
const BLANK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='

createRoot(document.getElementById('root')).render(React.createElement(DesignEditor, {
  token: 'tok',
  designName: 'Weekly post design',
  backLabel: '\\u2039 Designs',
  onBack: () => {},
  initialLayout: layout,
  country: 'GB',
  background: { url: BLANK, width: W * bgMul, height: H * bgMul },
  onReplacePicture: () => {},
  pictureNote: 'note',
  previewOptions: [{ id: 'this', label: 'This week' }],
  previewWith: 'this',
  onPreviewWith: () => {},
  /* ⚠️ \`null\` MEANS "nothing to preview with yet" — a state the editor already handles — so no PNG is
   * ever fetched and the stage shows the blank. The live words are therefore the ONLY words on it,
   * which is what makes "are they in the box?" answerable at all. */
  renderPreview: async () => null,
  liveData: { kind: 'week', days: week.days, start: range.start, end: range.end, note: null },
  onSave: () => {},
  onCancel: () => {},
}))
`

/** Bundle the real component for a browser. ⚠️ `nodePaths`, or `react` does not resolve from /tmp. */
async function bundle(dir) {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const entry = path.join(dir, 'entry.tsx')
  fs.writeFileSync(entry, ENTRY)
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    outfile: path.join(dir, 'bundle.js'),
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    target: 'es2020',
    logLevel: 'warning',
    define: { 'process.env.NODE_ENV': '"production"' },
    alias: { '@': REPO },
    nodePaths: [path.join(REPO, 'node_modules')],
  })
  return fs.readFileSync(path.join(dir, 'bundle.js'), 'utf8')
}

const PAGE = (css) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${css}</style><style>html,body{margin:0;padding:0}</style></head>
<body><div id="root"></div><script src="/bundle.js"></script></body></html>`

/**
 * ══ 🔴 THE MEASUREMENT ════════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ IT MATCHES WORDS TO BOXES BY **GEOMETRY**, not by a shared id, and that is deliberate: the live
 * tree carries no box keys — it is the renderer's tree, and the renderer has no idea the editor
 * exists. The question "is this word inside a box?" is a question about rectangles.
 * ⛔ THE ALLOWED RECTANGLES ARE THE BOX OUTLINES **AND THE DAY CELLS**. "The 7 days" is one box with
 * twenty-eight cells, and a day's words belong in its cell — asserting against the block alone would
 * pass a poster whose rows were all drawn in the top row.
 */
const MEASURE = `(() => {
  const r = el => { const b = el.getBoundingClientRect()
    return { x: Math.round(b.left), y: Math.round(b.top), right: Math.round(b.right), bottom: Math.round(b.bottom),
             w: Math.round(b.width), h: Math.round(b.height) } }
  const boxes = [...document.querySelectorAll('[data-box-outline]')].map(el => ({
    label: (el.querySelector('[data-box-label]') || {}).textContent || '', ...r(el),
  }))
  const cells = [...document.querySelectorAll('[data-day-cell]')].map(el => ({
    part: el.dataset.dayCell, row: Number(el.dataset.dayRow), ...r(el),
  }))
  const root = document.querySelector('[data-live-poster]')
  const words = []
  const walk = n => { for (const k of n.childNodes) {
    if (k.nodeType === 3 && String(k.textContent).trim()) {
      const rg = document.createRange(); rg.selectNodeContents(k)
      for (const b of rg.getClientRects()) {
        if (b.width > 0.5 && b.height > 0.5) {
          words.push({ text: String(k.textContent).trim().slice(0, 40),
            x: Math.round(b.left), y: Math.round(b.top), right: Math.round(b.right), bottom: Math.round(b.bottom) })
        }
      }
    } else if (k.nodeType === 1) walk(k)
  } }
  if (root) walk(root)
  const stageEl = document.querySelector('[data-stage]')
  return {
    live: !!root,
    liveRoot: root ? r(root) : null,
    stage: stageEl ? r(stageEl) : null,
    boxes, cells, words,
    zoom: (document.querySelector('[data-zoom-readout]') || {}).textContent || null,
    /* 🔴 THE PROPERTY THE WHOLE BUG WAS, READ OFF THE LIVE LAYER ITSELF — not off a stylesheet, and
     * not off the source. However it got there, this is what the browser is using. */
    origin: root ? getComputedStyle(root).transformOrigin : null,
    note: !!document.querySelector('[data-live-font-note]'),
  }
})()`

/** Is this word's rectangle inside one of these rectangles? ⚠️ 2px of slop for rounding only. */
const inside = (w, rects) => rects.some(b =>
  w.x >= b.x - 2 && w.right <= b.right + 2 && w.y >= b.y - 2 && w.bottom <= b.bottom + 2)
/** Do two rectangles overlap at all? */
const overlaps = (a, b) => a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y

async function engines() {
  let pw = null
  for (const m of ['playwright-core', 'playwright']) {
    try { pw = require(path.join(REPO, 'node_modules', m)); break } catch { /* next */ }
  }
  if (!pw) return [{ name: 'playwright', skip: 'playwright is not installed' }]
  const out = []
  for (const name of ['webkit', 'chromium']) {
    try {
      const browser = await pw[name].launch()
      out.push({ name, browser })
    } catch (e) { out.push({ name, skip: String(e.message || e).split('\n')[0] }) }
  }
  return out
}

;(async () => {
  head('§2 · EVERY LIVE WORD IS INSIDE THE BOX IT BELONGS TO')

  const css = appCss()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-live-text-'))
  const js = await bundle(dir)
  const ttf = fs.readFileSync(path.join(REPO, 'assets/fonts/weekly-post/oswald-400.ttf'))
  console.log(`  ⚠️ the real DesignEditor, bundled for a browser (${Math.round(js.length / 1024)}KB)`)

  /* ══ 🔴 A LOCAL SERVER, BECAUSE THE EDITOR FETCHES ITS FONTS WITH A **RELATIVE** URL ══════════════
   * ⛔ A `file://` PAGE CANNOT DO THAT, and stubbing `fetch` would mean measuring a page where the
   * font path had been replaced by the harness. ⚠️ IT SERVES THREE THINGS: the page, the bundle, and
   * the committed Oswald file under the route's own query shape — with the same two headers the real
   * GET sets, because `live-fonts.ts` reads them to key the face. */
  let fontRequests = 0
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1')
    if (u.pathname === '/bundle.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(js); return
    }
    if (u.pathname === '/api/weekly-post' && u.searchParams.get('font')) {
      fontRequests++
      res.writeHead(200, {
        'Content-Type': 'font/ttf',
        'X-Hg-Font-Family': 'Oswald',
        'X-Hg-Font-Face': '400|normal',
      })
      res.end(ttf); return
    }
    if (u.pathname === '/api/weekly-post') { res.writeHead(400); res.end('{}'); return }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PAGE(css))
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`

  let measured = 0
  for (const eng of await engines()) {
    if (eng.skip) { console.log(`  ⚠️ ${eng.name}: SKIPPED — ${eng.skip}`); continue }
    measured++
    console.log(`  ── ${eng.name} ──────────────────────────────────────────────────────────`)
    const ctx = await eng.browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(String(e.message || e)))

    await page.goto(base)
    /* ⚠️ THE FONT HAS TO LAND BEFORE ANYTHING IS DRAWN LIVE — `useLiveFonts` awaits `FontFace.load()`
     * on purpose, so the stage shows nothing live until it has. The wait is for the live root to
     * appear, which is the component's own signal that it is ready. */
    await page.waitForSelector('[data-live-poster]', { timeout: 15000 }).catch(() => {})
    await page.evaluate('document.fonts.ready')

    t(errors.length === 0, `${eng.name}: the editor mounts with no page error${errors.length ? ` — ${errors[0]}` : ''}`)

    /* ══ 🔴 THE TWO ZOOM LEVELS THE BRIEF NAMES ══════════════════════════════════════════════════
     * ⚠️ "Fit" IS ZERO PRESSES AND THE SECOND IS TWO PRESSES OF **+**, which this editor's own
     * `ZOOM_FACTOR ** step` makes **156%**, not 150 — the readout is printed rather than rounded to
     * the brief's number, because the control cannot produce 150 and pretending it does would be a
     * harness measuring a zoom level the product does not have. */
    for (const [tag, presses] of [['at Fit', 0], ['zoomed in twice', 2]]) {
      /* ⚠️ THE ZOOM BUTTONS CARRY NO `data-` HOOK — they are found by their `aria-label`, which is the
       * thing an operator's screen reader uses and is therefore a name the product owes anyway. ⛔ IT
       * THROWS if the control is not there, rather than quietly measuring one zoom level twice. */
      for (let i = 0; i < presses; i++) {
        const b = await page.$('button[aria-label="Zoom in"]')
        if (!b) throw new Error('the Zoom in button could not be found')
        await b.click()
      }
      await page.waitForTimeout(120)
      const m = await page.evaluate(MEASURE)

      t(m.live, `${eng.name} ${tag}: the stage is drawing live`)
      if (!m.live) continue

      /* 🔴 THE REPORTED SYMPTOM, HALF ONE: the heading's words were at the bottom-right of a box that
       * was at the top-left. ⚠️ MATCHED BY THE BOX'S OWN LABEL, so the claim is about that box. */
      const heading = m.boxes.find(b => /heading/i.test(b.label))
      const headWords = m.words.filter(w => /WEEK COMMENCING|Week commencing/i.test(w.text))
      t(!!heading && headWords.length > 0,
        `${eng.name} ${tag}: the heading box and its words are both on screen `
        + `(${headWords.length} word rect(s))`)
      if (heading && headWords.length) {
        t(headWords.every(w => overlaps(w, heading)),
          `${eng.name} ${tag}: …and the words OVERLAP the box `
          + `(box ${heading.x},${heading.y}–${heading.right},${heading.bottom} · words `
          + `${headWords[0].x},${headWords[0].y}–${headWords[0].right},${headWords[0].bottom})`)
        t(headWords.every(w => inside(w, [heading])),
          `${eng.name} ${tag}: …and are INSIDE it, not merely touching`)
      }

      /* 🔴 THE REPORTED SYMPTOM, HALF TWO: all seven rows showed no words at all. */
      t(m.cells.length >= 21, `${eng.name} ${tag}: the seven rows have their cells (${m.cells.length})`)
      const inCells = m.words.filter(w => inside(w, m.cells))
      const rowsWithWords = new Set(
        m.words.flatMap(w => m.cells.filter(c => inside(w, [c])).map(c => c.row)))
      t(rowsWithWords.size === 7,
        `${eng.name} ${tag}: every one of the seven rows has words in its cells `
        + `(${rowsWithWords.size} row(s), ${inCells.length} word rect(s))`)
      /* ⚠️ AND THE THREE PARTS, not just "some words somewhere in the row": a date, a place and a time. */
      const parts = new Set(
        m.words.flatMap(w => m.cells.filter(c => inside(w, [c])).map(c => c.part)))
      t(['dayDate', 'place', 'times'].every(p => parts.has(p)),
        `${eng.name} ${tag}: …the day, the place and the time each land in their own cell `
        + `(${[...parts].join(', ')})`)

      /* ══ 🔴 AND THE WHOLE CLAIM, OVER EVERY WORD ON THE POSTER ══════════════════════════════════
       * ⛔ THIS IS THE ONE THAT WOULD HAVE CAUGHT IT. Not "the heading is right" and not "the rows have
       * something in them" — **every single word drawn live is inside a rectangle the editor drew**.
       * ⚠️ "Powered by HatchGrab" IS THE ONE EXEMPTION, and it is named: the renderer draws it at the
       * foot of the poster and the editor has no box for it, by design. */
      const strays = m.words.filter(w => !/Powered by HatchGrab/.test(w.text))
        .filter(w => !inside(w, [...m.boxes, ...m.cells]))
      t(strays.length === 0,
        `${eng.name} ${tag}: EVERY live word is inside a box or a day cell `
        + (strays.length ? `— ${strays.length} stray: "${strays[0].text}" at ${strays[0].x},${strays[0].y}` : `(${m.words.length} word rect(s))`))

      /* ⚠️ AND NOTHING IS DRAWN OUTSIDE THE POSTER, which is the "cut off at the poster's edge" half. */
      t(m.words.every(w => overlaps(w, m.stage)),
        `${eng.name} ${tag}: …and no word is drawn outside the poster`)

      if (tag === 'at Fit') {
        /* 🔴 THE ONE CONVERSION, AS A NUMBER. The live root must be exactly the stage, so there is no
         * second scale to drift: same left, same top, same width. */
        t(Math.abs(m.liveRoot.x - m.stage.x) <= 1 && Math.abs(m.liveRoot.y - m.stage.y) <= 1,
          `${eng.name}: the live layer starts exactly where the poster does `
          + `(${m.liveRoot.x},${m.liveRoot.y} vs ${m.stage.x},${m.stage.y})`)
        t(Math.abs(m.liveRoot.w - m.stage.w) <= 1,
          `${eng.name}: …and is exactly as wide (${m.liveRoot.w} vs ${m.stage.w})`)
        t(fontRequests > 0, `${eng.name}: the editor fetched its font files (${fontRequests} so far)`)
        /* ⛔ THE CAUSE, ASSERTED WHERE IT CANNOT BE FAKED. `0px 0px` is the corner; anything else — and
         * the default is the centre — moves every word on the poster. */
        t(/^0px 0px/.test(String(m.origin)),
          `${eng.name}: the live layer scales about its top-left CORNER (${m.origin})`)
      }
    }

    /* ══ ⛔ THE CONTROL — THE SCALE, BROKEN FROM OUTSIDE THE COMPONENT ═══════════════════════════════
     * 🔴 THE BLANK IS DECLARED AT TWICE THE SIZE THE LAYOUT IS IN. The editor converts box coordinates
     * with `stageW / background.width`, so every outline halves — while the live tree is still in the
     * layout's own pixels. **That is the reported bug, reproduced on purpose**, and the claim above
     * must refuse it. ⚠️ NO PRODUCT CODE IS PATCHED to produce it, which is what makes it a control
     * over the real conversion rather than over a line this harness wrote. */
    await page.goto(`${base}/?breakScale=1`)
    await page.waitForSelector('[data-live-poster]', { timeout: 15000 }).catch(() => {})
    await page.evaluate('document.fonts.ready')
    await page.waitForTimeout(120)
    const bad = await page.evaluate(MEASURE)
    const badStrays = bad.live
      ? bad.words.filter(w => !/Powered by HatchGrab/.test(w.text))
        .filter(w => !inside(w, [...bad.boxes, ...bad.cells]))
      : []
    t(bad.live && badStrays.length > 0,
      `${eng.name} CONTROL: with the blank declared at twice the layout's size, `
      + `${badStrays.length} live word(s) fall outside every box — so "inside its box" is a measurement`)

    /* ══ 🔴 EVERY WIDTH FROM 1000 TO 1728, AT EVERY ZOOM LEVEL ═══════════════════════════════════════
     *
     * ⛔ THE BRIEF ASKS FOR BOTH AXES, AND THEY ARE NOT THE SAME TEST. The WIDTH changes `fitW` — the
     * poster is fitted to a grey area whose size the layout engine decides — and the ZOOM multiplies it.
     * A conversion that was right at one width and one zoom could still be wrong at another, which is
     * exactly the class of bug this round was given.
     * ⚠️ THE CORE CLAIM IS ASSERTED AT ALL FIFTEEN COMBINATIONS and the detailed ones at 1440 above,
     * because fifteen copies of eight claims is a wall of output nobody reads.
     * ⚠️ THE ZOOM READOUT IS PRINTED RATHER THAN ASSUMED: this editor's `1.25 ** step` gives 100, 125
     * and 156 — not the brief's "150", which the control cannot produce. */
    /* ⛔ **BACK TO THE HONEST PAGE FIRST.** The control above left the browser on `?breakScale=1`, and
     * the first run of this loop measured THAT — thirty failures on correct code, every one of them
     * the control doing its job one block too late. A loop that inherits another block's navigation is
     * a loop that measures whatever ran before it. */
    await page.goto(base)
    await page.waitForSelector('[data-live-poster]', { timeout: 15000 }).catch(() => {})
    await page.evaluate('document.fonts.ready')

    for (const w of [1000, 1100, 1280, 1440, 1728]) {
      await page.setViewportSize({ width: w, height: 900 })
      /* ⚠️ BACK TO FIT FIRST, so each width starts from the same place rather than inheriting the last
       * width's zoom. ⛔ THE BUTTON IS DISABLED AT FIT, which is why the press is conditional. */
      const fitBtn = await page.$('[data-zoom-fit]:not([disabled])')
      if (fitBtn) await fitBtn.click()
      await page.waitForTimeout(90)
      for (let step = 0; step <= 2; step++) {
        if (step > 0) {
          const zi = await page.$('button[aria-label="Zoom in"]')
          if (!zi) throw new Error('the Zoom in button could not be found')
          await zi.click()
          await page.waitForTimeout(90)
        }
        const m = await page.evaluate(MEASURE)
        const tag = `${w} @ ${m.zoom ? m.zoom.trim() : '?'}`
        if (!m.live) { t(false, `${eng.name} ${tag}: the stage is drawing live`); continue }
        const strays = m.words.filter(x => !/Powered by HatchGrab/.test(x.text))
          .filter(x => !inside(x, [...m.boxes, ...m.cells]))
        const rows = new Set(m.words.flatMap(x => m.cells.filter(c => inside(x, [c])).map(c => c.row)))
        t(strays.length === 0 && rows.size === 7,
          `${eng.name} ${tag}: every live word is in its box, and all seven rows have words`
          + (strays.length ? ` — ${strays.length} stray, first "${strays[0].text}"` : ` (${rows.size} rows)`))
      }
    }

    await page.close()
    await ctx.close()
    await eng.browser.close()
  }

  server.close()
  console.log('')
  if (!measured) { console.log('🔴 NO ENGINE WAS AVAILABLE — nothing was measured'); process.exit(1) }
  if (fail) { console.log(`🔴 ${fail} CHECK(S) FAILED`); process.exit(1) }
  console.log(`✅ all ${pass} passed, in ${measured} engine(s)`)
})().catch(e => { console.error(e); process.exit(1) })
