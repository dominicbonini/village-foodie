#!/usr/bin/env node
// scripts/whatsapp-settings-row-harness.cjs
//
// Proofs for the monthly reply cap, the month boundary, the limit validator, the send gate, the row's
// view model and the disconnect plan.
//   node scripts/whatsapp-settings-row-harness.cjs
//
// 🔴 EVERY FUNCTION UNDER TEST IS PASSED IN, so the identical assertions run against the real code and
// against seven deliberately broken variants, each of which MUST report FAILURE first.
// ⚠️ Self-compiling with the repo's own tsc — this repo has no test framework.

const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const REPO = path.resolve(__dirname, '..')
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-row-'))
// ⚠️ A TEMP tsconfig, NOT BARE FLAGS. The modules import each other as `@/lib/...`, which tsc cannot
// resolve without `baseUrl`/`paths` — with bare flags it fails with TS2307 before emitting anything.
const SOURCES = [
  'lib/whatsapp/reply-cap.ts', 'lib/whatsapp/usage.ts', 'lib/whatsapp/connection-view.ts',
  'lib/whatsapp/connection-state.ts', 'lib/whatsapp/disconnect-plan.ts',
]
const tscfg = path.join(out, 'tsconfig.json')
fs.writeFileSync(tscfg, JSON.stringify({
  compilerOptions: {
    module: 'commonjs', target: 'es2020', outDir: '.', skipLibCheck: true,
    esModuleInterop: true, noEmitOnError: false, baseUrl: REPO, paths: { '@/*': ['./*'] },
  },
  files: SOURCES.map(f => path.join(REPO, f)),
}, null, 1))
execFileSync(path.join(REPO, 'node_modules/.bin/tsc'), ['-p', tscfg], { stdio: 'pipe' })
// `@/lib/...` imports resolve to siblings in the flat output.
for (const f of fs.readdirSync(path.join(out, 'whatsapp'))) {
  if (!f.endsWith('.js')) continue
  const fp = path.join(out, 'whatsapp', f)
  fs.writeFileSync(fp, fs.readFileSync(fp, 'utf8').replace(/require\("@\/lib\/([a-z-]+)"\)/g, 'require("../$1")'))
}

const cap = require(path.join(out, 'whatsapp/reply-cap.js'))
const usage = require(path.join(out, 'whatsapp/usage.js'))
const viewMod = require(path.join(out, 'whatsapp/connection-view.js'))
const stateMod = require(path.join(out, 'whatsapp/connection-state.js'))
const discMod = require(path.join(out, 'whatsapp/disconnect-plan.js'))

const ALLOWANCE = cap.META_FREE_REPLIES_PER_MONTH
const STATES = ['not_connected', 'onboarding_incomplete', 'token_missing', 'awaiting_payment_method', 'revoked', 'ready']

