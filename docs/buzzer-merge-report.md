# Two-row writes, offline replay & conflict surfacing — pre-design diagnosis

**Date:** 2026-08-03 · **Branch:** main @ 31247ce · **Mode:** read-only, facts only, no proposals.
Third in the series after [docs/buzzer-diagnosis-report.md](docs/buzzer-diagnosis-report.md) and
[docs/buzzer-flow-report.md](docs/buzzer-flow-report.md).

---

## 0. Prompt integrity

No span of this prompt arrived garbled. All six sections parsed cleanly and are answered below.

One phrase in §5 is answered in two parts rather than one, because the codebase splits it: *"a visual
channel for 'this was auto-resolved, check it'"* exists at **page level** (a dismissible red banner that
names order numbers in prose) but **not at card level**. Both are reported separately in §5.4 so the
distinction is not lost. That is a decomposition, not a repair.

---

## 1. `lib/orders/mergeOrders.ts` — the version guard

### 1.1 The whole file, verbatim

[lib/orders/mergeOrders.ts](lib/orders/mergeOrders.ts), 94 lines:

```ts
// FIX 1 — order-lifecycle integrity: version-guarded merge (replaces blind setOrders(data.orders)).
//
// PROBLEM (audit): the client did `setOrders(data.orders)` on every read (fetchAll / realtime / poll)
// with NO version guard. A stale or out-of-order read therefore overwrote a newer local status →
// an order that was marked ready could revert to confirmed (online: an in-flight read that started
// before the write resolving after a post-write read; offline: the SW cache re-serving a pre-change
// snapshot). Lifecycle must be forward-only unless an explicit undo occurs.
//
// FIX: merge per order_key. Keep whichever row has the NEWER `updated_at` — an OLDER-timestamped read
// can never overwrite a NEWER local status. Undo works naturally: undo_collected / undo_ready bump
// updated_at (via the orders_set_updated_at trigger), so the read reflecting the undo is NEWER and is
// accepted. Membership = the READ's membership (an order absent from the read is dropped — identical
// to today's blind replace, so no lingering removed orders).
//
// BEHAVIOUR-PRESERVING when updated_at is present and monotonic (post-trigger): the normal
// confirm→cooking→ready→collected flow is unchanged (each forward read has a newer ts → accepted);
// only STALE reads (older ts) are rejected. When updated_at is missing/equal (pre-trigger, or two
// same-status reads), it falls back to read-wins for forward/lateral/known-undo moves — today's
// behaviour — with a minimal monotonic BACKSTOP (FIX 3) that blocks only bogus multi-step regressions
// the server never emits (e.g. collected→pending).

/** Minimal shape the merge needs. The dashboard/KDS `Order` satisfies this (order_key + status +
 *  the optional updated_at surfaced from select('*')). Generic so both surfaces reuse it as-is. */
export interface MergeableOrder {
  order_key: string
  status: string
  updated_at?: string | null
}

// Lifecycle rank — forward-only order. Terminal (cancelled/rejected) sit ABOVE the active flow so a
// stale ACTIVE read can never resurrect a terminal order. modified is a confirmed-tier lateral state.
const RANK: Record<string, number> = {
  pending: 0,
  confirmed: 1,
  modified: 1,
  cooking: 2,
  ready: 3,
  collected: 4,
  cancelled: 5,
  rejected: 5,
}
const rankOf = (s: string): number => RANK[s] ?? 0

// The ONLY legitimate backward transitions in the system (explicit operator undo). Whitelisted so the
// monotonic backstop never blocks a real undo:
//   • undo_collected: collected → confirmed | ready | modified
//   • undo_ready:     ready     → confirmed | modified
// Post-trigger these are decided by the version guard (undo bumps updated_at → newer → accepted); the
// whitelist only governs the equal/missing-timestamp fallback.
function isKnownUndo(fromStatus: string, toStatus: string): boolean {
  if (fromStatus === 'collected') return toStatus === 'confirmed' || toStatus === 'ready' || toStatus === 'modified'
  if (fromStatus === 'ready') return toStatus === 'confirmed' || toStatus === 'modified'
  return false
}

/** ms since epoch, or null when the timestamp is absent/unparseable (→ equal/missing branch). */
function parseTs(ts: string | null | undefined): number | null {
  if (!ts) return null
  const t = Date.parse(ts)
  return Number.isNaN(t) ? null : t
}

/** Equal-or-missing timestamp resolution (FIX 3 monotonic backstop + undo whitelist). Returns the
 *  row to keep. Forward/lateral → read wins (today's behaviour). Backward → read wins ONLY if it's a
 *  known undo; otherwise keep local (block a bogus regression / apparent stale revert). */
function reconcileEqual<T extends MergeableOrder>(local: T, read: T): T {
  const rLocal = rankOf(local.status)
  const rRead = rankOf(read.status)
  if (rRead >= rLocal) return read                          // forward or lateral → read wins (unchanged)
  if (isKnownUndo(local.status, read.status)) return read   // legitimate undo → allow the backward move
  return local                                              // bogus regression → backstop keeps local
}

/**
 * Merge a fresh READ (`incoming`) over current local state (`prev`), guarding against a stale/older
 * read overwriting a newer local status. Membership = `incoming`. Pure; returns a new array.
 */
export function mergeOrders<T extends MergeableOrder>(prev: T[], incoming: T[]): T[] {
  if (!Array.isArray(incoming)) return prev
  if (!Array.isArray(prev) || prev.length === 0) return incoming
  const prevByKey = new Map<string, T>()
  for (const o of prev) if (o && o.order_key) prevByKey.set(o.order_key, o)

  return incoming.map(read => {
    const local = read && read.order_key ? prevByKey.get(read.order_key) : undefined
    if (!local) return read                                 // new to us → take the read
    const tRead = parseTs(read.updated_at)
    const tLocal = parseTs(local.updated_at)
    if (tRead !== null && tLocal !== null && tRead !== tLocal) {
      return tRead > tLocal ? read : local                  // VERSION GUARD (primary): newer wins, older rejected
    }
    return reconcileEqual(local, read)                      // equal/missing ts → monotonic backstop
  })
}
```

### 1.2 What the "version guard" is

