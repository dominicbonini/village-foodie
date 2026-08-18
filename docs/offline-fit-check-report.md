# The fit check runs offline — against cached data, and it says so

**File changed — ONE:** `components/dashboard/AddOrderPanel.tsx`.
**Also written:** `docs/offline-fit-check-report.md` (this file).
🔴 **NOTHING UNDER `app/api` WAS TOUCHED, AND NOTHING NEEDED TO BE. `placeOrderInSlotLocked`, the
customer submit path, the slot claim, the ceilings, `rebuildProductionSlotUsage` and the outbox
mechanics are all untouched.** **Nothing committed, staged, reverted, stashed or cleaned.** No
`git stash`, `checkout` or `restore`. No build, no deploy, no SQL.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# STAGE 1

## Q1 — THE GATE, AND WHY IT WAS THERE

```tsx
    if (!skipFitCheck && effectiveSlot && manualEvent && isOnline()) {
        const checkRes = await fetch(`/api/slots/${truck.id}?${p}`, { cache: 'no-store' })
        const checkData = await checkRes.json()
        const ci = checkData.capacityInputs
        const freshCfgs = checkData.catConfigs || {}
          const back = projectBackwardOccupancy(ci.productionSlotUnits || {}, freshCfgs, ci.eventStartMins, ci.kitchenCapacity ?? null, ci.capacityWindowMins ?? 5)
          const fit = fitOrderBackward(back, readyToMins(effectiveSlot), basketByCat, freshCfgs, ci.kitchenCapacity ?? null, ci.eventStartMins, ci.capacityWindowMins ?? 5, nowClamp, (ci.productionSlotUnits || {})[effectiveSlot] || {})
```

🔴 **EXACTLY ONE INPUT NEEDS THE NETWORK: the no-store `/api/slots` read.** `projectBackwardOccupancy`
and `fitOrderBackward` are **client-side pure functions** (`lib/slot-availability.ts`), and
`basketByCat`, `effectiveSlot` and the now-clamp are all local. ✅ **So the gate was a REAL CONSTRAINT,
not an oversight — but it was a constraint on ONE input, and that input has a cached form.**

## Q2 — 🔴 YES, IT CAN RUN OFFLINE, AND THE PANEL ALREADY HAD THE DATA

```tsx
  const capacityInputs = apiCapacityInputs ?? (offlineForThisEvent ? {
    productionSlotUnits: offlineForThisEvent.productionSlotUnits,
```
```tsx
  const serverCatConfigs = Object.keys(apiCatConfigs).length ? apiCatConfigs : (offlineForThisEvent?.catConfigs ?? {})
```

✅ **THE OFFLINE FALLBACK WAS ALREADY BUILT — for the capacity STRIP.** The same `capacityInputs` /
`serverCatConfigs` the dots render from can feed the fit check, with **no new data source and no new
fetch.**

⚠️ **HOW STALE, AND WHAT IT MISSES:** as fresh as the last successful poll — seconds in a brief
dropout, arbitrarily old in a long one — and **it cannot see anything placed since: a customer's online
order, or an order placed on another device.** 🔴 **So it can MISS a breach. It cannot invent one**,
because the cached occupancy is a subset of the true occupancy.

## Q3 — THE REPLAY PATH

```ts
      // knows the queue, so the manual path bypasses auto_accept and ALL capacity gating
```

**A check COULD run there and the data would be fresh by definition** — but 🔴 **on arrival the order is
already promised, so it could only inform, and THAT IS ALREADY BUILT:** `detectCapacityBreaches` runs
server-side after a drain and `CapacityBreachBanner` names the slot, the overage and the contributing
orders. ⚠️ **Its limit is the one the previous report named: it fires only when a window is STRICTLY
OVER a ceiling, never on a merely-shared slot.**

## Q4 — THE CONTRIBUTORS, AND WHETHER THE SHAPE TRAVELS

```tsx
    contributors: Array<{ id: string; slot: string; qty: number }>
```
```tsx
                  {capacityConfirm.contributors.map(c => (
                      <span>#{c.id} · {c.slot}</span>
                      <span className="tabular-nums">{c.qty}</span>
```

✅ **The same shape already renders AFTER the fact — that is precisely what the breach banner now
shows** (`10 items booked for 17:00 — over capacity  #4 — 5 · #N19 — 5`, shipped in
`docs/breach-banner-copy-report.md`). **One vocabulary, two moments.**

## Q5 — 🔴 A NULL CEILING IS UNLIMITED, ON BOTH PATHS

