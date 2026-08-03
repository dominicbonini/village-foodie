# Buzzer phase 2 — offline replay, atomic two-row write, conflict resolution

**Date:** 2026-08-03 · `tsc --noEmit` clean · all new/small files lint clean · both big pages back at
their exact pre-change lint baselines (dashboard 93, KDS 16). Nothing run beyond `tsc`, `eslint`, and
read-only PostgREST queries. **No migration executed.**

---

## 0. Prompt integrity — and one thing the brief did not name

Nothing arrived garbled. The brief was long but coherent and actionable in one pass; it did not need
splitting.

⚠️ **§5 required persistent state that was not named, and I added it: `orders.buzzer_lost_at`
(nullable, no backfill).** §5 says to follow `CapacityBreachBanner`'s pattern, and that pattern is
**server-computed** — `detectCapacityBreaches` → `/api/dashboard` → client renders with local
dismissal. Without a stored fact there is nothing for the server to compute. The alternative — surfacing
the loss from `drainOutbox` at replay time — would mean the loser is visible only on the one device that
happened to run the drain, does not survive a reload, and never reaches the other devices looking at the
same board. It would also need a new cross-component channel, which is precisely what "follow the
existing pattern rather than inventing one" rules out. Flagging it rather than burying it.

---

## 1. DIAGNOSIS

### (a) `place_order_atomic` — current definition and what changes

