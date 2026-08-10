# The payment action model — two shapes compared

**Date:** 10 August 2026
**Mode:** design only. Nothing built, no migration file written.
**Supersedes:** my proposal of earlier today (SHAPE A) in this file. That design is carried forward here as one of the two candidates and is compared honestly against a smaller one.

**Recommendation up front: SHAPE B.** My own larger design is not worth its blast radius. The reasoning is below, and it is a robustness argument, not a tidiness one — Shape A ends with the *same number of operator-facing settings* as Shape B, so it buys no simplification to pay for 14 changed files, a named-column change on the path the outbox replays through, and a DROP whose wrong-direction failure is the exact silent-empty-board incident already recorded in this route.

---

## 0. The facts both shapes are measured against

Re-verified today against the live database (service-role read, no writes) and the current tree.

```
TRUCKS (12)                        show_paid_step   takes_cash
  pizzeria-gusto                        true          false
  test-kitchen        (id test-truck)   true          false
  village-spice                         true          false
  real-thai-food                        false         false
  test-truck-2 / -3 / -3-2 / tt3        false         false
  4 × demo-…  (random slug + id)        false         false

EVENT OVERRIDE ROWS (3, all test-truck)
  2026-07-31   show_paid_step_override = true    takes_cash_override = true
  2026-07-30   show_paid_step_override = false   takes_cash_override = false
  2026-08-07   show_paid_step_override = null    takes_cash_override = false
```

