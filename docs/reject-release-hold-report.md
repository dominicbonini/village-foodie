# Reject: release the hold — Phase 1 findings, and a STOP

🔴 **STOPPED AT PHASE 2. NO CODE WAS WRITTEN.** Not the trigger union, not the wording, not the rename,
not the reject call site, not the email, not the SQL, and not the capture-site comment count. **Zero files
changed except this report.**

**Why:** the Phase 2 stop condition *"if the sweep's function is defined in more than one migration, STOP
and report"* is **factually met**. I asked how far the stop extended and was told to **stop everything and
decide first**, so Phase 3 is untouched in its entirety.

---

## The stop, in full

**`find_stranded_authorisations` is `create or replace`d in TWO migrations. READ** (executed grep):

```
supabase/migrations/20260815_find_stranded_authorisations.sql:47:create or replace function find_stranded_authorisations(
supabase/migrations/20260816_find_stranded_authorisations_settled.sql:57:create or replace function find_stranded_authorisations(
```

**Identical signatures**, so the later one replaces the earlier in place rather than co-existing:

```sql
create or replace function find_stranded_authorisations(
  p_grace_minutes integer default 10,
  p_limit         integer default 100
)
```

**The predicates differ by exactly one clause. READ:**

| | `20260815` | `20260816` |
|---|---|---|
| status allow-list | `and o.status in ('confirmed', 'modified', 'cooking', 'ready', 'collected')` (line 86) | **identical** (line 96) |
| payment_status guard | *(absent)* | `and coalesce(o.payment_status, 'unpaid') not in ('paid', 'refund_due')` (line 100) |

**`20260816` is a strict superset**, and its header says why it exists:

```sql
-- 🔴 STOP THE SWEEP SELECTING ORDERS THAT HAVE ALREADY BEEN PAID.
--
-- ── WHAT THIS COST, IN REAL ROWS ────────────────────────────────────────────────────────────────────
-- Orders 18 and 19, 12 August 2026. An operator pressed Mark paid at 21:14:05 and 21:14:07, booking an
-- in-person charge for each. SEVENTY SECONDS LATER this function returned both rows and the sweep
```

⚠️ **MY READING, OFFERED BUT NOT ACTED ON: `20260816` is authoritative** — later date, same signature,
strictly wider guard, written to fix a real incident. **INFERRED** from the files. 🔴 **CANNOT DETERMINE
from the repo which definition is actually live in the database** — that depends on which migrations have
been applied, which is not recorded here. **What would settle it:**
`select pg_get_functiondef(oid) from pg_proc where proname = 'find_stranded_authorisations';` — the
`20260814` migration recommends that exact query for the sibling function.

**Every established fact in the brief was re-read and is TRUE.** None was found false, so the stop is the
migration count alone.

---

# Phase 1 — the read-only findings

## 1 · `releaseHoldForCancelledOrder`, in full

**File header — it states its own guarantees:**

```ts
// lib/payments/release-hold.ts
// 🔴 GIVE A HELD CARD BACK WHEN THE ORDER IT WAS HELD FOR NO LONGER EXISTS.
//
// ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────────────────────────────
// The cancel handler updated `status`, unbooked the slot and emailed, and never touched Stripe. Neither
// sweep could pick the leftovers up either: the CAPTURE sweep's allow-list is
// ('confirmed','modified','cooking','ready','collected') — 'cancelled' is deliberately absent, because
// that job may only ever capture — and the ABANDONMENT sweep owns `promoted_at is null`, which a
// promoted order fails by construction. So a cancelled order's hold sat on a customer's card for about
// seven days against an order that no longer existed, and nothing told anyone.
//
// ── 🔴 THIS FILE ONLY EVER RELEASES. IT CANNOT TAKE MONEY. ─────────────────────────────────────────
// It imports no capture and no refund, and it makes no Stripe call of its own…
```

🔴 **THAT HEADER IS THE STRONGEST ARGUMENT FOR THE CHANGE, AND IT WAS WRITTEN ABOUT CANCEL.** Every
sentence describing the gap — the handler that "updated `status`, unbooked the slot and emailed, and never
touched Stripe", neither sweep able to see it, "about seven days" — **is true of reject today, word for
word.** The file documents the exact defect it does not yet cover.

**Outcome type:**

```ts
export type ReleaseOutcome =
  /** A live hold was cancelled at Stripe and the draft is stamped. */
  | { status: 'released'; paymentIntentId: string; amountMinor: number | null }
  /** Nothing to do, and not an error: no draft, no intent, already released, or nothing was held. */
  | { status: 'none'; reason: 'no_draft' | 'no_intent' | 'already_released' }
  /** 🔴 THE MONEY WAS TAKEN. A refund is the action, not a release, and this refuses to touch it. */
  | { status: 'captured'; paymentIntentId: string }
  /** Stripe would not cancel it. THE HOLD MAY STILL BE LIVE — see the audit row this writes. */
  | { status: 'failed'; paymentIntentId: string; detail: string }
```

