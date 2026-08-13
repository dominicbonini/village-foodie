# Operator-authorised refunds

BUILD. 13 August 2026.

**No `next dev`, no `next build`, no commit, no deploy. No migration is needed and none was written** — `part_refunded` is already in the CHECK, the ledger row is the shape the webhook already writes, and no column was added.

**Two files created, five changed:**

```
lib/payments/refund.ts                       NEW — every guard, the Stripe call, the ledger write
components/dashboard/PaymentActionsModal.tsx NEW — the modal, extracted, now shared by both lists
lib/payments/ledger.ts                        +1 word (`export` on readLedger) + a note
components/dashboard/OrderCard.tsx            the modal JSX left; two figures and one optional prop arrived
app/dashboard/[token]/page.tsx                the completed-list chip, the submit, the cancel-with-refund flow
app/api/dashboard/action/route.ts             the `refund` action; one email sentence corrected
lib/email.ts                                  three email sentences corrected
```

`npx tsc --noEmit` exits 0. Nothing on the WHAT NOT TO TOUCH list was touched: `get_report` and Reports are **untouched** (backlog), `getOrderBalance`'s arithmetic, the CHECK and the refund **event handlers** are untouched, and capture, promotion, the sweeps and the pay-at-hatch path are untouched.

⚠️ **A tenth requirement arrived mid-build** (cancelling a paid order must offer the refund). It is answered in §10, including two corrections to its premises.

---

## 1. THE EXTRACTION — CONTAINED, AS PROMISED

**What moved:** `OrderCard.tsx:522-568`, the whole `removePaymentModal` block, into `components/dashboard/PaymentActionsModal.tsx`. **Nothing else moved.** The 4,482-line page did not lose a line to it.

**What stayed in the card:** the state (`confirmRemovePayment`), the effect that clears it when the payment state moves, both tap targets (the PAID chip and the part-paid row), and `{removePaymentModal}` in the same place in the JSX. The card now renders:

```tsx
  const removePaymentModal = (
    <PaymentActionsModal
      open={confirmRemovePayment}
      onClose={() => setConfirmRemovePayment(false)}
      orderId={String(order.id)} orderKey={order.order_key}
      paidMinor={balance.paidMinor}
      cardChargeMinor={cardChargeMinor} refundedMinor={refundedMinor}
      hasReversibleInPersonPayment={hasReversibleInPersonPayment}
      onUndoPayment={() => onAction('undo_mark_paid', order.order_key)}
      undoLoading={isLoading('undo_mark_paid')}
      onRefund={onRefund}
    />
  )
```

**Is the active list's behaviour byte-identical? Precisely:**

| Branch | Before | After |
|---|---|---|
| **In-person payment** ("Remove payment?") | heading, both paragraphs, both buttons, `undo_mark_paid` | 🔴 **character for character identical**, moved file |
| **Card payment** ("Paid by card / Got it") | explanation ending *"refund it in Stripe, on your own Stripe dashboard"* | **deliberately replaced by the refund form** — that is the build. The old text survives as the branch shown when there is nothing left to refund, minus the Stripe sentence |
| **Neither** | n/a | the same explanation |

**The two new figures come from rows the card already had** and are computed beside the existing row test:

```ts
  const cardChargeMinor = (ledgerRows ?? []).filter(r => r.kind === 'charge' && r.channel === 'online').reduce((sum, r) => sum + r.amount_minor, 0)
  const refundedMinor  = (ledgerRows ?? []).filter(r => r.kind === 'refund').reduce((sum, r) => sum + r.amount_minor, 0)
```

⚠️ **`onRefund` is OPTIONAL.** A surface that does not pass one — the KDS, or any future caller — gets the modal exactly as it read before the refund form existed.

⚠️ **One unrelated line changed in `lib/payments/ledger.ts`: `readLedger` gained `export`.** The refund needs the online **charge rows** themselves (their amounts and the intent id on `external_ref`), which no balance carries, and a hand-rolled select at the call site would lose the four safety properties that function is. **Visibility only — not one character of the body.**

---

## 2. THE TRIGGER ON THE COMPLETED ROW

**A tappable money chip, in the card's own vocabulary**, placed in the row's existing action cluster between "↩ Undo" and the price:

