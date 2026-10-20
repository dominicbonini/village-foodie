#!/usr/bin/env node
// scripts/midnight-events.cjs — EVENTS THAT RUN PAST MIDNIGHT: THE PROOF (docs/midnight-and-format-fixes-report.md).
//
//   node scripts/midnight-events.cjs              capture this tree, then compare with BEFORE and run the midnight checks
//   node scripts/midnight-events.cjs --reuse      the checks only, on the last capture
//   … --areas=engine,customer                    only those areas (a recapture then replaces only their BEFORE files)
//   node scripts/midnight-events.cjs --recapture  BEFORE: a clean `git worktree` of BEFORE_REF, captured TWICE, byte-compared,
//                                                 into scripts/fixtures/midnight-events-before/
//
// ── 🔴 THE METHOD ────────────────────────────────────────────────────────────────────────────────────────────
// One AREA module per group of surfaces (scripts/_midnight-<area>.cjs), each exporting
//   views(ctx) → { '<id>': value }   every id starts 'normal|' (an 11:30–22:45 event) or 'midnight|' (20:00–00:30), then
//                                     '|GB' / '|US' and the moment (scripts/_midnight-fixtures.cjs) — the REAL modules,
//                                     rendered or called on fixtures (Pizza Kitchen; nothing live);
//   checks(t, A, B)                  the rule's assertions on the midnight views (A = this tree, B = BEFORE, for contrast).
// NORMAL views must be BYTE-IDENTICAL to BEFORE (the event never crosses midnight, so nothing may move). MIDNIGHT views
// are not compared with BEFORE (BEFORE refused such an event); each area asserts what the rule requires instead.
// The capture modules are this tree's, copied into BEFORE's worktree — scripts only, never product code.
const fs = require('fs'); const path = require('path'); const zlib = require('zlib'); const os = require('os')
const { execFileSync, spawn } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const argv = process.argv.slice(2)
const arg = n => { const a = argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null }
const BEFORE_REF = '692adb4'   // "private events discovery rows" — the commit this work starts from
const BEFORE_DIR = path.join(REPO, 'scripts/fixtures/midnight-events-before')
const RUN = path.join(REPO, 'node_modules/.cache/midnight-events-run')
const ALL_AREAS = fs.readdirSync(__dirname).filter(f => /^_midnight-[a-z]+\.cjs$/.test(f) && f !== '_midnight-fixtures.cjs').map(f => f.replace(/^_midnight-|\.cjs$/g, '')).sort()
// --areas=a,b limits a run (or a recapture) to those areas; a recapture replaces only their BEFORE files.
const AREAS = arg('areas') ? arg('areas').split(',').filter(a => ALL_AREAS.includes(a)) : ALL_AREAS
// ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): _plans-catalog-fixture.cjs is copied too (the manage area's
// fake database seeds public.plans from it; it returns null in a tree without the plans migration).
const COPY = f => /^(midnight-events\.cjs|_midnight-.*\.cjs|_render-kit\.cjs|_fake-pg\.cjs|_country-settings-gb\.cjs|_lp2-frozen\.cjs|_lp1b-fixtures\.cjs|_lp1d-.*\.cjs|_lp1d2-.*\.cjs|_lp1e-fixtures\.cjs|_slot-interval-compile\.cjs|_png-decode\.cjs|_plans-catalog-fixture\.cjs)$/.test(f)

// ══ internal: --capture-to=<dir> --area=<area> ════════════════════════════════════════════════════════════════
if (arg('capture-to')) {
  const area = arg('area')
  ;(async () => {
    const kit = require('./_render-kit.cjs')({ cacheTag: `midnight-${area}` })
    const FIX = require('./_midnight-fixtures.cjs')
    const views = await require(`./_midnight-${area}.cjs`).views({ kit, REPO, FIX })
    fs.mkdirSync(arg('capture-to'), { recursive: true })
    fs.writeFileSync(path.join(arg('capture-to'), `${area}.json.gz`), zlib.gzipSync(JSON.stringify({ views })))
    const errs = Object.entries(views).filter(([, v]) => typeof v === 'string' && v.startsWith('ERROR')).map(([k, v]) => `${k}: ${v.slice(0, 200)}`)
    console.log(`  ${area}: ${Object.keys(views).length} views${errs.length ? ` — ${errs.length} render errors:\n    ${errs.slice(0, 6).join('\n    ')}` : ''}`)
    process.exit(0)
  })().catch(e => { console.error(e); process.exit(1) })
  return
}

