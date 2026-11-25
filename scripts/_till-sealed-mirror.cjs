// scripts/_till-sealed-mirror.cjs — till-pack-1 / till-pack-1b (24–25 November 2026, docs/till-pack-1b-report.md): a JavaScript MIRROR of
// the database's sealed forms (supabase/migrations/20261129_till_pack_1.sql: till_sealed_order with till_vat and till_till_id,
// till_sealed_payment, till_sealed_lines, till_pick, till_ts, till_order_delta, till_vat_reconciles) and of Postgres's
// jsonb::text, so scripts/till-pack-1.cjs can fuzz the whitelist offline and scripts/till-verify.cjs can re-check deltas and VAT offline. A MODULE, not a harness (listed under shared_modules in scripts/harnesses.json).
//
// 🔴 THE DATABASE IS THE SOURCE OF TRUTH. This mirror is checked against it byte for byte: scripts/db-rollback-proofs.cjs exports demo
// rows and the sealed text the database computed for each (docs/till-pack-1/rows-*.json), and scripts/till-pack-1.cjs requires the
// mirror to give exactly the same text. A mirror that drifted would fail there, not here.
//
// jsonb::text, as Postgres writes it: object keys sorted by byte length, then bytewise (a duplicate key keeps its last value);
// "key": value pairs joined by ", "; arrays "[a, b]"; empty "{}" / "[]"; strings escaped \" \\ \b \f \n \r \t and other controls as
// \u00XX (lower-case hex), everything else raw UTF-8; numbers as numeric prints them (the scale kept: 2.50 stays 2.50; an exponent
// is expanded). parseRaw() reads JSON keeping every number's exact text, so nothing is lost on the way in.
'use strict'

const NUM = Symbol('num')
const num = text => ({ [NUM]: text })
const isNum = v => v !== null && typeof v === 'object' && Object.prototype.hasOwnProperty.call(v, NUM)

/** JSON → values, numbers kept as their exact text ({[NUM]: '2.50'}). Objects keep duplicate keys' LAST value, like jsonb. */
function parseRaw(text) {
  let i = 0
  const s = String(text)
  const ws = () => { while (i < s.length && ' \t\n\r'.includes(s[i])) i++ }
  const fail = m => { throw new Error(`parseRaw: ${m} at ${i}`) }
  function value() {
    ws()
    const c = s[i]
    if (c === '{') {
      i++; const o = {}; ws()
      if (s[i] === '}') { i++; return o }
      for (;;) {
        ws(); if (s[i] !== '"') fail('key'); const k = str(); ws(); if (s[i++] !== ':') fail(':')
        const v = value(); delete o[k]; o[k] = v; ws()
        if (s[i] === ',') { i++; continue } if (s[i] === '}') { i++; return o } fail('object')
      }
    }
    if (c === '[') {
      i++; const a = []; ws()
      if (s[i] === ']') { i++; return a }
      for (;;) { a.push(value()); ws(); if (s[i] === ',') { i++; continue } if (s[i] === ']') { i++; return a } fail('array') }
    }
    if (c === '"') return str()
    if (s.startsWith('true', i)) { i += 4; return true }
    if (s.startsWith('false', i)) { i += 5; return false }
    if (s.startsWith('null', i)) { i += 4; return null }
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(s.slice(i))
    if (!m) fail('value')
    i += m[0].length
    return num(m[0])
  }
  function str() {
    i++; let out = ''
    for (;;) {
      const c = s[i++]
      if (c === undefined) fail('string')
      if (c === '"') return out
      if (c === '\\') {
        const e = s[i++]
        if (e === 'u') { out += String.fromCharCode(parseInt(s.slice(i, i + 4), 16)); i += 4 }
        else out += ({ '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' })[e] ?? fail('escape')
      } else out += c
    }
  }
  const v = value(); ws(); if (i !== s.length) fail('trailing')
  return v
}

