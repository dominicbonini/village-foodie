// lib/stripe/connect.ts
// ONE PLACE THAT KNOWS HOW A CONNECTED ACCOUNT IS CREATED AND READ.
//
// ── 🔴 THE CONTROLLER PROPERTIES ARE THE COMMERCIAL POSITION, EXPRESSED AS FOUR FIELDS ──────────────
// They are NOT defaults to be tidied, and they are NOT what Stripe's own sample uses. Verified against
// the CURRENT embedded-onboarding documentation on 10 August 2026, which shows this sample:
//
//     controller[fees][payer]=application
//     controller[losses][payments]=application
//     controller[stripe_dashboard][type]=express
//
// 🔴 THAT IS THE EXACT INVERSE OF OUR MODEL, and copying it would put HatchGrab on the hook for every
// chargeback on every truck. What we send instead — and why:
//
//   losses.payments        = 'stripe'   Stripe bears negative-balance losses, monitors risk, and
//                                       remediates with the connected account directly. The published
//                                       terms say the truck's account bears refunds and chargebacks;
//                                       'application' would move that to us.
//   fees.payer             = 'account'  The connected account pays Stripe's processing fees. This is
//                                       what "the truck's own rate" means on the pricing page.
//   requirement_collection = 'stripe'   Stripe collects and chases verification requirements. We do not
//                                       want to own KYC collection, remediation flows, or the six-month
//                                       requirement-review cycle that owning it obliges.
//   stripe_dashboard.type  = 'full'     The truck gets a real Stripe Dashboard with its own login.
//
// ⚠️ `stripe_dashboard.type` IS IMMUTABLE. The current docs state it plainly: "The dashboard you specify
// when creating a connected account is permanent… To change a connected account's dashboard, you must
// create a new Account object." So this one is not a setting; it is a decision taken once per account.
//
// ⚠️ WITH losses.payments = 'stripe', STRIPE REQUIRES THE EMBEDDED COMPONENTS. From the same docs:
// "When Stripe is responsible for negative balances on your connected accounts, you must integrate
// embedded components for onboarding, account management, and the notification banner." That is why
// all three are built together and why the notification banner is not optional polish.
//
// ── ✅ ACCOUNTS v2 — SETTLED 10 August 2026, ON EVIDENCE ────────────────────────────────────────────
// The fork recorded here previously (v1's `controller` vs v2's `responsibilities`) is decided: accounts
// are created on **v2**, because Stripe's own guidance is "If you're a NEW Connect user, use the Accounts
// v2 API instead" and every blocker was probed away rather than argued away. See
// docs/stripe-connect-report.md for the runs. The three findings that made it safe:
//   • `/v1/account_sessions` ACCEPTS a v2 account id and enables all three embedded components, so the
//     onboarding UI is unchanged.
//   • A v2 account still emits v1 `account.updated` carrying `charges_enabled` as a real boolean, to the
//     existing `@accounts`-scoped endpoint — so THE WEBHOOK NEEDS NO CHANGE and the webhook route keeps
//     holding no STRIPE_SECRET_KEY.
//   • `/v1/accounts/{v2 id}` returns the account in v1 shape, so `readAccountReadiness` below is
//     untouched and still reads `charges_enabled`.
//
// ── 🔴 THE FEE PROPERTY INVERTS BETWEEN v1 AND v2. THIS IS THE MOST DANGEROUS LINE IN THIS FILE. ────
// v1 said `fees.payer: 'account'` — "the ACCOUNT pays". v2 says `fees_collector: 'stripe'` — "STRIPE
// collects". THE SAME COMMERCIAL POSITION, DESCRIBED FROM THE OPPOSITE END. v2 has NO 'account' value
// for `fees_collector`; the allowed values are 'application' | 'application_custom' |
// 'application_express' | 'stripe', and `application` means THE PLATFORM (us) is on the hook.
// 🔴 SO THE MECHANICAL TRANSLATION — 'account' → the nearest-looking token — SILENTLY PUTS HATCHGRAB ON
// THE HOOK FOR EVERY TRUCK'S STRIPE FEES. It is verified by READING THE ACCOUNT BACK (see
// `readAccountPosture`), not by trusting this constant, precisely because it has now inverted twice.
//
// ── 🔴 SANDBOX ONLY. NOTHING HERE MAY CREATE A LIVE ACCOUNT. ───────────────────────────────────────
// Enforced by `assertSandboxKey` below, on the KEY rather than on a config flag: a flag can be wrong,
// but a key that starts `sk_live_` cannot be mistaken for anything else. Every entry point calls it.
import Stripe from 'stripe'

