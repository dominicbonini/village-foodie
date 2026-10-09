#!/usr/bin/env node
// scripts/social-tab-render.cjs — Social media's three screens, MEASURED.
//   node scripts/social-tab-render.cjs       (needs `npx next build` first)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 WHY A MEASUREMENT AND NOT A CLASS CENSUS
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// The brief's layout requirement is "two halves side by side from 900px, stacked below" and "no
// horizontal scroll at 390". A class census cannot answer either: it can see `min-[900px]:grid-cols-2`
// in the source and still be wrong about what a layout engine does with it. This repository has
// shipped four layout bugs past exactly that kind of check — an inline `gridTemplateColumns` beating a
// responsive class, `width: max-content` raising an `fr` track's automatic minimum, a landscape design
// bursting out of a 200px column, and a breakpoint set at `lg` when the machine is 1100px wide.
//
// ⛔ **A BREAKPOINT WITH NO MEASUREMENT BETWEEN ITS TWO SIDES IS A BREAKPOINT NOBODY HAS CHECKED.**
// 1100 is a laptop window (above 900) and 390 is a phone (below it) — the brief's own two widths, and
// the two sides of the one rule these screens have.
//
// 🔴 WEBKIT, BECAUSE THE DEVICE IS A MAC AND THE BROWSER IS SAFARI. Chromium is measured too when it
// is available, because a Chromium-only bug would otherwise be invisible for ever — but either engine
// missing is SKIPPED AND SAID SO, never silently passed.
//
// ⚠️ IT IS NOT THE PAGE, AND SAYS SO. `/manage/[token]` needs a real operator session and a database,
// so what is rendered is the components' OWN class names — lifted out of the source by the regexes
// below, so the fixture cannot drift without this file THROWING — against THIS build's compiled
// stylesheet, with filler where the content goes.
// ⚠️ NO NETWORK: file:// pages, the app's own CSS, and local browser builds.
//
// ⛔ EVERY CLAIM HAS A CONTROL. A fixture that can only draw the expected shape proves nothing; this
// project has shipped a check that passed vacuously for a day. Each control removes the one rule the
// claim rests on and asserts the measurement notices.

const fs = require('fs')
const path = require('path')
const os = require('os')

const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const SOCIAL = read('components/manage/SocialPosts.tsx')

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
  /* 🔴 THE STALENESS CHECK, AND IT NAMES THE THING THE MEASUREMENT DEPENDS ON. Tailwind only emits
   * classes it finds in the source, so a build from before these screens existed has no `min-[900px]`
   * rule — and every fixture would lay out as ONE column at every width, reporting the phone case
   * passing for the wrong reason and the laptop case failing on correct source. */
  if (!/min-width:\s*900px/.test(css)) {
    throw new Error('the compiled CSS has no `min-[900px]` rule — the build predates this layout; run `npx next build`')
  }
  /* ══ 🔴 AND EVERY **ARBITRARY** CLASS A CLAIM BELOW RESTS ON — 10 OCTOBER 2026 ═══════════════════
   *
   * ⛔ **THIS WAS ADDED BECAUSE THE TRAP CAUGHT ME TWICE IN TWO DAYS.** Tailwind emits only the
   * utilities it finds in the source **at build time**, so a class written today is absent from
   * yesterday's build — and an absent class does not fail, it lays out *differently*. Yesterday that
   * was `origin-top-left` and the live poster scaled about its centre (docs/social-tab-7-report.md
   * §2b). Today it was `h-[72px]`, and §3's thumbnails measured **72×20 and 72×4** — a claim failing on
   * correct source, for forty minutes, because the build was older than the component.
   * 🔴 THE GENERAL CHECK IS NOT POSSIBLE AND THE SPECIFIC ONE IS. "Every class the fixture uses" would
   * mean parsing the lifted strings; what this list holds is the handful of ARBITRARY values whose
   * absence changes a measured number rather than a colour. ⚠️ ADD TO IT when a claim starts depending
   * on a new `[...]` class, and the next stale build says so in one line instead of in a wrong number. */
  /* ⚠️ A **LITERAL** MATCH, NOT A REGEX, AND THAT IS THE POINT OF THE SECOND ATTEMPT. The compiled CSS
   * escapes the brackets itself — the selector in the file is `.h-\[72px\]{…}` — so a regex has to
   * escape the backslash AND the bracket, which I got wrong twice and which reported every class
   * missing on a build that had them all. `includes` on the selector exactly as it appears in the file
   * cannot be got wrong. */
  const NEEDED = ['.h-\\[72px\\]', '.w-\\[72px\\]', '.h-\\[132px\\]', '.w-\\[20px\\]', '.max-h-\\[30rem\\]']
  const missing = NEEDED.filter(k => !css.includes(k))
  if (missing.length) {
    throw new Error('the compiled CSS is older than the components — no '
      + missing.join(', ') + '. Tailwind only emits classes it finds at build time; run `npx next build`')
  }
  return css
}