Three lines — [:87-91](lib/orders/mergeOrders.ts#L87-L91):

```ts
const tRead = parseTs(read.updated_at)
const tLocal = parseTs(local.updated_at)
if (tRead !== null && tLocal !== null && tRead !== tLocal) {
  return tRead > tLocal ? read : local                  // VERSION GUARD (primary): newer wins, older rejected
}
```

It is a **whole-row last-write-wins comparison on a single timestamp**, applied per `order_key`. It does
not merge fields — it picks one of two complete row objects. There is no per-field resolution anywhere in
this file.

### 1.3 Which field decides

**`updated_at`.** Nothing else. Declared optional on the merge's own interface —
[:24-28](lib/orders/mergeOrders.ts#L24-L28):

```ts
export interface MergeableOrder {
  order_key: string
  status: string
  updated_at?: string | null
}
```

`order_key` is the join key ([:82](lib/orders/mergeOrders.ts#L82), [:85](lib/orders/mergeOrders.ts#L85));
`status` is used **only** in the fallback branch.

**The fallback** fires when either timestamp is absent/unparseable or the two are exactly equal
([:92](lib/orders/mergeOrders.ts#L92) → `reconcileEqual`, [:66-72](lib/orders/mergeOrders.ts#L66-L72)).
There it ranks the two statuses on `RANK` ([:32-41](lib/orders/mergeOrders.ts#L32-L41)) and:

- forward or lateral (`rRead >= rLocal`) → **read wins**
- backward and on the undo whitelist ([:50-54](lib/orders/mergeOrders.ts#L50-L54)) → **read wins**
- backward otherwise → **local wins** (the "monotonic backstop")

⚠️ Two properties that bear directly on a two-row buzzer write:

1. **The guard is status-shaped, not field-shaped.** `RANK` and `isKnownUndo` only understand the eight
   fulfilment statuses. A row whose *only* change is a non-status column would sit in the
   equal/missing-ts branch at the same rank as its local copy, and `rRead >= rLocal` → the read wins.
   Correct for a same-timestamp pair, but the arbitration is doing nothing meaningful there.
2. **Membership is the read's** — [:12-13](lib/orders/mergeOrders.ts#L12-L13): *"Membership = the READ's
   membership (an order absent from the read is dropped)."* `mergeOrders` maps over `incoming` only
   ([:84](lib/orders/mergeOrders.ts#L84)); an order present locally but absent from the read vanishes. A
   cleared row that the read does not include is not preserved.

### 1.4 What makes `updated_at` a usable row version

A **BEFORE UPDATE trigger**, not application code —
[supabase/migrations/20260703_orders_updated_at_trigger.sql:20-35](supabase/migrations/20260703_orders_updated_at_trigger.sql#L20-L35):

```sql
create or replace function public.set_orders_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists orders_set_updated_at on public.orders;

create trigger orders_set_updated_at
  before update on public.orders
  for each row
  execute function public.set_orders_updated_at();
```

Rationale, [:3-10](supabase/migrations/20260703_orders_updated_at_trigger.sql#L3-L10):

> WHY: the client merge (lib/orders/mergeOrders.ts) is version-guarded — an OLDER-timestamped read can
> never overwrite a NEWER local status. That guarantee needs `orders.updated_at` to bump on EVERY status
> write. The action route's .update({ status }) calls do NOT set updated_at, and no trigger existed — so
> updated_at was frozen at created_at and could not serve as a row version.
> A BEFORE UPDATE trigger is the MISS-PROOF approach: it covers all ~11 existing status-write sites …
> AND any future write, so no transition can be left unprotected by a forgotten .update() call.

And [:16-18](supabase/migrations/20260703_orders_updated_at_trigger.sql#L16-L18): *"Fires on ANY orders
UPDATE (status, modify, payment) — correct: updated_at becomes a true row version… INSERTs are unaffected
(updated_at keeps its column DEFAULT now(), incl. the place_order_atomic RPC insert)."*

**So `updated_at` is minted by `now()` on the DATABASE SERVER**, on every UPDATE, with no application
involvement and no way to supply a different value through the trigger.

### 1.5 Is there an existing client-minted timestamp or version counter on an order?

**On the order row: NO.** Live schema check (PostgREST OpenAPI, fetched today) — no column matching
`version|lock|rev|etag|seq|xmin|modified` exists on `orders`. See §6.

**Client-minted values that DO exist, and what they are:**

| Value | Where | Client-minted? | Reaches the order row? |
|---|---|---|---|
| `order_key` (uuid) | [AddOrderPanel.tsx:882](components/dashboard/AddOrderPanel.tsx#L882) `newUuid()` | ✅ | ✅ — as the PK, via the upsert at [route.ts:1058](app/api/dashboard/action/route.ts#L1058) |
| `provisional_id` (`'M5'`) | [orderGate.ts:96-103](lib/native/orderGate.ts#L96-L103) | ✅ | ✅ — as `orders.id`, the display number |
| `client_ts` (ms epoch) | [outbox.ts:130](lib/native/outbox.ts#L130) `Date.now()` | ✅ | ❌ — **never sent to the server** |
| `seq` (per-device counter) | [outbox.ts:99-104](lib/native/outbox.ts#L99-L104) | ✅ | ❌ — local ordering only |
| `capacity_ack_at` | [route.ts:1050](app/api/dashboard/action/route.ts#L1050) | ❌ | ✅ — but **server-minted**: the client sends a boolean intent |

The `capacity_ack_at` comment states the rule the codebase applies to client clocks —
[route.ts:1046-1047](app/api/dashboard/action/route.ts#L1046-L1047):

> The TIMESTAMP is server-minted — the client sends a boolean intent, never a time it could backdate.

And `client_ts` is explicitly barred from reconciliation — [outbox.ts:62](lib/native/outbox.ts#L62):

```ts
client_ts: number      // display only — NEVER used for reconciliation
```

**So a client-timestamp last-write-wins scheme has no existing carrier.** `client_ts` exists but is
local-only and marked never-for-reconciliation; every server-side timestamp on an order is minted by
Postgres.

---

## 2. `place_order_atomic` and the multi-row RPC pattern

### 2.1 Signature

Current definition —
[supabase/migrations/20260728_orders_total_minor_deal_savings.sql:59-67](supabase/migrations/20260728_orders_total_minor_deal_savings.sql#L59-L67):

```sql
create or replace function place_order_atomic(
  p_order      jsonb,
  p_final_slot text,
  p_status     text,
  p_event_id   uuid,
  p_truck_id   text,
  p_event_date date,
  p_unit_rows  jsonb
) returns jsonb
language plpgsql
as $$
```

Seven parameters, returns `jsonb`. Defined three times across migrations, each superseding the last:
[20260624](supabase/migrations/20260624_place_order_atomic.sql#L26) →
[20260715](supabase/migrations/20260715_place_order_atomic_drop_drawlist.sql#L20) →
[20260728](supabase/migrations/20260728_orders_total_minor_deal_savings.sql#L59). The 20260728 header
notes it is *"a FUNCTION BODY change, NOT a signature change"*
([:10](supabase/migrations/20260728_orders_total_minor_deal_savings.sql#L10)).

### 2.2 What it does transactionally

Body, [:74-129](supabase/migrations/20260728_orders_total_minor_deal_savings.sql#L74-L129):

```sql
begin
  -- DISPLAY NUMBER: event counter first, truck-level fallback when there is no event.
  if p_event_id is not null then
    v_order_number := increment_event_order_counter(p_event_id);
  end if;
  if v_order_number is null then
    v_order_number := increment_order_counter(p_truck_id);
  end if;
  if v_order_number is null then
    raise exception 'could not generate order number (truck %, event %)', p_truck_id, p_event_id;
  end if;

  -- INSERT the order (order_key + created_at/updated_at via column defaults).
  insert into orders (
    id, truck_id, customer_name, customer_email, customer_phone, slot, order_type,
    event_date, event_id, van_id, items, deals, discount_code, subtotal, discount_amt,
    total, total_minor, notes, status, payment_status
  ) values (
    v_order_number::text,
    …
    round(coalesce((p_order->>'total')::numeric, 0) * 100)::integer,
    …
  )
  returning order_key into v_order_key;

  -- BOOK capacity, EVENT-SCOPED: only when there's an event AND TS-computed rows (booked).
  if p_event_id is not null and p_unit_rows is not null then
    delete from production_slot_usage where truck_id = p_truck_id and event_id = p_event_id;
    for v_row in select * from jsonb_array_elements(p_unit_rows) loop
      insert into production_slot_usage (truck_id, event_id, event_date, production_slot, units_by_cat, updated_at)
      values (p_truck_id, p_event_id, p_event_date, v_row->>'production_slot', v_row->'units_by_cat', now());
    end loop;
  end if;

  return jsonb_build_object(
    'order_key',    v_order_key,
    'order_number', v_order_number,
    'slot',         p_final_slot
  );
end;
```

Four things in one implicit transaction: (1) counter increment via a nested RPC, (2) one `orders`
INSERT, (3) a **DELETE-then-INSERT-loop** rebuild of `production_slot_usage` for the event, (4) a jsonb
identity payload back.

All-or-nothing, confirmed at the call site —
[app/api/orders/submit/route.ts:923-928](app/api/orders/submit/route.ts#L923-L928):

```ts
if (rpcErr || !rpcData) {
  // Rolled back — NOTHING persisted (no order, no usage, option stock restored, counter not
  // advanced). Mirrors the old "Failed to save order" 500; the client retries on a clean slate.
  console.error('place_order_atomic failed (rolled back, nothing persisted):', rpcErr)
  return NextResponse.json({ error: 'Failed to save order' }, { status: 500 })
}
```

### 2.3 Does any other RPC write more than one `orders` row?

**No. No RPC anywhere writes more than one `orders` row, and only `place_order_atomic` touches `orders` at all.**

**Live RPCs** (PostgREST OpenAPI `/rpc/` paths, fetched today) — five:

| RPC | Writes |
|---|---|
| `place_order_atomic` | `orders` ×1 INSERT + `production_slot_usage` ×N |
| `increment_event_order_counter` | `truck_events.order_counter` |
| `increment_order_counter` | `trucks.order_counter` |
| `decrement_stock` | not `orders` |
| `populate_event_slots` | not `orders` |

**Functions defined in migrations** — seven `create [or replace] function` statements across the 80
files: `increment_order_counter`, `increment_event_order_counter`, `decrement_modifier_option_stock`,
`increment_modifier_option_stock`, `place_order_atomic`, `public.set_orders_updated_at`, plus one inside
a comment.

⚠️ **The two sets do not match, in both directions:**

- `decrement_stock` and `populate_event_slots` are **live but have no migration file** defining them.
- `decrement_modifier_option_stock` / `increment_modifier_option_stock`
  ([20260619_modifier_option_stock_rpc.sql:12](supabase/migrations/20260619_modifier_option_stock_rpc.sql#L12),
  [:30](supabase/migrations/20260619_modifier_option_stock_rpc.sql#L30)) are **defined in a migration but
  absent from the live RPC list**.

This is the same migrations-vs-live divergence recorded in
[docs/buzzer-diagnosis-report.md](docs/buzzer-diagnosis-report.md) §6.4 for `trucks.default_walkup_payment`.

Note also that `decrement_stock` (the RPC) is unrelated to `action === 'decrement_stock'` in the API
route, which calls `enforceStockLimits` and no RPC at all —
[route.ts:1412-1418](app/api/dashboard/action/route.ts#L1412-L1418).

### 2.4 Where RPCs are defined and called from

**Defined:** `supabase/migrations/*.sql`, as `create or replace function …  language plpgsql` followed by
`notify pgrst, 'reload schema'`
([20260728:132-134](supabase/migrations/20260728_orders_total_minor_deal_savings.sql#L132-L134),
[20260607:95-98](supabase/migrations/20260607_order_key_per_event.sql#L95-L98)). The reload is required
or PostgREST cannot see the new function.

There are two Supabase **Edge Functions** (`supabase/functions/auto-event-scheduler/index.ts`,
`supabase/functions/heartbeat-monitor/index.ts`) — Deno HTTP handlers, a different mechanism entirely,
not `.rpc()` targets.

**Called:** exactly four `supabase.rpc(...)` sites in the whole codebase, all server-side:

| Call site | RPC |
|---|---|
| [app/api/orders/submit/route.ts:904](app/api/orders/submit/route.ts#L904) | `place_order_atomic` |
| [lib/order-utils.ts:23](lib/order-utils.ts#L23) | `increment_event_order_counter` |
| [lib/order-utils.ts:26](lib/order-utils.ts#L26) | `increment_order_counter` |
| [lib/seed-demo-orders.ts:394](lib/seed-demo-orders.ts#L394) | `increment_event_order_counter` |

**Never from the browser.** There is no `supabaseBrowser.rpc(...)` anywhere — the browser client is used
only for realtime channels and two narrow reads
([app/dashboard/[token]/page.tsx:791](app/dashboard/[token]/page.tsx#L791)).

### 2.5 The pattern a new RPC would be following

Stated as facts about what exists, not as a recommendation:

- **Signature style:** flat scalars plus `jsonb` for structured payloads (`p_order jsonb`,
  `p_unit_rows jsonb`), returning `jsonb`.
- **Transactional scope:** everything in one function body; any `raise exception` rolls the lot back
  ([20260728:83](supabase/migrations/20260728_orders_total_minor_deal_savings.sql#L83)).
- **Multi-row idiom already in use:** `delete … where <scope>` then an `INSERT` loop over
  `jsonb_array_elements` ([:117-121](supabase/migrations/20260728_orders_total_minor_deal_savings.sql#L117-L121))
  — a set-replacement, applied to `production_slot_usage`, not to `orders`.
- **Deploy coupling is documented per migration.** The 20260728 header carries a `VERIFY AFTER APPLYING`
  block ([:15-18](supabase/migrations/20260728_orders_total_minor_deal_savings.sql#L15-L18)) and this
  warning about silent skips ([:10-13](supabase/migrations/20260728_orders_total_minor_deal_savings.sql#L10-L13)):
  *"it will NOT fail loudly if it is skipped: the 7-param signature still resolves… The only way to know
  it ran is to check."*
- **The `orders_set_updated_at` trigger fires inside an RPC too** — it is `before update on orders`, so
  any UPDATE issued from PL/pgSQL bumps `updated_at` exactly as an API-route update does. INSERTs take the
  column default ([20260703:16-18](supabase/migrations/20260703_orders_updated_at_trigger.sql#L16-L18)).
- **Caller-side external hedge:** `place_order_atomic` still runs under an advisory event lock acquired
  in TypeScript, released in a `finally` ([submit/route.ts:921-922](app/api/orders/submit/route.ts#L921-L922)).

---

## 3. The offline outbox — record shape, timestamps, replay order

### 3.1 The record shape, in full

[lib/native/outbox.ts:55-67](lib/native/outbox.ts#L55-L67) — every field stored per queued op:

```ts
export interface OutboxOp {
  op_id: string          // uuid — dedupe / logging
  kind: OutboxKind
  order_key: string      // uuid, client-minted at create — THE server idempotency key
  url: string            // endpoint to replay to (e.g. /api/dashboard/action)
  body: Record<string, unknown>  // the POST payload (already includes order_key / action / manualOrder)
  seq: number            // per-device monotonic → FIFO replay (a create precedes its own status ops)
  client_ts: number      // display only — NEVER used for reconciliation
  attempts: number
  provisional_id: string // device-prefixed display number for offline creates (e.g. 'A13'); '' for status ops
  state: 'pending' | 'syncing' | 'conflict'
  last_error?: string    // last drain failure (HTTP status + server error, or thrown-fetch) — for the dev inspector
}
```

Eleven fields; `last_error` optional. `kind` is
[:53](lib/native/outbox.ts#L53): `export type OutboxKind = 'create' | 'status' | 'edit' | 'stock'`.

**Storage:** one Capacitor Preferences key per op, `hg_outbox_op_<op_id>`
([:26](lib/native/outbox.ts#L26)), written as a single `Preferences.set`
([:135](lib/native/outbox.ts#L135)). Reason, [:11-12](lib/native/outbox.ts#L11-L12): *"so every enqueue is
a single atomic set — a hard-kill mid-write can't corrupt the whole queue (no read-modify-write of a
shared blob)."*

Documented residual risk, [:13-16](lib/native/outbox.ts#L13-L16): *"NSUserDefaults flushes writes to disk
on the OS's schedule, so a force-quit in the sub-second window after the newest enqueue *could* drop only
that last write."*

`enqueue` — [:123-136](lib/native/outbox.ts#L123-L136):

```ts
const op: OutboxOp = {
  op_id: newUuid(),
  kind: input.kind,
  order_key: input.order_key,
  url: input.url,
  body: input.body,
  seq: await nextSeq(),
  client_ts: Date.now(),
  attempts: 0,
  provisional_id: input.provisional_id ?? '',
  state: 'pending',
}
await Preferences.set({ key: KEY_PREFIX + op.op_id, value: JSON.stringify(op) })
return op
```

⚠️ Note what is **not** copied into `body`: `client_ts` and `seq` stay on the op envelope. The POST payload
is whatever the caller passed, plus `expected_from` on status ops
([orderGate.ts:135](lib/native/orderGate.ts#L135)).

### 3.2 Does any queued op carry a client timestamp?

**Yes — `client_ts`, on every op, and it is explicitly excluded from reconciliation.**

[:130](lib/native/outbox.ts#L130): `client_ts: Date.now()`
[:62](lib/native/outbox.ts#L62): `client_ts: number      // display only — NEVER used for reconciliation`

A grep for `client_ts` across the codebase finds it in exactly two places: this interface declaration and
this assignment. **Nothing reads it** — not the drain, not the overlay, not the inspector, not the server.
It is written and never consumed.

### 3.3 What decides replay ordering

**`seq` — a per-device monotonic counter, deliberately clock-independent.**

[:27](lib/native/outbox.ts#L27):

```ts
const SEQ_KEY = 'hg_outbox_seq'          // monotonic per-device counter (ordering, clock-independent)
```

[:99-104](lib/native/outbox.ts#L99-L104):

```ts
async function nextSeq(): Promise<number> {
  const cur = parseInt((await Preferences.get({ key: SEQ_KEY })).value ?? '0', 10) || 0
  const next = cur + 1
  await Preferences.set({ key: SEQ_KEY, value: String(next) })
  return next
}
```

Sorting happens in `listOps` — [:140-153](lib/native/outbox.ts#L140-L153):

```ts
/** All queued ops, oldest-first (FIFO by seq). */
export async function listOps(): Promise<OutboxOp[]> {
  const { keys } = await Preferences.keys()
  const ops: OutboxOp[] = []
  for (const k of keys) {
    if (!isOpKey(k)) continue
    const v = (await Preferences.get({ key: k })).value
    if (!v) continue
    try {
      const parsed = JSON.parse(v)
      if (isOpShape(parsed)) ops.push(parsed)   // shape guard: a non-op value (e.g. a counter) is never an op
    } catch { /* skip a corrupt entry, never throw */ }
  }
  return ops.sort((a, b) => a.seq - b.seq)
}
```

So: **insertion order, expressed as an explicit integer**, not wall-clock. Two other consumers depend on
the same ordering: `listPendingStatusOps` sorts by `seq`
([orderGate.ts:64](lib/native/orderGate.ts#L64)) and feeds `buildStatusOverlay`, which folds ops in `seq`
order ([orderGate.ts:74-81](lib/native/orderGate.ts#L74-L81)); `removePendingStatusOp` takes the highest
`seq` for an order ([outbox.ts:186-190](lib/native/outbox.ts#L186-L190)).

⚠️ **`seq` is per-device.** Two devices' queues are not comparable — the counter is a Preferences key on
one handset. Cross-device ordering is decided entirely by which POST reaches Postgres first.

### 3.4 The one exception: `stock` ops coalesce

[:115-122](lib/native/outbox.ts#L115-L122):

```ts
// COALESCE stock ops: a newer stock write for the SAME target (synthetic order_key) supersedes an older
// pending one — absolute last-write-wins, fewer replays. Only pending/syncing (not 'conflict', which needs
// review). Order/status/edit ops are never coalesced (each is a distinct mutation).
if (input.kind === 'stock' && input.order_key) {
  for (const prev of await listOps()) {
    if (prev.kind === 'stock' && prev.order_key === input.order_key && prev.state !== 'conflict') await removeOp(prev.op_id)
  }
}
```

This is the **only existing last-write-wins mechanism in the outbox**, and it resolves at **enqueue time
on one device** by deleting the superseded op — not by comparing timestamps at replay, and not across
devices. The dedupe key is the synthetic `order_key`, described at
[:47-52](lib/native/outbox.ts#L47-L52) as `` `${event_id}:${action}:${target}` ``.

### 3.5 The replay loop, verbatim

[lib/native/orderGate.ts:169-227](lib/native/orderGate.ts#L169-L227):

```ts
export async function drainOutbox(): Promise<DrainResult> {
  if (drainInFlight) return drainInFlight                        // already running → coalesce (race fix)
  drainInFlight = drainOnce().finally(() => { drainInFlight = null })
  return drainInFlight
}

async function drainOnce(): Promise<DrainResult> {
  const ops = (await listOps()).filter(o => o.state !== 'conflict')
  let synced = 0, conflicts = 0
  for (const op of ops) {
    // MALFORMED GUARD: a poison op from the buggy-code era can lack fields the whole pipeline relies on —
    // order_key (server idempotency / dedup / removal all key on it), url (post target), op_id (storage
    // key / removeOp). Such an op can NEVER sync idempotently or be cleanly removed → it would retry forever
    // amber (and NaN attempts from a missing `attempts` never reaches MAX, so it never even escalates). Flag
    // it 'conflict' (dismissible in the inspector) and SKIP — never post/retry it. (A kind:'stock' op is
    // VALID here: it carries a SYNTHETIC key `${event_id}:${action}:${target}` in order_key, so it passes.)
    if (!op.order_key || !op.url || !op.op_id) {
      if (op.op_id) await saveOp({ ...op, state: 'conflict', last_error: `malformed op — missing ${[!op.order_key && 'order_key', !op.url && 'url'].filter(Boolean).join('/') || 'required field'}` })
      conflicts++
      continue
    }
    // COPY-ON-WRITE: the op is deserialized from storage and can be FROZEN/readonly in the runtime (observed
    // on-device: mutating it throws "Attempted to assign to readonly property", crashing the whole drain on
    // the first op). NEVER mutate op in place; write a NEW object each time and persist that.
    // `attempts ?? 0` — a malformed op with a missing `attempts` would otherwise make NaN → never hits MAX.
    const syncing = { ...op, state: 'syncing' as const, attempts: (op.attempts ?? 0) + 1 }
    await saveOp(syncing)
    let res: Response
    try {
      res = await post(syncing.url, syncing.body)
    } catch (e: unknown) {
      // Thrown fetch = NO server response (genuine offline OR a per-op failure). If this op has now failed
      // MAX_ATTEMPTS times, treat it as poison: flag 'conflict' and CONTINUE so it can't block the ops behind
      // it nor loop amber forever (the earlier hole — the catch used to only ever set 'pending' + break).
      // Below MAX it's likely a transient/offline blip → keep 'pending' and STOP; retry on the next drain.
      const last_error = `network: ${e instanceof Error ? e.message : 'thrown fetch (no response)'}`
      if (syncing.attempts >= MAX_ATTEMPTS) { await saveOp({ ...syncing, state: 'conflict', last_error }); conflicts++; continue }
      await saveOp({ ...syncing, state: 'pending', last_error })
      break
    }
    if (res.ok) {
      await removeOp(syncing.op_id); synced++
    } else {
      // Capture the server's rejection reason for the dev inspector (HTTP status + body error), THEN branch.
      const data = await res.json().catch(() => ({} as Record<string, unknown>))
      const last_error = `HTTP ${res.status}${(data as any)?.error ? ` — ${(data as any).error}` : ''}`
      if (res.status === 409) {
        // Genuine conflict (e.g. the order was cancelled online while advanced offline) → flag, don't overwrite.
        await saveOp({ ...syncing, state: 'conflict', last_error }); conflicts++
      } else if (syncing.attempts >= MAX_ATTEMPTS) {
        await saveOp({ ...syncing, state: 'conflict', last_error }); conflicts++   // give up auto-retry → surface for review
      } else {
        await saveOp({ ...syncing, state: 'pending', last_error })                 // transient server error → retry next drain
      }
    }
  }
  const remaining = (await listOps()).filter(o => o.state !== 'conflict').length
  return { synced, conflicts, remaining }
}
```

`MAX_ATTEMPTS = 5` ([orderGate.ts:18](lib/native/orderGate.ts#L18)). Serialisation rationale,
[:158-161](lib/native/orderGate.ts#L158-L161): *"OfflineBanner fires drainOutbox() from BOTH
onReachabilityChange(online) AND the backoff scheduleRetry — with no lock they overlap, and Drain B can
saveOp() an op that Drain A already removeOp()'d."*

---

## 4. What happens to an op that FAILS on replay

**It is retried, then flagged, then surfaced to the operator as a red banner. It is never silently
swallowed, and it is never dropped without the operator dismissing it.** Six distinct outcomes:

| Outcome | Condition | Action | Loop | Line |
|---|---|---|---|---|
| **Malformed** | missing `order_key` / `url` / `op_id` | `state: 'conflict'`, never posted | `continue` | [185-189](lib/native/orderGate.ts#L185-L189) |
| **Success** | `res.ok` | `removeOp`, `synced++` | next | [209-210](lib/native/orderGate.ts#L209-L210) |
| **409 conflict** | `res.status === 409` | `state: 'conflict'`, `conflicts++` | next | [215-217](lib/native/orderGate.ts#L215-L217) |
| **Non-OK at MAX** | `attempts >= 5` | `state: 'conflict'`, `conflicts++` | next | [218-219](lib/native/orderGate.ts#L218-L219) |
| **Non-OK below MAX** | transient server error | `state: 'pending'` + `last_error` | next | [220-221](lib/native/orderGate.ts#L220-L221) |
| **Thrown fetch** | below MAX → `'pending'` + **`break`**; at MAX → `'conflict'` + `continue` | | | [199-208](lib/native/orderGate.ts#L199-L208) |

### 4.1 The 409 path — the one that matters for a row-changed-underneath case

[orderGate.ts:215-217](lib/native/orderGate.ts#L215-L217):

```ts
if (res.status === 409) {
  // Genuine conflict (e.g. the order was cancelled online while advanced offline) → flag, don't overwrite.
  await saveOp({ ...syncing, state: 'conflict', last_error }); conflicts++
}
```

The server side that produces it —
[app/api/dashboard/action/route.ts:195-205](app/api/dashboard/action/route.ts#L195-L205):

```ts
// ── Offline-replay conflict guard (Phase 1) ───────────────────────────────
// A status op replayed from the offline outbox carries `expected_from` (the statuses it may apply FROM,
// incl. its target). If the order has since moved to a state NOT in that set — e.g. a customer
// cancelled/rejected it online while the operator advanced it offline — return 409 so the outbox FLAGS it
// for review instead of overwriting the cancel. Online requests omit expected_from → zero behaviour change.
if (Array.isArray(body.expected_from) && orderKey && action !== 'manual') {
  const { data: cur } = await supabase.from('orders').select('status').eq('order_key', orderKey).eq('truck_id', truck.id).single()
  if (cur && !body.expected_from.includes(cur.status)) {
    return NextResponse.json({ error: 'conflict', current_status: cur.status }, { status: 409 })
  }
}
```

⚠️ **The precondition is status-only.** It compares `cur.status` against `expected_from`. A replayed op
whose target column is not `status` would pass this guard unconditionally — there is no generalised
compare-and-swap on any other column.

### 4.2 A conflict is removed from the actionable queue but kept for review

`drainOnce` starts by filtering conflicts out ([:176](lib/native/orderGate.ts#L176)), and the banner
counts only actionable ops — [outbox.ts:160-165](lib/native/outbox.ts#L160-L165):

```ts
/** Count of ACTIONABLE ops (pending/syncing) — EXCLUDES 'conflict' ops. The banner uses THIS (not countOps)
 *  so a conflict awaiting review never keeps a perpetual "syncing" banner up. Reads op state (heavier than
 *  countOps' key-only count). */
export async function countPendingOps(): Promise<number> {
  return (await listOps()).filter(o => o.state !== 'conflict').length
}
```

Conflicts are listed separately ([:167-170](lib/native/outbox.ts#L167-L170)) and removed only by explicit
operator dismissal ([:172-175](lib/native/outbox.ts#L172-L175)):

```ts
/** Dismiss/acknowledge every conflict op (operator has reviewed) — removes them from the outbox. */
export async function clearConflicts(): Promise<void> {
  for (const op of await listConflictOps()) await removeOp(op.op_id)
}
```

### 4.3 What the operator actually sees

[components/native/OfflineBanner.tsx:88-95](components/native/OfflineBanner.tsx#L88-L95):

```tsx
// Conflicts — their OWN banner, always actionable (never a silent stuck "syncing").
const conflictBanner: ReactNode = conflicts > 0 ? (
  <div className="w-full bg-red-600 text-white text-sm font-semibold px-4 py-2 flex items-center justify-center gap-3">
    <span>⚠ {conflicts} {conflicts === 1 ? 'order' : 'orders'} couldn&apos;t sync — needs review</span>
    <button type="button" onClick={() => { void (async () => { await clearConflicts(); await refreshCounts() })() }}
      className="underline font-bold">Dismiss</button>
  </div>
) : null
```

⚠️ Three limits on this channel:

1. **Native only.** [OfflineBanner.tsx:86](components/native/OfflineBanner.tsx#L86): `if (!isNativeApp()) return null`. The web dashboard has no outbox and therefore no conflict banner.
2. **It names a COUNT, not an order.** "⚠ 2 orders couldn't sync — needs review" — no order number, no link, no way to reach the affected card from the banner.
3. **`last_error` is dev-only.** It is captured on every failure ([:204](lib/native/orderGate.ts#L204), [:214](lib/native/orderGate.ts#L214)) and rendered only by `components/native/DevOutboxInspector.tsx` ([:31](components/native/DevOutboxInspector.tsx#L31), [:69](components/native/DevOutboxInspector.tsx#L69)).

**Nothing is silently swallowed.** The two `catch`-and-continue sites are narrow and documented: a corrupt
Preferences entry is skipped during enumeration ([outbox.ts:150](lib/native/outbox.ts#L150) — *"skip a
corrupt entry, never throw"*), and a non-JSON error body degrades to `{}`
([orderGate.ts:213](lib/native/orderGate.ts#L213)) while the HTTP status still lands in `last_error`.

---

## 5. Existing "needs attention" channels on an order card

### 5.1 On the card itself — one, and it means "not yet synced"

**`pendingSync`** is the only non-urgency, non-status visual state on `OrderCard`.

Border, [components/dashboard/OrderCard.tsx:518](components/dashboard/OrderCard.tsx#L518):

```tsx
<div id={anchorId} className={`w-full bg-white rounded-2xl overflow-hidden shadow-sm border transition-opacity flex flex-col ${allStruck ? 'opacity-50' : ''} ${pendingSync ? 'border-amber-300' : 'border-slate-200'}${highlight ? ' demo-order-highlight' : ''}`}>
```

Button row replacement, [:420-427](components/dashboard/OrderCard.tsx#L420-L427):

```tsx
if (pendingSync) {
  return (
    <div className="flex items-center gap-2 py-3 text-slate-400 text-sm justify-center">
      <span>⏳</span>
      <span>Syncing…</span>
    </div>
  )
}
```

⚠️ **Only the KDS passes it** ([kds/page.tsx:1067](app/dashboard/[token]/kds/page.tsx#L1067)
`pendingSync={pendingSync.has(order.order_key)}`). The dashboard's two grids
([page.tsx:2720](app/dashboard/[token]/page.tsx#L2720), [:2726](app/dashboard/[token]/page.tsx#L2726))
omit the prop entirely, so it defaults `false`
([OrderCard.tsx:95](components/dashboard/OrderCard.tsx#L95)) and the dashboard card has **no** sync
indicator at all.

Semantically it means *"this write hasn't reached the server yet"* — a transient in-flight state that
clears on drain, not *"a decision was made for you, verify it."* It also **removes** the action buttons,
so it is a lockout rather than a flag.

### 5.2 Everything else on the card is urgency, status, payment, or demo

| Element | Line | Channel |
|---|---|---|
| Header colour | [337](components/dashboard/OrderCard.tsx#L337) via `getHeaderStyle` | urgency |
| Red lateness pill | [535](components/dashboard/OrderCard.tsx#L535), [573](components/dashboard/OrderCard.tsx#L573), [631](components/dashboard/OrderCard.tsx#L631) | urgency |
| Status badge | [595-597](components/dashboard/OrderCard.tsx#L595-L597) | status |
| `PAID` / part-paid chip | [236-245](components/dashboard/OrderCard.tsx#L236-L245) | payment fact |
| `📝` notes box | [792-797](components/dashboard/OrderCard.tsx#L792-L797) | informational content |
| `demo-order-highlight` ring | [518](components/dashboard/OrderCard.tsx#L518), [123-130](components/dashboard/OrderCard.tsx#L123-L130) | **demo only** |
| `opacity-50` all-struck | [518](components/dashboard/OrderCard.tsx#L518) | dead — `ITEM_TICK_ENABLED = false` ([20](components/dashboard/OrderCard.tsx#L20)) |

### 5.3 Attention routed through STATUS instead of a flag — the `notes_require_review` precedent

When a customer order carries notes and the truck has notes-review on, the order is **held at `pending`**
rather than auto-confirmed — [app/api/orders/submit/route.ts:848](app/api/orders/submit/route.ts#L848):

> where allergy requests land, so a truck with notes_require_review ON holds a NOTED order `pending`

and the gate at [:862](app/api/orders/submit/route.ts#L862):

```ts
&& !((truck as any).notes_require_review !== false && orderHasNotes)
```

**No badge, no colour, no icon.** The attention signal is the order appearing in the "New" column with
Confirm/Reject buttons. This is the codebase's existing answer to "make the operator look at this one":
**use the status column, not a new visual channel.**

### 5.4 THE closest existing thing — a page-level "auto-resolved, check it" banner

[components/dashboard/CapacityBreachBanner.tsx](components/dashboard/CapacityBreachBanner.tsx) is exactly
the semantic you described, but it lives **above the board, not on a card**.

Header, [:1-11](components/dashboard/CapacityBreachBanner.tsx#L1-L11):

```
// PIECE 2 — reconnect "capacity exceeded" banner (WARNING ONLY, non-blocking, dismissible).
//
// Surfaces the server-detected breaches (detectCapacityBreaches, §31) so the operator can find the
// over-subscribed slot(s) and bump/amend BY JUDGMENT. No auto-bump, no gating, no placement change.
//
// Appears whenever the authoritative production_slot_usage has a slot genuinely OVER a ceiling —
// the common cause being an offline order colliding with an online booking on the same slot while the
// truck was offline (accepted as unavoidable; §31 only asks that it be FLAGGED on reconnect). Also
// covers an operator override that pushed a slot over. Dismiss hides it until the breach set CHANGES
// (a new/worse breach re-shows), so it never nags about an already-reviewed slot.
```

Render, [:37-58](components/dashboard/CapacityBreachBanner.tsx#L37-L58):

```tsx
return (
  <div className="w-full bg-red-600 text-white text-sm px-4 py-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex flex-col gap-0.5">
      <span className="font-bold">
        ⚠ {n} {n === 1 ? 'slot' : 'slots'} over capacity — review
      </span>
      <span className="text-xs text-red-50 leading-snug">
        {breaches.map(b => {
          const ids = b.order_ids.length ? ` (orders ${b.order_ids.map(i => `#${i}`).join(', ')})` : ''
          return `${b.collection_time} — ${b.reason}${ids}`
        }).join('  ·  ')}
      </span>
    </div>
    <button
      type="button"
      onClick={() => onDismiss(sig)}
      className="self-end sm:self-auto underline font-bold shrink-0"
    >
      Dismiss
    </button>
  </div>
)
```

The dismissal is keyed on a content signature so a **new or worse** breach re-shows —
[:15-21](components/dashboard/CapacityBreachBanner.tsx#L15-L21):

```ts
/** Stable signature of the current breach set — dismiss is keyed to this so a NEW breach re-shows. */
export function breachSignature(breaches: CapacityBreach[]): string {
  return (breaches || [])
    .map(b => `${b.collection_time}:${b.over_total}:${b.over_cats.map(c => `${c.cat}${c.over}`).join(',')}`)
    .sort()
    .join('|')
}
```

Mounted once at [app/dashboard/[token]/page.tsx:2118](app/dashboard/[token]/page.tsx#L2118). It **does
carry the affected order numbers** — `order_ids: number[]` on `CapacityBreach`
([lib/capacity-breach.ts:44](lib/capacity-breach.ts#L44), populated at
[:114](lib/capacity-breach.ts#L114)) — but only rendered as prose inside the banner text. The cards those
numbers refer to are unmarked.

### 5.5 Direct answer

**No card-level "this was auto-resolved, check it" channel exists.** A card-level flag would be new.

What exists to model on:

| Existing | Level | Dismissible | Names the order | Native only |
|---|---|---|---|---|
| `pendingSync` amber border + "⏳ Syncing…" | card (KDS only) | no — clears on drain | n/a | effectively |
| Outbox conflict banner | page | ✅ `clearConflicts()` | ❌ count only | ✅ |
| Capacity breach banner | page | ✅ signature-keyed | ✅ in prose | ❌ |
| `notes_require_review` | status column | n/a — cleared by confirming | ✅ it *is* the card | ❌ |

⚠️ One more relevant precedent: `orders.capacity_ack_at` is a persisted record of an informed
over-capacity placement, added specifically so *"a deliberate, informed over-capacity placement is later
distinguishable from one that arrived unattended (offline collision / sync race)"* —
[app/api/dashboard/action/route.ts:1044-1050](app/api/dashboard/action/route.ts#L1044-L1050). Its own
comment ends: *"Nothing reads it yet; narrowing the breach banner to unacknowledged breaches is a later
task."* So a column exists that records "this needed a human decision" and **no UI consumes it**.

---

## 6. Live `orders` — version / timestamp columns

Read from the live database (PostgREST OpenAPI at `$SUPABASE_URL/rest/v1/`, service-role key from
`.env.local`, HTTP 200), not from migration files.

| Column | Type | Nullability | Default | Written by |
|---|---|---|---|---|
| `created_at` | `timestamp with time zone` | nullable | `now()` | column default |
| **`updated_at`** | **`timestamp with time zone`** | **nullable** | **`now()`** | **`orders_set_updated_at` BEFORE UPDATE trigger** |
| `paid_at` | `timestamp with time zone` | nullable | — | `collected` / cleared by `undo_collected` |
| `collected_at` | `timestamp with time zone` | nullable | — | same |
| `capacity_ack_at` | `timestamp with time zone` | nullable | — | server-minted on informed override; **nothing reads it** |
| `status_before_collected` | `text` | nullable | — | `collected` |

**`updated_at` exists live. There is no `version`, `lock_version`, `revision`, `etag`, `seq`, or
`last_modified` column** — a regex scan of all 37 live column names for
`version|lock|rev|etag|seq|xmin|modified` returns nothing.

⚠️ Three properties of `updated_at` that constrain any last-write-wins scheme built on it:

1. **It is `now()` from the DATABASE, not from the client.** The trigger assigns
   `new.updated_at := now()` unconditionally ([20260703:25](supabase/migrations/20260703_orders_updated_at_trigger.sql#L25)) — an
   application-supplied `updated_at` in an UPDATE payload is **overwritten**, silently.
2. **It is nullable with a default.** An INSERT takes the default; the merge's `parseTs` returns `null`
   for a missing value and falls into the status-rank backstop
   ([mergeOrders.ts:57-61](lib/orders/mergeOrders.ts#L57-L61)).
3. **`now()` is transaction-start time in Postgres.** Two UPDATEs inside one transaction receive the
   *same* `updated_at`, which lands the merge in its equal-timestamp branch —
   [mergeOrders.ts:89](lib/orders/mergeOrders.ts#L89) requires `tRead !== tLocal` for the version guard to
   engage at all.

---

## Appendix — files read for this report

| Path | Sections |
|---|---|
| [lib/orders/mergeOrders.ts](lib/orders/mergeOrders.ts) | 1 (quoted in full) |
| [lib/native/outbox.ts](lib/native/outbox.ts) | 3 (shape quoted in full) |
| [lib/native/orderGate.ts](lib/native/orderGate.ts) | 3, 4 (drain loop quoted in full) |
| [supabase/migrations/20260728_orders_total_minor_deal_savings.sql](supabase/migrations/20260728_orders_total_minor_deal_savings.sql) | 2 |
| [supabase/migrations/20260703_orders_updated_at_trigger.sql](supabase/migrations/20260703_orders_updated_at_trigger.sql) | 1, 6 |
| [supabase/migrations/20260624_place_order_atomic.sql](supabase/migrations/20260624_place_order_atomic.sql) · [20260715…](supabase/migrations/20260715_place_order_atomic_drop_drawlist.sql) · [20260619…](supabase/migrations/20260619_modifier_option_stock_rpc.sql) | 2 |
| [app/api/orders/submit/route.ts](app/api/orders/submit/route.ts) | 2, 5 |
| [app/api/dashboard/action/route.ts](app/api/dashboard/action/route.ts) | 1, 4, 5 |
| [components/dashboard/OrderCard.tsx](components/dashboard/OrderCard.tsx) | 5 |
| [components/dashboard/CapacityBreachBanner.tsx](components/dashboard/CapacityBreachBanner.tsx) · [lib/capacity-breach.ts](lib/capacity-breach.ts) | 5 |
| [components/native/OfflineBanner.tsx](components/native/OfflineBanner.tsx) · [components/native/DevOutboxInspector.tsx](components/native/DevOutboxInspector.tsx) | 4, 5 |
| [app/dashboard/[token]/page.tsx](app/dashboard/[token]/page.tsx) · [app/dashboard/[token]/kds/page.tsx](app/dashboard/[token]/kds/page.tsx) | 5 |
| [lib/order-utils.ts](lib/order-utils.ts) · [lib/seed-demo-orders.ts](lib/seed-demo-orders.ts) | 2 |
| Live PostgREST OpenAPI (`$SUPABASE_URL/rest/v1/`) | 2, 6 |
