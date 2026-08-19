# `orders.status` transitions and the sweep race — the read

**READ ONLY. Nothing changed except this file.** No fix, no design, no migration, no SQL. `next dev` /
`next build` were not run.

## The headline answers

| | |
|---|---|
| **Writes to `orders.status`** | 🔴 **12 distinct sites. NOT ONE checks the current status in its WHERE clause** |
| **Anything conditional in the codebase?** | ✅ **YES — `assign_buzzer_atomic` uses `SELECT … FOR UPDATE` on `orders`.** A real lock, on this table, already |
| **Would a narrow sweep-only guard close the race?** | ⚠️ **It closes the one that costs money, and leaves three open.** §4 |
| **Would a refusal surface to the operator?** | ⚠️ **Only if it becomes a non-2xx.** The chain that surfaces it exists and is quotable |

---

# 1 · EVERY WRITE TO `orders.status`

## The searches I ran, so you can judge the coverage

⚠️ **STATED BECAUSE A SEARCH IN THIS SESSION ALREADY MISSED A DECLARATION BY ITS OWN FILTER** — the
actor-kind union inside `releaseHoldForTerminalOrder` was hidden by a `grep -v "actorKind:"`. **Five
searches, none filtered by exclusion:**

1. `grep -rn "update({ *status\|update({status" app lib components supabase`
2. `grep -rn "\.update(" app lib supabase | grep -i order` — catches **multi-line** update objects
3. `grep -n "status" app/api/dashboard/action/route.ts` — the whole file, line by line, for the
   multi-line edit branch **(this is the one that found `status: 'modified'`, which search 1 missed)**
4. `grep -rn "update orders\|insert into orders" supabase/migrations/*.sql` — SQL functions
5. `grep -n "from('orders')" app/api/events/action/route.ts` — the bulk path, which writes by `.in()`

⚠️ **WHAT NONE OF THEM WOULD CATCH:** a write built through a variable (`const patch = {...}; .update(patch)`)
where the key never appears literally, or one inside a `security definer` function that exists in the
database but not in `supabase/migrations`. **CANNOT DETERMINE that no such writer exists;**
`select p.proname, pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and pg_get_functiondef(p.oid) ilike '%update orders%'` would settle it.

## The table — 12 sites, 0 with a status precondition

| # | File · identifier | The write | Filters | Checks current status? |
|---|---|---|---|---|
| 1 | `dashboard/action` · `confirm` | `{ status: 'confirmed' }` | `order_key` + `truck_id` | ❌ |
| 2 | `dashboard/action` · `cancel` | `{ status: 'cancelled', cancellation_reason }` | `order_key` + `truck_id` | ❌ |
| 3 | `dashboard/action` · `ready` | `{ status: 'ready' }` | `order_key` + `truck_id` | ❌ |
| 4 | `dashboard/action` · `unready` | `{ status: 'confirmed' }` | `order_key` + `truck_id` | ❌ |
| 5 | `dashboard/action` · `cooking` | `{ status: 'cooking' }` | `order_key` + `truck_id` | ❌ |
| 6 | `dashboard/action` · `collected` | `{ status: 'collected', paid_at, collected_at, status_before_collected }` | `order_key` + `truck_id` | ⚠️ **Reads first, does not filter** |
| 7 | `dashboard/action` · `undo_collected` | `{ status: revertTo, … }` | `order_key` + `truck_id` | ⚠️ **Reads first, does not filter** |
| 8 | `dashboard/action` · `edit` | `{ …, status: 'modified', … }` | `order_key` (+ truck) | ❌ |
| 9 | `dashboard/action` · `time_adjust` | `{ slot: newSlot, status: 'confirmed' }` | 🔴 **`order_key` ONLY — no `truck_id`** | ❌ |
| 10 | `lib/orders/reject-order.ts` · `rejectOrder` | `{ status: 'rejected', rejection_reason }` | `order_key` + `truck_id` | ❌ |
| 11 | `api/orders/cancel` · customer cancel | `{ status: 'cancelled', cancellation_reason: 'Customer cancelled' }` | `order_key` (+ guards above) | ⚠️ **Reads + an allow-list, then writes** |
| 12 | `api/events/action` · event cancel | `{ status: 'cancelled', cancellation_reason }` | 🔴 **`.in('order_key', keys)` — a BULK write** | ⚠️ **Selects `.in('status', ['confirmed','pending'])`, then writes unfiltered** |

