// scripts/seo-geo-2.cjs — faq-2-seo-geo-2's proof, Part B (2 November 2026; docs/faq-2-seo-geo-2-report.md): SEARCH AND AI FIXES.
//
//   1 · B1 redirects, through the REAL proxy (proxy.ts): Village Foodie's consumer pages on www.hatchgrab.com (/venues/<slug>,
//       /trucks, /hire) → 308 to the same path on www.villagefoodie.co.uk, the query kept; the landing preview on Village Foodie →
//       308 to www.hatchgrab.com; the order page, the truck pages, the country pages and every preview / local host untouched
//   2 · B1 venue pages: no upcoming public event → `noindex, follow`; with one (or the feed unreadable) → nothing added; decided on
//       the server from the events feed the page reads (fixtures); thin utility pages noindex (vercel.json)
//   3 · B3 operatingSystem per country: "Web" everywhere, iOS / Android only where the country's flags say so
//   4 · landing pages byte-identical to HEAD (dad7911a) apart from the JSON-LD operatingSystem
//   5 · B4 /llms.txt (the real route): a Features section, the English FAQ as the UK page shows it, every country's lines in English
//       in the side-by-side form; nothing invented
//   6 · B5 the custom-domain credit: a plain followable link to the truck's country page (no rel, no nofollow)
//   7 · B6 IndexNow: the key file; a noindex, redirecting, 404 or other-canonical URL is never submitted; one request per host; the
//       FAQ route submits only for a public change and only in production; the translator only for pages it changed; the deploy
//       workflow waits for the production deployment
//
// §4's HEAD side is scripts/fixtures/seo-geo-2-identity.json, written by THIS script in a worktree of dad7911a:
//   (in <dir>) HG_KIT_CACHE_SUFFIX=sg2head node scripts/seo-geo-2.cjs capture <this repo>/scripts/fixtures/seo-geo-2-identity.json
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'seo-geo-2' })
const LP1E = require('./_lp1e-fixtures.cjs')
const WF = require('./_world-countries-1-fixtures.cjs')
const FIX = require('./fixtures/faq-3-rows.json')
// ⚠️ RE-PINNED (store-badges-1, 2 November 2026): hashed with the footer's store badges and the Play URL's &hl=en taken out (scripts/
// _lp-store-badges-1.cjs strip, both sides; the badges follow the app flags now and are proven by scripts/store-badges-1.cjs).
const SB1 = require('./_lp-store-badges-1.cjs')
// ⚠️ RE-PINNED (faq-4, 2 November 2026): the FAQ left the landing pages for its own page, /<country>/faq. §4 hashes the landing pages
// with faq-4's two changes taken out on both sides (scripts/_lp-faq-4.cjs: faq-3's FAQ section, its FAQPage and the final CTA's band;
// the footer's FAQ link) — recaptured at dad7911a with them. §7: IndexNow names the FAQ pages (lib/indexnow.ts faqUrlsFor, was
// landingUrlsFor), the Admin route only those with content, the translator those in the languages it wrote ok rows for.
const F4 = require('./_lp-faq-4.cjs')
const IDENTITY = path.join(REPO, 'scripts/fixtures/seo-geo-2-identity.json')
const HEAD_COMMIT = 'dad7911a'

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500)}`) } }
const head = s => console.log(`\n── ${s}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const FAQ = () => JSON.parse(JSON.stringify({ faq_sections: FIX.faq_sections, faq_items: FIX.faq_items }))
const SEGS = ['uk', 'us', 'ie', 'de', 'fr', 'jp', 'ae', 'br']
// The JSON-LD's operatingSystem, the one value B3 changes, replaced by a marker on both sides.
const withoutOs = html => String(html).replace(/"operatingSystem":"[^"]*"/g, '"operatingSystem":"…"')

