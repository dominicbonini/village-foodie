# Refunds — what actually exists

Date: 14 August 2026
**READ-ONLY INVESTIGATION. No edits, no commits, no builds, no deploys, no database writes, no Stripe
calls. No implementation proposed.**

**No span of the prompt arrived garbled. No instruction contradicted another** — but **two of the
brief's stated premises are contradicted by the code**, and that is the finding.

---

# 🔴 STOP — BOTH LOAD-BEARING PREMISES ARE FALSE

The brief opens: *"refunds were deferred during the payments workstream and have never been built or
specified"*, and states as context: *"HatchGrab takes an application fee."*

## 1. 🔴 REFUNDS ARE BUILT. END TO END. AND SPECIFIED IN EIGHT REPORTS.

**`lib/payments/refund.ts` — 14,856 bytes, last modified 13 August 2026. Its header, quoted:**
```
// lib/payments/refund.ts
// 🔴 THE ONE PLACE AN OPERATOR'S REFUND REACHES STRIPE. Every guard lives here, not in the UI.
//
// ── WHY THE GUARDS ARE HERE AND NOT ON THE CARD ────────────────────────────────────────────────────
// A form can be edited, replayed, or bypassed entirely by a POST. The amount that leaves this function
// is the amount that leaves the truck's bank, so the only figure that decides anything is one this
// module computed for itself, from sources the browser cannot touch.
```

**It calls Stripe. READ, `refund.ts:175-190`:**
```ts
    refund = await stripe.refunds.create(
      {
        payment_intent: refundable.paymentIntentId,
        amount: args.amountMinor,
        reason: stripeReasonFor(args.reason),
        metadata: {
          order_key: args.orderKey,
          truck_id: args.truckId,
          hatchgrab_reason: args.reason,
          ...(args.note ? { hatchgrab_note: args.note.slice(0, 400) } : {}),
        },
      },
      { stripeAccount: account, idempotencyKey },
    )
```

**And the specification the brief says does not exist — `docs/`:**
```
charge-refunded-report.md          refund-build-diagnosis-report.md   refund-build-report.md
refund-emails-report.md            refund-failed-report.md            refund-flow-report.md
refund-ui-report.md                reports-refunds-diagnosis.md
```
**Eight documents.** Plus `docs/authorised-not-captured-report.md`, `docs/unpay-card-order-report.md`
and others on adjacent paths.

## 2. 🔴 HATCHGRAB TAKES NO APPLICATION FEE. The code says so in two files; the manual says so in §44.

**`lib/payments/authorize.ts:23-26`:**
```
// ⚠️ `application_fee_amount`, `on_behalf_of` and `transfer_data` all exist on this call. NONE is sent,
// deliberately and unchanged from the Session version: this build charges no platform fee, and a fee
// must be a POSITIVE integer so "no fee" is expressed by ABSENCE, never by zero. Search this file for
// `application_fee` — there is none.
```
**`lib/payments/capture.ts:39-41`:**
```
// ── ⚠️ NO application_fee_amount ─────────────────────────────────────────────────────────────────
// The parameter is accepted at capture and is deliberately not sent. This build charges no platform
// fee, and a fee must be a positive integer, so "no fee" is absence. Search this file — there is none.
```
**And §44 of the manual:**
> *"🔴 **Walk-up card payments taken through HatchGrab via Stripe carry 0% PLATFORM FEE on every tier** —
> the same as the truck's own terminal. **Only Stripe's card fee applies.**"*

🔴 **A repo-wide search for `application_fee_amount` returns FOUR hits, all comments saying it is not
sent.** **There is no fee to reverse, so B2's question has no subject.**

## What this means for the task

