#!/usr/bin/env node
// scripts/language-phase-1e-tidy.cjs — Language Phase 1e TIDY: THE PROOF (docs/language-phase-1e-tidy-report.md).
//
//   node scripts/language-phase-1e-tidy.cjs              capture this tree, then compare with the checkpoint
//   node scripts/language-phase-1e-tidy.cjs --reuse      the comparison only, on the last capture
//   node scripts/language-phase-1e-tidy.cjs --recapture  BEFORE: a clean `git worktree` of the checkpoint, captured TWICE
//                                                        and byte-compared, into scripts/fixtures/language-phase-1e-tidy-before/
//
// ── 🔴 THE METHOD ────────────────────────────────────────────────────────────────────────────────────────────
// Every view scripts/language-phase-1e.cjs captures (the marketing pages' HTML and metadata, the calculator, contact,
// the legal chrome, the footer, the public truck page, the sitemap, the plans PDF, Manage › Billing's plan rows, and
// the router — 600-odd views, GB and US), captured on the CHECKPOINT (BEFORE) and on this tree (AFTER), both with
// their own authored words (HG_MESSAGES_SOURCE=1). The capture modules are this tree's, copied into the checkpoint's
// worktree — scripts only, never product code.
//   AFTER === BEFORE with exactly the NAMED items below applied — byte for byte. Nothing else may differ, so the Part C
//   revert (static language imports) is proved by every other view being identical, GB and US.
//   The two US views that hide Village Foodie's prompts are proved by CONTROLS: the same view with `discovery` forced
//   on equals BEFORE's view exactly (and equals the normal view on the checkpoint, which has no such prop).
const fs = require('fs'); const path = require('path'); const zlib = require('zlib'); const os = require('os')
const { execFileSync, spawn } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const argv = process.argv.slice(2)
const CHECKPOINT = 'a858ca5'   // "landing" — the Phase 1e work as Dominic committed it (ff9eeef + a858ca5); see the report's Step 0
const BEFORE_DIR = path.join(REPO, 'scripts/fixtures/language-phase-1e-tidy-before')
const RUN = path.join(REPO, 'node_modules/.cache/lp1e-tidy-run')
const AREAS = ['pages', 'parts', 'billing', 'router']
// ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): + scripts/_lp-stage-b.cjs (Stage B's named changes) and the plan
// catalogue fixture it reads — both inert on a tree without the plan migrations.
const CAPTURE_SCRIPTS = f => /^(language-phase-1e\.cjs|_lp1e-.*\.cjs|_lp1d2-.*\.cjs|_lp1d-.*\.cjs|_lp1b-.*\.cjs|_lp2-named\.cjs|_lp2-checks\.cjs|_png-decode\.cjs|_slot-interval-compile\.cjs|_render-kit\.cjs|_lp2-frozen\.cjs|_lp2-text\.cjs|_fake-pg\.cjs|_country-settings-gb\.cjs|_lp-stage-b\.cjs|_plans-catalog-fixture\.cjs)$/.test(f)
const ENV = tag => ({ HG_KIT_CACHE_SUFFIX: `tidy${tag}`, HG_MESSAGES_FROZEN: 'off', HG_MESSAGES_SOURCE: '1' })

