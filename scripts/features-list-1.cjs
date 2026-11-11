#!/usr/bin/env node
// scripts/features-list-1.cjs — features-list-1 (4 November 2026, docs/features-list-1-report.md): the /features table gains
// "Documents and reminders", "Profit per event" and "Reports for your accountant", and loses "Advanced reporting".
//   node scripts/features-list-1.cjs                     (NO NETWORK, NO DATABASE — fixture tables)
//   node scripts/features-list-1.cjs capture <file>      render the landing pages (/uk /us /de /jp) and /features (/uk /us /de, the
//                                                        changed rows cut) and write their sha256 to <file>
//   node scripts/features-list-1.cjs compare <file>      the same, compared with a capture made in a HEAD worktree
// 1 · the table: the three rows in the run group after Buzzer tracking, before the "Coming soon" rows (which stay last);
//     Documents follows its plan switch (`paperwork`), the other two have none; no Advanced reporting row; the
//     `advanced_reporting` plan feature itself untouched.
// 2 · /uk/features and /de/features render the three rows (ticked on every plan) with their descriptions, and no Advanced
//     reporting row; the words exist in en-GB and every language base, en-US / es-MX only where the wording differs.
// 3 · MARKETING_COPY_UPDATED moved to 2026-11-04 (35.aj-8); it is read by the sitemap only.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'features-list-1' })
const LP1E = require('./_lp1e-fixtures.cjs')
const WF = require('./_world-countries-1-fixtures.cjs')
const FIX = require('./fixtures/faq-3-rows.json')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 700) : JSON.stringify(detail).slice(0, 700)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex')
const ROWS = () => WF.rowsWith(WF.WORLD)
const FAQ = () => JSON.parse(JSON.stringify({ faq_sections: FIX.faq_sections, faq_items: FIX.faq_items, faq_translations: [] }))
const text = s => String(s).replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, '\'').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()

async function render(ctx, page, seg) {
  const M = await ctx.bundle(`fl1-${page.replace(/\W+/g, '-')}`, `export { default as Page } from '${page}'\nexport { clearPlanCatalogCache as __p } from '@/lib/plans-server'`)
  const wf = WF.renderer(kit, 'fl1-tables')
  const info = console.info; console.info = () => {}
  try {
    return await kit.quietAsync(() => ctx.withReq({ rows: ROWS(), tables: { ...wf.tables, ...FAQ() } }, async () => {
      M.__p?.()
      return ctx.prerender(kit.h(M.Page, { params: Promise.resolve({ country: seg }), searchParams: Promise.resolve({}) }))
    }))
  } finally { console.info = info }
}

// The rows features-list-1 changes, by their rendered name in this tree's messages (en-US falls back to en-GB for the names).
// A plan-table row is flat: <div class="pt-row" role="row"><div class="pt-label" …>spans</div><div class="pt-cell…" role="cell">spans</div>…</div>
function cutRows(html, locale) {
  const words = JSON.parse(read(`messages/${locale}.json`)), gb = JSON.parse(read('messages/en-GB.json'))
  const nameOf = id => words.planFeatures?.row?.[id]?.name || gb.planFeatures?.row?.[id]?.name
  const names = new Set(['advanced_reporting', 'documents_reminders', 'profit_per_event', 'accountant_reports'].map(nameOf).filter(Boolean))
  let cut = 0
  const out = html.replace(/<div class="pt-row" role="row"><div class="pt-label" role="rowheader">((?:(?!<\/div>).)*)<\/div>(?:<div class="pt-cell[^"]*" role="cell">(?:(?!<\/div>).)*<\/div>)*<\/div>/g,
    (row, label) => { const m = /<span class="pt-name">([\s\S]*?)<\/span>/.exec(label); if (m && names.has(text(m[1]))) { cut++; return '<!--cut-->' } return row })
  if (!cut) throw new Error(`features-list-1: no changed row found to cut (${locale})`)
  return out.replace(/(<!--cut-->)+/g, '<!--cut-->')
}

