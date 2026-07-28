# STEP ZERO (corrected) — PRICE-LOCK on the operator edit path

**Date:** 28 July 2026 · **Repo:** `/Users/dominicbonini/dev/village-foodie` · **Branch:** `main`, based on `79f3153`
**Correction to the step-zero build already in the working tree.** Not a fresh start — most of it stands.
`next dev` / `next build` NOT run. No migration applied.
**Verification run:** `npx tsc --noEmit` → clean, plus a 15-case behavioural harness on the pure pricing logic (§7).

> This file replaces the previous step-zero report. That content is not preserved anywhere.

---

## ⚠️ FLAGGED FIRST — garbled spans in the prompt

Five spans do not parse. Not silently repaired — my reading is stated so you can correct it. I built to the stated reading in each case; none changed what was built.

| # | Span as written | Read as |
|---|---|---|
| 1 | "the edit handler currently trusts `i.unit_price` out of**ST BODY**" | "out of **the REQUEST BODY**" |
| 2 | "THE PRICING RULE TO IMPLEMENT (assuming **mposed**-unit_price shape)" | "assuming **the composed**-unit_price shape" |
| 3 | "the price book is now the fallback for NEW lines only, **not the source for.**" | "**not the source for existing ones.**" — sentence truncated mid-object |
| 4 | "the migration **20260728_orders_total_minl_savings.sql**" | "**20260728_orders_total_minor_deal_savings.sql**" — the real filename on disk |
| 5 | "If anything here conflicts with what you find in the code, STOP and **t**" | "STOP and **tell me.**" |

Nothing conflicted. No stop was needed.

---

## 1 · DIAGNOSIS FIRST — what is actually stored in `orders.items[]` / `orders.deals[]`

Four write paths, traced to source. All four write **plain JSON straight through** — no server-side normalisation existed before this work.

### The four write paths, verbatim

**(i) Customer submit** — `app/trucks/[slug]/order/page.tsx:1125-1133` builds the payload, `app/api/orders/submit/route.ts:889-903` puts it in `p_order`, and `place_order_atomic` stores it unmodified (`coalesce(p_order->'items','[]'::jsonb)`, `p_order->'deals'`):

```js
items: basket.map(b => ({
  name: b.menuItem.name,
  quantity: b.quantity,
  unit_price: b.menuItem.price + b.modifiers.reduce((s, m) => s + m.price, 0),
  modifiers: b.modifiers.length > 0 ? b.modifiers : undefined,
  specialInstructions: b.specialInstructions || undefined,
  source: (b as any).source || 'direct',
})),
deals: appliedDeals.map(d => ({ name: d.bundle.name, slots: d.slots, slotModifiers: d.slotModifiers, slotNotes: d.slotNotes, price: d.bundle.bundle_price })),
```

**(ii) Operator manual add** — `components/dashboard/AddOrderPanel.tsx:727` sends `items: manualItems` (the raw `BasketItem[]`), and `dashboard/action/route.ts` inserts `items` unchanged. `manualItems` entries are built at `AddOrderPanel.tsx:561`:

```js
{ name: item.name, quantity: 1, unit_price: unitPrice, modifiers: mods, specialInstructions: notes || undefined, cartKey: key }
```

**(iii) Operator edit** — `page.tsx:1288` sends `editItems`, built at `page.tsx:1253` as `order.items.map(i => ({...i, cartKey: makeCartKey(...)}))`, i.e. **the stored line plus a `cartKey`**.

**(iv) Demo seeder** — `lib/seed-demo-orders.ts:288-295`:

```js
const unit_price = src.price + modifiers.reduce((a, m) => a + m.price, 0)
return { name: src.name, quantity, unit_price, ...(modifiers.length ? { modifiers } : {}) }
```

### (a) Base price and modifier prices — separate, or one composed `unit_price`?

**Both, and the repo convention is CONFIRMED, not corrected.**

