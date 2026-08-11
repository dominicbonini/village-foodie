# Would fixing the field name make price validation authoritative?

**Date:** 11 August 2026
**READ-ONLY. No file changed, no file created except this report. No `next dev`, no `next build`.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE DIRECT ANSWER

**NO. Renaming the field would make the validation RUN, not make it AUTHORITATIVE.**

**`calculateOrderTotal` takes the unit price from the SUBMITTED ITEM** (`item.price`, line 84). It never looks a price up by name or id for the items arm. **So a corrected field name would compute `client_price × client_quantity`, sum it, and compare the result to `client_subtotal` and `client_total` — the client's own numbers on both sides of the comparison.**

**It would pass for a client that lies consistently**, which is the only kind of client worth defending against.

⚠️ **Two arms ARE server-sourced and would become real checks:** the **bundle price** and the **discount code**, both fetched from the database in the submit route. **The items arm — the bulk of a typical order — would not.**

---

## 1. `calculateOrderTotal` in full

**Source: QUOTED.** `lib/order-calculations.ts:76-133`, every line, unmodified.

```ts
  export function calculateOrderTotal(
    items: OrderItem[],
    deals: AppliedDeal[],
    menuItems: MenuItem[],
    discountCode?: DiscountCode | null
  ): OrderCalculation {
    // 1. Calculate items subtotal (individual items, not in deals)
    const itemsTotal = items.reduce((sum, item) => {
      return sum + (item.price * item.quantity)
    }, 0)
    
    // 2. Calculate deals total (what customer pays for deals, including modifier pass-through)
    const dealsTotal = deals.reduce((sum, deal) => {
      return sum + deal.bundle.bundle_price + (deal.modifierExtra || 0)
    }, 0)

    // 3. Calculate deal savings (original price - effective deal price)
    const dealSavings = deals.reduce((sum, deal) => {
      const effectivePrice = deal.bundle.bundle_price + (deal.modifierExtra || 0)
      // If bundle has fixed original_price, use it
      if (deal.bundle.original_price && deal.bundle.original_price > 0) {
        const saving = deal.bundle.original_price - effectivePrice
        return sum + Math.max(0, saving)
      }

      // Otherwise calculate from selected items
      const originalPrice = calculateDealOriginalPrice(deal.slots, menuItems)
      const saving = originalPrice - effectivePrice
      return sum + Math.max(0, saving)
    }, 0)
    
    // 4. Calculate subtotal (before discount codes)
    const subtotal = itemsTotal + dealsTotal
    
    // 5. Calculate discount code amount
    let discountAmt = 0
    if (discountCode) {
      if (discountCode.type === 'pct') {
        // Percentage discount
        discountAmt = subtotal * (discountCode.value / 100)
      } else {
        // Fixed amount discount
        discountAmt = discountCode.value
      }
    }
    
    // 6. Calculate final total (can't be negative)
    const total = Math.max(0, subtotal - discountAmt)
    
    return {
      itemsTotal,
      dealsTotal,
      dealSavings,
      subtotal,
      discountAmt,
      total
    }
  }
```

⚠️ **Its own doc comment (line 63) calls it the "SINGLE SOURCE OF TRUTH for all order calculations" and (line 72) describes `menuItems` as "Full menu for price lookup".** §2 and §3 establish that neither claim holds for the items arm.

---

## 2. What `menuItems` is used for

**Source: QUOTED. It is read on exactly ONE line inside the function:**

```ts
102        const originalPrice = calculateDealOriginalPrice(deal.slots, menuItems)
```

**That is the only read.** It sits inside the **`dealSavings`** reduce (lines 93-105), and only in the `else` branch — reached when `deal.bundle.original_price` is falsy or ≤ 0.

🔴 **`dealSavings` is a DISPLAY figure. It is returned (line 128) but never feeds `subtotal` (108) or `total` (123).**

🔴 **SO `menuItems` HAS NO EFFECT ON ANY VALIDATED NUMBER.** `validateOrderTotals` compares `subtotal`, `discountAmt` and `total` — none of which `menuItems` can influence. **It is not an unused parameter, but for validation purposes it may as well be.**

