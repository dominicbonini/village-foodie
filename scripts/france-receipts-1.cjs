#!/usr/bin/env node
// scripts/france-receipts-1.cjs — france-receipts-1 (24 November 2026, docs/france-receipts-1-report.md): the receipt number, the date of
// sale and the business details on the three approved customer outputs, and France's franchise en base rule. No network, no database.
//
//   A · THE NAMED DIFFERENCE, against this prompt's starting commit (START, extracted from git — never HEAD), for the customer
//       confirmation email (HTML + text), the status page (/order/<key>/manage, rendered), its API (/api/orders/[id], run on an in-memory
//       database) and the ticket (its line model, and its bytes at 58 and 80 mm through START's own encoder):
//         no receipt_no, no business details  → the ONLY difference is the date-of-sale line;
//         a receipt_no                        → also the receipt part;
//         business details                    → also the business block.
//       Each expected output is START's output with exactly those insertions made at named places — then compared byte for byte.
//       The truck's NEW-ORDER email is byte-identical to START in every case (franchise included).
//   B · THE LABELS — France SIRET (14) / SIREN (9) with the usual spacing (digits only on the ticket), « N° TVA »; GB "Company no.",
//       "VAT no."; another country's neutral "Registration no."; partial details; none.
//   C · FRANCHISE EN BASE — a French truck at 10 % with a 20 % dish: a new order is 0 % on every line and deal, its rate and breakdown 0 %;
//       the 293 B line on the email, status page and ticket and no « Dont TVA »; 0 % with VAT 0 in the accountant CSV and the daily-totals
//       file; the regime switched back restores the saved rates for the next order; an order already placed is untouched; an edit of a
//       franchise order stays 0 %; an order the deployed code taxed is never told it was exempt; the real order paths use these rules.
//   D · THE TICKET AT 58 mm — a long legal name and address wrap to 32 columns, nothing lost.
//   E · THE MIGRATION and its rolled-back live proofs (the recorded logs).
//   F · THE WORDS — the 4 receipt words and the new franchise note in en-GB and every language base an enabled country uses; the Business
//       details note.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
require('./_disk-guard.cjs').guard(__filename)
require('./_harness-tmp.cjs')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'france-receipts-1' })
const { REPO } = kit
const { makeFakePg } = require('./_fake-pg.cjs')
const SEEDS = require('./_country-settings-gb.cjs')

/** 🔴 THIS PROMPT'S STARTING COMMIT (never HEAD): vat-live-check-1's eab06a0a, the branch tip when france-receipts-1 began. */
const START = 'eab06a0a'

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const J = v => JSON.stringify(v)
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const firstDiff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return `@${i}: expected …${J(a.slice(Math.max(0, i - 80), i + 120))}\n      got      …${J(b.slice(Math.max(0, i - 80), i + 120))}` }
/** `s` with `ins` inserted right after the first `anchor` (or before it, `before: true`). Throws when the anchor is missing. */
const insertAt = (s, anchor, ins, before = false) => {
  const i = s.indexOf(anchor)
  if (i < 0) throw new Error(`[france-receipts-1] anchor not found: ${anchor.slice(0, 80)}`)
  const at = before ? i : i + anchor.length
  return s.slice(0, at) + ins + s.slice(at)
}

// ── a bundle from ANY tree (france-vat-1's method) — with the render kit's stubs: the database read at use time, the status page's
//    `order` / `loading` state settable from the harness. ──
const DB_STUB = "export const supabase = new Proxy({}, { get(_, k) { const db = globalThis.__harnessDb; if (db) return db[k]; throw new Error('no database in this harness') } })"
const DBLIB_STUB = "const lazy = new Proxy({}, { get(_, k) { const db = globalThis.__harnessDb; if (db) return db[k]; throw new Error('no database in this harness') } })\nmodule.exports = Object.create(new Proxy({}, { get: (_, k) => (typeof k === 'symbol' ? undefined : () => lazy) }))"
const NAV = "export const useRouter = () => ({ push(){}, replace(){}, refresh(){}, back(){}, prefetch(){} })\nexport const usePathname = () => '/'\nexport const useSearchParams = () => new URLSearchParams('')\nexport const useParams = () => ({ id: 'ok-1' })\nexport const notFound = () => { throw new Error('notFound') }\nexport const redirect = () => { throw new Error('redirect') }"
const MS_USE = "const __msUse = (k, p) => (globalThis.__ms && Object.prototype.hasOwnProperty.call(globalThis.__ms, k) ? [globalThis.__ms[k], p[1]] : p);\n"
const PAGE = 'app/(app)/order/[id]/manage/page.tsx'
let bundleN = 0
async function bundleFrom(root, tag, entry) {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const res = await esbuild.build({
    stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', target: 'node20',
    logLevel: 'silent', alias: { '@': root }, loader: { '.css': 'empty', '.svg': 'text', '.png': 'empty', '.jpg': 'empty' },
    external: ['react', 'react-dom', 'react/jsx-runtime', 'next', 'next/server', 'next/headers'], define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'frc1-stubs', setup(b) {
      b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'frc1' }))
      b.onResolve({ filter: /(^@\/|\/)lib\/supabase(\.ts)?$/ }, () => ({ path: 'db', namespace: 'frc1' }))
      b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'dblib', namespace: 'frc1' }))
      b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'nav', namespace: 'frc1' }))
      b.onLoad({ filter: /.*/, namespace: 'frc1' }, a => ({ contents: a.path === 'db' ? DB_STUB : a.path === 'dblib' ? DBLIB_STUB : a.path === 'nav' ? NAV : '', loader: 'js' }))
      b.onLoad({ filter: /order\/\[id\]\/manage\/page\.tsx$/ }, a => ({ contents: kit.wrapStates(fs.readFileSync(a.path, 'utf8'), ['order', 'loading'], PAGE) + '\n' + MS_USE, loader: 'tsx' }))
    } }],
  })
  const dir = path.join(REPO, 'node_modules/.cache/france-receipts-1-trees'); fs.mkdirSync(dir, { recursive: true })   // beside node_modules
  const out = path.join(dir, `${tag}-${bundleN++}.cjs`)
  fs.writeFileSync(out, res.outputFiles[0].text)
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:9'
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:9'
  return kit.quiet(() => require(out))
}
function extract(ref) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'frc1-start-'))
  const tar = execFileSync('git', ['archive', '--format=tar', ref, 'lib', 'components', 'messages', 'app/(app)/order', 'app/api/orders/[id]'], { cwd: REPO, maxBuffer: 1e9 })
  execFileSync('tar', ['-x', '-C', dir], { input: tar, maxBuffer: 1e9 })
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'))
  return dir
}