**Doc comment and signature:**

```ts
/**
 * Release the authorisation behind a cancelled order, if there is one.
 *
 * 🔴 IT CANNOT THROW. Every failure is a return value, because the caller is a cancellation and a
 * cancellation must never fail because Stripe was slow — see the ordering note at both call sites.
 *
 * @param trigger which cancellation asked for it. Recorded, so "did the customer or the operator cancel
 *                this" is answerable from the audit log rather than by inference.
 */
export async function releaseHoldForCancelledOrder(
  supabase: SupabaseClient,
  args: {
    orderKey: string
    truckId: string
    trigger: 'operator_cancel' | 'customer_cancel'
    actor?: { actorKind: 'owner' | 'staff' | 'token' | 'unknown'; actorId: string | null; actorLabel: string | null }
    source?: 'web' | 'native' | 'offline_replay'
  },
): Promise<ReleaseOutcome> {
```

**Guards, ledger check, release:**

```ts
  try {
    // ── 1. IS THERE AN AUTHORISATION AT ALL? ──────────────────────────────────────────────────
    const draft = await getOrderDraft(supabase, args.orderKey)
    if (!draft) return { status: 'none', reason: 'no_draft' }
    if (!draft.payment_intent_id) return { status: 'none', reason: 'no_intent' }
    if (draft.authorization_cancelled_at) return { status: 'none', reason: 'already_released' }

    // ── 2. 🔴 WAS THE MONEY ALREADY TAKEN? IF SO, THIS IS NOT OUR ACTION. ─────────────────────
    const { data: captured, error: ledgerErr } = await supabase
      .from('order_payments')
      .select('id')
      .eq('idempotency_key', onlinePaymentIdempotencyKey(draft.payment_intent_id))
      .maybeSingle()
    if (ledgerErr) {
      // 🔴 "I COULD NOT TELL" IS A REFUSAL. A read failure is not evidence that nothing was captured,
      // and acting on that guess is how a paid order gets its charge cancelled.
      console.error(…)
      return { status: 'failed', paymentIntentId: draft.payment_intent_id, detail: `ledger read failed: ${ledgerErr.message}` }
    }
    if (captured) return { status: 'captured', paymentIntentId: draft.payment_intent_id }

    // ── 3. THE RELEASE — promoteDraft's, unchanged. ──────────────────────────────────────────
    const ok = await releaseHold(supabase, {
      order_key: draft.order_key,
      truck_id: draft.truck_id ?? args.truckId,
      payment_intent_id: draft.payment_intent_id,
    })
```

**Failure branch:**

```ts
    if (!ok) {
      // ── 🔴 THE HOLD MAY STILL BE LIVE, SO IT IS WRITTEN DOWN WHERE SOMEBODY CAN FIND IT. ────
      // `authorization_cancelled_at` stays NULL, deliberately: the draft still reads as an uncancelled
      // authorisation, which is what any future collector will look for. One query finds every one:
      //     select * from action_audit_log where action = 'hold_release_failed' order by created_at desc;
      // ⚠️ THE CANCELLATION IS NOT UNDONE. …
      console.error(
        `[release-hold] 🔴 COULD NOT RELEASE pi=${draft.payment_intent_id} for cancelled order_key=` +
        `${args.orderKey} (${args.trigger}). The order IS cancelled and a hold may remain on this ` +
        `customer's card until it expires. Recorded as hold_release_failed.`,
      )
      await logAction(supabase, {
        action: 'hold_release_failed',
        truckId: args.truckId,
        orderKey: args.orderKey,
        amountMinor: typeof draft.total_minor === 'number' ? draft.total_minor : null,
        beforeState: { payment_intent_id: draft.payment_intent_id, trigger: args.trigger },
        afterState: {
          released: false,
          meaning: 'the order was cancelled and its card authorisation was NOT released; the hold may still be live',
          resolves: 'cancel_this_intent_by_hand_or_let_it_expire',
        },
        actor,
        source: args.source ?? 'web',
      })
      return { status: 'failed', paymentIntentId: draft.payment_intent_id, detail: 'cancelAuthorization returned false' }
    }
```

**Success branch:**

```ts
    await logAction(supabase, {
      action: 'hold_released',
      truckId: args.truckId,
      orderKey: args.orderKey,
      amountMinor: typeof draft.total_minor === 'number' ? draft.total_minor : null,
      beforeState: { payment_intent_id: draft.payment_intent_id, trigger: args.trigger },
      afterState: { released: true, meaning: 'the order was cancelled and the card authorisation was released; no money moved' },
      actor,
      source: args.source ?? 'web',
    })
