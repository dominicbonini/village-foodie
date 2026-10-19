#!/usr/bin/env node
// scripts/money-sweep-parity.cjs — every money string a UK truck, operator or customer sees, before and after
// Phase 2A (docs/money-sweep-report.md): no hand-typed £ left; every amount through lib/money-format.ts.
//
//   node scripts/money-sweep-parity.cjs                    check against the committed BEFORE snapshot (GBP)
//   node scripts/money-sweep-parity.cjs --capture <file>   write a snapshot of the current code
//   node scripts/money-sweep-parity.cjs --usd              render the SAME fixtures for a USD order/truck
//
// ── 🔴 THE METHOD (Part B's, applied to orders) ──────────────────────────────────────────────────────
// The BEFORE snapshot was taken from the unchanged code, before the first edit of this phase, and is
// committed as scripts/fixtures/money-sweep-before.json. The AFTER run renders the same fixtures through the
// same entry points and every byte must match. The ONE allowed difference is the /compare gate (that page is
// proved by scripts/country-settings-parity.cjs and compare-no-system.cjs, not here).
//
// ── WHAT IS RENDERED ─────────────────────────────────────────────────────────────────────────────────
// Real modules and real components, bundled with esbuild for node; NOTHING reaches a database or the
// network. Emails are rendered by the real formatters and, for the three that send, captured from a
// stubbed fetch that answers "ok" — no email is sent. Tickets are the exact ESC/POS bytes the printer is
// sent (Bluetooth and wired share renderTicket; the transport only carries the bytes). Pages that load
// their data in effects are rendered with their state defaults patched to fixtures, and every patch must
// apply — a replace that finds nothing would silently measure an empty page.
//
// Fixture orders (amounts chosen to exercise float sums and a four-figure total): card paid, card held, pay
// at hatch, part paid, refunded, part refunded, cancelled, edited up, edited down, and a £1,234.56 order.
//
// ── THE SURFACES (15 sections, 3,057 strings and byte streams) ────────────────────────────────────────
//   emails     every formatter and sender in lib/email.ts, HTML and text, every case
//   tickets    mapOrderToTicket → buildTicketLines + renderTicket bytes, 58 mm and 80 mm
//   components OrderCard (dashboard and kitchen), OrderLineItem, PaymentActionsModal, DealsModal
//   pricing    describeRule, the rounding phrase, summarisePricing, the event-price note, the mode and
//              rounding labels, formatModifiers, PriceCell in its four states
//   prompts    the two AI prompts as sent (classifier + menu answer, menu extraction) and the two replies
//   receipt    /order/[id]/manage for every case          orderPage  menu, basket, sheets, payment, item
//   kds        the kitchen board and its Done strip                   options, both confirmations
//   addOrder   the Add Order panel, five states            dashboard  completed list, cancel / reject /
//   reports    Reports orders + items tables, BOTH CSVs              edit modals, Menu & Stock prices,
//   manage     menu list, item editor, both import pages,             and the refund sentences
//              deals, schedule's deal list, the Extras editor
//   devTicket  /dev/ticket-preview                         eventTypes the Event types grid's Item prices
// Pages are rendered WITHOUT a harness money provider, so a page that forgot to provide its own format
// shows bare figures and fails; only standalone leaf components get one (their page's job). Manage-page
// components sit in CountrySettingsProvider fed the seed row, exactly as the manage page feeds them.

// ── RE-PINNED FOR LANGUAGE PHASE 2 (docs/language-phase-2-report.md) ─────────────────────────────────────────
// This harness's BEFORE snapshot was rendered with the words as they stood before Language Phase 2, and what it proves
// is the CODE's behaviour, not the wording. Phase 2 changes words on purpose (US English in messages/en-US.json, the
// wrong-English fixes in messages/en-GB.json) — proven by scripts/language-phase-2.cjs — so this run renders with the
// pre-Phase-2 words (HG_MESSAGES_FROZEN, scripts/_lp2-frozen.cjs: the current keys at their 460ba55 text) and keeps
// asserting exactly what it asserted. A capture reads the catalogue as it is.
if (!process.argv.includes('--capture') && !('HG_MESSAGES_FROZEN' in process.env)) process.env.HG_MESSAGES_FROZEN = 'scripts/fixtures/language-phase-2-messages-before.json'
const fs = require('fs'); const path = require('path')
const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const argv = process.argv.slice(2)
const CAPTURE = argv.includes('--capture') ? argv[argv.indexOf('--capture') + 1] : null
const USD = argv.includes('--usd')
const BEFORE_FILE = 'scripts/fixtures/money-sweep-before.json'
const CACHE = path.join(REPO, 'node_modules/.cache/money-sweep')
fs.mkdirSync(CACHE, { recursive: true })

// The money format each run uses — GB (the UK, byte-identical) or US (the proof that nothing says £).
const FMT = USD ? { currency: 'USD', locale: 'en-US' } : { currency: 'GBP', locale: 'en-GB' }
const COUNTRY = USD ? 'US' : 'GB'

// ── A FROZEN CLOCK. "12m late", "today" and printed times would otherwise change from run to run. Every
// render sees 9 Oct 2026, 18:20 in London (17:20 UTC), ten minutes before the fixture orders' slot.
process.env.TZ = 'Europe/London'
const FIXED_NOW = Date.parse('2026-10-09T17:20:00.000Z')
const RealDate = Date
globalThis.Date = class extends RealDate {
  constructor(...a) { super(...(a.length ? a : [FIXED_NOW])) }
  static now() { return FIXED_NOW }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// BUNDLING (the same machinery as country-settings-parity.cjs)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const NAV_STUB = `export const useRouter = () => ({ push(){}, replace(){}, refresh(){}, back(){}, prefetch(){} })
export const usePathname = () => '/'
export const useSearchParams = () => new URLSearchParams(globalThis.__msSearch || '')
export const useParams = () => ({ id: 'harness-order', slug: 'test-kitchen', token: 'harness' })
export const notFound = () => { throw new Error('notFound') }
export const redirect = () => { throw new Error('redirect') }`

// ── STARTING A PAGE IN A GIVEN STATE. A patch {file, states: ['truck', 'loading', …]} wraps each named
// `const [x, setX] = useState<T>(init)` as `__msUse('x', useState<T>(init))`: the hook still runs (hook order
// is untouched), and when globalThis.__ms holds a value for 'x' the render starts from it. Every name must be
// found, or the bundle fails — a state that silently stopped matching would quietly snapshot nothing.
const MS_USE = "const __msUse = (k, p) => (globalThis.__ms && Object.prototype.hasOwnProperty.call(globalThis.__ms, k) ? [globalThis.__ms[k], p[1]] : p);\n"
function wrapStates(src, names, file) {
  for (const name of names) {
    const re = new RegExp(`const\\s*\\[\\s*${name}\\s*,\\s*\\w+\\s*\\]\\s*=\\s*useState`, 'g')
    let m, hits = 0, out = '', last = 0
    while ((m = re.exec(src))) {
      let i = m.index + m[0].length
      const callStart = i - 'useState'.length
      if (src[i] === '<') {       // skip a generic, counting brackets but not the '>' of '=>'
        let d = 0
        for (; i < src.length; i++) {
          if (src[i] === '<') d++
          else if (src[i] === '>' && src[i - 1] !== '=') { d--; if (d === 0) { i++; break } }
        }
      }
      if (src[i] !== '(') throw new Error(`[${file}] useState for '${name}' has no call after it`)
      let d = 0, q = null
      for (; i < src.length; i++) {
        const c = src[i]
        if (q) { if (c === '\\') i++; else if (c === q) q = null; continue }
        if (c === "'" || c === '"' || c === '`') q = c
        else if (c === '(') d++
        else if (c === ')') { d--; if (d === 0) { i++; break } }
      }
      out += src.slice(last, callStart) + `__msUse('${name}', ` + src.slice(callStart, i) + ')'
      last = i; hits++
    }
    if (!hits) throw new Error(`[${file}] no useState found for '${name}'`)
    src = out + src.slice(last)
  }
  return src
}

