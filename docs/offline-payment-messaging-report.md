# Offline payment modification — the modal now says why, instead of lying

Date: 14 August 2026
**EDITED: 3 files.** `PaymentActionsModal.tsx` (+43 lines) · `OrderCard.tsx` (+9) ·
`app/dashboard/[token]/page.tsx` (+3)
`tsc --noEmit`: exit 0 · **0 NUL, 0 control bytes < 0x09** · **no file gained a codepoint class.**
🔴 **No refund op kind added. `lib/payments/`, the outbox, the gate and the drain are untouched.**

No `next dev`, no `next build`, no `cap sync`, no deploy, no commit.
**No span of the prompt arrived garbled. No instruction contradicted another.**

---

# 🔴 THE DIAGNOSIS — THE MODAL WAS NOT SILENT. IT WAS SAYING SOMETHING FALSE.

The brief describes the symptom as *"the control is silently absent"*. **It is worse than that.** Offline
the modal fell through to **Branch 3** and rendered:

> ### *"Order #N was paid by card, so there is no payment record to remove here — the money is already on the customer's card."*

🔴 **For a cash order taken at the hatch, every clause of that is untrue** — and it is **word-for-word
the same sentence** the modal says truthfully about a real card order. **That is why the operator could
not tell "you can't do this offline" from "this order can't be refunded": the app was actively asserting
the second.**

**Why it happened — READ, and it chains straight off today's earlier offline work:**
```tsx
  const hasReversibleInPersonPayment = (ledgerRows ?? []).some(
    r => r.kind === 'charge' && r.channel !== 'online' && r.livemode === true,
  )
```
```tsx
  const canRefund = !!onRefund && cardChargeMinor > 0 && refundableMinor > 0
```
🔴 **Both are derived from `ledgerRows`, which come from `/api/dashboard`. Offline they are stale or —
for an order paid offline — ABSENT.** So `hasReversibleInPersonPayment` resolves **false**,
`cardChargeMinor` resolves **0**, Branch 1 and Branch 2 are both skipped, and Branch 3 is reached **by
elimination rather than by evidence.**

---

# PART A — WHAT HAPPENED TODAY

## A1. Every payment-MODIFICATION control

| # | Control | file:line | What it changes |
|---|---|---|---|
| 1 | **"Remove payment"** (Branch 1) | `PaymentActionsModal.tsx:180-183` (pre-edit `:165-183`) | deletes/reverses an in-person charge row |
| 2 | **The refund form** (Branch 2) | `PaymentActionsModal.tsx:214-…` | `onRefund` → `submitRefund` → `lib/payments/refund.ts` → Stripe |
| 3 | **The card's two triggers** that open the modal | `OrderCard.tsx:541`, `:614` | `title={hasReversibleInPersonPayment ? 'Tap to remove this payment' : 'Tap for how to refund this'}` |
| — | Branch 3 | `:190-…` | **no action** — explanation only |

**Branch 1, quoted:**
```tsx
          <button onClick={() => { onClose(); onUndoPayment() }} disabled={undoLoading}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl text-sm disabled:opacity-50">
            {undoLoading ? '…' : 'Remove payment'}
          </button>
```
**and its caller, `OrderCard.tsx:587-588`:** `onUndoPayment={() => onAction('undo_mark_paid', order.order_key)}`.

## A2. What decided whether each rendered — 🔴 **offline was NOT part of any condition**

| Control | Condition (pre-edit) | Offline in it? |
|---|---|---|
| Remove payment | `if (hasReversibleInPersonPayment)` | 🔴 **NO** |
| Refund form | `const canRefund = !!onRefund && cardChargeMinor > 0 && refundableMinor > 0` | 🔴 **NO** |
| Branch 3 | the `else` of both | 🔴 **NO** |

**Not one of the three mentioned connectivity. NOT FOUND — stated plainly.**

## A3. What a tap did TODAY — **per control**

