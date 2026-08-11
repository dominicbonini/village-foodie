# Price book re-key — optionPrice from flat name to (item, option)

**Date:** 11 August 2026
**Result: 🔴 DONE AND PROVEN BY EXECUTION AGAINST REAL ROWS.** The mispricing is caught, pizzeria-gusto is a byte-for-byte no-op, and all 14 live exclusions are honoured.
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

**One file changed: `lib/order-repricing.ts`** — 80 insertions, 15 deletions. No `next dev`, no `next build`. No commit. No deploy.

---

## 🔴 THE THREE PROOFS, WITH THEIR ACTUAL OUTPUT

Every number below is stdout from a read-only script that imported the **real** `loadPriceBook` and `repriceOrder` (TypeScript transpiled at run time — **not reimplemented**) and ran them against the live database. **The scripts are deleted; deletion confirmed at the end.**

### (a) POSITIVE CONTROL — real-thai-food ✅ THE DEFECT WAS REAL AND IS CAUGHT

```
menu items on real-thai-food = 27
resolved dish names -> {"springroll":"Springrolls","padthai":"Pad Thai"}
  NEW  optionPrice["Springrolls"]["Prawn"] = 1.5
  NEW  optionPrice["Pad Thai"]["Prawn"] = 0
  OLD  flat["Prawn"]                = 0   (same value for BOTH dishes)
  OLD  flat["Prawn"] rows REVERSED  = 1.5  <- row-order dependence
  OLD  flat["Beef"]  = 0 | reversed = 0.5
```

🔴 **The old flat key returned `0` for BOTH dishes — and `1.5` for both when the same rows arrived in the opposite order.** That is the defect, demonstrated by execution rather than asserted: the resolved price was a function of row order, and Springrolls + Prawn was being under-priced by **£1.50**.

✅ **The new key returns 1.50 and 0.00, correctly, per dish.**

**Every dish that offers each colliding option, with its item-scoped price:**

```
  NEW  dishes offering "Prawn" (6): Mix veg Oyster sauce=0, Noodles Stirfried=0, Pad Thai=0,
                                    Pineapple Friedrice=0, Springrolls=1.5, Tom Yum=0
  NEW  dishes offering "Beef" (2): Massaman Curry=0.5, Pad Thai=0
```

**NO DEPENDENCE ON ROW ORDER — `loadPriceBook` run five times, whole-map fingerprint each time:**

```
  NEW  loadPriceBook run 5x, map fingerprints:
       ["251:-1642759832","251:-1642759832","251:-1642759832","251:-1642759832","251:-1642759832"]
       => stable: true
```

**END TO END through `repriceOrder` — the real public entry point, with a deliberately absurd advisory price of 999 on the wire to prove it is ignored:**

```
  E2E repriceOrder "Springrolls" + Prawn -> unit_price=7  (base=5.5 + mod=1.5) unresolved=0
  E2E repriceOrder "Pad Thai"    + Prawn -> unit_price=10 (base=10  + mod=0)   unresolved=0
```

✅ **£7.00 and £10.00, both database-derived, both ignoring the 999.**

---

### (b) NO-OP ON THE LIVE TRUCK — pizzeria-gusto ✅ ZERO DISAGREEMENT

Every `(item, option)` pair Gusto's menu actually offers, old flat lookup vs new item-scoped lookup:

```
  (item, option) pairs the menu OFFERS = 176
  agree = 176   disagree = 0
  distinct dishes with options = 22, distinct option names truck-wide = 8
```

🔴 **176 of 176 agree. Zero disagreements.** As the brief predicted — Gusto has no colliding option names, so the two keys must return the same number for everything on its menu, and they do. **Nothing about Gusto's pricing changes.**

⚠️ **The 176 is 22 dishes × 8 options exactly** — every dish that carries options carries all eight, and Gusto has no exclusions.

---

### (c) THE NEW UNRESOLVED CASE ✅ AND IT CARRIES REAL MONEY

**A pair the old key priced silently and the new key refuses — proven end to end:**

```
  CONCRETE: "Prawn" sent on "Massaman Curry" (which does not offer it)
    OLD flat would have returned 0 silently.
    NEW -> unresolved=[{"kind":"modifier","name":"Prawn","on":"Massaman Curry","advisoryPrice":7.77}]
           modPrice=7.77 (advisory echoed back)
```

✅ **Exactly the required behaviour: an `UnresolvedRef` is pushed and the advisory figure is returned to the caller — unchanged handling, new trigger.**

