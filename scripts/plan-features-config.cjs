#!/usr/bin/env node
// scripts/plan-features-config.cjs — THE PROOF FOR plan-features-config, STAGE A2 (docs/plan-features-config-report.md).
//
//   node scripts/plan-features-config.cjs        (≈ 1 min: a few esbuild bundles; NO NETWORK, NO DATABASE)
//
// LOCALHOST ONLY. The plan catalogue is the two migrations' own seed (scripts/_plans-catalog-fixture.cjs parses
// 20261024_plans.sql and applies 20261025_plan_features.sql on top). Routes run on the render kit's in-memory database;
// the live trucks below are FIXTURES copied from their rows, read (read-only) on 20 October 2026 — nothing live is
// touched.
//
//   1  the catalogue: payg switches off exactly WhatsApp auto-replies, social media posts and Messenger & Instagram
//      replies; every other plan has no rows; payg Pay at Hatch TRUE; trial 4 months; 1 included van everywhere; an
//      unknown feature key or a trial length on a non-trial plan is refused by the loader
//   2  every plan × every feature, through the one resolution order (override → effective plan → allowed): payg is
//      refused the three with the prompt naming Pro; pro / unlimited / trial / demo / tester have everything; overrides
//      win both ways
//   3  an ended plan resolves to payg WITH payg's switches (test-truck fixture, restored after); which LIVE trucks lose
//      which features at deploy
//   4  SERVER: the real routes refuse a payg truck `feature_not_on_plan` naming Pro (weekly post, places, WhatsApp setup);
//      an override-off truck gets `feature_switched_off`; an override-on payg truck passes the gate
//   5  UI: the one prompt (old FeatureGate styling) names Pro, with the plan line and "Upgrade →" — no link on iOS; an
//      override-off feature shows the fallback; pro sees the feature
//   6  trial length: a provisioned truck ends 4 months on at the end of that day in ITS zone (GB and US); changing
//      trial_months changes it; nothing else is written to an existing truck
//   ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the Stage B migration adds payg `event_types` off (payg is
//      refused FOUR), shortens the trial to 3 months, and an unknown feature key is now IGNORED (set aside), not refused.
//   7  Pay at Hatch: offered when the plan allows it; a fixture plan with it FALSE hides it (menu) and refuses it at
//      submit — and a card order still goes through
//   8  the Billing card's prices come from plan_prices and hide only under the van modal's rule (US switched on → real
//      $, switched off → TBD; GB unchanged); the founder offer (unlimited at 4900 until a date) shows £49 and reverts
const fs = require('fs')
const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'plan-features-config' })
const { REPO, h } = kit
const SEEDS = require('./_country-settings-gb.cjs')
const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
const { seedCatalog } = require('./_plans-catalog-fixture.cjs')

let pass = 0, fail = 0
const t = (label, ok, detail) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label + (detail !== undefined ? `\n      ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600)}` : '')) } }
const head = s => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 100 - s.length)))
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))

const CATALOG = seedCatalog(REPO)
/** The catalogue as database rows (optionally changed), for the in-memory database. */
const planTables = (cat = CATALOG) => ({
  plans: cat.plans.map(p => snake(p)),
  plan_prices: cat.prices.map(p => snake(p)),
  plan_features: cat.features.map(f => snake(f)),
})
const withPlan = (key, patch) => ({ ...CATALOG, plans: CATALOG.plans.map(p => (p.key === key ? { ...p, ...patch } : p)) })

/** The live trucks, copied from their rows (read-only SQL, 20 October 2026, after 20261024_plans.sql ran). */
const LIVE = [
  ['demo-zsts9y33grcx2pf6xnmjrqj1a2', 'demo', null, { batch_reservations: true }],
  ['pizzeria-gusto', 'trial', '2026-12-31T23:59:59+00:00', {}],
  ['real-thai-food', 'trial', '2026-09-30T00:00:00+00:00', {}],
  ['test-truck', 'trial', '2026-12-31T23:59:59+00:00', { batch_reservations: true, places_posts_preview: true, whatsapp_setup_preview: true }],
  ['test-truck-2', 'demo', null, { batch_reservations: true }],
  ['test-truck-3', 'demo', null, { batch_reservations: true }],
  ['test-truck-3-2', 'trial', '2026-12-31T23:59:59+00:00', {}],
  ['test-truck-us', 'trial', '2026-12-31T23:59:59+00:00', { batch_reservations: true, places_posts_preview: true, whatsapp_setup_preview: true }],
  ['tikka-tonic', 'trial', '2026-12-31T23:59:59+00:00', {}],
  ['tt3', 'demo', null, { batch_reservations: true }],
  ['village-spice', 'trial', null, {}],
].map(([id, plan, end, ov]) => ({ id, plan, trial_expires_at: end, feature_overrides: ov }))
const DEPLOY_DAY = new Date('2026-10-21T12:00:00Z')

