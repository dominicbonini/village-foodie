#!/usr/bin/env node
// scripts/world-countries-3.cjs — world-countries-3 (1 November 2026, docs/world-countries-3-report.md): THREE LEGAL TEXT FIXES, IN
// ENGLISH AND EVERY TRANSLATION.
//   node scripts/world-countries-3.cjs
//   1  ENGLISH — exactly the three named sentences changed (scripts/_lp-world-countries-3.cjs EDITS): Mexico's complaints authority
//      named (the Secretaría Anticorrupción y Buen Gobierno and the federal law it enforces, in force since 21 March 2025); Terms §3
//      pointing at Section 10, which IS "Data protection"; Canada's Quebec line saying a Canadian French version is not yet
//      available. The UAE section is unchanged ("the UAE Data Office");
//   2  THE DATES — moved exactly as the legal-date rule requires, which here is not at all: both changed documents and
//      TERMS_VERSION already carry 1 November 2026, the date of this change; PRIVACY_UPDATED is untouched (no privacy edit);
//   3  EVERY TRANSLATION (28 language bases) — at the same place as each English paragraph: Mexico's paragraph names the Secretaría
//      in Spanish, as written, and the date's day and year; Terms §3 points at 10, never 9; both files stamped with today's
//      English and the same structure (scripts/_legal-translations.cjs compare). ⚠️ Canada's reworded clause is a sentence in each
//      language with no fixed token to test; its before and after are listed per language in docs/world-countries-3-report.md;
//   4  THE PAGES — /country-terms (English) and /mx/country-terms (es-ES, read by Mexico) render the named authority.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'world-countries-3' })
const { REPO, h } = kit
const L = require('./_legal-translations.cjs')
const W3 = require('./_lp-world-countries-3.cjs')
const LP1E = require('./_lp1e-fixtures.cjs')
const WF = require('./_world-countries-1-fixtures.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const BASES = JSON.parse('[' + /export const LANGUAGE_BASES[^=]*= \[([^\]]*)\]/.exec(read('lib/i18n/locales.ts'))[1].replace(/'/g, '"') + ']')
const SEC = 'Secretaría Anticorrupción y Buen Gobierno'
const text = s => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ')