| Control | Offline behaviour |
|---|---|
| **Remove payment** | 🔴 **UNREACHABLE** — its branch requires ledger rows the device does not have. **The control was absent, and the operator was told the wrong reason** |
| **Refund** | 🔴 **UNREACHABLE** — same cause (`cardChargeMinor === 0`) |
| **Branch 3's "Got it"** | rendered, and only closed the modal |
| ⚠️ **If Branch 1 HAD been reachable** | `onAction('undo_mark_paid', …)` → `gatedAction` → **it would have QUEUED as a `kind:'status'` op**. **INFERRED from `page.tsx`'s doAction, not observed** — the branch is unreachable offline, so this has probably never fired. 🔴 **It is exactly the failure direction this task exists to prevent, and it was one stale ledger row away from being live.** |

## A4. The detector — **`lib/native/reachability.ts`, the ping-based one**

**READ, `app/dashboard/[token]/page.tsx:878`:**
```tsx
  useEffect(()=>{if(!isNativeApp())return;startReachability();return onReachabilityChange(online=>setIsOffline(!online))},[])
```
with `const[isOffline,setIsOffline]=useState(false)` at `:498`.

✅ **Detector 1 of §35's three** — `HEAD /api/ping`, three consecutive failures (~30s) before declaring
offline. ⚠️ **`PaymentActionsModal` and `OrderCard` had NO detector of their own** — they are presentational
and are now told by their caller, which keeps §35's one-predicate discipline intact **rather than adding
a fourth mechanism.**

## A5. The KDS — **reported separately: it cannot show any of this**

```
$ grep -c "PaymentActionsModal\|onRefund" app/dashboard/[token]/kds/page.tsx
0
```
🔴 **The KDS never renders the modal and never passes `onRefund`.** It renders the shared `OrderCard`
with `hidePayments` (`kds:1353`), which OrderCard documents as *"no paid chip, no pay buttons, Ready in
their place"*. ✅ **So no payment-modification control exists on the KDS at all, offline or online — and
`offline` defaults to `false` there, so the KDS is byte-identical.**

---

# PART B — THE FIX

## B1 / B2. A new FIRST branch: visible, unavailable, and it says why

**Added at `PaymentActionsModal.tsx:176-206`, immediately before Branch 1:**
```tsx
  if (offline) {
    return shell(
      <>
        {howPaidBlock}
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Payment changes need a connection</h3>
          <p className="text-sm text-slate-500 mt-2">
            Payment changes can&apos;t be made while offline. Refunds and removing a recorded payment both
            have to reach the payment provider, so they can&apos;t be saved on this device and sent later.
          </p>
          <p className="text-sm text-slate-500 mt-2">
            Order <strong className="text-slate-700">#{orderId}</strong> is unchanged. Reconnect and open
            this again.
          </p>
        </div>
        <button onClick={onClose}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 rounded-xl text-sm">Got it</button>
      </>
    )
  }
```

**The final strings, exactly as shipped:**
- Heading: **`Payment changes need a connection`**
- **`Payment changes can't be made while offline.`** — B2's target sentence, used verbatim
- **`Refunds and removing a recorded payment both have to reach the payment provider, so they can't be saved on this device and sent later.`** — the *why*, in the tone of "Settings are locked"
- **`Order #N is unchanged. Reconnect and open this again.`** — what to do

✅ **`{howPaidBlock}` is kept**, so the operator still sees how the customer paid — that is a FACT, not
an action. 🔴 **The branch is tested FIRST because offline the data every other branch reasons from is
untrustworthy**, which is the whole diagnosis.

## B3. ✅ Nothing lets a tap through, and nothing queues

**There is no action to press but "Got it".** The Remove payment button and the refund form are in
branches that `return` before them. 🔴 **No `onUndoPayment`, no `onRefund`, no `gatedAction`, no
`enqueue` is reachable from this branch.**

