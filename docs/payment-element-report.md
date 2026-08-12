# Replacing hosted Checkout with an in-page Payment Element — the map

**Date:** 11 August 2026
**READ-ONLY. No file changed, no file created except this report. No `next dev`, no `next build`. No commit, no deploy. No fix proposed or applied — this is the map, as asked.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE FIVE THINGS THAT SHAPE THE WORK

1. ✅ **THE ROUTE ITSELF IS THE SMALL PART.** Of 173 lines, **129 are unchanged** — the order read, both readiness gates, the kill switch, the amount, the sandbox key guard. **Only the ~26-line `sessions.create` call changes**, and its own header already says so: *"swapping to a Payment Element later changes this route's response from a redirect URL to a client secret and touches nothing else."*
2. ✅ **THE WEBHOOK NEEDS NO CHANGE AT ALL.** It reads `pi.metadata.order_key` off the **PaymentIntent**, which is exactly where a directly-created PI carries it. Today's route already sets it via `payment_intent_data.metadata` **precisely so the intent, not the session, holds the join key.**
3. 🔴 **TWO NPM PACKAGES ARE MISSING** — `@stripe/stripe-js` and `@stripe/react-stripe-js`. Only the **Connect** variants are installed. **The publishable key is set but read only by the operator PaymentsTab.**
4. 🔴 **`return_url` IS UNAVOIDABLE, AND THE ONLY ROUTE THAT COULD SERVE IT IS THE CANCELLATION PAGE.** The rich confirmation is a `submitted` state with **no URL**. So the residual-redirect case lands exactly where hosted Checkout lands today — the problem is not removed, only narrowed to 3DS and redirect methods.
5. 🔴 **THE PAGE HAS NO STATE THAT ASSUMES UNMOUNT — but `basket` is IN-MEMORY ONLY.** Today the navigation is what destroys it. Staying on the page means the basket survives a completed payment, which is new behaviour nothing currently handles.

---

## 1. `app/api/stripe/checkout/route.ts` IN FULL

**Source: QUOTED.** All 173 lines.

```ts
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
      .select('id, name, operator_id, online_payments_paused_at')
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
        success_url: `${base}/order/${order.order_key}/manage?paid=1`,
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
```

