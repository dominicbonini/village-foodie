# The breach banner — one line per collection time

**File changed — ONE:** `components/dashboard/CapacityBreachBanner.tsx`.
**Also written:** `docs/breach-grouping-report.md` (this file).
🔴 **THE DETECTOR, THE DETECTION RULE, THE CEILINGS, `projectBackwardOccupancy`, THE STRIP MARKER, THE
DISMISSAL WORK AND EVERYTHING UNDER `app/api` ARE UNTOUCHED. Only the DISPLAY grouping changed.**
No SQL, no migration. **Nothing committed, staged, reverted, stashed or cleaned.** No `git stash`,
`checkout` or `restore`.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# STAGE 1 — THE ARITHMETIC, DEFINED

## Q1 — THE OBSERVED CASE
Two breaches — `collection_time` `16:50` and `16:55` — each with its own `over_total` / `over_cats`, and
(after the attribution fix) feeder sets that both resolve to the SAME orders, collecting at 16:30 and
17:00. 🔴 **Two lines, one problem.**

## Q2 — 🔴 (c), THE ITEM COUNT OF THE GROUPED ORDERS — AND THE REASON IS THE CONSTRAINT YOU SET

| Option | Verdict |
|---|---|
| (a) SUM of overages | 🔴 **rejected — double-counts an order feeding both windows** |
| (b) MAX | 🔴 **rejected — understates two windows breaching for different reasons** |
| (c) **item count of the listed orders** | ✅ **CHOSEN. It is the ONLY figure that equals the list beneath it**, which is the constraint that decides this |

🔴 **AND IT IS NOT AN OVERAGE, SO THE COPY DOES NOT CALL IT ONE.** It reads *"11 items cooking for
17:00"* — a count of what is promised, checkable against the orders named under it. **The fact that the
kitchen is OVER is the headline's first three words; the number quantifies the promise, not the excess.**

## Q3 — GROUPED BY THE ORDER'S OWN COLLECTION TIME
✅ **Your cleaner model, and it is the one built.** It is the time the customer was promised and the
thing the operator has to renegotiate. 🔴 **An order therefore appears EXACTLY ONCE, under its own time,
however many windows it feeds** — de-duplicated by `order_key` across every breach.

## Q4 — ONE ORDER OVER ON ITS OWN
With `kitchen_capacity = 2`, a single 5-item order breaches alone and reads:
**`Kitchen over capacity — 5 items cooking for 17:00   #4 — 5 items`.** ✅ **The headline equals the one
line beneath it.** **Singulars are handled: `1 item`, not `1 items`.**

## Q5 — 🔴 THE SIGNATURE IS UNAFFECTED, AND THAT DECIDED WHERE THE GROUPING LIVES
`breachSignature` hashes the DETECTOR's `collection_time` and `over_total`. **Grouping in the banner
leaves the detector's output byte-identical, so the signature is unchanged and NO dismissal made before
this deploy re-fires.** ⚠️ **Had the grouping moved into the detector, every existing dismissal would
have fired once more. That is why it is display-side.**

---

# STAGE 2 — THE BUILD

```tsx
            const bySlot = new Map<string, Array<{ id: string | number; qty: number }>>()
            const seen = new Set<string>()
            for (const b of breaches) {
              b.order_keys.forEach((k, idx) => {
                if (seen.has(k)) return
                seen.add(k)
                const slot = slotOf(k) ?? b.collection_time
                …
```
```tsx
                        {`Kitchen over capacity — ${total} ${total === 1 ? 'item' : 'items'} cooking for ${slot}`}
                        {list.map(c => `#${c.id}${c.qty > 0 ? ` — ${c.qty} ${c.qty === 1 ? 'item' : 'items'}` : ''}`).join('  ·  ')}
