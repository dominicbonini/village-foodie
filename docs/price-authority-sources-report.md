# Does a server-side pricing authority already exist on another path?

**Date:** 11 August 2026
**READ-ONLY. No file changed, no file created except this report. No `next dev`, no `next build`.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE HEADLINE

**YES — one already exists, and it is `lib/order-repricing.ts`.** It is not a partial sketch: it loads a truck-scoped price book from three tables, resolves every item, every modifier and every bundle against it, refuses to trust a single price off the wire, and delegates the arithmetic to the same `calculateOrderTotal` the customer path uses.

🔴 **BUT IT IS WIRED TO EXACTLY ONE HANDLER — the operator `edit` action.** The customer submit path does not call it, does not import it, and never has.

✅ **AND THE DATA IT WOULD NEED AT SUBMIT IS MOSTLY ALREADY FETCHED THERE.** `menu_items_db` **with `price`** is read at `submit/route.ts:467`, and `bundles_db` at `:492`. **The one genuine gap is modifier option prices**, which submit fetches only partially and only inside a `try`-scoped closure.

⚠️ **One caveat that shapes any reuse:** order-repricing's primary source is the **stored order row**, and on the customer path that row's prices were written by the client (§7). **Price-lock is not the same as price authority.** At submit there is no prior row, so this concern does not apply to a new order — but it does mean the edit path inherits whatever the customer path let through.

---

## 1. Database or payload?

**Source: QUOTED. It prices from the DATABASE.** Both statements below are from the module's own header, `lib/order-repricing.ts:1-17`:

```ts
// lib/order-repricing.ts
// SERVER-AUTHORITATIVE order pricing under PRICE-LOCK.
…
// The live menu (menu_items_db / modifier_options / bundles_db) is consulted ONLY to price something
// genuinely NEW that this edit adds. It is the fallback, not the source.
//
// The request body's prices are ADVISORY throughout. They identify WHAT was selected; they never
// decide money.
```

**The lines that actually settle it — a real lookup, `:325` and `:336`:**

```ts
        const base = priceBook.itemPrice[name]
        if (base === undefined) {
…
          serverUnit = base + repricedMods.reduce((s, m) => s + m.price, 0)
```

**And for modifiers, `:287-295`:**

```ts
  const priceNewModifier = (m: RepriceModifier, on: string): number => {
    const advisory = num(m?.price)
    const known = priceBook.optionPrice[m?.name]
    if (known === undefined) {
      unresolved.push({ kind: 'modifier', name: m?.name ?? '(unnamed)', on, advisoryPrice: advisory })
      return advisory
    }
    return known
  }
```

🔴 **The lookup is BY NAME, not by id** — `priceBook.itemPrice[name]` and `priceBook.optionPrice[m?.name]`, both plain string-keyed record lookups.

⚠️ **There is a two-tier hierarchy, and the database menu is the SECOND tier, not the first:**

| Tier | Source | When |
|---|---|---|
| 1 | **the stored order row** (`order.items[].unit_price`, `order.deals[].price`) | the line is already on the order — **price-lock** |
| 2 | **the live menu** (`menu_items_db` / `modifier_options` / `bundles_db`) | the line is **new to this edit** |
| 3 | **the client's advisory figure** | the name is on **neither** — and it is **flagged to the operator** |

**Tier 3 is not silent.** `:329` pushes an `UnresolvedRef`, and the handler returns **HTTP 409 `needsPriceConfirm`** rather than saving (`action/route.ts:642-650`). 🔴 **The client's number can never reach the database without an explicit operator acknowledgement of the exact total.**

---

## 2. Every table it reads, and how each match is made

**Source: QUOTED.** `lib/order-repricing.ts:163-173` — the entire query block, in one `Promise.all`:

```ts
export async function loadPriceBook(supabase: SupabaseClient, truckId: string): Promise<PriceBook> {
  const [{ data: itemRows }, { data: optionRows }, { data: bundleRows }] = await Promise.all([
    supabase.from('menu_items_db').select('name, price').eq('truck_id', truckId),
    // SAME truck-scoping join as lib/option-stock.ts fetchTruckOptionsByName — modifier_options has no
    // truck_id of its own, only group_id → modifier_groups.truck_id.
    supabase
      .from('modifier_options')
      .select('name, price_adjustment, modifier_groups!inner(truck_id)')
      .eq('modifier_groups.truck_id', truckId),
    supabase.from('bundles_db').select('name, bundle_price, original_price').eq('truck_id', truckId),
  ])
```

