# "Mark paid" on an offline paid walk-up — three options appraised

Date: 14 August 2026
**READ-ONLY APPRAISAL. No edits, no commits, no builds, no deploys, no database writes. NOTHING IMPLEMENTED.**

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

# 🔴 ONE FINDING CHANGES THE SHAPE OF THE CHOICE — READ BEFORE THE OPTIONS

**Option 2 does not need a new prop. `OrderCard` already has the exact one, and it already does exactly
the right thing.**

**READ, `components/dashboard/OrderCard.tsx:158`:**
```tsx
  pendingPayment?: 'pending_paid' | 'pending_unpaid'
```
**and `:283-285`:**
```tsx
  const effectivePaid = pendingPayment === 'pending_paid' ? true
    : pendingPayment === 'pending_unpaid' ? false
    : isPaid
```
**and the dashboard already passes it, `page.tsx:3250`:**
```tsx
pendingPayment={paymentOverlay.get(o.order_key)}
```

🔴 **`pendingPayment='pending_paid'` short-circuits `effectivePaid` BEFORE `isPaid` is consulted, so the
ledger being empty stops mattering.** The mechanism for showing a queued payment as paid **already
exists, is already wired, and is already used** — it simply has nothing to say about walk-up creates.

⚠️ **And the fix applied earlier today matters here:** the optimistic object now carries
`payment_status: manualOrder.paymentTaken ? 'paid' : 'unpaid'` (`AddOrderPanel.tsx:1130`). **The
dashboard therefore already holds the fact it needs**, in `deviceQueuedOrders`. That edit looked inert;
**it is the input Option 2 reads.**

---

# PART A — OPTION 1: SYNTHESISE A LOCAL LEDGER ROW

## A1. What `getOrderBalance` consumes

```ts
export function getOrderBalance(order: BalanceableOrder, ledgerRows: LedgerRow[]): OrderBalance {
  const succeeded = (ledgerRows ?? []).filter(r => isLiveRow(r) && r.state === 'succeeded')
  const chargeMinor = succeeded.filter(r => r.kind === 'charge').reduce((s, r) => s + Math.round(r.amount_minor), 0)
  const refundMinor = succeeded.filter(r => r.kind === 'refund').reduce((s, r) => s + Math.round(r.amount_minor), 0)

  const paidMinor = chargeMinor - refundMinor
  const totalMinor = orderTotalMinor(order)
  const balanceMinor = totalMinor - paidMinor
```
**and the row shape, `lib/payments/ledger.ts:68-96`:**
```ts
export interface LedgerRow {
  kind: PaymentKind            // 'charge' | 'refund'
  channel: PaymentChannel      // 'online' | 'in_person_stripe' | 'in_person_other'
  amount_minor: number
  state: PaymentEventState     // 'pending' | 'succeeded' | 'failed'
  external_ref?: string | null
  method?: string | null
  livemode?: boolean
  account_is_test?: boolean
  truck_id?: string
}
```

## A2. What a synthetic row would need — and 🔴 **it must assert `livemode: true`**

To be counted it must pass `isLiveRow(r) && r.state === 'succeeded'`. **`isLiveRow`, `:161-166`:**
```ts
export function isLiveRow(row: { livemode?: boolean; channel?: PaymentChannel; account_is_test?: boolean }): boolean {
  if (row.livemode === true) return true
  return row.account_is_test === true && row.livemode === false && row.channel === 'online'
}
```
🔴 **Arm (b) requires `channel === 'online'`, which a hatch payment is not. So the ONLY route is arm (a):
`livemode: true`.** The client would have to fabricate a row that says **"this is real money"** —
```ts
{ kind: 'charge', channel: 'in_person_other', amount_minor: totalMinor, state: 'succeeded', livemode: true }
```
— which is byte-for-byte the shape the dev fixture uses (`app/dev/ticket-preview/page.tsx:81`), and the
file says so in terms at `:76`: *"`livemode: true` is REQUIRED for this fixture to count, and its
absence being fatal is the point."*

