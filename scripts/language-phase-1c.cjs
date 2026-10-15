#!/usr/bin/env node
// scripts/language-phase-1c.cjs — Language Phase 1c (docs/language-phase-1c-report.md): the onboarding words — the
// setup wizard, signup, login, password and verify pages, the demo flow, go-live checks, the walkthrough, the signup
// and auth emails, and the routes behind them — move into messages/en-GB.json with NO visible change, for GB and for
// US (messages/en-US.json stays {}). The rows a demo and a new truck are provisioned with stay byte-identical.
//
//   node scripts/language-phase-1c.cjs                         compare every area against its BEFORE snapshot
//   node scripts/language-phase-1c.cjs --only=dashboard,kds    …only those areas
//   node scripts/language-phase-1c.cjs --recapture=dashboard   capture BEFORE for those areas FROM A CLEAN git worktree
//                                                              of the Step 0 commit (never from edited code)
//
// ── 🔴 THE METHOD ─────────────────────────────────────────────────────────────────────────────────────────
// One module per AREA, scripts/_lp1c-<area>.cjs, exports `views(ctx)` → { key: value } (full HTML, ticket bytes,
// email subject/HTML/text, push payloads, response bodies…). BEFORE for each area is
// scripts/fixtures/language-phase-1c-before/<area>.json.gz, captured by running these same modules inside a clean
// `git worktree` of the Step 0 commit (BEFORE_REF in scripts/_lp1c-fixtures.cjs) — so BEFORE is always the code as
// committed, whichever fixtures were added later. Captured twice and compared: deterministic.
// AFTER: every view byte-identical, unless the area's module names a difference and proves it (`compare`), as the
// `api` area does for named difference 1 (onboarding API refusals gain "code" and "params").
// A module may also give a fixture state `__after: {…}` — applied only when the AFTER code exists — so a state an
// effect now holds as a CODE is proven to render exactly the sentence it held BEFORE.
const fs = require('fs'); const path = require('path'); const zlib = require('zlib'); const os = require('os')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const FIX = require('./_lp1c-fixtures.cjs')
const AREAS = ['setup', 'auth', 'demo', 'goLive', 'api']
const argv = process.argv.slice(2)
const arg = n => { const a = argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null }
const ONLY = (arg('only') || arg('recapture') || AREAS.join(',')).split(',').filter(Boolean)
const RECAPTURE = arg('recapture') != null
const CAPTURE_TO = arg('capture-to')            // internal: used by --recapture inside the worktree
const BEFORE_DIR = path.join(REPO, 'scripts/fixtures/language-phase-1c-before')
// The AFTER code is the code with the one error-body helper (lib/i18n/error-body.ts), which BEFORE_REF does not have.
const AFTER_CODE = fs.existsSync(path.join(REPO, 'lib/i18n/error-body.ts'))
for (const a of ONLY) if (!AREAS.includes(a)) { console.error(`unknown area "${a}" — one of ${AREAS.join(', ')}`); process.exit(2) }

// ── --recapture: a clean worktree of the Step 0 commit, these harness files copied in, capture, remove ──
if (RECAPTURE) {
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'lp1c-before-'))
  fs.rmSync(wt, { recursive: true, force: true })
  execFileSync('git', ['worktree', 'add', '--detach', wt, FIX.BEFORE_REF], { cwd: REPO, stdio: 'pipe' })
  try {
    fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(wt, 'node_modules'))
    for (const f of fs.readdirSync(path.join(REPO, 'scripts')).filter(f => f === 'language-phase-1c.cjs' || /^_lp1c-.*\.cjs$/.test(f)))
      fs.copyFileSync(path.join(REPO, 'scripts', f), path.join(wt, 'scripts', f))
    const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: wt, encoding: 'utf8' }).trim()
    if (dirty) throw new Error(`the BEFORE worktree is not clean:\n${dirty}`)
    fs.mkdirSync(BEFORE_DIR, { recursive: true })
    const out = execFileSync('node', ['scripts/language-phase-1c.cjs', `--only=${ONLY.join(',')}`, `--capture-to=${BEFORE_DIR}`], { cwd: wt, encoding: 'utf8', maxBuffer: 1 << 26 })
    process.stdout.write(out)
  } finally {
    try { execFileSync('git', ['worktree', 'remove', '--force', wt], { cwd: REPO, stdio: 'pipe' }) } catch { /* already gone */ }
  }
  process.exit(0)
}

