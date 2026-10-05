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
const SOCIAL = read('components/manage/SocialPosts.tsx')
const COPY = read('lib/copy/socialPosts.ts')

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

/* 🔴 A REAL SUFFOLK PUB NAME, 34 CHARACTERS. The boxes are a third of the page wide; what crowds them
 * is a venue name, not lorem. */
const LONG_NAME = 'The Kings Arms at Great Finborough'

/**
 * ══ 🔴 SOCIAL POSTS — EITHER AREA ════════════════════════════════════════════════════════════════
 *
 * @param area    'posts' (Make a post) or 'designs'.
 * @param rows    how many rows the two list boxes hold. 20 is a truck with a full address book, which
 *                is the case that decides whether a list scrolls inside its box or stretches it.
 * @param oneCol  the CONTROL: the grid removed, so 1440 must stack. Without it the side-by-side
 *                assertions would pass on a page that never had three columns.
 */
function socialFixture(css, { area = 'posts', rows = 20, oneCol = false } = {}) {
  const makeGrid = lift(SOCIAL, /<div className="(grid grid-cols-1 items-stretch gap-3 min-\[900px\]:grid-cols-3)" data-make-boxes>/, 'the Make a post grid')
  const designGrid = lift(SOCIAL, /<div className="(grid grid-cols-1 items-stretch gap-3 min-\[900px\]:grid-cols-\[minmax\(200px,320px\)_minmax\(200px,320px\)_minmax\(0,1fr\)\])"/, 'the Designs grid')
  const boxCard = lift(SOCIAL, /<Card className=\{`(flex min-w-0 flex-col p-4) \$\{className\}`\}>/, 'a box')
  const boxBody = lift(SOCIAL, /<div className="(mt-3 flex min-h-0 min-w-0 flex-1 flex-col)">\{children\}<\/div>/, "a box's body")
  const boxHeading = lift(SOCIAL, /const BOX_HEADING = '([^']+)'/, 'the box heading')
  const boxBlurb = lift(SOCIAL, /const BOX_BLURB = '([^']+)'/, 'the box blurb')
  const btnPrimary = lift(SOCIAL, /const BTN_PRIMARY =\n\s*'([^']+)'/, 'the primary button')
  const btnOutline = lift(SOCIAL, /const BTN_OUTLINE =\n\s*'([^']+)'/, 'the outlined button')
  const listUl = lift(SOCIAL, /<ul className="(mt-2 max-h-72 min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto)"\n\s*data-upcoming-list>/, 'the upcoming list')
  const seg = lift(SOCIAL, /data-social-area\n\s*className="([^"]+)"/, 'the segmented control')
  const segBtn = lift(SOCIAL, /className=\{`(rounded-lg px-3 py-1\.5 text-sm font-semibold transition-colors) \$\{area === k/, 'a segment')
  const segOn = lift(SOCIAL, /\? '(bg-white text-slate-900 shadow-sm)'/, 'the selected segment')
  const segOff = lift(SOCIAL, /: '(text-slate-500 hover:text-slate-800)'/, 'an unselected segment')
  const designTile = lift(SOCIAL, /data-design-tile\n\s*style=\{\{ height: H, width: Math\.round\(H \* ratio\) \}\}\n\s*className="([^"]+)"/, 'the design tile')
  const placeTile = lift(SOCIAL, /<div data-place-tile\n\s*className="([^"]+)">/, 'a place tile')
  const tagOwn = lift(SOCIAL, /<span data-design-tag className="([^"]+)">Own design<\/span>/, 'the Own design tag')
  const tagStd = lift(SOCIAL, /<span data-design-tag className="([^"]+)">Standard<\/span>/, 'the Standard tag')
  const barCls = lift(SOCIAL, /data-design-bar\n\s*className=\{`(w-1 shrink-0 self-stretch rounded-full)/, 'the design bar')
  const footnote = lift(COPY, /export const MAKE_POST_FOOTNOTE =\n\s*'([^']+)'/, 'the footnote')

  /* 🔴 THE BUTTONS ARE THE COMPONENT'S OWN TWO CLASS STRINGS, lifted. What is measured is whether a
   * full-width primary with a four-word label stays inside a third-width box at 900 — AND which ones
   * are orange, which is a claim about the computed background, not about a class name. */
  const btn = (label, cls = '') =>
    `<button data-primary class="${btnPrimary} ${cls}">${label}</button>`
  const ghost = (label) => `<button class="${btnOutline}">${label}</button>`

  const eventRow = (i, priv) => `
    <li class="flex flex-wrap items-stretch gap-x-2 gap-y-1.5 py-2">
      <span id="evBar-${i}" class="${barCls} ${priv ? 'bg-transparent' : i % 2 ? 'bg-orange-500' : 'bg-slate-800'}"></span>
      <span class="min-w-[9rem] flex-1">
        <span id="evDate-${i}" class="block truncate text-sm font-bold ${priv ? 'text-slate-400' : 'text-slate-900'}">Tue 13 Oct<span class="ml-1.5 font-medium text-slate-400">17:00 – 20:00</span></span>
        <span id="evSub-${i}" class="block truncate text-sm ${priv ? 'italic text-slate-400' : 'text-slate-500'}">${priv ? 'Private event · no post' : LONG_NAME}</span>
      </span>
      ${priv ? '' : `<span id="evBtn-${i}"><button class="${btnOutline} self-center">Make post</button></span>`}
    </li>`

  const placeRow = (i) => `
    <li class="flex flex-wrap items-center gap-x-2 gap-y-1.5 py-2">
      <span class="min-w-[9rem] flex-1">
        <span id="plName-${i}" class="block truncate text-sm font-bold text-slate-900">${LONG_NAME}<span class="font-medium text-slate-400"> · Wickhambrook</span></span>
        <span class="block truncate text-sm text-slate-500">Next: Tue 13 Oct</span>
      </span>
      <span id="plBtn-${i}">${ghost('Make post')}</span>
    </li>`

  const designRow = (i, own) => `
    <li class="flex flex-wrap items-center gap-x-2 gap-y-1.5 py-2">
      <div id="dsTile-${i}" class="${placeTile}">${own ? '<span style="display:block;width:100%;height:100%;background:#cbd5e1"></span>' : ''}</div>
      <span class="min-w-[8rem] flex-1">
        <span id="dsName-${i}" class="block truncate text-sm font-bold text-slate-900">${LONG_NAME}</span>
        <span class="block truncate text-sm text-slate-400">Wickhambrook</span>
      </span>
      <span id="dsTag-${i}" class="${own ? tagOwn : tagStd}">${own ? 'Own design' : 'Standard'}</span>
      <span id="dsBtn-${i}">${ghost(own ? 'Edit' : 'Give own design')}</span>
    </li>`

  /* 🔴 THE DESIGN TILE, DRAWN EXACTLY AS THE COMPONENT DRAWS IT — a fixed height and a derived width.
   * ⚠️ BOTH STATES ARE RENDERED IN THE SAME FIXTURE so the harness can compare their boxes: "the empty
   * tile is the same size as a filled one" is a comparison, not a number. */
  const designTileHtml = (id, filled, w, h) => {
    const ratio = w && h ? w / h : 4 / 5
    const H = 150
    return `<div id="${id}" class="${designTile}" style="height:${H}px;width:${Math.round(H * ratio)}px">${
      filled ? '<span style="display:block;width:100%;height:100%;background:#cbd5e1"></span>' : 'No design yet'}</div>`
  }

  const field = (label) =>
    `<div><label class="block text-xs font-bold text-slate-600 mb-1">${label}</label>
      <input class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" value="" /></div>`

  /** A box heading and its description, exactly as `<Box>` composes them. */
  const boxHead = (id, title, blurb) =>
    `<p id="${id}" class="${boxHeading}">${title}</p><p class="${boxBlurb}">${blurb}</p>`

  const makeBoxes = `
  <div id="grid" class="${oneCol ? 'grid grid-cols-1 gap-3' : makeGrid}">
    <div id="box1" class="${boxCard}">
      ${boxHead('head1', 'Weekly post', 'Your whole week on one picture.')}
      <div class="${boxBody}">
        <label class="block text-xs font-bold text-slate-600">Which week</label>
        <select id="weekSelect" class="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900">
          <option>This week · Mon 6 Oct – Sun 12 Oct</option>
        </select>
        <p class="mt-1.5 text-[11px] text-slate-400">4 events</p>
        <div class="mt-auto pt-3"><span id="box1btn">${btn('Make this week’s post', 'w-full')}</span></div>
      </div>
    </div>
    <div id="box2" class="${boxCard}">
      ${boxHead('head2', 'Single event post', 'One picture for one event. Pick from your next events.')}
      <div class="${boxBody}">
        <ul id="list2" class="${listUl}">
          ${Array.from({ length: 6 }, (_, i) => eventRow(i, i === 2)).join('')}
        </ul>
        <div class="mt-auto pt-2"><a id="allEvents" class="text-sm font-semibold text-slate-600 underline">See all upcoming events</a></div>
      </div>
    </div>
    <div id="box3" class="${boxCard}">
      ${boxHead('head3', 'Post for a place', 'Pick a place to post its next event.')}
      <div class="${boxBody}">
        ${field('Search places')}
        <ul id="list3" class="${listUl}">
          ${Array.from({ length: rows }, (_, i) => placeRow(i)).join('')}
        </ul>
        <p class="mt-auto pt-2 text-xs text-slate-400">${rows} places · hidden places aren’t listed</p>
      </div>
    </div>
  </div>
  <p id="footnote" class="text-xs leading-relaxed text-slate-400">${footnote}</p>`

  /* ⚠️ BOX 1 IS DRAWN **FILLED** AND BOX 2 **EMPTY**, deliberately: the two tiles are then measured
   * against each other, which is the only way to prove "the empty one is the same size as a filled
   * one" without writing a number into this file. */
  const designBoxes = `
  <div id="grid" class="${oneCol ? 'grid grid-cols-1 gap-3' : designGrid}">
    <div id="box1" class="${boxCard}">
      ${boxHead('head1', 'Weekly post design', 'The picture, the rows and where the text goes on your weekly post.')}
      <div class="${boxBody}">
        ${designTileHtml('tileFilled', true, 1080, 1350)}
        <div class="mt-2 flex items-center gap-2"><span class="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">✓ Set up</span></div>
        <!-- FULL WIDTH, AS THE COMPONENT RENDERS IT: BTN_OUTLINE plus w-full. A fixture that drew it
             auto-width would be measuring a narrower button than the one served. -->
        <div class="mt-auto pt-3"><span id="box1btn"><button class="${btnOutline} w-full">Edit weekly design</button></span></div>
      </div>
    </div>
    <div id="box2" class="${boxCard}">
      ${boxHead('head2', 'Event post design', 'Your Standard design for single event posts. Used at every place that doesn’t have its own.')}
      <div class="${boxBody}">
        ${designTileHtml('tileEmpty', false, 1080, 1350)}
        <div class="mt-2 flex items-center gap-2"><span class="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">Not set up</span></div>
        <div class="mt-auto pt-3"><span id="box2btn"><button class="${btnOutline} w-full">Edit event design</button></span></div>
      </div>
    </div>
    <div id="box3" class="${boxCard}">
      ${boxHead('head3', 'Designs for a place', 'Give a place its own picture — a pub’s logo, a brewery’s colours. Its event posts use it instead of Standard.')}
      <div class="${boxBody}">
        ${field('Search places')}
        <ul id="list3" class="${listUl}">
          ${Array.from({ length: rows }, (_, i) => designRow(i, i < 2)).join('')}
        </ul>
        <p class="mt-auto pt-2 text-xs text-slate-400">2 with their own design · ${rows - 2} using Standard</p>
      </div>
    </div>
  </div>`

  return `${HEAD(css)}
<div style="background:#f8fafc;min-height:100vh;padding:16px">
  <div class="space-y-3">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <p class="text-xl font-black text-slate-900">Social posts</p>
        <p class="mt-0.5 text-sm text-slate-500">Make a picture for your week, an event or a place — and set up how they look.</p>
      </div>
      <div id="seg" class="${seg}">
        <button id="segPosts" class="${segBtn} ${area === 'posts' ? segOn : segOff}">Make a post</button>
        <button id="segDesigns" class="${segBtn} ${area === 'designs' ? segOn : segOff}">Designs</button>
      </div>
    </div>
    ${area === 'posts' ? makeBoxes : designBoxes}
  </div>
</div></body></html>`
}