const mode = process.argv[2]
if (mode === 'capture' || mode === 'compare') {
  (async () => {
    const ctx = LP1E.context(kit, REPO)
    const got = {}
    for (const seg of ['uk', 'us', 'de', 'jp']) got[`landing:${seg}`] = sha(await render(ctx, '@/app/(public)/[country]/page', seg))
    // /features with the changed rows cut (Advanced reporting at HEAD; the three new rows now): every other byte must match.
    for (const [seg, locale] of [['uk', 'en-GB'], ['us', 'en-US'], ['de', 'de-DE']]) got[`features-outside-the-rows:${seg}`] = sha(cutRows(String(await render(ctx, '@/app/(public)/[country]/features/page', seg)), locale))
    const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO }).toString().trim()
    if (mode === 'capture') { fs.writeFileSync(process.argv[3], JSON.stringify({ commit, pages: got }, null, 1) + '\n'); console.log(`captured at ${commit}:`, got); return }
    const want = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
    for (const [k, v] of Object.entries(got)) t(`${k} byte-identical to ${want.commit}`, want.pages[k] === v, { want: want.pages[k], got: v })
    console.log(`\nfeatures-list-1 (identity with HEAD): ${pass} passed, ${fail} failed`)
    process.exit(fail ? 1 : 0)
  })().catch(e => { console.error(e); process.exit(1) })
  return
}

