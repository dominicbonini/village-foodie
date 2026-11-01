#!/usr/bin/env node
// scripts/world-countries-1-identity.cjs — world-countries-1 (31 October 2026, docs/world-countries-1-report.md §4): EVERY LIVE
// COUNTRY IS BYTE-IDENTICAL, apart from the one named change (the tagline).
//   node scripts/world-countries-1-identity.cjs capture <file>    render and write the captures (run once at HEAD, in a worktree)
//   node scripts/world-countries-1-identity.cjs compare <file>    render the working tree and compare with that capture
// What is rendered, for the 37 live countries (GB US IE AU NZ CA, France and the 29 European rows — all switched on, as the database
// is): the landing, /features and /compare pages (HTML and metadata), the plans PDF, the sitemap and /llms.txt. Only modules that
// exist at HEAD are used (europe-settings' and native-prices' fixtures), so the same script runs on both sides.
// ⚠️ RE-PINNED (world-countries-1, tagline): the ONE allowed difference is the tagline's removal — the hero's
// <p class="hero-tag">…</p> and the footer's <p class="foot-tag">…</p> are cut out of the HEAD capture before comparing; every
// other byte must match. In compare mode the eight new rows are ALSO added switched off, and must change nothing.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const kit = require('./_render-kit.cjs')({ cacheTag: 'world-countries-1-identity' })
const EF = require('./_europe-settings-fixtures.cjs')
const NP = require('./_native-prices-fixtures.cjs')
const { REPO } = kit
const [, , mode, file] = process.argv
if (!['capture', 'compare'].includes(mode) || !file) { console.error('usage: capture|compare <file>'); process.exit(2) }

const SEG = Object.fromEntries([...fs.readFileSync(path.join(REPO, 'lib/marketing-country.ts'), 'utf8').matchAll(/\b([A-Z]{2}): '([a-z]{2})'/g)].map(m => [m[1], m[2]]))

async function render(extraRows) {
  const R = EF.renderer(kit, `wc1id-${mode}`)
  // France's prices beside the europe-settings catalogue (as the live table has them).
  for (const p of NP.CATALOG().prices.filter(p => p.countryCode === 'FR')) if (!R.catalog.prices.some(x => x.countryCode === 'FR' && x.planKey === p.planKey)) { R.catalog.prices.push(p); R.tables.plan_prices.push(require('./_lp1e-fixtures.cjs').snake(p)) }
  const europe = EF.sqlRows().rows.map(r => r.country_code)
  const rows = [...EF.rowsWith(europe), NP.FR(), ...extraRows]
  const live = rows.filter(r => r.enabled).map(r => r.countryCode)
  const out = {}
  for (const cc of live) for (const p of ['landing', 'features', 'compare']) {
    const P = await R.page(p, SEG[cc], rows)
    out[`${cc}/${p}`] = { html: P.html, meta: JSON.stringify(P.meta), redirectedTo: P.redirectedTo }
  }
  for (const cc of live) out[`${cc}/pdf`] = { html: await R.pdf(rows, cc) }
  out.sitemap = { html: JSON.stringify(await R.sitemap(rows)) }
  out.llms = { html: await R.llms(rows) }
  return out
}
const cutTagline = s => (s == null ? s : s.replace(/<p class="hero-tag">[\s\S]*?<\/p>/g, '').replace(/<p class="foot-tag">[\s\S]*?<\/p>/g, ''))

;(async () => {
  if (mode === 'capture') {
    const out = await render([])
    fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(out)))
    console.log(`captured ${Object.keys(out).length} views → ${file}`)
    return
  }
  const before = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)))
  const after = await render([])
  const WF = require('./_world-countries-1-fixtures.cjs')
  const W2 = require('./_lp-world-countries-2.cjs')
  const withWorldOff = await render(WF.sqlRows().rows.map(r => WF.camelRow(r, false)))
  let pass = 0, fail = 0, cut = 0, relinked = 0
  // legal-languages-1: which countries' pages link a translation — the country's locale, through lib/legal.ts's own legalBaseOf.
  const LL1 = await (async () => {
    const M = await kit.bundle('wc1id-legal', "export { legalBaseOf } from '@/lib/legal'")
    const rows = [...EF.rowsWith(EF.sqlRows().rows.map(r => r.country_code)), NP.FR()]
    return { legalBaseOf: M.legalBaseOf, localeOf: cc => rows.find(r => r.countryCode === cc)?.locale ?? null }
  })()
  const t = (label, ok, d) => { if (ok) pass++; else { fail++; console.log('  🔴 ' + label + (d ? `\n      ${String(d).slice(0, 600)}` : '')) } }
  t(`the same ${Object.keys(before).length} views`, JSON.stringify(Object.keys(before).sort()) === JSON.stringify(Object.keys(after).sort()))
  for (const k of Object.keys(before)) {
    const b = before[k], a = after[k]
    if (!a) continue
    let bh = cutTagline(b.html)
    if (bh !== b.html) cut++
    // ⚠️ RE-PINNED (world-countries-2, 1 November 2026): the Terms (§4) and the Country-specific terms (eight countries) were
    // re-dated 1 November 2026, so the sitemap's /terms and /country-terms lastmod move to 2026-11-01 — PRECISE, those two
    // entries only (scripts/_lp-world-countries-2.cjs sitemapLegal); every other byte still compared.
    if (k === 'sitemap' && W2.LANDED) {
      const moved = JSON.stringify(W2.sitemapLegal(JSON.parse(bh)))
      t('sitemap: world-countries-2 moved exactly the /terms and /country-terms lastmod', moved !== bh)
      bh = moved
    }
    // ⚠️ RE-PINNED (legal-languages-1, 1 November 2026): the legal documents are translated, and a NON-ENGLISH country's pages link
    // its own translations — /fr/privacy, /fr/terms, /fr/country-terms in place of /privacy … (lib/legal.ts legalPath). PRECISE: only
    // those three hrefs, only on a country whose language is not English (lib/legal.ts legalBaseOf); every English country, and
    // every other byte, still compared as captured.
    const cc = k.split('/')[0]
    if (/^[A-Z]{2}$/.test(cc) && LL1.legalBaseOf(LL1.localeOf(cc)) && bh) {
      const moved = bh.replace(/href="\/(privacy|terms|country-terms)"/g, (_, d) => `href="/${SEG[cc]}/${d}"`)
      if (moved !== bh) relinked++
      bh = moved
    }
    const firstDiff = (x, y) => { let i = 0; while (i < x.length && x[i] === y[i]) i++; return `…${x.slice(Math.max(0, i - 120), i + 120)}… ≠ …${y.slice(Math.max(0, i - 120), i + 120)}…` }
    t(`${k}: HTML identical apart from the tagline`, bh === a.html, bh && a.html ? firstDiff(bh, a.html) : `${typeof bh} / ${typeof a.html}`)
    t(`${k}: metadata identical`, (b.meta ?? null) === (a.meta ?? null), b.meta && a.meta ? firstDiff(b.meta, a.meta) : '')
    t(`${k}: with the eight new rows present and switched off, identical again`, JSON.stringify(withWorldOff[k]) === JSON.stringify(a))
  }
  console.log(`\n${fail ? '🔴' : '✅'} world-countries-1-identity: ${pass} passed, ${fail} failed — ${Object.keys(before).length} views; the tagline cut from ${cut} of them; ${relinked} relinked to their country's translated legal pages (legal-languages-1) (every landing page's hero and footer, every /features and /compare footer)`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
