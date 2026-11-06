#!/usr/bin/env node
// scripts/tidy-2.cjs — tidy-2 (3 November 2026, docs/tidy-2-report.md).
//   node scripts/tidy-2.cjs        (NO NETWORK, NO DATABASE WRITE, NO LIVE TRUCK — the live values are a read-only snapshot)
//
//   1 · APPS ON IN EVERY COUNTRY: over the live country_settings values (scripts/fixtures/tidy-2-live-rows.json, read after
//       20261063 ran), every surface that reads the two app flags shows the apps in all 44 countries — the landing page's
//       offline sentence, the footer badges (each language's own), the JSON-LD operatingSystem, the FAQ's {apps.*} phrases,
//       the comparison rows, Manage's get-the-app card;
//   2 · THE UAE: comparison_status 'off' — no comparison page in the sitemap or /llms.txt;
//   3 · REAL THAI FOOD: the guarded migration changes one truck's three named columns and nothing else;
//   4 · YEN, NEVER ROUNDED UP (F6): ¥1,980 + 5% → ¥2,079; ¥999 + 10% → ¥1,098, the same on the menu, the order page, the
//       amount the card is authorised for, the receipt and the KDS; GBP byte-identical to the tree before tidy-2's code.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'tidy-2' })
const { REPO } = kit
const LP1E = require('./_lp1e-fixtures.cjs')
const WF = require('./_world-countries-1-fixtures.cjs')
const CDE = require('./_compare-de-1-fixtures.cjs')
const FIX = require('./fixtures/faq-3-rows.json')
const TR = require('./fixtures/faq-2-translations.json')
const LIVE = require('./fixtures/tidy-2-live-rows.json')

/* 🔴 THE TREE BEFORE tidy-2's CODE, PINNED BY SHA (never HEAD: HEAD moves with the next commit, and the comparison would
 * quietly become this tree against itself). f9b6f3ea is tidy-2's migrations commit; no code file differs from 1da6f366. */
