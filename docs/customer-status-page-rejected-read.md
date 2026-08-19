# What a rejected customer sees — READ ONLY

**Nothing was changed except this file.** No fix, no copy proposed, no route touched, no operator code,
no email, no payment code. `next dev` / `next build` were not run.

## 🔴 THE BRIEF'S PREMISE IS PARTLY WRONG, AND CORRECTING IT CHANGES THE SHAPE OF THE PROBLEM

**Two of its three claims hold. One does not.**

| Claim in the brief | Verdict |
|---|---|
| No `rejected` branch; falls through to *"This order can no longer be cancelled."* | ✅ **READ. True** |
| It says nothing about the money | ❌ **FALSE — it says something WORSE than nothing** |
| It does not even tell them the order was rejected | ❌ **FALSE — it prints `Rejected` in a Status row** |

🔴 **THE PAGE HAS A PAYMENT ROW, AND FOR A REJECTED ORDER IT PRINTS "Pay at the truck". READ:**

```tsx
<span className="text-slate-500">Payment</span>
<span className={`font-medium ${order.payment_status === 'paid' ? 'text-green-600' : 'text-slate-900'}`}>
  {order.payment_status === 'paid' ? 'Paid by card' : 'Pay at the truck'}
</span>
```

A rejected order was never captured, so `payment_status` is `'unpaid'` and the ternary falls to the
right-hand branch. **The customer is told to pay at a truck that has just refused to cook their food.**
That is not silence — it is an instruction, and it is wrong. **⚠️ INFERRED that the value is `'unpaid'`**:
`getOrderBalance` computes `paidMinor = 0 → status 'unpaid'` with no capture, and `recalcOrderPayment` is
its only writer. **CANNOT DETERMINE from source that any real rejected row reads `'unpaid'`** — Stripe has
never been live. **What would settle it:** `select id, status, payment_status from orders where status =
'rejected';`

🔴 **AND IT DOES NAME THE STATUS. READ:**

```tsx
<span className="text-slate-500">Status</span>
<span className={`font-medium capitalize ${
  order.status === 'cancelled' ? 'text-red-500' :
  order.status === 'ready' ? 'text-green-500' :
  'text-slate-900'
}`}>
  {order.status}
</span>
```

`capitalize` on the raw column renders **`Rejected`**. ⚠️ **In neutral slate, not red** — only `cancelled`
gets red. So the word is present, styled as though nothing notable happened, in a details row, while the
sentence at the bottom of the card talks about cancellation.

**So this is not "a missing branch that says nothing".** It is a page that names the status correctly,
contradicts it in the payment row, and answers an unasked question at the bottom.

---

## 1 · The full status ladder

**File:** `app/order/[id]/manage/page.tsx`. **Identifiers:** `statusLabel` (the ladder) and `canCancel`
(the gate that decides whether the ladder runs at all). **READ, in full:**

```tsx
  const canCancel =
    order.allow_cancellation &&
    ['pending', 'confirmed', 'modified'].includes(order.status) &&
    !isPastCutoff()

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

⚠️ **`rejected` IS NAMED IN THAT COMMENT.** The fall-through is not an oversight — it was written knowing
rejected lands there, and judged as "genuinely past cancelling", which is **true**. What the comment does
not consider is that the sentence is also the customer's only prose.

**`statusLabel()` is called in exactly one place. READ:**

```tsx
  {canCancel ? (
      <button onClick={handleCancel} …>{cancelling ? 'Cancelling...' : 'Cancel order'}</button>
      …
  ) : (
    <p className="text-sm text-slate-400 text-center">{statusLabel()}</p>
  )}
