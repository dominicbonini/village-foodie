#!/usr/bin/env node
// scripts/language-phase-2.cjs — Language Phase 2 (docs/language-phase-2-report.md): US English for the customer,
// kitchen and onboarding surfaces, plus the wrong-English fixes. THE PROOF.
//
//   node scripts/language-phase-2.cjs                 capture F and A on this tree (in parallel), then every check
//   node scripts/language-phase-2.cjs --reuse         the checks only, on the last F and A captures (fast iteration)
//   node scripts/language-phase-2.cjs --only=gb,us,words,tickets,keys      only those sections
//   node scripts/language-phase-2.cjs --recapture     BEFORE, from a clean `git worktree` of 460ba55 — captured TWICE
//                                                     and byte-compared — into scripts/fixtures/language-phase-2-before/
//   node scripts/language-phase-2.cjs --write-gb-named   write scripts/fixtures/language-phase-2-gb-named.json from the
//                                                     actual en-GB diff (then the list and the code cannot disagree)
//
// ── 🔴 THE METHOD ─────────────────────────────────────────────────────────────────────────────────────────────
// Every view Phase 1a, 1b and 1c render (pages as full HTML, emails as subject/HTML/text, tickets as BYTES, API bodies,
// provisioned rows — GB and US fixtures), plus Phase 2's own (scripts/_lp2-extra.cjs: pre-order labels, the "Sept"
// surfaces, demo and new-truck provisioning per country), captured three ways with the harnesses' own capture modes:
//   BEFORE  460ba55 (the Step 0 commit), in a clean worktree with only these scripts copied in;
//   F       THIS code with the BEFORE words (HG_MESSAGES_FROZEN = scripts/fixtures/language-phase-2-messages-before.json,
//           scripts/_lp2-frozen.cjs) — what the CODE changed;
//   A       THIS code with THIS tree's words (from the authored messages/*.json, HG_MESSAGES_SOURCE=1, so a stale
//           split never hides a word) — what a person will see.
// GB  · F === BEFORE in every view, except the NAMED code changes (scripts/_lp2-named.cjs), each proven to be the
//       only difference in its view;  A vs F: every difference is a changed en-GB key's own word change (word-level
//       hunks, ICU variants and placeholders understood), and the changed keys are exactly
//       scripts/fixtures/language-phase-2-gb-named.json.
// US  · F === BEFORE except the named Part 2 changes (precise, or LISTED);  A vs BEFORE: every changed view listed in
//       scripts/fixtures/language-phase-2-us-changed.txt;  THE US-WORDS CHECK on every A(US) view;  every US ticket's
//       bytes fit 32 / 48 columns (double width counted) and are plain ASCII.
const fs = require('fs'); const path = require('path'); const zlib = require('zlib'); const os = require('os')
const { execFileSync, spawn } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const argv = process.argv.slice(2)
const arg = n => { const a = argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null }
const BEFORE_REF = '460ba55'
const BEFORE_DIR = path.join(REPO, 'scripts/fixtures/language-phase-2-before')
const FROZEN = 'scripts/fixtures/language-phase-2-messages-before.json'
const GB_NAMED_FILE = path.join(REPO, 'scripts/fixtures/language-phase-2-gb-named.json')
const US_CHANGED_FILE = path.join(REPO, 'scripts/fixtures/language-phase-2-us-changed.txt')
const RUNS = path.join(REPO, 'node_modules/.cache/lp2-runs')
const SECTIONS = (arg('only') || 'gb,us,words,tickets,keys').split(',')
/** The scripts a capture needs, copied into the BEFORE worktree. Scripts only — never product code. */
const CAPTURE_SCRIPTS = f => /^(language-phase-1[abc]\.cjs|language-phase-2\.cjs|_lp1[bc]-.*\.cjs|_lp2-.*\.cjs|_render-kit\.cjs|_fake-pg\.cjs|_country-settings-gb\.cjs|_language-phase-1a-after\.cjs)$/.test(f)

