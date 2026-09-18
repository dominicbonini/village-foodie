# A dismissed over-capacity warning stays dismissed

**Date:** 19 September 2026 · Display only · Localhost only; nothing deployed, nothing committed, nothing staged.
**Files changed:** `components/dashboard/CapacityBreachBanner.tsx`; new harness
`scripts/breach-banner-dismiss.cjs` + `scripts/harnesses.json`.
No live truck was touched and no database was read or written — the board is a fixture built from your screenshot.

---

## What went wrong

The dismissal was keyed to a signature of the **whole breach set**, compared for equality:

```ts
  const sig = breachSignature(breaches)      // "12:15:0:pizza1|12:30:0:pizza2|…" — every slot, joined
  if (sig === dismissedSig) return null
```

So **any** change to the set brought the banner back — including the set getting **smaller**. You dismissed a
warning covering six slots, cancelled the order that had pushed 12:15 over — exactly what the banner asked for —
and the signature no longer matched, so you were warned again about the five you had just reviewed.

## The fix, by symbol

`unreviewedBreaches(breaches, dismissedSig)` — new, in `CapacityBreachBanner.tsx`. A dismissal now records each
slot **at the severity it was reviewed at**, and a breach counts as unreviewed only when it is **new or worse**:

```ts
  return (breaches || []).filter(b => {
    const seen = reviewed.get(b.collection_time)
    if (!seen) return true                                            // a slot never dismissed
    if ((b.over_total ?? 0) > seen.overTotal) return true              // further over the kitchen ceiling
    return (b.over_cats || []).some(c => (c.over ?? 0) > (seen.byCat[c.cat] ?? 0))   // further over a batch
  })
```

A slot that is unchanged, or **less** over than when it was dismissed, stays quiet. `breachSignature` is
unchanged, so acknowledgements already in `localStorage` (`hg_breach_ack_<event>`) keep working.

**One more thing it needed.** When everything still over has already been reviewed but the set has changed, the
stored acknowledgement is rewritten to the current set (a `useEffect`, only while the banner is hidden).
Without it a breach that goes away and later comes back would stay silent, because the old signature still
listed it; with it, that return is genuinely new and warns again.

⚠️ **A parsing bug found while building this:** reading the signature back with `entry.split(':')` breaks on the
time — `"13:45:0:pizza2"` parsed as time `13`, over-total `45`. It is now one anchored regex. The harness's V3
variant caught it.

## The harness — `scripts/breach-banner-dismiss.cjs`

**Failure mode:** a warning the operator has already reviewed coming back because something *else* changed.

| Broken variant (run FIRST) | Result |
|---|---|
| V1 today's whole-set equality | ✓ FAILED: after cancelling the 12:15 order the banner returns |
| V2 a dismissal that covers slots it never saw | ✓ FAILED: a new slot at 15:00 stays hidden |
| V3 severity ignored | ✓ FAILED: 12:30 going from 2 over to 5 over stays hidden |

**Real result — your sequence, then the cases that must still warn:**
six slots show; dismissed, they hide; **cancelling the order holding 12:15 leaves the banner hidden**; a slot
becoming *less* over stays hidden. It returns for: a new slot (15:00), and only that slot is counted; an
already-dismissed slot going further over its batch (12:30: 2 → 5); further over the kitchen ceiling
(13:45: over_total 0 → 3); a second category going over at a dismissed slot; and 12:15 going over again after the
re-acknowledgement. ✅ rc 0.

## Verification

| Check | Result |
|---|---|
| `node scripts/run-harnesses.cjs` | **53 run · 53 passed · 0 failed — true exit code 0** |
| `npx tsc --noEmit` | **true exit code 0** |
| `npx next build` | "Compiled successfully in 4.7s", **true exit code 0** |
| eslint, `CapacityBreachBanner.tsx`, vs a clean HEAD worktree | **no rule count changed** (0 errors / 0 warnings both sides) |
| goldens | `8bdae817748ad334…` / `e3f0a88099fd797c…` — untouched |

## Localhost check

On the Bures event: with several slots over capacity the red banner appears. Press **Dismiss**. Now cancel one of
the orders it named — the banner **stays away**, and the other slots are not raised again. Then place an order
that pushes a *different* time over, or push an already-named time further over: the banner returns, naming it.

## Anything I could not establish

- **The headline count does not match the lines shown.** Your screenshot reads "⚠ 4 slots over capacity" above
  **six** lines. They measure different things: the headline is `breaches.length` (breached cooking windows)
  while the lines are grouped by the *contributing orders'* collection slots. I left it alone — it is a separate
  display bug from the one you reported — but it is a one-line change to count the rows actually rendered if you
  want it.
- **Whether a dismissal should expire.** It currently lasts for the event, per device (`hg_breach_ack_<event>`).
  Nothing here changes that.
