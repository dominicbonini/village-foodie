// scripts/_lp2-frozen.cjs — THE FROZEN CATALOGUE SWITCH (Language Phase 2). A MODULE, not a harness: listed under
// shared_modules in scripts/harnesses.json. Used by scripts/_render-kit.cjs (bundles), scripts/messages-parity.cjs,
// and the harness modules that read messages/en-GB.json with node directly.
//
// ── WHAT IT IS FOR ────────────────────────────────────────────────────────────────────────────────────────
// Language Phase 2 changes CODE (dates, pre-order labels, provisioning) and WORDS (messages/*.json) at the same time.
// To tell the two apart a render can be made with "the AFTER code and the BEFORE words":
//
//   HG_MESSAGES_FROZEN=<path to a frozen en-GB.json>   (scripts/fixtures/language-phase-2-messages-before.json is
//                                                       `git show 460ba55:messages/en-GB.json`; en-US was {} then)
//
// With it set, every bundle's message imports resolve to GENERATED files:
//   @/messages/ns/en-GB/<ns>.json  → the CURRENT en-GB namespace with every key the frozen file has set back to its
//                                    frozen value (new keys are kept, so code that reads a new key still works);
//   @/messages/ns/en-US/<ns>.json  → {}            (en-US was empty at the frozen commit);
//   @/messages/en-GB.json          → the same overlay over the whole file (lib/i18n/messages.ts);
//   @/messages/en-US.json          → {}.
//
//   HG_MESSAGES_SOURCE=1   (no overlay) — the same resolution from the AUTHORED files as they stand: what
//                          scripts/split-messages.cjs would generate. language-phase-2 uses it for its "A" runs so
//                          the proof never depends on whether someone ran the split after editing messages/*.json
//                          (scripts/messages-split.cjs is the check that they did).
//
// ── LANGUAGE PHASE 1d EXTENSION (scripts/language-phase-1d.cjs) ──────────────────────────────────────────
//   A FROZEN PAIR: when HG_MESSAGES_FROZEN names a file ending `.en-GB.json` and a sibling `.en-US.json` exists
//   (scripts/fixtures/language-phase-1d-messages-before.{en-GB,en-US}.json = `git show 756ca09:messages/…`), the en-US
//   catalogue is THAT file exactly (756ca09 had Phase 2's 213 overrides), not {} — and en-GB is overlaid as before.
//   THE AS-MOVED OVERLAY: scripts/fixtures/language-phase-1d-gb-moved.json ({ "ns.key": "<today's words as moved>" },
//   written by the 1d messages helper for every GB wrong-English fix) is applied FIRST in every frozen mode, then the
//   frozen file over it. So a 1d key whose en-GB text is a FIX shows its as-moved text under any frozen catalogue (a key
//   the frozen file has keeps the frozen file's text, which for a 756ca09 key is the same). That keeps every harness
//   that runs on frozen words (language-phase-0/1a/1b/1c, Phase 2's F, money-sweep, …) blind to 1d's word fixes, as it
//   is to Phase 2's. HG_MESSAGES_MOVED=off turns the overlay off (only for a deliberate check).
// HG_MESSAGES_FROZEN unset, empty or "off" → the switch is off and bundles read the generated files on disk.
// Generated files live under node_modules/.cache/lp2-messages/<content hash>/, so concurrent runs never collide.
const fs = require('fs'); const path = require('path'); const crypto = require('crypto')
const REPO = path.resolve(__dirname, '..')
const FROZEN_DEFAULT = path.join(REPO, 'scripts/fixtures/language-phase-2-messages-before.json')
const FROZEN_REF = '460ba55'

const isObj = v => v && typeof v === 'object' && !Array.isArray(v)

/** 🔴 KEYS ADDED IN PHASE 2 THAT TOOK OVER TEXT WHICH WAS INLINE AT 460ba55 AND WAS REWORDED ON THE WAY IN. The frozen
 *  catalogue gives them their 460ba55 text, so F still shows the BEFORE words and the rewording is proven as a WORD
 *  change (and named in scripts/fixtures/language-phase-2-gb-named.json). Every other new key's GB text is today's
 *  inline text word for word — which language-phase-2 proves, because F (rendering them) equals BEFORE.
 *  `source` is where the text was; scripts/_messages-parity-2.cjs checks it is there, verbatim, at 460ba55. */
