# The pending email, and Link

**Date:** 13 August 2026
**READ-ONLY DIAGNOSIS, THEN ONE FIX.** No `next dev`, no `next build`. Nothing committed. Nothing deployed. No migration.
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 ISSUE 1: THE EMAIL WAS CORRECT. I HAVE THE DELIVERED BYTES.

**I pulled order 60's actual message body out of Brevo.** The email subject *"Order #60 received"*, sent `2026-08-13T11:13:39.145+02:00`, contains:

```html
<div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:16px;margin-top:12px;text-align:center">
  <p style="margin:0;font-size:16px;font-weight:800;color:#3730a3">Your card is held, not charged</p>
  <p style="margin:6px 0 0;font-size:13px;color:#4f46e5">Test Kitchen takes the payment when they confirm your order. Nothing to pay at the truck.</p>
</div>
```
```
contains "Pay at the truck on collection"?  false
contains "card is held"?                    true
```

**The indigo held block. The phrase you quoted is not in that email at all.** The resolver worked at this site too — three sites, all correct. And the second email is right as well: *"Paid by card — Your payment has gone through"*.

## 🔴 BUT THE SENTENCE IS REAL, AND IT IS ON THE PAGE, NOT IN THE EMAIL

```
$ grep -rn "Pay at the truck on collection" app/trucks/[slug]/order/page.tsx
2984:                  : 'Pay at the truck on collection · No card details needed'}
3039:          <p className="text-center text-slate-400 text-xs mt-1">Pay at the truck on collection · No card details needed</p>
```

**:2984 is gated. :3039 was not.** It is the line under the **"Review & order →"** button in the sticky footer, rendered **unconditionally**, on every truck, to every customer — **including one about to authorise a card**. Its second clause, *"No card details needed"*, is flatly contradicted by the card form that opens on the next tap.

🔴 **THAT IS WHAT YOU SAW, AND IT IS IN THE REPO.** It is fixed below. **Answers to 1-4 follow anyway, because they were asked and because they are what rules the email out.**

---

## 1. `resolveEmailPaymentState`, and its fallback

**Source: QUOTED.** `lib/payments/email-payment-state.ts`:

```ts
export async function resolveEmailPaymentState(
  supabase: SupabaseClient,
  orderKey: string,
  capture?: CaptureResult,
): Promise<EmailPaymentState> {
  if (capture) {
    const fromCapture = emailPaymentStateFromCapture(capture)
    if (fromCapture) return fromCapture
  }
  return readEmailPaymentState(supabase, orderKey)
}
```

and the fallback in full:

```ts
export async function readEmailPaymentState(supabase, orderKey): Promise<EmailPaymentState> {
  try {
    const { data: draft, error: draftErr } = await supabase
      .from('order_drafts')
      .select('payment_intent_id, promoted_at, authorization_cancelled_at')
      .eq('order_key', orderKey)
      .maybeSingle()

    if (draftErr) { … return 'unknown' }
    if (!draft?.payment_intent_id) return 'hatch'

    const { data: ledgerRow, error: ledgerErr } = await supabase
      .from('order_payments')
      .select('id')
      .eq('idempotency_key', onlinePaymentIdempotencyKey(draft.payment_intent_id))
      .maybeSingle()

    if (ledgerErr) { … return 'unknown' }
    if (ledgerRow) return 'captured'
    if (draft.authorization_cancelled_at) return 'hatch'
    if (!draft.promoted_at) { … return 'unknown' }
    return 'held'
  } catch (err) { … return 'unknown' }
}
```

✅ **You are right that `captureResult` is `undefined` on the pending path** — `promoteDraft` only assigns it inside `if (autoAccepted)` — so the fallback is what runs.

---

## 2. Order 60's live row, and what the fallback returns for it

**Source: QUOTED**, read live:

```
ORDER 60: order_key 7e8c18af-b2e2-4dda-9ceb-8f63955384d6  created_at 09:13:38.262Z
DRAFT   : {"payment_intent_id":"pi_3U3uhS2fB4PPCw2D065pisMt",
           "promoted_at":"2026-08-13T09:13:37.527+00:00",
           "authorization_cancelled_at":null,"customer_email":null,"total_minor":2100}
LEDGER  : [{"kind":"charge","amount_minor":2100,"idempotency_key":"stripe_pi:pi_3U3uhS…","created_at":"09:14:52.729Z"}]
EMAIL   : "Order #60 received" sent 09:13:39.145Z
```