**Could it be distinguished downstream?** ⚠️ **Only if every consumer is taught to look**, because the
shape is indistinguishable from a real in-person row: **no `id`, no `idempotency_key` and no
`truck_id`** would be present, **but nothing filters on their absence.** `LedgerRow` marks all three
optional precisely so hand-built rows are legal.

## A3. 🔴 EVERY CONSUMER OF LEDGER ROWS — and where a fake one would travel

**The rows the card reads come from `/api/dashboard` as a `payments` map (`route.ts:207, 756`). A
synthetic row injected client-side would be visible to every CLIENT consumer of that map:**

| Consumer | file:line | Effect of a fake row |
|---|---|---|
| `OrderCard` — chip, buttons, balance | `OrderCard.tsx:225` | ✅ the intended effect |
| 🔴 **The dashboard's `confirmedPaid`** | `page.tsx:325` | would report the order settled |
| 🔴 **The dashboard's inline balance readouts** | `page.tsx:3329, 3348` | quote a paid figure |
| 🔴 **The KDS card + its balance** | `kds/page.tsx:1389` | (only if the row reached the KDS — it would not; see A4 below) |
| 🔴 **THE PRINTED KITCHEN TICKET** | `lib/printing/mapOrderToTicket.ts:74` `const balance = getOrderBalance(order, ledgerRows ?? [])` | **prints PAID / suppresses "TO PAY"** on physical paper |
| `PaymentActionsModal` | `PaymentActionsModal.tsx:51` | quotes `paidMinor` in "Remove payment?" copy |

✅ **CONTAINMENT, AND IT IS REAL: no SERVER consumer could see it.** `readLedger`
(`ledger.ts`, used by `action/route.ts:1002`, `refund.ts:88`), `recalcOrderPayment`,
`recordCollectionPayment`, the Stripe webhook and every report read **`order_payments` from Postgres**.
**A client-side array cannot reach them.** 🔴 **So no accounting artefact, export or reconciliation could
ever count it** — the money paths are all server-side.

⚠️ **BUT the printed ticket is not a display artefact in the ordinary sense.** It is paper handed to a
kitchen, and `mapOrderToTicket` is described at `:22` as the "ninth consumer" of the one balance
resolver. **A fabricated row would print "PAID" on a ticket for money that has not been recorded
anywhere.**

## A4. Verdict — 🔴 **UNACCEPTABLE**

Three reasons, in descending order:

1. 🔴 **It requires the client to assert `livemode: true` — "this money is real" — for money that has
   reached no ledger.** That is the one claim this codebase is most careful about; `ledger.ts:150-155`
   exists solely to protect which rows count.
2. 🔴 **It writes into the shared resolver's INPUT, not its output.** Every one of the six consumers
   above inherits the lie, including a printed ticket. **`useOfflinePaymentOverlay.ts:24` states the
   opposite principle explicitly: *"getOrderBalance() IS NOT BYPASSED… this map layers on top of its
   output at render."***
3. ⚠️ **It is indistinguishable by construction** — the optional fields that might have marked it
   synthetic are optional *because* hand-built rows are permitted elsewhere.

**Not viable, not merely risky.**

---

# PART B — OPTION 2: AN EXPLICIT PROP ON `OrderCard`

## B1. The props, and how the KDS passes `hidePayments`

**`OrderCard.tsx:176-194`:**
```tsx
  /** This order's order_payments rows, supplied by /api/dashboard. Fed straight to getOrderBalance —
   *  the card NEVER derives payment state itself. Undefined/empty ⇒ nothing paid. */
  ledgerRows?: LedgerRow[]
  /** ── THIS DEVICE DOES NOT TAKE MONEY (KDS window devices only) ───────────────────────────────────
   *  Set by the KDS from its per-device "take payments on this device" toggle… DEFAULT FALSE, so the
   *  dashboard — which never passes it — is byte-identical.
   *  ⚠️ IT DOES NOT TOUCH `balance`, `effectivePaid` OR ANY ARITHMETIC… this decides only what is
   *  OFFERED. Payment state stays derived in one place; a device preference must never be able to
   *  change what is true. */
  hidePayments?: boolean
```
**and the KDS passes it at `kds/page.tsx:1353`** `hidePayments={hidePayments}`, computed at `:888`:
```tsx
  const hidePayments = showPaidStep && showPaymentsPref !== true
```

