# charge.refunded: a refund made at Stripe now reaches the ledger

**Date:** 12 August 2026
**BUILD.** No `next dev`, no `next build`. Nothing committed. Nothing deployed.
**🔴 ONE MIGRATION FOR YOU TO RUN:** `supabase/migrations/20260817_orders_payment_status_part_refunded.sql`

---

# ⚠️ ONE PREMISE CORRECTED, AND ONE DESIGN CHANGED BY MEASUREMENT

**FLAG — a "treat as given" premise was slightly off.** The brief says *"the webhook handles exactly two event types"*. It handled **three**: `account.updated`, `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`. It changes nothing about the work; flagging it rather than quietly correcting it.

# 🔴 AND THE HEADLINE: `charge.refunded` CANNOT DO THIS JOB FROM ITS OWN PAYLOAD

The obvious build — *handle `charge.refunded`, read the refunds out of the event* — **does not work**, and I found that by issuing a real refund and reading the real event rather than by reasoning about it:

```
charge.refunded data.object:
  id: ch_3U3kom2fB4PPCw2D1L4Xa58e   payment_intent: pi_3U3kom…   amount_refunded: 650   refunded: true
  refunds present?  false   undefined          <- 🔴 NO `refunds` KEY AT ALL
```

**There is nothing in that payload carrying a refund id**, so nothing that can key a row one-per-refund — and `amount_refunded` is no substitute because it is **cumulative**. So the design became **three event types, one writer**:

| Type | Role | Cost |
|---|---|---|
| `refund.created` | **the primary.** Its `data.object` IS the Refund — `id`, `amount`, `status`, `payment_intent` | no network call |
| `refund.updated` | **the settlement trigger**, and the only event for a pending refund flipping to succeeded | no network call |
| `charge.refunded` | ⚠️ **the safety net.** It names the intent, so it has to **ask** — one `refunds.list` on the connected account | one GET, on a rare branch |

All three converge on `stripe_re:<refund id>`, so whichever arrives first with a settled refund writes the row and every other delivery is a 23505 no-op.

🔴 **YOU MUST SUBSCRIBE THE ENDPOINT TO ALL THREE**, on the **connected-account scope** (`events_from: @accounts`) — the same caveat already written against `amount_capturable_updated`. `refund.created` and `refund.updated` are the ones that matter; without them a pending refund is never recorded at all.

---

## 1. The correlation

**The ledger is the index.** Stripe gives us the PaymentIntent; our own capture row for that intent was written under `stripe_pi:<intent id>` and carries the order and the truck:

```ts
      const { data: chargeRow, error: lookupErr } = await supabase
        .from('order_payments')
        .select('order_key, truck_id, currency')
        .eq('idempotency_key', onlinePaymentIdempotencyKey(piId))
        .maybeSingle()
```

**A unique-index hit on `order_payments_idempotency_key_uidx`.** No join, no scan, no metadata.

⚠️ **METADATA IS DELIBERATELY NOT USED.** Our `order_key` rides on the **PaymentIntent**, not the Charge — and a refund issued from the truck's own Dashboard carries none of ours at all. The ledger row is the only correlation that works for a refund **we did not initiate**, which is the entire case this handler exists for.

Three outcomes, all live-verified:

| | |
|---|---|
| **row found** | proceed |
| **no row** | `— no charge of ours under that intent, ignoring`, counted as `skipped`, **200**. Ordinary: the same account takes payments that did not originate here |
| **lookup errored** | 🔴 **500 so Stripe retries.** We cannot tell whether it is ours, and guessing "not ours" loses a customer's refund silently |

---

## 2. The idempotency key

```ts
export function onlineRefundIdempotencyKey(refundId: string): string {
  return `stripe_re:${refundId}`
}
```

**Why not the intent or the charge** — Stripe: *"You can optionally refund only part of a charge. You can do so multiple times."* Keying on either would make the **second** partial refund a 23505 no-op: silently swallowed, the exact defect `collectIdempotencyKey` was rewritten to fix when `collect:{order_key}` swallowed every charge after the first. **The refund id is the only identifier that is one-per-refund**, and it is stable across every redelivery of every event that mentions it.

