// scripts/_lp1d2-api.cjs — Language Phase 1d PART 2, area `api`: every in-scope refusal and a success (with its writes) of
//   app/api/manage POST   update_charges, save_embed_setup, get_embed_status, every domain_* action, disconnect_whatsapp,
//                         the team actions (get_team, invite_member, update_member, remove_member, invite_team_member,
//                         remove_team_member), get_report, get_recent_events, sg_place_usual_type, sg_merge_place, the
//                         reply-limit refusal inside update_truck, and the shared checks (no token, bad token, no user, not
//                         this truck, staff / manager not allowed, a demo truck) for these actions
//   app/api/manage GET    every refusal it writes and one success
//   app/api/weekly-post   POST (every action's refusals — plan gate, bad input, not found, upload checks, font refusals,
//                         private event no single post — and successes: designs, social_overview, captions, renders) and
//                         GET (the font file)
//   app/api/manage/whatsapp-preview, app/api/manage/whatsapp-signup — refusals and successes
// for a GB and a US truck, as { status, body (text), writes, calls, fetches, storage, renders, headers? }.
// Part 1's `|oos|` views (update_charges noToken, invite_team_member staff, get_report noUser, replyLimit) are IN SCOPE here.
// 🔴 NAMED DIFFERENCE 1: a refusal whose `error` is OUR sentence gains "code" and "params", LAST; scripts/_lp1d2-checks.cjs
// proves it per field. Every write, call, fetch, storage operation and render must be byte-identical.
// ⚠️ NOTHING REAL: Supabase is scripts/_fake-pg.cjs (+ a recording storage and auth.admin), the session is a stand-in,
// global fetch is a router of canned answers (DNS, Vercel, Meta Graph, Gemini, Brevo, Google Fonts — every URL recorded,
// keys redacted), lib/email is a recorder, `next/og` ImageResponse records a hash of the element tree and returns a fixed
// PNG, Upstash is a stand-in whose refusals a case chooses, token-crypto is deterministic, crypto.randomBytes is a counter.
// 🔴 RUNS ON BOTH CODES (826471a and this tree).
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

const ENV = {
  NEXT_PUBLIC_HATCHGRAB_URL: 'https://hatchgrab.test',
  BREVO_API_KEY: 'harness-brevo-key',
  GEMINI_API_KEY: 'harness-gemini-key',
  VERCEL_API_TOKEN: 'harness-vercel-token',
  VERCEL_PROJECT_ID: 'prj_harness',
  VERCEL_TEAM_ID: undefined,
  AUDIT_HASH_SECRET: 'harness-audit',
  NEXT_PUBLIC_WHATSAPP_SIGNUP_APP_ID: '1234567890',
  META_WHATSAPP_APP_SECRET: 'harness-app-secret',
  WHATSAPP_REGISTRATION_PIN: '123456',
  EMAIL_FROM_ADDRESS: 'donotreply@hatchgrab.test',
}
const setEnv = o => { for (const [k, v] of Object.entries(o)) { if (v === undefined) delete process.env[k]; else process.env[k] = v } }

/** A minimal PNG header (readImageInfo reads only the IHDR size), `pad` extra bytes after it. */
function png(w, h, pad = 0) {
  const b = Buffer.alloc(33 + pad)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0)
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20)
  b[24] = 8; b[25] = 6
  return b
}
const sha = x => crypto.createHash('sha1').update(x).digest('hex').slice(0, 16)

