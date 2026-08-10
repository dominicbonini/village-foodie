# Stock display — read-only mechanics audit

**Date:** 7 August 2026
**Symptom:** on the operator Add Order screen, "(1 left)" renders in orange against every pizza (~20 items) when the truck has one base left **in total**.
**Mode:** read-only. Nothing changed; no design proposed.

---

## The mechanism, in one line

`calcAddableRemaining` returns **two** values — `{ addable, bound }` — where `bound` names *which* axis produced the number. The customer page destructures both and phrases its badge accordingly. **The operator's Add Order panel destructures only `addable` and discards `bound`**, so a pooled category number is printed against each item as if it were that item's own.

| Surface | Line | Destructure |
|---|---|---|
| Customer order page | [order/page.tsx:1786](app/trucks/[slug]/order/page.tsx#L1786) | `const { addable: stockAddable, bound: stockBoundEff } = calcAddableRemaining({…})` |
| Operator tile grid | [AddOrderPanel.tsx:1532](components/dashboard/AddOrderPanel.tsx#L1532) | `const { addable } = calcAddableRemaining({…})` |
| Operator list rows | [AddOrderPanel.tsx:1597](components/dashboard/AddOrderPanel.tsx#L1597) | `const { addable } = calcAddableRemaining({…})` |

The helper's own docstring says `bound` exists for exactly this purpose — *"`bound` names the axis that produced the min (for badge copy)"* ([lib/stock-utils.ts:29](lib/stock-utils.ts#L29)) — and the menu API's comment is even more explicit: *"drives the badge copy so a category countdown reads '3 pizzas left', not '3 left' against each of 18 pizzas"* ([api/menu/[truckId]/route.ts:580](app/api/menu/[truckId]/route.ts#L580)).

**The distinction was designed, built, and plumbed all the way to the client. Only the operator surface drops it.**

---

## 1. How category stock is stored and resolved

### Storage — two independent ceilings, each with an event override over a standing default

| Axis | Per-event override | Standing default | Migrations |
|---|---|---|---|
| **Category** | `event_category_stock.stock_count` (keyed on truck + event + category **name**) | `menu_categories.default_stock` | `20260529_category_default_stock.sql`, `20260716_event_category_stock_available.sql` |
| **Item** | `event_item_stock.stock_count` (+ `available`, `no_item_cap`) | `menu_items.default_stock` | `20260529_item_default_stock.sql`, `20260612_event_item_stock_no_item_cap.sql` |
| **Modifier option** | `event_modifier_option_stock.stock_count` | `modifier_options.stock_count` | `20260619_modifier_option_stock_rpc.sql` |

Precedence is stated at [api/dashboard/action/route.ts:1325](app/api/dashboard/action/route.ts#L1325) — *"category_stock row takes precedence; fall back to default_stock from menu_categories"* — and built into `catStockMap` at [:1331](app/api/dashboard/action/route.ts#L1331), returned as `stock_count` + `orders_count` per category at [:1342](app/api/dashboard/action/route.ts#L1342).

### Resolution — three pure functions, [lib/stock-utils.ts](lib/stock-utils.ts)

```
calcStockRemaining(stockCount, ordersCount) → ceiling − committed, clamped to 0; null = no limit
calcEffectiveRemaining(itemRem, catRem)     → min of the non-null legs
calcAddableRemaining({itemRem, catRem, itemBasketQty, catBasketQty})
                                            → { addable, bound }
```

### 🔴 How a per-item display gets a number from a pooled count

[lib/stock-utils.ts:37-47](lib/stock-utils.ts#L37-L47):

```ts
const itemAddable = itemRem === null ? null : Math.max(0, itemRem - itemBasketQty)
const catAddable  = catRem  === null ? null : Math.max(0, catRem  - catBasketQty)
…
return catAddable < itemAddable
  ? { addable: catAddable, bound: 'category' }
  : { addable: itemAddable, bound: 'item' }
```

`catRem` is computed **once per category** and is identical for every item in it — in the operator panel it is looked up from a single `categoryStocks` row at [AddOrderPanel.tsx:1526](components/dashboard/AddOrderPanel.tsx#L1526):

```ts
const catSt   = categoryStocks.find(s => s.category === selectedMenuCat)
const catRem  = calcStockRemaining(catSt?.stock_count ?? null, catSt?.orders_count ?? 0)
```

So when the pizzas have no item-level ceiling, `itemRem` is `null`, `catAddable` wins on every item, and **all twenty tiles receive the same `addable = 1`**. Each then prints it as its own count. The number is arithmetically correct — one more unit *is* all you can add, whichever pizza you pick — but the rendering attaches a shared pool figure to twenty individual items with no marker that it is shared.

⚠️ One nuance worth stating: `catBasketQty` is the whole category's in-progress quantity ([AddOrderPanel.tsx:1531](components/dashboard/AddOrderPanel.tsx#L1531), `basketByCat`, deal slots already folded), so the numbers do decrement **together** — adding one pizza takes all twenty badges to "max" at once. The counting is right; only the attribution is wrong.

---

## 2. Can an item have both its own stock AND draw from a category pool?

**Yes, and three configurations exist.**

| `event_item_stock` state | `itemRem` | Effect |
|---|---|---|
| `no_item_cap = true` | **`null`** — "follow category" | Category is the only ceiling |
| `stock_count = N` | `N − ordersCount` | Both ceilings apply |
| `stock_count = null`, `no_item_cap = false` | falls back to `menu_items.default_stock` | Both apply if a default exists |

The three-way meaning is documented at [api/dashboard/action/route.ts:1399-1401](app/api/dashboard/action/route.ts#L1399-L1401) — *"`no_item_cap=true` = 'follow category' (ceiling resolves to null); `false` + `stock_count=null` = 'use default'"* — and the dashboard's stock editor mirrors it at [page.tsx:3474](app/dashboard/[token]/page.tsx#L3474) (`const itemCount = followsCategory ? null : (stock?.stock_count ?? item.default_stock ?? null)`).

**Which binds:** the **smaller** of the two, per `calcAddableRemaining`. Ties resolve to `'item'`.

**Does the display show the binding one?**

- **The number: yes.** Both surfaces print the true minimum, so the badge never overstates what can be added.
- 🔴 **The axis: only on the customer page.** `bound` is used at [order/page.tsx:1842](app/trucks/[slug]/order/page.tsx#L1842) and discarded at [AddOrderPanel.tsx:1532](components/dashboard/AddOrderPanel.tsx#L1532) and [:1597](components/dashboard/AddOrderPanel.tsx#L1597). The operator is shown a correct number with no way to tell whether it means "one of this pizza" or "one pizza between all of these" — and those are operationally very different facts.

---

## 3. Every surface that renders a stock count

| # | Surface | file:line | Renders | Styling | Threshold |
|---|---|---|---|---|---|
| 1 | **Operator Add Order — tile grid** | [AddOrderPanel.tsx:1564](components/dashboard/AddOrderPanel.tsx#L1564) | `({addable} left)` | 10px black; **orange-500**, or white when the tile is selected | `addable <= 10` |
| 2 | **Operator Add Order — list rows** | [AddOrderPanel.tsx:1619](components/dashboard/AddOrderPanel.tsx#L1619) | `{addable} left` | 10px black, **orange-500** | `addable <= 10` |
| 3 | **Customer order page — items** | [order/page.tsx:1835-1847](app/trucks/[slug]/order/page.tsx#L1835-L1847) | `Only {n}{noun} left!` / `{n}{noun} left` | pill w/ border; **red** ≤3, **orange** 4–10 | `stockAddable <= 10` |
| 4 | **Customer order page — deals** | [order/page.tsx:2358-2367](app/trucks/[slug]/order/page.tsx#L2358-L2367) | shared badge | as #3 | *"same thresholds as item stock"* |
| 5 | **Modifier options (BOTH surfaces)** | [components/OptionStockBadge.tsx](components/OptionStockBadge.tsx) | `{remaining} left` / `sold out` | red ≤3, orange 4–10, red at ≤0 | `<= 10` |
| 6 | **Operator modal — blocked option** | [order/page.tsx:1991](app/trucks/[slug]/order/page.tsx#L1991) | `{n} {optionName} left` | 10px bold orange-600 | shown when blocking |
| 7 | **Dashboard Stock tab — category header** | [page.tsx:3488](app/dashboard/[token]/page.tsx#L3488) | category `catRem` "left" | editor chrome | always (editor) |
| 8 | **Dashboard Stock tab — item rows** | [page.tsx:3474-3518](app/dashboard/[token]/page.tsx#L3474-L3518) | editable counts + Toggle | editor chrome | always (editor) |
| 9 | **Manage → menu editor, category** | [manage/page.tsx:3747-3748](app/manage/[token]/page.tsx#L3747-L3748) | `{default_stock} per event` | **blue-50/blue-600** pill | shown when non-null |
| 10 | **Manage → menu editor, item** | [manage/page.tsx:3907-3908](app/manage/[token]/page.tsx#L3907-L3908) | `{default_stock} per event` (slate) + `Stock: {stock_count}` (orange) | Badge component | shown when non-null |
| 11 | **KDS** | — | 🔴 **nothing** | — | — |

**#9–#10 are configuration values, not live remaining** — they show the ceiling as set, never a countdown. **#7–#8 are the editor** where the operator sets the pool, and the category header at :3488 already carries the comment *"the category number onto every item (the category header row shows {catRem} left)"* — the editor does distinguish the two levels visually; the Add Order panel does not.

**#11: the KDS renders no stock at all.** Confirmed by grep — no `stock`/`left` token in `app/dashboard/[token]/kds/page.tsx`. It is a fulfilment surface, not an ordering one.

---

## 4. Is the customer display the same component?

**No. They are two separate, independently-written implementations.** Only the *modifier-option* badge is shared.

| | Operator (#1, #2) | Customer (#3, #4) |
|---|---|---|
| Implementation | inline JSX in `AddOrderPanel.tsx`, **twice** (tile + list) | inline IIFE in `order/page.tsx` |
| Uses `bound`? | ❌ discarded | ✅ [:1842](app/trucks/[slug]/order/page.tsx#L1842) |
| Category phrasing | none | `` const noun = stockBoundEff === 'category' && item.category ? ` ${item.category.toLowerCase()}` : '' `` |
| Urgency tier | none | red + "Only …!" at ≤3 |
| Wording | `(1 left)` / `1 left` | `Only 1 pizzas left!` |

**Shared component that does exist:** [components/OptionStockBadge.tsx](components/OptionStockBadge.tsx), whose header states its purpose — *"ONE source of truth for the thresholds + wording so both surfaces are identical and match the ITEM stock display."* It covers modifier options only. The item-level badge has no such component, which is how the two item surfaces drifted apart.

⚠️ **Observation relevant to your framing of the customer page as "close to a scarcity claim":** the customer copy is the *more* insistent of the two — red pill, exclamation mark, "Only". It is also the one that is category-accurate. So on a pooled category the customer currently reads `Only 1 pizzas left!` (one pool, correctly attributed, grammatically odd at n=1 because `noun` is the raw category name lowercased) while the operator reads `(1 left)` against twenty items. The scarcity-shaped surface is the truthful one; the informational surface is the misleading one.

---

## 5. What happens at zero

**Neither path hides the item, and neither is tappable-then-failing. Both disable at the control.**

### Operator — [AddOrderPanel.tsx:1534](components/dashboard/AddOrderPanel.tsx#L1534)

```ts
const atStockLimit = addable !== null && addable <= 0
```

- Tile: `onClick={() => !atStockLimit && addOrCustomise(item)}` **and** `disabled={atStockLimit}` ([:1544-1545](components/dashboard/AddOrderPanel.tsx#L1544-L1545)) — guarded twice.
- Styling: `opacity-50 cursor-not-allowed bg-slate-100 border-slate-200 text-slate-400` ([:1547](components/dashboard/AddOrderPanel.tsx#L1547)) — **greyed, still visible**.
- Badge: the "left" badge is suppressed and replaced by a red **`max`** ([:1563](components/dashboard/AddOrderPanel.tsx#L1563)) / **`max reached`** ([:1618](components/dashboard/AddOrderPanel.tsx#L1618)).
- The `+` button in list mode is likewise `disabled` and greyed ([:1624-1627](components/dashboard/AddOrderPanel.tsx#L1624-L1627)).

### Customer — server-side, [api/menu/[truckId]/route.ts:558-560](app/api/menu/[truckId]/route.ts#L558-L560)

```ts
const isAvailable = (i.is_available !== false)
  && (override ? override.available !== false : true)
  && (stockRemaining === null || stockRemaining > 0)
  && !hasUnsatisfiableRequiredGroup(...)
  && !preorderSoldOut && !preorderNotOpenYet
```

Exhausted stock flips `available` to `false` **on the API**, so the client's `isSoldOut` at [order/page.tsx:1766](app/trucks/[slug]/order/page.tsx#L1766) is true → red **`Sold out`** pill ([:1832-1834](app/trucks/[slug]/order/page.tsx#L1832-L1834)), item still listed, not addable. The basket also refuses at [:587-589](app/trucks/[slug]/order/page.tsx#L587-L589) (`if (totalQty >= item.stock_remaining) return prev`).

### Behind both — the server gate

Neither display is the enforcement. `lib/stock-guard.ts` holds a per-event mutex and re-checks under it, so a race that beats the UI still fails closed with a 409 and a *"only N X left"* message ([submit/route.ts](app/api/orders/submit/route.ts), [order/page.tsx:1168](app/trucks/[slug]/order/page.tsx#L1168)). `calcAddableRemaining`'s docstring ties them together: *"`addable <= 0` ⟺ the `+` is disabled ⟺ checkCeilingShortfall would reject one more unit."*

**Summary: greyed and disabled, never hidden, never a failing tap.**

---

## 6. Is there threshold logic — does 14 render like 1?

**There is one threshold on the operator surface and two on the customer surface.**

| Count | Operator (#1/#2) | Customer (#3) | Options (#5) |
|---|---|---|---|
| `null` (untracked) | nothing | nothing | nothing |
| 14 | **nothing** | **nothing** | nothing |
| 10 | `(10 left)` orange | `10 left` orange | `10 left` orange |
| 4 | `(4 left)` orange | `4 left` orange | `4 left` orange |
| 3 | `(3 left)` orange | **`Only 3 left!` red** | **`3 left` red** |
| 1 | `(1 left)` orange | **`Only 1 left!` red** | **`1 left` red** |
| 0 | `max` red + disabled | `Sold out` red | `sold out` red |

**Answering directly: 14 renders nothing on every surface** — the badge only appears at `<= 10` ([AddOrderPanel.tsx:1533](components/dashboard/AddOrderPanel.tsx#L1533), [:1598](components/dashboard/AddOrderPanel.tsx#L1598), [order/page.tsx:1835](app/trucks/[slug]/order/page.tsx#L1835), [OptionStockBadge.tsx:16](components/OptionStockBadge.tsx#L16)).

🔴 **But on the operator surface, 10 and 1 render identically** — same orange, same weight, same wording, only the digit differs. There is **no second tier** there. The customer page and the shared option badge both have one (red at `<= 3`), and `OptionStockBadge`'s header explicitly documents the intent — *"1–3 → 'N left' (red) — same wording, red styling carries the urgency"*. The operator panel never received it.

---

## What is established

1. Category stock is a **pooled ceiling** in `event_category_stock.stock_count` (falling back to `menu_categories.default_stock`), resolved per-axis by `calcStockRemaining` and combined by `calcAddableRemaining` as a `min`.
2. The per-item number on the Add Order screen **is** the pool's number whenever the category is the binding axis — identical across every item in the category, by construction.
3. `calcAddableRemaining` already returns `bound` naming that axis. The customer page uses it to phrase the badge against the category noun. **The operator panel discards it at both render sites.**
4. Item and category ceilings can coexist; the smaller binds; the number shown is correct but unattributed on the operator surface.
5. Eleven surfaces render a count; the KDS renders none; only modifier options use a shared component.
6. Operator has one threshold (`<= 10`); customer and options have two (`<= 10`, then red at `<= 3`).

**No design proposed, per the brief.**
