# A URL-reachable customer confirmation

**Date:** 11 August 2026
**Result: BUILT. Migration written, not run. Five files changed, one migration added.**
**No `next dev`, no `next build`, no commit, no deploy.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

```
 M app/api/orders/[id]/route.ts
 M app/api/orders/submit/route.ts
 M app/api/stripe/checkout/route.ts
 M app/order/[id]/manage/page.tsx
 M app/trucks/[slug]/order/page.tsx
?? supabase/migrations/20260811_orders_confirmation_slot_fields.sql
```

---

# 🔴 THE HEADLINE

✅ **ONE COMPONENT, TWO WAYS IN.** The confirmation JSX was **extracted, not copied** — `<OrderConfirmation>` is the only copy, and both the in-memory pay-at-hatch path and the new `?confirm=<order_key>` path render it.

✅ **PROVEN ON REAL ROWS.** A live Gusto order resolves **every** displayed field through the new path with the two new columns null; the paid line reads `"Paid by card"` from the order's own `payment_status`; a mismatched slug is **refused**; and the `canCancel` gate **fired on a real order** — `d2d5a74a`, `confirmed` + `paid`, `true → false`.

⚠️ **THREE THINGS I WANT YOU TO READ, NOT SKIM** — the write is not atomic (and why that is the right call), deal savings are deliberately not shown on the URL path, and three online-paid orders still read `unpaid` for a reason that is not this change.

---

## 1. The migration — two columns, not three

**`supabase/migrations/20260811_orders_confirmation_slot_fields.sql`**

```sql
alter table orders
  add column if not exists requested_slot text,
  add column if not exists asap_estimate  text;
```

| Column | Type | Nullable | Holds |
|---|---|---|---|
| **`requested_slot`** | **`text`** | ✅ **YES, no default** | The slot the customer asked for, `'HH:MM'`, before any roll-forward. Null for ASAP and for every existing row |
| **`asap_estimate`** | **`text`** | ✅ **YES, no default** | The *"Around HH:MM"* they were shown. Null for every chosen-slot order and every existing row |

### 🔴 THERE IS NO `slot_changed` COLUMN, DELIBERATELY

**It is `requested_slot is not null and requested_slot is distinct from slot`** — derivable from what is stored. The migration says so:

```sql
-- `slot_changed` is NOT a column. It is `requested_slot is not null and requested_slot is distinct from
-- slot` — derivable from what is stored, and storing it as well would create two sources for one fact,
-- which is the drift this codebase repeatedly records.
```

⚠️ **`text`, not `time`** — `orders.slot` is already text and every consumer does string comparison and `formatTime` on it. Consistency with the column it is compared *against* beats type purity.

---

## 2. Writing the three values — and one needed a request field

### The payload addition

**`app/trucks/[slug]/order/page.tsx`, inside the submit body:**

```tsx
          asapEstimate: asapChosen ? (backwardAsap || asapSlot || customerAsapTime || null) : null,
```

🔴 **Same precedence expression the ASAP button itself uses.** This is the only confirmation value the server cannot compute — the other two are already calculated server-side and were simply not persisted.

### Where it is read — `app/api/orders/submit/route.ts`

```ts
      upsellEvents,
      // ── 🔴 THE ONLY CONFIRMATION VALUE THE SERVER CANNOT COMPUTE ────────────────────────────────
      …
      asapEstimate,
    } = body
```

### The write

```ts
    {
      const confirmationFields = {
        requested_slot: requestedSlot,
        asap_estimate: typeof asapEstimate === 'string' && asapEstimate.trim() ? asapEstimate.trim() : null,
      }
      const { error: confErr } = await supabase
        .from('orders')
        .update(confirmationFields)
        .eq('order_key', order.order_key)
      if (confErr) {
        console.error(
          `[submit] confirmation fields not written for order_key=${order.order_key} — the order is SAVED ` +
          `and unaffected; the confirmation will show its plain slot line:`, confErr.message,
        )
      }
    }
```

### ⚠️ IT IS AN UPDATE AFTER THE RPC, NOT A CHANGE TO `place_order_atomic` — A NAMED TRADE

🔴 **THE COST: this is not atomic with the insert.** There is a window in which the order exists without these two fields.

