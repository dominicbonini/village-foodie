// scripts/us-legal-draft.cjs — ONE Terms of Service, ONE Privacy Policy, and ONE "Country-specific terms" page for each
// country's extra rules (19 October 2026, docs/us-legal-draft-report.md). Against the documents at 8a5c4b5a (the commit
// this draft started from) it proves:
//   1. each main document is BEFORE with EXACTLY the named sentence changes below applied — the date, the
//      country-neutral wording, and the one sentence pointing to the Country-specific terms — and nothing else;
//   2. the new page holds one `## <Country>` heading per country (today: United States), uses US spelling inside it,
//      and is linked from both documents and from the legal footer;
//   3. all three pages render through the real renderer, with every paragraph present and the links working;
//   4. the renderer links ONLY a site-relative path ("/terms"), and drops or reorders no character;
//   5. lib/legal.ts's dates read the documents' own date (the old privacy mismatch — "5 September" in the page,
//      "6 August" in the constant — is gone).
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'us-legal-draft' })
const BEFORE_REF = '8a5c4b5a'
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const before = f => execFileSync('git', ['show', `${BEFORE_REF}:${f}`], { cwd: REPO, encoding: 'utf8' })
let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`) } }
const NEW_DATE = '19 October 2026'
// ⚠️ RE-PINNED (pricing-tidy, 20 October 2026): the Terms of Service were re-dated 20 October 2026 when §4 was edited
// (below); the Privacy Policy and the Country-specific terms stay 19 October 2026.
const TERMS_DATE = '20 October 2026'
// ⚠️ RE-PINNED (ireland-3, 21 October 2026): the Country-specific terms were re-dated 21 October 2026 when the Ireland
// section was added (docs/ireland-3-report.md; scripts/ireland-3.cjs proves that section and that the rest is unchanged).
// ⚠️ RE-PINNED (anz-terms, 22 October 2026): re-dated 22 October 2026 with the Australia and New Zealand sections
// (docs/anz-terms-report.md; scripts/anz-terms.cjs proves them and that the rest is unchanged).
const COUNTRY_TERMS_DATE = '22 October 2026'
const DOC_DATE = { terms: TERMS_DATE, privacy: NEW_DATE, 'country-terms': COUNTRY_TERMS_DATE }
const CT = '[Country-specific terms](/country-terms)'

// ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the card processor's name, as BEFORE's own terms spell it
// ("settled into your own <name> account") — so the Stage B §4 block below can quote it without this file naming it.
const PROC = (/settled into your own (\w+) account/.exec(before('content/legal/terms-and-conditions.md')) || [])[1] || '(processor name not found in BEFORE)'
/** The NAMED changes to the UK text, before → after, in document order. Nothing else may differ. */
const NAMED = {
  'content/legal/terms-and-conditions.md': [
    ['**Last updated:** 6 August 2026', `**Last updated:** ${TERMS_DATE}`],
    ['acting for purposes relating to your trade or business, and not as a consumer.\n',
      `acting for purposes relating to your trade or business, and not as a consumer.\n\n**Some countries have extra rules.** Where they apply to you, they're on our ${CT} page, which forms part of these terms.\n`],
    ['and your compliance with food safety and food information law, including allergen disclosure requirements.',
      'and your compliance with the food safety and food information law where you trade, including allergen disclosure requirements, and for any permits or licences you need.'],
    ['for charging the right amounts, for VAT, and for your own tax affairs.',
      'for charging the right amounts, for VAT, sales tax or similar taxes where they apply, and for your own tax affairs.'],
    ['Prices are in pounds sterling and exclude VAT unless stated.',
      'Prices are in your local currency and exclude VAT, sales tax or similar taxes unless stated.'],
    ['the total fees you paid us in the 12 months before the claim arose, or £100.',
      'the total fees you paid us in the 12 months before the claim arose, or £100 (or its equivalent in your local currency).'],
    // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026, docs/pricing-pages-report.md): section 4 is rewritten for the
    // new plans — the plan bullets (plans, free trial, fees on online card orders, card processing, price changes) and
    // "If payment is not made" (the fallback is "our plan with no monthly fee", not "the free plan"). Two named blocks, each
    // applied after the named currency sentence above; the card processor's name is read from BEFORE's own §5 (PROC).
    [`- Available plans, prices and included allowances are shown in the app and on our website. Prices are in your local currency and exclude VAT, sales tax or similar taxes unless stated.\n- **Free trials.** We may offer a free trial. At the end of a trial your account moves to the free plan unless you have chosen a paid plan. We will tell you before your trial ends.\n- **Paid in advance, and non-refundable.** Subscription fees are billed one month in advance. **Fees already paid are non-refundable**, including if you cancel part-way through a month or stop using the service. This is the trade for there being no contract and no minimum term. Nothing here affects rights you have that cannot lawfully be excluded.\n- **Cancellation.** You can cancel at any time from within the service. Cancellation stops the next payment; it does not refund the month you are in. You keep full access until the end of the period you have paid for.\n- **Transaction fees.** Where your plan includes an allowance of online order value, we charge the stated percentage on value above that allowance. Card processing fees are charged by our payment provider and are separate from our fees.\n- **Price changes.** We may change our prices. We will give you at least 30 days' notice before a change affects you, and you may cancel before it takes effect.`,
      `- **Plans.** Our plans, their monthly prices, the online order value each includes and the fee each charges are shown on our website and in the app. One plan has no monthly fee. Prices are in your local currency and exclude VAT, sales tax or similar taxes unless stated.\n- **Free trial.** New accounts start with a free trial with every feature unlocked. Its length is shown on our website and in the app when you sign up. You do not need a card to start. At the end of the trial your account moves to our plan with no monthly fee unless you have chosen another plan. We will tell you before your trial ends.\n- **Paid in advance, and non-refundable.** Monthly plan fees are billed one month in advance. **Fees already paid are non-refundable**, including if you cancel part-way through a month or stop using the service. This is the trade for there being no contract and no minimum term. Nothing here affects rights you have that cannot lawfully be excluded.\n- **Cancellation.** You can cancel at any time from within the service. Cancellation stops the next payment; it does not refund the month you are in. You keep full access until the end of the period you have paid for, then move to our plan with no monthly fee.\n- **HatchGrab fees on online card orders.** Depending on your plan, we charge a stated percentage of the value of online orders your customers pay for by card — on all of it, on the value above the amount your plan includes each month, or not at all. **We charge no fee on Pay at Hatch orders or on walk-up orders.**\n- **Card processing.** Card processing fees on online card orders are charged by our payment provider (${PROC}), are paid to them and not to us, and are separate from our fees. Walk-up orders are taken on your own card reader, under your own agreement with its provider.\n- **Price changes.** We may change our prices, fees or what a plan includes. We will give you at least 30 days' notice before a change affects you, and you may change plan or cancel before it takes effect.`],
    [`**If a payment fails or is not made, your account moves down to the free plan.** We do not lock you out.\n\n- We will email you when a payment fails and tell you how to fix it.\n- If it is not resolved within **7 days**, your account moves to the free plan. You keep your account, your menu, your orders and your data, and you can carry on taking walk-up orders and using the kitchen screen and dashboard. You lose the paid features your plan included.\n- Paying the outstanding amount restores your plan.\n- Moving to the free plan does not entitle you`,
      `**If a payment fails or is not made, your account moves to our plan with no monthly fee.** We do not lock you out.\n\n- We will email you when a payment fails and tell you how to fix it.\n- If it is not resolved within **7 days**, your account moves to the plan with no monthly fee. You keep your account, your menu, your orders and your data, and you can carry on taking orders and using the kitchen screen and dashboard. You lose the features that plan does not include, and that plan's fee on online card orders applies.\n- Paying the outstanding amount restores your plan.\n- Moving plan does not entitle you`],
    // ⚠️ RE-PINNED (pricing-tidy, 20 October 2026): four sentences of §4 edited, each applied after the Stage B blocks
    // above — "Plans." (not VAT-registered, so no VAT on our fees; any other local tax told first), "Free trial." (reminded
    // in the app), "Cancellation." (by contacting us or in the service), and "If payment is not made" (the failed-payment
    // email bullet deleted; the 7 days now run from the payment's due date).
    ['Prices are in your local currency and exclude VAT, sales tax or similar taxes unless stated.',
      'Prices are in your local currency. We are not registered for VAT, so no VAT is added to our fees. Where another local tax applies to you, we will tell you before it is added.'],
    ['We will tell you before your trial ends.', 'We will remind you in the app before your trial ends.'],
    ['You can cancel at any time from within the service.', 'You can cancel at any time by contacting us or from within the service.'],
    ['- We will email you when a payment fails and tell you how to fix it.\n- If it is not resolved within **7 days**, your account moves',
      '- If a payment is not made within **7 days** of its due date, your account moves'],
  ],
  'content/legal/privacy-policy.md': [
    ['**Last updated:** 5 September 2026', `**Last updated:** ${NEW_DATE}`],
    ['is the part that applies to you.\n',
      `is the part that applies to you.\n\n**Some countries have extra rules.** Where they apply to you, they're on our ${CT} page, which forms part of this policy.\n`],
    // ⚠️ RE-PINNED (legal follow-ups, 19 October 2026, docs/legal-follow-ups-report.md): section 5 says what is really
    // stored in the browser and names PostHog (now cookieless); section 6 lists it; section 7 says notes go with the name,
    // email and phone at 12 months, and how long unfinished card orders are kept.
    ['**Cookies.** We use cookies that are strictly necessary to make the sites work — signing you in, keeping your basket, and remembering your preferences. We do not use advertising, tracking or third-party analytics cookies, and we do not track you across other websites.',
      "**Cookies and browser storage.** We use cookies and your browser's local storage only where they are strictly necessary to make the sites work — signing you in, keeping your basket, and remembering your preferences, such as your country and postcode. We do not use advertising or tracking cookies, and we do not track you across other websites.\n\n**Product analytics.** We use PostHog to understand which pages and features are used: pages viewed and clicks, with basic browser and device details. It stores nothing in your browser — no cookies and no local storage — so it cannot recognise you from one visit to the next. It does not run on the operator dashboard, kitchen screen or management pages, or on truck pages shown on an operator's own website."],
    ['| Brevo | Sending transactional email | European Union |\n', '| Brevo | Sending transactional email | European Union |\n| PostHog | Product analytics: which pages and features are used | European Union |\n'],
    ["- **Order records containing customer details:** 12 months, after which the customer's name, email and phone are removed and only anonymised order data remains.",
      "- **Order records containing customer details:** 12 months, after which the customer's name, email and phone, and any notes on the order (including allergy or dietary notes), are removed and only anonymised order data remains.\n- **Unfinished online card orders** (started but never placed): deleted within a day of expiring. If a card payment was still being held, they are deleted within a day of that hold being released.\n- **WhatsApp messages your customers send a truck, and our automatic replies:** 12 months."],
    // ⚠️ RE-PINNED (Dominic's retention answers, 19 October 2026): section 7 says the WhatsApp logs' period (bullet,
    // above) and how long the email provider keeps delivery logs (a line after the list), in his words.
    ['- **Technical and security logs:** 90 days.\n\nWe delete or anonymise data',
      '- **Technical and security logs:** 90 days.\n\nOur email provider keeps delivery logs for a limited time under its own retention policy.\n\nWe delete or anonymise data'],
  ],
}