**I have answered every question anyway**, because the answers are useful — but **A1-A4 and B1-B4 are
answers about a SHIPPED system, not a greenfield one**, and D2 (*"can refunds be specified before
authorize-then-capture lands"*) turns out to be moot in both directions: **both are built.**

⚠️ **This is the third time in two days a brief has been written from a belief about the codebase rather
than from the codebase.** §1 already records *a cross-reference is not provenance* and *a summary of a
report is not the report*. **This is the same family: a plan is not a fact about the tree.**

---

# PART A — WHAT EXISTS TODAY

## A1. The sweep — **NOT "none". Refund code is in 24 files.**

| File | `refund` hits | What it is |
|---|---|---|
| 🔴 `lib/payments/refund.ts` | **83** | `refundOrder`, `REFUND_REASONS`, `stripeReasonFor`, `RefundOutcome` |
| 🔴 `app/api/webhooks/stripe/route.ts` | **86** | Stripe's own refund events |
| 🔴 `app/dashboard/[token]/page.tsx` | **68** | `submitRefund`, wiring |
| `lib/payments/online.ts` | 52 | `recordOnlineCardRefund` |
| `lib/payments/ledger.ts` | 44 | `getOrderBalance` refund arithmetic, `reverseCollectionPayment` |
| `app/api/dashboard/action/route.ts` | 45 | the refund action |
| `lib/email.ts` | 41 | refund emails |
| `components/dashboard/PaymentActionsModal.tsx` | 36 | **the refund UI** |
| `components/dashboard/OrderCard.tsx` | 33 | the refunded chip + `onRefund` |
| plus | | `authorize.ts` 5 · `release-hold.ts` 4 · `kds/page.tsx` 4 · `ticket.ts` 3 · `supabase.ts` 2 · `capture.ts` 2 · and 8 more with 1 each |

**`void` / `chargeback` / `dispute`: NOT FOUND as implemented paths** — no dispute handling exists.
**That is a real gap, and it is a different one from the gap the brief assumed.**

## A2. ✅ THERE IS A REFUND UI — `components/dashboard/PaymentActionsModal.tsx`

```tsx
:36    export type RefundSubmit = (args: {
:124   const canRefund = !!onRefund && cardChargeMinor > 0 && refundableMinor > 0
:133   const res = await onRefund({ orderKey, amountMinor, reason, note: note.trim() })
:219   <h3 className="text-lg font-semibold text-slate-900">Refund order #{orderId}</h3>
:276   {busy ? 'Refunding…' : `Refund ${money(Math.max(0, Math.min(amountMinor, refundableMinor)))}`}
```
**Wired from `OrderCard.tsx:590` `onRefund={onRefund}`, supplied by the dashboard as `submitRefund`.**
✅ **Operator-authorised from the dashboard — exactly as the brief says was "decided". It was decided
AND built.**

⚠️ **`:149` carries a distinction worth quoting, because it is the kind of thing a fresh design would
miss:** *"'Refund sent' AND 'Refunded' ARE NOT THE SAME SENTENCE. Stripe accepts a refund on a Connect
[account]…"* — the pending-refund case is already handled in the copy.

## A3. 🔴 THE SCHEMA FORBIDS NEGATIVE AMOUNTS. `kind` carries the sign.

**READ, `supabase/migrations/20260729_order_payments_ledger.sql:54-83`:**
```sql
create table if not exists order_payments (
  id              uuid        primary key default gen_random_uuid(),
  order_key       uuid        not null references orders(order_key) on delete cascade,
  truck_id        text        not null references trucks(id) on delete cascade,
  kind            text        not null,
  channel         text        not null,
  -- ⚠️ INTEGER MINOR UNITS, ALWAYS POSITIVE. `kind` carries the sign.
  amount_minor    integer     not null,
  currency        text        not null default 'GBP',
  state           text        not null,
  external_ref    text,
  note            text,
  idempotency_key text,
  created_at      timestamptz not null default now(),
  created_by      text,
```
**The four CHECKs:**
```sql
  constraint order_payments_kind_chk    check (kind    in ('charge', 'refund')),
  constraint order_payments_channel_chk check (channel in ('online', 'in_person_stripe', 'in_person_other')),
  constraint order_payments_state_chk   check (state   in ('pending', 'succeeded', 'failed')),
  constraint order_payments_amount_positive_chk check (amount_minor > 0)
```

> ### 🔴 THE ANSWER THE BRIEF SAYS SHAPES EVERYTHING: **NO, it cannot hold a negative amount** — `amount_minor > 0` is a CHECK. **And it does not need to: `kind in ('charge','refund')` is already there.** The schema did not merely *anticipate* refunds; **it was designed around them from the first migration.**

## A4. ✅ `PaymentStatus` — **THREE refunded states**

**READ, `lib/payments/ledger.ts:65`:**
```ts
export type PaymentStatus = 'unpaid' | 'paid' | 'part_paid' | 'refunded' | 'part_refunded' | 'refund_due' | 'failed'
```
🔴 **`'refunded'`, `'part_refunded'` and `'refund_due'`.** And a migration exists to widen the DB CHECK
to match: `20260729_orders_payment_status_widen_check.sql`, plus
`20260817_orders_payment_status_part_refunded.sql`, which `ledger.ts` calls **deploy-coupled**.

---

# PART B — WHAT THE MONEY MODEL COMMITS US TO

## B1. Direct charges on the connected account — **and no fee**

`stripeAccountForTruck` resolves the connected account, and every Stripe call passes
`{ stripeAccount: account }` — including `refunds.create` (quoted in the headline). ✅ **Direct charges,
truck as merchant of record: confirmed.**

🔴 **The application fee is NOT applied**, quoted in the headline from `authorize.ts` and `capture.ts`.
**Absence, never zero — because Stripe requires a positive integer.**

## B2. 🔴 ON A REFUND, THE APPLICATION FEE IS A NON-QUESTION — **there is no fee**

**Our code expresses one intent and it is total: never send `application_fee_amount`.**
`refunds.create` accordingly sends **no `refund_application_fee`** and **no `reverse_transfer`** — a
search returns nothing.

⚠️ **INFERRED, from Stripe's documented behaviour rather than our code:** for a **direct charge** with an
application fee, a refund does **not** return the fee unless `refund_application_fee: true` is sent; the
platform keeps it and the connected account absorbs the whole refund. **That default is a real trap —
and it cannot bite us today, because there is no fee.**

🔴 **THE RISK IS FUTURE-TENSE AND WORTH RECORDING: the day a platform fee is introduced,
`lib/payments/refund.ts` becomes wrong in a way that costs the TRUCK money**, silently, on every refund.
**Whoever adds the fee must change the refund call in the same commit.**

## B3. ✅ PARTIAL REFUNDS ARE SUPPORTED — schema, resolver and UI

- **Schema:** `kind` + positive `amount_minor` means any number of partial refund rows.
- **Resolver:** `getOrderBalance` sums charges minus refunds and has a dedicated `'part_refunded'`
  branch (C3).
- **Stripe call:** `amount: args.amountMinor` — an explicit amount, not a full-refund shorthand.
- **UI:** `refundableMinor`, and `Refund ${money(Math.min(amountMinor, refundableMinor))}` — **an
  operator-entered amount, clamped.**

🔴 **AND THE REFUNDABLE FIGURE COMES FROM STRIPE, NOT OUR LEDGER**, which is the most considered decision
in the file — `refund.ts:9-16`:
> *"A PENDING refund (which a Connect direct charge produces whenever the connected account's balance is
> short) writes nothing at all until it settles. So a second refund issued during that window would be
> measured against a ledger that has not moved, and the two together could exceed the charge.
> `refunds.list` counts the pending one."*

