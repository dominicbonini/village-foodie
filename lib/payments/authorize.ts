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
// ── ⚠️ A CHECKOUT SESSION, NOT A BARE PaymentIntent, AND WHY ────────────────────────────────────────
// The brief asks for "a PaymentIntent for total_minor with capture_method: 'manual' and
// metadata.order_key". That is exactly what this creates — via a Checkout Session, because a bare
// PaymentIntent has NO UI IN THIS APP to confirm it: an in-page Payment Element needs `@stripe/stripe-js`
// and `@stripe/react-stripe-js`, neither of which is installed (only the Connect packages are), plus SCA
// and network-failure handling inside a 2,700-line client component.
// `payment_intent_data` sets the properties ON the PaymentIntent the Session creates, so the intent that
// results is byte-for-byte the one the brief describes — manual capture, our metadata, our amount — and
// `session.payment_intent` hands back its id at creation so it can be attached to the draft immediately.
// The upgrade path is unchanged: swapping to a Payment Element later changes this function's return from
// a redirect URL to a client secret and touches nothing else.
//
// ── READINESS IS RE-READ HERE ──────────────────────────────────────────────────────────────────────
// Same rule /api/stripe/checkout has always applied: the client's `card_payments_ready` is a rendering
// hint. A customer holding a stale `true` from a tab left open while the truck's account was restricted
// must not be able to start a payment.
import Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveOnlineCardPayments } from '@/lib/payments/online-payments-switch'
import { attachPaymentIntent } from '@/lib/payments/order-drafts'

/** ⚠️ The same refusal /api/stripe/checkout makes, for the same reason: this build may not move real
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
  | { ok: true; url: string; paymentIntentId: string }
  /** The truck cannot take cards right now. The caller falls back to pay-at-hatch. */
  | { ok: false; reason: 'not_ready' }
  /** Something went wrong at Stripe or in this function. The caller falls back to pay-at-hatch. */
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
    truckName: string
    truckSlug: string | null
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
          `${cards.pausedAt}; falling back to pay-at-hatch`,
        )
      }
      return { ok: false, reason: 'not_ready' }
    }

    if (!Number.isInteger(args.amountMinor) || args.amountMinor <= 0) {
      return { ok: false, reason: 'error', detail: `no payable amount (${args.amountMinor})` }
    }

    const stripe = new Stripe(sandboxKey())
    const base = process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? ''
    const slug = args.truckSlug ?? args.truckId

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [{
          quantity: 1,
          price_data: {
            currency: (args.currency ?? 'GBP').toLowerCase(),
            unit_amount: args.amountMinor,
            // ⚠️ NO ORDER NUMBER. There is no order and therefore no display number — that is minted at
            // promotion, under the lock, by the same counter every other order uses. Naming the truck is
            // all this line can honestly say.
            product_data: { name: `${args.truckName} — order` },
          },
        }],
        payment_intent_data: {
          // 🔴 THE LINE THE WHOLE DESIGN RESTS ON. See the header.
          capture_method: 'manual',
          // 🔴 THE JOIN KEY, unchanged from the order-first build. The webhook has only a PaymentIntent;
          // this is how it finds the draft — and because a draft's key becomes its order's key, the same
          // metadata keeps working after promotion with nothing to migrate.
          metadata: { order_key: args.orderKey, truck_id: args.truckId, source: 'hatchgrab_online_order' },
        },
        metadata: { order_key: args.orderKey, truck_id: args.truckId },
        // 🔴 SUCCESS RETURNS THROUGH A SERVER ROUTE, NOT STRAIGHT TO THE CONFIRMATION. Under order-first
        // the order already existed and the confirmation could render immediately. It does not exist now:
        // something has to promote the draft, and the returning customer is the fastest trigger we have.
        // /api/payments/return promotes and then redirects to the SAME confirmation URL as before — so
        // the confirmation screen itself is untouched and still renders from the order row.
        success_url: `${base}/api/payments/return?draft=${args.orderKey}&truck=${encodeURIComponent(slug)}`,
        // ⚠️ CANCEL CANNOT GO TO /order/{key}/manage ANY MORE — there is no order to manage. A customer
        // who abandoned at the card form has a draft, which expires and is cancelled without their
        // involvement, so they are returned to the menu with their basket intact.
        cancel_url: `${base}/trucks/${encodeURIComponent(slug)}/order?payment=abandoned`,
        // ⚠️ NO application_fee_amount. Omitted, never zero — a positive integer is required, so "no fee"
        // is expressed by absence. Unchanged from /api/stripe/checkout.
      },
      // 🔴 The connected account. Without this the charge would be created on the PLATFORM account,
      // making HatchGrab merchant of record — the one thing the model forbids.
      { stripeAccount: operator.stripe_account_id },
    )

    const paymentIntentId = typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null

    if (!session.url || !paymentIntentId) {
      console.error(
        `[authorize] 🔴 session created without a url or intent for draft=${args.orderKey} ` +
        `(url=${!!session.url} pi=${paymentIntentId}) — cannot proceed`,
      )
      return { ok: false, reason: 'error', detail: 'session incomplete' }
    }

    // 🔴 ATTACHED BEFORE THE CUSTOMER IS SENT ANYWHERE. If this write is skipped and the customer pays,
    // the draft has no intent id — and the cancellation sweep, which finds work by payment_intent_id,
    // would never see the money. The webhook could still promote via metadata, but a failure there would
    // leave an orphaned hold nothing can name. Attaching first makes that impossible.
    // ⚠️ `livemode` from the SESSION, which is Stripe's own statement about the key that created it —
    // never from an sk_test_/sk_live_ prefix or NODE_ENV, the same rule order_payments.livemode follows.
    const attached = await attachPaymentIntent(supabase, {
      orderKey: args.orderKey,
      paymentIntentId,
      livemode: session.livemode === true,
    })
    if (!attached) {
      console.error(
        `[authorize] 🔴 could not attach pi=${paymentIntentId} to draft=${args.orderKey} — REFUSING to ` +
        `send the customer to pay, because an authorisation this system cannot name is worse than no ` +
        `card payment. Falling back to pay-at-hatch.`,
      )
      return { ok: false, reason: 'error', detail: 'intent not attached to draft' }
    }

    console.log(
      `[authorize] session=${session.id} draft=${args.orderKey} truck=${args.truckId} ` +
      `account=${operator.stripe_account_id} amount_minor=${args.amountMinor} capture_method=manual`,
    )
    return { ok: true, url: session.url, paymentIntentId }
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
