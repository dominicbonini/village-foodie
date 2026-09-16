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
// Sample values for the subtitle cases. Distinct strings so a swapped field is visible.
const NUM = '+44 7700 900000'
const NAME = 'Pizzeria Gusto'
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
    t(`above-allowance warning at ${limit}: ${want}`,
      view({ state: 'ready', displayPhoneNumber: null, verifiedName: null, monthlyLimit: limit, freeAllowance: ALLOWANCE })
        .showAboveAllowanceWarning === want)
  }
  t('🔴 the warning never shows without a connection',
    view({ state: 'not_connected', displayPhoneNumber: null, verifiedName: null, monthlyLimit: 5000, freeAllowance: ALLOWANCE })
      .showAboveAllowanceWarning === false)


  // ── PAYMENT STATUS: THREE VALUES, AND 'unknown' IS NOT 'missing' ────────────────────────────────
  const vw = (over = {}) => view({
    state: 'ready', displayPhoneNumber: NUM, verifiedName: NAME,
    offerReauthorise: false, monthlyLimit: 1000, freeAllowance: ALLOWANCE, ...over,
  })
  t('payment true  -> added',   vw({ paymentMethodPresent: true }).paymentStatus === 'added')
  t('payment false -> missing', vw({ paymentMethodPresent: false }).paymentStatus === 'missing')
  t('🔴 payment null -> unknown, NOT missing', vw({ paymentMethodPresent: null }).paymentStatus === 'unknown')
  t('🔴 payment undefined -> unknown', vw({}).paymentStatus === 'unknown')
  t('🔴 no connection -> paymentStatus is null (not a state about an account that does not exist)',
    view({ state: 'not_connected', displayPhoneNumber: null, verifiedName: null, monthlyLimit: 1000,
           freeAllowance: ALLOWANCE, paymentMethodPresent: false }).paymentStatus === null)

  // ── THE WARNING: five limits x three payment states ─────────────────────────────────────────────
  for (const limit of [250, 500, 1000, 2000, 5000]) {
    for (const [tag, pmp, status] of [['added', true, 'added'], ['missing', false, 'missing'], ['unknown', null, 'unknown']]) {
      const v = vw({ monthlyLimit: limit, paymentMethodPresent: pmp })
      const want = limit > ALLOWANCE && status !== 'added'
      t(`warning at ${limit} / payment ${tag} -> ${want}`, v.showAboveAllowanceWarning === want)
      // 🔴 TWO VARIANTS NOW. Only a KNOWN-missing method gets the 'missing' wording; 'unknown' — which
      // is every live connection — gets 'general', which states the requirement without guessing.
      const wantVariant = want ? (status === 'missing' ? 'missing' : 'general') : null
      t(`…variant at ${limit} / ${tag}`, v.aboveAllowanceWarningVariant === wantVariant)
    }
  }
  t('🔴 at EXACTLY the allowance there is no warning, whatever the payment state',
    [true, false, null].every(pmp => vw({ monthlyLimit: ALLOWANCE, paymentMethodPresent: pmp }).showAboveAllowanceWarning === false))
  t('🔴 no connection -> no warning even at 5000 with no payment method',
    view({ state: 'not_connected', displayPhoneNumber: null, verifiedName: null, monthlyLimit: 5000,
           freeAllowance: ALLOWANCE, paymentMethodPresent: false }).showAboveAllowanceWarning === false)

  // ── THE SUBTITLE: NEVER INVENTED ───────────────────────────────────────────────────────────────
  t('subtitle: both values joined',  vw().subtitle === `${NUM} · ${NAME}`)
  t('subtitle: number only',         vw({ verifiedName: null }).subtitle === NUM)
  t('subtitle: name only',           vw({ displayPhoneNumber: null }).subtitle === NAME)
  t('🔴 subtitle: NEITHER -> null, nothing invented',
    vw({ displayPhoneNumber: null, verifiedName: null }).subtitle === null)
  t('🔴 subtitle: whitespace-only values are treated as absent',
    vw({ displayPhoneNumber: '   ', verifiedName: '' }).subtitle === null)
  t('🔴 subtitle: null while disconnected, even with stored values',
    view({ state: 'not_connected', displayPhoneNumber: NUM, verifiedName: NAME, monthlyLimit: 1000,
           freeAllowance: ALLOWANCE }).subtitle === null)

  // ── THE HELPER AND THE TWO BILLING FLAGS ───────────────────────────────────────────────────────
  t('🔴 requires-account helper shows ONLY when not connected',
    view({ state: 'not_connected', displayPhoneNumber: null, verifiedName: null, monthlyLimit: 1000,
           freeAllowance: ALLOWANCE }).showRequiresAccountHelper === true)
  for (const state of ['onboarding_incomplete', 'token_missing', 'awaiting_payment_method', 'revoked', 'ready']) {
    t(`🔴 requires-account helper hidden on ${state}`,
      vw({ state }).showRequiresAccountHelper === false)
  }
  // ── THE PAYMENT ROW: SHOWN ONLY FOR THE TWO STATES WE CAN STAND BEHIND ─────────────────────────
  t('payment row: shown for added',   vw({ paymentMethodPresent: true }).showBillingPaymentRow === true)
  t('payment row: shown for missing', vw({ paymentMethodPresent: false }).showBillingPaymentRow === true)
  t('🔴 payment row: HIDDEN for unknown — the live state for every connection',
    vw({ paymentMethodPresent: null }).showBillingPaymentRow === false)
  t('🔴 payment row: hidden for undefined too', vw({}).showBillingPaymentRow === false)
  t('🔴 payment row: hidden when not connected',
    view({ state: 'not_connected', displayPhoneNumber: null, verifiedName: null, monthlyLimit: 1000,
           freeAllowance: ALLOWANCE, paymentMethodPresent: true }).showBillingPaymentRow === false)
  // 🔴 THE WARNING AND THE ROW ARE INDEPENDENT: at 2000 with unknown payment the warning shows and the
  // row does not. That combination is the live one, and it is the pair most easily got wrong.
  t('🔴 at 2000 / unknown: warning YES, payment row NO',
    vw({ monthlyLimit: 2000, paymentMethodPresent: null }).showAboveAllowanceWarning === true &&
    vw({ monthlyLimit: 2000, paymentMethodPresent: null }).showBillingPaymentRow === false)
  t('billing SECTION shows in every live state, connected or not',
    STATES.every(state => view({ state, displayPhoneNumber: null, verifiedName: null, monthlyLimit: 1000,
                                 freeAllowance: ALLOWANCE }).showBillingSection === true))

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

