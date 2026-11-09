// scripts/email-sender-1.cjs — email-sender-1 (9 November 2026, docs/email-sender-1-report.md): EVERY HATCHGRAB EMAIL IS SENT FROM
// hatchgrab.com, NEVER villagefoodie.co.uk. In the sweep (scripts/harnesses.json). Nothing reaches the network: the behavioural
// part sends through the real modules with `fetch` replaced by a recorder, and the API key is a dummy.
//
//   §1 THE PATHS      every tracked file that posts to Brevo's transactional API (app/, lib/, components/, the scraper, the
//                     competitor check, supabase/functions) is found by its endpoint, and at least the inventory's files are there.
//   §2 STATIC GUARD   in each path's code (comments stripped): no villagefoodie.co.uk address, no EMAIL_FROM_ADDRESS, no
//                     NEXT_PUBLIC_SUPPORT_EMAIL, no VILLAGE_FOODIE_SENDER; every `sender`/`replyTo` names an allowed address.
//   §3 THE CONFIG     lib/email-config.ts: HatchGrab's addresses are on hatchgrab.com; the old domain lives only in
//                     VILLAGE_FOODIE_SENDER; the stale "switch once hatchgrab.com is verified" TODO is gone.
//   §4 BEHAVIOUR      each lib sender, called with EMAIL_FROM_ADDRESS / NEXT_PUBLIC_SUPPORT_EMAIL set to villagefoodie.co.uk
//                     values (proving they are ignored): the From and Reply-To Brevo would have been given.
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS harness, like every scripts/*.cjs */
'use strict'
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')
const read = f => fs.readFileSync(path.join(REPO, f), 'utf8')

let pass = 0, fail = 0
const t = (name, ok, extra) => { if (ok) pass++; else fail++; console.log(`${ok ? '✅' : '🔴'} ${name}${!ok && extra ? `\n     ${extra}` : ''}`) }

/** Code without comments. Line comments only where `//` starts a line or follows whitespace, so a URL's `https://` survives. */
const code = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

// ── §1 THE PATHS ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const ENDPOINT = 'api.brevo.com/v3/smtp/email'
const tracked = execFileSync('git', ['ls-files', 'app', 'lib', 'components', 'supabase/functions', 'scripts/run-scraper.js', 'scripts/competitor-check'], { cwd: REPO, encoding: 'utf8' })
  .split('\n').filter(f => /\.(ts|tsx|js|mjs|cjs)$/.test(f) && fs.existsSync(path.join(REPO, f)))
const PATHS = tracked.filter(f => read(f).includes(ENDPOINT))
// The inventory (docs/email-sender-1-report.md §1): the files that post to Brevo themselves. lib/email.ts carries every order,
// operator-copy and admin-alert email that goes through sendConfirmationEmail / notifyCustomer.
const INVENTORY = [
  'app/api/account/request-deletion/route.ts', 'app/api/admin/create-operator/route.ts', 'app/api/auth/change-email/route.ts',
  'app/api/auth/forgot-password/route.ts', 'app/api/auth/resend-verification/route.ts', 'app/api/cron/account-deletion-due/route.ts',
  'app/api/cron/demo-cleanup/route.ts', 'app/api/demo/build-request/route.ts', 'app/api/demo/save-email/route.ts', 'app/api/manage/route.ts',
  'lib/contact-server.ts', 'lib/demo-link-email.ts', 'lib/email-signup.ts', 'lib/email.ts', 'lib/paperwork/email.ts', 'lib/reviews/email.ts',
  'scripts/run-scraper.js',
]
console.log(`\n── §1 the Brevo send paths: ${PATHS.length} files ──`)
t('§1 every inventoried send path is found by its endpoint', INVENTORY.every(f => PATHS.includes(f)), INVENTORY.filter(f => !PATHS.includes(f)).join(', '))
const extra = PATHS.filter(f => !INVENTORY.includes(f))
if (extra.length) console.log(`   ℹ️  new send paths since the inventory (guarded below all the same): ${extra.join(', ')}`)
t('§1 no Supabase function posts to Brevo', !PATHS.some(f => f.startsWith('supabase/')))