// ── 🔴 THE PINNED v2 API VERSION. ONE CONSTANT, AND IT WILL MOVE. ──────────────────────────────────
// `/v2/core/*` REFUSES a request with no version header — probed: HTTP 400, "You did not provide an API
// version." This string is on Stripe's PREVIEW TRAIN, so it is not a stable identifier the way a v1
// date is; it is a moving target that will one day stop being accepted.
// ⚠️ SENT EXPLICITLY EVEN THOUGH THE SDK'S OWN DEFAULT CURRENTLY MATCHES IT. `stripe@22.4.0` pins
// '2026-07-29.dahlia' internally, so omitting it would work TODAY and would silently start sending a
// different version the day the SDK is upgraded. An explicit pin makes the version OUR decision and
// makes an SDK bump a visible, testable change rather than an invisible one.
// 🔴 A REJECTION OF THIS STRING IS A FIRST-CLASS FAILURE, NOT A GENERIC ERROR — see `asVersionRejection`.
export const STRIPE_V2_API_VERSION = '2026-07-29.dahlia'

/** The posture, as ONE constant, so no call site can send a different combination.
 *  🔴 `requirementsCollector` IS NOT SENT — Stripe COMPUTES it. It is listed here because it is part of
 *  the decided position and must therefore be CHECKED on read-back. Probed: it comes back 'stripe'
 *  without ever being sent, inherited from `dashboard: 'full'` + `losses_collector: 'stripe'`. */
export const CONNECT_V2_POSTURE = {
  dashboard: 'full',
  feesCollector: 'stripe',
  lossesCollector: 'stripe',
  /** Computed by Stripe. Expected, never sent. */
  requirementsCollector: 'stripe',
} as const

/**
 * 🔴 THE LIVE-ACCOUNT GUARD. Throws rather than returning a boolean, because every caller of this module
 * would otherwise have to remember to check — and the one that forgot would create a real account.
 * ⚠️ Tested on the KEY, not on NODE_ENV, not on a `SANDBOX=true` var, and not on `livemode` in a
 * response. Configuration can disagree with reality; `sk_live_` cannot.
 */
function assertSandboxKey(key: string | undefined): string {
  if (!key) {
    throw new Error('[stripe/connect] STRIPE_SECRET_KEY is not set — nothing can be created without it')
  }
  if (!key.startsWith('sk_test_')) {
    throw new Error(
      '[stripe/connect] REFUSING: STRIPE_SECRET_KEY is not a sandbox key. This build may only create ' +
      'test-mode connected accounts. Remove this guard deliberately, in its own change, when live ' +
      'accounts are switched on.',
    )
  }
  return key
}

/** The platform client. Created per call rather than module-scoped so the guard runs every time. */
function stripeClient(): Stripe {
  return new Stripe(assertSandboxKey(process.env.STRIPE_SECRET_KEY))
}

/**
 * 🔴 Recognise a rejection of OUR PINNED VERSION STRING, so it can be handled as its own failure.
 *
 * ⚠️ THIS SNIFFS THE MESSAGE TEXT, AND THAT IS A KNOWN WEAKNESS — stated rather than hidden. Stripe
 * returns NO machine-readable code for either form (probed: `code` is `undefined` on both), so the text
 * is the only signal there is. Both observed forms contain "api version":
 *   no header  → "You did not provide an API version. You need to provide an API version header."
 *   bad string → "Invalid Stripe API version: 2020-01-01.nonesuch. Learn more at …"
 * If Stripe rewords these, the match degrades to the generic branch — which still logs the pinned
 * version (see `createConnectedAccount`), so the clue survives even when the classification does not.
 */
