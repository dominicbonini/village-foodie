# Server-side pricing on both order-creation paths — the build

**Date:** 12 August 2026
**BUILD. Six files changed. No migration needed and none written — see §7. No `next dev`, no `next build`. Nothing committed, nothing deployed.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# ✅ WHAT NOW HOLDS

**The client never decides money on either order-creation path.** Both submit and walk-up resolve every price from `menu_items_db` / `modifier_options` / `bundles_db`, truck-scoped, through the ONE engine (`lib/order-repricing`). The stored `orders.items[].unit_price`, every `modifiers[].price`, every `deals[].price`, and `subtotal` / `discount_amt` / `total` / `total_minor` / `deal_savings` are server-derived.

**The one client money field that survives is the operator's, and it is now labelled as such** — `price_override`, sent explicitly, stored explicitly, stripped on the customer path.

**The customer makes no additional network request.** The page fetch count is unchanged; the local running total is untouched.

🔴 **AND THE GUARD THAT WAS SUPPOSED TO CATCH THIS IS GONE, NOT WEAKENED.** `validateOrderTotals` had never once rejected an order. §6 proves it, with the NaN.

---

## 1. What changed, file by file

| File | What |
|---|---|
| `app/api/orders/submit/route.ts` | Customer path priced server-side. Dead validation removed. 409 on an unpriceable line. |
| `app/api/dashboard/action/route.ts` | Walk-up (`manual`) priced server-side, with the operator override. |
| `components/dashboard/AddOrderPanel.tsx` | `InlinePriceEditor` now declares its override; handles the `needsPriceConfirm` 409. |
| `components/dashboard/types.ts` | `BasketItem.price_override`. |
| `lib/order-calculations.ts` | `validateOrderTotals` deleted. |
| `app/trucks/[slug]/order/page.tsx` | One line: the existing stock-409 branch now shows the server's message. |
| 🔴 `lib/order-repricing.ts` | **UNTOUCHED.** Called, not rewritten, exactly as instructed. |

`git diff --stat` — 360 insertions, 105 deletions across six files.

---

## 2. 🔴 THE OPERATOR PRICE OVERRIDE — THE FIELD NAMES

The capability stays. What changed is that it is now **declared** rather than indistinguishable from an ordinary price.

### On the wire

```
items[].price_override    number, pounds — the operator's hand-set UNIT price for that line.
                          ABSENT on every line they did not touch.
```

### In the stored row (`orders.items[]`)

| Field | Meaning | Present when |
|---|---|---|
| `unit_price` | The **effective** price. The override where one was set, the book price otherwise. **Meaning unchanged**, so all thirty-odd existing readers are untouched. | always |
| 🔴 `price_override` | The operator's figure, echoed back. **Its PRESENCE is the audit marker** — a line carrying it was priced by a human, and no other line can be. | override only |
| `book_price` | What the menu said at that moment. So the adjustment is reconstructable later without menu archaeology. | override only |

**`AddOrderPanel.tsx:1523-1533` — the editor now writes both:**

```tsx
  <InlinePriceEditor price={item.unit_price} quantity={item.quantity}
    onChange={p => setManualItems(prev => prev.map(i => (i.cartKey || i.name) === rowKey ? { ...i, unit_price: p, price_override: p } : i))} />
```

⚠️ `unit_price` is still written **because the panel's own running total, line totals and payment button all read it** — the brief forbids changing the local total, and this is how it stays correct with no other change. `price_override` is the declaration that rides alongside.

### 🔴 THE OVERRIDE IS APPLIED THROUGH PRICE-LOCK, NOT AROUND IT

The engine already has a mechanism for "this line's price is not the menu's price": price-lock. So the walk-up runs it **twice**, and performs no money arithmetic of its own:

```ts
// PASS 1 — the book, and only the book. This is also where `unresolved` is decided.
const booked = repriceOrder(manualItemsIn, deals, priceBook, {})
const hasOverride = overrideByIndex.some(v => v !== null)
// PASS 2 — the same engine, price-locked to pass 1, with the operator's figures substituted.
const priced = hasOverride
  ? repriceOrder(manualItemsIn, deals, priceBook, {
      items: booked.items.map((line, i) =>
        overrideByIndex[i] === null ? line : { ...line, unit_price: overrideByIndex[i] }),
      deals: booked.deals,
    })
  : booked
```