🔴 **`hidePayments` IS THE PRECEDENT FOR OPTION 2, AND IT IS AN EXACT ONE:** a caller-supplied prop that
changes **what is offered** without touching `balance` or the resolver. **The pattern is already
established and already documented as the correct shape.**

## B2. 🔴 **NO NEW PROP IS NEEDED** — and the dashboard already holds the fact

**The prop exists (`pendingPayment`, quoted in the headline). What is needed is one derivation at the
call site.** The dashboard already separates queued orders — `page.tsx:2470-2471`:
```tsx
  const syncedKeys=new Set(orders.map(o=>o.order_key))
  const pendingQueued=deviceQueuedOrders.filter(o=>!syncedKeys.has(o.order_key))
```
and `deviceQueuedOrders` is declared at `:205` `useState<Order[]>([])`, populated **only** by the offline
create (`:2300`: *"deviceQueuedOrders is ONLY ever populated by an OFFLINE create"*).

**So the dashboard knows both halves:** *which* orders are queued (`pendingQueued`) and *whether each was
paid* (`payment_status`, now truthful on the optimistic object). ⚠️ **The change is at the
`pendingPayment={paymentOverlay.get(o.order_key)}` call site, merging one more source into that lookup.**

## B3. ✅ **It touches NOTHING on the money path. Stated plainly.**

- **The ledger** — not touched. `getOrderBalance` still runs over the real rows and still governs
  `balance`, the chip, the part-paid row and every other consumer.
- **The gate, the outbox, the drain** — not touched. No op, no `kind`, no replay changes.
- **The server** — not touched. This is render-time only, on one surface.

✅ **It layers on the resolver's OUTPUT**, which is the documented rule
(`useOfflinePaymentOverlay.ts:24`).

## B4. Would it wrongly suppress the button on a queued UNPAID order? — **NO, and the discriminator is
already there**

**Both trucks run `show_paid_step = true` (live-verified), so the confirm bar has two buttons and a
genuinely unpaid queued walk-up is a real case.** It is distinguished by the value that was queued:

```tsx
// AddOrderPanel.tsx:1130 — already in the tree
payment_status: manualOrder.paymentTaken ? 'paid' : 'unpaid',
```

🔴 **`paymentTaken` is the operator's own button press** (`:1093`, *"THE VALUE NOW COMES FROM THE BUTTON
THE OPERATOR PRESSED, and nothing else"*). **A queued unpaid order carries `'unpaid'`, resolves to no
overlay entry, and the button renders — correctly.** ⚠️ **`pendingPayment` even has an explicit
`'pending_unpaid'` value if the negative case ever needs to be asserted rather than defaulted.**

## B5. Verdict — ✅ **VIABLE, and the smallest change of the three**

**Two call sites at most**, no new prop, no money path, no new predicate type, and a precedent
(`hidePayments`) that the codebase already documents as the right shape.

⚠️ **ITS ONE REAL COST, AND IT IS ARCHITECTURAL:** it creates a **second** answer to *"is this order
pending-paid?"* — the overlay for `mark_paid` ops, and this for creates. **That is exactly the
duplication manual section 35's N8 flags** (three mechanisms answering one question), and the header at
`orderGate.ts:100-102` claims `isPaymentAction` is *"the one predicate that owns that decision"*.
**Option 2 quietly makes that claim untrue.**

---

# PART C — OPTION 3: WIDEN THE OFFLINE PAYMENT OVERLAY

## C1. The two filters

```ts
const PAYMENT_ACTIONS = new Set(['mark_paid', 'mark_paid_cash', 'mark_paid_card', 'undo_mark_paid'])
```
```ts
/** Pending payment ops, oldest-first. Same outbox, same 'status' kind — filtered by ACTION. */
export async function listPendingPaymentOps(): Promise<PendingStatusOp[]> {
  const ops = await listOps()
  return ops
    .filter(o => o.kind === 'status' && o.state !== 'conflict')
    .map(o => ({ order_key: o.order_key, action: String((o.body as { action?: unknown } | undefined)?.action ?? ''), seq: o.seq }))
    .filter(o => PAYMENT_ACTIONS.has(o.action))
    .sort((a, b) => a.seq - b.seq)
}
```
🔴 **A walk-up create fails BOTH: `kind` is `'create'`, and `body.action` is `'manual'`.**

