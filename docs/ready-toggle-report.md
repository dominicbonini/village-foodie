# "Mark ready" toasts but the row does not change — cause found

**Read-only. No file changed, no SQL, no migration, no deploy. The fix is reported, not applied.**

---

## VERIFICATION

- **Executed:** source reads across `app/dashboard/[token]/page.tsx`, `.../kds/page.tsx`,
  `lib/native/useGatedActionResult.tsx`, `lib/native/orderGate.ts`, `lib/orders/mergeOrders.ts`,
  `app/api/dashboard/route.ts`, `app/api/dashboard/action/route.ts`,
  `ios/App/App/capacitor.config.json`, and `supabase/migrations/`. **That is execution of my reading,
  not of the product.**
- 🔴 **I have not run the app, the simulator, or any query.** Your two facts — the writes landed at
  17:27:14 and 17:36:18, and the seeded rows carry future `updated_at` — are taken as established;
  **I did not read the database.**
- **No typecheck is offered as verification.**

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 0 · What the simulator is loading — checked first, as instructed

**`ios/App/App/capacitor.config.json:5-6`:**

```json
"server": { "url": "https://www.hatchgrab.com/app" }
```

> ✅ **THE SIMULATOR LOADS PRODUCTION.** Not your working tree.

🔴 **THEREFORE BATCH 1 (R4/R5) AND THE STATUS-SPLIT WORK ARE NOT INVOLVED.** They are uncommitted and
undeployed. **The simulator is running the rolled-back deployment, and every line quoted below exists in
that deployment** — none of it is code I added this session.

⚠️ **"Rebuilding the app" does not change which code runs** — it reloads the same production URL. **What
a rebuild changes is that React state starts empty.** That turns out to be the whole explanation.

---

# 🔴 THE CAUSE

**`lib/orders/mergeOrders.ts:78-93` — the version guard compares `updated_at` and nothing else.**

```ts
const tRead  = parseTs(read.updated_at)    // the server's freshly-updated row
const tLocal = parseTs(local.updated_at)   // the stale row already on screen
if (tRead !== null && tLocal !== null && tRead !== tLocal) {
  return tRead > tLocal ? read : local     // ← newer wins. OLDER REJECTED.
}
return reconcileEqual(local, read)         // rank/undo logic — ONLY reached when timestamps are EQUAL
```

**Put your numbers through it:**

| | `updated_at` | Source |
|---|---|---|
| **Server row after the write** | **≈ 17:27:14 on 1 Sept** | `orders_set_updated_at` trigger (`supabase/migrations/20260703_orders_updated_at_trigger.sql:32`) sets it to `now()` |
| **Local row on screen** | **a FUTURE timestamp** — your established fact | Seeded row |

```
tRead (17:27) > tLocal (future) → FALSE  →  return local  →  the stale 'confirmed' row is KEPT
```

> 🔴 **THE SERVER'S CORRECT ANSWER IS FETCHED, COMPARED, AND THROWN AWAY.** The guard built to stop a
> stale read reverting a newer local status does the exact opposite here, because "newer" is decided by
> a timestamp the seed made unreliable.

### Why this matches every symptom you reported

| Symptom | Explanation |
|---|---|
| Toast fires with Undo | The toast is on the `result.ok === true` path — **the write really did succeed** |
| Row stays 'confirmed' | The refetch's correct row loses the timestamp comparison |
| DB is 'ready' | Never in doubt — the client discards the read, it does not un-write it |
| ✅ **Correct after an app rebuild** | 🔴 **THE DECISIVE CONFIRMATION.** `mergeOrders:79` — `if (prev.length === 0) return incoming`. **A rebuild empties React state, so there is no local row to lose to, and the server row is taken whole.** |
| pizzeria-gusto unaffected | Its orders are real, with **past** `updated_at`, so `tRead > tLocal` holds |
| Reproduced on two orders | Both seeded, both future-dated — **it will reproduce on every seeded row** |

⚠️ **The event being unopened is NOT the cause** — §2.

---

