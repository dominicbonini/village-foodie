#!/usr/bin/env node
// scripts/event-types-render.cjs
//
//   npx next build && node scripts/event-types-render.cjs     (NO DATABASE, NO LIVE TRUCK)
//
// ── 🔴 WHAT THIS MEASURES, AND WHY A GREP COULD NOT ────────────────────────────────────────────────
// Three surfaces, in BOTH engines, at 1440 / 820 / 390:
//   1. the Event types PANEL — a grid with one column per type, which grows with the truck's list;
//   2. the Add event PICKER — one field plus a hint, inside a modal that is already tight;
//   3. the dashboard CONTROL — a select on a card beside the per-event toggles.
//
// The question in every case is whether something is CLIPPED or pushes the page sideways, and that is
// a fact about the rendered box, not about the class string. A truck with six types has a panel grid
// wider than any laptop; the fixture proves the grid scrolls in its own box rather than taking the
// Done button off screen with it.
//
// ⚠️ THE CLASS STRINGS ARE LIFTED FROM THE REAL COMPONENT, so a restyle breaks this file rather than
// quietly leaving it measuring a layout nobody is served.

const fs = require('fs')
const os = require('os')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8')

const UI = read('components/manage/EventTypes.tsx')
const PAGE = read('app/manage/[token]/page.tsx')
/* 🔴 THE SHARED CONTROLS LIVE HERE NOW, so the fixture renders their classes, not a look-alike. */
const PRIM = read('components/manage/primitives.tsx')
const TOKENS = read('lib/ui-tokens.ts')

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
  /* 🔴 THE STALENESS CHECK. Tailwind emits only the classes it finds in the source, so a build from
   * before this component existed has no rule for its grid — and the fixture would then lay out as a
   * single column at EVERY width and report the phone case passing for the wrong reason. */
  if (!/overflow-x-auto/.test(css)) {
    throw new Error('the compiled CSS has no `overflow-x-auto` rule — the build predates this panel; run `npx next build`')
  }
  return css
}

/* 🔴 THE VIEWPORT META IS NOT DECORATION. Without it a mobile emulation lays out at the engine's
 * default 980px layout viewport, and the phone assertions would be measuring a tablet. The app
 * declares the same thing in app/layout.tsx. */