## C2. The design note, and what widening would break conceptually

**`orderGate.ts:100-104`:**
```
/** 🔴 HOW A MONEY OP IS TOLD FROM A WORKFLOW OP. `kind` CANNOT do it — payment actions are queued as
 *  kind:'status' exactly like 'ready' and 'collected', because they replay to the same endpoint. The only
 *  discriminator is body.action, and this is the one predicate that owns that decision: the overlay above
 *  and the conflict classifier below both call it, so they can never disagree about what a payment is.
 *  ⚠️ Adding a new payment action means adding it to PAYMENT_ACTIONS and nowhere else. */
```

🔴 **THE NOTE'S GUARANTEE IS "one predicate, so two consumers can never disagree" — and widening does not
break that; it EXTENDS it.** But it breaks the note's *premise*: **`'manual'` is not a payment action.**
It is a create that happens to carry money in a field. Adding `'manual'` to `PAYMENT_ACTIONS` would be
false — a `paymentTaken: false` walk-up would then be classified as a payment op.

⚠️ **So widening cannot be done by adding a string to the set.** It requires the predicate to inspect the
**body**, not just the action — *"is this op carrying money?"* rather than *"is this action a payment
action?"*. **That is a genuine change of concept, and `isPaymentAction`'s signature (`action: string`)
cannot express it.**

## C3. What it would actually take

1. `listPendingPaymentOps` to admit `kind: 'create'` **and** read `body.manualOrder.paymentTaken` — so it
   would need the whole op, not the projected `{order_key, action, seq}`.
2. `PendingStatusOp` or a new type to carry that.
3. `buildPaymentOverlay` (`:126-132`) to fold a create into `'pending_paid'` **only when `paymentTaken`
   is true** — an `'unpaid'` create must produce **no entry**, not `'pending_unpaid'`.
4. ⚠️ **A decision about `useOutboxConflicts.ts:103`** — `kind: isPaymentAction(action) ? 'payment' : 'status'`.
   **Widen it too and a failed paid create correctly raises the red PAYMENT NOT RECORDED banner; leave it
   and the two consumers now disagree — the exact thing the design note exists to prevent.**

## C4. 🔴 BLAST RADIUS — this is the live-money offline queue

**Consumers of the two functions, complete:**

| Consumer | file:line | What widening would reach |
|---|---|---|
| `useOfflinePaymentOverlay` | `:48` `listPendingPaymentOps()`, `:65` `buildPaymentOverlay` | 🔴 **the paid chip and the buttons on EVERY queued order, dashboard AND KDS** |
| `useOutboxConflicts` | `:103` `isPaymentAction(action)` | 🔴 **which banner a FAILED op raises — red "PAYMENT NOT RECORDED" with two-step dismissal, vs amber "needs review"** |

🔴 **COULD IT PRODUCE FALSE OVERLAYS ON ORDINARY CREATES? YES — that is the central risk.** If the fold
keyed on `kind === 'create'` without testing `paymentTaken`, **every offline walk-up would render as
PAID**, including the deliberately-unpaid ones both live trucks can place (`show_paid_step = true`). ⚠️
**That is the current defect with its sign reversed, and it is the worse direction**: an unpaid order
showing PAID means money never asked for. **The correctness of this option rests entirely on one boolean
read inside a JSON body in durable storage.**

⚠️ **Second-order:** `useOfflinePaymentOverlay` polls every 5s and drops entries when the op reaches
`'conflict'`, so a paid create whose replay failed would revert the card to unpaid — **correct, and it
depends on the conflict classifier being widened in step (C3.4).**

## C5. Verdict — ⚠️ **VIABLE BUT THE HIGHEST RISK, and it is the only one that addresses the CAUSE**

