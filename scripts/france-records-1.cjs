#!/usr/bin/env node
// scripts/france-records-1.cjs — france-records-1 (24 November 2026, docs/france-records-1-report.md): business details, the gap-free receipt
// number, the daily-totals file by VAT rate, the order audit rows, retention left as it is, and NOTHING customer-facing changed.
//   node scripts/france-records-1.cjs        (NO NETWORK, NO DATABASE)
//
//   A · BUSINESS DETAILS — SIREN / SIRET with Luhn (and La Poste's rule), GB's 8-character company number, EU VAT formats (format only),
//       free text elsewhere, the French regime; the real /api/manage route: the owner saves exactly the named columns; a manager and staff
//       are refused and nothing is written; the franchise note's rule.
//   B · THE RECEIPT NUMBER — the migration's trigger (row-locked counter, ON CONFLICT, 2 s lock_timeout, never fails the insert, the
//       replay guard, the keep-on-update trigger), place_order_atomic_v2 untouched, every insert path reaching the trigger, no code that
//       sets receipt_no; and the LIVE proofs, run with scripts/db-rollback-proofs.cjs against demo trucks in transactions that were rolled
//       back — their recorded logs (docs/france-records-1/*.log) say every proof passed and every count was identical before and after.
//   C · THE DAILY TOTALS FILE, worked through — two days on a French test truck: the mixed order (crêpe 10 %, can 5,5 %, cider 20 %), the
//       same with a 10 % code and a partial refund made the next day, a pending order (left out), a counter order paid and then cancelled
//       the next day (its money comes back on the cancellation's day), a rejected order (left out); a UK No-VAT order left out and
//       counted; the period presets for all four regimes (and no regime); the CSV's bytes.
//   D · THE AUDIT LOG — the real /api/dashboard/action route writes order_edited (items, deals and totals before and after), order_cancelled
//       and order_rejected; placement is logged on the three paths; a snapshot never carries the customer's details or notes.
//   E · RETENTION — unchanged (Dominic's decision 1 = C): lib/order-retention.ts byte-identical to this prompt's start; it still blanks
//       the customer fields and notes.
//   F · NOTHING CUSTOMER-FACING CHANGED — the customer email (HTML + text), the truck's new-order email, the ticket's bytes (58 and 80 mm),
//       the status page's charges and the order API's charges, for a single-rate and a mixed-rate order, byte-identical to START (extracted
//       from git) — with a receipt number and business details on the HEAD rows.
//   G · THE WORDS — the 60 new strings in en-GB and every language base an enabled country uses; the accountant CSV's "Receipt no." column.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
require('./_disk-guard.cjs').guard(__filename)
require('./_harness-tmp.cjs')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const kit = require('./_render-kit.cjs')({ cacheTag: 'france-records-1' })
const { REPO } = kit
const { makeFakePg } = require('./_fake-pg.cjs')
const SEEDS = require('./_country-settings-gb.cjs')
const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))

/** 🔴 THIS PROMPT'S STARTING COMMIT (never HEAD): inbox-2's 38d579e6, the branch tip when france-records-1 began. */
const START = '38d579e6'

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 1200) : JSON.stringify(detail).slice(0, 1200)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const J = v => JSON.stringify(v)
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const code = s => s.replace(/--[^\n]*/g, '')

// ── a bundle from any tree (france-vat-1's method): the stubs these modules need ──
const STUB = {
  'server-only': '',
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
    external: ['react', 'react-dom', 'react/jsx-runtime', 'next', 'next/*'], define: { 'process.env.NODE_ENV': '"development"' },
    plugins: [{ name: 'fr1-stubs', setup(b) {
      b.onResolve({ filter: /^server-only$/ }, () => ({ path: 'server-only', namespace: 'fr1' }))
      b.onResolve({ filter: /(^@\/|\/)lib\/supabase(\.ts)?$|^@supabase\/supabase-js$/ }, () => ({ path: 'db', namespace: 'fr1' }))
      b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'nav', namespace: 'fr1' }))
      b.onResolve({ filter: /^next\/headers$/ }, () => ({ path: 'headers', namespace: 'fr1' }))
      b.onLoad({ filter: /.*/, namespace: 'fr1' }, a => ({ contents: STUB[a.path] ?? '', loader: 'js' }))
    } }],
  })
  const dir = path.join(REPO, 'node_modules/.cache/france-records-1-trees'); fs.mkdirSync(dir, { recursive: true })
  const out = path.join(dir, `${tag}-${bundleN++}.cjs`)
  fs.writeFileSync(out, res.outputFiles[0].text)
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://127.0.0.1:9'
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:9'
  return kit.quiet(() => require(out))
}
function extract(ref) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fr1-start-'))
  const tar = execFileSync('git', ['archive', '--format=tar', ref, 'lib', 'components', 'messages'], { cwd: REPO, maxBuffer: 1e9 })
  execFileSync('tar', ['-x', '-C', dir], { input: tar, maxBuffer: 1e9 })
  fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(dir, 'node_modules'))
  return dir
}