function asVersionRejection(err: unknown): string | null {
  const e = err as { statusCode?: number; message?: string }
  if (e?.statusCode !== 400) return null
  const message = e.message ?? ''
  return /api version/i.test(message) ? message : null
}

/** What the operator is shown when the version pin is rejected. Deliberately says nothing about API
 *  versions: it is not their problem, they cannot act on it, and retrying will not fix it. */
const VERSION_REJECTED_MESSAGE =
  'Stripe could not set up your account. This is a fault on our side, it has been logged, and nothing '
  + 'was created or charged. Please contact support.'

/**
 * Create the operator's connected account on **Accounts v2**.
 *
 * ── 🔴 A COUNTRY IS NOW PINNED AT CREATION, AND IT DID NOT USED TO BE ──────────────────────────────
 * The v1 version of this function deliberately pinned NO country, because on a full-dashboard account
 * the owner picks their own acquiring country during onboarding and naming one freezes it.
 * ⚠️ v2 REMOVES THAT CHOICE, and it was probed rather than assumed:
 *     dashboard without a configuration → 400 "You cannot set `dashboard` unless the account is
 *                                             configured as a merchant or a recipient…"
 *     merchant configuration, no country → 400 "The field identity.country is required before setting
 *                                             configuration.merchant."
 * So `dashboard: 'full'` REQUIRES a merchant configuration, and a merchant configuration REQUIRES a
 * country. The country is therefore not a preference here; it is the price of the posture.
 * ✅ `entity_type` is NOT pinned and is NOT required (probed: comes back `null`), so sole-trader vs
 * company is still decided by the truck during onboarding. That mattered more than the country did.
 *
 * ── 🔴 card_payments IS REQUESTED, AND THE INTEGRATION IS BROKEN WITHOUT IT ────────────────────────
 * The v1 version requested no capabilities, because in v1 requesting one froze the country and Stripe
 * picked the right set automatically. In v2 it does not: an account created with an EMPTY merchant
 * configuration comes back with `capabilities: {}` and a v1 view of `capabilities: {}` — meaning
 * `charges_enabled` can NEVER become true and the money gate can never open. Probed both ways.
 * ⚠️ The v1 objection to requesting a capability has also dissolved: it was "requesting one freezes the
 * country", and the country is already pinned above because v2 insists on it.
 */
export async function createConnectedAccount(opts: {
  email?: string | null
  /** ISO-3166-1 alpha-2. Defaults 'GB' — `trucks.country` is NOT NULL and 'GB' for every row today. */
  country?: string | null
  businessUrl?: string | null
}) {
  const stripe = stripeClient()
  try {
    return await stripe.v2.core.accounts.create(
      {
        dashboard: CONNECT_V2_POSTURE.dashboard,
        defaults: {
          responsibilities: {
            // 🔴 'stripe' MEANS THE TRUCK PAYS STRIPE'S FEES. See the inversion note at the top of this
            // file before touching this line. 'application' would mean HatchGrab pays them.
            fees_collector: CONNECT_V2_POSTURE.feesCollector,
            losses_collector: CONNECT_V2_POSTURE.lossesCollector,
          },
          ...(opts.businessUrl ? { profile: { business_url: opts.businessUrl } } : {}),
        },
        identity: { country: (opts.country || 'GB').toLowerCase() },
        configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
        // v2 names this `contact_email`; v1 called it `email`.
        ...(opts.email ? { contact_email: opts.email } : {}),
      },
      { apiVersion: STRIPE_V2_API_VERSION },
    )
  } catch (err) {
    const versionMessage = asVersionRejection(err)
    if (versionMessage) {
      // 🔴 FIRST-CLASS FAILURE. Named, greppable, and it prints the pinned constant next to what Stripe
      // said about it — so the fix (change one constant) is visible from the log line alone.
      console.error(
        `[stripe/connect] 🔴 STRIPE REJECTED OUR PINNED API VERSION — no account was created.\n` +
        `    pinned STRIPE_V2_API_VERSION = ${STRIPE_V2_API_VERSION}\n` +
        `    Stripe said                  : ${versionMessage}\n` +
        `    FIX: update STRIPE_V2_API_VERSION in lib/stripe/connect.ts to a version Stripe still ` +
        `accepts. This is a preview-train string and is EXPECTED to move. Connect account creation is ` +
        `DOWN for every operator until it is changed.`,
      )
      throw new Error(VERSION_REJECTED_MESSAGE)
    }
    // Everything else still names the version, because a 400 whose wording we did not recognise is the
    // most likely place for the next version change to hide.
    console.error(
      `[stripe/connect] account creation failed (pinned version ${STRIPE_V2_API_VERSION}):`,
      err instanceof Error ? err.message : err,
    )
    throw err
  }
}