const STUBS = {
  '@/lib/supabase/server': `export async function createSupabaseServerClient() { return { auth: { getUser: async () => ({ data: { user: globalThis.__harnessUser ?? null }, error: null }) } } }`,
  '@/lib/auth/admin': `export async function verifyAdmin() { return true }`,
  '@/lib/commerce-policy': 'export function purchaseCtaAllowed() { return !globalThis.__ios }',
  '@/lib/apns': 'export async function sendOrderPendingPush() {}\nexport function normaliseApnsKey(k) { return k }',
  '@/lib/fcm': 'export async function sendOrderPendingPush() {}',
  '@/lib/email': 'export async function sendConfirmationEmail() { return true }\nexport async function sendEventCancellationEmail() {}',
  '@/lib/payments/authorize': `export async function authorizeDraft() { return { ok: true, clientSecret: 'cs_harness', stripeAccount: 'acct_harness' } }
export async function cancelAuthorization() { return { ok: true } }
export async function stripeAccountForTruck() { return 'acct_harness' }`,
  '@/lib/payments/capture': 'export async function captureOnConfirmation() { return { ok: true, outcome: "nothing_to_capture" } }',
  '@upstash/redis': `export class Redis { static fromEnv() { return new Redis() } }`,
  '@upstash/ratelimit': `export class Ratelimit { static slidingWindow() { return {} } static fixedWindow() { return {} } static tokenBucket() { return {} } async limit() { return { success: true, limit: 1, remaining: 0, reset: 0, pending: Promise.resolve() } } }`,
}
for (const [k, v] of Object.entries({ NEXT_PUBLIC_WHATSAPP_SIGNUP_APP_ID: '1234567890', META_WHATSAPP_APP_SECRET: 'harness-app-secret', AUDIT_HASH_SECRET: 'harness-audit' })) process.env[k] = process.env[k] || v

const GB_CS = SEEDS.gbFromSeed()
const US_CS = SEEDS.usFromSeed()
const TRUCK = (over = {}) => ({
  id: 'test-truck', name: 'Pizza Kitchen', slug: 'test-kitchen', dashboard_token: 'tok', operator_id: 'op-1', active: true,
  country: 'GB', currency: 'GBP', timezone: 'Europe/London', plan: 'payg', trial_expires_at: null, feature_overrides: {},
  setup_step: null, takes_cash: true, auto_accept: true, time_selection_enabled: true, contact_email: 'kitchen@example.test', ...over,
})
const post = (url, body) => new NextRequest(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } })
const get = url => new NextRequest(`http://localhost${url}`)