;(async () => {
  kit.setNow('2026-11-24T12:00:00.000Z'); kit.setDeviceTz('Europe/London')
  const L = await kit.bundle('fr1-lib', [
    "export * as BD from '@/lib/business-details'", "export * as PER from '@/lib/accounts/periods'", "export * as DT from '@/lib/accounts/daily-totals'",
    "export * as OA from '@/lib/audit/order-audit'", "export * as LG from '@/lib/accounts/ledger'", "export * as CSV from '@/lib/accounts/csv'",
    "export * as E from '@/lib/order-charges'", "export * as X from '@/lib/order-tax'", "export * as IR from '@/lib/item-rates'",
  ].join('\n'))
  const { BD, PER, DT, OA, E, X } = L

  // ══ A ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('A · BUSINESS DETAILS — the checks, the route, the permissions')
  t('Luhn: 732829320 (a valid SIREN) yes, 732829321 no; SIRET 73282932000074 yes, 73282932000075 no', BD.sirenOrSiretOk('732 829 320') && !BD.sirenOrSiretOk('732829321') && BD.sirenOrSiretOk('732 829 320 00074') && !BD.sirenOrSiretOk('73282932000075'))
  t('La Poste\'s SIRETs (SIREN 356000000) are checked by their own rule: digits summing to a multiple of 5', BD.sirenOrSiretOk('35600000000001') && !BD.sirenOrSiretOk('35600000000002') && !BD.luhnOk('35600000000001'))
  t('a SIREN must be 9 digits and a SIRET 14 (8 or 10 digits refused, letters refused)', !BD.sirenOrSiretOk('73282932') && !BD.sirenOrSiretOk('7328293200') && !BD.sirenOrSiretOk('73282932A'))
  const fr = (x) => BD.checkBusinessDetails(x, 'FR'), gb = (x) => BD.checkBusinessDetails(x, 'GB'), us = (x) => BD.checkBusinessDetails(x, 'US'), de = (x) => BD.checkBusinessDetails(x, 'DE'), gr = (x) => BD.checkBusinessDetails(x, 'GR')
  t('France: "732 829 320 00074" is stored as 73282932000074; a bad one refused (business_siren_invalid); the overseas departments use the same rule',
    fr({ registrationNumber: '732 829 320 00074' }).values?.registration_number === '73282932000074' && fr({ registrationNumber: '73282932000075' }).code === 'business_siren_invalid' && BD.registrationKindOf('RE') === 'siren')
  t('GB: a company number is 8 letters or digits ("sc 123456" → SC123456; 01234567 yes; 1234567 and 012345678 refused)',
    gb({ registrationNumber: 'sc 123456' }).values?.registration_number === 'SC123456' && gb({ registrationNumber: '01234567' }).ok && gb({ registrationNumber: '1234567' }).code === 'business_company_number_invalid' && gb({ registrationNumber: '012345678' }).code === 'business_company_number_invalid')
  t('elsewhere the registration number is free text (US: "EIN 12-3456789" kept)', us({ registrationNumber: 'EIN 12-3456789' }).values?.registration_number === 'EIN 12-3456789')
  t('EU VAT, format only: FR FR12345678901 yes (spaces taken out, upper case); FR "DE123456789" refused with FR\'s prefix and example; DE DE123456789 yes; Greece writes EL',
    fr({ vatNumber: 'fr 12 345678901' }).values?.vat_number === 'FR12345678901' && J(fr({ vatNumber: 'DE123456789' })) === J({ ok: false, code: 'business_vat_invalid', params: { prefix: 'FR', example: 'FR12345678901' } })
    && de({ vatNumber: 'DE123456789' }).ok && gr({ vatNumber: 'EL123456789' }).ok && !gr({ vatNumber: 'GR123456789' }).ok)
  t('outside the EU a VAT number is free text (GB "GB123456789", US anything) — no check', gb({ vatNumber: 'GB 123 4567 89' }).values?.vat_number === 'GB 123 4567 89' && us({ vatNumber: 'xyz' }).ok)
  t('the regime: France only (the four values; a fifth refused); GB refused (business_regime_not_here); blank clears it',
    BD.VAT_REGIMES.every(r => fr({ vatRegime: r }).ok) && fr({ vatRegime: 'other' }).code === 'business_regime_invalid' && gb({ vatRegime: 'franchise' }).code === 'business_regime_not_here' && fr({ vatRegime: '' }).values?.vat_regime === null)
  t('every field optional: a blank box clears its column (NULL); 201 characters refused; the address keeps only what was typed',
    J(fr({ legalName: '  ', registrationNumber: '', vatNumber: '' }).values) === J({ legal_name: null, registration_number: null, vat_number: null })
    && fr({ legalName: 'x'.repeat(201) }).code === 'business_too_long' && J(fr({ registeredAddress: { address: ' 3 rue de la Paix ', town: 'Paris', postcode: '75002', suburb: '' } }).values) === J({ registered_address: { address: '3 rue de la Paix', town: 'Paris', postcode: '75002' } }))
  // the route
  const FRROW = { ...snake(SEEDS.gbFromSeed()), country_code: 'FR', name: 'France', currency: 'EUR', locale: 'fr-FR', address_format: 'fr', tax_label: 'TVA', default_timezone: 'Europe/Paris', timezones: ['Europe/Paris'] }
  const TRUCK = (over = {}) => ({ id: 'test-truck', slug: 'test-kitchen', name: 'Crêperie', active: true, plan: 'pro', country: 'FR', currency: 'EUR', timezone: 'Europe/Paris', operator_id: 'op-test', dashboard_token: 'tok-test', ...over })
  const ACCESS = role => ({ file: 'app/api/manage/route.ts', from: /const access = await resolveTruckAccess\(req, truck\)/g, to: `const access = { ok: true as const, role: '${role}' as const, userId: null, operatorId: null, via: 'harness' } as any` })
  const routes = {}
  const call = async (role, db, body) => {
    routes[role] = routes[role] || await kit.bundle(`fr1-manage-${role}`, "export { POST } from '@/app/api/manage/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", { patches: [ACCESS(role)] })
    globalThis.__harnessDb = db; routes[role].clearCountrySettingsCache()
    try {
      const res = await kit.quietAsync(() => routes[role].POST(new NextRequest('http://127.0.0.1:3999/api/manage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'tok-test', ...body }) })))
      return { status: res.status, body: await res.json() }
    } finally { delete globalThis.__harnessDb }
  }
  {
    const tables = { trucks: [TRUCK()], country_settings: [FRROW], operators: [{ id: 'op-test' }], action_audit_log: [] }
    const db = makeFakePg(tables)
    const T = () => (db.tables || tables)
    const ok = await call('owner', db, { action: 'update_business_details', legalName: 'Crêperie Léa SARL', registrationNumber: '732 829 320', vatNumber: 'FR12345678901', vatRegime: 'franchise' })
    const row = T().trucks[0]
    t('the owner saves: exactly the four named columns are written, as checked (732829320, FR12345678901, franchise); the answer returns them',
      ok.status === 200 && row.legal_name === 'Crêperie Léa SARL' && row.registration_number === '732829320' && row.vat_number === 'FR12345678901' && row.vat_regime === 'franchise' && !('registered_address' in row && row.registered_address !== undefined) && ok.body.truck?.vat_regime === 'franchise', { ok, row })
    t('…and the save is in action_audit_log as business_details_saved, naming the fields (no values)', (T().action_audit_log || []).some(r => r.action === 'business_details_saved' && J(r.after_state) === J({ fields: ['legal_name', 'registration_number', 'vat_number', 'vat_regime'] })), T().action_audit_log)
    const bad = await call('owner', db, { action: 'update_business_details', registrationNumber: '732829321' })
    t('a bad SIREN is refused (400, business_siren_invalid) and nothing changes', bad.status === 400 && bad.body.code === 'business_siren_invalid' && T().trucks[0].registration_number === '732829320', bad)
    const mgr = await call('manager', db, { action: 'update_business_details', legalName: 'X' }), staff = await call('staff', db, { action: 'update_business_details', legalName: 'X' })
    t('a manager and staff are refused (403, business_owner_only); nothing written', mgr.status === 403 && staff.status === 403 && mgr.body.code === 'business_owner_only' && T().trucks[0].legal_name === 'Crêperie Léa SARL', [mgr, staff])
  }
  {
    const FRS = { pricesIncludeTax: true, addressFormat: 'fr' }
    t('the franchise note shows when a VAT rate applies (France\'s default 10 %, or the truck\'s own), never at 0 % — the rate is never changed by it',
      L.IR.defaultRateOf(FRS, {}) === 10000 && L.IR.defaultRateOf(FRS, { tax_rate_milli: 0 }) === 0 && /franchiseNote = showRegime && regime === 'franchise' && rateNow !== null && rateNow > 0/.test(read('components/manage/BusinessDetailsCard.tsx'))
      && !/tax_rate_milli/.test(read('components/manage/BusinessDetailsCard.tsx').replace(/tax_rate_milli\?: number \| null/, '')))
    t('Settings mounts the card after Where you trade; the owner or an admin edits, everyone else reads; not in signup',
      /<BusinessDetailsCard truck=\{truck\} api=\{api\} showToast=\{showToast\} onTruckUpdate=\{onTruckUpdate\} readOnly=\{!\(userRole === 'owner' \|\| isAdmin\)\} \/>/.test(read('app/(app)/manage/[token]/page.tsx'))
      && !/legal_name|registration_number|vat_regime/.test(read('app/api/signup/route.ts') + read('app/api/setup/route.ts')))
  }

  // ══ B ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('B · THE RECEIPT NUMBER — the trigger, every insert path, and the live proofs (rolled back)')
  {
    const m1 = code(read('supabase/migrations/20261125_france_records_1.sql')), m2 = code(read('supabase/migrations/20261125_france_records_1b_receipt_replay.sql'))
    t('additive: nullable columns, two private tables (RLS on, anon/authenticated revoked), a partial unique index (truck, receipt_no); no UPDATE / DELETE / DROP COLUMN / RENAME',
      /add column if not exists receipt_no bigint;/.test(m1) && /create unique index if not exists orders_truck_receipt_no_key on public\.orders \(truck_id, receipt_no\) where receipt_no is not null/.test(m1)
      && /alter table public\.receipt_counters\s+enable row level security/.test(m1) && /revoke all on public\.receipt_counters\s+from anon, authenticated/.test(m1)
      && !/\b(update\s+public\.(orders|trucks)|delete\s+from|truncate|drop\s+column|rename)\b/i.test(m1.replace(/do update set last_no/g, '')) && !/drop\s+(table|function|trigger|column)/i.test(m1 + m2))
    const fn = m2.slice(m2.indexOf('create or replace function public.orders_assign_receipt_no()'), m2.indexOf('$$;', m2.indexOf('create or replace function public.orders_assign_receipt_no()')))
    t('the trigger function: SECURITY DEFINER; lock_timeout 2 s, restored; the counter by INSERT … ON CONFLICT DO UPDATE (a row lock in the order\'s own transaction)',
      /security definer/.test(fn) && /set_config\('lock_timeout', '2s', true\)/.test(fn) && /set_config\('lock_timeout', v_old, true\)/.test(fn) && /on conflict \(truck_id\) do update set last_no = c\.last_no \+ 1/.test(fn))
    t('…NEVER fails the insert: one guarded block; on any error receipt_no NULL, the failure logged (itself guarded) and raised as a WARNING', /exception\s+when sqlstate 'HGRN1' then\s+new\.receipt_no := null;\s+when others then[\s\S]*new\.receipt_no := null;[\s\S]*insert into public\.receipt_no_failures[\s\S]*exception when others then\s+null;[\s\S]*raise warning/.test(fn))
    t('…a replayed order_key (ON CONFLICT DO NOTHING) gives its number back: the existence check comes AFTER the counter lock, inside the block', fn.indexOf('on conflict (truck_id)') < fn.indexOf('if exists (select 1 from public.orders o where o.order_key = new.order_key)') && /raise sqlstate 'HGRN1'/.test(fn))
    t('the two triggers: BEFORE INSERT assigns; BEFORE UPDATE OF receipt_no keeps a number once given (never errors); created only if missing (no drop)',
      /create trigger orders_receipt_no before insert on public\.orders for each row execute function public\.orders_assign_receipt_no\(\)/.test(m1) && /create trigger orders_receipt_no_keep before update of receipt_no on public\.orders/.test(m1)
      && /if old\.receipt_no is not null then new\.receipt_no := old\.receipt_no; end if;/.test(m1) && /if not exists \(select 1 from pg_trigger where tgname = 'orders_receipt_no'/.test(m1))
    t('place_order_atomic_v2 is NOT replaced (neither migration names it outside comments)', !/place_order_atomic_v2/.test(m1 + m2))
    const inserters = execFileSync('git', ['grep', '-lE', "from\\('orders'\\)\\s*\\.(insert|upsert)|\\.from\\('orders'\\)\\.(insert|upsert)|rpc\\('place_order_atomic", '--', 'app', 'lib'], { cwd: REPO, encoding: 'utf8' }).trim().split('\n').filter(Boolean).sort()
    const multi = execFileSync('git', ['grep', '-lE', "\\.from\\('orders'\\)\\s*$", '--', 'app', 'lib'], { cwd: REPO, encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    const insertsSplit = multi.filter(f => /\.from\('orders'\)\s*\n\s*\.(insert|upsert)\(/.test(read(f)))
    const all = [...new Set([...inserters, ...insertsSplit])].sort()
    t(`every path that inserts an order (${all.length} files) does it with an INSERT into orders, which the trigger numbers — none sets receipt_no itself`,
      all.length >= 4 && ['app/api/orders/submit/route.ts', 'app/api/dashboard/action/route.ts', 'lib/payments/promote-draft.ts'].every(f => all.includes(f)) && all.every(f => !/receipt_no\s*:/.test(read(f))), all)
    const logs = f => read(`docs/france-records-1/${f}.log`)
    const pre = logs('preflight-20261125'), pre1b = logs('preflight-20261125b'), without = logs('preflight-20261125-without-1b'), conc = logs('concurrency'), old = logs('old-style-call')
    const nines = ['1 · sequential', '2 · the function', '3 · the card promotion', '4 · a rolled-back insert leaves no gap', '5 · a forced trigger failure', '6 · another truck', '7 · a number once given is kept', '8 · a cancelled order keeps its number', '9 · the counters']
    t('LIVE pre-flight (20261125, one transaction, ROLLED BACK, demo trucks only): proofs 1–9 passed, counts identical before and after',
      nines.every(p => pre.includes(`✓ ${p}`)) && /✅ every proof passed/.test(pre) && /guard: demo-mk65q66spjck0g9mxt50btfxtr \(plan demo, is_customer false\) · test-truck-2 \(plan demo, is_customer false\)/.test(pre)
      && /✓ the demo trucks' counts are identical before and after/.test(pre) && !/\bcommit\b/i.test(pre.split('\n').filter(l => l.startsWith('SQL')).join('\n').replace(/SQL \[preflight\]> [\s\S]*?(?=\nSQL|$)/, m => m.includes('create or replace') ? '' : m)))
    t('…20261125b\'s pre-flight: 1–10 passed (10: an offline replay takes no number); WITHOUT 1b, proof 10 FAILS (the gap, shown: 8, then 10)',
      nines.every(p => pre1b.includes(`✓ ${p}`)) && /✓ 10 · an offline replay/.test(pre1b) && /✅ every proof passed/.test(pre1b) && /🔴 10 · an offline replay/.test(without) && /"receipt_no":"10"/.test(without))
    t('LIVE two-connection proofs (ROLLED BACK): consecutive with no gap or duplicate, another truck not blocked, a holder past 2 s → receipt_no NULL, never an error',
      /✓ c2 waited on truck A's row, then — c1 rolled back — got 1: no gap, no duplicate/.test(conc) && /✓ …and its next two are 2, 3 — consecutive/.test(conc) && /✓ truck B's insert is NOT blocked/.test(conc) && /✓ a holder past the trigger's 2 s lock_timeout/.test(conc) && /✅ every proof passed/.test(conc))
    t('LIVE old-style call (vat-live-check-1 step 2, ROLLED BACK): the deployed code\'s call succeeds, tax_breakdown NULL, and it gets a receipt number',
      /✓ the old-style call succeeds/.test(old) && /✓ …the row stores tax_breakdown NULL/.test(old) && /✅ every proof passed/.test(old))
    const S = read('scripts/db-rollback-proofs.cjs')
    t('the proof script\'s safeguards are code: the demo-truck guard, the COMMIT refusal, ROLLBACK in finally, 5 s / 3 s timeouts, before/after counts; it is operational-only (never in a sweep)',
      /refusing: not a demo truck/.test(S) && /refusing to send a COMMIT/.test(S) && /finally \{\s*try \{ await q\(c, tag, 'rollback'\) \}/.test(S) && /set statement_timeout = '5s'/.test(S) && /set lock_timeout = '3s'/.test(S)
      && JSON.parse(read('scripts/harnesses.json')).excluded.operational_refused.files.includes('db-rollback-proofs.cjs') && !JSON.parse(read('scripts/harnesses.json')).harnesses.includes('db-rollback-proofs.cjs'))
  }

  // ══ C ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('C · THE DAILY TOTALS FILE — two days on a French test truck, worked through')
  const book = X.taxBookFrom([{ name: 'Crêpe', price: 8.5, tax_rate_milli: null }, { name: 'Canette', price: 2.5, tax_rate_milli: 5500 }, { name: 'Cidre', price: 4, tax_rate_milli: 20000 }], 'EUR')
  const FR10 = { taxInclusive: true, taxLabel: 'TVA', taxRateMilli: 10000, feesTaxed: false, serviceFee: null, tipping: null, surcharge: null, cardFeePayer: 'truck', platformFee: null }
  const snap = (lines, food) => E.computeOrderCharges({ foodMinor: food, rules: FR10, channel: 'walk_up', foodParts: X.lineTax({ items: lines, deals: [], foodMinor: food, book, defaultRate: 10000, currency: 'EUR' }).parts }).snapshot
  const MIX = [{ name: 'Crêpe', quantity: 1, unit_price: 8.5 }, { name: 'Canette', quantity: 1, unit_price: 2.5 }, { name: 'Cidre', quantity: 1, unit_price: 4 }]
  const CREPE = [{ name: 'Crêpe', quantity: 1, unit_price: 8.5 }]
  const ord = (key, status, at, food, lines, extra = {}) => ({ order_key: key, status, created_at: at, placed_at: at, updated_at: at, total_minor: food, total: food / 100, currency: 'EUR', ...snap(lines, food), receipt_no: null, ...extra })
  const D1 = '2026-11-02T10:00:00.000Z', D2 = '2026-11-03T15:00:00.000Z'
  const orders = [
    ord('o1', 'collected', D1, 1500, MIX), ord('o2', 'confirmed', D1, 1350, MIX), ord('o3', 'pending', D1, 850, CREPE),
    ord('o4', 'cancelled', D1, 850, CREPE, { updated_at: D2 }), ord('o5', 'rejected', D1, 400, [{ name: 'Cidre', quantity: 1, unit_price: 4 }]), ord('o6', 'collected', D2, 850, CREPE),
  ]
  const payments = [
    { order_key: 'o1', kind: 'charge', amount_minor: 1500, state: 'succeeded', created_at: D1 }, { order_key: 'o2', kind: 'charge', amount_minor: 1350, state: 'succeeded', created_at: D1 },
    { order_key: 'o2', kind: 'refund', amount_minor: 500, state: 'succeeded', created_at: D2 }, { order_key: 'o4', kind: 'charge', amount_minor: 850, state: 'succeeded', created_at: D1 },
    { order_key: 'o6', kind: 'charge', amount_minor: 850, state: 'succeeded', created_at: D2 }, { order_key: 'o2', kind: 'refund', amount_minor: 100, state: 'failed', created_at: D2 },
  ]
  const res = DT.dailyTotals({ orders, payments, cancelledAt: { o4: '2026-11-03T09:00:00.000Z' }, tax: { inclusive: true, rateMilli: 10000 }, timeZone: 'Europe/Paris', from: '2026-11-02', to: '2026-11-03' })
  const rowsOf = r => r.map(x => [x.date, x.rate, x.salesMinor, x.refundsMinor, x.netMinor, x.vatMinor])
  t('day 1 (2 Nov): 5,5 % 4,75 € (VAT 0,25), 10 % 24,65 € (VAT 2,24), 20 % 7,60 € (VAT 1,27) — the mixed order, the same with the 10 % code, and the counter order; the pending and the rejected order left out',
    J(rowsOf(res.rows.filter(r => r.date === '2026-11-02'))) === J([['2026-11-02', 5500, 475, 0, 450, 25], ['2026-11-02', 10000, 2465, 0, 2241, 224], ['2026-11-02', 20000, 760, 0, 633, 127]]), rowsOf(res.rows))
  t('day 2 (3 Nov): the 5,00 € refund on the coded order, split 0,84 / 2,83 / 1,33 (VAT 0,05 / 0,26 / 0,22); the cancelled counter order\'s 8,50 € back on the cancellation\'s day; the day\'s crêpe',
    J(rowsOf(res.rows.filter(r => r.date === '2026-11-03'))) === J([['2026-11-03', 5500, 0, -84, -79, -5], ['2026-11-03', 10000, 850, -1133, -257, -26], ['2026-11-03', 20000, 0, -133, -111, -22]]), rowsOf(res.rows))
  t('the totals per rate: 5,5 % 4,75 / −0,84 / net 3,71 / VAT 0,20 · 10 % 33,15 / −11,33 / 19,84 / 1,98 · 20 % 7,60 / −1,33 / 5,22 / 1,05; nothing left out for having no rate',
    J(res.totals.map(x => [x.rate, x.salesMinor, x.refundsMinor, x.netMinor, x.vatMinor])) === J([[5500, 475, -84, 371, 20], [10000, 3315, -1133, 1984, 198], [20000, 760, -133, 522, 105]]) && res.noRateOrders === 0, res.totals)
  t('every row adds up: net = sales + refunds − VAT', res.rows.concat(res.totals).every(r => r.netMinor === r.salesMinor + r.refundsMinor - r.vatMinor))
  const noAudit = DT.dailyTotals({ orders: [orders[3]], payments: payments.filter(p => p.order_key === 'o4'), cancelledAt: {}, tax: { inclusive: true, rateMilli: 10000 }, timeZone: 'Europe/Paris', from: '2026-11-02', to: '2026-11-03' })
  t('the cancelled-after-payment case without an audit row uses the row\'s updated_at (3 Nov): it nets to zero over the two days, never counted at full value',
    J(rowsOf(noAudit.rows)) === J([['2026-11-02', 10000, 850, 0, 773, 77], ['2026-11-03', 10000, 0, -850, -773, -77]]) && noAudit.totals[0].salesMinor + noAudit.totals[0].refundsMinor === 0, rowsOf(noAudit.rows))
  const gbNo = DT.dailyTotals({ orders: [{ order_key: 'g1', status: 'collected', created_at: D1, total_minor: 1200, food_minor: 1200, tax_inclusive: true, tax_rate_milli: null, tax_breakdown: null }], payments: [], tax: { inclusive: true, rateMilli: null }, timeZone: 'Europe/London', from: '2026-11-02', to: '2026-11-02' })
  t('a UK truck with No VAT: its order is in no rate row, and the file counts it (1 left out)', gbNo.rows.length === 0 && gbNo.noRateOrders === 1)
  const old = DT.dailyTotals({ orders: [{ order_key: 'p1', status: 'collected', created_at: D1, total_minor: 1100, food_minor: 1100, tax_inclusive: true, tax_rate_milli: 10000, tax_breakdown: null }], payments: [], tax: { inclusive: true, rateMilli: 5500 }, timeZone: 'Europe/Paris', from: '2026-11-02', to: '2026-11-02' })
  t('an order with no breakdown uses its single stored rate (10 %, not the truck\'s 5,5 % today): 11,00 € → VAT 1,00 €', J(rowsOf(old.rows)) === J([['2026-11-02', 10000, 1100, 0, 1000, 100]]))
  t('outside the period: a 2 Nov order with a 3 Nov period shows only its 3 Nov refund', J(rowsOf(DT.dailyTotals({ orders: [orders[1]], payments, tax: { inclusive: true, rateMilli: 10000 }, timeZone: 'Europe/Paris', from: '2026-11-03', to: '2026-11-03' }).rows).map(r => r[3])) === J([-84, -283, -133]))
  // the presets
  const P = (regime, country = 'FR') => PER.periodKindFor(country, regime)
  const today = '2026-11-24'
  t('presets: franchise → two-month blocks (now Nov–Dec; the default the last complete one, Sep–Oct)', P('franchise') === 'two_months' && J(PER.periodContaining('two_months', today)) === J({ kind: 'two_months', from: '2026-11-01', to: '2026-12-31' }) && J(PER.defaultPeriod('two_months', today)) === J({ kind: 'two_months', from: '2026-09-01', to: '2026-10-31' }))
  t('réel simplifié → the month (default October); réel normal quarterly → the month too', P('reel_simplifie') === 'month' && P('reel_normal_quarterly') === 'month' && J(PER.defaultPeriod('month', today)) === J({ kind: 'month', from: '2026-10-01', to: '2026-10-31' }))
  t('réel normal monthly → 1–10, 11–20, 21–end (24 Nov is in 21–30; default 11–20); February\'s third ends on the 28th/29th', P('reel_normal_monthly') === 'thirds' && J(PER.periodContaining('thirds', today)) === J({ kind: 'thirds', from: '2026-11-21', to: '2026-11-30' })
    && J(PER.defaultPeriod('thirds', today)) === J({ kind: 'thirds', from: '2026-11-11', to: '2026-11-20' }) && PER.periodContaining('thirds', '2028-02-25').to === '2028-02-29' && PER.previousPeriod(PER.periodContaining('thirds', '2026-12-03')).from === '2026-11-21')
  t('no regime, or not France → the month; six presets newest first, and "Custom dates" always offered', P(null) === 'month' && P('franchise', 'GB') === 'month' && PER.recentPeriods('month', today).map(p => p.from).join() === '2026-11-01,2026-10-01,2026-09-01,2026-08-01,2026-07-01,2026-06-01'
    && /<option value="custom">\{t\('daily\.custom'\)\}<\/option>/.test(read('components/manage/DailyTotalsCsv.tsx')))
  // the file
  const words = { meta: { legalName: 'Legal name', registration: 'SIREN/SIRET', vatNumber: 'VAT number', vatRegime: 'VAT regime', period: 'Period' },
    header: { date: 'Date', type: 'Type', rate: 'VAT rate', sales: 'Sales incl. VAT', refunds: 'Refunds incl. VAT', net: 'Net excl. VAT', vat: 'VAT' }, goods: 'Goods', total: 'Total', noRate: n => `${n} orders with no VAT rate are not included.` }
  const csv = DT.dailyTotalsCsv(res, { legalName: 'Crêperie Léa SARL', registration: '73282932000074', vatNumber: 'FR12345678901', vatRegime: 'Réel simplifié', from: '2026-11-02', to: '2026-11-03' }, 'EUR', words)
  const lines = csv.replace(/^﻿/, '').split('\r\n')
  t('the CSV: UTF-8 with a BOM, CRLF; the header rows (legal name, SIREN/SIRET, VAT number, regime, period), a blank line, the column header',
    csv.startsWith('﻿') && J(lines.slice(0, 7)) === J(['Legal name,Crêperie Léa SARL', 'SIREN/SIRET,73282932000074', 'VAT number,FR12345678901', 'VAT regime,Réel simplifié', 'Period,2026-11-02 – 2026-11-03', '', 'Date,Type,VAT rate,Sales incl. VAT,Refunds incl. VAT,Net excl. VAT,VAT']), lines.slice(0, 8))
  t('…one row per day per rate ("Goods", "5.5%", dot decimals, refunds negative), then one totals row per rate',
    lines[7] === '2026-11-02,Goods,5.5%,4.75,0.00,4.50,0.25' && lines[10] === '2026-11-03,Goods,5.5%,0.00,-0.84,-0.79,-0.05' && lines[13] === 'Total,Goods,5.5%,4.75,-0.84,3.71,0.20' && lines[15] === 'Total,Goods,20%,7.60,-1.33,5.22,1.05' && lines[16] === '', lines.slice(7))
  t('…a file with orders left out says so in a line under the header rows', DT.dailyTotalsCsv(gbNo, { legalName: null, registration: null, vatNumber: null, vatRegime: null, from: '2026-11-02', to: '2026-11-02' }, 'GBP', words).split('\r\n')[5] === '1 orders with no VAT rate are not included.')
  fs.mkdirSync(path.join(REPO, 'docs/france-records-1'), { recursive: true })
  fs.writeFileSync(path.join(REPO, 'docs/france-records-1/daily-totals-sample.csv'), csv)
  const MR = read('app/api/manage/route.ts')
  t('get_daily_totals reads the orders PLACED in the period, the refunds MADE in it, and the cancellations (audit rows, else updated_at), in pages; never for staff',
    /if \(action === 'get_daily_totals'\) \{\s*if \(requestingUserRole === 'staff'\)/.test(MR) && /\.eq\('kind', 'refund'\)\.eq\('state', 'succeeded'\)\.gte\('created_at', startIso\)/.test(MR) && /\.eq\('action', 'order_cancelled'\)\.gte\('created_at', startIso\)/.test(MR) && /\.eq\('status', 'cancelled'\)\.gte\('updated_at', startIso\)/.test(MR))

  // ══ D ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('D · THE AUDIT LOG — edit (before and after), cancel and reject through the real route; placement on every path')
  {
    const snapIn = { order_key: 'k', status: 'confirmed', customer_name: 'Léa', customer_email: 'lea@example.test', customer_phone: '0612345678', notes: 'allergic to nuts',
      items: [{ name: 'Crêpe', quantity: 1, unit_price: 8.5, specialInstructions: 'no nuts please' }], deals: [{ name: 'Formule', price: 10, slots: { a: 'Crêpe' }, slotNotes: { a: 'gluten free' } }], total: 8.5, total_minor: 850, receipt_no: 12 }
    const sn = OA.orderAuditSnapshot(snapIn)
    t('a snapshot keeps the lines, deals, status and money (and the receipt number) — never the name, email, phone, note, a line\'s note or a deal\'s slot notes',
      !/Léa|lea@example|0612345678|allergic|no nuts|gluten free/.test(J(sn)) && sn.items[0].name === 'Crêpe' && sn.deals[0].name === 'Formule' && sn.total_minor === 850 && sn.receipt_no === 12, sn)
    const LPF = require('./_lp1b-fixtures.cjs'), C = LPF.country('GB')
    const M = await kit.bundle('fr1-action', "export { POST } from '@/app/api/dashboard/action/route'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", { stubs: {
      '@/lib/apns': 'export async function sendOrderPendingPush() {}\nexport function normaliseApnsKey(k) { return k }', '@/lib/fcm': 'export async function sendOrderPendingPush() {}',
      '@/lib/payments/capture': 'export async function captureOnConfirmation() { return { ok: true, outcome: "nothing_to_capture" } }',
    } })
    const act = async (status, action, extra = {}) => {
      const order = { ...C.ORDERS.pay_at_hatch, order_key: 'ok-1', status, truck_id: 'test-truck' }
      const tables = {
        trucks: [{ ...C.TRUCK, dashboard_token: 'tok-test', dashboard_pin: null, active: true, operator_id: 'op-test', timezone: C.time.timeZone }],
        country_settings: [snake(SEEDS.gbFromSeed())], truck_events: [{ ...C.EVENT, truck_id: 'test-truck' }], orders: [order],
        menu_items_db: C.MENU_ITEMS.map(i => ({ id: i.id, truck_id: 'test-truck', name: i.name, price: i.price, category_id: 'c1', available: true, is_active: true })),
        menu_categories: [{ id: 'c1', truck_id: 'test-truck', name: 'Pizzas' }], modifier_groups: [], modifier_options: [], item_modifier_groups: [], bundles_db: [], discount_codes_db: [],
        order_drafts: [], order_payments: [], booking_locks: [], truck_vans: [], van_devices: [], truck_users: [], event_option_stock: [], action_audit_log: [],
      }
      const db = makeFakePg(tables, { keys: { orders: [['order_key'], ['event_id', 'id']] } })
      globalThis.__harnessDb = { ...db, rpc: async () => ({ data: null, error: null }), auth: { getUser: async () => ({ data: { user: null }, error: null }) } }
      M.clearCountrySettingsCache?.()
      try {
        const res = await kit.quietAsync(() => M.POST(new NextRequest('http://127.0.0.1/api/dashboard/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'tok-test', action, order_key: 'ok-1', ...extra }) })))
        const tb = db.tables || tables
        return { status: res.status, rows: (tb.action_audit_log || []).filter(r => String(r.action).startsWith('order_')), order: tb.orders[0] }
      } catch (e) { return { error: String(e?.message || e) } } finally { delete globalThis.__harnessDb }
    }
    const ed = await act('confirmed', 'edit', { editedOrder: { items: [...C.ORDERS.pay_at_hatch.items.map(i => ({ ...i })), { name: C.MENU_ITEMS[0].name, quantity: 1, unit_price: C.MENU_ITEMS[0].price, modifiers: [] }] } })
    const e1 = ed.rows?.find(r => r.action === 'order_edited')
    t('edit → one order_edited row: before has the old lines and total, after the new ones (one more line), both without customer details or notes',
      ed.status === 200 && !!e1 && e1.before_state.items.length === C.ORDERS.pay_at_hatch.items.length && e1.after_state.items.length === C.ORDERS.pay_at_hatch.items.length + 1
      && e1.after_state.total !== e1.before_state.total && !/Sam Harness|sam@example|Ring the bell|specialInstructions|slotNotes/.test(J(e1)), { status: ed.status, e1, error: ed.error })
    const ca = await act('confirmed', 'cancel', { cancellationReason: 'test' })
    t('cancel → one order_cancelled row (before confirmed, after cancelled; by the operator)', ca.status === 200 && ca.rows?.some(r => r.action === 'order_cancelled' && r.before_state.status === 'confirmed' && r.after_state.status === 'cancelled' && r.after_state.note?.by === 'operator'), ca)
    const rj = await act('pending', 'reject', { rejectionReason: 'Too busy' })
    t('reject → one order_rejected row (before pending, after rejected) — rejectOrder, the one path the auto-reject cron uses too', rj.status === 200 && rj.rows?.some(r => r.action === 'order_rejected' && r.before_state.status === 'pending' && r.after_state.status === 'rejected'), rj)
    const lock = await act('collected', 'edit', { editedOrder: { items: [] } })
    t('a refused edit (a finished order) writes no audit row', lock.status === 409 && lock.rows.length === 0)
    const SUB = read('app/api/orders/submit/route.ts'), ACT = read('app/api/dashboard/action/route.ts'), PRO = read('lib/payments/promote-draft.ts'), CAN = read('app/api/orders/cancel/route.ts'), EVT = read('app/api/events/action/route.ts')
    t('placement is logged on all three paths — the customer\'s pay-at-the-truck order, the walk-up (not again on an offline replay), the promoted card order — and the customer\'s own and the event\'s cancellations',
      /action: 'order_placed', truckId: resolvedTruckId/.test(SUB) && /action: 'order_placed', truckId: truck\.id, orderKey: manualOrderKey/.test(ACT) && /if \(!clientOrderKey \|\| /.test(ACT)
      && /action: 'order_placed', truckId: draft\.truck_id/.test(PRO) && /action: 'order_cancelled'[\s\S]{0,300}note: \{ by: 'customer' \}/.test(CAN) && /note: \{ by: 'event_cancelled'/.test(EVT))
    t('every one goes through logAction (best-effort): no new logActionOrThrow, so a failed log never stops an order action',
      /export async function logOrderEvent[\s\S]*await logAction\(supabase/.test(read('lib/audit/order-audit.ts')) && !/logActionOrThrow/.test(read('lib/audit/order-audit.ts')) && (ACT.match(/logActionOrThrow\(/g) || []).length === (execFileSync('git', ['show', `${START}:app/api/dashboard/action/route.ts`], { cwd: REPO, encoding: 'utf8', maxBuffer: 64e6 }).match(/logActionOrThrow\(/g) || []).length)
  }

  // ══ E ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('E · RETENTION — unchanged (decision 1 = C)')
  {
    const was = execFileSync('git', ['show', `${START}:lib/order-retention.ts`], { cwd: REPO, encoding: 'utf8' })
    t('lib/order-retention.ts and its cron route are byte-identical to this prompt\'s start', read('lib/order-retention.ts') === was && read('app/api/cron/order-retention/route.ts') === execFileSync('git', ['show', `${START}:app/api/cron/order-retention/route.ts`], { cwd: REPO, encoding: 'utf8' }))
    const R = await kit.bundle('fr1-ret', "export * from '@/lib/order-retention'")
    const p = R.retentionPatch({ order_key: 'k', customer_name: 'Léa', customer_email: 'l@x', customer_phone: '06', notes: 'n', items: [{ name: 'Crêpe', specialInstructions: 'no nuts' }], deals: [{ name: 'F', slotNotes: { a: 'gf' } }] }, '')
    t('…so it still blanks the name, email, phone and order note, and the line and slot notes, as the privacy policy promises', p.customer_name === '' && p.customer_email === null && p.customer_phone === null && p.notes === null && p.items[0].specialInstructions === '' && J(p.deals[0].slotNotes) === '{}')
  }

  // ══ F ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head(`F · NOTHING CUSTOMER-FACING CHANGED — START ${START} vs this tree`)
  {
    const ENTRY = ["export * as E from '@/lib/order-charges'", "export * as L from '@/lib/order-charge-lines'", "export * as Mail from '@/lib/email'", "export * as T from '@/lib/printing/ticket'",
      "export { mapOrderToTicket } from '@/lib/printing/mapOrderToTicket'", "export * as X from '@/lib/order-tax'"].join('\n')
    const S = await bundleFrom(extract(START), 'start', ENTRY), H = await bundleFrom(REPO, 'head', ENTRY)
    const EUR = { currency: 'EUR', locale: 'fr-FR' }, TIME = { timeZone: 'Europe/Paris', locale: 'fr-FR', timeFormat: '24h', dateOrder: 'dmy', weekStart: 'monday' }
    const make = (O, lines, food, extraRow) => {
      const lt = O.X.lineTax({ items: lines, deals: [], foodMinor: food, book: O.X.taxBookFrom([{ name: 'Crêpe', price: 8.5, tax_rate_milli: null }, { name: 'Canette', price: 2.5, tax_rate_milli: 5500 }, { name: 'Cidre', price: 4, tax_rate_milli: 20000 }], 'EUR'), defaultRate: 10000, currency: 'EUR' })
      const items = O.X.stampItems(lines, lt.itemStamps)
      const ch = O.E.computeOrderCharges({ foodMinor: food, rules: FR10, channel: 'online_pay_at_truck', foodParts: lt.parts })
      const row = { id: '7', order_key: 'ok-7', customer_name: 'Léa', customer_phone: null, slot: '12:30', buzzer_number: null, items, deals: [], notes: null, total: food / 100, total_minor: food, currency: 'EUR', country: 'FR', status: 'confirmed', ...ch.snapshot, ...extraRow }
      const conf = O.Mail.formatConfirmationEmail({ orderId: '7', orderKey: 'ok-7', truckName: 'Crêperie', customerName: 'Léa', slot: '12:30', items, deals: [], discountAmt: 0, notes: null, autoAccepted: true, phoneCountry: 'FR', money: EUR, time: TIME, total: food / 100, charges: O.L.chargeSourceOf(row) })
      const neworder = O.Mail.formatNewOrderEmail({ orderId: '7', customerName: 'Léa', slot: '12:30', items, deals: [], total: food / 100, charges: O.L.chargeSourceOf(row), notes: null, money: EUR, time: TIME })
      const tk = O.mapOrderToTicket({ order: row, truck: { name: 'Crêperie', money: { ...EUR, localeByCountry: { FR: 'fr-FR' } }, time: TIME }, event: null, ledgerRows: [], printedLabel: '12:01' })
      return { conf, neworder, ticket: [58, 80].map(w => Buffer.from(O.T.renderTicket(tk, { paper_width: w })).toString('hex')), status: O.L.chargesForResponse(row), lines: O.L.includedTaxLines(O.L.chargeSourceOf(row), 'fr-FR') }
    }
    const extraHead = { receipt_no: 42, legal_name: 'Crêperie Léa SARL', registration_number: '73282932000074', vat_number: 'FR12345678901', vat_regime: 'franchise' }
    for (const [label, lines, food] of [['single-rate (a crêpe)', [{ name: 'Crêpe', quantity: 2, unit_price: 8.5 }], 1700], ['mixed-rate (crêpe, can, cider)', MIX, 1500]]) {
      const a = make(S, lines, food, {}), b = make(H, lines, food, extraHead)
      const diff = Object.keys(a).filter(k => J(a[k]) !== J(b[k]))
      t(`${label}: the customer email (HTML + text), the new-order email, the ticket bytes (58 + 80 mm), the status page's / order API's charges — byte-identical to START, with a receipt number and business details on the row`, diff.length === 0, diff)
    }
    const changed = execFileSync('git', ['diff', '--name-only', START, '--', 'lib/email.ts', 'lib/printing', 'app/(app)/order', 'app/(app)/trucks', 'app/api/orders/[id]', 'components/ChargeRows.tsx', 'lib/order-charge-lines.ts', 'app/api/menu'], { cwd: REPO, encoding: 'utf8' }).trim()
    t('no file behind a customer screen, email or ticket changed since START (email, printing, the order and status pages, the order and menu APIs, the charge lines)', changed === '', changed)
  }

  // ══ G ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('G · THE WORDS, and "Receipt no." in the accountant CSV')
  {
    const NEW = Object.keys(require(path.join(REPO, 'scripts/_lp-france-records-1.cjs')).NEW_KEYS_MAP())
    const at = (o, k) => k.split('.').reduce((x, p) => (x == null ? undefined : x[p]), o)
    const en = JSON.parse(read('messages/en-GB.json'))
    t(`the ${NEW.length} new strings are in en-GB`, NEW.length === 60 && NEW.every(k => typeof at(en, k) === 'string'))
    const USED = ['am-ET', 'ar-AE', 'az-AZ', 'bg-BG', 'bn-BD', 'bs-BA', 'ca-AD', 'cs-CZ', 'da-DK', 'de-DE', 'el-GR', 'es-ES', 'et-EE', 'fi-FI', 'fr-FR', 'he-IL', 'hr-HR', 'hu-HU', 'hy-AM', 'id-ID', 'is-IS', 'it-IT', 'ja-JP', 'ka-GE', 'kk-KZ', 'km-KH', 'ko-KR', 'lo-LA', 'lt-LT', 'lv-LV', 'mk-MK', 'mn-MN', 'ms-MY', 'nb-NO', 'ne-NP', 'nl-NL', 'pl-PL', 'pt-BR', 'pt-PT', 'ro-RO', 'ru-KZ', 'si-LK', 'sk-SK', 'sl-SI', 'sq-AL', 'sr-RS', 'sv-SE', 'sw-TZ', 'th-TH', 'tr-TR', 'uk-UA', 'uz-UZ', 'zh-HK', 'zh-TW']
    const missing = []
    for (const l of USED) { const m = JSON.parse(read(`messages/${l}.json`)), b = JSON.parse(read(`docs/i18n/back/${l}.json`)); for (const k of NEW) { if (typeof at(m, k) !== 'string') missing.push(`${l}:${k}`); if (typeof b[k] !== 'string') missing.push(`${l}:back:${k}`) } }
    t(`all ${NEW.length} in each of the ${USED.length} language bases an enabled country uses, with back-translations`, missing.length === 0, missing.slice(0, 10))
    t('the five bases no enabled country uses are left alone (TRANSLATE ONLY WHAT\'S USED)', ['vi-VN', 'hi-IN', 'ur-PK', 'fil-PH', 'ta-LK'].every(l => typeof at(JSON.parse(read(`messages/${l}.json`)), 'manageSettings.business.title') !== 'string'))
    const row = L.LG.accountRows({ orders: [{ order_key: 'k', id: '3', created_at: D1, event_date: '2026-11-02', event_id: null, customer_email: null, status: 'collected', total: 15, currency: 'EUR', items: [], receipt_no: 42 }], payments: [], costs: [], itemIdByName: {}, tax: { inclusive: true, rateMilli: 10000 }, timeZone: 'Europe/Paris', currency: 'EUR' })
    const csv = L.CSV.ordersCsv(row, { header: k => k, channel: c => c, payment: p => p, taxBasis: b => b, event: () => 'Place' }).replace(/^﻿/, '').split('\r\n')
    t('the accountant Orders CSV: "Receipt no." right after the order number (42; blank for an older order)', csv[0].startsWith('date,time,orderNumber,receiptNo,event') && csv[1].split(',')[3] === '42'
      && L.LG.accountRows({ orders: [{ order_key: 'k', id: '3', created_at: D1, status: 'collected', total: 1, currency: 'EUR' }], payments: [], costs: [], itemIdByName: {}, tax: { inclusive: true, rateMilli: null }, timeZone: 'Europe/Paris', currency: 'EUR' })[0].receiptNo === '')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
