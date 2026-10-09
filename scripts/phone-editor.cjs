#!/usr/bin/env node
// scripts/phone-editor.cjs — the design editor ON A PHONE, and the desktop PROVED unchanged.
//
//   node scripts/phone-editor.cjs                 measure (needs a local WebKit and/or Chromium)
//   node scripts/phone-editor.cjs --baseline      write the desktop fingerprint and stop
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY THIS IS A SECOND BUNDLED-EDITOR HARNESS AND NOT MORE CLAIMS IN THE FIRST
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// `scripts/live-text-place.cjs` asks one question — *are the live words inside the box they belong
// to?* — and it mounts the real `DesignEditor` in a real browser to ask it. This file borrows that
// machinery (esbuild, the local server, the font GET) and asks a different set:
//
//    DOES THE PHONE EDITOR EXIST AND WORK — the top bar, the pinned poster, the item bar, the sheet,
//      its tabs, its drag, and selecting by tapping the poster;
//    AND IS THE DESKTOP **BYTE-FOR-BYTE WHAT IT WAS** — which is the rule the brief states twice and
//      the one thing a new layout branch is most likely to break.
//
// ⛔ **THE DESKTOP HALF IS A BEFORE-AND-AFTER, NOT A SET OF ASSERTIONS.** A claim like "the panel is
// 380px" would pass on a desktop I had quietly changed in some other way. So `--baseline` records a
// FINGERPRINT of the desktop editor at 768, 1100 and 1728 — every element the editor marks with a
// `data-` attribute, its rectangle, and the shape of the layout around it — into
// `docs/phone-editor-baseline.json`, and the normal run compares against it. The baseline in the
// repository was taken **before the first line of the phone editor was written**.
// ⚠️ IT IS COMMITTED ON PURPOSE. A baseline regenerated after a change proves nothing; one that is in
// the tree can be read, dated and argued with.

const fs = require('fs')
const path = require('path')
const os = require('os')
const http = require('http')

const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const BASELINE = 'docs/phone-editor-baseline.json'
const WRITE_BASELINE = process.argv.includes('--baseline')
/* ⚠️ `--shots` IS FOR EYES, NOT FOR CLAIMS. Every claim in this file is a measurement; the pictures
 * exist so a person can see the screen the measurements describe, which is the one thing a number
 * cannot show. ⛔ IT IS A SEPARATE MODE so a normal run stays fast and writes nothing. */
const SHOTS = process.argv.includes('--shots')
const SHOT_DIR = 'docs/screenshots/phone-editor'

let fail = 0, pass = 0
const t = (ok, label) => {
  if (ok) { pass++; console.log('  ✓ ' + label) }
  else { fail++; console.log('  🔴 ' + label) }
}
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 86 - s.length)))

/** The app's own compiled stylesheet, with the staleness checks the sibling harnesses learned to make. */
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
  /* ⛔ AND THE ARBITRARY CLASSES THIS FILE'S CLAIMS REST ON. Tailwind emits only what it finds at
   * BUILD time, so a class written today is absent from yesterday's build — and an absent class does
   * not fail, it lays out differently. That trap has now cost this workstream two debugging sessions
   * (`origin-top-left`, then `h-[72px]`), which is why the check is specific and matched LITERALLY:
   * the compiled selector escapes its own brackets. */
  /* ⛔ **THE EDITOR'S OWN `md:` CLASSES, BY NAME.** The phone layout is built entirely out of `md:`
   * variants that restore the desktop, so a build taken before them is a build in which the DESKTOP is
   * wrong — and the first run after the top bar was written reported three real-looking regressions
   * (everything shifted 12px, `previewPost` moved) that were nothing but this. 🔴 THIRD TIME IN THIS
   * WORKSTREAM, which is why the list is specific rather than a single sentinel. */
  const NEEDED = ['.md\\:hidden', '.min-w-0', '.md\\:p-0', '.md\\:inline-flex', '.md\\:static',
    '.md\\:bg-transparent', '.md\\:space-y-3', '.md\\:flex',
    /* the phone chrome's own */
    '.flex-nowrap', '.overflow-x-auto', '.rounded-t-2xl', '.touch-none',
    /* and the two the stage area's size is made of */
    '.md\\:h-\\[min\\(72vh\\,820px\\)\\]', '.md\\:grow-0',
    /* 🔴 AND THE DESKTOP'S TWO-COLUMN RULE ITSELF */
    '.min-\\[1100px\\]\\:grid-cols-\\[minmax\\(0\\,1fr\\)_380px\\]']
  const missing = NEEDED.filter(k => !css.includes(k))
  if (missing.length) {
    throw new Error('the compiled CSS is older than the components — no ' + missing.join(', ')
      + '. Tailwind only emits classes it finds at build time; run `npx next build`')
  }
  return css
}

/**
 * ══ 🔴 THE MOUNT — THE REAL `DesignEditor`, WITH REAL WEEK DATA ═══════════════════════════════════
 *
 * ⚠️ `?kind=event` MOUNTS THE SINGLE EVENT DESIGN, because the two have different item bars (the
 * brief lists them separately) and a harness that only ever saw the weekly one would not notice a bar
 * that named the wrong items.
 * ⚠️ `?save=1` MAKES `onSave` RECORD rather than ignore, so "Save works" is a fact about the layout
 * the editor handed out and not about a button changing colour.
 * ⛔ `?breakSheet=1` IS THE CONTROL — see the control at the foot of this file.
 */
const ENTRY = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { DesignEditor } from '@/components/manage/DesignEditor'
import { defaultLayout, defaultEventLayout } from '@/lib/weekly-post/layout'
import { weekRange } from '@/lib/weekly-post/week'
import { buildWeekData, entryFor } from '@/lib/weekly-post/week-data'

const q = new URLSearchParams(location.search)
const KIND = q.get('kind') === 'event' ? 'event' : 'week'
const W = 1080, H = 1350

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

/* ⚠️ A 1×1 WHITE PNG. The blank's own pixels decide nothing — the stage takes its shape from
 * \`background.width\`/\`height\`, which are passed explicitly — and an inline one fetches nothing. */
const BLANK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='

/* 🔴 WHAT SAVE AND THE LEAVE GUARD DID, READ BACK OUT OF THE PAGE. A button that looks pressed is not
 * a save; the editor hands its layout to \`onSave\`, and that is the thing worth recording. */
window.__hg = { saved: null, backs: 0, dirty: null }

