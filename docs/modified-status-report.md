# The `'modified'` status gaps — FIXED

**This file replaces the read-only diagnosis of the same name.** That diagnosis established the gaps;
this records the fix.

Scope honoured: **five status filters and one email template.** `lib/payments/` was **read and quoted
and not touched** — the diagnosis proved the capture arithmetic correct and it is unchanged. No
`next dev`, no `next build`, no `cap sync`, no deploy, no commit, no database write, no Stripe call, no
migration, no change to `lib/email.ts`.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

Customer, operator and email surfaces are reported **separately**. Every claim is marked **READ** or
**INFERRED**.

> ✅ **VERIFIED: `npx tsc --noEmit` exits 0 with no output.** No emit, no `.next`, no bundler.

🔴 **ONE THING WAS DELIBERATELY NOT CHANGED, AND IT IS THE MOST IMPORTANT PARAGRAPH IN THIS REPORT.**
The B5 re-sweep found a **fifth** order-status list — the event-cancel path — and adding `'modified'` to
it **would have expanded a money-stranding defect**. It is reported at B5, not fixed. See there.

---

# PART A — CANCELLATION IS GENUINELY BLOCKED

## A1. The server check, before

**READ** — `app/api/orders/cancel/route.ts:58-64`:

```ts
    // Can only cancel pending or confirmed orders
    if (!['pending', 'confirmed'].includes(order.status)) {
      return NextResponse.json(
        { error: 'This order can no longer be cancelled' },
        { status: 409 }
      )
    }
```

## A2. The UI condition, before

**CUSTOMER SURFACE — READ**, `app/order/[id]/manage/page.tsx:116-127`:

```tsx
  const canCancel =
    order.allow_cancellation &&
    ['pending', 'confirmed'].includes(order.status) &&
    !isPastCutoff()

  const statusLabel = () => {
    if (order.status === 'cancelled') return 'This order has already been cancelled.'
    if (order.status === 'ready' || order.status === 'collected')
      return 'This order can no longer be cancelled.'
    if (isPastCutoff()) return 'The cancellation window has passed.'
    return 'Cancellations are not accepted for this order.'
  }
```

## A3. The email's cancel link — gated on the truck only

**EMAIL SURFACE — READ**, `lib/email.ts:360-368` (**unchanged by this task**):

```ts
  // Cancellation link section (omitted on the ready notification — too late to cancel a ready order)
  const cancellationSection = (params.allowCancellation && !isReady) ? `
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0">
      <p style="margin:0;font-size:12px;color:#94a3b8">
        Need to cancel?
        <a href="${params.baseUrl || 'https://www.hatchgrab.com'}/order/${params.orderKey}/manage" style="color:#ea580c;margin-left:4px">Cancel your order</a>
        (up to ${params.cancellationCutoffMins ?? 30} minutes before your pickup time)
      </p>
    </div>` : ''
```

✅ **CONFIRMED: gated on `params.allowCancellation` alone — a truck setting. It never sees order
status.** That is why the product could invite a cancellation and then refuse it. ⚠️ **This template is
NOT changed by this task** — it did not need to be. It was telling the truth; the two layers underneath
it were wrong, and they are what changed.

## A4. Cancellation allowed for `'modified'` — server AND UI

**SERVER — READ, as committed:**

```ts
    // Can only cancel an order that has not been made or handed over yet.
    // 'modified' ADDED: an edited order is a LIVE order. Editing it is the operator changing an item or a
    // time; it is not the customer giving up their right to cancel, and every other consumer in the
    // codebase already treats 'modified' as the accepted-and-changed sibling of 'confirmed' (the capture
    // sweep's allow-list, the dashboard's active set, the slot engine, buzzers). This one did not, so an
    // edit silently removed a customer's cancel button AND returned 409 to anyone who reached the endpoint
    // anyway, while their confirmation email still invited them to cancel.
    // The two gates either side of this are unchanged: the truck must allow cancellation, and the cutoff
    // window still applies. The held-card release below has no status gate at all and refuses a captured
    // order, so this admits nothing that could strand money.
    if (!['pending', 'confirmed', 'modified'].includes(order.status)) {
```

**CUSTOMER UI — READ, as committed:**

```tsx
  // 'modified' is an edited-but-live order and belongs here — it must match the server's allow-list in
  // app/api/orders/cancel/route.ts exactly, or the button and the endpoint disagree and one of them lies.
  const canCancel =
    order.allow_cancellation &&
    ['pending', 'confirmed', 'modified'].includes(order.status) &&
    !isPastCutoff()
```

