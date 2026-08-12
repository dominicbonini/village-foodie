# Authorize-then-capture, phase 2b — the wiring

**Date:** 13 August 2026
**BUILD. Five new files, four edited. One migration written and NOT run — you run it by hand. No `next dev`, no `next build`. Nothing committed, nothing deployed.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 READ THESE THREE FIRST

1. 🔴 **VERIFICATION FOUND A REAL DEFECT IN THE PHASE-2a CLAIM, AND IT WOULD HAVE BROKEN EVERY CARD ORDER.** `UPDATE … RETURNING` returns the row **after** the update, so `claimOrderDraft` handed the winner `{name: null, email: null, phone: null}` — the exact fields promotion needs. Every card order would have been created with no customer name, no phone, and **no address to send the confirmation to**. Silently. **Found, fixed, re-proved. §V(d).**
2. ⚠️ **A FACTUAL CORRECTION TO THE BRIEF, DONE RATHER THAN ARGUED.** `payment_intent.succeeded` does **not** arrive with `amount_received: 0` — with manual capture it does not arrive at all until capture. The authorisation event is `payment_intent.amount_capturable_updated`. **Both are wired**, so the brief's instruction is satisfied and the flow also works. **§3.**
3. 🔴 **`supabase/migrations/20260813_order_drafts_authorization.sql` MUST BE RUN BEFORE DEPLOYING.** It also fixes a defect phase 2a shipped: the purge would have **deleted drafts holding live authorisations**, destroying the only record of money held. **§6.**

---

## 1. Files

| File | New/edited | What |
|---|---|---|
| `supabase/migrations/20260813_order_drafts_authorization.sql` | **new** | 3 columns, 1 index, corrected `purge_order_drafts()` |
| `lib/orders/place-in-slot.ts` | **new** | The slot engine, moved **verbatim** out of submit |
| `lib/payments/authorize.ts` | **new** | The manual-capture authorisation, and its cancellation |
| `lib/payments/promote-draft.ts` | **new** | 🔴 The only place an order is created from a draft |
| `app/api/payments/return/route.ts` | **new** | The redirect trigger |
| `app/api/cron/cancel-stale-authorizations/route.ts` | **new** | The sweep that gives money back |
| `app/api/orders/submit/route.ts` | edited | The card fork + the verbatim extraction |
| `app/api/webhooks/stripe/route.ts` | edited | Authorisation branch, amount guard, duplicate branch |
| `lib/payments/order-drafts.ts` | edited | The claim fix, purge guard, three lifecycle writers |
| `app/trucks/[slug]/order/page.tsx` | edited | Sends `payByCard`, follows the redirect, shows the refusal |

⚠️ **`place_order_atomic`, the capacity engine, the stock guard's logic, the confirmation screen and the ledger are all untouched.**

---

## 2. The flow

### First request — card path

```ts
    if (payByCard === true) {
      const draftKey = newOrderKey()
      const created = await createOrderDraft(supabase, { … items: pricedItems, totalMinor: serverTotalMinor … })
      if (created.ok) {
        const auth = await authorizeDraft(supabase, { orderKey: draftKey, amountMinor: serverTotalMinor, … })
        if (auth.ok) {
          return NextResponse.json({ requiresAuthorization: true, orderKey: draftKey, url: auth.url, total: serverTotal })
        }
```

✅ **No order row. No email. No lock. No capacity, no stock, no display number.** The first `.rpc(`/`.insert(` on this route is 400 lines below the fork and is not reached.

⚠️ **THE FORK SITS AT :743, NOT AT :643, AND THAT IS DELIBERATE.** Pricing finishes at :643, but between there and the fork sit the pre-order open gate, the required-modifier completeness guard and the option sold-out backstop — **all of which refuse orders**. Forking at the pricing line would let a customer authorise money for a basket that promotion would then have to refuse and cancel. **Every refusal we can make before touching their card, we make before touching their card.**

⚠️ **OPT-IN, SO PAY-AT-HATCH IS UNTOUCHED.** `payByCard` is absent on every existing client. Absent ⇒ the branch is not entered and execution continues into the lock exactly as today.

