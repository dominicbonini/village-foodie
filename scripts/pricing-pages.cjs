#!/usr/bin/env node
// scripts/pricing-pages.cjs — THE PROOF FOR pricing-pages, STAGE B OF THE NEW PRICING (docs/pricing-pages-report.md).
//
//   node scripts/pricing-pages.cjs        (≈ 2–3 min: esbuild bundles, one headless Chrome for the 375px check;
//                                          NO NETWORK, NO DATABASE)
//
// LOCALHOST ONLY. The plan catalogue is the three migrations' own seed (scripts/_plans-catalog-fixture.cjs parses
// 20261024_plans.sql and applies 20261025_plan_features.sql and 20261026_pricing_pages.sql on top); country_settings is
// the seed migrations' (scripts/_country-settings-gb.cjs). Pages, the PDF and Billing render on the render kit's
// in-memory database. Nothing live is read or written.
//
//   1  DATA — the catalogue the migrations produce: payg 0.99%, pro £4,000 included, £29 / £69, 3-month trial, payg
//      event_types off, Pro highlighted, the subtitles; an unknown plan_features row is ignored, logged and listed
//   2  LANDING (GB) — the mockup: banner, three cards in order, badge, fee sentences by shape, bullets, buttons, the
//      cheapest bar (2,900 / 8,000), the footnote
//   3  /features (GB) — h1, lede, callout, one table (WHAT YOU PAY + three groups, every row), footnote
//   4  /compare — the cheapest plan for the volume, from data; the trial as the free-months default; no plan in code
//   5  THE PLANS PDF — the same content (GB); US switched on → $ and en-US words; switched off → masked (TBD)
//   6  MANAGE — Billing's table is the /features table with the effective plan highlighted; the trial popup; Billing's
//      "not started" text; the van modal sentence; the first-load error
//   7  FIXTURE CHANGES — a price, a fee, an allowance, the trial length and a switch change every surface; a FOURTH
//      public plan appears everywhere
//   8  US — switched ON: $ prices and en-US wording on every marketing surface; switched OFF: the existing masking
//   9  payg event_types refused with the "included on Pro" prompt; private events allowed
//  10  NO PLAN IN CODE (grep) and the legacy check
//  11  375px — no horizontal scroll (headless Chrome on the rendered HTML with the real stylesheets)
//  12  SEO — every page's title / description / canonical / hreflang / robots / og / JSON-LD equals BEFORE except the
//      /features description (the one listed change)
//      ⚠️ RE-PINNED (seo-fixes, 20 October 2026): two more listed changes — the landing JSON-LD (one @graph block:
//      Organization, WebSite, SoftwareApplication with its own url + offers; seo-fixes M5/S9) and the /compare country
//      pages' title / description and their og / twitter copies (seo-fixes N1). Everything else still equals BEFORE.
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { spawnSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'pricing-pages' })
const { REPO, h } = kit
const LP1E = require('./_lp1e-fixtures.cjs')
const { seedCatalog } = require('./_plans-catalog-fixture.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const text = s => String(s).replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').replace(/ ([.,])(?=\s|$)/g, '$1').trim()
const count = (s, sub) => String(s).split(sub).length - 1
const inOrder = (s, parts) => { let i = 0; for (const p of parts) { const j = String(s).indexOf(p, i); if (j < 0) return false; i = j + p.length } return true }