;(async () => {
  const L = await kit.bundle('fl1-lib', "export { FEATURE_TABLE } from '@/lib/feature-table'\nexport { FEATURES } from '@/lib/features'")
  const FT = L.FEATURE_TABLE
  const NEW = ['documents_reminders', 'profit_per_event', 'accountant_reports']

  head('1 · the table')
  const run = FT.filter(r => r.group === 'run').map(r => r.id)
  const at = id => run.indexOf(id)
  t('the three rows are in the run group, in order, right after Buzzer tracking', at('documents_reminders') === at('buzzer_tracking') + 1 && at('profit_per_event') === at('buzzer_tracking') + 2 && at('accountant_reports') === at('buzzer_tracking') + 3, run)
  const soon = FT.filter(r => r.group === 'run' && r.comingSoon).map(r => r.id)
  t('the "Coming soon" rows stay at the bottom of the group (Tap to pay, Customer display)', JSON.stringify(run.slice(-soon.length)) === JSON.stringify(soon) && JSON.stringify(soon) === '["tap_to_pay","customer_display"]', { run, soon })
  t('every group still ends with its "Coming soon" rows', ['run', 'online', 'marketing'].every(g => { const rows = FT.filter(r => r.group === g); const i = rows.findIndex(r => r.comingSoon); return i < 0 || rows.slice(i).every(r => r.comingSoon) }))
  t('Documents follows its plan switch (`paperwork`); Profit per event and Reports for your accountant have none (always included)',
    FT.find(r => r.id === 'documents_reminders').feature === 'paperwork' && !FT.find(r => r.id === 'profit_per_event').feature && !FT.find(r => r.id === 'accountant_reports').feature && NEW.every(id => !FT.find(r => r.id === id).comingSoon))
  t('no Advanced reporting row; the `advanced_reporting` plan feature itself is untouched', !FT.some(r => r.id === 'advanced_reporting') && L.FEATURES.includes('advanced_reporting') && /'advanced_reporting',/.test(read('lib/features.ts')))
  t('34 rows (32 − 1 + 3)', FT.length === 34, FT.length)

  head('2 · the words, and /uk/features and /de/features')
  const en = JSON.parse(read('messages/en-GB.json'))
  const BASES = read('lib/i18n/locales.ts').match(/export const LANGUAGE_BASES[^=]*= \[([^\]]*)\]/)[1].match(/'([a-z]{2}-[A-Z]{2})'/g).map(s => s.slice(1, -1))
  const has = (d, id) => d.planFeatures?.row?.[id]?.name && d.featuresPage?.detail?.[id]
  const missing = ['en-GB', ...BASES].filter(l => { const d = JSON.parse(read(`messages/${l}.json`)); return !NEW.every(id => has(d, id)) || d.planFeatures.row.advanced_reporting || d.featuresPage.detail.advanced_reporting })
  // ⚠️ RE-PINNED (languages-world-1, 10 November 2026): the bases are lib/i18n/locales.ts's live LANGUAGE_BASES (36 then, more may
  // follow), never a typed count — at least the 28 this was written for, every one of them checked.
  t(`the three names and descriptions in en-GB and all ${BASES.length} bases; Advanced reporting's words gone from every one`, BASES.length >= 28 && !missing.length, missing)
  t('the English as briefed', en.planFeatures.row.documents_reminders.name === 'Documents and reminders' && en.planFeatures.row.profit_per_event.name === 'Profit per event' && en.planFeatures.row.accountant_reports.name === 'Reports for your accountant'
    && en.featuresPage.detail.documents_reminders.startsWith('Save your certificates in one place, such as food hygiene, insurance and gas safety.') && en.featuresPage.detail.profit_per_event === 'Add what each dish costs you and see what you actually made at every event, not just your takings.'
    && en.featuresPage.detail.accountant_reports === 'Sales, tax and refunds for any month, quarter or tax year, ready to download for your accountant.')
  const us = JSON.parse(read('messages/en-US.json')), mx = JSON.parse(read('messages/es-MX.json'))
  t('variants only where the wording differs: en-US "organizer" and "sales" (not the UK-only "takings"); es-MX "contador" and "venza"', /market organizer in one tap\.$/.test(us.featuresPage.detail.documents_reminders) && /not just your sales\.$/.test(us.featuresPage.detail.profit_per_event) && !us.featuresPage.detail.accountant_reports && !us.planFeatures?.row?.documents_reminders
    && mx.planFeatures.row.accountant_reports.name === 'Reportes para tu contador' && /venza/.test(mx.featuresPage.detail.documents_reminders))
  const ctx = LP1E.context(kit, REPO)
  for (const [seg, locale] of [['uk', 'en-GB'], ['de', 'de-DE']]) {
    const html = await render(ctx, '@/app/(public)/[country]/features/page', seg)
    const words = JSON.parse(read(`messages/${locale}.json`))
    if (process.env.FL1_DUMP) fs.writeFileSync(`${process.env.FL1_DUMP}-${seg}.html`, String(html))
    // The plan table is ARIA rows (components/pricing/PlanTable.tsx): <div class="pt-row" role="row"> with a pt-name, a pt-desc and a cell per plan.
    const rows = String(html).split('<div class="pt-row" role="row">').slice(1).map(r => ({ name: text((/<span class="pt-name">([\s\S]*?)<\/span>/.exec(r) || ['', ''])[1]), desc: text((/<span class="pt-desc">([\s\S]*?)<\/span>/.exec(r) || ['', ''])[1]), yes: (r.match(/class="pt-yes"/g) || []).length, cells: (r.match(/role="cell"/g) || []).length, soon: /pt-soon/.test(r), no: /pt-no/.test(r) }))
    const rowOf = name => rows.find(r => r.name === name)
    const ok = NEW.map(id => { const r = rowOf(words.planFeatures.row[id].name); return r && r.desc === text(words.featuresPage.detail[id]) && r.cells >= 3 && r.yes === r.cells && !r.soon && !r.no })
    t(`/${seg}/features: the three rows, ticked on every plan, each with its description (${locale})`, ok.every(Boolean), NEW.map(id => JSON.stringify(rowOf(words.planFeatures.row[id].name) || 'MISSING')).join(' | '))
    const advName = { 'en-GB': 'Advanced reporting', 'de-DE': JSON.parse(execFileSync('git', ['show', '56250fcd:messages/de-DE.json'], { cwd: REPO, maxBuffer: 64e6 }).toString()).planFeatures.row.advanced_reporting.name }[locale]
    t(`/${seg}/features: no Advanced reporting row ("${advName}")`, rows.length > 20 && !rows.some(r => r.name === advName) && !text(html).includes(advName))
    const names = rows.map(r => r.name)
    const iDoc = names.indexOf(words.planFeatures.row.documents_reminders.name), iBuz = names.indexOf(words.planFeatures.row.buzzer_tracking.name), iTap = names.indexOf(words.planFeatures.row.tap_to_pay.name)
    t(`/${seg}/features: after Buzzer tracking, above the "Coming soon" rows`, iDoc === iBuz + 1 && iTap > iDoc + 2 && rows.slice(iTap, iTap + 2).every(r => r.soon), { iBuz, iDoc, iTap })
  }

  head('3 · the copy date')
  // ⚠️ RE-PINNED (site-chrome-1, 5 November 2026): moved on again, to 2026-11-05 (the offline line put back) — 2026-11-04 or later.
  t('MARKETING_COPY_UPDATED is 2026-11-04 or later (35.aj-8), read by the sitemap only', (/export const MARKETING_COPY_UPDATED = '(\d{4}-\d{2}-\d{2})'/.exec(read('lib/marketing-meta.ts')) || [])[1] >= '2026-11-04'
    && execFileSync('git', ['grep', '-l', 'MARKETING_COPY_UPDATED', '--', 'app', 'lib', 'components'], { cwd: REPO }).toString().trim().split('\n').sort().join() === 'app/sitemap.ts,lib/marketing-meta.ts')

  console.log(`\nfeatures-list-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