## B4. Cash — 🔴 **CANNOT be refunded through Stripe, and the system already knows it**

**`channel` is a NOT NULL CHECK-constrained column: `'online' | 'in_person_stripe' | 'in_person_other'`.**
Cash at the hatch is `in_person_other` with `method: 'cash'`.

**The refund UI gates on card money only — `PaymentActionsModal.tsx:124`:**
```tsx
  const canRefund = !!onRefund && cardChargeMinor > 0 && refundableMinor > 0
```
✅ **A cash-only order cannot reach the refund button.** Giving cash back is **necessarily out of band** —
the operator opens the till.

⚠️ **BUT THE LEDGER HAS A SEPARATE MECHANISM FOR IT: `reverseCollectionPayment`** (`ledger.ts:698`),
which returns `'deleted' | 'refunded' | 'none'` and keys its choice on `external_ref`:
> *"The moment `external_ref` is set, money genuinely moved through a processor, the row has an external
> counterpart, and it must be reversed and never deleted… Deleting a row that represents no real-world
> event loses nothing."*
🔴 **So an in-system cash "undo" DELETES the row; a processor payment is REVERSED.** Two different
operations, deliberately, with an audit callback that must succeed before any delete happens.

---

# PART C — WHAT A REFUND TOUCHES (it already touches all of it)