**Why I took it, quoted from the source:**

```ts
    // The RPC's INSERT column list is fixed SQL. Adding two columns to it means reproducing a ~90-line
    // money-path function to carry two DISPLAY strings, and a transcription error there does not break a
    // confirmation screen — it breaks every customer order. The risk is inverted against the reward.
    // ⚠️ THE PRECEDENT IS DIRECTLY ABOVE: `placed_at` was written exactly this way in phase 1 and folded
    // into the insert later, once the value had earned it.
```

**And why the cost is acceptable:** a failure leaves both null, which is **exactly what every pre-existing row reads**, and the confirmation already renders correctly for null — it takes the plain *"Collection time: HH:MM"* branch. **No money, no slot, no capacity depends on either**, so it logs and never throws.

---

## 3. The branch — and why it sits first

**`app/trucks/[slug]/order/page.tsx`, ABOVE `loading`, `error` and the feature gate:**

```tsx
  // 🔴 WHY IT IS ABOVE `loading`, `error` AND THE FEATURE GATE — AND NOT NEXT TO `if (submitted)`,
  // WHICH IS WHERE IT LOGICALLY BELONGS. Each of the three below would swallow it, and each failure is
  // worse than the last:
  //   - `loading` (the next line) is set false ONLY by the menu fetch's .finally(). This screen renders
  //     no menu, and the fetch is gated off for it (see the effects), so `loading` would never clear —
  //     a customer who has just paid would sit on "Loading menu..." indefinitely.
  //   - `error && !submitted` fires on any menu-fetch failure with "This truck is not currently taking
  //     orders." A paid customer must not be told the truck is closed.
  //   - 🔴 THE FEATURE GATE IS THE WORST ONE. `advance_preordering` is NOT held by plan 'starter', so on
  //     a starter truck this branch would render "Online ordering not available" — to a customer holding
  //     a receipt for an order that truck has just taken and been paid for. The gate is correct about
  //     placing NEW orders and has no business judging a completed one.
  if (confirmOrderKey) {
```

⚠️ **The cost is stated too:** sitting first means the branch **owns its own loading and error states** (`confirmLoading`, `confirmError`) rather than sharing the page's. That is the right way round — it needs one order row and should not wait on, or fail with, machinery it does not use.

**The parameter:**

```tsx
  // 🔴 IT IS AN IDENTIFIER, NOT A CLAIM. It says WHICH order to show and nothing else — never that the
  // order is paid, never that it exists, never that it belongs to this truck. All three are answered by
  // the server. This is the lesson of `?paid=1` on /order/[id]/manage, which was written into a URL and
  // then correctly ignored by every reader.
  const confirmOrderKey = searchParams.get('confirm')
```

✅ **Read from the SAME `searchParams` object `event_id` already uses** — no new hook, no Suspense boundary, no change to how this component reads the query string.

---

## 4. ONE component — extracted, not duplicated

🔴 **`<OrderConfirmation>` is the only copy of that markup in the codebase.** The 135 inline lines under `if (submitted)` were **moved** into it and replaced with a call.

```tsx
// 🔴 IF YOU EVER NEED TO CHANGE THIS SCREEN FOR ONE PATH ONLY, YOU HAVE FOUND A PRODUCT QUESTION, NOT A
// TECHNICAL ONE. Add a prop and branch inside; do not fork the component. Two copies would drift within
// a release, and the drift would be invisible because only one of the two is reachable in normal use.
```

### ⚠️ THE PROPS ARE NORMALISED, AND THAT IS THE ONLY REAL DESIGN DECISION HERE

`basket` holds `BasketItem` objects with a nested `menuItem`; the database holds flat JSONB. **Neither shape belongs in the markup**, so both callers map into a third — `ConfirmationLine` / `ConfirmationDeal` — which is what stops the component learning about either source.

| Caller | Maps from |
|---|---|
| **In-memory (pay-at-hatch)** | `basket` / `appliedDeals` + `menu` for savings |
| **By URL (card)** | `orders.items` / `orders.deals` |

✅ **The mapping is the SAME arithmetic the inline JSX did**: `unitPrice` still includes modifiers, `saving` is still original-minus-bundle floored at zero.