✅ **The two lists are now identical**, which is the property that matters — a button that renders and an
endpoint that refuses is worse than either failure alone.

## A5. 🔴 The money path for a cancelled `'modified'` order — CHECKED BEFORE ENABLING

**This was the gating question, and it passes. READ**, `app/api/orders/cancel/route.ts:112-129`
(**unchanged by this task**):

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

🔴 **And the decisive property — `releaseHoldForCancelledOrder` HAS NO ORDER-STATUS GATE AT ALL.**
**READ**, `lib/payments/release-hold.ts:67-91`:

```ts
    if (!draft) return { status: 'none', reason: 'no_draft' }
    if (!draft.payment_intent_id) return { status: 'none', reason: 'no_intent' }
    if (draft.authorization_cancelled_at) return { status: 'none', reason: 'already_released' }
    …
    if (captured) return { status: 'captured', paymentIntentId: draft.payment_intent_id }
```

It keys on the **draft's payment intent** and the **ledger**, never on `orders.status`. **READ**, its
header:

```
// ── 🔴 THIS FILE ONLY EVER RELEASES. IT CANNOT TAKE MONEY. ─────────────────────────────────────────
// ── ⚠️ AND IT REFUSES OUTRIGHT ON AN ORDER WHOSE MONEY WAS ALREADY TAKEN ───────────────────────────
```

✅ **So a `'modified'` order cancelled by a customer releases its hold exactly as a `'confirmed'` one
does, and a captured one is refused rather than "refunded" as a side effect. Nothing is stranded.
Proceeding was safe, and this was established before the allow-list was widened, not after.**

## A6. The "not accepted" string and every condition that can still render it

**READ, as committed:**

```tsx
  // Every branch names a REASON, and the order they are tested in is the order a customer would ask them.
  // The final line is the truck-policy sentence and must only be reached when the truck has genuinely
  // switched cancellation off — it used to catch 'modified' as well, telling a customer whose truck DOES
  // accept cancellations that it does not.
  const statusLabel = () => {
    if (order.status === 'cancelled') return 'This order has already been cancelled.'
    if (order.status === 'ready' || order.status === 'collected')
      return 'This order can no longer be cancelled.'
    if (isPastCutoff()) return 'The cancellation window has passed.'
    if (!order.allow_cancellation) return 'Cancellations are not accepted for this order.'
    // Any remaining status (rejected, or one added later) is genuinely past cancelling. Same wording as
    // the server's 409 for the same case, so the two layers cannot say different things.
    return 'This order can no longer be cancelled.'
  }
```

🔴 **"Cancellations are not accepted for this order" now renders under EXACTLY ONE condition:
`order.allow_cancellation` is false — the truck has switched cancellation off.** That is the only case
the sentence was ever true for.

**Every other path and what it now says:**

| State | Sentence |
|---|---|
| `'cancelled'` | "This order has already been cancelled." |
| `'ready'` / `'collected'` | "This order can no longer be cancelled." |
| past the cutoff | "The cancellation window has passed." |
| truck disallows | **"Cancellations are not accepted for this order."** ← the only remaining site |
| any other status (e.g. `'rejected'`) | "This order can no longer be cancelled." — **the same wording as the server's 409**, so the layers agree |
| `'modified'` | ✅ **no sentence — the Cancel button renders** |

---

# PART B — THE FOUR ALLOW-LISTS AND THE QUERY

## B1 / B2. All five, quoted, with one sentence each on why `'modified'` belongs

| # | file:line | Before | Why `'modified'` belongs | Changed? |
|---|---|---|---|---|
| 1 | `app/api/orders/cancel/route.ts:59` | `['pending', 'confirmed']` | An edited order is a **live** order; editing it is the operator changing an item, not the customer forfeiting a right. | ✅ |
| 2 | `app/order/[id]/manage/page.tsx:118` | `['pending', 'confirmed']` | It must match the server's list exactly, or the button and the endpoint disagree. | ✅ |
| 3 | `app/dashboard/[token]/page.tsx:2335` | `status!=='pending' && status!=='confirmed'` | An edited order is still an order somebody is waiting for, and it is **the one most likely to run late** — it was just changed. | ✅ |
| 4 | `lib/printing/printWatcher.ts:57` | `['confirmed','cooking','ready']` | **By the list's own definition** — "accepted and should be made". See B3. | ✅ |
| 5 | `app/api/events/affected-orders/route.ts:32` | `['pending', 'confirmed']` | The number warns an operator before a destructive action; an edited order is every bit as affected. | ✅ |

