#!/usr/bin/env node
// scripts/compare-ux-1-shots.cjs — compare-ux-1 §8 (8 November 2026, docs/compare-ux-1-report.md): the comparison pages as people see them,
// BEFORE and AFTER, from a READ-ONLY EXPORT of the real rows by the real page route on the render kit's stand-in, with the REAL built
// stylesheets and fonts (scripts/_real-fonts.cjs; needs a completed `npm run build`) in Chromium.
//   node scripts/compare-ux-1-shots.cjs <tables.json> <outdir> <label>
// Shoots: GB public at 390 and 1280; DE public at 390; JP public at 390 and JP's admin preview at 390 (JP has no publishable competitor
// yet, so its public view is HatchGrab alone). Measures, per view: how many product columns render, whether every column's cells have
// visible text on screen after scrolling the table sideways, whether the page itself scrolls sideways, the header row's position
// while the page scrolls past the table (sticky under the nav?), the feature column while the table scrolls sideways (sticky left?),
// the breadcrumb against the nav while scrolling, and (after) whether a cell's ⓘ opens its detail. Writes <outdir>/<label>-*.png and
// <outdir>/<label>-measures.json. By hand only (it needs an export and a build): listed in harnesses.json's excluded group.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'compare-ux-1-shots' })
const FX = require('./_compare-de-1-fixtures.cjs')
const RF = require('./_real-fonts.cjs')
const os = require('os')
const { REPO } = kit
const [file, outdir, label] = process.argv.slice(2)
if (!file || !outdir || !label) { console.error('usage: node scripts/compare-ux-1-shots.cjs <tables.json> <outdir> <label>'); process.exit(2) }

// The page's one client piece in the table, components/StickyTableHead.tsx, brought to life as the page's hydration would: the
// server's hidden <span> is replaced by the REAL component, rendered through a portal into the same box (its parent, as on the page).
async function hydrator() {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-ux1-'))
  const entry = path.join(dir, 'sth.tsx')
  fs.writeFileSync(entry, `import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'
import { StickyTableHead } from '@/components/StickyTableHead'
for (const span of Array.from(document.querySelectorAll('.cmp-scroll > span[hidden]'))) {
  const box = span.parentElement as HTMLElement; span.remove()
  createRoot(document.createElement('div')).render(createPortal(<StickyTableHead head="thead" heightVar="--cmp-head-h" pin />, box))
}`)
  const r = await esbuild.build({
    entryPoints: [entry], bundle: true, write: false, format: 'iife', platform: 'browser', jsx: 'automatic', target: 'es2020', logLevel: 'error',
    alias: { '@': REPO }, nodePaths: [path.join(REPO, 'node_modules')], define: { 'process.env.NODE_ENV': '"production"' },
  })
  return r.outputFiles[0].text
}

const VIEWS = [
  { name: 'gb-public', code: 'GB', params: { country: 'uk' }, widths: [390, 1280] },
  { name: 'de-public', code: 'DE', params: { country: 'de' }, widths: [390] },
  { name: 'jp-public', code: 'JP', params: { country: 'jp' }, widths: [390] },
  { name: 'jp-admin', code: 'JP', params: { country: 'jp' }, widths: [390], admin: true },
]