## B4. 🔴 IT CLEARS ON RECONNECT — **the subscription that guarantees the re-render**

```tsx
  useEffect(()=>{if(!isNativeApp())return;startReachability();return onReachabilityChange(online=>setIsOffline(!online))},[])
```
🔴 **`setIsOffline` is a React state setter, so reachability recovering re-renders the dashboard**, which
re-passes `offline={isOffline}` to both `OrderCard` call sites and to the standalone modal. **The modal
is a child, so it re-renders with the new value: the control returns with no reload.**

⚠️ **This is deliberately the SAME state the offline banner reads** — the banner disappearing and the
payment controls returning are **one event, not two**, so they cannot disagree. **`isOffline` is read at
render, never cached in a ref or a `useMemo`**, which is the failure class B4 names.

## B5. 🔴 RECORDING A NEW PAYMENT IS UNTOUCHED — **how the two were kept apart**

**The separation is structural, not conditional:**

| | Where it lives | Changed? |
|---|---|---|
| **Recording NEW payment** | the CARD's own buttons — `completionBtn`, Mark paid / Cash / Card, `onAction('mark_paid' \| 'collected' …)` | ✅ **NO. Not one of them was touched, and none reads `offline`.** They still queue through the gate exactly as before |
| **MODIFYING an existing payment** | **only inside `PaymentActionsModal`** | ✅ restricted |

🔴 **`offline` is passed to the MODAL and nowhere else.** OrderCard forwards it in a single place:
```tsx
      onRefund={onRefund}
      offline={offline}
    />
```
**It touches no arithmetic, no `balance`, no `effectivePaid` and no button outside the modal** — the
prop's own doc comment says so, so the next reader cannot widen it by accident.

---

# PART C — BOUNDARIES

## C1. `git diff --stat` — this task's three files, and what is absent

```
 components/dashboard/OrderCard.tsx           |   9 +
 components/dashboard/PaymentActionsModal.tsx |  45 +-
 app/dashboard/[token]/page.tsx               |  62 +--     (3 lines are this task's)
```
```
$ git status --porcelain lib/payments lib/native
(no output)
```
🔴 **`lib/payments/` (including `refund.ts` and `ledger.ts`), `lib/native/outbox.ts`,
`lib/native/orderGate.ts` (the gate AND the drain) are ALL untouched — proven by `git status`.**
⚠️ The other entries in the full stat — `kds/page.tsx`, `AddOrderPanel.tsx`, `OfflineBanner.tsx`,
`reference-manual.md`, the three PNGs — are earlier tasks'.

## C2. ✅ NO REFUND OP KIND WAS ADDED

```
$ grep -n "export type OutboxKind" lib/native/outbox.ts
67:export type OutboxKind = 'create' | 'status' | 'edit' | 'stock' | 'buzzer'
```
🔴 **Unchanged. No `'refund'`, and `outbox.ts` is not in `git status`.**

## C3. What changes for each live operator

**Pizzeria Gusto:** offline, opening the payment actions on an order now says *"Payment changes can't be
made while offline"* instead of falsely claiming the order was paid by card with nothing to remove —
and the control comes back by itself on reconnect.

**Tikka Tonic:** identical, since both surfaces and the detector are the same and neither truck's
settings enter into it.

## C4. ✅ No customer-facing surface and no ledger row is affected

- **No ledger row** — nothing here writes; the modal's money paths are now **less** reachable, not more.
- **No customer surface** — `PaymentActionsModal` and `OrderCard` are operator-only; the KDS does not
  render the modal (A5).
- **No email, receipt or report** — all server-rendered from `order_payments`, untouched.
- **`getOrderBalance` is not called, imported or altered by this change.**

---

# PART D — INTEGRITY

## D1 / D2. Non-ASCII census

