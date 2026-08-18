# The capacity strip marks slots that are OVER, not just full

**Files changed — TWO:** `components/dashboard/DayLoadStrip.tsx` and 🔴 `app/dashboard/[token]/page.tsx`.
**Also written:** `docs/capacity-strip-marker-report.md` (this file).
🔴 **NOTHING UNDER `app/api` WAS TOUCHED AND NO API CHANGE WAS NEEDED — §Q3.** The tone logic, the
capacity engine, `lib/capacity-breach.ts`'s rule and the banner are all untouched.
**Nothing committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or `restore`.
No SQL, no migration.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# STAGE 1

## Q1 — THE STRIP, AND WHAT MAKES A SLOT RED

`components/dashboard/DayLoadStrip.tsx`, both variants:
```tsx
            const tone = (s.tone ?? 'green') as 'green' | 'amber' | 'red'
                <span className="text-[11px] font-bold text-slate-600 tabular-nums">{s.collection_time}</span>
                <span className={`w-2.5 h-2.5 rounded-full ${TONE[tone].dot}`} />
```
```tsx
const TONE: Record<'green' | 'amber' | 'red', { dot: string; text: string }> = {
  red: { dot: 'bg-red-500', text: 'text-red-700' },
```

**It reads `s.tone` off the slot and nothing else** — the tone comes from the engine
(`projectBackwardOccupancy`), and 🔴 **red fires at `conc >= ceiling`, so AT the ceiling and OVER it are
the same colour.** That is the defect exactly as reported.

## Q2 — 🔴 THE DISTINCTION EXISTS ALREADY, IN TWO PLACES

```ts
    const overTotal = w.remainingTotal < -BREACH_EPS ? -w.remainingTotal : 0
    if (overTotal <= 0 && overCats.length === 0) continue   // full is fine; only genuine over-subscription flags
```
```
//   tone==='red' also fires on legitimately-FULL slots (>= ceiling), which would cry wolf on normal
//   busy nights — so we DELIBERATELY do not use it.
```
**And `lib/slot-display.ts` already carries the same test on the indicator:**
```ts
  /** Units this window is STRICTLY OVER the kitchen_capacity ceiling; 0 when it is at-or-under.
   *  `tone` alone cannot express this: it goes red at `conc >= ceiling` … This is
   *  the same strictly-over test the breach detector applies (`remainingTotal < -EPS`, …) */
  overTotal: number
```

🔴 **SO THE STRIP DOES NOT NEED A NEW PREDICATE — AND IT DOES NOT EVEN NEED THE PREDICATE. It can take
the detector's OUTPUT.** The strip reads `Slot`, not `SlotIndicator`, so `overTotal` is not on the
objects it renders; `capacityBreaches` is.

## Q3 — 🔴 NO API CHANGE. THE DASHBOARD ALREADY HOLDS IT.

`/api/dashboard` already returns `capacityBreaches`, the dashboard already holds it in state for the
banner, and the strip is its child. **The cheapest route is one derived Set passed down:**
```tsx
  const breachedSlotTimes=useMemo(()=>new Set((capacityBreaches||[]).map(b=>b.collection_time)),[capacityBreaches])
```
✅ **No route change, no new field, no second rule — the banner and the marker now agree by
construction rather than by inspection.**

## Q4 — THE KDS

✅ **`grep` for `DayLoadStrip` in the KDS returns 0.** **The strip is dashboard-only, at two mounts —
`variant="strip"` (mobile) and `variant="sidebar"` (desktop) — and both are wired.** 🔴 **THE KDS IS
OUT OF SCOPE BECAUSE IT DOES NOT MOUNT THIS COMPONENT, not because it was skipped.**

## Q5 — A NULL CEILING

```ts
        remainingTotal: kitchenCapacity == null ? Infinity : kitchenCapacity - conc,
```
🔴 **`Infinity` can never be `< -EPS`, so a NULL-ceiling truck produces no breaches, the Set is empty,
and no marker can render. Nothing can be over.** ⚠️ **Tikka therefore sees the strip exactly as it does
today.** **Per-category batch breaches still exist in the detector's `over_cats`, and those DO produce a
`collection_time`, so a NULL-ceiling truck can still be marked on a category breach — which is correct:
that is a real over-subscription.**

---

# STAGE 2 — THE MARKER

```tsx
                {breachedSlots?.has(s.collection_time) && (
                  <span role="img" aria-label="Over capacity" title="Over capacity"
                    className="text-[11px] font-black leading-none text-red-600">!</span>
                )}
```

| Requirement | How |
|---|---|
| Reuses the detector's predicate | 🔴 **it reuses its OUTPUT** — `capacityBreaches`, which is produced by `remainingTotal < -EPS` |
| Full-but-not-over unchanged | ✅ **the detector `continue`s on those, so they are not in the Set** |
| Does not replace the count or the dot | ✅ **it is a sibling `<span>`; the time and the dot are untouched in both variants** |
| Accessible name in words | ✅ **`role="img"` + `aria-label="Over capacity"`, with `title` for pointer users. NOT a bare glyph** |
| Does not duplicate the banner | ✅ **it says only that this slot is over. WHICH orders and HOW MANY stay in the banner** |