// The card-fee footnote (pricing.footnote). It names the card processor, a word scripts/run-harnesses.cjs refuses in a
// harness file, so the processor's name is matched as a word, not written.
const FOOTNOTE_GB = /\* Plus \w+’s card processing on online card orders \(currently 1\.5% \+ 20p in the UK\), paid to \w+, not HatchGrab\. Walk-up orders use your own card reader — HatchGrab charges 0%\./
const FOOTNOTE_ANY = /\* Plus \w+’s card processing on online card orders \(currently /
const CATALOG = seedCatalog(REPO)
const clone = c => JSON.parse(JSON.stringify(c))
const tablesOf = (cat = CATALOG) => ({ plans: cat.plans.map(snake), plan_prices: cat.prices.map(snake), plan_features: cat.features.map(snake) })
const price = (cat, key, cc) => cat.prices.find(p => p.planKey === key && p.countryCode === cc)
/** A fourth PUBLIC plan between Pro and Unlimited, priced in GB and US. */
const withFourth = () => {
  const c = clone(CATALOG)
  const pro = c.plans.find(p => p.key === 'pro')
  for (const p of c.plans) if (p.sortOrder > pro.sortOrder) p.sortOrder += 1
  c.plans.push({ ...pro, key: 'growth', name: 'Growth', description: 'Fixture plan.', sortOrder: pro.sortOrder + 1, isHighlighted: false, subtitle: 'Fixture subtitle' })
  c.plans.sort((a, b) => a.sortOrder - b.sortOrder)
  for (const cc of ['GB', 'US']) c.prices.push({ planKey: 'growth', countryCode: cc, monthlyMinor: 4900, includedOnlineMinor: 1000000, feeBps: 50, extraVanMonthlyMinor: 4900 })
  return c
}

;(async () => {
  const ctx = LP1E.context(kit, REPO)
  const ROUTE = { landing: 'app/[country]/page', features: 'app/[country]/features/page', compare: 'app/[country]/compare/page' }
  const mods = {}
  const modOf = p => (mods[p] ||= ctx.bundle(`pp-${p}`, `export * from '@/${ROUTE[p]}'\nexport { default } from '@/${ROUTE[p]}'\nexport { clearPlanCatalogCache as __ppClearPlans } from '@/lib/plans-server'`))
  const slug = cc => (cc === 'GB' ? 'uk' : 'us')
  /** A marketing page's full HTML for `cc`, on catalogue `cat`, with the US switched on or off. */
  async function page(p, cc, { cat = CATALOG, usOn = cc === 'US' } = {}) {
    const M = await modOf(p)
    return ctx.withReq({ rows: usOn ? ctx.ROWS.on() : ctx.ROWS.off(), tables: tablesOf(cat) }, async () => {
      M.__ppClearPlans()
      return ctx.prerender(h(M.default, { params: Promise.resolve({ country: slug(cc) }), searchParams: Promise.resolve({}) }))
    })
  }
  const PDF = await ctx.bundle('pp-pdf', "export { generatePlansPdf, buildPlansPdfHtml } from '@/lib/plans-pdf'\nexport { clearPlanCatalogCache as __ppClearPlans } from '@/lib/plans-server'")
  async function pdf(cc, { cat = CATALOG, usOn = cc === 'US' } = {}) {
    return ctx.withReq({ rows: usOn ? ctx.ROWS.on() : ctx.ROWS.off(), tables: tablesOf(cat) }, async () => {
      PDF.__ppClearPlans(); globalThis.__pdfRec = {}
      await PDF.generatePlansPdf(cc)
      return globalThis.__pdfRec.html
    })
  }

  // ══ 1 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · DATA — the catalogue the three migrations produce')
  for (const cc of ['GB', 'US']) {
    t(`${cc}: Pay as you go 0 / month, nothing included, fee 99 bps (0.99%)`, JSON.stringify(price(CATALOG, 'payg', cc)) === JSON.stringify({ planKey: 'payg', countryCode: cc, monthlyMinor: 0, includedOnlineMinor: 0, feeBps: 99, extraVanMonthlyMinor: 0 }), price(CATALOG, 'payg', cc))
    t(`${cc}: Pro 2900 / month, 400000 included, 99 bps`, (p => p.monthlyMinor === 2900 && p.includedOnlineMinor === 400000 && p.feeBps === 99)(price(CATALOG, 'pro', cc)))
    t(`${cc}: Unlimited unchanged — 6900, NULL (unlimited), 0`, (p => p.monthlyMinor === 6900 && p.includedOnlineMinor === null && p.feeBps === 0)(price(CATALOG, 'unlimited', cc)))
  }
  t('the trial is 3 months', CATALOG.plans.find(p => p.key === 'trial').trialMonths === 3)
  t('payg: event_types switched OFF (with WhatsApp, social media, Messenger & Instagram); no private_events row anywhere',
    JSON.stringify(CATALOG.features.filter(f => f.planKey === 'payg').map(f => f.feature).sort()) === JSON.stringify(['event_types', 'instagram_messenger_replies', 'schedule_graphics', 'whatsapp_replies'])
    && !CATALOG.features.some(f => f.feature === 'private_events'))
  t('exactly one highlighted plan: Pro', JSON.stringify(CATALOG.plans.filter(p => p.isHighlighted).map(p => p.key)) === '["pro"]')
  t('subtitles: payg / pro / unlimited', ['payg:Seasonal & part-time traders', 'pro:Trucks taking regular pre-orders', 'unlimited:Busy trucks & festivals'].every(s => { const [k, v] = s.split(':'); return CATALOG.plans.find(p => p.key === k).subtitle === v }))
  const mig = read('supabase/migrations/20261026_pricing_pages.sql')
  t('the migration adds the unique highlighted index and the public-and-active check', /create unique index if not exists plans_one_highlighted on public\.plans \(\(true\)\) where is_highlighted/.test(mig) && /check \(not is_highlighted or \(is_public and active\)\)/.test(mig))
  const L = await kit.bundle('pp-lib', [
    "export * from '@/lib/plans'", "export * from '@/lib/plan-offer'",
    "export { readPlanCatalog, clearPlanCatalogCache } from '@/lib/plans-server'",
    "export { featureRefusal } from '@/lib/plan-refusal'",
  ].join('\n'))
  {
    const warns = []; const ow = console.warn; console.warn = (...a) => warns.push(a.join(' '))
    let cat = null, err = null
    try {
      const db = kit.fakeDb({ ...tablesOf(), plan_features: [...tablesOf().plan_features, { plan_key: 'pro', feature: 'teleportation', enabled: false }] })
      cat = await L.readPlanCatalog(db)
    } catch (e) { err = e } finally { console.warn = ow }
    t('an UNKNOWN plan_features row does not break the catalogue: it is ignored…', !err && cat && !cat.features.some(f => f.feature === 'teleportation'), String(err && err.message))
    t('…kept in `ignoredFeatures` for Admin\'s plans table…', cat && JSON.stringify(cat.ignoredFeatures) === JSON.stringify([{ planKey: 'pro', feature: 'teleportation', enabled: false }]), cat && cat.ignoredFeatures)
    t('…and logged', warns.some(w => /\[plans\] plan_features row ignored/.test(w) && /teleportation/.test(w)), warns)
    t('Admin\'s plans table shows the ignored rows as a warning', /plans\.ignoredFeatures\?\.length \?\? 0\) > 0/.test(read('app/admin/page.tsx')) && /Ignored plan_features rows/.test(read('app/admin/page.tsx')))
  }

  // ══ 2 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · LANDING (GB) — the approved mockup, from the data')
  const landGB = await page('landing', 'GB')
  const lt = text(landGB)
  const pricingHtml = landGB.slice(landGB.indexOf('id="pricing"'), landGB.indexOf('</section>', landGB.indexOf('id="pricing"')))
  const pt = text(pricingHtml)
  t('renders', typeof landGB === 'string' && landGB.length > 5000 && pricingHtml.length > 1000, String(landGB).slice(0, 300))
  t('banner: "Your first 3 months are completely free — every feature unlocked."', pt.includes('Your first 3 months are completely free — every feature unlocked.'), pt.slice(0, 400))
  t('banner body: Pay at Hatch, moving to Pay as you go with no monthly fee, "No card to start, no contract, cancel anytime."',
    pt.includes('With Pay at Hatch, customers order ahead and pay when they collect') && pt.includes('When your trial ends you move to Pay as you go — no monthly fee — unless you choose a plan. No card to start, no contract, cancel anytime.'))
  t('three cards in sort_order: Pay as you go, Pro, Unlimited — each with its subtitle', inOrder(pt, ['Pay as you go', 'Seasonal & part-time traders', 'Pro', 'Trucks taking regular pre-orders', 'Unlimited', 'Busy trucks & festivals']))
  t('prices: £0, £29, £69 "per truck / month"', inOrder(pt, ['£0 per truck / month', '£29 per truck / month', '£69 per truck / month']))
  t('one "Most trucks" badge (CSS capitals), on the Pro card, which is the orange-button card',
    count(pricingHtml, 'class="plan-tag"') === 1 && /class="plan hero-plan">\s*<span class="plan-tag">Most trucks<\/span><div class="plan-name">Pro</.test(pricingHtml.replace(/<!-- -->/g, '')) && count(pricingHtml, 'btn btn-primary') === 1)
  t('fee sentence by SHAPE — payg: "0.99%* on online card orders only. Walk-up orders are always free."', pt.includes('0.99%* on online card orders only. Walk-up orders are always free.'))
  t('pro: "First £4,000 of online orders included each month, then 0.99%*. Walk-up orders are always free."', pt.includes('First £4,000 of online orders included each month, then 0.99%*. Walk-up orders are always free.'), pt.match(/First.{0,140}/))
  t('unlimited: "No HatchGrab fees on online orders, however busy you get. One predictable monthly cost."', pt.includes('No HatchGrab fees on online orders, however busy you get. One predictable monthly cost.'))
  t('first card: "Everything to run a service" + the 7 bullets + "See every feature →" to /features (no multi-staff logins)',
    inOrder(pt, ['Everything to run a service', 'Walk-up orders & kitchen screen', 'Online ordering', 'Pre-orders & collection times', 'Kitchen capacity management', 'Private events', 'Kitchen ticket printing', 'iPhone, iPad and Android kitchen app', 'See every feature →'])
    && !/staff|login/i.test(pt) && /<p class="plan-more"><a href="\/uk\/features">/.test(pricingHtml))
  // Dominic, 20 October 2026: no Messenger & Instagram sub-line and no "£4,000 … with no HatchGrab fee" bullet on the Pro
  // card (the fee line under the price already says it); the social media bullet names Facebook and Instagram.
  {
    const proCard = pt.slice(pt.indexOf('Everything in Pay as you go, plus'), pt.indexOf('Everything in Pro, plus')).trim()
    t('Pro card: exactly "Everything in Pay as you go, plus" WhatsApp auto-replies · Social media posts — your Facebook and Instagram schedule — ready to post · Custom event types & pricing · Try free',
      proCard === 'Everything in Pay as you go, plus WhatsApp auto-replies Social media posts — your Facebook and Instagram schedule — ready to post Custom event types & pricing Try free Unlimited Busy trucks & festivals £69 per truck / month No HatchGrab fees on online orders, however busy you get. One predictable monthly cost.', proCard)
    t('…no Messenger & Instagram line and no "of online orders a month with no HatchGrab fee" bullet anywhere in the cards', !/Messenger|no HatchGrab fee/.test(pt.slice(0, pt.indexOf('Which plan'))) && !pricingHtml.includes('li-sub'))
  }
  t('Unlimited card: "Everything in Pro, plus" "Unlimited online orders, 0% HatchGrab fee", "Same price in your busiest month" (no feature it adds)',
    inOrder(pt, ['Everything in Pro, plus', 'Unlimited online orders, 0% HatchGrab fee', 'Same price in your busiest month']))
  t('every card\'s button reads "Try free" (3)', count(pt, 'Try free') === 3)
  // ⚠️ RE-PINNED (landing-mobile-tidy, 21 October 2026): the approved wording — "Your online orders each month" under the
  // heading, and the first band without "of online orders a month".
  t('the cheapest bar: "Your online orders each month" · "Under £2,900 → Pay as you go · £2,900 – £8,000 → Pro · Over £8,000 → Unlimited"',
    pt.includes('Which plan is cheapest for me? Your online orders each month Under £2,900 → Pay as you go £2,900 – £8,000 → Pro Over £8,000 → Unlimited'), pt.slice(pt.indexOf('Which plan'), pt.indexOf('Which plan') + 200))
  t('the footnote: "* Plus <processor>’s card processing … (currently 1.5% + 20p in the UK), paid to <processor>, not HatchGrab. Walk-up orders use your own card reader — HatchGrab charges 0%."',
    FOOTNOTE_GB.test(pt))
  t('the old copy is gone: no Starter / Max, no "first month", no "Compare all features" button', !/\bStarter\b|\bMax\b|first month|Compare all features/.test(pt))

  // ══ 3 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · /features (GB) — the approved mockup, from the data')
  const featGB = await page('features', 'GB')
  const ft = text(featGB.slice(featGB.indexOf('<section class="band features-page"'), featGB.indexOf('<footer')))
  t('renders', featGB.length > 3000 && ft.length > 500, featGB.slice(0, 300))
  t('h1 "Everything to run your service, on every plan."', /<h1>Everything to run your service, on every plan\.<\/h1>/.test(featGB))
  t('lede: "… kitchen screen are included on every plan. Pro and Unlimited add WhatsApp, social media and custom event pricing, and lower fees."',
    ft.includes('Ordering, pre-orders, capacity and the kitchen screen are included on every plan. Pro and Unlimited add WhatsApp, social media and custom event pricing, and lower fees.'), ft.slice(0, 300))
  // ⚠️ RE-PINNED (landing-mobile-tidy, 21 October 2026, Dominic): the trial callout is REMOVED from /features.
  t('no trial callout ("3 months free with every feature unlocked…" is gone; the landing banner keeps the trial)', !/months? free with every feature unlocked|features-callout/.test(ft + featGB))
  // ⚠️ RE-PINNED (features-page-restore, 20 October 2026): /features renders the table's "features" variant (the pre-Stage-B look:
  // `pt pt-features`, a `.pt-name` + `.pt-desc` per row) and its footnotes in the old `.fn` block; Billing keeps `pt pt-card`.
  const tbl = featGB.slice(featGB.indexOf('class="pt pt-features"'), featGB.indexOf('class="fn"'))
  const tt = text(tbl)
  const tblNames = text(tbl.replace(/<span class="pt-desc">.*?<\/span>/g, ''))   // the table without its descriptions
  t('ONE table, columns = the public plans with "{price} / month"', count(featGB, 'class="pt pt-features"') === 1 && !featGB.includes('pt-card') && inOrder(tt, ['Pay as you go £0 / month', 'Pro £29 / month', 'Unlimited £69 / month']))
  t('the highlighted column is Pro (the data flag)', /<div class="pt-col pt-hl" role="columnheader"><span class="pt-col-name">Pro</.test(tbl) && count(tbl, 'pt-col pt-hl') === 1)
  // Dominic, 20 October 2026: no "Pay at Hatch orders" money row and no "Online ordering — Pay at Hatch" feature row.
  t('WHAT YOU PAY: included — / £4,000 / Unlimited; fee 0.99% / 0.99% above £4,000 / 0%; Walk-up Free ×3 (no Pay at Hatch row)',
    tblNames.includes('What you pay Online orders included each month — £4,000 Unlimited HatchGrab fee on online card orders* 0.99% 0.99% above £4,000 0% Walk-up orders Free Free Free Run your service') && !/Pay at Hatch/.test(tblNames), tblNames.slice(0, 400))
  t('three groups in order: Run your service, Online orders, Marketing & automation', inOrder(tt, ['Run your service', 'Online orders', 'Marketing & automation']))
  const rowsIn = count(tbl, 'role="rowheader"')
  t('every feature row (32) + 3 money rows + 4 group rows', rowsIn === 32 + 3 + 4, rowsIn)
  // ⚠️ pricing-tidy (20 October 2026): two disclosures restored — markers on the rows, footnotes under the card-fee one.
  // ⚠️ RE-PINNED (compare-tidy F1, 20 October 2026): the markers follow ROW POSITION — Kitchen ticket printing (Run your
  // service) ¹, WhatsApp auto-replies (Marketing) ², and the footnotes in that order.
  t('"Kitchen ticket printing" carries marker ¹ and "WhatsApp auto-replies" marker ² — numbered by table position (and no other row a marker)',
    /<span>Kitchen ticket printing<sup class="pt-sup">1<\/sup><\/span>/.test(tbl) && /<span>WhatsApp auto-replies<sup class="pt-sup">2<\/sup><\/span>/.test(tbl) && count(tbl, 'class="pt-sup"') === 2)
  t('/features footnotes, in order, same style as the card-fee one: *, ¹ printing, ² WhatsApp',
    inOrder(text(featGB), ['* Plus', '1 Kitchen ticket printing needs a compatible Bluetooth or wired printer (not supplied).', '2 WhatsApp auto-replies need a WhatsApp Business account. Meta may charge for some messages; replies are generated automatically.'])
      && (() => { const fn = featGB.slice(featGB.indexOf('<div class="fn">')); return count(fn.slice(0, fn.indexOf('</div>')), '<p>') === 3 })())   // ⚠️ RE-PINNED (features-page-restore, 20 October 2026): the three footnotes are the old `.fn` block's three <p>
  {
    const heads = [...tbl.matchAll(/role="rowheader">(.*?)<\/div>/g)].map(m => text(m[1].replace(/<span class="pt-desc">.*?<\/span>/, '')))   // ⚠️ RE-PINNED (features-page-restore, 20 October 2026): the name only
    const online = heads.slice(heads.indexOf('Online orders') + 1, heads.indexOf('Marketing & automation'))
    t('"Custom event types & pricing" is the LAST row of Online orders', online[online.length - 1] === 'Custom event types & pricing', online)
  }
  // pricing-tidy: a row with a note renders <span>Name<sup class="pt-sup">n</sup></span> — matched either way.
  // ⚠️ RE-PINNED (features-page-restore, 20 October 2026): a row's name is `<span class="pt-name">Name</span>` (+ its description).
  const rowOf = name => { let i = tbl.indexOf(`<span class="pt-name">${name}</span>`); if (i < 0) i = tbl.indexOf(`<span>${name}<sup class="pt-sup">`); return i < 0 ? '' : tbl.slice(i, tbl.indexOf('role="row"', i + 1)) }
  const cells = r => [...r.matchAll(/role="cell">(.*?)<\/div>/g)].map(m => (/pt-yes/.test(m[1]) ? '✓' : /pt-no/.test(m[1]) ? '—' : /pt-soon/.test(m[1]) ? 'soon' : m[1]))
  const pe = cells(rowOf('Private events')), et = cells(rowOf('Custom event types &amp; pricing'))
  t('Private events: ✓ on every plan; Custom event types & pricing: — / ✓ / ✓ (separate rows)', JSON.stringify(pe) === '["✓","✓","✓"]' && JSON.stringify(et) === '["—","✓","✓"]', { pe, et })
  t('Multi-staff logins row is there, ✓ ×3', JSON.stringify(cells(rowOf('Multi-user access'))) === '["✓","✓","✓"]' || /Multi/.test(tt), tt.match(/Multi[^✓]*/))
  t('WhatsApp auto-replies: — on payg, Coming soon/✓ on the rest; SMS / loyalty "Coming soon" everywhere (the existing states)',
    cells(rowOf('WhatsApp auto-replies'))[0] === '—' && JSON.stringify(cells(rowOf('SMS order alerts'))) === '["soon","soon","soon"]', { wa: cells(rowOf('WhatsApp auto-replies')), sms: cells(rowOf('SMS order alerts')) })
  t('the same footnote as the landing', FOOTNOTE_GB.test(text(featGB)))
  // ── features-page-restore (20 October 2026): the old page's look and descriptions, on the new table ──
  {
    const msgs = JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-GB.json'), 'utf8')).featuresPage
    const usMsgs = JSON.parse(fs.readFileSync(path.join(REPO, 'messages/en-US.json'), 'utf8')).featuresPage
    const FT = (await ctx.bundle('pp-ft', "export { FEATURE_TABLE } from '@/lib/feature-table'")).FEATURE_TABLE
    t('restore: the old eyebrow "Compare" above the one h1', /<section class="band features-page"><div class="wrap"><p class="eyebrow">Compare<\/p><h1>Everything to run your service, on every plan\.<\/h1>/.test(featGB) && count(featGB, '<h1') === 1)
    const descs = [...tbl.matchAll(/<span class="pt-desc">(.*?)<\/span>/g)].map(m => text(m[1]))
    t('restore: every capability row (32) has its description, in table order, from featuresPage.detail; the money rows have none',
      descs.length === 32 && FT.length === 32 && JSON.stringify(descs) === JSON.stringify(FT.map(r => text(msgs.detail[r.id]))), { n: descs.length, first: descs.slice(0, 2) })
    const PLANISH = /\b(Starter|Max|Pro|Unlimited|Pay as you go|trial|plan|plans|tier)\b|[0-9£$€%]|first month|allowance|\bfee\b/i
    const bad = [...Object.entries(msgs.detail), ...Object.entries(usMsgs.detail)].filter(([, v]) => PLANISH.test(v))
    t('restore: no description names a plan, a number, a price, an allowance or a fee (en-GB and en-US)', bad.length === 0 && Object.keys(msgs.detail).length === 32, bad)
    t('restore: the old cell glyphs — a text ✓ (no drawn tick), the faint —, an italic "Coming soon"', tbl.includes('<span class="pt-yes" aria-label="Included">✓</span>') && !tbl.includes('<svg') && tbl.includes('class="pt-soon"'))
    const featUS = await page('features', 'US')
    t('restore: US — the en-US descriptions ("grays out", "pickup time slot", "inquiries")', /grays out for customers right away/.test(featUS) && /Customers choose a pickup time slot/.test(featUS) && /WhatsApp inquiries/.test(featUS) && !/greys out/.test(featUS))
  }

  // ══ 4 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · /compare — the cheapest plan for the volume, from data')
  const offers = L.offerPlans(CATALOG, 'GB')
  const at = minor => L.cheapestAt(offers, minor).plan.key
  t('cheapest at £2,000 → payg; £2,800 → payg; £3,000 → pro; £7,900 → pro; £8,100 → unlimited', at(200000) === 'payg' && at(280000) === 'payg' && at(300000) === 'pro' && at(790000) === 'pro' && at(810000) === 'unlimited')
  t('the bands solved from the prices: 2,900 / 8,000 (GB) — and 2,900 / 9,000 with the old £5,000 allowance', JSON.stringify(L.cheapestBands(offers, 'GBP').map(b => [b.plan.plan.key, b.fromMinor, b.toMinor])) === JSON.stringify([['payg', null, 290000], ['pro', 290000, 800000], ['unlimited', 800000, null]])
    && (() => { const c = clone(CATALOG); price(c, 'pro', 'GB').includedOnlineMinor = 500000; return JSON.stringify(L.cheapestBands(L.offerPlans(c, 'GB'), 'GBP').map(b => b.toMinor)) === '[290000,900000,null]' })())
  const CC = await ctx.bundle('pp-calc', "export { default } from '@/app/compare/CostComparison'\nexport { DemoModalProvider } from '@/components/landing/DemoUpload'", { patches: [{ file: 'app/compare/CostComparison.tsx', states: ['hasSystem', 'gmv', 'planOverride', 'feePctRaw', 'feePenceRaw'] }] })   // ⚠️ RE-PINNED (compare-tidy): no `staff` state any more
  const compareAt = (state, cat = CATALOG, cs = ctx.GB()) => { globalThis.__ms = state; try { return kit.renderStatic(h(CC.DemoModalProvider, null, h(CC.default, { settings: cs, catalog: cat, locale: cs.locale }))) } finally { delete globalThis.__ms } }
  const compareAtProps = (state, extra = {}, cat = CATALOG, cs = ctx.GB()) => ({ state, el: h(CC.DemoModalProvider, null, h(CC.default, { settings: cs, catalog: cat, locale: cs.locale, ...extra })) })
  const h2s = ({ state, el }) => { globalThis.__ms = state; try { return kit.renderStatic(el) } finally { delete globalThis.__ms } }
  const c1 = text(compareAt({ hasSystem: 'no', gmv: 2000 }))
  const c2 = text(compareAt({ hasSystem: 'no', gmv: 5000 }))
  const c3 = text(compareAt({ hasSystem: 'no', gmv: 10000 }))
  t('£2,000 a month → "We suggest Pay as you go" with "No monthly fee — 0.99% on online card orders only."', /We suggest Pay as you go No monthly fee — 0\.99% on online card orders only\./.test(c1), c1.match(/We suggest.{0,160}/))
  t('£5,000 → "We suggest Pro", "£29 per truck per month, with £4,000 of online orders included."', /We suggest Pro £29 per truck per month, with £4,000 of online orders included\./.test(c2), c2.match(/We suggest.{0,160}/))
  // ⚠️ RE-PINNED (compare-tidy, 20 October 2026): the staff question and its "Everyone gets their own login." line are gone.
  t('£10,000 → "We suggest Unlimited", unlimited wording (and no "own login" line — the staff question is removed)', /We suggest Unlimited £69 per truck per month, with unlimited online orders and no HatchGrab fee\./.test(c3) && !/own login/.test(c3), c3.match(/We suggest.{0,200}/))
  // ── compare-tidy (20 October 2026) ──
  {
    const at = (v, cs = ctx.GB(), cat = CATALOG) => (text(compareAt({ hasSystem: 'no', gmv: v }, cat, cs)).match(/We suggest (Pay as you go|Pro|Unlimited)/i) || [])[1]
    t('compare-tidy: the suggestion depends on online order value alone — £2,000 / £3,000 / £8,500 → Pay as you go / Pro / Unlimited (GB data)', at(2000) === 'Pay as you go' && at(3000) === 'Pro' && at(8500) === 'Unlimited', [at(2000), at(3000), at(8500)])
    const usOn = { ...ctx.US_ON(), enabled: true }
    const usText = text(compareAt({ hasSystem: 'no', gmv: 3000 }, CATALOG, usOn))
    t('compare-tidy: the US fixture (switched on) gives the same in $ — $2,000 / $3,000 / $8,500 → Pay as you go / Pro / Unlimited, and "$29 per truck per month"', at(2000, usOn) === 'Pay as you go' && at(3000, usOn) === 'Pro' && at(8500, usOn) === 'Unlimited' && /\$29 per truck per month/.test(usText) && !/£/.test(usText), [at(2000, usOn), at(3000, usOn), at(8500, usOn)])
    const html = compareAt({ hasSystem: 'no', gmv: 3000 })
    const heads = [...html.matchAll(/rounded-full text-xs font-black text-slate-500"[^>]*>(\d+)<\/span><p class="text-base font-bold">([^<]+)</g)].map(m => `${m[1]}:${m[2]}`)
    // ⚠️ RE-PINNED (compare-tidy-2, 20 October 2026): months free (5) is gone — four cards on each path.
    t('compare-tidy: no staff question; the cards are numbered 1–4 with no gap (No path: orders 3, trading days 4; no months card)', !/How many people/.test(html) && JSON.stringify(heads.map(h => h.split(':')[0])) === '["1","2","3","4"]', heads)
    const htmlYes = compareAt({ hasSystem: 'yes', gmv: 3000 })
    t('compare-tidy: Yes path numbered 1–4 too (the fee question is 4, the last)', JSON.stringify([...htmlYes.matchAll(/text-slate-500"[^>]*>(\d+)<\/span><p class="text-base font-bold">/g)].map(m => m[1])) === '["1","2","3","4"]')
    const ordersCard = html.slice(html.indexOf('How much do you think you'), html.indexOf('How many days a week'))
    t('compare-tidy: the "We suggest" panel sits in the online-orders card, under the slider and its "£X included…" line', /class="hg-range[\s\S]*Inside the £4,000 of online orders included[\s\S]*We suggest/.test(ordersCard))
    t('compare-tidy: everything after question 1 unlocks on question 1 alone (no card dimmed once it is answered)', !/opacity:0\.45/.test(html))
  }
  t('switch links for EVERY other plan (data), e.g. at £5,000: "Use Pay as you go instead", "Use Unlimited instead"', c2.includes('Use Pay as you go instead') && c2.includes('Use Unlimited instead') && !c2.includes('Use Pro instead'))
  const c4 = text(compareAt({ hasSystem: 'no', gmv: 5000, planOverride: 'unlimited' }))
  t('an override is honoured: "Your choice Unlimited"', /Your choice Unlimited/.test(c4))
  t('the fee line follows the plan: £5,000 on Pro → "£1,000 above is charged at 0.99% — £9.90 a month each"', /The £1,000 above is charged at 0\.99% — £9\.90 a month each\./.test(c2), c2.match(/included per truck.{0,120}/))
  // ⚠️ RE-PINNED (compare-tidy-2, 20 October 2026): the months-free QUESTION is gone — the months are data (plans.trial_months),
  // or the outreach override `?free=N` (1–12) the page validates and passes as `freeMonthsOverride`.
  {
    const no = (extra = {}) => text(h2s(compareAtProps({ hasSystem: 'no', gmv: 3000 }, extra)))
    const yes = (extra = {}) => text(h2s(compareAtProps({ hasSystem: 'yes', gmv: 3000, feePctRaw: '4.5', feePenceRaw: '20' }, extra)))
    t('compare-tidy-2: no months-free card or input remains', !/how many months free|Months free/i.test(compareAt({ hasSystem: 'no', gmv: 3000 })))
    t('compare-tidy-2: the months come from data — "first 3 months are on us", "Months 1–3", year one = 9 × £29 = £261', no().includes('And your first 3 months are on us.') && no().includes('Months 1–3') && yes().includes('£261 in year one'), [no().match(/first \d+ months/), yes().match(/£\d+ in year one/)])
    t('compare-tidy-2: an override of 4 is used everywhere — "first 4 months", "Months 1–4", year one = 8 × £29 = £232', no({ freeMonthsOverride: 4 }).includes('And your first 4 months are on us.') && no({ freeMonthsOverride: 4 }).includes('Months 1–4') && yes({ freeMonthsOverride: 4 }).includes('£232 in year one'))
    const pg = read('app/compare/page.tsx')
    t('compare-tidy-2: the page accepts only a whole number 1–12 from ?free (0, 13, "abc" → the data value)', /typeof freeRaw === 'string' && \/\^\\d\{1,2\}\$\/\.test\(freeRaw\) && \+freeRaw >= 1 && \+freeRaw <= 12 \? \+freeRaw : null/.test(pg) && /freeMonthsOverride=\{freeMonthsOverride\}/.test(pg))
    t('compare-tidy-2: dimmed cards are inert (pointer-events none + `inert`) until question 1', /pointerEvents: disabled \? 'none' : undefined/.test(read('app/compare/CostComparison.tsx')) && /inert=\{disabled \|\| undefined\}/.test(read('app/compare/CostComparison.tsx'))
      && (compareAt({ hasSystem: null, gmv: 3000 }).match(/ inert=""/g) || []).length >= 3 && !/ inert=""/.test(compareAt({ hasSystem: 'no', gmv: 3000 })))
  }
  const ccSrc = read('app/compare/CostComparison.tsx').replace(/\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
  t('no plan key or name in the calculator\'s code (\'pro\' / \'max\' / Pro / Max / Starter)', !/'(pro|max|payg|unlimited|starter)'|\b(Pro|Max|Starter)\b/.test(ccSrc), ccSrc.match(/'(pro|max|payg|unlimited|starter)'|\b(Pro|Max|Starter)\b/))
  const cmpPage = await page('compare', 'GB')
  t('the /compare page renders (GB)', typeof cmpPage === 'string' && cmpPage.length > 3000 && !cmpPage.startsWith('ERROR'), String(cmpPage).slice(0, 200))

  // ══ 5 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · THE PLANS PDF — the same content, the existing styling')
  const pdfGB = await pdf('GB')
  const dt = text(pdfGB)
  t('renders (GB)', typeof pdfGB === 'string' && pdfGB.startsWith('<!doctype html>'), String(pdfGB).slice(0, 200))
  t('banner, then the Pro card (badge, name, subtitle, £29, its fee sentence)', inOrder(dt, ['Your first 3 months are completely free — every feature unlocked.', 'Most trucks', 'Pro', 'Trucks taking regular pre-orders', '£29 per truck / month', 'First £4,000 of online orders included each month, then 0.99%*']))
  t('the payg card: name, subtitle, £0, its fee sentence', dt.includes('Pay as you go Seasonal & part-time traders £0 per truck / month 0.99%* on online card orders only.'))
  t('the Pro card\'s bullets, as on the landing (no Messenger & Instagram, no included-amount bullet)', dt.includes('Everything in Pay as you go, plus WhatsApp auto-replies Social media posts — your Facebook and Instagram schedule — ready to post Custom event types & pricing Most') || dt.includes('Everything in Pay as you go, plus WhatsApp auto-replies Social media posts — your Facebook and Instagram schedule — ready to post Custom event types & pricing Unlimited'), dt.match(/Everything in Pay as you go.{0,220}/))
  // ⚠️ RE-PINNED (landing-mobile-tidy, 21 October 2026): the PDF's bar carries the same approved wording as the page.
  t('the cheapest bar', dt.includes('Which plan is cheapest for me? Your online orders each month Under £2,900 → Pay as you go · £2,900 – £8,000 → Pro · Over £8,000 → Unlimited'), dt.match(/Which plan.{0,200}/))
  t('the table: plan columns with "/ month", WHAT YOU PAY, the three groups, every row', inOrder(dt, ['Pay as you go £0 / month', 'Pro £29 / month', 'Unlimited £69 / month', 'What you pay', 'Online orders included each month', '£4,000', 'Unlimited', '0.99% above £4,000', 'Run your service', 'Online orders', 'Marketing & automation'])
    && count(pdfGB, '<tr><td class="f">') === 32 + 3 && !/Pay at Hatch orders|Online ordering — Pay at Hatch/.test(dt))
  t('the Pro column is highlighted', count(pdfGB, '<th class="c hl">') === 1 && /<th class="c hl"><div class="th-plan">Pro</.test(pdfGB))
  t('the footnote, and the existing styling (wordmark header, A4, the drawn tick)', FOOTNOTE_GB.test(dt) && pdfGB.includes('size: A4') && pdfGB.includes('class="doc-head"') && pdfGB.includes('<svg class="tick"'))
  t('no retired copy (Starter / Max / allowance heading)', !/\bStarter\b|\bMax\b|Online order allowance/.test(dt))

  // ══ 6 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · MANAGE — Billing, the trial popup, the van modal, the first-load error')
  const SH = await require('./_lp1d2-shell.cjs').views(require('./_lp1d2-fixtures.cjs').context(kit, REPO))
  const bill = k => SH[k] || ''
  for (const cc of ['GB', 'US']) {
    const m = cc === 'GB' ? '£' : '$'
    for (const k of ['payg', 'pro', 'unlimited']) {
      const v = bill(`${cc}|billing|plan|${k}`)
      const name = CATALOG.plans.find(p => p.key === k).name
      t(`${cc} Billing (${k}): the /features table, with ${name}'s column highlighted`, count(v, 'class="pt pt-card"') === 1 && new RegExp(`<div class="pt-col pt-hl" role="columnheader"><span class="pt-col-name">${name}<`).test(v) && count(v, 'pt-col pt-hl') === 1)
    }
    const tr = bill(`${cc}|billing|plan|trial`)
    t(`${cc} Billing (trial): the table with no column highlighted (a trial is not a column)`, count(tr, 'class="pt pt-card"') === 1 && !tr.includes('pt-col pt-hl'))
    t(`${cc} Billing: prices in ${m}, the footnote under the table`, text(bill(`${cc}|billing|plan|pro`)).includes(`Pro ${m}29 / month`) && FOOTNOTE_ANY.test(text(bill(`${cc}|billing|plan|pro`))))
    t(`${cc} Billing (pricing-tidy): the two row disclosures under the card-fee footnote, with the row markers`, inOrder(text(bill(`${cc}|billing|plan|pro`)), ['* Plus', '1 Kitchen ticket printing needs a compatible Bluetooth or wired printer (not supplied).', '2 WhatsApp auto-replies need a WhatsApp Business account. Meta may charge for some messages; replies are generated automatically.'])
      && /<span>Kitchen ticket printing<sup class="pt-sup">1<\/sup><\/span>/.test(bill(`${cc}|billing|plan|pro`)) && /<span>WhatsApp auto-replies<sup class="pt-sup">2<\/sup><\/span>/.test(bill(`${cc}|billing|plan|pro`)))
    t(`${cc} Billing: no retired comparison copy (Starter / Max / "Max tier")`, !/\bStarter\b|\bMax\b/.test(text(bill(`${cc}|billing|plan|pro`))))
    t(`${cc} trial popup: "Every feature free for 3 months"; its fallback is "Pay as you go" (not the retired Starter tier)`,
      text(bill(`${cc}|shell|trialPopup|dated`)).includes('Every feature free for 3 months') && text(bill(`${cc}|shell|trialPopup|dated`)).includes('you’ll move to Pay as you go and some features will stop working') && !/Starter|Max features/.test(text(bill(`${cc}|shell|trialPopup|dated`))))
    // ⚠️ RE-PINNED (pricing-tidy, 20 October 2026): the not-started body sentence is gone — the heading alone.
    t(`${cc} Billing "not started": the heading alone ("Your free trial has not started yet"), no body sentence`, (v => v.includes('Your free trial has not started yet') && !v.includes('hasn’t started yet'))(text(bill(`${cc}|billing|trial|notStarted`)))
      && /<p class="text-sm font-bold text-slate-900">Your free trial has not started yet<\/p><\/div>/.test(bill(`${cc}|billing|trial|notStarted`)))
  }
  t('a hidden-pricing truck: Billing\'s table amounts are masked', /TB[CD] \/ month/.test(text(Object.entries(SH).find(([k]) => /GB\|billing\|.*hidePricing/.test(k))?.[1] || '')), Object.keys(SH).filter(k => /hidePricing/.test(k)))
  const man = read('app/manage/[token]/page.tsx')
  t('van modal: its sentence from data — the effective plan\'s name, plans.included_vans, the extra-van price', /t\.rich\('vanBilling\.body', \{ plan: effectivePlan\(truck, vanCatalog\)\.plan\.name, vans: vansIncluded, price: vanPx\(vanAddonLabel\('month'\)\)/.test(man)
    && /"body": "Your \{plan\} plan includes \{vans, plural, one \{# truck\} other \{# trucks\}\}\./.test(read('messages/en-GB.json')))
  t('first load: an auth refusal (401/403) says "Invalid or expired token"; anything else shows its real reason', /auth: res\.status === 401 \|\| res\.status === 403/.test(man) && /else setFirstLoadError\(e\?\.auth \? null : \(e\?\.message \|\| tRef\.current\('loadFailed'\)\)\)/.test(man) && /firstLoadError \? t\('loadFailedReason', \{ reason: firstLoadError \}\) : t\('invalidToken'\)/.test(man))
  {
    const VAN = await kit.bundle('pp-van', "import { IntlMessageFormat } from 'intl-messageformat'\nexport { IntlMessageFormat }")
    const body = JSON.parse(read('messages/en-GB.json')).manageSettings.vanBilling.body
    const fmt = new VAN.IntlMessageFormat(body, 'en-GB').format({ plan: 'Pro', vans: 1, price: '£29/month', b: c => c.join('') })
    t('the van sentence reads: "Your Pro plan includes 1 truck. Adding an additional truck costs £29/month …"', String(fmt).startsWith('Your Pro plan includes 1 truck. Adding an additional truck costs £29/month'), fmt)
  }

  // ══ 7 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('7 · FIXTURE CHANGES reach every surface; a FOURTH plan appears everywhere')
  {
    const c = clone(CATALOG)
    price(c, 'pro', 'GB').monthlyMinor = 3500
    price(c, 'payg', 'GB').feeBps = 120
    price(c, 'pro', 'GB').includedOnlineMinor = 300000
    c.plans.find(p => p.key === 'trial').trialMonths = 2
    c.features.push({ planKey: 'payg', feature: 'private_events', enabled: false })
    const lg = text(await page('landing', 'GB', { cat: c }))
    const fg = await page('features', 'GB', { cat: c })
    const pd = text(await pdf('GB', { cat: c }))
    const PT = await ctx.bundle('pp-table', "export { PlanTable } from '@/components/pricing/PlanTable'")
    const bt = text(kit.renderStatic(h(PT.PlanTable, { catalog: c, settings: ctx.GB(), highlight: 'pro' })))
    t('Pro £29 → £35: landing, /features, PDF and Billing\'s table', lg.includes('£35 per truck / month') && text(fg).includes('Pro £35 / month') && pd.includes('£35 per truck / month') && bt.includes('Pro £35 / month') && !lg.includes('£29 per truck'))
    t('payg fee 0.99% → 1.2%: everywhere', lg.includes('1.2%* on online card orders only') && text(fg).includes('1.2%') && pd.includes('1.2%* on online card orders only') && bt.includes('1.2%'))
    t('Pro included £4,000 → £3,000: everywhere', lg.includes('First £3,000 of online orders included') && text(fg).includes('0.99% above £3,000') && pd.includes('First £3,000') && bt.includes('£3,000'))
    // ⚠️ RE-PINNED (landing-mobile-tidy, 21 October 2026): /features has no trial callout any more — the landing banner and PDF carry it.
    t('the trial 3 → 2 months: landing banner and PDF (/features has no callout)', lg.includes('Your first 2 months are completely free') && !/months? free with every feature unlocked/.test(text(fg)) && pd.includes('Your first 2 months are completely free'))
    t('a switch (payg private_events off): the card bullet goes, the table row reads —', !lg.slice(lg.indexOf('Everything to run a service'), lg.indexOf('See every feature')).includes('Private events') && /Private events — ✓|Private events —/.test(text(fg.replace(/<span class="pt-desc">.*?<\/span>/g, '')).replace(/\s+/g, ' ')))   // ⚠️ RE-PINNED (features-page-restore, 20 October 2026): read without the row's description
    t('the cheapest bar re-solves (Pro £35 incl. £3,000 → Pro up to £6,400, not £8,000)', lg.includes('£2,900 – £6,400 → Pro Over £6,400 → Unlimited') && !lg.includes('£8,000'), lg.match(/Which plan is cheapest.{0,160}/))

    const f4 = withFourth()
    const l4 = text(await page('landing', 'GB', { cat: f4 }))
    const t4 = text(await page('features', 'GB', { cat: f4 }))
    const p4 = await pdf('GB', { cat: f4 })
    const b4 = kit.renderStatic(h(PT.PlanTable, { catalog: f4, settings: ctx.GB(), highlight: 'growth' }))
    const c4x = text(compareAt({ hasSystem: 'no', gmv: 9000 }, f4))
    t('a fourth public plan: a fourth card, in sort_order, with "Everything in Pro, plus"', inOrder(l4, ['Pro', 'Growth', 'Fixture subtitle', '£49 per truck / month', 'Everything in Pro, plus', 'Unlimited', 'Everything in Growth, plus']) && count(l4, 'Try free') === 4)
    t('…a fourth column on /features, in the PDF and in Billing\'s table', inOrder(t4, ['Pro £29 / month', 'Growth £49 / month', 'Unlimited £69 / month']) && count(p4, '<div class="th-plan">') === 4 && count(b4, 'role="columnheader"') === 4)
    t('…in the cheapest bar and the /compare choice', /→ Growth/.test(l4) && /We suggest Growth/.test(c4x), { bar: l4.match(/Which plan.{0,220}/), cmp: c4x.match(/We suggest.{0,60}/) })
  }

  // ══ 8 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('8 · US — switched ON: $ and en-US words; switched OFF: the existing masking')
  const landUS = text(await page('landing', 'US', { usOn: true }))
  const featUS = text(await page('features', 'US', { usOn: true }))
  const pdfUS = text(await pdf('US', { usOn: true }))
  t('US landing: $0 / $29 / $69, "First $4,000", "$2,900 – $8,000"', inOrder(landUS, ['$0 per truck / month', '$29 per truck / month', '$69 per truck / month']) && landUS.includes('First $4,000 of online orders') && landUS.includes('$2,900 – $8,000 → Pro'))
  t('US words: "Pre-orders & pickup times", "pay when they pick up"', landUS.includes('Pre-orders & pickup times') && landUS.includes('customers order ahead and pay when they pick up'))
  t('US footnote: the US card fee "in the US"', /currently [\d.]+% \+ 30¢ in the US/.test(landUS), landUS.match(/currently.{0,40}/))
  t('US /features and PDF in $', featUS.includes('Pro $29 / month') && featUS.includes('0.99% above $4,000') && pdfUS.includes('$29 per truck / month') && pdfUS.includes('Pre-orders & pickup times'))
  t('US PDF: Letter paper', (await pdf('US', { usOn: true })).includes('size: letter'))
  // pricing-tidy (20 October 2026): the plans PDF carries the two row disclosures too — GB and US, the same words, the markers.
  for (const [cc, html] of [['GB', pdfGB], ['US', await pdf('US', { usOn: true })]]) {
    t(`${cc} PDF (pricing-tidy): markers on the two rows and the two footnotes after the card-fee one`,
      /Kitchen ticket printing<sup>1<\/sup>/.test(html) && /WhatsApp auto-replies<sup>2<\/sup>/.test(html)
      && inOrder(text(html), ['* Plus', '1 Kitchen ticket printing needs a compatible Bluetooth or wired printer (not supplied).', '2 WhatsApp auto-replies need a WhatsApp Business account. Meta may charge for some messages; replies are generated automatically.']))
  }
  const pdfUSoff = text(await pdf('US', { usOn: false }))
  t('US switched OFF: the PDF masks every amount ("TBD") and says why', !/\$\d/.test(pdfUSoff) && /TBD per truck \/ month/.test(pdfUSoff) && pdfUSoff.includes('not yet published'), pdfUSoff.slice(0, 600))
  const usOffPage = await page('landing', 'US', { usOn: false }).catch(e => 'THREW ' + e.message)
  t('US switched OFF: /us is not served (the page\'s redirect() backstop; the router 302s it to GB first)', /redirect/i.test(String(usOffPage)), String(usOffPage).slice(0, 120))
  t('US switched OFF: Billing for a US truck masks (Stage A2 rule, unchanged — usePlanPriceMask)', /cs\?\.enabled \? policyMask\(raw\) : maskPriceFor\(raw, true\)/.test(read('components/usePlanPriceLabel.ts')) && /px=\{cardPx\}/.test(man))

  // ══ 9 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('9 · payg: custom event types refused with the "included on Pro" prompt; private events allowed')
  const paygTruck = { id: 't', plan: 'payg', trial_expires_at: null, feature_overrides: {} }
  t('payg cannot use event_types; can use private_events', L.truckCan(paygTruck, CATALOG, 'event_types') === false && L.truckCan(paygTruck, CATALOG, 'private_events') === true)
  t('pro / unlimited / trial can use event_types', ['pro', 'unlimited', 'trial'].every(k => L.truckCan({ ...paygTruck, plan: k, trial_expires_at: k === 'trial' ? '2026-12-31T23:59:59Z' : null }, CATALOG, 'event_types')))
  const ref = await L.featureRefusal(paygTruck, 'event_types', 'en-GB', CATALOG)
  t('the refusal: feature_not_on_plan, naming Pro', ref && ref.code === 'feature_not_on_plan' && JSON.stringify(ref.params).includes('Pro'), ref)
  t('…and none for private events', (await L.featureRefusal(paygTruck, 'private_events', 'en-GB', CATALOG)) === null)
  {
    const UI = await kit.bundle('pp-ui', [
      "export { FeatureGate } from '@/components/FeatureGate'", "export { PlanCatalogProvider } from '@/components/PlanCatalogProvider'",
      "export { CountrySettingsProvider } from '@/components/CountrySettingsProvider'", "export { PricingPolicyProvider } from '@/components/PricingPolicy'",
      "export { I18nContext } from '@/lib/i18n/use-t'",
    ].join('\n'), { stubs: { '@/lib/commerce-policy': 'export function purchaseCtaAllowed() { return true }' } })
    const gate = (truck, feature) => {
    let x = h(UI.FeatureGate, { feature, truck, fallback: h('i', null, 'SWITCHED-OFF') }, h('b', null, 'THE FEATURE'))
    x = h(UI.PlanCatalogProvider, { catalog: CATALOG }, x); x = h(UI.PricingPolicyProvider, { hidePricing: false }, x)
    x = h(UI.CountrySettingsProvider, { settings: ctx.GB() }, x); x = h(UI.I18nContext.Provider, { value: { locale: 'en-GB', setLocale() {} } }, x)
    return text(kit.renderStatic(x))
    }
    const pr = gate(paygTruck, 'event_types')
    t('payg, custom event types: the prompt "… is included on Pro." with the plan line, not the feature', /included on Pro\./.test(pr) && pr.includes('Pro · £29/mo') && !pr.includes('THE FEATURE'), pr)
    t('payg, private events: the feature itself', gate(paygTruck, 'private_events') === 'THE FEATURE')
  }
  t('the event-types route refuses event_types through featureRefusal (the server gate)', /refuseFeature\('event_types'\)|refuseFeature\(\s*'event_types'/.test(read('app/api/event-types/route.ts')) || /featureRefusal\(truck, feature/.test(read('app/api/event-types/route.ts')))

  // ══ 10 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('10 · NO PLAN IN CODE, and the legacy check')
  const NEW_CODE = ['components/pricing/PricingSection.tsx', 'components/pricing/PlanTable.tsx', 'lib/plan-offer.ts', 'lib/feature-table.ts', 'app/features/page.tsx',
    'app/compare/CostComparison.tsx', 'lib/plans-pdf.ts', 'app/landing/page.tsx']
  const strip = s => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  const hits = []
  for (const f of NEW_CODE) {
    const code = strip(read(f))
    for (const [re, what] of [
      [/['"`](payg|pro|unlimited|trial|starter|max|growth)['"`]/g, 'a plan key'],
      [/\b(Pay as you go|Starter|Unlimited)\b|\bPro\b|\bMax\b/g, 'a plan name'],
      [/£\s?\d|\$\s?\d|\b(2900|6900|400000|4000|2,900|8,000|4,000|0\.99)\b|\b99\b/g, 'a price / fee / threshold'],
      [/trial_?months\s*[:=]\s*\d|\b(3|4) months\b/g, 'a trial length'],
    ]) for (const m of code.matchAll(re)) hits.push(`${f}: ${what} "${m[0]}"`)
  }
  t('no plan key, name, price, fee, allowance, threshold or trial length in the pricing code (comments excluded)', hits.length === 0, hits.slice(0, 20).join('\n      '))
  const msgs = JSON.parse(read('messages/en-GB.json'))
  const pricingWords = JSON.stringify({ p: msgs.pricing, t: msgs.planTable })
  t('…nor in its messages (names, amounts and lengths are parameters)', !/Pay as you go|\bPro\b|\bUnlimited\b(?! online)|£\d|\b0\.99\b/.test(pricingWords.replace(/"unlimited":"Unlimited"/, '').replace(/Unlimited online orders, 0% HatchGrab fee/, '')), pricingWords.match(/Pay as you go|\bPro\b|£\d|\b0\.99\b/))
  const legacy = spawnSync(process.execPath, [path.join(REPO, 'scripts/legacy-pricing-imports.cjs')], { encoding: 'utf8' })
  t('scripts/legacy-pricing-imports.cjs passes: the frozen file is gone and nothing reads the retired columns', legacy.status === 0, legacy.stdout.slice(-500))

  // ══ 11 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('11 · 375px — no horizontal scroll')
  // A browser recovers from a stray brace; the production build (postcss) does not — so parse strictly first.
  for (const f of ['app/landing/landing.css', 'components/pricing/plan-table.css']) {
    let err = null
    try { require(require.resolve('postcss', { paths: [REPO] })).parse(read(f), { from: f }) } catch (e) { err = e.message }
    t(`${f} parses (strict postcss, as the build does)`, !err, err)
  }
  let tw = ''
  try {
    const postcss = require(require.resolve('postcss', { paths: [REPO] }))
    const twMod = require(require.resolve('@tailwindcss/postcss', { paths: [REPO] }))
    const tailwind = twMod.default || twMod
    tw = (await postcss([tailwind({ base: REPO })]).process(read('app/globals.css'), { from: path.join(REPO, 'app/globals.css') })).css
  } catch (e) { console.log('    (Tailwind could not be compiled here: ' + String(e.message).slice(0, 120) + ' — the pages are measured with their own stylesheets only)') }
  const css = [tw, read('app/landing/landing.css'), read('components/pricing/plan-table.css')].join('\n')
  const shell = body => `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body>${body}</body></html>`
  const bodyOf = s => { const m = /<body[^>]*>([\s\S]*)<\/body>/.exec(s); return m ? m[1] : s }
  let browser = null
  try {
    browser = await require(path.join(REPO, 'node_modules/puppeteer')).launch({ headless: true })
    const measure = async (label, html) => {
      const pg = await browser.newPage()
      await pg.setViewport({ width: 375, height: 800, deviceScaleFactor: 1 })
      await pg.setContent(html, { waitUntil: 'load' })
      const r = await pg.evaluate(() => {
        const sw = document.documentElement.scrollWidth
        const wide = [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > 375.5 && getComputedStyle(e).position !== 'fixed').slice(0, 4).map(e => e.tagName + '.' + String(e.className).slice(0, 40))
        return { sw, wide }
      })
      await pg.close()
      t(`${label}: scrollWidth ${r.sw} ≤ 375`, r.sw <= 375, r)
    }
    await measure('landing (GB)', shell(bodyOf(landGB)))
    await measure('/features (GB)', shell(bodyOf(featGB)))
    await measure('/features with a fourth plan', shell(bodyOf(await page('features', 'GB', { cat: withFourth() }))))
    await measure('/compare (GB, answered)', shell(`<div class="hg-landing">${''}</div>${compareAt({ hasSystem: 'yes', gmv: 9000 })}`))
    await measure('Billing (GB, pro)', shell(`<div style="padding:16px">${bill('GB|billing|plan|pro')}</div>`))
  } catch (e) {
    t('headless Chrome available for the 375px check', false, String(e.message).slice(0, 300))
  } finally { if (browser) await browser.close().catch(() => {}) }

  // ══ 12 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('12 · SEO — the tags equal BEFORE, but for the listed change')
  const B = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(REPO, 'scripts/fixtures/plans-data-model-before/pages.json.gz')))).views
  const A = await require('./_lp1e-pages.cjs').views(ctx)
  const pick = m => m && m.merged ? { title: m.merged.title, description: m.merged.description, alternates: m.merged.alternates, robots: m.merged.robots, openGraph: m.merged.openGraph, twitter: m.merged.twitter, ld: m.ld } : m
  const changed = [], ldChanged = [], cmpChanged = []
  // ⚠️ RE-PINNED (seo-fixes, 20 October 2026): the landing JSON-LD and the /compare country tags are listed changes too.
  // Landing: every tag but `ld` equals BEFORE; `ld` is ONE block { @context, @graph: [Organization, WebSite,
  // SoftwareApplication] } whose SoftwareApplication carries BEFORE's words unchanged (name, categories, description,
  // inLanguage, areaServed, audience), its own country address as `url`, publisher → the Organization's @id, and one
  // Offer per public plan in the country's currency.
  const expectLd = (k, a, b) => {
    if (JSON.stringify({ ...a, ld: undefined }) !== JSON.stringify({ ...b, ld: undefined })) return false
    const [cc] = k.split('|').slice(1), slug = cc === 'US' ? 'us' : 'uk', cur = cc === 'US' ? 'USD' : 'GBP'
    if (!Array.isArray(a.ld) || a.ld.length !== 1 || !Array.isArray(b.ld) || b.ld.length !== 1) return false
    const g = a.ld[0], old = b.ld[0]
    if (g['@context'] !== 'https://schema.org' || !Array.isArray(g['@graph']) || g['@graph'].map(n => n['@type']).join(',') !== 'Organization,WebSite,SoftwareApplication') return false
    const [org, site, app] = g['@graph']
    const ORG = 'https://www.hatchgrab.com/#organization'
    if (org['@id'] !== ORG || org.name !== 'HatchGrab' || org.url !== 'https://www.hatchgrab.com/') return false
    if (site['@id'] !== 'https://www.hatchgrab.com/#website' || site.publisher?.['@id'] !== ORG) return false
    for (const f of ['name', 'applicationCategory', 'applicationSubCategory', 'description', 'inLanguage', 'areaServed', 'audience'])
      if (JSON.stringify(app[f]) !== JSON.stringify(old[f])) return false
    if (app.url !== `https://www.hatchgrab.com/${slug}` || JSON.stringify(app.publisher) !== JSON.stringify({ '@id': ORG })) return false
    return Array.isArray(app.offers) && app.offers.map(o => o.name).join(',') === 'Pay as you go,Pro,Unlimited'
      && app.offers.every(o => o['@type'] === 'Offer' && o.priceCurrency === cur && o.url === `https://www.hatchgrab.com/${slug}#pricing`)
  }
  // /compare (a country address): title { absolute: 'Cost calculator — HatchGrab UK|US' } and the compare.meta
  // description, mirrored into og / twitter; everything else (canonical, robots noindex, og url / images / locale) = BEFORE.
  const expectCompare = (k, a, b) => {
    const cc = k.split('|')[1], title = `Cost calculator — HatchGrab ${cc === 'US' ? 'US' : 'UK'}`
    const desc = 'Compare what your online orders cost you now with a year on HatchGrab — an estimate in a minute.'
    const want = { ...b, title, description: desc, openGraph: { ...b.openGraph, title, description: desc }, twitter: { ...b.twitter, title, description: desc } }
    return JSON.stringify(a) === JSON.stringify(want) && a.robots?.index === false
  }
  for (const k of Object.keys(B).filter(k => /\|meta/.test(k))) {
    const a = pick(A[k]), b = pick(B[k])
    if (JSON.stringify(a) === JSON.stringify(b)) continue
    // the /features description (and its og / twitter copies) is the listed change — compare the rest with it set aside
    const drop = x => x && JSON.parse(JSON.stringify(x, (key, v) => (key === 'description' ? undefined : v)))
    if (/^features\|/.test(k) && JSON.stringify(drop(a)) === JSON.stringify(drop(b))) { changed.push(k); continue }
    if (/^landing\|/.test(k) && a && b && expectLd(k, a, b)) { ldChanged.push(k); continue }
    if (/^compare\|/.test(k) && a && b && expectCompare(k, a, b)) { cmpChanged.push(k); continue }
    t(`${k}: unchanged`, false, { after: a, before: b })
  }
  t(`the /features views differ ONLY in the description (${changed.length} views)`, changed.every(k => /^features\|/.test(k)) && changed.length > 0, changed)
  t(`seo-fixes: the landing views differ ONLY in the JSON-LD — one @graph, same words, url = the country address, offers in GBP / USD (${ldChanged.length} views)`,
    ldChanged.join(',') === 'landing|GB|meta,landing|US|meta,landing|GB|meta-usOn', ldChanged)
  t(`seo-fixes: the /compare country views differ ONLY in title "Cost calculator — HatchGrab UK|US" + description (and their og / twitter copies), still noindex (${cmpChanged.length} views)`,
    cmpChanged.join(',') === 'compare|GB|meta,compare|US|meta,compare|GB|meta-usOn', cmpChanged)
  const fd = A['features|GB|meta'] && A['features|GB|meta'].merged
  t('the new /features description names the data\'s plans and trial: "… side by side — Pay as you go, Pro and Unlimited, with fees and allowances. Your first 3 months include everything."',
    fd && fd.description === 'Every HatchGrab feature on every plan, side by side — Pay as you go, Pro and Unlimited, with fees and allowances. Your first 3 months include everything.' && fd.openGraph.description === fd.description && fd.twitter.description === fd.description, fd && fd.description)

  console.log(`\n${fail ? '🔴' : '✅'} pricing-pages: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