let bundleN = 0
async function bundle(tag, entry, { patches = [], define = {} } = {}) {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const applied = new Map(patches.map((p, i) => [i, false]))
  const plugin = {
    name: 'money-sweep',
    setup(b) {
      // the frozen catalogue switch (Language Phase 2): message imports → the generated files, when it is on
      b.onResolve({ filter: /(^|\/)messages\/(ns\/)?en-(GB|US)(\/[A-Za-z0-9]+)?\.json$/ }, a => { const abs = require('./_lp2-frozen.cjs').resolveMessages(a.path); return abs ? { path: abs } : undefined })
      b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'stub' }))
      b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'nav', namespace: 'stub' }))
      // next/image and next/link reach node as CommonJS objects, not components; a plain <img>/<a> stands in.
      b.onResolve({ filter: /^next\/(image|link)$/ }, a => ({ path: a.path, namespace: 'stub' }))
      // 🔴 NO DATABASE CLIENT IS EVER BUILT HERE. The service-role module is replaced by one that throws if
      // anything touches it, so a render that would have reached the database fails loudly instead.
      b.onResolve({ filter: /(^@\/|\/)lib\/supabase(\.ts)?$/ }, () => ({ path: 'db', namespace: 'stub' }))
      // Modules that build their own client at load (lib/whatsapp-classifier.ts) get the database library
      // itself replaced: every export is a function returning the same throwing stand-in.
      b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'dblib', namespace: 'stub' }))
      b.onLoad({ filter: /.*/, namespace: 'stub' }, a => ({
        contents: a.path === 'nav' ? NAV_STUB
          : a.path === 'next/image' ? "import { createElement } from 'react'\nexport default function Image(p) { return createElement('img', { alt: p.alt, src: typeof p.src === 'string' ? p.src : '' }) }"
          : a.path === 'next/link' ? "import { createElement } from 'react'\nexport default function Link({ href, children, className }) { return createElement('a', { href: typeof href === 'string' ? href : '', className }, children) }"
          : a.path === 'db' ? "export const supabase = new Proxy({}, { get() { throw new Error('no database in this harness') } })"
          : a.path === 'dblib' ? "const none = new Proxy({}, { get() { throw new Error('no database in this harness') } })\nmodule.exports = Object.create(new Proxy({}, { get: (_, k) => (typeof k === 'symbol' ? undefined : () => globalThis.__harnessDb || none) }))"
          : '',
        loader: 'js',
      }))
      const files = [...new Set(patches.map(p => path.join(REPO, p.file)))]
      for (const abs of files) {
        const esc = abs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        b.onLoad({ filter: new RegExp('^' + esc + '$') }, () => {
          let src = fs.readFileSync(abs, 'utf8')
          patches.forEach((p, i) => {
            if (path.join(REPO, p.file) !== abs) return
            if (p.states) { src = wrapStates(src, p.states, p.file) + '\n' + MS_USE; applied.set(i, true); return }
            if (p.append) { src += '\n' + p.append + '\n'; applied.set(i, true); return }
            const from = p.from instanceof RegExp ? p.from : null
            if (from ? from.test(src) : src.includes(p.from)) { src = from ? src.replace(from, p.to) : src.replace(p.from, p.to); applied.set(i, true) }
          })
          return { contents: src, loader: abs.endsWith('x') ? 'tsx' : 'ts' }
        })
      }
    },
  }
  const res = await esbuild.build({
    stdin: { contents: entry, resolveDir: REPO, loader: 'tsx' },
    bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', target: 'node20',
    logLevel: 'silent', alias: { '@': REPO },
    loader: { '.css': 'empty', '.svg': 'text', '.png': 'empty', '.jpg': 'empty' },
    external: ['react', 'react-dom', 'react/jsx-runtime', 'next', 'next/*', 'puppeteer-core', '@sparticuz/chromium'],
    define: { 'process.env.NODE_ENV': '"development"', 'process.env.NEXT_PUBLIC_PRICING_PUBLISHED': '"true"', ...define },
    plugins: [plugin],
  })
  patches.forEach((p, i) => {
    if (!applied.get(i) && !p.optional) throw new Error(`[${tag}] a patch did not apply in ${p.file}: ${String(p.from || p.append).slice(0, 140)}`)
  })
  const out = path.join(CACHE, `${tag}-${bundleN++}.cjs`)
  fs.writeFileSync(out, res.outputFiles[0].text)
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:9'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'harness-anon'
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:9'
  const q = [console.error, console.warn, console.log]
  console.error = () => {}; console.warn = () => {}; console.log = () => {}
  try { return require(out) } finally { [console.error, console.warn, console.log] = q }
}
const React = () => require(path.join(REPO, 'node_modules/react'))
const h = (...a) => React().createElement(...a)
function renderStatic(el) {
  const { renderToStaticMarkup } = require(path.join(REPO, 'node_modules/react-dom/server'))
  const q = [console.error, console.warn, console.log]
  console.error = () => {}; console.warn = () => {}; console.log = () => {}
  try { return renderToStaticMarkup(el) } finally { [console.error, console.warn, console.log] = q }
}
function textOf(html) {
  const ents = s => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&pound;/g, '£')
  const attrs = [...html.matchAll(/\s(value|placeholder|aria-label|title|alt|href)="([^"]*)"/g)].map(m => `${m[1]}=${ents(m[2])}`)
  return { text: ents(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(), attrs }
}
// The manage page provides the truck's country row through CountrySettingsProvider (Part B); a manage
// component rendered alone gets the same, fed this run's seed row. The provider must come from the SAME
// bundle as the component (each bundle has its own copy of the context).
const PROVIDER_EXPORT = `export { CountrySettingsProvider } from '@/components/CountrySettingsProvider'\n`
const seedSettings = () => { const seed = require('./_country-settings-gb.cjs'); return USD ? seed.usFromSeed() : seed.gbFromSeed() }
const inManage = (m, el) => h(m.CountrySettingsProvider, { settings: seedSettings() }, el)
const MONEY_CTX = 'components/MoneyContext.tsx'
const hasMoneyCtx = () => fs.existsSync(path.join(REPO, MONEY_CTX))
const moneyCtxExport = () => (hasMoneyCtx() ? `export { MoneyProvider } from '@/components/MoneyContext'\n` : '')
const withMoney = (m, el, fmt = FMT) => (m.MoneyProvider ? h(m.MoneyProvider, { fmt }, el) : el)

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// FIXTURES
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const ITEMS = [
  { name: 'Margherita', quantity: 2, unit_price: 10.75, base_price: 9.5, modifiers: [{ name: 'Extra cheese', price: 1.25 }] },
  { name: 'Garlic bread', quantity: 1, unit_price: 4, modifiers: [] },
  { name: 'Coke', quantity: 3, unit_price: 1.8, modifiers: [], specialInstructions: 'No ice' },
]
const DEALS = [{ name: 'Lunch deal', price: 12, slots: { Pizza: 'Pepperoni', Drink: 'Fanta' }, slotModifiers: { Pizza: [{ name: 'Jalapeños', price: 0.75 }] }, slotNotes: {} }]
const BASE_TOTAL = 43.9   // 21.50 + 4 + 5.40 + 12.00 + 0.75 (bundle mods ride on top) ≈ 43.65 → shown as the order says
const ch = (minor, channel = 'online', kind = 'charge', method = 'card') => ({ kind, channel, amount_minor: minor, state: 'succeeded', method, external_ref: kind === 'charge' && channel === 'online' ? 'pi_harness' : null, livemode: true })
const ORDER_CASES = {
  card_paid:     { total: BASE_TOTAL, ledger: [ch(4390)], held: false, state: 'captured', status: 'confirmed' },
  card_held:     { total: BASE_TOTAL, ledger: [], held: true, state: 'held', status: 'pending' },
  pay_at_hatch:  { total: BASE_TOTAL, ledger: [], held: false, state: 'hatch', status: 'confirmed' },
  part_paid:     { total: BASE_TOTAL, ledger: [ch(2000, 'in_person_other', 'charge', 'cash')], held: false, state: 'part_paid', status: 'ready' },
  refunded:      { total: BASE_TOTAL, ledger: [ch(4390), ch(4390, 'online', 'refund')], held: false, state: 'captured', status: 'cancelled' },
  part_refunded: { total: BASE_TOTAL, ledger: [ch(4390), ch(1000, 'online', 'refund')], held: false, state: 'captured', status: 'collected' },
  cancelled:     { total: BASE_TOTAL, ledger: [], held: false, state: 'hatch', status: 'cancelled' },
  edited_up:     { total: 52.4, ledger: [ch(4390, 'in_person_other', 'charge', 'card')], held: false, state: 'part_paid', status: 'confirmed' },
  edited_down:   { total: 39.9, ledger: [ch(4390, 'in_person_other', 'charge', 'card')], held: false, state: 'captured', status: 'confirmed' },
  big:           { total: 1234.56, ledger: [ch(123456)], held: false, state: 'captured', status: 'confirmed' },
}
const at = '2026-10-09T17:30:00.000Z'
function orderOf(key, c, i) {
  return {
    id: String(40 + i), order_key: `00000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`,
    customer_name: 'Sam Harness', customer_phone: '07700 900123', customer_email: 'sam@example.test',
    slot: '18:30', event_date: '2026-10-09', event_id: 'ev-1', van_id: null, status: c.status,
    items: ITEMS.map(x => ({ ...x })), deals: DEALS.map(d => ({ ...d })), total: c.total, total_minor: Math.round(c.total * 100),
    notes: 'Ring the bell', paid_at: null, collected_at: null, created_at: at, updated_at: at, placed_at: at,
    payment_status: c.state === 'captured' ? 'paid' : c.state === 'part_paid' ? 'part_paid' : 'unpaid',
    order_type: 'collection', buzzer_number: null, currency: FMT.currency, country: COUNTRY,
  }
}
const ORDERS = Object.fromEntries(Object.entries(ORDER_CASES).map(([k, c], i) => [k, orderOf(k, c, i)]))
const TRUCK = {
  id: 'test-truck', name: 'Pizza Kitchen', slug: 'test-kitchen', mode: 'village', venue_name: 'The Green', logo: null,
  dashboard_token: 'harness', currency: FMT.currency, country: COUNTRY, plan: 'pro', show_paid_step: true,
  completion_presses: 'two', takes_cash: true, auto_accept: false, kds_mode: false,
  money: { ...FMT, localeByCountry: { [COUNTRY]: FMT.locale } },
}
const EVENT = { id: 'ev-1', date: '2026-10-09', venue_name: 'The Green', town: 'Harnessville', start_time: '17:00', end_time: '21:00', van_id: null }

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · EMAILS — every formatter, every case; the three senders captured from a stubbed fetch
// ══════════════════════════════════════════════════════════════════════════════════════════════════
async function emailsView() {
  const m = await bundle('email', `export * as E from '@/lib/email'`)
  const { E } = m
  const out = {}
  const emailItems = ITEMS.map(x => ({ name: x.name, quantity: x.quantity, unit_price: x.unit_price, modifiers: x.modifiers, specialInstructions: x.specialInstructions }))
  const emailDeals = DEALS.map(d => ({ ...d }))
  out.lines = E.renderOrderLinesHtml(emailItems, emailDeals, FMT)
  for (const [k, c] of Object.entries(ORDER_CASES)) {
    const paid = c.ledger.filter(r => r.kind === 'charge').reduce((s, r) => s + r.amount_minor, 0) - c.ledger.filter(r => r.kind === 'refund').reduce((s, r) => s + r.amount_minor, 0)
    const totalMinor = Math.round(c.total * 100)
    const amounts = { paidMinor: paid, balanceMinor: Math.max(0, totalMinor - paid), heldMinor: c.held ? 2000 : undefined }
    for (const variant of ['confirmation', 'ready']) {
      out[`confirm|${k}|${variant}`] = E.formatConfirmationEmail({
        orderId: ORDERS[k].id, orderKey: ORDERS[k].order_key, truckName: 'Pizza Kitchen', customerName: 'Sam', slot: '18:30',
        items: emailItems, deals: emailDeals, discountAmt: k === 'edited_down' ? 2.5 : 0, total: c.total, notes: 'Ring the bell',
        cardHeld: c.held, paymentState: c.state, paidMinor: amounts.paidMinor, balanceMinor: amounts.balanceMinor, heldMinor: amounts.heldMinor,
        venueName: 'The Green', venueTown: 'Harnessville', allowCancellation: true, cancellationCutoffMins: 30,
        baseUrl: 'https://www.hatchgrab.com', truckSlug: 'test-kitchen', variant, money: FMT,
      })
    }
    out[`new|${k}`] = E.formatNewOrderEmail({ orderId: ORDERS[k].id, customerName: 'Sam', customerPhone: '07700 900123', slot: '18:30', items: emailItems, deals: emailDeals, total: c.total, notes: null, venueName: 'The Green', venueTown: 'Harnessville', autoAccepted: k === 'card_paid', money: FMT })
    for (const st of ['captured', 'part_paid', 'held', 'held_short', 'unknown', 'hatch']) out[`note|${k}|${st}`] = E.paymentNote(st, 'Pizza Kitchen', { ...amounts, heldMinor: 2000 }, FMT)
  }
  out.cancelRefunded = E.cancellationPaymentSentence({ truckName: 'Pizza Kitchen', paymentState: 'captured', refundedMinor: 4390, money: FMT })
  out.cancelDeclined = E.cancellationPaymentSentence({ truckName: 'Pizza Kitchen', paymentState: 'captured', refundDeclined: true, money: FMT })
  out.cancelHeld = E.cancellationPaymentSentence({ truckName: 'Pizza Kitchen', paymentState: 'held', money: FMT })
  out.reject = ['held', 'hatch', 'captured'].map(s => E.rejectionPaymentSentence({ truckName: 'Pizza Kitchen', paymentState: s, holdReleased: true, money: FMT }))
  // The senders: fetch is stubbed BEFORE they run, so the body is captured and nothing leaves this process.
  const sent = []
  const realFetch = globalThis.fetch
  const realKey = process.env.BREVO_API_KEY
  process.env.BREVO_API_KEY = 'harness-not-a-key'
  globalThis.fetch = async (_url, init) => { sent.push(JSON.parse(init.body)); return { ok: true, text: async () => '' } }
  try {
    await E.sendRefundEmail({ to: 'sam@example.test', customerName: 'Sam', orderId: '41', truckName: 'Pizza Kitchen', amountMinor: 4390, chargedMinor: 4390, money: FMT })
    await E.sendRefundEmail({ to: 'sam@example.test', customerName: 'Sam', orderId: '41', truckName: 'Pizza Kitchen', amountMinor: 1000, chargedMinor: 4390, money: FMT })
    await E.sendCancellationEmail({ to: 'sam@example.test', customerName: 'Sam', orderId: '41', truckName: 'Pizza Kitchen', reason: 'Sold out', paymentStatus: 'paid', paymentState: 'captured', refundedMinor: 4390, money: FMT })
    await E.sendCancellationEmail({ to: 'sam@example.test', customerName: 'Sam', orderId: '41', truckName: 'Pizza Kitchen', reason: null, paymentStatus: 'unpaid', paymentState: 'hatch', money: FMT })
  } finally { globalThis.fetch = realFetch; if (realKey === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = realKey }
  out.sent = sent.map(b => ({ subject: b.subject, html: b.htmlContent, text: b.textContent }))
  return out
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · TICKETS — the exact ESC/POS bytes, 58 mm and 80 mm
// ══════════════════════════════════════════════════════════════════════════════════════════════════
async function ticketsView() {
  const m = await bundle('ticket', `export * as T from '@/lib/printing/ticket'\nexport * as MAP from '@/lib/printing/mapOrderToTicket'`)
  const out = {}
  for (const [k, c] of Object.entries(ORDER_CASES)) {
    const t = m.MAP.mapOrderToTicket({ order: ORDERS[k], truck: TRUCK, event: EVENT, ledgerRows: c.ledger, printedLabel: '18:37', heldAuthorisation: c.held, money: FMT })
    for (const paper of [58, 80]) {
      const cfg = { paper_width: paper, show_phone: true }
      out[`${k}|${paper}`] = {
        lines: m.T.buildTicketLines(t, cfg).map(l => l.text),
        bytes: Buffer.from(m.T.renderTicket(t, cfg)).toString('hex'),
      }
    }
  }
  return out
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · DASHBOARD COMPONENTS — OrderCard (dashboard and KDS), OrderLineItem, PaymentActionsModal, DealsModal
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const BUNDLES = [{ name: 'Lunch deal', description: 'Any pizza and a drink', bundle_price: 12, original_price: 14.3,
  slot_1_category: 'Pizzas', slot_2_category: 'Drinks', slot_3_category: null, slot_4_category: null, slot_5_category: null, slot_6_category: null }]
const MENU_ITEMS = [
  { id: 'i1', name: 'Margherita', price: 9.5, category: 'Pizzas', available: true, modifierGroups: [{ id: 'g1', name: 'Extras', min_selections: 0, max_selections: 3, options: [{ id: 'o1', name: 'Extra cheese', price_adjustment: 1.25 }, { id: 'o2', name: 'Jalapeños', price_adjustment: 0.75 }] }] },
  { id: 'i2', name: 'Pepperoni', price: 11, category: 'Pizzas', available: true, modifierGroups: [] },
  { id: 'i3', name: 'Coke', price: 1.8, category: 'Drinks', available: true, modifierGroups: [] },
  { id: 'i4', name: 'Fanta', price: 1.8, category: 'Drinks', available: true, modifierGroups: [] },
]
async function componentsView() {
  const out = {}
  const m = await bundle('cards', `export * from '@/components/dashboard/OrderCard'\nexport * from '@/components/dashboard/OrderLineItem'\nexport * from '@/components/dashboard/PaymentActionsModal'\nexport * from '@/components/dashboard/DealsModal'\n` + moneyCtxExport())
  for (const [k, c] of Object.entries(ORDER_CASES)) {
    for (const kdsMode of [false, true]) {
      out[`card|${k}|kds=${kdsMode}`] = textOf(renderStatic(withMoney(m, h(m.OrderCard, {
        order: ORDERS[k], truck: TRUCK, event: EVENT, slots: [], actionLoading: null, onAction() {}, onRefund: async () => ({ ok: true }), onEdit() {},
        kdsMode, viewMode: 'solo', ledgerRows: c.ledger, heldAuthorisation: c.held, effectiveOrderReady: true, readyStepOn: true, vanTakesCash: true,
      }))))
    }
  }
  for (const variant of ['operator', 'customer']) {
    out[`line|${variant}`] = textOf(renderStatic(withMoney(m, h(m.OrderLineItem, { name: 'Margherita', quantity: 2, unitPrice: 10.75, basePrice: 9.5, modifiers: [{ name: 'Extra cheese', price: 1.25 }], specialInstructions: 'Well done', variant }))))
  }
  out.pay = textOf(renderStatic(withMoney(m, h(m.PaymentActionsModal, { open: true, onClose() {}, orderId: '41', orderKey: 'k', paidMinor: 4390, cardChargeMinor: 4390, refundedMinor: 1000, charges: [{ channel: 'online', method: 'card', amountMinor: 4390 }], hasReversibleInPersonPayment: false, onUndoPayment() {}, onRefund: async () => ({ ok: true }) }))))
  out.deals = textOf(renderStatic(withMoney(m, h(m.DealsModal, { bundles: BUNDLES, menuItems: MENU_ITEMS, basketItems: [{ name: 'Margherita', quantity: 1, unit_price: 10.75, cartKey: 'm1', modifiers: [{ name: 'Extra cheese', price: 1.25 }] }], menuCategories: [{ name: 'Pizzas' }, { name: 'Drinks' }], onApply() {}, onClose() {} }))))
  return out
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · EVENT PRICING, THE TWO AI PROMPTS, formatModifiers
// ══════════════════════════════════════════════════════════════════════════════════════════════════
async function pricingView() {
  const m = await bundle('pricing', `export * as P from '@/lib/event-pricing/price'\nexport * as S from '@/lib/copy/serviceSettings'\nexport * as C from '@/lib/order-calculations'\nexport * from '@/components/shared/PriceControls'\n` + moneyCtxExport())
  const out = {}
  const sym = USD ? '$' : '£'
  const setups = [['add_amount', 1.5], ['sub_amount', 2], ['add_amount', 1], ['add_amount', 1000], ['add_pct', 10], ['sub_pct', 12.5], ['none', 0], ['add_gbp', 0.5]]
  out.describe = setups.map(([mode, amount]) => m.P.describeRule({ mode, amount, rounding: 'nearest_1', typed: {} }, FMT))
  if (m.P.ROUNDING_PHRASE) out.rounding = m.P.ROUNDING_PHRASE
  else out.rounding = Object.fromEntries(['none', 'nearest_1', 'up_1'].map(r => [r, m.P.roundingPhrase(r, FMT)]))
  out.summaries = [
    m.P.summarisePricing({ typeSetup: { mode: 'add_amount', amount: 1.5, rounding: 'nearest_1', typed: {} } }, 'Festival', 3, FMT),
    m.P.summarisePricing({ typeSetup: { mode: 'sub_amount', amount: 1000, rounding: 'up_1', typed: { a: 1 } } }, null, 0, FMT),
    m.P.summarisePricing({ typeSetup: { mode: 'add_pct', amount: 10, rounding: 'none', typed: { a: 1 } } }, 'Wedding', 1, FMT),
  ]
  // Before the sweep this took the symbol; after, the truck's format. A String object carrying both serves
  // either signature unchanged ("£" when interpolated, .currency/.locale when read).
  const symOrFmt = Object.assign(new String(sym), FMT)
  out.ownNote = [m.S.eventPriceOwnNote(12, null, symOrFmt), m.S.eventPriceOwnNote(9.5, 'Festival', symOrFmt)]
  out.choices = [m.S.priceModeChoices(sym).map(c => c.label), m.S.priceRoundingChoices(sym).map(c => c.label)]
  out.modifiers = m.C.formatModifiers([{ name: 'Extra cheese', price: 1.25 }, { name: 'No onion', price: 0 }], FMT)
  if (m.PriceCell) {
    const rule = { mode: 'add_amount', amount: 1.5, rounding: 'none', typed: {} }
    for (const [label, props] of [
      ['menu', { menuPrice: 11.5, setup: null, typed: null }],
      ['rule', { menuPrice: 11.5, setup: rule, typed: null }],
      ['typed-up', { menuPrice: 11.5, setup: rule, typed: 13 }],
      ['typed-down', { menuPrice: 11.5, setup: rule, typed: 10 }],
    ]) out[`cell|${label}`] = textOf(renderStatic(withMoney(m, h(m.PriceCell, { ...props, itemId: 'i1', onType() {}, onClear() {}, label: 'Price', showDiff: true, currencySymbol: sym, money: FMT }))))
  }
  return out
}

// An in-memory stand-in for the query builder: every chain resolves to the fixture rows for its table.
function fakeDb(tables) {
  const chain = t => {
    const c = { then: (res, rej) => Promise.resolve({ data: tables[t] || [], error: null }).then(res, rej) }
    for (const k of ['select', 'eq', 'in', 'order', 'neq', 'is', 'limit']) c[k] = () => c
    return c
  }
  return { from: chain }
}
const DB_TABLES = {
  menu_items_db: [
    { name: 'Margherita', category_id: 'c1', price: 9.5, is_available: true, allergens: ['Dairy', 'Gluten'], dietary_info: ['Vegetarian'], menu_categories: { name: 'Pizzas' } },
    { name: 'Pepperoni', category_id: 'c1', price: 11, is_available: null, allergens: [], dietary_info: [], menu_categories: { name: 'Pizzas' } },
    { name: 'Garlic bread', category_id: 'c2', price: 4, is_available: true, allergens: [], dietary_info: [], menu_categories: { name: 'Sides' } },
    { name: 'Coke', category_id: 'c3', price: 1.8, is_available: true, allergens: [], dietary_info: [], menu_categories: { name: 'Drinks' } },
  ],
  menu_categories: [{ id: 'c1', name: 'Pizzas' }, { id: 'c2', name: 'Sides' }, { id: 'c3', name: 'Drinks' }],
  modifier_groups: [{ id: 'g1', name: 'Extras', is_required: false, min_choices: 0, max_choices: 3 }],
  modifier_options: [{ name: 'Extra cheese', group_id: 'g1' }],
}

async function promptsView() {
  const out = { replies: {} }
  const prompts = []
  const S = USD ? '$' : '£'
  let llmReply = ''
  const realFetch = globalThis.fetch
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body)
    const text = body.contents[0].parts[0].text
    prompts.push(text)
    const answer = text.startsWith('Classify') ? 'MENU_QUERY'
      : text.startsWith('You are a menu digitisation') ? JSON.stringify({ categories: ['Pizzas'], items: [{ name: 'Margherita', price: 9.5, category: 'Pizzas' }] })
      : llmReply
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: answer }] } }] }), text: async () => answer }
  }
  globalThis.__harnessDb = fakeDb(DB_TABLES)
  try {
    const m = await bundle('prompts', `export * as W from '@/lib/whatsapp-classifier'\nexport * as X from '@/lib/menu-extract'`)
    const ask = { customerMessage: 'how much is a margherita', truckName: 'Pizza Kitchen', truckEmoji: '🍕', truckId: 'test-truck', orderUrl: 'https://hatchgrab.test/order/test-kitchen', scheduleUrl: 'https://hatchgrab.test/s', events: [], money: FMT }
    // A reply quoting a real price (kept), one quoting an invented price (replaced by the fixed summary).
    for (const [k, r] of [['quotesReal', `Hey there 👋 Our Margherita is ${S}9.50. Order here: https://hatchgrab.test/order/test-kitchen — Pizza Kitchen 🍕`],
                          ['quotesInvented', `Hey there 👋 Our Margherita is ${S}8.00. — Pizza Kitchen 🍕`]]) {
      llmReply = r
      try { out.replies[k] = await m.W.generateWhatsAppReply(ask) } catch (e) { out.replies[k] = 'ERROR ' + String(e.message || e).slice(0, 200) }
    }
    try { out.extracted = await m.X.extractMenu(fakeDb(DB_TABLES), { id: 'test-truck', name: 'Pizza Kitchen', money: FMT }, { text: `Margherita ${S}9.50` }) } catch (e) { out.extractError = String(e.message || e).slice(0, 200) }
  } finally { globalThis.fetch = realFetch; delete globalThis.__harnessDb }
  out.prompts = prompts
  return out
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// 6 · PAGES — rendered once, started in a fixture state (see wrapStates)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
function renderWith(state, el) {
  globalThis.__ms = state
  try { return textOf(renderStatic(el)) } finally { delete globalThis.__ms }
}
async function receiptView() {
  const F = 'app/order/[id]/manage/page.tsx'
  const m = await bundle('receipt', `export { default as Receipt } from '@/${F}'\n` + moneyCtxExport(), { patches: [{ file: F, states: ['order', 'loading'] }] })
  const out = {}
  for (const k of Object.keys(ORDER_CASES)) {
    const order = { ...ORDERS[k], truck_name: 'Pizza Kitchen', venue_name: 'The Green', allow_cancellation: true, cancellation_cutoff_mins: 30, money: FMT }
    out[k] = renderWith({ order, loading: false }, h(m.Receipt))
  }
  return out
}

