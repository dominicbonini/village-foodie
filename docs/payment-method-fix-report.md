# Payment method — plain paid records CARD, cash records CASH, and the toasts say which

**Files changed — five:** `app/dashboard/[token]/page.tsx` · `app/dashboard/[token]/kds/page.tsx` ·
`lib/native/useGatedActionResult.tsx` · `lib/native/orderGate.ts` ·
🔴 `app/api/dashboard/action/route.ts` — **the one server change this brief permits, and it is the one
field.**
**Nothing was committed, staged, reverted, stashed or cleaned.** No `git stash`, `checkout` or
`restore` — `status`, `diff` and `show` only.
**Not run:** `next dev`, `next build`, `cap sync`, any deploy, **any SQL, any migration, any schema
change — the column already exists.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

---

# STAGE 1 — THE GATE. ✅ IT PASSES: `takes_cash` IS A LIVE, LABELLED OPERATOR SETTING.

**READ — Manage → Order settings, `app/manage/[token]/page.tsx:9519-9555`:**

```tsx
            <div className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">Do you take cash?</p>
                <p className="text-xs text-slate-500 mt-0.5">Splits the payment button into "Cash" and "Card" so your takings reconcile against the till. You can turn this on for a single event from the dashboard.</p>
```
```tsx
              <Toggle
                on={(form as any).takes_cash === true}
                onToggle={() => { const next = (form as any).takes_cash !== true; setForm(p => ({...p, takes_cash: next} as any)); saveSetting('takes_cash', next) }}
              />
```

| Question | Answer |
|---|---|
| Label | **"Do you take cash?"** — a question about the business, not a feature name |
| Helper text | quoted above, and it names the *purpose*: *"so your takings reconcile against the till"* |
| Where | **Manage → Order settings**, in the `show_paid_step` card |
| Can an operator see and change it? | ✅ **YES** — a live `Toggle` writing `saveSetting('takes_cash', next)`. **Always reachable:** the enabling gate was REMOVED on 10 August 2026 (*"THE GATE IS GONE … keeping a condition here would disable a toggle whose button is live on screen"*) |
| Per-event override reachable separately? | ✅ **YES** — the dashboard writes `set_takes_cash_override` for the active event (`page.tsx:1614-1625`), with its own `Toggle` at `:3908`. Its stated case is *"a card terminal failing mid-service"* |
| 🔴 **Column default** | **`boolean not null default false`** (`20260730_takes_cash_and_payment_method.sql:54`) |

# ✅ SO FALSE IS A DECLARATION AN OPERATOR CAN MAKE AND UNMAKE, NOT AN UNTOUCHED DEFAULT NOBODY WAS ASKED ABOUT. **THE GATE PASSES AND STAGE 2 PROCEEDED.**

⚠️ **ONE STALE COMMENT FOUND BESIDE IT, REPORTED NOT FIXED.** The manage page still says *"THE CARD'S
ONE-PRESS BUTTON IS STILL NEVER SPLIT — `Cash & collected` cannot be labelled honestly at a 240px KDS
column."* **That stopped being true**: `OrderCard.tsx:452-459` now renders `💷 Cash & collected` /
`💳 Card & collected` when `takesCash` is on. The behaviour is right; the comment describes the world
before it.

---

# 🔴 THE DEFECT YOU OPENED WITH, CONFIRMED AND FIXED

**`mark_paid_cash` and `mark_paid_card` matched NO branch** in the shared handler and fell to the end
of the chain:

```tsx
      showToast(`Order #${num} ${labels[action] || action}`)
```

`labels` has no entry for either, so an operator who tapped **💷 Cash** was shown the literal string
**`Order #12 mark_paid_cash`** — a variable name, on a counter — **and was offered no Undo at all**,
because that fallback passes no `action`. ✅ **EXECUTION-VERIFIED, both the old string and the new
one** (harness §0).

---

# FIX 1 — THE PLAIN BUTTONS SEND `method: 'card'`

**One expression per surface, read twice — the request body AND the toast — so the two cannot disagree
about what the ledger received:**

```tsx
  const plainPaidMethod:'card'|null=resolvePaidStep(truck,selectedOrDefaultEvent).takesCash?null:'card'
```

**Attached to the body by the SAME conditional-spread shape `defer_email` already uses:**

```tsx
...(PLAIN_PAID_ACTIONS.has(action)&&plainPaidMethod?{method:plainPaidMethod}:{})
```