⚠️ **The doc comment calling it "Full menu for price lookup" is misleading**: it is a savings-display lookup, not a price-authority lookup.

---

## 3. 🔴 Items arm — submitted item, or menu lookup?

**Source: QUOTED. The line that settles it — `lib/order-calculations.ts:84`:**

```ts
      return sum + (item.price * item.quantity)
```

🔴 **FROM THE SUBMITTED ITEM. Both factors.** There is no `menuItems.find(...)`, no id lookup, no name join in the items arm. **The function trusts the payload for the unit price and for the quantity.**

**For contrast — the function DOES know how to look a price up.** `calculateDealOriginalPrice` (lines 49-59) does exactly that:

```ts
      const item = menuItems.find(i => i.name === itemName)
      return sum + (item?.price || 0)
```

⚠️ **So the capability exists in the same file and is simply not used for the items total.**

---

## 4. Deals arm and discount handling

### Deals — **from a database row, with a silent fallback**

**Inside the function (line 89):** `deal.bundle.bundle_price` — read from the passed object.

**Where `bundle` comes from on the server — `app/api/orders/submit/route.ts:492-500`, QUOTED:**

```ts
    const { data: bundles } = await supabase
      .from('bundles_db')
      .select('*')
      .eq('truck_id', resolvedTruckId)

    // Reconstruct deals
    const dealsForCalc = (deals || []).map((d: AppliedDeal) => ({
      bundle: bundles?.find(b => b.name === d.name) || { name: d.name, bundle_price: 0, original_price: null },
      slots: d.slots || {}
    }))
```

✅ **AUTHORITATIVE — the price comes from `bundles_db`**, matched by name, and **the client's `deals[].price` is discarded**.

⚠️ **Two caveats, both QUOTED:**
- 🔴 **An unmatched name falls back to `bundle_price: 0`**, so a deal the server cannot find contributes **nothing** to `dealsTotal` rather than raising.
- 🔴 **`modifierExtra` is NOT set by `dealsForCalc`.** Line 89 reads `(deal.modifierExtra || 0)`, and the server's mapping supplies only `{ bundle, slots }` — **so deal-slot modifier upcharges are always 0 in the server calculation**, while the client's own call site **does** pass `modifierExtra` (`order/page.tsx:816`).

### Discount — **from a database row**

**Inside the function (lines 112-120):** reads `discountCode.type` and `discountCode.value`.

**Where it comes from — `submit/route.ts:504-514`, QUOTED:**

```ts
    let discountCodeData = null
    if (discountCode) {
      const { data } = await supabase
        .from('discount_codes_db')
        .select('*')
        .eq('truck_id', resolvedTruckId)
        .eq('code', discountCode.toUpperCase())
        .eq('is_active', true)
        .single()
      discountCodeData = data
    }
```

✅ **AUTHORITATIVE — from `discount_codes_db`, filtered on `is_active`.** The client sends only a code string; the percentage or amount is the server's.

### Summary of authority per arm

| Arm | Source | Authoritative? |
|---|---|---|
| 🔴 **Items** (`itemsTotal`) | **the payload** — `item.price * item.quantity` | 🔴 **NO** |
| **Deals** (`dealsTotal`) | `bundles_db` | ✅ **Yes** — but 0 on a name miss |
| **Deal modifier extras** | never supplied server-side | 🔴 **always 0** |
| **Discount** (`discountAmt`) | `discount_codes_db` | ✅ **Yes** |
| `dealSavings` | `menuItems` | display only — **not validated** |

---

## 5. `validateOrderTotals` in full

**Source: QUOTED.** `lib/order-calculations.ts:143-176`, every line.