**Walked at 09:13:39.145Z, the instant the email was composed:**

| Check | Value then | Result |
|---|---|---|
| `!draft?.payment_intent_id` | `pi_3U3uhS…` present | not `hatch` |
| ledger row for `stripe_pi:pi_3U3uhS…` | 🔴 **did not exist yet** — it was written at **09:14:52**, 73 seconds later | not `captured` |
| `draft.authorization_cancelled_at` | `null` | not `hatch` |
| `!draft.promoted_at` | set at **09:13:37.527**, 1.6 s earlier | not `unknown` |
| **fall through** | | 🔴 **`held`** |

# 🔴 SO THE FALLBACK RETURNED `held`, AND THE DELIVERED EMAIL PROVES IT DID.

---

## 3. 🔴 THE ORDER OF OPERATIONS — the hypothesis you asked me to check first, and it is clean

**Source: QUOTED**, `lib/payments/promote-draft.ts` with line numbers:

| Line | Step | Touches anything the fallback reads? |
|---|---|---|
| **114** | `claimOrderDraft` — the conditional `UPDATE` that **sets `promoted_at`** | ✅ **YES — it WRITES one, before everything else** |
| 268-300 | the `orders` INSERT | ❌ different table |
| **318** | 🔴 **`erasePii(supabase, draft.order_key)`** | ❌ **nulls `customer_name`, `customer_email`, `customer_phone` ONLY** |
| 327 | `rebuildProductionSlotUsage` | ❌ `production_slot_usage` |
| 333 | `releaseEventLock` | ❌ `booking_locks` |
| **366-373** | step 8a capture — **skipped entirely when pending** | ❌ writes no ledger row |
| 338 | `enforceStockLimits` | ❌ `event_item_stock` |
| **404** | `resolveEmailPaymentState(supabase, draft.order_key, captureResult)` | the read |

🔴 **`erasePii` IS THE CLEANEST SUSPECT AND IT IS INNOCENT.** Quoted, `lib/payments/order-drafts.ts`:

```ts
    .update({ customer_name: null, customer_email: null, customer_phone: null })
```

**Three columns, none of them read by the resolver.** `payment_intent_id`, `promoted_at` and `authorization_cancelled_at` are untouched by every step between the claim and the email. **Live confirmation:** order 60's draft reads `customer_email: null` (erased) **and** `payment_intent_id: pi_3U3uhS…` (intact).

⚠️ **The one thing that is not in its final state is the LEDGER — and that is exactly right.** At email time no capture had happened, so no row existed, and the absence of that row is what makes the answer `held` rather than `captured`.

---

## 4. Which source, and is it final?

| | |
|---|---|
| **Reads the draft row?** | ✅ **YES** — three columns, and it is the primary source |
| **Reads the order row?** | ❌ **NO.** Never touched |
| **Reads the ledger?** | ✅ **YES** — one row, by the exact key `stripe_pi:<intent id>` |
| **Draft final at that instant?** | ✅ **For the three columns it reads, yes.** `promoted_at` is written at step 1; `payment_intent_id` at authorisation, before promotion; `authorization_cancelled_at` only by a release that has not happened |
| **Ledger final?** | ⚠️ **No, and deliberately so.** A pending order has no capture yet. **"Not yet written" is the fact being reported, not a race** |

---

## 5. The fix

**Not the email — it was right.** The fix is the ungated line that renders the sentence you saw.

`app/trucks/[slug]/order/page.tsx:3039`, was:

```tsx
          <p className="text-center text-slate-400 text-xs mt-1">Pay at the truck on collection · No card details needed</p>
```

now:

```tsx
          <p className="text-center text-slate-400 text-xs mt-1">
            {truck?.card_payments_ready
              ? 'Pay by card or at the truck'
              : 'Pay at the truck on collection · No card details needed'}
          </p>
```

⚠️ **IT BRANCHES ON THE TRUCK, NOT ON `payByCard`.** The card-or-cash choice is made **inside** the review sheet, so at the footer the customer has not chosen and the line must be true either way — hence *"or"*, and no claim about what details are needed. Its sibling at :2984 branches on `payByCard` because by then the choice exists.

✅ **A truck that cannot take cards keeps the original sentence, character for character.**

### What was NOT changed

