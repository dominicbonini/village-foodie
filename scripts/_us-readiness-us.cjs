// scripts/_us-readiness-us.cjs — the US side of scripts/us-readiness.cjs (docs/us-readiness-sweep-report.md).
// FIXTURES ONLY: the US stays switched off in the database. Each section also proves the GB answer did not move
// where the GB snapshot alone could not (the explicit 'uk14' path, the copy module's UK values).
const path = require('path')

module.exports = async function us(x) {
  const { kit, t, head, read, REPO, before, allergenPrompts, menuPrompt, metadataOf, plansCountry, togglesView, PROSPECTS, GB, US_ON, SEEDS } = x
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
    /const allergenSet = useOptionalCountrySettings\(\)\?\.allergenSet\n\s+const t = useT\('manageAllergens'\)\n\s+const ALLERGEN_VOCAB = allergenVocab\(allergenSet\)\n\s+const GENERIC_REPLACEMENTS = genericReplacements\(allergenSet\)/.test(P)
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
  const strip = o => JSON.stringify(o).replace(/HatchGrab (UK|US)/g, '#').replace(/\b(UK|US) food/g, '#').replace(/en_(GB|US)/g, '#')
  t('nothing else in the landing tags moves (canonical, images, robots) — apart from the named US words', strip(lm) === US_META_WORDS(strip(before.landingMeta)))
  t('nothing else in the features tags moves', strip(fm) === strip(before.featuresMeta))
  const usOff = [GB, { ...US_ON, enabled: false }]
  const lmOff = await metadataOf('app/landing/page.tsx', 'US', usOff)
  t('?country=US while the US is switched off → the GB tags, byte-identical', JSON.stringify(lmOff) === JSON.stringify(before.landingMeta))

  const ld = await landingJsonLd({ kit, REPO }, 'US', [GB, US_ON])
  t('landing JSON-LD for US: areaServed United States · inLanguage en-US · "US food trucks"',
    ld && ld.areaServed?.name === 'United States' && ld.inLanguage === 'en-US' && /for US food trucks/.test(ld.description), JSON.stringify(ld))
  const ldGb = await landingJsonLd({ kit, REPO }, null, [GB, US_ON])
  t('landing JSON-LD for GB: United Kingdom · en-GB · "UK food trucks" (the literals it carried)',
    ldGb && ldGb.areaServed?.name === 'United Kingdom' && ldGb.inLanguage === 'en-GB' && ldGb.description === 'Ordering, pre-orders and a kitchen screen for UK food trucks and mobile catering.', JSON.stringify(ldGb))

  /* ── 4 · placeholders ── */
  head('4 · Manage placeholders by address style')
  // ⚠️ RE-PINNED (Language Phase 1d): addressPlaceholders() / pastePlaceholder() are gone — the example words are ICU
  // `select`s on {style} in messages `manageScheduleEvent` (addressPlaceholder, areaPlaceholder) and
  // `manageScheduleImport` (pastePlaceholder, filled by pasteExampleValues(style, ts)). Rendered here exactly as the
  // Schedule tab does (the product's translatorFor, in the truck's locale) and held to the same answers: GB = BEFORE,
  // US = the US examples. ONE NAMED US CHANGE (scripts/_lp1d-named.cjs): the US paste example is now in the US
  // truck's own date and clock — "Saturday, June 14, …, 5:00 PM – 9:00 PM" — where it shared the UK's
  // "Saturday 14th June … 5pm-9pm" (the gap docs/us-readiness-sweep-report.md recommended closing).
  const C = await kit.bundle('ur-placeholders', "export * from '@/lib/copy/addressPlaceholders'\nexport { translatorFor } from '@/lib/i18n/translator'\nimport '@/lib/i18n/catalog/manageScheduleEvent'\nimport '@/lib/i18n/catalog/manageScheduleImport'")
  const tsOf = c => ({ timeZone: c.defaultTimezone, locale: c.locale, timeFormat: c.timeFormat === '12h' ? '12h' : '24h', dateOrder: c.dateOrder === 'mdy' ? 'mdy' : 'dmy', weekStart: c.weekStart === 'sunday' ? 'sunday' : 'monday' })
  const holders = (style, c) => {
    const ts = tsOf(c), tE = C.translatorFor(ts.locale, 'manageScheduleEvent'), tI = C.translatorFor(ts.locale, 'manageScheduleImport')
    const st = C.addressStyleOf(style)
    return { address: tE('addressPlaceholder', { style: st }), area: tE('areaPlaceholder', { style: st }), paste: tI('pastePlaceholder', C.pasteExampleValues(style, ts)) }
  }
  const gb = holders('postcode', SEEDS.gbFromSeed())
  t('GB address = BEFORE', gb.address === before.placeholders.address, gb.address)
  t('GB area = BEFORE', gb.area === before.placeholders.area, gb.area)
  t('GB paste = BEFORE', gb.paste === before.placeholders.paste, gb.paste)
  const us = holders('zip_state', SEEDS.usFromSeed())
  t('US address', us.address === 'e.g. 123 Main St, Austin, TX 78701', us.address)
  t('US area', us.area === 'e.g. Austin', us.area)
  t('US paste names Zilker Park, Austin, in the US truck\'s date and clock (named Language Phase 1d change)', us.paste === 'Paste your schedule here e.g. Saturday, June 14, Zilker Park, Austin, 5:00 PM – 9:00 PM', us.paste)
  t('no style → the UK examples', JSON.stringify(holders(undefined, SEEDS.gbFromSeed())) === JSON.stringify(gb) && C.addressStyleOf(undefined) === 'postcode' && C.addressStyleOf('xx') === 'postcode')
  t('the Schedule tab reads all three from the messages by the truck\'s style (no literal left)',
    P.includes('const addrStyle = addressStyleOf(tabSettings.addressFormat)')
    && P.includes("placeholder={tE('addressPlaceholder', { style: addrStyle })}") && P.includes("placeholder={tE('areaPlaceholder', { style: addrStyle })}")
    && P.includes("placeholder={tI('pastePlaceholder', pasteExampleValues(addrStyle, ts))}") && !P.includes('e.g. 123 High St') && !P.includes('5pm-9pm"'))
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
  const usHtml = kit.textOf(PDF.buildPlansPdfHtml({ ...SEEDS.usFromSeed(), enabled: true, starterMonthlyMinor: 0, proMonthlyMinor: 3900, maxMonthlyMinor: 6900, proAllowanceMinor: 200000, maxAllowanceMinor: 300000, platformFeePct: 0.99 })).text
  t('the US plans PDF is in dollars ($39 / $69), with no £', usHtml.includes('$39') && usHtml.includes('$69') && !usHtml.includes('£'), usHtml.slice(0, 400))
  const R = read('app/api/admin/outreach/attachments/route.ts')
  t('no outreach_templates read or write in the route', !R.includes('outreach_templates'))

  /* ── 6 · Items CSV ── */
  head('6 · Items CSV: unchanged (see the report)')
  const out = require('child_process').execFileSync('git', ['diff', '--name-only', 'HEAD'], { cwd: REPO, encoding: 'utf8' })
  t('no file holding the Items CSV changed in this sweep', !/items?[-_]?csv|reports?\/items/i.test(out), out)
}

async function landingJsonLd({ kit, REPO }, query, rows) {
  const m = await kit.bundle('ur-landing-page', "export { default as Page } from '@/app/landing/page'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", {
    stubs: {
      'next/font/google': ['Archivo', 'Public_Sans', 'Courier_Prime'].map(n => `export const ${n} = () => ({ variable: 'font-${n}', className: 'font-${n}', style: {} })`).join('\n'),
      'next/headers': `
        export async function headers() { return { get: () => null, has: () => false } }
        export async function cookies() { return { get: () => undefined, has: () => false, getAll: () => [] } }`,
    },
  })
  globalThis.__harnessDb = kit.fakeDb({ country_settings: rows }); m.clearCountrySettingsCache?.()
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