It puts the answer in the place the architecture says it belongs — one overlay, layered on the
resolver's output, shared by both surfaces. **It also touches the durable outbox's read path on a live
money queue, on two trucks taking real money, with no way to test it here.**

---

# PART D — COMPARE

## D1. The table

| | **1. Synthetic ledger row** | **2. Prop on OrderCard** | **3. Widen the overlay** |
|---|---|---|---|
| **Files touched** | `page.tsx` (inject into `payments`) | `page.tsx` (1-2 call sites). 🔴 **No new prop** | `lib/native/orderGate.ts` + `useOfflinePaymentOverlay.ts` + probably `useOutboxConflicts.ts` |
| **Blast radius** | 🔴 **6 client consumers, incl. the PRINTED TICKET** | ✅ **the dashboard's own card render** | 🔴 **dashboard + KDS cards, and the conflict banner classification** |
| **Touches money paths?** | 🔴 **YES — fabricates a `livemode: true` charge** | ✅ **NO** | ⚠️ **the offline money QUEUE's read path (not the ledger)** |
| **Cause or symptom?** | symptom, by corrupting the input | **symptom**, cleanly | ✅ **CAUSE** |
| **Reaches the KDS?** | no (no `deviceQueuedOrders` there) | no | ✅ **yes — both surfaces** |
| **What could go wrong** | 🔴 a ticket prints PAID for unrecorded money | ⚠️ a second answer to one question (N8) | 🔴 **an UNPAID order rendering PAID** if `paymentTaken` is not tested |

## D2. Recommendation — 🔴 **OPTION 2 NOW; OPTION 3 EVENTUALLY. BOTH ARE NEEDED.**

**Option 2 fixes the SYMPTOM. Option 3 fixes the CAUSE. They are not alternatives over time.**

**Why 2 first:**
- It is **the smallest possible change** — the prop, the wiring and the input all already exist.
- 🔴 **It cannot make an unpaid order look paid**, because it reads the operator's own button press
  through a field that is already correct in the tree.
- **It never touches the ledger, the gate, the outbox or the drain**, so the worst case is a card that
  still shows "Mark paid" — **today's behaviour, not a new failure.** On two live trucks that asymmetry
  is decisive.

**Why 3 eventually:** Option 2 leaves **two** mechanisms answering *"is this pending-paid?"*, and
`orderGate.ts:100-102` claims there is one. ⚠️ **It also leaves the KDS uncovered** — irrelevant today
(the KDS never receives a queued create) **but it would silently become relevant the moment anything
gives the KDS an optimistic order.** And it leaves the red PAYMENT NOT RECORDED banner unable to fire for
a failed paid create, which is a real gap in the failure path.

🔴 **DO NOT DO OPTION 1.** Not "later" — it is the only one that puts a falsehood into the shared
resolver's input, and a printed ticket saying PAID is worse than a button saying "Mark paid".

## D3. What each needs to VERIFY ON A DEVICE — not in code

**Common to all three** (nothing below is provable by `tsc`, and the double cast is why):
1. Go offline on the iPad; place a walk-up **and take payment**. **PASS = the card shows PAID / the
   button reads "Collected". FAILURE = "Mark paid".**
2. 🔴 **Place a second walk-up and choose the UNPAID button.** **PASS = "Mark paid" still renders.
   FAILURE = it shows PAID — the reversed defect, and the one that loses money.**
3. Reconnect, let the outbox drain, confirm both settle to server truth with **no** duplicate ledger row.

**Additionally per option:**
- **Option 1:** 🔴 **print a kitchen ticket while offline** and check it does not say PAID for a
  synthesised row; and check the dashboard's `confirmedPaid` counters.
- **Option 2:** confirm the **KDS** is unchanged (it should never see a queued create), and that an
  **online** order is byte-identical.
- **Option 3:** all of the above **on BOTH surfaces**, plus force a replay failure (a 409) and confirm
  the correct banner fires and the card reverts.

## D4. ✅ CAVEAT 5 OF THE EARLIER REPORT — **NOW CLOSED. The shape exists nowhere else.**

**Two independent sweeps, both READ:**

