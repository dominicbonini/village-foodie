# In-page Payment Element on a directly-created PaymentIntent

**Date:** 13 August 2026
**BUILD. Nine files edited, one DELETED, zero created. No migration needed. No `next dev`, no `next build`. Nothing committed, nothing deployed.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE THREE THINGS THAT MATTER

1. ✅ **THE EXACT FAILURE THAT BROKE THE LAST ATTEMPT IS FIXED, AND PROVED.** `paymentIntents.create` returned `pi_3U3dLs2fB4PPCw2D1vaLtST5` synchronously and it landed on the draft — the field that was `null` last time.
2. 🔴 **THE FALL-THROUGH IS GONE.** Both refusal arms exercised against the real route handler: **503, and `orders on event: 0 -> 0`**. No order, no email, no lock, nothing reserved.
3. ✅ **ZERO NEW DEPENDENCIES.** Stripe.js loads from `js.stripe.com`, which is what Stripe requires anyway — `@stripe/stripe-js` is a loader around that script tag and `@stripe/react-stripe-js` a context wrapper around `elements.create()`. Neither was needed. **`package.json` is untouched.**

---

## 1. Files

| File | What |
|---|---|
| 🔴 `app/api/stripe/checkout/route.ts` | **DELETED** |
| `lib/payments/authorize.ts` | Session → `paymentIntents.create`; returns a client secret |
| `app/api/orders/submit/route.ts` | Card fork returns 503 on failure; **no fall-through** |
| `app/trucks/[slug]/order/page.tsx` | Payment Element, three stages, four gates, confirmation retry |
| `lib/payments/order-drafts.ts`, `lib/payments/online-payments-switch.ts`, `app/api/dashboard/route.ts`, `app/api/menu/[truckId]/route.ts`, `app/order/[id]/manage/page.tsx`, `app/api/orders/[id]/route.ts` | Comment-only: references to the deleted route corrected |

⚠️ **`promoteDraft`, `claimOrderDraft`, `order_drafts`, the cron sweep, the webhook and the ledger are untouched.** No migration: nothing schema-shaped changed.

---

## 2. The PaymentIntent, created directly

```ts
    const intent = await stripe.paymentIntents.create(
      {
        amount: args.amountMinor,
        currency: (args.currency ?? 'GBP').toLowerCase(),
        // 🔴 THE LINE THE WHOLE DESIGN RESTS ON. A hold, not a charge. See the header.
        capture_method: 'manual',
        metadata: { order_key: args.orderKey, truck_id: args.truckId, source: 'hatchgrab_online_order' },
        automatic_payment_methods: { enabled: true, allow_redirects: 'always' },
        // ⚠️ NO application_fee_amount, NO on_behalf_of, NO transfer_data. See the header — absence, not
        // zero, and unchanged from the Session this replaces.
      },
      { stripeAccount: operator.stripe_account_id },
    )
```

✅ **`{ stripeAccount }` is byte-identical to the Session call.** ✅ **All three fee/routing parameters are absent, not zero** — proved live in §V(a): `application_fee: null on_behalf_of: null transfer_data: null`.

**Then, before the secret leaves the function:**

```ts
    const attached = await attachPaymentIntent(supabase, {
      orderKey: args.orderKey, paymentIntentId: intent.id, livemode: intent.livemode === true,
    })
    if (!attached) { … return { ok: false, reason: 'error', detail: 'intent not attached to draft' } }
```

Returns `{ ok: true, clientSecret, paymentIntentId, stripeAccount }`. ⚠️ **`stripeAccount` is required by the browser** — a direct charge lives on the connected account, so Stripe.js must be initialised with it or the Element cannot find the intent.

---

## 3. 🔴 THE FALL-THROUGH, REMOVED

**BEFORE** — a `console.warn` and then execution continued into the lock:

```ts
        console.warn(`[submit] card authorisation unavailable for draft=… — falling through to pay-at-hatch. …`)
      } else { … }
      // ⚠️ FALL THROUGH. Not a return: the order is placed unpaid below …
    }
```

