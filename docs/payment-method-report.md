# Payment method — read-only diagnosis

**READ-ONLY. Nothing was edited, created or deleted except this report.** No commit, no build, no
`next dev`, no `next build`, no `cap sync`, no deploy, no SQL, no database write. 🔴 **No `git stash`,
`checkout` or `restore` — the only git command run was `status`.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

⚠️ **YOUR MID-TURN MESSAGE IS FOLDED IN, NOT APPENDED.** *"It will need to differentiate between card
payments received online and payments where it's been marked paid meaning they've used their own
payment terminal. We assume they've used their own payment terminal as there's a cash option if they
want."* That is exactly Q7, and §7 answers it directly. **Recommending nothing, as instructed.**

---

# 🔴 THE HEADLINE: THE METHOD COLUMN ALREADY EXISTS, AND THE "NOT RECORDED" COPY IS NOT A STANCE

**`order_payments.method` is a live column — `text`, nullable, `CHECK (method is null or method in
('cash','card'))` — added by `20260730_takes_cash_and_payment_method.sql`.** ✅ **So this is NOT a
schema change.**

🔴 **AND THE STRING YOU QUOTED IS THE NULL FALLBACK, NOT A DECLARATION THAT THE PLATFORM CANNOT KNOW.**
The modal already prints the method **when there is one** — *"Paid in cash"*, *"Paid on your card
machine"* — and only says *"Paid in person / Cash or your card machine — not recorded"* when the row's
`method` is NULL. **It is describing a missing value, not a policy.**

**What IS recorded, in the migration's own words, and it is the opposite of a "we cannot know" stance:**

> ⚠️ **NO BACKFILL, DELIBERATELY.** `method` is left NULL on all existing rows. Inventing 'cash' or
> 'card' for a payment nobody recorded a method for would be fabricating a financial record. NULL means
> "not recorded", which is exactly what happened.

🔴 **THE DELIBERATE STANCE THAT DOES EXIST IS NARROWER THAN IT LOOKS: it is "do not fabricate a method
nobody was asked for", not "the method is unknowable".** It applies to a truck with the cash/card split
OFF, which is never asked the question. **Your requirement changes what the plain button MEANS — from
"not asked" to "asked and answered by the button's identity" — and that is a product decision, not a
data-model one.**

---

# Q1 — THE DATA MODEL

## ✅ THE FIELD EXISTS. IT IS ON THE LEDGER, NOT ON `orders`.

**READ — the migration, quoted where it defines the column:**

```sql
alter table order_payments add column if not exists method text;

alter table order_payments drop constraint if exists order_payments_method_chk;
alter table order_payments
  add constraint order_payments_method_chk
  check (method is null or method in ('cash', 'card'));
```

**READ — the type:**

```ts
export type PaymentMethod = 'cash' | 'card'
```

**READ — the column comment, which is the design statement:**

> 'HOW the money physically arrived: cash, or the operator's own card machine. NULL = not recorded
> (every row before the cash/card split, and every Stripe row, whose method is implicit in the
> channel). ORTHOGONAL TO channel: channel decides whether the 0.99% platform fee applies, method is
> for till reconciliation only. **The fee engine must never read this column.**'

🔴 **NOTHING ON `orders`.** There is no `payment_method` on the order row; the method lives only on the
ledger event, which is correct — one order can carry several charges with different methods.

## What each action writes, field by field

**READ — the single write path (`recordPaymentEvent`, reached by every one of them):**

```ts
  const { error } = await supabase.from('order_payments').insert({
    order_key: event.orderKey,
    truck_id: event.truckId,
    kind: event.kind,
    channel: event.channel,
    amount_minor: event.amountMinor,
    currency: event.currency ?? 'GBP',
    state: event.state ?? 'succeeded',
    external_ref: event.externalRef ?? null,
    note: event.note ?? null,
    idempotency_key: event.idempotencyKey ?? null,
    created_by: event.createdBy ?? null,
    method: event.method ?? null,
    livemode: event.livemode,
  })
```

