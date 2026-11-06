#!/usr/bin/env node
// scripts/legal-languages-1.cjs — legal-languages-1 (1 November 2026, docs/legal-languages-1-report.md): THE LEGAL DOCUMENTS IN
// EVERY LANGUAGE, AND THE DRIFT GUARD.
//   node scripts/legal-languages-1.cjs
//   1  DRIFT — every language base has all three translations, each STAMPED with its English file's sha256 and matching its
//      structure: headings and section numbers, bullets, tables, links, every number (dates aside), every email and web
//      address, every processor (scripts/_legal-translations.cjs compare). ANY later English edit fails here until every
//      translation is redone and re-stamped — proved below by editing the English in memory;
//   2  THE ENGLISH IS GOVERNING AND UNMOVED — the three English documents and lib/legal.ts's dates and TERMS_VERSION are HEAD's
//      (translating moves no date: the manual's legal-date rule);
//   3  THE ADDRESSES — legalPath: a non-English language at its country's address (/fr/privacy, /at/terms, /mx/country-terms);
//      English everywhere else (/privacy …), exactly as before;
//   4  THE PAGES, RENDERED — for every language base (and the regional languages that read one): the translation in the
//      language's legal chrome, the note at the top linking to the English page, the English date in the local format, its
//      cross-references and footer pointing at the same country's translations, its title in the language, canonical itself;
//      an English or switched-off country's address redirects to the English page;
//   5  EVERY LINK TO A LEGAL DOCUMENT asks legalPath (footers, consent lines, the order page, the operator menu, account
//      deletion, emails); the account pages and emails speak the operator's or visitor's language (the payment provider's card
//      form and onboarding: scripts/legal-languages-1-payments.cjs, run by hand — the sweep's screen refuses its provider's name);
//   6  THE OTHER GAPS THE AUDIT FOUND (scripts/legal-languages-1-audit.cjs) — the 404 and error pages, the private event type's
//      name, stored dietary tags, a font failure's English reason — and every fixed-English translator is a named, deliberate one.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'legal-languages-1' })
const { REPO, h } = kit
const L = require('./_legal-translations.cjs')
const LP1E = require('./_lp1e-fixtures.cjs')
const WF = require('./_world-countries-1-fixtures.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
// ⚠️ RE-PINNED (contact-1, 2 November 2026): "HEAD" here meant the tree this workstream was written on, before world-countries-2's
// legal change was committed (2b625a66 committed this harness and that change together, so HEAD later carried the Terms edits twice
// and §2 threw "Terms edit — expected once, found 0"). It is that tree, by name: 3240c536, 2b625a66's parent.
const LL1_BASE = '3240c536'
const atHead = f => execSync(`git show ${LL1_BASE}:${require('./_moved-paths.cjs').pathAt(LL1_BASE, f)}`, { cwd: REPO, encoding: 'utf8' })
// ⚠️ RE-PINNED (contact-1): the Privacy Policy's contact-form paragraph and its date, taken back exactly (scripts/_lp-contact-1.cjs,
// which throws if either is not there); contact-1 also moved PRIVACY_UPDATED and TERMS_VERSION with it.
const C1 = require('./_lp-contact-1.cjs')
const LOC = read('lib/i18n/locales.ts')
const BASES = JSON.parse('[' + /export const LANGUAGE_BASES[^=]*= \[([^\]]*)\]/.exec(LOC)[1].replace(/'/g, '"') + ']')
const text = s => String(s ?? '').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/[  ‏‎]/g, ' ').replace(/\s+/g, ' ').trim()

// One country per language — the country whose locale it is (its region), and the regional languages that read a base.
const COUNTRY_OF = { 'fr-FR': 'FR', 'de-DE': 'DE', 'es-ES': 'ES', 'it-IT': 'IT', 'pt-PT': 'PT', 'nl-NL': 'NL', 'sv-SE': 'SE', 'da-DK': 'DK', 'nb-NO': 'NO',
  'pl-PL': 'PL', 'cs-CZ': 'CZ', 'hu-HU': 'HU', 'sk-SK': 'SK', 'ro-RO': 'RO', 'hr-HR': 'HR', 'sl-SI': 'SI', 'fi-FI': 'FI', 'et-EE': 'EE', 'lv-LV': 'LV',
  'lt-LT': 'LT', 'el-GR': 'GR', 'bg-BG': 'BG', 'pt-BR': 'BR', 'ms-MY': 'MY', 'ja-JP': 'JP', 'zh-HK': 'HK', 'th-TH': 'TH', 'ar-AE': 'AE' }
const REGIONAL = [['de-AT', 'AT', 'de-DE'], ['de-CH', 'CH', 'de-DE'], ['nl-BE', 'BE', 'nl-NL'], ['el-CY', 'CY', 'el-GR'], ['fr-LU', 'LU', 'fr-FR'], ['es-MX', 'MX', 'es-ES']]

;(async () => {
  // ══ 1 · DRIFT ═════════════════════════════════════════════════════════════════════════════════════════════════════
  head(`1 · DRIFT — every language base (${BASES.length}) × the three documents, against the English`)
  for (const locale of BASES) for (const file of L.DOCS) {
    const p = L.translationPath(locale, file)
    const probs = fs.existsSync(p) ? L.compare(file, fs.readFileSync(p, 'utf8')) : ['missing']
    t(`${locale}/${file}: stamped with today's English, same structure, numbers, links, addresses and processors`, probs.length === 0, probs.slice(0, 4))
  }
  {
    // The guard itself: an English edit — one word, one number, one heading — must make a translation fail.
    const file = 'privacy-policy.md', tr = fs.readFileSync(L.translationPath('fr-FR', file), 'utf8'), en = L.english(file)
    const realEnglish = L.english
    const withEnglish = (edited, fn) => { const mod = require.cache[require.resolve('./_legal-translations.cjs')]; const was = fs.readFileSync; fs.readFileSync = (p, ...a) => (String(p).endsWith(path.join('content/legal', file)) ? edited : was(p, ...a)); try { return fn() } finally { fs.readFileSync = was; void mod; void realEnglish } }
    const edits = { 'a word': en.replace('collects and uses', 'collects, keeps and uses'), 'a retention period': en.replace(/12 months/, '18 months'), 'a heading': en.replace('## 12. Contact', '## 12. Contact us\n\nText.\n\n## 13. More') }
    for (const [what, edited] of Object.entries(edits)) {
      const probs = withEnglish(edited, () => L.compare(file, tr))
      t(`the guard: an English edit (${what}) makes fr-FR/${file} fail (${probs.length} problem(s), STALE first)`, probs.length > 0 && /^STALE/.test(probs[0]), probs.slice(0, 2))
    }
  }

  // ══ 2 · GOVERNING ENGLISH, UNMOVED ═════════════════════════════════════════════════════════════════════════════════
  head('2 · THE ENGLISH IS GOVERNING AND UNMOVED — documents and dates are as world-countries-2 left them')
  // The baseline is HEAD + world-countries-2's named legal change (still in the working tree; scripts/_lp-world-countries-2.cjs):
  // this workstream changes no English word and moves no date.
  const W2 = require('./_lp-world-countries-2.cjs')
  t('content/legal/privacy-policy.md is HEAD\'s, byte for byte (+ contact-1\'s paragraph and date)', C1.privacyAsBefore(read('content/legal/privacy-policy.md')) === atHead('content/legal/privacy-policy.md'))
  // ⚠️ RE-PINNED (world-countries-3, 1 November 2026): three later English sentences (Mexico's authority, Terms §3's section number,
  // Canada's French line) are taken back exactly first (scripts/_lp-world-countries-3.cjs, which throws if one is not there).
  const W3 = require('./_lp-world-countries-3.cjs')
  t('content/legal/terms-and-conditions.md is HEAD\'s + world-countries-2\'s §4 edits (+ world-countries-3\'s §3 section number), nothing else', W3.asBefore('content/legal/terms-and-conditions.md', read('content/legal/terms-and-conditions.md')) === W2.applyTerms(atHead('content/legal/terms-and-conditions.md')))
  t('content/legal/country-specific-terms.md is HEAD\'s + world-countries-2\'s eight sections and date, nothing else', W2.asBefore('content/legal/country-specific-terms.md', read('content/legal/country-specific-terms.md')) === atHead('content/legal/country-specific-terms.md'))
  const legal = read('lib/legal.ts'), legalHead = atHead('lib/legal.ts')
  // ⚠️ RE-PINNED (contact-1): PRIVACY_UPDATED 31 October → 2 November 2026 and TERMS_VERSION '2026-11-01' → '2026-11-02', by name.
  // ⚠️ RE-PINNED (tidy-1, 3 November 2026): …then 2 → 3 November 2026 and '2026-11-02' → '2026-11-03' (scripts/_lp-tidy-1.cjs), by name.
  const T1L = require('./_lp-tidy-1.cjs')
  // ⚠️ RE-PINNED (paperwork-1, 4 November 2026): …then 3 → 4 November 2026 and '2026-11-03' → '2026-11-04' (scripts/_lp-paperwork-1.cjs), by name.
  const P1L = require('./_lp-paperwork-1.cjs')
  const want = { PRIVACY_UPDATED: /export const PRIVACY_UPDATED = '([^']+)'/.exec(legalHead)[1] === C1.PRIVACY_DATE_OLD && C1.PRIVACY_DATE_NEW === T1L.PRIVACY_DATE_OLD ? (P1L.LEGAL_LANDED && P1L.PRIVACY_DATE_OLD === T1L.PRIVACY_DATE_NEW ? P1L.PRIVACY_DATE_NEW : T1L.PRIVACY_DATE_NEW) : null, TERMS_UPDATED: W2.NEW_DATE, COUNTRY_TERMS_UPDATED: W2.NEW_DATE, TERMS_VERSION: W2.TERMS_VERSION_NEW === C1.TERMS_VERSION_OLD && C1.TERMS_VERSION_NEW === T1L.TERMS_VERSION_OLD ? (P1L.LEGAL_LANDED && P1L.TERMS_VERSION_OLD === T1L.TERMS_VERSION_NEW ? P1L.TERMS_VERSION_NEW : T1L.TERMS_VERSION_NEW) : null }
  for (const [k, v] of Object.entries(want)) {
    const re = new RegExp(`export const ${k} = '([^']+)'`)
    t(`${k} is '${v}', as before this workstream — translating moves no date`, re.exec(legal)?.[1] === v, re.exec(legal)?.[1])
  }

  // ══ 3 · ADDRESSES ═════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · THE ADDRESSES — a translation at its country\'s address; English everywhere else')
  const LG = await kit.bundle('ll1-legal', "export * from '@/lib/legal'")
  const cases = [
    [['privacy', { country: 'FR', locale: 'fr-FR' }], '/fr/privacy'], [['terms', { country: 'AT', locale: 'de-AT' }], '/at/terms'],
    [['country-terms', { country: 'MX', locale: 'es-MX' }], '/mx/country-terms'], [['privacy', { locale: 'ja-JP' }], '/jp/privacy'],
    [['privacy', { locale: 'de-CH' }], '/ch/privacy'], [['terms', { country: 'BE', locale: 'nl-BE' }], '/be/terms'],
    [['privacy', { country: 'GB', locale: 'en-GB' }], '/privacy'], [['terms', { country: 'US', locale: 'en-US' }], '/terms'],
    [['privacy', { country: 'IE', locale: 'en-IE' }], '/privacy'], [['privacy', { country: 'SG', locale: 'en-SG' }], '/privacy'],
    [['privacy', {}], '/privacy'], [['country-terms', { locale: null }], '/country-terms'],
  ]
  const got = cases.map(([a]) => LG.legalPath(...a))
  t(`legalPath: ${cases.map(([a, w]) => `${a[1].locale ?? 'none'} → ${w}`).join(' · ')}`, cases.every(([, w], i) => got[i] === w), got)
  t('legalBaseOf: de-AT/de-CH/de-LI → de-DE, es-MX → es-ES, nl-BE → nl-NL, el-CY → el-GR, fr-LU → fr-FR; every English locale → none',
    [['de-AT', 'de-DE'], ['de-CH', 'de-DE'], ['de-LI', 'de-DE'], ['es-MX', 'es-ES'], ['nl-BE', 'nl-NL'], ['el-CY', 'el-GR'], ['fr-LU', 'fr-FR'], ['pt-BR', 'pt-BR']].every(([l, b]) => LG.legalBaseOf(l) === b)
    && ['en-GB', 'en-US', 'en-IE', 'en-AU', 'en-NZ', 'en-CA', 'en-MT', 'en-GI', 'en-SG'].every(l => LG.legalBaseOf(l) === null))
  t('legalAddressOf: /fr/privacy, /de/terms, /jp/country-terms are translated addresses; /privacy, /fr, /fr/features are not',
    JSON.stringify(LG.legalAddressOf('/fr/privacy')) === '{"segment":"fr","doc":"privacy"}' && LG.legalAddressOf('/jp/country-terms')?.doc === 'country-terms'
    && ['/privacy', '/fr', '/fr/features', '/fr/privacy/x'].every(p => LG.legalAddressOf(p) === null))

  // ══ 4 · THE PAGES ═════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · THE PAGES, RENDERED — every language, the regional languages, and the English / switched-off redirects')
  const ctx = LP1E.context(kit, REPO)
  const PAGE = {}
  for (const doc of ['privacy', 'terms', 'country-terms']) {
    PAGE[doc] = await ctx.bundle(`ll1-page-${doc}`, `export { default as Page, generateMetadata } from '@/app/(app)/[country]/(legal)/${doc}/page'\nexport { default as Layout } from '@/app/(app)/[country]/(legal)/layout'\nexport { localLegalDate } from '@/lib/legal-documents'`)
  }
  const allOn = WF.rowsWith(WF.WORLD)
  const SEG = Object.fromEntries([...read('lib/marketing-country.ts').matchAll(/\b([A-Z]{2}): '([a-z]{2})'/g)].map(m => [m[1], m[2]]))
  async function renderLegal(doc, cc, rows = allOn) {
    const M = PAGE[doc], params = Promise.resolve({ country: SEG[cc] })
    return ctx.withReq({ rows }, async () => {
      let html = null, meta = null, redirectedTo = null
      try {
        meta = await M.generateMetadata({ params })
        html = await ctx.prerender(h(M.Layout, { params }, h(M.Page, { params })))
      } catch (e) { if (e?.message === 'redirect') redirectedTo = e.redirectTo ?? 'redirect'; else throw e }
      return { html, meta, redirectedTo }
    })
  }
  const english = Object.fromEntries(L.DOCS.map(f => [f, L.englishDate(f)]))
  const FILE = { privacy: 'privacy-policy.md', terms: 'terms-and-conditions.md', 'country-terms': 'country-specific-terms.md' }
  const T = await kit.bundle('ll1-msg', "export { translatorFor } from '@/lib/i18n/translator'\nimport '@/lib/i18n/catalog/legalChrome'")
  const checkPage = async (locale, cc, base) => {
    for (const doc of ['privacy', 'terms', 'country-terms']) {
      const r = await renderLegal(doc, cc)
      const seg = SEG[cc], tr = T.translatorFor(locale, 'legalChrome')
      const note = text(String(tr.raw('translationNote')).replace(/<\/?link>/g, ''))
      const date = PAGE[doc].localLegalDate(english[FILE[doc]], locale)
      const html = r.html ?? ''
      const firstHeading = (/^# (.+)$/m.exec(L.body(fs.readFileSync(L.translationPath(base, FILE[doc]), 'utf8'))) || [])[1] ?? ''
      const swiss = locale === 'de-CH'
      const squash = x => x.replace(/\s+/g, '')   // a tag becomes a space in text(): 'anglaise</a>,' → 'anglaise ,'
      const SC1_LANDED = require('./_lp-site-chrome-1.cjs').LANDED   // eslint-disable-line @typescript-eslint/no-require-imports -- CommonJS harness module (site-chrome-1)
      const ok = !r.redirectedTo && squash(text(html)).includes(squash(note)) && html.includes(`href="/${doc === 'country-terms' ? 'country-terms' : doc}"`) && text(html).includes(date)
        && text(html).includes(text(swiss ? firstHeading.replace(/ß/g, 'ss') : firstHeading)) && !html.includes('{{LAST_UPDATED}}') && !html.includes('translation-of:')
        // ⚠️ RE-PINNED (site-chrome-1, 5 November 2026, manual 35.ao-13): on the web the legal pages wear the ONE shared footer, whose links
        // are Privacy and Terms in the country's language (not Country terms); the country-specific terms are linked from the TOP of the
        // Terms page instead, and "Get in touch" still carries the country. (Inside the app the old footer stays — scripts/site-chrome-1.cjs.)
        && html.includes(`href="/${seg}/privacy"`) && html.includes(`href="/${seg}/terms"`) && html.includes(`href="/contact?country=${cc}"`)
        && (!SC1_LANDED ? html.includes(`href="/${seg}/country-terms"`) : doc !== 'terms' || html.includes(`data-country-terms-link="true"><a href="/${seg}/country-terms"`))
        && (!swiss || !/ß/.test(text(html)))
      const metaOk = r.meta?.title?.absolute === tr(`meta.${doc === 'privacy' ? 'privacyTitle' : doc === 'terms' ? 'termsTitle' : 'countryTermsTitle'}`)
        && r.meta?.alternates?.canonical === `https://www.hatchgrab.com/${seg}/${doc}` && r.meta?.alternates?.languages?.['x-default'] === `https://www.hatchgrab.com/${doc}`
      t(`/${seg}/${doc} (${locale}${base !== locale ? ` reads ${base}` : ''}): the translation, the note linking the English page, "${date}", the country's footer and cross-links; title in the language; canonical itself`,
        ok && metaOk, r.redirectedTo ?? { note: squash(text(html)).includes(squash(note)), date: text(html).includes(date), heading: text(html).includes(text(firstHeading)), meta: r.meta?.title, canonical: r.meta?.alternates?.canonical })
    }
  }
  for (const locale of BASES) await checkPage(locale, COUNTRY_OF[locale], locale)
  for (const [locale, cc, base] of REGIONAL) await checkPage(locale, cc, base)
  for (const cc of ['GB', 'US', 'IE', 'SG']) {
    const r = await renderLegal('privacy', cc)
    t(`/${SEG[cc]}/privacy (English) redirects to the English page /privacy — English has one address, the same from every country`, r.redirectedTo === '/privacy', r.redirectedTo)
  }
  {
    const off = allOn.map(r => (r.countryCode === 'FR' ? { ...r, enabled: false } : r))
    const r = await renderLegal('terms', 'FR', off)
    t('/fr/terms with France switched off redirects to the English /terms', r.redirectedTo === '/terms', r.redirectedTo)
  }

  // ══ 5 · EVERY LINK, EVERY EMAIL, THE ACCOUNT PAGES ════════════════════════════════════════════════════════════════
  head('5 · EVERY LINK TO A LEGAL DOCUMENT, THE ACCOUNT PAGES AND EMAILS')
  const SITES = ['components/landing/LandingFooter.tsx', 'app/(app)/contact/HatchGrabContact.tsx', 'app/(app)/signup/page.tsx', 'components/DemoGetStarted.tsx',
    'components/landing/DemoUpload.tsx', 'components/dashboard/UserMenu.tsx', 'app/(app)/trucks/[slug]/order/page.tsx', 'components/manage/DeleteAccountSection.tsx']
  const typed = SITES.filter(f => /\b(PRIVACY_PATH|TERMS_PATH|COUNTRY_TERMS_PATH)\b|href="\/(privacy|terms)"/.test(read(f)))
  t(`every legal link asks legalPath / useLegalPath (${SITES.length} files) — none types an English address`, typed.length === 0 && SITES.every(f => /legalPath|useLegalPath/.test(read(f))), typed)
  const E = await kit.bundle('ll1-email', "export { privacyFooterHtml, privacyFooterText } from '@/lib/email-privacy'\nexport { translatorFor } from '@/lib/i18n/translator'\nimport '@/lib/i18n/catalog/emailCustomer'")
  const fr = E.translatorFor('fr-FR', 'emailCustomer'), gb = E.translatorFor('en-GB', 'emailCustomer'), at = E.translatorFor('de-AT', 'emailCustomer')
  t('customer emails: the privacy link is the email\'s own language — /fr/privacy (fr-FR), /at/privacy (de-AT); English emails keep https://www.hatchgrab.com/privacy',
    E.privacyFooterHtml(fr).includes('https://www.hatchgrab.com/fr/privacy') && E.privacyFooterText(at).includes('https://www.hatchgrab.com/at/privacy')
    && E.privacyFooterHtml(gb).includes('href="https://www.hatchgrab.com/privacy"') && E.privacyFooterText(gb).includes('https://www.hatchgrab.com/privacy'))
  const proxy = read('proxy.ts')
  t('proxy.ts: a translated legal address speaks its country\'s language (<html lang>, and dir="rtl" for Arabic through the root layout)', /const legal = legalAddressOf\(pathname\)/.test(proxy) && /\?\? \(legalCode \? \{ code: legalCode \} : null\)/.test(proxy))
  t('proxy.ts: the account pages (signup, login, forgot / reset password) speak ?lang= or the visitor\'s country\'s language; English sets nothing',
    /const AUTH_LANG_PATHS = new Set\(\['\/signup', '\/login', '\/forgot-password', '\/reset-password'\]\)/.test(proxy) && /if \(lang && !isEnglish\(lang\)\) request\.headers\.set\(PAGE_LANG_HEADER, lang\)/.test(proxy))
  t('the account pages\' layouts wrap them in <AuthLocale> (seeded words; no wrapper for English); verify-email seeds its client half',
    // ⚠️ RE-PINNED (contact-1, 2 November 2026 — reached for the first time since §2 stopped throwing): copy-truth-1 put signup's
    // children inside <TrialMonthsProvider> (the trial line's months), still inside <AuthLocale>.
    ['app/(app)/login/layout.tsx', 'app/(app)/forgot-password/layout.tsx', 'app/(app)/reset-password/layout.tsx'].every(f => /<AuthLocale>\{children\}<\/AuthLocale>/.test(read(f)))
    && /<AuthLocale><TrialMonthsProvider months=\{months\}>\{children\}<\/TrialMonthsProvider><\/AuthLocale>/.test(read('app/(app)/signup/layout.tsx'))
    && /<PageLocale locale=\{locale\} \{\.\.\.pageSeedProps\(locale, 'auth'\)\}><VerifyEmailSuccess/.test(read('app/(app)/verify-email/page.tsx')))
  t('account emails (password reset, email change, resend verification) are in the operator\'s language (localeForOperator); the reset link carries ?lang=',
    ['app/api/auth/forgot-password/route.ts', 'app/api/auth/change-email/route.ts', 'app/api/auth/resend-verification/route.ts'].every(f => /localeForOperator\(supabase, operator\.id, await visitorCountryCodeOf\(req\)\)/.test(read(f)))
    && /reset-password\?token=\$\{token\}\$\{isEnglish\(locale\) \? '' : `&lang=\$\{locale\}`\}/.test(read('app/api/auth/forgot-password/route.ts')))
  {
    const S = await ctx.bundle('ll1-server-locale', "export { localeForOperator } from '@/lib/i18n/server-locale'")
    const fake = country => ({ from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: country === undefined ? [] : [{ country }] }) }) }) }) })
    const broken = { from: () => { throw new Error('db down') } }
    const got = await ctx.withReq({ rows: allOn }, async () => [
      await S.localeForOperator(fake('FR'), 'op1'), await S.localeForOperator(fake('JP'), 'op1', 'DE'), await S.localeForOperator(fake(undefined), 'op1', 'DE'),
      await S.localeForOperator(fake(undefined), 'op1'), await S.localeForOperator(broken, 'op1', 'BR'), await S.localeForOperator(fake('GB'), null, null),
    ])
    t('localeForOperator: the truck\'s country (FR → fr-FR, JP → ja-JP over a German visitor); no truck → the visitor\'s (DE → de-DE); neither, or none named → en-GB; a failed read → the visitor\'s (BR → pt-BR)',
      JSON.stringify(got) === JSON.stringify(['fr-FR', 'ja-JP', 'de-DE', 'en-GB', 'pt-BR', 'en-GB']), got)
  }

  // ══ 6 · THE OTHER GAPS THE AUDIT FOUND ════════════════════════════════════════════════════════════════════════════
  head('6 · THE OTHER GAPS THE AUDIT FOUND — the 404 and error pages, the private type\'s name, dietary tags, a font error\'s reason')
  {
    const NF = await ctx.bundle('ll1-not-found', "export { default as NotFound } from '@/app/(app)/not-found'")
    const render = (opts, lang) => ctx.withReq({ rows: allOn, ...opts }, async () => {
      if (lang) globalThis.__mcReq.headers['x-hg-page-lang'] = lang
      return text(await ctx.prerender(await NF.NotFound()))
    })
    const [fr, ja, gb, none] = [await render({ ip: 'FR' }), await render({ ip: 'GB' }, 'ja-JP'), await render({ ip: 'GB' }), await render({})]
    const words = loc => JSON.parse(read(`messages/${loc}.json`)).errorPage
    t('the 404 page speaks the page\'s language (the proxy\'s header: ja-JP), else the visitor\'s country\'s (FR → French); an English visitor, or none, gets English',
      fr.includes(words('fr-FR').notFoundTitle) && ja.includes(words('ja-JP').notFoundTitle) && gb.includes('Page not found') && none.includes('Page not found') && !gb.includes(words('fr-FR').notFoundTitle),
      { fr: fr.slice(0, 120), ja: ja.slice(0, 120), gb: gb.slice(0, 120), none: none.slice(0, 120) })
    const errorSrc = read('app/(app)/error.tsx'), globalSrc = read('app/global-error.tsx')
    t('the error pages (app/(app)/error.tsx, app/global-error.tsx) word `errorPage` in the document\'s language and show nothing until a non-English language\'s words have arrived',
      /useTIn\(locale, 'errorPage'\)/.test(errorSrc) && /useDocumentLocale\(\)/.test(errorSrc) && /ready !== locale\) return null/.test(errorSrc)
      && /useTIn\(locale, 'errorPage'\)/.test(globalSrc) && /<html lang=\{locale\}>/.test(globalSrc) && /\{t && ready && \(/.test(globalSrc))
    const missing = BASES.filter(l => { const w = JSON.parse(read(`messages/${l}.json`)).errorPage; return !w || ['notFoundTitle', 'notFoundBody', 'home', 'errorTitle', 'errorBody', 'retry'].some(k => typeof w[k] !== 'string' || !w[k]) })
    t(`errorPage is written in all ${BASES.length} language bases`, missing.length === 0, missing)
  }
  {
    const et = read('components/manage/EventTypes.tsx')
    t('Event types: the built-in private type (stored "Private") shows privateEvents.publicName in a non-English language — at BOTH loads (the panel and the event\'s type picker); English shows it as stored',
      /const privateTypeName = \(locale: string, words: string\): string \| null => \(isEnglish\(locale\) \? null : words\)/.test(et)
      && (et.match(/setTypes\(withPrivateName\(\(r\.types \?\? \[\]\) as TypeRow\[\], privateTypeLabel\)\)/g) || []).length === 2
      && /r\.kind === 'private' \? \{ \.\.\.r, name \} : r/.test(et))
    const wp = read('app/api/weekly-post/route.ts'), wd = read('lib/weekly-post/week-data.ts')
    t('the weekly post names a private event in the truck\'s language (privateEvents.publicName), passed to every week built',
      /const privateEventLabel = \(locale: [^)]*\) => translatorFor\(locale, 'privateEvents'\)\('publicName'\)/.test(wp) && /if \(ev\.is_private\) return privateLabel/.test(wd)
      && [...wp.matchAll(/buildWeekData\(range, [^,]+, [^,]+, (\{[\s\S]{0,400}?\}|opts)\)?/g)].every(m => (m[1] === 'opts' ? /const opts = \{\s*privateLabel: privateEventLabel\(locale\),/.test(wp) : /\bprivateLabel: privateEventLabel\(locale\),/.test(m[1])))
      && (wp.match(/buildWeekData\(/g) || []).length === 4)
    t('a font\'s technical failure reason (English, from lib/weekly-post/font-store.ts) is shown to an English truck only; any other language gets the sentence without it',
      /return e instanceof Error && isEnglish\(locale\)\s*\? refuse\(locale, 'wp_font_add_failed'/.test(wp) && /return e instanceof Error && isEnglish\(locale\)\s*\? discard\('wp_font_store_failed'/.test(wp))
    const mg = read('app/(app)/manage/[token]/page.tsx')
    t('Manage\'s menu shows a stored dietary tag in the truck\'s language everywhere it lists one (the item list, the allergen wizard\'s pills, a card\'s extracted options)',
      /item\.dietary_info\?\.map\(d => \(\s*<span key=\{d\}[^>]*>\{dietaryLabel\(d, tkLocale\)\}/.test(mg) && /draft\.dietary\.map\(d => <DietaryChip key=\{d\} label=\{dietaryLabel\(d, wizLocale\)\} \/>\)/.test(mg)
      && /dietary_options\.map\(\(d: string\) => \(\s*<span key=\{d\}[^>]*>\{dietaryLabel\(d, tkLocale\)\}/.test(mg))
    const D = await kit.bundle('ll1-dietary', "export { dietaryLabel } from '@/lib/dietary-label'")
    t('dietaryLabel: "Gluten Free" is "Gluten Free" in every English locale and the language\'s word elsewhere; an unknown tag is shown as stored',
      ['en-GB', 'en-US', 'en-AU'].every(l => D.dietaryLabel('Gluten Free', l) === 'Gluten Free') && D.dietaryLabel('Vegetarian', 'fr-FR') === JSON.parse(read('messages/fr-FR.json')).menuBadges.dietary.Vegetarian
      && D.dietaryLabel('Keto', 'fr-FR') === 'Keto')
  }
  {
    // The translators that are fixed English ON PURPOSE — every other product translator takes the reader's locale.
    const ALLOWED = {
      'lib/copy/': 'legacy en-GB constant exports kept for old callers; every screen words these from messages',
      'lib/settings-copy.ts': 'the same (legacy constants)', 'lib/kitchen-capacity.ts': 'the same (legacy constants)',
      'lib/charge-settings.ts': 'internal charge descriptions, never shown to a customer or truck',
      'lib/weekly-post/words.ts': 'a refusal\'s en-GB `error` fallback beside its code, which the client words in the language',
      'lib/private-events/copy.ts': 'the English default label; a non-English caller passes its own (privateLabel)',
      'lib/i18n/typecheck.ts': 'a type test, never run',
      // ⚠️ RE-PINNED (contact-1 — reached for the first time since §2 stopped throwing): seo-geo-2's /llms.txt, English by design.
      'lib/llms-text.ts': '/llms.txt — the English description for AI crawlers (seo-geo-2 B4), English by design',
      'app/(app)/(legal)/': 'the English legal pages — governing, English by design',
      'app/(app)/verify-email/page.tsx': 'the invalid-link branch, which has no account and so no language (English, the default)',
      'app/api/account/request-deletion/route.ts': 'a coded refusal (confirm_mismatch) the screen words in the language',
      // ⚠️ RE-PINNED (paperwork-1, 4 November 2026): the document-type names given to the AI in its prompt, English like the rest of
      // the prompt (lib/paperwork/ai-read.ts); nothing a person reads.
      'app/api/manage/paperwork/route.ts': 'the document-type names in the AI\'s prompt (English, like the prompt); never shown to anyone',
    }
    const hits = execSync(`grep -rlE "translatorFor\\((DEFAULT_LOCALE|'en-GB')" app components lib`, { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean)
    const stray = hits.filter(f => !Object.keys(ALLOWED).some(a => f.startsWith(a)))
    t(`every fixed-English translator is a named, deliberate one (${hits.length} file(s): ${Object.keys(ALLOWED).join(', ')})`, stray.length === 0 && hits.length > 0, stray)
  }

  console.log(`\n${fail ? '🔴' : '✅'} legal-languages-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
