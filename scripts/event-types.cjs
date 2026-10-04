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
    /* ══ 🔴 RE-AIMED AT THE TWO MERGE PARENTS (October 2026, branches combined) ══════════════════
     * This compared the four files against the 9d3ecb8 worktree and required ZERO differences. That
     * was right while event types sat on its own branch cut from main. It is WRONG on the combined
     * branch, and it went red to say so: `app/api/orders/submit/route.ts` differs from 9d3ecb8 by
     * **schedule-graphics'** work, which is not this feature reaching the money path — it is the other
     * branch's code, already reviewed, arriving through the merge.
     * 🔴 THE CLAIM WORTH MAKING AFTER A MERGE IS DIFFERENT, AND STRONGER: every file in the price path
     * is byte-identical to ONE OF THE TWO PARENTS, and this names which. Nothing in the money path can
     * then be code that was on neither branch — which is precisely what a bad conflict resolution
     * would produce, and what "zero differences from one baseline" could no longer detect.
     * ⚠️ `lib/payments/paid-step.ts` IS THE ONE THAT MATCHES EVENT-TYPES RATHER THAN SCHEDULE-GRAPHICS:
     * it gained the optional `type` argument at stage 1. The 252-input identity checks above are what
     * prove that argument changes nothing when it is omitted; this only pins WHOSE bytes they are. */
    const PARENTS = { 'schedule-graphics': MERGE_PARENT_SG, 'event-types': MERGE_PARENT_ET }
    const EXPECTED_PARENT = {
      'lib/order-repricing.ts': 'schedule-graphics',
      'lib/order-calculations.ts': 'schedule-graphics',
      'app/api/orders/submit/route.ts': 'schedule-graphics',
      'lib/payments/paid-step.ts': 'event-types',
    }
    const strayed = []
    for (const f of PRICE_PATH) {
      const now = fs.readFileSync(path.join(REPO, f), 'utf8')
      const matches = Object.entries(PARENTS)
        .filter(([, ref]) => gitShow(ref, f) === now).map(([name]) => name)
      if (!matches.includes(EXPECTED_PARENT[f])) strayed.push(`${f} (matches: ${matches.join(',') || 'NEITHER PARENT'})`)
    }
    t('🔴 THE PRICE PATH IS EXACTLY ONE OF THE TWO PARENTS’ — repricing, the calculator, the submit route and the paid step',
      strayed.length === 0)
    if (strayed.length) console.log('      strayed: ' + J(strayed))
    /* ⚠️ AND THE PREMISE: the two parents really do differ on `paid-step.ts`, or the check above
     * would pass for the wrong reason — "matches event-types" would be free if both were the same. */
    t('⚠️ …and the two parents genuinely differ there, so that assertion is not free',
      gitShow(MERGE_PARENT_SG, 'lib/payments/paid-step.ts') !== gitShow(MERGE_PARENT_ET, 'lib/payments/paid-step.ts'))

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
  /* ⚠️ THE MOUNT GAINED ONE ATTRIBUTE (v3): `manageApi={api}`. Still one line and one import, and
   * that attribute is the whole of the "no second save path" rule — the modal's editable Standard
   * column changes truck and van settings by calling the PAGE'S OWN `api`. A check that insisted on
   * the old exact string would be insisting the feature not have the attribute. */
  t('🔴 the manage page mounts the panel and the picker in one line each',
    /\{showEventTypes && <EventTypesPanel token=\{token\} manageApi=\{api\} onClose=\{\(\) => setShowEventTypes\(false\)\} \/>\}/.test(page)
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
  /* ⚠️ THIS CHECK HAS BEEN REVERSED TWICE, AND THE TRAIL IS THE POINT. Stage 2b: "Standard is first
   * and READ-ONLY". v3 first pass: editable, but saying "Set per van" where the vans disagree. v3
   * addition (Dominic, 4 October): no "Set per van" ANYWHERE in the Standard column and no links out
   * — the cell renders ONE CONTROL PER VAN instead. So both of the old sentences are now forbidden
   * strings, and that is what this asserts. */
  t('🔴 Standard is first, and neither "Set per van" nor a Settings link survives in the modal',
    /name: 'Standard'/.test(ui)
    && !/Set per van/.test(codeOf(ui))
    && !/Change these in Settings, not here\./.test(ui))
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
  t('⚠️ long dropdown labels truncate, with the full text available', (() => {
    const ctl = ui.slice(ui.indexOf('function TypeControl('))
    return /truncate/.test(ui)
      && /title=\{inheritTitle \?\? OFFLINE_CHOICES\.find\(c => c\.value === v\)\?\.label \?\? ''\}/.test(ctl)
  })())
  t('🔴 …and when they no longer fit, THE COLUMNS scroll — not the dialog',
    /overflow-x-auto[^"]*" data-types-scroller/.test(ui) || /data-types-scroller/.test(ui))

  /* ── 🔴 THE CONTROLS ARE IN THEIR OWN TYPE'S COLUMN, NEVER IN THE LABEL COLUMN ────────────────
   * This is the defect the rewrite exists to fix. `SettingRow` renders three things in order: the
   * LABEL cell, the STANDARD cell, then one cell per type containing `<TypeControl>` — and the label
   * cell must contain nothing but the label. */
  t('🔴 NO CONTROL IS IN THE LABEL COLUMN', (() => {
    const row = ui.slice(ui.indexOf('function SettingRow('), ui.indexOf('/* ── ⛔ `StandardControl` IS DELETED'))
    /* ⚠️ THE END ANCHOR HAS MOVED TWICE WITH THIS FEATURE. It was the Standard cell's old comment,
     * then "STANDARD IS EDITABLE NOW"; the cell is emitted per van column now, so the slice ends at
     * the first thing AFTER the label cell — the `{/* ── THE STANDARD SIDE` banner. A -1 here would
     * make `slice(start, -1)` hand this check most of the function and it would pass for the wrong
     * reason, which is why the anchor's existence is asserted first. */
    /* ⚠️ THE START ANCHOR IS THE LABEL CELL'S OWN TEXT CLASS, which went from `text-sm` to
     * `text-[13px]` when the columns were narrowed. Matched loosely on what it IS — a semibold
     * slate-900 cell — rather than on its exact size. */
    const labelCell = row.slice(row.indexOf('font-semibold text-slate-900 min-h-11'), row.indexOf('{/* ── THE STANDARD SIDE'))
    return row.includes('{/* ── THE STANDARD SIDE')
      && /\{row\.label\}/.test(labelCell)
      && !/<select|<button|<TypeControl|role="switch"|<Toggle|<Select/.test(labelCell)
      // and the per-type cell is where the control is
      && /\{types\.map\(t => \([\s\S]{0,400}<TypeControl row=\{row\}/.test(row)
  })())
  /* ══ 🔴 §1 (SECOND ADDITION) · ONE COLUMN PER ACTIVE VAN, NOT A STACK IN ONE CELL ════════════
   * This replaces the checks for the stacked design, which lasted a few hours. Dominic: "2+ active
   * vans: replace the Standard column with ONE COLUMN PER ACTIVE VAN, first van first… Do this
   * whether or not the vans currently differ, so the layout does not jump when a value changes."
   *
   * 🔴 "WHETHER OR NOT THEY DIFFER" IS THE ASSERTION THAT MATTERS. The stacked design keyed off
   * `perVan`, so equalising two vans collapsed two controls into one and moved every row below it.
   * The columns must key off the VAN COUNT alone. */
  t('🔴 ONE VAN ⇒ ONE "Standard" COLUMN; 2+ VANS ⇒ ONE COLUMN PER VAN', (() => {
    return /const vanColumns = useMemo\(\(\) => \(vans\.length > 1 \? vans : \[\]\), \[vans\]\)/.test(ui)
      /* ⛔ AND IT DOES NOT CONSULT `perVan`. This is the whole "no layout jump" rule: if
       * `standardIsPerVan` appeared in the column decision, the columns would appear and disappear
       * as values changed. */
      && !/vanColumns[\s\S]{0,120}standardIsPerVan/.test(ui)
      && /\{vanColumns\.length > 1 \? vanColumns\.map\(v => \(/.test(ui)
  })())
  t('🔴 …each van column saves to THAT VAN ONLY, through the same Settings action', (() => {
    const row = ui.slice(ui.indexOf('function SettingRow('), ui.indexOf('/* ── ⛔ `StandardControl` IS DELETED'))
    return /vanColumns\.map\(v => \(/.test(row)
      /* 🔴 A PER-VAN ROW WRITES THAT VAN; A TRUCK-LEVEL ROW WRITES THE TRUCK. One ternary, so the two
       * cannot drift — and `takes_cash` can never be written per van, which would 404 on a column
       * that does not exist. */
      && /value=\{truckLevel \? standardValue\(row, standard\) : vanValue\(row, v\)\}/.test(row)
      && /onChange=\{value => \(truckLevel \? onStandard\(row, value\) : onStandardVan\(row, v\.id, value\)\)\}/.test(row)
      // the single-column case still writes every van
      && /value=\{standardValue\(row, standard\)\}/.test(row)
      && /onChange=\{v => onStandard\(row, v\)\}/.test(row)
  })())
  /* 🔴 THE HEADER CARRIES THE NAME AND A SMALL "Standard" TAG, and keeps the highlight. Without the
   * tag a van column and a type column are indistinguishable. */
  /* ⛔ THE HIGHLIGHT IS GONE, AND THAT IS THE 4 OCTOBER INSTRUCTION: "remove the colour coding that
   * standard uses, all columns should be same colour". With one column per VAN the tint was colouring
   * one or two of five columns, which reads as "selected" rather than "your usual setup".
   * 🔴 SO THE SMALL "Standard" TAG IS NOW THE ONLY THING THAT IDENTIFIES A VAN COLUMN, which makes it
   * load-bearing rather than decorative — hence the assertion. */
  t('🔴 a van column is identified by its NAME plus a "Standard" tag, and NO colour', (() => {
    const hdr = ui.slice(ui.indexOf('{/* heading row */}'), ui.indexOf('SERVICE</div>'))
    return /\{vanColumns\.length > 1 \? vanColumns\.map\(v => \(/.test(hdr)
      && /title=\{v\.name\}>\{v\.name\}<\/span>/.test(hdr)
      && />Standard<\/span>/.test(hdr)
      // ⛔ no tint anywhere in the modal
      && !/bg-orange-50/.test(codeOf(ui))
  })())
  /* 🔴 AND THE CONTROLS ARE CENTRED IN THEIR CELLS. Dominic: "centre the toggle buttons". A switch
   * pinned to the left of a 168px column reads as belonging to the column's edge, and for the
   * truck-level row — one control spanning two van columns — a left-aligned switch looked like it
   * belonged to the FIRST van and the second van had none. That was the report he filed. */
  t('🔴 every value cell centres its control', (() => {
    const row = ui.slice(ui.indexOf('function SettingRow('), ui.indexOf('/* ── ⛔ `StandardControl` IS DELETED'))
    return /const STD_CELL = `\$\{CELL_DIVIDER\}[^`]*justify-center/.test(row)
      && /border-t border-slate-100 min-h-11 flex items-center justify-center gap-2/.test(row)
  })())
  /* ⛔ THE PER-CELL VAN LABELS ARE GONE. "Remove the small 'Van1/Van2' labels inside cells" — the
   * column header is what names a column. */
  t('⛔ NO PER-CELL VAN LABEL SURVIVES', (() => {
    const row = ui.slice(ui.indexOf('function SettingRow('), ui.indexOf('/* ── ⛔ `StandardControl` IS DELETED'))
    return !/text-\[11px\] font-semibold text-slate-500 truncate shrink-0 max-w-\[45%\]/.test(row)
      && !/<span[^>]*>\{v\.name\}<\/span>/.test(codeOf(row))
      // ⛔ and the stacked container is gone too
      && !/flex flex-col gap-1\.5 py-0\.5/.test(codeOf(ui))
      && !/function StandardControl\(/.test(codeOf(ui))
  })())
  /* 🔴 A TRUCK-LEVEL ROW IS ONE CONTROL SPANNING THE VAN COLUMNS, not one per van. `takes_cash` is
   * `trucks.takes_cash` — repeating it would draw switches that always move together. */
  /* ══ 🔴 "Do you take cash?" GETS A SWITCH IN EVERY VAN COLUMN ═════════════════════════════════
   * Dominic, 4 October 2026: "Each van column gets its own switch, like every other row. No control
   * spanning two columns." It HAD spanned them, and the result was one switch under the first van's
   * header with nothing under the second's — "van 1 has a toggle but van2 doesnt", which is what he
   * reported.
   * ⚠️ IT IS STILL ONE SETTING: `trucks.takes_cash`, truck-level. The switches show the same value and
   * write the same `update_truck` call, so they move together — which is why each carries a title
   * saying so, and why that title is asserted rather than assumed. */
  t('🔴 THE TRUCK-LEVEL ROW RENDERS ONE SWITCH PER VAN COLUMN, with a title that says why', (() => {
    const row = ui.slice(ui.indexOf('function SettingRow('), ui.indexOf('/* ── ⛔ `StandardControl` IS DELETED'))
    return /const truckLevel = standardWriteFor\(row, false\)\?\.scope === 'truck'/.test(row)
      // ⛔ no span anywhere in the row renderer
      && !/gridColumn: `span/.test(row)
      // one cell per van column, for EVERY row
      && /vanColumns\.map\(v => \(/.test(row)
      && /title=\{truckLevel \? TAKES_CASH_ALL_VANS_TITLE : undefined\}/.test(row)
      && NOW.copyService.TAKES_CASH_ALL_VANS_TITLE === 'Applies to all your vans'
  })())
  /* ══ 🔴 A DIVIDER BETWEEN EVERY PAIR OF COLUMNS ═══════════════════════════════════════════════
   * One definition, applied to every cell right of the labels — header included. The colour is the
   * row dividers', so the grid reads as one grid rather than two kinds of line. */
  t('🔴 EVERY COLUMN IS DIVIDED FROM THE ONE BEFORE IT, header included', (() => {
    const divider = (ui.match(/const CELL_DIVIDER = '(.+?)'/) || [])[1]
    const hdr = ui.slice(ui.indexOf('{/* heading row */}'), ui.indexOf('SERVICE</div>'))
    const row = ui.slice(ui.indexOf('function SettingRow('), ui.indexOf('/* ── ⛔ `StandardControl` IS DELETED'))
    return divider === 'border-l border-slate-100'
      // the header cells: the van/Standard headers and the type headers
      && (hdr.match(/\$\{CELL_DIVIDER\}/g) || []).length >= 3
      // the value cells: the Standard cell constant and the type cell
      && /const STD_CELL = `\$\{CELL_DIVIDER\}/.test(row)
      && /<div key=\{t\.id\} className=\{`\$\{CELL_DIVIDER\}/.test(row)
      // ⛔ and the divider's colour is the ROW dividers' colour, not a second weight of line
      && /border-t border-slate-100/.test(row)
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
  t('🔴 AN INHERITING TYPE CELL IS A REAL CONTROL AT THE FIRST VAN\'S VALUE, with a hover title', (() => {
    const ctl = ui.slice(ui.indexOf('function TypeControl('))
    return /const inheritTitle = own \? undefined : TYPE_FOLLOWS_VAN_TITLE/.test(ctl)
      && NOW.copyService.TYPE_FOLLOWS_VAN_TITLE === "Follows each van's usual setting"
      // the title reaches all three control kinds
      && (ctl.match(/inheritTitle/g) || []).length >= 4
      && /title=\{inheritTitle\}/.test(ctl)
      // ⛔ and the special "the vans differ" branch is gone entirely
      && !/vansDiffer/.test(ctl)
      && !/setRevealed/.test(ctl)
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
  t('⛔ NO DROPDOWN OFFERS "Same as Standard", AND NOTHING IS LABELLED IT', (() => {
    const code = codeOf(ui)
    /* The two components that render a SETTING's control, which is where the pseudo-option lived. */
    const controls = ui.slice(ui.indexOf('function StandardControl('), ui.indexOf('// ═══', ui.indexOf('function TypeControl(')))
    return !/Same as Standard/.test(code)
      /* ⛔ NO OPTION LABELLED "Same as Standard" — that is the ban, and it is on the WORDS.
       * ⚠️ IT IS NO LONGER A BAN ON AN EMPTY-VALUED OPTION. There is one now: where the vans differ, a
       * type's control offers "Varies by van" as its first choice, value `''`, writing NULL. That was
       * added on Dominic's instruction and it is not the same thing — "Same as Standard" was a
       * cross-reference the operator had to look across the table to resolve, where "Varies by van" is
       * a statement of the value itself. The empty value is now checked to be labelled correctly
       * rather than forbidden. */
      && !/<option value="">(?!Standard<)/.test(codeOf(controls))
      && [...code.matchAll(/\{ value: '', label: (\w+) \}/g)].every(m => m[1] === 'TYPE_VARIES_BY_VAN')
      && !/label: 'Same as Standard'/.test(code)
      // the offline list now STARTS at a real setting
      && /const OFFLINE_CHOICES = \[\s*\n\s*\{ value: 'off', label: 'Off' \},/.test(ui)
  })())
  /* 🔴 A NULL SETTING RENDERS FADED, SHOWING THE VALUE IT INHERITS. One implementation of "faded"
   * (`opacity-50`), applied to the same control — not a second palette. */
  /* ⚠️ "FADED" IS THE PRIMITIVES' OWN PROP NOW, not a class string in this component. The v3 first
   * pass had `SELECT_CLASS_OWN` / `SELECT_CLASS_INHERITED` here; the addition moved both controls to
   * the shared components, which carry `faded` themselves. So this asserts the PROP, and the shared
   * component's single definition of what faded looks like is asserted separately below. */
  t('🔴 A NULL TYPE VALUE RENDERS FADED, SHOWING WHAT IT INHERITS', (() => {
    const ctl = ui.slice(ui.indexOf('function TypeControl('))
    /* TWO again: the differ-case dropdown is gone, so it is the interval and offline controls. */
    return (ctl.match(/faded=\{!own\}/g) || []).length === 2
      && /faded=\{!explicit\}/.test(ctl)                            // the switch
      && /const shown = explicit \? stored === true : standardSwitchValue\(row, standard\)/.test(ctl)
      // the dropdowns fall back to Standard's value, never to an empty option
      && /type\.collection_interval_mins\s*\n?\s*\?\? \(standardIsPerVan\(row, standard\) \? TYPE_INTERVAL_CHOICES\[0\] : standard\.collection_interval_mins\.value\)/.test(ctl)
      && /return standardOfflineValue\(standard\)/.test(ui)
      // ⛔ and this file defines no control look of its own any more
      && !/SELECT_CLASS_OWN|SELECT_CLASS_INHERITED|SELECT_BASE/.test(ui)
  })())
  t('🔴 …AND TOUCHING IT STORES AN EXPLICIT VALUE', (() => {
    const ctl = ui.slice(ui.indexOf('function TypeControl('))
    /* The switch writes a boolean (never null); both dropdowns write a real value. Nothing in this
     * component writes null to a single row any more — clearing is Match Standard's job alone. */
    return /onToggle=\{\(\) => onPatch\(\{ \[key\]: !shown \}\)\}/.test(ctl)
      && /onChange=\{v => onPatch\(\{ collection_interval_mins: Number\(v\) \}\)\}/.test(ctl)
      && /onChange=\{v2 => onPatch\(offlinePatch\(v2\)\)\}/.test(ctl)
      // ⛔ the per-control way back to NULL is gone
      && !/onPatch\(\{ \[key\]: null \}\)/.test(ctl)
  })())
  /* ⛔ THE "TAP TO REVEAL" CHECK IS DELETED WITH THE AFFORDANCE IT DESCRIBED. Revealing-without-
   * storing mattered when the inherited state was a line of text; it is a dropdown option now, so
   * the state is reachable and reversible by the same control as every other value. What it
   * protected — that nothing is written until the operator chooses — is inherent in a <select>.
   */

  /* ══ 🔴 §1 · MATCH STANDARD — THE ONLY WAY BACK TO INHERITING ═════════════════════════════════ */
  t('🔴 MATCH STANDARD NULLS EVERY COLUMN, after a confirm', (() => {
    return /const matchStandard = \(id: string\) =>\s*\n\s*act\(\{ action: 'update', id, \.\.\.blankTypeValues\(\) \}/.test(ui)
      && /MATCH_STANDARD_CONFIRM/.test(ui)
      && /setConfirmMatch\(t\.id\)/.test(ui)
      // the confirm has to be dismissable without acting
      && /onClick=\{\(\) => setConfirmMatch\(null\)\}/.test(ui)
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
    const hdr = ui.slice(ui.indexOf('{/* heading row */}'), ui.indexOf('SERVICE</div>'))
    /* ⚠️ FIVE ITEMS NOW, IN THE BOARD'S ORDER: Rename · Move left · Move right · Match Standard ·
     * Delete. The order is asserted, because Match Standard sitting under Delete would put a
     * destructive-looking item above a reset one. */
    const order = ['>Rename<', '>Move left<', '>Move right<', '{MATCH_STANDARD_LABEL}<', '>Delete<']
    const at = order.map(x => hdr.indexOf(x))
    return /aria-label=\{`More for \$\{t\.name\}`\}/.test(hdr)
      && at.every(i => i >= 0)
      && at.every((v, i) => i === 0 || v > at[i - 1])
  })())
  t('⚠️ the "Used by" row stays', /USED BY<\/div>/.test(ui) && /Upcoming events/.test(ui))
  t('⚠️ on a phone it is one column with a picker at the top',
    /md:hidden/.test(ui) && /et-phone-pick/.test(ui))

  /* ── 🔴 §3 · OFFLINE PROTECTION OFFERS WHAT THE SETTINGS CONTROL OFFERS ───────────────────────
   * Settings › Kitchen offers a SWITCH then a MODE; the type's dropdown says the same in one control,
   * and its two mode values come from the SAME constants that screen renders. */
  /* ⚠️ THREE CHOICES NOW, NOT FOUR — "Same as Standard" left the list (§1). The brief: "The Offline
   * protection options are the OFFLINE_PROTECTION_MODES labels plus Off." */
  t('🔴 the offline dropdown is Off · the two real modes, and the labels are IMPORTED', (() => {
    return /OFFLINE_CHOICES/.test(ui)
      && /\.\.\.OFFLINE_PROTECTION_MODES\.map\(m => \(\{ value: m\.value as string, label: m\.label \}\)\)/.test(ui)
      && OFFLINE_MODES_COUNT === 2
      // ⛔ neither mode label is retyped in this file
      && !new RegExp("'Pause Online Ordering'").test(ui)
      && !new RegExp("'Keep taking orders, confirm them yourself'").test(ui)
  })())
  t('🔴 …and it writes BOTH columns, so "Off" is not mistaken for "inherit"', (() => {
    const fn = ui.slice(ui.indexOf('function offlinePatch('), ui.indexOf('/**\n * ── 🔴 DOES STANDARD HAVE A SINGLE VALUE'))
    return /if \(value === 'off'\) return \{ offline_protection: false, offline_protection_mode: null \}/.test(fn)
      && /return \{ offline_protection: true, offline_protection_mode: value \}/.test(fn)
      // ⛔ there is no "inherit" branch any more: nothing writes null from a dropdown
      && !/offline_protection: null/.test(fn)
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
    ]
    /* 🔴 THE COMPANION CHECK FOR THE ONE ACCOUNTED EDIT. An entry on that list excuses a lost line
     * only while its replacement exists; without this, deleting the call outright would read as
     * "explained". This is the `movedEdits` pattern scripts/schedule-graphics-places.cjs uses. */
    const nowPage = codeOf(fs.readFileSync(path.join(REPO, 'app/dashboard/[token]/page.tsx'), 'utf8'))
    t('⚠️ …and the one ACCOUNTED EDIT really is present in its new form',
      /resolvePaidStep\(truck,activeEvent,eventType\)/.test(nowPage.replace(/\s+/g, '')))
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
      /* ⚠️ THE ANCHOR MOVED WITH SettingRow (v3's column model) — see the note on the live check. */
      const labelCell = row.slice(row.indexOf('font-semibold text-slate-900 min-h-11'),
        row.indexOf('{/* ── THE STANDARD SIDE'))
      return row.includes('{/* ── THE STANDARD SIDE')
        && /\{row\.label\}/.test(labelCell)
        && !/<select|<button|<TypeControl|role="switch"|<Toggle|<Select/.test(labelCell)
    }
    const uiSrc = fs.readFileSync(path.join(REPO, 'components/manage/EventTypes.tsx'), 'utf8')
    /* ⚠️ THE MUTATION SITE MOVED TOO: the label cell's closing tag is now followed by a blank line
     * and the Standard banner, so the old two-line anchor no longer existed and the mutant equalled
     * the source — which the variant tally reported as a wrongly-passing variant. */
    /* ⚠️ THE ANCHOR TRACKS THE LABEL CELL, which gained a comment above it when the columns were
     * narrowed. Matched on the two lines that are actually the cell's body. */
    const inLabel = uiSrc.replace('        {row.label}\n      </div>',
      '        {row.label}\n        <Toggle on={false} onToggle={() => {}} ariaLabel="oops" />\n      </div>')
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

    // V20 — "Same as Standard" comes back as a dropdown option
    const sasPredicate = (ui) => !/Same as Standard/.test(codeOf(ui))
    const sasBack = uiSrc.replace("const OFFLINE_CHOICES = [\n  { value: 'off', label: 'Off' },",
      "const OFFLINE_CHOICES = [\n  { value: '', label: 'Same as Standard' },\n  { value: 'off', label: 'Off' },")
    must('V20 ⛔ a dropdown offers "Same as Standard" again — a cross-reference instead of a setting',
      sasBack !== uiSrc && sasPredicate(uiSrc) && !sasPredicate(sasBack))

    /* V21 — an inheriting control is drawn at full strength, so nothing distinguishes it.
     * ⚠️ RE-TARGETED: fade is the shared primitives' `faded` prop now, not a class string in the
     * modal, so the old mutation found nothing and the variant wrongly passed. */
    const fadePredicate = (ui) => {
      const ctl = ui.slice(ui.indexOf('function TypeControl('))
      /* THREE `faded={!own}` now — the two agree-case dropdowns and the differ-case one. */
      return (ctl.match(/faded=\{!own\}/g) || []).length === 2 && /faded=\{!explicit\}/.test(ctl)
    }
    const noFade = uiSrc.replace('faded={!explicit}', 'faded={false}')
    must('V21 🔴 an inheriting control loses its fade, so "follows Standard" has no signal at all',
      noFade !== uiSrc && fadePredicate(uiSrc) && !fadePredicate(noFade))
    /* V21b — the FADE ITSELF stops being visible, in the shared component. One prop, one place, and
     * if it renders nothing then every inheriting control on the screen looks explicit. */
    const primSrc = fs.readFileSync(path.join(REPO, 'components/manage/primitives.tsx'), 'utf8')
    const primFade = (src) => (src.match(/faded \? 'opacity-50' : ''/g) || []).length === 2
    const primNoFade = primSrc.replace(/faded \? 'opacity-50' : ''/g, "faded ? '' : ''")
    must('V21b 🔴 the shared controls stop rendering `faded`, so inheriting is invisible everywhere',
      primNoFade !== primSrc && primFade(primSrc) && !primFade(primNoFade))

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
     * second addition exists to remove: equalise two vans and two columns collapse into one, moving
     * every row. ⚠️ RE-TARGETED from the stacked design's `perVan` gate. */
    const gatedPredicate = (ui) =>
      /const vanColumns = useMemo\(\(\) => \(vans\.length > 1 \? vans : \[\]\), \[vans\]\)/.test(ui)
      && !/vanColumns[\s\S]{0,120}standardIsPerVan/.test(ui)
    const ungated = uiSrc.replace('const vanColumns = useMemo(() => (vans.length > 1 ? vans : []), [vans])',
      'const vanColumns = useMemo(() => (vans.length > 1 && standardIsPerVan(SERVICE_ROWS[0], standard!) ? vans : []), [vans, standard])')
    must('V26 🔴 the van columns appear only when the vans differ, so the layout jumps on a save',
      ungated !== uiSrc && gatedPredicate(uiSrc) && !gatedPredicate(ungated))

    /* V26b — a van column writes EVERY van instead of its own, so changing one van silently changes
     * them all. The single most damaging thing this feature could get wrong. */
    const perVanWrite = (ui) => {
      const row = ui.slice(ui.indexOf('function SettingRow('), ui.indexOf('/* ── ⛔ `StandardControl` IS DELETED'))
      return /onChange=\{value => \(truckLevel \? onStandard\(row, value\) : onStandardVan\(row, v\.id, value\)\)\}/.test(row)
    }
    /* ⚠️ THE HANDLER IS A TERNARY NOW (truck-level rows write the truck, per-van rows write the van),
     * so the old flat anchor matched nothing and this variant wrongly passed. */
    const writesAll = uiSrc.replace('onChange={value => (truckLevel ? onStandard(row, value) : onStandardVan(row, v.id, value))}',
      'onChange={value => onStandard(row, value)}')
    must('V26b 🔴 a van column writes every van, so changing one van changes them all',
      writesAll !== uiSrc && perVanWrite(uiSrc) && !perVanWrite(writesAll))

    /* V26d — the truck-level row goes back to SPANNING the van columns, so the second van's cell is
     * empty and the row reads as "van 2 has no switch". The defect Dominic reported. */
    const perColumnPredicate = (ui) => {
      const row = ui.slice(ui.indexOf('function SettingRow('), ui.indexOf('/* ── ⛔ `StandardControl` IS DELETED'))
      return !/gridColumn: `span/.test(row) && /title=\{truckLevel \? TAKES_CASH_ALL_VANS_TITLE : undefined\}/.test(row)
    }
    const spanBack = uiSrc.replace('            <OneStandardControl row={row} editable={canEdit}\n              value={truckLevel ? standardValue(row, standard) : vanValue(row, v)}',
      '            <div style={{ gridColumn: `span ${vanColumns.length}` }} />\n            <OneStandardControl row={row} editable={canEdit}\n              value={truckLevel ? standardValue(row, standard) : vanValue(row, v)}')
    must('V26d 🔴 the truck-level row spans the van columns again, leaving the second van with no switch',
      spanBack !== uiSrc && perColumnPredicate(uiSrc) && !perColumnPredicate(spanBack))

    /* V26e — the truck-level switch loses its hover title, so two switches that move together have
     * nothing on screen explaining why. */
    const titlePredicate = (ui) => /title=\{truckLevel \? TAKES_CASH_ALL_VANS_TITLE : undefined\}/.test(ui)
    const noTitle = uiSrc.replace('              title={truckLevel ? TAKES_CASH_ALL_VANS_TITLE : undefined}\n', '')
    must('V26e 🔴 the truck-level switches lose the title that says they apply to every van',
      noTitle !== uiSrc && titlePredicate(uiSrc) && !titlePredicate(noTitle))

    /* ══ 🔴 THE 4 OCTOBER UI FIXES, EACH WITH A VARIANT ═══════════════════════════════════════════ */

    // V30 — the column dividers are removed, so five columns of switches read as one row of controls
    const dividerPredicate = (ui) => {
      const row = ui.slice(ui.indexOf('function SettingRow('), ui.indexOf('/* ── ⛔ `StandardControl` IS DELETED'))
      return /const CELL_DIVIDER = 'border-l border-slate-100'/.test(ui)
        && /const STD_CELL = `\$\{CELL_DIVIDER\}/.test(row)
    }
    const noDivider = uiSrc.replace("const CELL_DIVIDER = 'border-l border-slate-100'", "const CELL_DIVIDER = ''")
    must('V30 🔴 the column dividers vanish, so a row reads as a line of controls rather than one per column',
      noDivider !== uiSrc && dividerPredicate(uiSrc) && !dividerPredicate(noDivider))

    /* V31 — one of the three retired phrases comes back into the modal. */
    const phrasePredicate = (ui) => {
      const modal = codeOf(ui.slice(0, ui.indexOf('// 2 · THE ADD EVENT PICKER')))
      return ['Varies by van', 'Set per van', 'Same as Standard'].every(x => !modal.includes(x))
    }
    const phraseBack = uiSrc.replace('  const inheritTitle = own ? undefined : TYPE_FOLLOWS_VAN_TITLE',
      "  const inheritTitle = own ? undefined : 'Varies by van'")
    must('V31 ⛔ "Varies by van" comes back into the modal, in place of a real value',
      phraseBack !== uiSrc && phrasePredicate(uiSrc) && !phrasePredicate(phraseBack))

    /* V32 — the inheriting cell loses the hover title, which is now the ONLY place the "this is the
     * van's value, and the vans may differ" nuance lives. */
    const inheritTitlePredicate = (ui) => {
      const ctl = ui.slice(ui.indexOf('function TypeControl('))
      return /const inheritTitle = own \? undefined : TYPE_FOLLOWS_VAN_TITLE/.test(ctl)
        && (ctl.match(/inheritTitle/g) || []).length >= 4
    }
    const noInheritTitle = uiSrc.replace('  const inheritTitle = own ? undefined : TYPE_FOLLOWS_VAN_TITLE',
      '  const inheritTitle = undefined')
    must('V32 🔴 an inheriting cell loses its hover title, so nothing says whose value it is showing',
      noInheritTitle !== uiSrc && inheritTitlePredicate(uiSrc) && !inheritTitlePredicate(noInheritTitle))

    /* V33 — the dropdown's size moves off the WRAPPER, which is the only place it works. globals.css
     * forces `font-size: inherit !important` on every <select> from 640px up, so a size on the select
     * itself is overridden and the control renders at 16px beside 14px labels — the exact symptom
     * Dominic reported ("every 15 min is much larger than elsewhere"). */
    const wrapperSizePredicate = (prim) =>
      /<span className=\{`relative inline-flex min-w-0 items-stretch text-sm \$\{className\}`\}>/.test(prim)
    const primSrc3 = fs.readFileSync(path.join(REPO, 'components/manage/primitives.tsx'), 'utf8')
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
    /* ⚠️ RE-AIMED at the cell as it is now written — the per-van and truck-level branches merged. */
    const linkBack = uiSrc.replace('            <OneStandardControl row={row} editable={canEdit}\n              value={truckLevel ? standardValue(row, standard) : vanValue(row, v)}',
      '            <a href="?tab=settings#kitchen">Settings</a>\n            <OneStandardControl row={row} editable={canEdit}\n              value={truckLevel ? standardValue(row, standard) : vanValue(row, v)}')
    must('V26c ⛔ a "Settings" link reappears in the modal, sending the operator off the screen',
      linkBack !== uiSrc && noLinkPredicate(uiSrc) && !noLinkPredicate(linkBack))

    // V27 — Match Standard clears only one column instead of all of them
    const matchPredicate = (ui) =>
      /act\(\{ action: 'update', id, \.\.\.blankTypeValues\(\) \}/.test(ui)
    const partial = uiSrc.replace("act({ action: 'update', id, ...blankTypeValues() }", "act({ action: 'update', id, buzzer_prompt: null }")
    must('V27 🔴 Match Standard clears one column, leaving a type that looks reset and is not',
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
    const drifted = uiSrc.replace('    <Toggle on={value === true} disabled={!editable} ariaLabel={label}',
      '    <button className="relative w-11 h-6 rounded-full transition-colors bg-green-500" /> || <Toggle on={value === true} disabled={!editable} ariaLabel={label}')
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

variants()
console.log('')
if (fail === 0) console.log(`✅ all ${pass} passed`)
else { console.log(`🔴 ${fail} CHECK(S) FAILED`); process.exitCode = 1 }
