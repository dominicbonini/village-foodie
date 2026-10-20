#!/usr/bin/env node
// scripts/whatsapp-golive-parity-harness.cjs
//
// Proof for the WhatsApp go-live parity rule (lib/plan-features.ts, findPlanParityViolations).
// ⚠️ RE-PINNED (plans-data-model, Stage A, 19 October 2026): lib/plan-features.ts is DELETED; its rows and footnotes
// live on, frozen, in lib/legacy-pricing-display.ts, and findPlanParityViolations / ROW_FEATURE_MAP were deleted with
// the tiered gates they compared against (canAccess(feature, overrides) now grants every feature on every plan). The
// rule this file proves is unchanged in what a visitor sees — the matrix row agrees with the go-live flag, both
// directions — so it is now asserted HERE (flagParityViolations in the runner), for WhatsApp AND for Messenger &
// Instagram (whose cells now derive from MESSENGER_INSTAGRAM_LIVE), with the frozen Starter cell held as frozen copy.
// ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): canAccess takes the effective plan's switch again
// (feature, overrides, planAllows) — from DATA (public.plan_features), and the seed switches whatsapp_replies off for payg.
// The display-matrix rule above is untouched; the gate assertions now ask it per seeded plan.
// ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the frozen display copy (lib/legacy-pricing-display.ts — its
// FEATURE_SECTIONS Starter/Pro/Max cells and footnotes 1-5) is DELETED. The plan table's rows are lib/feature-table.ts
// FEATURE_TABLE (no plan in it): the WhatsApp row is gated by `whatsapp_replies` and is coming soon while WHATSAPP_LIVE is
// false; the Messenger & Instagram row likewise on MESSENGER_INSTAGRAM_LIVE. A cell per plan is lib/plan-offer.ts
// tableCell — "—" where the plan's switch is off (data), else ✓ / "Coming soon". So the rule is asserted on THOSE cells,
// computed by the real code on the seeded catalogue, in BOTH halves again: (a) the cell agrees with the go-live flag,
// both directions, and (b) the cell agrees with the real gate (canAccess with that plan's switch) — a row that ticks a
// plan the gate denies is the parity violation the old findPlanParityViolations caught. The landing card bullets
// (ADDED_FEATURE_BULLETS) carry the same flag and are held to the same rule. The table has NO footnotes any more (every
// planFeatures footnote was deleted), so the F1-F3 footnote variants are replaced by B1-B2 (the card bullets) and the
// real state asserts the footnotes are gone.
//   node scripts/whatsapp-golive-parity-harness.cjs
//
// 🔴 THE REAL STATE MUST REPORT ZERO VIOLATIONS, AND THREE BROKEN VARIANTS MUST EACH REPORT AT LEAST
// ONE. A checker that cannot fail is the thing this file exists to rule out — and that is not a
// hypothetical here: until 16 September 2026 this row passed VACUOUSLY, because the check only ever
// inspected cells that were literally `true` and the row read 'coming_soon'.
//
// ── HOW THE VARIANTS ARE BUILT, AND WHY NO REPO FILE IS EVER TOUCHED ────────────────────────────────
// FEATURE_SECTIONS and the flag are read at MODULE LOAD, so a variant cannot be injected as an
// argument the way the other harnesses do it. Instead the repo is compiled ONCE into a temp directory,
// each variant is a COPY of that compiled tree with a literal swapped, and each case runs in its own
// CHILD PROCESS so no module registry is shared. Nothing under the repo is written, mutated or
// restored — a harness that edits source files can leave them edited when it crashes.

const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const REPO = path.resolve(__dirname, '..')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-parity-'))
const base = path.join(tmp, 'base')
fs.mkdirSync(base, { recursive: true })

// ── COMPILE ONCE ────────────────────────────────────────────────────────────────────────────────────
const cfg = path.join(tmp, 'tsconfig.json')
fs.writeFileSync(cfg, JSON.stringify({
  compilerOptions: {
    module: 'commonjs', target: 'es2020', outDir: base, rootDir: REPO, skipLibCheck: true,
    esModuleInterop: true,
    resolveJsonModule: true, moduleResolution: 'node', baseUrl: REPO, paths: { '@/*': ['./*'] },
    // 🔴 typeRoots IS EXPLICIT BECAUSE THE TSCONFIG LIVES IN A TEMP DIRECTORY. Without it tsc walks up
    // from /tmp looking for node_modules/@types, finds nothing, and fails on `process` in the drift guard.
    types: ['node'], typeRoots: [path.join(REPO, 'node_modules/@types')],
  },
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): lib/legacy-pricing-display.ts (deleted) → lib/feature-table.ts
  // (the rows and card bullets) + lib/plan-offer.ts (the cells). lib/features.ts and lib/plans.ts stay — the real gate.
  files: ['lib/feature-table.ts', 'lib/plan-offer.ts', 'lib/features.ts', 'lib/plans.ts', 'lib/whatsapp-live.ts'].map(f => path.join(REPO, f)),
}))
try {
  execFileSync(path.join(REPO, 'node_modules/.bin/tsc'), ['-p', cfg], { stdio: 'pipe' })
} catch (e) {
  console.log('🔴 COMPILE FAILED:\n' + (e.stdout ? e.stdout.toString() : e.message))
  process.exit(1)
}

// ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the plan catalogue AS THE MIGRATIONS SEED IT —
// payg has whatsapp_replies switched OFF (public.plan_features), every other plan has no row (= on).
const CATALOG = require('./_plans-catalog-fixture.cjs').seedCatalog(REPO)
const FT = 'lib/feature-table.js'
const WL = 'lib/whatsapp-live.js'
const MSG = loc => JSON.parse(fs.readFileSync(path.join(REPO, `messages/${loc}.json`), 'utf8'))

// ── THE RUNNER, WHICH EACH CHILD PROCESS EXECUTES ───────────────────────────────────────────────────
const runner = path.join(tmp, 'runner.cjs')
fs.writeFileSync(runner, `
const path = require('path')
const dir = process.argv[2]
const Module = require('module')
const real = Module._resolveFilename
// tsc resolves the \`@/\` alias for type-checking but leaves it in the emitted require() calls.
Module._resolveFilename = function (req, ...rest) {
  if (req.startsWith('@/')) return real.call(this, path.join(dir, req.slice(2)), ...rest)
  try { return real.call(this, req, ...rest) } catch (e) { if (/^[a-z@]/.test(req)) return require.resolve(req, { paths: [${JSON.stringify(REPO)}] }); throw e }
}
const ftab = require(path.join(dir, 'lib/feature-table.js'))
const po = require(path.join(dir, 'lib/plan-offer.js'))
const wl = require(path.join(dir, 'lib/whatsapp-live.js'))
const ft = require(path.join(dir, 'lib/features.js'))
const pl = require(path.join(dir, 'lib/plans.js'))
const CATALOG = ${JSON.stringify(CATALOG)}
const sw = (k) => pl.planFeatureSwitch(CATALOG, k)
const plans = po.offerPlans(CATALOG, 'GB')
const FLAG_FOR = { whatsapp_auto_replies: ['WHATSAPP_LIVE', wl.WHATSAPP_LIVE], messenger_instagram_replies: ['MESSENGER_INSTAGRAM_LIVE', wl.MESSENGER_INSTAGRAM_LIVE] }
const BULLET_FLAG = { whatsapp_replies: ['WHATSAPP_LIVE', wl.WHATSAPP_LIVE], instagram_messenger_replies: ['MESSENGER_INSTAGRAM_LIVE', wl.MESSENGER_INSTAGRAM_LIVE] }
const GATE_FOR = { whatsapp_auto_replies: 'whatsapp_replies', messenger_instagram_replies: 'instagram_messenger_replies' }
const rows = ftab.FEATURE_TABLE.filter(r => r.id in FLAG_FOR).map(r => ({
  id: r.id, feature: r.feature || null, comingSoon: !!r.comingSoon,
  cells: Object.fromEntries(plans.map(p => [p.plan.key, po.tableCell(CATALOG, r, p)])),
}))
const violations = []
for (const r of rows) {
  const [flagName, live] = FLAG_FOR[r.id]
  // (a) the flag, both directions
  for (const [plan, cell] of Object.entries(r.cells)) {
    if (live && cell === 'soon') violations.push('"' + r.id + '" is coming soon for ' + plan + ' but ' + flagName + ' is true')
    if (!live && cell === 'on') violations.push('"' + r.id + '" advertised as live for ' + plan + ' but ' + flagName + ' is false')
  }
  // (b) the gate: a plan the real gate denies shows "—", and a plan it grants does not
  for (const [plan, cell] of Object.entries(r.cells)) {
    const gate = ft.canAccess(GATE_FOR[r.id], null, sw(plan))
    if (gate && cell === 'off') violations.push('"' + r.id + '" shows — for ' + plan + ' but canAccess grants it')
    if (!gate && cell !== 'off') violations.push('"' + r.id + '" shows ' + cell + ' for ' + plan + ' but canAccess denies it (plan switch off)')
  }
}
// ⚠️ RE-PINNED (Dominic, 20 October 2026): a hidden entry is never a card bullet (Messenger & Instagram was taken off the
// cards), so it is not held to the bullet rule — its table row still is.
const bullets = ftab.ADDED_FEATURE_BULLETS.filter(b => b.feature in BULLET_FLAG && !b.hidden).map(b => ({ feature: b.feature, under: b.under || null, comingSoon: !!b.comingSoon }))
const bulletViolations = []
for (const b of bullets) {
  const [flagName, live] = BULLET_FLAG[b.feature]
  if (live && b.comingSoon) bulletViolations.push('card bullet "' + b.feature + '" says coming soon but ' + flagName + ' is true')
  if (!live && !b.comingSoon) bulletViolations.push('card bullet "' + b.feature + '" reads as live but ' + flagName + ' is false')
}
process.stdout.write(JSON.stringify({
  flag: wl.WHATSAPP_LIVE,
  miFlag: wl.MESSENGER_INSTAGRAM_LIVE,
  plans: plans.map(p => p.plan.key),
  violations,
  bulletViolations,
  // ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the gate is override → effective plan → on, so it
  // is asked per seeded plan: payg (switched off by its plan_features row) and pro (no row = on).
  gateNoOverride: ft.canAccess('whatsapp_replies', null, sw('pro')),
  gateOverrideOff: ft.canAccess('whatsapp_replies', { whatsapp_replies: false }, sw('pro')),
  gatePaygNoOverride: ft.canAccess('whatsapp_replies', null, sw('payg')),
  gatePaygBlock: ft.featureBlock('whatsapp_replies', {}, sw('payg')),
  gatePaygOverrideOn: ft.canAccess('whatsapp_replies', { whatsapp_replies: true }, sw('payg')),
  gateOthersNoOverride: CATALOG.plans.filter(p => p.active && p.key !== 'payg').every(p => ft.canAccess('whatsapp_replies', {}, sw(p.key)) === true),
  upgradeTo: (pl.upgradePlanFor(CATALOG, 'whatsapp_replies') || {}).key || null,
  canAccessArity: ft.canAccess.length,
  rows,
  bullets,
}))
`)