const FROZEN_INLINE = {
  'dashboard.settings.capacityDesc': { source: 'lib/kitchen-capacity.ts (KITCHEN_CAPACITY_DESC)',
    text: "The most items your kitchen can turn out at once, across all the categories you've ticked. Each category's own batch size still applies on top." },
}
const readJson = f => JSON.parse(fs.readFileSync(f, 'utf8'))
/** [['a.b.c', 'text'], …] — every leaf of a message tree. */
const leaves = (o, p = '') => Object.entries(o || {}).flatMap(([k, v]) => (isObj(v) ? leaves(v, `${p}${k}.`) : [[`${p}${k}`, v]]))
const getPath = (o, key) => key.split('.').reduce((x, k) => (isObj(x) && k in x ? x[k] : undefined), o)

/** `current` with every leaf `frozen` also has (as a leaf, at the same path) set back to the frozen value. */
function overlay(current, frozen) {
  if (!isObj(current)) return current
  const out = {}
  for (const [k, v] of Object.entries(current)) {
    const f = isObj(frozen) ? frozen[k] : undefined
    if (isObj(v)) out[k] = overlay(v, f)
    else out[k] = typeof f === 'string' && typeof v === 'string' ? f : v
  }
  return out
}

/** The frozen file with FROZEN_INLINE's keys added at their 460ba55 inline text. */
function withInline(frozen) {
  const out = JSON.parse(JSON.stringify(frozen))
  for (const [key, { text }] of Object.entries(FROZEN_INLINE)) {
    const parts = key.split('.'); let o = out
    for (const p of parts.slice(0, -1)) { if (!isObj(o[p])) o[p] = {}; o = o[p] }
    if (!(parts[parts.length - 1] in o)) o[parts[parts.length - 1]] = text
  }
  return out
}

const MOVED_FILE = path.join(REPO, 'scripts/fixtures/language-phase-1d-gb-moved.json')
// ⚠️ RE-PINNED (Language Phase 1d Part 2): a SECOND as-moved overlay, scripts/fixtures/language-phase-1d2-gb-moved.json
// (written by Part 2's messages helper for every Part 2 GB wrong-English fix; a key that existed at 826471a is recorded
// at its 826471a text). BOTH overlays apply in every frozen mode, so every older harness sees Part 2's fixes as moved,
// exactly as it sees Part 1's. Where a key is in both, PART 1's as-moved text wins (it is the older text — what a
// 756ca09-or-earlier frozen catalogue must show); under the 826471a pair the frozen file's own text wins anyway.
const MOVED_FILE_1D2 = path.join(REPO, 'scripts/fixtures/language-phase-1d2-gb-moved.json')
// ⚠️ RE-PINNED (Language Phase 1e): a THIRD as-moved overlay, scripts/fixtures/language-phase-1e-gb-moved.json (written by
// Phase 1e's messages helper for every marketing GB wrong-English fix; a key that existed at eb7ed44 is recorded at its
// eb7ed44 text). It is applied FIRST, so the older overlays win where a key is in more than one (the older text is what an
// older frozen catalogue must show); under the eb7ed44 pair the frozen file's own text wins anyway.
const MOVED_FILE_1E = path.join(REPO, 'scripts/fixtures/language-phase-1e-gb-moved.json')
const MOVED_FILES = [MOVED_FILE_1E, MOVED_FILE_1D2, MOVED_FILE]   // applied in this order: a later file wins
/** The as-moved overlays (Part 2's, then Part 1's over it) as one message tree ({} when absent or HG_MESSAGES_MOVED=off). */
function movedTree(env = process.env) {
  if (env.HG_MESSAGES_MOVED === 'off') return {}
  const out = {}
  for (const file of MOVED_FILES) {
    if (!fs.existsSync(file)) continue
    for (const [key, text] of Object.entries(readJson(file))) {
      const parts = key.split('.'); let o = out
      for (const p of parts.slice(0, -1)) { if (!isObj(o[p])) o[p] = {}; o = o[p] }
      o[parts[parts.length - 1]] = text
    }
  }
  return out
}

// ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026, docs/plans-data-model-report.md): an OPT-IN fourth as-moved
// overlay — the en-GB keys Stage A REWORDED, at their text before Stage A (scripts/fixtures/plans-stage-a-messages.json,
// `en-GB.reworded[key].before`). A key new since a frozen commit shows its CURRENT text under that frozen catalogue, so a
// later rewording (manageSettings.qr.lockedTitle "part of a higher plan" → "switched off for your truck") would leak into
// every older "F" as if the older phase had made it. With HG_MESSAGES_STAGE_A=before (set by the language-phase harnesses'
// own F / A runs only, so no other harness's frozen words move) it is applied FIRST — the lowest precedence: every older
// overlay and the frozen file itself still win. Keys Stage A REMOVED are gone from every catalogue (the overlay only sets
// back keys the current file has); the key checks read the same file's `removed` list.
const STAGE_A_FILE = path.join(REPO, 'scripts/fixtures/plans-stage-a-messages.json')
// ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): Stage A2's message changes are recorded in a SIBLING file
// (scripts/fixtures/plans-stage-a2-messages.json, same shape: planPrompt.*, errorsManage.feature_not_on_plan,
// errorsCustomer.pay_at_hatch_unavailable, manageBilling.plan.trialMonths added; manageShell.trialPopup.title reworded).
// `stageA()` returns the two records MERGED (Stage A, then A2 on top), so every reader of "the plan stages' recorded
// message changes" — the as-moved overlay and the key checks — reads both. `stageAOnly()` / `stageA2()` are each alone.
const STAGE_A2_FILE = path.join(REPO, 'scripts/fixtures/plans-stage-a2-messages.json')
const EMPTY_STAGE = () => ({ 'en-GB': { removed: {}, reworded: {}, added: {} }, 'en-US': { removed: {}, reworded: {}, added: {} } })
const stageAOnly = () => (fs.existsSync(STAGE_A_FILE) ? readJson(STAGE_A_FILE) : EMPTY_STAGE())
const stageA2 = () => (fs.existsSync(STAGE_A2_FILE) ? readJson(STAGE_A2_FILE) : EMPTY_STAGE())
// ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): Stage B's message changes are a THIRD sibling
// (scripts/fixtures/plans-stage-b-messages.json — planFeatures / featuresPage / planMeta / landing.pricing trimmed or
// removed, pricing.* and planTable.* added, the van modal body, the trial popup offer / body, Billing's notStarted body,
// compare's fee-shape lines, the welcome email's trial line, the first-load failure line). `stageA()` is Stage A + A2
// merged exactly as before, then B applied on top IN ORDER: a key B rewords that A / A2 already reworded keeps A's FIRST
// `before` (the overlay's job is the text before the plan stages) and takes B's `after`; a key A / A2 added and B rewords
// stays ADDED, with B's text; a key B removes leaves `reworded` / `added`. `stageB()` is B alone.
const STAGE_B_FILE = path.join(REPO, 'scripts/fixtures/plans-stage-b-messages.json')
const stageB = () => (fs.existsSync(STAGE_B_FILE) ? readJson(STAGE_B_FILE) : EMPTY_STAGE())
// ⚠️ RE-PINNED (pricing-tidy, 20 October 2026): pricing-tidy's message changes are a FOURTH sibling
// (scripts/fixtures/pricing-tidy-messages.json — Billing's notStarted body deleted, planTable.notes.whatsapp / .printing
// added), applied after B by the same rule (a key it removes that a stage reworded keeps that stage's FIRST `before`).
const STAGE_TIDY_FILE = path.join(REPO, 'scripts/fixtures/pricing-tidy-messages.json')
const stageTidy = () => (fs.existsSync(STAGE_TIDY_FILE) ? readJson(STAGE_TIDY_FILE) : EMPTY_STAGE())
// ⚠️ RE-PINNED (address-formats-2, 21 October 2026): address-formats-2's message changes are a FIFTH sibling
// (scripts/fixtures/address-formats-2-messages.json — the `{style}` address words moved to the `address` namespace by field
// variant, GB/US text identical; four sentences take the word as a value; the new variants' words added), applied after
// pricing-tidy by the same rule.
const STAGE_AF2_FILE = path.join(REPO, 'scripts/fixtures/address-formats-2-messages.json')
const stageAF2 = () => (fs.existsSync(STAGE_AF2_FILE) ? readJson(STAGE_AF2_FILE) : EMPTY_STAGE())
const stageA = () => {
  const a = stageAOnly(), b = stageA2(), sb = stageB(), st = stageTidy(), af2 = stageAF2(), out = {}
  for (const loc of ['en-GB', 'en-US']) {
    const o = out[loc] = {}
    for (const part of ['removed', 'reworded', 'added']) o[part] = { ...((a[loc] || {})[part] || {}), ...((b[loc] || {})[part] || {}) }
    for (const x of [sb[loc] || {}, st[loc] || {}, af2[loc] || {}]) {
      for (const [k, v] of Object.entries(x.removed || {})) { const was = k in o.reworded ? o.reworded[k].before : k in o.added ? undefined : v; delete o.reworded[k]; delete o.added[k]; if (was !== undefined) o.removed[k] = was }
      for (const [k, v] of Object.entries(x.reworded || {})) { if (k in o.added) o.added[k] = v.after; else o.reworded[k] = k in o.reworded ? { before: o.reworded[k].before, after: v.after } : v }
      for (const [k, v] of Object.entries(x.added || {})) o.added[k] = v
    }
  }
  return out
}
function stageATree() {
  const out = {}
  for (const [key, { before }] of Object.entries(stageA()['en-GB'].reworded || {})) {
    const parts = key.split('.'); let o = out
    for (const p of parts.slice(0, -1)) { if (!isObj(o[p])) o[p] = {}; o = o[p] }
    o[parts[parts.length - 1]] = before
  }
  return out
}