// The customer order page: the menu, the basket, the details sheet, the payment sheet, an item's options,
// the confirmation (straight after ordering, and the ?confirm= receipt a card payment lands on).
const OP_BUNDLE = { ...BUNDLES[0], original_price: null, available: true, start_time: null, end_time: null }
const OP_MENU = {
  categories: [{ id: 'c1', name: 'Pizzas' }, { id: 'c3', name: 'Drinks' }, { id: 'c2', name: 'Sides' }],
  items: [
    { ...MENU_ITEMS[0], description: 'Tomato, mozzarella, basil', subcategory_id: null },
    { ...MENU_ITEMS[1], subcategory_id: null },
    { name: 'Garlic bread', price: 4, category: 'Sides', available: true, modifierGroups: [] },
    { ...MENU_ITEMS[2] }, { ...MENU_ITEMS[3] },
  ],
  upsell_rules: [], bundles: [OP_BUNDLE], codes: [{ code: 'TENOFF', type: 'fixed', value: 2.5, active: true }],
}
const OP_TRUCK = { id: 'test-truck', name: 'Pizza Kitchen', logo: null, mode: 'village', venue_name: null, time_selection_enabled: true, paused: false, plan: 'pro', ordering_available: true, card_payments_ready: true, money: FMT,
  // Phase 2C: /api/menu now sends the phone box's copy — the GB row's, from its migration (never typed here).
  phone: (() => { const c = require('./_country-settings-gb.cjs').phoneCopyFromMigration().GB; return { phoneCountry: 'GB', short_name: c.shortName, phone_example: c.phoneExample, phoneCheck: require('./_country-settings-gb.cjs').phoneCheckDefault() } })() }
