# The over-capacity warning — it exists, it was built and tested, and the offline order never reaches it

🔴 **NOTHING WAS EDITED EXCEPT THIS FILE.** No commit, stage, revert, stash or clean; no `git stash`,
`checkout` or `restore` — `status`, `log`, `show`, `diff` and file reads only. No build, no deploy, no
SQL, no schema change.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

**Every claim is marked READ (quoted) or INFERRED.** 🔴 **The customer submit path and the offline
replay path are reported separately throughout.**

# 🔴 THE RECONCILIATION, IN ONE LINE — AND IT IS THE ONE YOU PREDICTED

**The operator is right and the previous report was incomplete.** There IS an over-capacity warning, it
is a real custom modal on the operator's Add-order path with a "Place it anyway" button and a persisted
acknowledgement — **and its trigger is gated on `isOnline()`.**

```tsx
    if (!skipFitCheck && effectiveSlot && manualEvent && isOnline()) {
```

🔴 **READ. AN ORDER PLACED OFFLINE SKIPS THE CHECK ENTIRELY — the branch is never entered, no
`/api/slots` read happens, no modal renders, and `capacityAck` stays false.** **A mechanism on a path the
offline order never touches satisfies both accounts exactly.**

---

# Q1 — EVERY MECHANISM IN THE REPO

## 1. 🔴 THE OVER-CAPACITY CONFIRM MODAL — `components/dashboard/AddOrderPanel.tsx` (THE ONE THE OPERATOR REMEMBERS)

```tsx
    // ── Confirm-time LIVE capacity check (advisory — never blocks) ───────────────
    // FRESH /api/slots read (no-store) → run the SAME backward-fit engine the customer
    // page uses (projectBackwardOccupancy + fitOrderBackward, mirroring its `unfittableSlots`
    // memo) against the CHOSEN slot for THIS exact basket. The manual path books-as-chosen by
    // design, so this is purely advisory: if the basket doesn't fit, warn so the operator can
    // override (book anyway, maybe moving another customer) or cancel and re-pick.
    if (!skipFitCheck && effectiveSlot && manualEvent && isOnline()) {
```

**What it renders — READ:** a custom modal (`capacityConfirm`) with three variants (`'over'`,
`'filled'`, `'toosoon'`), a contributor list of the orders already cooking in that window **by
collection slot with their quantities**, this order's own quantity, and two buttons:

```tsx
                >Pick another time</button>
                    void submitManual(ov, true, true)
                >Place it anyway</button>
```

**And the decision is persisted — READ:**

```ts
        capacityAcknowledged: capacityAck,
```
```ts
          capacity_ack_at: manualOrder?.capacityAcknowledged === true ? new Date().toISOString() : null,
```

⚠️ **THIS IS THE COLUMN THE PREVIOUS REPORT FOUND NULL ON ALL SEVEN ROWS.** Its NULL is now explained:
**the modal that writes it cannot fire offline.**

## 2. `lib/capacity-breach.ts` + `components/dashboard/CapacityBreachBanner.tsx` — the RECONNECT flag

```
// PIECE 2 — reconnect "capacity exceeded" detection (DETECTION + WARNING ONLY).
// After offline orders sync and `rebuildProductionSlotUsage` has run … flags collection slots whose
// cooking window is GENUINELY OVER a ceiling.
```
```
//   STRICTLY OVER, not tone==='red'. A window is breached when it is over EITHER ceiling:
//     • remainingTotal   < -EPS  (concurrency total > kitchen_capacity), OR
//     • remainingByCat[c] < -EPS  (a category over its batch …)
//   tone==='red' also fires on legitimately-FULL slots (>= ceiling), which would cry wolf on normal
//   busy nights — so we DELIBERATELY do not use it.
```
```tsx
  if (!breaches || breaches.length === 0) return null
  if (sig === dismissedSig) return null
```