## C1. Every consumer of ledger rows, and what a refund row does to each

| Consumer | file:line | With a refund row present |
|---|---|---|
| `OrderCard` chip + buttons | `OrderCard.tsx:225` | `status` becomes `'refunded'`/`'part_refunded'`; `:518` renders **"Refunded in full. Nothing to collect."**; `effectivePaid` is true so **"Collected" is offered, never "Mark paid"** |
| Dashboard `confirmedPaid` | `page.tsx:325` | explicitly counts `'refunded'` and `'part_refunded'` as settled |
| Dashboard balance readouts | `page.tsx:3357, 3376` | show the reduced figure |
| KDS card + balance | `kds/page.tsx:1389` | same shared resolver |
| 🔴 **Printed kitchen ticket** | `mapOrderToTicket.ts:74` | see C2 |
| `PaymentActionsModal` | `:51` | quotes `paidMinor` in the "Remove payment?" copy |
| **Server:** `readLedger`, `recalcOrderPayment`, `recordCollectionPayment`, the webhook, refunds | `ledger.ts`, `action/route.ts:1002`, `refund.ts:88` | all read from Postgres |

✅ **Every one of these already handles refunds** — the branches exist and are commented.

## C2. 🔴 THE PRINTED TICKET — and the answer is "nothing", for the truck that matters

**READ, `lib/printing/mapOrderToTicket.ts:76-81`:**
```ts
  // 🔴 showPaidStep FALSE ⇒ NO PAYMENT FIELDS AT ALL — not "unpaid". A truck without the paid step has no
  // concept of an unpaid order at handover… Pizzeria Gusto is exactly this truck.
  const paymentStatus = showPaidStep ? balance.status : undefined
  const balanceMinor = showPaidStep ? balance.balanceMinor : undefined
```
**With the paid step ON, the ticket carries `paymentStatus: 'refunded' | 'part_refunded'` and a
`balanceMinor` of zero or less** — so it prints a refunded state rather than PAID. **With it OFF, no
payment line is printed at all.**

⚠️ **A ticket is printed at ORDER time; a refund happens later.** **INFERRED: the realistic case is a
REPRINT after a refund, not a first print** — the ticket object supports `reprint` (`:128`). **Not
verified against a printer.**

## C3. `getOrderBalance` with a refund row — quoted

```ts
  const succeeded = (ledgerRows ?? []).filter(r => isLiveRow(r) && r.state === 'succeeded')
  const chargeMinor = succeeded.filter(r => r.kind === 'charge').reduce((s, r) => s + Math.round(r.amount_minor), 0)
  const refundMinor = succeeded.filter(r => r.kind === 'refund').reduce((s, r) => s + Math.round(r.amount_minor), 0)
  const paidMinor = chargeMinor - refundMinor
```
**and the branch order, which the file marks LOAD-BEARING:**
```ts
  if (paidMinor === 0 && hasRefundRow) status = 'refunded'
  else if (paidMinor === 0) status = 'unpaid'
  else if (paidMinor < 0) status = 'refund_due'
  else if (balanceMinor < 0) status = 'refund_due'
  else if (balanceMinor === 0) status = 'paid'
  else if (hasRefundRow) status = 'part_refunded'
  else status = 'part_paid'
```
🔴 **`'refunded'` is tested FIRST and keys on refund-row PRESENCE, never on the sum** — because
"charged then fully refunded" and "never paid" are the same arithmetic. **Reordering these two silently
reports every fully-refunded order as unpaid.**

