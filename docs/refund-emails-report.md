# One reason, and emails that say what happened

BUILD. 13 August 2026.

**No `next dev`, no `next build`, no commit, no deploy. No migration is needed and none was written.**

**Six files changed:**

```
lib/email.ts                                 cancellationPaymentSentence + sendRefundEmail
app/api/dashboard/action/route.ts            the refund email, the three cancellation cases, a text twin
app/dashboard/[token]/page.tsx               ONE reason dropdown; the decision travels with the cancel
components/dashboard/PaymentActionsModal.tsx the how-paid line
components/dashboard/OrderCard.tsx           passes the charge rows through
lib/payments/ledger.ts                       `method` joins LEDGER_ROW_COLUMNS (additive)
```

`npx tsc --noEmit` exits 0. Nothing on the WHAT NOT TO TOUCH list was touched: the refund guards, the amount checks, `refunds.list` and the idempotency key are **untouched**; release-on-cancel and its ordering are **untouched**; `getOrderBalance`, the CHECK and the refund event handlers are **untouched**; Reports is **untouched**.

⚠️ **A seventh requirement arrived mid-build** (the paid modal must say how they paid). It is answered in §7, and it is the reason `lib/payments/ledger.ts` appears above.

---

## 1. ONE REASON DROPDOWN

### Both, as they stood

**The cancellation reason** (`page.tsx`, customer-visible, optional):

```tsx
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Reason — optional</label>
              <select value={cancelReason} onChange={e=>setCancelReason(e.target.value)} ...>
                <option value="">Select a reason</option>
                <option value="Sold out / item unavailable">Sold out / item unavailable</option>
                <option value="Requested by customer">Requested by customer</option>
                <option value="Other">Other</option>
              </select>
```

**The refund reason** (added yesterday with the refund path, operator-facing, required):

```tsx
                      <span className="text-xs font-semibold text-amber-900 uppercase tracking-wide">Refund reason</span>
                      <select value={cancelRefundReason} onChange={e=>setCancelRefundReason(e.target.value)} ...>
                        {[['customer_cancelled','Customer cancelled'],['item_unavailable','Item unavailable'],['not_collected','Order not collected'],['wrong_or_missing_item','Wrong or missing item'],['quality_issue','Quality issue'],['duplicate_payment','Duplicate payment'],['other','Other']].map(...)}
```

### 🔴 THE LISTS DIFFER, AND THE SEVEN SURVIVE — because the three are a subset

| Cancellation reason | Maps to | Lost? |
|---|---|---|
| Sold out / item unavailable | `item_unavailable` | no |
| Requested by customer | `customer_cancelled` | no |
| Other | `other` | no |

**The reverse is not true.** `not_collected`, `wrong_or_missing_item`, `quality_issue` and `duplicate_payment` have **no** cancellation equivalent — keeping the three would have **dropped four**. **Nothing was silently dropped; the superset survives.**

### What happens to the single value

```tsx
    const reasonLabel=CANCEL_REASONS.find(([v])=>v===cancelReason)?.[1]??''
    const fullReason=[reasonLabel,cancelNote].filter(Boolean).join(' — ')
```

| Destination | What it gets |
|---|---|
| **Stripe** | `stripeReasonFor(reason)` — `duplicate` for a duplicate payment, `requested_by_customer` for everything else. Unchanged; the mapping lives in `lib/payments/refund.ts` |
| **Our own record** | the seven-value machine string on the `refund_issued` audit row, plus the note, plus the actor and the figures |
| **`orders.cancellation_reason`** | the **label** joined to the note — `"Customer cancelled — she called to say she could not make it"` — exactly the string the old select produced |
| **The customer** | that same label, in the cancellation email's reason line, as before |
| **The refund note** | `fullReason` — so the audit row carries the cancellation's own words |

**The cancellation reason and the refund note are now the same field**, asked once. ⚠️ **Required only when it will move money:** the label reads *"Reason — required"* when a refund is ticked and *"— optional"* otherwise, and the confirm refuses with *"Choose a reason for the refund."* The server's own `'other' ⇒ note required` rule is unchanged.

✅ **Measured on the shipped file: the cancel modal now contains exactly `1` `<select>`.**

---

## 2. A STANDALONE REFUND EMAILS THE CUSTOMER

**`sendRefundEmail` lives in `lib/email.ts`**, beside every other piece of customer copy — the refund path passes figures, the formatter renders, exactly as `paymentNote` works.