⚠️ **Note what the route does NOT do:** no `capture_method` (so immediate capture), no `expires_at` (so Stripe's default session lifetime), no `customer`, no `receipt_email`, no idempotency key.

---

## 2. The client call site and every outcome

**Source: QUOTED.** `app/trucks/[slug]/order/page.tsx:1205-1229`:

```tsx
      // ── 🔴 THE ORDER NOW EXISTS. ONLY NOW IS A CARD OFFERED. ─────────────────────────────────────
      // Order-first is forced, not chosen: place_order_atomic books production capacity in the same
      // transaction as the order, so paying first would need slot reservation that does not exist.
      // ⚠️ EVERY FAILURE BELOW FALLS THROUGH TO THE NORMAL CONFIRMATION, which says "Pay at the truck".
      // The order is real and unpaid either way, so the worst outcome of a Stripe problem is the
      // behaviour this page had yesterday — never a customer left believing a payment is in flight.
      if (payByCard && truck?.card_payments_ready && data.orderKey) {
        try {
          const pay = await fetch('/api/stripe/checkout', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderKey: data.orderKey }),
          })
          const payData = await pay.json().catch(() => ({}))
          if (pay.ok && payData.url) {
            // Leaves the site for Stripe's hosted page and returns to /order/{key}/manage.
            window.location.href = payData.url as string
            return
          }
          console.error('[order] card payment unavailable, falling back to Pay at the truck:', payData?.error)
        } catch (payErr) {
          console.error('[order] card payment could not start, falling back to Pay at the truck:', payErr)
        }
        // ⚠️ TOLD, NOT HIDDEN. The order is placed; only the card step failed.
        setCardFallbackNotice(true)
      }
```

**And the notice it sets, `:1391-1403`:**

```tsx
          {cardFallbackNotice && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mb-4 text-left">
              <p className="text-xs text-amber-700">
                We couldn’t start the card payment, so your order is set to pay at the truck instead.
                Your order is placed — nothing has been charged.
              </p>
            </div>
          )}
```

### Every outcome, and what the customer sees

| Outcome | Response | `window.location.href`? | What the customer sees |
|---|---|---|---|
| **Session created** | `200 { url }` | ✅ **YES — leaves the site** | Stripe's hosted page, then `/order/{key}/manage` |
| 🔴 **409 `notReady`** — un-ready account **or the operator's pause** | `409 { error, notReady }` | no — `pay.ok` false | **The full confirmation card**, `Payment: Pay at the truck`, **plus the amber notice** |
| **409 no payable amount** | `409 { error }` | no | identical to above |
| **409 order cancelled** | `409 { error }` | no | identical to above |
| **404 order not found** | `404 { error }` | no | identical to above |
| **500 Stripe threw** | `500 { error }` | no | identical to above |
| **502 session without a URL** | `502 { error }` | no | identical to above |
| **Network failure / non-JSON** | — | no — the `catch` | identical to above |
| ⚠️ **`{ alreadyPaid: true }`** | `200`, **no `url`** | 🔴 **no** | 🔴 **the amber "we couldn't start the card payment" notice — WHICH IS WRONG.** `pay.ok` is true but `payData.url` is undefined, so it falls to `setCardFallbackNotice(true)` |

🔴 **THE `alreadyPaid` BRANCH IS A LATENT COPY DEFECT.** A paid order is told *"nothing has been charged"*. Unreachable today (the client only calls this once, immediately after creating the order) but it is a real hole in the outcome map and any redesign inherits it.

⚠️ **Every non-success outcome produces the SAME screen.** The customer cannot tell a paused truck from a Stripe outage — deliberate, and the route's own comment says so.

---

## 3. What the route would have to change

**Source: QUOTED** for what exists; **INFERRED** for the mapping, from the installed SDK's type definitions.

### Parameter-by-parameter

| Sent to `sessions.create` today | Equivalent on `paymentIntents.create`? | Where it lives |
|---|---|---|
| `mode: 'payment'` | 🔴 **NONE, and none needed** | A PaymentIntent has no modes — it is the payment |
| `line_items[].price_data.currency` | ✅ **`currency`** | top-level |
| `line_items[].price_data.unit_amount` | ✅ **`amount`** | top-level. ⚠️ **`amountMinor` is computed identically; only the field name moves** |
| `line_items[].price_data.product_data.name` — *"Pizzeria Gusto — order #7"* | 🔴 **NO DIRECT EQUIVALENT** | Nearest: **`description`** (a plain string on the intent) or `statement_descriptor_suffix`. ⚠️ **The line-item structure is lost** — a PI has no line items. Today it is one synthetic line anyway, so nothing real is lost |
| 🔴 **`payment_intent_data.metadata`** | ✅ **`metadata`** — **directly on the intent** | top-level. 🔴 **This is the join key and it becomes SIMPLER: today it is nested one level to force it onto the intent; directly it is just `metadata`** |
| `metadata` (on the Session) | 🔴 **NO EQUIVALENT — and none needed** | There is no Session. **Nothing reads it today** — the webhook reads the intent's copy |
| 🔴 **`success_url`** | 🔴 **NO EQUIVALENT ON CREATE** | ⚠️ **Becomes `return_url`, passed at CONFIRM time by `stripe.confirmPayment()` in the browser, not by this route.** See §7 |
| 🔴 **`cancel_url`** | 🔴 **NO EQUIVALENT AT ALL** | ⚠️ **The concept disappears.** "Cancel" becomes "the customer did not submit the form" — there is no navigation to intercept |
| 🔴 **`{ stripeAccount }` request option** | ✅ **IDENTICAL — unchanged** | Second argument to `paymentIntents.create(params, options)`. 🔴 **This is what makes it a direct charge and it is the one thing that must not move** |
| 🔴 **`application_fee_amount`** | ✅ **EXISTS on the intent** — `PaymentIntents.d.ts:180`, `application_fee_amount: number \| null` | 🔴 **NOT SENT TODAY AND MUST STAY ABSENT.** Same rule: positive integer or omitted, never zero |
| **`on_behalf_of`** | ✅ **EXISTS** — `PaymentIntents.d.ts:270`, `on_behalf_of: string \| Account \| null` | 🔴 **NOT SENT TODAY AND NOT NEEDED.** It is the DESTINATION-CHARGE mechanism, for when the platform creates the charge on its own account and attributes it elsewhere. **A direct charge already puts the charge on the truck's account** via `stripeAccount`. Using both would be redundant at best |
| **`transfer_data`** | ✅ **EXISTS** — `PaymentIntents.d.ts:336`, `transfer_data?: PaymentIntent.TransferData \| null` | 🔴 **NOT SENT TODAY AND MUST NOT BE.** It is for **destination charges** — money lands on the platform and is transferred out. 🔴 **That is the exact model this architecture forbids**, and adding it would make HatchGrab merchant of record |
| — | 🆕 **`automatic_payment_methods: { enabled: true }`** | **NEW, and required** for a Payment Element to render more than raw card fields. `PaymentIntents.d.ts:184` |
| — | 🆕 **`client_secret`** on the RESPONSE | 🔴 **What the route returns instead of `session.url`.** The route's own header predicted this |

### 🔴 The three structural consequences

1. **The response shape changes** from `{ url }` to `{ clientSecret }`. **The client's `if (pay.ok && payData.url)` branch and its `window.location.href` both go.**
2. 🔴 **The client secret must be usable by a browser talking to the CONNECTED account.** The server-side `{ stripeAccount }` puts the intent there; the browser's `loadStripe(pk, { stripeAccount })` must match. **Not established** whether the platform publishable key plus a `stripeAccount` option is the correct client-side pairing for a direct charge — that is a Stripe-documentation question I did not verify.
3. **Everything above `stripe.checkout.sessions.create` is untouched** — 129 of 173 lines, including both readiness gates, the kill switch, the amount, the sandbox refusal and every error return.

---

## 4. The order page's structure

**Source: QUOTED.** `app/trucks/[slug]/order/page.tsx` — **2,750 lines**, `'use client'`, **61 `useState` calls**, **12 `useEffect`s**.

### Top-level shape

| Lines | What |
|---|---|
| **1-157** | imports, types, and **four module-scope helper components** (each with its own early return: `:84`, `:120`, `:124`) |
| **158-167** | `export default function OrderPage({ params })`, `use(params)`, `useSearchParams` |
| **168-195** | the sticky-stack geometry |
| **196-300** | 🔴 **the state block** — `truck`, `menu`, `events`, `event`, `basket`, `submitted*`, and at **233-247 the PAY BY CARD state**: `payByCard`, `cardFallbackNotice` |
| **301-587** | 12 effects — scroll/resize, the 30 s clock tick, the events fetch (`:449-515`), the menu fetch (`:527-537`), the 30 s menu poll (`:556-586`) |
| **588-1116** | derived data — basket, grouped menu, upsells, deals, totals, ASAP, backward-fit |
| **1117-1243** | 🔴 **`handleSubmit`** — and **1205-1229 is the card branch** |
| **1245-1468** | **the render branches** |
| **1469-2750** | the main form |

### 🔴 The render branches — four, in order, all early returns

```
  :1246  if (loading) return <Shell>…Loading menu…</Shell>
  :1248  if (error && !submitted) return ( … page-replacing error … )
  :1283  if (submitted) return ( … THE CONFIRMATION, lines 1283-1417 … )
  :1469  return ( … THE MAIN FORM, lines 1469-2750 … )
```

### 🔴 WHERE A NEW PAYMENT UI WOULD SIT — and it is a FIFTH branch, not a modification

The card branch today is **inside `handleSubmit`**, not in the render tree at all — it is an imperative `fetch` followed by `window.location.href`. **A Payment Element has to be rendered**, so it needs somewhere to live:

| Option | Where | Consequence |
|---|---|---|
| **A fifth early return**, e.g. `if (payingClientSecret) return (…)` between `:1283` and `:1469` | before the main form | ✅ **The form unmounts while paying** — closest to today's behaviour, and the pattern the file already uses four times |
| **Inline in the main form**, near the Place-order button (`:2312-2350`) | inside 1,280 lines of JSX | ⚠️ The basket stays on screen behind the payment fields |
| **A modal over either** | anywhere | ⚠️ New overlay, new focus management, new dismiss semantics |

### ✅ IT CAN BE A SEPARATE COMPONENT — and the codebase already has the precedent

🔴 **`<Elements>` requires a provider wrapping the element, so the payment UI is naturally its own subtree.** It needs only: the client secret, the amount, and callbacks for success/failure. **It does not need the basket, the menu, the events or any of the 61 state values.**

⚠️ **The precedent is `components/manage/PaymentsTab.tsx`**, which already wraps Stripe's Connect components in a provider inside this codebase — the same shape, a different package.

⚠️ **The four module-scope helper components at `:84-157`** show the file's own convention for extracting a subtree, though a payment component would belong in `components/` rather than inline.

---

## 5. Dependencies

**Source: QUOTED.** `package.json` in full:

```
dependencies:
  @aparajita/capacitor-biometric-auth: ^10.0.0     @capacitor/preferences: ^8.0.1
  @capacitor-community/keep-awake: ^8.0.1         @capacitor/push-notifications: ^8.1.1
  @capacitor/android: ^8.3.4                      @capacitor/status-bar: ^8.0.2
  @capacitor/app: ^8.1.0                          @google/generative-ai: ^0.24.1
  @capacitor/cli: ^8.3.4                          @sparticuz/chromium: 148.0.0
  @capacitor/core: ^8.3.4                         🔴 @stripe/connect-js: ^3.4.6
  @capacitor/ios: ^8.3.4                          🔴 @stripe/react-connect-js: ^3.4.4
  @capacitor/local-notifications: ^8.2.0          @supabase/ssr: ^0.10.3
  @capacitor/network: ^8.0.1                      @supabase/supabase-js: ^2.105.1
  @types/leaflet: ^1.9.21                         @types/papaparse: ^5.5.2
  @upstash/ratelimit: ^2.0.8                      @upstash/redis: ^1.38.0
  dotenv: ^17.2.3                                 googleapis: ^171.1.0
  leaflet: ^1.9.4                                 next: 16.1.6
  papaparse: ^5.5.3                               posthog-js: ^1.359.1
  puppeteer: ^24.36.1                             puppeteer-core: 24.43.1
  qrcode: ^1.5.4                                  react: 19.2.3
  react-dom: 19.2.3                               react-leaflet: ^5.0.0
  rrule: ^2.8.1                                   🔴 stripe: ^22.4.0

devDependencies:
  @anthropic-ai/claude-code: ^2.1.177   @tailwindcss/postcss: ^4   @types/node: ^20
  @types/qrcode: ^1.5.6                 @types/react: ^19          @types/react-dom: ^19
  eslint: ^9                            eslint-config-next: 16.1.6 tailwindcss: ^4
  typescript: ^5
```

### 🔴 NEITHER IS PRESENT

| Package | In `package.json`? | Installed? |
|---|---|---|
| 🔴 **`@stripe/stripe-js`** | 🔴 **NO** | 🔴 **NO** — `ls node_modules/@stripe` returns only `connect-js`, `react-connect-js` |
| 🔴 **`@stripe/react-stripe-js`** | 🔴 **NO** | 🔴 **NO** |
| `@stripe/connect-js` | ✅ `^3.4.6` | ✅ — **the OPERATOR onboarding components, a different product** |
| `@stripe/react-connect-js` | ✅ `^3.4.4` | ✅ — same |

### The server SDK

```
$ cat node_modules/stripe/VERSION      → 22.4.0
$ require('stripe/package.json').version → 22.4.0
package.json declares                  → stripe: ^22.4.0
```

✅ **`stripe@22.4.0`, and its `PaymentIntents.d.ts` carries every parameter §3 needs** — `application_fee_amount` (:180), `automatic_payment_methods` (:184), `on_behalf_of` (:270), `transfer_data` (:336), `return_url` (:729).

⚠️ **`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` IS SET** in `.env.local`, but is read by only two places: `lib/stripe/connect.ts:397-398` and `components/manage/PaymentsTab.tsx:173` — **both operator-facing.** No customer-facing code reads it.

---

## 6. Webhook correlation — today, and after

**Source: QUOTED.** `app/api/webhooks/stripe/route.ts:337-343`:

```ts
    const pi = (event as { data?: { object?: Record<string, unknown> } }).data?.object
    const piId = typeof pi?.id === 'string' ? pi.id : null
    const amountReceived = typeof pi?.amount_received === 'number' ? pi.amount_received : null
    const metadata = (pi?.metadata ?? {}) as Record<string, unknown>
    const orderKey = typeof metadata.order_key === 'string' ? metadata.order_key : null
```

🔴 **THE WEBHOOK READS `metadata.order_key` OFF THE PAYMENTINTENT — `event.data.object` on a `payment_intent.succeeded`. It never sees a Session.**

### Where metadata is set, in each case

| | Where it is set | What the intent carries |
|---|---|---|
| **TODAY (Checkout Session)** | 🔴 **`payment_intent_data.metadata`** — nested, so Stripe copies it onto the intent it creates | `{ order_key, truck_id, source: 'hatchgrab_online_order' }` |
| | ⚠️ **also `metadata` on the Session** — a second, separate copy | 🔴 **NOTHING READS IT.** The webhook subscribes to `payment_intent.succeeded`, not `checkout.session.completed` |
| **AFTER (direct PaymentIntent)** | ✅ **`metadata`, top-level on `paymentIntents.create`** | **identical object** |

### 🔴 SO: WHAT WOULD CHANGE IN THE WEBHOOK? NOTHING.

✅ **Not one line.** The intent carries the same `metadata.order_key`; the route already sets it there **deliberately**, and its comment says why:

```ts
        // 🔴 THE JOIN KEY. The webhook has only a PaymentIntent; this is how it finds the order. It is
        // set on the PaymentIntent (not just the Session) because `payment_intent.succeeded` is the
        // event we act on, and it carries the intent's metadata, not the session's.
```

✅ **The change removes one indirection.** `payment_intent_data.metadata` (nested, a Checkout-only mechanism for reaching the intent) becomes plain `metadata`. **The Session-level copy is dropped and nothing notices.**

⚠️ **`external_ref` is unaffected** — `recordOnlineCardPayment` keys on `paymentIntentId`, and a directly-created intent has the same `pi_…` shape.

⚠️ **One thing to keep:** the intent must still be created **on the connected account** (`{ stripeAccount }`), because the webhook subscribes on the `@accounts` scope. **A PI created on the platform account would not deliver to that destination at all.**

---

## 7. `return_url` — the residual redirect

**Source: QUOTED** for what exists; **INFERRED** for the sizing.

### It cannot be avoided

`PaymentIntents.d.ts:364`:

> *"Redirect-based payment methods may require your customer to be redirected to a payment method's app or site for authentication or additional steps. To confirm this PaymentIntent, you may be required to provide a `return_url` to redirect customers back to your site after they authenticate or complete the payment."*

⚠️ **`return_url` is passed at CONFIRM time, in the browser**, not by the server route.

### 🔴 WHAT COULD IT POINT AT? — the candidates, and they are thin

| Candidate | Is it a route? | Verdict |
|---|---|---|
| 🔴 **The `submitted` confirmation** | 🔴 **NO — `if (submitted) return (…)` at `:1283`, a component state with NO URL** | 🔴 **UNUSABLE.** Same wall hosted Checkout hit |
| ✅ **`/order/{order_key}/manage`** | ✅ **YES** | ⚠️ **Available — and it is exactly where `success_url` points today.** So the residual case lands **in the same place, on the same cancellation page**, with the same `canCancel`-ignores-`payment_status` problem |
| **`/trucks/{slug}/order`** | ✅ YES | 🔴 **A fresh, empty form.** The basket is in-memory (§10) and would be gone; the customer would see the order page as if nothing happened |
| **`/trucks/{slug}/order?paid={order_key}`** | ⚠️ **would have to be BUILT** | The order page would need a new branch that reads the param and fetches the order — effectively §A's missing confirmation route, reached by query string |

### 🔴 HOW LARGE IS THE RESIDUAL CASE?

⚠️ **Two populations, and only one is avoidable:**

| Trigger | Avoidable? |
|---|---|
| **3DS / SCA challenge on a card** | 🔴 **NO.** Issuer-driven. ⚠️ **In the UK, SCA makes this common rather than rare** — but Stripe's 3DS is usually an **iframe modal**, and `return_url` is the fallback when it cannot be. **Not established** what proportion actually redirects |
| **Redirect-based methods** (iDEAL, Bancontact, Klarna…) | ✅ **YES — by not enabling them.** They arrive through `automatic_payment_methods`, so restricting `payment_method_types` to `['card']` removes this population entirely |

🔴 **THE HONEST SUMMARY: an in-page element removes the redirect for the ordinary card path and NARROWS — never eliminates — the redirect for 3DS.** `return_url` must be a real, reachable URL that renders something sensible, and **the only existing candidate is the cancellation page.**

---

## 8. Removal inventory — every Checkout Session reference

**Source: QUOTED.** A repo-wide grep for `checkout.sessions`, `checkout/route`, `Checkout Session`, `success_url`, `cancel_url`, `stripe/checkout`, `hosted Checkout`.

### 🔴 CODE — must change

| File | Lines | What |
|---|---|---|
| 🔴 **`app/api/stripe/checkout/route.ts`** | **the whole file** | `sessions.create`, `success_url`, `cancel_url`, `session.url`, two log lines naming `session=` |
| 🔴 **`app/trucks/[slug]/order/page.tsx`** | `:1213` the fetch, `:1218-1221` the `url` branch and `window.location.href`, `:55` the hint comment | |
| ⚠️ **`app/order/[id]/manage/page.tsx`** | `:154-155` | A comment explaining the page is where `success_url` and `cancel_url` both land. 🔴 **Becomes false if nothing redirects there** |
| ⚠️ **`app/api/orders/[id]/route.ts`** | `:67` | *"…from Stripe's cancel_url, from a bookmark…"* — a comment justifying reading `payment_status` from the row |
| ⚠️ **`app/api/orders/submit/route.ts`** | `:1127` | *"/api/stripe/checkout takes it"* — a comment on why `orderKey` is returned |
| ⚠️ **`app/api/menu/[truckId]/route.ts`** | `:664` | comment naming the route as the authoritative gate |
| ⚠️ **`app/api/dashboard/route.ts`** | `:678` | same |
| ⚠️ **`lib/payments/online-payments-switch.ts`** | `:25`, `:29` | 🔴 `:29` says *"It stops a NEW Checkout Session being created"* — **would need rewording**; `:25` names the route's named select |
| ⚠️ **`supabase/migrations/20260811_trucks_online_payments_paused_at.sql`** | `:26`, `:37` | 🔴 **The kill-switch REMOVAL LIST names `app/api/stripe/checkout/route.ts`.** If the file is replaced, that list is stale |
| ⚠️ **`supabase/migrations/20260811_operators_stripe_account_livemode.sql`** | `:7`, `:57` | names the route as a live-key refuser and a named `operators` reader |

### ✅ NO CHANGE NEEDED

- 🔴 **`app/api/webhooks/stripe/route.ts` — ZERO references.** A grep finds none. It never knew about Sessions (§6)
- **`lib/payments/online.ts`, `lib/payments/ledger.ts`** — key off the PaymentIntent id
- **`components/dashboard/types.ts`** — no reference
- 🔴 **No tests reference Checkout.** There is no test suite in this repository

### 📄 DOCS — 30+ references across 9 files

`docs/payments-killswitch-report.md`, `docs/payments-killswitch-build-report.md`, `docs/order-page-routing-report.md`, `docs/account-mode-report.md`, `docs/payments-report.md`, `docs/authorize-capture-report.md`, `docs/confirmation-and-testmode-report.md`, `docs/killswitch-gate-report.md`, `docs/price-authority-report.md`, and **`docs/reference-manual.md` at `:55`, `:71`, `:3996`, `:4705`, `:4722`, `:5797`, `:6320`, `:6438`, `:6485`, `:6494`**.

⚠️ **Most are DATED REPORTS and should NOT be rewritten** — they record what was true when written. 🔴 **The reference manual is the exception**: `:6320` states *"A real sandbox card payment works end to end via hosted Checkout"* and `:6438` explains why `success_url` cannot reach the confirmation. **Those are current-state claims and would go stale.**

⚠️ **`docs/reference-manual.md:4722`** is a backlog item — *"Cheapest partial mitigation: set `expires_at` on the Checkout Session"* — which **evaporates**: a PaymentIntent has no session to expire.

---

## 9. What the customer sees between pressing pay and completion

**Source: QUOTED.** The only existing state is `submitting`.

```tsx
  const [submitting, setSubmitting] = useState(false)
```

**The button, `:2329-2331`:**

```tsx
                disabled={submitting || isOrderingBlocked || !hasItems || !name || !emailValid || !phoneValid || (truck?.mode === 'village' && !selectedSlot && !asapChosen) || (!eventLoading && !event)}
                …
                {submitting ? 'Placing order...' : isClosed ? 'Ordering has closed' : … : 'Place order'}
```

**And its lifecycle, `:1242`:** `finally { setSubmitting(false) }`.

### 🔴 TODAY — the sequence, and there is a gap in it

| Step | What the customer sees |
|---|---|
| 1. Press "Place order" | button → **"Placing order..."**, disabled |
| 2. `/api/orders/submit` (the atomic RPC, the lock, emails, push) | **still "Placing order..."** |
| 3. `/api/stripe/checkout` | 🔴 **STILL "Placing order..." — there is NO separate payment state.** The card step is invisible |
| 4. `window.location.href = payData.url` | 🔴 **A BROWSER NAVIGATION.** Whatever the browser shows between unload and Stripe's page — typically a blank white page |
| 5. Stripe's hosted page | Stripe's own UI and spinners — **not ours** |
| 6. Return | `/order/{key}/manage`, its own *"Loading your order..."*, then the cancellation card |

🔴 **THERE IS NO LOADING OR PENDING STATE FOR THE PAYMENT ITSELF. `submitting` covers order creation and happens to still be true when the navigation fires.** Step 4 is unstyled browser behaviour we do not control.

### With an in-page element — INFERRED

| Step | What would change |
|---|---|
| 1-2 | ⚠️ **unchanged** — the order is still created first |
| 3 | Instead of a redirect, the **client secret returns and a payment UI renders** |
| 3a | 🆕 **A NEW state is REQUIRED** — `confirmPayment()` is async and can take seconds. `submitting` is already false by then |
| 4 | 🔴 **No blank navigation.** ✅ **This is the win** |
| 5 | 3DS as an **iframe modal** where possible — the customer stays on the page |
| 6 | ⚠️ **A NEW SUCCESS STATE IS NEEDED.** `setSubmitted(true)` fires today **whatever happens to the card**, so the confirmation's hardcoded *"Payment: Pay at the truck"* would be **wrong** for a card that just succeeded in place |

🔴 **SO THE UI WORK IS NOT ONLY THE ELEMENT.** Three states that do not exist today are required: **payment-in-flight**, **payment-succeeded**, and **payment-failed-but-order-placed** (which `cardFallbackNotice` half-covers).

---

## 10. What breaks if the customer never navigates away

**Source: QUOTED** for every mechanism; **INFERRED** for the consequence.

### ✅ Nothing has an unmount-dependent cleanup that misbehaves

**All seven cleanups are symmetric and correct:**

```
  :193  return () => ro.disconnect()                              ResizeObserver
  :299  return () => observer.disconnect()                        IntersectionObserver
  :309  return () => { window.removeEventListener('scroll', …)    scroll/resize/orientation
  :421  return () => clearInterval(id)                            30s clock tick
  :445  return () => document.removeEventListener('visibilitychange', onVisible)
  :515  return () => { cancelled = true }                         events fetch
  :585  return () => clearInterval(id)                            30s /api/menu poll
```

⚠️ **A grep for `beforeunload` returns NOTHING**, so nothing warns on navigation and nothing depends on it.

### 🔴 BUT FOUR THINGS BEHAVE DIFFERENTLY WHEN THE PAGE SURVIVES

**1. 🔴 THE BASKET IS IN-MEMORY ONLY, AND THE NAVIGATION IS WHAT CLEARS IT**

```tsx
  const [basket, setBasket] = useState<BasketItem[]>([])
```

**A grep for `localStorage` / `sessionStorage` in this file returns NOTHING.** Today the redirect destroys it. **Staying on the page means the basket is still populated after a successful payment** — the confirmation branch renders it as the receipt (`:1335`), which is correct, but **if the customer dismisses that branch the form returns with their paid basket still in it.**

⚠️ **The "Back to {truck}" button is a full `<a href>`, deliberately** (`:1411`), *"A full navigation reloads a fresh form — the confirmation shares this URL"*. **That is the only thing clearing the basket today, and it is a link the customer has to press.**

**2. 🔴 THE 30-SECOND `/api/menu` POLL KEEPS RUNNING**

```tsx
  useEffect(() => {
    if (!event?.id || eventEnded) return
    const id = setInterval(async () => {
      … fetch(`/api/menu/${slug}?event_id=${event.id}`, { cache: 'no-store' })
      … if (r.status === 404 && (body?.event_status === 'closed' …)) setEventEnded(true)
    }, 30000)
```

🔴 **It is gated on `event?.id && !eventEnded`, NOT on `submitted`.** Today the navigation stops it. **Staying means it polls indefinitely on the confirmation screen — and could flip `eventEnded` mid-payment**, which the payment UI would have to be immune to.

**3. The 30-second clock tick keeps running**

```tsx
    const id = setInterval(() => setNowTick(t => t + 1), 30000)
```

⚠️ **Ungated entirely.** It drives ASAP recomputation over a basket that has already been ordered — harmless but pointless, and it re-renders the tree every 30 s during payment.

**4. ⚠️ The `visibilitychange` slots refetch keeps running**

```tsx
    document.addEventListener('visibilitychange', onVisible)
```

Refetches slots when the tab is refocused. **Gated on `truck?.id`, not on `submitted`.** ⚠️ **If 3DS opens a modal or an app switch, returning focus fires a slots refetch mid-payment.**

### 🔴 AND THE ONE THAT IS NOT A CLEANUP

```tsx
      setSubmitted(true)
```

**Called at `:1239` on EVERY path that reaches it — including after `setCardFallbackNotice(true)`.** Today the card-success path `return`s at `:1221` **before** it. 🔴 **Remove the redirect and `setSubmitted(true)` becomes reachable on the card-success path, rendering the confirmation with its hardcoded `Payment: Pay at the truck` for an order that was just paid by card.**

---

## Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — all 173 lines |
| 2 | **QUOTED** — the call site and the notice. The outcome table is **QUOTED** per branch; the `alreadyPaid` defect is **INFERRED** from the quoted condition |
| 3 | **QUOTED** for what is sent today and for each parameter's existence in `PaymentIntents.d.ts`. The mapping is **INFERRED**; the client-side `stripeAccount` pairing is **not established** |
| 4 | **QUOTED** — line ranges, branch list, state block, counts |
| 5 | **QUOTED** — `package.json`, `node_modules/stripe/VERSION`, and a **negative `ls`** on `node_modules/@stripe` |
| 6 | **QUOTED** — the webhook's read and both metadata sites. "Nothing changes" is **INFERRED** from those quotes |
| 7 | **QUOTED** — the SDK's own `return_url` note and the candidate routes. The 3DS frequency is **not established** |
| 8 | **QUOTED** — an exhaustive grep, every hit classified |
| 9 | **QUOTED** for today's states; the after-state is **INFERRED** |
| 10 | **QUOTED** — all seven cleanups, the basket declaration, the negative storage grep, and `setSubmitted(true)`. Consequences are **INFERRED** |

## Not established

- **Whether a platform publishable key plus a client-side `stripeAccount` option is the correct pairing** for confirming a direct-charge PaymentIntent in the browser. A Stripe-documentation question I did not verify.
- **What proportion of UK card payments actually redirect for 3DS** rather than resolving in an iframe modal.
- **Whether `automatic_payment_methods` would surface redirect-based methods on these connected accounts**, which depends on each account's capability set.
- **Whether any Capacitor/native surface loads the customer order page** — if it does, an in-page element inside a WebView is a separate question I did not investigate.
- **What should replace the confirmation route.** That is design, and this is the map.