⚠️ **AND IT FALLS THROUGH RATHER THAN FAILING.** Stripe not ready, kill switch on, Stripe error ⇒ the order is placed unpaid below and the customer pays at the truck — the behaviour the page already had.

### `capture_method: 'manual'`

```ts
        payment_intent_data: {
          // 🔴 THE LINE THE WHOLE DESIGN RESTS ON. See the header.
          capture_method: 'manual',
          metadata: { order_key: args.orderKey, truck_id: args.truckId, source: 'hatchgrab_online_order' },
        },
```

🔴 **A hold, not a charge. Nothing in this phase captures — grep `lib/payments/` for `capture(` and there is none.**

⚠️ **A Checkout Session, not a bare PaymentIntent, and the reason is stated in the file:** a bare intent has **no UI in this app** to confirm it (`@stripe/stripe-js` is not installed). `payment_intent_data` sets these properties *on the intent the Session creates*, so the resulting intent is exactly the one the brief describes, and `session.payment_intent` returns its id at creation so it can be attached immediately.

🔴 **ATTACHED BEFORE THE CUSTOMER IS SENT ANYWHERE**, and if the attach fails the authorisation is refused outright:

```ts
    if (!attached) {
      console.error(`[authorize] 🔴 could not attach pi=${paymentIntentId} to draft=${args.orderKey} — REFUSING to send the customer to pay, because an authorisation this system cannot name is worse than no card payment. Falling back to pay-at-hatch.`)
```

---

## 3. Promotion, and the two triggers

`promoteDraft(supabase, orderKey, trigger)` — **one function, two callers, and the only place an order is created from a draft.** It claims, re-runs the four binding phases inside the event lock, inserts with the draft's key, and sends the confirmation email.

### 🔴 WHY NOT `place_order_atomic`

**It cannot write the draft's `order_key`.** Its INSERT column list is fixed SQL that does not include the column, so the row takes `gen_random_uuid()`. Changing that function is out of scope by instruction, and duplicating ~90 lines of money-path SQL into a near-identical second RPC is the transcription risk its own migration header warns about.

✅ **So promotion uses the walk-up path's shape** — `nextOrderId()` under the lock → INSERT with the supplied key → `rebuildProductionSlotUsage()` — which is shipped, load-bearing code that already supplies an `order_key`. Both writes are under the **same** event lock, so the oversell guarantee is unchanged.

🔴 **THE COST, STATED:** the insert and the capacity write are two statements, not one transaction. A failure between them leaves a real order with a stale capacity row — **exactly the walk-up path's documented behaviour** ("reported, NOT rolled back"), self-healing on the next rebuild. Losing the order would be far worse.

### ⚠️ THE BRIEF'S PREMISE ABOUT WHICH EVENT CARRIES THE AUTHORISATION

The brief said promotion hangs off `payment_intent.succeeded`, "which now arrives with `amount_received: 0`". **It does not arrive at all.** Under `capture_method: 'manual'` an authorised intent has status `requires_capture` and Stripe emits **`payment_intent.amount_capturable_updated`**; `succeeded` fires only after capture, which is a later phase. **Hanging promotion on `succeeded` alone would mean no card order was ever created.**

✅ **BOTH ARE WIRED.** `amount_capturable_updated` is the real trigger; `succeeded` also promotes if a draft somehow reaches capture unpromoted.

⚠️ **A SUBSCRIPTION IS REQUIRED AND IS NOT CODE.** The endpoint must be subscribed to `payment_intent.amount_capturable_updated` on the connected-account scope (`events_from: @accounts`). Without it this branch never runs and card orders rely on the redirect — which works, but loses the closed-tab guarantee.

### The amount guard — before and after

**BEFORE:**
```ts
    if (!piId || amountReceived === null || amountReceived <= 0) {
      console.warn(`[webhook/stripe] payment_intent.succeeded INCOMPLETE id=${eventId} pi=${piId} amount_received=${String(pi?.amount_received)} — recorded, not acted on`)
      await markHandled(eventId, 'incomplete_payload')
      return NextResponse.json({ received: true })
    }
```

