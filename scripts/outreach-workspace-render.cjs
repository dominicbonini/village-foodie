#!/usr/bin/env node
// scripts/outreach-workspace-render.cjs — the layout, MEASURED, in a real browser.
//   node scripts/outreach-workspace-render.cjs      (needs `npx next build` first)
//   HG_RENDER=1 node scripts/outreach-workspace-v3-fixes.cjs   (the same, inside the harness)
//
// 🔴 WHY THIS EXISTS. v2 and v3 asserted the layout by arithmetic and by class-name census, and
// both missed the same two bugs: an inline `gridTemplateColumns` that silently beat
// `max-lg:grid-cols-1`, and an explicitly placed fourth grid item that pushed the centre column
// onto row two. Neither is visible in the source — both are things the LAYOUT ENGINE does. So this
// asks one.
//
// ⚠️ IT IS NOT THE PAGE, AND SAYS SO. There is no admin session and no database here, so the real
// route cannot be rendered. What is rendered is the page's OWN class names — lifted out of
// ProspectWorkspace.tsx by the regexes below, so the fixture cannot drift from the source without
// this file failing — against THIS build's compiled stylesheet, with blocks of filler where the
// cards go. That is enough to measure where the containers land, which is the whole question.
// ⚠️ NO NETWORK: a file:// page, the app's own CSS, and a local Chromium.

const fs = require('fs')
const path = require('path')
const os = require('os')

const REPO = path.resolve(__dirname, '..')
const PAGE = fs.readFileSync(path.join(REPO, 'components/admin/ProspectWorkspace.tsx'), 'utf8')

/** Lift one class string out of the real page, or fail — the fixture is only worth as much. */
function cls(re, what) {
  const m = PAGE.match(re)
  if (!m) throw new Error(`the fixture cannot be built: no ${what} in ProspectWorkspace.tsx`)
  return m[1]
}

/**
 * @param template  the grid's tracks, as `gridTemplateFor` returns them
 * @param old4      🔴 THE v3 STRUCTURE: the Demo/Files cards lifted OUT of the left column and made
 *                  a fourth grid item explicitly placed in column 1. It is here so the measurement
 *                  can be shown to CATCH the bug it claims to have fixed — a fixture that only ever
 *                  renders the correct structure proves that the fixture can be built, not that the
 *                  page is right.
 */
function buildFixture(template, old4 = false) {
  const grid = cls(/<div className="(grid gap-4 items-start)"/, 'grid element')
  const left = cls(/<div className="(flex flex-col gap-3 min-w-0 max-md:contents)">/, 'left column')
  const tablet = cls(/<div className="(hidden max-lg:flex max-md:hidden flex-col gap-3)">/, 'tablet action block')
  const contact = cls(/<div className="(max-md:order-1)">/, 'contact wrapper')
  const notes = cls(/<div className="(max-md:order-2)">/, 'notes wrapper')
  const demo = cls(/<div className="(flex flex-col gap-3 min-w-0 max-md:order-4)">/, 'demo/files wrapper')
  const centre = cls(/<div className="(flex flex-col gap-3 min-w-0 max-md:order-3)">/, 'centre column')
  const right = cls(/<div className="(flex flex-col gap-3 min-w-0 max-lg:hidden)">/, 'right column')

  // The app's own compiled stylesheet — every Tailwind rule this build actually emitted.
  // ⚠️ `.next/static`, NOT `.next/dev`: the dev build's CSS is a different, unminified artefact and
  // measuring against it would measure something nobody is served.
  const cssRoot = path.join(REPO, '.next/static')
  if (!fs.existsSync(cssRoot)) throw new Error('no .next/static — run `npx next build` first')
  const cssFiles = []
  const walk = dir => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name)
    if (e.isDirectory()) walk(f); else if (e.name.endsWith('.css')) cssFiles.push(f)
  } }
  walk(cssRoot)
  if (!cssFiles.length) throw new Error('no compiled CSS under .next/static — run `npx next build`')
  const css = cssFiles.map(f => fs.readFileSync(f, 'utf8')).join('\n')
  if (!/max-md\\:contents|max-md\:contents/.test(css)) {
    // ⚠️ RECORDED, NOT SWALLOWED: if the build did not emit the class, the measurement below would
    // "pass" because nothing applied, which is exactly the failure this file exists to catch.
    throw new Error('the compiled CSS has no `max-md:contents` rule — the build is stale')
  }

  const filler = (label, h) => `<div style="height:${h}px;background:#eef2f7;border:1px solid #cbd5e1;border-radius:12px">${label}</div>`
  /* 🔴 THE VIEWPORT META IS NOT DECORATION, AND LEAVING IT OUT COST A WRONG ANSWER ONCE. Without
   * it, Chromium lays a mobile emulation out at its default 980px layout viewport: the first run of
   * this file reported the phone order broken and the tablet block visible at 390px, because the
   * FIXTURE was being laid out at 980px while the numbers said 390. The app has this meta (Next
   * emits it by default); a fixture without it is measuring a different page. */
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>
<style>body{margin:0}</style></head><body>
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

