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
  t('the review screen and table read the truck\'s list (allergenVocab / genericReplacements by the provider\'s set)',
    /const allergenSet = useOptionalCountrySettings\(\)\?\.allergenSet\n\s+const ALLERGEN_VOCAB = allergenVocab\(allergenSet\)\n\s+const GENERIC_REPLACEMENTS = genericReplacements\(allergenSet\)/.test(P)
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
  t('landing title (and OG/Twitter): "— HatchGrab US"', [lm.title.absolute, lm.openGraph.title, lm.twitter.title].every(v => v === 'Food truck & mobile catering ordering system — HatchGrab US'), lm.title.absolute)
  t('landing description (and OG/Twitter): "US food trucks"', [lm.description, lm.openGraph.description, lm.twitter.description].every(v => v.includes('software for US food trucks') && !v.includes('UK')), lm.description)
  t('landing og:locale en_US', lm.openGraph.locale === 'en_US', lm.openGraph.locale)
  t('features title (and OG/Twitter): "— HatchGrab US"', [fm.title.absolute, fm.openGraph.title, fm.twitter.title].every(v => v === 'Plans & features compared — HatchGrab US'), fm.title.absolute)
  t('features og:locale en_US', fm.openGraph.locale === 'en_US', fm.openGraph.locale)
  const strip = o => JSON.stringify(o).replace(/HatchGrab (UK|US)/g, '#').replace(/\b(UK|US) food/g, '#').replace(/en_(GB|US)/g, '#')
  t('nothing else in the landing tags moves (canonical, images, robots)', strip(lm) === strip(before.landingMeta))
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
  const C = await kit.bundle('ur-placeholders', "export * from '@/lib/copy/addressPlaceholders'")
  const gb = C.addressPlaceholders('postcode')
  t('GB address = BEFORE', gb.address === before.placeholders.address, gb.address)
  t('GB area = BEFORE', gb.area === before.placeholders.area, gb.area)
  t('GB paste = BEFORE', C.pastePlaceholder('postcode') === before.placeholders.paste, C.pastePlaceholder('postcode'))
  const us = C.addressPlaceholders('zip_state')
  t('US address', us.address === 'e.g. 123 Main St, Austin, TX 78701', us.address)
  t('US area', us.area === 'e.g. Austin', us.area)
  t('US paste names Zilker Park, Austin, 5pm-9pm', C.pastePlaceholder('zip_state') === 'Paste your schedule here e.g. Saturday 14th June, Zilker Park, Austin, 5pm-9pm', C.pastePlaceholder('zip_state'))
  t('no style → the UK examples', JSON.stringify(C.addressPlaceholders(undefined)) === JSON.stringify(gb))
  t('the Schedule tab reads all three from the module (no literal left)',
    P.includes('placeholder={addressPlaceholders(tabSettings.addressFormat).address}') && P.includes('placeholder={addressPlaceholders(tabSettings.addressFormat).area}')
    && P.includes('placeholder={pastePlaceholder(tabSettings.addressFormat)}') && !P.includes('e.g. 123 High St') && !P.includes('5pm-9pm"'))
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