**AFTER:**
```ts
    if (!piId) {
      console.warn(`[webhook/stripe] payment_intent.succeeded INCOMPLETE id=${eventId} — no intent id, not acted on`)
      await markHandled(eventId, 'incomplete_payload')
      return NextResponse.json({ received: true })
    }
    const moneyMoved = amountReceived !== null && amountReceived > 0
```

**What changed and why:** a zero amount no longer ends the branch — it skips the **ledger write** and still attempts promotion. 🔴 **The ledger's rule is untouched and deliberately so: it records money that has MOVED, and nothing has moved until capture.** Only `piId` is now genuinely required.

⚠️ **And "unknown order" stopped being an alarm.** Under authorize-first the order legitimately does not exist yet, so that branch now checks for a draft and promotes; the `Reconcile by hand` error is kept for what it was always meant to catch — money that moved with nothing anywhere to attribute it to.

### The 2xx contract, kept

```ts
function startPromotion(orderKey: string, trigger: 'webhook', eventId: string) {
  void promoteDraft(supabase, orderKey, trigger)
    .then(res => { … return markHandled(eventId, `promotion:${res.status}`) })
    .catch(err => { console.error(`[webhook/stripe] 🔴 promotion(${orderKey}) threw — the event stays UNHANDLED so a redelivery retries it:`, err) })
}
```

⚠️ **THE HONEST LIMITATION, STATED IN THE CODE:** on a serverless runtime the invocation may be frozen once the response is sent, so this is **not guaranteed to finish**. It is an optimisation with a guarantee behind it, not the guarantee itself. A dropped continuation costs latency, never money — because the redirect promotes too and the sweep releases any hold that never became an order.

### 🔴 The duplicate branch

**It used to return before any handler ran.** That was right when handlers were cheap and synchronous. **It is wrong now**: a first delivery can be recorded and then have its promotion dropped, and a redelivery short-circuiting would mean that draft is never promoted by the webhook at all.

```ts
      const { data: seen } = await supabase.from('stripe_webhook_events')
        .select('handled, handler_result').eq('stripe_event_id', eventId).maybeSingle()
      if (seen?.handled) { … return NextResponse.json({ received: true, duplicate: true }) }
      console.warn(`… recorded but NOT handled (handled=${String(seen?.handled)}). Re-running the handler …`)
      // ⚠️ Deliberately NOT a return. Execution continues into the dispatch below.
```

✅ **`handled = true` ⇒ done, acknowledge. `handled = false` ⇒ recorded but the handler never finished ⇒ fall through and run it.** `markHandled` is called only from `startPromotion`'s `.then`, i.e. **only once the work actually finished** — which is what makes the distinction real. Re-running is safe: the claim is idempotent, the ledger is idempotent on the intent id.

### The redirect trigger

`success_url` → `/api/payments/return?draft={order_key}&truck={slug}` → promotes → **303 to the same `?confirm=` URL Stripe used to point at directly.** ✅ **The confirmation screen and its `?confirm=` branch are untouched**; it renders from the order row exactly as for a pay-at-hatch customer.

Both triggers call the same `promoteDraft`. The loser gets `{ status: 'already' }` and does nothing.

---

## 4. 🔴 STOCK RE-CHECK FAILS AT PROMOTION — WHAT THE CUSTOMER SEES

The four binding phases run **again**, inside the lock, because the pre-draft answer is stale by the time a card number has been typed. If one refuses:

1. **No order is created.**
2. **The authorisation is cancelled immediately** — `stripe.paymentIntents.cancel`, a hold released, never a charge refunded. This is the entire reason `capture_method` is manual: on a direct charge HatchGrab is not merchant of record and **cannot** refund.
3. The draft records `promotion_failed_at` + reason.
4. The customer is redirected to the menu with the message below.

**The exact words, composed in `promoteDraft` so the webhook path logs identical wording:**

> **Sorry — Margherita sold out while you were paying, so we could not place your order. No money has been taken.**

Variants: `${closed[0]} closed while you were paying, …`, `${optShort[0].name} sold out while you were paying, …`, and for an insert failure `Sorry — we could not place your order. No money has been taken.`