## C4. 🔴 THE `balanceMinor <= 0` SHORT-CIRCUIT AND REFUNDS — **it protects, and it also hides**

**READ, `ledger.ts:630-634`:**
```ts
  if (before.balanceMinor <= 0) {
    const balance = await recalcOrderPayment(supabase, opts.orderKey)
    return { inserted: false, balance, chargedMinor: 0 }
  }
```
**A refund RAISES `balanceMinor` back above zero** (`balance = total − paid`, and a refund reduces
`paid`). ✅ **So after a refund the guard stops firing and "Mark paid" becomes offerable again — which
is correct: money is owed again.**

⚠️ **THE HAZARD IS THE OTHER DIRECTION AND IT IS THE 7 AUGUST SHAPE.** The guard returns
**success with `chargedMinor: 0`** and no error. `ledger.ts:345-352` records what that concealed:
> *"recordCollectionPayment short-circuited on its `balanceMinor <= 0` guard: no row written, NO ERROR
> RAISED, `chargedMinor: 0` returned as a success. Pizzeria Gusto recorded £0 for an afternoon of real
> collections with nothing anywhere reporting a fault."*
🔴 **Any refund work must not add a second silent-success path.** ⚠️ **`refundOrder` does NOT use this
guard — it returns explicit outcomes (`RefundOutcome`, `:66`) including `'failed'` with a detail.**

## C5. Reporting, exports and the payments cache

- **Cache:** `orders.payment_status` / `amount_paid` are **derived caches** written by
  `recalcOrderPayment`, which every refund path calls. `types.ts:64-66` says they *"must never be
  hand-written"*.
- **Reports:** `docs/reports-refunds-diagnosis.md` exists — 🔴 **so refunds in reporting have already
  been investigated once. Read it before touching reports.**
- **Exports:** **NOT FOUND** — no export path was located in this sweep.

---

# PART D — THE "UNFINISHED FOUNDATION"

## D1. 🔴 AUTHORIZE-THEN-CAPTURE IS **BUILT**, not incomplete

**The manual, §37 and the V11.10 changelog:**
> `:220` **### 🔴 AUTHORIZE-THEN-CAPTURE — BUILT**
> `:8314` **## 🔴 AUTHORIZE-THEN-CAPTURE — BUILT (V11.10)**
> `:209` *"Authorize-then-capture built end to end… hosted Checkout was replaced by an in-page Payment Element"*

⚠️ **The line the brief is probably remembering is `:291` — *"proven on our exact posture and NOT
BUILT"* — and `:6227`, the backlog entry. Both are SUPERSEDED by V11.10.** 🔴 **The manual contains both
the old claim and its correction, which is precisely the stale-restatement hazard §1 records.**

**And it is WIRED — `captureOnConfirmation` is called from five places:**
```
app/api/dashboard/action/route.ts:259   trigger: 'confirm'
app/api/dashboard/action/route.ts:1929  trigger: 'time_adjust'
app/api/orders/submit/route.ts:1078
lib/payments/promote-draft.ts:385
lib/payments/stranded-authorisations.ts:165
```
✅ **Plus `lib/payments/release-hold.ts` for cancellation, and `stranded-authorisations.ts` for the
sweeper.**

## D2. 🔴 THE QUESTION YOU MOST WANT ANSWERED — **it is moot, and here is the useful version**