**Not one of the five was deliberately excluding it.** ⚠️ Each is a copy of a set that
`lib/buzzer.ts:27` records as appearing *"VERBATIM in five places"* — **a set that is copied rather than
shared is a set that drifts**, and these are the copies that drifted.

**READ, as committed — #3, the due-alert scan:**

```tsx
        // 'modified' JOINS THE SCAN. An edited order is still an order somebody is waiting for, and it was
        // being skipped AND having its remembered urgency deleted — so an edit permanently silenced that
        // order's due alert, on the one surface an operator relies on to hear about lateness.
        if(o.status!=='pending'&&o.status!=='confirmed'&&o.status!=='modified'){ prevUrgencyRef.current.delete(o.order_key); continue }
```

**READ, as committed — #5, the count:**

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

## B3. 🔴 `printWatcher` — an edited order never printed

**BEFORE — READ**, and the comment is the argument:

```ts
/** Statuses that mean "this order has been ACCEPTED and should be made". Excludes pending/cancelled/rejected. */
const DEFAULT_ELIGIBLE = ['confirmed', 'cooking', 'ready']
```

**AFTER — READ, as committed:**

```ts
/** Statuses that mean "this order has been ACCEPTED and should be made". Excludes pending/cancelled/rejected.
 *  🔴 'modified' BELONGS BY THIS LIST'S OWN DEFINITION and was missing: it means accepted AND CHANGED SINCE,
 *  which is an order the kitchen must make — and the one most worth putting on paper, because it is the one
 *  whose contents differ from whatever the cook last saw. Without it an operator who edited an order before
 *  it printed never got a ticket for it, in either trigger mode, silently. */
const DEFAULT_ELIGIBLE = ['confirmed', 'modified', 'cooking', 'ready']
```

**READ** — the single consumer, `printWatcher.ts:95` (**unchanged**):

```ts
  const eligible = opts.eligible ?? DEFAULT_ELIGIBLE
```

⚠️ **The list's own docstring already said `'modified'` belonged. The list disagreed with its comment,
and the comment was right.**

## B4. The due-alert now fires for an edited order

✅ **INFERRED, from the change at B1 #3 and the surrounding code being untouched:** `'modified'` now
passes the guard, so the order is added to `seen`, its collection time is resolved, `getCombinedUrgency`
is evaluated and its previous urgency is **remembered instead of deleted** — which matters, because the
alert fires only on a *real transition* into warn from a known state, and deleting the memory made that
transition unobservable. **Test 5 in Part F is how this becomes observed rather than inferred.**

## B5. 🔴 THE RE-SWEEP — and the fifth site, which is NOT fixed

I re-swept every `.ts`, `.tsx` and `.sql` outside `node_modules` for allow-list shapes naming
`'confirmed'` (list literals, `.in(...)`, `includes(...)`, `Set(...)` and `!==` chains).

### 🔴 A FIFTH ORDER-STATUS LIST, FOUND ON THE RE-SWEEP — REPORTED, DELIBERATELY NOT CHANGED

**READ** — `app/api/events/action/route.ts:205-210`:

```ts
    // Cancel affected orders and notify customers
    const { data: affectedOrders } = await supabase
      .from('orders')
      .select('*')
      .eq('event_id', eventId)
      .in('status', ['confirmed', 'pending'])
```

**This is an ORDERS query, not an events one, and it CANCELS the rows it selects.**

🔴 **I did not add `'modified'`, and the reason is the same principle A5 applies: never widen a cancel
that strands money.** **READ** — searching the whole file for any payment call:

```
$ grep -n "releaseHold\|refund\|cancelAuthorization\|markAuthorizationCancelled\|payments" app/api/events/action/route.ts
NOT FOUND — the event-cancel path makes no payment call of any kind
```

**Its imports confirm it — READ:**

```ts
import { sendEventCancellationEmail } from '@/lib/email'
import { getSoleActiveVanId } from '@/lib/van-utils'
import { rebuildProductionSlotUsage } from '@/lib/slot-bookings'
import { hasValidEventTimes } from '@/lib/time-utils'
```

⚠️ **So cancelling an event ALREADY strands held authorisations for `'confirmed'` card orders** — it
sets `status: 'cancelled'`, emails, and rebuilds slot usage, with **no `releaseHoldForCancelledOrder`
call**, unlike both the customer-cancel path (`orders/cancel/route.ts:123`) and the operator-cancel path
(`dashboard/action/route.ts:369`). **Adding `'modified'` would have extended that defect to more
customers' cards. That is a bigger change than this task's scope and it is a money path, so it stops
here and is reported.**

