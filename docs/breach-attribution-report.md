# The breach banner now names the orders that FEED the window

**Files changed — TWO:** `lib/capacity-breach.ts` and `components/dashboard/CapacityBreachBanner.tsx`.
**Also written:** `docs/breach-attribution-report.md` (this file).
🔴 **THE DETECTION RULE, THE CEILINGS, `projectBackwardOccupancy`'S ARITHMETIC, THE STRIP MARKER AND THE
DISMISSAL WORK ARE ALL UNTOUCHED. Nothing under `app/api` was changed.** No SQL, no migration.
**Nothing committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or `restore`.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# STAGE 1

## Q1 — THE SLOT LOOP, BEFORE

```ts
  for (const s of times) {
    const slotMins = parseMins(s.collection_time)
    const w = back.pileByStart.get(slotMins) ?? back.byStart.get(slotMins - step) ?? null
```
```ts
  for (const o of orders || []) {
    if (!o || !o.slot || !o.order_key || !OCCUPYING_STATUSES.has(o.status)) continue
    const arr = ordersBySlot.get(o.slot) ?? []
    arr.push({ order_key: o.order_key, id: o.id })
```
```ts
    const grp = ordersBySlot.get(s.collection_time) ?? []
      order_keys: grp.map(o => o.order_key),
```
🔴 **`order_keys` was "orders COLLECTING at this slot" — never "orders cooking in this window".**

## Q2 — 🔴 PROVENANCE IS LOST PER ORDER AND KEPT PER SLOT — SO THIS IS A SMALL CHANGE

`productionSlotUnits` is `Record<slot, QtyByCat>`: the projection aggregates by **collection slot and
category** before any window exists, so **no engine output can say which ORDER contributed a unit.**
✅ **But the inverse at SLOT level already exists and is already shared:**
```ts
export function contributingProductionSlots(
  productionSlotUnits: Record<string, QtyByCat>, catConfigs: Record<string, CatConfig>,
  fromMins: number, toMins: number, capacityWindowMins: number = 5,
): string[] {
```
**The Add-order modal already calls it for exactly this question at a different moment. So: no
projection change, no new arithmetic — the detector maps window → feeding SLOTS → the orders it already
grouped by slot.**

## Q3 — WHAT IDENTIFIES A CONTRIBUTOR
**An order key and its own collection slot.** 🔴 **The quantity attributable to THIS window is NOT
separable** — the aggregation happened before the window did. **So the figure shown is the order's
total, as the previous report already flagged.**

## Q4 — AN ORDER FEEDING SEVERAL WINDOWS
**It appears once per breached window, each time with its TOTAL, not a share.** ⚠️ **Stated in the copy's
shape rather than implied: each contributor prints its own collection time, so the operator sees the
same order under two windows and can tell it is one order, not two.**

## Q5 — THE SHAPE THE NEW ATTRIBUTION FEEDS
Unchanged: `order_keys` / `order_ids`, consumed by the same `contributors` map. **No new vocabulary.**

---

# STAGE 2 — THE FIX

```ts
    const isPile = back.pileByStart.get(slotMins) != null
    const fromMins = isPile ? slotMins : slotMins - step
    const feeders = contributingProductionSlots(
      productionSlotUnits || {}, catConfigs || {}, fromMins, fromMins + step,
      Math.max(1, Math.round(capacityWindowMins ?? 5)),
    )
    const seenKeys = new Set<string>()
    const grp: Array<{ order_key: string; id: number }> = []
    for (const feedSlot of [s.collection_time, ...feeders]) {
      for (const o of ordersBySlot.get(feedSlot) ?? []) {
        if (seenKeys.has(o.order_key)) continue
        seenKeys.add(o.order_key)
        grp.push(o)
      }
    }
```
**De-duplicated by `order_key`, and the breached slot itself is included first so an order that does
collect there is named first.**

## The copy

```tsx
                  {total > 0
                    ? `${b.collection_time} kitchen over capacity — ${total} ${unitWord(b)} cooking`
                    : `${b.collection_time} over capacity — no orders found to attribute it to`}
```
```tsx
                    {contributors.map(c => `#${c.id}${c.slot ? ` (${c.slot})` : ''}${c.qty > 0 ? ` — ${c.qty}` : ''}`).join('  ·  ')}
```

🔴 **THE HEADLINE NO LONGER IMPLIES ANYTHING COLLECTS AT THAT TIME.** *"16:50 kitchen over capacity — 10
items cooking"* says the KITCHEN is over at 16:50; the contributors say who and when:
**`#4 (16:30) — 5 · #N19 (17:00) — 5`.** **Same vocabulary as the shipped copy — slot, quantity, order
numbers — with each order's own collection time added, which is the fact that was missing.**

