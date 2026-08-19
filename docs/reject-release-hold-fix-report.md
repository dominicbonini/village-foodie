# Reject: release the hold — the fix, and one refusal

**A, B, C, D and E are DONE and verified by execution.** The stale capture-site comment is corrected.

🔴 **F IS NOT DONE, AND I AM NOT DOING IT WITHOUT YOUR ANSWER.** Adding `'rejected'` to
`find_stranded_authorisations` would not release those holds. **It would CAPTURE them.** That function
feeds a capture job, and the widening you briefed would charge customers for orders the truck refused.
**I have written no such SQL.** The full evidence, and the one question, are in §F.

| | Change | State |
|---|---|---|
| A | `trigger` admits `'operator_reject'` | ✅ done |
| B | audit `meaning`, `resolves`, failure log made action-aware | ✅ done — cancel byte-identical, **proven by execution** |
| C | `releaseHoldForCancelledOrder` → `releaseHoldForTerminalOrder` | ✅ done — 5 references, nothing beyond |
| D | reject calls it, in cancel's order | ✅ done |
| E | one true payment sentence in the rejection email | ✅ done |
| F | sweep allow-list SQL | 🔴 **REFUSED — see §F** |
| — | `CAPTURE SITE 3 of 4` | ✅ corrected |

---

# F · 🔴 THE SWEEP CAPTURES. IT DOES NOT RELEASE.

**The brief's own words:** *"a rejected order is terminal, was never captured, and definitively owes
nothing, so a hold surviving on it is always wrong."* **Every clause of that is true.** The conclusion
drawn from it — add `'rejected'` to this function's allow-list — is the one step that does not follow,
because of what reads the function.

**READ — `find_stranded_authorisations`'s own `comment on function`, installed body:**

```
'Called by app/api/cron/capture-stranded-authorizations, which CAPTURES what this returns and never
 cancels it'
```

**READ — the cron's header, `app/api/cron/capture-stranded-authorizations/route.ts:2`:**

```ts
// ── 🔴 THE SWEEP THAT TAKES MONEY THE TRUCK IS OWED. THE MIRROR OF cancel-stale-authorizations. ────
// That job releases holds behind orders that will NEVER exist. This one takes holds behind orders that
// ALREADY exist and have been accepted.
```

🔴 **THE ALLOW-LIST IS NOT A LIST OF ORDERS WHOSE HOLDS NEED RESOLVING. IT IS A LIST OF ORDERS WHOSE
HOLDS MAY BE TAKEN.** Every member — `confirmed`, `modified`, `cooking`, `ready`, `collected` — is an
order the truck accepted and is owed money for. `'rejected'` is the opposite kind of thing: an order the
truck refused, owed nothing for.

### Would anything downstream stop the capture? — **NO. I traced it.**

The sweep calls `captureOnConfirmation`, which refuses when nothing is owed. **So the question is whether
a rejected order reads as owing nothing. It does not. READ:**

```ts
// lib/payments/ledger.ts — getOrderBalance
const paidMinor = chargeMinor - refundMinor
const totalMinor = orderTotalMinor(order)
const balanceMinor = totalMinor - paidMinor
```

⚠️ **`getOrderBalance` never looks at `orders.status`.** A rejected £6.50 order with no payments computes
`paidMinor = 0`, `balanceMinor = 650`, `status = 'unpaid'` — an order that OWES. So:

| Guard | Rejected order | Blocks the capture? |
|---|---|---|
| `o.status in (…)` | would now pass, by the proposed widening | ❌ |
| `coalesce(o.payment_status,'unpaid') not in ('paid','refund_due')` | `'unpaid'` → passes | ❌ |
| `not exists (… 'stripe_pi:' \|\| d.payment_intent_id)` | never captured → passes | ❌ |
| `d.authorization_cancelled_at is null` | **only if the new release call failed** | partly |
| `captureOnConfirmation` → `balance.balanceMinor <= 0` | `650 > 0` → **captures** | ❌ |

🔴 **Nothing stops it.** The row reaches `stripe.paymentIntents.capture`. **The customer is charged for
an order the truck rejected** — and because these are Connect direct charges, *"the platform cannot refund
them. Only the truck can"* (`20260816` header, READ).

⚠️ **The window is exactly the one F was meant to cover.** The sweep can only see the order if
`authorization_cancelled_at is null` — i.e. **only when the new release call in §D failed.** So the
proposed backstop fires precisely on the orders that most need releasing, and captures them instead. **The
failure mode is inverted, not merely absent.**