⚠️ **`asapMoved` moved WITH the markup.** It was computed in the page body and read only by this screen, so it now lives in the component — which is also why the in-memory path is unchanged: it was never used anywhere else.

### 🔴 THE PAY-AT-HATCH PATH IS BEHAVIOURALLY IDENTICAL

Same trigger (`setSubmitted(true)`), same early return, same in-memory data, **no fetch and no URL**. The only difference is that the JSX now lives one function away.

---

## 5. The paid line

```tsx
          <div className="flex justify-between text-sm mb-4">
            <span className="text-slate-500">Payment</span>
            {paymentStatus === 'paid' ? (
              <span className="font-bold text-green-600">Paid by card</span>
            ) : (
              <span className="font-bold text-slate-700">Pay at the truck</span>
            )}
          </div>
```

🔴 **IT BRANCHES ON THE ORDER'S `payment_status`, NEVER ON A TRUCK SETTING.** The URL path passes `confirmOrder.payment_status`; the pay-at-hatch path passes the literal `"unpaid"`, which renders the identical original string — **a statement of fact, not a default**: that order was created moments earlier on the same request and is unpaid by construction.

⚠️ **`part_paid` and `refunded` both fall to the not-paid branch**, which is the safe direction: it tells a customer to expect to pay rather than telling them they are square when they are not.

---

## 6. What the confirmation does NOT do

| Work | How it is skipped |
|---|---|
| **Menu fetch** | `if (confirmOrderKey) return` at the top of its effect. 🔴 It owns `loading`, so `loading` stays true forever on this path — **safe only because the branch sits above the loading check**, and both comments say so from their own side |
| **Events fetch** | `if (confirmOrderKey) return`, and `eventLoading` is now **initialised** to `!confirmOrderKey` rather than set inside the effect. ⚠️ That fetch is on the STRICT 3/min tier — a customer refreshing a receipt must not spend it |
| **Slots fetch** | `if (confirmOrderKey) return` **inside `fetchSlots` itself**, not at its two callers, so neither can be added to without remembering |
| **30 s clock tick** | `if (confirmOrderKey) return`, deps changed to `[confirmOrderKey]` |
| **30 s menu poll** | `if (confirmOrderKey) return` before its existing event gate |
| ✅ **What it DOES do** | **one request** — `/api/orders/{key}?truck={slug}` |

---

## 7. Truck scoping on `/api/orders/[id]`

```ts
  const truckParam = req.nextUrl.searchParams.get('truck')
  …
  if (truckParam && truckParam !== truck?.slug && truckParam !== order.truck_id) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }
```

🔴 **OPT-IN, SO THE EMAIL LINK IS UNTOUCHED.** Absent ⇒ behaviour is byte-identical to before. `/order/[id]/manage` sends no `?truck=`, so the *"Cancel your order"* link works exactly as it did.

⚠️ **A 404, not a 403, and deliberately the same body as "not found"** — a caller asking about an order on the wrong truck should learn nothing about whether it exists elsewhere. ⚠️ **Matched against both slug and id**, because a truck is addressable either way across this codebase.

**Also added to that route** (all additive; the manage page types its response and reads field by field, so extra keys are inert there): `customer_email`, `requested_slot`, `asap_estimate`, `deal_savings`, `truck_logo`.

---

## 8. `canCancel`, gated

```tsx
  const isPaidOrPartPaid = order.payment_status === 'paid' || order.payment_status === 'part_paid' || order.payment_status === 'refund_due'

  const canCancel =
    order.allow_cancellation &&
    ['pending', 'confirmed'].includes(order.status) &&
    !isPaidOrPartPaid &&
    !isPastCutoff()
```

### 🔴 THE COPY

> **"This order has been paid. To cancel it or ask for a refund, please contact {truck name} directly."**

⚠️ **It names the truck**, because *"contact them"* is only useful if the customer knows who. ⚠️ **It deliberately does not say "you cannot cancel"** — the order may well be cancellable, just not by a button this platform can honour. ⚠️ **Tested before the ready/collected branch**, so a paid-and-collected order gets the money answer rather than a generic one.

