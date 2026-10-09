# "Set each price myself" keeps the prices that were being charged

**10 October 2026 · not deployed · not pushed · no SQL run · no migration · no backfill · one truck in scope (`test-truck`, untouched)**

Switching an event type to "Set each price myself" now writes every item's current price down as its
own typed price **before** the rule is taken away. Prices charged before and after the switch are
identical to the penny.

---

## 0. The short version

| § | What was asked | What happened |
|---|---|---|
| 1 | Lock in prices on the switch to `'none'` | **Done**, in the same save: freeze, then clear the amount and the rounding — in that order |
| 2 | Types already in `'none'` with a stored rounding | **Unchanged until saved.** The arithmetic is untouched, so they charge exactly what they charge today; the next save locks them in. No migration, no backfill |
| 3 | A menu item added later | Charges its menu price — and this is why the lock-in has a **"has it settled"** condition, not just a "mode is none" one |
| 4 | Screens | The override count is hidden in that mode; the price audit is §4.2 — **one chain, four surfaces** |
| 5 | Read-only SQL | Pasted in chat, not run |

**The fault being closed**, from `docs/phone-fixes-2-report.md` §2.4: `applyPriceRule` applies a stored
rounding **whatever the mode** — the rule branches are skipped for `'none'`, the rounding step after
them is not. So a type on "+10%, nearest £1" switched to "Set each price myself" kept
`price_rounding: 'nearest_1'`, both screens hid the control (rounding is not in
`PRICE_MODES_WITH_AMOUNT`), and every untyped item went on being rounded to the pound with nothing
saying so.

⛔ **Clearing the rounding on its own would have been the worse fix.** Every price would have *moved*,
silently, on a settings save: the £14.00 Margherita would have dropped to £12.50. That is the control in
§5.2, and it is what the lock-in exists to prevent.

---

## 1. The lock-in

### 1.1 Where it is

| | |
|---|---|
| **the decision and the arithmetic** | `lib/event-pricing/lock-in.ts` — pure, no database |
| **the reads and the write** | `app/api/event-types/route.ts`, inside `set_type_pricing` |

⚠️ **Split that way so the decision can be measured with real numbers and no client at all.**
`scripts/event-pricing.cjs` puts the brief's own figures through the real `shouldLockIn` and
`lockedInPrices`.

### 1.2 The order, which is the load-bearing part

```
1. read the type's current columns and its typed prices   (readTypePricingForTruck)
2. decide                                                  (shouldLockIn)
3. read the menu                                           (loadPricingItems)
4. compute each untyped item's price under the OLD setup   (lockedInPrices → applyPriceRule)
5. write those rows                                        (upsert, ignoreDuplicates)
6. ONLY THEN clear the amount and set rounding to 'none'
7. write the patch
```

⛔ **If step 5 fails, nothing is saved.** Clearing the rounding with no prices written down is the one
outcome worse than either half, so the handler returns 400 and the type is left exactly as it was.

⛔ **A failed read at step 1 also refuses the save.** `ok: false` means it is unknown whether this save
would move a price, and writing the patch anyway is precisely the silent change this exists to prevent.

⚠️ **The amount and rounding are overridden, not defaulted** — a client cannot ask to keep a rounding
that nothing on either screen can show.

### 1.3 What gets written

- **Every item that does not already have a typed price**, at `applyPriceRule(menuPence, oldSetup)` —
  the same function the customer's menu, the order submit and the dashboard column all charge with, so
  "what it was charging" is asked of the one place that knows rather than re-derived.
- **An item that already has one is left alone.** It is the operator's own number and it was already
  what the item charged (a typed price is never ruled and never rounded). ⚠️ `ignoreDuplicates: true`
  makes the database enforce that too, so two racing saves cannot overwrite it with a recomputed one.
- The items come from `loadPricingItems` — the same set the price column uses, **with no availability
  filter**, because a sold-out dish must stay priceable.

### 1.4 🔴 When it runs, and the clause that makes §3 true

All three must hold:

1. **the type is charging its own prices before and after.** If it was off, the prices being charged
   were the menu's and there is nothing to preserve; if it is being turned off, the rule stops applying
   anyway.
2. **it ends the save in `'none'`** — set there by this patch, or already there and not moved. ⛔
   **Switching *out* of `'none'` must not lock in**: the operator is choosing a new rule, and a typed
   price on every item would make that rule do nothing at all.
3. 🔴 **the old setup could actually move a price** — it had a rule mode, or a rounding.

**Clause 3 is what makes the whole thing settle.** After one lock-in the type is `'none'` with rounding
`'none'`, which moves nothing — so no later save locks in again. **That is what lets an item added
afterwards keep following its menu price** instead of being frozen by the next save of an unrelated
setting (§3 of the brief). A lock-in keyed only on "the mode is none" would have frozen every new dish
the next time anything on that type was saved.

### 1.5 ⚠️ One consequence worth stating plainly

Dominic's rule is *"every item keeps exactly the price it had just before the switch"*, so a type whose
old rule happened to produce the menu price still gets a typed price at the menu price. **Those items
stop following later menu-price changes.** That is the rule as written, and it is consistent with the
mode's own name — in "Set each price myself" every price is a price somebody set. It is stated here
rather than left to be discovered.

