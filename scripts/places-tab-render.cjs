#!/usr/bin/env node
// scripts/places-tab-render.cjs — SCHEDULE › PLACES, THE TAB, MEASURED IN A REAL BROWSER.
//
//   npx next build && node scripts/places-tab-render.cjs
//   HG_ENGINES=webkit node scripts/places-tab-render.cjs      (one engine, when the other is broken)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY A SEPARATE FILE FROM scripts/schedule-places-render.cjs
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// That file measures the Add event MODAL and its "Tidy up places" pane. ⛔ IT DOES NOT RUN AT HEAD,
// and has not for several days: it throws "the fixture cannot be built" before measuring anything,
// twice over —
//   • the shared `Toggle`'s geometry moved into a `compact ? … : …` ternary, so the lift pinned to
//     `relative w-11 h-6 rounded-full transition-colors` cannot match; and
//   • the Add event type picker stopped being `<select id="event-type-select">` and became a PILL ROW
//     (`data-event-type-pills`), which three of its fixtures still lift and five of its assertions
//     still compare against the Van select's height.
// Repairing it means re-aiming assertions about a screen this build did not touch, so it is reported
// rather than quietly half-fixed — see docs/places-tidy-report.md.
//
// 🔴 WHAT THIS MEASURES: the TAB, which is a different shell — two panes in the page's own flow, a
// list capped at `70vh`, and a detail pane carrying the event-type PILL ROW and "Picture for posts".
// The three things the 5 October tidy-up added cannot be judged by a class census:
//   • a TYPE LABEL on the right of every list row, sharing one line with a name that TRUNCATES. Either
//     the label gets pushed off a 300px card or the name eats it, and only a layout engine knows which.
//   • a HIDDEN PLACES section with a two-fact sentence, which must not become a wall of text.
//   • up to six type pills in a pane 300px narrower than the page.
//
// 🔴 WEBKIT AS WELL AS CHROMIUM, BECAUSE THE DEVICE IS AN iPAD AND THE BROWSER IS SAFARI. On iOS every
// browser is WebKit. Either engine missing ⇒ SKIPPED AND SAID SO, never silently passed.
//
// ⚠️ IT IS NOT THE PAGE, AND SAYS SO. There is no operator session and no database here, so the real
// route cannot be rendered. What is rendered is the components' OWN class names — lifted out of the
// source by the regexes below, so the fixture cannot drift without this file FAILING TO BUILD — against
// THIS build's compiled stylesheet, with filler where the content goes. The tab's BEHAVIOUR (pressing a
// pill, uploading a picture, restoring a place) is the numbered localhost list in the report.
// ⚠️ NO NETWORK, NO DATABASE, NO LIVE TRUCK: file:// pages, the app's own CSS, local browser builds.

const fs = require('fs')
const path = require('path')
const os = require('os')

const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const PT = read('components/manage/PlacesTab.tsx')
const SH = read('components/manage/SchedulePlaces.tsx')
const COPY = read('lib/copy/serviceSettings.ts')

/** Lift one class string out of the real source, or THROW — the fixture is only worth as much as its
 *  agreement with the component it claims to measure. */
function lift(src, re, what) {
  const m = src.match(re)
  if (!m) throw new Error(`the fixture cannot be built: no ${what} found in the source`)
  return m[1]
}

function appCss() {
  // ⚠️ `.next/static`, NOT `.next/dev`: the dev CSS is a different, unminified artefact and measuring
  // against it would measure something nobody is served.
  const cssRoot = path.join(REPO, '.next/static')
  if (!fs.existsSync(cssRoot)) throw new Error('no .next/static — run `npx next build` first')
  const files = []
  const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name)
    if (e.isDirectory()) walk(f); else if (e.name.endsWith('.css')) files.push(f)
  } }
  walk(cssRoot)
  if (!files.length) throw new Error('no compiled CSS under .next/static — run `npx next build`')
  const css = files.map(f => fs.readFileSync(f, 'utf8')).join('\n')
  /* 🔴 THE STALENESS CHECK. Tailwind only emits the classes it finds in the source, so a build from
   * before this tab existed has no rule for its grid — and the fixture would then lay out as a single
   * column at EVERY width and report the phone case passing for the wrong reason. */
  if (!/300px_1fr/.test(css)) {
    throw new Error('the compiled CSS has no `md:grid-cols-[300px_1fr]` rule — the build predates this tab; run `npx next build`')
  }
  return css
}

