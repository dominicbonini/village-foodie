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

const WP = read('components/manage/WeeklyPost.tsx')

/**
 * THE WEEKLY POST'S TWO SCREENS.
 *
 * 🔴 THE GRID TEMPLATES ARE LIFTED FROM THE COMPONENT, so a restyle breaks the fixture rather than
 * quietly leaving it measuring a layout nobody is served — the lesson from the Settings build, where a
 * fixture went on measuring the old shell.
 * ⚠️ THE PREVIEW IS A PLACEHOLDER BOX AT THE POSTER'S ASPECT RATIO, not a rendered PNG. What is being
 * measured here is the SCREEN: whether the preview and the controls fit and are reachable at three
 * widths. The poster's own pixels are measured by scripts/weekly-post.cjs, which is where that
 * question belongs.
 */
function weeklyPostFixture(css, which, w) {
  const setupGrid = lift(WP, /<div className="(grid grid-cols-1 lg:grid-cols-\[220px_minmax\(0,1fr\)_260px\] gap-4)">/, 'the setup grid')
  const postGrid = lift(WP, /<div className="(grid grid-cols-1 lg:grid-cols-\[minmax\(0,1fr\)_320px\] gap-4)">/, 'the post grid')
  const panel = lift(WP, /<div className="(rounded-xl border border-slate-200 bg-white p-3)">/, 'a control panel')
  const stage = lift(WP, /<div ref=\{stageRef\} className="(relative w-full select-none touch-none bg-slate-100 rounded-xl overflow-hidden)"/, 'the editor stage')

  const panels = (n, idPrefix) => Array.from({ length: n }, (_, i) =>
    `<div id="${idPrefix}${i}" class="${panel}" style="margin-bottom:12px">
       <p style="font-size:11px;font-weight:700;color:#94a3b8;margin-bottom:8px">PANEL ${i + 1}</p>
       ${filler('a control', 34)}${filler('another control', 34)}
     </div>`).join('')

  const body = which === 'setup'
    ? `<div class="${setupGrid}">
         <div id="leftCol">${panels(4, 'L')}</div>
         <div>
           <div id="stage" class="${stage}" style="aspect-ratio: 1080 / 1350"></div>
           <p style="font-size:12px;color:#94a3b8;margin-top:8px">Place row 1's three boxes: Date · Location · Time. The other six days copy it.</p>
         </div>
         <div id="rightCol">${panels(4, 'R')}</div>
       </div>`
    : `<div class="${postGrid}">
         <div>
           <div id="weekPicker" style="display:flex;gap:8px;margin-bottom:12px">
             <span style="padding:6px 12px;border-radius:8px;border:1px solid #f97316;white-space:nowrap">This week</span>
             <span style="padding:6px 12px;border-radius:8px;border:1px solid #e2e8f0;white-space:nowrap">Next week</span>
           </div>
           <div id="stage" class="relative rounded-xl overflow-hidden bg-slate-100" style="aspect-ratio: 1080 / 1350"></div>
           <div id="actions" style="display:flex;gap:8px;margin-top:12px">
             <span style="padding:8px 16px;border-radius:12px;background:#ea580c;color:#fff;white-space:nowrap">Download image</span>
             <span style="padding:8px 16px;border-radius:12px;background:#f1f5f9;white-space:nowrap">Share</span>
           </div>
         </div>
         <div id="rightCol">${panels(4, 'R')}</div>
       </div>`

  /* ⚠️ THE REAL APP SHELL, because the screen lives inside the manage scroller — `h-dvh`,
   * `overflow-hidden`, and `<main>` as the only scrolling element. Measuring it in a plain document
   * would answer a different question about what scrolls. */
  const shell = lift(PAGE, /<div className="(bg-slate-50 h-dvh flex flex-col overflow-hidden)">/, 'the app shell')
  const main = lift(PAGE, /<main id=\{MANAGE_SCROLLER_ID\} className=\{"(w-full min-\[1400px\]:max-w-5xl min-\[1400px\]:mx-auto flex-1 min-h-0 overflow-y-auto px-4 pb-6)"\}>/, 'the scroller')
  return `${HEAD(css)}
<div class="${shell}">
  <div style="height:56px;background:#0f172a" class="shrink-0"></div>
  <div style="height:44px;background:#0f172a" class="shrink-0"></div>
  <main id="scroller" class="${main}">
    <div class="pt-6 manage-tab-pad">${body}</div>
  </main>
</div></body></html>`
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
  /* 🔴 THE CAP ON THE PREVIEW'S HEIGHT, lifted from the page. It is what stops a long venue name
   * wrapping the card into two rows and eating the form pane — the thing the brief asks to measure. */
  /* 🔴 THE PREVIEW IS IN THE FORM PANE NOW, NOT THE FOOTER (5 October 2026), so the class lifted
   * here is its PANE wrapper rather than the old `max-h-[4.75rem]` footer cap — which is gone, because
   * in the pane there is room to show a long venue name instead of clipping it. */
  const previewPane = lift(PAGE, /<div className="(sm:col-span-2 max-md:hidden)" data-preview-pane>/, 'the preview pane wrapper')
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
            <!-- the live preview, at the full width of the pane, below Notes -->
            <div id="preview" class="${previewPane}">
              <p style="font-size:12px;font-weight:700;color:#94a3b8;margin-bottom:4px">Preview</p>
              ${filler('TruckListCard (compact) — Lavenham Village Hall · Tue 13 Oct · 17:00–20:00', 56)}
              <p id="filledFrom" style="font-size:11px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Filled from Lavenham Village Hall</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div id="footer" class="${footer}" style="display:flex;align-items:center;gap:12px">
      <!-- the phone keeps a single muted line here; the preview itself is the pinned card up top -->
      <p id="filledFromPhone" class="min-w-0 flex-1 md:hidden" style="font-size:12px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Filled from Lavenham Village Hall</p>
      <div id="footerBtns" class="shrink-0 ml-auto" style="display:flex;gap:8px">
        <span style="padding:8px 16px;border-radius:12px;background:#f1f5f9;white-space:nowrap">Cancel</span>
        <span style="padding:8px 16px;border-radius:12px;background:#ea580c;color:#fff;white-space:nowrap">Add event</span>
      </div>
    </div>
  </div>
</div></body></html>`
}

/**
 * THE MENU SUB-TAB ROW.
 * 🔴 PILLS → THE SHARED UNDERLINED BAR, 3 October 2026. The classes are lifted from the SAME
 * `SUBTAB_BAR`/`SUBTAB_ROW` constants Settings and Schedule use, so this measures one control rather
 * than a copy of it — and `lift` throws if those constants are renamed.
 * 🔴 THE QUESTION IS UNCHANGED: do the tabs scroll INSIDE their row, or widen the page? Measured with
 * the real class strings, and with a six-tab control at 320px where the row genuinely overflows.
 */
function menuPillFixture(css, pillCount = 3) {
  const row = lift(PAGE, /const SUBTAB_BAR = '(.+?)'/, 'the shared sub-tab bar')
  const inner = lift(PAGE, /const SUBTAB_ROW = '(.+?)'/, 'the sub-tab row')
  const labels = ['Items', 'Extras & upsells', 'Deals', 'Fourth section', 'Fifth section', 'Sixth section']
  return `${HEAD(css)}
<div style="max-width:1024px;margin:0 auto;padding:0 16px">
  <div id="menuPills" class="${row} mb-4">
    <div class="${inner}">
      ${labels.slice(0, pillCount).map((l, i) =>
        `<button style="padding:10px 0;font-weight:700;font-size:14px;white-space:nowrap;border-bottom:2px solid ${i === 0 ? '#f97316' : 'transparent'};background:none">${l}</button>`).join('')}
    </div>
  </div>
  <div id="menuBody">${filler('the selected section', 400)}</div>
</div></body></html>`
}

/**
 * SETTINGS AS ONE LIST WITH A STICKY JUMP BAR.
 *
 * 🔴 THE SHELL IS REBUILT HERE, NOT JUST THE LIST, because the thing being measured is a `position:
 * sticky` child of a NON-DOCUMENT scroller. The real page is `h-dvh flex flex-col overflow-hidden`
 * with the header and tab bar as `shrink-0` siblings and `<main>` as the only scroller; a fixture that
 * scrolled the document instead would answer a different question — the bar would stick to the
 * viewport and every assertion would pass for the wrong reason.
 *
 * @param breakSticky the broken variant: `<main>` gains a `pt-6`, which is the mistake the real
 *                    `<main>` comment warns about — a sticky child then pins 24px down, so the bar
 *                    detaches from the top of the scroller and content shows above it.
 */
function settingsFixture(css, breakSticky = false, breakFlush = false, withBanner = false, direct = false) {
  /* 🔴 LIFTED FROM THE SHARED CONSTANT all three sub-tab rows now use. If the real class list
   * changes, `lift` throws rather than quietly measuring a bar the page no longer has. */
  const bar = lift(PAGE, /const SUBTAB_BAR = '(.+?)'/, 'the shared sub-tab bar')
  const barInnerC = lift(PAGE, /const SUBTAB_ROW = '(.+?)'/, 'the sub-tab row')
  /* 🔴 AND THE WRAPPER CLASS, because the flush-top fix is a RULE ON THE WRAPPER keyed on
   * `data-subtab-bar`, not a margin on the bar. Measuring the bar alone would not exercise it. */
  const pad = lift(PAGE, /<div className="(pt-6 manage-tab-pad)">/, 'the padded tab wrapper')
  // ⚠️ THE BROKEN-FLUSH VARIANT DROPS EXACTLY THE ATTRIBUTE THE RULE KEYS ON, nothing else.
  const barInner = barInnerC
  const shell = lift(PAGE, /<div className="(bg-slate-50 h-dvh flex flex-col overflow-hidden)">/, 'the app shell')
  const main = lift(PAGE, /<main id=\{MANAGE_SCROLLER_ID\} className=\{"(w-full min-\[1400px\]:max-w-5xl min-\[1400px\]:mx-auto flex-1 min-h-0 overflow-y-auto px-4 pb-6)"\}>/, 'the scroller')
  const labels = ['Truck details', 'Contact', 'Auto-replies', 'Schedule', 'QR code',
    'Order settings', 'Truck settings', 'Account deletion']
  const ids = ['truck-details', 'contact', 'auto-replies', 'schedule', 'qr-code',
    'order-settings', 'truck-settings', 'account-deletion']

  // Each section: an h2 plus a card. The LAST one is short on purpose — that is the case the bottom
  // clamp and the measured floor exist for.
  const section = (id, label, i) => `
      <section id="${id}" data-settings-section style="scroll-margin-top:var(--pin);${i === ids.length - 1 ? 'min-height:var(--lastmin);' : ''}">
        <h2 data-settings-heading style="font-weight:900;font-size:18px;margin:0 0 12px">${label}</h2>
        ${filler('first setting in ' + label, 72)}
        ${i === ids.length - 1 ? '' : filler('more of ' + label, 420)}
      </section>`

  return `${HEAD(css)}
<div class="${shell}">
  <div style="height:56px;background:#0f172a;color:#fff;display:flex;align-items:center;padding:0 16px" class="shrink-0">header</div>
  <div style="height:44px;background:#0f172a;color:#94a3b8;display:flex;align-items:center;padding:0 16px" class="shrink-0">tab bar</div>
  <main id="scroller" class="${main}${breakSticky ? ' pt-6' : ''}">
    <div class="${pad}">
      ${withBanner ? `<div id="banner" style="background:#fef3c7;border:1px solid #fde68a;border-radius:12px;padding:12px" class="mb-4">a notification banner</div>` : ''}
      ${direct ? '' : '<div class="space-y-6">'}
        <div id="jumpbar" ${breakFlush ? '' : 'data-subtab-bar'} class="${bar}">
          <div class="${barInner}">
            ${labels.map((l, i) => `<button data-settings-tab="${ids[i]}" style="padding:10px 0;font-weight:700;font-size:14px;white-space:nowrap;border-bottom:2px solid ${i === 0 ? '#f97316' : 'transparent'};background:none">${l}</button>`).join('')}
          </div>
        </div>
        ${filler('New to HatchGrab?', 90)}
        ${filler('Get the app', 90)}
        ${ids.map((id, i) => section(id, labels[i], i)).join('')}
      ${direct ? '' : '</div>'}
    </div>
  </main>
</div>
<script>
  // 🔴 THE SAME TWO NUMBERS THE PAGE COMPUTES, measured the same way: the bar's own height, and the
  // scroller's height minus it. The fixture does not guess them.
  (function () {
    var bar = document.getElementById('jumpbar')
    var sc = document.getElementById('scroller')
    var pin = Math.round(bar.getBoundingClientRect().height)
    document.documentElement.style.setProperty('--pin', pin + 'px')
    document.documentElement.style.setProperty('--lastmin', Math.max(0, sc.clientHeight - pin) + 'px')
    window.__pin = pin
  })()
</script>
</body></html>`
}

const rects = () => {
  const ids = ['modal', 'header', 'switch', 'close', 'body', 'panes', 'left', 'leftFooter',
    'right', 'form', 'times', 'footer', 'filledFrom', 'addrToggle', 'addrFields',
    'listRoot', 'listSearch', 'listScroll', 'filledFromPhone', 'footerBtns']
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
  // ── SETTINGS ────────────────────────────────────────────────────────────────────────────────
  // ⚠️ `setScroller` / `setBar`, not `sc` / `jb` — the list-scroll metrics below already declare `sc`
  // in this same function scope, and a duplicate `const` is a syntax error that takes the whole file.
  const setScroller = document.getElementById('scroller')
  const setBar = document.getElementById('jumpbar')
  if (setScroller && setBar) {
    out.settings = {
      pin: window.__pin,
      barTop: Math.round(setBar.getBoundingClientRect().top),
      scrollerTop: Math.round(setScroller.getBoundingClientRect().top),
      barW: Math.round(setBar.getBoundingClientRect().width),
      rows: [...new Set([...setBar.firstElementChild.children].map(k => Math.round(k.getBoundingClientRect().top)))].length,
      contentW: Math.round(setBar.scrollWidth), rowW: Math.round(setBar.clientWidth),
    }
  } else { out.settings = null }
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
  const pv = document.getElementById('preview')
  out.preview = pv ? {
    h: Math.round(pv.getBoundingClientRect().height),
    w: Math.round(pv.getBoundingClientRect().width),
    bottom: Math.round(pv.getBoundingClientRect().bottom),
    visible: pv.getBoundingClientRect().width > 0 && pv.getBoundingClientRect().height > 0,
  } : { h: 0, w: 0, bottom: 0, visible: false }
  /* 🔴 DID THE PANE HAVE TO SCROLL? Measured, not assumed: the body is `overflow-y-auto`, so a
   * preview that only becomes visible after scrolling would still report a sane rect. True here means
   * the form is taller than its pane with every field filled — which is the thing the brief forbids. */
  const bodyEl = document.getElementById('body')
  out.previewScrolledTo = !!(bodyEl && bodyEl.scrollHeight > bodyEl.clientHeight + 1)
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
      /* ⚠️ TWO DIFFERENT ELEMENTS BY WIDTH, which is what the page does: on md+ "Filled from" is a
       * muted line INSIDE the preview; on a phone the preview is the pinned card at the top of step 2
       * and the footer keeps a single line of its own. */
      t(w >= 768 ? r.filledFrom.visible : r.filledFromPhone.visible,
        `⚠️ ${w}: the "Filled from" line is present${w >= 768 ? ', inside the preview' : ' as the phone footer line'}`)
      t(w >= 768 ? !r.filledFromPhone.visible : !r.preview.w,
        `⚠️ ${w}: …and only one of the two is shown`)
      if (w >= 768) {
        /* ══ 🔴 THE PREVIEW IS IN THE FORM PANE, AND THE FOOTER SHRANK ══════════════════════
         * 🔴 THE FOOTER IS NO TALLER THAN BEFORE THE MOVE, which is the brief's test. 100px was the
         * measured footer height with the preview inside it (docs/settings-and-preview-report.md §8);
         * with only the buttons left it must be at or under that, never more. */
        t(r.footer.height <= 100,
          `🔴 ${w}: THE FOOTER IS NO TALLER THAN BEFORE — ${r.footer.height}px, against 100px with the preview in it`)
        t(r.footerBtns.visible && r.footerBtns.right <= r.footer.right,
          `⚠️ ${w}: Cancel and Add event are in the footer and inside it`)
        /* 🔴 THE PREVIEW IS REACHABLE WITHOUT SCROLLING THE FORM. The brief's words. `body` is the
         * scrolling pane, so the preview's bottom has to sit inside it — not merely exist below the
         * fold — with every field above it filled. */
        t(r.preview.visible && r.preview.bottom <= r.body.bottom + 1,
          `🔴 ${w}: THE PREVIEW IS VISIBLE WITHOUT SCROLLING the filled form — preview bottom ${r.preview.bottom}, pane bottom ${r.body.bottom}`)
        t(!r.previewScrolledTo,
          `🔴 ${w}: …and the pane did not have to scroll to reveal it`)
        /* 🔴 FULL WIDTH OF THE PANE, which is what it gained by moving. In the footer it shared a row
         * with the buttons and was capped; here it spans the form. */
        t(r.preview.w > 0 && Math.abs(r.preview.w - r.right.width) <= 56,
          `🔴 ${w}: the preview spans the form pane — preview ${r.preview.w}px, pane ${r.right.width}px`)
        t(r.right.height >= 300, `🔴 ${w}: THE FORM PANE IS NOT CRAMPED — ${r.right.height}px of form`)
      }

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

    /* ── 🔴 SETTINGS: THE BAR STICKS, THE JUMPS LAND, THE LAST TAB LIGHTS ───────────────────────── */
    for (const [w, h] of [[1440, 900], [820, 1180], [390, 844]]) {
      await eng.setViewport(w, h)
      await eng.page.goto(write(`set-${w}-${eng.name}.html`, settingsFixture(css)))
      let r = await eng.page.evaluate(rects)
      lines.push(`  settings ${w}×${h}  pin ${r.settings.pin} · bar@${r.settings.barTop} scroller@${r.settings.scrollerTop} · rows ${r.settings.rows} · doc ${r.docScrollW} vs ${r.innerW}`)
      t(r.settings.rows === 1, `🔴 settings ${w}: the eight tabs stay on ONE row — they scroll, they do not wrap`)
      t(r.docScrollW <= r.innerW, `🔴 settings ${w}: NO HORIZONTAL PAGE SCROLL`)
      t(r.settings.barW <= r.innerW, `⚠️ settings ${w}: the bar never exceeds the viewport`)

      /* 🔴 FLUSH AT REST — AT scrollTop 0, BEFORE ANYTHING IS TOUCHED. THIS ASSERTION IS THE WHOLE
       * POINT OF THE 3 OCTOBER FIX, and the earlier version of this file is why the bug shipped: it
       * recorded `bar@124 scroller@100` at rest and only ASSERTED flushness AFTER scrolling 1200px, so
       * a 24px resting gap measured green. The operator saw it immediately — the bar sat low on load
       * and jumped to the top on the first tap.
       * ⚠️ A LOG LINE IS NOT A CHECK. The number was printed every run and nothing failed on it. */
      t(Math.abs(r.settings.barTop - r.settings.scrollerTop) <= 1,
        `🔴 settings ${w}: THE BAR IS FLUSH TO THE SCROLLER'S TOP AT REST (scrollTop 0), not only after scrolling — bar@${r.settings.barTop} scroller@${r.settings.scrollerTop}`)

      /* 🔴 THE BAR STAYS STUCK WHILE SCROLLING, AND PINS FLUSH TO THE SCROLLER'S TOP. `scrollerTop`
       * is where the scroller's content box starts — i.e. just under the tab bar — so bar === scroller
       * is "flush under the tabs with no magic offset". */
      const stuck = await eng.page.evaluate(() => {
        const sc = document.getElementById('scroller')
        sc.scrollTop = 1200
        const jb = document.getElementById('jumpbar')
        return {
          barTop: Math.round(jb.getBoundingClientRect().top),
          scrollerTop: Math.round(sc.getBoundingClientRect().top),
          scrolled: Math.round(sc.scrollTop),
        }
      })
      lines.push(`    after scrolling ${stuck.scrolled}px: bar@${stuck.barTop} scroller@${stuck.scrollerTop}`)
      t(stuck.scrolled > 0 && Math.abs(stuck.barTop - stuck.scrollerTop) <= 1,
        `🔴 settings ${w}: THE BAR IS STILL STUCK FLUSH TO THE SCROLLER'S TOP after scrolling 1200px`)

      /* 🔴 EVERY JUMP LANDS THE HEADING AND ITS FIRST SETTING FULLY BELOW THE BAR. Not "near" it —
       * the heading's top must be at or below the bar's bottom, and the first setting must be inside
       * the scroller's visible box. Checked for all eight, which is the only way to catch one section
       * whose offset happens to be wrong. */
      const jumps = await eng.page.evaluate(() => {
        const sc = document.getElementById('scroller')
        const jb = document.getElementById('jumpbar')
        const out = []
        for (const sec of document.querySelectorAll('[data-settings-section]')) {
          sc.scrollTop = 0
          sec.scrollIntoView({ behavior: 'auto', block: 'start' })
          const barBottom = jb.getBoundingClientRect().bottom
          const hd = sec.querySelector('[data-settings-heading]').getBoundingClientRect()
          const first = sec.children[1].getBoundingClientRect()
          const scBox = sc.getBoundingClientRect()
          out.push({
            id: sec.id,
            headingBelowBar: hd.top >= barBottom - 1,
            firstSettingVisible: first.top >= barBottom - 1 && first.bottom <= scBox.bottom + 1,
          })
        }
        return out
      })
      const badHeading = jumps.filter(j => !j.headingBelowBar).map(j => j.id)
      const badFirst = jumps.filter(j => !j.firstSettingVisible).map(j => j.id)
      lines.push(`    jumps: ${jumps.length} sections · heading below bar ${jumps.length - badHeading.length}/${jumps.length} · first setting visible ${jumps.length - badFirst.length}/${jumps.length}`)
      t(jumps.length === 8 && badHeading.length === 0,
        `🔴 settings ${w}: EVERY section's heading lands fully below the bar${badHeading.length ? ' — failed: ' + badHeading.join(', ') : ''}`)
      t(badFirst.length === 0,
        `🔴 settings ${w}: …and its FIRST SETTING is fully visible too${badFirst.length ? ' — failed: ' + badFirst.join(', ') : ''}`)

      /* 🔴 THE LAST SECTION AT THE BOTTOM. Its measured floor must make it tall enough to reach the
       * pin line, which is what lets its tab light from the heading rule rather than only from the
       * bottom clamp. */
      const last = await eng.page.evaluate(() => {
        const sc = document.getElementById('scroller')
        sc.scrollTop = sc.scrollHeight
        const jb = document.getElementById('jumpbar')
        const secs = [...document.querySelectorAll('[data-settings-section]')]
        const lastSec = secs[secs.length - 1]
        return {
          atBottom: sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2,
          lastTopAbovePin: lastSec.getBoundingClientRect().top - sc.getBoundingClientRect().top <= jb.getBoundingClientRect().height + 1,
          lastH: Math.round(lastSec.getBoundingClientRect().height),
        }
      })
      lines.push(`    at the bottom: last section ${last.lastH}px tall · reaches the pin line: ${last.lastTopAbovePin}`)
      t(last.atBottom && last.lastTopAbovePin,
        `🔴 settings ${w}: THE LAST SECTION REACHES THE PIN LINE AT THE BOTTOM, so its tab lights`)
      void r
    }

    /* ── 🔴 THE STICKY BROKEN VARIANT ────────────────────────────────────────────────────────────
     * `<main>` gains a `pt-6`. That is the exact mistake the real `<main>` comment warns about: a
     * sticky child pins at the scroll container's CONTENT box, so the padding becomes a permanent gap
     * ABOVE the bar and content scrolls through it. */
    {
      await eng.setViewport(1440, 900)
      await eng.page.goto(write(`set-broken-${eng.name}.html`, settingsFixture(css, true)))
      const broken = await eng.page.evaluate(() => {
        const sc = document.getElementById('scroller')
        sc.scrollTop = 1200
        const jb = document.getElementById('jumpbar')
        return {
          gap: Math.round(jb.getBoundingClientRect().top - sc.getBoundingClientRect().top),
        }
      })
      lines.push(`  settings BROKEN (<main> has pt-6)  bar sits ${broken.gap}px below the scroller's top`)
      t(broken.gap > 1,
        '🔴 BROKEN VARIANT: a padding-top on `<main>` detaches the bar from the top — the bug the comment warns about, reproduced')
    }

    /* ── 🔴 THE BANNER CASE — THE REASON THE FIX IS A `:has()` RULE ─────────────────────
     * Six notification banners can render above the tab content. With one showing, the bar is NOT the
     * first child, the wrapper KEEPS its padding, and the bar must sit BELOW the banner — not pulled up
     * through it, which is exactly what the first `-mt-6` fix did. */
    {
      await eng.setViewport(1440, 900)
      await eng.page.goto(write(`set-banner-${eng.name}.html`, settingsFixture(css, false, false, true)))
      const b = await eng.page.evaluate(() => {
        const bn = document.getElementById('banner')
        const jb = document.getElementById('jumpbar')
        return {
          overlap: Math.round(bn.getBoundingClientRect().bottom - jb.getBoundingClientRect().top),
          bannerTop: Math.round(bn.getBoundingClientRect().top),
          scrollerTop: Math.round(document.getElementById('scroller').getBoundingClientRect().top),
        }
      })
      lines.push(`  settings WITH A BANNER  banner@${b.bannerTop} scroller@${b.scrollerTop} · banner/bar overlap ${b.overlap}px`)
      t(b.overlap <= 0,
        '🔴 settings: with a banner above it the bar does NOT overlap it — the `-mt-6` fix did, the `:has()` rule does not')
      t(b.bannerTop > b.scrollerTop,
        '⚠️ …and the wrapper keeps its top padding in that case, so the banner is not jammed against the tab bar')
    }

    /* ── 🔴 THE OTHER DEPTH — MENU AND SCHEDULE ─────────────────────────────────────
     * 🔴 THE TWO BARS SIT AT DIFFERENT DEPTHS and the flush rule needs a selector for each: Settings'
     * bar is inside `SettingsTab`'s own root (depth 2), while Menu's row and Schedule's row are DIRECT
     * children of the padded wrapper (Schedule's component returns a fragment, so its children are
     * hoisted). A rule that only covered Settings would leave the other two resting 24px down — which
     * is the half of the bug the operator reported second. Both selectors are measured. */
    {
      await eng.setViewport(1440, 900)
      await eng.page.goto(write(`set-direct-${eng.name}.html`, settingsFixture(css, false, false, false, true)))
      const d = await eng.page.evaluate(() => {
        const sc = document.getElementById('scroller')
        const jb = document.getElementById('jumpbar')
        const at = () => Math.round(jb.getBoundingClientRect().top - sc.getBoundingClientRect().top)
        const rest = at()
        sc.scrollTop = 1200
        return { rest, scrolled: at() }
      })
      lines.push(`  settings DIRECT CHILD (as Menu/Schedule)  at rest ${d.rest}px, after scrolling ${d.scrolled}px`)
      t(d.rest <= 1 && d.scrolled <= 1,
        '🔴 A BAR THAT IS A DIRECT CHILD (Menu/Schedule) IS ALSO FLUSH AT REST — the second `:has()` selector works')
    }

    /* ── 🔴 THE RESTING-GAP BROKEN VARIANT ──────────────────────────────────────
     * The bar loses `data-subtab-bar`, so the wrapper's `:has()` rule stops matching and keeps its
     * padding — the exact bug the operator reported. Sticky cannot hold an element ABOVE its flow
     * position, so at scrollTop 0 the pin has nothing to do and the 24px gap shows.
     * 🔴 IT MUST SHOW AT REST AND VANISH AFTER SCROLLING — both halves, because "two resting
     * positions" is the defect, and a variant that was simply always-offset would not reproduce it. */
    {
      await eng.setViewport(1440, 900)
      await eng.page.goto(write(`set-gap-${eng.name}.html`, settingsFixture(css, false, true)))
      const gapV = await eng.page.evaluate(() => {
        const sc = document.getElementById('scroller')
        const jb = document.getElementById('jumpbar')
        const at = () => Math.round(jb.getBoundingClientRect().top - sc.getBoundingClientRect().top)
        const rest = at()
        sc.scrollTop = 1200
        return { rest, scrolled: at() }
      })
      lines.push(`  settings BROKEN (no data-subtab-bar)  at rest ${gapV.rest}px below the top, after scrolling ${gapV.scrolled}px`)
      t(gapV.rest > 1 && gapV.scrolled <= 1,
        '🔴 BROKEN VARIANT: without `data-subtab-bar` the bar rests below the top and snaps flush once scrolled — the two resting positions, reproduced')
    }

    /* ══ 🔴 THE WEEKLY POST'S TWO SCREENS ════════════════════════════════════════════
     * Three widths, two screens, both engines. The questions are the brief's: no horizontal page
     * scroll, the preview visible, the controls reachable.
     * ⚠️ "REACHABLE" IS MEASURED AS "INSIDE THE SCROLLER AND NOT CLIPPED SIDEWAYS", not as "on screen
     * without scrolling" — a settings screen is expected to scroll vertically. What must never happen
     * is a column pushed off the side where no scroll can reach it, which is what a three-column grid
     * does on a phone if it is not allowed to stack. */
    for (const which of ['setup', 'post']) {
      for (const [w, h] of [[1440, 900], [820, 1180], [390, 844]]) {
        await eng.setViewport(w, h)
        await eng.page.goto(write(`wp-${which}-${w}-${eng.name}.html`, weeklyPostFixture(css, which, w)))
        const r = await eng.page.evaluate(() => {
          const box = (id) => {
            const el = document.getElementById(id)
            if (!el) return null
            const b = el.getBoundingClientRect()
            return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top),
              bottom: Math.round(b.bottom), width: Math.round(b.width), height: Math.round(b.height) }
          }
          const sc = document.getElementById('scroller')
          return {
            stage: box('stage'), left: box('leftCol'), right: box('rightCol'),
            picker: box('weekPicker'), actions: box('actions'), r0: box('R0'), r3: box('R3'),
            docScrollW: document.documentElement.scrollWidth,
            innerW: window.innerWidth,
            scrollerW: sc ? Math.round(sc.getBoundingClientRect().width) : 0,
            scrollerLeft: sc ? Math.round(sc.getBoundingClientRect().left) : 0,
            scrollerRight: sc ? Math.round(sc.getBoundingClientRect().right) : 0,
            pageScrollsSideways: document.documentElement.scrollWidth > window.innerWidth + 1,
          }
        })
        lines.push(`  weekly ${which} ${w}×${h}  stage ${r.stage.width}×${r.stage.height} · right col ${r.right.width}px · doc ${r.docScrollW} vs ${r.innerW}`)
        t(!r.pageScrollsSideways, `🔴 weekly ${which} ${w}: NO HORIZONTAL PAGE SCROLL`)
        t(r.stage.width > 0 && r.stage.height > 0, `🔴 weekly ${which} ${w}: the preview is visible`)
        /* 🔴 THE PREVIEW KEEPS THE POSTER'S SHAPE, so what the operator judges is the proportions they
         * will get. 1080×1350 is 0.8; a stage that had gone square would show them a lie. */
        t(Math.abs(r.stage.width / r.stage.height - 1080 / 1350) < 0.02,
          `🔴 weekly ${which} ${w}: …at the poster's own aspect ratio`)
        t(r.stage.left >= r.scrollerLeft - 1 && r.stage.right <= r.scrollerRight + 1,
          `⚠️ weekly ${which} ${w}: the preview is inside the scroller, not clipped sideways`)
        /* 🔴 EVERY CONTROL PANEL IS REACHABLE. On a phone the columns must STACK — a three-column
         * grid that did not would push the right-hand controls off the side, where no amount of
         * scrolling reaches them. */
        for (const [name, el] of [['first', r.r0], ['last', r.r3]]) {
          t(!!el && el.left >= r.scrollerLeft - 1 && el.right <= r.scrollerRight + 1 && el.width > 60,
            `🔴 weekly ${which} ${w}: the ${name} control panel is reachable (${el ? el.width : 0}px wide)`)
        }
        if (w < 1024) {
          t(r.right.top > r.stage.top, `🔴 weekly ${which} ${w}: the columns STACK below 1024 — nothing is pushed off the side`)
        } else {
          t(r.right.left > r.stage.left, `⚠️ weekly ${which} ${w}: the controls sit beside the preview on a wide screen`)
          if (which === 'setup') {
            t(r.left.right <= r.stage.left + 1, `⚠️ weekly setup ${w}: three columns in order — what to place, the preview, the controls`)
          }
        }
        if (which === 'post') {
          t(!!r.picker && r.picker.width > 0 && r.picker.right <= r.scrollerRight + 1,
            `⚠️ weekly post ${w}: the This week / Next week picker fits`)
          t(!!r.actions && r.actions.right <= r.scrollerRight + 1,
            `⚠️ weekly post ${w}: Download and Share fit on one row`)
        }
      }
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
