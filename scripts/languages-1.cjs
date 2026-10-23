#!/usr/bin/env node
// scripts/languages-1.cjs — 🔴 THE GROUNDWORK FOR A NON-ENGLISH LANGUAGE, PROVED WITH A MADE-UP ONE (languages-1, 22 October 2026,
// docs/languages-1-report.md). Registered in scripts/harnesses.json; the slow end-to-end render of every surface is
// scripts/languages-1-e2e.cjs (by hand, with screenshots).
//
//   §1  the locale list is written once (lib/i18n/locales.ts); scripts/split-messages.cjs generates a non-English base's catalogue
//       — every namespace, a server `require` and a browser loader — and changes nothing for English;
//   §2  the registry: a non-English language is NOT loaded for an English page, loads on demand, falls back to en-GB key by key,
//       seeds a server-rendered page; English pages carry no seed;
//   §3  formats: the six English countries' 2,850 date/time/money answers are byte-identical to before; a non-English locale gets
//       Intl's dates (no English ordinal), times, numeric dates and money;
//   §4  <html lang>, og:locale and document lang for a non-English locale; nothing added for English;
//   §5  plan names translate through the language file (Pro never), and an English catalogue is the same object;
//   §6  the WhatsApp allergen guard: English byte-identical to before (1,190 messages × 5 sets), its words are data, a language
//       list works Unicode-aware, and a language with NO list FAILS SAFE — run through the real reply function, no AI called;
//   §7  the glossary JSON matches docs/i18n/seo-glossary-eu.md;
//   §8  scripts/translation-check.cjs on the pseudo-language: no structural problem — and every check catches a planted fault;
//   §9  posters: a non-English truck's poster key, dates and words; GB and US unchanged;
//   §10 the moved English is gone from the source it left.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs'); const os = require('os'); const path = require('path')
const { spawnSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'languages-1' })
const { REPO } = kit
const P = require('./_pseudo-locale.cjs')
const TC = require('./translation-check.cjs')
const NP = require('./_native-prices-fixtures.cjs')
const LP1E = require('./_lp1e-fixtures.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const EN = JSON.parse(read('messages/en-GB.json'))
const ENGLISH = ['en-GB', 'en-US', 'en-IE', 'en-AU', 'en-NZ', 'en-CA']

/** The pseudo-language switched on in a bundle: its line in lib/i18n/locales.ts, exactly as a country prompt adds one. Its tag is
 *  "eo-XA" — Esperanto (no market we plan for, and Intl formats it with non-English data) in "XA", the pseudo-locale region. */
// ⚠️ RE-PINNED (france-1, 22 October 2026): fr-FR is in both lists now (France's language), so eo-XA is added AFTER what is there.
// ⚠️ RE-PINNED (europe-languages-1, 22 October 2026): the two lines are read from the file and matched by their shape, not their
// text — each language prompt adds to them (de-DE … nb-NO), so eo-XA is appended to whatever is there.
const LOCALES_LINE = /export const LOCALES = \[[^\]]*\] as const/.exec(fs.readFileSync(path.join(REPO, 'lib/i18n/locales.ts'), 'utf8'))[0]
const BASES_LINE = /export const LANGUAGE_BASES: readonly AppLocale\[\] = \[[^\]]*\]/.exec(fs.readFileSync(path.join(REPO, 'lib/i18n/locales.ts'), 'utf8'))[0]
const XX_PATCHES = [
  // ⚠️ RE-PINNED (europe-settings, 22 October 2026): + en-MT and en-GI (Malta's and Gibraltar's English).
  { file: 'lib/i18n/locales.ts', from: LOCALES_LINE, to: LOCALES_LINE.replace('] as const', ", 'eo-XA'] as const") },
  { file: 'lib/i18n/locales.ts', from: BASES_LINE, to: BASES_LINE.replace(/\]$/, ", 'eo-XA']") },
]
const XX = P.pseudoTree(EN)

