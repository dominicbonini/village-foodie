// scripts/_us-readiness-us.cjs — the US side of scripts/us-readiness.cjs (docs/us-readiness-sweep-report.md).
// FIXTURES ONLY: the US stays switched off in the database. Each section also proves the GB answer did not move
// where the GB snapshot alone could not (the explicit 'uk14' path, the copy module's UK values).
const path = require('path')

module.exports = async function us(x) {
  const { kit, t, head, read, REPO, before, allergenPrompts, menuPrompt, metadataOf, plansCountry, togglesView, PROSPECTS, GB, US_ON, SEEDS, STAGE_B } = x
  const US_9 = 'Milk, Eggs, Fish, Crustacean shellfish, Tree nuts, Peanuts, Wheat, Soybeans, Sesame'
  const UK_LINE = 'Gluten, Crustaceans, Eggs, Fish, Peanuts, Soy, Dairy, Tree nuts'

  /* ── 2 · allergens ── */
  head('2 · allergens: a US truck is offered, checked and prompted with the US 9')
  const L = await kit.bundle('ur-allergens-lib', "export * from '@/lib/allergens'")
  t('the US 9, in the brief\'s order', L.US_9.join(', ') === US_9, L.US_9.join(', '))
  t('the UK 14 unchanged (the order ALLERGEN_VOCAB had)', L.UK_14.join(' ') === before.togglesNoProvider.trim().replace(/\s+/g, ' '), L.UK_14.join(' '))
  t('anything unrecognised → the UK 14', L.allergenVocab(undefined) === L.UK_14 && L.allergenVocab('xx') === L.UK_14)
  const gr = L.genericReplacements('us9')
  t('US generics: Nuts → Tree nuts/Peanuts · Shellfish → Crustacean shellfish · Gluten → Wheat',
    JSON.stringify(gr) === JSON.stringify({ Nuts: ['Tree nuts', 'Peanuts'], Shellfish: ['Crustacean shellfish'], Gluten: ['Wheat'] }), JSON.stringify(gr))
  t('UK generics unchanged (Nuts → Tree nuts/Peanuts · Shellfish → Crustaceans/Molluscs)',
    JSON.stringify(L.genericReplacements('uk14')) === JSON.stringify({ Nuts: ['Tree nuts', 'Peanuts'], Shellfish: ['Crustaceans', 'Molluscs'] }))
  t('every US replacement is in the US list', Object.values(gr).flat().every(a => L.US_9.includes(a)))

  const usToggles = await togglesView(SEEDS.usFromSeed())
  t('toggles under a US provider: the US 9, in order', usToggles.trim().replace(/\s+/g, ' ') === L.US_9.join(' '), usToggles)
  const P = read('app/manage/[token]/page.tsx')
  // ⚠️ RE-PINNED (Language Phase 1d): the review screen's words moved to messages `manageAllergens`, so its
  // translator (`const t = useT('manageAllergens')`) now sits between the set and the two derived lists.
  t('the review screen and table read the truck\'s list (allergenVocab / genericReplacements by the provider\'s set)',
    // ⚠️ RE-PINNED (allergen-card-country, 21 October 2026): the wizard also reads the country's allergenCardOnlyAllowed
    // (a commented `const cardOnlyAllowed` line) between the set and `t` — named; nothing else may sit there.
    /const allergenSet = useOptionalCountrySettings\(\)\?\.allergenSet\n(?:\s+\/\/[^\n]*\n)*\s+const cardOnlyAllowed = useOptionalCountrySettings\(\)\?\.allergenCardOnlyAllowed !== false\n\s+const t = useT\('manageAllergens'\)\n\s+const ALLERGEN_VOCAB = allergenVocab\(allergenSet\)\n\s+const GENERIC_REPLACEMENTS = genericReplacements\(allergenSet\)/.test(P)
    && !/^const (GENERIC_REPLACEMENTS|isVocab)\b/m.test(P))

  const US_TRUCK = { id: 'us-truck', name: 'Austin Eats', dashboard_token: 'tok-test', country: 'US', currency: 'USD' }
  const usCard = await allergenPrompts(US_TRUCK, [GB, US_ON])
  const p = usCard.structure || ''
  t('card prompt (structure): names the US 9, not the UK 14', p.includes('the 9 major US food allergens') && p.includes(US_9) && !p.includes('14 UK') && !p.includes(UK_LINE), p.slice(0, 300))
  t('card prompt (structure): the US example arrays', p.includes('["Milk", "Wheat", "Eggs"]') && p.includes('["Peanuts", "Wheat", "Crustacean shellfish"]') && !p.includes('"Dairy"'))
  // The transcribe prompt names NO list — it tells the AI to keep the card's own words and map nothing — so it
  // is the same for every country and was left alone.
  t('card prompt (transcribe): names no list, so it is the GB prompt unchanged', usCard.transcribe === before.allergenPrompts.transcribe)
  const usMenu = await menuPrompt({ id: 'us-truck', name: 'Austin Eats', money: { currency: 'USD', locale: 'en-US' }, allergenSet: 'us9' })
  t('importer prompt: names the US 9, not the UK 14', usMenu.includes('The 9 major US food allergens') && usMenu.includes(US_9) && !usMenu.includes('14 UK') && usMenu.includes('["Milk", "Wheat", "Peanuts"]'), usMenu.slice(0, 200))
  const ukExplicit = await menuPrompt({ id: 'test-truck', name: 'Pizza Kitchen', money: { currency: 'GBP', locale: 'en-GB' }, allergenSet: 'uk14' })
  t('importer prompt with the GB set passed explicitly (as the routes now do) = BEFORE', ukExplicit === before.menuPrompt)
  t('the importer callers pass the truck\'s set', /allergenSet/.test(read('app/api/manage/process-menu/route.ts')) && /allergenSet/.test(read('lib/provision-demo.ts')))

  /* ── 3 · metadata ── */
  head('3 · landing and features: the tags name the visitor\'s country')
  const lm = await metadataOf('app/landing/page.tsx', 'US')
  const fm = await metadataOf('app/features/page.tsx', 'US')
  // ⚠️ RE-PINNED (Language Phase 1e): the landing's tags are the messages landing.meta.title / .description, read in the
  // country's locale — the US words (en-US, glossary: mobile catering → catering, pitch → spot, queue → line) are named
  // here and applied to BEFORE's GB tags below, so "nothing else moves" still compares everything else.
  const US_META_WORDS = s => s.replace(/Food truck & mobile catering ordering system/g, 'Food truck & catering ordering system')
    .replace(/from your pitch without the queue/g, 'from your spot without the line').replace(/trucks and mobile catering — not a POS/g, 'trucks and catering — not a POS')
  t('landing title (and OG/Twitter): "— HatchGrab US"', [lm.title.absolute, lm.openGraph.title, lm.twitter.title].every(v => v === 'Food truck & catering ordering system — HatchGrab US'), lm.title.absolute)
  t('landing description (and OG/Twitter): "US food trucks"', [lm.description, lm.openGraph.description, lm.twitter.description].every(v => v.includes('software for US food trucks') && !v.includes('UK')), lm.description)
  t('landing og:locale en_US', lm.openGraph.locale === 'en_US', lm.openGraph.locale)
  t('features title (and OG/Twitter): "— HatchGrab US"', [fm.title.absolute, fm.openGraph.title, fm.twitter.title].every(v => v === 'Plans & features compared — HatchGrab US'), fm.title.absolute)
  t('features og:locale en_US', fm.openGraph.locale === 'en_US', fm.openGraph.locale)
  // (BEFORE.featuresMeta already carries Stage B's one named SEO change — applied in us-readiness.cjs §1.)
  const strip = o => JSON.stringify(o).replace(/HatchGrab (UK|US)/g, '#').replace(/\b(UK|US) food/g, '#').replace(/en_(GB|US)/g, '#')
  t('nothing else in the landing tags moves (canonical, images, robots) — apart from the named US words', strip(lm) === US_META_WORDS(strip(before.landingMeta)))
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the new description lists the catalogue's plan names in the
  // visitor's locale — en-US writes the serial comma ("Pay as you go, Pro, and Unlimited"), en-GB does not. That one
  // locale difference is named and applied to BEFORE's (Stage-B-renamed) GB description; everything else must match.
  const US_FEATURES_WORDS = s => STAGE_B ? s.replace(/side by side — Pay as you go, Pro and Unlimited, with/g, 'side by side — Pay as you go, Pro, and Unlimited, with') : s
  t('nothing else in the features tags moves', strip(fm) === US_FEATURES_WORDS(strip(before.featuresMeta)), strip(fm).slice(0, 300))
  const usOff = [GB, { ...US_ON, enabled: false }]
  const lmOff = await metadataOf('app/landing/page.tsx', 'US', usOff)
  t('?country=US while the US is switched off → the GB tags, byte-identical', JSON.stringify(lmOff) === JSON.stringify(before.landingMeta))

  // ⚠️ RE-PINNED (seo-fixes, 20 October 2026): the landing's JSON-LD is now ONE block, { @context, @graph: [Organization,
  // WebSite, SoftwareApplication] }. The words checked here live on the SoftwareApplication node inside @graph (same
  // words as before); its `url` is now the page's own country address and it carries `offers` in that country's currency.
  const appNode = j => (j && Array.isArray(j['@graph']) ? j['@graph'].find(n => n['@type'] === 'SoftwareApplication') : null) || null
  const graphOk = (j, url, cur) => !!j && j['@context'] === 'https://schema.org' && Array.isArray(j['@graph'])
    && j['@graph'].map(n => n['@type']).join(',') === 'Organization,WebSite,SoftwareApplication'
    && appNode(j).url === url && appNode(j).publisher?.['@id'] === 'https://www.hatchgrab.com/#organization'
    && Array.isArray(appNode(j).offers) && appNode(j).offers.length > 0 && appNode(j).offers.every(o => o['@type'] === 'Offer' && o.priceCurrency === cur)
  const ldJ = await landingJsonLd(x, 'US', [GB, US_ON])
  const ld = appNode(ldJ)
  // ⚠️ RE-PINNED (ai-search-1, 21 October 2026): areaServed (not a SoftwareApplication property) became countriesSupported.
  const served = (n, cc, name) => n && (require('fs').existsSync(require('path').join(REPO, 'lib/robots-policy.ts')) ? Array.isArray(n.countriesSupported) && n.countriesSupported.includes(cc) : n.areaServed?.name === name)
  t('landing JSON-LD for US: countriesSupported includes US · inLanguage en-US · "US food trucks"',
    served(ld, 'US', 'United States') && ld.inLanguage === 'en-US' && /for US food trucks/.test(ld.description), JSON.stringify(ld))
  t('landing JSON-LD for US: one @graph [Organization, WebSite, SoftwareApplication] · url https://www.hatchgrab.com/us · USD offers',
    graphOk(ldJ, 'https://www.hatchgrab.com/us', 'USD'), JSON.stringify(ld))
  const ldGbJ = await landingJsonLd(x, null, [GB, US_ON])
  const ldGb = appNode(ldGbJ)
  t('landing JSON-LD for GB: United Kingdom · en-GB · "UK food trucks" (the literals it carried)',
    served(ldGb, 'GB', 'United Kingdom') && ldGb.inLanguage === 'en-GB' && ldGb.description === 'Ordering, pre-orders and a kitchen screen for UK food trucks and mobile catering.', JSON.stringify(ldGb))
  t('landing JSON-LD for GB: one @graph [Organization, WebSite, SoftwareApplication] · url https://www.hatchgrab.com/uk · GBP offers',
    graphOk(ldGbJ, 'https://www.hatchgrab.com/uk', 'GBP'), JSON.stringify(ldGb))

  /* ── 4 · placeholders ── */
  head('4 · Manage placeholders by address style')
  // ⚠️ RE-PINNED (Language Phase 1d): addressPlaceholders() / pastePlaceholder() are gone — the example words are ICU
  // `select`s on {style} in messages `manageScheduleEvent` (addressPlaceholder, areaPlaceholder) and
  // `manageScheduleImport` (pastePlaceholder, filled by pasteExampleValues(style, ts)). Rendered here exactly as the
  // Schedule tab does (the product's translatorFor, in the truck's locale) and held to the same answers: GB = BEFORE,
  // US = the US examples. ONE NAMED US CHANGE (scripts/_lp1d-named.cjs): the US paste example is now in the US
  // truck's own date and clock — "Saturday, June 14, …, 5:00 PM – 9:00 PM" — where it shared the UK's
  // "Saturday 14th June … 5pm-9pm" (the gap docs/us-readiness-sweep-report.md recommended closing).
  // ⚠️ RE-PINNED (address-formats-1, 21 October 2026): addressStyleOf is retired — a country's address FORMAT gives the
  // {style} its messages select on (lib/address-formats.ts messagesStyleOf; the same answer for every input below).
  // ⚠️ RE-PINNED (address-formats-2, 21 October 2026): the `{style}` selects are gone — the examples are each FORMAT's
  // (lib/address-formats.ts `examples`), worded by `address.example` ("e.g. {example}"), and the paste example's place comes
  // from the format (pasteExampleValues(format, ts) → `{place}`). Rendered as the Schedule tab does and held to the SAME
  // answers: GB = BEFORE, US = the US examples (scripts/address-formats-2.cjs proves the forms byte-identical).
  const C = await kit.bundle('ur-placeholders', "export * from '@/lib/copy/addressPlaceholders'\nexport { addressFormatOrDefault } from '@/lib/address-formats'\nexport { translatorFor } from '@/lib/i18n/translator'\nimport '@/lib/i18n/catalog/address'\nimport '@/lib/i18n/catalog/manageScheduleImport'")
  const tsOf = c => ({ timeZone: c.defaultTimezone, locale: c.locale, timeFormat: c.timeFormat === '12h' ? '12h' : '24h', dateOrder: c.dateOrder === 'mdy' ? 'mdy' : 'dmy', weekStart: c.weekStart === 'sunday' ? 'sunday' : 'monday' })
  const holders = (stored, c) => {
    const ts = tsOf(c), tA = C.translatorFor(ts.locale, 'address'), tI = C.translatorFor(ts.locale, 'manageScheduleImport')
    const f = C.addressFormatOrDefault(stored)
    return { address: tA('example', { example: f.examples.addressLine }), area: tA('example', { example: f.examples.locality }), paste: tI('pastePlaceholder', C.pasteExampleValues(f, ts)) }
  }
  const gb = holders('postcode', SEEDS.gbFromSeed())
  t('GB address = BEFORE', gb.address === before.placeholders.address, gb.address)
  t('GB area = BEFORE', gb.area === before.placeholders.area, gb.area)
  t('GB paste = BEFORE', gb.paste === before.placeholders.paste, gb.paste)
  const us = holders('zip_state', SEEDS.usFromSeed())
  t('US address', us.address === 'e.g. 123 Main St, Austin, TX 78701', us.address)
  t('US area', us.area === 'e.g. Austin', us.area)
  // ⚠️ RE-PINNED, 18 October 2026 — us-layout-fix-1-nbsp (lib/time-utils.ts clockOf; /Users/dominicbonini/dev/usl-out/REPIN-BRIEF.md):
  // each 12-hour time carries a NO-BREAK SPACE (U+00A0) before PM. The " – " between them is the message's own literal
  // ({start} – {end} in messages/en-US.json, not formatTimeRange), so it keeps its ASCII spaces.
  t('US paste names Zilker Park, Austin, in the US truck\'s date and clock (named Language Phase 1d change; us-layout-fix-1-nbsp)', us.paste === 'Paste your schedule here e.g. Saturday, June 14, Zilker Park, Austin, 5:00\u00A0PM – 9:00\u00A0PM', us.paste)
  t('no format → the UK examples', JSON.stringify(holders(undefined, SEEDS.gbFromSeed())) === JSON.stringify(gb) && JSON.stringify(holders('us', SEEDS.usFromSeed())) === JSON.stringify(us))
  t('the Schedule tab reads all three by the truck\'s format (no literal left)',
    P.includes('const addrFormat = addressFormatOrDefault(tabSettings.addressFormat)')
    && read('components/manage/AddressFields.tsx').includes('placeholder={w.example(format.examples.addressLine)}') && read('components/manage/AddressFields.tsx').includes('placeholder={w.example(format.examples.locality)}')
    && P.includes("placeholder={tI('pastePlaceholder', pasteExampleValues(addrFormat, ts))}") && !P.includes('e.g. 123 High St') && !P.includes('5pm-9pm"'))
  t('the seeds: GB postcode · US zip_state', SEEDS.gbFromSeed().addressFormat === 'postcode' && SEEDS.usFromSeed().addressFormat === 'zip_state')

  /* ── 5 · the plans PDF ── */
  head('5 · plans PDF by prospect country')
  const r = async (tables, id) => (await plansCountry(tables, id)).countries.join(',')
  t('US prospect → generated for US', await r(PROSPECTS('US')) === 'US')
  t('GB prospect → GB', await r(PROSPECTS('GB')) === 'GB')
  t('no country on the row → GB', await r(PROSPECTS(undefined)) === 'GB')
  t('malformed country ("usa") → GB', await r(PROSPECTS('usa')) === 'GB')
  t('lower-case "us" → US', await r(PROSPECTS('us')) === 'US')
  t('prospect with no discovery truck → GB', await r({ ...PROSPECTS('US'), outreach_prospects: [{ id: 'pr-1', discovery_truck_id: null }] }) === 'GB')
  t('unknown prospect → GB', await r(PROSPECTS('US'), 'pr-missing') === 'GB')
  const PDF = await kit.bundle('ur-pdf', "export * from '@/lib/plans-pdf'")
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): buildPlansPdfHtml(settings, catalog) — the prices are the
  // catalogue's US plan_prices rows now (the row's old price fields are no longer read), so the fixture's $39 / $69 go there.
  const usRow = { ...SEEDS.usFromSeed(), enabled: true, starterMonthlyMinor: 0, proMonthlyMinor: 3900, maxMonthlyMinor: 6900, proAllowanceMinor: 200000, maxAllowanceMinor: 300000, platformFeePct: 0.99 }
  const usCat = (() => { const c = require('./_plans-catalog-fixture.cjs').seedCatalog(REPO); for (const r of c.prices) if (r.countryCode === 'US') r.monthlyMinor = ({ pro: 3900, unlimited: 6900 })[r.planKey] ?? r.monthlyMinor; return c })()
  const usHtml = kit.textOf(PDF.buildPlansPdfHtml.length >= 2 ? PDF.buildPlansPdfHtml(usRow, usCat) : PDF.buildPlansPdfHtml(usRow)).text
  t('the US plans PDF is in dollars ($39 / $69), with no £', usHtml.includes('$39') && usHtml.includes('$69') && !usHtml.includes('£'), usHtml.slice(0, 400))
  const R = read('app/api/admin/outreach/attachments/route.ts')
  t('no outreach_templates read or write in the route', !R.includes('outreach_templates'))

  /* ── 6 · Items CSV ── */
  head('6 · Items CSV: unchanged (see the report)')
  const out = require('child_process').execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: REPO, encoding: 'utf8' })
  t('no file holding the Items CSV changed in this sweep', !/items?[-_]?csv|reports?\/items/i.test(out), out)
}

