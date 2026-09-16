#!/usr/bin/env node
// scripts/whatsapp-connection-view-harness.cjs
//
// Proofs for what the WhatsApp Settings row shows (lib/whatsapp/connection-view.ts) and for the Graph
// response parser (lib/whatsapp/phone-profile.ts).
//   node scripts/whatsapp-connection-view-harness.cjs
//
// 🔴 THE SUITE TAKES BOTH FUNCTIONS AS ARGUMENTS, so the identical assertions run against the real code
// and against four deliberately broken variants, each of which MUST make it report FAILURE first.
// ⚠️ It compiles the TypeScript itself with the repo's own tsc — this repo has no test framework.

const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const REPO = path.resolve(__dirname, '..')
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-view-'))
execFileSync(path.join(REPO, 'node_modules/.bin/tsc'), [
  path.join(REPO, 'lib/whatsapp/connection-view.ts'),
  path.join(REPO, 'lib/whatsapp/phone-profile.ts'),
  '--module', 'commonjs', '--target', 'es2020', '--outDir', out, '--skipLibCheck',
], { stdio: 'pipe' })

const realView = require(path.join(out, 'connection-view.js')).whatsAppRowView
const realParse = require(path.join(out, 'phone-profile.js')).parsePhoneNumberProfile
const { fetchPhoneNumberProfile } = require(path.join(out, 'phone-profile.js'))

const STATES = ['not_connected', 'onboarding_incomplete', 'token_missing', 'awaiting_payment_method', 'revoked', 'ready']
const NUM = '+44 7700 900000'
const NAME = 'Pizzeria Gusto'

function runSuite({ view, parse }) {
  const ok = [], fails = []
  const t = (name, cond) => (cond ? ok : fails).push(name)

  // ── 🔴 NO NUMBER INPUT, IN ANY STATE, WITH OR WITHOUT VALUES ─────────────────────────────────────
  for (const state of STATES) {
    for (const [tag, num, name] of [['no values', null, null], ['both values', NUM, NAME],
                                    ['number only', NUM, null], ['name only', null, NAME]]) {
      const v = view({ state, displayPhoneNumber: num, verifiedName: name })
      t(`🔴 no number input: ${state} / ${tag}`, v.showNumberInput === false)
      t(`setup control offered: ${state} / ${tag}`, v.showSetupControl === true)
    }
  }

  // ── not_connected shows nothing about a number ───────────────────────────────────────────────────
  const nc = view({ state: 'not_connected', displayPhoneNumber: null, verifiedName: null })
  t('not_connected: no facts', nc.facts.length === 0)
  t('not_connected: does not say Connected', nc.showBareConnected === false)
  // 🔴 even if stale values somehow sat on the row, a disconnected state must not present them
  const ncStale = view({ state: 'not_connected', displayPhoneNumber: NUM, verifiedName: NAME })
  t('🔴 not_connected: stale stored values are NOT shown', ncStale.facts.length === 0)

  // ── a connection with both values ────────────────────────────────────────────────────────────────
  const both = view({ state: 'ready', displayPhoneNumber: NUM, verifiedName: NAME })
  t('ready + both: two facts', both.facts.length === 2)
  // ⚠️ OPTIONAL CHAINING THROUGHOUT. A broken variant that empties `facts` made this THROW, and a
  // harness that crashes on a variant has not "reported FAILURE" — it has fallen over. Every indexed
  // read below is null-safe so a wrong answer is recorded as a failed assertion, which is the point.
  t('ready + both: number first, labelled', both.facts[0]?.label === 'Connected number' && both.facts[0]?.value === NUM)
  t('ready + both: name second, labelled', both.facts[1]?.label === 'Business name' && both.facts[1]?.value === NAME)
  t('🔴 ready + both: does NOT also say the bare word Connected', both.showBareConnected === false)

  // ── 🔴 NOTHING IS INVENTED ───────────────────────────────────────────────────────────────────────
  const numOnly = view({ state: 'ready', displayPhoneNumber: NUM, verifiedName: null })
  t('🔴 ready + number only: exactly one fact', numOnly.facts.length === 1)
  t('🔴 ready + number only: no Business name row', !numOnly.facts.some(f => f.label === 'Business name'))
  const nameOnly = view({ state: 'ready', displayPhoneNumber: null, verifiedName: NAME })
  t('🔴 ready + name only: no Connected number row', !nameOnly.facts.some(f => f.label === 'Connected number'))
  t('🔴 no fact value is ever empty', [both, numOnly, nameOnly].every(v => v.facts.every(f => f.value.trim().length > 0)))
  const blanks = view({ state: 'ready', displayPhoneNumber: '   ', verifiedName: '' })
  t('🔴 whitespace/empty stored values are treated as absent', blanks.facts.length === 0)
  t('…and that falls back to the bare Connected, not a blank row', blanks.showBareConnected === true)

  // ── the bare "Connected" is only for a working connection ────────────────────────────────────────
  t('ready + nothing stored: says Connected',
    view({ state: 'ready', displayPhoneNumber: null, verifiedName: null }).showBareConnected === true)
  for (const state of ['onboarding_incomplete', 'token_missing', 'awaiting_payment_method', 'revoked']) {
    t(`🔴 ${state} + nothing stored: does NOT claim Connected`,
      view({ state, displayPhoneNumber: null, verifiedName: null }).showBareConnected === false)
  }
  // …but a broken connection still shows the number it is linked to
  const rev = view({ state: 'revoked', displayPhoneNumber: NUM, verifiedName: NAME })
  t('revoked still shows the linked number and name', rev.facts.length === 2)
  t('revoked does not claim Connected', rev.showBareConnected === false)

  // ── THE PARSER ───────────────────────────────────────────────────────────────────────────────────
  const full = parse({ display_phone_number: NUM, verified_name: NAME, id: '123' })
  t('parser: full response', full.displayPhoneNumber === NUM && full.verifiedName === NAME)
  t('parser: missing verified_name -> null',
    parse({ display_phone_number: NUM }).verifiedName === null)
  t('parser: missing display_phone_number -> null',
    parse({ verified_name: NAME }).displayPhoneNumber === null)
  t('parser: empty verified_name -> null (Meta sends "" before approval)',
    parse({ display_phone_number: NUM, verified_name: '' }).verifiedName === null)
  for (const [tag, input] of [['null', null], ['undefined', undefined], ['string', 'nope'],
                              ['number', 7], ['array', []], ['empty object', {}],
                              ['error envelope', { error: { message: 'x', code: 100 } }]]) {
    let r, threw = false
    try { r = parse(input) } catch { threw = true }
    t(`🔴 parser: ${tag} -> nulls, never throws`,
      !threw && r.displayPhoneNumber === null && r.verifiedName === null)
  }
  t('parser: non-string field types -> null',
    parse({ display_phone_number: 447700900000, verified_name: { a: 1 } }).displayPhoneNumber === null)

  return { ok, fails }
}

