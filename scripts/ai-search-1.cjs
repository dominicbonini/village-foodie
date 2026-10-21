// scripts/ai-search-1.cjs — HATCHGRAB, READABLE BY AI ANSWER ENGINES (ai-search-1, 21 October 2026; docs/ai-search-1-report.md).
//
// LOCALHOST ONLY. Nothing reaches a database or the network: country rows and the plan catalogue are fixtures, the routes
// are bundled by the render kit. Checks:
//   1  ROBOTS — the HatchGrab host names every answer / search bot and every training bot Dominic allowed, with the private
//      disallows repeated in that group (a named group replaces `*`); `*` keeps them; the Village Foodie host is unchanged.
//   2  llms.txt — HatchGrab host only; every switched-on country's plans and prices from the data, the fee rule, the trial,
//      the links; a switched-off country never appears.
//   3  JSON-LD — Organization legalName and country from lib/company.ts; SoftwareApplication BusinessApplication, operating
//      systems, countriesSupported = the switched-on countries, the Offers from the data; no invalid areaServed.
const kit = require('./_render-kit.cjs')({ cacheTag: 'ai-search-1' })
const { REPO, h } = kit
const LP1E = require('./_lp1e-fixtures.cjs')
const { seedCatalog } = require('./_plans-catalog-fixture.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))

const IE = enabled => ({ ...LP1E.GB(), countryCode: 'IE', name: 'Ireland', enabled, currency: 'EUR', locale: 'en-IE', starterMonthlyMinor: null, proMonthlyMinor: null, maxMonthlyMinor: null, proAllowanceMinor: null, maxAllowanceMinor: null, platformFeePct: null, cardFeeOnlineFixedMinor: 25, shortName: 'Ireland' })
const CATALOG = (() => { const c = seedCatalog(REPO); for (const p of c.prices.filter(p => p.countryCode === 'GB')) c.prices.push({ ...p, countryCode: 'IE' }); return c })()
const tables = { plans: CATALOG.plans.map(snake), plan_prices: CATALOG.prices.map(snake), plan_features: CATALOG.features.map(snake) }
const ROWS = { ieOff: () => [LP1E.GB(), LP1E.US_ON(), IE(false)], ieOn: () => [LP1E.GB(), LP1E.US_ON(), IE(true)] }

;(async () => {
  const ctx = LP1E.context(kit, REPO)
  const run = (opts, fn) => ctx.withReq({ tables, ...opts }, fn)

  // ══ 1 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · ROBOTS — the answer engines and training bots allowed on the HatchGrab host, private areas never')
  const RB = await ctx.bundle('ai1-robots', "export { default } from '@/app/robots'\nexport * as P from '@/lib/robots-policy'")
  const hg = await run({ rows: ROWS.ieOff(), host: 'www.hatchgrab.com' }, () => RB.default())
  const vf = await run({ rows: ROWS.ieOff(), host: 'www.villagefoodie.co.uk' }, () => RB.default())
  const ua = r => [].concat(r.userAgent)
  const WANT_ANSWER = ['OAI-SearchBot', 'ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Googlebot', 'Bingbot', 'Applebot']
  const WANT_TRAINING = ['GPTBot', 'ClaudeBot', 'Google-Extended', 'Applebot-Extended', 'CCBot']
  const allowGroup = hg.rules.find(r => ua(r).includes('OAI-SearchBot'))
  t('HatchGrab host: one group names all 9 answer / search bots and all 5 training bots, Allow: /',
    !!allowGroup && JSON.stringify(ua(allowGroup).slice().sort()) === JSON.stringify([...WANT_ANSWER, ...WANT_TRAINING].sort()) && allowGroup.allow === '/', allowGroup)
  const PRIV = ['/api/', '/trucks/', '/manage/', '/dashboard/', '/kds/', '/admin', '/o/', '/order/', '/p/', '/embed/', '/demo/', '/setup', '/auth/', '/dev/']
  t('…and that group repeats every private disallow (a named group replaces `*` for the bot)', JSON.stringify(allowGroup?.disallow) === JSON.stringify(PRIV), allowGroup?.disallow)
  const star = hg.rules.find(r => ua(r).includes('*'))
  t('HatchGrab host: `*` disallows the same private areas (today\'s /api/ and /trucks/ among them)', JSON.stringify(star?.disallow) === JSON.stringify(PRIV), star)
  t('HatchGrab host: no allowed bot is also blocked anywhere', hg.rules.filter(r => r !== allowGroup && r.disallow === '/').every(r => !ua(r).some(a => [...WANT_ANSWER, ...WANT_TRAINING].includes(a))))
  t('HatchGrab host: Bytespider, FacebookBot and anthropic-ai stay blocked (outside this decision)', ['Bytespider', 'FacebookBot', 'anthropic-ai'].every(a => hg.rules.some(r => ua(r).includes(a) && r.disallow === '/')))
  t('HatchGrab host: the unlisted landing preview is never named', !JSON.stringify(hg).includes('1ng7n4p5omux2gdk9kqvwz'))
  t('HatchGrab host: its own sitemap', hg.sitemap === 'https://www.hatchgrab.com/sitemap.xml')
  const OLD_VF = { rules: [...['GPTBot', 'ClaudeBot', 'CCBot', 'Bytespider', 'FacebookBot', 'Applebot-Extended', 'Google-Extended', 'anthropic-ai'].map(userAgent => ({ userAgent, disallow: '/' })), { userAgent: '*', disallow: ['/api/', '/trucks/'] }], sitemap: 'https://www.villagefoodie.co.uk/sitemap.xml' }
  t('Village Foodie host: exactly today\'s robots (the 5 June 2026 policy) — unchanged', JSON.stringify(vf) === JSON.stringify(OLD_VF), vf)
  t('the policy lists live in lib/robots-policy.ts (one definition)', JSON.stringify(RB.P.ANSWER_BOTS) === JSON.stringify(WANT_ANSWER) && JSON.stringify(RB.P.TRAINING_BOTS) === JSON.stringify(WANT_TRAINING))

  // ══ 2 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · llms.txt — from the data, HatchGrab host only, switched-off countries never')
  const LT = await ctx.bundle('ai1-llms', "export { GET } from '@/app/llms.txt/route'\nexport { llmsText } from '@/lib/llms-text'\nexport { clearPlanCatalogCache as __p } from '@/lib/plans-server'\nexport { clearCountrySettingsCache as __c } from '@/lib/country-settings'")
  const getLlms = async (rows, host) => run({ rows, host }, async () => { LT.__p(); LT.__c?.(); const r = await LT.GET(); return { status: r.status, type: r.headers.get('content-type'), body: await r.text() } })
  const off = await getLlms(ROWS.ieOff(), 'www.hatchgrab.com')
  t('HatchGrab host: 200, text/markdown', off.status === 200 && /text\/markdown/.test(off.type || ''), off)
  t('it opens with the H1 and a one-sentence summary (llmstxt.org shape)', /^# HatchGrab\n\n> HatchGrab is online ordering, pre-orders and a kitchen screen for food trucks and mobile catering: /.test(off.body), off.body.slice(0, 200))
  t('switched on: United Kingdom and United States, each with its own plans and prices from the data', /### United Kingdom \(GBP\)[\s\S]*- Pay as you go: £0 per truck per month\. 0\.99% on online card orders\.[\s\S]*- Pro: £29 per truck per month\. First £4,000 of online orders included each month, then 0\.99% on online card orders\.[\s\S]*- Unlimited: £69 per truck per month\. No HatchGrab fee on online orders\./.test(off.body)
    && off.body.includes(`- Pro: $${CATALOG.prices.find(p => p.countryCode === 'US' && p.planKey === 'pro').monthlyMinor / 100} per truck per month`), off.body.match(/###[\s\S]{0,600}/g))
  t('each country\'s card-processing line is the pricing footnote in its own words ("in the UK")', /currently 1\.5% \+ 20p in the UK/.test(off.body))
  t('the fee rule and the trial (3 months, falls back to Pay as you go with no monthly fee) come from the catalogue',
    /## The HatchGrab fee\n\nThe HatchGrab fee is 0\.99% of online card orders/.test(off.body) && /The first 3 months are completely free, with every feature unlocked\. When the trial ends, a truck moves to Pay as you go \(no monthly fee\)/.test(off.body))
  t('links: /uk, /us, their features and compare pages, terms and privacy', ['/uk', '/us', '/uk/features', '/us/features', '/uk/compare', '/us/compare', '/terms', '/privacy'].every(p => off.body.includes(`https://www.hatchgrab.com${p}`)))
  t('Ireland switched OFF: not named, no €, no /ie link', !/Ireland|€|\/ie\b/.test(off.body))
  const on = await getLlms(ROWS.ieOn(), 'www.hatchgrab.com')
  t('Ireland switched ON (fixture): it appears with € prices and "in Ireland"', /### Ireland \(EUR\)/.test(on.body) && /€29 per truck per month/.test(on.body) && /in Ireland\)/.test(on.body) && on.body.includes('https://www.hatchgrab.com/ie'))
  const vfL = await getLlms(ROWS.ieOff(), 'www.villagefoodie.co.uk')
  t('Village Foodie host: 404', vfL.status === 404)
  t('the body is built from the data passed in (one country in → one country out)', (() => { const one = LT.llmsText([LP1E.GB()], CATALOG); return /### United Kingdom/.test(one) && !/United States/.test(one) })())

  // ══ 3 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · JSON-LD — real facts, from data')
  const LP = await ctx.bundle('ai1-landing', "export * from '@/app/[country]/page'\nexport { default } from '@/app/[country]/page'\nexport { clearPlanCatalogCache as __p } from '@/lib/plans-server'\nexport { clearCountrySettingsCache as __c } from '@/lib/country-settings'\nexport { COMPANY } from '@/lib/company'")
  const ld = async (seg, rows) => run({ rows }, async () => { LP.__p(); LP.__c?.(); const html = await ctx.prerender(h(LP.default, { params: Promise.resolve({ country: seg }), searchParams: Promise.resolve({}) })); const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html); return m ? JSON.parse(m[1]) : null })
  for (const [seg, cur, cc] of [['uk', 'GBP', 'GB'], ['us', 'USD', 'US']]) {
    const g = await ld(seg, ROWS.ieOff()); const nodes = g?.['@graph'] || []
    const org = nodes.find(n => n['@type'] === 'Organization'), app = nodes.find(n => n['@type'] === 'SoftwareApplication')
    t(`/${seg}: Organization legalName "${LP.COMPANY.name}", addressCountry ${LP.COMPANY.countryCode} (lib/company.ts), url, logo, sameAs = App Store + Google Play`,
      org?.legalName === LP.COMPANY.name && org?.address?.addressCountry === LP.COMPANY.countryCode && org?.url === 'https://www.hatchgrab.com/' && /\/logos\//.test(org?.logo || '')
      && org?.sameAs?.length === 2 && /apps\.apple\.com/.test(org.sameAs[0]) && /play\.google\.com/.test(org.sameAs[1]), org)
    t(`/${seg}: SoftwareApplication — BusinessApplication, "Web, iOS, Android", a one-sentence description`,
      app?.applicationCategory === 'BusinessApplication' && app?.operatingSystem === 'Web, iOS, Android' && typeof app?.description === 'string' && (app.description.match(/[.!?](\s|$)/g) || []).length === 1, app)
    t(`/${seg}: countriesSupported = the switched-on countries (GB, US — Ireland is off), and no invalid areaServed`, JSON.stringify(app?.countriesSupported) === '["GB","US"]' && !('areaServed' in (app || {})), app?.countriesSupported)
    const prices = (app?.offers || []).map(o => `${o.name}=${o.price} ${o.priceCurrency}`)
    t(`/${seg}: Offers as before — one per public plan, in ${cur}, from plan_prices`, prices.length === 3 && (app.offers || []).every(o => o.priceCurrency === cur), prices)
  }
  const gOn = await ld('uk', ROWS.ieOn())
  const csOn = gOn?.['@graph']?.find(n => n['@type'] === 'SoftwareApplication')?.countriesSupported
  t('Ireland switched ON (fixture): countriesSupported gains IE (the country menu\'s list)', JSON.stringify([...(csOn || [])].sort()) === '["GB","IE","US"]', csOn)

  console.log(`\n${fail ? '🔴' : '✅'} ai-search-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