| Action | `channel` | `kind` | `amount_minor` | `state` | `livemode` | 🔴 **`method`** | order row |
|---|---|---|---|---|---|---|---|
| `mark_paid` | `in_person_other` | charge | full outstanding balance | succeeded | **hardcoded true** | 🔴 **NULL** — unless `body.method` is sent | untouched |
| `mark_paid_cash` | `in_person_other` | charge | balance | succeeded | true | ✅ **`'cash'`** | untouched |
| `mark_paid_card` | `in_person_other` | charge | balance | succeeded | true | ✅ **`'card'`** | untouched |
| `collected` | `in_person_other` | charge | balance | succeeded | true | 🔴 **NULL, hardcoded — `body.method` is NOT read** | `status='collected'`, `status_before_collected` |
| `collected_cash` | `in_person_other` | charge | balance | succeeded | true | ✅ **`'cash'`** | same |
| `collected_card` | `in_person_other` | charge | balance | succeeded | true | ✅ **`'card'`** | same |

**READ — `mark_paid`'s method resolution, which already has a body escape hatch:**

```ts
      const method: 'cash' | 'card' | null =
        action === 'mark_paid_cash' ? 'cash'
        : action === 'mark_paid_card' ? 'card'
        : (body.method === 'cash' || body.method === 'card' ? body.method : null)
```

**READ — `collected`'s, which does NOT:**

```ts
      const collectMethod: 'cash' | 'card' | null =
        action === 'collected_cash' ? 'cash' : action === 'collected_card' ? 'card' : null
```

🔴 **AN ASYMMETRY WORTH NAMING: `mark_paid` honours `body.method`; `collected` cannot.** Its own comment
explains the intent — *"THE PLAIN NAME STAYS NULL … Defaulting it to 'cash' would be a fabricated fact
in the money ledger"* — but the two handlers enforce that intent differently, and only one of them
could satisfy your requirement without a code change.

# ✅ SO: THE METHOD **IS** PERSISTED TODAY. THE PLAIN BUTTONS SIMPLY DECLINE TO SET IT.

---

# Q2 — THE ACTIONS

## Six names, and they are identical on both surfaces

🔴 **THE BUTTONS ARE NOT PER-SURFACE. They are rendered by the SHARED `OrderCard`**, so the KDS and the
dashboard dispatch the same names from the same code:

```tsx
  const { takesCash, completionPresses } = resolvePaidStep(truck, event)
```

| Action | Rendered when | Label | Surface |
|---|---|---|---|
| `mark_paid` | 🔴 **`takesCash` FALSE**, two-press | `Mark paid` / `Mark £X.XX paid` | **both** |
| `mark_paid_cash` | ✅ `takesCash` TRUE, two-press | `💷 Cash` | **both** |
| `mark_paid_card` | ✅ `takesCash` TRUE, two-press | `💳 Card` | **both** |
| `collected` | 🔴 **`takesCash` FALSE**, one-press | `Mark paid & collected` | **both** |
| `collected_cash` | ✅ `takesCash` TRUE, one-press | `💷 Cash & collected` | **both** |
| `collected_card` | ✅ `takesCash` TRUE, one-press | `💳 Card & collected` | **both** |
| `collected` | already paid / card held | `Collected` — **books nothing** | **both** |
| `undo_mark_paid` · `undo_collected` | undo toasts + the remove-payment modal | — | **both** |

⚠️ **THE KDS AND THE DASHBOARD DIFFER ONLY DOWNSTREAM OF THE TAP** — the toast layer
(`useGatedActionResult`) is shared as of this session, and the KDS additionally hides the money chip
via `hidePayments` when its handover switch is off. **No payment action exists on one surface and not
the other.**

## 🔴 HAVE THE CASH/CARD VARIANTS EVER BEEN REACHABLE IN PRODUCTION? YES — AND AT LEAST ONE FIRED.

**READ — the resolver, and it is not truck-only:**

```ts
    takesCash: event?.takes_cash_override ?? truck?.takes_cash ?? false,
```

