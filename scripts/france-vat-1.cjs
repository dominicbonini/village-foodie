#!/usr/bin/env node
// scripts/france-vat-1.cjs — france-vat-1 (24 November 2026, docs/france-vat-1-report.md): a VAT rate per item, the tax per rate
// on receipts and in the accountant's file, rates up to 30 % everywhere, and the server refusing to edit or cancel a finished order.
//   node scripts/france-vat-1.cjs        (NO NETWORK, NO DATABASE)
//
// What it proves, in order:
//   A · BYTE-IDENTICAL for every single-rate order: the engine's figures, the snapshot, the customer and new-order emails (HTML and
//       text), the 58 and 80 mm ticket BYTES, the charge lines, and both accountant CSVs, between the tree BEFORE this work (BASE,
//       extracted from git, never HEAD) and this tree — GB with no rate set, France at 10 % and at the truck's 5,5 %, a dish set
//       explicitly to the default, the US with tax added (tip, service fee, taxed fees), the US with no rate, Japan in yen; walk-up,
//       pay at the truck and card; an edit and the pay-at-the-truck switch; GB's rules unchanged with no rate set.
//   B · MIXED RATES (France): crêpe 8,50 € at 10 %, canned drink 2,50 € at 5,5 %, cider 4,00 € at 20 % — with and without a 10 % code;
//       a mixed deal split by à-la-carte prices; the deal fallback; largest remainder; rates stamped from the server's book (a
//       browser-sent rate overwritten); an edit keeps each line's rate; the pay-at-the-truck switch keeps the split; a card draft
//       carries it to its order; email, ticket, ledger and the Orders CSV agree to the cent; the US added on top per rate.
//   C · THE LOCK: the real /api/dashboard/action route refuses `edit` and `cancel` on collected, cancelled and rejected orders
//       (409, errorsKitchen.order_finished_*), and lets a ready order through to its own checks.
//   D · THE MIGRATION: additive, the same function signature, the body = the live 20261010_18 body + tax_breakdown only, a JSON null
//       stored as SQL NULL; no protected-table write.
//   E · MANAGE › PAYMENTS: the card in GB (No VAT, the hint, quick rates), France (the box as before + Item rates) and the US; the
//       popup grouped by category with Set all, Default (x), the quick rates and Other…; the 0–30 % limit; set_item_rates' rules.
//   F · THE WORDS: the 24 new en-GB strings, and in every language base an enabled country uses.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
require('./_disk-guard.cjs').guard(__filename)
require('./_harness-tmp.cjs') // temp goes under $TMPDIR/hatchgrab-harness/ and is removed on exit ("Disk space")
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'france-vat-1' })
const { REPO } = kit
const FF = require('./_france-1-fixtures.cjs')
const LP1E = require('./_lp1e-fixtures.cjs')
const { makeFakePg } = require('./_fake-pg.cjs')

/* 🔴 THE TREE BEFORE THIS WORK, PINNED BY SHA (never HEAD): 59ae6161 is enquiries-backend-1's report, the commit france-vat-1
 * branched from. */
const BASE = '59ae6161'

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 1200) : JSON.stringify(detail).slice(0, 1200)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const NB = /[  ]/g
const flat = s => String(s).replace(NB, ' ')
const J = v => JSON.stringify(v)
const omit = (o, ...ks) => { const c = { ...o }; for (const k of ks) delete c[k]; return c }

/* ── A bundle from ANY tree: the same stubs the render kit uses for these modules (server-only, the database, next/*). ── */
const STUB = {
  'server-only': '',
  // CommonJS, so every named import resolves to the same proxy — which throws the moment anything touches it.
  db: 'module.exports = new Proxy(function () {}, { get(_, k) { if (k === "__esModule") return false; throw new Error("no database in this harness") }, apply() { throw new Error("no database in this harness") } })',
  nav: 'export function useRouter() { return { push() {}, replace() {}, refresh() {} } }\nexport function useSearchParams() { return new URLSearchParams("") }\nexport function usePathname() { return "/" }\nexport function redirect() {}\nexport function notFound() {}',
  headers: 'export async function cookies() { return { get() { return undefined }, getAll() { return [] }, set() {} } }\nexport async function headers() { return new Map() }',
}
let bundleN = 0
async function bundleFrom(root, tag, entry) {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const res = await esbuild.build({
    stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', target: 'node20',
    logLevel: 'silent', alias: { '@': root }, loader: { '.css': 'empty', '.svg': 'text', '.png': 'empty', '.jpg': 'empty' },
    external: ['react', 'react-dom', 'react/jsx-runtime', 'next', 'next/*'],
    define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'fv1-stubs', setup(b) {
      b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'fv1' }))
      b.onResolve({ filter: /(^@\/|\/)lib\/supabase(\.ts)?$|^@supabase\/supabase-js$/ }, () => ({ path: 'db', namespace: 'fv1' }))
      b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'nav', namespace: 'fv1' }))
      b.onResolve({ filter: /^next\/headers$/ }, () => ({ path: 'headers', namespace: 'fv1' }))
      b.onLoad({ filter: /.*/, namespace: 'fv1' }, a => ({ contents: STUB[a.path] ?? '', loader: 'js' }))
    } }],
  })
  const dir = path.join(REPO, 'node_modules/.cache/france-vat-1-trees'); fs.mkdirSync(dir, { recursive: true })   // beside node_modules, so `react` resolves
  const out = path.join(dir, `${tag}-${bundleN++}.cjs`)
  fs.writeFileSync(out, res.outputFiles[0].text)
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:9'
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:9'
  return kit.quiet(() => require(out))
}
/** BASE's tree: the three folders these modules import from, out of git, with the repo's node_modules beside them. */
function extractBase() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fv1-base-'))
  const tar = execFileSync('git', ['archive', '--format=tar', BASE, 'lib', 'components', 'messages'], { cwd: REPO, maxBuffer: 1e9 })
  execFileSync('tar', ['-x', '-C', dir], { input: tar, maxBuffer: 1e9 })
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'))
  return dir
}

const ENTRY = [
  "export * as E from '@/lib/order-charges'",
  "export * as L from '@/lib/order-charge-lines'",
  "export * as RU from '@/lib/order-charge-rules'",
  "export * as Mail from '@/lib/email'",
  "export * as T from '@/lib/printing/ticket'",
  "export { mapOrderToTicket } from '@/lib/printing/mapOrderToTicket'",
  "export * as LG from '@/lib/accounts/ledger'",
  "export * as CSV from '@/lib/accounts/csv'",
  "export * as OC from '@/lib/order-calculations'",
].join('\n')

