// scripts/_messages-parity-1a.cjs — messages-parity AREA for Language Phase 1a (docs/language-phase-1a-report.md):
// the customer-facing text that moved into messages/en-GB.json, BEFORE against AFTER.
//
// BEFORE is ed1d4c2 — the commit this phase was built on — in two forms:
//   • the SOURCE of every file the text moved out of (`git show ed1d4c2:<file>`), and
//   • what the customer surfaces RENDERED there (scripts/fixtures/language-phase-1a-before.json.gz, ~600 views).
// AFTER is each message as next-intl renders it now.
//   1. every literal run of every message — each select and plural branch on its own — is text that ed1d4c2's
//      source already carried, so nothing was reworded on the way in. A run that ed1d4c2 BUILT from pieces (a
//      ternary word, a joined string, an `s` added for a plural, `&mdash;` in the HTML) is matched word by word
//      instead and LISTED — those are exactly the sentences this phase made whole; a word that was not there
//      at all fails;
//   2. a message with no values is a string ed1d4c2's surfaces rendered (or, for a path no fixture reaches, its
//      source held) — and the renders themselves are compared byte for byte by scripts/language-phase-1a.cjs.
const fs = require('fs'); const path = require('path'); const zlib = require('zlib'); const { execSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const { parse, TYPE } = require(path.join(REPO, 'node_modules/@formatjs/icu-messageformat-parser'))

const BEFORE_REF = 'ed1d4c2'
const NAMESPACES = ['order', 'orderStatus', 'privateLink', 'charges', 'soldOut', 'preorder', 'phone', 'modifierRules', 'menuBadges',
  'deals', 'eventCard', 'orderLine', 'emailCustomer', 'whatsappCustomer', 'errorsCustomer']
/** Already in messages/ before this phase (Language Phase 0) — not part of this area. */
const PHASE_0 = new Set(['order.tipHeading'])
const SOURCES = [
  'app/trucks/[slug]/order/page.tsx', 'app/order/[id]/manage/page.tsx', 'app/p/[token]/page.tsx', 'lib/private-events/copy.ts',
  'lib/private-events/read.ts', 'lib/order-charge-lines.ts', 'lib/payments/sold-out-copy.ts', 'lib/preorder.ts', 'lib/phone.ts',
  'lib/modifier-rules.ts', 'components/OptionStockBadge.tsx', 'components/SpiceLevel.tsx', 'components/dashboard/DealsModal.tsx',
  'components/TruckListCard.tsx', 'components/dashboard/OrderLineItem.tsx', 'lib/email.ts', 'lib/orders/reject-order.ts',
  'app/api/dashboard/action/route.ts', 'lib/whatsapp-classifier.ts', 'app/api/orders/submit/route.ts', 'app/api/orders/cancel/route.ts',
  'app/api/orders/[id]/route.ts', 'app/api/menu/[truckId]/route.ts', 'app/api/slots/[truckId]/route.ts',
  'app/api/payments/return/route.ts', 'lib/payments/promote-draft.ts',
]

/** Remove every `${…}` (braces counted, strings skipped) — what a template literal reads as around its values. */
function dropInterpolations(src) {
  let out = '', i = 0
  while (i < src.length) {
    if (src[i] === '$' && src[i + 1] === '{') {
      let d = 0, q = null
      for (i += 1; i < src.length; i++) {
        const c = src[i]
        if (q) { if (c === '\\') i++; else if (c === q) q = null; continue }
        if (c === "'" || c === '"' || c === '`') q = c
        else if (c === '{') d++
        else if (c === '}') { d--; if (d === 0) { i++; break } }
      }
    } else out += src[i++]
  }
  return out
}
const squash = s => s.replace(/\s+/g, ' ')
/** A string split across source lines with + is one string. */
const joinConcats = s => s.replace(/(['"`])\s*\+\s*\1/g, '')

/** Every variant of a message as a list of literal runs (an argument, tag boundary or `#` ends a run). */
function variants(ast) {
  let out = [[]]
  const add = text => { for (const v of out) { if (v.length && typeof v[v.length - 1] === 'string') v[v.length - 1] += text; else v.push(text) } }
  const gap = () => { for (const v of out) v.push(null) }
  for (const el of ast) {
    if (el.type === TYPE.literal) add(el.value)
    else if (el.type === TYPE.argument || el.type === TYPE.number || el.type === TYPE.date || el.type === TYPE.time || el.type === TYPE.pound) gap()
    else if (el.type === TYPE.tag) { gap(); const inner = variants(el.children); out = out.flatMap(v => inner.map(w => [...v, ...w, null])) }
    else if (el.type === TYPE.select || el.type === TYPE.plural) {
      const opts = Object.values(el.options).map(o => variants(o.value)).flat()
      out = out.flatMap(v => opts.map(w => [...v, null, ...w, null]))
    }
  }
  return out
}

module.exports = function area({ t, head, msgs }) {
  head('Phase 1a · the customer-facing text that moved into messages/ — BEFORE (ed1d4c2) against AFTER')
  const raw = SOURCES.map(f => { try { return execSync(`git show ${BEFORE_REF}:${JSON.stringify(f).slice(1, -1)}`, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 }) } catch { return '' } }).join('\n')
  t(`every source file read at ${BEFORE_REF}`, raw.length > 100000)
  const src = joinConcats(raw).replace(/&mdash;/g, '—')
  const hay = [squash(raw), squash(src), squash(dropInterpolations(src)), squash(src.replace(/&apos;/g, "'")), squash(dropInterpolations(src).replace(/&apos;/g, "'"))].join('\n')
  const words = new Set(hay.match(/[A-Za-z][A-Za-z'’]*/g))
  const composed = []
  const fixture = path.join(REPO, 'scripts/fixtures/language-phase-1a-before.json.gz')
  const rendered = fs.existsSync(fixture) ? squash(JSON.stringify(JSON.parse(zlib.gunzipSync(fs.readFileSync(fixture))))) : ''
  const htmlish = s => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const leaves = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? leaves(v, `${p}${k}.`) : [[`${p}${k}`, v]]))
  let checked = 0, plainRendered = 0, plainSource = 0
  for (const ns of NAMESPACES) {
    t(`en-GB has the ${ns} namespace`, !!msgs['en-GB'][ns])
    for (const [k, v] of leaves(msgs['en-GB'][ns] || {})) {
      const key = `${ns}.${k}`
      if (PHASE_0.has(key)) continue
      let ast; try { ast = parse(v) } catch { continue }   // invalid ICU is reported by messages-parity §3
      const missing = [], built = []
      for (const runs of variants(ast)) for (const run of runs) {
        if (run == null) continue
        const piece = squash(run).trim()
        if (!/[A-Za-z]{2}/.test(piece) || hay.includes(piece)) continue
        const novel = (piece.match(/[A-Za-z][A-Za-z'’]*/g) || []).filter(w => !words.has(w) && !(w.endsWith('s') && words.has(w.slice(0, -1))))
        if (novel.length) missing.push(`${JSON.stringify(piece)} (new: ${novel.join(', ')})`)
        else built.push(piece)
      }
      checked++
      if (built.length) composed.push(key)
      t(`${key}: every word was in ${BEFORE_REF}'s source`, missing.length === 0, missing.join(' · '))
      const plain = ast.every(el => el.type === TYPE.literal)
      if (plain) {
        const text = squash(v)
        const wasRendered = rendered.includes(JSON.stringify(text).slice(1, -1)) || rendered.includes(JSON.stringify(htmlish(text)).slice(1, -1))
        if (wasRendered) plainRendered++
        else { plainSource++; t(`${key}: a path no fixture reaches — the exact string is in ${BEFORE_REF}'s source`, hay.includes(text) || hay.includes(text.replace(/'/g, '&apos;')), text) }
      }
    }
  }
  console.log(`  ${checked} Phase 1a messages · ${plainRendered} plain ones rendered by ed1d4c2's surfaces · ${plainSource} matched in its source`)
  console.log(`  ${composed.length} were built from pieces in ${BEFORE_REF} and are whole sentences now (their renders are compared byte for byte by language-phase-1a): ${composed.join(', ')}`)
}
