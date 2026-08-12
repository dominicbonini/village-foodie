# Pricing vs stock — ordering, exclusion, and the copy

**Date:** 12 August 2026
**READ-ONLY. No file changed, no file created except this report. No `next dev`, no `next build`. No commit, no deploy. No fix proposed or applied.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE SHORT ANSWERS

1. ✅ **A SOLD-OUT ITEM IS FULLY PRICEABLE.** `loadPriceBook` filters on **`truck_id` and nothing else** — no `is_active`, no `is_available`, no `available`, no `stock_count`, no soft-delete. **It is a strict superset of the customer menu.** A sold-out item cannot produce an unpriceable-line 409.
2. ⚠️ **PRICING RUNS FIRST — BEFORE ALL FOUR STOCK GUARDS, ON BOTH PATHS.** That ordering is only safe *because* of answer 1. It is a load-bearing dependency and it is not written down anywhere in the code.
3. ✅ A priced-but-out-of-stock item is refused by `checkStockShortfall` with **409 `stock: true`**, and the customer sees the per-item remaining message. The pricing step never sees it.
4. 🔴 **BUT THE UNPRICEABLE-LINE COPY RENDERS GARBLED.** I wrote a full sentence into a slot that interpolates a **fragment**. The customer would read *"Sorry — Sorry, the menu has changed … Please check your order. now. We've updated your order — please review and confirm."* **This is a defect I introduced and did not catch. §4.**

---

## 1. `loadPriceBook`'s queries, in full, and what they filter

**Source: QUOTED.** `lib/order-repricing.ts:183-203`:

```ts
export async function loadPriceBook(supabase: SupabaseClient, truckId: string): Promise<PriceBook> {
  const [{ data: itemRows }, { data: optionRows }, { data: bundleRows }, { data: linkRows }] = await Promise.all([
    supabase.from('menu_items_db').select('name, price').eq('truck_id', truckId),
    // SAME truck-scoping join as lib/option-stock.ts fetchTruckOptionsByName — modifier_options has no
    // truck_id of its own, only group_id → modifier_groups.truck_id. `id` is selected because
    // excluded_option_ids is a list of OPTION IDS, so exclusions cannot be applied without it.
    supabase
      .from('modifier_options')
      .select('id, name, price_adjustment, group_id, modifier_groups!inner(truck_id)')
      .eq('modifier_groups.truck_id', truckId),
    supabase.from('bundles_db').select('name, bundle_price, original_price').eq('truck_id', truckId),
    // WHICH DISH OFFERS WHICH GROUP — the reason optionPrice can be item-scoped at all.
    // 🔴 TRUCK-SCOPED VIA THE EMBED, not read whole. …
    supabase
      .from('item_modifier_groups')
      .select('group_id, excluded_option_ids, menu_items_db!inner(name, truck_id)')
      .eq('menu_items_db.truck_id', truckId),
  ])
```

### Filter audit, query by query

| # | Table | Every filter applied | `is_active`? | availability? | stock? | soft-delete? |
|---|---|---|---|---|---|---|
| 1 | `menu_items_db` | `.eq('truck_id', truckId)` | ❌ **NO** | ❌ **NO** | ❌ **NO** | ❌ none exists |
| 2 | `modifier_options` | `.eq('modifier_groups.truck_id', truckId)` (via `!inner`) | ❌ **NO** | ❌ **NO** | ❌ **NO** | ❌ none exists |
| 3 | `bundles_db` | `.eq('truck_id', truckId)` | ❌ **NO** | ❌ **NO** | ❌ **NO** | ❌ none exists |
| 4 | `item_modifier_groups` | `.eq('menu_items_db.truck_id', truckId)` (via `!inner`) | ❌ **NO** | ❌ **NO** | ❌ **NO** | ❌ none exists |

✅ **FOUR QUERIES. ONE FILTER EACH. ALL FOUR ARE TRUCK SCOPE. NOTHING ELSE.**

### The columns it could have filtered on, and does not

**Source: QUOTED** (live column lists, read from the database):

```
menu_items_db     : id, truck_id, category_id, name, description, price, image_path, is_available,
                    is_active, sort_order, stock_count, created_at, updated_at, allow_customer_edit,
                    allergens, dietary_info, default_stock, subcategory, subcategory_id, spiciness,
                    auto_accept, preorder_enabled, preorder_deadline_type, preorder_deadline_value,
                    preorder_past_action, allergens_verified
modifier_options  : id, group_id, name, price_adjustment, type, is_active, sort_order, created_at,
                    available, allergens, dietary_info, stock_count
item_modifier_groups : menu_item_id, group_id, excluded_option_ids
```