```

**Every other branch that decides what the customer sees — all READ, in source order:**

| Branch | Condition | What renders |
|---|---|---|
| `loading` | before the fetch resolves | *"Loading your order..."* |
| `error` | fetch failed or `data.error` | 😕 *"Something went wrong"* + the error |
| `cancelled` | **local state**, set only by `handleCancel` succeeding | ✓ *"Order cancelled"* + the refund-contact sentence |
| `!order` | null after loading | `return null` — **a blank page** |
| default | otherwise | the card: header, Pickup, **Payment**, **Status**, items, total, and the cancel section |

⚠️ **The `cancelled` branch is a LOCAL FLAG, not the column.** It renders only for someone who pressed
Cancel in this tab. A customer arriving at an already-cancelled order gets the default card and
`statusLabel()`'s first line. **Not reachable by rejection at all.**

## 2 · What the page knows

**The client fetch — one call, no parameters. READ:**

```tsx
  useEffect(() => {
    // [id] is the order_key UUID — globally unique, no ?truck= needed
    fetch(`/api/orders/${id}`)
      .then(r => r.json())
      .then(data => { if (data.error) setError(data.error); else setOrder(data) })
      .catch(() => setError('Could not load order'))
      .finally(() => setLoading(false))
  }, [id])
```

**The route: `app/api/orders/[id]/route.ts`. Its SELECT, verbatim. READ:**

```
id, status, customer_name, customer_email, slot, requested_slot, asap_estimate,
event_date, items, deals, deal_savings, total, payment_status, truck_id,
trucks!truck_id ( name, slug, logo_storage_path, allow_customer_cancellation, cancellation_cutoff_mins )
```

**And its response includes:**

```ts
    status: order.status,
    payment_status: order.payment_status ?? 'unpaid',
```

### The three specific questions

| | Available? | Detail |
|---|---|---|
| `order.status` | ✅ **YES. READ** | Selected, returned, typed on `OrderState`, and **rendered** |
| **payment state** | ⚠️ **PARTLY — the RAW COLUMN ONLY** | `payment_status`, defaulted to `'unpaid'`. **No resolved state** |
| `rejection_reason` | ❌ **NO. READ** | Not in the SELECT, not in the response, not on `OrderState` |

🔴 **SAYING IT PLAINLY, AS ASKED: it is NOT true that the page has no payment information — but what it
has cannot describe a hold.** `payment_status` comes from `getOrderBalance` and answers *"has money
moved"*. It has three values in play here: `'paid'`, `'unpaid'`, and (for a double-payment)
`'refund_due'`. **It cannot distinguish:**

- a card order whose authorisation was **held and then released** on rejection, from
- a **pay-at-hatch** order that never had a card near it.

**Both read `'unpaid'`.** The facts that separate them live in `order_drafts` —
`payment_intent_id` and `authorization_cancelled_at` — and **this route never touches that table**
(READ: `order_drafts` does not appear in the file). The resolver that does answer it,
`resolveEmailPaymentState`, is **not imported here** — `grep` of the route returns nothing for it.

**So, for the decision the brief says this determines:**

| Wording you might want | Needs a route change? |
|---|---|
| *"You have not been charged for this order"* | ❌ **No.** `payment_status !== 'paid'` already carries it |
| Suppressing / replacing *"Pay at the truck"* on a rejected order | ❌ **No.** `status` is already on the page |
| *"That hold has now been released"* — the email's sentence | ✅ **YES.** Requires the draft, which the route does not read |
| Showing the operator's reason | ✅ **YES.** `rejection_reason` is not selected |

## 3 · Cancelled vs rejected

✅ **It distinguishes them in exactly one place, and it is not prose: the Status row**, which prints the
raw column — `Cancelled` or `Rejected`. ⚠️ **The colour treats them differently by accident of
enumeration:** `cancelled` → `text-red-500`, `rejected` → the `'text-slate-900'` default, the same as a
live order.

**What a CANCELLED customer sees, for comparison. READ, both paths:**

**(a) Arriving at an already-cancelled order** — Status row `Cancelled` in red, Payment row *"Pay at the
truck"* (identical to the rejected case), and:

> **"This order has already been cancelled."**

**(b) Having just pressed Cancel in this tab** — the local-flag screen:

```tsx
  <h2 className="font-bold text-slate-900 mb-2">Order cancelled</h2>
  <p className="text-sm text-slate-500">
    Your order has been cancelled. If you paid by card, any refund is handled by{' '}
    {order?.truck_name || 'the truck'} directly — please contact them about it.
  </p>
