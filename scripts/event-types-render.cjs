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
  /* ══ 🔴 THE STALENESS CHECK EXTENDED TO THE ARBITRARY VALUES (5 October 2026) ═══════════════════
   * `overflow-x-auto` is in every build this app has ever had, so it only catches a CSS from before
   * the panel existed. The denser grid is built out of ARBITRARY Tailwind values — `w-[38px]`,
   * `h-[22px]`, `top-[3px]`, `translate-x-[18px]` — and Tailwind emits a rule for one of those only
   * if it was in the source when the CSS was compiled.
   * 🔴 THIS COST A FULL RUN, AND THE RUN LOOKED LIKE A DESIGN FAULT. The compact switch measured
   * 0×0 in all 36 van-state cases, and the harness said "the switch is 38×22 (0×0)" thirty-six
   * times — which reads as "the component draws no switch", when what had happened is
   * that `.next/static` was built before `compact` existed, so the browser had no rule for either
   * dimension and an unstyled div is zero high.
   * ⛔ SO THE CLASSES ARE READ OUT OF primitives.tsx AND LOOKED UP BY NAME. A missing rule now says
   * "run `npx next build`", which is true and actionable, instead of 36 measurements blaming the
   * component for something the build artefact did. */
  const arbitrary = [...new Set((PRIM.match(/(?:w|h|top|translate-x)-\[\d+px\]/g) || []))]
  const missing = arbitrary.filter(c => !css.includes('.' + c.replace('[', '\\[').replace(']', '\\]')))
  if (missing.length) {
    throw new Error(`the compiled CSS has no rule for ${missing.join(', ')} — these are arbitrary `
      + `Tailwind values in components/manage/primitives.tsx and the CSS predates them, so the `
      + `switch would measure 0×0; run \`npx next build\``)
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
function panelFixture(css, typeCount, breakScroll = false, vans = 'one', inline = false, opts = {}) {
  /* ── 🔴 THE FOUR STATES THIS FIXTURE HAS TO BE ABLE TO DRAW (5 October 2026) ─────────────────
   *  `pricesOn`      — at least one type's "Change prices" switch is on, so the three RULE rows and
   *                    the "Item prices" row EXIST. With it false they must fold away entirely, and
   *                    that folding is itself a measurement.
   *  `showItems`     — the per-item rows are expanded (the Hide/Show button's state).
   *  `sameSettings`  — "Same settings for all vans" is ON, so the Standard side is ONE column headed
   *                    "All vans" instead of one per van. Both states are measured.
   * ⚠️ DEFAULTED SO EVERY EXISTING CALL SITE KEEPS ITS MEANING: a call that passes no `opts` draws
   * prices ON with the items collapsed, which is the state with the most to measure. */
  const pricesOn = opts.pricesOn !== false
  const showItems = opts.showItems === true
  const sameSettings = opts.sameSettings === true
  /* ── 🔴 EVERY CLASS AND EVERY NUMBER IS LIFTED FROM THE COMPONENT ────────────────────────────────
   * `lift` THROWS if a pattern is not found, which is the point: each time this build changed shape —
   * the shell, the Standard cell, both control looks, the grid template, and then the whole Standard
   * column becoming one column per van — this fixture stopped BUILDING instead of going on measuring
   * a screen nobody is served. That is the failure the Settings build hit, and it is why none of
   * these is typed out here. */
  const shell = lift(UI, /'(bg-white max-h-\[92vh\] rounded-2xl shadow-2xl flex flex-col overflow-hidden)'/, 'the modal shell')
  /* 🔴 THE INLINE SHELL — the same box as a `<Card>`, lifted from the other arm of the same ternary,
   * because Event types is the third Schedule PILL now as well as an overlay. Lifting both arms means
   * the fixture cannot measure one shell while the page renders the other. */
  const shellInline = lift(UI, /'(bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden)'/, 'the inline shell')
  const header = lift(UI, /<div className="(shrink-0 flex items-center gap-3 px-4 sm:px-5 py-4 border-b border-slate-200)">/, 'the modal header')
  const body = lift(UI, /inline \? '' : '(flex-1 min-h-0 overflow-y-auto)'/, 'the modal body')
  const scroller = lift(UI, /<div className="(hidden md:block overflow-x-auto px-2 pb-2)" data-types-scroller>/, 'the columns scroller')
  const phone = lift(UI, /<div className="(md:hidden p-4 space-y-3)">/, 'the phone column')
  /* The planned label cell: two paddings (indented sub-rows get `pl-7 pr-3`), lifted from the ternary. */
  /* ── 🔴 THREE PADDINGS NOW, ALL LIFTED (5 October 2026) ─────────────────────────────────────────
   * A setting row is `px-3`, a sub-row is `pl-7 pr-3`, and an ITEM is `pl-6 pr-3` — 12px in from its
   * category heading, so a category reads as a group. Lifted from the component's own ternary, so a
   * change there stops this file BUILDING rather than leaving it measuring the old indent. */
  const labelPads = (() => {
    const m = UI.match(/\$\{\s*\n?\s*r\.indent \? '(pl-7 pr-3)' : r\.k === 'price-item' \? '(pl-6 pr-3)' : '(px-3)'\}/)
    if (!m) throw new Error("the fixture cannot be built: the label cell's three paddings were not found in components/manage/EventTypes.tsx")
    return { sub: m[1], item: m[2], plain: m[3] }
  })()
  const labelBase = 'flex items-center gap-2 border-t border-slate-100 '
  const labelCell = labelBase + labelPads.plain
  const labelIndent = labelBase + labelPads.sub
  const labelItem = labelBase + labelPads.item
  /* 🔴 THE DIVIDER IS PART OF EVERY VALUE CELL NOW, and both halves are lifted so the fixture cannot
   * draw a grid with different lines from the screen's. */
  const divider = lift(UI, /const CELL_DIVIDER = '(.+?)'/, 'the column divider')
  /* ══ 🔴 RE-LIFTED FOR THE PLANNED GRID (5 October 2026) ═════════════════════════════════════
   * The grid plans its rows and places every cell explicitly, so there is no longer a `STD_CELL`
   * constant and no `min-h-11` anywhere — the HEIGHTS ARE NUMBERS, shared with the component through
   * `components/shared/PriceControls.tsx`'s `ROW_H`. Every cell right of the labels now shares ONE
   * class string, `base`, which is what makes "values centred in every value column" a property of
   * one definition rather than of forty call sites.
   * 🔴 LIFTED, NOT TYPED: if the component's cell class changes, this fixture stops BUILDING instead
   * of going on measuring a screen nobody is served. */
  const cell = `${divider} ` + lift(UI, /const base = `(px-2\.5 flex items-center justify-center min-w-0 border-t border-slate-100)`/, 'the value cell class')
  const stdCell = cell
  /* 🔴 THE ROW HEIGHTS AND THE CONTROL HEIGHT, from the shared module both screens read. */
  const ROW_H = (() => {
    const src = read('components/shared/PriceControls.tsx')
    const m = src.match(/export const ROW_H = \{ control: (\d+), item: (\d+), category: (\d+), section: (\d+) \}/)
    if (!m) throw new Error('the fixture cannot be built: ROW_H not found in components/shared/PriceControls.tsx')
    return { control: +m[1], item: +m[2], category: +m[3], section: +m[4] }
  })()
  /* 🔴 THE **GRID'S** CONTROL HEIGHTS, NOT THE SHEET'S. `CONTROL_H` (32) is the dashboard sheet's and
   * must not shrink — it is touched during service. The grid has its own, and this fixture measures
   * the grid, so it lifts those. Lifting the wrong one would measure a screen nobody is served. */
  const CONTROL_H = Number(lift(read('components/shared/PriceControls.tsx'), /export const GRID_CONTROL_H = (\d+)/, 'the grid control height'))
  const TYPED_H = Number(lift(read('components/shared/PriceControls.tsx'), /export const GRID_TYPED_H = (\d+)/, 'the grid typed-price height'))
  /* ══ 🔴 THE SHARED TOGGLE, LIFTED AS BOTH ARMS (5 October 2026) ════════════════════════════════
   * The Toggle grew a `compact` prop, so its track and knob are no longer one flat class string —
   * each is a base plus a ternary. These five pieces are lifted out of that ONE definition, and the
   * fixture's switch is assembled from them rather than retyped, so the grid's 38×22 and the phone
   * card's 44×24 both come from the component.
   * 🔴 THIS THREW, AND THAT IS THE DESIGN: adding `compact` broke the old flat lifts and the harness
   * refused to build instead of measuring a switch primitives.tsx had stopped drawing. */
  const TOGGLE = (() => {
    const track = PRIM.match(/<div className=\{`(relative rounded-full transition-colors shrink-0) \$\{compact \? '(w-\[\d+px\] h-\[\d+px\])' : '(w-11 h-6)'\} \$\{on \? 'bg-green-500' : 'bg-slate-300'\}`\}>/)
    const knob = PRIM.match(/<div className=\{`(absolute w-4 h-4 rounded-full bg-white shadow transition-transform) \$\{compact \? '(top-\[\d+px\])' : '(top-1)'\} \$\{on \? \(compact \? '(translate-x-\[\d+px\])' : '(translate-x-6)'\) : '(translate-x-1)'\}`\} \/>/)
    if (!track) throw new Error('the fixture cannot be built: no toggle track found in components/manage/primitives.tsx')
    if (!knob) throw new Error('the fixture cannot be built: no toggle knob found in components/manage/primitives.tsx')
    return { trackBase: track[1], trackCompact: track[2], trackFull: track[3],
      knobBase: knob[1], knobTopCompact: knob[2], knobTopFull: knob[3],
      onCompact: knob[4], onFull: knob[5], off: knob[6] }
  })()
  /* ── 🔴 PRIVATE EVENTS (20261014), LIFTED FROM THE COPY MODULE ─────────────────────────────────
   * The ORDERING band, its one row, and Standard's statement cell. Lifted, not typed, for the reason
   * every other string here is: if the component's wording changes this fixture stops BUILDING
   * instead of going on measuring a screen nobody is served. */
  const PE = read('lib/private-events/copy.ts')
  const ORDERING_SECTION = lift(PE, /export const ORDERING_SECTION = '(.+?)'/, 'the ORDERING band label')
  const PRIVATE_LINK_ROW = lift(PE, /export const PRIVATE_LINK_ROW_LABEL =\n?\s*'(.+?)'/, 'the link/QR row label')
  const PRIVATE_LINK_STD = lift(PE, /export const PRIVATE_LINK_STANDARD_CELL = '(.+?)'/, 'Standard\'s link/QR cell')
  const PRIVATE_TYPE_NAME = lift(PE, /export const PRIVATE_TYPE_NAME = '(.+?)'/, 'the Private type name')

  /* 🔴 THE THREE BACKGROUNDS, as hex, because neither of the two greys is a Tailwind value and the
   * measurement reads the computed `background-color`. */
  /* ⚠️ "THE BANDING", NOT THE SINGULAR OF "STRIPES", in this file's prose. The harness runner's
   * screen refuses that word as a whole word, case-insensitively, because it is the card processor's
   * name — so writing it here would make this file unrunnable through the runner, which is the
   * pre-existing fault this build fixed in two other harnesses. The IDENTIFIER is safe:
   * `\bstripe\b` does not match `STRIPE_BG`, because `_` is a word character. */
  const STRIPE_BG = lift(UI, /const STRIPE_BG = '(#[0-9A-F]{6})'/, 'the banding colour')
  const SECTION_BG = lift(UI, /const SECTION_BG = '(#[0-9A-F]{6})'/, 'the section band')
  const WHITE_BG = lift(UI, /const WHITE_BG = '(#[0-9A-F]{6})'/, 'the white background')
  /* The shared controls' own classes, so the fixture renders the components' output rather than a
   * look-alike. They live in primitives.tsx now; this file no longer defines a control. */
  /* ⚠️ FROM lib/ui-tokens.ts, which is where the box is DEFINED — primitives.tsx only re-exports
   * it under its old name. Lifting from the re-export would lift nothing. */
  const selBase = lift(TOKENS, /export const CONTROL_BOX =\n\s*'(.+?)'/, 'the control box')
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
  /* 🔴 THE SWITCH DECIDES THE SHAPE AS WELL AS THE VAN COUNT (5 October 2026). ON ⇒ one combined
   * column, headed "All vans"; OFF ⇒ one per active van. A one-van truck is the combined column
   * either way and its header reads "Standard", unchanged. */
  const vanCols = vanNames.length > 1 && !sameSettings ? vanNames : []
  /** The Standard column HEADINGS, in render order. One entry ⇒ the combined column. */
  const stdNames = vanCols.length > 1
    ? vanCols
    : [vanNames.length > 1 ? ALL_VANS_HEADER : 'Standard']
  const standardCols = vanCols.length > 1 ? vanCols.length : 1
  const valueColumnCount = standardCols + typeCount
  const cols = `${LABEL_W}px repeat(${valueColumnCount}, ${COL_W}px)`
  const dialogW = LABEL_W + COL_W * valueColumnCount + PAD

  /* ── 🔴 THE LAST COLUMN IS THE BUILT-IN PRIVATE TYPE (20261014) ───────────────────────────────
   * The component sorts `kind: 'private'` last explicitly, so the fixture draws it last too — and
   * every width/overflow measurement then covers the real column count a truck actually gets.
   * ⚠️ "Private hire" (a plausible CUSTOM name) STAYS IN THE LIST, deliberately: it is a different
   * thing from the built-in, and keeping both proves the lock and the purple heading attach to the
   * built-in rather than to anything whose name contains "private". */
  const customTypeNames = ['Festival', 'Market', 'Pub', 'Private hire', 'School fete']
  /* ⚠️ `typeCount` IS THE TOTAL NUMBER OF TYPE COLUMNS, AND THE BUILT-IN IS ONE OF THEM. So the
   * custom names are cut to `typeCount - 1` and Private is appended — `typeCount: 1` is a truck with
   * nothing but the built-in, which is what every truck gets the first time it opens the grid.
   * 🔴 THIS LINE PREVIOUSLY ENDED `.slice(0, typeCount)` ON THE ARRAY LITERAL, and the first version
   * of this edit left that `.slice` dangling onto the next statement — `1.slice is not a function`,
   * thrown before a single measurement ran. Written out in full so it cannot happen again. */
  const typeNames = [...customTypeNames.slice(0, Math.max(0, typeCount - 1)), PRIVATE_TYPE_NAME]
  /** True for the column index that is the built-in — always the last one. */
  const isPrivateCol = (ti) => ti === typeNames.length - 1

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
  /* ══ ⛔ `TRUCK_LEVEL` IS DELETED (5 October 2026) ═══════════════════════════════════════════
   * It read `standardWriteFor` for rows returning `scope: 'truck'`, because "Do you take cash?" was
   * one — `trucks.takes_cash`, a single column for the whole truck — and that was a LAYOUT fact this
   * fixture had to mirror. `truck_vans.takes_cash` (20261012) makes cash a van setting like the other
   * four, so EVERY service row is per van and there is nothing to branch on.
   * 🔴 THE HARNESS ASSERTS THE ABSENCE rather than trusting it: `scripts/event-types.cjs` refuses any
   * `scope: 'truck'` in that function. */

  /* ══ 🔴 THE OFFLINE ROW IS A **SWITCH** NOW, AND THE MODE IS A SUB-ROW (5 October 2026) ═══════
   * It was one three-choice dropdown — `Off` plus the two mode labels — and this list mirrored it.
   * The row is a switch, and the mode lives in an indented "When offline" sub-row that is absent when
   * protection is off in every column. So the list here is the TWO REAL MODES and no "Off".
   * ⚠️ STILL LIFTED FROM `lib/copy/offlineProtection.ts`: the shape changed, the vocabulary did not,
   * and a fixture that retyped the labels could measure a wording the screen does not have. */
  const OFFLINE_LABELS = [
    lift(read('lib/copy/offlineProtection.ts'), /OFFLINE_MODE_PAUSE_LABEL = '(.+?)'/, 'the pause label'),
    lift(read('lib/copy/offlineProtection.ts'), /OFFLINE_MODE_NO_AUTO_ACCEPT_LABEL = '(.+?)'/, 'the no-auto-accept label')]
  const WHEN_OFFLINE = lift(read('lib/copy/serviceSettings.ts'), /OFFLINE_WHEN_OFFLINE_LABEL = '(.+?)'/, 'the when-offline label')
  const PRICE_TYPE_HINT = lift(read('lib/copy/serviceSettings.ts'), /PRICE_TYPE_HINT = '(.+?)'/, 'the type-a-price hint')
  const SAME_SETTINGS_LABEL = lift(read('lib/copy/serviceSettings.ts'), /SAME_SETTINGS_ALL_VANS_LABEL = '(.+?)'/, 'the same-settings label')
  const ALL_VANS_HEADER = lift(read('lib/copy/serviceSettings.ts'), /SAME_SETTINGS_ALL_VANS_HEADER = '(.+?)'/, 'the all-vans header')
  const PRICE_LABELS = (() => {
    const lib = read('lib/copy/serviceSettings.ts')
    return {
      on: lift(lib, /price_change_on: '(.+?)'/, 'the change-prices label'),
      mode: lift(lib, /price_mode: '(.+?)'/, 'the price-change label'),
      amount: lift(lib, /price_amount: '(.+?)'/, 'the amount label'),
      rounding: lift(lib, /price_rounding: '(.+?)'/, 'the rounding label'),
      items: lift(lib, /item_prices: '(.+?)'/, 'the item-prices label'),
      stdCell: lift(lib, /PRICES_STANDARD_CELL = '(.+?)'/, 'the prices Standard cell'),
    }
  })()
  const PRICE_MODE_LABELS = ['None', '+ \u00a3', '+ %', '\u2212 \u00a3', '\u2212 %']
  const ROUNDING_LABELS = ['None', 'Nearest \u00a31', 'Always round up']

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
  /* 🔴 THE GRID'S SWITCH IS THE **COMPACT** ONE (5 October 2026): 38×22 with the same 16px knob, so
   * the travel is 18px rather than 24. `toggleTrack` (44×24) is kept for the phone card, which is not
   * dense — drawing the grid with it would measure a switch the grid does not render. */
  const toggle = (label, on, faded, id, title, dense = true) =>
    `<button type="button"${id ? ` id="${id}"` : ''} role="switch" aria-checked="${on}" aria-label="${label}"${title ? ` title="${title}"` : ''} class="flex items-center gap-2 group ${faded ? 'opacity-50' : ''}">`
    + `<div class="${TOGGLE.trackBase} ${dense ? TOGGLE.trackCompact : TOGGLE.trackFull} ${on ? 'bg-green-500' : 'bg-slate-300'}">`
    + `<div class="${TOGGLE.knobBase} ${dense ? TOGGLE.knobTopCompact : TOGGLE.knobTopFull} ${on ? (dense ? TOGGLE.onCompact : TOGGLE.onFull) : TOGGLE.off}"></div></div></button>`

  /** One control for a row, at a given value. */
  /* ══ ⛔ THE TWO HOVER TITLES ARE DELETED, AND SO IS THE FADE (5 October 2026) ═════════════════
   * `TYPE_FOLLOWS_VAN_TITLE` said "Follows each van's usual setting" on a FADED control, and
   * `TAKES_CASH_ALL_VANS_TITLE` said "Applies to all your vans" on the one truck-level row. Both
   * described the design the localhost report killed: a cell showing somebody else's setting.
   * 🔴 A TYPE HOLDS ITS OWN VALUES NOW, so every cell is a real control at full strength. The only
   * fade left anywhere is an untouched price Rounding, and that one is measured below by name.
   * ⚠️ `faded` SURVIVES AS A PARAMETER because the Rounding still uses it — it is no longer passed by
   * any service row, which `scripts/event-types.cjs` asserts. */
  const controlFor = (row, label, valueIdx, faded, id, title) => {
    if (row.k === 'collection_interval_mins') return sel(label, [`Every ${valueIdx ? 10 : 15} min`], faded, id, title)
    /* 🔴 A SWITCH, not the three-choice dropdown it was. */
    return toggle(label, valueIdx === 0, faded, id, title)
  }

  /* ══ 🔴 THE ROW PLAN — THE SAME MODEL THE COMPONENT USES ════════════════════════════════════════
   * The component plans its rows and then places every cell with an explicit `gridColumn` /
   * `gridRow`, because spans shear an auto-placed grid. This fixture does the same, for the same
   * reason: a fixture that auto-placed would measure a grid the screen does not draw.
   *
   * 🔴 THE ROWS, IN THE COMPONENT'S ORDER: VANS (2+ vans only) · PRICES · SERVICE · USED BY.
   */
  const plan = []
  if (vanCols.length > 1 || vans !== 'one') {
    plan.push({ k: 'section', label: 'VANS' })
    plan.push({ k: 'same-settings', label: SAME_SETTINGS_LABEL })
  }
  /* 🔴 ORDERING, ABOVE PRICES AND BELOW VANS — it decides whether there is anything to price. */
  plan.push({ k: 'section', label: ORDERING_SECTION })
  plan.push({ k: 'private-link', label: PRIVATE_LINK_ROW })
  plan.push({ k: 'section', label: 'PRICES' })
  plan.push({ k: 'price-switch', label: PRICE_LABELS.on })
  if (pricesOn) {
    plan.push({ k: 'price-rule', which: 'mode', label: PRICE_LABELS.mode, indent: true })
    plan.push({ k: 'price-rule', which: 'amount', label: PRICE_LABELS.amount, indent: true })
    plan.push({ k: 'price-rule', which: 'rounding', label: PRICE_LABELS.rounding, indent: true })
    plan.push({ k: 'items-band', label: 'ITEM PRICES' })
    if (showItems) {
      plan.push({ k: 'category', label: 'Pizzas' })
      plan.push({ k: 'price-item', label: 'Margherita', price: '£10.00' })
      plan.push({ k: 'price-item', label: 'Pepperoni', price: '£11.50' })
      plan.push({ k: 'category', label: 'Sides' })
      plan.push({ k: 'price-item', label: 'Garlic bread', price: '£2.00' })
    }
  }
  plan.push({ k: 'section', label: 'SERVICE' })
  for (const row of LABELS) {
    plan.push({ k: 'service', row, label: row.label })
    /* The "When offline" sub-row, which the component emits after the offline row when protection is
     * on in any column. The fixture draws it ON, because that is the state with something to measure. */
    if (row.k === 'offline_protection') plan.push({ k: 'offline-mode', label: WHEN_OFFLINE, indent: true })
  }
  plan.push({ k: 'section', label: 'USED BY' })
  plan.push({ k: 'used-by', label: 'Upcoming events' })

  /* 🔴 THE BANDING, RESTARTING AFTER EVERY HEADING — the component's own rule, replicated so the
   * measurement has something to compare the computed background against. */
  const stripeOf = (() => {
    const out = []
    let n = 0
    for (const r of plan) {
      if (r.k === 'section' || r.k === 'items-band' || r.k === 'category') { n = 0; out.push(false); continue }
      out.push(n % 2 === 1)
      n++
    }
    return out
  })()
  /* `items-band` IS A SECTION in every respect the layout cares about — band colour, heading type,
   * height, and restarting the striping. */
  const heightOf = (r) => (r.k === 'section' || r.k === 'items-band') ? ROW_H.section
    : r.k === 'category' ? ROW_H.category
    : r.k === 'price-item' ? ROW_H.item
    : ROW_H.control
  const bgOf = (r, idx) => (r.k === 'section' || r.k === 'items-band') ? SECTION_BG
    : r.k === 'category' ? WHITE_BG
    : (stripeOf[idx] ? STRIPE_BG : WHITE_BG)

  /** How many rows the "Your menu prices" cell spans down through, beyond its own. */
  const ruleRowCount = pricesOn ? 3 : 0

  const priceInput = (label, id) =>
    `<span class="relative inline-flex w-full min-w-0 items-stretch text-sm">`
    + `<input${id ? ` id="${id}"` : ''} type="text" aria-label="${label}" value="10" style="height:${CONTROL_H}px"`
    + ` class="w-full min-w-0 pr-6 text-center ${selBase}">`
    + `<span aria-hidden="true" class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">%</span></span>`

  /** One body row, as the component places it: label cell, Standard side, then the type columns. */
  const rowHtml = (r, idx) => {
    const gr = 3 + idx
    const h = heightOf(r)
    const bg = bgOf(r, idx)
    /* ══ 🔴 THE LABEL COLUMN MIRRORS THE COMPONENT (5 October 2026) ═══════════════════════════════
     * Regular weight, WRAPPING (no `truncate`), item names indented 12px under their category, and a
     * category heading with NO horizontal rule. Every one of those is a thing the measurement below
     * checks, so the fixture has to draw them — a fixture that still truncated would measure a screen
     * nobody is served and would report "nothing is clipped" for the wrong reason. */
    /* 🔴 `data-rowkind` ON THE LABEL CELL OF EVERY ROW, so the probe can measure heights BY KIND on
     * the rendered boxes. A class census cannot tell a 28px row from a 36px one. */
    const kindAttr = ` data-rowkind="${r.k}"`
    const st = (extra) => `style="${extra};min-height:${h}px;background:${bg}"`
    const out = []

    // ── the label cell ──
    if (r.k === 'section' || r.k === 'items-band') {
      /* 🔴 THE PILL IS INSIDE THE BAND, IMMEDIATELY AFTER THE HEADING TEXT. The grid scrolls
       * sideways; this is the one position visible at every scroll offset, which is the whole reason
       * it moved out of the label cell. */
      const pill = r.k === 'items-band'
        ? `<button id="itemsToggle" class="shrink-0 rounded-full border border-slate-300 bg-white px-2 py-px text-[10px] font-bold text-slate-700 normal-case tracking-normal">`
          + `${showItems ? 'Hide' : 'Show'} 3 items ${showItems ? '\u25b4' : '\u25be'}</button>`
        : ''
      out.push(`<div${kindAttr} class="px-3 flex items-center gap-2 ${heading} border-t border-slate-100" ${st(`grid-column:1;grid-row:${gr}`)}`
        + ` id="${'sec-' + r.label.replace(/\s/g, '').toLowerCase()}"><span class="shrink-0">${r.label}</span>${pill}</div>`)
    } else if (r.k === 'category') {
      /* 🔴 NEAR-BLACK, EXTRABOLD, 12px — and ⛔ NO `border-t` AT ALL. A darker rule on the label cell
       * only drew a stub under the label column (the "looks broken" Dominic reported); the heading
       * separates the group by being a heading. The VERTICAL dividers still run through the row. */
      out.push(`<div${kindAttr} id="catLabel" class="px-3 flex items-center text-[12px] font-extrabold text-slate-900 tracking-[0.04em] uppercase leading-tight" ${st(`grid-column:1;grid-row:${gr}`)}><span>${r.label}</span></div>`)
    } else {
      const cls = r.indent ? labelIndent : r.k === 'price-item' ? labelItem : labelCell
      /* 🔴 THE ID GOES ON THE **SPAN**, NOT ON THE CELL, and that is a measurement decision. The probe's
       * `labelLines` counts the rects of `selectNodeContents`, and the cell now contains a span PLUS
       * (on one row) the Hide/Show button — so selecting the CELL's contents returns two rects for a
       * label that is on one line, and "does the longest label wrap?" would answer yes at every
       * width. The text node is what the question is about. */
      /* 🔴 TWO IDS, AND THEY MEASURE TWO DIFFERENT THINGS. `firstLabel` stays on the CELL, because the
       * label-column WIDTH is a property of the cell (212px). `firstLabelText` / `lastLabel` go on the
       * SPAN, because the FONT SIZE and the WRAP are properties of the text — and in the component the
       * size class (`text-sm`) is on the span, with nothing on the div. Measuring the div's font would
       * read `<body>`'s 16px and report a mismatch that is not on screen. */
      const spanId = r.k === 'service' && r.row === LABELS[LABELS.length - 1] ? ' id="lastLabel"'
        : r.k === 'service' && r.row === LABELS[0] ? ' id="firstLabelText"' : ''
      /* ⛔ NO `truncate`, AND REGULAR WEIGHT. Labels WRAP now — no ellipsis anywhere — and bold
       * belongs only to section bands and column titles. `leading-tight` is what lets two lines fit a
       * row that grew to hold them. A fixture that kept `truncate` would report "nothing is clipped"
       * because nothing CAN be clipped when it is ellipsised, which is the opposite of the question. */
      const inner = r.k === 'price-item'
        ? `<span${spanId} class="min-w-0 flex-1 leading-tight text-[13.5px] text-slate-700">${r.label}</span>`
        : r.indent
          ? `<span${spanId} class="min-w-0 flex-1 leading-tight text-sm text-slate-600">${r.label}</span>`
          : `<span${spanId} class="min-w-0 flex-1 leading-tight text-sm text-slate-800">${r.label}</span>`
      /* ⛔ NO BUTTON IN THE LABEL CELL ANY MORE — it is a pill in the band (above). */
      const id = r.k === 'service' && r.row === LABELS[0] ? ' id="firstLabel"' : ''
      out.push(`<div${kindAttr} class="${cls}"${id} ${st(`grid-column:1;grid-row:${gr}`)}>${inner}</div>`)
    }

    // ── the Standard side ──
    if (r.k === 'section' || r.k === 'category') {
      /* 🔴 ONE EMPTY, DIVIDED CELL PER COLUMN — which is what makes the vertical rules continuous.
       * A `col-span-full` heading is what used to break them. */
      /* ⛔ A CATEGORY ROW TAKES NO `border-t`, EITHER SIDE. See the label cell's note. */
      const rule = r.k === 'category' ? '' : ' border-t border-slate-100'
      out.push(...stdNames.map((n, vi) =>
        `<div class="${divider}${rule}"${r.k === 'category' && vi === 0 ? ' id="catValueCell"' : ''} ${st(`grid-column:${2 + vi};grid-row:${gr}`)}></div>`))
    } else if (r.k === 'price-switch') {
      out.push(`<div id="pricesStdCell" class="${divider} px-2.5 flex items-center justify-center text-center border-t border-slate-100"`
        + ` style="grid-column:2 / span ${stdNames.length};grid-row:${gr} / span ${1 + ruleRowCount};background:${WHITE_BG}">`
        + `<span class="text-[13px] text-slate-600">${PRICE_LABELS.stdCell}</span></div>`)
    } else if (r.k === 'price-rule') {
      /* no Standard cell — the span above covers these rows */
    } else if (r.k === 'items-band') {
      /* 🔴 THE HINT LIVES IN THE BAND, spanning the van columns — and it still draws the divider, so
       * the column lines stay continuous through the band like every other row. */
      out.push(`<div id="itemsHint" class="${divider} px-2.5 flex items-center border-t border-slate-100"`
        + ` style="grid-column:2 / span ${stdNames.length};grid-row:${gr};min-height:${h}px;background:${bg}">`
        + `<span class="text-[10px] font-semibold text-slate-500 normal-case tracking-normal truncate">${PRICE_TYPE_HINT}</span></div>`)
    } else if (r.k === 'price-item') {
      out.push(`<div class="${divider} px-2.5 flex items-center justify-center border-t border-slate-100"`
        + ` style="grid-column:2 / span ${stdNames.length};grid-row:${gr};min-height:${h}px;background:${bg}">`
        + `<span class="text-[13.5px] text-slate-700 tabular-nums">${r.price}</span></div>`)
    } else if (r.k === 'private-link') {
      /* 🔴 STANDARD SAYS WHAT IS TRUE — a STATEMENT across the van columns, not a switch that could
       * only ever be off. Measured as text, and measured as spanning. */
      out.push(`<div id="privateLinkStd" class="${divider} px-2.5 flex items-center border-t border-slate-100"`
        + ` style="grid-column:2 / span ${stdNames.length};grid-row:${gr};min-height:${h}px;background:${bg}">`
        + `<span class="text-[11px] font-semibold text-slate-500 truncate">${PRIVATE_LINK_STD}</span></div>`)
    } else if (r.k === 'same-settings') {
      out.push(`<div id="sameSettingsCell" class="${divider} ${cell}"`
        + ` style="grid-column:2 / span ${stdNames.length};grid-row:${gr};min-height:${h}px;background:${bg}">`
        + `${toggle(SAME_SETTINGS_LABEL, sameSettings, false, 'sameSettingsSwitch')}</div>`)
    } else if (r.k === 'used-by') {
      out.push(`<div class="${divider} px-2.5 flex items-center justify-center border-t border-slate-100"`
        + ` style="grid-column:2 / span ${stdNames.length};grid-row:${gr};min-height:${h}px;background:${bg}">`
        + `<span class="text-sm text-slate-600">Everything else</span></div>`)
    } else if (r.k === 'offline-mode') {
      out.push(...stdNames.map((n, vi) =>
        `<div class="${divider} ${cell}" ${st(`grid-column:${2 + vi};grid-row:${gr}`)}>`
        + `${sel(`${WHEN_OFFLINE} for ${n}`, OFFLINE_LABELS, false, vi === 0 ? 'whenOfflineSel' : undefined)}</div>`))
    } else {
      /* A SERVICE row: ONE CELL PER VAN COLUMN, every row — no truck-level exception any more. */
      out.push(...stdNames.map((n, vi) => {
        const v = vans === 'differ' ? vi : 0
        const id = r.row === LABELS[0] && vi === 0 ? ' id="firstStd"'
          : r.row === LABELS[0] && vi === 1 ? ' id="secondStd"' : ''
        /* `data-svc` marks EVERY service row's Standard cell, so the probe can ask "does any of them
         * span?" on the rendered boxes rather than on class names. */
        return `<div data-svc class="${divider} ${cell}"${id} ${st(`grid-column:${2 + vi};grid-row:${gr}`)}>`
          + `${controlFor(r.row, `${r.row.label} for ${n}`, v, false)}</div>`
      }))
    }

    // ── the type columns ──
    out.push(...typeNames.map((n, ti) => {
      const col = 2 + stdNames.length + ti
      const base = `grid-column:${col};grid-row:${gr}`
      if (r.k === 'section' || r.k === 'items-band' || r.k === 'category') {
        return `<div class="${divider}${r.k === 'category' ? '' : ' border-t border-slate-100'}" ${st(base)}></div>`
      }
      if (r.k === 'private-link') {
        /* 🔴 THE SWITCH IS IN THE **PRIVATE** COLUMN AND NOWHERE ELSE. Blank in every custom type's
         * column: a Festival is not private and has no link to switch. */
        return `<div class="${divider} ${cell}"${isPrivateCol(ti) ? ' id="privateLinkCell"' : ''} ${st(base)}>`
          + `${isPrivateCol(ti) ? toggle(PRIVATE_LINK_ROW, true, false, 'privateLinkSwitch') : ''}</div>`
      }
      if (r.k === 'same-settings') {
        /* ⚠️ BLANK IN A TYPE COLUMN — a type has no vans. */
        return `<div class="${divider} ${cell}" ${st(base)}></div>`
      }
      if (r.k === 'price-switch') {
        return `<div class="${divider} ${cell}" ${st(base)}>${toggle(`${PRICE_LABELS.on} for ${n}`, pricesOn && ti === 0, false, ti === 0 ? 'priceSwitch' : undefined)}</div>`
      }
      if (r.k === 'price-rule') {
        /* 🔴 CONTROLS ONLY WHERE THE SWITCH IS ON; BLANK CELLS ELSEWHERE. */
        const on = pricesOn && ti === 0
        const inner = !on ? ''
          : r.which === 'mode' ? sel(`${PRICE_LABELS.mode} for ${n}`, PRICE_MODE_LABELS, false, 'priceModeSel')
          : r.which === 'amount' ? priceInput(`${PRICE_LABELS.amount} for ${n}`, 'priceAmount')
          : sel(`${PRICE_LABELS.rounding} for ${n}`, ROUNDING_LABELS, true, 'priceRounding')
        return `<div class="${divider} ${cell}" ${st(base)}>${inner}</div>`
      }
      /* ⚠️ EMPTY, like PRICES and SERVICE. The old ROW carried a per-type "N typed" count; a BAND
       * does not, and that loss is recorded in §70.11 of the manual rather than hidden here. */
      if (r.k === 'items-band') {
        return `<div class="${divider} border-t border-slate-100" ${st(base)}></div>`
      }
      if (r.k === 'price-item') {
        const on = pricesOn && ti === 0
        const inner = on
          ? `<span${ti === 0 ? ' id="priceCell"' : ''} class="inline-flex items-center rounded-lg border border-blue-300 bg-blue-50 px-2 text-sm text-blue-800 tabular-nums" style="height:${TYPED_H}px">£11.00</span>`
          : `<span class="text-sm text-slate-400 tabular-nums">${r.price}</span>`
        return `<div class="${divider} ${cell}" ${st(base)}>${inner}</div>`
      }
      if (r.k === 'used-by') {
        return `<div class="${divider} ${cell}" ${st(base)}><span class="text-sm text-slate-700">2 events</span></div>`
      }
      if (r.k === 'offline-mode') {
        return `<div class="${divider} ${cell}" ${st(base)}>${sel(`${WHEN_OFFLINE} for ${n}`, OFFLINE_LABELS, false)}</div>`
      }
      const id = r.row === LABELS[0] && ti === 0 ? ' id="firstControl"' : ''
      return `<div class="${divider} ${cell}"${id} ${st(base)}>`
        + `${controlFor(r.row, `${r.row.label} for ${n}`, 0, false, r.row === LABELS[0] && ti === 0 ? 'firstTypeCtl' : undefined)}</div>`
    }))
    return out.join('')
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
${inline ? '<div style="padding:16px">' : '<div class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4" style="position:fixed;inset:0">'}
  <div id="modal" data-event-types-modal class="${inline ? shellInline : shell}" style="width:${dialogW}px;max-width:min(1000px, 100%)">
    <div id="header" class="${header}">
      <div class="min-w-0 flex-1">
        <h2 class="font-bold text-slate-900 text-lg">Event types</h2>
        <p class="text-xs sm:text-[13px] text-slate-500">${subtitle}</p>
      </div>
      <button id="newtype" class="hover:bg-slate-100 text-slate-600 border border-slate-200 text-sm px-4 py-2 font-bold rounded-xl">+ New event type</button>
      ${inline ? '' : '<button id="close" aria-label="Close" class="shrink-0 w-10 h-10 rounded-full bg-slate-100 text-slate-600 text-lg font-bold">✕</button>'}
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
          ${/* ══ 🔴 HEADER ROW 1-2 — THE SHARED "STANDARD" HEADING, THEN THE VAN NAMES ═══════════════
             * One heading spanning the van columns, van names centred below it with NO dot, and each
             * type header spanning BOTH rows with its ⋯ taken out of the flex flow so the name is
             * centred on the whole column. Every cell is placed explicitly. */''}
          <div id="corner" class="px-3 flex items-end" style="grid-column:1;grid-row:1 / span 2;background:${WHITE_BG}"></div>
          <div id="stdHeading" class="${divider} px-2.5 flex items-center justify-center ${heading}"
            style="grid-column:2 / span ${stdNames.length};grid-row:1;height:${ROW_H.category}px;background:${WHITE_BG}">STANDARD</div>
          ${typeNames.map((n, k) => {
            /* 🔴 THE BUILT-IN READS AS BUILT-IN: a LOCK instead of a colour dot, purple text. The
             * dots exist so two CUSTOM columns can be told apart; Private is the same on every
             * truck, so a dot would be claiming it is one of theirs. */
            const priv = isPrivateCol(k)
            const mark = priv
              ? `<span class="text-[11px] leading-none text-purple-500">🔒</span>`
              : `<span class="inline-block w-2.5 h-2.5 rounded-full shrink-0" style="background:#E8550F"></span>`
            return `<div class="${divider} relative px-7 flex items-center justify-center gap-1.5 min-w-0"${priv ? ' id="privateTypeHdr" data-private-column' : (k === 0 ? ' id="firstTypeHdr"' : '')} style="grid-column:${2 + stdNames.length + k};grid-row:1 / span 2;background:${WHITE_BG}">${mark}<span class="text-[13px] font-bold truncate ${priv ? 'text-purple-700' : 'text-slate-800'}">${n}</span><button${k === 0 ? ' id="firstDots"' : ''} aria-label="More for ${n}" class="absolute right-1 top-1/2 -translate-y-1/2 w-[26px] h-[26px] rounded-lg border border-slate-200 text-slate-500 font-bold leading-none">⋯</button></div>`
          }).join('')}
          ${stdNames.map((n, k) => `<div class="${divider} px-2.5 flex items-center justify-center min-w-0"${k === 0 ? ' id="firstStdHdr"' : ''} style="grid-column:${2 + k};grid-row:2;height:${ROW_H.control}px;background:${WHITE_BG}"><span class="text-[13px] font-bold text-slate-800 truncate" title="${n}">${n}</span></div>`).join('')}
          ${plan.map((r, idx) => rowHtml(r, idx)).join('')}
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
/** Screenshots that could not be taken. Reported in the summary, never thrown. */
const SHOT_FAILURES = []
/**
 * ── 🔴 ONE DEAD SHOT ENGINE COSTS **ONE** TIMEOUT, NOT ONE PER SHOT ──────────────────────────────
 * On this machine's Chromium (`chromium_headless_shell` 153) `el.screenshot()` HANGS rather than
 * throwing, so each attempt costs the full `protocolTimeout` before the guard below catches it. With
 * a dozen shot fixtures that is minutes of dead time *after* every measurement has already been
 * taken — which is precisely how a run that had passed 228 assertions never reached its summary.
 *
 * So the FIRST failure on an engine disables that engine's remaining shots. The measurements are
 * unaffected (they do not use `shot`), and the summary still reports every skip by name, so
 * "the pictures are missing" stays visible rather than becoming silently true.
 * ⚠️ PER ENGINE, NOT GLOBAL: WebKit's shots work here and must not be disabled by Chromium's.
 */
const SHOTS_DEAD = new Set()

async function engines() {
  const out = []
  try {
    const puppeteer = require('puppeteer')
    /* ⚠️ `protocolTimeout` IS SET DELIBERATELY. Puppeteer's default is 180 SECONDS, so one hung
     * `page.evaluate` costs three minutes and then throws `Runtime.callFunctionOn timed out` with no
     * indication of which fixture was being measured. 30s is far more than any probe here needs
     * (they take milliseconds) and turns a hang into a prompt, locatable failure. */
    const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'], protocolTimeout: 30000 })
    const page = await b.newPage()
    out.push({ name: 'Chromium', close: () => b.close(), page,
      setViewport: (w, h) => page.setViewport({ width: w, height: h }),
      /* ⚠️ THE ELEMENT, NOT THE PAGE. A full-page shot of a fixture is mostly backdrop. */
      /* ══ 🔴 A SCREENSHOT FAILURE MUST NOT ABORT THE MEASUREMENTS ══════════════════════════════
       * A shot is an ARTEFACT; the assertions are the measurement. This was unguarded, and on
       * Chromium's new `headless_shell` the element screenshot hangs until the protocol timeout —
       * so one unviewable PNG threw away every measurement after it, and the only output was a
       * `Runtime.callFunctionOn timed out` stack naming no fixture. Measured: five checks ran, the
       * shot hung, and forty-odd never ran at all.
       * ⚠️ IT IS REPORTED, NOT SWALLOWED. `shotFailures` is printed in the summary, so "the pictures
       * are missing" is visible rather than silently true. */
      shot: async (file, id) => {
        if (SHOTS_DEAD.has('Chromium')) { SHOT_FAILURES.push(`Chromium ${path.basename(file)}: skipped (shots disabled after the first failure)`); return }
        try { const el = await page.$('#' + id); if (el) await el.screenshot({ path: file }) }
        catch (e) {
          SHOT_FAILURES.push(`Chromium ${path.basename(file)}: ${String(e.message).split('\n')[0].slice(0, 70)}`)
          SHOTS_DEAD.add('Chromium')
        }
      } })
  } catch (e) { out.push({ name: 'Chromium', skip: String(e.message).split('\n')[0].slice(0, 110) }) }
  try {
    const { webkit } = require('playwright')
    const b = await webkit.launch()
    const page = await b.newPage()
    out.push({ name: 'WebKit', close: () => b.close(), page,
      setViewport: (w, h) => page.setViewportSize({ width: w, height: h }),
      /* Guarded for the reason above — one unviewable PNG must not cost the whole engine's run. */
      shot: async (file, id) => {
        if (SHOTS_DEAD.has('WebKit')) { SHOT_FAILURES.push(`WebKit ${path.basename(file)}: skipped (shots disabled after the first failure)`); return }
        try { const el = await page.locator('#' + id).first(); await el.screenshot({ path: file, timeout: 15000 }) }
        catch (e) {
          SHOT_FAILURES.push(`WebKit ${path.basename(file)}: ${String(e.message).split('\n')[0].slice(0, 70)}`)
          SHOTS_DEAD.add('WebKit')
        }
      } })
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
    /* ── 🔴 "DOES ANY SERVICE CELL SPAN MORE THAN ONE COLUMN?" ───────────────────────────────────
     * Measured on the rendered boxes, not on class names: a `grid-column: 2 / span 2` and a plain
     * one-column cell have the same classes and different widths, which is the whole point. Every
     * service row's Standard cells carry `data-svc`; the widest must be one column wide.
     * ⚠️ `firstStd` IS THE REFERENCE because it IS a one-column cell by construction. */
    /* ── 🔴 THE DENSER GRID'S GEOMETRY, MEASURED (5 October 2026) ────────────────────────────────
     * Every row carries `data-rowkind`, so "item rows are 28px" is a measurement of the rendered box
     * rather than a class census. ⚠️ ROUNDED: a fractional height from a border is not a design fault.
     */
    rowHeights: (() => {
      const out = {}
      for (const e of document.querySelectorAll('[data-rowkind]')) {
        const k = e.getAttribute('data-rowkind')
        const h = Math.round(e.getBoundingClientRect().height)
        if (!out[k]) out[k] = []
        if (!out[k].includes(h)) out[k].push(h)
      }
      return out
    })(),
    /* ── 🔴 THE COMPACT SWITCH'S TRACK, MEASURED **INSIDE THE GRID** ─────────────────────────────
     * The grid's switch is the compact one; the phone column's is the full 44×24. Both are in the
     * document at every width — one of the two is always `display: none`, because the screen swaps
     * them at the `md` breakpoint rather than rendering one.
     * 🔴 SCOPED TO `#grid`, AND THAT IS NOT TIDINESS. An unscoped `document.querySelector` took the
     * FIRST switch in document order, which at 1440 is the phone column's — inside a `md:hidden`
     * subtree. A hidden element's computed width still reports the specified `38px`, so the harness
     * said "the switch is 38×22 (0×0)" in all 36 van-state cases while the component was drawing it
     * correctly: `getBoundingClientRect()` is zero for anything under `display: none`, and the
     * COMPUTED style is not, so the two disagreed and only the rect was being asserted.
     * ⛔ AND A ZERO RECT IS REPORTED AS ZERO, NOT SKIPPED. If the grid's switch is ever genuinely
     * unrendered this must fail — so the query is narrowed to the right element rather than the
     * measurement being taught to ignore an awkward answer. */
    switchBox: (() => {
      const g = document.getElementById('grid')
      const b = g && g.querySelector('[role="switch"] > div')
      if (!b) return null
      const r = b.getBoundingClientRect()
      return { w: Math.round(r.width), h: Math.round(r.height) }
    })(),
    /** The ITEM PRICES band's pill, and whether it is left of the first value column. */
    itemsToggle: box('itemsToggle'),
    itemsHint: box('itemsHint'),
    priceCell: box('priceCell'),
    widestServiceCell: (() => {
      const els = [...document.querySelectorAll('[data-svc]')]
      if (!els.length) return null
      return Math.round(Math.max(...els.map(e => e.getBoundingClientRect().width)))
    })(),
    serviceCellSpans: (() => {
      const els = [...document.querySelectorAll('[data-svc]')]
      const ref = document.getElementById('firstStd')
      if (!els.length || !ref) return null
      const one = ref.getBoundingClientRect().width
      return els.some(e => e.getBoundingClientRect().width > one + 1)
    })(),
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
    /* ⚠️ THE TEXT NODE'S OWN ELEMENT, NOT THE CELL. The grid's label cell is a flex row whose SPAN
     * carries the size class; the cell itself carries none, so reading the cell measures <body>. */
    fontOfLabel: (() => { const e = document.getElementById('firstLabelText') || document.getElementById('firstLabel'); return e ? getComputedStyle(e).fontSize : null })(),
    lineHeightOfLabel: (() => { const e = document.getElementById('firstLabelText') || document.getElementById('firstLabel'); return e ? getComputedStyle(e).lineHeight : null })(),
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
    /** The first value column's header box, so the pill can be shown to sit LEFT of it. */
    firstStdHdr: box('firstStdHdr'),
    /* ── 🔴 PRIVATE EVENTS (20261014) ──────────────────────────────────────────────────────────── */
    privateLinkStd: box('privateLinkStd'),
    privateLinkCell: box('privateLinkCell'),
    privateTypeHdr: box('privateTypeHdr'),
    /** The FIRST type column's header, so "the built-in is last" is measured rather than assumed. */
    firstTypeHdr: box('firstTypeHdr'),
    /** Standard's cell on the link/QR row: its TEXT, and whether it holds a control. */
    privateLinkStdText: (() => {
      const e = document.getElementById('privateLinkStd')
      return e ? (e.textContent || '').trim() : null
    })(),
    privateLinkStdHasControl: (() => {
      const e = document.getElementById('privateLinkStd')
      return e ? !!e.querySelector('[role="switch"], select, input, button') : null
    })(),
    /** 🔴 The built-in's heading colour, computed — a purple CLASS that got purged would still pass a
     *  class census and fail the comparison this feeds. */
    privateHdrColour: (() => {
      const e = document.getElementById('privateTypeHdr')
      const span = e && e.querySelector('span.font-bold')
      return span ? getComputedStyle(span).color : null
    })(),
    /** A CUSTOM type's heading colour, for the comparison. */
    customHdrColour: (() => {
      const e = document.getElementById('firstTypeHdr')
      const span = e && e.querySelector('span.font-bold')
      return span ? getComputedStyle(span).color : null
    })(),
    /* ══ 🔴 THE THREE THINGS DOMINIC ASKED TO BE MEASURED (5 October 2026) ═══════════════════════ */
    /** Is ANY label clipped? ⛔ The honest test: the text's own scrollHeight against its clientHeight.
     *  An ellipsised label has neither, which is why `truncate` had to go from the fixture too. */
    clippedLabels: (() => {
      const out = []
      for (const e of document.querySelectorAll('[data-rowkind] span')) {
        const txt = (e.textContent || '').trim()
        if (!txt) continue
        if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) out.push(txt.slice(0, 44))
      }
      return out
    })(),
    /** ⛔ Does any label render an ellipsis? Measured as the COMPUTED text-overflow, not a class. */
    ellipsisLabels: (() => {
      const out = []
      for (const e of document.querySelectorAll('[data-rowkind], [data-rowkind] span')) {
        if (getComputedStyle(e).textOverflow === 'ellipsis') out.push((e.textContent || '').trim().slice(0, 44))
      }
      return out
    })(),
    /** The height of the row whose label is the longest — the one that must grow rather than clip. */
    privateLinkRowHeight: (() => {
      const e = document.querySelector('[data-rowkind="private-link"]')
      return e ? Math.round(e.getBoundingClientRect().height) : null
    })(),
    /** 🔴 The category heading's own look, computed: colour, weight, size — and its rule. */
    catLabel: (() => {
      const e = document.getElementById('catLabel')
      if (!e) return null
      const c = getComputedStyle(e)
      const span = e.querySelector('span')
      const sc = span ? getComputedStyle(span) : c
      return {
        colour: sc.color, weight: sc.fontWeight, size: sc.fontSize,
        ruleTop: c.borderTopWidth,
        left: Math.round(e.getBoundingClientRect().left),
      }
    })(),
    /** ⛔ The category row's VALUE cell rule — the half-line that looked broken. */
    catValueRuleTop: (() => {
      const e = document.getElementById('catValueCell')
      return e ? getComputedStyle(e).borderTopWidth : null
    })(),
    /** 🔴 …and that the VERTICAL divider still runs through it. */
    catValueDivided: (() => {
      const e = document.getElementById('catValueCell')
      return e ? parseFloat(getComputedStyle(e).borderLeftWidth) > 0 : null
    })(),
    /** An item label's left edge, for "indented under its category". */
    itemLabelLeft: (() => {
      const e = document.querySelector('[data-rowkind="price-item"]')
      return e ? Math.round(e.getBoundingClientRect().left) : null
    })(),
    itemTextLeft: (() => {
      const e = document.querySelector('[data-rowkind="price-item"] span')
      return e ? Math.round(e.getBoundingClientRect().left) : null
    })(),
    catTextLeft: (() => {
      const e = document.querySelector('#catLabel span')
      return e ? Math.round(e.getBoundingClientRect().left) : null
    })(),
    /** Every row's height by kind, as a flat list, so the report can quote the real numbers. */
    heightsByKind: (() => {
      const out = {}
      for (const e of document.querySelectorAll('[data-rowkind]')) {
        const k = e.getAttribute('data-rowkind')
        const h = Math.round(e.getBoundingClientRect().height)
        if (!out[k]) out[k] = []
        if (!out[k].includes(h)) out[k].push(h)
      }
      return out
    })(),
    /** How many of the type columns hold a link/QR switch. Must be exactly ONE. */
    privateSwitchCount: (() => {
      const g = document.getElementById('grid')
      if (!g) return null
      let n = 0
      for (const el of g.querySelectorAll('[role="switch"]')) {
        if ((el.getAttribute('aria-label') || '').startsWith('Take orders by private link')) n++
      }
      return n
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
  global.PROGRESS = lines
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
  /* ══ 🔴 THE DENSER GRID'S NUMBERS, LIFTED FOR THE ASSERTIONS (5 October 2026) ═══════════════════
   * The fixture builder lifts these too, but it is a different scope, and a measurement that typed
   * its own copy of 36 or 22 would keep passing after the component changed. Both ends read the ONE
   * definition in `components/shared/PriceControls.tsx`.
   * ⚠️ `GRID_CONTROL_H`/`GRID_TYPED_H`, NOT `CONTROL_H`: 32 is the dashboard sheet's height and must
   * not move — it is touched during service — and this harness measures the grid. */
  const PC = read('components/shared/PriceControls.tsx')
  const ROW_H = (() => {
    const m = PC.match(/export const ROW_H = \{ control: (\d+), item: (\d+), category: (\d+), section: (\d+) \}/)
    if (!m) throw new Error('the measurements cannot be aimed: ROW_H not found in components/shared/PriceControls.tsx')
    return { control: +m[1], item: +m[2], category: +m[3], section: +m[4] }
  })()
  const TYPED_H = Number(lift(PC, /export const GRID_TYPED_H = (\d+)/, 'the grid typed-price height'))
  /* The compact switch's track, read out of the shared Toggle's own class string. */
  const [SW_W, SW_H] = (() => {
    const m = PRIM.match(/\$\{compact \? 'w-\[(\d+)px\] h-\[(\d+)px\]' : 'w-11 h-6'\}/)
    if (!m) throw new Error('the measurements cannot be aimed: no compact toggle track found in components/manage/primitives.tsx')
    return [+m[1], +m[2]]
  })()
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

      /* ══ 🔴 0 · THE EVENT TYPES PILL — THE SAME GRID, INLINE ON THE PAGE ═══════════════════════════
       * Event types is the third Schedule pill now, so the grid is measured where it is actually
       * rendered. The claims are the brief's: the SAME fixed column widths, a card capped at 1000px,
       * LEFT-ALIGNED with the rest of the page, with "+ New event type" in the header and the footer
       * text kept. Six types, because that is the case where a cap has anything to do.
       * ⚠️ AND NO ✕ AND NO SECOND SCROLLER — the two things that must NOT come along from the overlay. */
      {
        await eng.setViewport(w, h)
        await eng.page.goto(write(`pill-${w}-${eng.name}.html`, panelFixture(css, 6, false, 'one', true)))
        const q = await eng.page.evaluate(probe)
        lines.push(`  pill ${w}×${h}  card ${q.modal.width}×${q.modal.height} · grid ${q.grid.width}px in ${q.scroller ? q.scroller.width : 0}px · doc ${q.docScrollW} vs ${q.innerW}`)
        t(!q.pageScrollsSideways, `🔴 pill ${w}: NO HORIZONTAL PAGE SCROLL with six types`)
        t(q.modal.width <= Math.min(1000, w) + 1,
          `🔴 pill ${w}: the card is capped at 1000px and does not grow with the types (${q.modal.width}px)`)
        /* 🔴 LEFT-ALIGNED: the card starts at the content's left edge, not centred in the viewport.
         * 16px is the fixture's own page padding, standing in for the manage scroller's `px-4`. */
        t(q.modal.left <= 17, `🔴 pill ${w}: the card is LEFT-aligned with the page (${q.modal.left}px)`)
        t(!q.close, `⚠️ pill ${w}: no ✕ — the pill above is how you leave`)
        /* 🔴 THE COLUMNS STILL SCROLL SIDEWAYS INSIDE THE CARD — that is what the cap is for, and it is
         * the one scroller the inline shell keeps. */
        if (q.scroller && q.grid.width > q.scroller.width) {
          t(q.gridScrolls === true, `🔴 pill ${w}: the COLUMNS scroll sideways inside the card, not the page`)
        }
        if (w === 1440 || w === 390) {
          /* ⚠️ `shot` TAKES AN ELEMENT ID HERE, unlike the other render harness — it screenshots that
           * element, not the viewport. Omitting it asked for `#undefined` and hung for 30s. */
          await eng.shot(path.join(shotDir, `event-types-pill-${w}-${eng.name.toLowerCase()}.png`), 'modal')
        }
      }

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
      /* ══ 🔴 THE ITEMS-OPEN PASS — THE ONE THAT RENDERS CATEGORIES AND ITEM ROWS ═══════════════
       * ⛔ NOTHING IN THIS HARNESS HAD EVER PASSED `showItems: true`, so no category row and no item
       * row had ever been drawn. The consequence was worse than a gap: the pre-existing height
       * assertions for `price-item` and `category` are written as
       * `!(m.rowHeights||{})['price-item'] || only(...)` — guarded so a fixture without those rows
       * does not fail — so they had been passing VACUOUSLY since they were written, and the four
       * assertions added on 5 October for the category heading and the item indent would have done
       * the same. A check that cannot fail is not checking.
       * 🔴 SO THIS PASS EXISTS TO MAKE THEM BITE, and it asserts the rows are PRESENT before
       * measuring them, which is the part that stops it going quiet again. */
      /* ⚠️ ONLY WHERE THE GRID IS ON SCREEN. Below `md` the columns scroller is `hidden` and the phone
       * picker is shown instead, so every row measures 0 — the first run of this pass failed 13 times
       * at 390 for exactly that reason, against a screen that was correct. The same `w >= 768` gate the
       * matrix's grid assertions use, and for the same reason. */
      for (const nTypes of (w >= 768 ? [1, 3] : [])) {
        await eng.page.goto(write(`items-${w}-${nTypes}-${eng.name}.html`,
          panelFixture(css, nTypes, false, 'match', false, { showItems: true })))
        const m = await eng.page.evaluate(probe)
        const hs = m.rowHeights || {}
        t(Array.isArray(hs.category) && hs.category.length > 0,
          `🔴 items ${w}/${nTypes}: the fixture ACTUALLY RENDERS category rows (so the checks below can fail)`)
        t(Array.isArray(hs['price-item']) && hs['price-item'].length > 0,
          `🔴 items ${w}/${nTypes}: …and item rows`)
        t(Array.isArray(hs.category) && hs.category.every(h => Math.abs(h - ROW_H.category) <= 2),
          `🔴 items ${w}/${nTypes}: category rows are ${ROW_H.category}px (${JSON.stringify(hs.category)})`)
        t(Array.isArray(hs['price-item']) && hs['price-item'].every(h => Math.abs(h - ROW_H.item) <= 2),
          `🔴 items ${w}/${nTypes}: item rows are ${ROW_H.item}px (${JSON.stringify(hs['price-item'])})`)
        /* (3) THE CATEGORY HEADING: dominant, and with NO horizontal rule on either side. */
        t(!!m.catLabel, `🔴 items ${w}/${nTypes}: the category heading is measurable`)
        if (m.catLabel) {
          t(Number(m.catLabel.weight) >= 700,
            `🔴 items ${w}/${nTypes}: a category heading is heavier than a row label (weight ${m.catLabel.weight})`)
          t(parseFloat(m.catLabel.size) > 11,
            `🔴 items ${w}/${nTypes}: …and larger than 11px (${m.catLabel.size})`)
          t(parseFloat(m.catLabel.ruleTop) === 0,
            `⛔ items ${w}/${nTypes}: …and has NO rule above it (${m.catLabel.ruleTop})`)
          t(parseFloat(m.catValueRuleTop || '0') === 0,
            `⛔ items ${w}/${nTypes}: …nor on its value cells — no half-line (${m.catValueRuleTop})`)
          t(m.catValueDivided === true,
            `🔴 items ${w}/${nTypes}: …while the VERTICAL column divider still runs through it`)
        }
        /* (4) ITEM NAMES INDENT UNDER THEIR CATEGORY, measured as a left-edge difference. */
        t(m.itemTextLeft !== null && m.catTextLeft !== null
          && m.itemTextLeft - m.catTextLeft >= 10 && m.itemTextLeft - m.catTextLeft <= 16,
          `🔴 items ${w}/${nTypes}: item names sit ~12px in from their category heading (${
            m.itemTextLeft !== null && m.catTextLeft !== null ? m.itemTextLeft - m.catTextLeft : '?'}px)`)
        /* ⛔ AND STILL NOTHING CLIPPED OR ELLIPSISED, with the item rows open. */
        t(Array.isArray(m.clippedLabels) && m.clippedLabels.length === 0,
          `⛔ items ${w}/${nTypes}: NO label is clipped with prices shown (${(m.clippedLabels || []).join(' | ') || 'none'})`)
        t(Array.isArray(m.ellipsisLabels) && m.ellipsisLabels.length === 0,
          `⛔ items ${w}/${nTypes}: NO ellipsis anywhere (${(m.ellipsisLabels || []).join(' | ') || 'none'})`)
        lines.push(`  items  ${w} · ${nTypes} type${nTypes === 1 ? '' : 's'}  heights ${JSON.stringify(m.heightsByKind)}`)
      }

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
              /* ══ ⛔ RE-AIMED: THERE IS NO TRUCK-LEVEL ROW TO MEASURE (5 October 2026) ═══════════
               * This measured that "Do you take cash?" — the one truck-level row — drew a switch one
               * column wide in EVERY van column, with "Applies to all your vans" on hover. Both were
               * right at the time and both are gone: `truck_vans.takes_cash` (20261012) makes cash a
               * van setting like the other four, so every service row is per van and the title has
               * nothing left to explain.
               * 🔴 WHAT IS MEASURED INSTEAD IS THE PROPERTY THAT NOW MATTERS: **no service cell spans
               * more than one column.** Every service row's cells are exactly one column wide, which
               * is what "every column independent" looks like on screen — and it is a stronger claim
               * than the old one, because it covers all five rows rather than the one exception. */
              t(m.serviceCellSpans === false,
                `⛔ ${w}/${nTypes}/${vanState}: NO service cell spans more than one column (widest ${m.widestServiceCell ?? '?'}px vs ${EXPECTED_COL_W}px)`)

              t(m.truckCellTitle === null,
                `⛔ ${w}/${nTypes}/${vanState}: …and no "Applies to all your vans" title survives ("${m.truckCellTitle ?? 'none'}")`)
            } else {
              t(!m.secondStd, `⚠️ ${w}/${nTypes}/one: a single van gets ONE Standard column`)
            }
            /* ══ 🔴 THE DENSER GRID, MEASURED AGAINST THE COMPONENT'S OWN NUMBERS (5 October 2026) ══
             * `ROW_H` / `GRID_CONTROL_H` / `GRID_TYPED_H` are lifted at the top of this file, so these
             * assertions cannot drift from the component — and they are the SHEET-independent set: the
             * dashboard sheet keeps `CONTROL_H` and is not measured here.
             * ⚠️ ±2px, as instructed: a sub-pixel border is not a design fault. */
            {
              const near = (got, want) => got != null && Math.abs(got - want) <= 2
              const only = (kind, want) => {
                const hs = m.rowHeights && m.rowHeights[kind]
                return Array.isArray(hs) && hs.length > 0 && hs.every(h => near(h, want))
              }
              t(only('service', ROW_H.control),
                `🔴 ${w}/${nTypes}/${vanState}: setting rows are ${ROW_H.control}px (${JSON.stringify((m.rowHeights || {}).service)})`)
              t(only('section', ROW_H.section),
                `🔴 ${w}/${nTypes}/${vanState}: section bands are ${ROW_H.section}px (${JSON.stringify((m.rowHeights || {}).section)})`)
              t(!(m.rowHeights || {})['items-band'] || only('items-band', ROW_H.section),
                `🔴 ${w}/${nTypes}/${vanState}: the ITEM PRICES band is a section band, ${ROW_H.section}px`)
              t(!(m.rowHeights || {})['price-item'] || only('price-item', ROW_H.item),
                `🔴 ${w}/${nTypes}/${vanState}: item rows are ${ROW_H.item}px (${JSON.stringify((m.rowHeights || {})['price-item'])})`)
              t(!(m.rowHeights || {}).category || only('category', ROW_H.category),
                `🔴 ${w}/${nTypes}/${vanState}: category rows are ${ROW_H.category}px (${JSON.stringify((m.rowHeights || {}).category)})`)
              /* 🔴 THE COMPACT SWITCH — the grid's track, not the 44×24 of a Settings row. The two
               * numbers are READ OUT OF the lifted class string, so a change to the shared Toggle's
               * `compact` arm moves this assertion with it instead of leaving it measuring 38×22
               * after the component stopped drawing 38×22. */
              t(m.switchBox && near(m.switchBox.w, SW_W) && near(m.switchBox.h, SW_H),
                `🔴 ${w}/${nTypes}/${vanState}: the switch is ${SW_W}×${SW_H} (${m.switchBox ? `${m.switchBox.w}×${m.switchBox.h}` : '?'})`)
              /* 🔴 THE PILL IS LEFT OF THE FIRST VALUE COLUMN, so no sideways scroll can hide it. */
              if (m.itemsToggle && m.firstStdHdr) {
                t(m.itemsToggle.right <= m.firstStdHdr.left + 1,
                  `🔴 ${w}/${nTypes}/${vanState}: the Hide/Show pill is inside the LABEL column — sideways scroll cannot hide it`)
              }
              t(!!m.itemsHint, `⚠️ ${w}/${nTypes}/${vanState}: the "press a price" hint is in the ITEM PRICES band`)
              /* ══ 🔴 PRIVATE EVENTS: THE ORDERING ROW, MEASURED (20261014) ══════════════════════
               * Four claims, and each is about the RENDERED screen rather than about a class name:
               *   • Standard's cell SPANS the van columns and holds TEXT, not a control;
               *   • exactly ONE type column holds the link/QR switch — the built-in's;
               *   • the built-in's heading is PURPLE, by computed colour (a purged class would still
               *     satisfy a class census and fail this);
               *   • its column is the LAST one, measured by left edge.
               * ⛔ "EXACTLY ONE SWITCH" IS THE ONE THAT MATTERS. A Festival with a link/QR switch is
               * a control that writes nothing, and a Private column WITHOUT one is a feature an
               * operator cannot reach. Counting is the only way to catch both at once. */
              t(m.privateLinkStdHasControl === false,
                `⛔ ${w}/${nTypes}/${vanState}: Standard's link/QR cell is a STATEMENT, with no control in it`)
              t((m.privateLinkStdText || '').length > 0,
                `🔴 ${w}/${nTypes}/${vanState}: …and it says something ("${m.privateLinkStdText ?? 'nothing'}")`)
              if (nVanCols === 2 && m.privateLinkStd) {
                t(m.privateLinkStd.width >= EXPECTED_COL_W * 2 - 2,
                  `🔴 ${w}/${nTypes}/${vanState}: …and SPANS both van columns (${m.privateLinkStd.width}px)`)
              }
              /* ══ 🔴 THE THREE CHANGES OF 5 OCTOBER, MEASURED ════════════════════════════════════
               * (1) NOTHING IS CLIPPED AND NOTHING ELLIPSISES. Labels wrap now, so the question is
               * whether any text overflows its box — measured on the text's own scrollHeight, and on
               * the COMPUTED `text-overflow`, because a purged `truncate` class would still satisfy a
               * class census while the screen showed a cut-off label.
               * ⛔ THIS IS THE CHECK THAT WOULD HAVE CAUGHT THE OLD 212px COLUMN. */
              t(Array.isArray(m.clippedLabels) && m.clippedLabels.length === 0,
                `⛔ ${w}/${nTypes}/${vanState}: NO label is clipped (${(m.clippedLabels || []).join(' | ') || 'none'})`)
              t(Array.isArray(m.ellipsisLabels) && m.ellipsisLabels.length === 0,
                `⛔ ${w}/${nTypes}/${vanState}: NO ellipsis anywhere (${(m.ellipsisLabels || []).join(' | ') || 'none'})`)
              /* (2) THE ROW GREW RATHER THAN THE WHOLE GRID GETTING TALLER. The longest label's row
               * is at least the minimum, and the one-line rows are still exactly the minimum. */
              t(m.privateLinkRowHeight !== null && m.privateLinkRowHeight >= ROW_H.control,
                `🔴 ${w}/${nTypes}/${vanState}: the link/QR row grew to fit its label (${m.privateLinkRowHeight}px, min ${ROW_H.control})`)
              t(only('service', ROW_H.control),
                `⛔ ${w}/${nTypes}/${vanState}: …and the ONE-LINE setting rows are still exactly ${ROW_H.control}px (${JSON.stringify((m.rowHeights || {}).service)})`)
              /* ⚠️ THE CATEGORY AND ITEM ASSERTIONS ARE **NOT** HERE. These matrix fixtures render
               * with the item rows COLLAPSED, so there is no category row and no item row to measure
               * — the first version of them sat in this loop behind `if (m.catLabel)` and therefore
               * never ran at all. They are in their own items-open pass below. */
              t(m.privateSwitchCount === 1,
                `⛔ ${w}/${nTypes}/${vanState}: EXACTLY ONE type column holds the link/QR switch (${m.privateSwitchCount})`)
              /* ── 🔴 MEASURED AS A **DIFFERENCE**, NOT AS A LITERAL COLOUR ──────────────────────
               * The first version of this assertion matched `rgb(126, 34, 206)`. Both engines
               * serialise this colour as `lab(…)` — Tailwind v4 emits oklch and the computed value
               * comes back in that space — so it failed 37 times against a screen that was drawing
               * the purple correctly. Pinning a serialisation is pinning the browser's string
               * formatting, which is not a design fact.
               * ⛔ WHAT IS A DESIGN FACT: the built-in heading does not look like a custom one. A
               * purged or renamed purple class makes the two identical, which this catches — and it
               * catches it in whatever colour space the engine chooses to report. */
              if (nTypes > 1) {
                t(!!m.privateHdrColour && !!m.customHdrColour && m.privateHdrColour !== m.customHdrColour,
                  `🔴 ${w}/${nTypes}/${vanState}: the built-in's heading is a DIFFERENT colour from a custom type's (${m.privateHdrColour ?? '?'} vs ${m.customHdrColour ?? '?'})`)
              }
              if (m.privateTypeHdr && m.firstTypeHdr && nTypes > 1) {
                t(m.privateTypeHdr.left >= m.firstTypeHdr.left,
                  `🔴 ${w}/${nTypes}/${vanState}: …and the built-in is the LAST column, not the first`)
              }
              if (m.priceCell) {
                t(near(m.priceCell.height, TYPED_H),
                  `🔴 ${w}/${nTypes}/${vanState}: a typed-price box is ${TYPED_H}px (${m.priceCell.height}px)`)
              }
            }
            /* ⛔ NONE OF THE THREE PHRASES APPEARS, IN ANY VAN STATE. Measured on the RENDERED TEXT
             * rather than on the source, because that is the question: what does an operator read? */
            t(!m.forbiddenText,
              `⛔ ${w}/${nTypes}/${vanState}: no "Varies by van" / "Set per van" / "Same as Standard" on screen`)
            /* ══ ⛔ RE-AIMED: A TYPE'S CELL IS ITS OWN, AT FULL STRENGTH (5 October 2026) ══════════
             * This measured the FADE and the hover title — the "follows Standard" design. That design
             * is the second half of the localhost report: a NULL column drawn faded at the first van's
             * value, so changing Van 1 made every untouched type appear to change too.
             * 🔴 A type holds its own values now, so the cell holds a real control at FULL opacity and
             * claims nothing about whose value it is. Both halves are measured as absences, which is
             * the only way to measure a design that was removed. */
            if (nTypes > 0) {
              t(!!m.firstTypeCtl, `🔴 ${w}/${nTypes}/${vanState}: a type cell holds a real control`)
              t(m.firstTypeCtlTitle === null,
                `⛔ ${w}/${nTypes}/${vanState}: …and claims NOTHING about whose value it is ("${m.firstTypeCtlTitle ?? 'none'}")`)
              t(m.firstTypeCtlFaded === false,
                `⛔ ${w}/${nTypes}/${vanState}: …and is NOT faded — it is the type's own value`)
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
            /* ══ 🔴 RE-AIMED: THE SIZES MATCH, THE LINE HEIGHTS DELIBERATELY DO NOT (5 October 2026) ══
             * This asserted `lineHeightOfLabel === lineHeightOfSelect`, and it went red 37 times the
             * moment labels started wrapping — correctly, because the label's line height CHANGED on
             * purpose.
             *
             * 🔴 THE ORIGINAL DEFECT THIS CHECK WAS WRITTEN FOR WAS THE FONT **SIZE**: a native
             * `<select>` rendered its text larger than the row labels beside it, and that assertion
             * (the line above) still stands unweakened. The line HEIGHT was asserted alongside it as
             * part of "same size, weight and line height".
             *
             * ⛔ LABELS NOW WRAP AND NO ROW MAY BE CLIPPED, and those two requirements decide the line
             * height: 14px at the browser's default 20px gives 40px for two lines, which would push
             * every wrapped row past the 36px minimum and un-dense the grid. `leading-tight` gives
             * 17.5px, so two lines are 35px and fit 36 exactly. Measured: 20px on the dropdown,
             * 17.5px on the label.
             *
             * 🔴 SO THE CLAIM BECOMES THE ONE THAT IS ACTUALLY LOAD-BEARING: the label's line height
             * is TIGHTER than the dropdown's, and two of its lines fit inside the minimum row height.
             * That is stronger than equality, not weaker — equality would have forbidden the wrap. */
            t(parseFloat(m.lineHeightOfLabel) < parseFloat(m.lineHeightOfSelect),
              `🔴 ${w}/${nTypes}/${vanState}: a row label's line height is TIGHTER than a dropdown's, so two lines fit (${m.lineHeightOfLabel} vs ${m.lineHeightOfSelect})`)
            t(parseFloat(m.lineHeightOfLabel) * 2 <= ROW_H.control,
              `⛔ ${w}/${nTypes}/${vanState}: …and TWO lines fit the ${ROW_H.control}px minimum (${parseFloat(m.lineHeightOfLabel) * 2}px)`)
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
  /* 🔴 THE SHOTS THAT DID NOT HAPPEN, BY NAME. A screenshot is an artefact and must never fail a run
   * (see `SHOT_FAILURES`' note), but "the pictures are missing" must not become SILENTLY true either —
   * a reader comparing a stale PNG to the screen would be misled about which design they are looking
   * at, which is exactly what happened to this build's own Chromium shots. */
  if (SHOT_FAILURES.length) {
    console.log(`\n⚠️  ${SHOT_FAILURES.length} SCREENSHOT(S) NOT TAKEN — the measurements above are unaffected,`)
    console.log('   but any PNG these name is STALE and must not be read as this build\u2019s output:')
    for (const f of SHOT_FAILURES) console.log(`      • ${f}`)
  }
  if (list.every(e => e.skip)) { console.log('\n🔴 NO ENGINE AVAILABLE — nothing was measured'); process.exit(1) }
  console.log(fails ? `\n🔴 ${fails} MEASUREMENT(S) FAILED` : '\n✅ the modal, the new-type popup and the dashboard card measured in every available engine')
  process.exit(fails ? 1 : 0)
}

/* 🔴 A THROW PRINTS THE PROGRESS IT HAD MADE. Every measurement is collected into `lines` and
 * printed at the END, so a throw halfway through used to discard all of it and report only the stack —
 * which says nothing about WHICH fixture, width or engine was being measured. `PROGRESS` is the same
 * array; dumping it is the difference between "it hung" and "it hung on the pill at 820 in WebKit". */
main().catch(e => {
  if (Array.isArray(global.PROGRESS) && global.PROGRESS.length) {
    console.log('── progress before the throw ──')
    for (const l of global.PROGRESS) console.log(l)
  }
  console.log('🔴 the harness threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : e))
  process.exit(1)
})
