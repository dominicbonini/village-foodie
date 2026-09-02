# The offline stock fold reaching the Add-order panel

**Built. NOT deployed, NOT committed. No SQL, no migrations.**
**Changed: `app/dashboard/[token]/page.tsx`, `components/dashboard/AddOrderPanel.tsx`.**

---

## VERIFICATION

**EXECUTION.** Measured with the **real `lib/stock-utils.ts`** under Node — **7 assertions, 0 failing**,
with the disagreement shown failing first (**panel 8 vs Menu & Stock 5**).

**`npx tsc --noEmit` clean — SANITY ONLY, not verification.** It would not have caught a hooks-order
fault, so I checked that separately: the fold's `useMemo` is at `:2990` and the first early return at
`:3012`, with **no hook after it**.

🔴 **I could not exercise the dashboard.** It is token-gated and I have no session — **I have not opened
the board, taken an offline order, or seen either surface render.** §"Runbook" is what remains.

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 1 · What was passed, and how it differs from Menu & Stock

**Two new optional props on `AddOrderPanel`, wired from the dashboard:**

```tsx
offlineConsumedByItem={offlineConsumedByItem}
offlineConsumedByCat={offlineConsumedByCat}
```

> ✅ **THE SAME TWO `Map` OBJECTS Menu & Stock reads.** Not a copy, not a recomputation — the identical
> references returned by the single `useMemo` at `page.tsx:2990`, which folds `deviceQueuedOrders`.

**Applied at the panel's four `orders_count` reads (two per layout mode), in the same shape as
`page.tsx:4848` / `:4904`:**

```ts
calcStockRemaining(stock?.stock_count ?? null, (stock?.orders_count ?? 0) + (offlineConsumedByItem.get(item.name) ?? 0))
calcStockRemaining(catSt?.stock_count ?? null, (catSt?.orders_count ?? 0) + (offlineConsumedByCat.get(cat) ?? 0))
```

### The one difference, and why

⚠️ **Menu & Stock wraps its read in `activeEvent ? (…) : 0`. I did not replicate that.**

**Because the fold is already event-scoped at source:** `page.tsx:2997` skips any queued order whose
`event_id` is not `stockEventId`, so with no active event the Maps are **empty** and `.get()` returns
`undefined → 0` anyway. **The guard is belt-and-braces there and would be dead weight here.**

**And the two are scoped to the same event by construction** — verified by reading:
`activeEvent = resolvedEvent = selectedOrDefaultEvent`, and `stockEvent = selectedOrDefaultEvent`.
**The same object.** The panel's `itemStocks` already comes from `itemStocksByEvent[stockKey]`, keyed on
that same id, so the baseline and the fold cannot be for different events.

⚠️ **Defaults are a shared frozen `EMPTY_CONSUMED` Map**, not `new Map()` inline — an inline default
mints a new object every render and would invalidate any memo keyed on it.

---

## 2 · 🔴 No double-fold with the basket

**Established by reading the submit path, then measured.**

**The two quantities are disjoint sets:**

| | Counts |
|---|---|
| `offlineConsumedByItem` | **SUBMITTED** orders — `deviceQueuedOrders` |
| `itemBasketQty` / `catBasketQty` (`AddOrderPanel.tsx`) | The basket **still being composed** |

**Why an order can never be in both, READ from `AddOrderPanel.tsx`:**

```
1273   onOrderPlaced(optimistic)      ← the parent queues it (setDeviceQueuedOrders)
…
1282   resetManual(); …               ← clears manualItems / appliedDeals
```

> 🔴 **ZERO `await` STATEMENTS BETWEEN THEM** — verified by grep. Both are React state updates in one
> synchronous block, so they land in a single commit. **No render exists in which an order is both
> queued and in the basket.**

**And a seeded op (from the previous task) is by definition a submitted order — it was never in this
session's basket at all.**

### Measured

With `stock_count 10`, `orders_count 2`, **3 queued**, **2 in the basket**:

```
folded remaining   = 10 − (2 + 3) = 5
addable            = 5 − 2 (basket) = 3      ✅
a DOUBLE-fold would = 10 − (2 + 3 + 2) = 3, addable 1   ← measured, and not what happens
```

---

## 3 · What the operator sees in each state

| State | Menu & Stock | Add-order panel | Agree? |
|---|---|---|---|
| **Online** (no queued orders) | `10 − 2 = 8` | `10 − 2 = 8` | ✅ **Yes** — measured: with an empty fold the panel is byte-identical to before this change |
| **Offline, 3 queued** | `10 − 5 = 5` | 🔴 **was 8** → ✅ **now 5** | ✅ **Yes** |
| **Offline, none queued** | `10 − 2 = 8` | `10 − 2 = 8` | ✅ **Yes** |

> ✅ **All three agree.** The only state that changed is the middle one, which is the defect.

