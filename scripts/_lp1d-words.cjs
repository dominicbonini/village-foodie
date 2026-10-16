// scripts/_lp1d-words.cjs — the WORDS side of Language Phase 1d's proof (scripts/language-phase-1d.cjs). A MODULE.
//   F words   = scripts/fixtures/language-phase-1d-messages-before.{en-GB,en-US}.json (756ca09's pair) over the current
//               keys, with every GB wrong-English fix set back to its AS-MOVED text
//               (scripts/fixtures/language-phase-1d-gb-moved.json) — scripts/_lp2-frozen.cjs's frozen PAIR mode;
//   A words   = messages/*.json as authored.
// gbKeyDiff()      every en-GB key whose text differs between F and A (a 1d fix, a 756ca09 key reworded, a key deleted):
//                  { key: { before, after, kind } } — what scripts/fixtures/language-phase-1d-gb-named.json must equal.
// movedProblems()  the as-moved overlay checked against the catalogue: every key exists, differs from its fix, and —
//                  for a key 756ca09 had — its moved text IS 756ca09's text.
const fs = require('fs'); const path = require('path')
const LP2 = require('./_lp2-frozen.cjs')
const REPO = LP2.REPO
const BEFORE_REF = '756ca09'
const FROZEN_GB = path.join(REPO, 'scripts/fixtures/language-phase-1d-messages-before.en-GB.json')
const FROZEN_US = path.join(REPO, 'scripts/fixtures/language-phase-1d-messages-before.en-US.json')
const MOVED = LP2.MOVED_FILE

const F_MODE = { mode: 'frozen', file: FROZEN_GB, usFile: FROZEN_US, moved: true }
// ⚠️ RE-PINNED (Language Phase 1d Part 2): Part 1's "A words" are the words Part 1 ENDED with — 826471a's pair
// (scripts/fixtures/language-phase-1d2-messages-before.{en-GB,en-US}.json) over the current keys, with BOTH as-moved
// overlays — not the authored files, which now also carry Part 2's words (proven by scripts/language-phase-1d2.cjs).
// HG_LP1D_A=source reads the authored files instead (only for a deliberate check).
const PART1_END_GB = path.join(REPO, 'scripts/fixtures/language-phase-1d2-messages-before.en-GB.json')
const PART1_END_US = path.join(REPO, 'scripts/fixtures/language-phase-1d2-messages-before.en-US.json')
const A_MODE = process.env.HG_LP1D_A === 'source' || !fs.existsSync(PART1_END_GB) ? { mode: 'source' } : { mode: 'frozen', file: PART1_END_GB, usFile: PART1_END_US, moved: true }
const catalogues = which => LP2.catalogues(which === 'F' ? F_MODE : A_MODE)
/** The en-GB keys Part 1 ended with (826471a) — a key Part 2 deleted is not a Part 1 deletion. */
const aKeys = () => new Set(LP2.leaves(A_MODE.mode === 'frozen' ? LP2.readJson(PART1_END_GB) : catalogues('A')['en-GB']).map(([k]) => k))
const moved = () => (fs.existsSync(MOVED) ? JSON.parse(fs.readFileSync(MOVED, 'utf8')) : {})

function gbKeyDiff() {
  const f = Object.fromEntries(LP2.leaves(catalogues('F')['en-GB']))
  const a = Object.fromEntries(LP2.leaves(catalogues('A')['en-GB']))
  const at756 = Object.fromEntries(LP2.leaves(LP2.readJson(FROZEN_GB)))
  const mv = moved()
  const out = {}
  const inPart1 = aKeys()
  for (const k of Object.keys(a).sort()) {
    if (f[k] === a[k] || !inPart1.has(k)) continue
    out[k] = { before: f[k] ?? null, after: a[k], kind: k in mv ? (k in at756 ? `GB fix of a ${BEFORE_REF} key` : 'GB fix (moved, then fixed)') : `${BEFORE_REF} key reworded WITHOUT a recorded fix` }
  }
  const ak = aKeys()
  for (const k of Object.keys(at756).sort()) if (!ak.has(k)) out[k] = { before: at756[k], after: null, kind: `${BEFORE_REF} key deleted` }
  return out
}

function movedProblems() {
  const a = Object.fromEntries(LP2.leaves(catalogues('A')['en-GB']))
  const at756 = Object.fromEntries(LP2.leaves(LP2.readJson(FROZEN_GB)))
  const out = []
  for (const [k, m] of Object.entries(moved())) {
    if (!(k in a)) out.push(`${k}: in the as-moved list but not in messages/en-GB.json`)
    else if (a[k] === m) out.push(`${k}: its fixed text equals its as-moved text`)
    if (k in at756 && at756[k] !== m) out.push(`${k}: a ${BEFORE_REF} key whose as-moved text is not its ${BEFORE_REF} text (${JSON.stringify(m)} vs ${JSON.stringify(at756[k])})`)
  }
  return out
}

/** Keys new since 756ca09 (the moved words), with the namespace they live in. */
function newKeys() {
  const at756 = new Set(LP2.leaves(LP2.readJson(FROZEN_GB)).map(([k]) => k))
  const inPart1 = aKeys()   // ⚠️ RE-PINNED (Language Phase 1d Part 2): Part 1's own new keys, not Part 2's
  return LP2.leaves(catalogues('A')['en-GB']).filter(([k]) => !at756.has(k) && inPart1.has(k))
}

module.exports = { REPO, BEFORE_REF, FROZEN_GB, FROZEN_US, F_MODE, A_MODE, aKeys, catalogues, moved, gbKeyDiff, movedProblems, newKeys, LP2 }