```

⚠️ **THE ONLY MONEY SENTENCE ON THE WHOLE PAGE IS ON PATH (b)**, and its comment says it was written
deliberately: *"IT STILL ANSWERS THE QUESTION THE CUSTOMER HAS. Saying nothing about money would be worse
than over-promising."* **A rejected customer never reaches it.**

## 4 · Is `rejected` the only status falling through?

❌ **NO. `cooking` reaches the same line, and two more reach a byte-identical string by a different
branch.** **READ**, derived from the two quoted predicates plus the statuses this codebase writes.

**The statuses written to `orders.status`** — `pending` (submit), then, all from
`app/api/dashboard/action/route.ts`: `confirmed`, `modified`, `cooking`, `ready`, `collected`,
`cancelled`, `rejected`. **`grep -on "status: '[a-z_]*'"` on that route; `no_show` does not exist.**

| Status | Where it lands |
|---|---|
| `pending`, `confirmed`, `modified` | **Cancel button**, if `allow_cancellation` and not past cutoff |
| `cancelled` | ladder line 1 — its own sentence |
| `ready`, `collected` | ladder line 2 — *"This order can no longer be cancelled."* |
| 🔴 **`cooking`** | 🔴 **the fall-through, line 5 — same sentence** |
| 🔴 **`rejected`** | 🔴 **the fall-through, line 5 — same sentence** |
| any future status | the fall-through |

⚠️ **BUT THE TWO FALL-THROUGH CASES ARE NOT EQUALLY WRONG, and this is the answer to "one missing branch
or a wider gap".** For `cooking` the sentence is **true and appropriate**: the food is on the grill, and
"you can no longer cancel" is exactly what that customer wants to know. **The Payment row is also right
for them** — a pay-at-hatch cooking order really does pay at the truck.

✅ **So it is ONE missing branch, not a wider gap.** `rejected` is the only status for which the page's
output is actively misleading rather than merely terse. ⚠️ **`cancelled` shares the "Pay at the truck"
defect** in the Payment row, but has its own true sentence below it.

## 5 · How a customer reaches the page

**One link, and it is in the CONFIRMATION email, not the rejection email. READ — `lib/email.ts`, inside
`formatConfirmationEmail`:**

```ts
  const cancellationSection = (params.allowCancellation && !isReady) ? `
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0">
      <p style="margin:0;font-size:12px;color:#94a3b8">
        Need to cancel?
        <a href="${params.baseUrl || 'https://www.hatchgrab.com'}/order/${params.orderKey}/manage" style="color:#ea580c;margin-left:4px">Cancel your order</a>
        (up to ${params.cancellationCutoffMins ?? 30} minutes before your pickup time)
      </p>
    </div>` : ''