const ENTRY = [
  "export * as E from '@/lib/order-charges'", "export * as L from '@/lib/order-charge-lines'", "export * as Mail from '@/lib/email'",
  "export * as T from '@/lib/printing/ticket'", "export { mapOrderToTicket } from '@/lib/printing/mapOrderToTicket'", "export * as X from '@/lib/order-tax'",
  "export { GET as StatusGET } from '@/app/api/orders/[id]/route'", "export { default as StatusPage } from '@/app/(app)/order/[id]/manage/page'",
  "export { clearCountrySettingsCache } from '@/lib/country-settings'",
].join('\n')
const HEAD_EXTRA = "\nexport * as R from '@/lib/receipt'\nexport * as LG from '@/lib/accounts/ledger'\nexport * as CSV from '@/lib/accounts/csv'\nexport * as DT from '@/lib/accounts/daily-totals'"

;(async () => {
  kit.setNow('2026-11-24T12:00:00.000Z'); kit.setDeviceTz('Europe/London')
  const startDir = extract(START)
  const S = await bundleFrom(startDir, 'start', ENTRY)
  const H = await bundleFrom(REPO, 'head', ENTRY + HEAD_EXTRA)
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const React = require(path.join(REPO, 'node_modules/react'))

  // ── the fixtures ─────────────────────────────────────────────────────────────────────────────────────────────────────
  const RULES = {
    FR_10: { taxInclusive: true, taxLabel: 'TVA', taxRateMilli: 10000, feesTaxed: false, serviceFee: null, tipping: null, surcharge: null, cardFeePayer: 'truck', platformFee: null },
    GB_NONE: { taxInclusive: true, taxLabel: 'VAT', taxRateMilli: null, feesTaxed: false, serviceFee: null, tipping: null, surcharge: null, cardFeePayer: 'truck', platformFee: null },
    US_825: { taxInclusive: false, taxLabel: 'Sales tax', taxRateMilli: 8250, feesTaxed: false, serviceFee: null, tipping: null, surcharge: null, cardFeePayer: 'truck', platformFee: null },
  }
  const CC = {
    FR: { cur: 'EUR', loc: 'fr-FR', tz: 'Europe/Paris', fmt: 'fr', rules: RULES.FR_10 },
    GB: { cur: 'GBP', loc: 'en-GB', tz: 'Europe/London', fmt: 'gb', rules: RULES.GB_NONE },
    US: { cur: 'USD', loc: 'en-US', tz: 'America/New_York', fmt: 'us', rules: RULES.US_825 },
  }
  const TIME = cc => ({ timeZone: CC[cc].tz, locale: CC[cc].loc, timeFormat: cc === 'US' ? '12h' : '24h', dateOrder: cc === 'US' ? 'mdy' : 'dmy', weekStart: 'monday' })
  const MENU = [{ id: 'm1', name: 'Crêpe', price: 8.5, tax_rate_milli: null }, { id: 'm2', name: 'Canette', price: 2.5, tax_rate_milli: 5500 }, { id: 'm3', name: 'Cidre', price: 4, tax_rate_milli: 20000 }]
  const BASKETS = {
    single: { items: [{ name: 'Crêpe', quantity: 2, unit_price: 8.5, modifiers: [], specialInstructions: '' }], deals: [], food: 1700 },
    mixed: { items: [{ name: 'Crêpe', quantity: 1, unit_price: 8.5, modifiers: [] }, { name: 'Canette', quantity: 1, unit_price: 2.5, modifiers: [] }, { name: 'Cidre', quantity: 1, unit_price: 4, modifiers: [] }], deals: [], food: 1500 },
  }
  const BUSINESS = {
    FR: { legal_name: 'Crêperie Léa SARL', registered_address: { address: '12 rue des Lilas', town: 'Paris', postcode: '75011' }, registration_number: '73282932000074', vat_number: 'FR12345678901' },
    GB: { legal_name: 'Pizza Kitchen Ltd', registered_address: { address: '1 High Street', town: 'Testville', postcode: 'TE1 1ST' }, registration_number: '12345678', vat_number: 'GB123456789' },
    US: { legal_name: 'Taco Truck LLC', registered_address: { address: '1 Main St', town: 'Hoboken', region: 'NJ', postcode: '07030' }, registration_number: 'EIN 12-3456789', vat_number: null },
  }
  /** One order through an engine: the lines stamped and split (france-vat-1), then charged. `franchise`: the server's franchise rules. */
  const priced = (O, cc, basket, { franchise = false, book = MENU } = {}) => {
    const { cur, rules } = CC[cc]
    const R0 = franchise ? H.R.franchiseRules(rules) : rules
    const b0 = O.X.taxBookFrom(book, cur)
    const lt = O.X.lineTax({ items: basket.items, deals: basket.deals, foodMinor: basket.food, book: franchise ? H.R.franchiseTaxBook(b0) : b0, defaultRate: R0.taxRateMilli, currency: cur })
    const ch = O.E.computeOrderCharges({ foodMinor: basket.food, rules: R0, channel: 'online_pay_at_truck', foodParts: lt.parts })
    return { items: O.X.stampItems(basket.items, lt.itemStamps), deals: O.X.stampDeals(basket.deals, lt.dealStamps), ch, total: ch.totalMinor / 100 }
  }
  const rowOf = (cc, p, extra = {}) => ({ id: '23', order_key: 'ok-1', customer_name: 'Léa', customer_phone: null, customer_email: 'lea@example.test', slot: '12:30', buzzer_number: null,
    items: p.items, deals: p.deals, notes: null, total: p.total, total_minor: p.ch.totalMinor, currency: CC[cc].cur, country: cc, status: 'confirmed', payment_status: 'unpaid',
    event_date: '2026-11-24', event_id: null, truck_id: 'frc1-truck', created_at: '2026-11-24T11:41:30.000Z', placed_at: '2026-11-24T11:41:00.000Z', ...p.ch.snapshot, ...extra })
  const truckOf = (cc, business) => ({ id: 'frc1-truck', name: 'Crêperie', country: cc, timezone: CC[cc].tz, slug: 'creperie', logo_storage_path: null, allow_customer_cancellation: true, cancellation_cutoff_mins: 30,
    ...(business ? BUSINESS[cc] : {}) })
  const emailParams = (cc, row) => ({ orderId: row.id, orderKey: row.order_key, truckName: 'Crêperie', customerName: 'Léa', slot: '12:30', items: row.items, deals: row.deals, discountAmt: 0,
    notes: null, autoAccepted: true, phoneCountry: cc, money: { currency: CC[cc].cur, locale: CC[cc].loc }, time: TIME(cc), total: row.total, charges: H.L.chargeSourceOf(row),
    venueName: 'Place du Marché', venueTown: 'Paris', allowCancellation: true, cancellationCutoffMins: 30, baseUrl: 'https://www.hatchgrab.com', truckSlug: 'creperie' })
  const newOrderParams = (cc, row) => ({ orderId: row.id, customerName: 'Léa', customerPhone: null, slot: '12:30', items: row.items, deals: row.deals, total: row.total, charges: H.L.chargeSourceOf(row),
    notes: null, venueName: 'Place du Marché', venueTown: 'Paris', autoAccepted: true, money: { currency: CC[cc].cur, locale: CC[cc].loc }, time: TIME(cc) })
  const ticketTruck = (cc, business) => ({ name: 'Crêperie', money: { currency: CC[cc].cur, locale: CC[cc].loc, localeByCountry: { [cc]: CC[cc].loc } }, time: TIME(cc),
    ...(business ? { ...BUSINESS[cc], country: cc, address_format: CC[cc].fmt } : { country: cc }) })
  const factsOf = (cc, row, business, forTicket = false) => H.R.receiptFactsOf(row, business ? { ...BUSINESS[cc], country: cc } : { country: cc }, { time: TIME(cc), locale: CC[cc].loc, addressFormat: CC[cc].fmt, forTicket })

  // ── the order API on an in-memory database ──
  const FRROW = { ...snake(SEEDS.gbFromSeed()), country_code: 'FR', name: 'France', currency: 'EUR', locale: 'fr-FR', address_format: 'fr', tax_label: 'TVA', default_timezone: 'Europe/Paris', timezones: ['Europe/Paris'] }
  const GBROW = snake(SEEDS.gbFromSeed()), USROW = snake(SEEDS.usFromSeed())
  const apiOf = async (O, cc, row, business) => {
    const db = makeFakePg({ orders: [{ ...row, trucks: truckOf(cc, business) }], truck_events: [], country_settings: [FRROW, GBROW, USROW] })
    globalThis.__harnessDb = db; O.clearCountrySettingsCache()
    try {
      const res = await kit.quietAsync(() => O.StatusGET(new NextRequest('http://localhost/api/orders/ok-1'), { params: Promise.resolve({ id: 'ok-1' }) }))
      return { status: res.status, body: await res.json() }
    } finally { delete globalThis.__harnessDb }
  }
  const pageOf = (O, body) => {
    globalThis.__ms = { order: body, loading: false }
    try { return kit.quiet(() => require(path.join(REPO, 'node_modules/react-dom/server')).renderToStaticMarkup(React.createElement(O.StatusPage))) } finally { delete globalThis.__ms }
  }
  const ticketOf = (O, cc, row, business) => O.mapOrderToTicket({ order: row, truck: ticketTruck(cc, business), event: null, ledgerRows: [], printedLabel: '24 Nov 12:41' })
  const WIDTH = { 58: 32, 80: 48 }
  /** The ticket's greedy wrap, restated (lib/printing/ticket.ts `wrap`). */
  const wrap = (text, width) => { const out = []; let cur = ''; for (const w of text.split(/\s+/).filter(Boolean)) { if (w.length > width) { if (cur) { out.push(cur); cur = '' } for (let i = 0; i < w.length; i += width) out.push(w.slice(i, i + width)); continue } if (!cur) cur = w; else if (cur.length + 1 + w.length <= width) cur += ' ' + w; else { out.push(cur); cur = w } } out.push(cur); return out }
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  // ══ A ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head(`A · THE NAMED DIFFERENCE — START ${START} vs this tree: the confirmation email, the status page and its API, the ticket`)
  const VARIANTS = [['no receipt number, no business details', {}, false], ['a receipt number', { receipt_no: 142 }, false], ['a receipt number and business details', { receipt_no: 142 }, true]]
  const SCEN = [['FR', 'single'], ['FR', 'mixed'], ['GB', 'single'], ['US', 'single']]
  const bad = { email: [], text: [], neworder: [], api: [], page: [], ticket: [] }
  let cases = 0
  for (const [cc, bk] of SCEN) for (const [vlabel, extra, business] of VARIANTS) {
    cases++
    const label = `${cc}|${bk}|${vlabel}`
    const pS = priced(S, cc, BASKETS[bk]), pH = priced(H, cc, BASKETS[bk])
    const rowS = rowOf(cc, pS, extra), rowH = rowOf(cc, pH, extra)
    const facts = factsOf(cc, rowH, business)
    // — the email —
    const eS = S.Mail.formatConfirmationEmail(emailParams(cc, rowS)), eH = H.Mail.formatConfirmationEmail({ ...emailParams(cc, rowH), receipt: facts })
    let exp = eS.html.replace(/(letter-spacing:0\.06em">)([^<]*)(<\/p>)/, (_, a, b, c) => a + b + (facts.receiptNo ? ` · ${esc(facts.receiptNo)}` : '') + `<br><span style="font-size:12px;font-weight:400;letter-spacing:0;text-transform:none">${esc(facts.soldAt)}</span>` + c)
    if (business) exp = insertAt(exp, '\n  <p style="text-align:center;margin-top:20px', `\n  <div style="margin-top:16px;padding-top:12px;border-top:1px solid #f1f5f9;font-size:11px;line-height:1.5;color:#94a3b8;text-align:center">\n    ${facts.business.map(esc).join('<br>')}\n  </div>\n`, true)
    if (exp !== eH.html) bad.email.push({ label, d: firstDiff(exp, eH.html) })
    if (eS.subject !== eH.subject) bad.email.push({ label, d: 'subject' })
    const tl = eS.text.split('\n')
    const pw = tl.lastIndexOf(tl.find(l => /HatchGrab/.test(l)))
    const expText = [tl[0], ...(facts.receiptNo ? [facts.receiptNo] : []), facts.soldAt, ...tl.slice(1, pw), ...(business ? facts.business : []), ...tl.slice(pw)].join('\n')
    if (expText !== eH.text) bad.text.push({ label, d: firstDiff(expText, eH.text) })
    // — the truck's new-order email: byte-identical —
    const nS = S.Mail.formatNewOrderEmail(newOrderParams(cc, rowS)), nH = H.Mail.formatNewOrderEmail(newOrderParams(cc, rowH))
    if (J(nS) !== J(nH)) bad.neworder.push(label)
    // — the API —
    const aS = await apiOf(S, cc, rowS, business), aH = await apiOf(H, cc, rowH, business)
    const want = { ...(facts.receiptNo ? { receiptNo: facts.receiptNo } : {}), soldAt: facts.soldAt, ...(business ? { business: facts.business } : {}) }
    const { receipt, ...restH } = aH.body
    if (aS.status !== 200 || aH.status !== 200 || J(restH) !== J(aS.body) || J(receipt) !== J(want)) bad.api.push({ label, s: aS.status, h: aH.status, receipt, want, rest: J(restH) === J(aS.body) })
    // — the status page —
    const gS = pageOf(S, aS.body), gH = pageOf(H, aH.body)
    let expP = insertAt(gS, '</h1>', (facts.receiptNo ? `<span class="text-slate-400 font-medium text-sm" data-receipt-no="true"> · ${esc(facts.receiptNo)}</span>` : ''), true)
    expP = insertAt(expP, '</h1>', `<p class="text-slate-400 text-xs mt-0.5" data-sold-at="true">${esc(facts.soldAt)}</p>`)
    if (business) expP = expP.replace(/<\/div><\/div><\/div>$/, `</div><div class="px-6 pb-4 text-xs text-slate-400 text-center" data-business-details="true">${facts.business.map(l => `<p>${esc(l)}</p>`).join('')}</div></div></div>`)
    if (expP !== gH) bad.page.push({ label, d: firstDiff(expP, gH) })
    // — the ticket —
    const kS = ticketOf(S, cc, rowS, business), kH = ticketOf(H, cc, rowH, business)
    const tf = factsOf(cc, rowH, business, true)
    for (const w of [58, 80]) {
      const cfg = { paper_width: w }
      const lS = S.T.buildTicketLines(kS, cfg), lH = H.T.buildTicketLines(kH, cfg)
      const at = lS.findIndex(l => l.text === S.T.printableText('Crêperie') && l.align === 'center')
      const block = [...(lS[at - 1]?.divider ? [] : [{ divider: true }]), ...[tf.receiptNo, tf.soldAt, ...(business ? tf.business : [])].filter(Boolean).flatMap(s => wrap(S.T.printableText(s), WIDTH[w]).map(x => ({ text: x })))]
      const expL = [...lS.slice(0, at), ...block, ...lS.slice(at)]
      const bytesH = Buffer.from(H.T.renderTicket(kH, cfg)), bytesExp = Buffer.from(S.T.encodeEscPos(expL, cfg))
      if (J(expL) !== J(lH) || !bytesH.equals(bytesExp) || lH.some(l => (l.text ?? '').length > WIDTH[w])) bad.ticket.push({ label, w, d: firstDiff(J(expL), J(lH)), bytes: bytesH.equals(bytesExp) })
    }
  }
  t(`${SCEN.length} orders (France one rate and mixed rates, GB, the US) × 3 cases = ${cases}: the customer email's HTML is START's with only the named insertions (the date of sale; + the receipt part; + the business block)`, bad.email.length === 0, bad.email.slice(0, 2))
  t('…its text part likewise (the receipt number and date under the title; the business lines above "Powered by")', bad.text.length === 0, bad.text.slice(0, 2))
  t('…the status page\'s HTML likewise (the receipt part beside "Order #23", the date under it, the business block at the bottom)', bad.page.length === 0, bad.page.slice(0, 2))
  t('…the order API answers START\'s JSON byte for byte plus one `receipt` key holding exactly those facts', bad.api.length === 0, bad.api.slice(0, 2))
  t('…the ticket\'s line model is START\'s plus one block before the truck name (a divider, then the facts wrapped to the paper), and its bytes at 58 and 80 mm are START\'s encoder\'s for that model', bad.ticket.length === 0, bad.ticket.slice(0, 2))
  t('…and the truck\'s NEW-ORDER email is byte-identical to START in every case', bad.neworder.length === 0, bad.neworder)
  {
    const p = priced(H, 'FR', BASKETS.single), row = rowOf('FR', p, { receipt_no: 142 })
    const e = H.Mail.formatConfirmationEmail({ ...emailParams('FR', row), receipt: factsOf('FR', row, true), variant: 'ready' })
    const e0 = H.Mail.formatConfirmationEmail({ ...emailParams('FR', row), variant: 'ready' })
    t('the "ready" variant of that email (not an approved output) is unchanged: receipt facts passed or not, the same bytes', J(e) === J(e0))
    const none = H.Mail.formatConfirmationEmail(emailParams('FR', row)), sNone = S.Mail.formatConfirmationEmail(emailParams('FR', rowOf('FR', priced(S, 'FR', BASKETS.single), { receipt_no: 142 })))
    t('the email with NO receipt facts passed (a send site that cannot read them) is byte-identical to START', J(none) === J(sNone))
  }

  {
    // 🔴 THE COMPARISON IS LIVE: a date one minute out, or a receipt part with no date, is caught.
    const p = priced(H, 'FR', BASKETS.single), row = rowOf('FR', p, { receipt_no: 142 }), f = factsOf('FR', row, false)
    const pS = priced(S, 'FR', BASKETS.single), eS = S.Mail.formatConfirmationEmail(emailParams('FR', rowOf('FR', pS, { receipt_no: 142 })))
    const exp = eS.html.replace(/(letter-spacing:0\.06em">)([^<]*)(<\/p>)/, (_, a, b, c) => a + b + ` · ${esc(f.receiptNo)}<br><span style="font-size:12px;font-weight:400;letter-spacing:0;text-transform:none">${esc(f.soldAt)}</span>` + c)
    const off = H.Mail.formatConfirmationEmail({ ...emailParams('FR', row), receipt: { ...f, soldAt: '24/11/2026 12:42' } }).html
    const noDate = H.Mail.formatConfirmationEmail({ ...emailParams('FR', row), receipt: { ...f, soldAt: null } }).html
    t('the comparison is live: a date of sale one minute out, or a receipt part without its date, does not match', off !== exp && noDate !== exp && H.Mail.formatConfirmationEmail({ ...emailParams('FR', row), receipt: f }).html === exp)
  }

  // ══ B ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('B · THE LABELS — France SIRET / SIREN and « N° TVA », GB "Company no.", elsewhere "Registration no."; partial details')
  {
    const p = priced(H, 'FR', BASKETS.single), row = rowOf('FR', p, { receipt_no: 142 })
    const fr = factsOf('FR', row, true), frT = factsOf('FR', row, true, true)
    t(`France: « ${fr.receiptNo} », sold « ${fr.soldAt} » (placed 11:41 UTC = 12:41 in Paris)`, fr.receiptNo === 'Reçu n° 142' && fr.soldAt === '24/11/2026 12:41', fr)
    t(`France, 14 digits: "SIRET 732 829 320 00074" on the email and status page, "SIRET 73282932000074" on the ticket`, fr.business.includes('SIRET 732 829 320 00074') && frT.business.includes('SIRET 73282932000074'), { fr: fr.business, ticket: frT.business })
    const siren = H.R.receiptFactsOf(row, { ...BUSINESS.FR, registration_number: '732829320', country: 'FR' }, { time: TIME('FR'), locale: 'fr-FR', addressFormat: 'fr' })
    t('France, 9 digits: "SIREN 732 829 320"', siren.business.includes('SIREN 732 829 320'), siren.business)
    t('France: « N° TVA FR12345678901 », the legal name first, the registered address in the French format (« 12 rue des Lilas, 75011 Paris »)', fr.business[0] === 'Crêperie Léa SARL' && fr.business.includes('N° TVA FR12345678901') && fr.business[1].includes('75011 Paris') && fr.business.length === 4, fr.business)
    t('…on the ticket « N° » prints as "No" (the printer has no "°"): "No TVA FR12345678901"', frT.business.includes('No TVA FR12345678901'), frT.business)
    const gbRow = rowOf('GB', priced(H, 'GB', BASKETS.single), { receipt_no: 7 }), gb = factsOf('GB', gbRow, true)
    t(`GB: "${gb.receiptNo}", "Company no. 12345678", "VAT no. GB123456789", sold "${gb.soldAt}"`, gb.receiptNo === 'Receipt no. 7' && gb.business.includes('Company no. 12345678') && gb.business.includes('VAT no. GB123456789') && gb.soldAt === '24/11/2026 11:41', gb)
    const usRow = rowOf('US', priced(H, 'US', BASKETS.single), {}), us = factsOf('US', usRow, true)
    t(`another country (the US): "Registration no. EIN 12-3456789", no tax-number line when none is set, sold "${us.soldAt}" (the truck's 12-hour clock)`, us.business.includes('Registration no. EIN 12-3456789') && us.business.length === 3 && us.soldAt === '11/24/2026 6:41 AM' && us.receiptNo === null, us)
    const deWords = JSON.parse(read('messages/de-DE.json')).charges.receipt
    const de = H.R.receiptFactsOf({ ...row, country: 'DE', tax_label: 'MwSt.' }, { country: 'DE', registration_number: 'HRB 1234', vat_number: 'DE123456789' }, { time: { ...TIME('FR'), locale: 'de-DE', timeZone: 'Europe/Berlin' }, locale: 'de-DE' })
    t(`Germany, in German: "${de.business.join(' / ')}"`, J(de.business) === J([`${deWords.registrationNumber} HRB 1234`, `${deWords.taxNumber.replace('{label}', 'MwSt.')} DE123456789`]), de.business)
    const only = (fields, cc = 'FR') => H.R.receiptFactsOf(row, { country: cc, ...fields }, { time: TIME('FR'), locale: 'fr-FR', addressFormat: 'fr' }).business
    t('partial details: only a legal name → that one line; only a VAT number → that one line; an address with only a town → that one line', J(only({ legal_name: 'Léa' })) === J(['Léa']) && J(only({ vat_number: 'FR1' })) === J(['N° TVA FR1']) && only({ registered_address: { town: 'Paris' } }).length === 1)
    t('none filled in (or blanks, or an empty address) → no business lines at all', only({}).length === 0 && only({ legal_name: '  ', registered_address: { address: '', town: '' }, vat_number: '' }).length === 0)
  }

  // ══ C ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('C · FRANCHISE EN BASE — a French truck at 10 % with a 20 % dish (and a 5,5 % can)')
  {
    const DEAL = { items: [{ name: 'Cidre', quantity: 1, unit_price: 4, modifiers: [] }], deals: [{ name: 'Formule', price: 10, slots: { main: 'Crêpe', drink: 'Canette' }, slotModifiers: {}, slotNotes: {} }], food: 1400 }
    const f = priced(H, 'FR', BASKETS.mixed, { franchise: true }), fd = priced(H, 'FR', DEAL, { franchise: true })
    t('a new order: every line stamped 0 % (the crêpe, the 20 % cider, the 5,5 % can) and every deal part 0 %', f.items.every(i => i.tax_rate_milli === 0) && fd.items.every(i => i.tax_rate_milli === 0) && fd.deals[0].tax_parts.length > 0 && fd.deals[0].tax_parts.every(p => p.tax_rate_milli === 0), { items: f.items.map(i => i.tax_rate_milli), deal: fd.deals[0].tax_parts })
    t('…its rate 0 %, no tax, and its breakdown one row at 0 % — [{0 %, 15,00 €, net 15,00 €, tax 0}]', f.ch.snapshot.tax_rate_milli === 0 && f.ch.snapshot.tax_minor === 0 && J(f.ch.snapshot.tax_breakdown) === J([{ rate_milli: 0, food_minor: 1500, gross_minor: 1500, net_minor: 1500, tax_minor: 0 }]) && f.ch.totalMinor === 1500, f.ch.snapshot)
    const book = H.X.taxBookFrom(MENU, 'EUR'), before = J(book)
    H.R.franchiseTaxBook(book); H.R.franchiseRules(RULES.FR_10)
    t('the truck\'s saved rates are not changed: the price book and the rules are copied, never written', J(book) === before && RULES.FR_10.taxRateMilli === 10000)
    const back = priced(H, 'FR', BASKETS.mixed)
    t('the regime switched back (réel simplifié): the next order is priced at the saved rates again — 10 %, 5,5 %, 20 %', !H.R.franchiseApplies('FR', 'reel_simplifie') && J(back.items.map(i => i.tax_rate_milli)) === J([10000, 5500, 20000]), back.items.map(i => i.tax_rate_milli))
    t('franchise en base is France only: a GB (or any other) truck with that value is priced as before', H.R.franchiseApplies('FR', 'franchise') && !H.R.franchiseApplies('GB', 'franchise') && !H.R.franchiseApplies('FR', null))
    const row = rowOf('FR', f, { receipt_no: 143, vat_regime: 'franchise' })
    const facts = factsOf('FR', row, true)
    t(`the order carries « ${facts.franchiseNote} » — exactly the legal wording`, facts.franchiseNote === 'TVA non applicable, art. 293 B du CGI')
    const mail = H.Mail.formatConfirmationEmail({ ...emailParams('FR', row), receipt: facts })
    t('the email: the 293 B line right under the total (HTML and text) and no « Dont TVA »', /Total<\/td>[\s\S]*?<\/tr><tr><td colspan="2" style="padding:4px 0;font-size:12px;color:#94a3b8">TVA non applicable, art\. 293 B du CGI<\/td><\/tr>\n    <\/table>/.test(mail.html) && mail.text.split('\n').some((l, i, a) => /^Total/.test(a[i - 1] ?? '') && l === 'TVA non applicable, art. 293 B du CGI') && !/Dont|Includes/.test(mail.html + mail.text), mail.text)
    const api = await apiOf(H, 'FR', row, true)
    const page = pageOf(H, api.body)
    t('the status page: the 293 B line under the total, no « Dont TVA »', api.body.receipt?.franchiseNote === 'TVA non applicable, art. 293 B du CGI' && /data-franchise-note="true">TVA non applicable, art\. 293 B du CGI<\/p>/.test(page) && !/Dont|Includes/.test(page), api.body.receipt)
    const tk = ticketOf(H, 'FR', row, true), lines = H.T.buildTicketLines(tk, { paper_width: 58 })
    const ti = lines.findIndex(l => /^TOTAL/.test(l.text ?? ''))
    t('the ticket: the 293 B line under TOTAL (wrapped to 58 mm), no « Dont TVA »', lines[ti + 1]?.text === 'TVA non applicable, art. 293 B' && lines[ti + 2]?.text === 'du CGI' && !lines.some(l => /Dont/.test(l.text ?? '')), lines.slice(ti, ti + 3))
    const nS = S.Mail.formatNewOrderEmail(newOrderParams('FR', row)), nH = H.Mail.formatNewOrderEmail(newOrderParams('FR', row))
    t('the truck\'s new-order email for that order is byte-identical to START\'s', J(nS) === J(nH))
    // — the accountant's files —
    const rule = { inclusive: true, rateMilli: 10000 }
    const vatRow = rowOf('FR', priced(H, 'FR', BASKETS.single), { order_key: 'ok-2', id: '22', receipt_no: 141 })
    const acc = H.LG.accountRows({ orders: [row, vatRow], payments: [], costs: [], itemIdByName: {}, tax: rule, timeZone: 'Europe/Paris', currency: 'EUR' })
    const fa = acc.find(r => r.orderKey === 'ok-1')
    const words = { header: k => k, channel: c => c, payment: p => p, taxBasis: b => b, event: () => 'Place du Marché', rateHeader: (k, r) => `${k}@${r}` }
    const one = H.LG.accountRows({ orders: [row], payments: [], costs: [], itemIdByName: {}, tax: rule, timeZone: 'Europe/Paris', currency: 'EUR' })
    const csv1 = H.CSV.ordersCsv(one, words), csv2 = H.CSV.ordersCsv(acc, words)
    t('the accountant\'s Orders CSV: the franchise order is tax 0 at rate 0 % ("stored", not estimated at the truck\'s 10 %), with its own "net@0 / tax@0" columns — alone or beside a 10 % order', fa.taxMinor === 0 && fa.taxBasis === 'stored' && J(fa.rates) === J([{ rate: 0, netMinor: 1500, taxMinor: 0 }]) && /,net@0,tax@0\r\n/.test(csv1) && /,net@0,tax@0,net@10000,tax@10000\r\n/.test(csv2) && csv1.split('\r\n')[1].endsWith(',15.00,0.00'), { fa, csv1: csv1.slice(0, 400) })
    const dt = H.DT.dailyTotals({ orders: [row, vatRow], payments: [], tax: rule, timeZone: 'Europe/Paris', from: '2026-11-24', to: '2026-11-24' })
    const zero = dt.rows.find(r => r.rate === 0)
    t('the daily-totals file: the franchise sale is IN it, at 0 % with VAT 0 (franchise trucks still e-report) — beside the 10 % order', !!zero && zero.salesMinor === 1500 && zero.vatMinor === 0 && zero.netMinor === 1500 && dt.noRateOrders === 0 && dt.rows.some(r => r.rate === 10000), dt)
    const dcsv = H.DT.dailyTotalsCsv(dt, { legalName: 'Crêperie Léa SARL', registration: '73282932000074', vatNumber: null, vatRegime: 'Franchise en base', from: '2026-11-24', to: '2026-11-24' }, 'EUR',
      { meta: { legalName: 'Legal name', registration: 'SIREN/SIRET', vatNumber: 'VAT number', vatRegime: 'VAT regime', period: 'Period' }, header: { date: 'Date', type: 'Type', rate: 'VAT rate', sales: 'Sales', refunds: 'Refunds', net: 'Net', vat: 'VAT' }, goods: 'Goods', total: 'Total', noRate: n => `${n} left out` })
    t('…its row reads "2026-11-24,Goods,0%,15.00,0.00,15.00,0.00"', dcsv.includes('\r\n2026-11-24,Goods,0%,15.00,0.00,15.00,0.00\r\n'), dcsv)
    // — orders already placed —
    const old = rowOf('FR', priced(H, 'FR', BASKETS.mixed), { vat_regime: null })
    t('an order placed before the truck chose franchise en base is untouched: no 293 B line, its « Dont TVA » lines as before', H.R.franchiseNoteFor(old, 'FR') === null && /Dont TVA/.test(H.Mail.formatConfirmationEmail({ ...emailParams('FR', old), receipt: factsOf('FR', old, false) }).html))
    const taxed = rowOf('FR', priced(H, 'FR', BASKETS.single), { vat_regime: 'franchise' })
    t('an order stamped franchise but TAXED (the deployed code, before this is deployed) is never told it was exempt: no 293 B line, its « Dont TVA » line kept', H.R.franchiseNoteFor(taxed, 'FR') === null && /Dont TVA/.test(H.Mail.formatConfirmationEmail({ ...emailParams('FR', taxed), receipt: factsOf('FR', taxed, false) }).html))
    // — an edit of a franchise order —
    const editItems = [...f.items.map(i => ({ ...i })), { name: 'Cidre', quantity: 1, unit_price: 4, modifiers: [] }]
    const ed = H.X.lineTax({ items: editItems, deals: [], foodMinor: 1900, book: H.R.franchiseTaxBook(H.X.taxBookFrom(MENU, 'EUR')), defaultRate: H.E.rulesForStoredOrder(RULES.FR_10, row).taxRateMilli, currency: 'EUR', stored: { items: f.items, deals: [] } })
    const edPlain = H.X.lineTax({ items: editItems, deals: [], foodMinor: 1900, book: H.X.taxBookFrom(MENU, 'EUR'), defaultRate: H.E.rulesForStoredOrder(RULES.FR_10, row).taxRateMilli, currency: 'EUR', stored: { items: f.items, deals: [] } })
    t('an edit of a franchise order adds a 20 % cider at 0 % (its own stamp, not the truck\'s regime today); without the franchise book it would be 20 %', ed.itemStamps.every(s => s.tax_rate_milli === 0) && edPlain.itemStamps.at(-1).tax_rate_milli === 20000, { ed: ed.itemStamps, plain: edPlain.itemStamps })
    // — the real order paths —
    const SUB = read('app/api/orders/submit/route.ts'), ACT = read('app/api/dashboard/action/route.ts'), PRO = read('lib/payments/promote-draft.ts')
    t('the customer submit prices with the truck\'s regime NOW: franchiseApplies(truck.country, truck.vat_regime) → franchiseRules / franchiseTaxBook into lineTax AND computeOrderCharges',
      /const franchise = franchiseApplies\(truck\.country, truck\.vat_regime\)\n\s*const orderRules = franchise \? franchiseRules\(chargeRules\) : chargeRules/.test(SUB) && /book: franchise \? franchiseTaxBook\(taxBookOf\(priceBook, truck\.currency\)\) : taxBookOf\(priceBook, truck\.currency\), defaultRate: orderRules\.taxRateMilli/.test(SUB) && /computeOrderCharges\(\{ foodMinor, rules: orderRules, channel: chargeChannel/.test(SUB))
    t('the walk-up likewise (the truck\'s regime now); the edit by the ORDER\'s own stamp (order.vat_regime === \'franchise\')',
      /const walkupFranchise = franchiseApplies\(truck\.country, truck\.vat_regime\)\n\s*const walkupRules = walkupFranchise \? franchiseRules\(await loadChargeRules\(truck\)\) : await loadChargeRules\(truck\)/.test(ACT) && /book: walkupFranchise \? franchiseTaxBook/.test(ACT) && /const editFranchise = order\.vat_regime === 'franchise' && franchiseApplies\(order\.country \?\? truck\.country, 'franchise'\)/.test(ACT) && /book: editFranchise \? franchiseTaxBook/.test(ACT))
    t('the card promotion carries the draft\'s stamped regime (named only when the draft has one; otherwise the trigger copies the truck\'s)', /\.\.\.\(\(draft as \{ vat_regime\?: string \| null \}\)\.vat_regime \? \{ vat_regime: \(draft as \{ vat_regime\?: string \| null \}\)\.vat_regime \} : \{\}\)/.test(PRO))
    const added = execFileSync('git', ['diff', START, '--', 'app', 'lib', 'components'], { cwd: REPO, encoding: 'utf8', maxBuffer: 1e8 }).split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
    t('no line this work added writes a rate: no update/insert/upsert naming tax_rate_milli in app/, lib/ or components/ (the saved default and dish rates stay as they are)', !added.some(l => /\.(update|insert|upsert)\(/.test(l) && /tax_rate_milli/.test(l)), added.filter(l => /tax_rate_milli/.test(l)).slice(0, 5))
  }

  // ══ D ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('D · THE TICKET AT 58 mm — a long legal name and address wrap to the paper, nothing lost')
  {
    const LONG = { legal_name: 'Société Coopérative des Crêpiers et Galettiers Bretons du Grand Ouest SARL', registered_address: { address: 'Zone Artisanale de la Croix-Saint-Lambert, Bâtiment 4, Allée des Marronniers', town: 'Saint-Germain-en-Laye', postcode: '78100' }, registration_number: '73282932000074', vat_number: 'FR12345678901' }
    const row = rowOf('FR', priced(H, 'FR', BASKETS.single), { receipt_no: 9999 })
    const tk = H.mapOrderToTicket({ order: row, truck: { ...ticketTruck('FR', false), ...LONG, address_format: 'fr' }, event: null, ledgerRows: [], printedLabel: '24 Nov 12:41' })
    for (const w of [58, 80]) {
      const lines = H.T.buildTicketLines(tk, { paper_width: w })
      const at = lines.findIndex(l => /^Recu no 9999$/.test(l.text ?? ''))
      const end = lines.findIndex(l => l.text === 'Creperie' && l.align === 'center')
      const block = lines.slice(at, end).map(l => l.text)
      const want = [...tk.receipt.business].map(s => H.T.printableText(s))
      t(`${w} mm: every receipt line within ${WIDTH[w]} columns, the divider before it, and the words of the name, address, SIRET and VAT number all there in order (${block.length} lines)`,
        at > 0 && lines[at - 1].divider === true && block.every(x => x.length <= WIDTH[w]) && block.slice(2).join(' ') === want.join(' ') && block.some(x => /^SIRET 73282932000074$/.test(x)) && (w === 80 || block.length > 6), block)
    }
  }

  // ══ E ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('E · THE MIGRATION — additive, never fails an insert, and its rolled-back live proofs')
  {
    const M = read('supabase/migrations/20261126_france_receipts_1.sql').replace(/--[^\n]*/g, '')
    t('two nullable columns (orders, order_drafts), no default, NO check constraint, nothing dropped or altered', /add column if not exists vat_regime text;[\s\S]*add column if not exists vat_regime text;/.test(M) && !/\bcheck\b|\bdrop\b|alter column|not null|default/i.test(M))
    t('the trigger function reads the truck inside its own exception block (a failure leaves NULL and a WARNING, the insert goes on) and only when the insert named no regime', /if new\.vat_regime is null then\s*begin\s*select t\.vat_regime into new\.vat_regime from public\.trucks t where t\.id = new\.truck_id;\s*exception when others then\s*new\.vat_regime := null;\s*raise warning/.test(M))
    t('both triggers BEFORE INSERT, created only if missing; place_order_atomic_v2 not touched', /create trigger orders_stamp_vat_regime before insert on public\.orders/.test(M) && /create trigger order_drafts_stamp_vat_regime before insert on public\.order_drafts/.test(M) && !/place_order_atomic/.test(M))
    for (const [f, n] of [['docs/france-receipts-1/preflight-20261126.log', 7], ['docs/france-receipts-1/regime-check.log', 7]]) {
      const L = read(f), before = (L.match(/counts before: (.*)/) || [])[1], after = (L.match(/counts after: (.*)/) || [])[1]
      t(`${path.basename(f)}: ${n} proofs passed, every transaction rolled back, the demo trucks' counts and regimes identical before and after`, (L.match(/^ {2}✓ /gm) || []).length === n && /✅ every proof passed/.test(L) && !/🔴/.test(L) && !!before && before === after && !/\bcommit\b/i.test(L.split('\n').filter(l => l.startsWith('SQL')).join('\n')))
    }
    const HJ = JSON.parse(read('scripts/harnesses.json'))
    t('the proof script stays operational-only (never in a sweep)', J(HJ).includes('db-rollback-proofs.cjs') && !HJ.harnesses.includes('db-rollback-proofs.cjs'))
  }

  // ══ F ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('F · THE WORDS — the receipt words and the new franchise note, en-GB and every language base an enabled country uses')
  {
    const EN = JSON.parse(read('messages/en-GB.json'))
    t('en-GB: "Receipt no. {n}", "Company no.", "Registration no.", "{label} no."', J(EN.charges.receipt) === J({ number: 'Receipt no. {n}', companyNumber: 'Company no.', registrationNumber: 'Registration no.', taxNumber: '{label} no.' }))
    t('en-GB: the Business details note now says what happens, and the old "you may want to set your VAT to 0 %" is gone', EN.manageSettings.business.regime.franchiseNote === 'Because you’ve chosen franchise en base, your receipts show “TVA non applicable” and no TVA is charged.' && !/0 %/.test(read('messages/en-GB.json').match(/"franchiseNote": "[^"]*"/)[0]))
    const UNUSED = require('./_lp-france-vat-1.cjs').UNUSED_BASES
    const bases = fs.readdirSync(path.join(REPO, 'messages')).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).filter(l => { const m = JSON.parse(read(`messages/${l}.json`)); return l !== 'en-GB' && m.manageSettings?.business?.regime })
    const bad = []
    for (const l of bases) {
      const m = JSON.parse(read(`messages/${l}.json`)), b = JSON.parse(read(`docs/i18n/back/${l}.json`))
      const r = m.charges?.receipt ?? {}, note = m.manageSettings.business.regime.franchiseNote
      if (!['number', 'companyNumber', 'registrationNumber', 'taxNumber'].every(k => typeof r[k] === 'string' && r[k].trim())) bad.push(`${l}: words`)
      if ((r.number?.match(/\{n\}/g) || []).length !== 1 || (r.taxNumber?.match(/\{label\}/g) || []).length !== 1) bad.push(`${l}: placeholders`)
      if (!/franchise en base/.test(note) || !/TVA non applicable/.test(note) || /0\s?%/.test(note)) bad.push(`${l}: note`)
      if (!['charges.receipt.number', 'charges.receipt.companyNumber', 'charges.receipt.registrationNumber', 'charges.receipt.taxNumber', 'manageSettings.business.regime.franchiseNote'].every(k => typeof b[k] === 'string' && b[k].trim())) bad.push(`${l}: back-translation`)
    }
    t(`${bases.length} language bases (every one an enabled country uses): the 4 receipt words with their placeholders, the new note keeping « franchise en base » and « TVA non applicable », and a back-translation of each`, bases.length === 54 && bad.length === 0 && !bases.some(l => UNUSED.includes(l)), { n: bases.length, bad })
    t('the 5 unused bases are left alone (no receipt words)', UNUSED.every(l => !JSON.parse(read(`messages/${l}.json`)).charges?.receipt))
    const FRm = JSON.parse(read('messages/fr-FR.json'))
    t('French: « Reçu n° {n} », « N° {label} » (→ « N° TVA »)', FRm.charges.receipt.number === 'Reçu n° {n}' && FRm.charges.receipt.taxNumber === 'N° {label}')
    const CARD = read('components/manage/BusinessDetailsCard.tsx')
    t('Business details shows the note whenever franchise en base is chosen (no rate condition; the old rate read is gone)', /const franchiseNote = showRegime && regime === 'franchise'\n/.test(CARD) && !/defaultRateOf/.test(CARD))
  }

  // ── --write-samples: the text renders for the report (docs/france-receipts-1/samples.txt) — never on a normal run ──
  if (process.argv.includes('--write-samples')) {
    const out = []
    const ticketText = lines => lines.map(l => l.divider ? '-'.repeat(32) : l.align === 'center' ? (l.text ?? '').padStart(Math.floor((32 + (l.text ?? '').length) / 2)) : (l.text ?? '')).join('\n')
    for (const [title, cc, opts, extra, business] of [
      ['(a) a VAT-registered French truck with full details (réel simplifié), a mixed-rate order', 'FR', {}, { receipt_no: 142, vat_regime: 'reel_simplifie' }, true],
      ['(b) a French truck under franchise en base (10 % default, a 20 % cider), the same order', 'FR', { franchise: true }, { receipt_no: 143, vat_regime: 'franchise' }, true],
      ['(c) a GB truck with no business details (no receipt number yet)', 'GB', {}, {}, false],
    ]) {
      const p = priced(H, cc, cc === 'FR' ? BASKETS.mixed : BASKETS.single, opts), row = rowOf(cc, p, extra)
      const facts = factsOf(cc, row, business)
      const mail = H.Mail.formatConfirmationEmail({ ...emailParams(cc, row), receipt: facts })
      const api = await apiOf(H, cc, row, business)
      const page = kit.textOf(pageOf(H, api.body)).text
      const tk = ticketOf(H, cc, row, business)
      out.push(`════ ${title} ════`, '', '── the confirmation email (its text part) ──', mail.text, '', '── the status page (its text) ──', page, '', '── the ticket, 58 mm ──', ticketText(H.T.buildTicketLines(tk, { paper_width: 58 })), '', '')
    }
    fs.writeFileSync(path.join(REPO, 'docs/france-receipts-1/samples.txt'), out.join('\n'))
    console.log('  wrote docs/france-receipts-1/samples.txt')
  }

  console.log(`\n${fail ? '🔴' : '✅'} france-receipts-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