| Table | Column read | Matched by | Truck-scoped? |
|---|---|---|---|
| `menu_items_db` | `price` | 🔴 **NAME** — `itemPrice[r.name]` (`:178`) | ✅ **YES** — `.eq('truck_id', truckId)` |
| `modifier_options` | `price_adjustment` | 🔴 **NAME** — `optionPrice[r.name]` (`:184`) | ✅ **YES** — via the `modifier_groups!inner(truck_id)` join, because **`modifier_options` has no `truck_id` column of its own** |
| `bundles_db` | `bundle_price`, `original_price` | 🔴 **NAME** — `bundle[r.name]` (`:189`) | ✅ **YES** — `.eq('truck_id', truckId)` |

🔴 **NOTHING IS MATCHED BY ID. Every one of the three is a name join.** No `id` column is even selected for items or options.

⚠️ **The name-match failure mode is documented in the module, `:40`, QUOTED:**

```ts
// DUPLICATE NAMES: modifier options are matched by name, last-wins — the edge already documented in
// lib/option-stock.ts:11-13. Two stored lines sharing one identity are matched pairwise, in order.
```

⚠️ **Truck-scoping is airtight but name-collision is NOT.** Two options called "Large" in two different groups of the SAME truck collapse to one entry, last-wins. **INFERRED** from the quoted comment plus the flat `Record<string, number>` shape at `:126` — the record has no group dimension.

---

## 3. Modifier option prices, specifically

**Source: QUOTED. It handles them fully — in three distinct places, with three different rules.**

### (a) A modifier on a LOCKED line — from the stored row

`:316-320`:

```ts
      repricedMods = mods.map(m => ({
        ...m,
        name: String(m?.name ?? ''),
        price: locked.modPrice[String(m?.name ?? '')] ?? num(m?.price),
      }))
```

`locked.modPrice` is built by `indexStoredItems`, `:226`:

```ts
    for (const m of asArray<RepriceModifier>(it?.modifiers)) modPrice[String(m?.name ?? '')] = num(m?.price)
```

### (b) A modifier on a NEW line — from `modifier_options`

`:333-336`:

```ts
        repricedMods = mods.map(m => ({ ...m, name: String(m?.name ?? ''), price: priceNewModifier(m, name || '(unnamed)') }))
        // Repo-wide convention: unit_price INCLUDES the modifiers
        // (app/trucks/[slug]/order/page.tsx:1127, lib/seed-demo-orders.ts:290-292).
        serverUnit = base + repricedMods.reduce((s, m) => s + m.price, 0)
```

🔴 **`serverUnit = base + Σ modifier prices`, both sides database-sourced.** This is the exact computation the customer path does **on the client** at `order/page.tsx:1138` and never re-does on the server.

### (c) A DEAL-SLOT modifier — locked per slot, else from the menu

`:364-372`:

```ts
    for (const slotKey of Object.keys(slotModifiers)) {
      const list = asArray<RepriceModifier>(slotModifiers[slotKey])
      const on = slots[slotKey] || `${name || 'deal'} · ${slotKey}`
      repricedSlotModifiers[slotKey] = list.map(m => {
        const modName = String(m?.name ?? '')
        const lockedPrice = locked?.modPrice[`${slotKey}::${modName}`]
        return { ...m, name: modName, price: lockedPrice !== undefined ? lockedPrice : priceNewModifier(m, on) }
      })
      modifierExtra += repricedSlotModifiers[slotKey].reduce((s, m) => s + m.price, 0)
    }
```

⚠️ **Deal-slot modifiers are keyed `${slotKey}::${name}`** (`:245`), so the same option on two slots is priced independently — correct, and a detail any reimplementation would have to match.

✅ **The resolved prices are WRITTEN BACK**, not merely used for a comparison — `action/route.ts:678` stores `items: repriced.items`, whose `modifiers[].price` are the server's figures. **The stored row cannot drift from the stored total.**

---

## 4. The entry point in `action/route.ts`

**Source: QUOTED.** `app/api/dashboard/action/route.ts:605-609`:

```ts
      const repriced = repriceOrder(
        effItems, effDeals, priceBook,
        { items: order.items, deals: order.deals },
        discountCodeRow,
      )
```