/** The switch as the environment sets it: { mode: 'frozen', file, usFile? } | { mode: 'source' } | null. */
function mode(env = process.env) {
  const f = env.HG_MESSAGES_FROZEN
  if (f && f !== 'off') {
    const file = path.resolve(REPO, f)
    const us = file.endsWith('.en-GB.json') ? file.replace(/\.en-GB\.json$/, '.en-US.json') : null
    return { mode: 'frozen', file, ...(us && fs.existsSync(us) ? { usFile: us } : {}), moved: env.HG_MESSAGES_MOVED !== 'off', ...(env.HG_MESSAGES_STAGE_A === 'before' ? { stageA: true } : {}) }
  }
  if (env.HG_MESSAGES_SOURCE === '1') return { mode: 'source' }
  return null
}

// ⚠️ RE-PINNED (Language Phase 1d Part 2): KEYS MOVED BETWEEN NAMESPACES (scripts/fixtures/language-phase-1d2-key-moves.json,
// { moves: { old: new } }). A frozen catalogue knows a moved key only under its OLD path; its text (en-GB and en-US) is
// copied to the NEW path too, so a frozen mode shows the moved key exactly as it showed the old one (e.g. the 826471a en-US
// "Mark paid & picked up" overrides under dashboard.settings.* reach completionSettings.*).
const KEY_MOVES_FILE = path.join(REPO, 'scripts/fixtures/language-phase-1d2-key-moves.json')
// ⚠️ RE-PINNED (Language Phase 1e): Phase 1e's own key moves (scripts/fixtures/language-phase-1e-key-moves.json, same
// shape), merged after Part 2's — so an eb7ed44 frozen catalogue shows a key Phase 1e moved at its new path too.
const KEY_MOVES_FILE_1E = path.join(REPO, 'scripts/fixtures/language-phase-1e-key-moves.json')
const keyMoves = () => Object.assign({}, ...[KEY_MOVES_FILE, KEY_MOVES_FILE_1E].map(f => (fs.existsSync(f) ? readJson(f).moves || {} : {})))
function withMoves(tree) {
  const out = JSON.parse(JSON.stringify(tree))
  for (const [from, to] of Object.entries(keyMoves())) {
    const v = getPath(out, from)
    if (typeof v !== 'string' || getPath(out, to) !== undefined) continue
    const parts = to.split('.'); let o = out
    for (const p of parts.slice(0, -1)) { if (!isObj(o[p])) o[p] = {}; o = o[p] }
    o[parts[parts.length - 1]] = v
  }
  return out
}

