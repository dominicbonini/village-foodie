// scripts/_lp2-text.cjs — what a person SEES in a captured view, a word-level diff, and the ESC/POS reader
// (Language Phase 2, run by scripts/language-phase-2.cjs). A MODULE, not a harness.
//
//   visible(value)        → [{ path, text }] — HTML text nodes plus value / placeholder / aria-label / title / alt
//                           (entities decoded), email subject / text / HTML, ticket bytes decoded (ESC/POS commands
//                           stripped), JSON bodies' human strings. NOT machine fields: status, order_type, code,
//                           kind, state, ids, tokens, keys, URLs' hrefs, timestamps, params, recorded internal calls.
//   flat(value)           → [{ path, text }] — EVERY string leaf, decoded the same way (for diffing two renders of the
//                           same code, where any difference at all is the words').
//   wordDiff(a, b)        → hunks [{ del: [words], ins: [words], before: [ctx words], after: [ctx words] }]
//   escpos(hexOrBytes)    → { lines: [{ text, mult }], bad: [problems] } — every byte accounted for.
const zlib = require('zlib')

const NAMED = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", pound: '£', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”',
  mdash: '—', ndash: '–', hellip: '…', middot: '·', bull: '•', times: '×', copy: '©', reg: '®', trade: '™', euro: '€', larr: '←', rarr: '→', eacute: 'é' }
/** One pass of entity decoding (so "&amp;apos;" stays "&apos;", as a reader sees it). */
const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m }
  return NAMED[e.toLowerCase()] ?? m
})
const isHtml = s => /<\/?[a-zA-Z][^>]*>/.test(s)
/** The text a person reads in an HTML string, and its readable attributes. */
function htmlText(html) {
  const attrs = []
  for (const m of html.matchAll(/<([a-zA-Z][\w-]*)[^>]*>/g)) {
    const tag = m[1].toLowerCase()
    // A `value` is seen only in a text box (an <option>'s or a button's value is a code the browser never shows).
    const typeAttr = (/\stype="([^"]*)"/.exec(m[0]) || [])[1] || 'text'
    const valueSeen = tag === 'input' && !/^(hidden|radio|checkbox|submit|button|image|file|range|color)$/i.test(typeAttr)
    for (const a of m[0].matchAll(/\s(value|placeholder|aria-label|title|alt)="([^"]*)"/g)) {
      if (a[1] === 'value' && !valueSeen) continue
      if (a[2].trim()) attrs.push({ attr: a[1], text: decode(a[2]) })
    }
  }
  const text = decode(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
  return { text, attrs }
}

// ── ESC/POS ────────────────────────────────────────────────────────────────────────────────────────────────
const isTicketHex = s => typeof s === 'string' && /^1b40[0-9a-f]*$/.test(s) && s.length % 2 === 0
/** Reads the bytes lib/printing/ticket.ts and testTicket.ts emit. Each command is consumed with its argument; a
 *  byte that is neither printable ASCII, LF nor part of a known command is reported in `bad`. */
function escpos(input) {
  const b = typeof input === 'string' ? Buffer.from(input, 'hex') : Buffer.from(input)
  const lines = []; const bad = []
  let cur = '', mult = 1, lineMult = 1
  const ARG1 = { 0x1b: new Set([0x74, 0x64, 0x61, 0x45, 0x2d, 0x21, 0x4a, 0x47, 0x4d, 0x56]), 0x1d: new Set([0x21, 0x42, 0x56]) }
  for (let i = 0; i < b.length; i++) {
    const c = b[i]
    if (c === 0x1b || c === 0x1d) {
      const op = b[i + 1]
      if (c === 0x1b && op === 0x40) { i += 1; mult = 1; continue }          // ESC @
      if (ARG1[c] && ARG1[c].has(op)) {
        const n = b[i + 2]
        if (c === 0x1d && op === 0x21) mult = ((n >> 4) & 7) + 1           // GS ! n — character width × ((n>>4)+1)
        if (c === 0x1b && op === 0x21) mult = n & 0x20 ? 2 : 1              // ESC ! n — bit 5 double width
        if (c === 0x1b && op === 0x64 && cur === '') { /* feed */ }
        i += 2; continue
      }
      bad.push(`unknown command 0x${c.toString(16)} 0x${(op ?? 0).toString(16)} at byte ${i}`); i += 1; continue
    }
    if (c === 0x0a) { lines.push({ text: cur, mult: lineMult }); cur = ''; continue }
    if (c >= 0x20 && c <= 0x7e) { if (cur === '') lineMult = mult; else if (mult !== lineMult) lineMult = Math.max(lineMult, mult); cur += String.fromCharCode(c); continue }
    bad.push(`byte 0x${c.toString(16)} (${c >= 0x80 ? 'not plain ASCII' : 'a control byte'}) at ${i}${c === 0xa3 ? ' — "£"' : ''}`)
    cur += c === 0xa3 ? '£' : '?'
  }
  if (cur) lines.push({ text: cur, mult: lineMult })
  return { lines, bad }
}