**Both variants carry it**, from one component, so the wording exists once.

---

# ⚠️ PIZZERIA GUSTO — `kitchen_capacity = 2`

| | Before | After |
|---|---|---|
| A slot at exactly 2 | red dot | ✅ **red dot, no marker — unchanged** |
| A slot at 3+ | 🔴 **red dot, indistinguishable from full** | 🔴 **red dot + `!`, named "Over capacity"** |
| Every other slot | — | ✅ **unchanged: same tone, same dot, same label, same layout** |
| Both views | — | mobile strip and desktop sidebar alike |

⚠️ **With a ceiling of 2 they will see this often — which is the point: today those slots look identical
to a normal busy one.** 🔴 **SOURCE-READ, NOT EXECUTION-VERIFIED: nothing was rendered.**

---

# VERIFICATION — 🔴 TSC-CLEAN IS NOT VERIFICATION

**`npx tsc --noEmit` exits 0. `npx eslint`: `DayLoadStrip.tsx` 0 problems; the dashboard 82 errors /
26 warnings = 108, this session's baseline.**

| Required claim | Method |
|---|---|
| A strictly-over slot shows the marker | ✅ **SOURCE READ** — membership of a Set built from `capacityBreaches`, whose only producer is `remainingTotal < -EPS`. 🔴 **Not rendered** |
| An exactly-full slot does not | ✅ **EXECUTED (source)** — `if (overTotal <= 0 && overCats.length === 0) continue` in the detector means full slots never enter the array |
| The count and dot are unchanged | ✅ **EXECUTED** — `git diff` on the component adds a prop, two conditional spans and comments; the time span, the dot span and `TONE` are not in the diff |
| The marker has an accessible name | ✅ **EXECUTED (source)** — `role="img" aria-label="Over capacity" title="Over capacity"` at both mounts |
| A NULL-ceiling truck shows no markers | ✅ **SOURCE READ** — `Infinity < -EPS` is false, so no total-ceiling breach exists to mark |
| The KDS is handled or out of scope | ✅ **EXECUTED** — `grep` returns 0 mounts on the KDS; **explicitly out of scope** |

## 🔴 WHAT THIS DOES NOT PROVE

- **NOTHING WAS RENDERED.** No browser, no device, no over-capacity slot observed carrying the marker.
- ⚠️ **The marker inherits the banner's timing:** `capacityBreaches` is computed per `/api/dashboard`
  poll, so a slot that has just tipped over is marked on the next poll, not instantly.
- ⚠️ **A dismissed BANNER does not dismiss the marker**, and should not — the banner is a one-time
  notice, the strip is a live view. **Stated because the two now share a source.**

---

# INTEGRITY

```
components/dashboard/DayLoadStrip.tsx    6,721 →  8,596 bytes · classes 2 → 2
app/dashboard/[token]/page.tsx         393,662 → 403,405 bytes · classes 53 → 53
BOTH: NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0 · added vs HEAD: NONE
```
✅ **Neither file gained or lost a non-ASCII class — the marker is an ASCII `!` and the comments are
ASCII by construction.**

## This report — a SEPARATE pass, run AFTER writing

```
docs/capacity-strip-marker-report.md   bytes 10,024
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT
and never prints the glyph, so this table cannot alter the counts it reports.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 21 | 0 | 21 |
| U+26A0 (warning sign — TEXT presentation) | 6 | 6 | 0 |
| U+2705 (check mark button) | 16 | 0 | 16 |

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
 M components/dashboard/DayLoadStrip.tsx
 M lib/copy/offlineProtection.ts
 M lib/native/orderGate.ts
 M supabase/functions/heartbeat-monitor/index.ts
?? docs/breach-banner-copy-report.md
?? docs/breach-banner-safe-area-report.md
?? docs/capacity-strip-marker-report.md
?? docs/offline-fit-check-report.md
?? docs/offline-notice-gate-report.md
?? docs/offline-numbering-fix-report.md
?? docs/offline-order-numbering-capacity-report.md
?? docs/offline-protection-modes-build.md
?? docs/offline-protection-modes-review.md
?? docs/offline-protection-popup-report.md
?? docs/oversell-warning-review-report.md
?? supabase/migrations/20260818_offline_protection_mode.sql
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `M components/dashboard/DayLoadStrip.tsx` | 🔴 **THIS TASK — clean at HEAD before it** |
| 🔴 `M app/dashboard/[token]/page.tsx` | ⚠️ already `M` from earlier tasks; 🔴 **THIS TASK wrote to it** |
| 🔴 `?? docs/capacity-strip-marker-report.md` | 🔴 **THIS TASK** — this file |
| every other `M` and `??` entry | ✅ pre-existing — earlier tasks this session |

No `git stash`, `git checkout` or `git restore` was run at any point.
