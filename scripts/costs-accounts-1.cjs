#!/usr/bin/env node
// scripts/costs-accounts-1.cjs — costs-accounts-1 (4 November 2026, docs/costs-accounts-1-report.md): a dish's cost to make, profit
// per period and per event, and the accountant's totals and CSVs.
//   node scripts/costs-accounts-1.cjs        (NO NETWORK, NO DATABASE — the real route over an in-memory database)
//
// What it proves, in order:
//    1 · the migrations: menu_item_costs private (RLS on, no policy, nothing for anon/authenticated), one row per dish per day; the
//        tax-year columns added with no row written in 20261068; 20261069 writes only GB, AU and NZ's two new columns; 20261071 only HK's;
//    2 · the tax-year presets for GB (6 April), US (calendar year) and AU (1 July) — and NZ, and "no entry" = calendar year;
//    3 · cost history: an old order uses the old cost, a new order the new one; a cleared cost is "no cost", never zero;
//    4 · the partial-cost wording: "Cost set for X of Y dishes sold", profit null for an incomplete order or event;
//    5 · tax: stored (added, and France's included rate) vs estimated from the truck's rate (included and added) vs none (the UK);
//    6 · refunds subtracted: a partial refund (tax scaled), a refunded-and-cancelled order (net 0), a cancelled order with no money;
//    7 · the two CSVs: UTF-8 BOM, one header row, CRLF, ISO dates, dot decimals, no symbol, a currency column, JPY with no decimals,
//        quoting, formula cells defused, no customer name, email or phone;
//    8 · the real /api/manage route: set_item_cost / get_item_cost (GBP pence, JPY yen, same-day replace, no-op, refusals, staff),
//        get_accounts_settings (the country's data), get_report's accounts (paging past 1,000 orders, staff get none, the orders
//        list unchanged in shape);
//    9 · the cost never reaches a customer surface: only lib/accounts/costs-server.ts names the table, only the Manage route
//        imports it, and the public menu API's answer has no cost in it with a cost row in the database;
//   10 · Pizzeria Gusto's order paths byte-identical to the tree before this work, and upsert_item untouched;
//   11 · the words: every new string in en-GB and every language base, translation-check structural 0, the English variants'
//        "Pay at the truck", and the Manage screens read them.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'costs-accounts-1' })
const { REPO } = kit
const { makeFakePg } = require('./_fake-pg.cjs')
const SEEDS = require('./_country-settings-gb.cjs')
const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))

/* 🔴 THE TREE BEFORE THIS WORK'S CODE, PINNED BY SHA (never HEAD: HEAD moves). 8b32036f is costs-accounts-1's migrations commit;
 * no code file differs there from 41de9294, the commit before it. */
