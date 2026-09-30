#!/usr/bin/env node
// scripts/outreach-workspace-render.cjs — the layout, MEASURED, in real browsers.
//   node scripts/outreach-workspace-render.cjs      (needs `npx next build` first)
//   HG_RENDER=1 node scripts/outreach-workspace-v4.cjs   (the same, inside the harness)
//
// 🔴 WHY THIS EXISTS. v2 and v3 asserted the layout by arithmetic and by class-name census, and
// between them they missed three bugs that only a layout engine can see: an inline
// `gridTemplateColumns` that silently beat `max-lg:grid-cols-1`, an explicitly placed fourth grid
// item that pushed the centre column onto row two, and `field-sizing: content` collapsing a
// ten-row box to one line in the browser Dominic actually uses. So this asks browsers, plural.
//
// 🔴 WEBKIT AS WELL AS CHROMIUM, BECAUSE THE BROWSER IS SAFARI. The v3-fixes run was Chromium only,
// and that is exactly how a one-line notes box shipped. WebKit comes from Playwright, Chromium from
// the puppeteer already in the repo. Either missing ⇒ that engine is SKIPPED AND SAID SO, never
// silently passed.
//
// ⚠️ IT IS NOT THE PAGE, AND SAYS SO. There is no admin session and no database here, so the real
// route cannot be rendered. What is rendered is the page's OWN class names and its OWN numbers —
// lifted out of the source by the regexes below, so the fixture cannot drift without this file
// failing — against THIS build's compiled stylesheet, with filler where the content goes.
// ⚠️ NO NETWORK: file:// pages, the app's own CSS, and local browser builds.

const fs = require('fs')
const path = require('path')
const os = require('os')

const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const PAGE = read('components/admin/ProspectWorkspace.tsx')
const CW = read('components/admin/ComposeWindow.tsx')
const ED = read('components/admin/RichEmailEditor.tsx')
const TL = read('components/admin/ProspectTimeline.tsx')
const SHARED = read('components/admin/outreach-shared.tsx')
const LIB = read('lib/outreach-workspace.ts')

/** Lift one class string (or number) out of the real source, or fail — the fixture is only worth as
 *  much as its agreement with the page. */
function lift(src, re, what) {
  const m = src.match(re)
  if (!m) throw new Error(`the fixture cannot be built: no ${what} found in the source`)
  return m[1]
}
const num = (src, re, what) => Number(lift(src, re, what))

// ── THE APP'S OWN STYLESHEET ────────────────────────────────────────────────────────────────────────
function appCss() {
  // ⚠️ `.next/static`, NOT `.next/dev`: the dev build's CSS is a different, unminified artefact and
  // measuring against it would measure something nobody is served.
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
  if (!/max-md\\?:contents/.test(css)) throw new Error('the compiled CSS has no `max-md:contents` rule — the build is stale')
  return css
}

/* 🔴 THE VIEWPORT META IS NOT DECORATION, AND LEAVING IT OUT COST A WRONG ANSWER ONCE. Without it,
 * a mobile emulation lays out at the engine's default 980px layout viewport: the first run of this
 * file reported the phone order broken because the FIXTURE was being laid out at 980px while the
 * numbers said 390. The app declares the same thing in `app/layout.tsx`, and a check below holds it
 * to that. */
const HEAD = css => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>
<style>body{margin:0}</style></head><body>`

const filler = (label, h) =>
  `<div style="height:${h}px;background:#eef2f7;border:1px solid #cbd5e1;border-radius:12px">${label}</div>`

// ════════════════════════════════════════════════════════════════════════════════════════════════
// FIXTURE 1 — THE THREE COLUMNS
// ════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * @param old4  🔴 THE v3 STRUCTURE: the Demo/Files cards lifted OUT of the left column and made a
 *              fourth grid item explicitly placed in column 1. It is here so the measurement can be
 *              shown to CATCH the bug it claims to have fixed — a fixture that only ever renders
 *              the correct structure proves the fixture can be built, not that the page is right.
 */
function layoutFixture(css, template, old4 = false) {
  const grid = lift(PAGE, /<div className="(grid gap-4 items-start)"/, 'grid element')
  const left = lift(PAGE, /<div className="(flex flex-col gap-3 min-w-0 max-md:contents)">/, 'left column')
  const tablet = lift(PAGE, /<div className="(hidden max-lg:flex max-md:hidden flex-col gap-3)">/, 'tablet action block')
  const contact = lift(PAGE, /<div className="(max-md:order-1)">/, 'contact wrapper')
  const notes = lift(PAGE, /<div className="(max-md:order-2)">/, 'notes wrapper')
  const demo = lift(PAGE, /<div className="(flex flex-col gap-3 min-w-0 max-md:order-4)">/, 'demo/files wrapper')
  const centre = lift(PAGE, /<div className="(flex flex-col gap-3 min-w-0 max-md:order-3)">/, 'centre column')
  const right = lift(PAGE, /<div className="(flex flex-col gap-3 min-w-0 max-lg:hidden)">/, 'right column')

  return `${HEAD(css)}
