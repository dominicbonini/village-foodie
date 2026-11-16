// scripts/harness-tmp-clean.cjs — tmp-cleanup-1 (16 November 2026, docs/tmp-cleanup-1-report.md): CLEAR THE TEMP FOLDERS
// THIS REPO'S TEST RUNS LEFT IN $TMPDIR.
//
// WHY: manual-update-1 measured 90 GB in $TMPDIR — 14,465 folders that harnesses made with mkdtemp and never removed,
// ~30–45 GB per full sweep. New runs now go under ONE parent (scripts/_harness-tmp.cjs) and clean up after themselves;
// this script clears what is left.
//
//   node scripts/harness-tmp-clean.cjs                 # the sweep's start: remove harness runs older than 24 h
//   node scripts/harness-tmp-clean.cjs --legacy        # ALSO the old scattered folders (dry run unless --apply)
//   node scripts/harness-tmp-clean.cjs --legacy --apply
//
// WHAT --legacy MATCHES (top-level entries of $TMPDIR only, never deeper, never anything else):
//   • every prefix a repo script passes to mkdtemp — read from the scripts themselves at run time, so the list cannot drift —
//     followed by mkdtemp's 6-character suffix (e.g. `cmp-V3-a1B2c3`, `et-render-Q9xY2z`);
//   • browser profiles and per-bundle temp left by test browsers: `puppeteer_dev_chrome_profile-XXXXXX`,
//     `playwright*`, `com.google.chrome.for.testing[.XXXXXX]` (not the WebKit folders macOS creates and protects);
//   • emulator / Xcode test scratch: `android-<user>` (the Android emulator's temp), `com.example.hguitests.xctrunner`.
// 🔴 ANYTHING A RUNNING PROCESS HAS OPEN (lsof: an open file or a working directory inside it) IS SKIPPED.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const REPO = path.resolve(__dirname, '..')
const argv = process.argv.slice(2)
const LEGACY = argv.includes('--legacy')
const APPLY = argv.includes('--apply')
const { ROOT, realTmp } = require('./_harness-tmp-paths.cjs')
const T = realTmp()

const fmt = b => b >= 2 ** 30 ? `${(b / 2 ** 30).toFixed(2)} GB` : `${(b / 2 ** 20).toFixed(1)} MB`
function sizeOf(p) {
  let total = 0
  const stack = [p]
  while (stack.length) {
    const cur = stack.pop()
    let st; try { st = fs.lstatSync(cur) } catch { continue }
    if (st.isDirectory()) { let es = []; try { es = fs.readdirSync(cur) } catch {} for (const e of es) stack.push(path.join(cur, e)) }
    else total += st.blocks ? st.blocks * 512 : st.size
  }
  return total
}
// Never throws: a folder macOS protects (EPERM) or one that vanished is counted as not removed, and the run goes on.
const failed = []
function rm(p) { try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); return true } catch (e) { failed.push(`${path.basename(p)} (${e.code || e.message})`); return false } }