/** The four posture properties as Stripe reports them back. */
/** What the Payments tab badge is driven by. Server-side, from Stripe's own account object. */
export interface AccountRequirements {
  /** 🔴 THE BADGE PREDICATE. True only when Stripe is blocked on the TRUCK. */
  actionRequired: boolean
  currentlyDue: string[]
  pastDue: string[]
  /** Non-null when Stripe has disabled the account — e.g. 'requirements.past_due'. */
  disabledReason: string | null
}

/**
 * 🔴 THE BADGE'S SOURCE, AND IT IS DELIBERATELY NOT THE NOTIFICATION BANNER.
 *
 * ── WHY NOT `onNotificationsChange` — TWO REASONS, AND THE SECOND IS FATAL ─────────────────────────
 * 1. It reports from inside an IFRAME on Stripe's schedule: late, twice, or never. A badge that is
 *    silent when action IS required is worse than no badge, because silence reads as "all clear".
 * 2. 🔴 THE BANNER ONLY EXISTS ON THE PAYMENTS TAB. The badge has to be visible from every OTHER tab —
 *    that is the entire point of it. A cross-tab signal fed by a same-tab iframe is a contradiction:
 *    open Manage on the Menu tab and Connect.js has never loaded, no Account Session has been minted,
 *    and the iframe has never rendered, so the callback cannot have fired. The only way round it would
 *    be to mount a Connect instance on EVERY Manage page load for every operator, paying an Account
 *    Session and an iframe on every page view to power a badge.
 * ⚠️ DO NOT REINTRODUCE IT. If a future pass wants richer detail, extend THIS function — the fields are
 * already on a response we make anyway.
 *
 * ── ⚠️ WHAT THIS DELIBERATELY DOES NOT CATCH ──────────────────────────────────────────────────────
 * Stripe's banner also shows ACCOUNT-HYGIENE prompts — "Confirm your email address" being the one that
 * prompted this build. Measured on the live account: every requirements array is EMPTY while that
 * banner shows, with `charges_enabled` and `payouts_enabled` both true. It is a Stripe-login concern,
 * not a Connect requirement, and it stops no money.
 * 🔴 THE BADGE IS FOR THINGS THAT STOP THE MONEY. Amplifying hygiene prompts to a cross-tab badge and an
 * amber banner — the treatment reserved for "customers can't see allergen info" — would be a category
 * error, and would train an operator to ignore the badge that matters.
 *
 * ⚠️ ONE v1 RETRIEVE, not the two calls `readAccountReadiness` makes. This runs on Manage page load, so
 * it is deliberately the cheapest read that answers the question. It is never called for a truck with
 * no connected account — see the route.
 */
export async function readAccountRequirements(accountId: string): Promise<AccountRequirements> {
  const stripe = stripeClient()
  const account = await stripe.accounts.retrieve(accountId)
  const currentlyDue = account.requirements?.currently_due ?? []
  const pastDue = account.requirements?.past_due ?? []
  const disabledReason = account.requirements?.disabled_reason ?? null
  return {
    // 🔴 `disabled_reason` IS INCLUDED, AND IT IS THE ONE THAT MATTERS MOST. An account can be disabled
    // with both arrays empty (a Stripe-side review, for instance) — reading only the arrays would miss
    // exactly the case where the truck has stopped being able to trade.
    actionRequired: currentlyDue.length > 0 || pastDue.length > 0 || disabledReason !== null,
    currentlyDue,
    pastDue,
    disabledReason,
  }
}

