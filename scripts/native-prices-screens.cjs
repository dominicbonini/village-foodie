// scripts/native-prices-screens.cjs — the screenshots for docs/native-prices-report.md (22 October 2026). NOT A SWEPT
// HARNESS: it needs a completed `next build` (the production CSS in .next/static) and Playwright's WebKit and Chromium,
// and it WRITES docs/native-prices/. Run by hand after a build:
//   node scripts/native-prices-screens.cjs [before-snapshot.json]
// The pages are the fixture renders of scripts/_native-prices-fixtures.cjs (AU, NZ live; CA, SE fixtures), painted with the
// build's own stylesheets, at 390 and 1440 in both engines: the landing's pricing section, the top of /features, the top of
// /compare, and the plans PDF (its HTML at A4 width, and a printed PDF from Chromium). With a before-snapshot (the scratchpad
// snapshot of the tree before native-prices), the NZ pricing section is also shot as it was ("before-…").
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'native-prices-screens' })
const { REPO } = kit
const NP = require('./_native-prices-fixtures.cjs')
const { webkit, chromium } = require(path.join(REPO, 'node_modules/playwright'))

const OUT = path.join(REPO, 'docs/native-prices')
// The build's stylesheets (this Next version writes them beside the chunks: .next/static/chunks/*.css).
const cssDir = fs.existsSync(path.join(REPO, '.next/static/css')) ? path.join(REPO, '.next/static/css') : path.join(REPO, '.next/static/chunks')
const css = fs.readdirSync(cssDir).filter(f => f.endsWith('.css')).sort().map(f => fs.readFileSync(path.join(cssDir, f), 'utf8')).join('\n')
// ⚠️ SCREENSHOT-ONLY: the landing nav is `position: sticky`, so a shot of a section further down the page would have the nav
// painted across its top. The shots unstick it; nothing else is restyled.
const SHOT_CSS = '.hg-landing nav { position: static !important; }'
const shell = body => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style><style>${SHOT_CSS}</style></head><body>${body}</body></html>`

/** Where each page's shot is taken: an element (the whole landing pricing section) or the page top down to a marker. */
const REGION = {
  landing: { el: '#pricing' },
  features: { from: '.features-page', toAfter: '.pt-row:nth-of-type(6), .pt-group:nth-of-type(2)', max: 1300 },
  compare: { from: 'body', toAfter: 'h3, .rounded-2xl', max: 1100 },
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const R = NP.renderer(kit, REPO, 'nps')
  const html = {}
  for (const cc of ['AU', 'NZ', 'CA', 'SE']) {
    for (const p of ['landing', 'features', 'compare']) html[`${cc.toLowerCase()}-${p}`] = shell((await R.page(p, cc)).html)
    html[`${cc.toLowerCase()}-pdf`] = await R.pdf(cc)
  }
  const before = process.argv[2] ? require(path.resolve(process.argv[2])) : null
  if (before) html['before-nz-landing'] = shell(before.pages['NZ|landing'].html)

  const shots = []
  for (const [engineName, engine] of [['webkit', webkit], ['chromium', chromium]]) {
    const browser = await engine.launch()
    for (const [key, doc] of Object.entries(html)) {
      const page = key.split('-').slice(-1)[0] === 'pdf' ? 'pdf' : key.replace(/^before-/, '').split('-')[1]
      const widths = page === 'pdf' ? [794] : [390, 1440]
      for (const w of widths) {
        const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 })
        const pg = await ctx.newPage()
        await pg.setContent(doc, { waitUntil: 'load' })
        const file = path.join(OUT, `${engineName}-${key}-${w}.png`)
        if (page === 'pdf') await pg.screenshot({ path: file, fullPage: true })
        else if (page === 'landing') await pg.locator(REGION.landing.el).first().screenshot({ path: file })
        else {
          const r = REGION[page]
          const box = await pg.evaluate(([from, toAfter, max]) => {
            const a = document.querySelector(from).getBoundingClientRect()
            const ends = [...document.querySelectorAll(toAfter)].map(e => e.getBoundingClientRect().bottom + scrollY).filter(y => y > a.top + scrollY + 200)
            const bottom = Math.min(ends.length ? ends[0] + 24 : a.top + scrollY + max, a.top + scrollY + max)
            return { x: 0, y: Math.max(0, a.top + scrollY), width: document.documentElement.clientWidth, height: bottom - Math.max(0, a.top + scrollY) }
          }, [r.from, r.toAfter, r.max])
          await pg.screenshot({ path: file, clip: box, fullPage: true })
        }
        // What the shot shows, measured in the engine: the currency line's text, colour, size and alignment, and the first prices.
        const m = await pg.evaluate(() => {
          const line = [...document.querySelectorAll('p')].find(p => /^Prices in /.test(p.textContent.trim()))
          const cs = line ? getComputedStyle(line) : null
          const prices = (document.body.innerText.match(/(?:\b[A-Z]{1,3})?\$\d[\d,.]*|\d[\d   ,]*\s?kr\b/g) || []).slice(0, 4)
          return { line: line?.textContent.trim() ?? null, color: cs?.color ?? null, size: cs?.fontSize ?? null, align: cs?.textAlign ?? null, prices, scrollW: document.documentElement.scrollWidth }
        })
        shots.push({ file: path.basename(file), engine: engineName, width: w, ...m })
        await ctx.close()
      }
    }
    await browser.close()
  }
  // The printed PDFs (Chromium, the engine the app prints with), A4.
  const ch = await chromium.launch()
  for (const cc of ['nz', 'se']) {
    const pg = await ch.newPage()
    await pg.setContent(html[`${cc}-pdf`], { waitUntil: 'load' })
    await pg.pdf({ path: path.join(OUT, `plans-${cc}.pdf`), format: 'A4', printBackground: true })
    await pg.close()
  }
  await ch.close()
  fs.writeFileSync(path.join(OUT, 'measurements.json'), JSON.stringify(shots, null, 1) + '\n')
  for (const s of shots) console.log(`${s.file.padEnd(48)} line=${JSON.stringify(s.line)} ${s.color ?? ''} ${s.size ?? ''} ${s.align ?? ''} prices=${s.prices.join(' ')} scrollW=${s.scrollW}`)
})().catch(e => { console.error(e); process.exit(1) })