Live definition is
[20260728_orders_total_minor_deal_savings.sql:59-130](supabase/migrations/20260728_orders_total_minor_deal_savings.sql#L59-L130):
7 params (`p_order jsonb, p_final_slot text, p_status text, p_event_id uuid, p_truck_id text,
p_event_date date, p_unit_rows jsonb`), returns `jsonb`, and does four things in one transaction —
counter increment via nested RPC, one `orders` INSERT with a **fixed 20-column list**, a
DELETE-then-INSERT-loop rebuild of `production_slot_usage`, and a jsonb identity payload back.

**What changes to add `placed_at`: exactly two lines** — `placed_at` appended to the INSERT column list,
and `now()` appended to the VALUES list. Signature, order-number logic, capacity rebuild, RETURNING and
return shape all unchanged. This is a **body change, not a signature change**.

**Does any caller pass `p_order` keys the function ignores?** Yes — and it matters here. The single
caller ([app/api/orders/submit/route.ts:904-912](app/api/orders/submit/route.ts#L904-L912)) builds
`p_order` with `customer_name, customer_email, customer_phone, order_type, items, deals, discount_code,
subtotal, discount_amt, total, notes, van_id, payment_status`. Every one is consumed. **But the reverse
is the trap: keys the function does not name are silently dropped**, which is why `placed_at` could not
be smuggled through `p_order` in phase 1 and why this needs a `create or replace`.

### (b) Outbox record shape, enqueue, replay loop, and the `'edit'` kind

Record — [lib/native/outbox.ts:64-76](lib/native/outbox.ts#L64-L76): `op_id, kind, order_key, url, body,
seq, client_ts, attempts, provisional_id, state, last_error?`. One Capacitor Preferences key per op
(`hg_outbox_op_<op_id>`), single atomic `set` per enqueue.

Enqueue — [:115-146](lib/native/outbox.ts#L115-L146): coalesces `'stock'` ops on the synthetic key;
everything else is appended with `seq: await nextSeq()` and `client_ts: Date.now()`.

Replay — `drainOnce` at [lib/native/orderGate.ts:179-231](lib/native/orderGate.ts#L179-L231): serialized
via `drainInFlight`, FIFO by `seq`, malformed-guard, copy-on-write, POST, branch on outcome.

**`OutboxKind` allowed `'create' | 'status' | 'edit' | 'stock'`.** ⚠️ **`'edit'` does nothing.** A grep
for `gatedAction({` returns ten call sites and **none** passes it; the card's edit path uses a bare
`fetch` ([page.tsx:1562](app/dashboard/[token]/page.tsx#L1562)) and is not offline-capable at all. It is
a declared type member with no producer and no consumer — which is exactly why the brief was right that
reusing it would mean a first outing for two untested things at once. I added `'buzzer'` instead.

### (c) Replay failure handling — quoted

[lib/native/orderGate.ts:200-227](lib/native/orderGate.ts#L200-L227):

```ts
} catch (e: unknown) {
  const last_error = `network: ${e instanceof Error ? e.message : 'thrown fetch (no response)'}`
  if (syncing.attempts >= MAX_ATTEMPTS) { await saveOp({ ...syncing, state: 'conflict', last_error }); conflicts++; continue }
  await saveOp({ ...syncing, state: 'pending', last_error })
  break
}
if (res.ok) {
  await removeOp(syncing.op_id); synced++
} else {
  const data = await res.json().catch(() => ({} as Record<string, unknown>))
  const last_error = `HTTP ${res.status}${(data as any)?.error ? ` — ${(data as any).error}` : ''}`
  if (res.status === 409) {
    await saveOp({ ...syncing, state: 'conflict', last_error }); conflicts++
  } else if (syncing.attempts >= MAX_ATTEMPTS) {
    await saveOp({ ...syncing, state: 'conflict', last_error }); conflicts++
  } else {
    await saveOp({ ...syncing, state: 'pending', last_error })
  }
}
```

**Retried, then flagged, then surfaced — never silently dropped.** `MAX_ATTEMPTS = 5`. A `'conflict'` op
is removed from the actionable count but kept for review
([outbox.ts:169-174](lib/native/outbox.ts#L169-L174)) and only ever removed by explicit operator
dismissal ([:181-184](lib/native/outbox.ts#L181-L184)). It reaches the operator as a red banner —
[OfflineBanner.tsx:89-95](components/native/OfflineBanner.tsx#L89-L95), *"⚠ N orders couldn't sync —
needs review"* — which is **native-only** and names a **count, not an order**.

### (d) `CapacityBreachBanner` — quoted in §0/§5; the mechanics

[components/dashboard/CapacityBreachBanner.tsx](components/dashboard/CapacityBreachBanner.tsx): a
full-width `bg-red-600` strip, `⚠ N slots over capacity — review` plus a prose line naming order numbers,
and a Dismiss link. Dismissal is **one signature for the whole set** —
`breachSignature()` hashes every breach into a string, the parent holds one `dismissedSig`, and
`if (sig === dismissedSig) return null`. Mounted once, at
[page.tsx:2235](app/dashboard/[token]/page.tsx#L2235), above the board, fed by `data.capacityBreaches`
from `/api/dashboard`.

⚠️ **That one-signature dismissal is exactly what §5 forbids for buzzers**, and correctly — see §5.

### (e) Is `placed_at` populated today? — live query, and a gap

| | Rows |
|---|---|
| `placed_at IS NULL` | **352** |
| `placed_at IS NOT NULL` | **4** |

All 352 nulls are pre-migration rows — expected, and deliberately not backfilled. All 4 populated rows
are from today.

⚠️ **All four are the OPERATOR path, and the customer path is UNVERIFIED in production.** Every populated
row has `placed_at` a beat *before* `created_at` (e.g. `10:42:13.218` vs `10:42:13.949`), which is the
signature of client-minting at the tap. The customer path's phase-1 write happens *after* the RPC insert,
so it would show `placed_at` **after** `created_at`. No such row exists — no customer order has been
placed since the migration ran. (`source` cannot distinguish the paths; both default to `'web'`.)
Verification item 3 below covers it.

---

## 2. `placed_at` FOLDED INTO THE RPC

**Migration: [supabase/migrations/20260804_place_order_atomic_placed_at.sql](supabase/migrations/20260804_place_order_atomic_placed_at.sql)**

**DEPLOY-COUPLED — run BEFORE deploying — and it fails SILENTLY if skipped.** Same class as its
predecessor, whose header records the trap: a body change means the 7-param signature still resolves,
customer orders still save, and the column is simply NULL forever with nothing in any log. Worse than
last time, because the compensating UPDATE that used to set it is deleted in the same deploy. Applying
it early is harmless — the old build's UPDATE just overwrites with a value ~1ms later.

The customer path stays **server-minted**, unchanged, with the reasoning kept at both the SQL and the
route. The phase-1 block at `app/api/orders/submit/route.ts` is deleted and replaced with a pointer
comment.

---

## 3. OFFLINE `set_buzzer`

**New kind `'buzzer'`** — [lib/native/outbox.ts:47-58](lib/native/outbox.ts#L47-L58). Not `'edit'`.

🔴 **Never coalesced**, unlike `'stock'`, and the reason is on the type:

> A buzzer number is a PHYSICAL FACT about a pager in a customer's hand; it cannot be re-derived from
> anything. Dropping an older op for a newer one on the same order would be safe only if the last write
> were the whole truth, and it is not — the intermediate assignment may be the one that raced another
> device. Every op replays.

**What the op carries:** `order_key` (a real one, so it passes the drain's malformed-guard unaided),
`buzzerNumber` in the body, and — via a new `queuedExtra` on `gatedAction`
([orderGate.ts:126-140](lib/native/orderGate.ts#L126-L140), same queued-only contract as the existing
`expectedFrom`) — `placedAt` and `replay: true`. **Neither rides on an online request**, where the
operator was present and their decision is not something to arbitrate.

`placedAt` is **repair-only** and load-bearing rather than decorative: the RPC arbitrates on the *row's*
value, and the handler writes the carried one **only if the row has none**
([action/route.ts](app/api/dashboard/action/route.ts), guarded by `.is('placed_at', null)` so it can
never overwrite).

### What happens to a failed buzzer replay, and what the operator sees

| Outcome | Op | Operator sees |
|---|---|---|
| 2xx, won | removed | nothing further — the number is on the board |
| **2xx, LOST on `placed_at`** | **removed** | 🔴 **the red per-order banner** — *"Order #12 doesn't have a buzzer"* + Dismiss / **Assign** |
| transient 5xx / thrown fetch, < 5 attempts | `'pending'`, retried next drain | offline/sync banner |
| ≥ 5 attempts, or 409 | `'conflict'`, **kept for review** | *"⚠ N orders couldn't sync — needs review"* (native) |

🔴 **A lost replay returns 2xx, deliberately.** `assigned: false` means conflict resolution ran and did
exactly what it was asked. A 409 would flag the op `'conflict'` and leave it queued for a human to
re-run a decision already made correctly. The operator is told through the banner instead — which names
the order and offers a one-tap fix, rather than a dead queue entry naming a count.

**Nothing is silently dropped on any path.**

---

## 4. CONFLICT RESOLUTION — the atomic two-row RPC

**Migration: [supabase/migrations/20260804_assign_buzzer_atomic.sql](supabase/migrations/20260804_assign_buzzer_atomic.sql)** ·
**DEPLOY-COUPLED** (deploy-first gives PGRST202 on every buzzer write **and** 42703 on the named select,
which blanks the board).

**Atomic: confirmed.** One `plpgsql` function, one transaction — so buzzer 7 is never on two orders and
never on neither. Phase 1's two sequential UPDATEs from the route (clear-then-set, with a documented
window) are gone; `lib/buzzer.ts assignBuzzer` is now a single `supabase.rpc('assign_buzzer_atomic', …)`.

```sql
create or replace function assign_buzzer_atomic(
  p_truck_id text, p_event_id uuid, p_order_key uuid, p_buzzer smallint, p_replay boolean default false
) returns jsonb
```

The decision core:

```sql
  if v_holder_key is null then
    v_assigned := true;                              -- uncontended
  elsif not p_replay then
    -- ONLINE, operator-confirmed take. No arbitration, and NO buzzer_lost_at on the holder: the
    -- operator was shown "Buzzer 7 is with order #15 (Sarah)" and chose.
    update orders set buzzer_number = null where order_key = v_holder_key and truck_id = p_truck_id;
    v_cleared := …; v_assigned := true;
  elsif v_target_ts > v_holder_ts then
    -- REPLAY, target taken LATER → target keeps it, holder loses it and is FLAGGED (only while in use).
    update orders set buzzer_number = null,
           buzzer_lost_at = case when status = any(v_in_use) then now() else null end
     where order_key = v_holder_key and truck_id = p_truck_id;
    v_cleared := …; v_lost := …; v_assigned := true;
  else
    -- REPLAY, holder taken LATER (or indistinguishable) → holder keeps it; the TARGET is the loser.
    update orders set buzzer_lost_at = case when status = any(v_in_use) then now() else null end
     where order_key = p_order_key and truck_id = p_truck_id;
    v_lost := …; v_assigned := false;
  end if;
```

with `v_target_ts` / `v_holder_ts` both `coalesce(placed_at, created_at)` — **the NULL fallback for
pre-migration rows, commented, no backfill.**

**Ties go to the incumbent**, stated in the SQL: equal timestamps mean we cannot tell who was later, and
the row already in the database is what the board has been showing; churning it on a coin-flip moves a
pager for no reason.

### 🔴 The clock-dependence note, recorded in the migration

> ⚠️ IF YOU ARE HERE TO "FIX THE INCONSISTENCY" BY MAKING STATUS REPLAY CLOCK-BASED TOO: DO NOT.
> Offline replay ordering everywhere else is `seq` — an explicitly clock-independent per-device counter
> (lib/native/outbox.ts:27) — and `client_ts` is stored but marked "display only — NEVER used for
> reconciliation" (lib/native/outbox.ts:62). Device clocks lie.
> The asymmetry is a judgement about BLAST RADIUS, not an oversight:
>   • A wrong buzzer resolution is a VISIBLE OPERATIONAL ANNOYANCE… self-correcting because a human is
>     standing there holding the physical object.
>   • A wrong STATUS replay CORRUPTS THE ORDER PIPELINE… Nobody is standing over it and nothing
>     self-corrects.
> So: buzzers may use wall-clock, because the alternative (seq, not comparable across devices) cannot
> answer "who took this pager most recently" at all. Status must not.

---

## 5. THE LOSING ORDER'S BANNER

[components/dashboard/BuzzerLostBanner.tsx](components/dashboard/BuzzerLostBanner.tsx), mounted at
[page.tsx](app/dashboard/[token]/page.tsx) directly beneath `CapacityBreachBanner`, fed by
`data.buzzerLosses` computed server-side in
[app/api/dashboard/route.ts](app/api/dashboard/route.ts) from the orders already fetched (no extra
query):

```ts
buzzerLosses: (orders || [])
  .filter((o: any) => o.buzzer_lost_at && o.buzzer_number == null && BUZZER_IN_USE_STATUS_SET.has(o.status ?? ''))
```

- **"Order #12 doesn't have a buzzer"**, plus the customer name and a plain-English cause.
- **Dismiss** and **Assign**; Assign looks the order up live in `orders` and opens the standard `BuzzerGrid` for it. Both ≥44px.
- **Collected / cancelled / rejected orders get no banner** — the `BUZZER_IN_USE_STATUS_SET` filter, the same set the grid uses. Their buzzer was already out of the in-use set.
- **All buzzers out is not a dead end**: Assign opens the normal grid, which goes all-red, states *"All N buzzers are out…"* and stays live — taking one from another order remains valid.

### ✅ Dismissal is PER ORDER — confirmed

The parent holds `dismissedBuzzerLosses: Set<string>` of `order_key`s, and the banner filters
`losses.filter(l => !dismissedKeys.has(l.order_key))`, rendering **one row per order**. Dismissing #12
adds only `#12`'s key; #15 arriving later in the same service is a different key and shows normally.

That is a **deliberate divergence from `CapacityBreachBanner`**, documented in the component: its single
`breachSignature` → single `dismissedSig` is right for "the state of the board", reviewed in one go, and
wrong here, where each row is a different customer holding a different pager. A blanket flag would
silently swallow the second conflict — the failure mode the brief called out.

⚠️ **Dashboard only**, matching `CapacityBreachBanner`'s mount. The KDS does not render it. Handing out
pagers happens at the hatch, on the orders screen; a cook does not. `/api/dashboard` already returns
`buzzerLosses` to both surfaces, so mounting it on the KDS later is a one-line change — say the word.

---

## 6. Verify on screen, in priority order

**Run both migrations first.** Then:

1. **The board still loads.** Dashboard with an event selected — orders render. A blank board means a named select is failing; check the log for `[dashboard] EVENTS QUERY FAILED`. This is the only failure here invisible from the UI.
2. **Online buzzer writes still work end to end** (the RPC replaced the two UPDATEs): assign, switch, deselect, and take-from-another-order with the confirm. All must behave exactly as phase 1.
3. **`placed_at` on the customer path** — the gap from §1(e). Place one *customer* order, then `select id, placed_at, created_at from orders order by created_at desc limit 1;` — `placed_at` non-null and **equal to or after** `created_at` (server-minted inside the insert). Contrast an operator walk-up, where it lands just *before*.
4. **Offline queue, single device** (native): airplane mode, assign a buzzer. Expect *"Buzzer 7 saved on this device — will sync when back online"*, the cell stays red, and the chip persists. Reconnect → it syncs and the value holds.
5. **🔴 The two-device offline conflict — the headline case.** Two native devices on the same event, both offline:
   - Device A: assign buzzer 7 to order X. Note the time.
   - **Wait ~30s** (the whole test is that `placed_at` differs — same-second taps hit the tie rule and the incumbent keeps it).
   - Device B: assign buzzer 7 to order Y.
   - Bring **A online first**, let it drain. Then **B**.
   - Expected: **Y keeps buzzer 7** (taken later), X is stripped, and the dashboard shows **"Order #X doesn't have a buzzer"** with Dismiss / Assign.
   - Reverse the reconnect order and the result must be identical — that is the point of arbitrating on `placed_at` rather than on arrival.
6. **Per-order dismissal.** With two losses showing, Dismiss one — the other must remain. Then engineer a third conflict and confirm it appears despite the earlier dismissal.
7. **Assign from the banner.** Tap Assign → the standard grid opens for that order → pick a free number → the banner row disappears (`buzzer_lost_at` cleared by the RPC).
8. **All-out via the banner.** Fill every buzzer, then Assign from a banner row: the grid opens all-red with the "all out" line and cells still tappable.
9. **No banner for a closed order.** Cause a conflict, then collect the losing order before reconnecting — no banner (the in-use filter).
10. **A failed replay is not lost.** Force 5 failures (server unreachable on drain) → the op goes `'conflict'`, stays in the outbox, and the native *"N orders couldn't sync — needs review"* banner appears.

---

## 7. Files changed

**New (3):** [20260804_place_order_atomic_placed_at.sql](supabase/migrations/20260804_place_order_atomic_placed_at.sql) ·
[20260804_assign_buzzer_atomic.sql](supabase/migrations/20260804_assign_buzzer_atomic.sql) ·
[components/dashboard/BuzzerLostBanner.tsx](components/dashboard/BuzzerLostBanner.tsx)

**Modified (8):** [lib/buzzer.ts](lib/buzzer.ts) (assignBuzzer → RPC; result gains `assigned` + `lost`) ·
[lib/native/outbox.ts](lib/native/outbox.ts) (`'buzzer'` kind) ·
[lib/native/orderGate.ts](lib/native/orderGate.ts) (`queuedExtra`) ·
[app/api/dashboard/action/route.ts](app/api/dashboard/action/route.ts) (replay marker, placed_at repair, lost passthrough) ·
[app/api/dashboard/route.ts](app/api/dashboard/route.ts) (`buzzerLosses`) ·
[app/api/orders/submit/route.ts](app/api/orders/submit/route.ts) (compensating UPDATE deleted) ·
[app/dashboard/[token]/page.tsx](app/dashboard/[token]/page.tsx) · [kds/page.tsx](app/dashboard/[token]/kds/page.tsx) (gatedAction + banner)

**Untouched:** `BuzzerGrid.tsx`, `mergeOrders.ts`, the `'edit'` outbox kind, the add-order picker, the
take confirm, colours, the two-channel label, Done, the post-order prompt.

---

## 8. Still outstanding, not applied

The all-taken banner still reads *"All 30 buzzers are out. Tap one to take it from another order."*
Suggested: **"All 30 buzzers are out. Tap one to take it from another order, or tap your own to give it
back."**
