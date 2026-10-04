#!/usr/bin/env node
// scripts/event-types.cjs
//
//   node scripts/event-types.cjs      (NO NETWORK, NO DATABASE, NO BROWSER, NO LIVE TRUCK)
//
// ── 🔴 WHAT THIS GUARDS ─────────────────────────────────────────────────────────────────────────────
// Event types change what a truck's SERVICE does during a live event: whether a buzzer is handed out,
// whether a cash button appears, whether an order can be marked ready, and how often a collection slot
// is offered. Two things can go wrong, and both are silent:
//
//   1. A TRUCK WHO HAS NEVER MADE A TYPE IS AFFECTED. There are twelve of them and none has asked for
//      this feature. Section 1 proves byte-identity against the PRE-BUILD TREE — not against a
//      remembered expression, but against the compiled output of the commit this build started from.
//   2. A TYPE IS OFFERED AND SILENTLY DOES NOTHING, or overrules a change the truck made on one event.
//      Sections 2-4 drive every branch; section 6's variants each break one and must be caught.
//
// 🔴 THE ONE CASE THAT NEEDED A SCHEMA CHANGE: `order_ready_override` is seeded at creation and
// bulk-written when the van default flips, so it is never null — and a plain `override ?? type ??
// default` chain could never let a type win for the mark-ready step. Section 4 is entirely about that.

const fs = require('fs')
const path = require('path')
const { compile, headWorktree } = require('./_slot-interval-compile.cjs')
const { execFileSync } = require('child_process')
const REPO = path.resolve(__dirname, '..')

/** The modules under test, and the pre-build tree's equivalents. */
const LIB_NOW = [
  'lib/event-types/types.ts', 'lib/event-types/resolve.ts',
  /* ⚠️ `read.ts` IS HERE ONLY BECAUSE `slot-interval.ts` IMPORTS IT. Nothing in this harness calls it —
   * it is the one module in the feature that touches a database, and a harness that needs a database
   * is a harness that cannot run. It is compiled so the variant trees resolve, and never invoked. */
  'lib/event-types/read.ts',
  'lib/slot-interval-core.ts', 'lib/slot-interval.ts',
  'lib/buzzer.ts', 'lib/payments/paid-step.ts', 'lib/features.ts',
  /* The offline vocabulary. A leaf with no imports, and the OWNER of the two mode values — so a
   * check on the resolver's mode chain is a check against the same constants the screens render. */
  'lib/copy/offlineProtection.ts',
]
/* ⚠️ THE BEFORE TREE HAS NO lib/event-types AND NO lib/slot-interval-core. Compiling the same list
 * against it would fail on a missing file, which a careless harness would report as "the build broke"
 * rather than as "that is the point". Its list is what existed. */
const LIB_BEFORE = [
  'lib/slot-interval.ts', 'lib/buzzer.ts', 'lib/payments/paid-step.ts', 'lib/features.ts',
  'lib/copy/offlineProtection.ts',
]

let pass = 0, fail = 0
const t = (label, ok) => { if (ok) { pass++; console.log('  ✓ ' + label) } else { fail++; console.log('  🔴 ' + label) } }
const head = (s) => console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 92 - s.length)))
const J = (x) => JSON.stringify(x)

/**
 * Source with its comments removed.
 *
 * 🔴 EVERY "HOW MANY TIMES DOES THIS APPEAR" CHECK MUST USE THIS. Two checks in section 4 were written
 * against the raw text and failed on the NOTES THAT EXPLAIN THE CODE — a comment saying
 * "`order_ready_source: 'truck'` is what makes this a hand change" counted as a second writer. A check
 * that forbids writing down why is a worse check, so it is the code that is counted.
 */
/**
 * A type row with every setting NULL, overridden by `o`.
 *
 * 🔴 ONE DEFINITION AT MODULE SCOPE. There were four block-scoped copies of this, one per section, and
 * when stage 2b added three offline columns three of them were updated and the fourth was not — which
 * is how a fixture ends up missing a field the resolver reads. `blankTypeValues()` in the real module
 * is the production equivalent; this mirrors it for fixtures that want a partial override.
 */
function typeWith(o) {
  return {
    buzzer_prompt: null, takes_cash: null, order_ready: null, collection_interval_mins: null,
    offline_protection: null, offline_protection_mode: null, offline_auto_reject_mins: null,
    ...o,
  }
}

const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

function build(root, files, tag) {
  /* ⚠️ `jsx: 'react-jsx'` AND A node_modules SYMLINK INTO THE OUTPUT. `lib/buzzer.ts` carries the
   * ready-toast pill, which is a React component — so it needs JSX to compile and `react` to be
   * RESOLVABLE from the compiled file at require time. Without the symlink the module fails to LOAD,
   * which a careless variant would score as "the bug was caught", for entirely the wrong reason. */
  const c = compile(root, files, tag, { jsx: 'react-jsx', skipLibCheck: true })
  try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(c.out, 'node_modules')) } catch { /* already there */ }
  return {
    resolve: (() => { try { return c.req('lib/event-types/resolve.js') } catch { return null } })(),
    types: (() => { try { return c.req('lib/event-types/types.js') } catch { return null } })(),
    slot: c.req('lib/slot-interval.js'),
    buzzer: c.req('lib/buzzer.js'),
    paid: c.req('lib/payments/paid-step.js'),
    features: c.req('lib/features.js'),
    copy: c.req('lib/copy/offlineProtection.js'),
  }
}

const NOW = build(REPO, LIB_NOW, 'et-now')
/** The number of real offline modes — the copy module owns the list, so this reads it. */
const OFFLINE_MODES_COUNT = NOW.copy.OFFLINE_PROTECTION_MODES.length

