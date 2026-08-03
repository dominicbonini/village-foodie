# Buzzer-number feature — pre-design diagnosis

**Date:** 2026-08-03 · **Branch:** main @ 31247ce · **Mode:** read-only, facts only, no proposals.

**Method note.** Sections 1–5 and 7 are read from the working tree. Section 6 columns/types/nullability
are read from the **live database** via the PostgREST OpenAPI schema at `$SUPABASE_URL/rest/v1/`
(service-role key from `.env.local`, HTTP 200, 343 KB). Constraints and indexes are **not** exposed by
PostgREST and there is no SQL-exec RPC on this project (the only RPCs are `populate_event_slots`,
`increment_event_order_counter`, `place_order_atomic`, `decrement_stock`, `increment_order_counter`), so
those are quoted from migration files and labelled as such.

---

## 0. Prompt integrity

No span of the prompt arrived garbled. Every numbered section parsed cleanly and is answered below.

One request could not be satisfied exactly as worded, and it is a **tooling limit, not a misreading**:
section 6 asks for unique indexes and check constraints from live tables rather than migration files.
Live *columns* were readable; live *constraints and indexes* were not, for the reason above. They are
reported from migrations with an explicit "unverified against live" marker, plus one piece of hard
evidence that the migration folder and the live database have diverged (§6.4).

---

## 1. ORDER STATUS MODEL

### 1.1 The status vocabulary — three definitions, not one

**(a) TS const object — 8 values. This is the one the operator surfaces use.**

