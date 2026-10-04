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
]
/* ⚠️ THE BEFORE TREE HAS NO lib/event-types AND NO lib/slot-interval-core. Compiling the same list
 * against it would fail on a missing file, which a careless harness would report as "the build broke"
 * rather than as "that is the point". Its list is what existed. */
const LIB_BEFORE = ['lib/slot-interval.ts', 'lib/buzzer.ts', 'lib/payments/paid-step.ts', 'lib/features.ts']

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
  }
}

const NOW = build(REPO, LIB_NOW, 'et-now')

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

    t('🔴 the before tree genuinely predates this build — it has no event-types module',
      BEFORE.resolve === null && !fs.existsSync(path.join(wt, 'lib/event-types/resolve.ts')))

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
    const beforeSrc = fs.readFileSync(path.join(wt, 'app/api/dashboard/route.ts'), 'utf8')
    const hadInline = /effectiveOrderReady = \(capacityEvent as any\)\?\.order_ready_override \?\? vanOrderReadyDefault/.test(beforeSrc)
    t('🔴 the pre-build tree really did resolve the mark-ready step inline (the premise of 1d)', hadInline)
    const beforeOrderReady = (ev, vanDefault) => ev ?? vanDefault

    diffs = []
    for (const van of VANS) for (const ev of TRI) for (const src of [null, 'seed', 'truck']) {
      const a = beforeOrderReady(ev, van.order_ready_enabled)
      /* 🔴 `null` FOR THE TYPE. Note the SOURCE is varied across all three values as well: an untyped
       * event must resolve the same way WHATEVER that column says, which is the guarantee that makes
       * the new column safe to add. */
      const b = NOW.resolve.resolveOrderReadyWithType(ev, src, null, van.order_ready_enabled)
      if (a !== b) diffs.push({ van: van.order_ready_enabled, ev, src, a, b })
    }
    t(`🔴 the mark-ready step is byte-identical across ${VANS.length * TRI.length * 3} inputs — INCLUDING every value of the new source column`,
      diffs.length === 0)
    if (diffs.length) console.log('      ' + J(diffs.slice(0, 4)))

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
    /* ⚠️ `paid-step.ts` IS EXPECTED TO DIFFER — it gained the optional third argument — so it is named
     * as the ONE allowed difference rather than left off the list. Everything else must be identical. */
    t('🔴 THE PRICE PATH IS UNCHANGED — repricing, the calculator and the submit route, byte-for-byte',
      changed.length === 1 && changed[0] === 'lib/payments/paid-step.ts')
    if (!(changed.length === 1 && changed[0] === 'lib/payments/paid-step.ts')) console.log('      changed: ' + J(changed))

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
  const typed = { buzzer_prompt: false, takes_cash: true, order_ready: true, collection_interval_mins: 30 }
  const r = NOW.resolve
  const differs = [
    r.resolveBuzzerPromptWithType(null, typed) !== r.resolveBuzzerPromptWithType(null, null),
    r.resolveTakesCashWithType(null, typed, false) !== r.resolveTakesCashWithType(null, null, false),
    r.resolveOrderReadyWithType(false, 'seed', typed, false) !== r.resolveOrderReadyWithType(false, 'seed', null, false),
    J(r.resolveIntervalsWithType({ customer: 5, truck: 5 }, null, typed)) !== J(r.resolveIntervalsWithType({ customer: 5, truck: 5 }, null, null)),
  ]
  t('🔴 CONTROL: a TYPED fixture differs on all four settings — so "identical" above is a real finding',
    differs.every(Boolean))
  if (!differs.every(Boolean)) console.log('      ' + J(differs))
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 2 · THE RULE: HAND CHANGE ?? TYPE ?? DEFAULT
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('2 · HAND CHANGE ?? TYPE ?? DEFAULT')
{
  const r = NOW.resolve
  function typeWith(o) { return { buzzer_prompt: null, takes_cash: null, order_ready: null, collection_interval_mins: null, ...o } }

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
  function typeWith(o) { return { buzzer_prompt: null, takes_cash: null, order_ready: null, collection_interval_mins: null, ...o } }

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
  t('🔴 SERVICE_KEYS drives the labels, the override columns and the clear-my-changes list', (() => {
    const keys = ty.SERVICE_KEYS
    return keys.length === 4
      && keys.every(k => typeof ty.SERVICE_LABELS[k] === 'string' && ty.SERVICE_LABELS[k].length > 0)
      && keys.every(k => Array.isArray(ty.EVENT_OVERRIDE_COLUMNS[k]) && ty.EVENT_OVERRIDE_COLUMNS[k].length > 0)
      && Object.keys(ty.EVENT_OVERRIDE_COLUMNS).length === keys.length
  })())
  t('🔴 "clear my changes" clears the collection pair TOGETHER — an operator-only override is invalid', (() => {
    const cols = ty.EVENT_OVERRIDE_COLUMNS.collection_interval_mins
    return cols.includes('collection_interval_mins_override')
      && cols.includes('operator_collection_interval_mins_override')
  })())
  t('⛔ …and it clears NOTHING a type cannot set', (() => {
    const all = Object.values(ty.EVENT_OVERRIDE_COLUMNS).flat()
    const forbidden = ['paused_until', 'online_paused_until', 'extra_wait_mins', 'show_paid_step_override',
      'completion_presses_override', 'offline_protection_override', 'status', 'event_date', 'van_id']
    return forbidden.every(c => !all.includes(c))
  })())

  t('🔴 a new type is a copy of Standard — every value null', (() => {
    const b = ty.blankTypeValues()
    return ty.SERVICE_KEYS.every(k => b[k] === null)
  })())
  t('🔴 NO SUGGESTION PROMISES ANYTHING THIS BUILD CANNOT DO', (() => {
    /* Private visibility, prices, menus and stock are later stages. A suggestion that mentioned one
     * would be a promise the next order breaks — and "Private hire" is still offered BY NAME. */
    const sug = ty.TYPE_SUGGESTIONS
    const words = sug.map(s => s.description.toLowerCase()).join(' | ')
    return sug.length === 4
      && sug.some(s => s.name === 'Private hire')
      && !/private/.test(words) && !/price/.test(words) && !/menu/.test(words) && !/stock/.test(words)
      && !/deal/.test(words)
      // every value a suggestion pre-fills is one of the four settings, and nothing else
      && sug.every(s => Object.keys(s.values).every(k => ty.SERVICE_KEYS.includes(k)))
  })())
}