/* ⚠️ RE-PINNED (address-formats-2, 21 October 2026): the stage's REWORDED messages (four sentences that took the address word
 * as a `{style}` select now take it as a value — the code passes the new argument) and its ADDED ones in en-US (the US's
 * "City or town" under `address.label.area`) are shown at their NEW text in a frozen catalogue, with the HIGHEST
 * precedence: a frozen text would be rendered with arguments the code no longer passes. The words a reader sees are the
 * same (scripts/address-formats-2.cjs and the language harnesses compare them); the record is
 * scripts/fixtures/address-formats-2-messages.json. */
function af2AfterTree(loc) {
  const r = stageAF2()[loc] || {}, out = {}
  const put = (key, v) => { const parts = key.split('.'); let o = out; for (const p of parts.slice(0, -1)) { if (!isObj(o[p])) o[p] = {}; o = o[p] } o[parts[parts.length - 1]] = v }
  for (const [k, v] of Object.entries(r.reworded || {})) put(k, v.after)
  if (loc === 'en-US') for (const [k, v] of Object.entries(r.added || {})) put(k, v)
  return out
}
/** `base` with every string of `top` set on it — keys `base` lacks are ADDED (unlike `overlay`, which only replaces). */
function mergeOver(base, top) {
  const out = JSON.parse(JSON.stringify(base || {}))
  const walk = (o, t) => { for (const [k, v] of Object.entries(t)) { if (isObj(v)) { if (!isObj(o[k])) o[k] = {}; walk(o[k], v) } else o[k] = v } }
  walk(out, top)
  return out
}

/** The two whole catalogues a run sees under the switch (or as authored, when it is off). */
function catalogues(m = mode()) {
  const gb = readJson(path.join(REPO, 'messages/en-GB.json'))
  const us = readJson(path.join(REPO, 'messages/en-US.json'))
  if (m && m.mode === 'frozen') {
    const moved = m.moved === false ? {} : movedTree({})
    const base = m.stageA ? overlay(gb, stageATree()) : gb   // ⚠️ RE-PINNED (Stage A): the opt-in overlay, lowest precedence
    return {
      'en-GB': mergeOver(overlay(overlay(base, moved), withMoves(withInline(readJson(m.file)))), af2AfterTree('en-GB')),
      // A run with no frozen en-US file renders en-US as {} on purpose (Phase 0 / 1a: "the US file overrides nothing").
      'en-US': m.usFile ? mergeOver(withMoves(readJson(m.usFile)), af2AfterTree('en-US')) : {},
    }
  }
  return { 'en-GB': gb, 'en-US': us }
}

/** en-GB for a node-side reader (a harness that reads messages/en-GB.json itself): the overlay when frozen. */
function enGBForNode() { return catalogues()['en-GB'] }