⚠️ **`is_available`, `is_active`, `stock_count` and `default_stock` all exist on `menu_items_db`. `is_active`, `available` and `stock_count` all exist on `modifier_options`. The price book reads none of them.** There is no soft-delete column on any of the four tables — a removed item is a deleted row.

### 🔴 THE PRICE BOOK IS A STRICT SUPERSET OF THE CUSTOMER MENU

**Source: QUOTED.** `/api/menu` DOES filter — `app/api/menu/[truckId]/route.ts:76-80`:

```ts
    supabase
      .from('menu_items_db')
      .select('*, default_stock, menu_categories!category_id(name)')
      .eq('truck_id', truck.id)
      .eq('is_active', true)
      .order('name'),
```

**So every dish a customer can see is priceable, and some dishes they cannot see are priceable too.** Measured on live data:

```
test-truck      items: 27  is_active=false: 0  is_available=false: 0
pizzeria-gusto  items: 46  is_active=false: 4  is_available=false: 0
```

The four inactive ones — `Dough Ball (1x)`, `Dough Ball (12x)`, `Dough Ball (24x)`, `Chorizo Rustico` — are hidden from the menu and **still priceable**. That is the safe direction: fewer refusals, not more.

### ✅ THE DIRECT ANSWER

**A sold-out item IS priceable.** "Sold out" is expressed by `menu_items_db.is_available`, `event_item_stock.available`, or an exhausted `stock_count` / `default_stock` ceiling — **not one of which the price book reads**. The row is still there with its `name` and `price`, so `priceBook.itemPrice[name]` resolves and `unresolved` stays empty.

**The only way to be unpriceable is for the ROW TO BE GONE** (deleted or renamed), or for a modifier option to be excluded from that dish via `item_modifier_groups.excluded_option_ids`. **Both are absences, not states.**

⚠️ Same for options: a manually sold-out option (`available: false`) still carries its `price_adjustment` and prices normally.

---

## 2. The order of the pricing step and the stock guards

### Customer path — `app/api/orders/submit/route.ts`

**Source: QUOTED**, line numbers as they now stand:

| Order | Line | Step | Refusal |
|---|---|---|---|
| **1** | **:538-608** | 🔴 **PRICING** — `loadPriceBook` + `repriceOrder` | **409 `stock: true`** on `unresolved` |
| 2 | :610-796 | event resolve, pre-order gate, required-modifier guard | 403 / 400 |
| 3 | :799-808 | `findSoldOutOption` (manual option sold-out) | 409 `optionStock: true` |
| 4 | :821 | `acquireEventLock` | 409 `retry: true` |
| 5 | :851 | `checkClosedCategories` | 409 `categoryClosed: true` |
| 6 | **:858** | **`checkStockShortfall`** | **409 `stock: true`** |
| 7 | :867 | `checkOptionCeilingShortfall` | 409 `optionStock: true` |
| 8 | :1013 | `place_order_atomic` — the INSERT | — |

**The pricing refusal, QUOTED (`:591-604`):**

```ts
    if (repriced.unresolved.length > 0) {
      const first = repriced.unresolved[0]
      console.error(
        `[submit] REFUSED — unpriceable on truck ${resolvedTruckId}: ` +
        repriced.unresolved.map(u => `${u.kind} "${u.name}"${u.on ? ` on "${u.on}"` : ''} (client said ${u.advisoryPrice})`).join('; '),
      )
      return NextResponse.json(
        {
          error: `Sorry, the menu has changed — ${first.name} is no longer available at the price shown. Please check your order.`,
          stock: true,
          items: [],
        },
        { status: 409 },
      )
    }
```

**The stock refusal it precedes, QUOTED (`:858-863`):**

```ts
        const shortfall = await checkStockShortfall(resolvedTruckId, eventRow.id, orderEventDate, orderLines, itemCatMap)
        if (shortfall) {
          return NextResponse.json(
            { error: 'Some items just sold out', stock: true, items: shortfall },
            { status: 409 },
          )
        }
```

### Walk-up path — `app/api/dashboard/action/route.ts`

**Source: QUOTED:**

