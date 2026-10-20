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
    // ⚠️ RE-PINNED, 18 October 2026 — us-layout-fix-10-charges-fold (components/dashboard/OrderCard.tsx;
    // /Users/dominicbonini/dev/usl-out/REPIN-BRIEF.md). OLD: the dashboard card drew Subtotal / Sales tax / Service fee / Tip
    // in full, and the KDS card the same rows. NEW: the dashboard card draws ONE button line, "Tax, fees & tip ▾ $6.60"
    // ($1.98 + $1.02 + $3.60; "Tax & fees" without a tip), whose tap opens the SAME four rows beneath it (proved by rendering
    // the card with its `chargesOpen` state set — every row the old check asserted, with its amount); the KDS card draws NO
    // money lines at all, its total staying in the header.
    const cardHtml = (extra = {}, comp = cards.OrderCard, prov = cards.MoneyProvider) => renderStatic(el(prov, { fmt: USD }, el(comp, {
      order, truck: TRK, event: EV, slots: [], actionLoading: null, onAction() {}, onRefund: async () => ({ ok: true }), onEdit() {},
      kdsMode: false, viewMode: 'solo', ledgerRows: [], heldAuthorisation: false, effectiveOrderReady: true, readyStepOn: true, vanTakesCash: true, ...extra,
    })))
    const dashHtml = cardHtml()
    t('dashboard card (us-layout-fix-10-charges-fold): ONE line "Tax, fees & tip ▾ $6.60", collapsed — no Subtotal / tax / fee / tip rows until tapped',
      has(dash, 'Tax, fees & tip ▾ $6.60') && !/Subtotal|Sales tax|Service fee \$|Tip \$/.test(dash) && /<button[^>]*aria-expanded="false"[^>]*data-charge-summary/.test(dashHtml), dash.slice(0, 600))
    const noTip = textOf(cardHtml({ order: { ...order, tip_minor: 0, tip_pct_bps: null, total: 27, total_minor: 2700 } })).text
    t('dashboard card without a tip: "Tax & fees ▾ $3.00"', has(noTip, 'Tax & fees ▾ $3.00') && !noTip.includes('Tax, fees & tip'), noTip.slice(0, 400))
    const open = await kit.bundle('p3-cards-open', "export * from '@/components/dashboard/OrderCard'\nexport { MoneyProvider } from '@/components/MoneyContext'", { patches: [{ file: 'components/dashboard/OrderCard.tsx', states: ['chargesOpen'] }] })
    globalThis.__ms = { chargesOpen: true }
    let opened
    try { opened = textOf(cardHtml({}, open.OrderCard, open.MoneyProvider)).text } finally { delete globalThis.__ms }
    t('dashboard card, tapped open: "Tax, fees & tip ▴ $6.60" then Subtotal $24.00, Sales tax 8.25% $1.98, Service fee $1.02, Tip $3.60',
      has(opened, 'Tax, fees & tip ▴ $6.60 Subtotal $24.00 Sales tax 8.25% $1.98 Service fee $1.02 Tip $3.60'), opened.slice(0, 600))
    // The KDS Full ticket as app/dashboard/[token]/kds/page.tsx renders it: cardStyle 'window' (Full), viewMode = boardMode
    // ('window' with Payment & handover on, 'cook' with it off). (The old check passed kdsMode with the dashboard's 'solo'
    // style, which the KDS never renders.)
    for (const boardMode of ['window', 'cook']) {
      const kdsHtml = cardHtml({ kdsMode: true, viewMode: boardMode, cardStyle: 'window' }), kds = textOf(kdsHtml).text
      t(`KDS Full ticket, board ${boardMode} (us-layout-fix-10-charges-fold): NO money lines — no Subtotal, tax, fee, tip or summary line; the total $30.60 stays in the header`,
        !/Subtotal|Sales tax|Service fee|Tip|Tax, fees|Tax & fees|\$1\.98|\$6\.60/.test(kds) && !/data-charge-(lines|summary)/.test(kdsHtml) && kds.includes('$30.60'), kds.slice(0, 600))
    }
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
    // ⚠️ RE-PINNED (Language Phase 1d Part 2): the card's words moved to messages/ (`manageCharges`, and the example's
    // line name is the customer's own `charges.serviceFeeCustomer`). The same approved words are asserted, now in two
    // halves: (1) the card reads each row's word from the key at the same spot (same argument shapes — the fee phrase
    // is still `feePhrase(cs.serviceFeeHatchgrabBps, …)`, the maximum still `feePhrase(maxPct, maxFixed, …)`), and
    // (2) each key's en-GB text — read from the catalogue this run uses (frozen words + as-moved overlay, so the
    // named ’ fix on fee.hatchgrab is still seen as moved) — is the approved sentence, byte for byte.
    {
      const W = require('./_lp2-frozen.cjs').enGBForNode()
      const mc = W.manageCharges || {}
      const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (x, k) => (k in v ? v[k] : x))
      t('its title and three rows, worded as approved',
        has(card, "useT('manageCharges')", "useT('charges')", ">{t('heading')}<", "row(t('rate.label'),", "t('rate.hint'),", "aria-label={t('rate.label')}",
          "row(t('tips.label'),", "t('tips.hint'),", "{t('tips.choices')}", "{t('tips.other')}",
          "row(t('fee.label'),", "t('fee.hint'),", "{t('fee.max', { max: feePhrase(maxPct, maxFixed, cs.currency, money) })}",
          "{t('fee.example', { label: tCharges('serviceFeeCustomer'), amount: money(exampleFee) })}",
          "{t('fee.hatchgrab', { fee: feePhrase(cs.serviceFeeHatchgrabBps, cs.serviceFeeHatchgrabFixedMinor, cs.currency, money) })}")
        && mc.heading === 'Tax, tips and fees' && mc.rate?.label === 'Sales tax rate'
        && mc.rate?.hint === 'The rate you charge on every order. Customers see it added at checkout, on receipts and on tickets.'
        && mc.tips?.label === 'Tips' && mc.tips?.hint === 'Customers paying online by card can add a tip. It all goes to you.'
        && mc.tips?.choices === 'Choices customers see:' && mc.tips?.other === 'Other amount'
        && mc.fee?.hint === 'Added to online orders only. Never on pay-at-the-truck or walk-up orders. You keep it.'
        && fill(mc.fee?.max, { max: '<P>' }) === 'Most you can charge: <P>'
        && fill(mc.fee?.example, { label: W.charges?.serviceFeeCustomer, amount: '<A>' }).startsWith('Customers see it before they pay, as one line: “Online service fee <A>')
        && fill(mc.fee?.hatchgrab, { fee: '<P>' }) === "HatchGrab adds a <P> service fee to your customers' online orders. You don't pay it and can't change it.",
        JSON.stringify(mc).slice(0, 300))
    }
    t('a fee part with no country maximum is hidden', /\{maxPct !== null && \(<>/.test(card) && /\{maxFixed !== null && \(<>/.test(card))

    // the move
    const P = read('app/manage/[token]/page.tsx')
    const { execFileSync } = require('child_process')
    // 🔴 PINNED TO 3033a53, the commit Phase 3 started from (13 October 2026). It read HEAD while Phase 3 was
    // uncommitted; the checkpoint e54c7ea folded the move into HEAD, so HEAD no longer holds the block that moved.
    const headSrc = execFileSync('git', ['show', '3033a53:app/manage/[token]/page.tsx'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 })
    const was = headSrc.slice(headSrc.indexOf('        {/* ── TAKING PAYMENT (V9.5)'), headSrc.indexOf('        {/* ── OPENING AND CLOSING'))
    const panelSrc = read('components/manage/TakingPaymentPanel.tsx')
    // ⚠️ RE-PINNED (Language Phase 1d Part 2): the panel's words moved to messages/ (`takingPayment`; the four shared
    // completion sentences + titles to `completionSettings`, also read by the dashboard; the cash row to
    // `serviceSettings.labels.takes_cash` — what SERVICE_SETTING_LABELS.takes_cash already read — and
    // `manageSettings.vans.takesCashHelp`). The working panel can no longer hold 3033a53's block byte for byte, so the
    // same property is held in three bounded steps (the pattern Part 1 used for SettingsTab below):
    //   (A) the ORIGINAL byte comparison, unchanged, on 826471a's panel (the tree before Part 2; the file was unchanged
    //       from e54c7ea to 826471a);
    //   (B) 826471a → now, with comments set aside on both sides: every REMOVED line is one of the enumerated word moves
    //       below (its words now come from the named key) or the SERVICE_SETTING_LABELS import/read, and every ADDED
    //       line is the replacement call, an i18n import, or a `useT(…)` hook — so no code entered or left the block;
    //   (C) each moved key's en-GB text in the catalogue this run uses (frozen + as-moved) is the removed text, byte for
    //       byte (`&apos;` read as ').
    {
      const basePanel = execFileSync('git', ['show', '826471a:components/manage/TakingPaymentPanel.tsx'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 })
      const okA = was.length > 5000 && basePanel.includes(was.replace('<div className="pt-3 border-t border-slate-100">', '<div>', 1).trimEnd())
      const W = require('./_lp2-frozen.cjs').enGBForNode()
      const get = k => k.split('.').reduce((o, p) => (o && typeof o === 'object' ? o[p] : undefined), W)
      // [key, the call that now prints it, its text at 826471a as the source spelled it]
      const MOVES = [
        ['takingPayment.heading', "{t('heading')}", 'Taking payment'],
        ['takingPayment.intro', "{t('intro')}", 'How your team records money for each order.'],
        ['completionSettings.paidStepTitle', "{tCompletion('paidStepTitle')}", 'Take orders without payment'],
        ['takingPayment.paidStepHelp', "{t('paidStepHelp')}", 'Adds a Confirm button when you add an order yourself, so you can place it now and take payment later. Turn this on if you take phone or advance orders.'],
        ['takingPayment.paidStepNote', "{t('paidStepNote')}", 'This only affects orders you add. It doesn&apos;t affect online orders.'],
        ['completionSettings.completionTitle', "{tCompletion('completionTitle')}", 'Completing an unpaid order'],
        ['completionSettings.completionHelp', "{tCompletion('completionHelp')}", 'What happens when an unpaid order is ready to hand over.'],
        ['completionSettings.pressesOne', "['one', tCompletion('pressesOne'), tCompletion('pressesOneHelp')]", 'One press (“Mark paid & collected”)'],
        ['completionSettings.pressesOneHelp', "['one', tCompletion('pressesOne'), tCompletion('pressesOneHelp')]", 'Best when you take the money as you hand the food over. You get a single button, “Mark paid & collected”, which records the payment and clears the order together.'],
        ['completionSettings.pressesTwo', "['two', tCompletion('pressesTwo'), tCompletion('pressesTwoHelp')]", 'Two presses (“Mark paid” & “Collected”)'],
        ['completionSettings.pressesTwoHelp', "['two', tCompletion('pressesTwo'), tCompletion('pressesTwoHelp')]", 'Best when payment and handover happen at different moments — someone pays at the hatch, then collects when it’s ready. You get two buttons: “Mark paid” first, then “Collected” when they take the food.'],
        ['manageSettings.vans.takesCashHelp', "{tVans('takesCashHelp')}", 'Splits the payment button into "Cash" and "Card" so your takings reconcile against the till. You can turn this on for a single event from the dashboard.'],
      ]
      // The cash row's NAME: SERVICE_SETTING_LABELS.takes_cash was already gb('labels.takes_cash') at 826471a — the same key.
      const REWRAP = [['{SERVICE_SETTING_LABELS.takes_cash}', "{tService('takes_cash')}"], ["import { SERVICE_SETTING_LABELS } from '@/lib/copy/serviceSettings'", null]]
      const svcBase = execFileSync('git', ['show', '826471a:lib/copy/serviceSettings.ts'], { cwd: REPO, encoding: 'utf8' })
      const okRewrap = /takes_cash: gb\('labels\.takes_cash'\)/.test(svcBase) && /const tService = useT\('serviceSettings\.labels'\)/.test(panelSrc)
      const noComments = s => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').split('\n').filter(l => !/^\s*\/\//.test(l) && l.trim()).join('\n')
      // (the text must be gone from the panel's CODE; a comment may still quote it)
      const okC = MOVES.every(([k, call, text]) => basePanel.includes(text) && !noComments(panelSrc).includes(text) && panelSrc.includes(call) && get(k) === text.replace(/&apos;/g, "'"))
      const A0 = noComments(basePanel).split('\n'), B0 = noComments(panelSrc).split('\n'), n0 = A0.length, m0 = B0.length
      const L0 = Array.from({ length: n0 + 1 }, () => new Uint16Array(m0 + 1))
      for (let i = n0 - 1; i >= 0; i--) for (let j = m0 - 1; j >= 0; j--) L0[i][j] = A0[i] === B0[j] ? L0[i + 1][j + 1] + 1 : Math.max(L0[i + 1][j], L0[i][j + 1])
      const dels = [], adds = []
      for (let i = 0, j = 0; i < n0 || j < m0;) {
        if (i < n0 && j < m0 && A0[i] === B0[j]) { i++; j++; continue }
        if (j < m0 && (i === n0 || L0[i][j + 1] >= L0[i + 1][j])) adds.push(B0[j++]); else dels.push(A0[i++])
      }
      // A removed line is explained only by holding one enumerated text (JSX text, or a ['one'|'two', label / help]
      // tuple line), or by being the SERVICE_SETTING_LABELS import / read.
      const badDel = dels.filter(l => !MOVES.some(([, , text]) => l.includes(text)) && !REWRAP.some(([from]) => l.includes(from)))
      // An added line is explained only as a removed line with its text replaced by the key's call and nothing else
      // (same element, same classes), the merged tuple line `['one'|'two', tCompletion(…), tCompletion(…)],`, the cash
      // row's name re-read, an i18n import, or a `useT(…)` hook.
      const swapped = new Set(dels.flatMap(d => [...MOVES.map(([, call, text]) => d.replace(text, call)), ...REWRAP.filter(([, to]) => to).map(([from, to]) => d.replace(from, to))]))
      const badAdd = adds.filter(l => !swapped.has(l) && !MOVES.some(([, call]) => call.startsWith('[') && l.trim() === `${call},`)
        && !/^import '@\/lib\/i18n\/catalog\/[A-Za-z]+'$/.test(l.trim()) && l.trim() !== "import { useT } from '@/lib/i18n/use-t'"
        && !/^const t[A-Za-z]* = useT\('[A-Za-z.]+'\)$/.test(l.trim()))
      t('named difference 1: the Taking payment block is in components/manage/TakingPaymentPanel.tsx byte for byte (only its outer separator wrapper changed)',
        okA && okRewrap && okC && dels.length >= MOVES.length && badDel.length === 0 && badAdd.length === 0,
        `A ${okA} · rewrap ${okRewrap} · C ${okC} · unexplained removed: ${badDel.slice(0, 4).join(' | ')} · unexplained added: ${badAdd.slice(0, 4).join(' | ')}`)
    }
    const settings = P.slice(P.indexOf('function SettingsTab('), P.indexOf('function SettingsTab(') + 400000)
    t('…and it is gone from Settings: no "Taking payment", no "Take orders without payment", no "Completing an unpaid order" heading there',
      !settings.slice(0, settings.indexOf('\nfunction ', 10)).includes('>Taking payment<') && !/<p className="text-sm font-semibold text-slate-800">Take orders without payment<\/p>/.test(settings.slice(0, settings.indexOf('\nfunction ', 10))))
    t('…the same three keys, the same update_truck save: show_paid_step, completion_presses, takes_cash',
      ["saveSetting('show_paid_step', next)", "saveSetting('completion_presses', v)", "saveSetting('takes_cash', next)"].every(x => panelSrc.includes(x))
      && /await api\('update_truck', \{ data: \{ \[key\]: value \} \}\)/.test(panelSrc))
    {
      // SettingsTab, HEAD vs now, from its first line to the next top-level function. With the moved block,
      // its tombstone and the moved derivation taken out of each, the two must be the same text.
      // ⚠️ RE-PINNED (Language Phase 1d): 1d legitimately moved every word of SettingsTab into messages/
      // (`manageSettings`, `settingsCopy`, `serviceSettings`, `offlineProtection`, `manageScheduleVerify`), so the
      // working tree's SettingsTab can no longer be byte-identical to 3033a53's. The guarded property — ONLY the
      // Taking-payment block left Settings — is now held in three bounded steps instead of one:
      //   (A) the original byte comparison, unchanged, run on 756ca09's SettingsTab (the last tree before 1d);
      //   (B) 756ca09 → now: a line diff in which every REMOVED line is a word site (a literal with a letter, JSX
      //       text, or a reference to the copy constants 1d retired) or survives re-wrapped inside an added line —
      //       so 1d's word moves are excused and nothing else may leave;
      //   (C) the saves Settings makes (saveSetting / api / update_* keys) are the same multiset as 756ca09's, and
      //       the moved block did not come back: none of its code lines, none of its three saves, tombstone kept.
      const region = src => { const a = src.indexOf('function SettingsTab('); return src.slice(a, src.indexOf('\nfunction ', a + 10)) }
      const stripNow = r => r
        .replace(/        \{\/\* ── ⛔ "TAKING PAYMENT" MOVED TO MANAGE › PAYMENTS[\s\S]*?\*\/\}\n/, '')
        .replace(/  \/\/ ── ⛔ `completionPresses` MOVED WITH[^\n]*\n(  \/\/[^\n]*\n)*/, '')
      const baseSrc = execFileSync('git', ['show', '756ca09:app/manage/[token]/page.tsx'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 })
      const headR = region(headSrc), baseR = region(baseSrc), nowR = region(P)
      const headStripped = headR.replace(was, '')
        .replace(/  \/\/ ── THE RESOLVED COMPLETION SETTING, ONE PLACE ON THIS PAGE[^\n]*\n(  \/\/[^\n]*\n)*  const completionPresses: 'one' \| 'two' =\n    form\.completion_presses \?\? \(form\.show_paid_step === true \? 'two' : 'one'\)\n/, '')
      const baseStripped = stripNow(baseR)
      t('…and ONLY that block left Settings: the rest of SettingsTab is identical to 3033a53 (A: at 756ca09, the tree before Language Phase 1d)',
        headStripped.length > 100000 && headStripped === baseStripped,
        headStripped === baseStripped ? '' : `3033a53 ${headStripped.length} chars vs 756ca09 ${baseStripped.length}`)
      // (B) the line diff, 756ca09 → now (LCS over lines).
      const A = baseR.split('\n'), B = nowR.split('\n'), n = A.length, m = B.length
      const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1])
      const hunks = []; let cur = null
      for (let i = 0, j = 0; i < n || j < m;) {
        if (i < n && j < m && A[i] === B[j]) { cur = null; i++; j++; continue }
        if (!cur) hunks.push(cur = { del: [], add: [] })
        if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) cur.add.push(B[j++]); else cur.del.push(A[i++])
      }
      // A word site: a quoted literal holding a word; JSX text (between tags, or a whole line of it) holding a word once
      // {expressions} and &entities; are set aside; or a reference to the copy constants / labels 1d retired.
      const WORD_REF = /_MSG\b|VERIFY_MESSAGES|SETTING_COPY|SERVICE_SETTING_LABELS|OFFLINE_AUTO_REJECT|COPY\.|\{(sec\.)?label\}|\.map\(\(?\{? ?label/
      const wordSite = l => {
        const bare = l.replace(/&[a-z]+;/g, ' ').replace(/\{[^{}<>]*\}/g, ' ')
        // A quoted literal counts only if it is not a lowercase identifier — an identifier-like
        // literal ('update_van_settings', 'month') is code, and a line holding only those is not excused.
        const lits = [...l.matchAll(/(['"`])((?:\\.|(?!\1).)*)\1/g)].map(x => x[2])
        return lits.some(x => /[A-Za-z]{2}/.test(x) && !/^[a-z0-9_]+$/.test(x)) || WORD_REF.test(l)
          || [...bare.matchAll(/>([^<]*)</g)].some(x => /[A-Za-z]{2}/.test(x[1]))
          || (/^\s+[^\s<{/)]/.test(bare) && !/[=(){};<>]/.test(bare) && /[A-Za-z]{2}/.test(bare))
      }
      // Two NAMED word moves whose removed line has no word of its own — each excused only when its replacement is in
      // the same hunk: the QR logo placeholder's second line ('here', now line 2 of qr.logoPlaceholder), and the
      // add-on price (now the `price` value of manageSettings.vanBilling.body, still in <strong>).
      const NAMED = [
        ["    ctx.fillText('here', x + w / 2, y + h * 0.66)", /ctx\.fillText\(line2, x \+ w \/ 2, y \+ h \* 0\.66\)/],
        ["                <strong>{vanPx(vanAddonLabel('month'))}</strong>{' '}", /t\.rich\('vanBilling\.body', \{[^\n]*price: vanPx\(vanAddonLabel\('month'\)\), b: chunks => <strong>\{chunks\}<\/strong>/],
        // ⚠️ RE-PINNED (Language Phase 1d Part 2): five more NAMED word moves — Settings › Auto-replies' words went to
        // `manageWhatsApp`. Each removed line has no word of its own by the rule above, and each is excused ONLY when its
        // replacement is in the same hunk:
        //   · the setup notice now carries a CODE (worded at render), not an English sentence — its state's type is
        //     lib/whatsapp/setup-machine's SetupNotice (tone + code; checked below, outside this list);
        ["  const [setupNotice, setSetupNotice] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null)", /^  const \[setupNotice, setSetupNotice\] = useState<SetupNotice \| null>\(null\)$/],
        //   · the monthly-limit option's number is formatted by the message (`limit.option`, { n }) instead of formatLimit;
        ["                                <option key={v} value={v}>{formatLimit(v)}</option>", /^\s+<option key=\{v\} value=\{v\}>\{tW\('limit\.option', \{ n: v \}\)\}<\/option>$/],
        //   · the billing summary sentence (`billing.summary`): its "Correct at <date>" line, whose date is now the message's
        //     `checked` value, and the closing `</a>{' '}` of its "Meta's pricing" link, now the rich `link` tag;
        ["                            month are free. Correct at {META_PRICING_CHECKED_ON}; check{' '}", /^\s+checked: formatYmd\(META_PRICING_CHECKED_ON_YMD, ts, /],
        ["                            </a>{' '}", /^\s+link: c => <a href=\{META_PRICING_URL\} target="_blank" rel="noreferrer" className="underline font-semibold">\{c\}<\/a>,$/],
        //   · the last line of a JSX COMMENT (no code) that was shortened to a pointer when its paragraph became
        //     `billing.chargesBody`; the replacement comment opens in the same hunk.
        ["                                ages silently on a surface nobody re-reads. */}", /^\s+\{\/\* ⚠️ "From <date>, Meta includes" REPLACED "Meta currently includes" on 16 September 2026 — see the$/],
        //   · a line of the "How Meta charges" paragraph (words only; the rule above misses it for its ';'), now
        //     `billing.chargesBody`;
        ["                                replies a month per number; after that, each reply is charged at Meta&apos;s rate.", /^\s+\{tW\.rich\('billing\.chargesBody', \{$/],
        //   · the notice's render: our own notices print their CODE's words; `text` (words passed on from the route) still
        //     prints as it came — the same <p>, the same fallback.
        ["                  <p>{setupNotice.text}</p>", /^                  <p>\{setupNotice\.code \? tW\(`notice\.\$\{setupNotice\.code\}`\) : setupNotice\.text\}<\/p>$/],
        // ⚠️ RE-PINNED (Language Phase 1e): the van add-on's price WORD ("TBC" when masked) is worded in the truck's locale
        // (lib/plan-features priceText) — the mask is `vanMask` (the new line in this hunk) and `vanPx` wraps it a few
        // lines on, checked below with the other conditions of this assertion.
        ["  const vanPx = usePriceMask()", /^  const vanMask = usePriceMask\(\)$/],
        // ⚠️ RE-PINNED (us-rehearsal-unpriced-billing, 18 October 2026, docs/us-dress-rehearsal-stage1-report.md): the add-on
        // price is read through `withPlaceholderPlanPrices` — a switched-off country (the US) has NULL plan prices and the
        // raw read threw — and is then always masked (the vanPx assertion below).
        ["  const vanAddonMinor = vanAddonMonthlyMinor(truck.plan, vanSettings)", /^  const vanAddonMinor = vanAddonMonthlyMinor\(truck\.plan, withPlaceholderPlanPrices\(vanSettings\)\)$/],
      ]
      const named = (l, h) => NAMED.some(([line, re]) => l === line && h.add.some(x => re.test(x)))
      // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): Stage A legitimately removed plan-tier code from
      // SettingsTab — the starter van-upgrade modal and its state, INCLUDED_VANS, the 4-argument canAccess(plan, …), the
      // QR FeatureGate upgrade prompts, the WhatsApp "included on Pro and Max" / "Upgrade →" branch, and the comments that
      // described them. Each such HUNK is excused WHOLE only when (1) one of its removed lines is the named signature,
      // (2) it removed exactly the named number of lines, and (3) its replacement is in the same hunk (or, for a pure
      // removal, the removed thing appears nowhere in SettingsTab now). Anything else leaving Settings still fails.
      //   [signature (a removed line contains it), removed-line count, replacement regex on an added line | null, absent-now regex | null]
      const STAGE_A_HUNKS = [
        ['const [showVanUpgradeModal, setShowVanUpgradeModal] = useState(false)', 1, null, /showVanUpgradeModal/],
        ['`locked` is the below-plan branded case', 1, /^  \/\/ The enlarged view\. `locked` is the switched-off branded case: /, null],
        // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): SettingsTab's gates now ask `useFeatures(truck)`
        // (override → the effective plan's switch → on), so each Stage A replacement line became `features.can(...)`;
        // the same hunks (same removed lines, same counts) are excused only on the A2 replacement.
        ["const canBrand = canAccess(truck.plan, 'branded_qr_code',", 1, /^    const canBrand = features\.can\('branded_qr_code'\)$/, null],
        ["const preorderCan = canAccess(truck.plan, 'advance_preordering',", 1, /^  const preorderCan = features\.can\('advance_preordering'\)$/, null],
        // ⚠️ RE-PINNED (Stage A2): the tab's local `can` (a 6-line canAccess(plan, …) call at 756ca09) is now the
        // useFeatures switch — before A2 its words survived inside Stage A's 2-argument call, so no entry was needed.
        ['const can = (feature: Feature) => canAccess(', 6, /^  const can = \(feature: Feature\) => features\.can\(feature\)$/, null],
        ['`TRIAL_FEATURES = [...MAX_FEATURES]`', 4, /hasWhatsAppSetupPreview reads the per-truck override map and nothing else\./, null],
        ["`VAN_ADDON_PRICE` — a map of RAW POUNDS", 5, /^  \/\/ ── THE PRICE OF EACH ADDITIONAL VAN \(plans-data-model Stage A, 19 October 2026\)/, null],
        ['const vanAddonMinor = vanAddonMonthlyMinor(truck.plan, vanSettings)', 1, /^  const vanAddonMinor = extraVanMonthlyMinor\(truck, vanCatalog, vanSettings\.countryCode\)$/, null],
        ['const INCLUDED_VANS: Record<string, number>', 1, null, /INCLUDED_VANS: Record/],
        // ⚠️ RE-PINNED (Stage A2): the van flow uses the plan's `includedVans` (plans.included_vans) instead of a literal 1.
        ['const included = INCLUDED_VANS[truck.plan] ?? 1', 13, /^    if \(vans\.length >= vansIncluded && vanAddonMinor > 0\) setShowVanBillingModal\(true\)$/, null],
        ['BELOW THE PLAN THEY STILL SEE IT, WITH THEIR OWN LOGO', 3, /SWITCHED OFF FOR THIS TRUCK \(a feature override — no plan gates this since plans-data-model,$/, null],
        ['showUpgrade={true}', 7, null, /showUpgrade|feature="branded_qr_code"/],
        ['showUpgrade={true}', 9, null, /showUpgrade|feature="branded_qr_code"/],
        ['🔴 WHO REACHES IT CHANGED ON 16 September 2026.', 27, /🔴 WHO REACHES IT CHANGED AGAIN with plans-data-model \(Stage A/, null],
        ['that change — do not leave this one to cover both states. */}', 2, /sentence becomes wrong\. Restore a coming-soon branch in that change\. \*\/\}$/, null],
        // ⚠️ RE-PINNED (Stage A2): the WhatsApp card's else branch shows <PlanPrompt> when the PLAN is why, and the same
        // "switched off" line (now the ternary's second arm) when an override is.
        ['WhatsApp auto-replies are included on Pro and Max.', 8, /^\s+: <p className="text-xs text-slate-500 mt-1">\{tW\('card\.switchedOff'\)\}<\/p>\}$/, null],
        ['{isRowComingSoon(MESSENGER_INSTAGRAM_ROW) && (', 1, /^            \{!MESSENGER_INSTAGRAM_LIVE && \($/, null],
        ['{/* Van upgrade modal (starter plan) */}', 33, /THE VAN UPGRADE MODAL \("The Starter plan includes 1 van…"\) WAS HERE\./, null],
        // CustomDomainSetup no longer takes the now-unused `plan` / `trialExpiresAt` props (only the overrides gate it)
        // ⚠️ RE-PINNED (Stage A2): CustomDomainSetup's `featureOverrides` prop became `truck` (it asks useFeatures itself).
        ['<CustomDomainSetup token={token} plan={truck.plan}', 1, /<CustomDomainSetup token=\{token\} truck=\{truck\} truckName=/, null],
      ]
      const stageAHunk = h => STAGE_A_HUNKS.some(([sig, n, addRe, goneRe]) => h.del.some(l => l.includes(sig)) && h.del.length === n
        && (addRe ? h.add.some(x => addRe.test(x)) : h.add.length === 0) && (!goneRe || !goneRe.test(nowR)))
      const unexcused = hunks.filter(h => !stageAHunk(h)).flatMap(h => h.del.filter(l => l.trim() && !wordSite(l) && !named(l, h) && !h.add.some(x => x.includes(l.trim()))))
      t('…(B) 756ca09 → now: every line that left SettingsTab is a word moved to messages/ (or the same code re-wrapped)',
        // ⚠️ RE-PINNED (Language Phase 1d Part 2): + the setup notice's new state type really is { tone, code } (the
        // named move above excuses its useState line only on that basis).
        hunks.length > 50 && unexcused.length === 0
        // ⚠️ RE-PINNED (Language Phase 1e; us-rehearsal-unpriced-billing): the word through `vanMask` while prices are decided,
        // every amount masked while they are not.
        // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): the extra-van price is the effective plan's
        // plan_prices.extra_van_monthly_minor (always a number), and the amount comes from extraVanMonthlyMinor over the
        // plan catalogue. The word goes through `vanMask` while the truck's country is switched ON, and every amount is
        // masked while it is OFF — as the US was before (then keyed on its undecided prices, now on its own switch).
        && /\n  const vanPx = \(val: string\) => priceText\(vanSettings\.enabled \? vanMask\(val\) : maskPriceFor\(val, true\), vanSettings\.locale\)\n/.test(nowR)
        && /\n  const vanCatalog = usePlanCatalog\(\)\n/.test(nowR)
        && /export interface SetupNotice \{ tone: NoticeTone; code\?: SetupNoticeCode; text\?: string \}/.test(read('lib/whatsapp/setup-machine.ts')),
        unexcused.slice(0, 8).join('\n'))
      // (C) the saves, and the moved block staying out.
      const saves = r => [...r.matchAll(/saveSetting\(\s*'([a-z_]+)'|api\(\s*'([a-z_]+)'|\b(update_[a-z_]+)\b/g)].map(x => x[1] || x[2] || x[3]).sort().join(' ')
      const movedLines = was.split('\n').map(l => l.trim()).filter(l => l.length > 30 && !headStripped.includes(l))
      t('…(C) SettingsTab makes the same saves as at 756ca09, and the moved block has not come back',
        saves(baseR).length > 200 && saves(baseR) === saves(nowR)
        && movedLines.length > 50 && movedLines.every(l => !nowR.includes(l))
        && !/saveSetting\('(show_paid_step|completion_presses|takes_cash)'/.test(nowR)
        && /"TAKING PAYMENT" MOVED TO MANAGE › PAYMENTS/.test(nowR),
        `${saves(baseR) === saves(nowR) ? '' : 'saves differ; '}${movedLines.filter(l => nowR.includes(l)).slice(0, 3).join(' | ')}`)
    }
    const pt = read('components/manage/PaymentsTab.tsx')
    t('Payments places it after the online section and before "Walk-up payments" (with the new card first)',
      // ⚠️ RE-PINNED (Language Phase 1d Part 2): the "Walk-up payments" heading is `managePayments.walkUp.heading` now
      // (PaymentsTab's `t` is useT('managePayments')); the same order is asserted at the heading's new source, and the
      // key's en-GB text (frozen + as-moved) is still "Walk-up payments".
      pt.indexOf('{afterOnline}') > 0 && pt.indexOf('{afterOnline}') < pt.indexOf(`{t('walkUp.heading')}</h3>`)
      && /const t = useT\('managePayments'\)/.test(pt)
      && require('./_lp2-frozen.cjs').enGBForNode().managePayments?.walkUp?.heading === 'Walk-up payments'
      && /<ChargesCard [\s\S]{0,200}\/>\s*<TakingPaymentPanel /.test(P))
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════
  head('10 · Admin › Countries — the fee rows')
  {
    const tab = read('components/admin/CountriesTab.tsx')
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): the "Our fee above that" rate row (platform_fee_pct)
    // is retired with the other plan price rows — the rate is each plan's plan_prices.fee_bps, shown in the Plans table.
    // "Take our fee" now opens the "HatchGrab platform fee" group; its hint speaks of each plan's fee, the
    // not-charged-yet note stays, and "Needs a rate first" is gone (there is no country rate to need).
    t('"Take our fee" heads the "HatchGrab platform fee" group (the "Our fee above that" row is retired), with its hint and the not-charged-yet note',
      tab.indexOf("label: 'Take our fee'") > tab.indexOf("{ group: 'HatchGrab platform fee' }") && tab.indexOf("{ group: 'HatchGrab platform fee' }") > 0
      && !tab.includes("label: 'Our fee above that'") && !tab.includes('Needs a rate first')
      && has(tab, `hint: "Off: each plan's fee is shown on plans but never charged"`, 'Not charged yet — switching on has no effect until fee charging is built.'))
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
    // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): the "platform fee switched on needs a rate" rule is gone
    // — the rate is the plan's fee_bps, not country_settings.platform_fee_pct (retired; not shown, validated or written).
    // So switching "Take our fee" on with no country rate is now accepted, and the retired rate is not in the values.
    t('"Take our fee" can be switched on with no country rate (the rate is each plan\'s fee_bps), and the retired rate is not written',
      take.ok && take.values.platformFeeEnabled === true && !('platformFeePct' in take.values), take.ok ? take.values.platformFeeEnabled : take.errors)
  }
}