**How many such pairs exist, per truck.** Universe = every menu item × every option name anywhere on that truck; "newly UNRESOLVED" = that universe minus the pairs the menu actually offers:

| slug | items | option names | offered | newly UNRESOLVED | **of which non-zero under the old key** | colliding option names |
|---|---|---|---|---|---|---|
| demo-8ggyz7vrhe6sbf54c8chvkp90q | 27 | 5 | 17 | 118 | **51** | 1 |
| demo-jt7xn1b47121by1n0d1yjrrv3k | 10 | 0 | 0 | 0 | 0 | 0 |
| demo-qbkqsaayxa87nb9cahhj2ngzpk | 10 | 0 | 0 | 0 | 0 | 0 |
| demo-wks3nf2q7dp2tef0hp01n74e8c | 27 | 5 | 17 | 118 | **51** | 1 |
| **pizzeria-gusto** | 45 | 8 | 176 | 184 | **184** | **0** |
| **real-thai-food** | 27 | 5 | 17 | 118 | **26** | **2** |
| test-kitchen | 27 | 8 | 54 | 162 | **35** | 2 |
| test-truck-2 | 0 | 0 | 0 | 0 | 0 | 0 |
| test-truck-3 | 27 | 5 | 17 | 118 | **26** | 2 |
| test-truck-3-2 | 0 | 0 | 0 | 0 | 0 | 0 |
| tt3 | 27 | 5 | 17 | 118 | **26** | 2 |
| village-spice | 29 | 5 | 13 | 132 | **52** | 1 |
| **TOTAL** | | | **328** | **1,068** | **451** | |

🔴 **1,068 pairs across 12 trucks now resolve UNRESOLVED where the flat key returned a price. 451 of them carried a NON-ZERO price** — i.e. the old code would have added real money for an option the dish does not offer.

⚠️ **READ THE 1,068 AS A CEILING, NOT A FORECAST.** It counts every *conceivable* pair, including ones no client would ever send, because the edit modal only offers options the dish actually has. **A pair only reaches this code if something sends an option the dish does not offer** — a crafted request, or a menu edited under an in-flight order. When it happens the handler returns **409 `needsPriceConfirm`** and the operator is asked, which is the correct outcome and is exactly the existing behaviour.

⚠️ **Gusto's 184 are all non-zero** because every one of its eight option names is priced above zero somewhere; its 45 dishes include 23 with no modifier groups at all, so `45 × 8 − 176 = 184`.

---

### BONUS PROOF — exclusions ✅ 14 of 14

Requirement 3 needed its own check, because a wrong implementation here would look correct on every truck that has no exclusions:

```
link rows carrying exclusions: 14
excluded (dish, option) pairs checked: 14   correctly absent from the new book: 14
  ABSENT ok  real-thai-food | Tom Yum              | "Beef" (excluded; option price 0)
  ABSENT ok  real-thai-food | Noodles Stirfried    | "Beef" (excluded; option price 0)
  ABSENT ok  real-thai-food | Mix veg Oyster sauce | "Beef" (excluded; option price 0)
  ABSENT ok  real-thai-food | Pineapple Friedrice  | "Beef" (excluded; option price 0)
  ABSENT ok  demo-krh2c8ksabdv28ccprswbfhkdk | Tom Yum              | "Beef" (excluded; option price 0.5)
  ABSENT ok  demo-krh2c8ksabdv28ccprswbfhkdk | Mix veg Oyster sauce | "Beef" (excluded; option price 0.5)
  ABSENT ok  demo-krh2c8ksabdv28ccprswbfhkdk | Massaman Curry       | "Prawn" (excluded; option price 0)
  ABSENT ok  demo-krh2c8ksabdv28ccprswbfhkdk | Noodles Stirfried    | "Beef" (excluded; option price 0.5)
  ABSENT ok  demo-krh2c8ksabdv28ccprswbfhkdk | Pineapple Friedrice  | "Beef" (excluded; option price 0.5)
  ABSENT ok  demo-ekwwmqeej70hd5da4d61wzetcw | Massaman Curry       | "Prawn" (excluded; option price 0)
  ABSENT ok  demo-ekwwmqeej70hd5da4d61wzetcw | Tom Yum              | "Beef" (excluded; option price 0.5)
  ABSENT ok  demo-ekwwmqeej70hd5da4d61wzetcw | Noodles Stirfried    | "Beef" (excluded; option price 0.5)
  ABSENT ok  demo-ekwwmqeej70hd5da4d61wzetcw | Mix Veg Oyster Sauce | "Beef" (excluded; option price 0.5)
  ABSENT ok  demo-ekwwmqeej70hd5da4d61wzetcw | Pineapple Friedrice  | "Beef" (excluded; option price 0.5)

  item_modifier_groups rows with a non-empty excluded_option_ids: 14 of 87
```

