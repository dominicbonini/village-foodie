# Recording cash versus card machine — what is already wired, and the one gap that is not

READ-ONLY DIAGNOSIS, THEN BUILD IF CONTAINED. 13 August 2026.

🔴 **NO SOURCE FILE WAS CHANGED, AND THAT IS THE FINDING.** Every path that offers the operator a cash/card choice **already records it**; every path that does not offer one **already writes NULL**, which is the honest value. There was no wiring to do. The one remaining gap needs a **new question in a flow that has none**, which this brief says to **propose, not build** — so §7 proposes it.

**No `next dev`, no `next build`, no commit, no deploy. No migration.** The only file written is this report.

---

## 1. EVERY PATH THAT WRITES AN IN-PERSON PAYMENT ROW

🔴 **There is exactly ONE writer** — `recordCollectionPayment` (`lib/payments/ledger.ts:619`), which hardcodes `channel: 'in_person_other'` — and it has **three** callers:

```
app/api/dashboard/action/route.ts:521   collected            → { orderKey, truckId, createdBy }            NO method
app/api/dashboard/action/route.ts:1663  manual (walk-up)     → { …, method: manualMethod }                  method passed
app/api/dashboard/action/route.ts:2210  mark_paid family     → { …, method }                                method passed
```

| Path | What it passes | Was the operator ASKED? |
|---|---|---|
| **`mark_paid_cash`** (💷 on the order card) | `'cash'` | ✅ **yes** — a distinct button |
| **`mark_paid_card`** (💳 on the order card) | `'card'` | ✅ **yes** — a distinct button |
| **`mark_paid`** (the single button, `takesCash` off) | `null` | ❌ no — one button, no question |
| **walk-up, 💷/💳** (`takesCash` on) | `'cash'` / `'card'` | ✅ **yes** — `paymentMethodRef` is set by the button |
| **walk-up, "Take payment"** (`takesCash` off) | 🔴 **explicitly `null`** — `paymentMethodRef.current = null` | ❌ no |
| **`collected`** — one-press "Mark paid & collected" | 🔴 **nothing at all** — the parameter is omitted | ❌ **no, and there is no way to say** |
| **"Record payment" repair** (completed list) and the KDS toast | fires bare `mark_paid` → `null` | ❌ no — a repair, not a till moment |
| **Offline replay** | the ACTION NAME carries it — `orderGate.ts:81` knows `mark_paid_cash` / `mark_paid_card` as distinct payment ops | ✅ inherits whatever was tapped |

**QUOTED — the server's mapping** (`action/route.ts:2205`):

```ts
      const method: 'cash' | 'card' | null =
        action === 'mark_paid_cash' ? 'cash'
        : action === 'mark_paid_card' ? 'card'
        : (body.method === 'cash' || body.method === 'card' ? body.method : null)
```

⚠️ **The `body.method` arm is DEAD.** `grep` across `app/` and `components/` finds **no client that sends it** — the action names carry the choice instead. Harmless, and worth knowing before someone relies on it.

---

## 2. WHERE 💷 / 💳 COME FROM, AND WHICH SETTINGS PRODUCE THEM

**QUOTED — the order card** (`OrderCard.tsx:402-410`), inside `completionBtn()`:

```tsx
    if (takesCash) {
      return (
        <>
          <Btn label="💷 Cash" colour="money" loading={isLoading('mark_paid_cash')}
            onClick={() => onAction('mark_paid_cash', order.order_key)} />
          <Btn label="💳 Card" colour="money" loading={isLoading('mark_paid_card')}
            onClick={() => onAction('mark_paid_card', order.order_key)} />
        </>
      )
    }
```

**QUOTED — the walk-up panel** (`AddOrderPanel.tsx:1382-1408`): `takesCash ? (💷 Cash / 💳 Card, each setting `paymentMethodRef`) : ("Take payment", setting it to `null`)`.

**The setting that produces them**, from `lib/payments/paid-step.ts`:

```
takesCash = event.takes_cash_override ?? truck.takes_cash ?? false
```

⚠️ **`??`, not `||`** — an explicit override of `false` is honoured rather than re-inheriting.

✅ **SO THE CHOICE, WHERE IT EXISTS, IS ALREADY RECORDED.** This is **not** a case of wiring a value that is being thrown away: both surfaces that ask, pass. **Live-verified in §Verification.**

⚠️ **And the reason most rows are NULL is visible in the settings, not the code.** `test-truck` reads **`takes_cash = false`** with no event override — so on that truck the buttons have never rendered, and every in-person payment was a single "Mark paid" tap with no question to answer. **That is the honest explanation for the bulk of the 165.**

---

## 3. WHAT `method` ACCEPTS

**A CHECK constraint**, quoted from `supabase/migrations/20260730_takes_cash_and_payment_method.sql:59-62`:

```sql
alter table order_payments drop constraint if exists order_payments_method_chk;
alter table order_payments
  add constraint order_payments_method_chk
  check (method is null or method in ('cash', 'card'));
```

