#!/usr/bin/env node
// scripts/whatsapp-background-jobs-harness.cjs
//
// Proofs for the WhatsApp background jobs:
//   lib/whatsapp/meta-admin.ts    the three Meta calls (parsers + never-throwing fetchers)
//   lib/whatsapp/maintenance.ts   the daily job's decisions
//   lib/whatsapp/alerts.ts        claim → send → release-on-failure
//   lib/whatsapp/usage.ts         the 80% / 100% threshold rule
//
//   node scripts/whatsapp-background-jobs-harness.cjs
//
// 🔴 THE SUITE TAKES EVERY FUNCTION AS AN ARGUMENT, so the identical assertions run against the real
// code and against EIGHT deliberately broken variants, each of which MUST make it report FAILURE first.
// A variant that passes means the assertions are decorative, and the harness says so and exits 1.
// ⚠️ It compiles the TypeScript itself with the repo's own tsc — this repo has no test framework. A temp
// tsconfig supplies `baseUrl`/`paths` because these modules import through the `@/lib/...` alias.

const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const REPO = path.resolve(__dirname, '..')
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-bg-'))
const cfg = path.join(out, 'tsconfig.json')
fs.writeFileSync(cfg, JSON.stringify({
  compilerOptions: {
    module: 'commonjs', target: 'es2020', outDir: out, skipLibCheck: true,
    esModuleInterop: true, moduleResolution: 'node',
    baseUrl: REPO, paths: { '@/*': ['./*'] },
    // 🔴 EXPLICIT rootDir. Without it tsc infers the common root from whatever the imports pull in, so
    // the output layout shifts when an import is added and the requires below break for no visible reason.
    rootDir: REPO,
  },
  files: [
    'lib/whatsapp/meta-admin.ts', 'lib/whatsapp/maintenance.ts',
    'lib/whatsapp/alerts.ts', 'lib/whatsapp/alert-copy.ts', 'lib/whatsapp/usage.ts',
  ].map(f => path.join(REPO, f)),
}))
execFileSync(path.join(REPO, 'node_modules/.bin/tsc'), ['-p', cfg], { stdio: 'pipe' })

// 🔴 tsc RESOLVES THE `@/` ALIAS FOR TYPE-CHECKING BUT LEAVES IT IN THE EMITTED require() CALLS.
// Node has no idea what `@/lib/whatsapp/graph-version` means, so the alias is mapped here, to the
// compiled tree. Without this the harness cannot load the very code it is meant to prove.
const Module = require('module')
const realResolve = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith('@/')) return realResolve.call(this, path.join(out, request.slice(2)), ...rest)
  return realResolve.call(this, request, ...rest)
}

const M = require(path.join(out, 'lib/whatsapp/meta-admin.js'))
const MAINT = require(path.join(out, 'lib/whatsapp/maintenance.js'))
const AL = require(path.join(out, 'lib/whatsapp/alerts.js'))
const USAGE = require(path.join(out, 'lib/whatsapp/usage.js'))

const REAL = {
  refreshBusinessToken: M.refreshBusinessToken,
  inspectBusinessToken: M.inspectBusinessToken,
  readPaymentStatus: M.readPaymentStatus,
  planTokenWork: MAINT.planTokenWork,
  sendWhatsAppAlert: AL.sendWhatsAppAlert,
  usageAlertDue: USAGE.usageAlertDue,
}

const NOW = new Date('2026-09-16T03:00:00Z')
const TOKEN = 'EAA-super-secret-token-value'
const APP = { appId: '123', appSecret: 'shhh' }

/** A fetch stub that also records every URL it was called with, so V8 can inspect them. */
function stubFetch(responder) {
  const calls = []
  const f = async (url, init) => { calls.push({ url: String(url), init }); return responder(url, init) }
  f.calls = calls
  return f
}
const json = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })

// ════════════════════════════════════════════════════════════════════════════════════════════════════
async function runSuite(fn) {
  const ok = [], fails = []
  const t = (name, cond) => (cond ? ok : fails).push(name)

  // ── 2a. REFRESH ───────────────────────────────────────────────────────────────────────────────────
  {
    const r = await fn.refreshBusinessToken({ ...APP, currentToken: TOKEN, fetchImpl: json(200, { access_token: 'NEW', expires_in: 5184000 }) })
    t('refresh: success returns the new token', r.ok === true && r.accessToken === 'NEW')
    t('refresh: success carries expires_in', r.ok === true && r.expiresIn === 5184000)
  }
  {
    // 🔴 A 200 WITH NO TOKEN IS A FAILURE, not a success with an empty string. An empty token written
    // back to the row would disconnect the truck while reporting that it had been refreshed.
    const r = await fn.refreshBusinessToken({ ...APP, currentToken: TOKEN, fetchImpl: json(200, { expires_in: 100 }) })
    t('🔴 refresh: 200 with no access_token is NOT ok', r.ok === false)
  }
  {
    const r = await fn.refreshBusinessToken({ ...APP, currentToken: TOKEN, fetchImpl: json(400, { error: { code: 190, error_subcode: 463, message: `token ${TOKEN} expired` } }) })
    t('refresh: an error returns Meta\'s code', r.ok === false && r.code === 190 && r.subcode === 463)
    // 🔴 THE MESSAGE IS DISCARDED, and on this endpoint the message can echo the token.
    t('🔴 refresh: no message field is returned at all', r.ok === false && !('message' in r))
    t('🔴 refresh: the result carries no token anywhere', !JSON.stringify(r).includes(TOKEN))
  }
  {
    const r = await fn.refreshBusinessToken({ ...APP, currentToken: TOKEN, fetchImpl: async () => { throw new Error('ECONNREFUSED') } })
    t('🔴 refresh: a network throw becomes a result, never an exception', r.ok === false && r.reason === 'network')
  }
  {
    const f = stubFetch(json(200, { access_token: 'NEW' }))
    const r = await fn.refreshBusinessToken({ ...APP, currentToken: TOKEN, fetchImpl: f })
    t('refresh: absent expires_in is null, not a fabricated 60 days', r.ok === true && r.expiresIn === null)
    t('refresh: asks Meta for a 60-day token', f.calls[0].url.includes('set_token_expires_in_60_days=true'))
    t('refresh: uses grant_type=fb_exchange_token', f.calls[0].url.includes('grant_type=fb_exchange_token'))
  }

  // ── 2b. INSPECT ───────────────────────────────────────────────────────────────────────────────────
  {
    const f = stubFetch(json(200, { data: { is_valid: true, expires_at: 1790000000, scopes: ['whatsapp_business_messaging'] } }))
    const r = await fn.inspectBusinessToken({ ...APP, token: TOKEN, fetchImpl: f })
    t('inspect: reads is_valid / expires_at / scopes', r.ok === true && r.inspection.isValid === true && r.inspection.expiresAt === 1790000000)
    // 🔴 THE APP ACCESS TOKEN AUTHORISES THIS, NOT THE BUSINESS TOKEN. A system-user token cannot
    // inspect itself, and using it would read a healthy connection as invalid.
    const auth = f.calls[0].init && f.calls[0].init.headers && f.calls[0].init.headers.Authorization
    t('🔴 inspect: authorised with the APP access token (id|secret)', auth === `Bearer ${APP.appId}|${APP.appSecret}`)
  }
  {
    const r = await fn.inspectBusinessToken({ ...APP, token: TOKEN, fetchImpl: json(200, { data: { is_valid: false } }) })
    t('inspect: is_valid false is reported as invalid', r.ok === true && r.inspection.isValid === false)
  }
  {
    // 🔴 A 200 WE CANNOT READ IS NOT "INVALID". Returning isValid:false here would let one shape change
    // at Meta revoke every connection in the table on a single nightly run.
    const r = await fn.inspectBusinessToken({ ...APP, token: TOKEN, fetchImpl: json(200, { nonsense: true }) })
    t('🔴 inspect: an unreadable 200 is an ERROR, never isValid:false', r.ok === false && r.reason === 'malformed')
  }
  {
    const r = await fn.inspectBusinessToken({ ...APP, token: TOKEN, fetchImpl: async () => { throw new Error('boom') } })
    t('🔴 inspect: a network throw becomes a result', r.ok === false && r.reason === 'network')
  }

  // ── 2c. PAYMENT STATUS ────────────────────────────────────────────────────────────────────────────
  {
    const FUND = 'FUNDING-ID-9999'
    const r = await fn.readPaymentStatus({ wabaId: 'W1', businessToken: TOKEN, fetchImpl: json(200, { primary_funding_id: FUND }) })
    t('payment: a funding id means added', r.status === 'added')
    // 🔴 THE FUNDING ID IS NEVER RETURNED. It identifies the operator's payment instrument and this
    // codebase has no reason to hold it.
    t('🔴 payment: the funding id is NOT in the result', !JSON.stringify(r).includes(FUND))
  }
  {
    const r = await fn.readPaymentStatus({ wabaId: 'W1', businessToken: TOKEN, fetchImpl: json(200, {}) })
    t('payment: no funding id means missing', r.status === 'missing')
  }
  {
    // 🔴 AN ERROR IS NOT "missing". Writing payment_method_present=false on a network blip puts a claim
    // about the operator's account on their Settings page that we never verified.
    const r = await fn.readPaymentStatus({ wabaId: 'W1', businessToken: TOKEN, fetchImpl: json(500, { error: { code: 1 } }) })
    t('🔴 payment: an HTTP error is "error", NOT "missing"', r.status === 'error')
    const n = await fn.readPaymentStatus({ wabaId: 'W1', businessToken: TOKEN, fetchImpl: async () => { throw new Error('x') } })
    t('🔴 payment: a network throw is "error", NOT "missing"', n.status === 'error')
  }

  // ── 6. THE DAILY PLAN ─────────────────────────────────────────────────────────────────────────────
  const insp = (o) => Object.assign({ isValid: true, expiresAt: null, scopes: [] }, o)
  {
    const p = fn.planTokenWork({ inspection: null, autoRefreshEnabled: true, expiresAt: '2026-09-20T00:00:00Z', now: NOW })
    // 🔴 AN INSPECTION WE COULD NOT PERFORM IS NOT AN INVALID TOKEN.
    t('🔴 plan: a failed inspection revokes nothing and alerts nobody', p.refresh === false && p.markRevoked === false && p.alert === null)
  }
  {
    const p = fn.planTokenWork({ inspection: insp({ isValid: false }), autoRefreshEnabled: true, expiresAt: null, now: NOW })
    t('plan: an invalid token is marked revoked and alerts', p.markRevoked === true && p.alert === 'token_invalid')
    t('🔴 plan: an invalid token is NOT sent for refresh', p.refresh === false)
  }
  {
    // 🔴 ZERO IS META'S "NEVER EXPIRES" SENTINEL, NOT 1970. Reading it as a date refreshes a permanent
    // token every night forever.
    const p = fn.planTokenWork({ inspection: insp({ expiresAt: 0 }), autoRefreshEnabled: true, expiresAt: null, now: NOW })
    t('🔴 plan: expires_at 0 means NEVER EXPIRES — no refresh', p.refresh === false && p.markRevoked === false)
  }
  {
    const soon = Math.floor(NOW.getTime() / 1000) + 10 * 86400
    const on = fn.planTokenWork({ inspection: insp({ expiresAt: soon }), autoRefreshEnabled: true, expiresAt: null, now: NOW })
    const off = fn.planTokenWork({ inspection: insp({ expiresAt: soon }), autoRefreshEnabled: false, expiresAt: null, now: NOW })
    t('plan: a token with 10 days left is refreshed when the flag is on', on.refresh === true)
    t('🔴 plan: the SAME token is NOT refreshed when the flag is off', off.refresh === false)
    const far = Math.floor(NOW.getTime() / 1000) + 50 * 86400
    t('plan: a token with 50 days left is left alone', fn.planTokenWork({ inspection: insp({ expiresAt: far }), autoRefreshEnabled: true, expiresAt: null, now: NOW }).refresh === false)
  }

  // ── 4. CLAIM → SEND → RELEASE ─────────────────────────────────────────────────────────────────────
  const makeStore = (claimResults) => {
    const state = { claims: [], releases: [], i: 0 }
    return {
      state,
      store: {
        async claim(truckId, kind, periodKey) { state.claims.push(`${truckId}|${kind}|${periodKey}`); return claimResults[state.i++] },
        async release(truckId, kind, periodKey) { state.releases.push(`${truckId}|${kind}|${periodKey}`) },
      },
    }
  }
  const EMAIL = { subject: 's', html: 'h', text: 't' }
  {
    const { store, state } = makeStore([true])
    const sent = []
    const r = await fn.sendWhatsAppAlert({ store, kind: 'limit_80', truckId: 'gusto', periodKey: '2026-09', to: 'a@b.c', email: EMAIL, sendImpl: async p => { sent.push(p); return true } })
    t('alert: the claim winner sends', r === 'sent' && sent.length === 1)
    t('🔴 alert: the row is claimed BEFORE the send', state.claims.length === 1)
    t('alert: a successful send releases nothing', state.releases.length === 0)
  }
  {
    // 🔴 THE LOSER OF THE CLAIM SENDS NOTHING. This is the whole point of inserting first.
    const { store } = makeStore([false])
    const sent = []
    const r = await fn.sendWhatsAppAlert({ store, kind: 'limit_80', truckId: 'gusto', periodKey: '2026-09', to: 'a@b.c', email: EMAIL, sendImpl: async p => { sent.push(p); return true } })
    t('🔴 alert: a lost claim sends NOTHING', r === 'duplicate' && sent.length === 0)
  }
  {
    // 🔴 A FAILED SEND MUST RELEASE THE CLAIM, or the alert is marked delivered forever having never
    // been delivered once — a permanent silence on the email that matters most.
    const { store, state } = makeStore([true])
    const r = await fn.sendWhatsAppAlert({ store, kind: 'limit_100', truckId: 'gusto', periodKey: '2026-09', to: 'a@b.c', email: EMAIL, sendImpl: async () => false })
    t('🔴 alert: a failed send RELEASES the claim', r === 'send_failed' && state.releases.length === 1)
    t('alert: the released key matches the claimed key', state.releases[0] === state.claims[0])
  }
  {
    const { store, state } = makeStore([true])
    const r = await fn.sendWhatsAppAlert({ store, kind: 'limit_100', truckId: 'gusto', periodKey: '2026-09', to: 'a@b.c', email: EMAIL, sendImpl: async () => { throw new Error('brevo down') } })
    t('🔴 alert: a THROWN sender still releases and never propagates', r === 'send_failed' && state.releases.length === 1)
  }

  // ── 5b. THE ALLOWANCE THRESHOLDS ──────────────────────────────────────────────────────────────────
  {
    t('usage: below 80% is silent', fn.usageAlertDue(799, 1000) === null)
    t('usage: exactly 80% warns', fn.usageAlertDue(800, 1000) === 'limit_80')
    // 🔴 "AT OR PAST THE LINE", NOT "EXACTLY ON IT". A strict-equality test misses every count that
    // jumps the line — which is what happens when the operator LOWERS their limit mid-month.
    t('🔴 usage: 81% still warns (not just the exact boundary)', fn.usageAlertDue(810, 1000) === 'limit_80')
    t('usage: at the limit reports 100', fn.usageAlertDue(1000, 1000) === 'limit_100')
    t('🔴 usage: past the limit reports 100, not 80', fn.usageAlertDue(1400, 1000) === 'limit_100')
    t('🔴 usage: a limit lowered below current usage reports 100', fn.usageAlertDue(900, 250) === 'limit_100')
    t('usage: a zero limit warns about nothing', fn.usageAlertDue(5, 0) === null)
  }

  return { ok, fails }
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// THE EIGHT BROKEN VARIANTS
// ════════════════════════════════════════════════════════════════════════════════════════════════════
const V = {}
// V1 — a 200 with no access_token is accepted as a successful refresh.
V.V1 = { ...REAL, refreshBusinessToken: async (i) => {
  const r = await REAL.refreshBusinessToken(i)
  if (!r.ok && r.reason === 'no_token') return { ok: true, accessToken: '', expiresIn: null }
  return r } }
// V2 — an unreadable 200 from debug_token is treated as "this token is invalid".
V.V2 = { ...REAL, inspectBusinessToken: async (i) => {
  const r = await REAL.inspectBusinessToken(i)
  if (!r.ok && r.reason === 'malformed') return { ok: true, inspection: { isValid: false, expiresAt: null, scopes: [] } }
  return r } }
// V3 — a failed payment lookup is recorded as "no payment method".
V.V3 = { ...REAL, readPaymentStatus: async (i) => {
  const r = await REAL.readPaymentStatus(i)
  return r.status === 'error' ? { status: 'missing' } : r } }
// V4 — sends first and claims afterwards (the check-then-act race).
V.V4 = { ...REAL, sendWhatsAppAlert: async (a) => {
  const send = a.sendImpl
  let okSend = false
  try { okSend = await send({ to: a.to, subject: a.email.subject, html: a.email.html, text: a.email.text }) } catch { okSend = false }
  const claimed = await a.store.claim(a.truckId, a.kind, a.periodKey)
  if (!claimed) return 'duplicate'
  return okSend ? 'sent' : 'send_failed' } }
// V5 — a failed send keeps the claim, silencing the alert permanently.
V.V5 = { ...REAL, sendWhatsAppAlert: async (a) => {
  const claimed = await a.store.claim(a.truckId, a.kind, a.periodKey)
  if (!claimed) return 'duplicate'
  let okSend = false
  try { okSend = await a.sendImpl({ to: a.to, subject: a.email.subject, html: a.email.html, text: a.email.text }) } catch { okSend = false }
  return okSend ? 'sent' : 'send_failed' } }
// V6 — expires_at 0 is read as a 1970 date, so a permanent token is refreshed every night.
V.V6 = { ...REAL, planTokenWork: (i) => {
  if (i.inspection && i.inspection.isValid && i.inspection.expiresAt === 0) {
    return { refresh: i.autoRefreshEnabled, markRevoked: false, alert: null }
  }
  return REAL.planTokenWork(i) } }
// V7 — the threshold is an exact-crossing test, so any jump past the line is missed.
V.V7 = { ...REAL, usageAlertDue: (n, limit) => {
  if (!Number.isFinite(limit) || limit <= 0) return null
  if (n === limit) return 'limit_100'
  if (n === Math.ceil(limit * 0.8)) return 'limit_80'
  return null } }
// V8 — a failed inspection is treated as an invalid token (the fleet-wide revocation).
V.V8 = { ...REAL, planTokenWork: (i) => {
  if (!i.inspection) return { refresh: false, markRevoked: true, alert: 'token_invalid' }
  return REAL.planTokenWork(i) } }

const NAMES = {
  V1: 'a 200 with no access_token counts as a successful refresh',
  V2: 'an unreadable debug_token 200 is read as "token invalid"',
  V3: 'a failed payment lookup is recorded as "no payment method"',
  V4: 'the alert sends BEFORE it claims the row (check-then-act)',
  V5: 'a failed send keeps the claim, silencing the alert forever',
  V6: 'expires_at 0 is read as 1970 instead of "never expires"',
  V7: 'the allowance threshold is an exact-crossing test',
  V8: 'a failed inspection revokes the connection',
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// V8b — THE LOG SCAN. A SEPARATE PROOF, BECAUSE IT IS ABOUT SOURCE TEXT, NOT BEHAVIOUR.
// 🔴 refreshBusinessToken AND inspectBusinessToken PUT THE TOKEN IN THE QUERY STRING, because Meta's API
// gives no header form. So the URL is secret material. This scans every new file for a log call that
// could carry one, and proves the scanner works by running it against a deliberately leaky string.
// ════════════════════════════════════════════════════════════════════════════════════════════════════
const NEW_FILES = [
  'lib/whatsapp/meta-admin.ts', 'lib/whatsapp/maintenance.ts', 'lib/whatsapp/alerts.ts',
  'lib/whatsapp/alert-copy.ts', 'lib/whatsapp/payment-block.ts',
  'app/api/cron/whatsapp-maintenance/route.ts', 'app/api/admin/whatsapp-connections/route.ts',
]
// Identifiers that must never appear inside a console.* call in the new code.
const FORBIDDEN = /\b(url|token|accessToken|currentToken|businessToken|ciphertext|access_token_ciphertext|appSecret|client_secret|input_token|fb_exchange_token|primary_funding_id|fundingId)\b/

/**
 * 🔴 THE SCANNER JUDGES EXPRESSIONS, NOT ENGLISH. `console.error('token encryption key not configured')`
 * logs no token — it contains the WORD. Matching raw source text flags that and, far worse, trains
 * whoever hits it to weaken the pattern until it catches nothing.
 * So: plain quoted strings are removed entirely, and template literals keep ONLY their ${…} expressions
 * — which is exactly where an interpolated token would be.
 */
function stripLiteralText(src) {
  let out = ''
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (c === "'" || c === '"') {
      const q = c
      i++
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++ }
      continue
    }
    if (c === '`') {
      i++
      while (i < src.length && src[i] !== '`') {
        if (src[i] === '\\') { i += 2; continue }
        if (src[i] === '$' && src[i + 1] === '{') {
          // Keep the interpolated expression — a token would be interpolated, never typed as prose.
          let depth = 0
          const start = i + 2
          for (i = i + 1; i < src.length; i++) {
            if (src[i] === '{') depth++
            else if (src[i] === '}') { depth--; if (depth === 0) break }
          }
          out += ' ' + src.slice(start, i) + ' '
          i++
          continue
        }
        i++
      }
      continue
    }
    out += c
  }
  return out
}