**AFTER** — every failure returns:

```ts
      if (!created.ok) {
        console.error(`[submit] draft not created for truck=${resolvedTruckId}: ${created.error}`)
        return NextResponse.json({ error: CARD_UNAVAILABLE_MESSAGE, cardUnavailable: true }, { status: 503 })
      }
      const auth = await authorizeDraft(supabase, { orderKey: draftKey, truckId: resolvedTruckId, amountMinor: serverTotalMinor })
      if (!auth.ok) {
        console.error(
          `[submit] REFUSED card order for draft=${draftKey} truck=${resolvedTruckId} — ` +
          `${auth.reason}${auth.reason === 'error' ? `: ${auth.detail}` : ''}. NO order was created, no ` +
          `email sent and nothing reserved. The draft expires and is swept.`,
        )
        return NextResponse.json({ error: CARD_UNAVAILABLE_MESSAGE, cardUnavailable: true }, { status: 503 })
      }
      return NextResponse.json({ requiresAuthorization: true, orderKey: draftKey, clientSecret: auth.clientSecret, stripeAccount: auth.stripeAccount, total: serverTotal })
    }
```

🔴 **`grep -c "FALL THROUGH" app/api/orders/submit/route.ts` → `0`.**

### 🔴 THE COPY

```ts
const CARD_UNAVAILABLE_MESSAGE =
  'We could not set up card payment just now, so your order has not been placed and you have not been ' +
  'charged. Your basket is saved — please try again, or choose Pay at the truck.'
```

> **We could not set up card payment just now, so your order has not been placed and you have not been charged. Your basket is saved — please try again, or choose Pay at the truck.**

**Three jobs, in this order:** nothing was charged (they are about to check their banking app), the order was **not** placed (so they do not turn up expecting food), and the way forward that always works.

⚠️ **503, not 500** — "the card system is unavailable right now" is temporary and retryable, not a fault in their order. The client keeps the basket and the sheet open.

---

## 4. The Payment Element

**Stripe.js, from Stripe's CDN, memoised at module scope** — one promise, so a retry after a decline cannot inject a second script tag. Typed with a hand-written structural interface (`StripeJs`, `StripeElements`, `StripeElement`), not `any`.

```tsx
        const el = elements.create('payment', {
          layout: { type: 'accordion', defaultCollapsed: false, radios: true, spacedAccordionItems: false },
          wallets: { applePay: 'auto', googlePay: 'auto' },
        })
        el.mount(paymentBoxRef.current)
        el.on('ready', () => { if (!cancelled) setPayStage('ready') })
```

✅ **Apple Pay and Google Pay render as native buttons** where the browser and device support them, decided per-visitor by Stripe from `automatic_payment_methods`.

🔴 **THEY ALSO NEED THE DOMAIN REGISTERED WITH STRIPE.** Apple Pay requires the platform domain to be registered in the Stripe Dashboard (Settings → Payment methods → Apple Pay → Add domain). **That is a Dashboard action, not code.** Without it the wallet buttons are silently absent and the card form still works. **Not done here and cannot be done from the repo.**

### The three outcomes

| Stage | Screen | Button |
|---|---|---|
| `mounting` | pulsing skeleton, "Loading secure card form…" | `Preparing…`, disabled |
| `ready` | the Element | `Pay £18.00` |
| `authorising` | Element stays | 🔴 `Authorising…`, **disabled** — a second press is how a customer gets two holds |
| `failed` | Element **stays mounted**, red panel with Stripe's own message | `Try again · £18.00` |

🔴 **THE ELEMENT IS NEVER UNMOUNTED ON FAILURE.** Unmounting would destroy the card details the customer just typed — the opposite of what a retry needs. There is also a `Back to my order` escape, hidden mid-authorisation.

**And the promise, which is now true:**

> Your card is held, not charged, until Test Kitchen confirms your order.

⚠️ The pay-at-hatch footer line changed too: **"on the next screen" is gone**, because there is no next screen.

---

## 5. `return_url`, and what a paying customer sees

