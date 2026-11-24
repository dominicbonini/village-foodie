#!/usr/bin/env node
// scripts/france-notes-1.cjs — france-notes-1 (24 November 2026, docs/france-notes-1-report.md): line notes stored outside the order lines.
// No network, no database: the real routes, bundled, on an in-memory database (scripts/_fake-pg.cjs).
//
//   A · THE HELPER (lib/line-notes.ts) — split and merge round trips: a note, an EMPTY note, no note field at all, a cartKey, a cartKey seen
//       twice, deal slot notes, no deals; jsonb's key order (what a real column hands back) and insertion order; retention's blanking.
//   B · EVERY WRITE PATH (this tree's routes): the customer submit (pay at the truck), the card draft and its promotion, the walk-up and its
//       offline replay, the operator edit (a note added and a note changed — on a new-style and on an old-style order): items / deals hold
//       no specialInstructions / slotNotes, line_notes holds the same notes, and the lines read back are exactly what was sent.
//   C · NOTHING ANYONE SEES CHANGES — against this prompt's starting commit (START, extracted from git — never HEAD), for an order with dish
//       notes, an empty note, deal slot notes and an order note, OLD-style (notes in items) and NEW-style (notes in line_notes):
//       the customer confirmation email (HTML + text) the operator's confirm sends from the stored row; the customer email and the truck's
//       new-order email from the customer submit and from the walk-up; the status API (/api/orders/[id], which the order page's in-page
//       confirmation also reads) and the status page; the dashboard API (/api/dashboard — the dashboard, the KDS and the edit screens) and
//       the ticket bytes at 58 and 80 mm from its rows; Reports (/api/manage get_report — its CSVs are built from these rows).
//   D · RETENTION — a new-style order: its items and deals byte-identical after, its notes and customer fields blanked; an old-style order:
//       exactly START's patch.
//   E · THE AUDIT — the snapshots carry no notes (and no line_notes); the audit rows the route runs wrote carry no note text.
//   F · STRUCTURE — every reader of a stored row goes through the helper; no screen, email, ticket or CSV code changed since START.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
require('./_disk-guard.cjs').guard(__filename)
require('./_harness-tmp.cjs')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'france-notes-1' })
const { REPO } = kit
const { makeFakePg } = require('./_fake-pg.cjs')
const SEEDS = require('./_country-settings-gb.cjs')

/** 🔴 THIS PROMPT'S STARTING COMMIT (never HEAD): compare-research-1's 528debcb, the branch tip when france-notes-1 began. */
const START = '528debcb'

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const J = v => JSON.stringify(v)
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const firstDiff = (a, b) => { a = String(a); b = String(b); let i = 0; while (i < a.length && a[i] === b[i]) i++; return `@${i}: START …${J(a.slice(Math.max(0, i - 100), i + 140))}\n      HEAD  …${J(b.slice(Math.max(0, i - 100), i + 140))}` }
const NOTE_RE = /No basil|BIEN CUIT|no peanuts|Ring twice|allergy/