🔴 **READ — THIS ONE IS BUILT FOR EXACTLY YOUR SCENARIO ("after offline orders sync") AND IT IS ON THE
DASHBOARD.** ⚠️ **But its condition is STRICTLY OVER A CEILING, and it says in its own comment that it
deliberately does NOT fire on a merely-full slot. Two orders sharing 17:00 is not, by itself, a breach.**

## 3. `placeOrderInSlotLocked` / `lib/orders/place-in-slot.ts` — the CUSTOMER-path claim (§Q4)

## 4. The slot dots / traffic light — `lib/slot-display.ts`, `lib/slot-availability.ts`

**Display of fullness for NEW placements. READ: they describe a slot's remaining capacity; they do not
examine rows already booked.**

## 5. `lib/stock-guard.ts` — stock, not capacity. **Not a slot mechanism.**

## 🔴 AND WHAT `docs/` GAVE UP — THE FASTEST ROUTE, EXACTLY AS YOU SAID

**`docs/capacity-modal-review.md`, 28 July 2026, opens with:**

```
# Over-capacity confirm modal — READ-ONLY readiness review
**You are not misremembering.** A richer slot-select confirmation modal existed, was a real custom
component (not `window.confirm`), and was deliberat…
```

🔴 **THE OPERATOR HAS BEEN RIGHT ABOUT THIS FEATURE BEFORE, AND THAT REVIEW SAYS SO IN THOSE WORDS.**
⚠️ **That review describes the trigger as a native `window.confirm()` at submit time; the code TODAY is
the custom modal with contributors and "Place it anyway". So the feature was rebuilt richer AFTER 28
July — it was not lost.** (READ: the doc and the current source disagree, and the current source is the
newer.)

---

# Q2 — PER MECHANISM: SURFACE, TRIGGER, AND WHETHER A REPLAYED ORDER REACHES IT

| Mechanism | Surface | Trigger | 🔴 **Reachable by an offline-replayed order?** |
|---|---|---|---|
| **1. Over-capacity confirm modal** | **dashboard → Add order** | pressing Confirm with a chosen slot, **`isOnline()` true** | 🔴 **NO — `isOnline()` is in the condition.** The order is queued without ever consulting capacity |
| **2. CapacityBreachBanner** | **dashboard, top of screen** | `/api/dashboard` returns `capacityBreaches` after a sync + `rebuildProductionSlotUsage` | ⚠️ **YES IN PRINCIPLE — this is the one path built for late arrivals — BUT ONLY IF THE WINDOW IS STRICTLY OVER A CEILING** |
| **3. `placeOrderInSlotLocked`** | customer order page | `/api/orders/submit` | 🔴 **NO — the replay route is `action:'manual'`, which "bypasses … ALL capacity gating"** |
| **4. Slot dots / traffic light** | dashboard, Add order, customer page | rendering available slots | ❌ **not a detector of existing rows** |
| **5. KDS** | — | — | 🔴 **NOTHING. `CapacityBreachBanner` is not mounted on the KDS, and it has no capacity concept at all** |

🔴 **SAID PLAINLY, AS ASKED: THE MECHANISM EXISTS AND THE REPLAY PATH BYPASSES IT. That reconciles both
accounts, and it is the answer.**

---

# Q3 — THE CEILING, AND WHETHER IT WOULD HAVE FIRED HERE

**What computes occupancy — READ:** `projectBackwardOccupancy` (`lib/slot-availability.ts`) over
`production_slot_usage`, rebuilt from orders by `buildUnitsFromOrders`. The unit is **ITEM QUANTITY per
category, converted to batches** —

```ts
export function qtyToBatches(qty: number, batchSize: number): number {
  if (qty <= 0) return 0
  return Math.ceil(qty / batch)
}
```

**not orders, and not prep minutes directly** — prep time decides which cooking WINDOW an item lands in,
and `capacityWindowMins` (default 5) is the window width. **Two ceilings:** `kitchenCapacity` (a
concurrency total for the window) and each category's batch size.

**What the operator sees as it fills — READ:** the slot dots/strip move through their tones, and
`tone==='red'` means **at or over** — which is why the breach detector deliberately ignores tone and
reads `remainingTotal < -EPS`.

