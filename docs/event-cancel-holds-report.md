# Cancelling an event strands held card authorisations

READ-ONLY DIAGNOSIS. **No file was edited, nothing was committed, no build was run, no deploy, no
database write, no database read, no Stripe call.** `lib/payments/` was read and quoted and **not
touched**. `git status` is in F4. **Nothing is proposed outside Part E.**

⚠️ **One span of the prompt did arrive slightly damaged and it is flagged rather than assumed:** the
final instruction reads *"If any span of this prompt arrived garrbled"* — a doubled letter in the word
*garbled* itself. **Meaning unambiguous, not a transit corruption, so I proceeded.**

Every claim is marked **READ** or **INFERRED**.

---

# 🔴 THE ANSWER, BEFORE THE EVIDENCE

**Confirmed, and it is worse than "no payment call".** Cancelling an event sets the orders to
`'cancelled'`, emails the customers and rebuilds slot usage — and **makes no payment call of any
kind**. The customer with a live authorisation gets an email that says **nothing about money at all**,
because the one money sentence that template can produce is gated on `order.paid_at`, which is **null
for exactly this case**.

🔴 **AND NEITHER SWEEP WILL EVER PICK IT UP** — not by oversight, but because both exclude it *by
design*: the capture sweep may only ever capture and excludes `'cancelled'`; the abandonment sweep owns
`promoted_at is null` and a promoted order fails that by construction. **READ**, the SQL's own words:
*"These two jobs partition the space and never overlap."*

✅ **The fix already exists and is already used by the other two cancel paths.**
`releaseHoldForCancelledOrder` needs **one new value in a string union** and nothing else.

⚠️ **And the deferral that was recorded was about the wrong thing.** The manual's backlog says *"event
cancellation cancels orders and emails customers but does not yet refund"* — **a REFUND, which is
returning captured money. A RELEASE is cancelling an uncaptured hold, and it became possible when the
release module was built on 13 August. The backlog entry was correct when written and went stale
without anyone noticing.**

---

# PART A — WHAT EVENT CANCELLATION DOES TODAY

## A1. The cancel branch, in full

**READ** — `app/api/events/action/route.ts:205-256`:

```ts
    // Cancel affected orders and notify customers
    const { data: affectedOrders } = await supabase
      .from('orders')
      .select('*')
      .eq('event_id', eventId)
      .in('status', ['confirmed', 'pending'])

    let cancelledOrders = 0
    if (affectedOrders && affectedOrders.length > 0) {
      // Scope by order_key (UUID) — display id is not unique across events, so
      // .in('id', ...) would cancel matching display numbers in OTHER events too.
      const orderKeys = affectedOrders.map((o: any) => o.order_key)
      await supabase
        .from('orders')
        .update({
          status: 'cancelled',
          cancellation_reason: `Event cancelled${fullNote ? ': ' + fullNote : ''}`,
        })
        .in('order_key', orderKeys)

      cancelledOrders = affectedOrders.length

      for (const order of affectedOrders) {
        if (order.customer_email) {
          await sendEventCancellationEmail({
            to: order.customer_email,
            customerName: order.customer_name,
            orderId: order.id,
            truckName: truck.name ?? '',
            venueName: eventRow?.venue_name ?? null,
            village: eventRow?.village ?? null,
            eventDate: eventRow?.event_date ?? null,
            note: fullNote || null,
            paymentStatus: order.paid_at ? 'paid' : null,
          })
        }
      }
    }

    // The event's orders are now cancelled, but their items still sit in the
    // date-keyed production_slot_usage rows. Recompute the date from LIVE orders so
    // the cancelled load no longer bleeds into other same-date events' projections.
    // Best-effort (reuses the existing rebuild; never block the cancel).
    if (eventRow?.event_date) {
      try {
        await rebuildProductionSlotUsage(supabase, truck.id, eventRow.event_date)
      } catch (err) {
        console.warn('[events/cancel] production_slot_usage rebuild failed (drift risk):', err)
      }
    }

    return NextResponse.json({ ok: true, cancelledOrders })
```

**Everything it does to each order, exhaustively: sets `status` and `cancellation_reason`, sends one
email, and rebuilds the date's production-slot usage. That is all.**