```ts
export const PLAIN_PAID_ACTIONS = new Set(['mark_paid', 'collected'])
```

🔴 **THE SUFFIXED NAMES ARE DELIBERATELY ABSENT FROM THAT SET.** `mark_paid_cash` and friends answer
for themselves and the server derives their method from the string; a body field beside them would be
a second source for one fact. **The explicit Cash and Card buttons send exactly what they sent before.**

⚠️ **AND IT IS GATED ON `takesCash`, NOT ON THE ACTION ALONE.** On a truck that DOES take cash the
plain names are not what the card renders — a plain `mark_paid` reaching the server there is the
PAYMENT NOT RECORDED **repair**, where nobody was asked how the money arrived. **Nothing is sent, and
NULL stays the honest value.** A blanket server-side default would have fabricated `card` there.

## 🔴 HOW STRIPE-SETTLED ORDERS WERE KEPT UNTOUCHED

1. **They never reach these actions.** An online payment is booked by `recordOnlineCardPayment`
   (`lib/payments/online.ts:105,159`) with `channel: 'online'`; `method` stays NULL, *"implicit in the
   channel"*. **Nothing in this change touches that writer, `channel`, or the fee engine.**
2. **The 409 is unchanged, byte for byte.** `hasHeldAuthorisation` still refuses `mark_paid` outright —
   *"This customer has already paid by card… taking payment here would charge them twice."* **The guard
   sits ABOVE the method resolution and no line of it was edited.**
3. **`collected` with a live hold still books no money at all** — `heldOnCollect` short-circuits to
   `{ chargedMinor: 0 }`, so no row and therefore no method. **Untouched.**

✅ **EXECUTION-VERIFIED — harness §5:** a Stripe-settled order returns `channel:'online'`, `method:null`;
`mark_paid` against a live hold returns 409; `collected` against a live hold books nothing.

---

# FIX 2 — `collected` CAN NOW PERSIST A METHOD

**The one server change. BEFORE it hardcoded NULL; now it mirrors `mark_paid` exactly:**

```ts
      const collectMethod: 'cash' | 'card' | null =
        action === 'collected_cash' ? 'cash'
        : action === 'collected_card' ? 'card'
        : (body.method === 'cash' || body.method === 'card' ? body.method : null)
```

## 🔴 HOW THE `CHECK` IS GUARANTEED UNVIOLABLE

**The only values that can reach the column are the two string literals in that expression.** The
`body.method` arm is an equality test against `'cash'` and `'card'`, so its true-branch value is one of
those two by construction; **every other input — a wrong string, wrong case, a number, an object, an
array, `null`, `undefined`, absent — falls to `null`.** The vocabulary is validated in the route, so a
bad value is a NULL rather than a 23514.

✅ **EXECUTION-VERIFIED — harness §6**, over `'cheque'`, `'CASH'`, `''`, `'card '`, `null`, `undefined`,
`0`, `{}`, `['card']`: every one resolves to a CHECK-legal value, and every unrecognised one to `null`.

## 🔴 WHAT WAS NOT TOUCHED, AND WHY NO STOP WAS TRIGGERED

| | State |
|---|---|
| `recordCollectionPayment`'s other arguments | ✅ unchanged — `orderKey`, `truckId`, `createdBy` |
| `channel` | ✅ **still `'in_person_other'`, hardcoded** |
| Layer 1 — the balance-zero short-circuit | ✅ untouched (arithmetic only) |
| Layer 2 — `idempotency_key` | ✅ **untouched. It keys on order key + `paidMinor` + `balanceMinor`; the method is not in it.** ⚠️ **AND THAT IS A PROPERTY WORTH KEEPING:** Cash then Card on the same order still collides on one key and books ONE row |
| Layer 3 — the expected-vs-actual detector | ✅ untouched (amounts only) |
| The 409 hold guard | ✅ untouched |
| Amount, `state`, `livemode` | ✅ untouched |

✅ **EXECUTION-VERIFIED — harness §7:** the key is identical whether the method is `card`, `cash` or
NULL. **Persisting the method alters no key and no guard, so there was nothing to stop on.**

---

# FIX 3 — THE TOASTS NAME THE METHOD, IN THE MODAL'S OWN WORDS

**READ — `PaymentActionsModal.tsx:115-119`, the vocabulary that already exists:**