async function identitySet() {
  const wf = WF.renderer(kit, 'sg2-wf')
  const rows = WF.rowsWith(WF.WORLD).map(r => ({ ...r, iosAppAvailable: r.countryCode === 'GB', androidAppAvailable: r.countryCode === 'GB' }))
  Object.assign(wf.tables, FAQ(), { faq_translations: [] })
  const out = {}
  const info = console.info; console.info = () => {}
  try {
    for (const seg of SEGS) {
      const r = await kit.quietAsync(() => wf.page('landing', seg, rows))
      const os = (/"operatingSystem":"([^"]*)"/.exec(r.html) || [])[1] ?? null
      const html = F4.noLandingFaq(F4.noFaqLink(r.html))   // ⚠️ RE-PINNED (faq-4)
      out[`landing:${seg}`] = { html: sha(SB1.strip(html)), htmlWithoutOs: sha(withoutOs(SB1.strip(html))), meta: sha(JSON.stringify(r.meta)), os }
    }
  } finally { console.info = info }
  return out
}
function sha(s) { return crypto.createHash('sha256').update(String(s)).digest('hex') }
if (process.argv[2] === 'capture') {
  (async () => {
    const out = await identitySet()
    fs.writeFileSync(process.argv[3], JSON.stringify({ $why: `seo-geo-2 §4: each landing page at ${HEAD_COMMIT} (sha256 of the HTML, of the HTML with the operatingSystem value masked, of the metadata).`, commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO }).toString().trim(), pages: out }, null, 1) + '\n')
    console.log(`captured ${Object.keys(out).length} pages`)
  })().catch(e => { console.error(e); process.exit(1) })
  return
}