✅ **The totals still come out of `calculateOrderTotal` inside the engine.** No second implementation, and no `reduce` over money at the call site. Cost is CPU only — **no extra query**.

⚠️ **When no line is overridden, pass 2 is skipped entirely** and the result is byte-identical to a single pass.

### Validation, and what is refused

```ts
const readOverride = (it: { price_override?: unknown } | null | undefined): number | null => {
  const v = it?.price_override
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) && n >= 0 ? n : null
}
```

| Sent | Result (measured, §8e) |
|---|---|
| `4.00` | `unit_price` 4.00, `price_override` 4.00, `book_price` 11.00 |
| `0` | `unit_price` 0.00, `price_override` 0 — **a deliberate comp, and marked as one** |
| `-5` | ignored — priced from the book, no marker |
| `"free"` | ignored |
| `null` / `""` | ignored |

### Two places the override could have leaked, and does not

1. 🔴 **The customer path strips it.** `submit/route.ts` deletes `price_override` and `book_price` from every line **before** the engine sees them — the engine passes unknown keys straight through to the stored row, so an unstripped one would land there and read exactly like an operator's. **Structural, not a rule someone has to remember.**
2. ⚠️ **A stale override cannot follow an edited line.** `confirmAddFromModal` spreads the existing basket line; without clearing, an override set before the modifiers changed would survive onto a line whose correct price is now different. It is explicitly cleared:

```tsx
  return without.concat({ ...editEntry, modifiers: modalMods, specialInstructions: modalNotes || undefined, unit_price: newUnitPrice, price_override: undefined, cartKey: newKey })
```

---

## 3. The customer path — before and after

### The pricing point

**BEFORE** (`submit/route.ts:527-547`):

```ts
    // Calculate totals server-side
    const serverCalculation = calculateOrderTotal(items, dealsForCalc, menuItems || [], discountCodeData)
    // Validate submitted totals
    const validation = validateOrderTotals({ subtotal, discountAmt: discountAmt ?? 0, total }, serverCalculation, 0.01)
    if (!validation.valid) {
      console.error('[ORDER VALIDATION]', validation.error)
      return NextResponse.json({ error: 'Order total validation failed. Please refresh and try again.' }, { status: 400 })
    }
```

**AFTER:**

```ts
    const customerItems: RepriceItem[] = (items || []).map((it: RepriceItem) => {
      const copy = { ...it }
      delete copy.price_override
      delete copy.book_price
      return copy
    })
    const priceBook = await loadPriceBook(supabase, resolvedTruckId)
    const repriced = repriceOrder(customerItems, deals, priceBook, {}, discountCodeData as DiscountCode | null)
    …
    const pricedItems = repriced.items
    const pricedDeals = repriced.deals
    const serverTotalMinor = toMinor(repriced.calculation.total)
    const serverTotal = serverTotalMinor / 100
    const serverSubtotal = repriced.calculation.subtotal
    const serverDiscountAmt = repriced.calculation.discountAmt
```

⚠️ **`{}` — no `stored` argument.** The order does not exist yet, so nothing price-locks and every line resolves from the book. Price-lock exists to protect an EXISTING order from a later menu change; on a first placement the live menu **is** the authority.

⚠️ **PENCE FIRST, then pounds from the pence** — the same ordering the edit path uses, so `total` and `total_minor` are the same number by construction. The RPC derives `total_minor` as `round(total * 100)`.

### The row

**BEFORE** (`p_order`):
```ts
        items,
        deals:          deals ?? null,
        subtotal:       subtotal ?? total,
        discount_amt:   discountAmt ?? 0,
        total,
```

**AFTER:**
```ts
        items:          pricedItems,
        // `deals ? … : null` and NOT `?? null` — an empty array must keep storing as [], exactly as
        // `deals ?? null` did, because [] ?? null is []. Only a null/absent deals array stores null.
        deals:          deals ? pricedDeals : null,
        subtotal:       serverSubtotal,
        discount_amt:   serverDiscountAmt,
        total:          serverTotal,
```

⚠️ **The `?? null` → `? :` change is deliberate and preserves existing behaviour exactly.** `[] ?? null` is `[]`, so an empty deals array stored as `[]` before and must continue to.

---

## 4. 🔴 EVERYTHING THAT READ MONEY BEFORE THE ROW IS WRITTEN

