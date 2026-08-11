# Confirmation, cancellation and disposal paths — supplementary diagnosis

**Date:** 11 August 2026
**READ-ONLY. No file changed, no file created except this report. No `next dev`, no `next build`.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

🔴 **ONE ITEM CANNOT BE ANSWERED AS ASKED: `resolveAutoAcceptSlot` DOES NOT EXIST.** A repo-wide search returns zero matches. §2 reports what actually performs that job instead, and is explicit that the named symbol is **not established**.

🔴 **AND THE ANSWER TO §6 IS "NOTHING".** No cron, no edge function, no scheduled job and no request handler ages out, expires or auto-rejects a `pending` order. Stated explicitly, as instructed.

---

## 1. Every path that sets `orders.status` to `'confirmed'`

**Source: QUOTED.** ⚠️ **Filtered to the `orders` table.** A search for `'confirmed'` also matches `truck_events` writes (`manage/route.ts:687`, `events/action/route.ts:102`, `events/route.ts:103`, `discovery/events/route.ts:277`) — **those are a different table and are excluded.**

| # | File:lines | Trigger | Runs where | The write |
|---|---|---|---|---|
| 1 | `app/api/orders/submit/route.ts:901` + `:922` | **Customer**, via auto-accept | **request handler** (`POST /api/orders/submit`) | `const status = autoAccepted ? 'confirmed' : 'pending'` → passed as `p_status` to `supabase.rpc('place_order_atomic', …)` |
| 2 | `app/api/dashboard/action/route.ts:218` | **Operator** — `action: 'confirm'` | **request handler**, and 🔴 **replayable from the native outbox** (§3) | `await supabase.from('orders').update({ status: 'confirmed' }).eq('order_key', orderKey).eq('truck_id', truck.id)` |
| 3 | `app/api/dashboard/action/route.ts:368` | **Operator** — `action: 'undo_ready'` | **request handler**; `undo_ready` is **not** in the outbox status map | `await supabase.from('orders').update({ status: 'confirmed' }).eq('order_key', orderKey).eq('truck_id', truck.id)` |
| 4 | `app/api/dashboard/action/route.ts:1069` | **Operator** — walk-up / manual order creation | **request handler**, and 🔴 **replayable** (outbox kind `'create'`) | `notes: notes \|\| null, status: 'confirmed',` — inside the INSERT, **not** an update |
| 5 | `app/api/dashboard/action/route.ts:1516` | **Operator** — slot change | **request handler** | `await supabase.from('orders').update({ slot: newSlot, status: 'confirmed' }).eq('order_key', orderKey)` |
| 6 | `lib/seed-demo-orders.ts:323` | **Demo seeding** | server helper, demo trucks only | `status: 'confirmed',` in the seeded row |

**Also, but NOT a database write — flagged so it is not miscounted:**

| | | |
|---|---|---|
| `lib/native/orderGate.ts:40` | `offlineStatusPatch` | 🔴 **Client-side optimistic state only.** `if (action === 'undo_collected') return { status: order?.status_before_collected ?? 'confirmed', … }` — this is the **local UI patch** for an offline tap, not a write. |

✅ **No cron job and no edge function sets `orders.status`.** The two Supabase edge functions in the repo (`auto-event-scheduler`, `heartbeat-monitor`) write only `truck_events` and `truck_vans` — verified by enumerating their `.from(...)` calls.

---

## 2. The auto-accept path

### 🔴 `resolveAutoAcceptSlot` — NOT ESTABLISHED

```
$ grep -rn "resolveAutoAcceptSlot" --include=*.ts --include=*.tsx .
  🔴 NO SUCH SYMBOL ANYWHERE IN THE REPO
```

**There is no function of that name.** I will not quote or describe one. **What follows is the code that actually makes the decision** — an inline block in the submit route, not a named helper.

### What actually decides it — QUOTED, `app/api/orders/submit/route.ts:838-880`