### ✅ REDELIVERY WRITES NOTHING NEW — MEASURED

The receipt row was deleted first, so the handler re-ran the work rather than short-circuiting on the duplicate branch:

```
  (receipt row deleted so the handler re-runs rather than short-circuiting on the duplicate branch)
[webhook/stripe] refund DUPLICATE (no-op) order=e7950c8a-… refund=re_3U3ksB2fB4PPCw2D0cXSkUFk amount_minor=650 -> status=refunded paid_minor=0
  redelivered: charge.refunded evt_3U3ksB… -> 200 {"received":true}  handler_result=refund:written=0,pending=0,skipped=0
  🔴 ledger rows 2 -> 2  NO SECOND ROW
```

**Two guards, not one:** `stripe_webhook_events`' unique event id short-circuits an ordinary redelivery before any work; `order_payments_idempotency_key_uidx` catches it even when that is bypassed.

---

## 3. 🔴 THE PENDING DECISION: NO ROW UNTIL IT SETTLES

**My reasoning, and it turns on a constraint I was told not to change.**

`getOrderBalance` counts only `state === 'succeeded'`, and I may not change that. **So a `pending` row would be inert** — it would move no balance and alter no surface. That collapses the choice:

| | Writing a pending row | Writing nothing until it settles |
|---|---|---|
| Effect on the balance | **none** | **none** |
| Effect on any surface | **none** | **none** |
| Cost | 🔴 `recordPaymentEvent` is **INSERT-ONLY**. Flipping it later means building an UPDATE path into the ledger — for a row nothing reads | none |
| Honesty | a row that says money moved when it has not | nothing claimed |

**So: no ledger row until the money has actually gone back.** The pending state is recorded in `action_audit_log` instead, where it is visible without pretending to be money that has moved:

```
[webhook/stripe] refund=re_… on order_key=ba3301c5-… is pending, NOT succeeded — no ledger row yet.
  The order still reads paid, which is true: the money has not gone back. Waiting for refund.updated.
  🔴 audit: [{"action":"refund_pending","amount_minor":100,
             "after_state":{"meaning":"Stripe has not settled this refund yet, so no money has gone back
                             and no ledger row exists","recorded":false,"stripe_status":"pending"}}]
```

| | |
|---|---|
| **What the operator sees meanwhile** | ⚠️ **The order reads PAID — and that is TRUE.** Stripe is holding the refund because the connected account's balance is short; the customer has not been given anything back yet. Saying "refunded" would be the lie |
| **Where it is visible** | `select * from action_audit_log where action = 'refund_pending' order by created_at desc;` and a `console.warn` naming the refund |
| 🔴 **What resolves it** | **`refund.updated`** — handled, and the reason the type is in the branch at all. Stripe's flip to succeeded emits it and **NOT** another `charge.refunded` |

---

## 4. 🔴 PARTIAL REFUNDS NO LONGER READ AS MONEY OWED

**The honest fix was a new status value, so it is deploy-coupled and the migration is written.**

`getOrderBalance` gains **one branch** — no arithmetic touched:

```ts
  else if (balanceMinor === 0) status = 'paid'
  // ── 🔴 A PARTIAL REFUND IS NOT AN OUTSTANDING BALANCE, AND SAYING SO WAS DANGEROUS. ──────────────
  // 6.50 charged, 2.00 refunded gives paidMinor 450, balanceMinor 200 — arithmetically identical to an
  // order that has only ever paid 4.50 of 6.50. Until this branch existed both fell to 'part_paid',
  // so the card printed the amber "4.50 / 2.00 due" chip and the ticket printed "TO PAY 2.00" —
  // an instruction to collect 200p from a customer who had just been REFUNDED 200p.
  else if (hasRefundRow) status = 'part_refunded'
  else status = 'part_paid'
```

`paidMinor`, `refundMinor` and `balanceMinor` are computed **exactly as before**. The branch only decides which name that arithmetic is given — and it uses the same test the `'refunded'` branch already uses: **refund-row presence, never the sum**.

🔴 **THE MIGRATION IS REQUIRED AND ITS ABSENCE IS DEMONSTRATED BELOW.** `orders.payment_status` carries a CHECK and `recalcOrderPayment` writes this value into it.