function captureAll(cwd, dir, areas, suffix) {
  fs.mkdirSync(dir, { recursive: true })
  for (const a of areas) fs.rmSync(path.join(dir, `${a}.json.gz`), { force: true })
  return Promise.all(areas.map(area => new Promise((res, rej) => {
    const p = spawn(process.execPath, ['scripts/midnight-events.cjs', `--capture-to=${dir}`, `--area=${area}`], { cwd, env: { ...process.env, HG_KIT_CACHE_SUFFIX: suffix }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    p.stdout.on('data', d => { out += d }); p.stderr.on('data', d => { out += d })
    p.on('close', code => (code === 0 ? res(out.trim()) : rej(new Error(`capture ${area} failed (rc=${code}) in ${cwd}:\n${out.slice(-3000)}`))))
  })))
}
function load(dir, areas) {
  const out = {}
  for (const a of areas) {
    const f = path.join(dir, `${a}.json.gz`)
    if (!fs.existsSync(f)) continue
    for (const [k, v] of Object.entries(JSON.parse(zlib.gunzipSync(fs.readFileSync(f))).views)) out[`${a}/${k}`] = v
  }
  return out
}
const files = d => fs.readdirSync(d).filter(f => f.endsWith('.json.gz')).sort()

;(async () => {
  if (argv.includes('--recapture')) {
    const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'midnight-before-'))
    fs.rmSync(wt, { recursive: true, force: true })
    execFileSync('git', ['worktree', 'add', '--detach', wt, BEFORE_REF], { cwd: REPO, stdio: 'pipe' })
    try {
      fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(wt, 'node_modules'))
      const copied = fs.readdirSync(__dirname).filter(COPY)
      for (const f of copied) fs.copyFileSync(path.join(__dirname, f), path.join(wt, 'scripts', f))
      console.log(`BEFORE worktree ${BEFORE_REF}: ${copied.length} scripts copied in`)
      const tmp = [1, 2].map(i => path.join(os.tmpdir(), `midnight-before-cap-${process.pid}-${AREAS.join('-')}-${i}`))
      for (const [i, d] of tmp.entries()) console.log(`capture ${i + 1}\n${(await captureAll(wt, d, AREAS, 'mnB')).join('\n')}`)
      const fa = files(tmp[0]), fb = files(tmp[1])
      const differ = fa.filter(f => !fb.includes(f) || !fs.readFileSync(path.join(tmp[0], f)).equals(fs.readFileSync(path.join(tmp[1], f))))
      if (differ.length || fa.length !== fb.length) throw new Error(`BEFORE is not deterministic: ${differ.join(', ')}`)
      fs.mkdirSync(BEFORE_DIR, { recursive: true })
      for (const f of fa) fs.copyFileSync(path.join(tmp[0], f), path.join(BEFORE_DIR, f))
      fs.appendFileSync(path.join(BEFORE_DIR, 'CAPTURED.txt'), `${new Date().toISOString()} ${BEFORE_REF} (clean worktree, this tree's capture scripts copied in); captured twice, byte-identical. Areas: ${AREAS.join(', ')}.\n`)
      for (const d of tmp) fs.rmSync(d, { recursive: true, force: true })
      console.log(`✓ BEFORE captured twice, byte-identical → ${path.relative(REPO, BEFORE_DIR)} (${Object.keys(load(BEFORE_DIR, AREAS)).length} views)`)
    } finally { try { execFileSync('git', ['worktree', 'remove', '--force', wt], { cwd: REPO, stdio: 'pipe' }) } catch { /* gone */ } }
    return
  }

  let pass = 0, fail = 0
  const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1200)}` : ''}`) } }
  const missing = AREAS.filter(a => !fs.existsSync(path.join(BEFORE_DIR, `${a}.json.gz`)))
  if (missing.length) { console.log(`✗ no BEFORE for ${missing.join(', ')} — run node scripts/midnight-events.cjs --recapture`); process.exit(1) }
  const t0 = Date.now()
  if (!argv.includes('--reuse')) console.log(`captured AFTER\n${(await captureAll(REPO, RUN, AREAS, 'mnA')).join('\n')}`)
  const B = load(BEFORE_DIR, AREAS), A = load(RUN, AREAS)
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y)
  const firstDiff = (x, y) => { const a = JSON.stringify(x) ?? 'undefined', b = JSON.stringify(y) ?? 'undefined'; let i = 0; while (i < a.length && a[i] === b[i]) i++; return `@${i}: BEFORE …${a.slice(Math.max(0, i - 120), i + 160)}\n        AFTER  …${b.slice(Math.max(0, i - 120), i + 160)}` }
  for (const area of AREAS) {
    console.log(`\n── ${area}`)
    const ids = Object.keys(A).filter(k => k.startsWith(`${area}/`))
    const errs = ids.filter(k => typeof A[k] === 'string' && A[k].startsWith('ERROR'))
    t(`${area}: every view rendered`, errs.length === 0, errs.slice(0, 6).map(k => `${k}: ${A[k]}`).join('\n      '))
    const normal = ids.filter(k => k.slice(area.length + 1).startsWith('normal|'))
    const mod = require(`./_midnight-${area}.cjs`)
    const pick = o => Object.fromEntries(Object.entries(o).filter(([k]) => k.startsWith(`${area}/`)).map(([k, v]) => [k.slice(area.length + 1), v]))
    // A NAMED change (an area's `named(id, before, B)`, MIDNIGHT FOLLOW-UPS 17 October 2026): the normal view must equal
    // BEFORE with exactly that transform applied — computed from the rule, never from AFTER. Unnamed views: BEFORE itself.
    const pB = pick(B)
    const expectOf = k => { const id = k.slice(area.length + 1); return mod.named ? mod.named(id, B[k], pB) : B[k] }
    const named = normal.filter(k => mod.named && !same(expectOf(k), B[k]))
    const diff = normal.filter(k => !same(A[k], expectOf(k)))
    t(`${area}: the normal event is byte-identical to BEFORE (${normal.length} views, GB and US${named.length ? `; ${named.length} equal to BEFORE + a named change` : ''})`, normal.length > 0 && diff.length === 0, diff.slice(0, 3).map(k => `${k}\n        ${firstDiff(expectOf(k), A[k])}`).join('\n      '))
    if (mod.checks) await mod.checks(t, pick(A), pick(B))
  }
  console.log(`\n${fail ? '✗' : '✓'} midnight-events: ${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  if (fail) process.exit(1)
})().catch(e => { console.error(e); process.exit(1) })
