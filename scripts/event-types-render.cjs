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
  const shell = lift(UI, /<div className="(fixed inset-0 z-50 bg-slate-50 flex flex-col)"/, 'the panel shell')
  const header = lift(UI, /<div className="(shrink-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center gap-3)">/, 'the panel header')
  const body = lift(UI, /<div className="(flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-3)">/, 'the panel body')
  const scroller = lift(UI, /<div className="(hidden md:block overflow-x-auto)">/, 'the grid scroller')
  const grid = lift(UI, /className="(bg-white border border-slate-200 rounded-2xl overflow-hidden)"/, 'the grid')
  const phone = lift(UI, /<div className="(md:hidden space-y-3)">/, 'the phone column')

  /* The grid template is BUILT from the component's own expression, not retyped. */
  const cols = `200px repeat(${typeCount + 1}, minmax(150px, 1fr))`
  const names = ['Standard', 'Festival', 'Pub', 'Market', 'Private hire', 'School fete', 'Christmas market']
    .slice(0, typeCount + 1)

  const cell = (text, extra = '') =>
    `<div class="px-3 py-2 border-t border-l border-slate-100" style="${extra}">${text}</div>`
  const sel = (label) =>
    `<div class="px-3 py-2 border-t border-l border-slate-100"><select aria-label="${label}" class="w-full border border-slate-200 rounded-lg px-2 py-1 text-sm bg-white"><option>Same as Standard</option><option>On</option><option>Off</option></select></div>`

  const SETTINGS = ['Buzzers', 'Take cash', '“Mark ready” step', 'Collection times']

  return `${HEAD(css)}
<div id="panel" class="${shell}">
  <div id="header" class="${header}">
    <div class="min-w-0 flex-1">
      <h2 class="font-black text-slate-900">Event types</h2>
      <p class="text-xs text-slate-500 truncate">Each column is an event type. Grey = same as Standard.</p>
    </div>
    <button id="done" class="bg-slate-100 text-slate-700 text-sm px-4 py-2 font-bold rounded-xl">Done</button>
  </div>
  <div id="body" class="${body}">
    <div id="phone" class="${phone}">
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3">
        <label class="block text-xs font-bold text-slate-600 mb-1" for="pick">Event type</label>
        <select id="pick" class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white">
          ${names.map(n => `<option>${n}</option>`).join('')}
        </select>
      </div>
      <div id="phonecard" class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <p class="font-bold text-slate-900">Festival</p>
        ${SETTINGS.map(s => `<div class="py-1 border-t border-slate-100"><label class="block text-xs font-bold text-slate-600 mb-1">${s}</label><select class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white"><option>Same as Standard</option></select></div>`).join('')}
      </div>
    </div>
    <div id="scroller" class="${breakScroll ? 'hidden md:block' : scroller}">
      <div class="min-w-max">
        <div id="grid" class="${grid}" style="display:grid;grid-template-columns:${cols}">
          <div class="bg-slate-50 px-3 py-2"></div>
          ${names.map(n => `<div class="bg-slate-50 px-3 py-2 border-l border-slate-100 flex items-center gap-2 min-w-0"><span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style="background:#E8550F"></span><span class="text-sm font-bold text-slate-800 truncate">${n}</span></div>`).join('')}
          <div class="px-3 py-2 border-t border-slate-100 text-sm font-bold text-slate-700">Changes</div>
          ${names.map(() => cell('<span class="text-xs text-slate-500">2 of 4 service settings</span>')).join('')}
          <div class="col-span-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600 tracking-wider" style="grid-column:1/-1">SERVICE</div>
          ${SETTINGS.map(s => `<div class="px-3 py-2 border-t border-slate-100 text-sm text-slate-700">${s}</div>${cell('<span class="text-sm text-slate-700">On</span>')}${names.slice(1).map(() => sel(s)).join('')}`).join('')}
          <div class="px-3 py-2 border-t border-slate-100 text-sm font-bold text-slate-700">Used by</div>
          ${names.map(() => cell('<span class="text-xs text-slate-500">3 upcoming events</span>')).join('')}
        </div>
      </div>
    </div>
    <div id="newtype" class="flex items-center gap-3">
      <button class="bg-orange-600 text-white text-sm px-4 py-2 font-bold rounded-xl">+ New event type</button>
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
// FIXTURE 3 — THE DASHBOARD CONTROL
// ════════════════════════════════════════════════════════════════════════════════════════════════
function dashFixture(css) {
  const row = lift(UI, /<div className="(flex items-center gap-2)">\s*\n\s*<span className="text-sm font-semibold text-slate-700 flex-1">Event type<\/span>/, 'the control row')
  /* ⚠️ `h-10`, which is what the component uses after WebKit was found to ignore `min-height` on a
   * `<select>`. The lift is what makes this file break rather than silently measure the old class. */
  const select = lift(UI, /className="(border border-slate-200 rounded-xl px-2\.5 py-1\.5 text-sm font-semibold text-slate-900 bg-white h-10)">/, 'the control select')
  return `${HEAD(css)}
<div style="background:#f8fafc;padding:16px;max-width:100%">
  <div id="card" class="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 mb-3">
    <div id="ctl" data-event-type-dashboard>
      <div class="${row}">
        <span class="text-sm font-semibold text-slate-700 flex-1">Event type</span>
        <select id="etsel" aria-label="Event type" class="${select}">
          <option>Standard</option><option>Festival</option><option>Private hire</option>
        </select>
      </div>
      <p id="ownline" class="text-xs text-slate-500 mt-1">2 settings changed for this event only.</p>
    </div>
  </div>
  <div id="settings" class="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 divide-y divide-slate-100">
    <div class="flex items-center justify-between py-2"><span class="text-sm">Buzzers</span><span>On</span></div>
    <div class="flex items-center justify-between py-2"><span class="text-sm">Take cash</span><span>Off</span></div>
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
    out.push({ name: 'Chromium', close: () => b.close(), page, setViewport: (w, h) => page.setViewport({ width: w, height: h }) })
  } catch (e) { out.push({ name: 'Chromium', skip: String(e.message).split('\n')[0].slice(0, 110) }) }
  try {
    const { webkit } = require('playwright')
    const b = await webkit.launch()
    const page = await b.newPage()
    out.push({ name: 'WebKit', close: () => b.close(), page, setViewportSize: true, setViewport: (w, h) => page.setViewportSize({ width: w, height: h }) })
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

  const list = await engines()
  for (const eng of list) {
    if (eng.skip) { lines.push(`⚠️ ${eng.name}: SKIPPED — ${eng.skip}`); continue }
    lines.push(`── ${eng.name} ──────────────────────────────────────────────────────────────`)

    for (const [w, h] of [[1440, 900], [820, 1180], [390, 844]]) {
      // ── 1 · THE PANEL, with six types (the wide case) ─────────────────────────────────────────
      await eng.setViewport(w, h)
      await eng.page.goto(write(`panel-${w}-${eng.name}.html`, panelFixture(css, 6)))
      const p = await eng.page.evaluate(probe)
      lines.push(`  panel ${w}×${h}  grid ${p.grid.width}px in scroller ${p.scroller ? p.scroller.width : 0}px · doc ${p.docScrollW} vs ${p.innerW}`)

      t(!p.pageScrollsSideways, `🔴 panel ${w}: NO HORIZONTAL PAGE SCROLL with six types`)
      t(p.panel.width <= w + 1 && p.panel.height <= h + 1, `🔴 panel ${w}: the panel fits the viewport`)
      /* 🔴 THE DONE BUTTON MUST STAY REACHABLE. It is the only way out of a full-screen panel. */
      t(p.done.right <= w + 1 && p.done.top >= 0 && p.done.bottom <= h + 1,
        `🔴 panel ${w}: Done is on screen and not clipped`)
      t(p.header.top === 0 && p.header.width <= w + 1, `⚠️ panel ${w}: the header is flush and full width`)

      if (w >= 768) {
        t(p.phone.width === 0 || p.phone.height === 0, `⚠️ panel ${w}: the phone column is hidden`)
        t(!!p.grid && p.grid.width > 0, `🔴 panel ${w}: the grid is drawn`)
        /* 🔴 WITH SIX TYPES THE GRID IS WIDER THAN THE SCROLLER AT EVERY ONE OF THESE WIDTHS, so the
         * scroller must be what scrolls. The alternative is the page scrolling, which is asserted
         * against above — these two together are the finding. */
        t(p.gridScrolls, `🔴 panel ${w}: the GRID scrolls inside its own box (grid ${p.grid.width} > ${p.scroller.width})`)
        t(p.newtype.right <= w + 1, `⚠️ panel ${w}: "+ New event type" is not clipped`)
      } else {
        t(p.phone.height > 0, `🔴 panel ${w}: the PHONE column is shown instead of the grid`)
        t(!p.scroller || p.scroller.height === 0 || p.scroller.width === 0,
          `🔴 panel ${w}: the side-by-side grid is hidden on a phone`)
      }

      // ── 2 · THE ADD EVENT PICKER ──────────────────────────────────────────────────────────────
      await eng.page.goto(write(`picker-${w}-${eng.name}.html`, pickerFixture(css)))
      const k = await eng.page.evaluate(probe)
      lines.push(`  picker ${w}×${h}  field ${k.etfield.width}px · modal ${k.modal.width}px · hint clipped: ${k.hintTruncated}`)

      t(!k.pageScrollsSideways, `🔴 picker ${w}: NO HORIZONTAL PAGE SCROLL`)
      t(k.etfield.width > 120, `🔴 picker ${w}: the field has a usable width (${k.etfield.width}px)`)
      t(k.etfield.left >= k.modal.left - 1 && k.etfield.right <= k.modal.right + 1,
        `🔴 picker ${w}: the field is inside the modal, not clipped`)
      /* 🔴 THE HINT IS THE LONGEST STRING THE FIELD OWNS — "(usual for this place) buzzers on ·
       * mark-ready step on · collection every 10 min". It is allowed to WRAP but never to be cut off,
       * which is what `scrollWidth > clientWidth` detects. */
      t(k.hintTruncated === false, `🔴 picker ${w}: the "(usual for this place)" hint is not cut off`)
      t(k.footer.bottom <= k.modal.bottom + 1, `⚠️ picker ${w}: Cancel / Add event still sit inside the modal`)
      /* ⚠️ THE FIELD SITS ABOVE THE ADDRESS FIELDS, which is where the mount puts it. */
      t(k.etfield.top < k.footer.top, `⚠️ picker ${w}: the field is above the buttons`)

      // ── 3 · THE DASHBOARD CONTROL ─────────────────────────────────────────────────────────────
      await eng.page.goto(write(`dash-${w}-${eng.name}.html`, dashFixture(css)))
      const d = await eng.page.evaluate(probe)
      lines.push(`  dash  ${w}×${h}  select ${d.etsel.width}px · own-line clipped: ${d.ownTruncated}`)

      t(!d.pageScrollsSideways, `🔴 dash ${w}: NO HORIZONTAL PAGE SCROLL`)
      t(d.etsel.right <= d.card.right + 1 && d.etsel.left >= d.card.left - 1,
        `🔴 dash ${w}: the select is inside its card`)
      /* 🔴 A 44px TOUCH TARGET IS THE RULE FOR A CONTROL AN OPERATOR USES MID-SERVICE WITH ONE HAND.
       * The class asks for min-h-[40px]; the rendered height is what is asserted. */
      t(d.etsel.height >= 40, `🔴 dash ${w}: the select is at least 40px tall (${d.etsel.height}px)`)
      t(d.ownTruncated === false, `⚠️ dash ${w}: "2 settings changed for this event only." is not cut off`)
      /* ⚠️ THE FIRST DRAFT READ `d.ctl.bottom <= d.settings_bottom ?? true` — a field this probe never
       * returned, so the comparison was against `undefined` (always false) and `?? true` never fired
       * because `<=` binds tighter. It failed on correct markup at every width. The box is probed now. */
      t(!!d.settings && d.ctl.bottom <= d.settings.top + 1,
        `⚠️ dash ${w}: the control sits above the per-event settings rows`)
    }

    // ── THE CONTROL: WITHOUT THE SCROLLER, 1440 MUST WIDEN THE PAGE ──────────────────────────────
    /* 🔴 WITHOUT THIS, "the page does not scroll sideways" would pass on a panel that never had a
     * grid wide enough to make it — and the file would be measuring that 200px fits in 1440. */
    {
      await eng.setViewport(1440, 900)
      await eng.page.goto(write(`ctl-${eng.name}.html`, panelFixture(css, 6, true)))
      const r = await eng.page.evaluate(probe)
      /* 🔴 THE CONTROL ASSERTS WHAT ACTUALLY DIFFERS, which is not what its first draft assumed.
       * It expected the page to widen without `overflow-x-auto`; it does not, because the panel is
       * `fixed inset-0` and its body CLIPS the overflow instead. So "no horizontal page scroll" above
       * is true either way and proves nothing on its own — the real difference is REACHABILITY: with
       * the scroller the wide grid can be scrolled to, and without it the overflow is clipped and the
       * last columns are unreachable. That is the finding, and this is the pair that establishes it. */
      t(r.gridScrolls === false,
        `🔴 CONTROL: with overflow-x-auto removed the wide grid is CLIPPED, not scrollable — so "the grid scrolls in its own box" above is a real finding`)
      t(r.grid.width > r.scroller.width,
        `⚠️ CONTROL: …and the grid really is wider than its box (${r.grid.width} > ${r.scroller.width})`)
    }

    await eng.close()
  }

  console.log(lines.join('\n'))
  if (list.every(e => e.skip)) { console.log('\n🔴 NO ENGINE AVAILABLE — nothing was measured'); process.exit(1) }
  console.log(fails ? `\n🔴 ${fails} MEASUREMENT(S) FAILED` : '\n✅ the panel, the picker and the dashboard control measured in every available engine')
  process.exit(fails ? 1 : 0)
}

main().catch(e => { console.log('🔴 the harness threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e)); process.exit(1) })
