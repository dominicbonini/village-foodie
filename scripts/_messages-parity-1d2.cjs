// scripts/_messages-parity-1d2.cjs — messages-parity AREA for Language Phase 1d Part 2 (Manage: Payments, Billing,
// Reports, Team, Social posts and posters, WhatsApp, custom domain, account deletion, the shell): the words that moved
// into messages/en-GB.json, BEFORE against AFTER, and their US words.
//
// BEFORE is the phase's Step 0 commit (826471a) in two forms:
//   • the SOURCE, at that commit, of every app/, components/ and lib/ file this phase changed, and
//   • what the in-scope surfaces RENDERED there (scripts/fixtures/language-phase-1d2-before/*.json.gz).
// AFTER is each message added since that commit, AS MOVED — a key whose en-GB text is a named GB fix is read at its
// as-moved text (scripts/fixtures/language-phase-1d2-gb-moved.json).
//   1. every literal run of every such message — each select and plural branch on its own — is text the commit's
//      source already carried; a run the commit BUILT from pieces is matched word by word instead and LISTED; a word
//      that was not there fails;
//   2. a message with no values is a string the BEFORE surfaces rendered, or — on a path no fixture reaches — one the
//      commit's source held;
//   3. every en-US key added or changed since 826471a exists in en-GB, differs from it, and takes the same arguments;
//      every GB fix takes the same arguments as the text it replaced;
//   4. the en-GB keys whose text differs between the frozen and the current words are exactly
//      scripts/fixtures/language-phase-1d2-gb-named.json;
//   5. 🔴 every LEGAL key (moved byte-identical; Dominic's legal decision pending) has NO en-US override.
const fs = require('fs'); const path = require('path'); const zlib = require('zlib'); const { execSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const { parse, TYPE } = require(path.join(REPO, 'node_modules/@formatjs/icu-messageformat-parser'))
const W = require('./_lp1d2-words.cjs')
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
      // An address-STYLE select's `zip_state` branch is the US address words (named US behaviour 1d-us-address-style),
      // carried in en-GB because the style, not the locale, picks it; the GB text is its `other` branch.
      const entries = Object.entries(el.options).filter(([k]) => !(el.type === TYPE.select && el.value === 'style' && k === 'zip_state'))
      const opts = entries.map(([, o]) => variants(o.value)).flat()
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

/** New words that are NOT a move: part of a named code change, so no BEFORE string carries them. Each with its name. */
/** en-US messages that leave out an en-GB argument ON PURPOSE: key → { drop, reason }. */
const ARG_DROPS = { 'posterWords.heading': { drop: ['end'], reason: 'approved US wording (audit §4.4 row 25): "Week commencing {start} to {end}" → "Week of {start}" — the US heading names the week by its first day only' } }
const NEW_WORDING = {
}

module.exports = function area({ t, head }) {
  head(`Phase 1d Part 2 · Manage's Payments, Billing, Reports, Team, Social, WhatsApp, domain, account and shell words that moved into messages/ — BEFORE (${BEFORE_REF}) against AFTER`)
  const F = W.catalogues('F'), A = W.catalogues('A')
  const fGB = Object.fromEntries(W.LP2.leaves(F['en-GB']))
  // ⚠️ RE-PINNED (Language Phase 1e): Part 2's OWN new keys — those in eb7ed44's en-GB (Part 2's end state). Keys added
  // after it (Phase 1e's marketing words) are checked by scripts/_messages-parity-1e.cjs against eb7ed44's source.
  const part2End = new Set(W.LP2.leaves(W.LP2.readJson(path.join(REPO, 'scripts/fixtures/language-phase-1e-messages-before.en-GB.json'))).map(([k]) => k))
  const added = W.newKeys().filter(([k]) => part2End.has(k)).map(([k]) => [k, fGB[k]])     // the AS-MOVED text
  const changed = execSync(`git diff --name-only ${BEFORE_REF} -- app components lib`, { cwd: REPO, encoding: 'utf8' }).split('\n').filter(f => /\.(ts|tsx)$/.test(f))
  const raw = changed.map(f => { try { return execSync(`git show ${BEFORE_REF}:${JSON.stringify(f).slice(1, -1)}`, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] }) } catch { return '' } }).join('\n')
  t(`the source of the ${changed.length} files this phase changed is read at ${BEFORE_REF}`, raw.length > 1000 || changed.length === 0)
  // A string literal's escapes are the characters they spell (\n a newline, \' an apostrophe), and a JSX entity the
  // character it names (&quot; &amp; …) — the message holds the characters.
  const src = joinConcats(raw).replace(/\\n/g, '\n').replace(/\\(['"`])/g, '$1').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&mdash;/g, '—').replace(/&ldquo;/g, '“').replace(/&rdquo;/g, '”').replace(/&rsquo;/g, '’').replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  const hay = [squash(raw), squash(src), squash(dropInterpolations(src)), squash(src.replace(/&apos;/g, "'")), squash(dropInterpolations(src).replace(/&apos;/g, "'"))].join('\n')
  const words = new Set((hay.match(/[A-Za-z][A-Za-z'’]*/g) || []).flatMap(w => [w, w.toUpperCase()]))
  const dir = path.join(REPO, 'scripts/fixtures/language-phase-1d2-before')
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
      const novel = (piece.match(/[A-Za-z][A-Za-z'’]*/g) || []).filter(w => !words.has(w) && !words.has(w.toLowerCase()) && !(w.endsWith('s') && words.has(w.slice(0, -1))))
      // The piece may live, verbatim, in an 826471a file this phase left alone (a copy module kept for another reader).
      let inTree = false
      if (novel.length) try { execSync(`git grep -q -F ${JSON.stringify(piece)} ${BEFORE_REF} -- app components lib`, { cwd: REPO, stdio: 'ignore' }); inTree = true } catch { /* not there */ }
      if (novel.length && inTree) { elsewherePieces.push(key); continue }
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
        // The words may still live in a file this phase did not change (a copy constant kept for another reader).
        let found = false
        try { execSync(`git grep -q -F ${JSON.stringify(text)} ${BEFORE_REF} -- app components lib`, { cwd: REPO, stdio: 'ignore' }); found = true } catch { /* not there */ }
        if (found) { plainSource++; elsewhere.push(key) }
        else if (built.length) { plainSource++; composedPlain.push(key) }   // built from pieces at 756ca09 (a ternary word): every word was there (check 1)
        else t(`${key}: a path no fixture reaches — the exact string is in ${BEFORE_REF}'s source`, false, text)
      }
    }
  }
  console.log(`  ${added.length} Phase 1d Part 2 messages · ${plainRendered} plain ones rendered by the BEFORE surfaces · ${plainSource} matched in the source`)
  if (composedPlain.length) console.log(`  ${composedPlain.length} plain message(s) on paths no fixture reaches were BUILT from pieces at ${BEFORE_REF} (every word there): ${composedPlain.join(', ')}`)
  if (elsewherePieces.length) console.log(`  ${new Set(elsewherePieces).size} message(s) with a run found verbatim in a ${BEFORE_REF} file this phase left alone: ${[...new Set(elsewherePieces)].slice(0, 20).join(', ')}`)
  if (elsewhere.length) console.log(`  ${elsewhere.length} plain message(s) whose exact text is in a ${BEFORE_REF} file this phase left alone: ${elsewhere.join(', ')}`)
  if (reworded.length) console.log(`  ${reworded.length} NEW wording(s) named as code changes (NEW_WORDING): ${reworded.map(k => `${k} (${NEW_WORDING[k]})`).join('; ')}`)
  console.log(`  ${composed.length} were built from pieces at ${BEFORE_REF} and are whole sentences now (their renders are compared byte for byte by language-phase-1d2): ${composed.slice(0, 30).join(', ')}${composed.length > 30 ? ' …' : ''}`)

  // ── 3 · the US words and the GB fixes keep their arguments ──
  const gb = Object.fromEntries(W.LP2.leaves(A['en-GB']))
  const us0 = Object.fromEntries(W.LP2.leaves(W.LP2.readJson(W.FROZEN_US)))
  const usNew = W.LP2.leaves(A['en-US']).filter(([k, v]) => us0[k] !== v)   // added OR changed since 826471a
  const orphan = usNew.filter(([k]) => !(k in gb)).map(([k]) => k)
  const copies = usNew.filter(([k, v]) => gb[k] === v).map(([k]) => k)
  t(`en-US: every key added or changed since ${BEFORE_REF} exists in en-GB (${usNew.length})`, orphan.length === 0, orphan.join(', '))
  t('en-US: every key added differs from its en-GB text', copies.length === 0, copies.join(', '))
  // An en-US message may leave out an en-GB argument only where ARG_DROPS names it, with its reason.
  const argsLess = (k, s) => { const d = ARG_DROPS[k] ? new Set(ARG_DROPS[k].drop) : null; const x = argsOf(s); return d && x != null ? x.split(',').filter(a => a && !d.has(a)).join(',') : x }
  const badArgs = usNew.filter(([k, v]) => k in gb && argsOf(v) !== argsLess(k, gb[k])).map(([k, v]) => `${k}: en-US ${argsOf(v)} · en-GB ${argsOf(gb[k])}`)
  for (const [k, x] of Object.entries(ARG_DROPS)) console.log(`  en-US ${k} leaves out {${x.drop.join('}, {')}} on purpose: ${x.reason}`)
  t(`en-US: every key added takes the same arguments as en-GB (${usNew.length})`, badArgs.length === 0, badArgs.join(' · '))
  const mv = W.moved()
  const fixArgs = Object.entries(mv).filter(([k, m]) => k in gb && argsOf(m) !== argsOf(gb[k])).map(([k, m]) => `${k}: moved ${argsOf(m)} · fixed ${argsOf(gb[k])}`)
  t(`every GB fix takes the same arguments as the text it replaced (${Object.keys(mv).length})`, fixArgs.length === 0, fixArgs.join(' · '))

  // ── 4 · the named list ──
  const file = path.join(REPO, 'scripts/fixtures/language-phase-1d2-gb-named.json')
  const named = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null
  t('scripts/fixtures/language-phase-1d2-gb-named.json exists', !!named)
  if (named) {
    const diff = W.gbKeyDiff()
    const unnamed = Object.keys(diff).filter(k => !named[k] || named[k].before !== diff[k].before || named[k].after !== diff[k].after)
    const stale = Object.keys(named).filter(k => !diff[k])
    t(`every en-GB key whose text differs from ${BEFORE_REF}'s (as moved) is named, as it changed (${Object.keys(diff).length})`, unnamed.length === 0, unnamed.join(', '))
    t('every named key did change', stale.length === 0, stale.join(', '))
  }
  // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): Stage A REMOVED manageBilling.onMax / onMaxNoCta (now
  // onTrial / onTrialNoCta: no Max plan any more), recorded in scripts/fixtures/plans-stage-a-messages.json. Their leftover
  // as-moved entries are history and inert (the overlay only covers current keys); only THAT problem, for a key the fixture
  // lists as removed and only while it is absent from the authored en-GB, is excused.
  const removedA = W.LP2.stageA()['en-GB'].removed || {}
  const gbNow = new Set(W.LP2.leaves(W.LP2.readJson(path.join(REPO, 'messages/en-GB.json'))).map(([k]) => k))
  const mp = W.movedProblems().filter(p => !Object.keys(removedA).some(k => p === `${k}: in the as-moved list but not in messages/en-GB.json` && !gbNow.has(k)))
  t('the as-moved list (scripts/fixtures/language-phase-1d2-gb-moved.json) is consistent with the catalogue', mp.length === 0, mp.join(' · '))

  // ── 5 · legal wording keeps GB words in the US ──
  const legal = W.legalKeys()
  const usAll = Object.fromEntries(W.LP2.leaves(A['en-US']))
  const overridden = legal.filter(k => k in usAll)
  t(`LEGAL: no legal key has an en-US override (${legal.length} legal keys: ${legal.join(', ') || 'none'})`, overridden.length === 0, overridden.join(', '))
}
