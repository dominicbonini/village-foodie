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
// ── ⚠️ ACCOUNTS v1 vs v2 — A FORK THE OPERATOR MUST SETTLE BEFORE LIVE ─────────────────────────────
// Current docs carry BOTH of these, on different pages:
//   • the embedded-onboarding page (the page for the feature being built) documents `/v1/accounts`
//     with `controller` — which is what this file uses, and what the decided properties name;
//   • the "design an integration" / interactive platform guide says: "This guide only applies to
//     existing Connect platforms that use the Accounts v1 API. If you're a NEW Connect user, use the
//     Accounts v2 API instead."
// 🔴 WE ARE A NEW CONNECT USER. This file follows v1 because that is what the embedded-onboarding path
// documents and what the agreed controller properties are expressed in — but the choice is recorded, not
// assumed, and it belongs to the operator. See docs/stripe-connect-report.md.
//
// ── 🔴 SANDBOX ONLY. NOTHING HERE MAY CREATE A LIVE ACCOUNT. ───────────────────────────────────────
// Enforced by `assertSandboxKey` below, on the KEY rather than on a config flag: a flag can be wrong,
// but a key that starts `sk_live_` cannot be mistaken for anything else. Every entry point calls it.
import Stripe from 'stripe'

/** The four controller properties, as ONE constant, so no call site can send a different combination. */
export const CONNECT_CONTROLLER = {
  losses: { payments: 'stripe' },
  fees: { payer: 'account' },
  requirement_collection: 'stripe',
  stripe_dashboard: { type: 'full' },
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
 * Create the operator's connected account.
 * ⚠️ NO COUNTRY IS PINNED. `trucks.country` exists and defaults 'GB' if it is ever wanted, but the docs
 * are explicit that with a full Stripe Dashboard the account owner picks their own acquiring country
 * during onboarding — and pinning it here would take that away and freeze it, since specifying a country
 * makes it unchangeable. Nothing about this integration needs to know the country today.
 * ⚠️ NO CAPABILITIES REQUESTED, for the same reason: requesting one also freezes the country. Stripe
 * requests the right set for the chosen country automatically on a full-dashboard account.
 */
export async function createConnectedAccount(opts: { email?: string | null; businessUrl?: string | null }) {
  const stripe = stripeClient()
  return stripe.accounts.create({
    controller: CONNECT_CONTROLLER as unknown as Stripe.AccountCreateParams.Controller,
    ...(opts.email ? { email: opts.email } : {}),
    // Prefilling the URL is the one prefill the docs single out as worth doing; it reduces what the
    // operator has to type and does not constrain anything.
    ...(opts.businessUrl ? { business_profile: { url: opts.businessUrl } } : {}),
  })
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

/**
 * Read the account's live readiness from Stripe.
 * 🔴 RETURNS `charges_enabled`, AND NOTHING ELSE IS READINESS. Not "the account exists", not
 * `details_submitted`, not `payouts_enabled`. An account can exist for days mid-verification, and can
 * lose `charges_enabled` at any time when Stripe raises a requirement.
 */
export async function readAccountReadiness(accountId: string): Promise<{ chargesEnabled: boolean }> {
  const stripe = stripeClient()
  const account = await stripe.accounts.retrieve(accountId)
  return { chargesEnabled: account.charges_enabled === true }
}

/** True when the platform is configured enough to attempt anything. Used to render an honest empty state
 *  rather than letting a button throw. */
export function connectConfigured(): boolean {
  return typeof process.env.STRIPE_SECRET_KEY === 'string'
    && process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')
    && typeof process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY === 'string'
    && process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.length > 0
}