🔴 **EVERY ONE ENDS WITH "No money has been taken", AND THAT IS THE LOAD-BEARING CLAUSE.** Anything vaguer and the customer checks their banking app, sees a pending authorisation that has not yet dropped off, and concludes they were charged for nothing.

**Rendered in its own red panel** in the order sheet — not amber like every other notice, because every other notice means "adjust your basket"; this one means "your card was authorised, it has been released, and you have no order". The server's sentence renders **whole**, no prefix, no suffix.

⚠️ **If the cancel itself fails**, the customer is told the same thing — it is still true, the hold expires and the sweep retries — and the log is loud for a human.

---

## 5. Authorisations that never become orders

| Case | Cancelled by | When |
|---|---|---|
| Promotion refused (stock/closed/insert) | `promoteDraft` → `releaseHold` | immediately, in-band |
| Promotion threw after claiming | 🔴 **nothing in-band, on purpose** | the sweep |
| Draft expired, never promoted | 🔴 **the sweep** | scheduled |
| Attach failed before payment | n/a — the customer was never sent to pay | — |

⚠️ **The "threw after claiming" case deliberately does NOT cancel:** we do not know whether an order was created, and cancelling money for an order that may exist is worse than a hold the sweep resolves. It is logged loudly and named.

### 🔴 A SCHEDULED SWEEP IS REQUIRED, AND `purge_order_drafts()` DOES NOT COVER IT

**`app/api/cron/cancel-stale-authorizations`** — `CRON_SECRET` bearer or admin, the same gate `account-deletion-due` uses. It lists drafts that have money against them, were never promoted, are not yet cancelled, and whose window has passed; cancels each at Stripe; **cancels first, marks second** (marking a hold released that is not released would hide it from this very query, forever).

⚠️ **NOT YET REGISTERED IN `vercel.json`.** The cron entry has to be added deliberately. Suggested every 10 minutes.

🔴 **`purge_order_drafts()` DELETES ROWS. IT MOVES NO MONEY.** The two jobs are in sequence, not competition: the sweep releases the money and marks the draft; the purge then erases the row on a later pass. **And since the migration below, the purge cannot run ahead of it.**

---

## 6. 🔴 THE MIGRATION — AND A DEFECT PHASE 2a SHIPPED

`supabase/migrations/20260813_order_drafts_authorization.sql` adds `authorization_cancelled_at`, `promotion_failed_at`, `promotion_failure_reason`, one partial index, and **corrects `purge_order_drafts()`**.

**The defect, found while wiring:** both purges deleted on `promoted_at is null and expires_at < now()`. That was correct when a draft was only ever a wish. **It is not correct once a draft can carry a live Stripe authorisation** — deleting that row destroys the only record linking the PaymentIntent to anything we know, and the money would sit authorised until Stripe expired it, with nothing able to name it.

```sql
  delete from order_drafts
   where promoted_at is null
     and expires_at < now()
     -- 🔴 THE NEW CONDITION. Never delete a row that may still be holding a customer's money.
     and (payment_intent_id is null or authorization_cancelled_at is not null);
```

**A PURGE MUST NEVER OUTRUN A CANCELLATION.** The same guard is applied lib-side in `createOrderDraft`'s opportunistic purge.

⚠️ **THE CONSEQUENCE, STATED:** erasure now depends on the sweep too. If it stops, rows accumulate and their PII outlives its expiry. **That is the right way round — lingering details are recoverable, orphaned money is not.**

🔴 **DEPLOY-COUPLED. RUN IT BEFORE DEPLOYING.** The named selects include the new columns; PostgREST answers a named select on a missing column with 42703 and fails the whole statement, so every draft read would return null and the card path would read that as "no draft". **Applying early is harmless.**

---

## V. VERIFICATION — actual values

⚠️ **WRITES WERE UNAVOIDABLE AND ARE DECLARED.** Draft rows and one probe order were created against the live database and deleted. **Residue check after cleanup: `order_drafts` rows = 0, probe orders = []**. The `orders` count moved 449 → 451 during the session; both are **real customer orders placed today** (`#6 Jocelyn`, `#7 Ariana`, pizzeria-gusto, `source: web`), not residue — verified by name, timestamp and by confirming neither probe key exists as an order.