**Full refund** — subject *"Your order #62 has been refunded — Test Kitchen"*:

> **HTML:** Hi Ada, / **Test Kitchen has refunded your order. £12.50 has gone back to the card you paid with.** / *Refunds usually take 5 to 10 business days to appear on your statement, depending on your bank.* / If anything looks wrong, please contact Test Kitchen. / Test Kitchen
>
> **Text:** `Hi Ada, Test Kitchen has refunded your order. £12.50 has gone back to the card you paid with. Refunds usually take 5 to 10 business days to appear on your statement, depending on your bank. If anything looks wrong, please contact Test Kitchen. Powered by HatchGrab — hatchgrab.com`

**Partial refund** — subject *"A refund for your order #62 — Test Kitchen"*:

> **HTML:** Hi Ada, / **Test Kitchen has refunded £5.00 of your order to the card you paid with. The rest of the order, £15.00, is unchanged.** / *Refunds usually take 5 to 10 business days…* / If anything looks wrong, please contact Test Kitchen.
>
> **Text:** the same sentence, with the HatchGrab footer.

🔴 **Full and partial are different sentences because they leave the customer in different positions** — a full refund closes the order's money; a partial one leaves the rest standing, and they need to be told rather than left to wonder.

⚠️ **It does not send when the refund is part of a cancellation** (`refund_context: 'cancellation'`), because §3's email says its own thing and two emails for one event is worse than none. **Measured: `emails from the refund itself: 0`.**

⚠️ **An email failure cannot read as a refund failure** — it is caught and logged; the money has gone back either way.

---

## 3. THE CANCELLATION EMAIL SAYS WHAT HAPPENED

**One sentence-builder, `cancellationPaymentSentence`, shared by both cancel paths** (the operator route builds its own HTML; the customer route uses `sendCancellationEmail`), returning **both** renderings so they cannot disagree.

**Cancelled AND refunded** — measured:

> **HTML:** Hi Ada, / Your order #E900 from Test Kitchen has been cancelled. / Customer cancelled / **£9.00 has been refunded to your card. Refunds usually take 5 to 10 business days to appear on your statement, depending on your bank.** / We're sorry for any inconvenience.
>
> **Text:** `Hi Ada, your order #E900 from Test Kitchen has been cancelled. Customer cancelled £9.00 has been refunded to your card. Refunds usually take 5 to 10 business days to appear on your statement, depending on your bank. We're sorry for any inconvenience. Powered by HatchGrab — hatchgrab.com`

**Cancelled, refund DECLINED (the no-show)** — measured:

> **HTML:** … has been cancelled. / Customer cancelled / **If you have a question about payment for this order, please contact Test Kitchen.** / We're sorry…
>
> **Text:** the same sentence inline.

🔴 **It neither promises a refund nor says one was refused.** The operator may change their mind, and an email is the wrong place to argue — so it names who to ask and stops.

**Cancelled, nothing ever paid** — measured:

> **HTML:** … has been cancelled. / Sold out / We're sorry for any inconvenience.
>
> **Text:** the same, with no payment sentence at all.

⚠️ **A fourth case survives from the previous build:** a cancelled **held** order still reads *"Your card was held for this order, not charged. That hold has been released and no money has been taken."*

⚠️ **The operator cancellation email had no plain-text body at all** — `notifyCustomer` sent HTML only, and every case above showed `TEXT: undefined`. It now takes an **optional** text part, passed only by this email; every other caller is byte-identical.

---

## 4. STRIPE'S CURRENT TIMEFRAME

🔴 **The old "3-5 working days" was WRONG, not merely stale.** QUOTED from `docs.stripe.com/refunds`, section **"Trace a refund"**, read 13 August 2026:

> *"After you initiate a refund, Stripe submits refund requests to your customer's bank or card issuer. **Your customer sees the refund as a credit approximately 5-10 business days later, depending upon the bank.**"*

**So the copy says "usually take 5 to 10 business days to appear on your statement, depending on your bank"** — Stripe's own range, with Stripe's own hedge.

⚠️ **Two things from the same page that the copy deliberately does NOT claim**, because they would confuse more than they help:

- *"Successful refunds appear on the bank statement of your customers in real time, depending on the card network and issuing bank."* — a different, faster claim in a different section. **The customer-facing expectation Stripe gives is the 5-10.**
- *"Refunds issued shortly after the original charge appear in the form of a reversal instead of a refund. In the case of a reversal, the original charge drops off the customer's statement, and a separate credit isn't issued."* 🔴 **This is a real support case** — a customer refunded within minutes may see the charge vanish and never see a credit. **Not built into the copy; recorded here.**

---

## 5. A CUSTOMER-CANCELLED PAID ORDER

**Measured, through the real customer-cancel route:**

> **HTML:** Hi Ada, / Your order #E1100 from Test Kitchen has been cancelled. / **If you paid by card, any refund is handled by Test Kitchen directly — please contact them about it.** / We're sorry for any inconvenience.
>
> **Text:** the same sentence.
>
> ```
> promises a refund? false
> ```

✅ **Confirmed: it does not promise a refund**, and it cannot — no refund is issued on that path, and nobody was present to decide. It points at the truck, which is the one thing the customer can act on. **That route was not otherwise changed.**

---

## 6. A PENDING REFUND

**Three separate guards, because there are three ways it could leak:**

1. **No refund email.** The send is gated on `outcome.status === 'refunded'`; a `pending` outcome falls through it. *"An email saying 'refunded' would be the false-success class in the customer's inbox, where it cannot be corrected."*
2. **No refunded-amount on the cancellation.** The client only sets `refundedMinor` when the route reports it **settled**:
   ```ts
      if(res.settled)refundedMinor=refundableMinor
   ```
   so a pending refund during a cancellation falls back to the neutral *"If you have a question about payment…"* sentence rather than claiming money moved.
3. **The operator still hears the truth** — *"£9.00 refund sent. Stripe is processing it — the order will show as refunded once the money has actually gone back."* Unchanged from yesterday.

⚠️ **The customer is told nothing until it settles.** The webhook writes the ledger row on `refund.updated`, and **no email is sent then** — the settle-time email is a gap, stated rather than built, because the webhook is on the do-not-touch list.

---

## 7. HOW THEY PAID — WHAT THE DATA SUPPORTS

### Measured across every real ledger row (183)

```
kind / channel / method:
   165  charge / in_person_other / method=NULL
    16  charge / online          / method=card
     1  charge / in_person_other / method=cash
     1  refund / online          / method=card

IN-PERSON CHARGE ROWS: 166   with method NULL: 165   with a method: 1
DISTINCT channel VALUES: ["in_person_other","online"]
DISTINCT method VALUES:  [null,"cash","card"]

ORDERS WITH CHARGES ON MORE THAN ONE CHANNEL (mixed): 3
```

🔴 **The earlier audit is CONFIRMED and updated: 165 of 166 in-person rows carry `method = NULL`** (it was 92 of 93; the ratio holds). **Cash and the truck's own card machine are the same row for all but one payment in the entire history.**

**Does the walk-up flow record it at all? Yes — the mechanism exists on both surfaces and is simply not used:**

- `AddOrderPanel` has Cash and Card buttons that set `paymentMethodRef` and send `paymentMethod`, which the route maps to `method`.
- `OrderCard` renders **💷 Cash / 💳 Card** instead of a single "Mark paid" — but **only when `takesCash`**, a truck setting resolved by `resolvePaidStep`.

**165 NULL rows say the single "Mark paid" button was used.** ⚠️ **So this is a settings-and-habit gap, not a schema one** — and the line below will say more the moment an operator uses the split buttons.

### The line, per case — measured from the shipped source

| Case | Renders |
|---|---|
| **online only** | **"Paid online by card"** |
| **in person, `method` NULL** (165 of 166) | **"Paid in person"** + *"Cash or your card machine — not recorded"* |
| **in person, `cash`** | **"Paid in cash"** |
| **in person, `card`** | **"Paid on your card machine"** |
| **MIXED** (3 real orders) | **"Paid online by card — £6.50"** and **"Paid in person — £6.00"** + the hint |
| **no charge rows** | nothing renders |

🔴 **The NULL case says "in person" and says WHY it cannot say more.** Inventing "cash" for a row that does not know would be worse than a vaguer sentence an operator can trust. ⚠️ **A mixed order gets both lines with their amounts**, because picking one would describe half of what happened.

### Where it goes

**Directly under the modal's own heading, above every branch** — measured: `{howPaidBlock}` appears **3 times** (one per branch: Remove payment · Paid by card · the refund form) and the first occurrence precedes the "Remove payment?" heading.