/** A JSON number's text as Postgres numeric prints it (jsonb keeps numeric): the scale kept, an exponent expanded, no -0. */
function numericText(raw) {
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(raw)
  if (!m) throw new Error(`numericText: ${raw}`)
  const neg = m[1] === '-', intp = m[2], frac = m[3] || '', exp = Number(m[4] || 0)
  let digits = intp + frac, point = intp.length + exp             // the decimal point sits after `point` digits
  const scale = Math.max(0, frac.length - exp)
  if (point < 0) { digits = '0'.repeat(-point) + digits; point = 0 }
  if (point > digits.length) digits += '0'.repeat(point - digits.length)
  let ip = digits.slice(0, point).replace(/^0+(?=\d)/, '') || '0'
  let fp = digits.slice(point)
  fp = fp.length >= scale ? fp.slice(0, scale) : fp + '0'.repeat(scale - fp.length)
  const body = scale ? `${ip}.${fp}` : ip
  return neg && /[1-9]/.test(body) ? `-${body}` : body
}

const keyCmp = (a, b) => { const A = Buffer.from(a, 'utf8'), B = Buffer.from(b, 'utf8'); return A.length - B.length || Buffer.compare(A, B) }
function escapeJson(str) {
  let out = '"'
  for (const ch of String(str)) {
    const c = ch.codePointAt(0)
    if (ch === '"') out += '\\"'
    else if (ch === '\\') out += '\\\\'
    else if (ch === '\b') out += '\\b'
    else if (ch === '\f') out += '\\f'
    else if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else if (c < 0x20) out += '\\u' + c.toString(16).padStart(4, '0')
    else out += ch
  }
  return out + '"'
}
/** Postgres jsonb::text. Accepts parseRaw values (and plain JS numbers, written as JSON writes them). */
function jsonbText(v) {
  if (v === null || v === undefined) return 'null'
  if (v === true) return 'true'
  if (v === false) return 'false'
  if (isNum(v)) return numericText(v[NUM])
  if (typeof v === 'number') return numericText(JSON.stringify(v))
  if (typeof v === 'string') return escapeJson(v)
  if (Array.isArray(v)) return v.length ? `[${v.map(jsonbText).join(', ')}]` : '[]'
  const keys = Object.keys(v).filter(k => v[k] !== undefined).sort(keyCmp)
  return keys.length ? `{${keys.map(k => `${escapeJson(k)}: ${jsonbText(v[k])}`).join(', ')}}` : '{}'
}

