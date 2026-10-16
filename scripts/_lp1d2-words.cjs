// scripts/_lp1d2-words.cjs — the WORDS side of Language Phase 1d Part 2's proof (scripts/language-phase-1d2.cjs). A MODULE.
//   F words   = scripts/fixtures/language-phase-1d2-messages-before.{en-GB,en-US}.json (826471a's pair) over the current
//               keys, with every GB wrong-English fix set back to its AS-MOVED text (Part 2's
//               scripts/fixtures/language-phase-1d2-gb-moved.json and Part 1's) — scripts/_lp2-frozen.cjs's PAIR mode;
//   A words   = messages/*.json as authored.
// gbKeyDiff()      every en-GB key whose text differs between F and A (a Part 2 fix, an 826471a key reworded, a key
//                  deleted): { key: { before, after, kind } } — what scripts/fixtures/language-phase-1d2-gb-named.json
//                  must equal.
// movedProblems()  Part 2's as-moved overlay checked against the catalogue: every key exists, differs from its fix, and —
//                  for a key 826471a had — its moved text IS 826471a's text.
// LEGAL            the legal-wording keys (moved byte-identical, NO en-US override — Dominic's legal decision pending).
const fs = require('fs'); const path = require('path')
const LP2 = require('./_lp2-frozen.cjs')
const REPO = LP2.REPO
const BEFORE_REF = '826471a'
const FROZEN_GB = path.join(REPO, 'scripts/fixtures/language-phase-1d2-messages-before.en-GB.json')
const FROZEN_US = path.join(REPO, 'scripts/fixtures/language-phase-1d2-messages-before.en-US.json')
const MOVED = LP2.MOVED_FILE_1D2

const F_MODE = { mode: 'frozen', file: FROZEN_GB, usFile: FROZEN_US, moved: true }
const catalogues = which => LP2.catalogues(which === 'F' ? F_MODE : { mode: 'source' })
const moved = () => (fs.existsSync(MOVED) ? JSON.parse(fs.readFileSync(MOVED, 'utf8')) : {})

function gbKeyDiff() {
  const f = Object.fromEntries(LP2.leaves(catalogues('F')['en-GB']))
  const a = Object.fromEntries(LP2.leaves(catalogues('A')['en-GB']))
  const at0 = Object.fromEntries(LP2.leaves(LP2.readJson(FROZEN_GB)))
  const mv = moved()
  const out = {}
  for (const k of Object.keys(a).sort()) {
    if (f[k] === a[k]) continue
    out[k] = { before: f[k] ?? null, after: a[k], kind: k in mv ? (k in at0 ? `GB fix of a ${BEFORE_REF} key` : 'GB fix (moved, then fixed)') : `${BEFORE_REF} key reworded WITHOUT a recorded fix` }
  }
  const moves = LP2.keyMoves()
  for (const k of Object.keys(at0).sort()) if (!(k in a)) out[k] = { before: at0[k], after: null, kind: moves[k] ? `${BEFORE_REF} key MOVED to ${moves[k]} (scripts/fixtures/language-phase-1d2-key-moves.json)` : `${BEFORE_REF} key deleted` }
  return out
}

function movedProblems() {
  const a = Object.fromEntries(LP2.leaves(catalogues('A')['en-GB']))
  const at0 = Object.fromEntries(LP2.leaves(LP2.readJson(FROZEN_GB)))
  const out = []
  for (const [k, m] of Object.entries(moved())) {
    if (!(k in a)) out.push(`${k}: in the as-moved list but not in messages/en-GB.json`)
    else if (a[k] === m) out.push(`${k}: its fixed text equals its as-moved text`)
    if (k in at0 && at0[k] !== m) out.push(`${k}: a ${BEFORE_REF} key whose as-moved text is not its ${BEFORE_REF} text (${JSON.stringify(m)} vs ${JSON.stringify(at0[k])})`)
  }
  return out
}

/** Keys new since 826471a (the moved words), [key, text] as authored. */
/** The namespace moves checked: old gone, new present, en-GB (as moved) and en-US identical. → problems[] */
function keyMoveProblems() {
  const at0 = Object.fromEntries(LP2.leaves(LP2.readJson(FROZEN_GB))), us0 = Object.fromEntries(LP2.leaves(LP2.readJson(FROZEN_US)))
  const A = catalogues('A'), a = Object.fromEntries(LP2.leaves(A['en-GB'])), au = Object.fromEntries(LP2.leaves(A['en-US']))
  const mv = moved(), out = []
  for (const [from, to] of Object.entries(LP2.keyMoves())) {
    if (from in a) out.push(`${from}: still in en-GB`)
    if (!(to in a)) { out.push(`${to}: not in en-GB`); continue }
    if ((mv[to] ?? a[to]) !== at0[from]) out.push(`${to}: as moved ${JSON.stringify(mv[to] ?? a[to])} ≠ ${from} at ${BEFORE_REF} ${JSON.stringify(at0[from])}`)
    if ((from in us0) && au[to] !== us0[from]) out.push(`${to}: en-US ${JSON.stringify(au[to])} ≠ ${from}'s ${JSON.stringify(us0[from])}`)
  }
  return out
}

function newKeys() {
  const at0 = new Set(LP2.leaves(LP2.readJson(FROZEN_GB)).map(([k]) => k))
  return LP2.leaves(catalogues('A')['en-GB']).filter(([k]) => !at0.has(k))
}

/** 🔴 LEGAL WORDING — moved byte-identical with NO en-US override (Dominic's legal decision pending). A key is legal
 *  when its en-GB text quotes the law ("UK law", "law requires", "legally", "retention", "HMRC", "GDPR", "data
 *  protection") or it is named below by the agent that moved it. */
const LEGAL_NAMED = [
  // WADA / the lead: DeleteAccountSection's retention and data-rights sentences ("…kept for six years, as UK law requires")
  'deleteAccount.whatPersonal', 'deleteAccount.whatCustomers', 'deleteAccount.whatAccounting', 'deleteAccount.copyFirst',
]
const LEGAL_RE = /\bUK law\b|\blaw requires\b|\bby law\b|\blegally\b|\blegal(ly)? required\b|\bretention\b|\bretain(ed)?\b.*\b(years?|records?)\b|\bHMRC\b|\bGDPR\b|data protection|tax records/i
function legalKeys() {
  const a = Object.fromEntries(LP2.leaves(catalogues('A')['en-GB']))
  const fresh = new Set(newKeys().map(([k]) => k))
  return Object.keys(a).filter(k => LEGAL_NAMED.includes(k) || (fresh.has(k) && LEGAL_RE.test(a[k]))).sort()
}

module.exports = { keyMoveProblems, REPO, BEFORE_REF, FROZEN_GB, FROZEN_US, F_MODE, MOVED, catalogues, moved, gbKeyDiff, movedProblems, newKeys, legalKeys, LEGAL_NAMED, LEGAL_RE, LP2 }
