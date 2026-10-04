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
/* 🔴 MENU › KITCHEN CAPACITY (October 2026) — its own screen now, so its own fixture. */
const KC = read('components/manage/KitchenCapacitySection.tsx')
const KCLIB = read('lib/kitchen-capacity.ts')
/* 🔴 THE SHARED CONTROLS LIVE HERE NOW — the capacity question uses Settings' own Toggle. */
const PRIM = read('components/manage/primitives.tsx')
const SSM = read('components/manage/ScheduleSettingsModal.tsx')

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

const EVENTUI = read('components/manage/EventPost.tsx')

/**
 * THE SINGLE-EVENT POST'S TWO SCREENS (stage 2).
 *
 * 🔴 THE GRID TEMPLATES AND THE MODAL SHELL ARE LIFTED FROM THE COMPONENT, so a restyle breaks the
 * fixture rather than leaving it measuring a layout nobody is served.
 * ⚠️ THE PREVIEW IS A PLACEHOLDER AT THE POSTER'S ASPECT RATIO. What is measured here is the SCREEN:
 * whether the preview and the controls fit and are reachable. The poster's own pixels are measured by
 * scripts/weekly-post.cjs, which is where that question belongs.
 */
function eventPostFixture(css, which) {
  const setupGrid = lift(EVENTUI, /<div className="(grid grid-cols-1 lg:grid-cols-\[220px_minmax\(0,1fr\)_280px\] gap-4)">/, 'the event setup grid')
  const modalShell = lift(EVENTUI, /<div className="(bg-white rounded-2xl w-full max-w-4xl max-h-\[92vh\] md:h-\[86vh\] flex flex-col overflow-hidden)"/, 'the modal shell')
  const modalGrid = lift(EVENTUI, /<div className="(grid grid-cols-1 md:grid-cols-\[minmax\(0,1fr\)_300px\] gap-4)">/, 'the modal grid')
  const stage = lift(WP, /<div ref=\{stageRef\} className="(relative w-full select-none touch-none bg-slate-100 rounded-xl overflow-hidden)"/, 'the editor stage')
  const panel = lift(WP, /<div className="(rounded-xl border border-slate-200 bg-white p-3)">/, 'a control panel')

  const panels = (n, idPrefix) => Array.from({ length: n }, (_, i) =>
    `<div id="${idPrefix}${i}" class="${panel}" style="margin-bottom:12px">
       <p style="font-size:11px;font-weight:700;color:#94a3b8;margin-bottom:8px">PANEL ${i + 1}</p>
       ${filler('a control', 34)}${filler('another control', 34)}
     </div>`).join('')

  if (which === 'modal') {
    /* ⚠️ THE MODAL IS MEASURED INSIDE THE REAL SHELL, because the question is whether its body scrolls
     * and its buttons stay reachable on a phone — which depends on `max-h-[92vh]` and the flex column,
     * not on the grid alone. */
    return `${HEAD(css)}
<div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" style="position:fixed;inset:0">
  <div id="modal" class="${modalShell}">
    <div id="mHeader" class="shrink-0" style="padding:20px 24px 12px;border-bottom:1px solid #e2e8f0">
      <p style="font-weight:900">Post for this event</p>
      <p style="font-size:12px;color:#64748b">2026-10-16 · Lavenham Village Hall · 5pm – 9pm</p>
    </div>
    <div id="mBody" class="flex-1 min-h-0 overflow-y-auto" style="padding:16px 24px">
      <div class="${modalGrid}">
        <div id="stage" class="rounded-xl overflow-hidden bg-slate-100" style="aspect-ratio: 1080 / 1350"></div>
        <div id="rightCol">
          ${panels(3, 'R')}
          <div id="actions" style="display:flex;flex-wrap:wrap;gap:8px">
            <span style="padding:8px 16px;border-radius:12px;background:#ea580c;color:#fff;white-space:nowrap">Download image</span>
            <span style="padding:8px 16px;border-radius:12px;background:#f1f5f9;white-space:nowrap">Copy text</span>
            <span style="padding:8px 16px;border-radius:12px;background:#f1f5f9;white-space:nowrap">Share</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div></body></html>`
  }

  const shell = lift(PAGE, /<div className="(bg-slate-50 h-dvh flex flex-col overflow-hidden)">/, 'the app shell')
  const main = lift(PAGE, /<main id=\{MANAGE_SCROLLER_ID\} className=\{"(w-full min-\[1400px\]:max-w-5xl min-\[1400px\]:mx-auto flex-1 min-h-0 overflow-y-auto px-4 pb-6)"\}>/, 'the scroller')
  return `${HEAD(css)}
<div class="${shell}">
  <div style="height:56px;background:#0f172a" class="shrink-0"></div>
  <div style="height:44px;background:#0f172a" class="shrink-0"></div>
  <main id="scroller" class="${main}">
    <div class="pt-6 manage-tab-pad">
      <div class="${setupGrid}">
        <div id="leftCol">${panels(2, 'L')}</div>
        <div><div id="stage" class="${stage}" style="aspect-ratio: 1080 / 1350"></div></div>
        <div id="rightCol">${panels(4, 'R')}</div>
      </div>
    </div>
  </main>
</div></body></html>`
}

/**
 * TIDY UP PLACES, IN THE ADD EVENT MODAL'S SHELL.
 *
 * 🔴 THE SHELL IS LIFTED FROM THE CONSTANTS, NOT RETYPED. Add event and Tidy up places are the same
 * modal and must be the same size at every breakpoint; measuring a hand-written copy of the classes
 * would pass whatever the app actually does. `EVENT_MODAL_SHELL` + `EVENT_MODAL_WIDE` is the exact
 * pair the element gets when `wideShell` is true, which is the case for Tidy up.
 *
 * ⚠️ THE NAME IN "Name on posts" IS 40 CHARACTERS, which is the brief's number — the field must show
 * all of it at 1440 with nothing clipped. It is a real-shaped venue name, not 40 of the letter W,
 * because a run of the widest glyph in the font would be a harder test than anything a truck types and
 * would fail for the wrong reason.
 */
const NAME_40 = 'The Bull & Butcher, Wickhambrook Green Xx'.slice(0, 40)