---

## 2. Types already in `'none'` with a stored rounding

**Nothing changed for them, deliberately.**

- `applyPriceRule`'s arithmetic is **untouched**, so they charge exactly what they charge today.
- The next time one is saved — any `set_type_pricing` save, including flipping the switch or re-picking
  the same mode — clause 3 above is true (its rounding is not `'none'`), so it locks in first and then
  clears the rounding.
- **No migration and no backfill.** A type nobody saves is a type nothing happens to.

Measured: a type in `'none'` with `nearest_1` prices a £12.50 item at **£13.00** today, and at
**£13.00** after its next save.

---

## 3. An item added after the switch

It has no typed price and the rounding is gone, so it charges its **menu price** — £9.99 stays £9.99.
This is a direct consequence of §1.4's clause 3, and it is checked.

---

## 4. Screens

### 4.1 The override count

Hidden entirely in "Set each price myself". In that mode the save writes a typed price for every item,
so the line would read "30 items have their own price" under a heading that already says "Set the price
of each item". ⚠️ **It is a count of items *departing from a rule*, so a screen with no rule has nothing
for it to count.** It is unchanged in the other modes.

### 4.2 Every surface that shows or charges a price

**One chain, and nothing computes a price outside it:**

```
applyPriceRule  ←  priceForItem (typed ?? rule)  ←  priceAtEvent (event ?? type ?? menu)
```

| surface | what it calls | where |
|---|---|---|
| **the customer's menu** | `priceAtEvent` | `app/api/menu/[truckId]/route.ts:371` |
| **what an order is charged** | `loadEventPriceBook` → `priceAtEvent` | `lib/event-pricing/read.ts:362`, used by `app/api/orders/submit/route.ts:585` |
| **totals, repricing and the dashboard's own actions** | the same price book | `app/api/dashboard/action/route.ts:761, 1456` |
| **the dashboard's "Items — this event" Price column** | `priceAtEvent`, server-side | `app/api/event-types/route.ts:410, 413` |
| **the Event types grid and the phone card** | `priceForItem` / `applyPriceRule` via `PriceCell` | `components/shared/PriceControls.tsx:314, 320` |
| **the lock-in itself** | `applyPriceRule` | `lib/event-pricing/lock-in.ts:99` |

⚠️ `scripts/event-pricing.cjs` §5 already asserts there is no second implementation anywhere; the lock-in
joins that chain rather than opening a new one.

---

## 5. What was checked

### 5.1 The brief's figures, measured

| | |
|---|---|
| "+10%, nearest £1" on a £12.50 item | **£14.00** (1375p to the penny, £14 to the pound) |
| after switching to `'none'` | **still £14.00**, and now a typed price |
| a typed £11.00 item | **still £11.00**, untouched by the freeze |
| editing one item | £14.00 → £13.50, **Pepperoni unchanged at £11.00** |
| a dish added after the switch | **£9.99** — its menu price |
| a type already in `'none'` with a rounding | **£13.00** today, **£13.00** after its next save |

Plus the decision itself in all six of its cases (switch in, switch out, type off, being turned off,
already-`'none'`-with-rounding, and already settled), and four source checks on the route: the order of
operations, that a failed freeze stops the save, that the amount and rounding are overridden rather than
defaulted, and that `ignoreDuplicates` protects an existing typed price at the database.

### 5.2 ⛔ The control

The lock-in is skipped and the rounding cleared anyway: **the £14.00 item drops to £12.50**, and the
check catches it. Without it, every assertion above would pass just as happily against a lock-in that
never ran.

### 5.3 The runs

| | |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint` on the three touched files | **0 problems** |
| `npx next build` | compiled successfully |
| `node scripts/event-pricing.cjs` | **130 checks, 15 variants, all passing** |
| `node scripts/event-types.cjs` | **185 checks, all passing** |
| `node scripts/run-harnesses.cjs` | **98 harnesses, all green** (`rc=0`) |

⚠️ **One check of mine failed on correct code and was fixed, not waived.** The route-order check searched
for `.from('event_types').update(patch)` from the top of the file and found the **service-settings**
save, which uses a local with the same name — so the ordering read as violated. It searches from the
clear now, which is the claim it is actually making.

---

## 6. The rules

| Rule | |
|---|---|
| Test only on Pizza Kitchen | No truck was opened, called or changed. Every check is a compiled module with literal numbers — no database, no network, no browser |
| Never deploy or push | Neither was done |
| Never run SQL | None was run. The read-only query is in chat, not executed |
| Never kill by name or pattern | No process was killed |
| No outreach_templates, no emails, no dropped tables | None touched |

Nothing in the brief arrived garbled, and no instruction contradicted another.

---

## 7. Files

| File | |
|---|---|
| `lib/event-pricing/lock-in.ts` | **new** — the decision and the arithmetic, pure |
| `app/api/event-types/route.ts` | the lock-in inside `set_type_pricing`: read, decide, freeze, then clear |
| `components/manage/EventTypes.tsx` | the override count is hidden in "Set each price myself" |
| `scripts/event-pricing.cjs` | §7c — the brief's figures, the six decision cases, four route checks, and the control |