⚠️ **AND ONE LIMITATION, STATED PLAINLY:** the 20260813 migration is not applied (you run migrations by hand, and there is no `psql` or `DATABASE_URL` here). So the **wired modules' own named selects cannot run yet** — the first attempt failed with `column order_drafts.authorization_cancelled_at does not exist`, **which is precisely the deploy coupling documented above, firing as predicted.** The draft rows below were therefore written and claimed with **direct SQL transcribed character-for-character from the module's filters**, so what is proved is the real mechanism, not a paraphrase.

### (a) A draft consumes NO stock and NO capacity

```
event truck=pizzeria-gusto event=07f77017-6447-4789-b5d0-510a18c8b5ea date=2026-07-17  dish="Dolce Biscoff Pizza"
draft written: abb8e525-41fe-4118-b228-4d120696d6bb — claims 99 x Dolce Biscoff Pizza + 99 x Extra cheese
  getLiveItemCounts["Dolce Biscoff Pizza"]  0 -> 0
  getLiveOptionCounts["Extra cheese"]       0 -> 0
  getProductionSlotUnits windows            0 -> 0
PASS - all three tallies byte-identical with a live draft present; orders on the event still 44
```

✅ **The real tallies, imported from `lib/`, run against a real event, with a draft claiming 99 of a real dish and 99 of a real modifier option — enough to blow any ceiling. Nothing moved.**

### (b) Promotion creates the order with the draft's own `order_key`

```
claim returned rows: 1  error: null
order inserted with the DRAFT key: {"order_key":"abb8e525-41fe-4118-b228-4d120696d6bb","id":"__probe__"}  error: null
PASS - orders.order_key === draft.order_key === abb8e525-41fe-4118-b228-4d120696d6bb
```

### (c) Two concurrent promotions

```
  claim A: won=false error=null
  claim B: won=true  error=null
  winners=1  errors=0
PASS - exactly one winner, loser errored nothing
```

✅ **Two claims fired concurrently via `Promise.all`. Exactly one won. The loser got zero rows and NO error.**

### (d) 🔴 THE DEFECT, AND THE PII

```
══ 🔴 THE DEFECT THAT VERIFICATION FOUND, BEFORE AND AFTER ══
  BEFORE (one statement, RETURNING after the update) the winner received:
    {"name":null,"email":null,"phone":null}   <- an order with no customer and no email
  AFTER  (read, then claim) the winner receives:
    {"name":"Ada Lovelace","email":"ada@example.invalid","phone":"07700900000"}
PASS - the details needed to create the order and send the confirmation survive the claim

══ (d) PII erased once the order exists ══
  after the claim, BEFORE the order insert: {"customer_name":"Ada Lovelace","customer_email":"ada@example.invalid","customer_phone":"07700900000","promoted_at":"2026-08-12T13:52:07.484+00:00"}
  after erasePii (i.e. after the order exists): {"customer_name":null,"customer_email":null,"customer_phone":null,"promoted_at":"2026-08-12T13:52:07.484+00:00"}
PASS - all three PII columns null, promoted_at set
```

🔴 **The phase-2a doc comment claimed "The returned row still carries the values, because the caller needs them to create that order." That claim was FALSE and the code was written to it.**

**The fix, and why it is better on its own merits:** `claimOrderDraft` now **reads, then claims** (the guard still arbitrates; the read decides nothing, and a loser reading the PII never wins so never uses it), and erasure moved to `erasePii`, called **after the order exists**. Erasing at the claim destroyed the customer's details at the moment promotion began — so any failure between claim and insert left a draft nobody could ever reconstruct into an order.

### (e) The pay-at-hatch path is unchanged

**e1 — the moved engine is byte-identical:**
```
  lib/orders/place-in-slot.ts:27-202  vs  HEAD submit/route.ts:130-305
  identical once the three `export` keywords are removed: true
```

**e2 — it still places the same, run live:**
```
  pizzeria-gusto 2026-07-15 requested=18:00 -> booked=true finalSlot=18:00
  test-truck     2026-07-03 requested=17:05 -> booked=true finalSlot=17:25
  test-truck     2026-07-03 requested=17:10 -> booked=true finalSlot=17:10
```
⚠️ The 17:05 → 17:25 bump is the backward fit working, not a regression — the same reassignment the engine has always made when a requested slot is full.