**Its four inputs, each traced to its origin — all QUOTED:**

| Arg | What it is | Origin |
|---|---|---|
| `effItems` | `const effItems = items \|\| order.items \|\| []` (`:575`) | 🔴 **the REQUEST BODY** (`editedOrder.items`, `:552`), falling back to the stored row |
| `effDeals` | `const effDeals = editedDeals !== undefined ? editedDeals : (order.deals \|\| [])` (`:576`) | 🔴 **the REQUEST BODY**, same fallback |
| `priceBook` | `const priceBook = await loadPriceBook(supabase, truck.id)` (`:577`) | ✅ **the DATABASE**, truck-scoped |
| `stored` | `{ items: order.items, deals: order.deals }` | ✅ **the STORED ROW** — `order` was selected with `*` at `:558`, `.eq('truck_id', truck.id)` |
| `discountCodeRow` | resolved at `:585-601` | ✅ **`discount_codes_db`**, truck-scoped — ⚠️ **deliberately NOT filtered on `is_active`** (`:579-584`), so deactivating a code cannot retroactively re-charge an existing customer |

**The handler's own statement of the contract, `:561-563`, QUOTED:**

```ts
      // ── SERVER-AUTHORITATIVE PRICING, PRICE-LOCKED ─────────────────────────────────────────────
      // The request body's unit_price / modifier prices / deal price are ADVISORY ONLY — they say
      // WHAT was selected, never what it costs.
```

🔴 **So the body supplies WHAT (names, quantities, modifier selections); the database supplies HOW MUCH.** That is precisely the separation the customer path lacks.

**And the output is written server-side, `:688-692`, QUOTED:**

```ts
        total:       newTotal,
        subtotal:    newSubtotal,
        discount_amt: newDiscountAmt,
        // §4a — pence, derived server-side from the server total. Never client-supplied.
        total_minor: newTotalMinor,
```

⚠️ **`repriceOrder` has exactly ONE call site.** A repo-wide grep returns only `action/route.ts:605` plus the export itself.

---

## 5. 🔴 The required-modifier guard's queries — do they include PRICES?

**Source: QUOTED.** `submit/route.ts:625-629` — the guard's entire data fetch:

```ts
        const [{ data: itemLinks }, { data: optsRaw }, { data: itemRows }] = await Promise.all([
          supabase.from('item_modifier_groups').select('menu_item_id, group_id, excluded_option_ids'),
          supabase.from('modifier_options').select('id, group_id, name, price_adjustment, available, stock_count').in('group_id', Array.from(enforceIds)),
          supabase.from('menu_items_db').select('id, name').eq('truck_id', resolvedTruckId),
        ])
```

**Plus its first query, `:608-613`:**

```ts
        const { data: groupsRaw } = await supabase
          .from('modifier_groups')
          .select('id, name, is_required, min_choices, max_choices, hide_name')
          .eq('truck_id', resolvedTruckId)
```

### ✅ YES — `price_adjustment` IS selected

**But three limits make it unusable as-is:**

🔴 **(a) IT COVERS ONLY REQUIRED AND CAPPED GROUPS.** `:614-619`, QUOTED:

```ts
        const enforceIds = new Set((groupsRaw || [])
          .filter(g => g.is_required || (g.min_choices ?? 0) >= 1 || (g.max_choices ?? 99) < 99)
          .map(g => g.id))
        if (enforceIds.size === 0) return null // no required/capped groups → nothing to enforce
```

**An OPTIONAL, uncapped group — "add extra cheese +£1.00" — is not in `enforceIds`, so its options are never fetched.** ⚠️ **Those are exactly the paid add-ons a price authority most needs**, and exactly the ones the guard is least interested in.

🔴 **(b) IT SHORT-CIRCUITS TO ZERO QUERIES.** If a truck has no required or capped group, `:619` returns **before** the `Promise.all` runs. A price authority hanging off this fetch would silently have no data for that truck.

🔴 **(c) IT IS SEALED INSIDE A CLOSURE, INSIDE A FAIL-SAFE `try`.** `optsRaw` is declared inside the async IIFE at `:607` and is unreachable at `:719`. And `:716-718`:

```ts
    } catch (err) {
      console.error('[submit] required-modifier guard error — proceeding (fail-safe):', err)
    }
```