/* 🔴 THE VIEWPORT META IS NOT DECORATION. Without it a mobile emulation lays out at the engine's
 * default 980px layout viewport, and the phone assertions would be measuring a tablet. */
const HEAD = css => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>
<style>body{margin:0}</style></head><body>`

const filler = (label, h) =>
  `<div style="height:${h}px;background:#eef2f7;border:1px solid #cbd5e1;border-radius:12px">${label}</div>`

/* 🔴 A 34-CHARACTER PLACE NAME, WHICH IS THE CASE THAT CROWDS THE TYPE LABEL. A real one: the kind of
 * pub name a Suffolk truck actually has. ⚠️ THE NAME TRUNCATES AND THE TYPE DOES NOT — that is the
 * row's design, so the measurement has to be made with a name long enough to force the choice. */
const LONG_NAME = 'The Kings Arms at Great Finborough'

/**
 * ══ 🔴 THE PLACES TAB ════════════════════════════════════════════════════════════════════════════
 *
 * @param typeCount   how many pills the detail pane draws (Standard + Private + up to four customs).
 * @param hidden      how many hidden places are in the bottom section.
 * @param hasPicture  true ⇒ the "Replace / Text positions / Remove" row; false ⇒ the placeholder.
 * @param oneCol      the CONTROL: the two-pane grid removed, so 1440 must stack. Without it the
 *                    side-by-side assertions would pass on a tab that never had two panes.
 */
function placesTabFixture(css, { typeCount = 6, hidden = 3, hasPicture = false, oneCol = false } = {}) {
  const grid = lift(PT, /<div className="(grid grid-cols-1 gap-3 md:grid-cols-\[300px_1fr\])">/, 'the two-pane tab grid')
  const leftCard = lift(PT, /<Card className="(min-h-0 overflow-hidden p-0 md:max-h-\[70vh\])">/, 'the list card')
  const listRoot = lift(SH, /<div className="(flex flex-col min-h-0 h-full)">/, 'the PlaceList root')
  const listScroll = lift(SH, /<div className="(flex-1 min-h-0 overflow-y-auto) px-3 pb-2">/, 'the list scroller')
  /* 🔴 THE ROW'S OWN LINE — the name and the type on one baseline, the name flexible, the type fixed. */
  const rowLine = lift(SH, /<span className="(flex items-baseline gap-2)">/, 'the row\'s name/type line')
  const rowName = lift(SH, /<span className="(min-w-0 flex-1 truncate text-sm font-bold text-slate-900)">/, 'the row name')
  /* 🔴 THE ROW IS TWO SIBLING BUTTONS, AND THE STAR IS MODELLED TOO. It is not decoration here: it
   * eats width out of a 300px column before the name and the type label get any, so a fixture without
   * it would measure a wider row than the operator is served. (They are SIBLINGS and not nested
   * because a button inside a button is invalid HTML — see the component.) */
  const rowLi = lift(SH, /<li key=\{p\.id\} className=\{`(flex items-stretch gap-1)/, 'the row item')
  const rowStar = lift(SH, /className="(px-1\.5 text-base leading-none self-center text-orange-500 hover:scale-110 transition-transform)"/, 'the favourite star')
  const rowBtn = lift(SH, /className=\{`(flex-1 min-w-0 text-left px-2 py-2 rounded-lg transition-colors)/, 'the row button')
  const groupHead = lift(SH, /<p className="(text-xs font-bold text-slate-400 uppercase tracking-wide px-1 pt-3 pb-0\.5)">All places<\/p>/, 'a group heading')
  const hiddenNote = lift(SH, /<p className="(px-1 pb-1 text-\[11px\] leading-relaxed text-slate-400)">\{HIDDEN_PLACES_NOTE\}<\/p>/, 'the hidden-places note')
  const noteText = lift(SH, /const HIDDEN_PLACES_NOTE = '(.+)'/, 'the hidden-places sentence')
  /* 🔴 THE PILL ROW. The base class is one string in the source; the three arms this fixture draws are
   * lifted separately, so a restyle of any one of them breaks the fixture rather than being measured
   * as another. */
  const pillRow = lift(PT, /data-place-type-pills className="(flex flex-wrap gap-1\.5)">/, 'the pill row')
  const pillBase = lift(PT, /className=\{`(inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1\.5 text-xs font-semibold transition-colors disabled:opacity-50)/, 'a pill')
  const pillOn = lift(PT, /\n\s*: '(border-slate-900 bg-slate-900 text-white)'\n/, 'the selected pill')
  const pillOff = lift(PT, /\n\s*: '(border-slate-300 bg-white text-slate-700 hover:bg-slate-50)'\}`\}/, 'an unselected pill')
  const pillPriv = lift(PT, /\n\s*\? '(border-purple-300 bg-white text-purple-700 hover:bg-purple-50)'\n/, 'the Private pill')
  const pillsLabel = lift(PT, /<p className="(mb-1 block text-xs font-bold text-slate-600)">Event type<\/p>/, 'the pill row label')
  const helper = lift(PT, /<p className="(mt-1\.5 text-\[11px\] text-slate-500)">\{PLACE_TYPE_HELPER\}<\/p>/, 'the helper line')
  const helperText = lift(COPY, /export const PLACE_TYPE_HELPER = '(.+)'/, 'the helper sentence')
  /* 🔴 "Picture for posts" — the card, the placeholder tile, the thumbnail and the button row. */
  const picCard = lift(PT, /<Card className="(p-4 space-y-3)" data-post-picture>/, 'the picture card')
  const picRow = lift(PT, /<div className="(flex items-start gap-3)">/, 'the picture row')
  const picTile = lift(PT, /<div className="(flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-1 text-center text-\[9px\] font-semibold leading-tight text-slate-500)">/, 'the placeholder tile')
  const picThumb = lift(PT, /<div className="(flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-100 text-center text-\[9px\] font-semibold leading-tight text-slate-500)">/, 'the thumbnail tile')
  const picBtns = lift(PT, /<div className="(mt-2 flex flex-wrap items-center gap-2)">/, 'the picture button row')
  const picUpload = lift(PT, /<label className=\{`(inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-2\.5 py-1\.5 text-xs font-semibold text-slate-700 hover:bg-slate-50)/, 'the upload button')
  const picLink = lift(PT, /className="(inline-flex items-center rounded-lg border border-slate-300 bg-white px-2\.5 py-1\.5 text-xs font-semibold text-slate-700 hover:bg-slate-50)">\s*\n\s*Text positions/, 'the Text positions link')
  const picRemove = lift(PT, /className="(inline-flex items-center rounded-lg border border-red-300 bg-white px-2\.5 py-1\.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50)"/, 'the Remove button')
  const picNote = lift(PT, /<p className="(mt-1 text-\[11px\] text-slate-400)">PNG or JPG/, 'the picture note')
  const picNoteText = lift(PT, /text-slate-400">(PNG or JPG, up to 10MB, the same shape as your standard design\.)<\/p>/, 'the picture note text')
  const stdNote = lift(COPY, /export const POST_PICTURE_STANDARD_NOTE = '(.+)'/, 'the standard-design sentence')

  /* ⚠️ THE TWO REAL LABEL SHAPES: a colour dot and a name, or a purple lock and "Private". Both are
   * drawn, because both are what crowd the row from the right — and the lock is the WIDER of the two
   * at the same text length, because an emoji is not a 10px dot. */
  const dotLabel = (name, colour) =>
    `<span class="inline-flex items-center gap-1 text-[11px] text-slate-500"><span aria-hidden="true" class="inline-block h-2 w-2 shrink-0 rounded-full" style="background:${colour}"></span>${name}</span>`
  const lockLabel = '<span class="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700"><span aria-hidden="true">🔒</span>Private</span>'

  const row = (i, label, greyed) => `
    <li class="${rowLi}${greyed ? ' opacity-55' : ''}">
      <button type="button" aria-label="Add to favourites" class="${rowStar}">☆</button>
      <button id="row-${i}" type="button" class="${rowBtn}">
        <span id="rowline-${i}" class="${rowLine}">
          <span id="rowname-${i}" class="${rowName}">${LONG_NAME}</span>
          <span id="rowtype-${i}">${label}</span>
        </span>
        <span class="block text-xs text-slate-400 truncate">Last: Tue 30 Sep · 17:00–20:00</span>
      </button>
    </li>`

  /* ⚠️ SIX PILLS IS THE MAXIMUM A TRUCK CAN HAVE ON SCREEN HERE: Standard, Private and four customs
   * (`TYPE_COLOURS` has six entries and the grid wraps after that). It is the crowded case, so it is
   * the default — a two-pill Pro truck cannot overflow anything. */
  const PILLS = ['Standard', 'Private', 'Festival', 'Pub', 'Market', 'Private hire'].slice(0, typeCount)
  const pill = (i, label) => {
    const on = i === 0
    const priv = label === 'Private'
    return `<button id="pill-${i}" type="button" role="radio" aria-checked="${on}" class="${pillBase} ${
      on ? pillOn : priv ? pillPriv : pillOff}">${priv ? '<span aria-hidden="true">🔒</span>' : ''}${label}</button>`
  }

  return `${HEAD(css)}
<div style="background:#f8fafc;min-height:100vh;padding:16px">
<div id="tab" class="${oneCol ? 'grid grid-cols-1 gap-3' : grid}">
  <!-- ── LEFT: the list ───────────────────────────────────────────────────────────────────── -->
  <div id="leftCard" class="${leftCard}" style="background:#fff;border:1px solid #e2e8f0;border-radius:16px">
    <div class="flex items-center justify-between gap-2 border-b border-slate-100 p-3">
      <p style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em">Places</p>
      <span style="font-size:12px;font-weight:700;white-space:nowrap">+ Add place</span>
    </div>
    <div id="listRoot" class="${listRoot}">
      <div class="p-3 pb-2 shrink-0">${filler('Search places', 56)}</div>
      <div id="listScroll" class="${listScroll}">
        <div><p class="${groupHead}">Favourites</p>
          <ul style="margin:0;padding:0;list-style:none" class="divide-y divide-slate-100">
            ${row(0, dotLabel('Standard', '#94A3B8'), false)}
            ${row(1, lockLabel, false)}
          </ul></div>
        <div><p class="${groupHead}">All places</p>
          <ul style="margin:0;padding:0;list-style:none" class="divide-y divide-slate-100">
            ${[2, 3, 4, 5, 6, 7].map(i => row(i,
              dotLabel(['Festival', 'Pub', 'Market'][i % 3], ['#E8550F', '#2563EB', '#7C3AED'][i % 3]), false)).join('')}
          </ul></div>
        <div id="hiddenGroup" data-hidden-places>
          <p id="hiddenHead" class="${groupHead}">Hidden places</p>
          <p id="hiddenNote" class="${hiddenNote}">${noteText}</p>
          <ul style="margin:0;padding:0;list-style:none" class="divide-y divide-slate-100">
            ${Array.from({ length: hidden }, (_, k) => row(20 + k, dotLabel('Standard', '#94A3B8'), true)).join('')}
          </ul></div>
      </div>
    </div>
  </div>
  <!-- ── RIGHT: the selected place ────────────────────────────────────────────────────────── -->
  <div id="right" class="min-w-0">
    <div id="typeCard" style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px;margin-bottom:12px">
      <p style="font-size:14px;font-weight:900;margin:0 0 8px">${LONG_NAME} · used 9 times</p>
      <div id="pillsWrap" class="min-w-0">
        <p class="${pillsLabel}">Event type</p>
        <div id="pills" role="radiogroup" class="${pillRow}">${PILLS.map((l, i) => pill(i, l)).join('')}</div>
        <p id="helper" class="${helper}">${helperText}</p>
      </div>
    </div>
    <div id="detail" style="background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:16px;margin-bottom:12px">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="sm:col-span-2">${filler('Name on posts', 56)}</div>
        <div class="sm:col-span-2">${filler('Address', 56)}</div>
        ${filler('Short name', 56)}${filler('Area', 56)}
      </div>
      <div id="controls" style="margin-top:12px;display:flex;gap:8px">
        <span style="padding:6px 12px;border-radius:12px;background:#f1f5f9;font-size:12px;white-space:nowrap">Hide this place</span>
      </div>
    </div>
    <div id="picCard" class="${picCard}" style="background:#fff;border:1px solid #e2e8f0;border-radius:16px">
      <p style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em">Picture for posts</p>
      <div class="${picRow}">
        ${hasPicture
          ? `<div id="picTile" class="${picThumb}">Your picture</div>`
          : `<div id="picTile" class="${picTile}">Standard design</div>`}
        <div class="min-w-0 flex-1">
          <p id="picLine" class="${hasPicture ? 'text-xs text-slate-600' : 'text-[11px] leading-relaxed text-slate-500'}">${
            hasPicture ? 'Set · 1080×1350' : stdNote}</p>
          <div id="picBtns" class="${picBtns}">
            <label id="picUpload" class="${picUpload}">${hasPicture ? 'Replace' : 'Upload a picture for this place'}</label>
            ${hasPicture ? `<a id="picPositions" class="${picLink}">Text positions</a>
            <button id="picRemove" class="${picRemove}">Remove</button>` : ''}
          </div>
          <p id="picNote" class="${picNote}">${picNoteText}</p>
        </div>
      </div>
    </div>
  </div>
</div></div></body></html>`
}