The audit named two. There were more once the reprice point moved, and all of them are repointed.

| # | Site | Before | After |
|---|---|---|---|
| 1 | `validateOrderTotals` guard | client `subtotal`/`discountAmt`/`total` | **DELETED** (§6) |
| 2 | `formatWhatsAppOrder` | request body | ⚠️ **NO CALL SITE — annotated, see below** |
| 3 | `computeEventUnitRows` (capacity) | `items`, `deals` | `pricedItems`, `deals ? pricedDeals : null` |
| 4 | `p_order` (the INSERT) | body | server-priced, above |
| 5 | `formatNewOrderEmail` (truck) | `items`, `deals \|\| []`, `total` | `pricedItems`, `pricedDeals`, `serverTotal` |
| 6 | `formatConfirmationEmail` (customer) | `items`, `dealsWithPrice`, `discountAmt ?? 0`, `total` | `pricedItems`, `pricedDeals`, `serverDiscountAmt`, `serverTotal` |
| 7 | the success response's `total` | client `total` | `serverTotal` |

### ⚠️ THE WHATSAPP FORMATTER HAS NO CALL SITE. THAT CORRECTS THE AUDIT.

The preceding audit listed it as a pre-insert money read, which is true of its **body**. A repo-wide grep finds exactly one occurrence of `formatWhatsAppOrder` — the definition. **Nothing invokes it.** So there is nothing to repoint: the money it reads has never been printed anywhere.

Deleting a 65-line unused formatter is outside this change, so it is left in place and **annotated** so the fact is discoverable rather than rediscovered:

```ts
// ⚠️ NO CALL SITE. A repo-wide grep finds exactly one occurrence of `formatWhatsAppOrder` — this
// definition. Nothing invokes it, so nothing it computes reaches anybody…
//
// 🔴 IF IT IS EVER WIRED UP, IT MUST BE HANDED THE REPRICED ARRAY. … Pass `pricedItems` /
// `serverDiscountAmt` / `serverTotal` (see the reprice block in POST), never `items` /
// `discountAmt` / `total` from the body.
```

### ⚠️ `dealsWithPrice` IS GONE, AND THAT CLOSES A REAL SPLIT

It re-read `bundles_db` to give the **email** a server bundle price while the stored row kept the client's. Row and email now read the same repriced array and cannot disagree.

---

## 5. The walk-up path

**BEFORE** (`action/route.ts:965`) — the panel's own arithmetic, re-added up:

```ts
      const total = (items || []).reduce((s: number, i: any) => s + (parseFloat(i.unit_price) * parseInt(i.quantity)), 0)
```

**AFTER** — the two passes of §2, then:

```ts
          items: pricedItems, deals: pricedDeals, discount_code: null,
          subtotal: serverSubtotal, discount_amt: serverDiscountAmt, total: serverTotal,
          deal_savings: serverDealSavings > 0 ? serverDealSavings : null,
          total_minor: serverTotalMinor,
```

🔴 **AND THE FOUR CLIENT MONEY FIELDS ARE NO LONGER EVEN DESTRUCTURED:**

```ts
      const { customerName, customerPhone, customerEmail, slot, items, notes, event_date: passedEventDate, event_id: passedEventId } = manualOrder
```

⚠️ The panel still **sends** `total`, `subtotal`, `discountAmt` and `dealSavings` (an offline outbox replay from an older build will too) and the server now reads **none** of them. Leaving them bound would leave four client money values in scope for a future edit to reach for by accident — which is the whole failure mode this change exists to close.

⚠️ `deal_savings` is now `calculateOrderTotal`'s figure rather than the panel's. §4b's rule is unchanged and now **enforced by the engine**: notional, its own column, never subtracted from `total`.

`manualEmailItems` is built from `pricedItems`, so both walk-up emails quote the row.

---

## 6. 🔴 THE DEAD GUARD — REMOVED, AND PROVED DEAD FIRST

`validateOrderTotals` is deleted from `lib/order-calculations.ts`. Its one call site is gone. A comment block replaces it stating what it was and why it never worked.

**Measured, on a real order (§8a):**

```
THE GUARD THIS REPLACES, on the same forgery:
  calculateOrderTotal itemsTotal (reads item.price, which is absent) = NaN
  Math.abs(0.01 - NaN) > 0.01  => false (false => valid => order accepted at 0.01)
```

