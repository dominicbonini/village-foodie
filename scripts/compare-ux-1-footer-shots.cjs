#!/usr/bin/env node
// scripts/compare-ux-1-footer-shots.cjs — compare-ux-1 §6 / §8 (8 November 2026, docs/compare-ux-1-report.md): the footer's "Compare" link
// as people see it. The real landing page (app/(public)/[country]/page.tsx) on the render kit's stand-in, with the REAL built stylesheets
// and fonts (scripts/_real-fonts.cjs; needs a completed `npm run build`), in Chromium:
//   node scripts/compare-ux-1-footer-shots.cjs <tables.json> <outdir>
// <tables.json> is a READ-ONLY EXPORT of the real rows (as compare-ux-1-shots.cjs takes); the FAQ is the committed fixture world's
// (scripts/_perf-1-tables.cjs), so the footer carries FAQ as on the live site. Countries are switched on, and their comparison 'live',
// IN THE STAND-IN ONLY — nothing is written anywhere.
//   1 · en-GB, fr-FR, de-DE, ja-JP at 360, 430 and 1280: photographs of the footer (<outdir>/footer-<loc>-<width>.png, the full viewport
//       width, so clipping would show) and the links in reading order, row by row;
//   2 · every language base (+ en-GB) at 360 and 430 with Compare: no sideways overflow, every item ≥ 44px, four to a row (the ninth,
//       the country menu, on a row of its own and centred);
//   3 · a country whose comparison is not live (and one with it 'admin', as the public sees it): no Compare link.
// Writes <outdir>/footer-measures.json. By hand only (it needs an export and a build): listed in harnesses.json's excluded group.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'compare-ux-1-footer' })
const FX = require('./_compare-de-1-fixtures.cjs')
const RF = require('./_real-fonts.cjs')
const P1T = require('./_perf-1-tables.cjs')
const { REPO, h } = kit
const [file, outdir] = process.argv.slice(2)
if (!file || !outdir) { console.error('usage: node scripts/compare-ux-1-footer-shots.cjs <tables.json> <outdir>'); process.exit(2) }

const LANG_SEG = { 'en-GB': ['GB', 'uk'], 'fr-FR': ['FR', 'fr'], 'de-DE': ['DE', 'de'], 'es-ES': ['ES', 'es'], 'it-IT': ['IT', 'it'], 'pt-PT': ['PT', 'pt'], 'nl-NL': ['NL', 'nl'],
  'sv-SE': ['SE', 'se'], 'da-DK': ['DK', 'dk'], 'nb-NO': ['NO', 'no'], 'pl-PL': ['PL', 'pl'], 'cs-CZ': ['CZ', 'cz'], 'hu-HU': ['HU', 'hu'], 'sk-SK': ['SK', 'sk'], 'ro-RO': ['RO', 'ro'],
  'hr-HR': ['HR', 'hr'], 'sl-SI': ['SI', 'si'], 'fi-FI': ['FI', 'fi'], 'et-EE': ['EE', 'ee'], 'lv-LV': ['LV', 'lv'], 'lt-LT': ['LT', 'lt'], 'el-GR': ['GR', 'gr'], 'bg-BG': ['BG', 'bg'],
  'pt-BR': ['BR', 'br'], 'ms-MY': ['MY', 'my'], 'ja-JP': ['JP', 'jp'], 'zh-HK': ['HK', 'hk'], 'th-TH': ['TH', 'th'], 'ar-AE': ['AE', 'ae'] }