/* ══ 🔴 WHAT IS READ OUT OF THE RENDERED PAGE ═════════════════════════════════════════════════════
 * ⚠️ ONE `evaluate`, RETURNING NUMBERS — not a sequence of queries. Each round trip is a chance for
 * the page to have changed between two of them, and the Chromium hang on this machine (see `engines`)
 * makes every extra call a chance to lose the run. */
const rects = () => {
  const box = (id) => {
    const el = document.getElementById(id)
    if (!el) return null
    const b = el.getBoundingClientRect()
    return {
      left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top),
      bottom: Math.round(b.bottom), width: Math.round(b.width), height: Math.round(b.height),
      visible: b.width > 0 && b.height > 0,
    }
  }
  /* ══ 🔴 HOW MANY LINES A PIECE OF TEXT ACTUALLY TOOK ══════════════════════════════════════════
   * A Range's client rects are one per line box, which is the only honest answer for a paragraph — a
   * height divided by a guessed line-height is not.
   * ⛔ BUT ONE RECT PER LINE IS NOT TRUE OF AN `inline-flex` LABEL, and that cost this file its first
   * run: the type label is a dot `<span>` and a text node side by side, so the Range returns TWO rects
   * on ONE line — and the check "the type label never wrapped" failed at all three widths on markup
   * that was laying out correctly. Measuring the wrong thing and measuring it precisely is still
   * measuring the wrong thing.
   * 🔴 SO THE RECTS ARE CLUSTERED BY THEIR TOP EDGE. Two boxes on one line share a line box, so their
   * tops are within a few pixels; a second line is a whole line-height away. 6px is wider than any
   * baseline difference `items-center` can produce at 11px and far narrower than a line. */
  const linesOf = (id) => {
    const el = document.getElementById(id)
    if (!el) return 0
    const r = document.createRange()
    r.selectNodeContents(el)
    const tops = [...r.getClientRects()].map(b => b.top).sort((a, b) => a - b)
    let n = 0
    let last = -1e9
    for (const top of tops) { if (top - last > 6) { n++; last = top } }
    return n
  }
  /* ⛔ "IS THE NAME TRUNCATED" IS MEASURED ON THE ELEMENT, NOT GUESSED FROM THE STRING. `truncate` is
   * `overflow: hidden` + `text-overflow: ellipsis`, so the sign is scrollWidth > clientWidth. */
  const truncated = (id) => {
    const el = document.getElementById(id)
    return el ? el.scrollWidth > el.clientWidth + 1 : false
  }
  const pills = []
  for (let i = 0; i < 6; i++) { const b = box('pill-' + i); if (b) pills.push(b) }
  const rowBoxes = []
  for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 20, 21, 22]) {
    const line = box('rowline-' + i)
    if (!line) continue
    rowBoxes.push({ i, line, name: box('rowname-' + i), type: box('rowtype-' + i),
      nameTruncated: truncated('rowname-' + i), typeLines: linesOf('rowtype-' + i) })
  }
  const scroll = document.getElementById('listScroll')
  return {
    innerW: window.innerWidth,
    docScrollW: document.documentElement.scrollWidth,
    tab: box('tab'), leftCard: box('leftCard'), right: box('right'),
    listScroll: box('listScroll'),
    listScrolls: scroll ? scroll.scrollHeight > scroll.clientHeight + 1 : false,
    hiddenGroup: box('hiddenGroup'), hiddenHead: box('hiddenHead'), hiddenNote: box('hiddenNote'),
    hiddenNoteLines: linesOf('hiddenNote'),
    typeCard: box('typeCard'), pillsWrap: box('pillsWrap'), pillsRow: box('pills'),
    helper: box('helper'), helperLines: linesOf('helper'),
    picCard: box('picCard'), picTile: box('picTile'), picBtns: box('picBtns'),
    picUpload: box('picUpload'), picPositions: box('picPositions'), picRemove: box('picRemove'),
    picNote: box('picNote'), picNoteLines: linesOf('picNote'), picLine: box('picLine'),
    detail: box('detail'), controls: box('controls'),
    pills, rows: rowBoxes,
    /* ⚠️ THE PILL ROW'S LINE COUNT, FROM THE PILLS THEMSELVES — distinct `top` values. A wrapped row
     * is correct at 390 and a MISTAKE at 1440, and only the pills know which happened. */
    pillRows: new Set(pills.map(p => p.top)).size,
    btnRows: (() => {
      const ids = ['picUpload', 'picPositions', 'picRemove']
      const tops = ids.map(id => document.getElementById(id))
        .filter(Boolean).map(e => Math.round(e.getBoundingClientRect().top))
      return new Set(tops).size
    })(),
  }
}