/**
 * ══ 🔴 THE PLACE DESIGN EDITOR ═══════════════════════════════════════════════════════════════════
 * A full page: a back link, the place's name, the scope sentence, a two-field card, the existing
 * editor, and a footer with "Make post for …" and the quiet way out. What is measured is the CHROME —
 * the editor inside it is `EventSetupScreen` and is measured by its own fixtures elsewhere.
 */
function placeEditorFixture(css) {
  const card = lift(SOCIAL, /<Card className="(grid grid-cols-1 gap-3 p-4 sm:grid-cols-2)">/, 'the editor card')
  const footer = lift(SOCIAL, /<Card className="(flex flex-wrap items-center justify-between gap-3 p-4)">/, 'the editor footer')
  const useStd = lift(SOCIAL, /data-use-standard\n\s*className="([^"]+)"/, 'the use-Standard link')
  const scope = lift(COPY, /export const placeDesignScope = \(place: string\): string =>\n\s*`([^`]+)`/, 'the scope sentence')
    .replace('${place}', LONG_NAME)

  return `${HEAD(css)}
<div style="background:#f8fafc;min-height:100vh;padding:16px">
  <div class="space-y-3">
    <button id="back" class="text-xs font-bold text-slate-500">‹ Social posts › Designs</button>
    <div class="min-w-0">
      <p id="placeName" class="truncate text-lg font-black text-slate-900">${LONG_NAME}</p>
      <p class="text-xs text-slate-500">Wickhambrook · event design for this place</p>
    </div>
    <p id="scope" class="text-xs text-slate-500">${scope}</p>
    <div id="fields" class="${card}" style="background:#fff;border:1px solid #e2e8f0;border-radius:16px">
      <div class="min-w-0">
        <label class="block text-xs font-bold text-slate-600 mb-1">Name on posts</label>
        <input id="nameInput" class="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" value="Kings Arms" />
        <p id="nameHint" class="text-slate-400 text-xs mt-0.5">Printed on posts for this place. Leave it blank to use “${LONG_NAME}”.</p>
      </div>
      <div class="min-w-0">
        <label class="mb-1 block text-xs font-bold text-slate-600">Preview with</label>
        <select id="previewWith" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"><option>Tue 13 Oct · 17:00–20:00</option></select>
      </div>
    </div>
    <div style="height:280px;background:#eef2f7;border:1px solid #cbd5e1;border-radius:16px">the existing editor</div>
    <div id="footer" class="${footer}" style="background:#fff;border:1px solid #e2e8f0;border-radius:16px">
      <span id="makePost"><button class="bg-orange-600 text-white font-semibold rounded-xl px-4 py-2 text-sm">Make post for Tue 13 Oct</button></span>
      <div class="flex flex-col items-end gap-1">
        <button id="useStandard" class="${useStd}">Use Standard design here instead</button>
      </div>
    </div>
  </div>