// A paragraph at the same place in a translation as in the English: its section's index and its offset in that section.
const locate = s => { const ps = s.split(/\n{2,}/); let sec = -1; return { ps, idx: ps.map(p => (/^## /.test(p) ? ++sec : sec)) } }
const placeOf = (file, start) => {
  const E = locate(read(`content/legal/${file}`)); const i = E.ps.findIndex(p => p.startsWith(start))
  if (i < 0) throw new Error(`no English paragraph starting ${start}`)
  const sec = E.idx[i], off = i - E.idx.indexOf(sec)
  return s => { const T = locate(s); return T.ps[T.idx.indexOf(sec) + off] }
}

;(async () => {
  head('1 · ENGLISH — exactly the three named sentences')
  const country = read('content/legal/country-specific-terms.md'), terms = read('content/legal/terms-and-conditions.md')
  for (const [file, before, after] of W3.EDITS) {
    const s = read(file)
    t(`${file}: "${after.slice(0, 70)}…" once, the old words gone`, s.split(after).length === 2 && !s.includes(before))
  }
  const sectionOf = (s, re) => { const i = s.search(re); const j = s.indexOf('\n## ', i + 4); return s.slice(i, j < 0 ? s.length : j) }
  t('Terms §3\'s reference is to Section 10, which is "Data protection"', /^## 10\. Data protection$/m.test(terms) && sectionOf(terms, /^## 3\./m).includes('Section 10 sets out how we handle that data'))
  const mexico = sectionOf(country, /^## Mexico$/m), uae = sectionOf(country, /^## United Arab Emirates$/m)
  t('Mexico: complaints go to the Secretaría Anticorrupción y Buen Gobierno, named in Spanish with its English name, the law and its date', mexico.includes(`${SEC} (Secretariat of Anti-Corruption and Good Governance), which enforces Mexico's Federal Law on the Protection of Personal Data Held by Private Parties (in force since 21 March 2025)`) && !mexico.includes('Mexican authority responsible'))
  // The whole UAE section is pinned byte for byte by scripts/world-countries-2.cjs (HEAD + the eight sections, through asBefore).
  t('the UAE section is as it was — it still names "the UAE Data Office" and not the Mexican Secretaría', uae.includes('UAE Data Office') && !uae.includes(SEC))
  t('Canada: Quebec waits because "a Canadian French version is not yet available"', sectionOf(country, /^## Canada$/m).includes('because a Canadian French version is not yet available,'))

  head('2 · THE DATES — the legal-date rule: both changed documents and TERMS_VERSION already carry 1 November 2026')
  const legal = read('lib/legal.ts'), legalHead = execSync('git show HEAD:lib/legal.ts', { cwd: REPO, encoding: 'utf8' })
  const val = (s, k) => new RegExp(`export const ${k} = '([^']+)'`).exec(s)?.[1]
  t(`TERMS_UPDATED and COUNTRY_TERMS_UPDATED are '1 November 2026', as each document's own line; TERMS_VERSION '2026-11-01' (the latest)`,
    val(legal, 'TERMS_UPDATED') === '1 November 2026' && val(legal, 'COUNTRY_TERMS_UPDATED') === '1 November 2026' && val(legal, 'TERMS_VERSION') === '2026-11-01'
    && terms.includes('**Last updated:** 1 November 2026') && country.includes('**Last updated:** 1 November 2026'))
  t(`PRIVACY_UPDATED is unchanged ('${val(legalHead, 'PRIVACY_UPDATED')}') — the Privacy Policy is not edited`, val(legal, 'PRIVACY_UPDATED') === val(legalHead, 'PRIVACY_UPDATED')
    && read('content/legal/privacy-policy.md') === execSync('git show HEAD:content/legal/privacy-policy.md', { cwd: REPO, encoding: 'utf8' }))

  head(`3 · EVERY TRANSLATION (${BASES.length}) — the same three changes, at the same places`)
  const mx = placeOf('country-specific-terms.md', '**Complaints.** Tell us first at privacy@hatchgrab.com. If you are not satisfied, you can complain to the Secretaría')
  const ca = placeOf('country-specific-terms.md', '**Quebec, Saskatchewan and Manitoba.**')
  const t3 = placeOf('terms-and-conditions.md', "**Your customers' data.**")
  const bad = []
  for (const b of BASES) {
    const c = fs.readFileSync(L.translationPath(b, 'country-specific-terms.md'), 'utf8'), tt = fs.readFileSync(L.translationPath(b, 'terms-and-conditions.md'), 'utf8')
    const m = mx(c), q = ca(c), s3 = t3(tt)
    if (!m.includes(SEC) || !/21/.test(m) || !m.includes('2025')) bad.push(`${b} Mexico: ${m.slice(0, 120)}`)
    if (!/(?<!\d)10(?!\d)/.test(s3) || /(?<!\d)9(?!\d)/.test(s3)) bad.push(`${b} Terms §3: ${s3}`)
    void q
    for (const [file, s] of [['country-specific-terms.md', c], ['terms-and-conditions.md', tt]]) { const p = L.compare(file, s); if (p.length) bad.push(`${b}/${file}: ${p[0]}`) }
  }
  t('every translation: Mexico names the Secretaría (in Spanish, as written) with the date\'s day and year; Terms §3 points at 10; both files stamped with today\'s English and the same structure', bad.length === 0, bad.slice(0, 6))

  head('4 · THE PAGES — /country-terms and /mx/country-terms name the authority')
  const ctx = LP1E.context(kit, REPO)
  const EN = await ctx.bundle('wc3-en', "export { default as Page } from '@/app/(legal)/country-terms/page'")
  const MX = await ctx.bundle('wc3-mx', "export { default as Page } from '@/app/[country]/(legal)/country-terms/page'\nexport { default as Layout } from '@/app/[country]/(legal)/layout'")
  const rows = WF.rowsWith(WF.WORLD)
  const en = text(await ctx.withReq({ rows }, async () => ctx.prerender(h(EN.Page, {}))))
  const params = Promise.resolve({ country: 'mx' })
  const es = text(await ctx.withReq({ rows }, async () => ctx.prerender(h(MX.Layout, { params }, h(MX.Page, { params })))))
  t('/country-terms renders the Secretaría with its English name and the law', en.includes(`${SEC} (Secretariat of Anti-Corruption and Good Governance)`) && en.includes('in force since 21 March 2025'))
  t('/mx/country-terms (Spanish) renders the Secretaría and the law\'s Spanish title', es.includes(SEC) && es.includes('Ley Federal de Protección de Datos Personales en Posesión de los Particulares'))

  console.log(`\n${fail ? '🔴' : '✅'} world-countries-3: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
