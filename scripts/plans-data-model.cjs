#!/usr/bin/env node
// scripts/plans-data-model.cjs — THE PROOF FOR plans-data-model, STAGE A (docs/plans-data-model-report.md).
//
//   node scripts/plans-data-model.cjs              everything (the rendered sections capture the real pages: ~1–2 min)
//   node scripts/plans-data-model.cjs --no-render  the logic and source sections only
//   node scripts/plans-data-model.cjs --reuse=<dir>  sections 7–8 on an earlier capture (language-phase-1e.cjs --capture-to)
//
// LOCALHOST ONLY: no database, no network. The plan catalogue is the migration's own seed
// (scripts/_plans-catalog-fixture.cjs parses supabase/migrations/20261024_plans.sql). The two test trucks are FIXTURES
// copied from their live rows, read (read-only) on 19 October 2026 — no live row is changed by this proof:
//   test-truck     GB  plan 'trial'  trial_expires_at 2026-12-31 23:59:59+00
//                      feature_overrides {"batch_reservations":true,"places_posts_preview":true,"whatsapp_setup_preview":true}
//   test-truck-us  US  plan 'trial'  trial_expires_at 2026-12-31 23:59:59+00   (the same overrides)
//
// SECTIONS
//   1  the catalogue: the seed is sound (one signup default, one expiry fallback, one demo plan), in sort order
//   2  every plan × every Feature: allowed; an override still denies (false) and grants (true)
//   3  every gated surface and API: canAccess takes only the truck's overrides — no call passes a plan; the tier
//      machinery, the plan refusals and their upgrade prompts are gone from code and messages
//   4  test-truck with a PAST end date: resolves to Pay as you go with ITS switches (Stage A2), Pay at Hatch included; the end
//      date restored: back on its trial. Before / after printed.
//   5  the promotional override (test-truck-us): applies while `until` is NULL or today or later, on the plan it was
//      given for; lapses to the standard price at read time; ignored once the plan has ended
//   6  provisioning and admin read the table: no plan key is written in either
//   7  RENDERED — Billing for trial, demo, payg, pro, unlimited (and tester), with and without a promo override
//   8  RENDERED — GB landing, /features, /compare, the plans PDF and Billing's comparison table: byte-identical to the
//      BEFORE capture (scripts/fixtures/plans-data-model-before/, taken on this tree before Stage A), served from the
//      frozen copy, lib/legacy-pricing-display.ts
//      ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): Stage B REBUILT those surfaces from the plan data (the frozen
//      copy is deleted). §8 now keeps byte-identity for every view Stage B does not touch, and names each Stage B change
//      exactly: the landing differs ONLY inside <section id="pricing">; /features ONLY inside its one content section, and
//      its metadata ONLY in the description (THE one SEO change); /compare and the two plain calculator views ONLY in the
//      "Months free" default (1 → 3, the trial); the other calculator views and the PDF HTML are rebuilt wholesale and
//      Billing's matrix is the one <PlanTable> — those are proven by scripts/pricing-pages.cjs, and here only rendered.
//      ⚠️ RE-PINNED (seo-fixes, 20 October 2026): seo-fixes' named markup / tag changes (country menu <ul> + anchors, the
//      badges' loading="lazy", the landing @graph JSON-LD, /compare's title + description, canonical + og:url on /contact
//      /privacy /terms, the sitemap) are each verified exactly and mapped back to BEFORE's form before the checks above
//      run — see seoFixes() in §8.
const fs = require('fs')
const os = require('os')
const path = require('path')
const zlib = require('zlib')
const { execFileSync, spawnSync } = require('child_process')

