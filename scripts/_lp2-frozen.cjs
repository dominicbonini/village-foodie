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

/** The switch as the environment sets it: { mode: 'frozen', file } | { mode: 'source' } | null. */
function mode(env = process.env) {
  const f = env.HG_MESSAGES_FROZEN
  if (f && f !== 'off') return { mode: 'frozen', file: path.resolve(REPO, f) }
  if (env.HG_MESSAGES_SOURCE === '1') return { mode: 'source' }
  return null
}

/** The two whole catalogues a run sees under the switch (or as authored, when it is off). */
function catalogues(m = mode()) {
  const gb = readJson(path.join(REPO, 'messages/en-GB.json'))
  const us = readJson(path.join(REPO, 'messages/en-US.json'))
  if (m && m.mode === 'frozen') return { 'en-GB': overlay(gb, withInline(readJson(m.file))), 'en-US': {} }
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
  const body = JSON.stringify(cat)
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
  // A namespace the code imports but the authored file lacks (never valid — messages-split fails it) stays on disk's.
  GEN = { key: JSON.stringify(m), dir, m }
  return GEN
}

/** The esbuild hook: a message import → the generated file, or null when the switch is off. */
const SPEC = /(?:^|\/)messages\/(?:(ns)\/)?(en-GB|en-US)(?:\/([A-Za-z0-9]+))?\.json$/
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
function gbKeyDiff(frozenFile = FROZEN_DEFAULT) {
  const before = Object.fromEntries(leaves(readJson(frozenFile)))
  const inline = Object.fromEntries(Object.entries(FROZEN_INLINE).map(([k, v]) => [k, v.text]))
  const after = Object.fromEntries(leaves(readJson(path.join(REPO, 'messages/en-GB.json'))))
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

module.exports = { REPO, FROZEN_DEFAULT, FROZEN_REF, FROZEN_INLINE, withInline, SPEC, leaves, getPath, overlay, mode, catalogues, enGBForNode, generated, resolveMessages, gbKeyDiff, readJson }