const common = {
  token: 'tok',
  backLabel: '\\u2039 Designs',
  /* ══ 🔴 THE HOST'S LEAVE GUARD, BECAUSE THE GUARD IS THE HOST'S ════════════════════════════════
   * ⛔ THE EDITOR DOES NOT OWN THE DIALOG and must not: \`SocialPosts\` holds it
   * (\`if (editorDirty) { setLeaveTo('back'); return }\`) and hands the editor an \`onBack\` that is
   * already guarded. So "the phone ‹ has the same guard" is a claim about WIRING — that the phone
   * button calls that same callback — and the only way to measure it is for this host to keep the
   * real host's side of the contract. ⚠️ THE DIRTY FLAG COMES FROM \`onDirtyChange\`, exactly as the
   * real one's does. 🔴 \`backs\` IS LEFT ALONE WHEN IT ASKS, which is what makes "asked AND did not
   * leave" two separate facts rather than one. */
  onBack: () => {
    if (window.__hg.dirty) {
      const d = document.createElement('div')
      d.setAttribute('data-leave-dialog', 'true')
      d.textContent = 'You have unsaved changes'
      document.body.appendChild(d)
      return
    }
    window.__hg.backs++
  },
  country: 'GB',
  background: { url: BLANK, width: W, height: H },
  onReplacePicture: () => {},
  pictureNote: 'note',
  previewOptions: [{ id: 'this', label: 'This week' }],
  previewWith: 'this',
  onPreviewWith: () => {},
  renderPreview: async () => null,
  onSave: (l) => { window.__hg.saved = l },
  onCancel: () => {},
  onDirtyChange: (d) => { window.__hg.dirty = d },
}

const props = KIND === 'event'
  ? {
    ...common,
    designName: 'Single event post design',
    initialLayout: defaultEventLayout(W, H),
    /* ⚠️ ONE ENTRY, BUILT BY THE RENDERER'S OWN \`entryFor\` — the same function the route uses, so the
     * live words on the single event poster are the words the PNG would carry. */
    liveData: {
      kind: 'event',
      entry: entryFor(EVENTS[0], [], '12h'),
      date: range.days[0],
      note: null,
    },
  }
  : {
    ...common,
    designName: 'Weekly post design',
    initialLayout: defaultLayout(W, H),
    liveData: { kind: 'week', days: week.days, start: range.start, end: range.end, note: null },
  }

