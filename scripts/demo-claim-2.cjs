#!/usr/bin/env node
// scripts/demo-claim-2.cjs — demo-claim-2 (9 November 2026, docs/demo-claim-2-report.md): the demo's own menu arrives on the
// real truck at sign-up, on any device, and its review still happens — from saved state, not from ?import=demo.
//   node scripts/demo-claim-2.cjs      (≈ 30 s: three bundles of the REAL routes and libraries, an in-memory Supabase)
//
// WHAT IT PROVES, each against the real code (routes bundled from the repo; only provisioning, email, rate limits and the
// session cookie are stubbed — the session is a variable, which is what "another device" is to a server):
//   1 · THE REVIEW, ACCEPTED WITHOUT CHANGES — acceptReviewDefaults groups an AI variant into one required single-choice
//       dish, keeps the other extras, seeds kitchen prep as the wizard does, names the unpriced dishes; Manage uses the SAME
//       functions (moved, not copied).
//   2 · SIGN UP FROM AN UPLOAD DEMO → the menu is on the new truck when create_truck answers; the review is PENDING.
//   3 · A SECOND DEVICE, NO ?import=demo — a fresh session (cookie, and the app's Bearer) reads the review as owed and gets
//       the extraction; the Manage bootstrap no longer needs the param; the dashboard (where the app lands) sends a pending
//       operator to Manage.
//   4 · AFTER THE VERIFY-SIGNUP LINK — it lands on Manage WITHOUT ?import=demo, and the review is still owed there.
//   5 · CONFIRMING THE REVIEW replaces the carried menu (clear-first): no duplicates, the review closes, never again.
//   6 · NEVER REVIEWED → the menu stays as carried; DISMISSED → closed, menu untouched.
//   7 · EDITED BY HAND before the review → "check your menu": a clear-first commit is REFUSED, the edit survives; Looks good
//       closes it.
//   8 · A TEMPLATE (sample) DEMO → no menu carried, no review owed, the ?import=demo path behaves exactly as before.
//   9 · NEVER TWICE — create_truck resumed, signup repeated, two carry-overs racing: one menu.
//  10 · A FAILED COMMIT → sign-up still succeeds, the partial rows are wiped, the review (fallback offer) is still owed.
//  11 · signup_started from every surface that opens the sign-up form.
//  12 · a branded demo's logo is copied to the real truck (only into one with none); a failed copy costs the logo only.
// Nothing touches the database, storage or the network: `fetch` is a recorder.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
const fs = require('fs'); const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'demo-claim-2' })
const { makeFakePg } = require('./_fake-pg.cjs')
const SEEDS = require('./_country-settings-gb.cjs')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const read = f => fs.readFileSync(path.join(kit.REPO, f), 'utf8')

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 600)}` : ''}`) } }
const head = s => console.log(`\n── ${s}`)

kit.setNow('2026-11-09T20:00:00Z')
process.env.SIGNUP_PUBLIC = 'true'
process.env.BREVO_API_KEY = 'harness-not-a-key'
const sent = []
globalThis.fetch = async (url, init) => { sent.push({ url: String(url), body: init?.body ?? null }); return new Response('{}', { status: 201 }) }

// ── THE FIXTURE MENU — a made-up grill, the same SHAPE as a real upload (an AI variant group, two extras groups) ──
const EXTRACTION = {
  categories: ['Mains', 'Sides', 'Drinks', 'Desserts'],
  existing_categories: [],
  items: [
    { name: 'Grilled Chicken', category: 'Mains', price: 7, allergens: [], dietary: [],
      modifierGroups: [{ name: 'Size', _inferredFromVariants: true, isRequired: false, singleSelect: false, options: [{ name: 'Half', price: 0 }, { name: 'Whole', price: 5 }] }] },
    { name: 'Fries', category: 'Sides', price: 3, allergens: [], dietary: ['Vegan'] },
    { name: 'Salt Cod Fritters', category: 'Sides', price: 3, allergens: ['Fish'], dietary: [] },
    { name: 'Soft Drink', category: 'Drinks', price: 2, allergens: [], dietary: [],
      modifierGroups: [{ name: 'Choice of Drink', isRequired: false, singleSelect: false, options: [{ name: 'Cola', price: 0 }, { name: 'Lemonade', price: 0 }] }] },
    { name: 'Custard Tart', category: 'Desserts', price: 1.5, allergens: ['Eggs', 'Milk', 'Gluten'], dietary: [] },
  ],
}
const UNPRICED = { ...EXTRACTION, items: [...EXTRACTION.items, { name: 'Weekly Special', category: 'Mains', price: 0, price_missing: true, allergens: [], dietary: [] }] }