;(async () => {
  LP1E.installNoNetwork()

  // ══ 1 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · ONE LOCALE LIST; split-messages generates a non-English base and changes nothing for English')
  const LOC = read('lib/i18n/locales.ts')
  t('lib/i18n/locales.ts holds LOCALES, LOCALE_PARENT and LANGUAGE_BASES', ['export const LOCALES', 'export const LOCALE_PARENT', 'export const LANGUAGE_BASES'].every(x => LOC.includes(x)))
  t('scripts/split-messages.cjs reads the list from lib/i18n/locales.ts and names no locale itself', /readLocales\(\)/.test(read('scripts/split-messages.cjs')) && !/\['en-GB', 'en-US', 'en-IE'/.test(read('scripts/split-messages.cjs')))
  t('lib/i18n/messages.ts names no locale file; it reads the generated lib/i18n/locale-files.ts', !/@\/messages\/en-(US|IE|AU|NZ|CA)\.json/.test(read('lib/i18n/messages.ts')) && /from '\.\/locale-files'/.test(read('lib/i18n/messages.ts')))
  const check = spawnSync(process.execPath, ['scripts/split-messages.cjs', '--check'], { cwd: REPO, encoding: 'utf8' })
  t('the generated catalogue is current (split-messages --check)', check.status === 0, check.stdout)
  // A mini tree: the authored messages, the locale list and the generator — with and without a language base.
  const mini = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-l1-split-'))
  try {
    for (const d of ['messages', 'lib/i18n', 'scripts']) fs.mkdirSync(path.join(mini, d), { recursive: true })
    for (const f of fs.readdirSync(path.join(REPO, 'messages')).filter(f => f.endsWith('.json'))) fs.copyFileSync(path.join(REPO, 'messages', f), path.join(mini, 'messages', f))
    fs.copyFileSync(path.join(REPO, 'lib/i18n/locales.ts'), path.join(mini, 'lib/i18n/locales.ts'))
    fs.copyFileSync(path.join(REPO, 'scripts/split-messages.cjs'), path.join(mini, 'scripts/split-messages.cjs'))
    fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(mini, 'node_modules'))
    const run = () => spawnSync(process.execPath, ['scripts/split-messages.cjs'], { cwd: mini, encoding: 'utf8' })
    run()
    const catalogs = fs.readdirSync(path.join(REPO, 'lib/i18n/catalog'))
    const sameAsRepo = catalogs.every(f => fs.readFileSync(path.join(mini, 'lib/i18n/catalog', f), 'utf8') === read(`lib/i18n/catalog/${f}`))
    t(`with no language base (today): all ${catalogs.length} catalog modules are the repo's own, byte for byte`, sameAsRepo)
    let loc = fs.readFileSync(path.join(mini, 'lib/i18n/locales.ts'), 'utf8')
    for (const p of XX_PATCHES) loc = loc.replace(p.from, p.to)
    fs.writeFileSync(path.join(mini, 'lib/i18n/locales.ts'), loc)
    fs.writeFileSync(path.join(mini, 'messages/eo-XA.json'), JSON.stringify(XX, null, 2))
    const r = run()
    const nsFiles = fs.readdirSync(path.join(mini, 'messages/ns/eo-XA'))
    t(`with eo-XA as a base: a namespace file for every one of en-GB's ${Object.keys(EN).length} namespaces`, nsFiles.length === Object.keys(EN).length, `${nsFiles.length} · ${r.stdout}`)
    const order = fs.readFileSync(path.join(mini, 'lib/i18n/catalog/order.ts'), 'utf8')
    t("its catalog line: the server requires the words, the browser gets a loader — `typeof window === 'undefined' ? require(…) : () => import(…)`",
      order.includes("registerLanguage('order', 'eo-XA', typeof window === 'undefined' ? require('@/messages/ns/eo-XA/order.json') : () => import('@/messages/ns/eo-XA/order.json'))"), order)
    // Take the language's own additions back out (its header mention, its import name, its lines) — what is left must be the
    // repo's module exactly.
    // ⚠️ RE-PINNED (france-1, 22 October 2026): the repo's modules carry fr-FR's lines now, so ONLY eo-XA's are taken out (its
    // header mention, its registerLanguage line and the comment line above it) — what is left must be the repo's module exactly.
    const withoutLanguage = src => { const ls = src.replace(' and messages/eo-XA.json', '').split('\n'); return ls.filter((l, i) => !l.startsWith("registerLanguage(") || !l.includes(", 'eo-XA', ") ? !(l.startsWith('// eslint-disable-next-line') && (ls[i + 1] || '').includes(", 'eo-XA', ")) : false).join('\n') }
    const englishPartSame = catalogs.filter(f => withoutLanguage(fs.readFileSync(path.join(mini, 'lib/i18n/catalog', f), 'utf8')) !== read(`lib/i18n/catalog/${f}`))
    t('every catalog module still registers its English words exactly as before (the language lines are only ADDED)', englishPartSame.length === 0, englishPartSame.slice(0, 5))
    // ⚠️ RE-PINNED (europe-languages-1): a non-English whole file is read untyped (require), so the editor's TS server does not infer it.
    t('lib/i18n/locale-files.ts gains eo-XA for the server', fs.readFileSync(path.join(mini, 'lib/i18n/locale-files.ts'), 'utf8').includes("const eoXA: unknown = require('@/messages/eo-XA.json')"))
  } finally { fs.rmSync(mini, { recursive: true, force: true }) }

  // ══ 2 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · THE REGISTRY: a language loads only when a page is in it, falls back key by key, seeds a server render')
  const R = await kit.bundle('l1-registry', [
    "export * from '@/lib/i18n/registry'", "export * as L from '@/lib/i18n/locales'", "export { translatorFor } from '@/lib/i18n/translator'",
    "export { pageSeedProps } from '@/lib/i18n/page-words'", "import '@/lib/i18n/catalog/order'",
  ].join('\n'), { patches: XX_PATCHES })
  let loads = 0
  const orderXX = JSON.parse(JSON.stringify(XX.order))
  delete orderXX.tipHeading   // a key the language lacks → its en-GB fallback
  R.registerLanguage('order', 'eo-XA', () => { loads++; return Promise.resolve({ default: orderXX }) })
  for (const l of ENGLISH) R.messagesOf(l, ['order'])
  await Promise.all(ENGLISH.map(l => R.ensureLanguage(l)))
  t('six English locales read and "ensured": the language loader never runs (an English page carries no other language)', loads === 0, loads)
  t('before the language is asked for, eo-XA reads its en-GB fallback (and loads nothing)', R.messagesOf('eo-XA', ['order']).order.cardPayment === EN.order.cardPayment && loads === 0)
  const v0 = R.registryVersion()
  await R.ensureLanguage('eo-XA')
  t('ensureLanguage(eo-XA) loads its namespaces once and bumps the version the hooks re-render on', loads === 1 && R.registryVersion() > v0)
  const mx = R.messagesOf('eo-XA', ['order']).order
  t('after loading: its words', mx.cardPayment === XX.order.cardPayment)
  t('a key the language lacks shows the en-GB words (the last resort — translation-check lists every one)', mx.tipHeading === EN.order.tipHeading)
  t('languageWords(eo-XA) hands a server render the words; English gets none', R.languageWords('eo-XA', ['order'])['eo-XA']?.order === orderXX && Object.keys(R.languageWords('en-GB', ['order'])).length === 0)
  t('pageSeedProps: no prop at all for every English locale (their payloads are unchanged)', ENGLISH.every(l => Object.keys(R.pageSeedProps(l, 'marketing')).length === 0))
  t('isLanguageBase: eo-XA yes, every English locale no', R.L.isLanguageBase('eo-XA') && ENGLISH.every(l => !R.L.isLanguageBase(l)))

  // ══ 3 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · FORMATS: English byte-identical; a non-English locale is Intl\'s (no English ordinal)')
  const F = await kit.bundle('l1-formats', ["export * as TU from '@/lib/time-utils'", "export * as MF from '@/lib/money-format'", "export { mapCountryRow } from '@/lib/country-settings'", "export * as CST from '@/lib/country-settings-types'", "export { perMonthText } from '@/lib/price-text'"].join('\n'))
  const GOLD = JSON.parse(read('scripts/fixtures/languages-1-english-formats.json')).grid
  const snakeRow = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
  const rows = NP.WITH_FIXTURES().filter(r => r.countryCode !== 'SE').map(r => F.mapCountryRow(snakeRow(r)))
  const days = []; for (let d = new Date(Date.UTC(2026, 0, 1)); d.getUTCFullYear() === 2026; d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10))
  const times = []; for (let m = 0; m < 1440; m += 15) times.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)
  const gridOf = s => {
    const ts = { timeZone: s.timezones?.[0] ?? s.timeZone ?? 'Europe/London', locale: s.locale, timeFormat: s.timeFormat, dateOrder: s.dateOrder, weekStart: s.weekStart }
    const T = F.TU, g = []
    for (const d of days) g.push([T.formatOrdinalDate(d, ts), T.formatOrdinalDate(d, ts, false), T.formatShortOrdinalDate(d, ts), T.formatShortDate(d, ts), T.formatLongDate(d, ts), T.formatNumericDate(d, ts), T.formatNumericDate(d, ts, true), T.formatNumericDayMonth(d, ts),
      T.formatYmdShortMonth(d, ts, { weekday: 'short', day: 'numeric', month: 'short' }), T.weekdayName(d, s.locale, 'long'), T.weekdayName(d, s.locale, 'short'), T.monthName(d, s.locale, 'long'), T.monthName(d, s.locale, 'short'), T.ordinalDay(Number(d.slice(8)))].join('|'))
    for (const tm of times) g.push([T.formatTime(tm, ts), T.formatTimeRange(tm, '23:45', ts), T.clockOf(tm, '12h', s.locale), T.clockOf(tm, '24h', s.locale)].join('|'))
    const f = F.CST.moneyFormatOf(s), pf = F.CST.planMoneyFormatOf(s)
    for (const minor of [0, 5, 25, 99, 100, 150, 2900, 123456, 1000000]) g.push([F.MF.formatAmount(minor, f), F.MF.formatWholeAmount(minor, f), F.MF.perMonthLabel(minor, pf), F.MF.perMonthLabel(minor, pf, 'month'), F.MF.smallFeeLabel(minor, f), F.MF.formatMinor(minor, f), F.MF.editableMinor(minor, f), F.MF.feeLabel({ pct: 1.5, fixedMinor: minor }, f)].join('|'))
    for (const p of [0, 0.99, 1.5, 2.9, 10]) g.push(F.MF.pctLabel(p, f))
    return g
  }
  for (const s of rows) {
    const g = gridOf(s), want = GOLD[s.countryCode]
    const diff = g.findIndex((x, i) => x !== want[i])
    t(`${s.countryCode} (${s.locale}): ${g.length} date, time and money answers identical to before languages-1`, diff < 0 && g.length === want.length, diff >= 0 ? { at: diff, now: g[diff], before: want[diff] } : undefined)
    const pm = F.MF.perMonthLabel(2900, F.CST.planMoneyFormatOf(s)), pmt = F.perMonthText(2900, F.CST.planMoneyFormatOf(s))
    if (s.countryCode === 'GB' || s.countryCode === 'CA') t(`${s.countryCode}: the worded "/mo" (planFeatures.perMonth) is exactly perMonthLabel's`, pm === pmt && F.perMonthText(2900, F.CST.planMoneyFormatOf(s), 'month') === F.MF.perMonthLabel(2900, F.CST.planMoneyFormatOf(s), 'month'), [pm, pmt])
  }
  const FR = { timeZone: 'Europe/Paris', locale: 'fr-FR', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' }
  const DE = { ...FR, locale: 'de-DE', timeZone: 'Europe/Berlin' }
  const intl = (loc, o, ymd = '2026-10-09') => new Intl.DateTimeFormat(loc, { ...o, timeZone: 'UTC' }).format(new Date(ymd + 'T00:00:00Z'))
  t('fr-FR long date = Intl\'s ("vendredi 9 octobre"), no English ordinal', F.TU.formatOrdinalDate('2026-10-09', FR) === intl('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) && !/\d(st|nd|rd|th)\b/.test(F.TU.formatOrdinalDate('2026-10-09', FR)), F.TU.formatOrdinalDate('2026-10-09', FR))
  t('de-DE short date = Intl\'s ("Fr., 9. Okt.")', F.TU.formatShortOrdinalDate('2026-10-09', DE) === intl('de-DE', { weekday: 'short', day: 'numeric', month: 'short' }), F.TU.formatShortOrdinalDate('2026-10-09', DE))
  t('de-DE numeric date "09.10.2026" — Intl\'s separator, not a forced "/"', F.TU.formatNumericDate('2026-10-09', DE) === '09.10.2026', F.TU.formatNumericDate('2026-10-09', DE))
  const de12 = new Intl.DateTimeFormat('de-DE', { hour: 'numeric', minute: '2-digit', hourCycle: 'h12', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, 18, 30)))
  t(`de-DE 12-hour clock is Intl's own ("${de12}"), never the English "6:30pm" rule`, F.TU.clockOf('18:30', '12h', 'de-DE') === de12 && F.TU.clockOf('18:30', '12h', 'de-DE') !== '6:30pm', F.TU.clockOf('18:30', '12h', 'de-DE'))
  t('fr-FR money is Intl\'s ("29 €", a no-break space)', F.MF.formatAmount(2900, { currency: 'EUR', locale: 'fr-FR' }) === new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(29))
  t('the pseudo-language eo-XA formats with Intl\'s Esperanto data ("vendredo, 9 Oktobro", "29 €") — never Intl\'s English default', F.TU.formatOrdinalDate('2026-10-09', { ...DE, locale: 'eo-XA' }) === intl('eo-XA', { weekday: 'long', day: 'numeric', month: 'long' }) && !/Friday|October/.test(F.TU.formatOrdinalDate('2026-10-09', { ...DE, locale: 'eo-XA' })) && F.MF.formatAmount(2900, { currency: 'EUR', locale: 'eo-XA' }) === new Intl.NumberFormat('eo-XA', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(29))

  // ══ 4 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · <html lang>, og:locale and a document\'s lang')
  const H = await kit.bundle('l1-lang', "export * from '@/lib/page-lang'\nexport { marketingCountry } from '@/lib/marketing-meta'")
  t('<html lang> from the proxy header: fr-FR stays fr-FR; nonsense → "en"', H.htmlLangOf('fr-FR') === 'fr-FR' && H.htmlLangOf('nonsense') === 'en')
  t('an email / the plans PDF: no lang attribute for any English locale (byte-identical), lang="fr-FR" for French', ENGLISH.every(l => H.langAttrOf(l) === '') && H.langAttrOf('fr-FR') === ' lang="fr-FR"')
  t('og:locale and JSON-LD inLanguage follow the locale (fr_FR / fr-FR)', JSON.stringify(H.marketingCountry({ shortName: 'France', name: 'France', locale: 'fr-FR' })) === JSON.stringify({ short: 'France', name: 'France', lang: 'fr-FR', ogLocale: 'fr_FR' }))
  const client = read('lib/i18n/client.tsx')
  t('a truck surface sets <html lang> when its language is a non-English base (only then)', /isLanguageBase\(locale\) && typeof document !== 'undefined'\) document\.documentElement\.lang = htmlLangOfLocale\(locale\)/.test(client))

  // ══ 5 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · PLAN NAMES: through the language file; Pro never; English is the same catalogue')
  const PN = await kit.bundle('l1-plans', "export { localizePlans } from '@/lib/plan-names'\nexport { registerLanguage } from '@/lib/i18n/registry'", { patches: XX_PATCHES })
  const cat = require('./_plans-catalog-fixture.cjs').seedCatalog(REPO)
  t('every English locale: localizePlans returns the SAME catalogue object (nothing translated, nothing copied)', ENGLISH.every(l => PN.localizePlans(cat, l) === cat))
  PN.registerLanguage('planNames', 'eo-XA', { payg: { name: P.pseudoMessage('Pay as you go'), description: P.pseudoMessage('No monthly fee.') } })
  const lx = PN.localizePlans(cat, 'eo-XA')
  const payg = lx.plans.find(p => p.key === 'payg'), pro = lx.plans.find(p => p.key === 'pro')
  t('eo-XA: Pay as you go\'s name and description come from planNames.payg', payg.name === P.pseudoMessage('Pay as you go') && payg.description === P.pseudoMessage('No monthly fee.'))
  t('a plan the language does not name keeps its English row ("Pro" — the glossary invariant)', pro.name === 'Pro' && pro.description === cat.plans.find(p => p.key === 'pro').description)
  t('the source catalogue is untouched', cat.plans.find(p => p.key === 'payg').name === 'Pay as you go')

  // ══ 6 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · THE ALLERGEN GUARD: English byte-identical, words as data, a language list Unicode-aware, NO list → FAIL SAFE')
  const G = await kit.bundle('l1-guard', "export * from '@/lib/allergen-guard'")
  const GOLDG = JSON.parse(read('scripts/fixtures/allergen-guard-en-before.json'))
  for (const set of Object.keys(GOLDG.sets)) {
    const now = GOLDG.messages.map(m => (G.mentionsAllergen(m, set === 'none' ? undefined : set, 'en-GB') ? 1 : 0)).join('')
    t(`English, allergen set "${set}": ${GOLDG.messages.length} messages answered exactly as before languages-1`, now === GOLDG.sets[set], now === GOLDG.sets[set] ? undefined : GOLDG.messages.find((m, i) => now[i] !== GOLDG.sets[set][i]))
  }
  t('the English words are data (lib/allergen-guard/en.json), and lib/whatsapp-classifier.ts holds none of them', fs.existsSync(path.join(REPO, 'lib/allergen-guard/en.json')) && !/const (ALLERGEN_STEMS|ALLERGEN_TOKENS|ANZ_ALLERGEN_STEMS|CA_ALLERGEN_STEMS|ANZ_CAVEAT_WORDS|CA_CAVEAT_WORDS)\b/.test(read('lib/whatsapp-classifier.ts')))
  // ⚠️ RE-PINNED (europe-languages-1, 22 October 2026): German HAS its real list now (lib/allergen-guard/de.json), so the same
  // assertions run against it instead of a fixture list patched in.
  const GX = G
  t('a German list (lib/allergen-guard/de.json): "Ist das glutenfrei?", "ALLERGIE!", "Unverträglichkeit" are caught; "Wo seid ihr heute?" is not', GX.mentionsAllergen('Ist das glutenfrei?', null, 'de-DE') && GX.mentionsAllergen('ALLERGIE!', null, 'de-AT') && GX.mentionsAllergen('Ich habe eine Unverträglichkeit', null, 'de-DE') && !GX.mentionsAllergen('Wo seid ihr heute?', null, 'de-DE'))
  t('…Unicode-aware: accents and case folded ("Allérgie" → allergie)', GX.mentionsAllergen('Allérgie?', null, 'de-DE'))
  // ⚠️ RE-PINNED (france-1, 22 October 2026): French HAS a list now (lib/allergen-guard/fr.json; scripts/france-1.cjs proves
  // it), so the language with NO list is Italian (it-IT) — the fail-safe it proves is unchanged.
  // ⚠️ RE-PINNED (europe-languages-1, 22 October 2026): Italian (and German, Spanish, Portuguese, Dutch and the Nordic languages)
  // HAS a list now, so the language with NO list is Polish (pl-PL) — the fail-safe it proves is unchanged.
  // ⚠️ RE-PINNED (europe-languages-2, 23 October 2026): Polish (and the other EU languages) HAS a list now, so the language with
  // NO list is Turkish (tr-TR) — the fail-safe it proves is unchanged.
  t('a language with NO list: hasGuardWords is false (the classifier then never lets the AI answer a menu question)', !G.hasGuardWords('tr-TR') && G.hasGuardWords('en-US'))
  t('…and its messages are matched against EVERY list ("intoleransım" holds the "intolerans" stem)', G.mentionsAllergen('Laktoz intoleransım var', null, 'tr-TR'))
  // The real reply function, for a truck whose language has no list: a plain menu question gets the allergen reply, no AI call.
  const W = await kit.bundle('l1-wa', "export { generateWhatsAppReply } from '@/lib/whatsapp-classifier'")
  globalThis.__harnessDb = kit.fakeDb({ menu_items_db: [{ truck_id: 't1', name: 'Pizza', category_id: 'c1', price: 9, is_available: true, is_active: true, allergens: ['Milk'], dietary_info: [], menu_categories: { name: 'Mains' } }] })
  let aiCalls = 0
  const realFetch = globalThis.fetch
  globalThis.fetch = async u => { if (String(u).includes('generativelanguage')) aiCalls++; throw new Error('no network in this harness') }
  try {
    const base = { money: { currency: 'TRY', locale: 'tr-TR' }, allergenSet: 'uk14', truckName: 'Food Truck İstanbul', truckEmoji: '🍕', truckId: 't1', events: [], scheduleUrl: 'https://x/o', orderUrl: 'https://x/o', isFollowUp: false }
    const fr = await kit.quietAsync(() => W.generateWhatsAppReply({ ...base, time: { timeZone: 'Europe/Istanbul', locale: 'tr-TR', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' }, customerMessage: 'Hangi pizzalarınız var?' }))
    const frCalls = aiCalls
    const en = await kit.quietAsync(() => W.generateWhatsAppReply({ ...base, money: { currency: 'GBP', locale: 'en-GB' }, time: { timeZone: 'Europe/London', locale: 'en-GB', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' }, customerMessage: 'What pizzas do you have?' }))
    const redirect = /allergen/i.test(fr.reply ?? '')
    t('a tr-TR truck (no list) asked a plain menu question: the ALLERGEN reply, and the menu AI is never asked', redirect && fr.classification === 'MENU_QUERY', fr)
    t('…while an English truck asked the same gets the menu answer path (its deterministic summary here — no network), not the allergen reply', !/allergen/i.test(en.reply ?? '') && en.classification === 'MENU_QUERY', en)
    t(`the tr-TR truck's reply made ${frCalls} AI attempt(s) — the classifier only; the menu answer is never asked (the English one tried both: ${aiCalls - frCalls})`, frCalls === 1 && aiCalls - frCalls === 2, { frCalls, enCalls: aiCalls - frCalls })
  } finally { globalThis.fetch = realFetch; delete globalThis.__harnessDb }

  // ══ 7 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('7 · THE GLOSSARY AS DATA')
  const gb = spawnSync(process.execPath, ['scripts/glossary-build.cjs', '--check'], { cwd: REPO, encoding: 'utf8' })
  t('lib/i18n/glossary/*.json match docs/i18n/seo-glossary-eu.md (glossary-build --check)', gb.status === 0, gb.stdout)
  for (const lang of ['de', 'nl', 'fr', 'es', 'it']) {
    const g = JSON.parse(read(`lib/i18n/glossary/${lang}.json`))
    t(`${lang}: ${g.concepts.length} concepts, each with a Use term; ${g.concepts.filter(c => c.en).length} tied to en-GB wording; the Pay at Hatch / plan-name row; the invariants`,
      g.concepts.length >= 25 && g.concepts.every(c => c.use.length) && g.concepts.filter(c => c.en).length >= 8 && g.recommendations?.payAtHatchFeature && g.invariants.some(i => i.term === 'HatchGrab'))
  }

  // ══ 8 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('8 · scripts/translation-check.cjs — the pseudo-language passes; every check catches a planted fault')
  const planKeys = cat.plans.filter(p => p.isPublic && p.active && p.name !== 'Pro').map(p => p.key)
  const xxFull = { ...XX, planNames: Object.fromEntries(planKeys.map(k => [k, { name: P.pseudoMessage(cat.plans.find(p => p.key === k).name) }])) }
  const back = Object.fromEntries(Object.entries(TC.flat(xxFull)).map(([k, v]) => [k, P.backTranslate(v)]))
  const gx = P.pseudoGlossary(JSON.parse(read('lib/i18n/glossary/fr.json')))
  const run = (msgs, b = back, extra = {}) => TC.check({ locale: 'eo-XA', messages: msgs, en: EN, glossary: gx, back: b, planKeys, guardLanguages: ['en', 'xx'], ...extra })
  const ok = run(xxFull)
  t(`the pseudo-language: 0 structural problems over ${ok.counts.translated} keys`, ok.S.missing.length + ok.S.extra.length + ok.S.icu.length === 0, ok.S)
  t('…no glossary miss, no banned term, no number/brand change, no meaning drift, every plan named', !ok.F.glossary.length && !ok.F.banned.length && !ok.F.numbers.length && !ok.F.drift.length && !ok.F.plans.length, { g: ok.F.glossary.slice(0, 2), n: ok.F.numbers.slice(0, 2), d: ok.F.drift.slice(0, 2) })
  const plant = (fn) => { const m = JSON.parse(JSON.stringify(xxFull)); fn(m); return m }
  const flat = TC.flat
  const r1 = run(plant(m => { delete m.order.tipHeading }))
  t('planted: a missing key → STRUCTURAL (listed as an en-GB fallback)', r1.S.missing.includes('order.tipHeading'))
  const r2 = run(plant(m => { m.emailOperator.newEvents.subject = m.emailOperator.newEvents.subject.replace('{truck}', '{lorry}') }))
  t('planted: a renamed placeholder → STRUCTURAL', r2.S.icu.some(x => x.startsWith('emailOperator.newEvents.subject')))
  const r3 = run(plant(m => { m.emailOperator.newEvents.found = 'Ŵé ƒöûñð <b>{count}</b>' }))
  t('planted: a plural dropped → STRUCTURAL', r3.S.icu.some(x => x.startsWith('emailOperator.newEvents.found')))
  const r4 = run(plant(m => { m.order.tipHeading = EN.order.tipHeading }))
  t('planted: an untranslated string → flagged as English left', r4.F.english.some(([k]) => k === 'order.tipHeading'))
  const ftKey = Object.keys(flat(EN)).find(k => /\bfood trucks?\b/i.test(flat(EN)[k]) && !/\{/.test(flat(EN)[k]))
  const r5 = run(plant(m => { const parts = ftKey.split('.'); let o = m; while (parts.length > 1) o = o[parts.shift()]; o[parts[0]] = P.accent(flat(EN)[ftKey].replace(/food trucks?/i, 'mobile kitchen')) }))
  t(`planted: "food truck" rendered another way (${ftKey}) → flagged as a glossary miss`, r5.F.glossary.some(([k]) => k === ftKey))
  const r6 = run(plant(m => { m.landing.meta.title = m.landing.meta.title.replace('HatchGrab', 'ĤåţçĥĜŕåƀ') }), back, { glossary: { ...gx, banned: [...gx.banned, { pattern: 'ĤåţçĥĜŕåƀ', why: 'planted' }] } })
  t('planted: the brand changed → flagged (invariant), and a banned term → flagged', r6.F.invariants.some(([k]) => k === 'landing.meta.title') && r6.F.banned.some(([k]) => k === 'landing.meta.title'))
  const numKey = Object.keys(flat(EN)).find(k => /\b60\b/.test(flat(EN)[k]))
  const r7 = run(plant(m => { const parts = numKey.split('.'); let o = m; while (parts.length > 1) o = o[parts.shift()]; o[parts[0]] = o[parts[0]].replace('60', '90') }))
  t(`planted: a number changed (${numKey}: 60 → 90) → flagged`, r7.F.numbers.some(([k]) => k === numKey))
  const r8 = run(plant(m => { m.manageShell.tabs.menu = P.pseudoMessage('Menu of the day and everything else you sell') }))
  t('planted: a tab label three times its English length → flagged as likely to overflow', r8.F.length.some(([k]) => k === 'manageShell.tabs.menu'))
  const r9 = run(xxFull, { ...back, 'order.tipHeading': 'Pay with cash at the counter' })
  t('planted: a back-translation that drifts → listed in the drift table', r9.F.drift.some(([k]) => k === 'order.tipHeading'))
  const r10 = run(plant(m => { delete m.planNames[planKeys[0]] }))
  t('planted: a public plan with no translated name → flagged', r10.F.plans.length === 1)
  const r11 = TC.check({ locale: 'yy-YY', messages: xxFull, en: EN, glossary: null, back: null, planKeys, guardLanguages: ['en'] })
  t('a language with no glossary, no back-translation and no allergen word list: each is flagged (the guard one names FAIL SAFE)', r11.F.other.length === 3 && r11.F.other.some(([k, w]) => k === 'allergen guard' && /FAILS SAFE/.test(w)))

  // ══ 9 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('9 · POSTERS: a non-English truck\'s key, dates and words; GB and US unchanged')
  const WP = await kit.bundle('l1-poster', "export * as LOC from '@/lib/weekly-post/locale'\nexport * as W from '@/lib/weekly-post/words'", { patches: XX_PATCHES })
  t('countryForTruck: a US truck → "US", a GB truck → "GB" (as before); a truck in eo-XA → "eo-XA"', WP.LOC.countryForTruck({ country: 'US' }) === 'US' && WP.LOC.countryForTruck({ country: 'GB' }, 'en-GB') === 'GB' && WP.LOC.countryForTruck({ country: 'US' }, 'eo-XA') === 'eo-XA')
  const gbSamples = WP.LOC.localeFor('GB').dateStyles.map(d => d.sample).join('|'), usSamples = WP.LOC.localeFor('US').dateStyles.map(d => d.sample).join('|')
  t('GB and US date samples unchanged', gbSamples === 'Wednesday 14th October|Wed 14th Oct|14th October|Wed 14/10' && usSamples === 'Wednesday, October 14th|Wed, Oct 14th|October 14th|Wed 10/14', [gbSamples, usSamples])
  const xs = WP.LOC.localeFor('eo-XA')
  t('eo-XA: its own spec — 24-hour, the order Intl writes a numeric date in, samples written by Intl (its Esperanto data), no English ordinal',
    xs.country === 'eo-XA' && xs.defaultTimeStyle === '24h' && xs.numericOrder === (new Intl.DateTimeFormat('eo-XA', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).formatToParts(new Date(Date.UTC(2026, 9, 14))).find(p => p.type === 'day' || p.type === 'month').type === 'month' ? 'mdy' : 'dmy') && xs.dateStyles[0].sample === intl('eo-XA', { weekday: 'long', day: 'numeric', month: 'long' }, '2026-10-14') && !/\d(st|nd|rd|th)\b/.test(xs.dateStyles.map(d => d.sample).join(' ')), xs.dateStyles)
  t('eo-XA: the caption date is Intl\'s; the words are the language\'s own (posterLocaleOf → eo-XA)', WP.LOC.shortDateTextFor('2026-10-14', 'eo-XA') === intl('eo-XA', { weekday: 'short', day: 'numeric', month: 'short' }, '2026-10-14') && WP.W.posterLocaleOf('eo-XA') === 'eo-XA' && WP.W.posterLocaleOf('GB') === 'en-GB' && WP.W.posterLocaleOf('US') === 'en-US')

  // ══ 10 ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('10 · THE MOVED ENGLISH IS GONE FROM THE SOURCE IT LEFT (spot checks; the full list is docs/languages-1-report.md §2)')
  const gone = [
    ['components/menu/MenuUploadFields.tsx', 'Upload menu file'], ['components/auth/SessionAlertBanner.tsx', 'Your sign-in needs attention'],
    ['components/StoreBadges.tsx', 'Download on the App Store'], ['app/embed/[slug]/EmbedSchedule.tsx', 'Loading schedule…'],
    ['components/embed/EmbedParts.tsx', '        Powered by <span className="font-bold'], ['lib/generateQRCode.ts', "fillText('Powered by HatchGrab'"],
    ['lib/dashboard-read.ts', "return `Can't reach the server"],
    ['app/api/inbound-schedule/route.ts', 'Review your schedule →'], ['app/features/page.tsx', 'Plans & features compared'], ['app/domain/page.tsx', 'is trading next.'],
    ['lib/useReadyEmailUndo.ts', 'reverted`'], ['app/api/cron/auto-reject-offline-orders/route.ts', "'The van lost its internet connection"],
    ['components/setup/WhereBasedStep.tsx', 'COPY.stepIntro'], ['app/dashboard/[token]/page.tsx', '{CONFIRM_TO_PRIVATE}'],
  ]
  for (const [f, s] of gone) t(`${f}: no longer writes "${s}"`, !read(f).includes(s))
  // The slot engine stays import-free (its harnesses compile lib/ alone): it keeps its English as a default and the screen passes
  // the words.
  const panel = read('components/dashboard/AddOrderPanel.tsx')
  t('the add-order panel passes the fit popup\'s and the fit suffix\'s words from messages (`addOrder.fitMessage`, `addOrder.fitSuffix`) to the import-free engine',
    /t: fitWords \}\)/.test(panel) && /formatFitSuffix\(ind\.tone, wontFit, !!label, fitSuffixWords\)/.test(panel) && !/^import /m.test(read('lib/slot-fit-message.ts').replace(/^import type [^\n]*\n/gm, '')))

  // The reply cap stays import-free (its English is the default when no words are passed); the webhook passes the truck's.
  t('the WhatsApp reply-cap handoff is worded by the webhook in the truck\'s language (`whatsappCustomer.capHandoff` / `.capContact`) through the import-free engine',
    /tCap\('capHandoff', \{ link \}\)/.test(read('app/api/webhooks/meta/whatsapp/route.ts')) && /tCap\('capContact', \{ number \}\)/.test(read('app/api/webhooks/meta/whatsapp/route.ts'))
    && !/^import /m.test(read('lib/whatsapp/reply-cap.ts').replace(/^import type [^\n]*\n/gm, '')))

  console.log(`\n${fail ? '🔴' : '✅'} languages-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