| Order | Line | Step | Refusal |
|---|---|---|---|
| 1 | :848-934 | required-modifier guard | 400 |
| **2** | **:972-1077** | 🔴 **PRICING** — `loadPriceBook` + two-pass `repriceOrder` | **409 `needsPriceConfirm`** |
| 3 | :1095 | `acquireEventLock` | 409 `retry: true` |
| 4 | :1114 | `checkClosedCategories` | 409 `categoryClosed: true` |
| 5 | :1118 | `checkStockShortfall` | 409 `stock: true` |
| 6 | :1125 | `checkOptionCeilingShortfall` | 409 `optionStock: true` |
| 7 | :1137 | `findSoldOutOption` | 409 `optionStock: true` |
| 8 | :1168 | the INSERT | — |

**QUOTED (`:1055-1062`):**

```ts
        if (booked.unresolved.length > 0 && !acknowledged) {
          return NextResponse.json({
            needsPriceConfirm: true,
            total:             serverTotal,
            subtotal:          serverSubtotal,
            discountAmt:       serverDiscountAmt,
            unresolved:        booked.unresolved,
          }, { status: 409 })
        }
```

### 🔴 SO PRICING RUNS FIRST ON BOTH PATHS. DOES IT STEAL A STOCK REFUSAL?

**Source: INFERRED, from §1's filter audit.**

✅ **NO — AND FOR ONE REASON ONLY: the price book applies no availability filter.** An item that the stock guard would refuse is still a live row in `menu_items_db` with a `name` and a `price`, so it prices cleanly, `unresolved` stays empty, execution falls through, and the customer gets the stock message at step 6 as intended.

⚠️ **BUT THE SAFETY IS INCIDENTAL, NOT DESIGNED.** The pricing step was placed where the removed `validateOrderTotals` block sat — before the lock, so a refusal costs nothing — and nothing in either file records that its correctness depends on `loadPriceBook` never gaining an availability filter. **If anyone ever adds `.eq('is_available', true)` or `.eq('is_active', true)` to query 1 — a change that would read as an obvious tightening — every sold-out item immediately produces a pricing 409 instead of the stock message, on both paths.** That is the exact failure the question is probing for, and today it is one line away with nothing to stop it.

⚠️ **One narrow case where pricing DOES pre-empt a later refusal, and it is correct:** a **deleted** dish. It is unpriceable (409 at step 1) and would also fail nothing later, because `checkStockShortfall` reads ceilings by name and an absent row yields `null` (no cap) — so before this change a deleted dish sailed through to the insert at whatever price the client claimed. The pricing refusal is the only thing that stops it.

⚠️ **On the walk-up path the pricing 409 is a QUESTION, not a refusal** — `needsPriceConfirm` lets the operator confirm the total and re-submit, at which point execution continues to the stock guards normally. So even a genuine unpriceable line there cannot mask a stock shortfall; it defers it by one round trip.

---

## 3. On the menu, priced, but out of stock

**Source: QUOTED.**

| Question | Answer |
|---|---|
| **Which check refuses it** | 🔴 **`checkStockShortfall`**, `submit/route.ts:858` — count-based, event-scoped |
| **Status** | **409** |
| **Body** | `{ error: 'Some items just sold out', stock: true, items: shortfall }` where `shortfall` is `{ name, remaining }[]` |
| **When** | Step 6 — **under the event lock, before the insert.** Nothing is persisted |
| **Does pricing see it first?** | ❌ **No.** It priced fine at step 1 (§1) |

**The ceiling it enforces, QUOTED (`lib/stock-guard.ts:162-163`):**

```ts
  const itemCeiling = (name: string): number | null =>
    itemNoCap.has(name) ? null : (name in itemOverride ? itemOverride[name] : (itemDefault[name] ?? null))
```

### What the customer sees

**QUOTED (`app/trucks/[slug]/order/page.tsx:1281-1300`):**

```tsx
      if (res.status === 409 && data?.stock) {
        const shortItems: { name: string; remaining: number }[] = Array.isArray(data.items) ? data.items : []
        capBasketToRemaining(shortItems)
        setStockNotice(
          shortItems.length
            ? shortItems.map(s => `only ${s.remaining} ${s.name} left`).join(', ')
            : (typeof data.error === 'string' && data.error ? data.error : 'some items just sold out')
        )
```

**And the render, QUOTED (`:2425-2430`):**

```tsx
              {stockNotice && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mt-4 flex items-start gap-2">
                  <p className="flex-1 text-amber-800 text-sm font-medium">Sorry — {stockNotice} now. We&apos;ve updated your order — please review and confirm.</p>
                  <button onClick={() => setStockNotice(null)} className="text-amber-400 hover:text-amber-600 text-sm font-bold leading-none mt-0.5">✕</button>
                </div>
              )}
```