⚠️ **AND AN HONEST CONSEQUENCE OF MY OWN FIX #5, STATED RATHER THAN HIDDEN:** `affected-orders` now
**counts** modified orders while `events/action` still does not **cancel** them. The count is the more
truthful of the two — those orders do exist on the event being cancelled — but the pair is now visibly
out of step, and the underlying defect is that **an edited order survives its own event's cancellation
as an orphan.** 🔴 **These two lines should be resolved together, in a task that also gives the
event-cancel path a hold release.** I am not doing that here.

### ✅ EVERY OTHER HIT — swept and cleared

**Sixteen remain, and none is an order-status list:**

| Hits | What they are |
|---|---|
| `api/discovery/events:222`, `api/menu/[truckId]:150,163`, `api/manage:1449`, `api/orders/submit:293`, `api/events/route:75`, `api/events/action:134`, `webhooks/meta/whatsapp:121`, `webhooks/whatsapp:68`, `manage/[token]:7316`, `AddOrderPanel:604`, `lib/event-conflicts:80`, `20260522_event_system.sql:35`, `dashboard/[token]/page:2246` | **EVENT status** — a different table with a different vocabulary (`unconfirmed`, `confirmed`, `open`, `closed`, `cancelled`). `'modified'` is not a valid value. |
| `components/dashboard/OrderCard.tsx:1032` | **NEGATED** — `{!['confirmed','pending'].includes(order.status) && …}`, and its comment says *"shown for modified/cooking/ready"*. `'modified'` correctly **gets** the badge. |

✅ **After this task, ZERO order-status allow-lists omit `'modified'`, except the one at
`events/action:210` that is reported above and deliberately left alone.**

---

# PART C — THE EDIT EMAIL

## C1. The template before, in full

**EMAIL SURFACE — READ**, `app/api/dashboard/action/route.ts:926-953` as it stood:

```ts
        // Route through the SHARED renderer (renderOrderLinesHtml) so the deal bundle price (£15)
        // and per-modifier prices (+£1.50) render — the inline fork omitted them.
        const emailDeals = dealsCanonical
        const linesHtml = renderOrderLinesHtml(finalItems, emailDeals)
        const slotToShow = slot !== undefined ? slot : order.slot
        const html = `<body style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#1e293b">
            <h2>Your order has been updated ✓</h2>
            <p><strong>${truck.name}</strong> has updated order #${order.id}.</p>
            ${slotToShow ? `<p><strong>Collection time:</strong> ${slotToShow}</p>` : ''}
            <p style="font-size:12px;color:#64748b;margin-bottom:4px">Updated order:</p>
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0">
              ${linesHtml}
              <tr style="border-top:1px solid #e2e8f0">
                <td style="padding-top:8px;font-weight:700">New total</td>
                <td style="text-align:right;padding-top:8px;font-weight:700">£${newTotal.toFixed(2)}</td>
              </tr>
            </table>
            <p style="color:#94a3b8;font-size:12px">${payNote.short} · Powered by HatchGrab · hatchgrab.com</p>
          </body>`
        await sendEmailUnlessDemo(truck, {
          to: order.customer_email,
          subject: `Order #${order.id} updated`,
          html,
          text: `${truck.name} has updated your order #${order.id}. New total £${newTotal.toFixed(2)}. ${payNote.short}. — HatchGrab`,
          truckName: truck.name,
        })
```

🔴 **`payNote.short` in `color:#94a3b8;font-size:12px`, sharing a line with "Powered by HatchGrab" — the
money sentence styled as footer boilerplate, in the one email whose entire purpose is that the money
changed.**

## C4 first — reuse, and it was possible

✅ **`formatConfirmationEmail` is reused. Restyling by hand was not needed.**

**READ** — its parameter list already accepts everything this call site has:
`orderId`, `orderKey`, `truckName`, `customerName`, `slot`, `items`, `deals`, `discountAmt`, `total`,
`notes`, `paymentState`, `paidMinor`, `balanceMinor`, `heldMinor`, the venue and contact fields,
`allowCancellation`, `cancellationCutoffMins`, `baseUrl`, `truckSlug`. **And there is precedent in the
same file: the `adjust_slot` branch already calls it with an "updated" subject.**

## C2. The bordered box, as committed

**READ, as committed:**