const OP_EVENT = { id: 'ev-1', date: '09/10/2026', date_iso: '2026-10-09', date_friendly: 'Friday 9 October', start_time: '17:00', end_time: '21:00', venue_name: 'The Green', village: 'Harnessville', notes: '', status: 'open', collection_interval_mins: 10 }
const opItem = name => OP_MENU.items.find(i => i.name === name)
const OP_BASKET = [
  { menuItem: opItem('Margherita'), quantity: 2, modifiers: [{ name: 'Extra cheese', price: 1.25 }], specialInstructions: '', cartKey: 'k1' },
  { menuItem: opItem('Garlic bread'), quantity: 1, modifiers: [], specialInstructions: '', cartKey: 'k2' },
  { menuItem: opItem('Coke'), quantity: 3, modifiers: [], specialInstructions: 'No ice', cartKey: 'k3' },
  { menuItem: opItem('Pepperoni'), quantity: 1, modifiers: [{ name: 'Jalapeños', price: 0.75 }], specialInstructions: '', cartKey: 'k4' },
  { menuItem: opItem('Fanta'), quantity: 1, modifiers: [], specialInstructions: '', cartKey: 'k5' },
]
const OP_DEALS = [{ bundle: OP_BUNDLE, slots: { Pizzas: 'Pepperoni', Drinks: 'Fanta' }, itemsTakenFromBasket: ['k4', 'k5'], modifierExtra: 0.75, slotModifiers: { Pizzas: [{ name: 'Jalapeños', price: 0.75 }] }, slotNotes: {} }]
async function orderPageView() {
  const F = 'app/trucks/[slug]/order/page.tsx'
  const states = ['truck', 'menu', 'events', 'event', 'eventLoading', 'loading', 'basket', 'appliedDeals', 'formSheetOpen', 'stageOpen',
    'payment', 'payStage', 'appliedCode', 'itemModal', 'modalMods', 'submitted', 'submittedOrderId', 'confirmOrder', 'confirmLoading', 'name', 'email', 'payByCard']
  const m = await bundle('orderpage', `export { default as OrderPage } from '@/${F}'\n` + moneyCtxExport(), {
    patches: [{ file: F, states }, { file: F, from: 'const { slug } = use(params)', to: 'const { slug } = params' }],
  })
  const base = { truck: OP_TRUCK, menu: OP_MENU, events: [OP_EVENT], event: OP_EVENT, eventLoading: false, loading: false }
  const withBasket = { ...base, basket: OP_BASKET, appliedDeals: OP_DEALS }
  const payment = { clientSecret: 'harness', fingerprint: 'f', stripeAccount: 'acct_harness', orderKey: 'k', totalPence: 4140 }
  const scenarios = {
    menu: base,
    basket: withBasket,
    discounted: { ...withBasket, appliedCode: OP_MENU.codes[0] },
    sheet: { ...withBasket, formSheetOpen: true, name: 'Sam', email: 'sam@example.test' },
    sheetDiscounted: { ...withBasket, formSheetOpen: true, appliedCode: OP_MENU.codes[0] },
    payReady: { ...withBasket, formSheetOpen: true, stageOpen: true, payment, payStage: 'ready' },
    payFailed: { ...withBasket, formSheetOpen: true, stageOpen: true, payment, payStage: 'failed' },
    itemModal: { ...withBasket, itemModal: { item: opItem('Margherita'), modGroups: opItem('Margherita').modifierGroups, upsells: [opItem('Garlic bread')] }, modalMods: [{ name: 'Extra cheese', price: 1.25 }] },
    submitted: { ...withBasket, submitted: true, submittedOrderId: '40', email: 'sam@example.test' },
  }
  const out = {}
  const params = { slug: 'test-kitchen' }
  for (const [k, st] of Object.entries(scenarios)) {
    try { out[k] = renderWith(st, h(m.OrderPage, { params })) } catch (e) { out[k] = 'ERROR ' + String(e.message || e).slice(0, 300) }
  }
  globalThis.__msSearch = 'confirm=00000000-0000-4000-8000-000000000000'
  try {
    for (const k of ['card_paid', 'pay_at_hatch', 'big']) {
      const confirmOrder = { ...ORDERS[k], truck_name: 'Pizza Kitchen', truck_logo: null, requested_slot: null, asap_estimate: null, money: FMT }
      try { out[`confirm|${k}`] = renderWith({ confirmOrder, confirmLoading: false }, h(m.OrderPage, { params })) } catch (e) { out[`confirm|${k}`] = 'ERROR ' + String(e.message || e).slice(0, 300) }
    }
  } finally { delete globalThis.__msSearch }
  return out
}

