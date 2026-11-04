// scripts/contact-1.cjs — contact-1's proof (2 November 2026; docs/contact-1-report.md): HATCHGRAB'S OWN CONTACT FORM IN EVERY
// LANGUAGE, Village Foodie keeping Tally.
//
//   1 · the rules (lib/contact.ts): every field's limits, counted in characters; the truck name required only for account help;
//       ?topic= mapping (Tally's old values and anything unrecognised → the first topic)
//   2 · the server (lib/contact-server.ts, fake database / limits / sender): the trap field and the render clock answer "sent" and
//       store nothing; validation; 5 an hour per IP and 20 a day per email; save first (a failed save is the error, never a pretend
//       success); the email to the support inbox with the visitor as Reply-To and the agreed subject, the body plain and escaped;
//       a failed send keeps the row as 'failed' and still thanks the visitor; the hourly retry (up to 3 more tries); Brevo's request
//       (mocked fetch — no email is ever sent)
//   3 · POST /api/contact end to end (the real route; fake database, Upstash stubbed, Brevo mocked): HatchGrab host only; the row,
//       then the send result; Brevo down → 'failed', still "sent"; Upstash down → fails open
//   4 · the page in en-GB, de-DE, ja-JP and ar-AE: the form in the page's words, labels tied to their fields, the privacy line linking
//       the visitor's own Privacy Policy, heading / intro / "Email us" kept; no English on the non-English pages
//   5 · no tally.so on any of HatchGrab's own pages (Dominic, option A: /trucks/<slug> on hatchgrab.com is the one known exception,
//       kept exactly as it is); nothing left that only served Tally there
//   6 · Village Foodie: /contact rendered byte-identical to HEAD (3d6228b7) with every ?topic= / ?venue= / ?truck= the links send;
//       the venue and truck pages' whole source closure unchanged
//   7 · the words: en-GB exactly as agreed, all 28 bases complete, translation-check structural 0 with no flag on the form
//   8 · the Privacy Policy (English + 28, re-stamped), its dates, the 24-month deletion in the daily retention job, the migration
//   9 · the language audit's latest run (scripts/legal-languages-1-audit.cjs, by hand): no English on any /contact view
// §6's HEAD side is scripts/fixtures/contact-1-identity.json, written by THIS script in a worktree of 3d6228b7:
//   (in <dir>) HG_KIT_CACHE_SUFFIX=contact1head node scripts/contact-1.cjs capture <this repo>/scripts/fixtures/contact-1-identity.json
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS script, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const kit = require('./_render-kit.cjs')({ cacheTag: 'contact-1' })
const LP1E = require('./_lp1e-fixtures.cjs')
const WF = require('./_world-countries-1-fixtures.cjs')
const IDENTITY = path.join(REPO, 'scripts/fixtures/contact-1-identity.json')
const BASE = '3d6228b7'

let pass = 0, fail = 0
const t = (name, ok, detail) => { if (ok) pass++; else { fail++; console.log(`  ✗ ${name}${detail === undefined ? '' : ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500)}`) } }
const head = s => console.log(`\n── ${s}`)
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')
const atBase = f => { try { return execFileSync('git', ['show', `${BASE}:${f}`], { cwd: REPO, maxBuffer: 1 << 26 }).toString() } catch { return null } }

// ── §6's set: Village Foodie's /contact, every search its links send (rendered identically at HEAD by `capture`) ──
const VF_SEARCHES = ['', 'topic=General%20Enquiry', 'topic=Add%20Business&truck=Pizza%20Gusto', 'topic=ClaimVenue&venue=The%20Plough%20Inn', 'topic=Report%20Issue', 'topic=Cost%20Comparison']
async function vfViews(ctx) {
  const CT = await ctx.bundle('c1-vf', "export { default, generateMetadata } from '@/app/contact/page'")
  const out = {}
  for (const s of VF_SEARCHES) {
    globalThis.__msSearch = s
    const sp = () => Promise.resolve(Object.fromEntries(new URLSearchParams(s)))
    try {
      const r = await kit.quietAsync(() => ctx.withReq({ rows: WF.rowsWith(WF.WORLD), host: 'www.villagefoodie.co.uk' }, async () => ({
        meta: await CT.generateMetadata({ searchParams: sp() }), html: await ctx.prerender(kit.h(CT.default, { searchParams: sp() })),
      })))
      out[`vf-contact:${s || 'bare'}`] = { html: sha(r.html), meta: sha(JSON.stringify(r.meta)), tally: (r.html.match(/tally\.so/g) || []).length }
    } finally { delete globalThis.__msSearch }
  }
  return out
}
if (process.argv[2] === 'capture') {
  (async () => {
    const out = await vfViews(LP1E.context(kit, REPO))
    fs.writeFileSync(process.argv[3], JSON.stringify({ $why: `contact-1 §6: sha256 of Village Foodie's /contact (HTML and metadata) for every search its links send, at ${BASE}, by scripts/contact-1.cjs capture.`, commit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO }).toString().trim(), pages: out }, null, 1) + '\n')
    console.log(`captured ${Object.keys(out).length} views`)
  })().catch(e => { console.error(e); process.exit(1) })
  return
}

const ents = s => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const LOCALES_FILE = read('lib/i18n/locales.ts')
const BASES = /export const LANGUAGE_BASES[^=]*=\s*\[([^\]]*)\]/.exec(LOCALES_FILE)[1].match(/'[^']+'/g).map(s => s.slice(1, -1))
const flat = (o, p = '', out = {}) => { for (const [k, v] of Object.entries(o ?? {})) { const kk = p ? `${p}.${k}` : k; if (typeof v === 'string') out[kk] = v; else flat(v, kk, out) } return out }