```ts
        // ── 🔴 THIS EMAIL NOW USES formatConfirmationEmail, LIKE EVERY OTHER ONE. ────────────────────
        // ── WHAT IT REPLACES, AND WHY THE HAND-BUILT TEMPLATE HAD TO GO ─────────────────────────────
        // It built its own HTML and rendered `payNote.short` into
        //     <p style="color:#94a3b8;font-size:12px">... · Powered by HatchGrab · hatchgrab.com</p>
        // — 12px, grey, sharing a line with the footer credit. So the ONE email whose entire purpose is
        // that the money changed put the money sentence where a reader's eye goes last, styled as
        // boilerplate. The shared template renders the SAME sentence as `payNote.html`: a bordered,
        // centred, 16px box — amber when something is still to pay, indigo for a hold, green when it is
        // settled. The sentence, the figures and the colours already existed; only the placement moves.
        // ⚠️ NOTHING ABOUT THE MONEY CHANGES. No amount, no arithmetic, no capture — `payFacts` above is
        // the same single resolution it always was, and it is passed through rather than re-derived.
        // ✅ It also brings the cancel link, the venue and the contact block this template never had —
        // and that link is now honest, because 'modified' can be cancelled again (orders/cancel/route.ts).
        // ⚠️ Venue is passed as null: the hand-built template showed none, so nothing is lost, and looking
        // it up would add a query to the edit path for a field this email has never carried.
        const { html, text } = formatConfirmationEmail({
          orderId: order.id,
          orderKey,
          customerName: order.customer_name,
          truckName: truck.name,
          items: finalItems,
          deals: emailDeals,
          slot: slotToShow,
          discountAmt: newDiscountAmt,
          total: newTotal,
          notes: notes !== undefined ? notes : order.notes,
          autoAccepted: true,
          paymentState,
          paidMinor: payAmounts?.paidMinor,
          balanceMinor: payAmounts?.balanceMinor,
          heldMinor: payAmounts?.heldMinor,
          venueName: null,
          venueTown: null,
          venuePostcode: null,
          preferredContactMethod: truck.preferred_contact_method ?? null,
          contactPhone: truck.contact_phone ?? null,
          whatsappSender: truck.whatsapp_sender ?? null,
          socialFacebook: truck.social_facebook ?? null,
          socialInstagram: truck.social_instagram ?? null,
          contactEmail: truck.contact_email ?? null,
          allowCancellation: truck.allow_customer_cancellation ?? true,
          cancellationCutoffMins: truck.cancellation_cutoff_mins ?? 30,
          baseUrl: process.env.NEXT_PUBLIC_HATCHGRAB_URL,
          truckSlug: truck.slug ?? undefined,
        })
```

✅ **`lib/email.ts` is NOT in the diff.** The box it renders is `payNote.html` at `lib/email.ts:406` —
the same code path every other email has always used.

## C3. 🔴 PLAIN ENGLISH, BOTH DIRECTIONS — the final copy

**The direction of the change goes in the SUBJECT LINE. READ, as committed:**

```ts
        // ── 🔴 THE DIRECTION OF THE CHANGE GOES IN THE SUBJECT LINE. ────────────────────────────────
        // The body says what is still to pay; it does not say whether this edit made the order dearer or
        // cheaper, and the shared template has no "previous total" to show without changing a template
        // every other email depends on. The subject is this call site's own, so the plainest possible
        // English goes there — it is also the only part a customer reads before deciding to open anything.
        //   dearer   "Order #12 updated - now £13.00 (was £10.00)"
        //   cheaper  "Order #12 updated - now £6.50 (was £10.00)"
        //   same     "Order #12 updated"
        // ⚠️ NO WORD ABOUT CHARGING OR REFUNDING. A downward edit RELEASES part of a hold, which is not a
        // refund, and an upward one may be owed at the hatch rather than taken from the card. Both facts
        // belong to the payment box, which states them from the resolver. This line states the totals and
        // stops — two numbers a customer can check against their own memory of the order.
        const oldTotal = Number(order.total)
        const totalMoved = Number.isFinite(oldTotal) && Math.abs(oldTotal - newTotal) >= 0.005
        const subject = totalMoved
          ? `Order #${order.id} updated - now £${newTotal.toFixed(2)} (was £${oldTotal.toFixed(2)})`
          : `Order #${order.id} updated`
```

**THE FINAL COPY, BOTH DIRECTIONS — subject plus the body's box (the box text is `lib/email.ts`,
unchanged and quoted for completeness):**

### DEARER — a £10.00 order edited up to £13.00, card held for £10.00

- **Subject:** **`Order #12 updated - now £13.00 (was £10.00)`**
- **Body box** (`held_short`, amber, 16px, centred — **READ**, `lib/email.ts:90-92`):
  > **Your card is held for part of this order — £3.00 still to pay**
  > *Pizzeria Gusto takes the £10.00 held when they confirm your order.*
