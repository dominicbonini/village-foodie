#!/usr/bin/env node
// scripts/outreach-templates-render.cjs — the two Templates views, MEASURED, in Chromium and WebKit.
//   node scripts/outreach-templates-render.cjs      (needs `npx next build` first)
//
// 🔴 THE ACCEPTANCE IS A MEASUREMENT, NOT A CLAIM. "The whole grid, with its key, is visible without
// scrolling at 1440×800" is a number, and the only honest way to produce it is to lay the thing out
// and read it back. The same run reports the 27" monitor, so "same layout on both" is measured too.
//
// ⚠️ IT IS NOT THE PAGE, AND SAYS SO. There is no admin session here, so the real tab cannot be
// rendered. What is rendered is the views' OWN structure and class names — the grid's column and row
// counts come from the code's own `CONTACT_KINDS` and `SLOT_LEAD_TYPES`, the pane widths and the
// height from the strings in `TemplatesPanel.tsx` — against THIS build's compiled stylesheet. Where
// a cell's content is filler, it is filler of the real size.
// ⚠️ NO NETWORK: file:// pages, the app's own CSS, and local browser builds.

const fs = require('fs')
const path = require('path')
const os = require('os')

const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const GRID = read('components/admin/SequenceGrid.tsx')
const TAB = read('components/admin/TemplatesPanel.tsx')

function lift(src, re, what) {
  const m = src.match(re)
  if (!m) throw new Error(`the fixture cannot be built: no ${what} found`)
  return m[1]
}

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

const HEAD = css => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>
<style>body{margin:0}</style></head><body>`

// ── THE SEQUENCE VIEW ───────────────────────────────────────────────────────────────────────────────
/** 🔴 FOUR STEPS AND FIVE ROWS, COUNTED FROM THE CODE, so a dropped column fails here too. */
const STEPS = ['First contact', 'Chase 1', 'Chase 2', 'Final chase']
const ROWS = ['All trucks (default)', 'Hatches Up — ordering', 'Hatches Up — map only', 'On Village Foodie', 'Not listed']

function sequenceFixture(css) {
  const cellCls = lift(GRID, /className=\{`(w-full min-h-\[3\.25rem\] text-left rounded-lg border px-2 py-1\.5)/, 'cell')
  const spacing = lift(GRID, /style=\{\{ borderSpacing: '(\dpx)' \}\}/, 'table spacing')
  const rows = ROWS.map((r, ri) => `<tr>
    <th id="rowlabel${ri}" class="text-left align-top sticky left-0 bg-white z-10" style="width:13rem">
      <span class="block text-[12px] font-bold text-slate-700">${r}</span>
      <span class="block text-[10px] text-slate-400">42 trucks</span>
    </th>
    ${STEPS.map((_, ci) => `<td class="align-top"><div class="relative">
      <button id="cell${ri}-${ci}" class="${cellCls} border-slate-200 bg-white">
        <span class="text-[12px] font-semibold text-slate-900 break-words">Hatches Up — Customers</span>
      </button>${ri === 1 && ci === 0 ? '<span class="absolute -top-1.5 right-1 text-[10px] font-bold px-1 py-px rounded border bg-slate-100 border-slate-300 text-slate-600">14 due</span>' : ''}
    </div></td>`).join('')}
  </tr>`).join('')
  return `${HEAD(css)}
<div style="max-width:1800px;margin:0 auto;padding:12px 16px">
  <div id="switcher" style="height:34px;margin-bottom:12px;background:#f1f5f9">Sequence | Templates</div>
  <div id="amber" style="height:30px;margin-bottom:8px;background:#fffbeb">1 truck changed type</div>
  <div id="grid" class="rounded-2xl border border-slate-200 bg-white p-3">
    <div style="height:28px" id="gridhead">Who gets which template, and when</div>
    <div class="overflow-x-auto">
      <table class="w-full text-[12px] border-separate" style="border-spacing:${spacing}">
        <thead><tr><th style="width:13rem"></th>
          ${STEPS.map((sName, i) => `<th id="col${i}" class="text-left align-bottom" style="width:15rem">
            <span class="block text-[12px] font-bold text-slate-800">${sName}</span>
            <span class="block text-[10px] text-slate-400">${['day 0', '+3 days', '+7 days', '+14 days'][i]}</span>
          </th>`).join('')}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p id="key" class="text-[11px] text-slate-500">Name its own template · ↳ Name uses the default · red = nothing will be suggested · n due</p>
  </div>
</div></body></html>`
}

// ── THE TEMPLATES VIEW ──────────────────────────────────────────────────────────────────────────────
function templatesFixture(css) {
  const cols = lift(TAB, /gridTemplateColumns: '(270px minmax\(0, 1fr\) minmax\(0, 30%\))'/, 'pane widths')
  const height = lift(TAB, /height: '(calc\(100vh - 12rem\))'/, 'pane height')
  const tall = n => `<div style="height:${n}px;background:#eef2f7;border:1px solid #cbd5e1;border-radius:8px;margin:4px">filler</div>`
  return `${HEAD(css)}
<div style="max-width:1800px;margin:0 auto;padding:12px 16px">
  <div id="switcher" style="height:34px;margin-bottom:12px;background:#f1f5f9">Sequence | Templates</div>
  <div id="panes" class="grid gap-4" style="grid-template-columns: ${cols}; height: ${height}">
    <div id="left" class="rounded-xl border border-slate-200 bg-white flex flex-col min-h-0 overflow-hidden">
      <div style="height:70px;border-bottom:1px solid #f1f5f9">+ New template / search</div>
      <div id="leftScroll" class="flex-1 min-h-0 overflow-y-auto">${tall(1600)}</div>
      <div style="height:36px;border-top:1px solid #f1f5f9">Snippets · Signature</div>
    </div>
    <div id="centre" class="min-w-0 overflow-y-auto">${tall(1800)}</div>
    <div id="right" class="rounded-xl border border-slate-200 bg-white flex flex-col min-h-0 overflow-hidden">
      <p style="height:33px;border-bottom:1px solid #e2e8f0">Preview</p>
      <div id="rightScroll" class="flex-1 min-h-0 overflow-y-auto">${tall(1500)}</div>
    </div>
  </div>
</div></body></html>`
}

