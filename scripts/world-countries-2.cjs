#!/usr/bin/env node
// scripts/world-countries-2.cjs — world-countries-2 (1 November 2026, docs/world-countries-2-report.md): DOMINIC'S DECISIONS ON THE
// world-countries-1 FLAGS, each proved.
//   node scripts/world-countries-2.cjs
//   1  F2 THE TERMS — §4 names no plan or price and promises no "plan with no monthly fee" anywhere; a finished trial, a
//      cancellation and a failed payment move to "the plan shown for your country on our pricing page"; the Country-specific
//      terms carry the eight new countries after Gibraltar, each with both subsections, its billing currency, and — in BR, MX,
//      SG, MY and TH only — the one-plan note; each document's line and its lib/legal.ts date agree; TERMS_VERSION is the latest;
//   2  F1 THE TRIAL-END WORDING — where the country's trial-end plan has a monthly price, the landing banner, the trial popup
//      and Manage › Billing all say "<plan> is <price> a month. We'll be in touch before then to set up payment" and none says
//      billing starts only when the truck chooses a plan; everywhere else the old keys are used, unchanged; every language
//      carries the three new keys (translation-check's structural rule proves their placeholders);
//   3  F5 — MYR "RM29", JPY "¥1,980" on every amount path; every other currency exactly Intl's;
//   4  F8 — en-SG says no "hatch"; ja-JP no "Powered by";
//   5  F10 — Greek and Bulgarian: the language provider applies their Noto as it does Japanese, Chinese, Thai and Arabic.
// The countries are the NOT RUN SQL's rows, switched ON in fixtures only (scripts/_world-countries-1-fixtures.cjs).
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'world-countries-2' })
const { REPO } = kit
const WF = require('./_world-countries-1-fixtures.cjs')
const W2 = require('./_lp-world-countries-2.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
// ⚠️ RE-PINNED (tidy-1, 3 November 2026): STALE since 2b625a66 committed this harness WITH world-countries-2's changes — "HEAD" meant the
// tree before them; it is that tree by name, 3240c536 (2b625a66's parent), as legal-languages-1 reads it.
const atHead = f => execSync(`git show 3240c536:${f}`, { cwd: REPO, encoding: 'utf8' })
const flat = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o ?? {})) { const kk = p ? `${p}.${k}` : k; if (typeof v === 'string') out[kk] = v; else flat(v, kk, out) } return out }
const text = s => String(s ?? '').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/[  ‏‎]/g, ' ').replace(/\s+/g, ' ').trim()
const PLAN_NAMES = /\b(Pay as you go|Unlimited|Starter|Max)\b|\bPro\b(?! rata)/
const UNLIMITED_ONLY = ['BR', 'MX', 'MY', 'SG', 'TH']

