#!/usr/bin/env node
// scripts/compare-suits-fix-2.cjs — compare-suits-fix-2 (Dominic, 26 Nov 2026; docs/compare-suits-fix-2-report.md): the new "Which system
// suits whom?" guide. Proves, against the real modules and messages (no network, no database):
//   1 · every one of the 96 live countries (docs/compare-suits-fix-2/live-countries.json — locale, payment model, comparison_country_copy
//       row): a fit_off country has NO guide; every shown guide has no TSE, Lieferando, Wolt, Germany (or a translation of it), till /
//       card-machine / card-reader / POS word, or percentage; the payment line follows offersOnlineCardPayments; the collect words follow
//       the row; GB's guide is word for word as approved;
//   2 · the real page and its .md / .json twins on fixtures: GB (live, its row) shows the two lists and the delivery card and no tills card;
//       DE with fit_off (or no row) shows no guide section at all and nothing in the .md twin;
//   3 · the messages: fit.tills*, the old fit.oursNotBody and fit.marketplacesBody are in no locale; the new keys are English only;
//   4 · scope: only the comparison files, the messages and the comparison harnesses changed since BASE.
require('./_harness-tmp.cjs') // tmp-cleanup-1
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'compare-suits-fix-2' })
const REPO = kit.REPO
const LP1E = require('./_lp1e-fixtures.cjs')
const F = require('./_compare-de-1-fixtures.cjs')
const BASE = 'a7f405eb' // the commit before compare-suits-fix-2

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const dec = s => String(s).replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
const text = html => dec(String(html).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/[\s  ]+/g, ' ').trim()

// Words that must never be in a shown guide (Dominic's rules): Germany's till law and delivery apps, Germany in the languages the guide
// was translated into, tills / card machines / card readers / POS, and any percentage (no rates anywhere).
const BANNED = [/\bTSE\b/, /Lieferando/i, /\bWolt\b/i, /German|Deutschland|Allemagne|Alemania|Germania|Duitsland|Tyskland|Niemcy|N[eě]mecko|Németország|Saksa|Alemanha|Γερμανία|ドイツ|德[國国]|ألمانيا|Almanya|Германи|Njemačk|Nemčij|Vokietij|Vācij|Saksamaa/i,
  /\btills?\b/i, /card machine/i, /card reader/i, /\bPOS\b/, /point of sale/i, /cash register/i, /%/]

