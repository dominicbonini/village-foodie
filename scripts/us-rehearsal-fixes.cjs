// scripts/us-rehearsal-fixes.cjs — the US dress rehearsal fixes (docs/us-dress-rehearsal-fixes-report.md), proved on
// FIXTURES (the in-memory database of scripts/_fake-pg.cjs; nothing live, nothing sent). BEFORE is this tree with the
// changed files swapped for their pre-fix source (git HEAD for files these fixes were the first to touch), bundled
// side by side, so a "byte-identical" check compares real renders of both codes.
//
//   1  the public truck page — a truck with no discovery row is drawn from its own operator row on HatchGrab
//   2  the KDS start banner and the future-start confirmation (words; the screens are proved on the twin)
//   3  the charge summary — one line plainly, two or more folded and named by their parts
//   4  the cancel page — the card-refund sentence only when a card paid or is held
//   5  the address line — "Pier A Park, Hoboken, NJ 07030" when the event has a state; every other line as before
const fs = require('fs'); const path = require('path'); const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'us-rehearsal-fixes' })
const { makeFakePg } = require('./_fake-pg.cjs')
const SEEDS = require('./_country-settings-gb.cjs')

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 900)}` : ''}`) } }
const head = s => console.log(`\n${s}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const atHead = f => execFileSync('git', ['show', `HEAD:${f}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 })
const whole = (file, src) => ({ file, from: /^[\s\S]*$/, to: () => src })
const textOf = html => html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const MSG = JSON.parse(read('messages/en-GB.json'))

// The pre-fix TruckListCard: this tree's file without the one address-line change (it carried earlier uncommitted work).
const cardBefore = () => {
  let s = read('components/TruckListCard.tsx')
  const imp = "import { eventAreaLineWithRegion } from '@/lib/event-address';\n"
  const now = "  // 19 October 2026: an event with a state reads \"Hoboken, NJ 07030\" (lib/event-address.ts); without one, as before.\n  const areaLine = eventAreaLineWithRegion({ town: showVillage ? event.village : null, region: event.region, postcode: event.postcode })\n    ?? [showVillage ? event.village : null, event.postcode].filter(Boolean).join(' · ');\n"
  if (!s.includes(imp) || !s.includes(now)) throw new Error('TruckListCard: the fix is not where this harness expects it')
  return s.replace(imp, '').replace(now, "  const areaLine = [showVillage ? event.village : null, event.postcode].filter(Boolean).join(' · ');\n")
}

