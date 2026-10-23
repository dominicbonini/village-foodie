// scripts/_language-phase-0-after.cjs — the AFTER half of scripts/language-phase-0.cjs (docs/language-phase-0-report.md):
// the i18n framework itself, the keys-from-labels work beyond byte-identity, and the one date-word path's shape.
const fs = require('fs'); const path = require('path')

module.exports = async function after(x) {
  const { kit, t, head, read, REPO, before, STUBS, GB, US_ON } = x
  const src = f => read(f)
  const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

  /* ── 3 · the framework ── */
  head('3 · next-intl in: version, no URL routing, one resolver, deep-merged messages, typed keys')
  const pkg = JSON.parse(src('package.json'))
  const lock = JSON.parse(src('package-lock.json'))
  t('next-intl pinned to an exact version (4.14.8), lockfile agrees', pkg.dependencies['next-intl'] === '4.14.8' && lock.packages['node_modules/next-intl']?.version === '4.14.8', pkg.dependencies['next-intl'])
  const cfg = src('next.config.ts')
  // Language Phase 1a (docs/language-phase-1a-report.md): the same request config, now in the object form that
  // also switches on the build's message precompile — and nothing else.
  t('next.config registers the request config, and nothing else changed shape',
    (/createNextIntlPlugin\("\.\/lib\/i18n\/request\.ts"\)/.test(cfg)
      || /createNextIntlPlugin\(\{\s*requestConfig: "\.\/lib\/i18n\/request\.ts",\s*experimental: \{ messages: \{ path: "\.\/messages", format: "json", locales: "infer", precompile: true \} \},\s*\}\)/.test(cfg))
    && /export default withNextIntl\(nextConfig\);/.test(cfg))
  const proxy = fs.existsSync(path.join(REPO, 'proxy.ts')) ? src('proxy.ts') : ''
  const appDirs = require('child_process').execSync("find app -type d -name '[[]locale[]]'", { cwd: REPO, encoding: 'utf8' }).trim()
  const anyMiddleware = require('child_process').execSync("grep -rl \"next-intl/middleware\\|next-intl/routing\\|next-intl/navigation\" app components lib proxy.ts 2>/dev/null || true", { cwd: REPO, encoding: 'utf8' }).trim()
  t('no URL routing: no [locale] segment, no next-intl middleware/routing/navigation import, proxy untouched by it', !appDirs && !anyMiddleware && !/next-intl/.test(proxy), `${appDirs} ${anyMiddleware}`)

  const I = await kit.bundle('lp0-i18n', [
    "export * as L from '@/lib/i18n/locales'", "export * as M from '@/lib/i18n/messages'", "export * as TR from '@/lib/i18n/translator'",
    "import '@/lib/i18n/catalog/order'",   // Language Phase 1b: the translator reads the namespaces its caller imports
    "export { default as requestConfig } from '@/lib/i18n/request'", "export { NAMESPACES } from '@/lib/i18n/namespaces'",
  ].join('\n'), { stubs: { 'next-intl/server': 'export function getRequestConfig(fn) { return fn }' } })
  // ⚠️ RE-PINNED (france-1, 22 October 2026): fr-FR is a supported locale now (France); the unsupported example is de-DE.
  // ⚠️ RE-PINNED (europe-languages-1, 22 October 2026): German is supported now too; the unsupported example is Polish (pl-PL).
  // ⚠️ RE-PINNED (europe-languages-2, 23 October 2026): Polish and every EU language are supported now; the example is tr-TR.
  const cases = [['en-GB', 'en-GB'], ['en-US', 'en-US'], ['tr-TR', 'en-GB'], ['en', 'en-GB'], ['en-us', 'en-GB'], ['', 'en-GB'], [null, 'en-GB'], [undefined, 'en-GB']]
  t('resolveLocale: en-GB and en-US only; anything else → en-GB', cases.every(([i, o]) => I.L.resolveLocale(i) === o), JSON.stringify(cases.map(([i]) => I.L.resolveLocale(i))))
  t('a country → its locale: GB → en-GB, US → en-US, none → en-GB', I.L.localeOfCountry(GB) === 'en-GB' && I.L.localeOfCountry(US_ON) === 'en-US' && I.L.localeOfCountry(null) === 'en-GB')
  // ⚠️ RE-PINNED (Language Phase 2): the catalogue this run renders with — the frozen pre-Phase-2 words under
  // HG_MESSAGES_FROZEN (en-US {} then), which language-phase-0.cjs sets. Phase 2 fills messages/en-US.json on purpose.
  const { 'en-GB': enGB, 'en-US': enUS } = require('./_lp2-frozen.cjs').catalogues()
  t('deep merge: a US string replaces the UK one, and every key the US file lacks stays UK',
    JSON.stringify(I.M.deepMerge({ a: { x: '1', y: '2' }, b: 'B' }, { a: { y: '3' } })) === JSON.stringify({ a: { x: '1', y: '3' }, b: 'B' }))
  t('en-US = en-GB with en-US merged over it (in the catalogue this run renders with, the US file overrides nothing)', JSON.stringify(I.M.messagesFor('en-US')) === JSON.stringify(I.M.deepMerge(enGB, enUS)) && JSON.stringify(enUS) === '{}')
  t('a missing US key shows the UK text, never a raw key', I.TR.translatorFor('en-US', 'order')('tipHeading') === 'Add a tip for the truck?')
  t('pickNamespaces sends only what a surface needs', JSON.stringify(Object.keys(I.M.pickNamespaces(I.M.messagesFor('en-GB'), ['order']))) === '["order"]')
  const rcUS = await I.requestConfig({ locale: 'en-US', requestLocale: Promise.resolve(undefined) })
  const rcNone = await I.requestConfig({ requestLocale: Promise.resolve(undefined) })
  t('request config (server components): the locale asked for, else en-GB, with the merged messages', rcUS.locale === 'en-US' && rcNone.locale === 'en-GB' && JSON.stringify(rcUS.messages) === JSON.stringify(I.M.messagesFor('en-US')))
  t('typed keys: lib/i18n/typecheck.ts holds a missing key and a missing namespace, each under @ts-expect-error (tsc fails if either stops being an error)',
    (src('lib/i18n/typecheck.ts').match(/@ts-expect-error/g) || []).length === 2 && /AppConfig[\s\S]*Messages: typeof enGB/.test(src('lib/i18n/app-config.d.ts')))

  // Providers: in each surface's layout, with only its namespaces; each page reports its truck's locale.
  const LAYOUTS = {
    'app/trucks/[slug]/order/layout.tsx': 'order', 'app/order/[id]/layout.tsx': 'confirmation', 'app/dashboard/[token]/layout.tsx': 'dashboard',
    'app/dashboard/[token]/kds/layout.tsx': 'kds', 'app/kds/[kds_token]/layout.tsx': 'kds', 'app/manage/[token]/layout.tsx': 'manage', 'app/setup/layout.tsx': 'setup',
  }
  for (const [f, ns] of Object.entries(LAYOUTS)) t(`provider in ${f} with NAMESPACES.${ns}`, new RegExp(`<I18nProvider namespaces=\\{NAMESPACES\\.${ns}\\}>`).test(src(f)))
  const PAGES = {
    'app/trucks/[slug]/order/page.tsx': /useTruckLocale\(pageTs\.locale\)/, 'app/order/[id]/manage/page.tsx': /useTruckLocale\(order\?\.time\?\.locale\)/,
    'app/dashboard/[token]/page.tsx': /useTruckLocale\(dashTime\.locale\)/, 'app/dashboard/[token]/kds/page.tsx': /useTruckLocale\(kdsTime\.locale\)/,
    'app/manage/[token]/page.tsx': /useTruckLocale\(countrySettings\?\.locale\)/, 'app/setup/page.tsx': /useTruckLocale\(signupCountries\.data\?\.countries\.find\(c => c\.code === base\?\.country\)\?\.locale\)/,
  }
  for (const [f, re] of Object.entries(PAGES)) t(`${f} tells its provider the truck's locale`, re.test(src(f)))
  t('NextIntlClientProvider is rendered by the one provider, beside (not instead of) the country settings', /<NextIntlClientProvider locale=\{locale\} messages=\{messages\}>/.test(src('lib/i18n/client.tsx')) && /<CountrySettingsProvider settings=\{countrySettings\}>/.test(src('app/manage/[token]/page.tsx')))

  // The client path, mounted for real: effects run, so the provider really switches to the truck's locale.
  const { installMiniDom } = require('./_mini-dom.cjs')
  const C = await kit.bundle('lp0-client', `
    import { createElement as h } from 'react'
    import { I18nProvider, useT, useTruckLocale } from '@/lib/i18n/client'
    import '@/lib/i18n/catalog/order'   // Language Phase 1b: a file that reads a namespace imports its catalog module
    import { useLocale } from 'next-intl'
    export { I18nProvider }
    export function Probe({ tag }) { useTruckLocale(tag); const t = useT('order'); return h('p', null, useLocale() + '|' + t('tipHeading')) }
    export function Bare() { const t = useT('order'); return h('p', null, t('tipHeading')) }`)
  const React = require(path.join(REPO, 'node_modules/react')); const { act } = React
  const { createRoot } = require(path.join(REPO, 'node_modules/react-dom/client'))
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const mount = async el => {
    const dom = installMiniDom(); const root = createRoot(dom.container)
    await act(async () => { root.render(el) }); await act(async () => { await new Promise(r => setTimeout(r, 10)) })
    const text = dom.container.textContent; await act(async () => root.unmount()); dom.teardown(); return text
  }
  const gb = await kit.quietAsync(() => mount(React.createElement(C.I18nProvider, { namespaces: ['order'] }, React.createElement(C.Probe, { tag: 'en-GB' }))))
  const us = await kit.quietAsync(() => mount(React.createElement(C.I18nProvider, { namespaces: ['order'] }, React.createElement(C.Probe, { tag: 'en-US' }))))
  const fr = await kit.quietAsync(() => mount(React.createElement(C.I18nProvider, { namespaces: ['order'] }, React.createElement(C.Probe, { tag: 'tr-TR' }))))   // ⚠️ RE-PINNED (france-1): de-DE; (europe-languages-1): pl-PL; (europe-languages-2): tr-TR, still unsupported
  t('client path: a GB truck → provider en-GB, today\'s UK words', gb === 'en-GB|Add a tip for the truck?', gb)
  t('client path: a US truck → provider switches to en-US; the words are the UK ones (no US override yet)', us === 'en-US|Add a tip for the truck?', us)
  t('client path: an unsupported locale → en-GB', fr === 'en-GB|Add a tip for the truck?', fr)
  t('client path: no provider at all → en-GB words, no throw', kit.renderStatic(React.createElement(C.Bare)) === '<p>Add a tip for the truck?</p>')
  t('the order page draws the tip heading from messages (client key, end to end)', /\{tOrder\('tipHeading'\)\}/.test(src('app/trucks/[slug]/order/page.tsx')) && !/>Add a tip for the truck\?</.test(src('app/trucks/[slug]/order/page.tsx')))
  t('the plans PDF draws its heading from messages (server key, end to end; the PDF HTML above is byte-identical for GB and US)', /<h1>\$\{esc\(translatorFor\(s\.locale, 'plansPdf'\)\('title'\)\)\}<\/h1>/.test(src('lib/plans-pdf.ts')) && !/<h1>Plans and features<\/h1>/.test(src('lib/plans-pdf.ts')))

  /* ── 4 · keys separated from labels, beyond byte-identity ── */
  head('4 · display text is never a key: every lookup compares ids')
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): lib/legacy-pricing-display.ts is DELETED. The plan table's rows
  // are lib/feature-table.ts FEATURE_TABLE (id = the message key, `feature` = the gate), rendered by the one plan table
  // (components/pricing/PlanTable.tsx) on /features, Manage › Billing and the plans PDF.
  const LEGACY = fs.existsSync(path.join(REPO, 'lib/legacy-pricing-display.ts'))
  const K = await kit.bundle('lp0-keys-after', [
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): lib/plan-features.ts is deleted; its content (and the plan price display that
    // lived in lib/features.ts) moved, frozen, into lib/legacy-pricing-display.ts.
    LEGACY ? "export * as PF from '@/lib/legacy-pricing-display'" : "export * as FT from '@/lib/feature-table'", "export * as PW from '@/lib/price-words'", "export * as CT from '@/lib/contact-topics'",
    "export * as MF from '@/lib/money-format'", "export * as FE from '@/lib/features'", "export * as WU from '@/lib/walk-up'",
  ].join('\n'), { stubs: STUBS })
  const tableRows = LEGACY ? K.PF.FEATURE_SECTIONS.flatMap(s => s.rows) : K.FT.FEATURE_TABLE
  t(`every plan-table row has a unique id (${tableRows.length} rows)`, tableRows.every(r => typeof r.id === 'string' && r.id) && new Set(tableRows.map(r => r.id)).size === tableRows.length)
  // ⚠️ RE-PINNED (pricing-pages, Stage B): access is asked of each row's GATE (its `feature`), once per Feature.
  const rows = LEGACY ? tableRows : [...new Set(tableRows.map(r => r.feature).filter(Boolean))].map(id => ({ id }))
  if (!LEGACY) t(`Stage B: every row's gate is a Feature (lib/features.ts FEATURES) — ${rows.length} gates`, rows.length > 20 && rows.every(r => K.FE.isFeature(r.id)))
  // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): the parity check compared the tier cells with tiered gates; both the guard and
  // the tiers are gone. Replaced by the new state: no drift guard in the frozen display, and no plan decides access.
  t('the feature-gate parity check is gone with the tiered gates (no findPlanParityViolations / ROW_FEATURE_MAP)', (LEGACY ? !('findPlanParityViolations' in K.PF) && !('ROW_FEATURE_MAP' in K.PF) : !fs.existsSync(path.join(REPO, 'lib/legacy-pricing-display.ts'))) && !/PLAN_FEATURES|hasFeature/.test(stripComments(src('lib/features.ts'))))
  // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): canAccess takes a REQUIRED third argument, the effective
  // plan's switch. Under a plan with every feature on, the override answers are unchanged; under a plan with the feature
  // off, no override → denied and an override true → allowed (the override wins).
  const planOn = () => true, planOff = () => false
  t('access under a plan with the feature on: no override → allowed, false → denied, true → allowed (every plan-table row)', rows.every(r => K.FE.canAccess(r.id, null, planOn) === true && K.FE.canAccess(r.id, { [r.id]: false }, planOn) === false && K.FE.canAccess(r.id, { [r.id]: true }, planOn) === true))
  t('Stage A2: under a plan with the feature off: no override → denied, true → allowed, false → denied (every plan-table row)', rows.every(r => K.FE.canAccess(r.id, null, planOff) === false && K.FE.canAccess(r.id, { [r.id]: true }, planOff) === true && K.FE.canAccess(r.id, { [r.id]: false }, planOff) === false))
  // ⚠️ RE-PINNED (same): both sources are now the one frozen file.
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the frozen file is deleted — the table's code is lib/feature-table.ts,
  // lib/plan-offer.ts and components/pricing/PlanTable.tsx; the same "no lookup on a row NAME" rule is asserted of them.
  const PF_SRC = stripComments(LEGACY ? src('lib/legacy-pricing-display.ts') : ['lib/feature-table.ts', 'lib/plan-offer.ts', 'components/pricing/PlanTable.tsx'].map(src).join('\n')), LT_SRC = PF_SRC
  t('no lookup keys on a row NAME any more (feature map, trial column, overrides, Billing, Admin)',
    !/ROW_FEATURE_MAP\[row\.name\]|row\.name !== WHATSAPP_ROW_NAME/.test(PF_SRC) && !/row\.name ===|\.has\(row\.name\)|_OVERRIDES\[row\.name\]/.test(LT_SRC)
    && !/row\.name === 'Online ordering — Pay at Hatch'/.test(src('app/manage/[token]/page.tsx') + src('app/admin/page.tsx')) && !/r\.name === rowName/.test(src('app/manage/[token]/page.tsx')))
  // ⚠️ RE-PINNED (pricing-pages, Stage B): the comparison table is components/pricing/PlanTable.tsx (FeatureComparison is deleted).
  t('"Coming soon" is decided by the cell\'s state, not its words (plan table, PDF)', !/label === 'Coming soon'/.test(src(LEGACY ? 'components/landing/FeatureComparison.tsx' : 'components/pricing/PlanTable.tsx') + src('lib/plans-pdf.ts')) && (LEGACY || /tableCell\(/.test(src('components/pricing/PlanTable.tsx'))))
  t('price words: one definition, the same seven words the mask always exempted', JSON.stringify(Object.values(K.PW.PRICE_WORD).sort()) === JSON.stringify(['Free', 'Free trial', 'Lifetime', '0%', 'Pay at Hatch', 'Unlimited', '—'].sort()) && !/NON_SECRET_PRICE = new Set\(/.test(src('lib/pricing.ts')))
  t('"Pay at Hatch" stays a brand name in every country (one word, no US variant)', K.PW.PRICE_WORD.payAtHatch === 'Pay at Hatch' && !/Pay at Hatch/.test(src('messages/en-US.json')))
  if (LEGACY) for (const [k, s] of [['GB', GB], ['US', US_ON]]) for (const plan of ['trial', 'starter', 'pro', 'max', 'tester', 'demo']) {
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): planPriceParts / planPrice moved from lib/features.ts to the frozen display.
    const p = K.PF.planPriceParts(plan, s)
    t(`${k} ${plan}: the card's parts rebuild the price exactly`, (p.perMonth ? `${p.amount}/mo` : p.amount) === K.PF.planPrice(plan, s), JSON.stringify(p))
  }
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): planPriceParts / planPrice are deleted with the frozen display. The
  // landing card (components/pricing/PricingSection.tsx) formats the amount from data (plan_prices.monthly_minor) and puts
  // the per-month words in their own span — there is no display string to split.
  // ⚠️ RE-PINNED (landing-mobile-tidy, 21 October 2026): the amount and the per-month words are each their own span now
  // (`plan-amount` / `plan-per`), so a phone can lay them out as two grid cells — still from data, still no display string.
  else t('Stage B: the pricing card formats the amount from data and adds the per-month words beside it (no display string)', /<span className="plan-amount">\{formatAmount\(p\.monthlyMinor, money\)\}<\/span><span className="plan-per">\{t\('card\.perTruckMonth'\)\}<\/span>/.test(src('components/pricing/PricingSection.tsx')))
  t('the pricing card no longer splits a display string on "/mo"', !/endsWith\('\/mo'\)/.test(src('app/landing/page.tsx') + (LEGACY ? '' : src('components/pricing/PricingSection.tsx'))))
  // roundsToZero ≡ the old string comparison, for both countries, over a wide range (incl. -0.4, NaN-guarded).
  const ns = [0, 0.1, 0.49, 0.5, 0.51, 0.999, 1, 1.5, -0.4, -0.5, -0.6, 2.4999, 1e-9, 12345.5, -1e-9, 0.0049]
  let same = true; const bad = []
  for (const f of [{ currency: 'GBP', locale: 'en-GB' }, { currency: 'USD', locale: 'en-US' }]) for (const n of ns) {
    const old = K.MF.formatMajor(n, f, { grouping: true, decimals: 0, minusBeforeSymbol: true }) === K.MF.formatMajor(0, f, { grouping: true, decimals: 0, minusBeforeSymbol: true })
    if (old !== K.MF.roundsToZero(n, f, 0)) { same = false; bad.push(`${f.currency} ${n}`) }
  }
  t('cost calculator: the number test answers exactly what the string comparison did (GBP and USD, 16 values each)', same && !/gbpIn\(f, n\) === gbpIn\(f, 0\)/.test(src('app/compare/CostComparison.tsx')), bad.join(', '))
  const want = Object.values(before.keys.contactLinks).flat().sort()
  const built = [K.CT.contactHref('general'), K.CT.contactHref('addBusiness'), K.CT.contactHref('reportIssue'), K.CT.contactHref('general'),
    K.CT.contactHref('costComparison'), K.CT.contactHref('costComparison'), ...Array(3).fill(K.CT.contactHref('addBusiness')), K.CT.contactHref('claimVenue')].sort()
  t('contact links: built from topic ids, the same ten links as BEFORE', JSON.stringify(want) === JSON.stringify(built), JSON.stringify(built))
  t('contact links: "&truck=" and "&venue=" encode exactly as before', K.CT.contactHref('addBusiness', { truck: 'Pizza & Co' }) === `/contact?topic=Add%20Business&truck=${encodeURIComponent('Pizza & Co')}` && K.CT.contactHref('claimVenue', { venue: 'The Crown' }) === '/contact?topic=ClaimVenue&venue=The%20Crown')
  const LINK_FILES = ['components/Footer.tsx', 'components/landing/LandingFooter.tsx', 'app/compare/CostComparison.tsx', 'app/trucks/[slug]/TruckClient.tsx', 'app/venues/[slug]/VenueClient.tsx']
  t('no /contact?topic= string is typed into an href any more', LINK_FILES.every(f => !/href=\{?[`"]\/contact\?topic=/.test(src(f))))
  t('Walk-up: one stored constant, one helper; no comparison against the literal remains', K.WU.WALK_UP_NAME === 'Walk-up' && K.WU.isWalkUp('Walk-up') && !K.WU.isWalkUp('Sam') && !K.WU.isWalkUp(null)
    && !/!==\s*'Walk-up'|===\s*'Walk-up'|\|\|\s*'Walk-up'/.test(['app/manage/[token]/page.tsx', 'app/dashboard/[token]/page.tsx', 'app/api/dashboard/action/route.ts', 'components/dashboard/AddOrderPanel.tsx', 'lib/printing/ticket.ts'].map(src).join('\n')))
  t('Private type: the stored name is matched in one helper', /function whereNamedPrivate/.test(src('lib/private-events/type.ts')) && (src('lib/private-events/type.ts').match(/\.ilike\('name', PRIVATE_TYPE_NAME\)/g) || []).length === 1)
  t("the 'Other' revenue line is one constant", /const OTHER_REVENUE_BUCKET = 'Other'/.test(src('app/manage/[token]/page.tsx')) && !/catBase\['Other'\]|\|\| 'Other'\n/.test(src('app/manage/[token]/page.tsx')))
  // Language Phase 2: lib/demo-templates.ts names its sample categories by STANDARD CATEGORY ID ('mains' there is the id
  // menu-extract and demo-assumptions use, not the fallback config key), so it is exempt beside them.
  const mainsLeft = require('child_process').execSync("grep -rn \"'mains'\" app components lib || true", { cwd: REPO, encoding: 'utf8' }).split('\n').filter(l => l && !/lib\/category-key\.ts|lib\/demo-assumptions\.ts|lib\/menu-extract\.ts|lib\/demo-templates\.ts/.test(l) && !/^\S+:\d+:\s*(\/\/|\*)/.test(l))
  t("the 'mains' default category key is one constant", mainsLeft.length === 0, mainsLeft.join(' | '))
  t('demo kitchen: categories recognised by id (no English category word typed in demo-assumptions)', !/new Set\(\['Mains'|new Set\(\['Sides'|new Set\(\['Specials'/.test(src('lib/demo-assumptions.ts')))

  /* ── 5 · one date-word path ── */
  head('5 · one date-word path: one ordinal, no hand-written name lists, Intl names, the English short-month rule')
  const D = await kit.bundle('lp0-dates-after', "export * as T from '@/lib/time-utils'")
  const ARR = /\[\s*'(Jan|January|Sun|Sunday|Mon|Monday)',\s*'/
  for (const f of ['lib/time-utils.ts', 'lib/preorder.ts', 'lib/weekly-post/week.ts', 'lib/weekly-post/locale.ts', 'lib/whatsapp/copy.ts', 'lib/utils.ts', 'lib/weekly-post/format.ts']) {
    t(`${f}: no hand-written month or day-name list`, !ARR.test(stripComments(src(f))))
  }
  t('one ordinal: weekly-post re-exports it, the discovery date uses it, no other suffix logic', /export \{ ordinalSuffix, ordinalDay as ordinal \} from '@\/lib\/time-utils'/.test(src('lib/weekly-post/format.ts')) && /ordinalDay\(dayNum\)/.test(src('lib/utils.ts')) && !/suffix = 'st'/.test(src('lib/utils.ts')))
  t('the short-month rule is commented as English-only, with the French example', /ENGLISH-ONLY[\s\S]{0,200}juin[\s\S]{0,40}juillet/.test(src('lib/time-utils.ts')))
  t('English short months: three letters of the full name — "Sep" in both en-GB and en-US', D.T.monthName('2026-09-05', 'en-GB', 'short') === 'Sep' && D.T.monthName('2026-09-05', 'en-US', 'short') === 'Sep')
  const frJun = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 5, 1))), frJul = new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 6, 1)))
  t('a language without its own rule is NOT truncated (French June/July stay distinct, from Intl)', D.T.monthName('2026-06-01', 'fr-FR', 'short') === frJun && D.T.monthName('2026-07-01', 'fr-FR', 'short') === frJul && frJun !== frJul, `${frJun} ${frJul}`)
  t('weekday names come straight from Intl, long and short', D.T.weekdayName('2026-10-14', 'en-GB', 'long') === 'Wednesday' && D.T.weekdayName('2026-10-14', 'en-US', 'short') === 'Wed')
  t('the rule is in the language rules file too', /three-letter|three letters/i.test(src('.cursor/rules/language.mdc')) && /juin/.test(src('.cursor/rules/language.mdc')))
}