function runCase(name, mutate) {
  const dir = path.join(tmp, name)
  fs.cpSync(base, dir, { recursive: true })
  if (mutate) {
    const applied = mutate(dir)
    if (!applied) { console.log(`🔴 ${name}: THE MUTATION DID NOT APPLY — the variant is not broken, so it proves nothing.`); process.exit(1) }
  }
  const out = execFileSync(process.execPath, [runner, dir], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'production' },
  }).toString()
  return JSON.parse(out)
}

/** Swap text inside one file of a variant tree. Returns false if the target was not found. */
function swap(dir, file, from, to) {
  const p = path.join(dir, file)
  const s = fs.readFileSync(p, 'utf8')
  if (!s.includes(from)) return false
  fs.writeFileSync(p, s.replace(from, to))
  return true
}

/** Regex swap (the compiled import binding's name is tsc's, not ours). Returns false if nothing matched. */
function swapRe(dir, file, re, to) {
  const p = path.join(dir, file)
  const s = fs.readFileSync(p, 'utf8')
  if (!re.test(s)) return false
  fs.writeFileSync(p, s.replace(re, to))
  return true
}

// ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the rows are FEATURE_TABLE entries, found by id in the compiled
// lib/feature-table.js; their coming-soon is `!<binding>.WHATSAPP_LIVE` (tsc names the binding, so matched by regex).
// ⚠️ RE-PINNED (pricing-tidy, 20 October 2026): the WhatsApp row gained `, note: 'whatsapp'` (its footnote marker) — matched
// as group 2 and carried through every mutation unchanged, so each variant still breaks only what it names.
const WA_ROW = /(\{ id: 'whatsapp_auto_replies', group: 'marketing', )feature: 'whatsapp_replies', comingSoon: !\w+\.WHATSAPP_LIVE(, note: 'whatsapp') \}/
const MI_ROW = /(\{ id: 'messenger_instagram_replies', group: 'marketing', feature: 'instagram_messenger_replies', )comingSoon: !\w+\.MESSENGER_INSTAGRAM_LIVE \}/
const WA_BULLET = /\{ feature: 'whatsapp_replies', comingSoon: !\w+\.WHATSAPP_LIVE \}/
const MI_BULLET = /\{ feature: 'instagram_messenger_replies', hidden: true \}/