```

**`grep -rn` for `/manage` across `lib/email.ts` returns this one construction and nothing else.** No QR
builds it: `orderKey` is the row UUID, known only after the order exists.

### 🔴 Would a rejected customer realistically land here? — YES, and by the ONE route they have

**The chain, all READ:**

1. **The order is placed** → `app/api/orders/submit/route.ts` calls `formatConfirmationEmail` with
   `allowCancellation: truck.allow_customer_cancellation ?? true` and sends it to the customer. ⚠️ **It is
   sent for PENDING orders too** — the heading is *"Order received!"* when `autoAccepted` is false.
2. **That email carries the "Cancel your order" link**, gated only on `allowCancellation && !isReady`.
3. **Reject is offered on pending orders** — `components/dashboard/OrderCard.tsx` renders
   `✗ Reject` **only inside `if (order.status === 'pending')`**. **READ.** ⚠️ *I did not exhaustively
   trace every KDS view's button gating — CANNOT DETERMINE that no other surface offers Reject on a
   non-pending order.*
4. **The rejection email itself contains NO link at all** (established earlier this session, and re-read:
   its body is heading, reason, payment sentence, *"Please order at the truck on arrival."*, footer).

🔴 **SO THE ONLY CLICKABLE THING A REJECTED CUSTOMER HOLDS IS THE CANCEL LINK FROM THE EMAIL THEY GOT
MINUTES EARLIER**, in the same inbox thread, directly above the rejection. **"My order was refused — let
me open the order link" is the obvious next action**, and it lands on the page in §1.

⚠️ **CANNOT DETERMINE how often this actually happens.** No analytics on this route were found. **What
would settle it:** request logs for `/order/*/manage` filtered to orders whose status is `rejected`.

⚠️ **One case where they would NOT get there: if the truck has `allow_customer_cancellation` off**, the
section is not rendered and they hold no link — they would have only the rejection email.

## 6 · Does it poll or refresh?

❌ **NO. READ.** The fetch is a single `useEffect` with dependency `[id]`. **There is no interval, no
`setTimeout` re-fetch, no `visibilitychange` or focus listener, no SWR/React-Query, and no Supabase
realtime subscription** — `grep` of the file for `setInterval`, `setTimeout`, `subscribe` and
`visibilitychange` returns **nothing**. `id` comes from `useParams` and does not change while the page is
open.

🔴 **So a customer holding the page open when the operator rejects sees NOTHING CHANGE.** The card keeps
showing the status it fetched — `Pending` or `Confirmed` — with the **Cancel order button still live** if
`canCancel` was true.

⚠️ **AND THE BUTTON WOULD THEN FAIL.** `handleCancel` posts to `/api/orders/cancel`, whose allow-list is
`['pending', 'confirmed', 'modified']` (named by the client comment as the list it must match). A rejected
order is not in it, so the server answers **409**, and `handleCancel` renders that as the 😕 *"Something
went wrong"* screen. ⚠️ **INFERRED** — I read the client's error handling and the client's own statement
about the server list; **I did not re-read `app/api/orders/cancel/route.ts`'s allow-list in this pass**,
so the exact status code is not re-verified here.

**Only a manual reload updates the page**, and then it shows §1's output.

## 7 · Every other customer-facing surface

**Search basis, stated: `ls -R app/order`, `grep -rn "rejected" app/order app/trucks components`, `grep -rn
"OrderConfirmation"`, and a case-insensitive `whatsapp` sweep of `app/api` and `lib`.**

### 🔴 (a) The confirmation receipt — `app/trucks/[slug]/order/page.tsx?confirm=<order_key>` — HAS THE SAME GAP, AND WORSE

**A DIFFERENT FILE, READ SEPARATELY.** Nothing here is carried over from §1.

```tsx
        // ⚠️ A CANCELLED ORDER IS NOT A CONFIRMATION. Rendering "Order confirmed!" over a cancelled row
        // would be actively wrong, so it is refused here with copy that says what happened rather than
        // pretending the order is missing.
        if (d?.status === 'cancelled') {
          setConfirmError('This order has been cancelled.')
          setConfirmLoading(false)
          return
        }
```

🔴 **`'cancelled'` IS GUARDED. `'rejected'` IS NOT.** A rejected order passes straight into the receipt.
**What it then renders. READ:**

```tsx
        autoAccepted={confirmOrder.status === 'confirmed'}
```
```tsx
  <h2 className="text-2xl font-black text-slate-900 mb-1">{autoAccepted ? 'Order confirmed!' : 'Order received!'}</h2>
  <p className="text-slate-500 mb-3 text-sm">
    {autoAccepted
      ? <>Thanks! We&apos;ve received your order and it&apos;ll be ready soon.</>
      : <><span className="font-semibold text-slate-700">{truckName}</span> will confirm your order shortly.</>
    }
  </p>
```

`'rejected' !== 'confirmed'` → `autoAccepted` false → a rejected customer is shown:

> ## Order received!
> **{truck} will confirm your order shortly.**

⚠️ **THIS IS A FUTURE PROMISE ABOUT AN ORDER THAT HAS ALREADY BEEN REFUSED**, and it is worse than §1's
terse sentence. **It also carries the same payment line** — `paymentStatus === 'paid' ? 'Paid by card' :
'Pay at the truck'` — so *"Pay at the truck"* appears here too.

⚠️ **REACHABILITY IS LOWER THAN §1's.** `?confirm=` is reached by in-page navigation after placing an
order; **no email links to it** (the only `/manage` link is §5's, and `grep` finds no `?confirm=`
construction in `lib/email.ts`). A customer reaches it again by **back-button, reload, or bookmark** on a
tab they still have open. ⚠️ **A tab left open is exactly the §6 scenario** — and this page does not poll
either; its only retry loop runs on 404 **before** the first success and stops once the order is found.

### (b) The rejection email itself

**Established earlier in this session and re-read this pass: it now carries one true payment sentence,
and it contains no link.** ⚠️ **It is the ONLY surface that currently tells a rejected customer anything
true about their money.**

### (c) Nothing else exists

❌ **No customer order list.** `app/order` contains only `[id]/manage` — `ls -R` output, nothing else.
❌ **No customer-facing WhatsApp or SMS.** The case-insensitive sweep returns only `whatsapp_sender` /
`phone_is_whatsapp` (a *contact method* shown on the truck page), a `whatsapp_logs` read inside
`app/api/manage` (operator), and an `orders.source` CHECK value. **No message is composed to a customer
anywhere.**
❌ **The red `rejected` chip in `components/dashboard/types.ts` is OPERATOR-side** — the dashboard's own
status colours. **Not a customer surface.** Named only so it is not mistaken for one.

**⚠️ INFERRED FROM ABSENCE for (c), and I name the searches** — `ls -R app/order`, `grep -rn "rejected"
across `app/order app/trucks components`, and the whatsapp sweep above. A surface that renders a rejected
order without using the word or living under those paths would not have been found.

---

## Marking summary

| Claim | Status |
|---|---|
| The ladder, `canCancel`, and every render branch | ✅ **READ** |
| The route's SELECT and response, field by field | ✅ **READ** |
| `rejection_reason` is not available | ✅ **READ** — absent from SELECT, response and type |
| No resolved payment state; `order_drafts` never read | ✅ **READ** |
| A rejected order's `payment_status` is `'unpaid'` | ⚠️ **INFERRED** from `getOrderBalance`. **CANNOT DETERMINE** against a real row — Stripe has never been live |
| `cooking` and `rejected` are the fall-through statuses | ✅ **READ** — the two predicates plus the status writes |
| The `/manage` link and its gating | ✅ **READ** |
| The confirmation email is sent for pending orders | ✅ **READ** — `formatConfirmationEmail` called unconditionally in submit |
| Reject is offered on `pending` only | ✅ **READ** for `OrderCard`. ⚠️ **CANNOT DETERMINE** for every KDS view |
| No polling / no realtime on either page | ⚠️ **INFERRED FROM ABSENCE** — searched `setInterval`, `setTimeout`, `subscribe`, `visibilitychange` |
| The cancel POST would 409 | ⚠️ **INFERRED** — from the client comment, not re-read from the server route this pass |
| Whether customers actually land there | ⚠️ **CANNOT DETERMINE** — no analytics. Request logs would settle it |
| How anything LOOKS | ⚠️ **UNOBSERVED.** Neither page was rendered |

**Surfaces, kept apart:** §1–§6 are `app/order/[id]/manage/page.tsx` and its route. §7(a) is
`app/trucks/[slug]/order/page.tsx`, read on its own — **its `'cancelled'` guard was found by reading that
file, not assumed from this one**, and the two pages share only the `/api/orders/[id]` route. §7(b) is the
email. **No fact is carried between them.**

⚠️ **THE ANALOGY WARNING, HONOURED.** I did not infer this page's behaviour from the operator side or
from the other customer page. **Every claim above comes from reading the file it is about** — and the
premise-correction at the top is the result: two of the brief's three statements about this page did not
survive reading it.

**No instruction contradicted another, and no span of the prompt arrived garbled.**

---

## Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** this file was
written — never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. ⚠️ **This report is
the only file written**, so there is no source census to report — nothing else was touched. The result,
the non-ASCII census and the carrier-aware per-base variation-selector figures are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
