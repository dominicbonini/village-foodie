// scripts/_till-sealed-mirror.cjs — till-pack-1 (24 November 2026, docs/till-pack-1-report.md): a JavaScript MIRROR of the database's
// sealed forms (supabase/migrations/20261129_till_pack_1.sql: till_sealed_order, till_sealed_payment, till_sealed_lines, till_pick,
// till_ts) and of Postgres's jsonb::text, so scripts/till-pack-1.cjs can fuzz the whitelist offline and scripts/till-verify.cjs can
// recompute nothing it does not need to. A MODULE, not a harness (listed under shared_modules in scripts/harnesses.json).
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
  'card_fee_payer', 'vat_regime', 'fiscal_state']
const PAYMENT_FIELDS = ['id', 'order_key', 'truck_id', 'kind', 'channel', 'method', 'amount_minor', 'currency', 'state', 'external_ref', 'livemode', 'created_at']
/** The ORDER columns each sealed key reads (placed_at falls back to created_at; fiscal_state is computed from status). */
const ORDER_SOURCE_COLUMNS = [...ORDER_FIELDS.filter(f => f !== 'fiscal_state'), 'created_at', 'status']

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
/** till_sealed_order(row) as a value (jsonbText() gives the database's text). `row` = parseRaw(row_to_json(o)::text). */
function sealedOrder(row) {
  const o = {}
  for (const f of ORDER_FIELDS) {
    if (f === 'placed_at') o[f] = tillTs(col(row, 'placed_at') ?? col(row, 'created_at'))
    else if (f === 'collected_at') o[f] = tillTs(col(row, 'collected_at'))
    else if (f === 'items') o[f] = sealedLines(col(row, 'items'), 'item')
    else if (f === 'deals') o[f] = sealedLines(col(row, 'deals'), 'deal')
    else if (f === 'fiscal_state') o[f] = fiscalState(col(row, 'status'))
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

module.exports = { NUM, num, isNum, parseRaw, numericText, jsonbText, keyCmp, tillTs, pick, pickAll, sealedLines, fiscalState, sealedOrder, sealedPayment,
  NOTE_KEYS, ITEM_KEYS, DEAL_KEYS, MOD_KEYS, TAXPART_KEYS, ORDER_FIELDS, PAYMENT_FIELDS, ORDER_SOURCE_COLUMNS }
