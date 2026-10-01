#!/usr/bin/env node
// scripts/screenshot-truck-details-render.cjs — the Screenshots results list, MEASURED, in Chromium and
// WebKit, at the 16" MacBook Pro and the 27" monitor.
//   HG_RENDER=1 node scripts/screenshot-truck-details.cjs     (this file is required from there)
//   node scripts/screenshot-truck-details-render.cjs          (directly, same thing)
//
// 🔴 THE ACCEPTANCE IS A MEASUREMENT, NOT A CLAIM. "One row per screenshot, nothing wrapping, nothing
// overflowing" is a number, and the only honest way to produce it is to lay the thing out and read it
// back. Both widths run in the same pass, so "the same at both sizes" is measured too.
//
// ⚠️ IT IS NOT THE PAGE, AND SAYS SO. There is no admin session here, so the real tab cannot be rendered
// (V12.6: Dominic is the sole admin). What is rendered is the list's OWN markup and class names, LIFTED
// from ScreenshotsPanel.tsx so a changed class fails here, against THIS build's compiled stylesheet.
// Where a cell's content is filler, it is filler of the real size — the longest summary the code can
// actually produce.
// ⚠️ NO NETWORK: file:// pages, the app's own CSS, local browser builds.

const fs = require('fs')
const path = require('path')
const os = require('os')

const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const PANEL = read('components/admin/ScreenshotsPanel.tsx')

function lift(re, what) {
  const m = PANEL.match(re)
  if (!m) throw new Error(`the fixture cannot be built: no ${what} found in ScreenshotsPanel.tsx`)
  return m[1]
}

// 🔴 EVERY CLASS BELOW IS THE COMPONENT'S OWN. A rename there breaks this harness, which is the point.
const ROW = lift(/className="(flex items-center gap-3 border-b border-slate-100 p-3 last:border-b-0)"/, 'the log row')
const THUMB = lift(/className="(h-11 w-11 shrink-0 rounded-lg bg-slate-100)"/, 'the thumbnail placeholder')
const NAME = lift(/className="(w-44 shrink-0 truncate text-sm font-bold)"/, 'the name column')
const CHIP = lift(/className=\{`(shrink-0 rounded-md px-2 py-0\.5 text-xs font-bold) \$\{CHIP_CLASS\[r\.outcome\]/, 'the outcome chip')
const SUMMARY = lift(/className="(min-w-0 flex-1 truncate text-sm text-slate-600)" title=\{r\.summary/, 'the summary column')
const TIME = lift(/className="(shrink-0 text-xs text-slate-400)"/, 'the time column')
const FILTER = lift(/className=\{`(rounded-full px-3 py-1\.5 text-xs font-bold)/, 'the filter chip')
const CARD = lift(/className="(mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white)"/, 'the list card')
const WRAP = lift(/<div className="(max-w-6xl)"/, 'the panel width')

function appCss() {
  const root = path.join(REPO, '.next/static')
  if (!fs.existsSync(root)) throw new Error('no .next/static — run `npx next build` first')
  const files = []
  const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name)
    if (e.isDirectory()) walk(f); else if (e.name.endsWith('.css')) files.push(f)
  } }
  walk(root)
  if (!files.length) throw new Error('no compiled CSS under .next/static')
  return files.map(f => fs.readFileSync(f, 'utf8')).join('\n')
}

// 🧪 THE MOCKUP'S SEVEN ROWS, with the LONGEST summary this code can really emit — the one from
// `updatedSummary` with every field filled and a kept conflict. If the real worst case fits, the list fits.
const LONGEST = 'Added email 3brosfood@gmail.com, mobile 07400 049108, phone 01273 123456, '
  + 'website 3brosburgers.co.uk, Facebook link https://www.facebook.com/profile.php?id=100039496906958 '
  + '· area noted · Facebook link differs from saved — kept saved · matched on website'
const ROWS = [
  ['Tikka Tonic', 'Schedule', 'bg-indigo-100 text-indigo-800', '4 events added', '22:32'],
  ['3Bros Burgers', 'Updated', 'bg-green-100 text-green-800', LONGEST, '22:31'],
  ['Smokin’ Joe’s', 'New truck', 'bg-blue-100 text-blue-800', 'Added to outreach with email and mobile · hidden from the public map · no match found', '22:31'],
  ['Pizza Mondo', 'Nothing new', 'bg-slate-100 text-slate-600', 'Already had everything this screenshot shows · matched on website', '22:31'],
  ['Pizza Mando', 'Needs a look', 'bg-amber-100 text-amber-800', 'Name is close to "Pizza Mondo" but nothing else matches', '22:31'],
  ['Buffalo Joe’s', 'Updated', 'bg-green-100 text-green-800', 'Added mobile 07712 000000 · email kept (already had one) · matched on Facebook link', '22:30'],
  ['screenshot.png', 'Failed', 'bg-red-100 text-red-700', 'Gemini returned no candidates — the image may have triggered a safety filter', '22:29'],
]
const CHIPS = [['All', 7], ['Schedule', 1], ['Updated', 2], ['New truck', 1], ['Nothing new', 1], ['Needs a look', 1], ['Failed', 1]]

