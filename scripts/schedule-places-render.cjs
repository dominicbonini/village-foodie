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
  if (!/18rem_1fr/.test(css)) {
    throw new Error('the compiled CSS has no `grid-cols-[18rem_1fr]` rule — the build predates this component; run `npx next build`')
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
function fixture(css, oneCol = false, pillCount = 3) {
  const grid = lift(TAB, /className="(grid grid-cols-1 lg:grid-cols-\[18rem_1fr\] gap-4 items-start)"/, 'the two-pane grid')
  // 🔴 THE PILLS NOW LIVE IN THE PAGE, not in the pane — they wrap all three sections, Events included.
  const pillRow = lift(PAGE, /className="(min-w-0 overflow-x-auto -mx-1 px-1 pb-1 mb-4)"/, 'the pill row')
  const pillInner = lift(PAGE, /<div className="(flex gap-2 w-max)">/, 'the pill row inner')
  const card1 = lift(TAB, /className="(p-4 grid grid-cols-1 sm:grid-cols-2 gap-3)"/, 'the identity card grid')
  const modalForm = lift(PAGE, /<div id="add-event-form" className="(grid grid-cols-1 sm:grid-cols-2 gap-3)">/, 'the add-event form grid')
  const g = oneCol ? 'grid grid-cols-1 gap-4 items-start' : grid

  /* The pill row, the list pane, the detail pane's two cards — and a SECOND fixture below for the
   * Add event modal. Real classes, filler content. The detail pane is the taller of the two, which is
   * what makes the stacking order visible. */
  return `${HEAD(css)}
<div style="max-width:1024px;margin:0 auto;padding:0 16px">
  <h2 id="heading" style="font-weight:900;margin:12px 0">Schedule</h2>
  <div id="pills" class="${pillRow}">
    <div class="${pillInner}">
      ${['Events', 'Weekly post', 'Places', 'Fourth section', 'Fifth section', 'Sixth section']
        .slice(0, pillCount)
        .map((label, i) => `<button style="padding:6px 14px;border-radius:9999px;background:${i === 0 ? '#0f172a;color:#fff' : '#f1f5f9'};white-space:nowrap">${label}</button>`)
        .join('')}
    </div>
  </div>
  <div id="grid" class="${g}">
    <div id="list" class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3">
      ${filler('search + new place', 96)}
      ${filler('FAVOURITES + OTHER PLACES rows', 280)}
      ${filler('show hidden places', 28)}
    </div>
    <div id="detail" class="space-y-4 min-w-0">
      <div id="card1" class="bg-white rounded-2xl border border-slate-200 shadow-sm ${card1}">
        ${filler('Name on posts', 56)}${filler('Short name', 56)}
        <div class="sm:col-span-2">${filler('Address', 56)}</div>
        ${filler('Area', 56)}${filler('Postcode', 56)}
      </div>
      <div id="card2" class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">${filler('Events here', 86)}</div>
      <div id="card3" class="flex flex-wrap gap-2">
        <span style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:12px;white-space:nowrap">★ Favourite</span>
        <span style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:12px;white-space:nowrap">Merge into another place</span>
        <span style="padding:6px 10px;border:1px solid #e2e8f0;border-radius:12px;white-space:nowrap">Hide this place</span>
      </div>
    </div>
  </div>
</div></body></html>`
}

/**
 * FIXTURE 2 — THE ADD EVENT MODAL, with the place picker where "Copy a recent event" was.
 * 🔴 THE MODAL'S OWN WRAPPER CLASSES ARE LIFTED FROM THE PAGE, including the `max-h-[90vh]` and the
 * scroll container, because the question at 390px is not only "does it fit across" but "can the
 * operator still reach the Add event button at the bottom".
 */
function modalFixture(css) {
  const shell = lift(PAGE, /<div className=\{`bg-white rounded-2xl p-5 sm:p-6 pb-8 sm:pb-8 w-full shadow-2xl (max-h-\[90vh\] overflow-y-auto overscroll-contain touch-pan-y)/, 'the modal shell')
  const form = lift(PAGE, /<div id="add-event-form" className="(grid grid-cols-1 sm:grid-cols-2 gap-3)">/, 'the add-event form grid')
  const picker = 'mt-2'
  return `${HEAD(css)}
<div class="fixed inset-0" style="background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px">
  <div id="modal" class="bg-white rounded-2xl p-5 sm:p-6 pb-8 sm:pb-8 w-full shadow-2xl ${shell} max-w-sm sm:max-w-lg lg:max-w-2xl">
    <h3 style="font-weight:900;margin-bottom:16px">Add event</h3>
    <div id="pickerBlock" class="mb-4">
      <label style="font-size:12px;font-weight:700">Place</label>
      ${filler('search your places', 40)}
      <div id="picker" class="${picker}">
        <div class="flex flex-col gap-2 max-h-56 overflow-y-auto">
          ${filler('★ Lavenham Village Hall · Last time: Tue 6 Oct · 17:00–20:00', 52)}
          ${filler('★ Bull &amp; Butcher · Last time: Wed 1 Oct · 17:00–20:00', 52)}
        </div>
        <div id="pickerLinks" class="flex flex-wrap items-center gap-3 mt-2">
          <span style="font-size:12px;font-weight:700;white-space:nowrap">Show all places (14)</span>
          <span style="font-size:12px;font-weight:700;white-space:nowrap">+ New place</span>
        </div>
      </div>
    </div>
    <div id="form" class="${form}">
      <div class="sm:col-span-2">${filler('Date', 56)}</div>
      <div class="sm:col-span-2">${filler('Venue name', 56)}</div>
      <div class="sm:col-span-2">${filler('Full address', 56)}</div>
      ${filler('Area', 56)}
      ${filler('Postcode', 56)}
      <div id="times" class="sm:col-span-2 grid grid-cols-2 gap-2">${filler('Start', 56)}${filler('End', 56)}</div>
      <div class="sm:col-span-2">${filler('Notes', 56)}</div>
      <p id="filledFrom" class="sm:col-span-2" style="font-size:12px;color:#94a3b8">Filled from Lavenham Village Hall. Change anything for this date only.</p>
      <div id="actions" class="sm:col-span-2 flex gap-2 pt-1">
        <span style="padding:8px 16px;border-radius:12px;background:#f1f5f9;white-space:nowrap">Cancel</span>
        <span style="padding:8px 16px;border-radius:12px;background:#ea580c;color:#fff;white-space:nowrap">Add event</span>
      </div>
    </div>
  </div>
</div></body></html>`
}

const rects = () => {
  const ids = ['heading', 'pills', 'grid', 'list', 'detail', 'card1', 'card2', 'card3',
    'modal', 'pickerBlock', 'picker', 'pickerLinks', 'form', 'times', 'filledFrom', 'actions']
  const out = {}
  for (const id of ids) {
    const el = document.getElementById(id)
    if (!el) { out[id] = null; continue }
    const r = el.getBoundingClientRect()
    out[id] = {
      top: Math.round(r.top), left: Math.round(r.left),
      width: Math.round(r.width), height: Math.round(r.height), bottom: Math.round(r.bottom),
      visible: r.width > 0 && r.height > 0,
    }
  }
  out.docScrollW = document.documentElement.scrollWidth
  out.innerW = window.innerWidth
  const rowsOf = (id) => {
    const el = document.getElementById(id)
    if (!el) return 0
    return [...new Set([...el.children].map(k => Math.round(k.getBoundingClientRect().top)))].length
  }
  out.card1Rows = rowsOf('card1')
  out.controlRows = rowsOf('card3')     // the three place controls: one row or wrapped
  out.formRows = rowsOf('form')         // the add-event form: one field per row, or two across
  out.pillRows = (() => {
    const el = document.getElementById('pills')
    if (!el) return 0
    const inner = el.firstElementChild
    return inner ? [...new Set([...inner.children].map(k => Math.round(k.getBoundingClientRect().top)))].length : 0
  })()
  // 🔴 DO THE PILLS SCROLL INSIDE THEIR OWN ROW? Their content is wider than the row, and the row
  // clips it — which is what "the pills scroll sideways; no page-level sideways scroll" means.
  out.pillsClip = (() => {
    const el = document.getElementById('pills')
    if (!el) return null
    return { rowW: Math.round(el.clientWidth), contentW: Math.round(el.scrollWidth) }
  })()
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
      await eng.page.goto(write(`p-${w}-${eng.name}.html`, fixture(css)))
      const r = await eng.page.evaluate(rects)
      lines.push(`  ${w}×${h} (${label})  list ${r.list.width}@x${r.list.left}/y${r.list.top} · detail ${r.detail.width}@x${r.detail.left}/y${r.detail.top} · pills row ${r.pillsClip.rowW} content ${r.pillsClip.contentW}`)

      // ── THE SUB-TABS ─────────────────────────────────────────────────────────────────────────
      t(r.pillRows === 1, `🔴 ${w}: the three pills stay on ONE row — they scroll, they do not wrap`)
      t(r.pills.width <= r.innerW, `🔴 ${w}: the pill row never exceeds the viewport`)
      t(r.docScrollW <= r.innerW, `🔴 ${w}: NO HORIZONTAL PAGE SCROLL — the brief's requirement`)

      // ── THE TWO PANES ────────────────────────────────────────────────────────────────────────
      if (w >= 1024) {
        t(r.list.top === r.detail.top, `🔴 ${w}: the two panes share a top edge — side by side`)
        t(r.list.left < r.detail.left && r.list.width === 288, `⚠️ ${w}: the list is the 18rem (288px) column, on the left`)
        t(r.detail.width > r.list.width, `⚠️ ${w}: the detail pane takes the rest`)
        t(r.card1Rows === 3, `⚠️ ${w}: Card 1 is three rows — two, a full-width Address, then two`)
      } else {
        t(r.list.bottom <= r.detail.top, `🔴 ${w} (${label}): the LIST IS ABOVE the detail`)
        t(r.list.width === r.detail.width, `⚠️ ${w}: both panes are full width`)
      }
      if (w === 390) {
        t(r.card1Rows === 5, '⚠️ 390: Card 1 is five rows — one field per row on a phone')
        t(r.card2.top < r.card3.top, '⚠️ 390: the controls sit under "Events here"')
      }
    }

    // ── 🔴 THE PILLS SCROLL RATHER THAN WIDENING THE PAGE, measured at the width where it bites ──
    {
      await eng.setViewport(320, 844)
      await eng.page.goto(write(`narrow-${eng.name}.html`, fixture(css)))
      const r = await eng.page.evaluate(rects)
      lines.push(`  320×844   pills row ${r.pillsClip.rowW} · content ${r.pillsClip.contentW} · doc ${r.docScrollW} vs viewport ${r.innerW}`)
      /* ⚠️ AT 320 THE THREE REAL PILLS FIT (content 296 in a 296 row), so there is nothing to scroll
       * — which is the right outcome and NOT a test of the clipping. An earlier draft asserted they
       * overflowed here and failed on correct layout. The clipping is tested by the control below,
       * with a row that genuinely overflows. */
      t(r.pillsClip.contentW <= r.pillsClip.rowW + 1, '⚠️ 320: the three real pills still fit on one row')
      t(r.docScrollW <= r.innerW, '🔴 320: and the page does not scroll sideways')
      t(r.pillRows === 1, '⚠️ 320: and they do not wrap')
    }
    {
      /* 🔴 THE CLIPPING CONTROL. Six pills in the same row at 320px genuinely overflow it. What must
       * hold is that the OVERFLOW STAYS INSIDE THE ROW — `overflow-x-auto` on a `min-w-0` box — and
       * the document does not grow. That is the brief's "the pills scroll sideways; no page-level
       * sideways scroll", and it is only a real measurement when the content does not fit. */
      await eng.setViewport(320, 844)
      await eng.page.goto(write(`clip-${eng.name}.html`, fixture(css, false, 6)))
      const r = await eng.page.evaluate(rects)
      lines.push(`  320×844 (6 pills)  row ${r.pillsClip.rowW} · content ${r.pillsClip.contentW} · doc ${r.docScrollW}`)
      t(r.pillsClip.contentW > r.pillsClip.rowW, '🔴 CONTROL: six pills genuinely overflow their row at 320px')
      t(r.docScrollW <= r.innerW, '🔴 …and the PAGE still does not scroll — the overflow is inside the pill row')
      t(r.pillRows === 1, '⚠️ …and they scroll rather than wrapping')
    }

    // ── THE ADD EVENT MODAL ──────────────────────────────────────────────────────────────────
    for (const [w, h] of [[1440, 900], [820, 1180], [390, 844]]) {
      await eng.setViewport(w, h)
      await eng.page.goto(write(`m-${w}-${eng.name}.html`, modalFixture(css)))
      const r = await eng.page.evaluate(rects)
      lines.push(`  modal ${w}×${h}  shell ${r.modal.width} · picker@${r.picker.top} → form@${r.form.top} → actions@${r.actions.top} · form rows ${r.formRows}`)
      t(r.pickerBlock.bottom <= r.form.top, `🔴 modal ${w}: the place picker is ABOVE the form, where "Copy a recent event" was`)
      t(r.filledFrom.top < r.actions.top, `⚠️ modal ${w}: the "Filled from" line sits just above the buttons`)
      t(r.docScrollW <= r.innerW, `🔴 modal ${w}: no horizontal page scroll`)
      t(r.modal.width <= r.innerW - 24, `⚠️ modal ${w}: the modal keeps its 16px gutter`)
      t(r.pickerLinks.width <= r.modal.width, `⚠️ modal ${w}: "Show all places" and "+ New place" fit inside the modal`)
      /* ⚠️ THE ROW COUNTS ARE THE FIXTURE'S NINE FORM CHILDREN: Date, Venue, Address, Area, Postcode,
       * the times pair, Notes, the "Filled from" line, the buttons. From `sm` Area and Postcode share
       * a row, so nine children occupy EIGHT rows; on a phone each takes its own, so nine. An earlier
       * draft guessed 5 and 7 and failed on correct layout — the numbers are counted, not estimated. */
      if (w === 390) {
        t(r.formRows === 9, '⚠️ modal 390: every form field is on its own row (9 of them)')
        t(r.times.width <= r.modal.width, '⚠️ modal 390: start and end time stay inside the modal')
      }
      if (w >= 640) t(r.formRows === 8, `⚠️ modal ${w}: Area and Postcode share a row (sm:grid-cols-2) — 8 rows`)
    }

    // ── THE CONTROL ─────────────────────────────────────────────────────────────────────────────
    /* 🔴 A PLAIN `grid-cols-1` MUST MEASURE DIFFERENTLY AT 1440. Without this the stacking assertions
     * would pass on a component that never had a two-column layout, and the file would be measuring
     * that one column is one column. */
    {
      await eng.setViewport(1440, 900)
      await eng.page.goto(write(`c-${eng.name}.html`, fixture(css, true)))
      const r = await eng.page.evaluate(rects)
      t(r.list.bottom <= r.detail.top,
        '🔴 CONTROL: with the responsive grid replaced by grid-cols-1, 1440px stacks — so the measurement can tell them apart')
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
  console.log('── SCHEDULE: SUB-TABS, PLACES AND THE ADD EVENT MODAL, MEASURED ────────────────────────')
  for (const l of lines) console.log(l)
  console.log(fails === 0 ? '\n✅ layout measured in every available engine' : `\n🔴 ${fails} MEASUREMENT(S) FAILED`)
  process.exit(fails === 0 ? 0 : 1)
}).catch(e => {
  console.log('🔴 ' + (e && e.message ? e.message : String(e)))
  process.exit(1)
})