⚠️ **The guard is deliberately fail-open** (`:602-604`: *"any error resolving groups → log + PROCEED"*). **Money must fail closed.** Reusing its fetch would inherit a posture that is right for a completeness check and wrong for a price.

### 🔴 THE ACTUAL ANSWER TO YOUR QUESTION — most of the fetch already exists, ELSEWHERE in the route

⚠️ **`menu_items_db` at `:628` selects `id, name` — NO price.** But **80 lines earlier the route already reads prices**, `:467-470`, QUOTED:

```ts
    const { data: menuItems } = await supabase
      .from('menu_items_db')
      .select('name, price, auto_accept, preorder_enabled')
      .eq('truck_id', resolvedTruckId)
```

✅ **Truck-scoped, `price` included, and already in scope at the `calculateOrderTotal` call on `:520`.** The route passes it in and the function then ignores it for the items arm (third-pass report, §2).

**And bundles are already read too**, `:492-495`:

```ts
    const { data: bundles } = await supabase
      .from('bundles_db')
      .select('*')
      .eq('truck_id', resolvedTruckId)
```

### Verdict

| Input a price authority needs | Already fetched at submit? |
|---|---|
| **Item base prices** | ✅ **YES** — `:467`, truck-scoped, in scope, unused for pricing |
| **Bundle prices** | ✅ **YES** — `:492`, truck-scoped, already used |
| 🔴 **Modifier option prices** | ⚠️ **PARTIALLY** — `:627`, but **required/capped groups only**, **skipped entirely** when there are none, **out of scope** outside the IIFE, and behind a **fail-open** `try` |
| **Discount code** | ✅ **YES** — `:504-514`, truck-scoped, `is_active` filtered |

🔴 **So a submit-side price authority needs ONE new query: the truck's modifier options with `price_adjustment` — which is precisely the second element of `loadPriceBook` and could be had by calling `loadPriceBook(supabase, resolvedTruckId)` outright.** ⚠️ That would duplicate the item and bundle reads already made; whether to accept two extra queries or thread the existing data through is the design call, not a blocker.

---

## 6. The modifiers array in the client payload

**Source: QUOTED.** `app/trucks/[slug]/order/page.tsx:1135-1142` — a single item as posted:

```tsx
          items: basket.map(b => ({
            name: b.menuItem.name,
            quantity: b.quantity,
            unit_price: b.menuItem.price + b.modifiers.reduce((s, m) => s + m.price, 0),
            modifiers: b.modifiers.length > 0 ? b.modifiers : undefined,
            specialInstructions: b.specialInstructions || undefined,
            source: (b as any).source || 'direct',
          })),
```

**The type of `b.modifiers` — `order/page.tsx:75`:**

```ts
  modifiers: { name: string; price: number; allergens?: string[]; dietary?: string[] }[]
```

🔴 **NAME AND PRICE ONLY. NO ID.**

**And this is deliberate, not an oversight — `lib/modifier-rules.ts:48-53`, the single constructor of every selected modifier in the app:**

```ts
function selectedFromOption(option: ModRuleOption): SelectedMod {
  const entry: SelectedMod = { name: option.name, price: option.price_adjustment }
  if (option.allergens && option.allergens.length) entry.allergens = option.allergens
  if (option.dietary && option.dietary.length) entry.dietary = option.dietary
  return entry
}
```

🔴 **`option.id` EXISTS on the input and is DISCARDED.** The source type carries it — `order/page.tsx:50`:

```ts
interface ModifierOption { id: string; name: string; price_adjustment: number; available?: boolean; allergens?: string[]; dietary?: string[]; stock_count?: number | null }
```

⚠️ **CONSEQUENCE FOR SCOPING.** A submit-side price authority **cannot match by id today** — the id is not on the wire. It must match by name, exactly as `order-repricing` does, and inherits the same duplicate-name last-wins edge (§2). ✅ **The upside: it would be consistent with the one authority that already exists**, rather than introducing a second matching basis. Adding ids would touch `selectedFromOption`, the three item modals, the deal modal and the stored JSONB shape — a separate, larger change.

⚠️ **Note also `unit_price` at `:1138` is `base + Σ modifiers` — computed on the client.** That single expression is the whole of today's item pricing.

---

## 7. Does anything server-side read the stored `orders.deals` price the client wrote?

**Source: QUOTED. First — that the field IS the client's.** `submit/route.ts:907-913`:

```ts
      const p_order = {
        customer_name:  customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        order_type:     'collection',
        items,
        deals:          deals ?? null,
```

🔴 **`deals` is stored VERBATIM** — no mapping, no repricing — and the client sends `price: d.bundle.bundle_price` (`order/page.tsx:1143`).

### 🔴 YES. Three server-side readers, and the first one matters most.

**(a) `lib/order-repricing.ts:236-252` — `indexStoredDeals`. It reads it AS THE AUTHORITATIVE LOCKED PRICE:**

```ts
function indexStoredDeals(deals: unknown): Map<string, StoredDealPrice[]> {
  const index = new Map<string, StoredDealPrice[]>()
  for (const d of asArray<RepriceDeal>(deals)) {
    const bundlePrice = num(d?.price, NaN)
    if (!Number.isFinite(bundlePrice)) continue
```

**consumed at `:376-377`:**

```ts
    if (locked) {
      bundlePrice = locked.bundlePrice
```

🔴 **THIS IS THE FINDING WORTH ACTING ON.** On a customer-placed order, `orders.deals[].price` **was written by the browser**. The edit path then treats it as the locked, authoritative bundle price and **never consults `bundles_db` for it**. ⚠️ **Price-lock faithfully preserves whatever the customer path admitted — including a wrong number.** The authority is only as good as the row it locks onto.

⚠️ **Same for slot modifiers:** `:245` indexes `modPrice[`${slotKey}::${name}`] = num(m?.price)` from the stored row, and `:369-370` prefers it over the menu.

⚠️ **Two mitigations, both QUOTED:** the NaN guard at `:240` (`if (!Number.isFinite(bundlePrice)) continue`) drops a malformed stored price through to the menu, and the customer-path client sends the **bundle price without `modifierExtra`** (`:1143`), so what is locked is at least the right *kind* of number.

**(b) `lib/email.ts:52-53` and `:266` — rendered to the customer:**

```ts
    const priceCell = deal.price != null
      ? `<td style="text-align:right;padding:4px 0 2px;color:#d97706;font-weight:500">£${Number(deal.price).toFixed(2)}</td>`
```

```ts
      const lines = [`🎁 ${d.name}: ${slotLabel}${d.price != null ? ` — £${d.price.toFixed(2)}` : ''}`]
```

**Reached from the stored row at `action/route.ts:156`, `:238` and `:1532` (`deals: order.deals || []`)** — server-side sends, so the client's figure is printed in an email the customer keeps.

**(c) `lib/printing/mapOrderToTicket.ts:103-105`** — `price: d.price`, onto the printed ticket. ⚠️ **Its only call site in the repo is `app/dev/ticket-preview/page.tsx:185`, a dev page** — so **not established** that this runs on a live server path today.

---

## 8. Where the client computes `modifierExtra`, and what the server would need

**Source: QUOTED.** `components/dashboard/DealsModal.tsx:169-205` — the whole computation:

```tsx
    const cleanSlots: Record<string, string> = {}
    const rawSlots: Record<string, string> = {}
    const slotModifiers: Record<string, { name: string; price: number }[]> = {}
    let originalPrice = 0
    let modifierExtra = 0

    cats.forEach((cat, index) => {
      const slotKey = String(index)
      const raw = slotSelections[slotKey]
      const isExisting = raw.startsWith('USE_EXISTING:')
      const identifier = stripUnit(raw.replace('USE_EXISTING:', ''))
      const dealModalMods = slotMods[slotKey] || []
      const dealModalCost = dealModalMods.reduce((s, m) => s + m.price, 0)
      // rawSlots uses base cartKey (no unit suffix) so callers can filter basket entries as before
      rawSlots[slotKey] = isExisting ? `USE_EXISTING:${identifier}` : raw

      if (isExisting) {
        const basketItem = basketItems.find(b => itemKey(b) === identifier)
        const displayName = basketItem?.name || identifier
        cleanSlots[slotKey] = displayName
        const basePrice = menuItems.find(m => m.name === displayName)?.price ?? 0
        const dealModalCost = dealModalMods.reduce((s, m) => s + m.price, 0)
        originalPrice += basePrice + dealModalCost
        modifierExtra += dealModalCost
        if (dealModalMods.length) slotModifiers[slotKey] = dealModalMods
      } else {
        cleanSlots[slotKey] = identifier
        originalPrice += (menuItems.find(m => m.name === identifier)?.price ?? 0) + dealModalCost
        modifierExtra += dealModalCost
        if (dealModalMods.length) slotModifiers[slotKey] = dealModalMods
      }
    })

    const effectiveDealPrice = selectedDeal.bundle_price + modifierExtra
    const discount = Math.max(0, originalPrice - effectiveDealPrice)

    onApply(selectedDeal, cleanSlots, effectiveDealPrice, discount, rawSlots, modifierExtra, slotModifiers, slotNotes)
```