const CASES = [
  ['V1', 'flag TRUE but the WhatsApp table row is still coming soon',
    d => swapRe(d, FT, WA_ROW, "$1feature: 'whatsapp_replies', comingSoon: true$2 }")],
  // ⚠️ RE-PINNED (pricing-pages, Stage B): was "the frozen Starter cell flipped to live". The first plan's cell is now
  // DATA; the way a table row can tick a plan the gate denies is by losing its gate — caught by the gate half.
  ['V2', 'the WhatsApp row loses its feature gate, so it ticks a plan whose switch is off',
    d => swapRe(d, FT, WA_ROW, "$1comingSoon: false$2 }")],
  // ⚠️ NOT REQUIRED BY THE BRIEF — the other half of the same rule, included because a one-directional
  // proof of a two-directional check is the vacuous pass all over again.
  ['V3', 'flag FALSE but the WhatsApp row still says live',
    d => swap(d, WL, 'exports.WHATSAPP_LIVE = true', 'exports.WHATSAPP_LIVE = false') &&
         swapRe(d, FT, WA_ROW, "$1feature: 'whatsapp_replies', comingSoon: false$2 }")],
  ['V4', 'MESSENGER_INSTAGRAM_LIVE FALSE but the Messenger & Instagram row says live',
    d => swapRe(d, FT, MI_ROW, '$1comingSoon: false }')],
  // ── THE CARD-BULLET VARIANTS (replace F1-F3: the table has no footnotes since Stage B) ─────────────────
  ['B1', 'flag TRUE but the WhatsApp card bullet carries the coming-soon chip',
    d => swapRe(d, FT, WA_BULLET, "{ feature: 'whatsapp_replies', comingSoon: true }"), 'bullet'],
  ['B2', 'MESSENGER_INSTAGRAM_LIVE FALSE but its card bullet is put back, reading as live',
    d => swapRe(d, FT, MI_BULLET, "{ feature: 'instagram_messenger_replies', under: 'whatsapp_replies', comingSoon: false }"), 'bullet'],
]

/** A variant is "detected" when the check that OWNS its rule reports a problem. */
const DETECTORS = {
  parity: r => r.violations,
  bullet: r => r.bulletViolations,
}

console.log('── BROKEN VARIANTS: each MUST be caught by the check that owns its rule ─────────────────')
let allFailed = true
for (const [key, label, mutate, kind] of CASES) {
  const r = runCase(key, mutate)
  const caught = DETECTORS[kind || 'parity'](r)
  const detected = caught.length > 0
  if (!detected) allFailed = false
  console.log(`  ${detected ? '✓ FAILED as required' : '🔴 PASSED — THE CHECK PROVES NOTHING'}  ${key} ${label}`)
  for (const v of caught.slice(0, 3)) console.log(`        caught: ${v}`)
}
if (!allFailed) { console.log('\n🔴 A VARIANT PASSED. The check is decorative.'); process.exit(1) }

console.log('\n── THE REAL STATE ─────────────────────────────────────────────────────────────────────')
const real = runCase('real', null)
console.log(`  WHATSAPP_LIVE = ${real.flag}   MESSENGER_INSTAGRAM_LIVE = ${real.miFlag}   plans (GB): ${real.plans.join(', ')}`)
for (const r of real.rows) console.log(`  row "${r.id}"  gate ${r.feature}  cells ${JSON.stringify(r.cells)}`)
for (const b of real.bullets) console.log(`  card bullet "${b.feature}"${b.under ? ' (under ' + b.under + ')' : ''}  comingSoon=${b.comingSoon}`)
console.log(`  violations: ${real.violations.length + real.bulletViolations.length === 0 ? 'none ✓' : '🔴 ' + JSON.stringify(real.violations.concat(real.bulletViolations))}`)