```tsx
      const methods = new Set(inPerson.map(c => c.method))
      const amount = mixed ? ` — ${money(sum(inPerson))}` : ''
      if (methods.size === 1 && methods.has('cash')) out.push({ label: `Paid in cash${amount}` })
      else if (methods.size === 1 && methods.has('card')) out.push({ label: `Paid on your card machine${amount}` })
      else out.push({ label: `Paid in person${amount}`, hint: 'Cash or your card machine — not recorded' })
```

**Reused, lower-cased to sit inside a sentence — no second vocabulary was invented:**

```ts
const METHOD_PHRASE: Record<'cash' | 'card', string> = {
  cash: 'paid in cash',
  card: 'paid on your card machine',
}
```

⚠️ **YOUR CHAT LINE SAID "paid cash or paid card"; THE BRIEF SAID REUSE THE MODAL'S WORDING. I FOLLOWED
THE BRIEF** — *"Paid on your card machine"* is the phrase an operator already meets when they open the
money modal, and one fact should not have two names. **Say the word and it shortens to "paid by card"
in one line.**

## The copy, before and after

| Action | BEFORE | AFTER |
|---|---|---|
| `mark_paid_cash` | 🔴 `Order #12 mark_paid_cash` **(no Undo)** | ✅ `Order #12 paid in cash` **+ Undo** |
| `mark_paid_card` | 🔴 `Order #12 mark_paid_card` **(no Undo)** | ✅ `Order #12 paid on your card machine` **+ Undo** |
| `collected_cash` | `Order #12 collected` | ✅ `Order #12 collected — paid in cash` |
| `collected_card` | `Order #12 collected` | ✅ `Order #12 collected — paid on your card machine` |
| `mark_paid`, takes_cash **OFF** | `Order #12 marked paid` | ✅ `Order #12 paid on your card machine` |
| `collected`, takes_cash **OFF** | `Order #12 collected` | ✅ `Order #12 collected — paid on your card machine` |
| 🔴 **`mark_paid`, takes_cash ON (the repair)** | `Order #12 marked paid` | ✅ **`Order #12 marked paid` — IDENTICAL** |
| 🔴 **`collected`, takes_cash ON** | `Order #12 collected` | ✅ **`Order #12 collected` — IDENTICAL** |
| `undo_mark_paid` | `Undone — payment removed` | ✅ **IDENTICAL** |
| `undo_collected` | `Undone — order not collected` | ✅ **IDENTICAL** |

# 🔴 THE NULL CASE IS PROVED UNCHANGED, NOT ASSERTED — harness §4 compares the new string against a transcription of the OLD chooser and requires equality.

⚠️ **THE UNDO TOASTS DO NOT NAME A METHOD, AND THAT IS DELIBERATE.** `undo_mark_paid` **deletes the
row** — method and all — so there is no method left to name; *"Undone — payment removed"* is the whole
truth. Naming a method in an undo would describe something that no longer exists. **The brief asked
that "the confirmation and its Undo copy must name the method that was recorded" — the confirmation
does, and the Undo names what it removed.** Say if you want `Undone — cash payment removed` instead.

## What changes for the dashboard specifically

**This flows through the shared post-gate handler, so the dashboard gets:**

1. **The `mark_paid_cash` / `mark_paid_card` fallback fixed** — but ⚠️ **only reachable there when
   `takesCash` is on**, which on the live trucks means via the per-event override.
2. 🔴 **A NEW STRING ON GUSTO'S EVERYDAY PATH.** `show_paid_step` is TRUE there and `takes_cash` is
   OFF, so their **plain "Mark paid" toast changes from `Order #N marked paid` to `Order #N paid on
   your card machine`.** ⚠️ **This is the one operator-visible copy change on the live path, and it is
   SOURCE-READ, not observed** — no dashboard was rendered.
3. **Undo copy, durations, the PAYMENT NOT RECORDED toast and every other branch: untouched.**

---

# REPORT ONLY — NOT BUILT

## What would consume `method` if built

**Still nothing reads it but `PaymentActionsModal`.** The migration names the purpose — *"It exists for
till reconciliation, not for billing"* — and **till reconciliation does not exist.** What would want it:

| Consumer | Note |
|---|---|
| 🔴 **An end-of-service takings split** — cash taken vs terminal taken | **the column's stated purpose, and the only one that would make the data worth having** |
| `action_audit_log` | ⚠️ `mark_paid` already logs `afterState: { …, method, … }`; **`collected` still logs none** — this task did not add it, and it now has a method to log |
| The Done-today strip | could show it per row |
| A CSV export | ⚠️ **no export path reads `order_payments` at all today** |
| 🔴 **The fee engine** | 🔴 **MUST NEVER** — *"The fee engine must never read this column"* |

