// scripts/us-layout-audit/D-print/plans-pdf.cjs — US layout audit, group D-print, surface 4: the plans PDF.
// Its only date is the "Generated {date}" stamp in the header row (ISO yyyy-mm-dd in every country); it shows no times.
// The REAL buildPlansPdfHtml(GB row / US row from the seeds) is painted in WebKit at the page's printable width
// (A4 210 mm = 794 px, US Letter 8.5 in = 816 px, @96 dpi) and the header row is measured: does the stamp stay on the
// title's row, and does anything overflow. The header strip is screenshotted for the sheet.
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '../../..')
const F = require('./_fixtures.cjs')
const LP = require('../../_lp1e-fixtures.cjs')
const kit = require('../../_render-kit.cjs')({ cacheTag: 'usaudit-D-print' })
const OUT = path.join(REPO, 'docs/us-layout-audit/D-print')

;(async () => {
  const m = await kit.bundle('plans-pdf', "export { buildPlansPdfHtml, pdfPaperOf } from '@/lib/plans-pdf'")
  const { webkit } = require('playwright')
  const browser = await webkit.launch()
  const res = {}
  for (const c of ['GB', 'US']) {
    kit.setNow(F.NOW[c])
    const s = c === 'GB' ? LP.GB() : LP.US_ON()   // the US with fixture prices (the seed leaves them undecided)
    const html = m.buildPlansPdfHtml(s)
    const paper = m.pdfPaperOf(s)
    const W = paper.format === 'Letter' ? 816 : 794
    const page = await browser.newPage({ viewport: { width: W, height: 1000 }, deviceScaleFactor: 1 })
    await page.route('**/*', r => r.request().url().startsWith('data:') ? r.continue() : r.abort())
    await page.setContent(html)
    res[c] = await page.evaluate(() => {
      const head = document.querySelector('.doc-head'); const gen = document.querySelector('.gen'); const h1 = head.querySelector('h1')
      const hb = head.getBoundingClientRect(), gb = gen.getBoundingClientRect(), tb = h1.getBoundingClientRect()
      return { gen: gen.textContent, headH: Math.round(hb.height), genTop: Math.round(gb.top), titleTop: Math.round(tb.top), genRight: Math.round(gb.right), headRight: Math.round(hb.right),
        headOverflow: head.scrollWidth - head.clientWidth, docOverflow: document.documentElement.scrollWidth - window.innerWidth }
    })
    res[c].paper = paper.format; res[c].width = W
    const box = await page.evaluate(() => { const r = document.querySelector('.doc-head').getBoundingClientRect(); return { x: 0, y: 0, width: window.innerWidth, height: Math.ceil(r.bottom + 12) } })
    await page.screenshot({ path: path.join(OUT, `plans-pdf-head-${W}-${c.toLowerCase()}.png`), clip: box })
    await page.close()
  }
  await browser.close()
  fs.writeFileSync(path.join(__dirname, 'plans-pdf-measure.json'), JSON.stringify(res, null, 1))
  console.log(JSON.stringify(res, null, 1))
})().catch(e => { console.error(e); process.exit(1) })
