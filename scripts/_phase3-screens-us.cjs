// scripts/_phase3-screens-us.cjs — the AFTER-only half of scripts/phase3-screens.cjs (Phase 3 screens,
// docs/phase-3-screens-report.md). Run by phase3-screens.cjs; not on its own.
//
// US fixtures only — the US stays switched off in the database. The worked example everywhere is the brief's:
// $24.00 of food at 8.25 %, a 15 % tip and a service fee of 3 % + 30¢ →
//   Subtotal $24.00 · Sales tax 8.25% $1.98 · Online service fee $1.02 · Tip 15% $3.60 · Total $30.60.

const path = require('path')

module.exports = async function us(h) {
  const { kit, t, head, read, REPO, menuView, menuTables, statusView, statusTables, reportView, reportTables, reportOrders,
    ORDER_BASE, GB, US, TRUCK, makeFakePg, NextRequest, SEEDS, snake } = h
  const { renderWith, textOf, renderStatic } = kit
  const el = (...a) => kit.h(...a)
  const has = (text, ...parts) => parts.every(p => text.includes(p))

  const USD = { currency: 'USD', locale: 'en-US' }
  const US_TRUCK_COLS = { country: 'US', currency: 'USD', timezone: 'America/Chicago', tax_rate_milli: 8250, service_fee_enabled: true, service_fee_bps: 300, service_fee_fixed_minor: 30 }
  const US_ROW = (over = {}) => snake({ ...SEEDS.usFromSeed(), serviceFeeTruckMaxBps: 400, serviceFeeTruckMaxFixedMinor: 50, ...over })
  const US_SNAPSHOT = {
    food_minor: 2400, tax_minor: 198, tax_rate_milli: 8250, tax_inclusive: false, tax_label: 'Sales tax', tip_minor: 360, tip_pct_bps: 1500,
    service_fee_minor: 102, service_fee_recipient: 'truck', card_surcharge_minor: 0, card_funding: null, card_fee_payer: 'truck', application_fee_minor: null,
  }

  const m = {
    engine: await kit.bundle('p3-engine', "export * as E from '@/lib/order-charges'\nexport * as L from '@/lib/order-charge-lines'\nexport * as R from '@/lib/order-charge-rules'\nexport * as C from '@/lib/charge-settings'\nexport * as F from '@/lib/admin/country-form'"),
    email: await kit.bundle('p3-email', "export * as Mail from '@/lib/email'"),
    ticket: await kit.bundle('p3-ticket', "export * as T from '@/lib/printing/ticket'\nexport { mapOrderToTicket } from '@/lib/printing/mapOrderToTicket'"),
  }
  const { E, L, R, C, F } = m.engine
  const usRules = R.resolveChargeRules(SEEDS.usFromSeed() && { ...SEEDS.usFromSeed(), serviceFeeTruckMaxBps: 400, serviceFeeTruckMaxFixedMinor: 50 }, US_TRUCK_COLS)

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · the lines every surface draws (lib/order-charge-lines.ts)')
  {
    const cust = L.chargeLinesFor(US_SNAPSHOT)
    t('the customer lines, in order: Subtotal, Sales tax 8.25%, Online service fee, Tip 15%',
      JSON.stringify(cust.map(l => [l.label, l.rate, l.minor])) === JSON.stringify([['Subtotal', null, 2400], ['Sales tax', '8.25%', 198], ['Online service fee', null, 102], ['Tip', '15%', 360]]), JSON.stringify(cust))
    const kit_ = L.chargeLinesFor(US_SNAPSHOT, 'kitchen')
    t('the kitchen\'s words: "Service fee" and "Tip" (no percentage)', JSON.stringify(kit_.map(l => [l.label, l.rate])) === JSON.stringify([['Subtotal', null], ['Sales tax', '8.25%'], ['Service fee', null], ['Tip', null]]))
    t('the rate shows as entered, no trailing zeros: 8250 → 8.25, 8875 → 8.875, 7000 → 7, 500 → 0.5',
      L.formatRateMilli(8250) === '8.25' && L.formatRateMilli(8875) === '8.875' && L.formatRateMilli(7000) === '7' && L.formatRateMilli(500) === '0.5')
    t('a UK order — tax included, nothing else — has NO lines (so no surface draws anything new)',
      L.chargeLinesFor({ food_minor: 2400, tax_minor: 0, tax_inclusive: true, tax_label: 'VAT', tip_minor: 0, service_fee_minor: 0, card_surcharge_minor: 0 }).length === 0
      && L.chargeLinesFor(null).length === 0 && L.chargeLinesFor({}).length === 0)
    t('only non-zero lines: pay at the truck (tax only) → Subtotal and tax', JSON.stringify(L.chargeLinesFor({ ...US_SNAPSHOT, tip_minor: 0, service_fee_minor: 0 }).map(l => l.key)) === JSON.stringify(['subtotal', 'tax']))
    t('a custom tip has no percentage', L.chargeLinesFor({ ...US_SNAPSHOT, tip_pct_bps: null }).find(l => l.key === 'tip').rate === null)
    t('a 3-decimal rate: $24.00 at 8.875% → tax $2.13, line "Sales tax 8.875%"',
      (x => x.taxMinor === 213 && L.chargeLinesFor(x.snapshot).find(l => l.key === 'tax').rate === '8.875%')(E.computeOrderCharges({ foodMinor: 2400, rules: { ...usRules, taxRateMilli: 8875 }, channel: 'walk_up' })))
    t('the brief\'s example through the engine: card, 15% tip → 2400 + 198 + 102 + 360 = 3060',
      E.computeOrderCharges({ foodMinor: 2400, rules: usRules, channel: 'online_card', tip: { kind: 'percent', bps: 1500 } }).totalMinor === 3060)
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · /api/menu, the status API and get_report — the one new key each, US only')
  {
    const mu = await menuView(menuTables(US_TRUCK_COLS, [GB, US_ROW()]))
    const co = mu.body.truck && mu.body.truck.checkout
    t('US menu: ONE new key, truck.checkout — tax at checkout, "Sales tax", 8250, tipping 1000/1500/2000, the card fee 3% + 30¢',
      co && co.taxInclusive === false && co.taxLabel === 'Sales tax' && co.taxRateMilli === 8250 && JSON.stringify(co.tipping) === '{"presetsBps":[1000,1500,2000]}'
      && JSON.stringify(co.serviceFee) === '{"recipient":"truck","bps":300,"fixedMinor":30}', JSON.stringify(co))
    t('…and nothing about the platform fee, the card-fee payer or a surcharge', co && !('platformFee' in co) && !('cardFeePayer' in co) && !('surcharge' in co))
    const gbMenu = await menuView(menuTables())
    t('GB menu: no `checkout` key (byte-identity is §1)', gbMenu.body.truck && !('checkout' in gbMenu.body.truck))
    const st = await statusView(statusTables({ ...ORDER_BASE, ...US_SNAPSHOT, total: 30.6, total_minor: 3060, currency: 'USD', country: 'US' }, US_TRUCK_COLS, [GB, US_ROW()]))
    t('US status API returns `charges` (the snapshot amounts) for the status page', st.body.charges && st.body.charges.tax_minor === 198 && st.body.charges.tip_pct_bps === 1500 && st.body.charges.tax_rate_milli === 8250, JSON.stringify(st.body.charges))
    const orders = reportOrders(false).map((o, i) => ({ ...o, ...(i < 2 ? { ...US_SNAPSHOT, food_minor: Math.round(o.total * 100) } : {}), currency: 'USD' }))
    const rp = await reportView(reportTables(orders, US_TRUCK_COLS, [GB, US_ROW()]))
    const ch = rp.body.report && rp.body.report.charges
    t('US get_report: food, discount, tax, tips, service fees and card fees separately', ch && ch.taxAtCheckout === true && ch.taxLabel === 'Sales tax'
      && ch.foodMinor === 1200 + 2400 + 950 && ch.taxMinor === 396 && ch.tipsMinor === 720 && ch.serviceFeesMinor === 204 && ch.cardSurchargesMinor === 0 && ch.discount === 1, JSON.stringify(ch))
    t('…and the rows carry their snapshot amounts for the CSV columns', rp.body.report.orders[0].tax_minor === 198)
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · emails — the same lines where the discount row sits, HTML and text')
  {
    const { Mail } = m.email
    const TIME = { timeZone: 'America/Chicago', locale: 'en-US', timeFormat: '12h', dateOrder: 'mdy', weekStart: 'sunday' }
    const base = { orderId: '41', orderKey: 'ok-1', truckName: 'Pizza Kitchen', customerName: 'Ann', slot: '12:30', items: [{ name: 'Burger', quantity: 2, unit_price: 12, modifiers: [] }],
      deals: [], discountAmt: 0, total: 30.6, notes: null, autoAccepted: true, phoneCountry: 'US', money: USD, time: TIME }
    const conf = Mail.formatConfirmationEmail({ ...base, charges: US_SNAPSHOT })
    t('confirmation HTML: Subtotal $24.00, Sales tax 8.25% $1.98, Online service fee $1.02, Tip 15% $3.60, Total $30.60',
      has(conf.html, '>Subtotal<', '$24.00', 'Sales tax <span style="font-size:12px;color:#94a3b8">8.25%</span>', '$1.98', 'Online service fee', '$1.02', 'Tip <span style="font-size:12px;color:#94a3b8">15%</span>', '$3.60', '$30.60'))
    t('confirmation text: "Sales tax 8.25%: $1.98" and the rest, before "Total: $30.60"',
      has(conf.text, 'Subtotal: $24.00\nSales tax 8.25%: $1.98\nOnline service fee: $1.02\nTip 15%: $3.60\nTotal: $30.60'), conf.text.slice(0, 400))
    const ready = Mail.formatConfirmationEmail({ ...base, charges: US_SNAPSHOT, variant: 'ready' })
    t('the ready variant carries the same lines', has(ready.text, 'Sales tax 8.25%: $1.98'))
    const plain = Mail.formatConfirmationEmail({ ...base, charges: null })
    t('without charges (every UK order) the email has no new row', !plain.html.includes('Sales tax') && !plain.text.includes('Subtotal'))
    const truckMail = Mail.formatNewOrderEmail({ orderId: '41', customerName: 'Ann', slot: '12:30', items: base.items, deals: [], total: 30.6, notes: null, money: USD, time: TIME, charges: US_SNAPSHOT })
    t('the truck\'s new-order email: rows in the HTML, and the text reads "… Sales tax 8.25%: $1.98. … Total $30.60."',
      has(truckMail.html, 'Online service fee', '$3.60') && has(truckMail.text, 'Subtotal: $24.00. Sales tax 8.25%: $1.98. Online service fee: $1.02. Tip 15%: $3.60. Total $30.60.'), truckMail.text)
    t('every send site passes the order\'s snapshot (submit ×2, promotion ×2, dashboard ×6)',
      (read('app/api/orders/submit/route.ts').match(/charges:\s+charges\.snapshot,\s+\/\/ Phase 3 screens: tax, fee and tip rows/g) || []).length === 2
      && (read('lib/payments/promote-draft.ts').match(/charges:\s+chargeSourceOf\(draft/g) || []).length === 2
      && (read('app/api/dashboard/action/route.ts').match(/charges: (chargeSourceOf\((order|ord)|editCharges\.snapshot|walkupCharges\.snapshot)/g) || []).length === 6)
    t('refund and cancellation emails state the money that moved (ledger minor units — tax, tip and fee included) — unchanged',
      /amountMinor: outcome\.amountMinor/.test(read('app/api/dashboard/action/route.ts')) && /refundedMinor/.test(read('lib/email.ts')))
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · the ticket (one renderer, Bluetooth and wired) — 58 and 80 mm')
  {
    const { T, mapOrderToTicket } = m.ticket
    const order = { id: '41', order_key: 'ok-1', customer_name: 'Ann', customer_phone: null, slot: '12:30', buzzer_number: null, items: [{ name: 'Burger', quantity: 2, unit_price: 12, modifiers: [] }],
      deals: [], notes: null, total: 30.6, total_minor: 3060, currency: 'USD', country: 'US', status: 'confirmed', ...US_SNAPSHOT }
    const truck = { name: 'Pizza Kitchen', money: { ...USD, localeByCountry: { US: 'en-US' } }, time: { timeZone: 'America/Chicago', locale: 'en-US', timeFormat: '12h', dateOrder: 'mdy', weekStart: 'sunday' } }
    const ticket = mapOrderToTicket({ order, truck, event: null, ledgerRows: [], printedLabel: '12:01' })
    t('the mapper carries the kitchen lines as adjustments', JSON.stringify(ticket.adjustments) === JSON.stringify([{ label: 'Subtotal', minor: 2400 }, { label: 'Sales tax 8.25%', minor: 198 }, { label: 'Service fee', minor: 102 }, { label: 'Tip', minor: 360 }]), JSON.stringify(ticket.adjustments))
    for (const w of [58, 80]) {
      const lines = T.buildTicketLines(ticket, { paper_width: w }).map(l => l.text ?? (l.divider ? '----' : ''))
      const iTot = lines.findIndex(l => /^TOTAL/.test(l))
      const block = lines.slice(iTot - 5, iTot + 1)
      t(`${w} mm: divider, Subtotal, Sales tax 8.25%, Service fee, Tip, then TOTAL $30.60 — each price right-aligned`,
        block[0] === '----' && /^Subtotal\s+\$24\.00$/.test(block[1]) && /^Sales tax 8\.25%\s+\$1\.98$/.test(block[2]) && /^Service fee\s+\$1\.02$/.test(block[3])
        && /^Tip\s+\$3\.60$/.test(block[4]) && /^TOTAL\s+\$30\.60$/.test(block[5]) && block.slice(1).every(l => l.length === (w === 58 ? 32 : 48)), JSON.stringify(block))
    }
    const uk = mapOrderToTicket({ order: { ...order, ...{ tax_minor: 0, tax_rate_milli: null, tax_inclusive: true, tax_label: 'VAT', tip_minor: 0, tip_pct_bps: null, service_fee_minor: 0 }, currency: 'GBP', country: 'GB', total: 24 }, truck: { ...truck, money: { currency: 'GBP', locale: 'en-GB', localeByCountry: { GB: 'en-GB' } } }, event: null, ledgerRows: [], printedLabel: '12:01' })
    t('a UK order maps NO adjustments, and its bytes equal the same ticket with the key deleted',
      uk.adjustments === undefined && JSON.stringify(Array.from(T.renderTicket(uk, { paper_width: 58 }))) === JSON.stringify(Array.from(T.renderTicket((({ adjustments, ...r }) => r)(uk), { paper_width: 58 }))))
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · the dashboard card and the KDS — the same rows after the items, hidden in cook mode')
  {
    const cards = await kit.bundle('p3-cards', "export * from '@/components/dashboard/OrderCard'\nexport { MoneyProvider } from '@/components/MoneyContext'")
    const order = { id: '41', order_key: 'ok-1', customer_name: 'Ann', customer_phone: null, customer_email: 'ann@example.test', slot: '12:30', event_date: '2026-10-09', event_id: 'ev-1',
      items: [{ name: 'Burger', quantity: 2, unit_price: 12, modifiers: [] }], deals: [], notes: null, total: 30.6, total_minor: 3060, currency: 'USD', country: 'US', status: 'confirmed', payment_status: 'unpaid', ...US_SNAPSHOT }
    const TRK = { id: 'test-truck', name: 'Pizza Kitchen', slug: 'test-kitchen', mode: 'village', venue_name: 'The Green', logo: null, dashboard_token: 'harness', currency: 'USD', country: 'US', plan: 'pro',
      show_paid_step: true, completion_presses: 'two', takes_cash: true, auto_accept: false, kds_mode: false, money: { ...USD, localeByCountry: { US: 'en-US' } } }
    const EV = { id: 'ev-1', date: '2026-10-09', venue_name: 'The Green', town: 'Austin', start_time: '17:00', end_time: '21:00', van_id: null }
    const card = (extra = {}) => textOf(renderStatic(el(cards.MoneyProvider, { fmt: USD }, el(cards.OrderCard, {
      order, truck: TRK, event: EV, slots: [], actionLoading: null, onAction() {}, onRefund: async () => ({ ok: true }), onEdit() {},
      kdsMode: false, viewMode: 'solo', ledgerRows: [], heldAuthorisation: false, effectiveOrderReady: true, readyStepOn: true, vanTakesCash: true, ...extra,
    })))).text
    const dash = card()
    t('dashboard card: Subtotal $24.00, Sales tax 8.25% $1.98, Service fee $1.02, Tip $3.60', has(dash, 'Subtotal $24.00', 'Sales tax 8.25% $1.98', 'Service fee $1.02', 'Tip $3.60'), dash.slice(0, 600))
    t('KDS card: the same rows', has(card({ kdsMode: true }), 'Sales tax 8.25% $1.98', 'Tip $3.60'))
    const cook = card({ kdsMode: true, hideAmounts: true })
    t('cook mode: hidden with every other amount', !cook.includes('Sales tax') && !cook.includes('$1.98') && !cook.includes('Subtotal'))
    const ukCard = textOf(renderStatic(el(cards.MoneyProvider, { fmt: { currency: 'GBP', locale: 'en-GB' } }, el(cards.OrderCard, {
      order: { ...order, ...{ tax_minor: 0, tax_inclusive: true, tax_label: 'VAT', tip_minor: 0, tip_pct_bps: null, service_fee_minor: 0 }, currency: 'GBP', country: 'GB', total: 24 },
      truck: { ...TRK, currency: 'GBP', country: 'GB', money: { currency: 'GBP', locale: 'en-GB', localeByCountry: { GB: 'en-GB' } } }, event: EV, slots: [], actionLoading: null, onAction() {}, onRefund: async () => ({ ok: true }), onEdit() {},
      kdsMode: false, viewMode: 'solo', ledgerRows: [], heldAuthorisation: false, effectiveOrderReady: true, readyStepOn: true, vanTakesCash: true,
    })))).text
    t('a UK order\'s card draws no Subtotal, tax, fee or tip row', !/Subtotal|VAT|Service fee|Tip/.test(ukCard))
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════
  head('7 · the edit preview and the offline walk-up — the server\'s own functions, in the browser')
  {
    const checkout = E.checkoutRulesFrom(usRules)
    const browserRules = E.rulesFromCheckout(checkout)
    const stored = { ...US_SNAPSHOT }
    for (const food of [3600, 2000, 2400, 0]) {
      const server = E.chargesForEdit(food, usRules, stored)
      const browser = E.chargesForEdit(food, browserRules, stored)
      t(`edit preview = server for food ${food}: ${server.totalMinor}`, server.totalMinor === browser.totalMinor && JSON.stringify(server.snapshot) === JSON.stringify(browser.snapshot))
    }
    const dash = read('app/dashboard/[token]/page.tsx')
    t('the dashboard edit preview calls chargesForEdit for a charged order, and keeps its old sum for every other (UK) order',
      /chargesForEdit\(Math\.round\(food\*100\),rulesFromCheckout\(truck!\.charge_rules!\),o\)/.test(dash) && /if\(!priced\|\|!o\)return linear/.test(dash))
    const walk = E.computeOrderCharges({ foodMinor: 2400, rules: browserRules, channel: 'walk_up' })
    t('offline walk-up: tax, no fee, no tip → $25.98', walk.totalMinor === 2598 && walk.serviceFeeMinor === 0 && walk.tipMinor === 0)
    const panel = read('components/dashboard/AddOrderPanel.tsx')
    t('the Add Order panel\'s offline order uses it, ONLY when the dashboard sent charge_rules (never for a UK truck)',
      /\.\.\.\(truck\.charge_rules \? \(\(\) => \{\s*const c = computeOrderCharges\(\{ foodMinor: Math\.round\(manualTotal \* 100\), rules: rulesFromCheckout\(truck\.charge_rules\), channel: 'walk_up' \}\)/.test(panel))
    t('the dashboard route sends charge_rules only when a rule applies', /\.\.\.\(chargeRules \? \{ charge_rules: chargeRules \} : \{\}\)/.test(read('app/api/dashboard/route.ts'))
      && E.checkoutRulesFrom(R.resolveChargeRules(SEEDS.gbFromSeed(), { country: 'GB' })) === null)
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════
  head('8 · the customer order page (390 wide first) — rendered from fixtures')
  const OP = 'app/trucks/[slug]/order/page.tsx'
  const page = await kit.bundle('p3-orderpage', `export { default as OrderPage } from '@/${OP}'`, {
    patches: [{ file: OP, states: ['truck', 'menu', 'events', 'event', 'eventLoading', 'loading', 'basket', 'appliedDeals', 'formSheetOpen', 'payByCard', 'tipSel', 'tipOther',
      'summaryExpanded', 'sheetSummaryExpanded', 'name', 'email', 'submitted', 'submittedOrderId', 'submittedCharges', 'submittedTotal', 'confirmOrder', 'confirmLoading'] },
      { file: OP, from: 'const { slug } = use(params)', to: 'const { slug } = params' }],
  })
  const US_PHONE = { phoneCountry: 'US', short_name: 'US', phone_example: '(201) 555-0123', phoneCheck: 'length' }
  const burger = { id: 'u1', name: 'Burger', price: 12, category: 'Mains', available: true, modifierGroups: [] }
  const OP_TRUCK = (checkout) => ({ id: 'test-truck', name: 'Pizza Kitchen', logo: null, mode: 'village', venue_name: null, time_selection_enabled: true, paused: false, plan: 'pro',
    ordering_available: true, card_payments_ready: true, money: USD, phone: US_PHONE, time: { timeZone: 'America/Chicago', locale: 'en-US', timeFormat: '12h', dateOrder: 'mdy', weekStart: 'sunday' },
    ...(checkout ? { checkout } : {}) })
  const OP_EVENT = { id: 'ev-1', date: '09/10/2026', date_iso: '2026-10-09', date_friendly: 'Friday 9 October', start_time: '17:00', end_time: '21:00', venue_name: 'The Green', village: 'Austin', notes: '', status: 'open', collection_interval_mins: 10 }
  const OP_MENU = { categories: [{ id: 'c1', name: 'Mains' }], items: [burger], upsell_rules: [], bundles: [] }
  const CHECKOUT = E.checkoutRulesFrom(usRules)
  const base = (over = {}) => ({ truck: OP_TRUCK(CHECKOUT), menu: OP_MENU, events: [OP_EVENT], event: OP_EVENT, eventLoading: false, loading: false,
    basket: [{ menuItem: burger, quantity: 2, modifiers: [], specialInstructions: '', cartKey: 'k1' }], appliedDeals: [],
    formSheetOpen: true, sheetSummaryExpanded: true, summaryExpanded: true, name: 'Ann', email: 'ann@example.test', ...over })
  const view = st => renderWith(st, el(page.OrderPage, { params: { slug: 'test-kitchen' } })).text
  const card15 = view(base({ payByCard: true, tipSel: 1500 }))
  t('card + 15% tip: Subtotal $24.00 · Sales tax 8.25% $1.98 · Online service fee $1.02 · Tip 15% $3.60 · Total $30.60',
    has(card15, 'Subtotal $24.00 Sales tax 8.25% $1.98 Online service fee $1.02 Tip 15% $3.60 Total $30.60'), card15.slice(0, 300))
  {
    // Inside the sheet: the choice, then the tip block, then the totals box, then Place order. (The footer's
    // own breakdown renders later in the document, so positions are taken from the tip block onwards.)
    const iChoice = card15.indexOf('Pay now by card'), iTip = card15.indexOf('Add a tip for the truck?')
    const iTot = card15.indexOf('Total $30.60', iTip), iPlace = card15.indexOf('Place order', iTot)
    t('…in the sheet: the payment choice, the tip block, the totals box, then Place order', iChoice > 0 && iChoice < iTip && iTip < iTot && iTot < iPlace)
  }
  t('every total before payment is the grand total — the collapsed summaries read $30.60, never $24.00',
    (card15.match(/1 item \$30\.60|2 items \$30\.60/g) || []).length >= 2 && !/items \$24\.00/.test(card15))
  t('under the basket heading: "Menu prices don\'t include sales tax. It\'s added below."', has(card15, 'Menu prices don\'t include sales tax. It\'s added below.'))
  t('the tip block: heading, No tip, 10% $2.40, 15% $3.60, 20% $4.80, Other, and the promise under the row',
    has(card15, 'Add a tip for the truck?', 'No tip', '10% $2.40', '15% $3.60', '20% $4.80', 'Other', '100% of your tip goes to the truck. Worked out on the food, before tax.'))
  t('under "Pay at the truck": "No service fee. Tip the truck in person if you like." — and the existing text kept',
    has(card15, 'Pay at the truck No card details needed No service fee. Tip the truck in person if you like.', 'Pay now by card Secure payment through '))
  const noTip = view(base({ payByCard: true }))
  t('default is No tip: Total $27.00 (food + tax + fee), no tip line', has(noTip, 'Online service fee $1.02 Total $27.00') && !/Tip 1?\d%/.test(noTip.replace('Tip the truck', '')))
  const hatch = view(base({ payByCard: false }))
  t('pay at the truck: no fee or tip lines, no tip block — Subtotal $24.00 · Sales tax 8.25% $1.98 · Total $25.98',
    has(hatch, 'Subtotal $24.00 Sales tax 8.25% $1.98 Total $25.98') && !hatch.includes('Online service fee $') && !hatch.includes('Add a tip for the truck?'))
  const other = view(base({ payByCard: true, tipSel: 'other', tipOther: '30' }))
  t('"Other" above 100% of the food: "Tips can be up to $24.00." (and the shown tip is capped there)', has(other, 'Tips can be up to $24.00.', 'Tip $24.00'))
  const uk = renderWith({ ...base({ payByCard: true }), truck: { ...OP_TRUCK(null), money: { currency: 'GBP', locale: 'en-GB' } } }, el(page.OrderPage, { params: { slug: 'test-kitchen' } }))
  t('no `checkout` (every UK truck): no notice, no tip block, no extra lines — Total = food',
    !uk.text.includes('Add a tip') && !uk.text.includes('Subtotal') && !uk.text.includes('don\'t include') && has(uk.text, 'Total £24.00'))
  const sizes = read(OP)
  t('tip buttons are at least 44px tall, equal width, the selected one a 2px dark border on pale blue',
    /min-h-\[44px\]/.test(sizes) && /repeat\(\$\{tipPresets\.length \+ 2\}, minmax\(0, 1fr\)\)/.test(sizes) && /'border-2 border-slate-900 bg-blue-50'/.test(sizes))
  t('the browser sends only the tip choice, and only on a card order with tipping on', /\.\.\.\(sentByCard && checkout\?\.tipping \? \{ tip: tipChoice \} : \{\}\)/.test(sizes))
  t('a changed tip is a changed authorisation (it is in the card fingerprint — US only)', /\.\.\.\(checkout \? \{ g: Math\.round\(grandTotal \* 100\), tip: showTip \? tipChoice : null \} : \{\}\)/.test(sizes))
  // confirmations
  const confUrl = (() => {
    globalThis.__msSearch = 'confirm=00000000-0000-4000-8000-000000000000'
    try {
      return renderWith({ confirmOrder: { id: '41', status: 'confirmed', slot: '12:30', items: [{ name: 'Burger', quantity: 2, unit_price: 12, modifiers: [] }], deals: [], total: 30.6, payment_status: 'unpaid',
        truck_name: 'Pizza Kitchen', truck_logo: null, requested_slot: null, asap_estimate: null, money: USD, charges: US_SNAPSHOT }, confirmLoading: false }, el(page.OrderPage, { params: { slug: 'test-kitchen' } })).text
    } finally { delete globalThis.__msSearch }
  })()
  t('the confirmation (by URL): the same lines above Total $30.60', has(confUrl, 'Subtotal $24.00 Sales tax 8.25% $1.98 Online service fee $1.02 Tip 15% $3.60 Total $30.60'), confUrl.slice(0, 400))
  const confMem = view(base({ submitted: true, submittedOrderId: '41', submittedCharges: { ...US_SNAPSHOT, tip_minor: 0, tip_pct_bps: null, service_fee_minor: 0 }, submittedTotal: 25.98 }))
  t('the confirmation (in memory, pay at the truck): the server\'s lines and total', has(confMem, 'Subtotal $24.00 Sales tax 8.25% $1.98 Total $25.98'))

  // the status page
  const RC = 'app/order/[id]/manage/page.tsx'
  const receipt = await kit.bundle('p3-receipt', `export { default as Receipt } from '@/${RC}'`, { patches: [{ file: RC, states: ['order', 'loading'] }] })
  const rec = renderWith({ order: { id: '41', status: 'confirmed', customer_name: 'Ann', slot: '12:30', event_date: '2026-10-09', items: [{ name: 'Burger', quantity: 2, unit_price: 12 }], deals: [], total: 30.6,
    payment_status: 'unpaid', truck_name: 'Pizza Kitchen', venue_name: 'The Green', allow_cancellation: false, cancellation_cutoff_mins: 0, money: USD, charges: US_SNAPSHOT }, loading: false }, el(receipt.Receipt)).text
  t('the status page: the same lines above Total $30.60', has(rec, 'Subtotal $24.00 Sales tax 8.25% $1.98 Online service fee $1.02 Tip 15% $3.60 Total $30.60'), rec.slice(0, 400))

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════
  head('9 · Manage › Payments — "Tax, tips and fees", its saves, and "Taking payment" moved from Settings')
  {
    const fmtMinor = n => `$${(n / 100).toFixed(2)}`
    const usC = { ...SEEDS.usFromSeed(), serviceFeeTruckMaxBps: 400, serviceFeeTruckMaxFixedMinor: 50 }
    const ok = C.checkChargeSettings({ taxRate: '8.875' }, usC, fmtMinor)
    t('a rate of 8.875 is stored as 8875 thousandths', ok.ok && ok.values.tax_rate_milli === 8875)
    t('0, 20 and 8.25 are accepted; "" clears it', ['0', '20', '8.25'].every(v => C.checkChargeSettings({ taxRate: v }, usC, fmtMinor).ok) && C.checkChargeSettings({ taxRate: '' }, usC, fmtMinor).values.tax_rate_milli === null)
    const four = C.checkChargeSettings({ taxRate: '8.8755' }, usC, fmtMinor)
    t('more than 3 decimals: "Use up to 3 decimal places, like 8.875."', !four.ok && four.error === 'Use up to 3 decimal places, like 8.875.')
    t('above 20 or not a number: refused', !C.checkChargeSettings({ taxRate: '20.001' }, usC, fmtMinor).ok && !C.checkChargeSettings({ taxRate: 'abc' }, usC, fmtMinor).ok)
    t('a truck fee within the maximum saves (3% + $0.30 → 300, 30)', (r => r.ok && r.values.service_fee_bps === 300 && r.values.service_fee_fixed_minor === 30)(C.checkChargeSettings({ serviceFeePct: '3', serviceFeeFixed: '0.30' }, usC, fmtMinor)))
    t('a fee part over the maximum is refused with the maximum named', C.checkChargeSettings({ serviceFeePct: '5' }, usC, fmtMinor).error === 'The most you can charge is 4%.'
      && C.checkChargeSettings({ serviceFeeFixed: '0.60' }, usC, fmtMinor).error === 'The most you can charge is $0.50.')
    t('nothing is saved for a country without a service fee, or where HatchGrab keeps it, or a rate where tax is included',
      !C.checkChargeSettings({ serviceFeeEnabled: true }, { ...usC, serviceFeeAllowed: false }, fmtMinor).ok
      && !C.checkChargeSettings({ serviceFeeEnabled: true }, { ...usC, serviceFeeRecipient: 'hatchgrab' }, fmtMinor).ok
      && !C.checkChargeSettings({ taxRate: '8' }, SEEDS.gbFromSeed(), fmtMinor).ok)
    t('the mockup\'s phrases: "4% + 50¢", and HatchGrab\'s "3% + 30¢"', C.feePhrase(400, 50, 'USD', fmtMinor) === '4% + 50¢' && C.feePhrase(300, 30, 'USD', fmtMinor) === '3% + 30¢' && C.feePhrase(400, null, 'USD', fmtMinor) === '4%')

    // the action, on the real Manage route
    const ACCESS = role => ({ file: 'app/api/manage/route.ts', from: /const access = await resolveTruckAccess\(req, truck\)/g, to: `const access = { ok: true as const, role: '${role}' as const, userId: null, operatorId: null, via: 'harness' } as any` })
    const routeFor = {}
    const call = async (role, body, truckOver = US_TRUCK_COLS, rows = [GB, US_ROW()]) => {
      routeFor[role] = routeFor[role] || await kit.bundle(`p3-manage-${role}`, "export { POST } from '@/app/api/manage/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", { patches: [ACCESS(role)] })
      const pg = makeFakePg({ trucks: [TRUCK(truckOver)], country_settings: rows })
      globalThis.__harnessDb = pg; routeFor[role].clearCountrySettingsCache()
      try {
        const res = await kit.quietAsync(() => routeFor[role].POST(new NextRequest('http://127.0.0.1:3999/api/manage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'tok-test', action: 'update_charges', ...body }) })))
        return { status: res.status, body: await res.json(), writes: pg.writes }
      } finally { delete globalThis.__harnessDb }
    }
    const saved = await call('owner', { taxRate: '8.875' })
    t('update_charges (owner): writes tax_rate_milli 8875 and nothing else', saved.status === 200 && JSON.stringify(saved.writes.map(w => w.patch)) === '[{"tax_rate_milli":8875}]', JSON.stringify(saved))
    const bad = await call('owner', { taxRate: '8.8755' })
    t('…refuses 4 decimals with the sentence, writing nothing', bad.status === 400 && bad.body.error === 'Use up to 3 decimal places, like 8.875.' && bad.writes.length === 0)
    const over = await call('owner', { serviceFeePct: '5' })
    t('…refuses a fee over the country maximum, writing nothing', over.status === 400 && over.writes.length === 0)
    const gb = await call('owner', { taxRate: '8' }, { country: 'GB' })
    t('…refuses a rate for a GB truck (tax included), writing nothing', gb.status === 400 && gb.writes.length === 0)
    const staff = await call('staff', { taxRate: '8' })
    const manager = await call('manager', { taxRate: '8' })
    t('…is the owner\'s: staff and managers are refused, nothing written', staff.status === 403 && manager.status === 403 && staff.writes.length === 0 && manager.writes.length === 0)

    // the card's source: rows, hints, variants
    const card = read('components/manage/ChargesCard.tsx')
    t('the card returns nothing where prices include tax (every UK truck)', /if \(cs\.pricesIncludeTax\) return null/.test(card))
    t('its title and three rows, worded as approved', has(card, '>Tax, tips and fees<', "'Sales tax rate'", 'The rate you charge on every order. Customers see it added at checkout, on receipts and on tickets.',
      "'Tips'", 'Customers paying online by card can add a tip. It all goes to you.', 'Choices customers see:', 'Other amount',
      'Added to online orders only. Never on pay-at-the-truck or walk-up orders. You keep it.', 'Most you can charge: ', 'Customers see it before they pay, as one line: &ldquo;Online service fee ',
      "HatchGrab adds a {feePhrase(cs.serviceFeeHatchgrabBps, cs.serviceFeeHatchgrabFixedMinor, cs.currency, money)} service fee to your customers&apos; online orders. You don&apos;t pay it and can&apos;t change it."))
    t('a fee part with no country maximum is hidden', /\{maxPct !== null && \(<>/.test(card) && /\{maxFixed !== null && \(<>/.test(card))

    // the move
    const P = read('app/manage/[token]/page.tsx')
    const { execFileSync } = require('child_process')
    const headSrc = execFileSync('git', ['show', 'HEAD:app/manage/[token]/page.tsx'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 })
    const was = headSrc.slice(headSrc.indexOf('        {/* ── TAKING PAYMENT (V9.5)'), headSrc.indexOf('        {/* ── OPENING AND CLOSING'))
    const panelSrc = read('components/manage/TakingPaymentPanel.tsx')
    t('named difference 1: the Taking payment block is in components/manage/TakingPaymentPanel.tsx byte for byte (only its outer separator wrapper changed)',
      was.length > 5000 && panelSrc.includes(was.replace('<div className="pt-3 border-t border-slate-100">', '<div>', 1).trimEnd()))
    const settings = P.slice(P.indexOf('function SettingsTab('), P.indexOf('function SettingsTab(') + 400000)
    t('…and it is gone from Settings: no "Taking payment", no "Take orders without payment", no "Completing an unpaid order" heading there',
      !settings.slice(0, settings.indexOf('\nfunction ', 10)).includes('>Taking payment<') && !/<p className="text-sm font-semibold text-slate-800">Take orders without payment<\/p>/.test(settings.slice(0, settings.indexOf('\nfunction ', 10))))
    t('…the same three keys, the same update_truck save: show_paid_step, completion_presses, takes_cash',
      ["saveSetting('show_paid_step', next)", "saveSetting('completion_presses', v)", "saveSetting('takes_cash', next)"].every(x => panelSrc.includes(x))
      && /await api\('update_truck', \{ data: \{ \[key\]: value \} \}\)/.test(panelSrc))
    {
      // SettingsTab, HEAD vs now, from its first line to the next top-level function. With the moved block,
      // its tombstone and the moved derivation taken out of each, the two must be the same text.
      const region = src => { const a = src.indexOf('function SettingsTab('); return src.slice(a, src.indexOf('\nfunction ', a + 10)) }
      const headR = region(headSrc), nowR = region(P)
      const nowStripped = nowR
        .replace(/        \{\/\* ── ⛔ "TAKING PAYMENT" MOVED TO MANAGE › PAYMENTS[\s\S]*?\*\/\}\n/, '')
        .replace(/  \/\/ ── ⛔ `completionPresses` MOVED WITH[^\n]*\n(  \/\/[^\n]*\n)*/, '')
      const headStripped = headR.replace(was, '')
        .replace(/  \/\/ ── THE RESOLVED COMPLETION SETTING, ONE PLACE ON THIS PAGE[^\n]*\n(  \/\/[^\n]*\n)*  const completionPresses: 'one' \| 'two' =\n    form\.completion_presses \?\? \(form\.show_paid_step === true \? 'two' : 'one'\)\n/, '')
      t('…and ONLY that block left Settings: the rest of SettingsTab is identical to HEAD',
        headStripped.length > 100000 && headStripped === nowStripped,
        headStripped === nowStripped ? '' : `HEAD ${headStripped.length} chars vs now ${nowStripped.length}`)
    }
    const pt = read('components/manage/PaymentsTab.tsx')
    t('Payments places it after the online section and before "Walk-up payments" (with the new card first)',
      pt.indexOf('{afterOnline}') > 0 && pt.indexOf('{afterOnline}') < pt.indexOf('Walk-up payments</h3>')
      && /<ChargesCard [\s\S]{0,200}\/>\s*<TakingPaymentPanel /.test(P))
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════
  head('10 · Admin › Countries — the fee rows')
  {
    const tab = read('components/admin/CountriesTab.tsx')
    t('"Take our fee" after "Our fee above that", with its hint, "Needs a rate first" and the not-charged-yet note',
      tab.indexOf("label: 'Take our fee'") > tab.indexOf("label: 'Our fee above that'") && has(tab, 'Off: the rate is shown on plans but never charged', 'Needs a rate first', 'Not charged yet — switching on has no effect until fee charging is built.'))
    t('the "Online service fee" group: Allowed in this country (moved), Who keeps it, HatchGrab\'s fee, Most a truck can charge — with their hints',
      has(tab, "group: 'Online service fee', hint: 'Online orders only — never pay at the truck or walk-up'", "label: 'Allowed in this country'", "label: 'Who keeps it'", '<option value="truck">The truck</option>', '<option value="hatchgrab">HatchGrab</option>',
        `label: "HatchGrab's fee", hint: "Used when HatchGrab keeps it; trucks can't change it"`, 'Only when &ldquo;HatchGrab&rdquo; is chosen', "label: 'Most a truck can charge', hint: 'Used when the truck keeps it; trucks set their own up to this'")
      && !tab.includes("label: 'Online service fee allowed'"))
    t('the amber UK-law note when the fee is off where prices include tax', /!f\.serviceFeeAllowed && f\.pricesIncludeTax/.test(tab) && tab.includes('law needs it inside the prices customers first see'))
    t('the "Tax on fees" group and its "— (UK prices include VAT)" style text', has(tab, "group: 'Tax on fees'", "label: 'Service fee and card fee are taxed', hint: 'Only matters where tax is added at checkout'", 'prices include {f.taxLabel.trim() || \'tax\'})'))
    t('the stale card-fee hint is fixed', tab.includes(`hint: "Card fees on the bill aren't built yet"`) && !tab.includes("Shows 'Who pays the card fee' in Manage › Payments"))
    const gbRow = { ...SEEDS.gbFromSeed() }
    const form = F.rowToForm(gbRow)
    const back = F.formToValues(form, { truckCount: 1, storedCurrency: 'GBP', countryCode: 'GB' })
    t('the form round-trips every new setting unchanged (GB defaults: truck, none, none, off, not taxed)', back.ok && back.values.serviceFeeRecipient === 'truck' && back.values.serviceFeeHatchgrabBps === null
      && back.values.serviceFeeTruckMaxFixedMinor === null && back.values.platformFeeEnabled === false && back.values.feesTaxed === false)
    const take = F.formToValues({ ...F.rowToForm({ ...gbRow, platformFeePct: null }), platformFeeEnabled: true }, { truckCount: 1, storedCurrency: 'GBP', countryCode: 'GB' })
    t('"Take our fee" cannot be switched on without a rate', !take.ok && take.errors.some(e => e.field === 'platformFeeEnabled'))
  }
}