✅ **Every excluded pair is absent from the new book and falls through to unresolved. `Beef` is still priced at 0.50 on Massaman Curry — the exclusion is per-dish, not global.**

⚠️ **`demo-krh2c8k…` and `demo-ekww…` appear here but not in the 12-row `trucks` listing** — orphaned demo menu rows whose truck row is gone. **Harmless and out of scope**, but noted rather than swallowed.

---

## What changed in the code

### 1. `PriceBook.optionPrice` is now two levels

```ts
-  /** modifier_options (scoped to this truck via group→truck): name → price_adjustment */
-  optionPrice: Record<string, number>
+  optionPrice: Record<string, Record<string, number>>
```

### 2. A fourth, TRUCK-SCOPED query — added to the existing `Promise.all`, not a second round trip

```ts
    // WHICH DISH OFFERS WHICH GROUP — the reason optionPrice can be item-scoped at all.
    // 🔴 TRUCK-SCOPED VIA THE EMBED, not read whole. item_modifier_groups has no truck_id of its own,
    // so the scope comes from menu_item_id → menu_items_db.truck_id, and the same embed hands back the
    // item NAME, which is the key we need. (app/api/orders/submit/route.ts:625 reads this table with no
    // truck filter at all — a full-table read. That is a separate backlog item; do not copy it here.)
    supabase
      .from('item_modifier_groups')
      .select('group_id, excluded_option_ids, menu_items_db!inner(name, truck_id)')
      .eq('menu_items_db.truck_id', truckId),
```

✅ **The `!inner` embed does the truck-scoping AND supplies the item name in one query — no full-table read, and no extra round trip** (probed against the live schema before writing it). **`submit/route.ts:625` was NOT copied**, as instructed.

⚠️ **`modifier_options` gained `id, group_id`.** `id` is unavoidable: `excluded_option_ids` is a list of option **ids**, so exclusions cannot be applied without it. **This is server-side only — nothing new is required on the wire**, exactly as the brief's live probe established.

### 3. The book is built from the links

```ts
  const optionPrice: Record<string, Record<string, number>> = {}
  for (const link of (linkRows as unknown as LinkRow[] | null) || []) {
    const itemName = link?.menu_items_db?.name
    if (!itemName) continue
    const options = optionsByGroup.get(link.group_id)
    if (!options) continue
    const excluded = new Set(link.excluded_option_ids || [])
    const forItem = (optionPrice[itemName] ||= {})
    for (const o of options) {
      // Per-dish exclusion (model C) — an excluded option is NOT priceable on this dish, so it must
      // stay absent and fall through to unresolved rather than pick up the group's figure.
      if (excluded.has(o.id)) continue
      forItem[o.name] = num(o.price_adjustment)
    }
  }
```

### 4. 🔴 `priceNewModifier` takes an EXPLICIT item name — `on` is NOT reused as the key

```ts
-  const priceNewModifier = (m: RepriceModifier, on: string): number => {
+  const priceNewModifier = (m: RepriceModifier, on: string, itemName: string | null): number => {
     const advisory = num(m?.price)
-    const known = priceBook.optionPrice[m?.name]
+    const known = itemName ? priceBook.optionPrice[itemName]?.[String(m?.name ?? '')] : undefined
     if (known === undefined) {
       unresolved.push({ kind: 'modifier', name: m?.name ?? '(unnamed)', on, advisoryPrice: advisory })
       return advisory
     }
     return known
   }
```

**And the deal-slot call site now separates the two explicitly:**

```ts
+      // The DISH filling this slot — the lookup key. Null when the slot names no item, which is
+      // UNRESOLVED: there is no dish to price the option against and no truck-wide book to guess from.
+      const slotItemName = String(slots[slotKey] ?? '') || null
+      // The operator-facing label. Falls back to a synthesised name when the slot is empty, which is
+      // precisely why it must not double as the key.
+      const on = slotItemName || `${name || 'deal'} · ${slotKey}`
…
-        return { ...m, name: modName, price: lockedPrice !== undefined ? lockedPrice : priceNewModifier(m, on) }
+        return { ...m, name: modName, price: lockedPrice !== undefined ? lockedPrice : priceNewModifier(m, on, slotItemName) }
```

✅ **A deal slot with no resolvable item name passes `null` and is UNRESOLVED**, per requirement 5.