```ts
    const returnUrl = `${window.location.origin}/trucks/${encodeURIComponent(slug)}/order?confirm=${encodeURIComponent(payment.orderKey)}`
    const result = await stripe.confirmPayment({ elements, confirmParams: { return_url: returnUrl }, redirect: 'if_required' })
```

⚠️ **`redirect: 'if_required'` keeps the ordinary card path entirely in-page.** Only a method that genuinely demands a redirect gets one.

### 🔴 THE ORDER MAY NOT EXIST WHEN THEY LAND. THEY MUST NOT SEE AN ERROR.

```tsx
    let attempt = 0
    const MAX_ATTEMPTS = 8
    const RETRY_MS = 1000
    const run = () => fetch(`/api/orders/${confirmOrderKey}?truck=…`, { cache: 'no-store' })
      .then(async r => {
        if (cancelled) return
        if (r.status === 404 && attempt < MAX_ATTEMPTS) {
          attempt++
          // ⚠️ NOT an error state — `confirmLoading` stays true, so the screen keeps saying it is
          // loading rather than flashing a failure and correcting itself.
          setTimeout(() => { if (!cancelled) void run() }, RETRY_MS)
          return
        }
```

**What they see:** the confirmation screen's existing **loading** state, unchanged, for up to ~8 seconds while the webhook promotes the draft — then the real confirmation. **No error flashes and is corrected.**

⚠️ **THE COST, ACCEPTED AND STATED:** a genuinely bogus order key now takes ~8 s to report "not found" instead of being instant. That is the right way round — the common case is a paying customer, and telling one of those their order does not exist would be the worst screen in the product.

---

## 6. The four unmount-dependent behaviours

| # | Behaviour | What was done |
|---|---|---|
| 🔴 **1** | **In-memory basket** | ✅ **THE CAUSE IS REMOVED, NOT COMPENSATED FOR.** Hosted Checkout navigated away with `window.location.href`; the component unmounted and `basket` — plain React state, never persisted — was gone. **There is no navigation on the ordinary card path now**, so the component never unmounts and the basket simply stays. A decline leaves it intact |
| **2** | **`visibilitychange` → `fetchSlots`** — *the one a 3DS modal trips* | 🔴 **Gated inside `fetchSlots` itself**, so neither the effect nor the listener can be added to without inheriting it. Uses a **ref**, not the boolean: `fetchSlots` is captured by a listener closure that only re-attaches when its own deps change, and a ref is read live at call time so the gate cannot go stale |
| **3** | **30-second clock tick** | Gated on `paying`. It re-derives the ASAP estimate; moving the collection time under a card form the customer is filling in would change what they agreed to |
| **4** | **30-second menu poll** | Gated on `paying`. It can set `eventEnded`, which replaces the form — tearing the Element out from under a customer mid-payment, while an authorisation already in flight still succeeds at Stripe |

```tsx
  const payingRef = useRef(false)
  useEffect(() => { payingRef.current = paying }, [paying])
```

⚠️ **Gates 3 and 4 resume if the customer presses "Back to my order".**

---

## V. VERIFICATION

⚠️ **WRITES WERE UNAVOIDABLE AND ARE DECLARED:** draft rows, one Stripe PaymentIntent (sandbox), and one real order for (d). **All cleaned up; residue proved below.** (b)–(d) were exercised by **importing the real route handler and calling `POST(new Request(...))`** — no dev server.

### (a) 🔴 THE INTENT ID IS AVAILABLE AT CREATION AND LANDS ON THE DRAFT