## 1 · The full path, tap to render

| # | Step | File:line | Kind |
|---|---|---|---|
| 1 | `Ready` tapped on the card | `components/dashboard/OrderCard.tsx` | UI |
| 2 | `doAction('ready', orderKey)` | `page.tsx:2233` | sets `actionLoading` only |
| 3 | 🔴 **No optimistic status write here** | `page.tsx:2233-2242` | **§3** |
| 4 | `gatedAction({url:'/api/dashboard/action', action:'ready', defer_email:true, kind:'status'})` | `page.tsx:2239` | request |
| 5 | Online → `post(url, body, 5_000)` | `orderGate.ts:300` | HTTP POST |
| 6 | Server updates the row; trigger bumps `updated_at` | `action/route.ts`; `20260703_orders_updated_at_trigger.sql:32` | DB write ✅ |
| 7 | `{ ok: true, queued: false, status: 200, data }` | `orderGate.ts:303` | response |
| 8 | `handleGateResult(result,'ready',orderKey)` | `page.tsx:2240` | |
| 9 | `if (!result.ok) throw` — **not taken** | `useGatedActionResult.tsx:171` | |
| 10 | **Success toast + Undo** | `useGatedActionResult.tsx:~246-248` | ⚠️ **fires before any re-render** |
| 11 | 🔴 **`await refetch()`** | `useGatedActionResult.tsx:~258` | **THE ONLY THING THAT CHANGES THE ROW** |
| 12 | `refetch` is `fetchAll` | `page.tsx:1113` | |
| 13 | `GET /api/dashboard` returns the row as **'ready'** | `route.ts:294` (`ready` ∈ `ACTIVE_STATUSES`) | ✅ correct |
| 14 | 🔴 **`setOrders(prev => applyPendingBuzzers(mergeOrders(prev, incomingOrders), …))`** | **`page.tsx:1041`** | **THE ROW IS DISCARDED HERE** |
| 15 | Re-render from `orders` | `page.tsx:2940` | shows stale 'confirmed' |

### 🔴 What is supposed to make the row switch

**A REFETCH. Not a local state update, not realtime, not the poll.**

**There is no optimistic status patch anywhere on this path.** The board reflects a status change *only*
by re-fetching and merging. **So the merge is the single point of failure**, and every other route to a
re-render funnels through the same function:

| Trigger | Ends at |
|---|---|
| Action → `await refetch()` | `mergeOrders` (`page.tsx:1041`) |
| Realtime `postgres_changes` → `fetchAllRef.current()` (`page.tsx:1257`) | **same** |
| 60-second poll → `fetchAllRef.current()` | **same** |
| PIN submit | `mergeOrders` (`page.tsx:1635`) |

> 🔴 **ALL FOUR ARE DEFEATED BY THE SAME COMPARISON. There is no path that recovers.** That is why it
> persisted rather than self-healing on the next poll.

**The KDS is identical** — `kds/page.tsx:713` and `:1493`.

---

## 2 · The unopened-event hypothesis — **TESTED AND DROPPED**

**It is a reasonable hypothesis and it is not the cause.**

| Check | Finding |
|---|---|
| Does the events query exclude unopened events? | 🔴 **NO.** `route.ts:180-183` filters `truck_id`, `event_date`, `.neq('status','cancelled')`. **`status='confirmed'` passes; `opened_at` is never read** |
| Does the orders query filter on event status? | **NO.** `route.ts:294/302` filter on **order** status. `'ready' ∈ ACTIVE_STATUSES` (`:238`) |
| Does `opened_at` appear in the route at all? | **Not in the events select** (`:180`) |
| Does the render path branch on event status? | **Not for order rows** |
| Can an optimistic update be overwritten by a fetch that excludes the event? | 🔴 **The event is NOT excluded — and there is no optimistic update to overwrite (§3)** |

✅ **The unopened event is a coincidence of which truck was used for testing.** ⚠️ **The real correlation
is that this truck's orders are SEEDED** — and seeded rows carry the bad timestamps. **pizzeria-gusto's
event being open is not why it works; its orders having sane `updated_at` is.**