✅ **Live-probed:** inserting `method: 'bitcoin'` returns *"new row for relation "order_payments" violates check constraint "order_payments_method_chk""*.

**And a type union**, `lib/payments/ledger.ts:64`: `export type PaymentMethod = 'cash' | 'card'`, with every writer taking `method?: PaymentMethod | null`.

⚠️ **The migration's own header already settled the questions this brief raises**, and is worth re-reading rather than re-deciding:

> *"NO BACKFILL, DELIBERATELY. `method` is left NULL on all existing rows. Inventing 'cash' or 'card' for a payment nobody recorded a method for would be fabricating a financial record. NULL means "not recorded", which is exactly what happened."*
>
> *"`method` AFFECTS NO ARITHMETIC… A method is a label on a money event, never a term in it."* · *"Nothing in the fee engine may ever read it."*

---

## 4. THE PATHS WITH NO CHOICE

| Path | What the operator would have to be asked | Reasonable mid-service? |
|---|---|---|
| 🔴 **One-press completion** ("Mark paid & collected") | cash or card, at the moment of handover | ✅ **Yes — and it is the one that matters.** See §7: it costs zero extra taps, because one button becomes two |
| **`mark_paid` on a `takesCash: false` truck** | nothing | ❌ **No.** The truck has said it does not distinguish. Asking would be friction for a fact it does not want |
| **Walk-up "Take payment"**, same setting | nothing | ❌ No, same reason |
| **"Record payment" repair** (completed list · KDS toast) | cash or card, **retrospectively** | ⚠️ **No.** It fires on an order whose money went missing from the record — often minutes or hours later, often not the person who took it. **A guess dressed as a question** |
| **Offline replay** | nothing | ❌ No — it replays what was already tapped |

🔴 **THE MECHANISM BEHIND THE ONE-PRESS GAP, QUOTED.** All three branches live in one function, and the one-press branch **returns before the split** (`OrderCard.tsx:375-402`):

```tsx
    if (effectivePaid || heldAuthorisation) {
      return <Btn label="Collected" … onClick={() => onAction('collected', order.order_key)} />
    }
    if (completionPresses === 'one') {
      return <Btn label="Mark paid & collected" … onClick={() => onAction('collected', order.order_key)} />
    }
    …
    if (takesCash) {
      return (<>💷 Cash / 💳 Card</>)
    }
```

🔴 **So on a truck with `takesCash` ON and `completionPresses === 'one'`, the cash/card split is UNREACHABLE.** The truck has explicitly said it distinguishes cash from a card machine, and the flow gives it no way to say. **Every such payment writes NULL, and no setting the operator can change will fix it.**

---

## 5. RECORDING THE METHOD WHERE THE CHOICE EXISTS

✅ **Already done, everywhere, before this turn. Nothing was wired, because nothing was unwired.**

Both choice-bearing surfaces pass the value; the server maps the action name to `method`; the offline outbox preserves the distinction by treating `mark_paid_cash` and `mark_paid_card` as separate ops. **Measured end to end in §Verification: `'cash'`, `'card'`, `'cash'`, `'card'` land exactly as tapped.**

🔴 **I did not add a question to any flow.** The brief forbids it without saying so first, and §7 says so first.

---

## 6. WHERE NO CHOICE EXISTS — WHAT I DID

**Nothing, deliberately, on every one of them.**

| Path | Left as | Why |
|---|---|---|
| One-press completion | 🔴 **NULL** | No question exists to answer. A default of `'cash'` would be **a fabricated fact in the money ledger** — precisely what the column's own migration refused |
| `mark_paid` on a `takesCash: false` truck | NULL | The truck has said the distinction is not one it makes |
| Walk-up "Take payment" | NULL — **and already explicit**, `paymentMethodRef.current = null` | The clearest of the set: the client states the absence rather than omitting it |
| "Record payment" repair | NULL | A retrospective repair; whoever presses it may not have taken the money |
| Offline replay | inherits | Nothing to decide |

⚠️ **`collected` omits the parameter rather than passing `null`.** Identical result — `method?: PaymentMethod | null` defaults to undefined and the column stays NULL. **Not worth a change, and stated so the next reader does not mistake it for an oversight.**

**And no existing row was touched.** The history stays NULL, as instructed and as the migration intended.

---

## 7. THE ONE FLOW THAT NEEDS A NEW CHOICE — PROPOSED, NOT BUILT

🔴 **THE ONE-PRESS COMPLETION ON A `takesCash: true` TRUCK.** That truck has already opted into the question; the flow simply cannot ask it.

**Where it would go:** `OrderCard.tsx`'s `completionBtn()`, the `completionPresses === 'one'` branch — replacing the single dark button with **the pattern ten lines below it**:

> **💷 Cash & collected** · **💳 Card & collected**

**What it costs an operator mid-service: nothing.** One tap either way, the same as today — one button becomes two, exactly as the two-press flow already does. No modal, no extra step, and §10's fast-tap rule is respected.