async function engines() {
  /* ══ ⚠️ `HG_ENGINES` — RUN ONE ENGINE WHEN THE OTHER IS BROKEN ON THE MACHINE (5 October 2026) ════
   * This machine's Chromium hangs on `Runtime.callFunctionOn` — the same fault
   * scripts/event-types-render.cjs and the two outreach render harnesses carry a `protocolTimeout`
   * for, and it hangs at HEAD too, so it is the machine and not the build. ⛔ THE DEFAULT IS STILL
   * BOTH: a one-engine default would make a Chromium-only bug invisible for ever, which is the
   * opposite of why this file renders twice. */
  const want = (process.env.HG_ENGINES || 'chromium,webkit').toLowerCase()
  const out = []
  if (want.includes('chromium')) {
    try {
      const puppeteer = require('puppeteer')
      /* ⚠️ `protocolTimeout` IS SET DELIBERATELY. Puppeteer's default is 180 SECONDS, so one hung call
       * stalls the run for three minutes before anything is reported. 30s is long enough for a
       * file:// page with one stylesheet and short enough to fail usefully. */
      const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 30000 })
      const page = await b.newPage()
      out.push({ name: 'Chromium', close: () => b.close(), page,
        setViewport: (w, h) => page.setViewport({ width: w, height: h }),
        shot: async (file) => { await page.screenshot({ path: file }) } })
    } catch (e) { out.push({ name: 'Chromium', skip: String(e.message).split('\n')[0].slice(0, 110) }) }
  } else out.push({ name: 'Chromium', skip: 'not requested (HG_ENGINES)' })
  if (want.includes('webkit')) {
    try {
      const { webkit } = require('playwright')
      const b = await webkit.launch()
      const page = await b.newPage()
      out.push({ name: 'WebKit', close: () => b.close(), page,
        setViewport: (w, h) => page.setViewportSize({ width: w, height: h }),
        shot: async (file) => { await page.screenshot({ path: file }) } })
    } catch (e) { out.push({ name: 'WebKit', skip: String(e.message).split('\n')[0].slice(0, 110) }) }
  } else out.push({ name: 'WebKit', skip: 'not requested (HG_ENGINES)' })
  return out
}