---

## 3 · Reverted, overwritten, or never applied? — **NEVER APPLIED**

🔴 **There is no optimistic status update for `ready` on this path.** `doAction` (`page.tsx:2233`) sets
`actionLoading` and calls the gate. **It never touches `orders`.**

⚠️ **So "the optimistic update was reverted" is the wrong frame** — the row was **never** locally set to
'ready'. The screen showed 'confirmed' continuously, and the refetch that should have corrected it was
rejected.

### The merge rule, exactly

```ts
if (!Array.isArray(prev) || prev.length === 0) return incoming   // :79  ← why a rebuild fixes it
…
if (tRead !== null && tLocal !== null && tRead !== tLocal) {
  return tRead > tLocal ? read : local                           // :88  ← TIMESTAMP ONLY
}
return reconcileEqual(local, read)                               // :90
```

### 🔴 Yes — a future-dated row wins, and the safety net cannot save it

**`reconcileEqual` (`:66-72`) contains the sensible logic** — a lifecycle `RANK`, and `read` wins on any
forward or lateral move:

```ts
if (rRead >= rLocal) return read   // 'ready'(rank) >= 'confirmed'(rank) → the read WOULD win
```

**It is never reached.** It runs **only when the two timestamps are equal or one is missing**. With a
future local timestamp the primary guard returns `local` first.

> 🔴 **THE RANK LOGIC IS EXACTLY THE FIX, AND IT IS ALREADY IN THE FILE — SITTING BEHIND A BRANCH THAT
> CANNOT BE REACHED IN THIS CASE.**

⚠️ **`applyPendingBuzzers` runs after the merge** (`page.tsx:1041`) but touches only `buzzer_number` —
**it does not restore status.**

⚠️ **`parseTs` (`:57-61`) is a plain `Date.parse`** — it does not sanity-check against `now()`. **A
timestamp in the year 3000 would be treated as authoritative.**

⚠️ **On sorting:** `page.tsx:2940` sorts by `sortByTimeThenId`, not `updated_at`. **Future timestamps
affect the merge, not the order on screen.**

---

## 4 · Realtime — present, and it cannot help

**Two subscriptions on the dashboard** (`page.tsx:1256-1266`): `postgres_changes` on `public.orders`
filtered `truck_id=eq.<id>`, and one on `public.trucks`.

🔴 **The orders subscription's handler is `() => fetchAllRef.current()`** — it does not apply the
payload. **It triggers the same fetch → the same `mergeOrders` → the same rejection.**

| If realtime is… | Effect here |
|---|---|
| Working | Fires a refetch that is **discarded by the merge** |
| Absent / silent / not established | **No difference** — the action's own `await refetch()` already ran, and the 60s poll follows |

> ✅ **REALTIME IS NOT IMPLICATED EITHER WAY.** Fixing it would change nothing; its absence did not cause
> this. **The board does not depend on a realtime event to re-render** — it has three other triggers,
> all funnelling into the same merge.

---

## 5 · The Undo control — what it implies

**Two different toasts carry an Undo, and they mean different things:**

| Toast | File:line | Condition | Implies |
|---|---|---|---|
| `Order #N ready` + Undo | `useGatedActionResult.tsx:~246` | **After** `if (!result.ok) throw` at `:171` | 🔴 **A real HTTP 2xx. The server accepted it** |
| `Order #N saved` + Undo | `useGatedActionResult.tsx:164` | `result.queued === true` | ⚠️ **Only that it was stored in the local outbox** |

**In your case the DB has the row, so this was the first toast — the online path — and the Undo's
presence DOES imply the write was confirmed.**

⚠️ **But your framing was right and worth keeping:** the two toasts look alike, and **the second
promises nothing about the server.** 🔴 **The genuinely misleading part is not the Undo — it is that a
confirmed-success toast sits next to a row that did not change.** The toast is honest; the board is not.

---

## 6 · orderGate / outbox — not involved