;(async () => {
  kit.setNow('2026-11-02T18:30:05Z')
  const NOW = new Date()
  const ctx = LP1E.context(kit, REPO)
  const C = await ctx.bundle('c1-lib', "export * from '@/lib/contact'\nexport * from '@/lib/contact-server'\nexport { runOrderRetention, CONTACT_RETENTION_MONTHS } from '@/lib/order-retention'\nexport { legalPath } from '@/lib/legal'")

  // ══ 1 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('1 · the rules (lib/contact.ts — the browser and the server run the same function)')
  const ok = { topic: 'question', name: 'Ana', email: 'ana@example.de', business: '', message: 'Hello there, a question.' }
  const v = o => C.validateContact({ ...ok, ...o })
  t('three topics in the agreed order, the first the default', JSON.stringify(C.CONTACT_TOPICS) === '["question","account","other"]' && C.topicFromParam(undefined) === 'question')
  t('?topic=: Tally\'s values (General Enquiry, Cost Comparison, Add Business, Report Issue, ClaimVenue) and anything unrecognised → the first topic', ['General Enquiry', 'Cost Comparison', 'Add Business', 'Report Issue', 'ClaimVenue', 'nonsense', ''].every(x => C.topicFromParam(x) === 'question'))
  t('…only the form\'s own ids pick another (account, other; an array takes its first)', C.topicFromParam('account') === 'account' && C.topicFromParam(['other', 'account']) === 'other')
  t('a complete message passes', Object.keys(v({})).length === 0)
  t('name: required; 100 characters pass, 101 do not', v({ name: '' }).name === 'nameRequired' && !v({ name: 'n'.repeat(100) }).name && v({ name: 'n'.repeat(101) }).name === 'nameTooLong')
  t('email: required; one @, a dot in the domain, no spaces; 254 characters pass, 255 do not', v({ email: '' }).email === 'emailRequired' && ['a@b', 'a b@c.de', 'ab.de', '@c.de'].every(e => v({ email: e }).email === 'emailInvalid')
    && !v({ email: `${'a'.repeat(243)}@example.de` }).email && v({ email: `${'a'.repeat(244)}@example.de` }).email === 'emailTooLong')
  t('truck or business name: optional for a question or something else', !v({ business: '' }).business && !v({ topic: 'other', business: '' }).business)
  t('…required for "Help with my account" (so we can find the truck); 120 characters pass, 121 do not', v({ topic: 'account', business: '' }).business === 'businessRequired' && !v({ topic: 'account', business: 'b'.repeat(120) }).business && v({ business: 'b'.repeat(121) }).business === 'businessTooLong')
  t('message: 10 to 5,000 characters', v({ message: 'm'.repeat(9) }).message === 'messageTooShort' && !v({ message: 'm'.repeat(10) }).message && !v({ message: 'm'.repeat(5000) }).message && v({ message: 'm'.repeat(5001) }).message === 'messageTooLong')
  t('lengths are counted in characters, as Postgres counts them: ten emoji are 10, not 20; 5,000 emoji pass', !v({ message: '🍕'.repeat(10) }).message && !v({ message: '🍕'.repeat(5000) }).message && v({ message: '🍕'.repeat(9) }).message === 'messageTooShort')
  t('fields are trimmed; an unknown topic is refused', C.contactFieldsFrom({ name: '  Ana  ', topic: 'x' }).name === 'Ana' && v({ topic: 'x' }).topic === 'topicInvalid')
  t('the browser form validates with this very function (HatchGrabContactForm imports validateContact)', /import \{[^}]*validateContact[^}]*\} from '@\/lib\/contact'/.test(read('app/contact/HatchGrabContactForm.tsx')) && /validateContact\(f\)/.test(read('lib/contact-server.ts')))

  // ══ 2 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('2 · the server — bots, validation, limits, save first, the email, a failed send, the retry')
  const SECRET = 'harness-secret'
  const token = (msAgo, secret = SECRET) => C.contactRenderToken(new Date(NOW.getTime() - msAgo), secret)
  const body = (o = {}) => ({ topic: 'account', name: 'Ana Müller', email: 'Ana@Example.de', business: 'Pizza Kitchen', message: 'Mein Bestellbildschirm lädt seit heute Morgen nicht mehr.', rendered: token(12_000), country: 'DE', locale: 'de-DE', page: '/contact?country=DE', website: '', ...o })
  let nid = 0
  function deps(over = {}) {
    const st = { rows: [], updates: [], sends: [], ip: [], em: [], logs: [] }
    const d = {
      insert: async r => { st.rows.push(r); return { error: null } }, update: async (id, p) => { st.updates.push({ id, p }); return { error: null } },
      limitIp: async k => { st.ip.push(k); return true }, limitEmail: async k => { st.em.push(k); return true },
      send: async m => { st.sends.push(m); return { ok: true, messageId: '<202611021830.1@smtp-relay.brevo.com>' } },
      now: () => NOW, newId: () => `00000000-0000-4000-8000-${String(++nid).padStart(12, '0')}`, secret: SECRET, log: (l, m) => st.logs.push([l, m]), ...over,
    }
    return { d, st }
  }
  {
    const { d, st } = deps()
    const r = await C.submitContact(body(), '203.0.113.7', d)
    const row = st.rows[0]
    t('a real message: answered "sent" (200)', r.status === 200 && r.body.ok === true, r)
    t('saved first, every field as sent (trimmed), with its country, language and page', st.rows.length === 1 && row.topic === 'account' && row.name === 'Ana Müller' && row.email === 'Ana@Example.de' && row.business_name === 'Pizza Kitchen'
      && row.message.startsWith('Mein Bestellbildschirm') && row.country === 'DE' && row.locale === 'de-DE' && row.page_path === '/contact?country=DE' && row.created_at === NOW.toISOString() && row.email_status === null && row.email_attempts === 0, row)
    t('the IP address is stored only as sha256(salt:address) — never the address', row.ip_hash === crypto.createHash('sha256').update(`${SECRET}:203.0.113.7`).digest('hex') && !JSON.stringify(row).includes('203.0.113.7'))
    t('the limits are keyed on the IP hash and on sha256 of the lower-cased email — no address in a Redis key', st.ip[0] === row.ip_hash && st.em[0] === crypto.createHash('sha256').update('email:ana@example.de').digest('hex'))
    t('then the send result is recorded on the row: sent, Brevo\'s message id, 1 attempt', JSON.stringify(st.updates) === JSON.stringify([{ id: row.id, p: { email_status: 'sent', provider_message_id: '<202611021830.1@smtp-relay.brevo.com>', email_attempts: 1 } }]), st.updates)
    const m = st.sends[0]
    t('the email goes to the support inbox (hello@hatchgrab.com) with the visitor as Reply-To', m.to === 'hello@hatchgrab.com' && m.replyTo === 'Ana@Example.de', m)
    t('subject "[HatchGrab contact] {topic} — {name} ({country}, {language})"', m.subject === '[HatchGrab contact] Help with my account — Ana Müller (Germany, German)', m.subject)
    t('the body has every field, the page it came from and the time in UK time', ['Topic: Help with my account', 'Name: Ana Müller', 'Email: Ana@Example.de', 'Truck or business name: Pizza Kitchen', 'Country: Germany (DE)', 'Language: German (de-DE)',
      'Sent from: https://www.hatchgrab.com/contact?country=DE', 'Time: Monday, 2 November 2026 at 18:30:05 GMT', 'Message:\nMein Bestellbildschirm lädt seit heute Morgen nicht mehr.'].every(x => m.text.includes(x)), m.text)
    t('UK time in summer is BST', C.ukTime('2026-07-01T11:00:00Z') === 'Wednesday, 1 July 2026 at 12:00:00 BST', C.ukTime('2026-07-01T11:00:00Z'))
    t('no auto-reply: one email, to us', st.sends.length === 1)
  }
  {
    const { d, st } = deps()
    await C.submitContact(body({ name: 'Eve <script>alert(1)</script>\r\nBcc: x@evil.test', message: '<img src=x onerror=alert(1)> & "quotes" here' }), '203.0.113.7', d)
    const m = st.sends[0]
    t('the HTML part is the text escaped — no markup from the visitor reaches the inbox', !/<script|<img/.test(m.html) && m.html.includes('&lt;script&gt;') && m.html.includes('&amp; &quot;quotes&quot;'), m.html.slice(0, 300))
    t('a line break in the name cannot add a header: the subject is one line', !/[\r\n]/.test(m.subject) && m.subject.includes('Bcc: x@evil.test (Germany, German)'), m.subject)
  }
  for (const [label, over] of [['the trap field filled', { website: 'http://spam.example' }], ['sent 1 second after the page rendered', { rendered: token(1000) }],
    ['sent 2.9 seconds after', { rendered: token(2900) }], ['a forged timestamp', { rendered: `${NOW.getTime() - 60_000}.${'0'.repeat(64)}` }], ['no timestamp', { rendered: undefined }], ['a timestamp from the future', { rendered: token(-60_000) }]]) {
    const { d, st } = deps()
    const r = await C.submitContact(body(over), '203.0.113.7', d)
    t(`a bot — ${label}: answered "sent", nothing stored, nothing sent, no limit spent`, r.status === 200 && r.body.ok === true && !st.rows.length && !st.sends.length && !st.ip.length && !st.em.length, { r, st })
  }
  {
    const { d, st } = deps()
    const r = await C.submitContact(body({ rendered: token(3000) }), '203.0.113.7', d)
    t('exactly 3 seconds is a person', r.body.ok === true && st.rows.length === 1)
  }
  {
    const { d, st } = deps()
    const r = await C.submitContact(body({ name: '', business: '', message: 'short' }), '203.0.113.7', d)
    t('invalid fields: 400 with each field\'s error (the truck name required for account help); nothing stored, no limit spent', r.status === 400 && r.body.code === 'invalid' && r.body.fields.name === 'nameRequired' && r.body.fields.business === 'businessRequired' && r.body.fields.message === 'messageTooShort' && !st.rows.length && !st.ip.length, r)
  }
  for (const [label, over] of [['the IP limit', { limitIp: async () => false }], ['the email limit', { limitEmail: async () => false }]]) {
    const { d, st } = deps(over)
    const r = await C.submitContact(body(), '203.0.113.7', d)
    t(`over ${label}: 429 "rate_limited", nothing stored or sent`, r.status === 429 && r.body.code === 'rate_limited' && !st.rows.length && !st.sends.length, r)
  }
  {
    // sliding windows as Upstash keeps them: 5 an hour per address, 20 a day per email
    const windows = { ip: [5, 3600e3], em: [20, 86400e3] }, hits = { ip: new Map(), em: new Map() }
    let clock = NOW.getTime()
    const lim = kind => async key => { const [n, ms] = windows[kind]; const h = (hits[kind].get(key) || []).filter(x => x > clock - ms); if (h.length >= n) return false; h.push(clock); hits[kind].set(key, h); return true }
    const { d } = deps({ limitIp: lim('ip'), limitEmail: lim('em'), now: () => new Date(clock) })
    const send = (ip, email) => C.submitContact(body({ email, rendered: C.contactRenderToken(new Date(clock - 10_000), SECRET) }), ip, d)
    const five = []; for (let i = 0; i < 5; i++) five.push((await send('198.51.100.1', `p${i}@example.de`)).status)
    const sixth = (await send('198.51.100.1', 'p6@example.de')).status
    t('5 messages an hour from one address pass; the 6th is refused (429)', five.every(s => s === 200) && sixth === 429, { five, sixth })
    clock += 3601e3
    t('…and an hour later that address may send again', (await send('198.51.100.1', 'p7@example.de')).status === 200)
    const twenty = []; for (let i = 0; i < 20; i++) twenty.push((await send(`192.0.2.${i + 1}`, 'same@example.de')).status)
    const twentyFirst = (await send('192.0.2.99', 'SAME@example.de')).status
    t('20 messages a day to one email address pass, from 20 addresses; the 21st (any case) is refused', twenty.every(s => s === 200) && twentyFirst === 429, { twentyFirst })
  }
  const rl = read('lib/ratelimit.ts')
  t('the Upstash limiters: 5 per 1 h (hg_rl_contact_ip) and 20 per 24 h (hg_rl_contact_email), sliding windows', /contactIpRatelimit = new Ratelimit\(\{[^}]*slidingWindow\(5, '1 h'\)[^}]*prefix: 'hg_rl_contact_ip'/.test(rl) && /contactEmailRatelimit = new Ratelimit\(\{[^}]*slidingWindow\(20, '24 h'\)[^}]*prefix: 'hg_rl_contact_email'/.test(rl))
  {
    const { d, st } = deps({ insert: async () => ({ error: 'connection refused' }) })
    const r = await C.submitContact(body(), '203.0.113.7', d)
    t('the save fails → 500 "failed" (the error message, never a pretend success); nothing is emailed', r.status === 500 && r.body.code === 'failed' && !st.sends.length && st.logs.some(([l, m]) => l === 'error' && /could not save/.test(m)), r)
  }
  {
    const { d, st } = deps({ send: async () => ({ ok: false, error: 'Brevo 502: bad gateway' }) })
    const r = await C.submitContact(body(), '203.0.113.7', d)
    t('Brevo fails → the row stays, email_status \'failed\' (1 attempt); the visitor still sees the thank-you (200)', r.status === 200 && r.body.ok === true && st.rows.length === 1 && JSON.stringify(st.updates[0].p) === '{"email_status":"failed","email_attempts":1}', st.updates)
    t('…and the failure is recorded in the log with the message id', st.logs.some(([l, m]) => l === 'error' && m.includes(st.rows[0].id) && /kept as 'failed'/.test(m) && /Brevo 502/.test(m)))
  }
  {
    const { d, st } = deps({ secret: null })
    const r = await C.submitContact(body({ rendered: undefined }), '203.0.113.7', d)
    t('without CONTACT_IP_SALT a real message is still saved (no IP hash, no timing check), and that is logged', r.body.ok === true && st.rows[0].ip_hash === null && st.logs.some(([l, m]) => l === 'warn' && /CONTACT_IP_SALT is not set/.test(m)))
  }
  // Brevo's request itself (fetch mocked; the key is a dummy)
  {
    const keep = process.env.BREVO_API_KEY
    process.env.BREVO_API_KEY = 'harness-dummy-key'
    const calls = []
    const fetchOk = async (u, o) => { calls.push([u, o]); return new Response(JSON.stringify({ messageId: '<abc@smtp-relay.brevo.com>' }), { status: 201 }) }
    const mail = C.contactMail({ id: 'x', created_at: NOW.toISOString(), topic: 'question', name: 'Ana', email: 'ana@example.de', business_name: null, message: 'A question about plans.', country: 'GB', locale: 'en-GB', page_path: '/contact', ip_hash: null, email_status: null, provider_message_id: null, email_attempts: 0 })
    const r1 = await C.brevoSend(mail, fetchOk)
    const sent = JSON.parse(calls[0][1].body)
    t('Brevo: POST https://api.brevo.com/v3/smtp/email with the api-key header', calls[0][0] === 'https://api.brevo.com/v3/smtp/email' && calls[0][1].method === 'POST' && calls[0][1].headers['api-key'] === 'harness-dummy-key')
    t('…from the verified hello@hatchgrab.com sender, to the support inbox, Reply-To the visitor, the subject, text and escaped HTML', sent.sender.email === 'hello@hatchgrab.com' && sent.sender.name === 'HatchGrab' && sent.to[0].email === 'hello@hatchgrab.com' && sent.replyTo.email === 'ana@example.de'
      && sent.subject === '[HatchGrab contact] A question about HatchGrab — Ana (United Kingdom, English)' && sent.textContent === mail.text && sent.htmlContent === mail.html, sent)
    t('…its message id is kept', r1.ok && r1.messageId === '<abc@smtp-relay.brevo.com>')
    t('a 4xx/5xx from Brevo, or a network error, is a failed send (never a throw)', !(await C.brevoSend(mail, async () => new Response('nope', { status: 400 }))).ok && !(await C.brevoSend(mail, async () => { throw new Error('offline') })).ok)
    delete process.env.BREVO_API_KEY
    let called = false
    const r0 = await C.brevoSend(mail, async () => { called = true; return new Response('{}', { status: 201 }) })
    t('no BREVO_API_KEY → a failed send, and nothing is fetched', !r0.ok && !called && /BREVO_API_KEY not set/.test(r0.error))
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = 'hello@hatchgrab.com'
    t('the inbox is NEXT_PUBLIC_SUPPORT_EMAIL (hello@hatchgrab.com)', C.supportInbox() === 'hello@hatchgrab.com')
    delete process.env.NEXT_PUBLIC_SUPPORT_EMAIL
    if (keep !== undefined) process.env.BREVO_API_KEY = keep
  }
  // the hourly retry
  {
    const ago = m => new Date(NOW.getTime() - m * 60_000).toISOString()
    const base = { topic: 'question', name: 'R', email: 'r@example.de', business_name: null, message: 'Retry me please.', country: 'GB', locale: 'en-GB', page_path: '/contact', ip_hash: null, provider_message_id: null }
    const rows = [
      { ...base, id: 'a-failed-1', created_at: ago(90), email_status: 'failed', email_attempts: 1 },
      { ...base, id: 'b-failed-4', created_at: ago(300), email_status: 'failed', email_attempts: 4 },
      { ...base, id: 'c-stuck', created_at: ago(20), email_status: null, email_attempts: 0 },
      { ...base, id: 'd-fresh', created_at: ago(2), email_status: null, email_attempts: 0 },
      { ...base, id: 'e-sent', created_at: ago(60), email_status: 'sent', email_attempts: 1 },
      { ...base, id: 'f-failed-3', created_at: ago(120), email_status: 'failed', email_attempts: 3 },
    ]
    const updates = [], sends = []
    const res = await C.retryContactEmails({
      pending: async stuck => rows.filter(r => r.email_status === 'failed' || (r.email_status === null && r.created_at < stuck)),
      update: async (id, p) => { updates.push({ id, p }); return { error: null } },
      send: async m => { sends.push(m); return m.text.includes('f-failed-3') ? { ok: false, error: 'still down' } : { ok: true, messageId: 'm-' + sends.length } },
      now: () => NOW, log: () => {},
    })
    const by = Object.fromEntries(updates.map(u => [u.id, u.p]))
    t('the retry: failed rows under 4 attempts and rows never sent 10+ minutes after saving are retried; others are left', JSON.stringify(Object.keys(by).sort()) === JSON.stringify(['a-failed-1', 'c-stuck', 'f-failed-3']) && res.tried === 3 && res.sent === 2, by)
    t('…the first send plus up to 3 retries: attempt 4 is the last (a 4th failure stays \'failed\' for good)', by['f-failed-3'].email_status === 'failed' && by['f-failed-3'].email_attempts === 4 && by['a-failed-1'].email_status === 'sent' && by['a-failed-1'].email_attempts === 2 && C.CONTACT_MAX_ATTEMPTS === 4)
    const dc = read('app/api/cron/demo-cleanup/route.ts')
    t('…run by the existing hourly job (/api/cron/demo-cleanup GET, schedule "0 * * * *"), outside the demo run\'s result, failures only logged', /await retryContactEmails\(\{[\s\S]*?\}\)\.catch\(err => console\.error\('\[demo-cleanup\] contact email retry failed:', err\)\)\s*return run\(\)/.test(dc)
      && /\.lt\('email_attempts', CONTACT_MAX_ATTEMPTS\)/.test(dc) && JSON.parse(read('vercel.json')).crons.some(c => c.path === '/api/cron/demo-cleanup' && c.schedule === '0 * * * *'))
  }

  // ══ 3 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('3 · POST /api/contact end to end (fake database, Upstash stubbed, Brevo mocked)')
  {
    process.env.CONTACT_IP_SALT = 'harness-salt'
    process.env.BREVO_API_KEY = 'harness-dummy-key'
    const RL_STUB = "const mk = k => ({ limit: async key => { const f = globalThis.__c1limit; if (f) return f(k, key); return { success: true } } })\nexport const contactIpRatelimit = mk('ip')\nexport const contactEmailRatelimit = mk('email')"
    const R = await kit.bundle('c1-route', "export { POST } from '@/app/api/contact/route'\nexport { contactRenderToken } from '@/lib/contact-server'", { stubs: { '@/lib/ratelimit': RL_STUB } })
    const realFetch = globalThis.fetch
    const brevo = []
    let brevoStatus = 201
    globalThis.fetch = async (u, o) => { brevo.push([String(u), JSON.parse(o.body)]); return new Response(JSON.stringify({ messageId: '<route@brevo>' }), { status: brevoStatus }) }
    async function post(b, host = 'www.hatchgrab.com') {
      const tables = { contact_messages: [] }, writes = []
      globalThis.__harnessDb = kit.fakeDb(tables, writes)
      try {
        const res = await kit.quietAsync(() => R.POST({ headers: new Headers({ host, 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }), json: async () => b }))
        return { status: res.status, body: await res.json(), writes }
      } finally { delete globalThis.__harnessDb }
    }
    try {
      const good = () => body({ rendered: R.contactRenderToken(new Date(NOW.getTime() - 8000), 'harness-salt') })
      const vf = await post(good(), 'www.villagefoodie.co.uk')
      t('Village Foodie\'s host: 404, nothing written, nothing sent', vf.status === 404 && !vf.writes.length && !brevo.length, vf)
      const r = await post(good())
      const ins = r.writes[0], upd = r.writes[1]
      t('HatchGrab: 200 "sent"; the row inserted into contact_messages, then its send result', r.status === 200 && r.body.ok === true && ins?.table === 'contact_messages' && ins.op === 'insert' && upd?.table === 'contact_messages' && upd.op === 'update'
        && JSON.stringify(upd.patch) === '{"email_status":"sent","provider_message_id":"<route@brevo>","email_attempts":1}', r.writes)
      t('…the first x-forwarded-for address, hashed with CONTACT_IP_SALT', ins.patch.ip_hash === crypto.createHash('sha256').update('harness-salt:203.0.113.9').digest('hex'))
      t('…Brevo called once: Reply-To the visitor, the agreed subject', brevo.length === 1 && brevo[0][1].replyTo.email === 'Ana@Example.de' && brevo[0][1].subject === '[HatchGrab contact] Help with my account — Ana Müller (Germany, German)', brevo[0]?.[1])
      brevoStatus = 503
      const down = await post(good())
      t('Brevo down: still 200 "sent", the row kept as email_status \'failed\'', down.status === 200 && down.body.ok && JSON.stringify(down.writes[1].patch) === '{"email_status":"failed","email_attempts":1}', down.writes)
      brevoStatus = 201
      globalThis.__c1limit = () => { throw new Error('upstash unreachable') }
      const open = await post(good())
      t('Upstash unreachable: the route fails open (the message is saved and sent)', open.status === 200 && open.writes.length === 2)
      globalThis.__c1limit = kind => ({ success: kind !== 'ip' })
      const lim = await post(good())
      t('over a limit: 429 {code: rate_limited}, nothing written', lim.status === 429 && lim.body.code === 'rate_limited' && !lim.writes.length)
      delete globalThis.__c1limit
      const unreadable = await kit.quietAsync(() => R.POST({ headers: new Headers({ host: 'www.hatchgrab.com' }), json: async () => { throw new Error('bad json') } }))
      t('an unreadable body: 400 "failed"', unreadable.status === 400)
    } finally { globalThis.fetch = realFetch; delete process.env.BREVO_API_KEY }
  }

  // ══ 4 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('4 · the page in en-GB, de-DE, ja-JP and ar-AE')
  const P = await ctx.bundle('c1-page', "export { default, generateMetadata } from '@/app/contact/page'\nexport { translatorFor } from '@/lib/i18n/translator'")
  const ROWS = WF.rowsWith(WF.WORLD)
  const render = (cc, extra = {}) => kit.quietAsync(() => ctx.withReq({ rows: ROWS }, () => ctx.prerender(kit.h(P.default, { searchParams: Promise.resolve({ country: cc, ...extra }) }))))
  const EN = JSON.parse(read('messages/en-GB.json')).contactPage
  const pages = {}
  for (const [cc, locale, seg] of [['GB', 'en-GB', null], ['DE', 'de-DE', 'de'], ['JP', 'ja-JP', 'jp'], ['AE', 'ar-AE', 'ae']]) {
    const html = await render(cc)
    pages[cc] = html
    const W = flat(JSON.parse(read(`messages/${locale}.json`)).contactPage)
    const text = ents(html.replace(/<[^>]+>/g, ' '))
    t(`${locale}: the form renders (topic select, name, email, business, message, Send), no iframe`, /<form class="cf"/.test(html) && /<select id="cf-topic" name="topic"/.test(html) && /<input id="cf-name"[^>]* name="name"/.test(html) && /<input id="cf-email" type="email"[^>]* name="email"/.test(html)
      && /<input id="cf-business"[^>]* name="business"/.test(html) && /<textarea id="cf-message" name="message"/.test(html) && /<button type="submit" class="btn btn-primary btn-lg"/.test(html) && !/<iframe/.test(html))
    const opts = [...html.matchAll(/<option value="(\w+)"[^>]*>([^<]*)<\/option>/g)].map(m => [m[1], ents(m[2])])
    t(`${locale}: the three topics in order, in the page's words, the first selected`, JSON.stringify(opts) === JSON.stringify([['question', W['form.topics.question']], ['account', W['form.topics.account']], ['other', W['form.topics.other']]]) && /<option value="question" selected=""/.test(html), opts)
    t(`${locale}: every label is tied to its field (for = id)`, ['topic', 'name', 'email', 'business', 'message'].every(k => html.includes(`for="cf-${k}"`) && html.includes(`id="cf-${k}"`)))
    t(`${locale}: heading "${W.formHeading}", the labels, "(optional)", placeholders, Send and the privacy line in its language`, [W.formHeading, W['form.topicLabel'], W['form.nameLabel'], W['form.emailLabel'], W['form.businessLabel'], W['form.optional'], W['form.messageLabel'], W['form.send'], W['form.privacyLine'], W['form.privacyLink']].every(w => text.includes(w))
      && html.includes(`placeholder="${W['form.businessPlaceholder'].replace(/"/g, '&quot;')}"`) && html.includes(`placeholder="${W['form.namePlaceholder']}"`))
    const privacy = /<p class="cf-privacy">[\s\S]*?<a href="([^"]+)">/.exec(html)?.[1]
    t(`${locale}: the privacy link is the visitor's own-language Privacy Policy (${privacy})`, privacy === C.legalPath('privacy', { country: cc, locale }) && privacy === (seg ? `/${seg}/privacy` : '/privacy'))
    t(`${locale}: heading, intro and "Email us" kept (eyebrow, title, lede, the mailto)`, [W.eyebrow, W.title, W.lede, W.emailUs].every(w => text.includes(w)) && html.includes('href="mailto:hello@hatchgrab.com"'))
    if (locale !== 'en-GB') {
      const english = Object.entries(flat(EN)).filter(([k, s]) => W[k] !== s && /\p{L}{2,}\s+\p{L}{2,}/u.test(s.replace(/\{[^}]*\}/g, ''))).map(([, s]) => s).filter(s => text.includes(s) || html.includes(s))
      t(`${locale}: no English sentence of the page anywhere in it`, english.length === 0, english)
      t(`${locale}: no form word left in English`, !['What’s it about?', 'Your name', 'Your message', 'Send message', 'Truck or business name', 'Privacy policy', 'e.g. Pizza Kitchen'].some(w => html.includes(w.replace(/’/g, '&#x27;')) || html.includes(w)))
    }
  }
  const acct = await render('GB', { topic: 'account' }), gen = await render('GB', { topic: 'General Enquiry' }), vt = await render('GB', { topic: 'Add Business', truck: 'X', venue: 'Y' })
  t('?topic=account selects "Help with my account" and the truck name loses "(optional)" (required)', /<option value="account" selected=""/.test(acct) && !/cf-optional/.test(acct) && /<input id="cf-business" type="text" autoComplete="organization" required=""/.test(acct))
  t('?topic=General Enquiry (the footer links) and an unknown topic select the first topic', /<option value="question" selected=""/.test(gen) && /<option value="question" selected=""/.test(vt))
  t('?truck= / ?venue= are ignored on HatchGrab (nothing of them in the page)', !/Add Business|truck=|venue=/.test(vt))
  t('the trap field is off-screen, hidden from assistive tech, out of the tab order', /<div class="cf-trap" aria-hidden="true"><input type="text" tabindex="-1" autoComplete="off" name="website" value=""\/><\/div>/.test(pages.GB), /<div class="cf-trap"[\s\S]{0,200}/.exec(pages.GB)?.[0])
  t('Arabic pages stay right to left (app/layout.tsx, as set) and the select\'s arrow moves to the left there', /\{\.\.\.\(isRtl\(lang\) \? \{ dir: 'rtl' \} : \{\}\)\}/.test(read('app/layout.tsx')) && /\[dir="rtl"\] \.hg-landing \.cf select \{ background-position: left 1rem center; \}/.test(read('app/contact/contact-form.css')))
  t('the form\'s stylesheet is imported by the HatchGrab module only (page.tsx reaches it through a dynamic import)', /import '\.\/contact-form\.css'/.test(read('app/contact/HatchGrabContact.tsx')) && !/contact-form\.css/.test(read('app/contact/page.tsx')) && /await import\('\.\/HatchGrabContact'\)/.test(read('app/contact/page.tsx')))
  const form = read('app/contact/HatchGrabContactForm.tsx')
  t('field errors are inline under their field (aria-invalid + aria-describedby); the two send errors beside the button (role="alert"); the thank-you box replaces the form', /'aria-invalid': errors\[k\] \? true : undefined, 'aria-describedby': errors\[k\] \? `cf-\$\{k\}-error`/.test(form) && /id="cf-form-error" role="alert"/.test(form) && /if \(state === 'sent'\) \{\s*return \(\s*<div ref=\{thanks\} className="cf-thanks" role="status" tabIndex=\{-1\}>/.test(form))
  const words = await kit.quietAsync(() => ctx.withReq({ rows: ROWS }, async () => (await ctx.bundle('c1-words', "export { contactFormWords } from '@/app/contact/HatchGrabContact'")).contactFormWords('de-DE')))
  t('the error sentences carry the support address and the limits in the page\'s number format (de-DE: 5.000)', words.errors.rateLimited.includes('hello@hatchgrab.com') && words.errors.failed.includes('hello@hatchgrab.com') && words.errors.messageTooLong.includes('5.000') && !Object.values(words.errors).some(w => /\{\w+[,}]/.test(w)), words.errors)

  // ══ 5 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('5 · no tally.so on any of HatchGrab\'s own pages (one known exception: the truck page, by decision)')
  for (const [cc, html] of Object.entries(pages)) t(`/contact (${cc}): no tally.so, no Tally script, no iframe`, !/tally/i.test(html) && !/<iframe/.test(html))
  const wf = WF.renderer(kit, 'c1-wf')
  for (const [page, seg] of [['landing', 'uk'], ['landing', 'de'], ['features', 'uk'], ['features', 'jp']]) {
    const r = await kit.quietAsync(() => wf.page(page, seg, WF.rowsWith(WF.WORLD)))
    t(`/${seg}${page === 'landing' ? '' : '/' + page}: no tally.so`, !!r.html && !/tally\.so/.test(r.html))
  }
  const walk = (d, out = []) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const p = `${d}/${e.name}`; if (e.isDirectory()) walk(p, out); else if (/\.(tsx?|css)$/.test(e.name)) out.push(p) } return out }
  // Dominic's decision (2 November 2026, option A): "no tally.so" covers HatchGrab's own pages. Every other file that loads Tally is a
  // Village Foodie page — and the truck page, kept exactly as it is on both hosts, is the one known exception on hatchgrab.com.
  const withTally = ['app', 'components', 'lib'].flatMap(d => walk(d)).filter(f => /tally\.so/.test(read(f))).sort()
  t('tally.so is only in Village Foodie\'s pages: /contact (its branch) and the embed, the discovery home, /hire, the venue page, and the truck page', JSON.stringify(withTally) === JSON.stringify(['app/contact/ContactForm.tsx', 'app/contact/page.tsx', 'app/hire/page.tsx', 'app/page.tsx', 'app/trucks/[slug]/TruckClient.tsx', 'app/venues/[slug]/VenueClient.tsx']), withTally)
  const HR = await kit.bundle('c1-hostredir', "export { crossHostRedirect } from '@/lib/host-redirects'")
  t('…on www.hatchgrab.com, /hire and /venues/<slug> move to Village Foodie (308 in production) and / is the landing page — none of them is served there', ['/hire', '/venues/the-plough-inn'].every(p => HR.crossHostRedirect('www.hatchgrab.com', p, '') === `https://www.villagefoodie.co.uk${p}`)
    && /if \(pathname === '\/'\)/.test(read('proxy.ts')))
  // ⚠️ RE-PINNED (tidy-1, 3 November 2026): the known exception is gone — the truck page loads Tally only where page.tsx does not pass
  // tally: false, i.e. not on hatchgrab.com (scripts/tidy-1.cjs §1 renders both hosts).
  const tc = read('app/trucks/[slug]/TruckClient.tsx')
  t('THE KNOWN EXCEPTION IS GONE (tidy-1): on hatchgrab.com /trucks/<slug> loads no Tally — the script and the newsletter popup sit behind `tally`, which page.tsx sets false there', /\{tally && <Script src="https:\/\/tally\.so\/widgets\/embed\.js"/.test(tc) && /\{\.\.\.\(onHatchGrab \? \{ tally: false \} : \{\}\)\}/.test(read('app/trucks/[slug]/page.tsx')) && HR.crossHostRedirect('www.hatchgrab.com', '/trucks/pizza-gusto', '') === null)
  const pg = read('app/contact/page.tsx')
  t('…the Tally script sits after the HatchGrab branch has returned', pg.indexOf('tally.so') > pg.indexOf('return <HatchGrabContact'))
  const hgc = read('app/contact/HatchGrabContact.tsx')
  t('the HatchGrab module no longer imports next/script, Suspense or the Tally embed', !/from 'next\/script'|from 'react'|from '\.\/ContactForm'/.test(hgc) && !/<Script|<Suspense|<ContactForm/.test(hgc))
  const leftover = ['en-GB', ...BASES, 'en-US', 'es-MX'].filter(l => { const c = JSON.parse(read(`messages/${l}.json`)).contactPage || {}; return 'loadingForm' in c || 'formTitle' in c })
  const leftoverBack = BASES.filter(l => { const b = JSON.parse(read(`docs/i18n/back/${l}.json`)); return 'contactPage.loadingForm' in b || 'contactPage.formTitle' in b })
  t('the Tally-only words ("Loading form…", the iframe\'s title) are gone from every language and back-translation', !leftover.length && !leftoverBack.length, { leftover, leftoverBack })

  // ══ 6 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head(`6 · Village Foodie: /contact byte-identical to ${BASE}; the venue and truck pages' sources unchanged`)
  if (!fs.existsSync(IDENTITY)) t('scripts/fixtures/contact-1-identity.json exists (captured at HEAD)', false)
  else {
    const want = JSON.parse(fs.readFileSync(IDENTITY, 'utf8'))
    const got = await vfViews(ctx)
    t(`the same ${Object.keys(want.pages).length} views`, JSON.stringify(Object.keys(got).sort()) === JSON.stringify(Object.keys(want.pages).sort()))
    for (const [k, w] of Object.entries(want.pages)) t(`${k} identical to ${want.commit} (HTML and metadata), the Tally embed still there`, JSON.stringify(got[k]) === JSON.stringify(w) && w.tally >= 2, { want: w, got: got[k] })
  }
  const esbuild = require(path.join(REPO, 'node_modules/esbuild'))
  for (const entry of ['app/venues/[slug]/page.tsx', 'app/trucks/[slug]/page.tsx']) {
    const r = await esbuild.build({ entryPoints: [path.join(REPO, entry)], bundle: true, write: false, metafile: true, platform: 'node', format: 'esm', jsx: 'automatic', logLevel: 'silent', alias: { '@': REPO }, packages: 'external', absWorkingDir: REPO, loader: { '.css': 'empty', '.svg': 'text', '.png': 'empty', '.jpg': 'empty' } })
    const files = Object.keys(r.metafile.inputs).filter(f => !f.includes('node_modules'))
    // ⚠️ RE-PINNED (tidy-1, 3 November 2026): the three files tidy-1 changed (the truck page's `tally`, the footer's `newsletter`, both
    // defaulting to Village Foodie's page) are exempt — scripts/tidy-1.cjs §1 proves the Village Foodie render byte-identical.
    const T1_FILES = ['components/Footer.tsx', 'app/trucks/[slug]/TruckClient.tsx', 'app/trucks/[slug]/page.tsx']
    // ⚠️ RE-PINNED (paperwork-1, 4 November 2026): lib/i18n/namespaces.ts gained `paperwork` in Manage's list (no page here reads it);
    // that one insertion is taken back by name (scripts/_lp-paperwork-1.cjs) and the rest must be byte-identical.
    const P1N = require('./_lp-paperwork-1.cjs')
    const now = f => (f === 'lib/i18n/namespaces.ts' ? P1N.namespacesAsBefore(read(f)) : read(f))
    const moved = files.filter(f => atBase(f) !== now(f) && !T1_FILES.includes(f))
    t(`${entry}: all ${files.length} source files it bundles are byte-identical to ${BASE} — so is every byte it serves`, files.length > 20 && moved.length === 0, moved)
  }
  // ⚠️ RE-PINNED (tidy-1): Footer and TruckClient changed later (tidy-1's `newsletter` / `tally`); their links did not.
  t('the contact links themselves are untouched (lib/contact-topics.ts, VenueClient, ContactForm; Footer and TruckClient keep every contactHref)', ['lib/contact-topics.ts', 'app/venues/[slug]/VenueClient.tsx', 'app/contact/ContactForm.tsx'].every(f => atBase(f) === read(f))
    && ['components/Footer.tsx', 'app/trucks/[slug]/TruckClient.tsx'].every(f => JSON.stringify(atBase(f).match(/contactHref\([^)]*\)/g)) === JSON.stringify(read(f).match(/contactHref\([^)]*\)/g))))

  // ══ 7 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('7 · the words — en-GB as agreed, 28 bases complete, translation-check')
  const EF = flat(EN)
  const AGREED = {
    formHeading: 'Or send us a message', 'form.topicLabel': 'What’s it about?', 'form.topics.question': 'A question about HatchGrab', 'form.topics.account': 'Help with my account', 'form.topics.other': 'Something else',
    'form.nameLabel': 'Your name', 'form.emailLabel': 'Email', 'form.businessLabel': 'Truck or business name', 'form.optional': '(optional)', 'form.businessPlaceholder': 'e.g. Pizza Kitchen', 'form.messageLabel': 'Your message',
    'form.send': 'Send message', 'form.privacyLine': 'We’ll use your details only to reply to you.', 'form.thanksTitle': 'Thanks — your message has arrived.', 'form.thanksBody': 'We’ll reply by email to the address you gave.',
    'form.errors.rateLimited': 'You’ve sent a few messages already — please try again later, or email us at {email}.', 'form.errors.failed': 'Something went wrong — please email us at {email}.',
  }
  const bad = Object.entries(AGREED).filter(([k, s]) => EF[k] !== s)
  t('en-GB: the brief\'s words exactly (typographic apostrophes, as the rest of en-GB)', !bad.length, bad)
  const FORM_KEYS = Object.keys(EF).filter(k => k === 'formHeading' || k.startsWith('form.'))
  t(`${FORM_KEYS.length} form keys`, FORM_KEYS.length === 30)
  t('English variants only where the wording truly differs: en-US none (its old "fill out the form" heading gone); es-MX three Mexican sentences', !('form' in (JSON.parse(read('messages/en-US.json')).contactPage || {})) && !('formHeading' in JSON.parse(read('messages/en-US.json')).contactPage)
    && JSON.stringify(Object.keys(flat(JSON.parse(read('messages/es-MX.json')).contactPage)).sort()) === JSON.stringify(['form.errors.failed', 'form.errors.rateLimited', 'form.thanksTitle']))
  t('28 language bases', BASES.length === 28)
  for (const l of BASES) {
    const W = flat(JSON.parse(read(`messages/${l}.json`)).contactPage)
    let out
    try { out = execFileSync('node', ['scripts/translation-check.cjs', '--locale', l, '--back', `docs/i18n/back/${l}.json`], { cwd: REPO }).toString() } catch (e) { out = String(e.stdout) }
    const missing = FORM_KEYS.filter(k => typeof W[k] !== 'string' || !W[k])
    t(`${l}: all ${FORM_KEYS.length} form keys ("${W.formHeading}"), structural 0, no flag on contactPage`, !missing.length && W.formHeading !== EF.formHeading && /\*\*Structural: 0\*\*/.test(out) && !out.includes('contactPage'), { missing, flags: out.split('\n').filter(x => /Structural|contactPage/.test(x)).join(' | ') })
  }
  t('admin text and the email to us stay English (35.an-20): the topic names in the email are the English ones', JSON.stringify(C.TOPIC_EN) === JSON.stringify({ question: 'A question about HatchGrab', account: 'Help with my account', other: 'Something else' }))

  // ══ 8 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('8 · the Privacy Policy, its dates, the retention job, the migration')
  const { PARA } = require('./_lp-contact-1.cjs')
  // ⚠️ RE-PINNED (tidy-1, 3 November 2026): tidy-1's later demo-section wording and date taken back first (scripts/_lp-tidy-1.cjs).
  const T1L = require('./_lp-tidy-1.cjs')
  const en = T1L.asBefore('content/legal/privacy-policy.md', read('content/legal/privacy-policy.md')), enBase = atBase('content/legal/privacy-policy.md')
  const rebuilt = enBase.replace('**Last updated:** 31 October 2026', '**Last updated:** 2 November 2026').replace('\n\n---\n\n## 6.', `\n\n${PARA}\n\n---\n\n## 6.`)
  t('the English edit is exactly: the date, and one paragraph at the end of section 5 (after the demo) — nothing else', en === rebuilt)
  t('…Brevo was already a listed processor (section 6), and "Support correspondence: 24 months" already in section 7', /\| Brevo \| Sending transactional email \| European Union \|/.test(enBase) && enBase.includes('- **Support correspondence:** 24 months.'))
  t('…the Privacy Policy named no Tally and no contact form before (so there was no Village Foodie Tally wording to keep)', !/tally|contact form/i.test(enBase))
  const legal = T1L.asBefore('lib/legal.ts', read('lib/legal.ts'))   // ⚠️ RE-PINNED (tidy-1): its later date and version taken back first
  t('PRIVACY_UPDATED \'2 November 2026\' and TERMS_VERSION \'2026-11-02\' (it moves with the latest document — lib/legal.ts)', /export const PRIVACY_UPDATED = '2 November 2026'/.test(legal) && /export const TERMS_VERSION = '2026-11-02'/.test(legal) && /export const TERMS_UPDATED = '1 November 2026'/.test(legal))
  const L = require('./_legal-translations.cjs')
  for (const l of BASES) {
    const tr = read(`content/legal/${l}/privacy-policy.md`)
    const sec5 = tr.slice(tr.indexOf('\n## 5.'), tr.indexOf('\n## 6.'))
    const probs = L.compare('privacy-policy.md', tr)
    const old = atBase(`content/legal/${l}/privacy-policy.md`)
    // ⚠️ RE-PINNED (tidy-1, 3 November 2026): the lines tidy-1 changed later (the demo section's two paragraphs, in every language) are
    // not contact-1's — they are the lines that differ from the same translation at 6c29c2e2, the commit before tidy-1.
    const beforeT1 = execFileSync('git', ['show', `6c29c2e2:content/legal/${l}/privacy-policy.md`], { cwd: REPO }).toString().split('\n')
    const added = tr.split('\n').slice(1).filter(x => !old.split('\n').includes(x) && beforeT1.includes(x)).join('\n')
    t(`${l}: re-stamped against the new English, the drift check clean, the paragraph (Brevo, 24) at the end of section 5 — the only change`, !probs.length && sec5.includes('Brevo') && /\b24\b/.test(sec5) && /\*\*[^*\n]+\*\*\n\n[^\n]+\n\n---$/.test(sec5.trimEnd()) && added.split('\n').filter(Boolean).length === 2, { probs, added: added.slice(0, 200) })
  }
  const ret = read('lib/order-retention.ts')
  const tables = {
    contact_messages: [{ id: 'old', created_at: new Date(NOW.getTime() - 25 * 30.5 * 86400e3).toISOString() }, { id: 'young', created_at: new Date(NOW.getTime() - 23 * 30.5 * 86400e3).toISOString() }],
    orders: [], order_drafts: [], whatsapp_logs: [], messages: [],
  }
  const writes = []
  const rr = await C.runOrderRetention(kit.fakeDb(tables, writes), NOW)
  t('the daily retention job deletes contact messages older than 24 months, and only those', C.CONTACT_RETENTION_MONTHS === 24 && rr.contactMessagesDeleted === 1 && JSON.stringify(writes.filter(w => w.table === 'contact_messages')) === JSON.stringify([{ table: 'contact_messages', op: 'delete', patch: null, ids: ['old'] }]), writes)
  t('…in /api/cron/order-retention (daily, 04:30 UTC)', /retentionCutoff\(now, CONTACT_RETENTION_MONTHS\)/.test(ret) && JSON.parse(read('vercel.json')).crons.some(c => c.path === '/api/cron/order-retention' && c.schedule === '30 4 * * *'))
  const sql = read('supabase/migrations/20261061_contact_1.sql')
  t('the migration: contact_messages with the agreed columns (+ email_attempts for the retry), RLS on, no policies, service role only', ['id', 'created_at', 'topic', 'name', 'email', 'business_name', 'message', 'country', 'locale', 'page_path', 'ip_hash', 'email_status', 'provider_message_id', 'email_attempts'].every(c => new RegExp(`\\n  ${c}\\s+\\w`).test(sql))
    && /enable row level security/.test(sql) && /revoke all on public\.contact_messages from anon, authenticated, public/.test(sql) && /grant all on public\.contact_messages to service_role/.test(sql) && !/create policy/i.test(sql) && !/\b(update|delete from|truncate)\b/i.test(sql.replace(/--.*$/gm, '')))

  // ══ 9 ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  head('9 · the language audit (scripts/legal-languages-1-audit.cjs, run by hand): no English on /contact')
  const summary = JSON.parse(read('docs/legal-languages-1/audit-summary.json'))
  const langs = Object.entries(summary.languages || {})
  const contactFindings = langs.flatMap(([l, r]) => [...(r.english || []), ...(r.wrongOnEnglish || [])].filter(x => /contact/i.test(x.id)).map(x => `${l} ${x.id}`))
  t(`the latest audit (${summary.generated}) covers all 28 languages, after this form was built`, langs.length === 28 && String(summary.generated) >= '2026-11-02')
  t('…and finds no English on any /contact view, and nothing excluded for the contact form', contactFindings.length === 0 && !JSON.stringify(summary.excludedRules || []).match(/contact|tally/i), contactFindings)

  console.log(`\ncontact-1: ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error(e); process.exit(1) })