| File | Bytes | Lines | Distinct | Gained | Lost |
|---|---|---|---|---|---|
| `PaymentActionsModal.tsx` | 15,211 → **18,104** | 284 → 327 | **9 → 9** | **NONE** | **NONE** |
| `OrderCard.tsx` | 85,455 → **86,079** | 1,274 → 1,283 | **31 → 31** | **NONE** | **NONE** |
| `app/dashboard/[token]/page.tsx` | 373,163 → **373,446** | 4,840 → 4,843 | **53 → 53** | **NONE** | **NONE** |

🔴 **NO FILE GAINED A CODEPOINT CLASS.**

**Every changed count explained:**
- **`PaymentActionsModal.tsx`** — `—` +6, `🔴` +4, `─` +4, `⚠`/`FE0F` +2/+2, `⇒` +1: the Branch 0
  comment block and the new prop's doc comment, in the file's existing style. ✅ **the `⚠️` pair moves in
  lockstep.**
- **`OrderCard.tsx`** — one of each (`—`, `⇒`, `⚠`, `FE0F`, `🔴`): the single prop doc comment.
- **`page.tsx`** — `🔴` +1 and `→` +1: the one comment beside `offline={isOffline}` on the standalone
  modal. **The two OrderCard call sites gained only `offline={isOffline}`, which is pure ASCII.**

## D3. Byte scan — byte-level tool, never grep

| File | NUL | Ctrl < 0x09 | Other C0 |
|---|---|---|---|
| `components/dashboard/PaymentActionsModal.tsx` | **0** | **0** | **0** |
| `components/dashboard/OrderCard.tsx` | **0** | **0** | **0** |
| `app/dashboard/[token]/page.tsx` | **0** | **0** | **0** |

## D4. This report — separate post-write pass

*(Run after the file was on disk; result stated in the session output.)*

## D5. `git status` and `git diff --stat`

**`git diff --stat` is quoted at C1.**
```
$ git status --porcelain
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx                        <- THIS TASK (3 lines) + earlier
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/OrderCard.tsx                    <- THIS TASK
 M components/dashboard/PaymentActionsModal.tsx          <- THIS TASK
 M components/native/OfflineBanner.tsx
 M docs/reference-manual.md
 M ios/App/App/Assets.xcassets/Splash.imageset/*.png  ×3
?? docs/… (report files)
```
**Nothing committed.**

## D6. ✅ `tsc --noEmit`: **EXIT 0, ZERO OUTPUT** — and it verifies little here

**What it DID check:** that `offline?: boolean` is declared on both components, that the prop threads
through without a type error, and that the new JSX is well-formed — **which is more than the last two
tasks got, because these are real props rather than string literals.**

🔴 **WHAT IT CANNOT CHECK, AND THIS IS THE PART THAT MATTERS:** that Branch 0 is tested **before**
Branch 1 (reordering them would compile and silently restore the defect); that `isOffline` is actually
true when the device is offline; that the copy is right; or that anything renders. **Nothing was run on
a device.**

---

# WHAT REMAINS

1. ⚠️ **Nothing was rendered.** **Device check: go offline, wait for the banner, tap a paid order's
   payment control — PASS = "Payment changes need a connection". Then reconnect and tap again without
   reloading — PASS = the Remove payment / refund control is back.**
2. 🔴 **The underlying data problem is untouched, by scope.** Offline, `ledgerRows` are stale or absent,
   so `hasReversibleInPersonPayment` and `cardChargeMinor` are still wrong — **Branch 0 now intercepts
   before anyone can act on them, but it does not make them right.** A reconnect is what fixes them.
3. ⚠️ **Manage has no offline detector at all** (`docs/manage-navigation-report.md`), so if a payment
   modification control is ever added there, **it will not inherit this protection.**
4. ⚠️ **The `undo_mark_paid` path would still queue if Branch 1 were ever reached offline** (A3, row 4).
   **It is unreachable today and now doubly so — but the gate itself was not changed, per scope.**
5. **No refund op kind exists and none was proposed.**
