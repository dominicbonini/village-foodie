#!/usr/bin/env node
// scripts/copy-truth-1.cjs — copy-truth-1 (2 November 2026, docs/copy-truth-1-report.md): THREE WRONG LINES, FIXED IN EVERY LANGUAGE.
//   node scripts/copy-truth-1.cjs                     the proof (in scripts/harnesses.json)
//   node scripts/copy-truth-1.cjs --capture <file>    write the HEAD hashes (run once at the commit before the change, in a worktree)
//
//   1 · none of the old wording remains: every changed key's old text, per locale (scripts/fixtures/copy-truth-1-old.json), is in no
//       messages file; and the old claims' English patterns are in no message file, component or lib (listed below)
//   2 · no trial length, price or number typed in any changed key, in any locale; the trial and van messages take their values
//   3 · the trial message renders for 1 and 3 months (and 0 = not known) in en-GB, de-DE, pl-PL and ar-AE; the heading too
//   4 · the van confirmation renders both versions from the fixture catalogue (Pro £29 → the price; Pay as you go £0 → free),
//       in every base; Manage asks the same question the billing modal does
//   5 · the landing page (GB, US, BR, JP): only the offline line differs from HEAD — the apps sentence only where both app flags
//       are on (GB in the fixtures), and gone when they are off; /features (GB, US) the same; /llms.txt byte-identical; the sitemap
//       identical apart from lastmod; MARKETING_COPY_UPDATED moved
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const kit = require('./_render-kit.cjs')({ cacheTag: 'copy-truth-1' })
const WF = require('./_world-countries-1-fixtures.cjs')
const { snake } = require('./_lp1e-fixtures.cjs')
const { REPO } = kit
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const sha = s => crypto.createHash('sha256').update(String(s ?? 'null')).digest('hex')
const SEG = { GB: 'uk', US: 'us', BR: 'br', JP: 'jp' }
const HEAD_FILE = 'scripts/fixtures/copy-truth-1-head.json'
const PLACE = '§OFFLINE§'

let pass = 0, fail = 0
const t = (label, ok, d) => { if (ok) pass++; else { fail++; console.log('  🔴 ' + label + (d !== undefined ? `\n      ${String(typeof d === 'string' ? d : JSON.stringify(d)).slice(0, 700)}` : '')) } }
const head = s => console.log('\n' + s)

/** The world fixtures with every country on, and GB's two app flags as live (iPad and Android apps in the UK stores only). */
const rowsWithApps = (gbApps = true) => WF.rowsWith(WF.WORLD).map(r => (r.countryCode === 'GB' ? { ...r, iosAppAvailable: gbApps, androidAppAvailable: gbApps } : r))
const once = (s, find, label) => { const n = s.split(find).length - 1; if (n !== 1) throw new Error(`${label}: expected the offline text once, found ${n}`); return s.replace(find, PLACE) }

/** The pages, with each offline text cut out: the landing tile's <p> (`landingText(cc)`) and /features' offline description. */
async function views(tag, landingText, featuresText, gbApps = true) {
  const R = WF.renderer(kit, tag)
  const rows = rowsWithApps(gbApps)
  const out = {}, cut = {}
  for (const [cc, seg] of Object.entries(SEG)) {
    const P = await kit.quietAsync(() => R.page('landing', seg, rows))
    // ⚠️ RE-PINNED (seo-geo-2 B3, 2 November 2026): hashed as HEAD rendered it — the JSON-LD's operatingSystem set back to
    // "Web, iOS, Android" where seo-geo-2 made it "Web" (scripts/_lp-seo-geo-2.cjs asBefore; the value is proven by seo-geo-2.cjs).
    // ⚠️ RE-PINNED (pricing-copy-1, 11 November 2026): pricing-copy-1's wording put back first, in the page's language (scripts/
    // _lp-pricing-copy-1.cjs asBefore — the banner sentence and the Pay as you go fee line; scripts/pricing-copy-1.cjs proves them).
    // ⚠️ RE-PINNED (pricing-copy-4, 12 November 2026; docs/pricing-copy-4-report.md): a card country's wording taken back first (scripts/_lp-pricing-copy-4.cjs pc1After4 — the banner's card sentence and Pay as you go's asterisk; scripts/pricing-copy-4.cjs proves them), then pricing-copy-1's.
    out[`${cc}/landing`] = sha(once(SB1.strip(SG2.asBefore(JN.noBreak(require('./_lp-pricing-copy-4.cjs').pc1After4(P.html, { GB: 'en-GB', US: 'en-US', BR: 'pt-BR', JP: 'ja-JP' }[cc])))), `<p>${landingText(cc)}</p>`, `${cc}/landing`)) + ':' + sha(JSON.stringify(P.meta))   // eslint-disable-line @typescript-eslint/no-require-imports -- CommonJS harness module
    cut[`${cc}/landing`] = P.html
  }
  for (const cc of ['GB', 'US']) {
    const P = await kit.quietAsync(() => R.page('features', SEG[cc], rows))
    out[`${cc}/features`] = sha(once(SB1.strip(P.html), featuresText(cc), `${cc}/features`)) + ':' + sha(JSON.stringify(P.meta))
    cut[`${cc}/features`] = P.html
  }
  const llmsText = await R.llms(rows)
  out.llms = sha(llmsText)
  // ⚠️ RE-PINNED (gsc-index-2, 9 November 2026): the legal entries' hreflang cluster (and any translated legal entries) taken back
  // exactly first (scripts/_lp-gsc-index-2.cjs sitemapBack, PRECISE); every other byte still hashed as HEAD's.
  out.sitemap = sha(JSON.stringify(require('./_lp-gsc-index-2.cjs').sitemapBack(await R.sitemap(rows)).map(e => ({ ...e, lastModified: undefined }))))
  return { out, cut, llmsText }
}