function runSuite({ decide, isLimit, monthStart, view, canSend, plan }) {
  const ok = [], fails = []
  const t = (n, c) => (c ? ok : fails).push(n)
  const base = { customerReplies24h: 0, truckRepliesThisMonth: 0, monthlyReplyLimit: 1000,
                 customerCapNoticeSent: false, maxRepliesPerCustomer24h: 3 }

  // ── THE MONTHLY CEILING IS THE TRUCK'S OWN ──────────────────────────────────────────────────────
  for (const [limit, used, want] of [
    [250, 249, 'REPLY'], [250, 250, 'SILENT_TRUCK_MONTH_CAP'], [250, 251, 'SILENT_TRUCK_MONTH_CAP'],
    [5000, 2500, 'REPLY'], [5000, 5000, 'SILENT_TRUCK_MONTH_CAP'],
  ]) {
    t(`🔴 limit ${limit}, used ${used} -> ${want}`,
      decide({ ...base, monthlyReplyLimit: limit, truckRepliesThisMonth: used }) === want)
  }
  // 🔴 the discriminator: a truck on 250 that is over ITS limit but under the old fixed 2000
  t('🔴 a truck on 250 with 300 used is SILENT (not judged against a fixed number)',
    decide({ ...base, monthlyReplyLimit: 250, truckRepliesThisMonth: 300 }) === 'SILENT_TRUCK_MONTH_CAP')
  t('🔴 a truck on 5000 with 2100 used still REPLIES',
    decide({ ...base, monthlyReplyLimit: 5000, truckRepliesThisMonth: 2100 }) === 'REPLY')

  // ── NO DAILY WINDOW ─────────────────────────────────────────────────────────────────────────────
  t('🔴 there is no daily decision left', !('SILENT_TRUCK_DAY_CAP' in { [decide(base)]: 1 }))
  t('🔴 a busy day under the monthly limit still replies',
    decide({ ...base, monthlyReplyLimit: 1000, truckRepliesThisMonth: 400 }) === 'REPLY')

  // ── PER-CUSTOMER 3 IN 24H, UNCHANGED ────────────────────────────────────────────────────────────
  t('customer 2 of 3 -> REPLY', decide({ ...base, customerReplies24h: 2 }) === 'REPLY')
  t('customer 3 of 3 -> NOTIFY_CUSTOMER_CAP', decide({ ...base, customerReplies24h: 3 }) === 'NOTIFY_CUSTOMER_CAP')
  t('customer 3 of 3, already notified -> silent',
    decide({ ...base, customerReplies24h: 3, customerCapNoticeSent: true }) === 'SILENT_CUSTOMER_ALREADY_NOTIFIED')
  t('🔴 the month cap beats the customer cap (no handoff when out of budget)',
    decide({ ...base, monthlyReplyLimit: 250, truckRepliesThisMonth: 250, customerReplies24h: 3 }) === 'SILENT_TRUCK_MONTH_CAP')

  // ── THE MONTH BOUNDARY IS LOCAL, NOT UTC ────────────────────────────────────────────────────────
  // 🧪 2026-09-30T23:30:00Z is 00:30 on 1 October in Europe/London (BST). A UTC month start would put it
  // in September and let the truck spend twice inside one Meta month.
  const at2330 = new Date('2026-09-30T23:30:00Z')
  const startLondon = monthStart('Europe/London', at2330)
  t('🔴 month boundary: 30 Sep 23:30Z is already OCTOBER in London',
    startLondon >= '2026-09-30T23:00:00.000Z' && startLondon < '2026-10-01T02:00:00.000Z')
  t('🔴 …and NOT 1 September', !startLondon.startsWith('2026-09-01'))
  const midOct = monthStart('Europe/London', new Date('2026-10-15T12:00:00Z'))
  t('mid-October resolves to the start of October', midOct.startsWith('2026-09-30') || midOct.startsWith('2026-10-01'))
  t('reset date after 30 Sep 23:30Z is 1 November',
    usage.monthResetLocalDate('Europe/London', at2330) === '2026-11-01')
  t('reset date mid-September is 1 October',
    usage.monthResetLocalDate('Europe/London', new Date('2026-09-15T12:00:00Z')) === '2026-10-01')
  t('a null timezone falls back to Europe/London', usage.truckTimezone(null) === 'Europe/London')

  // ── THE VALIDATOR ───────────────────────────────────────────────────────────────────────────────
  for (const v of [250, 500, 1000, 2000, 5000]) t(`validator accepts ${v}`, isLimit(v) === true)
  for (const [tag, v] of [['1500', 1500], ['0', 0], ['-250', -250], ['250.5', 250.5], ['"250"', '250'],
                          ['null', null], ['undefined', undefined], ['NaN', NaN], ['Infinity', Infinity],
                          ['true', true], ['object', {}], ['array', [250]]]) {
    t(`🔴 validator rejects ${tag}`, isLimit(v) === false)
  }

  // ── PAYMENT METHOD NEVER BLOCKS SENDING ─────────────────────────────────────────────────────────
  const derive = (pmp) => stateMod.deriveWhatsAppConnectionState({
    wabaId: 'W', phoneNumberId: 'P', tokenPresent: true,
    tokenExpiresAt: new Date(Date.now() + 86400e3).toISOString(), tokenRevokedAt: null,
    tokenIssuedAt: new Date(Date.now() - 3600e3).toISOString(), paymentMethodPresent: pmp,
  })
  for (const [tag, pmp] of [['false', false], ['null', null], ['true', true]]) {
    t(`🔴 payment_method_present ${tag} is SENDABLE`, canSend(derive(pmp)) === true)
  }
  t('a revoked token is still NOT sendable (the gate is not simply open)',
    canSend('revoked') === false)
  t('not_connected is still NOT sendable', canSend('not_connected') === false)

  // ── THE VIEW MODEL ──────────────────────────────────────────────────────────────────────────────
  for (const state of STATES) {
    const v = view({ state, displayPhoneNumber: null, verifiedName: null, monthlyLimit: 1000, freeAllowance: ALLOWANCE })
    t(`no number input: ${state}`, v.showNumberInput === false)
  }
  const ready = view({ state: 'ready', displayPhoneNumber: '+44 7700 900000', verifiedName: 'Gusto',
                       offerReauthorise: false, monthlyLimit: 1000, freeAllowance: ALLOWANCE })
  t('🔴 ready: green Connected label', ready.showConnectedLabel === true)
  t('🔴 ready: NO Set up button', ready.showSetupControl === false)
  t('🔴 ready: pop-up instruction hidden', ready.showPopupInstruction === false)
  t('🔴 ready: Disconnect offered', ready.showDisconnect === true)
  t('ready: the limit control is shown', ready.showMonthlyLimit === true)

  const reconnect = view({ state: 'revoked', displayPhoneNumber: '+44 7700 900000', verifiedName: null,
                           offerReauthorise: true, monthlyLimit: 1000, freeAllowance: ALLOWANCE })
  t('revoked + offerReauthorise: the control IS shown (Reconnect)', reconnect.showSetupControl === true)
  t('revoked: no green Connected label', reconnect.showConnectedLabel === false)
  t('revoked: Disconnect still offered', reconnect.showDisconnect === true)

  const none = view({ state: 'not_connected', displayPhoneNumber: null, verifiedName: null,
                      offerReauthorise: false, monthlyLimit: 1000, freeAllowance: ALLOWANCE })
  t('not connected: Set up shown', none.showSetupControl === true)
  t('not connected: instruction shown', none.showPopupInstruction === true)
  t('🔴 not connected: NO Disconnect', none.showDisconnect === false)
  t('🔴 not connected: NO limit control', none.showMonthlyLimit === false)

  // the >allowance note
  for (const [limit, want] of [[250, false], [1000, false], [2000, true], [5000, true]]) {
    t(`above-allowance note at ${limit}: ${want}`,
      view({ state: 'ready', displayPhoneNumber: null, verifiedName: null, monthlyLimit: limit, freeAllowance: ALLOWANCE })
        .showAboveAllowanceNote === want)
  }
  t('🔴 the note never shows without a connection',
    view({ state: 'not_connected', displayPhoneNumber: null, verifiedName: null, monthlyLimit: 5000, freeAllowance: ALLOWANCE })
      .showAboveAllowanceNote === false)

  // ── THE DISCONNECT PLAN ─────────────────────────────────────────────────────────────────────────
  const kinds = (p) => p.ops.map(o => o.kind)
  const noConn = plan({ connection: null, tokenUsable: false })
  t('no connection: idempotent success, no operations', noConn.alreadyDisconnected === true && noConn.ops.length === 0)
  const good = plan({ connection: { wabaId: 'WABA1' }, tokenUsable: true })
  t('usable token: unsubscribe THEN delete, in that order',
    kinds(good).join(',') === 'unsubscribe_app,delete_connection_row')
  const noTok = plan({ connection: { wabaId: 'WABA1' }, tokenUsable: false })
  t('🔴 expired/revoked token: the row is STILL deleted', kinds(noTok).includes('delete_connection_row'))
  t('unusable token: no Meta call attempted', !kinds(noTok).includes('unsubscribe_app'))
  t('…and the reason is reported', noTok.unsubscribeSkippedReason === 'no_usable_token')
  const noWaba = plan({ connection: { wabaId: null }, tokenUsable: true })
  t('no waba: row deleted, Meta skipped with a reason',
    kinds(noWaba).join(',') === 'delete_connection_row' && noWaba.unsubscribeSkippedReason === 'no_waba')
  // 🔴 THE RULE THAT MUST NEVER BREAK
  for (const p of [good, noTok, noWaba, noConn]) {
    t('🔴 NO DEREGISTER in any plan', !JSON.stringify(p).toLowerCase().includes('deregister'))
  }
  t('🔴 every non-empty plan ends by deleting the row',
    [good, noTok, noWaba].every(p => kinds(p)[kinds(p).length - 1] === 'delete_connection_row'))

  return { ok, fails }
}