let GEN = null
/** Writes the generated files for the current switch and returns { dir, resolve(spec) → abs path | null }. */
function generated() {
  const m = mode()
  if (!m) return null
  if (GEN && GEN.key === JSON.stringify(m)) return GEN
  const cat = catalogues(m)
  // ⚠️ RE-PINNED (ireland-1, 20 October 2026): en-IE, see below. In the hash only when it has words (SOURCE), so a frozen
  // run's directory is the one it always was.
  const ieFile = path.join(REPO, 'messages/en-IE.json')
  const ie = m.mode === 'frozen' || !fs.existsSync(ieFile) ? {} : readJson(ieFile)
  const body = JSON.stringify(cat) + (Object.keys(ie).length ? JSON.stringify({ 'en-IE': ie }) : '')
  const dir = path.join(REPO, 'node_modules/.cache/lp2-messages', crypto.createHash('sha1').update(body).digest('hex').slice(0, 16))
  const put = (rel, obj) => {
    const abs = path.join(dir, rel)
    if (fs.existsSync(abs)) return
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    const tmp = `${abs}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n'); fs.renameSync(tmp, abs)
  }
  put('en-GB.json', cat['en-GB']); put('en-US.json', cat['en-US'])
  for (const ns of Object.keys(cat['en-GB'])) { put(`ns/en-GB/${ns}.json`, cat['en-GB'][ns]); put(`ns/en-US/${ns}.json`, cat['en-US'][ns] ?? {}) }
  // ⚠️ RE-PINNED (ireland-1, 20 October 2026): a THIRD locale, en-IE (lib/i18n/locales.ts; messages/en-IE.json, written
  // sparsely by scripts/split-messages.cjs to messages/ns/en-IE/{landing,pricing,compare}.json). Under the switch its
  // imports resolve here too, never to the files on disk: FROZEN → {} (en-IE did not exist at any frozen commit — the
  // en-US rule when there is no frozen pair); SOURCE → the authored messages/en-IE.json, split by namespace as the
  // split writes it. Kept out of catalogues() (whose callers read en-GB / en-US).
  put('en-IE.json', ie)
  for (const ns of Object.keys(cat['en-GB'])) put(`ns/en-IE/${ns}.json`, ie[ns] ?? {})
  // A namespace the code imports but the authored file lacks (never valid — messages-split fails it) stays on disk's.
  GEN = { key: JSON.stringify(m), dir, m }
  return GEN
}

/** The esbuild hook: a message import → the generated file, or null when the switch is off. */
// ⚠️ RE-PINNED (ireland-1, 20 October 2026): en-IE is matched as well (see generated()).
const SPEC = /(?:^|\/)messages\/(?:(ns)\/)?(en-GB|en-US|en-IE)(?:\/([A-Za-z0-9]+))?\.json$/
function resolveMessages(spec) {
  const g = generated()
  if (!g) return null
  const m = SPEC.exec(spec)
  if (!m) return null
  const [, ns, locale, name] = m
  const rel = ns ? `ns/${locale}/${name}.json` : `${locale}.json`
  const abs = path.join(g.dir, rel)
  return fs.existsSync(abs) ? abs : null
}

/** Every en-GB key whose text differs from the frozen file, or that is new / gone: { key: { before, after } }. */
// ⚠️ RE-PINNED (Language Phase 1d): `afterFile` is the en-GB Phase 2 ENDED with (756ca09's, stored as
// scripts/fixtures/language-phase-1d-messages-before.en-GB.json) — Phase 2's list is about Phase 2's own changes; the
// keys Language Phase 1d adds or fixes are proven and listed by scripts/language-phase-1d.cjs.
const PHASE2_END_GB = path.join(REPO, 'scripts/fixtures/language-phase-1d-messages-before.en-GB.json')
function gbKeyDiff(frozenFile = FROZEN_DEFAULT, afterFile = fs.existsSync(PHASE2_END_GB) ? PHASE2_END_GB : path.join(REPO, 'messages/en-GB.json')) {
  const before = Object.fromEntries(leaves(readJson(frozenFile)))
  const inline = Object.fromEntries(Object.entries(FROZEN_INLINE).map(([k, v]) => [k, v.text]))
  const after = Object.fromEntries(leaves(readJson(afterFile)))
  const out = {}
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[k] === after[k]) continue
    if (!(k in before) && k in inline) {
      if (inline[k] !== after[k]) out[k] = { before: inline[k], after: after[k], kind: `new key; its text was inline at ${FROZEN_REF} in ${FROZEN_INLINE[k].source} and is reworded` }
      else out[k] = { before: null, after: after[k], kind: `new key; GB text unchanged (was inline in ${FROZEN_INLINE[k].source})` }
      continue
    }
    out[k] = { before: before[k] ?? null, after: after[k] ?? null, ...(k in before ? {} : { kind: 'new key; GB text unchanged — proven: F (which renders it) equals BEFORE wherever a view shows it' }) }
  }
  return out
}

module.exports = { stageA, stageAOnly, stageA2, stageB, stageTidy, stageAF2, STAGE_AF2_FILE, STAGE_A_FILE, STAGE_A2_FILE, STAGE_B_FILE, STAGE_TIDY_FILE, REPO, MOVED_FILE, MOVED_FILE_1D2, MOVED_FILE_1E, MOVED_FILES, KEY_MOVES_FILE, KEY_MOVES_FILE_1E, keyMoves, withMoves, movedTree, PHASE2_END_GB, FROZEN_DEFAULT, FROZEN_REF, FROZEN_INLINE, withInline, SPEC, leaves, getPath, overlay, mode, catalogues, enGBForNode, generated, resolveMessages, gbKeyDiff, readJson }