function tidyFixture(css) {
  const shell = lift(PAGE, /^const EVENT_MODAL_SHELL = '(.+)'$/m, 'EVENT_MODAL_SHELL')
  const wide = lift(PAGE, /^const EVENT_MODAL_WIDE = '(.+)'$/m, 'EVENT_MODAL_WIDE')
  const tidyGrid = lift(PLACES, /<div className="(flex-1 min-h-0 grid grid-cols-1 md:grid-cols-\[22rem_1fr\] gap-4)">/, 'the tidy grid')
  const listBox = lift(PLACES, /<div className="(min-h-0 border border-slate-200 rounded-2xl overflow-hidden flex flex-col max-md:max-h-72)">/, 'the tidy list box')
  /* 🔴 THE LIST'S OWN SCROLLER, LIFTED FROM `PlaceList`. The first draft of this fixture put the rows
   * straight into the bordered box, which is `overflow-hidden` — so a long list was CLIPPED rather
   * than scrolled, and the check reported the scroll broken on working code. The real component wraps
   * them in `flex-1 min-h-0 overflow-y-auto`, and that nested pair is the whole mechanism. */
  const listScroll = lift(PLACES, /<div className="(flex-1 min-h-0 overflow-y-auto) px-3 pb-2">/, 'the tidy list scroller')
  const formCard = lift(PLACES, /<Card className="(p-4 grid grid-cols-1 sm:grid-cols-2 gap-3)">/, 'the place form card')

  /* The five fields, with the two long ones full-width — exactly as `PlaceDetail` lays them out. The
   * wrapper class is lifted too, so a change to it is measured rather than guessed at. */
  const field = (id, label, value, full) => `
    <div id="${id}" class="${full ? 'sm:col-span-2 min-w-0' : 'min-w-0'}">
      <label style="display:block;font-size:12px;font-weight:700;color:#475569;margin-bottom:4px">${label}</label>
      <input id="${id}in" value="${value}" style="width:100%;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:12px;padding:8px 12px;font-size:14px" />
    </div>`

  return `${HEAD(css)}
<div class="fixed inset-0 bg-black/60 z-50 flex items-stretch sm:items-center justify-center sm:p-4" style="position:fixed;inset:0">
  <div id="modal" class="${shell} ${wide}">
    <div id="mHeader" class="shrink-0" style="padding:20px 24px 12px">
      <p style="font-weight:900">Tidy up places</p>
    </div>
    <div id="tidyBody" class="flex-1 min-h-0 flex flex-col" style="padding:0 24px 24px">
      <div style="font-size:12px;font-weight:700;color:#ea580c;margin-bottom:8px">← Back to add event</div>
      <div class="${tidyGrid}">
        <div class="${listBox}">
          <div id="list" class="${listScroll}">
            ${Array.from({ length: 24 }, (_, i) => `<div style="padding:10px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Place number ${i + 1}</div>`).join('')}
          </div>
        </div>
        <div id="detail" class="min-w-0" style="overflow-y:auto">
          <div id="form" class="${formCard}" style="border:1px solid #e2e8f0;border-radius:16px;background:#fff">
            ${field('fName', 'Name on posts', NAME_40, true)}
            ${field('fAddr', 'Address', '12 High Street, Wickhambrook, Suffolk', true)}
            ${field('fShort', 'Short name', 'Wickhambrook', false)}
            ${field('fArea', 'Area', 'Wickhambrook', false)}
            ${field('fPost', 'Postcode', 'CB8 8PD', false)}
          </div>
          <div id="events" style="margin-top:16px;border:1px solid #e2e8f0;border-radius:16px;padding:16px">
            <p style="font-size:14px;font-weight:900">Events here</p>
            <p style="font-size:14px;color:#334155">Next: Thu 16 Oct · 5pm – 9pm</p>
          </div>
          <div id="controls" style="margin-top:16px;display:flex;flex-wrap:wrap;gap:8px">
            <span style="padding:6px 12px;border-radius:12px;background:#fff7ed;color:#c2410c;white-space:nowrap">★ Favourite</span>
            <span style="padding:6px 12px;border-radius:12px;background:#f8fafc;white-space:nowrap">Hide this place</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div></body></html>`
}

/**
 * THE ADD EVENT MODAL'S SHELL ON ITS OWN, for the size comparison.
 *
 * 🔴 THE POINT IS THE COMPARISON, NOT THIS FIXTURE. Tidy up and Add event are measured in the same
 * engine at the same viewport and the two boxes must come out the same size. Asserting a NUMBER for
 * either would have to be updated whenever the design changes, and would not notice the two drifting
 * apart — which is the defect this replaced.
 */
function addEventShellFixture(css) {
  const shell = lift(PAGE, /^const EVENT_MODAL_SHELL = '(.+)'$/m, 'EVENT_MODAL_SHELL')
  const wide = lift(PAGE, /^const EVENT_MODAL_WIDE = '(.+)'$/m, 'EVENT_MODAL_WIDE')
  return `${HEAD(css)}
<div class="fixed inset-0 bg-black/60 z-50 flex items-stretch sm:items-center justify-center sm:p-4" style="position:fixed;inset:0">
  <div id="modal" class="${shell} ${wide}">
    <div class="shrink-0" style="padding:20px 24px 12px"><p style="font-weight:900">Add event</p></div>
    <div id="mBody" class="flex-1 min-h-0 overflow-y-auto" style="padding:0 24px 24px">
      <div class="md:grid md:grid-cols-[380px_minmax(0,1fr)] md:gap-5 min-h-0 h-full">
        <div id="list" style="border:1px solid #e2e8f0;border-radius:16px">
          ${Array.from({ length: 18 }, (_, i) => `<div style="padding:10px 12px;font-size:14px">Place ${i + 1}</div>`).join('')}
        </div>
        <div id="detail">${filler('a field', 60)}</div>
      </div>
    </div>
  </div>
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

/* 🔴 ONE NOTIFICATION BANNER, used by both sticky fixtures. Where it goes is the whole question: ABOVE
 * a sub-tab bar it costs the bar its flush resting position, BELOW it costs nothing. */
/* 🔴 THE WRAPPER'S CLASS AND ITS CONDITIONAL PADDING, FROM THE REAL TERNARY (4 October 2026).
 * The page used to hard-code `pt-6 manage-tab-pad` and let a `:has()` rule take the padding away. It
 * does not any more: the padding is applied only on tabs with no sub-tab bar, decided in JSX by
 * `TABS_WITH_SUBTABS`. A fixture that kept hard-coding `pt-6` would be measuring the old page, so both
 * halves are lifted and `padded` is what the fixture passes when it wants the bar-less case. */
const PAD_CLASS = lift(PAGE, /className=\{`(manage-tab-pad)\$\{TABS_WITH_SUBTABS\.includes\(activeTab\) \? '' : ' pt-6'\}`\}/, 'the tab wrapper')
const PAD_PT = lift(PAGE, /className=\{`manage-tab-pad\$\{TABS_WITH_SUBTABS\.includes\(activeTab\) \? '' : '( pt-6)'\}`\}/, "the wrapper's conditional padding").trim()
const padClass = (padded = false) => padded ? `${PAD_PT} ${PAD_CLASS}` : PAD_CLASS

const BANNER = `<div id="banner" style="background:#fef3c7;border:1px solid #fde68a;border-radius:12px;padding:12px" class="mb-4">a notification banner</div>`

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
  /* 🔴 LIFTED FROM THE CONSTANT NOW, NOT FROM THE ELEMENT (October 2026). The shell's classes moved
   * out of the JSX and into `EVENT_MODAL_SHELL` so Add event and Tidy up places could share one size;
   * this lift followed them. The intent is unchanged and is the reason it is a lift at all: the
   * fixture must break when the real shell changes rather than go on measuring a shell nobody is
   * served. ⚠️ `EVENT_MODAL_SHELL` carries the phone and `sm:` sizing; the two-pane height and width
   * come from `EVENT_MODAL_WIDE`, lifted separately below so `breakScroll` can drop just the height. */
  const shell = lift(PAGE, /^const EVENT_MODAL_SHELL = '(.+)'$/m, 'the modal shell constant')
  /* 🔴 THE FOUR CLASS STRINGS THE SCROLL DEPENDS ON, LIFTED FROM THE REAL SOURCE so the fixture
   * cannot quietly disagree with the pane it claims to measure. `breakScroll` is the broken variant:
   * it drops `min-h-0` from the wrapper between the pane and the list, which is the one class that
   * lets a flex child be shorter than its content. */
  /* 🔴 THE TWO-PANE HEIGHT CLASS, LIFTED FROM THE SOURCE — not typed into this fixture. The first
   * draft hardcoded the shell's height classes, so after `md:h-[90vh]` was added to the page the
   * fixture went on measuring the OLD shell and the bug "still reproduced" on fixed code. Anything
   * the measurement depends on comes out of the real file. */
  const wideShell = lift(PAGE, /^const EVENT_MODAL_WIDE = '(.+)'$/m, 'the two-pane modal size constant')
  /* ⚠️ THE HEIGHT IS PICKED OUT OF THE WIDE CONSTANT so the broken variant can drop it on its own.
   * The constant is `md:h-[90vh] md:max-w-[1040px]`; dropping the whole thing would also change the
   * WIDTH, and the variant would then "reproduce" the scroll bug for the wrong reason. */
  const pickerHeight = lift(PAGE, /^const EVENT_MODAL_WIDE = '(md:h-\[90vh\])/m, 'the two-pane modal height')
  const pickerWidth = wideShell.replace(pickerHeight, '').trim()
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
  <div id="modal" class="${shell} ${breakScroll ? '' : pickerHeight} ${pickerWidth}" style="margin:auto">

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
/**
 * MENU › KITCHEN CAPACITY — one box, or one per van.
 *
 * 🔴 REWRITTEN 4 OCTOBER 2026: the van picker and the per-van switch are gone. A multi-van truck is
 * asked ONE question — "Same kitchen capacity for all vans?" — answered with Settings' own green
 * `<Toggle>`, and the answer decides whether there is ONE box ("All vans · Kitchen capacity") or one
 * per van ("<van name> · Kitchen capacity").
 *
 * @param vans how many ACTIVE vans. 1 ⇒ no question at all, just the box.
 * @param allSame the answer. true ⇒ one box; false ⇒ one per van. Ignored when `vans` is 1.
 */
function capacityFixture(css, vans = 1, allSame = true) {
  const grid = lift(KCLIB, /export const KITCHEN_CAPACITY_GRID =\n\s*'(.+?)' \+/, 'the capacity grid template')
  const grid2 = lift(KCLIB, /\+\n\s*'(sm:grid-cols-.+?)'/, 'the sm half of the grid template')
  const card = lift(KC, /<div className="(bg-slate-50 border border-slate-200 rounded-xl p-3)">/, 'the capacity card')
  /* 🔴 THE QUESTION ROW'S CARD, AND THE SHARED SWITCH'S OWN CLASSES — both lifted, because the whole
   * point of the 4 October change is that this row looks like every other setting row in Manage. If
   * either drifts, this fixture stops building rather than measuring a row nobody is served. */
  const sw = lift(KC, /<div className="(bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3)">/, 'the question row')
  const togTrack = lift(PRIM, /<div className=\{`(relative w-11 h-6 rounded-full transition-colors) \$\{on \? 'bg-green-500' : 'bg-slate-300'\}`\}>/, 'the shared toggle track')
  const togKnob = lift(PRIM, /<div className=\{`(absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform)/, 'the shared toggle knob')
  const hdr = 'text-[11px] font-bold uppercase tracking-wide text-slate-400'
  // Real category names — the first column is `minmax(0,1fr)` and text is what fills it.
  const CATS = ['Pizzas', 'Loaded fries & sides', 'Dips', 'Soft drinks']
  const sel = v => `<select style="width:100%"><option>${v}</option></select>`
  const rows = CATS.map(c => `
        <div class="min-w-0"><span class="min-w-0 truncate text-sm text-slate-700">${c}</span></div>
        <div>${sel('4 items')}</div><div>${sel('every 7 min')}</div>
        <div class="text-center"><input type="checkbox"></div>`).join('')
  /** One box. `id` is set on the first so the measurement can find it. */
  const box = (title, first) => `
    <div class="${card}"${first ? ' id="kcCard"' : ''}>
      <p class="text-sm font-bold text-slate-800 mb-3"${first ? ' id="kcTitle"' : ''}>${title}</p>
      <div${first ? ' id="kcGrid"' : ''} class="${grid} ${grid2} gap-y-2 items-center">
        <span${first ? ' id="kcCatHdr"' : ''} class="min-w-0 truncate ${hdr}">Category</span>
        <span class="${hdr}">Items</span>
        <span class="${hdr}">Prep</span>
        <span${first ? ' id="kcCountsHdr"' : ''} class="${hdr} text-center leading-tight">Counts to total capacity</span>
        ${rows}
      </div>
      <div${first ? ' id="kcTotal"' : ''} class="${grid} ${grid2} items-center mt-2 pt-2.5 border-t border-slate-100">
        <span${first ? ' id="kcTotalLbl"' : ''} class="min-w-0 truncate text-sm font-semibold text-slate-700">Total capacity</span>
        <div>${sel('12 items')}</div><div>${sel('every 5 min')}</div><span></span>
      </div>
    </div>`

  const VAN_NAMES = ['Main van', 'Festival trailer']
  /* 🔴 THE BOXES THE SCREEN WOULD DRAW, from the same rule the component uses. */
  const boxes = (vans === 1 || allSame)
    ? [box(vans > 1 ? 'All vans · Kitchen capacity' : 'Kitchen capacity', true)]
    : VAN_NAMES.slice(0, vans).map((n, i) => box(`${n} · Kitchen capacity`, i === 0))

  /* The question, only with more than one van — the shared Toggle on the right, like every other
   * on/off setting in Settings. ⚠️ NO HELPER LINE: it was removed on 4 October. */
  const question = vans > 1 ? `
    <div id="kcQuestion" class="${sw}">
      <div class="min-w-0">
        <p class="text-sm font-semibold text-slate-800">Same kitchen capacity for all vans?</p>
      </div>
      <button id="kcToggle" class="flex items-center gap-2 group">
        <div class="${togTrack} ${allSame ? 'bg-green-500' : 'bg-slate-300'}"><div class="${togKnob} ${allSame ? 'translate-x-6' : 'translate-x-1'}"></div></div>
      </button>
    </div>` : ''

  return `${HEAD(css)}
<div style="max-width:1024px;margin:0 auto;padding:0 16px">
  <div id="kcRoot" class="space-y-4 py-4">
    <!-- A REFERENCE SWATCH: the switch's colour is compared to a bg-green-500 element rendered by
         the same stylesheet, rather than to a colour string. Tailwind v4 emits an oklch variable. -->
    <span id="refGreen" class="bg-green-500" style="position:absolute;width:1px;height:1px"></span>
    <p class="text-sm text-slate-500">How many items your kitchen can make, so customers can only pick collection times you can meet.</p>
    ${question}${boxes.join('')}
  </div>
</div></body></html>`
}

/* 🔴 THE PILL LABELS ARE LIFTED FROM `MENU_SECTIONS`, NOT TYPED HERE (October 2026). They used to be a
 * hard-coded `['Items', 'Extras & upsells', 'Deals', 'Fourth section', …]` with `pillCount = 3`, and
 * when Kitchen capacity became a fourth pill this fixture went on measuring three pills with one
 * invented label — a layout nobody is served, which is the exact failure this file's header warns
 * about. The real labels matter because a pill row is measured in TEXT: 'Kitchen capacity' is the
 * widest of the four, so a made-up 'Deals' in its place would under-measure the row at 390px.
 * ⚠️ IT ALSO TRACKS THE ORDER, which changed on 4 October (capacity moved to second). Order does not
 * affect whether the row fits, but a fixture that disagrees with the screen is worth nothing. */
function menuPillLabels() {
  const block = lift(PAGE, /const MENU_SECTIONS: \{ id: MenuSection; label: string \}\[\] = \[([\s\S]*?)\n\]/, 'MENU_SECTIONS')
  const labels = [...block.matchAll(/label: '([^']+)'/g)].map(m => m[1])
  if (labels.length < 2) throw new Error('the fixture cannot be built: MENU_SECTIONS yielded no labels')
  return labels
}
function menuPillFixture(css, pillCount) {
  const row = lift(PAGE, /const SUBTAB_BAR = '(.+?)'/, 'the shared sub-tab bar')
  const inner = lift(PAGE, /const SUBTAB_ROW = '(.+?)'/, 'the sub-tab row')
  /* The 320px clipping control asks for MORE pills than exist, to force a genuine overflow; the
   * extras repeat the longest real label so the overflow is realistic rather than six short words. */
  const real = menuPillLabels()
  const longest = real.slice().sort((a, b) => b.length - a.length)[0]
  const labels = pillCount == null ? real : [...real, ...Array(Math.max(0, pillCount - real.length)).fill(longest)]
  pillCount = pillCount == null ? real.length : pillCount
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
function settingsFixture(css, breakSticky = false, breakFlush = false, withBanner = false, direct = false, bannerAbove = false, breakPad = false) {
  /* 🔴 LIFTED FROM THE SHARED CONSTANT all three sub-tab rows now use. If the real class list
   * changes, `lift` throws rather than quietly measuring a bar the page no longer has. */
  const bar = lift(PAGE, /const SUBTAB_BAR = '(.+?)'/, 'the shared sub-tab bar')
  const barInnerC = lift(PAGE, /const SUBTAB_ROW = '(.+?)'/, 'the sub-tab row')
  /* 🔴 AND THE WRAPPER CLASS, because the flush-top fix is a RULE ON THE WRAPPER keyed on
   * `data-subtab-bar`, not a margin on the bar. Measuring the bar alone would not exercise it. */
  /* 🔴 THE WRAPPER'S PADDING IS A JSX BOOLEAN NOW, not a `:has()` rule, so `breakPad` is what puts it
   * back — i.e. a tab wrongly left out of `TABS_WITH_SUBTABS`. `breakFlush` still drops
   * `data-subtab-bar`, which is now only enough to disable the SECOND belt. */
  const pad = padClass(breakPad)
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
      ${bannerAbove ? BANNER : ''}
      ${direct ? '' : '<div class="space-y-6">'}
        <div id="jumpbar" ${breakFlush ? '' : 'data-subtab-bar'} class="${bar}">
          <div class="${barInner}">
            ${labels.map((l, i) => `<button data-settings-tab="${ids[i]}" style="padding:10px 0;font-weight:700;font-size:14px;white-space:nowrap;border-bottom:2px solid ${i === 0 ? '#f97316' : 'transparent'};background:none">${l}</button>`).join('')}
          </div>
        </div>
        ${withBanner ? BANNER : ''}
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
  /* ── THE SCHEDULE SETTINGS MODAL AND THE PILL BARS ────────────────────────────────────────────── */
  for (const id of ['smodal', 'sheader', 'sbody', 'sfoot', 'sclose', 'bar', 'barRow', 'pill0', 'feCard', 'feTitle', 'feSource', 'feBtn']) {
    const el = document.getElementById(id)
    if (!el) { out[id] = null; continue }
    const r = el.getBoundingClientRect()
    out[id] = { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right),
      bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) }
  }
  const sb = document.getElementById('sbody')
  out.sbodyScrolls = sb ? sb.scrollHeight > sb.clientHeight + 1 : null
  const barEl = document.getElementById('bar'), rowEl = document.getElementById('barRow')
  const scEl = document.getElementById('scroller')
  out.scrollerTop = scEl ? Math.round(scEl.getBoundingClientRect().top) : null
  out.barRows = rowEl ? [...new Set([...rowEl.children].map(k => Math.round(k.getBoundingClientRect().top)))].length : null
  /* 🔴 THE PILL'S RADIUS AND THE ROW'S GAP, COMPUTED. A class census would see `rounded-full` and
   * `gap-1.5` in the source and still be wrong about what the engine did with them. */
  out.pillRadius = (() => {
    const e = document.getElementById('pill0')
    return e ? Math.round(parseFloat(getComputedStyle(e).borderTopLeftRadius)) : null
  })()
  out.pillGap = rowEl ? Math.round(parseFloat(getComputedStyle(rowEl).columnGap || '0')) : null
  /* 🔴 IS THE BUTTON BESIDE THE TEXT, OR UNDER IT? Measured from the two boxes, not from a class —
   * `sm:flex-row` is a claim about a breakpoint, and which side of it a given width falls on is the
   * thing worth checking. */
  out.feStacked = (() => {
    const t = document.getElementById('feTitle'), b = document.getElementById('feBtn')
    if (!t || !b) return null
    return b.getBoundingClientRect().top >= t.getBoundingClientRect().bottom - 1
  })()
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
  /* ── MENU › KITCHEN CAPACITY ───────────────────────────────────────────────────────────────────
   * 🔴 `nameW` IS THE NUMBER THAT MATTERS. It is the rendered width of the `minmax(0,1fr)` first
   * column. The defect this screen could reintroduce collapses it to 0 and pushes the ceiling selects
   * off-screen — invisible to every check except a measurement of it. */
  const kcGrid = document.getElementById('kcGrid')
  if (kcGrid) {
    const first = document.getElementById('kcCatHdr')
    const counts = document.getElementById('kcCountsHdr')
    const card = document.getElementById('kcCard')
    const sels = [...kcGrid.querySelectorAll('select')]
    const totalLbl = document.getElementById('kcTotalLbl')
    out.kc = {
      nameW: first ? Math.round(first.getBoundingClientRect().width) : 0,
      countsRight: counts ? Math.round(counts.getBoundingClientRect().right) : 0,
      cardRight: card ? Math.round(card.getBoundingClientRect().right) : 0,
      cardW: card ? Math.round(card.getBoundingClientRect().width) : 0,
      selCount: sels.length,
      /* Every select fully inside the viewport AND of a real size. ⚠️ `width > 8` is not padding:
       * the collapse being guarded against renders a select at or near zero width, which still has a
       * box and still reports a rect. */
      selsOnScreen: sels.every(e => { const r = e.getBoundingClientRect(); return r.left >= -1 && r.right <= window.innerWidth + 1 && r.width > 8 && r.height > 8 }),
      /* The Total-capacity row uses the SAME template, so its first column must be the same width as
       * the table's. This is the alignment the shared constant exists for. */
      totalAligned: (totalLbl && first)
        ? Math.abs(Math.round(totalLbl.getBoundingClientRect().width) - Math.round(first.getBoundingClientRect().width)) <= 1 : null,
      // Does the header row overlap? `Category` ending past where `Items` starts is the old overlap bug.
      headerOverlap: (() => {
        const ks = [...kcGrid.children].slice(0, 4).map(e => e.getBoundingClientRect())
        return ks.some((r, i) => i > 0 && r.left < ks[i - 1].right - 1)
      })(),
    }
  } else { out.kc = null }
  const kcRoot = document.getElementById('kcRoot')
  const kcQ = document.getElementById('kcQuestion')
  const kcTog = document.getElementById('kcToggle')
  out.kcScreen = kcRoot ? {
    /* ── THE 4 OCTOBER SCREEN: one question, and one box or one per van ───────────────────────── */
    question: !!kcQ,
    questionTop: kcQ ? Math.round(kcQ.getBoundingClientRect().top) : null,
    questionRight: kcQ ? Math.round(kcQ.getBoundingClientRect().right) : null,
    /** How many capacity boxes the screen drew — 1 under "same for all", one per van otherwise. */
    boxes: [...kcRoot.children].filter(el => el.querySelector('[id^=kcGrid], .grid') || /Kitchen capacity/.test(el.textContent || '') && el.querySelector('select')).length,
    firstTitle: (() => { const e = document.getElementById('kcTitle'); return e ? (e.textContent || '').trim() : null })(),
    /* 🔴 THE SWITCH, MEASURED — it must be Settings' own 44×24 green track, on the right. A
     * look-alike with different numbers is exactly what this build removed. */
    switchW: (() => { const d = kcTog && kcTog.firstElementChild; return d ? Math.round(d.getBoundingClientRect().width) : null })(),
    switchH: (() => { const d = kcTog && kcTog.firstElementChild; return d ? Math.round(d.getBoundingClientRect().height) : null })(),
    /* 🔴 COMPARED TO A REFERENCE `bg-green-500`, not to a colour string. The computed value, so a
     * purged class (which leaves the class name and no colour) fails. */
    switchGreen: (() => {
      const d = kcTog && kcTog.firstElementChild
      const ref = document.getElementById('refGreen')
      if (!d || !ref) return null
      return getComputedStyle(d).backgroundColor === getComputedStyle(ref).backgroundColor
    })(),
    switchOn: (() => {
      const d = kcTog && kcTog.firstElementChild
      const ref = document.getElementById('refGreen')
      if (!d || !ref) return null
      return getComputedStyle(d).backgroundColor === getComputedStyle(ref).backgroundColor
    })(),
    /** The switch's right edge — the old key pointed at an element this screen no longer has. */
    switchRight: kcTog ? Math.round(kcTog.getBoundingClientRect().right) : null,
    /** ⛔ Any leftover Yes/No pair. */
    yesNoButtons: [...kcRoot.querySelectorAll('button')].filter(b => ['Yes', 'No'].includes((b.textContent || '').trim())).length,
    rootH: Math.round(kcRoot.getBoundingClientRect().height),
    picker: !!document.getElementById('kcPicker'),
    hasSwitch: !!document.getElementById('kcSwitch'),
    table: !!document.getElementById('kcCard'),
    explainer: !!document.getElementById('kcExplainer'),
    /* ⛔ THE OLD `kcSwitch` KEY IS GONE WITH THE PER-VAN SWITCH IT MEASURED. It was a DUPLICATE
     * `switchRight` later in this object literal, so it silently overrode the one above and the
     * "on the right" check read null for every width. */
  } : null
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

/**
 * SCHEDULE › SCHEDULE SETTINGS — the modal the two cards moved into.
 *
 * 🔴 THE SHELL IS WHAT IS MEASURED. The two cards inside are the ones that stood in Settings and are
 * unchanged; what is new is that they are now in a dialog, which has to fit a phone, keep its close
 * button reachable, and scroll its own body rather than the page.
 * ⚠️ EVERY CLASS IS LIFTED from components/manage/ScheduleSettingsModal.tsx, so a restyle breaks the
 * fixture rather than leaving it measuring a dialog nobody is served.
 */
function scheduleModalFixture(css) {
  const shell = lift(SSM, /className="(bg-white w-full max-w-\[560px\] max-h-\[92vh\] rounded-2xl shadow-2xl flex flex-col overflow-hidden)"/, 'the modal shell')
  const header = lift(SSM, /<div className="(shrink-0 flex items-center gap-3 px-4 sm:px-5 py-4 border-b border-slate-200)">/, 'the modal header')
  const body = lift(SSM, /<div className="(flex-1 min-h-0 overflow-y-auto p-4 space-y-4)">/, 'the modal body')
  const foot = lift(SSM, /<div className="(shrink-0 px-4 sm:px-5 py-3 border-t border-slate-200 flex justify-end)">/, 'the modal footer')
  const title = lift(SSM, /<h2 className="font-bold text-slate-900 text-lg min-w-0 flex-1">(.+?)<\/h2>/, 'the modal title')
  return `${HEAD(css)}
<div class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4" style="position:fixed;inset:0">
  <div id="smodal" data-schedule-settings-modal class="${shell}">
    <div id="sheader" class="${header}">
      <h2 class="font-bold text-slate-900 text-lg min-w-0 flex-1">${title}</h2>
      <button id="sclose" aria-label="Close" class="shrink-0 w-10 h-10 rounded-full bg-slate-100 text-slate-600 text-lg font-bold">✕</button>
    </div>
    <div id="sbody" class="${body}">
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
        <p class="text-base font-bold text-slate-800">Your schedule</p>
        ${filler("I'll add events myself / Find my events automatically", 92)}
        <div><p class="text-sm font-semibold text-slate-800">Where do you post your schedule?</p>
          <input class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white" value="pizzakitchen.co.uk/events">
        </div>
        <button class="border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold">Verify</button>
      </div>
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-3">
        <p class="text-base font-bold text-slate-800">Import exclusions</p>
        ${filler('three excluded terms, each with a remove button', 140)}
      </div>
    </div>
    <div id="sfoot" class="${foot}">
      <button class="bg-orange-500 text-white rounded-xl px-4 py-2 text-sm font-bold">Done</button>
    </div>
  </div>
</div></body></html>`
}

/**
 * ONE STICKY SUB-TAB BAR, with a given set of labels — Menu's, Schedule's or Settings'.
 *
 * 🔴 ALL THREE RENDER FROM ONE DEFINITION (`SUBTAB_BAR`/`SUBTAB_ROW`/`subtabBtn`), so measuring them
 * separately is measuring that claim rather than trusting it: if one bar ever stopped matching, its
 * pills would be a different size here.
 * ⚠️ THE SHELL IS REBUILT, NOT JUST THE BAR, because what is being measured is a `position: sticky`
 * child of a NON-DOCUMENT scroller. A fixture that scrolled the document would answer a different
 * question — the bar would stick to the viewport and every assertion would pass for the wrong reason.
 */
function barFixture(css, labels, activeIdx = 0, { notice = false, noticeAbove = false, breakFlush = false, breakPad = false } = {}) {
  const bar = lift(PAGE, /const SUBTAB_BAR = '(.+?)'/, 'the shared sub-tab bar')
  const row = lift(PAGE, /const SUBTAB_ROW = '(.+?)'/, 'the shared sub-tab row')
  const btn = lift(PAGE, /const subtabBtn = \(on: boolean\) =>\s*\n\s*`(.+?) \$\{/, 'the shared pill')
  const on = lift(PAGE, /on \? '(bg-slate-900 text-white)'/, 'the active pill')
  const off = lift(PAGE, /: '(bg-slate-100 text-slate-700 hover:bg-slate-200)'/, 'the inactive pill')
  /* 🔴 THE REAL SHELL AND THE REAL PADDED WRAPPER (4 October 2026). This fixture used to build its own
   * `<main class="flex-1 overflow-y-auto">` with a plain `max-w-5xl px-4` div inside — which had no
   * `pt-6` and no `.manage-tab-pad`, so its "flush at rest" assertion could not fail. It passed green
   * on the very build whose bars Dominic reported as sitting low and jumping. A fixture that cannot
   * reproduce the defect is not measuring the page; both classes are lifted from the source now. */
  const shell = lift(PAGE, /<div className="(bg-slate-50 h-dvh flex flex-col overflow-hidden)">/, 'the app shell')
  const main = lift(PAGE, /<main id=\{MANAGE_SCROLLER_ID\} className=\{"(.+?)"\}>/, 'the manage scroller')
  const pad = padClass(breakPad)
  const notif = `<div id="notice" style="background:#fef3c7;border:1px solid #fde68a;border-radius:12px;padding:12px" class="mb-4">a notification banner</div>`
  return `${HEAD(css)}
<div class="${shell}">
  <div class="shrink-0 h-14 bg-slate-900"></div>
  <main id="scroller" class="${main}">
    <div class="${pad}">
      ${noticeAbove ? notif : ''}
      <div id="bar" ${breakFlush ? '' : 'data-subtab-bar'} class="${bar} mb-4">
        <div id="barRow" class="${row}">
          ${labels.map((l, i) => `<button id="pill${i}" class="${btn} ${i === activeIdx ? on : off}">${l}</button>`).join('')}
        </div>
      </div>
      ${notice ? notif : ''}
      ${filler('the section below the bar', 2400)}
    </div>
  </main>
</div></body></html>`
}


/**
 * SCHEDULE › EVENTS — the "Finding events automatically" card.
 *
 * 🔴 WHAT IS MEASURED: that it is a CARD with a real BUTTON, and that on a phone the button sits
 * UNDER the text at full width rather than beside it. At 390 a right-aligned button next to wrapping
 * text is a narrow tap target at the end of a line, which is the shape this replaced.
 * ⚠️ BOTH STATES, because the manual one has no source line and a longer title — if the row only ever
 * fitted in the automatic state, the truck that types its own events would get the broken one.
 */
function findingEventsFixture(css, auto = true) {
  const card = lift(PAGE, /<Card className="(p-4 flex flex-col sm:flex-row sm:items-center gap-3)" data-finding-events-card>/, 'the finding-events card')
  const cardBase = lift(PRIM, /return <div className=\{`(bg-white rounded-2xl border border-slate-200 shadow-sm) \$\{className\}`\}>/, 'the shared Card')
  const btnGhost = lift(PRIM, /ghost:\s+'(.+?)'/, 'the ghost button palette')
  const btnBase = lift(PRIM, /className=\{`\$\{colours\[colour\] \|\| colours\.orange\} \$\{sizes\[size\]\} (.+?) \$\{className\}`\}>/, 'the button base')
  return `${HEAD(css)}
<div style="max-width:1040px;margin:0 auto;padding:16px">
  <div id="feCard" class="${cardBase} ${card}">
    <div class="min-w-0 flex-1">
      <p id="feTitle" class="text-sm font-semibold text-slate-800">${auto ? 'Finding events automatically' : "You&apos;re managing your schedule manually"}</p>
      ${auto ? '<p id="feSource" class="text-xs text-slate-500 mt-0.5">From your website</p>' : ''}
    </div>
    <button id="feBtn" class="${btnGhost} text-sm px-4 py-2 ${btnBase} w-full sm:w-auto justify-center">Schedule settings</button>
  </div>
  <div class="flex items-center justify-end" style="padding-top:12px"><span id="feFilter"></span></div>
  ${filler('the events list', 280)}
</div></body></html>`
}

async function engines() {
  const out = []
  try {
    const puppeteer = require('puppeteer')
    const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
    const page = await b.newPage()
    out.push({ name: 'Chromium', close: () => b.close(), page,
      setViewport: (w, h) => page.setViewport({ width: w, height: h }),
      /* ⚠️ THE VIEWPORT, NOT THE ELEMENT. An element screenshot of a child of a `position: fixed`
       * overlay hangs in both engines here — the first version of this did that and the harness
       * stopped producing output at all. A viewport shot at a named width shows the same thing and
       * cannot hang. */
      shot: async (file) => { await page.screenshot({ path: file }) } })
  } catch (e) { out.push({ name: 'Chromium', skip: String(e.message).split('\n')[0].slice(0, 110) }) }
  try {
    const { webkit } = require('playwright')
    const b = await webkit.launch()
    const page = await b.newPage()
    out.push({ name: 'WebKit', close: () => b.close(), page,
      setViewport: (w, h) => page.setViewportSize({ width: w, height: h }),
      shot: async (file) => { await page.screenshot({ path: file }) } })
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

  /* 🔴 SCREENSHOTS. ⚠️ THEY ARE RENDERS OF FIXTURES built from the real class strings, NOT captures of
   * a running page — that needs a database and a live truck, which this harness must never touch.
   * The report says so wherever it links them. */
  const shotDir = path.join(REPO, 'docs/screenshots/manage-moves-2')
  fs.mkdirSync(shotDir, { recursive: true })

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


    /* ══ 🔴 MENU › KITCHEN CAPACITY, AT THE THREE WIDTHS ═══════════════════════════════════════════
     * The table did not change; its container did. These are the four questions that answers:
     *   1. does the name column keep a real width (the old collapse), 
     *   2. are all six ceiling/prep selects on screen and clickable,
     *   3. does the Total-capacity row still line up with the table above it,
     *   4. and does the page scroll sideways. */
    for (const [w, h, label] of [[1440, 900, 'desktop'], [820, 1180, 'iPad portrait'], [390, 844, 'phone']]) {
      await eng.setViewport(w, h)
      await eng.page.goto(write(`kc-${w}-${eng.name}.html`, capacityFixture(css, 1)))
      const r = await eng.page.evaluate(rects)
      lines.push(`  capacity ${w}×${h} (${label})  name ${r.kc.nameW} · counts→${r.kc.countsRight} · card ${r.kc.cardW}→${r.kc.cardRight} · selects ${r.kc.selCount} · doc ${r.docScrollW} vs ${r.innerW}`)
      t(r.kc.nameW >= 60, `🔴 capacity ${w}: the Category column keeps a real width (${r.kc.nameW}px) — NOT the old collapse to 0`)
      t(r.kc.selsOnScreen, `🔴 capacity ${w}: all ${r.kc.selCount} selects are fully on screen and of real size`)
      t(!r.kc.headerOverlap, `🔴 capacity ${w}: no header cell overlaps its neighbour`)
      t(r.kc.totalAligned === true, `⚠️ capacity ${w}: the Total-capacity row lines up with the table (same shared template)`)
      t(r.docScrollW <= r.innerW, `🔴 capacity ${w}: NO HORIZONTAL PAGE SCROLL`)
      t(r.kc.cardRight <= r.innerW + 1, `⚠️ capacity ${w}: the card does not spill past the viewport`)
    }
    /* 🔴 THE CLIPPING CONTROL — 320px, narrower than any phone this is measured at. The template's own
     * comment says the fixed columns overflowed a ~311px phone once. If the name column survives even
     * here the checks above are not passing by luck of a roomy viewport. */
    {
      await eng.setViewport(320, 844)
      await eng.page.goto(write(`kc-320-${eng.name}.html`, capacityFixture(css, 1)))
      const r = await eng.page.evaluate(rects)
      lines.push(`  capacity 320 (control)  name ${r.kc.nameW} · doc ${r.docScrollW} vs ${r.innerW}`)
      t(r.kc.nameW > 0, `🔴 CONTROL at 320px: the Category column is still non-zero (${r.kc.nameW}px)`)
      t(r.docScrollW <= r.innerW, '🔴 …and the page still does not scroll sideways')
    }
    /* ══ 🔴 THE THREE STATES OF THE CAPACITY SCREEN (4 October 2026) ═══════════════════════════════
     * The van picker and the per-van switch are gone. What there is now:
     *   ONE VAN            — no question at all, just the box.
     *   TWO VANS, ON       — the question, and ONE box titled "All vans · Kitchen capacity".
     *   TWO VANS, OFF      — the question, and ONE BOX PER VAN, each titled with its van's name.
     * 🔴 THE QUESTION ROW IS MEASURED IN BOTH POSITIONS, because it is the row Dominic reported as
     * matching nothing else in Manage: it must be the shared green switch, on the right, in a card
     * the same shape as Settings' own setting rows. */
    /** The question row's top under the previous answer — it must not move when the answer does. */
    let lastQuestionTop = null
    for (const [w, h] of [[1440, 900], [820, 1180], [390, 844]]) {
      await eng.setViewport(w, h)

      // ── ONE VAN: no question ──────────────────────────────────────────────────────────────────
      await eng.page.goto(write(`kc1-${w}-${eng.name}.html`, capacityFixture(css, 1)))
      let r = await eng.page.evaluate(rects)
      lines.push(`  capacity ${w} · 1 van        question ${r.kcScreen.question} · boxes ${r.kcScreen.boxes} · title "${r.kcScreen.firstTitle}" · doc ${r.docScrollW}`)
      t(r.kcScreen.question === false, `🔴 ${w}/1 van: NO question — a question with one answer is furniture`)
      t(r.kcScreen.boxes === 1, `🔴 ${w}/1 van: exactly one box`)
      t(r.kcScreen.firstTitle === 'Kitchen capacity', `⚠️ ${w}/1 van: …titled plainly, with no "All vans" prefix`)
      t(r.docScrollW <= r.innerW, `🔴 ${w}/1 van: NO HORIZONTAL PAGE SCROLL`)

      // ── TWO VANS, SWITCH ON: one box for all of them ──────────────────────────────────────────
      await eng.page.goto(write(`kcY-${w}-${eng.name}.html`, capacityFixture(css, 2, true)))
      r = await eng.page.evaluate(rects)
      lines.push(`  capacity ${w} · 2 vans ON    question ${r.kcScreen.question} · boxes ${r.kcScreen.boxes} · title "${r.kcScreen.firstTitle}" · switch on ${r.kcScreen.switchOn} · doc ${r.docScrollW}`)
      t(r.kcScreen.question === true, `🔴 ${w}/2 vans: the question IS asked`)
      t(r.kcScreen.boxes === 1, `🔴 ${w}/2 vans ON: ONE box for every van`)
      t(r.kcScreen.firstTitle === 'All vans · Kitchen capacity', `🔴 ${w}/2 vans ON: …titled "All vans · Kitchen capacity"`)
      t(r.kcScreen.switchOn === true, `🔴 ${w}/2 vans ON: the switch reads ON`)
      t(r.kc.nameW >= 60 && r.kc.selsOnScreen, `🔴 ${w}/2 vans ON: the table is usable under the question`)
      t(r.docScrollW <= r.innerW, `🔴 ${w}/2 vans ON: NO HORIZONTAL PAGE SCROLL`)
      /* 🔴 THE SWITCH IS SETTINGS' OWN, ON THE RIGHT. Measured, not grepped: the track is 44×24 (the
       * shared `w-11 h-6`), it is green when on, and its right edge is at the row's right edge. */
      t(r.kcScreen.switchW === 44 && r.kcScreen.switchH === 24,
        `🔴 ${w}/2 vans: the switch is the shared 44×24 track (${r.kcScreen.switchW}×${r.kcScreen.switchH})`)
      t(r.kcScreen.switchGreen === true, `🔴 ${w}/2 vans ON: …and it is Settings' green, not an accent colour`)
      lastQuestionTop = r.kcScreen.questionTop
      t(r.kcScreen.switchRight <= r.innerW + 1 && r.kcScreen.questionRight - r.kcScreen.switchRight <= 20,
        `🔴 ${w}/2 vans: …on the RIGHT of the row, like every other setting`)
      /* ⛔ AND NO Yes/No PAIR SURVIVES. */
      t(r.kcScreen.yesNoButtons === 0, `⛔ ${w}/2 vans: no Yes/No buttons — the control Manage has nowhere else`)

      // ── TWO VANS, SWITCH OFF: one box per van ─────────────────────────────────────────────────
      await eng.page.goto(write(`kcN-${w}-${eng.name}.html`, capacityFixture(css, 2, false)))
      r = await eng.page.evaluate(rects)
      lines.push(`  capacity ${w} · 2 vans OFF   question ${r.kcScreen.question} · boxes ${r.kcScreen.boxes} · title "${r.kcScreen.firstTitle}" · switch on ${r.kcScreen.switchOn} · doc ${r.docScrollW}`)
      t(r.kcScreen.boxes === 2, `🔴 ${w}/2 vans OFF: ONE BOX PER VAN (${r.kcScreen.boxes})`)
      t(r.kcScreen.firstTitle === 'Main van · Kitchen capacity', `🔴 ${w}/2 vans OFF: …each titled with its van's name`)
      t(r.kcScreen.switchOn === false, `🔴 ${w}/2 vans OFF: the switch reads OFF`)
      t(r.kc.nameW >= 60 && r.kc.selsOnScreen, `🔴 ${w}/2 vans OFF: the first box is still usable`)
      t(r.docScrollW <= r.innerW, `🔴 ${w}/2 vans OFF: NO HORIZONTAL PAGE SCROLL`)
      /* 🔴 THE QUESTION ROW DOES NOT MOVE BETWEEN THE TWO ANSWERS. Switching the answer changes how
       * many boxes are BELOW it; the row itself must stay where it is, or every press makes the thing
       * you just pressed jump. */
      t(r.kcScreen.questionTop === lastQuestionTop,
        `🔴 ${w}: the question row does not move when the answer changes (${r.kcScreen.questionTop} vs ${lastQuestionTop})`)
    }

    /* ⚠️ ITS OWN WIDTH LOOP. The first version of this block sat AFTER the capacity loop's
     * closing brace, so `w` and `h` were out of scope and every `goto` was handed a URL built
     * from `undefined` — which timed out rather than failing loudly. */
    for (const [w, h] of [[1440, 900], [820, 1180], [390, 844]]) {
      await eng.setViewport(w, h)
      /* ══ 🔴 THE "FINDING EVENTS AUTOMATICALLY" CARD, IN BOTH STATES ════════════════════════════ */
      for (const auto of [true, false]) {
        await eng.page.goto(write(`fe-${w}-${auto ? 'auto' : 'manual'}-${eng.name}.html`, findingEventsFixture(css, auto)))
        const f = await eng.page.evaluate(rects)
        lines.push(`  finding-events ${w}×${h} ${auto ? 'auto  ' : 'manual'}  card ${f.feCard.width}×${f.feCard.height} · btn ${f.feBtn.width}×${f.feBtn.height} · stacked ${f.feStacked} · doc ${f.docScrollW}`)
        t(!f.pageScrollsSideways, `🔴 finding-events ${w} ${auto ? 'auto' : 'manual'}: NO HORIZONTAL PAGE SCROLL`)
        t(f.feBtn.height >= 36, `🔴 finding-events ${w}: the button is a real target, not a line of text (${f.feBtn.height}px)`)
        t(f.feBtn.right <= f.feCard.right + 1 && f.feBtn.left >= f.feCard.left - 1,
          `🔴 finding-events ${w}: the button stays inside the card`)
        t(auto ? !!f.feSource : !f.feSource,
          `⚠️ finding-events ${w}: the source line is shown ${auto ? 'under the title' : 'NOT shown when the truck adds events itself'}`)
        /* 🔴 THE PHONE RULE: under the text, full width. Above `sm` it sits beside the text. */
        if (w < 640) {
          t(f.feStacked === true, `🔴 finding-events ${w}: the button sits UNDER the text on a phone`)
          t(Math.abs(f.feBtn.width - (f.feCard.width - 32)) <= 2,
            `🔴 finding-events ${w}: …and is full width (${f.feBtn.width} in a ${f.feCard.width} card)`)
        } else {
          t(f.feStacked === false, `⚠️ finding-events ${w}: the button sits BESIDE the text above the sm breakpoint`)
        }
        if (w === 1440 || w === 390) {
          await eng.shot(path.join(shotDir, `finding-events-${w}-${auto ? 'auto' : 'manual'}-${eng.name.toLowerCase()}.png`))
        }
      }

      /* ══ 🔴 THE SCHEDULE SETTINGS MODAL, AND THE THREE PILL BARS ═══════════════════════════════════ */
      {
        await eng.page.goto(write(`smodal-${w}-${eng.name}.html`, scheduleModalFixture(css)))
        const m = await eng.page.evaluate(rects)
        lines.push(`  schedule modal ${w}×${h}  dialog ${m.smodal.width}×${m.smodal.height} · close ${m.sclose.right} · doc ${m.docScrollW} vs ${m.innerW}`)
        t(!m.pageScrollsSideways, `🔴 schedule modal ${w}: NO HORIZONTAL PAGE SCROLL`)
        t(m.smodal.width <= Math.min(560, w) + 2, `🔴 schedule modal ${w}: the dialog fits (${m.smodal.width}px)`)
        t(m.smodal.height <= h + 1, `🔴 schedule modal ${w}: …and fits the viewport's height`)
        t(m.sclose.right <= m.smodal.right + 1 && m.sclose.top >= -1,
          `🔴 schedule modal ${w}: the close button is on screen and inside the dialog`)
        t(m.sfoot.bottom <= m.smodal.bottom + 1, `⚠️ schedule modal ${w}: the Done button sits inside the dialog`)
        /* 🔴 THE BODY SCROLLS, NOT THE PAGE — the cards are taller than a phone. */
        t(m.sbodyScrolls === true || m.smodal.height < h,
          `🔴 schedule modal ${w}: the BODY scrolls when the cards do not fit, not the page`)
        if (w === 1440 || w === 390) {
          await eng.shot(path.join(shotDir, `schedule-settings-modal-${w}-${eng.name.toLowerCase()}.png`))
        }
      }

      /* 🔴 ALL THREE PILL BARS, AT REST AND WHEN STUCK. They render from ONE definition, so measuring
       * each is measuring that claim: if one ever stopped matching, its pills would differ here.
       * ⚠️ "AT REST" IS scrollTop 0, BEFORE ANYTHING IS TOUCHED — the assertion the 3 October fix exists
       * for, because the earlier version only checked flushness AFTER scrolling and a 24px resting gap
       * measured green. */
      for (const [barName, labels] of [
        ['Menu', menuPillLabels()],
        ['Schedule', ['Events', 'Weekly post', 'Places']],
        ['Settings', ['Truck details', 'Contact', 'Order settings', 'Truck settings', 'Schedule', 'QR code', 'Auto-replies', 'Account deletion']],
      ]) {
        await eng.page.goto(write(`bar-${barName}-${w}-${eng.name}.html`, barFixture(css, labels)))
        const b = await eng.page.evaluate(rects)
        lines.push(`  ${barName} bar ${w}×${h}  pill ${b.pill0.width}×${b.pill0.height} · rows ${b.barRows} · bar@${b.bar.top} scroller@${b.scrollerTop} · doc ${b.docScrollW}`)
        t(b.barRows === 1, `🔴 ${barName} ${w}: the pills stay on ONE row — they scroll, they do not wrap`)
        t(!b.pageScrollsSideways, `🔴 ${barName} ${w}: NO HORIZONTAL PAGE SCROLL`)
        /* ⚠️ WAS `>= 40`. Dominic lifted that floor on 4 October — "too high, too much space above and
       * below the text". The range is asserted instead of a floor, because the failure this guards is
       * a pill collapsing onto its text, not a pill being a particular height. */
      t(b.pill0.height >= 28 && b.pill0.height <= 40,
        `🔴 ${barName} ${w}: a pill is 28-40px high — shorter than the old floor, not collapsed (${b.pill0.height}px)`)
        t(b.pillRadius >= 16, `🔴 ${barName} ${w}: …and it is a PILL, not a tab (radius ${b.pillRadius}px)`)
        t(b.pillGap === 6, `⚠️ ${barName} ${w}: the gap is the boards' 6px (${b.pillGap}px)`)
        /* 🔴 AT REST: flush to the top of its scroller, scrollTop 0. */
        t(Math.abs(b.bar.top - b.scrollerTop) <= 1,
          `🔴 ${barName} ${w}: THE BAR IS FLUSH AT REST (bar@${b.bar.top} scroller@${b.scrollerTop})`)
        /* 🔴 AND WHEN STUCK: it stays put, still flush, after a real scroll. */
        const stuck = await eng.page.evaluate(() => {
          const sc = document.getElementById('scroller')
          sc.scrollTop = 1200
          const bar = document.getElementById('bar')
          return { scrolled: sc.scrollTop, barTop: Math.round(bar.getBoundingClientRect().top),
            scrollerTop: Math.round(sc.getBoundingClientRect().top) }
        })
        lines.push(`    …stuck after ${stuck.scrolled}px: bar@${stuck.barTop} scroller@${stuck.scrollerTop}`)
        t(stuck.scrolled > 0 && Math.abs(stuck.barTop - stuck.scrollerTop) <= 1,
          `🔴 ${barName} ${w}: STUCK FLUSH after scrolling ${stuck.scrolled}px`)
        /* 🔴 AND WITH A NOTICE SHOWING. The page's seven notification banners render BELOW the bar as
         * of 4 October 2026; this is the measurement that says so, and the `noticeAbove` run under it
         * is the same fixture with the notice back where it used to be — which must behave differently,
         * or neither run is measuring anything. */
        for (const [variant, opts, wantFlush] of [
          ['notice BELOW', { notice: true }, true],
          /* 🔴 `:has()` UNABLE TO MATCH — the bar must still be flush, because the wrapper's padding is
           * a JSX boolean and was never applied. See the Settings block below for why this matters. */
          ['no-has', { breakFlush: true }, true],
          ['notice ABOVE (broken)', { noticeAbove: true }, false],
          ['pt-6 back AND no-has (broken)', { breakFlush: true, breakPad: true }, false],
        ]) {
          await eng.page.goto(write(`bar-${barName}-${w}-${variant.split(' ')[1]}-${eng.name}.html`, barFixture(css, labels, 0, opts)))
          const n = await eng.page.evaluate(() => {
            const sc = document.getElementById('scroller')
            const bar = document.getElementById('bar')
            const at = () => Math.round(bar.getBoundingClientRect().top - sc.getBoundingClientRect().top)
            const rest = at()
            sc.scrollTop = 1200
            return { rest, scrolled: at() }
          })
          lines.push(`    …${variant}: at rest ${n.rest}px, after scrolling ${n.scrolled}px`)
          if (wantFlush) {
            t(n.rest <= 1 && n.scrolled <= 1,
              `🔴 ${barName} ${w}: ${variant} — flush at rest (${n.rest}px) and still flush scrolled`)
          } else {
            t(n.rest > 1 && n.scrolled <= 1,
              `🔴 ${barName} ${w}: BROKEN VARIANT ${variant} — two resting positions (${n.rest}px then ${n.scrolled}px), reproduced`)
          }
        }
        if (w === 1440 || w === 390) {
          await eng.page.goto(write(`bar-${barName}-${w}-${eng.name}.html`, barFixture(css, labels)))
          await eng.page.evaluate(() => { document.getElementById('scroller').scrollTop = 0 })
          await eng.shot(path.join(shotDir, `pills-${barName.toLowerCase()}-${w}-rest-${eng.name.toLowerCase()}.png`))
          await eng.page.evaluate(() => { document.getElementById('scroller').scrollTop = 1200 })
          await eng.shot(path.join(shotDir, `pills-${barName.toLowerCase()}-${w}-stuck-${eng.name.toLowerCase()}.png`))
        }
      }
    }

    /* ── 🔴 THE MENU PILLS, AT THE THREE WIDTHS ─────────────────────────────────────────────────── */
    for (const [w, h] of [[1440, 900], [820, 1180], [390, 844]]) {
      await eng.setViewport(w, h)
      await eng.page.goto(write(`mp-${w}-${eng.name}.html`, menuPillFixture(css)))
      const r = await eng.page.evaluate(rects)
      lines.push(`  menu pills ${w}×${h}  row ${r.menuPills.rowW} · content ${r.menuPills.contentW} · rows ${r.menuPills.rows} · doc ${r.docScrollW} vs ${r.innerW}`)
      t(r.menuPills.rows === 1, `🔴 menu pills ${w}: all ${menuPillLabels().length} stay on ONE row — they scroll, they do not wrap`)
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

    /* ── 🔴 THE NOTICE CASE — THE BAR IS STILL FLUSH, BECAUSE THE NOTICE IS BELOW IT ────────────────
     * 🔴 THIS ASSERTION IS THE REVERSE OF WHAT IT SAID UNTIL 4 OCTOBER 2026, deliberately. It used to
     * place the banner ABOVE the bar and assert that the wrapper then KEPT its top padding — i.e. it
     * asserted the degraded layout was correct. It is not: with anything above it the bar rests low
     * and snaps flush on the first scroll, which is what Dominic reported ("pushed down the screen a
     * little … when you scroll down the screen they move up"). The page's seven notices moved BELOW
     * each sub-tab bar, so the measurement is now "a notice costs the bar nothing".
     * ⚠️ BOTH HALVES: at rest AND after a real scroll. The defect was always two positions, never one. */
    {
      await eng.setViewport(1440, 900)
      await eng.page.goto(write(`set-banner-${eng.name}.html`, settingsFixture(css, false, false, true)))
      const b = await eng.page.evaluate(() => {
        const sc = document.getElementById('scroller')
        const bn = document.getElementById('banner')
        const jb = document.getElementById('jumpbar')
        const at = () => Math.round(jb.getBoundingClientRect().top - sc.getBoundingClientRect().top)
        const rest = at()
        const below = Math.round(bn.getBoundingClientRect().top - jb.getBoundingClientRect().bottom)
        sc.scrollTop = 1200
        return { rest, scrolled: at(), below }
      })
      lines.push(`  settings WITH A NOTICE BELOW THE BAR  bar at rest ${b.rest}px, after scrolling ${b.scrolled}px · notice ${b.below}px below the bar`)
      t(b.below >= 0, '🔴 settings: the notice renders BELOW the bar, not above it')
      t(b.rest <= 1 && b.scrolled <= 1,
        '🔴 settings: WITH A NOTICE SHOWING THE BAR IS STILL FLUSH AT REST AND STAYS PUT — one resting position, not two')
    }

    /* ── 🔴 THE BROKEN VARIANT: THE NOTICE BACK ABOVE THE BAR ───────────────────────────────────────
     * The same fixture with the banner moved back to where the page used to put it. This is the shape
     * of the 4 October report, and it must FAIL the assertion above — a guard that cannot reproduce
     * the defect it guards is not a guard. */
    {
      await eng.setViewport(1440, 900)
      await eng.page.goto(write(`set-banner-above-${eng.name}.html`, settingsFixture(css, false, false, false, false, true)))
      const b = await eng.page.evaluate(() => {
        const sc = document.getElementById('scroller')
        const jb = document.getElementById('jumpbar')
        const at = () => Math.round(jb.getBoundingClientRect().top - sc.getBoundingClientRect().top)
        const rest = at()
        sc.scrollTop = 1200
        return { rest, scrolled: at() }
      })
      lines.push(`  settings BROKEN (notice ABOVE the bar)  at rest ${b.rest}px, after scrolling ${b.scrolled}px`)
      t(b.rest > 1 && b.scrolled <= 1,
        '🔴 BROKEN VARIANT: a notice above the bar gives it two resting positions — the 4 October report, reproduced')
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

    /* ══ 🔴 THE FIX DOES NOT DEPEND ON `:has()` (4 October 2026) ═══════════════════════════════════
     * 🔴 WHY THIS ASSERTION EXISTS. The 3 October fix was a `:has()` rule, and it was reported as not
     * working — twice — on a build where this harness measured it working in both engines. The one way
     * both can be true is a browser WITHOUT `:has()`: Safari 15.4 / Chrome 105, and this app runs in an
     * iPad WKWebView. An unsupported selector is discarded silently; there is no error and nothing to
     * see. So the padding is a JSX boolean now (`TABS_WITH_SUBTABS`), and the rule is a second belt.
     * 🔴 THIS VARIANT DROPS `data-subtab-bar`, which is the closest this harness can get to "the rule
     * does not apply" — neither selector can match without it. The bar must STILL be flush, because
     * the wrapper was never given the padding in the first place. If this ever starts failing, the
     * page has gone back to relying on the rule. */
    {
      await eng.setViewport(1440, 900)
      await eng.page.goto(write(`set-nohas-${eng.name}.html`, settingsFixture(css, false, true)))
      const noHas = await eng.page.evaluate(() => {
        const sc = document.getElementById('scroller')
        const jb = document.getElementById('jumpbar')
        const at = () => Math.round(jb.getBoundingClientRect().top - sc.getBoundingClientRect().top)
        const rest = at()
        sc.scrollTop = 1200
        return { rest, scrolled: at(), pad: getComputedStyle(jb.closest('.manage-tab-pad')).paddingTop }
      })
      lines.push(`  settings WITH THE \`:has()\` RULE UNABLE TO MATCH  at rest ${noHas.rest}px, scrolled ${noHas.scrolled}px · wrapper padding-top ${noHas.pad}`)
      t(noHas.rest <= 1 && noHas.scrolled <= 1,
        '🔴 THE BAR IS FLUSH EVEN WHEN THE `:has()` RULE CANNOT MATCH — the fix is the JSX boolean, not the selector')
      t(noHas.pad === '0px',
        '⚠️ …because the wrapper is never given the padding on a tab that has a bar')
    }

    /* ── 🔴 THE SECOND BELT STILL WORKS ──────────────────────────────────────────────────────────
     * The wrapper is given `pt-6` back — a tab left out of `TABS_WITH_SUBTABS` — but keeps
     * `data-subtab-bar`. In a browser that HAS `:has()` the rule catches that mistake and the bar is
     * still flush. This is what the rule is kept for; it is not what the fix rests on. */
    {
      await eng.setViewport(1440, 900)
      await eng.page.goto(write(`set-belt-${eng.name}.html`, settingsFixture(css, false, false, false, false, false, true)))
      const belt = await eng.page.evaluate(() => {
        const sc = document.getElementById('scroller')
        const jb = document.getElementById('jumpbar')
        return { rest: Math.round(jb.getBoundingClientRect().top - sc.getBoundingClientRect().top) }
      })
      lines.push(`  settings WITH \`pt-6\` PUT BACK but \`data-subtab-bar\` present  at rest ${belt.rest}px`)
      t(belt.rest <= 1,
        '⚠️ THE `:has()` RULE IS STILL A WORKING SECOND BELT where the browser supports it')
    }

    /* ── 🔴 THE RESTING-GAP BROKEN VARIANT ──────────────────────────────────────────────────────
     * BOTH belts removed: the wrapper keeps `pt-6` AND the bar has no `data-subtab-bar`. This is the
     * reported defect — sticky cannot hold an element ABOVE its flow position, so at scrollTop 0 the
     * pin has nothing to do and the 24px gap shows, then vanishes on the first scroll.
     * 🔴 IT MUST SHOW AT REST AND VANISH AFTER SCROLLING — both halves, because "two resting
     * positions" is the defect, and a variant that was simply always-offset would not reproduce it. */
    {
      await eng.setViewport(1440, 900)
      await eng.page.goto(write(`set-gap-${eng.name}.html`, settingsFixture(css, false, true, false, false, false, true)))
      const gapV = await eng.page.evaluate(() => {
        const sc = document.getElementById('scroller')
        const jb = document.getElementById('jumpbar')
        const at = () => Math.round(jb.getBoundingClientRect().top - sc.getBoundingClientRect().top)
        const rest = at()
        sc.scrollTop = 1200
        return { rest, scrolled: at() }
      })
      lines.push(`  settings BROKEN (pt-6 back AND no data-subtab-bar)  at rest ${gapV.rest}px below the top, after scrolling ${gapV.scrolled}px`)
      t(gapV.rest > 1 && gapV.scrolled <= 1,
        '🔴 BROKEN VARIANT: with both belts gone the bar rests below the top and snaps flush once scrolled — the two resting positions, reproduced')
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

    /* ══ 🔴 THE SINGLE-EVENT POST — SETUP AND MODAL (stage 2) ═══════════════════════════
     * Same three widths, both engines. The modal is the one that matters on a phone: its body must
     * scroll and its buttons must stay reachable inside a 92vh box. */
    for (const which of ['setup', 'modal']) {
      for (const [w, h] of [[1440, 900], [820, 1180], [390, 844]]) {
        await eng.setViewport(w, h)
        await eng.page.goto(write(`ep-${which}-${w}-${eng.name}.html`, eventPostFixture(css, which)))
        const r = await eng.page.evaluate(() => {
          const box = (id) => {
            const el = document.getElementById(id)
            if (!el) return null
            const b = el.getBoundingClientRect()
            return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top),
              bottom: Math.round(b.bottom), width: Math.round(b.width), height: Math.round(b.height) }
          }
          const body = document.getElementById('mBody')
          const host = document.getElementById('scroller') || document.getElementById('mBody')
          return {
            stage: box('stage'), right: box('rightCol'), left: box('leftCol'),
            modal: box('modal'), actions: box('actions'), r0: box('R0'),
            hostLeft: host ? Math.round(host.getBoundingClientRect().left) : 0,
            hostRight: host ? Math.round(host.getBoundingClientRect().right) : 0,
            bodyScrolls: body ? body.scrollHeight > body.clientHeight + 1 : false,
            docScrollW: document.documentElement.scrollWidth,
            innerW: window.innerWidth,
            pageScrollsSideways: document.documentElement.scrollWidth > window.innerWidth + 1,
          }
        })
        lines.push(`  event ${which} ${w}×${h}  stage ${r.stage.width}×${r.stage.height} · right ${r.right.width}px · doc ${r.docScrollW} vs ${r.innerW}`)
        t(!r.pageScrollsSideways, `🔴 event ${which} ${w}: NO HORIZONTAL PAGE SCROLL`)
        t(r.stage.width > 0 && r.stage.height > 0, `🔴 event ${which} ${w}: the preview is visible`)
        t(Math.abs(r.stage.width / r.stage.height - 1080 / 1350) < 0.02,
          `🔴 event ${which} ${w}: …at the poster's own aspect ratio`)
        t(r.stage.left >= r.hostLeft - 1 && r.stage.right <= r.hostRight + 1,
          `⚠️ event ${which} ${w}: the preview is not clipped sideways`)
        t(!!r.r0 && r.r0.left >= r.hostLeft - 1 && r.r0.right <= r.hostRight + 1 && r.r0.width > 60,
          `🔴 event ${which} ${w}: the controls are reachable (${r.r0 ? r.r0.width : 0}px wide)`)
        if (which === 'modal') {
          /* 🔴 THE MODAL NEVER EXCEEDS THE VIEWPORT, and its BODY is what scrolls — not the page, and
           * not the modal itself, which would take the header and the buttons off screen with it. */
          t(r.modal.height <= h + 1 && r.modal.width <= w + 1,
            `🔴 event modal ${w}: the modal fits the viewport (${r.modal.width}×${r.modal.height})`)
          t(!!r.actions && r.actions.right <= r.hostRight + 1,
            `⚠️ event modal ${w}: Download / Copy text / Share fit without being clipped`)
        }
        /* ⚠️ THE TWO SCREENS STACK AT DIFFERENT WIDTHS, AND THAT IS DELIBERATE, NOT AN INCONSISTENCY.
         * The SETUP screen is three columns and needs `lg:` (1024) to be worth splitting; the MODAL is
         * two and splits at `md:` (768), which is the same breakpoint the Add event modal uses — so an
         * iPad in portrait gets the picture beside the controls rather than a column of scrolling.
         * The first draft of this check assumed one threshold for both and failed the modal at 820 for
         * behaving exactly as intended. */
        const stacksBelow = which === 'modal' ? 768 : 1024
        if (w < stacksBelow) {
          t(r.right.top > r.stage.top, `🔴 event ${which} ${w}: the columns STACK — nothing is pushed off the side`)
        } else {
          t(r.right.left > r.stage.left, `⚠️ event ${which} ${w}: the controls sit beside the preview (stacks below ${stacksBelow})`)
        }
      }
    }

    /* ══ 🔴 TIDY UP PLACES IS THE ADD EVENT MODAL (Part 2.1) ════════════════════════════════════
     * They are the same modal, opened from the same button bar, and were visibly different sizes: the
     * flag that decides the two-PANE layout was also deciding the SHELL, and it excludes Tidy up. So
     * Tidy up got the narrow cap and no definite height — and its list had nothing to scroll against.
     *
     * 🔴 MEASURED AS A COMPARISON, NOT AGAINST NUMBERS. Both shells are rendered at the same viewport
     * in the same engine and their boxes must match. A hard-coded width would need changing with every
     * design tweak and would still not notice the two drifting apart. */
    for (const [w, h] of [[1440, 900], [820, 1180], [390, 844]]) {
      await eng.setViewport(w, h)

      await eng.page.goto(write(`tidy-${w}-${eng.name}.html`, tidyFixture(css)))
      const tidy = await eng.page.evaluate(() => {
        const box = (id) => {
          const el = document.getElementById(id)
          if (!el) return null
          const b = el.getBoundingClientRect()
          return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top),
            bottom: Math.round(b.bottom), width: Math.round(b.width), height: Math.round(b.height) }
        }
        /* 🔴 "NOTHING CLIPPED" IS MEASURED ON THE INPUT, NOT ON ITS WRAPPER. An input whose value is
         * wider than the box shows the text scrolled, with no overflow of its own — so the honest test
         * is whether the VALUE fits the field. A hidden span with the same font renders the text at its
         * natural width, which is what it needs to fit into. */
        const fits = (id) => {
          const input = document.getElementById(id + 'in')
          if (!input) return null
          const probe = document.createElement('span')
          const cs = getComputedStyle(input)
          probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${cs.font}`
          probe.textContent = input.value
          document.body.appendChild(probe)
          const textW = probe.getBoundingClientRect().width
          probe.remove()
          const padding = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
          const inner = input.getBoundingClientRect().width - padding
          return { chars: input.value.length, textW: Math.round(textW), inner: Math.round(inner), fits: textW <= inner + 0.5 }
        }
        const body = document.getElementById('tidyBody')
        const list = document.getElementById('list')
        return {
          modal: box('modal'), form: box('form'), detail: box('detail'), list: box('list'),
          name: box('fName'), addr: box('fAddr'), short: box('fShort'), area: box('fArea'),
          controls: box('controls'),
          nameFits: fits('fName'), addrFits: fits('fAddr'),
          listScrolls: list ? list.scrollHeight > list.clientHeight + 1 : false,
          bodyOverflows: body ? body.scrollWidth > body.clientWidth + 1 : false,
          pageScrollsSideways: document.documentElement.scrollWidth > window.innerWidth + 1,
        }
      })

      await eng.page.goto(write(`addev-${w}-${eng.name}.html`, addEventShellFixture(css)))
      const addEv = await eng.page.evaluate(() => {
        const b = document.getElementById('modal').getBoundingClientRect()
        return { width: Math.round(b.width), height: Math.round(b.height),
          left: Math.round(b.left), top: Math.round(b.top) }
      })

      lines.push(`  tidy ${w}×${h}  modal ${tidy.modal.width}×${tidy.modal.height} vs add-event ${addEv.width}×${addEv.height} · name ${tidy.nameFits.textW}/${tidy.nameFits.inner}px`)

      t(tidy.modal.width === addEv.width && tidy.modal.height === addEv.height,
        `🔴 tidy ${w}: THE SHELL IS EXACTLY THE ADD EVENT SHELL (${tidy.modal.width}×${tidy.modal.height} vs ${addEv.width}×${addEv.height})`)
      t(tidy.modal.left === addEv.left && tidy.modal.top === addEv.top,
        `⚠️ tidy ${w}: …and sits in the same place on screen`)
      t(!tidy.pageScrollsSideways, `🔴 tidy ${w}: NO HORIZONTAL PAGE SCROLL`)
      t(!tidy.bodyOverflows, `🔴 tidy ${w}: nothing pushes the modal body sideways`)
      t(tidy.modal.width <= w + 1 && tidy.modal.height <= h + 1,
        `🔴 tidy ${w}: the modal fits the viewport`)

      /* 🔴 THE TWO LONG FIELDS GET A FULL ROW — a statement about the TWO-COLUMN layout, so it is
       * asserted at `sm:` and above. Below 640 the card is one column and EVERY field is already full
       * width; the first draft asserted "name wider than short name" at 390 too and failed on correct
       * markup, because there is no narrower field there to be wider than. */
      if (w >= 640) {
        t(tidy.name.width > tidy.short.width + 20,
          `🔴 tidy ${w}: "Name on posts" has a row to itself (${tidy.name.width}px vs short name ${tidy.short.width}px)`)
        t(tidy.addr.width > tidy.short.width + 20,
          `🔴 tidy ${w}: "Address" has a row to itself (${tidy.addr.width}px)`)
      } else {
        t(tidy.name.width === tidy.short.width && tidy.addr.width === tidy.short.width,
          `⚠️ tidy ${w}: one column on a phone — every field is full width`)
      }
      t(tidy.nameFits.chars === 40,
        `⚠️ tidy ${w}: the measured name really is 40 characters`)
      if (w === 1440) {
        t(tidy.nameFits.fits,
          `🔴 tidy 1440: A 40-CHARACTER NAME SHOWS IN FULL, NOT CLIPPED (${tidy.nameFits.textW}px of text in ${tidy.nameFits.inner}px)`)
        t(tidy.addrFits.fits, `⚠️ tidy 1440: the address shows in full too`)
      }

      /* ⚠️ THE SHORT THREE STAY IN PAIRS above the `sm:` breakpoint — one row each would make a
       * five-field card scroll for no reason. Below it everything is one column, which is correct. */
      if (w >= 640) {
        t(tidy.area.left > tidy.short.left && Math.abs(tidy.area.top - tidy.short.top) <= 1,
          `⚠️ tidy ${w}: Short name and Area share a row`)
      } else {
        t(tidy.area.top > tidy.short.top, `⚠️ tidy ${w}: the fields stack on a phone`)
      }

      /* 🔴 THE LIST SCROLLS ON ITS OWN. This is what the definite height buys: without it the pane
       * sized to its content, the body clipped it, and every place below the fold was unreachable. */
      if (w >= 768) {
        t(tidy.listScrolls, `🔴 tidy ${w}: the places list scrolls INSIDE the modal`)
        t(tidy.detail.left > tidy.list.left, `⚠️ tidy ${w}: the detail sits beside the list`)
      } else {
        t(tidy.detail.top > tidy.list.top, `🔴 tidy ${w}: the list and the detail stack`)
      }
      t(tidy.controls.right <= tidy.modal.right + 1,
        `⚠️ tidy ${w}: Favourite / Hide fit without being clipped`)
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