// ── STEP 4c VARIANTS: the six ways the new fields could be wrong ────────────────────────────────────
// Each wraps the REAL view model and corrupts exactly one answer. Each must make the suite FAIL.
const W1 = { ...REAL, view: (i) => { const v = REAL.view(i)   // warning shows even when a method is added
  return v.paymentStatus === 'added' && (i.monthlyLimit ?? 0) > (i.freeAllowance ?? 0)
    ? { ...v, showAboveAllowanceWarning: true, aboveAllowanceWarningVariant: 'missing' } : v } }
const W2 = { ...REAL, view: (i) => { const v = REAL.view(i)   // hidden when unknown at 2000
  return v.paymentStatus === 'unknown' && (i.monthlyLimit ?? 0) === 2000
    ? { ...v, showAboveAllowanceWarning: false, aboveAllowanceWarningVariant: null } : v } }
const W3 = { ...REAL, view: (i) => { const v = REAL.view(i)   // null payment maps to 'missing'
  return v.paymentStatus === 'unknown'
    ? { ...v, paymentStatus: 'missing', aboveAllowanceWarningVariant: v.showAboveAllowanceWarning ? 'missing' : null } : v } }
const W4 = { ...REAL, view: (i) => { const v = REAL.view(i)   // warning at EXACTLY the allowance
  return (i.monthlyLimit ?? 0) === (i.freeAllowance ?? 0) && v.paymentStatus && v.paymentStatus !== 'added'
    ? { ...v, showAboveAllowanceWarning: true, aboveAllowanceWarningVariant: v.paymentStatus } : v } }