🔴 **`Math.abs(x - NaN) > tolerance` is `false` for every x.** Every order ever submitted passed. It had been blind for its entire life and looked, in the code, exactly like a working guard.

✅ **`calculateOrderTotal` STAYS** and is used more than ever — the customer basket, the Add Order panel, the dashboard edit modal, and `repriceOrder` all combine money through it. Only the submit-side **call site** and `validateOrderTotals` are removed.

**Also removed, both made dead by this change and both otherwise a place for a future edit to re-derive a price outside the engine:**

- `dealsForCalc` — existed only to feed the removed call.
- The `bundles_db` read at `:503`. Its only two consumers were `dealsForCalc` and `dealsWithPrice`. `loadPriceBook` reads the same table itself.

⚠️ **SO THE NET QUERY COST IS +3, NOT +4.** The price book adds four; this removes one. The audit predicted +2 on the assumption that the two existing reads could be threaded in — they cannot, because threading them means changing `loadPriceBook`'s signature, and the brief forbids touching `lib/order-repricing.ts`. **Stated rather than quietly absorbed.** All three are server-to-database, inside the request the customer is already making.

---

## 7. What was NOT touched, and no migration

| Constraint | Held? |
|---|---|
| Client's local running total | ✅ **UNTOUCHED.** `calculateOrderTotal` at `order/page.tsx:915` unchanged |
| Menu payload | ✅ **UNTOUCHED** |
| No additional customer network request | ✅ **NONE.** The count from page open to placed order is unchanged |
| Operator's ability to adjust a line price | ✅ **KEPT**, and now auditable |
| `lib/order-repricing.ts` pricing logic | ✅ **NOT ONE LINE CHANGED** |
| Dead discount-code feature / duplicated helpers | ✅ **UNTOUCHED** |
| Deals arm beyond what pricing requires | ✅ **UNTOUCHED** |

### 🔴 NO MIGRATION IS NEEDED AND NONE WAS WRITTEN

`price_override` and `book_price` live **inside the existing `orders.items` jsonb column**. No new column, no schema change, nothing for you to run by hand.

### ⚠️ ONE CHANGE OUTSIDE THE SERVER, AND WHY

`app/trucks/[slug]/order/page.tsx` — inside the **existing** stock-409 branch:

```tsx
        setStockNotice(
          shortItems.length
            ? shortItems.map(s => `only ${s.remaining} ${s.name} left`).join(', ')
            : (typeof data.error === 'string' && data.error ? data.error : 'some items just sold out')
        )
```

This branch now answers two server refusals that want **identical handling** — keep the basket, re-fetch the menu, tell the customer — but not identical **wording**: a sold-out line sends per-item remainings, a line that could not be **priced** sends none, and "some items just sold out" would then be a plain untruth. No new state, no new branch, no new request. **Instruction 4 said not to invent a new error surface, and this does not: it reuses the one that exists.**

---

## 8. 🔴 VERIFICATION — AGAINST REAL DATABASE ROWS

A read-only script imported the **real `lib/order-repricing.ts`** (via jiti, path alias resolved) and the live Supabase service client, and transcribed each route's pricing block byte-for-byte. **Nothing was written. The scripts are deleted.**

⚠️ `tsc --noEmit` is clean and eslint shows **one fewer error than baseline** (74 → 73, zero new) — but neither is offered as verification. The NaN passed tsc for months.

### (a) 🔴 THE GUARD FIRES — a forged £0.01 against a real £9.50 order

```
REAL ORDER          : b123bd9a-62b3-4bcc-ba93-b72b18ce966f #2 truck=test-truck
DISH                : "Green Curry Chicken" — menu_items_db.price = 9.5
STORED unit_price   : 9.5  stored total = 47.5

FORGED PAYLOAD      : [{"name":"Green Curry Chicken","quantity":1,"unit_price":0.01}]
  claims subtotal   : 0.01   discountAmt: 0   total: 0.01

SERVER PRICES IT AT :
  items[0].unit_price = 9.5
  subtotal            = 9.5
  total               = 9.5  total_minor = 950
  unresolved          = []

PASS - the forged 0.01 was discarded; the order prices at 9.50
```

✅ **£0.01 claimed. £9.50 charged.** And the guard it replaces, on the same forgery, returned `valid` (§6).

### (b) Every order in the database, re-priced through the new submit path