**Plus creation, which is not a transition:** `place_order_atomic` inserts `status` from its `p_status`
parameter — the submit path's `autoAccepted ? 'confirmed' : 'pending'`. **READ.**

## The writes, quoted

```ts
// 1  confirm
await supabase.from('orders').update({ status: 'confirmed' }).eq('order_key', orderKey).eq('truck_id', truck.id)
// 6  collected — the read that feeds `fromStatus` happened earlier in the branch, not in this filter
const { error: collectErr } = await supabase.from('orders').update({ status: 'collected', paid_at: now, collected_at: now, ...(fromStatus ? { status_before_collected: fromStatus } : {}) }).eq('order_key', orderKey).eq('truck_id', truck.id)
// 9  time_adjust — 🔴 NOTE THE MISSING truck_id
await supabase.from('orders').update({ slot: newSlot, status: 'confirmed' }).eq('order_key', orderKey)
// 10 reject
await supabase.from('orders').update({ status: 'rejected', rejection_reason: rejectionReason || null }).eq('order_key', orderKey).eq('truck_id', truck.id)
// 12 event cancel — bulk, and the status filter is on the SELECT, not the UPDATE
await supabase.from('orders').update({ status: 'cancelled', cancellation_reason: `Event cancelled…` }).in('order_key', orderKeys)
```

🔴 **SITE 9 IS SCOPED BY `order_key` ALONE.** Every other order write in that route carries
`.eq('truck_id', truck.id)`. ⚠️ **Not exploitable as a cross-truck write in practice** — `orderKey` is an
unguessable uuid and the handler is already truck-authenticated — **but it is the one write in the file
that would not stop a wrong key from touching another truck's row.** ⚠️ **Reported as found; it is not
part of the race question and I did not chase it further.**

## The one guard that does exist, and exactly what it covers

```ts
    // ── Offline-replay conflict guard (Phase 1) ───────────────────────────────
    if (Array.isArray(body.expected_from) && orderKey && action !== 'manual') {
      const { data: cur } = await supabase.from('orders').select('status').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (cur && !body.expected_from.includes(cur.status)) {
        return NextResponse.json({ error: 'conflict', current_status: cur.status }, { status: 409 })
      }
    }
```

**And the set it checks against. READ — `lib/native/orderGate.ts:38`:**

```ts
export const STATUS_REPLAY_EXPECTED_FROM = ['pending', 'confirmed', 'modified', 'cooking', 'ready', 'collected']
```

🔴 **SO IT ONLY BLOCKS A REPLAY LANDING ON A TERMINAL ORDER.** `cancelled` and `rejected` are the two
statuses absent from that list — **every live status is in it**, so a replay of `cooking` onto an order
already `ready` passes the guard and overwrites. ⚠️ **AND IT IS OPT-IN AND A READ-THEN-CHECK:** online
requests omit `expected_from` entirely, and even when present the row can change between the `select` and
the `update`. **It narrows a window; it closes nothing.**

---

# 2 · WHAT IS CONCURRENTLY REACHABLE TODAY, AND BY WHOM

⚠️ **SURFACES READ SEPARATELY, as instructed.** The **dashboard** (`app/dashboard/[token]/page.tsx`) and
the **KDS** (`app/dashboard/[token]/kds/page.tsx`) each build their own calls; I read both. The
**customer** cancel page and route are a third, read on its own. **No fact below is carried between them.**

✅ **The KDS and the dashboard hit the SAME endpoint with the SAME constant** — `kds/page.tsx:45` imports
`gatedAction, STATUS_REPLAY_EXPECTED_FROM, PLAIN_PAID_ACTIONS` from `lib/native/orderGate`, and its reject
call at `:1256-1257` passes `expectedFrom: STATUS_REPLAY_EXPECTED_FROM`. **So they are two clients of one
handler, not two implementations.**

