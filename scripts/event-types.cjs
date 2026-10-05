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

/* ══ 🔴 THE TWO MERGE PARENTS, PINNED BY SHA (October 2026) ═════════════════════════════
 * `event-types` was merged INTO `schedule-graphics`. Two checks below used to compare the working
 * tree against a single baseline; on a combined branch that question has two right answers, so both
 * tips are named. They are SHAs, never branch names and never `HEAD` — a branch name moves with the
 * next commit and `HEAD` becomes the merge itself, which would turn both checks into comparisons of
 * a tree with itself. That exact trap is written out at `BEFORE_REF` above and in
 * scripts/_slot-interval-compile.cjs; it has now caught three harnesses in this repository. */
const MERGE_PARENT_SG = '50759fd'   // schedule-graphics' tip, the merge's FIRST parent
const MERGE_PARENT_ET = '5cde26d'   // event-types' tip, the merge's SECOND parent
const gitShow = (ref, f) => {
  try { return execFileSync('git', ['show', `${ref}:${f}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 64e6 }) }
  catch { return null }
}

/** The modules under test, and the pre-build tree's equivalents. */
const LIB_NOW = [
  'lib/event-types/types.ts', 'lib/event-types/resolve.ts',
  /* ⚠️ `read.ts` IS HERE ONLY BECAUSE `slot-interval.ts` IMPORTS IT. Nothing in this harness calls it —
   * it is the one module in the feature that touches a database, and a harness that needs a database
   * is a harness that cannot run. It is compiled so the variant trees resolve, and never invoked. */
  'lib/event-types/read.ts',
  /* 🔴 AND NOW IT IS CALLED, FOR ONE FUNCTION. `usualTypeForPlace` is the "usual type for this place"
   * rule, and section 6 below runs it against a STUB client — so the comment above is no longer true
   * of the whole module: the parts that talk to a database are still never invoked, but this one is,
   * with the rows handed to it. `lib/schedule-graphics/places.ts` is compiled beside it because that
   * is where the REAL `placeForEvent` lives and the whole point is to use it, not a look-alike. */
  'lib/schedule-graphics/places.ts',
  'lib/slot-interval-core.ts', 'lib/slot-interval.ts',
  'lib/buzzer.ts', 'lib/payments/paid-step.ts', 'lib/features.ts',
  /* The offline vocabulary. A leaf with no imports, and the OWNER of the two mode values — so a
   * check on the resolver's mode chain is a check against the same constants the screens render. */
  'lib/copy/offlineProtection.ts',
  /* 🔴 THE FIVE SETTING LABELS, AND `settings-copy.ts` BECAUSE IT RE-EXPORTS ONE OF THEM. They are
   * here because `types.ts` now IMPORTS them — `SERVICE_ROWS` carries no literal label any more — so
   * without these two every compile in this file fails with TS2307. That is also what makes "the
   * labels are imported, not retyped" checkable against the COMPILED array rather than against the
   * source text: `NOW.types.SERVICE_ROWS[0].label` is the real string Settings renders. */
  'lib/copy/serviceSettings.ts', 'lib/settings-copy.ts',
]
/* ⚠️ THE BEFORE TREE HAS NO lib/event-types AND NO lib/slot-interval-core. Compiling the same list
 * against it would fail on a missing file, which a careless harness would report as "the build broke"
 * rather than as "that is the point". Its list is what existed. */
const LIB_BEFORE = [
  'lib/slot-interval.ts', 'lib/buzzer.ts', 'lib/payments/paid-step.ts', 'lib/features.ts',
  'lib/copy/offlineProtection.ts',
]

/* ══ 🔴 MANAGE'S OWN CONTROL CLASSES, WRITTEN DOWN ONCE ═══════════════════════════════════════════
 * Dominic, 4 October 2026: the Event types modal's "boxes and options" did not look like the rest of
 * Manage — different colours, formats and sizes. They did not: the modal had been built with the
 * DASHBOARD card's switch (orange, 42px, 18px knob) and a `rounded-lg px-2.5 h-9 text-[13px]` select
 * with a slate-300 border, inside a MANAGE screen whose own controls are green switches and
 * `border-slate-200 rounded-lg px-2 py-1 text-sm` boxes.
 *
 * 🔴 THESE TWO STRINGS MUST APPEAR IN BOTH FILES, VERBATIM. That is what makes "consistent" a check
 * rather than an opinion: if page.tsx restyles its controls, the assertion fails and the modal has to
 * follow. Neither string is invented here — both are lifted from app/manage/[token]/page.tsx.
 * ⚠️ IF THIS FAILS AFTER A MANAGE RESTYLE, THE FIX IS TO UPDATE BOTH FILES, not to delete the check. */
const SELECT_BASE_EXPECTED = 'border border-slate-200 rounded-lg px-2 py-1 text-slate-700 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400'
const TOGGLE_TRACK_EXPECTED = 'relative w-11 h-6 rounded-full transition-colors'

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
    /* ⚠️ GUARDED LIKE `types`/`resolve`: the BEFORE tree has neither of these files, and an
     * unguarded require would throw there and be scored as "the build broke" rather than as the point
     * of a before/after comparison. */
    copyService: (() => { try { return c.req('lib/copy/serviceSettings.js') } catch { return null } })(),
    settingsCopy: (() => { try { return c.req('lib/settings-copy.js') } catch { return null } })(),
    /* 🔴 THE "USUAL TYPE FOR THIS PLACE" RULE AND THE REAL PLACE RESOLVER. Guarded like the two
     * above: the BEFORE tree has neither, and an unguarded require would throw there. */
    read: (() => { try { return c.req('lib/event-types/read.js') } catch { return null } })(),
    places: (() => { try { return c.req('lib/schedule-graphics/places.js') } catch { return null } })(),
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
  /* 🔴 THE "BEFORE" IS A REAL CHECKOUT, COMPILED. `headWorktree` puts the named commit on disk and
   * compiles it, so "unchanged" is a comparison against code that actually ran — not against an
   * expression retyped into this file, which would only ever prove that I remember what I wrote.
   *
   * ── 🔴 THE REF IS PINNED, AND IT USED TO BE `'HEAD'`. THAT IS THE BUG THIS FIXES ────────────────
   * `'HEAD'` means "whatever was last committed", so the baseline moved every time this branch gained
   * a commit. At stage 1 HEAD was the pre-event-types tree and the comparison meant "event types
   * changed nothing". At stage 2b HEAD was stage 1 and it meant "offline protection changed nothing".
   * By stage v3 HEAD was stage 2b — which ALREADY HAS the offline resolver — so the baseline and the
   * working tree were the same code for this section, and the two premise checks below went red to
   * say so. They were right to: a comparison of a thing against itself passes for the wrong reason.
   * ⚠️ scripts/_slot-interval-compile.cjs's own note warns about exactly this ("every 'HEAD vs
   * working tree' identity check whose premise was 'HEAD is the old engine' became false"), and this
   * file had the warning quoted above it and still tracked HEAD.
   * 🔴 SO IT NAMES THE COMMIT: 9d3ecb8 is "Event types, stages 1+2" — the last tree that had the
   * resolver WITHOUT offline protection in it, which is the premise sections 1d-ii and 1d need. The
   * two checks below assert that premise rather than trusting this line. */
  const BEFORE_REF = '9d3ecb8'
  const { wt, remove } = headWorktree('et', BEFORE_REF)
  let BEFORE = null
  try {
    BEFORE = build(wt, LIB_BEFORE, 'et-before')

    /* ⚠️ THE BASELINE IS STAGE 1 (9d3ecb8), AND THESE TWO CHECKS ARE WHY IT IS PINNED. The premise of
     * everything below is "the before tree resolved offline protection INLINE, without a type in the
     * chain". If the ref ever points at a tree that already has `resolveOfflineWithType`, these go red
     * instead of letting 252 comparisons pass against an identical copy of the same code. */
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

    // ── 1e · THE PRICE PATH — RE-AIMED, NOT WAIVED (EVENT PRICING, 5 October 2026) ─────────────
    /* ══ 🔴 WHAT THIS ASSERTION USED TO CLAIM, WHY IT WENT RED, AND WHAT REPLACES IT ═══════════════
     *
     * It claimed: **every file in the price path is byte-identical to one of the two merge parents** —
     * `lib/order-repricing.ts`, `lib/order-calculations.ts`, `app/api/orders/submit/route.ts` and
     * `lib/payments/paid-step.ts`. Its own comment said so: "Stage 6 is where prices change; if this
     * assertion ever fails, something in THIS stage has reached the money path."
     *
     * 🔴 STAGE 6 HAS ARRIVED. `app/api/orders/submit/route.ts` and
     * `app/api/dashboard/action/route.ts` now reach event pricing ON PURPOSE, so that file CANNOT be
     * byte-identical any more and the guard went red for exactly the right reason.
     *
     * ⛔ IT IS NOT DELETED AND IT IS NOT LOOSENED. A guard removed the first time it fires is a guard
     * that was never doing anything. It is SPLIT into the two claims that are still worth making, and
     * the second is stronger than what it replaces:
     *
     *   (A) THE ENGINE ITSELF HAS NOT MOVED. `lib/order-repricing.ts` (which is `loadPriceBook` AND
     *       `repriceOrder` AND `toMinor`), `lib/order-calculations.ts` and `lib/payments/paid-step.ts`
     *       are STILL byte-identical to a named parent. This is the thing the brief insists on —
     *       event pricing was built BESIDE `loadPriceBook`, not inside it — and byte-identity is a
     *       stronger statement about it than any behavioural test could be.
     *   (B) THE ROUTES THAT CHANGED REACH PRICING THROUGH EXACTLY ONE DOOR, and the behavioural
     *       identity for a truck not using the feature is proved in `scripts/event-pricing.cjs`
     *       (deep-equality of the two price books, a byte-identical menu payload, a byte-identical
     *       order row) against the NAMED commit recorded in docs/event-pricing-report.md.
     */
    const ENGINE_UNMOVED = [
      'lib/order-repricing.ts', 'lib/order-calculations.ts',
    ]
    const PARENTS = { 'schedule-graphics': MERGE_PARENT_SG, 'event-types': MERGE_PARENT_ET }
    /* ══ ⚠️ `lib/payments/paid-step.ts` LEFT THIS LIST ON 12 OCTOBER 2026, AND IT WAS REPLACED ═════
     * It gained a FOURTH parameter — the van's own `takes_cash` — because "Do you take cash?" became a
     * per-van setting, so it cannot be byte-identical to either parent any more. That is the change,
     * not a regression, and the guard went red to say so.
     * 🔴 WHAT REPLACES BYTE-IDENTITY FOR IT IS STRONGER THAN A SOURCE COMPARISON: section 1f-ii below
     * drives the whole four-link chain exhaustively and proves that with NO van and NO type it returns
     * character-for-character what the three-link version returned. Byte-identity cannot say that
     * about a file that has to change; the identity test can.
     * ⚠️ THE OTHER TWO STAY, and they are the ones the money path actually runs: `loadPriceBook` and
     * `repriceOrder` live in `order-repricing.ts`, and `order-calculations.ts` is the calculator. */
    const EXPECTED_PARENT = {
      'lib/order-repricing.ts': 'schedule-graphics',
      'lib/order-calculations.ts': 'schedule-graphics',
    }
    const strayed = []
    for (const f of ENGINE_UNMOVED) {
      const now = fs.readFileSync(path.join(REPO, f), 'utf8')
      const matches = Object.entries(PARENTS)
        .filter(([, ref]) => gitShow(ref, f) === now).map(([name]) => name)
      if (!matches.includes(EXPECTED_PARENT[f])) strayed.push(`${f} (matches: ${matches.join(',') || 'NEITHER PARENT'})`)
    }
    t('🔴 THE PRICING ENGINE HAS NOT MOVED — order-repricing (loadPriceBook + repriceOrder), the calculator and the paid step are byte-identical to a named parent',
      strayed.length === 0)
    if (strayed.length) console.log('      strayed: ' + J(strayed))
    /* ⚠️ AND THE PREMISE: the two parents really do differ on at least one of the files above, or
     * "matches schedule-graphics" would be free. */
    t('⚠️ …and the two parents genuinely differ somewhere in the engine, so that assertion is not free',
      ENGINE_UNMOVED.some(f => gitShow(MERGE_PARENT_SG, f) !== gitShow(MERGE_PARENT_ET, f))
      || gitShow(MERGE_PARENT_SG, 'lib/payments/paid-step.ts') !== gitShow(MERGE_PARENT_ET, 'lib/payments/paid-step.ts'))

    /* ══ 🔴 1f-ii · THE FOUR-LINK CASH CHAIN IS BYTE-IDENTICAL WITH NO VAN AND NO TYPE ═════════════
     * `resolvePaidStep` gained a van argument, so it is no longer byte-identical as SOURCE. This is
     * the behavioural identity that replaces that claim, and it is exhaustive over the inputs that
     * decide — 3 event overrides x 3 type values x 3 van values x 3 truck values = 81 combinations,
     * of which the 27 with no van and no type must equal the old three-link expression exactly.
     * 🔴 THE OLD EXPRESSION IS WRITTEN OUT, from the pre-van tree's own source:
     *     eventOverride ?? type?.takes_cash ?? truckDefault ?? false
     * ⚠️ `??` AT EVERY LINK, so a van that has chosen `false` is honoured and not read as unset. The
     * matrix includes `false` at every position precisely to catch a `||`. */
    t('🔴 THE CASH CHAIN WITH NO VAN IS CHARACTER-FOR-CHARACTER THE PRE-VAN EXPRESSION (27 inputs)', (() => {
      const diffs = []
      for (const ev of TRI) for (const ty2 of TRI) for (const tr of TRI) {
        const before = ev ?? ty2 ?? tr ?? false
        for (const noVan of [null, undefined]) {
          const after = NOW.resolve.resolveTakesCashWithType(ev, typeWith({ takes_cash: ty2 }), noVan, tr)
          if (before !== after) diffs.push({ ev, ty2, tr, before, after })
        }
      }
      if (diffs.length) console.log('      ' + J(diffs.slice(0, 4)))
      return diffs.length === 0
    })())
    t('🔴 …and a VAN value outranks the truck and is outranked by the type, at every combination', (() => {
      const bad = []
      for (const ev of TRI) for (const ty2 of TRI) for (const vn of [true, false]) for (const tr of TRI) {
        const got = NOW.resolve.resolveTakesCashWithType(ev, typeWith({ takes_cash: ty2 }), vn, tr)
        const want = ev ?? ty2 ?? vn ?? tr ?? false
        if (got !== want) bad.push({ ev, ty2, vn, tr, got, want })
      }
      if (bad.length) console.log('      ' + J(bad.slice(0, 4)))
      return bad.length === 0
    })())
    t('⚠️ …and a van that has chosen FALSE is honoured, not re-inherited (the `||` bug, where it costs money)',
      NOW.resolve.resolveTakesCashWithType(null, null, false, true) === false
      && NOW.resolve.resolveTakesCashWithType(null, null, null, true) === true)
    t('🔴 Settings\u2019 per-van switch draws from the SAME chain\u2019s tail, not a second expression',
      NOW.resolve.resolveVanTakesCash(null, true) === true
      && NOW.resolve.resolveVanTakesCash(false, true) === false
      && NOW.resolve.resolveVanTakesCash(true, false) === true
      && NOW.resolve.resolveVanTakesCash(null, null) === false
      && /return resolveTakesCashWithType\(null, null, vanDefault, truckDefault\)/
        .test(fs.readFileSync(path.join(REPO, 'lib/event-types/resolve.ts'), 'utf8')))

    /* ── 🔴 `loadPriceBook` IS NOT ONLY UNCHANGED, IT IS STILL REACHED — AND NOT TWICE ────────────
     * `loadEventPriceBook` wraps it. If a later edit replaced that call with its own four queries,
     * every assertion above would still pass (the FILE would be untouched) while the money path had
     * quietly forked. So: the wrapper must call it, and the two order routes must NOT import it
     * directly any more — one door, named. */
    const wrapper = fs.readFileSync(path.join(REPO, 'lib/event-pricing/read.ts'), 'utf8')
    t('🔴 the event-aware book CALLS loadPriceBook rather than re-reading the menu itself',
      /\bloadPriceBook\(supabase,\s*truckId\)/.test(wrapper)
      && /from '@\/lib\/order-repricing'/.test(wrapper))
    t('🔴 loadPriceBook\u2019s SIGNATURE is untouched — (supabase, truckId), one overload, no event argument',
      /export async function loadPriceBook\(supabase: SupabaseClient, truckId: string\): Promise<PriceBook>/
        .test(fs.readFileSync(path.join(REPO, 'lib/order-repricing.ts'), 'utf8')))
    for (const f of ['app/api/orders/submit/route.ts', 'app/api/dashboard/action/route.ts']) {
      const src = fs.readFileSync(path.join(REPO, f), 'utf8')
      /* ⚠️ THE IMPORT LINE, NOT ANY MENTION. Both files discuss `loadPriceBook` at length in their
       * comments — correctly — so a bare substring test would fail on prose. */
      const importsRaw = src.split('\n').some(l => /^import .*\bloadPriceBook\b/.test(l))
      t(`🔴 ${f} reaches pricing through loadEventPriceBook ONLY — it no longer imports the raw book`,
        !importsRaw && /loadEventPriceBook/.test(src))
    }

    /* ── ⚠️ THE SUBMIT ROUTE STILL DOES NOT IMPORT THE SERVICE SETTINGS ───────────────────────────
     * The old form of this was "does not so much as import event types", which stage 3 makes false in
     * spirit: the money path now reads an event's TYPE, because that is where its prices live. The
     * claim that is still true and still worth making is narrower — it reaches that through
     * `lib/event-pricing`, and never imports `lib/event-types/resolve` or `lib/event-types/read`
     * directly. Collection times, the buzzer prompt and the mark-ready step have no business on the
     * path that decides money, and an import of them there is the first step to one of them doing so.
     */
    const submit = fs.readFileSync(path.join(REPO, 'app/api/orders/submit/route.ts'), 'utf8')
    t('🔴 …and the submit route imports lib/event-pricing, NEVER lib/event-types directly',
      /@\/lib\/event-pricing\/read/.test(submit) && !/@\/lib\/event-types\//.test(submit))

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
  /* ══ 🔴 RE-AIMED: A NEW TYPE IS A **COPY** OF VAN 1, NOT A BLANK (5 October 2026) ═════════════
   * This asserted "every setting NULL, whichever chip was tapped", and the NULL half is now wrong on
   * purpose. Dominic, having met it on localhost: a NULL column was drawn FADED at the first van's
   * value, so turning cash on for Van 1 made every untouched type appear to change with it — "showed
   * Market changing". A real value in every column is what removes the subscription.
   *
   * 🔴 THE HALF THAT MATTERED IS UNCHANGED AND IS STILL ASSERTED: **a chip carries no values.** Two
   * trucks tapping "Festival" must get the same starting point, and the chip must fill the NAME and
   * nothing else. That was the original reason this check existed and it is intact.
   * ⚠️ AND THE COPY IS COMPUTED ON THE SERVER, from `vanOneServiceValues`, so the values the screen
   * promises are the values that land. A client-sent seed would be a second definition of "Standard".
   */
  t('🔴 A NEW TYPE IS A COPY OF VAN 1\u2019S RESOLVED VALUES \u2014 and a chip still carries none', (() => {
    const route = fs.readFileSync(path.join(REPO, 'app/api/event-types/route.ts'), 'utf8')
    const create = route.slice(route.indexOf("if (action === 'create')"), route.indexOf("if (action === 'update')"))
    return /const seed = await vanOneServiceValues\(truck\.id, truck\.takes_cash \?\? null\)/.test(create)
      && /cleanValue\(k, seed\[k\]\)/.test(create)
      /* ⛔ AND NOT FROM A BLANK ANY MORE. */
      && !/blankTypeValues\(\)\[k\]/.test(create)
      // ⛔ NOTHING IN THE CREATE PATH READS A CHIP'S VALUES, because a chip has none.
      && !/TYPE_SUGGESTIONS|sug\.values/.test(route)
      /* 🔴 "VAN 1" IS THE OLDEST ACTIVE VAN, through `firstVanId` — the one rule that phrase means
       * everywhere else in this product, not "the first row PostgREST returned". */
      && /firstVanId\(/.test(route)
      /* ⚠️ THE AUTO-REJECT DELAY IS NOT SEEDED: it is not offered on a type at all, so storing it
       * would be a value no screen shows and nothing reads. */
      && !/offline_auto_reject_mins:/.test(
        route.slice(route.indexOf('async function vanOneServiceValues('), route.indexOf('type EventTypeServiceValues')))
      /* ⚠️ `blankTypeValues` SURVIVES in lib/event-types/types.ts as the schema's own notion of
       * "nothing set", which `vanOneServiceValues` spreads over and the route still validates against.
       * It is no longer the STARTING STATE; it is the shape. */
      && ty.SERVICE_KEYS.every(k => ty.blankTypeValues()[k] === null)
  })())
  /* ⚠️ RE-AIMED WITH IT: the popup's promise changed from "starts exactly like Standard" to "starts as
   * a copy of Standard, and changing Standard later won't change it". The first was true on the day
   * and became misleading the moment an operator changed Standard — which is the report. */
  t('🔴 …and the popup promises a COPY, and says Standard will not change it later', (() => {
    const ui = fs.readFileSync(path.join(REPO, 'components/manage/EventTypes.tsx'), 'utf8')
    return /It starts as a copy of Standard, and changing Standard later/.test(ui)
      && /won\u2019t change it/.test(ui)
      /* ⛔ the old promise is gone, not left adjacent — §37's rule */
      && !/It starts exactly like Standard\. Change anything after\./.test(ui)
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
  /* ⚠️ RE-AIMED: the dashboard CLIENT passes a fourth argument now — the van's own `takes_cash`. The
   * SERVER's call is unchanged: `app/api/dashboard/action/route.ts` resolves for a single order and
   * carries no van object, so it takes the truck default, which is what it took before. */
  t('🔴 the SERVER resolves takesCash through the type, and so does the dashboard CLIENT',
    /resolvePaidStep\(truck, ev as any, et\.type\)/.test(dashAction)
    && /resolvePaidStep\(truck,activeEvent,eventType,vanTakesCash\)/.test(dashPage))
  /* 🔴 AND THE TWO COMPONENTS THAT RESOLVE IT THEMSELVES TAKE THE VAN AS AN INPUT, never a resolved
   * boolean. A resolved `takesCash` prop would be a second copy of the chain on the busiest screen in
   * the product; the raw nullable value is an input to the one resolver. */
  t('🔴 the order card and the Add Order panel feed the VAN into the SAME resolver', (() => {
    const card = fs.readFileSync(path.join(REPO, 'components/dashboard/OrderCard.tsx'), 'utf8')
    const panel = fs.readFileSync(path.join(REPO, 'components/dashboard/AddOrderPanel.tsx'), 'utf8')
    return /resolvePaidStep\(truck, event, null, vanTakesCash\)/.test(card)
      && /resolvePaidStep\(truck, liveEvent as any, null, vanTakesCash\)/.test(panel)
      /* the prop is the RAW nullable column, not a resolved boolean */
      && /vanTakesCash\?: boolean \| null/.test(card)
      && /vanTakesCash\?: boolean \| null/.test(panel)
      /* ⛔ and neither file resolves the chain itself */
      && !/takes_cash \?\?/.test(codeOf(card))
      && !/takes_cash \?\?/.test(codeOf(panel))
  })())
  /* 🔴 `truck_vans.takes_cash` IS READ THROUGH ITS OWN PROBED READER, never as a column on an existing
   * `truck_vans` select. `/api/dashboard`'s van select feeds capacity, the cooking step and
   * order-ready, and its own comment records that a 42703 there degrades all three — a cash migration
   * must not be able to turn the mark-ready button off. `get_vans` is the same argument for Settings. */
  t('🔴 the van cash column is a SEPARATE probed read on both routes, not a column on a van select', (() => {
    const dash = fs.readFileSync(path.join(REPO, 'app/api/dashboard/route.ts'), 'utf8')
    const manage = fs.readFileSync(path.join(REPO, 'app/api/manage/route.ts'), 'utf8')
    const etRoute = fs.readFileSync(path.join(REPO, 'app/api/event-types/route.ts'), 'utf8')
    const namedSelects = (src) => (src.match(/\.select\('[^']*'\)/g) || [])
      .filter(x => /truck_vans/.test('') || x.includes('auto_pause_on_offline') || x.includes('order_ready_enabled'))
    return /readVanTakesCash\(supabase, capacityEvent\.van_id\)/.test(dash)
      && /readVanTakesCashForTruck\(supabase, truck\.id\)/.test(manage)
      && /readVanTakesCashForTruck\(supabase, truck\.id\)/.test(etRoute)
      /* ⛔ AND `takes_cash` IS IN NONE OF THE NAMED VAN SELECTS on those three routes. */
      && [dash, manage, etRoute].every(src => namedSelects(src).every(sel => !sel.includes('takes_cash')))
      /* and the reader fails OPEN to null, which the resolver reads as "the truck default" */
      && /return \(data as \{ takes_cash\?: boolean \| null \} \| null\)\?\.takes_cash \?\? null/
        .test(fs.readFileSync(path.join(REPO, 'lib/payments/van-cash.ts'), 'utf8'))
  })())
  /* 🔴 AND "Same as Van 1" COPIES IT. `VAN_COPY_FIELDS` is the list that decides what travels, and the
   * rule written above it is explicit: "adding a per-van setting later means adding it here too, or
   * the switch silently stops meaning same". ⚠️ AND THE TWO SETS STAY DISJOINT. */
  t('🔴 takes_cash is in VAN_COPY_FIELDS, and the capacity split is still clean', (() => {
    const vcs = (() => { try { return NOW.vanCopy } catch { return null } })()
    const src = fs.readFileSync(path.join(REPO, 'lib/van-category-settings.ts'), 'utf8')
    return /'takes_cash',/.test(src.slice(src.indexOf('export const VAN_COPY_FIELDS'), src.indexOf('export type VanCopyField')))
      && !/takes_cash/.test(src.slice(src.indexOf('export const CAPACITY_COPY_FIELDS'), src.indexOf('export type CapacityCopyField')))
      && (!vcs || (vcs.capacitySplitIsClean() === true && vcs.VAN_COPY_FIELDS.includes('takes_cash')))
  })())
  /* 🔴 AND `update_van_settings` NAMES IT. That handler's destructure is an ALLOWLIST that drops an
   * unlisted key SILENTLY — a green save that wrote nothing — so the write side has to be asserted
   * against the read side rather than assumed. ⚠️ AND IT MUST ACCEPT `null`, which is "follow the
   * truck": a truthiness test there would make "no" unwritable. */
  t('🔴 update_van_settings names takes_cash, and accepts true / false / null only', (() => {
    const manage = fs.readFileSync(path.join(REPO, 'app/api/manage/route.ts'), 'utf8')
    const fn = manage.slice(manage.indexOf("if (action === 'update_van_settings')"),
      manage.indexOf("if (action === 'set_van_same_as_first')"))
    return /const \{ vanId,[^}]*takes_cash \} = body/.test(fn)
      && /if \(takes_cash === null \|\| takes_cash === true \|\| takes_cash === false\) updates\.takes_cash = takes_cash/.test(fn)
      /* ⛔ NOT COERCED. `Boolean('false')` is true, and a stringly-typed body is exactly how a van
       * would come to take cash because somebody sent "false". */
      && !/updates\.takes_cash = Boolean\(/.test(fn)
      && !/updates\.takes_cash = !!/.test(fn)
  })())
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

  /* ══ 🔴 RE-AIMED: TWO READS ARE EXEMPT NOW, NOT ONE (event pricing, 5 October 2026) ══════════
   * It was `action !== 'load'`. `event_pricing_summary` joined it, because a DOWNGRADED truck's saved
   * prices KEEP RESOLVING (decision 8) and the dashboard card has to go on describing them
   * accurately — a 403 there would show "Menu prices" over an event charging +10%.
   * 🔴 THE SHAPE THAT MATTERS IS UNCHANGED AND IS WHAT THIS STILL ASSERTS: the gate is BY EXCLUSION,
   * so an action added later is refused by DEFAULT rather than being accidentally open. A list of
   * write actions would have the opposite failure mode, and that is the whole point of the check.
   * ⚠️ AND THE EXEMPT SET IS ASSERTED EXHAUSTIVELY — exactly these two, both reads. A third slipping
   * in is how the gate comes to have a hole. */
  t('🔴 THE PLAN GATE IS BY EXCLUSION, AND EXACTLY TWO READS ARE EXEMPT', (() => {
    const set = (route.match(/const READ_ACTIONS = new Set\(\[([^\]]*)\]\)/) || [])[1] || ''
    const exempt = (set.match(/'([a-z_]+)'/g) || []).map(x => x.replace(/'/g, '')).sort()
    return /if \(!READ_ACTIONS\.has\(action\) && !canWrite\)/.test(route)
      && JSON.stringify(exempt) === JSON.stringify(['event_pricing_summary', 'load'])
      && /canAccess\(truck\.plan as never, 'event_types'/.test(route)
      /* ⚠️ `load` STAYS OPEN SO EXISTING TYPES KEEP RESOLVING ON A DOWNGRADE — decision 4 — and says
       * so with readOnly. */
      && /readOnly: !canWrite/.test(route)
      /* 🔴 AND EVERY PRICING **WRITE** IS OUTSIDE THAT SET, which is the claim a downgraded truck
       * depends on: the screens go read-only, the stored prices go on resolving. */
      && ['set_type_pricing', 'set_type_item_price', 'save_event_pricing', 'clear_event_pricing']
        .every(a => new RegExp(`action === '${a}'`).test(route) && !exempt.includes(a))
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
  /* ⚠️ THE MOUNT GAINED ONE ATTRIBUTE (v3): `manageApi={api}`. Still one line and one import, and
   * that attribute is the whole of the "no second save path" rule — the modal's editable Standard
   * column changes truck and van settings by calling the PAGE'S OWN `api`. A check that insisted on
   * the old exact string would be insisting the feature not have the attribute. */
  /* ══ 🔴 RE-AIMED: THE PANEL IS THE THIRD SCHEDULE PILL NOW, NOT AN OVERLAY ═══════════════════
   * It arrived as a BUTTON opening a full-screen panel because main's Schedule tab had no pill bar and
   * adding one would have collided with schedule-graphics' — see §8.3 of the investigation report,
   * which said promoting it afterwards would be one entry in SCHEDULE_SECTIONS and one line. It is.
   * ⚠️ STILL ONE LINE AND ONE IMPORT, which is what this check is for; and `manageApi={api}` is
   * unchanged, which is the whole of "no second save path". */
  t('🔴 the manage page mounts the panel and the picker in one line each',
    /* ⚠️ `shownSection`, NOT `section` (5 October 2026). The Schedule tab derives which pill is
     * actually shown, because `places` and `weekly` are behind `places_posts_preview` and an old
     * bookmark must land on Events. Event types is NOT gated — only the switch expression moved. */
    /\{isActive && shownSection === 'event-types' && <EventTypesPanel token=\{token\} manageApi=\{api\} inline \/>\}/.test(page)
    && /<EventTypeSelect token=\{token\} venueName=\{editingEvent\.venue_name\}/.test(page)
    && /import \{ EventTypesPanel, EventTypeSelect \} from '@\/components\/manage\/EventTypes'/.test(page)
    /* ⛔ AND THE BUTTON AND ITS FLAG ARE GONE — two routes to one screen is what the pill replaced.
     * ⚠️ `codeOf`, BECAUSE THE COMMENT THAT RECORDS THE REMOVAL NAMES THE FLAG. Matching the prose
     * would make "it is gone" fail precisely because someone wrote down that it went. */
    && !/showEventTypes/.test(codeOf(page))
    && !/Btn label="Event types"/.test(codeOf(page)))

  /* ══ 🔴 RE-AIMED: THE CLAIM, NOT THE LITERAL (20261014) ════════════════════════════════════════
   * This pinned the exact spread `...(editingEvent.id ? {} : { event_type_id: eventTypeId })`. Private
   * events added one branch inside it — a private event's type is set by the SERVER (`applyPrivacy`
   * writes the Private type), so the picker must not also send one — and the literal stopped
   * matching while the claim it protects stayed exactly true.
   * ⛔ THE CLAIM IS STILL BOTH HALVES: the key is spread behind `editingEvent.id ? {} :`, so an EDIT
   * sends no `event_type_id` at all. What the create branch sends is now allowed to depend on the
   * tick, which is a different question and is asserted beside it. */
  t('🔴 the type is sent on CREATE only, never on an edit',
    /\.\.\.\(editingEvent\.id \? \{\} : \{ event_type_id:/.test(page))
  /* ⚠️ RE-AIMED (5 October 2026): privacy is derived from the SELECTED PILL now, not from a separate
   * tick. `chosenPrivate` is `eventTypeId === privateTypeId` — ONE value deciding both the type sent
   * and `is_private`, which is what makes them unable to disagree. The claim is unchanged: a private
   * event sends no type, because the server sets it through the one writer. */
  t('⛔ …and a PRIVATE event sends no type from the picker — the server sets Private itself',
    /event_type_id: chosenPrivate \? null : eventTypeId/.test(page)
    && /const chosenPrivate = !!privateTypeId && eventTypeId === privateTypeId/.test(page))
  t('⚠️ the picker is cleared every time the modal opens', /setEventTypeId\(null\)/.test(page))
  /* ⚠️ THE MOUNT CHANGED (stage 2b): the standalone type control became the "This event" CARD, which
   * is where five per-event controls now live. Still one mount and one import. */
  t('🔴 the dashboard mounts the "This event" CARD in one line',
    /<ThisEventCard/.test(dashPage)
    && /import \{ ThisEventCard, useEventDeals \} from '@\/components\/dashboard\/ThisEventCard'/.test(dashPage)
    // ⛔ and the control it replaced is gone from this screen
    && !/<EventTypeDashboardControl/.test(dashPage))

  // ── THE SCREENS SHOW ONLY WHAT WORKS ─────────────────────────────────────────────────────────
  /* ══ 🔴 RE-AIMED: PRICES HAS ARRIVED; ITEMS, STOCK, DEALS AND PRIVATE HAVE NOT ════════════════
   * This asserted "the SERVICE section ONLY — no prices", and it went red for the right reason: the
   * Main board's PRICES column is built (5 October 2026). The claim worth keeping is the same one
   * from the other direction — **the grid draws exactly the sections that are WIRED, and no more** —
   * because drawing a column nothing resolves promises a truck behaviour the next order does not
   * deliver. That was the original reasoning and it is unchanged; only the list has moved by one.
   * 🔴 ASSERTED AGAINST THE ROW PLAN, NOT AGAINST MARKUP. The section labels are DATA now (`plan`
   * pushes `{ k: 'section', label }`), so scanning for `>Prices<` would find nothing whatever the
   * screen drew — a check that cannot fail. The plan's section labels are the screen's sections. */
  /* ══ 🔴 RE-AIMED TWICE NOW: ORDERING ARRIVED, USED BY LEFT (5 October 2026) ══════════════════════
   * The claim is unchanged — **the grid draws exactly the sections that are WIRED, and no more** —
   * because drawing a column nothing resolves promises a truck behaviour the next order does not
   * deliver. Only the list has moved: `ORDERING` joined it with private events, and `USED BY` was
   * removed when its one number (a type's upcoming-event count) moved into the delete confirm, where
   * it is the only thing an operator needs at the one moment it matters.
   * ⚠️ `ORDERING` AND `VANS` ARE BOTH CONDITIONAL — VANS on 2+ active vans, ORDERING on the truck
   * having a Private type at all. This asserts the SET the file CAN draw; the conditions are asserted
   * separately. */
  t('⛔ THE GRID DRAWS EXACTLY VANS, ORDERING, PRICES AND SERVICE — items, stock and deals are NOT built', (() => {
    const plan = ui.slice(ui.indexOf('const plan = useMemo<PlanRow[]>'), ui.indexOf('const stripeIndex = useMemo('))
    const sections = (plan.match(/k: 'section', id: '[^']*', label: (?:'([^']*)'|(ORDERING_SECTION))/g) || [])
      .map(m => (m.match(/label: '([^']*)'/) || [])[1] ?? 'ORDERING')
    return JSON.stringify(sections) === JSON.stringify(['VANS', 'ORDERING', 'PRICES', 'SERVICE'])
      /* ⛔ AND THE STAGES THAT ARE NOT BUILT ARE NOT DRAWN, anywhere in the file. */
      && !/>Items sold</.test(codeOf(ui)) && !/'STOCK'/.test(codeOf(ui))
      && !/'DEALS'/.test(codeOf(ui)) && !/'VISIBILITY'/.test(codeOf(ui))
      /* 🔴 AND PRICES IS ABOVE SERVICE — a truck looks at prices far more often than at the buzzer. */
      && sections.indexOf('PRICES') < sections.indexOf('SERVICE')
      /* 🔴 AND VANS IS FIRST, because the switch in it decides the SHAPE of everything below it. */
      && sections.indexOf('VANS') === 0
      /* 🔴 ORDERING SITS ABOVE PRICES, because it decides whether there is anything to price: a
       * private event taking no orders online never shows a customer a price at all. */
      && sections.indexOf('ORDERING') < sections.indexOf('PRICES')
      /* ⛔ AND USED BY IS GONE FROM THE PLAN ENTIRELY — not merely absent from the list above. */
      && !/k: 'used-by'/.test(codeOf(ui))
      && !/label: 'USED BY'/.test(codeOf(ui))
  })())
  /* 🔴 …AND THE COUNT IT CARRIED IS IN THE DELETE CONFIRM, which is the one moment it is acted on. */
  t('🔴 a type\'s upcoming-event count moved to the DELETE CONFIRM, and still reads from `upcoming`',
    /They’ll go back to Standard/.test(ui)
    && /typeById\.get\(confirmDelete\)\?\.upcoming/.test(ui)
    /* ⚠️ AND THE ZERO CASE READS DIFFERENTLY — "No upcoming events use X" is the reassurance that
     * makes the button safe to press; "0 upcoming events … will go back" is a sentence about nothing. */
    && /No upcoming events use/.test(ui))
  /* ══ 🔴 THE VANS SECTION IS ONLY FOR A TRUCK WITH 2+ ACTIVE VANS ════════════════════
   * A one-van truck has nothing to make the same as anything, so the row would be a switch with no
   * meaning. ⚠️ ALSO ABSENT BEFORE THE "Same as Van 1" MIGRATION: a switch that cannot store anything
   * is worse than no switch — the same honesty `pricingReady` gives the PRICES section. */
  t('🔴 THE VANS ROW NEEDS 2+ ACTIVE VANS **AND** THE MIGRATION, and nothing is written on load', (() => {
    const plan = ui.slice(ui.indexOf('const plan = useMemo<PlanRow[]>'), ui.indexOf('const stripeIndex = useMemo('))
    const r = fs.readFileSync(path.join(REPO, 'app/api/event-types/route.ts'), 'utf8')
    return /if \(vans\.length > 1 && sameSettingsAvailable\) \{/.test(plan)
      /* the answer is READ from the vans, not stored — the model Kitchen capacity's switch uses */
      && /others\.length > 0 && others\.every\(v => sameAs\.byVanId\.get\(v\.id\) === true\)/.test(r)
      /* ⛔ AND THE FIRST VAN IS NOT IN THE TEST — it cannot follow itself. */
      && /const others = vanRows\.filter\(v => v\.id !== first\)/.test(r)
      /* ⛔ NOTHING IS WRITTEN ON LOAD: the `load` branch contains no update to truck_vans. */
      && !/from\('truck_vans'\)[\s\S]{0,40}\.update\(/.test(
        r.slice(r.indexOf("if (action === 'load')"), r.indexOf("if (action === 'create')")))
  })())
  /* 🔴 AND IT WRITES THROUGH SETTINGS' OWN ACTION, ONCE PER NON-FIRST VAN. "No new flag" was the
   * instruction, and `set_van_same_as_first` is the action the Settings switch calls — which is what
   * makes the two switches one switch rather than two that could disagree. */
  t('🔴 the Same settings switch calls `set_van_same_as_first`, for every van but the first', (() => {
    const fn = ui.slice(ui.indexOf('const saveSameSettings = async'), ui.indexOf('const saveStandardForVan'))
    return fn.length > 200
      && /await manageApi\('set_van_same_as_first', \{ vanId: v\.id, on \}\)/.test(fn)
      && /if \(v\.id === firstId\) continue/.test(fn)
      /* ⚠️ SEQUENTIAL, NOT Promise.all: turning it ON makes each call COPY the first van's whole
       * settings, and firing N of those in parallel would have them racing for no gain.
       * ⚠️ AGAINST `codeOf`, because the comment that explains the choice NAMES `Promise.all` — and a
       * check that forbade writing down what was rejected would forbid explaining the decision. */
      && !/Promise\.all/.test(codeOf(fn))
      /* 🔴 AND IT RELOADS rather than guessing — the route recomputes "are they all the same?" */
      && /await load\(\)/.test(fn)
      /* ⛔ AND NO NEW COLUMN OR FLAG: nothing in this file names a truck-level same-settings field. */
      && !/same_settings_all_vans|sameSettingsColumn/.test(ui)
  })())
  /* 🔴 OFF → ON ASKS FIRST, BECAUSE IT OVERWRITES. It copies Van 1's settings over every other
   * van's. ON → OFF asks nothing and copies nothing — every van keeps what it has. */
  t('🔴 OFF → ON confirms with the briefed wording; ON → OFF goes straight through', (() => {
    return /if \(sameSettings\) void saveSameSettings\(false\)\s*\n?\s*else setConfirmSameSettings\(true\)/.test(ui)
      && /data-same-settings-confirm/.test(ui)
      && NOW.copyService.SAME_SETTINGS_CONFIRM
        === "Copy Van 1's settings to every van? This copies all of Van 1's van settings, the same as "
          + "'Same as Van 1' in Settings. Kitchen capacity has its own switch."
      /* Cancel writes nothing. */
      && /onClick=\{\(\) => setConfirmSameSettings\(false\)\}/.test(ui)
  })())
  /* 🔴 AND THE SWITCH IS BLANK IN EVERY TYPE COLUMN. A type has no vans, so there is nothing
   * there to be on or off — and a greyed control would invite a tap and read as "off for this type". */
  t('🔴 the Same settings row is blank in every type column, and spans the van columns', (() => {
    const grid = ui.slice(ui.indexOf('{/* ── THE BODY ─'), ui.indexOf('{types.length === 0 &&'))
    return /data-same-settings-cell/.test(grid)
      /* ⚠️ `minHeight`, NOT `height` (5 October 2026). Every body cell sets a MINIMUM now, so a row
       * grows when its label wraps to two lines and the one-line rows stay exactly 36px. A fixed
       * height would clip the wrap, which is the whole point of the change. */
      && /gridColumn: `2 \/ span \$\{vanCount\}`, gridRow: row, minHeight: h, background: bg \}\}>/.test(grid)
      && /<Toggle on=\{sameSettings\}/.test(grid)
      && /if \(r\.k === 'same-settings'\) \{\s*\n\s*return <div key=\{t\.id\}/.test(grid)
  })())
  /* ══ 🔴 RE-AIMED AT THE CARD, BECAUSE THE CONTROL MOVED AND IS NOW DELETED (5 October 2026) ══════
   * These four sentences lived in `EventTypeDashboardControl` in components/manage/EventTypes.tsx.
   * That component had no caller — the "This event" card took the job over — and it is now deleted
   * (see the tombstone where it stood). The CLAIM is unchanged and still worth making: a live switch
   * has to say what changes, that placed orders keep their prices, and that hand changes for this
   * event survive, and it has to offer the "use it exactly" escape.
   * ⛔ IT IS AIMED AT THE FILE THAT RENDERS IT NOW. Leaving it aimed at the old file would have made
   * the deletion look like a regression, and re-aiming it at nothing would have made it vacuous. */
  t('🔴 the "This event" card\'s confirm says all three things a live switch has to say', (() => {
    const cardSrc = fs.readFileSync(path.join(REPO, 'components/dashboard/ThisEventCard.tsx'), 'utf8')
    return /New orders use \{targetName\}’s service settings\./.test(cardSrc)
      && /Orders already placed keep their prices\./.test(cardSrc)
      && /for this event stay\./.test(cardSrc)
      && /Clear my changes and use \{targetName\} exactly/.test(cardSrc)
  })())
  /* ⚠️ THIS CHECK HAS BEEN REVERSED TWICE, AND THE TRAIL IS THE POINT. Stage 2b: "Standard is first
   * and READ-ONLY". v3 first pass: editable, but saying "Set per van" where the vans disagree. v3
   * addition (Dominic, 4 October): no "Set per van" ANYWHERE in the Standard column and no links out
   * — the cell renders ONE CONTROL PER VAN instead. So both of the old sentences are now forbidden
   * strings, and that is what this asserts. */
  t('🔴 Standard is first, and neither "Set per van" nor a Settings link survives in the modal',
    /name: 'Standard'/.test(ui)
    && !/Set per van/.test(codeOf(ui))
    && !/Change these in Settings, not here\./.test(ui))
  /* ⚠️ RE-AIMED (5 October 2026): the COUNT moved into the delete confirm's sentence, so the old
   * `upcoming event{` match — which was the grid ROW's wording — no longer exists. The claim is the
   * same: the panel offers all four actions and the delete says what happens to the events. */
  t('⚠️ the panel offers rename, reorder, delete-with-confirm and names the events affected',
    />Rename</.test(ui) && />Delete</.test(ui) && /go back to Standard/.test(ui)
    && /upcoming event/.test(ui) && /action: 'reorder'/.test(ui))
  t('⚠️ on a phone it is one column with a picker above', /md:hidden/.test(ui) && /et-phone-pick/.test(ui))
  t('⚠️ the Add event picker shows the "(usual for this place)" hint',
    /\(usual for this place\)/.test(ui) && /action: 'usual_for_venue'/.test(ui))
  /* ══ ⛔ REVERSED: THE PICKER IS DRAWN EVEN WITH NO CUSTOM TYPES (5 October 2026) ════════════════
   * It returned null when `types` was empty, on the argument that a field with one option teaches
   * nothing and takes a row of the form. That was right when the only options were Standard and the
   * truck's own types.
   * 🔴 IT IS WRONG NOW, BECAUSE PRIVATE IS ALWAYS ONE OF THE CHOICES — a real two-way choice with a
   * real consequence, on every truck. And hiding it was the far side of the bug §5 fixes: the separate
   * "Private event" tick existed precisely because this control could not express Private.
   * ⚠️ IT STILL RETURNS NULL BEFORE THE TYPES HAVE LOADED, so the form does not flash a Standard-only
   * row and then grow — which is the half of the original claim worth keeping. */
  t('⛔ the picker is drawn even with no custom types, because Private is always a choice',
    /if \(!ready\) return null/.test(ui)
    && !/if \(!ready \|\| types\.length === 0\) return null/.test(ui))
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
  /* ⚠️ THE TWO WIDTHS SWAPPED (v3). It was `200px repeat(n, 230px)` — a 200px LABEL column beside
   * 230px value columns, which gave "Remind me to add a buzzer" less room than the switch describing
   * it. The board's template is `230px repeat(n, 200px)` and the brief says label ~230, type ~200.
   * 🔴 AND THEY ARE CONSTANTS NOW, not literals in a template string, because the DIALOG'S WIDTH is
   * computed from the same two numbers. Two places deriving one width from separate literals is what
   * produced the empty band this build removes. */
  /* ⚠️ THE NUMBERS ARE NOT PINNED HERE ANY MORE. They were 230/200 from the board, then 200/168 when
   * Dominic said the columns were too wide — and a check that names them has to be edited every time,
   * which is a check that tracks the code rather than guarding it. What MATTERS is the relationship:
   * the label column is the wider one (the longest string on any row is a label), both are fixed, and
   * the measurement harness proves nothing is clipped at whatever they currently are. */
  t('🔴 THE COLUMNS ARE FIXED, AND THE LABEL COLUMN IS THE WIDER ONE', (() => {
    const labelW = Number((ui.match(/const GRID_LABEL_W = (\d+)/) || [])[1])
    const colW = Number((ui.match(/const GRID_COL_W = (\d+)/) || [])[1])
    return labelW > 0 && colW > 0 && labelW > colW
      /* ⚠️ `valueColumnCount`, NOT `types.length + 1` (v3 addition). A truck with two vans has one
       * column PER VAN plus one per type, so the count is no longer "the types and Standard". */
      && /gridTemplateColumns: `\$\{GRID_LABEL_W\}px repeat\(\$\{valueColumnCount\}, \$\{GRID_COL_W\}px\)`/.test(ui)
      && /const valueColumnCount = \(vanColumns\.length > 1 \? vanColumns\.length : 1\) \+ types\.length/.test(ui)
      // ⛔ the first build's shrinking columns, and the swapped literals, are both gone
      && !/minmax\(150px, 1fr\)/.test(codeOf(ui))
      && !/`200px repeat\(/.test(codeOf(ui))
  })())
  /* 🔴 §4 · THE DIALOG FITS ITS COLUMNS. It was `w-full max-w-[1000px]`, so one type got a 1000px
   * dialog holding 630px of table — an empty band whose width said "there is more here". */
  t('🔴 THE DIALOG IS ITS CONTENT\'S WIDTH, CAPPED AT 1000px — no empty band with few types', (() => {
    return /width: GRID_LABEL_W \+ GRID_COL_W \* valueColumnCount \+ MODAL_SIDE_PADDING/.test(ui)
      && /maxWidth: 'min\(1000px, 100%\)'/.test(ui)
      /* ⛔ the fixed full-width dialog is gone. ⚠️ AGAINST `codeOf`, NOT THE RAW FILE: the comment
       * above that line NAMES the old class to explain the fix, and the first draft of this check read
       * the raw source and so failed on my own explanation. A check that forbade writing down what was
       * replaced would forbid explaining the change. */
      && !/w-full max-w-\[1000px\]/.test(codeOf(ui))
  })())
  /* ⚠️ A LONG OPTION TRUNCATES AT REST AND IS WHOLE IN THE OPEN LIST — the brief's §4 rule. The
   * `title` is what makes the truncated text recoverable without opening it. */
  /* ⚠️ RE-AIMED: THE OFFLINE ROW IS A SWITCH NOW, so `OFFLINE_CHOICES` (and the title built from it)
   * is gone. The claim is unchanged — a long option truncates at rest and is recoverable from the
   * `title` — and the longest remaining option is the interval's. */
  t('⚠️ long dropdown labels truncate, with the full text available', (() => {
    const ctl = ui.slice(ui.indexOf('function TypeControl('))
    return /truncate/.test(ui)
      /* ⚠️ RE-AIMED AGAIN (5 October): `inheritTitle` is gone with the whole "follows Standard"
       * design, so the interval's title is just its own value. The claim is unchanged — a long option
       * truncates at rest and is recoverable from the `title`. */
      && /title=\{`Every \$\{shown\} min`\}/.test(ctl)
      /* ⛔ AND THE DELETED CHOICE LIST HAS NOT COME BACK UNDER ITS OLD NAME.
       * ⚠️ AGAINST `codeOf`: the comment that records its deletion NAMES it, and the first draft of
       * this check read the raw source and so failed on its own explanation. A check that forbade
       * writing down what was removed would forbid explaining the change. */
      && !/OFFLINE_CHOICES/.test(codeOf(ui))
  })())
  t('🔴 …and when they no longer fit, THE COLUMNS scroll — not the dialog',
    /overflow-x-auto[^"]*" data-types-scroller/.test(ui) || /data-types-scroller/.test(ui))

  /* ── 🔴 THE CONTROLS ARE IN THEIR OWN TYPE'S COLUMN, NEVER IN THE LABEL COLUMN ────────────────
   * This is the defect the rewrite exists to fix. `SettingRow` renders three things in order: the
   * LABEL cell, the STANDARD cell, then one cell per type containing `<TypeControl>` — and the label
   * cell must contain nothing but the label. */
  /* ══ 🔴 RE-AIMED AT THE PLANNED GRID — AND THE ONE ALLOWED EXCEPTION IS NAMED ═════════════════
   * This sliced `function SettingRow(`, which is DELETED: the rows are planned and placed explicitly
   * now, because spans (the "Your menu prices" cell covers the van columns AND four rows) shear an
   * auto-placed grid. The defect it guards against is unchanged and is still the one §1 exists to fix:
   * a CONTROL must sit in its own column, on the row its name is on, never in the label column.
   *
   * 🔴 THERE IS NOW EXACTLY ONE BUTTON IN THE LABEL COLUMN AND IT IS NOT A SETTING: the Hide/Show
   * toggle on the "Item prices" row, which Dominic asked for "at its right". So this asserts the
   * narrower, truer thing — no SETTING control there — and names the exception, so a second one
   * cannot arrive unnoticed.
   */
  t('🔴 NO SETTING CONTROL IS IN THE LABEL COLUMN — only the Item prices Hide/Show button', (() => {
    const body = ui.slice(ui.indexOf('// ── THE LABEL CELL ─'), ui.indexOf('// ── THE STANDARD SIDE ─'))
    return body.length > 200
      && /\{r\.label\}/.test(body)
      /* ⛔ no switch, no dropdown, no price cell, no type control. */
      && !/<Toggle|<Select|<TypeControl|<PriceCell|<Price(Mode|Rounding)Select|<PriceAmountInput|role="switch"|<select/.test(body)
      /* ✅ the one button, and it is the named one. */
      && (body.match(/<button/g) || []).length === 1
      /* ══ 🔴 RE-AIMED: THE PILL IS IN THE **ITEM PRICES BAND** (5 October 2026) ═══════════════
       * This named `price-items-header`, a row kind that no longer exists: ITEM PRICES is a section
       * band now (`items-band`), drawn like every other section — darker, heading type, section
       * height — and the Hide/Show control is a PILL sitting immediately after the heading inside
       * that band's label cell, naming the item count.
       * ⚠️ IT IS STILL THE SAME CLAIM: exactly one button in the whole label column, and it is the
       * named one. Only the row kind it belongs to changed, so only that moved. */
      && /r\.k === 'items-band' && \([\s\S]{0,200}data-item-prices-toggle/.test(body)
      /* 🔴 AND IT IS IN COLUMN 1, which is what makes it reachable at every sideways scroll offset —
       * the reason it stopped being a link in the row label and became a pill in the band. */
      && /if \(isBand\) \{[\s\S]{0,400}style=\{\{ gridColumn: 1, gridRow: row/.test(body)
      /* 🔴 AND THE CONTROLS ARE IN THE TYPE COLUMNS, which is the same claim from the other side. */
      && /const typeCells = types\.map\(\(t, i\) => \{/.test(ui)
      && /<TypeControl row=\{r\.row\}/.test(ui)
  })())
  /* ══ 🔴 EVERY CELL IS PLACED EXPLICITLY — THE PROPERTY THE SPANS DEPEND ON ═════════════════════
   * Auto-placement plus a span shears the grid, and it shears differently for a one-van truck than
   * for a three-van one. So the label cell is column 1, the van cells are 2…1+vanCount, the type
   * cells are 2+vanCount…, and every one of them carries an explicit `gridRow`.
   * ⚠️ IT ALSO ASSERTS THE ARITHMETIC IS DERIVED FROM `vanCount`, not from a literal: a hard-coded
   * `gridColumn: 3` is the regression this would catch. */
  t('🔴 EVERY GRID CELL CARRIES AN EXPLICIT gridColumn AND gridRow, derived from vanCount', (() => {
    const grid = ui.slice(ui.indexOf('data-types-scroller'), ui.indexOf('{types.length === 0 &&'))
    const cells = grid.match(/style=\{\{[^}]*gridColumn[^}]*\}\}/g) || []
    return cells.length >= 8
      /* every placement names a row as well as a column */
      && cells.every(c => /gridRow/.test(c))
      /* the type columns are offset by the van count, not by a literal */
      && /gridColumn: 2 \+ vanCount \+ i/.test(grid)
      && /gridColumn: `2 \/ span \$\{vanCount\}`/.test(grid)
      && /const vanCount = vanColumns\.length > 1 \? vanColumns\.length : 1/.test(ui)
      /* the header owns rows 1-2 and the body starts at 3, stated once */
      && /const BODY_ROW_1 = 3/.test(ui)
      && /const row = BODY_ROW_1 \+ idx/.test(grid)
  })())

  /* ══ 🔴 §1 (SECOND ADDITION) · ONE COLUMN PER ACTIVE VAN, NOT A STACK IN ONE CELL ════════════
   * This replaces the checks for the stacked design, which lasted a few hours. Dominic: "2+ active
   * vans: replace the Standard column with ONE COLUMN PER ACTIVE VAN, first van first… Do this
   * whether or not the vans currently differ, so the layout does not jump when a value changes."
   *
   * 🔴 "WHETHER OR NOT THEY DIFFER" IS THE ASSERTION THAT MATTERS. The stacked design keyed off
   * `perVan`, so equalising two vans collapsed two controls into one and moved every row below it.
   * The columns must key off the VAN COUNT alone. */
  /* ══ ⚠️ RE-AIMED: THE COLUMN SHAPE IS THE **SWITCH'S** NOW (5 October 2026) ══════════════
   * Dominic: "ON: one Standard column, header STANDARD over 'All vans'. OFF: one column per active
   * van, oldest first, each saving to that van only." So `vanColumns` reads the switch as well as the
   * van count.
   *
   * ⚠️ THIS SUPERSEDES THE 4 OCTOBER RULE THIS CHECK WAS WRITTEN FOR — "the shape of the screen is a
   * fact about the truck (how many vans it has), never about the values in it" — and the supersession
   * is deliberate rather than an oversight. That rule existed because the columns used to appear and
   * disappear as VALUES changed (`perVan`), so equalising two vans made every row below jump. The
   * shape now follows an explicit SWITCH the operator pressed, and the row that changes it is the
   * first row on the screen.
   * ⛔ THE PART THAT STANDS, AND IS STILL ASSERTED: nothing keys the layout off `standardIsPerVan`.
   */
  t('🔴 THE COLUMN SHAPE FOLLOWS THE SWITCH AND THE VAN COUNT — never whether the values agree', (() => {
    return /const vanColumns = useMemo\(\s*\n\s*\(\) => \(vans\.length > 1 && !sameSettings \? vans : \[\]\),\s*\n\s*\[vans, sameSettings\],\s*\n\s*\)/.test(ui)
      /* ⛔ AND IT DOES NOT CONSULT `perVan`, either directly or through `vanHeaders`. */
      && !/vanColumns[\s\S]{0,160}standardIsPerVan/.test(ui)
      && !/vanHeaders[\s\S]{0,200}standardIsPerVan/.test(ui)
      /* 🔴 AND THE COMBINED COLUMN SAYS WHICH CASE IT IS: "All vans" when several vans follow each
       * other, "Standard" when there is only one. A two-van truck with the switch ON must not read
       * "Standard" over a column that is really Van 1 — the header is the only thing that says so. */
      && /name: vans\.length > 1 \? SAME_SETTINGS_ALL_VANS_HEADER : 'Standard'/.test(ui)
      && NOW.copyService.SAME_SETTINGS_ALL_VANS_HEADER === 'All vans'
      /* and the per-van case is still one entry per van, oldest first (the route orders them) */
      && /vanColumns\.map\(v => \(\{ key: v\.id, name: v\.name, van: v as VanRow \| null \}\)\)/.test(ui)
  })())
  t('🔴 …each van column saves to THAT VAN ONLY, through the same Settings action', (() => {
    const grid = ui.slice(ui.indexOf('/* ── A SERVICE row: ONE CELL PER VAN COLUMN'),
      ui.indexOf('// ── THE TYPE COLUMNS ─'))
    return grid.length > 200
      && /vanHeaders\.map\(\(v, i\) => \(/.test(grid)
      /* ══ ⚠️ THE `truckLevel` TERNARY IS GONE (5 October 2026) ══════════════════════
       * It existed for exactly ONE row — "Do you take cash?" — which was `trucks.takes_cash`, one
       * column for the whole truck, so every van column's switch wrote the SAME value and they moved
       * together. That is the defect Dominic met on localhost. `truck_vans.takes_cash` (20261012)
       * makes cash a van setting like the other four, so EVERY service row is per van and there is
       * no exception left to branch on — and no "Applies to all your vans" title to explain one.
       * 🔴 `v.van` NULL IS THE COMBINED COLUMN, which writes EVERY active van — what that column
       * has always meant, and now also what the "All vans" column means. */
      && /value=\{v\.van \? vanValue\(sr, v\.van\) : standardValue\(sr, standard\)\}/.test(grid)
      && /onChange=\{value => \(v\.van\s*\n?\s*\? void saveStandardForVan\(sr, v\.van\.id, value\)\s*\n?\s*: void saveStandard\(sr, value\)\)\}/.test(grid)
      /* ⛔ AND NO `truckLevel` SURVIVES IN THE GRID AT ALL. */
      && !/truckLevel/.test(codeOf(grid))
  })())
  /* ══ ⛔ RE-AIMED: THE PER-COLUMN "Standard" TAG IS GONE, REPLACED BY ONE SHARED HEADING ════════
   * Dominic, 5 October 2026: "the van columns sit under one shared STANDARD heading spanning them
   * (one van: one column under it); van names centred below; no colour dot on van columns."
   *
   * This asserted the OPPOSITE — a `Standard` tag in every van header plus a grey dot — and it was
   * right at the time: with no tint, the tag was the only thing telling a van column from a type
   * column. The shared heading says it ONCE and says it structurally, which is better, and the dot
   * said nothing at all: every van column carried the same grey, so it distinguished nothing and made
   * a van column look like a seventh type.
   * 🔴 SO THE CLAIM IS INVERTED, NOT DROPPED: a van column is still identified, and the thing that
   * identifies it is still asserted to exist. */
  t('🔴 THE VAN COLUMNS SIT UNDER ONE SHARED "STANDARD" HEADING, with centred names and NO dot', (() => {
    const hdr = ui.slice(ui.indexOf('{/* ── HEADER ROW 1:'), ui.indexOf('{/* ── THE BODY ─'))
    const vanHdr = hdr.slice(hdr.indexOf('{/* ── HEADER ROW 2:'))
    return /data-grid-standard-heading/.test(hdr)
      /* the heading spans every van column, and is ONE cell however many there are */
      && /gridColumn: `2 \/ span \$\{vanCount\}`, gridRow: 1/.test(hdr)
      && />\s*STANDARD\s*</.test(hdr)
      /* the names are centred, below it */
      && /data-grid-van-header/.test(vanHdr)
      && /justify-center/.test(vanHdr)
      && /title=\{v\.name\}>\{v\.name\}<\/span>/.test(vanHdr)
      /* ⛔ NO DOT AND NO PER-COLUMN TAG in the van header */
      && !/<Dot/.test(vanHdr)
      && !/>Standard<\/span>/.test(vanHdr)
      && !/>default<\/span>/.test(vanHdr)
      /* ⛔ no tint anywhere in the grid, which is the 4 October instruction, still held */
      && !/bg-orange-50/.test(codeOf(ui))
  })())
  /* 🔴 AND EVERY TITLE IS CENTRED ON ITS COLUMN, INCLUDING A TYPE'S — which is what taking the ⋯ out
   * of the flex flow is for. Dominic: "⋯ button pinned to the right edge so it doesn't push the name
   * off-centre. All column titles centred." With the button as a flex SIBLING, "Street food festival"
   * sat left of centre while "Pub" sat dead centre, so no two headers lined up with each other or
   * with the switches beneath them. */
  t('🔴 A TYPE HEADER IS CENTRED AND ITS ⋯ IS OUT OF THE FLOW, pinned right', (() => {
    const hdr = ui.slice(ui.indexOf('data-grid-type-header'), ui.indexOf('{/* ── HEADER ROW 2:'))
    return /justify-center/.test(hdr)
      && /relative/.test(hdr)
      /* the button is absolutely positioned at the right edge, so it takes no width from the name */
      && /absolute right-1 top-1\/2 -translate-y-1\/2/.test(hdr)
      /* ⛔ and NOT `ml-auto`, which is what made it a sibling competing for the row's width */
      && !/ml-auto/.test(hdr)
      /* it spans both header rows, so the name is centred on the whole header, not on its lower half */
      && /gridRow: '1 \/ span 2'/.test(hdr)
  })())
  /* 🔴 AND THE CONTROLS ARE CENTRED IN THEIR CELLS. Dominic: "centre the toggle buttons" (4 October),
   * then "Values centred in every value column (switches, numbers, text)" (5 October). A switch
   * pinned to the left of a 168px column reads as belonging to the column's edge. */
  t('🔴 every value cell centres its control', (() => {
    const grid = ui.slice(ui.indexOf('{/* ── THE BODY ─'), ui.indexOf('{types.length === 0 &&'))
    /* ONE class string for every value cell, so the centring cannot be applied unevenly. */
    return /const base = `px-2\.5 flex items-center justify-center min-w-0 border-t border-slate-100`/.test(grid)
      /* ══ 🔴 RE-AIMED FROM A COUNT TO A PROPERTY (5 October 2026) ═══════════════════════════════
       * This required `justify-center` to appear at least SEVEN times across the scroller. Removing
       * the USED BY row took two of those cells with it and the count fell to six — so the assertion
       * went red because a row was deleted, which tells nobody anything about centring.
       * ⛔ A COUNT OF OCCURRENCES IS NOT THE CLAIM. The claim is that centring comes from ONE
       * definition, so it cannot be applied unevenly: `base` carries it (asserted above), the header
       * cells carry it, and no value cell overrides it (asserted below). That holds whatever the row
       * count is. */
      && /justify-center/.test(ui.slice(ui.indexOf('data-types-scroller'), ui.indexOf('{types.length === 0 &&')))
      /* 🔴 THE HEADER'S OWN CELLS CENTRE TOO — the type titles and the van names. */
      && /data-grid-type-header[\s\S]{0,200}justify-center/.test(ui)
      && /data-grid-van-header[\s\S]{0,200}justify-center/.test(ui)
      /* ⛔ nothing in the value area is left- or right-aligned */
      && !/\$\{base\}[^`]*justify-(start|end|between)/.test(grid)
  })())
  /* ⛔ THE PER-CELL VAN LABELS ARE GONE. "Remove the small 'Van1/Van2' labels inside cells" — the
   * column header is what names a column. */
  t('⛔ NO PER-CELL VAN LABEL SURVIVES', (() => {
    const grid = ui.slice(ui.indexOf('{/* ── THE BODY ─'), ui.indexOf('{types.length === 0 &&'))
    return !/text-\[11px\] font-semibold text-slate-500 truncate shrink-0 max-w-\[45%\]/.test(grid)
      && !/<span[^>]*>\{v\.name\}<\/span>/.test(codeOf(grid))
      // ⛔ and the stacked container is gone too
      && !/flex flex-col gap-1\.5 py-0\.5/.test(codeOf(ui))
      && !/function StandardControl\(/.test(codeOf(ui))
  })())
  /* ══ ⛔ RE-AIMED: THERE IS NO TRUCK-LEVEL SERVICE ROW ANY MORE (5 October 2026) ══════════
   * This asserted that "Do you take cash?" — the ONE truck-level row — drew a switch in every van
   * column with a title saying they move together. Both halves were right at the time and both are
   * gone, because the premise is:
   *   • Dominic, 4 October: "Each van column gets its own switch, like every other row." It got one,
   *     over a single `trucks.takes_cash` value, with "Applies to all your vans" to explain why
   *     flipping one flipped the others.
   *   • Dominic, 5 October, having used it: "Turning on 'Do you take cash?' for Van 1 also turned it
   *     on for Van 2… I want every column independent."
   *
   * 🔴 `truck_vans.takes_cash` (20261012) IS WHAT MAKES THEM INDEPENDENT, so cash is a van setting
   * like the other four, EVERY service row is per van, and the title has nothing left to explain —
   * which is why the instruction says to remove it rather than reword it.
   * ⛔ SO THE CLAIM IS INVERTED: no service row is truck-level, no service cell spans, and the
   * all-vans title does not exist anywhere.
   */
  t('⛔ NO SERVICE ROW IS TRUCK-LEVEL, NONE SPANS, AND THE ALL-VANS TITLE IS GONE', (() => {
    const svc = ui.slice(ui.indexOf('/* ── A SERVICE row: ONE CELL PER VAN COLUMN'),
      ui.indexOf('// ── THE TYPE COLUMNS ─'))
    const fn = ui.slice(ui.indexOf('function standardWriteFor('), ui.indexOf('const GRID_LABEL_W'))
    /* every `case` in `standardWriteFor` returns `scope: 'van'`, and none returns `scope: 'truck'`.
     * ⚠️ PARSED FROM `codeOf(fn)`, NOT `fn`. The comment above the cash branch RECORDS that it used
     * to return `scope: 'truck'` — that is the whole explanation of the change — and the first draft
     * of this check read the raw text, found those two words in the prose, and reported cash as
     * truck-level. This file's own §4 note says every "how many times does this appear" check must
     * use `codeOf`; a scope parser is the same thing with extra steps. */
    const blocks = codeOf(fn).split(/\n\s{4}(?=case '|default:)/).slice(1)
    const scopeOf = {}
    for (const b of blocks) {
      const id = (b.match(/^case '(\w+)':/) || [])[1]
      if (id) scopeOf[id] = /scope: 'truck'/.test(b) ? 'truck' : /scope: 'van'/.test(b) ? 'van' : 'none'
    }
    const ids = NOW.types.SERVICE_ROWS.map(r => r.id)
    return svc.length > 200
      /* ⛔ no truck scope anywhere, for any row */
      && ids.every(id => scopeOf[id] === 'van')
      && !/scope: 'truck'/.test(codeOf(fn))
      /* ⛔ no span in the SERVICE cells (the PRICES rows DO span — prices are truck-wide, cash is not) */
      && !/gridColumn: `2 \/ span/.test(svc)
      /* ⛔ and the title is deleted from the copy module, not merely unused */
      && NOW.copyService.TAKES_CASH_ALL_VANS_TITLE === undefined
      && !/Applies to all your vans/.test(codeOf(fs.readFileSync(path.join(REPO, 'lib/copy/serviceSettings.ts'), 'utf8')))
      && !/TAKES_CASH_ALL_VANS_TITLE/.test(codeOf(ui))
      /* 🔴 AND THE CASH ROW WRITES THE VAN COLUMN, through update_van_settings like the other four */
      && /return \{ scope: 'van', action: 'update_van_settings', payload: \{ takes_cash: value === true \} \}/.test(fn)
      /* ⛔ AND NOT `trucks.takes_cash` FROM THIS SCREEN ANY MORE */
      && !/payload: \{ takes_cash: value === true \} \}[\s\S]{0,40}update_truck/.test(fn)
  })())
  /* ══ 🔴 PRICES ARE TRUCK-WIDE: ONE SPANNING CELL, AND IT IS **NOT** THE SAME RULE AS A SERVICE ROW
   * There is no per-van price column in the database and no per-van meaning. So the Standard side of
   * the PRICES rows is one cell across every van column, and the "Change prices" one spans DOWN
   * through the rule rows as well — "your menu prices" is the one answer for all four.
   * 🔴 THE TITLE IS LOAD-BEARING: without it, one cell under four van headers reads as "the other
   * vans have no price setting", which is the same misreading the truck-level SERVICE row produced
   * before it got its own title. */
  t('🔴 THE PRICES ROWS SPAN THE VAN COLUMNS, and say why on hover', (() => {
    const grid = ui.slice(ui.indexOf('{/* ── THE BODY ─'), ui.indexOf('{types.length === 0 &&'))
    return /data-prices-standard-cell/.test(grid)
      && /gridColumn: `2 \/ span \$\{vanCount\}`,\s*\n\s*gridRow: `\$\{row\} \/ span \$\{1 \+ ruleRowCount\}`/.test(grid)
      && /title=\{PRICES_TRUCK_WIDE_TITLE\}/.test(grid)
      && typeof NOW.copyService.PRICES_TRUCK_WIDE_TITLE === 'string'
      && NOW.copyService.PRICES_TRUCK_WIDE_TITLE.length > 10
      /* the rule rows have NO Standard cell of their own — the span above covers them, and a second
       * cell there would be drawn over by it */
      && /if \(r\.k === 'price-rule'\) return \[\]/.test(grid)
      /* and the span is exactly 1 + the rule rows, which fold away together */
      && /const ruleRowCount = anyPriceOn \? 3 : 0/.test(ui)
      /* ⛔ AND IT STAYS WHITE: a cell covering four striped rows cannot be two colours. */
      && /gridRow: `\$\{row\} \/ span \$\{1 \+ ruleRowCount\}`,\s*\n\s*background: WHITE_BG/.test(grid)
  })())
  /* ══ 🔴 THE COLUMN LINES RUN FROM THE HEADER TO THE BOTTOM ════════════════════════════════════
   * Dominic, 5 October 2026: "Column lines continuous from the header to the bottom: every row,
   * including section rows (PRICES, SERVICE, USED BY) and category rows, draws every column divider."
   *
   * ⛔ WHAT MADE THEM STOP: SERVICE and USED BY were ONE `col-span-full` div each, so the vertical
   * rules ended at them and began again below — the grid read as three stacked tables. A section row
   * now emits a label cell PLUS one empty cell per value column, each carrying the divider.
   * 🔴 THIS IS THE ASSERTION THAT WOULD CATCH A RETURN TO `col-span-full`, which is why it names it. */
  t('🔴 EVERY COLUMN IS DIVIDED FROM THE ONE BEFORE IT — header, section rows and category rows included', (() => {
    const divider = (ui.match(/const CELL_DIVIDER = '(.+?)'/) || [])[1]
    const grid = ui.slice(ui.indexOf('data-types-scroller'), ui.indexOf('{types.length === 0 &&'))
    /* ⚠️ COMMENT-STRIPPED (5 October 2026). The clauses below use a bounded `[\s\S]{0,N}` to bridge
     * from a branch's `if` to the markup inside it, and a prose block between the two eats the whole
     * budget — a 300-character budget failed against an explanatory comment longer than 300
     * characters, reporting a divider as missing when it was right there. Prose must not be able to
     * decide whether an assertion matches; `codeOf` is the rule this harness already follows for
     * every source-text count. */
    const headings = codeOf(grid).slice(codeOf(grid).indexOf("if (r.k === 'section' || r.k === 'category') {"))
    return divider === 'border-l border-slate-100'
      /* the header cells: the STANDARD heading, each van name, each type name */
      && (grid.match(/\$\{CELL_DIVIDER\}/g) || []).length >= 8
      /* 🔴 A SECTION OR CATEGORY ROW EMITS ONE DIVIDED CELL PER COLUMN — both on the Standard side
       * and on the type side — rather than one cell across the whole width. */
      /* ⚠️ RE-AIMED WITH ITS SIBLING (5 October 2026): the Standard side's heading cells now carry a
       * CONDITIONAL rule, because a category row takes none. The DIVIDER is the claim and it is
       * unconditional; only the `border-t` beside it moved. */
      && /return vanHeaders\.map\(\(v, i\) => \([\s\S]{0,300}\$\{CELL_DIVIDER\} \$\{r\.k === 'category' \? '' : 'border-t border-slate-100'\}/.test(headings)
      /* 🔴 RE-AIMED: `isBand` COVERS `section` AND `items-band` (5 October 2026). The type side tests
       * the compiled notion rather than listing the kinds, so the ITEM PRICES band draws its column
       * lines by the same branch every other heading uses. */
      /* ══ 🔴 RE-AIMED: A CATEGORY ROW HAS NO HORIZONTAL RULE (5 October 2026) ═══════════════════
       * The rule above a category heading was removed on BOTH sides of the grid — it had been drawing
       * a dark stub under the label column only, stopping at the first divider, which looked broken
       * because it was. So the type-side branch now emits the divider and a CONDITIONAL `border-t`.
       * ⛔ THE CLAIM THIS CHECK EXISTS FOR IS UNCHANGED AND IS ASSERTED HARDER BELOW: the VERTICAL
       * column divider still runs through these rows. That is what `CELL_DIVIDER` is, and it is not a
       * `border-t`, so dropping the horizontal rule cannot touch it. */
      && /if \(isBand \|\| r\.k === 'category'\) \{[\s\S]{0,200}CELL_DIVIDER\} \$\{r\.k === 'category' \? '' : 'border-t border-slate-100'\}/.test(codeOf(grid))
      /* 🔴 BOTH SIDES EMIT THE DIVIDER WITH A CONDITIONAL RULE — counted, so one side cannot be
       * changed without the other. */
      && (grid.match(/CELL_DIVIDER\} \$\{r\.k === 'category' \? '' : 'border-t border-slate-100'\}/g) || []).length === 2
      /* ⛔ A CATEGORY ROW TAKES NO RULE ON **EITHER** SIDE — asserted as the absence of an
       * unconditional `border-t` in both heading branches, which is what would bring the stub back. */
      && !/r\.k === 'category'\) \{\s*\n\s*return <div key=\{t\.id\} className=\{`\$\{CELL_DIVIDER\} border-t/.test(grid)
      && /const isBand = r\.k === 'section' \|\| r\.k === 'items-band'/.test(ui)
      /* ⚠️ AND THE BAND'S OWN SPANNING CELL STILL DRAWS THE DIVIDER. It is the one heading row whose
       * Standard side is a single cell across the van columns — it carries the "press a price" hint —
       * so it is the one place a column line could go missing without any other check noticing. */
      /* ══ 🔴 RE-AIMED: THE ITEM PRICES BAND'S STANDARD SIDE IS NOW ONE CELL PER VAN COLUMN ════════
       * It was a SINGLE SPANNING cell carrying the "Press a price to type your own" hint. The hint was
       * removed (5 October 2026), and a spanning empty cell would draw ONE divider where there should
       * be two — so the band now emits an empty divided cell per van column like every other heading.
       * ⛔ WHICH MAKES THIS A STRONGER CHECK THAN BEFORE: a spanning cell here was the one place the
       * column lines could legitimately be interrupted, and now nothing interrupts them. */
      && /if \(r\.k === 'items-band'\) \{[\s\S]{0,200}return vanHeaders\.map\(\(v, i\) => \([\s\S]{0,200}\$\{CELL_DIVIDER\} border-t border-slate-100/.test(codeOf(grid))
      /* ⛔ AND THE HINT IS GONE FROM THIS SCREEN ENTIRELY. */
      && !/PRICE_TYPE_HINT/.test(codeOf(ui))
      /* ⛔ AND NOTHING SPANS THE WHOLE WIDTH ANY MORE — the shape that broke the lines.
       * ⚠️ AGAINST `codeOf`, because the comment recording the change names the class it replaced. */
      && !/col-span-full/.test(codeOf(ui))
      && !/gridColumn: '1 \/ -1'/.test(codeOf(ui))
      // ⛔ and the divider's colour is the ROW dividers' colour, not a second weight of line
      && /border-t border-slate-100/.test(grid)
  })())
  /* ══ 🔴 THE ZEBRA STRIPES, AND THE RESTART ════════════════════════════════════════════════════
   * "rows alternate white / a very light grey (about #F6F8FA), restarting after each section or
   * category heading. Section rows a slightly darker band (about #E9EEF4) with bold small-caps
   * labels. A cell spanning several rows stays white."
   * 🔴 THE TWO COLOURS ARE HEX CONSTANTS, not Tailwind classes, because neither figure is a Tailwind
   * value (slate-50 is #F8FAFC, slate-100 is #F1F5F9) and the render harness reads the computed
   * background to prove the alternation. These constants are that contract. */
  t('🔴 THE STRIPES ALTERNATE AND RESTART AFTER EVERY HEADING, and a section row is a darker band', (() => {
    const fn = ui.slice(ui.indexOf('const stripeIndex = useMemo('), ui.indexOf('const stripeFor ='))
    return /const STRIPE_BG = '#F6F8FA'/.test(ui)
      && /const SECTION_BG = '#E9EEF4'/.test(ui)
      && /const WHITE_BG = '#FFFFFF'/.test(ui)
      /* 🔴 THE COUNTER RESETS AT A SECTION **AND** AT A CATEGORY. Striping continuously would make the
       * parity depend on how many items the previous category happened to have — the banding would look
       * like it meant something, and it would mean nothing.
       * ⚠️ "BANDING", NOT THE SINGULAR OF "STRIPES", AND THAT IS NOT A STYLE CHOICE. The harness
       * runner's screen (scripts/run-harnesses.cjs) refuses any listed file containing that word as a
       * whole word, case-insensitively, because it is the name of the card processor. Its own comment
       * says a file "named after, say, a striped layout" is fine — and it is, because `\bstripe\b`
       * does not match "striped" — but the SINGULAR does trip it. Writing it would make this file
       * unrunnable through the runner, which is exactly the pre-existing fault this build fixed in two
       * other comments. Say "band" or "striped"; never the bare singular. */
      && /\{ n = 0; out\.push\(false\); continue \}/.test(fn)
      && /out\.push\(n % 2 === 1\)/.test(fn)
      /* a heading row is never striped: the section has its own band, the category is white */
      /* 🔴 RE-AIMED: `isBand ? SECTION_BG` (5 October 2026) — the ITEM PRICES band gets the SAME
       * darker band as a section, from the same expression, rather than a second rule that could
       * drift to a different grey. */
      && /const bg = isBand \? SECTION_BG/.test(ui)
      /* ⛔ …AND THE BAND RESTARTS THE COUNTER. A heading that is never striped but does not reset
       * would hand the parity of every item row below it to how many setting rows sat above. */
      && /r\.k === 'section' \|\| r\.k === 'items-band' \|\| r\.k === 'category'\) \{ n = 0/.test(fn)
      && /r\.k === 'category' \? WHITE_BG/.test(ui)
      && /stripeFor\(idx\) \? STRIPE_BG : WHITE_BG/.test(ui)
      /* bold small-caps on a section label — Settings' own heading token */
      /* ⚠️ `minHeight`, NOT `height` (5 October 2026) — every body cell sets a minimum so a wrapping
       * label can grow its row. See the note on the Same settings cell. */
      && /\$\{SUBCARD_HEADING\} border-t border-slate-100`\}\s*\n\s*style=\{\{ gridColumn: 1, gridRow: row, minHeight: h, background: bg \}\}/.test(ui)
  })())
  /* ══ 🔴 THE ROW HEIGHTS ARE NUMBERS IN ONE PLACE, SHARED WITH THE RENDER HARNESS ══════════════
   * They live in `components/shared/PriceControls.tsx` so the grid, the dashboard sheet and
   * `scripts/event-types-render.cjs` read the SAME numbers — "rows are 36px" is then a measurement,
   * not a class someone has to keep in step.
   * ══ 🔴 RE-AIMED TO THE DENSER FIGURES (5 October 2026) ════════════════════════════════════════
   * The first set was 44 / 36 / 26 / 34 with 32px controls. Dominic: the grid is too tall — make it
   * denser. The set is now **control 36, item 28, category 22, section 28**, with 28px controls and
   * 22px typed-price boxes in the grid.
   * ⛔ `CONTROL_H` (32) DID NOT MOVE, AND MUST NOT: that is the dashboard's "Prices for this event"
   * sheet, which is touched by hand during service. The grid got its own `GRID_CONTROL_H` and
   * `GRID_TYPED_H` precisely so that making the manage screen denser could not shrink the sheet —
   * and this check asserts the sheet's number alongside the grid's, so a future tidy that "unified"
   * them would fail here rather than at the hatch. */
  t('🔴 THE ROW HEIGHTS ARE SHARED CONSTANTS, and the grid uses them for every row kind', (() => {
    const grid = ui.slice(ui.indexOf('{/* ── THE BODY ─'), ui.indexOf('{types.length === 0 &&'))
    const H = NOW.priceControls && NOW.priceControls.ROW_H
    const PC_SRC = fs.readFileSync(path.join(REPO, 'components/shared/PriceControls.tsx'), 'utf8')
    /* 🔴 ONE IMPORT, AND IT NAMES EVERY PRICE CONTROL AND EVERY HEIGHT THIS SCREEN USES.
     * ⚠️ MATCHED AS A SET, NOT AS A LINE. The first version pinned the exact wrapping of the import
     * statement, so adding `GRID_CONTROL_H` and `GRID_TYPED_H` re-wrapped the list and the check
     * failed while nothing it cared about had changed. A formatter must not be able to break a
     * design assertion — what matters is WHICH names are imported from WHERE.
     * ⚠️ `[^}]*?`, NOT `[\s\S]*?`: a lazy any-character match still has to reach the CLOSING text, so
     * it began at the file's FIRST `import {` (React's) and swallowed three statements and two
     * comment blocks on the way. The brace class cannot cross an earlier `}`, so it can only ever
     * match the one import it is aimed at. */
    const imp = (ui.match(/import \{([^}]*?)\} from '@\/components\/shared\/PriceControls'/) || [])[1]
    const imports = new Set((imp || '').split(',').map(x => x.trim()).filter(Boolean))
    return ['PriceAmountInput', 'PriceCell', 'PriceModeSelect', 'PriceRoundingSelect',
      'ROW_H', 'GRID_CONTROL_H', 'GRID_TYPED_H'].every(n => imports.has(n))
      && /const h = isBand \? ROW_H\.section/.test(grid)
      && /r\.k === 'category' \? ROW_H\.category/.test(grid)
      && /r\.k === 'price-item' \? ROW_H\.item/.test(grid)
      && /: ROW_H\.control/.test(grid)
      /* ⛔ AND NO `min-h-11` SURVIVES: a minimum height is not a height, and it is what made the rows
       * taller than asked for when a cell's content grew. */
      && !/min-h-11/.test(grid)
      && (!H || (H.control === 36 && H.item === 28 && H.category === 22 && H.section === 28))
      /* 🔴 THE GRID'S OWN CONTROL HEIGHTS EXIST AND ARE SMALLER THAN THE SHEET'S — the split that
       * lets the manage screen be dense while the sheet stays touchable. */
      && /export const CONTROL_H = 32/.test(PC_SRC)
      && /export const GRID_CONTROL_H = 28/.test(PC_SRC)
      && /export const GRID_TYPED_H = 22/.test(PC_SRC)
      /* ⛔ AND THE GRID PASSES THE GRID'S HEIGHTS, not the sheet's default, to the price controls. */
      && /height=\{GRID_CONTROL_H\}/.test(ui)
      && /height=\{GRID_TYPED_H\}/.test(ui)
  })())
  /* 🔴 AND EXACTLY ONE ROW IS TRUCK-LEVEL TODAY, decided by where it writes rather than by a list.
   * Asserted against the compiled rows so the report's table cannot be wrong. */
  t('🔴 …and the split is: `takes_cash` truck-level, the other four per van', (() => {
    const fn = ui.slice(ui.indexOf('function standardWriteFor('), ui.indexOf('const GRID_LABEL_W'))
    /* ⚠️ SPLIT ON THE `case` BOUNDARIES, NOT SCANNED FORWARD FROM EACH ONE. The first draft matched
     * `case 'X':[\s\S]{0,400}?scope: 'truck'` — which runs straight past the end of X's branch into
     * the NEXT case and reports its scope as X's. It named `order_ready` as truck-level (it is not;
     * `takes_cash` follows it) and missed `buzzer_prompt` entirely because its branch is long. A
     * lookahead with a character budget is not a parser. */
    const blocks = fn.split(/\n\s{4}(?=case '|default:)/).slice(1)
    const scopeOf = {}
    for (const b of blocks) {
      const id = (b.match(/^case '(\w+)':/) || [])[1]
      if (!id) continue
      scopeOf[id] = /scope: 'truck'/.test(b) ? 'truck' : /scope: 'van'/.test(b) ? 'van' : 'none'
    }
    const ids = NOW.types.SERVICE_ROWS.map(r => r.id)
    const truck = ids.filter(id => scopeOf[id] === 'truck')
    const van = ids.filter(id => scopeOf[id] === 'van')
    /* 🔴 EVERY ROW IS ACCOUNTED FOR, so a row added later cannot be silently neither. */
    return ids.every(id => scopeOf[id] === 'truck' || scopeOf[id] === 'van')
      && truck.length === 1 && truck[0] === 'takes_cash'
      && van.length === 4
      && ['collection_interval_mins', 'order_ready', 'offline_protection', 'buzzer_prompt'].every(id => van.includes(id))
  })())
  /* 🔴 THE PHONE PICKER LISTS THE VAN COLUMNS AND THEN THE TYPES, in the grid's order. */
  t('🔴 on a phone the picker lists the van columns, then the types', (() => {
    return /\.\.\.\(vanColumns\.length > 1[\s\S]{0,200}vanColumns\.map\(v => \(\{ id: `van:\$\{v\.id\}`/.test(ui)
      && /\.\.\.types\.map\(t => \(\{ id: t\.id, name: t\.name/.test(ui)
      && /if \(phoneSel\.startsWith\('van:'\)\)/.test(ui)
      // the selection is DERIVED, so the picker and the card below it cannot disagree
      && /const phoneSel = useMemo\(\(\) => \{/.test(ui)
      && /if \(phoneType && columns\.some\(c => c\.id === phoneType\)\) return phoneType/.test(ui)
  })())
  /* 🔴 THE VANS ARRIVE OLDEST-FIRST, which is what "first van first" means everywhere else. */
  t('🔴 the route orders the vans oldest-active-first, so the columns cannot reorder', (() => {
    const r = fs.readFileSync(path.join(REPO, 'app/api/event-types/route.ts'), 'utf8')
    return /\.eq\('active', true\)\s*\n\s*\.order\('created_at', \{ ascending: true \}\)/.test(r)
  })())

  /* ══ 🔴 §1 (ADDITION) · NO LINKS OUT, AND ONE CONTROL PER VAN WHERE THEY DIFFER ═══════════════
   * Dominic, 4 October 2026: "NO 'SETTINGS' LINKS IN THE MODAL. Every Standard value must be
   * changeable right here." */
  t('⛔ THE MODAL CONTAINS NO "Settings" LINK AT ALL', (() => {
    const code = codeOf(ui)
    return !/SettingsLink/.test(code)
      // ⛔ no anchor to Settings, however it is spelled
      && !/tab=settings/.test(code)
      && !/<a href=/.test(code)
      && !/STANDARD_PER_VAN_LINK/.test(code)
  })())
  /* ⛔ THE "ONE CONTROL PER VAN IN ONE CELL" CHECKS ARE DELETED, WITH THE DESIGN THEY DESCRIBED.
   * They asserted a stack inside the Standard cell, gated on `perVan`. The column model above
   * replaces both halves: one cell per column, and the columns exist on the van COUNT. Keeping them
   * would mean asserting two mutually exclusive layouts.
   * 🔴 WHAT THEY PROTECTED IS NOT LOST — "each control saves to its own van" is now asserted by
   * "…each van column saves to THAT VAN ONLY" above, against the same `onStandardVan` handler. */
  t('🔴 the per-van handler writes ONE van, with the same payload builder as the all-vans path', (() => {
    return /const saveStandardForVan = async \(row: ServiceRow, vanId: string, value: boolean \| number \| string\) =>/.test(ui)
      && /const write = standardWriteFor\(row, value\)/.test(ui)
      && /await manageApi\(write\.action, \{ vanId, \.\.\.write\.payload \}\)/.test(ui)
      && /if \(!write \|\| write\.scope !== 'van' \|\| !manageApi\) return/.test(ui)
  })())

  /* 🔴 A TYPE INHERITING A DIFFERING ROW SAYS "Varies by van", FADED — NOT "Set per van", and not
   * link text. The brief: "Use the same faded style as other inherited values, not underlined link
  /* ══ ⛔ NONE OF THE THREE PHRASES SURVIVES ════════════════════════════════════════════════════
   * Dominic, 4 October 2026: "No 'Varies by van', no 'Same as Standard', no 'Set per van' text
   * anywhere." Three passes of this build each drew one of them in a cell instead of a value.
   *
   * ⚠️ AGAINST `codeOf`, SO COMMENTS EXPLAINING THEIR REMOVAL ARE ALLOWED. The question is what an
   * operator READS, and the render harness asks that separately against the rendered text — which is
   * the stronger of the two, and the reason this one can afford to be lenient about prose. */
  t('⛔ "Varies by van", "Set per van" AND "Same as Standard" APPEAR NOWHERE IN THE MODAL', (() => {
    const modal = codeOf(ui.slice(0, ui.indexOf('// 2 · THE ADD EVENT PICKER')))
    const copy = codeOf(fs.readFileSync(path.join(REPO, 'lib/copy/serviceSettings.ts'), 'utf8'))
    return ['Varies by van', 'Set per van', 'Same as Standard']
      .every(phrase => !modal.includes(phrase) && !copy.includes(phrase))
      // ⛔ and the constants that held two of them are gone
      && !/TYPE_VARIES_BY_VAN|STANDARD_PER_VAN/.test(ui)
  })())
  /* 🔴 WHAT REPLACED THEM: a real control at a real value, faded, with a hover title saying whose
   * value it is. The title is now the only place that nuance lives, so it is load-bearing. */
  /* ══ ⛔ RE-AIMED: NOTHING INHERITS ANY MORE (5 October 2026) ═══════════════════════
   * This asserted the whole "faded control at the first van's value, with a hover title" design, and
   * that design is the second half of the localhost report. A NULL column was drawn FADED at
   * Standard's value, so the cell was showing **somebody else's setting** — turning cash on for Van 1
   * made every untouched type appear to change with it ("showed Market changing"). The fade said
   * "inherited", and no fade has ever made that reading safe at a glance on a grid of forty switches.
   *
   * 🔴 THE FIX IS AT CREATION: a new type is a COPY of Van 1's resolved values and `Match Standard`
   * re-copies on demand, so every column has a real value and there is nothing left to inherit. The
   * claim is therefore inverted — no fade, no hover title, and the constant that held the title is
   * gone from this screen's imports.
   * ══ ⛔ AND THE ONE SURVIVING EXCEPTION IS NOW GONE TOO (5 October 2026) ════════════════════════
   * The untouched price Rounding was faded, on the argument that `price_rounding` is NOT NULL DEFAULT
   * 'none' so the screen had no other way to say "not chosen".
   * 🔴 DOMINIC: NOTHING GREYED OR FADED ANYWHERE — "None" in Rounding looks like any normal value.
   * And the old argument was weak: "no rounding" IS the value the rule uses, whoever chose it, so
   * half-strength told the operator their rule was somehow unsettled.
   * ⛔ SO THE COUNT IS **ZERO** ACROSS THE WHOLE FILE, which is a stronger claim than "exactly two,
   * both Rounding" — there is no exception left to multiply.
   * ⚠️ THE ONLY GREY LEFT IN THE GRID is a menu price in a column that is not changing prices, and
   * that is `grey` on `<PriceCell>` — a statement of fact, not a control at reduced strength. It is
   * asserted separately and is deliberately not a `faded=`.
   */
  t('⛔ NOTHING FADES ANYWHERE — not a service cell, not the price Rounding', (() => {
    /* ⚠️ SCOPED TO `TypeControl` ITSELF, not to the rest of the file: the PRICES cells and the phone
     * card live below it and the price Rounding's fade is the one allowed exception. */
    const ctl = ui.slice(ui.indexOf('function TypeControl('), ui.indexOf('// 1b · THE PHONE CARDS'))
    /* 🔴 AND EVERY FADE IN THE WHOLE FILE IS COUNTED TOO, so the exception cannot multiply: exactly
     * two, and both are the price Rounding (the grid's and the phone card's). */
    const allFades = (codeOf(ui).match(/faded=/g) || []).length
    const roundingFades = (codeOf(ui).match(/faded=\{[a-zA-Z!.]*price_rounding === 'none'\}/g) || []).length
    return ctl.length > 400
      /* ⛔ the three service controls draw no fade at all */
      && (ctl.match(/faded=/g) || []).length === 0
      /* ⛔ ZERO, FILE-WIDE. Was `allFades === 2 && roundingFades === 2`. */
      && allFades === 0 && roundingFades === 0
      /* ⛔ and no hover title claiming whose value it is */
      && !/inheritTitle/.test(ui)
      && !/TYPE_FOLLOWS_VAN_TITLE/.test(codeOf(ui))
      /* ⛔ and `rowIsOwn`, whose ONLY consumer was that fade, is deleted rather than left for
       * someone to reach for — which is how this defect would come back */
      && !/function rowIsOwn\(/.test(ui)
      /* ⛔ AND THE ROUNDING'S FADE IS GONE BY NAME, so a revert is caught rather than merely counted. */
      && !/faded=\{pr!\.price_rounding === 'none'\}/.test(ui)
      /* ✅ THE ONE GREY THAT SURVIVES, AND IT IS NOT A FADE: a menu price in a column whose switch is
       * off. `grey` is a statement about the price, not a control drawn at half strength. */
      && /grey=\{!on\}/.test(ui)
      /* 🔴 AND A TYPE'S CELL SHOWS ITS **OWN** VALUE. A pre-backfill NULL is still displayed at the
       * value that will be used — the resolver chain is deliberately unchanged, so nothing breaks
       * before 20261012 runs — but it is not faded, because nothing subscribes any more. */
      && /const explicit = stored === true \|\| stored === false/.test(ctl)
      && /const shown = explicit \? stored === true : standardSwitchValue\(row, standard\)/.test(ctl)
  })())
  /* 🔴 AND CHANGING STANDARD CANNOT REACH A TYPE. The two writes are separate actions on separate
   * tables: Standard goes to `truck_vans` / `trucks` through Settings' own action, a type goes to
   * `event_types`. Asserted from the handlers rather than claimed. */
  t('🔴 CHANGING STANDARD NEVER WRITES A TYPE, and changing a type never writes a van', (() => {
    const std = ui.slice(ui.indexOf('const saveStandard = async'), ui.indexOf('const move = ('))
    const patchFn = ui.slice(ui.indexOf('const patch = (id: string'), ui.indexOf('const patchPricing'))
    return /manageApi\(write\.action/.test(std)
      /* ⛔ the Standard writers never touch the event-types route */
      && !/action: 'update'/.test(codeOf(std))
      && !/event_types/.test(codeOf(std))
      /* ⛔ and the type writer never calls manageApi */
      && /action: 'update', id/.test(patchFn)
      && !/manageApi/.test(codeOf(patchFn))
  })())
  /* 🔴 `standardIsPerVan` IS NOW ONLY THE *TYPE* COLUMN'S QUESTION, and that is the design change.
   * The Standard side stopped asking it when the columns became a fact about the van count — which
   * is exactly why the layout no longer jumps. It still decides "Varies by van" and the interval
   * fallback, and it is still one function so the two cannot disagree. */
  t('🔴 one predicate decides "do the vans differ", and only the TYPE columns ask it', (() => {
    const fn = ui.slice(ui.indexOf('function standardIsPerVan('), ui.indexOf('function standardSwitchValue('))
    const uses = (ui.match(/standardIsPerVan\(/g) || []).length
    return /return standard\.collection_interval_mins\.perVan/.test(fn)
      && /return standard\.offline_protection\.perVan/.test(fn)
      && /return s\.perVan/.test(fn)
      /* The definition and the interval fallback. It no longer decides any LAYOUT — the van columns
       * key off the van count, and the type cells always draw a real control — which is why the use
       * count fell. That is the design, not an omission. */
      && uses >= 2
      && /standardIsPerVan\(row, standard\) \? TYPE_INTERVAL_CHOICES\[0\]/.test(ui)
  })())

  /* ══ 🔴 §1 · "SAME AS STANDARD" IS GONE FROM EVERY CONTROL ════════════════════════════════════
   * This replaces four checks that asserted the OPPOSITE — the dropdown option, the greyed switch
   * with its label, and the link back to NULL. The brief: "Remove the 'Same as Standard' labels, the
   * links, and the 'Same as Standard' option from every dropdown. A dropdown lists only real
   * settings." So the four are inverted, and the state is now carried by FADING alone. */
  /* ⚠️ RE-AIMED: `StandardControl` HAS BEEN DELETED SINCE THIS WAS WRITTEN (the column model), so the
   * slice anchored on it returned the rest of the file and this check was reading far more than it
   * meant to. It is now `OneStandardControl` to `TypeControl` — the two components that render a
   * SETTING's control, which is where the pseudo-option lived. The claim is unchanged: the ban is on
   * the WORDS. */
  t('⛔ NO DROPDOWN OFFERS "Same as Standard", AND NOTHING IS LABELLED IT', (() => {
    const code = codeOf(ui)
    const controls = ui.slice(ui.indexOf('function OneStandardControl('), ui.indexOf('function TypeControl('))
    return controls.length > 200 && !/Same as Standard/.test(code)
      /* ⛔ NO OPTION LABELLED "Same as Standard" — that is the ban, and it is on the WORDS.
       * ⚠️ IT IS NO LONGER A BAN ON AN EMPTY-VALUED OPTION. There is one now: where the vans differ, a
       * type's control offers "Varies by van" as its first choice, value `''`, writing NULL. That was
       * added on Dominic's instruction and it is not the same thing — "Same as Standard" was a
       * cross-reference the operator had to look across the table to resolve, where "Varies by van" is
       * a statement of the value itself. The empty value is now checked to be labelled correctly
       * rather than forbidden. */
      && !/<option value="">(?!Standard<)/.test(codeOf(controls))
      /* ⛔ AND NO EMPTY-VALUED OPTION AT ALL IN A SETTING'S CONTROL. "Varies by van" was briefly
       * offered as one; it went with the rest of the phrases (4 October), so the licence this check
       * used to grant it is WITHDRAWN rather than left standing for something else to use. */
      && [...code.matchAll(/\{ value: '', label: /g)].length === 0
      && !/label: 'Same as Standard'/.test(code)
      /* 🔴 AND EVERY OPTION LIST ON THE SCREEN IS BUILT FROM AN IMPORTED CONSTANT, never from
       * literals written here: the intervals, the two offline modes, the five price modes and the
       * three roundings. That is what stops a sixth pseudo-option arriving. */
      && /TYPE_INTERVAL_CHOICES\.map\(/.test(ui)
      && /const OFFLINE_MODE_CHOICES = OFFLINE_PROTECTION_MODES\.map\(/.test(ui)
  })())
  /* 🔴 A NULL SETTING RENDERS FADED, SHOWING THE VALUE IT INHERITS. One implementation of "faded"
   * (`opacity-50`), applied to the same control — not a second palette. */
  /* ⚠️ "FADED" IS THE PRIMITIVES' OWN PROP NOW, not a class string in this component. The v3 first
   * pass had `SELECT_CLASS_OWN` / `SELECT_CLASS_INHERITED` here; the addition moved both controls to
   * the shared components, which carry `faded` themselves. So this asserts the PROP, and the shared
   * component's single definition of what faded looks like is asserted separately below. */
  /* ══ ⛔ RE-AIMED: A TYPE'S CELL SHOWS **ITS OWN** VALUE, CRISP (5 October 2026) ══════════
   * This asserted the fade — a NULL column drawn at Standard's value with `opacity-50`. That is the
   * design the localhost report killed: the cell was showing somebody else's setting, so changing
   * Van 1 made every untouched type appear to change too.
   * 🔴 WHAT IS ASSERTED INSTEAD IS THE PROPERTY THAT MATTERS AND IS NEW: the cell shows the value
   * that will actually be used, and a Standard edit cannot reach it (proved from the two handlers
   * above). The fade's absence is asserted in its own check; this one is about the VALUE.
   * ⚠️ A PRE-BACKFILL NULL IS STILL DISPLAYED AT THE FALLBACK, because the resolver chain is
   * deliberately unchanged — nothing breaks before 20261012 runs. After it, there are no NULLs left.
   */
  t('🔴 A TYPE\u2019S CELL SHOWS ITS OWN VALUE, and a pre-backfill NULL still shows the fallback', (() => {
    const ctl = ui.slice(ui.indexOf('function TypeControl('), ui.indexOf('// 1b · THE PHONE CARDS'))
    return /const stored = \(type as unknown as Record<string, unknown>\)\[key\]/.test(ctl)
      && /const explicit = stored === true \|\| stored === false/.test(ctl)
      && /const shown = explicit \? stored === true : standardSwitchValue\(row, standard\)/.test(ctl)
      /* the offline switch does the same, on its own column */
      && /const explicitOff = type\.offline_protection === true \|\| type\.offline_protection === false/.test(ctl)
      && /const shownOffline = explicitOff\s*\n?\s*\? type\.offline_protection === true\s*\n?\s*: standard\.offline_protection\.enabled/.test(ctl)
      /* and the interval dropdown falls back to a real value, never to an empty option */
      && /type\.collection_interval_mins\s*\n?\s*\?\? \(standardIsPerVan\(row, standard\) \? TYPE_INTERVAL_CHOICES\[0\] : standard\.collection_interval_mins\.value\)/.test(ctl)
      /* 🔴 AND THE RESOLVER CHAIN IS UNTOUCHED BY THIS BUILD, which is what makes the data migration
       * and the code independent of each other — either order is safe. */
      && /return eventOverride \?\? type\?\.takes_cash \?\? vanDefault \?\? truckDefault \?\? false/
        .test(fs.readFileSync(path.join(REPO, 'lib/event-types/resolve.ts'), 'utf8'))
      // ⛔ and this file defines no control look of its own any more
      && !/SELECT_CLASS_OWN|SELECT_CLASS_INHERITED|SELECT_BASE/.test(ui)
  })())
  t('🔴 …AND TOUCHING IT STORES AN EXPLICIT VALUE', (() => {
    const ctl = ui.slice(ui.indexOf('function TypeControl('))
    /* The switch writes a boolean (never null); both dropdowns write a real value. Nothing in this
     * component writes null to a single row any more — clearing is Match Standard's job alone. */
    return /onToggle=\{\(\) => onPatch\(\{ \[key\]: !shown \}\)\}/.test(ctl)
      && /onChange=\{v => onPatch\(\{ collection_interval_mins: Number\(v\) \}\)\}/.test(ctl)
      /* ⚠️ RE-AIMED: `offlinePatch` IS DELETED. The offline switch writes ONLY the switch now, and the
       * mode is written by the "When offline" sub-row — the behavioural change, and it matters:
       * turning protection off and on again must not silently change what it DOES. */
      && /onToggle=\{\(\) => onPatch\(\{ offline_protection: !shownOffline \}\)\}/.test(ctl)
      && !/offlinePatch/.test(codeOf(ui))
      /* and the mode is written, with the switch, from the sub-row */
      && /onPatch\(\{ offline_protection: true, offline_protection_mode: m \}\)/.test(ui)
      // ⛔ the per-control way back to NULL is gone
      && !/onPatch\(\{ \[key\]: null \}\)/.test(ctl)
  })())
  /* ⛔ THE "TAP TO REVEAL" CHECK IS DELETED WITH THE AFFORDANCE IT DESCRIBED. Revealing-without-
   * storing mattered when the inherited state was a line of text; it is a dropdown option now, so
   * the state is reachable and reversible by the same control as every other value. What it
   * protected — that nothing is written until the operator chooses — is inherent in a <select>.
   */

  /* ══ 🔴 §1 · MATCH STANDARD — THE ONLY WAY BACK TO INHERITING ═════════════════════════════════ */
  /* ══ ⚠️ RE-AIMED: MATCH STANDARD **COPIES** NOW; IT USED TO CLEAR (5 October 2026) ═══════
   * It sent `blankTypeValues()` — every column NULL — which under the old design meant "follow
   * Standard from now on". A type holds its own values, so there is no "follow": the same words now
   * COPY what Standard is right now. The operator's intent is identical; the copy is a SNAPSHOT
   * rather than a SUBSCRIPTION, which is exactly the change — a subscription is what made Market
   * move when Van 1 moved.
   * 🔴 AND THE SERVER COMPUTES IT, from the same `vanOneServiceValues` that `+ New event type` uses,
   * so the ⋯ menu's promise and the row that lands are one computation. A client-sent payload would be
   * a second definition of "Standard".
   */
  t('🔴 MATCH STANDARD COPIES VAN 1\u2019S CURRENT VALUES, after a confirm', (() => {
    const r = fs.readFileSync(path.join(REPO, 'app/api/event-types/route.ts'), 'utf8')
    const fn = r.slice(r.indexOf("if (action === 'match_standard')"), r.indexOf("if (action === 'reorder')"))
    return /const matchStandard = \(id: string\) =>\s*\n\s*act\(\{ action: 'match_standard', id \}/.test(ui)
      /* ⛔ and NOT by sending a blank from the client any more */
      && !/action: 'update', id, \.\.\.blankTypeValues\(\)/.test(ui)
      /* the server's own handler: Van 1's values, every service column, nothing else */
      && fn.length > 200
      && /const seed = await vanOneServiceValues\(truck\.id, truck\.takes_cash \?\? null\)/.test(fn)
      && /for \(const k of SERVICE_KEYS\) patch\[k\] = cleanValue\(k, seed\[k\]\)/.test(fn)
      /* ⛔ IT DOES NOT TOUCH PRICES. They are not service columns and a type's prices are turned off
       * by its own switch — and the confirm says so. */
      && !/price_change_on|price_mode|price_amount|price_rounding/.test(fn)
      && /are not changed/.test(ui)
      && /MATCH_STANDARD_CONFIRM/.test(ui)
      && /setConfirmMatch\(t\.id\)/.test(ui)
      // the confirm has to be dismissable without acting
      && /onClick=\{\(\) => setConfirmMatch\(null\)\}/.test(ui)
      /* 🔴 AND IT SHOWS WHAT THE COPY WILL BE, from the server's own figures, before it is pressed */
      && /It will use: \{summariseType\(vanOneValues as unknown as TypeFor\)\}/.test(ui)
  })())
  /* ⚠️ `NOW.types`, NOT `ty` — that local belongs to §3 and is not in scope here. The first draft
   * used it and this whole file crashed with a ReferenceError before printing §5b. */
  t('🔴 …and `blankTypeValues()` really is every service column', (() => {
    const T = NOW.types
    const blank = T.blankTypeValues()
    return T.SERVICE_KEYS.every(k => blank[k] === null)
      && Object.keys(blank).length === T.SERVICE_KEYS.length
  })())

  /* ── 🔴 THE ⋯ MENU ──────────────────────────────────────────────────────────────────────────── */
  t('🔴 Rename, Move left, Move right and Delete are in a ⋯ MENU on each type header', (() => {
    /* ⚠️ RE-AIMED: the header is planned and placed now, so `{/* heading row *\/}` and
     * `SERVICE</div>` are both gone. The type header's own data attribute is the anchor. */
    const hdr = ui.slice(ui.indexOf('data-grid-type-header'), ui.indexOf('{/* ── HEADER ROW 2:'))
    /* ⚠️ FIVE ITEMS NOW, IN THE BOARD'S ORDER: Rename · Move left · Move right · Match Standard ·
     * Delete. The order is asserted, because Match Standard sitting under Delete would put a
     * destructive-looking item above a reset one. */
    const order = ['>Rename<', '>Move left<', '>Move right<', '{MATCH_STANDARD_LABEL}<', '>Delete<']
    const at = order.map(x => hdr.indexOf(x))
    return /aria-label=\{`More for \$\{t\.name\}`\}/.test(hdr)
      && at.every(i => i >= 0)
      && at.every((v, i) => i === 0 || v > at[i - 1])
  })())
  /* ⚠️ RE-AIMED AT THE ROW PLAN. `USED BY</div>` was a literal in a `col-span-full` div, and that
   * shape is gone — it is what made the column dividers stop at the section headings. */
  /* ══ ⛔ REVERSED: THE "Used by" ROW IS GONE (5 October 2026) ══════════════════════════════════
   * This asserted the row STAYS, which was right while it was the only place a type's upcoming-event
   * count appeared. Dominic removed it: two rows of a dense grid carrying a number that matters at
   * exactly one moment. The number moved to the delete confirm, and the claim reverses with it.
   * 🔴 ASSERTED AS AN ABSENCE **PLUS** THE REPLACEMENT, not as an absence alone — "the row is gone"
   * on its own would also pass if the count had been dropped altogether. */
  t('⛔ the "Used by" row is GONE, and its count is in the delete confirm instead',
    !/label: 'USED BY'/.test(codeOf(ui)) && !/label: 'Upcoming events'/.test(codeOf(ui))
    && !/k: 'used-by'/.test(codeOf(ui))
    && /typeById\.get\(confirmDelete\)\?\.upcoming/.test(ui))
  t('⚠️ on a phone it is one column with a picker at the top',
    /md:hidden/.test(ui) && /et-phone-pick/.test(ui))

  /* ── 🔴 §3 · OFFLINE PROTECTION OFFERS WHAT THE SETTINGS CONTROL OFFERS ───────────────────────
   * Settings › Kitchen offers a SWITCH then a MODE; the type's dropdown says the same in one control,
   * and its two mode values come from the SAME constants that screen renders. */
  /* ⚠️ THREE CHOICES NOW, NOT FOUR — "Same as Standard" left the list (§1). The brief: "The Offline
   * protection options are the OFFLINE_PROTECTION_MODES labels plus Off." */
  /* ══ 🔴 RE-AIMED: OFFLINE PROTECTION IS A SWITCH PLUS A SUB-ROW (5 October 2026) ═════════════
   * It was ONE three-choice dropdown — Off / Pause ordering / Keep taking orders… — and this asserted
   * exactly that list. Dominic: "Offline order protection becomes a SWITCH (Standard per van and per
   * type), and when on, an indented sub-row 'When offline' shows the mode select in that column."
   *
   * ⛔ WHY THE DROPDOWN WAS WRONG: it made this the only row in the grid that was not a switch, and it
   * put a SAFETY-CRITICAL mode at the same level as an on/off. An operator scanning the column for
   * "is protection on here?" had to read and interpret a sentence.
   * 🔴 THE VOCABULARY IS UNCHANGED, AND THAT IS STILL THE CLAIM: the two mode labels come from
   * `OFFLINE_PROTECTION_MODES` and are retyped nowhere, so this screen, Settings › Kitchen and the
   * dashboard cannot word them differently. A change of SHAPE, not of words. */
  t('🔴 THE OFFLINE ROW IS A SWITCH, and the mode is a sub-row whose labels are IMPORTED', (() => {
    const ctl = ui.slice(ui.indexOf('function TypeControl('))
    const std = ui.slice(ui.indexOf('function OneStandardControl('), ui.indexOf('function TypeControl('))
    return /const OFFLINE_MODE_CHOICES = OFFLINE_PROTECTION_MODES\.map\(m => \(\{ value: m\.value as string, label: m\.label \}\)\)/.test(ui)
      && OFFLINE_MODES_COUNT === 2
      /* the row's control is a Toggle in a type's cell */
      && /if \(row\.kind === 'offline'\) \{[\s\S]{0,1400}<Toggle on=\{shownOffline\}/.test(ctl)
      /* ⛔ and `OneStandardControl` has NO offline branch left — it falls through to the same switch,
       * which is what makes a van column and a type column the same kind of control. */
      && !/if \(row\.kind === 'offline'\)/.test(codeOf(std))
      /* the sub-row exists, is labelled from the copy file, and carries the mode select */
      && /label: OFFLINE_WHEN_OFFLINE_LABEL/.test(ui)
      && NOW.copyService.OFFLINE_WHEN_OFFLINE_LABEL === 'When offline'
      // ⛔ neither mode label is retyped in this file
      && !new RegExp("'Pause Online Ordering'").test(ui)
      && !new RegExp("'Keep taking orders, confirm them yourself'").test(ui)
  })())
  /* 🔴 THE SUB-ROW FOLDS AWAY WHEN PROTECTION IS OFF IN **EVERY** COLUMN, and appears where it is on.
   * Not "when Standard is off" and not "when the first van is off": the row holds the mode for the
   * columns that have one, so one column with protection on is enough to need it. */
  t('🔴 …and the "When offline" row appears per column, and folds away when every column is off', (() => {
    return /const anyOfflineOn = useMemo\(/.test(ui)
      && /\(\) => vanHeaders\.some\(standardOfflineOn\) \|\| types\.some\(typeOfflineOn\)/.test(ui)
      && /if \(row\.id === 'offline_protection' && anyOfflineOn\) \{/.test(ui)
      /* within the row, a column with protection OFF draws a BLANK cell, not a disabled select —
       * a greyed dropdown invites a tap and reads as a value the operator chose */
      && /\{standardOfflineOn\(v\) && \(/.test(ui)
      && /\{typeOfflineOn\(t\) && \(/.test(ui)
  })())
  /* ══ 🔴 THE SWITCH WRITES **ONLY** THE SWITCH, AND THAT IS A SAFETY PROPERTY ══════════════════
   * This asserted the opposite shape — "Off writes BOTH columns, so it is not mistaken for inherit" —
   * which was right for a dropdown whose `'off'` option had to be distinguishable from NULL. With a
   * switch there is nothing to confuse: `false` is explicit.
   * 🔴 AND THE NEW RULE IS STRONGER. Turning protection off and on again must NOT change what it then
   * DOES, so neither direction of the switch touches the mode — it is left stored, which is exactly
   * what Settings does and the reason it matters. `standardWriteFor` has three shapes now; all three
   * are asserted. */
  t('🔴 THE SWITCH NEVER TOUCHES THE MODE — only the "When offline" sub-row writes it', (() => {
    const fn = ui.slice(ui.indexOf("    case 'offline_protection':"), ui.indexOf("    case 'buzzer_prompt':"))
    return fn.length > 200
      && /if \(value === false\) return \{ scope: 'van', action: 'update_van_settings', payload: \{ autoPauseOnOffline: false \} \}/.test(fn)
      && /if \(value === true\) return \{ scope: 'van', action: 'update_van_settings', payload: \{ autoPauseOnOffline: true \} \}/.test(fn)
      && /return \{ scope: 'van', action: 'update_van_settings', payload: \{ autoPauseOnOffline: true, offlineProtectionMode: String\(value\) \} \}/.test(fn)
      /* ⛔ NEITHER BOOLEAN BRANCH MENTIONS THE MODE. */
      && !/value === (true|false)\) return[^\n]*offlineProtectionMode/.test(fn)
      /* and a TYPE's switch writes only its own boolean */
      && /onPatch\(\{ offline_protection: !shownOffline \}\)/.test(ui)
      && !/offline_protection: false, offline_protection_mode: null/.test(codeOf(ui))
  })())
  /* ⛔ THE DELAY IS DELIBERATELY NOT OFFERED ON A TYPE — see the report. Asserted so the omission is a
   * decision on record rather than something overlooked, and so that adding it later is a conscious
   * act that has to change this check. */
  /* ⚠️ THE NOTE MOVED WITH THE DESIGN. It used to sit above `OFFLINE_CHOICES`, which is deleted; it
   * is now above `OFFLINE_MODE_CHOICES`, where the same decision still applies. The assertion follows
   * the words rather than the location, which is what it was always about. */
  t('⛔ the type screen does NOT offer the auto-reject delay, and says why',
    !/OFFLINE_AUTO_REJECT_OPTIONS/.test(ui)
    && /AUTO-REJECT DELAY IS STILL NOT OFFERED ON A TYPE/.test(ui))

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
  /* ══ 🔴 THE FOOTER COUNTS EXACTLY WHAT RESET CLEARS — NOW INCLUDING PRICES ════════════════════
   * The rule is the point, not the list: a count that included something the button could not clear
   * would promise a reset that leaves a THIS EVENT tag behind, and a count that LEFT SOMETHING OUT
   * would under-report while the button over-delivered. `pricesOwn` joined the list in the same build
   * that made `assign` with `clearOwn: true` clear the event's price columns AND its typed rows.
   * 🔴 ASSERTED BOTH WAYS: the flag is in the count, and the route really does clear it. */
  t('🔴 the footer counts exactly what Reset clears, prices included', (() => {
    const fn = card.slice(card.indexOf('const ownFlags ='), card.indexOf('const commitType'))
    return /const ownFlags = \[buzzerPromptOwn, takesCashOwn, orderReadyOwn, collectionOwn, offlineOwn, pricesOwn\]/.test(fn)
      && /deals\.filter\(d => d\.own\)\.length/.test(fn)
      /* and the clear really reaches the prices — the columns AND the rows.
       * ⚠️ READ LOCALLY: the `route` local belongs to an earlier section and is not in scope here. */
      && (() => {
        const r = fs.readFileSync(path.join(REPO, 'app/api/event-types/route.ts'), 'utf8')
        return /patch\.price_own = false/.test(r) && /await deleteEventItemPrices\(eventId\)/.test(r)
      })()
  })())
  /* ══ ✅ RE-AIMED: THERE **IS** A PRICES ROW NOW, AND IT IS FIRST UNDER MENU ════════════════════
   * This asserted the opposite — "THERE IS NO PRICES ROW YET, and the card says why" — and it was
   * right until this build: there was no per-event price mechanism in the database at all. There is
   * one now (`truck_events.price_own` + `event_item_prices`, 20261011), so the row exists and opens
   * the sheet that writes them.
   * 🔴 FIRST UNDER MENU, DELIBERATELY: an operator sets prices once before service and checks stock
   * repeatedly during it, but a wrong price is CHARGED TO A CUSTOMER while a wrong stock figure only
   * pauses a dish.
   * ⚠️ AND THE OLD "no per-event price mechanism" PROSE MUST BE GONE, not left adjacent — §37's rule.
   * It named `event_price_overrides` as non-existent, which is false (it exists, empty, unused). */
  t('✅ THE PRICES ROW IS FIRST UNDER MENU, and opens the sheet', (() => {
    const code = codeOf(card)
    const menu = code.slice(code.indexOf('<SectionHeading>MENU</SectionHeading>'))
    return /<Row label=\{PRICES_ROW_LABEL\}/.test(menu)
      /* FIRST: the Prices row precedes the stock row */
      && menu.indexOf('PRICES_ROW_LABEL') < menu.indexOf('Stock and items sold')
      && /data-open-prices/.test(menu)
      && /hint=\{pricesSummary\} own=\{pricesOwn\}/.test(menu)
      /* ⛔ THE STALE CLAIMS ARE REPLACED, NOT ANNOTATED — §37's rule, and the two sentences that
       * were actually false are the ones named. ⚠️ NOT a ban on the phrase "NO PRICES ROW": the
       * comment that RECORDS the change quotes the old banner in order to explain it, and a check
       * that forbade that would forbid writing down what was corrected. */
      && !/Per-event prices are a LATER/.test(card)
      && !/`event_price_overrides` does not exist/.test(card)
      /* and the correction is on record in this file */
      && /0\s*\n?\s*rows, read by no code path, unused legacy|rows, read by no code path, unused legacy/.test(card)
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
    /* ⚠️ THE CARD'S LABELS ARE CONSTANTS NOW (v3), not literals. They were five retyped short names —
     * 'Buzzers', 'Take cash', '“Mark ready” step', 'Offline protection', 'Collection times' — so the
     * same five settings read one way here, another in the modal and a third in Settings. */
    const inCard = ['collection_interval_mins', 'order_ready', 'takes_cash', 'offline_protection', 'buzzer_prompt']
      .every(id => card.includes(`label={SERVICE_SETTING_LABELS.${id}}`))
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
    /* 🔴 PINNED TO THE MERGE'S FIRST PARENT, NOT `HEAD` (October 2026). `HEAD` was the tree this
     * build started from while event types sat on its own branch; the moment the merge is committed
     * `HEAD` IS the merged tree and this check compares a file with itself and passes for the wrong
     * reason — the floating-baseline trap documented at `BEFORE_REF`. The dashboard page on this
     * branch came from schedule-graphics, so that tip is what "left" is measured against. */
    const base = execFileSync('git', ['show', `${MERGE_PARENT_SG}:app/dashboard/[token]/page.tsx`],
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
      /* ⚠️ AN EDIT, NOT A LOSS — AND IT IS PROVED BELOW, NOT WAIVED. schedule-graphics called
       * `resolvePaidStep(truck,activeEvent)`; event types gave that function an optional third
       * argument, so the two-argument form left and the three-argument form arrived. The companion
       * assertion under this list fails if the replacement is not there, which is what makes this an
       * accounted edit rather than a hole in the guard. */
      /^const \{showPaidStep:effectivePaidStep,takesCash:effectiveTakesCash,completionPresses:effectiveCompletionPresses\}=resolvePaidStep\(truck,activeEvent\)$/,
      /* ⚠️ THE SAME EDIT AGAIN, ONE ARGUMENT LONGER (5 October 2026). `resolvePaidStep` gained a
       * fourth parameter — the VAN's own `takes_cash` — so the three-argument form left and the
       * four-argument form arrived. Accounted, and its replacement is asserted below. */
      /^const \{showPaidStep:effectivePaidStep,takesCash:effectiveTakesCash,completionPresses:effectiveCompletionPresses\}=resolvePaidStep\(truck,activeEvent,eventType\)$/,
      /* ⚠️ AND THE TWO ORDER-CARD MOUNTS, which gained `vanTakesCash={vanTakesCash}` in the middle of
       * a single very long line. The line left and a longer one arrived; both halves are asserted
       * below — the prop must be passed at both mounts. */
      /^<div className="grid grid-cols-1 @md:grid-cols-2 @2xl:grid-cols-3 gap-3">\{(pending|confirmed)Orders\.map/,
    ]
    /* 🔴 THE COMPANION CHECK FOR THE ONE ACCOUNTED EDIT. An entry on that list excuses a lost line
     * only while its replacement exists; without this, deleting the call outright would read as
     * "explained". This is the `movedEdits` pattern scripts/schedule-graphics-places.cjs uses. */
    const nowPage = codeOf(fs.readFileSync(path.join(REPO, 'app/dashboard/[token]/page.tsx'), 'utf8'))
    /* 🔴 FOUR ACCOUNTED EDITS NOW, AND EVERY ONE IS PROVED PRESENT IN ITS NEW FORM. An entry on the
     * ALLOWED list excuses a lost line only while its replacement exists; without this, deleting a
     * call outright would read as "explained". */
    t('⚠️ …and every ACCOUNTED EDIT really is present in its new form', (() => {
      const flat = nowPage.replace(/\s+/g, '')
      return /resolvePaidStep\(truck,activeEvent,eventType,vanTakesCash\)/.test(flat)
        /* the two order-card mounts both pass the van value */
        && (flat.match(/vanTakesCash=\{vanTakesCash\}/g) || []).length >= 3
        /* and the panel does too */
        && /<AddOrderPanel/.test(nowPage)
    })())
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
    /* ⚠️ THE ANCHOR GAINED A LINK (5 October 2026): the chain is `event ?? type ?? VAN ?? truck`
     * now, so the three-link string no longer exists and this variant could not build — reported as
     * "THE ANCHOR IS GONE", which is what that report is for. */
    const p = patch('lib/event-types/resolve.ts',
      'return eventOverride ?? type?.takes_cash ?? vanDefault ?? truckDefault ?? false',
      'return type?.takes_cash ?? eventOverride ?? vanDefault ?? truckDefault ?? false')
    let detected = true
    if (p) {
      const V = buildPatched(p, 'v2')
      /* The truck switched cash OFF for this one event; the type says on. The hand change must win. */
      detected = V.resolve.resolveTakesCashWithType(false, typeWith({ takes_cash: true }), null, false) !== false
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
    /* ⚠️ SAME RE-ANCHOR AS V2, and the `||` bug now has a FOURTH place to bite — a VAN that has
     * explicitly chosen `false` would be read as unset and re-inherit the truck's `true`. */
    const p = patch('lib/event-types/resolve.ts',
      'return eventOverride ?? type?.takes_cash ?? vanDefault ?? truckDefault ?? false',
      'return eventOverride || type?.takes_cash || vanDefault || truckDefault || false')
    let detected = true
    if (p) {
      const V = buildPatched(p, 'v6')
      detected = V.resolve.resolveTakesCashWithType(null, typeWith({ takes_cash: false }), null, true) !== false
        /* and the van's own `false` must survive too */
        || V.resolve.resolveTakesCashWithType(null, null, false, true) !== false
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
    /* V17 — a control goes back into the LABEL column (the defect §1 exists to fix).
     * ⚠️ RE-TARGETED FOR THE THIRD TIME, and each move is recorded because the moves are the point:
     * the anchor tracked `SettingRow`, which is now DELETED (the rows are planned and placed). The
     * mutation site is the label cell's own `<span>{r.label}</span>`, and the predicate is the live
     * check's — no SETTING control in that cell, with the Hide/Show button as the named exception. */
    const labelPredicate = (ui) => {
      const body = ui.slice(ui.indexOf('// ── THE LABEL CELL ─'), ui.indexOf('// ── THE STANDARD SIDE ─'))
      return body.length > 200
        && /\{r\.label\}/.test(body)
        && !/<Toggle|<Select|<TypeControl|<PriceCell|role="switch"|<select/.test(body)
        && (body.match(/<button/g) || []).length === 1
    }
    const uiSrc = fs.readFileSync(path.join(REPO, 'components/manage/EventTypes.tsx'), 'utf8')
    /* ══ 🔴 THE NEEDLE IS **FOUND**, NOT TYPED (5 October 2026) ══════════════════════════════════
     * This mutated the literal "}`} title={r.label}>{r.label}</span>". Labels WRAP now, so the hover
     * title went with `truncate` — there is nothing left to put a tooltip on — and that exact text
     * stopped existing. `String.replace` of an absent needle returns the string UNCHANGED, so the
     * variant mutated nothing, the predicate still held, and it reported "MUST FAIL BUT PASSED".
     * ⛔ THAT IS THE SECOND TIME THIS FAILURE MODE HAS APPEARED IN THIS REPOSITORY — V29 in this file
     * did the same on 5 October when `compact` changed a Toggle's props. The fix is the same one:
     * locate the insertion point in the LIVE source and throw if it is not there, so a variant that
     * stops mutating is a failure rather than a pass.
     * ⚠️ THE SITE IS THE END OF THE LABEL CELL'S OWN `<span>`, found inside the label-cell slice so a
     * `{r.label}</span>` elsewhere in the file cannot be hit by accident. */
    const inLabel = (() => {
      const marker = '// ── THE LABEL CELL ─'
      const from = uiSrc.indexOf(marker)
      const to = uiSrc.indexOf('// ── THE STANDARD SIDE ─')
      if (from < 0 || to < 0) throw new Error('V17 cannot be built: the label-cell markers are gone')
      const body = uiSrc.slice(from, to)
      const at = body.lastIndexOf('{r.label}</span>')
      if (at < 0) throw new Error('V17 cannot be built: no `{r.label}</span>` in the label cell')
      const cut = from + at + '{r.label}</span>'.length
      return uiSrc.slice(0, cut)
        + '\n                          <Toggle on={false} onToggle={() => {}} ariaLabel="oops" />'
        + uiSrc.slice(cut)
    })()
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

    /* V19 — the fixed column width goes back to a shrinking one.
     * ⚠️ RE-TARGETED (v3): the template is built from `GRID_LABEL_W`/`GRID_COL_W` now, so this used to
     * mutate a literal that no longer exists — `replace` found nothing, the mutant equalled the source
     * and the variant WRONGLY PASSED. It was reported as such by the variant tally, which is what that
     * tally is for. */
    /* ⚠️ RE-TARGETED AGAIN (the column model): the template counts `valueColumnCount` now, so the
     * old literal was absent and this variant wrongly passed. */
    /* ⚠️ THE PREDICATE NO LONGER NAMES THE PIXEL VALUES. They have changed twice (230/200 → 200/168)
     * and a variant that pins them fails for the wrong reason every time the design moves. What it
     * guards is that the columns are FIXED at all. */
    const widthPredicate = (ui) =>
      /const GRID_LABEL_W = \d+/.test(ui) && /const GRID_COL_W = \d+/.test(ui)
      && /gridTemplateColumns: `\$\{GRID_LABEL_W\}px repeat\(\$\{valueColumnCount\}, \$\{GRID_COL_W\}px\)`/.test(ui)
    const shrunk = uiSrc.replace('${GRID_LABEL_W}px repeat(${valueColumnCount}, ${GRID_COL_W}px)',
      '${GRID_LABEL_W}px repeat(${valueColumnCount}, minmax(150px, 1fr))')
    must('V19 🔴 the type columns shrink as types are added, which is what misaligned them',
      shrunk !== uiSrc && widthPredicate(uiSrc) && !widthPredicate(shrunk))

    /* ══ 🔴 THE v3 VARIANTS — ONE PER NEW RULE, EACH SHOWN TO FAIL ═══════════════════════════════
     * The brief asks for a broken variant for each of its checks. These mutate the real source in
     * memory and the matching predicate must then go false; nothing is written to disk. */

    /* V20 — "Same as Standard" comes back as a dropdown option.
     * ⚠️ RE-TARGETED: `OFFLINE_CHOICES` is deleted (the offline row is a switch), so the old mutation
     * found nothing and this variant wrongly passed — reported by the tally, which is what it is for.
     * The mode choices are now the list a pseudo-option would be smuggled into. */
    const sasPredicate = (ui) => !/Same as Standard/.test(codeOf(ui))
      && [...codeOf(ui).matchAll(/\{ value: '', label: /g)].length === 0
    const sasBack = uiSrc.replace(
      "const OFFLINE_MODE_CHOICES = OFFLINE_PROTECTION_MODES.map(m => ({ value: m.value as string, label: m.label }))",
      "const OFFLINE_MODE_CHOICES = [{ value: '', label: 'Same as Standard' }, ...OFFLINE_PROTECTION_MODES.map(m => ({ value: m.value as string, label: m.label }))]")
    must('V20 ⛔ a dropdown offers "Same as Standard" again — a cross-reference instead of a setting',
      sasBack !== uiSrc && sasPredicate(uiSrc) && !sasPredicate(sasBack))

    /* V21 — A NEW TYPE GOES BACK TO BEING A BLANK, so every untouched cell inherits again and a
     * Standard edit appears to change every type. The defect Dominic met on localhost ("showed Market
     * changing"), reintroduced at its source.
     * ⚠️ RE-TARGETED: the old form mutated `faded={!explicit}`, which no longer exists — the fade
     * went with the design. The thing that can actually regress is the SEED. */
    const routeSrc = fs.readFileSync(path.join(REPO, 'app/api/event-types/route.ts'), 'utf8')
    const seedPredicate = (src) => {
      const create = src.slice(src.indexOf("if (action === 'create')"), src.indexOf("if (action === 'update')"))
      return /const seed = await vanOneServiceValues\(/.test(create)
        && /cleanValue\(k, seed\[k\]\)/.test(create)
        && !/blankTypeValues\(\)\[k\]/.test(create)
    }
    const blankAgain = routeSrc.replace('cleanValue(k, seed[k])', 'blankTypeValues()[k]')
    must('V21 🔴 a new type is a BLANK again, so every untouched cell inherits and Standard edits leak in',
      blankAgain !== routeSrc && seedPredicate(routeSrc) && !seedPredicate(blankAgain))
    /* V21b — the FADE ITSELF stops being visible, in the shared component. One prop, one place, and
     * if it renders nothing then every inheriting control on the screen looks explicit. */
    /* ⚠️ RE-TARGETED: `Select` MOVED to components/shared/PriceControls.tsx (the dashboard sheet needs
     * the same non-native control, and manage/primitives.tsx's own note forbids the dashboard
     * importing from it). `Toggle` stayed. So "the shared controls" is now TWO files, and the variant
     * mutates both — one `faded ? 'opacity-50'` in each. Dropping either one makes every inheriting
     * control of that kind look explicit. */
    const primSrc = fs.readFileSync(path.join(REPO, 'components/manage/primitives.tsx'), 'utf8')
    const pcSrc = fs.readFileSync(path.join(REPO, 'components/shared/PriceControls.tsx'), 'utf8')
    const fadeCount = (src) => (src.match(/faded \? 'opacity-50' : ''/g) || []).length
    const primNoFade = primSrc.replace(/faded \? 'opacity-50' : ''/g, "faded ? '' : ''")
    const pcNoFade = pcSrc.replace(/faded \? 'opacity-50' : ''/g, "faded ? '' : ''")
    must('V21b 🔴 the shared controls stop rendering `faded`, so inheriting is invisible everywhere',
      primNoFade !== primSrc && pcNoFade !== pcSrc
      && fadeCount(primSrc) === 1 && fadeCount(pcSrc) === 1
      && fadeCount(primNoFade) === 0 && fadeCount(pcNoFade) === 0)

    // V22 — touching a faded switch writes NULL instead of an explicit value
    const explicitPredicate = (ui) => {
      const ctl = ui.slice(ui.indexOf('function TypeControl('))
      return /onToggle=\{\(\) => onPatch\(\{ \[key\]: !shown \}\)\}/.test(ctl)
        && !/onPatch\(\{ \[key\]: null \}\)/.test(ctl)
    }
    /* ⚠️ `onToggle`, NOT `onClick` — the shared <Toggle>'s prop. The old mutation targeted the raw
     * <button> this component used to render. */
    const writesNull = uiSrc.replace('onToggle={() => onPatch({ [key]: !shown })}', 'onToggle={() => onPatch({ [key]: null })}')
    must('V22 🔴 touching a faded switch stores NULL, so the control cannot be given a value at all',
      writesNull !== uiSrc && explicitPredicate(uiSrc) && !explicitPredicate(writesNull))

    /* V23 — Standard writes through a path of its own instead of Settings' action.
     * 🔴 THIS IS THE ONE THAT MATTERS MOST. A second save path is invisible at runtime until it
     * diverges — it would skip `update_van_settings`' validation, its event resets and (after the
     * merge) its "Same as Van 1" fan-out, while looking like a working switch. */
    const onePathPredicate = (ui) =>
      /for \(const vanId of vanIds\) await manageApi\(write\.action, \{ vanId, \.\.\.write\.payload \}\)/.test(ui)
      && !/fetch\('\/api\/manage'/.test(ui)
    const ownFetch = uiSrc.replace('for (const vanId of vanIds) await manageApi(write.action, { vanId, ...write.payload })',
      "for (const vanId of vanIds) await fetch('/api/manage', { method: 'POST', body: JSON.stringify({ token, vanId }) })")
    must('V23 🔴 Standard gets its own fetch to /api/manage — a second save path, with no validation',
      ownFetch !== uiSrc && onePathPredicate(uiSrc) && !onePathPredicate(ownFetch))

    // V24 — a van payload key is renamed to its COLUMN name, which the handler drops silently
    const keyPredicate = (ui) => /payload: \{ autoPauseOnOffline: true, offlineProtectionMode: String\(value\) \}/.test(ui)
    const snake = uiSrc.replace('payload: { autoPauseOnOffline: true, offlineProtectionMode: String(value) }',
      'payload: { auto_pause_on_offline: true, offline_protection_mode: String(value) }')
    must('V24 🔴 the offline keys go snake_case — which update_van_settings DROPS SILENTLY, saving nothing',
      snake !== uiSrc && keyPredicate(uiSrc) && !keyPredicate(snake))

    // V25 — Standard writes one van instead of every van
    const everyVanPredicate = (ui) => /for \(const vanId of vanIds\)/.test(ui)
    const oneVan = uiSrc.replace('for (const vanId of vanIds) await manageApi(write.action, { vanId, ...write.payload })',
      'await manageApi(write.action, { vanId: vanIds[0], ...write.payload })')
    must('V25 🔴 Standard writes only the first van, so a two-van truck silently becomes "Set per van"',
      oneVan !== uiSrc && everyVanPredicate(uiSrc) && !everyVanPredicate(oneVan))

    /* V26 — THE COLUMNS START DEPENDING ON WHETHER THE VANS AGREE, which is the layout jump the
     * column model exists to remove: equalise two vans and every row below moves.
     * ⚠️ RE-TARGETED: `vanColumns` reads the same-settings SWITCH now as well as the van count, so
     * the old one-line anchor no longer existed and this variant wrongly passed. The property that
     * still matters is that it does NOT read `standardIsPerVan` — the shape follows a switch the
     * operator pressed, never the values that happen to be in it. */
    const gatedPredicate = (ui) =>
      /const vanColumns = useMemo\(\s*\n\s*\(\) => \(vans\.length > 1 && !sameSettings \? vans : \[\]\)/.test(ui)
      && !/vanColumns[\s\S]{0,160}standardIsPerVan/.test(ui)
    const ungated = uiSrc.replace(
      '() => (vans.length > 1 && !sameSettings ? vans : []),',
      '() => (vans.length > 1 && standardIsPerVan(SERVICE_ROWS[0], standard!) ? vans : []),')
    must('V26 🔴 the van columns appear only when the vans differ, so the layout jumps on a save',
      ungated !== uiSrc && gatedPredicate(uiSrc) && !gatedPredicate(ungated))
    /* V26b — a van column writes EVERY van instead of its own, so changing one van silently changes
     * them all. The single most damaging thing this feature could get wrong. */
    /* ⚠️ RE-TARGETED: `SettingRow` is deleted and the handler reads `v.van` (the combined column
     * carries `van: null`), so the old anchor matched nothing and this variant wrongly passed. */
    const perVanWrite = (ui) => {
      const svc = ui.slice(ui.indexOf('/* ── A SERVICE row: ONE CELL PER VAN COLUMN'),
        ui.indexOf('// ── THE TYPE COLUMNS ─'))
      return svc.length > 200 && /void saveStandardForVan\(sr, v\.van\.id, value\)/.test(svc)
    }
    const writesAll = uiSrc.replace(
      "onChange={value => (v.van\n"
      + "                              ? void saveStandardForVan(sr, v.van.id, value)\n"
      + "                              : void saveStandard(sr, value))}",
      "onChange={value => void saveStandard(sr, value)}")
    must('V26b 🔴 a van column writes every van, so changing one van changes them all',
      writesAll !== uiSrc && perVanWrite(uiSrc) && !perVanWrite(writesAll))

    /* V26d — the truck-level row goes back to SPANNING the van columns, so the second van's cell is
     * empty and the row reads as "van 2 has no switch". The defect Dominic reported. */
    /* ⚠️ RE-TARGETED: the "no span" claim is now scoped to the SERVICE cells, because the PRICES rows
     * DO span the van columns — correctly, since prices are truck-wide. A file-wide ban would forbid
     * the right thing. The mutation makes the SERVICE cell span instead of emitting one per column. */
    /* ⚠️ RE-TARGETED: the title it checked for is DELETED, and there is no truck-level row left.
     * The regression that can actually happen is the CASH ROW going back to `scope: 'truck'` — which
     * is precisely the defect: every van column's switch would write one `trucks.takes_cash` again. */
    const perColumnPredicate = (ui) => {
      const fn = ui.slice(ui.indexOf('function standardWriteFor('), ui.indexOf('const GRID_LABEL_W'))
      const blocks = codeOf(fn).split(/\n\s{4}(?=case '|default:)/).slice(1)
      const scopes = blocks.map(b => /scope: 'truck'/.test(b) ? 'truck' : /scope: 'van'/.test(b) ? 'van' : 'none')
      return blocks.length >= 5 && !scopes.includes('truck')
    }
    const spanBack = uiSrc.replace(
      "return { scope: 'van', action: 'update_van_settings', payload: { takes_cash: value === true } }",
      "return { scope: 'truck', action: 'update_truck', payload: { takes_cash: value === true } }")
    must('V26d 🔴 cash goes back to being truck-level, so Van 1\u2019s switch moves Van 2\u2019s again',
      spanBack !== uiSrc && perColumnPredicate(uiSrc) && !perColumnPredicate(spanBack))

    /* V26e — "Same settings for all vans" STOPS ASKING before it overwrites.
     * ⚠️ RE-TARGETED: the title this checked for is DELETED along with the truck-level row. The
     * regression worth catching on this row is now the CONFIRM: switching ON copies Van 1's settings
     * over every other van's, so a truck that had configured Van 2 differently loses that work. It
     * must be told first, and ON → OFF must stay instant (it copies nothing). */
    const confirmPredicate = (ui) =>
      /if \(sameSettings\) void saveSameSettings\(false\)\s*\n?\s*else setConfirmSameSettings\(true\)/.test(ui)
      && /data-same-settings-confirm/.test(ui)
    const noConfirm = uiSrc.replace(
      "                                if (sameSettings) void saveSameSettings(false)\n"
      + "                                else setConfirmSameSettings(true)",
      "                                void saveSameSettings(!sameSettings)")
    must('V26e 🔴 the Same settings switch copies Van 1 over every van WITHOUT asking first',
      noConfirm !== uiSrc && confirmPredicate(uiSrc) && !confirmPredicate(noConfirm))
    /* ══ 🔴 THE 4 OCTOBER UI FIXES, EACH WITH A VARIANT ═══════════════════════════════════════════ */

    /* V30 — the column dividers are removed, so five columns of switches read as one row of controls.
     * ⚠️ RE-TARGETED: the dividers are applied per planned cell now, not inside `SettingRow`. The
     * mutation empties the ONE constant every cell carries, which is the regression this guards. */
    const dividerPredicate = (ui) => {
      const divider = (ui.match(/const CELL_DIVIDER = '(.+?)'/) || [])[1]
      const grid = ui.slice(ui.indexOf('data-types-scroller'), ui.indexOf('{types.length === 0 &&'))
      return divider === 'border-l border-slate-100'
        && (grid.match(/\$\{CELL_DIVIDER\}/g) || []).length >= 8
    }
    const noDividers = uiSrc.replace("const CELL_DIVIDER = 'border-l border-slate-100'",
      "const CELL_DIVIDER = ''")
    must('V30 🔴 the column dividers vanish, so a row reads as a line of controls rather than one per column',
      noDividers !== uiSrc && dividerPredicate(uiSrc) && !dividerPredicate(noDividers))

    /* V31 — one of the three retired phrases comes back into the modal. */
    const phrasePredicate = (ui) => {
      const modal = codeOf(ui.slice(0, ui.indexOf('// 2 · THE ADD EVENT PICKER')))
      return ['Varies by van', 'Set per van', 'Same as Standard'].every(x => !modal.includes(x))
    }
    /* ⚠️ RE-TARGETED: `inheritTitle` is deleted with the whole follows-Standard design, so the
     * old mutation site no longer exists. The phrase is injected where one would actually come back —
     * as a label on the Standard column's own header. */
    const phraseBack = uiSrc.replace(
      "          name: vans.length > 1 ? SAME_SETTINGS_ALL_VANS_HEADER : 'Standard',",
      "          name: vans.length > 1 ? 'Varies by van' : 'Standard',")
    must('V31 ⛔ "Varies by van" comes back into the modal, in place of a real value',
      phraseBack !== uiSrc && phrasePredicate(uiSrc) && !phrasePredicate(phraseBack))

    /* V32 — THE PER-VAN CASH READ GOES BACK TO THE TRUCK VALUE, so every van column shows the same
     * number again even though each can now store its own. The display half of the localhost defect.
     * ⚠️ RE-TARGETED: the hover title this checked for is deleted — there is no inheriting cell
     * left to explain. `vanValue` is where a van's own cash now comes from. */
    const vanCashPredicate = (ui) => {
      const fn = ui.slice(ui.indexOf('function vanValue('), ui.indexOf('function standardValue('))
      return fn.length > 100 && /if \(row\.id === 'takes_cash'\) return v\.takes_cash/.test(fn)
    }
    const cashFromTruck = uiSrc.replace(
      "  if (row.id === 'takes_cash') return v.takes_cash",
      "  if (row.id === 'takes_cash') return v.order_ready")
    must('V32 🔴 a van column stops showing its OWN cash setting, so every column reads the same again',
      cashFromTruck !== uiSrc && vanCashPredicate(uiSrc) && !vanCashPredicate(cashFromTruck))
    /* V33 — the dropdown's size moves off the WRAPPER, which is the only place it works. globals.css
     * forces `font-size: inherit !important` on every <select> from 640px up, so a size on the select
     * itself is overridden and the control renders at 16px beside 14px labels — the exact symptom
     * Dominic reported ("every 15 min is much larger than elsewhere"). */
    const wrapperSizePredicate = (prim) =>
      /<span className=\{`relative inline-flex min-w-0 items-stretch text-sm \$\{className\}`\}>/.test(prim)
    /* ⚠️ `Select` MOVED to components/shared/PriceControls.tsx (the dashboard sheet needs the same
     * non-native control). Both of these variants mutate it where it now lives; the regression they
     * describe is unchanged, and so is the measurement behind it. */
    const primSrc3 = fs.readFileSync(path.join(REPO, 'components/shared/PriceControls.tsx'), 'utf8')
    const sizeOffWrapper = primSrc3.replace('relative inline-flex min-w-0 items-stretch text-sm ${className}',
      'relative inline-flex min-w-0 items-stretch ${className}')
    must('V33 🔴 the dropdown size leaves the wrapper, so globals.css forces it back to 16px',
      sizeOffWrapper !== primSrc3 && wrapperSizePredicate(primSrc3) && !wrapperSizePredicate(sizeOffWrapper))

    /* V34 — the chevron loses its absolute positioning and renders INLINE, before the text. */
    const chevronPredicate = (prim) =>
      /className="pointer-events-none absolute right-1\.5 top-1\/2 -translate-y-1\/2 w-3 h-3 text-slate-400"/.test(prim)
      && /appearance-none pr-7/.test(prim)
    const chevronInline = primSrc3.replace('pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400',
      'pointer-events-none w-3 h-3 text-slate-400')
    must('V34 🔴 the dropdown chevron renders inline, before the text instead of right-aligned',
      chevronInline !== primSrc3 && chevronPredicate(primSrc3) && !chevronPredicate(chevronInline))

    /* V26f — the phone picker loses the van columns, so a phone can reach only the types and no
     * per-van value can be changed on one. */
    const pickerPredicate = (ui) =>
      /vanColumns\.map\(v => \(\{ id: `van:\$\{v\.id\}`/.test(ui) && /if \(phoneSel\.startsWith\('van:'\)\)/.test(ui)
    const noVansInPicker = uiSrc.replace('? vanColumns.map(v => ({ id: `van:${v.id}`, name: v.name, vanId: v.id }))',
      '? [{ id: null as string | null, name: \'Standard\', vanId: null as string | null }]')
    must('V26f 🔴 the phone picker drops the van columns, so no per-van value is reachable on a phone',
      noVansInPicker !== uiSrc && pickerPredicate(uiSrc) && !pickerPredicate(noVansInPicker))
    /* V26c — a "Settings" link comes back into the modal, which the addition forbids outright. */
    const noLinkPredicate = (ui) => !/<a href=/.test(codeOf(ui)) && !/tab=settings/.test(codeOf(ui))
    /* ⚠️ `{TYPE_VARIES_BY_VAN}` IS NO LONGER RENDERED AS A TEXT NODE — it is an option's label now —
     * so the old mutation found nothing and this variant wrongly passed. It injects the link where a
     * link would actually be put back: beside a control in the Standard cell. */
    /* ⚠️ RE-AIMED AGAIN at the cell as the planned grid now writes it. */
    const linkBack = uiSrc.replace(
      "                          <OneStandardControl row={sr} editable={canEditStandard}",
      "                          <a href=\"?tab=settings#kitchen\">Settings</a>\n"
      + "                          <OneStandardControl row={sr} editable={canEditStandard}")
    must('V26c ⛔ a "Settings" link reappears in the modal, sending the operator off the screen',
      linkBack !== uiSrc && noLinkPredicate(uiSrc) && !noLinkPredicate(linkBack))

    /* V27 — Match Standard goes back to CLEARING instead of COPYING, so a type that looks reset is
     * really subscribed to Standard again — and a later Standard edit moves it.
     * ⚠️ RE-TARGETED: it sends `match_standard` now and the server computes the copy. */
    const matchPredicate = (ui) =>
      /act\(\{ action: 'match_standard', id \}/.test(ui)
      && !/action: 'update', id, \.\.\.blankTypeValues\(\)/.test(ui)
    const partial = uiSrc.replace("act({ action: 'match_standard', id }", "act({ action: 'update', id, ...blankTypeValues() }")
    must('V27 🔴 Match Standard CLEARS instead of copying, so the type is subscribed to Standard again',
      partial !== uiSrc && matchPredicate(uiSrc) && !matchPredicate(partial))

    /* V28 — a label is retyped instead of imported.
     * 🔴 AGAINST THE COMPILED ARRAY, not the source text: the mutant changes `SERVICE_ROWS` to carry a
     * literal, and the predicate asks whether every label still equals its `SERVICE_SETTING_LABELS`
     * entry. A text-only check would pass a file that imported the module and then ignored it. */
    const typesSrc = fs.readFileSync(path.join(REPO, 'lib/event-types/types.ts'), 'utf8')
    const labelPredicate2 = (src) => !/label: '/.test(codeOf(src))
      && (src.match(/label: SERVICE_SETTING_LABELS\./g) || []).length === 5
    const retyped = typesSrc.replace('label: SERVICE_SETTING_LABELS.buzzer_prompt', "label: 'Buzzers'")
    must('V28 🔴 a row label is retyped — so one setting has two names across three screens',
      retyped !== typesSrc && labelPredicate2(typesSrc) && !labelPredicate2(retyped))

    /* V29 — the modal starts defining a control look of its own again, which is how it came to have
     * the dashboard's orange switch inside a Manage screen.
     * ⚠️ RE-TARGETED: comparing class strings between two files (the first pass) passes a file that
     * COPIES them correctly — and a correct copy still drifts. The honest predicate is "this file
     * defines no control", so the mutation is to make it define one. */
    const modalOf = (src) => codeOf(src.slice(0, src.indexOf('// 2 · THE ADD EVENT PICKER')))
    const housePredicate = (src) => {
      const m = modalOf(src)
      return /import \{ Btn, Toggle, Select, Input \} from '\.\/primitives'/.test(src)
        && !/rounded-full transition-colors/.test(m) && !/translate-x-/.test(m)
        && !/bg-green-500|bg-orange-600/.test(m) && !/<select/.test(m)
    }
    /* ══ 🔴 RE-AIMED, AND THE AIM IS NOW DERIVED (5 October 2026) ══════════════════════════════
     * This replaced a LITERAL call site — `<Toggle on={value === true} disabled={!editable}
     * ariaLabel={label}` — and the grid's switches gained `compact`, so that exact text stopped
     * existing. `src.replace` of an absent needle returns the string UNCHANGED, so the mutation
     * mutated nothing, the predicate still held, and the variant reported "MUST FAIL BUT PASSED".
     * ⛔ THAT IS THE FAILURE MODE A MUTATION SUITE EXISTS TO CATCH, AND IT CAUGHT IT IN ITSELF: a
     * variant that silently stops mutating is a check that silently stops checking.
     * 🔴 SO THE NEEDLE IS FOUND, NOT TYPED: the first `<Toggle` inside the modal, whatever its
     * props. If none is there the variant THROWS rather than passing, because "no Toggle in the
     * modal" is not a state this suite should quietly accept either. */
    const firstToggle = (() => {
      const head = uiSrc.slice(0, uiSrc.indexOf('// 2 · THE ADD EVENT PICKER'))
      const at = head.indexOf('<Toggle')
      if (at < 0) throw new Error('V29 cannot be built: no <Toggle> in the Event types modal')
      return head.slice(at, head.indexOf('\n', at))
    })()
    const drifted = uiSrc.replace(firstToggle,
      '<button className="relative w-11 h-6 rounded-full transition-colors bg-green-500" /> || ' + firstToggle)
    must('V29 🔴 the modal re-styles a switch locally instead of rendering the shared one',
      drifted !== uiSrc && housePredicate(uiSrc) && !housePredicate(drifted))
    /* V29b — the shared switch is un-shared again: page.tsx takes back its own copy. The state the
     * product was in before this build, and the reason the modal's switch was the wrong colour. */
    const sharedPredicate = (page, prim) =>
      /import \{[^}]*\bToggle\b[^}]*\} from '@\/components\/manage\/primitives'/.test(page)
      && !/function Toggle\(/.test(codeOf(page)) && /export function Toggle\(/.test(prim)
    const pageSrc2 = fs.readFileSync(path.join(REPO, 'app/manage/[token]/page.tsx'), 'utf8')
    const primSrc2 = fs.readFileSync(path.join(REPO, 'components/manage/primitives.tsx'), 'utf8')
    const forked = pageSrc2.replace('const FOOD_EMOJI_CATEGORIES = [',
      'function Toggle() { return null }\nconst FOOD_EMOJI_CATEGORIES = [')
    must('V29b 🔴 page.tsx defines its own switch again, so Settings and the modal can diverge',
      forked !== pageSrc2 && sharedPredicate(pageSrc2, primSrc2) && !sharedPredicate(forked, primSrc2))
    /* V29c — the dashboard card goes back to its own switch, the odd one out on its own screen. */
    const cardSrc = fs.readFileSync(path.join(REPO, 'components/dashboard/ThisEventCard.tsx'), 'utf8')
    const cardPredicate = (src) =>
      /import \{ Toggle \} from '@\/components\/dashboard\/OrderCard'/.test(src)
      && !/w-\[42px\]/.test(codeOf(src)) && !/bg-orange-600/.test(codeOf(src))
    const cardForked = cardSrc.replace('  return <Toggle on={on} onToggle={onToggle} disabled={disabled} ariaLabel={label} />',
      '  return <button className="relative w-[42px] h-6 rounded-full bg-orange-600" />')
    must('V29c 🔴 the dashboard card re-styles its switch, orange where the whole screen is green',
      cardForked !== cardSrc && cardPredicate(cardSrc) && !cardPredicate(cardForked))
  }

  console.log(`\n  ${vpass + vfail} variants · ${vpass} failed as required · ${vfail} wrongly passed`)
}

  /* ══ 🔴 "THE USUAL TYPE FOR THIS PLACE" — BY PLACE, THROUGH THE REAL RESOLVER ═══════════════════
   * THE RULE (asked for when the branches were combined): the default type for a new event is the
   * type of the truck's most recent event AT THE SAME PLACE, where "the same place" is
   * `placeForEvent` — so a pitch the operator MERGED counts as one pitch. The normalised venue-name
   * rule is kept, demoted: it is what matches the events that have no place, which is most of them.
   *
   * 🔴 RUN AGAINST A STUB CLIENT AND THE REAL `placeForEvent`. The function is the only one in the
   * event-types module this harness invokes; the rows are handed to it, so there is no database here,
   * and the resolver is the production one rather than a look-alike — which is the whole claim. A
   * re-implemented matcher would make this test agree with itself and with nothing else. */
async function usualTypeSuite() {
    const read = NOW.read, places = NOW.places
    /* ⚠️ THE PREMISE, ASSERTED: both modules compiled and both exports exist. Without this a typo in
     * `LIB_NOW` would make every case below pass by never running. */
    t('🔴 the usual-type rule and the real place resolver are both loaded',
      !!read && typeof read.usualTypeForPlace === 'function'
      && !!places && typeof places.placeForEvent === 'function')

    /* Two places, and the SECOND IS MERGED INTO THE FIRST — the case a name match cannot see. */
    const PLACES = [
      { id: 'p1', name_key: 'the kings arms', merged_into_id: null },
      { id: 'p2', name_key: 'kings arms', merged_into_id: 'p1' },
    ]
    /* Most recent first, which is the order the real select asks for. */
    const EVENTS = [
      { truck_place_id: 'p2', venue_name: 'Kings Arms', event_type_id: 'festival' },
      { truck_place_id: 'p1', venue_name: 'The Kings Arms', event_type_id: 'quiet' },
      { truck_place_id: null, venue_name: 'Village Hall', event_type_id: 'hall' },
    ]
    const stub = (events, placeRows, fail) => ({
      from: (table) => ({
        select: () => ({
          eq: () => ({
            order: () => ({ order: () => ({ limit: async () => fail ? { data: null, error: { code: '42703' } }
              : { data: events, error: null } }) }),
            limit: async () => fail ? { data: null, error: { code: '42703' } }
              : { data: table === 'truck_places' ? placeRows : events, error: null },
          }),
        }),
      }),
    })
    const norm = places.normalisePlaceName
    const run = (placeId, venueName, opts = {}) => read.usualTypeForPlace(
      stub(EVENTS, PLACES, opts.fail), 'truck-1', placeId, venueName, norm, places.placeForEvent)

    /* 🔴 THE CASE THE CHANGE EXISTS FOR: the operator picks "The Kings Arms" (p1). The most recent
     * event there is at p2 — a DIFFERENT row, merged into p1 — and its type is what comes back. A
     * name match would have missed it, because the two rows have different `name_key`s. */
    t('🔴 a MERGED place counts: the newest event at either name supplies the type',
      await (async () => { const r = await run('p1', 'The Kings Arms')
        return r.ok === true && r.typeId === 'festival' && r.by === 'place' })())
    /* ⚠️ AND FROM THE OTHER SIDE: picking the merged row resolves to the same pitch, same answer. */
    t('⚠️ …and picking the merged row gives the same answer, because it resolves to the same pitch',
      await (async () => { const r = await run('p2', 'Kings Arms')
        return r.typeId === 'festival' && r.by === 'place' })())
    /* 🔴 NO PLACE PICKED ⇒ THE NAME RULE, UNCHANGED. This is the fallback the brief kept. */
    t('🔴 with NO place picked it falls back to the normalised venue-name rule',
      await (async () => { const r = await run(null, 'Village Hall')
        return r.ok === true && r.typeId === 'hall' && r.by === 'venue' })())
    /* ⛔ AND A PICKED PLACE DOES NOT FALL THROUGH TO THE NAME. A place with no history is Standard —
     * falling through would let a same-named but different pitch supply a type never used here. */
    t('⛔ a picked place with no history is Standard — it does NOT fall back to the name',
      await (async () => { const r = await read.usualTypeForPlace(
        stub([], PLACES, false), 'truck-1', 'p1', 'Village Hall', norm, places.placeForEvent)
        return r.ok === true && r.typeId === null && r.by === null })())
    /* 🔴 AND IT FAILS OPEN. A missing column answers 42703 for the whole statement; the answer must be
     * "no usual type", which is Standard, which is what every event was before this feature existed. */
    t('🔴 a read failure is Standard, never an error the operator meets',
      await (async () => { const r = await run('p1', 'The Kings Arms', { fail: true })
        return r.ok === false && r.typeId === null })())
    /* ⚠️ AND THE PICKER SENDS THE PICKED PLACE. The rule is server-side, so the client half is that the
     * form's `truck_place_id` reaches it — without that line the server always takes the name path. */
    t('⚠️ the Add event form sends its picked place to the rule', (() => {
      const et = codeOf(fs.readFileSync(path.join(REPO, 'components/manage/EventTypes.tsx'), 'utf8'))
      return /placeId: placeId \?\? null/.test(et)
        && /placeId: string \| null \| undefined/.test(et)
        && /placeId=\{editingEvent\.truck_place_id \?\? null\}/.test(
          codeOf(fs.readFileSync(path.join(REPO, 'app/manage/[token]/page.tsx'), 'utf8')))
    })())
  }


variants()

/* ⚠️ ONE ASYNC SECTION, AND THE SUMMARY WAITS FOR IT. `usualTypeForPlace` is an async function, so
 * its checks cannot run in the synchronous flow above — and a `void (async () => …)()` would have
 * printed the totals before they were counted, which is a harness that reports green early. */
usualTypeSuite().then(() => {
  console.log('')
  if (fail === 0) console.log(`✅ all ${pass} passed`)
  else { console.log(`🔴 ${fail} CHECK(S) FAILED`); process.exitCode = 1 }
})