⚠️ **`takes_cash` being false on all thirteen trucks does NOT make the split unreachable.**
`truck_events.takes_cash_override` resolves FIRST, and it has its own migration and its own dashboard
control — *"the case this exists for is a card terminal failing mid-service"*. **A single event
override turns the split on for that event without touching any truck row.**

🔴 **AND THE CODE RECORDS THAT IT HAS FIRED AT LEAST ONCE:**

> **165 of 166 in-person rows in the live data carry NULL.**

**INFERRED from that count: one in-person row carries a non-NULL method**, so a cash or card button has
been pressed in production exactly once, or close to it. ⚠️ **NOT VERIFIED — that is a comment
recording someone else's query, and I ran no SQL.**

---

# Q3 — `recordCollectionPayment`

**READ, in full:**

```ts
export async function recordCollectionPayment(
  supabase: SupabaseClient,
  opts: { orderKey: string; truckId: string; createdBy?: string | null; method?: PaymentMethod | null },
): Promise<{ inserted: boolean; balance: OrderBalance; chargedMinor: number }> {
  const [order, rows] = await Promise.all([readOrder(supabase, opts.orderKey), readLedger(supabase, opts.orderKey)])
  const before = getOrderBalance(order, rows)

  if (before.balanceMinor <= 0) {
    const balance = await recalcOrderPayment(supabase, opts.orderKey)
    return { inserted: false, balance, chargedMinor: 0 }
  }

  const { inserted, balance } = await recordPaymentEvent(supabase, {
    orderKey: opts.orderKey,
    truckId: opts.truckId,
    kind: 'charge',
    channel: 'in_person_other',
    amountMinor: before.balanceMinor,
    state: 'succeeded',
    idempotencyKey: collectIdempotencyKey(opts.orderKey, before.paidMinor, before.balanceMinor),
    note: 'Mark paid & done — taken at the hatch',
    createdBy: opts.createdBy ?? null,
    method: opts.method ?? null,
    livemode: true,
  })
```

| Argument | Required | What it does |
|---|---|---|
| `supabase` | yes | client |
| `orderKey` | yes | the order |
| `truckId` | yes | ledger scope |
| `createdBy` | no | `created_by` — the actor |
| 🔴 **`method`** | **no** | ✅ **YES, A METHOD IS ALREADY AMONG THEM** — passed straight through to the column, defaulting to NULL |

**What it writes:** ONE `order_payments` charge row — `channel: 'in_person_other'` hardcoded,
`amount_minor` = the **outstanding balance only** (so it composes with a part-payment),
`state: 'succeeded'`, `livemode: true` hardcoded, the note, the actor, and the method. **It writes
nothing on `orders`.**

## 🔴 THE THREE-LAYER GUARD, AND WHETHER A METHOD WOULD DISTURB IT

| Layer | What it keys on | Would a method change it? |
|---|---|---|
| 1. **Balance-zero short-circuit** | `before.balanceMinor <= 0` | ✅ **No.** Arithmetic only — `method` is not a term in `getOrderBalance` |
| 2. **`idempotency_key`** — `collectIdempotencyKey(orderKey, paidMinor, balanceMinor)`, unique-constrained | order key + the two amounts. **The method is NOT in it** | ✅ **No.** ⚠️ **AND THAT IS A PROPERTY WORTH KEEPING: tapping `Cash` then `Card` on the same order collides on the key and books ONE row, not two.** A method in the key would make them two separate charges |
| 3. **Expected-vs-actual detector** | `!inserted && balance.balanceMinor === before.balanceMinor` | ✅ **No.** Amounts only |

# ✅ ADDING OR CHANGING A METHOD CHANGES NO KEY AND NO ARITHMETIC. The migration says so too: *"`method` AFFECTS NO ARITHMETIC … A method is a label on a money event, never a term in it."*

---

# Q4 — THE COPY, STRING BY STRING