| Pair | What happens today | Would anything notice? |
|---|---|---|
| **Two dashboards, same truck** | Both write unconditionally. **Last writer wins.** A Confirm and a Reject a second apart leave whichever landed second | ❌ **Nothing.** Both get 200 and a green toast. The loser's operator sees their action "succeed" |
| **KDS `cooking` vs dashboard `ready`** | Same. Both 200 | ❌ Nothing. ⚠️ **The board self-corrects on the next fetch**, so it reads as a UI glitch rather than a lost write |
| **Offline replay landing late** | ⚠️ **Partly guarded.** 409 if the order is now `cancelled`/`rejected`; **silently applied** for any live-status change | ✅ **On 409 only** — the outbox flags the op `'conflict'` for review (`lib/native/outbox.ts:181`) and the overlay drops it (`useOfflinePaymentOverlay.ts:72`). ❌ Otherwise nothing |
| 🔴 **Customer cancel vs operator confirm** | **Two different routes, no shared lock.** The customer route reads, checks its allow-list, then writes; the operator route writes blind. **Whichever `update` lands last wins** — and BOTH have money side effects (§3) | ❌ **Nothing.** The customer sees "Order cancelled", the operator sees "confirmed" |
| **Event cancel vs any operator action** | The bulk write filters `.in('order_key', …)` from a list selected moments earlier. An order confirmed in between **is still cancelled** | ❌ Nothing |
| **Future sweep vs operator confirm** | 🔴 **The case this read exists for. §4** | ❌ Nothing today |

⚠️ **CANNOT DETERMINE how often any of these actually collide on Gusto's traffic.** No telemetry
distinguishes a lost write from a normal one. **What would settle it:** `action_audit_log` rows for one
`order_key` where two different `action` values are seconds apart —
`select order_key, action, actor_kind, created_at from action_audit_log order by order_key, created_at;`

---

# 3 · 🔴 THE ASYMMETRY — ranked by what a lost race actually costs

**READ from each branch. This is the ranking you asked for, worst first.**

### Tier 1 — MONEY MOVES, AND IT CANNOT BE UNDONE FROM HERE

| Transition | Side effects beyond the column | Why it is worst |
|---|---|---|
| 🔴 **`confirm`** | **`captureOnConfirmation` — TAKES THE MONEY** · customer email | **A charge on a Connect DIRECT account. The platform cannot refund it; only the truck can.** A confirm that lost the race still captured |
| 🔴 **`time_adjust`** | **The same capture** (`trigger: 'time_adjust'`), writes `status: 'confirmed'` unconditionally · slot move · email | **A capture site that does not look like one.** Offered on pending orders, so "+10m" is a confirmation |
| 🔴 **`collected`** | **Books a ledger row (money IN)** · `paid_at`, `collected_at` · audit | The ledger write **fails OPEN** — the order completes even if the money record does not, and the response carries `paymentWarning` |
| 🔴 **`undo_collected`** | **DELETES a payment row** · `logActionOrThrow` **before** the destruction | **Destroys evidence.** It is the only transition that fails CLOSED on a logging failure, deliberately |

### Tier 2 — MONEY IS GIVEN BACK, IRREVERSIBLY IN ONE DIRECTION

| Transition | Side effects | Why it matters here |
|---|---|---|
| 🔴 **`reject`** | **Releases the card hold** · slot unbook · email · `hold_release` in the response | 🔴 **THE SWEEP'S TRANSITION.** A released authorisation **cannot be re-taken** — the customer must be asked to pay again |
| 🔴 **`cancel`** (operator) | Payment state read · **release** · optional **refund** · slot unbook · email | A refund is money out and is not reversible |
| 🔴 **`cancel`** (customer route) | **Release** · slot unbook · email | Same, on a surface with no operator present |
| ⚠️ **event cancel** (bulk) | Bulk status + emails · **NO payment call of any kind** | **Already a recorded money-stranding defect**, unchanged by anything here |

### Tier 3 — RECOVERABLE