---

## 5. What every surface shows

| Surface | Fully refunded (`refunded`) | 🔴 Partly refunded (`part_refunded`) |
|---|---|---|
| **Order card — chip** | `REFUNDED`, slate | `£2.00 REFUNDED`, slate — **the amount given back, so nobody has to open Stripe to find it** |
| **Order card — button** | `Collected` | `Collected` — **not "Mark paid"** |
| **KDS footer** | `✓ paid` | `✓ paid` |
| **Printed ticket** | `PAYMENT REFUNDED` | `PAYMENT PART REFUNDED` — **not `TO PAY £2.00`** |
| **Completed list** | unchanged summary row | unchanged summary row; ⚠️ the red `PAYMENT NOT RECORDED` banner cannot fire — it requires `writeFailed`, which a refund never sets |
| **`confirmedPaid`** (dashboard counters) | true | true |

⚠️ **Colour: slate, not green and not amber.** Green says money received, amber says money outstanding; a refund is neither, and giving it either would be the whole defect again in a different form.

⚠️ **The ticket renderer needed no change.** Its `else` arm already prints `order.paymentStatus.replace('_',' ').toUpperCase()`, so `part_refunded` degrades correctly to `PART REFUNDED`; only the TypeScript union needed widening. **What mattered was keeping it out of the `part_paid` arm, which prints `TO PAY`.**

---

## 6. The 2xx contract

**Kept, and the refund branch follows the `payment_intent.succeeded` precedent rather than promotion's.**

| | |
|---|---|
| **The ledger write** | **inline, and a failure returns 500** — exactly what the payment branch does: *"a lost event here is a paid order showing unpaid on the hatch."* The mirror holds: a lost refund event is a **refunded order showing paid** |
| 🔴 **Why NOT under `after()`** | **`after()` would forfeit the retry, and the retry is the entire recovery mechanism for a refund.** Promotion can be redriven by the redirect and the sweep; a lost refund event has no second trigger. Written at the branch |
| **The one Stripe call** | `refunds.list`, on the `charge.refunded` safety net only. One GET, wrapped so it cannot throw, failing to a 500 — *"we failed to PERSIST it. RETRY IS EXACTLY WHAT WE WANT"* |
| **Speed** | the `refund.*` branches make **no** network call; the safety net makes one, on a branch that fires only for a refund |

---

## 7. A refund of an in-person payment

# ❌ IT CANNOT ARRIVE THIS WAY, AND IT CANNOT CORRELATE.

**Two independent reasons, both verified:**

1. **A cash payment has no Stripe object at all.** No charge, no intent, no refund — so Stripe can emit no event that names it.
2. **The correlation is a lookup on `stripe_pi:<intent id>`.** A cash row's key is `collect:<order_key>:<paid_before>:<balance>`. **Those strings can never be equal**, so even a crafted event could not reach a cash order.

**Measured:**
```
cash order created: ledger [{"kind":"charge","channel":"in_person_other","amount_minor":650,
                             "idempotency_key":"collect:686c708c-…:0:650","external_ref":null}]
  🔴 any 'stripe_pi:' row to correlate against? false
  the branch's lookup for an unknown intent returns: null  -> skipped, no row written
  cash order balance unchanged: {"paidMinor":650,"balanceMinor":0,"status":"paid"}
```

**If an unrelated event does arrive** — a payment the truck took on its own terminal, a Stripe invoice, a Payment Link — the lookup returns nothing, the refund is counted as `skipped`, and the endpoint answers **200**. That is ordinary, not an error.

⚠️ **So a cash refund still has no path into the ledger.** Handing back notes at the hatch is invisible to this handler by construction. That belongs with the refund UI.

---

# VERIFICATION

**Method:** real `stripe.refunds.create` calls against real captured direct charges on `acct_1U30w22fB4PPCw2D`; **Stripe's own event payloads** fetched back with `events.list` and replayed, HMAC-signed, into the real `POST` export inside a real Next `after()` scope. Brevo intercepted.

## 🔴 WRITES DECLARED

