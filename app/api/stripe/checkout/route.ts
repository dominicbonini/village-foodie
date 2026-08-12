// app/api/stripe/checkout/route.ts
// Start a card payment for an order that ALREADY EXISTS.
//
// ── 🔴 ORDER FIRST. THIS ROUTE IS ONLY EVER REACHED AFTER place_order_atomic HAS COMMITTED. ─────────
// That ordering is forced, not chosen: `place_order_atomic` books production capacity in the SAME
// transaction as the order row, so paying first would need a slot-reservation system that does not
// exist, and two customers could pay for the last portion. The cost of this direction is an abandoned
// checkout leaving an unpaid order holding capacity — logged as out of scope, and visible on the
// dashboard rather than invisible in a Stripe balance.
//
// ── ⚠️ STRIPE CHECKOUT, NOT AN IN-PAGE PAYMENT ELEMENT. A DELIBERATE CHOICE, FLAGGED. ──────────────
// The brief asked for the SMALLEST end-to-end version. An in-page Payment Element needs TWO npm
// packages this project does not have (`@stripe/stripe-js`, `@stripe/react-stripe-js` — only the
// Connect ones are installed), plus a new card UI with SCA, network-failure-mid-confirm and back-button
// handling inside a 2,300-line client component. Checkout needs NO new dependency, handles SCA and
// wallets, and creates its PaymentIntent ON THE CONNECTED ACCOUNT exactly as a bare PaymentIntent would
// — which is what the webhook keys off.
// 🔴 THE TRADE, STATED: the customer leaves hatchgrab.com to pay and returns. That is the one real cost,
// and it is the upgrade path — swapping to a Payment Element later changes this route's response from a
// redirect URL to a client secret and touches nothing else, because the ledger keys off the
// PaymentIntent either way.
//
// ── 🔴 NO application_fee_amount. NOT ZERO — ABSENT. ───────────────────────────────────────────────
// The parameter must be a POSITIVE integer, so "no fee" is expressed by omitting it. This build charges
// no platform fee at all: the allowance figures exist only as display strings, nothing tracks online
// value per truck, and "period" is undefined. Every row this path writes still carries `channel:
// 'online'`, `truck_id` and `created_at`, so the ledger remains the allowance history and a fee added
// later can be computed over orders taken today. Search this file for `application_fee` — there is none.
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import Stripe from 'stripe'
import { toMinor } from '@/lib/order-repricing'
// ⚠️ TEMPORARY — delete with the online-payments switch. See the migration named in that file.
import { resolveOnlineCardPayments } from '@/lib/payments/online-payments-switch'

export const runtime = 'nodejs'

/** ⚠️ The sandbox guard lives in lib/stripe/connect.ts for the OPERATOR paths. This is a CUSTOMER path
 *  and must not import that module (it would drag the Connect helpers into the order flow), so the same
 *  refusal is made here, on the key, for the same reason: a key that starts `sk_live_` cannot be
 *  mistaken for anything else, and this build may not move real money. */