| # | String | Where | Asserts / denies / silent |
|---|---|---|---|
| 1 | `Mark paid` · `Mark £X.XX paid` | card button, `takesCash` false | ⚪ **SILENT** |
| 2 | `Mark paid & collected` | card button, one-press | ⚪ **SILENT** |
| 3 | `Collected` | card button, already paid | ⚪ **SILENT** |
| 4 | `💷 Cash` · `💳 Card` | card buttons, `takesCash` true | ✅ **ASSERTS** |
| 5 | `💷 Cash & collected` · `💳 Card & collected` | one-press, `takesCash` true | ✅ **ASSERTS** |
| 6 | `Paid online by card` | PaymentActionsModal, `channel==='online'` | ✅ **ASSERTS — and asserts ONLINE specifically** |
| 7 | `Paid in cash` | modal, in-person + `method==='cash'` | ✅ **ASSERTS** |
| 8 | `Paid on your card machine` | modal, in-person + `method==='card'` | ✅ **ASSERTS — and distinguishes it from #6 in words** |
| 9 | 🔴 `Paid in person` + hint `Cash or your card machine — not recorded` | modal, in-person + method NULL or mixed | 🔴 **DENIES KNOWING** |
| 10 | `Order #N marked paid` | confirmation toast, `mark_paid` | ⚪ **SILENT** |
| 11 | `Order #N collected` | confirmation toast, every collect action | ⚪ **SILENT — including after `collected_cash`/`collected_card`** |
| 12 | `Undone — payment removed` | Undo toast, `undo_mark_paid` | ⚪ **SILENT** |
| 13 | `Undone — order not collected` | Undo toast, `undo_collected` | ⚪ **SILENT** |
| 14 | `PAID` chip | card header | ⚪ **SILENT** |
| 15 | `CARD HELD` — *"Card authorised — do not collect. Payment is taken when you confirm."* | card header, held authorisation | ✅ **ASSERTS card, and it is the ONLINE sense** |
| 16 | `Remove payment?` … *"only the payment record is removed"* | modal | ⚪ **SILENT** |
| 17 | `⚠️ Order #N — PAYMENT NOT RECORDED.` | failure toast | ⚪ silent on method — it is about the row not existing |

# 🔴 THE MODAL IS THE ONLY PLACE A METHOD IS EVER SPOKEN. Every button, every toast and every chip is silent — **including the confirmations that follow an explicit `💷 Cash` tap.**

⚠️ **So the second half of your requirement — "the confirmation and its Undo copy must name the method
that was recorded" — is unmet TODAY EVEN WHERE THE METHOD IS RECORDED.** Row 11 is the clearest case:
`collected_cash` books `method:'cash'` and then says only *"Order #N collected"*.

---

# Q5 — THE REMOVE-PAYMENT PATH

**READ — it routes to `reverseCollectionPayment`, whose contract is DELETE-or-REFUND:**

> DELETE when no real money moved; REVERSE when it did. Concretely: delete the row only when
> `external_ref is null` AND `state = 'succeeded'` AND `channel != 'online'`; otherwise insert a
> compensating refund.

**An in-person collect row satisfies all three, so `Remove payment` DELETES the row outright** — and
with it, the method. The delete is gated on an append-only audit write that captures the **full row**
first:

```ts
          beforeDelete: async (deletedRow) => {
            await logActionOrThrow(supabase, {
```

🔴 **IF A METHOD WERE RECORDED, REMOVING THE PAYMENT SHOULD DO NOTHING SPECIAL TO IT.** The row ceases
to exist, so there is no field left to null out; the method is preserved in `action_audit_log` as part
of the captured row. ⚠️ **The one case that differs is the REFUND arm** — an online or externally-
referenced charge is compensated rather than deleted, so the original row and its method survive and a
refund row is added beside it. **A refund row's own `method` is NULL today**, and nothing sets it.

---

# Q6 — DOWNSTREAM

## ✅ EXACTLY ONE CONSUMER READS `method` TODAY. EXECUTED — every occurrence in `app/`, `lib/`, `components/`:

| Site | What it does |
|---|---|
| `components/dashboard/PaymentActionsModal.tsx:115` | 🔴 **THE ONLY READER.** `new Set(inPerson.map(c => c.method))` → the three sentences in Q4 |
| `components/dashboard/OrderCard.tsx:331` | plumbing — maps ledger rows into the modal's `charges` prop |
| `app/dashboard/[token]/page.tsx:3551` | plumbing — the same mapping for the dashboard's mount |
| `lib/payments/ledger.ts:585, 646` | the two writers |
| `app/api/dashboard/action/route.ts:2273` | the `body.method` parse |

## What would want it if it were reliably recorded — named, not recommended

| Consumer | Reads it today | Would want it |
|---|---|---|
| **PaymentActionsModal** | ✅ **yes** | already built — it would simply stop falling back to *"not recorded"* |
| **Confirmation + Undo toasts** | ❌ no | 🔴 **your stated requirement** |
| **`action_audit_log`** | ⚠️ **PARTLY — `mark_paid` already logs `afterState: { …, method, … }`** | `collected` logs no method |
| **Till reconciliation / end-of-day takings** | ❌ **nothing exists** | 🔴 **the migration names this as the column's WHOLE PURPOSE** — *"It exists for till reconciliation, not for billing"* — **and no such report has been built** |
| **Stripe reconciliation / the 0.99% fee** | ❌ no | 🔴 **MUST NEVER** — *"The fee engine must never read this column"* |
| **Done-today strip** | ❌ no | possible |
| **Customer emails** | ❌ no | ⚠️ a customer knows how they paid; naming it back has no obvious value |
| **Printed tickets** | ❌ no — `mapOrderToTicket` does not read it | possible |
| **Exports** | — | ⚠️ **no CSV/export path reads `order_payments` at all** |

# 🔴 THE COLUMN'S STATED PURPOSE HAS NO CONSUMER. It was added for till reconciliation, and till reconciliation does not exist.

---

# Q7 — 🔴 THE STRIPE COLLISION. THE QUESTION YOU MOST WANT ANSWERED.

## ✅ "CARD" DOES MEAN TWO DIFFERENT THINGS — AND THE SCHEMA ALREADY SEPARATES THEM. NOT WITH `method`, WITH `channel`.

| | Online card (Stripe) | 🔴 **The operator's own terminal** |
|---|---|---|
| **`channel`** | 🔴 **`'online'`** | 🔴 **`'in_person_other'`** |
| **`method`** | ⚪ **NULL** — *"implicit in the channel"* | ✅ **`'card'`** |
| written by | `recordOnlineCardPayment` (`lib/payments/online.ts:105,159`) | `recordCollectionPayment` |
| `external_ref` | the Stripe id | NULL |
| `livemode` | 🔴 **from the Stripe event** | 🔴 **hardcoded `true`** |
| platform fee / allowance | ✅ **counts** | ❌ **zero fee, outside the allowance** |
| operator pressed a button? | ❌ **no — `effectivePaid` before anything is tapped** | ✅ yes |
| reaches `mark_paid`? | 🔴 **NO — the route 409s** on a held authorisation | yes |

**READ — the migration is explicit that these are separate axes:**

> `channel` answers ONE question: *does the 0.99% platform fee apply…?* Cash and the operator's own PDQ
> are IDENTICAL on that axis — both `in_person_other`, both zero fee… `method` is a SEPARATE, ORTHOGONAL
> axis: *what did the customer physically hand over?*

**READ — the button comment says the same thing in product terms:**

> 🔴 **"CARD" MEANS THE TRUCK'S OWN CARD MACHINE, NEVER AN ONLINE PAYMENT.** … An online card payment
> is a different channel entirely and **never reaches this button**.

# ✅ SO: ONE FIELD IS NOT BEING ASKED TO CARRY BOTH. TWO ORTHOGONAL FIELDS ALREADY DO, AND THE UI ALREADY SPEAKS THEM AS DIFFERENT SENTENCES — *"Paid online by card"* VERSUS *"Paid on your card machine"*.