;(async () => {
  kit.setNow('2026-10-20T10:00:00Z'); kit.setDeviceTz('Europe/London')
  const L = await kit.bundle('pfc-lib', [
    "export * as P from '@/lib/plans'",
    "export * as F from '@/lib/features'",
    "export * as U from '@/lib/useFeatures'",
  ].join('\n'), { stubs: STUBS })
  const { P, F } = L
  const FEATURES = [...F.FEATURES]

  // ══ 1 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · the catalogue (both migrations\' seed)')
  const off = CATALOG.features.filter(f => !f.enabled).map(f => `${f.planKey}:${f.feature}`).sort()
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): 20261026_pricing_pages.sql switches event_types off for payg too.
  t('payg switches off exactly event_types, whatsapp_replies, schedule_graphics, instagram_messenger_replies', JSON.stringify(off) === JSON.stringify(['payg:event_types', 'payg:instagram_messenger_replies', 'payg:schedule_graphics', 'payg:whatsapp_replies']), off)
  t('no other plan has a row (everything on)', CATALOG.features.every(f => f.planKey === 'payg'))
  t('every switched-off key is a code feature', CATALOG.features.every(f => F.isFeature(f.feature)))
  t('Pay as you go: pay_at_hatch_allowed TRUE (every plan true)', CATALOG.plans.every(p => p.payAtHatchAllowed === true))
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): the trial is 3 months (20261026_pricing_pages.sql; was 4).
  t('trial: trial_months 3; no other plan has one', CATALOG.plans.every(p => (p.key === 'trial' ? p.trialMonths === 3 : p.trialMonths === null)))
  t('included_vans 1 on every plan', CATALOG.plans.every(p => p.includedVans === 1))
  const desc = Object.fromEntries(CATALOG.plans.map(p => [p.key, p.description]))
  t('descriptions as briefed (payg, pro, unlimited, trial); demo and tester kept', desc.payg === 'No monthly fee. You only pay when a customer pays online by card.'
    && desc.pro === 'Everything, including WhatsApp auto-replies and social media posts, with online orders included each month.'
    && desc.unlimited === 'Everything, with no fees on online orders, however busy you get.' && desc.trial === 'Every feature, free, while your trial runs.'
    && desc.demo === 'Prospect sandbox — never public.' && desc.tester === 'Pre-launch tester — full access.', desc)
  t('no number in any description', CATALOG.plans.every(p => !/\d/.test(p.description)))
  t('catalogProblems() is empty', P.catalogProblems(CATALOG).length === 0, P.catalogProblems(CATALOG))
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026 — decision 1): an unknown feature key is IGNORED, not fatal —
  // splitUnknownFeatures sets it aside (the loader logs it, Admin warns), so one typo cannot take every page down.
  {
    const typo = { ...CATALOG, features: [...CATALOG.features, { planKey: 'pro', feature: 'whatsap_replies', enabled: false }] }
    const split = P.splitUnknownFeatures(typo)
    t('an unknown feature key is set aside by the loader (ignored, not fatal) — and catalogProblems stays empty',
      split.ignoredFeatures.length === 1 && split.ignoredFeatures[0].feature === 'whatsap_replies'
      && !split.features.some(f => f.feature === 'whatsap_replies') && P.catalogProblems(split).length === 0
      && P.truckCan({ plan: 'pro', feature_overrides: {} }, split, 'whatsapp_replies') === true, split.ignoredFeatures)
  }
  t('trial_months on a non-trial plan is refused by the loader', P.catalogProblems(withPlan('pro', { trialMonths: 2 })).length > 0)
  const sql = read('supabase/migrations/20261025_plan_features.sql')
  t('plan_features mirrors plans\' RLS and grants (RLS on; revoke anon/authenticated/public; grant all to service_role)',
    /alter table public\.plan_features enable row level security;/.test(sql) && /revoke all on public\.plan_features from anon, authenticated, public;/.test(sql) && /grant all on public\.plan_features to service_role;/.test(sql))
  t('no function is created by the migration (nothing to revoke)', !/create (or replace )?function/i.test(sql))

  // ══ 2 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head(`2 · every plan × every feature (${FEATURES.length}), override → effective plan → allowed`)
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): + event_types (the Stage B migration's payg row).
  const PAYG_OFF = ['event_types', 'instagram_messenger_replies', 'schedule_graphics', 'whatsapp_replies']
  for (const plan of P.plansInOrder(CATALOG)) {
    const truck = { plan: plan.key, trial_expires_at: null, feature_overrides: {} }
    const refused = FEATURES.filter(f => !P.truckCan(truck, CATALOG, f)).sort()
    const expect = plan.key === 'payg' ? PAYG_OFF : []
    t(`${plan.key.padEnd(9)} refused: ${refused.join(', ') || 'nothing'}`, JSON.stringify(refused) === JSON.stringify(expect), refused)
  }
  for (const f of PAYG_OFF) {
    const a = P.featureAccess({ plan: 'payg', feature_overrides: {} }, CATALOG, f)
    t(`payg ${f}: block 'plan', the prompt names Pro`, a.block === 'plan' && a.upgradeTo?.name === 'Pro', a)
  }
  t('override TRUE wins on payg (whatsapp_replies allowed)', P.truckCan({ plan: 'payg', feature_overrides: { whatsapp_replies: true } }, CATALOG, 'whatsapp_replies'))
  const proOff = P.featureAccess({ plan: 'pro', feature_overrides: { schedule_graphics: false } }, CATALOG, 'schedule_graphics')
  t('override FALSE wins on pro (schedule_graphics refused, block \'override\', no plan named)', !proOff.allowed && proOff.block === 'override' && proOff.upgradeTo === null, proOff)
  t('the prompt names the FIRST public plan, in sort order, that has it (a plan switching it off is skipped)',
    P.upgradePlanFor({ ...CATALOG, features: [...CATALOG.features, { planKey: 'pro', feature: 'whatsapp_replies', enabled: false }] }, 'whatsapp_replies')?.key === 'unlimited')

  // ══ 3 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · an ended plan resolves to payg WITH payg\'s switches; the live trucks at deploy')
  const tt = LIVE.find(x => x.id === 'test-truck')
  const show = (label, tr) => { const e = P.effectivePlan(tr, CATALOG, new Date()); const refused = FEATURES.filter(f => !P.truckCan(tr, CATALOG, f)); console.log(`    ${label.padEnd(9)} end=${tr.trial_expires_at} → ${e.plan.key}${e.ended ? ' (ended)' : ''}; refused: ${refused.join(', ') || 'nothing'}`); return { e, refused } }
  const b = show('BEFORE', tt)
  t('test-truck before: on its trial, nothing refused', b.e.plan.key === 'trial' && b.refused.length === 0)
  const during = show('PAST END', { ...tt, trial_expires_at: '2026-10-01T00:00:00Z' })
  // test-truck's own overrides do not name these three, so payg's switches apply (its whatsapp_setup_preview is not a feature)
  t('test-truck past end: payg, refused exactly payg\'s four (Stage B: + event_types)', during.e.plan.key === 'payg' && JSON.stringify(during.refused.sort()) === JSON.stringify(PAYG_OFF), during.refused)
  const restored = show('RESTORED', tt)
  t('test-truck restored: back on its trial, nothing refused (fixture only — the live row is untouched)', restored.e.plan.key === 'trial' && restored.refused.length === 0)
  const loses = LIVE.map(x => ({ id: x.id, lost: FEATURES.filter(f => !P.truckCan(x, CATALOG, f, DEPLOY_DAY)) })).filter(x => x.lost.length)
  console.log('    at deploy (21 October 2026): ' + (loses.map(x => `${x.id} loses ${x.lost.join(', ')}`).join('; ') || 'nobody loses anything'))
  t('only real-thai-food loses features at deploy — exactly payg\'s four (Stage B: + event_types)', loses.length === 1 && loses[0].id === 'real-thai-food' && JSON.stringify(loses[0].lost.sort()) === JSON.stringify(PAYG_OFF), loses)

  // ══ 4 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · SERVER — the real routes')
  const R = await kit.bundle('pfc-routes', [
    "export { GET as wpGET } from '@/app/api/weekly-post/route'",
    "export { POST as managePOST } from '@/app/api/manage/route'",
    "export { POST as signupPOST } from '@/app/api/manage/whatsapp-signup/route'",
    "export { clearPlanCatalogCache } from '@/lib/plans-server'",
    "export { clearCountrySettingsCache } from '@/lib/country-settings'",
  ].join('\n'), { stubs: STUBS })
  const routeRun = async (truckOver, fn, cat = CATALOG) => {
    const writes = []
    globalThis.__harnessDb = kit.fakeDb({
      ...planTables(cat), country_settings: [snake(GB_CS), snake(US_CS)], trucks: [TRUCK(truckOver)],
      operators: [{ id: 'op-1', auth_user_id: 'u-1', is_admin: false, email: 'owner@example.test' }], truck_users: [], truck_vans: [], truck_places: [],
    }, writes)
    globalThis.__harnessUser = { id: 'u-1' }
    R.clearPlanCatalogCache(); R.clearCountrySettingsCache()
    try { const res = await kit.quietAsync(fn); const txt = await res.text(); let body; try { body = JSON.parse(txt) } catch { body = { nonJson: txt.slice(0, 80) } } return { status: res.status, body, writes } }
    finally { delete globalThis.__harnessDb; delete globalThis.__harnessUser }
  }
  const SOCIAL = 'Social media posts are included on Pro.'
  const WA = 'WhatsApp auto-replies are included on Pro.'
  const wp = await routeRun({}, () => R.wpGET(get('/api/weekly-post?token=tok&font=x')))
  t(`GET /api/weekly-post, payg → 403 feature_not_on_plan "${SOCIAL}"`, wp.status === 403 && wp.body.code === 'feature_not_on_plan' && wp.body.error === SOCIAL && wp.body.params?.plan === 'Pro', wp)
  const pl = await routeRun({}, () => R.managePOST(post('/api/manage', { token: 'tok', action: 'sg_place_usual_type', placeId: 'p1', typeId: 'standard' })))
  t(`POST /api/manage sg_place_usual_type (places posts), payg → 403 feature_not_on_plan "${SOCIAL}"`, pl.status === 403 && pl.body.code === 'feature_not_on_plan' && pl.body.error === SOCIAL, pl)
  const su = await routeRun({}, () => R.signupPOST(post('/api/manage/whatsapp-signup', { token: 'tok', code: 'meta-code', kind: 'finish' })))
  t(`POST /api/manage/whatsapp-signup, payg → 403 feature_not_on_plan "${WA}", before any exchange`, su.status === 403 && su.body.code === 'feature_not_on_plan' && su.body.error === WA && su.writes.length === 0, su)
  const wpOn = await routeRun({ feature_overrides: { schedule_graphics: true } }, () => R.wpGET(get('/api/weekly-post?token=tok&font=x')))
  t('payg with override schedule_graphics TRUE passes the gate (the next refusal is not about the plan)', !['feature_not_on_plan', 'feature_switched_off'].includes(wpOn.body.code), wpOn)
  const wpOff = await routeRun({ plan: 'pro', feature_overrides: { schedule_graphics: false } }, () => R.wpGET(get('/api/weekly-post?token=tok&font=x')))
  t('pro with override schedule_graphics FALSE → 403 feature_switched_off (no plan named)', wpOff.status === 403 && wpOff.body.code === 'feature_switched_off', wpOff)
  for (const plan of ['pro', 'unlimited', 'trial', 'demo', 'tester']) {
    const r = await routeRun({ plan, trial_expires_at: plan === 'trial' ? '2026-12-31T23:59:59Z' : null }, () => R.wpGET(get('/api/weekly-post?token=tok&font=x')))
    t(`${plan}: the weekly-post gate passes`, !['feature_not_on_plan', 'feature_switched_off'].includes(r.body.code), r.body)
  }
  const ended = await routeRun({ plan: 'trial', trial_expires_at: '2026-10-01T00:00:00Z' }, () => R.wpGET(get('/api/weekly-post?token=tok&font=x')))
  t('an ENDED trial is refused like payg (feature_not_on_plan naming Pro)', ended.status === 403 && ended.body.code === 'feature_not_on_plan' && ended.body.error === SOCIAL, ended)

  // ══ 5 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · UI — the one prompt')
  const UI = await kit.bundle('pfc-ui', [
    "export { FeatureGate } from '@/components/FeatureGate'",
    "export { PlanPrompt } from '@/components/PlanPrompt'",
    "export { PlanCatalogProvider } from '@/components/PlanCatalogProvider'",
    "export { CountrySettingsProvider } from '@/components/CountrySettingsProvider'",
    "export { PricingPolicyProvider } from '@/components/PricingPolicy'",
    "export { I18nContext } from '@/lib/i18n/use-t'",
    "export { usePlanPriceLabel } from '@/components/usePlanPriceLabel'",
  ].join('\n'), { stubs: STUBS })
  const wrap = (el, { cs = GB_CS, catalog = CATALOG, locale = 'en-GB', hidePricing = false } = {}) => {
    let x = el
    if (catalog) x = h(UI.PlanCatalogProvider, { catalog }, x)
    x = h(UI.PricingPolicyProvider, { hidePricing }, x)
    x = h(UI.CountrySettingsProvider, { settings: cs }, x)
    x = h(UI.I18nContext.Provider, { value: { locale, setLocale() {} } }, x)
    return kit.textOf ? kit.renderStatic(x) : kit.renderStatic(x)
  }
  const gate = (truck, feature, opts) => wrap(h(UI.FeatureGate, { feature, truck, fallback: h('i', null, 'SWITCHED-OFF') }, h('b', null, 'THE FEATURE')), opts)
  const payg = { plan: 'payg', trial_expires_at: null, feature_overrides: {} }
  const g1 = gate(payg, 'schedule_graphics')
  t('payg, Social media: the prompt "Social media posts are included on Pro." in the old FeatureGate panel', g1.includes(SOCIAL) && g1.includes('rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between gap-4') && !g1.includes('THE FEATURE'), g1)
  t('…with the plan line "Pro · £29/mo · <description>" from the catalogue', g1.includes('Pro · £29/mo · Everything, including WhatsApp auto-replies and social media posts, with online orders included each month.'), g1)
  t('…and "Upgrade →" to Billing', /href="[^"]*tab=billing[^"]*"[^>]*>Upgrade →</.test(g1), g1)
  const g2 = gate(payg, 'whatsapp_replies')
  t(`payg, WhatsApp: "${WA}"`, g2.includes(WA), g2)
  globalThis.__ios = true
  const g3 = gate(payg, 'whatsapp_replies')
  delete globalThis.__ios
  t('iOS: the text stays, no purchase link', g3.includes(WA) && !g3.includes('Upgrade →') && !g3.includes('tab=billing'), g3)
  for (const plan of ['pro', 'unlimited', 'trial', 'demo', 'tester']) {
    const r = gate({ plan, trial_expires_at: null, feature_overrides: {} }, 'whatsapp_replies')
    t(`${plan}: the feature itself shows`, r.includes('THE FEATURE') && !r.includes('included on'), r)
  }
  const g4 = gate({ plan: 'pro', trial_expires_at: null, feature_overrides: { whatsapp_replies: false } }, 'whatsapp_replies')
  t('override-off: the surface\'s fallback ("switched off" wording), never the prompt', g4.includes('SWITCHED-OFF') && !g4.includes('included on'), g4)
  const g5 = gate({ plan: 'payg', trial_expires_at: null, feature_overrides: { whatsapp_replies: true } }, 'whatsapp_replies')
  t('override-on payg: the feature shows', g5.includes('THE FEATURE'), g5)
  // without the catalogue (kitchen dashboard / KDS): the server-sent plan_blocks give the same answer
  const blocks = P.planBlocks(payg, CATALOG, 'GB')
  const g6 = gate({ ...payg, plan_blocks: blocks }, 'schedule_graphics', { catalog: null })
  t('no catalogue (dashboard / KDS): server-sent plan_blocks give the same prompt', g6.includes(SOCIAL) && g6.includes('Pro · £29/mo'), g6)
  const page = read('app/manage/[token]/page.tsx')
  t('Manage › Settings WhatsApp card: plan-off → <PlanPrompt feature="whatsapp_replies">, override-off → "switched off"',
    /features\.block\('whatsapp_replies'\) === 'plan'\s*\n\s*\? <div className="mt-2"><PlanPrompt feature="whatsapp_replies"/.test(page) && /: <p className="text-xs text-slate-500 mt-1">\{tW\('card\.switchedOff'\)\}<\/p>\}/.test(page))
  t('Manage › Social tab shows for a plan-off truck (opens on the prompt), hidden only for an override',
    /featureAccessView\(truck, planCatalog, truck\?\.country \?\? null\)\.block\('schedule_graphics'\) !== 'override'/.test(page))

  // ══ 6 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('6 · trial length — a provisioned truck')
  const S = await kit.bundle('pfc-setup', "export { POST } from '@/app/api/setup/route'\nexport { clearPlanCatalogCache } from '@/lib/plans-server'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", { stubs: { ...STUBS, '@/lib/supabase/server': `export async function createSupabaseServerClient() { return { auth: { getUser: async () => ({ data: { user: { id: 'auth-harness' } } }) } } }` } })
  const EXISTING = { ...TRUCK({ id: 'village-spice', slug: 'village-spice', plan: 'trial', trial_expires_at: null, operator_id: 'op-other' }) }
  const provision = async (body, cat = CATALOG) => {
    const writes = []
    globalThis.__harnessDb = kit.fakeDb({ ...planTables(cat),
      operators: [{ id: 'op-harness', email: 'harness@example.test', auth_user_id: 'auth-harness' }],
      country_settings: [snake(GB_CS), snake({ ...US_CS, enabled: true })], trucks: [EXISTING], truck_vans: [], demo_sessions: [], discovery_trucks: [],
    }, writes)
    S.clearPlanCatalogCache(); S.clearCountrySettingsCache()
    try {
      const res = await kit.quietAsync(() => S.POST(post('/api/setup', { action: 'create_truck', name: 'Harness Kitchen', contact_phone: '07700 900123', phone_is_whatsapp: false,
        base_place_id: 'ChIJharnessSudbury01', base_place_name: 'Sudbury', base_region: 'Suffolk', base_lat: 52.038912, base_lng: 0.730711, ...body })))
      const json = await res.json()
      const ins = writes.find(w => w.table === 'trucks' && w.op === 'insert')
      return { status: res.status, json, truck: ins ? (Array.isArray(ins.patch) ? ins.patch[0] : ins.patch) : null, writes }
    } finally { delete globalThis.__harnessDb }
  }
  kit.setNow('2026-10-20T10:00:00Z')
  const gbP = await provision({ country: 'GB', timezone: 'Europe/London' })
  // ⚠️ RE-PINNED (pricing-pages, Stage B, 20 October 2026): trial_months 3 (was 4) — every end date below is a month earlier.
  t('GB, signed up 20 Oct 2026 10:00 (London): ends 20 Jan 2027 23:59:59 London = 2027-01-20T23:59:59.000Z',
    gbP.truck?.plan === 'trial' && gbP.truck?.trial_expires_at === '2027-01-20T23:59:59.000Z', { status: gbP.status, json: gbP.json, end: gbP.truck?.trial_expires_at })
  const usP = await provision({ country: 'US', timezone: 'America/Chicago', contact_phone: '(201) 555-0123',
    base_place_id: 'ChIJharnessAustin001', base_place_name: 'Austin', base_region: 'Texas', base_lat: 30.267153, base_lng: -97.743061 })
  t('US, same moment (05:00 in Chicago): ends 20 Jan 2027 23:59:59 Chicago = 2027-01-21T05:59:59.000Z',
    usP.truck?.trial_expires_at === '2027-01-21T05:59:59.000Z', { status: usP.status, json: usP.json, end: usP.truck?.trial_expires_at })
  kit.setNow('2026-10-20T23:30:00Z')
  const lateP = await provision({ country: 'GB', timezone: 'Europe/London' })
  t('GB, signed up 20 Oct 23:30 UTC (21 Oct 00:30 London BST): the day is the TRUCK\'s — ends 21 Jan 2027', lateP.truck?.trial_expires_at === '2027-01-21T23:59:59.000Z', lateP.truck?.trial_expires_at)
  kit.setNow('2026-10-20T10:00:00Z')
  const twoP = await provision({ country: 'GB', timezone: 'Europe/London' }, withPlan('trial', { trialMonths: 2 }))
  t('trial_months changed to 2 in the fixture → ends 20 Dec 2026 23:59:59 London', twoP.truck?.trial_expires_at === '2026-12-20T23:59:59.000Z', twoP.truck?.trial_expires_at)
  const truckWrites = r => r.writes.filter(w => w.table === 'trucks').map(w => ({ op: w.op, ids: w.ids, keys: Object.keys(Array.isArray(w.patch) ? w.patch[0] || {} : w.patch || {}).slice(0, 6) }))
  t('existing rows untouched: no write to trucks touches the existing truck (village-spice keeps NULL)', [gbP, usP, twoP].every(r => r.writes.filter(w => w.table === 'trucks').every(w => (w.op === 'insert'
    ? (Array.isArray(w.patch) ? w.patch : [w.patch]).every(row => row.id !== 'village-spice')   // the fake lists every row on an insert; the ROW inserted is what counts
    : !(w.ids || []).includes('village-spice')))) && EXISTING.trial_expires_at === null, [gbP, usP, twoP].map(truckWrites))
  t('month-end clamps: 31 Oct + 4 months → 28 Feb (P.addMonthsYmd)', P.addMonthsYmd('2026-10-31', 4) === '2027-02-28' && P.addMonthsYmd('2027-10-31', 4) === '2028-02-29')
  t('a non-trial plan gets no end date', P.trialEndFor(CATALOG.plans.find(p => p.key === 'pro'), new Date(), 'Europe/London') === null)
  const admin = read('app/admin/page.tsx')
  t('Admin: ONE preset "Start trial: N months" from trial_months (the 1 / 3 month chips are gone)', /Start trial: \{currentModalPlanRow\.trialMonths\}/.test(admin) && !/setModalTrial\(1\)|setModalTrial\(3\)|>\s*1 month\s*</.test(admin))

  // ══ 7 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('7 · Pay at Hatch')
  const NOHATCH = withPlan('pro', { payAtHatchAllowed: false })
  t('allowed on every seeded plan', CATALOG.plans.every(p => P.payAtHatchOn({ plan: p.key, feature_overrides: {} }, CATALOG)))
  t('a fixture plan with it FALSE: not offered; the prompt names Pay as you go (the first public plan that has it)', !P.payAtHatchOn({ plan: 'pro', feature_overrides: {} }, NOHATCH)
    && P.featureAccess({ plan: 'pro', feature_overrides: {} }, NOHATCH, P.PAY_AT_HATCH_FEATURE).upgradeTo?.key === 'payg')
  // the email module is PATCHED (a recorder), not stubbed, as scripts/order-charges.cjs does — submit imports its formatters
  const { '@/lib/email': _noEmailStub, ...SUBMIT_STUBS } = STUBS
  const EMAIL_PATCH = { file: 'lib/email.ts', from: 'export async function sendConfirmationEmail(params: {', to: 'export async function sendConfirmationEmail(params: any) { return true }\nasync function __realSendConfirmationEmail(params: {' }
  const SUB = await kit.bundle('pfc-submit', "export { POST } from '@/app/api/orders/submit/route'\nexport { GET as menuGET } from '@/app/api/menu/[truckId]/route'\nexport { clearPlanCatalogCache } from '@/lib/plans-server'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", { stubs: SUBMIT_STUBS, patches: [EMAIL_PATCH] })
  const ORDER_TABLES = (cat, truckOver = {}) => ({
    ...planTables(cat), country_settings: [snake(GB_CS)],
    trucks: [TRUCK({ plan: 'pro', operator_id: null, ...truckOver })],
    menu_items_db: [{ id: 'i1', truck_id: 'test-truck', name: 'Margherita', price: 9.5, category_id: 'c1', category: 'Pizzas', available: true, is_active: true }],
    menu_categories: [{ id: 'c1', truck_id: 'test-truck', name: 'Pizzas' }], modifier_groups: [], modifier_options: [], item_modifier_groups: [], bundles_db: [],
    truck_events: [{ id: 'ev1', truck_id: 'test-truck', event_date: '2026-10-20', status: 'confirmed', start_time: '11:00', end_time: '20:00', venue_name: 'The Green', town: 'Testville', postcode: 'AB1 2CD', van_id: null }],
    discount_codes_db: [], orders: [], order_drafts: [], order_payments: [], booking_locks: [],
  })
  const submitRun = async (cat, body) => {
    const writes = []
    const db = kit.fakeDb(ORDER_TABLES(cat), writes)
    const rpcs = []
    globalThis.__harnessDb = { ...db, rpc: async (name, args) => { rpcs.push(name); if (/^place_order_atomic/.test(name)) return { data: { order_key: 'ok-1', order_number: 41, slot: args.p_final_slot }, error: null }; if (/increment_(event_)?order_counter/.test(name)) return { data: 41, error: null }; return { data: null, error: null } } }
    SUB.clearPlanCatalogCache(); SUB.clearCountrySettingsCache()
    try { const res = await kit.quietAsync(() => SUB.POST(post('/api/orders/submit', { truckId: 'test-kitchen', customerName: 'Ann Example', customerEmail: 'ann@example.test', customerPhone: '07700900000', slot: '12:00', eventDate: '2026-10-20', eventId: 'ev1', items: [{ name: 'Margherita', quantity: 1, unit_price: 9.5, modifiers: [] }], deals: [], ...body })))
      return { status: res.status, body: await res.json(), rpcs, writes } }
    finally { delete globalThis.__harnessDb }
  }
  kit.setNow('2026-10-20T10:00:00Z')
  const okHatch = await submitRun(CATALOG, {})
  t('allowed plan: a pay-at-the-truck order is placed (no Pay at Hatch refusal)', okHatch.body.code !== 'pay_at_hatch_unavailable' && okHatch.rpcs.some(n => /^place_order_atomic/.test(n)), { status: okHatch.status, body: okHatch.body })
  const noHatch = await submitRun(NOHATCH, {})
  t('plan with it FALSE: refused 403 pay_at_hatch_unavailable, before any booking', noHatch.status === 403 && noHatch.body.code === 'pay_at_hatch_unavailable' && !noHatch.rpcs.some(n => /^place_order_atomic/.test(n)) && noHatch.writes.length === 0, { status: noHatch.status, body: noHatch.body, rpcs: noHatch.rpcs })
  const cardOrder = await submitRun(NOHATCH, { payByCard: true })
  t('…a CARD order on that plan is not refused by the Pay at Hatch gate', cardOrder.body.code !== 'pay_at_hatch_unavailable', { status: cardOrder.status, body: cardOrder.body })
  const menuRun = async (cat) => {
    globalThis.__harnessDb = kit.fakeDb(ORDER_TABLES(cat))
    SUB.clearPlanCatalogCache(); SUB.clearCountrySettingsCache()
    try { const res = await kit.quietAsync(() => SUB.menuGET(get('/api/menu/test-kitchen'), { params: Promise.resolve({ truckId: 'test-kitchen' }) })); return { status: res.status, body: await res.json() } }
    finally { delete globalThis.__harnessDb }
  }
  const mOn = await menuRun(CATALOG)
  const mOff = await menuRun(NOHATCH)
  const truckOf = m => m.body?.truck ?? m.body
  t('menu API: pay_at_hatch_on true on an allowed plan', truckOf(mOn)?.pay_at_hatch_on === true, { status: mOn.status, keys: Object.keys(mOn.body || {}).slice(0, 12), truck: truckOf(mOn) && { pay_at_hatch_on: truckOf(mOn).pay_at_hatch_on } })
  t('menu API: pay_at_hatch_on false and — with no card option either — ordering_available false', truckOf(mOff)?.pay_at_hatch_on === false && truckOf(mOff)?.ordering_available === false, truckOf(mOff) && { pay_at_hatch_on: truckOf(mOff).pay_at_hatch_on, ordering_available: truckOf(mOff).ordering_available })
  const orderPage = read('app/trucks/[slug]/order/page.tsx')
  t('order page: the pay-at-the-truck choice renders only when pay_at_hatch_on (both copies)', (orderPage.match(/\{truck\?\.card_payments_ready && payAtHatchOffered && \(/g) || []).length === 2 && /const payAtHatchOffered = truck\?\.pay_at_hatch_on !== false/.test(orderPage))
  const payments = read('components/manage/PaymentsTab.tsx')
  t('operator (Manage › Payments): plan-off → the prompt; override-off → "switched off for your truck"', /features\.block\(PAY_AT_HATCH_FEATURE\) === 'plan'/.test(payments) && /tPrompt\('switchedOff'/.test(payments))

  // ══ 8 ════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('8 · Billing card prices (plan_prices, the van modal\'s mask) and the founder offer')
  const PriceProbe = ({ minor }) => h('span', null, UI.usePlanPriceLabel()(minor))
  const probe = (minor, opts) => wrap(h(PriceProbe, { minor }), opts)
  const usOn = { ...US_CS, enabled: true }, usOff = { ...US_CS, enabled: false }
  const pOn = probe(2900, { cs: usOn, locale: 'en-US' }), pOffUS = probe(2900, { cs: usOff, locale: 'en-US' })
  t('US switched ON: real dollars ("$29/mo")', pOn.includes('$29/mo'), pOn)
  t('US switched OFF: masked ("TBD")', pOffUS.includes('TBD') && !pOffUS.includes('$'), pOffUS)
  const pGb = probe(2900, {})
  t('GB: "£29/mo" (unchanged)', pGb.includes('£29/mo'), pGb)
  const pHidden = probe(2900, { hidePricing: true })
  t('GB with hide_pricing: masked ("TBC")', pHidden.includes('TBC'), pHidden)
  const billingSrc = page.slice(page.indexOf('function BillingTab('), page.indexOf('// ── ReportsTab'))
  t('the Billing plan card reads only plan_prices through the card mask (cardPx) — never `px` / the retired columns',
    /const cardPx = usePlanPriceMask\(\)/.test(billingSrc) && /\{cardPx\(currentPriceLabel\)\}/.test(billingSrc) && !/\{px\(currentPriceLabel\)\}/.test(billingSrc)
    && /amount: cardPx\(formatWholeAmount/.test(billingSrc) && (billingSrc.match(/price: cardPx\(price\)/g) || []).length === 2)
  const founder = { plan: 'unlimited', trial_expires_at: null, plan_price_override_minor: 4900, plan_price_override_until: '2026-12-31' }
  const fBefore = P.truckPlanPrice(founder, CATALOG, 'GB', { today: '2026-12-31' })
  const fAfter = P.truckPlanPrice(founder, CATALOG, 'GB', { today: '2027-01-01' })
  t('founder offer: unlimited at 4900 until 31 Dec → 4900 on 31 Dec, the standard 6900 on 1 Jan', fBefore.monthlyMinor === 4900 && fAfter.monthlyMinor === 6900 && fAfter.override === null)
  const fShown = probe(fBefore.monthlyMinor, {}), fAfterShown = probe(fAfter.monthlyMinor, {})
  t('…shown in Billing\'s words: "£49/mo", then "£69/mo"', fShown.includes('£49/mo') && fAfterShown.includes('£69/mo'), [fShown, fAfterShown])

  console.log(`\n${fail ? '🔴' : '✅'} plan-features-config: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