### The instruction it contradicts

The brief holds both of these, and they cannot both be executed:

- *"STRIPE ON REJECT: release the hold. This is a MONEY PATH."* — and the module's own guarantee, **🔴 THIS
  FILE ONLY EVER RELEASES. IT CANNOT TAKE MONEY.**
- *"F. Sweep allow-list … adding `'rejected'` is a deliberate WIDENING"* — which, on this function, is an
  instruction to take money.

**Per your standing rule I stopped rather than chose.** I have not written the widening SQL, and I have
not silently substituted my own design for it.

### 🔴 THE QUESTION

**Which backstop do you want, given that the capture sweep cannot be the one?**

1. **A release-side sweep.** The correct mirror. `cancel-stale-authorizations` already releases, but owns
   `promoted_at IS NULL` — and a rejected order's draft is promoted, so it cannot see it. This needs a
   NEW function (a `find_stranded_holds_on_dead_orders`, over `status in ('rejected','cancelled')` with
   `authorization_cancelled_at is null`) and a route that calls **release**, never capture. ⚠️ **That is
   a new sweep, not a one-line widening — a bigger change than F described, so I am not writing it
   uninvited.**
2. **No backstop.** The §D call is the fix; a failure leaves a `hold_release_failed` audit row and a hold
   that expires in about a week. **This is the status quo for cancel**, which has run without a
   release-side sweep since it was built.
3. **Something else you have in mind that I have misread.**

**What I have provided instead is READ-ONLY** — it takes nothing, changes nothing, and answers "is this
actually happening": see §F-SQL at the end.

---

# A, B, C · The release module

**`lib/payments/release-hold.ts` — executable lines 87 → 92, 7 removed / 12 added** (comment-stripped
comparison against a pre-change copy taken before the first edit). **The entire diff:**

```
-export async function releaseHoldForCancelledOrder(
+export async function releaseHoldForTerminalOrder(
-trigger: 'operator_cancel' | 'customer_cancel'
+trigger: 'operator_cancel' | 'customer_cancel' | 'operator_reject'
+const isReject = args.trigger === 'operator_reject'
+const actionWord = isReject ? 'rejected' : 'cancelled'
+const resolvesHint = isReject
+? 'cancel_this_intent_by_hand_or_let_it_expire_a_rejected_order_owes_nothing'
+: 'cancel_this_intent_by_hand_or_let_it_expire'
-`… for cancelled order_key=` +   →  +`… for ${actionWord} order_key=` +
-`… The order IS cancelled and …` →  +`… The order IS ${actionWord} and …`
-meaning: 'the order was cancelled and its card authorisation was NOT released; …',
+meaning: `the order was ${actionWord} and its card authorisation was NOT released; …`,
-resolves: 'cancel_this_intent_by_hand_or_let_it_expire',
+resolves: resolvesHint,
-afterState: { released: true, meaning: 'the order was cancelled and …' },
+afterState: { released: true, meaning: `the order was ${actionWord} and …` },
```

**Nothing else in the module changed.** The draft read, the three no-op guards, the ledger check, the
read-failure refusal and the `releaseHold` call are untouched — the diff above is the complete list.

### B · One word, derived once

```ts
    const isReject = args.trigger === 'operator_reject'
    const actionWord = isReject ? 'rejected' : 'cancelled'
    const resolvesHint = isReject
      ? 'cancel_this_intent_by_hand_or_let_it_expire_a_rejected_order_owes_nothing'
      : 'cancel_this_intent_by_hand_or_let_it_expire'
```

⚠️ **On `resolves`, and I am stating the reasoning rather than hiding it.** The remedy is genuinely the
same remedy for both actions — cancel the intent by hand, or wait out the week. So rather than invent a
difference that does not exist, the reject hint **EXTENDS** the cancel one with the fact that settles the
case without further reading: **a rejected order was never served and can never owe anything, so a hold
found on one is always wrong and can be released without asking anybody.** A cancelled order does not
carry that guarantee — it may have been captured — which is why the shorter hint stays as it was.

### C · The rename

`releaseHoldForCancelledOrder` → **`releaseHoldForTerminalOrder`**. *Terminal* is defined in the file
header: **an order that has ended without being fulfilled — cancelled, or rejected.**

✅ **Exactly the 5 proven references, and nothing else.** Post-change grep:

```
app/api/dashboard/action/route.ts:36   import { releaseHoldForTerminalOrder } …
app/api/dashboard/action/route.ts:339    const rejectRelease = await releaseHoldForTerminalOrder(…)   ← new
app/api/dashboard/action/route.ts:422    const released      = await releaseHoldForTerminalOrder(…)
app/api/orders/cancel/route.ts:5       import { releaseHoldForTerminalOrder } …
app/api/orders/cancel/route.ts:132       await releaseHoldForTerminalOrder(…)
lib/payments/release-hold.ts:57        export async function releaseHoldForTerminalOrder(
```

`grep -rn "releaseHoldForCancelledOrder" app lib` now returns **nothing**. **The C stop did not trip.**
**`app/api/orders/cancel/route.ts` changed by exactly two lines, both the name** — 111 executable lines
before, 111 after.

---

# D · The reject branch

**Ordering, by line number, against the ordering cancel establishes — executed grep, not recall:**

| Step | Reject | Cancel |
|---|---|---|
| resolve payment state | **325** | 411 |
| mutate `status` | **327** | 412 |
| release the hold | **339** | 422 |
| unbook the slot | **359** | 431 |
| email | **380** | 404 |

✅ **Identical shape. The state is read BEFORE the mutation and before the release**, for the reason
cancel's own comment gives: releasing stamps `authorization_cancelled_at`, after which the resolver would
answer `'hatch'` — *"Pay at the truck on collection"* — about an order the truck has just refused.

```ts
      const rejectRelease = await releaseHoldForTerminalOrder(supabase, {
        orderKey, truckId: truck.id, trigger: 'operator_reject', actor, source: actorSource,
      })
      if (rejectRelease.status === 'released') {
        console.log(`[reject] hold released pi=${rejectRelease.paymentIntentId} order_key=${orderKey} (operator)`)
      } else if (rejectRelease.status === 'failed' || rejectRelease.status === 'captured') {
        console.error(
          `[reject] 🔴 THE HOLD WAS NOT RELEASED for order_key=${orderKey}: ${rejectRelease.status}. …`,
        )
      }
```

**The response carries the outcome:**

```ts
      return NextResponse.json({ success: true, status: 'rejected', hold_release: rejectRelease.status })
```

⚠️ **`hold_release` is ADDITIVE.** `success` and `status` mean exactly what they meant and the rejection
did happen; the new field is the money half of the answer, which had no field before because there was no
money half.

---

# E · One sentence, and it reports what happened

**`rejectionPaymentSentence` in `lib/email.ts`, beside `cancellationPaymentSentence`** — where this
codebase already keeps money wording, so the HTML and the plain-text twin cannot disagree. **19 executable
lines added, 0 removed. `cancellationPaymentSentence` is untouched**, which the diff shows and the
execution below re-confirms.

🔴 **IT REPORTS THE RELEASE THAT HAPPENED, NOT THE ONE THAT WAS ASKED FOR.** `holdReleased` comes from the
release call's return value, because that call can fail without throwing. Telling somebody their hold has
been released when it is still live is the one sentence here that cannot be walked back.

**The rejection email gains one line and is otherwise unrestructured** — `${rejectMoney.html}` sits
between the reason and *"Please order at the truck on arrival."*

⚠️ **It now also passes a text twin**, which `notifyCustomer`'s own parameter doc requires of any email
that states what happened to a customer's money: *"that sentence must exist in both renderings — the rule
lib/email already follows."* **That is a consequence of E, not a restructure**: same subject, same
paragraphs, same order.

---

# PHASE 4 · VERIFICATION, BY EXECUTION

**Method.** A jiti harness imports the **real, unmodified** `lib/payments/release-hold.ts` and the
pre-change copy of the same file side by side, with `promote-draft`, `actionAudit`, `order-drafts` and
`online` replaced by stubs **through jiti's alias map — the module under test is not rewritten.** The
supabase double returns exactly the two shapes the module reads. `console.error` is captured. Every
string below is the harness's actual output.

⚠️ **`tsc --noEmit` passes and I am NOT offering that as verification.** It is a breakage check only.
**Neither `next dev` nor `next build` was run.**

## 🔴 The byte-identity proof for both cancel callers

Both triggers, both the success and the failure path, full audit row + stderr captured, **PRE vs NOW
compared as bytes:**

```
  operator_cancel  success  identical=True  (484 bytes)
  operator_cancel  failure  identical=True  (815 bytes)
  customer_cancel  success  identical=True  (484 bytes)
  customer_cancel  failure  identical=True  (815 bytes)
ALL CANCEL OUTPUT IDENTICAL: True
```