| Transition | Side effects |
|---|---|
| `ready` | Email (deferred ~4s behind an undo toast on the dashboard; immediate from the KDS) |
| `edit` (`'modified'`) | Items, totals, slot, contact · repricing · `payment_status` recalc |
| `unready`, `cooking` | ⚠️ **Status only. Nothing else.** A lost write here costs a board refresh |

🔴 **THE RANKING IN ONE LINE: a lost `cooking` costs nothing, a lost `ready` costs an email, a lost
`reject` costs a hold the truck cannot get back, and a lost `confirm` costs a charge the platform cannot
refund.** ⚠️ **And the sweep-versus-confirm race is the one that crosses two tiers at once** — the sweep's
release (Tier 2) landing on an order the operator's confirm (Tier 1) has just captured, or about to.

---

# 4 · THE NARROW OPTION — what a sweep-only guard closes, and what it misses

**The shape: the sweep's own update carries `.eq('status', 'pending')`, and it acts only if a row matched.**

## ✅ What it closes

🔴 **THE EXPENSIVE ONE.** Operator confirms → status becomes `confirmed` → the sweep's guarded update
matches **zero rows** → the sweep does not reject, **and therefore never reaches the release call**. **The
hold survives, and the capture the confirm performed stands.** ✅ **That is the money outcome you are
protecting, and the narrow guard does protect it — provided the release is gated on the update having
matched, not merely on the update not erroring** (§5).

✅ **It also closes the same race against `cooking`, `ready`, `collected`, `cancel` and a manual
`reject`** — all of them move the row off `pending`, so all of them win the guard.

✅ **And it touches NO existing path.** Sites 1–12 keep today's behaviour byte for byte. **On a live
trading truck that is the whole argument for it.**

## ⚠️ What it leaves open

**(a) 🔴 THE READ-TO-SIDE-EFFECT WINDOW IS NOT CLOSED, IT IS MOVED.** The guard makes the *status write*
atomic. Everything after it is not:

```
   guarded UPDATE … WHERE status='pending'   ← atomic, wins or matches nothing
   ─────────────── the window ───────────────
   resolveEmailPaymentState                  ← (in the current ordering, this runs BEFORE the update)
   releaseHoldForTerminalOrder → Stripe      ← a network call, hundreds of ms
   removeOrderFromProductionSlot
   notifyCustomer
```

**An operator confirming inside that window gets `confirmed` on an order whose hold is already being
released.** ⚠️ **The capture would then find nothing to take.** **The guard shrinks this window from
"the whole sweep run" to "one Stripe round trip", and does not remove it.**

⚠️ **THE ORDERING GIVES ONE PARTIAL PROTECTION IN THE OTHER DIRECTION, and it is worth knowing:**
`releaseHoldForTerminalOrder` **re-reads the draft and refuses if the ledger shows a capture**. So *confirm
captured first, then the sweep released* is caught by the ledger check. **The unprotected order is: sweep
rejects and releases, then the operator's confirm lands and captures nothing.**

**(b) It does nothing for the six operator-versus-operator races in §2.** Two dashboards, a KDS and a
dashboard, and the customer-cancel-versus-confirm pair all stay exactly as they are. ⚠️ **That is the
deliberate trade of the narrow option, not an oversight in it.**

**(c) The event-cancel bulk write stays unguarded** — it selects on status and updates without it, so it
can still cancel an order that moved in between.

**(d) A guard on `status` alone does not check the OFFLINE MARKER.** The sweep's row set is chosen by
`truck_events.offline_no_autoaccept_until`, which `/api/heartbeat` can null at any moment. **The order is
genuinely still `pending`, so the guard passes and the sweep rejects an order whose truck just came back.**
🔴 **This is the race the narrow guard cannot see**, because the condition that changed is on a different
table. **A predicate that re-checks the marker in the same statement would close it; `.eq()` chaining
cannot express a join.**

---

# 5 · DOES THE CLIENT TELL YOU WHETHER A GUARDED UPDATE MATCHED?

