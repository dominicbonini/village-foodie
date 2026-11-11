// scripts/pricing-copy-1-screens.cjs — the screenshots for docs/pricing-copy-1-report.md (11 November 2026). NOT A SWEPT HARNESS:
// it needs a running local dev server (`npx next dev -p 3123`) and Playwright's Chromium, and it WRITES docs/pricing-copy-1/.
// Run by hand:   node scripts/pricing-copy-1-screens.cjs before|after
// The country pages answer only on a HatchGrab host (proxy.ts, cwv-2), so the pages are opened at hatchgrab.localhost:3123 — a
// loopback name, the same local server. Each shot is the pricing section (#pricing) cut out of a FULL-PAGE screenshot, so anything
// the viewport would clip shows as clipped (an element screenshot would hide it). Nothing is written anywhere but docs/.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
const fs = require('fs')
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const { chromium } = require(path.join(REPO, 'node_modules/playwright'))

const phase = process.argv[2]
if (phase !== 'before' && phase !== 'after') { console.error('usage: node scripts/pricing-copy-1-screens.cjs before|after'); process.exit(2) }
const BASE = process.env.PC1_BASE || 'http://hatchgrab.localhost:3123'
const OUT = path.join(REPO, 'docs/pricing-copy-1')

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  const bad = []
  try {
    for (const country of ['uk', 'fr']) {
      for (const width of [390, 1280]) {
        const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 })
        const errors = []
        page.on('pageerror', e => errors.push(String(e)))
        await page.goto(`${BASE}/${country}`, { waitUntil: 'networkidle', timeout: 300000 })
        const sec = page.locator('#pricing').first()
        await sec.waitFor({ timeout: 60000 })
        // ⚠️ SCREENSHOT-ONLY (as scripts/canada-1-screens.cjs): the sticky nav would be painted across the section's top, and the dev
        // server's own "N" badge is not part of the page.
        await page.addStyleTag({ content: 'nav { position: static !important; } nextjs-portal { display: none !important; }' })
        await sec.scrollIntoViewIfNeeded()
        await page.waitForTimeout(800)
        const box = await page.evaluate(() => { const r = document.querySelector('#pricing').getBoundingClientRect(); return { x: 0, y: r.top + window.scrollY, width: document.documentElement.clientWidth, height: r.height } })
        const sideways = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
        if (sideways) bad.push(`${country} ${width}: the page scrolls sideways`)
        if (errors.length) bad.push(`${country} ${width}: ${errors.join(' | ')}`)
        const file = path.join(OUT, `${phase}-${country}-${width}.png`)
        await page.screenshot({ path: file, fullPage: true, clip: box })
        const text = await sec.innerText()
        fs.writeFileSync(path.join(OUT, `${phase}-${country}-${width}.txt`), text)
        console.log('wrote', path.relative(REPO, file))
        await page.close()
      }
    }
  } finally { await browser.close() }
  if (bad.length) { console.log('PROBLEMS:\n  ' + bad.join('\n  ')); process.exit(1) }
})().catch(e => { console.error(e); process.exit(1) })