const LOCALE = { GB: 'en-GB', US: 'en-US', BR: 'pt-BR', JP: 'ja-JP' }
// ⚠️ RE-PINNED (store-badges-1, 2 November 2026): hashed with the footer's store badges and the Play URL's &hl=en taken out (scripts/
// _lp-store-badges-1.cjs strip, both sides; the badges follow the app flags now and are proven by scripts/store-badges-1.cjs).
const SB1 = require('./_lp-store-badges-1.cjs')
const JN = require('./_lp-jp-nav-1.cjs')   // ⚠️ RE-PINNED (jp-nav-1, 9 November 2026): the Japanese nav label's one zero-width space taken out
const SG2 = require('./_lp-seo-geo-2.cjs')   // eslint-disable-line @typescript-eslint/no-require-imports -- CommonJS harness module (seo-geo-2)
const FL1 = require('./_lp-features-list-1.cjs')   // eslint-disable-line @typescript-eslint/no-require-imports -- ⚠️ RE-PINNED (features-list-1): see its uses below

;(async () => {
  const T = await kit.bundle('ct1-words', [
    "export { translatorFor } from '@/lib/i18n/translator'",
    "import '@/lib/i18n/catalog/landing'", "import '@/lib/i18n/catalog/featuresPage'",
  ].join('\n'))
  const cap = process.argv.indexOf('--capture')
  if (cap > 0) {
    // At HEAD: the tile is the one offline sentence pair; /features' description is the detail message.
    const { out } = await views('ct1-capture', cc => T.translatorFor(LOCALE[cc], 'landing')('does.offlineBody'), cc => T.translatorFor(LOCALE[cc], 'featuresPage')('detail.offline_protection'))
    fs.writeFileSync(process.argv[cap + 1], JSON.stringify(out, null, 2) + '\n')
    console.log(`captured ${Object.keys(out).length} views → ${process.argv[cap + 1]}`)
    return
  }

  const W = await kit.bundle('ct1-lib', [
    "export { translatorFor } from '@/lib/i18n/translator'",
    "import '@/lib/i18n/catalog/auth'", "import '@/lib/i18n/catalog/demoGetStarted'", "import '@/lib/i18n/catalog/demo'",
    "import '@/lib/i18n/catalog/manageSettings'", "import '@/lib/i18n/catalog/landing'", "import '@/lib/i18n/catalog/featuresPage'",
    "export { extraVanMonthlyMinor, includedVans } from '@/lib/plans'",
    "export { formatAmount } from '@/lib/money-format'",
    "export { planMoneyFormatOf } from '@/lib/country-settings-types'",
    "export { mapCountryRow } from '@/lib/country-settings'",
    "export { LANGUAGE_BASES } from '@/lib/i18n/locales'",
    "export { MARKETING_COPY_UPDATED } from '@/lib/marketing-meta'",
  ].join('\n'))
  const KEYS = ['auth.signup.subtitle', 'demoGetStarted.freeMonth', 'demo.signupOffer.heading', 'demo.signupOffer.sub', 'landing.does.offlineBody',
    'landing.does.offlineApps', 'featuresPage.detail.offline_protection', 'featuresPage.offlineApps', 'manageSettings.vans.addConfirm',
    'manageSettings.vanBilling.body', 'manageSettings.vanBilling.note']
  const get = (d, k) => k.split('.').reduce((o, p) => (o && typeof o === 'object' ? o[p] : undefined), d)
  const msgFiles = fs.readdirSync(path.join(REPO, 'messages')).filter(f => f.endsWith('.json'))
  const bases = [...W.LANGUAGE_BASES]

  // ══ 1 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · none of the old wording remains')
  const OLD = JSON.parse(read('scripts/fixtures/copy-truth-1-old.json')).old
  const allMessages = msgFiles.map(f => read(`messages/${f}`)).join('\n') + fs.readdirSync(path.join(REPO, 'messages/ns')).flatMap(l => fs.readdirSync(path.join(REPO, 'messages/ns', l)).map(f => read(`messages/ns/${l}/${f}`))).join('\n')
  let oldCount = 0; const left = []
  // ⚠️ RE-PINNED (site-chrome-1, 5 November 2026, Dominic): the OFFLINE sentences are put back (landing.does.offlineBody,
  // featuresPage.detail.offline_protection — 7e1effa7^'s words again; the offlineApps keys gone). Their old text is SUPPOSED to be there
  // now, so they leave this check and the next one proves them back; the trial line and the add-van words are still checked here.
  const PUT_BACK = require('./_lp-copy-truth-1.cjs').OFFLINE_PUT_BACK   // eslint-disable-line @typescript-eslint/no-require-imports -- CommonJS harness module (site-chrome-1)
  const OFFLINE_KEYS = /^(landing\.does\.offline(Body|Apps)|featuresPage\.(detail\.offline_protection|offlineApps))$/
  for (const [loc, kv] of Object.entries(OLD)) for (const [k, v] of Object.entries(kv)) { if (PUT_BACK && OFFLINE_KEYS.test(k)) continue; oldCount++; if (allMessages.includes(JSON.stringify(v).slice(1, -1))) left.push(`${loc} ${k}`) }
  t(`every changed key's old text (${oldCount} strings in ${Object.keys(OLD).length} locales${PUT_BACK ? '; the offline keys aside — put back by site-chrome-1' : ''}) is in no messages file`, oldCount > (PUT_BACK ? 150 : 250) && left.length === 0, left)
  if (PUT_BACK) {
    const back = []
    for (const [loc, kv] of Object.entries(OLD)) for (const k of ['landing.does.offlineBody', 'featuresPage.detail.offline_protection']) if (kv[k] !== undefined && get(JSON.parse(read(`messages/${loc}.json`)), k) !== kv[k]) back.push(`${loc} ${k}`)
    t('site-chrome-1: the offline sentences are back — each locale\'s old landing.does.offlineBody and featuresPage.detail.offline_protection, exactly', !back.length, back)
  }
  // The English claims, searched in every message file and every code file (comments included).
  const PATTERNS = [/\bfree month\b/i, /first live event/i, /pick your first/i, /until you go live/i, /decide to go live/i, /next billing cycle/i,
    /charged as an add-on/i, /confirmation email within 24 hours/i, /online ordering pauses automatically so customers/i,
    /If you lose signal, online ordering pauses/i, /Start free for 3 months/i]
  const codeFiles = []
  const walk = d => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name)) codeFiles.push(p) } }
  for (const d of ['app', 'components', 'lib']) walk(d)
  const enText = read('messages/en-GB.json') + read('messages/en-US.json') + ['en-IE', 'en-AU', 'en-NZ', 'en-CA', 'en-MT', 'en-GI', 'en-SG'].map(l => read(`messages/${l}.json`)).join('')
  for (const re of PATTERNS) {
    if (PUT_BACK && /online ordering pauses/.test(re.source)) { t(`"${re.source}" is back in en-GB (site-chrome-1 put the offline sentence back)`, re.test(read('messages/en-GB.json'))); continue }
    const inCode = codeFiles.filter(f => re.test(read(f)))
    t(`"${re.source}" is in no English message file and no file under app/, components/ or lib/`, !re.test(enText) && inCode.length === 0, inCode)
  }
  t('the demo\'s "Start free for N months, keep my menu" reads its number from data (demoWalk.startFree takes {months}; the walkthrough passes the API\'s trialMonths)',
    /startFree": "\{months, plural/.test(read('messages/en-GB.json')) && /const months = info\?\.trialMonths \?\? 0/.test(read('components/demo/DemoWalkthrough.tsx')) && /t\('startFree', \{ months \}\)/.test(read('components/demo/DemoWalkthrough.tsx')))

  // ══ 2 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · no typed trial length, price or number in the changed keys')
  const typed = []
  for (const f of msgFiles) { const d = JSON.parse(read(`messages/${f}`)); for (const k of KEYS) { const v = get(d, k); if (typeof v === 'string' && /\d/.test(v.replace(/=0\b/g, ''))) typed.push(`${f} ${k}`) } }
  t('no digit in any changed key, in any locale (the "=0" plural case aside)', typed.length === 0, typed)
  const en = JSON.parse(read('messages/en-GB.json'))
  t('the trial messages take {months} as a plural', ['auth.signup.subtitle', 'demoGetStarted.freeMonth', 'demo.signupOffer.heading'].every(k => /^\{months, plural, =0 \{/.test(get(en, k))))
  t('the van message takes {free} and {price}', /^\{free, select, yes \{Adding a van is free on your plan\.\} other \{An extra van is \{price\} a month on your plan\. We’ll be in touch before anything is charged\.\}\}/.test(get(en, 'manageSettings.vans.addConfirm')))
  t('the signup page reads the trial from the plan data and passes it', /offerTrialMonths\(await getPlanCatalog\(\)\)/.test(read('app/(app)/signup/layout.tsx')) && /TrialMonthsProvider months=\{months\}/.test(read('app/(app)/signup/layout.tsx')) && /t\('subtitle', \{ months: trialMonths \?\? 0 \}\)/.test(read('app/(app)/signup/page.tsx')))
  t('the demo\'s trial line takes the walkthrough\'s trialMonths', /t\('freeMonth', \{ months: trialMonths \?\? 0 \}\)/.test(read('components/DemoGetStarted.tsx')) && /trialMonths=\{months\}/.test(read('components/demo/DemoWalkthrough.tsx')))

  // ══ 3 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · the trial message for 1 and 3 months')
  const EXPECT = {
    'en-GB': { 1: 'Your first month is free, starting when you sign up.', 3: 'Your first 3 months are free, starting when you sign up.', 0: 'Your free trial starts when you sign up.' },
    'de-DE': { 1: 'Ihr erster Monat ist kostenlos, ab dem Erstellen Ihres Kontos.', 3: 'Ihre ersten 3 Monate sind kostenlos, ab dem Erstellen Ihres Kontos.' },
    'pl-PL': { 1: 'Pierwszy miesiąc jest bezpłatny, licząc od założenia konta.', 3: 'Pierwsze 3 miesiące są bezpłatne, licząc od założenia konta.' },
    'ar-AE': { 1: 'شهرك الأول مجاني، بدءًا من إنشاء حسابك.', 3: 'أول ٣ أشهر مجانية، بدءًا من إنشاء حسابك.' },
  }
  for (const [loc, cases] of Object.entries(EXPECT)) for (const [n, want] of Object.entries(cases)) {
    for (const [ns, key] of [['auth.signup', 'subtitle'], ['demoGetStarted', 'freeMonth']]) {
      const got = W.translatorFor(loc, ns)(key, { months: Number(n) })
      t(`${loc} ${ns}.${key} for ${n} month(s): "${got}"`, got === want || (loc === 'ar-AE' && got === want.replace('٣', '3')), { got, want })
    }
  }
  t('en-GB heading: "Start free for 1 month" / "Start free for 3 months" / "Start free"', ['Start free for 1 month', 'Start free for 3 months', 'Start free'].join('|') === [1, 3, 0].map(n => W.translatorFor('en-GB', 'demo')('signupOffer.heading', { months: n })).join('|'))
  t('every base renders the trial messages for 0, 1, 2, 3, 5, 11 and 21 months without error, with the number', bases.every(loc => [0, 1, 2, 3, 5, 11, 21].every(n => {
    const s = W.translatorFor(loc, 'auth.signup')('subtitle', { months: n })
    return s && !/\{|\}/.test(s) && (n <= 2 || s.includes(new Intl.NumberFormat(loc).format(n)))
  })))

  // ══ 4 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · the van confirmation, both versions, from the fixtures')
  const catalog = WF.CATALOG()
  const gb = W.mapCountryRow(snake(rowsWithApps().find(r => r.countryCode === 'GB')))
  const priceFor = plan => W.formatAmount(W.extraVanMonthlyMinor({ plan, trial_expires_at: null }, catalog, 'GB'), W.planMoneyFormatOf(gb))
  const vanMsg = (loc, free, price) => W.translatorFor(loc, 'manageSettings')('vans.addConfirm', { free, price })
  t('Pro in GB: an extra van is the plan\'s own price, home form ("£29")', priceFor('pro') === '£29' && vanMsg('en-GB', 'no', priceFor('pro')) === 'An extra van is £29 a month on your plan. We’ll be in touch before anything is charged.\n\nDo you want to continue?', vanMsg('en-GB', 'no', priceFor('pro')))
  t('Pay as you go in GB: the extra-van price is zero → "Adding a van is free on your plan."', W.extraVanMonthlyMinor({ plan: 'payg', trial_expires_at: null }, catalog, 'GB') === 0 && vanMsg('en-GB', 'yes', priceFor('payg')) === 'Adding a van is free on your plan.\n\nDo you want to continue?')
  t('every base renders both versions, the price in the paid one, no braces left', bases.every(loc => { const a = vanMsg(loc, 'yes', '¤29'), b = vanMsg(loc, 'no', '¤29'); return a && b && a !== b && b.includes('¤29') && !a.includes('¤29') && !/[{}]/.test(a + b) }))
  const M = read('app/(app)/manage/[token]/page.tsx')
  t('Manage: free exactly when the billing modal would not open (within the included vans, or a zero price) — the same test, once', /const vanIsFree = !\(vans\.length >= vansIncluded && vanAddonMinor > 0\)/.test(M) && /if \(!vanIsFree\) setShowVanBillingModal\(true\)/.test(M))
  t('Manage: the price is the truck\'s own plan\'s extra-van price in its country, home form, masked like the modal\'s', /t\('vans\.addConfirm', \{ free: vanIsFree \? 'yes' : 'no', price: vanPx\(formatAmount\(vanAddonMinor, planMoneyFormatOf\(vanSettings\)\)\) \}\)/.test(M) && /const vanAddonMinor = extraVanMonthlyMinor\(truck, vanCatalog, vanSettings\.countryCode\)/.test(M))
  t('the billing modal no longer promises a billing cycle or an email', get(en, 'manageSettings.vanBilling.body') === 'Your {plan} plan includes {vans, plural, one {# truck} other {# trucks}}. Adding an additional truck costs <b>{price}</b>.' && get(en, 'manageSettings.vanBilling.note') === '⚠️ We’ll be in touch before anything is charged.')

  // ══ 5 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · nothing else on the public pages changes')
  const tl = cc => T.translatorFor(LOCALE[cc], 'landing'), tf = cc => T.translatorFor(LOCALE[cc], 'featuresPage')
  // ⚠️ RE-PINNED (site-chrome-1): with the sentences put back there is no apps sentence to add — the one sentence already names the apps.
  const newLanding = (cc, apps) => tl(cc)('does.offlineBody') + (apps && !PUT_BACK ? ' ' + tl(cc)('does.offlineApps') : '')
  const newFeatures = (cc, apps) => tf(cc)('detail.offline_protection') + (apps && !PUT_BACK ? ' ' + tf(cc)('offlineApps') : '')
  const pinned = JSON.parse(read(HEAD_FILE))
  const { out, cut, llmsText } = await views('ct1-now', cc => newLanding(cc, cc === 'GB'), cc => newFeatures(cc, cc === 'GB'))
  // ⚠️ RE-PINNED (seo-geo-2 B4, 2 November 2026): /llms.txt is rebuilt on purpose (Features, the English FAQ, every country's lines in
  // English) — not compared with HEAD any more; scripts/seo-geo-2.cjs §5 proves its content. Here: it carries the new section.
  if (SG2.LANDED) { delete pinned.llms; t('llms: rebuilt by seo-geo-2 B4 (not compared with HEAD; its content is proven by seo-geo-2.cjs) — it carries the Features section', /\n## Features\n/.test(llmsText)) }
  // ⚠️ RE-PINNED (features-list-1, 4 November 2026): /features' table changed on purpose (three rows in, Advanced reporting out), so
  // its HEAD pins no longer hold. scripts/features-list-1.cjs (capture / compare) proves every byte of /features outside those rows
  // identical to the commit before it; the offline description itself is still checked below.
  if (FL1.LANDED) { for (const cc of ['GB', 'US']) delete pinned[`${cc}/features`]; t('GB/features, US/features: the table changed on purpose by features-list-1 (not compared with HEAD; scripts/features-list-1.cjs proves the rest of the page) — the new rows in, Advanced reporting out', ['GB', 'US'].every(cc => cut[`${cc}/features`].includes('>Documents and reminders<') && cut[`${cc}/features`].includes('>Reports for your accountant<') && !cut[`${cc}/features`].includes('>Advanced reporting<'))) }
  for (const k of Object.keys(pinned)) t(`${k}: identical to HEAD${/landing|features/.test(k) ? ' apart from the offline text' : k === 'sitemap' ? ' apart from lastmod' : ''}`, out[k] === pinned[k], { now: out[k], head: pinned[k] })
  if (PUT_BACK) {
    // ⚠️ RE-PINNED (site-chrome-1, 5 November 2026, Dominic): the one restored sentence everywhere, whatever the store flags.
    t('site-chrome-1: the landing\'s offline line is the restored sentence in GB, US, BR and JP, whatever the store flags', ['GB', 'US', 'BR', 'JP'].every(cc => cut[`${cc}/landing`].includes(`<p>${newLanding(cc, false)}</p>`)))
    t('site-chrome-1: /features\' offline description is the restored sentence (GB, US)', ['GB', 'US'].every(cc => cut[`${cc}/features`].includes(newFeatures(cc, false))))
    const off = await views('ct1-gb-off', cc => newLanding(cc, false), cc => newFeatures(cc, false), false)
    t('site-chrome-1: with GB\'s app flags switched off the sentence is the same (it no longer follows the flags)', off.cut['GB/landing'].includes(`<p>${newLanding('GB', false)}</p>`))
  } else {
    t('the landing offline line is the new sentence everywhere', ['GB', 'US', 'BR', 'JP'].every(cc => cut[`${cc}/landing`].includes(`<p>${newLanding(cc, cc === 'GB')}</p>`)))
    t('GB (both app flags on) keeps the apps sentence: "…Carry on taking orders with the iPhone, iPad and Android app."', cut['GB/landing'].includes('if you lose signal, so customers can’t place orders you won’t see. Carry on taking orders with the iPhone, iPad and Android app.</p>'))
    t('US, BR and JP (flags off) carry no apps sentence on the landing page, nor the US on /features', ['US', 'BR', 'JP'].every(cc => !cut[`${cc}/landing`].includes(tl(cc)('does.offlineApps'))) && !cut['US/features'].includes(tf('US')('offlineApps')))
    t('GB /features keeps its apps sentence after the offline description', cut['GB/features'].includes(newFeatures('GB', true)))
    const off = await views('ct1-gb-off', cc => newLanding(cc, false), cc => newFeatures(cc, false), false)
    t('with GB\'s app flags switched off, GB loses the apps sentence too (it follows the flags, not the country)', off.cut['GB/landing'].includes(`<p>${newLanding('GB', false)}</p>`) && !off.cut['GB/landing'].includes(tl('GB')('does.offlineApps')))
  }
  // ⚠️ RE-PINNED (features-list-1, 4 November 2026): moved on again to 2026-11-04 for the /features table (35.aj-8).
  t(FL1.LANDED ? 'MARKETING_COPY_UPDATED moved to 2026-11-02 (35.aj-8), then on to 2026-11-04 by features-list-1' : 'MARKETING_COPY_UPDATED moved to 2026-11-02 (35.aj-8)', (require('./_lp-site-chrome-1.cjs').COPY_LANDED ? W.MARKETING_COPY_UPDATED >= '2026-11-05' : W.MARKETING_COPY_UPDATED === (FL1.LANDED ? '2026-11-04' : '2026-11-02')))   // eslint-disable-line @typescript-eslint/no-require-imports -- ⚠️ RE-PINNED (site-chrome-1): moved on to 2026-11-05

  console.log(`\ncopy-truth-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