```ts
  export function validateOrderTotals(
    submitted: { subtotal: number; discountAmt: number; total: number },
    calculated: OrderCalculation,
    tolerance: number = 0.01
  ): { valid: boolean; error?: string } {
    // Check subtotal
    const subtotalDiff = Math.abs(submitted.subtotal - calculated.subtotal)
    if (subtotalDiff > tolerance) {
      return {
        valid: false,
        error: `Subtotal mismatch: submitted £${submitted.subtotal.toFixed(2)}, calculated £${calculated.subtotal.toFixed(2)}`
      }
    }
    
    // Check discount amount
    const discountDiff = Math.abs(submitted.discountAmt - calculated.discountAmt)
    if (discountDiff > tolerance) {
      return {
        valid: false,
        error: `Discount mismatch: submitted £${submitted.discountAmt.toFixed(2)}, calculated £${calculated.discountAmt.toFixed(2)}`
      }
    }
    
    // Check total
    const totalDiff = Math.abs(submitted.total - calculated.total)
    if (totalDiff > tolerance) {
      return {
        valid: false,
        error: `Total mismatch: submitted £${submitted.total.toFixed(2)}, calculated £${calculated.total.toFixed(2)}`
      }
    }
    
    return { valid: true }
  }
```

⚠️ **It compares three aggregates only.** It never inspects a line item, so **even a fully authoritative `calculateOrderTotal` would not catch a swapped item at the same total.**

---

## 6. Every call site

**Source: QUOTED**

### `calculateOrderTotal` — four real call sites, one unused import

| # | Site | Flow | Runs | The call |
|---|---|---|---|---|
| 1 | `app/trucks/[slug]/order/page.tsx:811` | **Customer path** | **client** | `basket.map(b => ({ name: b.menuItem.name, price: b.menuItem.price + b.modifiers.reduce((s, m) => s + m.price, 0), quantity: b.quantity }))` … `appliedDeals.map(d => ({ bundle: d.bundle, slots: d.slots, modifierExtra: d.modifierExtra }))`, `menu?.items \|\| []`, `appliedCode` |
| 2 | `components/dashboard/AddOrderPanel.tsx:320` | **Operator walk-up** | **client** | `manualItems.map(item => ({ name: item.name, price: item.unit_price, quantity: item.quantity }))`, `appliedDeals`, `truckMenu?.items \|\| []`, `null` |
| 3 | 🔴 `app/api/orders/submit/route.ts:517` | **Customer path** | **server** | `calculateOrderTotal(items, dealsForCalc, menuItems \|\| [], discountCodeData)` |
| 4 | `lib/order-repricing.ts:412` | **Edit path** (reached from `app/api/dashboard/action/route.ts:570`) | **server** | `const calculation = calculateOrderTotal(` … |
| — | `app/dashboard/[token]/page.tsx:45` | — | — | 🔴 **IMPORTED BUT NEVER CALLED** — `grep "calculateOrderTotal("` on that file returns nothing. **An unused import.** |

🔴 **THE DECISIVE COMPARISON.** Both client call sites **convert to `price` explicitly** — site 1 builds `price:` from the menu item plus modifiers, site 2 maps `price: item.unit_price`. **Site 3, the server one, passes `items` straight through with no mapping at all**, which is precisely why `item.price` is `undefined` there and nowhere else.

⚠️ **Sites 1 and 2 are the reason the client's own totals are correct** — the same function, given the right field, works.

### `validateOrderTotals` — exactly ONE call site

| Site | Flow | The call |
|---|---|---|
| `app/api/orders/submit/route.ts:525` | **Customer path**, server | `validateOrderTotals({ subtotal, discountAmt: discountAmt ?? 0, total }, serverCalculation, 0.01)` |

🔴 **Nothing else in the codebase validates a submitted total against a server calculation.** The operator walk-up path and the edit path never call it.

---

## 7. The writer of `orders.total_minor`

**Source: QUOTED**

### Customer path — inside `place_order_atomic`

**`supabase/migrations/20260804_place_order_atomic_placed_at.sql:74-103`, INSERT column list and the value:**

```sql
  insert into orders (
    id, truck_id, customer_name, customer_email, customer_phone, slot, order_type,
    event_date, event_id, van_id, items, deals, discount_code, subtotal, discount_amt,
    total, total_minor, notes, status, payment_status, placed_at
  ) values (
    …
    (p_order->>'total')::numeric,
    round(coalesce((p_order->>'total')::numeric, 0) * 100)::integer,
    …
  )
  returning order_key into v_order_key;
```