```
orders read: 447

EXACT MATCH        : 445
DIFFER             : 2
THREW              : 0
WOULD 409 (unresolved, of the differing): 0
WOULD 409 (unresolved, of the matching) : 3

LARGEST DELTAS:
  test-truck             #13    stored     28.5 -> server       30  delta      1.5
  test-truck             #16    stored       33 -> server     34.5  delta      1.5

DIFFERING BY TRUCK: {"test-truck":2}
ALL ORDERS BY TRUCK: {"pizzeria-gusto":224,"test-truck":103,"demo-ekwwmqeej70hd5da4d61wzetcw":37,
                      "demo-15yy2ecnkemmchrr8np69p29n8":15,"demo-m1y02c2mgqag1y4b79401af4hm":33,
                      "demo-krh2c8ksabdv28ccprswbfhkdk":35}
```

✅ **445 / 447 exact, 2 differing, 0 threw.** Better than yesterday's 424 / 426 — the same two divergent orders, 21 more orders since, and the two are the known Extra-cheese pair (§8d). **Nothing worse to explain.**

**Coverage of that sweep, stated honestly:**

```
  item lines priced         : 979
  modifier selections priced: 90
  orders carrying modifiers : 69
  orders carrying deals     : 0
  orders carrying a discount code: 0
```

⚠️ **ZERO ORDERS IN THE DATABASE CARRY A DEAL AND ZERO CARRY A DISCOUNT CODE, AND `bundles_db` HAS NO ROWS AT ALL.** The sweep therefore exercises **items and modifiers only**. The deals arm could not be driven from real rows, so it was driven from the **real test-truck price book with one synthetic bundle grafted on** — live item and modifier resolution, invented bundle:

```
a la carte from the LIVE book: 9.5 + 6.5
CLIENT SENT: deals[].price = 0.01, slot modifier Extra cheese = 0.00
SERVER STORED deals[0]     = {"price":15,"slotModifiers":{"slot_1":[{"name":"Extra cheese","price":1.5}]}}
  total = 16.5  dealSavings = 2.5  unresolved = []
  PASS - bundle 15.00 from the book, slot modifier 1.50 from the book, total 16.50
```

And the three refusal branches:

```
UNKNOWN BUNDLE -> unresolved: [{"kind":"deal","name":"A Bundle That Does Not Exist","advisoryPrice":3}] => customer path 409
UNKNOWN DISH   -> unresolved: [{"kind":"item","name":"A Dish That Does Not Exist","advisoryPrice":3}] => customer path 409
UNKNOWN EXTRA  -> unresolved: [{"kind":"modifier","name":"Truffle Shavings","on":"Chicken Satay","advisoryPrice":0}] => customer path 409
```

### ⚠️ THE THREE ORDERS THAT WOULD 409 TODAY

```
{"t":"pizzeria-gusto","id":"2","stored":40.5,"server":40.5,"delta":0,"u":[{"kind":"item","name":"Nutella Dream","advisoryPrice":6.5}]}
{"t":"pizzeria-gusto","id":"11","stored":39.5,"server":39.5,"delta":0,"u":[{"kind":"item","name":"Dolce Biscoff","advisoryPrice":6.5},{"kind":"item","name":"Nutella Dream","advisoryPrice":6.5}]}
{"t":"pizzeria-gusto","id":"32","stored":32.5,"server":32.5,"delta":0,"u":[{"kind":"item","name":"Dolce Biscoff","advisoryPrice":6.5}]}
```

```
those dishes on the CURRENT menu_items_db: []
```

These are three historical orders for **desserts that no longer exist on the menu**. Their totals still match exactly (the advisory price equalled the menu price at the time). Under the new rule an order containing them **today** would be refused — which is correct: no customer can add a dish that is not on the menu they were served, so this fires only for a stale basket or a crafted request, and the 409 sends them back to a refreshed menu. **It is the only behaviour change that can refuse a real order, and it is stated rather than buried.**

### (c) pizzeria-gusto specifically

```
=== (c) pizzeria-gusto ===
orders                 : 224
price identically      : 224
differ                 : 0
largest |delta|        : 0.00
sum stored             : £5622.50
sum server-repriced    : £5622.50
would 409 today        : 3 #2 Nutella Dream, #11 Dolce Biscoff/Nutella Dream, #32 Dolce Biscoff
```

✅ **224 of 224 identical. £5,622.50 either way, to the penny.**