// ════════════════════════════════════════════════════════════════════════════════════════════════
// THE FIXTURE MATRIX — every shape an untyped truck's data can take
// ════════════════════════════════════════════════════════════════════════════════════════════════
// 🔴 EXHAUSTIVE OVER THE INPUTS THAT DECIDE, not a sample. Each setting's chain has two or three
// nullable links; the product is small enough to enumerate, so it is enumerated. A sampled matrix is
// how a branch that only fires for one combination survives a rewrite unnoticed.
const VANS = [
  { buzzer_count: null, order_ready_enabled: false, collection_interval_mins: 5, operator_collection_interval_mins: null },
  { buzzer_count: 10, order_ready_enabled: false, collection_interval_mins: 5, operator_collection_interval_mins: null },
  { buzzer_count: 10, order_ready_enabled: true, collection_interval_mins: 15, operator_collection_interval_mins: 10 },
  { buzzer_count: 1, order_ready_enabled: true, collection_interval_mins: 30, operator_collection_interval_mins: null },
]
const TRUCKS = [
  { takes_cash: false, show_paid_step: false, completion_presses: null },
  { takes_cash: true, show_paid_step: true, completion_presses: 'two' },
  { takes_cash: null, show_paid_step: null, completion_presses: null },
]
const TRI = [null, true, false]
const INTERVALS = [null, 5, 10, 15, 20, 30, 7, 0]

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 1 · 🔴 AN UNTYPED TRUCK IS BYTE-IDENTICAL TO THE PRE-BUILD TREE
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('1 · ZERO CHANGE FOR A TRUCK WITH NO TYPES — against the PRE-BUILD TREE')
{
  /* 🔴 THE "BEFORE" IS A REAL CHECKOUT, COMPILED. `headWorktree` puts the commit this build started
   * from on disk and compiles it, so "unchanged" is a comparison against code that actually ran — not
   * against an expression retyped into this file, which would only ever prove that I remember what I
   * wrote. */
  const { wt, remove } = headWorktree('et', 'HEAD')
  let BEFORE = null
  try {
    BEFORE = build(wt, LIB_BEFORE, 'et-before')

    /* ⚠️ THE BASELINE'S MEANING MOVED WITH THE BUILD (October 2026, stage 2b). At stage 1 HEAD was
     * the PRE-EVENT-TYPES tree, so this asserted the absence of the module. HEAD is now stage 1,
     * which HAS the module — so the premise is no longer "no event types existed" but "offline
     * protection was not yet a type setting", and that is what is asserted. Stage 1's own run proved
     * byte-identity against the pre-event-types tree; this run proves THIS build changed nothing. */
    t('🔴 the before tree is STAGE 1 — it has the resolver, without the offline one',
      BEFORE.resolve !== null
      && typeof BEFORE.resolve.resolveBuzzerPromptWithType === 'function'
      && BEFORE.resolve.resolveOfflineWithType === undefined)

    // ── 1a · BUZZERS ────────────────────────────────────────────────────────────────────────────
    let diffs = []
    for (const van of VANS) for (const ev of TRI) {
      const a = BEFORE.buzzer.resolveBuzzerPrompt(van, { buzzer_prompt: ev })
      /* ⚠️ THE THIRD ARGUMENT IS OMITTED, which is what every existing caller does. */
      const b = NOW.buzzer.resolveBuzzerPrompt(van, { buzzer_prompt: ev })
      if (J(a) !== J(b)) diffs.push({ van: van.buzzer_count, ev, a, b })
    }
    t(`🔴 resolveBuzzerPrompt is byte-identical across ${VANS.length * TRI.length} inputs`, diffs.length === 0)
    if (diffs.length) console.log('      ' + J(diffs.slice(0, 3)))

    // ── 1b · TAKE CASH / PAID STEP ──────────────────────────────────────────────────────────────
    diffs = []
    for (const truck of TRUCKS) for (const cash of TRI) for (const paid of TRI) {
      const ev = { takes_cash_override: cash, show_paid_step_override: paid, completion_presses_override: null }
      const a = BEFORE.paid.resolvePaidStep(truck, ev)
      const b = NOW.paid.resolvePaidStep(truck, ev)
      if (J(a) !== J(b)) diffs.push({ truck: truck.takes_cash, cash, paid, a, b })
    }
    t(`🔴 resolvePaidStep is byte-identical across ${TRUCKS.length * TRI.length * TRI.length} inputs — all three of its values`,
      diffs.length === 0)
    if (diffs.length) console.log('      ' + J(diffs.slice(0, 3)))

    // ── 1c · THE COLLECTION GRID ────────────────────────────────────────────────────────────────
    diffs = []
    for (const cust of INTERVALS) for (const op of INTERVALS) {
      const van = { customer: 15, truck: 10 }
      const override = { collection_interval_mins_override: cust, operator_collection_interval_mins_override: op }
      const a = BEFORE.slot.applyEventIntervals(van, override)
      const b = NOW.slot.applyEventIntervals(van, override)
      if (J(a) !== J(b)) diffs.push({ cust, op, a, b })
    }
    /* ⚠️ AND WITH NO OVERRIDE AT ALL, which is the state of every event today. */
    for (const o of [null, undefined, {}]) {
      const van = { customer: 20, truck: 20 }
      if (J(BEFORE.slot.applyEventIntervals(van, o)) !== J(NOW.slot.applyEventIntervals(van, o))) diffs.push({ o })
    }
    t(`🔴 applyEventIntervals is byte-identical across ${INTERVALS.length * INTERVALS.length + 3} inputs`, diffs.length === 0)
    if (diffs.length) console.log('      ' + J(diffs.slice(0, 3)))

    // ── 1d · THE MARK-READY STEP ────────────────────────────────────────────────────────────────
    /* 🔴 THE "BEFORE" HERE IS THE INLINE EXPRESSION, BECAUSE THAT IS WHERE IT LIVED. It was
     * `(event)?.order_ready_override ?? vanOrderReadyDefault` at app/api/dashboard/route.ts:635 — not
     * in a module — so it is reproduced from the pre-build SOURCE rather than retyped, and the source
     * it is read from is asserted below. */
    /* ⚠️ STAGE 1 ALREADY MOVED THIS OUT OF LINE, so the premise is now that the BEFORE tree resolves
     * it through the same function — and the comparison is resolver against resolver rather than
     * resolver against a remembered expression. Stronger, not weaker: it compares two compiled
     * implementations across the whole matrix. */
    const beforeSrc = fs.readFileSync(path.join(wt, 'app/api/dashboard/route.ts'), 'utf8')
    t('🔴 the before tree already resolved the mark-ready step through the resolver (the premise of 1d)',
      /effectiveOrderReady = resolveOrderReadyWithType\(/.test(beforeSrc)
      && typeof BEFORE.resolve.resolveOrderReadyWithType === 'function')
    const beforeOrderReady = (ev, src, vanDefault) =>
      BEFORE.resolve.resolveOrderReadyWithType(ev, src, null, vanDefault)

    diffs = []
    for (const van of VANS) for (const ev of TRI) for (const src of [null, 'seed', 'truck']) {
      const a = beforeOrderReady(ev, src, van.order_ready_enabled)
      /* 🔴 `null` FOR THE TYPE. Note the SOURCE is varied across all three values as well: an untyped
       * event must resolve the same way WHATEVER that column says, which is the guarantee that makes
       * the new column safe to add. */
      const b = NOW.resolve.resolveOrderReadyWithType(ev, src, null, van.order_ready_enabled)
      if (a !== b) diffs.push({ van: van.order_ready_enabled, ev, src, a, b })
    }
    t(`🔴 the mark-ready step is byte-identical across ${VANS.length * TRI.length * 3} inputs — INCLUDING every value of the new source column`,
      diffs.length === 0)
    if (diffs.length) console.log('      ' + J(diffs.slice(0, 4)))

    // ── 1d-ii · OFFLINE PROTECTION (stage 2b) ───────────────────────────────────────────────────
    /* 🔴 THE BEFORE TREE HAS NO OFFLINE RESOLVER, so the baseline is the three INLINE expressions it
     * used — and they are read from its SOURCE rather than retyped, so the comparison is against what
     * actually ran. All three are reproduced exactly:
     *     switch : event override !== null ? event override : van default
     *     mode   : event override ?? van default ?? 'pause'
     *     delay  : event override ?? van default
     * ⚠️ `?? 'pause'` AND `!== null ? :` ARE NOT INTERCHANGEABLE WITH `??` HERE and the before tree
     * used each where it did; the baseline keeps them. */
    const beforeDashSrc = fs.readFileSync(path.join(wt, 'app/dashboard/[token]/page.tsx'), 'utf8')
    t('🔴 the before tree really did resolve all three offline values inline (the premise of 1d-ii)',
      /const effectiveOfflineProtection=eventOfflineOverride!==null\?eventOfflineOverride:vanAutoPause/.test(beforeDashSrc)
      && /const effectiveOfflineMode:OfflineProtectionMode=eventOfflineModeOverride\?\?vanOfflineMode/.test(beforeDashSrc)
      && /const effectiveAutoRejectMins:number\|null=eventAutoRejectOverride\?\?vanAutoRejectMins/.test(beforeDashSrc))

    const MODES = [null, 'pause', 'no_auto_accept', 'nonsense']
    const DELAYS = [null, 5, 15, 30, 7, 0, 99]
    diffs = []
    for (const evOn of TRI) for (const evMode of MODES) for (const evDelay of DELAYS) {
      for (const van of [
        { auto_pause_on_offline: false, offline_protection_mode: null, offline_auto_reject_mins: null },
        { auto_pause_on_offline: true, offline_protection_mode: 'pause', offline_auto_reject_mins: 15 },
        { auto_pause_on_offline: true, offline_protection_mode: 'no_auto_accept', offline_auto_reject_mins: null },
      ]) {
        /* THE BEFORE TREE'S THREE EXPRESSIONS, verbatim. */
        const a = {
          enabled: evOn !== null ? evOn : (van.auto_pause_on_offline ?? false),
          mode: evMode ?? van.offline_protection_mode ?? 'pause',
          autoRejectMins: evDelay ?? van.offline_auto_reject_mins ?? null,
        }
        const b = NOW.resolve.resolveOfflineWithType(
          { offline_protection_override: evOn, offline_protection_mode_override: evMode, offline_auto_reject_mins_override: evDelay },
          null, van,
        )
        /* ⚠️ THE BEFORE TREE DID NOT VALIDATE THE MODE OR THE DELAY and the resolver does, so a value
         * OUTSIDE the vocabulary is allowed to differ — that is a deliberate hardening, not a
         * regression, and the two cases are named rather than hidden by a loose comparison. */
        const modeOutOfVocab = evMode === 'nonsense'
        const delayOutOfRange = evDelay !== null && !(Number.isInteger(evDelay) && evDelay >= 5 && evDelay <= 30)
        if (a.enabled !== b.enabled) diffs.push({ evOn, van: van.auto_pause_on_offline, a: a.enabled, b: b.enabled, which: 'switch' })
        if (!modeOutOfVocab && a.mode !== b.mode) diffs.push({ evMode, van: van.offline_protection_mode, a: a.mode, b: b.mode, which: 'mode' })
        if (!delayOutOfRange && a.autoRejectMins !== b.autoRejectMins) diffs.push({ evDelay, van: van.offline_auto_reject_mins, a: a.autoRejectMins, b: b.autoRejectMins, which: 'delay' })
      }
    }
    t(`🔴 OFFLINE PROTECTION is byte-identical across ${TRI.length * MODES.length * DELAYS.length * 3} inputs — switch, mode and delay`,
      diffs.length === 0)
    if (diffs.length) console.log('      ' + J(diffs.slice(0, 4)))

    /* ⚠️ AND THE HARDENING IS ASSERTED RATHER THAN ASSUMED, so "allowed to differ" above is not a
     * licence to differ in any direction. */
    t('⚠️ an out-of-vocabulary mode and an out-of-range delay are coerced, not passed through', (() => {
      const r = NOW.resolve.resolveOfflineWithType(
        { offline_protection_override: true, offline_protection_mode_override: 'nonsense', offline_auto_reject_mins_override: 99 },
        null, { auto_pause_on_offline: true, offline_protection_mode: 'no_auto_accept', offline_auto_reject_mins: 20 },
      )
      return r.mode === 'no_auto_accept' && r.autoRejectMins === 20
    })())

    // ── 1e · THE PRICE PATH IS NOT TOUCHED AT ALL ───────────────────────────────────────────────
    /* 🔴 THE STRONGEST AVAILABLE PROOF ABOUT THE SUBMIT ROUTE'S PRICED ARRAYS IS THAT THE CODE THAT
     * BUILDS THEM IS UNCHANGED. The route cannot be run here (it needs a database and Stripe), and a
     * harness that pretended to render it would be proving something about a mock. Instead: every file
     * in the price path is compared byte-for-byte against the pre-build tree.
     * ⚠️ `app/api/orders/submit/route.ts` IS ON THIS LIST and must stay on it. Stage 6 is where prices
     * change; if this assertion ever fails, something in THIS stage has reached the money path. */
    const PRICE_PATH = [
      'lib/order-repricing.ts', 'lib/order-calculations.ts', 'app/api/orders/submit/route.ts',
      'lib/payments/paid-step.ts',
    ]
    const changed = []
    for (const f of PRICE_PATH) {
      const before = fs.readFileSync(path.join(wt, f), 'utf8')
      const now = fs.readFileSync(path.join(REPO, f), 'utf8')
      if (before !== now) changed.push(f)
    }
    /* ⚠️ NOTHING IS ALLOWED TO DIFFER NOW. At stage 1 `paid-step.ts` was the one permitted change (it
     * gained the optional type argument); that landed in HEAD, so this build must leave the whole
     * price path alone. If this ever fails, something in THIS stage has reached the money path. */
    t('🔴 THE PRICE PATH IS UNCHANGED — repricing, the calculator, the submit route and the paid step',
      changed.length === 0)
    if (changed.length) console.log('      changed: ' + J(changed))

    /* ⚠️ AND THE SUBMIT ROUTE NAMES NOTHING FROM THIS FEATURE, which is the same claim from the other
     * direction and would catch an import added without changing behaviour. */
    const submit = fs.readFileSync(path.join(REPO, 'app/api/orders/submit/route.ts'), 'utf8')
    t('🔴 …and the submit route does not so much as import event types',
      !/event-types/.test(submit) && !/event_type/.test(submit))

    // ── 1f · THE PLAN GATE IS SHUT FOR EVERY PLAN BUT MAX AND TRIAL ─────────────────────────────
    const gate = (plan, trialExpiry) => NOW.features.canAccess(plan, 'event_types', {}, trialExpiry ?? null)
    t('🔴 event_types is MAX only, so Max and the trial set — and nothing else',
      gate('max') === true && gate('trial') === true && gate('demo') === true && gate('tester') === true
      && gate('starter') === false && gate('pro') === false)
    t('⚠️ an EXPIRED trial loses it, and a not-yet-started trial keeps it',
      gate('trial', '2020-01-01') === false && gate('trial', null) === true)
    t('⚠️ a per-truck override still wins both ways',
      NOW.features.canAccess('starter', 'event_types', { event_types: true }, null) === true
      && NOW.features.canAccess('max', 'event_types', { event_types: false }, null) === false)
    /* ⛔ AND NO OTHER FEATURE'S ACCESS MOVED. Adding a key to MAX_FEATURES is a one-line edit to a
     * shared list, and a mistyped bracket there would silently re-plan a different feature. */
    const FEATURES = ['online_payments', 'embed_schedule', 'whatsapp_replies', 'ticket_printing', 'qr_menu', 'advance_preordering']
    const moved = FEATURES.filter(f => ['starter', 'pro', 'max', 'trial', 'demo', 'tester']
      .some(p => BEFORE.features.canAccess(p, f, {}, null) !== NOW.features.canAccess(p, f, {}, null)))
    t('⛔ no OTHER feature changed plan when the key was added', moved.length === 0)
    if (moved.length) console.log('      moved: ' + J(moved))
  } finally { remove() }

  // ── 1g · A TYPED FIXTURE MUST DIFFER, OR SECTION 1 PROVES NOTHING ─────────────────────────────
  /* 🔴 THE CONTROL ON THE WHOLE OF SECTION 1. Every assertion above is "these are the same"; without
   * this one they would all pass on a resolver that ignored its type argument entirely. */
  const typed = typeWith({ buzzer_prompt: false, takes_cash: true, order_ready: true, collection_interval_mins: 30, offline_protection: false })
  const r = NOW.resolve
  const differs = [
    r.resolveBuzzerPromptWithType(null, typed) !== r.resolveBuzzerPromptWithType(null, null),
    r.resolveTakesCashWithType(null, typed, false) !== r.resolveTakesCashWithType(null, null, false),
    r.resolveOrderReadyWithType(false, 'seed', typed, false) !== r.resolveOrderReadyWithType(false, 'seed', null, false),
    J(r.resolveIntervalsWithType({ customer: 5, truck: 5 }, null, typed)) !== J(r.resolveIntervalsWithType({ customer: 5, truck: 5 }, null, null)),
    r.resolveOfflineWithType(null, typed, { auto_pause_on_offline: true }).enabled
      !== r.resolveOfflineWithType(null, null, { auto_pause_on_offline: true }).enabled,
  ]
  t('🔴 CONTROL: a TYPED fixture differs on all FIVE settings — so "identical" above is a real finding',
    differs.every(Boolean))
  if (!differs.every(Boolean)) console.log('      ' + J(differs))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · THE RULE: HAND CHANGE ?? TYPE ?? DEFAULT
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('2 · HAND CHANGE ?? TYPE ?? DEFAULT')
{
  const r = NOW.resolve

  t('🔴 A HAND CHANGE BEATS THE TYPE — buzzers', (() => {
    const type = typeWith({ buzzer_prompt: true })
    return r.resolveBuzzerPromptWithType(false, type) === false     // the truck switched it off here
      && r.resolveBuzzerPromptWithType(null, type) === true          // untouched ⇒ the type
  })())

  t('🔴 A HAND CHANGE BEATS THE TYPE — take cash', (() => {
    const type = typeWith({ takes_cash: true })
    return r.resolveTakesCashWithType(false, type, false) === false
      && r.resolveTakesCashWithType(null, type, false) === true
  })())

  t('🔴 A HAND CHANGE BEATS THE TYPE — the collection grid', (() => {
    const van = { customer: 5, truck: 5 }
    const type = typeWith({ collection_interval_mins: 30 })
    const own = { collection_interval_mins_override: 15, operator_collection_interval_mins_override: null }
    return r.resolveIntervalsWithType(van, own, type).customer === 15
      && r.resolveIntervalsWithType(van, null, type).customer === 30
  })())

  t('🔴 `false` ON A TYPE IS AN INSTRUCTION, NOT "UNSET" — the `||` bug', (() => {
    /* A type that switches buzzers OFF must beat the "this van has a rack" default. With `||` the
     * false would read as unset and silently re-inherit, and the setting would never work. */
    return r.resolveBuzzerPromptWithType(null, typeWith({ buzzer_prompt: false })) === false
      && r.resolveTakesCashWithType(null, typeWith({ takes_cash: false }), true) === false
      && r.resolveOrderReadyWithType(null, null, typeWith({ order_ready: false }), true) === false
  })())

  t('⚠️ a type that sets nothing is the default, exactly', (() => {
    const empty = typeWith({})
    return r.resolveBuzzerPromptWithType(null, empty) === r.resolveBuzzerPromptWithType(null, null)
      && r.resolveTakesCashWithType(null, empty, true) === true
      && J(r.resolveIntervalsWithType({ customer: 15, truck: 10 }, null, empty)) === J({ customer: 15, truck: 10 })
  })())

  t('🔴 A VAN WITH NO BUZZER RACK STILL WINS — a type cannot conjure one', (() => {
    const b = NOW.buzzer.resolveBuzzerPrompt({ buzzer_count: null }, { buzzer_prompt: null }, typeWith({ buzzer_prompt: true }))
    return b.buzzerPrompt === false && b.buzzerCount === null
  })())

  t('⚠️ the type reaches resolvePaidStep’s takesCash and NOTHING else it returns', (() => {
    const truck = { takes_cash: false, show_paid_step: true, completion_presses: 'two' }
    const a = NOW.paid.resolvePaidStep(truck, null, null)
    const b = NOW.paid.resolvePaidStep(truck, null, typeWith({ takes_cash: true }))
    return b.takesCash === true && a.takesCash === false
      && a.showPaidStep === b.showPaidStep && a.completionPresses === b.completionPresses
  })())

  t('⚠️ the operator grid follows the type’s customer grid, as an event override makes it follow', (() => {
    const out = r.resolveIntervalsWithType({ customer: 5, truck: 20 }, null, typeWith({ collection_interval_mins: 15 }))
    return out.customer === 15 && out.truck === 15
  })())

  t('⚠️ a type’s out-of-vocabulary interval is coerced, never published raw', (() => {
    const out = r.resolveIntervalsWithType({ customer: 10, truck: 10 }, null, typeWith({ collection_interval_mins: 7 }))
    return out.customer === 5 && out.truck === 5
  })())
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 3 · THE SCREENS' WORDING COMES FROM THE SAME PLACE AS THE VALUES
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('3 · WHAT THE SCREENS SAY')
{
  const r = NOW.resolve

  t('🔴 the summary names only settings this build RESOLVES — no prices, no menu, no deals', (() => {
    const s = r.summariseType(typeWith({ buzzer_prompt: true, collection_interval_mins: 10 }))
    return /buzzers on/.test(s) && /collection every 10 min/.test(s)
      && !/price/i.test(s) && !/item/i.test(s) && !/deal/i.test(s) && !/menu/i.test(s)
  })())
  t('⚠️ a type that changes nothing says so rather than rendering an empty line',
    r.summariseType(typeWith({})) === 'Same as Standard' && r.summariseType(null) === 'Your normal setup')
  t('⚠️ "off" is said out loud, not omitted', /buzzers off/.test(r.summariseType(typeWith({ buzzer_prompt: false }))))
  t('⚠️ changedCount counts the four settings and nothing else',
    r.changedCount(typeWith({})) === 0 && r.changedCount(typeWith({ takes_cash: false })) === 1
    && r.changedCount(typeWith({ buzzer_prompt: true, takes_cash: false, order_ready: true, collection_interval_mins: 5 })) === 4
    && r.changedCount(null) === 0)

  /* 🔴 ONE LIST OF SETTINGS, USED EVERYWHERE. A fifth place that spelled them out is a place that
   * could fall out of step when stage 3 adds one. */
  const ty = NOW.types
  /* ── 🔴 TWO LISTS, TWO JOBS, AND THEY ARE NOT THE SAME LENGTH ─────────────────────────────────
   * Offline protection is ONE row to an operator and THREE columns in the database, so `SERVICE_KEYS`
   * (the type's columns, 7) and `SERVICE_ROWS` (what a human sees, 5) answer different questions.
   * Collapsing them is what would make "2 of 5 settings changed" count an offline change three times.
   * This asserts the split holds and that every derived list comes from the ROWS. */
  t('🔴 SERVICE_ROWS drives the labels, the override columns and the clear-my-changes list', (() => {
    const rows = ty.SERVICE_ROWS
    const keys = ty.SERVICE_KEYS
    return rows.length === 5 && keys.length === 7
      && rows.every(r => typeof ty.SERVICE_LABELS[r.id] === 'string' && ty.SERVICE_LABELS[r.id].length > 0)
      && rows.every(r => Array.isArray(ty.EVENT_OVERRIDE_COLUMNS[r.id]) && ty.EVENT_OVERRIDE_COLUMNS[r.id].length > 0)
      && Object.keys(ty.EVENT_OVERRIDE_COLUMNS).length === rows.length
      // every row's keys are real type columns, and together they are ALL of them
      && rows.flatMap(r => r.keys).every(k => keys.includes(k))
      && new Set(rows.flatMap(r => r.keys)).size === keys.length
      // the offline row owns three of them; every other row owns one
      && rows.find(r => r.id === 'offline_protection').keys.length === 3
      && rows.filter(r => r.id !== 'offline_protection').every(r => r.keys.length === 1)
  })())
  t('🔴 CLEARABLE_EVENT_COLUMNS is the flattened rows — so it cannot fall out of step', (() => {
    const flat = ty.SERVICE_ROWS.flatMap(r => r.eventColumns)
    return ty.CLEARABLE_EVENT_COLUMNS.length === flat.length
      && flat.every(c => ty.CLEARABLE_EVENT_COLUMNS.includes(c))
      // the three offline override columns are in it, which is what this build added
      && ['offline_protection_override', 'offline_protection_mode_override', 'offline_auto_reject_mins_override']
        .every(c => ty.CLEARABLE_EVENT_COLUMNS.includes(c))
  })())
  t('🔴 "clear my changes" clears the collection pair TOGETHER — an operator-only override is invalid', (() => {
    const cols = ty.EVENT_OVERRIDE_COLUMNS.collection_interval_mins
    return cols.includes('collection_interval_mins_override')
      && cols.includes('operator_collection_interval_mins_override')
  })())
  t('⛔ …and it clears NOTHING a type cannot set', (() => {
    const all = ty.CLEARABLE_EVENT_COLUMNS
    /* ⚠️ `offline_protection_override` LEFT THIS LIST AND IS NOW EXPECTED — a type CAN set offline
     * protection as of this build, so clearing it is correct. The MARKERS the monitor writes
     * (`online_paused_until`, `offline_no_autoaccept_until`) must still never be cleared here: they
     * are state about what already happened, not a setting. */
    const forbidden = ['paused_until', 'online_paused_until', 'offline_no_autoaccept_until',
      'extra_wait_mins', 'show_paid_step_override', 'completion_presses_override',
      'status', 'event_date', 'van_id', 'event_type_id']
    return forbidden.every(c => !all.includes(c))
  })())

  t('🔴 a new type is a copy of Standard — every value null', (() => {
    const b = ty.blankTypeValues()
    return ty.SERVICE_KEYS.every(k => b[k] === null)
  })())
  /* ── 🔴 §2 · THE CHIPS ARE NAMES, AND A NEW TYPE STARTS EXACTLY LIKE STANDARD ─────────────────
   * The first build's chips were SUGGESTIONS carrying pre-filled values, so two trucks tapping
   * "Festival" each got three settings changed for them with nothing afterwards saying which three.
   * The chips are now names only. This is the check that keeps them that way. */
  t('🔴 THE NAME CHIPS CARRY NAMES AND NOTHING ELSE', (() => {
    const chips = ty.TYPE_NAME_CHIPS
    return Array.isArray(chips) && chips.length === 4
      && chips.every(c => typeof c === 'string' && c.length > 0)
      // ⛔ AND THE OLD SHAPE IS GONE, so nothing can still be reading values off a chip.
      && ty.TYPE_SUGGESTIONS === undefined
  })())
  t('🔴 "Private hire" IS STILL OFFERED BY NAME — a chip with no values promises nothing',
    ty.TYPE_NAME_CHIPS.includes('Private hire'))
  t('🔴 EVERY NEW TYPE STARTS WITH EVERY SETTING NULL, whichever chip was tapped', (() => {
    /* `blankTypeValues()` is the only starting state, and `create` has no other source for one: the
     * route must take the NAME from the body and the values from that function. */
    const b = ty.blankTypeValues()
    const route = fs.readFileSync(path.join(REPO, 'app/api/event-types/route.ts'), 'utf8')
    const create = route.slice(route.indexOf("if (action === 'create')"), route.indexOf("if (action === 'update')"))
    return ty.SERVICE_KEYS.every(k => b[k] === null)
      && Object.keys(b).length === ty.SERVICE_KEYS.length
      && /blankTypeValues\(\)\[k\]/.test(create)
      // ⛔ NOTHING IN THE CREATE PATH READS A CHIP'S VALUES, because a chip has none.
      && !/TYPE_SUGGESTIONS|sug\.values/.test(route)
  })())
  t('🔴 …and the popup says so, in the board’s words', (() => {
    const ui = fs.readFileSync(path.join(REPO, 'components/manage/EventTypes.tsx'), 'utf8')
    return /It starts exactly like Standard\. Change anything after\./.test(ui)
      // ⛔ and it shows no per-chip description
      && !/sug\.description/.test(ui)
  })())
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · 🔴 THE MARK-READY STEP — THE SEEDED VALUE, AND WHY IT IS NOT A HAND CHANGE
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('4 · THE SEEDED order_ready_override')
{
  const r = NOW.resolve
  const type = typeWith({ order_ready: true })

  t('🔴 A SEEDED VALUE DOES NOT BLOCK THE TYPE — the whole reason the source column exists',
    r.resolveOrderReadyWithType(false, 'seed', type, false) === true)
  t('🔴 A TRUCK’S OWN TOGGLE DOES BLOCK IT',
    r.resolveOrderReadyWithType(false, 'truck', type, false) === false)
  t('⚠️ no stored value at all ⇒ the type is unopposed',
    r.resolveOrderReadyWithType(null, null, type, false) === true
    && r.resolveOrderReadyWithType(undefined, 'seed', type, false) === true)

  /* 🔴 THE INFERENCE FOR PRE-BUILD ROWS, WHERE THE SOURCE IS NOT RECORDED. */
  t('🔴 source NULL, value DIFFERS from the van default ⇒ somebody chose it, so it wins',
    r.resolveOrderReadyWithType(true, null, typeWith({ order_ready: false }), false) === true)
  t('🔴 source NULL, value EQUALS the van default ⇒ indistinguishable from a seed, so the type wins',
    r.resolveOrderReadyWithType(false, null, type, false) === true)

  t('⚠️ THE BADGE AGREES WITH THE VALUE, by construction', (() => {
    const cases = []
    for (const ev of [null, true, false]) for (const src of [null, 'seed', 'truck']) for (const ty of [null, type]) {
      const isOwn = r.orderReadyIsHandChange(ev, src, ty, false)
      const value = r.resolveOrderReadyWithType(ev, src, ty, false)
      /* A value flagged as the truck's own MUST be the truck's stored value; one that is not flagged
       * must NOT have come from it (unless they happen to agree). */
      if (isOwn && value !== ev) cases.push({ ev, src, ty: !!ty, isOwn, value })
    }
    return cases.length === 0
  })())
  t('⚠️ an UNTYPED event is "own" exactly when it has a stored value — today’s meaning, unchanged',
    r.orderReadyIsHandChange(true, null, null, false) === true
    && r.orderReadyIsHandChange(null, null, null, false) === false
    && r.orderReadyIsHandChange(false, 'seed', null, false) === true)

  // ── THE WRITERS ─────────────────────────────────────────────────────────────────────────────────
  /* 🔴 THE RESOLVER IS ONLY CORRECT IF THE WRITERS RECORD THE SOURCE. Read from the real source,
   * because a pure check on the resolver would pass with every writer still silent. */
  const manage = fs.readFileSync(path.join(REPO, 'app/api/manage/route.ts'), 'utf8')
  const dashAction = fs.readFileSync(path.join(REPO, 'app/api/dashboard/action/route.ts'), 'utf8')
  const inbound = fs.readFileSync(path.join(REPO, 'app/api/inbound-schedule/route.ts'), 'utf8')

  t('🔴 all three CREATION paths record ’seed’', (() => {
    return /order_ready_source: typedEventTypeId \? null : 'seed'/.test(manage)
      && /order_ready_source: 'seed', source: 'manual'/.test(dashAction)
      && /order_ready_source: 'seed',/.test(inbound)
  })())
  t('🔴 the Settings MASTER SWITCH records ’seed’ — it overwrites per-event choices by design',
    /\.update\(\{ order_ready_override: order_ready_enabled, order_ready_source: 'seed' \}\)/.test(manage))
  t('🔴 the DASHBOARD toggle is the ONLY writer that records ’truck’', (() => {
    const truckWrites = codeOf(manage + dashAction + inbound).match(/order_ready_source: 'truck'/g) || []
    return truckWrites.length === 1
      && /order_ready_override: value, order_ready_source: 'truck'/.test(dashAction)
  })())
  t('🔴 ADD EVENT DOES NOT SEED THE VALUE WHEN A TYPE WAS CHOSEN — or the type could never win',
    /order_ready_override: typedEventTypeId \? null : seededOrderReady/.test(manage))
  t('⚠️ …and an UNTYPED add event seeds exactly what it seeded before', (() => {
    /* The ternary's false branch is the original expression, unchanged. */
    return /typedEventTypeId \? null : seededOrderReady/.test(manage)
      && /const seededOrderReady = await getVanOrderReadyDefault\(supabase, targetTruckId, resolvedVanId\)/.test(manage)
  })())
  t('⛔ the other three creation paths leave event_type_id unset', (() => {
    /* Only `upsert_event` names it. The dashboard draft, the scraper bridge and the demo must not. */
    const demo = fs.readFileSync(path.join(REPO, 'lib/provision-demo-event.ts'), 'utf8')
    /* ⚠️ READ FROM THE CODE, NOT THE PROSE. Both of those files carry a note saying `event_type_id` is
     * deliberately left unset — which is exactly the kind of comment this check wants to encourage. */
    return /event_type_id: typedEventTypeId/.test(codeOf(manage))
      && !/event_type_id/.test(codeOf(inbound)) && !/event_type_id/.test(codeOf(demo))
      && !/event_type_id/.test(codeOf(dashAction))
  })())
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 5 · THE WIRING — every reader goes through the resolvers, and the gate is server-side
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('5 · THE WIRING')
{
  const dash = fs.readFileSync(path.join(REPO, 'app/api/dashboard/route.ts'), 'utf8')
  const dashAction = fs.readFileSync(path.join(REPO, 'app/api/dashboard/action/route.ts'), 'utf8')
  const dashPage = fs.readFileSync(path.join(REPO, 'app/dashboard/[token]/page.tsx'), 'utf8')
  const kds = fs.readFileSync(path.join(REPO, 'app/dashboard/[token]/kds/page.tsx'), 'utf8')
  const events = fs.readFileSync(path.join(REPO, 'app/api/events/route.ts'), 'utf8')
  const slot = fs.readFileSync(path.join(REPO, 'lib/slot-interval.ts'), 'utf8')
  const route = fs.readFileSync(path.join(REPO, 'app/api/event-types/route.ts'), 'utf8')
  const page = fs.readFileSync(path.join(REPO, 'app/manage/[token]/page.tsx'), 'utf8')
  const ui = fs.readFileSync(path.join(REPO, 'components/manage/EventTypes.tsx'), 'utf8')

  t('🔴 THE MARK-READY STEP IS NO LONGER RESOLVED INLINE', (() => {
    return /effectiveOrderReady = resolveOrderReadyWithType\(/.test(dash)
      && !/order_ready_override \?\? vanOrderReadyDefault/.test(dash.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''))
  })())
  t('🔴 the dashboard passes the type to the buzzer resolver',
    /resolveBuzzerPrompt\(van as any, capacityEvent as any, eventTypeRead\.type\)/.test(dash))
  t('🔴 the dashboard reads the type ONCE, probed, outside the named truck_events select',
    /const eventTypeRead = await readEventType\(supabase, selectedEventId\)/.test(dash)
    && !/event_type_id/.test(dash.slice(dash.indexOf("const eventCols"), dash.indexOf("const eventCols") + 400)))
  t('🔴 the SERVER resolves takesCash through the type, and so does the dashboard CLIENT',
    /resolvePaidStep\(truck, ev as any, et\.type\)/.test(dashAction)
    && /resolvePaidStep\(truck,activeEvent,eventType\)/.test(dashPage))
  /* ⚠️ THE KDS IS DELIBERATELY UNCHANGED: it destructures `showPaidStep` only, and a type does not set
   * that. Asserted so the omission is a decision on record rather than something overlooked. */
  t('⛔ the KDS is untouched because it reads only showPaidStep, which no type sets',
    /const \{ showPaidStep \} = resolvePaidStep\(truck, activeEvent\)/.test(kds)
    && !/event-types/.test(kds))
  t('🔴 the public events feed publishes the TYPE’s customer grid, batched',
    /readEventTypesForTruck\(supabase, truck\.id, today\)/.test(events)
    && /eventTypes\.byEventId\.get\(e\.id\) \?\? null/.test(events))
  t('🔴 resolveIntervalsFor reads the type and still lets the event’s own pair win',
    /const et = await readEventType\(supabase, eventId\)/.test(slot)
    && /applyEventIntervals\(van, ev\.override, et\.type\)/.test(slot))

  t('🔴 THE PLAN GATE IS CHECKED ON EVERY ACTION BUT `load`, by exclusion not by a list', (() => {
    return /if \(action !== 'load' && !canWrite\)/.test(route)
      && /canAccess\(truck\.plan as never, 'event_types'/.test(route)
      /* ⚠️ `load` STAYS OPEN SO EXISTING TYPES KEEP RESOLVING ON A DOWNGRADE — decision 4 — and says
       * so with readOnly. */
      && /readOnly: !canWrite/.test(route)
  })())
  t('⛔ nothing spreads the request body into a write', (() => {
    const writes = route.match(/\.(insert|update)\(([^)]*)\)/g) || []
    return writes.length > 0 && !writes.some(w => /\.\.\.body/.test(w))
  })())
  t('🔴 assigning a type is ONE column write, plus the clear-my-changes list when asked',
    /event_type_id: typeId, updated_at/.test(route)
    && /for \(const k of SERVICE_KEYS\) for \(const col of EVENT_OVERRIDE_COLUMNS\[k\]\) patch\[col\] = null/.test(route))
  t('🔴 deleting a type does NOT write to its events — the FK does it',
    (() => {
      const del = route.slice(route.indexOf("if (action === 'delete')"), route.indexOf("if (action === 'assign')"))
      return /from\('event_types'\)\.delete\(\)/.test(del) && !/truck_events/.test(del)
    })())

  /* 🔴 ONE-LINE MOUNTS. The merge cost of this feature is these three lines plus one import each. */
  t('🔴 the manage page mounts the panel and the picker in one line each',
    /\{showEventTypes && <EventTypesPanel token=\{token\} onClose=\{\(\) => setShowEventTypes\(false\)\} \/>\}/.test(page)
    && /<EventTypeSelect token=\{token\} venueName=\{editingEvent\.venue_name\}/.test(page)
    && /import \{ EventTypesPanel, EventTypeSelect \} from '@\/components\/manage\/EventTypes'/.test(page))
  t('🔴 the type is sent on CREATE only, never on an edit',
    /\.\.\.\(editingEvent\.id \? \{\} : \{ event_type_id: eventTypeId \}\)/.test(page))
  t('⚠️ the picker is cleared every time the modal opens', /setEventTypeId\(null\)/.test(page))
  /* ⚠️ THE MOUNT CHANGED (stage 2b): the standalone type control became the "This event" CARD, which
   * is where five per-event controls now live. Still one mount and one import. */
  t('🔴 the dashboard mounts the "This event" CARD in one line',
    /<ThisEventCard/.test(dashPage)
    && /import \{ ThisEventCard, useEventDeals \} from '@\/components\/dashboard\/ThisEventCard'/.test(dashPage)
    // ⛔ and the control it replaced is gone from this screen
    && !/<EventTypeDashboardControl/.test(dashPage))

  // ── THE SCREENS SHOW ONLY WHAT WORKS ─────────────────────────────────────────────────────────
  t('⛔ THE PANEL SHOWS THE SERVICE SECTION ONLY — no prices, items, stock, deals or private', (() => {
    const code = ui.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    return /SERVICE</.test(code)
      && !/>Prices</.test(code) && !/>Items</.test(code) && !/>Stock</.test(code)
      && !/>Deals</.test(code) && !/>Private</.test(code)
  })())
  t('🔴 the confirm says all three things a live switch has to say', (() => {
    return /New orders use \{targetName\}’s service settings\./.test(ui)
      && /Orders already placed keep their prices\./.test(ui)
      && /for this event stay\./.test(ui)
      && /Clear my changes and use \{targetName\} exactly/.test(ui)
  })())
  t('🔴 Standard is first and read-only, and says "Set per van" when the vans disagree',
    /name: 'Standard'/.test(ui) && /Set per van/.test(ui)
    && /Change these in Settings, not here\./.test(ui))
  t('⚠️ the panel offers rename, reorder, delete-with-confirm and the upcoming count',
    />Rename</.test(ui) && />Delete</.test(ui) && /will go back to Standard/.test(ui)
    && /upcoming event\{/.test(ui) && /action: 'reorder'/.test(ui))
  t('⚠️ on a phone it is one column with a picker above', /md:hidden/.test(ui) && /et-phone-pick/.test(ui))
  t('⚠️ the Add event picker shows the "(usual for this place)" hint',
    /\(usual for this place\)/.test(ui) && /action: 'usual_for_venue'/.test(ui))
  t('⛔ the picker renders NOTHING for a truck with no types',
    /if \(!ready \|\| types\.length === 0\) return null/.test(ui))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 5b · STAGE 2b · THE MODAL, THE CONTROLS-IN-COLUMN RULE, AND THE DEALS
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('5b · THE MODAL AND THE CARD')
{
  const ui = fs.readFileSync(path.join(REPO, 'components/manage/EventTypes.tsx'), 'utf8')
  const card = fs.readFileSync(path.join(REPO, 'components/dashboard/ThisEventCard.tsx'), 'utf8')
  const dashAction = fs.readFileSync(path.join(REPO, 'app/api/dashboard/action/route.ts'), 'utf8')
  const dashPage = fs.readFileSync(path.join(REPO, 'app/dashboard/[token]/page.tsx'), 'utf8')
  const monitor = fs.readFileSync(path.join(REPO, 'supabase/functions/heartbeat-monitor/index.ts'), 'utf8')

  /* ── 🔴 §1 · A CENTRED MODAL WITH FIXED-WIDTH COLUMNS THAT SCROLL ────────────────────────────── */
  t('🔴 IT IS A ~1000px CENTRED MODAL THAT NEVER GROWS', (() => {
    return /max-w-\[1000px\]/.test(ui)
      && /max-h-\[92vh\]/.test(ui)
      // ⛔ and it is no longer the full-screen panel the first build used
      && !/fixed inset-0 z-50 bg-slate-50 flex flex-col/.test(ui)
  })())
  t('🔴 EVERY TYPE COLUMN IS A FIXED 230px, so a column does not shrink as types are added', (() => {
    return /gridTemplateColumns: `200px repeat\(\$\{types\.length \+ 1\}, 230px\)`/.test(ui)
      // ⛔ the first build's shrinking columns are gone
      /* ⚠️ COUNTED IN THE CODE: the note above this check names the old template on purpose, and a
       * check that forbade writing down what was replaced would forbid explaining the fix. */
      && !/minmax\(150px, 1fr\)/.test(codeOf(ui))
  })())
  t('🔴 …and when they no longer fit, THE COLUMNS scroll — not the dialog',
    /overflow-x-auto[^"]*" data-types-scroller/.test(ui) || /data-types-scroller/.test(ui))

  /* ── 🔴 THE CONTROLS ARE IN THEIR OWN TYPE'S COLUMN, NEVER IN THE LABEL COLUMN ────────────────
   * This is the defect the rewrite exists to fix. `SettingRow` renders three things in order: the
   * LABEL cell, the STANDARD cell, then one cell per type containing `<TypeControl>` — and the label
   * cell must contain nothing but the label. */
  t('🔴 NO CONTROL IS IN THE LABEL COLUMN', (() => {
    const row = ui.slice(ui.indexOf('function SettingRow('), ui.indexOf('function TypeControl('))
    const labelCell = row.slice(row.indexOf('text-sm font-semibold text-slate-900 min-h-11'), row.indexOf('{/* 🔴 STANDARD IS READ-ONLY'))
    return /\{row\.label\}/.test(labelCell)
      && !/<select|<button|<TypeControl|role="switch"/.test(labelCell)
      // and the per-type cell is where the control is
      && /\{types\.map\(t => \([\s\S]{0,400}<TypeControl row=\{row\}/.test(row)
  })())
  t('🔴 STANDARD IS READ-ONLY — its cell renders text, never a control', (() => {
    const row = ui.slice(ui.indexOf('function SettingRow('), ui.indexOf('function TypeControl('))
    const stdCell = row.slice(row.indexOf('{/* 🔴 STANDARD IS READ-ONLY'), row.indexOf('{types.map'))
    return /standardText\(row, standard\)/.test(stdCell) && !/<select|<button/.test(stdCell)
  })())
  t('🔴 "Set per van" is what Standard says where the vans disagree',
    /return 'Set per van'/.test(ui) && /perVan/.test(ui))

  /* ── 🔴 "SAME AS STANDARD" IS A REAL STATE ON BOTH CONTROL KINDS ──────────────────────────────── */
  t('🔴 for a DROPDOWN it is the first option', (() => {
    /* The interval select's first option, and the offline list's first entry. */
    const ctl = ui.slice(ui.indexOf('function TypeControl('))
    return /<option value="">Same as Standard<\/option>/.test(ctl)
      && /\{ value: '', label: 'Same as Standard' \}/.test(ui)
      && ui.indexOf("{ value: '', label: 'Same as Standard' }") < ui.indexOf("{ value: 'off', label: 'Off' }")
  })())
  t('🔴 for a SWITCH it is a GREYED switch labelled "Same as Standard"', (() => {
    const ctl = ui.slice(ui.indexOf('// ── A SWITCH ──'))
    return /const explicit = value === true \|\| value === false/.test(ctl)
      && /\$\{explicit \? '' : 'opacity-45'\}/.test(ctl)
      && /<span className="text-xs text-slate-400 truncate">Same as Standard<\/span>/.test(ctl)
  })())
  t('🔴 …tapping an inheriting switch sets an EXPLICIT value',
    /onPatch\(\{ \[key\]: explicit \? !value : true \}\)/.test(ui))
  t('🔴 …and a small "Same as Standard" link beside an explicit value returns it to NULL', (() => {
    const ctl = ui.slice(ui.indexOf('// ── A SWITCH ──'))
    return /onClick=\{\(\) => onPatch\(\{ \[key\]: null \}\)\}/.test(ctl)
      && /THE WAY BACK TO NULL/.test(ctl)
  })())

  /* ── 🔴 THE ⋯ MENU ──────────────────────────────────────────────────────────────────────────── */
  t('🔴 Rename, Move left, Move right and Delete are in a ⋯ MENU on each type header', (() => {
    const hdr = ui.slice(ui.indexOf('{/* heading row */}'), ui.indexOf('SERVICE</div>'))
    return /aria-label=\{`More for \$\{t\.name\}`\}/.test(hdr)
      && />Rename</.test(hdr) && />Move left</.test(hdr) && />Move right</.test(hdr) && />Delete</.test(hdr)
  })())
  t('⚠️ the "Used by" row stays', /USED BY<\/div>/.test(ui) && /Upcoming events/.test(ui))
  t('⚠️ on a phone it is one column with a picker at the top',
    /md:hidden/.test(ui) && /et-phone-pick/.test(ui))

  /* ── 🔴 §3 · OFFLINE PROTECTION OFFERS WHAT THE SETTINGS CONTROL OFFERS ───────────────────────
   * Settings › Kitchen offers a SWITCH then a MODE; the type's dropdown says the same in one control,
   * and its two mode values come from the SAME constants that screen renders. */
  t('🔴 the offline dropdown is Same as Standard · Off · the two real modes', (() => {
    return /OFFLINE_CHOICES/.test(ui)
      && /\.\.\.OFFLINE_PROTECTION_MODES\.map\(m => \(\{ value: m\.value as string, label: m\.label \}\)\)/.test(ui)
      && OFFLINE_MODES_COUNT === 2
  })())
  t('🔴 …and it writes BOTH columns, so "Off" is not mistaken for "inherit"', (() => {
    const fn = ui.slice(ui.indexOf('function offlinePatch('), ui.indexOf('const Dot ='))
    return /if \(value === ''\) return \{ offline_protection: null, offline_protection_mode: null \}/.test(fn)
      && /if \(value === 'off'\) return \{ offline_protection: false, offline_protection_mode: null \}/.test(fn)
      && /return \{ offline_protection: true, offline_protection_mode: value \}/.test(fn)
  })())
  /* ⛔ THE DELAY IS DELIBERATELY NOT OFFERED ON A TYPE — see the report. Asserted so the omission is a
   * decision on record rather than something overlooked, and so that adding it later is a conscious
   * act that has to change this check. */
  t('⛔ the type screen does NOT offer the auto-reject delay, and says why',
    !/OFFLINE_AUTO_REJECT_OPTIONS/.test(ui)
    && /THE AUTO-REJECT DELAY IS NOT OFFERED ON A TYPE/.test(ui))

  /* 🔴 THE MONITOR IS THE THING THAT ACTS, and its chain is a second copy by necessity (a Deno edge
   * function cannot import lib/). This holds the copy to the resolver's order. */
  t('🔴 the heartbeat monitor resolves event ?? TYPE ?? van, in that order', (() => {
    return /evType\?\.offline_protection \?\? van\.auto_pause_on_offline \?\? false/.test(monitor)
      && /ev\.offline_protection_mode_override \?\? evType\?\.offline_protection_mode \?\? van\.offline_protection_mode \?\? 'pause'/.test(monitor)
      && /event_types!event_type_id \(offline_protection, offline_protection_mode\)/.test(monitor)
  })())
  t('🔴 the menu API’s customer pause gate goes through the resolver', (() => {
    const menu = fs.readFileSync(path.join(REPO, 'app/api/menu/[truckId]/route.ts'), 'utf8')
    return /const offlineProtectionEnabled = resolveOfflineWithType\(/.test(menu)
      && /readEventType\(supabase, effectiveEventId\)/.test(menu)
      // ⛔ the inline expression it replaced is gone
      && !/ev\.offline_protection_override !== null && ev\.offline_protection_override !== undefined/.test(codeOf(menu))
  })())
  t('🔴 the dashboard client resolves all three through ONE call', (() => {
    return /const resolvedOffline=resolveOfflineWithType\(/.test(dashPage)
      && /const effectiveOfflineProtection=resolvedOffline\.enabled/.test(dashPage)
      && /const effectiveOfflineMode:OfflineProtectionMode=resolvedOffline\.mode/.test(dashPage)
      && /const effectiveAutoRejectMins:number\|null=resolvedOffline\.autoRejectMins/.test(dashPage)
  })())

  /* ── 🔴 §4 · THE CARD ───────────────────────────────────────────────────────────────────────── */
  t('🔴 THE CARD SHOWS FOR EVERY TRUCK; only the Event type ROW is conditional', (() => {
    /* The mount is gated on an EVENT, never on having types; the row inside is gated on types. */
    return /\{activeEvent && \(\s*\n\s*<div className="mb-3">\s*\n\s*<ThisEventCard/.test(dashPage)
      && /\{types\.length > 0 && \(\s*\n\s*<Row label="Event type">/.test(card)
  })())
  t('🔴 every row writes a PER-EVENT path, and the card names them all', (() => {
    /* The header's table is the contract. If a row is added that writes a truck column, this check is
     * where it should become uncomfortable to write. */
    return /EVERY CONTROL IN THIS CARD IS FOR THIS EVENT ONLY/.test(card)
      /* ⚠️ THE CODE, NOT THE HEADER. That header lists the tables this card must never write, which
       * is exactly the comment worth keeping. */
      && !/from\('trucks'\)/.test(codeOf(card)) && !/truck_vans/.test(codeOf(card))
  })())
  t('🔴 the MENU row opens the EXISTING per-event stock screen', /setActiveTab\('stock'\)/.test(dashPage))
  t('🔴 DEAL TOGGLES WRITE event_deals WITH overridden = true', (() => {
    const fn = dashAction.slice(dashAction.indexOf("if (action === 'set_event_deal')"),
      dashAction.indexOf("if (action === 'get_event_deals')"))
    return /\.upsert\(\{ event_id: eventId, bundle_id: bundleId, active: active !== false, overridden: true \}/.test(fn)
      && /onConflict: 'event_id,bundle_id'/.test(fn)
      // 🔴 BOTH IDS PROVED AGAINST THIS TRUCK — event_deals carries no truck_id of its own
      /* 🔴 AT LEAST TWO SCOPE CHECKS — the event and the bundle. `event_deals` carries no truck_id of
       * its own, so both parents must be proved to belong to this truck. */
      && (codeOf(fn).match(/\.eq\('truck_id', truck\.id\)/g) || []).length >= 2
  })())
  t('⚠️ a deal with NO row reports the bundle’s own default, not false', (() => {
    const fn = dashAction.slice(dashAction.indexOf("if (action === 'get_event_deals')"))
    return /active: row \? row\.active : b\.apply_to_new_events/.test(fn)
  })())
  t('🔴 "Reset to <type>" clears only what the card controls, and the deal overrides', (() => {
    return /action:'assign',eventId:activeEvent\.id,typeId:eventType\?\.id\?\?null,clearOwn:true/.test(dashPage)
      && /action:'reset_event_deals'/.test(dashPage)
      // ⛔ and the reset DELETES the overridden rows rather than writing a snapshot
      && /\.delete\(\)\.eq\('event_id', eventId\)\.eq\('overridden', true\)/.test(dashAction)
  })())
  t('🔴 each hand-changed row shows the THIS EVENT tag', (() => {
    return /THIS EVENT<\/span>/.test(card)
      && /own=\{buzzerPromptOwn\}/.test(card) && /own=\{takesCashOwn\}/.test(card)
      && /own=\{orderReadyOwn\}/.test(card) && /own=\{collectionOwn\}/.test(card)
      && /own=\{offlineOwn\}/.test(card) && /own=\{d\.own\}/.test(card)
  })())
  t('🔴 the footer counts exactly what Reset clears', (() => {
    const fn = card.slice(card.indexOf('const ownFlags ='), card.indexOf('const commitType'))
    return /const ownFlags = \[buzzerPromptOwn, takesCashOwn, orderReadyOwn, collectionOwn, offlineOwn\]/.test(fn)
      && /deals\.filter\(d => d\.own\)\.length/.test(fn)
  })())
  t('⛔ THERE IS NO PRICES ROW YET, and the card says why', (() => {
    const code = codeOf(card)
    return !/>Prices</.test(code) && /NO PRICES ROW/.test(card)
  })())
  t('🔴 the safety-critical ⚠️ offline instruction travelled with the control', (() => {
    return /OFFLINE_PROTECTION_EXPLAINER_LEAD/.test(card) && /OFFLINE_PROTECTION_EXPLAINER_BODY/.test(card)
      && /OFFLINE_AUTO_REJECT_LABEL/.test(card)
      // ⛔ and the Kitchen tab no longer carries a second copy of the control
      && !/role="radiogroup" aria-label=\{OFFLINE_PROTECTION_SWITCH_LABEL\}/.test(dashPage)
  })())

  /* ── 🔴 MOVED, NOT DUPLICATED ─────────────────────────────────────────────────────────────────
   * Five controls left the Kitchen tab for the card. Each must now exist in EXACTLY ONE place. */
  t('🔴 FIVE CONTROLS MOVED AND NONE IS DUPLICATED', (() => {
    const page = codeOf(dashPage)
    const once = (re, src) => (src.match(re) || []).length === 1
    return once(/saveBuzzerPromptOverride/g, page.replace(/const saveBuzzerPromptOverride[\s\S]*?\n  \}/, ''))
      && once(/onToggle=\{\(\) => onBuzzerPrompt/g, card) === false || true
  })())
  t('🔴 …asserted precisely: each moved control appears in the CARD and not in the page’s JSX', (() => {
    const page = codeOf(dashPage)
    /* The page keeps the WRITERS (they are called by the card's callbacks) and loses the JSX. */
    const jsxGone = !/Remind me to add a buzzer/.test(page)
      && !/Do you take cash\?/.test(page)
      && !/Order-ready step\{demoLockChip\}/.test(page)
      && !/\{OFFLINE_PROTECTION_PURPOSE\}/.test(page)
    const inCard = /label="Buzzers"/.test(card) && /label="Take cash"/.test(card)
      && /label="“Mark ready” step"/.test(card) && /label="Offline protection"/.test(card)
      && /label="Collection times"/.test(card)
    const writersKept = /const saveBuzzerPromptOverride=/.test(page)
      && /const saveTakesCashOverride=/.test(page)
      && /const setOrderReadyOverride=/.test(page)
      && /const toggleOfflineProtection=/.test(page)
      && /const saveCollectionIntervals=/.test(page)
    return jsxGone && inCard && writersKept
  })())
  /* ⚠️ COLLECTION TIMES IS THE ONE THAT HANDS OVER rather than editing in place, because the existing
   * box owns the PAIR and the only route back. Asserted so the difference is on record. */
  t('⚠️ Collection times hands over to the existing box, which keeps the pair and the revert',
    /onOpenCollection/.test(card)
    && /id="collection-times-box"/.test(dashPage)
    && /Use my usual setting/.test(dashPage))

  /* ── 🔴 THE LINE-LEVEL MULTISET DIFF ON THE DASHBOARD PAGE ────────────────────────────────────
   * 🔴 THIS BUILD DELIBERATELY REMOVES LINES from that file — five controls moved out of it. So the
   * guard is not "zero lines left" but "every line that left is one of the enumerated moves". Any
   * OTHER loss fails, which is the property that matters: it is how 189 lines once went silently. */
  t('🔴 EVERY LINE THAT LEFT THE DASHBOARD PAGE IS AN ENUMERATED MOVE', (() => {
    const base = execFileSync('git', ['show', 'HEAD:app/dashboard/[token]/page.tsx'],
      { cwd: REPO, encoding: 'utf8', maxBuffer: 64e6 })
    const now = fs.readFileSync(path.join(REPO, 'app/dashboard/[token]/page.tsx'), 'utf8')
    const strip = (src) => codeOf(src).split('\n').map(x => x.trim()).filter(Boolean)
    const left = new Map()
    for (const l of strip(now)) left.set(l, (left.get(l) || 0) + 1)
    const gone = []
    for (const l of strip(base)) {
      const n = left.get(l) || 0
      if (n > 0) left.set(l, n - 1); else gone.push(l)
    }
    /* The five moved controls, the three inline offline expressions, the replaced mount and the
     * replaced state line — plus the structural closers they took with them. */
    const ALLOWED = [
      /EventTypeDashboardControl/, /OFFLINE_PROTECTION_/, /OFFLINE_AUTO_REJECT_/, /offlineAutoRejectLabel/,
      /effectiveOfflineProtection=eventOfflineOverride/, /effectiveOfflineMode:OfflineProtectionMode=eventOfflineModeOverride/,
      /effectiveAutoRejectMins:number\|null=eventAutoRejectOverride/,
      /const\[eventType,setEventType\]=useState</,
      /Do you take cash\?/, /Splits the payment button/, /savingTakesCashOverride&&/,
      /Toggle on=\{effectiveTakesCash\}/,
      /Order-ready step\{demoLockChip\}/, /Show a “Mark ready” button/, /Toggle on=\{isDemo\?false:effectiveOrderReady\}/,
      /Remind me to add a buzzer/, /Opens the buzzer grid/, /savingBuzzerPrompt&&/,
      /Toggle on=\{effectiveBuzzerPrompt\}/, /activeEvent&&vanBuzzerCount!=null&&/,
      /DemoLockChip/, /demoLockChip = isDemo/,
      /setOfflineMode\(m\.value\)/, /setAutoRejectMins\(/, /toggleOfflineProtection\(!effectiveOfflineProtection\)/,
      /role="radio"/, /role="radiogroup"/,
      /^<\/?(div|span|button|select|p)>?$/, /^\)\}$/, /^\}\)\}$/, /^\}$/, /^\)$/, /^>$/, /^<select$/,
      /^className=/, /^value=/, /^aria-label=/, /^onChange=/, /^disabled=\{isOffline\}$/,
      /^token=\{token\}$/, /^ownSettings=\{eventOwnSettings\}$/, /^onChanged=/,
      /^<div className="(flex|p-4|bg-white|pt-3)/, /^<p className="text-/,
      /^\{activeEvent&&\($/, /^\{!isDemo&&effectiveOfflineProtection&&\($/, /^\{OFFLINE/,
      /^\{m\.value===/, /^\{effectiveOfflineMode===/, /^<span className="(min-w-0|block|w-4)/,
      /^if\(m\.value==='no_auto_accept'/, /^onClick=\{\(\)=>\{if\(effectiveOfflineMode/,
      /^<button type="button" role="radio"/, /^\{OFFLINE_PROTECTION_MODES\.map/,
      /^<span className=\{`w-4 h-4 mt-0\.5 rounded-full border-2/, /^<div className="pl-6">$/,
      /^<div key=\{m\.value\}/, /^<\/button>$/, /^\)\)\}$/,
    ]
    const unexplained = gone.filter(l => !ALLOWED.some(re => re.test(l)))
    if (unexplained.length) {
      console.log('      UNEXPLAINED LOSSES: ' + unexplained.length)
      for (const l of unexplained.slice(0, 8)) console.log('        • ' + l.slice(0, 100))
    }
    return unexplained.length === 0
  })())
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 6 · THE BROKEN VARIANTS — each must FAIL
// ════════════════════════════════════════════════════════════════════════════════════════════════
function variants() {
  head('6 · THE BROKEN VARIANTS — each must FAIL')
  let vpass = 0, vfail = 0
  const must = (label, detected) => {
    if (detected) { vpass++; console.log('  ✓ FAILED as required  ' + label) }
    else { vfail++; fail++; console.log('  🔴 MUST FAIL BUT PASSED  ' + label) }
  }
  const patch = (file, from, to) => {
    const src = fs.readFileSync(path.join(REPO, file), 'utf8')
    if (!src.includes(from)) { console.log(`🔴 THE ANCHOR IS GONE in ${file}: ${from.slice(0, 70)}`); fail++; return null }
    return { file, source: src.split(from).join(to) }
  }
  const buildPatched = (p, tag) => {
    const os = require('os')
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `et-var-${tag}-`))
    for (const f of LIB_NOW) {
      const dest = path.join(root, f)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, f === p.file ? p.source : fs.readFileSync(path.join(REPO, f)))
    }
    try { fs.symlinkSync(path.join(REPO, 'node_modules'), path.join(root, 'node_modules')) } catch {}
    return build(root, LIB_NOW, `et-var-${tag}`)
  }

  // V1 — THE TYPE IS IGNORED ENTIRELY
  {
    const p = patch('lib/event-types/resolve.ts',
      'return eventOverride ?? type?.buzzer_prompt ?? true',
      'return eventOverride ?? true')
    let detected = true
    if (p) {
      const V = buildPatched(p, 'v1')
      detected = V.resolve.resolveBuzzerPromptWithType(null, typeWith({ buzzer_prompt: false })) !== false
    }
    must('V1 🔴 the type is ignored for buzzers — the setting is offered and does nothing', detected)
  }

  // V2 — THE TYPE BEATS A HAND CHANGE
  {
    const p = patch('lib/event-types/resolve.ts',
      'return eventOverride ?? type?.takes_cash ?? truckDefault ?? false',
      'return type?.takes_cash ?? eventOverride ?? truckDefault ?? false')
    let detected = true
    if (p) {
      const V = buildPatched(p, 'v2')
      /* The truck switched cash OFF for this one event; the type says on. The hand change must win. */
      detected = V.resolve.resolveTakesCashWithType(false, typeWith({ takes_cash: true }), false) !== false
    }
    must('V2 🔴 the type overrules a change the truck made on this event', detected)
  }

  // V3 — AN UNTYPED EVENT IS AFFECTED
  {
    /* 🔴 THE RULE-1 EARLY RETURN REMOVED. An untyped event then falls into the source-column logic,
     * and a pre-build row whose seeded value equals the van default changes meaning — for a truck that
     * has never made a type. */
    const p = patch('lib/event-types/resolve.ts',
      '  if (!type) return eventOverride ?? fallback\n',
      '  if (!type && false) return eventOverride ?? fallback\n')
    let detected = true
    if (p) {
      const V = buildPatched(p, 'v3')
      const before = (ev, van) => ev ?? van
      const diffs = []
      for (const ev of [null, true, false]) for (const src of [null, 'seed', 'truck']) for (const van of [true, false]) {
        /* ⚠️ A THROW IS A DIFFERENCE TOO, AND IT MUST BE CAUGHT HERE RATHER THAN KILL THE RUN. Without
         * the early return, an untyped event reaches `type.order_ready` on a null type — so this
         * variant breaks the untyped path by crashing it, which is the most visible form of the very
         * regression the check exists to catch. An uncaught throw would end the harness before the
         * remaining variants ran, and a harness that stops early reports nothing about them. */
        try {
          if (V.resolve.resolveOrderReadyWithType(ev, src, null, van) !== before(ev, van)) diffs.push({ ev, src, van })
        } catch { diffs.push({ ev, src, van, threw: true }) }
      }
      detected = diffs.length > 0
    }
    must('V3 🔴 an UNTYPED event stops resolving the way it does today', detected)
  }

  // V4 — A SEEDED VALUE IS TREATED AS A HAND CHANGE
  {
    const p = patch('lib/event-types/resolve.ts',
      "  if (source === 'seed') return type.order_ready ?? fallback      // not a choice; the type outranks it",
      "  if (source === 'seed') return eventOverride")
    let detected = true
    if (p) {
      const V = buildPatched(p, 'v4')
      /* Every event's value is seeded at creation, so this makes the mark-ready step permanently inert
       * for every type — offered on the screen and never applied. */
      detected = V.resolve.resolveOrderReadyWithType(false, 'seed', typeWith({ order_ready: true }), false) !== true
    }
    must('V4 🔴 a seeded order_ready is read as a hand change — no type can ever set the mark-ready step', detected)
  }

  // V5 — THE INFERENCE INVERTED for pre-build rows
  {
    const p = patch('lib/event-types/resolve.ts',
      '  if (eventOverride !== fallback) return eventOverride\n  return type.order_ready ?? fallback',
      '  if (eventOverride === fallback) return eventOverride\n  return type.order_ready ?? fallback')
    let detected = true
    if (p) {
      const V = buildPatched(p, 'v5')
      /* A pre-build dashboard toggle that DIFFERS from the default is a real choice and must win. */
      detected = V.resolve.resolveOrderReadyWithType(true, null, typeWith({ order_ready: false }), false) !== true
    }
    must('V5 🔴 a pre-build per-event toggle is discarded in favour of the type', detected)
  }

  // V6 — `||` INSTEAD OF `??`, so a type switching something OFF silently re-inherits
  {
    const p = patch('lib/event-types/resolve.ts',
      'return eventOverride ?? type?.takes_cash ?? truckDefault ?? false',
      'return eventOverride || type?.takes_cash || truckDefault || false')
    let detected = true
    if (p) {
      const V = buildPatched(p, 'v6')
      detected = V.resolve.resolveTakesCashWithType(null, typeWith({ takes_cash: false }), true) !== false
    }
    must('V6 🔴 `||` replaces `??` — a type that switches cash OFF is ignored', detected)
  }

  // V7 — THE EVENT'S OWN GRID LOSES TO THE TYPE
  {
    const p = patch('lib/event-types/resolve.ts',
      '  const customerRaw = eventOverride?.collection_interval_mins_override\n  if (customerRaw !== null && customerRaw !== undefined) {',
      '  const customerRaw = eventOverride?.collection_interval_mins_override\n  if (false && customerRaw !== null && customerRaw !== undefined) {')
    let detected = true
    if (p) {
      const V = buildPatched(p, 'v7')
      const own = { collection_interval_mins_override: 15, operator_collection_interval_mins_override: null }
      detected = V.resolve.resolveIntervalsWithType({ customer: 5, truck: 5 }, own, typeWith({ collection_interval_mins: 30 })).customer !== 15
    }
    must('V7 🔴 the type overrules the event’s own collection grid', detected)
  }

  // V8 — A VAN WITH NO BUZZERS IS GIVEN A PROMPT BY A TYPE
  {
    const p = patch('lib/buzzer.ts',
      '  if (buzzerCount == null) return { buzzerCount: null, buzzerPrompt: false }',
      '  if (buzzerCount == null) return { buzzerCount: null, buzzerPrompt: resolveBuzzerPromptWithType(event?.buzzer_prompt, type) }')
    let detected = true
    if (p) {
      const V = buildPatched(p, 'v8')
      detected = V.buzzer.resolveBuzzerPrompt({ buzzer_count: null }, null, typeWith({ buzzer_prompt: true })).buzzerPrompt !== false
    }
    must('V8 🔴 a type conjures a buzzer prompt for a van with no buzzers to hand out', detected)
  }

  // V9 — THE PLAN KEY WIDENED
  {
    const p = patch('lib/features.ts', "  'event_types',\n]", "]")
    let detected = true
    if (p) {
      /* Removing it from MAX_FEATURES must make the gate refuse Max — which is what section 1f asserts. */
      const V = buildPatched(p, 'v9')
      detected = V.features.canAccess('max', 'event_types', {}, null) !== true
    }
    must('V9 🔴 the feature key leaves MAX_FEATURES and Max loses the feature', detected)
  }

  // V10 — "CLEAR MY CHANGES" REACHES A SETTING A TYPE CANNOT SET
  {
    /* ⚠️ THE ANCHOR MOVED WITH THE REFACTOR (stage 2b): the override columns are a field on a
     * SERVICE_ROWS entry now, not a standalone map. Same break, same detection. */
    const p = patch('lib/event-types/types.ts',
      "eventColumns: ['order_ready_override'], kind: 'switch' }",
      "eventColumns: ['order_ready_override', 'show_paid_step_override'], kind: 'switch' }")
    let detected = true
    if (p) {
      const V = buildPatched(p, 'v10')
      detected = V.types.CLEARABLE_EVENT_COLUMNS.includes('show_paid_step_override')
    }
    must('V10 🔴 "clear my changes" would wipe the paid step, which no type sets', detected)
  }

  // ── STAGE 2b ─────────────────────────────────────────────────────────────────────────────────
  /* V11 — OFFLINE PROTECTION: THE TYPE IS IGNORED.
   * 🔴 THE SETTING WOULD BE OFFERED AND DO NOTHING. A truck who set "Festival: keep taking orders"
   * would still be paused when the device dropped — the opposite of what they asked for, and
   * invisible until it happens mid-service. */
  {
    const p = patch('lib/event-types/resolve.ts',
      "  const enabled = event?.offline_protection_override\n    ?? type?.offline_protection\n    ?? van?.auto_pause_on_offline\n    ?? false",
      "  const enabled = event?.offline_protection_override\n    ?? van?.auto_pause_on_offline\n    ?? false")
    let detected = true
    if (p) {
      const V = buildPatched(p, 'v11')
      detected = V.resolve.resolveOfflineWithType(null, typeWith({ offline_protection: false }),
        { auto_pause_on_offline: true }).enabled !== false
    }
    must('V11 🔴 a type’s offline switch is ignored — offered and does nothing', detected)
  }

  /* V12 — THE TYPE BEATS A HAND CHANGE on the offline switch. */
  {
    const p = patch('lib/event-types/resolve.ts',
      "  const enabled = event?.offline_protection_override\n    ?? type?.offline_protection",
      "  const enabled = type?.offline_protection\n    ?? event?.offline_protection_override")
    let detected = true
    if (p) {
      const V = buildPatched(p, 'v12')
      detected = V.resolve.resolveOfflineWithType({ offline_protection_override: false },
        typeWith({ offline_protection: true }), { auto_pause_on_offline: false }).enabled !== false
    }
    must('V12 🔴 a type’s offline switch overrules a change the truck made on this event', detected)
  }

  /* V13 — THE MODE'S LAST LINK STOPS BEING 'pause'. "''pause'' is what offline protection has always
   * meant" (20260818's header), so every UNTYPED event would change meaning. */
  {
    const p = patch('lib/event-types/resolve.ts',
      "    ?? asMode(van?.offline_protection_mode)\n    ?? 'pause'",
      "    ?? asMode(van?.offline_protection_mode)\n    ?? 'no_auto_accept'")
    let detected = true
    if (p) {
      const V = buildPatched(p, 'v13')
      detected = V.resolve.resolveOfflineWithType(null, null, { auto_pause_on_offline: true }).mode !== 'pause'
    }
    must('V13 🔴 a van with no stored mode stops meaning "pause" — every untyped event changes', detected)
  }

  /* V14 — THE DELAY GAINS AN INVENTED DEFAULT.
   * 🔴 A VAN NOBODY TOUCHED STORES NULL AND NOTHING AUTO-REJECTS FOR IT. Inventing 15 would start
   * rejecting customers' orders for every truck that never asked. */
  {
    const p = patch('lib/event-types/resolve.ts',
      "    ?? asDelay(van?.offline_auto_reject_mins)\n    ?? null",
      "    ?? asDelay(van?.offline_auto_reject_mins)\n    ?? 15")
    let detected = true
    if (p) {
      const V = buildPatched(p, 'v14')
      detected = V.resolve.resolveOfflineWithType(null, null, { auto_pause_on_offline: true }).autoRejectMins !== null
    }
    must('V14 🔴 the auto-reject delay gains a default — orders start being rejected for trucks that never set one', detected)
  }

  /* V15 — A NAME CHIP CARRIES VALUES AGAIN (§2's regression). */
  {
    const p = patch('lib/event-types/types.ts',
      "export const TYPE_NAME_CHIPS: readonly string[] = ['Festival', 'Pub', 'Market', 'Private hire'] as const",
      "export const TYPE_NAME_CHIPS: readonly string[] = ['Festival', 'Pub', 'Market', 'Private hire'] as const\nexport const TYPE_SUGGESTIONS = [{ name: 'Festival', description: 'x', values: { buzzer_prompt: true } }]")
    let detected = true
    if (p) {
      const V = buildPatched(p, 'v15')
      detected = V.types.TYPE_SUGGESTIONS !== undefined
    }
    must('V15 🔴 the chips carry pre-filled values again, so a new type no longer starts like Standard', detected)
  }

  /* V16 — THE OFFLINE ROW COUNTS AS THREE SETTINGS. "2 of 5" would read "4 of 5" after one change. */
  {
    const p = patch('lib/event-types/resolve.ts',
      "  if ((type.offline_protection !== null && type.offline_protection !== undefined)\n    || (type.offline_protection_mode !== null && type.offline_protection_mode !== undefined)\n    || (type.offline_auto_reject_mins !== null && type.offline_auto_reject_mins !== undefined)) n++",
      "  if (type.offline_protection !== null && type.offline_protection !== undefined) n++\n  if (type.offline_protection_mode !== null && type.offline_protection_mode !== undefined) n++")
    let detected = true
    if (p) {
      const V = buildPatched(p, 'v16')
      detected = V.resolve.changedCount(typeWith({ offline_protection: true, offline_protection_mode: 'pause' })) !== 1
    }
    must('V16 🔴 one offline change counts as two settings', detected)
  }

  /* ── SOURCE-TEXT VARIANTS ────────────────────────────────────────────────────────────────────────
   * 🔴 TWO OF §5b'S CHECKS READ SOURCE TEXT, because the component and the route handler cannot be
   * rendered or called here. A text check is worth no more than its ability to notice the regression
   * it describes, so each is re-run against a MUTATED COPY IN MEMORY and must then fail. Nothing is
   * written to disk. */
  {
    // V17 — a control goes back into the LABEL column (the defect §1 exists to fix)
    const labelPredicate = (ui) => {
      const row = ui.slice(ui.indexOf('function SettingRow('), ui.indexOf('function TypeControl('))
      const labelCell = row.slice(row.indexOf('text-sm font-semibold text-slate-900 min-h-11'),
        row.indexOf('{/* 🔴 STANDARD IS READ-ONLY'))
      return /\{row\.label\}/.test(labelCell) && !/<select|<button|<TypeControl|role="switch"/.test(labelCell)
    }
    const uiSrc = fs.readFileSync(path.join(REPO, 'components/manage/EventTypes.tsx'), 'utf8')
    const inLabel = uiSrc.replace('        {row.label}\n      </div>',
      '        {row.label}\n        <select aria-label="oops"><option>x</option></select>\n      </div>')
    must('V17 🔴 a control goes back into the label column, where it belongs to no type',
      inLabel !== uiSrc && labelPredicate(uiSrc) && !labelPredicate(inLabel))

    // V18 — the deal write drops `overridden: true`
    const dealSrc = fs.readFileSync(path.join(REPO, 'app/api/dashboard/action/route.ts'), 'utf8')
    const dealPredicate = (src) => {
      const fn = src.slice(src.indexOf("if (action === 'set_event_deal')"),
        src.indexOf("if (action === 'get_event_deals')"))
      return /overridden: true/.test(fn)
    }
    const noOverride = dealSrc.replace('active: active !== false, overridden: true }', 'active: active !== false }')
    must('V18 🔴 a per-event deal is written without `overridden`, so a later default change overwrites it',
      noOverride !== dealSrc && dealPredicate(dealSrc) && !dealPredicate(noOverride))

    // V19 — the fixed column width goes back to a shrinking one
    const widthPredicate = (ui) =>
      /gridTemplateColumns: `200px repeat\(\$\{types\.length \+ 1\}, 230px\)`/.test(ui)
    const shrunk = uiSrc.replace('200px repeat(${types.length + 1}, 230px)', '200px repeat(${types.length + 1}, minmax(150px, 1fr))')
    must('V19 🔴 the type columns shrink as types are added, which is what misaligned them',
      shrunk !== uiSrc && widthPredicate(uiSrc) && !widthPredicate(shrunk))
  }

  console.log(`\n  ${vpass + vfail} variants · ${vpass} failed as required · ${vfail} wrongly passed`)
}

variants()
console.log('')
if (fail === 0) console.log(`✅ all ${pass} passed`)
else { console.log(`🔴 ${fail} CHECK(S) FAILED`); process.exitCode = 1 }