```ts
const allItemsAutoAccept = orderLines.every(l => autoAcceptByName[l.name] !== false)
…
const preorderActive = preorderFeatureOn && eventStartMins != null
  && (truck as any).preorders_enabled !== false
…
const anyForcesPending = preorderActive && orderLines.some(l => {
  const cfg = preorderByName[l.name]
  if (!cfg) return false
  const pre = isPreorderDeadlinePassed(cfg, orderEventDate, eventStartMins as number, preNowDate, preNowMins)
  return pre.isPreorder && pre.passed && pre.pastAction === 'force_pending'
})
…
const orderHasNotes =
  !!(notes && notes.trim()) ||
  (Array.isArray(items) && items.some((i: any) => i?.specialInstructions?.trim())) ||
  (Array.isArray(deals) && deals.some((d: any) =>
    Object.values(d?.slotNotes ?? {}).some((n: any) => typeof n === 'string' && n.trim())))
if (
  truck.auto_accept && allItemsAutoAccept && !anyForcesPending
  && !((truck as any).notes_require_review !== false && orderHasNotes)
) {
  autoAccepted = true
}
```

### Which branches end confirmed, and which leave it pending

**Source: QUOTED.** ⚠️ **The whole block is nested inside `if (claim.booked && claim.finalSlot)`** — the comment at `:901` states it: *"pending unless auto-accepted above (only reachable when booked)"*.

| Outcome | Condition |
|---|---|
| 🟢 **CONFIRMED** | **All four true:** `truck.auto_accept` truthy · every line's `auto_accept !== false` · no line past a `force_pending` pre-order deadline · **not** (`notes_require_review !== false` **and** the order has notes) |
| 🔴 **PENDING** — truck setting | `truck.auto_accept` falsy |
| 🔴 **PENDING** — one item | **any** line whose menu item has `auto_accept === false` |
| 🔴 **PENDING** — pre-order | **any** line past a `force_pending` deadline, when the feature is on, `preorders_enabled !== false`, and the event has a `start_time` |
| 🔴 **PENDING** — notes | order-level `notes`, **or any item's `specialInstructions`, or any deal's `slotNotes`**, when `notes_require_review !== false` |
| 🔴 **PENDING** — not booked | `!claim.booked` — *"event full / lock contended … Never rejected, never overfilled"* |

⚠️ **Two `!== false` reads are safe-by-default and deliberate:** an absent `auto_accept` on an item **allows**, while an absent `notes_require_review` **reviews**.

### Same statement as the insert, or a separate write?

🔴 **THE SAME STATEMENT. Source: QUOTED.**

`const status = autoAccepted ? 'confirmed' : 'pending'` (`:901`) → passed as **`p_status`** to `place_order_atomic` (`:922`) → written **inside that function's single INSERT**:

```sql
insert into orders (
  id, truck_id, …, status, payment_status, placed_at
) values (
  …, p_status, coalesce(p_order->>'payment_status', 'unpaid'), now()
)
```
*(`supabase/migrations/20260804_place_order_atomic_placed_at.sql:74-102`)*

✅ **There is no second write. A customer order is born `confirmed` or `pending`; it is never inserted then updated.**

---

## 3. Can a `'confirmed'` change be enqueued offline and replayed?

**🔴 YES. Source: QUOTED.**

**The action map — `lib/native/orderGate.ts:26`:**

```ts
const OFFLINE_STATUS_MAP: Record<string, string> = { confirm: 'confirmed', cooking: 'cooking', ready: 'ready', collected: 'collected', cancel: 'cancelled', reject: 'rejected' }
```

**The enqueue site — `lib/native/orderGate.ts:192-195`:**

```ts
const queuedBody = { ...body, ...(expectedFrom ? { expected_from: expectedFrom } : {}), ...(queuedExtra ?? {}) }
await enqueue({ kind, order_key, url, body: queuedBody, provisional_id })
return { ok: false, queued: true, provisional_id, order_key }
```

⚠️ **Queued only on a NATIVE app that could not REACH the server.** The header states it: *"on WEB (non-native) OR on a server response (even an error), behaviour is IDENTICAL to a plain fetch… Server-side rejections (400/403/409…) are returned to the caller as today, never silently queued."*

### What the replay sends

**`lib/native/orderGate.ts:255`** — `res = await post(syncing.url, syncing.body)`

**It re-POSTs the stored `url` and `body` verbatim.** Per `OutboxOp` (`lib/native/outbox.ts:69-82`), `body` is *"the POST payload (already includes order_key / action / manualOrder)"*, plus `expected_from` merged at queue time.

### Does the op carry a timestamp of the original tap?

**🔴 IT CARRIES ONE, AND IT IS EXPLICITLY NOT USED FOR THAT PURPOSE. Source: QUOTED — `lib/native/outbox.ts:77`:**