### (d) The two known-divergent Test Kitchen walk-ups

```
modifier_options row(s): [{"name":"Extra cheese","price_adjustment":1.5,"group_id":"19dd44f2-…","modifier_groups":{"name":"Extras 1","truck_id":"test-truck"}}]

ORDER #13 5d949dcc-0a93-4e3f-81ad-83991a92c966
  line 0: Beef with Oyster Sauce x1
     STORED unit_price 9.5   modifiers [Extra cheese=0]
     SERVER unit_price 11    modifiers [Extra cheese=1.5]
  STORED total 28.5  -> SERVER total 30  delta 1.50
  Extra cheese now priced at: [1.5]  PASS - 1.50

ORDER #16 b4d3327b-24a4-410f-a9f2-91f6ea9b1e96
  line 2: Chicken Katsu Curry x1
     STORED unit_price 10    modifiers [Extra cheese=0]
     SERVER unit_price 11.5  modifiers [Extra cheese=1.5]
  STORED total 33  -> SERVER total 34.5  delta 1.50
  Extra cheese now priced at: [1.5]  PASS - 1.50
```

✅ **Both now price Extra cheese at 1.50, the `modifier_options.price_adjustment` figure.** £3.00 of revenue that the client gave away, on two orders, silently.

### (e) 🔴 THE OPERATOR OVERRIDE — survives, and is distinguishable

Run through a transcription of the walk-up handler's two-pass block, against the live test-truck book:

```
menu_items_db prices in play: {"Green Curry Chicken":9.5,"Chicken Satay":6.5}  Extra cheese on Green Curry Chicken: 1.5

PANEL SENDS:
  {"name":"Green Curry Chicken","quantity":1,"unit_price":4,"price_override":4,"modifiers":[{"name":"Extra cheese","price":0}]}
  {"name":"Chicken Satay","quantity":2,"unit_price":6.5}

SERVER STORES orders.items:
  {"name":"Green Curry Chicken","quantity":1,"unit_price":4,"modifiers":[{"name":"Extra cheese","price":1.5}],"price_override":4,"book_price":11}
  {"name":"Chicken Satay","quantity":2,"unit_price":6.5}

  total    = 17  total_minor = 1700  subtotal = 17
  unresolved = []

  line 0 unit_price      = 4    the OVERRIDE survived
  line 0 price_override  = 4    <- the audit marker: a human set this
  line 0 book_price      = 11  (menu would have said 11) OK
  line 0 modifier price  = 1.5   server-priced, NOT the 0 the panel sent
  line 1 unit_price      = 6.5   price_override = undefined   book_price = undefined   <- no marker: an ordinary, server-priced line
  total check: 4.00 + 2 x 6.5 = 17.00 PASS
```

✅ **The override survived at £4.00. The book price £11.00 is recorded beside it. The line is unmistakable in the stored row. The other line carries no marker.**
⚠️ **And note line 0's modifier: the panel sent `Extra cheese = 0` and the server stored `1.50`.** An override sets the LINE price; it does not license a wrong modifier price underneath it.

**The same payload on the customer path:**

```
THE SAME PAYLOAD ON THE CUSTOMER PATH (price_override stripped):
  {"name":"Green Curry Chicken","quantity":1,"unit_price":11,"modifiers":[{"name":"Extra cheese","price":1.5}]}
  {"name":"Chicken Satay","quantity":2,"unit_price":6.5}
  total = 24   PASS - the override was discarded and the field did not reach the row
```

✅ **£17 for the operator who set it. £24 for anyone else sending the identical bytes.**

**Malformed overrides:**

```
  price_override=-5       -> unit_price 6.5   price_override undefined
  price_override="free"   -> unit_price 6.5   price_override undefined
  price_override=null     -> unit_price 6.5   price_override undefined
  price_override=""       -> unit_price 6.5   price_override undefined
  price_override=0        -> unit_price 0     price_override 0
```

---

## 9. The unpriceable-line refusals