;(async () => {
  fs.mkdirSync(outdir, { recursive: true })
  const tables = JSON.parse(fs.readFileSync(file, 'utf8'))
  const R = await FX.renderer(kit, 'ux1shots')
  const L = await kit.bundle('ux1-lib', ["export { translatorFor } from '@/lib/i18n/translator'", "import '@/lib/i18n/catalog/comparison'"].join('\n'))
  kit.setNow(process.env.UX1_NOW || '2026-11-08T12:00:00Z'); kit.setNow = () => {}
  const B = RF.built()
  const css = `<style>${fs.readFileSync(path.join(REPO, 'app/(public)/[country]/[section]/[slug]/comparison.css'), 'utf8')}</style>`
  // The BEFORE page (HEAD) has no client piece in the table, so it runs without one (UX1_NOJS=1).
  const script = process.env.UX1_NOJS ? null : await hydrator()
  const pw = require(path.join(REPO, 'node_modules/playwright'))
  const browser = await pw[process.env.UX1_ENGINE || 'chromium'].launch()
  const measures = {}
  try {
    for (const v of VIEWS) {
      const cs = tables.country_settings.find(r => r.country_code === v.code)
      const t = L.translatorFor(cs.locale, 'comparison')
      const params = { ...v.params, section: t('path.section'), slug: t('path.slug') }
      const r = await R.page({ status: 'live', admin: !!v.admin, tables, params, enable: [v.code] })
      if (r.notFound) { measures[v.name] = { error: '404' }; continue }
      for (const width of v.widths) {
        const o = await RF.open(browser, { html: css + r.html, lang: cs.locale, width, height: width > 500 ? 900 : 844, B, script })
        await o.page.waitForTimeout(150)
        const page = o.page
        const m = await page.evaluate(async (process) => {
          const q = s => document.querySelector(s)
          // the site scrolls smoothly; a measurement must land where it scrolls to, at once
          document.documentElement.style.scrollBehavior = 'auto'
          const table = q('[data-table]'), scroller = table?.closest('.cmp-scroll, .cmp-x') || table?.parentElement
          const navBottom = () => { const n = document.querySelector('.hg-landing nav'); return n ? n.getBoundingClientRect().bottom : 0 }
          const cols = table ? table.querySelectorAll('thead th[data-tool]').length : 0
          const out = { cols, pageScrollsSideways: document.documentElement.scrollWidth > innerWidth + 1 }
          // what sticks out past the page's right edge (outside the table's own scroll box)
          if (out.pageScrollsSideways) out.sticksOut = [...document.querySelectorAll('body *')].filter(e => !e.closest('.cmp-scroll') && e.getBoundingClientRect().right > innerWidth + 1 && ![...e.children].some(c => c.getBoundingClientRect().right > innerWidth + 1)).slice(0, 6).map(e => `${e.tagName.toLowerCase()}.${e.className}: ${Math.round(e.getBoundingClientRect().right)} "${(e.textContent || '').trim().slice(0, 40)}"`)
          if (!table) return out
          // every column populated on screen: scroll the table to each column and check its first body cell has visible text
          const heads = [...table.querySelectorAll('thead th[data-tool]')]
          const firstRow = table.querySelector('tbody tr[data-row]')
          const populated = []
          for (let i = 0; i < heads.length; i++) {
            const cell = firstRow?.querySelectorAll('td')[i]
            if (!cell) { populated.push(false); continue }
            cell.scrollIntoView({ inline: 'center', block: 'center' })
            await new Promise(r => setTimeout(r, 60))
            const b = cell.getBoundingClientRect()
            const text = (cell.innerText || '').trim()
            populated.push(b.width > 8 && b.height > 8 && b.right > 0 && b.left < innerWidth && text.length > 0)
          }
          out.columnsPopulated = populated
          scroller.scrollLeft = 0
          // sticky header: scroll the page 150px past the table's top edge (under the nav); where is the header row?
          const thead = table.querySelector('thead')
          const tb = table.getBoundingClientRect()
          window.scrollTo(0, window.scrollY + tb.top - navBottom() + Math.min(150, tb.height / 2))
          await new Promise(r => setTimeout(r, 120))
          const hb = thead.querySelector('th[data-tool]').getBoundingClientRect()
          out.headerTopWhileScrolled = Math.round(hb.top); out.navBottom = Math.round(navBottom())
          if (process.env.UX1_DEBUG) out.debug = { scrollY, tableTop: Math.round(table.getBoundingClientRect().top), boxTop: Math.round(scroller.getBoundingClientRect().top), boxH: Math.round(scroller.getBoundingClientRect().height), transform: thead.style.transform, navs: [...document.querySelectorAll('.hg-landing nav')].map(n => n.className + ':' + Math.round(n.getBoundingClientRect().bottom)) }
          out.headerSticky = Math.abs(hb.top - navBottom()) <= 2
          out.swipeHint = (() => { const s = q('[data-swipe]'); return s ? getComputedStyle(s).display !== 'none' : null })()
          // sticky feature column: scroll the table sideways; does the row header stay at the table's left edge?
          const rowHead = table.querySelector('tbody tr[data-row] th')
          const before = rowHead.getBoundingClientRect().left
          scroller.scrollLeft = 200
          await new Promise(r => setTimeout(r, 80))
          out.featureColumnSticky = scroller.scrollWidth > scroller.clientWidth ? Math.abs(rowHead.getBoundingClientRect().left - before) <= 1 : 'no sideways scroll'
          out.tableScrollsSideways = scroller.scrollWidth > scroller.clientWidth + 1
          scroller.scrollLeft = 0
          // breadcrumb vs nav while scrolling a little
          window.scrollTo(0, 60); await new Promise(r => setTimeout(r, 80))
          const crumbs = q('.cmp-crumbs'), nb = navBottom()
          out.breadcrumbOverNav = crumbs ? (() => { const b = crumbs.getBoundingClientRect(); return b.top < nb && b.bottom > 0 && getComputedStyle(crumbs).position !== 'static' })() : null
          out.breadcrumbPosition = crumbs ? getComputedStyle(crumbs).position : null
          // the ⓘ detail (after): open the first one
          const sum = table.querySelector('details.cmp-i > summary')
          if (sum) { const d = sum.parentElement; sum.click(); await new Promise(r => setTimeout(r, 60)); out.detailOpens = d.open && (d.innerText || '').length > 2; d.open = false }
          out.legend = !!q('[data-legend]')
          out.tldr = !!q('.cmp-tldr')
          out.suitsBeforeTable = (() => { const s = q('[data-suits]'); return s ? !!(s.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING) : null })()
          window.scrollTo(0, 0)
          return out
        }, { env: { UX1_DEBUG: process.env.UX1_DEBUG || '' } })
        measures[`${v.name}-${width}`] = m
        console.log(`${v.name} ${width}: ${JSON.stringify(m)}`)
        await page.screenshot({ path: path.join(outdir, `${label}-${v.name}-${width}.png`), fullPage: true })
        // the table, in view, scrolled to its middle (sticky header visible), as people see it
        await page.evaluate(() => { document.documentElement.style.scrollBehavior = 'auto' })
        const tb = await page.locator('[data-table]').boundingBox()
        if (tb) {
          await page.evaluate(y => window.scrollTo(0, y), Math.max(0, tb.y - 72 + Math.min(220, tb.height / 3)))
          await page.waitForTimeout(150)
          await page.screenshot({ path: path.join(outdir, `${label}-${v.name}-${width}-table.png`) })
          // the ⓘ open: the first rival cell with one, tapped, as a person would
          const opened = await page.evaluate(() => {
            const d = [...document.querySelectorAll('[data-table] tbody td:not(.cmp-us) details.cmp-i')].find(x => x.querySelector('.cmp-i-body a'))
            if (!d) return false
            d.querySelector('summary').scrollIntoView({ block: 'center', inline: 'center' })
            return true
          })
          if (opened) {
            await page.locator('[data-table] tbody td:not(.cmp-us) details.cmp-i:has(.cmp-i-body a) > summary').first().click()
            await page.waitForTimeout(120)
            await page.screenshot({ path: path.join(outdir, `${label}-${v.name}-${width}-detail.png`) })
            await page.evaluate(() => document.querySelectorAll('details.cmp-i[open]').forEach(d => { d.open = false }))
          }
          if (width < 500) {
            await page.evaluate(() => { const s = document.querySelector('[data-table]').closest('.cmp-scroll, .cmp-x') || document.querySelector('[data-table]').parentElement; s.scrollLeft = 220 })
            await page.waitForTimeout(120)
            await page.screenshot({ path: path.join(outdir, `${label}-${v.name}-${width}-table-scrolled.png`) })
          }
        }
        await o.ctx.close()
      }
    }
  } finally { await browser.close() }
  fs.writeFileSync(path.join(outdir, `${label}-measures.json`), JSON.stringify(measures, null, 1) + '\n')
})().catch(e => { console.error(e); process.exit(1) })
