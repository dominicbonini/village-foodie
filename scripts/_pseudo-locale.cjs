// scripts/_pseudo-locale.cjs — 🔴 A MADE-UP LANGUAGE FOR PROVING THE LANGUAGE MACHINERY (languages-1, 22 October 2026,
// docs/languages-1-report.md §6). A MODULE: scripts/languages-1.cjs builds the pseudo-locale "eo-XA" from en-GB with it and
// runs it end to end in fixtures. NOTHING HERE SHIPS: the pseudo-locale is never in lib/i18n/locales.ts or messages/.
//
// The pseudo-language is en-GB with every LETTER of every literal accented (a → å, e → é …) and each message ~30% LONGER
// (groups of "·" inside ⟦ ⟧ brackets), so a screenshot shows at a glance: any plain-ASCII word is English that escaped the
// catalogue, and a clipped "⟧" is a string that overflowed its box. ICU structure is kept exactly — placeholders, plural /
// select options, rich-text tags — only literal text changes. Brand names, numbers, currency signs, URLs and e-mail addresses
// are left alone, as a translator must leave them.
// Its glossary is the en glossary's concepts pseudo-ised, and its back-translation is the exact inverse (minus the padding), so
// scripts/translation-check.cjs's every check runs on it and must pass — with planted faults as the negative controls.
'use strict'
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const path = require('path')
const REPO = path.resolve(__dirname, '..')
const { parse, TYPE } = require(path.join(REPO, 'node_modules/@formatjs/icu-messageformat-parser'))

const LOWER = 'åƀçðéƒĝĥîĵķļɱñöþǫŕšţûṽŵẋýž'
const UPPER = 'ÅƁÇÐÉƑĜĤÎĴĶĻṀÑÖÞǪŔŠŢÛṼŴẊÝŽ'
const TO = new Map(); const FROM = new Map()
for (let i = 0; i < 26; i++) {
  TO.set(String.fromCharCode(97 + i), [...LOWER][i]); TO.set(String.fromCharCode(65 + i), [...UPPER][i])
  FROM.set([...LOWER][i], String.fromCharCode(97 + i)); FROM.set([...UPPER][i], String.fromCharCode(65 + i))
}
/** Words a translator leaves exactly as they are (glossary invariants, product and platform names). */
const KEEP = ['HatchGrab', 'Village Foodie', 'WhatsApp', 'Instagram', 'Facebook', 'Messenger', 'Stripe', 'Google Play', 'Google', 'App Store', 'Apple', 'iPhone', 'iPad', 'Android', 'iOS', 'Tap to Pay', 'Pro', 'PDF', 'QR', 'CSV', 'SMS', 'URL', 'DNS', 'CNAME', 'Gemini', 'Squarespace', 'GoDaddy', 'Vercel', 'Supabase', 'Meta', 'TikTok', 'X']
const KEEP_RE = new RegExp(`(https?://\\S+|www\\.\\S+|\\S+@\\S+\\.\\S+|\\b(?:${KEEP.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b)`, 'g')
const accent = s => s.split(KEEP_RE).map((part, i) => (i % 2 ? part : [...part].map(ch => TO.get(ch) ?? ch).join(''))).join('')
const unaccent = s => [...s].map(ch => FROM.get(ch) ?? ch).join('')