const HEAD = css => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>
<style>body{margin:0}</style></head><body>`

// ════════════════════════════════════════════════════════════════════════════════════════════════
// FIXTURE 1 — THE PANEL
// ════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * @param typeCount how many types the truck has. 6 is the long case — the grid is then wider than
 *                  1440 and must scroll in its own box.
 * @param breakScroll THE BROKEN VARIANT: drops `overflow-x-auto` from the grid's wrapper, which is
 *                  the fix. The grid then widens the PAGE instead of itself.
 */
function panelFixture(css, typeCount, breakScroll = false, vans = 'one') {
  /* ── 🔴 EVERY CLASS AND EVERY NUMBER IS LIFTED FROM THE COMPONENT ────────────────────────────────
   * `lift` THROWS if a pattern is not found, which is the point: each time this build changed shape —
   * the shell, the Standard cell, both control looks, the grid template, and then the whole Standard
   * column becoming one column per van — this fixture stopped BUILDING instead of going on measuring
   * a screen nobody is served. That is the failure the Settings build hit, and it is why none of
   * these is typed out here. */
  const shell = lift(UI, /className="(bg-white max-h-\[92vh\] rounded-2xl shadow-2xl flex flex-col overflow-hidden)"/, 'the modal shell')
  const header = lift(UI, /<div className="(shrink-0 flex items-center gap-3 px-4 sm:px-5 py-4 border-b border-slate-200)">/, 'the modal header')
  const body = lift(UI, /<div className="(flex-1 min-h-0 overflow-y-auto)">/, 'the modal body')
  const scroller = lift(UI, /<div className="(hidden md:block overflow-x-auto px-2 pb-2)" data-types-scroller>/, 'the columns scroller')
  const phone = lift(UI, /<div className="(md:hidden p-4 space-y-3)">/, 'the phone column')
  /* 🔴 THE DIVIDER IS PART OF EVERY VALUE CELL NOW, and both halves are lifted so the fixture cannot
   * draw a grid with different lines from the screen's. */
  const divider = lift(UI, /const CELL_DIVIDER = '(.+?)'/, 'the column divider')
  const cell = `${divider} ` + lift(UI, /<div key=\{t\.id\} className=\{`\$\{CELL_DIVIDER\} (px-2\.5 py-2\.5 border-t border-slate-100 min-h-11 flex items-center justify-center gap-2)`\}>/, 'a type cell')
  const labelCell = lift(UI, /<div className="(px-3 py-2\.5 border-t border-slate-100 text-sm font-semibold text-slate-900 min-h-11 flex items-center)">/, 'a label cell')
  /* 🔴 THE STANDARD CELL IS A CONSTANT IN THE COMPONENT NOW, because every van column shares it —
   * so a highlight applied unevenly is impossible there and in here. */
  const stdCell = `${divider} ` + lift(UI, /const STD_CELL = `\$\{CELL_DIVIDER\} (.+?)`/, 'the Standard cell class')
  /* The shared controls' own classes, so the fixture renders the components' output rather than a
   * look-alike. They live in primitives.tsx now; this file no longer defines a control. */
  /* ⚠️ FROM lib/ui-tokens.ts, which is where the box is DEFINED — primitives.tsx only re-exports
   * it under its old name. Lifting from the re-export would lift nothing. */
  const selBase = lift(TOKENS, /export const CONTROL_BOX =\n\s*'(.+?)'/, 'the control box')
  const toggleTrack = lift(PRIM, /<div className=\{`(relative w-11 h-6 rounded-full transition-colors shrink-0) \$\{on \? 'bg-green-500' : 'bg-slate-300'\}`\}>/, 'the toggle track')
  const toggleKnob = lift(PRIM, /<div className=\{`(absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform)/, 'the toggle knob')
  const LABEL_W = Number(lift(UI, /const GRID_LABEL_W = (\d+)/, 'the label column width'))
  const COL_W = Number(lift(UI, /const GRID_COL_W = (\d+)/, 'the value column width'))
  const PAD = Number(lift(UI, /const MODAL_SIDE_PADDING = (\d+)/, 'the modal side padding'))

  /* ── 🔴 THE VAN COLUMNS. The whole shape of this fixture now turns on the VAN COUNT ──────────────
   *  'one'    — one active van ⇒ a single combined "Standard" column.
   *  'match'  — two active vans that agree ⇒ TWO van columns. Same shape as 'differ'.
   *  'differ' — two active vans that disagree ⇒ TWO van columns, different values in them.
   * ⚠️ 'match' AND 'differ' MUST MEASURE THE SAME, and that is the assertion the second addition
   * exists for: the columns are a fact about how many vans the truck has, never about the values in
   * them, so equalising two vans must not move anything. */
  const vanNames = vans === 'one' ? ['Main van'] : ['Main van', 'Festival trailer']
  const vanCols = vanNames.length > 1 ? vanNames : []
  const standardCols = vanCols.length > 1 ? vanCols.length : 1
  const valueColumnCount = standardCols + typeCount
  const cols = `${LABEL_W}px repeat(${valueColumnCount}, ${COL_W}px)`
  const dialogW = LABEL_W + COL_W * valueColumnCount + PAD

  const typeNames = ['Festival', 'Market', 'Pub', 'Private hire', 'School fete', 'Christmas market']
    .slice(0, typeCount)

  /* 🔴 THE FIVE ROWS, IN SERVICE_ROWS' ORDER, UNDER SERVICE_ROWS' LABELS — read out of the real
   * arrays, so the fixture cannot measure a row order or a wording the screen does not have.
   * ⚠️ "Remind me to add a buzzer" IS THE LONGEST OF THE FIVE and it is last; a fixture with the old
   * short names ('Buzzers') would under-measure the 230px label column by a long way. */
  const LABELS = (() => {
    const lib = read('lib/copy/serviceSettings.ts')
    const pick = (k) => k === 'order_ready'
      ? lift(read('lib/settings-copy.ts'), /orderReady: \{\s*\n\s*label: '(.+?)'/, 'the order-ready label')
      : lift(lib, new RegExp(`${k}: '(.+?)'`), `the ${k} label`)
    const order = [...read('lib/event-types/types.ts')
      .matchAll(/label: SERVICE_SETTING_LABELS\.(\w+)/g)].map(m => m[1])
    if (order.length !== 5) throw new Error('the fixture cannot be built: SERVICE_ROWS did not yield five imported labels')
    return order.map(k => ({ k, label: pick(k) }))
  })()
  /* 🔴 WHICH ROW IS TRUCK-LEVEL, READ OUT OF `standardWriteFor` RATHER THAN LISTED HERE. A truck-level
   * row renders ONE control spanning the van columns, and that is a layout fact this must measure. */
  const TRUCK_LEVEL = (() => {
    const fn = UI.slice(UI.indexOf('function standardWriteFor('), UI.indexOf('const GRID_LABEL_W'))
    return new Set([...fn.split(/\n\s{4}(?=case '|default:)/).slice(1)]
      .filter(b => /scope: 'truck'/.test(b))
      .map(b => (b.match(/^case '(\w+)':/) || [])[1])
      .filter(Boolean))
  })()

  const OFFLINE_LABELS = ['Off',
    lift(read('lib/copy/offlineProtection.ts'), /OFFLINE_MODE_PAUSE_LABEL = '(.+?)'/, 'the pause label'),
    lift(read('lib/copy/offlineProtection.ts'), /OFFLINE_MODE_NO_AUTO_ACCEPT_LABEL = '(.+?)'/, 'the no-auto-accept label')]

  /* The shared <Select>: `appearance-none` plus a chevron, so it is measured with its own arrow and
   * not the platform's — which is the one visual difference from Settings' native selects. */
  /* ⚠️ NO `h-9`: the shared <Select> dropped it so the box matches Settings' own `py-1` height.
   * Dominic: "'every 15 min' is much larger than elsewhere" — it was the BOX that was taller, not the
   * font, and a fixture that kept the old height would go on measuring the old box. */
  /* 🔴 `text-sm` ON THE WRAPPER. app/globals.css forces `font-size: inherit !important` on every
   * <select> from 640px up (the other half of its iOS zoom guard), so the size has to come from the
   * PARENT — which is what the component does. A fixture that put it only on the select would measure
   * 16px and report a bug that is not there, or miss one that is. */
  const sel = (label, opts, faded, id, title) =>
    `<span class="relative inline-flex min-w-0 items-stretch text-sm flex-1"${title ? ` title="${title}"` : ''}><select${id ? ` id="${id}"` : ''} aria-label="${label}"${title ? ` title="${title}"` : ''} class="w-full min-w-0 truncate appearance-none pr-7 ${faded ? 'opacity-50 ' : ''}${selBase}">`
    + opts.map(o => `<option>${o}</option>`).join('')
    /* ⚠️ THE CHEVRON'S PATH IS PART OF THE FIXTURE, not decoration omitted for brevity. Without it the
     * screenshots show a select with NO arrow at all — which is neither what the component renders nor
     * what a native select looks like, so a reader comparing the shot to the screen would be misled. */
    + '</select><svg aria-hidden="true" viewBox="0 0 20 20" fill="none" class="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400">'
    + '<path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>'
  const toggle = (label, on, faded, id, title) =>
    `<button type="button"${id ? ` id="${id}"` : ''} role="switch" aria-checked="${on}" aria-label="${label}"${title ? ` title="${title}"` : ''} class="flex items-center gap-2 group ${faded ? 'opacity-50' : ''}">`
    + `<div class="${toggleTrack} ${on ? 'bg-green-500' : 'bg-slate-300'}"><div class="${toggleKnob} ${on ? 'translate-x-6' : 'translate-x-1'}"></div></div></button>`

  /** One control for a row, at a given value. */
  /* The two hover titles, lifted — they are the only place the nuances live now. */
  const FOLLOWS_TITLE = lift(read('lib/copy/serviceSettings.ts'), /TYPE_FOLLOWS_VAN_TITLE = "(.+?)"/, 'the follows-van title')
  const ALL_VANS_TITLE = lift(read('lib/copy/serviceSettings.ts'), /TAKES_CASH_ALL_VANS_TITLE = '(.+?)'/, 'the all-vans title')
  const controlFor = (row, label, valueIdx, faded, id, title) => {
    if (row.k === 'collection_interval_mins') return sel(label, [`Every ${valueIdx ? 10 : 15} min`], faded, id, title)
    if (row.k === 'offline_protection') return sel(label, OFFLINE_LABELS, faded, id, title)
    return toggle(label, valueIdx === 0, faded, id, title)
  }

  /* ── THE STANDARD SIDE OF ONE ROW ─────────────────────────────────────────────────────────────── */
  const standardCellsFor = (row, i) => {
    const idAttr = i === 0 ? ' id="firstStd"' : ''
    if (vanCols.length > 1) {
      /* 🔴 ONE CELL PER VAN FOR EVERY ROW, INCLUDING THE TRUCK-LEVEL ONE. The span is gone: it drew
       * one switch under the first van's header and nothing under the second's, which reads as "van 2
       * has no toggle". A truck-level row shows the SAME value in every column, with a hover title
       * saying it applies to all vans. */
      return vanCols.map((n, vi) => {
        const v = TRUCK_LEVEL.has(row.k) ? 0 : (vans === 'differ' ? vi : 0)
        const id = vi === 0 ? idAttr : (i === 0 && vi === 1 ? ' id="secondStd"' : '')
        const tl = TRUCK_LEVEL.has(row.k) && i === 2 ? ' id="truckCell"' : ''
        return `<div class="${stdCell}"${id}${tl}>${controlFor(row, `${row.label} for ${n}`, v, false, undefined, TRUCK_LEVEL.has(row.k) ? ALL_VANS_TITLE : undefined)}</div>`
      }).join('')
    }
    return `<div class="${stdCell}"${idAttr}>${controlFor(row, `${row.label} for Standard`, 0, false)}</div>`
  }

  /* ── ONE TYPE'S CELL ──────────────────────────────────────────────────────────────────────────── */
  const typeCellFor = (row, name, i, j) => {
    const idAttr = i === 0 && j === 0 ? ' id="firstControl"' : ''
    /* 🔴 EVERY TYPE HERE IS INHERITING, which is the look worth measuring. Where the vans DIFFER and
     * the row is per-van, an inheriting type has no single value to show — so it reads "Varies by
     * van", faded, with no underline. */
    /* ⛔ NO SPECIAL CASE FOR "the vans differ" ANY MORE. Every type cell is a real control at a real
     * value, faded when the type has set nothing — the first van's value, with a hover title. The
     * three phrases that used to live here are gone, and the harness asserts they are. */
    return `<div class="${cell}"${idAttr}>${controlFor(row, `${row.label} for ${name}`, 0, true, i === 0 ? 'firstTypeCtl' : undefined, FOLLOWS_TITLE)}</div>`
  }

  const footer = (() => {
    const lib = read('lib/copy/serviceSettings.ts')
    return [lift(lib, /EVENT_TYPES_FOOTER_STANDARD =\s*\n\s*'(.+?)'/, 'footer line 1'),
      lift(lib, /EVENT_TYPES_FOOTER_ONE_EVENT =\s*\n\s*"(.+?)"/, 'footer line 2')]
  })()
  const subtitle = lift(read('lib/copy/serviceSettings.ts'), /EVENT_TYPES_SUBTITLE = '(.+?)'/, 'the subtitle')
  const heading = lift(read('lib/ui-tokens.ts'), /export const SUBCARD_HEADING = '(.+?)'/, 'the section heading token')
  /* The phone picker lists the van columns and then the types, in the grid's order. */
  const pickerNames = [...(vanCols.length > 1 ? vanCols : ['Standard']), ...typeNames]

  return `${HEAD(css)}
<div class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4" style="position:fixed;inset:0">
  <div id="modal" data-event-types-modal class="${shell}" style="width:${dialogW}px;max-width:min(1000px, 100%)">
    <div id="header" class="${header}">
      <div class="min-w-0 flex-1">
        <h2 class="font-bold text-slate-900 text-lg">Event types</h2>
        <p class="text-xs sm:text-[13px] text-slate-500">${subtitle}</p>
      </div>
      <button id="newtype" class="hover:bg-slate-100 text-slate-600 border border-slate-200 text-sm px-4 py-2 font-bold rounded-xl">+ New event type</button>
      <button id="close" aria-label="Close" class="shrink-0 w-10 h-10 rounded-full bg-slate-100 text-slate-600 text-lg font-bold">✕</button>
    </div>
    <div id="body" class="${body}">
      <div id="phone" class="${phone}">
        <div><label class="block text-xs font-bold text-slate-600 mb-1" for="pick">Column</label>
        ${sel('Column', pickerNames, false, 'pick')}</div>
        <div id="phonecard" class="rounded-2xl border border-slate-200 p-4">
          <p class="font-bold text-slate-900">${pickerNames[0]}</p>
          ${LABELS.map(x => `<div class="flex items-center justify-between gap-3 text-sm py-1.5 border-t border-slate-100"><span class="text-slate-700 min-w-0 flex-1">${x.label}</span><span class="flex items-center gap-2 shrink-0 max-w-[55%]">${controlFor(x, x.label, 0, false)}</span></div>`).join('')}
        </div>
      </div>
      <div id="scroller" class="${breakScroll ? 'hidden md:block px-2 pb-2' : scroller}" data-types-scroller>
        <div class="min-w-max" style="display:grid;grid-template-columns:${cols}" id="grid" data-types-grid>
          <div class="px-3.5 py-3"></div>
          ${(vanCols.length > 1 ? vanCols : ['Standard']).map((n, k) => `<div class="${divider} px-2.5 py-3 flex items-center gap-1.5 min-w-0"${k === 0 ? ' id="firstStdHdr"' : ''}><span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style="background:#94A3B8"></span><span class="text-[13px] font-bold text-slate-800 truncate" title="${n}">${n}</span><span class="text-[11px] text-slate-400 font-semibold shrink-0">${vanCols.length > 1 ? 'Standard' : 'default'}</span></div>`).join('')}
          ${typeNames.map(n => `<div class="${divider} px-2.5 py-3 flex items-center gap-1.5 min-w-0 relative"><span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style="background:#E8550F"></span><span class="text-[13px] font-bold text-slate-800 truncate">${n}</span><button aria-label="More for ${n}" class="ml-auto shrink-0 w-[30px] h-[30px] rounded-lg border border-slate-200 text-slate-500 font-bold">⋯</button></div>`).join('')}
          <div class="px-3 pt-3.5 pb-1.5 ${heading}" style="grid-column:1/-1">SERVICE</div>
          ${LABELS.map((x, i) => `<div class="${labelCell}"${i === 0 ? ' id="firstLabel"' : ''}${i === 4 ? ' id="lastLabel"' : ''}>${x.label}</div>${standardCellsFor(x, i)}${typeNames.map((n, j) => typeCellFor(x, n, i, j)).join('')}`).join('')}
          <div class="px-3 pt-3.5 pb-1.5 ${heading}" style="grid-column:1/-1">USED BY</div>
          <div class="${labelCell}">Upcoming events</div>
          <div class="${divider} px-2.5 py-2.5 border-t border-slate-100 text-sm text-slate-600 min-h-11 flex items-center justify-center"${vanCols.length > 1 ? ` style="grid-column:span ${vanCols.length}"` : ''}>Everything else</div>
          ${typeNames.map(() => `<div class="${divider} px-2.5 py-2.5 border-t border-slate-100 text-sm text-slate-700 min-h-11 flex items-center justify-center">2 events</div>`).join('')}
        </div>
      </div>
    </div>
    <div id="footer" class="shrink-0 px-4 sm:px-5 py-3 border-t border-slate-200 text-[13px] text-slate-500 leading-relaxed">
      ${footer[0]}<br />${footer[1]}
    </div>
  </div>
</div></body></html>`
}

/**
 * THE "+ NEW EVENT TYPE" POPUP (NewType2 board).
 *
 * ⚠️ MEASURED SEPARATELY because it is its own dialog over the modal, and the question is whether the
 * four name chips wrap rather than overflow at 390px.
 */
function newTypeFixture(css) {
  const shell = lift(UI, /className="(bg-white rounded-2xl w-full max-w-\[460px\] p-5 flex flex-col gap-3\.5)"/, 'the new-type popup')
  return `${HEAD(css)}
<div class="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" style="position:fixed;inset:0">
  <div id="popup" data-new-type-popup class="${shell}">
    <div class="flex items-center gap-3">
      <p class="font-bold text-slate-900 text-lg flex-1">New event type</p>
      <button aria-label="Close" class="w-9 h-9 rounded-full bg-slate-100 text-slate-600 font-bold">✕</button>
    </div>
    <div>
      <label class="block text-[13px] font-semibold text-slate-700 mb-1.5" for="nm">Name</label>
      <input id="nm" placeholder="e.g. School fete" class="w-full border border-slate-300 rounded-xl px-3 h-11 text-[15px] bg-white" />
    </div>
    <div id="chips" class="flex flex-wrap gap-2">
      ${['Festival', 'Pub', 'Market', 'Private hire'].map(c => `<button class="border border-slate-300 rounded-full px-3.5 h-10 text-sm font-semibold text-slate-900 bg-white">${c}</button>`).join('')}
    </div>
    <p id="note" class="text-[13px] text-slate-500">Tap a name or type your own. It starts exactly like Standard. Change anything after.</p>
    <div id="actions" class="flex gap-2.5 justify-end">
      <button class="bg-slate-100 text-slate-700 text-sm px-4 py-2 font-bold rounded-xl">Cancel</button>
      <button class="bg-orange-600 text-white text-sm px-4 py-2 font-bold rounded-xl">Create</button>
    </div>
  </div>
</div></body></html>`
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// FIXTURE 2 — THE ADD EVENT PICKER, inside the real modal shell
// ════════════════════════════════════════════════════════════════════════════════════════════════
function pickerFixture(css) {
  /* 🔴 THE MODAL SHELL IS LIFTED FROM page.tsx. The question is whether the field fits the modal it
   * was added to, so measuring it anywhere else would answer a different question. */
  const shell = lift(PAGE, /<div className=\{`(bg-white rounded-2xl p-5 sm:p-6 pb-8 sm:pb-8 w-full shadow-2xl max-h-\[90vh\] overflow-y-auto overscroll-contain touch-pan-y)/, 'the add-event modal shell')
  const narrow = lift(PAGE, /: '(max-w-sm sm:max-w-lg lg:max-w-2xl overflow-x-hidden)'/, 'the modal width')
  const field = (label, value) => `
    <div><label class="block text-xs font-bold text-slate-600 mb-1">${label}</label>
    <input value="${value}" class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 bg-white" /></div>`

  return `${HEAD(css)}
<div class="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center lg:items-start lg:pt-8 justify-center p-4" style="position:fixed;inset:0">
  <div id="modal" class="${shell} ${narrow}">
    <h3 class="font-black text-slate-900 mb-4">Add event</h3>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div class="sm:col-span-2">${field('Venue name', 'Bures Music Festival')}</div>
      {/* the mount */}
      <div class="sm:col-span-2">
        <div id="etfield" data-event-type-select>
          <label class="block text-xs font-bold text-slate-600 mb-1" for="event-type-select">Event type</label>
          <select id="event-type-select" class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 bg-white">
            <option>Standard</option><option>Festival</option><option>Pub</option>
          </select>
          <p id="ethint" class="text-xs text-slate-500 mt-0.5"><span class="font-semibold text-slate-600">(usual for this place) </span>buzzers on · mark-ready step on · collection every 10 min</p>
        </div>
      </div>
      <div class="sm:col-span-2">${field('Full address (optional)', '')}</div>
      <div>${field('Area (village, town or city)', 'Bures')}</div>
      ${field('Postcode', 'CO8 5JQ')}
      ${field('Start time', '10:00')}
      ${field('End time', '22:00')}
    </div>
    <div id="footer" class="flex gap-2 justify-end mt-4">
      <button class="bg-slate-100 text-slate-700 text-sm px-4 py-2 font-bold rounded-xl">Cancel</button>
      <button class="bg-orange-600 text-white text-sm px-4 py-2 font-bold rounded-xl">Add event</button>
    </div>
  </div>
</div></body></html>`
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// FIXTURE 3 — THE DASHBOARD "This event" CARD (Dashboard2 board)
// ════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * @param withTypes  false renders the card for a truck with NO event types, which must still show —
 *                   only the Event type row is conditional. That is the "before" shape for the
 *                   before/after comparison in the report.
 * @param old        THE PRE-MOVE SHAPE: the five controls as separate cards down the Kitchen tab,
 *                   which is what the operator saw before this build. Rendered so the report can show
 *                   both and so the measurement can prove the card is not taller than what it replaced.
 */
function cardFixture(css, withTypes = true, old = false) {
  const CARD = read('components/dashboard/ThisEventCard.tsx')
  const card = lift(CARD, /className="(bg-white rounded-2xl shadow-sm border border-slate-200 p-4)">/, 'the card')
  const row = lift(CARD, /<div className="(flex items-center gap-2\.5 py-2\.5 border-t border-slate-100 min-h-\[44px\])">/, 'a card row')
  /* ⚠️ LIFTED, so the `max-w-[58%]` fix cannot be reverted without this file noticing. */
  /* ⚠️ THE CARD'S SELECT IS BUILT FROM `CONTROL_BOX` NOW (v3 addition), so it is a template string
   * rather than a literal — the card stopped carrying its own border and radius. Rebuilt here the
   * same way the card builds it, from the same token. */
  const cardBox = lift(TOKENS, /export const CONTROL_BOX =\n\s*'(.+?)'/, 'the control box')
  const cardSuffix = lift(CARD, /const SELECT = `\$\{CONTROL_BOX\} (.+?)`/, 'the card select suffix')
  const sel = `${cardBox} ${cardSuffix}`
  const heading = lift(CARD, /<p className="(text-\[11px\] font-bold tracking-\[0\.06em\] text-slate-500 pt-3 pb-0\.5)">/, 'a section heading')

  const tag = '<span class="text-[10px] font-bold text-blue-700 bg-blue-100 rounded px-1.5 py-px shrink-0">THIS EVENT</span>'
  const sw = (on, label) => `<button type="button" role="switch" aria-checked="${on}" aria-label="${label}" class="relative w-[42px] h-6 rounded-full shrink-0 ${on ? 'bg-orange-600' : 'bg-slate-300'}"><span class="absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white"></span></button>`
  const link = t => `<button type="button" class="text-sm font-semibold text-orange-700 shrink-0">${t}</button>`
  const r = (label, hint, right, own) => `<div class="${row}"><div class="min-w-0 flex-1"><p class="text-[15px] font-semibold text-slate-800">${label}</p>${hint ? `<p class="text-[13px] text-slate-500 font-normal">${hint}</p>` : ''}</div>${own ? tag : ''}${right}</div>`

  if (old) {
    /* ── THE "BEFORE": five separate cards, as the Kitchen tab had them ───────────────────────── */
    const oldCard = 'flex items-start justify-between gap-4 p-4 bg-white rounded-2xl shadow-sm border border-slate-200'
    const oldOne = (title, body, right) =>
      `<div class="${oldCard}" style="margin-bottom:12px"><div class="flex-1 min-w-0"><p class="text-sm font-semibold text-slate-800">${title}</p><p class="text-xs text-slate-500 mt-0.5">${body}</p></div>${right}</div>`
    return `${HEAD(css)}
<div id="scope" style="background:#f8fafc;padding:16px">
  <div id="before">
    ${oldOne('Offline Order Protection', "If your device loses its connection, this stops orders arriving while you can't see them.", sw(true, 'Offline'))}
    ${oldOne('Remind me to add a buzzer', 'Opens the buzzer grid as soon as you place an order.', sw(true, 'Buzzers'))}
    ${oldOne('Order-ready step', 'Show a “Mark ready” button on the orders screen.', sw(false, 'Mark ready'))}
    ${oldOne('Do you take cash?', 'Splits the payment button into "Cash" and "Card".', sw(false, 'Take cash'))}
    ${oldOne('Customer Collection Times', 'How often a collection slot is offered.', `<select class="${sel}"><option>Every 15 min</option></select>`)}
  </div>
</div></body></html>`
  }

  return `${HEAD(css)}
<div id="scope" style="background:#f8fafc;padding:16px">
  <div id="card" data-this-event-card class="${card}">
    <div class="flex items-center gap-3 pb-1">
      <p class="font-bold text-slate-900 text-base flex-1">This event</p>
      <p class="text-[13px] text-slate-500">Changes here are for this event only</p>
    </div>
    ${withTypes ? r('Event type', null, `<select id="etsel" aria-label="Event type" class="${sel}"><option>Festival</option></select>`, false) : ''}
    <p class="${heading}">MENU</p>
    ${r('Stock and items sold', 'Pizza 120 · Margherita 60 · Nduja not sold', link('Change'), false)}
    <p class="${heading}">DEALS</p>
    ${r('Festival meal deal', null, sw(true, 'Festival meal deal'), false)}
    ${r('Kids eat for £5', null, sw(false, 'Kids eat for £5'), true)}
    <p class="${heading}">SERVICE</p>
    ${r('Buzzers', null, sw(true, 'Buzzers'), false)}
    ${r('Take cash', null, sw(false, 'Take cash'), true)}
    ${r('“Mark ready” step', null, sw(true, 'Mark ready step'), false)}
    ${r('Collection times', 'Every 10 min', link('Change'), false)}
    ${r('Offline protection', null, `<select id="offsel" aria-label="Offline protection" class="${sel}"><option>Keep taking orders, confirm them yourself</option></select>`, true)}
    <p id="warn" class="text-[13px] text-amber-600 -mt-1 pb-1.5">⚠️ <strong>You must keep your dashboard or kitchen screen on and online during service.</strong> If the screen goes off, the device loses internet, or you switch to another website, offline protection takes over — either pausing ordering or turning auto-accept off, whichever you chose.</p>
    <div class="flex items-center justify-between gap-3 pl-4 pb-2">
      <p class="text-[13px] font-semibold text-slate-700">Reject orders waiting longer than</p>
      <select id="delaysel" aria-label="Reject orders waiting longer than" class="border border-slate-300 rounded-lg px-2 h-9 text-sm bg-white"><option>15 mins</option></select>
    </div>
    <div id="cardfooter" class="flex items-center gap-3 py-2.5 border-t border-slate-100">
      <p class="text-[13px] text-slate-500 flex-1">3 settings changed for this event only.</p>
      ${link('Reset to Festival')}
    </div>
  </div>
</div></body></html>`
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
async function engines() {
  const out = []
  try {
    const puppeteer = require('puppeteer')
    const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
    const page = await b.newPage()
    out.push({ name: 'Chromium', close: () => b.close(), page,
      setViewport: (w, h) => page.setViewport({ width: w, height: h }),
      /* ⚠️ THE ELEMENT, NOT THE PAGE. A full-page shot of a fixture is mostly backdrop. */
      shot: async (file, id) => { const el = await page.$('#' + id); if (el) await el.screenshot({ path: file }) } })
  } catch (e) { out.push({ name: 'Chromium', skip: String(e.message).split('\n')[0].slice(0, 110) }) }
  try {
    const { webkit } = require('playwright')
    const b = await webkit.launch()
    const page = await b.newPage()
    out.push({ name: 'WebKit', close: () => b.close(), page,
      setViewport: (w, h) => page.setViewportSize({ width: w, height: h }),
      shot: async (file, id) => { const el = await page.locator('#' + id).first(); await el.screenshot({ path: file }) } })
  } catch (e) { out.push({ name: 'WebKit', skip: String(e.message).split('\n')[0].slice(0, 110) }) }
  return out
}

/** Boxes + the two overflow facts, for whatever ids a fixture has. */
const probe = () => {
  const box = (id) => {
    const el = document.getElementById(id)
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top),
      bottom: Math.round(b.bottom), width: Math.round(b.width), height: Math.round(b.height) }
  }
  /* 🔴 "CLIPPED" IS MEASURED ON THE TEXT, NOT ON THE BOX. An element whose text is wider than itself
   * shows it truncated with no overflow of its own, so the honest test is scrollWidth vs clientWidth. */
  const truncated = (id) => {
    const el = document.getElementById(id)
    if (!el) return null
    return el.scrollWidth > el.clientWidth + 1
  }
  /**
   * 🔴 CAN THE OVERFLOW ACTUALLY BE REACHED — not merely "does the content overflow".
   *
   * The first draft of this probe returned `scrollWidth > clientWidth`, and that is TRUE for a plain
   * block with `overflow: visible` too: the box reports its content's width whether or not anything
   * can be scrolled. So the broken variant "passed" the control, because its grid also overflows — it
   * is just unreachable. The honest test is to TRY: set scrollLeft and see whether it moved.
   */
  const scrolls = (id) => {
    const el = document.getElementById(id)
    if (!el) return false
    if (el.scrollWidth <= el.clientWidth + 1) return false
    const before = el.scrollLeft
    el.scrollLeft = 9999
    const moved = el.scrollLeft > before
    el.scrollLeft = before
    return moved
  }
  return {
    panel: box('panel'), header: box('header'), body: box('body'), grid: box('grid'),
    scroller: box('scroller'), done: box('done'), phone: box('phone'), newtype: box('newtype'),
    modal: box('modal'), etfield: box('etfield'), ethint: box('ethint'), footer: box('footer'),
    card: box('card'), ctl: box('ctl'), etsel: box('etsel'), ownline: box('ownline'),
    settings: box('settings'),
    close: box('close'), firstLabel: box('firstLabel'), firstControl: box('firstControl'),
    /* The fifth row's label — the longest of the five, and the reason the label column is the wide
     * one. `truncated` measures the TEXT against its box, not the box against its parent. */
    lastLabel: box('lastLabel'), truncatedLastLabel: truncated('lastLabel'),
    /* The first van's Standard cell and the SECOND van's — `null` for the second is itself the answer
     * to "is there a second column". */
    firstStd: box('firstStd'), secondStd: box('secondStd'),
    /* The truck-level row's cell in the FIRST van column, and the hover text that explains why the
     * same switch appears in every column. One cell wide, never a span. */
    truckCell: box('truckCell'),
    truckCellTitle: (() => {
      const el = document.getElementById('truckCell')
      const c = el && el.querySelector('[title]')
      return c ? c.getAttribute('title') : null
    })(),
    /* An inheriting TYPE cell: a real control, faded, with the title saying the value is the van's. */
    firstTypeCtl: box('firstTypeCtl'),
    firstTypeCtlTitle: (() => {
      const el = document.getElementById('firstTypeCtl')
      if (!el) return null
      const t = el.getAttribute('title')
      if (t) return t
      const near = el.closest('[title]') || el.parentElement?.querySelector('[title]')
      return near ? near.getAttribute('title') : null
    })(),
    firstTypeCtlFaded: (() => {
      const el = document.getElementById('firstTypeCtl')
      if (!el) return null
      /* ⚠️ THE COMPUTED OPACITY, not the class name. `opacity-50` purged from the stylesheet would
       * leave the class in the markup and the control at full strength — the exact failure this
       * harness exists to catch, and one a class census cannot see. */
      return parseFloat(getComputedStyle(el).opacity) < 0.99
    })(),
    /* ⛔ THE THREE RETIRED PHRASES, LOOKED FOR IN THE RENDERED TEXT — what an operator actually reads,
     * not what the source happens to contain in a comment explaining their removal. */
    forbiddenText: (() => {
      const txt = (document.getElementById('grid') || document.body).innerText || ''
      return ['Varies by van', 'Set per van', 'Same as Standard'].some(p => txt.includes(p))
    })(),
    fontOfLabel: (() => { const e = document.getElementById('firstLabel'); return e ? getComputedStyle(e).fontSize : null })(),
    lineHeightOfLabel: (() => { const e = document.getElementById('firstLabel'); return e ? getComputedStyle(e).lineHeight : null })(),
    fontOfSelect: (() => {
      const e = (document.getElementById('grid') || document).querySelector('select')
      return e ? getComputedStyle(e).fontSize : null
    })(),
    lineHeightOfSelect: (() => {
      const e = (document.getElementById('grid') || document).querySelector('select')
      return e ? getComputedStyle(e).lineHeight : null
    })(),
    /* 🔴 THE CHEVRON IS PAST THE MIDDLE OF ITS BOX. A chevron whose positioning classes were purged
     * renders INLINE, at the far left, before the text — the exact state Dominic reported seeing. */
    chevronRightAligned: (() => {
      const sel = (document.getElementById('grid') || document).querySelector('select')
      if (!sel) return null
      const svg = sel.parentElement && sel.parentElement.querySelector('svg')
      if (!svg) return false
      const s = svg.getBoundingClientRect(), b = sel.getBoundingClientRect()
      return s.left > b.left + b.width / 2
    })(),
    /* ── THE COLUMN DIVIDERS, counted as cells that draw a left border ──────────────────────────── */
    dividerCount: (() => {
      const g = document.getElementById('grid')
      if (!g) return 0
      return [...g.children].filter(el => parseFloat(getComputedStyle(el).borderLeftWidth) > 0).length
    })(),
    headerDivided: (() => {
      const e = document.getElementById('firstStdHdr')
      return e ? parseFloat(getComputedStyle(e).borderLeftWidth) > 0 : null
    })(),
    /* 🔴 HOW MANY LINES THE LONGEST LABEL TAKES. The label column was widened precisely so that
     * raising the labels from 13px to 14px did not wrap "Remind me to add a buzzer".
     * ⚠️ THE TEXT'S OWN HEIGHT, NOT THE CELL'S. The first version divided the CELL's `scrollHeight`
     * by the line height — but the cell is `min-h-11 py-2.5`, so 44px of padded box over a 20px line
     * came out as "2 lines" for a label that was on one. It reported a wrap at every width, including
     * widths where the label demonstrably fitted. Measuring the text node is the honest version. */
    labelLines: (() => {
      const e = document.getElementById('lastLabel')
      if (!e) return null
      const lh = parseFloat(getComputedStyle(e).lineHeight)
      if (!lh) return null
      const r = document.createRange()
      r.selectNodeContents(e)
      const rects = r.getClientRects()
      /* One rect per rendered line of text. */
      return Math.max(1, rects.length)
    })(),
    popup: box('popup'), chips: box('chips'), note: box('note'), actions: box('actions'),
    offsel: box('offsel'), delaysel: box('delaysel'), warn: box('warn'), cardfooter: box('cardfooter'),
    noteTruncated: truncated('note'), warnTruncated: truncated('warn'),
    gridScrolls: scrolls('scroller'),
    hintTruncated: truncated('ethint'),
    ownTruncated: truncated('ownline'),
    pageScrollsSideways: document.documentElement.scrollWidth > window.innerWidth + 1,
    docScrollW: document.documentElement.scrollWidth,
    innerW: window.innerWidth,
    layoutW: document.documentElement.clientWidth,
  }
}

async function main() {
  const lines = []
  let fails = 0
  const t = (ok, label) => { lines.push(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }

  const css = appCss()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'et-render-'))
  const write = (name, html) => { const f = path.join(tmp, name); fs.writeFileSync(f, html); return 'file://' + f }
  /* 🔴 SCREENSHOTS GO IN THE REPO so the report can point at them and Dominic can approve the moved
   * controls before this deploys. They are renders of FIXTURES built from the real class strings, not
   * captures of a running dashboard — that would need a database and a live truck, which this harness
   * must never touch. The report says so where it links them. */
  const shotDir = path.join(REPO, 'docs/screenshots/event-types')
  fs.mkdirSync(shotDir, { recursive: true })

  /* The component's own three numbers, read once. Every expectation below derives from these. */
  const EXPECTED_LABEL_W = Number(lift(UI, /const GRID_LABEL_W = (\d+)/, 'the label column width'))
  const EXPECTED_COL_W = Number(lift(UI, /const GRID_COL_W = (\d+)/, 'the value column width'))
  const EXPECTED_PAD = Number(lift(UI, /const MODAL_SIDE_PADDING = (\d+)/, 'the modal side padding'))
  /** Dialog widths by `${w}/${nTypes}/${vanState}`. */
  const matrixWidths = {}
  /** Grid widths, same keys — the uncapped measurement, for "did a column appear". */
  const matrixGrids = {}
  /** Value columns for a given state, so the divider count has something to be compared against. */
  const valueColsFor = (vanState, nTypes) => (vanState === 'one' ? 1 : 2) + nTypes

  const list = await engines()
  for (const eng of list) {
    if (eng.skip) { lines.push(`⚠️ ${eng.name}: SKIPPED — ${eng.skip}`); continue }
    lines.push(`── ${eng.name} ──────────────────────────────────────────────────────────────`)

    for (const [w, h] of [[1440, 900], [820, 1180], [390, 844]]) {
      // ── 1 · THE MODAL, with SIX types (the brief's wide case) ─────────────────────────────────
      await eng.setViewport(w, h)
      await eng.page.goto(write(`modal-${w}-${eng.name}.html`, panelFixture(css, 6)))
      const p = await eng.page.evaluate(probe)
      lines.push(`  modal ${w}×${h}  dialog ${p.modal.width}×${p.modal.height} · grid ${p.grid.width}px in ${p.scroller ? p.scroller.width : 0}px · doc ${p.docScrollW} vs ${p.innerW}`)

      t(!p.pageScrollsSideways, `🔴 modal ${w}: NO HORIZONTAL PAGE SCROLL with six types`)
      /* 🔴 ~1000px AND IT NEVER GROWS. Six types make the grid 1580px wide; the dialog must not. */
      t(p.modal.width <= Math.min(1000, w) + 1,
        `🔴 modal ${w}: the dialog is at most 1000px and does not grow with the types (${p.modal.width}px)`)
      t(p.modal.height <= h + 1, `🔴 modal ${w}: the dialog fits the viewport (${p.modal.height}px)`)
      t(p.close.right <= p.modal.right + 1 && p.close.top >= 0,
        `🔴 modal ${w}: the close button is on screen and inside the dialog`)
      t(p.footer.bottom <= p.modal.bottom + 1, `⚠️ modal ${w}: the footer sits inside the dialog`)

      if (w >= 768) {
        t(p.phone.width === 0 || p.phone.height === 0, `⚠️ modal ${w}: the phone column is hidden`)
        /* 🔴 THE COLUMNS SCROLL INSIDE THE MODAL — asserted by trying to scroll, not by comparing
         * widths, because a plain overflowing block reports the same widths and cannot be scrolled. */
        t(p.gridScrolls, `🔴 modal ${w}: THE COLUMNS scroll inside the dialog (grid ${p.grid.width} in ${p.scroller.width})`)
        /* ── 🔴 THE TWO WIDTHS SWAPPED IN v3, AND THEY ARE READ FROM THE COMPONENT ────────────────
         * It was a 200px LABEL column beside 230px value columns. The brief and the board both have
         * it the other way round — label ~230, each type ~200 — because the longest thing on any row
         * is the LABEL ("Remind me to add a buzzer"), not the switch beside it.
         * ⚠️ THE EXPECTED NUMBERS COME FROM `GRID_LABEL_W`/`GRID_COL_W` IN THE COMPONENT, not from
         * literals here. A measurement harness that hard-codes the number it expects will pass a
         * restyle it should have caught, and fail a deliberate change for no reason. */
        const EXPECT_LABEL_W = Number(lift(UI, /const GRID_LABEL_W = (\d+)/, 'the label column width'))
        const EXPECT_COL_W = Number(lift(UI, /const GRID_COL_W = (\d+)/, 'the value column width'))
        t(Math.abs(p.firstControl.width - EXPECT_COL_W) <= 1,
          `🔴 modal ${w}: a value column is ${EXPECT_COL_W}px wide (${p.firstControl.width}px)`)
        t(Math.abs(p.firstLabel.width - EXPECT_LABEL_W) <= 1,
          `🔴 modal ${w}: the LABEL column is the wide one, ${EXPECT_LABEL_W}px (${p.firstLabel.width}px)`)
        t(EXPECT_LABEL_W > EXPECT_COL_W,
          `⚠️ modal ${w}: …and the label column is wider than a value column (${EXPECT_LABEL_W} > ${EXPECT_COL_W})`)
        /* 🔴 THE LONGEST LABEL IS NOT CLIPPED. "Remind me to add a buzzer" is the fifth row and the
         * reason the label column got the extra 30px. A clipped label is the defect the swap fixes. */
        t(p.lastLabel && !p.truncatedLastLabel,
          `🔴 modal ${w}: the longest label ("Remind me to add a buzzer") is not clipped`)
        t(p.firstControl.left >= p.firstLabel.right - 1,
          `🔴 modal ${w}: the control sits in its type's column, right of the labels (${p.firstControl.left} ≥ ${p.firstLabel.right})`)
      } else {
        t(p.phone.height > 0, `🔴 modal ${w}: the PHONE column is shown instead of the grid`)
        t(!p.scroller || p.scroller.width === 0 || p.scroller.height === 0,
          `🔴 modal ${w}: the side-by-side columns are hidden on a phone`)
      }

      /* ══ 🔴 1b · THE WHOLE MATRIX — 1, 3 AND 6 TYPES × ONE VAN / TWO MATCHING / TWO DIFFERING ════
       * Nine combinations per width per engine, which is 54 renders in all. The brief asks for it, and
       * each dimension answers a different question that the six-type/one-van case above cannot:
       *
       *  TYPE COUNT → does the dialog FIT ITS COLUMNS? With one type the content is 630px and the
       *    dialog used to be 1000px, leaving an empty band to the right whose width said "there is
       *    more here". With six it is 1630px and must cap at 1000 and scroll. Three is the case that
       *    lands nearest the cap (1030px) and is therefore the one most likely to be wrong by a
       *    scrollbar's width.
       *
       *  VAN STATE → 'one' and 'match' must render IDENTICALLY, because the brief forbids a van
       *    picker: a second van that agrees with the first changes nothing an operator can see. If
       *    those two ever measure differently, something has started treating "has two vans" as a
       *    reason to show more. 'differ' replaces every Standard control with text PLUS a
       *    right-aligned link inside 200px, which is the widest thing any cell has to hold. */
      for (const nTypes of [1, 3, 6]) {
        for (const vanState of ['one', 'match', 'differ']) {
          await eng.page.goto(write(`matrix-${w}-${nTypes}-${vanState}-${eng.name}.html`,
            panelFixture(css, nTypes, false, vanState)))
          const m = await eng.page.evaluate(probe)
          /* 🔴 THE VAN COLUMNS COUNT TOWARDS THE WIDTH (the second addition). Two vans give TWO
           * Standard columns, so a two-van three-type truck has five value columns, not four. The
           * first version of this line counted `nTypes + 1` and reported a 200px "empty band" that
           * was in fact the second van's column. */
          const nVanCols = vanState === 'one' ? 1 : 2
          const contentW = EXPECTED_LABEL_W + EXPECTED_COL_W * (nVanCols + nTypes) + EXPECTED_PAD
          const capped = contentW > Math.min(1000, w - 24)
          lines.push(`  matrix ${w} · ${nTypes} type${nTypes === 1 ? '' : 's'} · ${vanState.padEnd(6)}  dialog ${m.modal.width}px (content ${contentW}, ${nVanCols} van col${nVanCols === 1 ? '' : 's'}) · grid ${m.grid.width} · doc ${m.docScrollW} vs ${m.innerW}`)

          t(!m.pageScrollsSideways,
            `🔴 ${w}/${nTypes}/${vanState}: NO HORIZONTAL PAGE SCROLL`)
          t(m.modal.width <= Math.min(1000, w) + 1,
            `🔴 ${w}/${nTypes}/${vanState}: the dialog never exceeds 1000px or the viewport (${m.modal.width}px)`)
          t(m.modal.right <= m.innerW + 1 && m.modal.left >= -1,
            `🔴 ${w}/${nTypes}/${vanState}: the dialog is fully on screen`)
          t(m.close.right <= m.modal.right + 1,
            `🔴 ${w}/${nTypes}/${vanState}: the close button is inside the dialog`)

          /* 🔴 THE EMPTY BAND, WHICH IS WHAT §4 OF THE BRIEF IS ABOUT. Below the cap the dialog must
           * be its CONTENT's width — not wider. Above it, it is exactly the cap and the columns
           * scroll. ⚠️ ONLY CHECKED AT WIDTHS WHERE THE GRID IS SHOWN: on a phone the grid is
           * `hidden` and the dialog is sized by the phone column instead, which is correct. */
          if (w >= 768) {
            if (capped) {
              t(m.modal.width <= Math.min(1000, w) + 1 && m.gridScrolls,
                `🔴 ${w}/${nTypes}/${vanState}: past the cap the COLUMNS scroll, the dialog does not grow`)
            } else {
              t(Math.abs(m.modal.width - contentW) <= 2,
                `🔴 ${w}/${nTypes}/${vanState}: the dialog IS its content's width — no empty band (${m.modal.width} vs ${contentW})`)
              t(!m.gridScrolls,
                `⚠️ ${w}/${nTypes}/${vanState}: …and nothing scrolls, because everything fits`)
            }
            /* 🔴 EVERY CELL IS EXACTLY ONE COLUMN WIDE. The first row is Collection times, which is
             * per-van, so with two vans its first Standard cell is one van's column — not a stack and
             * not a span. A cell wider than a column means the span rule has leaked onto a per-van
             * row, which would silently make two vans share one control. */
            t(m.firstStd && m.firstStd.width <= EXPECTED_COL_W + 1,
              `🔴 ${w}/${nTypes}/${vanState}: a per-van Standard cell is ONE column wide (${m.firstStd ? m.firstStd.width : '?'}px)`)
            t(m.firstControl.left >= m.firstLabel.right - 1,
              `⚠️ ${w}/${nTypes}/${vanState}: the first control is right of the label column`)
            /* 🔴 TWO VAN COLUMNS WHEN THERE ARE TWO VANS, AND THEY ARE THE SAME WIDTH AS EACH OTHER
             * AND AS A TYPE COLUMN. "Column widths stay fixed (van columns the same width as type
             * columns)" — measured, because a grid with a `span` in it is exactly where a column can
             * quietly take a different size. */
            if (nVanCols === 2) {
              t(m.secondStd !== null && m.secondStd !== undefined,
                `🔴 ${w}/${nTypes}/${vanState}: there is a SECOND van column`)
              t(m.secondStd && Math.abs(m.secondStd.width - EXPECTED_COL_W) <= 1,
                `🔴 ${w}/${nTypes}/${vanState}: the second van column is ${EXPECTED_COL_W}px too (${m.secondStd ? m.secondStd.width : '?'}px)`)
              t(m.secondStd && m.firstStd && m.secondStd.left >= m.firstStd.right - 1,
                `⚠️ ${w}/${nTypes}/${vanState}: the second van column sits right of the first`)
              /* 🔴 THE TRUCK-LEVEL ROW GETS ITS OWN SWITCH IN EVERY VAN COLUMN — the span is gone.
               * Dominic: "Each van column gets its own switch, like every other row. No control
               * spanning two columns." The span drew one switch under the first van's header and
               * nothing under the second's, which reads as "van 2 has no toggle".
               * ⚠️ MEASURED AS "ONE COLUMN WIDE", which is what distinguishes it from the span. */
              t(m.truckCell && Math.abs(m.truckCell.width - EXPECTED_COL_W) <= 1,
                `🔴 ${w}/${nTypes}/${vanState}: the truck-level row is ONE CELL PER VAN, not a span (${m.truckCell ? m.truckCell.width : '?'}px)`)
              t(m.truckCellTitle === 'Applies to all your vans',
                `🔴 ${w}/${nTypes}/${vanState}: …and its switch says so on hover ("${m.truckCellTitle ?? 'none'}")`)
            } else {
              t(!m.secondStd, `⚠️ ${w}/${nTypes}/one: a single van gets ONE Standard column`)
            }
            /* ⛔ NONE OF THE THREE PHRASES APPEARS, IN ANY VAN STATE. Measured on the RENDERED TEXT
             * rather than on the source, because that is the question: what does an operator read? */
            t(!m.forbiddenText,
              `⛔ ${w}/${nTypes}/${vanState}: no "Varies by van" / "Set per van" / "Same as Standard" on screen`)
            /* 🔴 AN INHERITING TYPE CELL IS A REAL CONTROL AT A REAL VALUE, faded, with the title that
             * explains whose value it is. */
            if (nTypes > 0) {
              t(!!m.firstTypeCtl, `🔴 ${w}/${nTypes}/${vanState}: an inheriting type cell holds a real control`)
              t(m.firstTypeCtlTitle === "Follows each van's usual setting",
                `🔴 ${w}/${nTypes}/${vanState}: …with the hover title that says whose value it is ("${m.firstTypeCtlTitle ?? 'none'}")`)
              t(m.firstTypeCtlFaded === true,
                `🔴 ${w}/${nTypes}/${vanState}: …and it is faded, because the type has not set it`)
            }
            /* ══ 🔴 THE TEXT SIZES MATCH, MEASURED ══════════════════════════════════════════════
             * Dominic: "dropdown text, switch labels and row labels all use the same font size,
             * weight and line height… The dropdown text is currently larger than everything else."
             * 🔴 COMPUTED STYLE, NOT CLASS NAMES. `text-sm` on both would satisfy a class census while
             * a browser default on a <select> quietly overrode it — which is exactly what a native
             * select does, and why this is measured rather than grepped. */
            /* 🔴 EQUAL FROM 640px UP — AND DELIBERATELY *NOT* ON A PHONE. app/globals.css forces
             * every <select> to 16px below 640px to stop iOS Safari zooming the page on focus, and
             * that guard protects the one device this is used on at the hatch. Asserting equality at
             * 390 would be asserting the guard away, so the phone case asserts the GUARD instead.
             * ⚠️ THIS BRANCH IS INSIDE `if (w >= 768)`, so the phone case is checked separately below. */
            t(m.fontOfLabel && m.fontOfSelect && m.fontOfLabel === m.fontOfSelect,
              `🔴 ${w}/${nTypes}/${vanState}: a dropdown's text is the same size as a row label (${m.fontOfSelect} vs ${m.fontOfLabel})`)
            t(m.lineHeightOfLabel === m.lineHeightOfSelect,
              `⚠️ ${w}/${nTypes}/${vanState}: …and the same line height (${m.lineHeightOfSelect} vs ${m.lineHeightOfLabel})`)
            /* 🔴 THE CHEVRON IS ON THE RIGHT, AND NOTHING SITS BEFORE THE TEXT. Measured as "the
             * chevron's left edge is past the middle of the box" — a chevron rendered inline (the
             * state a purged `right-*` class produces) lands at the far LEFT and fails this. */
            t(m.chevronRightAligned === true,
              `🔴 ${w}/${nTypes}/${vanState}: the dropdown chevron is on the RIGHT of the box`)
            /* 🔴 A DIVIDER BETWEEN EVERY PAIR OF COLUMNS, header included. */
            t(m.dividerCount >= valueColsFor(vanState, nTypes),
              `🔴 ${w}/${nTypes}/${vanState}: every column is divided from the one before it (${m.dividerCount} dividers)`)
            t(m.headerDivided === true,
              `🔴 ${w}/${nTypes}/${vanState}: …including in the header row`)
            /* 🔴 THE LONGEST LABEL IS ON ONE LINE at the shared text size. The label column was
             * widened to pay for raising the labels from 13px to 14px; this is what proves it did. */
            t(m.labelLines === 1,
              `🔴 ${w}/${nTypes}/${vanState}: "Remind me to add a buzzer" is on ONE line (${m.labelLines})`)
          }

          /* Recorded for the comparisons below.
           * 🔴 THE GRID AS WELL AS THE DIALOG, and the grid is the one that answers "did a column
           * appear". The dialog is capped — by 1000px on a desktop and by the VIEWPORT at 820 and
           * 390 — so at those widths a one-van and a two-van dialog are both exactly as wide as the
           * screen, and comparing them says nothing. The grid is inside a sideways scroller and is
           * never clipped, so it grows by exactly one column width. The first version of the check
           * below compared dialogs and failed at 820 and 390 for precisely that reason. */
          matrixWidths[`${w}/${nTypes}/${vanState}`] = m.modal.width
          matrixGrids[`${w}/${nTypes}/${vanState}`] = m.grid ? m.grid.width : 0
        }
        /* ══ 🔴 THE ASSERTION THE SECOND ADDITION EXISTS FOR ══════════════════════════════════════
         * TWO MATCHING VANS AND TWO DIFFERING VANS MUST MEASURE IDENTICALLY. "Do this whether or not
         * the vans currently differ, so the layout does not jump when a value changes." Equalise two
         * vans and nothing may move.
         *
         * ⚠️ THIS REPLACES THE OPPOSITE ASSERTION. The first version of the addition said one van and
         * two matching vans must render the same, because the per-van controls only appeared when the
         * values differed. Under the column model that is now FALSE BY DESIGN — two vans always give
         * two columns — and the pair that must agree is match/differ instead. The old check went red
         * when the design changed, which is what it was for. */
        t(matrixWidths[`${w}/${nTypes}/match`] === matrixWidths[`${w}/${nTypes}/differ`],
          `🔴 ${w}/${nTypes}: TWO MATCHING AND TWO DIFFERING VANS RENDER IDENTICALLY — no layout jump when a value changes`)
        /* 🔴 AND A SECOND VAN REALLY DOES ADD A COLUMN — measured on the GRID, which is not capped.
         * Without this, "no layout jump" would also be satisfied by the van columns never appearing
         * at all, which is the opposite of the feature.
         * ⚠️ GRID ONLY ABOVE THE md BREAKPOINT: at 390 the grid is `hidden` and the phone card is
         * shown instead, so there is no grid to measure and the picker check covers that width. */
        if (w >= 768) {
          const g1 = matrixGrids[`${w}/${nTypes}/one`], g2 = matrixGrids[`${w}/${nTypes}/match`]
          t(g2 - g1 === EXPECTED_COL_W,
            `🔴 ${w}/${nTypes}: a second van adds EXACTLY one column (grid ${g1} → ${g2}, +${g2 - g1}px, expected +${EXPECTED_COL_W})`)
          t(matrixGrids[`${w}/${nTypes}/match`] === matrixGrids[`${w}/${nTypes}/differ`],
            `🔴 ${w}/${nTypes}: …and the grid is the same width whether the vans agree or not`)
        }
      }

      // ── 2 · THE NEW-TYPE POPUP ────────────────────────────────────────────────────────────────
      await eng.page.goto(write(`newtype-${w}-${eng.name}.html`, newTypeFixture(css)))
      const n = await eng.page.evaluate(probe)
      lines.push(`  newtype ${w}×${h}  popup ${n.popup.width}px · chips ${n.chips.height}px · note clipped: ${n.noteTruncated}`)
      t(!n.pageScrollsSideways, `🔴 newtype ${w}: NO HORIZONTAL PAGE SCROLL`)
      t(n.popup.width <= Math.min(460, w - 32) + 2,
        `🔴 newtype ${w}: the popup fits (${n.popup.width}px)`)
      /* 🔴 THE FOUR CHIPS WRAP RATHER THAN OVERFLOW. At 390 they take two rows; neither may escape. */
      t(n.chips.right <= n.popup.right + 1, `🔴 newtype ${w}: the name chips stay inside the popup`)
      t(n.noteTruncated === false, `🔴 newtype ${w}: "It starts exactly like Standard" is not cut off`)
      t(n.actions.bottom <= n.popup.bottom + 1, `⚠️ newtype ${w}: Cancel / Create sit inside the popup`)

      // ── 3 · THE DASHBOARD CARD ────────────────────────────────────────────────────────────────
      await eng.page.goto(write(`card-${w}-${eng.name}.html`, cardFixture(css, true)))
      const d = await eng.page.evaluate(probe)
      lines.push(`  card ${w}×${h}  ${d.card.width}×${d.card.height} · select ${d.etsel.height}px · warning clipped: ${d.warnTruncated}`)
      t(!d.pageScrollsSideways, `🔴 card ${w}: NO HORIZONTAL PAGE SCROLL`)
      t(d.etsel.right <= d.card.right + 1 && d.offsel.right <= d.card.right + 1,
        `🔴 card ${w}: both selects are inside the card`)
      /* 🔴 40px MINIMUM ON EVERY SELECT. WebKit ignores `min-height` on a `<select>`, which is why the
       * component uses a fixed height — found by this harness at stage 1 and still asserted. */
      t(d.etsel.height >= 40 && d.offsel.height >= 40,
        `🔴 card ${w}: the selects are at least 40px tall (${d.etsel.height}px, ${d.offsel.height}px)`)
      t(d.delaysel.right <= d.card.right + 1, `⚠️ card ${w}: the auto-reject delay is inside the card`)
      /* 🔴 THE SAFETY-CRITICAL ⚠️ INSTRUCTION MUST BE READABLE IN FULL — it is the one piece of copy in
       * this card that costs an operator a service if it is clipped. */
      t(d.warnTruncated === false, `🔴 card ${w}: the ⚠️ offline instruction is not cut off`)
      t(d.cardfooter.right <= d.card.right + 1, `⚠️ card ${w}: "Reset to Festival" is not clipped`)

      // ── 3b · THE CARD FOR A TRUCK WITH NO TYPES — it must still show ──────────────────────────
      await eng.page.goto(write(`card-notypes-${w}-${eng.name}.html`, cardFixture(css, false)))
      const nt = await eng.page.evaluate(probe)
      t(nt.card.height > 0 && !nt.etsel,
        `🔴 card ${w}: a truck with NO event types still gets the card, without the Event type row`)

      /* ══ 📸 SCREENSHOTS ═══════════════════════════════════════════════════════════════════════
       * The brief asks for 1440 AND 390, in BOTH engines, with one van / two matching / two
       * differing. That is six modal shots per engine, twelve in all, plus the four single-surface
       * ones that only need one width.
       *
       * ⚠️ THEY ARE RENDERS OF FIXTURES, NOT CAPTURES OF A RUNNING SCREEN, and the report says so
       * wherever it links them. A real capture needs a database and a live truck, which this harness
       * must never touch. What they show is the layout these classes produce.
       * 🔴 WEBKIT SHOTS ARE NOT DECORATION. The van columns are a grid with a `span` in it, and a
       * `<select>` sizes itself differently in WebKit — the two engines are where a column width
       * actually diverges, so both are kept. */
      if (w === 1440 || w === 390) {
        for (const vanState of ['one', 'match', 'differ']) {
          await eng.page.goto(write(`shot-modal-${w}-${vanState}-${eng.name}.html`, panelFixture(css, 3, false, vanState)))
          await eng.shot(path.join(shotDir, `modal-${w}-${vanState}-${eng.name.toLowerCase()}.png`), 'modal')
        }
        lines.push(`  📸 three modal shots at ${w} (${eng.name}): one van · two matching · two differing`)
      }
      // ── THE SINGLE-SURFACE SHOTS, at 1440 in Chromium (the width the report shows) ─────────────
      if (w === 1440 && eng.name === 'Chromium') {
        await eng.page.goto(write(`shot-after-${eng.name}.html`, cardFixture(css, true)))
        await eng.shot(path.join(shotDir, 'this-event-card-after.png'), 'scope')
        await eng.page.goto(write(`shot-before-${eng.name}.html`, cardFixture(css, true, true)))
        await eng.shot(path.join(shotDir, 'this-event-card-before.png'), 'scope')
        await eng.page.goto(write(`shot-modal-${eng.name}.html`, panelFixture(css, 6)))
        await eng.shot(path.join(shotDir, 'event-types-modal.png'), 'modal')
        await eng.page.goto(write(`shot-newtype-${eng.name}.html`, newTypeFixture(css)))
        await eng.shot(path.join(shotDir, 'new-event-type.png'), 'popup')
        lines.push(`  📸 four single-surface screenshots written to docs/screenshots/event-types/`)
      }
    }

    // ── THE CONTROL: WITHOUT THE SCROLLER, SIX FIXED COLUMNS ARE UNREACHABLE ────────────────────
    /* 🔴 WITHOUT THIS, "the columns scroll" would pass on a grid that was never wider than its box. */
    {
      await eng.setViewport(1440, 900)
      await eng.page.goto(write(`ctl-${eng.name}.html`, panelFixture(css, 6, true)))
      const r = await eng.page.evaluate(probe)
      t(r.gridScrolls === false,
        `🔴 CONTROL: with the scroller removed the six fixed columns are CLIPPED, not scrollable — so the assertions above are real`)
      t(r.grid.width > r.scroller.width,
        `⚠️ CONTROL: …and the grid really is wider than its box (${r.grid.width} > ${r.scroller.width})`)
    }

    await eng.close()
  }

  console.log(lines.join('\n'))
  if (list.every(e => e.skip)) { console.log('\n🔴 NO ENGINE AVAILABLE — nothing was measured'); process.exit(1) }
  console.log(fails ? `\n🔴 ${fails} MEASUREMENT(S) FAILED` : '\n✅ the modal, the new-type popup and the dashboard card measured in every available engine')
  process.exit(fails ? 1 : 0)
}

main().catch(e => { console.log('🔴 the harness threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e)); process.exit(1) })