✅ **For a real stock shortfall `shortItems` is non-empty, so the per-item branch wins and my `data.error` fallback is never reached.** The customer reads, in an amber panel above Place order:

> **Sorry — only 2 Margherita left now. We've updated your order — please review and confirm.**

And their basket has been silently capped to 2 by `capBasketToRemaining` (`:727-744`). ✅ **Non-destructive: the basket survives, the page is not replaced, they re-submit.**

⚠️ **ONE PRE-EXISTING GAP, UNRELATED TO THIS CHANGE, FOUND WHILE ANSWERING.** `checkStockShortfall` selects `item_name, stock_count, no_item_cap` from `event_item_stock` — **it does not read `available`**. So an item toggled manually unavailable **without** an exhausted count has no submit-side refusal at all: it is menu-hide only. `findSoldOutOption` covers that case for **options**, not items. Flagged, not chased — it predates this work.

---

## 4. 🔴 THE UNPRICEABLE-LINE COPY — AND IT IS BROKEN

**Source: QUOTED, both halves.**

### The server's message

```ts
          error: `Sorry, the menu has changed — ${first.name} is no longer available at the price shown. Please check your order.`,
```

### Where it renders

The `stock: true` branch above → `shortItems` is `[]` (the pricing 409 sends `items: []`) → `capBasketToRemaining([])` returns immediately at `:728` (**nothing is capped, the basket is untouched**) → the `data.error` fallback fires → `setStockNotice(<the whole sentence>)` → the amber panel at `:2427`, above the Place order button, on the order page.

### 🔴 WHAT THE CUSTOMER ACTUALLY READS

**Source: INFERRED, by composing the two quoted strings — mechanical interpolation, no judgement involved:**

> **Sorry — Sorry, the menu has changed — Nutella Dream is no longer available at the price shown. Please check your order. now. We've updated your order — please review and confirm.**

🔴 **THREE FAULTS, ALL MINE:**

1. **"Sorry — Sorry,"** — the wrapper already opens with `Sorry — `.
2. **"Please check your order. now."** — the wrapper appends ` now.` and expects a **fragment** (`only 2 Margherita left`), not a terminated sentence. Mine is a sentence, so it collides mid-flow.
3. ⚠️ **"We've updated your order"** — **untrue on this branch.** `capBasketToRemaining([])` returns at the guard; nothing was changed. The customer is told their order was updated when it was not, and asked to review a change that did not happen.

**I wrote the server message and the fallback in the same change and did not trace the composition through to the rendered string.** The build report claimed the branch shows "the server's message"; it shows the server's message **spliced into a template built for a fragment**. That claim was wrong and this corrects it.

⚠️ **Scope: this is display-only.** The refusal is correct, nothing is persisted, the basket survives, the menu re-fetch still fires, and it is reachable only by a stale basket or a crafted request (three historical orders in the whole database, §8b of the build report). **But it is the first thing a real customer would read in that state, and it reads as broken software.**

### The walk-up copy, for contrast

**QUOTED (`AddOrderPanel.tsx`):**

```tsx
        const detail = list.length
          ? list.map(u => `${u.name}${u.on ? ` (on ${u.on})` : ''} — not on the menu`).join('\n')
          : 'Something on this order is no longer on the menu'
        const proceed = window.confirm(`${detail}\n\nSave at £${Number(data.total ?? 0).toFixed(2)}?\n\nOK = save at this total   ·   Cancel = edit the order`)
```

✅ **That one composes correctly** — a `window.confirm` with no wrapper, reading e.g.:

```
Nutella Dream — not on the menu

Save at £40.50?

OK = save at this total   ·   Cancel = edit the order
```

---

## Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — all four queries verbatim; column lists read live from the database; the `/api/menu` filter verbatim; the is_active counts measured. The superset conclusion is **INFERRED** from them |
| 2 | **QUOTED** — both refusal blocks and both orderings, with line numbers. "Pricing does not steal a stock refusal" is **INFERRED**, and depends entirely on §1 |
| 3 | **QUOTED** — the guard, the body shape, the client branch, the render, `capBasketToRemaining`. The `event_item_stock.available` gap is **QUOTED** (the select list) |
| 4 | **QUOTED** — the server string and the render template. The composed sentence is **INFERRED** by interpolation |

## Not established

- **Whether the pricing step's position before the stock guards was ever intended to be load-bearing.** It is, and nothing records it.
- **Whether the `event_item_stock.available` item gap (§3) is a defect or deliberate.** It predates this change; I did not chase it.
- **What the copy should say.** No fix proposed or applied, as instructed.