**As asked** — *can refunds be specified before authorize-then-capture lands* — **the question has no
force: both are built, and they were built in the right order.** Capture landed in V11.10; the refund
module is dated 13 August, after it.

**The distinction the question is reaching for is real, though, and the code already draws it:**

| | Cancelling an authorisation | Refunding a capture |
|---|---|---|
| Stripe object | 🔴 **NO Refund object is created** — the manual (`:291`) records this as *measured*, not assumed | a `Refund` object |
| Our module | `lib/payments/release-hold.ts` | `lib/payments/refund.ts` |
| Ledger | **no charge row ever existed**, so nothing to reverse | a `kind:'refund'` row |
| Customer sees | a hold disappearing | money returning, 5-10 days |

✅ **They are different enough to need separate code, and they HAVE separate code.** 🔴 **So no work
would have to be undone — because none of it is pending.**

## D3. If an operator needs to give money back TODAY

✅ **They use the dashboard.** Open the order → the payment actions modal → choose a reason, an amount,
an optional note → **Refund**. It reaches Stripe through `refundOrder`, on the truck's connected
account, with an idempotency key and an audit row written for every outcome including pending.

⚠️ **Two caveats, both READ:**
1. **Card only.** `canRefund` requires `cardChargeMinor > 0` — **cash is out of band, by design (B4).**
2. **Never verified on a live key by this session.** ⚠️ `docs/refund-failed-report.md` exists, which
   suggests at least one failure has been investigated. **I did not read it.**

**The Stripe Dashboard is a fallback, not the only route.**

---

# PART E — RISK SURFACE

## E1. The four named risks, against what the code already does

| Risk | Prevented today? |
|---|---|
| **Double refund** | ✅ **YES, two ways.** An idempotency key derived from Stripe's own figure — `op_refund:${orderKey}:${refundable.refundedMinor}:${amountMinor}` — **so a replayed submit with the same state is a no-op**; and the refundable amount is re-read from `refunds.list`, which counts PENDING refunds our ledger cannot see |
| **Refund exceeding the charge** | ✅ **YES.** `refundableMinor` is computed server-side in `refundOrder`, and the UI clamps with `Math.min(amountMinor, refundableMinor)` — **but the server figure is the one that decides**, per the file's own opening rule |
| **Refund on an unsynced order** | ⚠️ **INFERRED, not verified.** An offline-created order has no `payment_intent` until it syncs, so `refundable.paymentIntentId` would be absent and the call could not be built. **I did not trace this path.** |
| **Refund while offline** | 🔴 **NOTHING PREVENTS THE ATTEMPT.** See E2 |

## E2. 🔴 OFFLINE — **there is no refund op kind, and that is a decision waiting to be made**

**READ, `lib/native/outbox.ts:67`:** `export type OutboxKind = 'create' | 'status' | 'edit' | 'stock' | 'buzzer'`
**No `'refund'`.** ⚠️ **And `'edit'` is declared with no producer**, so the outbox has one unused slot
already.

**The options and their failure directions — stated, not designed:**

| Option | Failure direction |
|---|---|
| **A. Refuse offline** — the button is disabled with an explanation | ⚠️ **The operator cannot refund at the hatch.** They tell the customer to wait, or open the till. **Fails toward "money not returned yet"** |
| **B. Queue it** — a new op kind, replayed on reconnect | 🔴 **Fails toward "money shown as returned that has not been"**, for an unbounded time. **And the amount was computed against a stale ledger** — B3's whole reason for asking Stripe |
| **C. Attempt, and surface the failure loudly** — the existing reactive path | ⚠️ Fails toward "the operator knows it did not happen", which is honest but leaves them stuck mid-service |

> 🔴 **AGAINST THE RULE THIS CODEBASE ALREADY ADOPTED — *on a money path, safe failure beats
> correctness* (§37) — OPTION B IS THE DANGEROUS ONE.** A queued refund tells an operator money went
> back when it has not, and the customer has already walked away. **A and C both fail toward the
> customer still being owed, which a human can see and fix.**
>
> **I am not choosing. That is the decision to take, and it is the one this section exists to frame.**