const REPO = path.resolve(__dirname, '..')
const RENDER = !process.argv.includes('--no-render')
let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail ? `\n      ${detail}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

// ── compile and load the real modules (lib/plans.ts, lib/features.ts) ─────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hg-plans-dm-'))
fs.writeFileSync(path.join(tmp, 'tsconfig.json'), JSON.stringify({
  compilerOptions: { module: 'commonjs', target: 'es2020', outDir: tmp, rootDir: REPO, skipLibCheck: true, esModuleInterop: true,
    moduleResolution: 'node', baseUrl: REPO, paths: { '@/*': ['./*'] }, types: ['node'], typeRoots: [path.join(REPO, 'node_modules/@types')] },
  files: [path.join(REPO, 'lib/plans.ts'), path.join(REPO, 'lib/features.ts'), path.join(REPO, 'lib/time-utils.ts')],
}))
try { execFileSync(path.join(REPO, 'node_modules/.bin/tsc'), ['-p', path.join(tmp, 'tsconfig.json')], { stdio: 'pipe' }) }
catch (e) { console.log('🔴 COMPILE FAILED:\n' + (e.stdout ? e.stdout.toString() : e.message)); process.exit(1) }
// ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): lib/plans.ts now imports `@/lib/features` and
// `@/lib/time-utils`; tsc emits the alias verbatim, so it is rewritten at resolve time (the plan-feature-order shim).
{
  const Module = require('module')
  const realResolve = Module._resolveFilename
  Module._resolveFilename = function (request, ...rest) {
    if (request.startsWith('@/')) return realResolve.call(this, path.join(tmp, request.slice(2)), ...rest)
    return realResolve.call(this, request, ...rest)
  }
}
const P = require(path.join(tmp, 'lib/plans.js'))
const F = require(path.join(tmp, 'lib/features.js'))
const CATALOG = require('./_plans-catalog-fixture.cjs').seedCatalog(REPO)
// ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): the Feature list is a runtime array now (lib/features.ts FEATURES).
const FEATURES = [...F.FEATURES]

/** Source with comments blanked (newlines kept), so a sentence that names something is not a use of it. */
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, pre) => pre + ' '.repeat(m.length - pre.length))
function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue
    const rel = path.posix.join(dir, e.name)
    if (e.isDirectory()) walk(rel, out); else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel)
  }
  return out
}
const SRC = [...walk('app'), ...walk('components'), ...walk('lib'), 'proxy.ts'].filter(f => fs.existsSync(path.join(REPO, f)))
const LEGACY = 'lib/legacy-pricing-display.ts'   // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): DELETED — named only to assert it is gone

const LIVE = {
  'test-truck':    { id: 'test-truck', country: 'GB', plan: 'trial', trial_expires_at: '2026-12-31T23:59:59+00:00',
    feature_overrides: { batch_reservations: true, places_posts_preview: true, whatsapp_setup_preview: true } },
  'test-truck-us': { id: 'test-truck-us', country: 'US', plan: 'trial', trial_expires_at: '2026-12-31T23:59:59+00:00',
    feature_overrides: { batch_reservations: true, places_posts_preview: true, whatsapp_setup_preview: true } },
}
const NOW = new Date('2026-10-19T12:00:00Z')

// ══ 1 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('1 · the catalogue (the migration seed)')
t('the seed parses: 6 plans, 6 price rows', CATALOG && CATALOG.plans.length === 6 && CATALOG.prices.length === 6)
t('catalogProblems() is empty', P.catalogProblems(CATALOG).length === 0, JSON.stringify(P.catalogProblems(CATALOG)))
t('plans in sort order: payg, pro, unlimited, trial, demo, tester', P.plansInOrder(CATALOG).map(p => p.key).join() === 'payg,pro,unlimited,trial,demo,tester')
t('public plans: payg, pro, unlimited', P.publicPlans(CATALOG).map(p => p.key).join() === 'payg,pro,unlimited')
t('signup default = trial; expiry fallback = payg; demo plan = demo',
  P.signupDefaultPlan(CATALOG).key === 'trial' && P.expiryFallbackPlan(CATALOG).key === 'payg' && P.demoPlan(CATALOG).key === 'demo')
// ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): Pay as you go's flag is TRUE (Dominic's §11 answer 1), and it is ENFORCED —
// scripts/plan-features-config.cjs §7 proves a plan with it false.
t('payg pay_at_hatch_allowed is TRUE (Stage A2 — every plan true; enforced)', P.planByKey(CATALOG, 'payg').payAtHatchAllowed === true)
t('no starter, no max', !P.planByKey(CATALOG, 'starter') && !P.planByKey(CATALOG, 'max'))
t('isPlanKey refuses an unknown key and accepts every seeded one',
  !P.isPlanKey(CATALOG, 'starter') && !P.isPlanKey(CATALOG, 'max') && CATALOG.plans.every(p => P.isPlanKey(CATALOG, p.key, { activeOnly: true })))
const broken = { plans: CATALOG.plans.map(p => (p.key === 'pro' ? { ...p, isSignupDefault: true } : p)), prices: CATALOG.prices }
t('a catalogue with two signup defaults is reported unsound, and signupDefaultPlan throws',
  P.catalogProblems(broken).length > 0 && (() => { try { P.signupDefaultPlan(broken); return false } catch { return true } })())

// ══ 2 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
head(`2 · every plan × every Feature (${FEATURES.length} features)`)
// ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): canAccess takes the truck's EFFECTIVE plan's switch as a REQUIRED third
// argument (override → plan switch → allowed). Every plan has every feature EXCEPT what public.plan_features switches off
// — Pay as you go's three (scripts/plan-features-config.cjs §1–2 proves the switches; this keeps the override half).
// ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): + event_types — 20261026_pricing_pages.sql switches it off for payg.
const PAYG_OFF = ['event_types', 'instagram_messenger_replies', 'schedule_graphics', 'whatsapp_replies']
t('canAccess takes (feature, overrides, the plan switch) — no plan key, no end date', F.canAccess.length === 3 && !/\bplan\b|expires/i.test(F.canAccess.toString().split('{')[0]))
for (const plan of P.plansInOrder(CATALOG)) {
  const truck = { plan: plan.key, trial_expires_at: null, feature_overrides: {} }
  const allows = P.truckPlanSwitch(truck, CATALOG, NOW)
  const denied = FEATURES.filter(f => !F.canAccess(f, truck.feature_overrides, allows)).sort()
  t(`${plan.key.padEnd(9)} allowed: every feature${plan.key === 'payg' ? ' but its four switches' : ''}`, JSON.stringify(denied) === JSON.stringify(plan.key === 'payg' ? PAYG_OFF : []), denied.join(', '))
  const offs = FEATURES.filter(f => F.canAccess(f, { [f]: false }, allows))
  t(`${plan.key.padEnd(9)} override false DENIES each feature, and only that one`, offs.length === 0 &&
    FEATURES.every(f => FEATURES.filter(g => g !== f && allows(g)).every(g => F.canAccess(g, { [f]: false }, allows))), offs.join(', '))
  t(`${plan.key.padEnd(9)} override true GRANTS each feature (even one its plan switches off)`, FEATURES.every(f => F.canAccess(f, { [f]: true }, allows)))
}
t('a non-boolean override value still denies (as before): "true" string, 1, null', ['true', 1, null].every(v => !F.canAccess('branded_qr_code', { branded_qr_code: v }, () => true)))
t('resolveBatchReservations is override-only (a demo plan without the override is OFF; with it, ON)',
  !F.resolveBatchReservations({ plan: 'demo', feature_overrides: {} }) && F.resolveBatchReservations({ plan: 'payg', feature_overrides: { batch_reservations: true } }))

// ══ 3 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('3 · every gated surface and API reads overrides only; the tier machinery is gone')
const calls = []
for (const f of SRC) {
  const c = code(read(f))
  for (const m of c.matchAll(/\bcanAccess\(\s*([^,()]+),([^\n]*)/g)) {
    // the second argument: up to the call's own closing parenthesis
    let depth = 1, i = 0; const r = m[2]
    for (; i < r.length && depth; i++) depth += r[i] === '(' ? 1 : r[i] === ')' ? -1 : 0
    calls.push({ f, line: c.slice(0, m.index).split('\n').length, feature: m[1].trim(), rest: r.slice(0, i - 1).trim() })
  }
}
const surfaces = [...new Set(calls.filter(c => !c.f.startsWith('lib/features')).map(c => c.f))]
console.log(`    ${calls.length} canAccess calls in ${surfaces.length} files:`)
for (const f of surfaces) console.log(`      ${f}: ${[...new Set(calls.filter(c => c.f === f).map(c => c.feature))].join(', ')}`)
// ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): every call passes the overrides AND a plan SWITCH — a function of the
// effective plan (lib/plans.ts truckPlanSwitch / planFeatureSwitch, or the caller's `planAllows`), never a plan key or an
// end date. Most surfaces now call lib/plans.ts truckCan / featureAccess or lib/useFeatures.ts, which wrap exactly this.
const badCalls = calls.filter(c => c.f !== 'lib/features.ts' &&
  (!/(?:feature_overrides|featureOverrides|overrides)\b/.test(c.rest) || !/,\s*(?:args\.planAllows|truckPlanSwitch\(truck, catalog, now\)|allows)\s*$/.test(c.rest) || /\bplan\b\s*[,)]|expires/i.test(c.rest)))
t('every canAccess call passes (feature, the truck\'s overrides, the effective plan\'s switch) — never a plan key or an end date', badCalls.length === 0,
  badCalls.map(c => `${c.f}:${c.line} canAccess(${c.feature}, ${c.rest})`).join('; '))
const useCan = code(read('lib/useFeatures.ts'))
t('useFeatures(truck): override → the effective plan (catalogue, or the server\'s plan_blocks) → allowed', /featureBlock\(f, overrides, allows\)/.test(useCan) && /truckPlanSwitch\(truck, catalog\)/.test(useCan) && /plan_blocks/.test(useCan))
const gate = code(read('components/FeatureGate.tsx'))
t('FeatureGate: the one upgrade prompt only when the PLAN is why; an override shows the fallback', /block === 'plan'\) return <PlanPrompt/.test(gate) && /return <>\{fallback\}<\/>/.test(gate) && !/requiredPlan|trialExpiresAt/.test(gate))
const GONE = ['hasFeature', 'PLAN_FEATURES', 'requiredPlan', 'maxVans', 'INCLUDED_VANS', 'PLAN_ORDER', 'PLAN_BADGE', 'FEE_COLUMN_FOR',
  'findPlanParityViolations', 'ROW_FEATURE_MAP', 'getPlanFeatures', 'TRIAL_FEATURES', 'MAX_FEATURES', 'PRO_FEATURES', 'upgradeMessage',
  'showUpgrade', 'PRIVATE_UPGRADE_MESSAGE', 'WEEKLY_POST_PLAN_REFUSAL']
for (const name of GONE) {
  const hits = SRC.filter(f => new RegExp(`\\b${name}\\b`).test(code(read(f)))).map(f => f)
  t(`${name}: no code uses it`, hits.length === 0, hits.join(', '))
}
// ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the frozen display copy and its five importers are gone — the
// pricing surfaces read lib/plan-offer.ts (data) — so TABLE_PLANS must be nowhere, and the frozen file must not exist.
const tp = SRC.filter(f => /\bTABLE_PLANS\b/.test(code(read(f))))
t('TABLE_PLANS is gone from code, with the frozen display copy (lib/legacy-pricing-display.ts deleted)', tp.length === 0 && !fs.existsSync(path.join(REPO, LEGACY)), tp.join(', '))
const OLD_CODES = ['preorders_pro', 'private_events_pro', 'event_types_max', 'social_media_plan', 'embed_not_on_plan']
const codeHits = SRC.filter(f => OLD_CODES.some(k => code(read(f)).includes(`'${k}'`)))
t('the five plan refusal codes are gone from code', codeHits.length === 0, codeHits.join(', '))
const msgs = read('messages/en-GB.json')
t('…and from the messages', OLD_CODES.every(k => !msgs.includes(`"${k}"`)))
const api = SRC.filter(f => f.startsWith('app/api/'))
const upg = api.filter(f => /upgrade\s*:\s*true/.test(code(read(f))))
t('no API route answers with upgrade: true', upg.length === 0, upg.join(', '))
const M = JSON.parse(msgs)
const gone = [['weeklyPost', 'planRefusal'], ['eventTypes', 'maxPlanFallback'], ['eventTypes', 'maxPlanBody'], ['manageSettings', 'vanUpgrade'],
  ['manageReports', 'upsell'], ['manageWhatsApp', 'card', 'notOnPlan'], ['manageWhatsApp', 'card', 'upgrade'], ['manageBilling', 'upgradeToMax'],
  ['manageBilling', 'choosePro'], ['manageBilling', 'onMax'], ['manageBilling', 'upgradeYourPlan']]
const present = gone.filter(p => p.reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), M) !== undefined)
t('the plan-prompt message keys are removed', present.length === 0, present.map(p => p.join('.')).join(', '))
// ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the plan table's rows are lib/feature-table.ts — the Messenger /
// Instagram row (and its card sub-line) is coming soon while MESSENGER_INSTAGRAM_LIVE is false.
t('coming-soon stays: the plan table still marks Messenger / Instagram coming soon while MESSENGER_INSTAGRAM_LIVE is false',
  /\{ id: 'messenger_instagram_replies', group: 'marketing', feature: 'instagram_messenger_replies', comingSoon: !MESSENGER_INSTAGRAM_LIVE \}/.test(read('lib/feature-table.ts'))
  && /MESSENGER_INSTAGRAM_LIVE:\s*boolean\s*=\s*false/.test(read('lib/whatsapp-live.ts')))
// The plan string compared to a key in code — none outside the frozen copy (its comparison table) and these listed reads.
const PLAN_LITERAL = /\.plan\s*[!=]==?\s*'[a-z]+'|'[a-z]+'\s*[!=]==?\s*[\w.]*\.plan\b/
const lit = SRC.filter(f => f !== LEGACY && PLAN_LITERAL.test(code(read(f))))
t('no code compares a truck\'s plan to a literal key', lit.length === 0, lit.join(', '))

// ══ 4 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('4 · test-truck with a past end date → Pay as you go WITH ITS SWITCHES (Stage A2), Pay at Hatch included; then restored')
const live = LIVE['test-truck']
const show = (label, tr) => { const e = P.effectivePlan(tr, CATALOG, NOW); console.log(`    ${label.padEnd(9)} plan=${tr.plan} end=${tr.trial_expires_at} → effective ${e.plan.key} (${e.plan.name})${e.ended ? `, ended ${e.endedAt}` : ''}`); return e }
const before = show('BEFORE', live)
t('before: on its trial, not ended', before.plan.key === 'trial' && !before.ended)
const past = { ...live, trial_expires_at: '2026-10-01T00:00:00Z' }
const during = show('PAST END', past)
t('past end date: effective plan is the expiry fallback, payg, marked ended', during.plan.key === 'payg' && during.ended && during.assigned.key === 'trial')
// ⚠️ RE-PINNED (plan-features-config, Stage A2, 20 October 2026): an ended plan resolves to payg WITH payg's switches (Dominic's A2 rule, which
// replaces Stage A's "keeps every feature"); Pay at Hatch is allowed on payg (its flag is true) and is now ENFORCED.
const denied = FEATURES.filter(f => !P.truckCan(past, CATALOG, f, NOW)).sort()
t('past end date: payg\'s switches apply — refused exactly its four (Stage B: + event_types)', JSON.stringify(denied) === JSON.stringify(PAYG_OFF), denied.join(', '))
t('past end date: Pay at Hatch allowed (payg allows it)', P.payAtHatchOn(past, CATALOG, NOW))
const submit = code(read('app/api/orders/submit/route.ts'))
t('Pay at Hatch is ENFORCED: the submit route refuses it when the plan does not allow it (payAtHatchOn)', /if \(payByCard !== true && !payAtHatchOn\(truck, planCatalog\)\)/.test(submit))
t('past end date: the promo override does not apply to the fallback', P.truckPlanPrice({ ...past, plan_price_override_minor: 1 }, CATALOG, 'GB', { now: NOW }).override === null)
const after = show('RESTORED', { ...past, trial_expires_at: live.trial_expires_at })
t('restored end date: back on its trial', after.plan.key === 'trial' && !after.ended)
t('a NULL end date means no end', P.effectivePlan({ ...live, plan: 'pro', trial_expires_at: null }, CATALOG, NOW).plan.key === 'pro')
t('an unknown key (starter) resolves to the fallback, not ended', (e => e.plan.key === 'payg' && !e.ended)(P.effectivePlan({ plan: 'starter' }, CATALOG, NOW)))
t('the end date applies to every plan: pro with a past date → payg', P.effectivePlan({ plan: 'pro', trial_expires_at: '2026-10-18T00:00:00Z' }, CATALOG, NOW).plan.key === 'payg')

// ══ 5 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('5 · the promotional override (test-truck-us fixture, US prices)')
const us = LIVE['test-truck-us']
const price = (tr, today = '2026-10-19') => P.truckPlanPrice(tr, CATALOG, 'US', { now: NOW, today })
for (const key of ['trial', 'demo', 'payg', 'pro', 'unlimited']) {
  const tr = { ...us, plan: key }
  const std = price(tr)
  const ov = price({ ...tr, plan_price_override_minor: 1900, plan_price_override_until: '2026-12-31', plan_price_override_note: 'Launch offer' })
  console.log(`    ${key.padEnd(9)} standard ${std.monthlyMinor ?? '— (no price row)'} · with promo ${ov.monthlyMinor} · included ${std.includedOnlineMinor === undefined ? '—' : std.includedOnlineMinor ?? 'unlimited'}`)
  t(`${key}: the promo applies (1900) and the standard price is kept beside it`, ov.monthlyMinor === 1900 && ov.override && ov.standardMonthlyMinor === std.monthlyMinor)
}
const pro = { ...us, plan: 'pro', trial_expires_at: null, plan_price_override_minor: 1900, plan_price_override_until: '2026-12-31' }
// ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): pro's included_online_minor is 400000 (was 250000).
t('pro standard price is 2900, included 400000, fee 99 bps, extra van 2900', price({ ...pro, plan_price_override_minor: null }).monthlyMinor === 2900 &&
  price(pro).includedOnlineMinor === 400000 && P.planPriceFor(CATALOG, 'pro', 'US').feeBps === 99 && P.extraVanMonthlyMinor(pro, CATALOG, 'US', NOW) === 2900)
t('promo applies ON its until date (inclusive)', price(pro, '2026-12-31').monthlyMinor === 1900)
t('promo lapses the day after: the standard price, at read time', price(pro, '2027-01-01').monthlyMinor === 2900 && price(pro, '2027-01-01').override === null)
t('promo with no until date applies indefinitely', price({ ...pro, plan_price_override_until: null }, '2030-01-01').monthlyMinor === 1900)
t('promo is ignored once the plan has ended (the fallback is not the plan it was given for)', price({ ...pro, trial_expires_at: '2026-10-01T00:00:00Z' }).override === null)
t('unlimited: included NULL = unlimited', price({ ...us, plan: 'unlimited' }).includedOnlineMinor === null)
t('removed again: no override → the standard price', price({ ...us, plan: 'pro' }).override === null)

// ══ 6 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
head('6 · provisioning and admin read the table')
const prov = code(read('lib/provision-truck.ts'))
t('provisioning takes the signup default from the catalogue (signupDefaultPlan)', /signupDefaultPlan\(/.test(prov) && /getPlanCatalog\(/.test(prov))
// ('demo' also names a provisioning KIND and a plan ROLE — 'operator' | 'demo', 'signupDefault' | 'demo' — not a plan key.)
const provKeys = prov.replace(/'signupDefault'\s*\|\s*'demo'/g, '').replace(/planRole:\s*'(signupDefault|demo)'|'operator'\s*\|\s*'demo'|kind\s*===\s*'demo'|planRole\s*===\s*'demo'/g, '')
t('provisioning writes no plan key', !/plan\s*:\s*'[a-z]+'/.test(prov) && !/'(trial|demo|payg|pro|unlimited|tester|starter|max)'/.test(provKeys),
  (provKeys.match(/.*'(trial|demo|payg|pro|unlimited|tester|starter|max)'.*/g) || []).join(' | '))
const adminRoute = code(read('app/api/admin/route.ts'))
t('POST /api/admin validates plan against the table (isPlanKey) and uses a field allowlist', /isPlanKey\(/.test(adminRoute) && /ADMIN_TRUCK_FIELDS/.test(adminRoute) && /cannot be changed here/.test(read('app/api/admin/route.ts')))
const adminPage = code(read('app/admin/page.tsx'))
t('admin plan buttons come from the catalogue (activePlans), no plan key literal', /activePlans\(/.test(adminPage) && !/plan:\s*'[a-z]+'/.test(adminPage))
const ocr = code(read('lib/order-charge-rules.ts'))
t('the platform fee rate is the plan\'s fee_bps (truckPlanFeeBps), not country_settings.platform_fee_pct', /truckPlanFeeBps/.test(ocr) && !/platformFeePct/.test(ocr))

// ══ 7 + 8: RENDERED ════════════════════════════════════════════════════════════════════════════════════════════════
if (RENDER) {
  // --reuse=<dir>: the checks only, on an earlier capture (fast iteration); otherwise a fresh capture of this tree.
  const reuse = (process.argv.find(a => a.startsWith('--reuse=')) || '').slice('--reuse='.length)
  const out = reuse || fs.mkdtempSync(path.join(os.tmpdir(), 'hg-plans-dm-cap-'))
  for (const area of reuse ? [] : ['pages', 'parts', 'billing']) {
    const r = spawnSync(process.execPath, [path.join(REPO, 'scripts/language-phase-1e.cjs'), `--capture-to=${out}`, `--area=${area}`],
      { cwd: REPO, encoding: 'utf8', env: { ...process.env, HG_KIT_CACHE_SUFFIX: 'plans-dm' }, maxBuffer: 64 << 20 })
    if (r.status !== 0) { t(`capture ${area}`, false, (r.stderr || r.stdout).slice(-600)); continue }
    console.log('   ' + r.stdout.trim().split('\n').join('\n   '))
  }
  const load = (dir, a) => { const f = path.join(dir, `${a}.json.gz`); return fs.existsSync(f) ? JSON.parse(zlib.gunzipSync(fs.readFileSync(f))).views : {} }
  const BEFORE_DIR = path.join(REPO, 'scripts/fixtures/plans-data-model-before')
  const B = { pages: load(BEFORE_DIR, 'pages'), parts: load(BEFORE_DIR, 'parts'), billing: load(BEFORE_DIR, 'billing') }
  const A = { pages: load(out, 'pages'), parts: load(out, 'parts'), billing: load(out, 'billing') }

  // The comparison table: its plan header, fee and feature rows (up to the footnotes, less any closing wrapper — Pro's
  // old collapsible matrix sat inside its own <div>), then the footnotes block.
  const TABLE_START = '<div class="flex items-start justify-between mb-2 sticky top-0 z-30 bg-white pt-2">'
  const NOTES_START = '<div class="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-1.5">'
  const table = html => {
    if (typeof html !== 'string') return null
    const s = html.indexOf(TABLE_START); if (s < 0) return null
    const n = html.indexOf(NOTES_START, s); if (n < 0) return null
    let depth = 0, i = n
    const re = /<div\b|<\/div>/g; re.lastIndex = n
    for (let m; (m = re.exec(html));) { depth += m[0] === '</div>' ? -1 : 1; if (depth === 0) { i = m.index + 6; break } }
    // the rows: balanced from the header — drop any closing tags that belong to a wrapper, not to the table
    let rows = html.slice(s, n), d = 0
    const parts = rows.split(/(<div\b[^>]*>|<\/div>)/)
    let keep = ''
    for (const p of parts) { if (p === '</div>') { if (d === 0) continue; d-- } else if (p.startsWith('<div')) d++; keep += p }
    return keep + '\n' + html.slice(n, i)
  }
  // The highlighted ("current plan") column's classes made neutral — for comparing a table whose current column changed.
  const neutral = s => s && s.replace(/text-sm font-semibold text-orange-500">✓/g, 'text-sm font-semibold text-slate-500">✓')
    .replace(/border-b-2 border-orange-500/g, 'border-b-2 border-slate-100').replace(/tracking-widest text-orange-500/g, 'tracking-widest text-slate-400')
    .replace(/whitespace-nowrap text-orange-600/g, 'whitespace-nowrap text-slate-900').replace(/leading-snug text-orange-600/g, 'leading-snug text-slate-600')

  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): Billing's table is components/pricing/PlanTable.tsx — present,
  // and the frozen matrix's header gone.
  const planTable = html => typeof html === 'string' && html.includes('<div class="pt pt-card" role="table"') && !html.includes(TABLE_START)
  // ⚠️ RE-PINNED (features-page-restore, 20 October 2026): /features' table is PlanTable's "features" variant — its named change.
  const FR = require('./_lp-features-restore.cjs')

  head('7 · RENDERED — Billing for every plan, with and without a promo override')
  for (const cc of ['GB', 'US']) {
    const v = k => A.billing[`billing|${cc}|${k}`]
    const money = cc === 'GB' ? '£' : '$'
    for (const key of ['trial', 'demo', 'payg', 'pro', 'unlimited', 'tester']) {
      const plain = v(`plan|${key}`), promo = v(`plan|${key}|promo`)
      const name = CATALOG.plans.find(p => p.key === key).name
      // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the table below the card is the one <PlanTable>, not the frozen matrix.
      const ok = typeof plain === 'string' && !plain.startsWith('ERROR') && plain.length > 1000 && plain.includes(`>${name}</p>`) && planTable(plain)
      t(`${cc} ${key.padEnd(9)} renders: the plan card names "${name}" and the comparison table is below it`, ok, typeof plain === 'string' ? plain.slice(0, 200) : String(plain))
      t(`${cc} ${key.padEnd(9)} with promo: ${money}19/mo and "Special price until 31 December 2026."`,
        typeof promo === 'string' && promo.includes(`${money}19/mo`) && /Special price until (31 December 2026|December 31, 2026)\./.test(promo))
    }
    const pv = v('plan|pro')
    // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): pro includes 400000 minor (was 250000).
    t(`${cc} pro (no promo): ${money}29/mo and the included amount`, pv && pv.includes(`${money}29/mo`) && /Includes .*4,000 of online orders a month\./.test(pv))
    t(`${cc} unlimited: "Unlimited online orders included."`, (v('plan|unlimited') || '').includes('Unlimited online orders included.'))
    t(`${cc} payg: "Free"`, /<p class="text-sm text-slate-700 mt-0.5">Free<\/p>/.test(v('plan|payg') || ''))
    t(`${cc} pro promo lapsed: back to ${money}29/mo, no promo line`, (v('plan|pro|promoLapsed') || '').includes(`${money}29/mo`) && !(v('plan|pro|promoLapsed') || '').includes('Special price'))
    t(`${cc} pro promo with no end: "Special price."`, (v('plan|pro|promoNoEnd') || '').includes('Special price.'))
    const ended = v('plan|pro|ended') || ''
    t(`${cc} pro with a past end date: shows Pay as you go and "ended → Pay as you go" line, no promo`, ended.includes('>Pay as you go</p>') && /Your Pro plan ended on .*You’re now on Pay as you go\./.test(ended)   /* ⚠️ RE-PINNED (Stage A2): ", with every feature" removed — an ended plan has payg's switches */ && !ended.includes('Special price'))
    t(`${cc} demo and tester are no longer empty, and offer no purchase buttons`, ['demo', 'tester'].every(k => (v(`plan|${k}`) || '').length > 1000 && !(v(`plan|${k}`) || '').includes('Change your plan')))
    t(`${cc} payg offers the other public plans (Pro, Unlimited) through the data-driven buttons`, /Pro — .*\/mo/.test(v('plan|payg') || '') && /Unlimited — .*\/mo/.test(v('plan|payg') || ''))
    const modal = v('plan|payg|switchToPro') || ''
    t(`${cc} the switch modal is data-driven and its mailto is URL-encoded`, modal.includes('Switch to Pro') && /mailto:[^"]*\?subject=Switch%20to%20Pro%20%E2%80%94/.test(modal))
    t(`${cc} iOS: no purchase panel`, !(v('plan|payg|ios') || 'x').includes('Change your plan') && (v('plan|payg|ios') || '').length > 1000)
    // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): Billing's footnotes are the ONE pricing footnote, whose card fee
    // goes through the card's mask — with prices hidden it reads "(currently TBC/TBD in the …)".
    t(`${cc} with prices hidden the pricing footnote's card fee is masked`,
      /\* Plus .*\(currently (TBC|TBD) in the /.test(v('trial|hidePricing') || ''))
  }

  head('8 · RENDERED — byte-identical to BEFORE except the named Stage B changes')
  /* ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): each view is EITHER byte-identical to BEFORE, OR one of the
   * named Stage B changes below, compared with that change cut out / normalised — never a blanket accept. */
  /** Cut the balanced <section …>…</section> that starts at `from` (the first `<section` at or after it). */
  const cutSection = (html, startMarker, after = '') => {
    if (typeof html !== 'string') return null
    const base = after ? html.indexOf(after) : 0
    const s0 = html.indexOf(startMarker, Math.max(0, base)); if (s0 < 0) return null
    const re = /<section\b|<\/section>/g; re.lastIndex = s0
    let depth = 0
    for (let m; (m = re.exec(html));) { depth += m[0] === '</section>' ? -1 : 1; if (depth === 0) return html.slice(0, s0) + '«CUT»' + html.slice(m.index + 10) }
    return null
  }
  const MONTHS_FREE = /(aria-label="Months free" value=")3(")/g
  const monthsFree1 = v => (typeof v === 'string' ? v.replace(MONTHS_FREE, '$11$2') : v)
  const dropDescriptions = o => JSON.parse(JSON.stringify(o, (k, v) => (k === 'description' ? undefined : v)))
  const descriptions = o => { const out = []; JSON.stringify(o, (k, v) => { if (k === 'description') out.push(v); return v }); return out }
  const NEW_DESC = {
    'en-GB': 'Every HatchGrab feature on every plan, side by side — Pay as you go, Pro and Unlimited, with fees and allowances. Your first 3 months include everything.',
    'en-US': 'Every HatchGrab feature on every plan, side by side — Pay as you go, Pro, and Unlimited, with fees and allowances. Your first 3 months include everything.',
  }
  const rendered = v => typeof v === 'string' && !v.startsWith('ERROR') && v.length > 1000
  /* ⚠️ RE-PINNED (compare-tidy, 20 October 2026) — THE NAMED /compare TIDY (docs/compare-tidy-report.md), applied to the
   * /compare page HTML and the calculator's default / hasSystem views before the "Months free" check below. Each transform
   * must apply exactly as named, or the view is left as it was and fails:
   *   T-staff     BEFORE's staff card (the balanced Card <div> titled "How many people work the van?" — en-US "the truck?")
   *               is cut out;
   *   T-renumber  BEFORE's later card numbers 4 → 3, 5 → 4, 6 → 5 (each exactly once);
   *   T-panel     AFTER's orders card renders the fee line and the "We suggest" panel after its slider (BEFORE: nothing
   *               there) — asserted (fee-line <p>, then the panel naming the plan cheapest at the slider's value, and a
   *               "Use … instead" button for every other public plan) and cut;
   *   T-ungate    hasSystem only: the orders / fee / months-free cards were disabled (opacity:0.45) waiting on the staff
   *               answer and are enabled (opacity:1) now; and the scroll link + results render — with no rate typed that is
   *               the "Enter what you pay now…" prompt, asserted exactly (en-GB words; en-US has no override) and cut.
   * ⚠️ RE-PINNED (compare-tidy-2, 20 October 2026) — two more, same rules:
   *   T-free      BEFORE's months-free card (the balanced Card <div> numbered 6, "Your introductory offer — how many months
   *               free?", with the Months free input) is cut out; AFTER must have no Months free input — the months are
   *               freeMonthsOverride ?? the trial (data), so the "Months free" mapping below no longer applies;
   *   T-inert     every dimmed AFTER card is `style="…;opacity:0.45;pointer-events:none" inert=""` — asserted on each and
   *               mapped back to BEFORE's `style="…;opacity:0.45"`; an undimmed card carries neither. */
  const COMPARE_TIDY_2 = /freeMonthsOverride/.test(read('app/compare/CostComparison.tsx'))
  const DIM_BEFORE = 'style="border-color:#E2E8F0;opacity:0.45"', DIM_AFTER = 'style="border-color:#E2E8F0;opacity:0.45;pointer-events:none" inert=""'
  const CMP_MSG = JSON.parse(read('messages/ns/en-GB/compare.json'))
  const CARD_OPEN = '<div class="rounded-2xl border bg-white p-5 shadow-sm transition md:p-6"'
  const STEP_SPAN = n => `style="background-color:#F1F5F9">${n}</span><p class="text-base font-bold">`
  const SLIDER_END = /aria-label="Monthly online order value per truck" value="(\d+)"\/>/
  const balancedDiv = (html, s0) => { const re = /<div\b|<\/div>/g; re.lastIndex = s0; let d = 0
    for (let m; (m = re.exec(html));) { d += m[0] === '</div>' ? -1 : 1; if (d === 0) return m.index + 6 } return -1 }
  const once = (s, x) => s.split(x).length === 2
  const tidyCompare = (k, a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string') return null
    const cc = /\|US\|/.test(k) ? 'US' : 'GB', answered = /\|hasSystem$/.test(k)
    // T-staff
    // the staff card's title in BEFORE's words: en-GB "the van", en-US "the truck" (one truck in every one of these views)
    const ti = b.indexOf(STEP_SPAN(3) + `How many people work the ${cc === 'US' ? 'truck' : 'van'}?</p>`); if (ti < 0) return null
    const s0 = b.lastIndexOf(CARD_OPEN, ti), e0 = balancedDiv(b, s0); if (s0 < 0 || e0 < 0) return null
    let bb = b.slice(0, s0) + b.slice(e0)
    // T-free (compare-tidy-2)
    if (COMPARE_TIDY_2) {
      const fi = bb.indexOf(STEP_SPAN(6) + 'Your introductory offer'); if (fi < 0) return null
      const f0 = bb.lastIndexOf(CARD_OPEN, fi), f1 = balancedDiv(bb, f0); if (f0 < 0 || f1 < 0) return null
      if (!once(bb.slice(f0, f1), 'aria-label="Months free"')) return null
      bb = bb.slice(0, f0) + bb.slice(f1)
      if (a.includes('aria-label="Months free"') || /Your introductory offer/.test(a)) return null
      // T-inert: every dimmed card inert, and nothing else
      const cards = a.match(new RegExp(CARD_OPEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^>]*>', 'g')) || []
      if (!cards.every(c => c.includes('opacity:0.45') ? c.endsWith(DIM_AFTER + '>') : !/inert|pointer-events/.test(c))) return null
      a = a.split(DIM_AFTER).join(DIM_BEFORE)
    }
    // T-renumber
    for (const n of COMPARE_TIDY_2 ? [4, 5] : [4, 5, 6]) { if (!once(bb, STEP_SPAN(n))) return null; bb = bb.replace(STEP_SPAN(n), STEP_SPAN(n - 1)) }
    if (COMPARE_TIDY_2 && (bb.includes(STEP_SPAN(5)) || a.includes(STEP_SPAN(5)))) return null
    // T-panel
    const ms = SLIDER_END.exec(a), mb = SLIDER_END.exec(bb); if (!ms || !mb || ms[1] !== mb[1]) return null
    const pa = ms.index + ms[0].length, pe = a.indexOf('</div>' + CARD_OPEN, pa)
    if (pe < 0 || !bb.startsWith('</div>' + CARD_OPEN, mb.index + mb[0].length)) return null
    const panel = a.slice(pa, pe), gmv = Number(ms[1]) * 100
    const offer = CATALOG.plans.filter(p => p.isPublic && p.active).sort((x, y) => x.sortOrder - y.sortOrder)
      .map(p => ({ p, r: CATALOG.prices.find(r => r.planKey === p.key && r.countryCode === cc) })).filter(x => x.r)
    const cost = ({ r }) => r.includedOnlineMinor === null ? r.monthlyMinor : r.monthlyMinor + (r.feeBps / 10000) * Math.max(0, gmv - r.includedOnlineMinor)
    let best = null; for (const o of offer) if (!best || cost(o) < cost(best) - 1e-9) best = o
    const panelOk = panel.startsWith('<p class="mt-3 text-sm leading-relaxed text-slate-600">')
      && panel.includes(`</p><div class="mt-4 rounded-xl px-5 py-4" style="background-color:#F8FAFC"><p class="text-xs font-bold uppercase tracking-wider text-slate-400">${CMP_MSG.plan.weSuggest}</p><p class="mt-1 text-2xl font-black" style="color:#1A2233">${best.p.name}</p>`)
      && offer.filter(o => o !== best).every(o => panel.includes(`>${CMP_MSG.plan.switchTo.replace('{plan}', o.p.name)}</button>`))
      && panel.endsWith('</div></div>') && !panel.includes(CARD_OPEN) && !/How many people|Two or more|own login/.test(a)
    if (!panelOk) return null
    let aa = a.slice(0, pa) + a.slice(pe)
    // T-ungate
    if (answered) {
      const dim = (bb.match(/style="border-color:#E2E8F0;opacity:0\.45"/g) || []).length
      if (dim !== (COMPARE_TIDY_2 ? 2 : 3) || /opacity:0\.45/.test(aa)) return null   // ⚠️ RE-PINNED (compare-tidy-2): the months card (the 3rd) is cut
      bb = bb.replace(/style="border-color:#E2E8F0;opacity:0\.45"/g, 'style="border-color:#E2E8F0;opacity:1"')
      const results = '<p class="mt-6 text-center"><button type="button" class="text-sm font-semibold text-slate-500 underline underline-offset-4 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2">'
        + CMP_MSG.jump.saving + '</button></p><div id="cost-results" class="mt-6 scroll-mt-4 space-y-4"><p class="rounded-2xl border bg-white p-6 text-center text-base font-semibold text-slate-600 shadow-sm" style="border-color:#E2E8F0">'
        + CMP_MSG.enterRate + '</p></div>'
      if (!once(aa, results) || bb.includes('id="cost-results"')) return null
      aa = aa.replace(results, '')
    } else if (aa.includes('id="cost-results"') || !/opacity:0\.45/.test(aa)) return null
    return [aa, bb]
  }
  /** The named Stage B change a view key falls under, as [name, (after, before) → ok]; null = must be byte-identical.
   *  Scoped to the exact views Stage B changes: every metadata view but /features', and every US-switched-off view
   *  (`-usOff`, where the US pricing is not shown), stay byte-identical. */
  // landing-mobile-tidy (21 October 2026): the hero note, new (two spans) → old (one paragraph); null if the new note is not
  // there exactly once.
  const LMT_NOTE = ['<p class="hero-cta-note"><span class="hero-cta-lead">Upload a photo of your menu and see it working in under 60 seconds.</span><span class="hero-cta-small">No signup. No card.</span></p>',
    '<p class="hero-cta-note">No signup, no card.<br/>See it working in under 60 seconds.</p>']
  const lmtNote = a => (a.split(LMT_NOTE[0]).length === 2 ? a.replace(LMT_NOTE[0], LMT_NOTE[1]) : null)
  const stageB = (k) => {
    // ⚠️ RE-PINNED (landing-mobile-tidy, 21 October 2026): + the approved hero line under "Upload my menu" — exactly one new
    // two-span note (LMT_NOTE), mapped back to the old one-paragraph note before the rest is compared byte for byte.
    if (/^landing\|[A-Z]+\|html(-usOn|-cookieUS)?$/.test(k)) return ['landing: only <section id="pricing"> differs (banner → cards → cheapest bar → footnote), and the approved hero note',
      (a0, b) => { const a = lmtNote(a0); return !!a && !!cutSection(a, '<section id="pricing"') && cutSection(a, '<section id="pricing"') === cutSection(b, '<section id="pricing"') && a.includes('<div class="trial-banner">') }]
    // ⚠️ RE-PINNED (features-page-restore, 20 October 2026): on a tree with features-page-restore, /features' section must be
    // EXACTLY that named change (scripts/_lp-features-restore.cjs proven(): eyebrow, `pt pt-features` + hidden span +
    // var(--cmp-col), `.pt-name` / `.pt-desc` from featuresPage.detail, the text ✓, `.pt-val`, the `.fn` footnotes) of a
    // Stage-B-shaped section, byte for byte — and that Stage B shape carries the one `pt pt-card` table, as before.
    if (/^features\|[A-Z]+\|html(-usOn|-cookieUS)?$/.test(k)) return [FR.LANDED ? '/features: only its content section differs (h1 / lede / callout / PlanTable / footnote), in features-page-restore\'s look (eyebrow, the "features" table with descriptions, the .fn footnotes)' : '/features: only its content section differs (h1 / lede / callout / PlanTable / footnote)',
      (a, b) => !!cutSection(a, '<section', '</nav>') && cutSection(a, '<section', '</nav>') === cutSection(b, '<section', '</nav>')
        && (FR.LANDED ? (pr => !pr.problems && planTable(pr.stageB))(FR.proven(a)) : planTable(a))]
    if (/^features\|[A-Z]+\|meta(-usOn)?$/.test(k)) return ['/features metadata: only the description (THE one SEO change; title / canonical / hreflang / robots / og:url unchanged)',
      (a, b) => JSON.stringify(dropDescriptions(a)) === JSON.stringify(dropDescriptions(b))
        && descriptions(a).length === 3 && descriptions(a).every(d => d === NEW_DESC[/\|US\|/.test(k) ? 'en-US' : 'en-GB'])]
    // ⚠️ RE-PINNED (compare-tidy, 20 October 2026): + the named /compare tidy (tidyCompare above), applied first.
    if (/^compare\|[A-Z]+\|html(-usOn|-cookieUS)?$/.test(k) || /^calc\|[A-Z]+\|(default|hasSystem)$/.test(k)) return [COMPARE_TIDY_2 ? '/compare: only compare-tidy\'s T-staff / T-renumber / T-panel / T-ungate and compare-tidy-2\'s T-free / T-inert (no "Months free" input left)' : '/compare: only the "Months free" default (1 → the trial\'s 3 months), and compare-tidy\'s T-staff / T-renumber / T-panel / T-ungate',
      (a0, b0) => { const r = tidyCompare(k, a0, b0); if (!r) return false; const [a, b] = r
        // ⚠️ RE-PINNED (compare-tidy-2, 20 October 2026): no Months free input remains (T-free) — the rest is byte-identical.
        if (COMPARE_TIDY_2) return typeof a === 'string' && a === b
        return typeof a === 'string' && (a.match(MONTHS_FREE) || []).length === 1 && monthsFree1(a) === b }]
    if (/^calc\|/.test(k)) return ['calculator view rebuilt (plan suggested = cheapest at volume, lib/plan-offer cheapestAt) — scripts/pricing-pages.cjs', (a) => rendered(a)]
    if (/^pdf\|[A-Z]+\|html$/.test(k)) return ['plans PDF rebuilt (banner, cards, cheapest bar, the plan table, footnote) — scripts/pricing-pages.cjs', (a) => rendered(a) && a.includes('<table')]
    return null
  }
  /* ⚠️ RE-PINNED (seo-fixes, 20 October 2026): seo-fixes changed markup and tags with nothing visible moving. Each of its
   * named changes below is VERIFIED on the AFTER value and then mapped back to BEFORE's form (or, where seo-fixes removed
   * something, cut from BEFORE), so the Stage B checks and the byte-identical check above still run on every other byte.
   * A view whose change is not exactly the named one is not normalised (and fails both its seo-fixes check and the rest).
   *   SEO-menu    M1: each country menu's <ul class="cc-menu cc-menu-closed"> is always rendered (header + footer), its
   *               options <a href="/uk|/us" role="menuitemradio" aria-checked class="cc-item"> (the kit's pathname is '/',
   *               a page with no country address → each country's landing), the checked one with the tick, the ul's id =
   *               its button's aria-controls;
   *   SEO-badges  S7: the two store badges gain loading="lazy", so React no longer emits their two
   *               <link rel="preload" as="image"> hints;
   *   SEO-ld      M5 + S9: the landing JSON-LD is one { @context, @graph: [Organization, WebSite, SoftwareApplication] }
   *               block — the SoftwareApplication keeps BEFORE's words, its url is the country address, publisher → the
   *               Organization's @id, offers = one Offer per public plan in GBP / USD;
   *   SEO-compare N1: /compare's country tags — title 'Cost calculator — HatchGrab UK|US', the compare.meta description,
   *               mirrored into og / twitter (still noindex);
   *   SEO-own-url S1: /contact, /privacy, /terms — canonical + og:url = https://www.hatchgrab.com<path>;
   *   SEO-sitemap S5: HatchGrab — the country pages carry alternates.languages (each switched-on country + x-default) and
   *               lastmod = MARKETING_COPY_UPDATED (2026-10-20, the latest of the three inputs here, never request time),
   *               then /privacy /terms /country-terms (lastmod = lib/legal.ts's date) and /contact (no lastmod);
   *               Village Foodie — its one entry loses lastmod. */
  const ORG_ID = 'https://www.hatchgrab.com/#organization'
  const MENU_UL = /<ul id="(_R_[0-9a-z]+_)" role="menu" aria-label="Country" class="cc-menu cc-menu-closed">([\s\S]*?)<\/ul>/g
  const MENU_LI = /<li role="none"><a href="\/(uk|us)" role="menuitemradio" aria-checked="(true|false)" class="cc-item"><img class="cc-flag" src="data:image\/svg\+xml;charset=utf-8,[^"]+" alt="" width="21" height="14"\/><span class="cc-item-name">(United Kingdom|United States)<\/span>(<svg class="cc-tick" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3\.5 8\.5 6\.5 11\.5 12\.5 4\.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><\/path><\/svg>)?<\/a><\/li>/g
  const NAME_OF = { uk: 'United Kingdom', us: 'United States' }
  /** SEO-menu: the AFTER html with its two menus verified and removed; null if they are not exactly the named markup. */
  const seoMenus = a => {
    const uls = [...a.matchAll(MENU_UL)]
    if (uls.length !== 2) return null
    for (const m of uls) {
      if (!a.slice(0, m.index).endsWith('</button>') || !a.slice(Math.max(0, m.index - 3000), m.index).includes(`aria-controls="${m[1]}"`)) return null
      const lis = [...m[2].matchAll(MENU_LI)]
      if (lis.map(x => x[0]).join('') !== m[2] || lis.length === 0) return null
      if (lis.some(x => NAME_OF[x[1]] !== x[3] || (x[2] === 'true') !== !!x[4]) || lis.filter(x => x[2] === 'true').length !== 1) return null
    }
    return a.replace(MENU_UL, '')
  }
  const BADGE_PRELOAD = /<link rel="preload" as="image" href="\/badges\/[^"]+"\/>/g
  const BADGE_LAZY = /(<img src="\/badges\/[^"]+" alt="[^"]+" width="\d+" height="40") loading="lazy"/g
  /** SEO-badges: [after without the two lazy attributes, before without the two preload hints]; null if not exactly that. */
  const seoBadges = (a, b) => (a.match(BADGE_LAZY) || []).length === 2 && (b.match(BADGE_PRELOAD) || []).length === 2 && !BADGE_PRELOAD.test(a)
    ? [a.replace(BADGE_LAZY, '$1'), b.replace(BADGE_PRELOAD, '')] : null
  /** SEO-ld: the new graph checked against BEFORE's one SoftwareApplication object. */
  const ldOk = (g, old, cc) => {
    const slug = cc === 'US' ? 'us' : 'uk', cur = cc === 'US' ? 'USD' : 'GBP'
    if (!g || !old || g['@context'] !== 'https://schema.org' || !Array.isArray(g['@graph']) || g['@graph'].map(n => n['@type']).join(',') !== 'Organization,WebSite,SoftwareApplication') return false
    const [org, site, app] = g['@graph']
    if (org['@id'] !== ORG_ID || org.name !== 'HatchGrab' || site['@id'] !== 'https://www.hatchgrab.com/#website' || site.publisher?.['@id'] !== ORG_ID) return false
    // ⚠️ RE-PINNED (ai-search-1, 21 October 2026): areaServed (not a SoftwareApplication property) became countriesSupported
    // — the switched-on countries' ISO codes — and the graph gained legalName / address / operatingSystem (lib/company.ts,
    // lib/structured-data.ts). The other words are BEFORE's, unchanged.
    if (['name', 'applicationCategory', 'applicationSubCategory', 'description', 'inLanguage', 'audience'].some(f => JSON.stringify(app[f]) !== JSON.stringify(old[f]))) return false
    if (!(!require('fs').existsSync(require('path').join(REPO, 'lib/robots-policy.ts'))
      ? JSON.stringify(app.areaServed) === JSON.stringify(old.areaServed)
      : (!('areaServed' in app) && Array.isArray(app.countriesSupported) && app.countriesSupported.includes(cc) && app.countriesSupported.every(c => /^[A-Z]{2}$/.test(c))
        && app.operatingSystem === 'Web, iOS, Android' && org.legalName === 'HatchGrab Ltd' && org.address?.addressCountry === 'GB'))) return false
    const pub = CATALOG.plans.filter(p => p.isPublic && p.active).sort((x, y) => x.sortOrder - y.sortOrder).map(p => p.name).join(',')
    return app.url === `https://www.hatchgrab.com/${slug}` && JSON.stringify(app.publisher) === JSON.stringify({ '@id': ORG_ID })
      && Array.isArray(app.offers) && app.offers.map(o => o.name).join(',') === pub
      && app.offers.every(o => o['@type'] === 'Offer' && o.priceCurrency === cur && o.url === `https://www.hatchgrab.com/${slug}#pricing`)
  }
  const LD_SCRIPT = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
  const seoLdHtml = (a, b, cc) => {
    const ma = a.match(LD_SCRIPT), mb = b.match(LD_SCRIPT)
    if (!ma || !mb) return null
    let ga, gb; try { ga = JSON.parse(ma[1]); gb = JSON.parse(mb[1]) } catch { return null }
    return ldOk(ga, gb, cc) ? a.replace(ma[0], mb[0]) : null
  }
  const ccOf = k => (/\|US\|/.test(k) ? 'US' : 'GB')
  const CMP_DESC = 'Compare what your online orders cost you now with a year on HatchGrab — an estimate in a minute.'
  const LEGAL_LASTMOD = '2026-10-19T00:00:00.000Z', COPY_LASTMOD = '2026-10-20T00:00:00.000Z'
  // ⚠️ RE-PINNED (pricing-tidy, 20 October 2026): the Terms of Service were re-dated 20 October 2026 (§4 edited), so
  // /terms's lastmod is 2026-10-20; /privacy and /country-terms stay 2026-10-19.
  // ⚠️ RE-PINNED (ireland-3, 21 October 2026): the Country-specific terms gained the Ireland section and were re-dated
  // 21 October 2026, so /country-terms's lastmod is 2026-10-21 (scripts/_lp-ireland-3.cjs).
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS harness module (ireland-3)
  const IE3 = require('./_lp-ireland-3.cjs')
  // ⚠️ RE-PINNED (anz-terms, 22 October 2026): …and re-dated 22 October 2026 with the Australia and New Zealand sections
  // (scripts/_lp-anz-terms.cjs).
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- CommonJS harness module (anz-terms)
  const ANZT = require('./_lp-anz-terms.cjs')
  const LEGAL_LASTMOD_OF = { privacy: LEGAL_LASTMOD, terms: '2026-10-20T00:00:00.000Z', 'country-terms': ANZT.LANDED ? ANZT.COUNTRY_TERMS_LASTMOD_NEW : IE3.LANDED ? IE3.COUNTRY_TERMS_LASTMOD_NEW : LEGAL_LASTMOD }
  /** The seo-fixes named change a view key falls under, as [name, (after, before) → [after', before'] | null]. */
  const seoFixes = (k) => {
    if (/^(landing|features|compare)\|[A-Z]+\|html(-usOn|-cookieUS)?$/.test(k)) return ['SEO-menu + SEO-badges' + (/^landing/.test(k) ? ' + SEO-ld' : '') + ': the country menus\' <ul> + <a role="menuitemradio"> options, the badges\' loading="lazy" (no image preload hints)' + (/^landing/.test(k) ? ', the one @graph JSON-LD' : ''),
      (a, b) => {
        if (typeof a !== 'string' || typeof b !== 'string') return null
        let x = seoMenus(a); if (x === null) return null
        const bb = seoBadges(x, b); if (!bb) return null
        x = bb[0]
        if (/^landing/.test(k)) { x = seoLdHtml(x, bb[1], ccOf(k)); if (x === null) return null }
        // ⚠️ RE-PINNED (copy, Dominic, 20 October 2026): the landing trust line names the trial length — "First 3 months completely
        // free, everything unlocked" (the seed's trial_months; scripts/_lp-seo-fixes.cjs copy-trust-line), was "First month 100%
        // free, everything unlocked". Mapped back exactly, and it MUST be there (both places: hero, final CTA).
        if (/^landing/.test(k)) {
          const NEW = require('./_lp-seo-fixes.cjs').trustLine('First month 100% free, everything unlocked')
          if ((x.split(NEW).length - 1) !== 2) return null
          x = x.split(NEW).join('First month 100% free, everything unlocked')
        }
        return [x, bb[1]]
      }]
    if (/^landing\|[A-Z]+\|meta(-usOn)?$/.test(k)) return ['SEO-ld: landing metadata — only the JSON-LD (one @graph; same words; url = the country address; offers)',
      (a, b) => a && b && Array.isArray(a.ld) && a.ld.length === 1 && Array.isArray(b.ld) && b.ld.length === 1 && ldOk(a.ld[0], b.ld[0], ccOf(k))
        && JSON.stringify({ ...a, ld: undefined }) === JSON.stringify({ ...b, ld: undefined }) ? [{ ...a, ld: b.ld }, b] : null]
    if (/^compare\|[A-Z]+\|meta(-usOn)?$/.test(k)) return ['SEO-compare: /compare metadata — title "Cost calculator — HatchGrab UK|US" + description (and og / twitter copies); still noindex',
      (a, b) => {
        if (!a || !b || !a.merged || !b.merged) return null
        const title = `Cost calculator — HatchGrab ${ccOf(k) === 'US' ? 'US' : 'UK'}`, m = a.merged
        const back = { ...m, title: b.merged.title, description: b.merged.description, openGraph: { ...m.openGraph, title: b.merged.openGraph?.title, description: b.merged.openGraph?.description }, twitter: { ...m.twitter, title: b.merged.twitter?.title, description: b.merged.twitter?.description } }
        const ok = m.title === title && m.description === CMP_DESC && m.openGraph?.title === title && m.openGraph?.description === CMP_DESC && m.twitter?.title === title && m.twitter?.description === CMP_DESC && m.robots?.index === false
          && JSON.stringify(back) === JSON.stringify(b.merged)
        return ok ? [{ ...a, merged: b.merged }, b] : null
      }]
    if (/^(contact\|[A-Z]+\|meta|legal\|[A-Z]+\|meta-(privacy|terms))$/.test(k)) return ['SEO-own-url: /contact /privacy /terms metadata — canonical + og:url = https://www.hatchgrab.com<path>',
      (a, b) => {
        const own = 'https://www.hatchgrab.com/' + (k.startsWith('contact') ? 'contact' : k.split('meta-')[1])
        if (!a || !b || a.alternates?.canonical !== own || a.openGraph?.url !== own || b.alternates !== undefined) return null
        const back = { ...a, openGraph: { ...a.openGraph, url: b.openGraph?.url } }; delete back.alternates
        return JSON.stringify(back) === JSON.stringify(b) ? [b, b] : null
      }]
    // ⚠️ RE-PINNED (compare-tidy F2, 20 October 2026): the Village Foodie sitemap gains a second entry, /contact (yearly, 0.3,
    // no lastmod), after the home page — verified exactly here and cut, so BEFORE's one entry is still the comparison.
    if (/^sitemap\|/.test(k)) return ['SEO-sitemap: hreflang alternates + data lastmod on the country pages, then /privacy /terms /country-terms /contact; Village Foodie loses lastmod and gains /contact (compare-tidy F2)',
      (a, b) => {
        if (!Array.isArray(a) || !Array.isArray(b)) return null
        if (/villagefoodie/.test(k)) return JSON.stringify(a) === JSON.stringify([{ url: 'https://www.villagefoodie.co.uk/', changeFrequency: 'daily', priority: 1 },
          { url: 'https://www.villagefoodie.co.uk/contact', changeFrequency: 'yearly', priority: 0.3 }]) && b.length === 1 && b[0].url === a[0].url ? [b, b] : null
        const on = /usOn/.test(k) ? ['uk', 'us'] : ['uk']
        const head = a.slice(0, b.length), tail = a.slice(b.length)
        const wantTail = [...['privacy', 'terms', 'country-terms'].map(p => ({ url: `https://www.hatchgrab.com/${p}`, lastModified: LEGAL_LASTMOD_OF[p], changeFrequency: 'yearly', priority: 0.3 })),
          { url: 'https://www.hatchgrab.com/contact', changeFrequency: 'yearly', priority: 0.3 }]
        if (JSON.stringify(tail) !== JSON.stringify(wantTail)) return null
        const back = head.map((e, i) => {
          const sub = e.url.replace(/^https:\/\/www\.hatchgrab\.com\/(uk|us)/, '')
          const langs = Object.fromEntries([...on.map(c => [c === 'us' ? 'en-US' : 'en-GB', `https://www.hatchgrab.com/${c}${sub}`]), ['x-default', `https://www.hatchgrab.com${sub || '/'}`]])
          if (e.lastModified !== COPY_LASTMOD || JSON.stringify(e.alternates) !== JSON.stringify({ languages: langs })) return null
          const r = { ...e, lastModified: b[i].lastModified }; delete r.alternates; return r
        })
        return JSON.stringify(back) === JSON.stringify(b) ? [b, b] : null
      }]
    return null
  }
  for (const area of ['pages', 'parts']) {
    const keys = Object.keys(B[area])
    // ⚠️ RE-PINNED (seo-fixes, 20 October 2026): every check below reads the seo-fixes-normalised sides.
    const seoNamed = new Map(), N = {}
    for (const k of keys) {
      const sf = seoFixes(k)
      if (!sf) { N[k] = [A[area][k], B[area][k]]; continue }
      const r = sf[1](A[area][k], B[area][k])
      const e = seoNamed.get(sf[0]) || { keys: [], bad: [] }; e.keys.push(k); if (!r) e.bad.push(k); seoNamed.set(sf[0], e)
      N[k] = r || [A[area][k], B[area][k]]
    }
    for (const [n, e] of seoNamed) t(`${area}: seo-fixes ${n} (${e.keys.length} views)`, e.bad.length === 0, e.bad.join(', '))
    const identical = keys.filter(k => !stageB(k))
    const diff = identical.filter(k => JSON.stringify(N[k][0]) !== JSON.stringify(N[k][1]))
    t(`${area}: every view Stage B does not touch is byte-identical, seo-fixes' named changes aside (${identical.length} views: ${[...new Set(identical.map(k => k.split('|')[0]))].join(', ')})`, diff.length === 0, diff.join(', '))
    const named = new Map()
    for (const k of keys.filter(k => stageB(k))) { const [n] = stageB(k); named.set(n, [...(named.get(n) || []), k]) }
    for (const [n, ks] of named) {
      const bad = ks.filter(k => !stageB(k)[1](N[k][0], N[k][1]))
      t(`${area}: ${n} (${ks.length} views)`, bad.length === 0, bad.join(', '))
    }
  }
  // Billing: the frozen matrix is REPLACED by the one <PlanTable> in every view that had it (rendered proof of the table
  // itself: scripts/pricing-pages.cjs). The highlighted column is the truck's effective plan when that plan is public.
  const hadTable = Object.keys(B.billing).filter(k => table(B.billing[k]))
  const notReplaced = hadTable.filter(k => !planTable(A.billing[k]))
  console.log(`    Billing: ${hadTable.length} BEFORE views had the frozen matrix; ${hadTable.length - notReplaced.length} now render the one <PlanTable> in its place`)
  t('Billing: every view that had the frozen matrix now renders the one <PlanTable> instead (and no matrix header)', hadTable.length >= 20 && notReplaced.length === 0, notReplaced.join(', '))
  const hlName = v => ((v || '').match(/<div class="pt-col pt-hl" role="columnheader"><span class="pt-col-name">([^<]*)<\/span>/) || [])[1] || null
  const hlBad = []
  for (const cc of ['GB', 'US']) for (const key of ['trial', 'demo', 'payg', 'pro', 'unlimited', 'tester']) {
    const plan = CATALOG.plans.find(p => p.key === key)
    const want = plan.isPublic ? plan.name : null
    if (hlName(A.billing[`billing|${cc}|plan|${key}`]) !== want) hlBad.push(`${cc} ${key}: ${hlName(A.billing[`billing|${cc}|plan|${key}`])}`)
  }
  t('Billing: the highlighted column is the truck\'s plan (payg / pro / unlimited), and none for trial / demo / tester', hlBad.length === 0, hlBad.join('; '))
  t('Billing: the frozen footnotes are replaced by the one pricing footnote', ['GB', 'US'].every(cc => /<p class="text-xs text-slate-500 mt-3 px-1">\* Plus /.test(A.billing[`billing|${cc}|plan|pro`] || '')))
  const legacyImport = spawnSync(process.execPath, [path.join(REPO, 'scripts/legacy-pricing-imports.cjs')], { encoding: 'utf8' })
  t('the frozen copy is gone and nothing reads the retired columns (scripts/legacy-pricing-imports.cjs)', legacyImport.status === 0, legacyImport.stdout.slice(-400))
  if (!reuse) fs.rmSync(out, { recursive: true, force: true })
}

fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail ? '🔴' : '✅'} plans-data-model: ${pass} passed, ${fail} failed${RENDER ? '' : ' (--no-render: sections 7 and 8 skipped)'}`)
process.exit(fail ? 1 : 0)
