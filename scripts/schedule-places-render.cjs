#!/usr/bin/env node
// scripts/schedule-places-render.cjs — the Schedule sub-tabs, Places and the Add event modal, MEASURED.
//   node scripts/schedule-places-render.cjs      (needs `npx next build` first)
//
// 🔴 WHY A MEASUREMENT AND NOT A CLASS-NAME CENSUS. The brief's layout requirement is "must work at
// phone width (list above detail, stacked)", and a class census cannot answer it: it can see
// `lg:grid-cols-[18rem_1fr]` in the source and still be wrong about what a layout engine does with
// it. The outreach workspace shipped three layout bugs past exactly that kind of check — an inline
// `gridTemplateColumns` beating a responsive class, a grid item landing on the wrong row, and
// `field-sizing: content` collapsing a box — and all three needed a browser to see.
//
// 🔴 WEBKIT AS WELL AS CHROMIUM, BECAUSE THE DEVICE IS AN iPAD AND THE BROWSER IS SAFARI. An
// operator uses this at the hatch on a phone and in the van on an iPad; on iOS every browser is
// WebKit. A Chromium-only run is how a one-line notes box shipped once already. WebKit comes from
// Playwright, Chromium from the puppeteer already in the repo. Either missing ⇒ that engine is
// SKIPPED AND SAID SO, never silently passed.
//
// ⚠️ IT IS NOT THE PAGE, AND SAYS SO. There is no operator session and no database here, so the real
// route cannot be rendered. What is rendered is the component's OWN class names — lifted out of the
// source by the regexes below, so the fixture cannot drift without this file failing — against THIS
// build's compiled stylesheet, with filler where the content goes.
// ⚠️ NO NETWORK: file:// pages, the app's own CSS, and local browser builds.

const fs = require('fs')
const path = require('path')
const os = require('os')

const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const TAB = read('components/manage/SchedulePlaces.tsx')
const PAGE = read('app/manage/[token]/page.tsx')
const PLACES = read('components/manage/SchedulePlaces.tsx')

/** Lift one class string out of the real source, or fail — the fixture is only worth as much as its
 *  agreement with the component. */
function lift(src, re, what) {
  const m = src.match(re)
  if (!m) throw new Error(`the fixture cannot be built: no ${what} found in the source`)
  return m[1]
}

// ── THE APP'S OWN STYLESHEET ────────────────────────────────────────────────────────────────────────
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
  // 🔴 THE STALENESS CHECK. Tailwind only emits the classes it finds in the source, so a build from
  // before this component existed has no rule for its grid — and the fixture would then lay out as a
  // single column at EVERY width and report the phone case passing for the wrong reason.
  if (!/380px_minmax/.test(css)) {
    throw new Error('the compiled CSS has no `md:grid-cols-[380px_minmax(0,1fr)]` rule — the build predates this modal; run `npx next build`')
  }
  return css
}

/* 🔴 THE VIEWPORT META IS NOT DECORATION. Without it a mobile emulation lays out at the engine's
 * default 980px layout viewport, and the phone assertions would be measuring a tablet. The app
 * declares the same thing in app/layout.tsx. */
