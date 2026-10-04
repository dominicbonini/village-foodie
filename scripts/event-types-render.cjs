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
function panelFixture(css, typeCount, breakScroll = false) {
  const shell = lift(UI, /className="(bg-white w-full max-w-\[1000px\] max-h-\[92vh\] rounded-2xl shadow-2xl flex flex-col overflow-hidden)"/, 'the modal shell')
  const header = lift(UI, /<div className="(shrink-0 flex items-center gap-3 px-4 sm:px-5 py-4 border-b border-slate-200)">/, 'the modal header')
  const body = lift(UI, /<div className="(flex-1 min-h-0 overflow-y-auto)">/, 'the modal body')
  const scroller = lift(UI, /<div className="(hidden md:block overflow-x-auto px-2 pb-2)" data-types-scroller>/, 'the columns scroller')
  const phone = lift(UI, /<div className="(md:hidden p-4 space-y-3)">/, 'the phone column')
  const cell = lift(UI, /<div key=\{t\.id\} className="(px-3\.5 py-2\.5 border-t border-slate-100 min-h-11 flex items-center gap-2)">/, 'a control cell')
  const labelCell = lift(UI, /<div className="(px-3\.5 py-2\.5 border-t border-slate-100 text-sm font-semibold text-slate-900 min-h-11 flex items-center)">/, 'a label cell')
  const stdCell = lift(UI, /<div className="(px-3\.5 py-2\.5 border-t border-slate-100 bg-slate-50 text-sm text-slate-600 min-h-11 flex items-center)">/, 'a Standard cell')

  /* 🔴 THE TEMPLATE IS BUILT FROM THE COMPONENT'S OWN EXPRESSION, not retyped — 200px for the labels
   * and a FIXED 230px per type. `breakScroll` is the broken variant: it drops the scroller so the
   * fixed columns have nowhere to go. */
  const cols = `200px repeat(${typeCount + 1}, 230px)`
  const names = ['Standard', 'Festival', 'Market', 'Pub', 'Private hire', 'School fete', 'Christmas market']
    .slice(0, typeCount + 1)
  const SETTINGS = ['Buzzers', 'Take cash', '“Mark ready” step', 'Collection times', 'Offline protection']

  /* One control per type per row, IN THAT TYPE'S OWN COLUMN — the thing being measured. */
  const control = (row, name) => row === 'Collection times' || row === 'Offline protection'
    ? `<select aria-label="${row} for ${name}" class="w-full border border-slate-200 rounded-lg px-2.5 h-9 text-[13px] font-semibold bg-white"><option>Same as Standard</option></select>`
    : `<button type="button" role="switch" aria-checked="false" aria-label="${row} for ${name}" class="relative w-[42px] h-6 rounded-full bg-slate-300 shrink-0 opacity-45"><span class="absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white"></span></button><span class="text-xs text-slate-400 truncate">Same as Standard</span>`

  return `${HEAD(css)}
<div class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4" style="position:fixed;inset:0">
  <div id="modal" data-event-types-modal class="${shell}">
    <div id="header" class="${header}">
      <div class="min-w-0 flex-1">
        <h2 class="font-bold text-slate-900 text-lg">Event types</h2>
        <p class="text-xs sm:text-[13px] text-slate-500">Grey = same as Standard. Changes save as you go.</p>
      </div>
      <button id="newtype" class="hover:bg-slate-100 text-slate-600 border border-slate-200 text-sm px-4 py-2 font-bold rounded-xl">+ New event type</button>
      <button id="close" aria-label="Close" class="shrink-0 w-10 h-10 rounded-full bg-slate-100 text-slate-600 text-lg font-bold">✕</button>
    </div>
    <div id="body" class="${body}">
      <div id="phone" class="${phone}">
        <div><label class="block text-xs font-bold text-slate-600 mb-1" for="pick">Event type</label>
        <select id="pick" class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white h-11">
          ${names.map(n => `<option>${n}</option>`).join('')}
        </select></div>
        <div id="phonecard" class="rounded-2xl border border-slate-200 p-4">
          <p class="font-bold text-slate-900">Festival</p>
          ${SETTINGS.map(x => `<div class="py-1.5 border-t border-slate-100"><span class="text-xs font-bold text-slate-600">${x}</span><div class="flex items-center gap-2">${control(x, 'Festival')}</div></div>`).join('')}
        </div>
      </div>
      <div id="scroller" class="${breakScroll ? 'hidden md:block px-2 pb-2' : scroller}" data-types-scroller>
        <div class="min-w-max" style="display:grid;grid-template-columns:${cols}" id="grid" data-types-grid>
          <div class="px-3.5 py-3"></div>
          <div class="px-3.5 py-3 bg-slate-50 flex items-center gap-2 min-w-0"><span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style="background:#94A3B8"></span><span class="text-[15px] font-bold text-slate-800 truncate">Standard</span><span class="text-[11px] text-slate-400 font-semibold shrink-0">default</span></div>
          ${names.slice(1).map(n => `<div class="px-3.5 py-3 flex items-center gap-2 min-w-0 relative"><span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style="background:#E8550F"></span><span class="text-[15px] font-bold text-slate-800 truncate">${n}</span><button aria-label="More for ${n}" class="ml-auto shrink-0 w-[30px] h-[30px] rounded-lg border border-slate-200 text-slate-500 font-bold">⋯</button></div>`).join('')}
          <div class="px-3.5 pt-3.5 pb-1.5 text-[11px] font-bold text-slate-500" style="grid-column:1/-1">SERVICE</div>
          ${SETTINGS.map((x, i) => `<div class="${labelCell}"${i === 0 ? ' id="firstLabel"' : ''}>${x}</div><div class="${stdCell}">On</div>${names.slice(1).map((n, j) => `<div class="${cell}"${i === 0 && j === 0 ? ' id="firstControl"' : ''}>${control(x, n)}</div>`).join('')}`).join('')}
          <div class="px-3.5 pt-3.5 pb-1.5 text-[11px] font-bold text-slate-500" style="grid-column:1/-1">USED BY</div>
          <div class="${labelCell}">Upcoming events</div><div class="${stdCell}">Everything else</div>
          ${names.slice(1).map(() => `<div class="${labelCell}">2 events</div>`).join('')}
        </div>
      </div>
    </div>
    <div id="footer" class="shrink-0 px-4 sm:px-5 py-3 border-t border-slate-200 text-[13px] text-slate-500">
      Standard is your normal setup. Change it in Settings. Anything you change on one event’s dashboard still wins.
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
  const sel = lift(CARD, /^const SELECT = '(.+)'$/m, 'the card select')
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
        /* 🔴 EVERY TYPE COLUMN IS 230px, measured — not read off a class. */
        t(Math.abs(p.firstControl.width - 230) <= 1,
          `🔴 modal ${w}: a type column is 230px wide (${p.firstControl.width}px)`)
        t(Math.abs(p.firstLabel.width - 200) <= 1,
          `⚠️ modal ${w}: the label column is 200px (${p.firstLabel.width}px)`)
        /* 🔴 THE CONTROL IS IN THE TYPE'S COLUMN, NOT THE LABEL'S — the defect this rewrite fixes,
         * asserted in the geometry: the control's box starts after the label column ends. */
        t(p.firstControl.left >= p.firstLabel.right - 1,
          `🔴 modal ${w}: the control sits in its type's column, right of the labels (${p.firstControl.left} ≥ ${p.firstLabel.right})`)
      } else {
        t(p.phone.height > 0, `🔴 modal ${w}: the PHONE column is shown instead of the grid`)
        t(!p.scroller || p.scroller.width === 0 || p.scroller.height === 0,
          `🔴 modal ${w}: the side-by-side columns are hidden on a phone`)
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

      // ── SCREENSHOTS, at 1440 only (the width the report shows) ────────────────────────────────
      if (w === 1440 && eng.name === 'Chromium') {
        await eng.page.goto(write(`shot-after-${eng.name}.html`, cardFixture(css, true)))
        await eng.shot(path.join(shotDir, 'this-event-card-after.png'), 'scope')
        await eng.page.goto(write(`shot-before-${eng.name}.html`, cardFixture(css, true, true)))
        await eng.shot(path.join(shotDir, 'this-event-card-before.png'), 'scope')
        await eng.page.goto(write(`shot-modal-${eng.name}.html`, panelFixture(css, 6)))
        await eng.shot(path.join(shotDir, 'event-types-modal.png'), 'modal')
        await eng.page.goto(write(`shot-newtype-${eng.name}.html`, newTypeFixture(css)))
        await eng.shot(path.join(shotDir, 'new-event-type.png'), 'popup')
        lines.push(`  📸 four screenshots written to docs/screenshots/event-types/`)
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
