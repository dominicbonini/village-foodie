// lib/stripe/payments-state.ts
// ONE definition of what state a truck's card-payment setup is in, and therefore what the Payments tab
// shows them.
//
// ── 🔴 WHY THIS IS A SEPARATE, PURE MODULE ──────────────────────────────────────────────────────────
// It is imported by a CLIENT component. lib/stripe/connect.ts cannot be — it imports the Stripe server
// SDK and reads STRIPE_SECRET_KEY, so pulling it into the browser bundle would be both a build error and
// a mistake worth making impossible. Nothing in here imports anything.
//
// ── 🔴 WHY A STATE MACHINE AND NOT A PILE OF BOOLEANS ──────────────────────────────────────────────
// The tab used to render three Stripe panels at once and let the operator choose. Stripe's own docs say
// that is wrong in two specific ways: the notification banner "won't render any UI if the account is
// missing details_submitted", and account management "isn't optimized for collecting missing account
// information. For that use case, consider using account onboarding". So at any moment at most ONE of
// them is the next action, and the others are noise or an empty box. Deriving one state, once, is what
// makes "show exactly one" expressible.
//
// ⚠️ NOT A WIZARD, AND DELIBERATELY SO. There are no step numbers, no progress dots and no ordering
// beyond this enum. Stripe's onboarding is ALREADY multi-step, it owns those steps, and its docs warn
// that the step names "can change at any time, without notice" and that steps "can appear in any order
// and can repeat". A progress indicator we cannot keep accurate is worse than none.

/** What the Payments tab is showing. Exhaustive — every branch in the tab switches on this. */
export type PaymentsState =
  /** No connected account exists yet. */
  | 'not_connected'
  /** Connected, never finished onboarding. Requirements outstanding. */
  | 'requirements'
  /** Submitted and waiting on Stripe. 🔴 NOTHING FOR THE OPERATOR TO DO. */
  | 'pending'
  /** `charges_enabled` — the money gate is open. */
  | 'ready'
  /** Onboarded once, and Stripe has since stopped allowing card payments. */
  | 'restricted'
  /** 🔴 TERMINAL. Stripe will not enable card payments on this account at all. */
  | 'unsupported'

export interface PaymentsStateInput {
  accountId: string | null
  /** 🔴 THE MONEY GATE, from Stripe's v1 `charges_enabled`. Server-side. NEVER from the browser. */
  chargesEnabled: boolean
  /** Stripe's v1 `details_submitted`. Also the gate the notification banner uses internally. */
  detailsSubmitted: boolean
  /** v2 `configuration.merchant.capabilities.card_payments.status`. Null when unread. */
  cardPaymentsStatus: string | null
}

/**
 * 🔴 THE ONE PLACE THE STATE IS DECIDED. Pure, total, and order-sensitive — read the order as the rule.
 *
 * ⚠️ `chargesEnabled` IS TESTED SECOND, BEFORE ANY CAPABILITY STATUS, AND THAT IS THE POINT.
 * It is the money gate and it outranks everything: if Stripe says this account can take payments, the
 * tab says ready, whatever a capability status happens to read at the same instant. The two are read
 * from two different API versions in two different calls and can disagree for a moment; when they do,
 * the boolean that governs whether money can move wins.
 *
 * ⚠️ `pending` vs `restricted` IS THE WHOLE REASON THE CAPABILITY STATUS IS READ AT ALL.
 * `charges_enabled: false` cannot tell "Stripe is checking, sit tight" apart from "Stripe is blocked on
 * you". The tab used to say "finish the steps below" for both, which sends a truck hunting for work that
 * does not exist. Stripe: "`pending` — The capability isn't active, but you don't need to provide any
 * requirements. Stripe might be in the process of verifying provided information."
 *
 * ⚠️ `detailsSubmitted` SEPARATES "never finished" FROM "was fine, now paused". Both have outstanding
 * requirements; only the second is an interruption to a working truck, and they deserve different words.
 *
 * ── ⚠️ ONE CONFLATION SURVIVES ON PURPOSE, AND IT IS NAMED RATHER THAN LEFT TO BE DISCOVERED ───────
 * `requirements` covers BOTH "pressed Connect and has never opened the form" and "got halfway through
 * the form and left". This machine cannot tell them apart, because it keys only on what Stripe reports
 * about the account, and Stripe exposes no "has entered onboarding" fact.
 *
 * 🔴 IT WAS COSTED, AND THE PRICE IS NOT WORTH PAYING. Knowing it would need BOTH of:
 *   • an `onStepChange` handler on the onboarding component — an IFRAME CALLBACK, which can arrive
 *     late, twice or never. The previous pass deliberately removed every iframe callback from this
 *     state machine for exactly that reason, and this would put one back at its centre;
 *   • somewhere durable to keep it — a new `operators` column and a migration — because a flag held in
 *     React state is gone the moment they close the tab, which is precisely when they abandoned.
 *
 * ✅ AND IT WOULD BUY ALMOST NOTHING: THE NEXT ACTION IS IDENTICAL IN BOTH CASES. Open Stripe's
 * onboarding, which resumes at the step they left. The only difference would be a nicer sentence.
 * ⚠️ SO THE COPY IS WRITTEN TO BE TRUE OF BOTH instead — "Stripe needs your details" claims neither a
 * start nor a resumption. If a future pass ever does want the distinction, do it with a persisted
 * column, never with the callback alone.
 */
