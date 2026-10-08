#!/usr/bin/env node
// scripts/social-posts-render.cjs — SCHEDULE › SOCIAL POSTS, MEASURED IN A REAL BROWSER.
//
//   npx next build && node scripts/social-posts-render.cjs
//   HG_ENGINES=webkit node scripts/social-posts-render.cjs      (one engine, when the other is broken)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHAT NEEDED A BROWSER
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Both areas are THREE BOXES IN A ROW, and three equal columns of very different content lengths is
// exactly the arrangement a class census cannot judge:
//   • a long venue name in a 1/3-width box will push the page sideways unless every box is `min-w-0`,
//     and `min-w-0` is invisible to a census because its ABSENCE is what breaks;
//   • a list inside a box must scroll INSIDE it, or twenty places make the box taller than the other
//     two and the row stops being a row;
//   • a full-width primary button must stay inside its box at 390 with a four-word label on it.
//
// 🔴 WEBKIT AS WELL AS CHROMIUM, BECAUSE THE DEVICE IS AN iPAD AND THE BROWSER IS SAFARI. On iOS every
// browser is WebKit. Either engine missing ⇒ SKIPPED AND SAID SO, never silently passed.
//
// ⚠️ IT IS NOT THE PAGE, AND SAYS SO. There is no operator session and no database here, so the real
// route cannot be rendered. What is rendered is the component's OWN class names — lifted out of the
// source by the regexes below, so the fixture breaks rather than measuring a screen nobody is served.
// The page's BEHAVIOUR (pressing Make post, uploading a picture) is the numbered localhost list.
// ⚠️ NO NETWORK, NO DATABASE, NO LIVE TRUCK: file:// pages, the app's own CSS, local browser builds.

const fs = require('fs')
const path = require('path')
const os = require('os')

const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
/* ⛔ `SOCIAL` AND `COPY` ARE NO LONGER READ HERE. They fed the three fixtures this file lost on
 * 7 October — see the tombstone below. `scripts/social-tab-render.cjs` lifts from them now. */

/** Lift one class string out of the real source, or THROW. */
function lift(src, re, what) {
  const m = src.match(re)
  if (!m) throw new Error(`the fixture cannot be built: no ${what} found in the source`)
  return m[1]
}

function appCss() {
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
  /* 🔴 THE STALENESS CHECK. Tailwind only emits classes it finds in the source, so a build from before
   * this screen existed has no rule for the Designs grid — and the fixture would lay out as one column
   * at EVERY width and report the phone case passing for the wrong reason. */
  /* ⚠️ THE MARKER IS THE 900px MEDIA QUERY, which is the one thing this file exists to measure. The
   * old marker was `1.4fr` — the Designs grid's ratio — and when that ratio changed the check went on
   * passing against a stylesheet that had no `min-[900px]` rule at all, so every box STACKED at 1440
   * and three "side by side" assertions failed on correct source. A staleness check has to name the
   * thing the measurement depends on, not something that happens to be nearby. */
  if (!/min-width:\s*900px/.test(css)) {
    throw new Error('the compiled CSS has no `min-[900px]` rule — the build predates this layout; run `npx next build`')
  }
  return css
}