;(async () => {
  // ══ 1 · F2 ════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · F2 THE TERMS — true in every country, naming no plan or price; the eight country sections; the dates')
  const terms = read('content/legal/terms-and-conditions.md'), country = read('content/legal/country-specific-terms.md'), legal = read('lib/legal.ts')
  const s4 = terms.slice(terms.indexOf('## 4.'), terms.indexOf('\n## 5.'))
  t('Terms: no sentence promises "our plan with no monthly fee", "the plan with no monthly fee" or that "one plan has no monthly fee"', !/(our|the) plan with no monthly fee|One plan has no monthly fee/i.test(terms))
  t('Terms §4: a finished trial, a cancellation and a failed payment move to "the plan shown for your country on our pricing page" (and a payment 7 days late to "that plan")', (s4.match(/the plan shown for your country on our pricing page/g) || []).length === 3 && s4.includes('of its due date, your account moves to that plan.'))
  t('Terms §4: "in most countries" that plan (or one plan) has no monthly fee — true where only a paid plan is offered', (s4.match(/[Ii]n most countries/g) || []).length === 4)
  t('Terms §4 names no plan and no price (the V16.2 rule)', !PLAN_NAMES.test(s4) && !/[£$€¥]\s?\d/.test(s4), PLAN_NAMES.exec(s4)?.[0])
  // ⚠️ RE-PINNED (world-countries-3, 1 November 2026): Terms §3's "Section 9" → "Section 10" came after; it is taken back exactly
  // (scripts/_lp-world-countries-3.cjs, which throws if it is not there) and every other byte is still HEAD + these six edits.
  t('Terms: HEAD + exactly the six named edits (the date and five sentences) — every other byte unchanged', W2.applyTerms(atHead('content/legal/terms-and-conditions.md')) === require('./_lp-world-countries-3.cjs').asBefore('content/legal/terms-and-conditions.md', terms))
  const heads = [...country.matchAll(/^## (.+)$/gm)].map(m => m[1])
  t(`Country-specific terms: the eight new sections follow Gibraltar, in order (${W2.COUNTRIES.join(', ')})`, JSON.stringify(heads.slice(heads.indexOf('Gibraltar') + 1)) === JSON.stringify(W2.COUNTRIES), heads)
  t('Country-specific terms: HEAD + the date + the eight sections — every earlier byte unchanged', W2.asBefore('content/legal/country-specific-terms.md', country) === atHead('content/legal/country-specific-terms.md'))
  const sec = h => { const i = country.indexOf(`\n## ${h}\n`); const j = country.indexOf('\n## ', i + 4); return country.slice(i, j < 0 ? country.length : j) }
  const CUR = { Brazil: 'Brazilian reais', Mexico: 'Mexican pesos', Japan: 'Japanese yen', Singapore: 'Singapore dollars', 'Hong Kong': 'Hong Kong dollars', Malaysia: 'ringgit', Thailand: 'Thai baht', 'United Arab Emirates': 'UAE dirhams' }
  const PRIV = { Brazil: 'Brazil', Mexico: 'Mexico', Japan: 'Japan', Singapore: 'Singapore', 'Hong Kong': 'Hong Kong', Malaysia: 'Malaysia', Thailand: 'Thailand', 'United Arab Emirates': 'the United Arab Emirates' }
  for (const c of W2.COUNTRIES) {
    const s = sec(c)
    const one = W2.UNLIMITED_ONLY.includes(c)
    t(`${c}: "For food truck operators" then "Privacy, for everyone in ${PRIV[c]}"; billed in ${CUR[c]}; seller, card payments, allergens, tax, language, local rights, governing law, requests, complaints, contact`,
      /\n### For food truck operators\n/.test(s) && s.includes(`\n### Privacy, for everyone in ${PRIV[c]}\n`) && s.includes(`are billed in ${CUR[c]}.`)
      && ['**You are the seller.**', '**Card payments.**', '**Allergens.**', '**Language.**', '**Your rights under local law.**', '**Notices and governing law.**', '**Your requests.**', '**Complaints.**', '**Contact.**'].every(x => s.includes(x)))
    t(`${c}: ${one ? 'the one-plan note — one plan with a monthly price, no plan without one, the trial moves to it, we will be in touch to set up payment' : 'no one-plan note (all three plans are offered)'}`,
      one === /\*\*Our plan in /.test(s) && (!one || (s.includes('we offer one plan') && s.includes('There is no plan without a monthly fee in') && s.includes('we will contact you before your trial ends to set up payment'))))
  }
  t('the eight sections name no plan and no price', !PLAN_NAMES.test(W2.sectionsOf(country)) && !/(R\$|MX\$|¥|￥|S\$|HK\$|RM|฿|AED|د\.إ)\s?\d/.test(W2.sectionsOf(country)), PLAN_NAMES.exec(W2.sectionsOf(country))?.[0])
  const docDate = s => /\*\*Last updated:\*\* (.+)/.exec(s)[1]
  const constOf = k => new RegExp(`export const ${k} = '([^']+)'`).exec(legal)[1]
  t(`each document's own line and its lib/legal.ts date agree: Terms and Country-specific terms ${W2.NEW_DATE}; Privacy unchanged (${constOf('PRIVACY_UPDATED')})`,
    docDate(terms) === W2.NEW_DATE && constOf('TERMS_UPDATED') === W2.NEW_DATE && docDate(country) === W2.NEW_DATE && constOf('COUNTRY_TERMS_UPDATED') === W2.NEW_DATE
    && docDate(read('content/legal/privacy-policy.md')) === constOf('PRIVACY_UPDATED') && W2.asBefore('content/legal/privacy-policy.md', read('content/legal/privacy-policy.md')) === atHead('content/legal/privacy-policy.md'))   // ⚠️ RE-PINNED (tidy-1): contact-1's and tidy-1's later Privacy changes taken back first (the chain)
  const iso = d => new Date(Date.parse(`${d} UTC`)).toISOString().slice(0, 10)
  t(`TERMS_VERSION '${constOf('TERMS_VERSION')}' is the latest of the three documents' dates`, constOf('TERMS_VERSION') === [constOf('PRIVACY_UPDATED'), constOf('TERMS_UPDATED'), constOf('COUNTRY_TERMS_UPDATED')].map(iso).sort().at(-1))

  // ══ 2 · F1 ════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · F1 THE TRIAL-END WORDING — banner, popup and Billing agree where the trial-end plan has a price; nowhere else changes')
  const EN = flat(JSON.parse(read('messages/en-GB.json')))
  const MEANING = /is \{price\} a month\. We’ll be in touch before then to set up payment\./
  const BILLING_ONLY = /Billing only ever starts|choose a plan and enter/
  t('en-GB: the banner, the popup and Billing say "<plan> is <price> a month. We’ll be in touch before then to set up payment."',
    ['pricing.banner.bodyOnly', 'manageShell.trialPopup.bodyPaidEnd', 'manageBilling.onTrialPaidEnd'].every(k => MEANING.test(EN[k])))
  t('…and none of the four lines says billing starts only when the truck chooses a plan and enters payment details',
    ['pricing.banner.bodyOnly', 'manageShell.trialPopup.bodyPaidEnd', 'manageBilling.onTrialPaidEnd', 'manageBilling.noChargePaidEnd'].every(k => !BILLING_ONLY.test(EN[k])))
  const HEADGB = flat(JSON.parse(atHead('messages/en-GB.json')))
  t('every other country\'s keys are untouched: pricing.banner.body, trialPopup.body, manageBilling.onTrial / noCharge / setUpPayment are HEAD\'s',
    // ⚠️ RE-PINNED (pricing-copy-1, 11 November 2026): pricing.banner.body compared with its "Prefer to take payment up front?" sentence
    // put back (scripts/_lp-pricing-copy-1.cjs asBefore — the one sentence pricing-copy-1 deleted; scripts/pricing-copy-1.cjs proves it).
    ['pricing.banner.body', 'manageShell.trialPopup.body', 'manageBilling.onTrial', 'manageBilling.noCharge', 'manageBilling.setUpPayment'].every(k => (k === 'pricing.banner.body' ? require('./_lp-pricing-copy-1.cjs').asBefore(EN[k], 'en-GB') : EN[k]) === HEADGB[k]))   // eslint-disable-line @typescript-eslint/no-require-imports -- CommonJS harness module
  const LOC = read('lib/i18n/locales.ts')
  const BASES = JSON.parse('[' + /export const LANGUAGE_BASES[^=]*= \[([^\]]*)\]/.exec(LOC)[1].replace(/'/g, '"') + ']')
  const missing = BASES.flatMap(l => { const m = flat(JSON.parse(read(`messages/${l}.json`))); return ['manageShell.trialPopup.bodyPaidEnd', 'manageBilling.onTrialPaidEnd', 'manageBilling.noChargePaidEnd'].filter(k => !m[k]).map(k => `${l}:${k}`) })
  const stale = fs.readdirSync(path.join(REPO, 'messages')).filter(f => f.endsWith('.json') && read(`messages/${f}`).includes('"bodyKeeps"'))
  t(`all ${BASES.length} language bases carry the three new keys; no messages file still has "bodyKeeps"`, missing.length === 0 && stale.length === 0, [...missing, ...stale])
  const manage = read('app/(app)/manage/[token]/page.tsx')
  t('Manage: the popup and Billing switch on ONE condition — the country\'s trial-end plan has a monthly price (planPriceFor(expiryFallbackFor(…)).monthlyMinor > 0)',
    /const trialEndMonthly = trialEndPlan && planCatalog \? planPriceFor\(planCatalog, trialEndPlan\.key, truck\?\.country\)\?\.monthlyMinor \?\? 0 : 0\n\s*const trialEndPaid = trialEndMonthly > 0/.test(manage)
    && /const trialEndRow = planPriceFor\(catalog, expiryFallbackFor\(catalog, countryRow\.countryCode\)\.key, countryRow\.countryCode\)\n\s*const trialEndPaid = \(trialEndRow\?\.monthlyMinor \?\? 0\) > 0/.test(manage))
  t('Manage: popup bodyPaidEnd (price under Billing\'s mask) else body; Billing onTrialPaidEnd / noChargePaidEnd else onTrial / noCharge; "Choose a plan before your trial ends" hidden only there',
    /trialEndPaid\s*\? <TrialEndPrice minor=\{trialEndMonthly\}>\{price => t\.rich\('trialPopup\.bodyPaidEnd'/.test(manage) && /: t\.rich\('trialPopup\.body', \{/.test(manage)
    && /trialEndPaid\s*\? t\('onTrialPaidEnd'/.test(manage) && /t\(trialEndPaid \? 'noChargePaidEnd' : 'noCharge'/.test(manage) && /\{onTrial && purchaseCtaAllowed\(\) && !trialEndPaid && \(/.test(manage)
    && /function TrialEndPrice\(.*\n\s*const mask = usePlanPriceMask\(\)/.test(manage))
  const P = await kit.bundle('wc2-plans', "export * from '@/lib/plans'")
  const cat = WF.CATALOG()
  const paid = cc => (P.planPriceFor(cat, P.expiryFallbackFor(cat, cc).key, cc)?.monthlyMinor ?? 0) > 0
  const ALL = ['GB', 'US', 'IE', 'AU', 'NZ', 'CA', 'FR', 'DE', 'JP', 'HK', 'AE', ...UNLIMITED_ONLY]
  t(`the condition holds exactly in ${UNLIMITED_ONLY.join(', ')} (their trial ends on Unlimited); GB, US, IE, AU, NZ, CA, FR, DE, JP, HK and AE keep today's wording`,
    ALL.every(cc => paid(cc) === UNLIMITED_ONLY.includes(cc)), ALL.map(cc => `${cc}:${paid(cc)}`))
  // the rendered banner, switched on in fixtures
  const R = WF.renderer(kit, 'wc2')
  const rows = WF.rowsWith(UNLIMITED_ONLY)
  for (const [seg, word] of [['br', 'R$ 149'], ['my', 'RM69'], ['sg', '$59']]) {
    const page = await R.page('landing', seg, rows)
    const banner = text((/<div class="trial-banner">([\s\S]*?)<\/div>/.exec(page.html ?? '') || [])[1])
    t(`/${seg}: the pricing banner names the plan and ${word} a month and says we will be in touch — no "billing only starts"`, banner.includes(word) && !/Billing only/i.test(banner) && banner.length > 40, banner.slice(0, 400))
  }
  const ukBanner = text((/<div class="trial-banner">([\s\S]*?)<\/div>/.exec((await R.page('landing', 'uk', rows)).html ?? '') || [])[1])
  t('/uk: the banner is pricing.banner.body\'s, unchanged (no price, no "in touch")', !/in touch/.test(ukBanner) && /no monthly fee/.test(ukBanner), ukBanner.slice(0, 300))

  // ══ 3 · F5 ════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · F5 — MYR "RM29", JPY "¥" (normal width), everywhere a price is shown')
  const M = await kit.bundle('wc2-money', "export * from '@/lib/money-format'\nexport * from '@/lib/currencies'\nexport { planMoneyFormatOf, intlMoneyFormatOf } from '@/lib/country-settings-types'")
  const sp = s => s.replace(/[  ]/g, ' ')
  const my = { currency: 'MYR', locale: 'ms-MY' }, jp = { currency: 'JPY', locale: 'ja-JP' }
  t('MYR in ms-MY: plan price "RM29", whole "RM4,000", menu "RM12.50", side by side "RM29" — never "RM 29"',
    sp(M.formatAmount(2900, my)) === 'RM29' && sp(M.formatWholeAmount(400000, my)) === 'RM4,000' && sp(M.formatMajor(12.5, my)) === 'RM12.50'
    && sp(M.formatAmount(2900, M.intlMoneyFormatOf({ currency: 'MYR', locale: 'ms-MY' }))) === 'RM29' && M.currencySymbol(my) === 'RM')
  t('JPY in ja-JP: "¥1,980" (U+00A5) on every path — plan price, whole, menu, ticket, symbol — never the full-width "￥"',
    [M.formatAmount(1980, jp), M.formatWholeAmount(250000, jp), M.formatMajor(1980, jp), M.formatMinor(1980, jp), M.currencySymbol(jp)].every(s => s.includes('¥') && !s.includes('￥')) && M.formatAmount(1980, jp) === '¥1,980')
  t('an English page keeps Intl\'s form for both ("MYR 29", "¥1,980"); every other currency is exactly Intl\'s',
    sp(M.formatAmount(2900, { currency: 'MYR', locale: 'en-GB' })) === 'MYR 29' && M.CURRENCIES.filter(c => c.printedSymbol || c.symbolTight).map(c => c.code).join() === 'JPY,MYR'
    && M.CURRENCIES.filter(c => !c.printedSymbol && !c.symbolTight).every(c => M.formatMajor(29, { currency: c.code, locale: c.locale }) === (() => { const p = new Intl.NumberFormat(c.locale, { style: 'currency', currency: c.code, ...(c.narrowIn?.includes(c.locale) ? { currencyDisplay: 'narrowSymbol' } : {}), minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals }).formatToParts(29); return p.map(x => x.value).join('') })()))
  for (const [seg, word] of [['my', 'RM69'], ['jp', '¥1,980']]) {
    const html = (await R.page('landing', seg, WF.rowsWith(['MY', 'JP']))).html ?? ''
    t(`/${seg}: the pricing section prints ${word}, never ${seg === 'my' ? '"RM 69"' : '"￥"'}`, text(html).includes(word) && (seg === 'my' ? !/RM 69/.test(text(html)) : !html.includes('￥')))
  }

  // ══ 4 · F8 ════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · F8 — en-SG says "truck", ja-JP translates "Powered by"')
  const SG = { ...EN, ...flat(JSON.parse(read('messages/en-SG.json'))) }
  t('en-SG (merged over en-GB): "hatch" appears nowhere', !Object.values(SG).some(v => /\bhatch\b/i.test(v.replace(/HatchGrab/g, ''))), Object.entries(SG).filter(([, v]) => /\bhatch\b/i.test(v.replace(/HatchGrab/g, ''))).map(([k]) => k))
  const JA = flat(JSON.parse(read('messages/ja-JP.json')))
  t('ja-JP: no "Powered by" left; the credit reads 提供：HatchGrab', !Object.values(JA).some(v => /Powered by/.test(v)) && JA['posterWords.poweredBy'] === '提供：HatchGrab' && JA['emailCustomer.common.poweredByDot'] === '提供：HatchGrab · hatchgrab.com')

  // ══ 5 · F10 ═══════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · F10 — Greek and Bulgarian truck pages load their Noto in the browser too')
  const SF = read('lib/script-fonts.ts'), client = read('lib/i18n/client.tsx'), layout = read('app/(app)/layout.tsx')
  const FONT = n => `export const ${n} = o => ({ variable: 'v-' + o.variable.slice(2), className: 'c-${n}' })`
  const FS = await kit.bundle('wc2-fonts', "export * from '@/lib/script-fonts'", { stubs: { 'next/font/google': ['Noto_Sans', 'Noto_Sans_JP', 'Noto_Sans_HK', 'Noto_Sans_Thai', 'Noto_Sans_Arabic'].map(FONT).join('\n') } })
  t('lib/script-fonts.ts: scriptFontClassOf gives el-GR, el-CY and bg-BG the Greek / Cyrillic Noto (--font-script-fallback); Latin languages none',
    ['el-GR', 'el-CY', 'bg-BG'].every(l => FS.scriptFontClassOf(l) === 'v-font-script-fallback') && ['en-GB', 'de-DE', 'pl-PL', 'pt-BR', 'ms-MY'].every(l => FS.scriptFontClassOf(l) === null)
    && /Noto_Sans\(\{ variable: '--font-script-fallback', subsets: \['greek', 'cyrillic'\], preload: false/.test(SF), ['el-GR', 'bg-BG', 'en-GB'].map(l => FS.scriptFontClassOf(l)))
  t('the language provider applies it on a page that learns its language in the browser (as for ja / zh / th / ar)', /if \(\/\^\(ja\|zh\|th\|ar\|el\|bg\)\(-\|\$\)\/i\.test\(locale\)\)/.test(client) && /document\.body\.classList\.add\(cls\)/.test(client))
  t('the root layout asks the same function — one definition, no second Noto Sans call', !/Noto_Sans\b/.test(layout) && /antialiased\$\{scriptFontClassOf\(lang\) \? ` \$\{scriptFontClassOf\(lang\)\}` : ''\}/.test(layout))

  console.log(`\n${fail ? '🔴' : '✅'} world-countries-2: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