async function landingJsonLd(x, query, rows) {
  const { kit, REPO } = x
  const m = await kit.bundle('ur-landing-page', "export { default as Page } from '@/app/landing/page'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'" + (x.PLAN_CLEAR || ''), {
    stubs: {
      'next/font/google': ['Archivo', 'Public_Sans', 'Courier_Prime'].map(n => `export const ${n} = () => ({ variable: 'font-${n}', className: 'font-${n}', style: {} })`).join('\n'),
      'next/headers': `
        export async function headers() { return { get: () => null, has: () => false } }
        export async function cookies() { return { get: () => undefined, has: () => false, getAll: () => [] } }`,
    },
  })
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the landing's pricing section reads the plan catalogue — the
  // seed's plan tables go in the fake database too, and the catalogue's cache is cleared with the country cache.
  globalThis.__harnessDb = kit.fakeDb({ country_settings: rows, ...x.PLAN_ROWS() }); m.clearCountrySettingsCache?.(); m.clearPlanCatalogCache?.()
  try {
    const { prerenderToNodeStream } = require(path.join(REPO, 'node_modules/react-dom/static'))
    const html = await kit.quietAsync(async () => {
      const { prelude } = await prerenderToNodeStream(kit.h(m.Page, { searchParams: Promise.resolve(query ? { country: query } : {}) }))
      let s = ''; for await (const c of prelude) s += c; return s
    })
    const j = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    return j ? JSON.parse(j[1]) : null
  } finally { delete globalThis.__harnessDb }
}