export interface AccountPosture {
  dashboard: string | null
  feesCollector: string | null
  lossesCollector: string | null
  requirementsCollector: string | null
}

/**
 * 🔴 READ THE POSTURE BACK FROM STRIPE. Never inferred from what was sent.
 * Two of these cannot be verified any other way: `requirements_collector` is COMPUTED and is not sent at
 * all, and `fees_collector` is the property that has now inverted twice between API versions. A create
 * call that returns 200 having quietly landed a different posture is exactly the failure this catches.
 */
export async function readAccountPosture(accountId: string): Promise<AccountPosture> {
  const stripe = stripeClient()
  const account = await stripe.v2.core.accounts.retrieve(
    accountId,
    { include: ['defaults'] },
    { apiVersion: STRIPE_V2_API_VERSION },
  )
  const r = account.defaults?.responsibilities
  return {
    dashboard: account.dashboard ?? null,
    feesCollector: r?.fees_collector ?? null,
    lossesCollector: r?.losses_collector ?? null,
    requirementsCollector: r?.requirements_collector ?? null,
  }
}

/** Compare a read-back posture against intent. Pure, so it is testable without a network call.
 *  Returns every mismatch rather than the first, because "which of the four" is the whole diagnostic. */
export function postureMismatches(actual: AccountPosture): string[] {
  const expected: Array<[keyof AccountPosture, string]> = [
    ['dashboard', CONNECT_V2_POSTURE.dashboard],
    ['feesCollector', CONNECT_V2_POSTURE.feesCollector],
    ['lossesCollector', CONNECT_V2_POSTURE.lossesCollector],
    ['requirementsCollector', CONNECT_V2_POSTURE.requirementsCollector],
  ]
  return expected
    .filter(([key, want]) => actual[key] !== want)
    .map(([key, want]) => `${key}: expected '${want}', got '${actual[key] ?? 'null'}'`)
}

/**
 * Create the Account Session that the embedded components mount against.
 * 🔴 ALL THREE COMPONENTS ARE ENABLED TOGETHER because `losses.payments: 'stripe'` REQUIRES all three —
 * onboarding, account management, and the notification banner. Dropping one is not a UI decision.
 * ⚠️ A FRESH SESSION EVERY CALL. The docs are explicit: "fetchClientSecret should always create a new
 * account session and return a fresh client_secret." Connect.js calls it again when the session expires,
 * so caching the secret would hand back a dead one on a long-lived tab.
 */
export async function createAccountSession(accountId: string) {
  const stripe = stripeClient()
  return stripe.accountSessions.create({
    account: accountId,
    components: {
      account_onboarding: { enabled: true },
      account_management: { enabled: true },
      notification_banner: { enabled: true },
    },
  })
}

export interface AccountReadiness {
  /** 🔴 THE MONEY GATE. Nothing else is readiness. */
  chargesEnabled: boolean
  /** Whether onboarding has ever been completed. Free — same call as `chargesEnabled`. */
  detailsSubmitted: boolean
  /** v2 `card_payments.status`: 'active' | 'pending' | 'restricted' | 'unsupported'. Null if unreadable. */
  cardPaymentsStatus: string | null
}

