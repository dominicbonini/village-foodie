// scripts/_lp1e-words.cjs — the WORDS side of Language Phase 1e's proof (scripts/language-phase-1e.cjs). A MODULE.
//   F words   = scripts/fixtures/language-phase-1e-messages-before.{en-GB,en-US}.json (eb7ed44's pair) over the current
//               keys, with every GB wrong-English fix set back to its AS-MOVED text (Phase 1e's
//               scripts/fixtures/language-phase-1e-gb-moved.json and the older overlays) — scripts/_lp2-frozen.cjs's PAIR mode;
//   A words   = messages/*.json as authored.
// gbKeyDiff()      every en-GB key whose text differs between F and A (a 1e fix, an eb7ed44 key reworded, a key deleted
//                  or moved): { key: { before, after, kind } } — what scripts/fixtures/language-phase-1e-gb-named.json equals.
// movedProblems()  the 1e as-moved overlay checked: every key exists, differs from its fix, and — for a key eb7ed44 had —
//                  its moved text IS eb7ed44's text.
// keyMoveProblems() 1e's key moves (scripts/fixtures/language-phase-1e-key-moves.json): old gone, new present, words kept.
// usDiff()         every en-US override added, changed or removed since eb7ed44.
const fs = require('fs'); const path = require('path')
const LP2 = require('./_lp2-frozen.cjs')
const REPO = LP2.REPO
const BEFORE_REF = 'eb7ed44'
const FROZEN_GB = path.join(REPO, 'scripts/fixtures/language-phase-1e-messages-before.en-GB.json')
const FROZEN_US = path.join(REPO, 'scripts/fixtures/language-phase-1e-messages-before.en-US.json')
const MOVED = LP2.MOVED_FILE_1E
const F_MODE = { mode: 'frozen', file: FROZEN_GB, usFile: FROZEN_US, moved: true }
const catalogues = which => LP2.catalogues(which === 'F' ? F_MODE : { mode: 'source' })
const moved = () => (fs.existsSync(MOVED) ? JSON.parse(fs.readFileSync(MOVED, 'utf8')) : {})
const flat = o => Object.fromEntries(LP2.leaves(o))
const moves1e = () => (fs.existsSync(LP2.KEY_MOVES_FILE_1E) ? LP2.readJson(LP2.KEY_MOVES_FILE_1E).moves || {} : {})

function gbKeyDiff() {
  const f = flat(catalogues('F')['en-GB']), a = flat(catalogues('A')['en-GB']), at0 = flat(LP2.readJson(FROZEN_GB)), mv = moved()
  const out = {}
  for (const k of Object.keys(a).sort()) {
    if (f[k] === a[k]) continue
    out[k] = { before: f[k] ?? null, after: a[k], kind: k in mv ? (k in at0 ? `GB fix of an ${BEFORE_REF} key` : 'GB fix (moved, then fixed)') : `${BEFORE_REF} key reworded WITHOUT a recorded fix` }
  }
  const moves = moves1e()
  for (const k of Object.keys(at0).sort()) if (!(k in a)) out[k] = { before: at0[k], after: null, kind: moves[k] ? `${BEFORE_REF} key MOVED to ${moves[k]} (scripts/fixtures/language-phase-1e-key-moves.json)` : `${BEFORE_REF} key deleted` }
  // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): this harness's A is the AUTHORED files, which now carry
  // Stage A's word changes too. A key Stage A reworded or removed (scripts/fixtures/plans-stage-a-messages.json) is
  // marked as STAGE A's — not Phase 1e's — when, and only when, its before / after are exactly what that file records.
  const sa = LP2.stageA()['en-GB']
  for (const [k, d] of Object.entries(out)) {
    if (k in (sa.reworded || {}) && d.before === sa.reworded[k].before && d.after === sa.reworded[k].after) d.kind = STAGE_A_REWORDED
    else if (k in (sa.removed || {}) && d.after === null && d.before === sa.removed[k]) d.kind = STAGE_A_REMOVED
    // ⚠️ RE-PINNED (ireland-1, 20 October 2026): ireland-1's two tradeArea rewordings, marked only on an EXACT match.
    else if (k in IE1_REWORDED && d.before === IE1_REWORDED[k].before && d.after === IE1_REWORDED[k].after) d.kind = IE1_KIND
  }
  return out
}
/* ⚠️ RE-PINNED (ireland-1, 20 October 2026): a third country can be switched off, and en-GB's two trade-area refusals
 * named it ("…sign up in {country} yet" / "…we offer in {country}") — ireland-1 reworded them to not name it ({country}
 * is still passed, now unused). Not a Phase 1e fix and not in the 1e named list: each is exempt ONLY while its eb7ed44
 * (as moved) text → today's text is EXACTLY this, and the checks that use isIE1 also require both to show. */
