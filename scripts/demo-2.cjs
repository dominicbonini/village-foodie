#!/usr/bin/env node
// scripts/demo-2.cjs — demo-2 (30 October 2026, docs/demo-2-report.md): the new demo, proved on fixtures.
//   node scripts/demo-2.cjs      (≈ 20 s: a few bundles, an in-memory Supabase AND an in-memory Storage)
//
// WHAT IT PROVES, each against the REAL code (routes and libraries bundled from the repo):
//   1 · EMAIL FIRST — /api/demo refuses a build with no (or a bad) email BEFORE the rate limit and before anything is
//       built; with one it stores it (and the tips choice) on the session, emails the walkthrough link, and answers
//       with /try/<slug>. Outreach builds ask for no email.
//   2 · NO SEEDED ORDERS — the real provisionDemo, restartDemoService, and the walkthrough's T1 and T2 restarts all
//       leave the board EMPTY.
//   3 · THE VISITOR'S ORDER REACHES THE KITCHEN VIEW — and only theirs; Start cooking and Ready move it forward.
//   4 · THE TOKEN NEVER APPEARS in a URL, an email or an event.
//   5 · STORED MENU FILES ARE DELETED WITH THE DEMO — by the real cleanup route — while demo_events survive it.
//   6 · DEMO_EVENTS FOR EACH STEP.
//   7 · "START FREE" prefills the email and claims the demo; 8 · it falls back to Save my menu when signup is off.
// Only the AI menu reader, the logo copier and (for §1) the provisioner are stubbed. Nothing touches the database,
// storage or the network: `fetch` is a recorder.
const fs = require('fs'); const path = require('path')
const kit = require('./_render-kit.cjs')({ cacheTag: 'demo-2' })
const { makeFakePg } = require('./_fake-pg.cjs')
const SEEDS = require('./_country-settings-gb.cjs')
const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
const read = f => fs.readFileSync(path.join(kit.REPO, f), 'utf8')

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${String(detail).slice(0, 500)}` : ''}`) } }
const head = s => console.log(`\n── ${s}`)

const NOW = new Date('2026-10-30T12:00:00Z')
kit.setNow(NOW.toISOString())
const TOKEN = 'demo-TOKEN-secret-0000000000000000'

/** An in-memory Supabase Storage: upload / list / remove / createSignedUrl — what lib/demo-menu-files uses. */
function makeStorage() {
  const files = new Map()
  const from = bucket => ({
    async upload(p, body, o) { const k = `${bucket}/${p}`; if (files.has(k)) return { data: null, error: { message: 'exists' } }; files.set(k, { size: body.byteLength ?? body.length ?? 0, contentType: o?.contentType }); return { data: { path: p }, error: null } },
    async list(folder) { const pre = `${bucket}/${folder}/`; return { data: [...files.keys()].filter(k => k.startsWith(pre)).map(k => ({ name: k.slice(pre.length), metadata: { size: files.get(k).size }, created_at: NOW.toISOString() })), error: null } },
    async remove(paths) { const out = []; for (const p of paths) if (files.delete(`${bucket}/${p}`)) out.push({ name: p }); return { data: out, error: null } },
    async createSignedUrl(p, secs) { return files.has(`${bucket}/${p}`) ? { data: { signedUrl: `https://storage.test/${bucket}/${p}?expires=${secs}` }, error: null } : { data: null, error: { message: 'not found' } } },
  })
  return { files, from }
}
const db = seed => { const pg = makeFakePg(seed); pg.storage = makeStorage(); globalThis.__harnessDb = pg; return pg }
const rows = (pg, tb) => pg.tables[tb] || []

// fetch is a recorder: Brevo answers 201, anything else is a failure (nothing may leave the harness).
const sent = []
globalThis.fetch = async (url, init) => {
  sent.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null })
  return new Response('{}', { status: String(url).includes('api.brevo.com') ? 201 : 599 })
}
process.env.BREVO_API_KEY = 'harness-not-a-key'
process.env.CRON_SECRET = 'harness-cron'

const gb = () => [snake(SEEDS.gbFromSeed())]