/**
 * Read the account's live state from Stripe.
 *
 * 🔴 `charges_enabled` IS READINESS, AND NOTHING ELSE IS. Not "the account exists", not
 * `details_submitted`, not `payouts_enabled`. An account can exist for days mid-verification, and can
 * lose `charges_enabled` at any time when Stripe raises a requirement.
 * ⚠️ IT STAYS THE v1 BOOLEAN ON PURPOSE. The `account.updated` webhook writes
 * `operators.stripe_charges_enabled` from the v1 `charges_enabled` on the event, so this must read the
 * same field from the same API. Deriving readiness here from a capability status instead would give two
 * writers two definitions of one column, and the column would flip-flop between them.
 *
 * ── ⚠️ THIS MAKES TWO API CALLS, AND THE SECOND ONE IS NEW. THE COST, STATED: ──────────────────────
 * One extra Stripe request per Payments-tab open. That is an OWNER-ONLY route, opened rarely and never
 * in a loop, and the tab already made one call and one database write — so 1 → 2 is not a meaningful
 * change in load. It is recorded rather than waved through because it is a real cost.
 *
 * 🔴 WHY IT IS NOT FREE, HAVING BEEN CHECKED. The v1 retrieve above ALREADY returns a capability map —
 * `capabilities: {"card_payments":"inactive", …}` — and using it would have cost nothing. It is not
 * used because v1's vocabulary is `active | inactive | pending | unrequested`, which folds v2's
 * `restricted` AND `unsupported` into one word. Those two need opposite advice: `restricted` means
 * "finish onboarding", `unsupported` means "this account will never take cards, stop asking". A free
 * value that cannot tell them apart would have us telling some truck to add information forever.
 *
 * ⚠️ THE SECOND CALL IS NON-FATAL. If it fails, `cardPaymentsStatus` is null and the tab falls back to
 * the states it can derive from the v1 fields alone — degraded, never blocked. Readiness itself never
 * depends on it.
 */
export async function readAccountReadiness(accountId: string): Promise<AccountReadiness> {
  const stripe = stripeClient()
  const account = await stripe.accounts.retrieve(accountId)

  let cardPaymentsStatus: string | null = null
  try {
    const v2 = await stripe.v2.core.accounts.retrieve(
      accountId,
      { include: ['configuration.merchant'] },
      { apiVersion: STRIPE_V2_API_VERSION },
    )
    cardPaymentsStatus = v2.configuration?.merchant?.capabilities?.card_payments?.status ?? null
  } catch (err) {
    console.error(
      `[stripe/connect] could not read card_payments status for ${accountId} — the tab will fall back ` +
      `to the v1 fields and cannot distinguish 'pending' from 'restricted':`,
      err instanceof Error ? err.message : err,
    )
  }

  return {
    chargesEnabled: account.charges_enabled === true,
    detailsSubmitted: account.details_submitted === true,
    cardPaymentsStatus,
  }
}

/** True when the platform is configured enough to attempt anything. Used to render an honest empty state
 *  rather than letting a button throw. */
export function connectConfigured(): boolean {
  return typeof process.env.STRIPE_SECRET_KEY === 'string'
    && process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')
    && typeof process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY === 'string'
    && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.length > 0
}

// ── 🔴 PAYMENT METHOD DOMAIN REGISTRATION — WHAT MAKES APPLE PAY AND GOOGLE PAY APPEAR ─────────────
// Without this the Payment Element renders a card form and nothing else. The wallets are not missing
// because of a code option — `wallets: { applePay: 'auto', googlePay: 'auto' }` is already set — they
// are missing because Stripe will not offer a wallet on a domain it has not verified for the account
// that is taking the money.
//
// 🔴 FOR THE CONNECTED ACCOUNT, NOT THE PLATFORM. These are DIRECT charges: the truck's account is the
// merchant of record, so the domain has to be registered against THAT account. Registering it on the
// platform does nothing for them — measured on 13 August 2026, and it is exactly the symptom that looks
// like the Dashboard toggle undoing itself:
//     PLATFORM   acct (ours)              → www.hatchgrab.com     apple_pay=active
//     CONNECTED  acct_1U30w22fB4PPCw2D    → checkout.stripe.com   (and nothing else)
// The truck had only the domain Stripe auto-registered for hosted Checkout, which is why wallets worked
// on the old hosted page and vanished when the Payment Element moved in-page.
//
// ⚠️ THERE IS NO DASHBOARD PATH FOR A CONNECT PLATFORM CREATING DIRECT CHARGES. The API is the only
// route, authenticated with the PLATFORM secret key and the connected account id in the Stripe-Account
// header — which is what `{ stripeAccount }` sets.
//
// ⚠️ MODE MATTERS AND DOES NOT FLOW UPWARDS. Registering in LIVE mode also covers sandboxes; registering
// in a SANDBOX does NOT cover live. This build refuses live keys (assertSandboxKey), so every
// registration it performs is sandbox-only and MUST BE REPEATED IN LIVE MODE when live accounts are
// switched on. That is a real deployment step, not a nicety.

