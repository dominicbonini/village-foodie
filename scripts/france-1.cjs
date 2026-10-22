// scripts/france-1.cjs — FRANCE (FRENCH), BUILT SWITCHED OFF (france-1, 22 October 2026, docs/france-1-report.md).
//
// LOCALHOST ONLY: fixture rows (the FR row PARSED FROM the NOT RUN SQL, scripts/_france-1-fixtures.cjs), the real pages, PDF,
// sitemap, /llms.txt, emails, ticket, Manage's charges card and the WhatsApp reply rendered by the render kit. No database, no
// network. Checks:
//   1  FR SWITCHED ON (fixture) — /fr landing, /features, /compare and the PDF in French and euros (« 29 € »), the hero images,
//      og:locale fr_FR, JSON-LD in EUR and fr-FR, hreflang fr-FR reciprocal, the sitemap, /llms.txt;
//   2  FR OFF / NO ROW (the live state) — /fr 302s to /uk and France is in no hreflang set, sitemap, menu or /llms.txt;
//   3  THE LANGUAGE — fr-FR is a full base; translation-check: 0 structural; the glossary's Use terms; the L221-14 order button;
//   4  THE ADDRESS FORMAT "fr" — street, 5-digit code postal before the town, no region; normaliser, pattern, templates, Places,
//      the AI rules; a code postal is not one premises;
//   5  TVA INCLUDED — 10 % by default (data on the format), the truck's own rate wins; nothing is ever added to a price; the
//      receipt's « Dont TVA 10 % » line (email and ticket); Manage › Payments shows the rate; GB / IE exactly as before;
//   6  ALLERGENS — the EU 14 (uk14) named in French on every chip; the WhatsApp guard in French (fr.json): safety questions go to
//      the allergen reply, a plain menu question is answered; the caveat in French; the card on its own allowed;
//   7  DECIMAL COMMA — "12,50" in a decimal-comma locale, from Intl; every English locale's typed text handed on untouched;
//   8  CARDS — « cartes de l’EEE » in French, the stored label in English; no surcharge, no service fee, tipping off;
//   9  THE NOT RUN SQL — block A widens the address-format CHECK; block B inserts FR switched off with the values sourced;
//  10  THE TERMS — a France section in the same shape as the others; TERMS_VERSION with the documents' date.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'france-1' })
const { REPO, h } = kit
const FF = require('./_france-1-fixtures.cjs')
const LP1E = require('./_lp1e-fixtures.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const NB = /[  ]/g
const text = s => String(s ?? '').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(NB, ' ').replace(/\s+/g, ' ').trim()
const has = (s, ...parts) => parts.every(p => s.includes(p))
const code = f => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const FR_MSG = JSON.parse(read('messages/fr-FR.json'))
const at = (o, k) => k.split('.').reduce((x, p) => (x == null ? undefined : x[p]), o)

;(async () => {
  const R = FF.renderer(kit, 'fr1')
  const frOn = FF.ROWS.frOn(), frOff = FF.ROWS.frOff(), noFr = FF.ROWS.noFr()
  const FR = await R.rowOf(frOn, 'FR')

  // ══ 1 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · FRANCE SWITCHED ON (fixture — the SQL\'s row with enabled = true)')
  const P = { landing: await R.page('landing', 'fr', frOn), features: await R.page('features', 'fr', frOn), compare: await R.page('compare', 'fr', frOn) }
  for (const [k, r] of Object.entries(P)) {
    const tx = text(r.html)
    t(`/fr${k === 'landing' ? '' : '/' + k}: renders, in French (« ${at(FR_MSG, 'landingNav.logIn')} »), amounts in euros the French way; no £, $ or "€29"`,
      !!r.html && tx.includes(at(FR_MSG, 'landingNav.logIn')) && /\d(,\d\d)? €/.test(tx) && !/£\d|\$\d|€\d/.test(tx), { redirect: r.redirectedTo, seen: tx.match(/[\d.,]+ ?€|€ ?[\d.,]+/g)?.slice(0, 8) })
  }
  const land = text(P.landing.html)
  t('the landing names the plans « Sans abonnement », « Pro » and « Illimité », and Pay at Hatch « Paiement sur place » / « Payer au retrait »; no "Pay at Hatch"',
    has(land, 'Sans abonnement', 'Illimité', 'Pro') && (land.includes('Paiement sur place') || land.includes('Payer au retrait')) && !land.includes('Pay at Hatch') && !land.includes('Pay as you go'), land.match(/Sans abonnement.{0,80}/)?.[0])
  t('the plan prices from the SQL: 0 €, 29 €, 69 €', has(land, '29 €', '69 €'), land.match(/\d+ €/g)?.slice(0, 10))
  const meta = P.landing.meta
  t('landing meta in French; og:locale fr_FR; canonical /fr', /[éèàçù]/.test(String(meta?.description)) && meta?.openGraph?.locale === 'fr_FR' && meta?.alternates?.canonical === 'https://www.hatchgrab.com/fr', [meta?.description, meta?.openGraph?.locale])
  const ldOf = html => { const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html || ''); return m ? JSON.parse(m[1]) : null }
  const graph = ldOf(P.landing.html)?.['@graph'] || []
  const app = graph.find(n => n['@type'] === 'SoftwareApplication')
  t('JSON-LD: one Offer per public plan in EUR (0, 29, 69), url /fr, inLanguage fr-FR somewhere in the graph',
    Array.isArray(app?.offers) && app.offers.every(o => o.priceCurrency === 'EUR') && app.offers.map(o => Number(o.price)).join(',') === '0,29,69' && app.url === 'https://www.hatchgrab.com/fr'
    && JSON.stringify(graph).includes('"inLanguage":"fr-FR"'), [app?.offers, app?.url])
  const uk = await R.page('landing', 'uk', frOn)
  const want = { 'en-GB': '/uk', 'en-US': '/us', 'en-IE': '/ie', 'en-AU': '/au', 'en-NZ': '/nz', 'en-CA': '/ca', 'fr-FR': '/fr', 'x-default': '/' }
  const langsOf = m => Object.fromEntries(Object.entries(m?.alternates?.languages || {}).map(([k, v]) => [k, String(v).replace('https://www.hatchgrab.com', '')]))
  t('hreflang reciprocal: /uk and /fr both list en-GB, en-US, en-IE, en-AU, en-NZ, en-CA, fr-FR and x-default', [uk.meta, meta].every(m => JSON.stringify(Object.entries(langsOf(m)).sort()) === JSON.stringify(Object.entries(want).sort())), [langsOf(uk.meta), langsOf(meta)])
  t('the country menu on /uk links France (/fr)', /href="\/fr"/.test(uk.html) && text(uk.html).includes('France'))
  const heroes = ['kitchen', 'dashboard-v4', 'customer-order']
  const heroFiles = heroes.every(n => fs.existsSync(path.join(REPO, `public/screenshots/${n}-fr.png`)))
  t('/fr shows its own hero images (a Lyon fixture truck, never Gusto); /uk the GB ones; each file is the GB image\'s pixel size',
    heroFiles && /\/screenshots\/kitchen-fr\.png/.test(P.landing.html) && !/-fr\.png/.test(uk.html)
    && heroes.every(n => { const a = fs.readFileSync(path.join(REPO, `public/screenshots/${n}-fr.png`)), b = fs.readFileSync(path.join(REPO, `public/screenshots/${n}.png`)); return a.readUInt32BE(16) === b.readUInt32BE(16) && a.readUInt32BE(20) === b.readUInt32BE(20) }), { heroFiles })
  const pdf = await R.pdf(frOn, 'FR'), pdfTx = text(pdf)
  t('the plans PDF: French words, 29 € / 69 €, <html lang="fr-FR">', has(pdfTx, '29 €', '69 €', 'Illimité') && /<html lang="fr-FR"/.test(pdf), pdfTx.slice(0, 300))
  const sm = await R.sitemap(frOn)
  const frEntry = sm.find(e => e.url === 'https://www.hatchgrab.com/fr')
  t('sitemap: /fr and /fr/features listed, /fr with fr-FR among its alternates', !!frEntry && sm.some(e => e.url === 'https://www.hatchgrab.com/fr/features') && frEntry.alternates?.languages?.['fr-FR'] === 'https://www.hatchgrab.com/fr', frEntry)
  const llms = await R.llms(frOn)
  t('/llms.txt: a France (EUR) section with Pro and Illimité/Unlimited prices', /### France \(EUR\)/.test(llms) && /€29|29 €/.test(llms), llms.slice(llms.indexOf('### France'), llms.indexOf('### France') + 300))

  // ══ 2 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · FRANCE OFF OR NO ROW (the live state today) — invisible')
  for (const [label, rows] of [['switched off', frOff], ['no FR row (live)', noFr]]) {
    const a = await R.page('landing', 'fr', rows), b = await R.page('compare', 'fr', rows)
    const u = await R.page('landing', 'uk', rows)
    const s = await R.sitemap(rows)
    t(`${label}: /fr → /uk and /fr/compare → /uk/compare; /uk has no fr-FR hreflang and no /fr link; the sitemap has no /fr; /llms.txt no France`,
      a.redirectedTo === '/uk' && b.redirectedTo === '/uk/compare' && !('fr-FR' in (u.meta?.alternates?.languages || {})) && !/href="\/fr"/.test(u.html) && !s.some(e => /\/fr(\/|$)/.test(e.url))
      && !(await R.llms(rows)).includes('France'), [a.redirectedTo, b.redirectedTo])
  }

  // ══ 3 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · THE LANGUAGE — fr-FR, a full base; the checks; the words the law and the glossary fix')
  const L = read('lib/i18n/locales.ts')
  t('fr-FR is in LOCALES and LANGUAGE_BASES (its one line), with its own full file', /LOCALES = \[[^\]]*'fr-FR'/.test(L) && /LANGUAGE_BASES: readonly AppLocale\[\] = \['fr-FR'\]/.test(L) && fs.existsSync(path.join(REPO, 'messages/fr-FR.json')))
  const tc = spawnSync(process.execPath, ['scripts/translation-check.cjs', '--locale', 'fr-FR'], { cwd: REPO, encoding: 'utf8' })
  t('translation-check: 0 structural problems (every key, ICU skeletons identical to en-GB)', tc.status === 0 && /\*\*Structural: 0\*\*/.test(tc.stdout), tc.stdout.slice(0, 400))
  t('…and no number, price or brand changed, no banned term, every plan named', /invariants 0 · numbers 0 · length \d+ · drift \d+ · plans 0 · other 0/.test(tc.stdout) && /banned 0/.test(tc.stdout), tc.stdout.match(/Flags:.*/)?.[0])
  t('a back-translation for every key (docs/i18n/back/fr-FR.json)', (() => { const b = JSON.parse(read('docs/i18n/back/fr-FR.json')); const keys = []; const w = (o, p) => { for (const [k, v] of Object.entries(o)) { const id = p ? `${p}.${k}` : k; if (typeof v === 'string') keys.push(id); else w(v, id) } }; w(FR_MSG, ''); return keys.every(k => typeof b[k] === 'string') })())
  t('the glossary\'s FR terms: « Paiement sur place », « Payer au retrait », « Sans abonnement », « Illimité », « essai gratuit »; the list of dishes is « la carte »',
    at(FR_MSG, 'order.payAtTruck') === 'Payer au retrait' && at(FR_MSG, 'planNames.payg.name') === 'Sans abonnement' && at(FR_MSG, 'planNames.unlimited.name') === 'Illimité'
    && JSON.stringify(FR_MSG).includes('Paiement sur place') && /essai gratuit/i.test(JSON.stringify(FR_MSG)) && /\bla carte\b/.test(at(FR_MSG, 'order.addItemsPrompt')))
  t('« Pro » keeps its name (no planNames.pro.name); « menu » never names the list of dishes in the order page\'s prompts', at(FR_MSG, 'planNames.pro.name') === undefined && !/\bmenu\b/i.test(at(FR_MSG, 'order.addItemsPrompt')))
  t('the order button says the order means paying (Code de la consommation L. 221-14): « Commander et payer au retrait », « Payer {amount} »',
    at(FR_MSG, 'order.placeOrder') === 'Commander et payer au retrait' && at(FR_MSG, 'order.payAmount') === 'Payer {amount}')
  t('no straight apostrophe in any French string (ICU would read it as an escape)', !JSON.stringify(FR_MSG).replace(/https?:[^"]*/g, '').includes("'"))

  // ══ 4 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · THE ADDRESS FORMAT "fr" — street, code postal before the town, no region')
  const AF = await kit.bundle('fr1-af', "export * from '@/lib/address-formats'")
  const fmt = AF.ADDRESS_FORMATS.fr
  t('every format validates, France\'s included', AF.validateAddressFormats().length === 0, AF.validateAddressFormats())
  t('fields: street, ville (required), code postal; no region; a code postal covers an area, never one premises', JSON.stringify(fmt.fields.map(f => [f.key, f.required, f.label])) === JSON.stringify([['street', false, 'street'], ['locality', true, 'city'], ['postalCode', false, 'postalCode']])
    && fmt.regions === null && fmt.postalCode.identifiesPremises === false)
  t('the code postal: 5 digits; "75 011" → "75011"; "69002" valid; "6900", "750011" and "SW1A 1AA" not', AF.normalisePostalCode(fmt, '75 011') === '75011' && AF.isValidPostalCode(fmt, '69002') && AF.isValidPostalCode(fmt, '75 011')
    && !AF.isValidPostalCode(fmt, '6900') && !AF.isValidPostalCode(fmt, '750011') && !AF.isValidPostalCode(fmt, 'SW1A 1AA'))
  const v = { venue: 'Place Bellecour', locality: 'Lyon', postalCode: '69002', country: 'France' }
  t('templates: « Place Bellecour, 69002 Lyon » (line, calendar); « 69002 Lyon » (under the venue); geocode adds the country; no code → « Place Bellecour, Lyon »',
    AF.renderTemplate(fmt.templates.line, v) === 'Place Bellecour, 69002 Lyon' && AF.renderTemplate(fmt.templates.calendar, v) === 'Place Bellecour, 69002 Lyon' && AF.renderFirst(fmt.templates.area, v) === '69002 Lyon'
    && AF.renderTemplate(fmt.templates.geocode, v) === 'Place Bellecour, 69002 Lyon, France' && AF.renderTemplate(fmt.templates.line, { ...v, postalCode: '' }) === 'Place Bellecour, Lyon')
  t('Places: a town is a locality; no region is read or kept', JSON.stringify(fmt.places) === JSON.stringify({ localityTypes: ['locality'], regionFrom: [], regionCode: null }))
  const ai = JSON.stringify(fmt.ai)
  t('the AI rules (importer, screenshot, scraper) read French schedules: 5-digit code postal before the town, "18h30" → 18:30, no region', has(ai, 'code postal', '5 digits', '18h30', '18:30', 'no \\"state\\" for France') && AF.fillAiText(fmt.ai.importer.knowledge, { country: 'France', year: 2026 }) === 'venues and locations in France')
  t('the admin dropdown offers it ("France — code postal, ville")', fmt.adminLabel === 'France — code postal, ville' && AF.ADDRESS_FORMAT_KEYS.includes('fr'))

  // ══ 5 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · TVA INCLUDED — 10 % by default, the truck\'s own rate wins, nothing added; « Dont TVA » after the total')
  const ENG = await kit.bundle('fr1-engine', "export * as E from '@/lib/order-charges'\nexport * as L from '@/lib/order-charge-lines'\nexport * as RU from '@/lib/order-charge-rules'\nexport * as Mail from '@/lib/email'\nexport * as T from '@/lib/printing/ticket'\nexport { mapOrderToTicket } from '@/lib/printing/mapOrderToTicket'\nexport * as CS from '@/lib/charge-settings'")
  const { E, Mail, T } = ENG
  const rules = (over = {}) => ENG.RU.resolveChargeRules(FR, { country: 'FR', ...over })
  const frR = rules(), c = E.computeOrderCharges({ foodMinor: 2400, rules: frR, channel: 'online_pay_at_truck' })
  t('France: prices include TVA; the rate is 10 % (data on the "fr" format: includedTax), labelled « TVA »', frR.taxInclusive === true && frR.taxRateMilli === 10000 && frR.taxLabel === 'TVA' && /includedTax: \{ label: 'TVA', milli: 10000 \}/.test(read('lib/address-formats.ts')))
  t('…nothing is added: 24,00 € of food is a 24,00 € total; the snapshot keeps the rate (10000) with no added tax', c.totalMinor === 2400 && c.taxMinor === 0 && c.snapshot.tax_rate_milli === 10000 && c.snapshot.tax_inclusive === true && c.snapshot.tax_label === 'TVA')
  t('the truck\'s own rate wins (5,5 %); no service fee, no surcharge, no tip in France', rules({ tax_rate_milli: 5500 }).taxRateMilli === 5500 && rules({ service_fee_enabled: true, service_fee_bps: 300 }).serviceFee === null && frR.surcharge === null && frR.tipping === null)
  const gbRow = await R.rowOf(frOn, 'GB'), ieRow = await R.rowOf(frOn, 'IE')
  t('GB and IE exactly as before: inclusive, NO rate (a stale truck rate is still ignored), so no snapshot rate and no « Dont » line', [gbRow, ieRow].every(row => { const r = ENG.RU.resolveChargeRules(row, { country: row.countryCode, tax_rate_milli: 2000 }); const s = E.computeOrderCharges({ foodMinor: 2400, rules: r, channel: 'online_pay_at_truck' }).snapshot; return r.taxRateMilli === null && s.tax_rate_milli === null && ENG.L.includedTaxLine(s, row.locale) === null }))
  const line = ENG.L.includedTaxLine(c.snapshot, 'fr-FR')
  t('the line: « Dont TVA » « 10 % », 2,18 € of 24,00 € (24 × 10 / 110, rounded once)', line?.label === 'Dont TVA' && line?.rate.replace(NB, ' ') === '10 %' && line?.minor === 218, line)
  t('…never one of the added lines (chargeLinesFor gives none for a French order), so nothing folds or totals it', ENG.L.chargeLinesFor(c.snapshot, 'customer', 'fr-FR').length === 0)
  t('a 5,5 % rate is written « 5,5 % » (the locale\'s decimal mark)', ENG.L.includedTaxLine(E.computeOrderCharges({ foodMinor: 2400, rules: rules({ tax_rate_milli: 5500 }), channel: 'walk_up' }).snapshot, 'fr-FR')?.rate.replace(NB, ' ') === '5,5 %')
  const EUR = { currency: 'EUR', locale: 'fr-FR' }, TIME = { timeZone: 'Europe/Paris', locale: 'fr-FR', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' }
  const base = { orderId: '41', orderKey: 'ok-1', truckName: 'Pizza Kitchen', customerName: 'Léa', slot: '12:30', items: [{ name: 'Margherita', quantity: 2, unit_price: 12, modifiers: [] }],
    deals: [], discountAmt: 0, notes: null, autoAccepted: true, phoneCountry: 'FR', money: EUR, time: TIME, total: 24, charges: c.snapshot }
  const conf = Mail.formatConfirmationEmail(base)
  const confTx = text(conf.html)
  t('the confirmation email: in French, « Total » 24,00 €, then « Dont TVA 10 % » 2,18 € after it; <html lang="fr-FR">', has(confTx, 'Dont TVA 10 %', '2,18 €', '24,00 €') && confTx.indexOf('Dont TVA') > confTx.indexOf('24,00 €') && /<html lang="fr-FR"/.test(conf.html), confTx.slice(0, 500))
  t('…and its text version: « Dont TVA 10 % : 2,18 € » after the total', conf.text.replace(NB, ' ').includes('Dont TVA 10 % : 2,18 €'), conf.text.slice(0, 600))
  const gbConf = Mail.formatConfirmationEmail({ ...base, money: { currency: 'GBP', locale: 'en-GB' }, time: { ...TIME, timeZone: 'Europe/London', locale: 'en-GB' }, charges: E.computeOrderCharges({ foodMinor: 2400, rules: ENG.RU.resolveChargeRules(gbRow, { country: 'GB' }), channel: 'online_pay_at_truck' }).snapshot })
  t('a GB order\'s email has no « Includes » line (byte-identity is proved by the before/after captures)', !/Includes/.test(gbConf.html + gbConf.text))
  const order = { id: '41', order_key: 'ok-1', customer_name: 'Léa', customer_phone: null, slot: '12:30', buzzer_number: null, items: base.items, deals: [], notes: null,
    total: 24, total_minor: 2400, currency: 'EUR', country: 'FR', status: 'confirmed', ...c.snapshot }
  const ticket = ENG.mapOrderToTicket({ order, truck: { name: 'Pizza Kitchen', money: { ...EUR, localeByCountry: { FR: 'fr-FR' } }, time: TIME }, event: null, ledgerRows: [], printedLabel: '12:01' })
  for (const w of [58, 80]) {
    const lines = T.buildTicketLines(ticket, { paper_width: w }).map(l => l.text ?? (l.divider ? '----' : ''))
    const i = lines.findIndex(l => /^TOTAL/i.test(l))
    t(`ticket ${w} mm: TOTAL then « Dont TVA 10 % … 2,18 », right-aligned to the paper`, i >= 0 && /^Dont TVA 10 ?%\s+.*2,18/.test(String(lines[i + 1]).replace(NB, ' ')) && lines[i + 1].length === (w === 58 ? 32 : 48), lines.slice(i - 1, i + 2))
  }
  const CC = await LP1E.context(kit, REPO).bundle('fr1-charges', "export { ChargesCard } from '@/components/manage/ChargesCard'\nexport { CountrySettingsProvider } from '@/components/CountrySettingsProvider'\nexport { I18nContext } from '@/lib/i18n/use-t'")
  const chargesHtml = (settings, truck, locale) => kit.renderStatic(h(CC.I18nContext.Provider, { value: { locale, setLocale() {} } }, h(CC.CountrySettingsProvider, { value: settings, settings }, h(CC.ChargesCard, { truck, api: async () => null, showToast() {}, onTruckUpdate() {} }))))
  let frHtml = '', gbHtml = ''
  try { frHtml = chargesHtml(FR, { tax_rate_milli: null }, 'fr-FR'); gbHtml = chargesHtml(gbRow, { tax_rate_milli: null }, 'en-GB') } catch (e) { frHtml = 'ERROR ' + e.message }
  t('Manage › Payments, France: one row — « TVA incluse dans vos prix », placeholder 10, « Laissez vide pour appliquer 10 % … »; no tip or service-fee row',
    /placeholder="10"/.test(frHtml) && has(text(frHtml), 'TVA incluse dans vos prix', 'Laissez vide pour appliquer 10 %') && !/data-charges-row="tips"|data-tip-chips/.test(frHtml), text(frHtml).slice(0, 400))
  t('…a GB truck\'s Payments shows no charges card at all, as before', gbHtml === '')
  const chk = ENG.CS.checkChargeSettings({ taxRate: '5.5' }, FR, m => String(m)), chkGB = ENG.CS.checkChargeSettings({ taxRate: '5.5' }, gbRow, m => String(m))
  t('the route takes a French truck\'s rate (5.5 → 5500) and still refuses one for GB', chk.ok === true && chk.values.tax_rate_milli === 5500 && chkGB.ok === false && chkGB.code === 'charges_rate_not_here')

  // ══ 6 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · ALLERGENS — the EU 14 in French; the WhatsApp guard in French; the card allowed on its own')
  const AL = await kit.bundle('fr1-allergens', "export { allergenLabel, allergenList } from '@/lib/allergen-label'\nexport * from '@/lib/allergens'")
  const FR14 = ['Gluten', 'Crustacés', 'Œufs', 'Poissons', 'Arachides', 'Soja', 'Lait', 'Fruits à coque', 'Céleri', 'Moutarde', 'Sésame', 'Sulfites', 'Lupin', 'Mollusques']
  t('the uk14 labels shown in French: Gluten, Crustacés, Œufs, Poissons, Arachides, Soja, Lait, Fruits à coque, Céleri, Moutarde, Sésame, Sulfites, Lupin, Mollusques', JSON.stringify(AL.allergenVocab('uk14').map(a => AL.allergenLabel(a, 'fr-FR'))) === JSON.stringify(FR14))
  t('every English locale shows the stored label untouched (nothing is looked up)', ['en-GB', 'en-US', 'en-IE', 'en-AU', 'en-NZ', 'en-CA', null].every(l => [...AL.allergenVocab('uk14'), ...AL.allergenVocab('us9'), ...AL.allergenVocab('anz'), ...AL.allergenVocab('ca'), 'Something else'].every(a => AL.allergenLabel(a, l) === a)))
  t('the label is shown, never stored: the order page, the menu list, the toggles, the wizard and the card text call allergenLabel; the stored value is unchanged',
    /allergenLabel\(a, pageLocale\)/.test(read('app/trucks/[slug]/order/page.tsx')) && /allergenLabel\(allergen, locale\)/.test(read('components/manage/primitives.tsx')) && (read('app/manage/[token]/page.tsx').match(/allergenLabel\(/g) || []).length >= 9)
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const gBuilt = esbuild.buildSync({ entryPoints: [path.join(REPO, 'lib/allergen-guard.ts')], bundle: true, write: false, platform: 'node', format: 'cjs', alias: { '@': REPO }, logLevel: 'silent' })
  const G = { exports: {} }; new Function('module', 'exports', 'require', gBuilt.outputFiles[0].text)(G, G.exports, require)
  const SAFETY = ['C’est sans gluten ?', 'Vous avez des options sans lactose ?', 'Mon fils a une allergie aux arachides', 'Je suis allergique aux fruits à coque', 'J’ai une intolérance au lait',
    'Je suis cœliaque, c’est possible ?', 'je suis coeliaque', 'Ma fille a un EpiPen', 'risque d’anaphylaxie aux noix ?', 'C’est adapté aux personnes allergiques ?', 'Y a-t-il des traces de sésame ?']
  const PLAIN = ['Vous êtes où aujourd’hui ?', 'Quelles pizzas proposez-vous ?', 'Vous fermez à quelle heure ?', 'Il y a du fromage dans la Reine ?', 'Combien coûte la Margherita ?']
  t('lib/allergen-guard/fr.json is the French list (Unicode: accents and case folded), in GUARD_WORDS', G.exports.hasGuardWords('fr-FR') && G.exports.guardWordsFor('fr-FR')?.normalise === 'unicode')
  t(`French safety questions are caught (${SAFETY.length}): sans gluten / lactose, allergie, allergique, intolérance, cœliaque, EpiPen, anaphylaxie, adapté aux, traces`, SAFETY.every(m => G.exports.mentionsAllergen(m, 'uk14', 'fr-FR')), SAFETY.filter(m => !G.exports.mentionsAllergen(m, 'uk14', 'fr-FR')))
  t(`plain questions are not (${PLAIN.length}) — a presence question ("du fromage dans la Reine ?") reaches the AI, which answers from the tags (Option B)`, PLAIN.every(m => !G.exports.mentionsAllergen(m, 'uk14', 'fr-FR')), PLAIN.filter(m => G.exports.mentionsAllergen(m, 'uk14', 'fr-FR')))
  t('the caveat: a tagged « Dairy » dish triggers on « lait », « fromage », « crème »; « Eggs » on « œuf » and « oeuf »', ['lait', 'fromage', 'crème'].every(w => G.exports.caveatTriggerWords(['Dairy'], 'uk14', 'fr-FR').has(w)) && ['œuf', 'oeuf'].every(w => G.exports.caveatTriggerWords(['Eggs'], 'uk14', 'fr-FR').has(w)))
  t('English answers are unchanged (fr.json is another file; en.json untouched since languages-1)', !G.exports.mentionsAllergen('Où êtes-vous ?', 'uk14', 'en-GB') && G.exports.mentionsAllergen('is it gluten free?', 'uk14', 'en-GB'))
  const W = await kit.bundle('fr1-wa', "export { generateWhatsAppReply } from '@/lib/whatsapp-classifier'")
  globalThis.__harnessDb = kit.fakeDb({ menu_items_db: [{ truck_id: 't1', name: 'Margherita', category_id: 'c1', price: 12, is_available: true, is_active: true, allergens: ['Dairy', 'Gluten'], dietary_info: [], menu_categories: { name: 'Pizzas' } }] })
  let aiCalls = 0
  const realFetch = globalThis.fetch
  globalThis.fetch = async u => { if (String(u).includes('generativelanguage')) aiCalls++; throw new Error('no network in this harness') }
  try {
    const wbase = { money: EUR, allergenSet: 'uk14', truckName: 'Pizza Kitchen', truckEmoji: '🍕', truckId: 't1', events: [], scheduleUrl: 'https://x/o', orderUrl: 'https://x/o', isFollowUp: false, time: TIME }
    const allergenQ = await kit.quietAsync(() => W.generateWhatsAppReply({ ...wbase, customerMessage: 'Bonjour, la Margherita est sans gluten ? Je suis cœliaque' }))
    const callsAfterAllergen = aiCalls
    const plainQ = await kit.quietAsync(() => W.generateWhatsAppReply({ ...wbase, customerMessage: 'Quelles pizzas proposez-vous ?' }))
    t('WhatsApp, a French allergen question: the fixed allergen reply in French (« informations sur les allergènes »), never the AI\'s menu answer',
      /informations sur les allergènes/.test(allergenQ.reply ?? '') && callsAfterAllergen <= 1, allergenQ)
    t('WhatsApp, a plain French menu question: answered (the menu path: the classifier and the menu AI both asked; no network here, so its deterministic summary « Nous proposons Pizzas à partir de 12,00 € »), not the allergen reply',
      /Nous proposons Pizzas à partir de 12,00\s€/.test(plainQ.reply ?? '') && !/allergènes/.test(plainQ.reply ?? '') && aiCalls - callsAfterAllergen === 2, { plainQ, calls: aiCalls - callsAfterAllergen })
  } finally { globalThis.fetch = realFetch; delete globalThis.__harnessDb }
  t('the FR row allows the allergen card on its own (R. 412-14: written, visible or freely accessible before ordering; one table for the whole menu accepted)', FR.allergenCardOnlyAllowed === true && FR.allergenSet === 'uk14')

  // ══ 7 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('7 · DECIMAL COMMA — "12,50" where the locale writes a comma; English untouched')
  const D = await kit.bundle('fr1-decimal', "export * from '@/lib/decimal-input'")
  t('fr-FR (from Intl): "12,50" → "12.50", "1 234,50" → "1234.50", "12.50" kept, "12,5" → "12.5"; decimalForInput(12.5) → "12,5"', D.usesDecimalComma('fr-FR') && D.normaliseDecimal('12,50', 'fr-FR') === '12.50' && D.normaliseDecimal('1 234,50', 'fr-FR') === '1234.50'
    && D.normaliseDecimal('12.50', 'fr-FR') === '12.50' && D.normaliseDecimal('12,5', 'fr-FR') === '12.5' && D.decimalForInput(12.5, 'fr-FR') === '12,5')
  const SAMPLES = ['12.50', '12,50', '1,234.50', ' 7 ', '', 'abc', '0.5', '-3', '12.', '.5', '9,99']
  t('every English locale (and none): the typed text handed on EXACTLY as typed, and a stored number shown as String() — the boxes behave as before',
    ['en-GB', 'en-US', 'en-IE', 'en-AU', 'en-NZ', 'en-CA', null].every(l => !D.usesDecimalComma(l) && SAMPLES.every(s => D.normaliseDecimal(s, l) === s) && [12.5, 0, 9.99].every(n => D.decimalForInput(n, l) === String(n))))
  const BOX = await kit.bundle('fr1-box', "export { useDecimalBox } from '@/components/shared/useDecimalBox'")
  let enBox = null, frBox = null
  kit.renderStatic(h(function Probe() { enBox = BOX.useDecimalBox('en-GB').box('k', 12.5, () => {}); frBox = BOX.useDecimalBox('fr-FR').box('k', 12.5, () => {}); return null }))
  t('Manage\'s number boxes: an English locale gets exactly { type: "number", value, onChange }; French a text box with inputMode="decimal" showing "12,5"',
    JSON.stringify(Object.keys(enBox)) === JSON.stringify(['type', 'value', 'onChange']) && enBox.type === 'number' && enBox.value === 12.5 && frBox.type === 'text' && frBox.inputMode === 'decimal' && frBox.value === '12,5')
  t('every Manage price / money box goes through it (item, import review, deals, extras, event pricing, charges)', /priceBox\.box\('item'/.test(read('app/manage/[token]/page.tsx')) && /priceBox\.rawBox\(`import-/.test(read('app/manage/[token]/page.tsx')) && /dealBox\.box\('price'/.test(read('app/manage/[token]/page.tsx'))
    && /normaliseDecimal\(priceInput/.test(read('components/manage/ExtrasEditor.tsx')) && (read('components/shared/PriceControls.tsx').match(/normaliseDecimal\(/g) || []).length === 2 && (read('components/manage/ChargesCard.tsx').match(/normaliseDecimal\(/g) || []).length >= 4)
  t('no country check: the separator comes from Intl in lib/decimal-input.ts', !/'FR'|fr-FR/.test(code('lib/decimal-input.ts')) && /formatToParts\(1\.5\)/.test(read('lib/decimal-input.ts')))

  // ══ 8 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('8 · CARDS — the label stays English in the row, « cartes de l’EEE » in French; no surcharge, no service fee, tipping off')
  const CF = await kit.bundle('fr1-cards', "export * from '@/lib/card-fees'")
  t('France: « cartes de l’EEE » (online: « cartes de l’EEE standard »); the row keeps "EEA cards"', CF.cardRegionInPerson(FR) === 'cartes de l’EEE' && CF.cardRegionOnline(FR).replace(NB, ' ') === 'cartes de l’EEE standard' && FR.cardFeeRegionLabel === 'EEA cards')
  t('every English row shows its stored label exactly (Ireland "EEA cards", UK "UK cards" …)', frOn.filter(r => r.countryCode !== 'FR').every(r => { const s = { ...r, locale: r.locale }; return CF.cardRegionInPerson(s) === r.cardFeeRegionLabel }))
  t('the card processor’s French fees (its French pricing page): online 1,5 % + 0,25 €, in person 1,4 % + 0,10 €, Tap to Pay + 0,10 €', FR.cardFeeOnlinePct === 1.5 && FR.cardFeeOnlineFixedMinor === 25 && FR.cardFeeInPersonPct === 1.4 && FR.cardFeeInPersonFixedMinor === 10 && FR.tapToPayFixedMinor === 10)
  t('no surcharge, no service fee, tipping off with no presets', FR.cardSurchargeAllowed === false && FR.serviceFeeAllowed === false && FR.tippingEnabledDefault === false && FR.tipPresetsPct.length === 0)

  // ══ 9 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('9 · THE NOT RUN SQL')
  const A_SQL = read('supabase/migrations/20261033_france_address_format.sql'), { row, prices, sql } = FF.sqlRows()
  t('block A widens the address-format CHECK to gb, us, ie, au, nz, ca, fr (and says it runs before block B)', /check \(address_format in \('gb', 'us', 'ie', 'au', 'nz', 'ca', 'fr'\)\)/.test(A_SQL) && /BEFORE block B/.test(A_SQL))
  t('block B inserts FR switched OFF: EUR, fr-FR, 24h, dmy, Monday, km, +33 (06 12 34 56 78), format fr, Europe/Paris, TVA included, short name France',
    row.enabled === false && row.currency === 'EUR' && row.locale === 'fr-FR' && row.time_format === '24h' && row.date_order === 'dmy' && row.week_start === 'monday' && row.distance_unit === 'km'
    && row.phone_country_code === '33' && row.phone_example === '06 12 34 56 78' && row.address_format === 'fr' && JSON.stringify(row.timezones) === '["Europe/Paris"]' && row.default_timezone === 'Europe/Paris'
    && row.prices_include_tax === true && row.tax_label === 'TVA' && row.short_name === 'France' && row.allergen_set === 'uk14' && row.allergen_card_only_allowed === true)
  t('…its comments say why there is no surcharge (CMF L. 112-12) and no service fee (Code de la consommation L. 112-1)', /L\. 112-12/.test(sql) && /L\. 112-1;/.test(sql) && row.card_surcharge_allowed === false && row.service_fee_allowed === false)
  t('…plan_prices at Ireland\'s euro prices: payg 0 / 0 / 99 bps / 0 · pro 2900 incl. 400000, 99 bps, van 2900 · unlimited 6900, no fee, van 6900',
    JSON.stringify(prices.map(p => [p.plan_key, p.monthly_minor, p.included_online_minor, p.fee_bps, p.extra_van_monthly_minor])) === JSON.stringify([['payg', 0, 0, 99, 0], ['pro', 2900, 400000, 99, 2900], ['unlimited', 6900, null, 0, 6900]]))
  const Ph = await kit.bundle('fr1-phone', "export { isPlausiblePhone } from '@/lib/phone'")
  t('the phone example passes the app\'s phone check for France; a short one does not', Ph.isPlausiblePhone('06 12 34 56 78', 'FR', 'length') && !Ph.isPlausiblePhone('06 12', 'FR', 'length'))
  t('France has its address /fr (COUNTRY_PATH_SEGMENTS), the one table that gives a country a page', /FR: 'fr' \}/.test(read('lib/marketing-country.ts')))

  // ══ 10 ═══════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('10 · THE TERMS — a France section, the same shape and English as the others')
  const terms = read('content/legal/country-specific-terms.md')
  const fr = terms.slice(terms.indexOf('## France'))
  t('a "## France" section with "### For food truck operators" and "### Privacy, for everyone in France"', terms.includes('## France') && has(fr, '### For food truck operators', '### Privacy, for everyone in France'))
  t('it names the Code de la consommation, the truck as seller, TVA, the 14 allergens (R. 412-12 to R. 412-16), euros, Cartes Bancaires, the mediator, the CNIL, governing law',
    has(fr, 'You are the seller', 'Code de la consommation', 'TVA', 'R. 412-12 to R. 412-16', 'in euros', 'Cartes Bancaires', 'consumer mediator', 'CNIL', 'law of England and Wales'))
  const legal = read('lib/legal.ts')
  const updated = /COUNTRY_TERMS_UPDATED = '([^']+)'/.exec(legal)?.[1], version = /TERMS_VERSION = '([^']+)'/.exec(legal)?.[1]
  t('the page\'s date, its "Last updated" line and TERMS_VERSION agree (22 October 2026 / 2026-10-22)', updated === '22 October 2026' && terms.includes(`**Last updated:** ${updated}`) && version === '2026-10-22')

  // ── --shots: the real /fr pages, the PDF and the confirmation email painted with the build's CSS (docs/france-1/) ──
  if (process.argv.includes('--shots')) {
    head('SCREENSHOTS — /fr landing, /features, /compare, the PDF, the confirmation email (WebKit and Chromium, 390 and 1280)')
    const { chromium, webkit } = require(path.join(REPO, 'node_modules/playwright'))
    const cssDir = path.join(REPO, '.next/static/chunks')
    const css = fs.readdirSync(cssDir).filter(f => f.endsWith('.css')).map(f => fs.readFileSync(path.join(cssDir, f), 'utf8')).join('\n')
    const OUT = path.join(REPO, 'docs/france-1'); fs.mkdirSync(OUT, { recursive: true })
    const VIEWS = { 'fr-landing': P.landing.html, 'fr-features': P.features.html, 'fr-compare': P.compare.html, 'fr-plans-pdf': pdf, 'fr-email-confirmation': conf.html }
    const found = []
    for (const [eng, E2] of [['webkit', webkit], ['chromium', chromium]]) {
      const browser = await E2.launch()
      for (const [name, html] of Object.entries(VIEWS)) for (const w of [390, 1280]) {
        const pg = await browser.newPage({ viewport: { width: w, height: 900 } })
        const full = /<html/i.test(html) ? html.replace(/<head>/i, `<head><style>${css}</style>`) : `<!doctype html><html lang="fr-FR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{background:#fff;margin:0}</style></head><body>${html}</body></html>`
        await pg.setContent(full, { waitUntil: 'load' }); await pg.waitForTimeout(200)
        const over = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth)
        await pg.screenshot({ path: path.join(OUT, `${name}-${eng}-${w}.png`), fullPage: true })
        found.push({ name, eng, w, sideways: over > 1 }); await pg.close()
      }
      await browser.close()
    }
    fs.writeFileSync(path.join(OUT, 'fr-pages-measurements.json'), JSON.stringify(found, null, 1) + '\n')
    t(`${found.length} screenshots written to docs/france-1/; none scrolls sideways`, found.every(f => !f.sideways), found.filter(f => f.sideways))
  }

  console.log(`\n${fail ? '🔴' : '✅'} france-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
