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
  /* ⚠️ RESTATED: the height is no longer a constant in the source to lift — it is measured from the
   * panes' own top edge at runtime, which is the fix for item 4. This fixture applies the same rule
   * (the script tag below) instead of copying a number that no longer exists. */
  const gutter = Number(lift(TAB, /const BOTTOM_GUTTER_PX = (\d+)/, 'bottom gutter'))
  const tall = n => `<div style="height:${n}px;background:#eef2f7;border:1px solid #cbd5e1;border-radius:8px;margin:4px">filler</div>`
  return `${HEAD(css)}
<div style="max-width:1800px;margin:0 auto;padding:12px 16px">
  <div id="switcher" style="height:34px;margin-bottom:12px;background:#f1f5f9">Sequence | Templates</div>
  <div id="panes" class="grid gap-4" style="grid-template-columns: ${cols}">
    <div id="left" class="rounded-xl border border-slate-200 bg-white flex flex-col min-h-0 overflow-hidden">
      <div style="height:70px;border-bottom:1px solid #f1f5f9">+ New template / search</div>
      <div id="leftScroll" class="flex-1 min-h-0 overflow-y-auto">${tall(1600)}</div>
      <div style="height:36px;border-top:1px solid #f1f5f9">Snippets · Signature</div>
    </div>
    <div id="centre" class="min-w-0 min-h-0 overflow-y-auto">${tall(1800)}</div>
    <div id="right" class="rounded-xl border border-slate-200 bg-white flex flex-col min-h-0 overflow-hidden">
      <p style="height:33px;border-bottom:1px solid #e2e8f0">Preview</p>
      <div id="rightScroll" class="flex-1 min-h-0 overflow-y-auto">${tall(1500)}</div>
    </div>
  </div>
</div>
<script>
  // 🔴 NOT \`var top\`. At global scope that is \`window.top\` — the top frame, and READ-ONLY, so the
  // assignment fails silently, the value stays a Window, and the height becomes the invalid
  // 'calc(100vh - [object Window]16px)' which the browser drops. The fixture then measured a page
  // with no height rule at all and reported the very failure it exists to catch.
  var el = document.getElementById('panes')
  var paneTop = Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY))
  var pad = Math.round(parseFloat(getComputedStyle(el.parentElement).paddingBottom || '0') || 0)
  el.style.height = 'calc(100vh - ' + (paneTop + pad + ${gutter}) + 'px)'
</script>
</body></html>`
}

/**
 * 🔴 THE REAL PAGE STRUCTURE, NOT JUST THE PANEL. The last report measured the three panes in a
 * fixture with nothing above them, where `calc(100vh - 12rem)` happened to be right — and in the
 * admin shell it was not, so the page scrolled in production and the left list moved with it. This
 * fixture puts back what is actually above the panel: the sticky admin header (51px — the tab bar
 * is positioned at `top-[51px]`, which is where that number comes from), the sticky tab strip, and
 * the shell's own `px-4 pt-3 pb-6` container.
 * ⚠️ AND IT SETS THE HEIGHT THE WAY THE COMPONENT DOES — by measuring the panes' own top edge —
 * rather than by repeating a constant. If the mechanism is wrong, this fails.
 *
 * 🔴 THE CENTRE PANE IS THE EDITOR'S OWN BLOCKS NOW, NOT ONE FILLER DIV — because the overlap
 * reported on 30 September could not happen to a filler. The editor is a flex column of blocks
 * that have a size of their own (the name row, the subject, the hint, the "values" box, the
 * warnings, Save) around ONE block that takes the slack (the message). A filler div shrinks
 * happily; a `rows={15}` textarea does not, and that difference IS the bug: the label around it
 * was squeezed by `flex-shrink`, the textarea kept its 404px, and the blocks below — later
 * siblings, so painted on top — landed across its bottom.
 * ⚠️ `broken: true` BUILDS THE PRE-FIX SHAPE (a `block` label, no `shrink-0` anywhere) so the
 * overlap check below is shown catching it before it is trusted on the real one.
 */