```tsx
{(()=>{const bal=getOrderBalance(o as never,payments[o.order_key]??[])
  if(bal.paidMinor<=0&&bal.status!=='refunded'&&bal.status!=='part_refunded')return null
  const label=bal.status==='refunded'?'REFUNDED':bal.status==='part_refunded'?`£${(bal.balanceMinor/100).toFixed(2)} REFUNDED`:'PAID'
  ...
  return (<button onClick={()=>setPayModalOrder(o.order_key)} title="Tap to refund or correct this payment" ...>{label}</button>)})()}
```

**PAID** (green) · **REFUNDED** (grey) · **£X REFUNDED** (grey) — the same three words the card shows, from the same `getOrderBalance` over the same `payments[o.order_key]` the row already read for `hasUnrecordedPayment`. **No new fetch and no new payload field.**

⚠️ **It renders only when there is money to act on.** An unpaid or never-paid cancelled row is unchanged, and the red "Record payment" repair beside it is untouched.

**One modal for the list**, driven by which `order_key` is open, mounted once below the rows.

---

## 3. THE FORM

**Full or Part** (a two-button segmented control; Full shows the refundable figure), an **amount** field when Part is chosen (capped in the UI, decided on the server), a **required reason** from the seven, and a **note** that is optional except for **Other**, where it is required **in the browser and again on the server**:

```ts
      if (reason === 'other' && !note) {
        return NextResponse.json({ error: 'Add a note explaining this refund.' }, { status: 400 })
      }
```

### The seven onto Stripe's three

```ts
export const REFUND_REASONS = ['item_unavailable','not_collected','wrong_or_missing_item','quality_issue','duplicate_payment','customer_cancelled','other'] as const

export function stripeReasonFor(reason: RefundReason): 'duplicate' | 'requested_by_customer' {
  return reason === 'duplicate_payment' ? 'duplicate' : 'requested_by_customer'
}
```

🔴 **`fraudulent` is deliberately unreachable.** It is a chargeback-risk signal to the card networks, not a description of a wrong sandwich.

### Where the real reason lives — ours, not Stripe's

**The audit log is the durable record**, written for every outcome including pending:

```ts
  await logAction(supabase, {
    action: settled ? 'refund_issued' : 'refund_pending',
    truckId: args.truckId, orderKey: args.orderKey, amountMinor: args.amountMinor,
    beforeState: { captured_minor, refunded_minor_before, remaining_minor_before, payment_intent_id },
    afterState: { refund_id, stripe_status, stripe_reason, reason: args.reason, note: args.note ?? null, ... },
    actor: args.actor, source: args.source,
  })
```

**And it also travels to Stripe as metadata**, so a human in the Dashboard sees what the operator chose rather than the three-value approximation:

```ts
        metadata: { order_key, truck_id, hatchgrab_reason: args.reason, ...(args.note ? { hatchgrab_note: args.note.slice(0, 400) } : {}) },
```

---

## 4. THE AMOUNT GUARDS — SERVER-SIDE, FROM STRIPE

```ts
  if (!refundable.paymentIntentId || refundable.capturedMinor <= 0) {
    return { status: 'refused', reason: 'not_card', remainingMinor: 0,
      detail: 'Nothing was taken by card on this order, so there is nothing to refund here.' }
  }
  if (!Number.isInteger(args.amountMinor) || args.amountMinor <= 0) {
    return { status: 'refused', reason: 'invalid_amount', remainingMinor: refundable.remainingMinor,
      detail: 'Enter an amount greater than zero.' }
  }
  if (args.amountMinor > refundable.remainingMinor) {
    return { status: 'refused', reason: 'exceeds_remaining', remainingMinor: refundable.remainingMinor,
      detail: refundable.remainingMinor === 0
        ? 'This order has already been fully refunded.'
        : `Only £${(refundable.remainingMinor / 100).toFixed(2)} is left to refund on this order.` }
  }
```

**And the figures those guards read:**