**e3 — every order re-priced through the pay-at-hatch pricing:**
```
  orders re-priced : 451
  EXACT MATCH      : 449
  DIFFER           : 2 [{"id":"16","stored":33,"server":34.5,"delta":1.5},{"id":"13","stored":28.5,"server":30,"delta":1.5}]
  PASS - identical to the pre-change measurement (445/447 exact, the two known Extra-cheese walk-ups)
```

✅ **449/451 exact — the same two known-divergent Test Kitchen walk-ups and nothing else. Four more orders than the last measurement, four more exact matches.**

### Gates

```
tsc: clean
eslint errors: {'app/api/orders/submit/route.ts': 23, 'app/trucks/[slug]/order/page.tsx': 18} total 41
               (baseline for the four edited files was 41 — ZERO NEW, and the five new files contribute none)
```

---

## VI. NON-ASCII CENSUS

| File | Before (total/distinct) | After (total/distinct) | New class? |
|---|---|---|---|
| `app/api/orders/submit/route.ts` | 1240 / 19 | 1329 / 19 | ✅ none |
| `app/api/webhooks/stripe/route.ts` | 547 / 8 | 764 / 8 | ✅ none |
| `lib/payments/order-drafts.ts` | 372 / 5 | 432 / 5 | ✅ none |
| `app/trucks/[slug]/order/page.tsx` | 1941 / 39 | 2037 / 39 | ✅ none |
| `lib/orders/place-in-slot.ts` | — (new) | 30 / 6 | — |
| `lib/payments/authorize.ts` | — (new) | 199 / 6 | — |
| `lib/payments/promote-draft.ts` | — (new) | 438 / 7 | — |
| `app/api/payments/return/route.ts` | — (new) | 163 / 6 | — |
| `app/api/cron/cancel-stale-authorizations/route.ts` | — (new) | 127 / 6 | — |
| `20260813_order_drafts_authorization.sql` | — (new) | 106 / 6 | — |

✅ **Every edited file's distinct set is identical to its baseline.**

⚠️ **ONE VIOLATION I INTRODUCED AND CORRECTED.** My webhook comments added **`•` (U+2022)** and **`✅` (U+2705)** to a file whose baseline was eight classes and contained neither — caught by my own census at 10 distinct, rewritten to `-` and `🔴`, back to 8. **Reported rather than quietly fixed.**

---

## VII. What was NOT touched

| Constraint | Held? |
|---|---|
| The pay-at-hatch path still creates the order directly | ✅ **Proved in §V(e)** — the fork is opt-in, the engine is byte-identical, pricing unchanged |
| Capacity engine, `place_order_atomic`, stock guard logic | ✅ **Untouched.** Promotion *calls* the guards; it changes none of them |
| Capture | ✅ **Not built.** No `capture(` anywhere in `lib/payments/` |
| The confirmation screen and the ledger | ✅ **Untouched.** The return route redirects to the same `?confirm=` URL; the ledger's write is unchanged and still gated on money having moved |

## Not established

- 🔴 **Nothing has been exercised end-to-end against Stripe.** No authorisation was created, no webhook delivered, no promotion run through the real modules. The migration must be applied first, and then this needs a live sandbox card run before it goes near a customer.
- 🔴 **The `payment_intent.amount_capturable_updated` subscription must be added at Stripe.** Code alone does not do it.
- ⚠️ **The cron entry is not in `vercel.json`.** The sweep exists and is authorised; nothing schedules it.
- ⚠️ **Whether promotion should retry on lock contention.** It returns `error` and leaves the draft *claimed*, so neither trigger retries it and the sweep eventually cancels the hold. A customer who paid then loses their order to contention. Rare, and the safest available behaviour, but it is a real gap.
- ⚠️ **The abandoned-at-Stripe `cancel_url`** returns to `?payment=abandoned`, which nothing on the page reads yet — it is inert, not wired.
- **Capture, and what happens to an order that is confirmed but whose authorisation has expired.** Later phase, carried forward.