// ── a bundle from ANY tree: the render kit's stubs (database at use time, next/*), plus named stubs and patches ──
const DB_STUB = "export const supabase = new Proxy({}, { get(_, k) { const db = globalThis.__harnessDb; if (db) return db[k]; throw new Error('no database in this harness') } })"
const DBLIB_STUB = "const lazy = new Proxy({}, { get(_, k) { const db = globalThis.__harnessDb; if (db) return db[k]; throw new Error('no database in this harness') } })\nmodule.exports = Object.create(new Proxy({}, { get: (_, k) => (typeof k === 'symbol' ? undefined : () => lazy) }))"
const NAV = "export const useRouter = () => ({ push(){}, replace(){}, refresh(){}, back(){}, prefetch(){} })\nexport const usePathname = () => '/'\nexport const useSearchParams = () => new URLSearchParams('')\nexport const useParams = () => ({ id: 'ok-n1' })\nexport const notFound = () => { throw new Error('notFound') }\nexport const redirect = () => { throw new Error('redirect') }"
const HEADERS = "export async function cookies() { return { get() { return undefined }, getAll() { return [] }, set() {} } }\nexport async function headers() { return new Map() }"
const MS_USE = "const __msUse = (k, p) => (globalThis.__ms && Object.prototype.hasOwnProperty.call(globalThis.__ms, k) ? [globalThis.__ms[k], p[1]] : p);\n"
let bundleN = 0
async function bundleTree(root, tag, entry, { stubs = {}, patches = [] } = {}) {
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  const applied = new Map(patches.map((p, i) => [i, false]))
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const res = await esbuild.build({
    stdin: { contents: entry, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic', target: 'node20',
    logLevel: 'silent', alias: { '@': root }, loader: { '.css': 'empty', '.svg': 'text', '.png': 'empty', '.jpg': 'empty' },
    external: ['react', 'react-dom', 'react/jsx-runtime', 'next', 'next/server', 'puppeteer-core', '@sparticuz/chromium'],
    define: { 'process.env.NODE_ENV': '"development"', 'process.env.NEXT_PUBLIC_PRICING_PUBLISHED': '"true"' },
    plugins: [{ name: 'fn1-stubs', setup(b) {
      b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'fn1' }))
      b.onResolve({ filter: /(^@\/|\/)lib\/supabase(\.ts)?$/ }, () => ({ path: 'db', namespace: 'fn1' }))
      b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'dblib', namespace: 'fn1' }))
      b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'nav', namespace: 'fn1' }))
      b.onResolve({ filter: /^next\/headers$/ }, () => ({ path: 'headers', namespace: 'fn1' }))
      b.onResolve({ filter: /^next\/(image|link)$/ }, a => ({ path: a.path, namespace: 'fn1' }))
      for (const name of Object.keys(stubs)) b.onResolve({ filter: new RegExp('^' + esc(name) + '$') }, () => ({ path: 'custom:' + name, namespace: 'fn1' }))
      b.onLoad({ filter: /.*/, namespace: 'fn1' }, a => ({ loader: 'js', contents: a.path.startsWith('custom:') ? stubs[a.path.slice(7)]
        : a.path === 'db' ? DB_STUB : a.path === 'dblib' ? DBLIB_STUB : a.path === 'nav' ? NAV : a.path === 'headers' ? HEADERS
        : a.path === 'next/image' ? "import { createElement } from 'react'\nexport default function Image(p) { return createElement('img', { alt: p.alt, src: typeof p.src === 'string' ? p.src : '' }) }"
        : a.path === 'next/link' ? "import { createElement } from 'react'\nexport default function Link({ href, children, className }) { return createElement('a', { href: typeof href === 'string' ? href : '', className }, children) }" : '' }))
      const files = [...new Set(patches.map(p => p.file))]
      for (const rel of files) {
        b.onLoad({ filter: new RegExp(esc(rel.replace(/\.tsx?$/, '')) + '\\.tsx?$') }, a => {
          let src = fs.readFileSync(a.path, 'utf8')
          patches.forEach((p, i) => {
            if (p.file !== rel) return
            if (p.states) { src = kit.wrapStates(src, p.states, p.file) + '\n' + MS_USE; applied.set(i, true); return }
            const from = p.from instanceof RegExp ? p.from : null
            if (from ? from.test(src) : src.includes(p.from)) { src = from ? src.replace(from, p.to) : src.replace(p.from, p.to); applied.set(i, true) }
          })
          return { contents: src, loader: a.path.endsWith('x') ? 'tsx' : 'ts' }
        })
      }
    } }],
  })
  patches.forEach((p, i) => { if (!applied.get(i)) throw new Error(`[france-notes-1] ${tag}: a patch did not apply in ${p.file}: ${String(p.from || p.states).slice(0, 120)}`) })
  const dir = path.join(REPO, 'node_modules/.cache/france-notes-1-trees'); fs.mkdirSync(dir, { recursive: true })
  const out = path.join(dir, `${tag}-${bundleN++}.cjs`)
  fs.writeFileSync(out, res.outputFiles[0].text)
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:9'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'harness-anon'
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:9'
  return kit.quiet(() => require(out))
}
function extract(ref) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fn1-start-'))
  const tar = execFileSync('git', ['archive', '--format=tar', ref, 'app', 'lib', 'components', 'messages', 'hooks', 'data', 'types.ts', 'vercel.json', 'content'], { cwd: REPO, maxBuffer: 2e9 })
  execFileSync('tar', ['-x', '-C', dir], { input: tar, maxBuffer: 2e9 })
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'))
  return dir
}

// ── the recorders and the patches every route run needs (order-charges' set) ──
const EMAIL_PATCH = { file: 'lib/email.ts', from: 'export async function sendConfirmationEmail(params: {', to: 'export async function sendConfirmationEmail(params: any) { ((globalThis as any).__rec.emails).push(params); return true }\nasync function __realSendConfirmationEmail(params: {' }
const ACTOR_PATCH = { file: 'lib/audit/actor.ts', from: 'const supabaseAuth = await createSupabaseServerClient()', to: 'const supabaseAuth = { auth: { getUser: async () => ({ data: { user: null } }) } }' }
const ACCESS = role => ({ file: 'app/api/manage/route.ts', from: /const access = await resolveTruckAccess\(req, truck\)/g, to: `const access = { ok: true as const, role: '${role}' as const, userId: null, operatorId: null, via: 'harness' } as any` })
const STUBS = {
  '@/lib/apns': 'export async function sendOrderPendingPush(p) { globalThis.__rec.push.push(["apns", p]) }\nexport function normaliseApnsKey(k) { return k }',
  '@/lib/fcm': 'export async function sendOrderPendingPush(p) { globalThis.__rec.push.push(["fcm", p]) }',
  '@/lib/payments/authorize': `export async function authorizeDraft(s, a) { globalThis.__rec.auth.push(a); return { ok: true, clientSecret: 'cs_harness', stripeAccount: 'acct_harness' } }
export async function cancelAuthorization(a) { globalThis.__rec.auth.push({ cancel: a }); return { ok: true } }
export async function stripeAccountForTruck() { return 'acct_harness' }`,
  '@/lib/payments/capture': 'export async function captureOnConfirmation(s, a) { globalThis.__rec.capture.push(a); return { ok: true, outcome: "nothing_to_capture" } }',
}
const ROUTES = [
  "export { POST as SubmitPOST } from '@/app/api/orders/submit/route'",
  "export { promoteDraft } from '@/lib/payments/promote-draft'",
  "export { getOrderDraft } from '@/lib/payments/order-drafts'",
  "export { POST as ActionPOST } from '@/app/api/dashboard/action/route'",
  "export { GET as DashGET } from '@/app/api/dashboard/route'",
  "export { GET as StatusGET } from '@/app/api/orders/[id]/route'",
  "export { default as StatusPage } from '@/app/(app)/order/[id]/manage/page'",
  "export * as T from '@/lib/printing/ticket'",
  "export { mapOrderToTicket } from '@/lib/printing/mapOrderToTicket'",
  "export * as RET from '@/lib/order-retention'",
  "export * as AUD from '@/lib/audit/order-audit'",
  "export { clearCountrySettingsCache } from '@/lib/country-settings'",
].join('\n')
const PATCHES = [EMAIL_PATCH, ACTOR_PATCH, { file: 'app/(app)/order/[id]/manage/page.tsx', states: ['order', 'loading'] }]
const MANAGE = "export { POST as ManagePOST } from '@/app/api/manage/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'"