**3 of 12 are `show_paid_step = true`, Gusto among them.** All open orders in the database arrived through the customer path — `source: 'web'`, `payment_status: 'unpaid'` — including five on `pizzeria-gusto` (#1, #2, #3, #4, #6). No truck can truthfully claim it has no unpaid orders; that matters in §4.

Three facts from the tree that decide the comparison:

1. **`trucks` is read with `select('*')`** — [dashboard/route.ts:76](../app/api/dashboard/route.ts#L76), [action/route.ts:67](../app/api/dashboard/action/route.ts#L67). A missing truck column therefore does **not** error. It arrives `undefined` and the resolver's `??` turns it into a default. Silent.
2. **`truck_events` is read with a NAMED select** naming `show_paid_step_override` — [dashboard/route.ts:135](../app/api/dashboard/route.ts#L135) and again in `paidStepFor` at [action/route.ts:41](../app/api/dashboard/action/route.ts#L41). The comment directly above the first one says it plainly: *"every column here must exist or PostgREST returns 42703 and the WHOLE statement fails, which lands on the silent-empty-board path documented directly below."* That path is the recorded incident at [dashboard/route.ts:142-163](../app/api/dashboard/route.ts#L142-L163) — **HTTP 200 with `orders: []`**, no error, no failed request, nothing in any log.
3. **`recordCollectionPayment` short-circuits on a zero balance** ([ledger.ts:421-425](../lib/payments/ledger.ts#L421-L425)), so a one-press `Paid & collected` on an already-paid order is a safe no-op. Both shapes depend on this.

---

## 1. Every reader of `show_paid_step`, and what each shape does to it

This is the master table. "Branch" = a site that decides what the operator sees or what the server does; the rest are declarations, types, transport and copy.

| # | File | Sites | What it decides | SHAPE A | SHAPE B |
|---|---|---|---|---|---|
| 1 | [lib/payments/paid-step.ts](../lib/payments/paid-step.ts) | 4 | the `??` chain, the only resolver | **rewritten** — renamed, new triple, `show_paid_step` gone | **+1 field** — `completionPresses` added to the same resolver |
| 2 | [components/dashboard/OrderCard.tsx](../components/dashboard/OrderCard.tsx) | 4 (**3 branches**) | :199 resolve · **:239 completionBtn** · **:308 chip + remove-payment** · **:399 disabled label** | all four change | **:239 / :399 re-point** to the new setting; :308 optionally *un-gated* (a deletion, §7) |
| 3 | [components/dashboard/AddOrderPanel.tsx](../components/dashboard/AddOrderPanel.tsx) | 4 (**2 branches**) | :748 resolve · :964-965 `paymentTaken` · **:1273 confirm bar shape** | **new 3-state render branch** | **untouched** |
| 4 | [app/dashboard/[token]/page.tsx](../app/dashboard/[token]/page.tsx) | 6 (**3 branches**) | :1265 override write · :2020 resolve · **:3149 event toggle** · **:3176 hint** · **:3180 cash toggle** | toggle → 3-segment control, new server action, new write path | **untouched** (copy reword only, §6) |
| 5 | [app/dashboard/[token]/kds/page.tsx](../app/dashboard/[token]/kds/page.tsx) | 3 (**2 branches**) | **:849 `hidePayments`** · **:1061 money toggle render** | both re-gated | **untouched** |
| 6 | [lib/printing/mapOrderToTicket.ts](../lib/printing/mapOrderToTicket.ts) | 4 (**1 branch**) | :68 resolve · **:75-76 payment fields** · :114 passthrough | rule split order-keyed / truck-keyed | **untouched** |
| 7 | [lib/printing/ticket.ts](../lib/printing/ticket.ts) | 2 (**1 branch**) | :102 type · **:358 the printed line** | changes with #6 | **untouched** |
| 8 | [app/dev/ticket-preview/page.tsx](../app/dev/ticket-preview/page.tsx) | 5 | fixtures + the debug table | fixtures dead, must be rewritten | **untouched** |
| 9 | [app/api/dashboard/action/route.ts](../app/api/dashboard/action/route.ts) | 5 (**2 branches**) | :41 **named select** · **:470 `splitPaidStep`** · **:1237 walk-up paid at order** · :1540 override handler | named select changes; both branches move; handler replaced | **:470 only** — the named select is **not touched** |
| 10 | [app/api/dashboard/route.ts](../app/api/dashboard/route.ts) | 2 | :135 **named select** · :602 truck map | both change | :602 only (`select('*')` truck, no named-select change) |
| 11 | [app/manage/[token]/page.tsx](../app/manage/[token]/page.tsx) | 5 | the Settings controls | one control → two, cash gate rewritten | **+1 control**, paid-step copy reworded |
| 12 | [app/api/manage/route.ts:854](../app/api/manage/route.ts#L854) | 1 | the `allowed` list — **silently drops** anything absent | +2 names, −1 | +1 name |
| 13 | [components/dashboard/types.ts](../components/dashboard/types.ts) | 4 | `TruckData` + `TruckEvent` | both change | `TruckData` +1 field |
| 14 | [lib/provision-truck.ts](../lib/provision-truck.ts) | 5 | profile type + 2 profiles + the insert | all change | +1 field, 2 values |
| — | `supabase/migrations/` | 5 files | history/comments naming it | 2 new files (add+backfill, then **DROP**) | 1 new file (add+backfill) |

### The counts

| | SHAPE A | SHAPE B |
|---|---|---|
| **Code files changed** | **14** | **8** (9 with the dashboard copy reword) |
| **Migration files** | **2** (the second is a DROP) | **1** (purely additive) |
| **Reference sites edited** | ~50 | ~12 |
| 🔴 **Behavioural branches moved** | **14** | **3** |
| Files left completely untouched | 0 of 14 | **6 of 14** — AddOrderPanel, dashboard page, KDS, both printing files, ticket-preview |
| New named-select columns on the **outbox replay path** | **1** (`take_payment_at_order_override` in `paidStepFor`) | **0** |
| Columns dropped | **2** | **0** |

Three branches versus fourteen. On the operator's own stated criterion — *"a change that moves more code is a change with more chance of a missed reader, so smaller is itself a robustness argument"* — that is the headline, and nothing below reverses it.

---

## 2. Deploy coupling, and which direction is dangerous

### SHAPE B — safe in both directions. This is its strongest property.

| Step | Order | If run in the wrong order |
|---|---|---|
| Add `trucks.completion_presses`, backfill per row, `SET NOT NULL` | before deploy | **nothing.** The deployed build never names the column. |
| Deploy the build reading it | after | **nothing, if the resolver's fallback is `?? (showPaidStep ? 'two' : 'one')`.** `trucks` is `select('*')`, so on a code-before-migration deploy the field is `undefined` and every truck resolves to **exactly today's behaviour**, derived from the flag that is still there. |

🟢 **No drop. No named-select change. No rollback cliff.** Roll the build back at any time and the old code reads `show_paid_step`, which still exists and still holds the truth. The one residue is that a `completion_presses` value an operator changed under the new build is ignored by the old one — visible, reversible, and not silent.

That fallback expression is worth one line permanently, not just for the deploy window. It is the same null-means-inherit contract the two override columns already use, and it means the new column can never be the reason a truck's behaviour changes.

### SHAPE A — dangerous in two directions, and both failures are silent

| Step | Required order | Wrong-order consequence |
|---|---|---|
| 1. Add `trucks.take_payment_at_order`, `trucks.completion_presses`, `truck_events.take_payment_at_order_override`; backfill | **before** deploy | additive and inert — safe |
| 2. Deploy | after step 1 | 🔴 **two simultaneous silent failures.** (a) The new build's named select on `truck_events.take_payment_at_order_override` — in both [dashboard/route.ts:135](../app/api/dashboard/route.ts#L135) **and** `paidStepFor` — returns 42703; the events query fails, `todayEvents` is null, the orders block never runs, and the route answers **200 with `orders: []`**. The recorded silent-empty board. (b) `trucks` is `select('*')`, so both new truck columns arrive `undefined` and `??` resolves every truck to `'never'` + `'one'`. Gusto silently loses its paid step, its chip and its printed payment line — **and `undo_collected` starts deleting payment rows**, because `splitPaidStep` is now false. |
| 3. DROP `trucks.show_paid_step` and `truck_events.show_paid_step_override` | **after** deploy | 🔴 **the same two failures, mirrored.** An old build (or a rollback) hits 42703 on `show_paid_step_override` → empty board; and `trucks.show_paid_step` is `undefined` → `?? false` → the three paid-step trucks silently become paid-step-off, undo starts deleting payments. |

🔴 **Step 3 closes the rollback window.** Once the drop lands, the previous build cannot run — its named select 42703s on every dashboard load. Before step 3, rollback is clean; after it, there is no way back except forward.

And the honest consequence of deferring step 3, which is what I recommended this morning: until someone comes back to it, the database carries **four columns describing two facts** — `show_paid_step`, `show_paid_step_override`, `take_payment_at_order`, `take_payment_at_order_override` — which is precisely the duplication Shape A existed to remove. The `default_walkup_payment` episode (built and dropped inside 24 hours) is the recorded cost of that state.

---

## 3. Which configurations in use today are reachable

### SHAPE B — all of them, and one useful new one

Backfill: `completion_presses = (show_paid_step is true) ? 'two' : 'one'`. Per row, no constant.

| Live configuration | Reached by | Result |
|---|---|---|
| `show_paid_step = false` — 9 trucks, and test-truck's 30 Jul event | `false` + `'one'` | identical: single `Confirm order · £X`, `Paid & collected`, no chip, no printed line, undo reverses both |
| `show_paid_step = true` — Gusto, test-kitchen, village-spice, and test-truck's 31 Jul event | `true` + `'two'` | identical: `Confirm order` + `Take payment £X`, `Mark paid` → `Collected`, chip, printed line, undo status-only |

**Nothing a real truck has today is lost, and Gusto lands byte-identical** — same panel, same two presses, same chip, same printed line, same undo semantics, same KDS money toggle, and their five open unpaid web orders reach `collected` by exactly the route they do now.

Shape B also newly expresses **`show_paid_step = true` + `'one'`**: take the money when you type the order in, hand over in one press. That is a real truck and it is not expressible today.

**What Shape B cannot express: `'always'`** — a truck that never places an unpaid order and wants the `Confirm order` button gone. No truck in the fleet needs it. §4 shows why it is the weakest cell in the matrix anyway.

### SHAPE A — all of them too, plus four cells nobody occupies

Reachability was demonstrated in the earlier version of this report and still holds: `'never'`+`'one'` for the nine, `'optional'`+`'two'` for the three, and the three event override rows map cleanly. Shape A is not *wrong*; it is simply larger for one extra button.

### The one combination Shape B must not ship carelessly

`show_paid_step = false` + `completion_presses = 'two'` is currently **incoherent**, and it is new — nothing can reach it today.

- Add Order: single `Confirm order` ✓
- Card: `Mark paid` → `Collected` — a money button now exists
- **Chip: hidden**, because it is still gated on `show_paid_step` at [OrderCard.tsx:308](../components/dashboard/OrderCard.tsx#L308)
- **Remove-payment modal: unreachable**, because the chip is its only entry point

So the operator can record a payment they cannot see and cannot undo from the UI. **The fix is a deletion, not a setting** — drop `!showPaidStep` from the chip's null-gate and keep the `hidePayments` half. See §7; it costs one condition, adds no reader, and is a no-op for all twelve trucks today.

Two residual imprecisions in Shape B, stated rather than buried: on that same combination the printed ticket carries no `TO PAY` line, and the KDS "does this device do money" toggle does not render (both still keyed on `show_paid_step`). Neither is broken — both are *absent*. Neither is worth a file.

---

## 4. Shape A's six-cell matrix: which cells are real

| # | `take_payment_at_order` × `completion_presses` | Behaviour | Who chooses it |
|---|---|---|---|
| 1 | `never` + `one` | Confirm only; `Paid & collected` | ✅ **9 trucks today** |
| 2 | `optional` + `two` | Confirm + Take payment; `Mark paid` → `Collected` | ✅ **3 trucks today** — Gusto, test-kitchen, village-spice |
| 3 | `optional` + `one` | both buttons; one-press completion | plausible, **nobody** — *and Shape B expresses this one* |
| 4 | `never` + `two` | Confirm only; two-press completion | plausible, **nobody** — Shape B reaches it too (with the §7 deletion) |
| 5 | `always` + `one` | Take payment only; the completion press is a zero-balance no-op | **nobody.** ⚠️ Semi-degenerate: the second press is pure handover, and its label `Paid & collected` announces a payment that happened minutes ago |
| 6 | `always` + `two` | Take payment only; then `Mark paid` — **inert on every walk-up** — then `Collected` | **nobody.** ⚠️ Near-nonsensical: a truck that declares it never places an unpaid order still gets a two-stage completion whose first stage is dead for its own orders, surviving only for online pre-orders |

**Two of six cells have occupants. Two more are plausible and Shape B reaches both. The two cells that are unique to Shape A — 5 and 6 — have no user, and cell 6 is a support conversation waiting to happen.** Multiply by the per-event override's three values and the reachable configuration space triples again.

That is the argument in its plainest form: **Shape A's entire capability delta over Shape B is the `'always'` state, whose only effect is to remove one button from one panel, and which no truck needs.** And it cannot remove unpaid *orders* from any truck — the customer path guarantees those, as Gusto's five open web orders demonstrate right now.

---

## 5. 🔴 The safety requirement — confirmed identical in both shapes

**One press = one server action, one request, one outbox op.**

In **both** shapes the one-press button is:

`OrderCard.completionBtn` → `onAction('collected', order.order_key)` → [page.tsx:1605](../app/dashboard/[token]/page.tsx#L1605) → `gatedAction({ kind: 'status', body: { action: 'collected' } })` → [action/route.ts:401-438](../app/api/dashboard/action/route.ts#L401-L438).

- ✅ **The existing `'collected'` action is reused unchanged in both.** Only the button's *label* varies with the setting. No new action name is introduced by either shape.
- ✅ **Neither shape introduces a new outbox op kind.** The kinds stay `'status'`, `'stock'`, `'buzzer'`. `'collected'` remains deliberately outside `PAYMENT_ACTIONS` ([orderGate.ts:81](../lib/native/orderGate.ts#L81)) because it moves status too and the status overlay already carries the card — one op, one overlay, one replay.
- ✅ **Neither shape dispatches two client ops for one press.** A conflicted op is marked `conflict` and **skipped, never retried** ([orderGate.ts:236-244](../lib/native/orderGate.ts#L236-L244)), and the outbox has no dependency ordering — so a client that sent `mark_paid` then `collected` could have the first skipped and the second replay, completing an order with no payment recorded. Nothing in either design does that.
- ✅ Shape A's `'always'` Take-payment button would reuse the existing single `manual` request, which creates the order and books the ledger row inside one handler ([action/route.ts:1227-1256](../app/api/dashboard/action/route.ts#L1227-L1256)) under the same `collect:{order_key}` idempotency key. Also one op.

**One shape-dependent difference, and it points the same way as everything else.** Shape A changes the named select inside `paidStepFor` — the resolver that runs on `collected`, `undo_collected` and the walk-up paid-at-order path, i.e. **the exact server code the outbox replays into**. That select already fails to a wrong value rather than a crash by design ([action/route.ts:45-61](../app/api/dashboard/action/route.ts#L45-L61)): on 42703 it logs and falls back to the truck defaults. During a mis-ordered Shape A deploy that fallback means `undo_collected` resolving to the wrong reversal semantics and **deleting payment rows**. Shape B adds nothing to that select — its new column rides on the `select('*')` truck object and never touches the 42703 surface.

Given that the outbox is the stated priority, that alone would decide it.

---

## 6. What an operator must understand at signup

**The setting count is the same in both shapes.** This is the fact that removes Shape A's remaining justification.

| | Today | SHAPE A | SHAPE B |
|---|---|---|---|
| Operator-facing payment settings | 2 | **3** | **3** |

Shape A does not retire a setting from the operator's world; it renames one, widens it from two states to three, and adds another. Shape B keeps the existing one, corrects its wording, and adds one. Same total, one of them narrower.

**SHAPE B — one line each:**

- **Separate paid step** *(existing column, reworded)* — "Can you take payment at the moment you type an order in?"
- **Completing an order** *(new)* — "Do you take the money at the same moment you hand the food over? Yes → one press. No → two."
- **Do you take cash?** *(existing, unchanged)* — "Splits the payment button into Cash and Card so your takings reconcile against the till."

**SHAPE A — one line each:**

- **When you add an order** — "Can you place it unpaid, take payment there and then, or both?" ⚠️ One line, but three answers, and the consequence is a button appearing or disappearing on a panel a new operator has not used yet. This is the setting that gets left at its default forever — and since its default *is* today's behaviour, leaving it there means it bought nothing.
- **Completing an order** — identical to Shape B's.
- **Do you take cash?** — unchanged, but its inertness rule gets more complicated (*inert unless take-payment ≠ never OR two presses*), where today it is one clause.

Both shapes should ask **one question at signup** — the completion one — and leave the rest in Settings. It is the only one whose wrong answer costs a press on every order of every service.

⚠️ **Shape B's honest cost: `show_paid_step`'s name becomes a partial lie.** After the split it means "take payment at order entry", not "split the completion". That is a real hazard — a misleading name is how a future reader gets it wrong. Three mitigations, all cheap: reword the Manage control and its helper text, reword the dashboard toggle and its two toast strings, and update the column `COMMENT` to say what it now means and what it no longer means. If the name still grates later, a pure `ALTER TABLE … RENAME COLUMN` is a one-line migration that can be taken at any time — deploy-coupled, but with no behaviour attached and no second column to reconcile. Notably, the rename would make the column agree with what its own migration header already says it was built for: *"an operator who set Saturday's festival to take payment at order must not lose that"* ([20260730_truck_events_show_paid_step_override.sql:22-23](../supabase/migrations/20260730_truck_events_show_paid_step_override.sql#L22-L23)).

That last point is worth stating clearly: **the existing per-event override, under Shape B, becomes *more* faithful to its documented purpose, not less.** It goes on taking payment at order for one event, which is exactly the case it was built for.

---

## 7. Two things worth taking from Shape A regardless of shape

**(a) Un-gate the PAID chip — a deletion, not an addition.**
Drop `!showPaidStep` from [OrderCard.tsx:308](../components/dashboard/OrderCard.tsx#L308); keep the `hidePayments` half and the existing `effectivePaid` / `effectivePartPaid` conditions that already return `null` for an unpaid order.

- It is a **no-op for all twelve trucks today.** On a `show_paid_step = false` truck no path can record money before collection — Add Order cannot take payment, there is no `Mark paid`, and a collected order has left the board — so the chip is empty by construction and the config gate removes nothing.
- It **removes a reader** rather than adding one, which is the same robustness argument that favours Shape B.
- It makes Shape B's `false` + `'two'` combination coherent (§3).
- It becomes load-bearing the day the Stripe order-payment writer lands. `recordCollectionPayment` explicitly reserves that seat ([ledger.ts:443-446](../lib/payments/ledger.ts#L443-L446)); the KDS has already been bitten once by payment-derived elements being invisible behind this gate ([kds/page.tsx:85-89](../app/dashboard/[token]/kds/page.tsx#L85-L89)). Under a truck-level gate a pre-paid order's payment is invisible to a one-press truck and the operator asks a paid customer for money.

**(b) Keep the new setting truck-level, with no per-event override.**
Same reasoning in both shapes. Flipping presses mid-event changes what `undo_collected` *means* for orders that already exist: an order paid by `Mark paid` at 18:00 under two presses, the event flipped to one press at 19:00, then a `Paid & collected` and an undo at 19:30 — and `reverseCollectionPayment` **deletes the charge row booked ninety minutes earlier**. An undo that erases a payment the operator did not just make is the class of silent loss the audit trail exists to prevent ([action/route.ts:452-459](../app/api/dashboard/action/route.ts#L452-L459)).

What is lost: **"one press tonight"** from the dashboard. A two-press truck slammed at a festival must change their default in Manage and change it back. That is a genuine loss and it is the symmetrical case to `takes_cash`'s card-terminal-failure override. It is the right loss at launch. If it is wanted later, the correct fix is not an override column but making `undo_collected` decide from the order's own audit trail — `action_audit_log` already distinguishes `'collected'` (with `charged_minor`) from `'mark_paid'`.

`takes_cash` and `takes_cash_override` are untouched by both shapes.

---

## 8. `paymentWarning` — live exposure, and it should be fixed first

**This is not introduced by either shape. It is live today on the nine `show_paid_step = false` trucks**, which are the trucks already using the combined path.

`'collected'` makes three sequential, non-transactional PostgREST writes ([action/route.ts:400-437](../app/api/dashboard/action/route.ts#L400-L437)): the ledger write **fails open** (caught, `paymentWarning` set, execution continues), the audit write swallows its own errors, and the status update **fails closed**. So *"collected but unpaid"* is reachable by design, and it is reachable today.

`paymentWarning` is returned on the 200 by three handlers — `collected` ([:438](../app/api/dashboard/action/route.ts#L438)), `mark_paid` ([:1702](../app/api/dashboard/action/route.ts#L1702)), `manual` ([:1256](../app/api/dashboard/action/route.ts#L1256)). **No client reads it.** `doAction` checks `result.ok` only ([page.tsx:1637](../app/dashboard/[token]/page.tsx#L1637)).

**What the operator sees today when the money half fails:** the normal green *"Order #N collected"* toast with its 7-second Undo, the card clears, the order reads collected. **No visual difference whatsoever from a fully successful collection.** The only trace is a `console.error` in the Vercel log and the reconciliation query at [ledger.ts:29-51](../lib/payments/ledger.ts#L29-L51).

### Where it should surface — reuse what exists, invent nothing

1. **The toast changes tone and does not auto-dismiss.** Not the green success toast: an error-toned toast reading *"Order #N collected — PAYMENT NOT RECORDED. Undo and press again."* The repair instruction is correct and safe: on a one-press truck `undo_collected` calls `reverseCollectionPayment`, which finds no charge row, returns `reversal: 'none'` with a 2xx — a no-op, not a failure — and reverts the status; pressing again books cleanly, because the idempotency key was never consumed.
2. **The card carries the marker that already exists.** `conflict === 'payment'` renders *"⚠ PAYMENT NOT RECORDED — check before releasing"* with a red 2px border ([OrderCard.tsx:642-645](../components/dashboard/OrderCard.tsx#L642-L645)) — the same fact, already worded correctly, already persisting until acknowledged. For `mark_paid` and the walk-up paid-at-order case the order stays on the board and this is seen immediately.
3. **For `'collected'` it must also reach the collected list.** A collected order leaves the active buckets, so the toast is the only surface at the moment of failure. The dashboard already renders collected orders with a **later-recovery Undo** ([page.tsx:2963-2972](../app/dashboard/[token]/page.tsx#L2963-L2972)) — that row is exactly where the marker belongs, and the Undo sitting beside it *is* the repair. The KDS's "Done today" strip is the equivalent surface there.

The wiring is small and shape-independent: `doAction` already holds the parsed body (`const data = result.data ?? {}`, [page.tsx:1637](../app/dashboard/[token]/page.tsx#L1637)) one line before it picks a toast. It is one branch there, one in the KDS's equivalent handler, and reuse of a marker component that already exists.

### Should it precede this work? **Yes.**

Not because either shape depends on it, but because:

- it is **live exposure on 9 of 12 trucks right now**, and neither shape makes it worse for a single existing truck — the backfill preserves everyone;
- it is **small and has no migration**, so it ships and settles on its own;
- both shapes exist to make *more* trucks use the one-press path, and with one press there is no second press whose chip failing to turn green gives the operator an incidental check. Recommending one press before the path can report its own failure is recommending a setting onto a path that lies;
- and the stated priority — robustness over saving a press — resolves the ordering question by itself.

**Sequence: (1) wire `paymentWarning`. (2) un-gate the chip. (3) ship the completion setting.** Steps 1 and 2 have no migration and no deploy coupling.

---

## 9. Recommendation

### 🔴 SHAPE B is sufficient. Ship it.

Add **`trucks.completion_presses`** — `text NOT NULL`, `'one'` / `'two'`, CHECK-constrained, backfilled per row from `show_paid_step`, default `'one'`, resolved by the existing single resolver with the fallback `?? (showPaidStep ? 'two' : 'one')`. Keep `show_paid_step`, its per-event override, both config surfaces and both server handlers exactly as they are. Reword the copy. Delete the chip's truck-level gate. Nothing else changes.

**Why, on the operator's own criterion:**

1. **3 behavioural branches move, not 14.** Six of the fourteen files that read the flag are never opened. A missed reader is the failure mode; Shape B has a sixth as many places to miss one.
2. **It is the only shape that is safe in both deploy directions.** `select('*')` plus a flag-derived fallback means a code-before-migration deploy is a no-op, and there is no drop, so there is no rollback cliff. Shape A is dangerous in *both* directions, and both of its failures are silent — one is the recorded 200-with-`orders: []` incident, the other is `??` quietly resolving Gusto to paid-step-off and turning `undo_collected` into a payment eraser.
3. **It does not touch the named select on the outbox replay path.** Shape A adds a column to `paidStepFor`, whose documented failure mode is *fail to a wrong value, not a crash*. Given that the outbox must work flawlessly, that is disqualifying on its own.
4. **It expresses everything any of the twelve trucks needs, and Gusto lands byte-identical.** The delta is the `'always'` state — one button on one panel, wanted by nobody, and unable to remove unpaid orders anyway because the customer path creates them.
5. **It costs the operator the same number of settings.** Shape A's simplification is nominal: three settings either way. Paying 14 files and a DROP for a rename is not a trade.
6. **Four of Shape A's six matrix cells have no occupant**, and one of them (`always` + `two`) is actively confusing.

**Where Shape A was right, and what to carry over:** the chip belongs to the order, not to the truck (§7a — a deletion, take it now); the new setting must be truck-level with no per-event override (§7b); the one-press button must reuse `'collected'` unchanged (§5 — true in both); and `paymentWarning` must be wired before one press is recommended to anyone (§8).

**What Shape B defers, deliberately and reversibly:** the `'always'` state, and the column's name. Both are reachable later — `'always'` by widening `show_paid_step` to a three-state text column at the point a real truck asks for it, the name by a pure `RENAME COLUMN`. Neither is cheaper to do now than later, and doing them now means doing them for nobody.

I proposed Shape A this morning. It is the better *model* and the worse *change*, and on the criterion that was given — the outbox is critical, robustness outranks elegance, smaller is itself a robustness argument — the worse change loses.

**Nothing built. No migration file written.**