const BEFORE = '8b32036f'
const gitShow = f => execFileSync('git', ['show', `${BEFORE}:${require('./_moved-paths.cjs').pathAt(BEFORE, f)}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 64e6 })

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 900) : JSON.stringify(detail).slice(0, 900)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const stripComments = s => s.replace(/--.*$/gm, '')

;(async () => {
  kit.setNow('2026-11-04T12:00:00.000Z'); kit.setDeviceTz('Europe/London')
  const L = await kit.bundle('ca1-lib', [
    "export * as TY from '@/lib/accounts/tax-year'",
    "export * as LG from '@/lib/accounts/ledger'",
    "export * as CSV from '@/lib/accounts/csv'",
  ].join('\n'))
  const { TY, LG, CSV } = L

  // ── 1 · the migrations ────────────────────────────────────────────────────────────────────────────────────────────────
  head('1 · the migrations')
  {
    const A = read('supabase/migrations/20261068_costs_accounts_1.sql'), B = read('supabase/migrations/20261069_costs_accounts_1_tax_years.sql')
    const a = stripComments(A), b = stripComments(B)
    t('menu_item_costs: RLS on, every grant to anon and authenticated revoked (table and sequence), no policy', /alter table public\.menu_item_costs enable row level security/.test(a)
      && /revoke all on public\.menu_item_costs from anon, authenticated/.test(a) && /revoke all on sequence public\.menu_item_costs_id_seq from anon, authenticated/.test(a) && !/create policy|grant /i.test(a))
    t('one row per dish per day (unique item_id, effective_from); cost in minor units, NULL = no cost; the dish and the truck cascade',
      /unique \(item_id, effective_from\)/.test(a) && /cost_minor\s+integer check \(cost_minor is null or \(cost_minor >= 0/.test(a)
      && /item_id\s+uuid not null references public\.menu_items_db\(id\) on delete cascade/.test(a) && /truck_id\s+text not null references public\.trucks\(id\) on delete cascade/.test(a))
    t('20261068 adds the two tax-year columns (both or neither, day 1–28) and writes NO row', /add column if not exists tax_year_start_month smallint/.test(a) && /add column if not exists tax_year_start_day smallint/.test(a)
      && /tax_year_start_day between 1 and 28/.test(a) && !/\b(update|insert into|delete from)\b/i.test(a))
    const ups = [...b.matchAll(/update public\.country_settings set (.*?) where country_code = '([A-Z]{2})';/g)].map(m => [m[2], m[1]])
    t('20261069 writes only GB 6 April, AU 1 July, NZ 1 April — the two new columns, nothing else', JSON.stringify(ups) === JSON.stringify([['GB', 'tax_year_start_month = 4, tax_year_start_day = 6'], ['AU', 'tax_year_start_month = 7, tax_year_start_day = 1'], ['NZ', 'tax_year_start_month = 4, tax_year_start_day = 1']])
      && (b.match(/\bupdate\b/gi) || []).length === 3 && !/insert|delete|alter/i.test(b), ups)
    // ⚠️ costs-accounts-1 follow-up (5 November 2026, Dominic's Q2 → A): Hong Kong's tax year starts 1 April — its own file, 20261071.
    const c = stripComments(read('supabase/migrations/20261071_costs_accounts_1_hk_tax_year.sql'))
    t('20261071 writes only HK 1 April — the two new columns, nothing else', JSON.stringify([...c.matchAll(/update public\.country_settings set (.*?) where country_code = '([A-Z]{2})';/g)].map(m => [m[2], m[1]])) === JSON.stringify([['HK', 'tax_year_start_month = 4, tax_year_start_day = 1']])
      && (c.match(/\bupdate\b/gi) || []).length === 1 && !/insert|delete|alter/i.test(c))
    t('all three are one transaction', [a, b, c].every(x => /^begin;/m.test(x) && /^commit;/m.test(x)))
  }

  // ── 2 · tax-year presets ──────────────────────────────────────────────────────────────────────────────────────────────
  head('2 · the date presets — GB, US, AU (and NZ; no entry = the calendar year)')
  {
    const GB = TY.taxYearStartOf(4, 6), AU = TY.taxYearStartOf(7, 1), NZ = TY.taxYearStartOf(4, 1), US = TY.taxYearStartOf(null, null)
    const p = (today, s) => TY.datePresets(today, s)
    const eq = (x, from, to) => x.from === from && x.to === to
    t('GB on 4 Nov 2026: last tax year 2025-04-06 … 2026-04-05', eq(p('2026-11-04', GB).lastTaxYear, '2025-04-06', '2026-04-05'), p('2026-11-04', GB).lastTaxYear)
    t('GB on 5 Apr 2026 (still the 2025 tax year): last tax year 2024-04-06 … 2025-04-05; on 6 Apr: 2025-04-06 … 2026-04-05',
      eq(p('2026-04-05', GB).lastTaxYear, '2024-04-06', '2025-04-05') && eq(p('2026-04-06', GB).lastTaxYear, '2025-04-06', '2026-04-05'))
    t('US (no entry): last tax year 2025-01-01 … 2025-12-31', US === null && eq(p('2026-11-04', US).lastTaxYear, '2025-01-01', '2025-12-31'))
    t('AU on 4 Nov 2026: 2025-07-01 … 2026-06-30; on 30 Jun 2026: 2024-07-01 … 2025-06-30', eq(p('2026-11-04', AU).lastTaxYear, '2025-07-01', '2026-06-30') && eq(p('2026-06-30', AU).lastTaxYear, '2024-07-01', '2025-06-30'))
    t('NZ on 4 Nov 2026: 2025-04-01 … 2026-03-31', eq(p('2026-11-04', NZ).lastTaxYear, '2025-04-01', '2026-03-31'))
    t('HK (1 April, from 20261071) on 4 Nov 2026: 2025-04-01 … 2026-03-31', eq(p('2026-11-04', TY.taxYearStartOf(4, 1)).lastTaxYear, '2025-04-01', '2026-03-31'))
    t('this month 2026-11-01 … today; last month 2026-10-01 … 2026-10-31; last quarter 2026-07-01 … 2026-09-30',
      eq(p('2026-11-04', GB).thisMonth, '2026-11-01', '2026-11-04') && eq(p('2026-11-04', GB).lastMonth, '2026-10-01', '2026-10-31') && eq(p('2026-11-04', GB).lastQuarter, '2026-07-01', '2026-09-30'))
    t('January rolls back a year: last month 2025-12, last quarter 2025-10-01 … 2025-12-31; February ends on the 28th/29th',
      eq(p('2026-01-15', US).lastMonth, '2025-12-01', '2025-12-31') && eq(p('2026-01-15', US).lastQuarter, '2025-10-01', '2025-12-31') && eq(p('2028-03-02', US).lastMonth, '2028-02-01', '2028-02-29'))
    t('an unusable start is no start (never guessed); 1 January is the calendar year', TY.taxYearStartOf(13, 1) === null && TY.taxYearStartOf(4, 31) === null && TY.taxYearStartOf('x', 2) === null && TY.taxYearStartOf(1, 1) === null)
    t('presetOf names a preset range, and a hand-edited one is custom', TY.presetOf({ from: '2025-04-06', to: '2026-04-05' }, '2026-11-04', GB) === 'lastTaxYear' && TY.presetOf({ from: '2025-04-07', to: '2026-04-05' }, '2026-11-04', GB) === null)
    const comps = read('app/(app)/manage/[token]/page.tsx')
    t('nothing per country in the screen: the start comes from get_accounts_settings (country_settings data)', /api\('get_accounts_settings'\)\.then\(r => setTaxYearStart\(r\?\.taxYearStart \?\? null\)\)/.test(comps)
      && !/tax_year_start|'GB'|=== 'AU'|=== 'NZ'/.test(comps.slice(comps.indexOf('function ReportsTab('), comps.indexOf('// ── TeamTab'))))
  }

  // Ledger fixtures: Pizza Kitchen, GB, two dishes.
  const TZ = 'Europe/London'
  const ITEMS = { Margherita: 'i-marg', 'Garlic Bread': 'i-garlic', Tiramisu: 'i-tira' }
  const COSTS = [
    { item_id: 'i-marg', cost_minor: 300, currency: 'GBP', effective_from: '2026-10-01' },
    { item_id: 'i-marg', cost_minor: 350, currency: 'GBP', effective_from: '2026-11-01' },
    { item_id: 'i-garlic', cost_minor: 80, currency: 'GBP', effective_from: '2026-10-10' },
    { item_id: 'i-garlic', cost_minor: null, currency: 'GBP', effective_from: '2026-11-02' },
  ]
  const ord = (n, over = {}) => ({ order_key: `k${n}`, id: String(n), created_at: '2026-10-20T11:30:00.000Z', event_date: '2026-10-20', event_id: 'ev-a', customer_email: 'ann@example.test',
    customer_name: 'Ann Example', customer_phone: '07700 900123', status: 'collected', total: 12, currency: 'GBP', items: [{ name: 'Margherita', quantity: 1, unit_price: 12 }], ...over })
  const GBRULE = { inclusive: true, rateMilli: null }
  const rowsOf = (orders, payments = [], costs = COSTS, tax = GBRULE, currency = 'GBP') => LG.accountRows({ orders, payments, costs, itemIdByName: ITEMS, tax, timeZone: TZ, currency })

  // ── 3 · cost history ──────────────────────────────────────────────────────────────────────────────────────────────────
  head('3 · cost history — an old order keeps the old cost')
  {
    const [old, nw, early] = rowsOf([ord(1), ord(2, { event_date: '2026-11-03', created_at: '2026-11-03T12:00:00Z' }), ord(3, { event_date: '2026-09-15', created_at: '2026-09-15T12:00:00Z' })])
    t('an order on 20 Oct uses the 1 Oct cost (£3.00); one on 3 Nov the 1 Nov cost (£3.50)', old.costMinor === 300 && nw.costMinor === 350, [old.costMinor, nw.costMinor])
    t('an order before the first cost uses the first (there was no earlier cost to keep)', early.costMinor === 300 && early.dishesWithCost === 1)
    const twoGarlic = rowsOf([ord(4, { event_date: '2026-11-03', items: [{ name: 'Garlic Bread', quantity: 2, unit_price: 4 }] }), ord(5, { items: [{ name: 'Garlic Bread', quantity: 2, unit_price: 4 }] })])
    t('a cost cleared on 2 Nov is "no cost" after it (not zero); before it the old cost (2 × 80p)', twoGarlic[0].dishesWithCost === 0 && twoGarlic[0].costMinor === 0 && twoGarlic[0].profitMinor === null && twoGarlic[1].costMinor === 160 && twoGarlic[1].dishesWithCost === 2)
    t('the cost on the order date is the latest entry on or before it (costOn)', LG.costOn(COSTS.filter(c => c.item_id === 'i-marg'), '2026-10-31').cost_minor === 300 && LG.costOn(COSTS.filter(c => c.item_id === 'i-marg'), '2026-11-01').cost_minor === 350)
    t('a cost in another currency is not used', rowsOf([ord(6, { currency: 'EUR' })])[0].dishesWithCost === 0)
  }

  // ── 4 · partial-cost wording ──────────────────────────────────────────────────────────────────────────────────────────
  head('4 · partial costs — "Cost set for X of Y dishes sold", never a silent zero')
  {
    const rows = rowsOf([ord(1, { items: [{ name: 'Margherita', quantity: 2, unit_price: 12 }, { name: 'Tiramisu', quantity: 1, unit_price: 5 }], total: 29 }), ord(2, { event_id: 'ev-b', event_date: '2026-10-21' })])
    const s = LG.summarise(rows)
    t('the order with a dish without a cost: 3 dishes, 2 with a cost, cost £6.00, profit null', rows[0].dishes === 3 && rows[0].dishesWithCost === 2 && rows[0].costMinor === 600 && rows[0].profitMinor === null)
    t('the period: 4 dishes, 3 with a cost, cost £9.00, profit = net − cost', s.totals.dishes === 4 && s.totals.dishesWithCost === 3 && s.totals.costMinor === 900 && s.totals.profitMinor === s.totals.netMinor - 900)
    t('per event: the incomplete event has no profit, the complete one has', s.events.length === 2 && s.events[0].profitMinor === null && s.events[1].profitMinor === 1200 - 300)
    const W = JSON.parse(read('messages/en-GB.json')).manageReports.accounts
    const T = await kit.bundle('ca1-t', "export { translatorFor } from '@/lib/i18n/translator'\nimport '@/lib/i18n/catalog/manageReports'")
    const tr = T.translatorFor('en-GB', 'manageReports')
    t('the words: "Cost set for 3 of 4 dishes sold" / "… of 1 dish sold"', tr('accounts.coverage', { total: 4, withCost: '3' }) === 'Cost set for 3 of 4 dishes sold' && tr('accounts.coverage', { total: 1, withCost: '0' }) === 'Cost set for 0 of 1 dish sold')
    t('and the partial warning says the profit is too high; with no cost at all, profit shows "—" and the screen says so', /profit is higher than it really is/.test(W.partial) && /No dish has a cost yet/.test(W.noCosts))
    const page = read('app/(app)/manage/[token]/page.tsx')
    t('the screen: profit "—" when no dish has a cost; the warning whenever fewer than all have one', /anyCost \? accMoney\(tt\.profitMinor\) : '—'/.test(page) && /tt\.dishesWithCost < tt\.dishes && <p[^>]*data-accounts-partial="some">\{t\('accounts\.partial'\)\}/.test(page))
  }

  // ── 5 · tax ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  head('5 · tax — stored with the order, or estimated from the truck\'s rate (and labelled), or none')
  {
    const US = ord(1, { total: 30.6, currency: 'USD', food_minor: 2400, tax_minor: 198, tax_rate_milli: 8250, tax_inclusive: false })
    const FR = ord(2, { total: 12, currency: 'EUR', food_minor: 1200, tax_minor: 0, tax_rate_milli: 10000, tax_inclusive: true })
    const rUS = rowsOf([US], [], [], { inclusive: false, rateMilli: 6625 }, 'USD')[0]
    const rFR = rowsOf([FR], [], [], { inclusive: true, rateMilli: null }, 'EUR')[0]
    t('stored, added: the order\'s own $1.98 (not today\'s 6.625 % rate)', rUS.taxMinor === 198 && rUS.taxBasis === 'stored' && rUS.netMinor === 3060 - 198)
    t('stored, included (France\'s TVA 10 %): €1.09 of €12.00, the receipt\'s own sum', rFR.taxMinor === 109 && rFR.taxBasis === 'stored')
    const old = ord(3, { total: 10, currency: 'USD' })
    const estAdded = rowsOf([old], [], [], { inclusive: false, rateMilli: 8250 }, 'USD')[0]
    const estIncl = rowsOf([ord(4, { total: 12, currency: 'EUR' })], [], [], { inclusive: true, rateMilli: 20000 }, 'EUR')[0]
    t('estimated, added rule: $10.00 × 8.25 % = $0.83', estAdded.taxMinor === 83 && estAdded.taxBasis === 'estimated')
    t('estimated, included rule: €12.00 × 20/120 = €2.00', estIncl.taxMinor === 200 && estIncl.taxBasis === 'estimated')
    const gb = rowsOf([ord(5), ord(6, { food_minor: 1200, tax_minor: 0, tax_inclusive: true, tax_rate_milli: null })])
    t('none (a UK truck, no rate): tax 0, basis "none" — before and after the order snapshot', gb.every(r => r.taxMinor === 0 && r.taxBasis === 'none'))
    t('the basis shown for a mix: estimated wins; none only when no row has a rate', LG.taxBasisOf({ stored: 3, estimated: 1, none: 0 }) === 'estimated' && LG.taxBasisOf({ stored: 2, estimated: 0, none: 5 }) === 'stored' && LG.taxBasisOf({ stored: 0, estimated: 0, none: 4 }) === 'none')
    const en = JSON.parse(read('messages/en-GB.json')).manageReports
    t('the labels: "estimated from your tax rate" on the screen and in the CSV; "no tax rate set"', en.accounts.taxEstimated === 'estimated from your tax rate' && en.accountsCsv.taxBasis.estimated === 'estimated from your tax rate' && en.accountsCsv.taxBasis.none === 'no tax rate set')
  }

  // ── 6 · refunds ───────────────────────────────────────────────────────────────────────────────────────────────────────
  head('6 · refunds subtracted')
  {
    const pay = (k, kind, amount, channel = 'online', state = 'succeeded') => ({ order_key: k, kind, channel, amount_minor: amount, state })
    const US = { inclusive: false, rateMilli: 10000 }
    const orders = [
      ord(1, { total: 22, currency: 'USD', food_minor: 2000, tax_minor: 200, tax_inclusive: false, tax_rate_milli: 10000 }),   // partly refunded
      ord(2, { total: 6, currency: 'USD', status: 'cancelled' }),                                                               // paid, refunded, cancelled
      ord(3, { total: 9, currency: 'USD', status: 'cancelled' }),                                                               // cancelled, no money
      ord(4, { total: 5, currency: 'USD', customer_email: null }),                                                              // walk-up
      ord(5, { total: 8, currency: 'USD' }),                                                                                    // online, pay at the truck
    ]
    const payments = [pay('k1', 'charge', 2200), pay('k1', 'refund', 1100), pay('k2', 'charge', 600), pay('k2', 'refund', 600), pay('k5', 'charge', 800, 'in_person_other'), pay('k1', 'refund', 500, 'online', 'failed')]
    const rows = rowsOf(orders, payments, [], US, 'USD')
    const by = Object.fromEntries(rows.map(r => [r.number, r]))
    t('a half refund: refunded $11.00, tax halved to $1.00, net $10.00 (a failed refund ignored)', by['1'].refundedMinor === 1100 && by['1'].taxMinor === 100 && by['1'].netMinor === 1000)
    t('paid, refunded in full and cancelled: listed, gross $6, refunded $6, net 0, no dishes', by['2'] && by['2'].cancelled && by['2'].grossMinor === 600 && by['2'].refundedMinor === 600 && by['2'].netMinor === 0 && by['2'].dishes === 0)
    t('cancelled with no money taken: not listed', !by['3'])
    const s = LG.summarise(rows).totals
    t('the period: gross $41, refunds $17, net = gross − refunds − tax', s.grossMinor === 4100 && s.refundedMinor === 1700 && s.netMinor === s.grossMinor - s.refundedMinor - s.taxMinor, s)
    t('channel and payment: card online (1, 2), pay at the truck (5, paid at the hatch), walk-up (4)', by['1'].payment === 'card_online' && by['2'].payment === 'card_online' && by['5'].payment === 'pay_at_truck' && by['4'].payment === 'walkup' && by['4'].channel === 'walkup' && by['5'].channel === 'online'
      && s.payment.card_online === 2800 && s.payment.pay_at_truck === 800 && s.payment.walkup === 500 && s.channel.online === 3600 && s.channel.walkup === 500)
    t('dates and times on the truck\'s clock (11:30 UTC on 20 Oct = 12:30 BST)', by['1'].date === '2026-10-20' && by['1'].time === '12:30')
  }

  // ── 7 · the CSVs ──────────────────────────────────────────────────────────────────────────────────────────────────────
  head('7 · the accountant CSVs — format')
  {
    const en = JSON.parse(read('messages/en-GB.json')).manageReports
    const words = {
      header: k => en.accountsCsv.header[k], channel: c => (c === 'online' ? 'Online' : 'Walk-up'), payment: p => ({ card_online: 'Card online', pay_at_truck: 'Pay at Hatch', walkup: 'Walk-up' })[p],
      taxBasis: b => en.accountsCsv.taxBasis[b], event: id => ({ 'ev-a': 'The Green, Testville', 'ev-b': '=HYPERLINK("x"), "Quoted"' })[id] ?? 'Unknown event',
    }
    const rows = rowsOf([ord(1, { total: 1234.5, items: [{ name: 'Margherita', quantity: 1, unit_price: 1234.5 }] }), ord(2, { event_id: 'ev-b', total: 2, items: [{ name: 'Margherita', quantity: 1, unit_price: 2 }] })])
    const csv = CSV.ordersCsv(rows, words)
    const lines = csv.slice(1).split('\r\n')
    t('UTF-8 with a byte-order mark, one header row, CRLF line ends, a final CRLF', csv.charCodeAt(0) === 0xFEFF && csv.endsWith('\r\n') && !/[^\r]\n/.test(csv) && lines[0] === 'Date,Time,Order number,Event,Channel,Payment method,Currency,Gross,Tax,Tax basis,Net,Refunded,Cost,Profit', lines[0])
    t('a row: ISO date, 24-hour time, plain amounts with a dot (no £, no thousands mark), the currency column', lines[1] === '2026-10-20,12:30,1,"The Green, Testville",Online,Card online,GBP,1234.50,0.00,no tax rate set,1234.50,0.00,3.00,1231.50'.replace('Card online', 'Pay at Hatch'), lines[1])
    t('a negative profit stays a number ("-1.00"), a formula-like event is defused and quoted', lines[2].includes(`"'=HYPERLINK(""x""), ""Quoted"""`) && /,-1\.00$/.test(lines[2]), lines[2])
    t('no customer name, email or phone anywhere', !/Ann|example\.test|07700/.test(csv))
    const jpRows = LG.accountRows({ orders: [ord(1, { total: 1980, currency: 'JPY', items: [{ name: 'Margherita', quantity: 2, unit_price: 990 }] })], payments: [{ order_key: 'k1', kind: 'refund', channel: 'online', amount_minor: 990, state: 'succeeded' }],
      costs: [{ item_id: 'i-marg', cost_minor: 350, currency: 'JPY', effective_from: '2026-10-01' }], itemIdByName: ITEMS, tax: { inclusive: true, rateMilli: 10000 }, timeZone: 'Asia/Tokyo', currency: 'JPY' })
    const jp = CSV.ordersCsv(jpRows, words).slice(1).split('\r\n')[1]
    t('JPY: whole yen, no decimals (gross 1980, refunded 990, cost 700; tax 90 = 10/110 of what was kept)', jp === '2026-10-20,20:30,1,The Green Testville,Online,Pay at Hatch,JPY,1980,90,estimated from your tax rate,900,990,700,200'.replace('The Green Testville', '"The Green, Testville"'), jp)
    t('csvAmount: 2-decimal and 0-decimal currencies; negatives', CSV.csvAmount(5, 'GBP') === '0.05' && CSV.csvAmount(123456, 'EUR') === '1234.56' && CSV.csvAmount(1980, 'JPY') === '1980' && CSV.csvAmount(-250, 'USD') === '-2.50')
    const ev = CSV.eventsCsv(LG.summarise(rows).events, 'GBP', words).slice(1).split('\r\n')
    t('the events file: one summary row per event, with dishes sold and dishes with a cost', ev[0] === 'Event date,Event,Orders,Currency,Gross,Tax,Tax basis,Net,Refunded,Dishes sold,Dishes with a cost,Cost,Profit' && ev.length === 4 && ev[3] === ''
      && ev[1].startsWith('2026-10-20,"The Green, Testville",1,GBP,1234.50,0.00,no tax rate set,1234.50,0.00,1,1,3.00,1231.50'), ev)
    const page = read('app/(app)/manage/[token]/page.tsx')
    t('the downloads are UTF-8 text/csv files named accounts-orders-… / accounts-events-…', /new Blob\(\[csv\], \{ type: 'text\/csv;charset=utf-8' \}\)/.test(page) && /a\.download = `accounts-\$\{kind\}-\$\{scope\}\$\{vanFilterFilenameSuffix\(vans, vanFilter\)\}\.csv`/.test(page))
  }

  // ── 8 · the route ─────────────────────────────────────────────────────────────────────────────────────────────────────
  head('8 · the real /api/manage route')
  const GBROW = { ...snake(SEEDS.gbFromSeed()), tax_year_start_month: 4, tax_year_start_day: 6 }
  const USROW = { ...snake(SEEDS.usFromSeed()), tax_year_start_month: null, tax_year_start_day: null }
  const JPROW = { ...snake(SEEDS.gbFromSeed()), country_code: 'JP', name: 'Japan', currency: 'JPY', locale: 'ja-JP', default_timezone: 'Asia/Tokyo', timezones: ['Asia/Tokyo'], tax_label: '消費税' }
  const TRUCK = (over = {}) => ({ id: 'test-truck', slug: 'test-kitchen', name: 'Pizza Kitchen', active: true, plan: 'pro', country: 'GB', currency: 'GBP', timezone: 'Europe/London', operator_id: 'op-test', dashboard_token: 'tok-test', ...over })
  const ACCESS = role => ({ file: 'app/api/manage/route.ts', from: /const access = await resolveTruckAccess\(req, truck\)/g, to: `const access = { ok: true as const, role: '${role}' as const, userId: null, operatorId: null, via: 'harness' } as any` })
  const routes = {}
  const call = async (role, db, body) => {
    routes[role] = routes[role] || await kit.bundle(`ca1-manage-${role}`, "export { POST } from '@/app/api/manage/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", { patches: [ACCESS(role)] })
    globalThis.__harnessDb = db; routes[role].clearCountrySettingsCache()
    try {
      const res = await kit.quietAsync(() => routes[role].POST(new NextRequest('http://127.0.0.1:3999/api/manage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'tok-test', ...body }) })))
      return { status: res.status, body: await res.json() }
    } finally { delete globalThis.__harnessDb }
  }
  const MENU = [{ id: 'i-marg', truck_id: 'test-truck', name: 'Margherita', category_id: 'c1', is_active: true, price: 12 }, { id: 'i-old', truck_id: 'test-truck', name: 'Margherita', category_id: 'c1', is_active: false, price: 10 },
    { id: 'i-other', truck_id: 'other-truck', name: 'Other', category_id: 'c9', is_active: true, price: 5 }]
  const dbOf = (extra = {}, truck = TRUCK()) => makeFakePg({ trucks: [truck, TRUCK({ id: 'other-truck', dashboard_token: 'tok-other' })], country_settings: [GBROW, USROW, JPROW], menu_items_db: MENU, menu_item_costs: [], menu_categories: [{ id: 'c1', truck_id: 'test-truck', name: 'Pizzas', sort_order: 1, is_active: true }],
    orders: [], order_payments: [], truck_events: [], whatsapp_logs: [], ...extra }, { keys: { menu_item_costs: [['item_id', 'effective_from']] } })
  {
    const db = dbOf()
    const s1 = await call('owner', db, { action: 'set_item_cost', itemId: 'i-marg', cost: '2.35' })
    const rows = () => (db.tables ? db.tables.menu_item_costs : db.dump?.('menu_item_costs'))
    t('owner sets £2.35 → one row: 235 pence, GBP, from today (2026-11-04)', s1.status === 200 && s1.body.written === true && JSON.stringify(rows().map(r => [r.item_id, r.cost_minor, r.currency, r.effective_from])) === '[["i-marg",235,"GBP","2026-11-04"]]', { s1, rows: rows() })
    const g = await call('manager', db, { action: 'get_item_cost', itemId: 'i-marg' })
    t('a manager reads it back as 2.35', g.status === 200 && g.body.cost === 2.35 && g.body.currency === 'GBP', g)
    const same = await call('owner', db, { action: 'set_item_cost', itemId: 'i-marg', cost: '2.35' })
    const again = await call('owner', db, { action: 'set_item_cost', itemId: 'i-marg', cost: '2.5' })
    t('the same value writes nothing; a change the same day replaces today\'s row (still one row, 250)', same.body.written === false && again.body.written === true && rows().length === 1 && rows()[0].cost_minor === 250, rows())
    rows().push({ id: 99, truck_id: 'test-truck', item_id: 'i-marg', cost_minor: 300, currency: 'GBP', effective_from: '2026-10-01' })
    await call('owner', db, { action: 'set_item_cost', itemId: 'i-marg', cost: '' })
    t('an earlier day\'s row is never touched; clearing writes today\'s row as NULL', rows().find(r => r.effective_from === '2026-10-01').cost_minor === 300 && rows().find(r => r.effective_from === '2026-11-04').cost_minor === null)
    const staff = await call('staff', db, { action: 'set_item_cost', itemId: 'i-marg', cost: '1' })
    const staffRead = await call('staff', db, { action: 'get_item_cost', itemId: 'i-marg' })
    const other = await call('owner', db, { action: 'set_item_cost', itemId: 'i-other', cost: '1' })
    const neg = await call('owner', db, { action: 'set_item_cost', itemId: 'i-marg', cost: '-1' })
    const junk = await call('owner', db, { action: 'set_item_cost', itemId: 'i-marg', cost: 'abc' })
    t('refused: staff (read and write, 403), another truck\'s dish (404), a negative or a word (400) — nothing written', staff.status === 403 && staffRead.status === 403 && other.status === 404 && neg.status === 400 && junk.status === 400
      && neg.body.code === 'cost_invalid' && rows().length === 2, [staff.status, staffRead.status, other.status, neg.status, junk.status])
    const jdb = dbOf({}, TRUCK({ country: 'JP', currency: 'JPY', timezone: 'Asia/Tokyo' }))
    const j = await call('owner', jdb, { action: 'set_item_cost', itemId: 'i-marg', cost: '350' })
    const jr = jdb.tables.menu_item_costs
    t('a yen truck: ¥350 is stored as 350 (no decimals, 35.an-19), and read back as 350', j.status === 200 && jr[0].cost_minor === 350 && jr[0].currency === 'JPY' && (await call('owner', jdb, { action: 'get_item_cost', itemId: 'i-marg' })).body.cost === 350, jr)

    const gbS = await call('owner', dbOf(), { action: 'get_accounts_settings' })
    const usS = await call('owner', dbOf({}, TRUCK({ country: 'US', currency: 'USD', timezone: 'America/New_York' })), { action: 'get_accounts_settings' })
    t('get_accounts_settings: GB → 6 April (from the row), US → null (calendar year)', JSON.stringify(gbS.body.taxYearStart) === '{"month":4,"day":6}' && usS.body.taxYearStart === null, [gbS.body, usS.body])

    // get_report over 1,203 orders (paging), a refunded cancelled order, a cancelled order with no money.
    const many = []
    for (let i = 1; i <= 1200; i++) many.push({ ...ord(i), truck_id: 'test-truck', created_at: `2026-10-20T${String(9 + Math.floor(i / 200)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00.000Z`, discount_amt: 0, deals: [], slot: null, total_minor: 1200, tax_minor: 0, tip_minor: 0, service_fee_minor: 0, card_surcharge_minor: 0 })
    many.push({ ...many[0], order_key: 'k-refunded', id: '9001', status: 'cancelled', total: 6 })
    many.push({ ...many[0], order_key: 'k-cancelled', id: '9002', status: 'cancelled', total: 9 })
    many.push({ ...many[0], order_key: 'k-other-day', id: '9003', event_date: '2026-10-25' })
    const rdb = dbOf({ orders: many, order_payments: [{ order_key: 'k-refunded', truck_id: 'test-truck', kind: 'charge', channel: 'online', amount_minor: 600, state: 'succeeded' }, { order_key: 'k-refunded', truck_id: 'test-truck', kind: 'refund', channel: 'online', amount_minor: 600, state: 'succeeded' }],
      menu_item_costs: [{ id: 1, truck_id: 'test-truck', item_id: 'i-marg', cost_minor: 300, currency: 'GBP', effective_from: '2026-10-01' }],
      truck_events: [{ id: 'ev-a', truck_id: 'test-truck', event_date: '2026-10-20', venue_name: 'The Green', town: 'Testville', van_id: null }] })
    const rep = await call('owner', rdb, { action: 'get_report', dateFrom: '2026-10-20', dateTo: '2026-10-20' })
    const acc = rep.body.report?.accounts
    t('get_report reads every page: 1,200 standing orders listed (past the 1,000-row cap)', rep.status === 200 && rep.body.report.orders.length === 1200, rep.body.report?.orders?.length)
    t('…and the accounts: 1,201 rows (the refunded cancelled order in, the unpaid cancelled one and the other day out)', acc && acc.rows.length === 1201 && acc.rows.some(r => r.orderKey === 'k-refunded' && r.refundedMinor === 600 && r.netMinor === 0) && !acc.rows.some(r => r.orderKey === 'k-cancelled' || r.orderKey === 'k-other-day'), acc && acc.rows.length)
    t('…each standing order costed at the 1 Oct cost (the ACTIVE Margherita, not the removed one), currency and tax label from the country', acc.rows.filter(r => !r.cancelled).every(r => r.costMinor === 300 && r.dishesWithCost === 1) && acc.currency === 'GBP' && acc.taxLabel === 'VAT')
    t('the orders list keeps its shape: no currency or tax_inclusive key added to a row', rep.body.report.orders.every(o => !('currency' in o) && !('tax_inclusive' in o)))
    const st = await call('staff', rdb, { action: 'get_report', dateFrom: '2026-10-20', dateTo: '2026-10-20' })
    t('staff: the report as before, with no accounts (no costs)', st.status === 200 && st.body.report.orders.length === 1200 && !('accounts' in st.body.report))
    const route = read('app/api/manage/route.ts')
    t('the three new actions are coded Manage actions; staff are refused the cost', /'get_item_cost', 'set_item_cost', 'get_accounts_settings',/.test(route) && /if \(action === 'get_item_cost' \|\| action === 'set_item_cost'\) \{\n\s+if \(requestingUserRole === 'staff'\) return refuse\('insufficient_permissions', 403\)/.test(route))
  }

  // ── 9 · never on a customer surface ───────────────────────────────────────────────────────────────────────────────────
  head('9 · the cost never reaches the public menu API, the order page, the KDS or tickets')
  {
    const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'app', 'lib', 'components', 'hooks', 'proxy.ts'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter(f => /\.(ts|tsx|js|mjs)$/.test(f))
    const naming = files.filter(f => read(f).includes('menu_item_costs'))
    t('only lib/accounts/costs-server.ts names the table (in code)', JSON.stringify(naming) === '["lib/accounts/costs-server.ts"]', naming)
    const importers = files.filter(f => /from '@\/lib\/accounts\/costs-server'/.test(read(f)))
    t('only the Manage route imports it', JSON.stringify(importers) === '["app/api/manage/route.ts"]', importers)
    const CUSTOMER = files.filter(f => /^(app\/(api\/menu|api\/orders|api\/kds|api\/dashboard|api\/webhooks|order|o\/|kds|dashboard|trucks|embed|\[country\])|components\/(dashboard|embed)|lib\/(printing|orders|payments)\/)/.test(f) || /^lib\/(menu-loader|order-[a-z-]+)\.ts$/.test(f))
    const touching = CUSTOMER.filter(f => /lib\/accounts|menu_item_costs|cost_minor|costToMake/.test(read(f)))
    t(`none of the ${CUSTOMER.length} customer, KDS, ticket and order files touches the cost`, CUSTOMER.length > 40 && !touching.length, touching)
    const M = await kit.bundle('ca1-menu', "export { GET } from '@/app/api/menu/[truckId]/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'")
    const tables = { trucks: [{ ...TRUCK(), paused: false, show_on_vf: true, show_on_hg: true, mode: 'village', time_selection_enabled: true }], country_settings: [GBROW, USROW],
      menu_categories: [{ id: 'c1', truck_id: 'test-truck', name: 'Pizzas', sort_order: 1, active: true, is_active: true }],
      menu_items_db: [{ id: 'i-marg', truck_id: 'test-truck', name: 'Margherita', price: 12, category_id: 'c1', is_active: true, is_available: true, sort_order: 1, allergens_verified: true }],
      menu_item_costs: [{ id: 1, truck_id: 'test-truck', item_id: 'i-marg', cost_minor: 23571, currency: 'GBP', effective_from: '2026-10-01' }],
      bundles_db: [], upsell_rules: [], discount_codes_db: [], modifier_groups: [], modifier_options: [], item_modifier_groups: [], truck_events: [], event_deals: [], truck_vans: [],
      operators: [{ id: 'op-test', charges_enabled: false }], ...require('./_lp1c-fixtures.cjs').planTables() }
    globalThis.__harnessDb = kit.fakeDb(tables); M.clearCountrySettingsCache()
    let body
    try { const res = await kit.quietAsync(() => M.GET(new NextRequest('http://127.0.0.1:3999/api/menu/test-kitchen'), { params: Promise.resolve({ truckId: 'test-kitchen' }) })); body = await res.json() } finally { delete globalThis.__harnessDb }
    const js = JSON.stringify(body)
    t('the public menu API with a cost row in the database: the dish is there, its cost is not (no 235.71, no cost key)', js.includes('Margherita') && !/235\.71|23571|cost_minor|costMinor|"cost"/i.test(js), js.slice(0, 300))
    const T = await kit.bundle('ca1-ticket', "export { mapOrderToTicket } from '@/lib/printing/mapOrderToTicket'")
    t('the ticket mapper has no cost field to fill', !/cost/i.test(read('lib/printing/mapOrderToTicket.ts')) && typeof T.mapOrderToTicket === 'function')
    t('Reports and the item editor are owner/manager: the editor field only with canSeeCosts (userRole !== staff)', /canSeeCosts=\{userRole !== 'staff'\}/.test(read('app/(app)/manage/[token]/page.tsx')) && /\{canSeeCosts && \(\n\s+<div data-cost-to-make>/.test(read('app/(app)/manage/[token]/page.tsx')))
  }

  // ── 10 · Gusto's order paths ──────────────────────────────────────────────────────────────────────────────────────────
  head('10 · Pizzeria Gusto\'s order paths byte-identical to the tree before this work')
  {
    const PATHS = ['app/api/orders', 'app/api/menu', 'app/api/dashboard', 'app/api/kds', 'app/api/webhooks', 'app/(app)/order', 'app/(app)/o', 'app/(app)/kds', 'app/(app)/dashboard', 'app/(app)/trucks', 'app/embed', 'components/dashboard', 'components/embed', 'lib/payments', 'lib/printing', 'lib/orders',
      'lib/order-charges.ts', 'lib/order-charge-rules.ts', 'lib/order-charge-lines.ts', 'lib/order-calculations.ts', 'lib/order-utils.ts', 'lib/order-repricing.ts', 'lib/menu-loader.ts', 'lib/slot-bookings.ts', 'lib/country-settings.ts', 'lib/country-settings-types.ts', 'lib/money-format.ts', 'supabase/functions']
      .filter(p => fs.existsSync(path.join(REPO, p)))
    // ⚠️ RE-PINNED (perf-1, 5 November 2026, docs/perf-1-report.md): lib/country-settings.ts gained perf-1's marketing branch (a
    // marketing page's render reads the tagged cache; every other caller, ordering included, reads exactly as before). It is compared on
    // its own below, with exactly perf-1's four lines taken out; every other path must still be unchanged.
    const PERF1_CS = 'lib/country-settings.ts'
    const PATHS_REST = PATHS.filter(p => p !== PERF1_CS)
    let diff = ''
    // ⚠️ RE-PINNED (cwv-2, 6 November 2026, docs/cwv-2-report.md §6): the routes moved into app/(app) and app/(public); `git diff` saw every moved file as deleted and added. scripts/_moved-paths.cjs changedSince compares each file with itself at that commit, under its name then — blind to the move and nothing else.
    // ⚠️ RE-PINNED (demo-claim-2, 9 November 2026, docs/demo-claim-2-report.md §8): demo-claim-2 edited the dashboard and the KDS (the review
    // hand-off to Manage; the demo slug for the signup_started count). Each of those two passes when it was still BEFORE's file (the move
    // aside) in 64ac2eb7 — the tree demo-claim-2 started from — so every other path is still compared with the working tree as before.
    const DC2_FILES = ['app/(app)/dashboard/[token]/page.tsx', 'app/(app)/dashboard/[token]/kds/page.tsx']
    const showAt = (rev, f) => { try { return execFileSync('git', ['show', `${rev}:${f}`], { cwd: REPO, maxBuffer: 256e6, stdio: ['ignore', 'pipe', 'ignore'] }).toString() || null } catch { return null } }
    const MPd = require('./_moved-paths.cjs')
    const notDc2 = f => {
      if (!DC2_FILES.includes(f)) return true
      let then = showAt(BEFORE, MPd.beforePath(f)) || showAt(BEFORE, f)
      if (then) for (const [a, b] of MPd.MOVE_EDITS[f] || []) then = then.split(a).join(b)
      return !then || showAt('64ac2eb7', f) !== then
    }
    try { diff = require('./_moved-paths.cjs').changedSince(BEFORE, PATHS_REST, { cwv2: true }).filter(notDc2).join('\n') } catch (e) { diff = String(e) }
    const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--', ...PATHS_REST], { cwd: REPO, encoding: 'utf8' }).trim()
    t(`${PATHS.length} order, payment, menu, KDS, dashboard and ticket paths: no change against ${BEFORE} (working tree)`, PATHS.length >= 20 && diff.trim() === '' && untracked === '', diff + untracked)
    const PERF1_LINES = [
      "import { isMarketingRender } from '@/lib/marketing-render'   // perf-1: a marketing page's render reads the tagged shared cache",
      "  // perf-1 (5 November 2026): a marketing page's render reads the tagged shared cache (lib/marketing-cache.ts); every other caller,",
      "  // the proxy included, keeps the 60-second copy below exactly as before.",
      "  if (isMarketingRender()) return (await import('@/lib/marketing-cache')).marketingCountryList()",
    ]
    const csNow = read(PERF1_CS).split('\n'), taken = csNow.filter(l => PERF1_LINES.includes(l))
    t(`${PERF1_CS}: byte-identical to ${BEFORE} once perf-1's four lines (its marketing branch) are taken out`, taken.length === 4 && csNow.filter(l => !PERF1_LINES.includes(l)).join('\n') === gitShow(PERF1_CS))
    const block = s => s.slice(s.indexOf("  if (action === 'upsert_item') {"), s.indexOf("  if (action === 'delete_item') {"))
    t('the upsert_item handler is byte-identical (the cost never rides on the item)', block(read('app/api/manage/route.ts')) === block(gitShow('app/api/manage/route.ts')) && block(read('app/api/manage/route.ts')).length > 1000)
  }

  // ── 11 · the words ────────────────────────────────────────────────────────────────────────────────────────────────────
  head('11 · the words — en-GB, the English variants, every language base, translation-check')
  {
    const en = JSON.parse(read('messages/en-GB.json'))
    const KEYS = []
    const flat = (o, p) => { for (const [k, v] of Object.entries(o)) { if (v && typeof v === 'object') flat(v, `${p}.${k}`); else KEYS.push(`${p}.${k}`) } }
    flat(en.manageReports.presets, 'manageReports.presets'); flat(en.manageReports.accounts, 'manageReports.accounts'); flat(en.manageReports.accountsCsv, 'manageReports.accountsCsv')
    KEYS.push('manageMenu.item.costToMake', 'manageMenu.item.costHelp', 'errorsManage.cost_invalid')
    t('the help text is the brief\'s, word for word', en.manageMenu.item.costToMake === 'Cost to make' && en.manageMenu.item.costHelp === 'Optional. What one portion costs you in ingredients and packaging. Used only in your reports; customers never see it.')
    const BASES = read('lib/i18n/locales.ts').match(/export const LANGUAGE_BASES[^=]*= \[([^\]]*)\]/)[1].match(/'([a-z]{2}-[A-Z]{2})'/g).map(s => s.slice(1, -1))
    const get = (o, k) => k.split('.').reduce((x, p) => (x == null ? undefined : x[p]), o)
    const missing = BASES.map(l => [l, KEYS.filter(k => get(JSON.parse(read(`messages/${l}.json`)), k) == null)]).filter(([, m]) => m.length)
    // ⚠️ RE-PINNED (languages-world-1, 10 November 2026): the bases are lib/i18n/locales.ts's live LANGUAGE_BASES (36 then, more may
    // follow), never a typed count — at least the 28 this was written for, every one of them checked.
    t(`every new string (${KEYS.length}) in en-GB and all ${BASES.length} bases`, BASES.length >= 28 && KEYS.length === 55 && !missing.length, missing.map(([l, m]) => `${l}: ${m.length} missing`))
    const structural = []
    for (const l of BASES) {
      let out = ''
      try { out = execFileSync('node', ['scripts/translation-check.cjs', '--locale', l], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) } catch (e) { out = String(e.stdout || '') }
      const m = /Structural: (\d+)/.exec(out); if (!m || m[1] !== '0') structural.push(`${l}: ${m ? m[1] : '?'}`)
    }
    t(`translation-check: structural 0 in all ${BASES.length}`, !structural.length, structural)
    t('every back-translation written (docs/i18n/back)', BASES.every(l => { const b = JSON.parse(read(`docs/i18n/back/${l}.json`)); return KEYS.every(k => b[k] != null) }), BASES.filter(l => { const b = JSON.parse(read(`docs/i18n/back/${l}.json`)); return !KEYS.every(k => b[k] != null) }))
    const pay = l => get(JSON.parse(read(`messages/${l}.json`)), 'manageReports.accounts.payAtTruck')
    t('en-GB "Pay at Hatch"; en-US, en-IE, en-AU, en-NZ and en-SG "Pay at the truck" (35.ak-5)', pay('en-GB') === 'Pay at Hatch' && ['en-US', 'en-IE', 'en-AU', 'en-NZ', 'en-SG'].every(l => pay(l) === 'Pay at the truck'))
    t('each base says it the way its own "Pay at …" price word does', BASES.every(l => { const m = JSON.parse(read(`messages/${l}.json`)); return pay(l) === m.planFeatures.priceWord.payAtHatch }), BASES.filter(l => pay(l) !== JSON.parse(read(`messages/${l}.json`)).planFeatures.priceWord.payAtHatch))
    const gen = read('messages/ns/en-GB/manageReports.json')
    t('the generated catalogue carries the words (split-messages ran)', JSON.parse(gen).accounts?.title === 'For your accountant' && JSON.parse(read('messages/ns/en-GB/manageMenu.json')).item?.costToMake === 'Cost to make')
  }

  console.log(`\ncosts-accounts-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