✅ The captured path · ✅ the confirm email · ✅ every other caller of the resolver · ✅ `readEmailPaymentState` itself — **it needed no change, and changing it would have broken three working sites.**

### ⚠️ ONE MORE INSTANCE, FOUND AND DELIBERATELY NOT FIXED

`app/order/[id]/manage/page.tsx:164` — the page the email's *"Cancel your order"* link goes to:

```tsx
              {order.payment_status === 'paid' ? 'Paid by card' : 'Pay at the truck'}
```

🔴 **For a pending order with a held authorisation, `payment_status` is `'unpaid'`, so this renders "Pay at the truck"** — one click from the email that correctly said the card is held. It also mis-renders `refunded` and `part_refunded`.

**Not fixed here because a correct fix is not a copy change:** *held* is deliberately absent from `payment_status`, so the page would need the held fact shipped to it — a change to `/api/orders/[id]`, which the confirmation screen also polls. **That is a build, not a line, and it was not this brief.**

---

# ISSUE 2: LINK

## 6. What is actually sent

### The PaymentIntent — **QUOTED**, `lib/payments/authorize.ts`

```ts
    const intent = await stripe.paymentIntents.create(
      {
        amount: args.amountMinor,
        currency: (args.currency ?? 'GBP').toLowerCase(),
        capture_method: 'manual',
        metadata: { order_key: args.orderKey, truck_id: args.truckId, source: 'hatchgrab_online_order' },
        payment_method_types: ['card'],
      },
      { stripeAccount: operator.stripe_account_id },
    )
```

**And the intent Stripe actually created for order 60, read back live:**

```
payment_method_types ["card"]   automatic_payment_methods null   capture_method manual
```

✅ **The intent is card-only. There is no `automatic_payment_methods`. `link` is not in the list.**

### The Payment Element — **QUOTED**, `app/trucks/[slug]/order/page.tsx:1452-1461`

```ts
        const elements = stripe.elements({
          clientSecret: payment.clientSecret,
          appearance: { theme: 'flat', variables: { colorPrimary: '#f97316', borderRadius: '12px', fontFamily: 'inherit' } },
        })
        const el = elements.create('payment', {
          layout: { type: 'accordion', defaultCollapsed: false, radios: true, spacedAccordionItems: false },
          wallets: { applePay: 'auto', googlePay: 'auto' },
        })
```

**No `link` option is passed, because none exists** — `wallets` covers Apple Pay and Google Pay only, which the code's own comment already records.

## 7. Every way Link can be enabled

| Lever | What this code does | Would it suppress Link? |
|---|---|---|
| **`payment_method_types`** | `['card']` — verified on the live intent | ⚠️ **It removes Link as a payment METHOD, and demonstrably does not remove the "save my information" box.** That box is Link's **inline signup on the card form**, not a method entry |
| **`automatic_payment_methods`** | **not sent** (`null` on the live intent) | ✅ Already the stricter setting. Nothing more to gain |
| **The Element's own options** | `layout` and `wallets` only | ❌ **There is no client-side switch.** The Payment Element has `wallets` for Apple/Google Pay and **nothing equivalent for Link** |
| 🔴 **The Dashboard payment-method configuration** | 🔴 **`link` is ON.** See below | 🔴 **YES — THIS IS THE ONE** |

### 🔴 READ LIVE FROM STRIPE, AND IT IS ON IN BOTH PLACES

```
=== PLATFORM payment method configurations: 1
  id pmc_1U1oFMGk3iTPlj9EtXtt6Sgk  name "Default"  is_default true  active true  parent null
      card        {"preference":"on","value":"on"}
      link        {"preference":"on","value":"on"}      <- 🔴
      apple_pay   {"preference":"on","value":"on"}
      google_pay  {"preference":"off","value":"off"}

=== CONNECTED payment method configurations: 2
  id pmc_1U30wv2fB4PPCw2DqCrCa3Ip  name "Default"  is_default true  parent null
      card        {"preference":"on","value":"on"}
      link        {"preference":"on","value":"on"}      <- 🔴 THE ONE THAT GOVERNS
      apple_pay   {"preference":"on","value":"on"}
      google_pay  {"preference":"off","value":"off"}
  id pmc_1U30wa2fB4PPCw2D1ecy0Inr  name "Default"  is_default true  parent pmc_1U1oFNGk3iTPlj9Eh1MA0KOX
      link        {"overridable":true,"preference":"on","value":"on"}
```