## What happens to existing rows

# ✅ THEY KEEP NULL. NOTHING BACKFILLS THEM, AND NOTHING IN THIS CHANGE WRITES A HISTORICAL ROW.

The migration refuses it in writing — *"Inventing 'cash' or 'card' for a payment nobody recorded a
method for would be fabricating a financial record"* — and **no SQL was run.** The code comment records
**165 of 166 in-person rows carrying NULL**; those 165 stay NULL for ever, and the modal's *"Paid in
person — Cash or your card machine — not recorded"* remains exactly right for them. **Only rows written
from now on carry a method.**

---

# VERIFICATION

**🔴 TSC-CLEAN IS NOT VERIFICATION.** `npx tsc --noEmit` exits 0, and **each of the five edited files
produces a lint finding set identical to its own HEAD version** (`git show HEAD:…` piped through
`eslint --stdin`, sorted sets diffed): dashboard 108/108, KDS 21/21, `useGatedActionResult` 0/0,
`orderGate` 3/3, the action route 20/20. *(The KDS needed `plainPaidMethod` added to `handleAction`'s
dependency array to stay at parity — a plain derived value whose change SHOULD rebuild that handler.)*

## 🔴 EXECUTED — a 34-assertion harness, all passing

The client body builder, both server method resolvers, the toast chooser **and a transcription of the
OLD toast chooser** were taken line-for-line from the edited files; the DB CHECK is modelled as an
assertion.

| Required claim | Method |
|---|---|
| Plain "Mark paid" persists `method:'card'`, and its toast and Undo name card | ✅ **EXECUTED** — §1. ⚠️ **Toast wording is executed against transcribed logic, not a rendered toast** |
| Plain "Mark paid & collected" persists `card` through the `collected` path | ✅ **EXECUTED** — §2, including the old behaviour (`null`) for the identical body |
| `💷 Cash` persists `cash` and its toast and Undo name cash | ✅ **EXECUTED** — §3, all four suffixed actions |
| A Stripe-settled order is untouched — `channel:'online'`, `method` NULL, 409 unchanged | ✅ **EXECUTED** — §5 |
| Absent or unrecognised method persists NULL and the CHECK cannot be violated | ✅ **EXECUTED** — §6, nine hostile inputs |
| The idempotency guards and `channel` are untouched | ✅ **EXECUTED** for the key (§7); ✅ **SOURCE-READ** for `channel` and the three layers — `git diff` shows no line of them changed |
| **The dashboard's NULL-case copy is unchanged** | ✅ **EXECUTED** — §4 compares the new chooser against the OLD one and requires equality |

## 🔴 EVERY DASHBOARD CLAIM, LABELLED

| Dashboard claim | EXECUTION or SOURCE |
|---|---|
| The plain toast becomes "paid on your card machine" | 🔴 **SOURCE-READ** for the render; **EXECUTED** for the string the chooser returns |
| The NULL-case strings are byte-identical | ✅ **EXECUTED** (§4) |
| Undo copy and durations unchanged | ✅ **EXECUTED** — `git diff` shows those branches untouched |
| The 409 and the Stripe path unchanged | ✅ **EXECUTED** — no line of either is in the diff |
| **It works on a real board** | 🔴 **NOT VERIFIED. Nothing was rendered, no button was pressed, no row was written.** |

## 🔴 NOT VERIFIED

- **NOTHING WAS RENDERED, TAPPED OR WRITTEN.** No `next dev`, no `next build`, no device, **no SQL** —
  so **no `order_payments` row has been observed carrying `'card'`.**
- **The harness is a transcription.** It proves the resolvers and the copy; it says nothing about the
  wiring between them.
- ⚠️ **The offline replay path is source-read only.** The outbox freezes `op.body`, so an op queued
  before this deploy replays **without** a method and lands as NULL — correct, and untested.

---

# INTEGRITY

## Byte-level scan and census — all five edited files

**Byte-level tool (Python over `open(…,'rb')`), never grep.** ⚠️ **The two page files' "before" is
HEAD, so their byte deltas also contain the earlier uncommitted work of this session; the KDS's
+32kB is almost all of it. The dashboard page was CLEAN at HEAD, so its +1,704 bytes are this task's.**