function shellFixture(css, { broken = false } = {}) {
  const cols = lift(TAB, /gridTemplateColumns: '(270px minmax\(0, 1fr\) minmax\(0, 30%\))'/, 'pane widths')
  const gutter = Number(lift(TAB, /const BOTTOM_GUTTER_PX = (\d+)/, 'bottom gutter'))
  const tall = n => `<div style="height:${n}px;background:#eef2f7;border:1px solid #cbd5e1;border-radius:8px;margin:4px">filler</div>`
  /* 🔴 THE ONE CLASS THE FIX TURNS ON. Every block with a size of its own refuses to shrink; the
   * message is the only thing that gives. `broken` leaves them all shrinkable, as the source was. */
  const fixed = broken ? '' : 'shrink-0'
  /* The two wrappers around the message. `min-h-0` on them is what let the write block be shrunk
   * below its own content, and a shrunken block does not clip: its content painted over the boxes
   * that follow. Lifted from the source so the fixture cannot describe a shape the panel has not. */
  /* The message's own classes, LIFTED, because its floor is the whole of the short-window
   * behaviour: at `min-h-0` it is squeezed towards nothing and the column goes on "fitting". */
  const msgClass = lift(TAB, /<label className="(flex-1 min-h-\[\d+rem\] flex flex-col)">/, 'the message label')
  return `${HEAD(css)}
<header id="appheader" style="position:sticky;top:0;z-index:50;height:51px;background:#0f172a"></header>
<div id="tabbar" style="position:sticky;top:51px;z-index:40;height:41px;background:#0f172a;border-bottom:1px solid #334155"></div>
<div class="w-full max-w-[1800px] mx-auto px-4 pt-3 pb-6">
  <div id="switcher" class="flex items-center gap-3 flex-wrap mb-2" style="height:34px">Sequence | Templates</div>
  <div id="panes" class="grid gap-4" style="grid-template-columns: ${cols}">
    <div id="left" class="rounded-xl border border-slate-200 bg-white flex flex-col min-h-0 overflow-hidden">
      <div style="height:70px;border-bottom:1px solid #f1f5f9">+ New template / search</div>
      <div id="leftScroll" class="flex-1 min-h-0 overflow-y-auto">${tall(1600)}</div>
      <div style="height:36px;border-top:1px solid #f1f5f9">Snippets · Signature</div>
    </div>
    <div class="min-w-0 min-h-0">
      <div id="editor" class="rounded-xl border border-slate-200 bg-white p-4 h-full min-h-0 flex flex-col">
        ${broken ? `<div id="centre" class="space-y-3 flex-1 min-h-0 overflow-y-auto flex flex-col">
        <div id="nameBlock" style="height:60px">Template name</div>
        <div id="writeBlock" class="pt-3 border-t border-slate-100 flex-1 min-h-0 flex flex-col">
          <div class="space-y-3 flex-1 min-h-0 flex flex-col">
            <div id="subjectBlock" style="height:40px">Subject</div>
            <div id="msgLabel" style="height:20px">Message</div>
            <div id="bracesHint" class="text-[11px] text-slate-500" style="height:15px">{{double braces}} / [[square brackets]]</div>
            <label id="message" class="block">
              <textarea id="body" rows="15" class="w-full border border-slate-300 rounded-lg px-2 py-1.5 resize-y">${'a line of the email\n'.repeat(40)}</textarea>
            </label>
          </div>
        </div>
        <div id="valuesBox" class="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5" style="height:64px">Values this message fills in</div>
        <div id="warnBox" class="text-[12px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2" style="height:44px">Half of a conditional pair</div>
        <div id="save" class="flex justify-end mt-auto pt-2"><button class="text-sm font-bold px-3 py-1.5 rounded-lg bg-slate-900 text-white">Save template</button></div>
      </div>` : `<div id="centre" class="flex-1 min-h-0 overflow-y-auto space-y-3 flex flex-col">
        <div id="nameBlock" class="${fixed}" style="height:60px">Template name</div>
        <div id="writeBlock" class="${fixed} border-t border-slate-100"></div>
        <div id="subjectBlock" class="${fixed}" style="height:40px">Subject</div>
        <div id="msgLabel" class="${fixed}" style="height:20px">Message</div>
        <!-- the small grey braces hint, which v2 item 3 keeps under the Message label -->
        <div id="bracesHint" class="${fixed} text-[11px] text-slate-500" style="height:15px">{{double braces}} / [[square brackets]]</div>
        <label id="message" class="${msgClass}">
          <textarea id="body" rows="15" class="w-full border border-slate-300 rounded-lg px-2 py-1.5 flex-1 min-h-0 resize-none">${'a line of the email\n'.repeat(40)}</textarea>
        </label>
        <div id="valuesBox" class="${fixed} rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5" style="height:64px">Values this message fills in</div>
        <div id="warnBox" class="${fixed} text-[12px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-2.5 py-2" style="height:44px">Half of a conditional pair</div>
      </div>
      <div id="save" class="shrink-0 flex justify-end pt-2"><button class="text-sm font-bold px-3 py-1.5 rounded-lg bg-slate-900 text-white">Save template</button></div>`}
      </div>
    </div>
    <div id="right" class="rounded-xl border border-slate-200 bg-white flex flex-col min-h-0 overflow-hidden">
      <p style="height:33px;border-bottom:1px solid #e2e8f0">Preview</p>
      <div class="flex-1 min-h-0 flex flex-col">
        <div class="p-3 space-y-2 flex-1 min-h-0 flex flex-col">
          <div style="height:90px">Search trucks… / picker / simulate</div>
          <pre id="previewBody" class="flex-1 min-h-0 overflow-y-auto" style="margin:0">${'a long email\n'.repeat(120)}</pre>
          <div id="previewFooter" style="height:24px">Dropped · Footer appended</div>
        </div>
      </div>
    </div>
  </div>
</div>
<script>
  // ⚠️ THE COMPONENT'S OWN RULE, run here: measure the panes' top and take the rest of the window.
  // 🔴 NOT \`var top\`. At global scope that is \`window.top\` — the top frame, and READ-ONLY, so the
  // assignment fails silently, the value stays a Window, and the height becomes the invalid
  // 'calc(100vh - [object Window]16px)' which the browser drops. The fixture then measured a page
  // with no height rule at all and reported the very failure it exists to catch.
  var el = document.getElementById('panes')
  var paneTop = Math.max(0, Math.round(el.getBoundingClientRect().top + window.scrollY))
  var pad = Math.round(parseFloat(getComputedStyle(el.parentElement).paddingBottom || '0') || 0)
  el.style.height = 'calc(100vh - ' + (paneTop + pad + ${gutter}) + 'px)'
</script>
</body></html>`
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
    // ── THE REAL PAGE STRUCTURE: THE ACCEPTANCE ─────────────────────────────────────────────────
    for (const [w, h] of [[1440, 800], [2560, 1400]]) {
      await eng.setViewport(w, h)
      await eng.page.goto(write(`shell-${w}-${eng.name}.html`, shellFixture(css)))
      const r = await eng.page.evaluate(rects)
      lines.push(`  ${w}×${h} in the admin shell: panes top ${r.panes.top}, height ${r.panes.height}, doc ${r.__doc.scrollHeight} vs window ${r.__doc.innerHeight}`)
      t(r.__doc.scrollHeight === r.__doc.innerHeight,
        `🔴 THE ACCEPTANCE: the document is exactly the window (${r.__doc.scrollHeight} = ${r.__doc.innerHeight}) — the page does not scroll`)
      t(r.save.bottom <= h && r.save.top >= 0, `🔴 …and Save is on screen (${r.save.top}–${r.save.bottom})`)
      t(r.previewFooter.bottom <= h, `🔴 …and so is the preview footer (ends ${r.previewFooter.bottom})`)
      /* ── 🔴 RESTATED (30 September, the overlap fix) ───────────────────────────────────────
       * This asked all three panes to be SCROLLING. Two still must: the template list and the
       * preview body both hold more than fits. The CENTRE no longer does, and that is the fix
       * rather than a regression — the message box now takes exactly the space the fixed blocks
       * leave, so at these two sizes the editor fits and there is nothing to scroll. Asking it
       * to scroll here would be asking for content the pane cannot show. The short-window case,
       * where it must scroll rather than squeeze, is measured on its own below. */
      const inner = await eng.page.evaluate(() => ['leftScroll', 'previewBody'].map(id => {
        const el = document.getElementById(id)
        return { id, scrolls: el.scrollHeight > el.clientHeight + 1 }
      }))
      t(inner.every(x => x.scrolls), `🔴 …while the list and the preview scroll inside themselves (${inner.map(x => x.id).join(', ')})`)
      t(r.switcher.top - r.tabbar.bottom <= 16,
        `⚠️ the switcher sits under the tab strip, not 80px below it (${r.switcher.top - r.tabbar.bottom}px)`)
      /* ── 🔴 NOTHING IN THE EDITOR IS DRAWN ON TOP OF ANYTHING ELSE ─────────────────────────
       * The reported symptom: the "values" box and the conditional warning printed across the
       * bottom of the message box. In a flex column that is one thing — a block that was
       * shrunk while its own content was not — so it is measured as one thing: every block
       * starts at or below the bottom of the block before it. */
      const stack = ['nameBlock', 'writeBlock', 'subjectBlock', 'msgLabel', 'bracesHint', 'message', 'valuesBox', 'warnBox']
      const bad = stack.slice(1).filter((id, i) => r[id].top < r[stack[i]].bottom - 1)
      t(bad.length === 0, `🔴 no block overlaps the one above it (${bad.length ? 'OVERLAPPING: ' + bad.join(', ') : stack.length + ' blocks, in order'})`)
      t(r.save.top >= r.centre.bottom - 1, `🔴 …and Save is BELOW the scroller, not inside it (${r.save.top} ≥ ${r.centre.bottom})`)
      t(r.body.bottom <= r.valuesBox.top + 1,
        `🔴 …and the message box ENDS where the values box begins (${r.body.bottom} ≤ ${r.valuesBox.top})`)
    }

    /* ── 🔴 THE CONTROL: THE PRE-FIX SHAPE MUST STILL OVERLAP ─────────────────────────────────
     * A `block` label around a `rows=15` textarea, and no `shrink-0` on anything — the source as
     * it was. If this does NOT overlap, the check above is measuring nothing and the fix cannot
     * be said to have fixed anything. */
    {
      await eng.setViewport(1440, 800)
      await eng.page.goto(write(`shell-broken-${eng.name}.html`, shellFixture(css, { broken: true })))
      const r = await eng.page.evaluate(rects)
      const over = r.valuesBox.top < r.body.bottom - 1
      lines.push(`  1440×800 CONTROL, the pre-fix shape: message ends ${r.body.bottom}, values box starts ${r.valuesBox.top}`)
      t(over, `🔴 REPRODUCED: without shrink-0 the values box is drawn ${r.body.bottom - r.valuesBox.top}px up inside the message`)
    }

    /* ── 🔴 A SHORT WINDOW SCROLLS THE PANE, IT DOES NOT SQUEEZE THE WRITING BOX ──────────────
     * `min-h-[7rem]` on the message is what makes this true: without a floor the box is squeezed
     * towards nothing and the column goes on "fitting", which is a writing screen with nowhere
     * to write. With it, the column overflows and the pane's own `overflow-y-auto` takes over. */
    {
      await eng.setViewport(1440, 600)
      await eng.page.goto(write(`shell-short-${eng.name}.html`, shellFixture(css)))
      const r = await eng.page.evaluate(rects)
      const centreScrolls = await eng.page.evaluate(() => {
        const el = document.getElementById('centre')
        return el.scrollHeight > el.clientHeight + 1
      })
      lines.push(`  1440×600 short window: message ${r.body.height}px tall, centre ${centreScrolls ? 'scrolls' : 'does not scroll'}, doc ${r.__doc.scrollHeight} vs window ${r.__doc.innerHeight}`)
      t(r.body.height >= 112, `🔴 the message keeps at least seven rems of writing room (${r.body.height}px)`)
      t(centreScrolls, '🔴 …and the PANE scrolls instead')
      t(r.__doc.scrollHeight === r.__doc.innerHeight, '🔴 …while the page still does not')
      /* ⚠️ `save` IS NOT IN THIS STACK, and that is the point of moving it: it is pinned below
       * the scroller, so at a height where the editor scrolls it is nowhere near the last block
       * inside it. Its own two checks follow. */
      const stack = ['nameBlock', 'writeBlock', 'subjectBlock', 'msgLabel', 'bracesHint', 'message', 'valuesBox', 'warnBox']
      const bad = stack.slice(1).filter((id, i) => r[id].top < r[stack[i]].bottom - 1)
      t(bad.length === 0, `🔴 …and nothing overlaps at this height either (${bad.length ? 'OVERLAPPING: ' + bad.join(', ') : 'in order'})`)
      t(r.save.bottom <= 600 && r.save.top >= r.centre.bottom - 1,
        `🔴 …and Save is STILL on screen, under the scrolling editor (${r.save.top}–${r.save.bottom})`)
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