```ts
  const rows = await readLedger(supabase, orderKey)
  const cardCharges = rows.filter(r => r.kind === 'charge' && r.channel === 'online')
  const capturedMinor = cardCharges.reduce((sum, r) => sum + r.amount_minor, 0)
  const paymentIntentId = cardCharges.find(r => r.external_ref)?.external_ref ?? null
  ...
  const list = await stripe.refunds.list({ payment_intent: paymentIntentId, limit: 100 }, { stripeAccount: account })
  const refundedMinor = list.data
    .filter(r => r.status !== 'failed' && r.status !== 'canceled')
    .reduce((sum, r) => sum + (r.amount ?? 0), 0)
```

🔴 **The already-refunded figure is STRIPE'S, exactly as instructed, and the reason is in the file's header:** a pending refund writes no ledger row by design, so ours would be blind to one in flight. `failed` and `canceled` refunds are excluded because that money came back to the truck and **is** refundable again.

**The captured figure is ours** — a charge row exists only when Stripe confirmed the money moved, so it cannot overstate.

**The second-refund case needs no second guard:** `remainingMinor` is captured minus everything Stripe is holding open, so a first full refund leaves zero and the same line refuses.

**The idempotency key carries the same figure:**

```ts
  const idempotencyKey = `op_refund:${args.orderKey}:${refundable.refundedMinor}:${args.amountMinor}`
```

A double-tap repeats it and Stripe returns the **same** refund; a genuine second refund is measured from a moved position and keys differently. ⚠️ **Built from Stripe's figure, not ours** — which is what makes it correct during a pending refund.

---

## 5. STRIPE ACCEPTS, OUR WRITE FAILS

**The money has moved and the webhook recovers it.** Quoted:

```ts
  } catch (ledgerErr) {
    console.error(
      `[refund] 🔴 REFUNDED BUT NOT RECORDED re=${refund.id} order_key=${args.orderKey} ` +
      `amount=${args.amountMinor}: ${detail}. THE CUSTOMER HAS BEEN REFUNDED. The webhook's refund.created ` +
      `should write the same row under the same key; do NOT refund again.`,
    )
    return { status: 'refunded', refundId: refund.id, amountMinor: args.amountMinor, balance: null }
  }
```

🔴 **It returns `refunded`, not an error, and that is the whole point.** Reporting a failure would invite the operator to press again — a **second** refund for money already returned. `refund.created` / `charge.refunded` arrive within seconds and write the identical row under `stripe_re:<id>`; the audit row is already written; the console line names the refund id for anyone reconciling by hand.

---

## 6. A PENDING REFUND

**The operator sees a sentence that does not say "refunded":**

> *"£12.50 refund sent. Stripe is processing it — the order will show as refunded once the money has actually gone back."*

The route returns `{ success: true, refunded: false, pending: true }` — a 200 that **must not** claim the money moved — and the module writes **no ledger row**, only the `refund_pending` audit row carrying `resolves: 'refund_pending'`. The order still reads **PAID**, which is true: nothing has gone back yet. `refund.updated` settles it later through the existing handler.

---

## 7. A CASH-PAID ORDER

**The modal never offers a refund**, because `cardChargeMinor` is zero, and the in-person branch takes precedence: the operator gets the unchanged **"Remove payment?"** confirmation, which reverses the *recording* while they hand the cash back.

**And the server refuses it independently**, so a crafted POST gets the same answer (measured in (e) below):

> `409 {"error":"Nothing was taken by card on this order, so there is nothing to refund here.","refundRefused":"not_card","remainingMinor":0}`

⚠️ **A part-card, part-cash order shows the in-person branch first**, so the card half cannot be refunded from the modal today. **Flagged, not built** — it needs a two-limb modal and a decision about which limb leads.

---

## 8. THE SAME SHAPE, AND NO DOUBLE WRITE

**The ledger row is written by the webhook's own function**, called from this module:

```ts
    await recordOnlineCardRefund(supabase, {
      orderKey, truckId, amountMinor: refund.amount ?? args.amountMinor,
      refundId: refund.id, paymentIntentId: refundable.paymentIntentId,
      livemode: !process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_'),
      currency: refund.currency ?? undefined,
    })