// ── BROKEN VARIANTS ─────────────────────────────────────────────────────────────────────────────────
const V1 = { parse: realParse, view: (i) => ({ ...realView(i), showNumberInput: i.state === 'not_connected' }) }
const V2 = { parse: realParse, view: (i) => {
  const v = realView(i); return i.state === 'ready' ? { ...v, facts: [] } : v } }
const V3 = { parse: realParse, view: (i) => {
  const v = realView(i)
  if (i.state !== 'not_connected' && !i.displayPhoneNumber) {
    return { ...v, facts: [{ label: 'Connected number', value: 'Not available' }, ...v.facts] }
  }
  return v } }
const V4 = { view: realView, parse: (p) => {
  if (p === null || typeof p !== 'object' || Array.isArray(p)) throw new TypeError('malformed')
  return realParse(p) } }

console.log('── BROKEN VARIANTS: each MUST report FAILURE ───────────────────────────────────────────')
let allFailed = true
for (const [name, impl] of [
  ['V1 the view still offers a number input when not connected', V1],
  ['V2 a ready connection with a stored number hides it', V2],
  ['V3 the view invents a number when the stored value is null', V3],
  ['V4 the parser throws on a malformed response', V4],
]) {
  const r = runSuite(impl)
  const detected = r.fails.length > 0
  if (!detected) allFailed = false
  console.log(`  ${detected ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${name}`)
  for (const f of r.fails.slice(0, 2)) console.log(`        caught: ${f}`)
  if (r.fails.length > 2) console.log(`        …and ${r.fails.length - 2} more`)
}
if (!allFailed) { console.log('\n🔴 A VARIANT PASSED. The harness is abandoned.'); process.exit(1) }

console.log('\n── THE REAL CODE ───────────────────────────────────────────────────────────────────────')
const r = runSuite({ view: realView, parse: realParse })
for (const n of r.ok) console.log('  ✓ ' + n)
for (const n of r.fails) console.log('  🔴 ' + n)

// ── 3c. A FAILED LOOKUP LEAVES ONBOARDING SUCCESSFUL ────────────────────────────────────────────────
// Driven with an INJECTED fetch, so the failure paths are real rather than imagined.
console.log('\n── 3c. FAILED LOOKUPS (injected fetch) ─────────────────────────────────────────────────')
const lookups = [
  ['network throw', async () => { throw new Error('ECONNREFUSED') }, 'network', null],
  ['401',           async () => ({ ok: false, status: 401 }),         'http',    401],
  ['404',           async () => ({ ok: false, status: 404 }),         'http',    404],
  ['500',           async () => ({ ok: false, status: 500 }),         'http',    500],
  ['2xx, bad JSON', async () => ({ ok: true, status: 200, json: async () => { throw new Error('bad') } }), 'http', 200],
  ['2xx, no fields',async () => ({ ok: true, status: 200, json: async () => ({}) }),                        null,  200],
  ['2xx, full',     async () => ({ ok: true, status: 200, json: async () => ({ display_phone_number: NUM, verified_name: NAME }) }), null, 200],
]
;(async () => {
  const extra = []
  for (const [tag, impl, wantFailure, wantStatus] of lookups) {
    let res, threw = false
    try {
      res = await fetchPhoneNumberProfile({ graphBase: 'https://graph.example/v21.0', phoneNumberId: 'PNID', accessToken: 'TOK', fetchImpl: impl })
    } catch { threw = true }
    const shaped = !threw && res && res.failure === wantFailure && res.status === wantStatus
    const nulled = !threw && res && (wantFailure === null || (res.profile.displayPhoneNumber === null && res.profile.verifiedName === null))
    console.log(`  ${shaped && nulled ? '✓' : '🔴'} ${tag.padEnd(14)} failure=${res && res.failure} status=${res && res.status} profile=${JSON.stringify(res && res.profile)}`)
    if (!(shaped && nulled)) extra.push(`lookup: ${tag}`)
    if (threw) extra.push(`🔴 lookup THREW for ${tag} — it must never throw`)
  }
  const fails = r.fails.concat(extra)
  console.log(`\n${fails.length ? '🔴 ' + fails.length + ' FAILED' : '✅ all ' + (r.ok.length + lookups.length) + ' passed'}`)
  fs.rmSync(out, { recursive: true, force: true })
  process.exit(fails.length ? 1 : 0)
})()
