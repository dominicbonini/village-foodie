# Payment action settings — mechanics and migration path

**Date:** 10 August 2026
**Mode:** read-only. Nothing changed, nothing built.
**Design under audit:** (A) *Confirm available at order time* — truck-level on/off. (B) *Completion in one press or two* — truck-level.

---

## 🔴 Three corrections before the audit, all verified against the live database

### 1. Gusto is `show_paid_step = **true**`. The brief says false.

```
ALL TRUCKS — show_paid_step / takes_cash:
  false false  demo-15yy2ecnkemmchrr8np69p29n8      true  false  pizzeria-gusto
  false false  demo-ekwwmqeej70hd5da4d61wzetcw      true  false  test-truck
  false false  demo-krh2c8ksabdv28ccprswbfhkdk      true  false  village-spice
  false false  demo-m1y02c2mgqag1y4b79401af4hm      false false  real-thai-food
  false false  test-truck-2 / -3 / -3-2 / tt3

  show_paid_step TRUE on 3/12 trucks: pizzeria-gusto, test-truck, village-spice
```

No event override on any Gusto event. **This inverts the answer to questions (2) and (7)** — the defaults that preserve Gusto's behaviour are the *opposite* of what the brief implies. It also means Gusto's completion is **two presses today, not one**.

### 2. Gusto does **not** use the "Paid & collected" path

Question (4) asks me to confirm *"Gusto's existing path"* is reusable for (B)=ONE. **That path is not Gusto's.** `"Paid & collected"` renders only when `show_paid_step` is false — the **nine** other trucks. Gusto renders `Mark paid` → `Collected`. The path is real, reusable and safe (§4 below); it just belongs to someone else.

### 3. The dashboard control today writes a **different column** from Manage — deliberately