## A2. No payment call — the absence, quoted

**READ** — searching the whole file:

```
$ grep -n "releaseHold\|refund\|cancelAuthorization\|markAuthorizationCancelled\|payments" app/api/events/action/route.ts
NOT FOUND — the event-cancel path makes no payment call of any kind
```

**READ** — and its imports confirm it. **There is no path to `lib/payments/` from this file:**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEventCancellationEmail } from '@/lib/email'
import { getSoleActiveVanId } from '@/lib/van-utils'
import { rebuildProductionSlotUsage } from '@/lib/slot-bookings'
import { hasValidEventTimes } from '@/lib/time-utils'
```

**What SHOULD be there, by comparison — READ**, `app/api/orders/cancel/route.ts:5`:

```ts
// RELEASE ONLY. It cannot capture and it refuses an order whose money was already taken; see the module.
import { releaseHoldForCancelledOrder } from '@/lib/payments/release-hold'
```

🔴 **Both order-cancel paths import and call it. The event-cancel path does neither. The three are the
only ways an order becomes `'cancelled'`, and one of them skips the money.**

## A3. The release call the other paths make

**READ** — `app/api/orders/cancel/route.ts:112-129`, the customer path:

```ts
    // THE HELD CARD, AND THIS IS THE PATH NOBODY IS WATCHING.
    // A customer cancelling inside their window is the worse of the two cases: no operator is present,
    // and before this the authorisation simply sat on their card for about a week against an order that
    // no longer existed. Neither sweep could see it — the capture sweep excludes 'cancelled' by design
    // and the abandonment sweep owns drafts that were never promoted.
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

**And everything the module does — READ**, `lib/payments/release-hold.ts:60-145`, in order:

1. **The cheap no-op** — `getOrderDraft`; `no_draft` / `no_intent` / `already_released` return
   immediately. **No Stripe client is constructed for a pay-at-hatch or walk-up order.**
2. 🔴 **The captured check, from the ledger, keyed exactly as capture writes it:**
   ```ts
    const { data: captured, error: ledgerErr } = await supabase
      .from('order_payments')
      .select('id')
      .eq('idempotency_key', onlinePaymentIdempotencyKey(draft.payment_intent_id))
      .maybeSingle()
    …
    if (captured) return { status: 'captured', paymentIntentId: draft.payment_intent_id }
   ```
   ⚠️ **And a read failure is a REFUSAL, not a zero:** *"'I COULD NOT TELL' IS A REFUSAL. A read failure
   is not evidence that nothing was captured, and acting on that guess is how a paid order gets its
   charge cancelled."*
3. **The release** — `releaseHold(...)` from promote-draft, which reaches Stripe through
   `cancelAuthorization`, *"the one and only place in this codebase that calls `paymentIntents.cancel`"*.
4. **On failure:** `authorization_cancelled_at` is left NULL **deliberately**, a `hold_release_failed`
   audit row is written, and 🔴 **the cancellation is NOT undone**.
5. **On success:** a `hold_released` audit row.

## A4. Each order state, and what event cancellation does to the money today

| Order state | What event cancellation does to the money | Verdict |
|---|---|---|
| 🔴 **Authorised, NOT captured** (card order, held) | **Nothing.** The order becomes `'cancelled'`, `order_drafts.authorization_cancelled_at` stays NULL, the intent stays live at Stripe. | 🔴 **STRANDED. The defect.** |
| **Captured** (money taken) | **Nothing** — and ✅ **that is correct.** Returning captured money is a refund, which is a human decision. ⚠️ **But nothing tells the operator a refund is owed**, and the email's refund sentence is gated on `paid_at` (B4). | ⚠️ **Correct inaction, no prompt** |
| **Cash / pay-at-hatch** | **Nothing, and nothing is needed** — no authorisation exists. | ✅ **Correct** |
| **Unpaid, no card** | **Nothing needed.** | ✅ **Correct** |
| ⚠️ **`'modified'` (edited) — any of the above** | 🔴 **The order is not even CANCELLED** — it is omitted from the status list at `:210`. See D3. | 🔴 **Orphaned** |

