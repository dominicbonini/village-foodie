#!/usr/bin/env node
// scripts/jp-nav-1-shots.cjs — jp-nav-1 (9 November 2026; docs/compare-ux-1-report.md §12): the Japanese nav button at phone widths,
// BEFORE and AFTER. By hand: it needs `next start` serving a completed build on :3100 (read-only: the pages read the database as any
// visitor's request does; nothing is written) and, for the JP comparison page (not live today), a READ-ONLY EXPORT rendered on the
// render kit's stand-in with the same built stylesheets (scripts/_real-fonts.cjs). Chromium, motion reduced (no fade mid-shot).
//   node scripts/jp-nav-1-shots.cjs shoot <label> <outdir> <tables.json> <hashes.json>
//       /jp, /jp/features, /jp/faq (served) and the JP comparison page (stand-in) at 320, 360, 375 and 390: <outdir>/<label>-*.png and
//       <outdir>/<label>-measures.json (does the page scroll sideways? the button's edges, lines and label; "ログイン" in one line?);
//       and EVERY OTHER COUNTRY's /xx, /xx/features and /xx/faq at the same widths: a pixel hash of the first screen, into <hashes.json>
//   node scripts/jp-nav-1-shots.cjs comparison <label> <outdir> <tables.json>
//       the JP comparison page alone (no server), merged into <outdir>/<label>-measures.json
//   node scripts/jp-nav-1-shots.cjs compare <before-hashes.json> <after-hashes.json>
//       every other country's screens pixel-identical before and after (exit 1 if not)
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const REPO = path.resolve(__dirname, '..')
const [mode, ...args] = process.argv.slice(2)
const BASE = process.env.JPNAV_BASE || 'http://hatchgrab.localhost:3100'
const WIDTHS = [320, 360, 375, 390]
const JP_PAGES = [['jp', '/jp'], ['jp-features', '/jp/features'], ['jp-faq', '/jp/faq']]

// What the first screen says about the nav: the page's sideways scroll, the button and the Log in link.
const MEASURE = () => {
  const btn = document.querySelector('.hg-landing nav .nav-cta'), login = document.querySelector('.hg-landing nav .nav-only-sm')
  const lines = el => { if (!el) return null; const r = document.createRange(); r.selectNodeContents(el.querySelector('.cta-short') || el); return new Set([...r.getClientRects()].map(x => Math.round(x.top))).size }
  const b = btn?.getBoundingClientRect(), l = login?.getBoundingClientRect()
  return { pageScrollsSideways: document.documentElement.scrollWidth > innerWidth + 1, scrollWidth: document.documentElement.scrollWidth, vw: innerWidth,
    button: b ? { left: Math.round(b.left), right: Math.round(b.right), height: Math.round(b.height), lines: lines(btn), label: (btn.querySelector('.cta-short')?.textContent || '').replace(/​/g, '‸') } : null,
    loginLines: login && getComputedStyle(login).display !== 'none' ? lines(login) : null, loginRight: l ? Math.round(l.right) : null,
    // jp-nav-2: is "ログイン" shown in full — its text inside its own box, and clear of the button (when the button is to its right)?
    login: login && getComputedStyle(login).display !== 'none' ? (() => { const r = document.createRange(); r.selectNodeContents(login); const t = r.getBoundingClientRect()
      return { box: Math.round(login.clientWidth), text: Math.round(t.width), clipped: t.width > login.clientWidth + 0.5, underButton: b && b.left > l.left ? Math.max(0, Math.round(t.right - b.left)) : 0 } })() : null,
    navHeight: Math.round(document.querySelector('.hg-landing nav')?.getBoundingClientRect().height || 0) }
}

// The JP comparison page (not live today): the stand-in, public view, JP set live in the stand-in only.
async function shootComparison(browser, label, outdir, tablesFile, measures) {
  const kit = require('./_render-kit.cjs')({ cacheTag: 'jp-nav-1' })
  const FX = require('./_compare-de-1-fixtures.cjs'), RF = require('./_real-fonts.cjs')
  const tables = JSON.parse(fs.readFileSync(tablesFile, 'utf8'))
  const R = await FX.renderer(kit, 'jpnav')
  const L = await kit.bundle('jpnav-lib', ["export { translatorFor } from '@/lib/i18n/translator'", "import '@/lib/i18n/catalog/comparison'"].join('\n'))
  kit.setNow('2026-11-09T12:00:00Z'); kit.setNow = () => {}
  const t = L.translatorFor('ja-JP', 'comparison')
  const r = await R.page({ status: 'live', tables, params: { country: 'jp', section: t('path.section'), slug: t('path.slug') }, enable: ['JP'] })
  const css = `<style>${fs.readFileSync(path.join(REPO, 'app/(public)/[country]/[section]/[slug]/comparison.css'), 'utf8')}</style>`
  // The stand-in serves no /public files: the nav's logo is inlined from its real file, so the nav is laid out as served.
  const html = r.html.replace(/src="(\/logos\/[^"]+\.svg)"/g, (m, f) => `src="data:image/svg+xml;base64,${fs.readFileSync(path.join(REPO, 'public', f)).toString('base64')}"`)
  const B = RF.built()
  for (const width of WIDTHS) {
    const o = await RF.open(browser, { html: css + html, lang: 'ja-JP', width, height: 844, B })
    const m = await o.page.evaluate(MEASURE)
    await o.page.screenshot({ path: path.join(outdir, `${label}-jp-comparison-${width}.png`) })
    await o.ctx.close()
    measures[`jp-comparison-${width}`] = m
    console.log(`jp-comparison ${width}: ${JSON.stringify(m)}`)
  }
}