🔴 **NOT BY DEFAULT, AND THE TRAP IS ALREADY DOCUMENTED IN THIS CODEBASE.** A PostgREST `update` that
matches zero rows returns **`error: null`** and `data: null`. **A plain `const { error } = await …update(…)`
cannot distinguish "updated" from "matched nothing".** ⚠️ **That is exactly the defect found earlier this
session on the event-cancel path**, and it is why sites 6, 7 and 12 above check `error` and still learn
nothing about the row count.

✅ **THE PATTERN THAT DOES WORK ALREADY EXISTS IN THIS CODEBASE — `app/api/manage/route.ts`. READ:**

```ts
        .update({ name: trimmed }).eq('id', id).eq('truck_id', truck.id).select().single()
```
```ts
      const { data, error } = await supabase.from('bundles_db').update(fields).eq('id', id).eq('truck_id', truck.id).select().single()
```

**`.select().single()` after an update returns the updated row and raises `PGRST116` when zero rows
matched** — so `error` becomes non-null precisely when the guard refused. ⚠️ **`.select()` without
`.single()` returns an ARRAY instead**, and `data.length === 0` is then the refusal signal — no error
at all, which is the quieter of the two.

⚠️ **NEITHER FORM IS USED ON ANY `orders.status` WRITE TODAY.** All 12 sites either ignore the result or
check `error` alone. **INFERRED FROM ABSENCE** — `grep -rn "\.update(.*)\.select("` over `app lib` returns
eight hits, **all in `app/api/manage/route.ts`, none on `orders`.**

⚠️ **A third option exists and is not used anywhere:** `{ count: 'exact' }`. The only `count: 'exact'`
uses in the repo are `head: true` **reads** in the admin provisioning and delete routes.

---

# 6 · EXISTING CONDITIONAL WRITES AND LOCKS

## ✅ THERE IS ONE, AND IT IS ON `orders`

🔴 **`assign_buzzer_atomic` takes a real row lock. READ —
`supabase/migrations/20260804_assign_buzzer_atomic.sql`:**

```sql
   where order_key = p_order_key and truck_id = p_truck_id
   for update;
...
     where truck_id = p_truck_id
       ...
     for update;
```

**Its header states the reasoning, which is the argument for the pattern:**

> *"ONE TRANSACTION, so buzzer 7 is never on two orders and never on neither. Phase 1 did this as two
> sequential statements from the route with the clear deliberately first, accepting a small window in
> which the number could appear free while a customer held it. **That window is closed here.**"*

✅ **So the precedent for "a window we accepted, then closed with a `security definer` function holding
`FOR UPDATE`" is already set, on this exact table, for a strictly less costly field than status.**
⚠️ **`pg_advisory_lock` appears nowhere** — `grep -rn "pg_advisory"` over the migrations returns nothing.
**The two `for update` hits are both in that one file.**

## `place_order_atomic`

⚠️ **It is an INSERT, not a compare-and-set**, and it takes **no** lock of its own —
`grep -n "advisory\|for update\|lock"` over `20260804_place_order_atomic_placed_at.sql` returns nothing
about locking. **It gets its atomicity from being one statement inside one function**, writing `status`
from its `p_status` parameter. ⚠️ **CANNOT DETERMINE whether an earlier revision locked;** I read the
latest of the four `place_order_atomic` migrations.

## `increment_event_order_counter` / `increment_order_counter`

**The counter RPCs serialise by being a single `update … returning` inside a function** — the manual's own
note is *"The DB serialises; no client-side retry."* ⚠️ **That is atomicity by single-statement, not a
compare-and-set:** they always succeed and always advance. **They are a precedent for "put it in a
function", not for "refuse when the precondition fails".**

**Summary of the three approaches present:** ✅ `FOR UPDATE` row lock (buzzer) · ✅ single-statement
atomicity (counters, `place_order_atomic`) · ❌ **no compare-and-set anywhere, and no advisory lock.**

---

# 7 · WHAT AN OPERATOR WOULD SEE IF A GUARD REFUSED

**Traced end to end for `confirm`, on the DASHBOARD.** ⚠️ **The KDS builds its own calls; I read that it
imports the same helpers, but this trace is the dashboard's.**

