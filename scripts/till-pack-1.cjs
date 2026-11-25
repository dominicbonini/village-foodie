// scripts/till-pack-1.cjs — till-pack-1 / till-pack-1b (24–25 November 2026, docs/till-pack-1b-report.md): THE TAMPER-EVIDENT CHAIN,
// OBSERVE MODE — the offline proofs. Reads files only (the migration, the code, and the demo-truck exports scripts/db-rollback-proofs.cjs wrote from its
// rolled-back runs); it never connects to a database.
//
//   A · THE SEALED FORM = THE WHITELIST — the migration's till_sealed_order / till_sealed_payment / till_sealed_lines name exactly the
//       fields of till-pack-0 §4 C1 / C2 (plus the line keys), read only those columns, and never a personal one.
//   B · THE MIRROR = THE DATABASE — scripts/_till-sealed-mirror.cjs gives, byte for byte, the sealed text the database computed for
//       every exported demo order and payment; every chain payload is canonical jsonb text.
//   C · FUZZ — every order and payment column (the full live column lists) filled with marker values, the lines with random keys,
//       the note keys and unknown keys: no personal or free-text value ever reaches a payload; only whitelisted keys appear.
//   D · CANONICAL TEXT — independent of the order keys were written in; jsonb's key order, string escapes and numeric scale.
//   E · THE CHAIN — scripts/till-verify.cjs verifies the exports, and EVERY single-byte change to an export is detected.
//   F · RETENTION, THE LINE-NOTES MOVE AND ACCOUNT DELETION — the real patches (lib/order-retention.ts retentionPatch / notesPatch,
//       lib/line-notes.ts splitLineNotes, account deletion's anonymisation) change no sealed byte, so till_verify stays true.
//   G · SAFETY — demo trucks outside the till; every order-table trigger an AFTER trigger in its own exception block with a 2 s
//       lock_timeout, writing till tables only (no UPDATE / INSERT / DELETE of orders or order_payments anywhere in the migration); no
//       foreign key into the till tables; place_order_atomic_v2 not touched; the delete paths untouched.
//   H · THE LAW CHECK'S PACK-1 CHANGES (docs/till-law-1-report.md §3, 1–6; till-pack-1b) — seal at acceptance, pending unsealed; every line's
//       VAT rate and total excluding VAT, reconciling to the order (500 orders priced by the REAL VAT engine, lib/order-tax.ts +
//       lib/order-charges.ts); a till_id on every version; identity entries and their references; plus/minus deltas; the 'event' kind.
//
// Usage: node scripts/till-pack-1.cjs
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const M = require('./_till-sealed-mirror.cjs')
const V = require('./till-verify.cjs')
const REPO = path.resolve(__dirname, '..')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)}` : '')) } }
const head = s => console.log(`\n── ${s} ${'─'.repeat(Math.max(0, 100 - s.length))}`)
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const exists = f => fs.existsSync(path.join(REPO, f))
const J = v => JSON.stringify(v)
const setEq = (a, b) => J([...new Set(a)].sort()) === J([...new Set(b)].sort())

const MIG = read('supabase/migrations/20261129_till_pack_1.sql')
const fnBody = name => { const i = MIG.indexOf(`create or replace function public.${name}(`); if (i < 0) return ''; const j = MIG.indexOf('\n$$;', i); return MIG.slice(i, j < 0 ? undefined : j) }
const code = s => s.replace(/--[^\n]*/g, '')
const EXPORTS = ['preflight', 'check'].filter(m => exists(`docs/till-pack-1/rows-${m}.json`))
const CHAINS = ['preflight', 'check'].filter(m => exists(`docs/till-pack-1/chain-${m}.jsonl`))

// till-pack-0 §4 C1 / C2, as the plan states them — independent of the migration and of the mirror.
// …plus the law check's changes 2 and 3 (till-pack-1b): till_id, vat_basis, vat_summary.
const PLAN_ORDER = ['truck_id', 'order_key', 'receipt_no', 'id', 'event_date', 'event_id', 'van_id', 'placed_at', 'collected_at', 'source', 'order_type', 'items', 'deals',
  'discount_code', 'discount_amt', 'subtotal', 'total', 'total_minor', 'currency', 'country', 'food_minor', 'tax_minor', 'tax_rate_milli', 'tax_inclusive', 'tax_label',
  'tax_breakdown', 'tip_minor', 'tip_pct_bps', 'service_fee_minor', 'service_fee_recipient', 'card_surcharge_minor', 'card_fee_payer', 'vat_regime', 'fiscal_state',
  'till_id', 'vat_basis', 'vat_summary']
const LINE_VAT_KEYS = ['vat_rate_milli', 'line_price_minor', 'line_total_excl_vat_minor']
const PLAN_PAYMENT = ['id', 'order_key', 'truck_id', 'kind', 'channel', 'method', 'amount_minor', 'currency', 'state', 'external_ref', 'livemode', 'created_at']
const NOT_SEALED_ORDER = ['customer_name', 'customer_email', 'customer_phone', 'notes', 'line_notes', 'table_ref', 'cancellation_reason', 'rejection_reason', 'slot',
  'requested_slot', 'asap_estimate', 'cooking_reservation', 'buzzer_number', 'buzzer_lost_at', 'capacity_ack_at', 'status_before_collected', 'payment_status', 'amount_paid',
  'paid_at', 'updated_at', 'application_fee_minor', 'card_funding', 'modify_type', 'modify_data', 'deal_savings', 'extras', 'bundle', 'tax_rate_bps']
const NOT_SEALED_PAYMENT = ['note', 'created_by', 'idempotency_key', 'application_fee_minor', 'application_fee_refunded_minor', 'card_funding']

;(async () => {
  // ══ A ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('A · THE SEALED FORM = THE WHITELIST (the migration\'s own functions)')
  {
    const so = code(fnBody('till_sealed_order')), sp = code(fnBody('till_sealed_payment')), sl = code(fnBody('till_sealed_lines')), pk = code(fnBody('till_pick'))
    const keysOf = body => [...body.matchAll(/'([a-z_]+)',\s*(?:public\.|o\.|p\.|si\b|sd\b|v ->)/g)].map(m => m[1])
    const colsOf = (body, alias) => [...new Set([...body.matchAll(new RegExp(`\\b${alias}\\.([a-z_]+)`, 'g'))].map(m => m[1]))]
    const reads = [...new Set([...colsOf(so, 'o'), ...colsOf(code(fnBody('till_vat')), 'o'), ...colsOf(code(fnBody('till_till_id')), 'o')])]
    t('till_sealed_order names exactly till-pack-0 §4 C1\'s fields (34) plus till_id, vat_basis and vat_summary (37)', setEq(keysOf(so), PLAN_ORDER) && keysOf(so).length === PLAN_ORDER.length, { built: keysOf(so), plan: PLAN_ORDER })
    t('…and, with till_vat and till_till_id, reads only their columns (placed_at falls back to created_at; fiscal_state is computed from status)', reads.every(c => M.ORDER_SOURCE_COLUMNS.includes(c)) && setEq(colsOf(so, 'o'), M.ORDER_SOURCE_COLUMNS), reads.filter(c => !M.ORDER_SOURCE_COLUMNS.includes(c)))
    t('…and none of the unsealed ones — no name, email, phone, note, line note, table, reason, kitchen field, cache or fee', NOT_SEALED_ORDER.every(c => !reads.includes(c)), NOT_SEALED_ORDER.filter(c => reads.includes(c)))
    t('till_order_source (the update guard\'s "did a sealed column change?" filter) reads exactly the sealed form\'s columns', setEq(colsOf(code(fnBody('till_order_source')), 'o'), M.ORDER_SOURCE_COLUMNS), colsOf(code(fnBody('till_order_source')), 'o'))
    t('till_sealed_payment names exactly §4 C2\'s fields (12) and reads only them — never note, created_by or idempotency_key', setEq(keysOf(sp), PLAN_PAYMENT) && setEq(colsOf(sp, 'p'), PLAN_PAYMENT) && NOT_SEALED_PAYMENT.every(c => !colsOf(sp, 'p').includes(c)), { keys: keysOf(sp), cols: colsOf(sp, 'p') })
    const arrays = [...sl.matchAll(/array\[([^\]]+)\]/g)].map(m => [...m[1].matchAll(/'([A-Za-z_]+)'/g)].map(x => x[1]))
    t('till_sealed_lines: the item keys, the deal keys, the modifier keys and the tax-part keys are the mirror\'s (and no note key)',
      J(arrays) === J([M.ITEM_KEYS, M.MOD_KEYS, M.MOD_KEYS, M.DEAL_KEYS, M.MOD_KEYS, M.TAXPART_KEYS]) && !arrays.flat().some(k => M.NOTE_KEYS.includes(k)), arrays)
    t('till_pick drops the four note keys without a trace (specialInstructions, slotNotes, note, notes), and names any other key in byte order', /array\['specialInstructions', 'slotNotes', 'note', 'notes'\]/.test(pk) && /order by e\.key collate "C"/.test(pk))
    t('the mirror\'s field lists are the plan\'s', J(M.ORDER_FIELDS) === J(PLAN_ORDER) && J(M.PAYMENT_FIELDS) === J(PLAN_PAYMENT))
    const env = code(fnBody('till_write'))
    t('the envelope (till_write, the only writer): v, kind, truck_id, ref, version, reason, trading_day, software_version, recorded_at, identity, delta, data — and nothing else',
      setEq([...env.matchAll(/'([a-z_]+)', (?:1|p_|v_sv|public\.till_ts)/g)].map(m => m[1]), M.ENVELOPE_KEYS) && M.ENVELOPE_KEYS.length === 12)
    t('till_identity_data seals exactly the five receipt details (legal name, registered address — its five keys —, registration number, VAT number, VAT regime)',
      setEq([...code(fnBody('till_identity_data')).matchAll(/'([a-z_]+)', (?:t\.|public\.)/g)].map(m => m[1]), M.IDENTITY_KEYS)
      && /array\['address', 'town', 'suburb', 'region', 'postcode'\]/.test(code(fnBody('till_identity_data'))))
    t('the hash is sha256(prev_hash|seq|kind|ref|payload_hash) and payload_hash = sha256(payload), the first prev_hash 64 zeros',
      /v_hash := encode\(sha256\(convert_to\(v_prev \|\| '\|' \|\| v_seq::text \|\| '\|' \|\| p_kind \|\| '\|' \|\| p_ref \|\| '\|' \|\| v_ph, 'UTF8'\)\), 'hex'\)/.test(env)
      && /v_ph := encode\(sha256\(convert_to\(v_payload, 'UTF8'\)\), 'hex'\)/.test(env) && /repeat\('0', 64\)/.test(env))
  }

  // ══ B ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head(`B · THE MIRROR = THE DATABASE (${EXPORTS.join(', ') || 'no export'} — demo rows sealed by the real functions, rolled back)`)
  const rows = { orders: [], payments: [] }
  {
    t('a database export exists (docs/till-pack-1/rows-*.json, written by db-rollback-proofs.cjs --preflight-till-1 / --till-1-check)', EXPORTS.length > 0)
    for (const m of EXPORTS) {
      const d = JSON.parse(read(`docs/till-pack-1/rows-${m}.json`))
      const badO = d.orders.filter(r => M.jsonbText(M.sealedOrder(M.parseRaw(r.row))) !== r.sealed)
      const badP = d.payments.filter(r => M.jsonbText(M.sealedPayment(M.parseRaw(r.row))) !== r.sealed)
      t(`${m}: the mirror gives the database's sealed text byte for byte — ${d.orders.length} orders, ${d.payments.length} payments`, d.orders.length >= 5 && d.payments.length >= 3 && !badO.length && !badP.length,
        { orders: badO.slice(0, 1).map(r => [r.sealed, M.jsonbText(M.sealedOrder(M.parseRaw(r.row)))]), payments: badP.length })
      rows.orders.push(...d.orders.map(r => M.parseRaw(r.row))); rows.payments.push(...d.payments.map(r => M.parseRaw(r.row)))
    }
    for (const m of CHAINS) {
      const ch = read(`docs/till-pack-1/chain-${m}.jsonl`).trim().split('\n').map(l => JSON.parse(l))
      t(`${m}: every chain payload (${ch.length}) is canonical jsonb text — parsed and written again, byte for byte`, ch.every(e => M.jsonbText(M.parseRaw(e.payload)) === e.payload))
      const kinds = ch.reduce((a, e) => ((a[e.kind] = (a[e.kind] || 0) + 1), a), {})
      t(`${m}: the chain holds the till_start event, identity entries, orders, payments and deletions (${J(kinds)}), each payload's data the sealed form of its kind`,
        kinds.order >= 5 && kinds.payment >= 3 && kinds.deletion >= 1 && kinds.identity >= 1 && kinds.event === 1
        && ch.filter(e => e.kind === 'order').every(e => setEq(Object.keys(M.parseRaw(e.payload).data), PLAN_ORDER))
        && ch.filter(e => e.kind === 'payment').every(e => setEq(Object.keys(M.parseRaw(e.payload).data), PLAN_PAYMENT))
        && ch.filter(e => e.kind === 'identity').every(e => setEq(Object.keys(M.parseRaw(e.payload).data), M.IDENTITY_KEYS)))
      const last = new Map(); let deltas = 0; const badD = []
      for (const e of ch.filter(x => x.kind === 'order')) { const p = M.parseRaw(e.payload); const prev = last.get(e.ref)
        if (prev) { deltas++; if (M.jsonbText(p.delta) !== M.jsonbText(M.orderDelta(prev.data, p.data, Number(prev.version[M.NUM])))) badD.push(e.seq) } last.set(e.ref, p) }
      t(`${m}: the mirror recomputes every stored delta byte for byte (${deltas}), and every order version (${kinds.order}) reconciles its VAT`, deltas >= 5 && !badD.length
        && ch.filter(e => e.kind === 'order').every(e => M.vatReconciles(M.parseRaw(e.payload).data)), { badD })
    }
  }

  // ══ C ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('C · FUZZ — every column, random line keys: no personal or free-text value ever reaches a payload')
  {
    let seed = 1729
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
    const pickOne = a => a[Math.floor(rnd() * a.length)]
    const orderCols = rows.orders.length ? Object.keys(rows.orders[0]) : []
    const payCols = rows.payments.length ? Object.keys(rows.payments[0]) : []
    t(`the fuzz covers every orders column (${orderCols.length}) and every order_payments column (${payCols.length}) the database exported`, orderCols.length >= 60 && payCols.length >= 17 && orderCols.includes('line_notes') && payCols.includes('note'), { orderCols: orderCols.length, payCols: payCols.length })
    const typeOf = (rowsOf, k) => { for (const r of rowsOf) { const v = r[k]; if (v === null || v === undefined) continue; if (M.isNum(v)) return /_(minor|milli|bps)$|^receipt_no$/.test(k) ? 'int' : 'num'; if (typeof v === 'boolean') return 'bool'; if (typeof v === 'object') return 'json'
      if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return 'ts'; if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return 'date'; return 'text' } return 'text' }
    const marker = (k, i) => `«${k}:${i}»`
    const LINE_POOL = [...M.ITEM_KEYS, ...M.DEAL_KEYS, ...M.NOTE_KEYS, 'customerName', 'phone', 'email', 'allergy', 'comment', 'colour', 'Ö-key', 'with space', '_other_keys']
    const randLine = i => { const o = {}; const n = 1 + Math.floor(rnd() * 8); for (let j = 0; j < n; j++) { const k = pickOne(LINE_POOL); o[k] = rnd() < 0.3 ? M.num(String(Math.floor(rnd() * 900) / 100)) : marker(`line.${k}`, i) }
      if (rnd() < 0.4) o.modifiers = [{ name: marker('mod.name', i), price: M.num('0.50'), note: marker('mod.note', i), secret: marker('mod.secret', i) }]
      if (rnd() < 0.3) o.slotModifiers = { main: [{ name: marker('slotmod.name', i), notes: marker('slotmod.notes', i) }] }
      if (rnd() < 0.3) o.tax_parts = [{ tax_rate_milli: M.num('10000'), minor: M.num('250'), label: marker('taxpart.label', i) }]
      if (rnd() < 0.5) o.specialInstructions = marker('line.specialInstructions', i)
      return o }
    const fill = (cols, rowsOf, i) => Object.fromEntries(cols.map(k => { const ty = typeOf(rowsOf, k)
      if (rnd() < 0.08) return [k, null]
      if (ty === 'int') return [k, M.num(String(Math.floor(rnd() * 100000)))]
      if (ty === 'num') return [k, M.num(String(Math.floor(rnd() * 100000) / 100))]
      if (ty === 'bool') return [k, rnd() < 0.5]
      if (ty === 'ts') return [k, `2026-11-${String(10 + Math.floor(rnd() * 18)).padStart(2, '0')}T${String(Math.floor(rnd() * 24)).padStart(2, '0')}:00:00.${String(Math.floor(rnd() * 1e6)).padStart(6, '0')}+00:00`]
      if (ty === 'date') return [k, '2026-11-24']
      if (ty === 'json') return [k, k === 'items' || k === 'deals' ? Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => randLine(i)) : { v: 1, any: marker(k, i), nested: [marker(`${k}.n`, i)] }]
      return [k, marker(k, i)] }))
    const sealedOrderCols = new Set(PLAN_ORDER), sealedPayCols = new Set(PLAN_PAYMENT)
    const leaksO = [], leaksP = [], keysBad = []
    for (let i = 0; i < 600; i++) {
      const o = fill(orderCols, rows.orders, i)
      if (o.status === null || rnd() < 0.5) o.status = pickOne(['pending', 'confirmed', 'modified', 'cooking', 'ready', 'collected', 'cancelled', 'rejected', marker('status', i)])
      const txt = M.jsonbText(M.sealedOrder(o))
      for (const k of orderCols) if (!sealedOrderCols.has(k) && k !== 'created_at' && k !== 'status' && txt.includes(marker(k, i))) leaksO.push([i, k])
      for (const k of [...M.NOTE_KEYS.map(n => `line.${n}`), 'line.customerName', 'line.phone', 'line.email', 'line.allergy', 'line.comment', 'line.colour', 'mod.note', 'mod.secret', 'slotmod.notes', 'taxpart.label'])
        if (txt.includes(marker(k, i))) leaksO.push([i, k])
      if (/"(specialInstructions|slotNotes)"/.test(txt) || /"notes?"/.test(txt)) leaksO.push([i, 'note key name'])
      if (txt.includes(marker('status', i))) leaksO.push([i, 'status text'])
      const top = Object.keys(M.parseRaw(txt))
      if (!setEq(top, PLAN_ORDER)) keysBad.push([i, top])
      const sealedV = M.parseRaw(txt)
      if (typeof sealedV.till_id !== 'string' || !sealedV.till_id) keysBad.push([i, 'till_id'])
      if (Array.isArray(sealedV.items) && sealedV.items.some(x => x && typeof x === 'object' && !M.isNum(x) && !LINE_VAT_KEYS.every(k => k in x))) keysBad.push([i, 'line vat keys'])
      const p = fill(payCols, rows.payments, i)
      const ptxt = M.jsonbText(M.sealedPayment(p))
      for (const k of payCols) if (!sealedPayCols.has(k) && ptxt.includes(marker(k, i))) leaksP.push([i, k])
      if (!setEq(Object.keys(M.parseRaw(ptxt)), PLAN_PAYMENT)) keysBad.push([i, 'payment'])
    }
    t('600 fuzzed orders: no value of an unsealed column (name, email, phone, notes, line_notes, table_ref, reasons, kitchen, caches, fees …) appears', leaksO.filter(l => !String(l[1]).startsWith('line') && !String(l[1]).includes('mod') && !String(l[1]).includes('taxpart') && l[1] !== 'note key name' && l[1] !== 'status text').length === 0, leaksO.slice(0, 5))
    t('…no note, no unknown line key\'s value, no modifier\'s or tax part\'s extra value, no note KEY NAME, no free status text', leaksO.length === 0, leaksO.slice(0, 5))
    t('…and the payload\'s top-level keys are always exactly the 37 sealed fields, with a till_id, and every item line its VAT keys', keysBad.length === 0, keysBad.slice(0, 3))
    t('600 fuzzed payments: no note, created_by, idempotency key, fee or funding value appears; always exactly the 12 sealed fields', leaksP.length === 0, leaksP.slice(0, 5))
    const one = M.jsonbText(M.sealedLines([{ name: 'x', colour: 'red', 'Ö-key': 1, Zed: 2, specialInstructions: 'no nuts' }], 'item'))
    t('an unknown line key is NAMED in "_other_keys" (byte order, its value never), a note key leaves no trace', one === '[{"name": "x", "_other_keys": ["Zed", "colour", "Ö-key"]}]', one)
  }

  // ══ D ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('D · CANONICAL TEXT — key order, escapes, numeric scale')
  {
    let seed = 42
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
    const shuffle = v => { if (Array.isArray(v)) return v.map(shuffle); if (v && typeof v === 'object' && !M.isNum(v)) { const ks = Object.keys(v); for (let i = ks.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ks[i], ks[j]] = [ks[j], ks[i]] } return Object.fromEntries(ks.map(k => [k, shuffle(v[k])])) } return v }
    const stable = rows.orders.every(r => { const a = M.jsonbText(M.sealedOrder(r)); for (let i = 0; i < 25; i++) if (M.jsonbText(M.sealedOrder(shuffle(r))) !== a) return false; return true })
      && rows.payments.every(r => { const a = M.jsonbText(M.sealedPayment(r)); for (let i = 0; i < 25; i++) if (M.jsonbText(M.sealedPayment(shuffle(r))) !== a) return false; return true })
    t(`every exported order and payment, its keys (and its lines' keys) shuffled 25 times: the same sealed text every time`, stable && rows.orders.length > 0)
    t('jsonb key order: shorter keys first, then bytewise ({"bb","a","ab","é"} → a, ab, bb, é)', M.jsonbText({ bb: 1, a: 2, ab: 3, é: 4 }) === '{"a": 2, "ab": 3, "bb": 1, "é": 4}', M.jsonbText({ bb: 1, a: 2, ab: 3, é: 4 }))
    t('a duplicate key keeps its last value, as jsonb does', M.jsonbText(M.parseRaw('{"a": 1, "a": 2}')) === '{"a": 2}')
    t('escapes as Postgres writes them: \\" \\\\ \\n \\t, other controls \\u00XX, "/" and non-ASCII raw', M.jsonbText('a"b\\c\nd\te\u0001/é€') === '"a\\"b\\\\c\\nd\\te\\u0001/é€"', M.jsonbText('a"b\\c\nd\te\u0001/é€'))
    const nums = { '2.50': '2.50', '0': '0', '-0': '0', '-0.00': '0.00', '1e2': '100', '1.5e-3': '0.0015', '120E-1': '12.0', '1.50e1': '15.0', '-12.340': '-12.340', '10000': '10000' }
    t('numbers as numeric prints them: the scale kept (2.50), exponents expanded, no -0', Object.entries(nums).every(([a, b]) => M.numericText(a) === b), Object.entries(nums).map(([a]) => [a, M.numericText(a)]))
    t('timestamps as UTC text with microseconds, whatever the offset written', M.tillTs('2026-11-24T23:10:01.12+00:00') === '2026-11-24T23:10:01.120000Z' && M.tillTs('2026-11-25T00:10:01+01:00') === '2026-11-24T23:10:01.000000Z' && M.tillTs(null) === null)
  }

  // ══ E ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('E · THE CHAIN — verifies offline, and every single-byte change is detected')
  for (const m of CHAINS) {
    const text = read(`docs/till-pack-1/chain-${m}.jsonl`)
    const r = V.verifyText(text)
    t(`${m}: scripts/till-verify.cjs verifies the export (${Object.values(r.trucks).map(x => `${x.entries} entries`).join(', ')})`, r.ok && Object.keys(r.trucks).length === 1, r.problems.slice(0, 3))
    // EVERY byte of the file, changed (xor 1), judged by the verifier's own rules: each entry's own checks (cached for the untouched
    // entries) plus every link. 400 of them are also re-run through the plain verifier, to show the cache changes nothing.
    const buf = Buffer.from(text, 'utf8')
    const lines = text.split('\n')
    const ownCache = new Map(), memo = new Map()
    const ownWeak = new WeakMap()   // the untouched entries are the same objects every time; a mutated line is a new one
    const own = e => { if (!ownWeak.has(e)) { const k = JSON.stringify(e); if (!ownCache.has(k)) ownCache.set(k, V.entryProblems(e)); ownWeak.set(e, ownCache.get(k)) } return ownWeak.get(e) }
    const parsedOrig = lines.map(l => (l.trim() ? JSON.parse(l) : undefined))
    const starts = []; { let o = 0; for (const l of lines) { starts.push(o); o += Buffer.byteLength(l, 'utf8') + 1 } }
    let undetected = 0, checked = 0, fullRuns = 0, fullDisagree = 0
    const step = Math.max(1, Math.floor(buf.length / 400))
    for (let pos = 0; pos < buf.length; pos++) {
      const mutated = Buffer.from(buf); mutated[pos] ^= 0x01
      const mtext = mutated.toString('utf8')
      let detected
      if (buf[pos] === 0x0a || mutated[pos] === 0x0a) detected = !V.verifyText(mtext, memo).ok
      else {
        let L = starts.length - 1; while (L > 0 && starts[L] > pos) L--
        const mline = mtext.split('\n')[L]
        let e
        try { e = JSON.parse(mline) } catch { e = null }
        const entries = parsedOrig.map((x, i) => (i === L ? e : x)).filter(x => x !== undefined)
        detected = !V.verifyEntries(entries, own, memo).ok
      }
      if (!detected) undetected++
      checked++
      if (pos % step === 0) { fullRuns++; if ((!V.verifyText(mtext).ok) !== detected) fullDisagree++ }   // a fresh memo: nothing cached
    }
    t(`${m}: every one of the ${checked} single-byte changes to the export is detected`, undetected === 0, { undetected })
    t(`${m}: …and the plain verifier agrees on the ${fullRuns} it re-ran`, fullDisagree === 0, { fullDisagree })
  }

  // ══ F ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('F · RETENTION, THE LINE-NOTES MOVE AND ACCOUNT DELETION — the real patches change no sealed byte')
  {
    const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
    const out = (await esbuild.build({ stdin: { contents: "export { retentionPatch, notesPatch } from '@/lib/order-retention'\nexport { splitLineNotes } from '@/lib/line-notes'\nexport { ANON_LABEL } from '@/lib/account-deletion'", resolveDir: REPO, loader: 'ts' },
      bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent', alias: { '@': REPO },
      plugins: [{ name: 'tp1', setup(b) { b.onResolve({ filter: /^(server-only|@\/lib\/paperwork\/store|@\/lib\/loyalty\/retention)$/ }, a => ({ path: a.path, namespace: 'tp1' })); b.onLoad({ filter: /.*/, namespace: 'tp1' }, () => ({ contents: 'module.exports = {}', loader: 'js' })) } }] })).outputFiles[0].text
    const mod = { exports: {} }; new Function('module', 'exports', 'require', out)(mod, mod.exports, require)
    const { retentionPatch, notesPatch, splitLineNotes, ANON_LABEL } = mod.exports
    t('the real lib/order-retention.ts retentionPatch / notesPatch, lib/line-notes.ts splitLineNotes and account deletion\'s ANON_LABEL are loaded', typeof retentionPatch === 'function' && typeof notesPatch === 'function' && typeof splitLineNotes === 'function' && ANON_LABEL === '[deleted]')
    const base = rows.orders[0] || {}
    const withNotes = [
      { ...base, order_key: 'f-old', customer_name: 'Ada Customer', customer_email: 'ada@example.test', customer_phone: '+447700900001', notes: 'gluten free',
        items: [{ name: 'Galette', quantity: M.num('1'), unit_price: M.num('6.50'), specialInstructions: 'No onions — coeliac', modifiers: [{ name: 'Egg', price: M.num('1.00') }] }],
        deals: [{ name: 'Formule', price: M.num('10'), slots: { main: 'Crêpe' }, slotNotes: { main: 'no peanuts' }, tax_parts: [{ tax_rate_milli: M.num('10000'), minor: M.num('1000') }] }], line_notes: null },
      { ...base, order_key: 'f-new', customer_name: 'Bo Customer', customer_email: null, customer_phone: '+447700900002', notes: null,
        items: [{ name: 'Galette', quantity: M.num('1'), unit_price: M.num('6.50') }], deals: null, line_notes: { v: 1, items: { '#0': { at: 3, note: 'No onions' } } } },
    ]
    const plain = v => JSON.parse(JSON.stringify(v, (k, x) => (M.isNum(x) ? Number(x[M.NUM]) : x)))   // what the code reads (JS numbers)
    const back = (orig, patched) => { const o = { ...orig }; for (const [k, v] of Object.entries(patched)) o[k] = v; return o }
    const keepNums = (origLines, patchedLines) => (Array.isArray(patchedLines) && Array.isArray(origLines)
      ? patchedLines.map((l, i) => (l && typeof l === 'object' ? Object.fromEntries(Object.entries(l).map(([k, v]) => [k, k in (origLines[i] || {}) && J(plain(origLines[i][k])) === J(v) ? origLines[i][k] : v])) : l)) : patchedLines)
    const results = []
    for (const r of withNotes) {
      const before = M.jsonbText(M.sealedOrder(r))
      for (const [name, patch] of [['retention (12 months)', retentionPatch(plain(r), '')], ['account deletion: anonymise + notes', { customer_name: ANON_LABEL, customer_email: null, customer_phone: null, ...notesPatch(plain(r)) }]]) {
        const p = { ...patch }; if ('items' in p) p.items = keepNums(r.items, p.items); if ('deals' in p) p.deals = keepNums(r.deals, p.deals)
        const after = M.jsonbText(M.sealedOrder(back(r, p)))
        results.push([r.order_key, name, Object.keys(patch).sort().join(','), after === before])
      }
      if (r.order_key === 'f-old') {
        const s = splitLineNotes(plain(r.items), plain(r.deals))
        const moved = back(r, { items: keepNums(r.items, s.items), deals: keepNums(r.deals, s.deals), line_notes: s.line_notes })
        results.push([r.order_key, 'the line-notes move (france-notes-1)', 'items,deals,line_notes', M.jsonbText(M.sealedOrder(moved)) === before])
      }
    }
    t('the retention patch and account deletion\'s patches (old-style: notes inside the lines; new-style: line_notes) and the line-notes move leave the sealed text byte-identical — so till_verify stays true',
      results.length === 5 && results.every(x => x[3]), results)
    t('…and they really did change the rows (names, emails, phones, notes, the lines\' note fields)', results.filter(x => /customer_name/.test(x[2])).length >= 2 && results.some(x => /items/.test(x[2])))
  }

  // ══ G ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('G · SAFETY — demo trucks outside, never fail a sale, the order tables only read, nothing else touched')
  const mig = code(MIG)
  {
    const ap = code(fnBody('till_applies'))
    t('till_applies: a demo-… id or a plan \'demo\' truck is outside the till, unless till.include_demo = \'on\' (the proof script\'s SET LOCAL)', /current_setting\('till\.include_demo', true\)/.test(ap) && /p_truck like 'demo-%' then return false/.test(ap) && /coalesce\(t\.plan, ''\) <> 'demo'/.test(ap))
    const triggers = ['till_payment_inserted', 'till_order_inserted', 'till_order_guard', 'till_order_delete_guard', 'till_payment_guard', 'till_payment_delete_guard', 'till_truck_identity_changed']
    const guarded = triggers.filter(f => { const b = code(fnBody(f)); return /exception when others then/.test(b) && /set_config\('lock_timeout', '2s', true\)/.test(b) && /till_log_failure/.test(b) && /till_applies/.test(b) && /return null;/.test(b) && !/return new;|return old;/.test(b) })
    t(`every till trigger on orders / order_payments / trucks (${triggers.length}) does its work in one guarded block: 2 s lock_timeout, failures to till_failures, a WARNING — never an error — and returns NULL (an AFTER trigger: it cannot change the row)`, guarded.length === triggers.length, triggers.filter(f => !guarded.includes(f)))
    const created = [...mig.matchAll(/create trigger (\w+) (before|after) [^;]*? on public\.(\w+)/g)].map(m => `${m[3]}.${m[1]}:${m[2]}`)
    t('every till trigger on orders, order_payments and trucks is created AFTER (seven); only the append-only refusals (till_chain, action_audit_log) are BEFORE',
      J(created.filter(x => /^(orders|order_payments|trucks)\./.test(x)).sort()) === J(['order_payments.order_payments_till_chain:after', 'order_payments.order_payments_till_guard:after', 'order_payments.order_payments_till_guard_delete:after', 'orders.orders_till_guard:after', 'orders.orders_till_guard_delete:after', 'orders.orders_till_seal:after', 'trucks.trucks_till_identity:after'])
        && created.filter(x => /:before$/.test(x)).every(x => /^(till_chain|action_audit_log)\./.test(x)), created)
    t('🔴 the migration never writes an order, a payment or a truck: no INSERT INTO / UPDATE / DELETE FROM orders, order_payments or trucks anywhere in it (triggers and functions included), and no FOR UPDATE / FOR NO KEY UPDATE lock on them',
      !/\b(insert\s+into|update|delete\s+from)\s+(only\s+)?(public\.)?"?(orders|order_payments|trucks)"?\b/i.test(mig) && !/from public\.(orders|order_payments)\b[^;]*\bfor (no key )?update\b/i.test(mig), (mig.match(/\b(insert\s+into|update|delete\s+from)\s+(public\.)?(orders|order_payments|trucks)\b[^\n]*/gi) || []).slice(0, 3))
    t('the guard never refuses in this pack: no RAISE EXCEPTION in any till trigger (only the append-only one raises, on till_chain and action_audit_log)',
      triggers.every(f => !/raise exception/i.test(code(fnBody(f)))) && /raise exception '% is append-only/.test(code(fnBody('till_refuse_change'))))
    t('the migration is additive: no DROP, no RENAME, no ALTER TABLE of orders / order_payments / trucks (no column added to them), place_order_atomic_v2 not touched, no foreign key on the till tables',
      !/\bdrop\s+(table|function|trigger|column|index)/i.test(mig) && !/\brename\b/i.test(mig) && !/place_order_atomic/.test(mig) && !/\breferences\s+(public\.)?[a-z_]+\s*\(/i.test(mig) && !/foreign key\s*\(/i.test(mig)
      && !/alter table (public\.)?(orders|order_payments|trucks)\b/i.test(mig))
    t('the till_chain / action_audit_log append-only triggers cover UPDATE, DELETE and TRUNCATE; the API roles lose UPDATE / DELETE / TRUNCATE on action_audit_log',
      /create trigger till_chain_append_only before update or delete on public\.till_chain/.test(mig) && /create trigger till_chain_no_truncate before truncate on public\.till_chain/.test(mig)
      && /create trigger action_audit_log_append_only before update or delete on public\.action_audit_log/.test(mig) && /create trigger action_audit_log_no_truncate before truncate/.test(mig)
      && /revoke update, delete, truncate on public\.action_audit_log from anon, authenticated, service_role/.test(mig))
    const appCode = ['lib', 'app'].flatMap(d => { const out = []; const walk = p => { for (const f of fs.readdirSync(p, { withFileTypes: true })) { const q = path.join(p, f.name); if (f.isDirectory()) walk(q); else if (/\.(ts|tsx)$/.test(f.name)) out.push(q) } }; walk(path.join(REPO, d)); return out })
    const writesAudit = appCode.filter(f => /from\(\s*['"`]action_audit_log['"`]\s*\)\s*\.\s*(update|upsert|delete)\b/.test(fs.readFileSync(f, 'utf8')))
    t('no code updates, upserts or deletes action_audit_log (so append-only blocks no path that works today)', writesAudit.length === 0, writesAudit.map(f => path.relative(REPO, f)))
    // RE-PINNED by till-pack-2 (25 November 2026, docs/till-pack-2-report.md): till-pack-2 adds the till's server-side helpers on purpose
    // (lib/till/* — the guard's 409, the actor's role, the device fingerprint — calling only till-pack-2's RPCs). The rule this check keeps:
    // no OTHER app code names the till's tables or writers.
    const tillInCode = appCode.filter(f => !path.relative(REPO, f).startsWith('lib/till/') && /\btill_(chain|settings|failures|guard_events|chain_heads|order_seals|verify|baseline|append|write|seal)\b|sealed_(at|version)/.test(fs.readFileSync(f, 'utf8')))
    t('no route, screen, email or ticket code names the till\'s tables or writers (lib/till/* aside — till-pack-2\'s helpers)', tillInCode.length === 0, tillInCode.map(f => path.relative(REPO, f)))
    const dt = read('lib/delete-truck.ts')
    t('lib/delete-truck.ts (deleteTruckCascade: the demo-cleanup cron and Admin › delete truck) is untouched by this work and names no till table — its orders-first order is what keeps demo deletes outside the guard',
      !/till_|action_audit_log/.test(code(dt)) && /'orders',\s+\/\/ the guaranteed blocker/.test(dt))
  }

  // ══ H ═════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('H · THE LAW CHECK\'S PACK-1 CHANGES (till-law-1 §3, 1–6) — acceptance, line VAT, till_id, identity, deltas, events')
  {
    // change 1 — seal at acceptance; pending unsealed
    const ins = code(fnBody('till_order_inserted')), grd = code(fnBody('till_order_guard'))
    t('change 1 · an order inserted in any state but pending is sealed at once (accepted → \'accepted\', a final state → \'final_state\'); a pending insert is not',
      /if v_fs = 'pending' or not public\.till_applies\(new\.truck_id\) then return null; end if;/.test(ins) && /till_seal\(new\.order_key, case when v_fs = 'accepted' then 'accepted' else 'final_state' end\)/.test(ins))
    t('change 1 · an unsealed order is sealed when it LEAVES pending; while pending, nothing is chained (and a sealed order is re-sealed only when a sealed column changed)',
      /if not v_sealed then\s+if v_fs <> 'pending' then\s+perform public\.till_seal\(new\.order_key, case when v_fs = 'accepted' then 'accepted' else 'final_state' end\);/.test(grd)
      && /elsif public\.till_order_source\(old\) is distinct from public\.till_order_source\(new\) then\s+perform public\.till_seal\(new\.order_key, null\);/.test(grd))
    for (const m of EXPORTS) {
      const d = JSON.parse(read(`docs/till-pack-1/rows-${m}.json`))
      const ch = read(`docs/till-pack-1/chain-${m}.jsonl`).trim().split('\n').map(l => JSON.parse(l))
      const refs = new Set(ch.filter(e => e.kind === 'order').map(e => e.ref))
      const paid = new Set(d.payments.map(r => M.parseRaw(r.row).order_key))
      const rowsO = d.orders.map(r => M.parseRaw(r.row))
      const pendingUnpaid = rowsO.filter(o => o.status === 'pending' && !paid.has(o.order_key))
      const others = rowsO.filter(o => o.status !== 'pending' || paid.has(o.order_key))
      t(`${m}: every exported order that is not pending (or was paid) has sealed versions; every pending, unpaid one has none (${others.length} / ${pendingUnpaid.length})`,
        pendingUnpaid.length >= 1 && pendingUnpaid.every(o => !refs.has(o.order_key)) && others.every(o => refs.has(o.order_key)), { unsealed: others.filter(o => !refs.has(o.order_key)).map(o => o.order_key) })
    }
    // change 2 — the line VAT, on orders priced by the REAL VAT engine
    const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
    const out = (await esbuild.build({ stdin: { contents: "export { lineTax, taxBookFrom, stampItems, stampDeals } from '@/lib/order-tax'\nexport { computeOrderCharges } from '@/lib/order-charges'", resolveDir: REPO, loader: 'ts' },
      bundle: true, write: false, platform: 'node', format: 'cjs', logLevel: 'silent', alias: { '@': REPO } })).outputFiles[0].text
    const mod = { exports: {} }; new Function('module', 'exports', 'require', out)(mod, mod.exports, require)
    const E = mod.exports
    let seed = 20261125
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
    const pickOne = a => a[Math.floor(rnd() * a.length)]
    const COUNTRIES = [
      { c: 'FR', cur: 'EUR', incl: true, def: 10000, rates: [null, 5500, 10000, 20000], label: 'TVA' },
      { c: 'GB', cur: 'GBP', incl: true, def: 20000, rates: [null, 0, 20000], label: 'VAT' },
      { c: 'US', cur: 'USD', incl: false, def: 8875, rates: [null, 0, 4000], label: 'Sales tax' },
      { c: 'JP', cur: 'JPY', incl: true, def: 10000, rates: [null, 8000], label: 'Consumption tax' },
      { c: 'XX', cur: 'GBP', incl: true, def: null, rates: [null], label: 'VAT' },
    ]
    const bad = [], basisSeen = {}
    let deals = 0, mixed = 0
    for (let i = 0; i < 500; i++) {
      const K = pickOne(COUNTRIES), dp = K.cur === 'JPY' ? 0 : 2, f = 10 ** dp
      const price = () => (K.cur === 'JPY' ? 100 * (1 + Math.floor(rnd() * 20)) : Math.round((1 + rnd() * 18) * 20) / 20)
      const dishes = Array.from({ length: 6 }, (_, j) => ({ id: `d${j}`, name: `Dish ${j}`, price: price(), tax_rate_milli: pickOne(K.rates) }))
      const book = E.taxBookFrom(dishes, K.cur)
      const items = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => { const d = pickOne(dishes); const mods = rnd() < 0.3 ? [{ name: 'Extra', price: K.cur === 'JPY' ? 50 : 0.5 }] : []
        return { name: d.name, quantity: 1 + Math.floor(rnd() * 3), unit_price: d.price + mods.reduce((a, m) => a + m.price, 0), modifiers: mods, cartKey: `c${i}` } })
      const dl = rnd() < 0.5 ? Array.from({ length: 1 + Math.floor(rnd() * 2) }, (_, j) => ({ name: `Deal ${j}`, price: price() * 1.5, slots: { a: pickOne(dishes).name, b: rnd() < 0.15 ? 'Not on the menu' : pickOne(dishes).name },
        slotModifiers: rnd() < 0.3 ? { a: [{ name: 'Sauce', price: K.cur === 'JPY' ? 30 : 0.3 }] } : {} })) : null
      const pre = items.reduce((a, it) => a + Math.round(it.unit_price * it.quantity * f), 0) + (dl || []).reduce((a, d) => a + Math.round((d.price + Object.values(d.slotModifiers).flat().reduce((x, m) => x + m.price, 0)) * f), 0)
      const discount = rnd() < 0.4 ? Math.floor(pre * rnd() * 0.3) : 0
      const foodMinor = pre - discount
      const silent = console.warn; console.warn = () => {}
      const lt = E.lineTax({ items, deals: dl, foodMinor, book, defaultRate: K.def, currency: K.cur })
      console.warn = silent
      const rules = { taxInclusive: K.incl, taxLabel: K.label, taxRateMilli: K.def, feesTaxed: rnd() < 0.5, serviceFee: rnd() < 0.5 ? { recipient: 'truck', bps: 300, fixedMinor: K.cur === 'JPY' ? 10 : 20 } : null,
        tipping: { presetsBps: [1000] }, surcharge: null, cardFeePayer: 'truck', platformFee: null, ...(K.cur === 'JPY' ? { roundDown: true } : {}) }
      const ch = E.computeOrderCharges({ foodMinor, rules, channel: rnd() < 0.5 ? 'online_card' : 'walk_up', tip: rnd() < 0.5 ? { kind: 'percent', bps: 1000 } : null, foodParts: lt.parts })
      const row = { truck_id: 't', order_key: `k${i}`, receipt_no: null, id: `o${i}`, event_date: '2026-11-25', event_id: null, van_id: rnd() < 0.3 ? `van-${i}` : null, placed_at: '2026-11-25T12:00:00+00:00', created_at: '2026-11-25T12:00:00+00:00',
        collected_at: null, source: pickOne(['web', 'manual']), order_type: 'collection', items: E.stampItems(items, lt.itemStamps), deals: dl ? E.stampDeals(dl, lt.dealStamps) : null, discount_code: null,
        discount_amt: discount / f, subtotal: pre / f, total: ch.totalMinor / f, total_minor: ch.totalMinor, currency: K.cur, country: K.c, ...ch.snapshot, vat_regime: null, status: 'confirmed' }
      const sealed = M.sealedOrder(M.parseRaw(JSON.stringify(row)))
      basisSeen[sealed.vat_basis] = (basisSeen[sealed.vat_basis] || 0) + 1
      if (dl) deals++
      if ((ch.snapshot.tax_breakdown || []).length > 1) mixed++
      const problems = []
      if (!M.vatReconciles(sealed)) problems.push('does not reconcile')
      if (sealed.vat_basis !== (ch.snapshot.tax_breakdown ? 'breakdown' : 'order_rate')) problems.push(`basis ${sealed.vat_basis}`)
      sealed.items.forEach((it, j) => { const want = lt.itemStamps[j].tax_rate_milli; const got = it.vat_rate_milli === null ? null : Number(it.vat_rate_milli[M.NUM]); if (got !== want) problems.push(`item ${j} rate ${got} ≠ ${want}`) })
      ;(sealed.deals || []).forEach((d, j) => { const want = J(lt.dealStamps[j].tax_parts.map(p => [p.tax_rate_milli, p.minor])); const got = J(d.vat_parts.map(p => [p.vat_rate_milli === null ? null : Number(p.vat_rate_milli[M.NUM]), Number(p.line_price_minor[M.NUM])]))
        if (got !== want) problems.push(`deal ${j} parts ${got} ≠ ${want}`) })
      if (problems.length) bad.push({ i, country: K.c, problems: problems.slice(0, 3) })
    }
    t(`change 2 · 500 orders priced by the REAL VAT engine (lib/order-tax.ts lineTax + lib/order-charges.ts computeOrderCharges; FR, GB, US, JP and no-rate; ${mixed} with several rates, ${deals} with deals, discounts, tips, service fees): every line's VAT rate is the engine's stamp, every deal's parts are the engine's tax_parts, and every one RECONCILES to the minor unit (lines → rates → food → total)`,
      bad.length === 0 && mixed >= 50 && deals >= 150 && (basisSeen.breakdown || 0) >= 300, { bad: bad.slice(0, 5), basisSeen })
    const twin = (bd, mut) => { const p = M.parseRaw(JSON.stringify(bd)); mut(p); return M.vatReconciles(p) }
    const exA = EXPORTS.length ? JSON.parse(read(`docs/till-pack-1/rows-${EXPORTS[0]}.json`)).orders.map(r => M.parseRaw(r.sealed)).find(o => o.vat_basis === 'breakdown' && o.vat_summary.length >= 3) : null
    t('change 2 · …and the check is real: on the exported mixed-rate order, one line\'s excl. VAT +1, a summary VAT +1, or the total +1 each fails it', !!exA && M.vatReconciles(exA)
      && !twin(JSON.parse(M.jsonbText(exA)), p => { p.items[0].line_total_excl_vat_minor = M.num(String(Number(p.items[0].line_total_excl_vat_minor[M.NUM]) + 1)) })
      && !twin(JSON.parse(M.jsonbText(exA)), p => { p.vat_summary[0].vat_minor = M.num(String(Number(p.vat_summary[0].vat_minor[M.NUM]) + 1)) })
      && !twin(JSON.parse(M.jsonbText(exA)), p => { p.total_minor = M.num(String(Number(p.total_minor[M.NUM]) + 1)) }))
    const zero = [...read('lib/currencies.ts').matchAll(/code: '([A-Z]{3})'[^\n]*decimals: 0/g)].map(m => m[1]).sort()
    const three = [...read('lib/currencies.ts').matchAll(/code: '([A-Z]{3})'[^\n]*decimals: 3/g)].map(m => m[1]).sort()
    const sqlZero = (/in \(([^)]*)\) then 0/.exec(code(fnBody('till_minor_digits'))) || [, ''])[1].match(/[A-Z]{3}/g) || []
    const sqlThree = (/in \(([^)]*)\) then 3/.exec(code(fnBody('till_minor_digits'))) || [, ''])[1].match(/[A-Z]{3}/g) || []
    t(`change 2 · till_minor_digits (and the mirror) list exactly lib/currencies.ts's no-decimal (${zero.length}) and three-decimal (${three.length}) currencies`,
      J(sqlZero.sort()) === J(zero) && J(sqlThree.sort()) === J(three) && J([...M.ZERO_DEC].sort()) === J(zero) && J([...M.THREE_DEC].sort()) === J(three), { zero, sqlZero, three, sqlThree })
    // change 3 — till_id
    const tid = (van, source) => M.tillId({ van_id: van, source })
    t('change 3 · till_id: the van id when there is one; else \'web\' for an online order; else the recorded source (\'manual\'); \'unrecorded\' when empty — never null',
      tid('v-1', 'web') === 'v-1' && tid('v-1', 'manual') === 'v-1' && tid(null, 'web') === 'web' && tid(null, 'manual') === 'manual' && tid(null, ' manual ') === 'manual' && tid(null, null) === 'unrecorded' && tid(null, '') === 'unrecorded'
      && /when o\.van_id is not null then o\.van_id::text\s+when o\.source = 'web' then 'web'\s+else coalesce\(nullif\(btrim\(o\.source\), ''\), 'unrecorded'\) end/.test(code(fnBody('till_till_id'))))
    // changes 4 and 6 — identity entries, the event kind
    const ap = code(fnBody('till_append'))
    t('change 4 · before a truck\'s first entry the till_start event, before every entry the identity in force (written again when it changed); an order version names it {seq, hash}; a trucks trigger writes it AT ONCE when the five columns change',
      /if v_last = 0 then\s+perform public\.till_write\(p_truck, 'event', 'till_start'/.test(ap) && /perform public\.till_identity_sync\(p_truck,/.test(ap) && /if p_kind = 'order' then\s+select jsonb_build_object\('seq', h\.identity_seq, 'hash', h\.identity_hash\)/.test(ap)
      && /after update of legal_name, registered_address, registration_number, vat_number, vat_regime on public\.trucks/.test(mig))
    for (const m of CHAINS) {
      const r = V.verifyText(read(`docs/till-pack-1/chain-${m}.jsonl`))
      const ch = read(`docs/till-pack-1/chain-${m}.jsonl`).trim().split('\n').map(l => JSON.parse(l))
      const ids = ch.filter(e => e.kind === 'identity'), orders = ch.filter(e => e.kind === 'order')
      t(`${m}: seq 1 is till_start; ${ids.length} identity versions; all ${orders.length} order versions name the identity in force, run 1, 2, 3 … per order, carry a till_id, a delta from v2 on, and reconcile (scripts/till-verify.cjs)`,
        r.ok && ch[0].kind === 'event' && ch[0].ref === 'till_start' && ids.length >= 2 && ch.filter(e => e.kind === 'event').length === 1, r.problems.slice(0, 3))
    }
    t('change 6 · the chain\'s kinds are order, payment, deletion, identity, event, close, archive; the event types mode, version, close, archive, verify, export, till_start, till_end — and this pack writes only till_start',
      /kind in \('order', 'payment', 'deletion', 'identity', 'event', 'close', 'archive'\)/.test(mig) && /ref in \('mode', 'version', 'close', 'archive', 'verify', 'export', 'till_start', 'till_end'\)/.test(mig)
      && J([...mig.matchAll(/till_write\([^,]+, 'event', '([a-z_]+)'/g)].map(m => m[1])) === J(['till_start']) && J(M.KINDS) === J(['order', 'payment', 'deletion', 'identity', 'event', 'close', 'archive']))
    // change 5 — the delta, on the mirror: the new lines = the old − minus + plus, as multisets
    let dOk = 0, dBad = 0
    for (const r of (EXPORTS.length ? JSON.parse(read(`docs/till-pack-1/rows-${EXPORTS[0]}.json`)).orders : [])) {
      const a = M.sealedOrder(M.parseRaw(r.row))
      if (!Array.isArray(a.items) || !a.items.length) continue
      const raw = M.parseRaw(r.row); raw.items = [...raw.items.slice(1), { name: 'Added', quantity: M.num('2'), unit_price: M.num('3.20') }]
      const b = M.sealedOrder(raw), d = M.orderDelta(a, b, 1)
      const rebuilt = M.multisetMinus(a.items, d.minus.items).concat(d.plus.items).map(M.jsonbText).sort()
      if (J(rebuilt) === J(b.items.map(M.jsonbText).sort()) && d.minus.items.length >= 1 && d.plus.items.length >= 1 && d.fields.includes('items')) dOk++; else dBad++
    }
    t(`change 5 · the delta is a true plus / minus: on every exported order with lines (${dOk}), a line removed and one added — old lines − minus + plus = the new lines, and "items" is among the changed fields`, dOk >= 5 && dBad === 0, { dOk, dBad })
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