async function views(ctx) {
  const { kit } = ctx
  const REPO = ctx.REPO
  const SCRIPTS = path.join(REPO, 'scripts')
  const { makeFakePg } = require(path.join(SCRIPTS, '_fake-pg.cjs'))
  const SEEDS = require(path.join(SCRIPTS, '_country-settings-gb.cjs'))
  const { NextRequest } = require(path.join(REPO, 'node_modules/next/server'))
  const snake = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.replace(/[A-Z]/g, c => '_' + c.toLowerCase()), v]))
  setEnv(ENV)   // before the bundle loads: some modules read a key at load (the Gemini URL)

  const STUBS = {
    '@/lib/supabase/server': `export async function createSupabaseServerClient() {
  return { auth: { getUser: async () => ({ data: { user: globalThis.__harnessUser ?? null }, error: null }) } }
}`,
    '@/lib/email': `const rec = (n, a) => (globalThis.__calls ||= []).push([n, ...a])
export const sendConfirmationEmail = async (p) => {
  // The email WHOLE (subject, HTML and text) — its words are compared like any view's (never sent).
  rec('sendConfirmationEmail', [p && p.to, { subject: p && p.subject, senderName: p && p.senderName, html: p && p.html, text: p && p.text }])
  if (globalThis.__emailThrows) throw new Error('harness: the mail provider refused')
}
export const sendEventCancellationEmail = async (...a) => { rec('sendEventCancellationEmail', [a.length]) }`,
    'next/og': `export class ImageResponse {
  constructor(el, opts) {
    const o = opts || {}
    ;(globalThis.__renders ||= []).push({ width: o.width, height: o.height, fonts: (o.fonts || []).map(f => [f.name, f.weight, f.style].join('|')), tree: globalThis.__sha(JSON.stringify(el)) })
  }
  async arrayBuffer() { const b = globalThis.__fakePng; return b.buffer.slice(b.byteOffset, b.byteOffset + b.length) }
}`,
    '@upstash/redis': `export class Redis { static fromEnv() { return new Redis() } }`,
    '@upstash/ratelimit': `export class Ratelimit {
  constructor(o) { this.prefix = (o && o.prefix) || '' }
  static slidingWindow() { return {} }
  static fixedWindow() { return {} }
  static tokenBucket() { return {} }
  async limit(key) {
    const how = (globalThis.__rl || {})[this.prefix]
    ;(globalThis.__calls ||= []).push(['ratelimit', this.prefix, how || 'ok'])
    if (how === 'throw') throw new Error('harness: redis is unreachable')
    return { success: how !== 'refuse', limit: 1, remaining: 0, reset: 0, pending: Promise.resolve() }
  }
}`,
    '@/lib/whatsapp/token-crypto': `export function encryptionKeyConfigured() { return globalThis.__encKey !== false }
export function encryptToken(p) { return 'cipher(' + p + ')' }
export function decryptToken(c) { if (!String(c).startsWith('cipher(')) throw new Error('harness: undecryptable'); return String(c).slice(7, -1) }`,
  }
  const PATCHES = [
    // WHATSAPP_LIVE is true on both codes; a case turns it off to reach the "not available" refusal.
    // ⚠️ A LIVE BINDING (`let` + a setter), not a read of a global: the constant is evaluated once, at module load.
    { file: 'lib/whatsapp-live.ts', from: 'export const WHATSAPP_LIVE: boolean = true', to: 'export let WHATSAPP_LIVE: boolean = true\nexport function __harnessSetWaLive(v: boolean) { WHATSAPP_LIVE = v }', optional: true },
  ]
  const M = await kit.bundle('lp1d2-api', `
export { POST as managePOST, GET as manageGET } from '@/app/api/manage/route'
export { POST as wpPOST, GET as wpGET } from '@/app/api/weekly-post/route'
export { POST as previewPOST } from '@/app/api/manage/whatsapp-preview/route'
export { POST as signupPOST } from '@/app/api/manage/whatsapp-signup/route'
export { defaultLayout, defaultEventLayout } from '@/lib/weekly-post/layout'
export { clearCountrySettingsCache } from '@/lib/country-settings'
import * as WL from '@/lib/whatsapp-live'
export const setWaLive = (v: boolean) => (WL as any).__harnessSetWaLive?.(v)`, { stubs: STUBS, patches: PATCHES })

  globalThis.__sha = sha
  globalThis.__fakePng = png(1080, 1350)
  const FONT = f => fs.readFileSync(path.join(REPO, 'assets/fonts/weekly-post', f))
  const BIG_IMG = png(1080, 1350, 11 * 1024 * 1024)
  const BIG_FONT = Buffer.concat([Buffer.from([0, 1, 0, 0]), Buffer.alloc(6 * 1024 * 1024)])
  const FILES = {
    'test-truck/blank-week.png': png(1080, 1350, 16),
    'test-truck/blank-event.png': png(1080, 1350, 24),
    'test-truck/place-p2.png': png(1080, 1350, 8),
    'test-truck/place-p4.png': png(1600, 900, 8),
    'test-truck/place-p5.png': png(1080, 1350, 12),
    'test-truck/pic1.png': png(1080, 1350, 4),
    'test-truck/up-ok.png': png(1080, 1350, 32),
    'test-truck/up-wide.png': png(1600, 900, 32),
    'test-truck/up-small.png': png(400, 300),
    'test-truck/up-big.png': BIG_IMG,
    'test-truck/up-empty.png': Buffer.alloc(0),
    'test-truck/up-notimg.png': Buffer.from('this is not a picture at all, just some words in a file'),
    'trucks/test-truck/incoming-ok.ttf': FONT('bitter-700.ttf'),
    'trucks/test-truck/incoming-woff.ttf': Buffer.concat([Buffer.from('wOFF'), Buffer.alloc(64)]),
    'trucks/test-truck/incoming-junk.ttf': Buffer.from('definitely not a font file, only words'),
    'trucks/test-truck/incoming-big.ttf': BIG_FONT,
    'trucks/test-truck/bitter-400.ttf': FONT('bitter-400.ttf'),
  }
  const FAKE_PNG = Buffer.from(globalThis.__fakePng)

  // ── the network: one router, every URL recorded with its keys redacted ──────────────────────────────
  const redact = u => String(u).replace(/(key|client_secret|api-key)=[^&]+/g, '$1=…')
  const NET = {
    dns: (o, url) => {
      const type = (/[?&]type=([A-Z]+)/.exec(url) || [])[1]
      const name = decodeURIComponent((/[?&]name=([^&]+)/.exec(url) || [])[1] || '')
      const ans = (o.dns || {})[type]
      if (ans === 'fail') return { status: 500, body: {} }
      return { status: 200, body: { Status: 0, Answer: typeof ans === 'function' ? ans(name) : (ans || []) } }
    },
  }
  function route(o, url, init = {}) {
    const u = String(url)
    for (const [pat, r] of Object.entries(o.resp || {})) if (u.includes(pat) && (!r.method || r.method === (init.method || 'GET'))) return r
    if (/cloudflare-dns\.com|dns\.google/.test(u)) return NET.dns(o, u)
    if (u.includes('api.vercel.com')) {
      if ((init.method || 'GET') === 'DELETE') return { status: 200, body: {} }
      if (/\/v6\/domains\/.*\/config/.test(u)) return { status: 200, body: { recommendedCNAME: [{ rank: 1, value: 'cname.vercel-dns-harness.com.' }], configuredBy: null, misconfigured: true } }
      if (/\/v10\/projects\/.*\/domains/.test(u)) { const b = JSON.parse(init.body || '{}'); return { status: 200, body: { name: b.name, verified: false, verification: [] } } }
    }
    if (u.includes('api.brevo.com')) return { status: 201, body: { messageId: 'harness' } }
    if (u.includes('graph.facebook.com')) {
      if (u.includes('/oauth/access_token')) return { status: 200, body: { access_token: 'meta-harness-token', token_type: 'bearer', expires_in: 5184000 } }
      if (u.includes('/register')) return { status: 200, body: { success: true } }
      if (u.includes('/subscribed_apps')) return { status: 200, body: { success: true } }
      if (u.includes('fields=display_phone_number')) return { status: 200, body: { display_phone_number: o.cc === 'US' ? '+1 201-555-0123' : '+44 7700 900123', verified_name: 'Pizza Kitchen', id: 'pn-1' } }
    }
    if (u.includes('generativelanguage.googleapis.com')) {
      let prompt = ''
      try { prompt = JSON.parse(init.body).contents[0].parts[0].text } catch { /* none */ }
      const classify = /^Classify this customer/.test(prompt)
      const text = classify ? (o.geminiClass || 'SPECIFIC_QUERY') : (o.geminiReply || 'Hi! We are at the Market on Saturday from 11am. See you there 🍕')
      return { status: 200, body: { candidates: [{ content: { parts: [{ text }] } }] }, tag: classify ? 'classify' : 'reply' }
    }
    if (u.includes('fonts.googleapis.com') || u.includes('fonts.gstatic.com')) return { status: 500, body: {} }
    return { status: 404, body: {} }
  }

  // ── the recorder ─────────────────────────────────────────────────────────────────────────────────────────
  const KEYS = {
    operators: [['auth_user_id']], whatsapp_connections: [['truck_id']], truck_post_designs: [['truck_id', 'kind']],
    event_post_backgrounds: [['event_id']], place_pictures: [['path']], truck_fonts: [['truck_id', 'family', 'weight', 'style']],
    font_library_cache: [['family', 'weight', 'style']], truck_places: [['truck_id', 'name_key']], excluded_terms: [['truck_id', 'term']],
  }
  const out = {}
  const realFetch = globalThis.fetch
  const realRandomBytes = crypto.randomBytes
  const realRandomUUID = crypto.randomUUID
  async function call(key, o, fn) {
    const base = makeFakePg(o.tables, { keys: KEYS })
    const fail = o.fail || {}
    const errChain = () => { const e = { data: null, error: { message: 'harness: the database refused', code: o.failCode || 'XX000' }, count: null }; const p = new Proxy(function () {}, { get: (_, k) => (k === 'then' ? res => res(e) : () => p) }); return p }
    const from = t => { const c = base.from(t); const ops = fail[t]; if (!ops) return c; return new Proxy(c, { get: (x, k) => (ops.includes(k) ? () => errChain() : x[k]) }) }
    const storage = []
    const files = { ...FILES, ...(o.files || {}) }
    const blob = b => ({ arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.length), size: b.length })
    globalThis.__harnessDb = {
      ...base, from,
      auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        admin: {
          createUser: async a => {
            ;(globalThis.__calls ||= []).push(['auth.admin.createUser', a && a.email, JSON.stringify(a && a.user_metadata)])
            return o.authCreateFails ? { data: { user: null }, error: { message: 'harness: a user with this email already exists' } } : { data: { user: { id: 'auth-new-1' } }, error: null }
          },
        },
      },
      storage: {
        from: bucket => ({
          download: async p => { storage.push(['download', bucket, p]); const b = files[p]; return b ? { data: blob(b), error: null } : { data: null, error: { message: 'Object not found' } } },
          createSignedUrl: async (p, s) => ({ data: { signedUrl: `https://storage.test/${bucket}/${p}?expires=${s}` }, error: null }),
          createSignedUploadUrl: async p => { storage.push(['signUpload', bucket, p]); return o.uploadFails ? { data: null, error: { message: 'harness: storage says no' } } : { data: { signedUrl: `https://storage.test/upload/${bucket}/${p}`, path: p, token: 'up' }, error: null } },
          upload: async (p, data) => { storage.push(['upload', bucket, p, data ? data.length : 0]); return o.storeFails ? { data: null, error: { message: 'harness: storage is full' } } : { data: { path: p }, error: null } },
          remove: async ps => { storage.push(['remove', bucket, ...(ps || [])]); return { data: [], error: null } },
          list: async () => ({ data: [], error: null }),
          getPublicUrl: p => ({ data: { publicUrl: `https://storage.test/public/${bucket}/${p}` } }),
        }),
      },
    }
    globalThis.__harnessUser = o.user === undefined ? { id: 'u-1' } : o.user
    globalThis.__calls = []
    globalThis.__renders = []
    globalThis.__rl = o.rl || {}
    M.setWaLive(o.waLive ?? true)
    globalThis.__encKey = o.encKey
    globalThis.__emailThrows = !!o.emailThrows
    const fetches = []
    globalThis.fetch = async (url, init = {}) => {
      const r = route(o, url, init)
      // An email sent through Brevo directly (the team invite): recorded WHOLE (subject, recipients, HTML) — never sent.
      if (String(url).includes('api.brevo.com')) { try { const b = JSON.parse(init.body); (globalThis.__calls ||= []).push(['brevo', { subject: b.subject, to: (b.to || []).map(x => x.email), html: String(b.htmlContent) }]) } catch { /* none */ } }
      fetches.push(`${init.method || 'GET'} ${redact(url)}${r.tag ? ` (${r.tag})` : ''}`)
      if (r.throws) throw new Error('harness: the network is down')
      return { ok: r.status >= 200 && r.status < 300, status: r.status, headers: new Map(), json: async () => r.body, text: async () => JSON.stringify(r.body), arrayBuffer: async () => new ArrayBuffer(0) }
    }
    let n = 0
    crypto.randomBytes = (size, cb) => { const b = Buffer.alloc(size); for (let i = 0; i < size; i++) b[i] = (n++ * 37 + 11) & 0xff; if (cb) { cb(null, b); return undefined } return b }
    crypto.randomUUID = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
    const envBefore = {}
    for (const k of Object.keys(o.env || {})) envBefore[k] = process.env[k]
    setEnv(o.env || {})
    M.clearCountrySettingsCache?.()
    try {
      const qi = [console.info, console.debug]
      console.info = () => {}; console.debug = () => {}
      let res
      try { res = await kit.quietAsync(fn) } finally { [console.info, console.debug] = qi }
      const ct = String(res.headers.get('content-type') || '')
      let body
      if (/^(image|font)\//.test(ct)) { const b = Buffer.from(await res.arrayBuffer()); body = `<${ct} ${b.length} bytes sha ${sha(b)}${b.equals(FAKE_PNG) ? ' (the harness PNG)' : ''}>` }
      else body = await res.text()
      if (o.shrink) body = o.shrink(body)
      const v = { status: res.status, body, writes: base.writes, calls: globalThis.__calls, fetches, storage, renders: globalThis.__renders }
      if (/^(image|font)\//.test(ct)) {
        const h = {}
        for (const [k, x] of res.headers) if (!/^x-render-ms$/i.test(k)) h[k.toLowerCase()] = /warnings/i.test(k) ? decodeURIComponent(x) : x
        v.headers = Object.fromEntries(Object.entries(h).sort(([a], [b]) => (a < b ? -1 : 1)))
      }
      out[key] = v
    } catch (e) { out[key] = 'ERROR ' + String(e && e.message || e).slice(0, 300) }
    finally {
      globalThis.fetch = realFetch; crypto.randomBytes = realRandomBytes; crypto.randomUUID = realRandomUUID
      setEnv(envBefore)
      M.setWaLive(true)
      for (const k of ['__harnessDb', '__harnessUser', '__calls', '__renders', '__rl', '__encKey', '__emailThrows']) delete globalThis[k]
    }
  }
  const req = (url, { method = 'GET', body } = {}) => new NextRequest(`http://127.0.0.1${url}`, {
    method, headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  })

  const WEEK_LAYOUT = M.defaultLayout(1080, 1350)
  const EVENT_LAYOUT = M.defaultEventLayout(1080, 1350)

  for (const C of [ctx.GB, ctx.US]) {
    const cc = C.cc
    const US = cc === 'US'
    const zone = US ? 'America/Chicago' : 'Europe/London'
    const DOM = US ? 'pizzakitchen.com' : 'pizzakitchen.co.uk'
    // A STORED weekly layout: its heading and days-off text are what the truck saved — the US one in US words (stored
    // beats default on every code, so the fixture is the same on 826471a and this tree).
    const WL = US ? { ...WEEK_LAYOUT, heading: { ...WEEK_LAYOUT.heading, text: 'Week of {start}' }, daysOffText: 'Closed today' } : WEEK_LAYOUT
    const place = (id, name, x = {}) => ({
      id, truck_id: 'test-truck', name, name_key: name.toLowerCase().replace(/^the /, '').replace(/[^a-z0-9]/g, ''), short_name: null, area: US ? 'Springfield' : 'Harnessville',
      venue_id: null, merged_into_id: null, is_hidden: false, is_favourite: false, event_bg_path: null, event_bg_width: null, event_bg_height: null,
      event_layout: null, event_picture_id: null, weekly_picture_id: null, event_photo_picture_id: null, weekly_only_picture_id: null, picture_use: null,
      social_tag: null, usual_event_type_id: null, usual_type_is_standard: false, created_at: '2026-01-01T00:00:00Z', ...x,
    })
    const ev = (id, date, venue, placeId, x = {}) => ({
      id, truck_id: 'test-truck', event_date: date, start_time: '17:00', end_time: '20:00', status: 'confirmed', venue_name: venue, venue_id: null,
      truck_place_id: placeId, town: US ? 'Springfield' : 'Harnessville', is_private: false, private_name: null, van_id: 'v1', ...x,
    })
    const taxCols = US ? { food_minor: 1900, tax_minor: 157, tax_rate_milli: 8250, tax_label: 'Sales tax', tip_minor: 200, tip_pct_bps: 1000, service_fee_minor: 0, card_surcharge_minor: 0 }
      : { food_minor: null, tax_minor: null, tax_rate_milli: null, tax_label: null, tip_minor: null, tip_pct_bps: null, service_fee_minor: null, card_surcharge_minor: null }
    const order = (key, id, x) => ({ order_key: key, id, truck_id: 'test-truck', customer_name: 'Ann', customer_email: 'ann@example.test', status: 'collected', slot: '17:30', total: 19,
      discount_amt: 0, created_at: '2026-10-02T16:30:00Z', items: [{ name: 'Margherita', quantity: 2, unit_price: 9.5 }], deals: [], event_date: '2026-10-02', event_id: 'ev-past2', ...taxCols, ...x })
    const T = (over = {}) => {
      const csRow = r => (r.country_code === cc && over.cs ? { ...r, ...over.cs } : r)
      return {
        country_settings: [snake(SEEDS.gbFromSeed()), snake(ctx.US.settings)].map(csRow),
        trucks: [{ id: over.truckId || 'test-truck', name: 'Pizza Kitchen', slug: 'test-kitchen', dashboard_token: 'tok', operator_id: 'op-1', country: cc, timezone: zone,
          plan: 'max', feature_overrides: {}, trial_expires_at: null, setup_step: null, takes_cash: true, currency: US ? 'USD' : 'GBP', active: true,
          contact_email: 'kitchen@example.test', website: 'https://pizzakitchen.example', logo_storage_path: null, embed_enabled: false, truck_emoji: '🍕',
          custom_domain: null, custom_domain_setup_state: null, custom_domain_setup_started_at: null, custom_domain_verified_at: null,
          custom_domain_last_checked_at: null, custom_domain_last_ok_at: null, custom_domain_last_seen_value: null, custom_domain_confirmed_at: null,
          whatsapp_monthly_reply_limit: 250, tax_rate_milli: US ? 8250 : null, tipping_enabled: US, service_fee_enabled: false, service_fee_bps: null, service_fee_fixed_minor: null,
          ...(over.truck || {}) }],
        operators: [{ id: 'op-1', auth_user_id: 'u-1', is_admin: false, email: 'owner@example.test' }, { id: 'op-2', auth_user_id: 'u-2', is_admin: false, email: 'other@example.test' },
          ...(over.operators || [])],
        truck_users: [
          { id: 'tu-staff', auth_user_id: 'u-staff', truck_id: 'test-truck', role: 'staff', email: 'sam@example.test', name: 'Sam Staff', accepted_at: '2026-02-01T00:00:00Z', created_at: '2026-02-01T00:00:00Z' },
          { id: 'tu-mgr', auth_user_id: 'u-mgr', truck_id: 'test-truck', role: 'manager', email: 'mo@example.test', name: 'Mo Manager', accepted_at: '2026-02-02T00:00:00Z', created_at: '2026-02-02T00:00:00Z' },
          { id: 'tu-mgr2', auth_user_id: 'u-mgr2', truck_id: 'test-truck', role: 'manager', email: 'max@example.test', name: 'Max Manager', accepted_at: null, created_at: '2026-02-03T00:00:00Z' },
          { id: 'tu-staff2', auth_user_id: 'u-staff2', truck_id: 'test-truck', role: 'staff', email: 'sue@example.test', name: 'Sue Staff', accepted_at: null, created_at: '2026-02-04T00:00:00Z' },
        ],
        truck_user_vans: [], password_reset_tokens: [], action_audit_log: [],
        truck_vans: over.vans || [{ id: 'v1', truck_id: 'test-truck', name: 'Van 1', active: true, created_at: '2026-01-01T00:00:00Z' }, { id: 'v2', truck_id: 'test-truck', name: 'Van 2', active: true, created_at: '2026-02-01T00:00:00Z' }],
        menu_categories: [{ id: 'c1', truck_id: 'test-truck', name: 'Pizzas', slug: 'pizzas', sort_order: 1, is_active: true }],
        menu_items_db: [{ id: 'i1', truck_id: 'test-truck', name: 'Margherita', price: 9.5, category_id: 'c1', is_active: true, is_available: true, stock_count: null, allergens: [], dietary_info: [], sort_order: 1 }],
        menu_subcategories: [], modifier_groups: [], modifier_options: [], item_modifier_groups: [], category_modifier_groups: [], bundles_db: [], discount_codes_db: [], upsell_rules: [],
        operator_email_changes: [], event_deals: [],
        truck_events: over.events || [
          ev('ev-past', '2026-09-30', 'The Crown', 'p1'),
          ev('ev-past2', '2026-10-02', 'Market Square', 'p2', { status: 'closed' }),
          ev('ev-unconf', '2026-10-08', 'Town Hall', null, { status: 'unconfirmed' }),
          ev('ev-today', '2026-10-09', 'Market Square', 'p2'),
          ev('ev-sat', '2026-10-10', 'The Crown', 'p1', { start_time: '11:00', end_time: '14:00' }),
          ev('ev-priv', '2026-10-12', 'Rose Farm', null, { is_private: true, private_name: 'Smith wedding' }),
          ev('ev-cancel', '2026-10-13', 'Market Square', 'p2', { status: 'cancelled' }),
          ev('ev-next', '2026-10-15', 'Wide Field', 'p4'),
          ev('ev-own', '2026-10-16', 'Own Spot', 'p5'),
        ],
        orders: over.orders || [
          order('k1', 1, {}),
          order('k2', 2, { customer_email: null, customer_name: 'Walk-up', discount_amt: 2, total: 17 }),
          order('k3', 3, { status: 'cancelled' }),
          order('k4', 1, { event_date: '2026-09-30', event_id: 'ev-past', created_at: '2026-09-30T17:10:00Z' }),
        ],
        whatsapp_logs: over.waLogs || [
          { id: 'wl1', truck_id: 'test-truck', classification: 'SPECIFIC_QUERY', possible_miss: false, response_sent: 'yes', created_at: '2026-10-02T12:00:00Z' },
          { id: 'wl2', truck_id: 'test-truck', classification: 'IGNORE', possible_miss: true, response_sent: null, created_at: '2026-10-02T13:00:00Z' },
        ],
        whatsapp_connections: over.wa || [],
        truck_places: over.places || [
          place('p1', 'The Crown', { is_favourite: true, social_tag: '@thecrown' }),
          place('p2', 'Market Square', { event_bg_path: 'test-truck/place-p2.png', event_bg_width: 1080, event_bg_height: 1350 }),
          place('p3', 'Old Crown', { merged_into_id: 'p1', is_hidden: true }),
          place('p4', 'Wide Field', { event_bg_path: 'test-truck/place-p4.png', event_bg_width: 1600, event_bg_height: 900 }),
          place('p5', 'Own Spot', { event_bg_path: 'test-truck/place-p5.png', event_bg_width: 1080, event_bg_height: 1350, event_layout: EVENT_LAYOUT }),
        ],
        place_pictures: over.pictures || [{ id: 'pic1', truck_id: 'test-truck', place_id: 'p1', path: 'test-truck/pic1.png', file_name: 'crown.png', bytes: 1000, width: 1080, height: 1350, is_main: true, label: 'Front', sort_order: 0, created_at: '2026-03-01T00:00:00Z' }],
        event_types: [{ id: 't1', truck_id: 'test-truck', name: 'Festival', sort_order: 0 }],
        truck_post_designs: over.designs || [
          ...(over.noWeekDesign ? [] : [{ id: 'd-week', truck_id: 'test-truck', kind: 'week', blank_path: 'test-truck/blank-week.png', example_path: null, width: 1080, height: 1350, layout: WL, updated_at: '2026-09-01T00:00:00Z', caption_template: over.weekTpl ?? null }]),
          ...(over.noEventDesign ? [] : [{ id: 'd-event', truck_id: 'test-truck', kind: 'event', blank_path: 'test-truck/blank-event.png', example_path: null, width: 1080, height: 1350, layout: EVENT_LAYOUT, updated_at: '2026-09-01T00:00:00Z', caption_template: null }]),
        ],
        event_post_backgrounds: [],
        truck_fonts: over.fonts || [{ id: 'f1', truck_id: 'test-truck', family: 'Bitter', display_name: 'Our Bitter', weight: 400, style: 'normal', storage_path: 'trucks/test-truck/bitter-400.ttf', created_at: '2026-04-01T00:00:00Z' }],
        font_library_cache: [],
      }
    }
    const tok = b => ({ token: 'tok', ...b })
    const MG = `${cc}|manage|`
    const mg = (k, body, o = {}) => call(MG + k, { tables: T(o), cc, ...o }, () => M.managePOST(req('/api/manage', { method: 'POST', body })))

    // ══ app/api/manage POST — the shared checks, for the in-scope actions ═════════════════════════════════════
    // One action per family (Payments, Reports, Team, custom domain, embed, WhatsApp, Places): each family's actions share
    // one answer to the shared checks, and a family moves into MANAGE_TAB_ACTIONS as a whole.
    for (const a of ['update_charges', 'get_report', 'invite_team_member', 'domain_status', 'save_embed_setup', 'disconnect_whatsapp', 'sg_merge_place'])
      await mg(`noToken.${a}`, { action: a })
    for (const a of ['update_charges', 'get_recent_events', 'domain_send_instructions', 'disconnect_whatsapp'])
      await mg(`badToken.${a}`, { token: 'nope', action: a })
    for (const a of ['update_charges', 'get_report', 'invite_team_member', 'sg_place_usual_type', 'domain_preflight'])
      await mg(`noUser.${a}`, tok({ action: a }), { user: null })
    for (const a of ['get_recent_events', 'get_team', 'domain_check'])
      await mg(`notThisTruck.${a}`, tok({ action: a }), { user: { id: 'u-2' } })
    for (const a of ['update_charges', 'invite_team_member', 'remove_team_member', 'sg_merge_place', 'save_embed_setup', 'domain_provision', 'domain_send_instructions'])
      await mg(`staff.${a}`, tok({ action: a, taxRate: '5', email: 'x@example.test', memberId: 'tu-staff2', id: 'p1', into_id: 'p2', to: 'web@example.test' }), { user: { id: 'u-staff' } })
    for (const a of ['domain_preflight', 'domain_turn_off'])
      await mg(`demo.${a}`, tok({ action: a, address: `events.${DOM}`, to: 'web@example.test' }), { truckId: 'demo-harness', user: null })

    // ── update_charges (Payments › Tax, tips and fees)
    const ch = (k, body, o = {}) => mg(`charges.${k}`, tok({ action: 'update_charges', ...body }), o)
    const FEE = { service_fee_allowed: true, service_fee_recipient: 'truck', service_fee_truck_max_bps: 500, service_fee_truck_max_fixed_minor: 100 }
    await ch('manager', { tippingEnabled: true }, { user: { id: 'u-mgr' } })
    await ch('admin', { tippingEnabled: true }, { user: { id: 'u-admin' }, operators: [{ id: 'op-admin', auth_user_id: 'u-admin', is_admin: true, email: 'admin@example.test' }] })
    await ch('rateNotHere', { taxRate: '8.25' }, { cs: { prices_include_tax: true } })
    await ch('rateDecimals', { taxRate: '8.8755' }, { cs: { prices_include_tax: false } })
    await ch('rateRange', { taxRate: '25' }, { cs: { prices_include_tax: false } })
    await ch('tipsNotBool', { tippingEnabled: 'yes' })
    await ch('feeNotHere', { serviceFeeEnabled: true }, { cs: { service_fee_allowed: false } })
    await ch('feeHatchgrab', { serviceFeeEnabled: true }, { cs: { ...FEE, service_fee_recipient: 'hatchgrab' } })
    await ch('feeNotBool', { serviceFeeEnabled: 'on' }, { cs: FEE })
    await ch('feePct', { serviceFeePct: 'abc' }, { cs: FEE })
    await ch('feePctPartNotAllowed', { serviceFeePct: '3' }, { cs: { ...FEE, service_fee_truck_max_bps: null } })
    await ch('feeOverPct', { serviceFeePct: '6.5' }, { cs: FEE })
    await ch('feeFixed', { serviceFeeFixed: 'lots' }, { cs: FEE })
    await ch('feeFixedPartNotAllowed', { serviceFeeFixed: '0.50' }, { cs: { ...FEE, service_fee_truck_max_fixed_minor: null } })
    await ch('feeOverFixed', { serviceFeeFixed: '2' }, { cs: FEE })
    await ch('nothingToSave', {})
    await ch('dbFail', { tippingEnabled: true }, { fail: { trucks: ['update'] } })
    await ch('ok.tips', { tippingEnabled: !US })
    await ch('ok.rateAndFee', { taxRate: '8.875', serviceFeeEnabled: true, serviceFeePct: '3', serviceFeeFixed: '0.50' }, { cs: { ...FEE, prices_include_tax: false } })

    // ── the embed (kept with no UI)
    await mg('embed.notOnPlan', tok({ action: 'save_embed_setup', enabled: true }), { truck: { plan: 'starter' } })
    await mg('embed.badWebsite', tok({ action: 'save_embed_setup', enabled: true, website: 'not a web address' }))
    await mg('embed.dbFail', tok({ action: 'save_embed_setup', enabled: true }), { fail: { trucks: ['update'] } })
    await mg('embed.ok', tok({ action: 'save_embed_setup', enabled: true, website: 'pizzakitchen.example/menu' }))
    await mg('embedStatus.ok', tok({ action: 'get_embed_status' }), { truck: { embed_enabled: true } })
    await mg('embedStatus.starter', tok({ action: 'get_embed_status' }), { truck: { plan: 'starter' } })

    // ── the custom domain
    const HOST = `events.${DOM}`
    const LIVE = { custom_domain: HOST, custom_domain_setup_state: 'awaiting_dns', custom_domain_setup_started_at: '2026-10-01T09:00:00Z' }
    const NS_CF = { NS: [{ name: DOM, type: 2, TTL: 300, data: 'ada.ns.cloudflare.com.' }, { name: DOM, type: 2, TTL: 300, data: 'bob.ns.cloudflare.com.' }] }
    await mg('preflight.rateLimited', tok({ action: 'domain_preflight', address: HOST }), { rl: { vf_rl_domain_preflight: 'refuse' } })
    await mg('preflight.limiterDown', tok({ action: 'domain_preflight', address: HOST }), { rl: { vf_rl_domain_preflight: 'throw' }, dns: NS_CF })
    await mg('preflight.apex', tok({ action: 'domain_preflight', address: DOM }))
    await mg('preflight.empty', tok({ action: 'domain_preflight', address: '' }))
    await mg('preflight.notAddress', tok({ action: 'domain_preflight', address: 'not an address' }))
    await mg('preflight.ok', tok({ action: 'domain_preflight', address: HOST }), { dns: { ...NS_CF, CAA: [{ name: DOM, type: 257, TTL: 300, data: '0 issue "sectigo.com"' }] } })
    await mg('domainStatus.none', tok({ action: 'domain_status' }))
    await mg('domainStatus.set', tok({ action: 'domain_status' }), { truck: LIVE })
    await mg('domainCheck.noDomain', tok({ action: 'domain_check' }))
    await mg('domainCheck.goesLive', tok({ action: 'domain_check' }), { truck: LIVE, dns: { CNAME: [{ name: HOST, type: 5, TTL: 300, data: 'cname.vercel-dns-harness.com.' }] } })
    await mg('domainCheck.notYet', tok({ action: 'domain_check' }), { truck: { ...LIVE, custom_domain_setup_started_at: '2026-09-01T09:00:00Z' } })
    await mg('provision.notOnPlan', tok({ action: 'domain_provision', address: HOST }), { truck: { plan: 'starter' } })
    await mg('provision.apex', tok({ action: 'domain_provision', address: DOM }))
    await mg('provision.wwwInner', tok({ action: 'domain_provision', address: `events.www.${DOM}` }))
    await mg('provision.www', tok({ action: 'domain_provision', address: `www.${DOM}` }))
    await mg('provision.apexBySoa', tok({ action: 'domain_provision', address: HOST }), { dns: { SOA: n => [{ name: n + '.', type: 6, TTL: 300, data: 'ns1.example. hostmaster.example. 1 2 3 4 5' }] } })
    await mg('provision.taken', tok({ action: 'domain_provision', address: HOST }), { resp: { '/v10/projects/': { status: 409, body: { error: { message: 'VERCEL internal: already assigned' } } } } })
    await mg('provision.refused', tok({ action: 'domain_provision', address: HOST }), { resp: { '/v10/projects/': { status: 403, body: { error: { message: 'forbidden' } } } } })
    await mg('provision.error', tok({ action: 'domain_provision', address: HOST }), { resp: { '/v10/projects/': { status: 500, body: {} } } })
    await mg('provision.notConfigured', tok({ action: 'domain_provision', address: HOST }), { env: { VERCEL_PROJECT_ID: undefined } })
    await mg('provision.dbFail', tok({ action: 'domain_provision', address: HOST }), { fail: { trucks: ['update'] } })
    await mg('provision.ok', tok({ action: 'domain_provision', address: HOST }))
    await mg('confirm.nothingYet', tok({ action: 'domain_confirm' }), { truck: LIVE })
    await mg('confirm.dbFail', tok({ action: 'domain_confirm' }), { truck: { ...LIVE, custom_domain_verified_at: '2026-10-02T07:00:00Z' }, fail: { trucks: ['update'] } })
    await mg('confirm.ok', tok({ action: 'domain_confirm' }), { truck: { ...LIVE, custom_domain_verified_at: '2026-10-02T07:00:00Z' } })
    await mg('turnOff.alreadyOff', tok({ action: 'domain_turn_off' }))
    await mg('turnOff.releaseFails', tok({ action: 'domain_turn_off' }), { truck: LIVE, resp: { 'api.vercel.com/v9/projects/': { method: 'DELETE', status: 500, body: {} } } })
    await mg('turnOff.clearFails', tok({ action: 'domain_turn_off' }), { truck: LIVE, fail: { trucks: ['update'] } })
    await mg('turnOff.ok', tok({ action: 'domain_turn_off' }), { truck: LIVE })
    const si = (k, body, o = {}) => mg(`instructions.${k}`, tok({ action: 'domain_send_instructions', to: 'web@example.test', ...body }), { truck: LIVE, dns: NS_CF, ...o })
    await si('badEmail', { to: 'not-an-email' })
    await si('noAddress', {}, { truck: {} })
    await si('limiterDown', {}, { rl: { vf_rl_domain_instructions: 'throw' } })
    await si('limited', {}, { rl: { vf_rl_domain_instructions: 'refuse' } })
    await si('noRecord', {}, { resp: { '/v6/domains/': { status: 500, body: { error: { message: 'down' } } } } })
    await si('sendFails', {}, { emailThrows: true })
    await si('ok', {})

    // ── WhatsApp: disconnect, and the reply limit inside update_truck
    const WA_ROW = { truck_id: 'test-truck', waba_id: 'waba-1', phone_number_id: 'pn-1', access_token_ciphertext: 'cipher(meta-token)', token_expires_at: '2026-12-01T00:00:00Z', token_issued_at: '2026-10-01T00:00:00Z', token_revoked_at: null }
    await mg('disconnect.notAvailable', tok({ action: 'disconnect_whatsapp' }), { waLive: false })
    await mg('disconnect.already', tok({ action: 'disconnect_whatsapp' }))
    await mg('disconnect.rowDeleteFails', tok({ action: 'disconnect_whatsapp' }), { wa: [WA_ROW], fail: { whatsapp_connections: ['delete'] } })
    await mg('disconnect.metaRefused', tok({ action: 'disconnect_whatsapp' }), { wa: [WA_ROW], resp: { '/subscribed_apps': { method: 'DELETE', status: 400, body: { error: { code: 100 } } } } })
    await mg('disconnect.expiredToken', tok({ action: 'disconnect_whatsapp' }), { wa: [{ ...WA_ROW, token_expires_at: '2026-10-01T00:00:00Z' }] })
    await mg('disconnect.ok', tok({ action: 'disconnect_whatsapp' }), { wa: [WA_ROW] })
    await mg('replyLimit', tok({ action: 'update_truck', data: { whatsapp_monthly_reply_limit: 7 } }))
    await mg('replyLimit.ok', tok({ action: 'update_truck', data: { whatsapp_monthly_reply_limit: 1000 } }))

    // ── Team
    await mg('team.get', tok({ action: 'get_team' }))
    await mg('team.getDbFail', tok({ action: 'get_team' }), { fail: { truck_users: ['select'] } })
    await mg('inviteMember.noEmail', tok({ action: 'invite_member', email: ' ', role: 'staff' }))
    await mg('inviteMember.dbFail', tok({ action: 'invite_member', email: 'new@example.test', role: 'staff' }), { fail: { truck_users: ['insert'] } })
    await mg('inviteMember.ok', tok({ action: 'invite_member', email: 'New@Example.test ', name: ' Nia New ', role: 'staff', van_ids: ['v1'] }))
    await mg('updateMember.staffOther', tok({ action: 'update_member', memberId: 'tu-mgr', name: 'X', role: 'staff' }), { user: { id: 'u-staff' } })
    await mg('updateMember.staffSelf', tok({ action: 'update_member', memberId: 'tu-staff', name: 'Sam S', role: 'staff', van_ids: ['v2'] }), { user: { id: 'u-staff' } })
    await mg('updateMember.managerOnManager', tok({ action: 'update_member', memberId: 'tu-mgr2', name: 'X', role: 'manager' }), { user: { id: 'u-mgr' } })
    await mg('updateMember.managerOnStaff', tok({ action: 'update_member', memberId: 'tu-staff2', name: 'Sue S', role: 'staff' }), { user: { id: 'u-mgr' } })
    await mg('updateMember.dbFail', tok({ action: 'update_member', memberId: 'tu-staff2', name: 'Sue', role: 'staff' }), { fail: { truck_users: ['update'] } })
    await mg('removeMember.dbFail', tok({ action: 'remove_member', memberId: 'tu-staff2' }), { fail: { truck_users: ['delete'] } })
    await mg('removeMember.ok', tok({ action: 'remove_member', memberId: 'tu-staff2' }))
    const inv = (k, body, o = {}) => mg(`invite.${k}`, tok({ action: 'invite_team_member', email: 'nia@example.test', name: 'Nia New', role: 'staff', vanIds: ['v1'], ...body }), o)
    await inv('managerInvitesManager', { role: 'manager' }, { user: { id: 'u-mgr' } })
    await inv('managerInvitesOwner', { role: 'owner' }, { user: { id: 'u-mgr' } })
    await inv('noEmail', { email: '' })
    await inv('noVans', { vanIds: [] })
    await inv('alreadyMember', { email: 'SAM@example.test' })
    await inv('createFails', {}, { fail: { truck_users: ['insert'] } })
    await inv('ok', {})
    await inv('ok.managerByOwner', { role: 'manager', name: '' })
    await inv('ok.existingAccount', { email: 'other@example.test', role: 'manager' }, { authCreateFails: true })
    await inv('ok.mailRefused', {}, { resp: { 'api.brevo.com': { status: 401, body: { message: 'unauthorised' } } } })
    await mg('removeTeam.managerOnManager', tok({ action: 'remove_team_member', memberId: 'tu-mgr2' }), { user: { id: 'u-mgr' } })
    await mg('removeTeam.managerOnStaff', tok({ action: 'remove_team_member', memberId: 'tu-staff2' }), { user: { id: 'u-mgr' } })
    await mg('removeTeam.ok', tok({ action: 'remove_team_member', memberId: 'tu-mgr2' }))

    // ── Reports
    await mg('report.empty', tok({ action: 'get_report', dateFrom: '2026-08-01', dateTo: '2026-08-07' }), { waLogs: [] })
    await mg('report.whatsappOnly', tok({ action: 'get_report', dateFrom: '2026-10-02', dateTo: '2026-10-02' }), { orders: [] })
    await mg('report.range', tok({ action: 'get_report', dateFrom: '2026-09-28', dateTo: '2026-10-04' }))
    await mg('report.oneDay', tok({ action: 'get_report', dateFrom: '2026-10-02' }))
    await mg('report.event', tok({ action: 'get_report', eventId: 'ev-past' }))
    await mg('report.today', tok({ action: 'get_report' }))
    await mg('recentEvents.ok', tok({ action: 'get_recent_events' }))

    // ── Places (Social media's usual type, and the merge)
    await mg('usualType.notOnPlan', tok({ action: 'sg_place_usual_type', placeId: 'p1', typeId: 'standard' }), { truck: { plan: 'starter' } })
    await mg('usualType.noPlace', tok({ action: 'sg_place_usual_type', typeId: 'standard' }))
    await mg('usualType.migration', tok({ action: 'sg_place_usual_type', placeId: 'p1', typeId: 'standard' }), { fail: { truck_places: ['update'] }, failCode: '42703' })
    await mg('usualType.dbFail', tok({ action: 'sg_place_usual_type', placeId: 'p1', typeId: 'standard' }), { fail: { truck_places: ['update'] } })
    await mg('usualType.ok.standard', tok({ action: 'sg_place_usual_type', placeId: 'p1', typeId: 'standard' }))
    await mg('usualType.ok.type', tok({ action: 'sg_place_usual_type', placeId: 'p1', typeId: 't1' }))
    await mg('merge.readFails', tok({ action: 'sg_merge_place', id: 'p2', into_id: 'p1' }), { fail: { truck_places: ['select'] } })
    await mg('merge.noIds', tok({ action: 'sg_merge_place', id: 'p2' }))
    await mg('merge.fromGone', tok({ action: 'sg_merge_place', id: 'p-x', into_id: 'p1' }))
    await mg('merge.intoGone', tok({ action: 'sg_merge_place', id: 'p2', into_id: 'p-x' }))
    await mg('merge.self', tok({ action: 'sg_merge_place', id: 'p2', into_id: 'p2' }))
    await mg('merge.otherWay', tok({ action: 'sg_merge_place', id: 'p1', into_id: 'p3' }))
    await mg('merge.writeFails', tok({ action: 'sg_merge_place', id: 'p2', into_id: 'p1' }), { fail: { truck_places: ['update'] } })
    await mg('merge.ok', tok({ action: 'sg_merge_place', id: 'p2', into_id: 'p3' }))

    // ══ app/api/manage GET ════════════════════════════════════════════════════════════════════════════════════
    const gt = (k, url, o = {}) => call(`${cc}|manageGET|${k}`, { tables: T(o), cc, ...o }, () => M.manageGET(req(url)))
    await gt('noToken', '/api/manage')
    await gt('badToken', '/api/manage?token=nope')
    await gt('noUser', '/api/manage?token=tok', { user: null })
    await gt('notThisTruck', '/api/manage?token=tok', { user: { id: 'u-2' } })
    await gt('ok', '/api/manage?token=tok')
    await gt('ok.staff', '/api/manage?token=tok', { user: { id: 'u-staff' }, wa: [{ truck_id: 'test-truck', waba_id: 'waba-1', phone_number_id: 'pn-1', access_token_ciphertext: 'cipher(x)', token_expires_at: '2026-10-20T00:00:00Z', token_issued_at: '2026-08-21T00:00:00Z', token_revoked_at: null }] })

    // ══ app/api/weekly-post POST ══════════════════════════════════════════════════════════════════════════════
    const WP = `${cc}|weeklyPost|`
    const wp = (k, body, o = {}) => call(WP + k, { tables: T(o), cc, ...o }, () => M.wpPOST(req('/api/weekly-post', { method: 'POST', body })))
    await wp('badJson', '{nope')
    await wp('noToken', { action: 'load' })
    await wp('badToken', { token: 'nope', action: 'load' })
    for (const a of ['load', 'font_confirm']) await wp(`plan.${a}`, tok({ action: a }), { truck: { plan: 'starter' } })
    await wp('unknownAction', tok({ action: 'explode' }))
    // load / social_overview
    await wp('load.this', tok({ action: 'load', week: 'this' }))
    await wp('load.next.private', tok({ action: 'load', week: 'next', showPrivate: true, excluded: ['ev-next'] }))
    await wp('load.noDesign', tok({ action: 'load' }), { noWeekDesign: true })
    await wp('overview.ok', tok({ action: 'social_overview' }))
    await wp('overview.migration', tok({ action: 'social_overview' }), { fail: { truck_places: ['select'] }, failCode: '42703' })
    await wp('overview.storedCaption', tok({ action: 'social_overview' }), { weekTpl: 'Where we are this week:\n{events}' })
    // uploads
    await wp('uploadUrl.ok', tok({ action: 'upload_url', which: 'blank', ext: 'jpeg' }))
    await wp('uploadUrl.fails', tok({ action: 'upload_url', which: 'place' }), { uploadFails: true })
    const cu = (k, body, o = {}) => wp(`confirm.${k}`, tok({ action: 'confirm_upload', which: 'blank', ...body }), o)
    await cu('unknownFile', { path: 'other-truck/up-ok.png' })
    await cu('notArrived', { path: 'test-truck/up-missing.png' })
    await cu('empty', { path: 'test-truck/up-empty.png' })
    await cu('tooBig', { path: 'test-truck/up-big.png' })
    await cu('notImage', { path: 'test-truck/up-notimg.png' })
    await cu('tooSmall', { path: 'test-truck/up-small.png' })
    await cu('place.noEventDesign', { path: 'test-truck/up-ok.png', which: 'place', placeId: 'p1' }, { noEventDesign: true })
    await cu('place.notFound', { path: 'test-truck/up-ok.png', which: 'place', placeId: 'p-x' })
    await cu('place.wrongShape', { path: 'test-truck/up-wide.png', which: 'place', placeId: 'p1' })
    await cu('place.ok', { path: 'test-truck/up-ok.png', which: 'place', placeId: 'p2' })
    await cu('place.ownPositions', { path: 'test-truck/up-wide.png', which: 'place', placeId: 'p5' })
    await cu('oneOff.noEvent', { path: 'test-truck/up-ok.png', which: 'one-off', eventId: 'ev-x' })
    await cu('oneOff.wrongShape', { path: 'test-truck/up-wide.png', which: 'one-off', eventId: 'ev-sat' })
    await cu('oneOff.ok', { path: 'test-truck/up-ok.png', which: 'one-off', eventId: 'ev-sat', alsoSaveForPlace: true, fileName: 'crown-poster.png' })
    await cu('eventDefault.ok', { path: 'test-truck/up-wide.png', which: 'event-default' })
    await cu('example.noDesign', { path: 'test-truck/up-ok.png', which: 'example' }, { noWeekDesign: true })
    await cu('example.ok', { path: 'test-truck/up-ok.png', which: 'example' })
    await cu('blank.ok', { path: 'test-truck/up-ok.png' })
    await cu('blank.newShape', { path: 'test-truck/up-wide.png' }, { noWeekDesign: true })
    // the weekly design
    await wp('saveDesign.noDesign', tok({ action: 'save_design', layout: WL }), { noWeekDesign: true })
    await wp('saveDesign.invalid', tok({ action: 'save_design', layout: { nope: true } }))
    await wp('saveDesign.ok', tok({ action: 'save_design', layout: WL }))
    await wp('captions.this', tok({ action: 'captions', week: 'this' }))
    await wp('captions.next.note', tok({ action: 'captions', week: 'next', note: 'Card and cash taken.', showPrivate: true }))
    await wp('captions.stored', tok({ action: 'captions', week: 'this' }), { weekTpl: 'This week at {truck}:\n{events}\nOrder: {link}' })
    await wp('render.noDesign', tok({ action: 'render' }), { noWeekDesign: true })
    await wp('render.invalid', tok({ action: 'render', layout: { nope: true } }))
    await wp('render.blankMissing', tok({ action: 'render' }), { files: { 'test-truck/blank-week.png': undefined } })
    await wp('render.this', tok({ action: 'render', week: 'this' }))
    await wp('render.busy', tok({ action: 'render', week: 'next', busy: true, note: 'Back soon' }))
    // the single event design
    await wp('eventLoad.ok', tok({ action: 'event_load' }))
    await wp('eventLoad.noDesign', tok({ action: 'event_load' }), { noEventDesign: true })
    await wp('placeMode.noDesign', tok({ action: 'event_place_mode', placeId: 'p2', mode: 'own' }), { noEventDesign: true })
    await wp('placeMode.notFound', tok({ action: 'event_place_mode', placeId: 'p-x', mode: 'own' }))
    await wp('placeMode.backToStandardRefused', tok({ action: 'event_place_mode', placeId: 'p4', mode: 'standard' }))
    await wp('placeMode.standard', tok({ action: 'event_place_mode', placeId: 'p5', mode: 'standard' }))
    await wp('placeMode.own', tok({ action: 'event_place_mode', placeId: 'p2', mode: 'own' }))
    await wp('placeLayout.noDesign', tok({ action: 'event_place_save_layout', placeId: 'p5', layout: EVENT_LAYOUT }), { noEventDesign: true })
    await wp('placeLayout.notFound', tok({ action: 'event_place_save_layout', placeId: 'p-x', layout: EVENT_LAYOUT }))
    await wp('placeLayout.standardPositions', tok({ action: 'event_place_save_layout', placeId: 'p2', layout: EVENT_LAYOUT }))
    await wp('placeLayout.invalid', tok({ action: 'event_place_save_layout', placeId: 'p5', layout: { nope: 1 } }))
    await wp('placeLayout.ok', tok({ action: 'event_place_save_layout', placeId: 'p5', layout: EVENT_LAYOUT }))
    await wp('eventDesign.noDesign', tok({ action: 'event_save_design', layout: EVENT_LAYOUT }), { noEventDesign: true })
    await wp('eventDesign.invalid', tok({ action: 'event_save_design', layout: { nope: 1 } }))
    await wp('eventDesign.ok', tok({ action: 'event_save_design', layout: EVENT_LAYOUT }))
    await wp('removePlaceDesign.notFound', tok({ action: 'event_remove_place_design', placeId: 'p-x' }))
    await wp('removePlaceDesign.ok', tok({ action: 'event_remove_place_bg', placeId: 'p2' }))
    // one event's post
    await wp('eventPost.private', tok({ action: 'event_post', eventId: 'ev-priv' }))
    await wp('eventPost.noDesign', tok({ action: 'event_post', eventId: 'ev-sat' }), { noEventDesign: true })
    await wp('eventPost.notFound', tok({ action: 'event_post', eventId: 'ev-x' }))
    await wp('eventPost.ok', tok({ action: 'event_post', eventId: 'ev-sat' }))
    await wp('eventPost.placePoster', tok({ action: 'event_post', eventId: 'ev-today' }))
    await wp('eventPost.cancelled', tok({ action: 'event_post', eventId: 'ev-cancel' }))
    await wp('previewEntry.noId', tok({ action: 'event_preview_entry' }))
    await wp('previewEntry.private', tok({ action: 'event_preview_entry', eventId: 'ev-priv' }))
    await wp('previewEntry.noDesign', tok({ action: 'event_preview_entry', eventId: 'ev-sat' }), { noEventDesign: true })
    await wp('previewEntry.placeNotFound', tok({ action: 'event_preview_entry', eventId: 'ev-sat', designPlaceId: 'p-x' }))
    await wp('previewEntry.ok', tok({ action: 'event_preview_entry', eventId: 'ev-sat', designPlaceId: 'p2' }))
    await wp('eventRender.private', tok({ action: 'event_render', eventId: 'ev-priv' }))
    await wp('eventRender.noDesign', tok({ action: 'event_render', eventId: 'ev-sat' }), { noEventDesign: true })
    await wp('eventRender.placeNotFound', tok({ action: 'event_render', eventId: 'ev-sat', designPlaceId: 'p-x' }))
    await wp('eventRender.invalid', tok({ action: 'event_render', eventId: 'ev-sat', layout: { nope: 1 } }))
    await wp('eventRender.ok', tok({ action: 'event_render', eventId: 'ev-sat', note: 'Bring a blanket' }))
    await wp('eventRender.pictureMissing', tok({ action: 'event_render', eventId: 'ev-sat' }), { files: { 'test-truck/blank-event.png': undefined } })
    await wp('eventRender.wrongShapePoster', tok({ action: 'event_render', eventId: 'ev-next' }))
    // fonts
    await wp('fontCatalogue.ok', tok({ action: 'font_catalogue' }), {
      shrink: b => { try { const j = JSON.parse(b); for (const k of Object.keys(j)) if (Array.isArray(j[k]) && j[k].length > 40) j[k] = { count: j[k].length, sha: sha(JSON.stringify(j[k])) }; return JSON.stringify(j) } catch { return b } },
    })
    await wp('fontChoose.unknown', tok({ action: 'font_choose', fontId: 'Not A Font!' }))
    await wp('fontChoose.notLibrary', tok({ action: 'font_choose', fontId: 'g:zzznotinthelibrary' }))
    await wp('fontChoose.bundled', tok({ action: 'font_choose', fontId: 'oswald' }))
    await wp('fontChoose.ownNone', tok({ action: 'font_choose', fontId: 'u:nosuchfamily' }))
    await wp('fontChoose.libraryUnreachable', tok({ action: 'font_choose', fontId: 'g:opensans' }))
    await wp('fontUploadUrl.ok', tok({ action: 'font_upload_url', ext: 'otf' }))
    const fc = (k, body, o = {}) => wp(`fontConfirm.${k}`, tok({ action: 'font_confirm', licenceConfirmed: true, path: 'trucks/test-truck/incoming-ok.ttf', ...body }), o)
    await fc('unknownFile', { path: 'trucks/other/incoming-ok.ttf' })
    await fc('noLicence', { licenceConfirmed: false })
    await fc('notArrived', { path: 'trucks/test-truck/incoming-missing.ttf' })
    await fc('tooBig', { path: 'trucks/test-truck/incoming-big.ttf' })
    await fc('woff', { path: 'trucks/test-truck/incoming-woff.ttf' })
    await fc('notAFont', { path: 'trucks/test-truck/incoming-junk.ttf' })
    await fc('storeFails', {}, { storeFails: true })
    await fc('migration', {}, { fail: { truck_fonts: ['upsert'] }, failCode: '42P01' })
    await fc('ok', { displayName: 'Our Bitter' })
    await wp('fontSample.notYours', tok({ action: 'font_sample', family: 'Nope' }))
    await wp('fontSample.ok', tok({ action: 'font_sample', family: 'Bitter', text: 'Saturday 10th October' }))
    await wp('fontRename.noName', tok({ action: 'font_rename', family: 'Bitter', displayName: ' ' }))
    await wp('fontRename.notYours', tok({ action: 'font_rename', family: 'Nope', displayName: 'X' }))
    await wp('fontRename.ok', tok({ action: 'font_rename', family: 'Bitter', displayName: 'House font' }))
    await wp('fontUsage.ok', tok({ action: 'font_usage', family: 'Bitter' }))
    await wp('fontRemove.notYours', tok({ action: 'font_remove', family: 'Nope' }))
    await wp('fontRemove.ok', tok({ action: 'font_remove', family: 'Bitter' }))
    // a place's pictures and its slots
    await wp('pictureList.notFound', tok({ action: 'place_picture_list', placeId: 'p-x' }))
    await wp('pictureList.ok', tok({ action: 'place_picture_list', placeId: 'p1' }))
    await wp('pictureList.legacy', tok({ action: 'place_picture_list', placeId: 'p2' }))
    const pc = (k, body, o = {}) => wp(`pictureConfirm.${k}`, tok({ action: 'place_picture_confirm', placeId: 'p1', path: 'test-truck/up-ok.png', fileName: 'night.png', ...body }), o)
    await pc('unknownFile', { path: 'other/up-ok.png' })
    await pc('notFound', { placeId: 'p-x' })
    await pc('notArrived', { path: 'test-truck/up-missing.png' })
    await pc('tooSmall', { path: 'test-truck/up-small.png' })
    await pc('migration', {}, { fail: { place_pictures: ['insert'] }, failCode: '42P01' })
    await pc('badSlot', { slot: 'weekly-only' })
    await pc('slotMigration', { slot: 'event' }, { fail: { truck_places: ['update'] }, failCode: '42703' })
    await pc('ok', { label: 'At night' })
    await pc('ok.slot', { slot: 'weekly', placeId: 'p2' })
    await wp('pictureMain.notFound', tok({ action: 'place_picture_main', placeId: 'p-x', pictureId: 'pic1' }))
    await wp('pictureMain.ok', tok({ action: 'place_picture_main', placeId: 'p1', pictureId: 'pic1' }))
    await wp('pictureRename.noName', tok({ action: 'place_picture_rename', placeId: 'p1', pictureId: 'pic1', label: '' }))
    await wp('pictureRename.notFound', tok({ action: 'place_picture_rename', placeId: 'p-x', pictureId: 'pic1', label: 'X' }))
    await wp('pictureRename.ok', tok({ action: 'place_picture_rename', placeId: 'p1', pictureId: 'pic1', label: 'Front door' }))
    await wp('pictureRemove.notFound', tok({ action: 'place_picture_remove', placeId: 'p-x', pictureId: 'pic1' }))
    await wp('pictureRemove.notOne', tok({ action: 'place_picture_remove', placeId: 'p1', pictureId: 'pic-x' }))
    await wp('pictureRemove.ok', tok({ action: 'place_picture_remove', placeId: 'p1', pictureId: 'pic1' }))
    await wp('slotUse.badSlot', tok({ action: 'place_slot_use', placeId: 'p1', slot: 'nope', pictureId: 'pic1' }))
    await wp('slotUse.notFound', tok({ action: 'place_slot_use', placeId: 'p-x', slot: 'event', pictureId: 'pic1' }))
    await wp('slotUse.notOwned', tok({ action: 'place_slot_use', placeId: 'p1', slot: 'event', pictureId: 'pic-x' }))
    await wp('slotUse.migration', tok({ action: 'place_slot_use', placeId: 'p1', slot: 'event', pictureId: 'pic1' }), { fail: { truck_places: ['update'] }, failCode: '42703' })
    await wp('slotUse.dbFail', tok({ action: 'place_slot_use', placeId: 'p1', slot: 'event', pictureId: 'pic1' }), { fail: { truck_places: ['update'] } })
    await wp('slotUse.ok', tok({ action: 'place_slot_use', placeId: 'p1', slot: 'event-photo', pictureId: 'pic1' }))
    await wp('slotClear.badSlot', tok({ action: 'place_slot_clear', placeId: 'p1' }))
    await wp('slotClear.notFound', tok({ action: 'place_slot_clear', placeId: 'p-x', slot: 'weekly' }))
    await wp('slotClear.ok', tok({ action: 'place_slot_clear', placeId: 'p2', slot: 'event' }))
    await wp('socialTag.spaces', tok({ action: 'place_social_tag', placeId: 'p1', tag: '@the crown' }))
    await wp('socialTag.twoAts', tok({ action: 'place_social_tag', placeId: 'p1', tag: '@the@crown' }))
    await wp('socialTag.justAt', tok({ action: 'place_social_tag', placeId: 'p1', tag: '@' }))
    await wp('socialTag.tooLong', tok({ action: 'place_social_tag', placeId: 'p1', tag: '@' + 'x'.repeat(120) }))
    await wp('socialTag.notFound', tok({ action: 'place_social_tag', placeId: 'p-x', tag: '@crown' }))
    await wp('socialTag.migration', tok({ action: 'place_social_tag', placeId: 'p1', tag: '@crown' }), { fail: { truck_places: ['update'] }, failCode: 'PGRST204' })
    await wp('socialTag.ok', tok({ action: 'place_social_tag', placeId: 'p1', tag: 'crownpub' }))
    await wp('captionSave.tooLong', tok({ action: 'caption_save', kind: 'week', template: 'x'.repeat(4001) }))
    await wp('captionSave.noDesign', tok({ action: 'caption_save', kind: 'event', template: 'Hi' }), { noEventDesign: true })
    await wp('captionSave.migration', tok({ action: 'caption_save', kind: 'week', template: 'Hi' }), { fail: { truck_post_designs: ['update'] }, failCode: '42703' })
    await wp('captionSave.ok', tok({ action: 'caption_save', kind: 'event', template: 'See you at {place} on {date}!' }))

    // ══ app/api/weekly-post GET (the font file) ═══════════════════════════════════════════════════════════════
    const wg = (k, q, o = {}) => call(`${cc}|weeklyPostGET|${k}`, { tables: T(o), cc, ...o }, () => M.wpGET(req(`/api/weekly-post${q}`)))
    await wg('noToken', '?font=oswald')
    await wg('badToken', '?token=nope&font=oswald')
    await wg('plan', '?token=tok&font=oswald', { truck: { plan: 'starter' } })
    await wg('noFont', '?token=tok')
    await wg('unknownFont', '?token=tok&font=Bad!Font')
    await wg('uploadedFont', '?token=tok&font=u:bitter')
    await wg('libraryFallback', '?token=tok&font=g:opensans')
    await wg('ok', '?token=tok&font=oswald&w=700')

    // ══ app/api/manage/whatsapp-preview ═══════════════════════════════════════════════════════════════════════
    const pv = (k, body, o = {}) => call(`${cc}|waPreview|${k}`, { tables: T(o), cc, ...o }, () => M.previewPOST(req('/api/manage/whatsapp-preview', { method: 'POST', body })))
    await pv('badJson', '{nope')
    await pv('noToken', { message: 'hi' })
    await pv('badToken', { token: 'nope', message: 'hi' })
    await pv('empty', tok({ message: '   ' }))
    await pv('tooLong', tok({ message: 'x'.repeat(1001) }))
    await pv('ok.schedule', tok({ message: 'Where are you this weekend?' }))
    await pv('ok.ignore', tok({ message: 'asdfghjkl' }), { geminiClass: 'IGNORE' })
    await pv('ok.allergen', tok({ message: 'Is the pizza safe for a nut allergy?' }), { geminiClass: 'ALLERGEN_QUERY' })
    await pv('ok.menu', tok({ message: 'How much are your pizzas?' }), { geminiClass: 'MENU_QUERY' })
    await pv('ok.aiDown', tok({ message: 'Where are you tomorrow?' }), { resp: { 'generativelanguage.googleapis.com': { status: 500, throws: true } } })

    // ══ app/api/manage/whatsapp-signup ════════════════════════════════════════════════════════════════════════
    const COMPLETE = { kind: 'complete', code: 'one-time-code', wabaId: 'waba-1', phoneNumberId: 'pn-1', businessId: 'biz-1', finishType: 'FINISH' }
    const su = (k, body, o = {}) => call(`${cc}|waSignup|${k}`, { tables: T(o), cc, ...o }, () => M.signupPOST(req('/api/manage/whatsapp-signup', { method: 'POST', body })))
    await su('badJson', '{nope')
    await su('noToken', { kind: 'complete' })
    await su('badToken', { token: 'nope', kind: 'complete' })
    await su('notAvailable', tok(COMPLETE), { waLive: false })
    await su('abandoned', tok({ kind: 'abandoned', currentStep: 'PHONE_NUMBER_SETUP' }))
    await su('badKind', tok({ kind: 'mystery' }))
    await su('noCode', tok({ ...COMPLETE, code: '' }))
    await su('noWaba', tok({ ...COMPLETE, wabaId: '' }))
    await su('noEncryptionKey', tok(COMPLETE), { encKey: false })
    await su('noAppId', tok(COMPLETE), { env: { NEXT_PUBLIC_WHATSAPP_SIGNUP_APP_ID: undefined } })
    await su('exchangeFailed', tok(COMPLETE), { resp: { '/oauth/access_token': { status: 400, body: { error: { code: 100, type: 'OAuthException', message: 'Code expired' } } } } })
    await su('exchangeThrew', tok(COMPLETE), { resp: { '/oauth/access_token': { status: 500, throws: true } } })
    await su('noExpiry', tok(COMPLETE), { resp: { '/oauth/access_token': { status: 200, body: { access_token: 'meta-harness-token' } } } })
    await su('phaseAFails', tok(COMPLETE), { fail: { whatsapp_connections: ['upsert'] } })
    await su('noNumber', tok({ ...COMPLETE, phoneNumberId: '' }))
    await su('needsRegistering', tok(COMPLETE), { env: { WHATSAPP_REGISTRATION_PIN: undefined } })
    await su('registerRefused', tok(COMPLETE), { resp: { '/register': { status: 400, body: { error: { code: 133005 } } } } })
    await su('deliveryRefused', tok(COMPLETE), { resp: { '/subscribed_apps': { status: 400, body: { error: { code: 200 } } } } })
    await su('numberTaken', tok(COMPLETE), { fail: { whatsapp_connections: ['update'] }, failCode: '23505' })
    await su('saveIncomplete', tok(COMPLETE), { fail: { whatsapp_connections: ['update'] } })
    await su('ok.cloudApi', tok(COMPLETE))
    await su('ok.coexistence', tok({ ...COMPLETE, finishType: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING' }))
  }
  return out
}

module.exports = { views }