;(async () => {
  const ctx = LP1E.context(kit, REPO)
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const ROWS = WF.rowsWith(WF.WORLD).map(r => ({ ...r, iosAppAvailable: r.countryCode === 'GB', androidAppAvailable: r.countryCode === 'GB' }))
  const wf = WF.renderer(kit, 'sg2-wf-tables')

  head('1 · B1 redirects, through the real proxy')
  const P = await ctx.bundle('sg2-proxy', "export * from '@/proxy'\nexport { crossHostRedirect, isVillageFoodiePage } from '@/lib/host-redirects'", {
    stubs: {
      '@supabase/ssr': "export function createServerClient() { return { auth: { async getUser() { return { data: { user: null }, error: null } } } } }",
      '@/lib/ratelimit': ['ratelimit', 'strictRatelimit', 'eventsRatelimit', 'embedRatelimit', 'customHostRatelimit', 'domainCheckRatelimit', 'demoRatelimit', 'signupRatelimit', 'signupEmailRatelimit', 'domainPreflightRatelimit']
        .map(n => `export const ${n} = { async limit() { return { success: true, remaining: 99, limit: 100, reset: 0 } } }`).join('\n'),
    },
  })
  const visit = (host, url) => ctx.withReq({ rows: ROWS, host }, async () => {
    const res = await kit.quietAsync(() => P.proxy(new NextRequest(new URL(url, `https://${host}`), { headers: { host } })))
    return { status: res.status, location: res.headers.get('location'), rewrite: res.headers.get('x-middleware-rewrite') }
  })
  const HG = 'www.hatchgrab.com', VF = 'www.villagefoodie.co.uk'
  for (const [p, q] of [['/venues/the-crown-thurston', ''], ['/venues/the-crown-thurston', '?utm_source=x&a=b'], ['/trucks', ''], ['/hire', ''], ['/hire', '?ref=fb']]) {
    const r = await visit(HG, p + q)
    t(`${HG}${p}${q} → 308 ${VF}${p}${q}`, r.status === 308 && r.location === `https://${VF}${p}${q}`, r)
  }
  const apex = await visit('hatchgrab.com', '/hire')
  t('the apex host too (hatchgrab.com/hire → villagefoodie)', apex.status === 308 && apex.location === `https://${VF}/hire`, apex)
  const prev = await visit(VF, '/1ng7n4p5omux2gdk9kqvwz')
  t(`${VF}/1ng7n4p5omux2gdk9kqvwz (the HatchGrab landing preview) → 308 ${HG}`, prev.status === 308 && prev.location === `https://${HG}/1ng7n4p5omux2gdk9kqvwz`, prev)
  for (const p of ['/trucks/pizza-kitchen', '/trucks/pizza-kitchen/order', '/order/abc', '/o/abc', '/uk', '/uk/features', '/contact', '/privacy', '/about', '/llms.txt', '/sitemap.xml', '/app', '/venues', '/hire/x']) {
    const r = await visit(HG, p)
    t(`${HG}${p} is not sent to Village Foodie`, !(r.location || '').includes('villagefoodie'), r)
  }
  for (const p of ['/venues/x', '/trucks', '/hire', '/', '/contact']) {
    const r = await visit(VF, p)
    t(`${VF}${p} stays on Village Foodie`, !(r.location || '').includes('hatchgrab') && r.status !== 308, r)
  }
  for (const host of ['hatchgrab.localhost:3000', 'preview-abc.hatchgrab.vercel.app', 'order.pizzakitchen.example']) {
    const r = await visit(host, '/hire')
    t(`${host}/hire: a preview, local or custom host is never sent to production`, !(r.location || '').includes('villagefoodie.co.uk'), r)
  }
  t('the rule is one pure function (lib/host-redirects.ts), production hosts only', P.crossHostRedirect('www.hatchgrab.com', '/venues/a', '') === 'https://www.villagefoodie.co.uk/venues/a' && P.crossHostRedirect('hatchgrab.localhost:3000', '/venues/a', '') === null && !P.isVillageFoodiePage('/trucks/a') && !P.isVillageFoodiePage('/trucks/a/order'))

  head('2 · B1 venue pages: noindex without upcoming events; thin pages noindex')
  const events = [{ venueSlug: 'the-crown-thurston', venueName: 'The Crown', village: 'Thurston' }, { venueName: 'The Bull', village: 'Woolpit' }]
  const V = await ctx.bundle('sg2-venue', "export { generateMetadata } from '@/app/venues/[slug]/page'\nexport { venueRobots } from '@/lib/venue-index'", {
    stubs: { '@/app/api/discovery/events/route': "export async function GET() { if (globalThis.__sg2Feed === 'fail') throw new Error('feed down'); return new Response(JSON.stringify({ events: globalThis.__sg2Feed ?? [] }), { status: 200 }) }" },
  })
  const realFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('Venue,Village\nThe Crown,Thurston\nEmpty Arms,Nowhere\n', { status: 200 })
  const meta = async (slug, feed) => { globalThis.__sg2Feed = feed; try { return await kit.quietAsync(() => V.generateMetadata({ params: Promise.resolve({ slug }) })) } finally { delete globalThis.__sg2Feed } }
  try {
    const withEv = await meta('the-crown-thurston', events)
    t('a venue with an upcoming public event: no robots added (indexable, as today)', withEv.robots === undefined && /The Crown/.test(withEv.title), withEv)
    const none = await meta('empty-arms-nowhere', events)
    t('a venue with no upcoming public event: noindex, follow', none.robots?.index === false && none.robots?.follow === true, none.robots)
    const unknown = await meta('no-such-venue', events)
    t('a slug the sheet does not know (the generic title) also noindex, follow when it has no events', unknown.robots?.index === false && unknown.robots?.follow === true && unknown.title === 'Venue | Village Foodie', unknown)
    const keyed = await meta('the-bull-woolpit', events)
    t('the same key the page filters by (venueGroupKey: the name and village slug when no venueSlug)', keyed.robots === undefined, keyed)
    const down = await meta('empty-arms-nowhere', 'fail')
    t('the feed unreadable → nothing added (no page drops out of the index on a blip)', down.robots === undefined, down)
  } finally { globalThis.fetch = realFetch }
  const venueSrc = read('app/venues/[slug]/page.tsx') + read('lib/venue-index.ts')
  t('decided on the server from the feed the page reads (app/api/discovery/events, Village Foodie\'s host)', /import\('@\/app\/api\/discovery\/events\/route'\)/.test(venueSrc) && /venueGroupKey\(e\) === slug/.test(venueSrc) && /export async function generateMetadata/.test(venueSrc))
  const vj = JSON.parse(read('vercel.json'))
  for (const p of ['/app', '/setup', '/forgot-password', '/reset-password']) t(`${p}: X-Robots-Tag noindex (vercel.json)`, vj.headers.some(h => h.source === p && h.headers.some(x => x.key === 'X-Robots-Tag' && /noindex/.test(x.value))))

  head('3 · B3 operatingSystem per country')
  const SD = await kit.bundle('sg2-sd', "export { operatingSystemsOf, landingGraph } from '@/lib/structured-data'")
  t('"Web" everywhere; iOS and Android only where flagged', SD.operatingSystemsOf({ ios: false, android: false }) === 'Web' && SD.operatingSystemsOf({ ios: true, android: true }) === 'Web, iOS, Android' && SD.operatingSystemsOf({ ios: true, android: false }) === 'Web, iOS' && SD.operatingSystemsOf({ ios: false, android: true }) === 'Web, Android')
  // Its own landing bundle, so the app flags' 60-second cache (lib/comparison-flags.ts) is cleared for every page.
  const LB = await ctx.bundle('sg2-landing', "export { default as Landing } from '@/app/[country]/page'\nexport { clearComparisonCache as __cmp } from '@/lib/comparison-flags'\nexport { clearPlanCatalogCache as __p } from '@/lib/plans-server'\nexport { clearPublicFaqCache as __faq } from '@/lib/faq/public'")
  const osOf = async (seg, rows) => {
    const info = console.info; console.info = () => {}
    const html = await kit.quietAsync(() => ctx.withReq({ rows, tables: { ...wf.tables, ...FAQ() } }, async () => { LB.__p(); LB.__cmp(); LB.__faq(); return ctx.prerender(kit.h(LB.Landing, { params: Promise.resolve({ country: seg }), searchParams: Promise.resolve({}) })) })).finally(() => { console.info = info })
    return (/"operatingSystem":"([^"]*)"/.exec(html) || [])[1]
  }
  t('GB (both apps in the UK stores, as live): "Web, iOS, Android"', (await osOf('uk', ROWS)) === 'Web, iOS, Android')
  t('US, DE, JP (no app in their stores): "Web"', (await osOf('us', ROWS)) === 'Web' && (await osOf('de', ROWS)) === 'Web' && (await osOf('jp', ROWS)) === 'Web')
  t('the flags decide it — US with both flags on: "Web, iOS, Android"; iOS only: "Web, iOS"', (await osOf('us', ROWS.map(r => (r.countryCode === 'US' ? { ...r, iosAppAvailable: true, androidAppAvailable: true } : r)))) === 'Web, iOS, Android' && (await osOf('us', ROWS.map(r => (r.countryCode === 'US' ? { ...r, iosAppAvailable: true } : r)))) === 'Web, iOS')
  t('sameAs is unchanged (the App Store and Google Play listings)', /sameAs: \[appStoreUrlFor\(countryCode\), GOOGLE_PLAY_URL\]/.test(read('lib/structured-data.ts')))

  head(`4 · landing pages byte-identical to HEAD (${HEAD_COMMIT}) apart from the JSON-LD operatingSystem`)
  if (!fs.existsSync(IDENTITY)) t('scripts/fixtures/seo-geo-2-identity.json exists (captured at HEAD)', false)
  else {
    const want = JSON.parse(fs.readFileSync(IDENTITY, 'utf8'))
    const got = await identitySet()
    for (const [k, v] of Object.entries(want.pages)) {
      t(`${k}: identical apart from operatingSystem ("${v.os}" → "${got[k]?.os}")`, got[k]?.htmlWithoutOs === v.htmlWithoutOs && got[k]?.meta === v.meta, { want: v, got: got[k] })
      if (v.os === got[k]?.os) t(`${k}: operatingSystem unchanged, so the page is byte-identical`, got[k].html === v.html)
    }
    t(`HEAD said "Web, iOS, Android" on every page; now only GB does`, Object.values(want.pages).every(p => p.os === 'Web, iOS, Android') && Object.entries(got).every(([k, p]) => p.os === (k === 'landing:uk' ? 'Web, iOS, Android' : 'Web')))
  }

  head('5 · B4 /llms.txt (the real route)')
  const R = await ctx.bundle('sg2-llms', "export { GET } from '@/app/llms.txt/route'\nexport { landingFaq, clearPublicFaqCache } from '@/lib/faq/public'\nexport { getCountrySettings } from '@/lib/country-settings'\nexport { translatorFor } from '@/lib/i18n/translator'")
  const { text, faq } = await ctx.withReq({ rows: ROWS, tables: { ...wf.tables, ...FAQ() }, host: HG }, async () => {
    R.clearPublicFaqCache()
    const info = console.info; console.info = () => {}
    try {
      const res = await R.GET()
      return { text: await res.text(), faq: await R.landingFaq(await R.getCountrySettings('GB')) }
    } finally { console.info = info }
  })
  const block = name => (new RegExp(`\\n## ${name}\\n\\n([\\s\\S]*?)(?=\\n## |$)`).exec(text) || [])[1] || ''
  const tl = R.translatorFor('en-GB', 'landing')
  const features = block('Features').trim().split('\n')
  t('a Features section: the six landing tiles, in English, in the site\'s own words', features.length === 6 && features[0] === `- ${tl('does.slotsTitle')}: ${tl('does.slotsBody')}` && features[5].startsWith('- No signal? Keep serving: '), features)
  const faqBlock = block('Frequently asked questions')
  const expectPairs = faq.flatMap(s => s.items)
  t(`the English FAQ: the ${expectPairs.length} questions the UK page shows, each answer exactly as there`, expectPairs.length === 24 && expectPairs.every(p => faqBlock.includes(`**${p.q}**\n\n${p.a}\n`)), { n: expectPairs.length })
  t('…section titles as the page\'s labels, in Admin order', JSON.stringify([...faqBlock.matchAll(/^### (.+)$/gm)].map(m => m[1])) === JSON.stringify(faq.map(s => s.title)))
  t('…no draft (…0010), no banned wording, no token left', !faqBlock.includes('Can customers pay at the truck instead of online?') && !/pay at hatch|pay at the truck|pay when they collect|\{/i.test(faqBlock))
  t('…the GB prices in the international form (for GBP it is the home form: £)', /£0, Pro £29 and Unlimited £69/.test(faqBlock))
  const plans = block('Plans and prices')
  t('no amount or percentage in a home form anywhere ("0,99 %", "29 €", "4.000")', !/\d,\d\d\s?%|\d\s€|\d\.\d{3}\b|\s%/.test(plans), (plans.match(/.{0,30}(\d,\d\d\s?%|\d\s€).{0,10}/) || [])[0])
  t('the side-by-side form, in English: "€29" (DE), "SEK 329" (SE), "A$39" (AU), "¥1,980" (JP)', /### Germany \(EUR\)[\s\S]*?Pro: €29 per truck/.test(plans) && /### Sweden \(SEK\)[\s\S]*?Pro: SEK\s329/.test(plans) && /### Australia \(AUD\)[\s\S]*?Pro: A\$39/.test(plans) && /### Japan \(JPY\)[\s\S]*?Pro: ¥1,980/.test(plans))
  const cardLines = plans.split('\n').filter(l => /card processing on online card orders/.test(l))
  t(`every country's card sentence in English (${cardLines.length} of ${(plans.match(/^### /gm) || []).length})`, cardLines.length === (plans.match(/^### /gm) || []).length && cardLines.every(l => /^- Plus [A-Z][a-z]+’s card processing on online card orders \(currently .+ in .+\), paid to [A-Z][a-z]+, not HatchGrab\./.test(l)))
  t('…with the country named the English way: "in the UK", "in the US", "in Ireland", "in Germany", "in the Netherlands", "in the United Arab Emirates"', ['in the UK)', 'in the US)', 'in Ireland)', 'in Germany)', 'in the Netherlands)', 'in the United Arab Emirates)', 'in the Czech Republic)'].every(s => cardLines.some(l => l.includes(s))))
  t('…in the international form: "1.5% + €0.25" (DE), "1.5% + SEK 1.80" (SE)', cardLines.some(l => l.includes('1.5% + €0.25 in Germany')) && cardLines.some(l => /1\.5% \+ SEK\s1\.80 in Sweden/.test(l)))
  t('no non-English sentence left in the country lines', !/[äöüßéèàçñ]|Zzgl|Tillkommer|オンライン|ค่า|رسوم/.test(plans))
  t('the rest as before: who it is for, the fee, the trial, the countries, about, links', ['Who it is for', 'The HatchGrab fee', 'Free trial', 'Countries', 'About', 'Links'].every(s => text.includes(`\n## ${s}\n`)))

  head('6 · B5 the custom-domain credit')
  const E = await kit.bundle('sg2-embed', "export { PoweredBy } from '@/components/embed/EmbedParts'")
  const credit = kit.renderStatic(kit.h(E.PoweredBy, { locale: 'de-DE', href: 'https://www.hatchgrab.com/de' }))
  t('the credit links to the truck\'s country page, a plain followable link (no rel, no nofollow, no target)', /<a href="https:\/\/www\.hatchgrab\.com\/de"/.test(credit) && !/rel=|nofollow|target=/.test(credit), credit)
  t('…and /domain passes the truck\'s country page', /const creditHref = HATCHGRAB_URL \+ \(countryPagePath\(truck\.country \?\? 'GB', 'landing'\) \?\? ''\)/.test(read('app/domain/page.tsx')) && (read('app/domain/page.tsx').match(/<PoweredBy locale=\{locale\} href=\{creditHref\} \/>/g) || []).length === 2)
  t('the order page is not extended (35.al-3): no credit added to it', !/PoweredBy|poweredBy/.test(read('app/trucks/[slug]/order/page.tsx')))

  head('7 · B6 IndexNow')
  const I = await kit.bundle('sg2-indexnow', "export * from '@/lib/indexnow'\nexport { changesPublicPages } from '@/lib/admin/faq-actions'")
  t('the key file at the site root holds the key', read(`public/${I.INDEXNOW_KEY}.txt`).trim() === I.INDEXNOW_KEY && /^[0-9a-f]{32}$/.test(I.INDEXNOW_KEY))
  const ok = '<html><head><link rel="canonical" href="https://www.hatchgrab.com/uk"></head></html>'
  t('a 200, indexable, self-canonical page is fit', I.probeVerdict('https://www.hatchgrab.com/uk', 200, null, ok) === null)
  const excluded = [
    ['a redirect (302, the / router)', I.probeVerdict('https://www.hatchgrab.com/', 302, null, null)],
    ['a 308', I.probeVerdict('https://www.hatchgrab.com/hire', 308, null, null)],
    ['a 404', I.probeVerdict('https://www.hatchgrab.com/x', 404, null, null)],
    ['an X-Robots-Tag noindex', I.probeVerdict('https://www.hatchgrab.com/trucks/a', 200, 'noindex, noarchive', ok)],
    ['a robots meta noindex', I.probeVerdict('https://www.hatchgrab.com/uk/compare', 200, null, '<meta name="robots" content="noindex, nofollow"/>')],
    ['a canonical naming another page', I.probeVerdict('https://www.villagefoodie.co.uk/privacy', 200, null, '<link rel="canonical" href="https://www.hatchgrab.com/privacy"/>')],
  ]
  for (const [label, v] of excluded) t(`never submitted: ${label} (${v})`, !!v)
  const payloads = I.indexNowPayloads(['https://www.hatchgrab.com/uk', 'https://www.hatchgrab.com/uk', 'https://www.villagefoodie.co.uk/', 'http://insecure.example/x', 'not a url'])
  t('one request per host, deduplicated, https only, with the key and its location', payloads.length === 2 && payloads[0].urlList.length === 1 && payloads.every(p => p.key === I.INDEXNOW_KEY && p.keyLocation === `https://${p.host}/${I.INDEXNOW_KEY}.txt`))
  const sent = [], logged = []
  const res = await I.submitIndexNow(['https://www.hatchgrab.com/uk', 'https://www.villagefoodie.co.uk/'], { fetchImpl: async (u, o) => { sent.push([u, JSON.parse(o.body)]); return new Response('', { status: 202 }) }, log: s => logged.push(s) })
  t('submitted to api.indexnow.org, every response logged', sent.length === 2 && sent.every(([u]) => u === 'https://api.indexnow.org/indexnow') && res.every(r => r.status === 202) && logged.length === 2 && /\[indexnow\] www\.hatchgrab\.com: 1 URL\(s\) → 202/.test(logged[0]), logged)
  const failed = await I.submitIndexNow(['https://www.hatchgrab.com/uk'], { fetchImpl: async () => { throw new Error('offline') } })
  t('a network failure is a logged result, never a throw', failed[0].status === null && failed[0].body === 'offline')
  const cs = ROWS.map(r => ({ countryCode: r.countryCode, locale: r.locale, enabled: r.enabled }))
  const de = I.faqUrlsFor(cs, ['de-DE']).map(u => u.split('/').at(-2)).sort()   // ⚠️ RE-PINNED (faq-4): /<seg>/faq
  t(`a de-DE translation → the German-language pages: ${de.join(', ')}`, JSON.stringify(de) === JSON.stringify(['at', 'ch', 'de', 'li']))
  t('"all" → every switched-on country with a page', I.faqUrlsFor(cs, 'all').length === cs.filter(c => c.enabled).length && I.faqUrlsFor(cs.map(c => (c.countryCode === 'FR' ? { ...c, enabled: false } : c)), 'all').every(u => !u.endsWith('/fr/faq')))
  const ok1 = { ok: true, data: { item: { status: 'published' } } }
  t('the FAQ route submits for a public change: publish, unpublish, delete, a move, a published question\'s text', ['item.publish', 'item.unpublish', 'item.delete', 'item.move', 'section.rename', 'section.delete'].every(a => I.changesPublicPages({ action: a }, ok1)) && I.changesPublicPages({ action: 'item.update', patch: { answerEn: 'x' } }, ok1))
  t('…and not for a note, a draft\'s text, a new question, or a refusal', !I.changesPublicPages({ action: 'item.update', patch: { note: 'x' } }, ok1) && !I.changesPublicPages({ action: 'item.update', patch: { answerEn: 'x' } }, { ok: true, data: { item: { status: 'draft' } } }) && !I.changesPublicPages({ action: 'item.create' }, ok1) && !I.changesPublicPages({ action: 'item.publish' }, { ok: false, status: 400, error: 'x' }))
  const route = read('app/api/admin/faq/route.ts')
  t('…only in production, after the response (keepAlive), with every switched-on country\'s FAQ page that has content (faq-4)', /publicChange && process\.env\.VERCEL_ENV === 'production'/.test(route) && /keepAlive\(async \(\) => \{[\s\S]*?const withContent = new Set\(\(await faqCountries\(\)\)\.map\(c => c\.code\)\)\s*const urls = faqUrlsFor\(\(await listCountrySettingsCached\(\)\)\.filter\(c => withContent\.has\(c\.countryCode\)\), 'all'\)/.test(route))
  const tm = read('scripts/faq-translate/main.ts')
  t('the translator submits only the pages it changed, never in a dry run, after the pages\' cache', /if \(!dryRun && !fixtures && report\.okLocales\.length\)/.test(tm) && /faqUrlsFor\(countries, report\.okLocales\)/.test(tm) && /setTimeout\(res, 65_000\)/.test(tm))
  const wy = read('.github/workflows/indexnow.yml')
  t('the deploy workflow: on push to main, waits for the production deployment of the commit, then submits both sitemaps\' fit URLs', /push:\s*\n\s*branches: \[main\]/.test(wy) && /deployments\?sha=\$SHA&environment=Production/.test(wy) && /"\$state" = "success"/.test(wy) && /deployments: read/.test(wy) && /scripts\/indexnow\/main\.ts/.test(wy))
  const im = read('scripts/indexnow/main.ts')
  t('…the deploy script probes every URL (redirects not followed) and leaves out the unfit, logging why', /redirect: 'manual'/.test(im) && /probeVerdict\(u, r\.status, r\.headers\.get\('x-robots-tag'\), html\)/.test(im) && /left out \$\{u\} — \$\{verdict\}/.test(im))

  console.log(`\nseo-geo-2: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