🔴 **`total_minor = round(p_order.total × 100)`, and `p_order.total` is the CLIENT'S `total`** — passed straight through from the request body at `submit/route.ts:917` (`total,`). **The migration says so itself** (`20260728_orders_total_minor_deal_savings.sql:51`):

> *"total_minor is computed INSIDE the function from the total the caller passed — the TS never sends"*

**No trigger.** A grep of every migration for a trigger or function setting `total_minor` returns only comments and a one-off backfill note. **Not established** that any trigger exists; none was found.

### Operator paths — for contrast, QUOTED

| Site | Value |
|---|---|
| `app/api/dashboard/action/route.ts:1061` | `total_minor: toMinor(finalTotal),` — with the comment at `:1060`: *"§4a — pence, derived here from the server-held total. **Never client-supplied.**"* |
| `app/api/dashboard/action/route.ts:692` | `total_minor: newTotalMinor,` — the edit path, from `order-repricing` |

🔴 **So the walk-up and edit paths derive `total_minor` from a server-held number, and the customer path derives it from the client's.** The comment at `:1060` asserts a discipline the customer path does not follow.

---

## 8. `amountMinor` in the Checkout route

**Source: QUOTED.** `app/api/stripe/checkout/route.ts:98`:

```ts
    const amountMinor = toMinor(Number(order.total ?? 0))
    if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
      return NextResponse.json({ error: 'This order has no payable amount' }, { status: 409 })
    }
```

**`toMinor` — `lib/order-repricing.ts:423-425`:**

```ts
export function toMinor(amount: number): number {
  return Math.round(num(amount) * 100)
}
```

**`order.total` comes from the row read at the top of the route** (`.select('order_key, id, truck_id, total, status, payment_status')`).

### 🔴 Where that number originated

**`orders.total` ← `p_order.total` ← the client's `total` field**, unvalidated (§3, §7).

🔴 **So the amount charged to a customer's card traces back, with no server-side arithmetic in between, to a number the browser posted.** The only checks between are:

| Check | Where |
|---|---|
| `validateOrderTotals` | 🔴 **inert** — proven in the previous audit |
| `Number.isInteger(amountMinor) && amountMinor > 0` | `checkout/route.ts:99` — **rejects only zero, negative and non-integer**, not wrong |

⚠️ **It reads `orders.total`, not `orders.total_minor`**, then re-derives pence. Both come from the same client number, so this is a consistency observation, not a second defect.

---

## Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — full function, unmodified |
| 2 | **QUOTED** — the single read at line 102; the "no effect on validated numbers" conclusion is **INFERRED** from the quoted data flow (`dealSavings` is returned but not summed into `subtotal`/`total`) |
| 3 | **QUOTED** — line 84, plus the contrasting lookup at 57-58 |
| 4 | **QUOTED** — both server-side sources; the `modifierExtra`-always-0 and `bundle_price: 0` fallback findings are **QUOTED** from `dealsForCalc` |
| 5 | **QUOTED** — full function |
| 6 | **QUOTED** — all call sites; the "imported but never called" finding is a **QUOTED** negative grep |
| 7 | **QUOTED** — INSERT column list and value expression, plus the migration's own comment. "No trigger" is an **exhaustive negative search**. |
| 8 | **QUOTED** — the derivation and `toMinor`. The provenance chain is **INFERRED** from §7's quoted data flow. |

## Not established

- Whether any database trigger sets `total_minor` — **none was found**, but I searched migrations rather than the live schema.
- Whether `deals[].price` (sent by the client, `order/page.tsx:1144`) is read anywhere on the server — **it is not read by `dealsForCalc`**; whether another consumer reads it from the stored `orders.deals` JSONB was outside this pass.
- Whether an order can be items-free (deals only), which is the one shape where today's inert calculation would produce a real number rather than `NaN`.