// ── what a person sees ─────────────────────────────────────────────────────────────────────────────────────
/** Fields that carry machine values, never words a person reads. */
const MACHINE = new Set(['status', 'order_type', 'code', 'kind', 'state', 'id', 'key', 'keys', 'slug', 'token', 'type', 'method', 'channel',
  'currency', 'country', 'locale', 'timezone', 'timeZone', 'href', 'url', 'location', 'params', 'calls', 'auth', 'classification', 'outcome',
  'cacheControl', 'retryAfter', 'bytes_hex', 'payment_status', 'source', 'mode', 'plan', 'role', 'lines', 'qr', 'logo', 'logo_url', 'src',
  'external_ref', 'emoji', 'icon', 'color', 'colour', 'unit', 'dateOrder', 'timeFormat', 'weekStart', 'tax_label_code'])
const machineKey = k => MACHINE.has(k) || /(_id|Id|_ids|Ids|_at|At|_token|Token|_key|Key|_url|Url|_code|Code|_type|_kind|_status|_mode|_date|Date|_minor|Minor|_bps|_pct)$/.test(k)
const codeLike = s => /^[a-z0-9_.:\-/]+$/.test(s) || /^[A-Z0-9_]+$/.test(s) && s.length <= 3 || /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(s)

function walk(value, path, out, human) {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return
  if (typeof value === 'string') {
    const s = value
    if (isTicketHex(s)) { const r = escpos(s); out.push({ path, text: r.lines.map(l => l.text).join('\n'), ticket: r }); return }
    if ((s[0] === '{' || s[0] === '[') && /[}\]]\s*$/.test(s)) { try { return walk(JSON.parse(s), path, out, human) } catch { /* not JSON */ } }
    if (isHtml(s)) { const { text, attrs } = htmlText(s); if (text) out.push({ path, text }); for (const a of attrs) out.push({ path: `${path}@${a.attr}`, text: a.text }); return }
    if (human && codeLike(s.trim())) return
    if (s.trim()) out.push({ path, text: decode(s) })
    return
  }
  if (Array.isArray(value)) { value.forEach((v, i) => walk(v, `${path}[${i}]`, out, human)); return }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (human && machineKey(k)) continue
      // A ticket's layout lines repeat its bytes; the bytes are what prints.
      if (human && k === 'lines' && 'bytes' in value) continue
      walk(v, path ? `${path}.${k}` : k, out, human)
    }
  }
}
const visible = v => { const out = []; walk(v, '', out, true); return out }
const flat = v => { const out = []; walk(v, '', out, false); return out }

// ── a word-level diff (Myers, on whitespace-separated words) ───────────────────────────────────────────────
function myers(a, b) {
  const n = a.length, m = b.length, max = n + m, v = new Map([[1, 0]]), trace = []
  for (let d = 0; d <= max; d++) {
    trace.push(new Map(v))
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1)) ? v.get(k + 1) : v.get(k - 1) + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) { x++; y++ }
      v.set(k, x)
      if (x >= n && y >= m) {
        // backtrack
        const ops = []
        let cx = n, cy = m
        for (let dd = d; dd > 0; dd--) {
          const pv = trace[dd]; const kk = cx - cy
          const prevK = kk === -dd || (kk !== dd && (pv.get(kk - 1) ?? -1) < (pv.get(kk + 1) ?? -1)) ? kk + 1 : kk - 1
          const px = pv.get(prevK), py = px - prevK
          while (cx > px && cy > py) { ops.push(['=', a[cx - 1]]); cx--; cy-- }
          if (cx === px) ops.push(['+', b[cy - 1]]); else ops.push(['-', a[cx - 1]])
          cx = px; cy = py
        }
        while (cx > 0 && cy > 0) { ops.push(['=', a[cx - 1]]); cx--; cy-- }
        return ops.reverse()
      }
    }
    if (d > 4000) return null
  }
  return null
}
const words = s => s.split(/\s+/).filter(Boolean)
/** Hunks of a word diff; each carries up to 3 unchanged words of context either side. */
function wordDiff(aText, bText) {
  let a = words(aText), b = words(bText)
  let pre = 0; while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++
  let suf = 0; while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++
  const A = a.slice(pre, a.length - suf), B = b.slice(pre, b.length - suf)
  const ops = (A.length || B.length) ? (myers(A, B) || [...A.map(w => ['-', w]), ...B.map(w => ['+', w])]) : []
  const all = [...a.slice(0, pre).map(w => ['=', w]), ...ops, ...a.slice(a.length - suf).map(w => ['=', w])]
  const hunks = []
  for (let i = 0; i < all.length;) {
    if (all[i][0] === '=') { i++; continue }
    const h = { del: [], ins: [], before: [], after: [] }
    let j = i
    while (j < all.length && all[j][0] !== '=') { (all[j][0] === '-' ? h.del : h.ins).push(all[j][1]); j++ }
    for (let k = i - 1; k >= 0 && h.before.length < 3 && all[k][0] === '='; k--) h.before.unshift(all[k][1])
    for (let k = j; k < all.length && h.after.length < 3 && all[k][0] === '='; k++) h.after.push(all[k][1])
    hunks.push(h); i = j
  }
  return hunks
}

const gunzipJson = buf => JSON.parse(zlib.gunzipSync(buf))

module.exports = { decode, htmlText, isHtml, escpos, isTicketHex, visible, flat, wordDiff, words, gunzipJson, machineKey }