const IE1_KIND = 'ireland-1: tradeArea reworded to not name the country (scripts/_lp1e-words.cjs IE1_REWORDED)'
const IE1_REWORDED = {
  'tradeArea.country_off': { before: 'Trucks can’t sign up in {country} yet. Choose another country.', after: 'Trucks in that country can’t sign up yet. Choose another country.' },
  'tradeArea.zone_unknown': { before: 'That time zone isn’t one we offer in {country}. Choose one from the list.', after: 'That time zone isn’t one we offer for that country. Choose one from the list.' },
}
const isIE1 = d => !!d && d.kind === IE1_KIND
const STAGE_A_REWORDED = 'plans-data-model Stage A: reworded (scripts/fixtures/plans-stage-a-messages.json)'
const STAGE_A_REMOVED = 'plans-data-model Stage A: removed (scripts/fixtures/plans-stage-a-messages.json)'
const isStageA = d => d.kind === STAGE_A_REWORDED || d.kind === STAGE_A_REMOVED
function movedProblems() {
  const a = flat(catalogues('A')['en-GB']), at0 = flat(LP2.readJson(FROZEN_GB)), out = []
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): a key a plan stage REMOVED (LP2.stageA().removed) may stay in
  // the as-moved list — the list is history — but only while it is absent from the catalogue (scripts/_lp1d-words.cjs's rule).
  const removed = LP2.stageA()['en-GB'].removed || {}
  for (const [k, m] of Object.entries(moved())) {
    if (k in removed && !(k in a)) continue
    if (!(k in a)) out.push(`${k}: in the as-moved list but not in messages/en-GB.json`)
    else if (a[k] === m) out.push(`${k}: its fixed text equals its as-moved text`)
    if (k in at0 && at0[k] !== m) out.push(`${k}: an ${BEFORE_REF} key whose as-moved text is not its ${BEFORE_REF} text (${JSON.stringify(m)} vs ${JSON.stringify(at0[k])})`)
  }
  return out
}
function keyMoveProblems() {
  const at0 = flat(LP2.readJson(FROZEN_GB)), us0 = flat(LP2.readJson(FROZEN_US))
  const A = catalogues('A'), a = flat(A['en-GB']), au = flat(A['en-US']), mv = moved(), out = []
  for (const [from, to] of Object.entries(moves1e())) {
    if (from in a) out.push(`${from}: still in en-GB`)
    if (!(to in a)) { out.push(`${to}: not in en-GB`); continue }
    if ((mv[to] ?? a[to]) !== at0[from]) out.push(`${to}: as moved ${JSON.stringify(mv[to] ?? a[to])} ≠ ${from} at ${BEFORE_REF} ${JSON.stringify(at0[from])}`)
    if ((from in us0) && au[to] !== us0[from] && !(to in au)) out.push(`${to}: en-US lost ${from}'s override ${JSON.stringify(us0[from])}`)
  }
  return out
}
function newKeys() {
  const at0 = new Set(Object.keys(flat(LP2.readJson(FROZEN_GB))))
  return LP2.leaves(catalogues('A')['en-GB']).filter(([k]) => !at0.has(k))
}
function usDiff() {
  const b = flat(LP2.readJson(FROZEN_US)), a = flat(catalogues('A')['en-US']), gb = flat(catalogues('A')['en-GB'])
  const out = { added: {}, changed: {}, removed: {} }
  for (const k of Object.keys(a).sort()) {
    if (!(k in b)) out.added[k] = { gb: gb[k] ?? null, us: a[k] }
    else if (b[k] !== a[k]) out.changed[k] = { before: b[k], us: a[k], gb: gb[k] ?? null }
  }
  for (const k of Object.keys(b).sort()) if (!(k in a)) out.removed[k] = { before: b[k] }
  return out
}
module.exports = { isIE1, IE1_KIND, IE1_REWORDED, isStageA, STAGE_A_REWORDED, STAGE_A_REMOVED, REPO, BEFORE_REF, FROZEN_GB, FROZEN_US, F_MODE, MOVED, catalogues, moved, moves1e, gbKeyDiff, movedProblems, keyMoveProblems, newKeys, usDiff, flat, LP2 }