function sandboxKey(): string {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
  if (!key.startsWith('sk_test_')) {
    throw new Error('REFUSING: STRIPE_SECRET_KEY is not a sandbox key. This build may not take real payments.')
  }
  return key
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }

  const orderKey = typeof body.orderKey === 'string' ? body.orderKey : null
  if (!orderKey) return NextResponse.json({ error: 'Missing orderKey' }, { status: 400 })

  try {
    // ── The order is the authority for everything: amount, truck, and whether it is payable. ───────
    const { data: order } = await supabase
      .from('orders')
      .select('order_key, id, truck_id, total, status, payment_status')
      .eq('order_key', orderKey)
      .single()

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.status === 'cancelled') {
      return NextResponse.json({ error: 'This order has been cancelled' }, { status: 409 })
    }
    // ⚠️ Already-paid is a SUCCESS from the customer's point of view, not an error to retry into.
    if (order.payment_status === 'paid') {
      return NextResponse.json({ alreadyPaid: true })
    }

    // ── 🔴 READINESS IS RE-READ HERE. THE CLIENT'S COPY IS A RENDERING HINT AND NOTHING MORE. ──────
    // /api/menu ships `card_payments_ready` so the page knows whether to OFFER a card. A customer
    // holding a stale `true` — from a tab left open while the truck's account was restricted — must not
    // be able to start a payment. This read is the gate; that one is decoration.
    // ⚠️ TEMPORARY — `online_payments_paused_at` is the operator kill-switch and is added to this NAMED
    // select. That makes this build REQUIRE supabase/migrations/20260811_trucks_online_payments_paused_at.sql
    // TO HAVE BEEN APPLIED FIRST: PostgREST answers a named select on a missing column with 42703 and
    // fails the WHOLE statement, so `truck` would be null, the guard below would fire, and every card
    // payment on every truck would fall back to pay-at-hatch with no error anywhere. Migration, then deploy.
    const { data: truck } = await supabase
      .from('trucks')
      .select('id, name, slug, operator_id, online_payments_paused_at')
      .eq('id', order.truck_id)
      .single()
    if (!truck?.operator_id) {
      return NextResponse.json({ error: 'Card payment is not available', notReady: true }, { status: 409 })
    }

    const { data: operator } = await supabase
      .from('operators')
      .select('stripe_account_id, stripe_charges_enabled')
      .eq('id', truck.operator_id)
      .single()

    // 🔴 READINESS IS `stripe_charges_enabled`, NEVER "a row exists" and never "an account id exists".
    // An account can sit un-verified for days, and can lose charges_enabled at any time.
    // ⚠️ TEMPORARY: the operator's pause is ANDed in by the one resolver, so this route and /api/menu
    // cannot disagree about whether a card is on offer. A paused truck returns the SAME 409 notReady
    // shape as an un-ready one — deliberately, because the order page's existing fallback
    // (app/trucks/[slug]/order/page.tsx:1195-1215) already handles that shape: the order is placed
    // unpaid and the customer is told to pay at the truck. No new fallback path was built.
    const cards = resolveOnlineCardPayments(operator, truck)
    if (!operator?.stripe_account_id || !cards.offered) {
      if (cards.pausedAt) {
        console.log(
          `[stripe/checkout] order=${orderKey} truck=${truck.id} — online payments PAUSED by the operator ` +
          `since ${cards.pausedAt}; falling back to pay-at-hatch`,
        )
      }
      return NextResponse.json({ error: 'Card payment is not available', notReady: true }, { status: 409 })
    }

    const amountMinor = toMinor(Number(order.total ?? 0))
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      return NextResponse.json({ error: 'This order has no payable amount' }, { status: 409 })
    }

    const stripe = new Stripe(sandboxKey())
    const base = process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? ''

    // ── 🔴 A DIRECT CHARGE. `stripeAccount` MAKES THE TRUCK THE MERCHANT OF RECORD. ────────────────
    // The money settles to the truck's own Stripe account and never touches a HatchGrab balance. That
    // is the decided model, and it is what makes the refund copy on the order page true: we cannot
    // return money we never held.
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'gbp',
            unit_amount: amountMinor,
            product_data: { name: `${truck.name} — order #${order.id}` },
          },
        }],
        // 🔴 THE JOIN KEY. The webhook has only a PaymentIntent; this is how it finds the order. It is
        // set on the PaymentIntent (not just the Session) because `payment_intent.succeeded` is the
        // event we act on, and it carries the intent's metadata, not the session's.
        payment_intent_data: {
          metadata: { order_key: order.order_key, truck_id: truck.id, source: 'hatchgrab_online_order' },
        },
        metadata: { order_key: order.order_key, truck_id: truck.id },
        // ── 🔴 SUCCESS RETURNS TO THE CONFIRMATION, NOT TO THE CANCELLATION PAGE ──────────────────
        // It used to point at /order/{key}/manage — a 220-line cancellation page built for the "Cancel
        // your order" email link, whose only control is a red Cancel button and which renders no deals,
        // no modifiers and no savings. A customer who had just paid landed on a page offering to cancel
        // the thing they had paid for.
        // ⚠️ THE SLUG IS REQUIRED, not decorative: the confirmation lives on the truck's own order route
        // and the page passes it back to the API so an order_key from another truck cannot render under
        // this truck's header.
        // ⚠️ `?confirm=` IS AN IDENTIFIER, NEVER A CLAIM OF PAYMENT. The paid line on that screen reads
        // `orders.payment_status`, written by the webhook from Stripe's own event — this parameter says
        // only WHICH order to show. That is the lesson of `?paid=1`, which was written here and then
        // correctly ignored by every reader.
        success_url: `${base}/trucks/${truck.slug ?? truck.id}/order?confirm=${order.order_key}`,
        // ⚠️ CANCEL IS UNCHANGED AND STAYS ON THE MANAGE PAGE. A customer who ABANDONED payment has an
        // unpaid order, and the manage page's Cancel button is exactly the right thing to offer them —
        // the new paid-gate there leaves it available precisely for this case.
        cancel_url: `${base}/order/${order.order_key}/manage`,
        // ⚠️ NO application_fee_amount. See the header. Omitted, never zero.
      },
      // 🔴 The connected account. Without this header the charge would be created on the PLATFORM
      // account, making HatchGrab merchant of record — the one thing the model forbids.
      { stripeAccount: operator.stripe_account_id },
    )

    if (!session.url) {
      console.error(`[stripe/checkout] session created without a URL for order=${orderKey}`)
      return NextResponse.json({ error: 'Could not start payment' }, { status: 502 })
    }

    console.log(
      `[stripe/checkout] session=${session.id} order=${orderKey} truck=${truck.id} ` +
      `account=${operator.stripe_account_id} amount_minor=${amountMinor} (no application fee)`,
    )
    return NextResponse.json({ url: session.url })
  } catch (err) {
    // ⚠️ The order still exists and is unpaid. The customer is told plainly and falls back to paying at
    // the hatch — never left believing a card payment is in flight.
    console.error(`[stripe/checkout] FAILED order=${orderKey}:`, err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Could not start card payment' }, { status: 500 })
  }
}