const REAL = {
  decide: cap.decideReplyCap, isLimit: cap.isMonthlyReplyLimit, monthStart: usage.monthStartIso,
  view: viewMod.whatsAppRowView, canSend: stateMod.canSendWhatsApp, plan: discMod.planDisconnect,
}

// ── BROKEN VARIANTS ─────────────────────────────────────────────────────────────────────────────────
const V1 = { ...REAL, decide: (i) => REAL.decide({ ...i, monthlyReplyLimit: 2000 }) }
const V2 = { ...REAL, decide: (i) => REAL.decide({ ...i, truckRepliesThisMonth: Math.max(0, i.truckRepliesThisMonth - 1) }) }
const V3 = { ...REAL, monthStart: (tz, now) => `${now.toISOString().slice(0, 7)}-01T00:00:00.000Z` }
const V4 = { ...REAL, isLimit: (v) => typeof v === 'number' && v >= 250 && v <= 5000 }
const V5 = { ...REAL, canSend: (s) => s === 'ready' }
const V6 = { ...REAL, plan: (i) => {
  const p = REAL.plan(i)
  if (!i.connection) return p
  if (!i.tokenUsable) return { ...p, ops: p.ops.filter(o => o.kind !== 'delete_connection_row') }
  return { ...p, ops: [{ kind: 'deregister_number' }, ...p.ops] }
} }
const V7 = { ...REAL, view: (i) => ({ ...REAL.view(i), showSetupControl: true, showConnectedLabel: false }) }