⚠️ **What still does NOT tick down:** stock consumed by **another device**, by **customers ordering
online**, or released by a **cancellation elsewhere**. The fold only knows this device's queued orders.
**That is unchanged by this task and is the blind-spot list from the offline-stock report.**

---

## 4 · Does the fold change when 'stale' or 'unknown' applies? — **No, and deliberately not**

**`stockStatus` (`page.tsx:1328-1329`) is derived from the FETCH, not from the fold:**

```ts
stockLoading ? 'unknown' : (stockFetchFailed || degradedSince) ? 'stale' : 'live'
```

> ✅ **Neither Map appears in that expression.** A number that has been folded is still labelled **stale**
> if its baseline is stale — **the label does not become more confident because the fold ran.** That is
> right: the fold corrects for *this device's* queued orders, not for the baseline being old.

**And the fold cannot manufacture a number where there is no baseline.** In the `'unknown'` state
`itemStocks` is empty, so `stock?.stock_count` is `null`:

```
calcStockRemaining(null, 2 + 3)  →  null      ← measured
```

> ✅ **`null` means "no limit", so no badge renders and nothing is invented.** The `'unknown'` notice
> still says the counts are not loaded.

**The approved wording is unchanged** — *"Stock counts aren't loaded on this device. You can still take
orders — check what you have."* and *"Stock last checked at HH:MM. It may have moved since."*

---

## 5 · Constraints held

| | |
|---|---|
| `+` control disabled? | ✅ **No.** `grep` on added lines for `disabled=` → **0** |
| Ordering blocked? | ✅ **No** — nothing gates submit |
| A counter built? | ✅ **No.** The fold is the dashboard's existing `useMemo` over `deviceQueuedOrders` |
| Anything persisted? | ✅ **No.** `Preferences` / `localStorage` / new `useState` in the added lines → **0** |
| New mechanism? | ✅ **No** — one existing computation reaching a second consumer |

---

## 6 · The measurement

| Case | Result |
|---|---|
| 🔴 **Offline, 3 queued — panel vs Menu & Stock** | **BEFORE: panel 8, Menu & Stock 5 — DISAGREE.** The defect, reproduced |
| After | ✅ **Both 5 (item) and 13 (category) — agree exactly** |
| **Basket of 2 on top of the fold** | ✅ **addable = 3**, not the 1 a double-fold would give |
| Online / empty fold | ✅ panel identical to before the change, and to Menu & Stock |
| `stock_count === null` with consumption | ✅ **stays `null`** — no invented limit |
| | ✅ **7 assertions, 0 failing** |

⚠️ **The fold itself is MIRRORED in the harness** (it is a React `useMemo` and cannot be imported).
**`calcStockRemaining` and `calcAddableRemaining` are the real module.**

---

## Risk, and the runbook

| Change | Risk |
|---|---|
| Passing the Maps | **Low** — two optional props, defaulting to a shared empty Map |
| The four folded reads | **Medium.** They drive the badge, the low-stock tint **and** `atStockLimit`, so a wrong number here would **disable the `+` on an item that is actually available**. ⚠️ **The fold can only ever ADD to `orders_count`, so the failure direction is conservative — it under-states availability, never over-states it** |

### 🔴 Must be on the tablet — I could exercise none of it

| # | Test | Pass condition |
|---|---|---|
| **T1** | Set an item to 10. Go offline. Take 3. Open **Menu & Stock** and **Add-order** | 🔴 **Both read 7.** Before this change they read 7 and 10 |
| **T2** | With 3 queued, put 2 of the same item in the basket | The tile allows **5 more**, not 3 |
| **T3** | Reconnect and let them drain | Both settle to the server number; **no moment where either double-counts** |
| **T4** | Online throughout | Numbers identical to today |
| **T5** | An item with **no limit set** | **No badge on either surface**, `+` never disabled |
| **T6** | Cold launch offline, open Add-order | *"Stock counts aren't loaded…"*, no badges, `+` works |

### The laptop settled

The agreement in all three states, the basket disjointness, the null-baseline case, the empty-fold
no-op, and that no control was disabled.

---

## What I could not establish

1. 🔴 **That either surface renders the new number.** **No session for the dashboard.** T1-T6 open.
2. **Whether `deviceQueuedOrders` is populated correctly on a real device** — the seed from the previous
   task is also unexercised, and **this fold is only as good as that list**.
3. **Whether the two layout modes** (`tabs` / `scroll`) both take the edited path in practice. **I changed
   both occurrences and tsc is clean, but I have seen neither render.**
4. **Category-key casing in the live data.** The harness showed `buildOfflineOccupancy` lowercases
   category keys; `offlineConsumedByCat` is built from `itemCategoryMap` and read with `cat` as the panel
   has it. ⚠️ **If those cases ever disagree the category fold would silently miss** — worth an eye on T1.