```ts
        remainingTotal: kitchenCapacity == null ? Infinity : kitchenCapacity - conc,
```
```ts
    const bindRemaining = w ? (kitchenCapacity == null ? UNLIMITED : …
```
```ts
  if (kitchenCapacity == null) {
    points.push({ startMins: ws0, endMins: ws0, items: count })  // no ceiling ⇒ no spread needed
```

**`remainingTotal` is `Infinity`, so `remainingTotal < -EPS` is never true → the breach detector never
fires, and the fit check's ceiling bind never binds.** 🔴 **CONFIRMED: Tikka (NULL) GETS NO TOTAL-CEILING
PROTECTION ON EITHER PATH — before this change or after it.** ⚠️ **Per-CATEGORY batch limits still
apply on both paths, so a NULL-ceiling truck is not entirely unprotected — but the global ceiling, the
thing that caught Gusto's 17:00, does nothing for them.** **Gusto (`kitchen_capacity = 2`) is the
opposite: two mains in one window binds.**

---

# STAGE 2 — WHAT WAS BUILT, AND WHY

🔴 **PLACEMENT 1: THE CHECK NOW RUNS OFFLINE, AT PLACEMENT, AGAINST CACHED DATA, AND THE MODAL MARKS IT
PROVISIONAL.** Stage 1 supports it because the only networked input already has a cached form that this
very panel resolves for its own strip — Q2. **Placement 2 was not built because it already exists**
(the breach banner), and building a second arrival-time surface would be the second vocabulary the
brief forbids.

```tsx
    if (!skipFitCheck && effectiveSlot && manualEvent) {
        if (isOnline()) {
          const checkRes = await fetch(`/api/slots/${truck.id}?${p}`, { cache: 'no-store' })
          …
        } else if (capacityInputs) {
          ci = capacityInputs
          freshCfgs = serverCatConfigs as Record<string, { secs: number; batch: number }>
          stale = true
        }
```

✅ **ONLINE IS UNCHANGED, BYTE FOR BYTE** — the same no-store read, the same engine call, the same
modal. **The only edit to that path is that the `isOnline()` term moved out of the `if` and into a
branch inside it.**

🔴 **NO CACHED INPUTS ⇒ NO CHECK.** A device that has never loaded this event has nothing to project
from, and `else if (capacityInputs)` leaves `ci` null, which skips exactly as before. **A check with no
data must not pretend to have run.**

## The modal says the answer is provisional

```tsx
                <p className="mt-3 text-xs font-semibold text-amber-700">
                  Checked against the last data this device downloaded -- you&apos;re offline, so a newer order may not be counted.
                </p>
```

⚠️ **Shown only when `stale` is true, i.e. only offline.** **Both buttons are unchanged: `Pick another
time` and `Place it anyway`.**

## 🔴 THE ORDER IS NEVER REJECTED OR MOVED

**The modal is advisory and always was** — its own comment: *"The manual path books-as-chosen by design,
so this is purely advisory"*. **`Place it anyway` submits the order into the chosen slot exactly as
before. Nothing in this change rejects, bumps or re-times an order, offline or online.**

## ⚠️ `capacity_ack_at` — WHAT IT NOW MEANS, AND WHAT WAS NOT OVERLOADED

| Situation | `capacity_ack_at` | Meaning |
|---|---|---|
| Online, modal shown, "Place it anyway" | a timestamp | **the operator saw the modal and placed anyway** — unchanged |
| 🔴 **Offline, modal shown, "Place it anyway"** | 🔴 **a timestamp — NEW** | **the operator saw a PROVISIONAL warning and placed anyway.** ⚠️ **The column does not record that it was provisional; the modal did** |
| Offline, no cached inputs ⇒ no check | NULL | **never checked** |
| No breach | NULL | **checked, nothing to warn about** |

🔴 **SO NULL STILL MEANS THREE THINGS AND I DID NOT WIDEN IT SILENTLY: "never checked", "checked and
fine", and "checked provisionally and fine".** ⚠️ **Distinguishing them needs a column, which is a
schema change and was not made.** **The honest statement is: a timestamp now means "warned and
overridden" on both paths, and the strength of the warning differed.**

---

# ⚠️ PIZZERIA GUSTO — `kitchen_capacity = 2`

| | Before | After | Method |
|---|---|---|---|
| Online placement into a full slot | the modal, with contributors | ✅ **identical** | ✅ **EXECUTED (source)** — that branch is unedited |
| **Offline placement into a full slot** | 🔴 **nothing at all** | 🔴 **the modal, plus the provisional line** | ✅ **source-read; not exercised offline** |
| Offline, event never loaded | nothing | **nothing — unchanged** | ✅ source-read |
| The order itself | placed as chosen | ✅ **placed as chosen — never rejected or moved** | ✅ source-read |
| With `kitchen_capacity = 2`, two mains in one window | binds | **binds, offline too** | ⚠️ **INFERRED from the engine's ceiling arithmetic** |

