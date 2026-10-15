// scripts/_messages-parity-1c.cjs — messages-parity AREA for Language Phase 1c (docs/language-phase-1c-report.md):
// the onboarding text that moved into messages/en-GB.json, BEFORE against AFTER.
//
// BEFORE is the phase's starting commit (accbb61) in two forms:
//   • the SOURCE, at that commit, of every app/, components/ and lib/ file this phase changed, and
//   • what the kitchen surfaces RENDERED there (scripts/fixtures/language-phase-1c-before/*.json.gz).
// AFTER is each message added since that commit (a key the commit's messages/en-GB.json did not have).
//   1. every literal run of every such message — each select and plural branch on its own — is text the commit's
//      source already carried; a run the commit BUILT from pieces (a ternary word, a joined string, an added `s`,
//      a value upper-cased by code) is matched word by word instead and LISTED; a word that was not there fails;
//   2. a message with no values is a string the BEFORE surfaces rendered, or — on a path no fixture reaches — one
//      the commit's source held. The renders themselves are compared byte for byte by scripts/language-phase-1c.cjs.
const fs = require('fs'); const path = require('path'); const zlib = require('zlib'); const { execSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const { parse, TYPE } = require(path.join(REPO, 'node_modules/@formatjs/icu-messageformat-parser'))
const BEFORE_REF = 'accbb61'   // HEAD when Phase 1c began (Step 0 made no commit: 1b was already in 89b3f29)

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
    }
  }
  return out
}

module.exports = function area({ t, head, msgs }) {
  head(`Phase 1c · the onboarding text that moved into messages/ — BEFORE (${BEFORE_REF}) against AFTER`)
  const leaves = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? leaves(v, `${p}${k}.`) : [[`${p}${k}`, v]]))
  let beforeKeys
  try { beforeKeys = new Set(leaves(JSON.parse(execSync(`git show ${BEFORE_REF}:messages/en-GB.json`, { cwd: REPO, encoding: 'utf8' }))).map(([k]) => k)) }
  catch { t(`messages/en-GB.json is readable at ${BEFORE_REF}`, false); return }
  const added = leaves(msgs['en-GB']).filter(([k]) => !beforeKeys.has(k))
  const changed = execSync(`git diff --name-only ${BEFORE_REF} -- app components lib`, { cwd: REPO, encoding: 'utf8' }).split('\n').filter(f => /\.(ts|tsx)$/.test(f))
  const raw = changed.map(f => { try { return execSync(`git show ${BEFORE_REF}:${JSON.stringify(f).slice(1, -1)}`, { cwd: REPO, encoding: 'utf8', maxBuffer: 64 << 20 }) } catch { return '' } }).join('\n')
  t(`the source of the ${changed.length} files this phase changed is read at ${BEFORE_REF}`, raw.length > 1000)
  // A string literal's \uXXXX escape is the character it spells (the dashboard writes \u2019 for ’).
  const src = joinConcats(raw).replace(/&mdash;/g, '—').replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  const hay = [squash(raw), squash(src), squash(dropInterpolations(src)), squash(src.replace(/&apos;/g, "'")), squash(dropInterpolations(src).replace(/&apos;/g, "'"))].join('\n')
  // A word the commit printed by upper-casing ours counts as the same word.
  const words = new Set((hay.match(/[A-Za-z][A-Za-z'’]*/g) || []).flatMap(w => [w, w.toUpperCase()]))
  const dir = path.join(REPO, 'scripts/fixtures/language-phase-1c-before')
  const rendered = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json.gz')).map(f => squash(zlib.gunzipSync(fs.readFileSync(path.join(dir, f))).toString())).join('\n') : ''
  const htmlish = s => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const composed = []
  let plainRendered = 0, plainSource = 0
  for (const [key, v] of added) {
    let ast; try { ast = parse(v) } catch { continue }   // invalid ICU is reported by messages-parity §3
    const missing = [], built = []
    for (const runs of variants(ast)) for (const run of runs) {
      if (run == null) continue
      const piece = squash(run).trim()
      if (!/[A-Za-z]{2}/.test(piece) || hay.includes(piece) || hay.includes(piece.toLowerCase())) continue
      const novel = (piece.match(/[A-Za-z][A-Za-z'’]*/g) || []).filter(w => !words.has(w) && !words.has(w.toLowerCase()) && !(w.endsWith('s') && words.has(w.slice(0, -1))))
      if (novel.length) missing.push(`${JSON.stringify(piece)} (new: ${novel.join(', ')})`)
      else built.push(piece)
    }
    if (built.length) composed.push(key)
    t(`${key}: every word was in ${BEFORE_REF}'s source`, missing.length === 0, missing.join(' · '))
    if (ast.every(el => el.type === TYPE.literal)) {
      const text = squash(v)
      if (rendered.includes(JSON.stringify(text).slice(1, -1)) || rendered.includes(JSON.stringify(htmlish(text)).slice(1, -1))) plainRendered++
      else { plainSource++; t(`${key}: a path no fixture reaches — the exact string is in ${BEFORE_REF}'s source`, hay.includes(text) || hay.includes(text.replace(/'/g, '&apos;')) || hay.includes(text.toLowerCase()), text) }
    }
  }
  console.log(`  ${added.length} Phase 1c messages · ${plainRendered} plain ones rendered by the BEFORE surfaces · ${plainSource} matched in the source`)
  console.log(`  ${composed.length} were built from pieces at ${BEFORE_REF} and are whole sentences now (their renders are compared byte for byte by language-phase-1c): ${composed.join(', ')}`)
}