// ══ internal: --capture-extra=<dir> — Phase 2's own views, on whatever code this file sits in ══════════════════
if (arg('capture-extra')) {
  process.env.TZ = 'Europe/London'
  const FIX = require('./_lp1b-fixtures.cjs')
  ;(async () => {
    const kit = require('./_render-kit.cjs')({ cacheTag: 'lp2-extra' })
    kit.setNow(FIX.NOW); kit.setDeviceTz('Europe/London')
    const html = (state, el) => {
      globalThis.__ms = state
      try { return kit.quiet(() => kit.renderStatic(el)) } catch (e) { return 'ERROR ' + String(e && e.message || e).slice(0, 300) } finally { delete globalThis.__ms }
    }
    const ctx = { kit, h: kit.h, html, FIX, GB: FIX.country('GB'), US: FIX.country('US'), REPO, read: f => fs.readFileSync(path.join(REPO, f), 'utf8') }
    const views = await require('./_lp2-extra.cjs').views(ctx)
    fs.mkdirSync(arg('capture-extra'), { recursive: true })
    fs.writeFileSync(path.join(arg('capture-extra'), 'extra.json.gz'), zlib.gzipSync(JSON.stringify({ views })))
    const errs = Object.entries(views).filter(([, v]) => typeof v === 'string' && v.startsWith('ERROR')).map(([k]) => k)
    console.log(`  extra: ${Object.keys(views).length} views${errs.length ? ` — ${errs.length} render errors: ${errs.slice(0, 8).join(', ')}` : ''}`)
  })().catch(e => { console.error(e); process.exit(1) })
  return
}

// ══ capturing ═════════════════════════════════════════════════════════════════════════════════════════════
/** Runs the four captures in parallel in `cwd`, into `dir`, with `env` (the switch). Resolves to the outputs. */
function captureAll(cwd, dir, env) {
  fs.rmSync(dir, { recursive: true, force: true })
  for (const d of ['1b', '1c', '2']) fs.mkdirSync(path.join(dir, d), { recursive: true })
  const jobs = [
    ['1a', ['scripts/language-phase-1a.cjs', '--capture', path.join(dir, '1a.json.gz')]],
    ['1b', ['scripts/language-phase-1b.cjs', `--capture-to=${path.join(dir, '1b')}`]],
    ['1c', ['scripts/language-phase-1c.cjs', `--capture-to=${path.join(dir, '1c')}`]],
    ['2', ['scripts/language-phase-2.cjs', `--capture-extra=${path.join(dir, '2')}`]],
  ]
  return Promise.all(jobs.map(([name, args]) => new Promise((res, rej) => {
    const p = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    p.stdout.on('data', d => { out += d }); p.stderr.on('data', d => { out += d })
    p.on('close', code => (code === 0 ? res(`[${name}] ${out.trim().split('\n').join(`\n[${name}] `)}`) : rej(new Error(`capture ${name} failed (rc=${code}) in ${cwd}:\n${out.slice(-3000)}`))))
  })))
}
const switchEnv = which => {
  const e = { HG_KIT_CACHE_SUFFIX: `lp2${which}` }
  if (which === 'F') return { ...e, HG_MESSAGES_FROZEN: path.join(REPO, FROZEN), HG_MESSAGES_SOURCE: '' }
  if (which === 'A') return { ...e, HG_MESSAGES_FROZEN: 'off', HG_MESSAGES_SOURCE: '1' }
  return { ...e, HG_MESSAGES_FROZEN: 'off', HG_MESSAGES_SOURCE: '' }
}
/** A capture directory → { viewId: value }. */
function load(dir) {
  const out = {}
  const gz = f => JSON.parse(zlib.gunzipSync(fs.readFileSync(f)))
  const a = gz(path.join(dir, '1a.json.gz')).views
  for (const [sec, vs] of Object.entries(a)) for (const [k, v] of Object.entries(vs)) {
    // `emails.sent` is the GB senders' nine emails then the US senders' nine (language-phase-1a.cjs): one view each.
    if (sec === 'emails' && k === 'sent' && Array.isArray(v)) { const n = v.length / 2; v.forEach((x, i) => { out[`1a/emails/sent|${i < n ? 'GB' : 'US'}|${i % n}`] = x }); continue }
    out[`1a/${sec}/${k}`] = v
  }
  for (const s of ['1b', '1c']) for (const f of fs.readdirSync(path.join(dir, s)).filter(f => f.endsWith('.json.gz')).sort()) {
    for (const [k, v] of Object.entries(gz(path.join(dir, s, f)).views)) out[`${s}/${f.replace('.json.gz', '')}/${k}`] = v
  }
  for (const [k, v] of Object.entries(gz(path.join(dir, '2', 'extra.json.gz')).views)) out[`2/extra/${k}`] = v
  return out
}
function filesIn(dir) { const out = []; const w = d => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) w(p); else out.push(path.relative(dir, p)) } }; w(dir); return out.sort() }