`orderGate.ts:296-307` queues in exactly two cases: **`isNativeApp() && online === false`**, or a
**thrown fetch** (network failure / the 5-second `AbortSignal.timeout`).

**Neither happened:** the write reached the database, so the POST completed and returned a response.
`gatedAction` returns `{ ok: res.ok, queued: false, … }` for **any** server response.

**If it HAD queued**, the UI would differ visibly: the toast reads **"Order #N saved"** (not "ready"),
the KDS increments a pending-sync counter, and the offline undo removes the op. ⚠️ **On the dashboard
the two toasts are similar enough to confuse** — but the DB write settles it.

---

## 7 · Source vs running client

### ✅ Established from source

1. The simulator loads production (`capacitor.config.json`).
2. There is **no optimistic status update** for `ready`.
3. `await refetch()` is the only thing that changes the row.
4. All four re-render triggers funnel through `mergeOrders`.
5. The primary guard is **timestamp-only**; `reconcileEqual`'s rank logic is unreachable when they differ.
6. `prev.length === 0 → return incoming` explains the rebuild fix.
7. The `orders_set_updated_at` trigger sets `updated_at = now()`.
8. Neither the events query nor the orders query filters on event `status`/`opened_at`.
9. Realtime calls the same fetch.
10. The queued path shows a different toast.

### 🔴 NOT established — needs a running client or a query

1. **The actual `updated_at` on those two rows.** **Your established fact; I ran no SQL.** 🔴 **This is
   the one input the whole diagnosis rests on.**
2. **That the merge is what discarded it** — inferred from the code plus your two facts, **not
   observed**.
3. Whether the 200 response body carried the updated row.
4. Whether realtime was connected in the simulator.

### What would distinguish a client-state bug from a server-response bug

**It is already distinguished, by your own evidence:** the DB is correct and a rebuild renders it
correctly. **A server-response bug cannot be fixed by clearing client state.**

**To nail it in one observation:** open the simulator with Safari Web Inspector, mark one ready, and in
the console run

```js
// the /api/dashboard response for that order
```

— comparing `updated_at` on the incoming row against the one on screen. 🔴 **If the incoming
`updated_at` is EARLIER than the local one, the diagnosis is confirmed outright.** **A single log line
inside `mergeOrders` would show the rejection directly.**

---

## The fix — reported, not applied

### 🔴 Immediate, no deploy: fix the data

**The rows carry timestamps that cannot be true.** A one-column update setting the seeded rows'
`updated_at` to a past value removes the cause for every existing row.

✅ **Requires no code change and no deploy** — which matters, because a deploy is an instant release to a
shipped iOS app and an in-review Play build. ⚠️ **It does not stop the next seed reintroducing it.**

### The code fix — one line, and it uses logic already in the file

**`lib/orders/mergeOrders.ts:88`.** The rank check that would resolve this correctly already exists in
`reconcileEqual`. **Make the timestamp guard defer to it instead of overriding it:**

```ts
// today
return tRead > tLocal ? read : local

// proposed: a newer read still wins outright; an "older" read is handed to the rank backstop
// rather than being discarded, so a forward lifecycle move (confirmed → ready) is never rejected
// on the strength of a timestamp alone.
return tRead > tLocal ? read : reconcileEqual(local, read)
```

⚠️ **This weakens the stale-read guard the file exists to provide** — its header records the bug it was
written for (a ready order reverting to confirmed). **A forward move would now be accepted even from an
older read.** 🔴 **`reconcileEqual` already refuses backward moves except known undos, so the protection
that matters is retained — but this is a real trade and it is yours to make.**

### Also worth considering

- **Clamp `parseTs` to `now()`** — treat a future `updated_at` as untrustworthy. **Narrower, and it fixes
  the class rather than this instance.**
- **Never let a seed write a future `updated_at`.** 🔴 **The seed I wrote sets `created_at`/`updated_at`
  to the day before the event at 18:00 — for an event tomorrow, that is in the future.** **The generator
  is the origin of this bug class.**