// ── a frozen clock and zone: "12m late", "today" and printed times are the same on every run ──
process.env.TZ = 'Europe/London'

function diffJson(a, b, p = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { const d = diffJson(a[k], b[k], `${p}.${k}`); if (d) return d }
  }
  if (typeof a === 'string' && typeof b === 'string') {
    let i = 0; while (i < a.length && a[i] === b[i]) i++
    return `${p} @${i}: BEFORE …${JSON.stringify(a.slice(Math.max(0, i - 90), i + 110))}\n        AFTER  …${JSON.stringify(b.slice(Math.max(0, i - 90), i + 110))}`
  }
  return `${p}: BEFORE ${JSON.stringify(a)?.slice(0, 300)} · AFTER ${JSON.stringify(b)?.slice(0, 300)}`
}

;(async () => {
  let pass = 0, fail = 0
  const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 900)}` : ''}`) } }
  const head = s => console.log(`\n── ${s}`)
  for (const area of ONLY) {
    const kit = require('./_render-kit.cjs')({ cacheTag: `lp1c-${area}` })
    kit.setNow(FIX.NOW); kit.setDeviceTz('Europe/London')
    /** Full HTML of `el` rendered from `state` (useState patches read globalThis.__ms) at `search`. Never throws. */
    const html = (state, el, search) => {
      globalThis.__ms = AFTER_CODE && state && state.__after ? { ...state, ...state.__after } : state
      if (search != null) globalThis.__msSearch = search
      try { return kit.quiet(() => kit.renderStatic(el)) } catch (e) { return 'ERROR ' + String(e && e.message || e).slice(0, 300) }
      finally { delete globalThis.__ms; delete globalThis.__msSearch }
    }
    const ctx = { kit, h: kit.h, html, FIX, GB: FIX.country('GB'), US: FIX.country('US'), AFTER: AFTER_CODE, REPO, t, head, diffJson,
      read: f => fs.readFileSync(path.join(REPO, f), 'utf8') }
    const mod = require(`./_lp1c-${area}.cjs`)
    const views = await mod.views(ctx)
    if (CAPTURE_TO) {
      fs.writeFileSync(path.join(CAPTURE_TO, `${area}.json.gz`), zlib.gzipSync(JSON.stringify({ captured_on: `${FIX.BEFORE_REF} (clean worktree)`, views })))
      const errs = Object.entries(views).filter(([, v]) => typeof v === 'string' && v.startsWith('ERROR')).map(([k]) => k)
      console.log(`  ${area}: ${Object.keys(views).length} views${errs.length ? ` — ${errs.length} render errors: ${errs.slice(0, 8).join(', ')}` : ''}`)
      continue
    }
    const file = path.join(BEFORE_DIR, `${area}.json.gz`)
    if (!fs.existsSync(file)) { t(`${area}: a BEFORE snapshot exists (run --recapture=${area})`, false); continue }
    const before = JSON.parse(zlib.gunzipSync(fs.readFileSync(file))).views
    head(`${area} · byte-identical to BEFORE (GB and US)${mod.compare ? ', apart from the named difference' : ''}`)
    for (const k of Object.keys(before)) {
      if (!(k in views)) { t(`${area} · ${k}: still rendered`, false); continue }
      if (mod.compare && mod.compare(k, before[k], views[k], ctx)) continue   // the module proved (or failed) this view itself
      const d = diffJson(before[k], views[k]); t(`${area} · ${k}`, d === null, d)
    }
    if (AFTER_CODE && mod.after) await mod.after({ ...ctx, before, views })
  }
  if (CAPTURE_TO) return
  console.log(`\n${fail ? '✗' : '✓'} language-phase-1c: ${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
})().catch(e => { console.error(e); process.exit(1) })