⚠️ **AND THE TWO CANNOT COLLIDE ON ONE ORDER BY ACCIDENT.** A live card hold makes `mark_paid` return
**409** — *"This customer has already paid by card… taking payment here would charge them twice"* —
after the 12 August double-charge of orders 18 and 19. **An online-paid order cannot also be
marked paid on the terminal.** ⚠️ **A mixed order is still possible and is real** — the modal's comment
records *"3 orders in the live data have charges on both channels"* — and it prints **both lines with
their amounts** rather than picking one.

## 🔴 WHAT YOUR MID-TURN MESSAGE ASKS FOR, MEASURED AGAINST THAT

*"We assume they've used their own payment terminal as there's a cash option if they want."*

✅ **The assumption is expressible with no new value and no schema change**: plain `Mark paid` would
write `channel: 'in_person_other'` (unchanged) with `method: 'card'` (today NULL). **It cannot be
confused with online** because the channel differs, the modal already words them differently, and the
409 keeps them off the same order.

🔴 **BUT THE ASSUMPTION'S SAFETY DEPENDS ON A CONDITION THAT IS FALSE ON EVERY TRUCK TODAY.** *"There's
a cash option if they want"* is true **only when `takesCash` is on** — and `trucks.takes_cash` is
false on all thirteen, with the split reachable only via a per-event override. **On a truck with the
split off there is no cash button, so a cash sale is taken on the one plain button, which would then
record `card`.** That is a fabricated fact of exactly the kind the migration's no-backfill note
refuses. ⚠️ **STATED, NOT DECIDED — the fix could be gating the assumption on `takesCash`, or turning
the split on, or accepting the inaccuracy. All three are yours to choose.**

---

# Q8 — WHAT IT WOULD TAKE

✅ **NOT a migration. NOT a rethink of the model. NOT a new column.** The field, its CHECK, its type,
its writer argument and its one reader all exist and are live.

**The requirement has three parts, and they cost different things:**

## Part A — the plain buttons record `card`

| Option | Touches | Notes |
|---|---|---|
| **A1 — client sends `method`** | `OrderCard` only: `onAction('mark_paid', key, { method: 'card' })` | ✅ `mark_paid` **already honours `body.method`.** 🔴 **`collected` does NOT** — it hardcodes NULL — so a one-press truck is not covered |
| **A2 — server defaults the plain names** | `route.ts`, the two method resolvers | Covers both actions and every caller at once, including offline replays of bodies already queued. 🔴 **Reverses a decision written in a comment at each site** |
| **A3 — new action names** (`mark_paid_terminal`) | client + server + `orderGate`'s three sets | Most explicit, most surface |
| **A4 — backfill** | 🔴 SQL | ⚠️ **Refused in writing by the migration.** Named for completeness only |

⚠️ **A1 AND A2 DIFFER OFFLINE.** The outbox posts `op.body` verbatim, so under A1 an op queued today
replays without a method; under A2 the server supplies it at drain time.

## Part B — the copy names the method

**Toasts 10 and 11 are silent even after an explicit Cash tap.** The action name is already in
`useGatedActionResult`'s scope, so this is a copy change in the shared handler — **and it lands on both
surfaces at once, which the post-gate extraction earlier this session is what makes possible.**
⚠️ **The Undo toasts (12, 13) name no method and would need the same treatment.**

## Part C — the modal's fallback stops firing

**No work.** String 9 disappears by itself once rows carry a method; it remains correct for the 165
historical rows, which is what it was written for.

## What a rethink WOULD be needed for, if you want it

- 🔴 **`collected`'s inability to accept a body method** — an inconsistency between two handlers that
  otherwise share a purpose.
- 🔴 **The `takesCash`-off honesty problem in §7** — the one genuine product question here.
- ⚠️ **Refund rows carry no method**, so a refunded cash sale has a charge that knows and a refund
  that does not.
- ⚠️ **The column has no consumer for its stated purpose.** Till reconciliation does not exist.

**RECOMMENDING NOTHING.**

---

# 🔴 VERIFICATION