⚠️ **`google_pay` is `off` in both.** Unrelated to Link, but it is why Google Pay does not render whatever the Element's `wallets` option says — **worth knowing, and not something the code can fix either.**

## 8. 🔴 WHERE TO TURN IT OFF — AND IT IS NOT IN THIS REPO

**These are DIRECT charges**, so the charge is created **on the connected account** and the connected account's payment-method configuration governs what the Element offers. Stripe's own direct-charges page: *"You create parent payment method configurations for your connected accounts, who can customize their own child configurations."*

**Turn it off in the Dashboard:**

1. 🔴 **On the CONNECTED account** — Settings → Payment methods → **Link → Off**. Test Kitchen has full Dashboard access to `acct_1U30w22fB4PPCw2D`, so this is theirs to change. It is the configuration the Element reads.
2. **On the PLATFORM, for every future account** — Dashboard → Settings → **Payment methods for your connected accounts** → set **Link** to **Off by default** (or **Blocked**, which stops a connected account turning it back on). ⚠️ Existing accounts keep their current value unless you apply the change to them.
3. **Or by API**, without the Dashboard:
   ```
   POST /v1/payment_method_configurations/pmc_1U30wv2fB4PPCw2DqCrCa3Ip
     -H "Stripe-Account: acct_1U30w22fB4PPCw2D"
     -d "link[display_preference][preference]=off"
   ```

⚠️ **NOT ESTABLISHED:** which of the connected account's **two** configurations the Element resolves for a given intent when neither is named on the PaymentIntent. `pmc_1U30wv…` is `is_default: true` with no parent and is the likeliest, but **both currently read `link: on`, so turning off only one may not be enough.** Set both, or verify after changing one.

⚠️ **This is a live commercial setting on a real Stripe account, so I have not changed it.** It is a Dashboard/API action, not a deploy.

---

# Quoted vs inferred

| § | Status |
|---|---|
| Issue 1 headline | **QUOTED** — the delivered message body from Brevo, and the two `grep` hits |
| 1 | **QUOTED** — both functions in full |
| 2 | **QUOTED** — the live rows and the three timestamps. The walk is **INFERRED** from them, and **corroborated** by the delivered bytes |
| 3 | **QUOTED** — every step with its line, and `erasePii`'s `update` |
| 4 | **QUOTED** — the selects |
| 5 | **QUOTED** — the line before and after |
| 6 | **QUOTED** — the create call, the live intent, the Element options |
| 7 | **QUOTED** — the live payment-method configurations. That the Element's box comes from them is **INFERRED**, from the intent being card-only while the box still renders |
| 8 | **QUOTED** for the direct-charge governance; **not established** for which of the two configurations resolves |

# Verification of the fix

- **Reproduced the pending path with the current code**, through the real `promoteDraft` with Brevo intercepted:
  ```
  PROMOTED draft=97230818-… -> order #61 status=pending capture=held, pending confirmation
  email subject : Order #61 received
  HTML : … Your card is held, not charged … Test Kitchen takes the payment when they confirm your order.
  readEmailPaymentState (run again now) -> held
  the row it read: {"payment_intent_id":"pi_3U3ung…","promoted_at":"2026-08-13T09:19:49.179+00:00","authorization_cancelled_at":null}
  ledger: []
  ```
  ✅ **`held`, and the correct block.** ⚠️ **Writes declared:** 1 draft, 1 order (#61), 1 sandbox PaymentIntent (cancelled in cleanup), 0 emails. **Residual: 0/0/0.**
- **The footer change is copy inside an existing conditional-free `<p>`**; `tsc --noEmit` clean, eslint **46 problems before and after** (all pre-existing).

# 🔴 NON-ASCII CENSUS

| File | Before | After | Distinct set |
|---|---|---|---|
| `app/trucks/[slug]/order/page.tsx` | 2599 / **39** | 2627 / **39** | 39 characters, **identical** |

✅ **NO CHARACTER CLASS GAINED.** No other file was modified.

# Standing

- ⚠️ **`app/order/[id]/manage/page.tsx:164` still says "Pay at the truck" for a held order.** §5. Needs the held fact on `/api/orders/[id]`.
- ⚠️ **Link stays on until the Dashboard changes.** No code change can suppress it.
- ⚠️ **`google_pay` is `off` on both configurations** — Google Pay will not render regardless of the Element's `wallets` option.