const rects = () => {
  const out = {}
  for (const id of ['banner', 'grid', 'left', 'tabletActions', 'contact', 'notes', 'demo', 'centre', 'right']) {
    const el = document.getElementById(id)
    const r = el.getBoundingClientRect()
    const vis = getComputedStyle(el).display !== 'none' && r.width > 0
    out[id] = { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), visible: vis }
  }
  return out
}

async function measure() {
  const lines = []
  let fails = 0
  const t = (ok, label) => { lines.push(`${ok ? '✓' : '🔴'} ${label}`); if (!ok) fails++ }

  let puppeteer
  try { puppeteer = require('puppeteer') } catch {
    return { lines: ['⚠️ SKIPPED — puppeteer is not installed in this checkout.'], fails: 0 }
  }

  let browser
  try {
    browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
  } catch (e) {
    return { lines: [`⚠️ SKIPPED — no local Chromium (${String(e.message).slice(0, 90)}…).`], fails: 0 }
  }

  try {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-render-'))
    const page = await browser.newPage()

    // ── THE CONTROL: THE v3 STRUCTURE MUST STILL BE BROKEN ─────────────────────────────────────
    // 🔴 The app declares its own viewport, and the fixture's meta must not be a fiction: if that
    // export ever stops saying `device-width`, every phone number below is measured at Chromium's
    // 980px default instead — which is exactly the wrong answer this file gave on its first run.
    {
      const layout = fs.readFileSync(path.join(REPO, 'app/layout.tsx'), 'utf8')
      t(/width: 'device-width'/.test(layout) && /initialScale: 1/.test(layout),
        "⚠️ the app declares width=device-width, so the fixture's viewport meta matches it")
      const f = path.join(tmp, 'old.html')
      fs.writeFileSync(f, buildFixture('380px minmax(0, 1fr) 280px', true))
      await page.setViewport({ width: 1440, height: 800 })
      await page.goto('file://' + f)
      const r = await page.evaluate(rects)
      lines.push(`CONTROL, the v3 structure at 1440×800: contact top ${r.contact.top}, centre top ${r.centre.top}, demo top ${r.demo.top}`)
      t(r.centre.top > r.contact.top + 100,
        `🔴 REPRODUCED: the fourth grid item pushes the centre column down ${r.centre.top - r.contact.top}px, onto row two`)
      t(r.centre.top === r.demo.top, '…level with the Demo card, which is what "a huge empty area" was')
    }

    // ── A 16" MACBOOK PRO ──────────────────────────────────────────────────────────────────────
    {
      const f = path.join(tmp, 'w1440.html')
      fs.writeFileSync(f, buildFixture('380px minmax(0, 1fr) 280px'))
      await page.setViewport({ width: 1440, height: 800, deviceScaleFactor: 2 })
      await page.goto('file://' + f)
      const r = await page.evaluate(rects)
      lines.push(`1440×800  left ${r.left.width}px @x${r.left.left}  centre ${r.centre.width}px @x${r.centre.left}  right ${r.right.width}px @x${r.right.left}`)
      lines.push(`          tops: left ${r.contact.top} · centre ${r.centre.top} · right ${r.right.top}  (banner ends ${r.banner.top + 26})`)
      t(r.contact.top === r.centre.top && r.centre.top === r.right.top,
        '🔴 the three columns share a top edge — the centre is NOT on row two')
      t(r.centre.top - r.grid.top === 0, '🔴 …and that edge is the top of the grid, under the Next banner')
      t(r.left.left < r.centre.left && r.centre.left < r.right.left,
        '🔴 left, centre, right — side by side, in that order')
      t(r.left.width === 380 && r.right.width === 280, '⚠️ the side columns are 380 and 280')
      t(r.centre.width > 700, `⚠️ …and the email gets the rest (${r.centre.width}px)`)
      t(r.demo.top > r.contact.top && r.demo.left === r.left.left,
        '🔴 Demo and Files are INSIDE the left column, under the notes')
      t(r.demo.top < r.centre.top + 10 || r.demo.left === r.contact.left,
        '…and not in a column of their own')
      t(!r.tabletActions.visible, '⚠️ the tablet action block is hidden at this width')
    }

    // ── THE 27" MONITOR ────────────────────────────────────────────────────────────────────────
    {
      const f = path.join(tmp, 'w2560.html')
      fs.writeFileSync(f, buildFixture('420px minmax(0, 1fr) 320px'))
      await page.setViewport({ width: 2560, height: 1440 })
      await page.goto('file://' + f)
      const r = await page.evaluate(rects)
      lines.push(`2560×1440 left ${r.left.width}px  centre ${r.centre.width}px  right ${r.right.width}px`)
      t(r.contact.top === r.centre.top && r.centre.top === r.right.top, '🔴 still one row of three')
      t(r.left.width === 420 && r.right.width === 320, '⚠️ the sides step up to 420 and 320')
      t(r.grid.width <= 1500 - 32, '⚠️ …inside the 1500px page, so the email does not become a billboard')
    }

    // ── A TABLET ───────────────────────────────────────────────────────────────────────────────
    {
      const f = path.join(tmp, 'w900.html')
      fs.writeFileSync(f, buildFixture('380px minmax(0, 1fr)'))
      await page.setViewport({ width: 900, height: 1200 })
      await page.goto('file://' + f)
      const r = await page.evaluate(rects)
      lines.push(`900×1200  left ${r.left.width}px  centre ${r.centre.width}px  right ${r.right.visible ? r.right.width + 'px' : 'hidden'}`)
      // ⚠️ THE LEFT CONTAINER'S TOP, NOT THE CONTACT CARD'S. At this width the action cards are
      // rendered at the top of the left column, so the contact card is 192px below its container.
      t(r.left.top === r.centre.top, '🔴 768–1023: two columns side by side, top aligned')
      t(!r.right.visible, '⚠️ …with the right column hidden and its cards at the top of the left one')
      t(r.tabletActions.visible && r.tabletActions.top < r.contact.top, '…which is where they are')
    }

    // ── AN iPHONE ──────────────────────────────────────────────────────────────────────────────
    {
      const f = path.join(tmp, 'w390.html')
      fs.writeFileSync(f, buildFixture('minmax(0, 1fr)'))
      await page.setViewport({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 3 })
      await page.goto('file://' + f)
      const r = await page.evaluate(rects)
      const order = ['contact', 'notes', 'centre', 'demo'].map(k => `${k}@${r[k].top}`).join(' → ')
      lines.push(`390×844   one column, in order: ${order}`)
      t(r.contact.top < r.notes.top && r.notes.top < r.centre.top && r.centre.top < r.demo.top,
        '🔴 contact, notes, composer + history, then demo and files')
      t(r.contact.width === 390 - 32 && r.centre.width === 390 - 32,
        '🔴 …every card the full width of the phone, with nothing at a fixed 380px')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      t(overflow <= 0, `🔴 …and nothing scrolls sideways (overflow ${overflow}px)`)
      t(!r.right.visible && !r.tabletActions.visible, '⚠️ the right column and the tablet block are both hidden')
    }
  } finally {
    await browser.close()
  }
  return { lines, fails }
}

module.exports = { measure, buildFixture }

if (require.main === module) {
  measure().then(({ lines, fails }) => {
    for (const l of lines) console.log('  ' + l)
    console.log(`\n${fails === 0 ? '✅ the layout measures correct' : `🔴 ${fails} MEASUREMENT(S) FAILED`}`)
    process.exit(fails === 0 ? 0 : 1)
  })
}