// ── §2 THE STATIC GUARD ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// What a `sender` / `replyTo` may name. The first group are HatchGrab's own (lib/email-config.ts); the second are the person the
// mail is about: a truck's own contact email (review requests, paperwork shares — `m.replyTo` / `p.replyTo`) and the visitor
// who wrote the contact form (`mail.replyTo`, `row.email`).
const ALLOWED = new Set([
  'HATCHGRAB_SENDER.email', 'HATCHGRAB_SENDER.replyTo', 'HATCHGRAB_NOREPLY', 'HATCHGRAB_HELLO', 'HATCHGRAB_REPLY_TO', 'FROM_ADDRESS',
  "'hello@hatchgrab.com'",
  'm.replyTo', 'p.replyTo', 'mail.replyTo', 'row.email',
])
console.log('\n── §2 static guard ──')
for (const f of PATHS) {
  const c = code(read(f))
  const bad = []
  if (/@villagefoodie\.co\.uk/i.test(c)) bad.push('a villagefoodie.co.uk address')
  if (/EMAIL_FROM_ADDRESS/.test(c)) bad.push('EMAIL_FROM_ADDRESS')
  if (/NEXT_PUBLIC_SUPPORT_EMAIL[^\n]*(sender|replyTo)|(sender|replyTo)[^\n]*NEXT_PUBLIC_SUPPORT_EMAIL/.test(c)) bad.push('NEXT_PUBLIC_SUPPORT_EMAIL as a sender')
  if (/VILLAGE_FOODIE_SENDER/.test(c)) bad.push('VILLAGE_FOODIE_SENDER')
  // Every sender / replyTo value. A line that spreads brevoFrom(…) is the shared helper, checked in §3 and §4.
  const named = []
  for (const m of c.matchAll(/\b(sender|replyTo)\??\s*:\s*([^\n]*)/g)) {
    const v = m[2]
    if (/^(string|\{\s*email:\s*string)/.test(v)) continue                           // a type, not a value
    const emails = [...v.matchAll(/email:\s*([A-Za-z_][\w.]*|'[^']*')/g)].map(x => x[1])
    if (!emails.length) { const bare = v.match(/^([A-Za-z_][\w.]*|'[^']*')/); if (bare) emails.push(bare[1]) }
    if (!emails.length) bad.push(`${m[1]}: ${v.slice(0, 70)} (no address it could be checked by)`)
    for (const e of emails) { named.push(e); if (!ALLOWED.has(e)) bad.push(`${m[1]} → ${e}`) }
  }
  t(`§2 ${f}: every sender / reply-to is a hatchgrab.com address or the person the mail is about (${named.length} named)`, !bad.length, bad.join('; '))
}
// No HatchGrab file sends with the Village Foodie sender: its one definition is lib/email-config.ts, and no code imports it.
const vfUsers = tracked.filter(f => f !== 'lib/email-config.ts' && /VILLAGE_FOODIE_SENDER/.test(code(read(f))))
t('§2 VILLAGE_FOODIE_SENDER is used by no file (no Village Foodie consumer email is sent today)', !vfUsers.length, vfUsers.join(', '))
// The two senders inside lib/email.ts are the shared helper, and nothing else there names a From.
const libEmail = code(read('lib/email.ts'))
t('§2 lib/email.ts: both Brevo calls take their From from brevoFrom(…)', (libEmail.match(/\.\.\.brevoFrom\(/g) || []).length === 2 && (libEmail.match(new RegExp(ENDPOINT.replace(/\./g, '\\.'), 'g')) || []).length === 2)

// ── §3 THE CONFIG ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n── §3 lib/email-config.ts ──')
const cfg = read('lib/email-config.ts'), cfgCode = code(cfg)
const block = name => { const i = cfgCode.indexOf(name); return i < 0 ? '' : cfgCode.slice(i, cfgCode.indexOf('\n}', i) + 2) }
t("§3 HATCHGRAB_HELLO = 'hello@hatchgrab.com', HATCHGRAB_NOREPLY = 'donotreply@hatchgrab.com'", /export const HATCHGRAB_HELLO = 'hello@hatchgrab\.com'/.test(cfgCode) && /export const HATCHGRAB_NOREPLY = 'donotreply@hatchgrab\.com'/.test(cfgCode))
t('§3 HATCHGRAB_SENDER: email and replyTo are HATCHGRAB_HELLO', /email: HATCHGRAB_HELLO,\s*replyTo: HATCHGRAB_HELLO,/.test(block('export const HATCHGRAB_SENDER')))
t('§3 truckSender: donotreply@hatchgrab.com, reply-to hello@hatchgrab.com', /email: HATCHGRAB_NOREPLY,\s*replyTo: HATCHGRAB_HELLO,/.test(block('export function truckSender')))
const outsideVF = cfgCode.replace(block('export const VILLAGE_FOODIE_SENDER'), '')
t('§3 the only villagefoodie.co.uk addresses in the file are VILLAGE_FOODIE_SENDER\'s', !/@villagefoodie\.co\.uk/.test(outsideVF) && /@villagefoodie\.co\.uk/.test(block('export const VILLAGE_FOODIE_SENDER')))
t('§3 the stale TODO (switch to hello@hatchgrab.com once verified in Brevo) is gone', !/TODO/.test(cfg) && !/acceptable for trial/i.test(cfg))
t('§3 lib/email-signup.ts: the From is HATCHGRAB_SENDER, not env', /const FROM_ADDRESS = HATCHGRAB_SENDER\.email/.test(read('lib/email-signup.ts')))

// ── §4 BEHAVIOUR ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
;(async () => {
  console.log('\n── §4 behaviour: what Brevo would be given ──')
  process.env.BREVO_API_KEY = 'harness-dummy-key'
  process.env.EMAIL_FROM_ADDRESS = 'donotreply@villagefoodie.co.uk'      // set to the old domain on purpose: they must be ignored
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL = 'hello@villagefoodie.co.uk'
  const sent = []
  const recorder = async (url, init) => { sent.push({ url: String(url), body: JSON.parse(init.body) }); return new Response('{"messageId":"<h@x>"}', { status: 201 }) }
  globalThis.fetch = recorder
  const kit = require('./_render-kit.cjs')({ cacheTag: 'email-sender-1' })
  const B = await kit.bundle('email-sender-1', [
    "export * as E from '@/lib/email'", "export * as S from '@/lib/email-signup'", "export * as R from '@/lib/reviews/email'",
    "export * as P from '@/lib/paperwork/email'", "export * as D from '@/lib/demo-link-email'", "export * as C from '@/lib/contact-server'",
    "export * as CFG from '@/lib/email-config'", "export { LEGACY_UK_TIME_SETTINGS as TIME } from '@/lib/time-utils'",
  ].join('\n'))
  const quiet = async fn => { const q = [console.log, console.warn, console.error]; console.log = console.warn = console.error = () => {}; try { return await fn() } finally { [console.log, console.warn, console.error] = q } }
  const one = async (label, fn, want) => {
    const n = sent.length
    await quiet(fn)
    const got = sent.slice(n)
    const b = got[0] && got[0].body
    const ok = got.length === 1 && got[0].url.includes(ENDPOINT) && b.sender.email === want.from && b.sender.name === want.name
      && JSON.stringify(b.replyTo ?? null) === JSON.stringify(want.replyTo ?? null)
    t(`§4 ${label}: From "${want.name}" <${want.from}>, Reply-To ${want.replyTo ? want.replyTo.email : '(none)'}`, ok, b ? JSON.stringify({ sender: b.sender, replyTo: b.replyTo ?? null }) : `${got.length} sends`)
    return b
  }
  const HELLO = 'hello@hatchgrab.com', NOREPLY = 'donotreply@hatchgrab.com', TO = 'harness@example.invalid', TIME = B.TIME
  const mail = { to: TO, subject: 's', html: '<p>h</p>', text: 't' }
  await one('order confirmation to a customer (sendConfirmationEmail, truckName)', () => B.E.sendConfirmationEmail({ ...mail, truckName: 'Harness Truck' }), { name: 'Harness Truck', from: NOREPLY })
  await one('ready / slot-moved to a customer (sendConfirmationEmail, senderName = the truck)', () => B.E.sendConfirmationEmail({ ...mail, senderName: 'Harness Truck' }), { name: 'Harness Truck', from: NOREPLY })
  await one('new-order copy to the operator (sendConfirmationEmail, senderName HatchGrab)', () => B.E.sendConfirmationEmail({ ...mail, truckName: 'Harness Truck', senderName: 'HatchGrab' }), { name: 'HatchGrab', from: HELLO, replyTo: { email: HELLO } })
  await one('admin alert (sendConfirmationEmail, no name)', () => B.E.sendConfirmationEmail(mail), { name: 'HatchGrab', from: HELLO, replyTo: { email: HELLO } })
  await one('reject / cancel notice to a customer (notifyCustomer)', () => B.E.notifyCustomer({ id: '00000000-0000-4000-8000-000000000001', name: 'Harness Truck' }, TO, 's', '<p>h</p>'), { name: 'Harness Truck', from: NOREPLY })
  await one('signup verification (sendSignupVerificationEmail)', () => B.S.sendSignupVerificationEmail({ to: TO, firstName: 'Ana', truckName: 'Harness Truck', verifyUrl: 'https://www.hatchgrab.com/v', locale: 'fr-FR' }), { name: 'HatchGrab', from: HELLO, replyTo: { email: HELLO } })
  await one('operator welcome (sendOperatorWelcomeEmail)', () => B.S.sendOperatorWelcomeEmail({ to: TO, firstName: 'Ana', truckName: 'Harness Truck', manageUrl: 'https://www.hatchgrab.com/m', locale: 'fr-FR' }), { name: 'HatchGrab', from: HELLO, replyTo: { email: HELLO } })
  await one('demo link (sendDemoLinkEmail)', () => B.D.sendDemoLinkEmail({ to: TO, slug: 'demo-x', expiresAt: null, locale: 'fr-FR', time: null, base: 'https://www.hatchgrab.com' }), { name: 'HatchGrab', from: HELLO, replyTo: { email: HELLO } })
  const rv = { to: TO, truckName: 'Harness Truck', subject: 's', html: '<p>h</p>', text: 't', unsubscribeUrl: 'https://www.hatchgrab.com/u' }
  await one('review request, truck has an address (sendReviewEmail)', () => B.R.sendReviewEmail({ ...rv, replyTo: 'truck@example.invalid' }, recorder), { name: 'Harness Truck via HatchGrab', from: NOREPLY, replyTo: { email: 'truck@example.invalid', name: 'Harness Truck' } })
  await one('review request, no truck address (sendReviewEmail)', () => B.R.sendReviewEmail({ ...rv, replyTo: null }, recorder), { name: 'Harness Truck via HatchGrab', from: NOREPLY, replyTo: { email: HELLO } })
  const share = { to: TO, truckName: 'Harness Truck', locale: 'en-GB', time: TIME, docs: [{ name: 'Insurance', expiresOn: null, dateLabel: 'expires' }], message: null, eventName: null, url: 'https://www.hatchgrab.com/p', until: '2026-12-01' }
  await one('paperwork share, truck has an address (sendShareEmail)', () => B.P.sendShareEmail({ ...share, replyTo: 'truck@example.invalid' }, recorder), { name: 'Harness Truck via HatchGrab', from: NOREPLY, replyTo: { email: 'truck@example.invalid', name: 'Harness Truck' } })
  await one('paperwork share, no truck address (sendShareEmail)', () => B.P.sendShareEmail({ ...share, replyTo: null }, recorder), { name: 'Harness Truck via HatchGrab', from: NOREPLY, replyTo: { email: HELLO } })
  await one('paperwork reminder to the operator (sendReminderEmail)', () => B.P.sendReminderEmail({ to: TO, truckName: 'Harness Truck', locale: 'en-GB', time: TIME, today: '2026-11-09', docs: [{ name: 'Insurance', expiresOn: '2026-11-20', dateLabel: 'expires', stage: 'soon' }], url: 'https://www.hatchgrab.com/m' }, recorder), { name: 'HatchGrab', from: HELLO, replyTo: { email: HELLO } })
  await one('contact form to support (brevoSend; Reply-To the visitor)', () => B.C.brevoSend({ to: HELLO, replyTo: 'visitor@example.invalid', subject: 's', text: 't', html: '<p>h</p>' }, recorder), { name: 'HatchGrab', from: HELLO, replyTo: { email: 'visitor@example.invalid' } })
  t('§4 no send went anywhere but the recorder, and none named villagefoodie.co.uk', sent.every(s => s.url.includes(ENDPOINT)) && !sent.some(s => /villagefoodie/i.test(JSON.stringify({ a: s.body.sender, b: s.body.replyTo }))))
  t('§4 brevoFrom: HatchGrab → hello@ (+ Reply-To), any other name → donotreply@ (no Reply-To)',
    JSON.stringify(B.CFG.brevoFrom('HatchGrab')) === JSON.stringify({ sender: { name: 'HatchGrab', email: HELLO }, replyTo: { email: HELLO } })
    && JSON.stringify(B.CFG.brevoFrom('Pizzeria X')) === JSON.stringify({ sender: { name: 'Pizzeria X', email: NOREPLY } }))

  console.log(`\n${fail ? '🔴' : '✅'} email-sender-1: ${pass}/${pass + fail} passed`)
  process.exit(fail ? 1 : 0)
})().catch(e => { console.error('🔴 email-sender-1 crashed:', e); process.exit(1) })