```
minted order_key (client-side, before anything exists): ad7a8497-25e5-47ba-a40a-056da388ceee
draft created: yes
  payment_intent_id immediately after createOrderDraft: null

authorizeDraft -> ok:true
  clientSecret   : pi_3U3dLs2fB4PPCw2D1vaLtST5_secr…   (present: true )
  paymentIntentId: pi_3U3dLs2fB4PPCw2D1vaLtST5
  stripeAccount  : acct_1U30w22fB4PPCw2D

🔴 THE DRAFT AFTER AUTHORISATION — the exact field that was null last time:
  payment_intent_id: "pi_3U3dLs2fB4PPCw2D1vaLtST5"
  livemode         : false
  promoted_at      : null

PASS - the intent id existed at creation and is ON the draft

THE INTENT AT STRIPE:
  status         : requires_payment_method
  capture_method : manual
  amount         : 650  received: 0  capturable: 0
  metadata       : {"order_key":"ad7a8497-25e5-47ba-a40a-056da388ceee","source":"hatchgrab_online_order","truck_id":"test-truck"}
  application_fee: null  on_behalf_of: null  transfer_data: null
  PASS - manual capture: a HOLD, nothing charged (amount_received 0)

CLEANUP: cancelAuthorization -> {"ok":true}  intent status now: canceled
```

✅ **Null before, the real id after.** ✅ **`capture_method: manual`, `amount_received: 0`.** ✅ **All three fee/routing parameters null.** ✅ The test hold was cancelled.

### (b) A draft consumes no stock and no capacity

```
  draft written: 41e83bc6-e8f0-464c-bb1c-c8f8636f1fcf  (claims 99 x Chicken Satay + 99 x Extra cheese)
  getLiveItemCounts["Chicken Satay"]     0 -> 0
  getLiveOptionCounts["Extra cheese"]    0 -> 0
  production windows                     0 -> 0
  orders on the event                    0 -> 0
  PASS - nothing moved
```

### (c) 🔴 AUTHORISATION FAILURE CREATES NOTHING — BOTH ARMS

**Arm 1, draft not created:**
```
  HTTP status      : 503
  body             : {"error":"We could not set up card payment just now, so your order has not been placed and you have not been charged. Your basket is saved — please try again, or choose Pay at the truck.","cardUnavailable":true}
  orders on event  : 0 -> 0
  ledger rows      : 38 -> 38
  item tally moved : false
  capacity moved   : false
  PASS - 503, no order, no ledger row, no stock, no capacity
```

**Arm 2 — 🔴 the authorisation arm, the one the 12 August incident took.** Run against `pizzeria-gusto`, a real truck whose operator has no usable Stripe account:
```
using truck=pizzeria-gusto event=cc3e7ef4-1444-45df-ab35-83f8e74fbbcf (2026-08-14) dish="Dolce Biscoff Pizza"
[submit] REFUSED card order for draft=1b438603-… truck=pizzeria-gusto — not_ready. NO order was created, no email sent and nothing reserved. The draft expires and is swept.

  HTTP status    : 503
  cardUnavailable: true
  orders on event: 0 -> 0
  PASS - the AUTHORISATION arm refuses too: 503, and NO order was created
```

🔴 **On 12 August this same condition produced an order, an email and a reserved slot. It now produces a 503 and nothing else.**

⚠️ **A draft IS written before the refusal, by design.** It carries no PaymentIntent, so both purges delete it and its PII at expiry without needing the cancellation sweep.

### (d) The pay-at-hatch path is unchanged

```
  HTTP status: 200
  body       : {"success":true,"orderId":"1","orderKey":"7e385cad-6dfc-4a09-89e8-ebf41eced789","slot":"12:00","autoAccepted":true,"total":6.5}
  orders on event: 0 -> 1
  the row        : {"order_key":"7e385cad-…","id":"1","status":"confirmed","payment_status":"unpaid","total":6.5,"total_minor":650,"slot":"12:00","event_id":"02f3cc81-…"}
  PASS - order created directly, unpaid, exactly as before
```

✅ **No `payByCard` in the body ⇒ the fork is not entered and the order is created directly**, priced, slotted and auto-accepted as always.

### (e) Every Checkout Session reference is gone

```
$ grep -rn "stripe/checkout|checkout\.sessions|success_url|cancel_url|hosted checkout" app lib components proxy.ts
(no live reference remains)

$ grep -rn "Checkout Session" app lib components
lib/payments/authorize.ts:14:// This used to create a hosted Checkout Session and read `session.payment_intent`. THAT FIELD IS NULL AT
```

