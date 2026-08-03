# Buzzer deselect — the real cause, and why the previous fix could never have worked

**Date:** 2026-08-03 · `tsc --noEmit` clean · `lib/buzzer.ts` and `BuzzerGrid.tsx` lint clean · both
edited pages back at their exact pre-change lint baselines (dashboard 93, KDS 16). Nothing run beyond
`tsc` and `eslint`. **This file replaces the previous report, whose conclusion was wrong.**

---

## 0. Prompt integrity

Nothing arrived garbled.

One framing needs correcting rather than accepting: you offered to lift the "don't touch BuzzerGrid.tsx"
constraint, suspecting it was what stopped the fix working. **It was not, and I did not need to change
that file.** The grid was innocent throughout — see (c), (d), (e). The bug was in a prop expression *I*
wrote at the call sites, which the previous report explicitly waved past with "BuzzerGrid.tsx is
untouched — the fix lands entirely in the data feeding it." The data fix did land. It landed correctly,
and was then discarded one line later.

---

## 1. THE CAUSE — none of (b) to (f)

**`currentNumber` was computed with a `??` chain, and `??` falls through on `null`.**

[app/dashboard/[token]/page.tsx:3654](app/dashboard/[token]/page.tsx#L3654) as it stood, and the
byte-identical [kds/page.tsx:1170](app/dashboard/[token]/kds/page.tsx#L1170):

```tsx
currentNumber={(orders.find(o=>o.order_key===buzzerTarget.order_key)?.buzzer_number??buzzerTarget.buzzer_number)??null}
```

Evaluate it for your exact scenario — order 2 holds buzzer 1, operator taps 1 to deselect:

| Step | Value |
|---|---|
| Optimistic patch sets the live row's `buzzer_number` | `null` ✅ *(the data fix worked)* |
| `orders.find(…)?.buzzer_number` | `null` |
| `null ?? buzzerTarget.buzzer_number` | **`1`** ← `??` treats `null` as "absent" and falls through |
| `buzzerTarget.buzzer_number` | `1` — the **stale snapshot** taken when the chip was tapped |
| → `currentNumber` | **`1`** |
| `isOurs = n === currentNumber` → `1 === 1` | `true` |
| `isTaken = !!holder \|\| isOurs` | `true` → **red** |
| `subLabel = isOurs ? 'This order' : …` | **"This order"** |

Exactly what you saw. The optimistic value was computed, stored, applied to `orders` — and then thrown
away by the very expression meant to read it.

**This is why only deselect failed.** Deselect is the only operation whose live value is `null`. A
switch (3→8) leaves a non-null live value, `??` never fires, and the cells update correctly — which is
precisely the pattern you reported: switching looked fine, deselecting did not.

⚠️ It is the same family as the `??`-not-`||` warning at
[lib/payments/paid-step.ts:15-16](lib/payments/paid-step.ts#L15-L16), inverted. There, `false` is a
meaningful value that `||` would swallow. Here, `null` is a meaningful value that `??` swallows. I
wrote that warning into this codebase's comments and then made its mirror image three files away.

### It also explains the *previous* bug I misdiagnosed

Your earlier symptom (a) — *"assigned a second buzzer, then deselected it, and it reverted to the
previously held buzzer 3"* — is this same line. Deselect → live `null` → falls through to
`buzzerTarget.buzzer_number`, which is the snapshot from **when the grid opened**, i.e. 3. The grid was
not "reverting to a stale poll". It was printing the snapshot, deterministically, every time.

I attributed that to a `mergeOrders` race. That race analysis is technically sound — the version guard
genuinely cannot protect a non-status field, and `reconcileEqual` genuinely lets an equal-timestamp read
win — but **it was not what you were seeing**, and I should have proved the mechanism against the actual
render path before building on it. I built a guard for a hazard that exists instead of fixing the bug in
front of me.

---

## 2. (a) THE FULL TRACE — deselect on the order-card path

| # | Where | What happens |
|---|---|---|
| 1 | [BuzzerGrid.tsx:227](components/dashboard/BuzzerGrid.tsx#L227) | cell `onClick={() => choose(n)}`, n = 1 |
| 2 | [BuzzerGrid.tsx:129](components/dashboard/BuzzerGrid.tsx#L129) | `if (n === currentNumber) { onAssign(null, openedWithBuzzer); return }` — deselect branch, passes `null` |
| 3 | [page.tsx:3656](app/dashboard/[token]/page.tsx#L3656) | `onAssign={(n,keepOpen)=>saveBuzzer(buzzerTarget.order_key,n,keepOpen)}` |
| 4 | [page.tsx:1293](app/dashboard/[token]/page.tsx#L1293) | `prior` read from live `orders` → 1 |
| 5 | [page.tsx:1300-1302](app/dashboard/[token]/page.tsx#L1300-L1302) | guard registered `{v:null}`; `setOrders` patches `buzzer_number: null` |
| 6 | React | `setOrders` → new array → **parent re-renders** |
| 7 | [page.tsx:3654](app/dashboard/[token]/page.tsx#L3654) | 🔴 **`currentNumber` recomputed → `1`, not `null`** — the `??` fall-through |
| 8 | [BuzzerGrid.tsx:100](components/dashboard/BuzzerGrid.tsx#L100) | `taken = buildBuzzerMap(orders, eventId)` — correctly **drops** order 2, so `holder` is `undefined` |
| 9 | [BuzzerGrid.tsx:212-217](components/dashboard/BuzzerGrid.tsx#L212-L217) | `isOurs = 1===1` → true → `isTaken` true, `subLabel` "This order" |
| 10 | [BuzzerGrid.tsx:229-251](components/dashboard/BuzzerGrid.tsx#L229-L251) | cell renders **red + "This order"** |
| 11 | [page.tsx:1319-1321](app/dashboard/[token]/page.tsx#L1319-L1321) | server 2xx → toast *"Buzzer 1 removed"* — the write was always correct |

Step 8 is the proof the data fix worked: `taken` *did* drop the order. Step 7 is where it was undone.

## (b) Is the guard registered on a deselect? — **YES, correct, not the cause**

[page.tsx:1301](app/dashboard/[token]/page.tsx#L1301), before this change:

```ts
pendingWritesRef.current[pk]={v:buzzerNumber}   // buzzerNumber === null → stores {v:null}
```

No falsy check anywhere on the path. The peek adapter
([page.tsx:222](app/dashboard/[token]/page.tsx#L222)) returns `pendingWritesRef.current[key]?.v` →
`{v:null}?.v` → `null`, and absent → `undefined`. `applyPendingBuzzers` tests
`pendingValue === undefined`, so a `null` guard applies. All correct.

## (c) Does BuzzerGrid cache anything? — **NO, not the cause**

One piece of mount-captured state exists, and it does not touch cell appearance:

```ts
const [openedWithBuzzer] = useState(currentNumber != null)   // BuzzerGrid.tsx:98
```

It is read only by the Done button's visibility, the grid's bottom padding, and `keepOpen`. Everything
that draws a cell is recomputed inline on every render: `taken` ([:100](components/dashboard/BuzzerGrid.tsx#L100)),
`holder`/`isOurs`/`isTaken`/`subLabel` ([:210-217](components/dashboard/BuzzerGrid.tsx#L210-L217)). No
`useMemo`, no derived state. **The grid re-read the props correctly — it was handed a wrong value.**

## (d) Where does `taken` come from? — **the same array, not the cause**

```ts
const taken = buildBuzzerMap(orders, eventId)     // BuzzerGrid.tsx:100
orders={orders}                                    // page.tsx:3646 — the dashboard's own state
```

Same array the optimistic patch writes to. No second fetch, no snapshot, no open-time copy. On deselect
it correctly excluded the order (`holdsBuzzer` → `buzzer_number == null` → false).

## (e) Sub-label vs colour — **one source, not the cause**

```ts
const isTaken = !!holder || isOurs
const subLabel = isOurs ? 'This order' : holder ? `#${holder.id}` : ''
```

Both derive from `holder` and `isOurs`. They were wrong *together*, which is exactly what you saw (red
**and** "This order") — the signature of one bad upstream value, not two independent faults.

## (f) Does the parent re-render? — **YES, not the cause**

`setOrders(prev=>prev.map(…))` returns a new array, so React re-renders and line 3654 re-evaluates. It
re-rendered every time and recomputed the wrong number every time.

### Verdict

**One cause, in one expression, duplicated across two files.** (b)–(f) were all sound. The previous
report's data-layer work was necessary-but-not-sufficient and is retained (§4).

---

## 3. THE FIX

### 3.1 `resolveCurrentBuzzer` — a presence test, never a `??` chain

[lib/buzzer.ts:195-217](lib/buzzer.ts#L195-L217):

```ts
export function resolveCurrentBuzzer(
  orders: BuzzerPatchable[],
  target: { order_key: string; buzzer_number?: number | null },
): number | null {
  const live = Array.isArray(orders) ? orders.find(o => o.order_key === target.order_key) : undefined
  return live ? (live.buzzer_number ?? null) : (target.buzzer_number ?? null)
}
```

If the order is **in** the list, its value wins — **including `null`**. The snapshot is used only when
the order is not in the list at all, which is a genuinely different situation from "holds no buzzer".
The trap is documented in full at the function so it cannot be reintroduced.

Both call sites now read `currentNumber={resolveCurrentBuzzer(orders, buzzerTarget)}`
([page.tsx:3654](app/dashboard/[token]/page.tsx#L3654),
[kds/page.tsx:1169](app/dashboard/[token]/kds/page.tsx#L1169)).

### 3.2 `planOptimisticBuzzer` — immediacy for the take case too

Your requirement list included *"take from another order: after the confirm, the same immediacy"*. The
tapped cell already updated, but the **order it was taken from** kept its number locally until the
refetch — its card chip behind the modal stayed wrong.

[lib/buzzer.ts:219-252](lib/buzzer.ts#L219-L252) computes the write's full local effect — the target
gains the number, any other in-use order in the same event holding it loses it — mirroring the two rows
`assignBuzzer` touches server-side. Both surfaces guard and patch every key in that plan, and revert
from the matching `prior` map on failure.

### 3.3 Behaviour now, per your requirement list

| Case | On tap, before any server response |
|---|---|
| deselect | cell → **green, no sub-label** |
| switch | old cell → green/no label · new cell → **red + "This order"** |
| take from another order | after the confirm: new cell red + "This order", **and the other order's chip clears** |
| failed write | reverts **all** affected rows and surfaces a named error toast (unchanged, §4) |

### 3.4 BuzzerGrid.tsx was NOT changed

You authorised it; it was not needed. Confirmed unmodified this turn.

---

## 4. What was kept from the previous round, and why

The optimistic guard (`applyPendingBuzzers` / `echoedBuzzerKeys`, the `pendingWritesRef` /
`pendingBuzzersRef` registration, release-on-echo, revert-and-surface on failure) is **retained**.

It did not fix the reported bug, but the hazard it addresses is real: `mergeOrders`' version guard only
rejects a *strictly older* `updated_at`, and on the equal-timestamp branch `reconcileEqual` compares
**status rank only** — so a poll that started before a buzzer write can carry the old number back in.
Removing that guard to "undo" a wrong diagnosis would introduce a genuine regression. It stays, now
correctly described as belt-and-braces rather than as the fix.

The failure path is unchanged: guard dropped, all affected rows reverted, and a toast naming the number
and the order's real state — *"Could not remove buzzer 1 — it is still on order #2"* /
*"Could not give buzzer 8 to order #2 — it still has buzzer 1"*.

---

## 5. Every change this turn

| File | Line | Change |
|---|---|---|
| [lib/buzzer.ts](lib/buzzer.ts) | [195-217](lib/buzzer.ts#L195-L217) | `resolveCurrentBuzzer` — the fix |
| | [219-252](lib/buzzer.ts#L219-L252) | `planOptimisticBuzzer` — full two-row local effect |
| [app/dashboard/[token]/page.tsx](app/dashboard/[token]/page.tsx) | [67](app/dashboard/[token]/page.tsx#L67) | imports |
| | [1297-1302](app/dashboard/[token]/page.tsx#L1297-L1302) | plan + guard every affected key + patch |
| | [1333-1334](app/dashboard/[token]/page.tsx#L1333-L1334) | failure reverts every affected key |
| | [3650-3654](app/dashboard/[token]/page.tsx#L3650-L3654) | 🔴 `??` chain → `resolveCurrentBuzzer` |
| [app/dashboard/[token]/kds/page.tsx](app/dashboard/[token]/kds/page.tsx) | [32](app/dashboard/[token]/kds/page.tsx#L32) | imports |
| | [474-479](app/dashboard/[token]/kds/page.tsx#L474-L479) | plan + guard + patch |
| | [499-500](app/dashboard/[token]/kds/page.tsx#L499-L500) | failure reverts every affected key |
| | [1168-1169](app/dashboard/[token]/kds/page.tsx#L1168-L1169) | 🔴 `??` chain → `resolveCurrentBuzzer` |

Untouched: `BuzzerGrid.tsx`, `mergeOrders.ts`, the add-order picker (local `manualBuzzer` state — it
never had this bug and needs no change), the take confirm, colours, the two-channel label, Done, the
post-order prompt.

---

## 6. Verify on screen — item 1 is the regression

1. **The reported case.** Order screen, an order holding buzzer 1. Open the grid, tap 1. The cell must turn **green with no sub-label on the tap**, before the toast settles. This failed twice; check it first.
2. **Switch still works.** Order holding 3 → tap 8: 8 red "This order", 3 green, both instantly.
3. **Deselect after a switch** (the original symptom (a)): hold 3 → tap 8 → tap 8 again. Must go green and stay green — it must not print 3.
4. **Take from another order.** Order A holds 8; from order B tap 8, confirm. B's cell 8 red "This order" immediately, **and A's card chip behind the modal clears immediately** — this is new in this round.
5. **Failure path.** Devtools offline, tap a buzzer: every affected cell snaps back and a red toast names the number and the real state.
6. **Guard still releases.** After a successful change leave the grid open ~90s (past the 60s poll) — the value must hold steady with no flicker.
7. **KDS parity** — repeat 1, 3 and 4 on a KDS card.
8. **Add-order picker** — pick 3, reopen: still red "This order"; tap 3: green immediately. Local state, expected unaffected.

---

## 7. Still outstanding, not applied

The all-taken banner still reads *"All 30 buzzers are out. Tap one to take it from another order."*
Suggested: **"All 30 buzzers are out. Tap one to take it from another order, or tap your own to give it
back."**