**Three values block it**, not one: `paid`, `part_paid` and `refund_due` all mean money has moved. `unpaid` and `failed` still reach the button — `failed` means an attempt was made and did not take.

---

## 9. `success_url`

```ts
        success_url: `${base}/trucks/${truck.slug ?? truck.id}/order?confirm=${order.order_key}`,
        cancel_url: `${base}/order/${order.order_key}/manage`,
```

✅ **`cancel_url` is unchanged and stays on the manage page** — a customer who *abandoned* payment has an unpaid order, and that page's Cancel button is exactly right for them. **The new paid-gate leaves it available precisely for this case.**

⚠️ `slug` was added to that route's named `trucks` select to build the URL.

---

## 10. The three failure cases

**All follow the existing 😕 pattern — the order page's own error branch and `/order/[id]/manage` both render this shape. Not a new treatment.**

| Case | Renders |
|---|---|
| **Not found** | 😕 **"We couldn't find that order."** + *"← Back to truck page"* |
| 🔴 **Wrong truck** | 😕 **the SAME message** — the server returns the same 404 for both, so the customer learns nothing about whether it exists elsewhere |
| **Cancelled** | 😕 **"This order has been cancelled."** — refused explicitly, because rendering *"Order confirmed!"* over a cancelled row would be actively wrong |
| **Network failure** | 😕 **"We couldn't load that order."** |
| **In flight** | *"Loading your order..."* — the branch's own state, not the page's |

---

## 🔴 DEPLOY ORDER — CHECKED, NOT ASSUMED

| Reader | How | Coupled? |
|---|---|---|
| 🔴 **`app/api/orders/[id]/route.ts`** | **NAMED select**, and this build **adds both columns to it** | 🔴 **YES** |
| `app/api/orders/submit/route.ts` | writes them in an **`update`** | ⚠️ **No** — an update cannot 42703 a select; it errors, logs, and the order is already saved |
| `app/api/dashboard/route.ts` | orders read with **`select('*')`** | ✅ **No** |

### VERDICT: **THE COLUMNS ARE ADDITIVE; THE `/api/orders/[id]` ROUTE IS DEPLOY-COUPLED. MIGRATION FIRST.**

🔴 **The reverse order breaks `/order/[id]/manage` too**, because both pages share that route — the email link would land on *"Something went wrong"*.

---

## VERIFICATION — actual values

Read-only script, every query a `select`, **deleted afterwards**. It reproduced the route's select and scope check and the page's mapping **verbatim** and printed both. ⚠️ **The migration is unrun**, so where the columns are absent they read null — **which is exactly what every pre-existing row will read after it is applied.**

### (a) A real pizzeria-gusto order through the new path

```
  truck_name          = "Pizzeria Gusto"
  truck slug          = "pizzeria-gusto"
  status              = "collected"   -> autoAccepted = false
  slot                = "19:20"       -> confirmedSlot = "19:20"
  requested_slot      = null  -> slotChanged = false   🔴 NEW COLUMN, null as expected
  asap_estimate       = null                            🔴 NEW COLUMN, null as expected
  customer_email      = "odea1967@googlemail.com"
  total               = 13.5
  payment_status      = "unpaid"  -> payment line = "Pay at the truck"
  logo_storage_path   = "pizzeria-gusto/1781784850351-pizzeriagusto.jpg"
  LINES (1):
    1x Napolitano  unit=13.5  base=12  mods=[{"name":"Salami Napoli","price":1.5}]  note=null
  DEALS (0): []
  🔴 FIELDS THAT FAILED TO RESOLVE: NONE — every displayed field resolved
  ⚠️ slot-moved block: NOT shown (requested_slot null) — the plain "Collection time" branch, exactly as today
```

✅ **Every field resolves.** The modifier arithmetic round-trips: stored `unit_price` 13.5 minus the £1.50 modifier gives `basePrice` 12 — the same relationship the in-memory path builds forwards.

### (b) A test-truck order paid online