const W5 = { ...REAL, view: (i) => { const v = REAL.view(i)   // subtitle invented when both are null
  return v.subtitle === null && i.state !== 'not_connected' ? { ...v, subtitle: 'Not available' } : v } }
const W6 = { ...REAL, view: (i) => ({ ...REAL.view(i), showRequiresAccountHelper: true }) }  // helper always on

console.log('\n── STEP 4c VARIANTS: each MUST report FAILURE ──────────────────────────────────────────')
let allW = true
for (const [name, impl] of [
  ['V1 the warning shows when paymentStatus is "added"', W1],
  ['V2 the warning is hidden when unknown at 2000', W2],
  ['V3 null payment_method_present maps to "missing"', W3],
  ['V4 the warning shows at exactly the allowance', W4],
  ['V5 the subtitle invents a value when both are null', W5],
  ['V6 the Requires-account helper shows on a ready connection', W6],
]) {
  const rr = runSuite(impl)
  const detected = rr.fails.length > 0
  if (!detected) allW = false
  console.log(`  ${detected ? '✓ FAILED as required' : '🔴 PASSED — PROVES NOTHING'}  ${name}`)
  for (const f of rr.fails.slice(0, 2)) console.log(`        caught: ${f}`)
  if (rr.fails.length > 2) console.log(`        …and ${rr.fails.length - 2} more`)
}
if (!allW) { console.log('\n🔴 A STEP-4c VARIANT PASSED. Abandoned.'); process.exit(1) }

// ── PAYMENT-ROW VARIANTS: the three ways this change could be wrong ─────────────────────────────────
const P1 = { ...REAL, view: (i) => { const v = REAL.view(i)   // the row shows for 'unknown'
  return v.paymentStatus === 'unknown' ? { ...v, showBillingPaymentRow: true } : v } }
const P2 = { ...REAL, view: (i) => { const v = REAL.view(i)   // 'unknown' takes the 'missing' wording
  return v.showAboveAllowanceWarning && v.paymentStatus === 'unknown'
    ? { ...v, aboveAllowanceWarningVariant: 'missing' } : v } }
const P3 = { ...REAL, view: (i) => { const v = REAL.view(i)   // the warning shows when a method is added
  return v.paymentStatus === 'added' && (i.monthlyLimit ?? 0) > (i.freeAllowance ?? 0)
    ? { ...v, showAboveAllowanceWarning: true, aboveAllowanceWarningVariant: 'general' } : v } }

console.log('\n── PAYMENT-ROW VARIANTS: each MUST report FAILURE ──────────────────────────────────────')
let allP = true
for (const [name, impl] of [
  ['V1 the payment row shows for "unknown"', P1],
  ['V2 the variant is "missing" for "unknown"', P2],
  ['V3 the warning shows when the method is "added"', P3],
]) {
  const rr = runSuite(impl)
  const detected = rr.fails.length > 0
  if (!detected) allP = false
  console.log(`  ${detected ? '✓ FAILED as required' : '🔴 PASSED — PROVES NOTHING'}  ${name}`)
  for (const f of rr.fails.slice(0, 2)) console.log(`        caught: ${f}`)
  if (rr.fails.length > 2) console.log(`        …and ${rr.fails.length - 2} more`)
}
if (!allP) { console.log('\n🔴 A PAYMENT-ROW VARIANT PASSED. Abandoned.'); process.exit(1) }

console.log('\n── THE REAL CODE ───────────────────────────────────────────────────────────────────────')
const r = runSuite(REAL)
for (const n of r.fails) console.log('  🔴 ' + n)
console.log(`\n${r.fails.length ? '🔴 ' + r.fails.length + ' FAILED' : '✅ all ' + r.ok.length + ' passed'}`)
fs.rmSync(out, { recursive: true, force: true })
process.exit(r.fails.length ? 1 : 0)
