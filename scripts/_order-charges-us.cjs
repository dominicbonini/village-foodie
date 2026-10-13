// scripts/_order-charges-us.cjs — the AFTER-only half of scripts/order-charges.cjs (Phase 3 foundations).
// The engine, the resolver, the same real routes on a US fixture (the US stays switched off in the database:
// these are fixtures), the pay-at-the-truck switch, D22, update_event_deal's bundle check, the migration's
// shape and the "nothing sends application_fee_amount" pins. Run by order-charges.cjs; not on its own.

const fs = require('fs'); const path = require('path')
const { makeFakePg } = require('./_fake-pg.cjs')
const SEEDS = require('./_country-settings-gb.cjs')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))

module.exports = async function us(h) {
  const { kit, mods, run, tables, post, json, t, head, read } = h
  const { REPO } = kit
  const m = await mods()
  const { E, R } = m.engine
  const US_SETTINGS = (over = {}) => ({ ...SEEDS.usFromSeed(), ...over })
  const GB_SETTINGS = SEEDS.gbFromSeed()

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · the engine (lib/order-charges.ts) — integer minor units, one rounding, half away from zero')
  {
    const rules = (over = {}) => ({ taxInclusive: false, taxLabel: 'Sales tax', taxRateMilli: 8250, feesTaxed: false, serviceFee: null,
      tipping: { presetsBps: [1000, 1500, 2000] }, surcharge: null, cardFeePayer: 'truck', platformFee: null, ...over })
    const a = E.computeOrderCharges({ foodMinor: 2400, rules: rules(), channel: 'online_pay_at_truck' })
    t('US $24.00 at 8.25 % (8250 thousandths) → tax $1.98, total $25.98', a.taxMinor === 198 && a.totalMinor === 2598, JSON.stringify(a))
    t('US $24.00 at 8.875 % (8875 thousandths) → tax $2.13, total $26.13 — the rate a basis point cannot hold',
      (x => x.taxMinor === 213 && x.totalMinor === 2613 && x.snapshot.tax_rate_milli === 8875)(E.computeOrderCharges({ foodMinor: 2400, rules: rules({ taxRateMilli: 8875 }), channel: 'walk_up' })))
    const b = E.computeOrderCharges({ foodMinor: 2400, rules: rules(), channel: 'online_card', tip: { kind: 'percent', bps: 1500 } })
    t('a 15 % tip on $24.00 → $3.60', b.tipMinor === 360 && b.snapshot.tip_pct_bps === 1500)
    t('…not taxed (tax stays $1.98) and not in food_minor (stays 2400)', b.taxMinor === 198 && b.snapshot.food_minor === 2400)
    t('…grand total = food + tax + tip = $29.58', b.totalMinor === 2958)
    t('D3 half away from zero: 0.5 → 1, 1.5 → 2, −1.5 → −2, 2.4999 → 2',
      E.applyBps(1, 5000) === 1 && E.applyBps(3, 5000) === 2 && E.applyBps(-3, 5000) === -2 && E.applyBps(24999, 1) === 2)
    t('D3 ONE rounding: $10.05 at 8.25 % → 83 (82.9125 rounded once)', E.computeOrderCharges({ foodMinor: 1005, rules: rules(), channel: 'walk_up' }).taxMinor === 83)
    const custom = E.computeOrderCharges({ foodMinor: 2400, rules: rules(), channel: 'online_card', tip: { kind: 'amount', minor: 9999 } })
    t('D12 a custom tip is capped at 100 % of food ($99.99 → $24.00), and stores no percentage', custom.tipMinor === 2400 && custom.snapshot.tip_pct_bps === null)
    t('D13 no tip on pay at the truck, even when one is sent', E.computeOrderCharges({ foodMinor: 2400, rules: rules(), channel: 'online_pay_at_truck', tip: { kind: 'percent', bps: 1500 } }).tipMinor === 0)
    t('D13 no tip on a walk-up', E.computeOrderCharges({ foodMinor: 2400, rules: rules(), channel: 'walk_up', tip: { kind: 'percent', bps: 1500 } }).tipMinor === 0)
    t('no tip when tipping is off', E.computeOrderCharges({ foodMinor: 2400, rules: rules({ tipping: null }), channel: 'online_card', tip: { kind: 'percent', bps: 1500 } }).tipMinor === 0)

    const hg = { recipient: 'hatchgrab', bps: 300, fixedMinor: 30 }
    const f1 = E.computeOrderCharges({ foodMinor: 2400, rules: rules({ serviceFee: hg }), channel: 'online_card' })
    t('D26 service fee kept by HatchGrab: 3 % + 30¢ on $24.00 = $1.02, ONE amount, recipient hatchgrab',
      f1.serviceFeeMinor === 102 && f1.snapshot.service_fee_recipient === 'hatchgrab')
    t('D8 …not taxed by default (tax $1.98 on the food alone); total $27.00', f1.taxMinor === 198 && f1.totalMinor === 2400 + 198 + 102)
    const f2 = E.computeOrderCharges({ foodMinor: 2400, rules: rules({ serviceFee: hg, feesTaxed: true }), channel: 'online_card' })
    t('D8 …taxed when the country says so: round((2400 + 102) × 8.25 %) = 206, rounded ONCE', f2.taxMinor === 206)
    const f3 = E.computeOrderCharges({ foodMinor: 2400, rules: rules({ serviceFee: hg }), channel: 'online_pay_at_truck' })
    t('D25 online → pay at the truck: the service fee is dropped and no recipient is written', f3.serviceFeeMinor === 0 && f3.snapshot.service_fee_recipient === null)
    t('the service fee is never on a walk-up', E.computeOrderCharges({ foodMinor: 2400, rules: rules({ serviceFee: hg }), channel: 'walk_up' }).serviceFeeMinor === 0)

    const sur = E.computeOrderCharges({ foodMinor: 2400, rules: rules({ surcharge: { bps: 300, fixedMinor: 0 } }), channel: 'online_card' })
    t('the engine supports a surcharge (3 % of $24.00 = 72¢) when rules carry one', sur.cardSurchargeMinor === 72 && sur.totalMinor === 2400 + 198 + 72)

    const gb = E.computeOrderCharges({ foodMinor: 2380, rules: rules({ taxInclusive: true, taxLabel: 'VAT', taxRateMilli: 20000, tipping: null }), channel: 'online_card' })
    t('tax-inclusive: tax 0, rate stored NULL whatever rate is around, total = food', gb.taxMinor === 0 && gb.snapshot.tax_rate_milli === null && gb.totalMinor === 2380)

    t('refuses a non-integer food amount', (() => { try { E.computeOrderCharges({ foodMinor: 23.8, rules: rules(), channel: 'walk_up' }); return false } catch { return true } })())
    t('tip choice parsing: absent → null; malformed → invalid; a preset → allowed; a non-preset → not allowed',
      E.parseTipChoice(undefined) === null && E.parseTipChoice({ kind: 'percent', bps: 1.5 }) === 'invalid' && E.parseTipChoice('15') === 'invalid'
      && E.tipChoiceAllowed({ kind: 'percent', bps: 1500 }, rules()) && !E.tipChoiceAllowed({ kind: 'percent', bps: 1700 }, rules())
      && !E.tipChoiceAllowed({ kind: 'percent', bps: 1500 }, rules({ tipping: null })) && E.tipChoiceAllowed({ kind: 'none' }, rules({ tipping: null })))

    // D14: an edit keeps the tip's percentage, never above the original amount
    const stored = { ...b.snapshot }
    const up = E.chargesForEdit(3000, rules(), stored)
    t('D14 edit UP ($24 → $30): 15 % would be $4.50, capped at the original $3.60', up.tipMinor === 360 && up.snapshot.tip_pct_bps === 1500)
    const down = E.chargesForEdit(2000, rules(), stored)
    t('D14 edit DOWN ($24 → $20): the tip keeps 15 % → $3.00', down.tipMinor === 300)
    t('D4 the edit taxes at the ORDER\'s rate (8.25 %) even when today\'s is 9 %', E.chargesForEdit(2000, rules({ taxRateMilli: 9000 }), stored).taxMinor === 165)
    const noOnline = E.chargesForEdit(2000, rules({ serviceFee: hg }), a.snapshot)
    t('an edit never ADDS a charge the order did not have (no tip, no fee before → none after)', noOnline.tipMinor === 0 && noOnline.serviceFeeMinor === 0 && noOnline.taxMinor === 165)
    const feeStored = { ...f1.snapshot }
    t('an edit recomputes the service fee, never above the original ($30: $1.20 → capped $1.02; $10: 60¢)',
      E.chargesForEdit(3000, rules({ serviceFee: hg }), feeStored).serviceFeeMinor === 102 && E.chargesForEdit(1000, rules({ serviceFee: hg }), feeStored).serviceFeeMinor === 60)
    const customStored = { ...custom.snapshot, tip_minor: 500 }
    t('a custom tip keeps its amount on an edit, capped at 100 % of the new food ($5 on $4 → $4)', E.chargesForEdit(400, rules(), customStored).tipMinor === 400)

    // the pay-at-the-truck switch
    const sw = E.chargesForHatchSwitch({ ...b.snapshot, service_fee_minor: 102, service_fee_recipient: 'hatchgrab' })
    t('the hatch switch drops the tip, service fee and surcharge and keeps tax on the food: $25.98', sw && sw.totalMinor === 2598 && sw.tipMinor === 0 && sw.serviceFeeMinor === 0 && sw.snapshot.tax_rate_milli === 8250)
    t('…and returns null (writes nothing) when there is nothing to drop — every GB order', E.chargesForHatchSwitch(gb.snapshot) === null && E.chargesForHatchSwitch(a.snapshot) === null && E.chargesForHatchSwitch({}) === null)

    // the platform fee: computed only here, behind the switch
    t('the would-be platform fee is null when the switch is off', E.wouldBeApplicationFeeMinor(2400, rules()) === null)
    t('…and with it on at 0.99 % of food_minor: 2400 → 24 (23.76 rounded), tip/tax/fee not in the base',
      E.wouldBeApplicationFeeMinor(2400, rules({ platformFee: { bps: 99 } })) === 24)
    t('the snapshot never carries application_fee_minor or card_funding this phase', b.snapshot.application_fee_minor === null && b.snapshot.card_funding === null)
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · the resolver (lib/order-charge-rules.ts) — country + truck (no per-event rate)')
  {
    const r0 = R.resolveChargeRules(GB_SETTINGS, { country: 'GB' })
    t('GB: tax included, "VAT", no rate, no fee, no tip, no surcharge, truck pays the card fee, no platform fee',
      r0.taxInclusive === true && r0.taxLabel === 'VAT' && r0.taxRateMilli === null && r0.serviceFee === null && r0.tipping === null
      && r0.surcharge === null && r0.cardFeePayer === 'truck' && r0.platformFee === null)
    t('GB ignores any rate a truck carries', R.resolveChargeRules(GB_SETTINGS, { tax_rate_milli: 8250 }).taxRateMilli === null)
    const us = US_SETTINGS()
    const r1 = R.resolveChargeRules(us, { tax_rate_milli: 8250 })
    t('US: the truck\'s ONE rate (8250 thousandths), "Sales tax", tipping on by country default with presets 1000/1500/2000 bps',
      r1.taxRateMilli === 8250 && r1.taxLabel === 'Sales tax' && JSON.stringify(r1.tipping) === JSON.stringify({ presetsBps: [1000, 1500, 2000] }))
    t('⛔ NO PER-EVENT RATE (13 Oct 2026): the resolver takes the country and the truck, nothing else', R.resolveChargeRules.length === 2)
    t('⛔ …and the retired `tax_rate_bps` is never read: a truck carrying only that has no rate', R.resolveChargeRules(us, { tax_rate_bps: 825 }).taxRateMilli === null)
    t('the truck can switch tipping off (and on where the country default is off)',
      R.resolveChargeRules(us, { tipping_enabled: false }).tipping === null && R.resolveChargeRules(GB_SETTINGS, { tipping_enabled: true }).tipping !== null)
    t('⚠️ the surcharge is OFF in Phase 3 even though the US row allows one', us.cardSurchargeAllowed === true && r1.surcharge === null)
    t('the seeded US row: service fee allowed but kept by the truck, and no truck has it on → no fee', r1.serviceFee === null)
    const hgUS = US_SETTINGS({ serviceFeeRecipient: 'hatchgrab', serviceFeeHatchgrabBps: 300, serviceFeeHatchgrabFixedMinor: 30 })
    t('HatchGrab keeps it: the country\'s 3 % + 30¢ — the truck\'s own numbers cannot change it',
      JSON.stringify(R.resolveChargeRules(hgUS, { service_fee_enabled: true, service_fee_bps: 9000 }).serviceFee) === JSON.stringify({ recipient: 'hatchgrab', bps: 300, fixedMinor: 30 }))
    const trUS = US_SETTINGS({ serviceFeeTruckMaxBps: 400, serviceFeeTruckMaxFixedMinor: 50 })
    t('the truck keeps it: its own 5 % + $1 clamped to the country maximum 4 % + 50¢',
      JSON.stringify(R.resolveChargeRules(trUS, { service_fee_enabled: true, service_fee_bps: 500, service_fee_fixed_minor: 100 }).serviceFee) === JSON.stringify({ recipient: 'truck', bps: 400, fixedMinor: 50 }))
    t('…within the maximum it is the truck\'s own (2 % + 25¢)',
      JSON.stringify(R.resolveChargeRules(trUS, { service_fee_enabled: true, service_fee_bps: 200, service_fee_fixed_minor: 25 }).serviceFee) === JSON.stringify({ recipient: 'truck', bps: 200, fixedMinor: 25 }))
    t('…and off when the truck has not switched it on', R.resolveChargeRules(trUS, { service_fee_enabled: false, service_fee_bps: 200 }).serviceFee === null)
    t('…and off when the country does not allow a service fee at all', R.resolveChargeRules(US_SETTINGS({ serviceFeeAllowed: false, serviceFeeRecipient: 'hatchgrab', serviceFeeHatchgrabBps: 300 }), {}).serviceFee === null)
    t('a part the country gives no maximum for is not allowed (no max fixed → fixed 0)',
      R.resolveChargeRules(US_SETTINGS({ serviceFeeTruckMaxBps: 400 }), { service_fee_enabled: true, service_fee_bps: 200, service_fee_fixed_minor: 25 }).serviceFee.fixedMinor === 0)
    t('the card fee payer is the truck\'s setting', R.resolveChargeRules(us, { card_fee_payer: 'customer' }).cardFeePayer === 'customer')
    t('the platform fee is on only behind the country switch AND a rate', R.resolveChargeRules(US_SETTINGS({ platformFeeEnabled: true, platformFeePct: 0.99 }), {}).platformFee.bps === 99
      && R.resolveChargeRules(US_SETTINGS({ platformFeePct: 0.99 }), {}).platformFee === null)
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · the real routes on a US fixture (the US stays switched off in the database)')
  const usTables = (settingsOver = {}, truckOver = {}, extra = {}) => {
    const tb = tables({
      truck: { country: 'US', currency: 'USD', timezone: 'America/Chicago', tax_rate_milli: 8250, card_fee_payer: 'truck', ...truckOver },
      country_settings: [snake(US_SETTINGS(settingsOver))],
      orders: extra.orders || [],
      event: extra.event || {},
    })
    tb.menu_items_db = [{ id: 'u1', truck_id: 'test-truck', name: 'Burger', price: 12, category_id: 'c1', category: 'Pizzas', available: true, is_active: true }]
    tb.item_modifier_groups = []
    if (extra.order_drafts) tb.order_drafts = extra.order_drafts
    return tb
  }
  const US_BODY = (x = {}) => ({ truckId: 'test-kitchen', customerName: 'Ann Example', customerEmail: 'ann@example.test', customerPhone: '2015550123',
    slot: '12:00', eventDate: '2026-10-09', eventId: 'ev1', items: [{ name: 'Burger', quantity: 2, unit_price: 12, modifiers: [] }], deals: [], ...x })

  {
    const r = await run(async mm => json(await mm.submit.POST(post('/api/orders/submit', US_BODY()))), usTables())
    const p = r.rpcs.find(c => c.fn === 'place_order_atomic_v2')?.args.p_order
    t('pay at the truck: v2 is called (and the old function never is)', !!p && !r.rpcs.some(c => c.fn === 'place_order_atomic'), JSON.stringify(r.out))
    t('…$24.00 food, $1.98 tax at 8.25 %, total $25.98 (total 25.98 and total_minor 2598 agree)',
      p && p.food_minor === 2400 && p.tax_minor === 198 && p.tax_rate_milli === 8250 && p.total_minor === 2598 && p.total === 25.98 && p.tax_label === 'Sales tax' && p.tax_inclusive === false)
    t('…no tip, no fee, no surcharge, no recipient', p && p.tip_minor === 0 && p.service_fee_minor === 0 && p.card_surcharge_minor === 0 && p.service_fee_recipient === null)
    t('…the response and the emails carry the grand total', r.out.body.total === 25.98 && r.emails.some(e => /\$25\.98/.test(e.text)))
  }
  {
    const r = await run(async mm => json(await mm.submit.POST(post('/api/orders/submit', US_BODY({ tip: { kind: 'percent', bps: 1500 } })))), usTables())
    const p = r.rpcs.find(c => c.fn === 'place_order_atomic_v2')?.args.p_order
    t('D13 a tip sent with a pay-at-the-truck order is ignored: tip 0, total $25.98', p && p.tip_minor === 0 && p.total_minor === 2598)
  }
  {
    const r = await run(async (mm, db) => {
      const s1 = await json(await mm.submit.POST(post('/api/orders/submit', US_BODY({ payByCard: true, tip: { kind: 'percent', bps: 1500 } }))))
      const d = db.tables.order_drafts[0]
      if (d) d.payment_intent_id = 'pi_harness'
      const s2 = d ? await mm.promote.promoteDraft(globalThis.__harnessDb, d.order_key, 'webhook') : null
      return { s1, s2 }
    }, usTables({ serviceFeeRecipient: 'hatchgrab', serviceFeeHatchgrabBps: 300, serviceFeeHatchgrabFixedMinor: 30 }))
    const draft = r.writes.find(w => w.table === 'order_drafts' && w.op === 'insert')?.row
    const order = r.writes.find(w => w.table === 'orders' && w.op === 'insert')?.row
    t('card + 15 % tip + HatchGrab fee: the card is authorised for the GRAND total 2400 + 198 + 360 + 102 = 3060',
      r.auth[0]?.amountMinor === 3060 && r.out.s1.body.total === 30.6, JSON.stringify(r.auth))
    t('…the draft stores the snapshot (food 2400, tax 198, tip 360 @ 1500 bps, fee 102 → hatchgrab, total_minor 3060)',
      draft && draft.food_minor === 2400 && draft.tax_minor === 198 && draft.tip_minor === 360 && draft.tip_pct_bps === 1500
      && draft.service_fee_minor === 102 && draft.service_fee_recipient === 'hatchgrab' && draft.total_minor === 3060)
    t('…promotion copies every snapshot column to the order unchanged', order && E.ORDER_CHARGE_COLUMNS.every(c => order[c] === draft[c]) && order.total_minor === 3060)
    t('…and no application_fee_amount anywhere in what was sent to the card processor', !JSON.stringify(r.auth).includes('application_fee'))
  }
  {
    const r = await run(async mm => json(await mm.submit.POST(post('/api/orders/submit', US_BODY({ payByCard: true, tip: { kind: 'amount', minor: 5000 } })))), usTables())
    t('a custom tip above 100 % of food is capped by the server: authorised 2400 + 198 + 2400', r.auth[0]?.amountMinor === 4998)
    const bad = await run(async mm => json(await mm.submit.POST(post('/api/orders/submit', US_BODY({ payByCard: true, tip: { kind: 'percent', bps: 1700 } })))), usTables())
    t('a percentage the country does not offer is REFUSED (400), and nothing is written or authorised',
      bad.out.status === 400 && bad.out.body.tipInvalid === true && bad.writes.length === 0 && bad.auth.length === 0)
    const off = await run(async mm => json(await mm.submit.POST(post('/api/orders/submit', US_BODY({ payByCard: true, tip: { kind: 'percent', bps: 1500 } })))), usTables({}, { tipping_enabled: false }))
    t('a tip on a truck with tipping off is refused the same way', off.out.status === 400 && off.auth.length === 0)
  }
  {
    const r = await run(async mm => json(await mm.submit.POST(post('/api/orders/submit', US_BODY({ payByCard: true })))), usTables({ serviceFeeTruckMaxBps: 400, serviceFeeTruckMaxFixedMinor: 50 }, { service_fee_enabled: true, service_fee_bps: 500, service_fee_fixed_minor: 100 }))
    const draft = r.writes.find(w => w.table === 'order_drafts' && w.op === 'insert')?.row
    t('a truck-kept fee over the country maximum is clamped: 4 % + 50¢ = $1.46 → truck', draft && draft.service_fee_minor === 146 && draft.service_fee_recipient === 'truck')
    const hatch = await run(async mm => json(await mm.submit.POST(post('/api/orders/submit', US_BODY()))), usTables({ serviceFeeTruckMaxBps: 400, serviceFeeTruckMaxFixedMinor: 50 }, { service_fee_enabled: true, service_fee_bps: 500 }))
    const p = hatch.rpcs.find(c => c.fn === 'place_order_atomic_v2')?.args.p_order
    t('D25 …and the same truck\'s pay-at-the-truck order carries no fee', p && p.service_fee_minor === 0 && p.service_fee_recipient === null && p.total_minor === 2598)
  }
  {
    const r = await run(async mm => json(await mm.submit.POST(post('/api/orders/submit', US_BODY()))), usTables({}, {}, { event: { tax_rate_bps: 900, tax_rate_milli: 9000 } }))
    const p = r.rpcs.find(c => c.fn === 'place_order_atomic_v2')?.args.p_order
    t('⛔ an event\'s rate columns are IGNORED end to end — the truck\'s 8.25 % is charged ($1.98, total $25.98)', p && p.tax_rate_milli === 8250 && p.tax_minor === 198 && p.total_minor === 2598)
    const r2 = await run(async mm => json(await mm.submit.POST(post('/api/orders/submit', US_BODY()))), usTables({}, { tax_rate_milli: 8875 }))
    const p2 = r2.rpcs.find(c => c.fn === 'place_order_atomic_v2')?.args.p_order
    t('a truck at 8.875 % end to end: $24.00 → tax $2.13, total $26.13, rate stored as 8875', p2 && p2.tax_minor === 213 && p2.total_minor === 2613 && p2.tax_rate_milli === 8875)
  }
  {
    const r = await run(async mm => json(await mm.action.POST(post('/api/dashboard/action', {
      token: 'tok-test', action: 'manual',
      manualOrder: { customerName: 'Walk-up', slot: '13:00', event_date: '2026-10-09', event_id: 'ev1', order_key: 'ok-us-walk', provisional_id: '90',
        items: [{ name: 'Burger', quantity: 2, unit_price: 12, modifiers: [] }] },
    }))), usTables({ serviceFeeRecipient: 'hatchgrab', serviceFeeHatchgrabBps: 300 }))
    const row = r.writes.find(w => w.table === 'orders')?.row
    t('D9 walk-up: taxed ($1.98), no service fee even with HatchGrab\'s on, no tip; total_minor 2598',
      row && row.tax_minor === 198 && row.service_fee_minor === 0 && row.tip_minor === 0 && row.total_minor === 2598 && row.total === 25.98, JSON.stringify(r.out))
  }
  const US_ORDER = {
    order_key: 'ok-us-1', id: '20', truck_id: 'test-truck', customer_name: 'Cy Example', customer_email: 'cy@example.test', customer_phone: null,
    slot: '12:30', order_type: 'collection', event_date: '2026-10-09', event_id: 'ev1', van_id: null,
    items: [{ name: 'Burger', quantity: 2, unit_price: 12, modifiers: [] }], deals: [], discount_code: null,
    subtotal: 24, discount_amt: 0, total: 30.6, total_minor: 3060, currency: 'USD', country: 'US', notes: null, status: 'confirmed', payment_status: 'unpaid', amount_paid: 0,
    food_minor: 2400, tax_minor: 198, tax_rate_milli: 8250, tax_inclusive: false, tax_label: 'Sales tax', tip_minor: 360, tip_pct_bps: 1500,
    service_fee_minor: 102, service_fee_recipient: 'hatchgrab', card_surcharge_minor: 0, card_funding: null, card_fee_payer: 'truck', application_fee_minor: null,
  }
  {
    const r = await run(async mm => json(await mm.action.POST(post('/api/dashboard/action', {
      token: 'tok-test', action: 'edit', order_key: 'ok-us-1',
      editedOrder: { items: [{ name: 'Burger', quantity: 3, unit_price: 12, modifiers: [] }] },
    }))), usTables({ serviceFeeRecipient: 'hatchgrab', serviceFeeHatchgrabBps: 300, serviceFeeHatchgrabFixedMinor: 30 }, { tax_rate_milli: 9000 }, { orders: [US_ORDER] }))
    const patch = r.writes.find(w => w.table === 'orders' && w.op === 'update' && w.patch.food_minor !== undefined)?.patch
    t('edit $24 → $36: tax at the ORDER\'s 8.25 % (not today\'s 9 %) = $2.97', patch && patch.food_minor === 3600 && patch.tax_minor === 297 && patch.tax_rate_milli === 8250, JSON.stringify(r.out))
    t('D14 …the tip keeps 15 % ($5.40) capped at the original $3.60', patch && patch.tip_minor === 360 && patch.tip_pct_bps === 1500)
    t('…the fee is recomputed (3 % + 30¢ = $1.38) and capped at the original $1.02', patch && patch.service_fee_minor === 102)
    t('…total_minor = 3600 + 297 + 360 + 102 = 4359, and total agrees', patch && patch.total_minor === 4359 && patch.total === 43.59)
  }
  {
    // A card order whose hold was RELEASED (no live hold, nothing captured) is now paid at the hatch.
    const drafts = [{ order_key: 'ok-us-1', truck_id: 'test-truck', payment_intent_id: 'pi_gone', authorization_cancelled_at: '2026-10-09T10:00:00Z', promoted_at: '2026-10-09T09:00:00Z', total_minor: 3060 }]
    const r = await run(async mm => json(await mm.action.POST(post('/api/dashboard/action', { token: 'tok-test', action: 'mark_paid_cash', order_key: 'ok-us-1' }))),
      usTables({}, {}, { orders: [US_ORDER], order_drafts: drafts }))
    const sw = r.writes.find(w => w.table === 'orders' && w.op === 'update' && w.patch.total_minor !== undefined)?.patch
    t('D25 pay at the hatch after a released hold: the tip and service fee are dropped, tax stays on the food → $25.98',
      sw && sw.total_minor === 2598 && sw.tip_minor === 0 && sw.service_fee_minor === 0 && sw.service_fee_recipient === null && sw.tax_minor === 198, JSON.stringify(r.out))
    t('…and the hatch collects the RE-PRICED balance (2598), not the online one', r.out.body.chargedMinor === 2598)
    const held = await run(async mm => json(await mm.action.POST(post('/api/dashboard/action', { token: 'tok-test', action: 'mark_paid_cash', order_key: 'ok-us-1' }))),
      usTables({}, {}, { orders: [US_ORDER], order_drafts: [{ ...drafts[0], authorization_cancelled_at: null, promoted_at: '2026-10-09T09:00:00Z' }] }))
    t('…a LIVE hold is still refused before anything is re-priced (409, no order write)',
      held.out.status === 409 && !held.writes.some(w => w.table === 'orders' && w.op === 'update' && w.patch.total_minor !== undefined))
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · D22 — the state\'s two-letter code, stored and never shown')
  {
    const P = await kit.bundle('places', "export * as P from '@/lib/places'\nexport * as T from '@/lib/trade-area'")
    // A stand-in key and an injected fetch: nothing leaves the process, and any real key is not used.
    const prevKey = process.env.GOOGLE_MAPS_API_KEY
    process.env.GOOGLE_MAPS_API_KEY = 'harness-key'
    const answer = (comps) => async () => ({ ok: true, status: 200, json: async () => ({ id: 'ChIJ_placeid_123', displayName: { text: 'Austin' }, location: { latitude: 30.27, longitude: -97.74 }, addressComponents: comps }), text: async () => '' })
    const tx = await P.P.townDetails('ChIJ_placeid_123', 'sess-1', 'zip_state', answer([{ longText: 'Texas', shortText: 'TX', types: ['administrative_area_level_1'] }]))
    t('a US place gives region "Texas" AND regionCode "TX"', tx.state === 'ok' && tx.place.region === 'Texas' && tx.place.regionCode === 'TX', JSON.stringify(tx))
    const odd = await P.P.townDetails('ChIJ_placeid_123', 'sess-1', 'zip_state', answer([{ longText: 'Somewhere', shortText: 'Smwh.', types: ['administrative_area_level_1'] }]))
    const none = await P.P.townDetails('ChIJ_placeid_123', 'sess-1', 'zip_state', answer([]))
    t('an unknown state stores no code (not two letters → null; none given → null)', odd.place.regionCode === null && none.place.regionCode === null)
    const gb = await P.P.townDetails('ChIJ_placeid_123', 'sess-1', 'postcode', answer([{ longText: 'Suffolk', shortText: 'Suffolk', types: ['administrative_area_level_2'] }, { longText: 'England', shortText: 'England', types: ['administrative_area_level_1'] }]))
    t('a GB place is unchanged: no regionCode key at all', gb.state === 'ok' && !('regionCode' in gb.place) && gb.place.region === 'Suffolk')
    if (prevKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY; else process.env.GOOGLE_MAPS_API_KEY = prevKey
    const US = US_SETTINGS()
    const ta = P.T.checkTradeArea({ timezone: 'America/Chicago', base_place_id: 'ChIJ_placeid_123', base_place_name: 'Austin', base_region: 'Texas', base_lat: 30.27, base_lng: -97.74, base_region_code: 'TX' }, US)
    t('checkTradeArea (signup and Where you trade): a US place stores base_region_code "TX"', ta.ok && ta.values.base_region_code === 'TX')
    const bad = P.T.checkTradeArea({ timezone: 'America/Chicago', base_place_id: 'ChIJ_placeid_123', base_place_name: 'Austin', base_lat: 30.27, base_lng: -97.74, base_region_code: 'tex' }, US)
    const typed = P.T.checkTradeArea({ timezone: 'America/Chicago', base_place_name: 'Austin', base_region_code: 'TX' }, US)
    t('…a malformed code, or a typed town with no place, stores NULL', bad.ok && bad.values.base_region_code === null && typed.ok && typed.values.base_region_code === null)
    const gbTa = P.T.checkTradeArea({ timezone: 'Europe/London', base_place_id: 'ChIJ_placeid_123', base_place_name: 'Sudbury', base_region: 'Suffolk', base_lat: 52, base_lng: 0.7, base_region_code: 'XX' }, GB_SETTINGS)
    t('…and a GB save carries NO base_region_code key, so it writes exactly what it wrote before', gbTa.ok && !('base_region_code' in gbTa.values))
    const src = ['components/setup/WhereBasedStep.tsx', 'components/manage/WhereYouTrade.tsx', 'app/api/setup/route.ts', 'lib/provision-truck.ts'].map(read).join('\n')
    t('the code flows: details → BasePlace → both request bodies → setup → provisioning (key only when present)',
      /regionCode: d\.place\.regionCode/.test(src) && (src.match(/base_region_code: (a\.place|p)\.regionCode/g) || []).length === 2
      && /base_region_code: body\.base_region_code/.test(src) && /'base_region_code' in tradeArea/.test(src))
    const shown = ['components', 'app'].flatMap(d => { const out = []; const walk = p => { for (const e of fs.readdirSync(path.join(REPO, p), { withFileTypes: true })) { const q = path.join(p, e.name); if (e.isDirectory()) walk(q); else if (/\.tsx$/.test(e.name)) out.push(q) } }; walk(d); return out })
      .filter(f => /regionCode|base_region_code/.test(read(f)) && /\{[^}]*(regionCode|base_region_code)[^}]*\}\s*</.test(read(f)))
    t('nothing displays it: no JSX renders regionCode / base_region_code', shown.length === 0, shown.join(', '))
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · update_event_deal refuses another truck\'s bundle')
  {
    const ACCESS = { file: 'app/api/manage/route.ts', from: /const access = await resolveTruckAccess\(req, truck\)/g, to: "const access = { ok: true as const, role: 'owner' as const, userId: null, operatorId: null, via: 'harness' } as any" }
    const manage = await kit.bundle('manage', "export { POST } from '@/app/api/manage/route'", { patches: [ACCESS] })
    const deal = async (bundleId) => {
      const pg = makeFakePg({
        trucks: [{ id: 'test-truck', dashboard_token: 'tok-test', operator_id: 'op-test', name: 'Pizza Kitchen', plan: 'pro', country: 'GB' },
                 { id: 'other-truck', dashboard_token: 'tok-other', operator_id: 'op-other', name: 'Another Truck', plan: 'pro', country: 'GB' }],
        truck_events: [{ id: 'ev-own', truck_id: 'test-truck', event_date: '2026-10-12' }],
        bundles_db: [{ id: 'b-own', truck_id: 'test-truck', name: 'Meal deal' }, { id: 'b-other', truck_id: 'other-truck', name: 'Their deal' }],
        event_deals: [],
      }, { keys: { event_deals: [['event_id', 'bundle_id']] } })
      globalThis.__harnessDb = pg
      try {
        const res = await kit.quietAsync(() => manage.POST(post('/api/manage', { token: 'tok-test', action: 'update_event_deal', eventId: 'ev-own', bundleId, active: false })))
        return { status: res.status, body: await res.json(), writes: pg.writes }
      } finally { delete globalThis.__harnessDb }
    }
    const own = await deal('b-own')
    t('own event + own bundle: written as before', own.status === 200 && own.body.ok === true && own.writes.some(w => w.table === 'event_deals'))
    const other = await deal('b-other')
    t('own event + ANOTHER truck\'s bundle: 404 "Event not found", nothing written',
      other.status === 404 && other.body.error === 'Event not found' && other.writes.length === 0, JSON.stringify(other))
    const unknown = await deal('b-nope')
    t('…an unknown bundle id: the same refusal', unknown.status === 404 && unknown.writes.length === 0)
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════
  head('7 · the migration, the old function, and what is never sent')
  {
    const sql = read('supabase/migrations/20261010_18_tax_rate_milli.sql')  // v2's CURRENT definition
    const code = sql.replace(/--.*$/gm, '')
    const v2 = code.slice(code.indexOf('create or replace function place_order_atomic_v2'), code.indexOf('$$;', code.indexOf('create or replace function place_order_atomic_v2')))
    const insertCols = (v2.match(/insert into orders \(([\s\S]*?)\) values/) || [])[1] || ''
    t('v2 writes every snapshot column', E.ORDER_CHARGE_COLUMNS.every(c => new RegExp(`\\b${c}\\b`).test(insertCols)), insertCols)
    t('…reads each from p_order', E.ORDER_CHARGE_COLUMNS.every(c => v2.includes(`p_order->>'${c}'`)))
    t('…and takes total_minor from p_order, falling back to round(total × 100)', /coalesce\(\(p_order->>'total_minor'\)::integer, round\(coalesce\(\(p_order->>'total'\)::numeric, 0\) \* 100\)::integer\)/.test(v2))
    const old = read('supabase/migrations/20260804_place_order_atomic_placed_at.sql')
    const oldBody = old.slice(old.indexOf('declare'), old.indexOf('$$;', old.indexOf('declare')))
    const v2Body = v2.slice(v2.indexOf('declare'))
    const strip = s => s.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim()
    const added = strip(v2Body).replace(/, food_minor, tax_minor[^)]*application_fee_minor/, '').replace(/ coalesce\(\(p_order->>'total_minor'\)::integer, (round\(coalesce\(\(p_order->>'total'\)::numeric, 0\) \* 100\)::integer)\)/, ' $1')
      .replace(/, \(p_order->>'food_minor'\)::integer[\s\S]*?\(p_order->>'application_fee_minor'\)::integer/, '')
    t('…and is otherwise the 20260804 function, line for line', added === strip(oldBody), `\nOLD ${strip(oldBody).slice(0, 300)}\nV2  ${added.slice(0, 300)}`)
    t('the OLD function is not redefined, altered or dropped here', !/function place_order_atomic\s*\(/.test(code) && !/drop\s+(function|table|column)/i.test(code))
    t('every new column is nullable or has a default', (code.match(/add column if not exists \w+\s+[^;]+;/g) || []).every(l => !/not null/.test(l) || /default/.test(l)))
    t('safe twice: every column "if not exists", every CHECK guarded, the function "create or replace"',
      !/add column (?!if not exists)/.test(code) && /if not exists \(\s*select 1 from pg_constraint/.test(code) && /create or replace function place_order_atomic_v2/.test(code))
    t('v2 is service-role only', /revoke all on function public\.place_order_atomic_v2[^;]*from public, anon, authenticated;/.test(code) && /grant execute on function public\.place_order_atomic_v2[^;]*to service_role;/.test(code))
    t('20261010_18: v2 writes tax_rate_milli and never tax_rate_bps', /\btax_rate_milli\b/.test(insertCols) && !/tax_rate_bps/.test(v2))
    t('20261010_18: three nullable integer tax_rate_milli columns (trucks, orders, order_drafts), each CHECKed 0–20000',
      ['trucks', 'orders', 'order_drafts'].every(tb => new RegExp(`alter table public\\.${tb}\\s+add column if not exists tax_rate_milli integer;`).test(code))
      && /check \(tax_rate_milli between 0 and 20000\)/.test(code))
    t('20261010_18: all four tax_rate_bps columns are commented as RETIRED, and none is dropped',
      ['trucks', 'orders', 'order_drafts', 'truck_events'].every(tb => new RegExp(`comment on column public\\.${tb}\\.tax_rate_bps is\\s+'RETIRED`).test(sql)))
    const sent = ['app', 'lib'].flatMap(d => { const out = []; const walk = p => { for (const e of fs.readdirSync(path.join(REPO, p), { withFileTypes: true })) { const q = path.join(p, e.name); if (e.isDirectory()) walk(q); else if (/\.tsx?$/.test(e.name)) out.push(q) } }; walk(d); return out })
      .filter(f => /application_fee_amount/.test(read(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')))
    t('no code sends application_fee_amount (comments aside)', sent.length === 0, sent.join(', '))
    t('no route calls wouldBeApplicationFeeMinor — it is computed only here, behind the switch',
      ['app/api/orders/submit/route.ts', 'app/api/dashboard/action/route.ts', 'lib/payments/promote-draft.ts', 'lib/payments/ledger.ts', 'lib/payments/capture.ts', 'lib/payments/authorize.ts']
        .every(f => !/wouldBeApplicationFeeMinor/.test(read(f))))
    /* ⚠️ RE-AIMED BY PHASE 3 SCREENS (docs/phase-3-screens-report.md): the order page now SENDS the tip
     * choice — and only on a card order at a truck whose checkout rules have tipping on. A UK truck has no
     * `checkout`, so its body never carries one. */
    t('the submit route accepts a tip choice, and the page sends one only on a card order with tipping on',
      /\btip,\n/.test(read('app/api/orders/submit/route.ts'))
      && /\.\.\.\(sentByCard && checkout\?\.tipping \? \{ tip: tipChoice \} : \{\}\)/.test(read('app/trucks/[slug]/order/page.tsx')))
  }
}