✅ **Byte-identical, not "equivalent".** The comparison is over the serialised audit row *and* the
captured log line, so a changed word anywhere would fail it.

## The four scenarios asked for

### 1 · Reject an order with a live authorisation

```
outcome:            {"status":"released","paymentIntentId":"pi_1","amountMinor":650}
audit.action:       hold_released
audit.beforeState:  {"payment_intent_id":"pi_1","trigger":"operator_reject"}
audit.afterState:   {"released":true,"meaning":"the order was rejected and the card authorisation was released; no money moved"}
```

**The hold:** `releaseHold` was called once with the draft's intent. **The audit record says
`rejected`.** **The email** (state `held`, `holdReleased: true`) renders:

```
Your card was held for this order and never charged, and that hold has now been released.
```

**The cancel row for comparison, same run:** `"the order was cancelled and the card authorisation was
released; no money moved"` — **the only difference is the word.**

### 2 · Reject a pay-at-hatch order with no intent

```
outcome: {"status":"none","reason":"no_intent"}      (and {"status":"none","reason":"no_draft"} with no draft at all)
```

**No audit row, no Stripe client, one primary-key read and out.** The email, at state `'hatch'`:

```
You have not been charged for this order.
```

✅ **The email reads correctly.** ⚠️ **This is the majority case** and it is the one where a wrong sentence
would be seen most — it makes no claim about a hold, because there was none.

### 3 · Reject an order whose ledger read FAILS

```
outcome: {"status":"failed","paymentIntentId":"pi_1","detail":"ledger read failed: boom"}
stderr:  [release-hold] 🔴 could not check whether order_key=ok-1 was captured — REFUSING to release pi=pi_1: boom
```

**The module refuses to guess. Confirmed the reject branch handles that refusal and does not report
success:**

- ❌ **It does not log a release.** `status === 'failed'` takes the `else if`, which writes
  `[reject] 🔴 THE HOLD WAS NOT RELEASED … : failed`.
- ❌ **The email does not claim a release.** `holdReleased` is false, so a held order gets *"…that hold
  will clear on its own — please contact Thai Kitchen if it has not cleared within a week."* — **executed
  output, and it is true whether the hold is live or not.**
- ❌ **The response does not say the money was handled.** `hold_release: "failed"`.
- ✅ **The rejection itself still stands**, which is correct: the operator cannot cook it.

⚠️ **`status: 'captured'` takes the same `else if`** — money had moved, a refund is somebody's decision,
and the module refuses. The email then says *"If you paid by card for this order, please contact Thai
Kitchen about it."*, never *"you have not been charged"*.

### 4 · Operator cancel and customer cancel — unchanged

**Strings:** the byte-identity table above. **Behaviour:** the comment-stripped diff of
`app/api/orders/cancel/route.ts` is **two lines, both the function name**; of the cancel branch in
`app/api/dashboard/action/route.ts`, **one line, the same name**. No ordering, no guard and no argument
changed on either path.

## Changed executable line count (comment-stripped, all four files)

| File | Before | After | − | + |
|---|---|---|---|---|
| `lib/payments/release-hold.ts` | 87 | 92 | 7 | 12 |
| `app/api/dashboard/action/route.ts` | 1495 | 1518 | 6 | 29 |
| `lib/email.ts` | 575 | 594 | 0 | 19 |
| `app/api/orders/cancel/route.ts` | 111 | 111 | 2 | 2 |
| **Total** | | | **15** | **62** |

## 🔴 What is NOT verified, stated plainly

**Nothing was exercised against Stripe, and Stripe has never been live on any truck.** No hold has been
placed or released by this code. **`releaseHold` itself was stubbed** — what is proven is that the reject
path calls it with the right arguments and reports its answer honestly, **not** that Stripe cancels the
intent.

**Marking:**

| Claim | Status |
|---|---|
| The audit rows, log lines and outcomes above | ✅ **EXECUTED** — harness output |
| Cancel's strings byte-identical | ✅ **EXECUTED** — byte comparison, PRE vs NOW |
| The email sentences for all 8 states | ✅ **EXECUTED** — real `lib/email.ts` |
| Statement ordering in the reject branch | ✅ **READ-FROM-SOURCE** — line numbers by grep. The route was not run |
| The sweep would capture a rejected order | ⚠️ **READ-FROM-SOURCE and UNOBSERVED** — traced through `getOrderBalance` and `captureOnConfirmation`. **No sweep was run and nothing was captured** |
| Stripe actually releases the hold | ⚠️ **UNOBSERVED. Cannot be established here** |