```

**"COOKING" STAYS AND IS TRUE:** the kitchen is over at a cooking window; the number counts the items
**cooking for** that collection time. **The headline describes the promise; the breach is the kitchen's.**

⚠️ **`unitWord` WAS REMOVED WITH THE PER-WINDOW LINES** — after grouping, one line can span windows whose
over-categories differ, so a single category word could be wrong for part of its own list. **"items" is
true of every grouping.**

🔴 **WINDOWS WITH NO ATTRIBUTABLE ORDERS ARE STILL SURFACED, SEPARATELY:**
`16:50 over capacity — no orders found to attribute it to`. **Not hidden by the grouping.**

✅ **THE STRIP IS UNAFFECTED:** it reads `collection_time` from every breach in `capacityBreaches`, which
this change does not touch — **so it still marks every breached WINDOW, which is correct for a live
view, even though the banner now speaks in collection times.**

---

# ⚠️ PIZZERIA GUSTO — `kitchen_capacity = 2`

**Before:** `⚠ 2 slots over capacity — review / 16:50 over capacity / 16:55 over capacity` — two lines,
neither checkable.
**After:** `⚠ 2 slots over capacity — review` / **`Kitchen over capacity — 11 items cooking for 17:00`
/ `#4 — 5 items · #N19 — 6 items`.** ✅ **5 + 6 = 11 — the number is checkable against the orders shown,
which is exactly what the previous shape could not offer.**
⚠️ **The heading still counts SLOTS (windows), so it can say "2 slots" above one line. That is the
detector's own count and changing it would change the signature — stated, not silently altered.**

---

# VERIFICATION — 🔴 TSC-CLEAN IS NOT VERIFICATION

**`npx tsc --noEmit` exits 0. `npx eslint`: 0 problems** (one `no-unused-vars` was introduced by
removing the per-window copy and was cleared).

| Claim | Method |
|---|---|
| Two adjacent windows fed by the same orders produce ONE line | ✅ **SOURCE READ** — the union is keyed by the ORDER's slot, so both windows contribute the same orders to the same row. 🔴 **Not rendered** |
| The headline equals the sum of the listed orders | ✅ **EXECUTED (source)** — `total` IS `list.reduce((t, c) => t + c.qty, 0)` over the very array printed beneath it. **They cannot disagree** |
| An order appears once, not once per window | ✅ **EXECUTED (source)** — `seen` is a `Set<order_key>` across all breaches |
| A single order breaching alone renders sensibly | ✅ **SOURCE READ** — Q4, with singular/plural handled |
| The strip still marks every breached window | ✅ **EXECUTED** — the strip reads `capacityBreaches` directly and is not in this diff |
| The signature behaviour | ✅ **EXECUTED** — `breachSignature` and the detector are not in this diff; **no pre-deploy dismissal re-fires** |

🔴 **NOT PROVED: anything rendered, and the per-order figure is still the order's TOTAL item count, not
its share of the breached window — unchanged from the previous report and unfixable without changing
the projection.**

---

# INTEGRITY

```
components/dashboard/CapacityBreachBanner.tsx   4,886 (HEAD) → 7,677 bytes · classes 4 → 4
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0 · added vs HEAD: NONE
```

## This report — a SEPARATE pass, run AFTER writing

```
docs/breach-grouping-report.md   bytes 8,134
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. Code points only, so this table cannot alter its own counts.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 16 | 0 | 16 |
| U+26A0 (warning sign) | 7 | 5 | 2 |
| U+2705 (check mark button) | 13 | 0 | 13 |

U+26A0 is the only TEXT-presentation base; any bare occurrence is quoted from a source string.

## Working tree

```
 M app/dashboard/[token]/page.tsx
 M components/dashboard/CapacityBreachBanner.tsx
 M docs/reference-manual.md
 M lib/capacity-breach.ts
 M lib/copy/offlineProtection.ts
?? docs/breach-attribution-report.md
?? docs/breach-dismiss-report.md
?? docs/breach-grouping-report.md
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `M components/dashboard/CapacityBreachBanner.tsx` | ⚠️ already `M` from the attribution fix; 🔴 **THIS TASK wrote to it — the only source file written** |
| 🔴 `?? docs/breach-grouping-report.md` | 🔴 **THIS TASK** — this file |
| `M lib/capacity-breach.ts`, `M app/dashboard/[token]/page.tsx`, `M lib/copy/offlineProtection.ts` | ✅ pre-existing — the attribution, dismissal and copy tasks |
| everything else | ✅ pre-existing |

No `git stash`, `git checkout` or `git restore` was run at any point.