```
  online ledger rows on test-truck: 5
  a9f1aa6d…  ledger: channel=online livemode=false amount_minor=950  ref=pi_3U31rB2fB4PPCw2D0j9ji161
             orders.payment_status = "paid"  -> PAYMENT LINE: "Paid by card"  ✅
  d2d5a74a…  ledger: channel=online livemode=false amount_minor=650  ref=pi_3U3MWk2fB4PPCw2D1L7mjQy8
             orders.payment_status = "paid"  -> PAYMENT LINE: "Paid by card"  ✅
  9e7905d7…  orders.payment_status = "unpaid" -> PAYMENT LINE: "Pay at the truck"  ⚠️
  945d30d8…  orders.payment_status = "unpaid" -> PAYMENT LINE: "Pay at the truck"  ⚠️
  74255389…  orders.payment_status = "unpaid" -> PAYMENT LINE: "Pay at the truck"  ⚠️
```

### ⚠️ WHY THREE OF THEM READ `unpaid` — AND IT IS NOT THIS CHANGE

```
  9e7905d7  orders.payment_status=unpaid amount_paid=0  ledger=[{"livemode":false,"channel":"online","amount_minor":650}]
  945d30d8  orders.payment_status=unpaid amount_paid=0  ledger=[{"livemode":false,"channel":"online","amount_minor":1250}]
  74255389  orders.payment_status=unpaid amount_paid=0  ledger=[{"livemode":false,"channel":"online","amount_minor":1300}]
```

🔴 **`livemode: false` rows are excluded by `isLiveRow` today, so `recalcOrderPayment` wrote `unpaid`.** The account-mode change admits them, but **recalc has not re-run for these orders.**

✅ **THE CONFIRMATION IS CORRECT EITHER WAY — it reads the ROW, so it says whatever the row says.** That is the property requirement 5 asked for, demonstrated by a case where the row and the ledger disagree.

### (c) The wrong-truck case

```
  ?truck=test-kitchen     -> ✅ renders   (order belongs to slug=test-kitchen, id=test-truck)
  ?truck=test-truck       -> ✅ renders
  ?truck=pizzeria-gusto   -> 🔴 404 "Order not found" — REFUSED
  ?truck=real-thai-food   -> 🔴 404 "Order not found" — REFUSED
  ?truck=null (the email) -> ✅ renders
```

✅ **Both the slug and the id are accepted; two wrong slugs are refused; and the no-parameter case — the email link — is untouched.**

### (d) `canCancel`, paid vs unpaid

```
  order_key | status    | payment_status | BEFORE | AFTER | changed?
  d2d5a74a  | test-truck| confirmed | paid   | true   | false | 🔴 GATE FIRED
  orders whose canCancel CHANGED because of the paid gate: 1
```

🔴 **THE GATE FIRED ON A REAL ORDER.** `d2d5a74a` is `confirmed`, `paid`, within its cutoff, on a truck with cancellation enabled — it **was** offered a one-tap Cancel and now is not.

```
  a9f1aa6d | collected | paid   | false -> false | "This order has been paid. To cancel it or ask for a refund, please contact Test Kitchen directly."
  9e7905d7 | confirmed | unpaid | true  -> true  | (Cancel order button rendered)
  945d30d8 | confirmed | unpaid | true  -> true  | (Cancel order button rendered)
  74255389 | confirmed | unpaid | true  -> true  | (Cancel order button rendered)
  93252309 | confirmed | unpaid | false -> false | "The cancellation window has passed."
```

✅ **Unpaid orders keep the button. Paid ones lose it and get the copy. Cutoff behaviour is unchanged.**

### tsc / lint

```
$ npx tsc --noEmit -p tsconfig.json  → clean
```

⚠️ **LINT IS NOT ZERO ON MY LINES, AND I AM REPORTING IT RATHER THAN CLAIMING OTHERWISE.**

```
  app/trucks/[slug]/order/page.tsx   total=45   IN_MY_RANGES=5   (all @typescript-eslint/no-explicit-any)
  app/api/orders/submit/route.ts     total=25   IN_MY_RANGES=1   (pre-existing line, inside my range)
  app/api/orders/[id]/route.ts       total=1    IN_MY_RANGES=1   (pre-existing `order.trucks as any`)
  app/order/[id]/manage/page.tsx     total=3    IN_MY_RANGES=0
  app/api/stripe/checkout/route.ts   total=0    IN_MY_RANGES=0
```