1. **`as unknown as Order` across `app/` and `components/`: exactly ONE occurrence** —
   `components/dashboard/AddOrderPanel.tsx:1131`, the object already fixed. **No other optimistic order
   object exists.**
2. **`kind: 'edit'` is NEVER ENQUEUED.** `OutboxKind` declares `'create' | 'status' | 'edit' | 'stock' | 'buzzer'`
   (`outbox.ts:67`), but a sweep of every `gatedAction` call site finds only **`'create'`**
   (`AddOrderPanel.tsx:1104`), **`'status'`** (`page.tsx:1797`, KDS), **`'stock'`** (`page.tsx:1998, 2005,
   2018, 2052, 2058`) and **`'buzzer'`** (`page.tsx:1524`, `kds:586`). 🔴 **`'edit'` is a declared kind
   with no producer — so there is no offline edit path to carry the same defect.**

**Every other `payment_status:` literal in the tree is SERVER-side and correct:**
`app/api/dashboard/action/route.ts:1470` and `app/api/orders/submit/route.ts:1029` insert the order row
`'unpaid'` **before** the ledger write, after which `recalcOrderPayment` derives the real value;
`app/api/orders/[id]/route.ts:107` reads with a fallback; `lib/seed-demo-orders.ts:324` is a seed.
✅ **None is a client-side assertion of paid-ness.**

---

# PART E — INTEGRITY

## E1. Byte-scan of every file opened — byte-level tool, never grep

| File | NUL | Ctrl < 0x09 | Other C0 |
|---|---|---|---|
| `lib/payments/ledger.ts` | 0 | 0 | 0 |
| `components/dashboard/OrderCard.tsx` | 0 | 0 | 0 |
| `app/dashboard/[token]/page.tsx` | 0 | 0 | 0 |
| `app/dashboard/[token]/kds/page.tsx` | 0 | 0 | 0 |
| `components/dashboard/AddOrderPanel.tsx` | 0 | 0 | 0 |
| `lib/native/orderGate.ts` | 0 | 0 | 0 |
| `lib/native/useOfflinePaymentOverlay.ts` | 0 | 0 | 0 |
| `lib/native/useOutboxConflicts.ts` | 0 | 0 | 0 |
| `lib/printing/mapOrderToTicket.ts` | 0 | 0 | 0 |
| `app/dev/ticket-preview/page.tsx` | 0 | 0 | 0 |
| `components/dashboard/types.ts` | 0 | 0 | 0 |
| `app/api/dashboard/route.ts` | 0 | 0 | 0 |

## E2. This report — separate post-write pass

*(Run after the file was on disk; result stated in the session output.)*

## E3. `git status` — nothing changed

```
 M app/(legal)/layout.tsx
 M app/contact/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/DayLoadStrip.tsx
 M components/shared/AppHeader.tsx
 M docs/reference-manual.md
 M ios/App/App.xcodeproj/project.pbxproj
 M ios/App/App/Info.plist
 M lib/plan-features.ts
 M package.json
?? components/shared/BrandHomeLink.tsx
?? docs/… (report files)
?? ios/App/App/PrivacyInfo.xcprivacy
```
🔴 **Identical to before this task.** `AddOrderPanel.tsx` is the PREVIOUS task's one-line fix. **This task
changed nothing and implemented none of the three options.**

---

# WHAT THIS APPRAISAL DOES NOT ESTABLISH

1. **Nothing was rendered or executed.** Every claim about what a card would show is read from source.
2. ⚠️ **I did not verify that `pendingPayment` behaves correctly for a queued CREATE** — no such entry
   has ever existed, so the path is reasoned, not observed. **INFERRED from `:283-285`.**
3. **I did not measure the poll interaction**: the overlay refreshes every 5s and `deviceQueuedOrders`
   prunes on `orders` changing. **Whether Option 2's derivation and that prune can transiently disagree
   is unverified.**
4. **I did not check the demo path** (`isDemo`) for either option.
5. ⚠️ **The printed-ticket consumer (A3) was read, not exercised.** That it would print PAID from a
   synthetic row is **INFERRED** from `mapOrderToTicket.ts:74`.
6. **No option was implemented, per the brief.**