;(async () => {
  head('1 · every live country — the guide built by lib/comparison.ts buildFit with the real messages')
  const L = await kit.bundle('csf2-lib', [
    "export { buildFit } from '@/lib/comparison'",
    "export { comparisonT } from '@/lib/comparison-server'",
    "export { offersOnlineCardPayments } from '@/lib/country-settings-types'",
    "export { regionNameIn } from '@/lib/region-name'",
  ].join('\n'))
  const LIVE = JSON.parse(read('docs/compare-suits-fix-2/live-countries.json')).countries
  t('the fixture holds the 96 live countries: 19 shown (English locales), 77 hidden', LIVE.length === 96 && LIVE.filter(c => !c.copy.fitOff).length === 19
    && LIVE.every(c => c.copy.fitOff === !/^en-/.test(c.locale)))
  const built = LIVE.map(c => {
    const t2 = L.comparisonT(c.locale)
    // the page's own country name: the region name in the locale; "the" before GB and the US in English (lib/comparison-server.ts)
    let country = L.regionNameIn(c.locale, c.code) ?? c.name
    if (/^en(-|$)/i.test(c.locale) && (c.code === 'GB' || c.code === 'US')) country = `the ${country}`
    const fit = L.buildFit({ settings: { locale: c.locale, paymentModel: c.paymentModel }, country, copy: c.copy, rivals: [] }, t2)
    return { c, fit, country, lines: fit ? [fit.ours, ...fit.suits, fit.mayNot, ...fit.notSuits, fit.delivery.title, fit.delivery.body] : [] }
  })
  const hiddenWithText = built.filter(b => b.c.copy.fitOff && b.fit !== null).map(b => b.c.code)
  t('every fit_off country (77) has NO guide at all', !hiddenWithText.length, hiddenWithText)
  const shownMissing = built.filter(b => !b.c.copy.fitOff && !b.fit).map(b => b.c.code)
  t('every other live country (19) has its guide', !shownMissing.length, shownMissing)
  const banned = built.flatMap(b => b.lines.flatMap(l => BANNED.filter(re => re.test(l)).map(re => `${b.c.code}: ${re} in «${l}»`)))
  t('no shown guide has TSE, Lieferando, Wolt, Germany (or a translation), a till / card-machine / card-reader / POS word, or a percentage', !banned.length, banned)
  const raw = built.flatMap(b => b.lines.filter(l => /^fit\.|\{[a-zA-Z]+\}/.test(l)).map(l => `${b.c.code}: ${l}`))
  t('every shown line is real words (no raw key, no unfilled {placeholder})', !raw.length, raw)
  const payWrong = built.filter(b => b.fit).filter(b => {
    const online = L.offersOnlineCardPayments({ paymentModel: b.c.paymentModel })
    const line = b.fit.notSuits[1]
    return online ? !(line.includes(`pay with ${b.c.copy.payMethodsMissing}:`) && /takes card, Apple Pay and Google Pay online/.test(line))
      : !(line.startsWith('you want customers to pay online when they order:') && line.includes(`in ${b.country} they pay`) && !/Apple Pay/.test(line))
  }).map(b => `${b.c.code} (${b.c.paymentModel}): ${b.fit.notSuits[1]}`)
  t('the payment line follows offersOnlineCardPayments in every shown country (online → the methods line; billed at the truck → the pay-at-the-truck line)', !payWrong.length, payWrong)
  const online = built.filter(b => b.fit && L.offersOnlineCardPayments({ paymentModel: b.c.paymentModel })).map(b => b.c.code).join(' ')
  const atTruck = built.filter(b => b.fit && !L.offersOnlineCardPayments({ paymentModel: b.c.paymentModel })).map(b => b.c.code).join(' ')
  t(`…online: ${online}; at the truck: ${atTruck}`, online === 'AU CA GB GI IE MT NZ SG US' && atTruck === 'GG GU IM IN JE JM MV NG VI ZA', { online, atTruck })
  const wordWrong = built.filter(b => b.fit).filter(b => {
    const pick = b.c.copy.collectWord === 'pickup'
    return pick ? !(b.fit.suits[1].includes('a pickup time') && b.fit.notSuits[0].includes('for pickup only') && b.fit.notSuits[1].includes('when they pick up'))
      : !(b.fit.suits[1].includes('a collection time') && b.fit.notSuits[0].includes('for collection only') && b.fit.notSuits[1].includes('when they collect'))
  }).map(b => b.c.code)
  t('the collect words follow each row (pickup: US AU GU VI; collection: the rest)', !wordWrong.length, wordWrong)
  const appsWrong = built.filter(b => b.fit).filter(b => (b.c.copy.deliveryApps ? !b.fit.delivery.body.startsWith('Apps like ') : !b.fit.delivery.body.startsWith('Delivery apps can'))).map(b => b.c.code)
  t('the delivery card names apps only where the row does (GB, IE); the others say "Delivery apps can …"', !appsWrong.length, appsWrong)
  const gb = built.find(b => b.c.code === 'GB').fit
  t('GB word for word as approved', JSON.stringify(gb) === JSON.stringify({
    ours: 'HatchGrab suits you if …',
    suits: ['you trade in different places during the week', 'you want customers to order ahead and choose a collection time',
      'you want to limit how many orders come in at once, so your kitchen keeps up', "you don't want to sign a contract."],
    mayNot: 'HatchGrab may not suit you if …',
    notSuits: ["you want to deliver to customers' homes: HatchGrab is for collection only.",
      'you want customers to pay with PayPal or Klarna: HatchGrab takes card, Apple Pay and Google Pay online, or customers pay when they collect.'],
    rivals: [],
    delivery: { title: 'Delivery apps', body: 'Apps like Deliveroo, Uber Eats and Just Eat can bring you new customers, but they take a cut of every order, including from regulars who could simply order ahead with you.' },
  }), gb)
  const gu = built.find(b => b.c.code === 'GU').fit
  t('GU (billed at the truck, en-US): «you want customers to pay online when they order: in Guam they pay when they pick up.»', gu.notSuits[1] === 'you want customers to pay online when they order: in Guam they pay when they pick up.', gu.notSuits)
  t('a country with NO row: shown in an English locale (defaults: collection, "PayPal", no apps), hidden in any other',
    !!L.buildFit({ settings: { locale: 'en-NZ', paymentModel: 'fee_from_payment' }, country: 'New Zealand', copy: null, rivals: [] }, L.comparisonT('en-NZ'))?.notSuits[1].includes('pay with PayPal:')
    && L.buildFit({ settings: { locale: 'de-DE', paymentModel: 'fee_from_payment' }, country: 'Deutschland', copy: null, rivals: [] }, L.comparisonT('de-DE')) === null)

  head('2 · the real page and its twins on fixtures: GB shown, DE hidden')
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const ctx = LP1E.context(kit, REPO)
  const EF = require('./_europe-settings-fixtures.cjs')
  const catalog = EF.CATALOG()
  const planTables = { plans: catalog.plans.map(LP1E.snake), plan_prices: catalog.prices.map(LP1E.snake), plan_features: catalog.features.map(LP1E.snake) }
  const M = await ctx.bundle('csf2-page', [
    "export { default, generateMetadata } from '@/app/(public)/[country]/[section]/[slug]/page'",
    "export { GET as twinGET } from '@/app/api/compare/[country]/[section]/[slug]/[format]/route'",
    "export { clearPlanCatalogCache as __p } from '@/lib/plans-server'",
    "export { clearComparisonCache as __cmp } from '@/lib/comparison-flags'",
  ].join('\n'), { stubs: { '@/lib/auth/admin': "export async function adminUser() { return null }\nexport async function verifyAdmin() { return false }" } })
  const rows = EF.rowsWith(['DE', 'GB']).map(r => (r.countryCode === 'DE' || r.countryCode === 'GB') ? { ...r, comparisonStatus: 'live', iosAppAvailable: true, androidAppAvailable: true } : { ...r, comparisonStatus: 'off' })
  const COPY_GB = { country_code: 'GB', fit_off: false, delivery_apps: ['Deliveroo', 'Uber Eats', 'Just Eat'], pay_methods_missing: 'PayPal or Klarna', collect_word: 'collection' }
  const render = async (seg, copyRows) => ctx.withReq({ rows, tables: { ...planTables, ...F.CMP_TABLES(), comparison_country_copy: copyRows } }, async () => {
    M.__p(); M.__cmp()
    const args = { params: Promise.resolve(seg), searchParams: Promise.resolve({}) }
    let html = null; try { html = await ctx.prerender(kit.h(M.default, args)) } catch (e) { html = `ERROR ${e.message}` }
    const r = await M.twinGET(new NextRequest(`http://hatchgrab.localhost:3000/${seg.country}/${seg.section}/${seg.slug}.md`, { headers: { host: 'hatchgrab.localhost:3000' } }), { params: Promise.resolve({ ...seg, format: 'md' }) })
    const j = await M.twinGET(new NextRequest(`http://hatchgrab.localhost:3000/${seg.country}/${seg.section}/${seg.slug}.json`, { headers: { host: 'hatchgrab.localhost:3000' } }), { params: Promise.resolve({ ...seg, format: 'json' }) })
    return { html, md: r.status === 200 ? await r.text() : `status ${r.status}`, json: j.status === 200 ? await j.text() : `status ${j.status}` }
  })
  const GB_SEG = { country: 'uk', section: 'comparison', slug: 'food-truck-ordering-system' }, DE_SEG = { country: 'de', section: 'vergleich', slug: 'foodtruck-bestellsystem' }
  const gbP = await render(GB_SEG, [COPY_GB])
  const sec = html => (/<section aria-labelledby="passt"[\s\S]*?<\/section>/.exec(html) || [''])[0]
  const gbSec = sec(gbP.html)
  t('GB page: the guide section with two lists (✓ suits / ⓘ may not suit) and the "Delivery apps" card below', /data-fit="suits"/.test(gbSec) && /data-fit="not"/.test(gbSec) && /data-fit="delivery"/.test(gbSec)
    && (gbSec.match(/<li>/g) || []).length === 6 && /cmp-fit-ic cmp-v-yes/.test(gbSec) && /cmp-fit-ic cmp-fit-ic-info/.test(gbSec) && /cmp-card cmp-fit-wide/.test(gbSec), text(gbSec))
  t('GB page: the approved words, and no tills card', text(gbSec).includes('you want to limit how many orders come in at once, so your kitchen keeps up')
    && text(gbSec).includes('Apps like Deliveroo, Uber Eats and Just Eat can bring you new customers') && !/Tills and card machines|TSE|Lieferando|Wolt|Germany/.test(text(gbSec)), text(gbSec))
  const mdGuide = md => { const i = md.indexOf('## Which system suits whom?'); if (i < 0) return ''; const j = md.indexOf('\n## ', i + 5); return md.slice(i, j < 0 ? undefined : j) }
  const gbMd = mdGuide(gbP.md)
  t('GB .md twin: the same guide (lists and the delivery card), no tills card', /- you trade in different places during the week/.test(gbMd)
    && /\*\*Delivery apps:\*\* Apps like Deliveroo, Uber Eats and Just Eat can bring you new customers/.test(gbMd) && !BANNED.some(re => re.test(gbMd)), gbMd)
  const deOff = await render(DE_SEG, [{ country_code: 'DE', fit_off: true, delivery_apps: null, pay_methods_missing: null, collect_word: null }])
  t('DE with fit_off: no guide section on the page, the rest of the page there', !sec(deOff.html) && !/id="passt"/.test(deOff.html) && /data-costs/.test(deOff.html) && /<section id="methodik"/.test(deOff.html))
  const deTitle = JSON.parse(read('messages/de-DE.json')).comparison.fit.title
  t(`DE with fit_off: nothing of the guide in the .md twin (no "${deTitle}" heading, no guide lines) and none in the .json`, !deOff.md.includes(`## ${deTitle}`) && /## /.test(deOff.md)
    && !/Kassensysteme kassieren|Uber Eats|Lieferdienste|Lieferplattformen/.test(deOff.md) && !deOff.json.includes(deTitle) && !/Uber Eats/.test(deOff.json), deOff.md.slice(0, 300))
  const deNoRow = await render(DE_SEG, [])
  t('DE with no row (a non-English country before its row exists): no guide either', !sec(deNoRow.html) && !deNoRow.md.includes(`## ${deTitle}`))

  head('3 · the messages')
  const files = fs.readdirSync(path.join(REPO, 'messages')).filter(f => /\.json$/.test(f))
  const old = files.filter(f => { const fit = JSON.parse(read(`messages/${f}`)).comparison?.fit ?? {}; return ['tills', 'tillsBody', 'tillsBodyNamed', 'oursNotBody', 'marketplacesBody'].some(k => k in fit) })
  t(`fit.tills, fit.tillsBody, fit.tillsBodyNamed, the old fit.oursNotBody and fit.marketplacesBody are in none of the ${files.length} message files`, !old.length, old)
  const NEWKEYS = ['mayNot', 'suits', 'notSuit', 'collect', 'collectVerb', 'deliveryTitle', 'deliveryNamed', 'deliveryNone']
  const nonEn = files.filter(f => !/^en-/.test(f)).filter(f => { const fit = JSON.parse(read(`messages/${f}`)).comparison?.fit ?? {}; return NEWKEYS.some(k => k in fit) })
  t('the new guide keys are English only (en-GB, inherited by every English locale); no other language has new text', !nonEn.length && NEWKEYS.every(k => k in JSON.parse(read('messages/en-GB.json')).comparison.fit), nonEn)
  t('the generated namespace files match the messages (scripts/split-messages.cjs --check)', (() => { try { execSync('node scripts/split-messages.cjs --check', { cwd: REPO, stdio: 'pipe' }); return true } catch { return false } })())

  head('4 · scope')
  const changed = execSync(`git diff --name-only ${BASE} -- lib app components`, { cwd: REPO, encoding: 'utf8' }).split('\n').filter(Boolean)
  const allowed = ['lib/comparison.ts', 'lib/comparison-server.ts', 'app/(public)/[country]/[section]/[slug]/page.tsx', 'app/(public)/[country]/[section]/[slug]/comparison.css']
  t(`only the comparison code changed in lib/, app/ and components/ (${allowed.join(', ')})`, changed.every(f => allowed.includes(f)), changed)
  t('no landing-page file changed', !changed.some(f => /\[country\]\/page\.tsx$|components\/landing\//.test(f)))

  console.log(`\n${fail ? '🔴' : '✓'} compare-suits-fix-2: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
