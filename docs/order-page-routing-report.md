# Where a customer lands after placing an order — and why the card path lands somewhere else

**Date:** 11 August 2026
**READ-ONLY. No file changed, no file created except this report. No `next dev`, no `next build`. No commit, no deploy. No fix proposed or applied.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE ANSWER, UP FRONT

**Your reading is correct. The two paths land on two different pages, and they always have.**

| Path | Destination | What it is |
|---|---|---|
| **Pay at the truck** | 🔴 **NO NAVIGATION.** Stays on `/trucks/[slug]/order` and swaps to an in-page confirmation | the rich, familiar confirmation — collection time, itemised receipt, deal savings, "Confirmation sent to…" |
| **Pay by card** | 🔴 **`/order/{order_key}/manage?paid=1`** — a real, separate route | a 220-line **cancellation** page, written months earlier for the "Cancel your order" link in the confirmation email |

⚠️ **There is no third page.** The "correctly-formatted confirmed-order page" you remember is **not a route** — it is a `submitted` state of the order page itself, which is precisely why the card path cannot return to it: the browser has left the site for Stripe, and that state does not survive the round trip.

🔴 **AND THE "PAY AT THE TRUCK" LINE YOU SAW IS PROBABLY NOT A ROUTING BUG AT ALL — IT IS A TIMING ONE.** The manage page reads `payment_status` **from the row**, and the row is only written by the Stripe webhook. If the redirect back beats the webhook, the row still says `unpaid` and the page correctly renders what it was told. `?paid=1` is in the URL and **is never read by anything** — verified.

---

## 1. Every page that renders a single customer-facing order after placement

**Source: QUOTED.** `find app -type d -path "*order*"` returns exactly `app/order`, `app/order/[id]`, `app/order/[id]/manage`, `app/trucks/[slug]/order` (plus API dirs). **There are TWO renderers, and only one of them is a route.**

| # | File | Route pattern | Keys on | Renders |
|---|---|---|---|---|
| **A** | `app/trucks/[slug]/order/page.tsx` (lines **1270-1402**) | 🔴 **NONE — same URL, `/trucks/[slug]/order`** | 🔴 **nothing.** Pure component state (`submitted`), never re-fetched | Green ✓, "Order confirmed!"/"Order received!", `Order #{display id}`, collection-time block with slot-moved handling, **itemised receipt with modifiers, deal savings and notes**, total, `Payment: Pay at the truck`, the card-fallback notice, "Confirmation sent to {email}", "Back to {truck}" |
| **B** | `app/order/[id]/manage/page.tsx` (220 lines) | **`/order/[id]/manage`** | 🔴 **`order_key` (UUID)** | Dark header, `Order #{display id}`, Pickup, **Payment**, Status, a flat item list (**no modifiers, no deals, no savings**), Total, and a red **"Cancel order"** button |

**A is not a route — proven, `order/page.tsx:232` and `:1226` and `:1270`:**

```tsx
  const [submitted, setSubmitted] = useState(false)
```
```tsx
      setSubmitted(true)
```
```tsx
  if (submitted) return (
```

⚠️ **`setSubmitted(true)` appears EXACTLY ONCE in the file** (a grep returns one line). There is no URL, no param, no fetch — it is an early return inside the same component. **A hard reload loses it.**

**B keys on `order_key`, not the display id, despite the folder being `[id]` — QUOTED, `manage/page.tsx:32-33`:**

```tsx
    // [id] is the order_key UUID — globally unique, no ?truck= needed
    fetch(`/api/orders/${id}`)
```

**and `app/api/orders/[id]/route.ts:13-15, 36`:**

```ts
  // [id] is the order_key UUID — globally unique, so no truck scoping needed.
  // id (the display number) stays in the SELECT for the "Order #N" header.
  const { id } = await params
```
```ts
    .eq('order_key', id)
```

⚠️ **There is no `app/order/[id]/page.tsx`** — `ls app/order/[id]/` returns only `manage`. So `/order/{key}` with no `/manage` does not exist.

⚠️ **B has one other entry point, and it is the one it was built for** — `lib/email.ts:193`:

```html
        <a href="${params.baseUrl || 'https://www.hatchgrab.com'}/order/${params.orderKey}/manage" style="color:#ea580c;margin-left:4px">Cancel your order</a>
```

🔴 **That is the whole design intent of page B: a cancellation link in an email.** Stripe was pointed at it later.

**Not established:** whether any operator-facing surface renders a single customer order at a customer-facing URL — I searched `app/`, `components/` and `lib/` for order-detail renderers and found only these two.

---

## 2. What each page decides about payment state

**Source: QUOTED.**

### Page A — `order/page.tsx:1373-1376`