// ════════════════════════════════════════════════════════════════════════════════════════════════
// 4 · 🔴 THE MARK-READY STEP — THE SEEDED VALUE, AND WHY IT IS NOT A HAND CHANGE
// ════════════════════════════════════════════════════════════════════════════════════════════════
head('4 · THE SEEDED order_ready_override')
{
  const r = NOW.resolve
  function typeWith(o) { return { buzzer_prompt: null, takes_cash: null, order_ready: null, collection_interval_mins: null, ...o } }
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
  t('🔴 the dashboard mounts the control in one line',
    /<EventTypeDashboardControl/.test(dashPage)
    && /import \{ EventTypeDashboardControl \} from '@\/components\/manage\/EventTypes'/.test(dashPage))

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
  function typeWith(o) { return { buzzer_prompt: null, takes_cash: null, order_ready: null, collection_interval_mins: null, ...o } }

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
    const p = patch('lib/event-types/types.ts',
      "  order_ready: ['order_ready_override'],",
      "  order_ready: ['order_ready_override', 'show_paid_step_override'],")
    let detected = true
    if (p) {
      const V = buildPatched(p, 'v10')
      const all = Object.values(V.types.EVENT_OVERRIDE_COLUMNS).flat()
      detected = all.includes('show_paid_step_override')
    }
    must('V10 🔴 "clear my changes" would wipe the paid step, which no type sets', detected)
  }

  console.log(`\n  ${vpass + vfail} variants · ${vpass} failed as required · ${vfail} wrongly passed`)
}

variants()
console.log('')
if (fail === 0) console.log(`✅ all ${pass} passed`)
else { console.log(`🔴 ${fail} CHECK(S) FAILED`); process.exitCode = 1 }