🔴 **`modifierExtra` is Σ over every slot of Σ over that slot's selected options of `m.price`.** Nothing else.

### What the server would need — and it is already written

| Input | Where it would come from |
|---|---|
| **The slot→options structure** | ✅ **already on the wire** — `deals[].slotModifiers` (`order/page.tsx:1143`) |
| 🔴 **Each option's price** | **`modifier_options.price_adjustment`, truck-scoped via `modifier_groups`** — i.e. `PriceBook.optionPrice` |

**And `order-repricing` ALREADY computes exactly this figure, `:363-372` — QUOTED:**

```ts
    let modifierExtra = 0
    for (const slotKey of Object.keys(slotModifiers)) {
      const list = asArray<RepriceModifier>(slotModifiers[slotKey])
      const on = slots[slotKey] || `${name || 'deal'} · ${slotKey}`
      repricedSlotModifiers[slotKey] = list.map(m => {
        const modName = String(m?.name ?? '')
        const lockedPrice = locked?.modPrice[`${slotKey}::${modName}`]
        return { ...m, name: modName, price: lockedPrice !== undefined ? lockedPrice : priceNewModifier(m, on) }
      })
      modifierExtra += repricedSlotModifiers[slotKey].reduce((s, m) => s + m.price, 0)
    }
```

✅ **Same shape, same summation, database prices instead of the modal's.** On a NEW order there is no `locked`, so **every branch resolves through `priceNewModifier` → `priceBook.optionPrice`** — fully database-sourced with no price-lock inheritance.

🔴 **A GAP WORTH NAMING SEPARATELY.** The customer path **never sends `modifierExtra` and never adds it to the deal price**: `order/page.tsx:1143` posts `price: d.bundle.bundle_price`, and the server's `dealsForCalc` (`submit/route.ts:498`) supplies only `{ bundle, slots }`, so `calculateOrderTotal`'s `(deal.modifierExtra || 0)` (`order-calculations.ts:89`) is **always 0 on the customer path**. **INFERRED, and consistent with §7's finding.** ⚠️ Whether paid deal-slot modifiers are therefore under-charged, or the client folds them in elsewhere, was outside this pass — **not established**.

⚠️ **`originalPrice` and `discount` are display-only** and would not need reproducing: they feed `dealSavings`, which the third-pass report established never reaches `subtotal` or `total`.

---

## Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — header, `:325/336`, `:287-295` |
| 2 | **QUOTED** — the full `loadPriceBook` query block and all three index writes. The name-collision consequence is **INFERRED** from the quoted comment + the flat `Record` type |
| 3 | **QUOTED** — all three branches |
| 4 | **QUOTED** — the call and every argument's origin. "One call site" is a **QUOTED negative grep** |
| 5 | **QUOTED** — all four queries, the `enforceIds` filter, the early return, the `catch`. The `:467` and `:492` findings are **QUOTED** |
| 6 | **QUOTED** — payload, type, and `selectedFromOption`. The scoping consequence is **INFERRED** |
| 7 | **QUOTED** — `p_order.deals`, `indexStoredDeals`, `email.ts`. The `mapOrderToTicket` call-site finding is a **QUOTED negative grep** |
| 8 | **QUOTED** — the modal computation and order-repricing's equivalent. The always-zero `modifierExtra` on the customer path is **INFERRED** from three quoted sites |

## Not established

- Whether `mapOrderToTicket` runs on any live path, or only in the dev preview.
- Whether deal-slot modifier surcharges are actually under-charged on the customer path, or folded in somewhere I did not open (§8).
- Whether any `orders.deals[].price` currently stored in the database disagrees with `bundles_db` — that is a data question, and this pass touched no rows.
- Whether `loadPriceBook`'s three queries are cheap enough to add to the submit hot path — not measured.
