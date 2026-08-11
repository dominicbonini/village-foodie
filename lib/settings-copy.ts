// lib/settings-copy.ts
// ONE definition of the label and help text for every setting that appears on BOTH Manage → Settings
// and the setup wizard's end-of-wizard review screen.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────────────────────────────
// 🔴 THE REVIEW SCREEN WAS BUILT WITH ITS OWN HAND-WRITTEN COPY, AND THAT COPY WENT WRONG WITHIN DAYS.
// Its auto-accept row said "Off by default, so every order waits for you." — true when written, and
// false the moment provisioning started writing `auto_accept: true`. Nothing connected the two, so
// nothing could have caught it; it was found by reading the screen. The row beside it described a
// setting's default state at all, which the toggle already shows.
// Two hand-maintained copies of one sentence is the whole problem. One constant, two readers, is the
// only arrangement in which they cannot disagree.
//
// 🔴 SETTINGS IS THE SOURCE. Every string below is what the Manage → Settings control already said —
// lifted, not rewritten — so the operator meets the same words in the wizard that they will find again
// when they go looking for the setting later. Do not "improve" one of these for one surface; it will
// change both, which is the point.
//
// ⚠️ DELIBERATELY NO DEFAULT-STATE PHRASING ANYWHERE IN HERE ("on by default", "off unless you turn it
// on"). A default is a fact about the database on the day it was written, not about the setting, and
// the control next to the text already shows the live value. Every one of those phrases that existed
// was either already wrong or one provisioning change away from it.

export interface SettingCopy {
  /** The control's name, exactly as Manage → Settings renders it. */
  label: string
  /** The explanatory line beneath it. Empty where Settings has none. */
  help: string
}

// ── T2: THE TRIAL REASSURANCE ────────────────────────────────────────────────────────────────────────
// 🔴 THIS SENTENCE DESCRIBES A MECHANISM THAT DOES NOT EXIST YET. READ THIS BEFORE TRUSTING IT.
// As of 4 August 2026 there is NO trial nomination anywhere in the product: no UI, no route, and
// nothing in application code writes `trucks.trial_expires_at` except lib/provision-truck.ts setting it
// to null. So "you choose which event starts it, later" is a promise about a build that has not
// happened, and nothing downgrades anyone at the end of one either.
// ⚠️ UPDATED 4 August (Y1): this used to add "a self-serve operator is provisioned on plan 'demo',
// whose feature set never expires". They are now provisioned on plan 'trial' with a NULL expiry, which
// canAccess reads as NOT STARTED and grants the same feature set. The ACCESS is unchanged; only the
// plan value and its meaning are. The promise above is still ahead of the build.
//
// It is shipped knowingly, and the reasoning is that the failure mode is one-directional: the worst
// outcome of this copy being ahead of the build is that an operator is NOT charged when they might have
// expected to be. The opposite — saying nothing, and an operator assuming their trial started the
// moment they added a date — would have them husbanding a clock that is not running.
//
// ⚠️ DO NOT read this as documentation of working behaviour, and do not write code against it. When
// nomination ships, the nomination screen should render THIS constant so the two say the same thing.
export const TRIAL_NOT_STARTED_BY_EVENTS =
  "Adding events doesn't start your free trial — you choose which event starts it, later."

// Y3 — the Billing tab's not-started state. Beside TRIAL_NOT_STARTED_BY_EVENTS because trial copy has
// ONE home: these three sentences describe the same state to the same operator on two screens, and the
// wizard's version going stale while Billing's did not is exactly the drift this file exists to stop.
//
// 🔴 THESE RENDER ONLY WHEN `trial_expires_at` IS NULL. A truck with a real date keeps the existing
// dated copy untouched — Pizzeria Gusto and Real Thai Food read that, and it is not to be edited here.
// ⚠️ "every Max feature" is TRUE and is not marketing: PLAN_FEATURES.trial is `[...MAX_FEATURES]`, and
// canAccess now grants that whole set on a NULL expiry. If the expired branch is ever changed to fall
// back to Starter, re-read this sentence — it would still be true, but its neighbour would not be.
export const TRIAL_NOT_STARTED_HEADING = 'Your free trial has not started yet'
export const TRIAL_NOT_STARTED_BILLING =
  'You have every Max feature while you set up. You choose which event starts your free trial - '
  + 'until then, nothing is counting down.'