- **If money had already been captured** (`part_paid`, amber):
  > **Part paid — £3.00 still to pay**
  > *£10.00 of this order is paid. The remaining £3.00 is due when you collect.*

### CHEAPER — a £10.00 order edited down to £6.50, card held for £10.00

- **Subject:** **`Order #12 updated - now £6.50 (was £10.00)`**
- **Body box** (`held`, indigo — **READ**, `lib/email.ts:73-74`):
  > **Your card is held, not charged**
  > *Pizzeria Gusto takes the payment when they confirm your order. Nothing to pay at the truck.*
- **And the order table shows the new total of £6.50.**

⚠️ **Why the cheaper case says nothing about "being charged less", stated plainly.** **READ** —
`lib/payments/email-payment-state.ts:233-234`:

```
  // ⚠️ AN EDIT DOWNWARD IS STILL PLAIN 'held'. The hold is bigger than the order, capture takes the
  // lower amount (lib/payments/capture step 2c), and there is genuinely nothing to pay at the truck.
```

**The resolver deliberately makes no claim about the reduction**, because at that moment nothing has
moved and the eventual capture takes the lower figure. **Changing that sentence means changing
`lib/email.ts`, which C5 forbids and which every other email depends on.** ✅ **So the reduction is
carried by the subject line and the new total — two figures, no promise** — which is why the subject
was the right place for the direction.

## C5. Nothing else changed

✅ **No amount, no arithmetic, no other template.** `lib/email.ts` is not in the diff; `lib/payments/`
is not in the diff; `payFacts` / `paymentState` / `payAmounts` are computed exactly as before and passed
through. ⚠️ Two now-unused imports (`renderOrderLinesHtml`, `paymentNote`) were dropped from this file's
import line — a direct consequence of the template going, and dead imports on a live route are worth
removing rather than leaving.

---

# PART D — BOUNDARIES

## D1. `git diff --stat`

```
 app/api/dashboard/action/route.ts       | 100 +++-
 app/api/events/affected-orders/route.ts |   6 +-
 app/api/orders/cancel/route.ts          |  13 +-
 app/dashboard/[token]/kds/page.tsx      | 176 ++++--
 app/dashboard/[token]/page.tsx          |  25 +-
 app/order/[id]/manage/page.tsx          |  13 +-
 docs/push-registration-report.md        | 978 ++++++++++++++++++-------------
 docs/reference-manual.md                | 595 ++++++++++++++++++-
 ios/App/App/AppDelegate.swift           |  41 ++
 lib/printing/printWatcher.ts            |   8 +-
```

**THIS TASK'S ENTRIES:** `app/api/dashboard/action/route.ts`, `app/api/events/affected-orders/route.ts`,
`app/api/orders/cancel/route.ts`, `app/order/[id]/manage/page.tsx`, `lib/printing/printWatcher.ts`, and
**one line** of `app/dashboard/[token]/page.tsx`. ⚠️ **`app/dashboard/[token]/kds/page.tsx` and the rest
of `page.tsx` are the PREVIOUS task's KDS work**; `AppDelegate.swift` and the two docs are earlier still.

**Proof by path, counted from the diff:**

| Concern | Files in the diff |
|---|---|
| `lib/payments` | **0** |
| `lib/slot*` | **0** |
| `lib/capacity*` | **0** |
| `supabase/migrations` | **0** |
| `lib/features` / `lib/plan-features` (the gate) | **0** |
| `lib/email.ts` | **0** |

✅ **And the capture sites are untouched: `captureOnConfirmation(supabase` still returns exactly five
call sites, and `capture.ts`, `promote-draft.ts` and `stranded-authorisations.ts` are not in the diff.**

## D2. What changes for a Gusto customer who edits an order, and for the operator

A customer whose order is edited now receives an email whose **subject line says the new total and the
old one** — `Order #12 updated - now £13.00 (was £10.00)` — so the direction and the size of the change
are visible before they open anything, and whose body carries the **same bordered payment box every
other HatchGrab email uses**: amber with "£3.00 still to pay" when the hold no longer covers the order,
indigo "your card is held, not charged" when it does, green when it is settled. That sentence is not new
— it was already being computed and was being printed in 12px grey next to "Powered by HatchGrab". They
also get, for the first time on this email, the contact block and a **working cancel link**: an edited
order can be cancelled again, on the page and at the endpoint, and the hold behind it is released by the
same code that has always released it. For the operator, three things change: an edited order now
**raises the due alert** it had been silently dropped from, an edited order now **prints a kitchen
ticket** where before it never did in either trigger mode, and the affected-orders count before a
destructive event action now includes edited orders. ⚠️ **The printing change is the one to watch on a
device with a printer connected — tickets will appear for orders that previously produced none.**