---

# PART B — HOW BAD, AND FOR WHOM

## B1. 🔴 The customer's statement, and for how long

**What they see — INFERRED from Stripe's behaviour, not read from our code:** a **pending charge** for
the order total on their card, reducing their available balance. ⚠️ **It is not a completed payment and
it will never appear on a statement as one** — but on most banking apps it is indistinguishable from
one, and a customer who has just been told their order is cancelled sees money apparently taken for it.

**For how long — INFERRED about Stripe, but this codebase states its own belief repeatedly and that
part is READ:**

- `lib/payments/release-hold.ts:9` — *"a cancelled order's hold sat on a customer's card for **about
  seven days** against an order that no longer existed, and nothing told anyone."*
- `lib/payments/capture.ts:298-299` — *"Stripe keeps an uncaptured intent **about seven days**; a
  pending order confirmed after that has nothing left to take."*

🔴 **So: roughly a week, then it drops off silently.** ⚠️ **Nothing informs the customer at either end —
not when it is stranded, and not when it expires.** **INFERRED:** the practical worst case is a customer
whose available balance is reduced for a week after being told their order was cancelled, with an email
in hand that mentions no money at all.

## B2. Any sweep or backstop? — 🔴 NO, AND BOTH EXCLUSIONS ARE DELIBERATE

**Two sweeps exist. Neither can see this, and the SQL says so in as many words.**

### The stranded-CAPTURE sweep — excludes `'cancelled'`

**READ** — `supabase/migrations/20260816_find_stranded_authorisations_settled.sql:88-96`:

```sql
    -- The draft became this order. (A draft that never promoted belongs to the CANCELLATION sweep,
    -- which owns `promoted_at is null`. These two jobs partition the space and never overlap.)
    and d.promoted_at is not null
    -- The hold has not been released. A cancelled authorisation is finished, not stranded.
    and d.authorization_cancelled_at is null
    -- 🔴 THE ORDER HAS BEEN ACCEPTED BY THE TRUCK. This is the whole safety property: 'pending' is
    -- absent, so an order still awaiting a human is never named. 'collected' IS present — an order
    -- handed over without its money taken is the worst case, not an excluded one.
    and o.status in ('confirmed', 'modified', 'cooking', 'ready', 'collected')
```

🔴 **`'cancelled'` is absent, and it MUST be** — **READ**, `stranded-authorisations.ts:20-24`:

```
// ── 🔴 IT CAPTURES. IT NEVER CANCELS. ───────────────────────────────────────────────────────────
// The correct resolution for a confirmed order holding money is to TAKE it — the truck accepted the
// order and is owed. Cancelling would be deciding, on a schedule, that a customer with food coming does
// not have to pay.
```

⚠️ **This sweep is not merely blind to the case — it is the wrong tool. Adding `'cancelled'` to it would
make it CAPTURE money for cancelled orders.**

### The abandonment / cancel-stale sweep — excludes promoted drafts

**READ** — `lib/payments/order-drafts.ts:459-467`:

```ts
  const { data, error } = await supabase
    .from('order_drafts')
    .select('order_key, truck_id, payment_intent_id, expires_at, promotion_failed_at, total_minor')
    .not('payment_intent_id', 'is', null)
    .is('promoted_at', null)
    .is('authorization_cancelled_at', null)
    .lt('expires_at', new Date().toISOString())
```

🔴 **`.is('promoted_at', null)` — and an order that EXISTS has a promoted draft by construction.** So a
cancelled event's orders fail this filter every time.

> 🔴 **NOT FOUND: any sweep, cron or backstop that would release a hold on a cancelled event's order.**
> **The two sweeps partition the space between them and this case falls in the gap** — the same gap
> `releaseHoldForCancelledOrder` was written to close for the other two cancel paths.

## B3. Has it ever happened?

⚠️ **I cannot answer this from the repository, and I did not query the database — stated plainly rather
than guessed.**

**What WOULD record it, and why none of it helps here — READ:**