;(async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9'
  process.env.SUPABASE_URL = 'http://127.0.0.1:9'
  process.env.NEXT_PUBLIC_HATCHGRAB_URL = 'https://www.hatchgrab.com'
  process.env.BREVO_API_KEY = 'us-rehearsal-fixes-no-send'
  const sent = []
  globalThis.fetch = async (url, init) => { if (!String(url).startsWith('https://api.brevo.com/')) throw new Error('unexpected fetch ' + url); sent.push(JSON.parse(init.body)); return { ok: true, text: async () => '', json: async () => ({}) } }
  kit.setNow('2026-10-19T14:00:00Z'); kit.setDeviceTz('Europe/London')
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const CS = [snake(SEEDS.gbFromSeed()), snake(SEEDS.usFromSeed())]
  const clear = "\nexport { clearCountrySettingsCache } from '@/lib/country-settings'"
  const PAGE_STUBS = {
    'next/script': "import { createElement } from 'react'\nexport default function Script(p) { return createElement('script', { 'data-src': p.src || '' }) }",
    'next/dynamic': 'export default function dynamic() { return function Dynamic() { return null } }',
    'posthog-js/react': 'export const usePostHog = () => null\nexport function PostHogProvider(p) { return p.children }',
    '@/hooks/useVillageData': 'export function useVillageData() { return globalThis.__tcData }',
    'next/headers': "export async function headers() { return new Map([['host', globalThis.__host || '']]) }",
  }
  const FEED_FILE = 'app/api/discovery/events/route.ts'
  const PAGE_FILES = ['app/trucks/[slug]/page.tsx', 'app/trucks/[slug]/TruckClient.tsx']
  const FEED = { A: await kit.bundle('usrf-feed-a', `export { GET } from '@/${FEED_FILE}'` + clear),
    B: await kit.bundle('usrf-feed-b', `export { GET } from '@/${FEED_FILE}'` + clear, { patches: [whole(FEED_FILE, atHead(FEED_FILE))] }) }
  const PAGE = { A: await kit.bundle('usrf-page-a', "export { default } from '@/app/trucks/[slug]/page'" + clear, { stubs: PAGE_STUBS }),
    B: await kit.bundle('usrf-page-b', "export { default } from '@/app/trucks/[slug]/page'" + clear, { stubs: PAGE_STUBS,
      patches: [...PAGE_FILES.map(f => whole(f, atHead(f))), whole('components/TruckListCard.tsx', cardBefore())] }) }

  // ── the world: Gusto-shaped and Pizza Kitchen-shaped trucks (each with a discovery row), and three with none ──
  const truck = (id, name, slug, cc, more = {}) => ({ id, name, slug, country: cc, timezone: cc === 'US' ? 'America/New_York' : null, active: true, excluded: false,
    show_on_vf: true, show_on_hg: true, order_link_vf: false, order_link_hg: true, cuisine_type: 'Pizza', logo_storage_path: null, cover_image_path: null,
    contact_phone: null, website: null, social_instagram: null, social_facebook: null, phone_is_whatsapp: false, ...more })
  const TRUCKS = {
    gusto: truck('t-gusto', 'Pizzeria Gusto', 'pizzeria-gusto', 'GB', { contact_phone: '07700 900123' }),
    pk: truck('t-pk', 'Pizza Kitchen', 'test-kitchen', 'GB', { show_on_vf: false, show_on_hg: false }),
    newGb: truck('t-new-gb', 'Fenland Fryer', 'fenland-fryer', 'GB', { cuisine_type: 'Fish & chips', contact_phone: '07700 900456', website: 'fenlandfryer.example', social_instagram: '@fenlandfryer' }),
    hiddenGb: truck('t-hidden-gb', 'Hidden Bites', 'hidden-bites', 'GB', { show_on_hg: false }),
    us: truck('test-truck-us', 'Pizza Kitchen US', 'test-kitchen-us', 'US', { cuisine_type: 'Thai', contact_phone: '(201) 555-0142' }),
  }
  const disc = (id, name, hgId, more = {}) => ({ id, name, aliases: [], country: 'GB', show_on_vf: true, show_on_hg: true, excluded: false, exclude_reason: null, cuisine: 'Pizza',
    phone: null, mobile: null, order_url: null, accepted_methods: null, notes: null, website: null, menu_url: null, logo_url: null, photo_url: null, hatchgrab_truck_id: hgId, ...more })
  const DISC = [disc('dt-gusto', 'Pizzeria Gusto', 't-gusto'), disc('dt-pk', 'Pizza Kitchen', 't-pk')]
  const ev = (id, tr, venue, town, postcode, more = {}) => ({ id, truck_id: tr.id, event_date: '2026-10-25', start_time: '11:30:00', end_time: '20:00:00', venue_name: venue, town, postcode,
    latitude: null, longitude: null, notes: null, status: 'confirmed', is_private: false, venue_id: null, truck_place_id: null, ...more, trucks: tr })
  const world = ({ region = true } = {}) => ({
    trucks: Object.values(TRUCKS),
    truck_events: [
      ev('ev-gusto', TRUCKS.gusto, 'The Bell', 'Castle Hedingham', 'CO9 3EJ'),
      ev('ev-pk', TRUCKS.pk, 'Market Square', 'Springfield', 'CB8 8PD'),
      ev('ev-new-gb', TRUCKS.newGb, 'The Green', 'Wickhambrook', 'CB8 8XX'),
      ev('ev-hidden-gb', TRUCKS.hiddenGb, 'The Swan', 'Lavenham', 'CO10 9QA'),
      ev('ev-us', TRUCKS.us, 'Pier A Park', 'Hoboken', '07030', region ? { region: 'NJ' } : {}),
    ],
    discovery_trucks: DISC,
    discovery_events: [{ id: 'de-pk', event_date: '2026-10-26', start_time: '12:00', end_time: '14:00', truck_name: 'Pizza Kitchen', venue_name: 'Village Green', village: 'Springfield', event_notes: null,
      discovery_truck_id: 'dt-pk', venue_id: null, show_on_vf: true, show_on_hg: true, superseded_by: null, country: 'GB', discovery_trucks: DISC[1], venues: null }],
    venues: [], country_settings: CS,
  })
  const useDb = w => { globalThis.__harnessDb = makeFakePg(w); for (const m of [FEED.A, FEED.B, PAGE.A, PAGE.B]) m.clearCountrySettingsCache?.() }
  const HOSTS = { hg: 'www.hatchgrab.com', vf: 'www.villagefoodie.co.uk' }
  const feed = async (code, host) => (await kit.quietAsync(() => FEED[code].GET(new NextRequest(`https://${host}/api/discovery/events`, { headers: { host } })))).json()
  const page = async (code, host, slug, w = world()) => {
    useDb(w)
    const j = await feed(code, host)
    globalThis.__host = host
    const el = await kit.quietAsync(() => PAGE[code].default({ params: Promise.resolve({ slug }) }))
    globalThis.__tcData = { loading: false, loadError: false, refetch() {}, mapEvents: j.events, allTrucks: j.trucks }
    try { return kit.renderStatic(el) } finally { delete globalThis.__tcData; delete globalThis.__host }
  }
  const NOT_FOUND = MSG.truckPage.notFound.title
  const VF_PROMPTS = [MSG.truckPage.ownThisTruck, MSG.truckPage.weeklySchedule, MSG.truckPage.noEvents?.cta].filter(Boolean)

  // ════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · the public truck page')
  {
    useDb(world())
    const vfA = await feed('A', HOSTS.vf), vfB = await feed('B', HOSTS.vf)
    t('Village Foodie feed: byte-identical to BEFORE (no truckSlug, no new truck, no US row)', JSON.stringify(vfA) === JSON.stringify(vfB), { a: JSON.stringify(vfA).slice(0, 300), b: JSON.stringify(vfB).slice(0, 300) })
    const hgA = await feed('A', HOSTS.hg), hgB = await feed('B', HOSTS.hg)
    const strip = j => ({ ...j, events: j.events.map(({ truckSlug, region, ...e }) => e) })
    t('HatchGrab feed: BEFORE plus only `truckSlug` on operator events (and `region` where a state is known)', JSON.stringify(strip(hgA)) === JSON.stringify(hgB) && hgA.events.filter(e => e.source === 'operator').every(e => e.truckSlug),
      { a: JSON.stringify(strip(hgA)).slice(0, 400), b: JSON.stringify(hgB).slice(0, 400) })
    t('HatchGrab feed: the US event carries region "NJ"; no GB event carries a region', hgA.events.find(e => e.id === 'ev-us')?.region === 'NJ' && hgA.events.filter(e => e.id !== 'ev-us').every(e => !('region' in e)))

    for (const [label, slug] of [['Gusto-shaped (operator truck + linked discovery row)', 'pizzeria-gusto'], ['Pizza Kitchen-shaped, by its discovery name', 'pizza-kitchen'], ['Pizza Kitchen-shaped, by its hidden operator slug', 'test-kitchen'],
      ['GB public truck with no discovery row', 'fenland-fryer'], ['hidden GB truck with no discovery row', 'hidden-bites'], ['US public truck with no discovery row', 'test-kitchen-us']]) {
      const vf = [await page('A', HOSTS.vf, slug), await page('B', HOSTS.vf, slug)]
      t(`Village Foodie host, ${label}: byte-identical to BEFORE`, vf[0] === vf[1], textOf(vf[0]).slice(0, 300))
    }
    for (const [label, slug] of [['Gusto-shaped', 'pizzeria-gusto'], ['Pizza Kitchen-shaped (discovery name)', 'pizza-kitchen'], ['Pizza Kitchen-shaped (hidden operator slug)', 'test-kitchen'], ['hidden GB truck with no discovery row', 'hidden-bites']]) {
      const a = await page('A', HOSTS.hg, slug), b = await page('B', HOSTS.hg, slug)
      t(`HatchGrab host, ${label}: byte-identical to BEFORE`, a === b, { a: textOf(a).slice(0, 300), b: textOf(b).slice(0, 300) })
    }
    const hid = textOf(await page('A', HOSTS.hg, 'hidden-bites'))
    t('a hidden truck (show_on_hg false) with no discovery row: "Truck not found"', hid.includes(NOT_FOUND), hid.slice(0, 300))
    const pkOp = textOf(await page('A', HOSTS.hg, 'test-kitchen'))
    t('Pizza Kitchen-shaped by its hidden operator slug: still "Truck not found"', pkOp.includes(NOT_FOUND))

    const gbB = textOf(await page('B', HOSTS.hg, 'fenland-fryer')), gbHtml = await page('A', HOSTS.hg, 'fenland-fryer'), gb = textOf(gbHtml)
    t('BEFORE: a GB public truck with no discovery row read "Truck not found"', gbB.includes(NOT_FOUND))
    t('AFTER: it renders — name, cuisine, its event (The Green, Wickhambrook · CB8 8XX, Sun 25 Oct), Call/Message, website, Instagram',
      !gb.includes(NOT_FOUND) && gb.includes('Fenland Fryer') && gb.includes('Fish & chips') && gb.includes('The Green') && gb.includes('Wickhambrook · CB8 8XX')
      && /Sun 25 Oct/.test(gb) && gb.includes('11:30') && gbHtml.includes('href="tel:07700900456"') && gbHtml.includes('href="https://fenlandfryer.example"') && gbHtml.includes('href="https://instagram.com/fenlandfryer"'), gb.slice(0, 700))
    t('…and none of Village Foodie\'s discovery prompts (it is not a listed discovery truck)', VF_PROMPTS.every(p => !gb.includes(p)), VF_PROMPTS)
    const gbVf = textOf(await page('A', HOSTS.vf, 'fenland-fryer'))
    t('…while the Village Foodie host still says "Truck not found" for it (Village Foodie unchanged)', gbVf.includes(NOT_FOUND))

    const usHtml = await page('A', HOSTS.hg, 'test-kitchen-us'), us = textOf(usHtml)
    t('US public truck with no discovery row: renders in US formats — "Sun, Oct 25", "11:30 AM", "Hoboken, NJ 07030", phone',
      !us.includes(NOT_FOUND) && us.includes('Pizza Kitchen US') && us.includes('Pier A Park') && us.includes('Hoboken, NJ 07030') && /Sun, Oct 25/.test(us) && /11:30\s?AM/.test(us) && usHtml.includes('href="tel:2015550142"'), us.slice(0, 700))
    t('…with no Village Foodie prompt', VF_PROMPTS.every(p => !us.includes(p)) && !us.includes(MSG.truckPage.missingEvent?.slice?.(0, 12) || '\u0000'))
    const usNoCol = textOf(await page('A', HOSTS.hg, 'test-kitchen-us', world({ region: false })))
    t('…and before the migration (no region): "Hoboken · 07030", exactly the line it had', usNoCol.includes('Hoboken · 07030') && !usNoCol.includes(', NJ'), usNoCol.slice(0, 500))
    const usVf = textOf(await page('A', HOSTS.vf, 'test-kitchen-us'))
    t('the US truck on the Village Foodie host: "Truck not found" (Village Foodie is UK-only)', usVf.includes(NOT_FOUND))
    fs.mkdirSync(path.join(REPO, 'docs/us-dress-rehearsal'), { recursive: true })
    fs.writeFileSync(path.join(REPO, 'docs/us-dress-rehearsal/fixture-truck-page-us.html'), usHtml)
    fs.writeFileSync(path.join(REPO, 'docs/us-dress-rehearsal/fixture-truck-page-gb-new.html'), gbHtml)
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · the KDS start banner and the future-start confirmation')
  {
    const m = await kit.bundle('usrf-words', "export { translatorFor } from '@/lib/i18n/translator'\nimport '@/lib/i18n/catalog/kds'\nimport '@/lib/i18n/catalog/dashboard'\nexport { formatShortDate, formatTimeRange } from '@/lib/time-utils'")
    const US = { timeZone: 'America/New_York', locale: 'en-US', timeFormat: '12h', dateOrder: 'mdy', weekStart: 'sunday' }
    const GB = { timeZone: 'Europe/London', locale: 'en-GB', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' }
    const us = m.translatorFor('en-US', 'kds'), gb = m.translatorFor('en-GB', 'kds')
    const usBanner = us('banner.onDate', { date: m.formatShortDate('2026-10-25', US), range: m.formatTimeRange('11:30', '20:00', US) })
    t('US, a future event: "Sun, Oct 25 · 11:30 AM – 8:00 PM"', usBanner.replace(/[  ]/g, ' ') === 'Sun, Oct 25 · 11:30 AM – 8:00 PM', usBanner)
    t('GB, a future event: "Sun 25 Oct · 11:30 – 20:00"', gb('banner.onDate', { date: m.formatShortDate('2026-10-25', GB), range: m.formatTimeRange('11:30', '20:00', GB) }) === 'Sun 25 Oct · 11:30 – 20:00')
    t('today\'s event keeps "Today · {range}" (the message is unchanged)', gb('banner.today', { range: '11:30 – 20:00' }) === 'Today · 11:30 – 20:00')
    t('KDS confirmation: "This event is on Sun, Oct 25. Start it now?"', us('event.startFutureConfirm', { date: m.formatShortDate('2026-10-25', US) }) === 'This event is on Sun, Oct 25. Start it now?')
    t('dashboard confirmation: the same words', m.translatorFor('en-US', 'dashboard')('startFutureConfirm', { date: 'Sun, Oct 25' }) === 'This event is on Sun, Oct 25. Start it now?')
    const kds = read('app/dashboard/[token]/kds/page.tsx'), dash = read('app/dashboard/[token]/page.tsx')
    t('the KDS banner says "Today" only when event_date is the truck\'s today', /activeEvent\.event_date === getLocalDateInTz\(kdsTz\)\s*\? t\('banner\.today'/.test(kds) && kds.includes("t('banner.onDate', { date: formatShortDate(activeEvent.event_date, kdsTime)"))
    t('both openEvent paths confirm only for a date after the truck\'s today, before any request',
      /ev\.event_date > getLocalDateInTz\(kdsTz\) && !window\.confirm\(t\('event\.startFutureConfirm'[\s\S]{0,200}\)\)\) return\n    try \{/.test(kds)
      && /startDate>getLocalDateInTz\(dashTz\)&&!window\.confirm\(tDash\('startFutureConfirm'[\s\S]{0,120}\)\)\)return\n    const wasClosedEvent/.test(dash))
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · the charge summary')
  {
    const USD = { currency: 'USD', locale: 'en-US' }
    const base = { food_minor: 2400, tax_minor: 0, tax_rate_milli: null, tax_label: 'Sales tax', tip_minor: 0, tip_pct_bps: null, service_fee_minor: 0, card_surcharge_minor: 0 }
    const combos = {
      tax: [{ tax_minor: 159, tax_rate_milli: 6625 }, null, 'Sales tax 6.625% $1.59'],
      tax_tip: [{ tax_minor: 159, tax_rate_milli: 6625, tip_minor: 360, tip_pct_bps: 1500 }, 'Tax & tip', null],
      fees_tip: [{ service_fee_minor: 102, tip_minor: 360, tip_pct_bps: 1500 }, 'Fees & tip', null],
      tax_fees: [{ tax_minor: 198, tax_rate_milli: 8250, service_fee_minor: 102 }, 'Tax & fees', null],
      tax_fees_tip: [{ tax_minor: 198, tax_rate_milli: 8250, service_fee_minor: 102, tip_minor: 360, tip_pct_bps: 1500 }, 'Tax, fees & tip', null],
      fees: [{ service_fee_minor: 102, card_surcharge_minor: 80 }, 'Fees', null],
    }
    const cr = await kit.bundle('usrf-chargerows', "export { FoldedChargeRows } from '@/components/ChargeRows'\nexport { I18nContext } from '@/lib/i18n/use-t'")
    const cards = await kit.bundle('usrf-cards', "export * from '@/components/dashboard/OrderCard'\nexport { MoneyProvider } from '@/components/MoneyContext'")
    const el = kit.h
    const amount = n => '$' + n.toFixed(2)
    const TRK = { id: 'test-truck-us', name: 'Pizza Kitchen US', slug: 'test-kitchen-us', mode: 'village', dashboard_token: 'harness', currency: 'USD', country: 'US', plan: 'pro',
      show_paid_step: true, completion_presses: 'two', takes_cash: false, auto_accept: false, kds_mode: false, money: { ...USD, localeByCountry: { US: 'en-US' } } }
    const EV = { id: 'ev-1', date: '2026-10-25', venue_name: 'Pier A Park', town: 'Hoboken', start_time: '11:30', end_time: '20:00', van_id: null }
    const card = snap => {
      const food = 24, extra = Object.entries(snap).filter(([k]) => /_minor$/.test(k)).reduce((s, [, v]) => s + v, 0) / 100
      const order = { id: '1', order_key: 'ok-1', customer_name: 'US Test', customer_phone: null, customer_email: null, slot: '12:30', event_date: '2026-10-25', event_id: 'ev-1',
        items: [{ name: 'Margherita', quantity: 2, unit_price: 12, modifiers: [] }], deals: [], notes: null, total: food + extra, total_minor: Math.round((food + extra) * 100), currency: 'USD', country: 'US', status: 'confirmed', payment_status: 'unpaid', created_at: '2026-10-19T13:50:00Z', ...base, ...snap }
      const html = kit.renderStatic(el(cards.MoneyProvider, { fmt: USD }, el(cards.OrderCard, { order, truck: TRK, event: EV, slots: [], actionLoading: null, onAction() {}, onRefund: async () => ({ ok: true }), onEdit() {},
        kdsMode: false, viewMode: 'solo', ledgerRows: [], heldAuthorisation: false, effectiveOrderReady: true, readyStepOn: true, vanTakesCash: false })))
      return { html, text: textOf(html) }
    }
    for (const [k, [snap, fold, plain]] of Object.entries(combos)) {
      const basket = textOf(kit.renderStatic(el(cr.I18nContext.Provider, { value: { locale: 'en-US', setLocale() {} } }, el(cr.FoldedChargeRows, { charges: { ...base, ...snap }, amount, expanded: false, onToggle() {} }))))
      const c = card(snap)
      if (fold) {
        t(`${k}: basket folds as "${fold}"; dashboard card "${fold} ▾"`, basket.startsWith(`Subtotal $24.00 ${fold}`) && c.text.includes(`${fold} ▾`) && /data-charge-summary/.test(c.html), { basket, card: c.text.slice(0, 400) })
      } else {
        t(`${k}: one line, plainly — basket "Subtotal $24.00 ${plain}", dashboard card "${plain}" with no fold`, basket === `Subtotal $24.00 ${plain}` && c.text.includes(plain) && !/▾|aria-expanded/.test(c.html.slice(c.html.indexOf('data-charge-lines'), c.html.indexOf('data-charge-lines') + 600)), { basket, card: c.text.slice(0, 400) })
      }
    }
    const uk = textOf(kit.renderStatic(el(cards.MoneyProvider, { fmt: { currency: 'GBP', locale: 'en-GB' } }, el(cards.OrderCard, {
      order: { id: '2', order_key: 'ok-2', customer_name: 'Ann', slot: '12:30', event_date: '2026-10-25', event_id: 'ev-1', items: [{ name: 'Margherita', quantity: 1, unit_price: 12, modifiers: [] }], deals: [], notes: null, total: 12, total_minor: 1200, currency: 'GBP', country: 'GB', status: 'confirmed', payment_status: 'unpaid', created_at: '2026-10-19T13:50:00Z', tax_minor: 0, tax_label: 'VAT', tip_minor: 0, service_fee_minor: 0 },
      truck: { ...TRK, currency: 'GBP', country: 'GB', money: { currency: 'GBP', locale: 'en-GB', localeByCountry: { GB: 'en-GB' } } }, event: EV, slots: [], actionLoading: null, onAction() {}, onRefund: async () => ({ ok: true }), onEdit() {},
      kdsMode: false, viewMode: 'solo', ledgerRows: [], heldAuthorisation: false, effectiveOrderReady: true, readyStepOn: true, vanTakesCash: true }))))
    t('a GB order shows nothing new (no charge line at all)', !/Subtotal|VAT|Tax|Fees|Tip/.test(uk), uk.slice(0, 300))
    t('one ICU select names the fold (no hand-built string)', /"foldedCharges": "\{parts, select, /.test(read('messages/en-GB.json')) && /"chargesSummary": "\{parts, select, /.test(read('messages/en-GB.json')))
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · the cancel page')
  {
    const P = await kit.bundle('usrf-cancel', "export { default } from '@/app/order/[id]/manage/page'\nexport { I18nContext } from '@/lib/i18n/use-t'",
      { patches: [{ file: 'app/order/[id]/manage/page.tsx', states: ['loading', 'cancelled', 'cancelPaymentState', 'order'] }] })
    const render = (state, locale = 'en-GB') => {
      globalThis.__ms = { loading: false, cancelled: true, cancelPaymentState: state, order: { truck_name: 'Pizza Kitchen', status: 'confirmed' } }
      try { return textOf(kit.renderStatic(kit.h(P.I18nContext.Provider, { value: { locale, setLocale() {} } }, kit.h(P.default)))) } finally { delete globalThis.__ms }
    }
    const card = 'If you paid by card, any refund is handled by Pizza Kitchen directly — please contact them about it.'
    t('pay at the truck (\'hatch\'): "Your order has been cancelled." and nothing about a card', render('hatch').includes('Your order has been cancelled.') && !render('hatch').includes('If you paid by card'), render('hatch'))
    for (const s of ['captured', 'part_paid', 'held', 'held_short', 'unknown', null]) t(`payment state ${s}: the card sentence stays, word for word`, render(s).includes(`Your order has been cancelled. ${card}`), render(s))
    t('US, pay at the truck: "Your order has been canceled." alone', render('hatch', 'en-US').includes('Your order has been canceled.') && !render('hatch', 'en-US').includes('card'))
    t('the cancel API returns its payment state (an added field)', read('app/api/orders/cancel/route.ts').includes('return NextResponse.json({ ok: true, paymentState })'))
  }

  // ════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · the address line with a state')
  {
    const addr = await kit.bundle('usrf-addr', "export * from '@/lib/event-address'")
    t('with a state: "Pier A Park, Hoboken, NJ 07030"', addr.eventAddressLine({ venueName: 'Pier A Park', town: 'Hoboken', region: 'NJ', postcode: '07030' }) === 'Pier A Park, Hoboken, NJ 07030')
    t('without one: the old join exactly ("The Bell, Castle Hedingham, CO9 3EJ")', addr.eventAddressLine({ venueName: 'The Bell', town: 'Castle Hedingham', postcode: 'CO9 3EJ' }) === 'The Bell, Castle Hedingham, CO9 3EJ')
    t('a stored value that is not two letters is no state', addr.eventAddressLine({ venueName: 'Pier A Park', town: 'Hoboken', region: 'New Jersey', postcode: '07030' }) === 'Pier A Park, Hoboken, 07030')
    const E = file => [{ file: 'lib/email.ts', from: /^[\s\S]*$/, to: () => file }]
    const EMAIL = { A: await kit.bundle('usrf-email-a', "export { formatConfirmationEmail, formatNewOrderEmail, sendEventCancellationEmail } from '@/lib/email'"),
      B: await kit.bundle('usrf-email-b', "export { formatConfirmationEmail, formatNewOrderEmail, sendEventCancellationEmail } from '@/lib/email'", { patches: E(atHead('lib/email.ts')) }) }
    const GBT = { timeZone: 'Europe/London', locale: 'en-GB', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' }
    const UST = { timeZone: 'America/New_York', locale: 'en-US', timeFormat: '12h', dateOrder: 'mdy', weekStart: 'sunday' }
    const common = (cc, extra = {}) => ({ money: cc === 'US' ? { currency: 'USD', locale: 'en-US' } : { currency: 'GBP', locale: 'en-GB' }, time: cc === 'US' ? UST : GBT, phoneCountry: cc,
      orderId: '7', orderKey: 'ok-7', truckName: 'Pizza Kitchen', customerName: 'Ann', customerPhone: null, items: [{ name: 'Margherita', quantity: 1, unit_price: 12, modifiers: [] }], deals: [], discountAmt: 0, total: 12,
      notes: null, slot: '12:30', autoAccepted: true, preferredContactMethod: null, contactPhone: null, whatsappSender: null, allowCancellation: true, cancellationCutoffMins: 30,
      baseUrl: 'https://www.hatchgrab.com', truckSlug: 'test-kitchen', eventDate: '2026-10-25', ...extra })
    const gbVenue = { venueName: 'The Bell', venueTown: 'Castle Hedingham', venuePostcode: 'CO9 3EJ' }
    for (const fn of ['formatConfirmationEmail', 'formatNewOrderEmail']) {
      const a = EMAIL.A[fn](common('GB', gbVenue)), b = EMAIL.B[fn](common('GB', gbVenue))
      t(`GB ${fn}: byte-identical to BEFORE (subject, HTML and text)`, JSON.stringify(a) === JSON.stringify(b))
      const us = EMAIL.A[fn](common('US', { venueName: 'Pier A Park', venueTown: 'Hoboken', venuePostcode: '07030', venueRegion: 'NJ' }))
      const usNo = EMAIL.A[fn](common('US', { venueName: 'Pier A Park', venueTown: 'Hoboken', venuePostcode: '07030' }))
      t(`US ${fn} with a state: "📍 Pier A Park, Hoboken, NJ 07030"`, us.html.includes('📍 Pier A Park, Hoboken, NJ 07030') && (fn === 'formatNewOrderEmail' || us.text.includes('📍 Pier A Park, Hoboken, NJ 07030')), us.html.slice(0, 200))
      t(`US ${fn} without one (migration not run): the line it had`, usNo.html.includes('📍 Pier A Park, Hoboken, 07030'))
    }
    const cancelArgs = { to: 'x@example.test', customerName: 'Ann', orderId: '7', truckName: 'Pizza Kitchen', note: null, paymentStatus: 'unpaid', eventDate: '2026-10-25' }
    sent.length = 0
    await EMAIL.A.sendEventCancellationEmail({ ...cancelArgs, venueName: 'The Bell', village: 'Castle Hedingham', time: GBT })
    await EMAIL.B.sendEventCancellationEmail({ ...cancelArgs, venueName: 'The Bell', village: 'Castle Hedingham', time: GBT })
    t('GB event-cancellation email: byte-identical to BEFORE', sent.length === 2 && JSON.stringify(sent[0]) === JSON.stringify(sent[1]))
    sent.length = 0
    await EMAIL.A.sendEventCancellationEmail({ ...cancelArgs, venueName: 'Pier A Park', village: 'Hoboken', region: 'NJ', time: UST })
    t('US event-cancellation email with a state: "Pier A Park, Hoboken, NJ"', JSON.stringify(sent[0] || {}).includes('Pier A Park, Hoboken, NJ'))
    const src = f => read(f)
    t('every email caller passes the state from the separate best-effort read (no named select gains a column)',
      (src('app/api/orders/submit/route.ts').match(/readEventRegion\(supabase, eventRow\?\.id\)/g) || []).length === 2
      && (src('lib/payments/promote-draft.ts').match(/readEventRegion\(supabase, eventRow\?\.id\)/g) || []).length === 2
      && (src('app/api/dashboard/action/route.ts').match(/readEventRegion\(supabase, \w+\?\.id\)/g) || []).length === 5
      && src('app/api/events/action/route.ts').includes('region: await readEventRegion(supabase, eventId)')
      && !/select\([^)]*\bregion\b/.test(src('app/api/orders/submit/route.ts') + src('lib/payments/promote-draft.ts') + src('app/api/dashboard/action/route.ts')))
    const m = src('app/api/manage/route.ts'), mp = src('app/manage/[token]/page.tsx')
    t('Manage saves the state only when the client sent it, in its own update after the save (never in the insert/update)',
      m.includes("if (body.region !== undefined && savedEvent?.id) {") && !/insert\(\{[^\n]*region/.test(m) && !/update\(\{ venue_name[^\n]*region/.test(m))
    t('the Edit event form sends `region` only in the US (zip_state) style; the importer only when it read a state',
      mp.includes("region: addrStyle === 'zip_state' ? normaliseRegion(editingEvent.region) : undefined,") && (mp.match(/\.\.\.\(normaliseRegion\(ev\.state\) \? \{ region: normaliseRegion\(ev\.state\) \} : \{\}\)/g) || []).length === 2)
    t('the migration is additive: nullable, no default, NOT APPLIED', /add column if not exists region text;/.test(src('supabase/migrations/20261019_truck_events_region.sql')) && !/default/i.test(src('supabase/migrations/20261019_truck_events_region.sql').split('begin;')[1]))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