export function derivePaymentsState(input: PaymentsStateInput): PaymentsState {
  if (!input.accountId) return 'not_connected'
  if (input.chargesEnabled) return 'ready'
  // 🔴 TERMINAL, AND CHECKED BEFORE THE REQUIREMENT STATES. Stripe: "`unsupported` — The capability
  // isn't active because it isn't supported for that connected account." Onboarding cannot fix it, so
  // sending them there would be an instruction that can never succeed — the exact failure this enum
  // exists to stop. v1's `capabilities` map cannot express this; see the note in lib/stripe/connect.ts.
  if (input.cardPaymentsStatus === 'unsupported') return 'unsupported'
  if (input.cardPaymentsStatus === 'pending') return 'pending'
  return input.detailsSubmitted ? 'restricted' : 'requirements'
}

/**
 * 🔴 SHOULD THE NOTIFICATION BANNER BE MOUNTED AT ALL?
 *
 * Only once `details_submitted` is true — because Stripe documents that before then it renders nothing:
 * "Use the notification banner after the account goes through account onboarding and has
 * `details_submitted`. The banner won't render any UI if the account is missing `details_submitted`."
 *
 * ⚠️ THIS IS OUR SERVER-SIDE FIELD, NOT A REPORT FROM INSIDE THE IFRAME. It is the same field the
 * banner gates on internally, so the two cannot disagree, and it costs no callback and no flag.
 * ⚠️ Not mounting a component that provably renders nothing is not the "unnecessary unmounting" Stripe
 * warns about — that warning is about render loops. This flips once, when onboarding completes.
 */
export function shouldMountNotificationBanner(state: PaymentsState, detailsSubmitted: boolean): boolean {
  return state !== 'not_connected' && detailsSubmitted
}

/** Onboarding is the ONLY route that collects requirements, and Stripe says to reuse it for remediation:
 *  "Let your accounts remediate their verification requirements by directing them to the Account
 *  onboarding component." So it serves both the first run and a later interruption — and nothing else. */
export function shouldShowOnboarding(state: PaymentsState): boolean {
  return state === 'requirements' || state === 'restricted'
}

/** Account management is a LOOKUP-AND-EDIT surface, never a collection one — Stripe: "Account management
 *  isn't optimized for collecting missing account information." So it appears only once the account has
 *  been through onboarding, where its real job (changing payout bank details) begins.
 *
 *  ⚠️ `unsupported` WAS EXCLUDED AND IS NOW INCLUDED, changed 11 August 2026. The old reasoning was that
 *  an account which will never take cards has no payout to redirect. That became untenable when Stripe's
 *  notification banner moved inside the "Your Stripe details" card: the card must render wherever the
 *  banner can (i.e. every post-onboarding state, `unsupported` included), and a card whose sentence
 *  offers to change bank details while showing no way to do it is a dead end.
 *  🔴 It is also the better rule on its own terms: a truck that has completed onboarding has real bank
 *  and business details on file, and being unable to take CARDS is not a reason to lock them out of
 *  their own information. */
export function shouldOfferAccountManagement(state: PaymentsState): boolean {
  return state === 'ready' || state === 'restricted' || state === 'pending' || state === 'unsupported'
}