**Five are genuinely mine** — `any` on the `confirmOrder` state and the JSONB mappers. The file went from **4 to 8** `: any` occurrences. That matches its own dominant pattern, but it is an addition and it is named.

🔴 **TWO `react-hooks/set-state-in-effect` ERRORS I INTRODUCED WERE FIXED, NOT LEFT.** My first draft called `setConfirmLoading(true)` synchronously in the new effect and `setEventLoading(false)` in the events gate. Both are gone: `confirmLoading` initialises from `!!confirmOrderKey` and `eventLoading` from `!confirmOrderKey`, so neither needs a setState in an effect body. **The four that remain (L463, L603, L641, L1196) are all pre-existing lines.**

### Scripts deleted

`conf-verify.mjs`, `conf-verify2.mjs` and both `.log` files removed; the listing afterwards confirms none remain. **Nothing written to the database, nothing to the repository beyond the six files above.**

---

## NON-ASCII CENSUS

| File | Before | After | DISTINCT |
|---|---|---|---|
| `app/trucks/[slug]/order/page.tsx` | D=39 T=1505 | **D=39** T=1877 | ✅ unchanged |
| `app/api/orders/submit/route.ts` | D=19 T=1014 | **D=19** T=1092 | ✅ unchanged |
| `app/api/orders/[id]/route.ts` | D=3 T=4 | **D=3** T=15 | ✅ unchanged |
| `app/order/[id]/manage/page.tsx` | D=10 T=63 | **D=10** T=94 | ✅ unchanged |
| `app/api/stripe/checkout/route.ts` | D=5 T=150 | **D=5** T=180 | ✅ unchanged |

```
NEW character classes introduced : 0
characters that DROPPED          : 0
```

### 🔴 FOUR VIOLATIONS, ALL CAUGHT BY THE CENSUS AND ALL CORRECTED

| File | I introduced | Fix |
|---|---|---|
| order page | **`•` U+2022** ×3 | bullets → ASCII `-` |
| submit route | **`✅` U+2705** ×1 | removed |
| manage page | **`…` U+2026** ×2 | rewritten without ellipses |
| 🔴 `orders/[id]` | **`─` U+2500, `⇒` U+21D2, `🔴` U+1F534** | that file's set is only `—`, `⚠`, U+FE0F — box rules → ASCII, `⇒` → `=>`, markers dropped |

⚠️ **`app/api/orders/[id]/route.ts` is the tightest file in the repo on this measure** — three classes total. Reported rather than quietly fixed; the check earned its place for the third run running.

**Garble scan:** zero U+FFFD; no `Â` / `â€` / `Ã©` / `ðŸ` mojibake in any of the six.

---

## WHAT WAS NOT TOUCHED — verified

| Instruction | Result |
|---|---|
| `/order/[id]/manage` beyond the canCancel gate | ✅ **Only `canCancel` + `statusLabel` changed.** The Cancel button, the fetch, the cancelled screen and the refund copy are byte-identical |
| The pay-at-hatch flow | ✅ **Same trigger, same in-memory path, same early return.** Only the JSX's location moved |
| The webhook, the ledger, any livemode filter | ✅ **Untouched** — not in the changed-file list |
| The dead discount feature, duplicated helpers | ✅ **Untouched** |
| Anything else | ✅ Five files plus one migration |

---

## Two things worth your decision

⚠️ **DEAL SAVINGS ARE NOT SHOWN ON THE URL PATH, AND THAT IS RECORDED IN THE CODE RATHER THAN PAPERED OVER.** The in-memory path computes them live from the menu; reproducing that on the URL path means reading a menu that may have changed — the price-book audit found three Gusto dishes renamed or deleted under existing orders. **A figure that might differ from the one the customer was shown is worse than no figure**, so `saving: 0` suppresses the line. `orders.deal_savings` exists and would settle it, but the customer path does not populate it. **Separate work.**

⚠️ **THE `?confirm=` URL IS PERMANENT AND UNAUTHENTICATED.** It is an unguessable UUID and now truck-scoped, so it is no weaker than the email's `/order/{key}/manage` link that has always existed — **but it is a second such link, and it shows more** (items, modifiers, notes, the customer's email address). **Not established** whether that warrants an expiry; flagging it rather than deciding it.