```

so `kind: 'refund'`, `channel: 'online'`, `state: 'succeeded'`, positive amount, `external_ref` = the refund id, `idempotency_key` = `stripe_re:<refund id>` — **one shape, one writer**.

**What prevents the double write when Stripe's event arrives**, quoted from `recordPaymentEvent`:

> *"A unique violation on `idempotency_key` is treated as a SUCCESSFUL NO-OP — that is the whole point of the key: an offline replay of the same action must not book a second charge."*

Measured in (f) below: replaying the webhook's own writer with the real `re_...` returned `inserted=false` and the row count did not move.

---

## 9. THE FIVE REFUND COPY SITES

**Does a button make "automatically" true? No — and it is more wrong than before.** Three reasons: a **human** now decides (that is what "operator-authorised" means); these four sentences fire on **cancellation**, which still issues no refund by itself; and the timeframe was never ours — *"3-5 working days"* is the card networks' settlement window quoted as a commitment.

| # | Site | Verdict | Now reads |
|---|---|---|---|
| 1 | `app/api/dashboard/action/route.ts:356` | **still wrong** — fixed | *"If you paid by card, any refund is handled by {truck} directly — please contact them about it."* |
| 2 | `lib/email.ts` cancellation HTML | **still wrong** — fixed | same sentence |
| 3 | `lib/email.ts` cancellation text | **still wrong** — fixed | same sentence |
| 4 | `lib/email.ts` event-cancellation HTML + text | **still wrong** — fixed | same sentence |
| 5 | `app/order/[id]/manage/page.tsx:99` | **already correct** (10 August) | unchanged — the other four were aligned **to it** |

```
$ grep -rn "3–5 working days" --include=*.ts --include=*.tsx . | grep -v node_modules | grep -v ./docs/
(no output)
```

⚠️ **Site 1's GATE is also wrong and was left alone**: it fires on `order.paid_at`, which the capture path never sets, so it has never fired for a card order at all. **That is a payment-state defect, not a copy one — backlog.**

---

## 10. CANCELLING A PAID ORDER

**Two corrections to the brief's premises first, because they change what the copy may say:**

🔴 **CANCELLING A HELD ORDER DOES NOT CANCEL THE AUTHORISATION.** The cancel handler updates `status`, unbooks the slot and emails — `grep` for `cancelAuthorization` inside it returns nothing. The hold is left live, and the stranded sweep's allow-list is `('confirmed','modified','cooking','ready','collected')`, so it will not pick a cancelled order up either. **The hold sits until Stripe expires it (~7 days).** The copy therefore says what is true — *"no money has been taken… the hold is released when it expires"* — rather than promising a release nothing performs. **Releasing it on cancel is a new money action and is not built here. Flagged.**

🔴 **A REFUND ON CANCELLATION MUST BE DECLINABLE, AND THE NO-SHOW IS WHY.** The truck cooked the food and nobody came: a real cancellation where the money stays. So the refund is a **ticked-by-default checkbox**, not an assumption.

**What the operator now sees in the cancel modal, per case:**

| Case | Block |
|---|---|
| **Card money taken** | *"Cancel this order and refund £12.50 to the customer's card?"* + a ticked **"Refund £12.50 to their card"** + the **refund reason** select defaulting to **Customer cancelled**. Unticking it swaps the reason select for: *"The order will be cancelled and the £12.50 will stay with you. Nothing goes back to the customer's card."* |
| **Card held** | *"Their card is **held, not charged** — no money has been taken, so there is nothing to refund. The hold is released when it expires."* |
| **Cash taken** | *"£6.00 was taken in person. There is no card payment to refund — hand the money back at the truck, and use the PAID chip on the order to remove the record."* |
| **Nothing taken** | no block; the modal is exactly as it was |

**It reuses the refund path, not a second one:**

```ts
    if(cancelRefund&&refundableMinor>0){
      const res=await submitRefund({orderKey,amountMinor:refundableMinor,reason:cancelRefundReason,note:fullReason||''})
      if(!res.ok){setCancelError(res.message);return}
      showToast(res.message)
    }