/**
 * The domains the Payment Element is served from.
 *
 * ⚠️ ONLY `www.hatchgrab.com`, AND THE BARE DOMAIN IS DELIBERATELY ABSENT. Measured: `hatchgrab.com`
 * answers 307 → `https://www.hatchgrab.com/`, so a customer never has an Element mounted on the bare
 * host and a registration there would verify a domain nothing renders on. If the redirect is ever
 * removed, add it here — the function takes a list precisely so that is a one-line change.
 * ⚠️ Read from NEXT_PUBLIC_HATCHGRAB_URL when it is set, so a preview deployment registers itself rather
 * than silently registering production's host.
 */
export function paymentMethodDomains(): string[] {
  const raw = process.env.NEXT_PUBLIC_HATCHGRAB_URL
  if (!raw) return ['www.hatchgrab.com']
  try { return [new URL(raw).hostname] } catch { return ['www.hatchgrab.com'] }
}

export interface DomainRegistrationResult {
  domain: string
  /** 'registered' — created now. 'already' — it was already there. 'failed' — see `detail`. */
  status: 'registered' | 'already' | 'failed'
  applePay?: string
  googlePay?: string
  detail?: string
}

/**
 * Register this platform's payment method domains on ONE connected account.
 *
 * 🔴 IDEMPOTENT, AND IT ASKS BEFORE IT WRITES. Stripe's guidance is not to register a domain more than
 * once per account, so this LISTS first (filtered by `domain_name`, so it is one cheap lookup) and only
 * creates what is missing. Running it twice is a pair of reads and no writes.
 *
 * 🔴 NON-FATAL BY CONSTRUCTION — IT CANNOT THROW. Every failure is captured into a result row. A truck
 * that cannot show Apple Pay can still take cards, and onboarding must never break over a wallet: the
 * account exists at Stripe by the time this runs and CANNOT be deleted, so a throw here would strand an
 * operator mid-signup to fix something entirely cosmetic. The caller is expected to log and continue.
 *
 * ⚠️ `enabled: true` is the default but is passed explicitly, because a domain registered disabled shows
 * no wallets and looks identical to one that was never registered.
 */
export async function registerPaymentMethodDomains(accountId: string): Promise<DomainRegistrationResult[]> {
  const results: DomainRegistrationResult[] = []
  let stripe: Stripe
  try {
    stripe = stripeClient()
  } catch (err) {
    // The sandbox guard, or a missing key. Report it as a failure per domain rather than throwing.
    return paymentMethodDomains().map(domain => ({
      domain, status: 'failed' as const,
      detail: err instanceof Error ? err.message : 'stripe client unavailable',
    }))
  }

  for (const domain of paymentMethodDomains()) {
    try {
      const existing = await stripe.paymentMethodDomains.list(
        { domain_name: domain, limit: 1 },
        { stripeAccount: accountId },
      )
      const found = existing.data[0]
      if (found) {
        results.push({
          domain, status: 'already',
          applePay: found.apple_pay?.status, googlePay: found.google_pay?.status,
        })
        continue
      }
      const created = await stripe.paymentMethodDomains.create(
        { domain_name: domain, enabled: true },
        // 🔴 THE Stripe-Account HEADER. Without it this registers on the PLATFORM, which is the exact
        // no-op that made the Dashboard toggle look like it was undoing itself.
        { stripeAccount: accountId },
      )
      results.push({
        domain, status: 'registered',
        applePay: created.apple_pay?.status, googlePay: created.google_pay?.status,
      })
    } catch (err) {
      results.push({
        domain, status: 'failed',
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  }
  return results
}