```

## 2 · Both call sites, in context

**Operator cancel — `app/api/dashboard/action/route.ts`:**

```ts
      // The refund goes FIRST because a refund that fails must not leave a cancelled order with the
      // customer's money still taken and nobody looking at it — money OUT is the thing that must not be
      // silently skipped. A HOLD is not money out: nothing has been taken, and a release that fails
      // leaves an authorisation that expires on its own in about a week. So the costs are reversed, and
      // so is the ordering: an operator cancelling mid-service must never be blocked by Stripe being
      // slow or unreachable, and this call cannot fail the request — every outcome is a return value.
      // ⚠️ IT ONLY EVER RELEASES. See lib/payments/release-hold: a captured order is refused outright.
      const released = await releaseHoldForCancelledOrder(supabase, {
        orderKey, truckId: truck.id, trigger: 'operator_cancel', actor, source: actorSource,
      })
      if (released.status === 'released') {
        console.log(`[cancel] hold released pi=${released.paymentIntentId} order_key=${orderKey} (operator)`)
      }
```

**Customer cancel — `app/api/orders/cancel/route.ts`:**

```ts
    // THE ORDER IS ALREADY CANCELLED ABOVE. This runs after, cannot throw, and cannot fail the request:
    // a customer must not be told their cancellation failed because Stripe was slow. A release that
    // fails writes hold_release_failed and leaves the authorisation findable.
    // ONLY EVER RELEASES: a captured order is refused by the module, because giving money back is a
    // refund and a refund is somebody's decision, not a side effect of a cancellation.
    const paymentState = await resolveEmailPaymentState(supabase, order.order_key)
    await releaseHoldForCancelledOrder(supabase, {
      orderKey: order.order_key,
      truckId: order.truck_id,
      trigger: 'customer_cancel',
      actor: { actorKind: 'unknown', actorId: null, actorLabel: null },
      source: 'web',
    })
```

🔴 **THE ORDERING PHASE 3D WOULD HAVE TO FOLLOW IS VISIBLE HERE:** `resolveEmailPaymentState` **before**
the release, so the email describes the state the customer was in — not the state the release just created.

## 3 · The reject branch, in full

```ts
    if (action === 'reject') {
      const { rejectionReason } = body
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      // Dedicated rejection_reason column (NOT cancellation_reason — a rejected order isn't cancelled).
      await supabase.from('orders').update({ status: 'rejected', rejection_reason: rejectionReason || null }).eq('order_key', orderKey).eq('truck_id', truck.id)
      if (order.event_date) {
        const itemCatMap = await buildItemCatMap(supabase, truck.id)
        await removeOrderFromProductionSlot(
          supabase, truck.id, order.event_id, order.slot,
          normaliseOrderLines(order.items || [], order.deals), itemCatMap
        )
      }
      if (order.customer_email) { … }
      return NextResponse.json({ success: true, status: 'rejected' })
    }
```

✅ **Confirmed: status, rejection_reason, capacity unbooked, one email. No payment anything.**

## 4 · The sweep's predicate, and where it is defined

**`20260816_find_stranded_authorisations_settled.sql` — the fuller of the two:**

```sql
  where
    …
    and o.status in ('confirmed', 'modified', 'cooking', 'ready', 'collected')
    …
    and coalesce(o.payment_status, 'unpaid') not in ('paid', 'refund_due')
    …
      from order_payments p
      where p.idempotency_key = 'stripe_pi:' || d.payment_intent_id
```

🔴 **DEFINED IN TWO MIGRATIONS — this is the stop.** See the top of this report.

## 5 · The rejection email body

```ts
        const reasonLine = rejectionReason ? `<p style="color:#475569">Reason: ${escapeHtml(rejectionReason)}</p>` : ''
        await notifyCustomer(truck, order.customer_email, `Order #${order.id} update`,
          `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2>Order update</h2>
            <p>Unfortunately <strong>${truck.name}</strong> is unable to fulfil order #${order.id}.</p>
            ${reasonLine}
            <p>Please order at the truck on arrival. Sorry for the inconvenience.</p>
            <p style="color:#64748b;font-size:13px">Powered by HatchGrab · hatchgrab.com</p>
          </body>`)