`unit_price` **is** composed — base + every modifier surcharge folded in. That is stated in three places and holds on all four paths: `app/trucks/[slug]/order/page.tsx:1127`, `AddOrderPanel.tsx:556-561`, and the 🔴 comment at `lib/seed-demo-orders.ts:290-292` ("*unit_price INCLUDES the modifiers. That's the convention every real path stores*").

**But the per-modifier prices are ALSO stored, individually**, inside `modifiers[]`. The element type is `{ name: string; price: number; allergens?: string[]; dietary?: string[] }` (`app/trucks/[slug]/order/page.tsx:72`; the seeder's is the narrower `{name, price}`, `seed-demo-orders.ts:101`).

So the stored row carries **more** than a composed total: `base = unit_price − Σ modifiers[].price` is recoverable. That matters — it is what makes the stricter variant in §3 available, should you want it.

### (b) What identifies a line — and is there a stable key?

**Only names. There is no dependable stored key.**

`cartKey` is present on some rows and absent on others:

| Path | `cartKey` stored? |
|---|---|
| Customer submit | **No** — the payload maps explicit fields and omits it |
| Operator manual add | **Yes** — `manualItems` are sent raw |
| Operator edit | **Yes** — added at `page.tsx:1253` |
| Demo seeder | **No** |

So a freshly customer-placed order has no `cartKey`; the same order after one operator edit does. **Not a usable key**, and I do not read it.

The composition itself is sound and is triplicated **byte-identically** in three files (`app/dashboard/[token]/page.tsx:81`, `app/trucks/[slug]/order/page.tsx:126`, `components/dashboard/AddOrderPanel.tsx:47`):

```ts
function makeCartKey(itemName: string, mods: { name: string }[], notes?: string): string {
  const parts: string[] = []
  const modStr = [...mods].map(m => m.name).sort().join('|')
  if (modStr) parts.push(modStr)
  const noteStr = (notes || '').trim()
  if (noteStr) parts.push(`note:${noteStr}`)
  return parts.length > 0 ? `${itemName}::${parts.join('::')}` : itemName
}
```

Note it keys on modifier **names**, not prices, and it **includes the free-text note**. I recompute identity server-side rather than trusting the stored key — see §2.

### (c) Deals and their slotModifiers

Stored deal shape, identical on all paths that write one — `{ name, slots, slotModifiers, slotNotes, price }`, typed at `components/dashboard/types.ts:41`:

```ts
deals: { name: string; price?: number; slots: Record<string, string>;
         slotModifiers?: Record<string, { name: string; price: number }[]>;
         slotNotes?: Record<string, string> }[] | null
```

Two facts that drive the implementation:

- **`price` is the bundle price ALONE**, not the effective cost. Both writers set `price: d.bundle.bundle_price` (`order/page.tsx:1133`, `AddOrderPanel.tsx:733`). The slot-modifier surcharges are **not** folded in — they live separately in `slotModifiers[slotKey][].price`. Effective deal cost = `price + Σ slotModifiers prices`, which is exactly the `bundle_price + modifierExtra` shape `calculateOrderTotal:88-90` already expects.
- **A deal has no identity beyond its name.** No key, no id — just `name` plus its slot selections. `slots` is a *selection*, not a price attribute.

### Verdict

**The stored shape fully supports the specified rule. No approximation, no stop needed.** Every price component that needs locking is individually recoverable from the row: item `unit_price`, each `modifiers[].price`, each deal `price`, each `slotModifiers[][].price`.

The one thing genuinely absent is `bundles_db.original_price`, which is never stored on the order. It feeds only the `dealSavings` **display** figure and never the charge, so it is still read live — noted in the code at `lib/order-repricing.ts:311-313`.

---

## 2 · The line-identity rule implemented

```ts
// lib/order-repricing.ts:147
export function lineIdentity(name, modifiers) {
  const mods = (modifiers || []).map(m => String(m?.name ?? '')).filter(Boolean).sort().join('|')
  return mods ? `${name}::${mods}` : name
}
```

**Item name + its modifier NAME set, order-independent.** Exactly what you specified.

Two deliberate departures from `makeCartKey`, both documented in the module header:

1. **The free-text note is NOT part of price identity.** `makeCartKey` includes it because two notes make two basket lines. But a note has no effect on price, and folding it in would mean *editing a customer's allergy note silently re-priced their line off the live menu*. That is precisely the outcome price-lock exists to prevent.
2. **The stored `cartKey` is ignored**, for the reason in §1(b) — it is absent on customer-placed and demo orders. Recomputing identity from name + modifier names works on every order regardless of provenance.

**Matching is consuming.** Stored lines are indexed into queues keyed by identity (`indexStoredItems`, `:220`), and each submitted line `shift()`s one off (`takeMatch`, `:275`). Two stored lines that happen to share an identity are matched pairwise rather than both resolving to the same one; a third submitted copy falls through to the current menu. Verified — harness case K.

A stored line with a non-finite `unit_price` (legacy/malformed) is **skipped** during indexing, so it falls through to the menu rather than locking in a `NaN`.

**Deals** are matched by **bundle name** only, also consuming (`indexStoredDeals`, `:236`). A slot selection change does not re-price the bundle — the bundle price is per bundle, not per slot. Slot modifiers lock individually, keyed `${slotKey}::${modifierName}`.

### The resulting price ladder

| Situation | Price source |
|---|---|
| Line identity found on the stored order | **stored `unit_price`** — locked; quantity may change freely |
| Deal name found on the stored order | **stored `price`** — locked |
| Slot modifier found on that stored deal | **stored surcharge** — locked |
| New line / changed modifier set | current menu: `menu_items_db.price + Σ modifier_options.price_adjustment` |
| New deal | current `bundles_db.bundle_price` |
| New slot modifier on an existing deal | current `modifier_options.price_adjustment` |
| New and not on the menu either | client advisory price → **flagged, operator must confirm** |

Quantity remains client-supplied and clamped `≥ 0`, unchanged.

---

## 3 · The ambiguous case: existing item, modifier added or removed

**Rule applied: identity changed → the whole line is priced from the CURRENT menu.** That is the rule you specified, and I implemented it as specified. Verified — harness cases E and F.

### The reasoning

Identity is name + modifier set, so adding or removing a modifier produces an identity that is not on the stored order. There is nothing to look up, so the line is new as far as the lock is concerned and takes today's menu price throughout: today's base **and** today's surcharges.

Why that is defensible:

- **It is one rule, not two.** "Changed line → current menu" needs no special case for *which* part changed. Splitting it would mean the base locks but the surcharge floats, and the row would then hold a `unit_price` that is a blend of two different price epochs — impossible to explain to an operator and impossible to audit later against a ledger.
- **The operator is present and looking at it.** A modifier change is an interactive act at the hatch, in the modal, mid-service. The modal recomputes the line at the live menu price (`page.tsx:1262`, `addEditItem` → `item.price + mods`), so the operator **sees the new figure before saving**. Client and server land on the same number by construction, which is exactly why the delta prompt is no longer needed (§4).
- **It fails in the safe direction commercially.** If the menu has risen, a modifier change charges the higher price. The customer is standing there being asked to change their order; that is a conversation, not a silent re-charge.

### Where it is weakest — and the alternative, which your data supports

If the base price has risen since placement, adding a 50p modifier to a line re-prices the **whole** line at the new base. A £9.50 Margherita becomes £11.00 + £2.00, not the locked £9.50 + £2.00. A customer who asks for extra cheese pays a base increase they never agreed to.

The stricter variant — **keep the locked base, price only the delta modifiers** — is genuinely implementable here, because §1(a) established that per-modifier prices are stored individually:

```
lockedBase   = stored.unit_price − Σ stored.modifiers[].price
newUnitPrice = lockedBase + Σ (locked surcharge if the modifier was already there, else menu price)
```

It would need the client modal to compute the same thing (or a delta prompt reinstated) so the preview does not lie. I did **not** build it: you specified the simpler rule, and it is the more honest one to explain to an operator ("changing a line re-prices it at today's menu"). Say the word and it is a contained change to one branch of `repriceOrder`.

---

## 4 · What was deleted from the 409 machinery, and what survived

### Deleted

| Thing | Why it no longer serves anything |
|---|---|
| `clientTotal` round-trip | Nothing to compare against. Existing prices cannot move; new lines are priced off the same live menu the modal is showing. Client and server agree by construction, so a baseline is dead weight. |
| `changes[]` (the `PriceChange` type, its build in `repriceOrder`, the `EPSILON` comparison, the per-line list in the banner) | There is no menu-drift delta to enumerate. Removed from the module entirely. |
| `oldTotal` / `newTotal` and the "Shown here £X / Menu price £Y" comparison | Same. The banner no longer compares anything. |
| `repriced: true` | Renamed to `needsPriceConfirm: true` — it no longer means "we re-priced", it means "one line has no price we can vouch for". |
| `confirmRepricedTotal` | Renamed `confirmUnresolvedTotal`. |

### Survived, and why

- **The 409 itself**, narrowed to a genuinely unpriceable **new** item / modifier / bundle — as you specified. Nothing is written on that branch. Rare by construction: the modal only offers names on the live menu, so it needs the menu to have changed under the operator (or a crafted request).
- **The confirm echo** (`confirmUnresolvedTotal`). You asked me to say why anything kept is still needed. It still is: the operator is being asked to accept an *unverified* price, so the acknowledgement should name the exact figure they were shown. The server saves only if that figure still matches its fresh total; otherwise it re-prompts. A bare boolean would let a stale confirm commit a total nobody looked at.
- **Staleness invalidation, re-implemented.** It used to ride on `oldTotal`; with that gone it is now an explicit basket fingerprint (`editBasketSignature`, `page.tsx:85`), captured with the verdict and compared during render (`page.tsx:1779`). Needed: without it the banner keeps naming a line the operator has since deleted, and offers "Save at £X" for a total that no longer applies. It is a pure derivation — no effect, no extra state to keep in sync.

**A deleted discount code rides in the same prompt.** This is a judgement call and a slight stretch of "new line only": it is not a line at all. But it is the same class of problem — a name we cannot price, where the fallback is a guess — and unlike a menu price it is deliberately **not** locked (a code must rescale to the edited basket, which you asked to keep). Silently applying a guessed discount is worse than asking. Flagging it here so you can overrule; it is one item in one array (`route.ts:428`).

---

## 5 · Confirming the unknown-name fallback is unreachable for existing lines

**Confirmed, structurally and by test.**

The fallback ladder for an existing line terminates at step one: `takeMatch` returns the stored price, and the `else` branch that consults `priceBook.itemPrice` — the only place `unresolved` can be pushed for an item — is never entered. There is no path from a locked line to the price book at all.

So a menu item being renamed or deleted **cannot** make an already-placed line unresolvable. Only something this edit *adds* can be.

Harness case **J** tests exactly this: an order whose item has since vanished from the menu entirely still prices at its locked £11.00 with `unresolved: []`.

The fallback behaviour you approved stands unchanged for new lines: advisory price, flagged, never zero, never fails the edit.

---

## 6 · Files and lines changed *in this correction*

Everything listed under "WHAT STANDS UNCHANGED" was left alone. `app/api/orders/submit/route.ts` was not touched.

| File | Lines | Change |
|---|---|---|
| `lib/order-repricing.ts` | rewritten, 425 lines | Price-lock. New `StoredOrder` input, `lineIdentity` (`:147`), `indexStoredItems` (`:220`), `indexStoredDeals` (`:236`), `takeMatch` (`:275`). `PriceChange` / `changes[]` / `EPSILON` deleted. `loadPriceBook` unchanged but demoted to fallback. `calculateOrderTotal` delegation and `toMinor` untouched. |
| `app/api/dashboard/action/route.ts` | `360-366` | `clientTotal` dropped; `confirmRepricedTotal` → `confirmUnresolvedTotal`. |
| " | `370-384` | Header comment rewritten to state price-lock. |
| " | `412-418` | `repriceOrder` now receives `{ items: order.items, deals: order.deals }` — the stored row. |
| " | `430-458` | 409 narrowed to unpriceable new lines; response is `needsPriceConfirm` + `unresolved` + totals. |
| " | `460-468`, `486-489` | Comments corrected to describe locked-vs-current pricing. |
| `app/dashboard/[token]/page.tsx` | `85-91` | New `editBasketSignature` helper. |
| " | `376-380` | `editReprice` state reshaped to `{total, unresolved, signature}`. |
| " | `386` | `editOrderBaseline.deals` now carries `lockedValue`. |
| " | `1266-1269` | `startEdit` computes `lockedValue` = stored bundle price + stored slot-modifier surcharges. |
| " | `1295-1302` | `submitEdit` drops `clientTotal`, sends `confirmUnresolvedTotal`, handles `needsPriceConfirm`. |
| " | `1767-1772` | Removed-deal subtraction uses `lockedValue`, not the current menu price (see below). |
| " | `1779` | `editRepriceActive` — pure signature comparison. |
| " | `3378-3400` | Banner rewritten: no comparison, no `changes[]`; lists unpriceable lines + the resulting total. |

### One extra change, and why it is not scope creep

`page.tsx:1767-1772` — removing a deal in the modal used to subtract `truckMenu.bundles.find(...).bundle_price`, i.e. **today's** price, and silently dropped that deal's slot-modifier surcharges.

With the delta prompt gone, the modal's own preview is the **only** figure the operator sees before saving, so it has to match what the server will write. Under price-lock the server subtracts the *stored* contribution, so the preview must too. This is a direct consequence of removing the 409 comparison you asked me to remove — not unrelated work. It also fixes a pre-existing under-subtraction for deals carrying slot modifiers.

Everything else in the modal preview already agrees with price-lock without changes: existing lines keep their stored `unit_price` in `editItems` (`page.tsx:1253` copies the row), and lines added or modified during the edit are priced from the live menu (`addEditItem`, `page.tsx:1262`) — the same two rules the server applies.

---

## 7 · What I verified by reading vs. by running

### Ran

- **`npx tsc --noEmit` → clean.** Necessary, not sufficient — the NaN hole found earlier on the customer path is the standing proof: it typechecks and does nothing.
- **`npx eslint`** on every touched file. `lib/order-repricing.ts` is clean. All other reports are pre-existing violations at lines I did not touch (`no-explicit-any`, `react/no-unescaped-entities`, `Cannot access refs during render`, `set-state-in-effect`); I checked each flagged line number against the diff. My new `editRepriceActive` line is clean.
- **Grep for stale references** to the deleted machinery (`clientTotal`, `confirmRepricedTotal`, `PriceChange`, `data?.repriced`, `.changes`) across `app/`, `lib/`, `components/` — none remain.
- **15-case behavioural harness.** Transpiled `order-calculations.ts` + `order-repricing.ts` to CommonJS and ran them against a price book where the menu has **risen** since placement (Margherita 9.50→11.00, Extra Cheese 1.50→2.00, Family Feast 25.00→30.00). All passed:

| # | Case | Result |
|---|---|---|
| A | Unchanged edit, menu has risen | units stay `[11.00, 2.00]`, deal stays `25.00`, total `50.50` — **nothing moved** ✓ |
| B | Quantity 2 → 5 on a locked line | unit stays `11.00` (not `13.00`), total `55.00` ✓ |
| C | Body says `unit_price: 0.01` on a locked line | priced `2.00` (stored) — not `0.01`, not `2.20` ✓ |
| D | New line added | `4.50` — current menu ✓ |
| E | Modifier **added** to an existing line | `11.00 + 2.00 + 2.50 = 15.50` — current menu, identity changed ✓ |
| F | Modifier **removed** from an existing line | `11.00` — current menu base ✓ |
| G | New slot modifier on an existing deal | bundle locked `25.00`, old surcharge locked `1.50`, new one at menu `2.50` → `29.00` ✓ |
| H | Newly added deal | `30.00` — current `bundles_db` ✓ |
| I | New line, name not on the menu | advisory `7.00` kept, `unresolved[item]` raised ✓ |
| J | **Stored item's name has left the menu entirely** | locked `11.00`, `unresolved: []` — §5 confirmed ✓ |
| K | Two stored lines share one identity, three submitted | `[2.00, 3.00, 2.20]` — pairwise, third falls to menu ✓ |
| L | 10% code on the edited basket | subtotal `22.00`, discount `2.20`, total `19.80` — still rescales ✓ |
| M | `quantity: -3` | clamped to 0 ✓ |
| N | Modifier order `[B,A]` vs `[A,B]` | same identity ✓ |
| O | `lineIdentity` on a noted line | note excluded ✓ |

### Read only — NOT verified by running

1. **The migration is still unapplied**, by instruction. `20260728_orders_total_minor_deal_savings.sql` is unchanged by this correction and remains **deploy-coupled — run it before deploying**, or the operator manual-add and edit paths get `PGRST204` on `total_minor` / `deal_savings`. The `place_order_atomic` body change still fails **silently** if skipped (`total_minor` stays NULL on customer orders, nothing logged). Its verification queries are in the file header.
2. **`place_order_atomic`'s live body** — read from `20260715_place_order_atomic_drop_drawlist.sql`, not from production. Dump and diff before applying, per that file's own warning.
3. **`discount_codes_db` column names** (`type`, `value`) and **`bundles_db.original_price`** — inferred from `submit/route.ts:481` and `:488-495`. I never saw either table's DDL; there is no migration for them in `supabase/migrations/`.
4. **The 409 round-trip end to end.** Server branch and client handler were written to match and both typecheck, but no request has been made and **the banner has never been rendered** — no `next dev`, per instruction. Its layout (long names, several unpriceable lines) is unverified.
5. **`editBasketSignature` staleness behaviour in a real browser.** Pure function, reasoned; not exercised in a running React tree.
6. **The `lockedValue` preview fix.** Arithmetic reasoned from the stored shape; not run against a real order with deals.
7. **How the rule behaves on real production rows.** I ran no DB queries. Specifically unverified: whether any live `orders.items[]` carries a non-finite `unit_price` (which the indexer skips → that line would fall through to the current menu). Read-only check:
   ```sql
   select o.id, i->>'name', i->>'unit_price'
   from orders o, jsonb_array_elements(o.items) i
   where (i->>'unit_price') is null
      or (i->>'unit_price') !~ '^-?[0-9]+(\.[0-9]+)?$';
   ```
8. **Duplicate-identity frequency.** The pairwise-consume path (case K) is correct by test but I do not know whether any real order actually contains two lines with the same name + modifier set — the three `makeCartKey` helpers dedupe on add, so it should be structurally impossible from any UI.
9. **Offline outbox transitional edge**, unchanged from before: a walk-up queued offline by a pre-deploy client and replayed post-deploy still sends `discountAmt: dealSavings`, landing with the old §4b semantics. Self-clearing, deploy-boundary only.
10. **RLS.** All paths here are service-role. I did not inspect the two row-level policies on `orders` and did not change them.

---

## 8 · Explicitly untouched, as instructed

`total_minor` · `deal_savings` · the migration (not applied) · pence-first-then-pounds on the edit path · `discount_amt` recomputed and written · percentage codes rescaling · the no-`is_active`-filter decision · `.update()` error checking and the added `.eq('truck_id', …)` · `lib/slot-bookings.ts` returning write errors · `slotWarning` never rolling back · `status: 'modified'` · the booking lock · stock guards.

**`app/api/orders/submit/route.ts` was not opened for editing.** The NaN validation hole is acknowledged as a separate task and left alone.
