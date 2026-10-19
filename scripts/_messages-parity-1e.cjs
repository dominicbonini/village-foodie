// scripts/_messages-parity-1e.cjs — messages-parity AREA for Language Phase 1e (the HatchGrab MARKETING surfaces: landing,
// /features, /compare, the plans PDF, nav and footers, contact, the legal chrome, the public truck page, the plan rows
// Billing shares): the words that moved into messages/en-GB.json, BEFORE against AFTER, and their US words.
//
// BEFORE is the phase's Step 0 commit (eb7ed44) in two forms:
//   • the SOURCE, at that commit, of every app/, components/ and lib/ file this phase changed, and
//   • what the marketing surfaces RENDERED there (scripts/fixtures/language-phase-1e-before/*.json.gz).
// AFTER is each message added since that commit, AS MOVED — a key whose en-GB text is a named GB fix is read at its
// as-moved text (scripts/fixtures/language-phase-1e-gb-moved.json).
//   1. every literal run of every such message (each select / plural branch on its own) is text the commit's source
//      carried; a run the commit BUILT from pieces is matched word by word instead and LISTED; a word that was not there fails;
//   2. a message with no values is a string the BEFORE surfaces rendered, or — on a path no fixture reaches — one the
//      commit's source held;
//   3. every en-US key added or changed since eb7ed44 exists in en-GB, differs from it, and takes the same arguments;
//      every GB fix takes the same arguments as the text it replaced — except where NAMED below;
//   4. the en-GB keys whose text differs between the frozen and the current words are exactly
//      scripts/fixtures/language-phase-1e-gb-named.json;
//   5. 🔴 a LEGAL key (quoting the law / data protection) has NO en-US override.
// ⚠️ The word pattern drops a trailing straight quote ("road'" is the word "road" at the end of a quoted string).
const fs = require('fs'); const path = require('path'); const zlib = require('zlib'); const { execSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const { parse, TYPE } = require(path.join(REPO, 'node_modules/@formatjs/icu-messageformat-parser'))
const W = require('./_lp1e-words.cjs')
const BEFORE_REF = W.BEFORE_REF

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
const joinConcats = s => s.replace(/(['"`])\s*\+\s*\1/g, '')
function variants(ast) {
  let out = [[]]
  const add = text => { for (const v of out) { if (v.length && typeof v[v.length - 1] === 'string') v[v.length - 1] += text; else v.push(text) } }
  const gap = () => { for (const v of out) v.push(null) }
  for (const el of ast) {
    if (el.type === TYPE.literal) add(el.value)
    else if ([TYPE.argument, TYPE.number, TYPE.date, TYPE.time, TYPE.pound].includes(el.type)) gap()
    else if (el.type === TYPE.tag) { gap(); const inner = variants(el.children); out = out.flatMap(v => inner.map(w => [...v, ...w, null])) }
    else if (el.type === TYPE.select || el.type === TYPE.plural) {
      const opts = Object.values(el.options).map(o => variants(o.value)).flat()
      out = out.flatMap(v => opts.map(w => [...v, null, ...w, null]))
      if (out.length > 64) out = out.slice(0, 64)
    }
  }
  return out
}
function args(ast, out = new Set()) {
  for (const el of ast) {
    if ([TYPE.argument, TYPE.number, TYPE.date, TYPE.time, TYPE.select, TYPE.plural].includes(el.type)) out.add(el.value)
    if (el.type === TYPE.tag) { out.add(`<${el.value}>`); args(el.children, out) }
    if (el.options) for (const o of Object.values(el.options)) args(o.value, out)
  }
  return out
}
const argsOf = s => { try { return [...args(parse(s))].sort().join(',') } catch { return null } }
const wordsOf = s => (s.match(/[A-Za-z][A-Za-z'’]*/g) || []).map(w => w.replace(/['’]+$/, ''))

/** GB fixes that change a message's ARGUMENTS on purpose: key → reason. */
const FIX_ARGS = {
  'compare.smallPrint.onTop': 'COMPARE’s content fix: "question 4" was stale; the number is the fee step’s own ({n} = STEP.fee, "question 5")',
  // ⚠️ RE-PINNED (US dress rehearsal fixes, 19 October 2026, docs/us-dress-rehearsal-fixes-report.md)
  'orderStatus.cancelledBody': 'US dress rehearsal fix (Finding 5): the card-refund sentence is a {card} select — dropped for a pay-at-the-truck order; every word as it was',
}
/** Moved messages whose words are NEW on purpose (a named change), so no eb7ed44 string carries them: key → reason. */
const NEW_WORDING = {
  // ⚠️ RE-PINNED (US dress rehearsal fixes, 19 October 2026): the US Add / Edit event form's new State box.
  'manageScheduleEvent.statePlaceholder': 'US dress rehearsal fix (Finding 6): the State box\'s example, a two-letter state ("e.g. NJ")',
}
const LEGAL_RE = /\bUK law\b|\blaw requires\b|\bby law\b|\blegally\b|\blegal(ly)? required\b|\bretention\b|\bHMRC\b|\bGDPR\b|data protection|tax records/i

module.exports = function area({ t, head }) {
  head(`Phase 1e · the HatchGrab marketing words that moved into messages/ — BEFORE (${BEFORE_REF}) against AFTER`)
  const F = W.catalogues('F'), A = W.catalogues('A')
  const fGB = Object.fromEntries(W.LP2.leaves(F['en-GB']))
  const added = W.newKeys().map(([k]) => [k, fGB[k]])     // the AS-MOVED text
  const changed = execSync(`git diff --name-only ${BEFORE_REF} -- app components lib`, { cwd: REPO, encoding: 'utf8' }).split('\n').filter(f => /\.(ts|tsx)$/.test(f))
  const raw = changed.map(f => { try { return execSync(`git show ${BEFORE_REF}:${JSON.stringify(f).slice(1, -1)}`, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return '' } }).join('\n')
  t(`the source of the ${changed.length} files this phase changed is read at ${BEFORE_REF}`, raw.length > 1000 || changed.length === 0)
  const src = joinConcats(raw).replace(/\\n/g, '\n').replace(/\\(['"`])/g, '$1').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&mdash;/g, '—').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”').replace(/&rsquo;/g, '’').replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  const hay = [squash(raw), squash(src), squash(dropInterpolations(src)), squash(src.replace(/&apos;/g, "'")), squash(dropInterpolations(src).replace(/&apos;/g, "'"))].join('\n')
  const words = new Set(wordsOf(hay).flatMap(w => [w, w.toUpperCase()]))
  const dir = path.join(REPO, 'scripts/fixtures/language-phase-1e-before')
  const rendered = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json.gz')).map(f => squash(zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString())).join('\n') : ''
  const htmlish = s => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const composed = [], composedPlain = [], reworded = [], elsewhere = [], elsewherePieces = []
  let plainRendered = 0, plainSource = 0
  for (const [key, v] of added) {
    if (typeof v !== 'string') continue
    let ast; try { ast = parse(v) } catch { continue }   // invalid ICU is reported by messages-parity §3
    const missing = [], built = []
    for (const runs of variants(ast)) for (const run of runs) {
      if (run == null) continue
      const piece = squash(run).trim()
      if (!/[A-Za-z]{2}/.test(piece) || hay.includes(piece) || hay.includes(piece.toLowerCase())) continue
      const novel = wordsOf(piece).filter(w => w && !words.has(w) && !words.has(w.toLowerCase()) && !(w.endsWith('s') && words.has(w.slice(0, -1))))
      let inTree = false
      if (novel.length) try { execSync(`git grep -q -F ${JSON.stringify(piece)} ${BEFORE_REF} -- app components lib`, { cwd: REPO, stdio: 'ignore' }); inTree = true } catch { /* not there */ }
      if (novel.length && inTree) { elsewherePieces.push(key); continue }
      if (novel.length && NEW_WORDING[key]) { reworded.push(key); continue }
      if (novel.length) missing.push(`${JSON.stringify(piece)} (new: ${novel.join(', ')})`)
      else built.push(piece)
    }
    if (built.length) composed.push(key)
    t(`${key}: every word (as moved) was in ${BEFORE_REF}'s source`, missing.length === 0, missing.join(' · '))
    if (ast.every(el => el.type === TYPE.literal)) {
      const text = squash(v)
      if (rendered.includes(JSON.stringify(text).slice(1, -1)) || rendered.includes(JSON.stringify(htmlish(text)).slice(1, -1))) plainRendered++
      else if (hay.includes(text) || hay.includes(text.replace(/'/g, '&apos;')) || hay.includes(text.toLowerCase())) plainSource++
      else if (NEW_WORDING[key]) { plainSource++; reworded.push(key) }
      else {
        let found = false
        try { execSync(`git grep -q -F ${JSON.stringify(text)} ${BEFORE_REF} -- app components lib`, { cwd: REPO, stdio: 'ignore' }); found = true } catch { /* not there */ }
        if (found) { plainSource++; elsewhere.push(key) }
        else if (built.length) { plainSource++; composedPlain.push(key) }
        else t(`${key}: a path no fixture reaches — the exact string is in ${BEFORE_REF}'s source`, false, text)
      }
    }
  }
  console.log(`  ${added.length} Phase 1e messages · ${plainRendered} plain ones rendered by the BEFORE surfaces · ${plainSource} matched in the source`)
  if (composedPlain.length) console.log(`  ${composedPlain.length} plain message(s) on paths no fixture reaches were BUILT from pieces at ${BEFORE_REF}: ${composedPlain.join(', ')}`)
  if (elsewherePieces.length) console.log(`  ${new Set(elsewherePieces).size} message(s) with a run found verbatim in a ${BEFORE_REF} file this phase left alone: ${[...new Set(elsewherePieces)].slice(0, 20).join(', ')}`)
  if (elsewhere.length) console.log(`  ${elsewhere.length} plain message(s) whose exact text is in a ${BEFORE_REF} file this phase left alone: ${elsewhere.join(', ')}`)
  if (reworded.length) console.log(`  ${reworded.length} NEW wording(s) named: ${[...new Set(reworded)].map(k => `${k} (${NEW_WORDING[k]})`).join('; ')}`)
  console.log(`  ${composed.length} were built from pieces at ${BEFORE_REF} and are whole sentences now (their renders are compared byte for byte by language-phase-1e): ${composed.slice(0, 30).join(', ')}${composed.length > 30 ? ' …' : ''}`)

  // ── 3 · the US words and the GB fixes keep their arguments ──
  const gb = Object.fromEntries(W.LP2.leaves(A['en-GB']))
  const us0 = Object.fromEntries(W.LP2.leaves(W.LP2.readJson(W.FROZEN_US)))
  const usNew = W.LP2.leaves(A['en-US']).filter(([k, v]) => us0[k] !== v)
  const orphan = usNew.filter(([k]) => !(k in gb)).map(([k]) => k)
  const copies = usNew.filter(([k, v]) => gb[k] === v).map(([k]) => k)
  t(`en-US: every key added or changed since ${BEFORE_REF} exists in en-GB (${usNew.length})`, orphan.length === 0, orphan.join(', '))
  t('en-US: every key added differs from its en-GB text', copies.length === 0, copies.join(', '))
  const badArgs = usNew.filter(([k, v]) => k in gb && argsOf(v) !== argsOf(gb[k])).map(([k, v]) => `${k}: en-US ${argsOf(v)} · en-GB ${argsOf(gb[k])}`)
  t(`en-US: every key added takes the same arguments as en-GB (${usNew.length})`, badArgs.length === 0, badArgs.join(' · '))
  const mv = W.moved()
  for (const [k, r] of Object.entries(FIX_ARGS)) console.log(`  GB fix ${k} changes its arguments on purpose: ${r}`)
  const fixArgs = Object.entries(mv).filter(([k, m]) => k in gb && !(k in FIX_ARGS) && argsOf(m) !== argsOf(gb[k])).map(([k, m]) => `${k}: moved ${argsOf(m)} · fixed ${argsOf(gb[k])}`)
  t(`every GB fix takes the same arguments as the text it replaced (${Object.keys(mv).length}; ${Object.keys(FIX_ARGS).length} named)`, fixArgs.length === 0, fixArgs.join(' · '))

  // ── 4 · the named list ──
  const file = path.join(REPO, 'scripts/fixtures/language-phase-1e-gb-named.json')
  const named = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
  t('scripts/fixtures/language-phase-1e-gb-named.json exists', !!named)
  if (named) {
    const diff = W.gbKeyDiff()
    const unnamed = Object.keys(diff).filter(k => !named[k] || named[k].before !== diff[k].before || named[k].after !== diff[k].after)
    const stale = Object.keys(named).filter(k => !diff[k])
    t(`every en-GB key whose text differs from ${BEFORE_REF}'s (as moved) is named, as it changed (${Object.keys(diff).length})`, unnamed.length === 0, unnamed.join(', '))
    t('every named key did change', stale.length === 0, stale.join(', '))
  }
  const mp = W.movedProblems()
  t('the as-moved list (scripts/fixtures/language-phase-1e-gb-moved.json) is consistent with the catalogue', mp.length === 0, mp.join(' · '))
  const km = W.keyMoveProblems()
  t(`every Phase 1e key move keeps its words (${Object.keys(W.moves1e()).length})`, km.length === 0, km.join(' · '))

  // ── 5 · legal wording keeps GB words in the US ──
  const usAll = Object.fromEntries(W.LP2.leaves(A['en-US']))
  const legal = added.filter(([k]) => LEGAL_RE.test(gb[k] || '')).map(([k]) => k)
  const overridden = legal.filter(k => k in usAll)
  t(`LEGAL: no legal key has an en-US override (${legal.length} legal keys: ${legal.join(', ') || 'none'})`, overridden.length === 0, overridden.join(', '))
}