function captureAll(cwd, dir, env) {
  fs.mkdirSync(dir, { recursive: true })
  for (const a of AREAS) fs.rmSync(path.join(dir, `${a}.json.gz`), { force: true })
  return Promise.all(AREAS.map(area => new Promise((res, rej) => {
    const p = spawn(process.execPath, ['scripts/language-phase-1e.cjs', `--capture-to=${dir}`, `--area=${area}`], { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    p.stdout.on('data', d => { out += d }); p.stderr.on('data', d => { out += d })
    p.on('close', code => (code === 0 ? res(out.trim()) : rej(new Error(`capture ${area} failed (rc=${code}) in ${cwd}:\n${out.slice(-3000)}`))))
  })))
}
function load(dir) {
  const out = {}
  for (const a of AREAS) {
    const f = path.join(dir, `${a}.json.gz`)
    if (!fs.existsSync(f)) continue
    for (const [k, v] of Object.entries(JSON.parse(zlib.gunzipSync(fs.readFileSync(f))).views)) out[`${a}/${k}`] = v
  }
  return out
}
const files = dir => fs.readdirSync(dir).filter(f => f.endsWith('.json.gz')).sort()

// ══ THE NAMED ITEMS ════════════════════════════════════════════════════════════════════════════════════════
const ORIGIN = 'https://www.hatchgrab.com'
const SEG = { GB: 'uk', US: 'us' }
const ccOf = id => id.split('/').slice(1).join('/').split('|')[1]
/** Footnotes 1 and 5 (both countries): the rendered sentences, old → new, as they read with their arguments filled. */
const FOOTNOTE_EDITS = [
  ['per authorisation if you tap on a phone or tablet without a dedicated reader.', 'per authorisation if you take the payment on a supported phone instead of a separate card machine.'],
  ['per authorization if you tap on a phone or tablet without a dedicated reader.', 'per authorization if you take the payment on a supported phone instead of a separate card reader.'],
  ['Compatible printers are listed in our help centre.', 'Get in touch for the list of compatible printers.'],
  ['Compatible printers are listed in our help center.', 'Get in touch for the list of compatible printers.'],
]
const FIX13 = require('./_lp1e-named.cjs').US_LAYOUT_FIX_13
const NAMED = [
  { id: 'footnotes', what: 'footnote 1 (Tap to Pay: “a supported phone”, as its row says) and footnote 5 (“Get in touch for the list of compatible printers.”), both countries',
    applies: () => true,
    apply: v => { let j = JSON.stringify(v); for (const [a, b] of FOOTNOTE_EDITS) j = j.split(JSON.stringify(a).slice(1, -1)).join(JSON.stringify(b).slice(1, -1)); return JSON.parse(j) } },
  { id: 'sitemap', what: '/sitemap.xml no longer lists / and /features (the router’s 302s); the country addresses stay',
    applies: id => /^parts\/sitemap\|(GB|US)\|hatchgrab/.test(id),
    apply: v => (Array.isArray(v) ? v.filter(e => e.url !== `${ORIGIN}/` && e.url !== `${ORIGIN}/features`) : v) },
  { id: 'legal-logo', what: 'the legal pages’ logo links to the visitor’s country page (/landing → /uk, /us)',
    applies: id => /^parts\/legal\|(GB|US)\|chrome/.test(id),
    apply: (v, id) => (typeof v === 'string' ? v.replace(/href="\/landing"/g, `href="/${SEG[ccOf(id)]}"`) : v) },
  // ⚠️ RE-PINNED, 18 October 2026 (US layout fixes): us-layout-fix-13-us-landing-bands — the US landing (testimonial hidden):
  // pricing loses `band`, the final CTA gains it, `.switch-block` an inline wash. The transform lives in
  // scripts/_lp1e-named.cjs (US_LAYOUT_FIX_13, exact substrings, each found exactly once); it names pages/landing|US|html only.
  { id: FIX13.id, what: FIX13.what, applies: id => FIX13.views(id), apply: (v, id) => FIX13.apply(id, v) },
  // ⚠️ RE-PINNED, 19 October 2026 (US polish batch): the HatchGrab truck page's preview from the truck itself — scripts/_lp1e-named.cjs.
  (P => ({ id: P.id, what: P.what, applies: id => P.views(id), apply: (v, id) => P.apply(id, v) }))(require('./_lp1e-named.cjs').US_POLISH_HG_TRUCK_PREVIEW),
  // ⚠️ RE-PINNED, 19 October 2026 (US legal draft): the legal footer's "Country terms" link — scripts/_lp1e-named.cjs.
  (P => ({ id: P.id, what: P.what, applies: id => P.views(id), apply: (v, id) => P.apply(id, v) }))(require('./_lp1e-named.cjs').LEGAL_COUNTRY_TERMS_LINK),
  // ⚠️ RE-PINNED, 19 October 2026 (legal follow-ups): the Terms and Privacy titles without the doubled " | HatchGrab" — scripts/_lp1e-named.cjs.
  (P => ({ id: P.id, what: P.what, applies: id => P.views(id), apply: (v, id) => P.apply(id, v) }))(require('./_lp1e-named.cjs').LEGAL_TITLES_ABSOLUTE),
  // ⚠️ RE-PINNED (seo-fixes, 20 October 2026): the seo-fixes items — the always-rendered country menu, the lazy store badges,
  // the landing's JSON-LD @graph, /compare's title + description, the canonical / og:url of /contact and the legal pages, the
  // sitemap (alternates, real lastmod, legal + contact; Village Foodie without lastmod). PRECISE, GB and US, one copy in
  // scripts/_lp-seo-fixes.cjs (shared with scripts/_lp1e-named.cjs). Applied after the items above (the sitemap after `sitemap`).
  ...require('./_lp-seo-fixes.cjs').ITEMS.map(P => ({ id: P.id, what: P.what, applies: id => P.views(id), apply: (v, id) => P.apply(id, v) })),
  // ⚠️ RE-PINNED (pricing-tidy, 20 October 2026): the re-dated Terms — the HatchGrab sitemap's /terms lastmod 2026-10-20.
  // PRECISE, after seo-s5-sitemap, one copy in scripts/_lp-pricing-tidy.cjs.
  ...require('./_lp-pricing-tidy.cjs').ITEMS.map(P => ({ id: P.id, what: P.what, applies: id => P.views(id), apply: (v, id) => P.apply(id, v) })),
  // ⚠️ RE-PINNED (compare-tidy, 20 October 2026): F2 — the Village Foodie sitemap: the root, then /contact. PRECISE, after
  // seo-s5-sitemap, one copy in scripts/_lp-compare-tidy.cjs.
  ...require('./_lp-compare-tidy.cjs').ITEMS.map(P => ({ id: P.id, what: P.what, applies: id => P.views(id), apply: (v, id) => P.apply(id, v) })),
  // ⚠️ RE-PINNED (ireland-3, 21 October 2026): the Ireland section — the HatchGrab sitemap's /country-terms lastmod
  // 2026-10-21. PRECISE, after pricing-tidy's item, one copy in scripts/_lp-ireland-3.cjs.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS harness module (ireland-3)
  ...require('./_lp-ireland-3.cjs').ITEMS.map(P => ({ id: P.id, what: P.what, applies: id => P.views(id), apply: (v, id) => P.apply(id, v) })),
  // ⚠️ RE-PINNED (anz-terms, 22 October 2026): the Australia and New Zealand sections — the sitemap's /country-terms lastmod
  // 2026-10-22. PRECISE, after ireland-3's item, one copy in scripts/_lp-anz-terms.cjs.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS harness module (anz-terms)
  ...require('./_lp-anz-terms.cjs').ITEMS.map(P => ({ id: P.id, what: P.what, applies: id => P.views(id), apply: (v, id) => P.apply(id, v) })),
  // ⚠️ RE-PINNED (about-page, 22 October 2026): the country menu out of the nav (Dominic), the footers' About link, the
  // Organization's founder and the sitemap's /about. PRECISE, after every earlier item, one copy in scripts/_lp-about-page.cjs.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS harness module (about-page)
  ...require('./_lp-about-page.cjs').ITEMS.map(P => ({ id: P.id, what: P.what, applies: id => P.views(id), apply: (v, id) => P.apply(id, v) })),
]
// ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): Manage › Billing is ONE data-driven plan card above the frozen comparison
// table — STRUCTURAL, by the same proof Part 2 and Phase 1e name (scripts/_lp1d2-named.cjs makeBillingProof, one copy):
// the card names the effective plan, the table is BEFORE's (+ the items above) byte for byte (exact / no column
// highlighted / BEFORE pro|matrix's), the switch modal is the catalogue's, iOS has no purchase panel. GB and US.
// The catalogue's own Billing views (`billing|<CC>|plan|…`, added by scripts/_lp1d2-shell.cjs) exist only AFTER; their
// claims are proven by scripts/plans-data-model.cjs.
// ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026, docs/pricing-pages-report.md): Stage B's views, by the shared proofs
// in scripts/_lp-stage-b.cjs (GB and US — both sides here carry their own authored words). STRUCTURAL: the region Stage B
// replaced (#pricing after its h2; the /features body; the calculator's suggested plan, allowance sentence, months-free
// value and results; the PDF's stylesheet and content) is cut from BEFORE (+ the named items above) and from AFTER, the
// rest byte-identical; AFTER's region checked for what Stage B put there. The /features description is a PRECISE item.
const STAGE_B = require('./_lp-stage-b.cjs')
const STAGE_B_VIEWS = [
  // (`-usOff`: the US switched off — a redirect, not the page; byte-identical as before.)
  [/^pages\/landing\|(GB|US)\|html(?!-usOff)/, 'pricing-b-landing-pricing', STAGE_B.landingPricing],
  [/^pages\/features\|(GB|US)\|html(?!-usOff)/, 'pricing-b-features-page', STAGE_B.featuresPage],
  [/^pages\/compare\|(GB|US)\|html(?!-usOff)|^parts\/calc\|(GB|US)\|/, 'pricing-b-compare-calc', STAGE_B.calcProof],
  [/^parts\/pdf\|(GB|US)\|html$/, 'pricing-b-plans-pdf', STAGE_B.plansPdf],
]
if (STAGE_B.LANDED) NAMED.push({ id: 'pricing-b-features-description', what: 'Stage B — THE ONE SEO change: /features’s description names the catalogue’s public plans and the trial’s months; titles, canonicals, hreflang, robots and og:url unchanged',
  applies: id => /^pages\/features\|(GB|US)\|meta(?!-usOff)/.test(id), apply: (v, id) => STAGE_B.featuresDescription(v, ccOf(id) === 'US' ? 'en-US' : 'en-GB') })
const PLANS_BILLING = /^billing\/billing\|(GB|US)\|(trial|starter|pro|max|tester)(\||$)/
const PLANS_NEW_VIEWS = /^billing\/billing\|(GB|US)\|plan\|/
let BILL_BEFORE = null
/** BEFORE value → { expected, touched, matches? } */
function expect(id, before) {
  let v = JSON.parse(JSON.stringify(before)); const touched = []
  for (const n of NAMED) {
    if (!n.applies(id)) continue
    const prev = JSON.stringify(v)
    try { v = n.apply(v, id) } catch (e) { throw new Error(`${id}: ${e.message}`) }
    if (JSON.stringify(v) !== prev) touched.push(n.id)
  }
  const out = { expected: v, touched }
  const sb = STAGE_B.LANDED && STAGE_B_VIEWS.find(([re]) => re.test(id))
  if (sb) { touched.push(sb[1]); out.matches = f => sb[2](v, f) }
  if (PLANS_BILLING.test(id)) {
    touched.push('plans-billing-plan-card')
    const proof = require('./_lp1d2-named.cjs').makeBillingProof(cc => { const k = `billing/billing|${cc}|pro|matrix`; return expect(k, BILL_BEFORE[k]).expected })
    out.matches = f => proof(v, f, id)
  }
  return out
}
/** The demo bounces: a router view whose Location is the landing with ?demo=… */
const isDemo = id => /^router\/router\|X\|\S+ demo(Return|Ref) /.test(id)
/** The two US views whose Village Foodie prompts are hidden — proved by their `-discoveryOn` controls. */
const DISCOVERY = ['parts/footer|US|html', 'parts/truck|US|html']

;(async () => {
  // ══ --recapture ═══════════════════════════════════════════════════════════════════════════════════════════
  if (argv.includes('--recapture')) {
    const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'lp1e-tidy-before-'))
    fs.rmSync(wt, { recursive: true, force: true })
    execFileSync('git', ['worktree', 'add', '--detach', wt, CHECKPOINT], { cwd: REPO, stdio: 'pipe' })
    try {
      fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(wt, 'node_modules'))
      const copied = fs.readdirSync(path.join(REPO, 'scripts')).filter(CAPTURE_SCRIPTS)
      for (const f of copied) fs.copyFileSync(path.join(REPO, 'scripts', f), path.join(wt, 'scripts', f))
      const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: wt, encoding: 'utf8' }).split('\n').filter(Boolean)
      const stray = dirty.filter(l => !l.slice(3).startsWith('scripts/') || !copied.includes(path.basename(l.slice(3))))
      if (stray.length) throw new Error(`the checkpoint worktree has changes other than the copied scripts:\n${stray.join('\n')}`)
      console.log(`checkpoint worktree ${CHECKPOINT}: ${copied.length} capture scripts copied in; tracked files they changed: ${dirty.map(l => l.slice(3)).join(', ') || 'none'}`)
      const tmp = [1, 2].map(i => path.join(os.tmpdir(), `lp1e-tidy-cap-${process.pid}-${i}`))
      for (const [i, dir] of tmp.entries()) {
        const t0 = Date.now()
        const logs = await captureAll(wt, dir, ENV('B'))
        console.log(`capture ${i + 1} (${((Date.now() - t0) / 1000).toFixed(1)}s)\n${logs.join('\n')}`)
      }
      const fa = files(tmp[0]), fb = files(tmp[1])
      const differ = fa.filter(f => !fb.includes(f) || !fs.readFileSync(path.join(tmp[0], f)).equals(fs.readFileSync(path.join(tmp[1], f))))
      if (differ.length || fa.length !== fb.length) throw new Error(`BEFORE is NOT deterministic: ${differ.join(', ')} differ between two captures`)
      fs.mkdirSync(BEFORE_DIR, { recursive: true })
      for (const f of fa) fs.copyFileSync(path.join(tmp[0], f), path.join(BEFORE_DIR, f))
      fs.writeFileSync(path.join(BEFORE_DIR, 'CAPTURED.txt'), `${CHECKPOINT} (clean worktree, this tree's capture scripts copied in: ${copied.join(' ')}), its own authored words; captured twice, ${fa.length} files byte-identical.\n`)
      for (const d of tmp) fs.rmSync(d, { recursive: true, force: true })
      console.log(`✓ BEFORE captured twice, byte-identical → ${path.relative(REPO, BEFORE_DIR)} (${Object.keys(load(BEFORE_DIR)).length} views)`)
    } finally {
      try { execFileSync('git', ['worktree', 'remove', '--force', wt], { cwd: REPO, stdio: 'pipe' }) } catch { /* already gone */ }
    }
    return
  }

  let pass = 0, fail = 0
  const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 1500)}` : ''}`) } }
  const head = s => console.log(`\n── ${s}`)
  if (!fs.existsSync(path.join(BEFORE_DIR, 'pages.json.gz'))) { console.log('✗ no BEFORE — run node scripts/language-phase-1e-tidy.cjs --recapture'); process.exit(1) }
  const t0 = Date.now()
  if (!argv.includes('--reuse')) {
    const logs = await captureAll(REPO, RUN, ENV('A'))
    console.log(`captured AFTER in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    for (const l of logs.join('\n').split('\n').filter(l => /render errors/.test(l))) console.log(`  ⚠️ ${l}`)
  }
  const BEFORE = load(BEFORE_DIR), AFTER = load(RUN)
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  const firstDiff = (x, y) => {
    const a = typeof x === 'string' ? x : JSON.stringify(x), b = typeof y === 'string' ? y : JSON.stringify(y)
    let i = 0; while (i < a.length && a[i] === b[i]) i++
    return `@${i}: expected …${JSON.stringify(a.slice(Math.max(0, i - 120), i + 160))}\n        got      …${JSON.stringify(b.slice(Math.max(0, i - 120), i + 160))}`
  }
  const ids = Object.keys(BEFORE)
  head(`views: BEFORE (${CHECKPOINT}) ${ids.length} · AFTER ${Object.keys(AFTER).length}`)
  const errs = id => typeof id === 'string' && id.startsWith('ERROR')
  t('every BEFORE view rendered', !ids.some(i => errs(BEFORE[i])), ids.filter(i => errs(BEFORE[i])).slice(0, 8).join(', '))
  t('every AFTER view rendered', !Object.keys(AFTER).some(i => errs(AFTER[i])), Object.keys(AFTER).filter(i => errs(AFTER[i])).map(i => `${i}: ${AFTER[i]}`).slice(0, 8).join('\n      '))
  BILL_BEFORE = BEFORE
  // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): the catalogue's Billing views are new (PLANS_NEW_VIEWS), and only those.
  const newOk = Object.keys(AFTER).filter(i => !(i in BEFORE) && PLANS_NEW_VIEWS.test(i))
  t(`the same set of views on both (plus ${newOk.length} new Billing views of the plan catalogue)`, same(Object.keys(AFTER).filter(i => !newOk.includes(i)).sort(), ids.slice().sort()) && newOk.length > 0,
    `only AFTER: ${Object.keys(AFTER).filter(i => !(i in BEFORE) && !newOk.includes(i)).join(', ')} · only BEFORE: ${ids.filter(i => !(i in AFTER)).join(', ')}`)

  // ── every view: BEFORE + its named items, byte for byte ──
  head('every view (GB and US) equals BEFORE with exactly its named items — the Part C revert changes nothing rendered')
  const byNamed = {}, mismatch = []
  let identical = 0
  for (const id of ids) {
    if (!(id in AFTER) || DISCOVERY.includes(id) || isDemo(id)) continue
    const { expected, touched, matches } = expect(id, BEFORE[id])
    if (matches) {   // ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): a structural item: its own proof, not byte equality
      const pr = matches(AFTER[id])
      if (!pr.ok) { mismatch.push(id); t(`${id}: BEFORE + named items (structural)`, false, pr.problems.join('\n      ')) } else for (const n of touched) (byNamed[n] = byNamed[n] || []).push(id)
      continue
    }
    if (!same(expected, AFTER[id])) { mismatch.push(id); continue }
    if (touched.length) for (const n of touched) (byNamed[n] = byNamed[n] || []).push(id)
    else identical++
  }
  for (const id of mismatch.filter(i => !PLANS_BILLING.test(i)).slice(0, 6)) t(`${id}: BEFORE + named items`, false, firstDiff(expect(id, BEFORE[id]).expected, AFTER[id]))
  t(`every other view matches (${ids.length - DISCOVERY.length - ids.filter(isDemo).length} views; ${mismatch.length} mismatched)`, mismatch.length === 0, mismatch.join(', '))
  console.log(`  ${identical} byte-identical · ${Object.entries(byNamed).map(([n, v]) => `${n}: ${v.length}`).join(' · ')}`)
  for (const [n, v] of Object.entries(byNamed)) console.log(`    ${n.padEnd(11)} ${v.join(', ')}`)
  const gbIds = ids.filter(i => ccOf(i) === 'GB'), usIds = ids.filter(i => ccOf(i) === 'US')
  console.log(`  GB views ${gbIds.length} · US views ${usIds.length} · router views ${ids.filter(i => i.startsWith('router/')).length}`)
  for (const cc of ['GB', 'US']) {
    const fn = byNamed.footnotes || []
    // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): /features and the plans PDF no longer carry the numbered
    // footnotes (Stage B: one pricing footnote under the one plan table) — the tidy's footnote 1 / 5 edits are retired there:
    // BEFORE showed the old sentences, AFTER shows neither the old nor the new ones.
    if (STAGE_B.LANDED) {
      const fviews = [`pages/features|${cc}|html`, `parts/pdf|${cc}|html`]
      const olds = FOOTNOTE_EDITS.map(([a]) => a), news = FOOTNOTE_EDITS.map(([, b]) => b)
      const shows = (v, w) => typeof v === 'string' && w.some(x => v.includes(x.replace(/&/g, '&amp;')))
      t(`${cc}: footnotes 1 and 5 — BEFORE showed them on /features and in the plans PDF; Stage B retired them there (neither wording in AFTER)`, fviews.every(i => shows(BEFORE[i], olds) && !shows(AFTER[i], olds) && !shows(AFTER[i], news)), fviews.map(i => `${i}: BEFORE ${shows(BEFORE[i], olds)} · AFTER ${shows(AFTER[i], [...olds, ...news])}`).join(' · '))
    } else
    t(`${cc}: footnotes 1 and 5 changed on /features and in the plans PDF`, fn.some(i => i.startsWith(`pages/features|${cc}|html`)) && fn.some(i => i.startsWith(`parts/pdf|${cc}|`)), fn.join(', '))
    t(`${cc}: the legal logo is named`, (byNamed['legal-logo'] || []).includes(`parts/legal|${cc}|chrome`))
  }
  t(`${FIX13.id}: the US landing and nowhere else`, same(byNamed[FIX13.id] || [], ['pages/landing|US|html']), (byNamed[FIX13.id] || []).join(', '))
  t('the sitemap changed on both HatchGrab views and nowhere else', same((byNamed.sitemap || []).slice().sort(), ['parts/sitemap|GB|hatchgrab', 'parts/sitemap|US|hatchgrab-usOn']), (byNamed.sitemap || []).join(', '))
  const smA = AFTER['parts/sitemap|GB|hatchgrab'] || []
  // ⚠️ RE-PINNED (seo-fixes S5, 20 October 2026): after the country addresses the HatchGrab sitemap lists the indexable legal
  // pages and /contact (seo-s5-sitemap); the country addresses are still exactly these, and / and /features still absent.
  // ⚠️ RE-PINNED (about-page, 22 October 2026): + /about, last (scripts/_lp-about-page.cjs about-page-sitemap).
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS harness module (about-page)
  const SEO_TAIL = [`${ORIGIN}/privacy`, `${ORIGIN}/terms`, `${ORIGIN}/country-terms`, `${ORIGIN}/contact`, ...(require('./_lp-about-page.cjs').LANDED ? [`${ORIGIN}/about`] : [])]
  t('the GB sitemap is exactly /uk and /uk/features (+ seo-fixes: /privacy, /terms, /country-terms, /contact; + about-page: /about)', same(smA.map(e => e.url), [`${ORIGIN}/uk`, `${ORIGIN}/uk/features`, ...SEO_TAIL]), JSON.stringify(smA.map(e => e.url)))
  const smUS = AFTER['parts/sitemap|US|hatchgrab-usOn'] || []
  t('with the US on: /uk, /uk/features, /us, /us/features (+ seo-fixes: the legal pages and /contact; + about-page: /about)', same(smUS.map(e => e.url), [`${ORIGIN}/uk`, `${ORIGIN}/uk/features`, `${ORIGIN}/us`, `${ORIGIN}/us/features`, ...SEO_TAIL]), JSON.stringify(smUS.map(e => e.url)))
  // ⚠️ RE-PINNED (seo-fixes S5, 20 October 2026): Village Foodie's one entry loses its request-time lastmod — nothing else.
  // ⚠️ RE-PINNED (compare-tidy F2, 20 October 2026): …and /contact follows it (yearly, 0.3, no lastmod) — exactly that.
  const CT = require('./_lp-compare-tidy.cjs')
  const vfWant = (b => (CT.SITEMAP_LANDED ? CT.sitemapVF(b) : b))(require('./_lp-seo-fixes.cjs').sitemapVF(BEFORE['parts/sitemap|GB|villagefoodie']))
  t(`the Village Foodie sitemap is unchanged but for its lastmod (seo-s5-sitemap: no request-time lastmod)${CT.SITEMAP_LANDED ? ' and /contact after the root (compare-tidy F2)' : ''}`, same(vfWant, AFTER['parts/sitemap|GB|villagefoodie']) && !same(BEFORE['parts/sitemap|GB|villagefoodie'], AFTER['parts/sitemap|GB|villagefoodie']), JSON.stringify(AFTER['parts/sitemap|GB|villagefoodie']))

  // ── the US truck page and footer: Village Foodie's prompts hidden — proved by the controls ──
  head('US truck page and footer — Village Foodie’s prompts hidden (controls with `discovery` forced on)')
  const gbWords = require(path.join(REPO, 'messages/en-GB.json')), usWords = require(path.join(REPO, 'messages/en-US.json'))
  const word = (ns, k) => ((usWords[ns] || {})[k] ?? gbWords[ns][k])
  const PROMPTS = [word('siteFooter', 'title'), word('siteFooter', 'body'), word('siteFooter', 'cta'), word('siteFooter', 'hire'), word('siteFooter', 'addBusiness'), word('siteFooter', 'directory'), word('truckPage', 'weeklySchedule')]
  const has = (html, s) => typeof html === 'string' && html.includes(s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;'))
  for (const id of DISCOVERY) {
    const ctl = `${id}-discoveryOn`
    t(`${id}: on the checkpoint the control equals the view (the prop did not exist)`, same(BEFORE[ctl], BEFORE[id]))
    t(`${id}: AFTER's control (discovery on) equals BEFORE's view, byte for byte`, same(AFTER[ctl], BEFORE[id]), firstDiff(BEFORE[id], AFTER[ctl]))
    const gone = PROMPTS.filter(p => has(BEFORE[id], p))
    t(`${id}: BEFORE showed the prompts (${gone.length} of ${PROMPTS.length})`, gone.length >= 4, PROMPTS.filter(p => !has(BEFORE[id], p)).join(' | '))
    t(`${id}: AFTER shows none of them`, PROMPTS.every(p => !has(AFTER[id], p)), PROMPTS.filter(p => has(AFTER[id], p)).join(' | '))
    t(`${id}: AFTER has no /hire, /trucks or add-business link`, !/href="\/hire"|href="\/trucks"|topic=addBusiness/.test(AFTER[id] || ''))
  }
  for (const id of ['parts/footer|GB|html', 'parts/truck|GB|html']) t(`${id}: GB unchanged`, same(BEFORE[id], AFTER[id]))

  // ── the demo bounces ──
  head('the demo bounces — straight to the country page, the router’s own answer, no second hop')
  const demo = ids.filter(isDemo)
  t('demo bounce views captured (two routes × hosts × inputs × US on/off)', demo.length === 16, demo.length)
  for (const id of demo) {
    const b = BEFORE[id], a = AFTER[id]
    if (/villagefoodie/.test(id)) { t(`${id}: Village Foodie unchanged`, same(a, b), firstDiff(b, a)); continue }
    const routed = b && b.then && b.then.kind === 'redirect' ? `${b.then.location}#try` : null
    t(`${id}: BEFORE went to /landing and the router sent it on`, !!b && /^\/landing\?demo=invalid#try$/.test(b.location) && !!routed, JSON.stringify(b))
    t(`${id}: AFTER goes straight to ${routed}, which the proxy serves`, !!a && a.status === b.status && a.location === routed && a.then && a.then.kind !== 'redirect', JSON.stringify(a))
  }

  // ── the copyright year ──
  head('“© {year} HatchGrab” — the current year in Europe/London, at render')
  const legalSrc = fs.readFileSync(path.join(REPO, 'lib/legal.ts'), 'utf8')
  const fnSrc = /export function copyrightYear\(now: Date = new Date\(\)\): number \{\n\s*return Number\(new Intl\.DateTimeFormat\('en-GB', \{ timeZone: 'Europe\/London', year: 'numeric' \}\)\.format\(now\)\)\n\}/.test(legalSrc)
  t('lib/legal.ts copyrightYear reads the year in Europe/London', fnSrc)
  const year = now => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric' }).format(now))
  t('the year turns at London midnight: 31 Dec 2026 23:59 UTC → 2026, 1 Jan 2027 00:00 UTC → 2027, 31 Dec 2026 23:30 in New York (04:30 UTC) → 2027',
    year(new Date('2026-12-31T23:59:00Z')) === 2026 && year(new Date('2027-01-01T00:00:00Z')) === 2027 && year(new Date('2027-01-01T04:30:00Z')) === 2027)
  for (const f of ['components/landing/LandingFooter.tsx', 'app/contact/HatchGrabContact.tsx']) t(`${f} renders t('copyright', { year: copyrightYear() })`, fs.readFileSync(path.join(REPO, f), 'utf8').includes("t('copyright', { year: copyrightYear() })"))
  for (const ns of ['landingFooter', 'contactPage']) t(`${ns}.copyright is “© {year} HatchGrab” (no typed year)`, gbWords[ns].copyright === '© {year} HatchGrab' && !((usWords[ns] || {}).copyright))
  t('the rendered GB landing still reads “© 2026 HatchGrab” at the fixture clock (2026)', /© 2026 HatchGrab/.test(AFTER['pages/landing|GB|html'] || ''))

  console.log(`\n${fail ? '✗' : '✓'} language-phase-1e-tidy: ${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  if (fail) process.exit(1)
})().catch(e => { console.error(e); process.exit(1) })
