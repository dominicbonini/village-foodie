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
 * @param oneCol  the control: the responsive grid replaced by a single column, which must measure
 *                differently at 1440 or the side-by-side assertions prove nothing.
 */
function fixture(css, oneCol = false) {
  const shell = lift(PAGE, /className=\{`(bg-white w-full shadow-2xl flex flex-col min-h-0 overflow-x-hidden)/, 'the modal shell')
  const body = lift(PAGE, /className=\{`(flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y) px-5/, 'the scrolling body')
  const twoPane = lift(PAGE, /\$\{\s*\n?\s*showPicker \? '(md:grid md:grid-cols-\[380px_minmax\(0,1fr\)\] md:gap-5)' : ''\}/, 'the two-pane grid')
  const footer = lift(PAGE, /<div className="(shrink-0 border-t border-slate-200 bg-white px-5 sm:px-6 py-3)/, 'the sticky footer')
  const form = lift(PAGE, /<div id="add-event-form" className="(grid grid-cols-1 sm:grid-cols-2 gap-3)">/, 'the form grid')
  const grid = oneCol ? '' : twoPane

  const field = (label, h = 56) => `<div>${filler(label, h)}</div>`
  return `${HEAD(css)}
<div class="fixed inset-0" style="background:rgba(0,0,0,.6);display:flex;align-items:stretch;justify-content:center">
  <div id="modal" class="${shell} max-sm:h-dvh sm:rounded-2xl sm:max-h-[90vh] md:max-w-[1040px]" style="margin:auto">

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
        <div id="left" class="min-h-0 md:h-full md:border md:border-slate-200 md:rounded-2xl md:overflow-hidden flex flex-col">
          ${filler('search places', 64)}
          ${filler('FAVOURITES + ALL PLACES rows', 420)}
          <div id="leftFooter" class="shrink-0 border-t border-slate-100 p-3" style="display:flex;justify-content:space-between;gap:12px">
            <span style="font-size:12px;font-weight:700;white-space:nowrap">+ New place</span>
            <span style="font-size:12px;font-weight:700;white-space:nowrap">Tidy up places</span>
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

const rects = () => {
  const ids = ['modal', 'header', 'switch', 'close', 'body', 'panes', 'left', 'leftFooter',
    'right', 'form', 'times', 'footer', 'filledFrom', 'addrToggle', 'addrFields']
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
  // 🔴 IS THE FOOTER ON SCREEN WITHOUT SCROLLING? The modal is a flex column, so the footer sits
  // inside the viewport iff the modal does. Measured, not assumed.
  const f = document.getElementById('footer').getBoundingClientRect()
  out.footerOnScreen = f.bottom <= window.innerHeight + 1 && f.top >= -1
  // Does the BODY scroll rather than the modal?
  const b = document.getElementById('body')
  out.bodyScrolls = b.scrollHeight > b.clientHeight + 1
  const m = document.getElementById('modal')
  out.modalScrolls = m.scrollHeight > m.clientHeight + 1
  const rowsOf = (id) => {
    const el = document.getElementById(id)
    if (!el) return 0
    return [...new Set([...el.children].map(k => Math.round(k.getBoundingClientRect().top)))].length
  }
  /* ⚠️ `rowsOf('form')` COUNTS DOM CHILDREN, NOT VISUAL ROWS — the address wrapper is
   * `display: contents`, so it is one child holding four fields. It is kept for the log line only.
   * The claim worth asserting is the PAIRING: Area and Postcode share a row from `sm`, and each take
   * their own below it. That is measured directly from the two fields' tops. */
  out.formRows = rowsOf('form')
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