console.log('── BROKEN VARIANTS: each MUST report FAILURE ───────────────────────────────────────────')
let all = true
for (const [name, impl] of [
  ['V1 the cap uses a fixed 2000 instead of the truck\'s limit', V1],
  ['V2 the handoff is not counted (month total one short)', V2],
  ['V3 the month boundary uses UTC', V3],
  ['V4 validation accepts 1500', V4],
  ['V5 payment_method_present false still blocks sending', V5],
  ['V6 the plan deregisters, or skips deleting the row', V6],
  ['V7 the view shows Set up for a ready connection', V7],
]) {
  const r = runSuite(impl)
  const detected = r.fails.length > 0
  if (!detected) all = false
  console.log(`  ${detected ? '✓ FAILED as required' : '🔴 PASSED — PROVES NOTHING'}  ${name}`)
  for (const f of r.fails.slice(0, 2)) console.log(`        caught: ${f}`)
  if (r.fails.length > 2) console.log(`        …and ${r.fails.length - 2} more`)
}
if (!all) { console.log('\n🔴 A VARIANT PASSED. Abandoned.'); process.exit(1) }

console.log('\n── THE REAL CODE ───────────────────────────────────────────────────────────────────────')
const r = runSuite(REAL)
for (const n of r.fails) console.log('  🔴 ' + n)
console.log(`\n${r.fails.length ? '🔴 ' + r.fails.length + ' FAILED' : '✅ all ' + r.ok.length + ' passed'}`)
fs.rmSync(out, { recursive: true, force: true })
process.exit(r.fails.length ? 1 : 0)