/** till_ts: a timestamptz (as row_to_json writes it) → UTC 'YYYY-MM-DDTHH:MM:SS.ffffffZ' (microseconds always). */
function tillTs(v) {
  if (v === null || v === undefined) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(String(v))
  if (!m) throw new Error(`tillTs: ${v}`)
  const micro = (m[7] || '').padEnd(6, '0')
  let off = 0
  if (m[8] !== 'Z') { const o = /^([+-])(\d{2}):?(\d{2})?$/.exec(m[8]); off = (o[1] === '-' ? -1 : 1) * (Number(o[2]) * 60 + Number(o[3] || 0)) }
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) - off * 60000)
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${micro}Z`
}

/** The whitelists, exactly as the migration's functions list them. */
const NOTE_KEYS = ['specialInstructions', 'slotNotes', 'note', 'notes']
const ITEM_KEYS = ['name', 'quantity', 'unit_price', 'price', 'item_id', 'tax_rate_milli', 'cartKey', 'source', 'modifiers', 'upsells']
const DEAL_KEYS = ['name', 'price', 'quantity', 'bundle_price', 'original_price', 'modifierExtra', 'deal_id', 'cartKey', 'source', 'slots', 'slotModifiers', 'tax_parts']
const MOD_KEYS = ['name', 'price', 'quantity']
const TAXPART_KEYS = ['tax_rate_milli', 'minor']
const ORDER_FIELDS = ['truck_id', 'order_key', 'receipt_no', 'id', 'event_date', 'event_id', 'van_id', 'placed_at', 'collected_at', 'source', 'order_type',
  'items', 'deals', 'discount_code', 'discount_amt', 'subtotal', 'total', 'total_minor', 'currency', 'country', 'food_minor', 'tax_minor', 'tax_rate_milli',
  'tax_inclusive', 'tax_label', 'tax_breakdown', 'tip_minor', 'tip_pct_bps', 'service_fee_minor', 'service_fee_recipient', 'card_surcharge_minor',
  'card_fee_payer', 'vat_regime', 'fiscal_state', 'till_id', 'vat_basis', 'vat_summary']
const IDENTITY_KEYS = ['legal_name', 'registered_address', 'registration_number', 'vat_number', 'vat_regime']
const ADDRESS_KEYS = ['address', 'town', 'suburb', 'region', 'postcode']
const ENVELOPE_KEYS = ['v', 'kind', 'truck_id', 'ref', 'version', 'reason', 'trading_day', 'software_version', 'recorded_at', 'identity', 'delta', 'data']
const KINDS = ['order', 'payment', 'deletion', 'identity', 'event', 'close', 'archive']
const EVENT_TYPES = ['mode', 'version', 'close', 'archive', 'verify', 'export', 'till_start', 'till_end']
const PAYMENT_FIELDS = ['id', 'order_key', 'truck_id', 'kind', 'channel', 'method', 'amount_minor', 'currency', 'state', 'external_ref', 'livemode', 'created_at']
/** The ORDER columns each sealed key reads (placed_at falls back to created_at; fiscal_state is computed from status). */
const ORDER_SOURCE_COLUMNS = [...ORDER_FIELDS.filter(f => !['fiscal_state', 'till_id', 'vat_basis', 'vat_summary'].includes(f)), 'created_at', 'status']

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v) && !isNum(v)
/** till_pick */
function pick(o, keys) {
  if (!isObj(o)) return o
  const out = {}
  for (const k of Object.keys(o)) if (keys.includes(k)) out[k] = o[k]
  const other = Object.keys(o).filter(k => !keys.includes(k) && !NOTE_KEYS.includes(k)).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
  if (other.length) out._other_keys = other
  return out
}
/** till_pick_all */
const pickAll = (a, keys) => (Array.isArray(a) ? a.map(x => pick(x, keys)) : a)
/** till_sealed_lines */
function sealedLines(lines, kind) {
  if (!Array.isArray(lines)) return lines
  return lines.map(e => {
    if (!isObj(e)) return e
    if (kind === 'item') {
      const out = pick(e, ITEM_KEYS)
      if ('modifiers' in e) out.modifiers = pickAll(e.modifiers, MOD_KEYS)
      if ('upsells' in e) out.upsells = pickAll(e.upsells, MOD_KEYS)
      return out
    }
    const out = pick(e, DEAL_KEYS)
    if (isObj(e.slotModifiers)) out.slotModifiers = Object.fromEntries(Object.keys(e.slotModifiers).map(k => [k, pickAll(e.slotModifiers[k], MOD_KEYS)]))
    if ('tax_parts' in e) out.tax_parts = pickAll(e.tax_parts, TAXPART_KEYS)
    return out
  })
}
/** till_fiscal_state */
function fiscalState(status) {
  if (['confirmed', 'modified', 'cooking', 'ready'].includes(status)) return 'accepted'
  if (['pending', 'collected', 'cancelled', 'rejected'].includes(status)) return status
  return 'other'
}
const col = (row, k) => (row[k] === undefined ? null : row[k])

// ── exact decimals (BigInt), for the VAT lines: a value is { n, s } = n / 10^s ──────────────────────────────────────────────────────
const P10 = s => 10n ** BigInt(s)
function dec(text) { const t = numericText(String(text)); const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(t); const f = m[3] || ''; return { n: BigInt(m[1] + m[2] + f), s: f.length } }
const D0 = { n: 0n, s: 0 }
const dInt = i => ({ n: BigInt(i), s: 0 })
const dMul = (a, b) => ({ n: a.n * b.n, s: a.s + b.s })
const dAdd = (a, b) => { const s = Math.max(a.s, b.s); return { n: a.n * P10(s - a.s) + b.n * P10(s - b.s), s } }
const dSub = (a, b) => dAdd(a, { n: -b.n, s: b.s })
/** round(x) half away from zero → BigInt */
function dRound(a) { const d = P10(a.s); const q = a.n / d, r = a.n % d; const ar = r < 0n ? -r : r; return 2n * ar >= d ? q + (a.n < 0n ? -1n : 1n) : q }
/** round(num / den) half away from zero, exactly (BigInts) */
function roundDiv(num, den) { const q = num / den, r = num % den; const ar = r < 0n ? -r : r; return 2n * ar >= (den < 0n ? -den : den) ? q + ((num < 0n) !== (den < 0n) ? -1n : 1n) : q }
const dText = a => { if (a.s === 0) return a.n.toString(); const neg = a.n < 0n; let t = (neg ? -a.n : a.n).toString().padStart(a.s + 1, '0'); t = `${t.slice(0, -a.s)}.${t.slice(-a.s)}`; return neg && /[1-9]/.test(t) ? `-${t}` : t }
/** till_num */
function tNum(v) { if (isNum(v)) return dec(v[NUM]); if (typeof v === 'string' && /^\s*-?[0-9]+(\.[0-9]+)?\s*$/.test(v)) return dec(v.trim()); return D0 }
/** till_rate: a whole number ≥ 0 (below 2^53), else null */
function tRate(v) { if (!isNum(v)) return null; const d = dec(v[NUM]); if (d.n < 0n || d.n % P10(d.s) !== 0n) return null; const i = d.n / P10(d.s); return i < 9007199254740992n ? i : null }
const big = v => (isNum(v) ? dec(v[NUM]) : null)
const bigInt = v => { const d = big(v); return d && d.n % P10(d.s) === 0n ? d.n / P10(d.s) : null }
const nOut = i => num(i.toString())
const rOut = r => (r === null ? null : num(r.toString()))
const rKey = r => (r === null ? 'none' : r.toString())
/** till_minor_digits */
const ZERO_DEC = ['BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA', 'PYG', 'VUV', 'XAF', 'XOF', 'XPF']
const THREE_DEC = ['BHD', 'JOD', 'KWD', 'OMR', 'TND']
const minorDigits = c => { const u = String(c ?? '').toUpperCase(); return ZERO_DEC.includes(u) ? 0 : THREE_DEC.includes(u) ? 3 : 2 }
/** till_allocate (lib/order-tax.ts allocate) on BigInts */
function allocate(total, weights) {
  const n = weights.length
  if (n === 0) return []
  const w = weights.map(x => (x > 0n ? x : 0n))
  const S = w.reduce((a, b) => a + b, 0n)
  if (S === 0n) return w.map((_, i) => (i === 0 ? total : 0n))
  const sg = total < 0n ? -1n : 1n, T = total < 0n ? -total : total
  const base = w.map(x => (T * x) / S)
  let left = T - base.reduce((a, b) => a + b, 0n)
  const order = w.map((x, i) => ({ i, rem: (T * x) % S })).sort((a, b) => (a.rem < b.rem ? 1 : a.rem > b.rem ? -1 : a.i - b.i))
  for (const o of order) { if (left <= 0n) break; base[o.i] += 1n; left -= 1n }
  return base.map(x => sg * x)
}
/** till_vat(row): { basis, items: [...], deals: [[...]], summary: [...] } as values (numbers as NUM) */
function vatOf(row) {
  const scale = P10(minorDigits(col(row, 'currency')))
  const r0 = (() => { const v = col(row, 'tax_rate_milli'); return isNum(v) ? bigInt(v) : null })()
  const incl = col(row, 'tax_inclusive') === true
  const L = []   // { kind, idx, rate, price }
  const items = col(row, 'items'), deals = col(row, 'deals')
  if (Array.isArray(items)) items.forEach((e, i) => {
    if (isObj(e)) { const p = dRound(dMul(dMul(tNum(e.unit_price), tNum(e.quantity)), { n: scale, s: 0 })); L.push({ kind: 'item', idx: i, rate: 'tax_rate_milli' in e ? tRate(e.tax_rate_milli) : r0, price: p > 0n ? p : 0n }) }
    else L.push({ kind: 'item', idx: i, rate: r0, price: 0n })
  })
  if (Array.isArray(deals)) deals.forEach((e, i) => {
    if (isObj(e) && Array.isArray(e.tax_parts) && e.tax_parts.length > 0) {
      for (const q of e.tax_parts) { const p = dRound(tNum(isObj(q) ? q.minor : undefined)); L.push({ kind: 'deal', idx: i, rate: tRate(isObj(q) ? q.tax_rate_milli : undefined), price: p > 0n ? p : 0n }) }
    } else if (isObj(e)) {
      let extra = D0
      if (isObj(e.slotModifiers)) for (const k of Object.keys(e.slotModifiers)) { const list = e.slotModifiers[k]; if (Array.isArray(list)) for (const m of list) extra = dAdd(extra, tNum(isObj(m) ? m.price : undefined)) }
      const p = dRound(dMul(dAdd(tNum(e.price), extra), { n: scale, s: 0 }))
      L.push({ kind: 'deal', idx: i, rate: r0, price: p > 0n ? p : 0n })
    } else L.push({ kind: 'deal', idx: i, rate: r0, price: 0n })
  })
  const fm = col(row, 'food_minor'), st = col(row, 'subtotal'), tm = col(row, 'total_minor'), tt = col(row, 'total')
  const food = isNum(fm) ? dRound(big(fm))
    : isNum(st) ? dRound(dMul(dSub(big(st), isNum(col(row, 'discount_amt')) ? big(col(row, 'discount_amt')) : D0), { n: scale, s: 0 }))
    : isNum(tm) ? dRound(big(tm)) : isNum(tt) ? dRound(dMul(big(tt), { n: scale, s: 0 })) : L.reduce((a, l) => a + l.price, 0n)
  const bd = col(row, 'tax_breakdown')
  const hasBd = Array.isArray(bd) && bd.length > 0
  let basis, G = []
  let bOk = hasBd && bd.every(isObj)
  if (bOk) {
    const bk = bd.map(r => rKey(tRate(r.rate_milli)))
    const lk = L.map(l => rKey(l.rate))
    bOk = new Set(bk).size === bk.length && !L.some(l => l.price > 0n && !bk.includes(rKey(l.rate)))
      && !bd.some(r => dRound(tNum(r.food_minor)) !== 0n && !lk.includes(rKey(tRate(r.rate_milli))))
      && bd.reduce((a, r) => a + dRound(tNum(r.food_minor)), 0n) === food
  }
  if (bOk) {
    basis = 'breakdown'
    G = bd.map(r => { const rate = tRate(r.rate_milli), f = dRound(tNum(r.food_minor)), v = dRound(tNum(r.tax_minor)); return { rate, key: rKey(rate), food: f, vat: v, excl: incl ? f - v : f } })
  } else {
    basis = hasBd ? 'recomputed' : isNum(fm) ? 'order_rate' : 'legacy'
    const rates = []
    for (const l of L) if (!rates.some(r => r === l.rate)) rates.push(l.rate)
    rates.sort((a, b) => (a === null ? (b === null ? 0 : -1) : b === null ? 1 : a < b ? -1 : a > b ? 1 : 0))
    G = rates.map(rate => ({ rate, key: rKey(rate), pre: L.filter(l => rKey(l.rate) === rKey(rate)).reduce((a, l) => a + l.price, 0n) }))
    if (!G.length) G = [{ rate: r0, key: rKey(r0), pre: 0n }]
    const foods = G.length === 1 ? [food] : allocate(food, G.map(g => g.pre))
    const tx = col(row, 'tax_minor')
    G.forEach((g, i) => {
      g.food = foods[i]
      g.vat = g.rate === null || g.rate === 0n ? 0n
        : incl ? (g.food > 0n ? roundDiv(g.food * g.rate, 100000n + g.rate) : 0n)
        : G.length === 1 && isNum(tx) ? dRound(big(tx)) : roundDiv(g.food * g.rate, 100000n)
      g.excl = incl ? g.food - g.vat : g.food
    })
  }
  const excl = L.map(() => 0n)
  for (const g of G) {
    const pos = L.map((l, j) => (rKey(l.rate) === g.key ? j : -1)).filter(j => j >= 0)
    if (pos.length) { const sh = allocate(g.excl, pos.map(j => L[j].price)); pos.forEach((j, k) => { excl[j] = sh[k] }) }
  }
  const line = j => ({ vat_rate_milli: rOut(L[j].rate), line_price_minor: nOut(L[j].price), line_total_excl_vat_minor: nOut(excl[j]) })
  const dealParts = []
  L.forEach((l, j) => { if (l.kind === 'deal') { (dealParts[l.idx] = dealParts[l.idx] || []).push(line(j)) } })
  return {
    basis,
    items: L.map((l, j) => (l.kind === 'item' ? line(j) : null)).filter(Boolean),
    deals: dealParts.filter(Boolean),
    summary: G.map(g => ({ vat_rate_milli: rOut(g.rate), food_minor: nOut(g.food), excl_vat_minor: nOut(g.excl), vat_minor: nOut(g.vat) })),
  }
}
/** till_till_id */
function tillId(row) {
  if (col(row, 'van_id') !== null) return String(col(row, 'van_id'))
  const s = col(row, 'source')
  if (s === 'web') return 'web'
  const t = s === null ? '' : String(s).replace(/^ +| +$/g, '')
  return t || 'unrecorded'
}
/** till_sealed_order(row) as a value (jsonbText() gives the database's text). `row` = parseRaw(row_to_json(o)::text). */
function sealedOrder(row) {
  const o = {}
  const v = vatOf(row)
  for (const f of ORDER_FIELDS) {
    if (f === 'placed_at') o[f] = tillTs(col(row, 'placed_at') ?? col(row, 'created_at'))
    else if (f === 'collected_at') o[f] = tillTs(col(row, 'collected_at'))
    else if (f === 'items') { const si = sealedLines(col(row, 'items'), 'item'); o[f] = Array.isArray(si) ? si.map((e, i) => (isObj(e) ? { ...e, ...(v.items[i] || {}) } : e)) : si }
    else if (f === 'deals') { const sd = sealedLines(col(row, 'deals'), 'deal'); o[f] = Array.isArray(sd) ? sd.map((e, i) => (isObj(e) ? { ...e, vat_parts: v.deals[i] || [] } : e)) : sd }
    else if (f === 'fiscal_state') o[f] = fiscalState(col(row, 'status'))
    else if (f === 'till_id') o[f] = tillId(row)
    else if (f === 'vat_basis') o[f] = v.basis
    else if (f === 'vat_summary') o[f] = v.summary
    else o[f] = col(row, f)
  }
  return o
}
/** till_sealed_payment(row) as a value. */
function sealedPayment(row) {
  const p = {}
  for (const f of PAYMENT_FIELDS) p[f] = f === 'created_at' ? tillTs(col(row, 'created_at')) : col(row, f)
  return p
}

// ── the delta (till_order_delta) and the reconciliation (till_vat_reconciles) ─────────────────────────────────────────────────────
const MONEY_FIELDS = ['subtotal', 'discount_amt', 'total', 'total_minor', 'food_minor', 'tax_minor', 'tip_minor', 'service_fee_minor', 'card_surcharge_minor']
const T = v => (v === undefined ? undefined : jsonbText(v))
/** till_multiset_minus */
function multisetMinus(a, b) {
  const A = Array.isArray(a) ? a : [], B = Array.isArray(b) ? b : []
  const cnt = new Map(); for (const e of B) { const t = jsonbText(e); cnt.set(t, (cnt.get(t) || 0) + 1) }
  const seen = new Map(), out = []
  for (const e of A) { const t = jsonbText(e); const k = (seen.get(t) || 0) + 1; seen.set(t, k); if (k > (cnt.get(t) || 0)) out.push(e) }
  return out
}
const sumBy = summary => { const m = new Map(); for (const s of Array.isArray(summary) ? summary : []) { const r = s.vat_rate_milli; const k = r === null || r === undefined ? 'none' : numericText(r[NUM]); const cur = m.get(k) || { rate: r === null || r === undefined ? null : BigInt(numericText(r[NUM])), excl: D0, vat: D0 }
  cur.excl = dAdd(cur.excl, isNum(s.excl_vat_minor) ? big(s.excl_vat_minor) : D0); cur.vat = dAdd(cur.vat, isNum(s.vat_minor) ? big(s.vat_minor) : D0); m.set(k, cur) } return m }
/** till_order_delta(old, new, from) as a value */
function orderDelta(old, nw, from) {
  const amounts = {}
  for (const f of MONEY_FIELDS) {
    if (T(old[f]) === T(nw[f])) continue
    amounts[f] = { from: old[f] === undefined ? null : old[f], to: nw[f] === undefined ? null : nw[f], change: isNum(old[f]) && isNum(nw[f]) ? num(dText(dSub(big(nw[f]), big(old[f])))) : null }
  }
  const a = sumBy(old.vat_summary), b = sumBy(nw.vat_summary)
  const vat = [...new Set([...a.keys(), ...b.keys()])].map(k => { const x = a.get(k), y = b.get(k); const rate = (y || x).rate
    return { rate, de: dSub(y ? y.excl : D0, x ? x.excl : D0), dv: dSub(y ? y.vat : D0, x ? x.vat : D0) } })
    .filter(z => z.de.n !== 0n || z.dv.n !== 0n)
    .sort((p, q) => (p.rate === null ? (q.rate === null ? 0 : -1) : q.rate === null ? 1 : p.rate < q.rate ? -1 : p.rate > q.rate ? 1 : 0))
    .map(z => ({ vat_rate_milli: z.rate === null ? null : num(z.rate.toString()), excl_vat_minor: num(dText(z.de)), vat_minor: num(dText(z.dv)) }))
  const fields = [...new Set([...Object.keys(old), ...Object.keys(nw)])].filter(k => T(old[k]) !== T(nw[k])).sort((x, y) => Buffer.compare(Buffer.from(x), Buffer.from(y)))
  return {
    from_version: num(String(from)),
    minus: { items: multisetMinus(old.items, nw.items), deals: multisetMinus(old.deals, nw.deals) },
    plus: { items: multisetMinus(nw.items, old.items), deals: multisetMinus(nw.deals, old.deals) },
    amounts, vat, fields,
  }
}
/** till_vat_reconciles(sealed order value) → boolean */
function vatReconciles(p) {
  const scale = P10(minorDigits(p.currency))
  const incl = p.tax_inclusive === true
  const items = Array.isArray(p.items) ? p.items : [], deals = Array.isArray(p.deals) ? p.deals : []
  const sum = p.vat_summary
  if (!Array.isArray(sum) || sum.length === 0) return false
  const has = q => isObj(q) && 'vat_rate_milli' in q && isNum(q.line_total_excl_vat_minor) && isNum(q.line_price_minor)
  if (items.some(i => isObj(i) && !has(i))) return false
  if (deals.some(d => isObj(d) && (!Array.isArray(d.vat_parts) || d.vat_parts.length === 0 || d.vat_parts.some(q => !has(q))))) return false
  const key = r => (r === null || r === undefined ? 'none' : numericText(r[NUM]))
  const lines = [...items.filter(isObj), ...deals.filter(isObj).flatMap(d => d.vat_parts)]
  const lg = new Map(); for (const l of lines) lg.set(key(l.vat_rate_milli), dAdd(lg.get(key(l.vat_rate_milli)) || D0, big(l.line_total_excl_vat_minor)))
  const sg = new Map(); for (const s of sum) sg.set(key(s.vat_rate_milli), dAdd(sg.get(key(s.vat_rate_milli)) || D0, isNum(s.excl_vat_minor) ? big(s.excl_vat_minor) : D0))
  for (const k of new Set([...lg.keys(), ...sg.keys()])) if (dSub(lg.get(k) || D0, sg.get(k) || D0).n !== 0n) return false
  if (new Set(sum.map(s => key(s.vat_rate_milli))).size !== sum.length) return false
  const nSum = lines.reduce((a, l) => a + dRound(big(l.line_price_minor)), 0n)
  const food = isNum(p.food_minor) ? dRound(big(p.food_minor))
    : isNum(p.subtotal) ? dRound(dMul(dSub(big(p.subtotal), isNum(p.discount_amt) ? big(p.discount_amt) : D0), { n: scale, s: 0 }))
    : isNum(p.total_minor) ? dRound(big(p.total_minor)) : isNum(p.total) ? dRound(dMul(big(p.total), { n: scale, s: 0 })) : nSum
  const g = s => ({ f: big(s.food_minor), e: big(s.excl_vat_minor), v: big(s.vat_minor) })
  if (dSub(sum.reduce((a, s) => dAdd(a, big(s.food_minor)), D0), dInt(food)).n !== 0n) return false
  for (const s of sum) { const x = g(s); if (incl ? dSub(dAdd(x.e, x.v), x.f).n !== 0n : dSub(x.e, x.f).n !== 0n) return false }
  if (!incl && isNum(p.tax_minor) && dSub(sum.reduce((a, s) => dAdd(a, big(s.vat_minor)), D0), big(p.tax_minor)).n !== 0n) return false
  if (p.vat_basis === 'breakdown') {
    const bd = Array.isArray(p.tax_breakdown) ? p.tax_breakdown : []
    const A = jsonbText(bd.map(r => [rOut(tRate(isObj(r) ? r.rate_milli : undefined)), nOut(dRound(tNum(isObj(r) ? r.food_minor : undefined))), nOut(dRound(tNum(isObj(r) ? r.tax_minor : undefined)))]))
    const B = jsonbText(sum.map(s => [s.vat_rate_milli === null || s.vat_rate_milli === undefined ? null : num(numericText(s.vat_rate_milli[NUM])), s.food_minor, s.vat_minor]))
    if (A !== B) return false
  }
  const z = v => (isNum(v) ? big(v) : D0)
  if (isNum(p.food_minor) && isNum(p.total_minor)) {
    if (dSub(big(p.total_minor), [p.food_minor, p.tax_minor, p.tip_minor, p.service_fee_minor, p.card_surcharge_minor].reduce((a, v) => dAdd(a, z(v)), D0)).n !== 0n) return false
  } else if (isNum(p.subtotal) && isNum(p.total)) {
    if (dSub(big(p.total), dSub(big(p.subtotal), z(p.discount_amt))).n !== 0n) return false
  }
  return true
}

module.exports = { NUM, num, isNum, parseRaw, numericText, jsonbText, keyCmp, tillTs, pick, pickAll, sealedLines, fiscalState, sealedOrder, sealedPayment,
  vatOf, tillId, allocate, minorDigits, orderDelta, multisetMinus, vatReconciles,
  NOTE_KEYS, ITEM_KEYS, DEAL_KEYS, MOD_KEYS, TAXPART_KEYS, ORDER_FIELDS, PAYMENT_FIELDS, ORDER_SOURCE_COLUMNS, MONEY_FIELDS, ZERO_DEC, THREE_DEC, IDENTITY_KEYS, ADDRESS_KEYS, ENVELOPE_KEYS, KINDS, EVENT_TYPES }