// ── the fixtures: Pizza Kitchen (GB), today's event ──
const GB = snake(SEEDS.gbFromSeed())
const TRUCK = { id: 'test-truck', slug: 'test-kitchen', name: 'Pizza Kitchen', active: true, plan: 'pro', country: 'GB', currency: 'GBP', timezone: 'Europe/London',
  auto_accept: true, operator_id: 'op-test', time_selection_enabled: true, contact_email: 'kitchen@example.test', dashboard_token: 'tok-test', dashboard_pin: null, takes_cash: true,
  allow_customer_cancellation: true, cancellation_cutoff_mins: 30 }
function tables(over = {}) {
  return {
    trucks: [{ ...TRUCK, ...(over.truck || {}) }], country_settings: [GB], operators: [{ id: 'op-test' }],
    menu_items_db: [
      { id: 'i1', truck_id: 'test-truck', name: 'Margherita', price: 9.5, category_id: 'c1', category: 'Pizzas', available: true, is_active: true },
      { id: 'i2', truck_id: 'test-truck', name: 'Pepperoni', price: 10.75, category_id: 'c1', category: 'Pizzas', available: true, is_active: true },
      { id: 'i3', truck_id: 'test-truck', name: 'Lemonade', price: 2.4, category_id: 'c2', category: 'Drinks', available: true, is_active: true },
    ],
    menu_categories: [{ id: 'c1', truck_id: 'test-truck', name: 'Pizzas' }, { id: 'c2', truck_id: 'test-truck', name: 'Drinks' }],
    modifier_groups: [{ id: 'g1', truck_id: 'test-truck', name: 'Extras', is_required: false, min_choices: 0, max_choices: 99 }],
    modifier_options: [{ id: 'o1', group_id: 'g1', name: 'Extra cheese', price_adjustment: 1.2, available: true, modifier_groups: { truck_id: 'test-truck' }, 'modifier_groups.truck_id': 'test-truck' }],
    item_modifier_groups: [{ menu_item_id: 'i1', group_id: 'g1', excluded_option_ids: [], menu_items_db: { name: 'Margherita', truck_id: 'test-truck' }, 'menu_items_db.truck_id': 'test-truck' }],
    bundles_db: [{ id: 'b1', truck_id: 'test-truck', name: 'Meal Deal', bundle_price: 11, original_price: 12.9, active: true }],
    truck_events: [{ id: 'ev1', truck_id: 'test-truck', event_date: '2026-10-09', status: 'confirmed', start_time: '11:00', end_time: '20:00', venue_name: 'The Green', town: 'Testville', postcode: 'AB1 2CD', van_id: null }],
    discount_codes_db: [], orders: (over.orders || []).map(o => JSON.parse(J(o))), order_drafts: [], order_payments: [], booking_locks: [], action_audit_log: [],
    collection_times: [], truck_vans: [],
    ...require('./_lp1c-fixtures.cjs').planTables(),
  }
}
const NOW = '2026-10-09T11:00:00.000Z'
async function run(O, fn, seed) {
  const db = makeFakePg(seed, { keys: { orders: [['order_key'], ['event_id', 'id']], order_drafts: [['order_key']], production_slot_usage: [['truck_id', 'event_id', 'production_slot']] },
    defaults: { orders: { currency: 'GBP', country: 'GB' } } })
  let counter = 40
  const rpc = async (name, args) => {
    if (/^place_order_atomic/.test(name)) {
      const key = 'ok-hatch-1'
      db.tables.orders.push({ order_key: key, id: '41', truck_id: args.p_truck_id, currency: 'GBP', country: 'GB', ...JSON.parse(J(args.p_order)), slot: args.p_final_slot, status: args.p_status, event_id: args.p_event_id, event_date: args.p_event_date, line_notes: null, created_at: NOW, placed_at: NOW })
      return { data: { order_key: key, order_number: 41, slot: args.p_final_slot }, error: null }
    }
    if (/increment_(event_)?order_counter/.test(name)) return { data: ++counter, error: null }
    return { data: null, error: null }
  }
  globalThis.__harnessDb = { ...db, rpc, auth: { getUser: async () => ({ data: { user: null }, error: null }) } }
  globalThis.__rec = { emails: [], push: [], auth: [], capture: [] }
  let uuid = 0
  const realUUID = crypto.randomUUID
  crypto.randomUUID = () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`
  try {
    O.clearCountrySettingsCache()
    const out = await kit.quietAsync(() => fn(db))
    return { out, db, emails: globalThis.__rec.emails.map(e => ({ to: e.to, subject: e.subject, html: e.html, text: e.text })) }
  } finally { crypto.randomUUID = realUUID; delete globalThis.__harnessDb }
}
const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
const post = (url, body) => new NextRequest(`http://localhost${url}`, { method: 'POST', body: J(body), headers: { 'content-type': 'application/json' } })
const json = async res => ({ status: res.status, body: await res.json() })
const rowsOf = db => (db.tables || {}).orders || []

const CUSTOMER = { customerName: 'Ann Example', customerEmail: 'ann@example.test', customerPhone: '07700900000' }
// The basket: a dish with a note, a dish with an EMPTY note, a dish with no note field, a deal with a slot note; and an order note.
const ITEMS = [
  { name: 'Margherita', quantity: 2, unit_price: 9.5, modifiers: [{ name: 'Extra cheese', price: 1.2 }], specialInstructions: 'No basil — nut allergy' },
  { name: 'Pepperoni', quantity: 1, unit_price: 10.75, modifiers: [], specialInstructions: '' },
  { name: 'Lemonade', quantity: 1, unit_price: 2.4, modifiers: [] },
]
const DEALS = [{ name: 'Meal Deal', quantity: 1, price: 11, slots: { Pizza: 'Pepperoni', Drink: 'Lemonade' }, slotNotes: { Pizza: 'BIEN CUIT, no peanuts' } }]
const SUBMIT = (extra = {}) => ({ truckId: 'test-kitchen', ...CUSTOMER, slot: '12:00', eventDate: '2026-10-09', eventId: 'ev1', items: ITEMS, deals: DEALS, notes: 'Ring twice', ...extra })

;(async () => {
  kit.setNow(NOW); kit.setDeviceTz('Europe/London')
  const L = await bundleTree(REPO, 'ln', "export * from '@/lib/line-notes'")

  // ══ A ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('A · THE HELPER — split at the write, merge at the read, byte for byte')
  {
    const lines = [
      { name: 'A', quantity: 1, unit_price: 5, modifiers: [], specialInstructions: 'No onions', item_id: 'm1', tax_rate_milli: null },
      { name: 'B', quantity: 2, unit_price: 3 },
      { name: 'C', quantity: 1, unit_price: 1, modifiers: [], specialInstructions: '' },
      { name: 'D', quantity: 1, cartKey: 'k1', specialInstructions: 'x' }, { name: 'E', quantity: 1, cartKey: 'k1', specialInstructions: 'y' },
    ]
    const deals = [{ name: 'Deal', price: 10, slots: { main: 'A' }, slotModifiers: {}, slotNotes: { main: 'nuts', side: '' }, tax_parts: [{ tax_rate_milli: null, minor: 1000 }] }, { name: 'Deal2', price: 5, slots: {} }]
    const s = L.splitLineNotes(lines, deals)
    t('split: no line keeps specialInstructions, no deal keeps slotNotes; everything else exactly as it was', s.items.every(l => !('specialInstructions' in l)) && s.deals.every(d => !('slotNotes' in d)) && J(s.items[0]) === J({ name: 'A', quantity: 1, unit_price: 5, modifiers: [], item_id: 'm1', tax_rate_milli: null }) && J(s.items[1]) === J(lines[1]) && J(s.deals[1]) === J(deals[1]))
    t('…line_notes keys each note to its line: the cartKey when it has one (a cartKey seen twice: the position), else the position', J(Object.keys(s.line_notes.items)) === J(['#0', '#2', 'k:k1', '#4']) && s.line_notes.items['#2'].note === '' && J(Object.keys(s.line_notes.deals)) === J(['#0']))
    const m = L.mergeLineNotes(s.items, s.deals, s.line_notes)
    t('merge (insertion order, as a test database keeps it): the lines are byte-identical to what was split — key order, the empty note, the absent field', J(m.items) === J(lines) && J(m.deals) === J(deals), { got: m.items, want: lines })
    // A stored line whose keys are already in jsonb's order is one READ FROM THE DATABASE: the field goes where jsonb would put it.
    const one = L.splitLineNotes([{ name: 'P', specialInstructions: 'x', quantity: 1 }], null)
    t('…a stored line whose keys are in jsonb\'s order gets the field where jsonb puts it (that is how the live column returned the old-style line)', J(L.mergeLineNotes(one.items, null, one.line_notes).items) === J([{ name: 'P', quantity: 1, specialInstructions: 'x' }]))
    // jsonb hands objects back with their keys shortest-first, then byte order: what a real column returns for the OLD-style row is
    const jsonb = v => Array.isArray(v) ? v.map(jsonb) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, jsonb(x)]).sort(([a], [b]) => (Buffer.byteLength(a) - Buffer.byteLength(b)) || Buffer.compare(Buffer.from(a), Buffer.from(b)))) : v
    const mj = L.mergeLineNotes(jsonb(s.items), jsonb(s.deals), jsonb(s.line_notes))
    t('merge (jsonb order, as the live column returns it): byte-identical to the OLD-style row read back from jsonb (proven live too: the rolled-back proof 3b)', J(mj.items) === J(jsonb(lines)) && J(mj.deals) === J(jsonb(deals)), { got: mj.items[0], want: jsonb(lines)[0] })
    t('no line with a note field → line_notes null, the arrays themselves returned; no line_notes → merge returns what was stored', L.splitLineNotes([{ name: 'X' }], null).line_notes === null && J(L.mergeLineNotes(lines, deals, null)) === J({ items: lines, deals }) && J(L.mergeLineNotes(lines, deals, { not: 'ours' })) === J({ items: lines, deals }))
    const row = { id: '1', items: s.items, deals: s.deals, line_notes: s.line_notes, notes: 'n' }
    const und = L.splitLineNotes([{ name: 'U', quantity: 1, modifiers: undefined, specialInstructions: 'n', item_id: 'x', tax_rate_milli: null }], null)
    t('a key whose value is undefined (JSON drops it, so it never reaches the column) does not shift the note\'s place', J(L.mergeLineNotes(JSON.parse(J(und.items)), null, und.line_notes).items) === J([{ name: 'U', quantity: 1, specialInstructions: 'n', item_id: 'x', tax_rate_milli: null }]))
    t('withLineNotes: the row with its lines merged and NO line_notes key (an API answer is what it was); withSplitNotes names line_notes only when needed', J(L.withLineNotes(row)) === J({ id: '1', items: lines, deals, notes: 'n' }) && !('line_notes' in L.withSplitNotes({ items: [{ name: 'X' }], deals: [] })) && 'line_notes' in L.withSplitNotes({ items: lines, deals }))
    const bl = L.blankLineNotes(s.line_notes)
    t('blankLineNotes: every note \'\', every slot-notes {} (as retention blanks them inside items); a second pass changes nothing', bl.changed && Object.values(bl.value.items).every(e => e.note === '') && J(bl.value.deals['#0'].slotNotes) === '{}' && !L.blankLineNotes(bl.value).changed)
  }

  // ── the two trees ──
  const startDir = extract(START)
  const S = await bundleTree(startDir, 'start', ROUTES, { stubs: STUBS, patches: PATCHES })
  const H = await bundleTree(REPO, 'head', ROUTES, { stubs: STUBS, patches: PATCHES })
  const SM = await bundleTree(startDir, 'start-manage', MANAGE, { patches: [ACCESS('owner')] }), HM = await bundleTree(REPO, 'head-manage', MANAGE, { patches: [ACCESS('owner')] })

  // ══ B ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('B · EVERY WRITE PATH — no note in items / deals, the same notes in line_notes, the lines read back as sent')
  const noNotes = r => (r.items || []).every(l => !('specialInstructions' in l)) && (r.deals || []).every(d => !('slotNotes' in d))
  const sameNotes = (r, items, deals) => { const m = L.mergeLineNotes(r.items, r.deals, r.line_notes); return J(m.items.map(l => l.specialInstructions)) === J(items.map(l => l.specialInstructions)) && J((m.deals || []).map(d => d.slotNotes)) === J((deals || []).map(d => d.slotNotes)) }
  let hatchRow, walkRow
  {
    const r = await run(H, async () => json(await H.SubmitPOST(post('/api/orders/submit', SUBMIT()))), tables())
    const row = rowsOf(r.db).find(o => o.order_key === 'ok-hatch-1')
    hatchRow = row
    t(`the customer submit (pay at the truck, ${r.out.status}): the stored order holds no note in items / deals, and line_notes holds the dish notes (the empty one too) and the slot note`, r.out.status === 200 && !!row && noNotes(row) && !!row.line_notes && sameNotes(row, ITEMS, DEALS), row && { items: row.items, line_notes: row.line_notes })
    t('…the move is the guarded follow-up update (only while line_notes is NULL), inside the same request; place_order_atomic_v2 is called as before', r.db.writes.some(w => w.table === 'orders' && w.op === 'update' && w.patch && 'line_notes' in w.patch) && /\.update\(\{ items: noteSplit\.items, deals: noteSplit\.deals, line_notes: noteSplit\.line_notes \}\)\n\s*\.eq\('order_key', order\.order_key\)\.is\('line_notes', null\)/.test(read('app/api/orders/submit/route.ts')))
    const c = await run(H, async db => {
      const r1 = await json(await H.SubmitPOST(post('/api/orders/submit', SUBMIT({ payByCard: true }))))
      const draft = db.tables.order_drafts[0]
      if (draft) draft.payment_intent_id = 'pi_harness'
      const draftRead = draft ? await H.getOrderDraft(globalThis.__harnessDb, draft.order_key) : null
      const r2 = draft ? await H.promoteDraft(globalThis.__harnessDb, draft.order_key, 'webhook') : null
      return { submit: r1, promote: r2, draftStored: draft && JSON.parse(J(draft)), draftRead }
    }, tables())
    const ord = rowsOf(c.db)[0]
    t('the card draft: stored with no note in items / deals and the notes in line_notes; read back (getOrderDraft) with its notes where they were and no line_notes key',
      !!c.out.draftStored && noNotes(c.out.draftStored) && !!c.out.draftStored.line_notes && !('line_notes' in (c.out.draftRead || {})) && c.out.draftRead.items[0].specialInstructions === ITEMS[0].specialInstructions && c.out.draftRead.items[1].specialInstructions === '' && !('specialInstructions' in c.out.draftRead.items[2]), c.out.draftStored)
    t('…its promotion: the order holds no note in items / deals and the same notes in line_notes', !!ord && noNotes(ord) && !!ord.line_notes && sameNotes(ord, c.out.draftRead.items, c.out.draftRead.deals), ord && { items: ord.items, line_notes: ord.line_notes })
    const WALK = { token: 'tok-test', action: 'manual', manualOrder: { customerName: 'Walk-up', customerEmail: 'walk@example.test', slot: '13:00', event_date: '2026-10-09', event_id: 'ev1', order_key: 'ok-walk-1', provisional_id: '77',
      notes: 'Ring twice', items: [{ name: 'Pepperoni', quantity: 2, unit_price: 10.75, modifiers: [], specialInstructions: 'No basil please' }, { name: 'Lemonade', quantity: 1, unit_price: 2.4, modifiers: [] }] } }
    const w = await run(H, async () => {
      const a = await json(await H.ActionPOST(post('/api/dashboard/action', WALK)))
      const b = await json(await H.ActionPOST(post('/api/dashboard/action', WALK)))   // the offline replay: the same order_key again
      return { a, b }
    }, tables())
    const wr = rowsOf(w.db).filter(o => o.order_key === 'ok-walk-1')
    walkRow = wr[0]
    t(`the walk-up (${w.out.a.status}): the order holds no note in items, the note in line_notes`, w.out.a.status === 200 && wr.length === 1 && noNotes(wr[0]) && wr[0].line_notes?.items?.['#0']?.note === 'No basil please', wr[0] && { items: wr[0].items, line_notes: wr[0].line_notes })
    t(`…its offline replay (the same order_key, ${w.out.b.status}): skipped — still one row, unchanged, the same answer`, w.out.b.status === 200 && wr.length === 1 && J(w.out.a.body.orderKey ?? w.out.a.body.order_key ?? null) === J(w.out.b.body.orderKey ?? w.out.b.body.order_key ?? null), { a: w.out.a.body, b: w.out.b.body })
    // the edit — a new-style order (notes in line_notes) and an old-style one (notes in items): a note added on a new line, a note changed
    const BASE = { id: '12', truck_id: 'test-truck', customer_name: 'Bob Example', customer_email: 'bob@example.test', customer_phone: null, slot: '12:30', order_type: 'collection', event_date: '2026-10-09', event_id: 'ev1', van_id: null,
      deals: [], discount_code: null, subtotal: 10.75, discount_amt: 0, total: 10.75, total_minor: 1075, currency: 'GBP', country: 'GB', notes: null, status: 'confirmed', payment_status: 'unpaid', amount_paid: 0, created_at: NOW }
    const oldItems = [{ name: 'Pepperoni', quantity: 1, unit_price: 10.75, modifiers: [], specialInstructions: 'Well done' }]
    const sp = L.splitLineNotes(oldItems, [])
    const EDIT = key => ({ token: 'tok-test', action: 'edit', order_key: key, editedOrder: { items: [{ name: 'Pepperoni', quantity: 1, unit_price: 10.75, modifiers: [], specialInstructions: 'Well done, extra crispy' }, { name: 'Lemonade', quantity: 2, unit_price: 2.4, modifiers: [], specialInstructions: 'No ice' }] } })
    for (const [label, row] of [['a new-style order', { ...BASE, order_key: 'ok-new-1', items: sp.items, line_notes: sp.line_notes }], ['an old-style order (notes in items)', { ...BASE, order_key: 'ok-old-1', items: oldItems, line_notes: null }]]) {
      const e = await run(H, async () => json(await H.ActionPOST(post('/api/dashboard/action', EDIT(row.order_key)))), tables({ orders: [row] }))
      const er = rowsOf(e.db)[0]
      const back = L.mergeLineNotes(er.items, er.deals, er.line_notes)
      t(`the edit of ${label} (${e.out.status}): a note changed and a note added on a new line — items hold none, line_notes holds both`, e.out.status === 200 && noNotes(er) && J(back.items.map(l => l.specialInstructions)) === J(['Well done, extra crispy', 'No ice']), { items: er.items, line_notes: er.line_notes })
    }
    const SEED = read('lib/seed-demo-orders.ts')
    t('demo seeding goes through the same write rule (its lines carry no note, so it changes nothing)', /\.from\('orders'\)\.insert\(withSplitNotes\(r\)\)/.test(SEED) && !/specialInstructions|slotNotes/.test(SEED))
  }

  // ══ C ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head(`C · NOTHING ANYONE SEES CHANGES — START ${START} (old-style rows) vs this tree (old-style AND new-style rows)`)
  {
    // the stored order: what START's customer submit STORES (old-style — and what the deployed code stores), and what this tree's submit
    // stores for the SAME request (new-style). Each made pending, so the operator's confirm sends its email from the stored row.
    const rS = await run(S, async () => json(await S.SubmitPOST(post('/api/orders/submit', SUBMIT()))), tables())
    const rH = await run(H, async () => json(await H.SubmitPOST(post('/api/orders/submit', SUBMIT()))), tables())
    const prep = r => { const o = JSON.parse(J(rowsOf(r.db).find(x => x.order_key === 'ok-hatch-1'))); return { ...o, status: 'pending', order_key: 'ok-c1' } }
    const OLD = { ...prep(rS), line_notes: null }, NEW = prep(rH)
    t('the fixture: two dish notes (one empty), a deal slot note and an order note — START stores them in items (old-style), this tree in line_notes (new-style); otherwise the same row', NOTE_RE.test(J(OLD.items)) && NOTE_RE.test(J(OLD.deals)) && !NOTE_RE.test(J(NEW.items) + J(NEW.deals)) && NOTE_RE.test(J(NEW.line_notes)) && OLD.notes === 'Ring twice'
      && J(L.withLineNotes(NEW)) === J((({ line_notes, ...o }) => o)(OLD)), firstDiff(J((({ line_notes, ...o }) => o)(OLD)), J(L.withLineNotes(NEW))))
    const startRow = { ...OLD }; delete startRow.line_notes   // START's database has no such column
    const views = async (O, M, row) => {
      const out = {}
      // the operator confirms the pending order: the customer confirmation email, built from the STORED row
      const conf = await run(O, async () => json(await O.ActionPOST(post('/api/dashboard/action', { token: 'tok-test', action: 'confirm', order_key: row.order_key }))), tables({ orders: [row] }))
      out.confirmEmail = conf.emails
      // the status API and page
      const st = await run(O, async () => json(await O.StatusGET(new NextRequest(`http://localhost/api/orders/${row.order_key}`), { params: Promise.resolve({ id: row.order_key }) })), tables({ orders: [{ ...row, trucks: TRUCK }] }))
      out.statusApi = st.out
      globalThis.__ms = { order: st.out.body, loading: false }
      try { out.statusPage = kit.quiet(() => require(path.join(REPO, 'node_modules/react-dom/server')).renderToStaticMarkup(require(path.join(REPO, 'node_modules/react')).createElement(O.StatusPage))) } finally { delete globalThis.__ms }
      // the dashboard API (the dashboard, the KDS, the edit screens) and the tickets from its rows
      const dash = await run(O, async () => json(await O.DashGET(new NextRequest('http://localhost/api/dashboard?token=tok-test&date=2026-10-09&event_id=ev1'))), tables({ orders: [{ ...row, status: 'confirmed' }] }))
      const ords = [...(dash.out.body.activeOrders || dash.out.body.orders || []), ...(dash.out.body.doneToday || [])]
      out.dashOrders = ords
      out.dashKeys = Object.keys(dash.out.body).sort()
      out.tickets = ords.map(o => [58, 80].map(w => Buffer.from(O.T.renderTicket(O.mapOrderToTicket({ order: o, truck: dash.out.body.truck, event: null, ledgerRows: [], printedLabel: '9 Oct 12:01' }), { paper_width: w })).toString('hex')))
      // Reports (its Orders and Items CSVs are built from these rows)
      const db = makeFakePg(tables({ orders: [{ ...row, status: 'confirmed' }] }))
      globalThis.__harnessDb = db; M.clearCountrySettingsCache()
      try { const res = await kit.quietAsync(() => M.ManagePOST(new NextRequest('http://127.0.0.1:3999/api/manage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: J({ token: 'tok-test', action: 'get_report', eventId: 'ev1' }) }))); const rb = await res.json(); out.report = { status: res.status, report: rb.report ?? null } } finally { delete globalThis.__harnessDb }
      return out
    }
    const vS = await views(S, SM, startRow), vO = await views(H, HM, OLD), vN = await views(H, HM, NEW)
    const PARTS = [['confirmEmail', 'the customer confirmation email (HTML + text) the operator\'s confirm sends from the stored row'], ['statusApi', 'the status API (/api/orders/[id] — the order page\'s in-page confirmation reads it too)'], ['statusPage', 'the status page'],
      ['dashOrders', 'the dashboard API\'s orders (the dashboard, the KDS, the edit screens)'], ['dashKeys', 'the dashboard API\'s keys'], ['tickets', 'the ticket bytes, 58 and 80 mm'], ['report', 'Reports (get_report — its Orders and Items CSVs)']]
    for (const [k, label] of PARTS) {
      t(`${label}: byte-identical to START — old-style AND new-style`, J(vS[k]) === J(vO[k]) && J(vS[k]) === J(vN[k]), J(vS[k]) !== J(vN[k]) ? firstDiff(J(vS[k]), J(vN[k])) : firstDiff(J(vS[k]), J(vO[k])))
    }
    t('…and the comparison carries the notes (they are in what START shows: the email, the API, the dashboard rows, the tickets, Reports)', NOTE_RE.test(J(vS.confirmEmail)) && NOTE_RE.test(J(vS.statusApi)) && NOTE_RE.test(J(vS.dashOrders)) && NOTE_RE.test(J(vS.report)) && vS.tickets.length === 1 && vS.confirmEmail.length >= 1 && vS.report.status === 200 && vS.dashOrders.length === 1, { email: NOTE_RE.test(J(vS.confirmEmail)), api: NOTE_RE.test(J(vS.statusApi)), dash: NOTE_RE.test(J(vS.dashOrders)), report: NOTE_RE.test(J(vS.report)), tickets: vS.tickets.length, reportKeys: Object.keys(vS.report.report || {}) })
    // the emails sent while the order is placed: the customer's and the truck's new-order email, from the submit and from the walk-up
    for (const [label, fn] of [
      ['the customer submit', O => run(O, async () => json(await O.SubmitPOST(post('/api/orders/submit', SUBMIT()))), tables())],
      ['the walk-up', O => run(O, async () => json(await O.ActionPOST(post('/api/dashboard/action', { token: 'tok-test', action: 'manual', manualOrder: { customerName: 'Walk-up', customerEmail: 'walk@example.test', slot: '13:00', event_date: '2026-10-09', event_id: 'ev1', order_key: 'ok-walk-9', provisional_id: '79', notes: 'Ring twice', items: ITEMS.map(i => ({ ...i })), deals: DEALS.map(d => ({ ...d })) } }))), tables())],
    ]) {
      const a = await fn(S), b = await fn(H)
      t(`${label}: the customer email and the truck's new-order email are byte-identical to START (${a.emails.length} email(s), with the notes in them)`, a.emails.length >= 1 && J(a.emails) === J(b.emails) && NOTE_RE.test(J(a.emails)), firstDiff(J(a.emails), J(b.emails)))
    }
    t('the order page\'s in-page confirmation reads the status API (so it is the API above, byte for byte)', /fetch\(`\/api\/orders\/\$\{/.test(read('app/(app)/trucks/[slug]/order/page.tsx')))
    const changed = execFileSync('git', ['diff', '--name-only', START, '--', 'components', 'app/(app)', 'lib/email.ts', 'lib/printing', 'lib/order-charge-lines.ts', 'lib/receipt.ts'], { cwd: REPO, encoding: 'utf8' }).trim()
    t('no screen, email, ticket or CSV code changed since START (components/, every page, the email and ticket builders): only where the notes are stored', changed === '', changed)
  }

  // ══ D ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('D · RETENTION — a new-style order\'s lines never rewritten; an old-style order cleaned exactly as before')
  {
    const OLD = { order_key: 'r1', customer_name: 'Ann Example', customer_email: 'ann@example.test', customer_phone: '07700900000', notes: 'Ring twice', items: JSON.parse(J(ITEMS)), deals: JSON.parse(J(DEALS)) }
    const sp = L.splitLineNotes(OLD.items, OLD.deals)
    const NEW = { ...OLD, items: sp.items, deals: sp.deals, line_notes: sp.line_notes }
    const pS = S.RET.retentionPatch(OLD, ''), pO = H.RET.retentionPatch({ ...OLD, line_notes: null }, ''), pN = H.RET.retentionPatch(NEW, '')
    t('an old-style order (no line_notes): exactly START\'s patch — the customer fields, the order note, the notes inside items / deals', J(pS) === J(pO) && 'items' in pO && 'deals' in pO, { pS, pO })
    const after = { ...NEW, ...pN }
    t('a new-style order: the patch blanks the customer fields, the order note and line_notes — and names NEITHER items NOR deals', !('items' in pN) && !('deals' in pN) && pN.customer_name === '' && pN.customer_email === null && pN.customer_phone === null && pN.notes === null && !NOTE_RE.test(J(pN.line_notes)), pN)
    t('…after it, the order\'s items and deals are byte-identical to before; read back, its lines show no note (as an old-style order\'s do once cleaned)', J(after.items) === J(NEW.items) && J(after.deals) === J(NEW.deals) && !NOTE_RE.test(J(L.withLineNotes(after))) && J(L.withLineNotes(after).items.map(l => l.specialInstructions)) === J(S.RET.scrubItems(OLD.items).value.map(l => l.specialInstructions)))
    t('…and it is idempotent: a second run has nothing left to write', H.RET.retentionPatch(after, '') === null)
    t('the job reads line_notes with the rest (COLS) and the privacy text is not touched', /const COLS = '[^']*, line_notes'/.test(read('lib/order-retention.ts')) && execFileSync('git', ['diff', '--name-only', START, '--', 'content/legal'], { cwd: REPO, encoding: 'utf8' }).trim() === '')
  }

  // ══ E ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('E · THE AUDIT — no notes in a snapshot, and none in the rows the routes wrote')
  {
    const snapOld = H.AUD.orderAuditSnapshot({ items: ITEMS, deals: DEALS, notes: 'Ring twice', status: 'confirmed' })
    const sp = L.splitLineNotes(ITEMS, DEALS)
    const snapNew = H.AUD.orderAuditSnapshot({ items: sp.items, deals: sp.deals, line_notes: sp.line_notes, notes: 'Ring twice', status: 'confirmed' })
    t('orderAuditSnapshot: no note (dish, slot, order) in an old-style or a new-style order\'s snapshot, and no line_notes', !NOTE_RE.test(J(snapOld)) && !NOTE_RE.test(J(snapNew)) && !('line_notes' in snapNew) && !('notes' in snapNew))
    const r = await run(H, async () => json(await H.SubmitPOST(post('/api/orders/submit', SUBMIT()))), tables())
    const w = await run(H, async () => json(await H.ActionPOST(post('/api/dashboard/action', { token: 'tok-test', action: 'manual', manualOrder: { customerName: 'Walk-up', slot: '13:00', event_date: '2026-10-09', event_id: 'ev1', order_key: 'ok-walk-8', provisional_id: '80', notes: 'Ring twice', items: ITEMS.map(i => ({ ...i })) } }))), tables())
    const audit = [...r.db.writes, ...w.db.writes].filter(x => x.table === 'action_audit_log').map(x => x.row)
    t(`the order_placed rows the submit and the walk-up wrote (${audit.filter(a => a?.action === 'order_placed').length}) carry no note text and no line_notes`, audit.filter(a => a?.action === 'order_placed').length === 2 && !NOTE_RE.test(J(audit)) && !/line_notes/.test(J(audit)), J(audit).slice(0, 300))
  }

  // ══ F ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('F · STRUCTURE — every reader of a stored row merges; every writer splits')
  {
    const ACT = read('app/api/dashboard/action/route.ts')
    t('the dashboard action route: every select(\'*\') of an order is merged (withLineNotes), and the slot change\'s two reads too', (ACT.match(/const \{ data: orderRow \} = await supabase\.from\('orders'\)\.select\('\*'\)/g) || []).length === 5 && (ACT.match(/const order = withLineNotes\(orderRow\)/g) || []).length === 5 && /const ord = withLineNotes\(ordRow\)/.test(ACT) && /full\.data = withLineNotes\(full\.data\)/.test(ACT) && !/const \{ data: order \} = await supabase\.from\('orders'\)\.select\('\*'\)/.test(ACT))
    t('the walk-up writes withSplitNotes (the insert and the replay); the edit writes splitLineNotes, and clears line_notes when the last note goes', /const storedPayload = withSplitNotes\(insertPayload\)/.test(ACT) && /upsert\(storedPayload,/.test(ACT) && /insert\(storedPayload\)/.test(ACT) && /const editSplit = splitLineNotes\(editPatch\.items, editPatch\.deals\)/.test(ACT))
    t('the dashboard API, the status API, Reports and the draft reads merge; the draft and promotion inserts split', /\(a \|\| \[\]\)\.map\(withLineNotes\)/.test(read('app/api/dashboard/route.ts')) && /const order = withLineNotes\(orderRow\)/.test(read('app/api/orders/[id]/route.ts')) && /out\.push\(\.\.\.\(data \?\? \[\]\)\.map\(withLineNotes\)\)/.test(read('app/api/manage/route.ts'))
      && (read('lib/payments/order-drafts.ts').match(/withLineNotes\(/g) || []).length >= 3 && /\.insert\(withSplitNotes\(\{/.test(read('lib/payments/order-drafts.ts')) && /\.insert\(withSplitNotes\(\{/.test(read('lib/payments/promote-draft.ts')))
    const M = read('supabase/migrations/20261127_france_notes_1.sql').replace(/--[^\n]*/g, '')
    t('the migration: two nullable jsonb columns and their comments — nothing else (no backfill, no constraint, no function)', /add column if not exists line_notes jsonb;[\s\S]*add column if not exists line_notes jsonb;/.test(M) && !/\bupdate\b|\bcheck\b|\bfunction\b|\btrigger\b|\bdrop\b|not null|default/i.test(M))
    for (const [f, n] of [['docs/france-notes-1/preflight-20261127.log', 8], ['docs/france-notes-1/notes-check.log', 8]]) {
      const Lg = read(f), b = (Lg.match(/counts before: (.*)/) || [])[1], a = (Lg.match(/counts after: (.*)/) || [])[1]
      t(`${path.basename(f)}: ${n} proofs passed, every transaction rolled back, the demo trucks' counts identical`, (Lg.match(/^ {2}✓ /gm) || []).length === n && /✅ every proof passed/.test(Lg) && !/🔴/.test(Lg) && !!b && b === a)
    }
  }

  console.log(`\n${fail ? '🔴' : '✅'} france-notes-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