---

## What deliberately did NOT change

| Requirement 6 | Status |
|---|---|
| **The price-lock tier** — stored row first | ✅ **UNTOUCHED.** `indexStoredItems` / `indexStoredDeals` / `takeMatch` / the `if (locked)` branches are byte-identical. `priceNewModifier` is still reached only when nothing is locked. |
| **Advisory prices never decide money** | ✅ **UNTOUCHED.** The unresolved branch still returns `advisory` and still pushes an `UnresolvedRef` — same shape, same fields. |
| **409 `needsPriceConfirm`** | ✅ **UNTOUCHED.** `action/route.ts` was not opened for edit. It now fires on more inputs, which is the point of (c), but its code and contract are unchanged. |
| **`lib/option-stock.ts`** | ✅ **UNTOUCHED.** Its flat by-name map is for STOCK, which is a genuinely truck-wide pool — a different question from price. Noted in the header so the next reader does not "fix" it by symmetry. |
| **Public signatures** | ✅ `loadPriceBook(supabase, truckId)` and `repriceOrder(...)` are unchanged. `optionPrice` has **no consumer outside this file** — verified by repo-wide grep — so the type change is fully contained. |

---

## Non-ASCII census

| Char | | Before | After | Δ | Why |
|---|---|---|---|---|---|
| `·` | U+00B7 | 1 | 2 | **+1** | the `"<deal> · <slot>"` label quoted in the new comment |
| `×` | U+00D7 | 1 | 1 | 0 | — |
| `÷` | U+00F7 | 1 | 1 | 0 | — |
| `—` | U+2014 | 23 | 29 | **+6** | em dashes in the new comments (house style) |
| `→` | U+2192 | 8 | 12 | **+4** | `item name → option name`, `menu_item_id → menu_items_db.truck_id` |
| `─` | U+2500 | 803 | 820 | **+17** | ONE new section-separator rule in the header |
| 🔴 | U+1F534 | 0 | 2 | **+2** | 🔴 **A NEW CHARACTER CLASS** — see below |

```
BEFORE: DISTINCT = 6   TOTAL_NONASCII = 837
AFTER : DISTINCT = 7   TOTAL_NONASCII = 867   (+30)

characters that DROPPED           : 0
characters that VANISHED entirely : 0
```

🔴 **I INTRODUCED U+1F534 (🔴), twice — a character class this file did not previously contain.** It marks the two load-bearing warnings: *do not copy the un-scoped read at `submit/route.ts:625`*, and *`itemName` is the key, `on` is not*. That is the repo's established convention in `action/route.ts` and `submit/route.ts`, but it is **new to this file**, so I am naming it rather than letting DISTINCT drift silently. **Say the word and I will strip both.**

**Garble scan:** 0 × U+FFFD; no `Â£` / `â€` / `Ã©` / `ðŸ` mojibake. Nothing pre-existing needed flagging.

---

## Verification summary

```
$ npx tsc --noEmit -p tsconfig.json     → clean (a GATE, not verification)
$ npx eslint lib/order-repricing.ts     → ESLINT_EXIT=0
$ git diff --stat lib/order-repricing.ts → 1 file changed, 80 insertions(+), 15 deletions(-)

EXERCISED AGAINST REAL ROWS, importing the real loadPriceBook / repriceOrder:
  (a) Springrolls+Prawn 1.50 vs Pad Thai+Prawn 0.00; old flat 0.00 for both, 1.50 reversed
      5x reload → identical fingerprint; E2E unit_price £7.00 / £10.00 with 999 on the wire
  (b) pizzeria-gusto — 176 offered pairs, 176 agree, 0 disagree
  (c) 1,068 newly-UNRESOLVED pairs across 12 trucks, 451 of them non-zero under the old key
  (+) 14 of 14 live exclusions correctly absent from the new book
```

✅ **Scripts deleted.** `probe-shape.mjs`, `exercise.mjs`, `exercise2.mjs`, their three `.log` files and the two transpiled `.js` artefacts were all removed from the scratchpad, and the directory listing afterwards confirms none remain. **Nothing was written to the repository and nothing was written to the database — every query in every script was a `select`.**

## One thing worth a decision

⚠️ **The 451 money-bearing newly-unresolved pairs are an improvement, but they surface as a 409 to the operator, not as a silent correction.** That is right — the server cannot know what an option the dish does not offer is *supposed* to cost. But if a menu is edited while an order is open, an operator could now meet a confirm dialog they did not meet yesterday. **No change proposed; flagging it so it is not a surprise.**
