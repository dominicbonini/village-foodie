// lib/payments/authorize.ts
// Start an AUTHORISATION against a draft. No order exists yet and none is created here.
//
// ── 🔴 capture_method: 'manual'. THIS IS A HOLD, NOT A CHARGE. ──────────────────────────────────────
// The whole point of authorize-then-capture is that the customer's money is RESERVED, not taken, until
// the order exists and is confirmed. `capture_method: 'manual'` is the one line that makes that true.
// Without it Stripe charges immediately and every failure below this point becomes a refund instead of
// a cancellation — a refund the truck must issue from their own balance, on a direct charge, for an
// order that never existed.
// 🔴 NOTHING IN THIS PHASE CAPTURES. Capture follows confirmation and is a later phase. Search this file
// for `capture(` — there is none.
//
// ── 🔴 A PaymentIntent CREATED DIRECTLY. NOT A CHECKOUT SESSION, AND THIS IS THE WHOLE FIX. ────────
// This used to create a hosted Checkout Session and read `session.payment_intent`. THAT FIELD IS NULL AT
// CREATION: a Session's PaymentIntent does not exist until the customer submits payment. So the id was
// never available, the attach never ran, `authorizeDraft` returned not-ok on EVERY card order, and the
// card fork fell through to the old order-first path — which is exactly the behaviour this workstream
// exists to remove. Proved live on 12 August: a session carrying the draft key came back with
// payment_intent: null, while the order it should have prevented was created one second later.
// 🔴 `paymentIntents.create` RETURNS THE ID SYNCHRONOUSLY. There is no window in which an authorisation
// exists that the draft cannot name.
//
// ⚠️ `application_fee_amount`, `on_behalf_of` and `transfer_data` all exist on this call. NONE is sent,
// deliberately and unchanged from the Session version: this build charges no platform fee, and a fee
// must be a POSITIVE integer so "no fee" is expressed by ABSENCE, never by zero. Search this file for
// `application_fee` — there is none.
//
// ── READINESS IS RE-READ HERE ──────────────────────────────────────────────────────────────────────
// Same rule the hosted-Checkout route always applied: the client's `card_payments_ready` is a rendering
// hint. A customer holding a stale `true` from a tab left open while the truck's account was restricted
// must not be able to start a payment.
import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveOnlineCardPayments } from '@/lib/payments/online-payments-switch'
import { attachPaymentIntent } from '@/lib/payments/order-drafts'

/** ⚠️ The same refusal the hosted-Checkout route made, for the same reason: this build may not move real
 *  money, and a key starting `sk_live_` cannot be mistaken for anything else. */
function sandboxKey(): string {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  if (!key.startsWith('sk_test_')) {
    throw new Error('REFUSING: STRIPE_SECRET_KEY is not a sandbox key. This build may not take real payments.')
  }
  return key
}

export type AuthorizeResult =
  | {
      ok: true
      /** 🔴 The ONLY secret the browser needs, and it is scoped to this one PaymentIntent. */
      clientSecret: string
      paymentIntentId: string
      /** The connected account this intent lives on. Stripe.js MUST be initialised with it, or the
       *  Element confirms against the platform account and cannot find the intent. */
      stripeAccount: string
    }
  /** The truck cannot take cards right now. */
  | { ok: false; reason: 'not_ready' }
  /** Something went wrong at Stripe or in this function. */
  | { ok: false; reason: 'error'; detail: string }

/**
 * Create the authorisation for a draft and attach the resulting PaymentIntent to it.
 *
 * @param orderKey    the DRAFT's key — which becomes the order's key on promotion, which is why it can
 *                    go straight into metadata and needs no translation later.
 * @param amountMinor integer pence, SERVER-computed. Never a figure that arrived from a browser.
 */