async function measure() {
  const lines = []
  let fails = 0
  const t = (ok, label) => { lines.push(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }

  const css = appCss()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-places-tab-'))
  const write = (name, html) => { const f = path.join(tmp, name); fs.writeFileSync(f, html); return 'file://' + f }
  /* 🔴 SCREENSHOTS. ⚠️ THEY ARE RENDERS OF FIXTURES built from the real class strings, NOT captures of
   * a running page — that needs a database and a live truck, which this harness must never touch. */
  const shotDir = path.join(REPO, 'docs/screenshots/places-tidy')
  fs.mkdirSync(shotDir, { recursive: true })

  const list = await engines()
  let measured = 0
  for (const eng of list) {
    if (eng.skip) { lines.push(`⚠️ ${eng.name}: SKIPPED — ${eng.skip}`); continue }
    measured++
    lines.push(`── ${eng.name} ────────────────────────────────────────────────────────────────`)

    for (const [w, h, label] of [[1440, 900, 'desktop'], [820, 1180, 'iPad portrait'], [390, 844, 'phone']]) {
      await eng.setViewport(w, h)

      // ══ A · NO PICTURE — the placeholder, and the list ════════════════════════════════════════
      await eng.page.goto(write(`pt-${w}-${eng.name}.html`, placesTabFixture(css)))
      const r = await eng.page.evaluate(rects)
      lines.push(`  ${w}×${h} (${label})  list ${r.leftCard.width}×${r.leftCard.height}@x${r.leftCard.left} · detail ${r.right.width}@x${r.right.left} · pills ${r.pills.length} on ${r.pillRows} row(s) · hidden note ${r.hiddenNoteLines} line(s)`)

      // ── THE SHELL ────────────────────────────────────────────────────────────────────────────
      t(r.docScrollW <= r.innerW, `🔴 ${w}: NO HORIZONTAL PAGE SCROLL`)
      t(r.leftCard.right <= r.innerW + 1 && r.right.right <= r.innerW + 1,
        `🔴 ${w}: both panes fit across the viewport`)
      if (w >= 768) {
        t(r.right.left >= r.leftCard.right, `🔴 ${w}: the detail sits BESIDE the list`)
        t(Math.abs(r.leftCard.width - 300) <= 1, `⚠️ ${w}: the list column is the declared 300px (${r.leftCard.width})`)
        /* 🔴 THE LIST SCROLLS INSIDE ITS OWN CARD. That is what `md:max-h-[70vh]` buys: without it the
         * card grows to its content and the page scrolls instead, taking the detail pane off screen. */
        t(r.listScrolls, `🔴 ${w}: the places list scrolls INSIDE its card`)
        t(r.leftCard.height <= Math.round(h * 0.7) + 2,
          `⚠️ ${w}: …and the card is capped at 70vh (${r.leftCard.height} ≤ ${Math.round(h * 0.7)})`)
      } else {
        t(r.right.top >= r.leftCard.bottom, `🔴 ${w}: the list and the detail STACK on a phone`)
      }

      // ── THE TYPE LABEL ON EACH ROW ───────────────────────────────────────────────────────────
      /* ══ 🔴 THE ONE THAT NEEDED A BROWSER ════════════════════════════════════════════════════
       * A 34-character name and a type label on one line in a 300px column. The name is
       * `min-w-0 flex-1 truncate` and the label is unconstrained, so the engine gives the label its
       * natural width and truncates the name — which is the intended behaviour and the opposite of
       * what a `truncate` on both would do. ⛔ ASSERTED ON EVERY ROW, including the hidden ones. */
      t(r.rows.length >= 11, `⚠️ ${w}: all eleven rows rendered (${r.rows.length})`)
      const typeInside = r.rows.every(x => x.type.right <= r.leftCard.right + 1 && x.type.left >= r.leftCard.left - 1)
      t(typeInside, `🔴 ${w}: EVERY row's type label is inside the list card`)
      const typeOneLine = r.rows.every(x => x.typeLines === 1)
      t(typeOneLine, `🔴 ${w}: …and none of them wrapped (a half-written type name is worse than a truncated venue)`)
      const noOverlap = r.rows.every(x => x.name.right <= x.type.left + 1)
      t(noOverlap, `🔴 ${w}: …and the name never runs into it`)
      t(r.rows.every(x => x.type.width > 0), `⚠️ ${w}: …and none was squashed to nothing`)
      /* ⚠️ AND THE NAME IS THE THING THAT GAVE WAY. At 300px a 34-character bold name cannot fit
       * beside a label, so it MUST be truncated — if it is not, the fixture is not measuring the
       * crowded case it claims to. */
      t(r.rows.some(x => x.nameTruncated),
        `⚠️ ${w}: the long name is the side that truncates, which is the case being measured`)

      // ── THE HIDDEN PLACES SECTION ────────────────────────────────────────────────────────────
      t(r.hiddenGroup.visible, `🔴 ${w}: the HIDDEN PLACES section is on screen, not behind a toggle`)
      t(r.hiddenGroup.top >= r.rows.find(x => x.i === 7).line.top,
        `🔴 ${w}: …and it is at the BOTTOM, below the live places`)
      t(r.hiddenNote.visible && r.hiddenNoteLines <= 3,
        `⚠️ ${w}: its sentence fits in at most three lines (${r.hiddenNoteLines})`)
      t(r.hiddenNote.right <= r.leftCard.right + 1, `⚠️ ${w}: …without overflowing the card`)

      // ── THE PILL ROW ─────────────────────────────────────────────────────────────────────────
      t(r.pills.length === 6, `⚠️ ${w}: all six pills rendered (${r.pills.length})`)
      t(r.pills.every(p => p.left >= r.typeCard.left - 1 && p.right <= r.typeCard.right + 1),
        `🔴 ${w}: EVERY pill stays inside the detail pane`)
      t(r.pillsRow.right <= r.right.right + 1, `🔴 ${w}: the pill row does not widen the pane`)
      t(r.pills.every(p => p.height >= 28 && p.height <= 40),
        `⚠️ ${w}: the pills are a tappable height (${r.pills[0].height}px)`)
      if (w >= 768) {
        /* ⚠️ AT 1440 THE PANE IS ~1100px AND SIX PILLS ARE ~450px, so they must be on ONE line — a
         * wrapped row there means something is forcing a break and the control looks broken. */
        t(w >= 1440 ? r.pillRows === 1 : r.pillRows <= 2,
          `🔴 ${w}: the pills sit on ${w >= 1440 ? 'ONE line' : 'at most two lines'} (${r.pillRows})`)
      } else {
        /* 🔴 ON A PHONE THEY MUST WRAP, NOT SCROLL SIDEWAYS. `flex-wrap` is the whole mechanism; a
         * `nowrap` row of six pills in a 358px pane is a horizontal scroller nobody will find. */
        t(r.pillRows >= 2, `🔴 390: the pills WRAP rather than overflow (${r.pillRows} rows)`)
      }
      t(r.helper.visible && r.helperLines <= 3,
        `⚠️ ${w}: the one helper sentence fits in at most three lines (${r.helperLines})`)

      // ── "Picture for posts", WITH NO PICTURE ─────────────────────────────────────────────────
      t(r.picTile.visible && r.picTile.width === 64 && r.picTile.height === 64,
        `⚠️ ${w}: the "Standard design" placeholder is a 64px tile (${r.picTile.width}×${r.picTile.height})`)
      t(r.picUpload.visible && r.picUpload.right <= r.picCard.right + 1,
        `🔴 ${w}: "Upload a picture for this place" fits inside the card`)
      t(!r.picPositions && !r.picRemove,
        `⚠️ ${w}: …and with no picture there is no Replace, no Text positions and no Remove`)
      t(r.picNote.right <= r.picCard.right + 1 && r.picNoteLines <= 3,
        `⚠️ ${w}: the PNG/JPG note fits (${r.picNoteLines} line(s))`)
      t(r.picLine.right <= r.picCard.right + 1, `⚠️ ${w}: "${'…standard design.'}" fits beside the tile`)

      // ══ B · WITH A PICTURE — three controls in one row ════════════════════════════════════════
      await eng.page.goto(write(`pt-pic-${w}-${eng.name}.html`, placesTabFixture(css, { hasPicture: true })))
      const p = await eng.page.evaluate(rects)
      lines.push(`  ${w}×${h} with a picture  buttons on ${p.btnRows} row(s) · thumb ${p.picTile.width}×${p.picTile.height}`)
      t(p.docScrollW <= p.innerW, `🔴 ${w} (picture): NO HORIZONTAL PAGE SCROLL`)
      t(p.picUpload.visible && p.picPositions.visible && p.picRemove.visible,
        `🔴 ${w} (picture): Replace, Text positions and Remove are all there`)
      t([p.picUpload, p.picPositions, p.picRemove].every(b => b.right <= p.picCard.right + 1),
        `🔴 ${w} (picture): …and all three stay inside the card`)
      /* ⚠️ `flex-wrap` AGAIN: three buttons in a 300px-narrower pane at 390 must wrap, not clip. */
      t(w >= 768 ? p.btnRows === 1 : p.btnRows >= 1,
        `⚠️ ${w} (picture): the three controls sit on ${w >= 768 ? 'one row' : `${p.btnRows} row(s)`}`)
      t(p.picTile.width === 64 && p.picTile.height === 64,
        `⚠️ ${w} (picture): the thumbnail is the same 64px tile as the placeholder`)

      if (w === 1440 || w === 390) {
        await eng.shot(path.join(shotDir, `places-tab-${w}-${eng.name.toLowerCase()}.png`))
      }
    }

    // ── THE CONTROL ────────────────────────────────────────────────────────────────────────────
    /* 🔴 WITHOUT THE TWO-PANE GRID, 1440 MUST STACK. Otherwise the side-by-side assertions above
     * would pass on a tab that never had two panes, and this file would be proving that one column is
     * one column. */
    {
      await eng.setViewport(1440, 900)
      await eng.page.goto(write(`pt-ctl-${eng.name}.html`, placesTabFixture(css, { oneCol: true })))
      const c = await eng.page.evaluate(rects)
      t(c.right.top >= c.leftCard.bottom,
        '🔴 CONTROL: with the two-pane grid removed, 1440 stacks — so the measurement can tell them apart')
    }

    await eng.close()
  }

  if (measured === 0) {
    lines.push('🔴 NEITHER ENGINE RAN — nothing was measured, so nothing is proved.')
    fails++
  }
  return { lines, fails, measured }
}

measure().then(({ lines, fails, measured }) => {
  console.log('── SCHEDULE › PLACES, MEASURED: THE TYPE LABELS, THE HIDDEN SECTION, THE PILLS, THE PICTURE ──')
  for (const l of lines) console.log(l)
  console.log(fails === 0
    ? `\n✅ layout measured in ${measured} engine(s)`
    : `\n🔴 ${fails} MEASUREMENT(S) FAILED`)
  process.exit(fails === 0 ? 0 : 1)
}).catch(e => {
  console.error('\n🔴 ' + e.message)
  process.exit(1)
})