;(async () => {
  // ── 1 · the main documents: BEFORE + the named changes, exactly ──
  for (const [file, changes] of Object.entries(NAMED)) {
    console.log(`\n── ${file}`)
    let expect = before(file)
    const bad = []
    for (const [from, to] of changes) { if (expect.split(from).length !== 2) bad.push(from.slice(0, 50)); expect = expect.replace(from, to) }
    t(`each of the ${changes.length} named changes applies to BEFORE exactly once`, bad.length === 0, bad.join(' · '))
    t('the document is BEFORE with exactly those changes — every other byte of the UK text is unchanged', read(file) === expect)
    t('it points to the Country-specific terms, as part of it', read(file).includes(CT) && /which forms part of (these terms|this policy)\./.test(read(file)))
    t('no United States section is left in the main document', !/## \d+\. If you (trade|are) in the United States/.test(read(file)))
  }

  // ── 2 · the Country-specific terms page ──
  console.log('\n── content/legal/country-specific-terms.md')
  const C = read('content/legal/country-specific-terms.md')
  t(`it reads "Last updated: ${COUNTRY_TERMS_DATE}"`, C.includes(`**Last updated:** ${COUNTRY_TERMS_DATE}`))   // ⚠️ RE-PINNED (ireland-3)
  const countries = [...C.matchAll(/^## (.+)$/gm)].map(m => m[1])
  // ⚠️ RE-PINNED (ireland-3, 21 October 2026): Ireland follows the United States.
  // ⚠️ RE-PINNED (anz-terms, 22 October 2026): Australia and New Zealand follow Ireland.
  // ⚠️ RE-PINNED (canada-2, 22 October 2026, docs/canada-2-report.md): Canada follows New Zealand.
  // ⚠️ RE-PINNED (france-1, 22 October 2026, docs/france-1-report.md §11): France follows Canada.
  // ⚠️ RE-PINNED (europe-settings, 22 October 2026): the rest of Europe is ONE section ("European Economic Area and
  // Switzerland"), plus Gibraltar's own — Dominic's brief.
  t('one `## <Country>` heading per country — today "United States", "Ireland", "Australia", "New Zealand", "Canada", "France", "European Economic Area and Switzerland", "Gibraltar" (adding a country is adding a heading)', JSON.stringify(countries) === JSON.stringify(['United States', 'Ireland', 'Australia', 'New Zealand', 'Canada', 'France', 'European Economic Area and Switzerland', 'Gibraltar']), countries)
  const us = C.slice(C.indexOf('## United States'), C.indexOf('\n## Ireland'))
  t('US spelling inside the US section (no licence / behavioural / honour / organis- / authoris-)', !/licence|behavioural|honour|organis|authoris/.test(us))
  for (const [label, re] of [['the truck is the seller and merchant of record', /merchant of record/], ['sales tax is the truck\'s responsibility', /\*\*Sales tax\.\*\*/], ['all-in fee pricing where required (California)', /California's law on all-in pricing/],
    ['tips are the truck\'s', /\*\*Tips\.\*\*/], ['billing in US dollars', /billed in US dollars/], ['US privacy requests (access, correct, delete; 45 days)', /correct it or delete it[\s\S]*45 days/], ['no sale or sharing of personal information', /do not sell personal information, and we do not share it for cross-context behavioral advertising/],
    ['children under 13', /children under 13/], ['text-message consent', /\*\*Text messages\.\*\*/], ['marketing email opt-out and postal address', /how to stop receiving them and includes our postal address/]]) {
    t(`United States: ${label}`, re.test(us))
  }

  // ── 3 · rendering, links, the footer ──
  const legal = read('lib/legal.ts')
  // ⚠️ RE-PINNED (pricing-tidy, 20 October 2026): each constant reads ITS document's date — TERMS_UPDATED is 20 October.
  t('lib/legal.ts: PRIVACY_UPDATED, TERMS_UPDATED and COUNTRY_TERMS_UPDATED each read their document\'s date', [['PRIVACY_UPDATED', DOC_DATE.privacy], ['TERMS_UPDATED', DOC_DATE.terms], ['COUNTRY_TERMS_UPDATED', DOC_DATE['country-terms']]].every(([k, d]) => legal.includes(`export const ${k} = '${d}'`)) && legal.includes("export const COUNTRY_TERMS_PATH = '/country-terms'"))
  const flat = x => x.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, '')
  const words = s => s.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\(\/[^)]*\)/g, '$1').replace(/^#+ /gm, '').replace(/^[-|].*$/gm, '').replace(/\s+/g, '')
  for (const [doc, file, page] of [['terms', 'content/legal/terms-and-conditions.md', 'app/(legal)/terms/page'], ['privacy', 'content/legal/privacy-policy.md', 'app/(legal)/privacy/page'], ['country-terms', 'content/legal/country-specific-terms.md', 'app/(legal)/country-terms/page']]) {
    // ⚠️ RE-PINNED (seo-fixes, 20 October 2026): the legal pages export an async generateMetadata() (canonical + og:url
    // from lib/site-metadata.ts, which reads the request host) instead of a static `metadata` object — same absolute
    // title. next/headers is stubbed with an empty request (no host).
    const P = await kit.bundle(`legal-${doc}`, `export { default, generateMetadata } from '@/${page}'`,
      { stubs: { 'next/headers': 'export async function headers() { return new Map() }\nexport async function cookies() { return { get() { return undefined }, getAll() { return [] } } }' } })
    P.metadata = await P.generateMetadata()
    const html = kit.renderStatic(kit.h(P.default))
    const paras = read(file).split(/\n\s*\n/).map(words).filter(p => p.length > 30 && !p.startsWith('|'))
    const missing = paras.filter(p => !flat(html).includes(p))
    t(`/${doc} renders every paragraph of its document (${paras.length})`, missing.length === 0, missing.slice(0, 2).join(' · '))
    t(`/${doc} shows "Last updated: ${DOC_DATE[doc]}"`, flat(html).includes(flat(`Last updated: ${DOC_DATE[doc]}`)))  // ⚠️ RE-PINNED (pricing-tidy, 20 October 2026): per-document date
    if (doc !== 'country-terms') t(`/${doc} links to the Country-specific terms (a real <a href="/country-terms">)`, html.includes('<a href="/country-terms"'))
    else t('/country-terms links back to /terms and /privacy, and has its own title', html.includes('<a href="/terms"') && html.includes('<a href="/privacy"') && (P.metadata?.title?.absolute ?? P.metadata?.title) === 'Country-specific terms — HatchGrab')
  }
  const LC = await kit.bundle('legal-chrome', "export { LegalChrome } from '@/components/legal/LegalChrome'")
  const chrome = kit.renderStatic(kit.h(LC.LegalChrome, { homeHref: '/uk' }, kit.h('i', null, 'x')))
  t('the legal footer links Privacy · Terms · Country terms · Contact', /href="\/privacy"[^>]*>Privacy<\/a><a [^>]*href="\/terms"[^>]*>Terms<\/a><a [^>]*href="\/country-terms"[^>]*>Country terms<\/a><a [^>]*href="\/contact"/.test(chrome.replace(/ class="[^"]*"/g, '')), chrome.slice(chrome.indexOf('<footer'), chrome.indexOf('<footer') + 500))

  // ── 4 · the renderer: site-relative links only, no character lost ──
  const R = await kit.bundle('legal-md', "export { renderLegalMarkdown } from '@/lib/legal-markdown'")
  const render = src => kit.renderStatic(kit.h('div', null, R.renderLegalMarkdown(src)))
  const one = render('See our [Terms](/terms) and **bold [Privacy](/privacy)** here.')
  t('[label](/path) renders a link — in plain text and inside bold', one.includes('<a href="/terms" class="underline hover:text-slate-900">Terms</a>') && one.includes('<strong>bold <a href="/privacy" class="underline hover:text-slate-900">Privacy</a></strong>'), one)
  const ext = render('Not a link: [Example](https://example.com) or [x](mailto:a@b.c).')
  t('an external or scheme link is NOT linked — it stays literal text', !ext.includes('<a ') && ext.includes('[Example](https://example.com)'), ext)
  const src = 'Alpha [one](/a) beta [two](/b-c#d) gamma.'
  t('no character lost or reordered around links', flat(render(src)) === flat('Alpha one beta two gamma.'))
  t('a document with no link renders exactly as before (BEFORE\'s terms, through BEFORE\'s renderer and this one)', await (async () => {
    const RB = await kit.bundle('legal-md-before', "export { renderLegalMarkdown } from '@/lib/legal-markdown'", { patches: [{ file: 'lib/legal-markdown.tsx', from: /^[\s\S]*$/, to: () => before('lib/legal-markdown.tsx') }] })
    const b = before('content/legal/terms-and-conditions.md')
    return kit.renderStatic(kit.h('div', null, RB.renderLegalMarkdown(b))) === render(b)
  })())

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