| Path | Behaviour |
|---|---|
| 🔴 **Customer** | **409, in the EXISTING `{ error, stock: true, items: [] }` shape.** The order page's existing handler keeps the basket, re-fetches `/api/menu`, and shows the message. `items: []` because nothing is out of stock, so `capBasketToRemaining([])` is a no-op. The refusal is logged with every unresolved reference and the client's advisory figure. |
| ⚠️ **Walk-up** | **409 `needsPriceConfirm`, the edit handler's existing pattern** — `{ needsPriceConfirm, total, subtotal, discountAmt, unresolved }`. A human is standing there, so it is a question. The panel prompts with the names and the total, and re-submits with `confirmUnresolvedTotal`. **Nothing is written on this branch — no lock taken, no counter advanced, no row inserted.** |

🔴 **An OVERRIDE is not an unresolved.** The operator setting a price is an answer, not a question.

⚠️ **The acknowledgement is ONE-SHOT.** `confirmUnresolvedTotalRef` is consumed the moment it is read into the payload:

```tsx
      // 🔴 ONE-SHOT, CONSUMED THE MOMENT IT IS READ. An acknowledgement authorises ONE total on ONE
      // submit. Left set, it would ride silently onto the next order and could authorise a figure the
      // operator never saw.
      confirmUnresolvedTotalRef.current = null
```

⚠️ The re-submit passes `override` **through unchanged** — a pricing answer must not silently authorise a stock oversell.

---

## 10. NON-ASCII CENSUS — before and after

| File | Before (total / distinct) | After (total / distinct) | New class? |
|---|---|---|---|
| `app/api/orders/submit/route.ts` | 1092 / 19 | 1205 / 19 | ✅ none |
| `app/api/dashboard/action/route.ts` | 2538 / 16 | 2657 / 16 | ✅ none |
| `lib/order-calculations.ts` | 10 / 2 | 3 / 2 | ✅ none |
| `components/dashboard/AddOrderPanel.tsx` | 2323 / 36 | 2402 / 36 | ✅ none |
| `components/dashboard/types.ts` | 57 / 9 | 62 / 9 | ✅ none |
| `app/trucks/[slug]/order/page.tsx` | 1877 / 39 | 1881 / 39 | ✅ none |

✅ **Every distinct set is identical to its baseline. No file gained a character class it did not already contain.**

### ⚠️ TWO VIOLATIONS I INTRODUCED AND CORRECTED

🔴 **`lib/order-calculations.ts` — the tightest file I touched (only `£` and `→`).** My replacement comment introduced **U+2014 EM DASH** and **U+2026 ELLIPSIS**. Caught by my own census on the first run (2 → 4 distinct), and rewritten with ASCII: `—` became `:`, and the ellipsis was removed. **Reported rather than quietly fixed** — the discipline is worth nothing if the misses go unrecorded.

⚠️ **A JSX syntax error, same edit round.** I wrote `{/* … */}` inside `rightSlot={…}`, which is an expression container, not a children position. `tsc` caught it (TS1005/TS1381/TS1382); corrected to a plain `/* */` block comment inside the expression.

---

## 11. What is NOT covered, stated plainly

- 🔴 **The deals arm and the discount arm are unexercised by real data** — there are **no bundles_db rows and no discount-coded orders anywhere in the database**. Both were driven synthetically against a live price book (§8b). They are not new code: this is the same `repriceOrder` the operator edit path has run in production since it shipped. But I have not proved them against a real order, and I am not claiming to have.
- ⚠️ **The three pizzeria-gusto orders that would 409 today** (§8b). Correct behaviour, and the only behaviour change that can refuse a real order.
- ⚠️ **`formatWhatsAppOrder` is dead code with a repointing note, not a repointing.** There is nothing to repoint (§4).
- ⚠️ **Net +3 database queries on the submit path**, not the +2 the audit predicted, because threading the two existing reads in would mean changing `lib/order-repricing.ts` (§6). Server-to-database; the customer's request count is unchanged.
- ⚠️ **The client's total is now an ESTIMATE and the server's is the fact.** If the menu changes between the menu fetch and the submit, the customer sees one figure and is charged another. The 30-second poll refreshes `truck` but not `menu`, so a long-open page holds a load-time snapshot. **Nothing here decides what the product should do about that** — show, refuse, or re-price — and it is a real question this architecture now forces.
- ⚠️ **Not run:** `next build`, any deployment, any commit. **No migration exists to run** (§7).
- ⚠️ **Standing, unchanged:** Site links unconfigured; `operators_stripe_account_livemode` and `orders_confirmation_slot_fields` still unapplied; §28 of the manual wrong about the rate limiter; the six contradictory refund sentences; `charge.refunded` unhandled.