const BEFORE = 'f9b6f3ea'
const gitShow = f => execFileSync('git', ['show', `${BEFORE}:${require('./_moved-paths.cjs').pathAt(BEFORE, f)}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 64e6 })

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const ents = s => String(s).replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
const text = html => ents(String(html).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/[\s  ]+/g, ' ')
const squash = s => String(s).replace(/[\s  ]+/g, ' ')

/** The world rows with every column the app surfaces read taken from the live snapshot. */
const liveOf = Object.fromEntries(LIVE.rows.map(r => [r[0], Object.fromEntries(LIVE.columns.map((c, i) => [c, r[i]]))]))
const ROWS = () => WF.rowsWith(WF.WORLD).map(r => {
  const l = liveOf[r.countryCode]
  return l ? { ...r, enabled: l.enabled, locale: l.locale, currency: l.currency, comparisonStatus: l.comparison_status, iosAppAvailable: l.ios_app_available, androidAppAvailable: l.android_app_available } : r
})

;(async () => {
  const ctx = LP1E.context(kit, REPO)
  const M = await ctx.bundle('t2-lib', [
    "export { default as Landing } from '@/app/(public)/[country]/page'",
    "export { default as FaqPageView } from '@/app/(public)/[country]/faq/page'",
    "export { clearComparisonCache as __cmp, comparisonFlags, appsOf, comparisonAddressOf } from '@/lib/comparison-flags'",
    "export { clearPlanCatalogCache as __p } from '@/lib/plans-server'",
    "export { clearPublicFaqCache as __faq, faqPage } from '@/lib/faq/public'",
    "export { tokenValue } from '@/lib/faq/live-values'",
    "export { itemSourceHash, sectionSourceHash } from '@/lib/faq/source-hash'",
    "export { getCountrySettings } from '@/lib/country-settings'",
    "export { COUNTRY_PATH_SEGMENTS } from '@/lib/marketing-country'",
    "export { badgeFor } from '@/lib/store-badge-files'",
    "export { translatorFor } from '@/lib/i18n/translator'",
    "export { ourAnswer } from '@/lib/comparison-features'",
    "export { FILE_FEATURES } from '@/lib/comparison-features-file'",
    "import '@/lib/i18n/catalog/landingFooter'",
  ].join('\n'))
  const wf = WF.renderer(kit, 't2-tables')
  const CODES = LIVE.rows.map(r => r[0])
  const english = Object.fromEntries(FIX.faq_items.map(i => [i.id, { questionEn: i.question_en, answerEn: i.answer_en, answerSinglePlanEn: i.answer_single_plan_en }]))
  const titles = Object.fromEntries(FIX.faq_sections.map(s => [s.id, s.title_en]))
  const hashOf = id => (titles[id] ? M.sectionSourceHash({ titleEn: titles[id] }) : M.itemSourceHash(english[id]))
  const TRANS = TR.rows.map(r => ({ item_id: titles[r.id] ? null : r.id, section_id: titles[r.id] ? r.id : null, locale: r.locale, question: r.question ?? null, answer: r.answer ?? null,
    answer_single_plan: r.answer_single_plan ?? null, title: r.title ?? null, source_hash: hashOf(r.id), model: 'fixture', translated_at: '2026-11-02T12:00:00Z', status: 'ok', reason: null }))
  const tables = { ...wf.tables, faq_sections: FIX.faq_sections, faq_items: FIX.faq_items, faq_translations: TRANS }
  const withReq = (fn, rows = ROWS()) => { const info = console.info; console.info = () => {}; return kit.quietAsync(() => ctx.withReq({ rows, tables, host: 'www.hatchgrab.com' }, async () => { M.__p(); M.__cmp(); M.__faq(); return fn() })).finally(() => { console.info = info }) }

  // ── 1 · apps everywhere ─────────────────────────────────────────────────────────────────────────────────────────────
  head('1 · apps on in every country — every surface that reads the flags, over the live values')
  {
    const rows = ROWS()
    t(`the live snapshot: ${CODES.length} rows, every one ios_app_available = android_app_available = true (20261063 ran)`, CODES.length === 44 && LIVE.rows.every(r => r[5] === true && r[6] === true))
    t('…and the harness rows are those 44 countries, carrying the live flags, locale, currency, enabled and comparison status', rows.length === 44 && rows.every(r => liveOf[r.countryCode] && r.iosAppAvailable === true && r.androidAppAvailable === true && r.locale === liveOf[r.countryCode].locale))
    const fixtureDiffs = WF.rowsWith(WF.WORLD).filter(r => { const l = liveOf[r.countryCode]; return !l || r.locale !== l.locale || r.currency !== l.currency }).map(r => r.countryCode)
    t('the fixture rows agree with live on every locale and currency (only the flags, enabled and comparison status are overlaid)', fixtureDiffs.length === 0, fixtureDiffs)
    const flags = await withReq(() => M.comparisonFlags())
    t('the one cached reader (lib/comparison-flags.ts) answers both apps for all 44', CODES.every(c => flags.get(c)?.iosApp === true && flags.get(c)?.androidApp === true), CODES.filter(c => !(flags.get(c)?.iosApp && flags.get(c)?.androidApp)))

    const missing = { offline: [], badges: [], order: [], ld: [], errors: [] }
    for (const cc of CODES) {
      const seg = M.COUNTRY_PATH_SEGMENTS[cc]
      const locale = liveOf[cc].locale
      let html = ''
      try { html = await withReq(() => ctx.prerender(kit.h(M.Landing, { params: Promise.resolve({ country: seg }), searchParams: Promise.resolve({}) }))) } catch (e) { missing.errors.push(`${cc}: ${e.message}`); continue }
      // ⚠️ RE-PINNED (site-chrome-1, 5 November 2026, Dominic): the offline line is put back to its pre-copy-truth-1 sentence, which itself
      // ends with the apps ("…with the iPhone, iPad and Android app.") — there is no separate offlineApps sentence any more.
      const sentence = require('./_lp-site-chrome-1.cjs').LANDED ? M.translatorFor(locale, 'landing')('does.offlineBody') : M.translatorFor(locale, 'landing')('does.offlineApps')   // eslint-disable-line @typescript-eslint/no-require-imports -- CommonJS harness module (site-chrome-1)
      if (!squash(text(html)).includes(squash(sentence))) missing.offline.push(cc)
      const foot = (/<footer[\s\S]*?<\/footer>/.exec(html) || [''])[0]
      const srcs = [...foot.matchAll(/class="foot-badge"[^>]*><img src="([^"]+)"/g)].map(m => m[1])
      const apple = M.badgeFor('apple', locale).src, google = M.badgeFor('google', locale).src
      if (!(srcs.length === 2 && srcs[0] === apple && srcs[1] === google)) missing.badges.push(`${cc} ${JSON.stringify(srcs)} want ${apple}, ${google}`)
      const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(m => { try { const j = JSON.parse(m[1]); return j['@graph'] || [j] } catch { return [] } })
      const os = ld.filter(n => n.operatingSystem).map(n => n.operatingSystem)
      if (!(os.length && os.every(o => o === 'Web, iOS, Android'))) missing.ld.push(`${cc} ${JSON.stringify(os)}`)
    }
    t('every landing page rendered (44)', missing.errors.length === 0, missing.errors)
    t('the landing page\'s offline sentence carries the apps line, in its own language, in all 44 ("…with the iPhone, iPad and Android app.")', missing.offline.length === 0, missing.offline)
    t('the footer shows BOTH badges in all 44 — Apple first, each the page language\'s own artwork (badgeFor)', missing.badges.length === 0, missing.badges)
    t('the JSON-LD operatingSystem is "Web, iOS, Android" in all 44', missing.ld.length === 0, missing.ld)

    // The FAQ: the real page end to end where the fixture FAQ is readable (the English countries, plus the four translated
    // languages for the item they carry), and the phrase itself in every country's language from the same flags.
    const english9 = CODES.filter(c => /^en-/.test(liveOf[c].locale))
    const faqMiss = []
    for (const cc of english9) {
      const p = await withReq(async () => M.faqPage(await M.getCountrySettings(cc)))
      const answers = (p?.sections ?? []).flatMap(s => s.items).map(i => i.a)
      const enT = M.translatorFor(liveOf[cc].locale, 'faq')
      if (!answers.some(a => a.endsWith(enT('phrases.appsSentence'))) || !answers.some(a => a.endsWith(enT('phrases.appsOffline')))) faqMiss.push(cc)
    }
    t(`the FAQ page (rendered, ${english9.length} English-language countries): {apps.sentence} and {apps.offline} name the apps`, english9.length === 9 && faqMiss.length === 0, faqMiss)
    const tokMiss = CODES.filter(cc => {
      const f = flags.get(cc), country = { settings: { countryCode: cc, locale: liveOf[cc].locale }, apps: !!f?.iosApp && !!f?.androidApp }
      const T = M.translatorFor(liveOf[cc].locale, 'faq')
      return M.tokenValue('apps.offline', { catalog: null, countries: [] }, country, liveOf[cc].locale).value !== T('phrases.appsOffline')
        || M.tokenValue('apps.sentence', { catalog: null, countries: [] }, country, liveOf[cc].locale).value !== T('phrases.appsSentence') || !T('phrases.appsSentence')
    })
    t('…and in every one of the 44, in its own language: the apps phrases (never "the web dashboard needs a connection")', tokMiss.length === 0, tokMiss)

    // The comparison: DE is the only one with a page (admin) — rendered; every country's app rows from its own flags.
    const cmp = await CDE.renderer(kit, 't2-cmp')
    const r = await kit.quietAsync(() => cmp.page({ status: 'admin', apps: true, admin: true }))
    const rowCell = key => { const m = new RegExp(`<tr data-row="${key}">[\\s\\S]*?</tr>`).exec(r.html || ''); return m ? (/<td[^>]*data-value="([a-z_]+)"/.exec(m[0]) || [])[1] : null }
    const deCmp = JSON.parse(read('messages/ns/de-DE/comparison.json'))
    t('the DE comparison (admin, as live): HatchGrab\'s iPad and Android rows say Yes, and the "not yet in the stores" clause is gone', rowCell('ipad') === 'yes' && rowCell('android') === 'yes' && !text(r.html).includes(deCmp.fit.appClause.split('{country}')[0].trim()), { ipad: rowCell('ipad'), android: rowCell('android') })
    const F = Object.fromEntries(M.FILE_FEATURES.map(f => [f.key, f]))
    const cat = WF.CATALOG()
    const cmpMiss = CODES.filter(cc => ['ipad', 'android'].some(k => M.ourAnswer(F[k], { catalog: cat, appFlags: { ios: flags.get(cc).iosApp, android: flags.get(cc).androidApp } }).value !== 'yes'))
    t('…and in all 44, the comparison rows answer Yes for the iPad and Android apps (ourAnswer, from each country\'s flags)', cmpMiss.length === 0, cmpMiss)

    // Manage › Settings: the card from /api/manage's appsAvailable (the same reader), rendered for a TEST truck only.
    const apps = await withReq(async () => Object.fromEntries(await Promise.all(CODES.map(async c => [c, await M.appsOf(c)]))))
    t('Manage: /api/manage\'s reader (appsOf) answers both apps for every country\'s trucks (44)', CODES.every(c => apps[c].ios && apps[c].android))
    const PAGE = 'app/(app)/manage/[token]/page.tsx'
    const S = await kit.bundle('t2-settings', "export * from '@/app/(app)/manage/[token]/page'\nexport { CountrySettingsProvider } from '@/components/CountrySettingsProvider'\nexport { PlanCatalogProvider } from '@/components/PlanCatalogProvider'\nexport { PricingPolicyProvider } from '@/components/PricingPolicy'", { patches: [{ file: PAGE, append: 'export { SettingsTab }' }] })
    const noop = () => {}
    const jpSettings = await wf.rowOf(ROWS(), 'JP')
    const settingsHtml = a => kit.renderStatic(kit.h(S.PlanCatalogProvider, { catalog: cat }, kit.h(S.CountrySettingsProvider, { settings: jpSettings }, kit.h(S.PricingPolicyProvider, { hidePricing: false }, kit.h(S.SettingsTab, {
      userRole: 'owner', truck: { id: 'test-truck', slug: 'test-truck', name: 'Test Truck', plan: 'pro', country: 'JP', currency: 'JPY', trial_expires_at: null }, whatsappConnection: null, whatsappUsage: null,
      onConnectionUpdate: noop, token: 'test-truck-token', api: async () => ({}), showToast: noop, onVerifySuccess: noop, onSwitchTab: noop, categories: [], items: [], subcategories: [],
      onTruckUpdate: noop, onItemsPatch: noop, onCategoriesPatch: noop, onOpenWalkthrough: noop, notices: null, appsAvailable: a })))))
    const card = settingsHtml(apps.JP)
    t('…and the card renders with both store badges, Apple first (a test truck, appsAvailable as /api/manage answers it for JP)', /apps\.apple\.com/.test(card) && /play\.google\.com\/store/.test(card) && card.indexOf('apps.apple.com') < card.indexOf('play.google.com/store'))
    t('…from the same cached reader, behind no other condition than the web (inside the native app it hides: you already have it)', /const flags = await comparisonFlagsOf\(/.test(read('app/api/manage/route.ts')) && /\{!isNativeApp\(\) && \(appsAvailable\.ios \|\| appsAvailable\.android\) && \(/.test(read(PAGE)))
  }

  // ── 2 · the UAE ────────────────────────────────────────────────────────────────────────────────────────────────────
  head('2 · the UAE: comparison off — no comparison page in the sitemap or /llms.txt (read-only)')
  {
    t('live: AE\'s comparison_status is "off" (the only country not off is DE, "admin")', liveOf.AE.comparison_status === 'off' && CODES.filter(c => liveOf[c].comparison_status !== 'off').join() === 'DE')
    const rows = ROWS()
    const sm = await kit.quietAsync(() => wf.sitemap(rows))
    const urls = sm.map(u => u.url)
    const cmpUrls = urls.map(u => new URL(u).pathname).filter(p => M.comparisonAddressOf(p))
    t('the sitemap lists /ae (the marketing pages) but NO comparison address — for the UAE or any country (none is live)', urls.some(u => /\/ae$/.test(u)) && cmpUrls.length === 0, cmpUrls)
    const llms = await kit.quietAsync(() => wf.llms(rows))
    const aeLinks = (llms.match(/https:\/\/www\.hatchgrab\.com\/ae\/[^\s)]*/g) || [])
    t('/llms.txt: no comparison link for the UAE', aeLinks.every(l => !M.comparisonAddressOf(new URL(l).pathname)), aeLinks)
  }

  // ── 3 · Real Thai Food ─────────────────────────────────────────────────────────────────────────────────────────────
  head('3 · Real Thai Food: the guarded migration — one truck, three named columns')
  {
    const sql = read('supabase/migrations/20261064_tidy_2_real_thai_food.sql')
    const code = sql.replace(/--[^\n]*/g, '')
    t('guard: changes it only if it reads plan = trial, is_customer = true, trial_expires_at = 2026-09-30 — otherwise raises and writes nothing',
      /slug = 'real-thai-food' and plan = 'trial' and is_customer = true and trial_expires_at = '2026-09-30 00:00:00\+00'::timestamptz/.test(code) && /if matched <> 1 then\s+raise exception/.test(code))
    t('writes plan = payg, is_customer = false, trial_expires_at = null — and no other column, no other truck, no other table',
      (code.match(/\bupdate\b/gi) || []).length === 1 && /update public\.trucks set plan = 'payg', is_customer = false, trial_expires_at = null\s+where slug = 'real-thai-food'/.test(code) && /if changed <> 1 then/.test(code) && !/pizzeria-gusto/i.test(code))
    const apps = read('supabase/migrations/20261063_tidy_2_apps_everywhere.sql').replace(/--[^\n]*/g, '')
    t('the apps migration writes only ios_app_available and android_app_available on country_settings, every row, and checks the row count',
      (apps.match(/\bupdate\b/gi) || []).length === 1 && /update public\.country_settings set ios_app_available = true, android_app_available = true\s+where/.test(apps) && /total_after <> total_before/.test(apps))
  }

  // ── 4 · yen ────────────────────────────────────────────────────────────────────────────────────────────────────────
  head('4 · yen, never rounded up (F6) — and GBP exactly as before')
  {
    const ENTRY = [
      "export { applyPriceRule, priceAtEvent, toPence, toPounds } from '@/lib/event-pricing/price'",
      "export { readEventPricing, loadEventPriceBook } from '@/lib/event-pricing/read'",
      "export { repriceOrder, toMinor, fromMinor } from '@/lib/order-repricing'",
      "export { computeOrderCharges, checkoutRulesFrom, rulesFromCheckout } from '@/lib/order-charges'",
      "export { resolveChargeRules } from '@/lib/order-charge-rules'",
      "export { formatMinor, formatMajorOrBare } from '@/lib/money-format'",
      "export { formatConfirmationEmail } from '@/lib/email'",
    ].join('\n')
    const NOW = await kit.bundle('t2-now', ENTRY + "\nexport { wholeUnitsFor } from '@/lib/event-pricing/price'\nexport { oldSetupOf, lockedInPrices } from '@/lib/event-pricing/lock-in'\nexport { applyBpsDown } from '@/lib/order-charges'", { stubs: { 'server-only': '' } })
    const whole = f => ({ file: f, from: /^[\s\S]*$/, to: () => gitShow(f) })
    const OLD = await kit.bundle('t2-before', ENTRY, { stubs: { 'server-only': '' }, patches: ['lib/event-pricing/price.ts', 'lib/event-pricing/read.ts', 'lib/order-charges.ts', 'lib/order-charge-rules.ts'].map(whole) })

    // The rule alone.
    const S = (mode, amount, rounding = 'none', cur = 'JPY') => ({ mode, amount, rounding, typed: {}, ...(NOW.wholeUnitsFor(cur) ? { wholeUnits: true } : {}) })
    const yen = (menu, setup) => NOW.toPounds(NOW.applyPriceRule(NOW.toPence(menu), setup))
    t('the registry decides: JPY is zero-decimal; GBP, EUR, USD and HUF (two-decimal for the card processor) are not', NOW.wholeUnitsFor('JPY') && !['GBP', 'EUR', 'USD', 'HUF', null].some(c => NOW.wholeUnitsFor(c)))
    t('¥1,980 + 5% → ¥2,079', yen(1980, S('add_pct', 5)) === 2079)
    t('¥999 + 10% → ¥1,098 (was ¥1,098.90, charged ¥1,099)', yen(999, S('add_pct', 10)) === 1098 && OLD.toPounds(OLD.applyPriceRule(OLD.toPence(999), { mode: 'add_pct', amount: 10, rounding: 'none', typed: {} })) === 1098.9)
    t('¥990 + 15% → ¥1,138 (F6\'s own case, was ¥1,138.50); ¥1,000 − 12.5% → ¥875; ¥999 − 15% → ¥849 (849.15 down)', yen(990, S('add_pct', 15)) === 1138 && yen(1000, S('sub_pct', 12.5)) === 875 && yen(999, S('sub_pct', 15)) === 849)
    t('an amount with a fraction is rounded down too: ¥999 + ¥1.5 → ¥1,000', yen(999, S('add_amount', 1.5)) === 1000)
    t('never down to free: ¥1 − 50% stays ¥1 (the smallest whole yen)', yen(1, S('sub_pct', 50)) === 1)
    t('the operator\'s own rounding still applies after it: ¥999 + 10%, "always round up" → ¥1,098 (already whole); nearest → ¥1,098', yen(999, S('add_pct', 10, 'up_1')) === 1098 && yen(999, S('add_pct', 10, 'nearest_1')) === 1098)
    const lock = NOW.lockedInPrices([{ id: 'i1', name: 'Ramen', pricePence: NOW.toPence(999) }], NOW.oldSetupOf('add_pct', 10, 'none', 'JPY'), {})
    t('a lock-in (a type switched off) freezes the price the customer was charged: ¥1,098', lock[0].price === 1098)

    // The whole chain, as the routes run it.
    const TRUCK = 'test-truck', TYPE = 'bbbbbbbb-0000-4000-8000-000000000001', EV = 'cccccccc-0000-4000-8000-00000000000a'
    const fixture = (menu, mode, amount, rounding = 'none') => ({
      menu_items_db: [{ id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Ramen', price: String(menu), truck_id: TRUCK, category_id: 'cat-1' }],
      modifier_options: [], bundles_db: [], item_modifier_groups: [],
      menu_categories: [{ id: 'cat-1', name: 'Mains', sort_order: 0, truck_id: TRUCK, is_active: true }],
      truck_events: [{ id: EV, price_own: false, price_mode: null, price_amount: null, price_rounding: null, event_type_id: TYPE,
        event_types: { id: TYPE, name: 'Festival', price_change_on: true, price_mode: mode, price_amount: amount, price_rounding: rounding } }],
      event_types: [], event_item_prices: [],
    })
    const stub = fx => {
      const make = table => {
        const q = { _f: [], select() { return this }, eq(k, v) { this._f.push([k, v]); return this }, neq() { return this }, not() { return this }, in() { return this }, gte() { return this }, limit() { return this }, order() { return this },
          _r() { return { data: (fx[table] || []).filter(r => this._f.every(([k, v]) => { const key = k.includes('.') ? k.split('.').pop() : k; return r[key] === undefined || r[key] === v })), error: null } },
          then(res) { return Promise.resolve(this._r()).then(res) }, maybeSingle() { const r = this._r(); return Promise.resolve({ data: r.data[0] ?? null, error: null }) }, single() { return this.maybeSingle() } }
        return q
      }
      return { from: make }
    }
    const JP = await wf.rowOf(ROWS(), 'JP'), GB = await wf.rowOf(ROWS(), 'GB')
    const JPY = { currency: 'JPY', locale: 'ja-JP' }, GBP = { currency: 'GBP', locale: 'en-GB' }
    const JP_TIME = { timeZone: 'Asia/Tokyo', locale: 'ja-JP', timeFormat: '24h', dateOrder: 'ymd', weekStart: 'monday' }
    async function chain(L, menu, amount, cur, settings, money, before = false) {
      const fx = fixture(menu, 'add_pct', amount)
      const pricing = await (before ? L.readEventPricing(stub(fx), EV) : L.readEventPricing(stub(fx), EV, cur))
      const menuApi = L.toPounds(L.priceAtEvent(L.toPence(menu), fx.menu_items_db[0].id, pricing.resolved).pence)                 // GET /api/menu
      const book = await (before ? L.loadEventPriceBook(stub(fx), TRUCK, EV) : L.loadEventPriceBook(stub(fx), TRUCK, EV, cur))       // the submit route's book
      const repriced = L.repriceOrder([{ name: 'Ramen', quantity: 1, unit_price: menuApi }], null, book.book, {}, null)
      const foodMinor = L.toMinor(repriced.calculation.total, cur)
      const rules = L.resolveChargeRules(settings, {})
      const charges = L.computeOrderCharges({ foodMinor, rules, channel: 'online_card' })
      const amountMinor = charges.totalMinor                                                     // → amountMinor: serverTotalMinor → amount: args.amountMinor
      const storedTotal = L.fromMinor(amountMinor, cur)                                          // orders.total (the receipt's and the KDS's figure)
      const checkout = L.checkoutRulesFrom(rules)
      const pageMinor = checkout ? L.computeOrderCharges({ foodMinor: Math.round(repriced.calculation.total * 10 ** (cur === 'JPY' ? 0 : 2)), rules: L.rulesFromCheckout(checkout), channel: 'online_card' }).totalMinor : null
      const orderPage = pageMinor !== null ? pageMinor / 10 ** (cur === 'JPY' ? 0 : 2) : repriced.calculation.total   // the order page's grandTotal
      const mail = L.formatConfirmationEmail({ orderId: '7', orderKey: 'ok-7', truckName: 'Test Truck', customerName: 'Ann', slot: '12:30', items: repriced.items.map(i => ({ name: i.name, quantity: i.quantity, unit_price: i.unit_price })),
        deals: [], discountAmt: 0, total: storedTotal, notes: null, autoAccepted: true, money, time: cur === 'JPY' ? JP_TIME : { timeZone: 'Europe/London', locale: 'en-GB', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' }, paymentState: 'held' })
      const kds = L.formatMajorOrBare(Number(storedTotal), money, 'order card')                 // OrderCard: amount(Number(order.total))
      return { menuApi, bookPrice: book.book.itemPrice.Ramen, foodMinor, amountMinor, storedTotal, orderPage, mail: text(mail.html) + ' ' + (mail.text || ''), kds, shown: L.formatMinor(amountMinor, money), rules }
    }
    for (const [menu, pct, want] of [[1980, 5, 2079], [999, 10, 1098]]) {
      const c = await chain(NOW, menu, pct, 'JPY', JP, JPY)
      const fig = NOW.formatMinor(want, JPY)
      t(`¥${menu.toLocaleString('en')} + ${pct}% at a JP truck: menu ${c.menuApi} = book ${c.bookPrice} = order page ${c.orderPage} = authorised ${c.amountMinor} = stored ${c.storedTotal} = receipt and KDS "${c.kds}" (all ¥${want.toLocaleString('en')})`,
        c.menuApi === want && c.bookPrice === want && c.orderPage === want && c.foodMinor === want && c.amountMinor === want && c.storedTotal === want && c.kds === fig && c.mail.includes(fig) && c.shown === fig, c)
      const wrong = NOW.formatMinor(want + 1, JPY)
      t(`…and "${wrong}" appears nowhere — not in the receipt, not on the card`, !c.mail.includes(wrong) && c.kds !== wrong)
    }
    const old = await chain(OLD, 999, 10, 'JPY', JP, JPY, true)
    t(`before tidy-2 the same order was shown ¥1,098.90 and authorised ¥${old.amountMinor} — the half yen rounded UP (what F6 logged)`, old.menuApi === 1098.9 && old.amountMinor === 1099, old)
    t('the submit route authorises exactly that total: serverTotalMinor = charges.totalMinor → amountMinor → the processor\'s amount',
      /const serverTotalMinor = charges\.totalMinor/.test(read('app/api/orders/submit/route.ts')) && /amountMinor: serverTotalMinor,/.test(read('app/api/orders/submit/route.ts')) && /amount: args\.amountMinor,/.test(read('lib/payments/authorize.ts')))
    t('…priced by the truck\'s currency on every path: the submit route, the menu API, both dashboard edits, the Event types routes and the price cell',
      /loadEventPriceBook\(supabase, resolvedTruckId, pricingEventId, truck\.currency \?\? null\)/.test(read('app/api/orders/submit/route.ts'))
      && /candidatesChangePrices\(supabase, resolvedTruckId, pricingCandidates, truck\.currency \?\? null\)/.test(read('app/api/orders/submit/route.ts'))
      && /readEventPricing\(supabase, effectiveEventId, truck\.currency \?\? null\)/.test(read('app/api/menu/[truckId]/route.ts'))
      && (read('app/api/dashboard/action/route.ts').match(/loadEventPriceBook\(supabase, truck\.id, [^)]*, truck\.currency \?\? null\)/g) || []).length === 2
      && /readEventPricing\(supabase, eventId, truck\.currency \?\? null\)/.test(read('app/api/event-types/route.ts')) && /oldSetupOf\(row\.price_mode, row\.price_amount, row\.price_rounding, truck\.currency \?\? null\)/.test(read('app/api/event-types/route.ts'))
      && /wholeUnitsFor\(money\?\.currency\) \? \{ \.\.\.givenSetup, wholeUnits: true \}/.test(read('components/shared/PriceControls.tsx')))
    t('the KDS and the dashboard card show orders.total through the same formatter (OrderCard: amount(Number(order.total)))', /\{amount\(Number\(order\.total\)\)\}/.test(read('components/dashboard/OrderCard.tsx')))

    // The charges: a percentage fee or tip in yen, down; JP's rules carry the flag, GB's do not.
    const jpRules = NOW.resolveChargeRules(JP, {})
    t('JP\'s charge rules carry roundDown; GB\'s are byte-identical to before (no new key)', jpRules.roundDown === true && JSON.stringify(NOW.resolveChargeRules(GB, {})) === JSON.stringify(OLD.resolveChargeRules(GB, {})))
    const yenRules = { ...jpRules, serviceFee: { recipient: 'truck', bps: 250, fixedMinor: 0 }, tipping: { presetsBps: [1000] } }
    const yc = NOW.computeOrderCharges({ foodMinor: 999, rules: yenRules, channel: 'online_card', tip: { kind: 'percent', bps: 1000 } })
    const yo = OLD.computeOrderCharges({ foodMinor: 999, rules: { ...yenRules, roundDown: undefined }, channel: 'online_card', tip: { kind: 'percent', bps: 1000 } })
    t('in yen, a 2.5% service fee on ¥999 is ¥24 (24.975 down; was ¥25) and a 10% tip ¥99 (99.9 down; was ¥100) — the page shows the same', yc.serviceFeeMinor === 24 && yc.tipMinor === 99 && yo.serviceFeeMinor === 25 && yo.tipMinor === 100
      && NOW.computeOrderCharges({ foodMinor: 999, rules: NOW.rulesFromCheckout(NOW.checkoutRulesFrom(yenRules)), channel: 'online_card', tip: { kind: 'percent', bps: 1000 } }).totalMinor === yc.totalMinor)
    t('…the page\'s tip buttons use the same rounding as the server (applyBpsDown when the checkout says roundDown)', /\(checkout\?\.roundDown \? applyBpsDown : applyBps\)\(foodMinor, bps\)/.test(read('app/(app)/trucks/[slug]/order/page.tsx')) && NOW.applyBpsDown(999, 1000) === 99)

    // GBP: byte-identical to the tree before tidy-2.
    const grid = []
    let cases = 0
    for (const menu of [0.4, 1, 2, 9.99, 10, 11.5, 12.34, 19.8, 123.45]) for (const [mode, amounts] of [['add_pct', [5, 10, 12.5, 15, 33.33]], ['sub_pct', [5, 10, 15, 50]], ['add_amount', [0.5, 1.15]], ['sub_amount', [0.5, 2]], ['none', [null]]])
      for (const amount of amounts) for (const rounding of ['none', 'nearest_1', 'up_1']) {
        const setup = { mode, amount, rounding, typed: {} }
        cases++
        const now = NOW.applyPriceRule(NOW.toPence(menu), { ...setup, ...(NOW.wholeUnitsFor('GBP') ? { wholeUnits: true } : {}) }), before = OLD.applyPriceRule(OLD.toPence(menu), setup)
        if (now !== before) grid.push([menu, mode, amount, rounding, now, before])
      }
    t(`GBP: the rule gives the same pence as before for every case of a ${cases}-case grid (menu × mode × amount × rounding)`, grid.length === 0 && cases === 378, grid)
    const gbChains = []
    for (const [menu, pct] of [[19.8, 5], [9.99, 10], [11.5, 15], [12.34, 12.5]]) {
      const now = await chain(NOW, menu, pct, 'GBP', GB, GBP), before = await chain(OLD, menu, pct, 'GBP', GB, GBP, true)
      const strip = c => ({ ...c, rules: undefined })
      if (JSON.stringify(strip(now)) !== JSON.stringify(strip(before))) gbChains.push({ menu, pct, now: strip(now), before: strip(before) })
    }
    t('GBP, the whole chain (menu, book, order page, authorised amount, stored total, receipt, KDS) byte-identical to before — £9.99 + 10% is still £10.99', gbChains.length === 0
      && (await chain(NOW, 9.99, 10, 'GBP', GB, GBP)).amountMinor === 1099, gbChains)
    const gbCharges = []
    for (const food of [999, 1099, 2079, 12345]) for (const bps of [250, 333, 1000, 1250]) {
      const rules = { ...OLD.resolveChargeRules(GB, {}), serviceFee: { recipient: 'truck', bps, fixedMinor: 20 }, tipping: { presetsBps: [bps] } }
      const a = NOW.computeOrderCharges({ foodMinor: food, rules, channel: 'online_card', tip: { kind: 'percent', bps } }), b = OLD.computeOrderCharges({ foodMinor: food, rules, channel: 'online_card', tip: { kind: 'percent', bps } })
      if (JSON.stringify(a) !== JSON.stringify(b)) gbCharges.push({ food, bps })
    }
    t('GBP charges (a percentage service fee and tip, 16 cases) byte-identical to before — half a penny still rounds as D3 says', gbCharges.length === 0, gbCharges)
    t('Pizzeria Gusto\'s path is GBP and untouched: no tidy-2 file names it', !['lib/event-pricing/price.ts', 'lib/event-pricing/read.ts', 'lib/order-charges.ts', 'lib/order-charge-rules.ts'].some(f => /pizzeria-gusto/i.test(read(f))))
  }

  console.log(`\n${fail ? '🔴' : '✅'} tidy-2: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