## 🔴 WOULD TWO 5-MAIN ORDERS AT 17:00 EXCEED IT FOR TEST KITCHEN?

🔴 **I CANNOT SAY, AND I WILL NOT GUESS — IT DEPENDS ON THREE VALUES I AM FORBIDDEN TO READ:**
`truck_vans.kitchen_capacity` for that van, `capacity_window_mins`, and the per-category batch sizes in
`catConfigs`. **All three live in the database.**

**What I can state — INFERRED, and it is the important half:** **the two orders do not have to be in the
same 5-minute window to share a 17:00 collection slot, and they do not have to breach anything to share
it.** ⚠️ **If `kitchen_capacity` is ≥ the combined item count in that window, the banner is CORRECTLY
silent — the kitchen is not over capacity. Two customers holding the same collection time is a
DIFFERENT fact from a window being over its ceiling, and nothing in this repo detects the former.**

---

# Q4 — THE CUSTOMER PATH'S CLAIM

```ts
    // NOTE: the old "slot full → 409" hard-block is removed for the customer path.
    // A full slot now never rejects — capacity is resolved at booking time by
```
```ts
        const claim = await placeOrderInSlotLocked(
          resolvedTruckId, eventDate, eventRow?.id ?? null, requestedSlot, orderLines, itemCatMap, catConfigs,
          eventRow?.start_time ?? null, eventRow?.end_time ?? null,
          truck.collection_interval_mins ?? 0,
          truck.slot_duration_mins ?? (truck.collection_interval_mins ?? 0),
          kitchenCapacity, capacityWindowMins,
        )
        if (claim.booked && claim.finalSlot) {
          finalSlot = claim.finalSlot
          if (requestedSlot) {
            confirmedSlot = claim.finalSlot
            slotChanged = claim.finalSlot !== requestedSlot
```

**READ. What a customer sees when their slot is full: NOT rejected — MOVED, and TOLD.** `slotChanged`
drives the "your slot was taken" amber path on the confirmation screen and the `slotAdjustedFrom` box in
the email, and `requested_slot` is persisted so the confirmation can say what they asked for.

🔴 **IS THE OPERATOR TOLD? NO — NOT AT THAT MOMENT.** ⚠️ **INFERRED: the moved order simply appears in
the queue at its new time. The only operator-facing trace is `requested_slot != slot` on the row, which
nothing surfaces on the orders screen.**

---

# Q5 — POST-SYNC RECONCILIATION

✅ **YES, ONE EXISTS, AND IT IS MECHANISM 2.** `rebuildProductionSlotUsage` re-derives
`production_slot_usage` from the orders after a drain, and `lib/capacity-breach.ts` then re-examines the
event's windows against the ceilings and returns `capacityBreaches` on `/api/dashboard`.

🔴 **BUT IT RE-EXAMINES CEILINGS, NOT SLOT SHARING**, and it is dismissible by signature
(`sig === dismissedSig`). ⚠️ **There is no step that re-runs the fit check that the offline order
skipped, and no step that asks "did anything arrive into a slot that filled while it was queued".**

---

# Q6 — THE COMMIT HISTORY

**READ, from `git log`:**

| Commit | Date | Bearing |
|---|---|---|
| 🔴 `00c09eb` **"Piece 2: reconnect capacity-exceeded flag (detection + banner, reads the engine)"** | 3 Jul 2026 | **Mechanism 2 — built for exactly this scenario. STILL PRESENT** (`lib/capacity-breach.ts`, the banner, and the `capacityBreaches` field are all live) |
| `4bd9656` "Offline-aware capacity strip (Piece 1): fold optimistic orders into the engine" | 3 Jul 2026 | the strip's offline awareness. Still present |
| `0a319a2` "Stage 2b: offline capacity release — displaySlots recomputes from overlay statuses" | 3 Jul 2026 | still present |
| `dbad192` "V7.8 … atomic order placement, pre-order label, **capacity-grid, modal**, badges …" | 24 Jun 2026 | 🔴 **the modal's own commit.** Mechanism 1 is live today in a RICHER form than `docs/capacity-modal-review.md` (28 July) describes |
| `0cb2d2a` "payments" | 12 Aug 2026 | last touch of `place-in-slot.ts` — payments work, not a capacity change |