**1 · The call — `app/dashboard/[token]/page.tsx`, `doAction`. READ:**

```ts
      const result=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action,order_key:orderKey,…},kind:'status',order_key:orderKey,online:isOnline(),expectedFrom:STATUS_REPLAY_EXPECTED_FROM})
      await handleGateResult(result,action,orderKey)
```

**2 · The result handler — `lib/native/useGatedActionResult.tsx`. READ:**

```ts
    const data = result.data ?? {}
    if (!result.ok) throw new Error(data.error)
```

**3 · The caller's catch. READ:**

```ts
    }catch(err:any){showToast(err.message||'Failed','error')}finally{setActionLoading(null)}
```

## The answer, by case

| If a refused guard produced… | The operator sees |
|---|---|
| **A non-2xx** (e.g. 409 with `{ error: 'conflict' }`) | ✅ **A red toast carrying the server's own message.** The path exists and is used today by the replay guard |
| **A 200 with a flag in the body** | 🔴 **SUCCESS.** `result.ok` is true, so the green label toast fires — *"Order #12 confirmed"* — for an action that did not take |
| **A 200 and nothing** | 🔴 **SUCCESS, and worse: silent.** ⚠️ **THE BOARD WOULD LOOK RIGHT TOO** — the client's optimistic state, then a refetch, and the operator would read the corrected status as someone else's action |

⚠️ **ONE PRECEDENT SHOWS THE 200-WITH-A-FLAG CASE HAS ALREADY BITTEN, AND HOW IT WAS ANSWERED.** The
`collected` branch returns 200 with `paymentWarning` when the ledger write fails, and the handler
deliberately **replaces** the success toast:

> *"🔴 `result.ok` IS TRUE HERE AND THE ACTION DID PARTLY SUCCEED… **IT REPLACES THE SUCCESS TOAST, never
> sits beside it.** Two toasts for one tap — one green, one red — is the operator reading whichever their
> eye lands on, and the green one is the lie."*

✅ **So a 200-with-a-flag CAN be surfaced — but only because someone wrote a branch for it.** **A new flag
with no branch renders as success.**

---

## Marking summary

| Claim | Status |
|---|---|
| The 12 write sites, their filters and quotes | ✅ **READ** |
| No site filters on current status | ✅ **READ** — every WHERE clause quoted |
| Site 9 lacks `truck_id` | ✅ **READ** |
| `STATUS_REPLAY_EXPECTED_FROM` excludes only the terminal statuses | ✅ **READ** |
| `assign_buzzer_atomic` uses `FOR UPDATE` | ✅ **READ** |
| No advisory lock, no compare-and-set | ⚠️ **INFERRED FROM ABSENCE** — searches named in §6 |
| `.update().select().single()` exists only in `manage` | ⚠️ **INFERRED FROM ABSENCE** — search named in §5 |
| Zero-row updates return no error | ✅ **READ** — PostgREST behaviour, and the pattern the codebase uses to detect it |
| The client refusal trace | ✅ **READ** — dashboard only; the KDS was not traced end to end |
| **Whether any of these races has occurred** | ⚠️ **CANNOT DETERMINE.** The audit-log query in §2 would settle it |
| **What the sweep would actually do** | ⚠️ **UNOBSERVED — no sweep exists.** §4 is reasoning over source, not behaviour |
| Whether an undiscovered SQL writer exists | ⚠️ **CANNOT DETERMINE.** The `pg_proc` query in §1 settles it |

**Surfaces, kept apart:** §2 and §7 name the **dashboard**, the **KDS** and the **customer** cancel route
separately, and §7's trace is the dashboard's alone. §1 sites 11 and 12 are the **customer** route and the
**event** route, each read on its own.

⚠️ **Pizzeria Gusto runs every Tier 1 and Tier 2 transition above today.** Nothing in §3 is hypothetical;
only §4 is.

**No instruction contradicted another, and no span of the prompt arrived garbled.**

---

# Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** this file was
written — never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. ⚠️ **This report is
the only file written**, so there is no source census — nothing else was touched. The result, the
non-ASCII census and the carrier-aware per-base variation-selector figures are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