/** ICU AST → message text (the inverse of parse, for the node types en-GB uses). */
function print(nodes, inPlural = false) {
  return nodes.map(n => {
    switch (n.type) {
      // ICU quoting: an apostrophe is doubled; { } < always need quoting, # only inside a plural (where it means the number).
      // (an apostrophe is literal before a letter, so only one that a special character — or the next node — follows is doubled).
      case TYPE.literal: return n.value.replace(/'(?=['{}<#]|$)/g, "''").replace(inPlural ? /([{}#<])/g : /([{}<])/g, "'$1'")
      case TYPE.argument: return `{${n.value}}`
      case TYPE.number: return `{${n.value}, number${n.style ? `, ${typeof n.style === 'string' ? n.style : '::' + n.style.tokens.map(t => t.stem + t.options.map(o => '/' + o).join('')).join(' ')}` : ''}}`
      case TYPE.date: return `{${n.value}, date${n.style ? `, ${n.style}` : ''}}`
      case TYPE.time: return `{${n.value}, time${n.style ? `, ${n.style}` : ''}}`
      case TYPE.pound: return '#'
      case TYPE.select: return `{${n.value}, select, ${Object.entries(n.options).map(([k, o]) => `${k} {${print(o.value, inPlural)}}`).join(' ')}}`
      case TYPE.plural: return `{${n.value}, ${n.pluralType === 'ordinal' ? 'selectordinal' : 'plural'}, ${n.offset ? `offset:${n.offset} ` : ''}${Object.entries(n.options).map(([k, o]) => `${k} {${print(o.value, true)}}`).join(' ')}}`
      case TYPE.tag: return `<${n.value}>${print(n.children, inPlural)}</${n.value}>`
      default: throw new Error(`pseudo-locale: unsupported ICU node ${n.type}`)
    }
  }).join('')
}
function mapLiterals(nodes, f) {
  return nodes.map(n => {
    if (n.type === TYPE.literal) return { ...n, value: f(n.value) }
    if (n.type === TYPE.select || n.type === TYPE.plural) return { ...n, options: Object.fromEntries(Object.entries(n.options).map(([k, o]) => [k, { ...o, value: mapLiterals(o.value, f) }])) }
    if (n.type === TYPE.tag) return { ...n, children: mapLiterals(n.children, f) }
    return n
  })
}
const literalLength = nodes => nodes.reduce((a, n) => a + (n.type === TYPE.literal ? n.value.length : n.type === TYPE.tag ? literalLength(n.children) : (n.type === TYPE.select || n.type === TYPE.plural) ? Math.max(...Object.values(n.options).map(o => literalLength(o.value))) : 4), 0)

/** One en-GB message → its pseudo form: letters accented, ~30% longer, bracketed. An empty or letter-free message (a
 *  symbol, a lone "—") is left as it is. */
function pseudoMessage(msg) {
  if (typeof msg !== 'string' || !/[A-Za-z]/.test(msg)) return msg
  const ast = parse(msg, { ignoreTag: false, requiresOtherClause: false })
  const body = print(mapLiterals(ast, accent))
  // The extra length comes in groups of at most six dots with a space between, so it can wrap the way a real language's
  // longer words do — one unbreakable run of 90 dots would overflow any column, which no real sentence does.
  const pad = ('·'.repeat(Math.max(1, Math.ceil(literalLength(ast) * 0.3) - 2)).match(/·{1,6}/g) || []).join(' ')
  return `⟦${body} ${pad}⟧`
}
/** The whole en-GB tree → the pseudo tree. `planNames` (empty in en-GB) is filled from the plans' English names. */
function pseudoTree(tree) {
  return Object.fromEntries(Object.entries(tree).map(([k, v]) => [k, typeof v === 'string' ? pseudoMessage(v) : pseudoTree(v)]))
}
/** The back-translation a translator would give: the exact inverse (padding and brackets removed). */
function backTranslate(msg) {
  if (typeof msg !== 'string') return msg
  return unaccent(msg.replace(/^⟦/, '').replace(/ ·[· ]*⟧$/, ''))
}
const EN_WORDS = { 'Pickup time': ['collection time', 'pickup time', 'pick-up time'], 'Collection/pickup time': ['collection time', 'pickup time', 'pick-up time'],
  'Pre-order': ['pre-order', 'preorder'], 'Time slot': ['time slot', 'timeslot'], 'KDS': ['kitchen display', 'kitchen screen'],
  'WhatsApp auto-reply': ['auto-repl', 'autorepl'], 'Commission-free': ['commission'], 'Allergens': ['allergen'], 'Food truck': ['food truck'],
  'Street food': ['street food'], 'Kitchen capacity': ['kitchen capacity'], 'Private event': ['private event'], 'Card reader': ['card reader'] }
/** The pseudo-language's glossary: the French table's concepts (any language's would do — only the `en` patterns and the
 *  shape matter), with the Use terms replaced by the pseudo form of the English concept name. */
function pseudoGlossary(base) {
  return {
    ...base,
    language: 'xx',
    // The pseudo Use terms are en-GB's OWN words for each concept, accented — what a faithful pseudo-translation contains.
    concepts: base.concepts.map(c => ({ ...c, use: (EN_WORDS[c.concept] ?? [c.concept.toLowerCase()]).map(accent) })),
    recommendations: base.recommendations && { payAtHatchFeature: accent('Pay at Hatch'), payAtHatchShort: accent('Pay at Hatch'), payAsYouGo: accent('Pay as you go'), unlimited: accent('Unlimited'), freeTrial: accent('Free trial') },
  }
}

module.exports = { pseudoMessage, pseudoTree, backTranslate, pseudoGlossary, accent, unaccent, KEEP }