/** The first path component under `base` of everything a running process has open (an open file or a working directory). */
let LSOF = null
function inUse(base) {
  if (LSOF === null) {
    try { LSOF = execFileSync('lsof', ['-nP', '-Fn', '-u', os.userInfo().username], { encoding: 'utf8', maxBuffer: 512 * 2 ** 20, stdio: ['ignore', 'pipe', 'ignore'] }) }
    catch (e) { LSOF = e.stdout || '' }
  }
  const busy = new Set()
  const b1 = base.replace(/\/+$/, '') + '/'
  const b2 = b1.startsWith('/var/') ? '/private' + b1 : b1.replace(/^\/private\//, '/')
  for (const line of LSOF.split('\n')) {
    if (line[0] !== 'n') continue
    const f = line.slice(1)
    for (const b of [b1, b2]) if (f.startsWith(b)) busy.add(f.slice(b.length).split('/')[0])
  }
  return busy
}

/** Every prefix the repo's scripts give mkdtemp: a literal, or a template's text up to its first ${…}. */
function repoPrefixes() {
  const files = []
  ;(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) { if (!/^(node_modules|\.git|android|ios|build)$/.test(e.name)) walk(p) }
      else if (/\.(c?js|mjs|ts)$/.test(e.name)) files.push(p)
    }
  })(path.join(REPO, 'scripts'))
  const literal = new Set(); const templ = new Set()
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8')
    for (const m of s.matchAll(/mkdtemp(?:Sync)?\(\s*(?:path\.join\(\s*[^,]+,\s*)?(['"`])([^'"`]*)\1/g)) {
      const raw = m[2]
      if (m[1] === '`' && raw.includes('${')) { const head = raw.slice(0, raw.indexOf('${')); if (head.length >= 2) templ.add(head); else if (/-screens-(out|work)-$/.test(raw)) templ.add('*-screens-') }
      else if (raw.length >= 2) literal.add(path.basename(raw))
    }
  }
  return { literal: [...literal], templ: [...templ] }
}

function legacyMatcher() {
  const { literal, templ } = repoPrefixes()
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = [
    ...literal.map(p => `${esc(p)}[A-Za-z0-9]{6}`),
    ...templ.filter(p => p !== '*-screens-').map(p => `${esc(p)}[^/]*-[A-Za-z0-9]{6}`),
    '[a-z]+-screens-(out|work)-[A-Za-z0-9]{6}',
    // the repo's own naming convention for render / screenshot folders (some were made by one-off agent runs, e.g. hg-as1-)
    'hg-[a-z0-9-]+-[A-Za-z0-9]{6}',
    // temp FILES the repo's scripts write straight into tmpdir (not mkdtemp): france-1.cjs, outreach-sequence.cjs
    'fr1-flags-\\d+\\.md', 'seq-census-\\d+\\.ts',
    // test browsers
    'puppeteer_dev_chrome_profile-[A-Za-z0-9]{6}', 'playwright[^/]*',
    'com\\.google\\.chrome\\.for\\.testing(?:\\.[A-Za-z0-9]{6})?',
    // NOT org.webkit.Playwright / com.apple.WebKit.*+org.webkit.Playwright: macOS creates and protects those (EPERM).
    // emulator / Xcode test scratch: the emulator's temp and its virtual Wi-Fi configs; the XCUITest runner; SwiftPM locks
    // for DerivedData folders that lived in an agent's scratch folder (deleted with it)
    `android-${esc(os.userInfo().username)}`, 'hostapd_\\d+\\.conf', 'com\\.example\\.hguitests\\.xctrunner',
    '_(?:private_)?tmp_claude-\\d+_[^/]*\\.lock',
  ]
  return { re: new RegExp(`^(?:${parts.join('|')})$`), count: literal.length + templ.length }
}

/** Remove harness runs under ROOT not touched for 24 h (skipping any a process has open). Returns { removed, freed }. */
function pruneOldRuns(maxAgeMs = 24 * 3600 * 1000) {
  let freed = 0, removed = 0
  if (!fs.existsSync(ROOT)) return { removed, freed }
  const busy = inUse(ROOT)
  for (const run of fs.readdirSync(ROOT)) {
    const p = path.join(ROOT, run)
    let st; try { st = fs.statSync(p) } catch { continue }
    if (Date.now() - st.mtimeMs < maxAgeMs || busy.has(run)) continue
    freed += sizeOf(p); rm(p); removed++
  }
  return { removed, freed }
}

function main() {
  // 1. Harness runs (the one parent) not touched for 24 h — always, dry run or not (they are the sweep's own).
  const pr = pruneOldRuns()
  if (pr.removed) console.log(`[harness-tmp] removed ${pr.removed} harness run(s) older than 24 h under ${ROOT} (${fmt(pr.freed)})`)
  if (!LEGACY) return
  // 2. The old scattered folders.
  const { re, count } = legacyMatcher()
  const busy = inUse(T)
  const groups = {}, skipped = []
  let lf = 0, ln = 0
  for (const name of fs.readdirSync(T)) {
    if (!re.test(name)) continue
    const p = path.join(T, name)
    if (busy.has(name)) { skipped.push(name); continue }
    const sz = sizeOf(p)
    const g = name.replace(/-[A-Za-z0-9]{6}$/, '').replace(/[-_]?v?\d+[a-z]?$/i, '') || name
    ;(groups[g] = groups[g] || { n: 0, b: 0 }); groups[g].n++; groups[g].b += sz
    if (APPLY && !rm(p)) continue
    lf += sz; ln++
  }
  console.log(`[harness-tmp] ${APPLY ? 'removed' : 'would remove'} ${ln} legacy folder(s) in ${T}: ${fmt(lf)} (${count} repo prefixes)`)
  for (const [g, v] of Object.entries(groups).sort((a, b) => b[1].b - a[1].b).slice(0, 25)) console.log(`   ${fmt(v.b).padStart(10)}  ${String(v.n).padStart(5)}  ${g}`)
  if (failed.length) console.log(`[harness-tmp] could not remove ${failed.length}: ${failed.slice(0, 6).join(', ')}`)
  if (skipped.length) console.log(`[harness-tmp] skipped ${skipped.length} in use: ${skipped.slice(0, 10).join(', ')}`)
  if (!APPLY) console.log('[harness-tmp] dry run — add --apply to delete')
}
if (require.main === module) main()
module.exports = { pruneOldRuns, sizeOf, fmt }