| Claim | Method |
|---|---|
| `order_payments.method` exists with a CHECK of `('cash','card')` | ✅ **READ** — the migration quoted. ⚠️ **NOT verified as APPLIED in production — that needs SQL, which is forbidden here** |
| Nothing equivalent on `orders` | ✅ **EXECUTED** — repo-wide search |
| What each of the six actions writes | ✅ **READ** — both handlers and the single insert quoted |
| `mark_paid` honours `body.method`; `collected` does not | ✅ **READ** — both resolvers quoted |
| `method` is an argument of `recordCollectionPayment` | ✅ **READ** |
| No idempotency key or arithmetic reads it | ✅ **READ** — the key is order key + two amounts |
| The modal is the only reader | ✅ **EXECUTED** — every `.method` occurrence enumerated |
| Online vs own-terminal are separated by `channel` | ✅ **READ** — both writers, the migration and the button comment agree |
| `takes_cash_override` makes the split reachable per event | ✅ **READ** — the resolver quoted |
| **165 of 166 live rows carry NULL** | 🔴 **NOT VERIFIED — a code comment recording someone else's query.** No SQL was run |
| **`takes_cash` false on all thirteen trucks** | 🔴 **CARRIED FROM V11.23, NOT RE-CHECKED.** No SQL was run |
| That the "not recorded" copy is a NULL fallback rather than a policy | ✅ **READ** — the branch above it prints the method when present |

🔴 **NOTHING WAS OBSERVED RUNNING. No query was run, no button was pressed, no device was touched.**

---

# INTEGRITY

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool (Python over `open(…,'rb')`), never grep. A SEPARATE pass over this report AFTER
writing. It is the only file this task wrote.**

```
  docs/payment-method-report.md   (SEPARATE PASS)   26,662 bytes
  NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
TOTAL OFFENDING: 0
```

## 🔴 Carrier-aware variation-selector check, PER EMOJI-PRESENTATION BASE

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+1F534 🔴 | 48 | 0 | 48 |
| U+2705 ✅ | 49 | 0 | 49 |
| **U+26A0 ⚠️** | **25** | **25** | ✅ **0** |
| U+1F4B7 💷 | 6 | 0 | 6 |
| U+1F4B3 💳 | 5 | 0 | 5 |
| U+26AA ⚪ | 12 | 0 | 12 |

# ✅ EVERY WARNING SIGN IS PAIRED — 25 OF 25, ZERO BARE.

`U+1F534`, `U+2705`, `U+1F4B7`, `U+1F4B3` and `U+26AA` have **emoji presentation by default** and need
no selector — bare is correct for all five. **`U+26A0` is the one base here with text presentation by
default.** ✅ **The report's total `U+FE0F` count is 25, which exactly accounts for the 25
paired warning signs and leaves none attached to any other base.** ⚠️ **One bare `⚠️` appears inside a
verbatim quote of the product's own toast copy (`⚠️ Order #N — PAYMENT NOT RECORDED`), which the source
writes bare** — it is quoted here with the selector rather than misquoted, and that choice is stated so
the count is not read as a source claim.

## `git status --porcelain`

```
 M app/dashboard/[token]/kds/page.tsx
 M docs/reference-manual.md
?? docs/kds-event-isolation-fix-report.md
?? docs/kds-event-isolation-report.md
?? docs/kds-header-group-report.md
?? docs/kds-header-tidy-report.md
?? docs/payment-method-report.md
```

**Which entries were already there before this pass began:**

| Entry | Pre-existing? |
|---|---|
| 🔴 **`?? docs/payment-method-report.md`** | 🔴 **THIS PASS — the only new entry, and the only file written** |
| `M app/dashboard/[token]/kds/page.tsx` | ✅ pre-existing — the event-isolation, header-tidy and header-group tasks |
| `M docs/reference-manual.md` | ✅ pre-existing — the V11.24 update |
| `?? docs/kds-event-isolation-report.md` · `?? docs/kds-event-isolation-fix-report.md` · `?? docs/kds-header-tidy-report.md` · `?? docs/kds-header-group-report.md` | ✅ pre-existing — the four preceding tasks' reports |