⚠️ **`refundOrder` reads Stripe before it writes** (B3), so it is **structurally un-queueable without
changing that rule** — the safety property and the offline capability are in direct tension.

## E3. Blast radius on Pizzeria Gusto

🔴 **Gusto is a LIVE CARD-TAKING TRUCK on a connected account, so any refund change touches real money
on a real balance.** But two facts limit it sharply:

1. ✅ **Gusto has `show_paid_step = true`** (live-verified earlier today), so it uses the payment surfaces
   — **it is exposed.**
2. ✅ **`mapOrderToTicket` prints no payment line for a truck with the paid step off** — **but Gusto is
   named in that comment as exactly such a truck** (`:79`), which **contradicts the live value I read**.
   ⚠️ **FLAGGED AS A DISCREPANCY I DID NOT RESOLVE:** the comment says Gusto has no paid step; the
   database says `show_paid_step = true`. **One of them is stale, and it decides whether refunds appear
   on Gusto's printed tickets.**

**Anything touching `getOrderBalance` reaches every surface at once** — card, KDS, ticket, reports —
because it is deliberately the single chokepoint.

---

# PART F — INTEGRITY

## F1. Byte-scan of every file opened — byte-level tool, never grep

| File | NUL | Ctrl < 0x09 | Other C0 |
|---|---|---|---|
| `lib/payments/refund.ts` | 0 | 0 | 0 |
| `lib/payments/ledger.ts` | 0 | 0 | 0 |
| `lib/payments/online.ts` | 0 | 0 | 0 |
| `lib/payments/capture.ts` | 0 | 0 | 0 |
| `lib/payments/authorize.ts` | 0 | 0 | 0 |
| `lib/printing/mapOrderToTicket.ts` | 0 | 0 | 0 |
| `components/dashboard/PaymentActionsModal.tsx` | 0 | 0 | 0 |
| `components/dashboard/OrderCard.tsx` | 0 | 0 | 0 |
| `app/dashboard/[token]/page.tsx` | 0 | 0 | 0 |
| `app/api/dashboard/action/route.ts` | 0 | 0 | 0 |
| `app/api/webhooks/stripe/route.ts` | 0 | 0 | 0 |
| `supabase/migrations/20260729_order_payments_ledger.sql` | 0 | 0 | 0 |
| `docs/reference-manual.md` | 0 | 0 | 0 |

## F2. This report — separate post-write pass

*(Run after the file was on disk; result stated in the session output.)*

## F3. `git status` — nothing changed

```
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/native/OfflineBanner.tsx
 M docs/reference-manual.md
?? docs/offline-messaging-report.md
?? docs/offline-order-number-report.md
```
✅ **All from the previous two tasks. This task changed nothing** — no edits, no database, no Stripe.

---

# WHAT I HAVE NOT ESTABLISHED

1. 🔴 **I did not read the eight existing refund reports.** **Anyone designing refund work should start
   there, not here** — `refund-build-report.md`, `refund-flow-report.md`, `refund-ui-report.md`,
   `refund-failed-report.md`, `refund-emails-report.md`, `refund-build-diagnosis-report.md`,
   `charge-refunded-report.md`, `reports-refunds-diagnosis.md`.
2. 🔴 **I did not establish whether refunds WORK** — only that they are built. `refund-failed-report.md`
   exists and I did not open it.
3. ⚠️ **The Gusto `show_paid_step` discrepancy in E3 is unresolved**, and it decides ticket behaviour.
4. **I did not trace the unsynced-order refund path** (E1, row 3) — INFERRED only.
5. **No dispute or chargeback handling was found**, and I did not look further than the sweep.
6. **No export path was found** for C5.
7. **No implementation was proposed, and no design decision was taken** — E2's options are framed, not
   chosen.