function fixture(css) {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>
<style>body{margin:0}</style></head><body>
<div class="${WRAP}" style="padding:24px">
  <div id="chips" class="mt-4 flex flex-wrap gap-2">
    ${CHIPS.map(([l, n], i) => `<button id="chip${i}" class="${FILTER} ${i === 0 ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700'}">${l} ${n}</button>`).join('')}
  </div>
  <div id="card" class="${CARD}">
    ${ROWS.map(([name, chip, chipCls, summary, time], i) => `<div id="row${i}" class="${ROW}">
      <div class="${THUMB}"></div>
      <span id="name${i}" class="${NAME}">${name}</span>
      <span id="chipc${i}" class="${CHIP} ${chipCls}">${chip}</span>
      <span id="sum${i}" class="${SUMMARY}">${summary}</span>
      <span id="time${i}" class="${TIME}">${time}</span>
    </div>`).join('')}
  </div>
</div></body></html>`
}

const PROBE = `(() => {
  const box = id => { const e = document.getElementById(id); const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, top: Math.round(r.top) } }
  const rows = ${ROWS.length}
  const out = { rows: [], chips: [], doc: {
    scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth,
    card: box('card'),
  } }
  for (let i = 0; i < rows; i++) {
    out.rows.push({ row: box('row' + i), name: box('name' + i), chip: box('chipc' + i),
      sum: box('sum' + i), time: box('time' + i) })
  }
  for (let i = 0; i < ${CHIPS.length}; i++) out.chips.push(box('chip' + i))
  return out
})()`

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

/** 16" MacBook Pro, and the 27" monitor. */
const WIDTHS = [[1728, 1000, '16" MBP'], [2560, 1400, '27" monitor']]

async function measure() {
  let fails = 0
  const t = (ok, label) => { console.log(`   ${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }

  const css = appCss()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-shot-'))
  const file = path.join(tmp, 'list.html')
  fs.writeFileSync(file, fixture(css))

  for (const eng of await engines()) {
    if (eng.skip) { console.log(`   ⚠️ ${eng.name} unavailable — ${eng.skip}`); continue }
    for (const [w, h, label] of WIDTHS) {
      await eng.setViewport(w, h)
      await eng.page.goto(`file://${file}`)
      const m = await eng.page.evaluate(PROBE)
      const tag = `${eng.name} ${label} ${w}px`

      t(m.doc.scrollWidth <= m.doc.innerWidth,
        `${tag}: no sideways scroll (${m.doc.scrollWidth} ≤ ${m.doc.innerWidth})`)

      // 🔴 ONE LINE PER ROW. A row is 44px of thumbnail plus 12px of padding either side = 68. Anything
      // taller means a column wrapped, which is the failure the fixed name width and `truncate` prevent.
      const heights = m.rows.map(r => Math.round(r.row.h))
      t(heights.every(x => x <= 69), `${tag}: every row is one line (heights ${heights.join('/')})`)

      // Every child sits on the same line as its row.
      t(m.rows.every(r => r.name.top === r.row.top + 12 || Math.abs(r.name.top - r.chip.top) <= 6),
        `${tag}: the name and chip share a line in all ${m.rows.length} rows`)

      t(m.rows.every(r => Math.round(r.name.w) === 176), `${tag}: the name column is 176px (w-44)`)

      // The worst-case summary must stay inside the card and not collide with the time.
      t(m.rows.every(r => r.sum.right <= r.time.x + 1),
        `${tag}: the summary never runs into the time column`)
      t(m.rows.every(r => r.time.right <= m.doc.card.right),
        `${tag}: the time column stays inside the card`)
      t(m.rows.every(r => r.chip.w > 40 && r.chip.right <= r.sum.x + 1),
        `${tag}: the outcome chip is fully drawn and clear of the summary`)

      const chipTop = m.chips[0].top
      t(m.chips.every(c => c.top === chipTop), `${tag}: the ${m.chips.length} filter chips sit on one row`)

      const widest = Math.max(...m.rows.map(r => Math.round(r.sum.w)))
      console.log(`      ${tag}: card ${Math.round(m.doc.card.w)}px · summary column up to ${widest}px · rows ${m.rows.length}`)
    }
    await eng.close()
  }

  fs.rmSync(tmp, { recursive: true, force: true })
  if (fails) { console.log(`\n   🔴 ${fails} layout assertion(s) FAILED`); process.exitCode = 1 }
  else console.log('\n   ✅ layout measured green in every engine that ran')
}

measure().catch(e => { console.log(`   🔴 the layout run threw: ${e.message}`); process.exitCode = 1 })