```

🔴 **The refund goes first, and a failed refund does not cancel the order.** Cancel-then-refund can leave a cancelled order with the money still taken and nobody looking at it; this way a failure leaves the order exactly as it was, with the error on screen. ⚠️ The cancellation reason rides into the refund as its note, so the audit row carries both.

### A CUSTOMER cancelling a paid order — options, not a decision

**Today:** `app/api/orders/cancel/route.ts` sets `status: 'cancelled'` and emails. **No refund is issued and nobody is told one is owed.** The customer cancellation window is truck-configured and keeps working exactly as it does — this build did not touch that route.

| Option | What it means | Cost |
|---|---|---|
| **(i) Auto-refund in full** | the customer's cancellation issues the refund itself | Money leaves with **no human decision**, inside a window the truck configured for convenience. A customer who cancels after the food is made is refunded automatically. **Irreversible.** |
| **(ii) Leave it, and tell the operator** | the order lands in Completed & cancelled carrying its **PAID chip**, which now opens the refund form | 🔴 **Already true after this build** — the chip renders for any row with money against it, so the operator can act in two taps. **Cost: nothing prompts them.** They must look. |
| **(iii) Leave it, and alert** | (ii) plus a push/email/banner when a **paid** order is customer-cancelled | One notification path, and a decision about which channel. **The only option where an operator cannot miss it.** |
| **(iv) Gate the window** | block customer cancellation once paid | Rejected already, in V11.10, and reverted byte-exactly: *"the customer cancellation window is a truck-configured feature and must keep working for paid orders."* |

**Which cases the operator must be told about, and how — stated, not built:**

1. 🔴 **A PAID order cancelled by the customer.** Money is owed back and nothing says so. The dashboard shows it only if they open Completed & cancelled. **This is the case that needs (iii).**
2. 🔴 **A HELD order cancelled by the customer.** The authorisation stays live for about a week against an order that no longer exists — see the correction above. **Nothing tells anyone, and no sweep collects it.**
3. A cash-paid order cancelled by the customer: the operator must hand cash back; the PAID chip already offers the record removal.

---

## VERIFICATION

Every case ran against the **real** `POST` handler of `/api/dashboard/action`, real orders, and the real Stripe sandbox connected account. Emails were intercepted before any import; **zero transmitted**.

### (a) Full refund from the active list

```
before: ledger={"paidMinor":1250,"balanceMinor":0,"status":"paid"}   stripe={"amount":1250,"received":1250,"charge_refunded":0,"refunds":[]}
[refund] REFUNDED re=re_3U3xUU2fB4PPCw2D0VtLs7Pp order_key=c908fa1b-… amount_minor=1250 -> status=refunded
HTTP 200 {"success":true,"refunded":true,"refundId":"re_3U3xUU2fB4PPCw2D0VtLs7Pp","amountMinor":1250,"status":"refunded"}
after : ledger={"paidMinor":0,"balanceMinor":1250,"status":"refunded"}
        stripe={"amount":1250,"received":1250,"charge_refunded":1250,"refunds":["re_3U3xUU…:1250:succeeded"]}
```

### (b) Partial refund

```
HTTP 200 {"success":true,"refunded":true,"refundId":"re_3U3xUZ…","amountMinor":500,"status":"part_refunded"}
after : ledger={"paidMinor":1500,"balanceMinor":500,"status":"part_refunded"}
        stripe={"amount":2000,"received":2000,"charge_refunded":500,"refunds":["re_3U3xUZ…:500:succeeded"]}
```

**£15.00 remains refundable, and the ledger says `part_refunded`.**

### (c) A second refund exceeding the remainder — refused

```
partial £5.00 of £20.00 : {"success":true,"refunded":true,"status":"part_refunded"}
over the remainder      : HTTP 409
  operator sees: "Only £15.00 is left to refund on this order."   (remainingMinor=1500)
then the exact £15.00   : {"success":true,"refunded":true,"amountMinor":1500,"status":"refunded"}
once fully refunded     : HTTP 409 "This order has already been fully refunded."
```

*(This case was re-run after a currency symbol was added to the refusal string; the figures are otherwise identical to the first run.)*

### (d) A refund from the COMPLETED list

Same route, same guards, on an order moved to `status: 'collected'`:

```
HTTP 200 {"success":true,"refunded":true,"refundId":"re_3U3xUf…","amountMinor":800,"status":"refunded"}
after : ledger={"paidMinor":0,"balanceMinor":800,"status":"refunded"}   stripe={"charge_refunded":800}
```

### (e) A cash-paid order

```
HTTP 409 {"error":"Nothing was taken by card on this order, so there is nothing to refund here.",
          "refundRefused":"not_card","remainingMinor":0}