| Write | Cleanup |
|---|---|
| 5 `order_drafts`, 5 `orders` (#50-#57 range), ledger rows | ✅ all deleted — `residual drafts/orders/payments/events: 0/0/0/0` |
| 5 webhook receipt rows | ✅ deleted |
| 🔴 **4 real sandbox REFUNDS at Stripe** (650, 200, 100, and one from a discarded run) | ⚠️ **NOT reversible.** A refund cannot be un-refunded. Sandbox money on the connected account |
| Sandbox PaymentIntents | ⚠️ captured/refunded; not reversible |
| Display numbers #50-#57 | ⚠️ not reversible |
| `action_audit_log` `refund_pending` rows | ⚠️ **NOT deleted** — append-only |
| **Emails** | ✅ **0 sent** |

## (a) A full refund issued at Stripe

```
order #50 captured. ledger: [{"kind":"charge",…,"idempotency_key":"stripe_pi:pi_3U3ksB2fB4PPCw2D0fkSRrbp"}]
🔴 stripe.refunds.create -> re_3U3ksB2fB4PPCw2D0cXSkUFk amount=650 status=succeeded
[webhook/stripe] refund RECORDED order=e7950c8a-… refund=re_3U3ksB…0cXSkUFk amount_minor=650 -> status=refunded paid_minor=0
  delivered: charge.refunded evt_3U3ksB…058gAIpf -> 200  handler_result=refund:written=1,pending=0,skipped=0
  ledger: [ charge 650 stripe_pi:… , refund 650 stripe_re:re_3U3ksB…0cXSkUFk ]
  order : {"id":"50","payment_status":"refunded","amount_paid":0,"total":6.5}
  🔴 getOrderBalance -> {"paidMinor":0,"balanceMinor":650,"status":"refunded"}
```

✅ **One ledger row.** ✅ **`payment_status` persisted as `refunded`.** ✅ **And this is the safety-net path** — a `charge.refunded` whose payload contained no refunds, resolved by `refunds.list`.

## (b) A partial refund

```
🔴 stripe.refunds.create amount=200 -> re_3U3ksm2fB4PPCw2D0QCGHvtC status=succeeded
  ledger: [ charge 650 stripe_pi:… , refund 200 stripe_re:re_3U3ksm…0QCGHvtC ]
  🔴 getOrderBalance -> {"paidMinor":450,"balanceMinor":200,"status":"part_refunded"}
  ORDER CARD : isPaid=true isPartPaid=false  chip="£2.00 REFUNDED"  completion button="Collected"
  KDS        : settled=true -> "✓ paid"
  TICKET     : paymentStatus="part_refunded" -> prints "PAYMENT PART REFUNDED", NOT "TO PAY"
```

🔴 **PROVED IT DOES NOT READ AS MONEY OWED:** `isPartPaid=false`, the button says **Collected**, the KDS says **✓ paid**, the ticket says **PART REFUNDED**. Before this change all three said £2.00 was due.

### ⚠️ AND THE DEPLOY COUPLING PROVED ITSELF, LIVE

```
[webhook/stripe] 🔴 REFUND LEDGER WRITE FAILED … returning 500 so Stripe retries:
  [ledger] write-back failed for e213e322-…: new row for relation "orders" violates check constraint
  "orders_payment_status_check" — payment_status CHECK rejected the value; has
  20260729_orders_payment_status_widen_check.sql been applied?
  order.payment_status persisted: "paid"
```

**That is the migration not being applied, exactly as its own header predicts.** The refund row **is** committed and `getOrderBalance` computes `part_refunded` correctly; only the cached column could not be written, so the handler 500s and Stripe retries. **Apply `20260817_…` and the retry settles it.** ⚠️ The stale error message names the *2026-07-29* migration because that string predates this one — cosmetic, and I have not touched it.

## (c) Redelivery

Shown in §2. **`ledger rows 2 -> 2`, `written=0`.**

## (d) A pending refund

⚠️ **Stripe would not produce one on demand** — the connected account's balance is healthy, so every sandbox refund returned `succeeded`. So the **code path** was exercised by replaying Stripe's own `refund.updated` with one field changed, `status: 'pending'`:

```
[webhook/stripe] refund=re_… is pending, NOT succeeded — no ledger row yet. The order still reads paid,
  which is true: the money has not gone back. Waiting for refund.updated.
  delivered -> 200  handler_result=refund:written=0,pending=1,skipped=0
  ledger: [ charge 650 ]                      <- 🔴 NO REFUND ROW
  🔴 audit: [{"action":"refund_pending","amount_minor":100,…"recorded":false,"stripe_status":"pending"}]
  balance: {"paidMinor":650,"balanceMinor":0,"status":"paid"}
```

then the genuine settlement event:

```
  then the real refund.updated (succeeded)
  ledger after settlement: [ charge 650 , refund 100 stripe_re:re_3U3ksr…1t6Cq8Dt ]
```

✅ **Pending wrote no row and left the order reading paid.** ✅ **The settlement wrote exactly one.**
⚠️ **NOT ESTABLISHED:** that Stripe's real pending flow behaves this way end to end. The payload shape is Stripe's own; the `pending` value was substituted.

## (e) An order paid in cash

Shown in §7. **`any 'stripe_pi:' row to correlate against? false`.**

## Tooling
```
$ npx tsc --noEmit -> clean        $ npx eslint <changed files> -> 6 problems before, 6 after (all pre-existing in OrderCard.tsx)
```

---

# 🔴 NON-ASCII CENSUS

**Three violations were introduced and caught by the census, then corrected.** `lib/payments/online.ts` gained `£`; `lib/payments/ledger.ts` gained `⇒`; `app/api/webhooks/stripe/route.ts` gained `£` and `✅`. All were in new comments and all were rewritten in the existing vocabulary. **Final state:**

| File | Before | After | Distinct set |
|---|---|---|---|
| `lib/payments/online.ts` | 121 / **7** | 204 / **7** | `§ — ─ ⚠ ✅ 🔴 ️` **identical** |
| `lib/payments/ledger.ts` | 1107 / **12** | 1135 / **12** | `£ § × Σ — • → − ─ ⚠ 🔴 ️` **identical** |
| `app/api/webhooks/stripe/route.ts` | 890 / **8** | 1108 / **8** | `§ — … → ─ ⚠ 🔴 ️` **identical** |
| `components/dashboard/OrderCard.tsx` | 1269 / **31** | 1272 / **31** | **identical** |
| `app/dashboard/[token]/kds/page.tsx` | 854 / **32** | 857 / **32** | **identical** |
| `app/dashboard/[token]/page.tsx` | 2459 / **53** | 2459 / **53** | **identical** |
| `lib/printing/ticket.ts` | 494 / **14** | 496 / **14** | **identical** |

✅ **NO FILE GAINED A CHARACTER CLASS.** New migration: 217 / 7 — `£ — ─ ⚠ ✅ 🔴 ️`.

---

# 🔴 WHAT YOU HAVE TO DO

### 1. Run the migration — **before deploying**

```sql
-- supabase/migrations/20260817_orders_payment_status_part_refunded.sql
```
✅ **Widening only.** Every value the old CHECK admitted, the new one admits, so no row can become invalid and it is safe to apply ahead of the deploy. **The reverse order is the one that breaks** — and §(b) shows exactly how.

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
 where conrelid = 'orders'::regclass and contype = 'c'
   and pg_get_constraintdef(oid) ilike '%payment_status%';   -- expect 1, listing part_refunded
```

### 2. 🔴 Subscribe the webhook endpoint to three event types, connected-account scope

```
charge.refunded      refund.created      refund.updated
```
**Without `refund.created` / `refund.updated` a pending refund is never recorded**, and `charge.refunded` alone pays for a `refunds.list` call it would not otherwise need.

---

# Standing

- ⚠️ **A cash refund still has no path into the ledger.** Handing back notes is invisible to this handler by construction. It belongs with the refund UI.
- ⚠️ **No refund UI was built, and no refund copy was changed** — both were out of scope by instruction. The six sentences catalogued in `docs/refund-ui-report.md` still promise an automatic refund nothing issues.
- ⚠️ **`recalcOrderPayment`'s 23514 hint names the 2026-07-29 migration** and should eventually name whichever is latest. Not touched.
- ⚠️ **`refunds.list` is capped at 100** on the safety-net branch. A hundred partial refunds on one order is not a state this product produces, but the number is stated rather than assumed.
