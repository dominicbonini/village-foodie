#!/usr/bin/env node
// scripts/language-phase-1d2.cjs — Language Phase 1d PART 2: the rest of Manage — Payments, Billing, Reports (and its
// CSV), Team, Social posts (SocialPosts, EventPost, PostShareBar, LivePoster, WeeklyPost, DesignEditor, FontPicker), the
// POSTERS (lib/weekly-post/* drawn words, caption defaults, the QR poster), WhatsApp settings, custom domain, account
// deletion and the Manage SHELL — move into the message files, with their US words, US behaviour and the wrong-English
// fixes. THE PROOF. Part 1's method (scripts/language-phase-1d.cjs, docs/language-phase-1d-part1-report.md §5), extended.
//
//   node scripts/language-phase-1d2.cjs                 capture F and A on this tree (in parallel), then every check
//   node scripts/language-phase-1d2.cjs --reuse         the checks only, on the last F and A captures (fast iteration)
//   node scripts/language-phase-1d2.cjs --only=gb,keys,us,words,smoke,api,legal,bytes,literals   only those sections
//   node scripts/language-phase-1d2.cjs --areas=reports,api                            capture/compare only those areas
//   node scripts/language-phase-1d2.cjs --recapture     BEFORE, from a clean `git worktree` of 826471a — captured TWICE and
//                                                      byte-compared — into scripts/fixtures/language-phase-1d2-before/
//   node scripts/language-phase-1d2.cjs --write-gb-named   write scripts/fixtures/language-phase-1d2-gb-named.json from the
//                                                      actual en-GB diff (F's words → A's words)
//
// ── 🔴 THE METHOD ────────────────────────────────────────────────────────────────────────────────────────────
// Every view of the in-scope surfaces, rendered from fixtures for a GB truck (Pizza Kitchen) and a US truck (USD,
// 12-hour, month-day-year, SUNDAY weeks, US address style) — scripts/_lp1d2-<area>.cjs, one module per AREA:
//   shell     ManagePage's shell (tab bar, header, banners, notices, loading / error), BillingTab, TeamTab
//   reports   ReportsTab (every breakdown, filters, empty) and the REPORTS CSV as BYTES
//   payments  PaymentsTab, ChargesCard, TakingPaymentPanel (connected / not, every state)
//   social    SocialPosts (list / editor states), EventPost, PostShareBar, LivePoster, WeeklyPost, DesignEditor and its
//             bits, FontPicker, DraggableBox
//   poster    the POSTERS AS RENDER SOURCE (the element tree satori is handed — every drawn string — for a week with an
//             open day, a day off, a cancelled event, a private event, the default heading and a STORED heading; event
//             posts; captions from the defaults and from a stored template; the QR poster) and lib/copy/{socialPosts,
//             weeklyPost} outputs
//   wada      Settings' Auto-replies and Account deletion sections, WhatsAppReplyPreview / SetupControl,
//             DeleteAccountSection, CustomDomainSetup and CopyButton, the custom-domain instructions email (rendered,
//             never sent)
//   api       every in-scope refusal and success: update_charges, domain_*, save_embed_setup, get_embed_status,
//             disconnect_whatsapp, team actions, get_report, get_recent_events, sg_place_usual_type, sg_merge_place, the
//             reply-limit refusal, the GET's refusals, app/api/weekly-post, whatsapp-preview / whatsapp-signup — status,
//             body and every write to the fake database
//   smoke     OUT OF SCOPE: Part 1's tabs (Menu, Schedule, Settings' other sections) and the dashboard — which must not
//             change in A vs F (GB), except named shared fixes
// captured three ways (the switch is scripts/_lp2-frozen.cjs, pair mode + BOTH as-moved overlays):
//   BEFORE  826471a (the Step 0 commit), in a clean worktree with only these scripts copied in;
//   F       THIS code with the 826471a words: HG_MESSAGES_FROZEN = the PAIR
//           scripts/fixtures/language-phase-1d2-messages-before.{en-GB,en-US}.json, with every GB wrong-English fix set
//           back to its AS-MOVED text (scripts/fixtures/language-phase-1d2-gb-moved.json, and Part 1's) — what the CODE
//           changed;
//   A       THIS code with THIS tree's words (the authored messages/*.json, HG_MESSAGES_SOURCE=1).
// GB  · F === BEFORE except NAMED DIFFERENCE 1 (an API refusal gains `code` and `params`, last; proven per field) and
//       the NAMED code changes (scripts/_lp1d2-named.cjs); A vs F: every word difference is a changed en-GB key's own
//       change, and the changed keys are exactly scripts/fixtures/language-phase-1d2-gb-named.json. The Reports CSV and
//       the poster render source are views like any other, so they are byte-identical except named — and reported apart.
// US  · F === BEFORE except named difference 1 and the named US code changes; A vs BEFORE: every changed view listed with
//       its cause in scripts/fixtures/language-phase-1d2-us-changed.txt; THE US-WORDS CHECK (Phase 2's and Part 1's lists,
//       extended) on every in-scope A(US) view; LEGAL keys have NO en-US override.
// 🔴 EVERY VIEW RUNS ON BOTH CODES (826471a and this tree).
const fs = require('fs'); const path = require('path'); const zlib = require('zlib'); const os = require('os')
const { execFileSync, spawn } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const argv = process.argv.slice(2)
const arg = n => { const a = argv.find(x => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null }
const BEFORE_REF = '826471a'
const BEFORE_DIR = path.join(REPO, 'scripts/fixtures/language-phase-1d2-before')
const FROZEN_GB = 'scripts/fixtures/language-phase-1d2-messages-before.en-GB.json'
const GB_NAMED_FILE = path.join(REPO, 'scripts/fixtures/language-phase-1d2-gb-named.json')
const US_CHANGED_FILE = path.join(REPO, 'scripts/fixtures/language-phase-1d2-us-changed.txt')
const RUNS = path.join(REPO, 'node_modules/.cache/lp1d2-runs')
const ALL_AREAS = ['shell', 'reports', 'payments', 'social', 'poster', 'wada', 'api', 'smoke-menu', 'smoke-schedule', 'smoke-settings', 'smoke-copy', 'smoke-api', 'smoke-dash']
const AREAS = (arg('areas') || ALL_AREAS.join(',')).split(',').filter(Boolean)
const SECTIONS = (arg('only') || 'gb,keys,us,words,smoke,api,legal,bytes,literals').split(',')
/** The scripts a capture needs, copied into the BEFORE worktree. Scripts only — never product code. */
const CAPTURE_SCRIPTS = f => /^(language-phase-1d2\.cjs|_lp1d2-.*\.cjs|_lp1d-.*\.cjs|_lp1b-.*\.cjs|_lp2-named\.cjs|_lp2-checks\.cjs|_png-decode\.cjs|_slot-interval-compile\.cjs|_lp1b-fixtures\.cjs|_render-kit\.cjs|_lp2-frozen\.cjs|_lp2-text\.cjs|_fake-pg\.cjs|_country-settings-gb\.cjs)$/.test(f)
for (const a of AREAS) if (!ALL_AREAS.includes(a)) { console.error(`unknown area "${a}" — one of ${ALL_AREAS.join(', ')}`); process.exit(2) }

// ══ internal: --capture-to=<dir> --area=<area> — one area's views, on whatever code this file sits in ═════════════
if (arg('capture-to')) {
  process.env.TZ = 'Europe/London'
  const area = arg('area')
  const FIX = require('./_lp1d2-fixtures.cjs')
  ;(async () => {
    const kit = require('./_render-kit.cjs')({ cacheTag: `lp1d2-${area}` })
    kit.setNow(FIX.NOW); kit.setDeviceTz('Europe/London')
    const ctx = FIX.context(kit, REPO)
    const [modName, part] = area.split('-')
    const views = await require(`./_lp1d2-${modName}.cjs`).views(ctx, part)
    fs.mkdirSync(arg('capture-to'), { recursive: true })
    fs.writeFileSync(path.join(arg('capture-to'), `${area}.json.gz`), zlib.gzipSync(JSON.stringify({ views })))
    const errs = Object.entries(views).filter(([, v]) => typeof v === 'string' && v.startsWith('ERROR')).map(([k]) => k)
    console.log(`  ${area}: ${Object.keys(views).length} views${errs.length ? ` — ${errs.length} render errors: ${errs.slice(0, 8).join(', ')}` : ''}`)
    if (ctx.skipped.length) console.log(`  ${area}: state names not in this code (skipped): ${[...new Set(ctx.skipped)].join(', ')}`)
  })().catch(e => { console.error(e); process.exit(1) })
  return
}

// ══ capturing ═════════════════════════════════════════════════════════════════════════════════════════════
/** Captures every area in parallel in `cwd`, into `dir`, with `env` (the switch). Resolves to the logs. */
function captureAll(cwd, dir, env, areas = AREAS) {
  fs.mkdirSync(dir, { recursive: true })
  for (const a of areas) fs.rmSync(path.join(dir, `${a}.json.gz`), { force: true })
  return Promise.all(areas.map(area => new Promise((res, rej) => {
    const p = spawn(process.execPath, ['scripts/language-phase-1d2.cjs', `--capture-to=${dir}`, `--area=${area}`], { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    p.stdout.on('data', d => { out += d }); p.stderr.on('data', d => { out += d })
    p.on('close', code => (code === 0 ? res(out.trim()) : rej(new Error(`capture ${area} failed (rc=${code}) in ${cwd}:\n${out.slice(-3000)}`))))
  })))
}
const switchEnv = which => {
  const e = { HG_KIT_CACHE_SUFFIX: `lp1d2${which}` }
  if (which === 'F') return { ...e, HG_MESSAGES_FROZEN: path.join(REPO, FROZEN_GB), HG_MESSAGES_SOURCE: '', HG_MESSAGES_MOVED: '' }
  if (which === 'A') return { ...e, HG_MESSAGES_FROZEN: 'off', HG_MESSAGES_SOURCE: '1' }
  return { ...e, HG_MESSAGES_FROZEN: 'off', HG_MESSAGES_SOURCE: '' }
}
/** A capture directory → { 'area/viewKey': value }. */
function load(dir, areas = AREAS) {
  const out = {}
  for (const a of areas) {
    const f = path.join(dir, `${a}.json.gz`)
    if (!fs.existsSync(f)) continue
    for (const [k, v] of Object.entries(JSON.parse(zlib.gunzipSync(fs.readFileSync(f))).views)) out[`${a}/${k}`] = v
  }
  return out
}
function filesIn(dir) { return fs.readdirSync(dir).filter(f => f.endsWith('.json.gz')).sort() }

;(async () => {
  // ══ --recapture: BEFORE from a clean worktree of 826471a, twice, byte-compared ═══════════════════════════════
  if (argv.includes('--recapture')) {
    const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'lp1d2-before-'))
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
      const tmp = [1, 2].map(i => path.join(os.tmpdir(), `lp1d2-before-cap-${process.pid}-${i}`))
      for (const [i, dir] of tmp.entries()) {
        const t0 = Date.now()
        const logs = await captureAll(wt, dir, switchEnv('BEFORE'), AREAS)
        console.log(`capture ${i + 1} (${((Date.now() - t0) / 1000).toFixed(1)}s)\n${logs.join('\n')}`)
      }
      const fa = filesIn(tmp[0]), fb = filesIn(tmp[1])
      const differ = fa.filter(f => !fb.includes(f) || !fs.readFileSync(path.join(tmp[0], f)).equals(fs.readFileSync(path.join(tmp[1], f))))
      if (differ.length || fa.length !== fb.length) {
        const A = load(tmp[0]), B = load(tmp[1])
        const ids = Object.keys(A).filter(k => JSON.stringify(A[k]) !== JSON.stringify(B[k]))
        throw new Error(`BEFORE is NOT deterministic: ${differ.join(', ')} differ between two captures — views: ${ids.slice(0, 20).join(', ')}`)
      }
      fs.mkdirSync(BEFORE_DIR, { recursive: true })
      for (const f of fa) fs.copyFileSync(path.join(tmp[0], f), path.join(BEFORE_DIR, f))
      const all = filesIn(BEFORE_DIR)
      fs.writeFileSync(path.join(BEFORE_DIR, 'CAPTURED.txt'), `${BEFORE_REF} (clean worktree, scripts copied in: ${copied.join(' ')}). Areas ${all.map(f => f.replace('.json.gz', '')).join(', ')}; the last recapture (${AREAS.join(', ')}) was captured twice, ${fa.length} files byte-identical.\n`)
      for (const d of tmp) fs.rmSync(d, { recursive: true, force: true })
      console.log(`✓ BEFORE captured twice, ${fa.length} files byte-identical → ${path.relative(REPO, BEFORE_DIR)} (${Object.keys(load(BEFORE_DIR)).length} views)`)
    } finally {
      try { execFileSync('git', ['worktree', 'remove', '--force', wt], { cwd: REPO, stdio: 'pipe' }) } catch { /* already gone */ }
    }
    return
  }

  // ══ --write-gb-named ═════════════════════════════════════════════════════════════════════════════════════════
  const W = require('./_lp1d2-words.cjs')
  if (argv.includes('--write-gb-named')) {
    const diff = W.gbKeyDiff()
    fs.writeFileSync(GB_NAMED_FILE, JSON.stringify(diff, null, 2) + '\n')
    console.log(`wrote ${path.relative(REPO, GB_NAMED_FILE)}: ${Object.keys(diff).length} en-GB keys whose text differs between F (${BEFORE_REF} words + as-moved) and A (this tree)`)
    return
  }

  // ══ AFTER: F and A, captured in parallel (or reused) ═════════════════════════════════════════════════════════
  let pass = 0, fail = 0
  const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 1200)}` : ''}`) } }
  const head = s => console.log(`\n── ${s}`)
  const missing = AREAS.filter(a => !fs.existsSync(path.join(BEFORE_DIR, `${a}.json.gz`)))
  if (missing.length) { console.log(`✗ no BEFORE for ${missing.join(', ')} — run node scripts/language-phase-1d2.cjs --recapture`); process.exit(1) }
  const t0 = Date.now()
  if (!argv.includes('--reuse')) {
    const [f, a] = await Promise.all([captureAll(REPO, path.join(RUNS, 'F'), switchEnv('F')), captureAll(REPO, path.join(RUNS, 'A'), switchEnv('A'))])
    console.log(`captured F and A in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    for (const l of [...f.map(x => `[F] ${x}`), ...a.map(x => `[A] ${x}`)].join('\n').split('\n').filter(l => /render errors|skipped/.test(l))) console.log(`  ⚠️ ${l}`)
  } else console.log('--reuse: the last F and A captures (node_modules/.cache/lp1d2-runs)')
  const BEFORE = load(BEFORE_DIR), F = load(path.join(RUNS, 'F')), A = load(path.join(RUNS, 'A'))
  const ids = Object.keys(BEFORE)
  const isUS = id => id.split('/').slice(1).join('/').split('|')[0] === 'US'
  const area = id => id.split('/')[0]
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y)
  const firstDiff = (x, y) => {
    const a = typeof x === 'string' ? x : String(JSON.stringify(x)), b = typeof y === 'string' ? y : String(JSON.stringify(y))
    let i = 0; while (i < a.length && a[i] === b[i]) i++
    return `@${i}: BEFORE …${JSON.stringify(a.slice(Math.max(0, i - 100), i + 120))}\n        AFTER  …${JSON.stringify(b.slice(Math.max(0, i - 100), i + 120))}`
  }
  head(`views: BEFORE ${ids.length} · F ${Object.keys(F).length} · A ${Object.keys(A).length} (GB ${ids.filter(i => !isUS(i)).length}, US ${ids.filter(isUS).length}) · areas ${AREAS.join(', ')}`)
  const errs = ids.filter(id => typeof BEFORE[id] === 'string' && BEFORE[id].startsWith('ERROR'))
  t(`every BEFORE view rendered (no ERROR)`, errs.length === 0, errs.slice(0, 10).join(', '))
  for (const id of ids) { if (!(id in F)) t(`${id}: still rendered (F)`, false); if (!(id in A)) t(`${id}: still rendered (A)`, false) }
  const newViews = Object.keys(A).filter(id => !(id in BEFORE))
  if (newViews.length) console.log(`  ${newViews.length} view(s) exist only AFTER (not compared with BEFORE; the US-words check still reads them): ${newViews.slice(0, 10).join(', ')}${newViews.length > 10 ? ' …' : ''}`)
  const split = (() => { try { execFileSync(process.execPath, ['scripts/split-messages.cjs', '--check'], { cwd: REPO, stdio: 'pipe' }); return null } catch (e) { return String(e.stdout || e.message).trim() } })()
  t('the generated per-namespace catalogue matches messages/*.json (A reads the authored files either way; this is what the build ships)', split === null, split)

  const checks = require('./_lp1d2-checks.cjs')
  // The US-changed list is the whole proof's: written to scripts/fixtures only when every area ran.
  const usFile = AREAS.length === ALL_AREAS.length ? US_CHANGED_FILE : path.join(RUNS, 'us-changed.partial.txt')
  const ctx = { t, head, BEFORE, F, A, ids, isUS, area, same, firstDiff, W, REPO, SECTIONS, GB_NAMED_FILE, US_CHANGED_FILE: usFile, argv, RUNS, AREAS }
  await checks.run(ctx)
  console.log(`\n${fail ? '✗' : '✓'} language-phase-1d2: ${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  if (fail) process.exit(1)
})().catch(e => { console.error(e); process.exit(1) })