// ── 🔴 CONNECTING STRIPE IS NOT A PURCHASE. NEW 10 August 2026, AND IT IS NEW FOR A REASON. ─────────
// The Payments tab asks a truck to connect Stripe, which LOOKS like a commercial commitment — bank
// details, ID, a named provider — and is not. A truck on trial must be told so BEFORE they connect.
//
// ⚠️ NO EXISTING CONSTANT COULD BE REUSED, AND THAT WAS CHECKED RATHER THAN ASSUMED. The three trial
// strings beside this one all render ONLY when `trial_expires_at IS NULL` (the not-started state), and
// TRIAL_NOT_STARTED_BILLING's "nothing is counting down" is FALSE for a truck whose trial has started —
// which is Pizzeria Gusto today (plan 'trial', expiry 17 Oct 2026). Shipping it to them would be a
// reassurance that contradicts the countdown on their own Billing tab.
// 🔴 SO THE SHAPE IS BORROWED, NOT THE SENTENCE. TRIAL_NOT_STARTED_BY_EVENTS above establishes the
// pattern — "doing X doesn't start your free trial" — and this reuses that construction for a different
// X, which is the consistency that matters: an operator meets the same reassurance shape twice.
// ⚠️ TRUE IN BOTH TRIAL STATES, deliberately. Whether the trial has started or not, the ACT of
// connecting neither starts a subscription nor bills anything, so this needs no `trial_expires_at`
// branch — unlike its neighbours, which do.
// ⚠️ NO PLATFORM GATE NEEDED. It contains no instruction to buy and no price, so App Store 3.1.1/3.1.3
// does not reach it — the same reasoning recorded for TRIAL_NOT_STARTED_BILLING at the Billing card.
// ── 🔴 NARROWED 10 August 2026 — THE FIRST VERSION OVERCLAIMED, AND ON A MONEY FACT ────────────────
// It read: "Connecting Stripe doesn't start your subscription or charge you anything — it's how your
// customers pay you, not how you pay us."
// 🔴 "CHARGE YOU ANYTHING" IS TRUE OF CONNECTING AND FALSE OF WHAT FOLLOWS. On a paid plan HatchGrab
// takes a platform fee on online orders above the plan's allowance, so an operator who read that
// sentence and later saw a platform fee would have been misled by us, in writing, on their own
// Payments tab. The claim is now scoped to the ACT of connecting — "today" — and the plan is named as
// a separate thing rather than implicitly denied.
// ⚠️ THE REASSURANCE MUST SURVIVE THE CORRECTION. This sentence exists so a truck on trial is not
// afraid to press Connect; hedging it into "some charges may apply" would make it accurate and
// useless. Two short sentences: nothing happens today, and your plan is a different question.
// ⚠️ NO NUMBERS, EVER, IN THIS STRING. The allowance and the platform fee belong to the plan pricing.
// The manual records what restating the same fee facts across surfaces has already cost.
// ⚠️ RENAMED with the narrowing — it was CONNECTING_STRIPE_NOT_A_CHARGE, and a constant whose NAME
// overclaims is the same defect one level up: the next reader reads the name before the string.
export const CONNECTING_STRIPE_NOT_A_COMMITMENT =
  "Connecting doesn't start your subscription or charge you anything today. It's how your customers "
  + 'pay you — your plan is separate.'

export const SETTING_COPY = {
  /** Settings → Contact Details. The sentence wraps a <select>, so it is stored as its two halves —
   *  both surfaces render `{prefix} [15/30/60/120] {suffix}` and cannot word it differently. */
  allowCancellation: {
    label: 'Allow customers to cancel orders',
    help: '',
    cancelPrefix: 'Customers can cancel up to',
    cancelSuffix: 'before their pickup time',
  },

  /** Settings → Order settings → Accepting orders. */
  autoAccept: {
    label: 'Auto-accept orders',
    help: 'Incoming web orders are confirmed immediately',
  } as SettingCopy,

  /** Settings → Your trucks → Display settings. */
  orderReady: {
    label: 'Order-ready step',
    help: 'Show a “Mark ready” button on the orders screen and notify customers when their order is ready. '
      + 'Useful for collection at pubs and festivals. Applies to all events — you can still turn it on or '
      + 'off for a single event on its dashboard.',
  } as SettingCopy,

  /** Settings → Your trucks → Display settings. `countLabel` is the nested count row.
   *  ⚠️ THE POOL ONLY (truck_vans.buzzer_count). The per-event PROMPT (truck_events.buzzer_prompt) has
   *  no truck-level column and is not represented here or on either surface — see the report. */
  buzzers: {
    label: 'Do you hand out buzzers for collection?',
    help: 'Record which buzzer you gave each customer, so you know who to look for when their food is ready.',
    countLabel: 'How many buzzers do you have?',
  },
} as const