🔴 **NOTHING WAS LOST.** Every mechanism named in the history is present in the working tree.
**INFERRED: the "built and tested" memory is mechanism 1 (and possibly 2), both of which still exist —
the gap is not a deletion, it is `isOnline()`.**

---

# Q7 — WHAT THE OPERATOR SEES TODAY FOR ORDERS 4 AND N19

**Two ordinary confirmed cards.** On the dashboard both appear in the confirmed queue reading **17:00**,
in `placed_at`/created order, with no marker, no chip and no link between them; the Schedule/slot strip
shows the 17:00 slot's remaining capacity as the engine computes it, which — unless that window is
strictly over `kitchen_capacity` or a category batch — is a normal tone with no banner, because
`CapacityBreachBanner` returns `null` when `breaches.length === 0`. **`capacity_ack_at` is NULL on both,
which reads identically to "never over capacity" and to "never checked".** **`requested_slot` is 17:00
on order 4 and NULL on N19, and nothing renders either.** **On the KDS there is even less: it mounts no
capacity mechanism at all, so both are simply tickets due at 17:00.** 🔴 **The operator's only signal
that two customers hold the same collection time is reading the two cards and noticing — INFERRED from
the absence of any renderer, and READ for every component that does exist.**

---

# Q8 — THE ONE CHEAPEST CHECK

🔴 **OPEN THE ADD-ORDER PANEL, PUT THE DEVICE INTO AIRPLANE MODE, AND CONFIRM A WALK-UP INTO A SLOT YOU
KNOW IS FULL.** (NOT PERFORMED.)

- **No modal appears** ⇒ 🔴 **"a mechanism exists but is bypassed"** — the reading this report gives,
  and the `isOnline()` gate is the proof.
- **The modal appears** ⇒ the gate is not what I read, and the question moves to why it did not fire on
  21 Aug.

⚠️ **It needs no database access, no deploy and no code**, and it distinguishes all three candidate
reconciliations in one press — **"never built" is already excluded by `dbad192` and by the modal being
in the working tree.**

---

# INTEGRITY

```
docs/oversell-warning-review-report.md   bytes 15,144
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT
and never prints the glyph, so this table cannot alter the counts it reports.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 26 | 0 | 26 |
| U+26A0 (warning sign — TEXT presentation) | 9 | 9 | 0 |
| U+2705 (check mark button) | 2 | 0 | 2 |
| U+274C (cross mark) | 1 | 0 | 1 |

U+26A0 is the only base here with TEXT presentation used as an emoji, and every occurrence is
PAIRED with U+FE0F. The rest have emoji presentation by default, so bare is correct for them.
NO SOURCE FILE WAS EDITED, so there is no before/after census to report for one.

## Working tree

```
 M app/dashboard/[token]/page.tsx
?? docs/offline-notice-gate-report.md
?? docs/offline-order-numbering-capacity-report.md
?? docs/offline-protection-popup-report.md
?? docs/oversell-warning-review-report.md
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `?? docs/oversell-warning-review-report.md` | 🔴 **THIS TASK — the only file written** |
| `M app/dashboard/[token]/page.tsx`, `?? docs/offline-notice-gate-report.md`, `?? docs/offline-protection-popup-report.md`, `?? docs/offline-order-numbering-capacity-report.md` | ✅ **pre-existing — the two tasks before this one.** 🔴 **THIS TASK EDITED NO SOURCE FILE** |

⚠️ **The tree is short because you committed mid-session (`dcb8862`, `fa72f9a`); nothing was cleaned by
me.** No `git stash`, `git checkout` or `git restore` was run at any point.