**Surfaces:** §D and §E are the **operator** dashboard route. The cancel comparison covers **both** the
operator route and the **customer** cancel route, and each was read separately — no fact from one is
claimed of the other. §E's helper lives in shared `lib/email.ts` and is called only from the operator
reject path.

---

# The stale capture-site comment

**Corrected in place. It read `CAPTURE SITE 3 of 4` and there are five sites.**

⚠️ **I removed the number rather than renumbering it.** A count maintained by hand in four comments goes
stale again; the comment now names the authoritative command instead —
`grep -rn "captureOnConfirmation(" app lib` — which the codebase already treats as the whole list.

⚠️ **The two sibling comments still say "of 4"** — `app/api/orders/submit/route.ts:1083` (`1 of 4`) and the
confirm branch (`2 of 4`). **They were outside this change's stated scope and are deliberately untouched.
The corrected comment says so**, so the inconsistency reads as a decision rather than an oversight.
**Neither is a stale code path — only a stale number.**

---

# §F-SQL · READ-ONLY, AND IT IS NOT THE WIDENING

🔴 **This is NOT `create or replace` of anything. It takes nothing, changes nothing and writes nothing.**
It answers "are there rejected orders sitting on live authorisations right now" — the question F was
reaching for — so you can size the problem before deciding which backstop you want.

**Run it by hand. It is safe to run on production, and it is safe to run repeatedly.**

```sql
-- READ-ONLY. Rejected orders whose card authorisation was never released and never captured.
-- 🔴 THIS DOES NOT CHANGE find_stranded_authorisations AND MUST NOT BE PASTED INTO IT. That function
-- feeds app/api/cron/capture-stranded-authorizations, which CAPTURES what it returns. Naming a rejected
-- order there would charge a customer for an order the truck refused.
select
  o.id                        as order_number,
  o.status,
  o.payment_status,
  d.payment_intent_id,
  d.total_minor,
  d.promoted_at,
  round(extract(epoch from (now() - d.promoted_at)) / 86400.0, 1) as days_held
from order_drafts d
join orders o on o.order_key = d.order_key
where o.status = 'rejected'
  and d.payment_intent_id is not null
  and d.authorization_cancelled_at is null          -- the hold was never released
  and not exists (                                  -- and never captured, keyed as online.ts writes it
    select 1 from order_payments p
    where p.idempotency_key = 'stripe_pi:' || d.payment_intent_id
  )
order by d.promoted_at asc;
```

**How to read the result:**

- **No rows** — nothing is stranded today. Expected, since Stripe has never been live.
- **Rows with `days_held` under ~7** — live holds on rejected orders. Cancel each intent in the Stripe
  dashboard. **Do not capture them.**
- **Rows with `days_held` over ~7** — the authorisation has already expired by itself; the row is history.

**ADDITIVE or DEPLOY-COUPLED?** ✅ **NEITHER — it is a plain `select`.** It is not a migration, needs no
deploy, and has no ordering relationship with anything. **The A–E code changes are likewise ADDITIVE and
require no migration:** no column, type, constraint or function is touched, and the widened `trigger`
union is TypeScript only — `action_audit_log` stores it as data.

⚠️ **`'pending' MUST REMAIN ABSENT` was a live instruction and it is honoured trivially: I did not touch
the allow-list at all**, so `'pending'` is absent exactly as it was, along with every other clause and
comment of the installed body.

---

# What I did not touch, as instructed

**Unchanged: capture logic, every capture site, the webhook handler, `purge_order_drafts`, the auto-accept
condition, the Reject button's gating, the customer order-status page.** ⚠️ **One clarification, since it
is the only thing near that list I did edit:** a *comment* at the quick-time-adjust capture site changed.
**No capture code did.**

⚠️ **Still outstanding and still not fixed, reported previously:** the customer order-status page has no
`rejected` branch and shows *"This order can no longer be cancelled."* — it now describes an order whose
hold this build releases, and it still says nothing about payment. **Explicitly out of scope here.**

**No span of the brief arrived garbled.** **One instruction conflict, in §F, and I stopped on it rather
than choosing.**

---

# Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** every write —
never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. **Files: the four source files
and this report.** Result, the non-ASCII census of characters introduced, and the carrier-aware
variation-selector figures per emoji-presentation base are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