async function shoot(label, outdir, tablesFile, hashesFile) {
  fs.mkdirSync(outdir, { recursive: true })
  const pw = require(path.join(REPO, 'node_modules/playwright'))
  const browser = await pw.chromium.launch()
  const measures = {}
  const page = async (width, fn) => { const ctx = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' }); try { return await fn(await ctx.newPage()) } finally { await ctx.close() } }
  try {
    // 1 · the JP pages as served
    for (const [name, url] of JP_PAGES) for (const width of WIDTHS) {
      measures[`${name}-${width}`] = await page(width, async p => {
        const r = await p.goto(BASE + url, { waitUntil: 'load' })
        await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200)
        const m = { status: r.status(), ...(await p.evaluate(MEASURE)) }
        await p.screenshot({ path: path.join(outdir, `${label}-${name}-${width}.png`) })
        return m
      })
      console.log(`${name} ${width}: ${JSON.stringify(measures[`${name}-${width}`])}`)
    }
    // 2 · the JP comparison page (not live today)
    await shootComparison(browser, label, outdir, tablesFile, measures)
    fs.writeFileSync(path.join(outdir, `${label}-measures.json`), JSON.stringify(measures, null, 1) + '\n')
    // 3 · every other country's pages: a hash of the first screen's pixels
    const segs = fs.readFileSync(path.join(REPO, 'lib/marketing-country.ts'), 'utf8')
    const map = /export const COUNTRY_PATH_SEGMENTS[^=]*= \{([\s\S]*?)\}/.exec(segs)?.[1] ?? ''
    const all = [...new Set([...map.matchAll(/\b[A-Z]{2}: '([a-z]{2})'/g)].map(m => m[1]))].filter(s => s !== 'jp')
    if (all.length < 40) throw new Error(`expected every country's address, found ${all.length}`)
    const hashes = {}
    for (const seg of all) for (const sub of ['', '/features', '/faq']) for (const width of WIDTHS) {
      hashes[`/${seg}${sub}@${width}`] = await page(width, async p => {
        const r = await p.goto(`${BASE}/${seg}${sub}`, { waitUntil: 'load' })
        await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150)
        const png = await p.screenshot()
        return { status: r.status(), lang: await p.evaluate(() => document.documentElement.lang), sideways: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), png: crypto.createHash('sha256').update(png).digest('hex') }
      })
    }
    fs.writeFileSync(hashesFile, JSON.stringify(hashes, null, 1) + '\n')
    console.log(`other countries: ${Object.keys(hashes).length} screens (${all.length} countries × 3 pages × ${WIDTHS.length} widths)`)
  } finally { await browser.close() }
}

function compare(a, b) {
  const A = JSON.parse(fs.readFileSync(a, 'utf8')), B = JSON.parse(fs.readFileSync(b, 'utf8'))
  const keys = Object.keys(A)
  const diff = keys.filter(k => !B[k] || A[k].png !== B[k].png || A[k].status !== B[k].status)
  const langs = [...new Set(keys.map(k => A[k].lang))].sort()
  console.log(`${keys.length} screens of every other country (languages: ${langs.join(', ')})`)
  console.log(diff.length ? `🔴 ${diff.length} differ: ${diff.slice(0, 20).join(' ')}` : '✓ every one pixel-identical before and after')
  process.exit(diff.length || keys.length !== Object.keys(B).length ? 1 : 0)
}

;(async () => {
  if (mode === 'shoot' && args.length === 4) return shoot(...args)
  if (mode === 'compare' && args.length === 2) return compare(...args)
  if (mode === 'comparison' && args.length === 3) {
    // the JP comparison page alone, merged into <outdir>/<label>-measures.json (no server needed)
    const [label, outdir, tablesFile] = args, file = path.join(outdir, `${label}-measures.json`)
    const measures = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
    const browser = await require(path.join(REPO, 'node_modules/playwright')).chromium.launch()
    try { await shootComparison(browser, label, outdir, tablesFile, measures) } finally { await browser.close() }
    return fs.writeFileSync(file, JSON.stringify(measures, null, 1) + '\n')
  }
  console.error('usage: node scripts/jp-nav-1-shots.cjs shoot <label> <outdir> <tables.json> <hashes.json> | compare <before.json> <after.json>'); process.exit(2)
})().catch(e => { console.error(e); process.exit(1) })