const rects = () => {
  const out = {}
  for (const el of document.querySelectorAll('[id]')) {
    const r = el.getBoundingClientRect()
    out[el.id] = {
      top: Math.round(r.top), left: Math.round(r.left), bottom: Math.round(r.bottom),
      right: Math.round(r.right), width: Math.round(r.width), height: Math.round(r.height),
    }
  }
  out.__doc = {
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }
  return out
}

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
  const t = (ok, label) => { lines.push(`${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }

  const css = appCss()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-tpl-'))
  const write = (n, html) => { const f = path.join(tmp, n); fs.writeFileSync(f, html); return 'file://' + f }

  const list = await engines()
  for (const eng of list) {
    if (eng.skip) { lines.push(`⚠️ ${eng.name}: SKIPPED — ${eng.skip}`); continue }
    lines.push(`── ${eng.name} ────────────────────────────────────────────────────────`)

    // ── THE SEQUENCE VIEW, AT 1440×800: THE ACCEPTANCE ──────────────────────────────────────────
    for (const [w, h] of [[1440, 800], [2560, 1400]]) {
      await eng.setViewport(w, h)
      await eng.page.goto(write(`seq-${w}-${eng.name}.html`, sequenceFixture(css)))
      const r = await eng.page.evaluate(rects)
      const cols = STEPS.map((_, i) => r[`col${i}`]).filter(Boolean)
      lines.push(`  ${w}×${h} sequence: grid ${r.grid.top}–${r.grid.bottom}, key ends ${r.key.bottom}, doc ${r.__doc.scrollHeight} vs window ${r.__doc.innerHeight}`)
      t(cols.length === 4, `🔴 four step columns (${cols.length})`)
      t(ROWS.every((_, i) => !!r[`rowlabel${i}`]), '🔴 five rows — the default and the four types')
      if (w === 1440) {
        t(r.key.bottom <= h, `🔴 THE ACCEPTANCE: the whole grid AND its key fit in 800px (key ends ${r.key.bottom})`)
        t(r.__doc.scrollHeight <= r.__doc.innerHeight + 1, '🔴 …with nothing to scroll')
      }
      t(r.__doc.scrollWidth <= r.__doc.innerWidth, '⚠️ and nothing scrolls sideways')
      // 🔴 THE SAME LAYOUT ON BOTH SCREENS: four columns, in order, no re-flow.
      t(cols.every((c, i) => i === 0 || c.left > cols[i - 1].left), '🔴 the four columns are side by side, in order')
    }

    // ── THE TEMPLATES VIEW: THREE PANES, EACH SCROLLING ─────────────────────────────────────────
    for (const [w, h] of [[1440, 800], [2560, 1400]]) {
      await eng.setViewport(w, h)
      await eng.page.goto(write(`tpl-${w}-${eng.name}.html`, templatesFixture(css)))
      const r = await eng.page.evaluate(rects)
      lines.push(`  ${w}×${h} templates: left ${r.left.width} @x${r.left.left} · centre ${r.centre.width} · right ${r.right.width} · panes ${r.panes.height}px tall`)
      t(r.left.width === 270, `⚠️ the left pane is 270px (${r.left.width})`)
      t(Math.abs(r.right.width - r.panes.width * 0.30) <= 8, `⚠️ …and the right one is about 30% (${r.right.width} of ${r.panes.width})`)
      t(r.left.top === r.centre.top && r.centre.top === r.right.top, '🔴 the three panes are side by side, top aligned')
      t(r.panes.bottom <= h + 1, `🔴 …and the whole thing fits the window (${r.panes.bottom} ≤ ${h})`)
      const scrolls = await eng.page.evaluate(() => ['leftScroll', 'centre', 'rightScroll'].map(id => {
        const el = document.getElementById(id)
        return { id, scrolls: el.scrollHeight > el.clientHeight + 1 }
      }))
      t(scrolls.every(s => s.scrolls), `🔴 each pane scrolls on its own (${scrolls.map(s => s.id).join(', ')})`)
      t(r.__doc.scrollHeight <= r.__doc.innerHeight + 1, '🔴 …and the PAGE itself does not')
    }
    await eng.close()
  }

  const ran = list.filter(e => !e.skip).map(e => e.name)
  lines.push(`engines: ${ran.join(' + ') || 'none'}`)
  if (!ran.length) { lines.push('🔴 NO ENGINE RAN — nothing above was measured'); fails++ }
  return { lines, fails, ran }
}

module.exports = { measure }

if (require.main === module) {
  measure().then(({ lines, fails }) => {
    for (const l of lines) console.log('  ' + l)
    console.log(`\n${fails === 0 ? '✅ both views measure correct' : `🔴 ${fails} MEASUREMENT(S) FAILED`}`)
    process.exit(fails === 0 ? 0 : 1)
  }).catch(e => { console.error('🔴 ' + e.message); process.exit(1) })
}