;(async () => {
  kit.setNow('2026-11-24T12:00:00.000Z'); kit.setDeviceTz('Europe/London')
  const baseDir = extractBase()
  const B = await bundleFrom(baseDir, 'base', ENTRY)
  const H = await bundleFrom(REPO, 'head', ENTRY + "\nexport * as X from '@/lib/order-tax'\nexport * as IR from '@/lib/item-rates'\nexport * as CS from '@/lib/charge-settings'")
  const X = H.X

  // ── the fixtures ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const R = FF.renderer(kit, 'fv1'), ROWS = FF.ROWS.frOn()
  const FR = await R.rowOf(ROWS, 'FR'), GB = await R.rowOf(ROWS, 'GB'), US = await R.rowOf(ROWS, 'US'), IE = await R.rowOf(ROWS, 'IE')
  const RULES = {
    GB_NONE: { taxInclusive: true, taxLabel: 'VAT', taxRateMilli: null, feesTaxed: false, serviceFee: null, tipping: null, surcharge: null, cardFeePayer: 'truck', platformFee: null },
    FR_10: { taxInclusive: true, taxLabel: 'TVA', taxRateMilli: 10000, feesTaxed: false, serviceFee: null, tipping: null, surcharge: null, cardFeePayer: 'truck', platformFee: null },
    FR_55: { taxInclusive: true, taxLabel: 'TVA', taxRateMilli: 5500, feesTaxed: false, serviceFee: null, tipping: null, surcharge: null, cardFeePayer: 'truck', platformFee: null },
    US_825: { taxInclusive: false, taxLabel: 'Sales tax', taxRateMilli: 8250, feesTaxed: false, serviceFee: { recipient: 'truck', bps: 300, fixedMinor: 25 }, tipping: { presetsBps: [1500, 1800, 2000] }, surcharge: null, cardFeePayer: 'truck', platformFee: null },
    US_825_FEES_TAXED: { taxInclusive: false, taxLabel: 'Sales tax', taxRateMilli: 8250, feesTaxed: true, serviceFee: { recipient: 'truck', bps: 300, fixedMinor: 25 }, tipping: { presetsBps: [1500] }, surcharge: null, cardFeePayer: 'truck', platformFee: null },
    US_NONE: { taxInclusive: false, taxLabel: 'Sales tax', taxRateMilli: null, feesTaxed: false, serviceFee: null, tipping: { presetsBps: [1500] }, surcharge: null, cardFeePayer: 'truck', platformFee: null },
    JP_8: { taxInclusive: true, taxLabel: '消費税', taxRateMilli: 8000, feesTaxed: false, serviceFee: null, tipping: null, surcharge: null, cardFeePayer: 'truck', platformFee: null, roundDown: true },
  }
  const CUR = { GB_NONE: ['GBP', 'en-GB', 'Europe/London', 'GB'], FR_10: ['EUR', 'fr-FR', 'Europe/Paris', 'FR'], FR_55: ['EUR', 'fr-FR', 'Europe/Paris', 'FR'],
    US_825: ['USD', 'en-US', 'America/New_York', 'US'], US_825_FEES_TAXED: ['USD', 'en-US', 'America/New_York', 'US'], US_NONE: ['USD', 'en-US', 'America/New_York', 'US'], JP_8: ['JPY', 'ja-JP', 'Asia/Tokyo', 'JP'] }
  const MENU2 = [{ id: 'm1', name: 'Margherita', price: 9.5 }, { id: 'm2', name: 'Fries', price: 3 }, { id: 'm3', name: 'Cola', price: 2.5 }, { id: 'm4', name: 'Cider', price: 4 }]
  const MENU0 = [{ id: 'm1', name: 'Margherita', price: 950 }, { id: 'm2', name: 'Fries', price: 300 }, { id: 'm3', name: 'Cola', price: 250 }, { id: 'm4', name: 'Cider', price: 400 }]
  const basketOf = cur => {
    const k = cur === 'JPY' ? 100 : 1
    return {
      items: [
        { name: 'Margherita', quantity: 2, unit_price: 10.75 * k, modifiers: [{ name: 'Extra cheese', price: 1.25 * k }], specialInstructions: '' },
        { name: 'Fries', quantity: 1, unit_price: 3 * k, modifiers: [], specialInstructions: 'No salt' },
      ],
      deals: [{ name: 'Meal deal', price: 11 * k, slots: { main: 'Margherita', drink: 'Cola' }, slotModifiers: { main: [{ name: 'Olives', price: 0.5 * k }] }, slotNotes: {} }],
    }
  }
  const CODE = { code: 'TEN', type: 'pct', value: 10 }
  const foodOf = (O, basket, cur, code) => {
    const calc = O.OC.calculateOrderTotal(basket.items.map(i => ({ name: i.name, price: i.unit_price, quantity: i.quantity })),
      basket.deals.map(d => ({ bundle: { name: d.name, bundle_price: d.price, original_price: null }, slots: d.slots, modifierExtra: Object.values(d.slotModifiers).flat().reduce((s, m) => s + m.price, 0) })),
      cur === 'JPY' ? MENU0 : MENU2, code)
    return { calc, foodMinor: Math.round(calc.total * (cur === 'JPY' ? 1 : 100)) }
  }
  const TIME = (tz, locale) => ({ timeZone: tz, locale, timeFormat: locale === 'en-US' ? '12h' : '24h', dateOrder: locale === 'en-US' ? 'mdy' : 'dmy', weekStart: 'monday' })
  const emailParams = (sc, snapshot, items, deals, total, calc) => {
    const [cur, loc, tz, cc] = CUR[sc]
    return { orderId: '41', orderKey: 'ok-1', truckName: 'Pizza Kitchen', customerName: 'Sam', slot: '12:30', items, deals, discountAmt: calc.discountAmt,
      notes: 'Ring the bell', autoAccepted: true, phoneCountry: cc, money: { currency: cur, locale: loc }, time: TIME(tz, loc), total, charges: snapshot,
      venueName: 'The Green', venueTown: 'Testville', contactPhone: '01234 567890', baseUrl: 'https://www.hatchgrab.com', truckSlug: 'pizza-kitchen' }
  }
  const newOrderParams = (sc, snapshot, items, deals, total) => {
    const [cur, loc, tz] = CUR[sc]
    return { orderId: '41', customerName: 'Sam', customerPhone: '07700 900123', slot: '12:30', items, deals, total, charges: snapshot, notes: 'Ring the bell',
      venueName: 'The Green', venueTown: 'Testville', autoAccepted: true, money: { currency: cur, locale: loc }, time: TIME(tz, loc) }
  }
  const rowOf = (sc, snapshot, items, deals, total, extra = {}) => {
    const [cur, , , cc] = CUR[sc]
    return { id: '41', order_key: 'ok-1', customer_name: 'Sam', customer_phone: '07700 900123', customer_email: 'sam@example.test', slot: '12:30', buzzer_number: null,
      items, deals, notes: 'Ring the bell', total, total_minor: Math.round(total * (cur === 'JPY' ? 1 : 100)), currency: cur, country: cc, status: 'confirmed',
      created_at: '2026-11-24T11:01:00.000Z', event_date: '2026-11-24', event_id: 'ev-1', ...snapshot, ...extra }
  }
  const ticketHex = (O, sc, row) => {
    const [cur, loc, tz, cc] = CUR[sc]
    const tk = O.mapOrderToTicket({ order: row, truck: { name: 'Pizza Kitchen', money: { currency: cur, locale: loc, localeByCountry: { [cc]: loc } }, time: TIME(tz, loc) }, event: null, ledgerRows: [], printedLabel: '12:01' })
    return [58, 80].map(w => Buffer.from(O.T.renderTicket(tk, { paper_width: w })).toString('hex'))
  }
  const csvWordsFor = (withRates) => ({
    header: k => `H:${k}`, channel: c => `C:${c}`, payment: p => `P:${p}`, taxBasis: b => `B:${b}`, event: () => 'The Green, Testville',
    ...(withRates ? { rateHeader: (k, r) => `${k}@${r === null ? 'none' : r}` } : {}),
  })
  const csvs = (O, sc, rows, withRates) => {
    const [cur, , tz] = CUR[sc]
    const rule = { inclusive: RULES[sc].taxInclusive, rateMilli: RULES[sc].taxRateMilli }
    const acc = O.LG.accountRows({ orders: rows, payments: [{ order_key: 'ok-1', kind: 'charge', channel: 'online', amount_minor: rows[0].total_minor, state: 'succeeded' }], costs: [], itemIdByName: {}, tax: rule, timeZone: tz, currency: cur })
    return { rows: acc.map(r => omit(r, 'rates')), orders: O.CSV.ordersCsv(acc, csvWordsFor(withRates)), events: O.CSV.eventsCsv(O.LG.summarise(acc).events, cur, csvWordsFor(withRates)) }
  }
  /** One scenario through BASE and HEAD. `explicitDefault`: every dish set explicitly to the truck's default rate (still one rate). */
  const capture = (O, sc, channel, { head: isHead, code = null, tip = null, explicitDefault = false } = {}) => {
    const [cur, loc] = CUR[sc]
    const basket = basketOf(cur)
    const { calc, foodMinor } = foodOf(O, basket, cur, code)
    const rules = RULES[sc]
    let items = basket.items, deals = basket.deals, parts = undefined
    if (isHead) {
      const book = X.taxBookFrom((cur === 'JPY' ? MENU0 : MENU2).map(m => ({ ...m, tax_rate_milli: explicitDefault ? rules.taxRateMilli : null })), cur)
      const lt = X.lineTax({ items, deals, foodMinor, book, defaultRate: rules.taxRateMilli, currency: cur })
      items = X.stampItems(items, lt.itemStamps); deals = X.stampDeals(deals, lt.dealStamps); parts = lt.parts
    }
    const ch = O.E.computeOrderCharges({ foodMinor, rules, channel, tip, ...(parts ? { foodParts: parts } : {}) })
    const total = ch.totalMinor / (cur === 'JPY' ? 1 : 100)
    const row = rowOf(sc, ch.snapshot, items, deals, total)
    const conf = O.Mail.formatConfirmationEmail(emailParams(sc, ch.snapshot, items, deals, total, calc))
    const neworder = O.Mail.formatNewOrderEmail(newOrderParams(sc, ch.snapshot, items, deals, total))
    // An edit: one Fries more (food + 3 / + 300), the order's own rules; and the pay-at-the-truck switch.
    const editFood = foodMinor + (cur === 'JPY' ? 300 : 300)
    let editParts = undefined
    if (isHead) {
      const editItems = [...items.map(i => ({ ...i })), { name: 'Fries', quantity: 1, unit_price: cur === 'JPY' ? 300 : 3, modifiers: [] }]
      const book = X.taxBookFrom((cur === 'JPY' ? MENU0 : MENU2).map(m => ({ ...m, tax_rate_milli: explicitDefault ? rules.taxRateMilli : null })), cur)
      editParts = X.lineTax({ items: editItems, deals, foodMinor: editFood, book, defaultRate: O.E.rulesForStoredOrder(rules, row).taxRateMilli, currency: cur, stored: { items, deals } }).parts
    }
    const edit = O.E.chargesForEdit(editFood, rules, row, editParts)
    const hatch = O.E.chargesForHatchSwitch(row)
    const lineL = O.L.includedTaxLines ? O.L.includedTaxLines(ch.snapshot, loc) : [O.L.includedTaxLine(ch.snapshot, loc)].filter(Boolean)
    return {
      charges: omit(ch, 'snapshot'), snapshot: omit(ch.snapshot, 'tax_breakdown'),
      edit: { ...omit(edit, 'snapshot'), snapshot: omit(edit.snapshot, 'tax_breakdown') },
      hatch: hatch ? { ...omit(hatch, 'snapshot'), snapshot: omit(hatch.snapshot, 'tax_breakdown') } : null,
      lines: { customer: O.L.chargeLinesFor(ch.snapshot, 'customer', loc), kitchen: O.L.chargeLinesFor(ch.snapshot, 'kitchen', loc), included: lineL },
      conf, neworder, ticket: ticketHex(O, sc, row), csv: csvs(O, sc, [row], isHead),
    }
  }

  // ══ A ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head(`A · BYTE-IDENTICAL for every single-rate order — BASE ${BASE} vs this tree`)
  const CASES = []
  for (const sc of ['GB_NONE', 'FR_10', 'FR_55', 'US_NONE', 'JP_8']) for (const ch of ['walk_up', 'online_pay_at_truck', 'online_card']) CASES.push({ sc, ch })
  CASES.push({ sc: 'US_825', ch: 'walk_up' }, { sc: 'US_825', ch: 'online_pay_at_truck' }, { sc: 'US_825', ch: 'online_card', tip: { kind: 'percent', bps: 1500 } },
    { sc: 'US_825', ch: 'online_card', tip: { kind: 'amount', minor: 333 } }, { sc: 'US_825_FEES_TAXED', ch: 'online_card', tip: { kind: 'percent', bps: 1500 } })
  for (const c of [...CASES]) CASES.push({ ...c, code: CODE })
  CASES.push({ sc: 'FR_10', ch: 'online_pay_at_truck', explicit: true }, { sc: 'GB_NONE', ch: 'walk_up', explicit: true }, { sc: 'US_825', ch: 'online_card', tip: { kind: 'percent', bps: 1500 }, explicit: true })
  const parts = ['charges', 'snapshot', 'edit', 'hatch', 'lines', 'conf', 'neworder', 'ticket', 'csv']
  const bad = []
  for (const c of CASES) {
    const b = capture(B, c.sc, c.ch, { code: c.code ?? null, tip: c.tip ?? null })
    const h = capture(H, c.sc, c.ch, { head: true, code: c.code ?? null, tip: c.tip ?? null, explicitDefault: !!c.explicit })
    for (const p of parts) if (J(b[p]) !== J(h[p])) bad.push({ case: `${c.sc}|${c.ch}${c.code ? '|code' : ''}${c.tip ? '|tip' : ''}${c.explicit ? '|explicit' : ''}`, part: p, base: J(b[p]).slice(0, 300), head: J(h[p]).slice(0, 300) })
  }
  {
    // 🔴 THE COMPARISON CAN FAIL: the same order with ONE dish at its own rate differs from BASE in the snapshot, the email and the ticket.
    const b = capture(B, 'FR_10', 'online_pay_at_truck', {})
    const saved = MENU2[2].tax_rate_milli; MENU2[2].tax_rate_milli = 5500
    const hx = (() => { const [cur] = CUR.FR_10; const basket = basketOf(cur); const { foodMinor } = foodOf(H, basket, cur, null)
      const book = X.taxBookFrom(MENU2, cur); const lt2 = X.lineTax({ items: basket.items, deals: basket.deals, foodMinor, book, defaultRate: 10000, currency: cur })
      return H.L.includedTaxLines(H.E.computeOrderCharges({ foodMinor, rules: RULES.FR_10, channel: 'online_pay_at_truck', foodParts: lt2.parts }).snapshot, 'fr-FR') })()
    MENU2[2].tax_rate_milli = saved
    t('the comparison is live: the same order with its deal\'s cola at 5,5 % gives two « Dont TVA » lines where BASE gives one', b.lines.included.length === 1 && hx.length === 2, { base: b.lines.included, head: hx })
  }
  t(`${CASES.length} single-rate orders × ${parts.length} outputs (figures, snapshot, edit, pay-at-truck switch, charge lines, customer email HTML+text, new-order email, ticket bytes 58+80 mm, both accountant CSVs): byte-identical`, bad.length === 0, bad.slice(0, 3))
  {
    const gbBase = B.RU.resolveChargeRules(GB, { country: 'GB', tax_rate_milli: null }), gbHead = H.RU.resolveChargeRules(GB, { country: 'GB', tax_rate_milli: null })
    const ieBase = B.RU.resolveChargeRules(IE, { country: 'IE' }), ieHead = H.RU.resolveChargeRules(IE, { country: 'IE' })
    const frBase = B.RU.resolveChargeRules(FR, { country: 'FR' }), frHead = H.RU.resolveChargeRules(FR, { country: 'FR' })
    const usBase = B.RU.resolveChargeRules(US, { country: 'US', tax_rate_milli: 8875 }), usHead = H.RU.resolveChargeRules(US, { country: 'US', tax_rate_milli: 8875 })
    t('GB (no rate set — every existing UK truck), IE, France and a US truck resolve to exactly the same rules as before', J(gbBase) === J(gbHead) && J(ieBase) === J(ieHead) && J(frBase) === J(frHead) && J(usBase) === J(usHead), { gbBase, gbHead })
    const gbSnap = capture(H, 'GB_NONE', 'walk_up', { head: true })
    t('a GB order with no rate stores NO breakdown (so its accountant row says "no tax rate set", as before) and no "Includes" line', H.E.computeOrderCharges({ foodMinor: 2400, rules: RULES.GB_NONE, channel: 'walk_up' }).snapshot.tax_breakdown === null && gbSnap.lines.included.length === 0 && !/Includes/.test(gbSnap.conf.html + gbSnap.conf.text))
    const fr = H.E.computeOrderCharges({ foodMinor: 2400, rules: RULES.FR_10, channel: 'walk_up' }).snapshot
    t('a French single-rate order stores its one-row breakdown [{10 %, 24,00 €, tax 2,18 €}]', J(fr.tax_breakdown) === J([{ rate_milli: 10000, food_minor: 2400, gross_minor: 2400, net_minor: 2182, tax_minor: 218 }]), fr.tax_breakdown)
  }

  // ══ B ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('B · MIXED RATES — France: crêpe 8,50 € at 10 %, canned drink 2,50 € at 5,5 %, cider 4,00 € at 20 %')
  const FRMENU = [{ id: 'c1', name: 'Crêpe', price: 8.5, tax_rate_milli: null }, { id: 'c2', name: 'Canette', price: 2.5, tax_rate_milli: 5500 }, { id: 'c3', name: 'Cidre', price: 4, tax_rate_milli: 20000 }, { id: 'c4', name: 'Galette', price: 9, tax_rate_milli: 10000 }]
  const book = X.taxBookFrom(FRMENU, 'EUR')
  const lines = [{ name: 'Crêpe', quantity: 1, unit_price: 8.5 }, { name: 'Canette', quantity: 1, unit_price: 2.5, tax_rate_milli: 0, item_id: 'evil' }, { name: 'Cidre', quantity: 1, unit_price: 4 }]
  const lt = X.lineTax({ items: lines, deals: [], foodMinor: 1500, book, defaultRate: 10000, currency: 'EUR' })
  t('the parts: 5,5 % 2,50 € · 10 % 8,50 € · 20 % 4,00 € (ascending, adding up to 15,00 €)', J(lt.parts) === J([{ rate: 5500, minor: 250 }, { rate: 10000, minor: 850 }, { rate: 20000, minor: 400 }]), lt.parts)
  t('each line stamped from the SERVER\'s book: the crêpe its default 10 % (it has no rate), the can 5,5 % and its id — the browser\'s "0 %" and "evil" id overwritten',
    J(lt.itemStamps) === J([{ item_id: 'c1', tax_rate_milli: 10000 }, { item_id: 'c2', tax_rate_milli: 5500 }, { item_id: 'c3', tax_rate_milli: 20000 }]), lt.itemStamps)
  const mix = H.E.computeOrderCharges({ foodMinor: 1500, rules: RULES.FR_10, channel: 'online_pay_at_truck', foodParts: lt.parts })
  t('the breakdown: 5,5 % tax 0,13 € · 10 % 0,77 € · 20 % 0,67 € (each rounded once on its own total); nothing added: total 15,00 €; tax_rate_milli = the default (lines are mixed)',
    J(mix.snapshot.tax_breakdown.map(r => [r.rate_milli, r.food_minor, r.tax_minor, r.net_minor])) === J([[5500, 250, 13, 237], [10000, 850, 77, 773], [20000, 400, 67, 333]])
    && mix.totalMinor === 1500 && mix.taxMinor === 0 && mix.snapshot.tax_rate_milli === 10000, mix.snapshot)
  const inc = H.L.includedTaxLines(mix.snapshot, 'fr-FR')
  t('the receipt lines, ascending: « Dont TVA 5,5 % » 0,13 € · « Dont TVA 10 % » 0,77 € · « Dont TVA 20 % » 0,67 €', J(inc.map(l => [l.label, flat(l.rate), l.minor])) === J([['Dont TVA', '5,5 %', 13], ['Dont TVA', '10 %', 77], ['Dont TVA', '20 %', 67]]), inc)
  // the 10 % code: food 13,50 €
  const ltc = X.lineTax({ items: lines, deals: [], foodMinor: 1350, book, defaultRate: 10000, currency: 'EUR' })
  const mixc = H.E.computeOrderCharges({ foodMinor: 1350, rules: RULES.FR_10, channel: 'walk_up', foodParts: ltc.parts })
  t('with a 10 % code (13,50 €): the discount spread 0,25 / 0,85 / 0,40 → 2,25 / 7,65 / 3,60; tax 0,12 / 0,70 / 0,60 (total 1,42 €)',
    J(mixc.snapshot.tax_breakdown.map(r => [r.rate_milli, r.food_minor, r.tax_minor])) === J([[5500, 225, 12], [10000, 765, 70], [20000, 360, 60]]), mixc.snapshot.tax_breakdown)
  // email and ticket
  const EUR = { currency: 'EUR', locale: 'fr-FR' }, FRT = TIME('Europe/Paris', 'fr-FR')
  const items = X.stampItems(lines, lt.itemStamps)
  const conf = H.Mail.formatConfirmationEmail({ orderId: '7', orderKey: 'ok-7', truckName: 'Crêperie', customerName: 'Léa', slot: '12:30', items, deals: [], discountAmt: 0, notes: null, autoAccepted: true, phoneCountry: 'FR', money: EUR, time: FRT, total: 15, charges: mix.snapshot })
  const txt = flat(conf.text)
  const iT = txt.indexOf('Total'), i1 = txt.indexOf('Dont TVA 5,5 % : 0,13 €'), i2 = txt.indexOf('Dont TVA 10 % : 0,77 €'), i3 = txt.indexOf('Dont TVA 20 % : 0,67 €')
  t('the customer email (text): the three lines after the total, in rate order', iT >= 0 && i1 > iT && i2 > i1 && i3 > i2, txt.slice(0, 800))
  const htmlRows = (conf.html.match(/Dont TVA[^<]*<\/td>/g) || []).map(flat)
  t('…and its HTML: three rows, 5,5 % · 10 % · 20 %', htmlRows.length === 3 && /5,5 %/.test(htmlRows[0]) && /10 %/.test(htmlRows[1]) && /20 %/.test(htmlRows[2]), htmlRows)
  const no = H.Mail.formatNewOrderEmail({ orderId: '7', customerName: 'Léa', slot: '12:30', items, deals: [], total: 15, charges: mix.snapshot, notes: null, money: EUR, time: FRT })
  t('the truck\'s new-order email is unchanged — no « Dont TVA » line there (decision 3)', !/Dont TVA/.test(no.html + no.text))
  const row = { id: '7', order_key: 'ok-7', customer_name: 'Léa', customer_phone: null, slot: '12:30', buzzer_number: null, items, deals: [], notes: null, total: 15, total_minor: 1500, currency: 'EUR', country: 'FR', status: 'confirmed', ...mix.snapshot }
  const tk = H.mapOrderToTicket({ order: row, truck: { name: 'Crêperie', money: { ...EUR, localeByCountry: { FR: 'fr-FR' } }, time: FRT }, event: null, ledgerRows: [], printedLabel: '12:01' })
  for (const w of [58, 80]) {
    const ls = H.T.buildTicketLines(tk, { paper_width: w }).map(l => flat(l.text ?? ''))
    const i = ls.findIndex(l => /^TOTAL/i.test(l))
    t(`ticket ${w} mm: TOTAL then three « Dont TVA » lines — 5,5 % 0,13 · 10 % 0,77 · 20 % 0,67 — each the paper's width`, i >= 0 && /^Dont TVA 5,5 ?%\s+.*0,13/.test(ls[i + 1]) && /^Dont TVA 10 ?%\s+.*0,77/.test(ls[i + 2]) && /^Dont TVA 20 ?%\s+.*0,67/.test(ls[i + 3]) && [1, 2, 3].every(k => ls[i + k].length === (w === 58 ? 32 : 48)), ls.slice(i, i + 4))
  }
  // the ledger and the Orders CSV
  const acc = H.LG.accountRows({ orders: [{ ...row, created_at: '2026-11-24T11:30:00.000Z', event_date: '2026-11-24', event_id: 'ev-1', customer_email: null }], payments: [], costs: [], itemIdByName: {}, tax: { inclusive: true, rateMilli: 10000 }, timeZone: 'Europe/Paris', currency: 'EUR' })
  t('the ledger: tax 1,57 € "stored" (the receipt\'s own sum); net 13,43 €; by rate: net 2,37 / 7,73 / 3,33, tax 0,13 / 0,77 / 0,67',
    acc[0].taxMinor === 157 && acc[0].taxBasis === 'stored' && acc[0].netMinor === 1343 && J(acc[0].rates) === J([{ rate: 5500, netMinor: 237, taxMinor: 13 }, { rate: 10000, netMinor: 773, taxMinor: 77 }, { rate: 20000, netMinor: 333, taxMinor: 67 }]), acc[0])
  const words = { header: k => k, channel: c => c, payment: p => p, taxBasis: b => b, event: () => 'Place', rateHeader: (k, r) => `${k === 'net' ? 'Net' : 'Tax'} ${r === null ? 'no rate' : r / 1000 + '%'}` }
  const ocsv = H.CSV.ordersCsv(acc, words).replace(/^﻿/, '').split('\r\n')
  t('the Orders CSV gains, after Profit: Net 5.5% · Tax 5.5% · Net 10% · Tax 10% · Net 20% · Tax 20% — and the figures add up to Net and Tax',
    ocsv[0].endsWith('profit,Net 5.5%,Tax 5.5%,Net 10%,Tax 10%,Net 20%,Tax 20%') && ocsv[1].endsWith(',2.37,0.13,7.73,0.77,3.33,0.67'), ocsv.slice(0, 2))
  t('…a file with ONE rate keeps exactly its old columns (no per-rate columns)', !/Net 10%/.test(H.CSV.ordersCsv(H.LG.accountRows({ orders: [{ ...row, ...H.E.computeOrderCharges({ foodMinor: 1500, rules: RULES.FR_10, channel: 'walk_up' }).snapshot, customer_email: null }], payments: [], costs: [], itemIdByName: {}, tax: { inclusive: true, rateMilli: 10000 }, timeZone: 'Europe/Paris', currency: 'EUR' }), words)))
  // a refund takes back each rate's share
  const accR = H.LG.accountRows({ orders: [{ ...row, customer_email: 'x@example.test' }], payments: [{ order_key: 'ok-7', kind: 'charge', channel: 'online', amount_minor: 1500, state: 'succeeded' }, { order_key: 'ok-7', kind: 'refund', channel: 'online', amount_minor: 750, state: 'succeeded' }], costs: [], itemIdByName: {}, tax: { inclusive: true, rateMilli: 10000 }, timeZone: 'Europe/Paris', currency: 'EUR' })
  t('a half refund: tax 0,79 € (half of 1,57, rounded once), split by rate and adding up; net 6,71 €', accR[0].taxMinor === 79 && accR[0].rates.reduce((s, r) => s + r.taxMinor, 0) === 79 && accR[0].rates.reduce((s, r) => s + r.netMinor, 0) === accR[0].netMinor, accR[0])

  // a mixed deal
  const deal = { name: 'Formule', price: 10, slots: { plat: 'Crêpe', boisson: 'Canette' }, slotModifiers: {} }
  const ltd = X.lineTax({ items: [], deals: [deal], foodMinor: 1000, book, defaultRate: 10000, currency: 'EUR' })
  t('a mixed deal (Formule 10,00 € = crêpe 8,50 € + can 2,50 € à la carte): split 850 : 250 → 7,73 € at 10 % and 2,27 € at 5,5 % (largest remainder: exactly 10,00 €)',
    J(ltd.dealStamps[0].tax_parts) === J([{ tax_rate_milli: 10000, minor: 773 }, { tax_rate_milli: 5500, minor: 227 }]) && J(ltd.parts) === J([{ rate: 5500, minor: 227 }, { rate: 10000, minor: 773 }]), ltd)
  const ltdx = X.lineTax({ items: [], deals: [{ name: 'Formule', price: 10, slots: { plat: 'Crêpe', boisson: 'Mystery' }, slotModifiers: {} }, { name: 'Gratuite', price: 0, slots: { a: 'Free' }, slotModifiers: {} }], foodMinor: 1000, book: { ...book, Free: { id: 'f', rate: 20000, priceMinor: 0 } }, defaultRate: 10000, currency: 'EUR' })
  t('the deal fallback: a chosen dish not on the menu, or every price zero → the whole deal at the default rate, and both cases returned (and logged)',
    J(ltdx.fallbacks) === J([{ deal: 'Formule', reason: 'unknown_dish' }, { deal: 'Gratuite', reason: 'zero_prices' }]) && J(ltdx.parts) === J([{ rate: 10000, minor: 1000 }]), ltdx)
  // largest remainder
  let lrOk = true
  for (let n = 0; n < 400; n++) {
    const total = (n * 7919) % 100003, w = [1 + (n % 7), (n * 31) % 13, 3 + (n % 5), (n * 17) % 11]
    const a = X.allocate(total, w)
    if (a.reduce((s, x) => s + x, 0) !== total || a.some(x => x < 0)) { lrOk = false; break }
  }
  t('largest remainder: 400 allocations each add up to their total exactly, never negative', lrOk && J(X.allocate(1000, [850, 250])) === J([773, 227]) && J(X.allocate(1, [1, 1, 1])) === J([1, 0, 0]))
  // an edit keeps each line's rate
  const storedItems = items
  const editL = X.lineTax({ items: [...storedItems, { name: 'Galette', quantity: 1, unit_price: 9 }, { name: 'Crêpe', quantity: 1, unit_price: 8.5 }], deals: [], foodMinor: 3250, book: X.taxBookFrom(FRMENU.map(m => m.name === 'Canette' ? { ...m, tax_rate_milli: 20000 } : m), 'EUR'), defaultRate: 10000, currency: 'EUR', stored: { items: storedItems, deals: [] } })
  t('an edit: the can already on the order keeps its 5,5 % even though the menu now says 20 %; a NEW can or galette takes today\'s rate',
    J(editL.itemStamps.map(s => s.tax_rate_milli)) === J([10000, 5500, 20000, 10000, 10000]), editL.itemStamps)
  const oldStored = [{ name: 'Canette', quantity: 1, unit_price: 2.5 }]   // an order from before france-vat-1: no stamp
  const editOld = X.lineTax({ items: oldStored, deals: [], foodMinor: 250, book, defaultRate: 10000, currency: 'EUR', stored: { items: oldStored, deals: [] } })
  t('…and a line on an older order (no stamp) keeps the order\'s own stored rate, not the menu\'s new one', editOld.itemStamps[0].tax_rate_milli === 10000)
  const ed = H.E.chargesForEdit(3250, RULES.FR_10, row, editL.parts)
  t('the edit\'s breakdown follows its lines: 5,5 % on 2,50 €, 10 % on 26,00 €, 20 % on 4,00 €', J(ed.snapshot.tax_breakdown.map(r => [r.rate_milli, r.food_minor])) === J([[5500, 250], [10000, 2600], [20000, 400]]), ed.snapshot.tax_breakdown)
  // the US: tax added per rate, and the pay-at-the-truck switch keeps the split
  const usBook = X.taxBookFrom([{ name: 'Burger', price: 10, tax_rate_milli: null }, { name: 'Soda', price: 2, tax_rate_milli: 5000 }], 'USD')
  const usLt = X.lineTax({ items: [{ name: 'Burger', quantity: 1, unit_price: 10 }, { name: 'Soda', quantity: 1, unit_price: 2 }], deals: [], foodMinor: 1200, book: usBook, defaultRate: 8250, currency: 'USD' })
  const us = H.E.computeOrderCharges({ foodMinor: 1200, rules: RULES.US_825, channel: 'online_card', tip: { kind: 'percent', bps: 1500 }, foodParts: usLt.parts })
  t('US, tax added per rate: $2.00 soda at 5 % = $0.10, $10.00 burger at 8.25 % = $0.83 → tax $0.93; tip 15 % of food; total = food + tax + tip + fee',
    us.taxMinor === 93 && us.tipMinor === 180 && us.totalMinor === 1200 + 93 + 180 + us.serviceFeeMinor && J(us.snapshot.tax_breakdown.map(r => [r.rate_milli, r.tax_minor])) === J([[5000, 10], [8250, 83]]), us)
  const usLines = H.L.chargeLinesFor(us.snapshot, 'customer', 'en-US', { perRate: true }).filter(l => l.key === 'tax')
  const usOne = H.L.chargeLinesFor(us.snapshot, 'customer', 'en-US').filter(l => l.key === 'tax')
  t('…a receipt (email, ticket) shows one tax line per rate ("Sales tax 5%: $0.10", "Sales tax 8.25%: $0.83"); every other screen one line with no rate (no single rate is true of it)',
    J(usLines.map(l => [l.rate, l.minor])) === J([['5%', 10], ['8.25%', 83]]) && usOne.length === 1 && usOne[0].rate === null && usOne[0].minor === 93, { usLines, usOne })
  const sw = H.E.chargesForHatchSwitch({ ...us.snapshot })
  t('the pay-at-the-truck switch drops tip and fee and keeps the split: tax $0.93 on the same two rates', sw && sw.tipMinor === 0 && sw.serviceFeeMinor === 0 && sw.taxMinor === 93 && J(sw.snapshot.tax_breakdown.map(r => [r.rate_milli, r.food_minor])) === J([[5000, 200], [8250, 1000]]), sw?.snapshot)
  // a card draft carries the breakdown to its order
  t('a card draft carries it: tax_breakdown is one of the snapshot columns (on order_drafts, copied by chargeColumnsOf on promotion)',
    H.E.ORDER_CHARGE_COLUMNS.includes('tax_breakdown') && J(H.E.chargeColumnsOf({ ...mix.snapshot, other: 1 }).tax_breakdown) === J(mix.snapshot.tax_breakdown)
    && /\.\.\.ORDER_CHARGE_COLUMNS/.test(read('lib/payments/order-drafts.ts')) && /\.\.\.chargeColumnsOf\(draft/.test(read('lib/payments/promote-draft.ts')))
  // every path calls the shared engine and stamps from the server
  const SUB = read('app/api/orders/submit/route.ts'), ACT = read('app/api/dashboard/action/route.ts')
  t('the customer submit, the walk-up and the operator edit each split with lineTax over the server\'s book (taxBookOf) and pass the parts to the engine',
    /lineTax\(\{\s*items: pricedItems, deals: deals \? pricedDeals : \[\], foodMinor,\s*book: taxBookOf\(priceBook/.test(SUB) && /foodParts: lineTaxResult\.parts/.test(SUB)
    && /const walkupTax = lineTax\(/.test(ACT) && /foodParts: walkupTax\.parts/.test(ACT) && /const editTax = lineTax\(/.test(ACT) && /chargesForEdit\(editFoodMinor, editRules, order, editTax\.parts\)/.test(ACT)
    && /stampItems\(pricedItems, lineTaxResult\.itemStamps\)/.test(SUB) && /stampItems\(pricedItemsBeforeTax, walkupTax\.itemStamps\)/.test(ACT) && /stampItems\(stampEditedLines\(/.test(ACT))
  t('the previews call the same function: the order page, Add order and the dashboard edit (lineTax + foodParts)',
    /foodParts: pageFoodParts/.test(read('app/(app)/trucks/[slug]/order/page.tsx')) && /computeOrderCharges\(\{ foodMinor, rules, channel: 'walk_up', foodParts \}\)/.test(read('components/dashboard/AddOrderPanel.tsx'))
    && /chargesForEdit\(foodMinorNow,editRulesNow,o,editParts\)/.test(read('app/(app)/dashboard/[token]/page.tsx')))

  // ══ C ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('C · THE LOCK — the real /api/dashboard/action refuses edit and cancel on finished orders')
  {
    const LPF = require('./_lp1b-fixtures.cjs')
    const C = LPF.country('GB')
    const SEEDS = require('./_country-settings-gb.cjs')
    const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
    const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
    const M = await kit.bundle('fv1-action', "export { POST } from '@/app/api/dashboard/action/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", { stubs: {
      '@/lib/apns': 'export async function sendOrderPendingPush() {}\nexport function normaliseApnsKey(k) { return k }',
      '@/lib/fcm': 'export async function sendOrderPendingPush() {}',
      '@/lib/payments/capture': 'export async function captureOnConfirmation() { return { ok: true, outcome: "nothing_to_capture" } }',
    } })
    const call = async (status, action) => {
      const order = { ...C.ORDERS.pay_at_hatch, order_key: 'ok-1', status, truck_id: 'test-truck' }
      const tables = {
        trucks: [{ ...C.TRUCK, dashboard_token: 'tok-test', dashboard_pin: null, active: true, operator_id: 'op-test', timezone: C.time.timeZone }],
        country_settings: [snake(SEEDS.gbFromSeed())], truck_events: [{ ...C.EVENT, truck_id: 'test-truck' }], orders: [order],
        menu_items_db: [], menu_categories: [], modifier_groups: [], modifier_options: [], item_modifier_groups: [], bundles_db: [], discount_codes_db: [],
        order_drafts: [], order_payments: [], booking_locks: [], truck_vans: [], van_devices: [], truck_users: [], event_option_stock: [], action_audit_log: [],
      }
      const db = makeFakePg(tables, { keys: { orders: [['order_key'], ['event_id', 'id']] } })
      globalThis.__harnessDb = { ...db, rpc: async () => ({ data: null, error: null }), auth: { getUser: async () => ({ data: { user: null }, error: null }) } }
      M.clearCountrySettingsCache?.()
      const body = { token: 'tok-test', action, order_key: 'ok-1', ...(action === 'edit' ? { editedOrder: { items: order.items } } : { cancellationReason: 'test' }), ...(status === 'collected' && action === 'cancel' ? { expected_from: ['collected'] } : {}) }
      try {
        const res = await kit.quietAsync(() => M.POST(new NextRequest('http://127.0.0.1/api/dashboard/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })))
        const text = await res.text()
        return { status: res.status, body: (() => { try { return JSON.parse(text) } catch { return text } })(), statusAfter: tables.orders[0].status }
      } catch (e) { return { error: String(e?.message || e).slice(0, 200) } } finally { delete globalThis.__harnessDb }
    }
    for (const s of ['collected', 'cancelled', 'rejected']) for (const a of ['edit', 'cancel']) {
      const r = await call(s, a)
      t(`${a} on a ${s} order: 409, code order_finished_${a}, "${r.body?.error ?? ''}"; the row is untouched`, r.status === 409 && r.body?.code === `order_finished_${a}` && r.statusAfter === s, r)
    }
    const ok = await call('ready', 'edit')
    t('a ready order still reaches the edit\'s own checks (not refused as finished)', ok.body?.code !== 'order_finished_edit' && !ok.error, ok)
    const code = ACT.replace(/\/\/.*$/gm, '')
    t('both refusals come straight after the order is read, before any write (no other order of statements)',
      /if \(!order\) return NextResponse\.json\(await kErr\('order_not_found'\), \{ status: 404 \}\)\s*if \(FINISHED_STATUSES\.has\(String\(order\.status\)\)\) return NextResponse\.json\(await kErr\('order_finished_cancel'\), \{ status: 409 \}\)/.test(code)
      && /if \(!order\) return NextResponse\.json\(await kErr\('order_not_found'\), \{ status: 404 \}\)\s*if \(FINISHED_STATUSES\.has\(String\(order\.status\)\)\) return NextResponse\.json\(await kErr\('order_finished_edit'\), \{ status: 409 \}\)/.test(code)
      && /const FINISHED_STATUSES = new Set\(\['collected', 'cancelled', 'rejected'\]\)/.test(code))
  }

  // ══ D ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('D · THE MIGRATION — additive, the same signature, the live body + tax_breakdown only')
  {
    const sql = read('supabase/migrations/20261124_france_vat_1.sql'), old = read('supabase/migrations/20261010_18_tax_rate_milli.sql')
    const strip = s => s.replace(/--.*$/gm, '')
    const code = strip(sql)
    t('three new NULLABLE columns, no default, nothing backfilled; no UPDATE / DELETE FROM / TRUNCATE of any table; no DROP COLUMN, no RENAME',
      /add column if not exists tax_rate_milli integer;/.test(code) && (code.match(/add column if not exists tax_breakdown\s+jsonb;/g) || []).length === 2
      && !/\b(update|delete\s+from|truncate)\b/i.test(code.replace(/delete from production_slot_usage/g, '')) && !/drop column|rename/i.test(code))
    t('the rate checks widen to 0–30000 on trucks, orders and order_drafts, and a dish\'s rate has the same check', (code.match(/check \(tax_rate_milli between 0 and 30000\)/g) || []).length === 4)
    const fnOf = s => strip(s).match(/create or replace function place_order_atomic_v2\(([\s\S]*?)\$\$;/)?.[0].replace(/\s+/g, ' ').trim()
    const a = fnOf(old), b = fnOf(sql)
    const expected = a && a.replace('application_fee_minor )', 'application_fee_minor, tax_breakdown )').replace("(p_order->>'application_fee_minor')::integer )", "(p_order->>'application_fee_minor')::integer, nullif(p_order->'tax_breakdown', 'null'::jsonb) )")
    t('place_order_atomic_v2: the SAME seven parameters, and the body is 20261010_18\'s (the live one, read 24 Nov) plus the column and nullif(p_order->\'tax_breakdown\', \'null\') — nothing else', !!a && !!b && expected === b, { a: a?.slice(0, 200), b: b?.slice(0, 200) })
    t('…an old-style call (no tax_breakdown key) stores NULL; the grants are restated (service role only)', /nullif\(p_order->'tax_breakdown', 'null'::jsonb\)/.test(code) && /revoke all on function public\.place_order_atomic_v2\(jsonb, text, text, uuid, text, date, jsonb\) from public, anon, authenticated;/.test(code) && /grant execute on function public\.place_order_atomic_v2\(jsonb, text, text, uuid, text, date, jsonb\) to service_role;/.test(code))
  }

  // ══ E ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('E · MANAGE › PAYMENTS — the card everywhere, the popup, the 0–30 % limit')
  {
    const CS = H.CS
    t('the rate limit is 0–30 % (23 % for Ireland, 27 % fits): "30" yes, "30.001" no, "23" yes; up to 3 decimals', CS.rateBoxToMilli('30') === 30000 && CS.rateBoxToMilli('30.001') === 'bad' && CS.rateBoxToMilli('23') === 23000 && CS.rateBoxToMilli('5.5') === 5500 && CS.rateBoxToMilli('8.8755') === 'decimals' && CS.MAX_RATE_MILLI === 30000)
    const gbOk = CS.checkChargeSettings({ taxRate: '20' }, GB, m => String(m)), gbNone = CS.checkChargeSettings({ taxRate: '' }, GB, m => String(m)), ieOk = CS.checkChargeSettings({ taxRate: '23' }, IE, m => String(m))
    t('GB and IE now take a rate (20 → 20000; 23 → 23000), and an empty box is "No VAT" (NULL)', gbOk.ok && gbOk.values.tax_rate_milli === 20000 && gbNone.ok && gbNone.values.tax_rate_milli === null && ieOk.ok && ieOk.values.tax_rate_milli === 23000)
    const gbRated = H.RU.resolveChargeRules(GB, { country: 'GB', tax_rate_milli: 20000 })
    const gbOrder = H.E.computeOrderCharges({ foodMinor: 1200, rules: gbRated, channel: 'walk_up' })
    t('…a GB truck that sets 20 % gets "Includes VAT 20%: £2.00" on its receipts and nothing added to its prices, exactly as France does',
      gbRated.taxRateMilli === 20000 && gbOrder.totalMinor === 1200 && J(H.L.includedTaxLines(gbOrder.snapshot, 'en-GB').map(l => [l.label, l.rate, l.minor])) === J([['Includes VAT', '20%', 200]]))
    t('the quick rates: France 5,5 / 10 / 20 %; GB 0 / 5 / 20 %; every other country none', J(H.IR.quickRatesFor('FR')) === J([5500, 10000, 20000]) && J(H.IR.quickRatesFor('GB')) === J([0, 5000, 20000]) && H.IR.quickRatesFor('US').length === 0 && H.IR.quickRatesFor('IE').length === 0)
    t('the default rate as the card shows it: France 10 % (format), GB none (No VAT), GB 20 % when set, a US truck its own', H.IR.defaultRateOf(FR, {}) === 10000 && H.IR.defaultRateOf(GB, {}) === null && H.IR.defaultRateOf(GB, { tax_rate_milli: 20000 }) === 20000 && H.IR.defaultRateOf(US, { tax_rate_milli: 8875 }) === 8875)
    t('"N items use a different rate" counts only dishes off the default', H.IR.itemsOffDefault([{ tax_rate_milli: null }, { tax_rate_milli: 10000 }, { tax_rate_milli: 5500 }, { tax_rate_milli: 20000 }], 10000) === 2)

    const UI = await LP1E.context(kit, REPO).bundle('fv1-ui', "export { ChargesCard } from '@/components/manage/ChargesCard'\nexport { ItemRatesModal } from '@/components/manage/ItemRatesModal'\nexport { CountrySettingsProvider } from '@/components/CountrySettingsProvider'\nexport { I18nContext } from '@/lib/i18n/use-t'")
    const h = kit.h || ((...a) => require(path.join(REPO, 'node_modules/react')).createElement(...a))
    const wrap = (settings, locale, el) => kit.renderStatic(h(UI.I18nContext.Provider, { value: { locale, setLocale() {} } }, h(UI.CountrySettingsProvider, { value: settings, settings }, el)))
    const text = html => flat(html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')).replace(/\s+/g, ' ').trim()
    const card = (settings, truck, locale) => { try { return wrap(settings, locale, h(UI.ChargesCard, { truck, api: async () => null, showToast() {}, onTruckUpdate() {} })) } catch (e) { return 'ERROR ' + e.message } }
    const gbHtml = card(GB, { tax_rate_milli: null }, 'en-GB'), frHtml = card(FR, { tax_rate_milli: null }, 'fr-FR'), usHtml = card(US, { tax_rate_milli: 8875 }, 'en-US')
    t('GB: the card now shows — "VAT in your prices", a dropdown on "No VAT" (No VAT · 0% · 5% · 20% · Other…), "Choose No VAT if you don’t charge VAT.", and the Item rates row',
      /data-no-vat-select/.test(gbHtml) && /<option value="none" selected="">No VAT<\/option>/.test(gbHtml) && />0%<\/option>.*>5%<\/option>.*>20%<\/option>.*>Other…<\/option>/.test(gbHtml)
      && text(gbHtml).includes('Choose No VAT if you don’t charge VAT.') && text(gbHtml).includes('VAT in your prices') && /data-charges-row="item-rates"/.test(gbHtml) && text(gbHtml).includes('Change item rates'), text(gbHtml).slice(0, 500))
    t('France: the default box exactly as before (placeholder 10, « Laissez vide pour appliquer 10 % … ») plus the Item rates row', /placeholder="10"/.test(frHtml) && text(frHtml).includes('Laissez vide pour appliquer 10 %') && /data-charges-row="item-rates"/.test(frHtml) && !/data-no-vat-select/.test(frHtml), text(frHtml).slice(0, 400))
    t('the US: the sales-tax box, tips, and the Item rates row after the rate', /data-charges-row="rate"[\s\S]*data-charges-row="item-rates"[\s\S]*data-charges-row="tips"/.test(usHtml), text(usHtml).slice(0, 300))
    const data = { categories: [{ id: 'k1', name: 'Crêpes' }, { id: 'k2', name: 'Boissons' }], items: [
      { id: 'c1', name: 'Crêpe', category_id: 'k1', tax_rate_milli: null }, { id: 'c4', name: 'Galette', category_id: 'k1', tax_rate_milli: 10000 },
      { id: 'c2', name: 'Canette', category_id: 'k2', tax_rate_milli: 5500 }, { id: 'c3', name: 'Cidre', category_id: 'k2', tax_rate_milli: 20000 }, { id: 'c5', name: 'Kombucha', category_id: null, tax_rate_milli: 7000 }] }
    const modal = flat(wrap(FR, 'fr-FR', h(UI.ItemRatesModal, { data, defaultLabel: 'Par défaut (10 %)', api: async () => null, onClose() {}, onSaved() {}, showToast() {} })))
    const mt = text(modal)
    t('the popup: its title, its line, a close (X); categories in menu order (Crêpes, Boissons), then the dishes with no category under their own heading',
      /data-item-rates-modal/.test(modal) && /data-item-rates-close/.test(modal) && mt.indexOf('Crêpes') < mt.indexOf('Boissons') && /data-item-rates-category="Crêpes"[\s\S]*data-item-rates-category="Boissons"[\s\S]*data-item-rates-category="[^"]+"[\s\S]*Kombucha/.test(modal), mt.slice(0, 400))
    t('each dish a dropdown: Par défaut (10 %) · 5,5 % · 10 % · 20 % · Autre… — the crêpe on the default, the can on 5,5 %, the kombucha (7 %) on « Autre… » with its box showing 7',
      (modal.match(/data-item-rate-select/g) || []).length === 5 && /<option value="default" selected="">Par défaut \(10 %\)<\/option>/.test(modal) && /<option value="5500" selected="">5,5 %<\/option>/.test(modal) && /data-item-rate-other[^>]*value="7"|value="7"[^>]*data-item-rate-other/.test(modal) && /<option value="other">Autre…<\/option>/.test(modal), modal.slice(0, 600))
    t('each category header has "Set all"; Cancel and Save at the foot; one centred, inside-scrolling panel (the same layout on phone, iPad and desktop)',
      (modal.match(/data-item-rates-set-all="/g) || []).length === 3 && /data-item-rates-cancel/.test(modal) && /data-item-rates-save/.test(modal) && /max-w-lg max-h-\[90vh\] flex flex-col/.test(modal) && /overflow-y-auto/.test(modal))
    const MR = read('app/api/manage/route.ts')
    t('set_item_rates: owner (or admin) only; every id must be this truck\'s or nothing is written; rates 0–30 % or null; only the changed dishes sent; one write per rate, scoped to the truck',
      /if \(action === 'get_item_rates' \|\| action === 'set_item_rates'\) \{\s*if \(requestingUserRole !== 'owner' && !requestingIsAdmin\)/.test(MR) && /\(own \?\? \[\]\)\.length !== changes\.size\) return await refuse\('charges_items_invalid', 400\)/.test(MR)
      && /c\.rate <= MAX_RATE_MILLI/.test(MR) && /\.update\(\{ tax_rate_milli: g\.rate \}\)\.eq\('truck_id', truck\.id\)\.in\('id', g\.ids\)/.test(MR) && /if \(v !== i\.tax_rate_milli\) changes\.push/.test(read('components/manage/ItemRatesModal.tsx')))
    t('new dishes (menu import, demo templates, demo carry, seeding) get NULL — none of them names tax_rate_milli, so the column\'s NULL applies',
      ['lib/data-import', 'lib/demo-templates.ts', 'lib/demo-menu-carry.ts', 'lib/seed-demo-orders.ts'].every(f => { const p = path.join(REPO, f); const files = fs.statSync(p).isDirectory() ? fs.readdirSync(p).map(x => path.join(p, x)).filter(x => fs.statSync(x).isFile()) : [p]; return files.every(x => !fs.readFileSync(x, 'utf8').includes('tax_rate_milli')) }))
  }

  // ══ F ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('F · THE WORDS — en-GB and every language base an enabled country uses')
  {
    const NEW = ['manageCharges.noVat', 'manageCharges.noVatHint', 'manageCharges.otherRate', ...['label', 'hintSome', 'hintNone', 'button', 'title', 'intro', 'setAll', 'default', 'rateAria', 'otherItems', 'noItems', 'close', 'cancel', 'save', 'saved'].map(k => `manageCharges.itemRates.${k}`),
      'errorsManage.charges_items_invalid', 'errorsKitchen.order_finished_edit', 'errorsKitchen.order_finished_cancel', 'manageReports.accountsCsv.header.netAtRate', 'manageReports.accountsCsv.header.taxAtRate', 'manageReports.accountsCsv.noRate']
    const at = (o, k) => k.split('.').reduce((x, p) => (x == null ? undefined : x[p]), o)
    const en = JSON.parse(read('messages/en-GB.json'))
    t(`the ${NEW.length} new strings are in en-GB, and the range message says 30 %`, NEW.every(k => typeof at(en, k) === 'string') && at(en, 'errorsManage.charges_rate_range') === 'Use a rate from 0 to 30%.')
    const USED = ['am-ET', 'ar-AE', 'az-AZ', 'bg-BG', 'bn-BD', 'bs-BA', 'ca-AD', 'cs-CZ', 'da-DK', 'de-DE', 'el-GR', 'es-ES', 'et-EE', 'fi-FI', 'fr-FR', 'he-IL', 'hr-HR', 'hu-HU', 'hy-AM', 'id-ID', 'is-IS', 'it-IT', 'ja-JP', 'ka-GE', 'kk-KZ', 'km-KH', 'ko-KR', 'lo-LA', 'lt-LT', 'lv-LV', 'mk-MK', 'mn-MN', 'ms-MY', 'nb-NO', 'ne-NP', 'nl-NL', 'pl-PL', 'pt-BR', 'pt-PT', 'ro-RO', 'ru-KZ', 'si-LK', 'sk-SK', 'sl-SI', 'sq-AL', 'sr-RS', 'sv-SE', 'sw-TZ', 'th-TH', 'tr-TR', 'uk-UA', 'uz-UZ', 'zh-HK', 'zh-TW']
    const missing = []
    for (const l of USED) {
      const m = JSON.parse(read(`messages/${l}.json`)), b = JSON.parse(read(`docs/i18n/back/${l}.json`))
      for (const k of NEW) { if (typeof at(m, k) !== 'string') missing.push(`${l}:${k}`); if (typeof b[k] !== 'string') missing.push(`${l}:back:${k}`) }
      if (!/30/.test(at(m, 'errorsManage.charges_rate_range')) || /20/.test(at(m, 'errorsManage.charges_rate_range'))) missing.push(`${l}:range30`)
    }
    t(`all ${NEW.length} in each of the ${USED.length} language bases an enabled country uses, each with its back-translation; their range message says 30`, missing.length === 0, missing.slice(0, 12))
    const UNUSED = ['vi-VN', 'hi-IN', 'ur-PK', 'fil-PH', 'ta-LK']
    t('the five bases no enabled country uses (vi, hi, ur, fil, ta) are left alone (TRANSLATE ONLY WHAT\'S USED)', UNUSED.every(l => { const m = JSON.parse(read(`messages/${l}.json`)); return typeof at(m, 'manageCharges.itemRates.label') !== 'string' && /20/.test(at(m, 'errorsManage.charges_rate_range')) }))
    const enUS = JSON.parse(read('messages/en-US.json')), enCA = JSON.parse(read('messages/en-CA.json'))
    t('en-US says "canceled", en-CA "cancelled" (its own spelling over en-US)', at(enUS, 'errorsKitchen.order_finished_cancel') === 'This order is finished, so it can’t be canceled.' && at(enCA, 'errorsKitchen.order_finished_cancel') === 'This order is finished, so it can’t be cancelled.')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