🔴 **NO CLAIM HERE IS EXECUTION-VERIFIED AGAINST THEIR DEVICE. No order was placed, no device taken
offline.**

---

# VERIFICATION — 🔴 TSC-CLEAN IS NOT VERIFICATION

**`npx tsc --noEmit` exits 0. `npx eslint`: 23 problems (12 errors, 11 warnings) — IDENTICAL to this
file's count in the three previous reports that touched it.**

| Required claim | Method |
|---|---|
| An offline order into a full slot warns at placement | ✅ **SOURCE READ** — the `else if (capacityInputs)` branch feeds the same engine and the same `setCapacityConfirm`. 🔴 **NOT EXERCISED OFFLINE** |
| Never rejected or moved | ✅ **EXECUTED (source)** — the modal's two buttons and `submitManual(ov, true, true)` are not in the diff; no bump exists on this path |
| The operator is told which slot and which orders | ✅ **SOURCE READ** — `contributors` (id, slot, qty) is the existing block and renders for the `over` variant. ⚠️ **On the `filled`/`toosoon` variants it does not, by the existing design** |
| An online placement behaves exactly as today | ✅ **EXECUTED** — `git diff` on that branch is the `if (isOnline())` wrapper and nothing else; same URL, same `cache: 'no-store'`, same fields |
| A NULL-ceiling truck is unchanged | ✅ **EXECUTED (source)** — `kitchenCapacity == null ⇒ Infinity`, so no ceiling bind fires on either path, before or after |

## 🔴 WHAT THIS DOES NOT PROVE

- **NOTHING WAS RENDERED OR PLACED.** No browser, no device, no airplane mode.
- 🔴 **THE OFFLINE CHECK CAN MISS A BREACH AND THAT IS BY CONSTRUCTION** — cached occupancy cannot see
  what arrived since. **The modal states this; the fix does not remove it.**
- ⚠️ **The 21 August case would still not have warned unless the 17:00 window was over the ceiling in
  the cached data at the time.** **This closes the "no check ran at all" hole; it does not make an
  offline device omniscient.**

---

# INTEGRITY

```
components/dashboard/AddOrderPanel.tsx
BEFORE   176,803 bytes · 36 non-ASCII classes
AFTER    179,515 bytes · 2,596 lines · 36 classes
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
classes added vs HEAD: NONE · removed: NONE
```

✅ **No class gained or lost — the new comments and the new modal line are pure ASCII by construction.**

## This report — a SEPARATE pass, run AFTER writing

```
docs/offline-fit-check-report.md   bytes 13,316
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT
and never prints the glyph, so this table cannot alter the counts it reports.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 24 | 0 | 24 |
| U+26A0 (warning sign — TEXT presentation) | 11 | 11 | 0 |
| U+2705 (check mark button) | 18 | 0 | 18 |

U+26A0 is the only TEXT-presentation base here and every occurrence is PAIRED with U+FE0F.
U+1F534 and U+2705 have emoji presentation by default, so bare is correct for them.

## Working tree

```
 M app/api/dashboard/action/route.ts
 M app/api/dashboard/route.ts
 M app/api/heartbeat/route.ts
 M app/api/manage/route.ts
 M app/api/orders/submit/route.ts
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/CapacityBreachBanner.tsx
 M lib/copy/offlineProtection.ts
 M supabase/functions/heartbeat-monitor/index.ts
?? docs/breach-banner-copy-report.md
?? docs/breach-banner-safe-area-report.md
?? docs/offline-fit-check-report.md
?? docs/offline-notice-gate-report.md
?? docs/offline-order-numbering-capacity-report.md
?? docs/offline-protection-modes-build.md
?? docs/offline-protection-modes-review.md
?? docs/offline-protection-popup-report.md
?? docs/oversell-warning-review-report.md
?? supabase/migrations/20260818_offline_protection_mode.sql
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `M components/dashboard/AddOrderPanel.tsx` | 🔴 **THIS TASK — the only source file written.** It was CLEAN at `HEAD` before this task (the earlier Add-order work is in `dcb8862`/`fa72f9a`) |
| 🔴 `?? docs/offline-fit-check-report.md` | 🔴 **THIS TASK** — this file |
| the nine `M` files and `?? supabase/migrations/20260818_offline_protection_mode.sql` | ✅ **pre-existing — the offline-protection-modes build, the task before this one** |
| every other `?? docs/*.md` | ✅ pre-existing — earlier tasks this session |

No `git stash`, `git checkout` or `git restore` was run at any point.