<div style="max-width:1500px;margin:0 auto;padding:0 16px">
  <div id="banner" style="height:26px;margin-bottom:8px;background:#fef3c7">Next</div>
  <div id="grid" class="${grid}" style="grid-template-columns: ${template}">
    <div id="left" class="${left}">
      <div id="tabletActions" class="${tablet}">${filler('actions (tablet only)', 180)}</div>
      <div id="contact" class="${contact}">${filler('contact', 220)}</div>
      <div id="notes" class="${notes}">${filler('notes', 420)}</div>
      ${old4 ? '' : `<div id="demo" class="${demo}">${filler('demo', 160)}${filler('files', 160)}</div>`}
    </div>
    ${old4 ? `<div id="demo" style="grid-column: 1" class="${demo}">${filler('demo', 160)}${filler('files', 160)}</div>` : ''}
    <div id="centre" class="${centre}">${filler('tabs + composer', 380)}${filler('history', 400)}</div>
    <div id="right" class="${right}">${filler('log in one click', 300)}</div>
  </div>
</div></body></html>`
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// FIXTURE 2 — THE COMPOSER, AND HOW MUCH HISTORY IS LEFT UNDER IT
// ════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * 🔴 THE ACCEPTANCE, AS A MEASUREMENT RATHER THAN AS ARITHMETIC. v3 answered "how many history rows
 * fit at 1440×800" by adding up class names on paper, and it was wrong twice over: once about which
 * editor was even on screen, and once about a box that turned out to be `rows={18}`.
 * ⚠️ THE SIZES ARE LIFTED FROM THE SOURCE — the editor's height from `COMPOSE_DEFAULT_PX`, the row
 * and control classes from the components — so the fixture cannot quietly disagree with the page it
 * claims to measure. The content is filler; the boxes are the real sizes.
 */
function composerFixture(css, editorPx) {
  const tabsRow = lift(PAGE, /<div className="(flex items-center gap-1 border-b border-slate-200)">/, 'tab strip')
  const tabBtn = lift(PAGE, /className=\{`(text-sm font-bold px-3 py-2 -mb-px border-b-2 max-md:min-h-11)/, 'tab button')
  const toLine = lift(CW, /<div className="(flex flex-wrap items-baseline gap-x-3 gap-y-1 text-\[13px\])">/, 'To line')
  const toolbar = lift(ED, /<div className="(flex items-center gap-1\.5 border-b[^"]*)">/, 'editor toolbar')
  const histControls = lift(TL, /<div className="(flex flex-wrap items-center gap-2 mb-2)">/, 'history controls')
  const histList = lift(TL, /<div className="(border border-slate-200 rounded-xl bg-white divide-y[^"]*)">/, 'history list')
  const histRow = lift(TL, /className=\{`(w-full text-left px-3 py-1\.5 max-md:py-2\.5 max-md:min-h-11 flex items-start gap-2)/, 'history row')
  const chip = 'text-xs font-bold px-2 py-1 rounded-lg border border-slate-300 bg-white'
  const sendBtn = 'text-sm font-bold px-3 py-1.5 rounded-lg border border-slate-300 bg-white'
  const rows = Array.from({ length: 12 }, (_, i) =>
    `<button class="${histRow}" id="row${i}"><span class="w-5"></span><span class="w-20">16 Sep</span>` +
    `<span class="flex-1 min-w-0 truncate">Re: Ordering costs · When is a good time to speak?</span></button>`).join('')

  return `${HEAD(css)}
<div style="max-width:1500px;margin:0 auto;padding:12px 16px">
  <div id="header" style="height:38px;margin-bottom:8px;background:#f1f5f9">Pig-Casso's · stage · queue</div>
  <div id="banner" style="height:26px;margin-bottom:8px;background:#fef3c7">Next — follow up</div>
  <div class="grid gap-4 items-start" style="grid-template-columns: 380px minmax(0, 1fr) 280px">
    <div class="flex flex-col gap-3 min-w-0">${filler('contact', 220)}${filler('notes', 420)}</div>
    <div id="centre" class="flex flex-col gap-3 min-w-0">
      <div class="${tabsRow}"><button class="${tabBtn}">Email</button><button class="${tabBtn}">Call</button><button class="${tabBtn}">WhatsApp</button></div>
      <div class="space-y-2">
        <div class="${toLine}"><span>To</span><span>Stephen Connon</span><span>info@pigcassoscatering.co.uk</span><span>Re: Ordering costs</span></div>
        <div class="flex flex-wrap items-center gap-2"><button class="${chip}">Blank</button><button class="${chip}">Hatches Up — Customers</button><button class="${chip}">Chase 1</button><button class="${chip}">Attach file</button></div>
        <div class="border border-slate-200 rounded-lg">
          <div class="${toolbar}"><button class="${chip}">B</button><button class="${chip}">Small</button><button class="${chip}">Insert signature</button></div>
          <div id="editor" style="height:${editorPx}px;overflow-y:auto;resize:vertical">${filler('a first-contact template, eleven lines', 600)}</div>
        </div>
        <div class="flex items-center gap-2 flex-wrap"><span class="text-[11px]">Send test to me goes only to you.</span><span class="ml-auto flex gap-2"><button class="${sendBtn}" id="sendTest">Send test to me</button><button class="${sendBtn}" id="send">Send · follow up 3 Oct</button></span></div>
      </div>
      <div class="flex flex-col">
        <div class="${histControls}" id="histControls"><span>All</span><span>Conversation</span><span>Notes &amp; changes</span><span>Search</span></div>
        <div class="${histList}">${rows}</div>
      </div>
    </div>
    <div class="flex flex-col gap-3 min-w-0">${filler('log in one click', 300)}</div>
  </div>
</div></body></html>`
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// FIXTURE 3 — TEN ROWS MEANS TEN ROWS
// ════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * 🔴 THE CONTROL IS THE POINT. The first box is the page's box; the second is the same box with the
 * `field-sizing: content` that was removed. If the engine implements the property the control
 * collapses to about one line — the Safari bug, reproduced — and if it does not, the two are the
 * same height and this says so rather than claiming a fix it cannot see.
 */
function textareaFixture(css, rows) {
  const field = lift(SHARED, /export const FIELD_CLS = '([^']+)'/, 'FIELD_CLS')
  return `${HEAD(css)}
<div style="max-width:420px;padding:16px">
  <textarea id="notes" rows="${rows}" class="${field} w-full resize-y" placeholder="Add a note…"></textarea>
  <textarea id="control" rows="${rows}" class="${field} w-full resize-y" style="field-sizing: content" placeholder="Add a note…"></textarea>
</div></body></html>`
}

// ── WHAT THE PAGE MEASURES TO ───────────────────────────────────────────────────────────────────────
const rects = () => {
  const out = {}
  for (const el of document.querySelectorAll('[id]')) {
    const r = el.getBoundingClientRect()
    out[el.id] = {
      top: Math.round(r.top), left: Math.round(r.left), bottom: Math.round(r.bottom),
      width: Math.round(r.width), height: Math.round(r.height),
      visible: getComputedStyle(el).display !== 'none' && r.width > 0,
    }
  }
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
  const t = (ok, label) => { lines.push(`${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }

  const css = appCss()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-render-'))
  const write = (name, html) => { const f = path.join(tmp, name); fs.writeFileSync(f, html); return 'file://' + f }

  // The page's own numbers, so the fixture and the page cannot disagree about what is being measured.
  const editorPx = num(LIB, /export const COMPOSE_DEFAULT_PX = composeHeightForLines\(COMPOSE_DEFAULT_LINES\)\s*\/\/\s*(\d+)/, 'COMPOSE_DEFAULT_PX')
  const noteRows = num(LIB, /export const NOTE_BOX_ROWS = (\d+)/, 'NOTE_BOX_ROWS')

  const list = await engines()
  for (const eng of list) {
    if (eng.skip) { lines.push(`⚠️ ${eng.name}: SKIPPED — ${eng.skip}`); continue }
    lines.push(`── ${eng.name} ────────────────────────────────────────────────────────`)

    // ── THE CONTROL: THE v3 STRUCTURE MUST STILL BE BROKEN ──────────────────────────────────────
    {
      await eng.setViewport(1440, 800)
      await eng.page.goto(write(`old-${eng.name}.html`, layoutFixture(css, '380px minmax(0, 1fr) 280px', true)))
      const r = await eng.page.evaluate(rects)
      t(r.centre.top > r.contact.top + 100,
        `🔴 CONTROL: the v3 fourth grid item still pushes the centre column ${r.centre.top - r.contact.top}px down`)
    }

    // ── THE THREE COLUMNS ───────────────────────────────────────────────────────────────────────
    {
      await eng.setViewport(1440, 800)
      await eng.page.goto(write(`w1440-${eng.name}.html`, layoutFixture(css, '380px minmax(0, 1fr) 280px')))
      const r = await eng.page.evaluate(rects)
      lines.push(`  1440×800 left ${r.left.width}@x${r.left.left} · centre ${r.centre.width}@x${r.centre.left} · right ${r.right.width}@x${r.right.left}`)
      t(r.contact.top === r.centre.top && r.centre.top === r.right.top, '🔴 the three columns share a top edge')
      t(r.left.width === 380 && r.right.width === 280, '⚠️ the side columns are 380 and 280')
      t(r.demo.left === r.left.left && r.demo.top > r.notes.top, '🔴 Demo and Files are inside the left column')
      t(!r.tabletActions.visible, '⚠️ the tablet action block is hidden at this width')
    }
    {
      await eng.setViewport(390, 844)
      await eng.page.goto(write(`w390-${eng.name}.html`, layoutFixture(css, 'minmax(0, 1fr)')))
      const r = await eng.page.evaluate(rects)
      lines.push(`  390×844  order: contact@${r.contact.top} → notes@${r.notes.top} → centre@${r.centre.top} → demo@${r.demo.top}`)
      t(r.contact.top < r.notes.top && r.notes.top < r.centre.top && r.centre.top < r.demo.top,
        '🔴 contact, notes, composer + history, then demo and files')
      const overflow = await eng.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      t(overflow <= 0, `🔴 nothing scrolls sideways (overflow ${overflow}px)`)
    }

    // ── v4 ITEM 1: THE ACCEPTANCE ───────────────────────────────────────────────────────────────
    {
      await eng.setViewport(1440, 800)
      await eng.page.goto(write(`compose-${eng.name}.html`, composerFixture(css, editorPx)))
      const r = await eng.page.evaluate(rects)
      const visibleRows = Object.keys(r).filter(k => /^row\d+$/.test(k) && r[k].bottom <= 800).length
      lines.push(`  1440×800 editor ${r.editor.height}px · Send row ends ${r.send.bottom} · History heading ${r.histControls.top}–${r.histControls.bottom} · ${visibleRows} rows fully visible`)
      t(r.editor.height === editorPx, `🔴 the editor is exactly its default height (${editorPx}px), whatever is in it`)
      t(r.send.bottom <= 800, '🔴 the whole composer including the Send row is on screen')
      t(r.histControls.bottom <= 800, '🔴 …and so is the History heading')
      t(visibleRows >= 3, `🔴 …with ${visibleRows} history rows under it (3 required)`)
      const scrolls = await eng.page.evaluate(() => {
        const el = document.getElementById('editor')
        return el.scrollHeight > el.clientHeight
      })
      t(scrolls, '⚠️ a long email scrolls inside the editor rather than growing the page')
    }

    // ── v4 ITEM 2: TEN ROWS IS TEN ROWS ─────────────────────────────────────────────────────────
    {
      await eng.setViewport(1440, 900)
      await eng.page.goto(write(`ta-${eng.name}.html`, textareaFixture(css, noteRows)))
      const r = await eng.page.evaluate(rects)
      const supported = r.control.height < r.notes.height - 20
      lines.push(`  notes box ${r.notes.height}px · the same box WITH field-sizing ${r.control.height}px · ${supported ? 'this engine implements field-sizing' : 'this engine ignores field-sizing'}`)
      t(r.notes.height >= 10 * 16, `🔴 the empty ${noteRows}-row box is ${r.notes.height}px — at least ten lines`)
      if (supported) t(r.control.height < 60, `🔴 REPRODUCED: with field-sizing the same box collapses to ${r.control.height}px`)
      else lines.push('  ⚠️ the collapse could not be reproduced here — this engine does not implement field-sizing')
    }

    await eng.close()
  }

  // ⚠️ The fixture's viewport meta must match the app's, or every phone number above is measured at
  // the engine's 980px default instead of at 390.
  const layout = read('app/layout.tsx')
  t(/width: 'device-width'/.test(layout) && /initialScale: 1/.test(layout),
    "⚠️ the app declares width=device-width, so the fixture's viewport meta matches it")

  const ran = list.filter(e => !e.skip).map(e => e.name)
  lines.push(`engines: ${ran.join(' + ') || 'none'}`)
  if (!ran.length) { lines.push('🔴 NO ENGINE RAN — nothing above was measured'); fails++ }
  return { lines, fails, ran }
}

module.exports = { measure }

if (require.main === module) {
  measure().then(({ lines, fails }) => {
    for (const l of lines) console.log('  ' + l)
    console.log(`\n${fails === 0 ? '✅ the layout measures correct' : `🔴 ${fails} MEASUREMENT(S) FAILED`}`)
    process.exit(fails === 0 ? 0 : 1)
  }).catch(e => { console.error('🔴 ' + e.message); process.exit(1) })
}