const STUBS = {
  '@/lib/supabase/server': `export async function createSupabaseServerClient() {
  return { auth: { getUser: async () => ({ data: { user: globalThis.__harnessUser ?? null }, error: null }) } }
}`,
  '@/lib/ratelimit': 'const lim = { async limit() { return { success: true } } }\nexport const ratelimit = lim, strictRatelimit = lim, eventsRatelimit = lim, customHostRatelimit = lim, domainCheckRatelimit = lim, embedRatelimit = lim, demoRatelimit = lim, signupRatelimit = lim, signupEmailRatelimit = lim, domainPreflightRatelimit = lim, domainInstructionsRatelimit = lim, placesRatelimit = lim, contactIpRatelimit = lim, contactEmailRatelimit = lim, paperworkSendRatelimit = lim',
  '@/lib/email-signup': `export function firstNameFrom(n) { return (n ?? '').trim().split(/\\s+/)[0] || null }
export async function sendSignupVerificationEmail(a) { ;(globalThis.__mail ||= []).push(['verify', a]) }
export async function sendOperatorWelcomeEmail(a) { ;(globalThis.__mail ||= []).push(['welcome', a]) }`,
  // The real truck is written into the in-memory database, as provisionTruck writes it (operator_id and setup_step come after).
  '@/lib/provision-truck': `export async function provisionTruck(db, opts) {
  const id = opts.slug, token = 'tok-' + opts.slug
  await db.from('trucks').insert({ id, slug: id, name: opts.name, dashboard_token: token, operator_id: null, setup_step: null, country: opts.country, timezone: opts.timezone })
  return { truck: { id, dashboard_token: token, name: opts.name }, warnings: [] }
}`,
  '@/lib/self-serve-discovery-link': 'export async function linkDiscoveryRowForSelfServe() { return null }',
  crypto: "import * as real from 'node:crypto'\nexport * from 'node:crypto'\nexport function randomBytes(n) { return { toString: () => 'a'.repeat(n * 2) } }\nexport default { ...real, randomBytes }",
}

const OWNER_EMAIL = 'grill@example.test'
function seed(extra = {}) {
  return {
    country_settings: [snake(SEEDS.gbFromSeed())],
    plans: [], plan_prices: [], plan_features: [],
    operators: [{ id: 'op-admin', auth_user_id: 'u-admin', email: 'admin@example.test', name: 'Ada Admin', is_admin: true }],
    truck_users: [], operator_email_verifications: [], operator_email_changes: [], demo_events: [], allergen_audit_log: [],
    trucks: [
      { id: 'demo-fix1', slug: 'demo-slugfix1', name: 'Demo Kitchen (fix1)', dashboard_token: 'demo-tokfix1', country: 'GB', timezone: 'Europe/London', setup_step: null, operator_id: null },
      { id: 'demo-fix2', slug: 'demo-slugfix2', name: 'Demo Kitchen (fix2)', dashboard_token: 'demo-tokfix2', country: 'GB', timezone: 'Europe/London', setup_step: null, operator_id: null },
    ],
    demo_sessions: [
      { truck_id: 'demo-fix1', created_at: '2026-11-09T19:00:00Z', expires_at: '2026-11-10T19:00:00Z', extraction: EXTRACTION, extraction_source: 'upload', claimed_by_operator_id: null, discovery_truck_id: null },
      { truck_id: 'demo-fix2', created_at: '2026-11-09T19:05:00Z', expires_at: '2026-11-10T19:05:00Z', extraction: EXTRACTION, extraction_source: 'template', claimed_by_operator_id: null, discovery_truck_id: null },
    ],
    menu_categories: [], menu_items_db: [], modifier_groups: [], modifier_options: [], item_modifier_groups: [],
    ...extra,
  }
}
let pg
const db = s => {
  pg = makeFakePg(s)
  const users = { 'jwt-grill': { id: 'u-new', email: OWNER_EMAIL } }
  pg.auth = {
    getUser: async jwt => ({ data: { user: users[jwt] ?? null }, error: null }),
    admin: {
      createUser: async a => (pg.tables.operators.some(o => o.email === a.email) ? { data: null, error: { message: 'A user with this email address has already been registered' } } : { data: { user: { id: 'u-new' } }, error: null }),
      deleteUser: async () => ({ error: null }),
    },
  }
  globalThis.__harnessDb = pg
  return pg
}
const rows = tb => pg.tables[tb] || []
const items = truckId => rows('menu_items_db').filter(r => r.truck_id === truckId)
const sessionOf = id => rows('demo_sessions').find(r => r.truck_id === id)