The brief says both surfaces must write the same truck column, *"NOT a device copy… do not repeat the two-homes problem."* **Today is not a two-homes problem.** [page.tsx:1240-1241](app/dashboard/[token]/page.tsx#L1240-L1241) is explicit:

> *"PER-EVENT ONLY. This writes `truck_events.show_paid_step_override` for the CURRENT event and must **NEVER** write `trucks.show_paid_step` — that default belongs to Manage → Settings."*

It is a **default + per-event override**, one value resolved by one function. Collapsing both surfaces onto the truck column **removes a capability**, and §37 records why it exists: *"if the card terminal fails mid-service the operator needs cash enabled for TONIGHT, from the dashboard, without going into Manage."* Two events currently carry an override (both `test-truck`, both closed — no live impact). **Decide this deliberately; it is a scope reduction, not a de-duplication.**

---

## 🔴 THE PRIORITY CASE: can an online pre-order become uncompletable?

**Today: no. No shortcut exists.** Under the new design: **yes, by one specific mistake, and there is already a working example of that mistake's shape in the tree.**

### Today — nothing takes the shortcut

Every reference to the payment config across the repo, filtered to anything resembling an order query:

```
$ grep -rn "showPaidStep|show_paid_step" --include=*.ts --include=*.tsx . | grep -iE "filter|\.eq\(|\.in\(|select\(|status ===|includes\("
app/api/dashboard/route.ts:136          .select('… show_paid_step_override, takes_cash_override …')   ← reads the column
app/api/dashboard/action/route.ts:41    .select('show_paid_step_override, takes_cash_override')       ← reads the column
app/api/dashboard/action/route.ts:1552  .update({ show_paid_step_override: … })                       ← writes the column
```

**Three hits, all reading or writing the setting itself. No order query, no bucket filter, no status transition is gated on payment config.** The dashboard's buckets ([page.tsx:2214-2220](app/dashboard/[token]/page.tsx#L2214-L2220)) and the KDS's ([kds/page.tsx:843-880](app/dashboard/[token]/kds/page.tsx#L843-L880)) filter on `status` alone.

And 20 live unpaid, uncollected orders exist right now — including `pizzeria-gusto #1` — so this is not hypothetical.

### But two places already decide on CONFIG BEFORE STATE

**(i) `completionBtn()` — [OrderCard.tsx:238-241](components/dashboard/OrderCard.tsx#L238-L241):**

```ts
const completionBtn = () => {
  if (!showPaidStep) { return <Btn label="Paid & collected" … onClick={() => onAction('collected', …)} /> }
  if (effectivePaid) { return <Btn label="Collected" … /> }
  … money buttons …
```

🔴 **The config is checked first and the order's own payment state second.** This is exactly the shape the operator is worried about — and it is already here.

**It is safe today only because the fall-through is generous.** On a paid-step-off truck an unpaid online pre-order gets `"Paid & collected"` → `'collected'` → the server charges the **full outstanding balance** computed from the database. The order completes and the money is recorded. Correct by accident of which branch it lands in, not by the branch asking the right question.

**(ii) `undo_collected` — [action/route.ts:470](app/api/dashboard/action/route.ts#L470):** `splitPaidStep` decides whether an undo reverses **both** halves or **status only**. This is a **status transition keyed on truck config**, and it is the one place config changes what a transition *means*.

### 🔴 The exact way (A) would strand an online pre-order

**(A) OFF means "walk-ups are always paid at order".** The tempting inference is *"therefore this truck has no unpaid orders"*. An online pre-order refutes it: [submit/route.ts:920](app/api/orders/submit/route.ts#L920) inserts `payment_status: 'unpaid'` with `status` `'pending'` or `'confirmed'`, never through the Add Order panel.

**The failure is not "it renders the wrong label" — it is "`collected` becomes unreachable".** There is a live example of that code shape:

```ts
// OrderCard.tsx:558
if (viewMode === 'cook' || (viewMode === 'window' && hidePayments)) {
  … Start cooking / Ready …
  if (order.status === 'ready') { }     // falls through
  return null                            // ← no completion button at all
}
```

`hidePayments` routes the window view into the cook block, whose terminal state is `Ready` and which **returns `null` for a ready order**. That is deliberate there (the dashboard completes it, and the KDS filters ready orders off the board). **Wire (A) into `renderButtons` the same way and the dashboard has no second surface to fall back to — the order is stranded.**

### The rule that prevents it

**(A) must gate exactly one component: the Add Order confirm bar** — [AddOrderPanel.tsx:1273-1325](components/dashboard/AddOrderPanel.tsx#L1273-L1325), one render site. It must appear in **none** of:

| Must not reference (A) | Why |
|---|---|
| `OrderCard.completionBtn` / `renderButtons` | an order's completability is a property of the ORDER, not of how walk-ups are placed |
| any order bucket or filter | none is config-gated today; keep it that way |
| `/api/dashboard/action` status transitions | `collected` / `mark_paid` must stay driven by the ledger |
| `mapOrderToTicket` | the kitchen ticket describes an order |

**A one-line test for any future reader: *"could this line change what happens to an order that arrived through the customer path?"* If yes, (A) does not belong in it.**

⚠️ **(B) is the opposite** — it *must* reach `OrderCard` and `undo_collected`, because it genuinely describes how completion works for every order regardless of origin.

---

## 1. What `show_paid_step` controls today, split three ways

My earlier audit's finding holds and is worth stating first: 🔴 **recording always happens.** `'collected'` calls `recordCollectionPayment` unconditionally at [action/route.ts:403](app/api/dashboard/action/route.ts#L403) — there is no paid-step check on that path. **Every truck has a complete ledger.**

| Behaviour | file:line | Which of the three |
|---|---|---|
| `'collected'` books the full outstanding balance | [action/route.ts:403](app/api/dashboard/action/route.ts#L403) | 🔴 **RECORDING — not gated at all** |
| Walk-up paid at order books a row | [action/route.ts:1237](app/api/dashboard/action/route.ts#L1237) | **recording — gated** (only when the paid step is on) |
| PAID / part-paid chip | [OrderCard.tsx:304](components/dashboard/OrderCard.tsx#L304) | **display** |
| Remove-payment modal (reachable only via the chip) | [OrderCard.tsx:330](components/dashboard/OrderCard.tsx#L330) | **display → but gates an ACTION** |
| Printed ticket payment line | [mapOrderToTicket.ts:71-76](lib/printing/mapOrderToTicket.ts#L71-L76), [ticket.ts:358](lib/printing/ticket.ts#L358) | **display** — off ⇒ *no line at all*, not "unpaid" |
| Add Order confirm bar shape | [AddOrderPanel.tsx:1273](components/dashboard/AddOrderPanel.tsx#L1273) | **display + recording** (whether payment can be taken at order) |
| `paymentTaken` honoured | [AddOrderPanel.tsx:964](components/dashboard/AddOrderPanel.tsx#L964), [action/route.ts:1237](app/api/dashboard/action/route.ts#L1237) | **recording** |
| Completion button: one vs two | [OrderCard.tsx:238-268](components/dashboard/OrderCard.tsx#L238-L268) | 🔴 **SEPARATE ACT** |
| Disabled-button label | [OrderCard.tsx:382](components/dashboard/OrderCard.tsx#L382) | **separate act** |
| `undo_collected` reverses one stage or two | [action/route.ts:464-495](app/api/dashboard/action/route.ts#L464-L495) | 🔴 **SEPARATE ACT** |

**So the flag is doing three jobs, and the new pair covers only two.** (A) and (B) between them address *display* and *separate act*. **Nothing in the new design carries "should payment state be visible"** — the chip, the remove-payment route and the printed payment line currently ride on `show_paid_step` and would need an owner. If (B)=ONE implies "hide the chip", a one-press truck loses the ability to see or correct a payment; if it does not, a one-press truck gains a chip it has never had.

---

## 2. What the two settings need

### Columns

| Column | Type | Purpose |
|---|---|---|
| `trucks.confirm_at_order` | `boolean NOT NULL DEFAULT true` | (A) — Confirm button beside Mark paid in Add Order |
| `trucks.completion_presses` | `smallint NOT NULL DEFAULT 1` **or** `text CHECK IN ('one','two')` | (B) |

**Prefer the text enum.** `1`/`2` invites arithmetic and reads as a count of something; `'one'`/`'two'` cannot be accidentally incremented and matches the house style (`crew_mode`, `display_mode`, `preorder_deadline_type` are all text with CHECKs).

### 🔴 Defaults must be BACKFILLED from `show_paid_step`, not set to a constant

There is no single default that preserves all twelve trucks, because they are split 3/9. A constant default silently changes behaviour for one group. The migration must derive per row:

```
completion_presses = (show_paid_step IS TRUE) ? 'two' : 'one'
confirm_at_order   = true      -- every truck has a Confirm button in Add Order today
```

Which yields: **Gusto / test-truck / village-spice → `two`. The other nine → `one`.**

### ⚠️ A gap in the design as specified — (A) cannot express today's paid-step-off panel

| Truck | Add Order today | Nearest (A) state |
|---|---|---|
| `show_paid_step` **false** (9) | **one button: `Confirm order · £X`** — no payment control at all | ❌ neither. (A) ON = Confirm **and** Mark paid; (A) OFF = Mark paid only |
| `show_paid_step` **true** (3) | `Confirm order` + `Take payment £X` | ✅ (A) ON |

**As specified, every (A) state offers "Mark paid" at order time.** The nine paid-step-off trucks have never had that button. `confirm_at_order = true` keeps their Confirm button, but they **gain a "Mark paid"** — a real change: their walk-ups would start recording payment at order rather than at collection.

Three ways out, all yours to pick: accept the change; give (A) a third state (`confirm_only`); or let (B)=ONE imply "no payment control in Add Order", coupling the two settings. **I am not recommending one — it is a product decision, and the brief specifies two independent settings, which this breaks.**

---

## 3. Does `show_paid_step` survive?

**Recommendation: DERIVE at migration, then RETIRE — do not keep it as a live input.**

Keeping it would give three columns describing two facts, and the manual already records what that costs (`default_walkup_payment`, built and dropped in 24 hours; the `no FK cascade` restatement believed over the schema).

**Migration path**, following the repo's own deploy-coupling conventions:

1. **Additive, run BEFORE deploy.** Add both columns nullable, backfill from `show_paid_step` per the rule above, then `SET NOT NULL` + defaults. `show_paid_step` untouched and still read by the deployed build — safe to apply mid-service.
2. **Deploy** code reading the new pair. `resolvePaidStep` ([lib/payments/paid-step.ts](lib/payments/paid-step.ts)) is the **only** resolver and stays the only one — it becomes `resolvePaymentActions(truck, event)` returning `{ confirmAtOrder, completionPresses, takesCash }`. **Eight callers, no inline resolution** — that property is why this is a contained change.
3. **Drop `show_paid_step` AFTER deploy** — a DROP is deploy-coupled in the reverse direction, exactly as `20260730_drop_trucks_default_walkup_payment.sql` documents. No rush; an unused boolean costs nothing.

### 🔴 The per-event override needs an explicit decision

`truck_events.show_paid_step_override` and `takes_cash_override` are **live** (two rows) and resolved by `??` chains. The brief makes both new settings truck-level only, which **drops the override**.

- **(A)** — no per-event case is obvious; truck-level is fine.
- **(B)** — has the same mid-service argument `takes_cash` has: a truck that normally takes two presses might want one on a hectic night. **If you want that, `completion_presses_override` must be in the same migration**; retrofitting an override later means revisiting every consumer.
- **`takes_cash` and its override are untouched by this design** and must keep working — it is orthogonal (cash/card split) and is read by the same resolver.

---

## 4. Is the one-press path reusable for (B)=ONE? **Yes — and it is the only safe shape**

⚠️ It is the **nine paid-step-off trucks'** path, not Gusto's (correction 2).

**One action name, one request, one outbox op.** [OrderCard.tsx:239](components/dashboard/OrderCard.tsx#L239) → `onAction('collected', …)` → [page.tsx:1605](app/dashboard/[token]/page.tsx#L1605) → `gatedAction({ kind:'status', body:{ action:'collected' } })`.

🔴 **`'collected'` is deliberately NOT in `PAYMENT_ACTIONS`** ([orderGate.ts:81](lib/native/orderGate.ts#L81)) — *"they change status too, so the STATUS overlay already moves the card for them."* One op, one overlay, one replay.

**Why two client-dispatched ops would be unsafe, confirmed:** a conflicted op is marked `conflict` and **SKIPPED, never retried** ([orderGate.ts:241](lib/native/orderGate.ts#L241)), and the outbox has no dependency ordering. `mark_paid` conflicts → skipped → `collected` still replays → **order collected, no payment recorded.** Precisely the silent shape.

### What `'collected'` writes, in order — [action/route.ts:401-437](app/api/dashboard/action/route.ts#L401-L437)

| # | Write | Failure |
|---|---|---|
| 1 | `recordCollectionPayment` → one `order_payments` charge row for the **full outstanding balance** (`channel:'in_person_other'`, `method:null`, `livemode:true`, key `collect:{order_key}:{paidBefore}:{balance}`), then `recalcOrderPayment` rewrites `orders.payment_status` + `amount_paid` | 🔴 **FAILS OPEN** — caught, `paymentWarning` set, execution continues |
| 2 | `logAction` audit row | **swallows** its own errors |
| 3 | `UPDATE orders SET status='collected', paid_at, collected_at, status_before_collected` | **fails CLOSED** → 500 |

⚠️ **Not a transaction.** Three sequential PostgREST calls. Replay is safe (the balance guard and the idempotency key make step 1 a no-op; step 3 is absolute) — but a partial outcome in the direction *"collected but unpaid"* is reachable today, by design.

**For (B)=ONE, reuse `'collected'` unchanged and give the button the new label.** Do not introduce a new action name; the safety is in there being one.

---

## 5. `paymentWarning` — read by nobody

```
$ grep -rn "paymentWarning" --include=*.tsx . | grep -v node_modules
(no matches)
```

Returned on the 200 by three handlers — `collected` ([:438](app/api/dashboard/action/route.ts#L438)), `mark_paid` ([:1702](app/api/dashboard/action/route.ts#L1702)), `manual` ([:1255](app/api/dashboard/action/route.ts#L1255)). **No client reads it. It surfaces nowhere.**

**What an operator sees if the money half fails:** `doAction` checks `result.ok` only ([page.tsx:1637](app/dashboard/[token]/page.tsx#L1637)), so the 200 is a success. They get the normal green **"Order #N collected"** toast with its 7-second Undo, the card clears from the board, and the order reads collected. **There is no visual difference whatsoever from a fully successful collection.** The only trace is `console.error` in the Vercel log naming the `order_key`, plus the reconciliation query in [ledger.ts:30-50](lib/payments/ledger.ts#L30-L50).

⚠️ **This matters more under (B)=ONE than today**, because one press means one chance: with two presses an operator who watches the chip fail to turn green has a signal. Collapsing to one press removes that incidental check, and `paymentWarning` is the designed replacement that is not wired up. **If (B)=ONE ships, wiring it is not optional polish.**

---

## 6. Every surface

| # | Surface | file:line | Needs |
|---|---|---|---|
| 1 | **Add Order confirm bar** | [AddOrderPanel.tsx:1273-1325](components/dashboard/AddOrderPanel.tsx#L1273-L1325) | 🔴 **the only place (A) belongs.** Currently `showPaidStep ?` two/three buttons `:` one |
| 2 | **`completionBtn`** — dashboard solo **and** KDS window | [OrderCard.tsx:238-268](components/dashboard/OrderCard.tsx#L238-L268) | (B). `!showPaidStep` → `completionPresses === 'one'`; label `"Mark paid & collected"`; action stays `'collected'` |
| 3 | **`completionBtnDisabled`** (kdsMode waiting/cooking) | [OrderCard.tsx:380-384](components/dashboard/OrderCard.tsx#L380-L384) | same label logic — it duplicates the branch and will drift if only #2 is changed |
| 4 | **PAID chip + remove-payment modal** | [OrderCard.tsx:291-341](components/dashboard/OrderCard.tsx#L291-L341) | ⚠️ **no owner in the new design** (§1). Decide explicitly |
| 5 | **Printed ticket payment line** | [mapOrderToTicket.ts:68-76](lib/printing/mapOrderToTicket.ts#L68-L76), [ticket.ts:358-359](lib/printing/ticket.ts#L358-L359) | same — currently `showPaidStep ? status : undefined` |
| 6 | **`undo_collected`** | [action/route.ts:464-495](app/api/dashboard/action/route.ts#L464-L495) | 🔴 (B). ONE ⇒ reverse **both** halves; TWO ⇒ status only |
| 7 | **`paidStepFor`** (server resolver) | [action/route.ts:37-58](app/api/dashboard/action/route.ts#L37-L58) | returns the new pair |
| 8 | **`resolvePaidStep`** | [lib/payments/paid-step.ts:66](lib/payments/paid-step.ts#L66) | the one resolver; 8 callers |
| 9 | **Manage → Settings** | [manage/page.tsx:8977-9019](app/manage/[token]/page.tsx#L8977-L9019) | two controls; `takes_cash` stays gated on payment being taken |
| 10 | **Dashboard Settings** | [page.tsx:1240-1271](app/dashboard/[token]/page.tsx#L1240-L1271) | 🔴 currently writes the **event override**; the brief redirects it to the truck column (correction 3) |
| 11 | **`/api/manage` allowlist** | [manage/route.ts:854](app/api/manage/route.ts#L854) | add both column names or the writes 400 |
| 12 | **`/api/dashboard` truck map** | [dashboard/route.ts:589](app/api/dashboard/route.ts#L589) | ship both to the client — this is the hand-picked-subset trap the manual records three times |
| 13 | **`lib/provision-truck.ts`** | [:113-196](lib/provision-truck.ts#L113-L196), [:427](lib/provision-truck.ts#L427) | profiles set `showPaidStep`; new trucks need the new pair |
| 14 | **`components/dashboard/types.ts`** | [:125-127](components/dashboard/types.ts#L125-L127), [:278-283](components/dashboard/types.ts#L278-L283) | `TruckData` + `TruckEvent` |

**Not affected:** the customer order page (never reads payment config), the KDS cook view (no payment UI), reporting (`/api/manage` has zero payment references).

---

## 7. Gusto — tap by tap

🔴 **Under the brief's stated premise (`show_paid_step false`) the answer would be wrong.** They are `true`. Correct defaults: **(A) ON, (B) TWO.**

### Today — `show_paid_step: true`, `takes_cash: false`

**Walk-up:** build basket → **Tap 1** `Confirm order` **or** `Take payment £X` (two buttons, [AddOrderPanel.tsx:1276-1318](components/dashboard/AddOrderPanel.tsx#L1276-L1318)).
**Completion:** **Tap 2** `Mark paid` → `mark_paid` (**status unchanged**) → **Tap 3** `Collected` → `'collected'`.

**3 taps** paying at collection; **2 taps** paying at order (`Take payment` → `Collected`). Chip visible, payment line printed, two-stage undo.

Their data confirms the split independently: ledger rows land **minutes before** `collected_at` (order #3 paid 17:15:59, collected 17:34:34) — two separate acts.

### After, with `confirm_at_order = true`, `completion_presses = 'two'`

| | Today | After |
|---|---|---|
| Add Order | `Confirm order` + `Take payment £X` | **identical** |
| Card, unpaid | `Mark paid` → `mark_paid` | **identical** |
| Card, paid | `Collected` → `'collected'` | **identical** |
| Undo | status only (payment stands) | **identical** — provided (B)=TWO drives `splitPaidStep` |
| Chip / ticket line | shown | **identical** — provided #4/#5 keep an owner |
| Taps | 3 (or 2 paying at order) | **3 (or 2)** |

**Identical, because the defaults are derived from their actual row rather than assumed.** Had the defaults been set from the brief's premise — `false` ⇒ (B) ONE — Gusto would have silently moved from two presses to one, their chip and printed payment line would have gone, and their undo would have started reversing the payment as well as the status.

⚠️ **The nine paid-step-off trucks are the ones that change** (§2's gap): they keep one-press completion but their Add Order panel gains a `Mark paid` button it has never had.

---

## What is established

1. **No existing logic takes the "no unpaid orders" shortcut** — three config references repo-wide, all reading/writing the setting itself.
2. **Two places already decide config-before-state** — `completionBtn` and `undo_collected`'s `splitPaidStep`. The first is safe only because its fall-through is generous.
3. **(A) must gate exactly one component.** Wired into `renderButtons` the way `hidePayments` is, an online pre-order loses its route to `collected`.
4. **Recording is never gated**; display and separate-act are. The new pair covers two of the three jobs — **the chip, the remove-payment route and the printed payment line have no owner.**
5. **Defaults must be backfilled from `show_paid_step` per row**, not set to a constant: 3 trucks `two`, 9 `one`.
6. **(A) as specified cannot reproduce today's paid-step-off Add Order panel** — a real gap.
7. **`'collected'` is reusable for (B)=ONE unchanged** — one action, one op; and `paymentWarning` becomes load-bearing when the second press is removed.
8. **Collapsing both settings surfaces onto the truck column removes the per-event override**, which is a capability, not duplication.

**Nothing built, per the brief.**