;(async () => {
  // ── §1 · EMAIL FIRST ───────────────────────────────────────────────────────────────────────────────────────────
  const D = await kit.bundle('d2-demo', "export { POST } from '@/app/api/demo/route'\nexport { NextRequest } from 'next/server'\nexport { clearCountrySettingsCache } from '@/lib/country-settings'", {
    stubs: {
      '@/lib/provision-demo': `export class ProvisionDemoError extends Error { constructor(m, id) { super(m); this.truckId = id } }
        export async function provisionDemo(supabase, input) { return globalThis.__provision(supabase, input) }`,
      '@/lib/ratelimit': `export const demoRatelimit = { limit: async () => { globalThis.__rateCalls = (globalThis.__rateCalls || 0) + 1; return { success: true } } }`,
      '@/lib/visitor-country': `export async function visitorCountryCodeOf() { return 'GB' }`,
    },
  })
  let provisionCalls = 0
  globalThis.__provision = async (supabase, input) => {
    provisionCalls++
    const id = `demo-truck${provisionCalls}`, slug = `demo-slug${provisionCalls}`
    await supabase.from('trucks').insert({ id, slug, name: 'Demo Kitchen (abc123)', dashboard_token: TOKEN, country: 'GB', timezone: null })
    await supabase.from('demo_sessions').insert({ truck_id: id, expires_at: '2026-10-31T12:00:00.000Z', discovery_truck_id: null })
    return { truckId: id, slug, dashboardToken: TOKEN, vanId: null, event: null, seededOrders: 0, warnings: [], publicRef: null, logoStoragePath: null, logoNote: null,
      menu: input.template ? { kind: 'template', inserted: 4, template: 'Pizza' } : { kind: 'imported', inserted: 7, partial: false, shortfall: 0 } }
  }
  const demoReq = fields => {
    const fd = new FormData()
    for (const [k, v] of Object.entries(fields)) fd.append(k, v)
    return new D.NextRequest('http://hatchgrab.localhost:3000/api/demo', { method: 'POST', body: fd })
  }
  head('1 · email first — required on the landing demo, checked before the rate limit, stored, and the link emailed')
  {
    const pg = db({ country_settings: gb() }); D.clearCountrySettingsCache?.()
    globalThis.__rateCalls = 0; provisionCalls = 0
    const none = await kit.quietAsync(() => D.POST(demoReq({ template: 'pizza' })))
    const bad = await kit.quietAsync(() => D.POST(demoReq({ template: 'pizza', email: 'not-an-email' })))
    const noneBody = await none.json()
    t('no email → 400 email_not_valid, nothing built', none.status === 400 && noneBody.code === 'email_not_valid' && provisionCalls === 0, JSON.stringify(noneBody))
    t('a malformed email → 400, nothing built', bad.status === 400 && provisionCalls === 0)
    const src = read('app/api/demo/route.ts')
    t('…and it is checked BEFORE the rate limit, so a typo never spends one of the five hourly builds',
      src.indexOf('if (!isDemoEmail(email))') > 0 && src.indexOf('if (!isDemoEmail(email))') < src.indexOf('demoRatelimit.limit(ip)'))
    sent.length = 0
    const ok = await kit.quietAsync(() => D.POST(demoReq({ template: 'pizza', email: 'Sam@Example.com', marketing: 'true' })))
    const body = await ok.json()
    const s = rows(pg, 'demo_sessions').find(r => r.truck_id === 'demo-truck1')
    t('with an email: built, and the answer sends the visitor to /try/<slug>', ok.status === 200 && body.ok && body.redirectTo === '/try/demo-slug1' && body.slug === 'demo-slug1', JSON.stringify(body))
    t('the email and the tips choice (with its time) are stored on the session; `email` and the 24-hour expiry are untouched',
      s && s.visitor_email === 'sam@example.com' && s.marketing_opt_in === true && !!s.marketing_opt_in_at && !!s.email_given_at && s.email === undefined && s.expires_at === '2026-10-31T12:00:00.000Z', JSON.stringify(s))
    const mail = sent.find(x => x.url.includes('api.brevo.com'))
    t('the demo link is emailed to them once the build is done, pointing at /try/<slug>',
      !!mail && mail.body.to[0].email === 'Sam@Example.com' && mail.body.htmlContent.includes('http://hatchgrab.localhost:3000/try/demo-slug1') && body.emailSent === true, JSON.stringify(mail?.body?.to))
    const unticked = await kit.quietAsync(() => D.POST(demoReq({ template: 'pizza', email: 'kim@example.com' })))
    const s2 = rows(pg, 'demo_sessions').find(r => r.truck_id === 'demo-truck2')
    t('the tips box unticked → stored as false, with no time', unticked.status === 200 && s2.marketing_opt_in === false && s2.marketing_opt_in_at === null, JSON.stringify(s2))
    const txt = await kit.quietAsync(() => D.POST(demoReq({ text: 'Margherita 9.50\nCola 2', email: 'lee@example.com' })))
    t('pasted text → filed in the private bucket under the demo', txt.status === 200 && [...pg.storage.files.keys()].some(k => /^demo-menus\/demo-truck3\/\d+-menu\.txt$/.test(k)), JSON.stringify([...pg.storage.files.keys()]))
    const photo = await kit.quietAsync(() => D.POST(demoReq({ file: new File([new Uint8Array(1200)], 'My Menu (board).jpg', { type: 'image/jpeg' }), email: 'jo@example.com' })))
    t('an uploaded photo → filed as uploaded, with a safe name', photo.status === 200 && [...pg.storage.files.keys()].some(k => /^demo-menus\/demo-truck4\/\d+-My-Menu-board-\.jpg$/.test(k)), JSON.stringify([...pg.storage.files.keys()]))
    const evs = rows(pg, 'demo_events')
    t('counts: build_started (unnamed — no truck yet), sample_used and build_ok, filed as landing',
      evs.filter(e => e.event === 'build_started' && e.demo_id === null).length >= 4 && evs.some(e => e.event === 'sample_used' && e.demo_id === 'demo-truck1' && e.source === 'landing')
      && evs.some(e => e.event === 'build_ok' && e.demo_id === 'demo-truck1'), JSON.stringify(evs.map(e => [e.demo_id, e.event, e.source])))
    globalThis.__provision = async () => { throw Object.assign(new Error('boom'), { truckId: 'demo-truck9' }) }
    await kit.quietAsync(() => D.POST(demoReq({ template: 'pizza', email: 'x@example.com' })))
    t('a failed build is counted (build_failed)', rows(pg, 'demo_events').some(e => e.event === 'build_failed'))
    // Outreach: the admin route asks for no email (the prospect is known).
    const admin = read('app/api/admin/provision-demo/route.ts')
    t('outreach builds (/api/admin/provision-demo) ask for no email, file the menu and count the build as outreach',
      !/isDemoEmail|visitor_email/.test(admin) && /saveDemoMenuFiles\(supabase, result\.truckId, \{ file, text \}\)/.test(admin) && /source: 'outreach'/.test(admin))
    // The modal: email field before Build and before the sample, required; the privacy link; the unticked box.
    const up = read('components/landing/DemoUpload.tsx')
    t('the modal: email field after the menu, BEFORE "See sample menu" and the footer\'s "Build my demo"; both need a valid email',
      up.indexOf('data-demo-email') > up.indexOf('<MenuUploadFields') && up.indexOf('data-demo-email') < up.indexOf("{t('noPhoto')}")
      && /const canSubmit = \(!!file \|\| !!text\.trim\(\)\) && emailOk/.test(up) && /onClick=\{\(\) => submit\(\{ templateId: SAMPLE_TEMPLATE\.id \}\)\} disabled=\{!emailOk\}/.test(up))
    const en = JSON.parse(read('messages/en-GB.json'))
    t('…its words: "Your email", the line with the privacy-policy link, and the optional tips box (unticked by default)',
      en.demoUpload.emailLabel === 'Your email' && en.demoUpload.emailNote.startsWith('We’ll email you a link to your demo and may contact you about setting up HatchGrab.')
      // ⚠️ RE-PINNED (legal-languages-1, 1 November 2026): the link is useLegalPath('privacy') — /privacy on every English page, as
      // before (scripts/legal-languages-1.cjs §3), the country's translation on a non-English one.
      && /<link>/.test(en.demoUpload.emailNote) && /const privacyHref = useLegalPath\('privacy'\)/.test(up) && /<a href=\{privacyHref\} target="_blank"/.test(up) && en.demoUpload.marketing === 'Send me occasional tips and news from HatchGrab' && /useState\(false\)/.test(up.slice(up.indexOf('const [marketing'))))
  }

  // ── §2 · NO SEEDED ORDERS ──────────────────────────────────────────────────────────────────────────────────────
  head('2 · no seeded orders — on a build, on a restart, and on the walkthrough\'s T1 and T2')
  const P = await kit.bundle('d2-prov', [
    "export { provisionDemo } from '@/lib/provision-demo'",
    "export { restartDemoService } from '@/lib/demo-restart'",
    "export { clearCountrySettingsCache } from '@/lib/country-settings'",
  ].join('\n'), {
    stubs: { '@/lib/demo-logo': `export async function copyDemoLogo() { return { logoStoragePath: null, source: { kind: 'none' }, error: null, cleared: false } }\nexport function demoLogoUpToDate() { return true }` },
  })
  const TRUCK = 'demo-tacoman'
  const demoSeed = (over = {}) => ({
    country_settings: gb(),
    trucks: [{ id: TRUCK, name: 'Tacoman', slug: 'demo-tacoman-slug', dashboard_token: TOKEN, country: 'GB', currency: 'GBP', plan: 'demo', timezone: null, logo_storage_path: null, auto_accept: true }],
    truck_vans: [{ id: 'van-1', truck_id: TRUCK, name: 'Van 1', active: true, collection_interval_mins: 5 }],
    demo_sessions: [{ truck_id: TRUCK, public_ref: 'tacoman', discovery_truck_id: 'dt-1', first_opened_at: null, expires_at: '2026-11-29T12:00:00Z' }],
    menu_categories: [{ id: 'cat-1', truck_id: TRUCK, name: 'Tacos', is_active: true, prep_secs: 300, batch_size: 4, counts_toward_capacity: true, sort_order: 1 }],
    menu_items_db: [{ id: 'item-1', truck_id: TRUCK, name: 'Birria Taco', price: 5, category_id: 'cat-1', is_active: true, is_available: true }],
    truck_events: [], orders: [], slot_capacity: [], production_slot_usage: [],
    ...over,
  })
  {
    const pg = db(demoSeed()); P.clearCountrySettingsCache?.()
    const r = await kit.quietAsync(() => P.provisionDemo(pg, { now: NOW, existingTruckId: TRUCK, discoveryTruckId: 'dt-1', name: 'Tacoman', replaceBoard: true,
      template: { name: 'Sample pizza', categories: ['Pizza'], items: [{ name: 'Margherita', price: 9.5, category: 'Pizza' }] } }))
    t('a build: an event and its slot grid, and NO orders', r.event && rows(pg, 'truck_events').length === 1 && rows(pg, 'orders').length === 0 && r.seededOrders === 0, JSON.stringify({ orders: rows(pg, 'orders').length, seeded: r.seededOrders }))
    const pg2 = db(demoSeed({ orders: [{ id: 'o1', order_key: 'k-old', truck_id: TRUCK, customer_name: 'Old', total: 5 }] }))
    const rr = await kit.quietAsync(() => P.restartDemoService(pg2, TRUCK, { now: NOW }))
    t('"Start a new service" (and T1/T2, which call it): the old orders go and none are seeded', rows(pg2, 'orders').length === 0 && rr.seededOrders === 0)
    t('the seeder is no longer called anywhere', !/seedDemoOrders\(/.test(read('lib/provision-demo.ts')) && !/seedDemoOrders\(/.test(read('lib/demo-restart.ts'))
      && !fs.readdirSync(path.join(kit.REPO, 'app'), { recursive: true }).some(f => /\.tsx?$/.test(f) && /seedDemoOrders\(/.test(read(path.join('app', f)))))
  }

  // ── §3 · THE WALKTHROUGH API: open (T1/T2), the visitor's orders only, the two buttons ──────────────────────────────
  const W = await kit.bundle('d2-walk', [
    "export { GET, POST } from '@/app/api/demo/walkthrough/route'",
    "export { NextRequest } from 'next/server'",
    "export { clearCountrySettingsCache } from '@/lib/country-settings'",
    "export { clearPlanCatalogCache } from '@/lib/plans-server'",
  ].join('\n'), {
    stubs: { '@/lib/auth/admin': `export async function verifyAdmin() { return !!globalThis.__isAdmin }\nexport async function adminUser() { return null }` },
  })
  const SLUG = 'demo-tacoman-slug'
  const wpost = body => W.POST(new W.NextRequest('http://hatchgrab.localhost:3000/api/demo/walkthrough', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
  const wget = qs => W.GET(new W.NextRequest(`http://hatchgrab.localhost:3000/api/demo/walkthrough?${qs}`))
  const plans = [{ key: 'trial', name: 'Trial', sort_order: 1, is_public: false, is_internal: false, is_trial: true, is_signup_default: true, is_expiry_fallback: false, is_demo: false, pay_at_hatch_allowed: true, active: true, included_vans: 1, trial_months: 3 },
    { key: 'payg', name: 'Pay as you go', sort_order: 2, is_public: true, is_internal: false, is_trial: false, is_signup_default: false, is_expiry_fallback: true, is_demo: false, pay_at_hatch_allowed: true, active: true, included_vans: 1, trial_months: null },
    { key: 'demo', name: 'Demo', sort_order: 9, is_public: false, is_internal: true, is_trial: false, is_signup_default: false, is_expiry_fallback: false, is_demo: true, pay_at_hatch_allowed: true, active: true, included_vans: 1, trial_months: null }]
  head('3 · the walkthrough: a live, EMPTY service on open; the visitor\'s order on the kitchen view; Start cooking → Ready')
  {
    const ended = { id: 'ev-old', truck_id: TRUCK, event_date: '2026-10-29', start_time: '10:00:00', end_time: '13:00:00', status: 'open' }
    const pg = db({ ...demoSeed({ truck_events: [ended], orders: [{ id: '7', order_key: 'aaaaaaaa-0000-0000-0000-000000000001', truck_id: TRUCK, event_id: 'ev-old', customer_name: 'Yesterday', status: 'confirmed', items: [] }] }), plans, plan_prices: [], plan_features: [] })
    W.clearCountrySettingsCache?.(); W.clearPlanCatalogCache?.()
    globalThis.__isAdmin = true
    const adminOpen = await kit.quietAsync(() => wpost({ slug: SLUG, action: 'open' }))
    const aBody = await adminOpen.json()
    t('an ADMIN opening an outreach link does not use up the prospect\'s first open (T1 still makes it live)', adminOpen.status === 200 && rows(pg, 'demo_sessions')[0].first_opened_at === null && aBody.restarted === true, JSON.stringify(aBody))
    globalThis.__isAdmin = false
    const open = await kit.quietAsync(() => wpost({ slug: SLUG, action: 'open' }))
    const ob = await open.json()
    t('the prospect\'s first open (T2): claimed, and the service starts fresh from their moment — EMPTY', open.status === 200 && ob.restarted === true && !!rows(pg, 'demo_sessions')[0].first_opened_at && rows(pg, 'orders').length === 0, JSON.stringify(ob))
    t('open answers with what the page needs: source, trial months (from the plans) and the truck\'s time settings — and no token', ob.source === 'outreach' && ob.trialMonths === 3 && !!ob.time && !JSON.stringify(ob).includes(TOKEN), JSON.stringify(ob))
    const again = await kit.quietAsync(() => wpost({ slug: SLUG, action: 'open' }))
    t('opening again on a live service restarts nothing', (await again.json()).restarted === false)
    t('a slug that is not a demo is refused', (await kit.quietAsync(() => wpost({ slug: 'pizzeria-gusto', action: 'open' }))).status === 404)
    t('menu_viewed counted, as an outreach demo\'s', rows(pg, 'demo_events').some(e => e.event === 'menu_viewed' && e.demo_id === TRUCK && e.source === 'outreach'))
    // The visitor's order (as /api/orders/submit writes it on a demo: no email), plus orders that are NOT theirs.
    const evId = rows(pg, 'truck_events')[0].id
    const MINE = 'bbbbbbbb-0000-0000-0000-000000000002', OTHER = 'cccccccc-0000-0000-0000-000000000003', ELSEWHERE = 'dddddddd-0000-0000-0000-000000000004'
    pg.tables.orders.push(
      { id: '1', order_key: MINE, truck_id: TRUCK, event_id: evId, customer_name: 'Alex', customer_email: null, slot: '12:15:00', status: 'confirmed', items: [{ name: 'Birria Taco', quantity: 2 }], created_at: NOW.toISOString() },
      { id: '2', order_key: OTHER, truck_id: TRUCK, event_id: evId, customer_name: 'Someone else', customer_email: null, slot: '12:20:00', status: 'confirmed', items: [], created_at: NOW.toISOString() },
      { id: '9', order_key: ELSEWHERE, truck_id: 'pizzeria-gusto', customer_name: 'A real customer', status: 'confirmed', items: [], created_at: NOW.toISOString() })
    const g = await (await kit.quietAsync(() => wget(`slug=${SLUG}&orders=${MINE},${ELSEWHERE}`))).json()
    t('the kitchen view shows the visitor\'s order — with its collection time and items', g.ok && g.orders.length === 1 && g.orders[0].orderKey === MINE && g.orders[0].slot === '12:15:00' && g.orders[0].items[0].quantity === 2, JSON.stringify(g))
    t('…and ONLY theirs: not the demo\'s other orders, and never another truck\'s order even when its key is sent', !JSON.stringify(g).includes(OTHER) && !JSON.stringify(g).includes('A real customer'))
    const c = await (await kit.quietAsync(() => wpost({ slug: SLUG, action: 'start_cooking', orderKey: MINE }))).json()
    t('Start cooking → cooking', c.status === 'cooking' && rows(pg, 'orders').find(o => o.order_key === MINE).status === 'cooking')
    const rd = await (await kit.quietAsync(() => wpost({ slug: SLUG, action: 'ready', orderKey: MINE }))).json()
    t('Ready → ready; nothing is sent (no email request left the route)', rd.status === 'ready' && rows(pg, 'orders').find(o => o.order_key === MINE).status === 'ready' && !sent.some(x => x.url.includes('brevo') && JSON.stringify(x.body).includes('Alex')))
    t('the buttons cannot move another truck\'s order', (await kit.quietAsync(() => wpost({ slug: SLUG, action: 'ready', orderKey: ELSEWHERE }))).status === 404 && rows(pg, 'orders').find(o => o.order_key === ELSEWHERE).status === 'confirmed')
    await kit.quietAsync(() => wpost({ slug: SLUG, action: 'event', event: 'signup_started' }))
    t('counts: cooking_started, ready_pressed and signup_started', ['cooking_started', 'ready_pressed', 'signup_started'].every(e => rows(pg, 'demo_events').some(r => r.event === e && r.demo_id === TRUCK)))
    t('an event the page may not send is refused', (await kit.quietAsync(() => wpost({ slug: SLUG, action: 'event', event: 'signup_done' }))).status === 400)
    const landing = db({ ...demoSeed({ demo_sessions: [{ truck_id: TRUCK, discovery_truck_id: null, first_opened_at: null }], truck_events: [ended] }), plans })
    W.clearCountrySettingsCache?.(); W.clearPlanCatalogCache?.()
    const lo = await (await kit.quietAsync(() => wpost({ slug: SLUG, action: 'open' }))).json()
    t('a landing demo whose service has ended (T1) is made live again — empty — and needs no email', lo.restarted === true && lo.source === 'landing' && rows(landing, 'orders').length === 0)
    const gone = db({ ...demoSeed({ demo_sessions: [] }), plans })
    t('a demo whose session is gone answers 410 (the page says the demo has ended)', (await kit.quietAsync(() => wpost({ slug: SLUG, action: 'open' }))).status === 410)
    void gone
  }

  // ── §3b · the submit route and the order page: a demo order needs no email; its key reaches the kitchen ─────────────
  head('3b · the order page: no email on a demo, "Alex" by default, the payment panel, and the key handed to the kitchen')
  {
    const sub = read('app/api/orders/submit/route.ts')
    t('submit: a demo order needs no email — keyed on the demo- identifier, CONFIRMED on the truck\'s own id, stored as null, counted',
      /const demoRequest = isDemoIdentifier\(String\(truckId \?\? ''\)\)/.test(sub) && /\(!customerEmail && !demoRequest\)/.test(sub)
      && /if \(!customerEmail && !isDemoTruck\) \{/.test(sub) && /customer_email: customerEmail \|\| null/.test(sub) && /event: 'order_placed'/.test(sub))
    const op = read('app/trucks/[slug]/order/page.tsx')
    t('order page: no email field on a demo; name optional with "Alex" standing in', /\{!isDemo && <Fld label=\{tOrder\('emailLabel'\)\}/.test(op) && /customerName: isDemo \? \(name\.trim\(\) \|\| tWalk\('defaultName'\)\)/.test(op)
      && /customerEmail: isDemo \? '' : email/.test(op) && (op.match(/\(!isDemo && \(!name \|\| !emailValid\)\)/g) || []).length === 3)
    t('…the payment panel in place of the card step, the step label, and the banner sentence', /data-demo-payment/.test(op) && /tWalk\('paymentPanel'\)/.test(op) && /tWalk\('step1'\)/.test(op) && /message=\{tDemo\('walkBanner'\)\}/.test(op))
    t('…after a demo order: the key is kept for the kitchen, the laptop frame is told, a phone goes to /try/<slug>?view=kitchen',
      /addDemoWalkOrder\(slug, data\.orderKey\)/.test(op) && /postMessage\(\{ type: 'hg-demo-order', orderKey: data\.orderKey \}, window\.location\.origin\)/.test(op)
      && /window\.location\.assign\(`\/try\/\$\{encodeURIComponent\(slug\)\}\?view=kitchen`\)/.test(op))
    const en = JSON.parse(read('messages/en-GB.json'))
    t('the words, as the brief gives them', en.demo.walkBanner === 'Demo · this is your menu, the way your customers will see it. Nothing is charged and no emails are sent.'
      && en.demoWalk.step1 === 'Step 1 of 3 · Order like one of your customers'
      && en.demoWalk.paymentPanel === 'Your customer pays here by card, Apple Pay or Google Pay, or chooses to pay at the truck. In the demo, nothing is charged.'
      && en.demoWalk.bubbleTitle === 'This is your kitchen screen' && en.demoWalk.bubbleArrived === 'The order you just placed arrived here instantly, with the collection time. Tap Start cooking.'
      && en.demoWalk.bubbleReady === 'When the food is ready, tap Ready. Your customer is told straight away.' && en.demoWalk.step3 === 'Step 3 of 3 · done'
      && en.demoWalk.told === '{name} has just been told their food is ready.' && en.demoWalk.waitingTitle === 'Waiting for orders'
      && en.demoWalk.bandTitle === 'That’s HatchGrab. Your menu is already set up.' && en.demoWalk.tryAnother === 'Try another order' && en.demoWalk.orderAgain === 'Order again')
  }

  // ── §4 · THE TOKEN NEVER APPEARS IN A URL OR AN EVENT ─────────────────────────────────────────────────────────
  head('4 · the dashboard token never appears in a URL, an email or an event')
  {
    const R = await kit.bundle('d2-ref', "export { GET } from '@/app/demo/[ref]/route'\nexport { NextRequest } from 'next/server'", {
      stubs: { '@/lib/visitor-country': `export async function routedAddress() { return '/uk?demo=expired' }` },
    })
    db({ demo_sessions: [{ truck_id: TRUCK, public_ref: 'tacoman' }], trucks: [{ id: TRUCK, slug: SLUG, dashboard_token: TOKEN }] })
    const res = await kit.quietAsync(() => R.GET(new R.NextRequest('http://hatchgrab.localhost:3000/demo/tacoman'), { params: Promise.resolve({ ref: 'tacoman' }) }))
    const loc = res.headers.get('location') || ''
    t('the outreach link /demo/<ref> redirects to /try/<slug> — no longer to /dashboard/<token>', /\/try\/demo-tacoman-slug$/.test(loc) && !loc.includes(TOKEN), loc)
    const all = JSON.stringify(sent)
    t('no email the harness saw carries the token', !all.includes(TOKEN))
    const evSrc = read('lib/demo-events.ts')
    t('demo_events rows carry the demo id, step, source and time — no email, no token (and the migration agrees)', /demo_id: row\.demoId, event: row\.event, source/.test(evSrc)
      && !/email|token/.test((read('supabase/migrations/20261052_demo_2.sql').match(/create table if not exists public\.demo_events \(([\s\S]*?)\);/) || [])[1] || 'email'))
    const walk = read('components/demo/DemoWalkthrough.tsx') + read('app/try/[slug]/page.tsx') + read('app/api/demo/walkthrough/route.ts')
    t('the walkthrough (page, component, API) never reads or holds a dashboard token', !/dashboard_token|dashboardToken|\/dashboard\//.test(walk.replace(/\/\/.*$/gm, '')))
    t('the landing modal goes to the redirect the route gives (/try/<slug>), which no longer names the dashboard', /redirectTo: `\/try\/\$\{encodeURIComponent\(result\.slug\)\}`/.test(read('app/api/demo/route.ts')) && !/redirectTo: `\/dashboard/.test(read('app/api/demo/route.ts')))
  }

  // ── §5 · STORED MENU FILES ARE DELETED WITH THE DEMO; THE COUNTS SURVIVE ───────────────────────────────────────
  head('5 · the cleanup sweep deletes a demo\'s stored menu files with it — and the counts survive')
  {
    const C = await kit.bundle('d2-cron', "export { GET } from '@/app/api/cron/demo-cleanup/route'\nexport { NextRequest } from 'next/server'\nexport { saveDemoMenuFiles } from '@/lib/demo-menu-files'", {
      stubs: { '@/lib/auth/admin': `export async function verifyAdmin() { return false }` },
    })
    const pg = db({
      demo_sessions: [
        { truck_id: 'demo-expired', expires_at: '2026-10-29T00:00:00Z', claimed_by_operator_id: null, created_at: '2026-10-28T00:00:00Z' },
        { truck_id: 'demo-claimed', expires_at: '2026-10-29T00:00:00Z', claimed_by_operator_id: 'op-1', created_at: '2026-10-28T00:00:00Z' },
        { truck_id: 'demo-live', expires_at: '2026-11-30T00:00:00Z', claimed_by_operator_id: null, created_at: '2026-10-30T00:00:00Z' },
      ],
      trucks: [{ id: 'demo-expired' }, { id: 'demo-claimed' }, { id: 'demo-live' }],
      menu_items_db: [{ id: 'i1', truck_id: 'demo-live', is_active: true }], truck_events: [{ id: 'e1', truck_id: 'demo-live' }],
      demo_events: [{ id: 1, demo_id: 'demo-expired', event: 'build_ok', source: 'landing', at: '2026-10-28T00:00:00Z' }, { id: 2, demo_id: 'demo-expired', event: 'order_placed', source: 'landing', at: '2026-10-28T00:01:00Z' }],
      demo_cleanup_log: [],
    })
    for (const id of ['demo-expired', 'demo-claimed', 'demo-live']) await C.saveDemoMenuFiles(pg, id, { text: `menu of ${id}` }, NOW)
    const res = await kit.quietAsync(() => C.GET(new C.NextRequest('http://hatchgrab.localhost:3000/api/cron/demo-cleanup', { headers: { authorization: 'Bearer harness-cron' } })))
    const body = await res.json()
    const keys = [...pg.storage.files.keys()]
    t('the expired demo and its stored file are gone', !rows(pg, 'trucks').some(r => r.id === 'demo-expired') && !keys.some(k => k.includes('demo-expired')), JSON.stringify({ keys, body }))
    t('a claimed demo keeps its file as long as its session is kept; a live demo keeps its file', keys.some(k => k.includes('demo-claimed')) && keys.some(k => k.includes('demo-live')))
    t('the deletion is recorded in demo_cleanup_log (files_deleted)', body.filesDeleted === 1 && rows(pg, 'demo_cleanup_log').some(r => r.files_deleted === 1), JSON.stringify(rows(pg, 'demo_cleanup_log')))
    t('demo_events SURVIVE the sweep — the expired demo is still counted', rows(pg, 'demo_events').filter(e => e.demo_id === 'demo-expired').length === 2)
    t('the admin delete route deletes a demo\'s files too', /if \(isDemoIdentifier\(truckId\)\) await deleteDemoMenuFiles\(supabase, truckId\)\s*\n\s*await deleteTruckCascade/.test(read('app/api/admin/delete-truck/route.ts')))
    t('the bucket is private, service role only, and Admin hands out a 60-second signed link', /\('demo-menus', 'demo-menus', false/.test(read('supabase/migrations/20261052_demo_2.sql'))
      && /SIGNED_URL_SECONDS = 60/.test(read('lib/demo-menu-files.ts')) && !/getPublicUrl/.test(read('lib/demo-menu-files.ts')))
  }

  // ── §6 · the funnel ──
  head('6 · demo_events for each step, and the funnel Admin shows')
  {
    const F = await kit.bundle('d2-funnel', "export { demoFunnel, DEMO_EVENTS, recordDemoEvent } from '@/lib/demo-events'")
    const pg = db({ demo_events: [] })
    await F.recordDemoEvent(pg, { demoId: 'pizzeria-gusto', event: 'order_placed', source: 'landing' })
    t('an operator truck\'s id is never recorded', rows(pg, 'demo_events').length === 0)
    t('the ten steps, as the brief names them', JSON.stringify(F.DEMO_EVENTS) === JSON.stringify(['build_started', 'build_ok', 'build_failed', 'sample_used', 'menu_viewed', 'order_placed', 'cooking_started', 'ready_pressed', 'signup_started', 'signup_done']))
    const f = F.demoFunnel([
      { demo_id: null, event: 'build_started', source: 'landing' }, { demo_id: null, event: 'build_started', source: 'landing' },
      { demo_id: 'demo-a', event: 'menu_viewed', source: 'landing' }, { demo_id: 'demo-a', event: 'menu_viewed', source: 'landing' },
      { demo_id: 'demo-b', event: 'menu_viewed', source: 'outreach' }, { demo_id: 'demo-a', event: 'order_placed', source: 'landing' },
    ])
    t('each demo counts once per step; unnamed builds count per row', f.build_started === 2 && f.menu_viewed === 2 && f.order_placed === 1, JSON.stringify(f))
    t('…and by source', F.demoFunnel([{ demo_id: 'demo-b', event: 'menu_viewed', source: 'outreach' }, { demo_id: 'demo-a', event: 'menu_viewed', source: 'landing' }], 'outreach').menu_viewed === 1)
    const sig = read('app/api/signup/route.ts')
    t('signup_done is written server-side when the account claims a demo', /event: 'signup_done'/.test(sig))
    const writers = { build_started: 'app/api/demo/route.ts', build_ok: 'app/api/demo/route.ts', build_failed: 'app/api/demo/route.ts', sample_used: 'app/api/demo/route.ts',
      menu_viewed: 'app/api/demo/walkthrough/route.ts', order_placed: 'app/api/orders/submit/route.ts', cooking_started: 'app/api/demo/walkthrough/route.ts',
      ready_pressed: 'app/api/demo/walkthrough/route.ts', signup_started: 'app/api/demo/walkthrough/route.ts', signup_done: 'app/api/signup/route.ts' }
    t('every step has a server-side writer', Object.entries(writers).every(([e, f]) => read(f).includes(`'${e}'`)), JSON.stringify(Object.entries(writers).filter(([e, f]) => !read(f).includes(`'${e}'`))))
  }

  // ── §7–8 · START FREE ──
  head('7 · "Start free" prefills the email and claims the demo; 8 · it falls back to Save my menu while signup is off')
  {
    const walk = read('components/demo/DemoWalkthrough.tsx')
    t('the walkthrough opens the existing signup wizard with the email from THIS browser\'s memory, never from the server',
      /<DemoGetStarted\s+slug=\{slug\}\s+prefillEmail=\{demoEmailFor\(slug\)\}/.test(walk) && /rememberDemoEmail\(data\.slug, email\)/.test(read('components/landing/DemoUpload.tsx')))
    const g = read('components/DemoGetStarted.tsx')
    t('the wizard starts with that email, and signs up claiming the demo by its slug (so the menu carries over via ?import=demo)',
      /useState\(prefillEmail \?\? ''\)/.test(g) && /demo: token \|\| slug/.test(g) && /\?import=demo/.test(g))
    const sig = read('app/api/signup/route.ts')
    t('/api/signup claims by token OR slug; a slug claim takes only an unclaimed demo', /\.eq\('slug', demoToken\)/.test(sig) && /claim\.is\('claimed_by_operator_id', null\)/.test(sig))
    // 8 — render the trigger with signup OFF (the production state) and ON.
    const off = await kit.bundle('d2-gs-off', "export { DemoGetStarted } from '@/components/DemoGetStarted'", { define: { 'process.env.NEXT_PUBLIC_SIGNUP_PUBLIC': '"false"' } })
    const on = await kit.bundle('d2-gs-on', "export { DemoGetStarted } from '@/components/DemoGetStarted'", { define: { 'process.env.NEXT_PUBLIC_SIGNUP_PUBLIC': '"true"' } })
    const props = { slug: SLUG, setupLabel: 'Start free for 3 months, keep my menu', prefillEmail: 'sam@example.com' }
    const offHtml = kit.renderStatic(kit.React().createElement(off.DemoGetStarted, props))
    const onHtml = kit.renderStatic(kit.React().createElement(on.DemoGetStarted, props))
    const en = JSON.parse(read('messages/en-GB.json'))
    t('signup OFF: the button is the Save-my-menu path, with its own honest label — not "Start free"', offHtml.includes(en.demoGetStarted.saveOnly.bannerButton) && !offHtml.includes('Start free'), offHtml.slice(0, 300))
    t('signup ON: the same button reads "Start free for 3 months, keep my menu" and opens the wizard', onHtml.includes('Start free for 3 months, keep my menu'), onHtml.slice(0, 300))
  }

  // ── §9 · G11 (demo-2b, 31 October 2026, docs/demo-2b-report.md) ──
  head('9 · G11 — the demo\'s signup button gets the same inputs on every surface (KDS, dashboard, order page, walkthrough)')
  {
    const kds = read('app/dashboard/[token]/kds/page.tsx'), dash = read('app/dashboard/[token]/page.tsx')
    const order = read('app/trucks/[slug]/order/page.tsx'), walk = read('components/demo/DemoWalkthrough.tsx')
    t('the KDS mounts DemoGetStarted with isAdmin and the demo\'s extraction source, as the dashboard does',
      /<DemoGetStarted token=\{token\} isAdmin=\{isAdmin\} extractionSource=\{demoExtractionSource\}/.test(kds) && /<DemoGetStarted token=\{token\} isAdmin=\{isAdmin\} extractionSource=\{demoSession\?\.extraction_source\?\?null\}/.test(dash))
    t('…the KDS reads the extraction source from the /api/dashboard demo block it already fetches, and asks /api/auth/me ONLY on a demo',
      /if \(data\.demo !== undefined\) setDemoExtractionSource\(data\.demo\?\.extraction_source \?\? null\)/.test(kds) && /if \(!isDemo\) return\s+let cancelled = false\s+nativeAuthHeader\(\)\.then\(h => fetch\('\/api\/auth\/me'/.test(kds))
    t('the demo order page and the walkthrough pass the extraction source too',
      /<DemoGetStarted slug=\{slug\} extractionSource=\{demoExtractionSource\}/.test(order) && /info=1/.test(order) && /extractionSource=\{info\?\.extractionSource \?\? null\}/.test(walk))
    // The route: ?info=1 answers the extraction source (and nothing else); open carries it.
    db({ ...demoSeed({ demo_sessions: [{ truck_id: TRUCK, public_ref: 'tacoman', discovery_truck_id: null, first_opened_at: null, extraction_source: 'template', expires_at: '2026-11-29T12:00:00Z' }] }), plans, plan_prices: [], plan_features: [] })
    W.clearCountrySettingsCache?.(); W.clearPlanCatalogCache?.()
    const info = await (await kit.quietAsync(() => wget(`slug=${SLUG}&info=1`))).json()
    t('/api/demo/walkthrough?info=1 answers the extraction source, and no token', info.ok === true && info.extractionSource === 'template' && Object.keys(info).sort().join() === 'extractionSource,ok', JSON.stringify(info))
    const ob = await (await kit.quietAsync(() => wpost({ slug: SLUG, action: 'open' }))).json()
    t('…and open carries it for the walkthrough', ob.extractionSource === 'template', JSON.stringify(ob))
    // Rendered with signup ON: a SAMPLE demo reads the sample button on every surface; an uploaded one the upload button.
    const on = await kit.bundle('d2-gs-on-g11', "export { DemoGetStarted } from '@/components/DemoGetStarted'", { define: { 'process.env.NEXT_PUBLIC_SIGNUP_PUBLIC': '"true"' } })
    const en = JSON.parse(read('messages/en-GB.json')).demoGetStarted
    const html = props => kit.renderStatic(kit.React().createElement(on.DemoGetStarted, props))
    t('signup ON, a sample demo: the KDS (token) and the order page (slug) both show the sample button',
      html({ token: TOKEN, extractionSource: 'template' }).includes(en.sample.bannerButton) && html({ slug: SLUG, extractionSource: 'template' }).includes(en.sample.bannerButton))
    t('signup ON, an uploaded menu: both show the upload button', html({ token: TOKEN, extractionSource: 'upload' }).includes(en.upload.bannerButton) && html({ slug: SLUG, extractionSource: 'upload' }).includes(en.upload.bannerButton))
  }

  // ── §10 · demo-2c (31 October 2026, docs/demo-2c-report.md): the privacy text's demo claims are what the code does ──
  head('10 · the privacy policy\'s demo sentences match the code (retention, the claimed-demo grace, PostHog on the demo)')
  {
    const pol = read('content/legal/privacy-policy.md'), ses = read('lib/demo-session.ts'), sweep = read('app/api/cron/demo-cleanup/route.ts'), prov = read('app/providers.tsx')
    const num = (src, name) => Number((new RegExp(`const ${name} = (\\d+)`).exec(src) || [])[1])
    t('24 hours / 14 days / 30 days for a contacted truck — the policy\'s periods are the retention constants',
      num(ses, 'RETENTION_NO_EMAIL_HOURS') === 24 && num(ses, 'RETENTION_WITH_EMAIL_DAYS') === 14 && num(ses, 'RETENTION_OUTREACH_DAYS') === 30
      && pol.includes('24 hours after you build it, or 14 days if you ask us to keep it') && pol.includes('kept for up to 30 days and do not ask for an email'))
    // ⚠️ RE-PINNED (tidy-1, 3 November 2026): the two "If you sign up" sentences were merged (the demo-2d tidy) — same claim, same 30 days.
    t('"…we keep the demo record for up to 30 days" (after a signup) — CLAIM_GRACE_DAYS is 30, and the claimed sweep needs BOTH past expiry and older than it',
      num(sweep, 'CLAIM_GRACE_DAYS') === 30 && /\.not\('claimed_by_operator_id', 'is', null\)\s*\.lt\('expires_at', new Date\(\)\.toISOString\(\)\)\s*\.lt\('created_at', claimCutoff\)/.test(sweep)
      && pol.includes("If you sign up, your menu moves into your account and your account's privacy terms apply from then on; we keep the demo record for up to 30 days so the menu can move across, then delete it."))
    const credRe = new RegExp((/const CREDENTIAL_ROUTE_RE = \/(.+)\/\n/.exec(prov) || [])[1] || 'x^')
    t('PostHog runs on the demo (/try/<slug>, the demo order page): its credential guard excludes neither — and the policy says so',
      !credRe.test('/try/demo-abc') && !credRe.test('/trucks/demo-abc/order') && credRe.test('/dashboard/x') && !/startsWith\('\/try|\/try\b/.test(prov.split('posthog.init(')[0])
      && pol.includes('It does run on the HatchGrab demo, which shows a sample kitchen screen.'))
  }

  delete globalThis.__harnessDb
  console.log(`\n${fail ? '✗' : '✓'} demo-2: ${pass} passed, ${fail} failed`)
  if (fail) process.exit(1)
})().catch(e => { console.error(e); process.exit(1) })