```

🔴 **Not one word about payment.** A customer holding a live authorisation is told to "order at the truck
on arrival".

## 6 · Every cancellation-specific string — what Phase 3B would have to change

| # | Location | String |
|---|---|---|
| 1 | success `afterState.meaning` | `'the order was cancelled and the card authorisation was released; no money moved'` |
| 2 | failure `afterState.meaning` | `'the order was cancelled and its card authorisation was NOT released; the hold may still be live'` |
| 3 | failure `afterState.resolves` | `'cancel_this_intent_by_hand_or_let_it_expire'` |
| 4 | failure `console.error` | `` `…for cancelled order_key=${args.orderKey} (${args.trigger}). The order IS cancelled and a hold may remain…` `` |
| 5 | function name | `releaseHoldForCancelledOrder` |
| 6 | trigger union | `'operator_cancel' \| 'customer_cancel'` |
| 7 | doc comment | *"Release the authorisation behind a **cancelled** order"*, *"which **cancellation** asked for it"* |
| 8 | failure comment | *"⚠️ THE CANCELLATION IS NOT UNDONE."* |

⚠️ **1–4 are the ones that would write false records.** `action_audit_log` is the designated recovery
trail — the code names the query — so a rejected order producing *"the order was cancelled"* would mislead
exactly where someone is looking during a money incident. **5–8 are naming and prose.**

⚠️ **Item 3 is subtler than it looks:** `resolves` is a machine-ish hint, not a sentence. Making it
action-aware may mean leaving it alone — the remedy for a stranded hold is identical either way.
**Flagged, not decided.**

## Rename blast radius — checked, and it is clean

**Executed grep across the repo (excluding `node_modules`): 5 hits, and no more.**

```
app/api/dashboard/action/route.ts:36    import { releaseHoldForCancelledOrder } …
app/api/dashboard/action/route.ts:369   const released = await releaseHoldForCancelledOrder(…)
app/api/orders/cancel/route.ts:5        import { releaseHoldForCancelledOrder } …
app/api/orders/cancel/route.ts:132      await releaseHoldForCancelledOrder(…)
lib/payments/release-hold.ts:50         export async function releaseHoldForCancelledOrder(
```

✅ **The definition plus two call sites (each with its import). Nothing else — no test, no re-export, no
doc reference.** **Phase 3C's "STOP if the rename touches anything beyond the definition and its call
sites" would NOT have tripped.** Recorded so that check does not need repeating.

---

## Phase 2 — stop conditions, assessed

| Condition | Result |
|---|---|
| Any established fact false | ❌ All re-read, all TRUE |
| Release function cannot be made action-aware without changing cancel behaviour | ❌ **Not tripped** — the strings are per-call-site values; cancel callers keep theirs |
| 🔴 **Sweep function defined in more than one migration** | 🔴 **TRIPPED — two `create or replace` definitions** |
| Instructions contradict | ❌ No |
| Garbled span | ❌ None |

**One tripped. Per your ruling, everything stopped.**

---

## What is NOT done, and what it is waiting on

**Nothing in Phase 3 was started.** All of it is blocked on one decision:

| Item | Blocked on |
|---|---|
| A · widen the trigger union | your go-ahead |
| B · action-aware wording | your go-ahead |
| C · rename + 2 call sites | your go-ahead (blast radius already proven clean) |
| D · call from the reject branch | your go-ahead |
| E · email payment sentence | your go-ahead |
| F · sweep allow-list SQL | 🔴 **which migration is authoritative** |
| — · capture-site comment `3 of 4` → `5 of 5` | your go-ahead |

🔴 **THE DECISION NEEDED: which definition of `find_stranded_authorisations` is live.** My reading is
`20260816`; confirm with
`select pg_get_functiondef(oid) from pg_proc where proname = 'find_stranded_authorisations';`

⚠️ **A/B/C/D/E stand alone from F.** The release call is the primary fix; the sweep is only the backstop
for when that call fails. **They could proceed without the SQL** — that was the option I offered and you
declined, and I am recording it rather than re-arguing it.

## Also outstanding, reported not fixed

- 🔴 **The customer order-status page has no `rejected` branch.** It falls through to *"This order can no
  longer be cancelled."* — silent about payment, and it does not say the order was rejected.
- ⚠️ **The capture-site comment reads "CAPTURE SITE 3 of 4" when there are five.** Stale count, live code
  path. **Not corrected — it was Phase 3 work.**

---

## Honesty

**Nothing was exercised against Stripe, and Stripe has never been live on any truck**, so no claim here is
production-verified. Everything above is **READ** from source except where marked. **No behavioural claim
is made about code I did not write, because I wrote none.**

**Marking:** §1–§6 and the blast radius are **READ**. That `20260816` is authoritative is **INFERRED**.
Which definition is live in the database is **CANNOT DETERMINE** from the repo.

**Surfaces:** §2's first call site and §3, §5 are the **operator** path. §2's second is the **customer
cancel** path. §4 is SQL. I have not generalised between them.

---

## Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** this file was
written — never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`.

**Result: zero NUL bytes and zero other flagged control bytes.** ⚠️ **This report is the ONLY file
written**, so there is no before/after code census to report — nothing else was touched. Counts, the
non-ASCII census and the per-base carrier-aware variation-selector figures are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