// ── CONTENT ASSERTIONS ON THE REAL STATE ────────────────────────────────────────────────────────────
const checks = []
const t = (name, cond) => checks.push([name, !!cond])
const wa = real.rows.find(r => r.id === 'whatsapp_auto_replies')
const mi = real.rows.find(r => r.id === 'messenger_instagram_replies')
t('flag is true', real.flag === true)
t('no parity violations (flag and gate, every plan)', real.violations.length === 0)
t('no card-bullet violations', real.bulletViolations.length === 0)
t('both auto-reply rows are in the table, gated by their features', wa && wa.feature === 'whatsapp_replies' && mi && mi.feature === 'instagram_messenger_replies')
t('WhatsApp row ticks pro', wa && wa.cells.pro === 'on')
t('WhatsApp row ticks unlimited', wa && wa.cells.unlimited === 'on')
// ⚠️ RE-PINNED (pricing-pages, Stage B): was "does NOT tick starter (frozen display copy)". The first plan's "—" is now
// the DATA (payg's whatsapp_replies switch is off), computed by tableCell.
t('🔴 WhatsApp row shows — for payg (its plan switch is off)', wa && wa.cells.payg === 'off')
// ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): canAccess takes the plan switch again (three args) —
// but the plans are DATA: the seed switches whatsapp_replies off for payg only. The override still wins both ways.
t('canAccess is (feature, featureOverrides, planAllows) — three args', real.canAccessArity === 3)
t("canAccess('whatsapp_replies', null, pro) → true (no override, pro has no plan_features row)", real.gateNoOverride === true)
t('…and every active plan but payg has it with no override', real.gateOthersNoOverride === true)
t("canAccess('whatsapp_replies', { whatsapp_replies: false }, pro) → false (the override wins over the plan)", real.gateOverrideOff === false)
t("🔴 canAccess('whatsapp_replies', null, payg) → false, and the block is 'plan' (the seeded payg row)", real.gatePaygNoOverride === false && real.gatePaygBlock === 'plan')
t("canAccess('whatsapp_replies', { whatsapp_replies: true }, payg) → true (an override grants past the plan)", real.gatePaygOverrideOn === true)
t("the upgrade prompt names pro (the first public plan with it on)", real.upgradeTo === 'pro')
t('MESSENGER_INSTAGRAM_LIVE is false (and the row agrees — see violations)', real.miFlag === false)
t('🔴 Messenger & Instagram STILL coming soon on pro', mi && mi.cells.pro === 'soon')
t('🔴 Messenger & Instagram STILL coming soon on unlimited', mi && mi.cells.unlimited === 'soon')
t('…and — for payg (its switch is off: off beats coming soon)', mi && mi.cells.payg === 'off')
t('the WhatsApp card bullet is live; Messenger & Instagram is not a card bullet at all (hidden — Dominic, 20 October 2026)',
  real.bullets.find(b => b.feature === 'whatsapp_replies')?.comingSoon === false
  && !real.bullets.some(b => b.feature === 'instagram_messenger_replies'))
// ⚠️ RE-PINNED (pricing-pages, Stage B): footnote 4 (and 1-6) are GONE — every planFeatures footnote message was deleted.
// The retired state cannot come back quietly: no footnote key in either locale, and no renderer asks for one.
for (const loc of ['en-GB', 'en-US']) {
  const pf = MSG(loc).planFeatures || {}
  t(`no planFeatures footnote messages remain (${loc})`, !('footnote' in pf) && !('footnotes' in pf))
}
const SRC = ['components/pricing/PlanTable.tsx', 'components/pricing/PricingSection.tsx', 'lib/plans-pdf.ts', 'lib/feature-table.ts', 'lib/plan-offer.ts']
t('no pricing renderer reads a footnote.n4* message', SRC.every(f => !/footnote\.n4/.test(fs.readFileSync(path.join(REPO, f), 'utf8'))))

// ── THE OFF STATE, RUN FOR REAL ─────────────────────────────────────────────────────────────────────
// A flag needs BOTH states exercised: with WHATSAPP_LIVE false the row and the bullet must say coming soon by themselves.
const off = runCase('offstate', d => swap(d, WL, 'exports.WHATSAPP_LIVE = true', 'exports.WHATSAPP_LIVE = false'))
const offWa = off.rows.find(r => r.id === 'whatsapp_auto_replies')
console.log(`\n  [flag false] WhatsApp row cells: ${JSON.stringify(offWa && offWa.cells)}`)
t('OFF-STATE · no violations', off.violations.length === 0 && off.bulletViolations.length === 0)
t('OFF-STATE · the WhatsApp row is coming soon on pro and unlimited, — on payg',
  offWa && offWa.cells.pro === 'soon' && offWa.cells.unlimited === 'soon' && offWa.cells.payg === 'off')
t('OFF-STATE · the WhatsApp card bullet carries the coming-soon chip', off.bullets.find(b => b.feature === 'whatsapp_replies')?.comingSoon === true)

console.log('\n── ASSERTIONS ─────────────────────────────────────────────────────────────────────────')
for (const [n, ok] of checks) console.log(`  ${ok ? '✓' : '🔴'} ${n}`)
const failed = checks.filter(([, ok]) => !ok)
console.log(`\n${failed.length ? '🔴 ' + failed.length + ' FAILED' : '✅ all ' + checks.length + ' passed'}`)
fs.rmSync(tmp, { recursive: true, force: true })
process.exit(failed.length ? 1 : 0)