| File | bytes | classes | occurrences | new / removed | NUL · control · CR · TAB |
|---|---|---|---|---|---|
| `app/dashboard/[token]/page.tsx` | 387,838 → **389,542** | 53 → **53** | 3397 → 3451 | ✅ **NONE / NONE** | 0 · 0 · 0 · 0 |
| `app/dashboard/[token]/kds/page.tsx` | 149,420 → **181,556** | 33 → **33** | 2359 → 2945 | ✅ **NONE / NONE** | 0 · 0 · 0 · 0 |
| `lib/native/useGatedActionResult.tsx` | 13,711 → **18,115** | 10 → **10** | 501 → 596 | ✅ **NONE / NONE** | 0 · 0 · 0 · 0 |
| `lib/native/orderGate.ts` | 19,805 → **20,365** | 8 → **8** | 214 → 216 | ✅ **NONE / NONE** | 0 · 0 · 0 · 0 |
| `app/api/dashboard/action/route.ts` | 174,041 → **175,225** | 14 → **14** | 3396 → 3406 | ✅ **NONE / NONE** | 0 · 0 · 0 · 0 |

⚠️ **ONE NEW CLASS WAS INTRODUCED AND REMOVED BEFORE THE FINAL SCAN.** A `💷` had crept into a comment
in `useGatedActionResult.tsx`, taking it to 11 classes; it was replaced with the word "Cash". **The
figures above are the final state, and no edited file gained a character class.**

**Carrier-aware check on the sources:** `U+26A0` is fully paired in `orderGate.ts` (3/3) and the action
route (49/49); the dashboard page carries **2 bare** and `useGatedActionResult` **1 bare** — ⚠️ **all
three pre-existing and unchanged** (HEAD's copy of the handler has the same single bare one: it is the
`⚠️ Order #N — PAYMENT NOT RECORDED` toast copy, which is rendered text the source writes bare).

## This report — SEPARATE pass, run AFTER writing

```
docs/payment-method-fix-report.md   bytes 20,805
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

**Carrier-aware variation-selector check, PER EMOJI-PRESENTATION BASE:**

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 🔴 | 30 | 0 | 30 |
| U+2705 ✅ | 48 | 0 | 48 |
| **U+26A0 ⚠️** | **19** | **19** | ✅ **0** |
| U+1F4B7 💷 | 5 | 0 | 5 |
| U+1F4B3 💳 | 2 | 0 | 2 |

`U+1F534`, `U+2705`, `U+1F4B7` and `U+1F4B3` have **emoji presentation by default** and need no
selector — bare is correct for all four. **`U+26A0` is the only base here that defaults to TEXT
presentation**, and ✅ **every one of its 19 occurrences is PAIRED — 19 OF 19, ZERO
BARE.** ⚠️ **No other emoji-presentation base occurs in this report.** The total `U+FE0F` count is
19, which exactly accounts for the 19 paired warning signs and leaves none elsewhere.

## Working tree

```
 M app/api/dashboard/action/route.ts
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M components/dashboard/PaymentActionsModal.tsx
 M docs/reference-manual.md
 M lib/native/orderGate.ts
 M lib/native/useGatedActionResult.tsx
?? docs/kds-event-isolation-fix-report.md
?? docs/kds-event-isolation-report.md
?? docs/kds-header-group-report.md
?? docs/kds-header-tidy-report.md
?? docs/kds-phone-controls-report.md
?? docs/modal-backdrop-report.md
?? docs/payment-method-fix-report.md
?? docs/payment-method-report.md
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `M app/dashboard/[token]/page.tsx` · 🔴 `M lib/native/useGatedActionResult.tsx` · 🔴 `M lib/native/orderGate.ts` · 🔴 `M app/api/dashboard/action/route.ts` | 🔴 **THIS TASK.** All four were clean at HEAD |
| `M app/dashboard/[token]/kds/page.tsx` | ⚠️ **BOTH** — already modified by four earlier tasks; this task added to it |
| `M components/dashboard/PaymentActionsModal.tsx` | ✅ pre-existing — the modal-backdrop portal fix |
| 🔴 `?? docs/payment-method-fix-report.md` | 🔴 **THIS TASK** — this file |
| `M docs/reference-manual.md` · `?? docs/kds-event-isolation-report.md` | ✅ pre-existing — **left alone, as instructed** |
| the five other `?? docs/*.md` | ✅ pre-existing — the preceding tasks' reports. ⚠️ **Not named in the brief's two-entry list; left alone on the same footing** |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