const HEAD = css => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>
<style>body{margin:0}</style></head><body>`

/* ⛔ `LONG_NAME` MOVED TO `scripts/social-tab-render.cjs` with the lists that needed crowding. The
 * editor and the picker are measured on their own content. */

/* ══════════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ TOMBSTONE · `socialFixture`, `placeEditorFixture`, `picturesPageFixture`, `rects`,
 *    `picturesRects` — AND THE MEASUREMENTS THAT DROVE THEM (7 October 2026)
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 *
 * This file measured FOUR screens. Three of them no longer exist:
 *
 *   • `socialFixture` drew **Social posts** — one pill inside Schedule with a segmented control and
 *     THREE boxes per area. Social media is its own top tab now, "Create a post" is TWO halves, and
 *     Designs is TWO boxes. Every assertion it carried was about a count of three, a segmented
 *     control, a colour bar on a six-row list, or a group heading over a sorted list.
 *   • `placeEditorFixture` drew the per-location design editor, which has lost its door entirely —
 *     see `docs/social-tab-report.md` §6 for what that costs and what it does not.
 *   • `picturesPageFixture` drew the picture LIBRARY page: a grid, a ★ Main, an add tile. A location
 *     has at most two images with one job each, so there is nothing to browse.
 *
 * 🔴 WHAT REPLACED THEM IS `scripts/social-tab-render.cjs` — the three new screens, in WebKit, at the
 * two widths the brief names (1100 and 390), with its own controls.
 *
 * ⚠️ WHAT STAYS IN THIS FILE IS THE HALF THAT IS STILL LIVE: the shared DESIGN EDITOR and the FONT
 * PICKER. Both are unchanged screens, both are measured here already, and moving them would be a
 * second edit with no benefit.
 *
 * ⛔ THE CONTROLS WENT WITH THEIR FIXTURES, which is the part worth saying out loud: a control proves
 * a measurement can tell two shapes apart, and a control for a fixture that no longer exists proves
 * nothing. The new file carries its own.
 */

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 THE SHARED DESIGN EDITOR, MEASURED (6 October 2026)
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ══ 🔴 THE CLAIM INVERTED ON 9 OCTOBER 2026: "NO THIRD COLUMN" → A THIRD COLUMN ══════════════════
//
// ⛔ THIS BLOCK USED TO SAY THE BROWSER WAS HERE TO PROVE A THIRD COLUMN WAS **ABSENT**, and that the
// toolbar above the picture wrapped rather than scrolling. Both of those shapes are gone. The toolbar
// was one row of nine cells with "✦ Effects ▾" and "Advanced ▾" opening pop-ups on the end of it, and
// three things were wrong with it: a pop-up covers the poster it is about, a wrapping toolbar is a
// toolbar whose controls move between items, and "Advanced" hid settings by name rather than by use.
// The settings are a sticky 320px third column now.
//
// 🔴 WHAT NEEDS A BROWSER IS THEREFORE THE OPPOSITE QUESTION, and it is a harder one:
//   • "exactly ONE settings panel is on screen" — the panel is built once and rendered in two places,
//     a third column above 1100 and a block under the preview below it. A class census sees both
//     wrappers in the source and cannot say which one a layout engine paints.
//   • "the settings never cover the poster" — the reason the pop-ups went. It is a question about two
//     boxes' coordinates, which only a layout engine has.
//   • "the panel is sticky, and CAN be" — a `sticky` element inside an `overflow:hidden` ancestor does
//     not stick, and one taller than the viewport cannot stick either. With MORE OPTIONS open the
//     panel is 1900px of controls, so `max-h` + `overflow-y-auto` is what decides whether the PANEL
//     scrolls or the PAGE does — and a scrolling page takes the poster off the screen, which is the
//     pop-ups' failure in a slower form.
//   • "the picture is as large as fits" is `min(64vh, column width × ratio)`, which is arithmetic the
//     browser does and nothing else can.
//
// 🔴 THREE WIDTHS AND **WEBKIT ONLY**. WebKit is the brief's instruction and the right trade: the device
// is a Mac and the browser is Safari. ⚠️ THE THIRD WIDTH IS NEW AND IS THE POINT — this layout has TWO
// breakpoints now (900 and 1100), so 1100 is above both, 390 below both, and **1000 is the band
// between them**: wide enough for the list beside the poster, too narrow for a 320px panel as well.
// ⛔ THAT BAND IS WHERE THIS PROJECT HAS ALREADY SHIPPED A BUG — `lg:` (1024) was once set as the
// breakpoint on a machine 1100px wide — so a sweep of the two ends would measure only the two cases
// nobody gets wrong.
//
// ⚠️ IT IS NOT THE PAGE, AND SAYS SO. There is no operator session here, so what is rendered is the
// editor's OWN class names, lifted out of the source — so the fixture breaks rather than measuring a
// screen nobody is served.

function editorFixture(css, { oneCol = false, twoCol = false, moreOpen = false, zoom = 0 } = {}) {
  const ED = read('components/manage/DesignEditor.tsx')
  const BITS = read('components/manage/DesignEditorBits.tsx')

  /* ══ 🔴 THREE TRACKS, LIFTED AS ONE STRING ════════════════════════════════════════════════════════
   * ⚠️ `twoCol` STRIPS THE 1100 RULE and `oneCol` the 900 one — each control removes exactly one of the
   * two breakpoints, so a failure says WHICH breakpoint stopped working. ⛔ BOTH STRIP BY REGEX rather
   * than by naming the track list: the sibling harness shipped a control that spelled out a ratio,
   * the ratio changed, and the control quietly stopped controlling anything. */
  const gridRaw = lift(ED, /<div className="(grid grid-cols-1 min-\[1100px\]:grid-cols-\[minmax\(0,1fr\)_380px\] gap-4 items-start)"\n\s*data-editor-grid>/, 'the editor grid')
  /* ⚠️ ONE BREAKPOINT NOW, SO ONE CONTROL. `oneCol` strips it; `twoCol` is kept as an alias so the
   * control block below reads the same way, and both produce the same single-column fallback. */
  const grid = (oneCol || twoCol) ? gridRaw.replace(/min-\[1100px\]:grid-cols-\S+/, '') : gridRaw
  /* ⛔ `leftCol`, `chips` AND `chipWrap` ARE GONE. The 250px column and its under-900 chip row went
   * with the two-column rewrite: the item list is INSIDE the panel now, so there is no width at which
   * it is absent and nothing for a chip row to stand in for. */
  const area = lift(ED, /<div ref=\{areaRef\}\n\s*data-stage-area\n\s*className="([^"]+)"/, 'the grey stage area')
  /* ══ ⛔ THE "✎ Edit | 👁 Preview" SWITCH WAS LIFTED HERE AND IS GONE (10 October 2026, §B1) ════════
   * Both lifts threw if the switch left the source, which is exactly what they were for — and exactly
   * what happened: the switch was a MODE and has been replaced by a button that opens the finished post
   * over the top. 🔴 THE GUARD IS KEPT, POINTED AT WHAT REPLACED IT: if "👁 Preview post" ever leaves
   * the title row, this fixture refuses to build rather than measuring a screen nobody is served. */
  lift(ED, /onClick=\{\(\) => setPreviewOpen\(true\)\} (data-preview-post)/, 'the Preview post button')
  const panelCard = lift(ED, /<div className="(rounded-2xl border border-slate-200 bg-white p-3)" data-settings-panel>/, 'the settings card')
  /* ⚠️ `shrink-0` IS NEW AND IS LOAD-BEARING: the poster is a flex child of the centred area, and a
   * flex child's default `min-width: auto` would squeeze it back to fit once zoomed — so + would do
   * nothing. ⛔ AND THE BACKGROUND IS `bg-slate-200` against the area's `bg-slate-100`, so an unfitted
   * poster is visible as a shape rather than blending into its own container. */
  /* ══ 🔴 `m-auto`, NOT `shrink-0` — §2's ZOOM FIX ════════════════════════════════════════════════
   * ⛔ THE AREA WAS `flex items-center justify-center` AND THE POSTER `shrink-0`. A flex container with
   * `justify-content: center` whose item is too big overflows BOTH sides, and the part past the start
   * edge is UNREACHABLE — `scrollLeft` cannot go below 0 — so at 150% the left half of the poster could
   * not be scrolled to. 🔴 THE AREA IS A `grid` AND THE POSTER HAS `margin: auto`: they centre the same
   * way and the scrollable region stays correct in both directions. */
  const stage = lift(ED, /className="(relative m-auto select-none touch-none overflow-hidden rounded-xl bg-slate-200)"/, 'the stage')
  const caption = lift(ED, /<p className="(min-w-0 grow text-xs text-slate-400)" data-stage-hint>/, 'the hint')
  /* 🔴 THE ZOOM'S OWN ROW, lifted so the fixture cannot measure a control the screen has stopped using. */
  const zoomRow = lift(ED, /<div className="(flex shrink-0 items-center gap-1)" data-zoom>/, 'the zoom row')
  /* ══ 🔴 THE PANEL'S TWO WRAPPERS AND ITS CARD — THE SHAPE THAT REPLACED THE TWO POP-UPS ═══════════
   * ⛔ THE PANEL IS ONE ELEMENT RENDERED IN ONE OF TWO PLACES: a sticky third column above 1100, and
   * under the preview below it. Both wrappers are lifted, and the fixture draws BOTH — because the
   * claim being measured is that exactly ONE of them is ever visible. A fixture that drew only the one
   * expected at this width could not tell a working breakpoint from a missing wrapper. */
  /* ══ 🔴 ONE PANEL COLUMN, STICKY ONLY ABOVE THE BREAKPOINT ════════════════════════════════════════
   * ⚠️ IT WAS TWO WRAPPERS — a sticky third column and a copy under the preview — because the item list
   * was a separate column that stayed put at both widths. With the list inside the panel there is ONE
   * element, and the breakpoint moves the whole thing. ⛔ `sticky` IS PREFIXED `min-[1100px]:` because
   * below it the panel sits under the poster, where there is nothing above it to stay level with. */
  const panelCol = lift(ED, /<div className="(min-w-0 min-\[1100px\]:sticky min-\[1100px\]:top-4 min-\[1100px\]:max-h-\[calc\(100vh-2rem\)\] min-\[1100px\]:overflow-y-auto)"\n\s*data-settings-col>/, 'the panel column')
  const toolLabel = lift(BITS, /export const TOOL_LABEL = '([^']+)'/, 'the field label')
  const toolInput = lift(BITS, /export const TOOL_INPUT = '([^']+)'/, 'a field input')
  const toolBtn = lift(BITS, /export const TOOL_BTN = '([^']+)'/, 'a small button')
  const toolBtnOff = lift(BITS, /export const TOOL_BTN_OFF = '([^']+)'/, 'an unselected button')
  const sectionCls = lift(ED, /<div className="(border-t border-slate-100 pt-3 first:border-t-0 first:pt-0)" data-settings-section=\{title\}>/, 'a foldable section')
  /* 🔴 THE STAGE'S OWN SIZING RULE, LIFTED AS A STRING — so the fixture computes the same box the
   * component does rather than a copy of it that can drift. */
  /* ══ 🔴 THE **AREA'S** HEIGHT IS THE CAP NOW, NOT THE STAGE'S ════════════════════════════════════
   * ⛔ IT WAS `maxHeight: min(64vh, 820px)` ON THE POSTER — a guess at how much of the window it may
   * have, wrong in both directions: on a 16-inch window 64vh left a third of the height unused, and on
   * a short one the title row and the hint pushed the bottom off the screen because neither was
   * counted. 🔴 THE AREA IS CAPPED INSTEAD and the poster is FITTED INSIDE IT, measured. */
  const areaMax = lift(ED, /style=\{\{ height: '(min\(72vh, 820px\))' \}\}>/, "the stage area's height")

  /* ⚠️ A PORTRAIT 4:5 DESIGN, which is what a social post is. A square one would hide the case where
   * the picture is taller than the window. */
  const W = 1080, H = 1350

  const sel = (text) => `<select class="${toolInput} w-full"><option>${text}</option></select>`
  const btn = (text) => `<button class="${toolBtn} ${toolBtnOff}">${text}</button>`
  const field = (label, inner) =>
    `<div><span class="${toolLabel}">${label}</span><div class="mt-0.5">${inner}</div></div>`

  /* ══ 🔴 THE PANEL, WITH EVERY CONTROL THE TOOLBAR HAD ═════════════════════════════════════════════
   * ⛔ THE WORST CASE IS THE **DATE** ITEM, which is why it is the one drawn: it is the only item with
   * its own "Date style" dropdown on top of the six style controls, so it is the tallest TEXT section
   * there is. ⚠️ AND MORE OPTIONS IS DRAWN AT ITS FULL HEIGHT under `moreOpen`, which is the case that
   * decides whether a sticky panel can stick: a panel taller than the viewport cannot. */
  const stand = `
    <div class="${sectionCls}" data-section="stand">
      <button class="flex w-full items-center justify-between gap-2 text-left">
        <span class="text-[10px] font-bold uppercase tracking-wide text-slate-500">MAKE IT STAND OUT</span>
        <span class="text-xs text-slate-400">▴</span>
      </button>
      <div class="mt-2" data-body="stand">
        ${field('Outline', `${btn('Off')}${btn('Thin')}${btn('Thick')}`)}
        <p class="mt-1 text-[11px] leading-relaxed text-slate-400">A thin line around each letter.</p>
        ${field('Label strip', `${btn('Off')}${btn('On')}`)}
        <p class="mt-1 text-[11px] leading-relaxed text-slate-400">A coloured strip behind the text, like a label.</p>
        ${field('Keep it readable', `${btn('On')}`)}
        <p class="mt-1 text-[11px] leading-relaxed text-slate-400">If the words are hard to read on your picture, we add a soft shadow. Your colours never change.</p>
      </div>
    </div>`

  const more = `
    <div class="${sectionCls}" data-section="more">
      <button class="flex w-full items-center justify-between gap-2 text-left">
        <span class="text-[10px] font-bold uppercase tracking-wide text-slate-500">MORE OPTIONS</span>
        <span class="text-xs text-slate-400">${moreOpen ? '▴' : '▾'}</span>
      </button>
      ${moreOpen ? '' : `<p class="mt-0.5 text-[11px] leading-relaxed text-slate-400" data-summary="more">Spacing, tilt, italic, words before, darken the picture, copy this style, centre the box</p>`}
      ${moreOpen ? `<div class="mt-2" data-body="more">
        ${['Wording', 'Letters', 'Position', 'Long names', 'Stand out', 'Whole picture'].map(g => `
          <p class="mt-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">${g}</p>
          ${field('Words before', `<input class="${toolInput} w-full" value="Every Wednesday at">`)}
          ${field('Spacing', `${btn('−')}<input class="${toolInput} w-14 text-center" value="96">${btn('+')}`)}
          ${field('Tilt', `${btn('−')}<input class="${toolInput} w-14 text-center" value="0">${btn('+')}`)}`).join('')}
        <button class="${toolBtn} ${toolBtnOff} mt-3">Copy this style to all text</button>
      </div>` : ''}
    </div>`

  const itemBtn = (label, extra, sel_) => `
    <button class="min-w-0 grow rounded-lg border px-2 py-1.5 text-left ${sel_
      ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-white'}">
      <span class="flex items-center gap-1 text-[12px] leading-tight ${sel_
        ? 'font-bold text-orange-700' : 'font-semibold text-slate-700'}">
        <span class="min-w-0 truncate">${label}</span>${extra || ''}
      </span>
    </button>`

  /** One item: its switch, its name, and the "own" badge where it has its own style. */
  const itemCell = (name, own) => `
    <div class="flex min-w-0 items-center gap-1.5">
      <button class="shrink-0"><span class="relative block h-5 w-9 rounded-full bg-green-500"><span class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow left-auto right-0.5" data-switch-knob></span></span></button>
      ${itemBtn(name, own ? '<span class="shrink-0 rounded bg-amber-100 px-1 text-[9px] font-bold uppercase tracking-wide text-amber-700" data-own-badge>own</span>' : '', false)}
    </div>`

  /* ══ 🔴 THE ITEM GRID LIVES **INSIDE** THE PANEL NOW ════════════════════════════════════════════════
   * ⛔ IT WAS A 250px COLUMN ON THE FAR SIDE OF THE POSTER, with the settings on the other — the two
   * halves of ONE job as far apart as the screen allowed. ⚠️ ITS LIVE GREY SAMPLES WENT WITH THE MOVE
   * ("Date · Wednesday 14th October"): two across has room for a name, a switch and a badge, not for a
   * sample. ⚠️ THE WEEKLY LIST IS DRAWN because it is the longer of the two — a week heading, the EACH
   * ROW group of five, and a note box. The single-event list is a subset of it. */
  const itemGrid = `
    <div id="itemGrid" data-item-grid>
      <div class="flex items-baseline justify-between gap-2">
        <p class="text-[11px] font-bold uppercase tracking-wide text-slate-400">ON YOUR POST</p>
        <span class="text-[10px] text-slate-400">click to edit</span>
      </div>
      <div class="mt-1.5 flex">
        ${itemBtn('Aa  All text', '<span class="shrink-0 text-[10px] font-medium text-slate-400">· style every text box at once</span>', false)}
      </div>
      <div class="mt-1.5 grid grid-cols-2 gap-1.5">
        ${itemCell('Week heading', false)}
        ${itemCell('Your own text', true)}
      </div>
      <p class="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Each row</p>
      <div class="mt-1 grid grid-cols-2 gap-1.5">
        ${itemCell('Date', false)}
        ${itemCell('Place', false)}
        ${itemCell('Time', false)}
        ${itemCell('Rows', false)}
        ${itemCell('Location picture', false)}
      </div>
      <button class="mt-1.5 w-full rounded-lg border border-dashed border-slate-300 py-1.5 text-[12px] font-bold text-orange-700">+ Add your own text</button>
      <div id="bgRow" class="mt-2 border-t border-slate-100 pt-2">
        <div class="flex items-center gap-1.5">
          <span class="w-9 shrink-0"></span>
          ${itemBtn('Background picture', `<span class="shrink-0 text-[10px] font-medium text-slate-400">· ${W} × ${H}</span>`, false)}
        </div>
      </div>
    </div>`

  /* ══ 🔴 THE PANEL — THE GRID, THEN THE SELECTED ITEM'S SETTINGS ════════════════════════════════════
   * ⚠️ THE "TEXT" HEADING IS GONE: with the item's name in bold directly above the font and colour rows
   * it was a second heading for the same block. The MARKER stays, because this harness measures it.
   * ⚠️ THE **DATE** ITEM IS DRAWN because it is the worst case — the only item with a "Shows" dropdown
   * on top of the five style rows, so it is the tallest TEXT section there is. */
  const panelHtml = `
    <div id="panelCard" class="${panelCard}" data-settings-panel>
      ${itemGrid}
      <div class="mt-3 border-t border-slate-100 pt-3">
        <p class="text-sm font-bold text-slate-900" data-settings-title>Date</p>
        <p class="mt-0.5 text-[11px] leading-snug text-slate-400">Settings for the box you’ve picked</p>
        <div class="mt-2.5">
          <div class="space-y-2" data-settings-section="TEXT" data-body="text">
            ${field('Shows', sel('Wednesday 14th October'))}
            ${field('Font', `<div class="flex items-center gap-1.5"><div class="min-w-0 grow">${sel('Permanent Marker')}</div><div class="flex shrink-0 items-center gap-1">${btn('−')}<input class="${toolInput} w-14 text-center" value="42">${btn('+')}</div></div>`)}
            ${field('Colour', `<div class="flex items-center gap-1">${`<span style="width:1.5rem;height:1.5rem;display:inline-block;background:#fff;border:2px solid #cbd5e1;border-radius:.375rem"></span>`.repeat(8)}<span style="width:2rem;height:1.5rem;display:inline-block;background:#fff;border:2px solid #cbd5e1;border-radius:.375rem"></span></div>`)}
            ${field('Style', `<div class="flex items-center gap-2"><div class="flex shrink-0 items-center gap-1">${btn('B')}${btn('I')}${btn('AA')}</div><span class="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">Line up</span><div class="flex shrink-0 items-center gap-1">${btn('·')}${btn('·')}${btn('·')}</div></div>`)}
          </div>
          ${stand}
          ${more}
        </div>
      </div>
    </div>`

  /* ══ 🔴 §7 (10 October 2026) · THE TITLE ROW, AS THE SCREEN ACTUALLY HAS IT ════════════════════════
   * ⛔ THE FIXTURE'S ROW WAS A ROUND BEHIND and could not have shown the overflow Dominic reported: it
   * was missing "👁 Preview post" (added 9 October), it still offered "A busy week" (removed 10
   * October), and its `<select>` carried `style="max-width:10rem"` — a cap THE COMPONENT DOES NOT HAVE.
   * 🔴 A SELECT WITH NO CAP SIZES ITSELF TO ITS LONGEST OPTION, and the real options carry a date range
   * ("This week · Mon 12 Oct – Sun 18 Oct"). That is the one item in this row that can be wide, and the
   * label around it is `shrink-0` — so if anything in the title row can push the page sideways, it is
   * this. The fixture now draws it the way the screen does and the measurement can see it. */
  const topBar = `
    <div id="topbar" class="flex flex-wrap items-center gap-2 gap-y-3">
      <button class="text-sm font-bold text-orange-700 shrink-0">‹ Designs</button>
      <span class="text-sm font-black text-slate-900 truncate min-w-0">Weekly post design</span>
      <div class="grow"></div>
      <label class="flex min-w-0 items-center gap-1"><span class="shrink-0 text-[10px] font-bold uppercase tracking-wide text-slate-400">Preview with</span><select class="${toolInput} min-w-0 max-w-[12rem] truncate"><option>This week · Mon 12 Oct – Sun 18 Oct</option><option>Next week · Mon 19 Oct – Sun 25 Oct</option></select></label>
      <button class="${toolBtn} ${toolBtnOff} shrink-0">👁 Preview post</button>
      ${btn('Undo')}${btn('Redo')}
      <button class="inline-flex items-center justify-center rounded-xl bg-white border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700">Cancel</button>
      <button id="saveBtn" class="inline-flex items-center justify-center rounded-xl bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white">Save design</button>
    </div>`

  /* 🔴 THE POSTER'S WIDTH IS A **NUMBER THE FIXTURE CANNOT COMPUTE** — it is `min(areaW, areaH × ratio)`
   * and only the layout engine knows the area's height once the title row and the hint have taken
   * theirs. So the
   * fixture reproduces the component's own arithmetic in a one-line script, which is the honest way to
   * measure "fitted": the measurement below then checks the RESULT against the area it was fitted to. */
  return `${HEAD(css)}
  <div class="p-3 space-y-3">
    ${topBar}
    <div id="grid" class="${grid}" data-editor-grid>
      <div id="midCol" class="min-w-0">
        <div id="stageArea" class="${area}" style="height:${areaMax}">
          <div id="stage" class="${stage}" style="aspect-ratio:${W} / ${H};width:0">
            <div class="absolute" style="left:6%;top:20%;width:30%;height:5%;border:2px dashed #f97316"></div>
          </div>
        </div>
        <div class="mt-1.5 flex items-center gap-3">
          <p id="caption" class="${caption}">Drag a box to move it · drag a corner to resize</p>
          <div id="zoom" class="${zoomRow}">
            ${btn('−')}<button id="zoomFit" class="${toolBtn} ${toolBtnOff}">Fit</button>${btn('+')}
          </div>
        </div>
      </div>
      <div id="panelCol" class="${panelCol}" data-settings-col>${panelHtml}</div>
    </div>
  </div>
  <script>
    /* THE COMPONENT'S OWN ARITHMETIC, COPIED ONCE AND DELIBERATELY: min(areaW, areaH x ratio), times
       the zoom. A FIXTURE THAT GUESSED A WIDTH WOULD BE MEASURING ITS OWN GUESS. */
    (function () {
      var area = document.getElementById('stageArea')
      var stage = document.getElementById('stage')
      var ratio = ${W} / ${H}
      var cs = getComputedStyle(area)
      var px = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
      var py = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      var aw = area.clientWidth - px, ah = area.clientHeight - py
      var fit = Math.max(40, Math.min(aw, ah * ratio))
      stage.style.width = Math.round(fit * Math.pow(1.25, ${zoom})) + 'px'
    })()
  </script></body></html>`
}

/**
 * ══ 🔴 THE FONT PICKER, OPEN (6 October 2026, part 2) ════════════════════════════════════════════
 *
 * ⛔ WHAT NEEDED A BROWSER: the panel holds a search box, six wrapping tabs, up to sixty rows and an
 * upload block, and it opens from a button inside a toolbar that already wraps. Two claims about it
 * are only true once laid out:
 *   • **the list scrolls INSIDE the panel** — a panel that grew with its contents would be sixty rows
 *     tall and the PAGE would scroll instead, taking the picture the operator is judging the font
 *     against off the screen;
 *   • **no sideways scroll at 390px** — a fixed 22rem panel opened near the right edge of a phone
 *     pushes the page, and a class census cannot see that.
 *
 * ⚠️ THE ROWS ARE DRAWN WITH A LONG SAMPLE IN A WIDE FALLBACK FACE, deliberately: the fixture has no
 * network, so no Google web font loads, and Georgia at 17px is wider than most of the real faces. If
 * the row survives that it survives the real ones.
 */
function pickerFixture(css, { width = 380 } = {}) {
  const PICK = read('components/manage/FontPicker.tsx')
  const BITS = read('components/manage/DesignEditorBits.tsx')
  /* ══ 🔴 THE PANEL IS `w-full` NOW, NOT `w-[22rem]` (9 October 2026) ═══════════════════════════════
   * ⛔ 22rem IS 352px — WIDER THAN THE 380px SETTINGS PANEL'S CONTENT BOX — and the `calc(100vw-2rem)`
   * cap could not help: on a 1728px window that is 1696px, so the list opened at its full 352px and ran
   * past the right edge of the column it lives in. **A cap against the wrong container is not a cap.**
   * ⚠️ WHICH CHANGES WHAT THIS FIXTURE HAS TO DO: `w-full` means the panel's width comes from its
   * PARENT, so the fixture gives the parent a width and the measurement checks containment. */
  const panel = lift(PICK, /className="(absolute z-50 left-0 top-full mt-1 w-full[^"]*)"/, 'the picker panel')
  const list = lift(PICK, /<div className="(mt-2 max-h-\[46vh\] min-h-\[8rem\] overflow-y-auto overflow-x-hidden)">/, 'the picker list')
  const search = lift(PICK, /placeholder=\{lib\.loading \? 'Loading fonts…' : `Search \$\{lib\.count\.toLocaleString\('en-GB'\)\} fonts`\}\n\s*className="([^"]+)"/, 'the search box')
  const tabWrap = lift(PICK, /<div className="(mt-2 flex flex-wrap gap-1)">/, 'the tab row')
  const toolInput = lift(BITS, /export const TOOL_INPUT = '([^']+)'/, 'the toolbar input')
  /* 🔴 THE COUNT IS LIFTED FROM THE GENERATED CATALOGUE, not typed here. A fixture that said "1,500"
   * would be measuring a sentence the screen does not show. */
  const count = JSON.parse(read('lib/weekly-post/font-catalogue.json')).count

  const TABS = ['All', 'Bold & tall', 'Handwritten', 'Classic', 'Clean', 'Yours']
  /* ⚠️ A REAL, LONG FAMILY NAME. "Cormorant Garamond" and the date sample together are what crowd a
   * 22rem panel; "Arial" would prove nothing. */
  const SAMPLE = 'Wednesday 14th October'
  const row = (i, name, selected) => `
    <button id="fRow-${i}" class="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left ${
      selected ? 'bg-orange-50 ring-1 ring-orange-400' : 'hover:bg-slate-50'}">
      <span class="min-w-0 flex-1">
        <span id="fName-${i}" class="block truncate text-[11px] ${selected ? 'font-bold text-orange-700' : 'text-slate-400'}">${name}</span>
        <span id="fSample-${i}" class="block truncate text-[17px] leading-snug text-slate-800" style="font-family: Georgia, serif">${SAMPLE}</span>
      </span>
      <span class="shrink-0 text-[10px] text-slate-300">OFL-1.1</span>
    </button>`

  const names = ['Oswald', 'Bebas Neue', 'Anton', 'Cormorant Garamond', 'Permanent Marker', 'Playfair Display',
    'Alfa Slab One', 'Shadows Into Light', 'Barlow Condensed', 'Archivo Narrow']
  /* ⚠️ SIXTY ROWS — the cap the component uses. The scroll claim is about a FULL list. */
  const rows = Array.from({ length: 60 }, (_, i) => row(i, names[i % names.length], i === 0)).join('')

  return `${HEAD(css)}
  <div class="p-3">
    <div class="relative mb-3 flex flex-wrap items-end gap-x-3 gap-y-3 rounded-2xl border border-slate-200 bg-white px-3 py-2">
      <div class="shrink-0">
        <span class="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Font</span>
        <!-- THE PARENT IS THE SETTINGS PANEL'S OWN WIDTH, because w-full takes its size from here.
             A FIXTURE THAT SIZED THE PANEL DIRECTLY would be measuring its own number rather than the
             rule the component relies on. -->
        <!-- min(), BECAUSE THE SETTINGS COLUMN IS 380px ONLY ABOVE 1100. Below it the panel drops under
             the poster and the column is minmax(0,1fr) — the content width. A fixture that hard-coded
             380 at 390 would be measuring a column that cannot exist. -->
        <!-- AN EXPLICIT PIXEL WIDTH, SET BY THE CALLER PER VIEWPORT. The settings column is 380px only
             above 1100; below it the panel drops under the poster and the column is the content width.
             A min(380px, 100%) here resolved against an auto-width ancestor and came out at 169 — a
             fixture measuring its own layout accident rather than the rule. -->
        <div id="host" class="relative" style="width:${width}px">
          <button id="trigger" class="${toolInput} w-full flex items-center justify-between gap-1 text-left">
            <span class="min-w-0 truncate">Cormorant Garamond</span><span class="shrink-0 text-slate-400">▾</span>
          </button>
          <div id="panel" class="${panel}">
            <input id="search" class="${search}" placeholder="Search ${count.toLocaleString('en-GB')} fonts" />
            <div id="tabs" class="${tabWrap}">
              ${TABS.map((t, i) => `<button id="tab-${i}" class="rounded-lg px-2 py-1 text-xs font-bold ${i === 0 ? 'bg-orange-50 text-orange-700' : 'text-slate-500'}">${t}</button>`).join('')}
            </div>
            <div id="list" class="${list}">
              <p class="px-2 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">Popular for posters</p>
              ${rows}
            </div>
            <!-- THE UPLOAD SECTION IS NOT AT THE BOTTOM ANY MORE (section 8). It was a tick, a
                 greyed-out file button and two grey lines UNDER a capped list of forty rows, so the one
                 thing an operator with their own font came here to do was the thing furthest from the
                 top. The button is beside the search box now and is always enabled; the tick gates
                 "Add font". -->
          </div>
        </div>
      </div>
      <div class="shrink-0">
        <span class="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Size</span>
        <input class="${toolInput} w-14 text-center" value="42" />
      </div>
    </div>
  </div></body></html>`
}

const pickerRects = () => {
  const box = (id) => {
    const el = document.getElementById(id)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return {
      top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right),
      bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height),
      scrollH: el.scrollHeight, clientH: el.clientHeight,
      scrollW: el.scrollWidth, clientW: el.clientWidth,
    }
  }
  const rowBoxes = []
  for (let i = 0; i < 60; i++) {
    const el = document.getElementById('fRow-' + i)
    if (!el) continue
    const r = el.getBoundingClientRect()
    rowBoxes.push({ left: Math.round(r.left), right: Math.round(r.right), height: Math.round(r.height) })
  }
  return {
    innerW: window.innerWidth, innerH: window.innerHeight,
    docScrollW: document.documentElement.scrollWidth,
    panel: box('panel'), list: box('list'), search: box('search'), tabs: box('tabs'),
    /* ⛔ `upload` AND `uploadNote` WERE THE BOTTOM SECTION'S BOXES and it is gone — §8 moves the button
     * beside the search box. ⚠️ `host` IS NEW: the panel is `w-full` now, so what it must fit inside is
     * its PARENT, and that is the box to compare it with. */
    host: box('host'), trigger: box('trigger'),
    searchText: document.getElementById('search')?.getAttribute('placeholder') ?? '',
    tabCount: document.querySelectorAll('[id^="tab-"]').length,
    tabRows: new Set([...document.querySelectorAll('[id^="tab-"]')]
      .map(e => Math.round(e.getBoundingClientRect().top))).size,
    rows: rowBoxes,
  }
}

/** What is measured about the editor. ⚠️ A separate reader, so the six-box one stays readable. */
const editorRects = () => {
  /** ⚠️ `editorRects` RUNS IN THE PAGE and has no closure over this file — every helper it uses has to
   *  be declared here. `all` was added with the switch-knob measurement and was missing. */
  const all = (sel) => [...document.querySelectorAll(sel)]
  const box = (id) => {
    const el = document.getElementById(id)
    if (!el) return null
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right),
      bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height),
      visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0,
      scrollW: el.scrollWidth, clientW: el.clientWidth,
      /* 🔴 THE **CONTENT** BOX, which is what a child can be fitted to. `clientWidth` includes padding;
       * the poster-fitting bug was exactly that confusion, so the harness states both. */
      contentW: Math.round(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)),
      contentH: Math.round(el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)),
      cols: cs.gridTemplateColumns,
    }
  }
  return {
    innerW: window.innerWidth, innerH: window.innerHeight,
    docScrollW: document.documentElement.scrollWidth,
    grid: box('grid'), midCol: box('midCol'),
    /* ⛔ `leftCol`, `listCard` AND `chips` ARE GONE WITH THE 250px COLUMN AND ITS UNDER-900 CHIP ROW.
     * The item list is inside the panel now, so there is no width at which it is absent. */
    bgRow: box('bgRow'), stageArea: box('stageArea'), stage: box('stage'),
    zoom: box('zoom'), itemGrid: box('itemGrid'),
    caption: box('caption'), topbar: box('topbar'), saveBtn: box('saveBtn'),
    /* ══ 🔴 THE SWITCH KNOB, MEASURED AGAINST ITS TRACK — REPORTED BY DOMINIC ════════════════════════
     * ⛔ IT SAT OUTSIDE THE GREEN TRACK. The knob was `absolute top-0.5` with **no `left`**, so its
     * horizontal position was its STATIC POSITION — a property of the inline formatting context it
     * would have had, not a reliable 0 — and `translate-x-4` carried it out the other side.
     * 🔴 THIS IS THE ONLY WAY TO CHECK IT. A class census sees `translate-x-4` and cannot tell where
     * the element it moves started from; only a layout engine knows. */
    knobs: all('[data-switch-knob]').map(el => {
      const track = el.parentElement
      const k = el.getBoundingClientRect(), t = track.getBoundingClientRect()
      return {
        inside: k.left >= t.left - 0.5 && k.right <= t.right + 0.5
          && k.top >= t.top - 0.5 && k.bottom <= t.bottom + 0.5,
        gapLeft: Math.round(k.left - t.left),
        gapRight: Math.round(t.right - k.right),
      }
    }),
    /* ══ 🔴 THE TWO HOMES OF THE ONE PANEL ═══════════════════════════════════════════════════════════
     * ⛔ `panelCol` IS THE STICKY THIRD COLUMN and `panelUnder` the block under the preview. The fixture
     * draws both, because the claim is that exactly ONE is ever visible — a fixture that drew only the
     * one expected at this width could not tell a working breakpoint from a missing wrapper. */
    panelCol: box('panelCol'), panelCard: box('panelCard'),
    /* ⚠️ `position` AND `overflowY` ON THE THIRD COLUMN, read computed. "Sticky" is not a class claim:
     * a `sticky` element inside an `overflow:hidden` ancestor does not stick, and a class census cannot
     * see that. ⛔ AND `maxHeight` IS WHAT MAKES STICKY POSSIBLE AT ALL — an element taller than the
     * viewport cannot stick, and its bottom controls would be unreachable. */
    panelColStyle: (() => {
      const el = document.getElementById('panelCol')
      if (!el) return null
      const cs = getComputedStyle(el)
      return { position: cs.position, overflowY: cs.overflowY, top: cs.top,
               maxH: Math.round(parseFloat(cs.maxHeight) || 0),
               scrollH: el.scrollHeight, clientH: el.clientHeight }
    })(),
    /* 🔴 HOW MANY SETTINGS PANELS ARE **VISIBLE**. Two would be two panels to keep in step and the one
     * nobody is looking at is the one that would drift; zero would be the settings gone. */
    /* ⚠️ STILL COUNTED, AND THE ANSWER IS STILL ONE — but for a different reason: the panel is ONE
     * element in ONE place now, where it used to be one element rendered into two wrappers. */
    panelsVisible: [...document.querySelectorAll('[data-settings-panel]')].filter(el => {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0
    }).length,
    /* ⚠️ THE THREE SECTIONS' HEADERS, BODIES AND THE FOLDED ONE'S SUMMARY — inside the VISIBLE panel
     * only, so a hidden copy cannot answer for the one on screen. */
    sections: (() => {
      const panel = [...document.querySelectorAll('[data-settings-panel]')]
        .find(el => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0)
      if (!panel) return null
      const seen = (sel) => !!panel.querySelector(sel)
      return {
        /* ⚠️ THE "TEXT" HEADING IS GONE — with the item's name in bold directly above the font and
         * colour rows it was a second heading for the same block. The MARKER stays and is what this
         * reads, because the block itself is still the thing being measured. */
        text: seen('[data-settings-section="TEXT"]'), textBody: seen('[data-body="text"]'),
        stand: seen('[data-section="stand"]'), standBody: seen('[data-body="stand"]'),
        more: seen('[data-section="more"]'), moreBody: seen('[data-body="more"]'),
        moreSummary: (panel.querySelector('[data-summary="more"]') || {}).textContent || '',
        title: (panel.querySelector('[data-settings-title]') || {}).textContent || '',
      }
    })(),
    /* ⛔ THE COUNT OF COLUMNS, READ OFF THE COMPUTED GRID. "There is no right-hand column" is a claim
     * about the TRACK LIST, which is the only thing that can prove a third column is absent rather
     * than merely empty. */
    gridTrackCount: (() => {
      const el = document.getElementById('grid')
      if (!el) return -1
      const v = getComputedStyle(el).gridTemplateColumns
      return v && v !== 'none' ? v.trim().split(/\s+/).length : -1
    })(),
  }
}

async function engines() {
  /* ⚠️ `HG_ENGINES` — one engine when the other is broken on the machine. ⛔ THE DEFAULT IS BOTH: a
   * one-engine default would make a Chromium-only bug invisible for ever. */
  const want = (process.env.HG_ENGINES || 'chromium,webkit').toLowerCase()
  const out = []
  const shotSafely = async (fn, file) => {
    /* ⛔ A SCREENSHOT CANNOT KILL THE RUN. It is the last thing in a width's loop, and on this machine
     * Chromium's `Page.captureScreenshot` times out — which took every measurement already made down
     * with it in the sibling harness. A shot is evidence, not a test. */
    try { await fn(file) } catch (e) {
      console.log(`  ⚠️ screenshot skipped (${String(e.message).split('\n')[0].slice(0, 60)})`)
    }
  }
  if (!want.includes('chromium')) out.push({ name: 'Chromium', skip: 'not requested (HG_ENGINES)' })
  else try {
    const puppeteer = require('puppeteer')
    const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 30000 })
    const page = await b.newPage()
    out.push({ name: 'Chromium', close: () => b.close(), page,
      setViewport: (w, h) => page.setViewport({ width: w, height: h }),
      shot: async (file) => shotSafely(f => page.screenshot({ path: f }), file) })
  } catch (e) { out.push({ name: 'Chromium', skip: String(e.message).split('\n')[0].slice(0, 110) }) }
  if (!want.includes('webkit')) out.push({ name: 'WebKit', skip: 'not requested (HG_ENGINES)' })
  else try {
    const { webkit } = require('playwright')
    const b = await webkit.launch()
    const page = await b.newPage()
    out.push({ name: 'WebKit', close: () => b.close(), page,
      setViewport: (w, h) => page.setViewportSize({ width: w, height: h }),
      shot: async (file) => shotSafely(f => page.screenshot({ path: f }), file) })
  } catch (e) { out.push({ name: 'WebKit', skip: String(e.message).split('\n')[0].slice(0, 110) }) }
  return out
}

async function measure() {
  const lines = []
  let fails = 0
  const t = (ok, label) => { lines.push(`  ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }

  const css = appCss()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-social-'))
  const write = (name, html) => { const f = path.join(tmp, name); fs.writeFileSync(f, html); return 'file://' + f }
  /* ⛔ `shotDir`, `layoutShots` AND `polishShots` WENT WITH THE FIXTURES THEY HELD. The screenshots
   * already in `docs/screenshots/social-posts*` are of screens that no longer exist; they are left on
   * disk as a record of what was there rather than deleted, and `scripts/social-tab-render.cjs`
   * writes the new ones to its own folder. */
  /* 🔴 THE EDITOR'S OWN SHOTS, at the two widths it is measured at. */
  const editorShots = path.join(REPO, 'docs/screenshots/design-editor')
  fs.mkdirSync(editorShots, { recursive: true })

  const list = await engines()
  let measured = 0
  for (const eng of list) {
    if (eng.skip) { lines.push(`⚠️ ${eng.name}: SKIPPED — ${eng.skip}`); continue }
    measured++
    lines.push(`── ${eng.name} ────────────────────────────────────────────────────────────────`)

    /* ⛔ THE SEVEN-WIDTH SWEEP OVER Social posts' THREE BOXES WENT WITH ITS FIXTURE — see the
     * tombstone at the top of this file. `scripts/social-tab-render.cjs` measures the screens that
     * replaced it. ⚠️ THE EDITOR AND THE PICKER SET THEIR OWN VIEWPORTS BELOW, so nothing here needs
     * to leave one behind. */

    /* ══ 🔴 THE SHARED DESIGN EDITOR — WEBKIT ONLY, TWO WIDTHS ════════════════════════════════════
     * ⛔ THE BRIEF'S INSTRUCTION, AND THE RIGHT TRADE. The device is a Mac and the browser is Safari,
     * and this layout has ONE breakpoint: 1100 is above it (a laptop window — the width the previous
     * breakpoint bug was reported at) and 390 is below it (a phone). Measuring it in Chromium too, at
     * seven widths, would be twelve more measurements of the same two cases.
     * ⚠️ SKIPPED AND SAID SO on Chromium rather than silently not run — an engine that quietly
     * measures nothing is how a harness reports a pass it never earned. */
    if (eng.name !== 'WebKit') {
      lines.push('  ⚠️ the design editor is measured in WebKit only (the brief) — skipped here')
    } else {
      /* ══ 🔴 THREE WIDTHS NOW, AND THE MIDDLE ONE IS THE POINT ════════════════════════════════
       * ⛔ IT WAS 1100 AND 390 — above and below the one breakpoint this layout had. There are TWO
       * now, at 900 and 1100, and the band BETWEEN them is a real laptop window: 1000px is wide enough
       * for the list beside the poster and too narrow for a 320px panel as well. ⚠️ THAT BAND IS
       * EXACTLY WHERE THIS PROJECT HAS ALREADY SHIPPED A BUG — `lg:` (1024) was set once when the
       * machine was 1100px wide — so a sweep that measured only the two ends would measure only the
       * two cases nobody gets wrong. */
      /* ══ 🔴 §7 (10 October 2026) · THE FIVE WIDTHS THE BRIEF NAMES, PLUS THE PHONE ══════════════════
       * ⛔ DOMINIC: *"at my window width the settings panel and the Save design button are cut off on
       * the right."* Three widths could not find it — 1100, 1000 and 390 are the two breakpoint edges
       * and a phone, which is exactly the set that misses whatever happens in between. ⚠️ 1440 AND 1728
       * ARE THE WIDE CASES, where the editor has most room and is therefore least suspected. */
      const EDITOR_WIDTHS = [
        [1000, 800, 'narrow laptop'], [1100, 800, 'laptop window'], [1280, 900, 'desktop'],
        [1440, 900, 'large desktop'], [1728, 1000, 'full window'], [390, 844, 'phone'],
      ]
      for (const [w, h, label] of EDITOR_WIDTHS) {
        await eng.setViewport(w, h)
        await eng.page.goto(write(`editor-${w}-${eng.name}.html`, editorFixture(css)))
        const r = await eng.page.evaluate(editorRects)
        lines.push(`  ${w}×${h} (${label}) editor  grid ${r.gridTrackCount} col · panel ${r.panelsVisible} visible · stage ${r.stage.width}×${r.stage.height}`)

        /* 🔴 THE ONE THING THIS SCREEN MUST NEVER DO. A drag surface on a page that pans sideways is a
         * page where a drag moves the page instead of the box. */
        t(r.docScrollW <= r.innerW, `🔴 ${w} editor: NO HORIZONTAL PAGE SCROLL`)

        /* ══ 🔴 THE TRACK COUNT, PER BREAKPOINT ═══════════════════════════════════════════════════
         * ⛔ READ OFF THE COMPUTED **TRACK LIST**, which is the only thing that can tell a column that
         * is absent from one that is merely empty this render — and the only thing that can tell a
         * two-track grid from one whose second item has wrapped.
         * ⚠️ ONE BREAKPOINT NOW: two columns at 1100, one below. It was two breakpoints and three
         * columns this morning; the list moved inside the panel, so the 900 rule had nothing left to
         * switch on. */
        const wantTracks = w >= 1100 ? 2 : 1
        t(r.gridTrackCount === wantTracks,
          `🔴 ${w} editor: the grid has ${wantTracks} column(s) (saw ${r.gridTrackCount}: ${r.grid.cols})`)

        /* ══ ⛔ EXACTLY ONE SETTINGS PANEL IS ON SCREEN ════════════════════════════════════════════
         * ⚠️ IT WAS ONE ELEMENT RENDERED INTO **TWO** WRAPPERS and is one element in one place now. The
         * number is the same and the reason is simpler, which is the point. */
        t(r.panelsVisible === 1,
          `⛔ ${w} editor: exactly ONE settings panel is visible (saw ${r.panelsVisible})`)

        /* ══ 🔴 §7 · NOTHING IS CUT OFF ON THE RIGHT ══════════════════════════════════════════════════
         * ⛔ THE REPORT WAS SPECIFIC — the settings panel AND the Save button — so both are measured by
         * name rather than by a page-level scroll check that could pass while an element sat under the
         * edge. ⚠️ `right <= innerW` IS THE CLAIM: an element whose right edge is past the viewport is
         * cut off whether or not the page admits it by scrolling.
         * 🔴 AND THE TITLE ROW **WRAPS** RATHER THAN OVERFLOWING, which is what `flex-wrap` buys and
         * what the measurement has to prove: a row that grew past the page would report the same
         * `right` for its last button either way, so the row's own width is checked against its
         * container as well. */
        t(r.saveBtn && r.saveBtn.right <= r.innerW + 1,
          `🔴 ${w} editor: the Save button is on screen (right ${r.saveBtn?.right} of ${r.innerW})`)
        t(r.panelCol && r.panelCol.right <= r.innerW + 1,
          `🔴 ${w} editor: the settings panel is on screen (right ${r.panelCol?.right} of ${r.innerW})`)
        t(r.topbar && r.topbar.width <= r.innerW + 1,
          `🔴 ${w} editor: the title row fits across the page (${r.topbar?.width} of ${r.innerW})`)
        t(r.topbar && r.topbar.scrollW <= r.topbar.clientW + 1,
          `🔴 ${w} editor: …and it WRAPS rather than overflowing (content ${r.topbar?.scrollW} in ${r.topbar?.clientW})`)

        /* ══ 🔴 A SETTING NEVER COVERS THE POSTER — WHICH IS WHY THE POP-UPS WENT ══════════════════
         * ⛔ THIS IS THE MEASUREMENT THE WHOLE CHANGE EXISTS FOR, and it is one a source check cannot
         * make: every setting in the two pop-ups was about how the words look ON THE POSTER, and
         * opening either put a panel over it. Here the panel is beside the poster above 1100 and under
         * it below — and in NEITHER case do their boxes overlap. */
        const overlaps = r.panelCol.left < r.stage.right && r.panelCol.right > r.stage.left
          && r.panelCol.top < r.stage.bottom && r.panelCol.bottom > r.stage.top
        t(!overlaps,
          `🔴 ${w} editor: the settings never cover the poster (panel ${r.panelCol.left}…${r.panelCol.right} × ${r.panelCol.top}…${r.panelCol.bottom}, poster ${r.stage.left}…${r.stage.right} × ${r.stage.top}…${r.stage.bottom})`)

        /* ══ 🔴 **THE POSTER IS THE LARGEST SIZE THAT FITS THE AREA, BOTH WAYS** ════════════════════
         * ⛔ IT WAS CAPPED AT `min(64vh, 820px)` — a GUESS at how much of the window it may have, wrong
         * in both directions: on a 16-inch window 64vh left a third of the height unused, and on a
         * short window the title row and the hint pushed the bottom off the screen because neither was
         * counted. 🔴 SO IT IS FITTED TO THE MEASURED AREA, and this is the measurement that says so:
         * it touches ONE of the area's two dimensions and overflows neither. */
        /* ⚠️ COMPARED AGAINST THE AREA'S **CONTENT** BOX, not its border box. `clientWidth` includes
         * padding, and forgetting that is the bug this check caught: the poster was fitted to 366 inside
         * a 342px content box on a phone, so the area scrolled sideways at Fit. */
        t(r.stage.width <= r.stageArea.contentW + 1 && r.stage.height <= r.stageArea.contentH + 1,
          `🔴 ${w} editor: the poster fits the area (${r.stage.width}×${r.stage.height} in ${r.stageArea.contentW}×${r.stageArea.contentH})`)
        /* ⛔ AND IT IS **AS LARGE AS FITS**, not merely inside: one dimension is within 8px of the
         * area's. A poster at half the available size would pass the containment test alone, which is
         * exactly the failure the old `vh` cap produced. */
        t(Math.abs(r.stage.width - r.stageArea.contentW) <= 8
          || Math.abs(r.stage.height - r.stageArea.contentH) <= 8,
          `🔴 ${w} editor: …and it is as large as fits — it touches one edge (${r.stage.width}/${r.stageArea.contentW} wide, ${r.stage.height}/${r.stageArea.contentH} tall)`)
        /* ⚠️ AND AT **Fit** NOTHING SCROLLS, which is what makes + meaningful. */
        t(r.stageArea.scrollW <= r.stageArea.clientW + 1,
          `⚠️ ${w} editor: at Fit the area does not scroll sideways`)

        if (w >= 1100) {
          /* ══ 🔴 THE PANEL IS THE SECOND COLUMN, TO THE RIGHT OF THE POSTER ════════════════════════ */
          t(r.panelCol.left >= r.stage.right - 1,
            `🔴 ${w} editor: the panel is to the RIGHT of the poster (panel starts ${r.panelCol.left}, poster ends ${r.stage.right})`)
          t(r.panelCol.width >= 360 && r.panelCol.width <= 400,
            `⚠️ ${w} editor: …and it is about 380px wide (${r.panelCol.width})`)
          /* ⛔ AND IT IS GENUINELY STICKY, READ COMPUTED. A `sticky` class inside an `overflow:hidden`
           * ancestor does not stick, and nothing but the browser can say so. */
          t(r.panelColStyle?.position === 'sticky',
            `🔴 ${w} editor: the panel column is sticky (position: ${r.panelColStyle?.position})`)
          t((r.panelColStyle?.maxH ?? 0) > 0 && r.panelColStyle.maxH <= r.innerH,
            `⛔ ${w} editor: …and capped to the window, so it CAN stick (max-height ${r.panelColStyle?.maxH} ≤ ${r.innerH})`)
          t(r.panelColStyle?.overflowY === 'auto' || r.panelColStyle?.overflowY === 'scroll',
            `⛔ ${w} editor: …and scrolls inside itself (overflow-y: ${r.panelColStyle?.overflowY})`)
        } else {
          /* ══ 🔴 BELOW 1100 THE PANEL DROPS **UNDER THE POSTER** — the brief's own instruction ══════
           * ⚠️ AND IT IS THE RIGHT ONE: at 1000px a 380px column would take more than a third of the
           * width from the poster, which is the thing the operator is looking at. */
          t(r.panelCol.top >= r.stage.bottom - 1,
            `🔴 ${w} editor: the panel drops UNDER the poster (panel starts ${r.panelCol.top}, poster ends ${r.stage.bottom})`)
          /* ⛔ AND IT IS NOT STICKY THERE. Under the poster there is nothing above it to stay level
           * with, and a `sticky` element filling its own scroll container is a no-op at best. */
          t(r.panelColStyle?.position !== 'sticky',
            `⛔ ${w} editor: …and it is not sticky there (position: ${r.panelColStyle?.position})`)
        }

        /* ══ 🔴 THE ITEM LIST IS INSIDE THE PANEL, AND Background picture IS ITS LAST ROW ═══════════
         * ⛔ THE LIST WAS A 250px COLUMN ON THE FAR SIDE OF THE POSTER, with the settings on the other —
         * the two halves of ONE job as far apart as the screen allowed, so picking a box and changing
         * it was a 1,000px round trip. ⚠️ MEASURED AS CONTAINMENT, which is what "inside" means. */
        t(r.itemGrid.visible
          && r.itemGrid.top >= r.panelCard.top - 1 && r.itemGrid.bottom <= r.panelCard.bottom + 1
          && r.itemGrid.left >= r.panelCard.left - 1 && r.itemGrid.right <= r.panelCard.right + 1,
          `🔴 ${w} editor: the item list is INSIDE the settings panel`)
        /* ⛔ AND Background picture IS A ROW INSIDE THAT LIST, not a card under it — which is what made
         * it the one thing you could change without selecting it. */
        t(r.bgRow.visible && r.bgRow.bottom <= r.itemGrid.bottom + 1 && r.bgRow.top >= r.itemGrid.top,
          `🔴 ${w} editor: Background picture is a ROW INSIDE the list, not a card under it`)

        /* ══ 🔴 THE SWITCH KNOB SITS **INSIDE** ITS TRACK — REPORTED BY DOMINIC ═════════════════════
         * ⛔ IT DID NOT. The knob was `absolute top-0.5` with **no `left`**, so its horizontal position
         * was its STATIC POSITION — a property of the inline formatting context it would have had, not
         * a reliable 0 — and `translate-x-4` carried it out the other side.
         * 🔴 THIS IS THE ONLY CHECK THAT COULD HAVE CAUGHT IT. A class census sees `translate-x-4` and
         * cannot tell where the element it moves started from; only a layout engine knows.
         * ⚠️ AND THE CLEARANCE IS ASSERTED TOO, so "inside" cannot be satisfied by a knob exactly
         * filling its track. */
        t(r.knobs.length > 0 && r.knobs.every(k => k.inside),
          `🔴 ${w} editor: every switch knob is INSIDE its track (${r.knobs.length} switches)`)
        t(r.knobs.every(k => k.gapLeft >= 0 && k.gapRight >= 0 && (k.gapLeft + k.gapRight) >= 2),
          `⚠️ ${w} editor: …with clearance at both ends (left ${r.knobs[0]?.gapLeft}, right ${r.knobs[0]?.gapRight})`)

        /* ══ 🔴 THE THREE SECTIONS, WITH THE BRIEF'S OWN DEFAULTS ══════════════════════════════════
         * ⚠️ READ OUT OF THE **VISIBLE** PANEL, so a hidden copy cannot answer for the one on screen.
         * ⛔ TEXT HAS A BODY AND NO FOLD; MAKE IT STAND OUT HAS A BODY (open); MORE OPTIONS HAS NO BODY
         * AND A SUMMARY (folded). A folded section with no summary is a closed door with no sign on it,
         * which is the one thing that would make "nothing is lost" a lie on the screen. */
        t(!!r.sections && r.sections.text && r.sections.textBody,
          `🔴 ${w} editor: TEXT is open, with its controls on screen`)
        t(!!r.sections && r.sections.stand && r.sections.standBody,
          `🔴 ${w} editor: MAKE IT STAND OUT is OPEN by default`)
        t(!!r.sections && r.sections.more && r.sections.moreBody === false
          && /Spacing, tilt, italic/.test(r.sections.moreSummary),
          `🔴 ${w} editor: MORE OPTIONS is FOLDED, with a summary naming what is inside`)
        /* ⚠️ AND THE PANEL SAYS WHICH BOX IT IS ABOUT. An operator who clicked a box on the poster
         * needs to know which one before they change anything in it. */
        t(!!r.sections && r.sections.title === 'Date',
          `⚠️ ${w} editor: …and the panel's header names the selected item ("${r.sections?.title}")`)

        t(r.caption.visible && r.caption.top >= r.stage.bottom - 1,
          `⚠️ ${w} editor: the caption is under the picture`)
        t(r.saveBtn.right <= r.innerW + 1 && r.topbar.scrollW <= r.topbar.clientW + 1,
          `⚠️ ${w} editor: the top bar wraps and Save design is on screen`)

        await eng.shot(path.join(editorShots, `editor-${w}.png`))
      }

      /* ══ 🔴 ZOOMED IN, AT 1728 — THE BUG DOMINIC REPORTED ══════════════════════════════════════════
       * ⛔ "zooming in (e.g. 125%) currently widens the whole page, cutting off the settings panel and
       * the Save button." 🔴 THE CLAIM IS THEREFORE A **COMPARISON WITH THE UNZOOMED RENDER**: the page
       * does not get wider, the panel does not move, and the Save button stays where it was. ⚠️ A
       * containment test alone would not catch it — the panel could be pushed off screen and still be
       * "inside" a page that had grown. */
      {
        await eng.setViewport(1728, 1000)
        await eng.page.goto(write(`editor-fit-${eng.name}.html`, editorFixture(css)))
        const atFit = await eng.page.evaluate(editorRects)
        await eng.page.goto(write(`editor-zoom-${eng.name}.html`, editorFixture(css, { zoom: 6 })))
        const zoomed = await eng.page.evaluate(editorRects)
        lines.push(`  1728×1000 editor zoomed  page ${atFit.docScrollW}→${zoomed.docScrollW} · panel ${atFit.panelCol.left}→${zoomed.panelCol.left} · poster ${atFit.stage.width}→${zoomed.stage.width}`)
        /* ⚠️ THE PREMISE FIRST: the poster really did get bigger, or the rest of this proves nothing. */
        t(zoomed.stage.width > atFit.stage.width + 20,
          `⚠️ 1728 editor+zoom: the poster really is bigger (${atFit.stage.width} → ${zoomed.stage.width})`)
        t(zoomed.docScrollW <= zoomed.innerW,
          `🔴 1728 editor+zoom: THE PAGE DOES NOT WIDEN (scrollWidth ${zoomed.docScrollW} ≤ ${zoomed.innerW})`)
        t(zoomed.panelCol.left === atFit.panelCol.left && zoomed.panelCol.width === atFit.panelCol.width,
          `🔴 1728 editor+zoom: …and the settings panel has not moved or narrowed (${atFit.panelCol.left}/${atFit.panelCol.width} → ${zoomed.panelCol.left}/${zoomed.panelCol.width})`)
        t(zoomed.saveBtn.right <= zoomed.innerW + 1 && zoomed.saveBtn.right === atFit.saveBtn.right,
          `🔴 1728 editor+zoom: …and Save design is exactly where it was (${atFit.saveBtn.right} → ${zoomed.saveBtn.right})`)
        /* ⛔ AND THE **AREA** IS WHAT SCROLLS, in both directions — which is where the zoom is supposed
         * to go. A page that did not widen because the poster was clipped would fail this. */
        t(zoomed.stageArea.scrollW > zoomed.stageArea.clientW,
          `⛔ 1728 editor+zoom: …and the grey AREA scrolls sideways instead (${zoomed.stageArea.scrollW} in ${zoomed.stageArea.clientW})`)
      }

      /* ══ 🔴 MORE OPTIONS OPEN, AT 1100 — THE CASE THAT DECIDES WHETHER STICKY WORKS ══════════════
       * ⛔ A STICKY ELEMENT TALLER THAN THE VIEWPORT CANNOT STICK. Opened, MORE OPTIONS is six groups
       * of three controls, which is far taller than an 800px window — so without `max-h` plus
       * `overflow-y-auto` the panel would scroll the PAGE and take the poster off the screen, which is
       * the pop-ups' failure in a slower form. 🔴 SO THE CLAIM IS THAT THE **PANEL** SCROLLS, not the
       * page: more content than box, AND the box no taller than the window. */
      {
        await eng.setViewport(1100, 800)
        await eng.page.goto(write(`editor-more-${eng.name}.html`, editorFixture(css, { moreOpen: true })))
        const r = await eng.page.evaluate(editorRects)
        lines.push(`  1100×800 editor (MORE OPTIONS open)  panel ${r.panelColStyle?.clientH}px showing ${r.panelColStyle?.scrollH}px`)
        t(r.docScrollW <= r.innerW, '🔴 1100 editor+more: NO HORIZONTAL PAGE SCROLL')
        t((r.panelColStyle?.scrollH ?? 0) > (r.panelColStyle?.clientH ?? 0) + 50,
          `🔴 1100 editor+more: the panel SCROLLS inside itself (${r.panelColStyle?.scrollH}px of controls in ${r.panelColStyle?.clientH}px)`)
        t(r.panelCol.height <= r.innerH,
          `🔴 1100 editor+more: …and the panel itself fits the window (${r.panelCol.height} ≤ ${r.innerH}) — the PAGE does not grow`)
        /* ⚠️ AND THE POSTER IS STILL THE SAME SIZE. Opening a section must not move or shrink the thing
         * the section is about — which is what a pop-up anchored to a toolbar button did every time. */
        t(r.stage.width > 100 && r.sections?.moreBody === true,
          `⚠️ 1100 editor+more: …with MORE OPTIONS' own controls on screen beside an unshrunken poster (${r.stage.width}px)`)
        await eng.shot(path.join(editorShots, 'editor-1100-more-options.png'))
      }

      /* ══ 🔴 THE FONT PICKER, AT THE SAME TWO WIDTHS (part 2) ══════════════════════════════════
       * ⚠️ ONE QUICK MEASUREMENT, which is what §5 asks for: "One quick WebKit render of the picker at
       * 1100 and 390: no sideways scroll, list scrolls inside." */
      for (const [w, h, label] of EDITOR_WIDTHS) {
        await eng.setViewport(w, h)
        /* ⚠️ 380 WHERE THE PANEL IS THE SECOND COLUMN, AND THE CONTENT WIDTH BELOW IT. ⛔ `w - 48`,
         * NOT `w - 24`: the fixture's page has padding and so does the card inside it, and a host wider
         * than the content box made the PAGE scroll sideways — which the first measurement in this
         * block then reported, correctly, as a failure of the fixture rather than of the component. */
        await eng.page.goto(write(`picker-${w}-${eng.name}.html`,
          pickerFixture(css, { width: w >= 1100 ? 380 : w - 48 })))
        const r = await eng.page.evaluate(pickerRects)
        lines.push(`  ${w}×${h} (${label}) font picker  panel ${r.panel.width}×${r.panel.height} · list ${r.list.clientH}px showing ${r.list.scrollH}px · tabs on ${r.tabRows} row(s)`)

        t(r.docScrollW <= r.innerW, `🔴 ${w} picker: NO HORIZONTAL PAGE SCROLL with the list open`)
        t(r.panel.right <= r.innerW + 1 && r.panel.left >= -1,
          `🔴 ${w} picker: the panel is inside the viewport (${r.panel.left}…${r.panel.right} in ${r.innerW})`)

        /* 🔴 THE LIST SCROLLS **INSIDE** THE PANEL. `scrollHeight > clientHeight` is the honest test —
         * there is more content than box — and it is asserted BESIDE the panel being shorter than the
         * window, because a panel that had simply grown would also have `scrollHeight` content. */
        t(r.list.scrollH > r.list.clientH + 50,
          `🔴 ${w} picker: the list SCROLLS inside itself (${r.list.scrollH}px of rows in ${r.list.clientH}px)`)
        t(r.panel.height <= r.innerH,
          `🔴 ${w} picker: …and the panel itself fits the window (${r.panel.height} ≤ ${r.innerH}) — the PAGE does not grow`)

        /* ⛔ EVERY ROW IS INSIDE THE PANEL. A long family name plus the date sample plus a licence tag
         * is what crowds a 22rem panel, and `min-w-0`+`truncate` is what makes the NAME give way. */
        t(r.rows.length >= 50 && r.rows.every(row => row.right <= r.panel.right + 1 && row.left >= r.panel.left - 1),
          `🔴 ${w} picker: all ${r.rows.length} rows are inside the panel`)
        /* ⚠️ AND EVERY ROW IS THE SAME HEIGHT. One row wrapping to two lines is what makes a list of
         * sixty impossible to scan — and it is the thing a long name would cause. */
        t(new Set(r.rows.map(row => row.height)).size === 1,
          `⚠️ ${w} picker: …and every row is one line (${[...new Set(r.rows.map(x => x.height))].join('/')}px)`)

        t(r.search.right <= r.panel.right + 1 && r.search.width > 100,
          `⚠️ ${w} picker: the search box fits the panel`)
        /* 🔴 THE REAL COUNT IS ON SCREEN. The fixture lifts it from the generated catalogue, so this
         * fails if the component ever hard-codes a number. */
        t(/^Search [\d,]+ fonts$/.test(r.searchText) && !/1,500/.test(r.searchText),
          `🔴 ${w} picker: the search box shows the real font count ("${r.searchText}")`)
        t(r.tabCount === 6 && r.tabs.right <= r.panel.right + 1,
          `⚠️ ${w} picker: all six tabs are present and inside the panel (on ${r.tabRows} row(s))`)
        /* ══ 🔴 THE PANEL FITS **ITS PARENT**, WHICH IS WHAT `w-full` IS FOR ════════════════════════
         * ⛔ IT WAS `w-[22rem]` — 352px — CAPPED AT `calc(100vw-2rem)`, and on a 1728px window that cap
         * is 1696px: so the list opened at its full 352px and ran past the right edge of the 380px
         * settings column it lives in. **A cap against the wrong container is not a cap**, and this is
         * the measurement that says so. ⚠️ THE PARENT IS GIVEN THE PANEL'S REAL WIDTH by the fixture, so
         * what is measured is the rule rather than a number this file chose. */
        t(r.panel.right <= r.host.right + 1 && r.panel.left >= r.host.left - 1,
          `🔴 ${w} picker: the panel fits inside its own column (${r.panel.left}…${r.panel.right} in ${r.host.left}…${r.host.right})`)
        /* ⚠️ "AS WIDE AS ITS COLUMN **OR** CAPPED AT THE VIEWPORT", whichever is smaller. The viewport
         * cap is the belt `w-full` cannot provide: a 390px phone where the row is nearly the whole
         * screen. ⛔ ASSERTING EQUALITY ALONE WOULD HAVE MADE THE CAP A FAILURE. */
        t(Math.abs(r.panel.width - Math.min(r.host.width, r.innerW - 32)) <= 1,
          `⚠️ ${w} picker: …and it is as wide as that column, or capped at the viewport (${r.panel.width} vs ${r.host.width})`)

        await eng.shot(path.join(editorShots, `font-picker-${w}.png`))
      }

      /* ── THE PICKER'S CONTROL ──────────────────────────────────────────────────────────────────
       * ⛔ WITHOUT IT, "the list scrolls inside" WOULD PASS ON A PANEL THAT HAD NO HEIGHT CAP — the
       * rows would still overflow something. With the cap removed the PANEL grows past the window,
       * which is the failure the assertion above is about. */
      await eng.setViewport(390, 844)
      await eng.page.goto(write(`picker-ctl-${eng.name}.html`,
        pickerFixture(css, { width: 366 }).replace(/max-h-\[46vh\]/, '')))
      const pctl = await eng.page.evaluate(pickerRects)
      t(pctl.panel.height > pctl.innerH,
        '🔴 CONTROL: with the list\'s height cap removed, the panel outgrows the window — so the scroll claim is a measurement')

      /* ── THE EDITOR'S CONTROLS, ONE PER BREAKPOINT ──────────────────────────────────────────────
       * ⛔ WITHOUT THEM, "the grid has three columns at 1100" WOULD PASS ON A PAGE THAT NEVER HAD A
       * GRID. A fixture must be able to render the shape that FAILS — this project has shipped a check
       * that could only draw the expected one and passed vacuously for a day.
       * 🔴 TWO CONTROLS, BECAUSE THERE ARE TWO BREAKPOINTS, and each strips exactly one of them. A
       * single control stripping both would pass while telling nobody WHICH rule had stopped working —
       * and the 1100 one is the new rule, so it is the one most likely to be the next thing lost. */
      /* ══ ⛔ ONE CONTROL, BECAUSE THERE IS ONE BREAKPOINT ════════════════════════════════════════════
       * ⚠️ THERE WERE TWO — one per breakpoint, with the 900 one deliberately run at 1000 because at
       * 1100 the other rule would have answered for it. The 900 rule is gone: the item list lives
       * inside the panel, so there was nothing left for it to switch on.
       * ⛔ WITHOUT THIS CONTROL, "two columns at 1100" WOULD PASS ON A PAGE THAT NEVER HAD A GRID. A
       * fixture must be able to render the shape that FAILS — this project has shipped a check that
       * could only draw the expected one and passed vacuously for a day. */
      await eng.setViewport(1100, 800)
      await eng.page.goto(write(`editor-ctl-1col-${eng.name}.html`, editorFixture(css, { oneCol: true })))
      const ctl1 = await eng.page.evaluate(editorRects)
      t(ctl1.gridTrackCount === 1,
        `🔴 CONTROL: with the 1100px rule removed, 1100 becomes ONE column (saw ${ctl1.gridTrackCount}) — so the track count can tell them apart`)

      /* ══ ⛔ §7's CONTROL: THE TITLE ROW AS IT WAS ══════════════════════════════════════════════════
       * 🔴 THIS IS THE BUG, RESTORED. `shrink-0` on the label and no cap on the `<select>` — the shape
       * that shipped — and the measurement must notice the row overflowing its own box. Without it,
       * "the title row wraps rather than overflowing" would be a claim about a fixture that could not
       * have drawn anything else. ⚠️ AT 390, where a long option has nowhere to go. */
      await eng.setViewport(390, 844)
      await eng.page.goto(write(`editor-ctl-nowrap-${eng.name}.html`,
        editorFixture(css)
          .replace('flex min-w-0 items-center gap-1"><span class="shrink-0 text-[10px]',
            'flex items-center gap-1 shrink-0"><span class="text-[10px]')
          .replace(' min-w-0 max-w-[12rem] truncate"><option>This week', '"><option>This week')))
      const ctl2 = await eng.page.evaluate(editorRects)
      t(ctl2.topbar.scrollW > ctl2.topbar.clientW,
        `🔴 CONTROL: with the Preview-with control unshrinkable the title row OVERFLOWS (content ${ctl2.topbar.scrollW} in ${ctl2.topbar.clientW}) — so "it wraps" is a measurement`)
      t(ctl2.docScrollW > ctl2.innerW,
        `⛔ CONTROL: …and the page scrolls sideways with it (${ctl2.docScrollW} > ${ctl2.innerW}) — over a drag surface`)
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
  console.log('── SOCIAL POSTS, MEASURED: THE SIX BOXES, THE LISTS, AND THE PLACE DESIGN EDITOR ──────')
  for (const l of lines) console.log(l)
  console.log(fails === 0
    ? `\n✅ layout measured in ${measured} engine(s)`
    : `\n🔴 ${fails} MEASUREMENT(S) FAILED`)
  process.exit(fails === 0 ? 0 : 1)
}).catch(e => {
  console.error('\n🔴 ' + e.message)
  process.exit(1)
})