## D3. No capacity, slot or capture behaviour changed

✅ **Confirmed.** No file under `lib/slot*`, `lib/capacity*` or `lib/payments/` is in the diff; no
migration; no capture site added, removed or reordered. The five status lists are **read** by consumers,
never by the capture path — `captureOnConfirmation` keys on `order_drafts` and the ledger, not on
`orders.status`.

---

# PART E — INTEGRITY

## E1 / E2. Non-ASCII census, side by side

| File | classes before → after | Gained | Lost | Byte scan |
|---|---|---|---|---|
| `app/api/orders/cancel/route.ts` | 1 → **1** | NONE | NONE | 0 |
| `app/order/[id]/manage/page.tsx` | 10 → **10** | NONE | NONE | 0 |
| `app/dashboard/[token]/page.tsx` | 53 → **53** | NONE | NONE | 0 |
| `lib/printing/printWatcher.ts` | 8 → **8** | NONE | NONE | 0 |
| `app/api/events/affected-orders/route.ts` | 0 → **0** | NONE | NONE | 0 |
| `app/api/dashboard/action/route.ts` | 15 → **14** | NONE | 🔴 **U+2713** | 0 |

**Every difference explained:**

- `cancel/route.ts`, `affected-orders/route.ts` — **no non-ASCII change at all** (the latter is pure
  ASCII and still is).
- `manage/page.tsx` — **U+2014 EM DASH +2**, from the two new comment lines.
- `dashboard/[token]/page.tsx` — **U+2014 +1**, from the due-alert comment.
- `printWatcher.ts` — **U+2014 +1, U+1F534 +1**, from the extended docstring.
- `action/route.ts` — **U+2500 +74** (the section rules in the new comment blocks), **U+2014 +5**,
  **U+26A0 +4 with U+FE0F +4** (paired, see E3), **U+00A3 POUND SIGN +2**.
- 🔴 **U+2713 CHECK MARK LOST, and it is accounted for:** the deleted template's heading was
  `<h2>Your order has been updated ✓</h2>`. It was the file's only tick and it went with the template.
  ⚠️ **A lost class is exactly the kind of silent substitution the census exists to catch, so it is named
  rather than absorbed into a byte count.** ✅ The **£** count rose rather than fell — the currency symbol
  survived the copy change, which is the specific risk E2 warns about.

## E3. Carrier-aware variation-selector check

🔴 Carriers read from **what actually precedes each U+FE0F**, never from a Unicode-category filter — a
`category == 'So'` filter silently misses bases such as U+2139 INFORMATION SOURCE (category `Ll`).

| File | U+26A0 after (n / paired / bare) | sum(carriers) = total U+FE0F |
|---|---|---|
| `app/api/orders/cancel/route.ts` | 0 / 0 / 0 | 0 = 0 ✅ |
| `app/order/[id]/manage/page.tsx` | 2 / 2 / **0** | 2 = 2 ✅ |
| `app/dashboard/[token]/page.tsx` | 62 / 59 / **3** | 60 = 60 ✅ |
| `lib/printing/printWatcher.ts` | 7 / 7 / **0** | 7 = 7 ✅ |
| `app/api/events/affected-orders/route.ts` | 0 / 0 / 0 | 0 = 0 ✅ |
| `app/api/dashboard/action/route.ts` | 47 / 47 / **0** | 47 = 47 ✅ |

✅ **Every warning sign added in this task is paired.** The only bare ones are the **3 pre-existing** in
`dashboard/[token]/page.tsx`, unchanged from before. ⚠️ That file's carriers include a **U+2699 GEAR** as
well as warning signs — the case a raw U+26A0-versus-U+FE0F total misreports.

## E4. Byte scan of every edited file — byte-level, never grep

All six scanned for NUL, every control byte below 0x09, the 0x0B/0x0C pair, 0x0E-0x1F and 0x7F.
**Offending: 0 in every file.** No CRLF, no lone CR.

## E5. Byte scan of this report

Separate pass after writing: **38,483 bytes scanned, offending = 0** — no NUL, no control byte below
0x09, no CRLF, no lone CR.