createRoot(document.getElementById('root')).render(React.createElement(DesignEditor, props))
`

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
 * ══ 🔴 THE DESKTOP FINGERPRINT ════════════════════════════════════════════════════════════════════
 *
 * ⛔ **EVERY `data-` MARKED ELEMENT, ITS RECTANGLE, AND WHETHER IT IS SHOWN.** Not a list of expected
 * numbers — a photograph. A rule like "the panel is 380px wide" would pass on a desktop I had changed
 * in some other way; a fingerprint fails on *any* difference and names it.
 * ⚠️ ROUNDED TO WHOLE PIXELS, because sub-pixel layout differs between runs on the same engine and a
 * baseline that failed on 0.0001px would be a baseline nobody could keep.
 * ⚠️ `display` IS INCLUDED, because the whole phone/desktop split is CSS deciding which branch is
 * shown — a fingerprint of rectangles alone would read a `display:none` element as all zeros and
 * compare it equal to another all-zeros element.
 */
const FINGERPRINT = `(() => {
  const out = {}
  for (const el of document.querySelectorAll('*')) {
    const keys = Object.keys(el.dataset || {})
    if (!keys.length) continue
    const b = el.getBoundingClientRect()
    /* ⚠️ THE KEY IS THE ATTRIBUTE **AND ITS VALUE**, so \`data-item="date"\` and \`data-item="time"\`
     * are two entries rather than one that overwrites the other. An index keeps repeats apart. */
    for (const k of keys) {
      let key = el.dataset[k] ? k + '=' + el.dataset[k] : k
      let n = 0
      while (out[n ? key + '#' + n : key] !== undefined) n++
      if (n) key = key + '#' + n
      out[key] = [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height),
        getComputedStyle(el).display]
    }
  }
  return out
})()`

const MEASURE = `(() => {
  const r = el => { if (!el) return null; const b = el.getBoundingClientRect()
    return { x: Math.round(b.left), y: Math.round(b.top), right: Math.round(b.right),
             bottom: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height),
             /* ⛔ COUNT THE LAYOUT BOXES, DO NOT ONLY ASK FOR THE display: getComputedStyle on a
              * child of a display:none PARENT still reports the child's own display, so a bar inside a
              * hidden wrapper read as "shown" and the desktop section failed on six true claims.
              * Having layout boxes is the only honest answer to "is this on the screen". */
             rects: el.getClientRects().length,
             shown: getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0 } }
  const one = sel => r(document.querySelector(sel))
  const all = sel => [...document.querySelectorAll(sel)]
  return {
    innerW: window.innerWidth, innerH: window.innerHeight,
    docScrollW: document.documentElement.scrollWidth,
    docScrollH: document.documentElement.scrollHeight,
    /* the phone chrome */
    phoneTop: one('[data-phone-topbar]'),
    phoneStage: one('[data-phone-stage]'),
    phoneBar: one('[data-phone-itembar]'),
    phoneHint: one('[data-phone-hint]'),
    sheet: one('[data-phone-sheet]'),
    sheetBody: one('[data-phone-sheet-body]'),
    handle: one('[data-phone-handle]'),
    items: all('[data-phone-item-btn]').map(el => ({
      key: el.dataset.phoneItemBtn,
      label: (el.textContent || '').trim(),
      on: el.dataset.phoneOn === 'yes',
      ...r(el),
    })),
    tabs: all('[data-sheet-tab]').map(el => ({
      id: el.dataset.sheetTab, label: (el.textContent || '').trim(),
      on: el.dataset.phoneOn === 'yes', ...r(el),
    })),
    /* ⚠️ THE SHEET'S CONTENT, COUNTED AS **CONTROLS** — a tab that rendered an empty div would have a
     * height and no use. Inputs, selects, buttons and the editor's own field wrappers all count. */
    sheetControls: document.querySelectorAll('[data-phone-sheet-body] input, [data-phone-sheet-body] select, [data-phone-sheet-body] button, [data-phone-sheet-body] [data-field]').length,
    /* ⚠️ WHAT SITS BETWEEN THE POSTER AND THE BAR, named and measured — so a gap that should not be
     * there says what is in it rather than only how big it is. */
    underStage: (() => {
      const area = document.querySelector('[data-phone-stage]')
      const bar = document.querySelector('[data-phone-itembar]')
      if (!area || !bar) return []
      const out = []
      for (let el = area.nextElementSibling; el && el !== bar; el = el.nextElementSibling) {
        const b = el.getBoundingClientRect()
        out.push(el.tagName.toLowerCase() + '[' + (Object.keys(el.dataset).join(',') || String(el.className).slice(0, 24)) + ']=' + Math.round(b.height))
      }
      return out
    })(),
    /* the poster and the desktop panel */
    stage: one('[data-stage]'),
    stageArea: one('[data-stage-area]'),
    panel: one('[data-settings-panel]'),
    live: one('[data-live-poster]'),
    boxes: all('[data-box-outline]').map(el => ({ sel: el.dataset.boxOutline, ...r(el) })),
    cells: all('[data-day-cell]').map(el => ({ part: el.dataset.dayCell, row: Number(el.dataset.dayRow), ...r(el) })),
    title: (document.querySelector('[data-settings-title]') || {}).textContent || null,
    sheetTitle: ((document.querySelector('[data-phone-sheet-title]') || {}).textContent || '').trim() || null,
    selectedBox: (document.querySelector('[data-box-outline="selected"]') || {}).dataset ? 'yes' : 'no',
    words: (() => {
      const root = document.querySelector('[data-live-poster]')
      const out = []
      const walk = n => { for (const k of n.childNodes) {
        if (k.nodeType === 3 && String(k.textContent).trim()) {
          const rg = document.createRange(); rg.selectNodeContents(k)
          for (const b of rg.getClientRects()) {
            if (b.width > 0.5 && b.height > 0.5) {
              out.push({ text: String(k.textContent).trim().slice(0, 30),
                x: Math.round(b.left), y: Math.round(b.top),
                right: Math.round(b.right), bottom: Math.round(b.bottom) })
            }
          }
        } else if (k.nodeType === 1) walk(k)
      } }
      if (root) walk(root)
      return out
    })(),
    saved: !!(window.__hg && window.__hg.saved),
    backs: window.__hg ? window.__hg.backs : -1,
    dirty: window.__hg ? window.__hg.dirty : null,
  }
})()`

async function engines() {
  let pw = null
  for (const m of ['playwright-core', 'playwright']) {
    try { pw = require(path.join(REPO, 'node_modules', m)); break } catch { /* next */ }
  }
  if (!pw) return [{ name: 'playwright', skip: 'playwright is not installed' }]
  const out = []
  for (const name of ['webkit', 'chromium']) {
    try { out.push({ name, browser: await pw[name].launch() }) }
    catch (e) { out.push({ name, skip: String(e.message || e).split('\n')[0] }) }
  }
  return out
}

/** Overlap, which is what "the poster is still visible above the sheet" means as a number. */
const overlapH = (a, b) => Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y))

;(async () => {
  const css = appCss()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-phone-editor-'))
  const js = await bundle(dir)
  const ttf = fs.readFileSync(path.join(REPO, 'assets/fonts/weekly-post/oswald-400.ttf'))
  console.log(`  ⚠️ the real DesignEditor, bundled for a browser (${Math.round(js.length / 1024)}KB)`)

  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1')
    if (u.pathname === '/bundle.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(js); return
    }
    if (u.pathname === '/api/weekly-post' && u.searchParams.get('font')) {
      res.writeHead(200, {
        'Content-Type': 'font/ttf', 'X-Hg-Font-Family': 'Oswald', 'X-Hg-Font-Face': '400|normal',
      })
      res.end(ttf); return
    }
    if (u.pathname === '/api/weekly-post') { res.writeHead(400); res.end('{}'); return }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(PAGE(css))
  })
  await new Promise(r => server.listen(0, '127.0.0.1', r))
  const base = `http://127.0.0.1:${server.address().port}`

  /** Open the editor at one size and wait until it has drawn its words. */
  const open = async (page, w, h, qs = '') => {
    await page.setViewportSize({ width: w, height: h })
    await page.goto(base + (qs ? `/?${qs}` : '/'))
    await page.waitForSelector('[data-stage]', { timeout: 15000 }).catch(() => {})
    await page.evaluate('document.fonts.ready')
    await page.waitForTimeout(150)
  }

  /**
   * ══ ⛔ `hidden` BESIDE ANOTHER DISPLAY UTILITY — A BUG NEITHER THE COMPILER NOR THE BUILD CAN SEE ══
   *
   * 🔴 `hidden md:inline-flex` ON A BUTTON THAT ALREADY CARRIED `TOOL_BTN` DID NOTHING. `TOOL_BTN`
   * contains `inline-flex`; both are base-layer utilities for `display`, and Tailwind compiles
   * `.inline-flex` AFTER `.hidden`, so the later one won and Redo stayed on the phone bar — wrapping it
   * onto a second row and taking 60px off the poster. ⚠️ IT TYPE-CHECKS, IT BUILDS, IT LINTS, AND IT IS
   * WRONG; a screenshot is what found it.
   * ⛔ SO THE **CONSTRUCT** IS READ, NOT THE PROSE: every `className` in the editor, with the shared
   * class constants expanded, and `hidden` is not allowed to share one with another display utility.
   * The fix is always the same — put the two display classes on a wrapper that sets nothing else.
   */
  const DISPLAY = ['flex', 'inline-flex', 'grid', 'inline-grid', 'block', 'inline-block', 'inline',
    'table', 'contents', 'flow-root']
  {
    const bits = read('components/manage/DesignEditorBits.tsx')
    const CONST = {}
    for (const m of bits.matchAll(/export const (\w+) = '([^']*)'/g)) CONST[m[1]] = m[2]
    const src = read('components/manage/DesignEditor.tsx')
    const clashes = []
    for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/gs)) {
      const raw = (m[1] || m[2] || '').replace(/\$\{(\w+)\}/g, (_, k) => CONST[k] || '')
      const toks = new Set(raw.split(/\s+/).filter(Boolean))
      if (!toks.has('hidden')) continue
      const clash = DISPLAY.filter(d => toks.has(d))
      if (clash.length) clashes.push(`line ${src.slice(0, m.index).split('\n').length}: hidden + ${clash.join(', ')}`)
    }
    t(clashes.length === 0,
      `no className puts \`hidden\` beside another display utility${clashes.length ? ` — ${clashes.join(' · ')}` : ''}`)
  }

  const DESKTOP = [[768, 1024], [1100, 800], [1728, 1000]]
  const PHONES = [[390, 844], [430, 932]]

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // THE DESKTOP FINGERPRINT — WRITTEN BY `--baseline`, COMPARED BY EVERY OTHER RUN
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  if (WRITE_BASELINE) {
    head('writing the desktop baseline')
    const shots = {}
    for (const eng of await engines()) {
      if (eng.skip) { console.log(`  ⚠️ ${eng.name}: SKIPPED — ${eng.skip}`); continue }
      const ctx = await eng.browser.newContext({ deviceScaleFactor: 1 })
      const page = await ctx.newPage()
      for (const kind of ['week', 'event']) {
        for (const [w, h] of DESKTOP) {
          await open(page, w, h, `kind=${kind}`)
          shots[`${eng.name}|${kind}|${w}`] = await page.evaluate(FINGERPRINT)
          console.log(`  ✓ ${eng.name} ${kind} ${w}: ${Object.keys(shots[`${eng.name}|${kind}|${w}`]).length} marked elements`)
        }
      }
      await page.close(); await ctx.close(); await eng.browser.close()
    }
    fs.writeFileSync(path.join(REPO, BASELINE), JSON.stringify(shots, null, 1))
    server.close()
    console.log(`\n✅ baseline written to ${BASELINE} — commit it, and never regenerate it to make a run pass`)
    return
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════
  // `--shots` — THE SCREENS THE NUMBERS DESCRIBE
  // ══════════════════════════════════════════════════════════════════════════════════════════════
  if (SHOTS) {
    head('writing the screenshots')
    fs.mkdirSync(path.join(REPO, SHOT_DIR), { recursive: true })
    const engs = await engines()
    const eng = engs.find(e => e.name === 'webkit' && !e.skip) || engs.find(e => !e.skip)
    for (const e of engs) if (e !== eng && !e.skip) await e.browser.close()
    if (!eng) throw new Error('no engine')
    const ctx = await eng.browser.newContext({ deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    const shot = async (name) => {
      await page.screenshot({ path: path.join(REPO, SHOT_DIR, name + '.png') })
      console.log('  ⚠️ ' + SHOT_DIR + '/' + name + '.png')
    }
    await open(page, 390, 844)
    await shot('weekly-nothing-selected-390')
    await page.click('[data-phone-item-btn="heading"]'); await page.waitForTimeout(250)
    await shot('weekly-text-sheet-390')
    await page.click('[data-sheet-tab="size"]'); await page.waitForTimeout(200)
    await shot('weekly-text-size-390')
    await page.click('[data-phone-item-btn="days"]'); await page.waitForTimeout(250)
    await shot('weekly-7days-sheet-390')
    await page.click('[data-sheet-tab="row"]'); await page.waitForTimeout(200)
    await shot('weekly-7days-row-390')
    await page.click('[data-phone-item-btn="background"]'); await page.waitForTimeout(250)
    await shot('weekly-picture-sheet-390')
    await page.click('[data-sheet-tab="darken"]'); await page.waitForTimeout(200)
    await shot('weekly-picture-darken-390')
    await open(page, 390, 844, 'kind=event')
    await shot('event-nothing-selected-390')
    await page.click('[data-phone-item-btn="date"]'); await page.waitForTimeout(250)
    await shot('event-date-sheet-390')
    await open(page, 430, 932)
    await page.click('[data-phone-item-btn="all-text"]'); await page.waitForTimeout(250)
    await shot('weekly-all-writing-sheet-430')
    /* ⚠️ AND THE DESKTOP, which is the half of this work that had to not change. */
    await open(page, 1100, 800)
    await shot('desktop-1100')
    await open(page, 1728, 1000)
    await shot('desktop-1728')
    await page.close(); await ctx.close(); await eng.browser.close()
    server.close()
    console.log('')
    return
  }

  const baseline = fs.existsSync(path.join(REPO, BASELINE))
    ? JSON.parse(read(BASELINE)) : null
  if (!baseline) {
    server.close()
    throw new Error(`no ${BASELINE} — run \`node scripts/phone-editor.cjs --baseline\` on an UNCHANGED editor first`)
  }

  let measured = 0
  for (const eng of await engines()) {
    if (eng.skip) { console.log(`  ⚠️ ${eng.name}: SKIPPED — ${eng.skip}`); continue }
    measured++
    const ctx = await eng.browser.newContext({ deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(String(e.message || e)))

    // ════════════════════════════════════════════════════════════════════════════════════════════
    // 1 · THE DESKTOP IS WHAT IT WAS
    // ════════════════════════════════════════════════════════════════════════════════════════════
    head(`${eng.name} · 1 · the desktop editor is unchanged`)
    for (const kind of ['week', 'event']) {
      for (const [w, h] of DESKTOP) {
        await open(page, w, h, `kind=${kind}`)
        const now = await page.evaluate(FINGERPRINT)
        const was = baseline[`${eng.name}|${kind}|${w}`]
        if (!was) { t(false, `${eng.name} ${kind} ${w}: no baseline for this size — regenerate with --baseline on an unchanged editor`); continue }
        /* ⛔ THREE WAYS IT CAN DIFFER AND ALL THREE ARE REPORTED: an element that has gone, one that
         * has appeared, and one that has MOVED. ⚠️ THE PHONE'S OWN MARKERS ARE EXEMPT **BY NAME AND
         * ONE BY ONE**, because they did not exist when the baseline was taken and so would otherwise
         * report as "appeared" at every desktop size for ever.
         * 🔴 ENUMERATED, NOT `startsWith('phone')`: a prefix match would also wave through a marker I
         * added later to a DESKTOP element and never notice, which is the one thing this section is
         * for. ⚠️ FIVE OF THESE SIT ON ELEMENTS THE DESKTOP ALSO DRAWS (the bar, the back/undo/save
         * buttons, the stage area) — those elements are still pinned by the baseline's own markers
         * around and on them: `previewPost=true` inside the bar and `stageArea=true` on the stage
         * area itself. */
        const EXEMPT = new Set(['phoneTopbar=true', 'phoneBack=true', 'phoneUndo=true', 'phoneSave=true',
          'phoneStage=true', 'phoneItembar=true', 'phoneHint=true', 'phoneSheet=true',
          'phoneHandle=true', 'phoneSheetTitle=true', 'phoneSheetClose=true', 'phoneSheetScroll=true',
          'phoneSheetBody=true'])
        const PHONE_ONLY = k => EXEMPT.has(k) || /^(phoneItemBtn|sheetTab|phoneOn)=/.test(k)
        const gone = Object.keys(was).filter(k => !(k in now))
        const appeared = Object.keys(now).filter(k => !(k in was) && !PHONE_ONLY(k))
        const moved = Object.keys(was).filter(k => k in now
          && JSON.stringify(was[k]) !== JSON.stringify(now[k]))
        t(gone.length === 0 && appeared.length === 0 && moved.length === 0,
          `${eng.name} ${kind} ${w}: every one of the ${Object.keys(was).length} marked elements is where it was`
          + (gone.length ? ` — GONE: ${gone.slice(0, 3).join(', ')}` : '')
          + (appeared.length ? ` — APPEARED: ${appeared.slice(0, 3).join(', ')}` : '')
          + (moved.length ? ` — MOVED: ${moved.slice(0, 3).map(k => `${k} ${JSON.stringify(was[k])}→${JSON.stringify(now[k])}`).join(', ')}` : ''))
        /* ⚠️ AND THE PHONE-ONLY CHROME IS NOT MERELY OFF-SCREEN — it is `display:none`, so it costs
         * the desktop no layout at all. A chrome that was only pushed out of view would still be in
         * the flow and could still take height.
         * ⛔ THE TOP BAR IS NOT IN THIS LIST, and must not be: it is the SAME bar the desktop has
         * always drawn — `data-phone-topbar` marks it so the phone can measure it, it does not make
         * it phone-only. What differs between the two is which of its buttons show, and that is the
         * fingerprint's business (`previewPost`), not this check's. */
        const m = await page.evaluate(MEASURE)
        t(!m.phoneBar?.shown && !m.phoneHint?.shown && !m.sheet?.shown,
          `${eng.name} ${kind} ${w}: …and the item bar, the hint and the sheet are not rendered at all`)
        /* ══ ⛔ THE CASCADE-ORDER TRAP, ASSERTED WHERE IT BITES ════════════════════════════════════
         * 🔴 TAILWIND COMPILES THE `md:` BLOCK **AFTER** THE `min-[1100px]:` ONE, so a `md:` utility
         * and a `min-[1100px]:` utility that set the same property both match at 1100px and the `md:`
         * one wins — the opposite of what reading the class list suggests. Writing the grid's column
         * count as a `md:` utility therefore beat the desktop's two-column rule and dropped the
         * settings panel below the poster at every width ≥1100. The fingerprint caught it as
         * `stageArea` going 704→1100 wide; this says *which* property did it.
         * ⚠️ READ OFF THE ELEMENT, NOT OUT OF THE STYLESHEET: a search of the compiled CSS for the
         * offending class name matches this very comment (Tailwind scans prose too, and emits the
         * class because of it) — the construct is what matters, so the construct is what is measured. */
        const cols = await page.evaluate(`getComputedStyle(document.querySelector('[data-editor-grid]'))
          .gridTemplateColumns.trim().split(/\\s+/).length`)
        t(w >= 1100 ? cols === 2 : cols === 1,
          `${eng.name} ${kind} ${w}: …and the grid has ${w >= 1100 ? 'two columns' : 'one column'} (${cols})`)
      }
    }

    // ════════════════════════════════════════════════════════════════════════════════════════════
    // 2 · THE PHONE CHROME
    // ════════════════════════════════════════════════════════════════════════════════════════════
    for (const [w, h] of PHONES) {
      head(`${eng.name} · 2 · the phone editor at ${w}×${h}`)
      await open(page, w, h)
      t(errors.length === 0, `${eng.name} ${w}: the editor mounts with no page error${errors.length ? ` — ${errors[0]}` : ''}`)
      let m = await page.evaluate(MEASURE)

      /* 🔴 THE TOP BAR, THE POSTER AND THE ITEM BAR, IN THAT ORDER DOWN THE SCREEN. */
      t(!!m.phoneTop?.shown && !!m.phoneStage?.shown && !!m.phoneBar?.shown,
        `${eng.name} ${w}: the top bar, the poster and the item bar are all drawn`)
      if (!m.phoneTop?.shown) continue
      /* ⚠️ `<= 16` AND NOT `<= 1`: the shell is `p-3`, so the bar starts 12px in on every side. The
       * claim is that the bar is the first thing on the screen, not that it is flush to the glass. */
      t(m.phoneTop.y <= 16 && m.phoneStage.y >= m.phoneTop.bottom - 1,
        `${eng.name} ${w}: the top bar is at the top and the poster is under it (y=${m.phoneTop.y}, ${m.phoneStage.y} ≥ ${m.phoneTop.bottom})`)
      /* ⛔ "NEVER SCROLLS AWAY" IS A CLAIM ABOUT THE **PAGE**, and it is the one that would be easiest
       * to get wrong: a poster pinned with `sticky` inside a scrolling page still scrolls when the
       * page does. ⚠️ SO THE PAGE MUST NOT SCROLL AT ALL — the sheet scrolls inside itself. */
      t(m.docScrollH <= m.innerH + 1 && m.docScrollW <= m.innerW + 1,
        `${eng.name} ${w}: the page itself does not scroll, in either direction (${m.docScrollW}×${m.docScrollH} in ${m.innerW}×${m.innerH})`)
      t(m.phoneBar.bottom <= m.innerH + 1 && m.phoneBar.y >= m.phoneStage.bottom - 1,
        `${eng.name} ${w}: the item bar is at the foot, below the poster`)
      /* 🔴 "SIZED TO THE SPACE LEFT" IS A CLAIM ABOUT WHAT HAPPENS WHEN THE SPACE CHANGES, so that is
       * what is measured: the screen is made 160px shorter and the poster's area must give up very
       * nearly all of it. ⛔ A SMALL GAP ABOVE THE BAR WOULD NOT PROVE THIS — a poster at a fixed
       * height that happened to fit this screen would pass it and break on the next one. */
      const tall = m.phoneStage.h
      await page.setViewportSize({ width: w, height: h - 160 })
      await page.waitForTimeout(250)
      const short = await page.evaluate(MEASURE)
      t(tall - short.phoneStage.h >= 140 && tall - short.phoneStage.h <= 170,
        `${eng.name} ${w}: the poster's area is sized to the space left — 160px less screen took ${tall - short.phoneStage.h}px off it (${tall} → ${short.phoneStage.h})`)
      await page.setViewportSize({ width: w, height: h })
      await page.waitForTimeout(250)
      m = await page.evaluate(MEASURE)
      /* ⚠️ AND THE POSTER IS THE MAJORITY OF THE SCREEN, which is the operator's side of the same
       * claim: the chrome between it and the bar is named in the message, so a row that creeps in
       * says what it is. */
      t(m.phoneStage.h >= m.innerH * 0.55,
        `${eng.name} ${w}: …and it is most of the screen (${m.phoneStage.h} of ${m.innerH}; under it: ${m.underStage.join(' ') || 'nothing'})`)

      /* 🔴 NOTHING SELECTED ⇒ THE GREY LINE, AND NO SHEET. */
      t(!!m.phoneHint?.shown && !m.sheet?.shown,
        `${eng.name} ${w}: with nothing selected there is a hint line and no sheet`)

      /* 🔴 THE ITEM BAR'S CONTENTS — the brief lists them per design. */
      /* ⚠️ THE BRIEF'S WEEKLY LIST, EXACTLY: `Aa All writing · Week heading · The 7 days · ＋ Add text
       * · 🖼 Picture`. ⛔ AND NOTHING ELSE — an extra button is as wrong as a missing one, so this is
       * an equality and not a set of `includes`. */
      const keys = m.items.map(i => i.key).join(',')
      t(keys === 'all-text,heading,days,add-note,background',
        `${eng.name} ${w}: the bar holds the brief's weekly items, in order (${keys})`)
      /* ⛔ AND IT IS A SIDEWAYS SCROLLER, NOT A WRAPPING ROW. ⚠️ THE WEEKLY BAR'S FIVE BUTTONS FIT
       * 390px, so `scrollWidth > clientWidth` is false here and would be the wrong question — it is
       * asked of the single event design's SEVEN, in section 3. What matters at five is that the row
       * does not wrap onto a second line and steal the poster's height, and that the overflow is the
       * bar's own to scroll. */
      const bar = await page.evaluate(`(() => { const el = document.querySelector('[data-phone-itembar]')
        if (!el) return null
        const cs = getComputedStyle(el)
        const tops = new Set([...el.children].map(c => Math.round(c.getBoundingClientRect().top)))
        return { x: cs.overflowX, wrap: cs.flexWrap, rows: tops.size,
          c: Math.round(el.clientWidth), s: Math.round(el.scrollWidth) } })()`)
      t(!!bar && (bar.x === 'auto' || bar.x === 'scroll') && bar.wrap === 'nowrap' && bar.rows === 1,
        `${eng.name} ${w}: …and the bar is a one-row sideways scroller (overflow-x ${bar && bar.x}, ${bar && bar.wrap}, ${bar && bar.rows} row)`)

      // ── selecting from the bar opens the sheet ────────────────────────────────────────────────
      /* ⚠️ "Week heading" AND NOT "Date": the weekly design has no Date button — that is the single
       * event design's, and section 3 is where it is pressed. */
      await page.click('[data-phone-item-btn="heading"]')
      await page.waitForTimeout(200)
      m = await page.evaluate(MEASURE)
      t(!!m.sheet?.shown, `${eng.name} ${w}: tapping an item opens the sheet`)
      if (m.sheet?.shown) {
        /* 🔴 THE POSTER IS **RESIZED** TO THE SPACE ABOVE IT, NOT COVERED BY IT. ⛔ THAT IS THE
         * BRIEF'S OWN WORDING — *"sized to the space left above the bottom bar or above the open
         * sheet"* — and the two are different screens: a sheet laid over the poster hides its bottom
         * half, and what is hidden is wherever the operator was working. ⚠️ SO THE OVERLAP MUST BE
         * **NIL**, and the poster's own area must still be worth looking at. */
        const covered = overlapH(m.phoneStage, m.sheet)
        t(covered <= 1,
          `${eng.name} ${w}: …and the sheet does not overlap the poster at all (${covered}px of overlap)`)
        t(m.phoneStage.h >= 120,
          `${eng.name} ${w}: …and the poster's area is still ${m.phoneStage.h}px tall, above the sheet`)
        /* ⚠️ AND THE ITEM BAR IS STILL THERE, BETWEEN THEM. ⛔ THE `fixed` SHEET COVERED IT, which took
         * away both the brief's orange selected button and the one-tap way to the next item. */
        t(!!m.phoneBar?.shown && m.phoneBar.y >= m.phoneStage.bottom - 1 && m.phoneBar.bottom <= m.sheet.y + 1,
          `${eng.name} ${w}: …and the item bar is still on screen between the two (bar ${m.phoneBar && m.phoneBar.y}–${m.phoneBar && m.phoneBar.bottom}, sheet from ${m.sheet.y})`)
        t(m.sheet.h >= m.innerH * 0.3 && m.sheet.h <= m.innerH * 0.75,
          `${eng.name} ${w}: …and it opens at about half the screen (${m.sheet.h} of ${m.innerH})`)
        t(m.items.some(i => i.key === 'heading' && i.on),
          `${eng.name} ${w}: …and the chosen item is the highlighted one in the bar`)
        t(!m.phoneHint?.shown, `${eng.name} ${w}: …and the hint line is gone`)

        /* 🔴 EVERY TAB HAS CONTENT. ⛔ THIS IS THE CLAIM THE WHOLE `only` REFACTOR EXISTS FOR: a tab
         * that rendered nothing would look finished and do nothing, and a tab that rendered a COPY of
         * the desktop block would drift from it. ⚠️ COUNTED AS CONTROLS, not as pixels. */
        /* ⛔ EVERY TAB OF **EVERY** SHEET, not just the text one. The three sheets are three different
         * renderings — `SettingsPanel` with `only`, the days panel with `only`, and the picture card
         * split in two — so "every tab has content" has to be asked of all three. ⚠️ IT WAS ASKED OF
         * ONE, AND THE PICTURE SHEET'S BODY TURNED OUT TO CARRY NO MARKER AT ALL. */
        const SHEETS = [['heading', 'a text box'], ['days', 'The 7 days'], ['background', 'the picture']]
        for (const [item, what] of SHEETS) {
          await page.click(`[data-phone-item-btn="${item}"]`)
          await page.waitForTimeout(250)
          const ms = await page.evaluate(MEASURE)
          const tabIds = ms.tabs.map(x => x.id)
          t(tabIds.length >= 2, `${eng.name} ${w}: ${what}'s sheet has tabs (${tabIds.join(' · ')})`)
          for (const id of tabIds) {
            await page.click(`[data-sheet-tab="${id}"]`)
            await page.waitForTimeout(120)
            const mm = await page.evaluate(MEASURE)
            t(mm.sheetControls > 0,
              `${eng.name} ${w}: …${what}'s "${id}" tab has ${mm.sheetControls} control(s) in it`)
            /* ⚠️ AND THE SHEET SCROLLS INSIDE ITSELF, NEVER THE PAGE — asserted on every tab, because
             * it is the tallest tab that would push the page. */
            t(mm.docScrollH <= mm.innerH + 1,
              `${eng.name} ${w}: …and the page still does not scroll on ${what}'s "${id}"`)
          }
        }
        await page.click('[data-phone-item-btn="heading"]')
        await page.waitForTimeout(200)
        const tabIds = (await page.evaluate(MEASURE)).tabs.map(x => x.id)
        t(tabIds.join(',') === 'words,size,style,more',
          `${eng.name} ${w}: a following text box's tabs are Words · Size · Style · More (${tabIds.join(' · ')})`)

        /* ══ 🔴 THE TABS ARE A **PARTITION**, NOT A FILTER ══════════════════════════════════════════
         * ⛔ THE PICTURE SHEET'S TWO TABS BOTH DREW THE PICTURE BLOCK at first, so Darken repeated the
         * thumbnail, the size line and "Replace picture" above its slider and the two tabs stopped
         * meaning different things. ⚠️ MEASURED ON THE ONE SHEET WHOSE TABS CARVE UP A SINGLE CARD —
         * the others render disjoint blocks by construction. */
        await page.click('[data-phone-item-btn="background"]')
        await page.waitForTimeout(250)
        const part = {}
        for (const id of ['picture', 'darken']) {
          await page.click(`[data-sheet-tab="${id}"]`)
          await page.waitForTimeout(150)
          part[id] = await page.evaluate(`(() => ({
            pic: !!document.querySelector('[data-phone-sheet-body] [data-bg-size]'),
            dark: !!document.querySelector('[data-phone-sheet-body] [data-darken]'),
          }))()`)
        }
        t(part.picture.pic && !part.picture.dark && part.darken.dark && !part.darken.pic,
          `${eng.name} ${w}: the Picture sheet's two tabs show one thing each `
          + `(Picture: picture ${part.picture.pic}, darken ${part.picture.dark}; `
          + `Darken: picture ${part.darken.pic}, darken ${part.darken.dark})`)
        await page.click('[data-phone-sheet-close]')
        await page.waitForTimeout(150)
        await page.click('[data-phone-item-btn="heading"]')
        await page.waitForTimeout(200)

        /* 🔴 THE HANDLE DRAG — up makes it taller, and it must stop short of covering the poster. */
        const before = (await page.evaluate(MEASURE)).sheet
        const hb = (await page.evaluate(MEASURE)).handle
        if (hb) {
          await page.mouse.move(hb.x + hb.w / 2, hb.y + hb.h / 2)
          await page.mouse.down()
          for (let i = 1; i <= 10; i++) await page.mouse.move(hb.x + hb.w / 2, hb.y + hb.h / 2 - (i * 40))
          await page.mouse.up()
          await page.waitForTimeout(200)
          const after = await page.evaluate(MEASURE)
          t(after.sheet.h > before.h + 20,
            `${eng.name} ${w}: dragging the handle UP makes the sheet taller (${before.h} → ${after.sheet.h})`)
          /* ⛔ "MUST STOP SHORT OF COVERING THE POSTER COMPLETELY" — the brief's condition on the
           * handle. ⚠️ WITH THE SHEET IN THE FLOW THE POSTER IS NEVER OVERLAPPED, so the thing that
           * could go wrong is that it is squeezed to nothing instead: `clampSheet` keeps a floor, and
           * this is that floor measured. */
          t(after.phoneStage.h >= 100 && overlapH(after.phoneStage, after.sheet) <= 1,
            `${eng.name} ${w}: …and it stops short of squeezing the poster away (${after.phoneStage.h}px of poster left, ${overlapH(after.phoneStage, after.sheet)}px overlap)`)
          /* ⚠️ AND DOWN CLOSES IT. The brief asks for both directions on one handle. */
          const h2 = after.handle
          await page.mouse.move(h2.x + h2.w / 2, h2.y + h2.h / 2)
          await page.mouse.down()
          for (let i = 1; i <= 12; i++) await page.mouse.move(h2.x + h2.w / 2, h2.y + h2.h / 2 + (i * 50))
          await page.mouse.up()
          await page.waitForTimeout(250)
          const closed = await page.evaluate(MEASURE)
          t(!closed.sheet?.shown, `${eng.name} ${w}: …and dragging it DOWN closes the sheet`)
        } else {
          t(false, `${eng.name} ${w}: the sheet has a drag handle`)
        }

        /* ⚠️ AND ✕ CLOSES IT TOO. */
        await page.click('[data-phone-item-btn="heading"]')
        await page.waitForTimeout(200)
        await page.click('[data-phone-sheet-close]')
        await page.waitForTimeout(200)
        const x = await page.evaluate(MEASURE)
        t(!x.sheet?.shown, `${eng.name} ${w}: ✕ closes the sheet`)
        t(!!x.phoneHint?.shown, `${eng.name} ${w}: …and the hint line comes back`)
      }

      // ── tapping the poster selects the item under the finger ──────────────────────────────────
      /* 🔴 THE BRIEF: *"Tapping words on the poster selects that item too."* ⚠️ THE TAP IS ON A DAY
       * CELL, because that is the hardest case: the cells are `pointer-events-none` and the BLOCK
       * reports where it was pressed, hit-tested against `dayCells`. */
      const cell = (await page.evaluate(MEASURE)).cells.find(c => c.part === 'place' && c.row === 0)
      if (cell) {
        await page.mouse.click(cell.x + cell.w / 2, cell.y + cell.h / 2)
        await page.waitForTimeout(250)
        const sel = await page.evaluate(MEASURE)
        /* ⚠️ THE CLAIM IS "THE SHEET FOR THE THING I TAPPED", AND IT IS READ OFF THE SHEET'S OWN TITLE
         * — not off a button lighting up in the bar. ⛔ A DAY ROW'S "Venue" IS NOT A BAR BUTTON: the
         * four parts of a row are reached only by tapping them, which is the design's own rule, so a
         * bar-button assertion would be asking for the wrong thing and could only be made to pass by
         * adding buttons the brief does not list. */
        t(!!sel.sheet?.shown && !!sel.sheetTitle,
          `${eng.name} ${w}: tapping the words on the poster opens that item's sheet (${sel.sheetTitle || 'no sheet'}; a box is selected: ${sel.selectedBox})`)
        await page.click('[data-phone-sheet-close]').catch(() => {})
        await page.waitForTimeout(150)
      } else {
        t(false, `${eng.name} ${w}: the poster has day cells to tap`)
      }

      // ── dragging a box by TOUCH ───────────────────────────────────────────────────────────────
      /* 🔴 A REAL TOUCH GESTURE, not a mouse one. ⚠️ `touchscreen.tap` cannot drag, so this dispatches
       * the three pointer events a finger produces, with `pointerType: 'touch'` — which is what
       * `DraggableBox` is built on. ⛔ A MOUSE DRAG WOULD PROVE THE DESKTOP PATH, which was never in
       * doubt; the brief asks about a finger. */
      const box0 = (await page.evaluate(MEASURE)).boxes[0]
      if (box0) {
        /* ⛔ THE GESTURE AND THE MEASUREMENT ARE **TWO** EVALUATES, with a wait between them. React
         * batches the state the drag sets and flushes it in a microtask, so a `getBoundingClientRect`
         * taken in the same synchronous block as the `pointerup` reads the box's OLD position — which
         * reported "moved 0,0" on a drag that worked perfectly. ⚠️ THE SELECTED BOX IS THE ONE DRAGGED:
         * `boxes[0]` can be any of eleven, and only an unlocked one moves. */
        const was = await page.evaluate(`(() => {
          const el = document.querySelector('[data-box-outline="selected"]') || document.querySelector('[data-box-outline]')
          const b = el.getBoundingClientRect()
          const from = { x: b.left + b.width / 2, y: b.top + b.height / 2 }
          const opts = p => ({ bubbles: true, cancelable: true, composed: true, pointerId: 1,
            pointerType: 'touch', isPrimary: true, clientX: p.x, clientY: p.y, buttons: 1 })
          el.setPointerCapture = () => {}
          window.__hgDrag = el
          el.dispatchEvent(new PointerEvent('pointerdown', opts(from)))
          for (let i = 1; i <= 8; i++) {
            el.dispatchEvent(new PointerEvent('pointermove', opts({ x: from.x + i * 4, y: from.y + i * 3 })))
          }
          el.dispatchEvent(new PointerEvent('pointerup', opts({ x: from.x + 32, y: from.y + 24 })))
          return { left: Math.round(b.left), top: Math.round(b.top) }
        })()`)
        await page.waitForTimeout(300)
        const moved = await page.evaluate('(() => { const b = window.__hgDrag.getBoundingClientRect();'
          + ' return { dx: Math.round(b.left) - ' + was.left + ', dy: Math.round(b.top) - ' + was.top + ' } })()')
        t(Math.abs(moved.dx) >= 4 || Math.abs(moved.dy) >= 4,
          `${eng.name} ${w}: a box can be dragged with a FINGER (moved ${moved.dx},${moved.dy})`)
      } else {
        t(false, `${eng.name} ${w}: the poster has a box to drag`)
      }

      // ── Save, and the leave guard ────────────────────────────────────────────────────────────
      await page.click('[data-phone-save]')
      await page.waitForTimeout(200)
      const s = await page.evaluate(MEASURE)
      t(s.saved, `${eng.name} ${w}: the orange Save hands the layout out`)
      /* 🔴 THE LEAVE GUARD. ⛔ THE BOX WAS DRAGGED ABOVE, so the editor is dirty — and "‹" must ASK
       * rather than leave. ⚠️ ASSERTED AS "a dialog appeared AND `onBack` was not called", because a
       * guard that showed a dialog and left anyway would pass a weaker claim. */
      /* ⚠️ THE SAME GESTURE THE DRAG CLAIM USES, ON THE SAME BOX — the selected one, from its centre.
       * ⛔ AN UNSELECTED BOX FROM ITS CORNER is what this used to do, and it moved nothing: the guard
       * then passed its press on to a CLEAN editor, so "‹" left without asking and the failure looked
       * like a broken guard rather than a drag that never happened. */
      await page.evaluate(`(() => {
        const el = document.querySelector('[data-box-outline="selected"]') || document.querySelector('[data-box-outline]')
        const b = el.getBoundingClientRect()
        const from = { x: b.left + b.width / 2, y: b.top + b.height / 2 }
        const opts = p => ({ bubbles: true, cancelable: true, composed: true, pointerId: 2,
          pointerType: 'touch', isPrimary: true, clientX: p.x, clientY: p.y, buttons: 1 })
        el.setPointerCapture = () => {}
        el.dispatchEvent(new PointerEvent('pointerdown', opts(from)))
        for (let i = 1; i <= 6; i++) el.dispatchEvent(new PointerEvent('pointermove', opts({ x: from.x + i * 5, y: from.y + i * 4 })))
        el.dispatchEvent(new PointerEvent('pointerup', opts({ x: from.x + 30, y: from.y + 24 })))
      })()`)
      await page.waitForTimeout(300)
      /* 🔴 AND THE EDITOR MUST REALLY BE DIRTY BEFORE THE GUARD IS ASKED ABOUT. ⚠️ ASSERTED SEPARATELY,
       * so a gesture that did nothing fails as "nothing to guard" and not as "the guard is broken". */
      const dirtyNow = (await page.evaluate(MEASURE)).dirty
      t(dirtyNow === true,
        `${eng.name} ${w}: a finger drag after Save leaves unsaved changes to guard (dirty ${dirtyNow})`)
      const backsBefore = (await page.evaluate(MEASURE)).backs
      await page.click('[data-phone-back]')
      await page.waitForTimeout(250)
      const g = await page.evaluate(`(() => ({
        dialog: !!document.querySelector('[data-leave-dialog]'),
        backs: window.__hg.backs,
      }))()`)
      t(g.dialog && g.backs === backsBefore,
        `${eng.name} ${w}: "‹" with unsaved changes ASKS and does not leave (dialog ${g.dialog}, backs ${backsBefore}→${g.backs})`)
      /* ⚠️ AND IT IS **ONE BUTTON**, not a phone copy of the desktop's: the same element carries "‹" on
       * a phone and the full label on a desktop, so there is exactly one of it and it is still there at
       * 1100px. ⛔ A SECOND BACK BUTTON FOR THE PHONE is how the two would come to have different
       * guards — the failure this check exists to make impossible. */
      const backs = await page.evaluate(`document.querySelectorAll('[data-phone-back]').length`)
      t(backs === 1, `${eng.name} ${w}: …and there is exactly one back button in the editor (${backs})`)
    }

    // ── the single event design's bar names its own items ───────────────────────────────────────
    head(`${eng.name} · 3 · the single event design's item bar`)
    await open(page, 390, 844, 'kind=event')
    const ev = await page.evaluate(MEASURE)
    const evKeys = ev.items.map(i => i.key).join(',')
    t(ev.items.length >= 5 && evKeys.includes('date') && evKeys.includes('location')
      && evKeys.includes('town') && evKeys.includes('time') && !evKeys.includes('rows'),
      `${eng.name} event 390: the bar names the event items (${evKeys})`)
    t(!ev.items.some(i => i.key === 'days'),
      `${eng.name} event 390: …and not "The 7 days", which a single event does not have`)
    /* ⛔ SEVEN SQUARE BUTTONS DO NOT FIT 390px, which is the whole reason the bar is a scroller — and
     * `scrollWidth > clientWidth` is what says it really is one rather than a row that squashed its
     * buttons or wrapped them onto a second line. */
    const evBar = await page.evaluate(`(() => { const el = document.querySelector('[data-phone-itembar]')
      if (!el) return null
      const tops = new Set([...el.children].map(c => Math.round(c.getBoundingClientRect().top)))
      return { c: Math.round(el.clientWidth), s: Math.round(el.scrollWidth), rows: tops.size } })()`)
    t(!!evBar && evBar.s > evBar.c && evBar.rows === 1,
      `${eng.name} event 390: …and its seven buttons really do scroll sideways (${evBar && evBar.s} in ${evBar && evBar.c}, ${evBar && evBar.rows} row)`)
    /* ⚠️ AND THE PAGE STILL DOES NOT SCROLL, which is the pair to it: the overflow belongs to the bar. */
    t(ev.docScrollW <= ev.innerW + 1,
      `${eng.name} event 390: …and the page itself still does not scroll sideways (${ev.docScrollW} in ${ev.innerW})`)

    // ════════════════════════════════════════════════════════════════════════════════════════════
    // THE CONTROL
    // ════════════════════════════════════════════════════════════════════════════════════════════
    /* ⛔ IT BREAKS THE ONE THING THE SHEET IS FOR: the poster staying visible. The sheet is forced to
     * the full height of the screen with a stylesheet rule — the shape the brief's *"covering about the
     * bottom half, so the poster stays visible above it"* rules out — and the claim must refuse it.
     * ⚠️ A CSS RULE RATHER THAN A PATCHED COMPONENT, so the control is over the real component's real
     * geometry and not over a second version of it. */
    head(`${eng.name} · CONTROL`)
    await open(page, 390, 844)
    await page.click('[data-phone-item-btn="heading"]')
    await page.waitForTimeout(200)
    await page.addStyleTag({ content: '[data-phone-sheet]{position:fixed !important;inset:0 !important;'
      + 'height:100% !important;margin:0 !important;z-index:50 !important}' })
    await page.waitForTimeout(150)
    const bad = await page.evaluate(MEASURE)
    /* ⚠️ ONE NUMBER FOR BOTH SHAPES OF THE FAULT: a sheet laid OVER the poster and a sheet that has
     * squeezed it to nothing both end with no poster to look at, and `phoneStage.h` minus whatever is
     * overlapping it is what is left either way. */
    const left = bad.phoneStage.h - overlapH(bad.phoneStage, bad.sheet)
    t(left < 120,
      `${eng.name} CONTROL: with the sheet forced to the full height there is no poster left (${left}px) — so "the poster keeps its own space" is a measurement`)

    await page.close(); await ctx.close(); await eng.browser.close()
  }

  server.close()
  console.log('')
  if (!measured) { console.log('🔴 NO ENGINE WAS AVAILABLE — nothing was measured'); process.exit(1) }
  if (fail) { console.log(`🔴 ${fail} CHECK(S) FAILED`); process.exit(1) }
  console.log(`✅ all ${pass} passed, in ${measured} engine(s)`)
})().catch(e => { console.error(e); process.exit(1) })