```tsx
          <div className="flex justify-between text-sm mb-4">
            <span className="text-slate-500">Payment</span>
            <span className="font-bold text-slate-700">Pay at the truck</span>
          </div>
```

🔴 **THERE IS NO DECISION. It is a hardcoded string with no condition of any kind.** Page A can only ever say "Pay at the truck".

⚠️ **The file states why that is acceptable** — `:1378-1382`:

```tsx
          {/* ── 🔴 THE ORDER IS PLACED BUT THE CARD STEP DID NOT START ─────────────────────────────
              This confirmation is only reached on the card path when Stripe could not be started —
              a successful card payment redirects away and never renders here. …
```

**The one conditional near it is the fallback notice, `:1383-1390`:**

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

**Unpaid string rendered by A:** `Pay at the truck` — **and it is the only string A can render.**

### Page B — `manage/page.tsx:160-165`

```tsx
          <div className="flex justify-between text-sm mb-1">
            <span className="text-slate-500">Payment</span>
            <span className={`font-medium ${order.payment_status === 'paid' ? 'text-green-600' : 'text-slate-900'}`}>
              {order.payment_status === 'paid' ? 'Paid by card' : 'Pay at the truck'}
            </span>
          </div>
```

✅ **B does decide, from `order.payment_status`.** `=== 'paid'` → **`Paid by card`** in green; **anything else** → **`Pay at the truck`** in slate.

**Unpaid string rendered by B:** `Pay at the truck` — 🔴 **byte-identical to A's**, which is why the wrong page is not obvious from that line alone.

**And the value's provenance — `api/orders/[id]/route.ts:66-68`, QUOTED:**

```ts
    // ⚠️ THE ORDER'S OWN STATE, NOT A CLAIM FROM A URL. The customer can land here from Stripe's
    // cancel_url, from a bookmark, or minutes later — so what they are told about money must come from
    // the row, never from a query parameter that a failed payment happens to carry.
    payment_status: order.payment_status ?? 'unpaid',
```

🔴 **`order.payment_status` is written by the webhook** (`recordOnlineCardPayment` → `recalcOrderPayment`), **not by the redirect.** So B tells the truth about the row at the instant it loads, and if the browser wins the race with the webhook the row still says `unpaid`. **INFERRED** from the quoted provenance plus the webhook branch established in the earlier audit.

---

## 3. `success_url` and `cancel_url`

**Source: QUOTED.** `app/api/stripe/checkout/route.ts`, inside `stripe.checkout.sessions.create`:

```ts
        success_url: `${base}/order/${order.order_key}/manage?paid=1`,
        cancel_url: `${base}/order/${order.order_key}/manage`,
```

**where `base` is, three lines above the session:**

```ts
    const base = process.env.NEXT_PUBLIC_HATCHGRAB_URL ?? ''
```

| URL | Resolves to |
|---|---|
| `success_url` | 🔴 **PAGE B** — `/order/{order_key}/manage`, plus `?paid=1` |
| `cancel_url` | 🔴 **PAGE B** — the same page, without the query string |

🔴 **BOTH GO TO PAGE B. NEITHER CAN REACH PAGE A**, because A has no URL to point at.

🔴 **`?paid=1` IS INERT.** `manage/page.tsx` imports `useParams` and **not** `useSearchParams`; a grep of the file for `searchParams` returns nothing. **The query string is read by no code in the app.** The page's own comment says this is deliberate — `:154-157`:

```tsx
              This page is where a card payment lands — both on success (Stripe's success_url) and on
              abandonment (its cancel_url). Those two arrive at the SAME page, so the difference must
              come from the row, not the URL: a `?paid=1` in the address bar is a claim the customer
              could type themselves, and the row is written by the webhook from Stripe's own event.
```

⚠️ **So a customer who ABANDONS payment and one who COMPLETES it see the same page and, until the webhook lands, the same words.**

---

## 4. Where the pay-at-hatch path sends the customer

**Source: QUOTED. It sends them NOWHERE. There is no navigation.**

`app/trucks/[slug]/order/page.tsx:1218-1226` — the tail of `handleSubmit`:

```tsx
      setSubmittedOrderId(data.orderId)
      setSubmittedAutoAccepted(!!data.autoAccepted)
      setSubmittedConfirmedSlot(data.slot ?? null)
      setSubmittedRequestedSlot(data.requestedSlot ?? (selectedSlot || null))
      setSubmittedSlotChanged(!!data.slotChanged)
      …
      setSubmitted(true)
```

**`setSubmitted(true)` flips the early return at `:1270`:**

```tsx
  if (submitted) return (
```

✅ **That is PAGE A.** No `router.push`, no `window.location`, no `<Link>`. The URL stays `/trucks/{slug}/order`.

⚠️ **The card path's only navigation is off-site** — `:1206-1208`:

```tsx
            // Leaves the site for Stripe's hosted page and returns to /order/{key}/manage.
            window.location.href = payData.url as string
            return
```

🔴 **That `return` is the fork.** Card success → leaves, and everything after it (including `setSubmitted(true)`) never runs. Card failure → falls through to `setCardFallbackNotice(true)` and then to the same `setSubmitted(true)`, so **a FAILED card payment shows page A and a SUCCESSFUL one shows page B.**

---

## 5. Same page or different?

**Source: QUOTED. 🔴 DIFFERENT PAGES.**

```
  (3) card  -> `${base}/order/${order.order_key}/manage?paid=1`   -> app/order/[id]/manage/page.tsx
  (4) hatch -> (no navigation; `setSubmitted(true)`)              -> app/trucks/[slug]/order/page.tsx:1270
```

### How they differ

| | **A — pay at hatch** (`trucks/[slug]/order`) | **B — card success** (`order/[id]/manage`) |
|---|---|---|
| **Chrome** | full site `<Shell>` + `<Hdr>` with the truck logo | 🔴 **none** — a bare card centred on `bg-slate-50` |
| **Headline** | "Order confirmed!" / "Order received!" with a green ✓ | `Order #{id}` on a dark `bg-slate-900` bar |
| **Collection time** | ✅ a dedicated block, **including the slot-moved and ASAP-moved cases** with amber explanations | ⚠️ one line: `Pickup  {slot} · {venue}` |
| **Items** | ✅ `<OrderLineItem variant="customer">` — **modifiers, per-modifier prices, special instructions** | ⚠️ `{qty}× {name}` and a price. **Nothing else.** |
| **Deals** | ✅ bundle name, **`save £X`**, every slot item, slot modifiers, slot notes | 🔴 **NOT RENDERED AT ALL.** `deals` is fetched and typed and never displayed |
| **Payment line** | hardcoded `Pay at the truck` | conditional; `Paid by card` only when the **row** says paid |
| **Status** | implied by the headline | an explicit `capitalize`d `{order.status}` field |
| **Reassurance** | "Confirmation sent to {email}" | none |
| 🔴 **Cancel** | **absent** | 🔴 **a full-width red "Cancel order" button** |
| **Exit** | "Back to {truck}" | none |

🔴 **THE TWO THINGS YOU NOTICED ARE BOTH EXPLAINED HERE:** the unfamiliar formatting is page B's bare cancellation card, and the "Cancel order" control is B's entire reason for existing.

---

## 6. Every control on page B (the `success_url` destination)

**Source: QUOTED.** Page B renders **exactly one interactive control** in its normal state.

### The only button

```tsx
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-xl disabled:opacity-50 transition-colors">
                {cancelling ? 'Cancelling...' : 'Cancel order'}
              </button>
```

**Its condition — `:116-119`:**

```tsx
  const canCancel =
    order.allow_cancellation &&
    ['pending', 'confirmed'].includes(order.status) &&
    !isPastCutoff()
```

**`isPastCutoff` — `:109-114`:**

```tsx
  const isPastCutoff = (): boolean => {
    if (!order.slot || !order.event_date || !order.cancellation_cutoff_mins) return false
    const slotTime = new Date(`${order.event_date}T${order.slot}`)
    const cutoff = new Date(slotTime.getTime() - order.cancellation_cutoff_mins * 60 * 1000)
    return new Date() > cutoff
  }
```

🔴 **`payment_status` IS NOT IN `canCancel`.** A **paid** order in `pending` or `confirmed`, inside the window, renders a live "Cancel order" button — and the cancel call carries no payment awareness either (`:46-50` posts only `{ order_key: id }`).

**The `else` branch — `:212-214`:**

```tsx
            <p className="text-sm text-slate-400 text-center">{statusLabel()}</p>
```

```tsx
  const statusLabel = () => {
    if (order.status === 'cancelled') return 'This order has already been cancelled.'
    if (order.status === 'ready' || order.status === 'collected')
      return 'This order can no longer be cancelled.'
    if (isPastCutoff()) return 'The cancellation window has passed.'
    return 'Cancellations are not accepted for this order.'
  }
```

### The confirm dialog

```tsx
  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this order?')) return
```

⚠️ **A native `window.confirm`** — no mention of a payment, no different wording for a paid order.

### Every rendered element, with its condition

| Element | Condition | Interactive? |
|---|---|---|
| "Loading your order..." | `loading` | no |
| 😕 "Something went wrong" + `{error}` | `error` | no |
| ✓ "Order cancelled" + refund text | `cancelled` | no |
| Header `{truck_name}` / `Order #{id}` | always (after load) | no |
| `Pickup {slot} · {venue}` | `order.slot` truthy | no |
| `Payment` line | always | no |
| `Status` line | always | no |
| Item rows | `(order.items \|\| []).map` | no |
| `Total` | always | no |
| 🔴 **"Cancel order" button** | **`canCancel`** | 🔴 **YES — the only one** |
| "Cancellations accepted up to N minutes…" | `canCancel && cancellation_cutoff_mins > 0` | no |
| `statusLabel()` | `!canCancel` | no |