const HEAD = css => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>
<style>body{margin:0}</style></head><body>`

/* 🔴 THE ORANGE REFERENCE. Every fixture renders it, off screen, wearing the REAL `BTN_PRIMARY` class
 * lifted from the source — so "this button is orange" is a comparison with the product's own colour
 * rather than with a string written in this file. See the note in `rects`. */
const ORANGE_REF = (c) => `<span data-orange-ref class="${c.btnPrimary}"
  style="position:absolute;left:-9999px;top:0;width:1px;height:1px"></span>`

/* 🔴 A REAL SUFFOLK PUB NAME, 34 CHARACTERS. What crowds a half-width column is a venue name, not
 * lorem — and a name is the one thing on these screens that is allowed to truncate. */
const LONG_NAME = 'The Kings Arms at Great Finborough'
/* ⚠️ §1 · A **WIDE** PICTURE (1600 × 400), as a data URI so the fixture fetches nothing. ⛔ A square
 * one could not show the bug: the report is that the picture AND the file name overflow their box, and
 * only a picture wider than its box can test "contained". */
const WIDE_PIC = 'data:image/svg+xml;utf8,'
  + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="400"><rect width="1600" height="400" fill="#94a3b8"/></svg>')

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE CLASSES, LIFTED FROM THE REAL SOURCE
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ EVERY ONE OF THESE **THROWS** IF THE SOURCE CHANGES SHAPE. That is the point: a fixture that
// quietly fell back to a hard-coded class would go on measuring a screen the product no longer has,
// which is the failure mode `places-tab-render.cjs` died of.

const C = () => ({
  /* 🔴 **ONE** GRID FOR CREATE A POST AND DESIGNS SINCE 8 OCTOBER. Lifting it once is the point: if
   * the two screens ever stop sharing the constant, this fixture draws them both from whichever one
   * survives and the "same width" measurement below becomes a tautology. */
  twoHalves: lift(SOCIAL, /export const TWO_HALVES_GRID = '([^']+)'/, 'the shared two-halves grid'),
  locGrid: lift(SOCIAL, /<div className="(grid grid-cols-1 items-start gap-3 min-\[900px\]:grid-cols-\[minmax\(280px,1fr\)_minmax\(0,2\.6fr\)\])"/, 'the Location settings grid'),
  tabHeading: lift(SOCIAL, /<p className="(text-xl font-black text-slate-900)" data-tab-heading>/, 'the tab heading'),
  tabBlurb: lift(SOCIAL, /<p className="(mt-0\.5 max-w-\[46rem\] text-sm text-slate-500)" data-tab-blurb>/, 'the tab blurb'),
  boxCard: lift(SOCIAL, /<Card className=\{`(flex min-w-0 flex-col p-4) \$\{className\}`\}>/, 'a box'),
  boxBody: lift(SOCIAL, /<div className="(mt-3 flex min-h-0 min-w-0 flex-1 flex-col)">\{children\}<\/div>/, "a box's body"),
  boxHeading: lift(SOCIAL, /const BOX_HEADING = '([^']+)'/, 'the box heading'),
  boxBlurb: lift(SOCIAL, /const BOX_BLURB = '([^']+)'/, 'the box blurb'),
  btnPrimary: lift(SOCIAL, /const BTN_PRIMARY =\n\s*'([^']+)'/, 'the primary button'),
  btnOutline: lift(SOCIAL, /const BTN_OUTLINE =\n\s*'([^']+)'/, 'the outlined button'),
  designTile: lift(SOCIAL, /data-design-tile\n\s*style=\{\{ height, width, maxWidth: '100%' \}\}\n\s*className="([^"]+)"/, 'the design tile'),
  tileH: Number(lift(SOCIAL, /const H = (\d+)\n\s*const MAX_W/, 'the tile height')),
  tileMaxW: Number(lift(SOCIAL, /const MAX_W = (\d+)/, 'the tile max width')),
  /* ══ 🔴 THE EVENT PICKER REPLACED THE "more events" LIST — §5, 9 October 2026 ════════════════════
   * ⛔ IT WAS A COLLAPSED `<ul>` CAPPED AT `max-h-72` WITH A "Make post" BUTTON ON EVERY ROW. Three
   * things were wrong: the three soonest events — the thing the card is for — were behind a press; a
   * button per row was a second door to one modal that skipped the caption box entirely; and the list
   * scrolled inside itself, which is the wrong shape for five rows.
   * 🔴 THE FIRST THREE ARE ALWAYS VISIBLE NOW and the rest expand in place. ⚠️ NO `max-h`: the list is
   * three rows, or three plus however many an operator chose to expand. */
  pickList: lift(SOCIAL, /<ul className="(mt-0\.5 divide-y divide-slate-100)" data-pick-list>/, 'the event picker'),
  pickRow: lift(SOCIAL, /className=\{`(flex w-full items-baseline gap-2 py-1\.5 text-left) \$\{ev\.isPrivate/, 'a picker row'),
  /* 🔴 THE CAPTION BOX — A PLAIN `<textarea>`, NOT THE CHIP EDITOR. ⚠️ Measured because five rows of
   * text in a 380px half is the one control on this card that can push the button off the screen. */
  captionBox: lift(SOCIAL, /<textarea\n\s*data-caption-text\n\s*value=\{text\}\n\s*disabled=\{busy\}\n\s*onChange=\{e => setText\(e\.target\.value\)\}\n\s*rows=\{5\}\n\s*className="([^"]+)"/, 'the caption box'),
  /* 🔴 THE SCROLLER IS LIFTED, NOT TYPED. "The list scrolls inside its card" is the one claim on
   * Location settings that a wrong class silently breaks — the card grows instead, the page grows with
   * it, and the pane goes off the bottom of the screen. */
  locScroller: lift(SOCIAL, /<div className="(mt-2 max-h-\[30rem\] min-h-0 overflow-y-auto)" data-loc-table>/, 'the location table scroller'),
  locTable: lift(SOCIAL, /<table className="(w-full table-fixed border-collapse text-sm)">/, 'the location table'),
  locHeadRow: lift(SOCIAL, /<tr className="(text-\[10px\] font-bold uppercase tracking-wide text-slate-400)">/, 'the table head row'),
  /* ⚠️ `align-top` IS NEW AND IS REQUIRED: the name may be two lines now, and without it the ticks
   * would centre against a two-line cell and sit at different heights down the column. */
  locNameCell: lift(SOCIAL, /<td className="(min-w-0 py-1\.5 pr-2 align-top)">/, 'the name cell'),
  /* 🔴 THE NAME ITSELF — weight 500, wrapping to at most two lines. ⛔ IT WAS `truncate` AND BOLD, and
   * both were wrong: "The Kings Arms at Great Finborough" became "The Kings Arms at Great Fi…" in a
   * 200px column, so the one thing the row exists to identify was the thing it could not show. */
  /* ⛔ NO `block` IN THIS CLASS, AND THAT IS LOAD-BEARING. `line-clamp-2` sets
   * `display: -webkit-box` — that is how the clamp works — and `block` sets `display: block`. Two
   * classes, one property: whichever rule comes later in the compiled stylesheet wins, and `block` won.
   * The names wrapped to THREE lines and this harness is what said so. */
  locName: lift(SOCIAL, /<span className="(text-sm font-medium leading-snug text-slate-900 line-clamp-2)"\n\s*data-loc-name>/, 'the location name'),
  /* ⚠️ `relative` LEADS THE CLASS SINCE 9 OCTOBER — the PICTURE cell carries an absolutely positioned
   * "+1" badge when the location also has a weekly-only picture, and a badge needs a positioned
   * ancestor. ⛔ LIFTED, NOT RETYPED: if the class changes again this THROWS rather than measuring a
   * fixture that no longer matches the screen. */
  /* ══ 🔴 A ✓ OR A –, NOT A 24px THUMBNAIL ════════════════════════════════════════════════════════
   * ⛔ AT 24 × 30 A LOGO IS A COLOURED SMUDGE, so the cell answered "is there one?" while LOOKING as
   * though it answered "which one?" — and a THIRD of them would have made the row wider than the names
   * in it, which is the one thing a `table-fixed` list must not do. */
  locTick: lift(SOCIAL, /<span className="(flex justify-center)" data-slot-tick=/, 'a slot tick cell'),
  locTickSet: lift(SOCIAL, /<span className="(flex h-4 w-4 items-center justify-center rounded-full bg-green-100[^"]+)">✓/, 'a set tick'),
  locTickNone: lift(SOCIAL, /<span className="(text-\[13px\] font-bold leading-none text-slate-300)">–/, 'an empty dash'),
  /* ⛔ `locThumbBadge` IS GONE. The "+1" marked a weekly-only override, and the override is gone —
   * there is a picture per surface, so there is a COLUMN per surface instead. */
  chipOnCls: lift(SOCIAL, /filter === id \? '(bg-slate-900 text-white)'/, 'the selected chip'),
  /* ══ 🔴 §1 · THE BOX IS A **FLEX COLUMN** NOW, NOT A SUBGRID ════════════════════════════════════
   * ⛔ `grid-rows-subgrid row-span-4` LINED THE ROWS UP IN EVERY MEASUREMENT THIS FILE TOOK and still
   * did not line them up on the operator's screen. The boxes are flex columns with `grow` on the
   * description, so the preview and the footer are pinned to the box's FOOT — and the claims below
   * measure that, which is a claim about two fixed heights above a shared bottom edge rather than
   * about a track-sizing feature. ⚠️ THE CLASS IS NOT THE LINE AFTER THE ATTRIBUTE: the box carries a
   * long comment between them, so the lift reads on to the `className` wherever it is. */
  picBox: lift(SOCIAL, /<div data-picture-box=\{slotKey\}[\s\S]*?className="([^"]+)">/, 'a picture box'),
  /* ⚠️ `grow` ON THE DESCRIPTION IS THE WHOLE ALIGNMENT, so it is lifted rather than typed: a fixture
   * that spelled it out would go on measuring an aligned box after the component stopped having one. */
  picBlurb: lift(SOCIAL, /<p className="(mt-0\.5 grow text-xs leading-relaxed text-slate-500)">\{blurb\}<\/p>/, "the box's description"),
  /* 🔴 THE PREVIEW AREA — ONE HEIGHT IN ALL THREE, which is what makes the boxes equal. ⚠️ Lifted with
   * its FILLED arm, because that is the one whose border is not dashed. */
  /* ⚠️ THE PREVIEW'S CLASS IS BUILT IN TWO HALVES BY A TERNARY, so each arm is lifted on its own.
   * ⛔ THE FIRST ATTEMPT USED A REGEX WITH **NO CAPTURE GROUP** — `lift` returned `undefined`, the
   * fixture rendered `class="undefined"`, and the measurement reported a 0px preview. A lift whose
   * pattern captures nothing is a lift that silently hands back nothing. */
  picPreviewBase: lift(SOCIAL, /className=\{`(relative mt-2 flex h-\[132px\] min-w-0 items-center justify-center overflow-hidden rounded-lg border) \$\{image/, 'the preview area'),
  picPreviewFilled: lift(SOCIAL, /\? '(border-slate-200 bg-slate-50)'/, 'a filled preview'),
  picPreviewEmptyArm: lift(SOCIAL, /border-2 border-dashed \$\{over \? 'border-orange-400 bg-orange-50' : '(border-slate-300 bg-slate-50)'\}/, 'an empty preview'),
  /* ⛔ `picFileName` IS GONE — Dominic, 10 October: "remove the photo name eg Screenshot 2026-10-05 at
   * 11.11.21.png". The brief had asked for it truncated; the operator asked for it removed. ⚠️ THE
   * CLAIM THAT REPLACES IT IS THE OPPOSITE ONE: that no `[data-file-name]` exists at all, which is
   * also what stops the long-name overflow coming back — it was the only max-content contributor. */
  /* ⚠️ AND THE PREVIEW IMAGE'S, for the same reason: "contained and centred" is a class claim that a
   * fixture drawing its own `<img>` would quietly stop making. */
  picPreviewImg: lift(SOCIAL, /\? <img src=\{image\.url\} alt="" className="([^"]+)" \/>/, 'the preview image'),

  /* ⚠️ THE TILE'S CLASS IS A TEMPLATE NOW — the POSTER tile is drawn in the standard design's shape,
   * so its width is a style rather than a class. The fixture lifts the constant part and supplies the
   * width itself, exactly as the component does. */
  /* ⛔ `slotTile` IS GONE WITH `SlotBox`. The preview is `object-contain` in a fixed-height area now —
   * `object-cover` CROPPED, so a wide logo showed as its middle third. */
  /* ⚠️ §1 · THE BORROW LINK'S CLASS, LIFTED — it is `absolute` now and the fixture must draw it that
   * way or it would measure an Upload button nobody is shown. */
  borrowLink: lift(SOCIAL, /data-borrow\n\s*className="([^"]+)">/, 'the borrow link'),
  chipOn: 'bg-slate-900 text-white',
  chipOff: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
  chipBase: lift(SOCIAL, /className=\{`(rounded-full px-3 py-1 text-xs font-semibold) \$\{/, 'a filter chip'),
  pane: lift(SOCIAL, /<Card className="(flex min-w-0 flex-col p-4)" data-loc-pane>/, 'the selected-location pane'),
  /* ══ 🔴 THE POSTER AND THE PICTURE SIT IN A GRID OF THEIR OWN SINCE 9 OCTOBER ════════════════════
   * ⛔ THEY WERE STACKED, and stacked they pushed the tag field below the fold on a laptop. Two boxes
   * side by side is the brief's shape, and it is the shape the measurement below is about: whether
   * they really are one row at 1100 and really two at 390. ⚠️ LIFTED, so the fixture cannot keep
   * measuring a grid the screen has stopped using. */
  /* ══ 🔴 THREE BOXES OF EQUAL SIZE, STACKING AT 900 ════════════════════════════════════════════════
   * ⛔ IT WAS TWO COLUMNS WITH THE OVERRIDE STACKED UNDER ONE OF THEM, which made the third picture
   * visibly subordinate to the second — and it was, under that model. With a picture per surface there
   * is no hierarchy left to draw. ⚠️ `items-stretch`, WHICH IS WHAT MAKES THEM EQUAL. ⛔ AND 900, NOT
   * 640: three across needs half again as much room as two did. */
  /* ══ 🔴 §1 · THE PARENT DECLARES **NO ROWS** ANY MORE ════════════════════════════════════════════
   * ⛔ `grid-rows-[auto_auto_auto_auto]` EXISTED ONLY FOR THE BOXES' `subgrid` TO ADOPT, and the boxes
   * are flex columns now. ⚠️ `items-stretch` IS THE DEFAULT AND IS WHAT MAKES THE THREE BOXES ONE
   * HEIGHT — which, with the preview and the footer pinned to each box's foot, is what lines them up.
   * ⚠️ AND 900, NOT 640: three across needs half again as much room as two did. */
  /* ⚠️ `hidden … md:grid` SINCE §3 (10 October 2026): below 768px the three boxes are replaced by three
   * compact CARDS, and both are in the tree with CSS choosing. The desktop grid is otherwise unchanged,
   * which is what the widths below still measure. */
  locBoxes: lift(SOCIAL, /<div className="(mt-3 hidden grid-cols-1 gap-3 md:grid min-\[900px\]:grid-cols-3)"\n\s*data-loc-boxes>/, 'the three picture boxes'),
  /** §3 · the phone card list's own wrapper, and one card, lifted so the fixture cannot drift. */
  locPhoneCards: lift(SOCIAL, /<div className="(mt-3 space-y-2 md:hidden)" data-loc-phone-cards>/, 'the phone card list'),
  phoneCard: lift(SOCIAL, /<div data-phone-pic-card=\{slotKey\}\n\s*className="([^"]+)">/, 'a phone picture card'),
  phoneThumb: lift(SOCIAL, /className=\{`(flex h-\[72px\] w-\[72px\] shrink-0 items-center justify-center overflow-hidden rounded-lg) \$\{image/, 'the phone thumbnail'),
  locListScreen: lift(SOCIAL, /<div className=\{selectedId \? '(hidden md:block)' : 'block'\} data-loc-list-screen>/, 'the list screen'),
  locDetailScreen: lift(SOCIAL, /<div className=\{selectedId \? 'block' : '(hidden md:block)'\} data-loc-detail-screen>/, 'the detail screen'),
  /* ⚠️ THE STACKED BUTTON COLUMN inside a slot box, lifted for the same reason. Replace and Remove sat
   * in a `flex-wrap` ROW while the boxes were full width; at half a pane they wrapped at every
   * realistic size, so they are a column now. */
  /* ⛔ `slotBtns` IS GONE: a filled box has **Remove alone** now. "Replace" was a second button that
   * did what dropping a new file does — two presses for one outcome, on the box with the least room. */
  /* ══ 🔴 §1 · THE FOOTER ROW IS `h-7` WHETHER OR NOT THERE IS A PICTURE ══════════════════════════
   * ⛔ THIS IS THE ONE THAT WOULD HAVE BROKEN THE NEW ALIGNMENT. The previews are lined up by the
   * box's BOTTOM edge now, so a footer that collapsed to nothing in an empty box and stood 28px tall
   * in a filled one would put their previews 28px apart — "the images should line up" failing between
   * exactly the two states this screen shows at once. ⚠️ THE FIXTURE DRAWS ONE FILLED AND TWO EMPTY
   * FOR THAT REASON, and the control below removes the height to prove the claim notices. */
  picRemoveRow: lift(SOCIAL, /<div className="(mt-2 flex h-7 min-w-0 items-center justify-end)">\n\s*\{image && \(/, "a box's footer row"),
})

/** A design tile at the component's own arithmetic — so the fixture computes the box the screen does. */
function tile(c, w, h, label, of = '') {
  const ratio = w && h ? w / h : 4 / 5
  const width = Math.min(Math.round(c.tileH * ratio), c.tileMaxW)
  const height = Math.round(width / ratio)
  /* ⛔ `data-tile-of` TIES A TILE TO ITS BOX BY NAME. The first version matched tiles to boxes by
   * GEOMETRY — "the tile whose top and bottom sit inside this wrapper" — and that is wrong the moment
   * the two boxes are SIDE BY SIDE and share a top: the LEFT tile satisfies the RIGHT wrapper's
   * vertical bounds, so `find` returned it and the right box's "is the picture inside?" claim was
   * measured against the left box's picture. It failed at 1100 and passed at 390, which is exactly the
   * shape of that mistake. A name cannot be ambiguous. */
  return `<div data-design-tile${of ? ` data-tile-of="${of}"` : ''}
    style="height:${height}px;width:${width}px;max-width:100%"
    class="${c.designTile}">${label}</div>`
}

/* ⚠️ A BLURB IS OPTIONAL. The Locations card has none since 8 October — the page description above it
 * says what the screen is for — and an empty `<p>` would still take its `mt-1` and shift the card's
 * contents down by a line the real screen does not have. */
const box = (c, id, title, blurb, body) => `
  <div data-box="${id}" class="${c.boxCard} rounded-2xl border border-slate-200 bg-white">
    <p class="${c.boxHeading}">${title}</p>
    ${blurb ? `<p class="${c.boxBlurb}">${blurb}</p>` : ''}
    <div class="${c.boxBody}">${body}</div>
  </div>`

/* 🔴 THE PER-TAB HEADING AND DESCRIPTION, WHICH EVERY ONE OF THE THREE SCREENS NOW CARRIES. ⛔ IT IS
 * MEASURED rather than assumed: the three must be the same size and the same distance from the bar,
 * and that is the one thing a shared constant cannot prove on its own. */
const tabHead = (c, heading, blurb) => `
  <div class="min-w-0" data-tab-head>
    <p class="${c.tabHeading}" data-tab-heading>${heading}</p>
    <p class="${c.tabBlurb}" data-tab-blurb>${blurb}</p>
  </div>`

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 CREATE A POST — TWO HALVES
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// @param oneCol  the CONTROL: the grid's `min-[900px]:grid-cols-2` removed, so 1100 must STACK.
//                Without it "side by side at 1100" would pass on a page that never had two columns.
// @param ready   false ⇒ both halves are the empty panel, which is the state Pizza Kitchen is in.

/**
 * @param buttonAbovePicker ⛔ THE CONTROL FOR "the two make buttons are LEVEL". It draws the event
 *   half's button WHERE IT WAS BEFORE 10 OCTOBER — directly under the chosen event and above "OR PICK
 *   ANOTHER EVENT" — which is the arrangement Dominic reported. ⚠️ STRIPPING `mt-auto` IS **NOT** A
 *   CONTROL HERE AND THE FIRST ATTEMPT PROVED IT: with the ten-row picker the event half is the taller
 *   one, so its button's natural position IS the foot and the measurement reported "level" with the
 *   rule removed. A control has to restore the FAILURE, not delete a class.
 */
function createFixture(css, { oneCol = false, ready = true, open = false, buttonAbovePicker = false } = {}) {
  const c = C()
  const grid = oneCol ? c.twoHalves.replace('min-[900px]:grid-cols-2', '') : c.twoHalves

  const empty = (what) => `
    <div data-empty-box class="flex min-h-[9rem] flex-1 flex-col items-center justify-center gap-2
      rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
      <p class="text-sm font-bold text-slate-700">You haven’t designed a ${what} yet</p>
      <p class="max-w-[20rem] text-sm text-slate-500">Upload your picture in Designs first.</p>
      <button data-btn="empty-${what.replace(/\s+/g, '-')}" class="${c.btnOutline} mt-1">Go to Designs</button>
    </div>`

  /* ══ 🔴 BOTH HALVES CARRY A CAPTION BOX, BECAUSE BOTH HALVES DO (10 October 2026) ═════════════════
   * ⛔ THE FIXTURE GAVE ONE TO THE EVENT HALF AND NOT TO THE WEEKLY ONE — so the two halves were not
   * the same shape as the screen, and the "are the buttons level?" measurement could not have passed
   * however the component was written. ⚠️ A FIXTURE THAT DIVERGES FROM THE COMPONENT MEASURES A PAGE
   * NOBODY IS SERVED, which is the thing every lift in this file exists to prevent. */
  const captionFor = (kind, text) => `
    <div class="mt-3 border-t border-slate-100 pt-3" data-post-caption="${kind}">
      <div class="flex items-baseline justify-between gap-2">
        <p class="text-[10px] font-bold uppercase tracking-wide text-slate-400">CAPTION</p>
        <button data-edit-template class="text-[11px] font-semibold text-slate-600 underline">✎ Edit template</button>
      </div>
      <textarea data-caption-text class="${c.captionBox}" rows="5">${text}</textarea>
      <p class="mt-1 text-[11px] leading-relaxed text-slate-400" data-caption-note>Type straight in the box to change it for this post only. Your template stays as it is.</p>
    </div>`

  const left = ready ? `
    <div class="flex flex-col items-center">${tile(c, 1080, 1350, '')}</div>
    <label class="mt-3 block text-xs font-bold text-slate-600">Which week</label>
    <select class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900">
      <option>This week · Mon 12 Oct – Sun 18 Oct</option></select>
    <p class="mt-1.5 text-[11px] text-slate-400" data-week-events>4 events · 1 private event left out</p>
    <div class="mt-auto pt-3">
      <button data-primary data-btn="weekly" class="${c.btnPrimary} w-full">Create weekly post</button>
    </div>
    ${/* ⚠️ A **FILLED** WEEKLY CAPTION — the card showed the TEMPLATE until 10 October, tokens and all,
        * which is what Dominic reported. The fixture shows what the screen shows. */''}
    ${captionFor('week', `Pizza Kitchen — where we are this week:

Mon 13 Oct · ${LONG_NAME}, Lavenham · 5pm – 8pm
Wed 15 Oct · Market Square, Sudbury · 5pm – 9pm

Order ahead: https://hatchgrab.com/t/pizza-kitchen`)}` : empty('weekly post')

  /* ══ 🔴 THE EVENT PICKER — THREE ROWS ALWAYS, THE REST EXPANDED ═══════════════════════════════════
   * ⚠️ TEN EVENTS, BECAUSE THAT IS WHAT THE SERVER SENDS: three visible and seven behind "Show all
   * upcoming events (7) ⌄". ⛔ NO BUTTON PER ROW — the row IS the control, and the one button above the
   * list posts. A button per row was a second door to the modal that skipped the caption box entirely.
   * ⚠️ ONE PRIVATE ROW, greyed and unchoosable, in its date position: an operator with ten bookings who
   * sees nine goes looking for the tenth. */
  const pickRow = (i) => `
    <li>
      <button data-pick-event="e${i}" class="${c.pickRow} ${i === 3 ? 'cursor-default' : 'hover:bg-slate-50'}"${i === 3 ? ' disabled' : ''}>
        <span class="shrink-0 text-xs font-semibold ${i === 3 ? 'text-slate-400' : 'text-slate-700'}">Tue ${14 + i} Oct</span>
        <span class="min-w-0 flex-1 truncate text-xs ${i === 3 ? 'italic text-slate-400' : 'text-slate-600'}">${i === 3 ? 'Private event · no post' : LONG_NAME}</span>
        ${i === 3 ? '' : '<span class="shrink-0 truncate text-xs text-slate-400">Lavenham</span>'}
      </button>
    </li>`
  const firstThree = [0, 1, 2].map(pickRow).join('')
  const theRest = [3, 4, 5, 6, 7, 8, 9].map(pickRow).join('')

  /* ══ 🔴 THE CAPTION — A PLAIN, EDITABLE BOX, FILLED IN FOR THE CHOSEN EVENT ════════════════════════
   * ⛔ IT WAS THE CHIP EDITOR, with a debounced autosave and "Saved automatically · used next time too"
   * under it. So the only caption on the card was the TEMPLATE — tokens and all — and editing it edited
   * every event's caption for ever, which the note said out loud.
   * ⚠️ FIVE ROWS OF REAL TEXT, because the question this fixture answers is whether the box plus its
   * note fits under the button without pushing anything off the card. */
  const caption = captionFor('event', `Pizza Kitchen at ${LONG_NAME}, Lavenham on Tue 14 Oct, 17:00 – 20:00.

Order ahead: https://hatchgrab.com/t/pizza-kitchen`)

  const right = ready ? `
    <div data-next-event-half class="flex min-h-0 flex-1 flex-col">
      <p class="text-[10px] font-bold uppercase tracking-wide text-slate-400">YOUR NEXT EVENT</p>
      <div class="mt-2 flex items-start gap-3">
        ${tile(c, 1080, 1350, '')}
        <div class="min-w-0 flex-1">
          ${/* ══ 🔴 THE VENUE FIRST, 21px AND BOLD. ⛔ IT WAS THE DATE IN 14px WITH THE VENUE THIRD IN
              * GREY — and an operator knows their events by WHERE they are. ⚠️ `truncate`, SO A LONG
              * VENUE NAME GIVES WAY rather than wrapping under the tile and pushing the date out. */''}
          <p class="truncate text-[21px] font-bold leading-tight text-slate-900" data-chosen-venue>${LONG_NAME}</p>
          <p class="truncate text-sm text-slate-400" data-chosen-area>Lavenham</p>
          <p class="mt-0.5 truncate text-sm font-semibold text-slate-700" data-chosen-when>Tue 14 Oct · 17:00 – 20:00</p>
          <p class="mt-1 text-[11px] text-slate-400" data-image-source>Using ${LONG_NAME}’s photo</p>
        </div>
      </div>
      ${buttonAbovePicker ? `<div class="mt-3"><button data-primary data-btn="next" class="${c.btnPrimary} w-full">Create post for next event</button></div>` : ''}
      <div class="mt-3 border-t border-slate-100 pt-2">
        <p class="text-[10px] font-bold uppercase tracking-wide text-slate-400">OR PICK ANOTHER EVENT</p>
        <ul class="${c.pickList}" data-pick-list>${firstThree}${open ? theRest : ''}</ul>
        <button data-more-events class="mt-1.5 text-xs font-semibold text-slate-600 underline">${open ? 'Hide the rest ⌃' : 'Show all upcoming events (7) ⌄'}</button>
        <p class="mt-2"><a href="#" class="text-xs font-semibold text-slate-600 underline">See all upcoming events</a></p>
      </div>
      ${/* 🔴 AT THE FOOT OF THE HALF, like the weekly card's — so the two orange buttons line up. */''}
      ${buttonAbovePicker ? '' : `<div class="mt-auto pt-3" data-post-action>
        <button data-primary data-btn="next" class="${c.btnPrimary} w-full">Create post for next event</button>
      </div>`}
      ${caption}
    </div>` : empty('single event post')

  return `${HEAD(css)}${ORANGE_REF(c)}<div class="p-4 bg-slate-50">
    <div class="space-y-3" data-social-posts>
      ${tabHead(c, 'Create a post',
        'Make a post for this week or for one event. We put your dates, places and times on your design, ready to download or share.')}
      <div class="${grid}" data-create-halves>
        ${/* ⚠️ §(10 October 2026) · THE SINGLE EVENT HALF IS THE LEFT ONE NOW — the post a truck makes
            * most often reads first, and Designs and Location settings moved the same day. ⛔ THE
            * FIXTURE HAS TO MOVE WITH THE SCREEN or it measures a page nobody is served; the box IDS
            * stay 'left'/'right' because they name POSITIONS, which is what the measurement is about. */''}
        ${box(c, 'left', 'Single event post', 'One picture for one event: its date, place and times.', right)}
        ${box(c, 'right', 'Weekly post', 'One picture showing everywhere you’ll be this week.', left)}
      </div>
    </div></div></body></html>`
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 DESIGNS — TWO BOXES
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ THE GRID STILL DECLARES THREE TRACKS and that is deliberate in the source: the third is
// `minmax(0,1fr)` and holds nothing, so the two design boxes keep the width they had when there were
// three. ⛔ WHICH IS A SHAPE WORTH MEASURING RATHER THAN READING — an empty `1fr` track and a missing
// one lay out differently, and only one of them keeps the boxes off the right-hand edge.
//
// @param landscape  the design is 1920×1080. ⛔ REPORTED LIVE on 6 October: a landscape design at a
//                   fixed 220px height is 391px wide in a 200–320px column, and every design measured
//                   before that day was portrait, so no fixture had ever produced one.

function designsFixture(css, { landscape = false, ready = true } = {}) {
  const c = C()
  const badge = (on) => on
    ? '<span class="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">✓ Set up</span>'
    : '<span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">Not set up</span>'
  const usedFor = (txt) => `<p data-used-for class="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
    <span class="font-bold text-slate-700">Used for:</span> ${txt}</p>`

  const designBox = (id, title, blurb, w, h, on, label) => box(c, id, title, blurb, `
    <div data-tile-wrap="${id}" class="flex flex-col items-center">
      ${on ? tile(c, w, h, '', id) : tile(c, w, h, 'No design yet', id)}
      <div class="mt-2">${badge(on)}</div>
    </div>
    ${usedFor(id === 'left' ? 'the weekly post only.' : 'every post about a single event.')}
    <div class="mt-auto pt-3">
      <button data-primary data-btn="${id}" class="${c.btnPrimary} w-full">${label}</button>
    </div>`)

  return `${HEAD(css)}${ORANGE_REF(c)}<div class="p-4 bg-slate-50">
    <div class="space-y-3" data-social-posts>
      ${tabHead(c, 'Designs',
        'Your two designs: one for the weekly schedule and one for single event posts. Set them up once — every post uses them.')}
      <div class="${c.twoHalves}" data-design-boxes>
        ${designBox('left', 'Single event post design', 'Your standard design for a post about one event.',
          landscape ? 1920 : 1080, landscape ? 1080 : 1350, false, 'Set up single event design')}
        ${designBox('right', 'Weekly post design', 'Your background picture for the weekly schedule post.',
          1080, 1350, ready, ready ? 'Edit weekly design' : 'Set up weekly design')}
      </div>
    </div></div></body></html>`
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 LOCATION SETTINGS — A TABLE AND ONE SELECTED LOCATION
// ════════════════════════════════════════════════════════════════════════════════════════════════
//
// @param rows    60 is a truck with a full address book, which is the case that decides whether the
//                list scrolls INSIDE its card or stretches it and pushes the pane off the screen.
// @param noCap   the CONTROL: `max-h-[30rem]` removed, so the card must grow past the viewport.

function locationsFixture(css, {
  /* ⛔ `photoSpace` WAS A PARAMETER HERE AND IS NOT ANY MORE (9 October 2026). It drew the amber line
   * "your single event design has no photo space yet — add one to show this picture on event posts →",
   * which belonged to a CHOICE the screen no longer offers: the picture is used wherever a design has
   * a space, so "you picked a surface that cannot draw it" is not a state this screen can produce. */
  rows = 60, noCap = false, oneCol = false, landscape = false,
  /** 🔴 §4's OPT-IN THIRD BOX — "Picture for weekly posts", under the location picture. */
  weeklyOnly = false,
  /** The CONTROL for the side-by-side claim: the two-column rule stripped off `data-loc-boxes`. */
  boxesOneCol = false,
  /**
   * ══ 🔴 §1 (10 October 2026) · ALL THREE BOXES FILLED ════════════════════════════════════════════
   * ⛔ DOMINIC WAS LOOKING AT A LOCATION WITH PICTURES IN IT — *"music festival has photos uploaded but
   * the pictures are wider than the box they're in"* — and the fixture drew ONE filled box and two
   * empty ones, which is the state that shows an unequal FOOTER but not the state he was in. ⚠️ BOTH
   * ARE MEASURED NOW: the default (one filled, two empty) is the mixed case the alignment is hardest
   * in, and `allFilled` is his.
   */
  allFilled = false,
  /** The CONTROL for "the previews line up": `grow` taken off the description. */
  noGrow = false,
  /** The CONTROL for the same claim in the mixed case: the footer's fixed height taken away. */
  noFooterH = false,
} = {}) {
  const c = C()
  /* ⛔ THE CONTROL STRIPS WHATEVER THE **LIFTED** GRID'S `min-[900px]:` RULE IS, rather than naming the
   * one it happened to be. The first version spelled out `minmax(0,1fr)_minmax(280px,420px)` — the
   * ratio before 8 October — so when the ratio changed the `.replace` matched nothing, the control
   * rendered the normal two-pane layout and failed on correct code. ⚠️ A CONTROL THAT NAMES A LITERAL
   * IS A CONTROL THAT STOPS CONTROLLING THE DAY THAT LITERAL CHANGES. */
  const grid = oneCol
    ? c.locGrid.replace(/min-\[900px\]:grid-cols-\[[^\]]*\]/, '')
    : c.locGrid
  const scroller = noCap ? c.locScroller.replace('max-h-[30rem]', '') : c.locScroller

  /* 🔴 THE PICTURE CELL CARRIES A "+1" WHERE A WEEKLY-ONLY PICTURE IS ALSO SET. ⚠️ IT IS MEASURED
   * rather than merely drawn: a badge positioned `-right-0.5 -top-0.5` hangs OUTSIDE the 24px tile, and
   * the question this fixture exists to answer is whether that overhang widens a `table-fixed`
   * column — which would move the two slot columns and unalign every row's thumbnails. */
  /* 🔴 A ✓ OR A –, 16px, CENTRED IN A 44px COLUMN. ⚠️ The full picture is in the pane, 132px tall and
   * shown whole — which is what makes a tick in the table enough. */
  const tick = (has) => `<span class="${c.locTick}" data-slot-tick="${has ? 'set' : 'none'}">${has
    ? `<span class="${c.locTickSet}">✓</span>`
    : `<span class="${c.locTickNone}">–</span>`}</span>`
  const body = Array.from({ length: rows }, (_, i) => `
    <tr data-loc-row class="${i === 2 ? 'bg-orange-50' : 'hover:bg-slate-50'} cursor-pointer">
      <td class="${c.locNameCell}">
        <button class="block w-full min-w-0 text-left">
          <span class="${c.locName}" data-loc-name>${LONG_NAME} ${i + 1}</span>
          <span class="block truncate text-xs text-slate-400">Lavenham</span>
        </button>
      </td>
      <td class="py-1.5 align-top">${tick(i % 2 === 0)}</td>
      <td class="py-1.5 align-top">${tick(i % 3 === 0)}</td>
      <td class="py-1.5 align-top">${tick(i % 7 === 0)}</td>
    </tr>`).join('')

  const table = `
    <div class="mt-2 flex flex-wrap gap-1.5" data-loc-chips>
      <button data-loc-chip="all" class="${c.chipBase} ${c.chipOn}">All ${rows}</button>
      <button data-loc-chip="missing" class="${c.chipBase} ${c.chipOff}">No images 40</button>
      <button data-loc-chip="hidden" class="${c.chipBase} ${c.chipOff}">Hidden 2</button>
    </div>
    <div class="${scroller}" data-loc-table>
      <table class="${c.locTable}">
        <thead><tr class="${c.locHeadRow}">
          <th class="w-auto py-1 text-left">Location</th>
          ${/* ⚠️ WEEKLY · EVENT · POSTER — the order of the three boxes in the pane, with the poster
              * LAST because it is the one most trucks never set. ⛔ A ROW WHOSE CELLS RAN DIFFERENTLY
              * would make the operator re-learn which tick is which every time they looked from the
              * list to the boxes — and with two of them called "picture", that is a mistake nobody
              * would catch by looking. */''}
          <th class="w-[44px] py-1 text-center">Weekly</th>
          <th class="w-[44px] py-1 text-center">Event</th>
          <th class="w-[44px] py-1 text-center">Poster</th>
        </tr></thead>
        <tbody class="divide-y divide-slate-100">${body}</tbody>
      </table>
    </div>`

  /* ══ 🔴 ONE OF THE THREE PICTURE BOXES ════════════════════════════════════════════════════════════
   * ⛔ `SlotBox` IS GONE AND WITH IT THE 70px `object-cover` TILE, the aspect-ratio shaping, and the
   * Replace button. Three changes, each with its own reason:
   *   • **`object-cover` CROPPED.** A wide logo appeared as its middle third, so an operator checking
   *     they had uploaded the right file was shown something that was not quite it.
   *   • **THE SHAPED TILE IS A REAL LOSS** and is named in the report: it took the standard design's
   *     aspect ratio, so an empty poster box said what shape was wanted without a number. Three boxes
   *     of equal size — the brief's instruction — cannot do that.
   *   • **Replace WAS A SECOND BUTTON** that did what dropping a new file does.
   * ⚠️ THE PREVIEW IS THE SAME HEIGHT IN ALL THREE, which is what makes the boxes equal — and the
   * fixture draws one FILLED and two EMPTY, because that is the case where an unequal height shows. */
  const picBox = (id, title, blurb, has, borrow = '', dropLabel = 'Drop it here') => `
    <div data-picture-box="${id}" class="${c.picBox}${noGrow ? ' hg-no-grow' : ''}">
      <p class="text-sm font-bold text-slate-900">${title}</p>
      ${/* 🔴 `grow` IS THE ALIGNMENT, so the fixture takes it from the source and the CONTROL removes
          * it (`hg-no-grow`, a stylesheet rule below) — which puts the previews back under three
          * descriptions of three different lengths, the failing shape the operator reported. */''}
      <p class="${c.picBlurb}" data-blurb>${blurb}</p>
      <div class="${c.picPreviewBase} ${has
        ? c.picPreviewFilled
        : `border-2 border-dashed ${c.picPreviewEmptyArm}`}" data-drop-area>
        ${has
          /* ⚠️ A REAL `<img>` WITH THE SCREEN'S OWN CLASS, and a WIDE one (1600×400 as a data URI): a
           * `<span>` with a background could never overflow, so the old filler could not have shown
           * the bug §1 is about. */
          ? `<img src="${WIDE_PIC}" alt="" class="${c.picPreviewImg}" data-preview-img>`
          : `<div class="min-w-0 px-2 text-center">
              <p class="text-[11px] font-semibold text-slate-400">${dropLabel}</p>
              <label class="${c.btnOutline} mt-1.5 cursor-pointer" data-btn="${id}-up" data-upload>Upload</label>
              ${borrow ? `<button data-borrow data-btn="${id}-borrow" class="${c.borrowLink}">${borrow}</button>` : ''}
            </div>`}
      </div>
      ${/* ══ 🔴 THE FOOTER IS RENDERED AND FIXED-HEIGHT IN ALL THREE BOXES ════════════════════════
          * ⛔ AND IT IS EMPTY IN TWO OF THEM, which is the case the height exists for: the previews are
          * aligned by the box's bottom edge now, so a footer that collapsed in an empty box would sit
          * its preview 28px below the filled one's. ⚠️ THE CONTROL (`hg-no-h`) TAKES THE HEIGHT AWAY. */''}
      <div class="${c.picRemoveRow}${noFooterH ? ' hg-no-h' : ''}">
        ${has ? `
          <button data-btn="${id}-rm" data-remove class="shrink-0 rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">Remove</button>` : ''}
      </div>
    </div>`

  /* ══ 🔴 THE PAIR'S OWN GRID, AND THE CONTROL THAT STRIPS IT ══════════════════════════════════════
   * ⛔ THE CONTROL REMOVES WHATEVER THE **LIFTED** TWO-COLUMN RULE IS, by regex, rather than naming
   * `sm:grid-cols-2` — the same trap the outer grid's control fell into on 8 October, when it spelled
   * out a ratio that had changed and quietly stopped controlling anything. */
  const boxesGrid = boxesOneCol
    ? c.locBoxes.replace(/min-\[900px\]:grid-cols-\S+/, '')
    : c.locBoxes

  const pane = `
    <div class="${c.pane} rounded-2xl border border-slate-200 bg-white" data-loc-pane>
      <p class="text-[17px] font-bold leading-tight text-slate-900">${LONG_NAME}
        <span class="font-medium text-slate-400"> · Lavenham</span></p>
      ${/* ══ 🔴 "Name on posts" IS GONE AND A GREY NOTE STANDS WHERE IT WAS (9 October 2026) ════════
          * ⛔ The field wrote `short_name`, which "Tidy up places" also writes — and that screen edits
          * the TOWN beside it. A location's name and its town are one fact about the schedule, and the
          * second screen editing half of it is how the two halves come to disagree.
          * ⚠️ IT IS MEASURED, NOT MERELY PRESENT: this note names a four-step path and is the longest
          * unbroken run of words in the pane, which makes it the one thing here that could overflow a
          * 358px phone column. */''}
      <p class="mt-1 text-[11px] leading-relaxed text-slate-400" data-name-from-schedule>Name and town come from your schedule. Edit them in Schedule › Events › Add event › Tidy up places.</p>
      ${/* ══ 🔴 THE POSTER AND THE PICTURE, SIDE BY SIDE ═══════════════════════════════════════════
          * ⚠️ `items-start`, so the picture box growing a third box underneath it does not stretch the
          * poster box beside it — which is exactly what a grid does by default, and is measured.
          * ⚠️ THE POSTER TILE IS DRAWN IN THE DESIGN'S SHAPE — portrait by default, landscape under
          * `landscape`, which is the case that would overflow HALF a 280px pane rather than all of it. */''}
      ${/* ══ 🔴 THREE BOXES OF EQUAL SIZE, SIDE BY SIDE ════════════════════════════════════════════
          * ⛔ IT WAS TWO COLUMNS WITH THE OVERRIDE STACKED UNDER ONE OF THEM, which made the third
          * picture visibly subordinate to the second — and it was, under that model. With a picture per
          * surface there is no hierarchy left to draw. ⚠️ `items-stretch` IS WHAT MAKES THEM EQUAL.
          * ⚠️ THE FIXTURE DRAWS ONE FILLED AND TWO EMPTY, because that is the case where an unequal
          * height would show — and the EMPTY weekly box carries the borrow link, which is the state
          * the link exists for. */''}
      ${/* ══ 🔴 §3 · THE PHONE'S THREE COMPACT CARDS, DRAWN TOO ═══════════════════════════════════
          * ⚠️ BOTH LAYOUTS ARE IN THE REAL PANE AND CSS CHOOSES, so a fixture that drew only the boxes
          * would measure a screen nobody is served below 768px — and would measure it as three
          * `display:none` elements, which is exactly how the first run after §3 reported "0px". */''}
      <div class="${c.locPhoneCards}" data-loc-phone-cards>
        ${[['event-photo', 'Picture for event posts', 'In your single event design’s picture space', true],
          ['weekly', 'Picture for weekly posts', 'On this location’s line of your weekly post', false],
          ['event', 'Location poster', 'Used instead of your single event design', false],
        ].map(([id, title, line, has]) => `
          <div data-phone-pic-card="${id}" class="${c.phoneCard}">
            <div data-phone-thumb class="${c.phoneThumb} ${has
              ? 'border border-slate-200 bg-slate-50'
              : 'border-2 border-dashed border-slate-300 bg-slate-50'}">
              ${has ? `<img src="${WIDE_PIC}" alt="" class="h-full w-full object-contain">` : ''}
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-bold leading-tight text-slate-900">${title}</p>
              <p class="mt-0.5 text-[11px] leading-snug text-slate-500 line-clamp-2">${line}</p>
              <div class="mt-1.5 flex flex-wrap items-center gap-2">
                ${has
                  ? `<button data-phone-remove class="shrink-0 rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">Remove</button>`
                  : `<label data-phone-upload class="inline-flex shrink-0 cursor-pointer items-center rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700">Upload</label>`}
              </div>
            </div>
          </div>`).join('')}
      </div>
      <div class="${boxesGrid}" data-loc-boxes>
        ${/* ══ 🔴 THE THREE REAL DESCRIPTIONS, AND THEIR DIFFERENT LENGTHS ARE THE WHOLE POINT ════════
            * ⛔ A FIXTURE WITH THREE EQUAL DESCRIPTIONS WOULD LINE UP WITHOUT SUBGRID and prove nothing.
            * These are the product's own strings: at a third of a 763px pane they wrap to one, two and
            * two lines, which is exactly the case `items-stretch` could not handle.
            * ⚠️ AND ONE BOX IS FILLED while two are empty, because row 4 differs there too. */''}
        ${/* ⚠️ THE EVENT BOX IS FILLED IN BOTH RUNS; the other two follow `allFilled`. ⛔ THE MIXED
            * RUN IS THE HARDER ONE — a filled footer beside two empty ones — and the ALL-FILLED run is
            * the one the operator was looking at. The borrow link only exists in the mixed run,
            * because a filled box has nothing to borrow. */''}
        ${picBox('event-photo', 'Picture for event posts',
          'A logo or photo in the picture space of your single event design.', true)}
        ${picBox('weekly', 'Picture for weekly posts',
          'A logo or photo for this location’s line on your weekly post.', allFilled,
          allFilled ? '' : 'Use the event post picture')}
        ${picBox('event', 'Location poster',
          'Got a ready-made poster for this location? Upload it and we’ll use it instead of your single event design.', allFilled,
          '', 'Drop it here')}
      </div>

      ${/* ⚠️ THE TAG FIELD STAYS, and with "Name on posts" gone it is the only input in the pane. */''}
      <div class="mt-4 border-t border-slate-100 pt-3">
        <label class="block text-xs font-bold text-slate-600">Tag on social media <span class="font-medium text-slate-400">(for captions)</span></label>
        <input class="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" data-social-tag placeholder="@buresmusicfest">
        <button data-btn="save-tag" class="${c.btnOutline} mt-2">Save tag</button>
      </div>
    </div>`

  /* ══ 🔴 THE TWO CONTROLS FOR §1's ALIGNMENT, AS CSS RULES ════════════════════════════════════════
   * ⛔ A CONTROL MUST RESTORE THE **FAILING** SHAPE, and in this repository that lesson was learnt by
   * writing one that did not: stripping `mt-auto` changed nothing, because the taller box's footer was
   * already at the foot. These two take away the one thing each claim rests on — `grow` on the
   * description, and the footer's fixed height — and the measurement must notice both.
   * ⚠️ THEY ARE RULES RATHER THAN CLASS SURGERY because the classes are LIFTED from the source: a
   * control that edited the lifted string would stop controlling the day the string changed. */
  const controlCss = `
    .hg-no-grow > [data-blurb]{flex-grow:0}
    .hg-no-h{height:auto}`

  return `${HEAD(css)}<style>${controlCss}</style>${ORANGE_REF(c)}<div class="p-4 bg-slate-50">
    <div class="space-y-3" data-social-posts>
      ${tabHead(c, 'Location settings',
        'Images, names and social media tags for each location. They’re used automatically when you create a post.')}
      <div class="${grid}" data-locations-area>
        ${/* ⚠️ THE CARD IS "Locations" AND CARRIES NO BLURB — the PAGE description above it says what
            * the screen is for, and the same sentence twice on one screen is what the per-tab
            * description was added to stop. */''}
        ${box(c, 'table', 'Locations', '', table)}
        ${pane}
      </div>
    </div></div></body></html>`
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE MEASUREMENTS, TAKEN IN THE BROWSER
// ════════════════════════════════════════════════════════════════════════════════════════════════

const rects = () => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect()
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left),
             right: Math.round(b.right), width: Math.round(b.width), height: Math.round(b.height) } }
  const all = (sel) => [...document.querySelectorAll(sel)]
  /* ══ 🔴 "ORANGE" IS THE **REFERENCE SWATCH'S** COMPUTED COLOUR, NOT A LIST OF COLOUR SPACES ═══════
   * ⛔ THE FIRST VERSION MATCHED `/rgb\(234,88,12\)|oklch\(0\.646|#ea580c/` AND THIS MEASUREMENT CAUGHT
   * IT: WebKit returned `lab(57.1026 64.2584 89.8886)` — a third representation the regex did not know
   * — so every orange button read as "not orange" and the assertion failed on correct markup.
   * ⚠️ IT IS THE SAME CLASS OF MISTAKE THE SIBLING HARNESS RECORDS, in its other direction: there, a
   * pure-absence test PASSED because nothing matched. Here the positive half failed, which is why the
   * positive half is asserted at all.
   * 🔴 THE FIX IS TO STOP NAMING COLOURS. The fixture renders a hidden `<span>` carrying the real
   * `BTN_PRIMARY` class; "orange" means "the same computed `backgroundColor` as that". It is
   * engine-agnostic, it cannot drift when Tailwind changes colour space, and it fails honestly if the
   * reference itself stops being orange. */
  const ref = document.querySelector('[data-orange-ref]')
  const ORANGE_BG = ref ? getComputedStyle(ref).backgroundColor : '\u0000none'
  return {
    /* ⚠️ RETURNED SO A FAILURE CAN SAY WHAT IT WAS COMPARING AGAINST. A matcher that reports only
     * "none matched" is one nobody can debug. */
    orangeBg: ORANGE_BG,
    innerW: window.innerWidth,
    innerH: window.innerHeight,
    docScrollW: document.documentElement.scrollWidth,
    boxes: all('[data-box], [data-loc-pane]').map(el => ({ id: el.dataset.box || 'pane', ...r(el) })),
    /* ⛔ THE COLUMN COUNT IS READ OFF THE COMPUTED `grid-template-columns`, not guessed from the tops.
     * A grid with one track and a grid with two that happen to wrap are different things. */
    cols: (() => {
      const g = document.querySelector('[data-create-halves], [data-design-boxes], [data-locations-area]')
      if (!g) return -1
      const v = getComputedStyle(g).gridTemplateColumns
      return v && v !== 'none' ? v.trim().split(/\s+/).length : -1
    })(),
    /* 🔴 ORANGE IS COUNTED ON THE **COMPUTED** BACKGROUND, over every button on the screen — a
     * class-name count cannot see a colour arriving from somewhere else. ⚠️ AND THE FULL LIST IS
     * RETURNED BESIDE IT, because a pure-absence assertion cannot tell "correct" from "measured
     * nothing": the first version of this check in the sibling harness passed on a page where the
     * computed colour came back as `oklch(…)` and the matcher only knew `rgb(…)`. */
    buttons: all('[data-btn], [data-primary]').map(el => ({
      id: el.dataset.btn || 'primary',
      bg: getComputedStyle(el).backgroundColor,
      orange: getComputedStyle(el).backgroundColor === ORANGE_BG,
      ...r(el),
    })),
    headings: all('[data-box] > p:first-child').map(el => ({
      transform: getComputedStyle(el).textTransform,
      size: parseFloat(getComputedStyle(el).fontSize),
    })),
    /* 🔴 THE PAGE HEADING AND ITS DESCRIPTION — one of each, on every one of the three screens. */
    tabHeading: (() => { const el = document.querySelector('[data-tab-heading]')
      return el ? { text: el.textContent.trim(), size: parseFloat(getComputedStyle(el).fontSize), ...r(el) } : null })(),
    tabBlurb: (() => { const el = document.querySelector('[data-tab-blurb]')
      return el ? { text: el.textContent.trim(), size: parseFloat(getComputedStyle(el).fontSize), ...r(el) } : null })(),
    radios: all('[data-picture-use] input[type="radio"]').map(r),
    tiles: all('[data-design-tile]').map(el => ({ of: el.dataset.tileOf || null, ...r(el) })),
    tileWraps: all('[data-tile-wrap]').map(el => ({ id: el.dataset.tileWrap, ...r(el) })),
    locTable: (() => { const el = document.querySelector('[data-loc-table]')
      return el ? { ...r(el), clientH: el.clientHeight, scrollH: el.scrollHeight } : null })(),
    locRows: all('[data-loc-row]').map(r),
    chips: all('[data-loc-chip]').map(el => ({ id: el.dataset.locChip, ...r(el) })),
    /* ⛔ `slotBoxes` IS GONE WITH `SlotBox`. ⚠️ `pictureBoxes` IS KEYED BY ITS **SLOT NAME** — `weekly`,
     * `event-photo`, `event` — so a measurement about which box is where cannot be satisfied by the
     * wrong one. */
    pictureBoxes: all('[data-picture-box]').map(el => ({ id: el.dataset.pictureBox, ...r(el) })),
    /* 🔴 THE PREVIEW AREAS, whose heights must be identical — that is what makes the boxes equal. */
    dropAreas: all('[data-drop-area]').map(r),
    /* ══ 🔴 §3 · THE PHONE'S COMPACT CARDS ═══════════════════════════════════════════════════════
     * ⚠️ READ WITH THEIR **COMPUTED `display`**, because the whole arrangement is "both are in the tree
     * and CSS chooses". A claim that only measured rectangles could not tell a card that is shown from
     * one that is `display:none` — and `getBoundingClientRect()` on a hidden element is all zeros,
     * which compares equal to other zeros. That is how the first run after §3 passed a 0px preview. */
    phoneCards: all('[data-phone-pic-card]').map(el => ({
      id: el.dataset.phonePicCard, shown: getComputedStyle(el).display !== 'none', ...r(el),
    })),
    phoneThumbs: all('[data-phone-thumb]').map(r),
    phoneCardList: (() => { const el = document.querySelector('[data-loc-phone-cards]')
      return el ? { shown: getComputedStyle(el).display !== 'none', ...r(el) } : null })(),
    boxesWrap: (() => { const el = document.querySelector('[data-loc-boxes]')
      return el ? { shown: getComputedStyle(el).display !== 'none', ...r(el) } : null })(),
    /* ══ 🔴 §1 · THE FOUR ROWS OF EACH BOX, SO "THEY LINE UP" IS A MEASUREMENT ════════════════════════
     * ⛔ EQUAL BOX HEIGHTS ARE NOT THE CLAIM. `items-stretch` already gave us those, and the contents
     * still started at six different heights because the descriptions wrap to different numbers of
     * lines. The claim is that **row 3 starts at the same y in all three** however long row 2 is — which
     * is what subgrid buys and what nothing else does.
     * ⚠️ READ AS `top` PER ROW, in document order, so the comparison below is one `new Set` per row. */
    boxRows: all('[data-picture-box]').map(el => {
      const kids = [...el.children].filter(k => k.tagName !== 'INPUT')
      return {
        id: el.dataset.pictureBox,
        tops: kids.map(k => Math.round(k.getBoundingClientRect().top)),
        /* ══ ⚠️ THE DESCRIPTION'S **LINE COUNT**, VIA A RANGE OVER ITS TEXT ════════════════════════════
         * ⛔ NEITHER THE BOX HEIGHT NOR `scrollHeight` WORKS HERE, and finding that out is the point.
         * Subgrid stretches the `<p>` to the tallest of the three, so its box height is equal BY
         * CONSTRUCTION — and `scrollHeight` is the padding box of that stretched element, so it is equal
         * too. Measuring either as the premise would be measuring the very thing under test and
         * reporting "they all wrap the same" about three sentences that plainly do not.
         * 🔴 A `Range` OVER THE TEXT GIVES ONE RECT PER **LINE BOX**, which is the wrapped text's own
         * shape and is untouched by the stretch. */
        descLines: (() => {
          const el = kids[1]
          if (!el) return 0
          const rg = document.createRange()
          rg.selectNodeContents(el)
          return rg.getClientRects().length
        })(),
        bottom: Math.round(el.getBoundingClientRect().bottom),
      }
    }),
    borrows: all('[data-borrow]').map(el => ({ text: el.textContent.trim(),
      /* ⚠️ §1 · `position` IS READ BACK, because "out of the flow" is the whole fix: a borrow link that
       * went back into the centred stack would push that box's Upload button 11px up again. */
      position: getComputedStyle(el).position, ...r(el) })),
    /* ⛔ §1 · THE FILE NAME IS **COUNTED, NOT MEASURED** — Dominic, 10 October: "remove the photo name
     * eg Screenshot 2026-10-05 at 11.11.21.png". The claim is now that there is no such element on the
     * screen at all, which is also what keeps the long-name overflow from coming back: the name was
     * the only thing in the box that ever reported a max-content width. */
    fileNameCount: all('[data-file-name]').length,
    /* ⚠️ §1 · THE **Upload** LABELS, because "make sure the upload box lines up" is a claim about those
     * and not about the area around them. Measured per box, compared across the empty ones. */
    uploadBtns: all('[data-upload]').map(el => ({ id: el.closest('[data-picture-box]')?.dataset.pictureBox, ...r(el) })),
    removeBtns: all('[data-btn$="-rm"]').map(r),
    /* ⚠️ §1 · AND THE PICTURE ITSELF, with the area it is supposed to stay inside. */
    previewImgs: all('[data-drop-area] img').map(r),
    /* ⚠️ "AT MOST TWO LINES" IS A **HEIGHT** CLAIM: the cell's height over its own line-height. A class
     * census sees `line-clamp-2` and cannot tell whether the cell honoured it. */
    locNames: all('[data-loc-name]').map(el => {
      const lh = parseFloat(getComputedStyle(el).lineHeight)
      const h = el.getBoundingClientRect().height
      return { lines: Number.isFinite(lh) && lh > 0 ? Math.round(h / lh) : 1, ...r(el) }
    }),
    tickCells: all('[data-slot-tick]').map(el => {
      const cell = el.closest('td')
      return cell ? Math.round(cell.getBoundingClientRect().width) : 0
    }),
    /* 🔴 THE PAIR'S OWN TRACK COUNT, read off the computed value for the same reason `cols` is: a grid
     * with one track and a grid with two that happen to look stacked are different facts. */
    locBoxCols: (() => {
      const g = document.querySelector('[data-loc-boxes]')
      if (!g) return -1
      const v = getComputedStyle(g).gridTemplateColumns
      return v && v !== 'none' ? v.trim().split(/\s+/).length : -1
    })(),
    /* ⚠️ THE GREY NOTE THAT REPLACED "Name on posts" — measured, because it names a four-step path and
     * is the longest unbroken run of words in the pane. */
    nameNote: (() => { const el = document.querySelector('[data-name-from-schedule]')
      return el ? { text: el.textContent.trim(), ...r(el) } : null })(),

    /* ⛔ `addWeeklyOnly`, `badges` AND `pictureCells` WENT WITH THE OVERRIDE AND THE THUMBNAILS. The
     * "+1" marked a weekly-only picture, and there is a COLUMN per surface now; the 24px tiles are a ✓
     * or a –, and `tickCells` is what checks their columns stay aligned. */
    evRows: all('[data-ev-row]').map(el => {
      const b = el.getBoundingClientRect()
      const btn = el.querySelector('button')
      const bb = btn ? btn.getBoundingClientRect() : null
      return { rowTop: Math.round(b.top), rowBottom: Math.round(b.bottom), rowHeight: Math.round(b.height),
               btnTop: bb ? Math.round(bb.top) : null, btnBottom: bb ? Math.round(bb.bottom) : null,
               btnRight: bb ? Math.round(bb.right) : null }
    }),
    /* ⛔ `moreList` IS GONE WITH THE CAPPED SCROLLER. §5's picker shows three rows always and expands
     * in place, so there is no `max-h` to measure — what matters is that the rows stay inside the half,
     * which is what `pickRows` is for. */
    pickRows: all('[data-pick-event]').map(el => ({ ...r(el), disabled: el.disabled === true })),
    /* 🔴 THE CHOSEN EVENT'S THREE LINES, with the venue's COMPUTED size — "21px and first" is a claim
     * about what is painted, and a class census cannot tell what order they ended up in. */
    chosen: (() => {
      const v = document.querySelector('[data-chosen-venue]')
      const a = document.querySelector('[data-chosen-area]')
      const wn = document.querySelector('[data-chosen-when]')
      if (!v || !wn) return null
      return {
        venueSize: Math.round(parseFloat(getComputedStyle(v).fontSize)),
        venueTop: Math.round(v.getBoundingClientRect().top),
        venueRight: Math.round(v.getBoundingClientRect().right),
        areaTop: Math.round((a || wn).getBoundingClientRect().top),
        whenTop: Math.round(wn.getBoundingClientRect().top),
      }
    })(),
    /* ⚠️ **BOTH** CAPTION BOXES SINCE 10 OCTOBER — the weekly half has one too, and a `querySelector`
     * for the first one was measuring the LEFT box against the RIGHT half. ⛔ EACH IS KEYED BY ITS OWN
     * kind, so a claim says which half it is about. */
    captions: all('[data-post-caption]').map(el => {
      const box = el.querySelector('[data-caption-text]')
      const note = el.querySelector('[data-caption-note]')
      return { kind: el.dataset.postCaption, ...r(el), box: box ? r(box) : null, note: note ? r(note) : null }
    }),
    caption: (() => { const el = document.querySelector('[data-post-caption="event"] [data-caption-text]'); return el ? r(el) : null })(),
    captionNote: (() => { const el = document.querySelector('[data-post-caption="event"] [data-caption-note]'); return el ? r(el) : null })(),
    imageSource: (document.querySelector('[data-image-source]') || {}).textContent || '',
    weekEvents: (document.querySelector('[data-week-events]') || {}).textContent || '',
  }
}