```ts
client_ts: number      // display only — NEVER used for reconciliation
```

⚠️ **So for a `'confirm'` op there is no authoritative time-of-tap.** *(A `'buzzer'` op is different: `queuedExtra` carries the order's `placed_at` precisely so the server can arbitrate — **that mechanism is not used by status ops.**)*

### What prevents the same op replaying twice

**Three mechanisms, all QUOTED:**

1. **Removal only after a definitive ACK** — `if (res.ok) { await removeOp(syncing.op_id); synced++ }` (`orderGate.ts:266-267`).
2. 🔴 **A server-side precondition guard** — `app/api/dashboard/action/route.ts:207-211`:
   ```ts
   if (Array.isArray(body.expected_from) && orderKey && action !== 'manual') {
     const { data: cur } = await supabase.from('orders').select('status')…
     if (cur && !body.expected_from.includes(cur.status)) {
       return NextResponse.json({ error: 'conflict', current_status: cur.status }, { status: 409 })
     }
   }
   ```
   With `STATUS_REPLAY_EXPECTED_FROM = ['pending','confirmed','modified','cooking','ready','collected']` — which **includes the op's own target**, making a re-apply idempotent, and **excludes `'cancelled'`/`'rejected'`**, so *"if a customer cancelled/rejected the order online while the operator advanced it offline, the server returns 409 and the outbox flags it — never overwrites."*
3. **Idempotent write shape** — `update({ status: 'confirmed' })` is absolute, not a delta.

⚠️ **A poison op is flagged, not retried forever:** `if (syncing.attempts >= MAX_ATTEMPTS) { … state: 'conflict' … continue }`, with `MAX_ATTEMPTS = 5`.

🔴 **RELEVANT TO AUTHORIZE-THEN-CAPTURE: nothing in the replay path consults payment state.** `expected_from` guards on `status` only. A replayed `confirm` would confirm an order regardless of whether an authorization existed, had expired, or had been captured.

---

## 4. Every path that sets `'cancelled'` or `'rejected'`

**Source: QUOTED.** ⚠️ Filtered to `orders`; `truck_events` cancellations are excluded except where they cascade to orders (row 4).

### Operator-initiated

| # | File:lines | Action | Payment fields read/written |
|---|---|---|---|
| 1 | `app/api/dashboard/action/route.ts:269` | **reject** | 🔴 **NONE.** `await supabase.from('orders').update({ status: 'rejected', rejection_reason: rejectionReason \|\| null })…` — no payment field is read or written. The email says *"Please order at the truck on arrival."* |
| 2 | `app/api/dashboard/action/route.ts:302` | **cancel** | **READS `order.paid_at`** — `:315`: `const refundLine = order.paid_at ? '<p>Your refund will be processed automatically within 3–5 working days.</p>' : ''` |
| 3 | `app/api/events/action/route.ts:220` | **event cancelled** → its orders | **READS `order.paid_at`** — `:238`: `paymentStatus: order.paid_at ? 'paid' : null` |

### Customer-initiated

| # | File:lines | Action | Payment fields read/written |
|---|---|---|---|
| 4 | `app/api/orders/cancel/route.ts:82` | **customer cancel** | **READS `order.payment_status`** — `:117`: `paymentStatus: order.payment_status ?? null` |

### 🔴 What none of them does

- **None writes `payment_status`, `paid_at` or `amount_paid`.**
- **None reads the ledger.** No call to `getOrderBalance`, no query against `order_payments`.
- **None touches Stripe** — no refund, no PaymentIntent cancellation.

⚠️ **Two read `paid_at` and one reads `payment_status` — for EMAIL COPY ONLY.** Neither value changes what the handler does.

⚠️ **`paid_at` is described in the same file as non-canonical** — `app/api/dashboard/action/route.ts:532`: *"payment_status is now canonical; paid_at remains only as a"* — **the comment is truncated mid-sentence in the file itself**, so its remaining role is **not established**.

---

## 5. The three refund-copy sites

**Source: QUOTED**

### (a) `app/api/orders/cancel/route.ts` — customer cancel

**Branches on:** `order.payment_status` — `:117` `paymentStatus: order.payment_status ?? null`, passed to `sendCancellationEmail`.

**The sentence — `lib/email.ts:414` and `:432`:**

```
"Your refund will be processed automatically within 3–5 working days."
```
```ts
const refundLine = paymentStatus === 'paid'
  ? `<p>Your refund will be processed automatically within 3–5 working days.</p>`
  : ''
```

### (b) `app/api/events/action/route.ts` — event cancelled

**Branches on:** `order.paid_at` — `:238` `paymentStatus: order.paid_at ? 'paid' : null`, passed to `sendEventCancellationEmail`.

**The sentence — `lib/email.ts:455`:**

```
" Your refund will be processed automatically within 3–5 working days."
```
```ts
const refundLine = paymentStatus === 'paid'
  ? ' Your refund will be processed automatically within 3–5 working days.'
  : ''
```

### (c) `app/api/dashboard/action/route.ts` — operator cancel

**Branches on:** `order.paid_at`, inline.

**The sentence — `:315`:**

```ts
const refundLine = order.paid_at ? `<p>Your refund will be processed automatically within 3–5 working days.</p>` : ''
```

### ⚠️ Observations across the three

- **All three assert the same thing: HatchGrab processes the refund automatically, in 3–5 working days.**
- **They branch on two DIFFERENT fields** — `payment_status === 'paid'` in (a), `paid_at` truthiness in (b) and (c).
- 🔴 **None reads the ledger**, which is the canonical record.
- ⚠️ **A fourth site exists on the customer's own order page** — `app/order/[id]/manage/page.tsx` — which was **rewritten** to *"any refund is handled by {truck} directly"*. **These three were not**, so the product now says two different things about the same event.

---

## 6. 🔴 Does anything age out, expire, auto-reject or dispose of a `pending` order?

**NO. NOTHING. Stated explicitly, as instructed. Source: QUOTED / exhaustive search.**

| Searched | Result |
|---|---|
| `vercel.json` | **No `crons` key at all** — only a `functions` memory/duration entry for `verify-schedule-url`, plus headers |
| `app/api/cron/*` | Exactly **two** routes: `demo-cleanup` and `account-deletion-due`. **Neither reads or writes `orders.status`.** |
| `supabase/functions/*` | `auto-event-scheduler`, `heartbeat-monitor` — their only `.from(...)` targets are **`truck_events`** and **`truck_vans`**. **Neither references `orders`.** |
| pg_cron in migrations | One mention, in `20260723_demo_sessions.sql`, in a **comment about a past failure** — not a job over orders |
| Bulk updates by status | `grep` for an update/delete filtered on `status = 'pending'` → **zero matches** |
| Time-based status change | `grep` for `'expired'`, `auto_reject`, `autoReject`, stale/expire on orders → **zero matches on the orders table** |

⚠️ **The one thing that removes orders on a schedule is `demo-cleanup`, and it is not an expiry mechanism** — it deletes **whole demo trucks** via the §7.1 cascade; their orders go with them **as a side effect of deleting the truck**, regardless of status.

🔴 **So a `pending` order persists indefinitely.** Nothing rejects it, nothing expires it, nothing releases the stock and capacity it holds. **The only transitions out of `pending` are the operator or customer actions in §1 and §4.**

---

## Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — every write quoted with file:line. The `truck_events` exclusion is **QUOTED** (different table). "No cron sets order status" is **QUOTED** from the edge functions' `.from(...)` targets. |
| 2 | 🔴 **`resolveAutoAcceptSlot`: NOT ESTABLISHED — it does not exist.** Everything else **QUOTED**, including the same-statement finding from the migration. |
| 3 | **QUOTED** — the action map, the enqueue site, the replay POST, `client_ts`'s comment, and all three anti-replay mechanisms |
| 4 | **QUOTED** — four paths, each with the payment field it touches. "None reads the ledger" is from an exhaustive grep for `getOrderBalance` / `order_payments` across those files. |
| 5 | **QUOTED** — all three sentences and all three branch fields |
| 6 | **QUOTED / exhaustive negative search.** The conclusion is a stated absence, per the instruction. |

## Not established

- `resolveAutoAcceptSlot` — **no such symbol exists**; §2 describes the inline block that does the work instead.
- The remaining role of `paid_at` — the explanatory comment at `dashboard/action/route.ts:532` is **cut off mid-sentence in the file**.
- Whether any op other than `'buzzer'` ever uses `queuedExtra` to carry a time — **only the buzzer path was found doing so**; whether that is by design for status ops is not stated anywhere I could quote.