**The post-cancel copy, `:98-101`:**

```tsx
          <p className="text-sm text-slate-500">
            Your order has been cancelled. If you paid by card, any refund is handled by{' '}
            {order?.truck_name || 'the truck'} directly — please contact them about it.
          </p>
```

🔴 **THERE IS NO AMEND CONTROL ANYWHERE ON PAGE B.** No edit, no add-item, no change-time, no re-pay. The only actions are **cancel** and **leave**. **QUOTED** — the full 220-line file contains one `<button>`.

---

## 7. Was either page changed in the most recent commit?

**Source: QUOTED. YES — BOTH, in `6fd4b97f33fcdf97f92123044df31ec368727ce6` "payment changes" (Tue 11 Aug 2026 14:46:39 +0100), 33 files, +5,691/−395.**

### `app/order/[id]/manage/page.tsx` — +30/−2, three hunks

**(a) A new field on the type:**

```diff
+  /** From the order row, never from a query parameter — see the API note. */
+  payment_status: string | null
```

**(b) The cancellation refund copy rewritten:**

```diff
-            Your order has been cancelled. If you paid online, a refund will be processed within 5–10 business days.
+            Your order has been cancelled. If you paid by card, any refund is handled by{' '}
+            {order?.truck_name || 'the truck'} directly — please contact them about it.
```

**(c) 🔴 THE PAYMENT LINE — ADDED IN THIS COMMIT. It did not exist before:**

```diff
+          <div className="flex justify-between text-sm mb-1">
+            <span className="text-slate-500">Payment</span>
+            <span className={`font-medium ${order.payment_status === 'paid' ? 'text-green-600' : 'text-slate-900'}`}>
+              {order.payment_status === 'paid' ? 'Paid by card' : 'Pay at the truck'}
+            </span>
+          </div>
```

⚠️ **So the "payment: pay at the truck" line you saw on page B is four hours old.** Before this commit page B showed no payment line at all.

### `app/trucks/[slug]/order/page.tsx` — +93/−4, five hunks

**The one that creates the fork:**

```diff
+      if (payByCard && truck?.card_payments_ready && data.orderKey) {
+        try {
+          const pay = await fetch('/api/stripe/checkout', {
+            method: 'POST', headers: { 'Content-Type': 'application/json' },
+            body: JSON.stringify({ orderKey: data.orderKey }),
+          })
+          const payData = await pay.json().catch(() => ({}))
+          if (pay.ok && payData.url) {
+            // Leaves the site for Stripe's hosted page and returns to /order/{key}/manage.
+            window.location.href = payData.url as string
+            return
+          }
```

**Plus:** `card_payments_ready` added to `TruckData`; the `payByCard` / `cardFallbackNotice` state; the fallback notice on page A; and the two-option card/hatch radio with its footer line.

⚠️ **`app/api/orders/[id]/route.ts` changed too (+5) in the same commit** — the `payment_status` field and its comment. **And `app/api/stripe/checkout/route.ts` is new in this commit (+172)**, `success_url` included. 🔴 **So the routing you are seeing was introduced whole, in this one commit — it is not a regression of something that previously worked differently.**

---

## Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — both renderers, the key each uses, the email entry point. "No third page" is a **QUOTED negative search** (`ls`, `find`, `grep` for `setSubmitted(`) |
| 2 | **QUOTED** — both payment blocks and the API's provenance comment. The webhook-race explanation is **INFERRED** from the quoted provenance |
| 3 | **QUOTED** — both URLs and `base`. "`?paid=1` is inert" is a **QUOTED negative search** (no `useSearchParams`, no `searchParams`) |
| 4 | **QUOTED** — the tail of `handleSubmit`, the single `setSubmitted(true)`, and the early return |
| 5 | **QUOTED** — both destinations; the difference table is read directly off both files |
| 6 | **QUOTED** — every element and every condition in all 220 lines |
| 7 | **QUOTED** — `git show 6fd4b97` for both files |

## Not established

- Whether the specific test order's row was `unpaid` at the moment page B loaded, or stayed `unpaid` — that needs the row and the `stripe_webhook_events` entry, and this pass touched no data.
- What `NEXT_PUBLIC_HATCHGRAB_URL` is set to in the environment that served the test — the redirect worked, so it is set to something, but I did not read it.
- Whether page B was ever intended to be a card-payment landing page before this commit — its structure and the email link say cancellation, but that is a reading of the code, not a record of a decision.