const HEAD = css => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>
<style>body{margin:0}</style></head><body>`

const filler = (label, h) =>
  `<div style="height:${h}px;background:#eef2f7;border:1px solid #cbd5e1;border-radius:12px">${label}</div>`

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE FIXTURE — the two panes, from the component's own classes
// ════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * @param oneCol 🔴 THE CONTROL: the same markup with the responsive grid replaced by a plain
 *               `grid-cols-1`. It is here so the measurement can be shown to TELL THE TWO APART — a
 *               fixture that only ever renders the correct structure proves the fixture can be built,
 *               not that the component is right.
 */
/**
 * THE ADD EVENT MODAL. Real class names lifted from the page, filler where the content goes.
 *
 * 🔴 THE SHELL IS THE POINT OF THIS FIXTURE. The question is not only "do the two panes sit side by
 * side" but "is the footer on screen without scrolling" — and that is a flex-column + `shrink-0`
 * property, which only a layout engine can answer.
 *
 * @param oneCol      the control: the responsive grid replaced by a single column, which must
 *                    measure differently at 1440 or the side-by-side assertions prove nothing.
 * @param placeCount  how many places the list holds. 40 is the long-list case.
 * @param breakScroll THE BROKEN VARIANT: drops `md:h-[90vh]` from the shell, which is the fix. The
 *                    modal's height goes back to being MAX-only and therefore indefinite, `h-full`
 *                    below it stops resolving, and the pane sizes to its content again.
 */
function fixture(css, oneCol = false, placeCount = 6, breakScroll = false) {
  const shell = lift(PAGE, /className=\{`(bg-white w-full shadow-2xl flex flex-col min-h-0 overflow-x-hidden)/, 'the modal shell')
  /* 🔴 THE FOUR CLASS STRINGS THE SCROLL DEPENDS ON, LIFTED FROM THE REAL SOURCE so the fixture
   * cannot quietly disagree with the pane it claims to measure. `breakScroll` is the broken variant:
   * it drops `min-h-0` from the wrapper between the pane and the list, which is the one class that
   * lets a flex child be shorter than its content. */
  /* 🔴 THE TWO-PANE HEIGHT CLASS, LIFTED FROM THE SOURCE — not typed into this fixture. The first
   * draft hardcoded the shell's height classes, so after `md:h-[90vh]` was added to the page the
   * fixture went on measuring the OLD shell and the bug "still reproduced" on fixed code. Anything
   * the measurement depends on comes out of the real file. */
  const pickerHeight = lift(PAGE, /\$\{showPicker \? '(md:h-\[90vh\])' : ''\}/, 'the two-pane modal height')
  const leftPane = lift(PAGE, /<div className=\{`(min-h-0 md:h-full md:border md:border-slate-200 md:rounded-2xl md:overflow-hidden flex flex-col)/, 'the left pane')
  const listWrap = lift(PAGE, /<div className="(flex-1 min-h-0)">\s*\n\s*<PlaceList/, 'the PlaceList wrapper')
  const listRoot = lift(PLACES, /<div className="(flex flex-col min-h-0 h-full)">/, 'the PlaceList root')
  const listScroll = lift(PLACES, /<div className="(flex-1 min-h-0 overflow-y-auto) px-3 pb-2">/, 'the list scroller')
  const body = lift(PAGE, /className=\{`(flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y) px-5/, 'the scrolling body')
  const twoPane = lift(PAGE, /\$\{\s*\n?\s*showPicker \? '(md:grid md:grid-cols-\[380px_minmax\(0,1fr\)\] md:gap-5)' : ''\}/, 'the two-pane grid')
  const footer = lift(PAGE, /<div className="(shrink-0 border-t border-slate-200 bg-white px-5 sm:px-6 py-3)/, 'the sticky footer')
  const form = lift(PAGE, /<div id="add-event-form" className="(grid grid-cols-1 sm:grid-cols-2 gap-3)">/, 'the form grid')
  const grid = oneCol ? '' : twoPane

  const field = (label, h = 56) => `<div>${filler(label, h)}</div>`
  return `${HEAD(css)}<script>window.__placeCount=${placeCount}</script>
<div class="fixed inset-0" style="background:rgba(0,0,0,.6);display:flex;align-items:stretch;justify-content:center">
  <div id="modal" class="${shell} max-sm:h-dvh sm:rounded-2xl sm:max-h-[90vh] ${breakScroll ? '' : pickerHeight} md:max-w-[1040px]" style="margin:auto">

    <div id="header" class="shrink-0 flex items-center gap-3 px-5 sm:px-6 pt-5 sm:pt-6 pb-3">
      <h3 style="font-weight:900;flex:1 1 0%;min-width:0">Add event</h3>
      <div id="switch" class="shrink-0 flex rounded-xl bg-slate-100 p-0.5">
        <button style="padding:6px 12px;border-radius:10px;white-space:nowrap;background:#fff">One event</button>
        <button style="padding:6px 12px;border-radius:10px;white-space:nowrap">Upload schedule</button>
      </div>
      <button id="close" aria-label="Close" class="shrink-0 w-8 h-8 rounded-full bg-slate-100" style="line-height:1">×</button>
    </div>

    <div id="body" class="${body} px-5 sm:px-6 pb-4 md:overflow-hidden">
      <div id="panes" class="min-h-0 h-full ${grid}">
        <div id="left" class="${leftPane}">
          <div class="${listWrap}">
          <div id="listRoot" class="${listRoot}">
            <div id="listSearch" class="p-3 pb-2 shrink-0">${filler('search places', 56)}</div>
            <div id="listScroll" class="${listScroll}">
              <ul style="margin:0;padding:0;list-style:none">
                ${Array.from({ length: placeCount }, (_, i) =>
                  `<li id="place-${i}" style="height:44px;border-bottom:1px solid #f1f5f9;font-size:12px;padding:4px 8px">Place ${i + 1}</li>`).join('')}
              </ul>
            </div>
            <div id="leftFooter" class="shrink-0 border-t border-slate-100 p-3" style="display:flex;justify-content:space-between;gap:12px">
              <span style="font-size:12px;font-weight:700;white-space:nowrap">+ New place</span>
              <span style="font-size:12px;font-weight:700;white-space:nowrap">Tidy up places</span>
            </div>
          </div>
          </div>
        </div>
        <div id="right" class="min-w-0 md:h-full md:overflow-y-auto md:pr-1">
          <div id="form" class="${form}">
            <div class="sm:col-span-2 max-md:order-1">${filler('Date', 56)}</div>
            <div class="md:contents max-md:order-5">
              <button id="addrToggle" class="md:hidden w-full" style="border:1px solid #e2e8f0;border-radius:12px;padding:8px 12px;text-align:left">Address details ▶</button>
              <div id="addrFields" class="md:contents max-md:hidden">
                <div class="sm:col-span-2">${filler('Venue name', 56)}</div>
                <div class="sm:col-span-2">${filler('Full address', 56)}</div>
                ${field('Area')}
                ${field('Postcode')}
              </div>
            </div>
            <div id="times" class="sm:col-span-2 max-md:order-2 grid grid-cols-2 gap-2">${filler('Start', 56)}${filler('End', 56)}</div>
            <div class="sm:col-span-2 max-md:order-3">${filler('Truck', 56)}</div>
            <div class="sm:col-span-2 max-md:order-4">${filler('Notes', 56)}</div>
          </div>
        </div>
      </div>
    </div>

    <div id="footer" class="${footer}" style="display:flex;align-items:center;gap:12px">
      <p id="filledFrom" style="flex:1 1 0%;min-width:0;font-size:12px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Filled from Lavenham Village Hall</p>
      <div class="shrink-0" style="display:flex;gap:8px">
        <span style="padding:8px 16px;border-radius:12px;background:#f1f5f9;white-space:nowrap">Cancel</span>
        <span style="padding:8px 16px;border-radius:12px;background:#ea580c;color:#fff;white-space:nowrap">Add event</span>
      </div>
    </div>
  </div>
</div></body></html>`
}

/**
 * THE MENU PILL ROW. Three pills in the same treatment Schedule's use.
 * 🔴 THE QUESTION IS THE SAME ONE: do they scroll INSIDE their row, or widen the page? Measured with
 * the real class strings, and with a six-pill control at 320px where the row genuinely overflows.
 */
function menuPillFixture(css, pillCount = 3) {
  const row = lift(PAGE, /className="(min-w-0 overflow-x-auto -mx-1 px-1 pb-1 mb-4)"/, 'the pill row')
  const inner = lift(PAGE, /<div className="(flex gap-2 w-max)">/, 'the pill row inner')
  const labels = ['Items', 'Extras & upsells', 'Deals', 'Fourth section', 'Fifth section', 'Sixth section']
  return `${HEAD(css)}
<div style="max-width:1024px;margin:0 auto;padding:0 16px">
  <div id="menuPills" class="${row}">
    <div class="${inner}">
      ${labels.slice(0, pillCount).map((l, i) =>
        `<button style="padding:6px 14px;border-radius:9999px;white-space:nowrap;background:${i === 0 ? '#0f172a;color:#fff' : '#f1f5f9'}">${l}</button>`).join('')}
    </div>
  </div>
  <div id="menuBody">${filler('the selected section', 400)}</div>
</div></body></html>`
}

const rects = () => {
  const ids = ['modal', 'header', 'switch', 'close', 'body', 'panes', 'left', 'leftFooter',
    'right', 'form', 'times', 'footer', 'filledFrom', 'addrToggle', 'addrFields',
    'listRoot', 'listSearch', 'listScroll']
  const out = {}
  for (const id of ids) {
    const el = document.getElementById(id)
    if (!el) { out[id] = null; continue }
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    out[id] = {
      top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right),
      width: Math.round(r.width), height: Math.round(r.height), bottom: Math.round(r.bottom),
      visible: r.width > 0 && r.height > 0 && cs.display !== 'none',
      display: cs.display,
    }
  }
  out.docScrollW = document.documentElement.scrollWidth
  out.innerW = window.innerWidth
  out.innerH = window.innerHeight
  const mp = document.getElementById('menuPills')
  if (mp) {
    const innerEl = mp.firstElementChild
    out.menuPills = {
      rowW: Math.round(mp.clientWidth), contentW: Math.round(mp.scrollWidth),
      rows: innerEl ? [...new Set([...innerEl.children].map(k => Math.round(k.getBoundingClientRect().top)))].length : 0,
      width: Math.round(mp.getBoundingClientRect().width),
    }
  } else { out.menuPills = null }
  /* 🔴 IS THE FOOTER ON SCREEN WITHOUT SCROLLING? The modal is a flex column, so the footer sits
   * inside the viewport iff the modal does. Measured, not assumed.
   * ⚠️ EVERY MODAL METRIC IS GUARDED. `rects` is shared with the menu-pill fixture, which has none of
   * these elements — unguarded, it threw on the first run and the whole file reported one error
   * instead of a measurement. */
  const fEl = document.getElementById('footer')
  out.footerOnScreen = fEl ? (fEl.getBoundingClientRect().bottom <= window.innerHeight + 1
    && fEl.getBoundingClientRect().top >= -1) : null
  const b = document.getElementById('body')
  out.bodyScrolls = b ? b.scrollHeight > b.clientHeight + 1 : null
  const m = document.getElementById('modal')
  out.modalScrolls = m ? m.scrollHeight > m.clientHeight + 1 : null
  const rowsOf = (id) => {
    const el = document.getElementById(id)
    if (!el) return 0
    return [...new Set([...el.children].map(k => Math.round(k.getBoundingClientRect().top)))].length
  }
  /* ⚠️ `rowsOf('form')` COUNTS DOM CHILDREN, NOT VISUAL ROWS — the address wrapper is
   * `display: contents`, so it is one child holding four fields. It is kept for the log line only.
   * The claim worth asserting is the PAIRING: Area and Postcode share a row from `sm`, and each take
   * their own below it. That is measured directly from the two fields' tops. */
  /* ── 🔴 CAN THE LAST PLACE BE REACHED? ────────────────────────────────────────────────────────
   * Three separate facts, because "it looks cut off" can mean three different things:
   *   • the SCROLLER overflows its box at all (`listOverflows`) — if not, there is nothing to scroll;
   *   • scrolling it to the bottom actually brings the last row inside the pane (`lastReachable`);
   *   • and the PAGE did not grow instead (`docScrollW`/the modal height assertions elsewhere).
   * A pane that simply grew tall enough to show 40 places would pass a naive "is the last row
   * visible" check while pushing the footer off the screen, which is the bug. */
  const sc = document.getElementById('listScroll')
  const paneEl = document.getElementById('left')
  if (sc && paneEl && m) {
    out.listOverflows = sc.scrollHeight > sc.clientHeight + 1
    sc.scrollTop = sc.scrollHeight          // scroll the pane's own list to the bottom
    const last = document.getElementById('place-' + (window.__placeCount - 1))
    const pr = paneEl.getBoundingClientRect()
    const lr = last ? last.getBoundingClientRect() : null
    /* 🔴 INSIDE THE PANE **AND** INSIDE THE MODAL. An earlier draft checked only the pane — and the
     * bug made the PANE 1881px tall inside an 810px modal, so the last row sat inside the pane while
     * being clipped out of sight by the modal. The metric passed on the broken layout. */
    const mr = m.getBoundingClientRect()
    out.lastReachable = !!lr
      && lr.top >= pr.top - 1 && lr.bottom <= pr.bottom + 1
      && lr.top >= mr.top - 1 && lr.bottom <= mr.bottom + 1
    out.modalH = Math.round(mr.height)
    out.paneH = Math.round(pr.height)
    out.scrollerH = Math.round(sc.clientHeight)
    out.contentH = Math.round(sc.scrollHeight)
    sc.scrollTop = 0
  } else {
    out.listOverflows = null; out.lastReachable = null
  }
  out.formRows = document.getElementById('form') ? rowsOf('form') : 0
  const labelled = (name) => [...document.querySelectorAll('#form [style*="height"]')]
    .find(el => el.textContent.trim().startsWith(name))
  const areaEl = labelled('Area'), pcEl = labelled('Postcode')
  out.areaPostcodeSameRow = !!areaEl && !!pcEl
    && Math.round(areaEl.getBoundingClientRect().top) === Math.round(pcEl.getBoundingClientRect().top)
    && areaEl.getBoundingClientRect().width > 0
  // The form's visual field order, top to bottom — how the two layouts are told apart.
  /* ⚠️ HIDDEN FIELDS ARE EXCLUDED. A `display: none` element reports a zero rect at top 0, so the
   * collapsed address fields sorted to the FRONT of this list and the phone order read
   * "Venue, Address, Area, Postcode, Date, …". The order being measured is the VISUAL one. */
  out.fieldOrder = [...document.querySelectorAll('#form [style*="height"]')]
    .map(el => ({ r: el.getBoundingClientRect(), label: el.textContent.trim() }))
    .filter(x => x.r.width > 0 && x.r.height > 0)
    .sort((a, b) => a.r.top - b.r.top || a.r.left - b.r.left)
    .map(x => x.label)
  return out
}