function scanLogs(sourceByPath) {
  const hits = []
  for (const [file, src] of Object.entries(sourceByPath)) {
    // Strip comments first — the files document these names heavily, and a comment is not a log call.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*(\/\/|\*)/.test(l)).join('\n')
    const re = /console\.(log|warn|error|info|debug)\s*\(/g
    let m
    while ((m = re.exec(code)) !== null) {
      // Take the balanced argument list of this call.
      let depth = 0, i = m.index + m[0].length - 1, end = i
      for (; i < code.length; i++) {
        if (code[i] === '(') depth++
        else if (code[i] === ')') { depth--; if (depth === 0) { end = i; break } }
      }
      const args = stripLiteralText(code.slice(m.index + m[0].length, end))
      const bad = args.match(FORBIDDEN)
      if (bad) hits.push(`${file}: console.${m[1]} mentions \`${bad[0]}\``)
    }
  }
  return hits
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════
;(async () => {
  console.log('── BROKEN VARIANTS: each MUST report FAILURE ───────────────────────────────────────────')
  let allFailed = true
  for (const key of Object.keys(NAMES)) {
    const r = await runSuite(V[key])
    const detected = r.fails.length > 0
    if (!detected) allFailed = false
    console.log(`  ${detected ? '✓ FAILED as required' : '🔴 PASSED — THE HARNESS PROVES NOTHING'}  ${key} ${NAMES[key]}`)
    for (const f of r.fails.slice(0, 2)) console.log(`        caught: ${f}`)
    if (r.fails.length > 2) console.log(`        …and ${r.fails.length - 2} more`)
  }

  // The log scanner's own broken variant: a file that logs the URL.
  // Two leaky shapes and one innocent one: a bare identifier, an interpolated one, and prose that
  // merely contains the word. The scanner must catch exactly the first two.
  const leaky = scanLogs({
    'BARE.ts': 'const url = "x"\nconsole.error("refresh failed", url)\n',
    'INTERP.ts': 'console.warn(`calling ${url} now`)\n',
    'PROSE.ts': 'console.error("token encryption key not configured")\n',
  })
  const scannerWorks = leaky.length === 2 && leaky.some(h => h.startsWith('BARE.ts')) &&
    leaky.some(h => h.startsWith('INTERP.ts')) && !leaky.some(h => h.startsWith('PROSE.ts'))
  console.log(`  ${scannerWorks ? '✓ FAILED as required' : '🔴 PASSED — THE SCANNER PROVES NOTHING'}  V8b the log scanner catches a bare AND an interpolated URL, and ignores prose`)
  if (!scannerWorks) for (const h of leaky) console.log('        scanner said: ' + h)
  if (!scannerWorks) allFailed = false

  if (!allFailed) { console.log('\n🔴 A VARIANT PASSED. The harness is abandoned.'); process.exit(1) }

  console.log('\n── THE REAL CODE ───────────────────────────────────────────────────────────────────────')
  const r = await runSuite(REAL)
  for (const n of r.ok) console.log('  ✓ ' + n)
  for (const n of r.fails) console.log('  🔴 ' + n)

  console.log('\n── V8. NO TOKEN IN ANY LOG CALL IN THE NEW CODE ────────────────────────────────────────')
  const sources = {}
  for (const f of NEW_FILES) sources[f] = fs.readFileSync(path.join(REPO, f), 'utf8')
  const hits = scanLogs(sources)
  for (const f of NEW_FILES) console.log(`  ${hits.some(h => h.startsWith(f)) ? '🔴' : '✓'} ${f}`)
  for (const h of hits) console.log('     🔴 ' + h)

  const fails = r.fails.concat(hits)
  console.log(`\n${fails.length ? '🔴 ' + fails.length + ' FAILED' : '✅ all ' + (r.ok.length + NEW_FILES.length) + ' passed'}`)
  fs.rmSync(out, { recursive: true, force: true })
  process.exit(fails.length ? 1 : 0)
})()