// The KDS page: its cards (OrderCard, kitchen mode) and the "Done today" strip whose footer says "£X due".
async function kdsView() {
  const F = 'app/dashboard/[token]/kds/page.tsx'
  const states = ['truck', 'orders', 'payments', 'heldAuthorisations', 'loading', 'hasLoaded', 'events', 'selectedEventId', 'handoverPref', 'layoutOverride', 'showKdsIntro']
  const m = await bundle('kds', `export { default as Kds } from '@/${F}'\n` + moneyCtxExport(), { patches: [{ file: F, states }] })
  const keys = Object.keys(ORDER_CASES).filter(k => k !== 'cancelled')
  const done = ['card_held', 'pay_at_hatch', 'part_paid', 'big'].map((k, i) => ({ ...ORDERS[k], id: String(70 + i), order_key: ORDERS[k].order_key.replace(/..$/, String(70 + i)), status: 'collected' }))
  const orders = [...keys.map(k => ORDERS[k]), ...done]
  const payments = Object.fromEntries([...keys.map(k => [ORDERS[k].order_key, ORDER_CASES[k].ledger]),
    ...done.map((o, i) => [o.order_key, ORDER_CASES[['card_held', 'pay_at_hatch', 'part_paid', 'big'][i]].ledger])])
  const held = new Set([ORDERS.card_held.order_key, done[0].order_key])
  const st = { truck: TRUCK, orders, payments, heldAuthorisations: held, loading: false, hasLoaded: true, events: [{ ...EVENT, event_date: EVENT.date }], selectedEventId: 'ev-1', handoverPref: true, layoutOverride: 'list', showKdsIntro: false }
  try { return { window: renderWith(st, h(m.Kds, { token: 'harness' })) } } catch (e) { return { error: String(e.message || e).slice(0, 300) } }
}

// The dashboard's Add Order panel: the menu grid, the basket, the pay buttons, the order sheet, an item's options.
const DASH_MENU = {
  categories: [{ id: 'c1', name: 'Pizzas' }, { id: 'c3', name: 'Drinks' }, { id: 'c2', name: 'Sides' }],
  items: [MENU_ITEMS[0], MENU_ITEMS[1], { id: 'i5', name: 'Garlic bread', price: 4, category: 'Sides', available: true, modifierGroups: [] }, MENU_ITEMS[2], MENU_ITEMS[3]],
  bundles: [{ ...BUNDLES[0], original_price: null, available: true, start_time: null, end_time: null }], upsell_rules: [],
}
const DASH_BASKET = [
  { name: 'Margherita', quantity: 2, unit_price: 10.75, modifiers: [{ name: 'Extra cheese', price: 1.25 }], cartKey: 'k1' },
  { name: 'Garlic bread', quantity: 1, unit_price: 4, modifiers: [], cartKey: 'k2' },
  { name: 'Coke', quantity: 3, unit_price: 1.8, modifiers: [], specialInstructions: 'No ice', cartKey: 'k3' },
]
const DASH_DEALS = [{ bundle: DASH_MENU.bundles[0], slots: { Pizzas: 'Pepperoni', Drinks: 'Fanta' }, itemsTakenFromBasket: [], modifierExtra: 0.75, slotModifiers: { Pizzas: [{ name: 'Jalapeños', price: 0.75 }] }, slotNotes: {} }]
const DASH_EVENT = { id: 'ev-1', event_date: '2026-10-09', start_time: '17:00', end_time: '21:00', venue_name: 'The Green', town: 'Harnessville', status: 'open' }
async function addOrderView() {
  const F = 'components/dashboard/AddOrderPanel.tsx'
  const m = await bundle('addorder', `export * from '@/${F}'\n` + moneyCtxExport(), {
    patches: [{ file: F, states: ['manualItems', 'appliedDeals', 'manualEvent', 'itemModal', 'modalMods', 'showOrderSheet', 'eventsLoaded', 'upcomingEvents'] }],
  })
  const menuGroups = {}
  for (const it of DASH_MENU.items) (menuGroups[it.category] ||= []).push(it)
  const props = truck => ({
    truck, truckMenu: DASH_MENU, menuGroups, itemStocks: [], categoryStocks: [], categoryConfigs: {}, categoryAllowNotes: {}, orders: [], waitMinutes: 0,
    token: 'harness', pin: '', todayEvent: DASH_EVENT, categoryOrder: ['Pizzas', 'Drinks', 'Sides'], itemCategoryMap: {}, showToast() {}, onOrderPlaced() {},
    controlledEvent: DASH_EVENT, isActive: true, vanTakesCash: truck.takes_cash,
  })
  const base = { manualEvent: DASH_EVENT, eventsLoaded: true, upcomingEvents: [DASH_EVENT] }
  const basket = { ...base, manualItems: DASH_BASKET, appliedDeals: DASH_DEALS }
  const out = {}
  for (const [k, truck, st] of [
    ['empty', TRUCK, base],
    ['basket|paidStep', TRUCK, basket],
    ['basket|noCash', { ...TRUCK, takes_cash: false }, basket],
    ['basket|noPaidStep', { ...TRUCK, show_paid_step: false }, basket],
    ['sheet', TRUCK, { ...basket, showOrderSheet: true }],
    ['itemModal', TRUCK, { ...basket, itemModal: { item: MENU_ITEMS[0], modGroups: MENU_ITEMS[0].modifierGroups }, modalMods: [{ name: 'Extra cheese', price: 1.25 }] }],
  ]) {
    try { out[k] = renderWith(st, h(m.AddOrderPanel, props(truck))) } catch (e) { out[k] = 'ERROR ' + String(e.message || e).slice(0, 300) }
  }
  return out
}

// The dashboard page: the completed list's money chip, the cancel / reject / edit modals, the edit item
// sheet, the Menu & Stock price column — and the refund messages its submitRefund returns.
async function dashboardView() {
  const F = 'app/dashboard/[token]/page.tsx'
  const states = ['truck', 'orders', 'loading', 'authenticated', 'truckMenu', 'todayEvents', 'upcomingEvents', 'selectedEventId', 'eventsLoaded', 'firstOpenChecked',
    'payments', 'heldAuthorisations', 'showCompleted', 'activeTab', 'showCancelModal', 'cancellingOrder', 'showRejectModal', 'rejectingOrder',
    'editingOrder', 'editItems', 'editDeals', 'editOrderBaseline', 'editReprice', 'editItemModal', 'editModalMods',
    'fetchedStockKeys', 'eventCharged', 'eventOwnPrice', 'eventFallback', 'eventTypeName', 'priceReady', 'eventPriceLive', 'priceEditing', 'pricePending']
  const m = await bundle('dashboard', `export { default as Dash, __msSig } from '@/${F}'\n` + moneyCtxExport(), {
    patches: [
      { file: F, states },
      { file: F, from: 'const{token}=use(params)', to: 'const{token}=params' },
      { file: F, from: 'const submitRefund=async(', to: 'const submitRefund=globalThis.__msRefund=async(' },
      { file: F, append: 'export const __msSig = editBasketSignature' },
    ],
  })
  const caseKeys = Object.keys(ORDER_CASES)
  const orders = caseKeys.map(k => ({ ...ORDERS[k], status: ['refunded', 'part_refunded', 'cancelled'].includes(k) ? (k === 'part_refunded' ? 'collected' : 'cancelled') : ORDERS[k].status }))
  const payments = Object.fromEntries(caseKeys.map(k => [ORDERS[k].order_key, ORDER_CASES[k].ledger]))
  const held = new Set([ORDERS.card_held.order_key])
  const items = DASH_MENU.items.map(i => ({ ...i }))
  const base = { truck: TRUCK, orders, loading: false, authenticated: true, truckMenu: DASH_MENU, todayEvents: [DASH_EVENT], upcomingEvents: [DASH_EVENT], selectedEventId: 'ev-1', eventsLoaded: true, firstOpenChecked: true, fetchedStockKeys: new Set(['ev-1']), payments, heldAuthorisations: held }
  const editItems = DASH_BASKET.map(i => (i.name === 'Coke' ? { ...i, quantity: 4 } : { ...i }))
  const editDeals = [{ name: 'Lunch deal', slots: { Pizzas: 'Pepperoni', Drinks: 'Fanta' }, slotModifiers: { Pizzas: [{ name: 'Jalapeños', price: 0.75 }] }, slotNotes: {} }]
  const edit = { activeTab: 'orders', editingOrder: ORDERS.card_paid, editItems, editDeals, editOrderBaseline: { total: 43.9, itemsSubtotal: 30.9, deals: [{ name: 'Lunch deal', lockedValue: 12.75 }] } }
  const prices = { eventCharged: { i1: 10.5, i2: 11, i3: 1.8, i4: 2, i5: 4 }, eventOwnPrice: { i4: 2 }, eventFallback: { i1: 10.5, i2: 11, i3: 1.8, i4: 1.8, i5: 4 }, eventTypeName: 'Festival', priceReady: true, eventPriceLive: true }
  const scenarios = {
    orders: { ...base, activeTab: 'orders', showCompleted: true },
    'cancel|card_paid': { ...base, showCancelModal: true, cancellingOrder: ORDERS.card_paid },
    'cancel|part_refunded': { ...base, showCancelModal: true, cancellingOrder: ORDERS.part_refunded },
    'cancel|part_paid': { ...base, showCancelModal: true, cancellingOrder: ORDERS.part_paid },
    'cancel|card_held': { ...base, showCancelModal: true, cancellingOrder: ORDERS.card_held },
    'reject|card_held': { ...base, showRejectModal: true, rejectingOrder: ORDERS.card_held },
    'reject|big': { ...base, showRejectModal: true, rejectingOrder: ORDERS.big },
    edit: { ...base, ...edit },
    editDown: { ...base, ...edit, editItems: editItems.filter(i => i.name !== 'Garlic bread') },
    editReprice: { ...base, ...edit, editReprice: { total: 47.5, unresolved: [{ kind: 'item', name: 'Coke', advisoryPrice: 1.8 }, { kind: 'deal', name: 'Lunch deal', on: 'Pizzas', advisoryPrice: 12 }], signature: m.__msSig(editItems, editDeals) } },
    editItemModal: { ...base, ...edit, editItemModal: { item: MENU_ITEMS[0], modGroups: MENU_ITEMS[0].modifierGroups, allowNotes: true }, editModalMods: [{ name: 'Extra cheese', price: 1.25 }] },
    stock: { ...base, activeTab: 'stock', ...prices },
    stockEditing: { ...base, activeTab: 'stock', ...prices, priceEditing: true, pricePending: { i1: 12 } },
  }
  void items
  const out = {}
  const params = { token: 'harness' }
  for (const [k, st] of Object.entries(scenarios)) {
    try { out[k] = renderWith(st, h(m.Dash, { params })) } catch (e) { out[k] = 'ERROR ' + String(e.message || e).slice(0, 300) }
  }
  // submitRefund's three sentences — the page's own closure, answered by the in-process stub below (nothing is sent).
  const refund = globalThis.__msRefund
  delete globalThis.__msRefund
  out.refundMessages = []
  if (refund) {
    const realFetch = globalThis.fetch
    const q = [console.error, console.warn, console.log]
    console.error = () => {}; console.warn = () => {}; console.log = () => {}
    try {
      for (const reply of [{ ok: true, body: { pending: true } }, { ok: true, body: {} }, { ok: false, body: { error: 'Refused' } }]) {
        globalThis.fetch = async (url) => (String(url).includes('/api/dashboard/action')
          ? { ok: reply.ok, status: reply.ok ? 200 : 400, json: async () => reply.body }
          : { ok: false, status: 503, json: async () => ({}) })
        try { out.refundMessages.push(await refund({ orderKey: ORDERS.card_paid.order_key, amountMinor: 123456, reason: 'other', note: '' })) } catch (e) { out.refundMessages.push('ERROR ' + String(e.message || e).slice(0, 200)) }
      }
    } finally { globalThis.fetch = realFetch; [console.error, console.warn, console.log] = q }
  }
  return out
}