export async function authorizeDraft(
  supabase: SupabaseClient,
  args: {
    orderKey: string
    truckId: string
    amountMinor: number
    currency?: string
  },
): Promise<AuthorizeResult> {
  try {
    const { data: truck } = await supabase
      .from('trucks')
      .select('id, operator_id, online_payments_paused_at')
      .eq('id', args.truckId)
      .single()
    if (!truck?.operator_id) return { ok: false, reason: 'not_ready' }

    const { data: operator } = await supabase
      .from('operators')
      .select('stripe_account_id, stripe_charges_enabled')
      .eq('id', truck.operator_id)
      .single()

    // 🔴 `stripe_charges_enabled`, never "a row exists". ANDed with the operator's pause through the one
    // resolver, so this and /api/menu cannot disagree about whether a card is on offer.
    const cards = resolveOnlineCardPayments(operator, truck)
    if (!operator?.stripe_account_id || !cards.offered) {
      if (cards.pausedAt) {
        console.log(
          `[authorize] draft=${args.orderKey} truck=${args.truckId} — online payments PAUSED since ` +
          `${cards.pausedAt}; card refused`,
        )
      }
      return { ok: false, reason: 'not_ready' }
    }

    if (!Number.isInteger(args.amountMinor) || args.amountMinor <= 0) {
      return { ok: false, reason: 'error', detail: `no payable amount (${args.amountMinor})` }
    }

    const stripe = new Stripe(sandboxKey())

    const intent = await stripe.paymentIntents.create(
      {
        amount: args.amountMinor,
        currency: (args.currency ?? 'GBP').toLowerCase(),
        // 🔴 THE LINE THE WHOLE DESIGN RESTS ON. A hold, not a charge. See the header.
        capture_method: 'manual',
        // 🔴 THE JOIN KEY. The webhook has only a PaymentIntent; this is how it finds the draft — and
        // because a draft's key becomes its order's key, the same metadata keeps working after promotion
        // with nothing to migrate and no change to the webhook or the ledger.
        metadata: { order_key: args.orderKey, truck_id: args.truckId, source: 'hatchgrab_online_order' },
        // ── 🔴 AN EXPLICIT LIST, AND IT REPLACED `automatic_payment_methods`. THE REASON IS LINK. ──
        // It read `automatic_payment_methods: { enabled: true, allow_redirects: 'always' }`, which lets
        // Stripe offer every method enabled on the account — including LINK, whose inline signup renders
        // the "Save my information for faster checkout" box with an email and phone field inside our
        // payment panel. There is no client-side switch for that box: the Payment Element has `wallets`
        // options for Apple Pay and Google Pay and nothing equivalent for Link. The method list is the
        // lever, and it is here.
        // 🔴 SO THIS IS A DELIBERATE PAYMENT-METHOD CONFIGURATION CHANGE, NOT A TIDY-UP: Link is no
        // longer offered on this intent. Nothing else was on offer that is lost — see the report.
        // ⚠️ APPLE PAY AND GOOGLE PAY ARE UNAFFECTED. They are CARD wallets, surfaced by the Payment
        // Element whenever `card` is an accepted method and the device supports them; they are not
        // separate entries in this list and never were. The client's `wallets: { applePay: 'auto',
        // googlePay: 'auto' }` still governs whether they render.
        // ⚠️ `card` SUPPORTS MANUAL CAPTURE, which is what `automatic_payment_methods` was silently
        // filtering for. Naming it explicitly makes that guarantee visible instead of delegated.
        payment_method_types: ['card'],
        // ⚠️ NO application_fee_amount, NO on_behalf_of, NO transfer_data. See the header — absence, not
        // zero, and unchanged from the Session this replaces.
      },
      // 🔴 The connected account. BYTE-IDENTICAL to what the Session call passed. Without this the
      // charge would be created on the PLATFORM account, making HatchGrab merchant of record — the one
      // thing the model forbids.
      { stripeAccount: operator.stripe_account_id },
    )

    if (!intent.client_secret) {
      console.error(`[authorize] 🔴 intent ${intent.id} created without a client_secret for draft=${args.orderKey}`)
      return { ok: false, reason: 'error', detail: 'intent has no client secret' }
    }

    // 🔴 ATTACHED BEFORE THE SECRET LEAVES THIS FUNCTION. If this write is skipped and the customer pays,
    // the draft has no intent id — and the cancellation sweep, which finds work by payment_intent_id,
    // would never see the money. Attaching first makes an unnameable authorisation impossible.
    // ⚠️ `livemode` FROM THE STRIPE OBJECT, never from an sk_test_/sk_live_ prefix or NODE_ENV — the same
    // rule order_payments.livemode and stripe_webhook_events.livemode follow.
    const attached = await attachPaymentIntent(supabase, {
      orderKey: args.orderKey,
      paymentIntentId: intent.id,
      livemode: intent.livemode === true,
    })
    if (!attached) {
      console.error(
        `[authorize] 🔴 could not attach pi=${intent.id} to draft=${args.orderKey} — REFUSING to hand the ` +
        `customer a client secret, because an authorisation this system cannot name is worse than no card ` +
        `payment. The intent is left uncancelled here; the sweep cannot see it, so this is loud on purpose.`,
      )
      return { ok: false, reason: 'error', detail: 'intent not attached to draft' }
    }

    console.log(
      `[authorize] pi=${intent.id} draft=${args.orderKey} truck=${args.truckId} ` +
      `account=${operator.stripe_account_id} amount_minor=${args.amountMinor} capture_method=manual`,
    )
    return {
      ok: true,
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      stripeAccount: operator.stripe_account_id,
    }
  } catch (err) {
    console.error(`[authorize] FAILED draft=${args.orderKey}:`, err instanceof Error ? err.message : err)
    return { ok: false, reason: 'error', detail: err instanceof Error ? err.message : 'unknown' }
  }
}