| Artefact | Would it show a stranded event-cancel hold? |
|---|---|
| `action_audit_log` action `hold_released` | ❌ **No** — written only when a release is attempted and succeeds. **None is attempted.** |
| `action_audit_log` action `hold_release_failed` | ❌ **No** — same reason. |
| `capture_missing` (the stranded sweep's first-sighting row) | ❌ **No** — the sweep never returns a `'cancelled'` order. |

🔴 **THE SAME LESSON THE STRANDED SWEEP'S OWN HEADER RECORDS APPLIES EXACTLY HERE — READ**,
`stranded-authorisations.ts:16-18`:

```
//   • `action_audit_log` had nothing, because capture was never ATTEMPTED. `capture_failed` only exists
//     when something tried. AN UNATTEMPTED ACTION LEAVES NO TRACE ANYWHERE, which is why "check the
//     audit log" was not, and could not have been, the answer.
```

**⚠️ So the audit log cannot answer this question, by construction.** ✅ **The query that could — run by
hand, read-only — is `order_drafts` joined to `orders` where the order is `'cancelled'`,
`promoted_at is not null`, `authorization_cancelled_at is null`, and no ledger row for the intent.**
**I did not run it.**

**READ** — the only textual evidence in the repository is a backlog line, quoted in full at C2.

## B4. What the customer receives — 🔴 an email that says nothing about money

**READ** — `lib/email.ts:735-775`, the whole template:

```ts
  // Same correction as the cancellation email above, for the same reasons.
  const refundLine = paymentStatus === 'paid'
    ? ` If you paid by card, any refund is handled by ${truckName} directly — please contact them about it.`
    : ''
  const html = `
    <div style="font-family:Arial,sans-serif;color:#334155;max-width:600px;">
      <p>Hi ${customerName || 'there'},</p>
      <p>Unfortunately <strong>${truckName}</strong>'s event${location ? ` at ${location}` : ''}${dateFormatted ? ` on ${dateFormatted}` : ''} has been cancelled.</p>
      ${noteLine}
      <p>Your order <strong>#${orderId}</strong> has been cancelled.${refundLine}</p>
      <p>We're sorry for any inconvenience.</p>
      <p>${truckName}</p>
      <p style="color:#94a3b8;font-size:12px">Powered by HatchGrab · hatchgrab.com</p>
    </div>
  `
```

🔴 **`refundLine` is the ONLY money sentence, and it is gated on `paymentStatus === 'paid'`. READ** —
what the caller passes, `events/action/route.ts:238`:

```ts
            paymentStatus: order.paid_at ? 'paid' : null,
```

> 🔴 **`order.paid_at` — NOT the ledger, and NULL for an authorised-but-uncaptured order, because no
> money has moved.** So `paymentStatus` is `null`, `refundLine` is `''`, and **the customer whose card
> is being held for a week receives an email whose only sentence about their order is "Your order #17
> has been cancelled."**

⚠️ **Two further observations, both READ:**

- **`paid_at` is not the payment authority.** §37's ledger is — `getOrderBalance` / `payment_status`.
  This template's caller reads a column that no longer decides paid-ness on any other surface.
- **NOT FOUND: any other customer-facing template** on this path. One email, one sentence, no figures.

---

# PART C — WHY IT IS LIKE THIS

## C1. When it was written, and whether payments existed

**READ** — `git blame`:

```
304f877d (Dominic Bonini 2026-05-23 205)     // Cancel affected orders and notify customers
304f877d (Dominic Bonini 2026-05-23 206)     const { data: affectedOrders } = await supabase
304f877d (Dominic Bonini 2026-05-23 210)       .in('status', ['confirmed', 'pending'])
304f877d (Dominic Bonini 2026-05-23 217)       await supabase
304f877d (Dominic Bonini 2026-05-23 220)           status: 'cancelled',
304f877d (Dominic Bonini 2026-05-23 227)       for (const order of affectedOrders) {
```

**The loop is from `304f877`, 23 May 2026.** The only later touch is `d8f3c44` (7 June) which changed
`.in('id', …)` to `.in('order_key', …)` — a scoping fix, unrelated.

**READ** — when the payment system arrived:

| File | First commit |
|---|---|
| `supabase/migrations/20260729_order_payments_ledger.sql` | `65d8290` **2026-07-29** |
| `lib/payments/capture.ts` | `961ecd8` **2026-08-12** |
| `lib/payments/order-drafts.ts` | `1907ae9` **2026-08-12** |
| **`lib/payments/release-hold.ts`** | `cba706f` **2026-08-13** |

> 🔴 **THE CANCEL LOOP PREDATES THE LEDGER BY OVER TWO MONTHS AND THE RELEASE MODULE BY NEARLY THREE.**
> **When it was written there were no authorisations to strand.** ⚠️ **It did not become wrong; the world
> changed around it** — which is precisely the class of defect nobody re-reads for, because the file
> itself never changed.

## C2. Omission or deliberate deferral? — ⚠️ BOTH, AND THE DEFERRAL WAS ABOUT THE WRONG THING

**A deferral WAS recorded. READ** — `docs/reference-manual.md:7399`:

```
- Refunds process — event cancellation cancels orders and emails customers but does not yet refund.
  *(Folded into the Stripe Connect + online payments item above — it cannot be built before Connect.)*
```

🔴 **But read it closely: it says REFUND. A refund returns money that was CAPTURED. A release cancels a
hold that was never captured. They are different operations on different states**, and the codebase is
emphatic about the distinction — **READ**, `release-hold.ts:12-22`:

```
// ── 🔴 THIS FILE ONLY EVER RELEASES. IT CANNOT TAKE MONEY. ─────────────────────────────────────────
…
// ── ⚠️ AND IT REFUSES OUTRIGHT ON AN ORDER WHOSE MONEY WAS ALREADY TAKEN ───────────────────────────
// A captured order has no hold to release, and cancelling a succeeded PaymentIntent is not a refund —
```

✅ **The deferral was correct when written** — refunds genuinely could not be built before Connect.
🔴 **It went stale on 13 August**, when the release path was built and the *release* half became
possible. **Nobody revisited the backlog line, because it was filed under refunds.**

**And the release module's own header names the gap it closed — and names the paths it closed it for:**

```
// ── THE GAP THIS CLOSES ─────────────────────────────────────────────────────────────────────────────
// The cancel handler updated `status`, unbooked the slot and emailed, and never touched Stripe. Neither
// sweep could pick the leftovers up either …
```

⚠️ **"The cancel handler", singular — it meant the ORDER-cancel handlers.** **READ**, searching every
payment module for any mention of event cancellation:

```
$ grep -rn "event cancel\|event_cancel\|cancelled event" lib/payments/*.ts
NOT FOUND — no payment module mentions event cancellation
```

> **So: a deliberate deferral of REFUNDS that is still valid, and an OMISSION of the RELEASE that was
> never considered because the event path was not in view when the module was written.**

---

# PART D — THE STATUS LIST

## D1. The list, and what it omits

**READ** — `app/api/events/action/route.ts:210`:

```ts
      .in('status', ['confirmed', 'pending'])
```

| Status | In the list? |
|---|---|
| `pending` | ✅ included |
| `confirmed` | ✅ included |
| 🔴 **`modified`** | ❌ **OMITTED** |
| `cooking` | ❌ omitted |
| `ready` | ❌ omitted |
| `collected` | ❌ omitted |
| `cancelled` | ❌ omitted (already cancelled) |
| `rejected` | ❌ omitted |

## D2. What each omission means for an order on a cancelled event

| Status | Meaning on a cancelled event |
|---|---|
| 🔴 **`modified`** | **LEFT LIVE AND ORPHANED.** An accepted, edited order sitting on an event that no longer exists — **not cancelled, not emailed, still counted as active by every other consumer.** See D3. |
| `cooking` | ⚠️ **Left live.** **INFERRED: arguably correct** — food is physically being made, so silently cancelling it would be wrong. **But nothing tells the operator it is now orphaned.** |
| `ready` | ⚠️ **Left live.** Same reasoning: made and waiting for collection. |
| `collected` | ✅ **Correctly omitted** — handed over; cancelling it would be false. |
| `cancelled` / `rejected` | ✅ **Correctly omitted** — already terminal. |

⚠️ **So three of the omissions (`cooking`, `ready`, `collected`) are defensible and one — `modified` —
is not**, because `'modified'` means *accepted and changed since*, which is the same live state as
`'confirmed'` and is treated as such by eleven-plus other consumers.

## D3. 🔴 The orphaned edited order — both sides quoted

**THE COUNT includes it. READ** — `app/api/events/affected-orders/route.ts:26-32`, as changed in the
previous task:

```ts
  // Count active orders for this event.
  // 'modified' ADDED: this number is shown to an operator before a destructive event action, and an edited
  // order is every bit as affected as an unedited one. Omitting it under-reported the consequence.
  const { count, error } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId)
    .eq('truck_id', truck.id)
    .in('status', ['pending', 'confirmed', 'modified'])
```

**THE CANCEL does not. READ** — `app/api/events/action/route.ts:206-210`:

```ts
    const { data: affectedOrders } = await supabase
      .from('orders')
      .select('*')
      .eq('event_id', eventId)
      .in('status', ['confirmed', 'pending'])
```

> 🔴 **CONFIRMED. The operator is warned "3 orders will be affected", 2 are cancelled, and the third —
> an edited one — is left live on a cancelled event, un-emailed and uncounted afterwards.**

⚠️ **This is the honest consequence recorded at the time and it is real.** ✅ **The count is the more
truthful of the two** — that order *is* affected. **The remedy is to make the cancel match the count,
not to make the count match the cancel** — and it must land with the release, or it simply strands one
more hold.

---

# PART E — WHAT A FIX WOULD REQUIRE

**Requirements only. Nothing is proposed beyond this part, and nothing was implemented.**

## E1. Two changes, different risk

### CHANGE 1 — THE RELEASE CALL (the money defect)

| Item | Note |
|---|---|
| Import `releaseHoldForCancelledOrder` into `events/action/route.ts` | the file currently has no `lib/payments` import at all |
| Call it per affected order | ⚠️ **after** the status write — see E3 |
| ⚠️ Widen the `trigger` union | see E2 |
| ⚠️ Decide what the customer email says | **the `paid_at` gate is wrong for a held order** (B4). A released hold deserves a sentence; **a customer told nothing is the current behaviour and is worse.** |

🔴 **RISK: this touches money on a live path.** ✅ **Mitigated by the module refusing captured orders and
never throwing** — but it is the half that needs care.

### CHANGE 2 — THE STATUS LIST (the orphan)

| Item | Note |
|---|---|
| Add `'modified'` to `:210` | one string |
| ⚠️ Decide about `cooking` / `ready` | **out of scope of the orphan question** and arguably correct as-is |

🔴 **RISK: LOW ON ITS OWN — BUT IT MUST NOT SHIP FIRST.** ⚠️ **Adding `'modified'` before the release
exists cancels MORE orders with held cards and therefore STRANDS MORE MONEY.** That is exactly why it
was refused last time, and it stays refused until Change 1 lands. **Change 1 alone is safe; Change 2
alone is harmful; both together are correct.**

## E2. Can `releaseHoldForCancelledOrder` be reused as-is?

✅ **YES — the logic needs nothing new.** It has **no order-status gate**, keys on the draft's payment
intent and the ledger, refuses captured orders, cannot throw, and writes its own audit rows.

⚠️ **ONE THING IS NOT REUSABLE AS-IS, AND IT IS A TYPE, NOT A BEHAVIOUR. READ**,
`release-hold.ts:55`:

```ts
    trigger: 'operator_cancel' | 'customer_cancel'
```

🔴 **A closed union with no member for this case.** ⚠️ **Passing `'operator_cancel'` would compile and
would be a lie in the audit log** — it is what the trigger exists to prevent, per its own docstring:
*"Recorded, so 'did the customer or the operator cancel this' is answerable from the audit log rather
than by inference."*

**So: add a third member — `'event_cancel'` — and nothing else.** ✅ **One word in a union in
`lib/payments/`, which is diagnose-first territory and is reported here rather than changed.**

## E3. 🔴 THE ORDER OF OPERATIONS

> ✅ **CANCEL FIRST, RELEASE SECOND. The codebase has already made this decision twice and documented
> why.**

**READ** — `app/api/orders/cancel/route.ts:117-119`:

```
    // THE ORDER IS ALREADY CANCELLED ABOVE. This runs after, cannot throw, and cannot fail the request:
    // a customer must not be told their cancellation failed because Stripe was slow. A release that
    // fails writes hold_release_failed and leaves the authorisation findable.
```

**How each ordering fails, and they fail asymmetrically:**

| Order | Failure mode |
|---|---|
| ✅ **Cancel, then release** | Stripe is slow or down → **the event and its orders ARE cancelled**, the hold survives, `hold_release_failed` is written, and the hold expires by itself in about a week. **The bad outcome is the status quo.** |
| 🔴 **Release, then cancel** | The release succeeds and the cancel write fails → **a LIVE order with its authorisation destroyed.** The truck expects to be paid, the customer's card is no longer standing behind it, and **capture will later fail on an order the kitchen is making.** ⚠️ **Worse still, `releaseHold` is irreversible — an authorisation cannot be un-cancelled.** |

🔴 **The asymmetry is the whole argument: one ordering fails toward "nothing changed", the other fails
toward "the food is promised and the money is gone".** ⚠️ **And a cancellation must never be blocked by
a payment provider being unreachable.**

## E4. What could go wrong

| Risk | Prevented today? |
|---|---|
| **Double release** | ✅ **YES** — `if (draft.authorization_cancelled_at) return { status: 'none', reason: 'already_released' }`. A second call is one indexed read and out. |
| **Release on a CAPTURED order** | ✅ **YES, at two layers** — the ledger check returns `'captured'` before any Stripe call, and ⚠️ **a read failure REFUSES rather than assuming zero.** **INFERRED: Stripe would also reject cancelling a succeeded intent, but the module deliberately does not rely on that.** |
| 🔴 **Partial failure mid-loop across many orders** | ❌ **NO — NOTHING PREVENTS THIS, AND IT IS THE ONE GENUINELY NEW RISK.** The existing callers release **one** order. An event may have dozens. **READ**, the loop at `:227` is a bare `for` with an `await` and no try/catch: **one throw ends the loop and every remaining order is silently skipped.** ⚠️ The module itself cannot throw — but `sendEventCancellationEmail` sits in the same loop and **can**. **Today an email failure already truncates the remaining emails; adding a release into that loop would make it truncate releases too.** |
| **A slow loop timing out the request** | ❌ **NO.** Emails are already awaited serially; adding a Stripe round-trip per order compounds it. ⚠️ **Not a correctness bug, but a cancel that times out mid-loop leaves a partial result with no record of where it stopped.** |
| **The status write succeeding and the release loop never running** | ⚠️ **Possible today** — the status update is a single bulk write; the loop is separate. **INFERRED: this is why per-order failures must be recorded per order**, which `hold_release_failed` already does. |

## E5. Blast radius on Pizzeria Gusto

🔴 **They are exposed today, not hypothetically: Gusto trades with real money and cancels events.**
Every card order on a cancelled event that was authorised and not yet captured has a live hold on a
customer's card for about a week, with an email that mentions no money, and **no sweep will ever find
it** — nothing in the system records that it happened, so the true count to date is unknown and
unknowable from the audit log.

⚠️ **A fix changes a live path for them**, and in two directions worth separating: **the release itself
is safe** — it only ever cancels holds that were never captured, refuses anything captured, and cannot
throw — while **the status-list change makes MORE orders cancel**, which is correct but is a real
behaviour change on an operator action they use. ✅ **And the customer-visible improvement is
immediate:** a hold released at cancellation instead of a week of reduced available balance.

---

# PART F — INTEGRITY

## F1. Byte scan of every file opened — byte-level, never grep

All 10 files scanned for NUL, every control byte below 0x09, the 0x0B/0x0C pair, 0x0E-0x1F and 0x7F:

| File | Bytes | Offending |
|---|---|---|
| `app/api/events/action/route.ts` | 13,114 | 0 |
| `app/api/orders/cancel/route.ts` | 6,819 | 0 |
| `app/api/dashboard/action/route.ts` | 174,041 | 0 |
| `lib/payments/release-hold.ts` | 9,750 | 0 |
| `lib/payments/order-drafts.ts` | 23,541 | 0 |
| `lib/payments/capture.ts` | 31,097 | 0 |
| `lib/email.ts` | 42,590 | 0 |
| `supabase/migrations/20260816_find_stranded_authorisations_settled.sql` | 7,985 | 0 |
| `docs/modified-status-report.md` | 38,483 | 0 |
| `docs/reference-manual.md` | 1,572,328 | 0 |

**TOTAL OFFENDING: 0.**

## F2. Byte scan of this report

Separate pass after writing: **35,063 bytes scanned, offending = 0** — no NUL, no control byte
below 0x09, no CRLF, no lone CR.

## F3. Carrier-aware variation-selector check

🔴 Carriers read from **what actually precedes each U+FE0F**, never from a Unicode-category filter — a
`category == 'So'` filter silently misses bases such as U+2139 INFORMATION SOURCE (category `Ll`).

Per emoji-presentation base, **measured after writing, not predicted**:

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+26A0 WARNING SIGN | 35 | 35 | **0** |
| U+1F534 LARGE RED CIRCLE | 41 | 0 | 41 |
| U+2705 WHITE HEAVY CHECK MARK | 20 | 0 | 20 |
| U+274C CROSS MARK | 11 | 0 | 11 |
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 212 | 0 | 212 |

**Sum of per-base paired = 35 = total U+FE0F count = 35** — every selector has a named carrier, no
orphan, no double-count, **zero bare warning signs**. Bare is correct for the rest: three are
emoji-presentation-by-default, and ⚠️ **U+2500 is a box-drawing rule inside the quoted source comments,
not an emoji at all** — flagging its 212 occurrences as unpaired would be exactly the false positive
this method exists to prevent.

## F4. `git status` — proof nothing changed

```
 M app/api/webhooks/instagram/route.ts
 M app/api/webhooks/messenger/route.ts
 M app/api/webhooks/meta/whatsapp/route.ts
 M docs/reference-manual.md
?? docs/whatsapp-onboarding-report.md
?? docs/whatsapp-routing-report.md
?? docs/whatsapp-signature-report.md
?? lib/meta/
?? supabase/migrations/20260816_trucks_phone_number_id.sql
```

🔴 **NOT ONE ENTRY BELONGS TO THIS TASK**, and this report does not yet appear because it is being
written now. The three webhook routes and `lib/meta/` are the signature-verification task; the migration
and `whatsapp-routing-report.md` are the routing task; `reference-manual.md` is the V11.20 update.
**No source file, no route, nothing under `lib/payments/`, no migration and no database was touched
here.** Nothing staged, branch still `main`.

---

# SUMMARY

**Confirmed and quantified.** `app/api/events/action/route.ts:206-241` cancels an event's orders, emails
the customers and rebuilds slot usage, with **no payment call of any kind** — the file has no
`lib/payments` import at all, while both order-cancel paths call `releaseHoldForCancelledOrder`. For an
authorised-but-uncaptured card order that means a **live hold on the customer's card for about a week**,
and 🔴 **neither sweep will ever find it**: the capture sweep excludes `'cancelled'` because it may only
capture, the abandonment sweep owns `promoted_at is null`, and the SQL states outright that the two
*"partition the space and never overlap"*. The customer's email says **nothing about money**, because
its only money sentence is gated on `order.paid_at` — null for exactly this case.

**Why: the loop is from 23 May 2026, over two months before the ledger and nearly three before
`release-hold.ts` — it did not become wrong, the world changed around it.** The manual did record a
deferral, but for **refunds**, which are a different operation; the **release** half became possible on
13 August and the backlog line was never revisited. ✅ **The fix reuses `releaseHoldForCancelledOrder`
as-is apart from one new value in a `trigger` union**, must run **cancel-then-release** (the reverse
fails toward a live order with a destroyed authorisation, and a release is irreversible), and 🔴 **the
`'modified'` status-list change must NOT ship first — alone it strands more money, which is exactly why
it was refused last time.** The one genuinely new risk is the mid-loop partial failure: the existing
callers release one order, an event may have dozens, and today a single throw in that loop silently
skips every remaining order.