async function engines() {
  /* ⚠️ `HG_ENGINES` — one engine when the other is broken on the machine. ⛔ THE DEFAULT IS BOTH: a
   * one-engine default would make a Chromium-only bug invisible for ever. */
  const want = (process.env.HG_ENGINES || 'chromium,webkit').toLowerCase()
  const out = []
  const shotSafely = async (fn, file) => {
    /* ⛔ A SCREENSHOT CANNOT KILL THE RUN. It is the last thing in a width's loop, and on this machine
     * Chromium's `Page.captureScreenshot` has timed out before — which took every measurement already
     * made down with it. A shot is evidence, not a test. */
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-social-tab-'))
  const write = (name, html) => { const f = path.join(tmp, name); fs.writeFileSync(f, html); return 'file://' + f }
  const shots = path.join(REPO, 'docs/screenshots/social-tab')
  fs.mkdirSync(shots, { recursive: true })

  /** The breakpoint itself, in one place — every "side by side or stacked?" branch reads it. */
  const SIDE_BY_SIDE = 900
  /* 🔴 THE BRIEF'S OWN TWO WIDTHS, and they are the two sides of the one rule these screens have:
   * 1100 is a laptop window (above 900) and 390 is a phone (below it). */
  /* ⚠️ §1 (10 October 2026) · 1280 AND 1728 JOIN THE SET, because the brief names them: the long-name
   * overflow is a CONTENT-SIZED column, so it had to be checked where the boxes are WIDEST as well as
   * where they are narrowest — a fix that only worked at 1100 would look right on the machine it was
   * found on. ⛔ 390 STAYS: below 900 the three boxes stack, which is a different shape again. */
  /* ⚠️ §3 (10 October 2026) · 430 AND 768 JOINED THE SET. 430×932 is the brief's second phone and is
   * where a 72px thumb plus a long title has the most room to still go wrong; **768 is the breakpoint
   * itself**, and a breakpoint with no measurement ON it is a breakpoint nobody has checked — this
   * repository has shipped four layout bugs past exactly that gap. ⛔ 768 MUST READ AS **TABLET**: the
   * three boxes, stacked, exactly as they are today. */
  const WIDTHS = [[1100, 800, 'laptop window'], [1280, 900, 'desktop'], [1728, 1000, 'full window'],
    [768, 1024, 'tablet'], [430, 932, 'big phone'], [390, 844, 'phone']]

  /* ══ 🔴 EVERY SCREEN CARRIES ITS OWN HEADING AND DESCRIPTION, AT THE SAME SIZE ══════════════════
   * ⛔ THE SHARED "Social posts" HEADING IS GONE, so this is what replaced it — and the claim worth
   * measuring is not that the words exist (a source check says that) but that the three are the SAME
   * SIZE and that the description fits. Three copies of the markup would be three things to keep
   * level; the component renders one block and chooses by `area`, and this is where that pays. */
  const seenHeadingSizes = new Set()
  const headingOk = (r, w, tag, want) => {
    t(!!r.tabHeading && r.tabHeading.text === want,
      `🔴 ${w} ${tag}: the heading is "${want}" (saw "${r.tabHeading?.text ?? 'none'}")`)
    t(!!r.tabBlurb && r.tabBlurb.text.length > 30,
      `⚠️ ${w} ${tag}: …and it has its own description (${r.tabBlurb?.text.length ?? 0} chars)`)
    /* ⛔ THE DESCRIPTION MUST NOT RUN OFF THE PAGE. It is capped at `max-w-[46rem]`, which at 390 is
     * wider than the viewport — so this is the assertion that proves the cap yields to the column. */
    t(!!r.tabBlurb && r.tabBlurb.right <= r.innerW + 1,
      `🔴 ${w} ${tag}: …and the description stays inside the page`)
    if (r.tabHeading) seenHeadingSizes.add(`${w}:${Math.round(r.tabHeading.size)}`)
  }

  const list = await engines()
  let measured = 0
  /* 🔴 TWO RUN-LEVEL GUARDS. Each of the two claims above is skipped at widths where its premise does
   * not hold; these are what stop "skipped everywhere" from reading as "passed everywhere". */
  let sawUnequalDesc = false
  for (const eng of list) {
    if (eng.skip) { lines.push(`⚠️ ${eng.name}: SKIPPED — ${eng.skip}`); continue }
    measured++
    lines.push(`── ${eng.name} ────────────────────────────────────────────────────────────────`)

    for (const [w, h, label] of WIDTHS) {
      await eng.setViewport(w, h)

      // ── CREATE A POST ───────────────────────────────────────────────────────────────────────
      for (const ready of [true, false]) {
        const tag = ready ? 'create' : 'create-empty'
        await eng.page.goto(write(`${tag}-${w}-${eng.name}.html`, createFixture(css, { ready, open: ready })))
        const r = await eng.page.evaluate(rects)
        const L = r.boxes.find(b => b.id === 'left'), R = r.boxes.find(b => b.id === 'right')
        lines.push(`  ${w}×${h} (${label}) ${tag}  halves ${L.width}/${R.width} @ y${L.top}/${R.top} · ${r.cols} col`)

        t(r.docScrollW <= r.innerW, `🔴 ${w} ${tag}: NO HORIZONTAL PAGE SCROLL`)
        t([L, R].every(b => b.right <= r.innerW + 1), `🔴 ${w} ${tag}: both halves fit across the viewport`)
        headingOk(r, w, tag, 'Create a post')
        if (w >= SIDE_BY_SIDE) {
          /* 🔴 ONE ROW — asserted as "same top", not as two equal widths, so a later change to the
           * column ratios does not fail a claim about the ROW. */
          t(L.top === R.top, `🔴 ${w} ${tag}: the two halves are SIDE BY SIDE (one row)`)
          /* ⚠️ THE SINGLE EVENT HALF IS ON THE LEFT SINCE 10 OCTOBER 2026 — the post a truck makes most
           * often reads first. The fixture's box IDS name POSITIONS, so the claim is unchanged in shape
           * and only its words moved. */
          t(L.left < R.left, `⚠️ ${w} ${tag}: …single event on the left, weekly on the right`)
          t(r.cols === 2, `⚠️ ${w} ${tag}: …and the grid really has two tracks (${r.cols})`)
          /* ⚠️ `items-stretch` IS WHAT MAKES THEM READ AS TWO CHOICES OF ONE KIND rather than two
           * unrelated cards. Two halves of very different content lengths must come out equal. */
          t(Math.abs(L.height - R.height) <= 1,
            `🔴 ${w} ${tag}: …and the same height (${L.height}/${R.height})`)
        } else {
          t(R.top >= L.bottom, `🔴 ${w} ${tag}: the halves STACK below ${SIDE_BY_SIDE}px`)
          t(r.cols === 1, `⚠️ ${w} ${tag}: …and the grid is one track (${r.cols})`)
        }

        /* ⛔ A HEADING IS TITLE CASE. `text-transform` is the only honest test: a source string can be
         * title case and still render shouting. */
        t(r.headings.length === 2 && r.headings.every(x => x.transform === 'none'),
          `🔴 ${w} ${tag}: the box headings are title case (${r.headings.map(x => x.transform).join('/')})`)
        t(r.headings.every(x => x.size >= 16 && x.size <= 18),
          `⚠️ ${w} ${tag}: …at about 17px (${r.headings.map(x => Math.round(x.size)).join('/')})`)

        /* ⛔ ORANGE MEANS "MAKE SOMETHING" — two buttons when the designs are ready, and NONE when
         * they are not, because making something is the one thing an empty box cannot do.
         * 🔴 THE POSITIVE HALF IS ASSERTED IN THE READY BRANCH, so "only the allowed ones are orange"
         * cannot pass by measuring nothing. */
        const orange = r.buttons.filter(b => b.orange).map(b => b.id).sort()
        t(ready ? orange.join() === 'next,weekly' : orange.length === 0,
          `🔴 ${w} ${tag}: ${ready ? 'exactly the two make buttons are orange' : 'NO orange — an empty box cannot make anything'} (saw: ${orange.join(', ') || 'none'}${
            ready && orange.join() !== 'next,weekly' ? ` · all: ${r.buttons.map(b => b.bg).join(' ')}` : ''})`)

        /* 🔴 EVERY BUTTON INSIDE ITS HALF. A full-width primary with a six-word label in a half-width
         * column at 390 is the case this exists for. */
        t(r.buttons.every(b => b.right <= r.innerW + 1 && b.left >= -1),
          `🔴 ${w} ${tag}: every button is inside the viewport`)

        /* ══ 🔴 THE TWO ORANGE BUTTONS LINE UP — REPORTED BY DOMINIC, 10 OCTOBER 2026 ═══════════════
         * ⛔ THE EVENT HALF'S BUTTON SAT DIRECTLY UNDER THE CHOSEN EVENT, ABOVE "OR PICK ANOTHER", while
         * the weekly half's was pinned to the bottom of its card — so the two primary actions on the
         * screen were at two different heights. ⚠️ MEASURED RATHER THAN ASSERTED FROM THE CLASSES:
         * `mt-auto` in a flex column is exactly the kind of rule that works until something above it
         * stops growing, and only a layout engine knows. ⛔ SIDE BY SIDE ONLY — stacked, "level" has no
         * meaning. */
        if (ready && w >= SIDE_BY_SIDE) {
          const wk = r.buttons.find(b => b.id === 'weekly'), nx = r.buttons.find(b => b.id === 'next')
          t(!!wk && !!nx && Math.abs(wk.top - nx.top) <= 1,
            `🔴 ${w} ${tag}: the two make buttons are LEVEL (y${wk && Math.round(wk.top)}/${nx && Math.round(nx.top)})`)
        }

        if (ready) {
          /* ══ ⛔ THE "More events" LIST IS GONE — §5 ══════════════════════════════════════════════════
           * IT WAS A COLLAPSED `<ul>` CAPPED AT `max-h-72` WITH A "Make post" BUTTON ON EVERY ROW, and
           * this check asserted it scrolled inside its own box rather than stretching it.
           * 🔴 THE CLAIM IS GONE BECAUSE THE SHAPE IS: the three soonest events are ALWAYS visible and
           * the rest expand in place, so there is no capped scroller — and a five-row list that scrolled
           * inside itself was the wrong shape anyway.
           * ⚠️ WHAT REPLACES IT IS A CONTAINMENT CLAIM: the picker, however far it is expanded, stays
           * inside its half. ⛔ WHICH IS THE PROPERTY THAT ACTUALLY MATTERED — the old `max-h` existed to
           * stop the list pushing the button off the card, and ten rows is still ten rows. */
          /* ⚠️ THE EVENT HALF IS `L` SINCE 10 OCTOBER 2026 — the two halves swapped, and the picker and
           * the caption below belong to the EVENT one wherever it sits. ⛔ A CLAIM PINNED TO `R` WOULD
           * HAVE GONE ON PASSING while measuring the wrong box. */
          t(!!r.pickRows.length && r.pickRows.every(x => x.right <= L.right + 1 && x.left >= L.left - 1),
            `🔴 ${w} create: all ${r.pickRows.length} picker rows stay inside their half`)
          /* 🔴 AND THE **BUTTON** IS STILL ON THE CARD with the picker expanded, which is what the old
           * height cap was protecting. ⚠️ `bottom <= innerH` RATHER THAN "inside the box": the card may
           * legitimately be taller than the window and scroll; what must not happen is the one button
           * that makes a post being below the fold at the width the brief names. */
          /* ⚠️ ONLY AT THE WIDTH THE BRIEF NAMES. At 390 the card is legitimately taller than a phone
           * screen and the page scrolls — that is what a phone is. ⛔ THE CLAIM IS ABOUT THE LAPTOP
           * WINDOW, which is where "nothing needs page scrolling" is a requirement. */
          if (w >= 1100) {
            /* ══ ⛔ THE "ABOVE THE FOLD" CLAIM IS RETIRED, AND THE TRADE IS NAMED (10 October 2026) ═══
             * It asserted that "Create post for next event" was on screen at 1100×800 — which it was,
             * because it sat high in its card while the WEEKLY button sat at the foot of the other one.
             * 🔴 THE TWO BUTTONS ARE LEVEL NOW, which is what Dominic asked for, and the only place two
             * cards of different content can be level is the foot. ⚠️ SO ON A WINDOW SHORTER THAN THE
             * CARD (800px here; the real window is 1000) BOTH need a scroll — where before, ONE did.
             * ⛔ WHAT REPLACES IT IS THE CLAIM THAT STILL MATTERS: neither button is clipped by its own
             * card, and each is the last control before its caption. */
            t(r.buttons.filter(b => b.id === 'next' || b.id === 'weekly')
              .every(b => b.bottom <= (b.id === 'next' ? R : L).bottom + 1),
              `🔴 ${w} create: neither make button is clipped by its own card`)
            t(r.captions.length === 2 && r.captions.every(cap => {
              const btn = r.buttons.find(b => b.id === (cap.kind === 'week' ? 'weekly' : 'next'))
              return btn && btn.bottom <= cap.top + 1
            }), `🔴 ${w} create: …and each is the last control before its caption`)
          }
          /* ⛔ AND THE PRIVATE ROW CANNOT BE CHOSEN — `disabled`, not absent, because the row still has
           * to appear in its date position. One of the ten rows in this fixture is one. */
          t(r.pickRows.filter(x => x.disabled).length === 1,
            `⛔ ${w} create: exactly one row (the private one) cannot be chosen`)
          /* ══ 🔴 THE VENUE IS THE BIGGEST THING ON THE CARD, AND IT IS FIRST ════════════════════════
           * ⛔ IT WAS THE DATE IN 14px BOLD WITH THE VENUE THIRD IN GREY. An operator knows their events
           * by WHERE they are; the date tells them which Kings Arms one, not which event.
           * ⚠️ MEASURED ON THE **COMPUTED** FONT SIZE AND THE TOPS, because "21px and first" is a claim
           * about what is painted — a class census sees `text-[21px]` and cannot tell what order the
           * three lines ended up in. */
          t(!!r.chosen && r.chosen.venueSize >= 20 && r.chosen.venueSize <= 22,
            `🔴 ${w} create: the venue is about 21px (${r.chosen?.venueSize}px)`)
          t(!!r.chosen && r.chosen.venueTop < r.chosen.areaTop && r.chosen.areaTop < r.chosen.whenTop,
            `🔴 ${w} create: …and the order is venue, area, then date and times`)
          /* ⛔ AND THE VENUE TRUNCATES rather than wrapping under the tile and pushing the date out. */
          t(!!r.chosen && r.chosen.venueRight <= R.right + 1,
            `⚠️ ${w} create: …and a long venue name stays inside its half`)
          /* ══ 🔴 THE CAPTION BOX IS A PLAIN, EDITABLE TEXTAREA ══════════════════════════════════════
           * ⛔ IT WAS THE CHIP EDITOR — so the only caption on the card was the TEMPLATE, tokens and
           * all, and what the operator read was not what they would post. ⚠️ MEASURED FOR CONTAINMENT
           * AND FOR ITS NOTE, because five rows of text plus a two-line sentence in a half-width column
           * is the one thing on this card that can overflow. */
          t(!!r.caption && r.caption.right <= L.right + 1 && r.caption.left >= L.left - 1,
            `🔴 ${w} create: the caption box fits its half (${r.caption?.width}px in ${L.width}px)`)
          t(!!r.caption && r.caption.height >= 80,
            `⚠️ ${w} create: …and it is five rows tall, not a single line (${r.caption?.height}px)`)
          t(!!r.captionNote && r.captionNote.right <= R.right + 1,
            `⚠️ ${w} create: …and its grey note fits too`)
          /* ⚠️ AND THE GREY LINE NAMES THE IMAGE. It is the one thing a 96px thumbnail cannot show. */
          t(/^Using .+’s photo$/.test(r.imageSource.trim()),
            `⚠️ ${w} create: the grey line names the image (saw "${r.imageSource.trim()}")`)
          t(/^\d+ events · \d+ private event(s)? left out$/.test(r.weekEvents.trim()),
            `⚠️ ${w} create: …and the week line says what is left out (saw "${r.weekEvents.trim()}")`)
        }
      }

      // ── DESIGNS ─────────────────────────────────────────────────────────────────────────────
      for (const landscape of [false, true]) {
        const tag = landscape ? 'designs-landscape' : 'designs'
        await eng.page.goto(write(`${tag}-${w}-${eng.name}.html`, designsFixture(css, { landscape })))
        const r = await eng.page.evaluate(rects)
        const L = r.boxes.find(b => b.id === 'left'), R = r.boxes.find(b => b.id === 'right')
        lines.push(`  ${w}×${h} (${label}) ${tag}  boxes ${L.width}/${R.width} @ y${L.top}/${R.top}`)

        t(r.docScrollW <= r.innerW, `🔴 ${w} ${tag}: NO HORIZONTAL PAGE SCROLL`)
        t([L, R].every(b => b.right <= r.innerW + 1), `🔴 ${w} ${tag}: both boxes fit across the viewport`)
        headingOk(r, w, tag, 'Designs')
        if (w >= SIDE_BY_SIDE) {
          t(L.top === R.top, `🔴 ${w} ${tag}: the two design boxes are SIDE BY SIDE`)
          t(Math.abs(L.height - R.height) <= 1,
            `🔴 ${w} ${tag}: …and equal height, one set up and one not (${L.height} vs ${R.height})`)
        } else {
          t(R.top >= L.bottom, `🔴 ${w} ${tag}: the design boxes STACK below ${SIDE_BY_SIDE}px`)
        }
        /* ⛔ AND THE PICTURE NEVER BURSTS OUT OF ITS BOX. Reported live on 6 October: a LANDSCAPE
         * design at a fixed 220px height is 391px wide in a 200–320px column. Every design measured
         * before that day was portrait, so no fixture had ever produced one — this one can. */
        for (const [id, boxEl] of [['left', L], ['right', R]]) {
          const tl = r.tiles.find(x => x.of === id)
          t(!!tl && tl.left >= boxEl.left - 1 && tl.right <= boxEl.right + 1,
            `🔴 ${w} ${tag}: the ${id} picture is inside its box (${tl?.width}px wide in ${boxEl.width}px)`)
          /* ⛔ ASSERTED ON THE CENTRES, WITHIN 2px — not on a class. `mx-auto` on the tile alone would
           * pass a class census and still leave the BADGE against the left edge. */
          const mid = tl ? (tl.left + tl.right) / 2 : null
          t(!!tl && Math.abs(mid - (boxEl.left + boxEl.right) / 2) <= 2,
            `🔴 ${w} ${tag}: …and it is centred in its box`)
        }
        /* 🔴 THE EMPTY TILE IS THE SAME **HEIGHT** AS A FILLED ONE of the same shape — asserted as a
         * comparison between the two rendered side by side, not against a number written in here.
         * ⚠️ ONLY IN THE PORTRAIT CASE: a landscape design is genuinely shorter, which is what a
         * landscape design looks like. */
        if (!landscape) {
          t(r.tiles.length === 2 && r.tiles[0].height === r.tiles[1].height
            && r.tiles[0].width === r.tiles[1].width,
            `🔴 ${w} designs: the empty tile is the same size as a filled one (${r.tiles[1]?.width}×${r.tiles[1]?.height} vs ${r.tiles[0]?.width}×${r.tiles[0]?.height})`)
          t((r.tiles[1]?.height ?? 0) >= 120,
            `⚠️ ${w} designs: …and it is a TILE, not a thin bar (${r.tiles[1]?.height}px tall)`)
        }
        const orange = r.buttons.filter(b => b.orange).map(b => b.id).sort()
        t(orange.join() === 'left,right',
          `🔴 ${w} ${tag}: exactly the two design buttons are orange (saw: ${orange.join(', ') || 'none'})`)
      }

      // ── LOCATION SETTINGS ───────────────────────────────────────────────────────────────────
      /* ══ ⛔ THE SECOND PASS IS GONE — AND SAYING WHY IS THE POINT ══════════════════════════════════
       * IT WAS `photoSpace` (one amber line, no layout change — a pass that measured the same shape
       * twice), then `weeklyOnly` (a THIRD box under the location picture, which WAS a different shape).
       * 🔴 THE THIRD BOX IS PERMANENT NOW: three pictures, three boxes, always. So the "override open"
       * case IS the ordinary case, and a second pass would be the same shape twice again.
       * ⚠️ WHAT THE ONE PASS DRAWS IS THE HARDER MIX — one FILLED box and two EMPTY — because that is
       * where an unequal height shows and where the borrow link belongs. */
      /* ══ 🔴 §1 · TWO PASSES: THE MIXED STATE AND THE ONE DOMINIC WAS LOOKING AT ════════════════════
       * ⛔ A SECOND PASS IS ONLY WORTH ITS COST WHEN IT DRAWS A DIFFERENT SHAPE. One filled box beside
       * two empty ones and three filled boxes ARE different shapes, and the operator's report —
       * *"music festival has photos uploaded but the pictures are wider than the box they're in"* —
       * was about the second one, which this file had never drawn. ⚠️ THE MIXED RUN IS WHERE THE
       * FOOTER'S FIXED HEIGHT EARNS ITS KEEP; THE FILLED RUN IS WHERE THREE PICTURES MUST LINE UP.
       * ⛔ `longNameRun` IS GONE WITH THE FILE NAME ITSELF. */
      for (const allFilledRun of [false, true]) {
        const tag = allFilledRun ? 'locations-filled' : 'locations'
        await eng.page.goto(write(`${tag}-${w}-${eng.name}.html`, locationsFixture(css, { allFilled: allFilledRun })))
        const r = await eng.page.evaluate(rects)
        const T = r.boxes.find(b => b.id === 'table'), P = r.boxes.find(b => b.id === 'pane')
        lines.push(`  ${w}×${h} (${label}) ${tag}  table ${T.width} pane ${P.width} @ y${T.top}/${P.top} · list ${r.locTable?.clientH}px of ${r.locTable?.scrollH}px`)

        t(r.docScrollW <= r.innerW, `🔴 ${w} ${tag}: NO HORIZONTAL PAGE SCROLL`)
        t([T, P].every(b => b.right <= r.innerW + 1), `🔴 ${w} ${tag}: table and pane fit across the viewport`)
        headingOk(r, w, tag, 'Location settings')
        if (w >= SIDE_BY_SIDE) {
          t(T.top === P.top, `🔴 ${w} ${tag}: the table and the pane are SIDE BY SIDE`)
          t(T.left < P.left, `⚠️ ${w} ${tag}: …table left, selected location right`)
          /* ══ 🔴 THE TABLE IS ABOUT A QUARTER TO A THIRD — THE BRIEF'S OWN RANGE ═══════════════════
           * ⛔ IT WAS TWO THIRDS: `minmax(0,1fr) minmax(280px,420px)` gave the table everything the
           * pane did not, which at 1440 is two thirds of the page for three columns, two of which are
           * 24px wide. The pane is where the work happens.
           * ⚠️ MEASURED AS A **SHARE OF THE ROW**, not as a pixel width, so it holds at 1100 and 1728
           * alike — which is what makes `minmax(280px,1fr) minmax(0,2.6fr)` a ratio rather than a
           * guess. The 280px floor means the share rises below ~1100, which is why the floor of the
           * range is checked at 1100 and not above it. */
          const share = T.width / (T.width + P.width)
          t(share >= 0.24 && share <= 0.36,
            `🔴 ${w} ${tag}: the table takes a quarter to a third of the row (${(share * 100).toFixed(1)}%)`)
          /* ══ ⚠️ `items-start`, NOT `items-stretch` — AND THE FIRST VERSION OF THIS CLAIM WAS WRONG ══
           * ⛔ IT ASSERTED `P.height < T.height` — "the pane is shorter" — AND THE MEASUREMENT REFUSED
           * IT: 619 vs 611. The pane is genuinely the TALLER of the two here, because the table is
           * capped at `max-h-[30rem]` and the pane carries two slot boxes and a name field. Which is
           * correct behaviour and has nothing to do with stretching.
           * 🔴 THE REAL CLAIM IS THAT NEITHER IS FORCED TO THE OTHER'S HEIGHT, and the honest test is
           * that they are NOT equal — with `items-stretch` they would be exactly equal, whatever their
           * content. The control below substitutes `items-stretch` and asserts this measurement
           * notices, so "not equal" is a measurement and not a coincidence. */
          t(P.height !== T.height,
            `⚠️ ${w} ${tag}: …and neither column is stretched to the other's height (pane ${P.height}, table ${T.height})`)
        } else {
          t(P.top >= T.bottom, `🔴 ${w} ${tag}: the pane STACKS under the table below ${SIDE_BY_SIDE}px`)
        }

        /* ══ 🔴 THE LIST SCROLLS **INSIDE ITS CARD** ════════════════════════════════════════════
         * ⛔ THIS IS THE ONE CLAIM ON THIS SCREEN THAT A WRONG CLASS SILENTLY BREAKS: without a cap,
         * sixty locations grow the card, the page grows with it, and the selected location's pane is
         * off the bottom of the screen — the one thing a two-pane screen must not do.
         * 🔴 TWO HALVES: there is more content than box, AND the card is shorter than the viewport. A
         * container that had simply grown would also have `scrollHeight` content. */
        t(!!r.locTable && r.locTable.scrollH > r.locTable.clientH + 50,
          `🔴 ${w} ${tag}: the location list SCROLLS inside itself (${r.locTable?.scrollH}px of rows in ${r.locTable?.clientH}px)`)
        t(T.height <= r.innerH + 1,
          `🔴 ${w} ${tag}: …and the card itself fits the window (${T.height} ≤ ${r.innerH}) — the PAGE does not grow`)

        /* ⚠️ EVERY ROW THE SAME HEIGHT — the thing a wrapping row destroys in a table. ⛔ WITHIN 1px,
         * not exactly: `divide-y` puts a 1px border on every row but the last, so an exact-equality
         * test fails on correct markup. A wrapped row is twice the height, nowhere near the tolerance. */
        const hs = [...new Set(r.locRows.map(x => x.height))]
        t(r.locRows.length > 0 && Math.max(...hs) - Math.min(...hs) <= 1,
          `🔴 ${w} ${tag}: every table row is the same height (${hs.join('/')})`)
        /* ⛔ AND NO ROW IS WIDER THAN ITS CARD. `table-fixed` plus a declared width on the two slot
         * columns is what makes a 34-character venue name truncate inside its own cell instead of
         * widening the table — which at 390 is the difference between a page that scrolls sideways and
         * one that does not. */
        t(r.locRows.every(x => x.right <= T.right + 1),
          `🔴 ${w} ${tag}: …and no row is wider than its card`)

        /* ⚠️ THE THREE CHIPS ARE ON SCREEN AND ON ONE ROW AT 1100. At 390 they may wrap, which is what
         * `flex-wrap` is for — what must not happen is one going off the edge. */
        t(r.chips.length === 3 && r.chips.every(c2 => c2.right <= T.right + 1),
          `⚠️ ${w} ${tag}: the three filter chips are inside the card`)
        /* ⛔ THE TWO SLOT BOXES ARE INSIDE THE PANE, and neither overflows it — the EVENT one carries a
         * long shape-refusal sentence in the poster case, which is the one that would. */

        /* ══ 🔴 THREE BOXES, EQUAL SIZE, SIDE BY SIDE FROM 900px ══════════════════════════════════════
         * ⛔ IT WAS TWO COLUMNS WITH THE OVERRIDE STACKED UNDER ONE OF THEM, which made the third
         * picture visibly subordinate to the second — and it was, under that model. With a picture per
         * surface there is no hierarchy left to draw, so they are three equal boxes.
         * 🔴 MEASURED FROM THE TOPS **AND** FROM THE COMPUTED TRACK COUNT. Equal tops alone would also
         * be true of one row of one box; three tracks alone would be true of a grid whose third item
         * had wrapped. The control below strips the rule and asserts this notices.
         * ⚠️ 900, NOT 640: three across needs half again as much room as two did, and 640 ÷ 3 is 200px
         * per box with a 12px gap. */
        const WK = r.pictureBoxes.find(b => b.id === 'weekly')
        const EV = r.pictureBoxes.find(b => b.id === 'event-photo')
        const PO = r.pictureBoxes.find(b => b.id === 'event')
        /* ══ 🔴 §3 (10 October 2026) · THE THREE **BOXES** EXIST ONLY FROM 768px UP ══════════════════
         * ⛔ BELOW THAT THEY ARE `display: none` AND THE PHONE **CARDS** ARE WHAT IS THERE — which is
         * why this claim and the two below it are guarded now, and why the first run after §3 reported
         * three previews "0px" high. ⚠️ A `display:none` ELEMENT STILL ANSWERS `querySelectorAll`, so an
         * unguarded measurement does not fail loudly: it measures zero and compares zeros. The guard is
         * what makes the phone's own claims (further down) the ones that have to hold there. */
        if (w >= 768) {
          t(r.pictureBoxes.length === 3
            && r.pictureBoxes.every(b => b.right <= P.right + 1 && b.left >= P.left - 1),
            `🔴 ${w} ${tag}: all three picture boxes are inside the pane`)
        }
        if (w >= 900) {
          /* ⚠️ EVENT · WEEKLY · POSTER SINCE 10 OCTOBER 2026 — the pane's boxes and the table's columns
           * moved together, so "the table's column order" is still the claim and the order it names has
           * changed. */
          t(!!WK && !!EV && !!PO
            && WK.top === EV.top && EV.top === PO.top
            && EV.left < WK.left && WK.left < PO.left
            && r.locBoxCols === 3,
            `🔴 ${w} ${tag}: the three boxes are SIDE BY SIDE, in the table's column order (${r.locBoxCols} tracks)`)
          /* ⚠️ AND ALL THREE ARE THE SAME WIDTH **AND THE SAME HEIGHT**, which is the brief's "equal
           * size" and is what `items-stretch` buys. ⛔ THE HEIGHT IS THE HALF THAT COULD GO WRONG: the
           * fixture draws one FILLED and two EMPTY, and a filled box has a file name and a Remove
           * button that the empty ones do not. */
          const ws = [WK.width, EV.width, PO.width]
          const hs = [WK.height, EV.height, PO.height]
          t(Math.max(...ws) - Math.min(...ws) <= 1,
            `⚠️ ${w} ${tag}: …and all three are the same width (${ws.join('/')})`)
          t(Math.max(...hs) - Math.min(...hs) <= 1,
            `🔴 ${w} ${tag}: …and the same HEIGHT, filled or empty (${hs.join('/')})`)
        } else if (w >= 768) {
          /* ⚠️ STACKED, IN THE SAME ORDER THEY SIT IN ACROSS — event, weekly, poster (10 October 2026).
           * ⚠️ 768–899 ONLY SINCE §3: below 768 there are no boxes to stack. */
          t(!!WK && !!EV && !!PO && WK.top >= EV.bottom && PO.top >= WK.bottom && r.locBoxCols === 1,
            `🔴 ${w} ${tag}: the three boxes STACK between 768 and 900 (${r.locBoxCols} track)`)
        }

        /* ══ 🔴 §1 · THE THREE BOXES LINE UP **ROW BY ROW**, NOT JUST EDGE TO EDGE ═══════════════════
         * ⛔ THIS IS THE CHECK THE BRIEF ASKS FOR AND IT IS NOT "the boxes are the same height".
         * `items-stretch` already gave us that, and the contents still started at six different heights
         * because the three descriptions wrap to one, two and two lines. 🔴 THE CLAIM IS THAT **EVERY
         * ROW STARTS AT THE SAME y IN ALL THREE** — title, description, preview, footer.
         * ⚠️ MEASURED IN WEBKIT AS WELL AS CHROMIUM, which is the half that matters: `grid-template-rows:
         * subgrid` is the mechanism, Safari has had it since 16.0, and "it should work" is not a check.
         * ⛔ AND THE DESCRIPTIONS REALLY DO DIFFER IN HEIGHT HERE — asserted first, or this would pass on
         * a fixture where there was nothing to line up. */
        if (w >= 900) {
          const rows = r.boxRows
          const descH = rows.map(b => b.descLines)
          /* ══ ⚠️ THE PREMISE IS A **PRECONDITION**, NOT A CLAIM THAT HOLDS AT EVERY WIDTH ════════════
           * ⛔ IT WAS ASSERTED UNCONDITIONALLY AND FAILED THE DAY 1280 JOINED THE SET — correctly: at
           * 1280 the three descriptions all wrap to two lines, so there is nothing for subgrid to line
           * up and the alignment below would pass on any layout at all. 🔴 SO THE ALIGNMENT CLAIMS RUN
           * ONLY WHERE THE PREMISE HOLDS, and `sawUnequalDesc` makes sure that is somewhere: a run in
           * which no width ever differed would leave subgrid untested, which is the failure this guard
           * exists to prevent. */
          const unequal = rows.length === 3 && new Set(descH).size > 1
          if (unequal) sawUnequalDesc = true
          else lines.push(`  ⚠️ ${w} ${tag}: the three descriptions happen to wrap the same (${descH.join('/')}) — alignment not measurable here`)
          for (const i of unequal ? [0, 1, 2, 3] : []) {
            const tops = rows.map(b => b.tops[i]).filter(v => Number.isFinite(v))
            const name = ['title', 'description', 'preview', 'footer'][i]
            t(tops.length === 3 && Math.max(...tops) - Math.min(...tops) <= 1,
              `🔴 ${w} ${tag}: every box's ${name} starts at the same height (${tops.join('/')})`)
          }
          /* ⚠️ AND THEY END TOGETHER TOO, which follows from the rows but is what an operator sees.
           * ⛔ THIS ONE IS TRUE AT EVERY WIDTH — equal heights do not need unequal descriptions. */
          const bottoms = rows.map(b => b.bottom)
          t(Math.max(...bottoms) - Math.min(...bottoms) <= 1,
            `⚠️ ${w} ${tag}: …and all three end at the same height (${bottoms.join('/')})`)
        }

        /* ══ 🔴 §1 (10 October 2026) · NOTHING IN A PICTURE BOX IS DRAWN OUTSIDE IT ════════════════════
         * ⛔ DOMINIC, TWICE. First: *"with a long file name the picture and file name overflow their box
         * and push the Remove button out of sight, so there is no way to remove a picture."* Then, after
         * the first fix, on a location that actually had pictures in it: *"the pictures are wider than
         * the box they're in. the remove button is not in the box either."* With no way to press Remove,
         * a picture on the wrong location is permanent from the UI.
         * 🔴 THE CLAIMS ARE NOW ABSOLUTE AND RUN IN BOTH PASSES, because the file name is gone and with
         * it the only thing in the box that ever asked for more width than the box had. */
        if (w >= 900) {
          const boxes = r.pictureBoxes
          const inBox = (el) => boxes.some(b => el.left >= b.left - 1 && el.right <= b.right + 1)
          t(r.fileNameCount === 0,
            `🔴 ${w} ${tag}: no file name is shown in a picture box (saw ${r.fileNameCount})`)
          t(r.removeBtns.length > 0 && r.removeBtns.every(inBox),
            `🔴 ${w} ${tag}: every Remove button is INSIDE its box (${r.removeBtns.map(b => Math.round(b.right)).join('/')} vs ${boxes.map(b => Math.round(b.right)).join('/')})`)
          t(r.previewImgs.length > 0 && r.previewImgs.every(inBox),
            `🔴 ${w} ${tag}: …and every picture stays inside its box too (${r.previewImgs.length} shown)`)
          t(r.docScrollW <= r.innerW,
            `🔴 ${w} ${tag}: …and the page does not scroll sideways`)

          /* ══ 🔴 §1 · AND THE THING THE OPERATOR ASKED FOR IN SO MANY WORDS ═══════════════════════════
           * ⛔ *"when the images are empty in location settings, make sure the upload box lines up — it
           * sits below the text, which has different lengths. Best to move the upload box to the bottom
           * so they line up."* And: *"the same when they are uploaded — the images should line up."*
           * 🔴 SO BOTH ARE MEASURED, IN BOTH PASSES: every Upload label at the same y, and every preview
           * area at the same y, whatever mix of filled and empty boxes the pane is showing. */
          const upTops = r.uploadBtns.map(u => u.top)
          if (upTops.length > 1) {
            t(Math.max(...upTops) - Math.min(...upTops) <= 1,
              `🔴 ${w} ${tag}: every Upload box sits at the same height (${upTops.join('/')})`)
          }
          const dropTops = r.dropAreas.map(d => d.top)
          t(r.dropAreas.length === 3 && Math.max(...dropTops) - Math.min(...dropTops) <= 1,
            `🔴 ${w} ${tag}: all three picture areas sit at the same height, filled or empty (${dropTops.join('/')})`)
        }

        /* ══ 🔴 THE PREVIEW IS THE SAME HEIGHT IN ALL THREE, AND IT SHOWS THE PICTURE WHOLE ═══════════
         * ⛔ `SlotBox`'s 70px TILE USED `object-cover`, WHICH CROPS — a wide logo appeared as its middle
         * third, so an operator checking they had uploaded the right file was shown something that was
         * not quite it. ⚠️ ONE HEIGHT IS ALSO WHAT MAKES THE BOXES EQUAL, which is why it is measured
         * here rather than taken on trust from the class. */
        if (w >= 768) {
          const ph = [...new Set(r.dropAreas.map(d => d.height))]
          t(r.dropAreas.length === 3 && ph.length === 1 && ph[0] >= 120,
            `🔴 ${w} ${tag}: all three previews are the same height (${ph.join('/')}px)`)
        }

        /* ══ 🔴 §3 (10 October 2026) · ONE LAYOUT OR THE OTHER, NEVER BOTH, NEVER NEITHER ════════════
         *
         * ⛔ **THIS IS THE CLAIM THE ARRANGEMENT RESTS ON.** Both the compact cards and the three boxes
         * are in the tree at every width; CSS decides. So the thing that can go wrong is not a
         * rectangle — it is `display`, and two of them showing at once would put six picture controls on
         * one screen while two of them doing nothing would leave none.
         * 🔴 768px IS THE LINE, AND IT IS THE BRIEF'S. ⚠️ 768–899 KEEPS THE BOXES, stacked — *"tablet
         * (768px and up) stay exactly as they are"* — which is why this is not the 900px the two-pane
         * grid uses. The two numbers are different on purpose. */
        t(!!r.phoneCardList && !!r.boxesWrap
          && r.phoneCardList.shown === (w < 768) && r.boxesWrap.shown === (w >= 768),
          `🔴 ${w} ${tag}: ${w < 768 ? 'the compact cards' : 'the three boxes'} are what is shown, and only one of the two`)
        if (w < 768) {
          /* ⚠️ THREE CARDS, IN THE BRIEF'S ORDER — event photo, weekly, poster — the same order as the
           * boxes, so the two layouts cannot teach an operator two different orders. */
          t(r.phoneCards.length === 3
            && r.phoneCards.map(c => c.id).join(',') === 'event-photo,weekly,event',
            `🔴 ${w} ${tag}: three cards, event · weekly · poster (${r.phoneCards.map(c => c.id).join(' · ')})`)
          /* 🔴 72px, THE BRIEF'S NUMBER, AND SQUARE. ⚠️ Measured rather than read off a class: a thumb
           * squeezed by a long title would still carry `h-[72px] w-[72px]` and be 48px wide. */
          const sq = r.phoneThumbs.every(th => th.width === 72 && th.height === 72)
          t(r.phoneThumbs.length === 3 && sq,
            `🔴 ${w} ${tag}: …each with a 72px square thumbnail (${r.phoneThumbs.map(th => `${th.width}×${th.height}`).join(' ')})`)
          /* ⛔ AND EVERY CARD IS INSIDE THE PANE. A 72px thumb plus a title plus a button is the one
           * row on this screen that could overflow a 358px column. */
          t(r.phoneCards.every(c => c.left >= P.left - 1 && c.right <= P.right + 1),
            `🔴 ${w} ${tag}: …and every card fits the pane`)
          t(r.docScrollW <= r.innerW, `🔴 ${w} ${tag}: …and the page does not scroll sideways`)
        }

        /* ══ 🔴 THE BORROW LINK IS OFFERED ONLY WHERE IT MEANS SOMETHING ══════════════════════════════
         * ⚠️ THE FIXTURE'S WEEKLY BOX IS EMPTY AND ITS EVENT BOX IS FILLED, which is the one state the
         * link exists for: with both empty there is nothing to point at, and with this one full it would
         * be a replace dressed up as a shortcut. ⛔ AND THE POSTER IS OFFERED NOTHING — it is held to the
         * standard design's shape to within 1%, so a link pointing it at a logo would be offering an
         * upload that is about to be refused. */
        /* ⚠️ GUARDED BY THE RUN: with all three boxes filled there is nothing to borrow and no link to
         * find, so asserting one would be demanding a shape the screen correctly does not have. */
        if (!allFilledRun) {
          t(r.borrows.length === 1 && /event post picture/.test(r.borrows[0].text)
            && r.borrows[0].right <= P.right + 1,
            `🔴 ${w} ${tag}: exactly one box offers the other's picture, and it fits the pane`)
          /* ⚠️ AND IT IS OUT OF THE FLOW, which is the fix for the 11px the Upload claim caught: only
           * one box is ever offered a borrow, so a link in the centred stack made that box's Upload
           * button sit higher than the other two. */
          t(r.borrows[0]?.position === 'absolute',
            `🔴 ${w} ${tag}: …and it is pinned to the foot of the area, not in Upload's stack (${r.borrows[0]?.position})`)
        } else {
          t(r.borrows.length === 0, `⚠️ ${w} ${tag}: a filled box offers nothing to borrow`)
        }

        /* ⚠️ A FILLED BOX HAS **Remove AND NOTHING ELSE** in its footer. "Replace" was a second button
         * that did what dropping a new file does — two presses for one outcome, on the box with the
         * least room — and the file name went on 10 October at the operator's request. */
        t(r.removeBtns.length === (allFilledRun ? 3 : 1),
          `⚠️ ${w} ${tag}: one Remove per filled box and nothing beside it (${r.removeBtns.length})`)

        /* ══ 🔴 "Name on posts" IS GONE AND THE GREY NOTE IS WHAT STANDS THERE ═══════════════════════
         * ⚠️ MEASURED RATHER THAN MERELY ASSERTED PRESENT: it names a four-step path, which makes it
         * the longest unbroken run of words in the pane and the one thing here that could overflow a
         * 358px phone column. ⛔ AND THE PANE HAS NO NAME INPUT LEFT — the tag field is the only one. */
        t(!!r.nameNote && /Tidy up places/.test(r.nameNote.text)
          && r.nameNote.right <= P.right + 1 && r.nameNote.left >= P.left - 1,
          `🔴 ${w} ${tag}: the "name comes from your schedule" note fits the pane`)

        /* ══ 🔴 THE NAME WRAPS TO AT MOST TWO LINES, AND THE ROWS STAY THE SAME SHAPE ═════════════════
         * ⛔ IT WAS `truncate`: "The Kings Arms at Great Finborough" became "The Kings Arms at Great
         * Fi…" in a 200px column, so the one thing the row exists to identify was the thing it could
         * not show. 🔴 `line-clamp-2` KEEPS BOTH PROMISES — readable, and still bounded. ⚠️ MEASURED AS
         * "at most two line-heights", because that is the claim; a class census sees `line-clamp-2` and
         * cannot tell whether the cell actually honoured it. */
        t(r.locNames.length > 0 && r.locNames.every(n => n.lines <= 2),
          `🔴 ${w} ${tag}: every location name is at most two lines (saw ${[...new Set(r.locNames.map(n => n.lines))].join('/')})`)
        /* ⛔ AND THE TICK COLUMNS ARE ALL THE SAME WIDTH, which is what `table-fixed` plus a declared
         * 44px buys — one wider column would unalign every row's ticks from the header above them. */
        const tcw = [...new Set(r.tickCells)]
        t(r.tickCells.length > 0 && tcw.length === 1,
          `🔴 ${w} ${tag}: every tick column is the same width (${tcw.join('/')})`)

        /* ⛔ AND THERE IS NO ORANGE ANYWHERE ON THIS SCREEN. It is MANAGEMENT: no post is made from it,
         * so nothing on it "makes something". A Create post button here would be the "Post for a place"
         * box all over again. */
        t(r.buttons.filter(b => b.orange).length === 0,
          `🔴 ${w} ${tag}: NO orange button on Location settings — it is management, not making`)

        if (w === 1100 || w === 390) {
          await eng.shot(path.join(shots, `${tag}-${w}-${eng.name.toLowerCase()}.png`))
        }
      }

      if (w === 1100 || w === 390) {
        await eng.page.goto(write(`shot-create-${w}-${eng.name}.html`, createFixture(css, { open: true })))
        await eng.shot(path.join(shots, `create-a-post-${w}-${eng.name.toLowerCase()}.png`))
        await eng.page.goto(write(`shot-create-empty-${w}-${eng.name}.html`, createFixture(css, { ready: false })))
        await eng.shot(path.join(shots, `create-a-post-empty-${w}-${eng.name.toLowerCase()}.png`))
        await eng.page.goto(write(`shot-designs-${w}-${eng.name}.html`, designsFixture(css)))
        await eng.shot(path.join(shots, `designs-${w}-${eng.name.toLowerCase()}.png`))
      }
    }

    /* ══ 🔴 DESIGNS' BOXES ARE THE SAME WIDTH AS CREATE A POST'S HALVES (§9) ════════════════════════
     * ⛔ THEY WERE NOT, AND THAT IS WHY THIS EXISTS. Create a post was two equal halves across the full
     * content width; Designs was two narrow columns plus an empty third track left over from the box
     * that used to sit in it. So the two screens one click apart laid their boxes out at different
     * widths, and the pictures in the narrower one were smaller for no reason anybody could name.
     * 🔴 ASSERTED AS A **COMPARISON BETWEEN TWO RENDERS**, which is the only way to say "the same": a
     * source check can see one shared constant and still be wrong about what the layout engine does
     * with it on two different pages. */
    for (const [w, h] of [[1100, 800]]) {
      await eng.setViewport(w, h)
      await eng.page.goto(write(`cmp-create-${w}-${eng.name}.html`, createFixture(css)))
      const a = await eng.page.evaluate(rects)
      await eng.page.goto(write(`cmp-designs-${w}-${eng.name}.html`, designsFixture(css)))
      const b = await eng.page.evaluate(rects)
      const aL = a.boxes.find(x => x.id === 'left'), aR = a.boxes.find(x => x.id === 'right')
      const bL = b.boxes.find(x => x.id === 'left'), bR = b.boxes.find(x => x.id === 'right')
      lines.push(`  ${w} compare  create ${aL.width}/${aR.width} · designs ${bL.width}/${bR.width}`)
      t(aL.width === bL.width && aR.width === bR.width,
        `🔴 ${w}: Designs' boxes are the SAME WIDTH as Create a post's halves (${aL.width}/${aR.width} vs ${bL.width}/${bR.width})`)
      /* ⚠️ AND THEY START AND END IN THE SAME PLACE, so switching pill does not shift the page. */
      t(aL.left === bL.left && aR.right === bR.right,
        `⚠️ ${w}: …and in the same position, so switching pill does not shift the page`)
      /* ⛔ AND BOTH ARE TWO EQUAL HALVES, not two boxes that happen to match at this width. */
      t(Math.abs(aL.width - aR.width) <= 1 && Math.abs(bL.width - bR.width) <= 1,
        `⚠️ ${w}: …and each pair is two EQUAL halves`)
    }

    /* ⚠️ THE THREE HEADINGS ARE THE SAME SIZE AT EACH WIDTH — one entry per width in the set, not
     * three. ⛔ A SET WITH MORE ENTRIES THAN WIDTHS means two screens render their heading at
     * different sizes, which is exactly what three copies of the markup would eventually produce. */
    t(sawUnequalDesc,
      '🔴 the alignment was measured somewhere — at least one width had three different description heights')
    t(seenHeadingSizes.size === WIDTHS.length,
      `🔴 the three tabs' headings are the same size at each width (saw ${[...seenHeadingSizes].join(', ')})`)

    // ══ THE CONTROLS ═══════════════════════════════════════════════════════════════════════════
    //
    // ⛔ EACH ONE REMOVES THE SINGLE RULE ITS CLAIM RESTS ON AND ASSERTS THE MEASUREMENT NOTICES. A
    // fixture that can only draw the expected shape proves nothing: this project has shipped a check
    // that could only draw the passing case and reported green for a day.
    {
      await eng.setViewport(1100, 800)
      await eng.page.goto(write(`ctl-create-${eng.name}.html`, createFixture(css, { oneCol: true })))
      const c1 = await eng.page.evaluate(rects)
      const L = c1.boxes.find(b => b.id === 'left'), R = c1.boxes.find(b => b.id === 'right')
      t(R.top >= L.bottom,
        '🔴 CONTROL: with the two-column rule removed, Create a post STACKS at 1100 — so "side by side" is a measurement')

      /* ⛔ THE LEVELNESS CONTROL — it RESTORES THE OLD ARRANGEMENT rather than deleting a class. See
       * `createFixture`'s own note: stripping `mt-auto` changes nothing, because with the ten-row
       * picker the event half is the taller one and the foot is where its button would land anyway. */
      await eng.page.goto(write(`ctl-level-${eng.name}.html`, createFixture(css, { open: true, buttonAbovePicker: true })))
      const cLvl = await eng.page.evaluate(rects)
      const cw = cLvl.buttons.find(b => b.id === 'weekly'), cn = cLvl.buttons.find(b => b.id === 'next')
      t(!!cw && !!cn && Math.abs(cw.top - cn.top) > 1,
        `🔴 CONTROL: with the button back above the picker the two are NOT level (y${Math.round(cw.top)}/${Math.round(cn.top)}) — so "LEVEL" is a measurement`)

      await eng.page.goto(write(`ctl-locs-${eng.name}.html`, locationsFixture(css, { oneCol: true })))
      const c2 = await eng.page.evaluate(rects)
      const T = c2.boxes.find(b => b.id === 'table'), P = c2.boxes.find(b => b.id === 'pane')
      t(P.top >= T.bottom,
        '🔴 CONTROL: with its grid removed, Location settings stacks at 1100 — so the two-pane claim is a measurement')

      /* ⛔ THE SCROLLER'S CONTROL. Without it, "the list scrolls inside" would pass on a card that had
       * no height cap at all — sixty rows still overflow *something*. With the cap removed the CARD
       * grows past the window, which is the failure the assertion is about. */
      /* ⛔ THE `items-start` CONTROL. With `items-stretch` substituted, the two columns are forced to
       * exactly the same height — which is what the claim above exists to rule out, and what a class
       * census could never tell apart from `items-start`. */
      await eng.page.goto(write(`ctl-stretch-${eng.name}.html`,
        locationsFixture(css).replace('items-start', 'items-stretch')))
      const c4 = await eng.page.evaluate(rects)
      const T4 = c4.boxes.find(b => b.id === 'table'), P4 = c4.boxes.find(b => b.id === 'pane')
      t(T4.height === P4.height,
        `🔴 CONTROL: with \`items-stretch\` substituted, the two columns ARE forced equal (${T4.height} = ${P4.height}) — so "not stretched" is a measurement`)

      /* ⛔ THE PAIR'S OWN CONTROL. Without it, "the poster and the picture are side by side" would be a
       * claim about a fixture that could not have drawn anything else — the pane is 763px at 1100 and
       * two boxes would fit across it by accident in several arrangements. With the two-column rule
       * stripped off `data-loc-boxes` the pair must STACK, and the measurement must notice. */
      await eng.page.goto(write(`ctl-locboxes-${eng.name}.html`, locationsFixture(css, { boxesOneCol: true })))
      const c5 = await eng.page.evaluate(rects)
      const b5w = c5.pictureBoxes.find(b => b.id === 'weekly')
      const b5e = c5.pictureBoxes.find(b => b.id === 'event-photo')
      t(!!b5w && !!b5e && b5w.top >= b5e.bottom && c5.locBoxCols === 1,
        `🔴 CONTROL: with its three-column rule removed, the picture boxes STACK at 1100 (${c5.locBoxCols} track) — so "side by side" is a measurement`)

      /* ══ 🔴 §1's TWO CONTROLS — AND THEY RESTORE THE FAILING SHAPE RATHER THAN DELETING A CLASS ════
       * ⛔ THE LESSON WAS LEARNT THE OTHER WAY ROUND IN THIS FILE: a control that stripped `mt-auto`
       * changed nothing, because the taller box's footer was already at the foot. These two take away
       * the one rule each claim rests on, and the measurement must notice. */
      await eng.page.goto(write(`ctl-nogrow-${eng.name}.html`, locationsFixture(css, { noGrow: true })))
      const c6 = await eng.page.evaluate(rects)
      const t6 = c6.dropAreas.map(d => d.top)
      t(Math.max(...t6) - Math.min(...t6) > 1,
        `🔴 CONTROL: with \`grow\` off the description, the three picture areas sit at different heights (${t6.join('/')}) — so "they line up" is a measurement`)
      const u6 = c6.uploadBtns.map(u => u.top)
      t(u6.length > 1 && Math.max(...u6) - Math.min(...u6) > 1,
        `🔴 CONTROL: …and so do the Upload boxes (${u6.join('/')}) — which is the shape Dominic reported`)

      /* ⚠️ THE SECOND CONTROL IS THE MIXED RUN'S ONE: an empty footer collapses, so bottom-aligned
       * previews part company between a filled box and an empty one. ⛔ THIS IS THE BUG THE FIXED
       * HEIGHT EXISTS FOR, and without the control the height would be a line of CSS nobody had tested. */
      await eng.page.goto(write(`ctl-nofooterh-${eng.name}.html`, locationsFixture(css, { noFooterH: true })))
      const c7 = await eng.page.evaluate(rects)
      const t7 = c7.dropAreas.map(d => d.top)
      t(Math.max(...t7) - Math.min(...t7) > 1,
        `🔴 CONTROL: with the footer's fixed height removed, a filled box's picture area sits away from the empty ones' (${t7.join('/')}) — so the height is load-bearing`)

      await eng.page.goto(write(`ctl-nocap-${eng.name}.html`, locationsFixture(css, { noCap: true })))
      const c3 = await eng.page.evaluate(rects)
      const T3 = c3.boxes.find(b => b.id === 'table')
      t(T3.height > c3.innerH,
        `🔴 CONTROL: with the list's height cap removed, the card outgrows the window (${T3.height} > ${c3.innerH}) — so the scroll claim is a measurement`)
    }

    await eng.close()
  }

  if (!measured) {
    lines.push('🔴 NO ENGINE RAN — nothing was measured. Install puppeteer and/or playwright.')
    fails++
  }
  console.log(lines.join('\n'))
  console.log('')
  console.log(fails === 0
    ? `✅ every measurement passed, in ${measured} engine(s) — shots in docs/screenshots/social-tab/`
    : `🔴 ${fails} MEASUREMENT(S) FAILED`)
  return fails
}

measure().then(n => process.exit(n ? 1 : 0)).catch(e => {
  console.error('🔴 ' + e.message)
  process.exit(1)
})