// Manage → Reports: the summary, the orders table (every order expanded), the items table, and the two
// CSV files exactly as the browser would download them (Blob captured; nothing is written or sent).
async function reportsView() {
  const F = 'app/manage/[token]/page.tsx'
  const m = await bundle('reports', `export { __msReports } from '@/${F}'\n` + PROVIDER_EXPORT, {
    patches: [
      { file: F, states: ['reportData', 'reportLoaded', 'itemView', 'expandedOrders', 'filterMode'] },
      { file: F, from: 'const exportCSV = () => {', to: 'const exportCSV = globalThis.__msCsv = () => {' },
      { file: F, from: 'const exportItemsCSV = () => {', to: 'const exportItemsCSV = globalThis.__msItemsCsv = () => {' },
      { file: F, append: 'export { ReportsTab as __msReports }' },
    ],
  })
  const orders = Object.keys(ORDER_CASES).filter(k => k !== 'cancelled').map(k => ({ ...ORDERS[k], customer_email: k === 'pay_at_hatch' ? null : ORDERS[k].customer_email }))
  const reportData = {
    totalOrders: orders.length, totalRevenue: 1641.27, avgOrder: 182.36,
    topItems: [{ name: 'Margherita', qty: 18, revenue: 193.5 }, { name: 'Coke', qty: 27, revenue: 48.6 }, { name: 'Garlic bread', qty: 9, revenue: 36 }],
    dealsRedeemed: 9, dealSavings: 20.7, upsellRevenue: 1234.5, whatsappStats: null,
    orders, eventsMap: { 'ev-1': { venue_name: 'The Green', town: 'Harnessville', van_id: null } }, eventsByDate: {},
    itemCategories: { Margherita: 'Pizzas', Coke: 'Drinks', 'Garlic bread': 'Sides' }, categoryOrder: ['Pizzas', 'Drinks', 'Sides'],
  }
  const truck = { ...TRUCK, plan: 'max', feature_overrides: {}, trial_expires_at: null, timezone: 'Europe/London' }
  const api = async () => ({})
  const expanded = new Set(orders.map(o => o.order_key))
  const out = {}
  for (const view of ['orders', 'items']) {
    out[view] = renderWith({ reportData, reportLoaded: true, itemView: view, expandedOrders: expanded, filterMode: 'event' }, inManage(m, h(m.__msReports, { truck, api })))
  }
  // The CSVs: the exporters captured during the render above, run with a stand-in Blob/URL/document.
  const files = []
  const saved = { Blob: globalThis.Blob, URL: globalThis.URL, document: globalThis.document }
  globalThis.Blob = class { constructor(parts, opts) { this.parts = parts; this.type = opts && opts.type } }
  globalThis.URL = { createObjectURL: b => { files.push({ type: b.type, text: b.parts.join('') }); return 'blob:harness' }, revokeObjectURL() {} }
  globalThis.document = { createElement: () => ({ click() {}, set download(v) { files[files.length - 1].name = v } }) }
  try {
    renderWith({ reportData, reportLoaded: true, itemView: 'orders', expandedOrders: expanded, filterMode: 'event' }, inManage(m, h(m.__msReports, { truck, api })))
    globalThis.__msCsv(); globalThis.__msItemsCsv()
  } finally { Object.assign(globalThis, saved); if (!saved.document) delete globalThis.document; delete globalThis.__msCsv; delete globalThis.__msItemsCsv }
  out.csv = files
  return out
}

// Manage → Menu (the item list, an item's options, both import-review pages), Deals, Schedule's per-event
// deal list, and the shared Extras editor.
const M_CATS = [{ id: 'c1', name: 'Pizzas', slug: 'pizzas', prep_secs: 300, batch_size: 4, allow_notes: true, default_stock: null, sort_order: 0, is_active: true },
  { id: 'c3', name: 'Drinks', slug: 'drinks', prep_secs: 0, batch_size: 1, allow_notes: false, default_stock: null, sort_order: 1, is_active: true }]
const mItem = (id, name, price, cat) => ({ id, name, description: null, price, category_id: cat, subcategory_id: null, is_available: true, stock_count: null, default_stock: null, sort_order: 0, image_path: null, allergens: [], dietary_info: [], spiciness: null, auto_accept: false })
const M_ITEMS = [mItem('i1', 'Margherita', 9.5, 'c1'), mItem('i2', 'Pepperoni', 11, 'c1'), mItem('i3', 'Coke', 1.8, 'c3')]
const M_GROUPS = [{ id: 'g1', name: 'Size', is_required: true, min_choices: 1, max_choices: 1 }, { id: 'g2', name: 'Extras', is_required: false, min_choices: 0, max_choices: 3 }]
const mOpt = (id, g, name, price, sort) => ({ id, group_id: g, name, price_adjustment: price, type: 'option', sort_order: sort })
const M_OPTS = [mOpt('o1', 'g1', 'Regular', 0, 0), mOpt('o2', 'g1', 'Large', 2.5, 1), mOpt('o3', 'g2', 'Extra cheese', 1.25, 0), mOpt('o4', 'g2', 'No onion', 0, 1), mOpt('o5', 'g2', 'Discount crust', -0.5, 2)]
const M_ASSIGN = [{ menu_item_id: 'i1', group_id: 'g1' }, { menu_item_id: 'i1', group_id: 'g2' }, { menu_item_id: 'i2', group_id: 'g1' }]
const M_BUNDLES = [{ id: 'b1', name: 'Lunch deal', description: 'Any pizza and a drink', bundle_price: 12, original_price: 14.3, is_available: true, apply_to_new_events: true, start_time: null, end_time: null, slot_1_category: 'Pizzas', slot_2_category: 'Drinks', slot_3_category: null, slot_4_category: null, slot_5_category: null, slot_6_category: null },
  { id: 'b2', name: 'Family feast', description: 'Two pizzas', bundle_price: 1234.5, original_price: null, is_available: true, apply_to_new_events: false, start_time: null, end_time: null, slot_1_category: 'Pizzas', slot_2_category: 'Pizzas', slot_3_category: null, slot_4_category: null, slot_5_category: null, slot_6_category: null }]