[components/dashboard/types.ts:14-25](components/dashboard/types.ts#L14-L25):

```ts
export const ORDER_STATUS = {
  PENDING:   'pending',
  CONFIRMED: 'confirmed',
  REJECTED:  'rejected',
  MODIFIED:  'modified',
  CANCELLED: 'cancelled',
  COOKING:   'cooking',
  READY:     'ready',
  COLLECTED: 'collected',
} as const

export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS]
```

**(b) A SECOND, DIVERGENT TS union — 7 values, missing `cooking`.**

[lib/supabase.ts:8-15](lib/supabase.ts#L8-L15):

```ts
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'rejected'
  | 'modified'
  | 'cancelled'
  | 'collected'
  | 'ready'
```

Two exported types with the same name `OrderStatus` in two modules, disagreeing on whether `cooking`
exists. `components/dashboard/types.ts` is what `OrderCard`, the dashboard page and the KDS import;
`lib/supabase.ts` carries the server-side `Order` interface.

**(c) DB — a CHECK constraint, not a Postgres enum.** Live column type is plain `text`
(`orders.status`, nullable, `default="pending"` — see §6.1). The constraint is from
[supabase/migrations/20260520_kds_foundation.sql:9-20](supabase/migrations/20260520_kds_foundation.sql#L9-L20)
(*migration text — not verified against live*):

```sql
alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check
  check (status in (
    'pending',
    'confirmed',
    'rejected',
    'modified',
    'cancelled',
    'cooking',
    'ready',
    'collected'
  ));
```

There is also a per-status display map,
[components/dashboard/types.ts:212-221](components/dashboard/types.ts#L212-L221), typed
`Record<OrderStatus, …>` so it is exhaustive over the 8-value set (label + bg + text colour for each).

A separate, orthogonal vocabulary exists for **payment**: `orders.payment_status` ∈
`unpaid | paid | part_paid | refunded | refund_due | failed`, constrained by
[20260729_orders_payment_status_widen_check.sql:69-70](supabase/migrations/20260729_orders_payment_status_widen_check.sql#L69-L70).
That migration's own comment states the design rule explicitly (line 26-28): *"Payment stays ORTHOGONAL
to fulfilment… `orders.status` keeps its eight operational values and gains no payment value."*

### 1.2 "Active/occupying" — the list is DUPLICATED in four places, plus two variants

`['pending', 'confirmed', 'modified', 'cooking']` is **not shared from one place**. It is written out
literally four times, in four modules, with no exported constant:

| # | Location | Form |
|---|---|---|
| 1 | [lib/slot-bookings.ts:226](lib/slot-bookings.ts#L226) | `.in('status', ['pending', 'confirmed', 'modified', 'cooking'])` |
| 2 | [lib/slot-bookings.ts:474](lib/slot-bookings.ts#L474) | `.in('status', ['pending', 'confirmed', 'modified', 'cooking'])` |
| 3 | [lib/capacity-breach.ts:30](lib/capacity-breach.ts#L30) | `const OCCUPYING_STATUSES = new Set([...])` |
| 4 | [lib/slot-capacity.ts:39](lib/slot-capacity.ts#L39) | `const OCCUPYING = ['pending', 'confirmed', 'modified', 'cooking']` |
| 5 | [components/dashboard/AddOrderPanel.tsx:845](components/dashboard/AddOrderPanel.tsx#L845) | `const OCCUPYING = new Set([...])` (function-local) |

`rebuildProductionSlotUsage` reaches the list via `buildUnitsFromOrders` — site #1.
[lib/slot-bookings.ts:216-226](lib/slot-bookings.ts#L216-L226):

```ts
  let ordersQuery = supabase
    .from('orders')
    .select('slot, items, deals')
    .eq('truck_id', truckId)
    .eq('event_id', eventId)
    // Occupies the oven from placement THROUGH cooking; RELEASES at 'ready' (done cooking — sitting on
    // the counter) and at collected/cancelled/rejected. 'cooking' must be here or a rebuild fired while
    // another order is mid-cook would free it prematurely (oversell). ONE source — both the live fit-read
    // and rebuildProductionSlotUsage use this, so every reader (orders-screen day load, the seating
    // projection) inherits the release-at-ready behaviour.
    .in('status', ['pending', 'confirmed', 'modified', 'cooking'])
```

The comment claims "ONE source", and that is true **within `lib/slot-bookings.ts`** (the live fit-read
and the rebuild share the helper). It is not true across the codebase — sites 3, 4 and 5 are independent
copies. Site 3's comment acknowledges this: *"the SAME status set the write path (buildUnitsFromOrders,
§71) counts"* — a comment asserting parity, not a shared import.

Site #2 is the legacy fallback branch of `getSlotCounts` (order count per slot when there are no
collection times / cat configs).

**Two related but DIFFERENT lists exist — do not confuse them with the occupying list:**

- [app/api/dashboard/route.ts:186](app/api/dashboard/route.ts#L186) — what the dashboard/KDS **fetch**:
  ```ts
  const ACTIVE_STATUSES = ['pending', 'confirmed', 'modified', 'cooking', 'ready']
  // Terminal orders shown alongside the active list for the same event.
  const DONE_STATUSES = ['collected', 'rejected', 'cancelled']
  ```
  Five values — `ready` is fetched-as-active but is **not** capacity-occupying.
- [app/dashboard/[token]/page.tsx:2024](app/dashboard/[token]/page.tsx#L2024) — what the "confirmed"
  card column **renders**: `['confirmed','modified','cooking','ready']`.
- [lib/native/orderGate.ts:22](lib/native/orderGate.ts#L22) — statuses an offline replay may apply from:
  ```ts
  export const STATUS_REPLAY_EXPECTED_FROM = ['pending', 'confirmed', 'modified', 'cooking', 'ready', 'collected']
  ```
- [lib/printing/printWatcher.ts:13](lib/printing/printWatcher.ts#L13) — `const DEFAULT_ELIGIBLE = ['confirmed', 'cooking', 'ready']`.
- [lib/orders/mergeOrders.ts:33-42](lib/orders/mergeOrders.ts#L33-L42) — a lifecycle **rank** map over
  all 8 statuses used by the version-guarded client merge (`pending:0, confirmed/modified:1, cooking:2,
  ready:3, collected:4, cancelled/rejected:5`).

### 1.3 What happens at `'collected'`

Handler: [app/api/dashboard/action/route.ts:374-437](app/api/dashboard/action/route.ts#L374-L437).

Read of prior status and the guard, lines 376-380:

```ts
const now = new Date().toISOString()
const { data: order } = await supabase.from('orders').select('slot, event_date, event_id, status').eq('order_key', orderKey).eq('truck_id', truck.id).single()
// Record the from-status so Undo reverts ONE stage to the ACTUAL previous status (ready if it was
// ready, confirmed/modified if collected directly) — never a hardcoded 'confirmed'. Guard against
// re-firing on an already-collected order: don't overwrite a real prior status with 'collected'.
const fromStatus = order?.status && order.status !== 'collected' ? order.status : null
```

Order of operations in the handler: (1) `recordCollectionPayment` writes the `order_payments` ledger row
**first**, and **fails open** — a ledger failure returns a `paymentWarning` on an otherwise successful
response (lines 399-407); (2) `logAction` appends a best-effort audit row (413-418); (3) the status write.

The transition itself, line 419:

```ts
const { error: collectErr } = await supabase.from('orders').update({ status: 'collected', paid_at: now, collected_at: now, ...(fromStatus ? { status_before_collected: fromStatus } : {}) }).eq('order_key', orderKey).eq('truck_id', truck.id)
```

This write **fails closed** (lines 420-427, returns 500). Then, line 434-436:

```ts
if (order?.event_date) {
  await rebuildProductionSlotUsage(supabase, truck.id, order.event_date)
}
```

`status_before_collected` is `text`, nullable, added by
[20260628_undo_collected_prev_status.sql:15](supabase/migrations/20260628_undo_collected_prev_status.sql#L15)
(`ALTER TABLE orders ADD COLUMN status_before_collected text;`) and confirmed present live (§6.1).

**Undo** — [app/api/dashboard/action/route.ts:441-529](app/api/dashboard/action/route.ts#L441-L529):

```ts
const { data: order } = await supabase.from('orders').select('slot, event_date, event_id, status_before_collected').eq('order_key', orderKey).eq('truck_id', truck.id).single()
const revertTo = order?.status_before_collected || 'confirmed'
```

and the write, line 516:

```ts
const { error: undoErr } = await supabase.from('orders').update({ status: revertTo, status_before_collected: null, paid_at: null, collected_at: null }).eq('order_key', orderKey).eq('truck_id', truck.id)
```

Undo **fails closed** by design (audit row written *before* the ledger delete via `logActionOrThrow`; if
the audit insert fails, the delete never runs and the whole undo 500s — lines 451-458). Whether the
payment is also reversed depends on `show_paid_step`: with the paid step ON, undo reverts status only
(line 469, `splitPaidStep`).

There is also an offline mirror of both transitions,
[lib/native/orderGate.ts:36-46](lib/native/orderGate.ts#L36-L46):

```ts
if (action === 'undo_collected') return { status: order?.status_before_collected ?? 'confirmed', status_before_collected: null }
const next = OFFLINE_STATUS_MAP[action]
if (!next) return null
if (action === 'collected') return { status: next, status_before_collected: order?.status ?? null }
```

### 1.4 Existing per-order operator-set fields after creation — YES, three patterns

**Pattern A — the full `edit` action (free text + numbers, multi-field).** This is the only path that
writes operator-typed content back to an order row alongside items/prices.

Client, [app/dashboard/[token]/page.tsx:1562](app/dashboard/[token]/page.tsx#L1562):

```ts
const res=await fetch('/api/dashboard/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,pin,action:'edit',order_key:editingOrder.order_key,editedOrder:{items:sendItems,deals:editDeals,slot:editSlot||null,notes:editNotes||null,customerName:editName,customerEmail:editEmail,customerPhone:editPhone,...(confirmTotal!==undefined?{confirmUnresolvedTotal:confirmTotal}:{})}})})
```

Server, [app/api/dashboard/action/route.ts:655-676](app/api/dashboard/action/route.ts#L655-L676) — note
the `!== undefined ? … : order.<col>` preserve-if-absent idiom on every optional field:

```ts
const { error: updateErr } = await supabase.from('orders').update({
  items:    repriced.items,
  deals:    dealsToStore,
  slot:     newSlot,
  notes:    notes    !== undefined ? notes : order.notes,
  // Customer contact — all optional; blank clears to null. Preserve when not sent.
  // Blank name → the "Walk-up" sentinel (same default as the manual insert), so a
  // walk-up edited with the name left empty still reads "Walk-up", not blank.
  customer_name:  customerName  !== undefined ? ((customerName || '').trim() || 'Walk-up') : order.customer_name,
  customer_email: customerEmail !== undefined ? (customerEmail || null) : order.customer_email,
  customer_phone: customerPhone !== undefined ? (customerPhone || null) : order.customer_phone,
  total:       newTotal,
  subtotal:    newSubtotal,
  discount_amt: newDiscountAmt,
  total_minor: newTotalMinor,
  status:   'modified',
}).eq('order_key', orderKey).eq('truck_id', truck.id)
```

⚠️ This path **forces `status: 'modified'`** and re-books production slot capacity (lines 686-708), and
emails the customer if `customer_email` is set (710-748). It is not a lightweight field write.

**Pattern B — free text captured in a modal, sent as one extra body key on a status action.** Closest
existing analogue to "operator types a short string against an order".

Cancel — [app/dashboard/[token]/page.tsx:1710-1716](app/dashboard/[token]/page.tsx#L1710-L1716):

```ts
const fullReason=[cancelReason,cancelNote].filter(Boolean).join(' — ')
…
const result=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action:'cancel',order_key:orderKey,cancellationReason:fullReason||null},kind:'status',order_key:orderKey,online:isOnline(),expectedFrom:STATUS_REPLAY_EXPECTED_FROM})
```

Server, [app/api/dashboard/action/route.ts:295](app/api/dashboard/action/route.ts#L295):

```ts
await supabase.from('orders').update({ status: 'cancelled', cancellation_reason: cancellationReason || null }).eq('order_key', orderKey).eq('truck_id', truck.id)
```

Reject is identical in shape — [route.ts:262](app/api/dashboard/action/route.ts#L262):
`.update({ status: 'rejected', rejection_reason: rejectionReason || null })`.

**Pattern C — a numeric nudge encoded in the action name itself.** `adjust_slot_+5/10/20`, fired from
buttons on the card ([OrderCard.tsx:803-808](components/dashboard/OrderCard.tsx#L803-L808)), parsed
server-side at [route.ts:1421-1422](app/api/dashboard/action/route.ts#L1421-L1422) and written at
[route.ts:1439](app/api/dashboard/action/route.ts#L1439):

```ts
await supabase.from('orders').update({ slot: newSlot, status: 'confirmed' }).eq('order_key', orderKey)
```

**What does NOT exist:** any single-field, operator-set, free-text-or-number write to an order that does
not also change `status`. Every existing post-creation write either forces a status (`modified`,
`cancelled`, `rejected`, `confirmed`) or is a status transition carrying an extra column.

**Dormant prior art:** `orders.order_type` (`'collection' | 'table'`) and `orders.table_ref` (`text`,
nullable) exist live and are typed at [lib/supabase.ts:34-35](lib/supabase.ts#L34-L35). Every write site
hardcodes `order_type: 'collection'` ([route.ts:1036](app/api/dashboard/action/route.ts#L1036),
[app/api/orders/submit/route.ts:893](app/api/orders/submit/route.ts#L893),
[AddOrderPanel.tsx:941](components/dashboard/AddOrderPanel.tsx#L941),
[lib/seed-demo-orders.ts:308](lib/seed-demo-orders.ts#L308)) and **nothing anywhere reads or writes
`table_ref`** — grep returns only the type declaration and the SQL column lists in the
`place_order_atomic` migrations.

---

## 2. THE ORDER CARD

### 2.1 One component, two surfaces

**ONE component**, [components/dashboard/OrderCard.tsx:80](components/dashboard/OrderCard.tsx#L80)
(file is 845 lines). Two consumers:

- Dashboard: [app/dashboard/[token]/page.tsx:2720](app/dashboard/[token]/page.tsx#L2720) (pending
  column) and [:2726](app/dashboard/[token]/page.tsx#L2726) (confirmed column).
- KDS: [app/dashboard/[token]/kds/page.tsx:1052-1068](app/dashboard/[token]/kds/page.tsx#L1052-L1068).

`app/kds/[kds_token]/page.tsx` is **not a second KDS** — it is a 35-line server component that resolves
a van's `kds_token` and redirects to `/dashboard/{dashboard_token}/kds?van_id=…&van_name=…`
([app/kds/[kds_token]/page.tsx:31-33](app/kds/[kds_token]/page.tsx#L31-L33)).

Three other files import only the `Toggle` primitive from this module
([components/native/NotificationSettings.tsx:13](components/native/NotificationSettings.tsx#L13),
[components/printing/PrintingSettings.tsx:18](components/printing/PrintingSettings.tsx#L18),
[components/dashboard/UserMenu.tsx:6](components/dashboard/UserMenu.tsx#L6)); `AddOrderPanel` imports
`InlinePriceEditor` ([AddOrderPanel.tsx:14](components/dashboard/AddOrderPanel.tsx#L14)).

### 2.2 How it varies between surfaces — a `viewMode` prop, three values

[components/dashboard/OrderCard.tsx:13](components/dashboard/OrderCard.tsx#L13):

```ts
export type ViewMode = 'solo' | 'window' | 'cook'
```

- Dashboard passes **no** `viewMode` → defaults to `'solo'`
  ([OrderCard.tsx:91](components/dashboard/OrderCard.tsx#L91), `viewMode = 'solo'`).
- KDS passes `viewMode={cardViewMode}` ([kds/page.tsx:1061](app/dashboard/[token]/kds/page.tsx#L1061)),
  which resolves to `'window'` or `'cook'`.

The prop drives an entirely different header JSX per mode, not a CSS variant. Second, independent axis:
`kdsMode` (a boolean from `truck.kds_mode`) which gates the cooking step inside the button logic.
Third: `pendingSync`, passed only by the KDS.

Padding is switched inline at [OrderCard.tsx:554](components/dashboard/OrderCard.tsx#L554):
`${viewMode === 'window' ? 'px-3 py-2' : 'px-4 py-3'}` — the comment at 552-553 reads *"Window uses
Cook's compact px-3 py-2 for KDS grid density; Solo keeps its roomier px-4 py-3 (gate is
'window'-only)."*

Full prop list, [OrderCard.tsx:80-134](components/dashboard/OrderCard.tsx#L80-L134): `order`, `truck`,
`event`, `slots`, `actionLoading`, `onAction`, `onEdit`, `categoryOrder`, `itemCategoryMap`,
`catConfigs`, `viewMode`, `kdsMode`, `showCookingStep`, `effectiveOrderReady`, `pendingSync`,
`anchorId`, `highlight`, `ledgerRows`.

### 2.3 Current layout structure

Root, [OrderCard.tsx:518](components/dashboard/OrderCard.tsx#L518):

```tsx
<div id={anchorId} className={`w-full bg-white rounded-2xl overflow-hidden shadow-sm border transition-opacity flex flex-col ${allStruck ? 'opacity-50' : ''} ${pendingSync ? 'border-amber-300' : 'border-slate-200'}${highlight ? ' demo-order-highlight' : ''}`}>
```

Structure top to bottom:

1. `{removePaymentModal}` — `fixed inset-0`, escapes the card ([:258-282](components/dashboard/OrderCard.tsx#L258-L282)).
2. **Coloured header**, class from `getHeaderStyle(urgencyState)` ([:337](components/dashboard/OrderCard.tsx#L337)) — three mutually exclusive branches:
   - **cook** ([:527-550](components/dashboard/OrderCard.tsx#L527-L550)) — 2 rows.
   - **solo** ([:563-601](components/dashboard/OrderCard.tsx#L563-L601)) — 2 rows.
   - **window/KDS** ([:606-634](components/dashboard/OrderCard.tsx#L606-L634)) — 2 rows.
3. Contact drawer, conditional on `showContact` ([:639-652](components/dashboard/OrderCard.tsx#L639-L652)).
4. Body `<div className="px-4 pb-3 pt-2 bg-slate-50 flex flex-col flex-1">` ([:655](components/dashboard/OrderCard.tsx#L655)) — deals block, category-grouped item lines, per-line modifiers and `📝` notes.
5. Order notes box ([:792-797](components/dashboard/OrderCard.tsx#L792-L797)).
6. "Adjust time" row — pending + slotted + non-cook only ([:800-812](components/dashboard/OrderCard.tsx#L800-L812)).
7. Action stack `<div className="flex flex-col gap-2 mt-auto">` ([:819](components/dashboard/OrderCard.tsx#L819)) — ghost Edit/Cancel row (solo only), then the primary button row.

**Every element competing for horizontal space, by header row.**

*Solo header, row 1* ([:564-578](components/dashboard/OrderCard.tsx#L564-L578)):

| Element | Class / behaviour |
|---|---|
| `#{order.id}` | `text-2xl font-bold flex-shrink-0` |
| `· {timeLabel}` | `text-lg font-bold flex-shrink-0`, conditional |
| offset / lateness pill | `ml-auto flex-shrink-0`; red pill when `isLate`, else `opacity-70` |
| `✓` all-struck mark | conditional, currently unreachable (see below) |

*Solo header, row 2* ([:579-600](components/dashboard/OrderCard.tsx#L579-L600)):

| Element | Class / behaviour |
|---|---|
| `customer_name` | `truncate min-w-0 flex-1` — **the only flexible element; it absorbs all pressure** |
| "Contact" chip | `flex-shrink-0`, only if email or phone present |
| status badge | `flex-shrink-0`, suppressed for `confirmed`/`pending` |
| `£{total}` | `flex-shrink-0` |
| `paidChip` (`PAID` / `£x / £y due`) | `flex-shrink-0`, only when `showPaidStep` and something is paid |

The comment at [:556-562](components/dashboard/OrderCard.tsx#L556-L562) records that this two-row split
exists **because** of a crowding regression: *"Contact + PRICE are flex-shrink-0 so they keep their size
and never crowd the name out (the 'Dom'→'D…' fix)."*

*Window/KDS header, row 1* ([:608-615](components/dashboard/OrderCard.tsx#L608-L615)): `#{order.id}`
(`text-3xl font-bold`) · `£{total}` (`text-base`) · `paidChip` · `✓`.
*Row 2* ([:617-633](components/dashboard/OrderCard.tsx#L617-L633)): `customer_name` (`truncate
min-w-0`) · Contact chip · `timeLabel` (`ml-auto`) · offset/late pill.

Comment at [:604-605](components/dashboard/OrderCard.tsx#L604-L605): *"TWO-ROW header (was a single
cramped row that truncated name + clipped price at the dense 240px column)."*

*Cook header* ([:530-549](components/dashboard/OrderCard.tsx#L530-L549)): `#{order.id}` · time + offset
/ row 2: name · Contact · `✓`. No price, no paid chip.

**Button row occupants** ([:419-513](components/dashboard/OrderCard.tsx#L419-L513)) — every `Btn` is
`flex-1 min-w-[72px]` ([:40](components/dashboard/OrderCard.tsx#L40)):

- `pendingSync` → "⏳ Syncing…" placeholder.
- `pending` → `✓ Confirm` + `✗ Reject` (2 buttons).
- cook + confirmed/modified → `Start cooking` + `Ready` when `kdsMode`, else `Ready` alone.
- cook + cooking → "🔥 Cooking…" text + `Ready`.
- window + kdsMode + confirmed/modified → "⏳ Waiting" chip + disabled completion button.
- solo/window completion → `completionBtn()` ([:172-214](components/dashboard/OrderCard.tsx#L172-L214)),
  which is **1 or 2 buttons** depending on settings: `Paid & collected` (paid step off) · `Collected`
  (paid) · `Mark £X.XX paid` (part paid) · or **`💷 Cash` + `💳 Card` side by side** when `takesCash`.
- solo + collected → `↩ Undo`.
- Above all of these, solo only: a ghost row of `✏ Edit` + `✕ Cancel`, both `flex-1`
  ([:820-835](components/dashboard/OrderCard.tsx#L820-L835)).

**Two space constraints recorded in the file as hard rules:**

- [:194-196](components/dashboard/OrderCard.tsx#L194-L196) — *"Labels are BARE on the card, no amounts…
  at the 240px KDS column an amount would not fit beside a second button."*
- [:785-791](components/dashboard/OrderCard.tsx#L785-L791) — the notes box's `mb-3` in window mode is
  *"a SAFETY property here, not a cosmetic one"* (operators completing orders while reaching to read a
  note). *"Do not reduce it."*

**Dead-but-present code:** `ITEM_TICK_ENABLED = false`
([:20](components/dashboard/OrderCard.tsx#L20)) disables per-item tap-to-tick. Consequently
`struckUnits`, `tapItem`, `allStruck`, the `✓` marks and the `opacity-50` root class are all reachable
in source but never true at runtime.

### 2.4 KDS column width

**240px minimum, `auto-fill`, grid mode only.**
[app/dashboard/[token]/kds/page.tsx:1039-1042](app/dashboard/[token]/kds/page.tsx#L1039-L1042):

```tsx
style={activeLayout === 'grid'
  ? { gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }
  : undefined
}
```

The class beside it ([:1031-1038](app/dashboard/[token]/kds/page.tsx#L1031-L1038)) is
`'grid gap-3 items-stretch p-3'` for grid and `'flex flex-col gap-3 p-3'` for list. Comment at
[:1034-1035](app/dashboard/[token]/kds/page.tsx#L1034-L1035): *"BOTH views' grid use the SAME compact
auto-fill density… Window dropped its fixed `grid-cols-2 xl:grid-cols-3` (≈3 wide cards) to match Cook's
≈4-across."*

This is the **only** place 240px is set. The dashboard uses container queries instead —
`grid grid-cols-1 @md:grid-cols-2 @2xl:grid-cols-3 gap-3`
([page.tsx:2720](app/dashboard/[token]/page.tsx#L2720), [:2726](app/dashboard/[token]/page.tsx#L2726)).

---

## 3. WRITE PATH

### 3.1 Every path that mutates an `orders` row after creation

**Nine distinct sites.** One route dominates; it is not the only one.

**A. `POST /api/dashboard/action` — 9 update sites, the primary operator path.**
Both the dashboard and the KDS post here. Actions and their writes:

| Action | Line | Write |
|---|---|---|
| `confirm` | [211](app/api/dashboard/action/route.ts#L211) | `{ status: 'confirmed' }` |
| `reject` | [262](app/api/dashboard/action/route.ts#L262) | `{ status: 'rejected', rejection_reason }` |
| `cancel` | [295](app/api/dashboard/action/route.ts#L295) | `{ status: 'cancelled', cancellation_reason }` |
| `ready` | [332](app/api/dashboard/action/route.ts#L332) | `{ status: 'ready' }` |
| `undo_ready` | [361](app/api/dashboard/action/route.ts#L361) | `{ status: 'confirmed' }` |
| `cooking` | [370](app/api/dashboard/action/route.ts#L370) | `{ status: 'cooking' }` |
| `collected` | [419](app/api/dashboard/action/route.ts#L419) | status + `paid_at` + `collected_at` + `status_before_collected` |
| `undo_collected` | [516](app/api/dashboard/action/route.ts#L516) | status + clears the three above |
| `edit` | [655-676](app/api/dashboard/action/route.ts#L655-L676) | items, deals, slot, notes, customer_*, totals, `status:'modified'` |
| `adjust_slot_+N` | [1439](app/api/dashboard/action/route.ts#L1439) | `{ slot, status: 'confirmed' }` |

Every one is scoped `.eq('order_key', orderKey).eq('truck_id', truck.id)` — **except `adjust_slot_+N`
at line 1439, which omits the `truck_id` filter.**

**B. Order creation, same route** — `action: 'manual'` (walk-up), lines
[1032-1068](app/api/dashboard/action/route.ts#L1032-L1068). Upsert when the client minted an
`order_key` (offline replay idempotency), plain insert otherwise.

**C. `POST /api/orders/cancel`** — customer-initiated.
[app/api/orders/cancel/route.ts:82](app/api/orders/cancel/route.ts#L82):
```ts
.update({ status: 'cancelled', cancellation_reason: 'Customer cancelled' })
```

**D. `POST /api/events/action`, event-cancel branch** — bulk.
[app/api/events/action/route.ts:180-186](app/api/events/action/route.ts#L180-L186):
```ts
await supabase
  .from('orders')
  .update({
    status: 'cancelled',
    cancellation_reason: `Event cancelled${fullNote ? ': ' + fullNote : ''}`,
  })
  .in('order_key', orderKeys)
```

**E. `lib/payments/ledger.ts:215`** — the derived payment cache, called from the `collected` /
`mark_paid*` / `undo_mark_paid` handlers:
```ts
.update({ payment_status: balance.status, amount_paid: fromMinor(balance.paidMinor) })
```
[lib/supabase.ts:49-51](lib/supabase.ts#L49-L51) marks both columns *"DERIVED CACHES — recomputed from
the order_payments ledger… Never written by hand."*

**F. Customer order placement** — `supabase.rpc('place_order_atomic', …)` at
[app/api/orders/submit/route.ts:904](app/api/orders/submit/route.ts#L904). SQL-side insert, so it
carries its own explicit column list (see the migrations named in §7) — a new column must be added there
too or it will never be set on customer orders.

**G. Row-deleting paths (demo only):** [lib/provision-demo-event.ts:115](lib/provision-demo-event.ts#L115),
[lib/demo-restart.ts:81](lib/demo-restart.ts#L81). Demo seeding inserts at
[lib/seed-demo-orders.ts:379](lib/seed-demo-orders.ts#L379).

**H. Trigger.** `orders_set_updated_at` bumps `updated_at` on every UPDATE
(`20260703_orders_updated_at_trigger.sql`), which is what the client merge guard depends on
([lib/orders/mergeOrders.ts:9-13](lib/orders/mergeOrders.ts#L9-L13)).

**I. The offline outbox replay.** Not a distinct endpoint — `drainOutbox()` re-posts queued bodies to
`/api/dashboard/action` FIFO ([lib/native/orderGate.ts:5-8](lib/native/orderGate.ts#L5-L8)), guarded by
`expected_from` / `STATUS_REPLAY_EXPECTED_FROM`.

There are **no direct client-side Supabase writes to `orders`**. The browser client
(`supabaseBrowser`) is used only for realtime channels and two narrow reads
([page.tsx:791](app/dashboard/[token]/page.tsx#L791)).

### 3.2 Optimistic UI on the card

**Yes — but only for the OFFLINE branch, and it is not a `setState` patch.**

Online, the card is not optimistic at all: `doAction` awaits the server, shows a toast, then
`await fetchAll()` ([app/dashboard/[token]/page.tsx:1496](app/dashboard/[token]/page.tsx#L1496)).
The only immediate visual feedback is `actionLoading` — set at
[:1420](app/dashboard/[token]/page.tsx#L1420) as `` `${action}-${orderKey}` `` and read back in the card
at [OrderCard.tsx:161](components/dashboard/OrderCard.tsx#L161):

```ts
const isLoading = (action: string) => actionLoading === `${action}-${order.order_key}`
```

which renders `'...'` in place of the label ([OrderCard.tsx:41](components/dashboard/OrderCard.tsx#L41)).

Offline, the optimistic advance is a **durable render-time overlay derived from the outbox**, not a
state patch. [app/dashboard/[token]/page.tsx:1424-1429](app/dashboard/[token]/page.tsx#L1424-L1429):

```ts
if(result.queued){
  // OFFLINE: the optimistic advance is now a DURABLE render-time overlay derived from the outbox (FIX 2),
  // NOT a one-shot setOrders patch (a stale poll / SW-cache read would wipe that — the revert bug). We
  // just refresh the overlay so the card advances instantly; it outlives reads and auto-clears on drain.
  const q=orders.find(o=>o.order_key===orderKey)??deviceQueuedOrders.find(o=>o.order_key===orderKey)
  refreshPendingStatus()
```

The fold lives in [lib/native/orderGate.ts:68-84](lib/native/orderGate.ts#L68-L84) (`buildStatusOverlay`),
shared by both surfaces. The KDS mirror is
[kds/page.tsx:455-462](app/dashboard/[token]/kds/page.tsx#L455-L462) and additionally sets
`pendingSync`, which is the prop that gives the card its amber border and "⏳ Syncing…" row.

Offline **creation** is separately optimistic: `AddOrderPanel` builds a whole fake `Order`
([AddOrderPanel.tsx:935-943](components/dashboard/AddOrderPanel.tsx#L935-L943)) and hands it to
`onOrderPlaced`, which pushes it into an isolated `deviceQueuedOrders` list
([page.tsx:2813](app/dashboard/[token]/page.tsx#L2813)).

There is also a **generic optimistic-write guard for settings** — `markPending(key, value)` /
`applyPending(key, …)` ([page.tsx:203-217](app/dashboard/[token]/page.tsx#L203-L217)) — with the comment
*"a class that has bitten THREE times (offline-protection, category-available, …)"*
([:1176-1177](app/dashboard/[token]/page.tsx#L1176-L1177)). It applies to truck/event settings, **not**
to order rows.

### 3.3 Cross-device refresh

Identical pattern on both surfaces: **two Supabase realtime channels + a 60 s polling fallback**, and
both channels call the same refetch.

Dashboard, [app/dashboard/[token]/page.tsx:825-832](app/dashboard/[token]/page.tsx#L825-L832):

```ts
const ordersChannel=supabaseBrowser
  .channel(`orders:${truck.id}`)
  .on('postgres_changes',{event:'*',schema:'public',table:'orders',filter:`truck_id=eq.${truck.id}`},
    ()=>fetchAllRef.current())
  .subscribe()
const truckChannel=supabaseBrowser
  .channel(`truck:${truck.id}`)
  …
  .on('postgres_changes',{event:'UPDATE',schema:'public',table:'trucks',filter:`id=eq.${truck.id}`},
    ()=>reseedRef.current())
```

and [:869](app/dashboard/[token]/page.tsx#L869): `const fallbackInterval=setInterval(()=>fetchAllRef.current(),60000)`.

KDS, [kds/page.tsx:368-400](app/dashboard/[token]/kds/page.tsx#L368-L400) — same two channels
(`kds-orders:` / `kds-truck:`) plus `setInterval(() => fetchAllRef.current(), 60000)`; the orders
handler additionally plays the new-order sound on `INSERT`.

Both refetch `/api/dashboard`. The subscription is **row-level on the whole `orders` table filtered by
`truck_id`** — any column change on any of the truck's orders fires a full refetch on every connected
device.

Two facts recorded in the file that constrain what may be added to realtime:

- Only `orders` and `trucks` are in the Supabase realtime publication —
  [page.tsx:855](app/dashboard/[token]/page.tsx#L855) (*"live query: only `orders` and `trucks` are"*).
- `truck_vans` must **not** be published because `last_heartbeat_at` is updated every 15 s per device and
  `postgres_changes` filters by row, not column ([:838-866](app/dashboard/[token]/page.tsx#L838-L866)).
  `truck_events` was declined for the same "wrong ratio" reason
  ([:1189](app/dashboard/[token]/page.tsx#L1189), [:1211](app/dashboard/[token]/page.tsx#L1211)).

Incoming rows are not applied blindly. [page.tsx:637](app/dashboard/[token]/page.tsx#L637):

```ts
setOrders(prev=>mergeOrders(prev,data.orders||[]))
```

`mergeOrders` is a version-guarded per-`order_key` merge keyed on `updated_at`, with a lifecycle-rank
backstop ([lib/orders/mergeOrders.ts:33-55](lib/orders/mergeOrders.ts#L33-L55)).

---

## 4. THE ADD-ORDER FLOW

### 4.1 File and structure

[components/dashboard/AddOrderPanel.tsx](components/dashboard/AddOrderPanel.tsx) — 1,943 lines, one
exported component. Mounted as a tab in the dashboard, **never unmounted**:
[app/dashboard/[token]/page.tsx:2790-2794](app/dashboard/[token]/page.tsx#L2790-L2794):

```tsx
{/* ADD ORDER TAB — always mounted (manual s.22): basket state lives inside
    AddOrderPanel and must survive tab switches. Hidden via CSS, never unmounted. */}
{truck&&(
  <div className={activeTab==='add'?'h-full min-h-0 flex flex-col':'hidden'}>
  <AddOrderPanel
```

The tab is registered at [page.tsx:2232](app/dashboard/[token]/page.tsx#L2232):
`['add','+ Add order']`, alongside `orders`, `stock`, `settings`. **The KDS has no Add Order** — the
panel is imported only by the dashboard page.

The panel renders as named JSX fragments assembled at the bottom. The relevant one is `submitPanel`,
[AddOrderPanel.tsx:1123-1139](components/dashboard/AddOrderPanel.tsx#L1123-L1139):

```tsx
const submitPanel = (
  <div className="border-t border-slate-200 p-4 flex flex-col gap-3 bg-white shrink-0">
    {hasItems && (
      <div className="flex justify-between text-base font-semibold text-slate-900">
        <span>Total</span>
        <span>£{manualTotal.toFixed(2)}</span>
      </div>
    )}
    <input
      type="text"
      placeholder="Customer name — optional"
      value={manualName}
      onChange={e => setManualName(e.target.value)}
      className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
    />
    {slotSelector}
    {contactDetails}
```

Order inside `submitPanel`: **Total → name input → `slotSelector` → `contactDetails` → payment decision
row**. So the position "beside Customer name — optional" is
[AddOrderPanel.tsx:1131-1137](components/dashboard/AddOrderPanel.tsx#L1131-L1137); the input is
currently `w-full` with no wrapping flex row, so there is no existing sibling slot on that line.

The immediate neighbour below is `contactDetails`
([:1107-1121](components/dashboard/AddOrderPanel.tsx#L1107-L1121)) — a collapsed `<details>` labelled
"+ Add email / phone / notes" containing email, phone, and an order-notes textarea, all styled
identically (`border border-slate-200 rounded-xl px-3 py-2.5 text-sm … focus:ring-teal-400`).

Below that, the payment decision row ([:1140-1149](components/dashboard/AddOrderPanel.tsx#L1140-L1149))
carries a documented layout constraint: *"A ROW, not a stack… The amount is stacked under the label so it
can never clip at narrow widths."*

### 4.2 Is the name's save path the same as the card's edit path?

**No. They are different paths that both terminate in the same route file.**

Add Order posts `action: 'manual'`, and the name is one key on a `manualOrder` object.
[AddOrderPanel.tsx:884-930](components/dashboard/AddOrderPanel.tsx#L884-L930):

```ts
const orderKey = newUuid()
const provisional = isOnline() ? '' : await nextProvisionalId()
const manualOrder = {
  order_key: orderKey,
  provisional_id: provisional || null,
  customerName: manualName,
  customerPhone: manualPhone || null,
  customerEmail: manualEmail || null,
  slot: effectiveSlot,
  items: manualItems,
  …
}
const result = await gatedAction({
  url: '/api/dashboard/action',
  kind: 'create', order_key: orderKey, provisional_id: provisional, online: isOnline(),
  body: { token, pin, action: 'manual', manualOrder },
})
```

Server side it becomes an **INSERT** ([route.ts:1032-1068](app/api/dashboard/action/route.ts#L1032-L1068)):

```ts
const insertPayload: Record<string, any> = {
  id: newOrderId, truck_id: truck.id,
  customer_name: customerName || 'Walk-up', customer_phone: customerPhone || null,
  customer_email: customerEmail || null,
  slot: slot || null, order_type: 'collection', event_date: eventDate,
  event_id: orderEventId,
  items, deals, discount_code: null,
  subtotal: subtotal || total, discount_amt: discountAmt || 0, total: finalTotal,
  deal_savings: Number(dealSavings) > 0 ? Number(dealSavings) : null,
  total_minor: toMinor(finalTotal),
  capacity_ack_at: manualOrder?.capacityAcknowledged === true ? new Date().toISOString() : null,
  notes: notes || null, status: 'confirmed',
  payment_status: 'unpaid',
}
```

The card's edit posts `action: 'edit'` with an `editedOrder` object and becomes an **UPDATE** (§1.4
Pattern A). Different action, different request shape, different verb.

**What they share:** the `'Walk-up'` sentinel for a blank name is implemented twice — insert at
[route.ts:1034](app/api/dashboard/action/route.ts#L1034), edit at
[route.ts:667](app/api/dashboard/action/route.ts#L667), with the edit-side comment explicitly citing the
insert as its source (*"same default as the manual insert"*). Both also route through `gatedAction` (edit
does not — it uses a bare `fetch`, see [page.tsx:1562](app/dashboard/[token]/page.tsx#L1562)).

---

## 5. SETTINGS

### 5.1 Where truck-level toggles live

**Two distinct surfaces, deliberately.**

- **Truck-level defaults** → Manage → Settings,
  [app/manage/[token]/page.tsx](app/manage/[token]/page.tsx) (~8,200 lines). Writes `trucks.*`.
- **Per-event overrides** → the dashboard's own Settings tab,
  [app/dashboard/[token]/page.tsx](app/dashboard/[token]/page.tsx) (`activeTab==='settings'`). Writes
  `truck_events.*_override`.

The boundary is stated at [page.tsx:1169-1170](app/dashboard/[token]/page.tsx#L1169-L1170): *"PER-EVENT
ONLY. This writes truck_events.show_paid_step_override for the CURRENT event and must NEVER write
trucks.show_paid_step — that default belongs to Manage → Settings."*

### 5.2 `show_paid_step` and `takes_cash` — render and save

**Render**, [app/manage/[token]/page.tsx:7791-7850](app/manage/[token]/page.tsx#L7791-L7850). Both sit
in one grey sub-panel:

```tsx
<div className="pt-3 border-t border-slate-100">
  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 divide-y divide-slate-200/70">
    <div className="pb-3">
      <p className={SUBCARD_HEADING}>Taking payment</p>
      <p className="text-xs text-slate-500 mt-0.5">Your defaults. Either can be changed for a single event from the dashboard.</p>
    </div>
    <div className="flex items-center justify-between gap-3 py-3">
      <div>
        <p className="text-sm font-semibold text-slate-800">Separate paid step</p>
        <p className="text-xs text-slate-500 mt-0.5">Splits "Paid &amp; collected" into "Mark paid" then "Collected", so you can take money before the food is handed over. You can change this for a single event from the dashboard.</p>
      </div>
      <Toggle
        on={(form as any).show_paid_step === true}
        onToggle={() => { const next = (form as any).show_paid_step !== true; setForm(p => ({...p, show_paid_step: next} as any)); saveSetting('show_paid_step', next) }}
      />
    </div>
```

and the nested child, [:7826-7847](app/manage/[token]/page.tsx#L7826-L7847):

```tsx
<div className="flex items-center justify-between gap-3 py-3 pl-4">
  <div>
    <p className="text-sm font-semibold text-slate-800">Do you take cash?</p>
    <p className="text-xs text-slate-500 mt-0.5">Splits the payment button into "Cash" and "Card" so your takings reconcile against the till. You can turn this on for a single event from the dashboard.</p>
    …
    {(form as any).show_paid_step !== true && (
      <p className="text-xs text-amber-600 mt-1">Needs the separate paid step turned on.</p>
    )}
  </div>
  <Toggle
    on={(form as any).takes_cash === true}
    disabled={(form as any).show_paid_step !== true}
    onToggle={() => { const next = (form as any).takes_cash !== true; setForm(p => ({...p, takes_cash: next} as any)); saveSetting('takes_cash', next) }}
  />
</div>
```

The pattern, precisely: **row = flex justify-between; left column = `text-sm font-semibold` label +
`text-xs text-slate-500` explanation; right = shared `Toggle`; onToggle computes `next`, patches local
`form` optimistically, then calls `saveSetting(key, next)`.** No await, no revert-on-failure.
`Toggle` is imported from `components/dashboard/OrderCard`
([OrderCard.tsx:24-32](components/dashboard/OrderCard.tsx#L24-L32)).

⚠️ Both nesting decisions are documented and were reversed once — see the block comments at
[:7780-7790](app/manage/[token]/page.tsx#L7780-L7790) (de-nested) and
[:7807-7825](app/manage/[token]/page.tsx#L7807-L7825) (re-nested, with *"READ THIS BEFORE RE-FLATTENING
IT"*).

**Save**, [app/manage/[token]/page.tsx:7074-7084](app/manage/[token]/page.tsx#L7074-L7084):

```ts
const saveSetting = async (key: string, value: string | boolean | number | null) => {
  try {
    await api('update_truck', { data: { [key]: value } })
    // update_truck returns only { ok }, so merge the just-written key/value into the parent `truck`
    // locally (it's exactly what the server accepted) — keeps it fresh so a remount re-seeds the
    // local mirrors (preferredContact / allowCancellation / cancellationCutoff …) from the NEW value.
    onTruckUpdate({ [key]: value } as Partial<Truck>)
  } catch (e: any) {
    showToast(e.message, 'error')
  }
}
```

**Server allowlist** — [app/api/manage/route.ts:853-861](app/api/manage/route.ts#L853-L861):

```ts
if (action === 'update_truck') {
  const allowed = ['crew_mode', 'kds_mode', 'display_mode', 'extra_wait_mins', 'paused_until', 'whatsapp_sender', 'preferred_contact_method', 'allow_customer_cancellation', 'cancellation_cutoff_mins', 'default_auto_open', 'default_auto_close', 'qr_code_style', 'scraper_preference', 'schedule_url', 'scraper_rule', 'preorders_enabled', 'preorder_deadline_type', 'preorder_deadline_value', 'preorder_past_action', 'preorder_open_rule', 'truck_order_email_enabled', 'setup_step', 'show_paid_step', 'takes_cash']
  const safeData = Object.fromEntries(
    Object.entries(body.data || {}).filter(([key]) => allowed.includes(key))
  )
  const { error } = await supabase.from('trucks').update(safeData).eq('id', truck.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

⚠️ **The allowlist silently drops unknown keys.** Flagged in the UI comment at
[app/manage/[token]/page.tsx:7788-7790](app/manage/[token]/page.tsx#L7788-L7790): *"that list SILENTLY
DROPS anything not on it, so a missing key means the toggle appears to save, returns {ok:true}, and
writes nothing."* The route also carries a long comment at
[app/api/manage/route.ts:840-852](app/api/manage/route.ts#L840-L852) explaining that `plan`,
`trial_expires_at` and `feature_overrides` must never be on this list (token-only auth).

The truck-level `Truck` interface the Manage page uses is declared inline at
[app/manage/[token]/page.tsx:48](app/manage/[token]/page.tsx#L48) — a new column must be added there too
or `form` will not carry it.

**Per-event override counterparts** (dashboard Settings tab): actions
`set_show_paid_step_override` ([route.ts:1498](app/api/dashboard/action/route.ts#L1498)) and
`set_takes_cash_override` ([route.ts:1523](app/api/dashboard/action/route.ts#L1523)), posted from
[page.tsx:1200](app/dashboard/[token]/page.tsx#L1200) / [:1218](app/dashboard/[token]/page.tsx#L1218).
Resolution of truck default vs event override is centralised in `lib/payments/paid-step.ts`
(`resolvePaidStep`), which `OrderCard` calls directly
([OrderCard.tsx:146](components/dashboard/OrderCard.tsx#L146)) — the comment at
[:142-145](components/dashboard/OrderCard.tsx#L142-L145) states this is deliberate so the card and the
server cannot disagree.

### 5.3 Existing numeric-range / min-max settings — YES, four, in three different idioms

**(a) Fixed-option `<select>` — truck-level, saved via `saveSetting`.** `cancellation_cutoff_mins`,
[app/manage/[token]/page.tsx:7352-7378](app/manage/[token]/page.tsx#L7352-L7378):

```tsx
<p className="text-sm text-slate-700 mt-0.5">
  Customers can cancel up to{' '}
  <select
    value={cancellationCutoff}
    onChange={async e => {
      const val = parseInt(e.target.value)
      setCancellationCutoff(val)
      await saveSetting('cancellation_cutoff_mins', val)
    }}
    className="border-b border-slate-300 text-xs px-1 bg-transparent"
  >
    <option value="15">15 minutes</option>
    <option value="30">30 minutes</option>
    <option value="60">60 minutes</option>
    <option value="120">2 hours</option>
  </select>
  {' '}before their pickup time
</p>
```

Local mirror state seeded at [:6879](app/manage/[token]/page.tsx#L6879):
`const [cancellationCutoff, setCancellationCutoff] = useState(truck.cancellation_cutoff_mins ?? 30)`.

**(b) Generated 1–20 range `<select>` with a null/∞ option** — the closest thing to a bounded numeric
range in the app. Dashboard Settings, kitchen capacity,
[app/dashboard/[token]/page.tsx:3102-3122](app/dashboard/[token]/page.tsx#L3102-L3122):

```tsx
<select
  value={kitchenCapacity??''}
  aria-label="Total capacity (items)"
  disabled={!activeEvent.van_id||isOffline}
  onChange={e=>saveKitchenCapacity(e.target.value===''?null:parseInt(e.target.value))}
  className="w-full border border-slate-200 rounded-lg px-2 py-1 text-slate-700 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50">
  <option value="">∞</option>
  {Array.from({length:20},(_,i)=>i+1).map(n=>(
    <option key={n} value={n}>{n} item{n!==1?'s':''}</option>
  ))}
</select>
<select
  value={capacityWindowMins}
  aria-label="Capacity window (minutes)"
  disabled={!activeEvent.van_id||kitchenCapacity==null||isOffline}
  onChange={e=>saveCapacityWindow(parseInt(e.target.value))}
  …>
  {Array.from({length:20},(_,i)=>i+1).concat((capacityWindowMins>20)?[capacityWindowMins]:[]).map(n=>(
    <option key={n} value={n}>every {formatPrepSecs(n*60)}</option>
  ))}
</select>
```

Note the `.concat((capacityWindowMins>20)?[capacityWindowMins]:[])` idiom — an out-of-range stored value
is appended rather than silently coerced. Saved with the optimistic guard,
[page.tsx:1302](app/dashboard/[token]/page.tsx#L1302) / [:1311-1312](app/dashboard/[token]/page.tsx#L1311-L1312),
via `POST /api/manage` `action: 'update_van_settings'` — a **van-level** write, not truck-level.

**(c) `<input type="number" min max>` — the only true HTML min/max pair.** But it is a **device-local**
pref (localStorage), not a truck setting.
[components/printing/PrintingSettings.tsx:114-118](components/printing/PrintingSettings.tsx#L114-L118):

```tsx
<label className="flex items-center justify-between gap-3 text-sm">
  <span className="text-slate-700">Print tickets this many minutes before due</span>
  <input type="number" min={0} max={60} value={lead} onChange={e => setLeadMins(Number(e.target.value) || 0)}
    className="w-20 border border-slate-300 rounded-lg px-2 py-1 text-sm text-right" />
</label>
```

**(d) A stored numeric min/max PAIR** — `modifier_groups.min_choices` / `max_choices`. Menu-level, not
truck-level, and there is no direct min/max UI: `min_choices` is derived from the `is_required` toggle.
[app/manage/[token]/page.tsx:4833-4846](app/manage/[token]/page.tsx#L4833-L4846):

```ts
const max_choices = patch.max_choices ?? group.max_choices ?? 99
let min_choices = group.min_choices
…
  min_choices = is_required ? 1 : 0
  if (min_choices > max_choices) min_choices = max_choices
```

**Other numeric truck columns with no dedicated range UI:** `walkin_buffer_pct` (default 20),
`slot_duration_mins` (10), `collection_interval_mins` (5), `extra_wait_mins` (0),
`scrape_times_per_day` (3), `preorder_deadline_value`, `items_per_minute`.

---

## 6. SCHEMA — live

Source: live PostgREST OpenAPI, fetched 2026-08-03. `NOT NULL` = present in the definition's `required`
array.

### 6.1 `orders` — 37 columns

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | text | NOT NULL | — |
| `truck_id` | text | nullable | — (FK → `trucks.id`) |
| `customer_name` | text | NOT NULL | — |
| `customer_phone` | text | nullable | — |
| `customer_email` | text | nullable | — |
| `slot` | text | nullable | — |
| `order_type` | text | nullable | `'collection'` |
| `table_ref` | text | nullable | — |
| `event_date` | date | NOT NULL | — |
| `items` | jsonb | NOT NULL | — |
| `extras` | jsonb | nullable | — |
| `bundle` | text | nullable | — |
| `discount_code` | text | nullable | — |
| `subtotal` | numeric | NOT NULL | — |
| `discount_amt` | numeric | nullable | `0` |
| `total` | numeric | NOT NULL | — |
| `notes` | text | nullable | — |
| `status` | text | nullable | `'pending'` |
| `modify_type` | text | nullable | — |
| `modify_data` | jsonb | nullable | — |
| `payment_status` | text | nullable | `'unpaid'` |
| `amount_paid` | numeric | nullable | — |
| `created_at` | timestamptz | nullable | `now()` |
| `updated_at` | timestamptz | nullable | `now()` |
| `deals` | jsonb | nullable | — |
| `source` | text | nullable | `'web'` |
| `paid_at` | timestamptz | nullable | — |
| `collected_at` | timestamptz | nullable | — |
| **`event_id`** | **uuid** | **nullable** | — (FK → `truck_events.id`) |
| `cancellation_reason` | text | nullable | — |
| `van_id` | uuid | nullable | — (FK → `truck_vans.id`) |
| **`order_key`** | **uuid** | **NOT NULL** | `gen_random_uuid()` — **PRIMARY KEY** |
| `rejection_reason` | text | nullable | — |
| `status_before_collected` | text | nullable | — |
| `total_minor` | integer | nullable | — |
| `deal_savings` | numeric | nullable | — |
| `capacity_ack_at` | timestamptz | nullable | — |

Note the two-id architecture: `id` is a **text** per-event display number ("Order #5"), `order_key` is
the uuid PK. [components/dashboard/types.ts:28-31](components/dashboard/types.ts#L28-L31): *"Per-event
display number… Human-facing only — never a lookup key."* / *"UUID row identity. Every lookup, update,
React key, action payload."*

Also note: `id` is text, not integer, because offline-created orders keep a device-prefixed provisional
number like `M3` permanently ([route.ts:1008-1015](app/api/dashboard/action/route.ts#L1008-L1015)).

### 6.2 `event_id` — DIRECT column, no join needed

**Confirmed.** `orders.event_id uuid`, nullable, FK → `truck_events.id`. It is filtered directly in
production code with no join:

- [app/api/dashboard/route.ts:199-202](app/api/dashboard/route.ts#L199-L202): `.eq('truck_id', truck.id).eq('event_id', selectedEventId)`
- [lib/slot-bookings.ts:220](lib/slot-bookings.ts#L220): `.eq('event_id', eventId)`

Two facts that bear on any event-scoped uniqueness:

1. **`event_id` is NULLABLE and null in practice.** The insert path sets `event_id: orderEventId` where
   `orderEventId` may be null ([route.ts:1006-1007](app/api/dashboard/action/route.ts#L1006-L1007):
   *"orderEventId may be null (ambiguous/no event) → truck fallback"*). `lib/slot-bookings.ts` notes at
   [:213-215](lib/slot-bookings.ts#L213-L215) that *"event_id IS NULL orders (which belong to no event)
   are excluded by the eq filter, so they pool into nothing."*
2. **The codebase already solves exactly this shape** for display numbers, with a **pair of partial
   unique indexes** — one scoped by event, one covering the null-event fallback. See §6.3.

### 6.3 Unique indexes and check constraints on `orders`

⚠️ **Migration-file text, not verified against the live database** (PostgREST exposes no constraint
metadata and there is no SQL-exec RPC — see §0).

**Primary key** — [20260607_order_key_per_event.sql:41-44](supabase/migrations/20260607_order_key_per_event.sql#L41-L44):
`ALTER TABLE orders ADD CONSTRAINT orders_pkey PRIMARY KEY (order_key);` (the migration first drops the
old `(id)` PK — *"the cross-truck collision bug"*, line 32).

**Two partial unique indexes** — [20260607_order_key_per_event.sql:46-52](supabase/migrations/20260607_order_key_per_event.sql#L46-L52):

```sql
-- ── 4. Display-number integrity ───────────────────────────────────────────────
-- Per-event numbering: each event has at most one "Order #5".
CREATE UNIQUE INDEX IF NOT EXISTS orders_event_display_id
  ON orders (event_id, id) WHERE event_id IS NOT NULL;
-- No-event fallback: numbers from the truck-level sequence stay unique per truck.
CREATE UNIQUE INDEX IF NOT EXISTS orders_truck_display_id_no_event
  ON orders (truck_id, id) WHERE event_id IS NULL;
```

**Check constraints:**

- `orders_status_check` — the 8 fulfilment values (quoted in full at §1.1c).
- `orders_payment_status_check` — [20260729_orders_payment_status_widen_check.sql:69-70](supabase/migrations/20260729_orders_payment_status_widen_check.sql#L69-L70):
  ```sql
  add constraint orders_payment_status_check
  check (payment_status in ('unpaid', 'paid', 'part_paid', 'refunded', 'refund_due', 'failed'));
  ```

No other constraint or index on `orders` appears anywhere in `supabase/migrations/` (80 files, grepped
for `unique`/`add constraint`/`create index` intersected with `order`). The only other order-related
unique index is on the ledger table: `order_payments_idempotency_key_uidx`
([20260729_order_payments_ledger.sql:92](supabase/migrations/20260729_order_payments_ledger.sql#L92)).

### 6.4 ⚠️ The migration folder and the live database HAVE diverged

Hard evidence, not inference: `trucks.default_walkup_payment` is **present live** (text, NOT NULL,
default `'at_order'`) despite
[supabase/migrations/20260730_drop_trucks_default_walkup_payment.sql](supabase/migrations/20260730_drop_trucks_default_walkup_payment.sql)
existing to drop it. That migration is deliberately deploy-coupled in the reverse direction (lines 5-16:
*"Additive migrations run BEFORE the deploy. A DROP must run AFTER it"*), and its own line 18-20 says
*"There is NO rush and no harm in leaving the column in place indefinitely."* So this is an expected
pending state, not a fault — but it does mean **migration files are not a reliable proxy for live schema
here**, which is precisely why §6.1 was read from the live database.

### 6.5 `trucks` — 89 columns, live

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | text | NOT NULL | — (PK) |
| `name` | text | NOT NULL | — |
| `whatsapp` | text | nullable | — |
| `sheet_id` | text | NOT NULL | — |
| `active` | boolean | nullable | `true` |
| `mode` | text | nullable | `'village'` |
| `venue_name` | text | nullable | — |
| `items_per_minute` | numeric | nullable | — |
| `walkin_buffer_pct` | integer | nullable | `20` |
| `slot_duration_mins` | integer | nullable | `10` |
| `collection_interval_mins` | integer | nullable | `5` |
| `created_at` | timestamptz | nullable | `now()` |
| `dashboard_token` | text | nullable | — |
| `dashboard_pin` | text | nullable | — |
| `auto_accept` | boolean | nullable | `false` |
| `description` | text | nullable | — |
| `cuisine_type` | text | nullable | — |
| `logo_storage_path` | text | nullable | — |
| `cover_image_path` | text | nullable | — |
| `contact_email` | text | nullable | — |
| `contact_phone` | text | nullable | — |
| `social_instagram` | text | nullable | — |
| `social_facebook` | text | nullable | — |
| `is_active` | boolean | nullable | `true` |
| `onboarded_at` | timestamptz | nullable | — |
| `website` | text | nullable | — |
| `time_selection_enabled` | boolean | NOT NULL | `true` |
| `paused_until` | timestamptz | nullable | — |
| `extra_wait_mins` | integer | NOT NULL | `0` |
| `extra_wait_started_at` | timestamptz | nullable | — |
| `kds_mode` | boolean | NOT NULL | `false` |
| `crew_mode` | text | NOT NULL | `'solo'` |
| `display_mode` | text | NOT NULL | `'list'` |
| `plan` | text | NOT NULL | `'starter'` |
| `trial_expires_at` | timestamptz | nullable | — |
| `feature_overrides` | jsonb | nullable | — |
| `country` | text | NOT NULL | `'GB'` |
| `currency` | text | NOT NULL | `'GBP'` |
| `whatsapp_sender` | text | nullable | — |
| `messenger_page_id` | text | nullable | — |
| `messenger_page_token` | text | nullable | — |
| `operator_id` | uuid | nullable | — (FK → `operators.id`) |
| `kds_pin` | text | nullable | — |
| `preferred_contact_method` | text | nullable | — |
| `allow_customer_cancellation` | boolean | nullable | `true` |
| `cancellation_cutoff_mins` | integer | nullable | `30` |
| `default_auto_open` | boolean | nullable | `true` |
| `default_auto_close` | boolean | nullable | `true` |
| `order_counter` | integer | NOT NULL | `0` |
| `qr_code_style` | text | NOT NULL | `'standard'` |
| `truck_emoji` | text | nullable | `'🍕'` |
| `slug` | text | nullable | — |
| `lifetime_discount_pct` | integer | nullable | — |
| `lifetime_discount_note` | text | nullable | — |
| `scraper_preference` | text | nullable | `'manual'` |
| `schedule_url` | text | nullable | — |
| `scraper_rule` | text | nullable | — |
| `scraper_last_changed_at` | timestamptz | nullable | — |
| `scraper_update_day` | smallint | nullable | — |
| `scraper_learning_complete` | boolean | NOT NULL | `false` |
| `scraper_last_empty_notify_at` | timestamptz | nullable | — |
| `scraper_first_run_at` | timestamptz | nullable | — |
| `scraper_last_hash` | text | nullable | — |
| `phone_is_whatsapp` | boolean | nullable | `false` |
| `preorders_enabled` | boolean | NOT NULL | `true` |
| `preorder_deadline_type` | text | nullable | — |
| `preorder_deadline_value` | integer | nullable | — |
| `preorder_past_action` | text | nullable | — |
| `scrape_times_per_day` | integer | NOT NULL | `3` |
| `scraper_last_run_at` | timestamptz | nullable | — |
| `scraper_last_text_hash` | text | nullable | — |
| `truck_order_email_enabled` | boolean | NOT NULL | `true` |
| `timezone` | text | nullable | — |
| `allergen_info_url` | text | nullable | — |
| `allergen_info_text` | text | nullable | — |
| `allergen_display_mode` | text | nullable | — |
| `preorder_open_rule` | text | NOT NULL | `'on_confirm'` |
| `show_on_vf` | boolean | NOT NULL | `false` |
| `show_on_hg` | boolean | NOT NULL | `true` |
| `order_link_vf` | boolean | NOT NULL | `false` |
| `order_link_hg` | boolean | NOT NULL | `true` |
| `is_customer` | boolean | NOT NULL | `false` |
| `excluded` | boolean | NOT NULL | `false` |
| `notes_require_review` | boolean | NOT NULL | `true` |
| `sound_config` | jsonb | NOT NULL | — |
| `setup_step` | text | nullable | — |
| **`show_paid_step`** | **boolean** | **NOT NULL** | **`false`** |
| `default_walkup_payment` | text | NOT NULL | `'at_order'` — pending drop, see §6.4 |
| **`takes_cash`** | **boolean** | **NOT NULL** | **`false`** |

Both payment toggles are `boolean NOT NULL DEFAULT false` — the "OFF = today's behaviour exactly"
pattern, stated in their DB column comments and mirrored in
[components/dashboard/types.ts:103-107](components/dashboard/types.ts#L103-L107).

Per-event override columns live on `truck_events`: `show_paid_step_override`, `takes_cash_override`,
`order_ready_override` — all nullable booleans where `NULL` means inherit
([types.ts:248-257](components/dashboard/types.ts#L248-L257)).

---

## 7. PRIOR ART

**Confirmed: nothing exists.** Case-insensitive grep across `*.ts`, `*.tsx`, `*.sql`, `*.js`, `*.md`
(excluding `node_modules`, `.next`) for `buzzer`, `pager`, `collection_number`, `table_number`, `beeper`
returned **zero matches**. A second, wider pass for `buzz`, `collection.?number`, `table.?number`,
`ticket_number`, `queue_number` also returned zero (the only `page` hits were `page.tsx` filenames and
routing comments).

**Two adjacent things that are NOT buzzer support but are worth knowing:**

1. **`orders.table_ref` exists and is completely dead.** Live column (text, nullable), typed at
   [lib/supabase.ts:35](lib/supabase.ts#L35) alongside `order_type: 'collection' | 'table'`
   ([:34](lib/supabase.ts#L34)). Grep finds **no read and no write** anywhere — every insert hardcodes
   `order_type: 'collection'`, and `table_ref` appears only in the type declaration and in the SQL
   column lists of the three `place_order_atomic` migrations
   ([20260624](supabase/migrations/20260624_place_order_atomic.sql#L71),
   [20260715](supabase/migrations/20260715_place_order_atomic_drop_drawlist.sql#L49),
   [20260728](supabase/migrations/20260728_orders_total_minor_deal_savings.sql#L88)). It is also absent
   from the dashboard's `Order` interface ([components/dashboard/types.ts:27-53](components/dashboard/types.ts#L27-L53)),
   so no operator surface would see it today even if it were populated.

2. **The order display-number system is the nearest working analogue to a short operator-facing
   identifier.** `orders.id` (text) is minted per event by
   `increment_event_order_counter(p_event_id uuid)` — an atomic `UPDATE … RETURNING` on
   `truck_events.order_counter`
   ([20260607_order_key_per_event.sql:54-72](supabase/migrations/20260607_order_key_per_event.sql#L54-L72))
   — with a truck-level `increment_order_counter(p_truck_id text)` fallback for null-event orders
   ([:78-93](supabase/migrations/20260607_order_key_per_event.sql#L78-L93)). Its uniqueness is enforced
   by the partial-index pair quoted in §6.3. Offline devices mint device-prefixed provisional numbers
   (`A13`, `M5`) via `nextProvisionalId()`
   ([lib/native/orderGate.ts:96-103](lib/native/orderGate.ts#L96-L103)) and keep them permanently, with
   the server advancing the counter to `max(current, provisionalNumber)` on sync
   ([route.ts:1075-1079](app/api/dashboard/action/route.ts#L1075-L1079)).

---

## Appendix — file inventory used

| Path | Lines | Role |
|---|---|---|
| [components/dashboard/OrderCard.tsx](components/dashboard/OrderCard.tsx) | 845 | The single shared order card |
| [components/dashboard/types.ts](components/dashboard/types.ts) | 259 | `ORDER_STATUS`, `Order`, `TruckData`, `STATUS` map |
| [components/dashboard/AddOrderPanel.tsx](components/dashboard/AddOrderPanel.tsx) | 1,943 | "+ Add order" |
| [app/dashboard/[token]/page.tsx](app/dashboard/[token]/page.tsx) | 3,920 | Dashboard: tabs, realtime, `doAction`, edit modal, per-event settings |
| [app/dashboard/[token]/kds/page.tsx](app/dashboard/[token]/kds/page.tsx) | 1,214 | KDS: `handleAction`, 240px grid, realtime |
| [app/kds/[kds_token]/page.tsx](app/kds/[kds_token]/page.tsx) | 35 | Van-token → dashboard KDS redirect |
| [app/api/dashboard/action/route.ts](app/api/dashboard/action/route.ts) | 1,744 | ~45 actions; every operator order mutation |
| [app/api/dashboard/route.ts](app/api/dashboard/route.ts) | 597 | The read both surfaces poll |
| [app/api/manage/route.ts](app/api/manage/route.ts) | — | `update_truck` allowlist |
| [app/manage/[token]/page.tsx](app/manage/[token]/page.tsx) | ~8,200 | Truck-level Settings |
| [lib/slot-bookings.ts](lib/slot-bookings.ts) | 527 | `rebuildProductionSlotUsage`, occupying-status source #1/#2 |
| [lib/orders/mergeOrders.ts](lib/orders/mergeOrders.ts) | — | Version-guarded client merge |
| [lib/native/orderGate.ts](lib/native/orderGate.ts) | — | Offline gate, status overlay, provisional ids |
| [lib/supabase.ts](lib/supabase.ts) | 71 | Server `Order`/`Truck` types + the 7-value `OrderStatus` |