;(async () => {
  const { NextRequest } = require(path.join(kit.REPO, 'node_modules/next/server'))
  const L = await kit.bundle('dc2-lib', `
export { carryClaimedDemoMenu, carryClaimedDemoLogo, readMenuReview, closeMenuReview, menuFingerprint } from '@/lib/demo-menu-carry'
export { acceptReviewDefaults, buildGroupedItems, computeGroupingRows } from '@/lib/menu-import-review'
export { commitMenu } from '@/lib/menu-commit'`, { stubs: STUBS })
  const R = await kit.bundle('dc2-routes', `
export { POST as signupPOST } from '@/app/api/signup/route'
export { POST as setupPOST, GET as setupGET } from '@/app/api/setup/route'
export { GET as verifyGET } from '@/app/api/auth/verify-signup/route'
export { POST as commitPOST } from '@/app/api/manage/commit-menu/route'
export { clearCountrySettingsCache } from '@/lib/country-settings'`, { stubs: STUBS })
  const M = await kit.bundle('dc2-manage', "export { POST as managePOST } from '@/app/api/manage/route'", { stubs: STUBS })

  const req = (url, { method = 'GET', body, headers = {} } = {}) => new NextRequest(`http://127.0.0.1${url}`, {
    method, headers: { 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const as = user => { globalThis.__harnessUser = user }
  const OWNER = { id: 'u-new', email: OWNER_EMAIL }
  const json = async p => { const r = await kit.quietAsync(() => p); return { status: r.status, body: await r.json().catch(() => null), location: r.headers.get('location') } }
  const signup = (demo, email = OWNER_EMAIL) => { as(null); return json(R.signupPOST(req('/api/signup', { method: 'POST', body: { email, password: 'harness-pass-1', demo, first_name: 'Gil', last_name: 'Griller' } }))) }
  const createTruck = (name = 'Harness Grill') => { as(OWNER); R.clearCountrySettingsCache?.(); return json(R.setupPOST(req('/api/setup', { method: 'POST', body: { action: 'create_truck', name, contact_phone: '07700 900123', country: 'GB', timezone: 'Europe/London', base_place_name: 'Harnessville' } }))) }
  const manage = (token, action, extra = {}, headers = {}) => json(M.managePOST(req('/api/manage', { method: 'POST', body: { token, action, ...extra }, headers })))
  const reviewState = (token, viaApp = false) => { if (viaApp) as(null); else as(OWNER); return manage(token, 'menu_review_state', {}, viaApp ? { authorization: 'Bearer jwt-grill' } : {}) }
  const commit = (token, payload, clearFirst) => { as(OWNER); return json(R.commitPOST(req('/api/manage/commit-menu', { method: 'POST', body: { token, ...payload, clearFirst } }))) }
  const signedUp = async () => { db(seed()); const s = await signup('demo-slugfix1'); const c = await createTruck(); return { s, c } }
  const TOK = 'tok-harness-grill', TRUCK = 'harness-grill'

  // ── 1 ──
  head('1 · the review, accepted without changes — one copy, shared by Manage and the carry-over')
  {
    const d = L.acceptReviewDefaults(EXTRACTION)
    const chicken = d.items.find(i => i.name === 'Grilled Chicken')
    const g = chicken?.modifierGroups?.[0]
    t('the AI variant (Size: Half / Whole) is ONE dish at the base price with a required, single-choice group — as the chooser defaults',
      d.items.filter(i => /Grilled Chicken/.test(i.name)).length === 1 && chicken.price === 7 && g.isRequired === true && g.singleSelect === true
      && JSON.stringify(g.options.map(o => [o.name, o.price])) === JSON.stringify([['Half', 0], ['Whole', 5]]) && g.name === 'Mains - Size', JSON.stringify(d.items))
    t('a non-variant extras group (Choice of Drink) is kept as it came', JSON.stringify(d.items.find(i => i.name === 'Soft Drink').modifierGroups.map(x => x.name)) === '["Choice of Drink"]')
    t('every new category is seeded { prep_secs: null, batch_size: null } — the Kitchen step untouched', Object.keys(d.categoryPrep).join() === 'Mains,Sides,Drinks,Desserts' && Object.values(d.categoryPrep).every(p => p.prep_secs === null && p.batch_size === null))
    t('no item is marked allergens-checked, so every one commits allergens_verified = false', d.items.every(i => i._allergensChecked !== true))
    t('a fully priced menu has no unpriced dishes; an unread price is named for the caller', d.unpricedNames.length === 0 && JSON.stringify(L.acceptReviewDefaults(UNPRICED).unpricedNames) === '["Weekly Special"]')
    const page = read('app/(app)/manage/[token]/page.tsx')
    t('Manage imports the review passes from lib/menu-import-review.ts and no longer defines its own',
      /from '@\/lib\/menu-import-review'/.test(page) && !/const (makeGroupingRow|computeRegroupCandidates|ungroupAiVariantsForReview|autoSplitConflicts|detectConflictGroups|dissolveGroupInItems) = /.test(page)
      && /const buildGroupedItems = \(items: any\[\]\): any\[\] => buildGroupedItemsWith\(items, groupingChoice\)/.test(page))
    const lib = read('lib/menu-import-review.ts')
    t('…and the moved bodies are the page\'s own (the M1 confirmation rule, the §66 auto-split, the axis vocabulary)',
      lib.includes("_allergensChecked: memberItems.length > 0 && memberItems.every(it => it._allergensChecked === true)") && lib.includes('for (const ng of conflictGroups) items = dissolveGroupInItems(items, ng, true)') && lib.includes("halloumi: 'protein'"))
  }

  // ── 2 ──
  head('2 · sign up from an UPLOAD demo → the menu is on the real truck when create_truck answers')
  {
    const { s, c } = await signedUp()
    t('signup ok, and the demo is claimed by slug', s.status === 200 && s.body.ok && sessionOf('demo-fix1').claimed_by_operator_id === s.body.operatorId, JSON.stringify(s))
    t('create_truck ok, and says the menu was carried', c.status === 200 && c.body.ok && c.body.menuCarry === 'carried', JSON.stringify(c.body))
    const its = items(TRUCK)
    t('the five dishes are on the real truck (the variant grouped into one), all available, allergens unverified',
      its.length === 5 && its.every(i => i.is_available === true && i.allergens_verified === false) && its.some(i => i.name === 'Grilled Chicken' && i.price === 7), JSON.stringify(its.map(i => [i.name, i.price])))
    t('the extras arrived: two groups (the Size group hidden-named, as an inferred variant), four options, two links',
      rows('modifier_groups').filter(g => g.truck_id === TRUCK).length === 2 && rows('modifier_groups').some(g => g.name === 'Mains - Size' && g.is_required && g.max_choices === 1 && g.hide_name)
      && rows('modifier_options').length === 4 && rows('item_modifier_groups').length === 2)
    t('categories carry the Kitchen step\'s defaults (prep 0, batch 0, not counted)', rows('menu_categories').filter(c2 => c2.truck_id === TRUCK).every(c2 => c2.prep_secs === 0 && c2.batch_size === 0 && c2.counts_toward_capacity === false))
    const ss = sessionOf('demo-fix1')
    t('the demo session records it: carried to this truck, a fingerprint, and the review PENDING',
      ss.menu_carry_status === 'done' && ss.menu_carry_truck_id === TRUCK && /^v1:5:/.test(ss.menu_carry_fingerprint || '') && ss.menu_review_status === 'pending', JSON.stringify(ss))
    t('one allergen audit row, as every import writes', rows('allergen_audit_log').filter(a => a.truck_id === TRUCK && a.change_type === 'import').length === 1)
    t('nothing was written to the demo truck', items('demo-fix1').length === 0)
  }

  // ── 3 ──
  head('3 · a SECOND DEVICE with no ?import=demo — the review is read from saved state')
  {
    await signedUp()
    const web = await reviewState(TOK)
    t('a fresh web session: the review is owed, with the extraction to review', web.status === 200 && web.body.state === 'offer' && JSON.stringify(web.body.extraction) === JSON.stringify(EXTRACTION), JSON.stringify(web.body).slice(0, 200))
    const app = await reviewState(TOK, true)
    t('the native app (no cookie, a Bearer token): the same answer', app.status === 200 && app.body.state === 'offer', JSON.stringify(app))
    as(null)
    const nobody = await manage(TOK, 'menu_review_state')
    t('nobody signed in: refused, nothing disclosed', nobody.status === 401 && nobody.body.state === undefined)
    const page = read('app/(app)/manage/[token]/page.tsx')
    t('the Manage bootstrap runs for any truck in setup, param or not, and asks the saved state first',
      /if \(!viaParam && !truckInSetup\) return/.test(page) && /review = await api\('menu_review_state'\)/.test(page)
      && /if \(review\?\.state === 'offer' && review\.extraction\) \{ setCarriedReview\('offer'\); await openOffer\(review\.extraction\); return \}/.test(page))
    t('…?import=demo still works as an alias: with no carried menu for the truck, the original path runs (fetch /api/setup)',
      /if \(!viaParam\) return\s*\n\s*\/\/ ── 2\. \?import=demo WITH NO CARRIED MENU/.test(page) && /const res = await fetch\('\/api\/setup'\)/.test(page))
    t('…but never over a menu that is already there: with items on the truck the legacy path strips the param and offers nothing (the every-login re-offer)',
      /if \(items\.length > 0\) \{ stripImportParam\(\); return \}\s*\n\s*const res = await fetch\('\/api\/setup'\)/.test(page))
    t('the offer still opens with clear-first (demoImportMode), so confirming REPLACES the carried menu', /setDemoImportMode\(true\)\s*\n\s*setShowSetupIntro\(true\)/.test(page) && /clearFirst: demoImportMode/.test(page))
    const dash = read('app/(app)/dashboard/[token]/page.tsx')
    t('the dashboard (where the app and a web sign-in land) sends a truck in setup with a review owed to Manage',
      /action:'menu_review_state'/.test(dash) && /if\(res\.ok&&\(d\?\.state==='offer'\|\|d\?\.state==='check'\)\)router\.replace\(`\/manage\/\$\{encodeURIComponent\(token\)\}`\)/.test(dash)
      && /if\(isDemo\|\|!truck\|\|menuReviewChecked\.current\)return/.test(dash) && /\.\.\.await nativeAuthHeader\(\)\},body:JSON\.stringify\(\{token,action:'menu_review_state'\}\)/.test(dash))
  }

  // ── 4 ──
  head('4 · after the VERIFY-SIGNUP link — no ?import=demo, and the review is still owed')
  {
    await signedUp()
    const v = await json(R.verifyGET(req(`/api/auth/verify-signup?token=${'a'.repeat(64)}`)))
    t('verify-signup lands on Manage WITHOUT ?import=demo (unchanged)', v.status >= 300 && v.status < 400 && /\/manage\/tok-harness-grill\?verify=ok$/.test(v.location || ''), JSON.stringify(v))
    const r = await reviewState(TOK)
    t('…and on that page the saved state still owes the review', r.body.state === 'offer')
  }

  // ── 5 ──
  head('5 · confirming the review REPLACES the carried menu — no duplicates, and never again')
  {
    await signedUp()
    // The operator's reviewed version: the defaults, with one price changed and one dish left out.
    const d = L.acceptReviewDefaults(EXTRACTION)
    const reviewed = { categories: d.categories, categoryPrep: d.categoryPrep, items: d.items.filter(i => i.name !== 'Fries').map(i => (i.name === 'Custard Tart' ? { ...i, price: 1.8 } : i)) }
    const c = await commit(TOK, reviewed, true)
    t('the clear-first commit succeeds', c.status === 200 && c.body.ok === true, JSON.stringify(c.body))
    const its = items(TRUCK)
    t('the truck now holds EXACTLY the reviewed menu (4 dishes, the new price, no carried leftovers, no duplicates)',
      its.length === 4 && !its.some(i => i.name === 'Fries') && its.find(i => i.name === 'Custard Tart').price === 1.8 && new Set(its.map(i => i.name)).size === 4
      && rows('modifier_groups').filter(g => g.truck_id === TRUCK).length === 2, JSON.stringify(its.map(i => [i.name, i.price])))
    t('the review is recorded as reviewed, server-side', sessionOf('demo-fix1').menu_review_status === 'reviewed' && !!sessionOf('demo-fix1').menu_reviewed_at)
    t('…so it is closed on every device from now on', (await reviewState(TOK)).body.state === 'closed' && (await reviewState(TOK, true)).body.state === 'closed')
  }

  // ── 6 ──
  head('6 · NEVER reviewed → the menu stays as carried; DISMISSED → closed, the menu untouched')
  {
    await signedUp()
    const before = JSON.stringify(items(TRUCK).map(i => [i.name, i.price]))
    t('never reviewed: the carried menu is simply there', items(TRUCK).length === 5 && (await reviewState(TOK)).body.state === 'offer')
    as(OWNER)
    const d = await manage(TOK, 'set_menu_review', { state: 'dismissed' })
    t('"Finish later" records dismissed', d.status === 200 && d.body.changed === true && sessionOf('demo-fix1').menu_review_status === 'dismissed')
    t('…closed everywhere, and the menu is exactly as carried', (await reviewState(TOK)).body.state === 'closed' && JSON.stringify(items(TRUCK).map(i => [i.name, i.price])) === before)
    as(OWNER)
    t('a second close is a no-op (only a PENDING review changes)', (await manage(TOK, 'set_menu_review', { state: 'reviewed' })).body.changed === false && sessionOf('demo-fix1').menu_review_status === 'dismissed')
    const page = read('app/(app)/manage/[token]/page.tsx')
    t('Manage dismisses on the deliberate exits only ("Finish later" / Discard / the check card\'s ×), and says the menu stays',
      (page.match(/onClick=\{\(\) => \{ closeCarriedReview\('dismissed'\); resetImportState\(\) \}\}/g) || []).length === 2 && /ti\('discard\.carriedBody'\)/.test(page))
  }

  // ── 7 ──
  head('7 · EDITED BY HAND before the review → "check your menu"; the edits are never overwritten')
  {
    await signedUp()
    const fries = items(TRUCK).find(i => i.name === 'Fries')
    as(OWNER)
    const e = await manage(TOK, 'toggle_item', { id: fries.id, is_available: false })
    t('the operator hides Fries in Manage (a real Manage action)', e.status === 200 && items(TRUCK).find(i => i.name === 'Fries').is_available === false)
    const r = await reviewState(TOK)
    t('the review becomes "check your menu" — no extraction handed out', r.body.state === 'check' && r.body.extraction === undefined, JSON.stringify(r.body))
    const d = L.acceptReviewDefaults(EXTRACTION)
    const c = await commit(TOK, { categories: d.categories, items: d.items, categoryPrep: d.categoryPrep }, true)
    t('a clear-first commit (a review loaded before the edit, on another tab) is REFUSED', c.status === 409, JSON.stringify(c))
    t('…and the edit survives', items(TRUCK).length === 5 && items(TRUCK).find(i => i.name === 'Fries').is_available === false)
    as(OWNER)
    await manage(TOK, 'set_menu_review', { state: 'reviewed' })
    t('"Looks good" closes it — reviewed, edits kept', sessionOf('demo-fix1').menu_review_status === 'reviewed' && (await reviewState(TOK)).body.state === 'closed' && items(TRUCK).find(i => i.name === 'Fries').is_available === false)
    const page = read('app/(app)/manage/[token]/page.tsx')
    t('Manage shows the check card over the SAVED menu and never re-commits from it',
      /if \(review\?\.state === 'check'\) \{ setCarriedReview\('check'\); stripImportParam\(\); return \}/.test(page) && /\{carriedReview === 'check' && \(/.test(page)
      && /onClick=\{\(\) => closeCarriedReview\('reviewed'\)\}/.test(page))
  }

  // ── 8 ──
  head('8 · a TEMPLATE (sample) demo → nothing carried, no review owed, the offer behaves as today')
  {
    db(seed())
    await signup('demo-slugfix2')
    const c = await createTruck()
    t('create_truck ok; the sample menu is NOT carried', c.body.ok && c.body.menuCarry === 'skipped' && items(TRUCK).length === 0, JSON.stringify(c.body))
    t('no review is owed for this truck', (await reviewState(TOK)).body.state === 'none' && sessionOf('demo-fix2').menu_review_status == null)
    as(OWNER)
    const g = await json(R.setupGET(req('/api/setup')))
    t('…and ?import=demo still gets template_withheld (the upload step, as before)', g.body.reason === 'template_withheld', JSON.stringify(g.body))
    // Even called directly, a template is refused.
    const op = rows('operators').find(o => o.email === OWNER_EMAIL)
    const out = await kit.quietAsync(() => L.carryClaimedDemoMenu(pg, op.id, { id: TRUCK }, { actor_user_id: null, actor_role: null, auth_method: 'token' }))
    t('carryClaimedDemoMenu refuses a template outright', out.status === 'skipped' && out.reason === 'not_upload' && items(TRUCK).length === 0)
  }

  // ── 9 ──
  head('9 · NEVER TWICE — resumed create_truck, a repeated signup, two carry-overs racing')
  {
    await signedUp()
    const again = await createTruck()
    t('create_truck again (a retry / /setup on a second device) resumes the same truck and carries nothing more',
      again.body.resumed === true && again.body.menuCarry === 'skipped' && items(TRUCK).length === 5 && rows('trucks').filter(x => x.operator_id).length === 1, JSON.stringify(again.body))
    const s2 = await signup('demo-slugfix1')
    t('signing up again with the same email is refused (account_exists) and the claim is unchanged',
      s2.status === 409 && sessionOf('demo-fix1').claimed_by_operator_id === rows('operators').find(o => o.email === OWNER_EMAIL).id)
    // Two requests racing onto a fresh truck: reset the carry and the menu, then run two at once.
    db(seed())
    await signup('demo-slugfix1')
    const op = rows('operators').find(o => o.email === OWNER_EMAIL)
    await pg.from('trucks').insert({ id: 'race-truck', slug: 'race-truck', name: 'Race', dashboard_token: 'tok-race', operator_id: op.id, setup_step: 'menu', country: 'GB' })
    const A = { actor_user_id: 'u-new', actor_role: 'owner', auth_method: 'authenticated' }
    const [a, b] = await kit.quietAsync(() => Promise.all([L.carryClaimedDemoMenu(pg, op.id, { id: 'race-truck' }, A), L.carryClaimedDemoMenu(pg, op.id, { id: 'race-truck' }, A)]))
    t('two at once: exactly one carries, the other stands down, one menu (5 dishes, 2 groups)',
      [a.status, b.status].sort().join() === 'carried,skipped' && items('race-truck').length === 5 && rows('modifier_groups').filter(g => g.truck_id === 'race-truck').length === 2, JSON.stringify([a, b]))
    t('a reload after it (the bootstrap again) only reads — no write', (await kit.quietAsync(() => L.carryClaimedDemoMenu(pg, op.id, { id: 'race-truck' }, A))).reason === 'already_carried' && items('race-truck').length === 5)
    // Never over a menu, never onto a finished truck.
    db(seed())
    await signup('demo-slugfix1')
    const op2 = rows('operators').find(o => o.email === OWNER_EMAIL)
    await pg.from('trucks').insert({ id: 'has-menu', slug: 'has-menu', name: 'Has', dashboard_token: 'tok-has', operator_id: op2.id, setup_step: 'menu', country: 'GB' })
    await pg.from('menu_items_db').insert({ truck_id: 'has-menu', name: 'Their own dish', price: 9, category_id: 'x', is_active: true })
    await pg.from('trucks').insert({ id: 'live-truck', slug: 'live-truck', name: 'Live', dashboard_token: 'tok-live', operator_id: op2.id, setup_step: 'done', country: 'GB' })
    const h = await kit.quietAsync(() => L.carryClaimedDemoMenu(pg, op2.id, { id: 'has-menu' }, A))
    const lv = await kit.quietAsync(() => L.carryClaimedDemoMenu(pg, op2.id, { id: 'live-truck' }, A))
    t('a truck that already has a menu item is never written over', h.reason === 'truck_has_menu' && items('has-menu').length === 1)
    t('a truck that has finished setup is never written to', lv.reason === 'not_in_setup' && items('live-truck').length === 0)
  }

  // ── 10 ──
  head('10 · a FAILED commit → sign-up still succeeds, nothing half-written, the fallback review still owed')
  {
    db(seed())
    await signup('demo-slugfix1')
    // The database refuses every menu-item insert (categories land, items do not) — a real partial failure.
    const realFrom = pg.from
    pg.from = tb => { const c = realFrom(tb); if (tb !== 'menu_items_db') return c; const ins = c.insert; c.insert = p => { ins.call(c, p); return { select: () => ({ single: async () => ({ data: null, error: { message: 'harness: insert refused' } }) }) } }; return c }
    const c = await createTruck()
    pg.from = realFrom
    t('create_truck still answers ok (the truck exists), and reports the carry-over failed', c.status === 200 && c.body.ok === true && c.body.menuCarry === 'failed', JSON.stringify(c.body))
    t('the partial write is wiped — no categories, items or groups left on the truck',
      items(TRUCK).length === 0 && rows('menu_categories').filter(x => x.truck_id === TRUCK).length === 0 && rows('modifier_groups').filter(x => x.truck_id === TRUCK).length === 0)
    const ss = sessionOf('demo-fix1')
    t('the session records the failure and its reason, and the review is still owed', ss.menu_carry_status === 'failed' && /failed/.test(ss.menu_carry_note || '') && ss.menu_review_status === 'pending', JSON.stringify(ss))
    const r = await reviewState(TOK)
    t('…so the offer still appears, on any device — the fallback', r.body.state === 'offer' && !!r.body.extraction)
    const again = await createTruck()
    t('the next create_truck (resumed) tries again and succeeds', again.body.menuCarry === 'carried' && items(TRUCK).length === 5 && sessionOf('demo-fix1').menu_carry_status === 'done', JSON.stringify(again.body))
    // An injected throw (lib-level): same outcome, never thrown at the caller.
    db(seed())
    await signup('demo-slugfix1')
    const op = rows('operators').find(o => o.email === OWNER_EMAIL)
    await pg.from('trucks').insert({ id: 'boom', slug: 'boom', name: 'Boom', dashboard_token: 'tok-boom', operator_id: op.id, setup_step: 'menu', country: 'GB' })
    const out = await kit.quietAsync(() => L.carryClaimedDemoMenu(pg, op.id, { id: 'boom' }, { actor_user_id: null, actor_role: null, auth_method: 'token' }, { commit: async () => { throw new Error('commit exploded') } }))
    t('a commit that throws is a recorded failure, not an exception', out.status === 'failed' && /exploded/.test(out.error) && sessionOf('demo-fix1').menu_carry_status === 'failed')
    // Unpriced dishes are kept, hidden.
    db(seed({ demo_sessions: [{ truck_id: 'demo-fix1', created_at: '2026-11-09T19:00:00Z', expires_at: '2026-11-10T19:00:00Z', extraction: UNPRICED, extraction_source: 'upload', claimed_by_operator_id: null }] }))
    await signup('demo-slugfix1')
    const u = await createTruck()
    const sp = items(TRUCK).find(i => i.name === 'Weekly Special')
    t('a dish with no price is carried HIDDEN (is_available false), never on sale at 0; the rest are available',
      u.body.menuCarry === 'carried' && sp && sp.is_available === false && items(TRUCK).filter(i => i.name !== 'Weekly Special').every(i => i.is_available === true), JSON.stringify(items(TRUCK).map(i => [i.name, i.price, i.is_available])))
  }

  // ── 11 ──
  head('11 · signup_started from every surface that opens the sign-up form')
  {
    const g = read('components/DemoGetStarted.tsx')
    t('DemoGetStarted counts it itself when the SIGN-UP form opens and the host has no onOpen of its own',
      /if \(onOpen\) onOpen\(\)\s*\n\s*else \{\s*\n\s*const countSlug = slug \|\| eventSlug\s*\n\s*if \(canSetup && countSlug\)/.test(g) && /action: 'event', event: 'signup_started'/.test(g))
    t('…through setOpen, which every opener uses — including the post-save "Set up my truck →" CTA', /onClick=\{\(\) => \{ setJustSaved\(false\); setOpen\(true\) \}\}/.test(g) && !/setOpenState\(true\)/.test(g))
    const dash = read('app/(app)/dashboard/[token]/page.tsx'), kds = read('app/(app)/dashboard/[token]/kds/page.tsx')
    const order = read('app/(app)/trucks/[slug]/order/page.tsx'), walk = read('components/demo/DemoWalkthrough.tsx')
    t('the token-only surfaces (dashboard, KDS) pass the demo slug for the count; the order page has its slug; the walkthrough keeps its own onOpen (no double count)',
      /eventSlug=\{\(truck as \{slug\?:string\|null\}\|null\)\?\.slug\?\?null\}/.test(dash) && /eventSlug=\{\(truck as \{ slug\?: string \| null \} \| null\)\?\.slug \?\? null\}/.test(kds)
      && /<DemoGetStarted slug=\{slug\}/.test(order) && /onOpen=\{\(\) => \{ void post\(\{ action: 'event', event: 'signup_started' \}\)/.test(walk))
    t('the count goes through the existing demo-only, slug-keyed walkthrough action', /if \(body\.event !== 'signup_started' \|\| !isDemoEvent\(body\.event\)\) return refuse\(400, 'unknown_event'\)/.test(read('app/api/demo/walkthrough/route.ts')))
  }

  // ── 12 ──
  head('12 · the other things a demo holds — a branded demo\'s logo is COPIED to the real truck (only into one with none)')
  {
    const withStorage = (files, failCopy = false) => {
      pg.storage = { from: b => ({ async copy(a, z) { if (failCopy || !files.has(`${b}/${a}`)) return { data: null, error: { message: 'copy refused' } }; files.add(`${b}/${z}`); return { data: { path: z }, error: null } } }) }
      return files
    }
    db(seed())
    pg.tables.trucks.find(x => x.id === 'demo-fix1').logo_storage_path = 'demo-fix1/1700000000000-grill-logo.png'
    const files = withStorage(new Set(['truck-media/demo-fix1/1700000000000-grill-logo.png']))
    await signup('demo-slugfix1')
    await createTruck()
    const real = rows('trucks').find(x => x.id === TRUCK)
    t('the logo is copied into the real truck\'s OWN folder and set — not pointed at the demo\'s object',
      /^harness-grill\/\d+-grill-logo\.png$/.test(real.logo_storage_path || '') && files.has(`truck-media/${real.logo_storage_path}`), JSON.stringify({ path: real.logo_storage_path, files: [...files] }))
    db(seed())
    pg.tables.trucks.find(x => x.id === 'demo-fix1').logo_storage_path = 'demo-fix1/1700000000000-grill-logo.png'
    withStorage(new Set(), true)
    await signup('demo-slugfix1')
    const c = await createTruck()
    t('a copy that fails costs the logo only — the truck and the menu are there', c.body.ok && c.body.menuCarry === 'carried' && rows('trucks').find(x => x.id === TRUCK).logo_storage_path == null)
    const op = rows('operators').find(o => o.email === OWNER_EMAIL)
    await pg.from('trucks').update({ logo_storage_path: 'harness-grill/own-upload.png' }).eq('id', TRUCK)
    withStorage(new Set(['truck-media/demo-fix1/1700000000000-grill-logo.png']))
    const again = await kit.quietAsync(() => L.carryClaimedDemoLogo(pg, op.id, { id: TRUCK }))
    t('a truck that already has a logo (their own upload) keeps it', again === null && rows('trucks').find(x => x.id === TRUCK).logo_storage_path === 'harness-grill/own-upload.png')
    const sd = read('app/api/setup/route.ts')
    t('create_truck carries the logo after the menu, and only on a NEW truck', /await carryClaimedDemoLogo\(supabase, operator\.id, \{ id: result\.truck\.id \}\)/.test(sd))
  }

  delete globalThis.__harnessDb; delete globalThis.__harnessUser
  console.log(`\n${fail ? '✗' : '✓'} demo-claim-2: ${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
})().catch(e => { console.error(e); process.exit(1) })