// ── THE ENGINES ─────────────────────────────────────────────────────────────────────────────────────
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
    out.push({ name: 'WebKit', close: () => b.close(), page, setViewport: (w, h) => page.setViewportSize({ width: w, height: h }) })
  } catch (e) { out.push({ name: 'WebKit', skip: String(e.message).split('\n')[0].slice(0, 110) }) }
  return out
}

async function measure() {
  const lines = []
  let fails = 0
  const t = (ok, label) => { lines.push(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }

  const css = appCss()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-sg-render-'))
  const write = (name, html) => { const f = path.join(tmp, name); fs.writeFileSync(f, html); return 'file://' + f }

  const list = await engines()
  let measured = 0
  for (const eng of list) {
    if (eng.skip) { lines.push(`⚠️ ${eng.name}: SKIPPED — ${eng.skip}`); continue }
    measured++
    lines.push(`── ${eng.name} ──────────────────────────────────────────────────────────`)

    for (const [w, h, label] of [[1440, 900, 'desktop'], [820, 1180, 'iPad portrait'], [390, 844, 'phone']]) {
      await eng.setViewport(w, h)
      await eng.page.goto(write(`m-${w}-${eng.name}.html`, fixture(css)))
      const r = await eng.page.evaluate(rects)
      lines.push(`  ${w}×${h} (${label})  modal ${r.modal.width}×${r.modal.height} · left ${r.left.width}@x${r.left.left} · right ${r.right.width}@x${r.right.left} · footer@${r.footer.top} · form rows ${r.formRows}`)

      // ── THE SHELL, AT EVERY WIDTH ────────────────────────────────────────────────────────────
      t(r.docScrollW <= r.innerW, `🔴 ${w}: NO HORIZONTAL PAGE SCROLL`)
      t(r.modal.width <= r.innerW, `🔴 ${w}: the modal fits across the viewport`)
      t(r.footerOnScreen, `🔴 ${w}: THE FOOTER IS ON SCREEN WITHOUT SCROLLING — Cancel and Add event always reachable`)
      t(!r.modalScrolls, `🔴 ${w}: the MODAL itself does not scroll — the body does`)
      t(r.header.bottom <= r.body.top, `⚠️ ${w}: the header sits above the body`)
      t(r.body.bottom <= r.footer.top + 1, `⚠️ ${w}: the body ends where the footer begins`)
      t(r.close.visible && r.close.right <= r.modal.right, `⚠️ ${w}: the close button is inside the modal`)
      t(r.switch.visible, `⚠️ ${w}: the One event | Upload schedule switch is visible`)
      t(r.filledFrom.width > 0 && r.footer.height > 0, `⚠️ ${w}: the "Filled from" line shares the footer with the buttons`)

      if (w >= 768) {
        // ── THE TWO-PANE LAYOUT ────────────────────────────────────────────────────────────────
        t(r.left.top === r.right.top, `🔴 ${w}: the two panes share a top edge — side by side`)
        t(r.left.width === 380, `🔴 ${w}: the places pane is 380px, as the mockup asks`)
        t(r.right.left > r.left.right - 1, `🔴 ${w}: the form is to the RIGHT of the list, not under it`)
        t(r.right.width >= 300, `⚠️ ${w}: the form still has ${r.right.width}px — wide enough for its pairs`)
        t(r.addrToggle.display === 'none', `⚠️ ${w}: no "Address details" collapse — the fields are simply there`)
        t(r.addrFields.display === 'contents', `🔴 ${w}: the address wrapper is \`display: contents\`, so its four fields are grid items`)
        t(r.areaPostcodeSameRow, `⚠️ ${w}: Area and Postcode share a row (sm:grid-cols-2), the mockup's pairing`)
        t(r.fieldOrder[0].startsWith('Date') && r.fieldOrder[1].startsWith('Venue'),
          `🔴 ${w}: desktop order starts Date → Venue name`)
      } else {
        // ── THE PHONE SHEET ────────────────────────────────────────────────────────────────────
        t(r.left.bottom <= r.right.top || !r.left.visible, `🔴 ${w}: one column — the list is not beside the form`)
        t(r.addrToggle.display !== 'none', `🔴 ${w}: "Address details" IS a collapse on a phone`)
        t(r.addrFields.display === 'none', `🔴 ${w}: …and it starts COLLAPSED, because the fields are already filled`)
        t(r.fieldOrder[0].startsWith('Date'), `🔴 ${w}: Date first`)
        t(r.fieldOrder[1].startsWith('Start') && r.fieldOrder[2].startsWith('End'),
          `🔴 ${w}: then Start and End side by side — the phone order, from CSS \`order\`, not a second form`)
        t(r.fieldOrder[3].startsWith('Truck') && r.fieldOrder[4].startsWith('Notes'),
          `🔴 ${w}: then Truck, then Notes`)
        t(r.times.width <= r.modal.width, `⚠️ ${w}: start and end stay inside the sheet`)
        t(r.modal.height <= r.innerH + 1, `⚠️ ${w}: the sheet is exactly the viewport tall`)
      }
    }

    /* ── 🔴 A LONG LIST: CAN THE LAST PLACE BE REACHED? ─────────────────────────────────────────
     * 40 places, at all three widths. This is the measurement for the reported bug: on desktop the
     * pane was cut off and nothing scrolled, so places below the fold were unreachable. */
    for (const [w, h, label] of [[1440, 900, 'desktop'], [820, 1180, 'iPad portrait'], [390, 844, 'phone']]) {
      await eng.setViewport(w, h)
      await eng.page.goto(write(`long-${w}-${eng.name}.html`, fixture(css, false, 40)))
      const r = await eng.page.evaluate(rects)
      lines.push(`  ${w}×${h} 40 places  modal ${r.modalH} · pane ${r.paneH} · scroller ${r.scrollerH} · content ${r.contentH} · overflows ${r.listOverflows} · last reachable ${r.lastReachable}`)
      if (w >= 768) {
        /* 🔴 TWO-PANE: THE LIST HAS ITS OWN SCROLLER. The form must stay put while the list moves —
         * that is the whole point of two panes. */
        t(r.listOverflows === true, `🔴 ${w}: 40 places OVERFLOW the list's own box — so there is something to scroll`)
        t(r.lastReachable === true, `🔴 ${w}: THE LAST PLACE SCROLLS INTO VIEW INSIDE THE PANE, and inside the modal`)
      } else {
        /* ⚠️ PHONE: THE BODY SCROLLS, and that is correct — step 1 is the whole screen, so there is no
         * form beside it to keep still. What matters is that the last place is REACHABLE at all. */
        t(r.bodyScrolls === true, `🔴 ${w}: the modal BODY scrolls, so step 1's list is reachable`)
      }
      t(r.docScrollW <= r.innerW, `🔴 ${w}: and the PAGE does not scroll sideways`)
      t(r.footerOnScreen, `🔴 ${w}: …and the modal footer is still on screen with 40 places`)
      if (w >= 768) {
        t(r.leftFooter.bottom <= r.left.bottom + 1,
          `🔴 ${w}: "+ New place / Tidy up places" stays at the BOTTOM OF THE PANE, not pushed below it`)
        t(r.listSearch.top <= r.listScroll.top,
          `⚠️ ${w}: the search box stays at the TOP of the pane`)
      }
    }

    /* ── 🔴 THE BROKEN VARIANT FOR THE SCROLL FIX ───────────────────────────────────────────────
     * `md:h-[90vh]` removed, so the modal has a MAX-height and no height — indefinite, exactly as it
     * was when the bug was reported. The pane must then size to its content and the last place must
     * become unreachable. If this passes, the measurement above is proving nothing. */
    {
      await eng.setViewport(1440, 900)
      await eng.page.goto(write(`broken-${eng.name}.html`, fixture(css, false, 40, true)))
      const r = await eng.page.evaluate(rects)
      const reproduced = r.lastReachable === false && r.paneH > r.modalH
      lines.push(`  1440×900 BROKEN  modal ${r.modalH} · pane ${r.paneH} · overflows ${r.listOverflows} · last reachable ${r.lastReachable}`)
      t(reproduced,
        '🔴 BROKEN VARIANT: without `md:h-[90vh]` the pane outgrows the modal and the last place is unreachable — the bug, reproduced')
    }

    /* ── 🔴 THE BREAKPOINT ITSELF, MEASURED EITHER SIDE OF IT ───────────────────────────────────
     * `md` is 768px. 767 must be one column and 768 must be two, or the choice is not the one the
     * source says it is. iPad portrait (820) is therefore two-pane, which is what the mockup asks
     * for — and the width either side is what proves the boundary is where it is claimed. */
    for (const [w, expectTwoPane] of [[767, false], [768, true]]) {
      await eng.setViewport(w, 1000)
      await eng.page.goto(write(`bp-${w}-${eng.name}.html`, fixture(css)))
      const r = await eng.page.evaluate(rects)
      const twoPane = r.left.top === r.right.top && r.right.left > r.left.right - 1
      lines.push(`  ${w}×1000   two-pane: ${twoPane} (expected ${expectTwoPane}) · doc ${r.docScrollW} vs ${r.innerW}`)
      t(twoPane === expectTwoPane, `🔴 the breakpoint is exactly md/768px — ${w}px is ${expectTwoPane ? 'two panes' : 'one column'}`)
      t(r.docScrollW <= r.innerW, `🔴 ${w}: and no horizontal scroll either side of it`)
    }

    /* ── 🔴 THE MENU PILLS, AT THE THREE WIDTHS ─────────────────────────────────────────────────── */
    for (const [w, h] of [[1440, 900], [820, 1180], [390, 844]]) {
      await eng.setViewport(w, h)
      await eng.page.goto(write(`mp-${w}-${eng.name}.html`, menuPillFixture(css)))
      const r = await eng.page.evaluate(rects)
      lines.push(`  menu pills ${w}×${h}  row ${r.menuPills.rowW} · content ${r.menuPills.contentW} · rows ${r.menuPills.rows} · doc ${r.docScrollW} vs ${r.innerW}`)
      t(r.menuPills.rows === 1, `🔴 menu pills ${w}: all three stay on ONE row — they scroll, they do not wrap`)
      t(r.menuPills.width <= r.innerW, `🔴 menu pills ${w}: the row never exceeds the viewport`)
      t(r.docScrollW <= r.innerW, `🔴 menu pills ${w}: NO HORIZONTAL PAGE SCROLL`)
    }
    {
      /* 🔴 THE CLIPPING CONTROL. Six pills at 320px genuinely overflow the row. The overflow must stay
       * INSIDE it — which is only a real measurement when the content does not fit. */
      await eng.setViewport(320, 844)
      await eng.page.goto(write(`mp-clip-${eng.name}.html`, menuPillFixture(css, 6)))
      const r = await eng.page.evaluate(rects)
      lines.push(`  menu pills 320 (6)  row ${r.menuPills.rowW} · content ${r.menuPills.contentW} · doc ${r.docScrollW}`)
      t(r.menuPills.contentW > r.menuPills.rowW, '🔴 CONTROL: six menu pills genuinely overflow their row at 320px')
      t(r.docScrollW <= r.innerW, '🔴 …and the PAGE still does not scroll — the overflow is inside the pill row')
      t(r.menuPills.rows === 1, '⚠️ …and they scroll rather than wrapping')
    }

    // ── THE CONTROL ─────────────────────────────────────────────────────────────────────────────
    /* 🔴 WITHOUT THE RESPONSIVE GRID, 1440 MUST STACK. Otherwise the side-by-side assertions above
     * would pass on a modal that never had two panes, and this file would be measuring that one
     * column is one column. */
    {
      await eng.setViewport(1440, 900)
      await eng.page.goto(write(`c-${eng.name}.html`, fixture(css, true)))
      const r = await eng.page.evaluate(rects)
      t(r.left.bottom <= r.right.top,
        '🔴 CONTROL: with the two-pane grid removed, 1440px stacks — so the measurement can tell them apart')
    }

    await eng.close()
  }

  if (measured === 0) {
    lines.push('🔴 NEITHER ENGINE RAN — nothing was measured, so nothing is proved.')
    fails++
  }
  return { lines, fails }
}

measure().then(({ lines, fails }) => {
  console.log('── THE ADD EVENT MODAL, MEASURED: TWO PANES, THE PHONE SHEET, THE STICKY FOOTER ───────')
  for (const l of lines) console.log(l)
  console.log(fails === 0 ? '\n✅ layout measured in every available engine' : `\n🔴 ${fails} MEASUREMENT(S) FAILED`)
  process.exit(fails === 0 ? 0 : 1)
}).catch(e => {
  console.log('🔴 ' + (e && e.message ? e.message : String(e)))
  process.exit(1)
})