**And the carrier-aware check on this report, measured in that same pass:**

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+26A0 WARNING SIGN | 22 | 22 | **0** |
| U+2705 WHITE HEAVY CHECK MARK | 28 | 0 | 28 |
| U+1F534 LARGE RED CIRCLE | 22 | 0 | 22 |
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 159 | 0 | 159 |
| U+2713 CHECK MARK | 2 | 0 | 2 |

**Sum of per-base paired = 22 = total U+FE0F count = 22** — every selector has a named carrier, no
orphan, no double-count, **zero bare warning signs**. Bare is correct for the other four: two are
emoji-presentation-by-default, U+2500 is a **box-drawing rule** inside quoted source, and U+2713 is the
**tick quoted from the deleted template's heading** — the very class E2 reports as lost from
`action/route.ts`. ⚠️ **Neither of the last two is an emoji**, and flagging them as unpaired would be
exactly the false positive this method exists to prevent.

## E6. `git status` and `git diff --stat`

`git diff --stat` is at D1. `git status --porcelain` shows the six modified source files (five from this
task plus the KDS pair from the previous one), the three earlier deliverables, and this report.
**Nothing staged, branch still `main`.**

---

# PART F — WHAT YOU MUST TEST

⚠️ **None of this has been observed. `tsc` is clean and every change is quoted, but nothing has run.**

### 1. Edit an order UPWARD (card held, not yet captured)

Place a card order, leave it pending, then edit it to add an item.

- **PASS:** the customer email subject reads **`Order #N updated - now £X (was £Y)`** with X > Y, and the
  body carries an **amber box**: *"Your card is held for part of this order — £Z still to pay"*.
- **PASS:** the box is centred, bordered and large — **not** grey text beside "Powered by HatchGrab".
- **FAIL:** the money sentence is still in the footer → the template change is not in the build.
- 🔴 **FAIL:** any figure differs from the order → **stop; nothing in this task should have moved an
  amount.**

### 2. Edit an order DOWNWARD

Same setup, remove an item.

- **PASS:** subject reads **`now £6.50 (was £10.00)`**; body shows an **indigo** *"Your card is held, not
  charged"* box and the new lower total in the table.
- ⚠️ **EXPECTED, not a failure:** the body does not say "you will be charged less". That claim belongs to
  the capture, which has not happened. The subject carries the reduction.
- **FAIL:** the body says "Paid by card" while a balance is owed → the resolver is being bypassed.

### 3. Cancel an edited order (the customer path)

Edit an order, then open the cancel link from the customer's confirmation email.

- **PASS:** the **Cancel button renders**, and cancelling returns success.
- **PASS:** *"Cancellations are not accepted for this order"* does **not** appear.
- 🔴 **PASS (money):** if the order had a held card, the hold is **released** — check Stripe or
  `order_drafts.authorization_cancelled_at`.
- **FAIL:** 409 "This order can no longer be cancelled" → the server list is not in the build.
- 🔴 **FAIL:** a captured order gets cancelled and money is "released" → **stop and report**; the module
  should refuse it.

### 4. Confirm an edited order PRINTS

With a printer paired and printing enabled, edit an order that has not printed yet, then let it become
due (or use `on_confirmed`).

- **PASS:** a ticket comes out for the edited order.
- ⚠️ **Check the ticket shows the EDITED contents**, not the pre-edit ones.
- **FAIL:** no ticket → `DEFAULT_ELIGIBLE` is not in the build.
- ⚠️ **Watch for duplicates:** an order that already printed before the edit will not reprint — dedupe is
  device-local and keyed per order.

### 5. Confirm the DUE ALERT fires for an edited order

With `order_due` sound enabled, edit an order whose collection time is approaching, then let it cross
into the warn threshold.

- **PASS:** the due chime fires for that order.
- **FAIL:** silence while an unedited order at the same lateness chimes → the scan change is not in the
  build.
- ⚠️ **Test the TRANSITION, not the steady state** — the alert fires on a real transition into warn from
  a known-ok state, so edit the order *before* it becomes late.

### 6. One regression check — the count and the event cancel

Cancel an event that has an edited order on it.

- **PASS:** the affected-orders count **includes** the edited order.
- 🔴 **EXPECTED AND WRONG, and it is the B5 finding:** that edited order is **not** cancelled with the
  others and is left orphaned on a cancelled event. **This is reported, not fixed** — do not treat it as
  a regression from this task, and do not fix it without giving that path a hold release.
