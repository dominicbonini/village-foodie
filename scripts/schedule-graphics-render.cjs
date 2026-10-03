#!/usr/bin/env node
// scripts/schedule-graphics-render.cjs — the Places & groups layout, MEASURED, in real browsers.
//   node scripts/schedule-graphics-render.cjs      (needs `npx next build` first)
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
const TAB = read('components/manage/ScheduleGraphicsTab.tsx')

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
function fixture(css, oneCol = false) {
  const grid = lift(TAB, /className="(grid grid-cols-1 lg:grid-cols-\[18rem_1fr\] gap-4 items-start)"/, 'the two-pane grid')
  const tablist = lift(TAB, /className="(flex gap-1 border-b border-slate-200 overflow-x-auto)"/, 'the section tablist')
  const card1 = lift(TAB, /className="(p-4 grid grid-cols-1 sm:grid-cols-2 gap-3)"/, 'the identity card grid')
  const addRow = lift(TAB, /className="(grid grid-cols-1 sm:grid-cols-3 gap-2)"/, 'the add-group row')
  const g = oneCol ? 'grid grid-cols-1 gap-4 items-start' : grid

  // The three section tabs, the list pane, and the detail pane's three cards — real classes, filler
  // content. The detail pane is the taller of the two, which is what makes the stacking order visible.
  return `${HEAD(css)}
<div style="max-width:1024px;margin:0 auto;padding:0 16px">
  <h2 id="heading" style="font-weight:900;margin:12px 0">Schedule graphics</h2>
  <div id="tablist" class="${tablist}">
    <button style="padding:8px 12px;white-space:nowrap">Design</button>
    <button style="padding:8px 12px;white-space:nowrap">This week</button>
    <button style="padding:8px 12px;white-space:nowrap">Places &amp; groups</button>
  </div>
  <div id="grid" class="${g}">
    <div id="list" class="bg-white rounded-2xl border border-slate-200 shadow-sm p-3">
      ${filler('search + new place', 96)}
      ${filler('place rows', 260)}
    </div>
    <div id="detail" class="space-y-4 min-w-0">
      <div id="card1" class="bg-white rounded-2xl border border-slate-200 shadow-sm ${card1}">
        ${filler('Name on posts', 56)}${filler('Short name', 56)}
        ${filler('Address', 56)}${filler('Postcode', 56)}
      </div>
      <div id="card2" class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        ${filler('group rows', 120)}
        <div id="addRow" class="${addRow}">
          ${filler('Paste group link', 56)}${filler('Group name', 56)}${filler('Rules (optional)', 56)}
        </div>
      </div>
      <div id="card3" class="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">${filler('wording', 96)}</div>
    </div>
  </div>
</div></body></html>`
}

const rects = () => {
  const ids = ['heading', 'tablist', 'grid', 'list', 'detail', 'card1', 'card2', 'card3', 'addRow']
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
  // The add row's three inputs: are they side by side or stacked?
  const kids = [...document.getElementById('addRow').children].map(k => Math.round(k.getBoundingClientRect().top))
  out.addRowTops = [...new Set(kids)].length
  const c1 = [...document.getElementById('card1').children].map(k => Math.round(k.getBoundingClientRect().top))
  out.card1Rows = [...new Set(c1)].length
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

    // ── 1440×900 · DESKTOP: list beside detail ──────────────────────────────────────────────────
    {
      await eng.setViewport(1440, 900)
      await eng.page.goto(write(`d-${eng.name}.html`, fixture(css)))
      const r = await eng.page.evaluate(rects)
      lines.push(`  1440×900  list ${r.list.width}@x${r.list.left} · detail ${r.detail.width}@x${r.detail.left}`)
      t(r.list.top === r.detail.top, '🔴 the two panes share a top edge — side by side, not stacked')
      t(r.list.left < r.detail.left && r.list.width === 288, '⚠️ the list is the 18rem (288px) column, on the left')
      t(r.detail.width > r.list.width, '⚠️ the detail pane takes the rest')
      t(r.addRowTops === 1, '⚠️ the three add-group inputs are side by side at this width')
      t(r.card1Rows === 2, '⚠️ the four identity fields are two rows of two')
      t(r.docScrollW <= r.innerW, '🔴 no horizontal page scroll')
    }

    // ── 820×1180 · iPAD PORTRAIT: below `lg`, so STACKED ────────────────────────────────────────
    /* 🔴 THE CASE THE BREAKPOINT CHOICE IS ABOUT. `lg` is 1024px, so an iPad in portrait stacks — and
     * that is deliberate: the detail pane carries a three-input add row, and 820px is not enough for
     * it beside a 288px list. Measured rather than assumed, because "md or lg" is exactly the kind of
     * decision that is right in the source and wrong on the device. */
    {
      await eng.setViewport(820, 1180)
      await eng.page.goto(write(`t-${eng.name}.html`, fixture(css)))
      const r = await eng.page.evaluate(rects)
      lines.push(`  820×1180  list@${r.list.top} (${r.list.width}) → detail@${r.detail.top} (${r.detail.width})`)
      t(r.list.bottom <= r.detail.top, '🔴 iPad portrait: the LIST IS ABOVE the detail')
      t(r.list.width === r.detail.width, '⚠️ …and both panes are full width')
      t(r.addRowTops === 1, '⚠️ the add-group inputs are still three across (sm: holds at 820)')
      t(r.docScrollW <= r.innerW, '🔴 no horizontal page scroll')
    }

    // ── 390×844 · PHONE: stacked, and everything fits ───────────────────────────────────────────
    {
      await eng.setViewport(390, 844)
      await eng.page.goto(write(`p-${eng.name}.html`, fixture(css)))
      const r = await eng.page.evaluate(rects)
      lines.push(`  390×844   list@${r.list.top} (${r.list.width}) → detail@${r.detail.top} · cards ${r.card1.top}/${r.card2.top}/${r.card3.top}`)
      t(r.list.bottom <= r.detail.top, '🔴 PHONE: the LIST IS ABOVE the detail — the brief\'s requirement')
      t(r.card1.top < r.card2.top && r.card2.top < r.card3.top, '🔴 the three cards are in order: identity, groups, wording')
      t(r.addRowTops === 3, '🔴 the three add-group inputs are STACKED on a phone, one per row')
      t(r.card1Rows === 4, '⚠️ the four identity fields are one per row on a phone')
      t(r.docScrollW <= r.innerW, '🔴 NO HORIZONTAL PAGE SCROLL at 390px — the one that breaks first')
      t(r.tablist.width <= r.innerW, '⚠️ the three section tabs do not widen the page (they scroll inside their own row)')
    }

    // ── THE CONTROL ─────────────────────────────────────────────────────────────────────────────
    /* 🔴 A PLAIN `grid-cols-1` MUST MEASURE DIFFERENTLY AT 1440. Without this the three stacking
     * assertions above would pass on a component that never had a two-column layout at all, and the
     * whole file would be measuring that one column is one column. */
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
  console.log('── SCHEDULE GRAPHICS · PLACES & GROUPS, MEASURED ───────────────────────────────────────')
  for (const l of lines) console.log(l)
  console.log(fails === 0 ? '\n✅ layout measured in every available engine' : `\n🔴 ${fails} MEASUREMENT(S) FAILED`)
  process.exit(fails === 0 ? 0 : 1)
}).catch(e => {
  console.log('🔴 ' + (e && e.message ? e.message : String(e)))
  process.exit(1)
})