## 🔴 THE `total === 0` ARM

**It is now unreachable for a breach the detector can attribute, and when it IS reached it says so:**
*"no orders found to attribute it to"*. ⚠️ **THE CASES THAT STILL REACH IT, NAMED:** an order feeding
the window that is outside the dashboard's fetched order list; a window whose load comes from a
production slot with no OCCUPYING order behind it (its orders have advanced to `ready`/`collected`,
which the detector's own `OCCUPYING_STATUSES` excludes); and a caller that passes no `orders` prop.
🔴 **All three are "the detector found load it cannot attribute", which is exactly what the new sentence
says — and that is worth seeing, not hiding.**

## ✅ THE SIGNATURE IS UNCHANGED

```ts
    .map(b => `${b.collection_time}:${b.over_total}:${b.over_cats.map(c => `${c.cat}${c.over}`).join(',')}`)
```
**It hashes the slot, the overage and the categories — never the order list.** 🔴 **So a dismissal made
before this deploy still matches after it: this change cannot re-fire a dismissed banner.**

## Output shape

✅ **UNCHANGED — same `CapacityBreach` fields, same types.** Only the CONTENTS of `order_keys`/`order_ids`
differ. ✅ **EXECUTED: the only consumers are `/api/dashboard` (which passes the array through) and the
banner (updated here); the strip marker reads `collection_time` alone and is untouched.**

---

# ⚠️ PIZZERIA GUSTO — `kitchen_capacity = 2`

**Before:** `⚠ 2 slots over capacity — review / 16:50 over capacity / 16:55 over capacity` — two times
with nothing booked at them.
**After:** `16:50 kitchen over capacity — 10 items cooking   #4 (16:30) — 5 · #N19 (17:00) — 5`, and the
same for 16:55. 🔴 **The times stop looking wrong, because the orders behind them are now named with
their own collection times.**

---

# VERIFICATION — 🔴 TSC-CLEAN IS NOT VERIFICATION

**`npx tsc --noEmit` exits 0. `npx eslint` on both files: 0 problems.**

| Claim | Method |
|---|---|
| A window fed by orders at other slots names those orders | ✅ **SOURCE READ** — the union over `contributingProductionSlots`. 🔴 **Not rendered; no live breach observed** |
| The `total === 0` arm | ⚠️ **REACHABLE IN THREE NAMED CASES**, and it now states them rather than looking like a normal breach |
| The signature is unchanged | ✅ **EXECUTED** — `breachSignature` is not in the diff and hashes no order data |
| The strip marker is unaffected | ✅ **EXECUTED** — it reads `collection_time` only; not in the diff |
| Every consumer compiles and reads correctly | ✅ **EXECUTED** — `tsc` clean; grep finds two consumers, both accounted for |

🔴 **NOT PROVED: anything rendered, and the per-order quantity is still the order's TOTAL, not its share
of the window — that cannot be fixed without changing the projection.**

---

# INTEGRITY

```
lib/capacity-breach.ts                          6,194 → 8,241 bytes · classes 5 → 5
components/dashboard/CapacityBreachBanner.tsx   4,886 → 5,616 bytes · classes 4 → 4
BOTH: NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0 · added vs HEAD: NONE
```

## This report — a SEPARATE pass, run AFTER writing

```
docs/breach-attribution-report.md   bytes 8,983
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. Code points only, so the table cannot alter its own counts.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 16 | 0 | 16 |
| U+26A0 (warning sign) | 5 | 4 | 1 |
| U+2705 (check mark button) | 10 | 0 | 10 |

U+26A0 is the only TEXT-presentation base and every occurrence is PAIRED with U+FE0F.

## Working tree

```
 M app/dashboard/[token]/page.tsx
 M components/dashboard/CapacityBreachBanner.tsx
 M docs/reference-manual.md
 M lib/capacity-breach.ts
 M lib/copy/offlineProtection.ts
?? docs/breach-attribution-report.md
?? docs/breach-dismiss-report.md
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `M lib/capacity-breach.ts`, `M components/dashboard/CapacityBreachBanner.tsx` | 🔴 **THIS TASK — both clean at HEAD before it** |
| 🔴 `?? docs/breach-attribution-report.md` | 🔴 **THIS TASK** — this file |
| `M app/dashboard/[token]/page.tsx`, `M lib/copy/offlineProtection.ts` | ✅ pre-existing — the dismissal fix and the copy renames |
| everything else | ✅ pre-existing |

No `git stash`, `git checkout` or `git restore` was run at any point.