</div></body></html>`
}

/* ══ 🔴 THE ONLY BUTTONS THAT MAY BE ORANGE ═══════════════════════════════════════════════════════
 * Orange is this product's "make something" colour. ⛔ IT IS A SET OF IDS, so adding an orange button
 * is a visible change to this line rather than a quiet drift back to fourteen of them. `box1btn` on
 * Make a post is "Make this week's post" (or "Set up weekly design" when there is none, which is the
 * thing to do from that box); `makePost` is the place editor's "Make post for <date>". */
const ALLOWED_ORANGE = new Set(['box1btn', 'makePost'])

const rects = () => {
  const box = (id) => {
    const el = document.getElementById(id)
    if (!el) return null
    const b = el.getBoundingClientRect()
    return {
      left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top),
      bottom: Math.round(b.bottom), width: Math.round(b.width), height: Math.round(b.height),
      visible: b.width > 0 && b.height > 0,
    }
  }
  const scrolls = (id) => {
    const el = document.getElementById(id)
    return el ? el.scrollHeight > el.clientHeight + 1 : false
  }
  const btns = []
  for (const id of ['box1btn', 'box2btn', 'evBtn-0', 'plBtn-0', 'dsBtn-0', 'dsBtn-5']) {
    const b = box(id)
    if (b) btns.push({ id, ...b })
  }
  /* ⛔ THE COMPUTED STYLE, NOT THE CLASS. `text-transform` is the only honest test of "title case, not
   * uppercased": a source string can be title case and still render shouting. */
  const headings = []
  for (const id of ['head1', 'head2', 'head3']) {
    const el = document.getElementById(id)
    if (!el) continue
    const cs = getComputedStyle(el)
    headings.push({ id, transform: cs.textTransform, size: parseFloat(cs.fontSize) })
  }
  /* 🔴 EVERY BUTTON ON THE SCREEN, AND WHICH OF THEM ARE ORANGE — read off the computed background, so
   * a colour arriving from anywhere is caught, not only one spelled `bg-orange-600`. */
  const orangeButtons = []
  const buttonBg = []
  for (const el of document.querySelectorAll('button')) {
    const id = el.id || el.closest('[id]')?.id || '(unnamed)'
    const bg = getComputedStyle(el).backgroundColor
    /* ⛔ THE COMPUTED VALUE IS NOT ALWAYS `rgb(...)`. Tailwind 4 writes colours as `oklch()`, and a
     * browser may hand the computed background back in that form — the first version of this matched
     * `rgba?\(` only, found nothing, and reported that NO button was orange, which passed the
     * "only the allowed ones are orange" check for the worst possible reason.
     * 🔴 SO THE COLOUR IS RESOLVED BY THE BROWSER ITSELF, through a canvas, which gives real channel
     * values whatever notation the stylesheet used. */
    buttonBg.push(id + '=' + bg)
    const c = (() => {
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
      if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
      try {
        const cv = document.createElement('canvas')
        cv.width = 1; cv.height = 1
        const ctx = cv.getContext('2d')
        if (!ctx) return null
        ctx.fillStyle = '#000'
        ctx.fillStyle = bg
        ctx.fillRect(0, 0, 1, 1)
        const d = ctx.getImageData(0, 0, 1, 1).data
        return [d[0], d[1], d[2]]
      } catch { return null }
    })()
    if (!c) continue
    const [r0, g0, b0] = c
    /* ⚠️ "ORANGE" IS A RANGE, NOT A HEX. Red well above green, green above blue — which catches
     * orange-600 and any neighbour somebody reaches for later. */
    if (r0 > 180 && g0 < r0 - 50 && b0 < g0) orangeButtons.push(id)
  }
  /* ⚠️ THE BARS, WITH THEIR ROW'S HEIGHT, because "full row height" is a comparison. */
  const bars = []
  for (let i = 0; i < 6; i++) {
    const el = document.getElementById('evBar-' + i)
    if (!el || !el.parentElement) continue
    const b = el.getBoundingClientRect()
    const row = el.parentElement
    const cs = getComputedStyle(row)
    /* ⛔ THE ROW'S **CONTENT** HEIGHT, NOT ITS BORDER BOX. The row carries `py-2`, so a bar that
     * stretches the full content height still measures 16px short of the box — the first version
     * compared against the border box and failed on correct markup at all seven widths. */
    const rowContent = row.getBoundingClientRect().height
      - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
    if (b.height === 0) continue
    bars.push({
      height: Math.round(b.height), width: Math.round(b.width), rowHeight: Math.round(rowContent),
    })
  }
  const stdTile = document.getElementById('dsTile-5')
  return {
    innerW: window.innerWidth,
    docScrollW: document.documentElement.scrollWidth,
    headings, orangeButtons, buttonBg, bars,
    tileFilled: box('tileFilled'), tileEmpty: box('tileEmpty'),
    placeTile: box('dsTile-5'),
    /* ⛔ `textContent`, TRIMMED. A tile with a picture in it has no text either; `dsTile-5` is one of
     * the Standard rows, which is the case the claim is about. */
    standardTileText: stdTile ? (stdTile.textContent || '').trim() : '',
    designTag: box('dsTag-5'), dsName: box('dsName-5'),
    grid: box('grid'), box1: box('box1'), box2: box('box2'), box3: box('box3'),
    seg: box('seg'), footnote: box('footnote'),
    list2Scrolls: scrolls('list2'), list3Scrolls: scrolls('list3'),
    list2: box('list2'), list3: box('list3'),
    /* ⛔ A PRIVATE ROW HAS NO BUTTON. Asserted as an ABSENCE, which is the only honest way: a hidden
     * or disabled one would still be in the DOM. */
    privateBtn: document.getElementById('evBtn-2') !== null,
    privateSub: box('evSub-2'),
    btns,
    /* ── the place editor ── */
    fields: box('fields'), footer: box('footer'), useStandard: box('useStandard'),
    makePost: box('makePost'), scope: box('scope'), placeName: box('placeName'),
    nameHint: box('nameHint'), previewWith: box('previewWith'),
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
  const shotDir = path.join(REPO, 'docs/screenshots/social-posts')
  fs.mkdirSync(shotDir, { recursive: true })
  /* 🔴 THE LAYOUT SHOTS ARE THEIR OWN FOLDER, at the two widths that matter for the side-by-side
   * claim: 1100 (a normal laptop window — the width the bug was reported at) and 1728 (full screen). */
  const layoutShots = path.join(REPO, 'docs/screenshots/social-posts-layout')
  fs.mkdirSync(layoutShots, { recursive: true })

  const list = await engines()
  let measured = 0
  for (const eng of list) {
    if (eng.skip) { lines.push(`⚠️ ${eng.name}: SKIPPED — ${eng.skip}`); continue }
    measured++
    lines.push(`── ${eng.name} ────────────────────────────────────────────────────────────────`)

    /* ══ 🔴 FIVE WIDTHS ABOVE THE BREAKPOINT AND TWO BELOW (6 October 2026) ═══════════════════════
     * ⛔ THIS FILE USED TO MEASURE 1440 AND 820 AND NOTHING BETWEEN THEM, and that is exactly how the
     * reported bug got through: the grid went side-by-side at `lg` (1024), and a 16in MacBook Pro in
     * Safari with a normal window is 1000–1100px wide. Both measured widths were CORRECT and the
     * laptop — the machine this is used on — was not measured at all.
     * 🔴 A BREAKPOINT WITH NO MEASUREMENT BETWEEN ITS TWO SIDES IS A BREAKPOINT NOBODY HAS CHECKED.
     * 1000 and 1100 are the real window; 1280 and 1440 are external monitors; 1728 is this laptop's
     * full-screen width. 820 and 390 are the two that must STACK. */
    const WIDTHS = [
      [1000, 800, 'laptop window'],
      [1100, 800, 'laptop window, wider'],
      [1280, 800, 'desktop'],
      [1440, 900, 'desktop, wide'],
      [1728, 1117, 'MacBook Pro 16in, full screen'],
      [820, 1180, 'iPad portrait'],
      [390, 844, 'phone'],
    ]
    /** The breakpoint itself, in one place — every "side by side or stacked?" branch reads it. */
    const SIDE_BY_SIDE = 900
    for (const [w, h, label] of WIDTHS) {
      await eng.setViewport(w, h)

      for (const area of ['posts', 'designs']) {
        await eng.page.goto(write(`sp-${area}-${w}-${eng.name}.html`, socialFixture(css, { area })))
        const r = await eng.page.evaluate(rects)
        lines.push(`  ${w}×${h} (${label}) ${area}  boxes ${r.box1.width}/${r.box2.width}/${r.box3.width} @ y${r.box1.top}/${r.box2.top}/${r.box3.top}`)

        t(r.docScrollW <= r.innerW, `🔴 ${w} ${area}: NO HORIZONTAL PAGE SCROLL`)
        t([r.box1, r.box2, r.box3].every(b => b.right <= r.innerW + 1),
          `🔴 ${w} ${area}: all three boxes fit across the viewport`)
        t(r.seg.right <= r.innerW + 1 && r.seg.visible,
          `⚠️ ${w} ${area}: the segmented control is on screen and inside the page`)
        if (w >= SIDE_BY_SIDE) {
          /* 🔴 THREE IN A ROW, which is the brief's layout — asserted as "same top", not as three
           * widths, so a design change to the column ratios does not fail a claim about the ROW. */
          t(r.box1.top === r.box2.top && r.box2.top === r.box3.top,
            `🔴 ${w} ${area}: the three boxes are in ONE row`)
          t(r.box1.left < r.box2.left && r.box2.left < r.box3.left,
            `⚠️ ${w} ${area}: …in order, left to right`)
          /* ⚠️ `items-stretch` IS WHAT MAKES THEM READ AS THREE CHOICES OF ONE KIND rather than three
           * unrelated cards. Three boxes of very different content lengths must come out equal. */
          t(Math.abs(r.box1.height - r.box2.height) <= 1 && Math.abs(r.box2.height - r.box3.height) <= 1,
            `🔴 ${w} ${area}: …and the same height (${r.box1.height}/${r.box2.height}/${r.box3.height})`)
        } else {
          t(r.box2.top >= r.box1.bottom && r.box3.top >= r.box2.bottom,
            `🔴 ${w} ${area}: the boxes STACK below ${SIDE_BY_SIDE}px`)
        }

        /* ══ 🔴 THE LOOK, MEASURED RATHER THAN READ OFF THE SOURCE ═══════════════════════════════
         * ⛔ A HEADING IS TITLE CASE. `text-transform` is the only honest test: a source string can be
         * title case and still render shouting, which is exactly what `uppercase tracking-widest` did
         * to all six of these. */
        t(r.headings.length === 3 && r.headings.every(x => x.transform === 'none'),
          `🔴 ${w} ${area}: the box headings are title case, not uppercased (${r.headings.map(x => x.transform).join('/')})`)
        t(r.headings.every(x => x.size >= 16 && x.size <= 18),
          `⚠️ ${w} ${area}: …at about 17px (${r.headings.map(x => Math.round(x.size)).join('/')})`)
        /* ⛔ ORANGE MEANS "MAKE SOMETHING". Counted on the COMPUTED background, over every button on the
         * screen — a class-name count cannot see a colour arriving from somewhere else. */
        /* ⛔ AND THE POSITIVE HALF IS ASSERTED TOO, BELOW. "Only the allowed ones are orange" passes
         * when the measurement finds NOTHING orange — which is exactly what happened on the first run
         * of this check, because the computed background came back as `oklch(…)` and the matcher only
         * knew `rgb(…)`. **A pure-absence assertion cannot tell "correct" from "measured nothing."** */
        t(r.orangeButtons.every(id => ALLOWED_ORANGE.has(id)),
          `🔴 ${w} ${area}: only the make/set-up buttons are orange (orange: ${r.orangeButtons.join(', ') || 'none'}${
            r.orangeButtons.every(id => ALLOWED_ORANGE.has(id)) ? '' : ` · all: ${r.buttonBg.join(' ')}`})`)
        if (area === 'posts') {
          t(r.orangeButtons.includes('box1btn'),
            `⚠️ ${w}: …and the weekly button IS one of them`)
        } else {
          t(r.orangeButtons.length === 0,
            `⛔ ${w} designs: …so NOTHING on Designs is orange — every button there edits`)
          /* 🔴 THE EMPTY TILE IS THE SAME SIZE AS A FILLED ONE. Asserted as a COMPARISON between the
           * two tiles rendered side by side in this fixture, not against a number written in here. */
          t(r.tileFilled && r.tileEmpty
            && r.tileFilled.width === r.tileEmpty.width
            && r.tileFilled.height === r.tileEmpty.height,
            `🔴 ${w} designs: the empty design tile is the same size as a filled one (${r.tileEmpty?.width}×${r.tileEmpty?.height} vs ${r.tileFilled?.width}×${r.tileFilled?.height})`)
          t((r.tileEmpty?.height ?? 0) >= 120,
            `⚠️ ${w} designs: …and it is a TILE, not a thin bar (${r.tileEmpty?.height}px tall)`)
          /* ⛔ NO TEXT IN A STANDARD PLACE TILE. It said "Standard" in 9px inside a 40px box —
           * unreadable, and the tag beside it says the same word at a size somebody can read. */
          t(r.standardTileText === '',
            `🔴 ${w} designs: a Standard place tile holds no text (saw "${r.standardTileText}")`)
          t(r.placeTile && r.placeTile.width === 28 && r.placeTile.height === 35,
            `⚠️ ${w} designs: …and it is the 28×35 portrait tile (${r.placeTile?.width}×${r.placeTile?.height})`)
          t(!!r.designTag && r.designTag.left > (r.dsName?.right ?? 0) - 1,
            `⚠️ ${w} designs: the Own design / Standard tag sits after the name`)
        }
        if (area === 'posts') {
          /* 🔴 THE COLOUR BAR IS FULL ROW HEIGHT. It was a 32px stub beside a taller row. */
          t(r.bars.length > 0 && r.bars.every(b => b.height >= b.rowHeight - 2),
            `🔴 ${w} posts: the design bar is full row height (${r.bars.map(b => `${b.height}/${b.rowHeight}`).join(' ')})`)
          t(r.bars.every(b => b.width >= 3 && b.width <= 5),
            `⚠️ ${w} posts: …and 4px wide (${r.bars.map(b => b.width).join('/')})`)
        }
        /* 🔴 EVERY BUTTON INSIDE ITS BOX. A full-width primary with a four-word label in a third-width
         * column at 390 is the case this exists for. */
        /* ⚠️ MAPPED BY NAME, NOT BY PREFIX. The first version read `id.startsWith('box1') ? … : 'box2'
         * ? … : box3`, so `evBtn-0` — which is in BOX 2 — was checked against box 3's edges and failed
         * on correct markup. A fallback branch that catches everything it was not told about is a
         * fallback that mislabels. */
        const BOX_OF = { box1btn: r.box1, box2btn: r.box2, 'evBtn-0': r.box2, 'plBtn-0': r.box3, 'dsBtn-0': r.box3, 'dsBtn-5': r.box3 }
        const boxOf = (id) => BOX_OF[id] ?? null
        t(r.btns.length > 0 && r.btns.every(b => {
          const box = boxOf(b.id)
          return box && b.right <= box.right + 1 && b.left >= box.left - 1
        }), `🔴 ${w} ${area}: every button is inside its own box (${r.btns.length} checked)`)
        /* ⛔ A PRIVATE EVENT HAS NO BUTTON AT ALL — an absence, not a disabled control. */
        if (area === 'posts') {
          t(!r.privateBtn, `⛔ ${w}: the private event row has NO Make post button`)
          t(r.privateSub.visible, `⚠️ ${w}: …and still shows its line, greyed, in its date position`)
          t(r.footnote.right <= r.innerW + 1, `⚠️ ${w}: the footnote fits across the page`)
        }
      }

      /* ══ 🔴 A LONG LIST MUST SCROLL INSIDE ITS BOX ══════════════════════════════════════════════
       * Twenty places is a truck with a full address book. ⛔ WITHOUT `min-h-0` ON THE SCROLLER the
       * box grows to its content, the row stops being a row, and the other two boxes are dragged to
       * the same height — which is the exact failure `items-stretch` turns from ugly into absurd. */
      for (const area of ['posts', 'designs']) {
        await eng.page.goto(write(`sp-long-${area}-${w}-${eng.name}.html`, socialFixture(css, { area, rows: 20 })))
        const r = await eng.page.evaluate(rects)
        if (w >= SIDE_BY_SIDE) {
          t(r.list3Scrolls, `🔴 ${w} ${area}: a 20-place list scrolls INSIDE its box`)
          t(Math.abs(r.box1.height - r.box3.height) <= 1,
            `🔴 ${w} ${area}: …so the box is no taller than the others (${r.box1.height} vs ${r.box3.height})`)
          t(r.list3.bottom <= r.box3.bottom + 1,
            `⚠️ ${w} ${area}: …and the list ends inside the box`)
        }
        t(r.docScrollW <= r.innerW, `🔴 ${w} ${area}: 20 rows still do not scroll the PAGE sideways`)
      }

      /* ══ 🔴 THE PLACE DESIGN EDITOR ═════════════════════════════════════════════════════════════ */
      await eng.page.goto(write(`sp-editor-${w}-${eng.name}.html`, placeEditorFixture(css)))
      const e = await eng.page.evaluate(rects)
      lines.push(`  ${w}×${h} place editor  fields ${e.fields.width} · footer ${e.footer.width}×${e.footer.height}`)
      t(e.docScrollW <= e.innerW, `🔴 ${w} editor: NO HORIZONTAL PAGE SCROLL`)
      t(e.placeName.right <= e.innerW + 1 && e.scope.right <= e.innerW + 1,
        `⚠️ ${w} editor: the name and the scope sentence fit`)
      t(e.nameHint.right <= e.fields.right + 1 && e.previewWith.right <= e.fields.right + 1,
        `🔴 ${w} editor: "Name on posts" and "Preview with" stay inside their card`)
      /* ⛔ THE QUIET WAY OUT IS ON THE FAR RIGHT AND INSIDE THE FOOTER. It removes a picture after a
       * confirm; it must not be the thing a thumb lands on, and it must not fall off the card. */
      t(e.useStandard.right <= e.footer.right + 1 && e.makePost.left >= e.footer.left - 1,
        `🔴 ${w} editor: "Make post" is on the left and "Use Standard…" inside the footer`)
      if (w >= 640) {
        t(e.useStandard.left > e.makePost.right,
          `⚠️ ${w} editor: …and they are on one row, at opposite ends`)
      }

      /* ⚠️ 1100 AND 1728 — the laptop window and the laptop full screen. ⛔ 1440 WAS THE OLD SET AND IT
       * IS THE ONE WIDTH THAT HID THE BUG: the layout was right there and wrong on the machine. The
       * phone shot stays, because stacking is the other half of the claim. */
      if (w === 1100 || w === 1728 || w === 390) {
        await eng.page.goto(write(`sp-shot-posts-${w}-${eng.name}.html`, socialFixture(css, { area: 'posts' })))
        await eng.shot(path.join(layoutShots, `social-make-${w}-${eng.name.toLowerCase()}.png`))
        await eng.page.goto(write(`sp-shot-designs-${w}-${eng.name}.html`, socialFixture(css, { area: 'designs' })))
        await eng.shot(path.join(layoutShots, `social-designs-${w}-${eng.name.toLowerCase()}.png`))
      }
      if (w === 1440 || w === 390) {
        await eng.page.goto(write(`sp-shot-editor-${w}-${eng.name}.html`, placeEditorFixture(css)))
        await eng.shot(path.join(shotDir, `social-place-editor-${w}-${eng.name.toLowerCase()}.png`))
      }
    }

    /* ── THE CONTROL ───────────────────────────────────────────────────────────────────────────── */
    {
      await eng.setViewport(1440, 900)
      await eng.page.goto(write(`sp-ctl-${eng.name}.html`, socialFixture(css, { oneCol: true })))
      const c = await eng.page.evaluate(rects)
      t(c.box2.top >= c.box1.bottom,
        '🔴 CONTROL: with the three-column grid removed, 1440 stacks — so the measurement can tell them apart')
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