;(async () => {
  // ══ --recapture: BEFORE from a clean worktree of 460ba55, twice, byte-compared ═══════════════════════════════
  if (argv.includes('--recapture')) {
    const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'lp2-before-'))
    fs.rmSync(wt, { recursive: true, force: true })
    execFileSync('git', ['worktree', 'add', '--detach', wt, BEFORE_REF], { cwd: REPO, stdio: 'pipe' })
    try {
      fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(wt, 'node_modules'))
      const copied = fs.readdirSync(path.join(REPO, 'scripts')).filter(CAPTURE_SCRIPTS)
      for (const f of copied) fs.copyFileSync(path.join(REPO, 'scripts', f), path.join(wt, 'scripts', f))
      const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: wt, encoding: 'utf8' }).split('\n').filter(Boolean)
      const stray = dirty.filter(l => !copied.includes(path.basename(l.slice(3))) || !l.slice(3).startsWith('scripts/'))
      if (stray.length) throw new Error(`the BEFORE worktree has changes other than the copied scripts:\n${stray.join('\n')}`)
      console.log(`BEFORE worktree ${BEFORE_REF}: ${copied.length} scripts copied in; tracked files changed: ${dirty.map(l => l.slice(3)).join(', ') || 'none'} (scripts only)`)
      const tmp = [1, 2].map(i => path.join(os.tmpdir(), `lp2-before-cap-${process.pid}-${i}`))
      for (const [i, dir] of tmp.entries()) {
        const t0 = Date.now()
        const logs = await captureAll(wt, dir, switchEnv('BEFORE'))
        console.log(`capture ${i + 1} (${((Date.now() - t0) / 1000).toFixed(1)}s)\n${logs.join('\n')}`)
      }
      const fa = filesIn(tmp[0]), fb = filesIn(tmp[1])
      const differ = fa.filter(f => !fb.includes(f) || !fs.readFileSync(path.join(tmp[0], f)).equals(fs.readFileSync(path.join(tmp[1], f))))
      if (differ.length || fa.length !== fb.length) {
        const A = load(tmp[0]), B = load(tmp[1])
        const ids = Object.keys(A).filter(k => JSON.stringify(A[k]) !== JSON.stringify(B[k]))
        throw new Error(`BEFORE is NOT deterministic: ${differ.join(', ')} differ between two captures — views: ${ids.slice(0, 20).join(', ')}`)
      }
      fs.rmSync(BEFORE_DIR, { recursive: true, force: true })
      fs.cpSync(tmp[0], BEFORE_DIR, { recursive: true })
      fs.writeFileSync(path.join(BEFORE_DIR, 'CAPTURED.txt'), `${BEFORE_REF} (clean worktree, scripts copied in: ${copied.join(' ')}). Captured twice; ${fa.length} files byte-identical.\n`)
      for (const d of tmp) fs.rmSync(d, { recursive: true, force: true })
      console.log(`✓ BEFORE captured twice, ${fa.length} files byte-identical → ${path.relative(REPO, BEFORE_DIR)} (${Object.keys(load(BEFORE_DIR)).length} views)`)
    } finally {
      try { execFileSync('git', ['worktree', 'remove', '--force', wt], { cwd: REPO, stdio: 'pipe' }) } catch { /* already gone */ }
    }
    return
  }

  // ══ --write-gb-named ═════════════════════════════════════════════════════════════════════════════════════════
  const LP2 = require('./_lp2-frozen.cjs')
  if (argv.includes('--write-gb-named')) {
    const diff = LP2.gbKeyDiff()
    fs.writeFileSync(GB_NAMED_FILE, JSON.stringify(diff, null, 2) + '\n')
    console.log(`wrote ${path.relative(REPO, GB_NAMED_FILE)}: ${Object.keys(diff).length} en-GB keys changed since ${BEFORE_REF}`)
    return
  }

  // ══ AFTER: F and A, captured in parallel (or reused) ═════════════════════════════════════════════════════════
  let pass = 0, fail = 0
  const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 1200)}` : ''}`) } }
  const head = s => console.log(`\n── ${s}`)
  if (!fs.existsSync(path.join(BEFORE_DIR, '1a.json.gz'))) { console.log(`✗ no BEFORE — run node scripts/language-phase-2.cjs --recapture`); process.exit(1) }
  const t0 = Date.now()
  if (!argv.includes('--reuse')) {
    const [f, a] = await Promise.all([captureAll(REPO, path.join(RUNS, 'F'), switchEnv('F')), captureAll(REPO, path.join(RUNS, 'A'), switchEnv('A'))])
    console.log(`captured F and A in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    for (const l of [...f, ...a].join('\n').split('\n').filter(l => /render errors/.test(l))) console.log(`  ⚠️ ${l}`)
  } else console.log('--reuse: the last F and A captures (node_modules/.cache/lp2-runs)')
  const BEFORE = load(BEFORE_DIR), F = load(path.join(RUNS, 'F')), A = load(path.join(RUNS, 'A'))
  const ids = Object.keys(BEFORE)
  const isUS = id => id.split('/').slice(2).join('/').split('|').includes('US')
  const area = id => id.split('/').slice(0, 2).join('/')
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y)
  const firstDiff = (x, y) => {
    const a = typeof x === 'string' ? x : JSON.stringify(x), b = typeof y === 'string' ? y : JSON.stringify(y)
    let i = 0; while (i < a.length && a[i] === b[i]) i++
    return `@${i}: BEFORE …${JSON.stringify(a.slice(Math.max(0, i - 100), i + 120))}\n        AFTER  …${JSON.stringify(b.slice(Math.max(0, i - 100), i + 120))}`
  }
  head(`views: BEFORE ${ids.length} · F ${Object.keys(F).length} · A ${Object.keys(A).length} (GB ${ids.filter(i => !isUS(i)).length}, US ${ids.filter(isUS).length})`)
  for (const id of ids) { if (!(id in F)) t(`${id}: still rendered (F)`, false); if (!(id in A)) t(`${id}: still rendered (A)`, false) }
  const newViews = Object.keys(A).filter(id => !(id in BEFORE))
  if (newViews.length) console.log(`  ${newViews.length} view(s) exist only AFTER (not compared with BEFORE; the US-words and ticket checks still read them): ${newViews.slice(0, 10).join(', ')}${newViews.length > 10 ? ' …' : ''}`)
  const split = (() => { try { execFileSync(process.execPath, ['scripts/split-messages.cjs', '--check'], { cwd: REPO, stdio: 'pipe' }); return null } catch (e) { return String(e.stdout || e.message).trim() } })()
  t('the generated per-namespace catalogue matches messages/*.json (A reads the authored files either way; this is what the build ships)', split === null, split)

  const checks = require('./_lp2-checks.cjs')
  const ctx = { t, head, BEFORE, F, A, ids, isUS, area, same, firstDiff, LP2, REPO, SECTIONS, GB_NAMED_FILE, US_CHANGED_FILE, argv }
  await checks.run(ctx)
  console.log(`\n${fail ? '✗' : '✓'} language-phase-2: ${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  if (fail) process.exit(1)
})().catch(e => { console.error(e); process.exit(1) })