const SHOOT = ['en-GB', 'fr-FR', 'de-DE', 'ja-JP']

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${JSON.stringify(detail).slice(0, 900)}` : '')) } }

;(async () => {
  fs.mkdirSync(outdir, { recursive: true })
  const exp = JSON.parse(fs.readFileSync(file, 'utf8'))
  const world = await P1T.tables(kit)
  const R = await FX.renderer(kit, 'ux1foot')
  kit.setNow('2026-11-08T12:00:00Z'); kit.setNow = () => {}
  const B = RF.built()
  const tablesWith = status => ({ ...exp, faq_sections: world.faq_sections, faq_items: world.faq_items, faq_translations: world.faq_translations,
    country_settings: exp.country_settings.map(r => ({ ...r, enabled: true, comparison_status: status(r.country_code) })),
    // auto-publish would make a country live whatever its own status: a country set to anything but 'live' has it switched off.
    comparison_publish: (exp.comparison_publish || []).map(p => (status(p.country_code) === 'live' ? p : { ...p, admin_off: true })) })
  const landing = (seg, code, status) => R.req({ status: 'live', tables: tablesWith(c => (c === code ? status : 'off')), enable: [code] },
    () => R.ctx.prerender(h(R.M.Landing, { params: Promise.resolve({ country: seg }), searchParams: Promise.resolve({}) })))
  const pw = require(path.join(REPO, 'node_modules/playwright'))
  const browser = await pw[process.env.UX1_ENGINE || 'chromium'].launch()
  const measure = page => page.evaluate(() => {
    const f = document.querySelector('footer'), box = f.querySelector('.foot-links')
    const items = [...box.children].filter(e => e.getBoundingClientRect().height > 0).map(e => { const b = e.getBoundingClientRect(); return { t: (e.querySelector('.cc-btn') || e).textContent.trim().slice(0, 24), cmp: e.classList.contains('foot-compare'), x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), sw: e.scrollWidth, cw: e.clientWidth } })
    const rtl = document.dir === 'rtl'
    const rowsY = [...new Set(items.map(i => i.y))].sort((a, b) => a - b)
    const rows = rowsY.map(y => items.filter(i => i.y === y).sort((a, b) => (rtl ? b.x - a.x : a.x - b.x)).map(i => i.t))
    const cc = f.querySelector('.foot-links > .cc')?.getBoundingClientRect(), ccBtn = f.querySelector('.foot-links > .cc .cc-btn')?.getBoundingClientRect()
    return { n: items.length, rows, compare: items.some(i => i.cmp), overflow: items.filter(i => i.sw > i.cw + 1).map(i => i.t), short: items.filter(i => i.h < 44).map(i => `${i.t} ${i.h}px`),
      footerSW: f.scrollWidth, footerCW: f.clientWidth, pageSW: document.documentElement.scrollWidth, vw: innerWidth,
      ccCentred: cc && ccBtn ? Math.abs((ccBtn.left + ccBtn.right) / 2 - (box.getBoundingClientRect().left + box.getBoundingClientRect().right) / 2) <= 2 : null }
  })
  const out = { shots: {}, all: {}, none: {} }
  try {
    console.log('── 1 · the footer in en-GB, fr-FR, de-DE and ja-JP (Compare live)')
    for (const loc of SHOOT) {
      const [code, seg] = LANG_SEG[loc]
      const html = await landing(seg, code, 'live')
      for (const width of [360, 430, 1280]) {
        const o = await RF.open(browser, { html, lang: loc, width, height: width > 500 ? 900 : 844, B })
        const m = await measure(o.page)
        out.shots[`${loc}-${width}`] = m
        const fb = await o.page.locator('footer').boundingBox()
        await o.page.screenshot({ path: path.join(outdir, `footer-${loc}-${width}.png`), fullPage: true, clip: { x: 0, y: fb.y, width, height: fb.height } })
        await o.ctx.close()
        t(`${loc} at ${width}px: Compare in the row, nothing overflows — "${m.rows.map(r => r.join(' · ')).join(' / ')}"`, m.compare && m.footerSW <= m.footerCW && m.pageSW <= m.vw + 1 && !m.overflow.length, m)
      }
    }
    console.log('\n── 2 · every language at 360 and 430 with Compare: no overflow, ≥ 44px, four to a row')
    for (const [loc, [code, seg]] of Object.entries(LANG_SEG)) {
      const html = await landing(seg, code, 'live')
      for (const width of [360, 430]) {
        const o = await RF.open(browser, { html, lang: loc, width, height: 844, B })
        out.all[`${loc}-${width}`] = await measure(o.page)
        await o.ctx.close()
      }
    }
    const all = Object.entries(out.all)
    // AE has no comparison address (no page), so no link: eight items there, as before.
    const withCmp = all.filter(([k]) => !k.startsWith('ar-AE'))
    t('Compare is in the row in every language with a comparison address (AE has none)', withCmp.every(([, m]) => m.compare) && all.filter(([k]) => k.startsWith('ar-AE')).every(([, m]) => !m.compare), all.filter(([k, m]) => m.compare === k.startsWith('ar-AE')).map(([k]) => k))
    t('no footer is wider than the phone, and no page scrolls sideways because of it, in any language', all.every(([, m]) => m.footerSW <= m.footerCW), all.filter(([, m]) => m.footerSW > m.footerCW).map(([k, m]) => [k, m.footerSW, m.footerCW]))
    t('no footer item overflows its column (labels wrap)', all.every(([, m]) => !m.overflow.length), all.filter(([, m]) => m.overflow.length).map(([k, m]) => [k, m.overflow]))
    t('every footer item is at least 44px tall', all.every(([, m]) => !m.short.length), all.filter(([, m]) => m.short.length).map(([k, m]) => [k, m.short]))
    t('four to a row: nine items read 4 / 4 / 1 (the country menu alone, centred); eight read 4 / 4', all.every(([, m]) => (m.n === 9 ? JSON.stringify(m.rows.map(r => r.length)) === '[4,4,1]' && m.ccCentred : m.n === 8 && JSON.stringify(m.rows.map(r => r.length)) === '[4,4]')), all.map(([k, m]) => [k, m.n, m.rows.map(r => r.length)]))
    const en = out.all['en-GB-360']
    t('English reads "Features · Pricing · FAQ · Compare / About · Privacy · Terms · Contact / GB"', JSON.stringify(en.rows.slice(0, 2)) === JSON.stringify([['Features', 'Pricing', 'FAQ', 'Compare'], ['About', 'Privacy', 'Terms', 'Contact']]) && en.rows[2]?.length === 1, en.rows)
    console.log('\n── 3 · no live comparison → no link')
    for (const [loc, status] of [['en-GB', 'off'], ['fr-FR', 'off'], ['de-DE', 'admin']]) {
      const [code, seg] = LANG_SEG[loc]
      const html = (await landing(seg, code, status)).replace(/<script\b[\s\S]*?<\/script>/g, '')
      const links = (/<div class="foot-links">([\s\S]*?)<div class="cc/.exec(html)?.[1].match(/<a /g) || []).length
      out.none[`${loc}-${status}`] = { link: /foot-compare/.test(html), links }
      t(`${loc} with its comparison '${status}': no Compare link in the public HTML (${links} links, as before)`, !/foot-compare|data-footer-comparison/.test(html) && links === 7)
    }
  } finally { await browser.close() }
  fs.writeFileSync(path.join(outdir, 'footer-measures.json'), JSON.stringify(out, null, 1) + '\n')
  console.log(`\ncompare-ux-1-footer-shots: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