✅ **The route directory is deleted** (`app/api/stripe/` now contains only `connect`). ✅ **The single remaining mention is the historical note explaining why the approach was abandoned** — the one place it is worth keeping, so nobody reintroduces it.

### Residue

```
RESIDUE: drafts [{"order_key":"973663fd-…","customer_name":"Dominic Bonini","created_at":"2026-08-12T14:24:22.501828+00:00"}]  probe orders []  orders total 453
```

✅ **Every probe row is gone.** ⚠️ The one remaining draft is **yours** — the orphan from the 14:24 incident, not mine. `orders total` moved 451 → 453 during the session; both are real orders placed by you (`probe orders []` confirms none are mine).

### Gates

```
tsc: clean
eslint — order page 18 errors (baseline 18); every other edited file unchanged. ZERO NEW.
```

⚠️ My Payment Element code contributes **no** `no-explicit-any` (all 12 in that file are pre-existing) and **no** `set-state-in-effect`: the missing-publishable-key case reports through the same rejection path as every other setup failure rather than calling setState in an effect body.

---

## VI. NON-ASCII CENSUS

| File | Before (total / distinct) | After | New class? |
|---|---|---|---|
| `lib/payments/authorize.ts` | 199 / 6 | 163 / 6 | ✅ none |
| `app/api/orders/submit/route.ts` | 1329 / 19 | 1351 / 19 | ✅ none |
| `app/trucks/[slug]/order/page.tsx` | 2037 / 39 | 2343 / 39 | ✅ none |
| `lib/payments/order-drafts.ts` | 372 / 5 | 432 / 5 | ✅ none |
| `app/api/dashboard/route.ts` | 558 / 9 | 558 / 9 | ✅ none |
| `app/api/menu/[truckId]/route.ts` | 212 / 10 | 212 / 10 | ✅ none |
| `app/order/[id]/manage/page.tsx` | 64 / 10 | 64 / 10 | ✅ none |
| `app/api/orders/[id]/route.ts` | 15 / 3 | 15 / 3 | ✅ none |
| `lib/payments/online-payments-switch.ts` | 146 / 5 | 146 / 5 | ✅ none |
| `app/api/stripe/checkout/route.ts` | 180 / 5 | **deleted** | — |

⚠️ **TWO VIOLATIONS I INTRODUCED AND CORRECTED.** `authorize.ts` gained `…` and `✅` (6 → 8); the order page gained `✅` (39 → 40). Caught by my own census, rewritten, both back to baseline. **Reported rather than quietly fixed.**

---

## VII. What was NOT touched

| Constraint | Held? |
|---|---|
| Pay-at-hatch path | ✅ **Proved in §V(d)** |
| `promoteDraft`, `claimOrderDraft`, `order_drafts`, the cron sweep | ✅ **Not opened** |
| Webhook event handling, the ledger | ✅ **Not opened** |
| Server-side pricing, the operator override | ✅ **Not opened** |
| `package.json` | ✅ **Untouched — zero new dependencies** |

## Not established / outstanding

- 🔴 **Nothing has been paid end-to-end.** The intent, the secret and the attach are proved; a real card going through the Element in a browser has not been run. **This needs one sandbox card before it goes near a customer.**
- 🔴 **The Apple Pay domain is not registered with Stripe.** Dashboard action. Without it the wallet buttons are silently absent; the card form works.
- 🔴 **The `payment_intent.amount_capturable_updated` subscription** must exist on the Stripe endpoint, or nothing promotes and every authorisation waits for the sweep to cancel it. Unchanged from phase 2b and still not verifiable from here.
- ⚠️ **The cron entry for the sweep is in `vercel.json` but the plan tier is still not established.**
- ⚠️ **The orphaned draft `973663fd-…`** from the 14:24 incident is still present and expired; it has no PaymentIntent, so `purge_order_drafts()` will remove it.
- ⚠️ **`?payment=abandoned`** is no longer produced by anything (it was the Session's `cancel_url`); the page still reads nothing from it. Inert either way.
- **Capture.** Still a later phase. Nothing in this build captures.