const IMPORT_RESULT = {
  categories: ['Pizzas', 'Mains'], existing_categories: ['Pizzas'],
  items: [
    { name: 'Margherita', price: 9.5, category: 'Pizzas' },
    { name: 'Calzone', price: 0, category: 'Pizzas', price_missing: true },
    { name: 'Pad Thai Chicken', price: 9, category: 'Mains', _variantOf: { key: 'pad-thai', baseName: 'Pad Thai', groupName: 'Protein', optionName: 'Chicken' } },
    { name: 'Pad Thai Prawn', price: 10.5, category: 'Mains', _variantOf: { key: 'pad-thai', baseName: 'Pad Thai', groupName: 'Protein', optionName: 'Prawn' } },
  ],
}
async function manageView() {
  const F = 'app/manage/[token]/page.tsx'
  const m = await bundle('manage', `export { __msMenu, __msDeals, __msSchedule } from '@/${F}'\nexport { default as Extras } from '@/components/manage/ExtrasEditor'\n` + PROVIDER_EXPORT, {
    patches: [
      { file: F, states: ['editingItem', 'expandedCat', 'importStep', 'importResult', 'reviewStep', 'events', 'loadingEvents'] },
      { file: F, append: 'export { MenuTab as __msMenu, DealsTab as __msDeals, ScheduleTab as __msSchedule }' },
      { file: 'components/manage/ExtrasEditor.tsx', states: ['expandedGroup', 'editingOption', 'priceInput', 'catOpen'] },
    ],
  })
  const truck = { ...TRUCK, plan: 'max', feature_overrides: {}, trial_expires_at: null, allow_customer_cancellation: true, cancellation_cutoff_mins: 30, auto_accept: false, allergen_display_mode: 'per_dish', setup_step: null }
  const noop = () => {}
  const api = async () => ({})
  const menuProps = { truck, categories: M_CATS, items: M_ITEMS, subcategories: [], token: 'harness', modifierGroups: M_GROUPS, modifierOptions: M_OPTS, itemModGroups: M_ASSIGN,
    setItemModGroups: noop, api, reload: noop, showToast: noop, allergenWizardOpen: false, onCloseAllergenWizard: noop, onOpenAllergenWizard: noop, canEditAllergens: true, onWalkthroughChoice: noop, onVerifySuccess: noop }
  const out = {}
  const run = (k, st, el) => { try { out[k] = renderWith(st, inManage(m, el)) } catch (e) { out[k] = 'ERROR ' + String(e.message || e).slice(0, 300) } }
  run('menu|list', { expandedCat: 'c1' }, h(m.__msMenu, menuProps))
  run('menu|editItem', { editingItem: M_ITEMS[0] }, h(m.__msMenu, menuProps))
  run('menu|import1', { importStep: 'review', importResult: IMPORT_RESULT, reviewStep: 1 }, h(m.__msMenu, menuProps))
  run('menu|import2', { importStep: 'review', importResult: IMPORT_RESULT, reviewStep: 2 }, h(m.__msMenu, menuProps))
  run('deals', {}, h(m.__msDeals, { categories: M_CATS, bundles: M_BUNDLES, setBundles: noop, api, reload: noop, showToast: noop }))
  run('deals|empty', {}, h(m.__msDeals, { categories: M_CATS, bundles: [], setBundles: noop, api, reload: noop, showToast: noop }))
  const ev = { id: 'ev-1', truck_id: 'test-truck', event_date: '2026-10-12', start_time: '17:00', end_time: '21:00', venue_name: 'The Green', town: 'Harnessville', postcode: null, status: 'confirmed', event_deals: [{ bundle_id: 'b1', active: true }], van_id: null }
  run('schedule', { events: [ev], loadingEvents: false }, h(m.__msSchedule, { isActive: true, section: 'events', onSectionChange: noop, truck, token: 'harness', bundles: M_BUNDLES, categories: M_CATS, api, showToast: noop, onTruckUpdate: noop, onVerifySuccess: noop, onSwitchTab: noop, onOpenSocial: noop, pendingVerifyEvents: null, onClearPendingVerify: noop, onPendingCount: noop, onEventsSaved: noop, notices: [] }))
  const exProps = { groups: M_GROUPS, options: M_OPTS, items: M_ITEMS, categories: M_CATS, assignments: M_ASSIGN, showToast: noop,
    onCreateGroup: api, onUpdateGroup: api, onDeleteGroup: api, onSaveOption: api, onDeleteOption: api, onToggleAssign: api, onToggleOption: api }
  run('extras', { expandedGroup: 'g2', catOpen: { c1: true } }, h(m.Extras, exProps))
  run('extras|editOption', { expandedGroup: 'g2', editingOption: M_OPTS[2], priceInput: '1.25' }, h(m.Extras, exProps))
  run('extras|empty', {}, h(m.Extras, { ...exProps, groups: [], options: [], assignments: [] }))
  return out
}

// The developer ticket preview (/dev/ticket-preview): its scenario list and the on-screen ticket.
async function devTicketView() {
  const F = 'app/dev/ticket-preview/page.tsx'
  // The page's own sample is a UK truck; the USD run re-points that one constant pair at a US truck.
  const usd = USD ? [{ file: F, from: "const SAMPLE_MONEY: MoneyFormat = { currency: 'GBP', locale: 'en-GB' }", to: "const SAMPLE_MONEY: MoneyFormat = { currency: 'USD', locale: 'en-US' }" },
    { file: F, from: "const SAMPLE_COUNTRY = 'GB'", to: "const SAMPLE_COUNTRY = 'US'" }] : []
  const m = await bundle('devticket', `export { default as Dev } from '@/${F}'\n` + moneyCtxExport(), { patches: [{ file: F, states: ['scenario', 'paper'] }, ...usd] })
  const out = {}
  for (const sc of ['part', 'paid', 'unpaid', 'fournotes']) for (const paper of [58, 80]) {
    try { out[`${sc}|${paper}`] = renderWith({ scenario: sc, paper }, h(m.Dev)) } catch (e) { out[`${sc}|${paper}`] = 'ERROR ' + String(e.message || e).slice(0, 300) }
  }
  return out
}

// Manage → Schedule → Event types: the grid's Item prices rows (the menu price column, the rule labels).
// It reads the truck's symbol from the manage page's country-settings provider, so it renders inside one,
// fed the seed row for this run's country (GB, or US for --usd).
async function eventTypesView() {
  const F = 'components/manage/EventTypes.tsx'
  const m = await bundle('eventtypes', `export { EventTypesPanel } from '@/${F}'\n` + PROVIDER_EXPORT, {
    patches: [{ file: F, states: ['loading', 'types', 'canTypes', 'standard', 'vans', 'pricingReady', 'pricing', 'menu', 'showItems'] }],
  })
  const type = { id: 't1', truck_id: 'test-truck', name: 'Festival', sort_order: 0, buzzer_prompt: null, takes_cash: null, order_ready: null, collection_interval_mins: null, upcoming: 2 }
  const type2 = { ...type, id: 't2', name: 'Wedding', sort_order: 1, upcoming: 0 }
  const standard = { buzzer_prompt: { value: false, perVan: false }, takes_cash: { value: true, perVan: false }, order_ready: { value: true, perVan: false }, collection_interval_mins: { value: 10, perVan: false }, offline_protection: { enabled: false, mode: 'pause', perVan: false } }
  const pricing = {
    t1: { price_change_on: true, price_mode: 'add_amount', price_amount: 1.5, price_rounding: 'nearest_1', typed: { i2: 13 } },
    t2: { price_change_on: true, price_mode: 'add_pct', price_amount: 10, price_rounding: 'none', typed: {} },
  }
  const menu = { categories: [{ id: 'c1', name: 'Pizzas', items: [{ id: 'i1', name: 'Margherita', price: 9.5 }, { id: 'i2', name: 'Pepperoni', price: 11 }] }, { id: 'c3', name: 'Drinks', items: [{ id: 'i3', name: 'Coke', price: 1.8 }] }] }
  const st = { loading: false, types: [type, type2], canTypes: true, standard, vans: [], pricingReady: true, pricing, menu, showItems: true }
  try {
    return { grid: renderWith(st, inManage(m, h(m.EventTypesPanel, { token: 'harness', manageApi: async () => ({}), inline: true }))) }
  } catch (e) { return { error: String(e.message || e).slice(0, 300) } }
}