ledger untouched: {"paidMinor":600,"balanceMinor":0,"status":"paid"}
```

### (f) The webhook's event for our own refund — no second row

```
replayed the webhook's own writer with re=re_3U3xUU2fB4PPCw2D0VtLs7Pp
inserted=false   ledger rows before=2 after=2   NO SECOND ROW
```

### EVERY WRITE, AND THE CLEANUP

| Write | Undone? |
|---|---|
| 5 `orders` rows + 4 `order_drafts` rows (harness) | **yes** |
| the `order_payments` rows (charges and refunds) and `action_audit_log` rows they produced | **yes** |
| 4 Stripe PaymentIntents, created **and captured**, then refunded | 🔴 **permanent sandbox artifacts** — `pi_3U3xUU2fB4PPCw2D0FNB7uwK`, `pi_3U3xUZ2fB4PPCw2D0XfRcofQ`, `pi_3U3xUf2fB4PPCw2D1soTU6Zh`, `pi_3U3xWO2fB4PPCw2D0N6ranfM`. Test charges and refunds cannot be deleted |
| A first run that died on a harness bug (no `req.headers`) before cleanup | **purged at the start of the second run**; its 3 intents are in the list above |

```
waiting 45s so the deployed webhook is not mid-write when rows go...
ledger rows for harness orders: 7 then 7 — settled
leftovers: {"orders":0,"order_drafts":0,"order_payments":0,"action_audit_log":0}
EMAILS TRANSMITTED: 0
```

### What needs testing by hand

The **UI** legs need a browser, which `next dev` would require: the completed-row chip's appearance, the modal's layout at a narrow viewport, and the cancel modal's four money blocks. The **route, the guards, the ledger row and the Stripe outcome** are all proved above.

---

## NON-ASCII CENSUS

| File | Total before | Total after | Distinct before | Distinct after | Vocabulary |
|---|---|---|---|---|---|
| `lib/payments/refund.ts` | — (new) | 259 | — | 6 | `🔴─—⚠️£` |
| `components/dashboard/PaymentActionsModal.tsx` | — (new) | 255 | — | 9 | `🔴─—⚠️⇒£…·` |
| `lib/payments/ledger.ts` | 1135 | 1140 | 12 | 12 | unchanged |
| `components/dashboard/OrderCard.tsx` | 1508 | 1542 | 31 | 31 | unchanged |
| `app/dashboard/[token]/page.tsx` | 2459 | 2582 | 53 | 53 | unchanged |
| `app/api/dashboard/action/route.ts` | 2974 | 3090 | 16 | **15** | **lost** `–` (the en dash in "3–5"); gained none |
| `lib/email.ts` | 95 | 98 | 16 | **15** | **lost** `–`; gained none |

**No file gained a character class.** Both new files draw only on the vocabulary their neighbours already use.

🔴 **One census violation was introduced and corrected before finishing.** My first pass at the `lib/email.ts` comments used `🔴` and `⚠️` — characters that file has **never** contained (16 → 18 distinct). The comments were rewritten in the file's own style (plain uppercase emphasis) and the count is now 15. **Reported rather than quietly fixed.**

---

## FLAGS

- **Nothing in either prompt arrived garbled**, and no instruction contradicted another.
- 🔴 **Correction to §10's premise: cancelling does NOT release a held authorisation.** No code in the cancel handler touches Stripe, and the stranded sweep's status allow-list excludes `cancelled`. The hold sits until Stripe expires it. The copy tells the truth; the release is **not built**.
- ⚠️ **`readLedger` gained `export`** in `lib/payments/ledger.ts` — visibility only, for the reason given in §1. The alternative was a hand-rolled select that would lose the scope assertion and the test-account stamping.
- ⚠️ **A part-card, part-cash order cannot be refunded from the modal** — the in-person branch takes precedence. Recorded.
- ⚠️ **Reporting is untouched and still counts unpaid orders as revenue**, so these refunds are invisible to it. Backlog, as instructed.
- ⚠️ **Site 1's `paid_at` gate is still wrong** (it never fires for card orders). Copy fixed; gate left. Backlog.