**What it would need:** two new action names (`collected_cash` / `collected_card`) so the pending state stays per button and the offline outbox can replay them faithfully — the same reasoning that produced `mark_paid_cash` / `mark_paid_card` — plus the `collected` handler passing the method through to the writer that already accepts it.

⚠️ **AND IT MUST STAY BEHIND `takesCash`.** *"A truck that only takes cash should not be asked every time"* — with the setting off, the branch renders exactly the single "Mark paid & collected" it does today. **A truck that does not distinguish is never asked.**

⚠️ **Two smaller ones, recorded and not proposed:** the retrospective "Record payment" repair (asking there invites a guess), and the dead `body.method` arm (harmless).

---

## 8. WHAT THE PAID MODAL SAYS NOW

✅ **It already has something better to say for new payments** — that shipped with the modal earlier today, and it reads the `method` these paths write:

| The row | The line |
|---|---|
| `online` / `card` | **"Paid online by card"** |
| `in_person_other` / **`cash`** | **"Paid in cash"** |
| `in_person_other` / **`card`** | **"Paid on your card machine"** |
| `in_person_other` / **NULL** | **"Paid in person"** + *"Cash or your card machine — not recorded"* |
| mixed | both lines, with their amounts |

🔴 **So the 165 historical rows still read "Paid in person — cash or your card machine, not recorded", and always will.** That is the correct and permanent answer for them: nothing knows what was handed over, and no backfill can invent it. **Every new payment taken through a 💷 or 💳 button reads the specific line instead** — including, today, on the walk-up panel and the two-press order card.

⚠️ **The improvement is therefore gated on the `takes_cash` SETTING, not on code.** `test-truck` has it **off**; until a truck turns it on, every new in-person row will keep reading NULL — honestly.

---

## VERIFICATION

Through the **real** `POST /api/dashboard/action` handler, against real rows. **No Stripe calls, no emails.**

```
test-truck settings: takes_cash=false  show_paid_step=true  completion_presses=two
event overrides:     takes_cash_override=null  show_paid_step_override=true
```

| Case | Action | Resulting row |
|---|---|---|
| **(a) Cash completion** | `mark_paid_cash` | `{"kind":"charge","channel":"in_person_other","method":"cash","amount_minor":600}` |
| **(b) Card-machine completion** | `mark_paid_card` | `{"kind":"charge","channel":"in_person_other","method":"card","amount_minor":700}` |
| **(c) One-press completion** | `collected` | 🔴 `{"kind":"charge","channel":"in_person_other","method":null,"amount_minor":800}` |
| **(d) Walk-up, 💷 Cash** | `manual`, `paymentMethod:'cash'` | `{"…","method":"cash","amount_minor":600}` |
| **(d) Walk-up, 💳 Card** | `manual`, `paymentMethod:'card'` | `{"…","method":"card","amount_minor":600}` |
| **(d) Walk-up, "Take payment"** (`takesCash` off) | `manual`, `paymentMethod:null` | `{"…","method":null,"amount_minor":600}` |

**Every write declared and cleaned up:** 6 synthetic `orders` rows (customer_name `Method Harness`), their `order_payments` rows and their audit rows — **all deleted**, verified `leftovers: 0`, including stragglers from two earlier harness attempts swept by a by-name pass. **No existing row was read-modified; `method` was not backfilled anywhere.**

⚠️ **What needs a browser:** that the 💷/💳 buttons render for a `takesCash: true` truck. The server side above proves what each button's action records.

---

## NON-ASCII CENSUS

**No source file was changed, so before equals after for every one of them:**

| File | Total | Distinct |
|---|---|---|
| `app/api/dashboard/action/route.ts` | 3218 | 15 |
| `components/dashboard/OrderCard.tsx` | 1545 | 31 |
| `components/dashboard/AddOrderPanel.tsx` | 2402 | 36 |
| `lib/payments/ledger.ts` | 1145 | 12 |
| `components/dashboard/PaymentActionsModal.tsx` | 317 | 9 |

`git status` confirms the working tree holds **only** `docs/reference-manual.md` (this session's earlier manual update) plus this report. **No file gained a character class, because no file changed.**

---

## FLAGS

- **Nothing in the prompt arrived garbled**, and no instruction contradicted another.
- 🔴 **The premise "fix it going forward" turns out to be already true for every flow that asks.** The build half of this turn is empty **on purpose** — inventing a change to have something to show would have meant either adding an unrequested question or writing a guess into the ledger.
- 🔴 **The one real gap is structural and invisible from the settings:** a `takesCash: true` truck using one-press completion can never record a method, because that branch returns before the split. §7 proposes the two-button fix and its zero-tap cost.
- ⚠️ **The dominant cause of the 165 NULLs is a SETTING, not a defect:** `test-truck` has `takes_cash = false`, so the buttons have never rendered there.
- ⚠️ **`body.method` has no sender** — a dead arm in the server's mapping.
