#!/usr/bin/env node
// scripts/compare-de-1.cjs — compare-de-1 (24 October 2026, docs/compare-de-1-report.md).
//   node scripts/compare-de-1.cjs          (NO NETWORK, NO DATABASE — the render kit and fixtures; no real competitor)
//
// The German comparison page /de/vergleich/foodtruck-bestellsystem, rendered by the REAL page, twin route, sitemap,
// /llms.txt and landing footer over fixture tables (fictional competitors "Testanbieter A/B/C"):
//   1 · status: off → 404 for everyone; admin → 404 anonymous, 200 for an admin with robots noindex,nofollow and no
//       hreflang; live → 200, indexable, self-canonical, self-only hreflang, and in the sitemap and /llms.txt — and in
//       neither while not live; proxy.ts's X-Robots-Tag / no-store rule for a non-live address;
//   2 · verified gating: the public view (anonymous, or an admin's "So sieht es öffentlich aus") shows HatchGrab plus only
//       the competitor whose entry, plan AND features are verified — in the HTML, the .md and the .json alike; the admin
//       view shows every entry, the unverified ones badged "nicht geprüft · öffentlich verborgen";
//   3 · the server HTML holds the table (caption, th scope), the prices in the German form and the FAQ in <details>;
//   4 · the app rows follow country_settings' flags ("Nicht in Deutschland" publicly, the admin wording for admins, "Ja"
//       once both are on), and the "passt nicht" clause names the apps while a flag is off;
//   5 · a price change in plan_prices reaches the table, the costs, the FAQ, the .md and the JSON-LD;
//   6 · JSON-LD: WebPage, BreadcrumbList, FAQPage, ItemList — and no Product, Review, Rating or AggregateRating;
//   7 · the footer's "Vergleich" link: in the server HTML only when live; never in it for admin (the browser adds it for
//       an admin) or off; only on the country's own pages;
//   8 · the go-live checklist, the import's once-only rule and the data file's shape (every row research, unverified).
//   9 · global-players-1 (29 October 2026): the group label under each tool's name (by focus, or the entry's override) in
//       the HTML, the .md and the .json; the tills card names only the VERIFIED, counted 'pos' competitors in the table
//       (no fixed example names); an unverified or still-candidate 'pos' entry stays hidden publicly (an admin sees it).
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'compare-de-1' })
const { REPO } = kit
const LP1E = require('./_lp1e-fixtures.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 700) : JSON.stringify(detail).slice(0, 700)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const dec = s => String(s).replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
const text = html => dec(String(html).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/[\s\u00a0\u202f]+/g, ' ')

const F = require('./_compare-de-1-fixtures.cjs')
const { A, B, C, PA, PB, PC, comp, plan, entry } = F

;(async () => {
  const R = await F.renderer(kit)
  const { M, catalog, req, page, twin, sitemap, llms, landing } = R
  const URL_ = 'https://www.hatchgrab.com/de/vergleich/foodtruck-bestellsystem'
  const SEG = R.SEG
  const ld = html => JSON.parse(dec((/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html) || [])[1] || '{}').replace(/\\u003c/g, '<'))

  // ── 1 · status ──
  head('1 · status — off, admin, live')
  const offAnon = await page({ status: 'off' }), offAdmin = await page({ status: 'off', admin: true })
  t('off: 404 for an anonymous visitor and for an admin', offAnon.notFound && offAdmin.notFound)
  const adAnon = await page({ status: 'admin' }), adAdmin = await page({ status: 'admin', admin: true })
  t('admin: 404 for an anonymous visitor', adAnon.notFound)
  t('admin: 200 for a verified admin, robots noindex,nofollow, canonical itself, NO hreflang', !adAdmin.notFound && !!adAdmin.html
    && adAdmin.meta.robots.index === false && adAdmin.meta.robots.follow === false && adAdmin.meta.alternates.canonical === URL_ && !adAdmin.meta.alternates.languages, adAdmin.meta)
  t('admin: the admin banner with the status line, the view toggle, the Pricing check link and the checklist; no live switch',
    /data-admin-banner/.test(adAdmin.html) && /Entwurf · noindex/.test(dec(adAdmin.html)) && /href="\?view=public"/.test(adAdmin.html) && /href="\/admin\?tab=pricing"/.test(adAdmin.html)
    && (adAdmin.html.match(/data-check="/g) || []).length === 5 && !/data-status="live"|Live schalten<\/button>/.test(adAdmin.html))
  const live = await page({ status: 'live' })
  t('live: 200 for everyone, indexable, self-canonical, hreflang = itself only (de-DE)', !live.notFound && live.meta.robots.index === true
    && live.meta.alternates.canonical === URL_ && JSON.stringify(live.meta.alternates.languages) === JSON.stringify({ 'de-DE': URL_ }), live.meta.alternates)
  t('live: no admin banner for an anonymous visitor', !/data-admin-banner/.test(live.html))
  t('meta: the title (≤ 60 characters), the German description (~150), Open Graph, the Markdown and JSON alternates',
    live.meta.title.absolute.length <= 60 && live.meta.description.length >= 130 && live.meta.description.length <= 165 && live.meta.openGraph.locale === 'de_DE'
    && live.meta.alternates.types['text/markdown'] === URL_ + '.md' && live.meta.alternates.types['application/json'] === URL_ + '.json', [live.meta.title.absolute.length, live.meta.description.length])
  t('a wrong slug or section is a 404 even when live', (await page({ status: 'live', params: { ...SEG, slug: 'x' } })).notFound && (await page({ status: 'live', params: { ...SEG, section: 'compare' } })).notFound)
  const smLive = await sitemap({ status: 'live' }), smAdmin = await sitemap({ status: 'admin' }), smOff = await sitemap({ status: 'off' })
  const inSm = sm => sm.find(e => e.url === URL_)
  t('sitemap: the page is in it when live (lastmod = the newest check date shown, hreflang itself only)', !!inSm(smLive)
    && new Date(inSm(smLive).lastModified).toISOString().slice(0, 10) === '2026-10-22' && JSON.stringify(inSm(smLive).alternates.languages) === JSON.stringify({ 'de-DE': URL_ }), inSm(smLive))
  t('sitemap: not in it when admin or off', !inSm(smAdmin) && !inSm(smOff))
  const lLive = await llms({ status: 'live' }), lAdmin = await llms({ status: 'admin' }), lOff = await llms({ status: 'off' })
  t('/llms.txt: a "Comparisons" section in English naming the page and its twins when live', /## Comparisons/.test(lLive) && lLive.includes(URL_) && lLive.includes(URL_ + '.md') && lLive.includes(URL_ + '.json') && /in German/.test(lLive), lLive.slice(-600))
  t('/llms.txt: no Comparisons section when admin or off', !/Comparisons|vergleich/.test(lAdmin) && !/Comparisons|vergleich/.test(lOff))
  t('hreflang of the other marketing pages never names the comparison page (any status)', !JSON.stringify(smLive.filter(e => e.url !== URL_)).includes('vergleich'))
  t('proxy: the address and its twins are recognised; /de/features and /de/compare are not', JSON.stringify(M.comparisonAddressOf('/de/vergleich/foodtruck-bestellsystem')) === JSON.stringify({ code: 'DE', section: 'vergleich', slug: 'foodtruck-bestellsystem', format: 'html' })
    && M.comparisonAddressOf('/de/vergleich/foodtruck-bestellsystem.json').format === 'json' && M.comparisonAddressOf('/de/features') === null && M.comparisonAddressOf('/de/compare/x') === null && M.comparisonAddressOf('/zz/a/b') === null)
  const proxySrc = read('proxy.ts')
  t('proxy: a non-live comparison address gets X-Robots-Tag noindex, nofollow and Cache-Control private, no-store', /if \(cmp && \(await comparisonFlagsOf\(cmp\.code\)\)\.status !== 'live'\) \{\s*supabaseResponse\.headers\.set\('X-Robots-Tag', 'noindex, nofollow'\)\s*supabaseResponse\.headers\.set\('Cache-Control', 'private, no-store'\)/.test(proxySrc))
  const tAnonAdmin = await twin('md', { status: 'admin' }), tAdminMd = await twin('md', { status: 'admin', admin: true }), tOffJson = await twin('json', { status: 'off', admin: true })
  t('twins: admin → 404 anonymous; 200 for an admin with no-store + noindex; off → 404 even for an admin', tAnonAdmin.status === 404 && tAdminMd.status === 200
    && tAdminMd.headers['cache-control'] === 'private, no-store' && tAdminMd.headers['x-robots-tag'] === 'noindex, nofollow' && tOffJson.status === 404, [tAnonAdmin.status, tAdminMd.status, tAdminMd.headers, tOffJson.status])
  const tLiveMd = await twin('md', { status: 'live' }), tLiveJson = await twin('json', { status: 'live' })
  t('twins: live → 200, text/markdown and application/json, cacheable, no noindex', tLiveMd.status === 200 && /text\/markdown/.test(tLiveMd.headers['content-type']) && /application\/json/.test(tLiveJson.headers['content-type'])
    && /public/.test(tLiveMd.headers['cache-control']) && !tLiveMd.headers['x-robots-tag'], tLiveMd.headers)

  // ── 2 · verified gating ──
  head('2 · verified gating — public = entry + plan + features verified')
  const pubTxt = text(live.html), admTxt = text(adAdmin.html)
  const adPub = await page({ status: 'admin', admin: true, search: { view: 'public' } })
  t('public: HatchGrab and Testanbieter A only (B: plan unverified; C: nothing verified)', /Testanbieter A/.test(pubTxt) && !/Testanbieter B|Testanbieter C/.test(pubTxt))
  t('admin view: all three, the unverified ones badged "nicht geprüft · öffentlich verborgen"', /Testanbieter B/.test(admTxt) && /Testanbieter C/.test(admTxt) && /nicht geprüft · öffentlich verborgen/.test(admTxt))
  t('admin "So sieht es öffentlich aus": exactly the public content (no B, no C, no badge)', !/Testanbieter B|Testanbieter C|nicht geprüft · öffentlich/.test(text(adPub.html.replace(/<aside[\s\S]*?<\/aside>/, ''))) && /Testanbieter A/.test(text(adPub.html)))
  const pubJson = JSON.parse(tLiveJson.body)
  t('.md and .json (public): A only', /Testanbieter A/.test(tLiveMd.body) && !/Testanbieter B|Testanbieter C/.test(tLiveMd.body) && pubJson.tools.map(x => x.name).join() === 'HatchGrab,Testanbieter A', pubJson.tools)
  const admJson = JSON.parse((await twin('json', { status: 'admin', admin: true, query: 'view=admin' })).body)
  t('.json (admin, ?view=admin): all three, each unverified one "verified": false', admJson.tools.length === 4 && admJson.tools.filter(x => x.verified === false).map(x => x.name).join() === 'Testanbieter B,Testanbieter C', admJson.tools)
  t('.json: every cell carries its source URL and checked date', pubJson.rows.every(r => r.cells.every(c => typeof c.source === 'string' && /^https:/.test(c.source) && /^\d{4}-\d{2}-\d{2}$/.test(c.checked))), pubJson.rows[0])
  t('fewer than two verified competitors: the "Weitere Anbieter…" note', /data-more-pending/.test(live.html))
  const twoOk = await page({ status: 'live', tables: { comparison_entries: [entry('e1', A, PA, 1), entry('e2', B, PB, 2)], competitor_plans: [plan(PA, A, 'Basis'), plan(PB, B, 'Start')] } })
  t('two verified: both public, and the note is gone', /Testanbieter B/.test(text(twoOk.html)) && !/data-more-pending/.test(twoOk.html))
  const edited = await page({ status: 'live', tables: { competitor_plans: [plan(PA, A, 'Basis', { superseded_at: '2026-10-23T00:00:00Z' }), plan('pa2', A, 'Basis', { monthly_minor: 5900, verified_at: null }), plan(PB, B, 'Start'), plan(PC, C, 'Flat')] } })
  t('an edited plan (superseded, its new version unverified) hides the competitor until the new version is verified', !/Testanbieter A/.test(text(edited.html)))

  // ── 3 · the server HTML ──
  head('3 · the server HTML — table, prices, FAQ')
  t('the table: <caption> naming Deutschland and the date, th scope="col" and scope="row", 14 rows', /<caption>Funktionen und Kosten von Online-Bestellsystemen für Foodtrucks in Deutschland, Stand 22\. Oktober 2026<\/caption>/.test(dec(live.html))
    && /<th scope="col"/.test(live.html) && (live.html.match(/<tr data-row="/g) || []).length === 14, (/<caption>[^<]*/.exec(dec(live.html)) || [])[0])
  t('the table scrolls in its own box (role="region", focusable)', /<div class="cmp-scroll" role="region" aria-labelledby="tabelle" tabindex="0">/.test(live.html))
  t('HatchGrab\'s base fee in the German form: "0 € bis 69 €"', pubTxt.includes('0 € bis 69 €'), (/data-row="baseFee"[\s\S]*?<\/tr>/.exec(live.html) || [])[0])
  t('HatchGrab\'s order fee from fee_bps, plan by plan ("0,99 %", "keine")', /0,99\s%/.test(pubTxt) && /keine \(Unlimited\)/.test(pubTxt), (/data-row="orderFee"[\s\S]*?<\/tr>/.exec(dec(live.html)) || [])[0])
  t('"Ab Pro" where only some plans have a feature (WhatsApp)', /data-row="whatsapp"><th scope="row">Automatische WhatsApp-Antworten<\/th><td class="cmp-us"><span>Ab Pro<\/span>/.test(dec(live.html)), (/data-row="whatsapp"[\s\S]*?<\/tr>/.exec(dec(live.html)) || [])[0])
  t('a competitor\'s cells: Ja / Nein / Nicht angegeben, its price and fee as advertised', /Nicht angegeben/.test(pubTxt) && /49 € pro Monat zzgl\. MwSt\./.test(pubTxt.replace(/ /g, ' ')) && /2,5 % pro Bestellung/.test(pubTxt.replace(/ /g, ' ')))
  t('the costs: one line per HatchGrab plan and per competitor, with source and checked date; the card-fee and VAT sentences',
    /data-costs/.test(live.html) && /Pro: 29\s€ pro Monat/.test(pubTxt) && /geprüft am 2026-10-19/.test(pubTxt) && /Gebühren von S[a-z]+e dazu/.test(pubTxt) && /Reverse-Charge-Verfahren/.test(pubTxt))
  t('the FAQ: seven questions, each in <details> with its answer in the server HTML', (live.html.match(/<details class="cmp-faq"><summary>/g) || []).length === 7 && /Gibt es eine Mindestlaufzeit\?/.test(pubTxt))
  t('the method section is #methodik and links the .md and .json twins', /<section id="methodik"/.test(live.html) && /href="\/de\/vergleich\/foodtruck-bestellsystem\.md"/.test(live.html) && /href="\/de\/vergleich\/foodtruck-bestellsystem\.json"/.test(live.html))
  t('the CTA: the trial months from the plans, "Keine Kreditkarte nötig" and "Monatlich kündbar"', /3 Monate kostenlos testen/.test(pubTxt) && /Keine Kreditkarte nötig · Monatlich kündbar/.test(pubTxt))
  t('the breadcrumb and the byline (which says HatchGrab is one of the tools compared)', /<nav class="cmp-crumbs" aria-label="Brotkrümelnavigation">/.test(live.html) && /Wir sind selbst einer der verglichenen Anbieter/.test(pubTxt) && /href="#methodik"/.test(live.html))

  // ── 4 · app rows ──
  head('4 · the app rows follow the flags')
  const ipadCell = html => text((/<tr data-row="ipad"[\s\S]*?<\/tr>/.exec(html) || [''])[0])
  t('flags off, public: "Nicht in Deutschland"', /iPad-App Nicht in Deutschland/.test(ipadCell(live.html)), ipadCell(live.html))
  t('flags off, admin view: the admin wording', /Flag noch aus/.test(ipadCell(adAdmin.html)), ipadCell(adAdmin.html))
  const appsOn = await page({ status: 'live', apps: true })
  t('flags on: "Ja", and the "passt nicht" box drops the app clause', /^iPad-App Ja/.test(ipadCell(appsOn.html).trim()) && !/in den Stores/.test(text((/<div class="cmp-fit">[\s\S]*?<\/section>/.exec(appsOn.html) || [''])[0])) && /in den Stores/.test(text((/<div class="cmp-fit">[\s\S]*?<\/section>/.exec(live.html) || [''])[0])), ipadCell(appsOn.html))
  t('checklist: the apps item follows the flags', /data-check="apps" data-ok="no"/.test(adAdmin.html) && /data-check="apps" data-ok="yes"/.test((await page({ status: 'admin', apps: true, admin: true })).html))

  // ── 5 · a price change propagates ──
  head('5 · a price change in plan_prices reaches every surface')
  const bumped = { plan_prices: catalog.prices.map(p => (p.countryCode === 'DE' && p.planKey === 'pro' ? { ...p, monthlyMinor: 3400 } : p)).map(LP1E.snake) }
  const pB = await page({ status: 'live', tables: bumped }), mdB = await twin('md', { status: 'live', tables: bumped }), jB = await twin('json', { status: 'live', tables: bumped })
  const faqLd = ld(pB.html)['@graph'].find(n => n['@type'] === 'FAQPage')
  t('the costs and the FAQ on the page say 34 € (and no longer 29 €)', /Pro: 34\s€ pro Monat/.test(text(pB.html)) && !/Pro: 29\s€/.test(text(pB.html)))
  t('the .md and the .json say 34 € (and the .md is fully formatted: no message key, no tag)', !/comparison\.|<link>|<md>/.test(mdB.body) && /Pro: 34\s€ pro Monat/.test(mdB.body) && /Pro: 34\s€ pro Monat/.test(jB.body))
  t('the JSON-LD FAQ answer says 34 €', /Pro: 34\s€ pro Monat/.test(JSON.stringify(faqLd)), JSON.stringify(faqLd).slice(0, 300))

  // ── 6 · JSON-LD ──
  head('6 · JSON-LD — WebPage, BreadcrumbList, FAQPage, ItemList; no Product/Review/Rating')
  const g = ld(live.html)['@graph'] || []
  const types = g.map(n => n['@type'])
  t('the graph holds WebPage, BreadcrumbList, FAQPage, ItemList (with the Organization and WebSite they point at)', ['WebPage', 'BreadcrumbList', 'FAQPage', 'ItemList', 'Organization', 'WebSite'].every(x => types.includes(x)), types)
  const wp = g.find(n => n['@type'] === 'WebPage')
  t('WebPage: datePublished, dateModified (the check date), isPartOf, publisher, about, inLanguage de-DE', wp && wp.datePublished === '2026-10-18' && wp.dateModified === '2026-10-22' && wp.isPartOf && wp.publisher && wp.about && wp.inLanguage === 'de-DE', wp)
  const il = g.find(n => n['@type'] === 'ItemList')
  t('ItemList: name and url only, the public tools', il && il.itemListElement.map(i => i.name).join() === 'HatchGrab,Testanbieter A' && il.itemListElement.every(i => Object.keys(i).every(k => ['@type', 'position', 'name', 'url'].includes(k))), il)
  t('no Product, Review, Rating or AggregateRating anywhere in the page', !/"@type":"(Product|Review|Rating|AggregateRating)"|aggregateRating|reviewRating/.test(dec(live.html)) && !/Product|Review|AggregateRating/.test(JSON.stringify(g.map(n => n['@type']))))

  // ── 7 · the footer link ──
  head('7 · the footer\'s "Vergleich" link')
  const lL = await landing('live'), lA = await landing('admin'), lO = await landing('off'), lUk = await landing('live', 'uk')
  const hasLink = html => /data-footer-comparison="live"[\s\S]*?href="\/de\/vergleich\/foodtruck-bestellsystem"/.test(html)
  t('live: in the /de landing\'s server HTML, headed "Vergleich"', hasLink(lL) && /<p class="foot-col-h">Vergleich<\/p>/.test(lL))
  const noLink = html => !/data-footer-comparison|\/de\/vergleich\//.test(html)
  t('admin: NOT in the server HTML (the browser adds it after /api/auth/me confirms an admin)', noLink(lA))
  t('off: absent', noLink(lO))
  t('only on the country\'s own pages: the /uk landing has no link even while DE is live', noLink(lUk))
  const fAdmin = await req({ status: 'admin' }, () => M.comparisonFooter('DE', 'de-DE'))
  t('admin mode is handed to the footer as mode "admin" (rendered by the client-only AdminOnly)', fAdmin && fAdmin.mode === 'admin' && /<AdminOnly>\{box\}<\/AdminOnly>/.test(read('components/landing/LandingFooter.tsx')) && /fetch\('\/api\/auth\/me'/.test(read('components/landing/AdminOnly.tsx')))

  // ── 8 · checklist, import, data file ──
  head('8 · checklist, the import, the data file')
  const chk = k => (new RegExp(`data-check="${k}" data-ok="(yes|no)"`).exec(adAdmin.html) || [])[1]
  t('checklist: ≥2 verified (no: 1), no placeholder (yes), VAT wording present (yes), Impressum decision recorded (no — empty)', chk('verified') === 'no' && chk('placeholders') === 'yes' && chk('vat') === 'yes' && chk('impressum') === 'no', [chk('verified'), chk('placeholders'), chk('vat'), chk('impressum')])
  t('the placeholder rule catches "[ … ]" and "[...]"', M.PLACEHOLDER.test('Preis [ … ] pro Monat') && M.PLACEHOLDER.test('[... prüfen]') && !M.PLACEHOLDER.test('[Pro]'))
  const data = JSON.parse(read('data/compare-de-1/competitors.json'))
  t('data file: competitors, plans and entries; every plan source research and unverified; every entry unverified', data.competitors.length >= 2 && data.plans.length >= 2 && data.entries.length >= 2
    && data.plans.every(p => p.source === 'research' && p.verified_at === null) && data.entries.every(e => e.verified_at === null) && data.competitors.every(c => c.features_verified_at === null))
  t('data file: every plan and entry points at a competitor in the file; every primary plan exists', data.plans.every(p => data.competitors.some(c => c.id === p.competitor_id)) && data.entries.every(e => data.competitors.some(c => c.id === e.competitor_id) && (!e.primary_plan_id || data.plans.some(p => p.id === e.primary_plan_id))))
  t('data file: GastroSystem left out (not an ordering system); each competitor row has exactly the table\'s columns', !data.competitors.some(c => /gastrosystem/i.test(c.name))
    && data.competitors.every(c => Object.keys(c).sort().join() === ['id', 'name', 'website', 'focus', 'payment_providers', 'pre_orders', 'whatsapp', 'social_posts', 'own_domain', 'ios_app', 'android_app', 'capacity_slots', 'multi_location_schedule', 'kds', 'pay_at_truck', 'payment_methods', 'min_term', 'features_checked_on', 'features_verified_at', 'notes'].sort().join()))
  // The import over an in-memory store (competitor-check-2: lib/data-import/research.ts, run by the nightly workflow —
  // the Admin button is gone): every row checked first; existing competitors matched; a rerun adds nothing.
  t('data file: every row passes the import\'s checks — the five price-hidden plans are status "hidden", not "counted" (the CHECK that failed the button on 25 and 27 Oct)',
    M.researchProblems(data).length === 0 && data.plans.filter(p => p.price_hidden).every(p => p.status === 'hidden' && p.monthly_minor === null) && data.plans.filter(p => p.price_hidden).length === 5, M.researchProblems(data))
  const mem = { competitors: [{ ...comp('live-bt', 'Bestelltheke', { capacity_slots: 'unknown', payment_methods: null }) }], plans: [plan('live-bt-start', 'live-bt', 'Start')], entries: [] }
  const store = {
    async competitors() { return mem.competitors.map(c => ({ ...c })) },
    async plans() { return mem.plans.map(p => ({ ...p })) },
    async entries() { return mem.entries.map(e => ({ ...e })) },
    async insertCompetitor(r) { mem.competitors.push({ lifecycle: 'active', ...r }) },
    async updateCompetitor(id, cols) { Object.assign(mem.competitors.find(x => x.id === id), cols) },
    async insertPlans(rows) { mem.plans.push(...rows) },
    async insertEntries(rows) { mem.entries.push(...rows) },
  }
  const stamp = { today: '2026-10-29', path: 'data/compare-de-1/competitors.json' }
  const r1 = await M.importResearch(store, data, stamp)
  const bt = mem.competitors.find(c => c.name === 'Bestelltheke')
  const btEntry = mem.entries.find(e => e.competitor_id === 'live-bt')
  t('import: new competitors, their plans and every entry, all unverified', r1.entriesAdded === data.entries.length && mem.entries.every(e => e.verified_at === null) && mem.plans.every(p => p.verified_at == null || p.id === 'live-bt-start'), r1)
  t('import: an existing competitor (by name) keeps its id; only its unknown features / empty texts are filled', bt.id === 'live-bt' && bt.capacity_slots === 'yes' && bt.payment_methods !== null && bt.pre_orders === 'yes')
  t('import: a plan the competitor already has (same name, same country) is not duplicated; the entry points at the live row', mem.plans.filter(p => p.competitor_id === 'live-bt' && p.plan_name === 'Start').length === 1 && btEntry.primary_plan_id === 'live-bt-start', btEntry)
  const before = JSON.stringify(mem)
  const r2 = await M.importResearch(store, data, stamp)
  t('import: a second run adds nothing (every competitor, plan and entry is matched)', JSON.stringify(mem) === before && r2.added === 0 && r2.plansAdded === 0 && r2.entriesAdded === 0, r2)

  // ── 9 · global-players-1: group labels and the tills card ──
  head('9 · global players — group labels; the tills card names only verified POS players')
  {
    const tables = F.GLOBAL_TABLES()   // P, R verified POS players (R with its own label), Q an unverified candidate, L local
    const pub = await page({ status: 'live', tables })
    const adm = await page({ status: 'admin', admin: true, tables })
    const groupOf = (html, name) => dec((new RegExp(`data-tool="${name}"[\\s\\S]*?</th>`).exec(html) || [''])[0]).replace(/<[^>]+>/g, '|').split('|').map(x => x.trim()).filter(Boolean).pop()
    t('HTML: under each name its group — HatchGrab and a food-truck tool "Bestellsystem für Foodtrucks", a local tool "Bestellsystem", a POS player "Kassensystem", an override "Kasse mit Online-Shop"',
      groupOf(pub.html, 'HatchGrab') === 'Bestellsystem für Foodtrucks' && groupOf(pub.html, 'Testanbieter A') === 'Bestellsystem für Foodtrucks' && groupOf(pub.html, 'Testlokal L') === 'Bestellsystem'
      && groupOf(pub.html, 'Testkasse P') === 'Kassensystem' && groupOf(pub.html, 'Testkasse R') === 'Kasse mit Online-Shop' && /class="cmp-group"/.test(pub.html),
      ['HatchGrab', 'Testanbieter A', 'Testlokal L', 'Testkasse P', 'Testkasse R'].map(n => groupOf(pub.html, n)))
    const md = (await twin('md', { status: 'live', tables })).body, js = JSON.parse((await twin('json', { status: 'live', tables })).body)
    t('.md: the header cells carry the group ("Testkasse P (Kassensystem)", "Testkasse R (Kasse mit Online-Shop)")', /\| Testkasse P \(Kassensystem\) \|/.test(md) && /Testkasse R \(Kasse mit Online-Shop\)/.test(md) && /HatchGrab \(Bestellsystem für Foodtrucks\)/.test(md), md.split('\n').find(l => /HatchGrab/.test(l) && l.startsWith('|')))
    t('.json: each tool has its group', js.tools.find(x => x.name === 'Testkasse P').group === 'Kassensystem' && js.tools.find(x => x.name === 'Testkasse R').group === 'Kasse mit Online-Shop' && js.tools.find(x => x.name === 'HatchGrab').group === 'Bestellsystem für Foodtrucks', js.tools)
    t('the unverified, still-candidate POS player (Q) is nowhere public — not the page, the .md or the .json', !/Testkasse Q/.test(pub.html) && !/Testkasse Q/.test(md) && !JSON.stringify(js).includes('Testkasse Q'))
    t('…an admin sees it, badged, with its group', /data-tool="Testkasse Q"/.test(adm.html) && groupOf(adm.html, 'Testkasse Q') === 'Kassensystem')
    const card = html => text((/<div class="cmp-fit">[\s\S]*?<\/section>/.exec(html) || [''])[0])
    t('the tills card names the verified POS players in this country and says they are in the table — no fixed example names (SumUp, orderbird …)',
      /Testkasse P und Testkasse R stehen auch in der Tabelle oben/.test(card(pub.html)) && !/orderbird|ready2order|SumUp|Zettle/.test(card(pub.html)), card(pub.html))
    t('…never the unverified one, in either view', !/Testkasse Q/.test(card(pub.html)) && !/Testkasse Q stehen|Testkasse Q steht/.test(card(adm.html)) && /Testkasse P und Testkasse R stehen/.test(card(adm.html)))
    t('…and with no verified POS player, the card names none', !/auch in der Tabelle oben/.test(card(live.html)) && /Kassensysteme kassieren am Fenster und decken die TSE-Pflicht ab\. Ein Bestellsystem ergänzt die Kasse/.test(card(live.html)), card(live.html))
    const one = await page({ status: 'live', tables: { ...tables, comparison_entries: tables.comparison_entries.filter(e => e.id !== 'e6') } })
    t('…one name: "Testkasse P steht auch in der Tabelle oben"', /Testkasse P steht auch in der Tabelle oben/.test(card(one.html)), card(one.html))
    const ldAll = JSON.stringify(ld(pub.html))
    t('still no Product, Review, Rating or AggregateRating markup', !/"@type":"(Product|Review|Rating|AggregateRating)"/.test(ldAll))
    t('English base labels exist (en-GB): Food truck ordering system / Ordering system / Till system', (() => { const en = JSON.parse(read('messages/en-GB.json')); const g = (en.comparison || {}).groups
      return g && g.food_truck === 'Food truck ordering system' && g.nearest_local === 'Ordering system' && g.pos === 'Till system' && /\{names\}/.test(en.comparison.fit.tillsBodyNamed) })())
    t('the migration (NOT RUN) adds focus pos, not_in_countries, deep_checked_in, the outcomes and comparison_entries.group_label', (() => { const m = read('supabase/migrations/20261046_global_players_1.sql')
      return /'pop_up', 'pos'/.test(m) && /not_in_countries text\[\]/.test(m) && /deep_checked_in\s+jsonb/.test(m) && /'in_country', 'not_in_country'/.test(m) && /add column if not exists group_label text/.test(m) })())
  }

  // ── source rules ──
  head('rules in the source')
  const libSrc = read('lib/comparison.ts')
  t('lib/comparison.ts writes no plan, price, allowance or trial (manual §81): no currency amount or plan key literal', !/['"`](payg|pro|unlimited|trial)['"`]/.test(libSrc) && !/\d+\s?(€|EUR|£)/.test(libSrc))
  t('the migration is NOT RUN: 20261042 is present and adds the three country_settings columns, the competitor columns and comparison_entries with RLS and no policies',
    /add column if not exists comparison_status text not null default 'off'/.test(read('supabase/migrations/20261042_compare_de_1.sql')) && /enable row level security/.test(read('supabase/migrations/20261042_compare_de_1.sql')) && !/create policy/i.test(read('supabase/migrations/20261042_compare_de_1.sql')))

  console.log(`\n${fail ? '🔴' : '✅'} compare-de-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