/**
 * Release a hold. THE COUNTERPART TO EVERY AUTHORISATION THAT DOES NOT BECOME AN ORDER.
 *
 * 🔴 CANCEL, NOT REFUND. An uncaptured PaymentIntent is cancelled and the customer's bank releases the
 * hold; nothing ever appears as a charge. This is the entire reason capture_method is manual: on a
 * DIRECT charge HatchGrab is not the merchant of record and cannot refund, so a charge taken for an
 * order that cannot exist would have to be undone by the operator, by hand, from their own balance.
 *
 * ⚠️ IDEMPOTENT IN PRACTICE. Cancelling an already-cancelled intent returns a Stripe error which is
 * treated as success here: the goal is "no hold remains", and an intent Stripe says is already cancelled
 * satisfies it. An intent that has been CAPTURED cannot be cancelled and returns ok:false — that is a
 * genuine problem (money taken with no order) and must not be silently swallowed.
 */
export async function cancelAuthorization(args: {
  paymentIntentId: string
  stripeAccountId: string
  reason?: 'abandoned' | 'requested_by_customer'
}): Promise<{ ok: boolean; detail?: string }> {
  try {
    const stripe = new Stripe(sandboxKey())
    await stripe.paymentIntents.cancel(
      args.paymentIntentId,
      { cancellation_reason: args.reason ?? 'abandoned' },
      { stripeAccount: args.stripeAccountId },
    )
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // Already cancelled → the hold is gone, which is what was asked for.
    if (/already been canceled|already canceled|already been cancelled/i.test(message)) {
      return { ok: true, detail: 'already cancelled' }
    }
    console.error(`[authorize] cancel FAILED pi=${args.paymentIntentId}:`, message)
    return { ok: false, detail: message }
  }
}

/** The connected account a draft's intent lives on. Needed for every Stripe call, which are all
 *  account-scoped on a direct charge. Returns null when the truck has no usable Stripe account. */
export async function stripeAccountForTruck(
  supabase: SupabaseClient,
  truckId: string,
): Promise<string | null> {
  const { data: truck } = await supabase.from('trucks').select('operator_id').eq('id', truckId).single()
  if (!truck?.operator_id) return null
  const { data: operator } = await supabase
    .from('operators').select('stripe_account_id').eq('id', truck.operator_id).single()
  return operator?.stripe_account_id ?? null
}