;(async () => {
  const snap = {
    fmt: FMT,
    emails: await emailsView(),
    tickets: await ticketsView(),
    components: await componentsView(),
    pricing: await pricingView(),
    prompts: await promptsView(),
    receipt: await receiptView(),
    orderPage: await orderPageView(),
    kds: await kdsView(),
    addOrder: await addOrderView(),
    dashboard: await dashboardView(),
    reports: await reportsView(),
    manage: await manageView(),
    devTicket: await devTicketView(),
    eventTypes: await eventTypesView(),
  }
  if (CAPTURE) { fs.writeFileSync(path.resolve(CAPTURE), JSON.stringify(snap, null, 1)); console.log(`captured (${FMT.currency}) → ${CAPTURE}`); return }
  const before = JSON.parse(read(BEFORE_FILE))
  const leaves = (o, p = '', out = new Map()) => {
    if (o && typeof o === 'object') { for (const k of Object.keys(o)) leaves(o[k], p ? `${p}.${k}` : k, out); if (!Object.keys(o).length) out.set(p, Array.isArray(o) ? '[]' : '{}') }
    else out.set(p, o)
    return out
  }
  const excerpt = (a, b) => {
    const x = String(a), y = String(b); let i = 0
    while (i < x.length && x[i] === y[i]) i++
    return `\n      before: …${x.slice(Math.max(0, i - 60), i + 80)}…\n      after:  …${y.slice(Math.max(0, i - 60), i + 80)}…`
  }
  const A = leaves(JSON.parse(JSON.stringify(snap))), B = leaves(before)   // the same JSON round trip the fixture took
  let bad = 0
  const fail = (msg) => { bad++; if (bad <= 40) console.log('  🔴 ' + msg) }

  // ⚠️ ONE MORE NAMED DIFFERENCE — us-layout-fix-2-live-on-date-line (components/TruckListCard.tsx, 18 October 2026,
  // /Users/dominicbonini/dev/usl-out/REPIN-BRIEF.md): "● Live" moves from the range line to the date line, so the order
  // page header's text reads "Fri 9 Oct Live 17:00 – 21:00" where it read "Fri 9 Oct 17:00 – 21:00 Live". Applied to the
  // BEFORE side, on the orderPage.<view>.text leaves only, as that exact substring; it must apply exactly once on each
  // of the eight views that show the live card (menu … itemModal) — every other byte is still compared exactly. The --usd
  // run applies it to the same leaves before its "$ read as £" comparison.
  const FIX2 = { id: 'us-layout-fix-2-live-on-date-line', from: 'Fri 9 Oct 17:00 – 21:00 Live The Green', to: 'Fri 9 Oct Live 17:00 – 21:00 The Green' }
  const FIX2_VIEWS = ['menu', 'basket', 'discounted', 'sheet', 'sheetDiscounted', 'payReady', 'payFailed', 'itemModal'].map(v => `orderPage.${v}.text`)
  // ⚠️ AND us-layout-fix-6-kds-full-badge (components/dashboard/OrderCard.tsx, the KDS Full ticket's row 1): the status badge
  // is one size down and OUT OF FLOW, pinned top-right above the total — rendered AFTER the total cluster, so the KDS text
  // reads "#43 £43.90 Ready" where it read "#43 Ready £43.90". Applied to the BEFORE side of kds.window.text only, as that
  // one ticket's exact words (found exactly once); every amount and every other ticket still compared byte for byte.
  const FIX6 = { id: 'us-layout-fix-6-kds-full-badge', view: 'kds.window.text', from: '#43 Ready £43.90 Sam Harness', to: '#43 £43.90 Ready Sam Harness' }
  const fix2 = (k, v) => {
    if (k === FIX6.view) {
      if (typeof v !== 'string' || v.split(FIX6.from).length !== 2) { fail(`${FIX6.id}: "${FIX6.from}" is not in BEFORE ${k} exactly once`); return v }
      return v.replace(FIX6.from, FIX6.to)
    }
    if (!FIX2_VIEWS.includes(k)) return v
    if (typeof v !== 'string' || v.split(FIX2.from).length !== 2) { fail(`${FIX2.id}: "${FIX2.from}" is not in BEFORE ${k} exactly once`); return v }
    return v.replace(FIX2.from, FIX2.to)
  }
  if (!USD) {
    // ── THE FORMATTER AGAINST THE CODE IT REPLACED, value by value. Every converted site was
    // `£${x.toFixed(2)}` (major), `£${(m / 100).toFixed(2)}` (minor) or price.ts's trimmed form; the
    // fixtures above exercise the screens, this exercises the arithmetic: every penny from -£500 to
    // £5,000, a million sums and multiples of prices, and the values where toFixed and Intl round
    // differently.
    if (fs.existsSync(path.join(REPO, 'lib/money-format.ts')) && /export function formatMajor\b/.test(read('lib/money-format.ts'))) {
      const F = await bundle('formatter', `export * from '@/lib/money-format'`)
      const gb = { currency: 'GBP', locale: 'en-GB' }
      let n = 0, wrong = 0
      const same = (got, want, what) => { n++; if (got !== want && wrong++ < 5) console.log(`  🔴 formatter: ${what} → ${got}, the old code printed ${want}`) }
      for (let i = -50000; i <= 500000; i++) {
        same(F.formatMajor(i / 100, gb), `£${(i / 100).toFixed(2)}`, `formatMajor(${i / 100})`)
        if (i % 7 === 0) same(F.formatMinor(i, gb), `£${(i / 100).toFixed(2)}`, `formatMinor(${i})`)
      }
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
      for (let i = 0; i < 200000; i++) {
        const a = Math.round(rnd() * 5000) / 100, b = Math.round(rnd() * 5000) / 100
        for (const x of [a + b, a * 3, Math.abs(a - b), a * 1.1, rnd() * 5000]) same(F.formatMajor(x, gb), `£${x.toFixed(2)}`, `formatMajor(${x})`)
      }
      for (const x of [1.005, 1.115, 0.125, 2.675, 1.255, 8.345, 0.285, 1234.565, 1e-9, -1e-9, -0, 0.005, -0.005]) same(F.formatMajor(x, gb), `£${x.toFixed(2)}`.replace('£-0.00', '£0.00'), `formatMajor(${x})`)
      const trim = x => `£${(Math.round(x * 100) / 100).toFixed(2).replace(/\.00$/, '')}`
      for (let i = 0; i <= 100000; i++) { const x = i / 100; same(F.formatMajor(Math.round(x * 100) / 100, gb, { trimWhole: true }), trim(x), `trimWhole(${x})`) }
      if (wrong) fail(`the formatter differs from the code it replaced on ${wrong} of ${n} values`)
      else console.log(`  formatter: ${n.toLocaleString('en-GB')} values identical to the toFixed code it replaced (a tiny negative that rounds to zero prints "£0.00" where toFixed printed "£-0.00" — nothing renders one)`)
    }
    // ── GB: BYTE-IDENTICAL TO THE BEFORE SNAPSHOT, every leaf.
    // ⚠️ ONE NAMED DIFFERENCE — AUDIT D38 (docs/audit-fixes-report.md): the fixture's "Jalapeños" now prints
    // "Jalapenos" on the ticket, where it printed "Jalape?os" (byte 0x3F → 0x6E). It is put back to its old
    // form on the ticket leaves only, so every other byte — every amount, every £ — is still compared exactly.
    const d38 = (k, v) => (!k.startsWith('tickets.') || typeof v !== 'string') ? v
      : v.replace(/Jalapenos/g, 'Jalapeños').replace(/4a616c6170656e6f73/g, '4a616c6170653f6f73')
    for (const [k, v] of B) {
      if (!A.has(k)) fail(`${k} is missing now`)
      else if (d38(k, A.get(k)) !== fix2(k, v)) fail(`${k} changed${excerpt(fix2(k, v), A.get(k))}`)
    }
    console.log(`  named: ${FIX2.id} on ${FIX2_VIEWS.length} views (${FIX2_VIEWS.join(', ')}); ${FIX6.id} on ${FIX6.view}`)
    for (const k of A.keys()) if (!B.has(k)) fail(`${k} is new (not in the BEFORE snapshot)`)
    console.log(bad ? `🔴 GB: ${bad} difference(s) from ${BEFORE_FILE}` : `✅ GB: all ${B.size} rendered strings and byte streams are identical to ${BEFORE_FILE}`)
    process.exit(bad ? 1 : 0)
  }

  // ── USD: the same fixtures as a US truck's orders. No £ anywhere; every "$" amount has two decimals
  // except where the UK screen shows a whole-unit form at the same place ("nearest $1", "+ $" box labels);
  // the ticket bytes hold the ASCII "$" (0x24) and never the £ byte; and swapping "$" back to "£" gives the
  // GB snapshot exactly — so a USD screen differs from the UK one by its symbol and nothing else.
  // ⚠️ THE FIXTURE'S "Jalapeños" printed "Jalape?os" when the GB snapshot was taken; since audit D38 it
  // prints "Jalapenos" (docs/audit-fixes-report.md). That one fold is put back before comparing with the GB
  // snapshot (d38 below), so the swap checks still prove a USD ticket differs from the UK one by its symbol only.
  const d38 = (k, v) => (!k.startsWith('tickets.') || typeof v !== 'string') ? v
    : v.replace(/Jalapenos/g, 'Jalapeños').replace(/4a616c6170656e6f73/g, '4a616c6170653f6f73')
  const SKIP = new Set(['fmt.currency', 'fmt.locale'])
  let amounts = 0, wholeForms = 0
  for (const [k, v] of A) {
    if (SKIP.has(k) || typeof v !== 'string') continue
    if (v.includes('£')) fail(`${k} still says £${excerpt(v.replace(/£[\s\S]*/, ''), v)}`)
    for (const mm of v.matchAll(/\$-?\d[\d,]*(\.\d+)?/g)) {
      amounts++
      if (!mm[1]) wholeForms++
      else if (mm[1].length !== 3) fail(`${k} has "${mm[0]}" — not two decimals`)
    }
  }
  for (const [k, t] of Object.entries(snap.tickets)) {
    const bytes = Buffer.from(t.bytes, 'hex')
    if (bytes.includes(0xa3)) fail(`ticket ${k} holds the £ byte 0xA3`)
    if (!bytes.includes(0x24)) fail(`ticket ${k} has no "$" byte`)
    for (const line of t.lines) if (typeof line === 'string' && /\$[^\s]*\?|\?[^\s]*\$|\d\?|\?\d/.test(line)) fail(`ticket ${k}: an amount holds a "?": ${line}`)
  }
  const asGb = v => (typeof v === 'string' ? v.replace(/\$/g, '£') : v)
  for (const [k, v] of B) {
    if (SKIP.has(k) || k.endsWith('.bytes')) continue
    if (!A.has(k)) { fail(`${k} is missing in the USD render`); continue }
    if (asGb(d38(k, A.get(k))) !== fix2(k, v)) fail(`${k}: with "$" read as "£", the USD render is not the GB one${excerpt(fix2(k, v), asGb(A.get(k)))}`)
  }
  for (const [k, t] of Object.entries(snap.tickets)) {
    const gb = Buffer.from(before.tickets[k].bytes, 'hex'), us = Buffer.from(d38('tickets.' + k, t.bytes), 'hex')
    const swapped = Buffer.from(us.map(b => (b === 0x24 ? 0xa3 : b)))
    if (!swapped.equals(gb)) fail(`ticket ${k}: with 0x24 read as 0xA3 the bytes are not the GB ticket's`)
  }
  // A currency the printer cannot encode prints its ISO code, never "?" — a euro ticket, rendered here.
  {
    const m = await bundle('ticket-eur', `export * as T from '@/lib/printing/ticket'\nexport * as MAP from '@/lib/printing/mapOrderToTicket'`)
    const eur = { currency: 'EUR', locale: 'en-IE' }
    const order = { ...ORDERS.part_paid, currency: 'EUR', country: 'IE', items: ORDERS.part_paid.items.map(i => ({ ...i, modifiers: (i.modifiers || []).map(x => ({ ...x })) })), deals: [] }
    const t = m.MAP.mapOrderToTicket({ order, truck: { ...TRUCK, money: { ...eur, localeByCountry: { IE: 'en-IE' } } }, event: EVENT, ledgerRows: ORDER_CASES.part_paid.ledger, printedLabel: '18:37' })
    const lines = m.T.buildTicketLines(t, { paper_width: 80, show_phone: true }).map(l => l.text).filter(Boolean)
    const bytes = Buffer.from(m.T.renderTicket(t, { paper_width: 80, show_phone: true }))
    snap.eurTicket = lines
    if (bytes.includes(0x3f)) fail(`the EUR ticket holds a "?" byte: ${lines.join(' | ')}`)
    if (!lines.some(l => /EUR 43\.90/.test(l)) || !lines.some(l => /EUR 23\.90/.test(l))) fail(`the EUR ticket does not print "EUR 43.90" / "EUR 23.90": ${lines.join(' | ')}`)
    console.log(`  EUR ticket: ${lines.filter(l => /EUR/.test(l)).map(l => l.replace(/\s+/g, ' ')).join(' · ')}`)
  }
  console.log(`  ${amounts} "$" amounts: ${amounts - wholeForms} with two decimals, ${wholeForms} whole-unit forms the UK screen shows whole too`)
  console.log(bad ? `🔴 USD: ${bad} problem(s)` : `✅ USD: no £ in ${A.size} rendered strings; ${Object.keys(snap.tickets).length} tickets print "$" and no amount holds a "?"; a EUR ticket prints "EUR 43.90"; each surface is the GB one with the symbol swapped`)
  process.exit(bad ? 1 : 0)
})().catch(e => { console.error('🔴', e && e.stack || e); process.exit(1) })