**It cannot contradict the partial-refund copy below it**, because they answer different questions: this says **how** the money arrived; the refund block says **how much is left to send back** (*"£20.00 was paid by card, £5.00 already refunded. £15.00 can be refunded."*). ✅ Both still render.

⚠️ **ONE FILE OUTSIDE THE OBVIOUS SET HAD TO CHANGE, AND IT IS DECLARED:** `LEDGER_ROW_COLUMNS` did not ship `method`, so the client could never have seen it. It now reads:

```ts
export const LEDGER_ROW_COLUMNS = 'order_key, truck_id, kind, channel, amount_minor, state, external_ref, livemode, method'
```

**Additive: nothing computes on it, `getOrderBalance` ignores it, and every existing consumer reads the same fields it always did.** Without it §7 is unanswerable.

---

## VERIFICATION

Real routes, real orders, real Stripe sandbox; **Brevo intercepted at `globalThis.fetch` — zero emails transmitted**, every one captured and printed.

| Case | Result |
|---|---|
| **(1) Standalone full refund** | 1 email · *"Your order #E1250 has been refunded"* · £12.50 · HTML **and** text |
| **(2) Standalone partial refund** | 1 email · *"A refund for your order #E2000"* · £5.00 refunded, £15.00 unchanged |
| **(3) Cancel with refund** | **0 emails from the refund**, 1 from the cancellation, carrying *"£9.00 has been refunded to your card"* in HTML and text |
| **(4) Cancel without refund** | 1 email · *"If you have a question about payment for this order, please contact Test Kitchen."* · no promise, no refusal |
| **(5) Cancel, nothing paid** | 1 email · **no payment sentence at all** |
| **(6) Customer cancels a paid order** | 1 email · points at the truck · `promises a refund? false` |
| **The modal** | `<select> count = 1`; the how-paid line renders above all three branches |

**Every write, and the cleanup:** 9 `orders` rows, 8 `order_drafts`, the `order_payments` rows the captures and refunds wrote, and the audit rows — **all deleted** after a 45s wait and a 15s re-poll (`ledger rows: 8 then 8 — settled`), leaving `{"orders":0,"order_drafts":0,"order_payments":0}`. **Ten Stripe sandbox PaymentIntents remain** (captured and refunded; test objects cannot be deleted): `pi_3U3yMY…`, `pi_3U3yMd…`, `pi_3U3yMh…`, `pi_3U3yMm…`, `pi_3U3yMp…` and the five from the re-run.

**What needs a browser:** the modal's and the cancel dialog's layout. Every sentence above is the rendered output.

---

## NON-ASCII CENSUS

| File | Before | After | Distinct before | Distinct after | Vocabulary |
|---|---|---|---|---|---|
| `lib/email.ts` | 99 | 103 | 15 | 15 | unchanged |
| `app/api/dashboard/action/route.ts` | 3181 | 3218 | 15 | 15 | unchanged |
| `app/dashboard/[token]/page.tsx` | 2582 | 2648 | 53 | 53 | unchanged |
| `components/dashboard/PaymentActionsModal.tsx` | 255 | 317 | 9 | 9 | unchanged |
| `components/dashboard/OrderCard.tsx` | 1542 | 1545 | 31 | 31 | unchanged |
| `lib/payments/ledger.ts` | 1140 | 1145 | 12 | 12 | unchanged |

**No file gained a character class.** ⚠️ `lib/email.ts` has never contained `🔴` or `⚠️` and still does not — the new comments there use plain uppercase, as that file does throughout.

---

## FLAGS

- **Nothing in either prompt arrived garbled**, and no instruction contradicted another.
- 🔴 **The old refund timeframe was wrong, not just stale:** Stripe currently states **5-10 business days**, not 3-5.
- 🔴 **165 of 166 in-person rows cannot distinguish cash from a card machine.** The copy says so rather than guessing, and the mechanism to record it already exists behind the `takesCash` setting.
- ⚠️ **`LEDGER_ROW_COLUMNS` gained `method`** — additive, and the only way §7 could be answered.
- ⚠️ **A settled-later (pending) refund emails the customer nothing** when it eventually goes through. The webhook is fenced off; recorded.
- ⚠️ **Stripe's "reversal" case is not in the copy:** a refund issued minutes after the charge can make the original charge vanish with no separate credit. A likely support question, stated not built.
