# Offline walk-up orders render as UNPAID — the one-line fix, and why it is not the fix

Date: 14 August 2026 · supersedes the diagnosis of the same name
**EDITED: 1 file, 1 logic line.** `components/dashboard/AddOrderPanel.tsx`
`tsc --noEmit`: exit 0 · **0 NUL, 0 control bytes < 0x09** · **no codepoint class gained or lost**

**No span of the prompt arrived garbled. No instruction contradicted another** — the edit was made in
scope, exactly as B1 specifies. **But it does not remove the symptom, and that is the headline.**

---

# 🔴 READ THIS BEFORE DEPLOYING — THE BUTTON WILL STILL SAY "MARK PAID"

**The edit is done and it is correct. It does NOT change what the operator sees.**

**Why — and this is provable in one type definition. `lib/payments/ledger.ts:182-185`:**
```ts
export interface BalanceableOrder {
  total_minor?: number | null
  total?: number | null
}
```
```ts
export function getOrderBalance(order: BalanceableOrder, ledgerRows: LedgerRow[]): OrderBalance {
```

🔴 **`getOrderBalance` CANNOT READ `payment_status` — the field is not on the type it accepts.** It
derives paid-ness from **ledger rows only**, and `OrderCard` calls it at `:225` to produce `balance` →
`isPaid` → `effectivePaid`, the value the "Mark paid" branch tests at `:375`.

**Offline there are no ledger rows.** So `paidMinor = 0`, `status = 'unpaid'`, and the button renders —
**whatever `payment_status` says.**

⚠️ **And the codebase already says so, in the type this object is cast to.
`components/dashboard/types.ts:64-66`:**
> *"🔴 `payment_status` AND `amount_paid` ARE **DERIVED CACHES**. `order_payments` is canonical, and the
> migration that created it says these **"must never be hand-written"**. **DO NOT READ THEM to decide
> paid-ness** — call `getOrderBalance(order, ledgerRows)`…"*

🔴 **SO THE FIELD THE BRIEF ASKS ME TO CORRECT IS ONE THE CODEBASE FORBIDS BOTH WRITING AND READING FOR
THIS PURPOSE.** The old line hand-wrote it as a false literal; the new line hand-writes it as a true
derivation. **Strictly better, still hand-written, and still not what the card reads.**

**I made the edit anyway, because it is what was asked, it is harmless, and it stops one object
asserting something false.** ✅ **But the real-world harm in the brief — an operator asked to take
payment twice — is NOT addressed by this change**, and every fix that would address it is outside the
scope this task set:

| What would actually fix it | Why not here |
|---|---|
| Give `OrderCard` a "queued and paid" input | `OrderCard` + the dashboard — **beyond "the optimistic object ONLY"** |
| Synthesise optimistic ledger rows for queued orders | dashboard-side, and it manufactures money rows |
| Extend the offline payment overlay to `kind:'create'` ops | 🔴 `lib/native/orderGate.ts` — **the gate, explicitly forbidden by SCOPE** |

**Your call, not mine. I have not touched any of them.**

---

# PART A — CONFIRMED BEFORE EDITING

## A1. `AddOrderPanel.tsx:1085-1123`, quoted in full (the pre-edit text)

```tsx
        // `Confirm order · £X` and the payload said `paymentTaken: false`, and they agreed with each
        // other while both contradicting the setting.
        // 🔴 THE VALUE NOW COMES FROM THE BUTTON THE OPERATOR PRESSED, and nothing else. Both settings
        // legitimately take payment here — OFF always, ON via the primary button — so there is no truck
        // configuration under which a `true` from this panel should be refused. The server's matching
        // re-check was removed for the same reason; see app/api/dashboard/action/route.ts.
        // ⚠️ `takePaymentRef` is set by EVERY button in the confirm bar before it calls submitManual, so
        // it can never carry a stale value from a previous press. The unpaid button sets it false.
        paymentTaken: takePaymentRef.current,
        paymentMethod: takePaymentRef.current ? paymentMethodRef.current : null,
      }
      // 🔴 ONE-SHOT, CONSUMED THE MOMENT IT IS READ. …
      confirmUnresolvedTotalRef.current = null
      // Through the offline GATE: online → normal write; native + unreachable → durable outbox + queued.
      const result = await gatedAction({
        url: '/api/dashboard/action',
        kind: 'create', order_key: orderKey, provisional_id: provisional, online: isOnline(),
        body: { token, pin, action: 'manual', manualOrder },
      })
      // OFFLINE → durably queued. Optimistically add to the isolated device-queued list so the walk-up shows
      // now (cleared on the reconnect drain; the merge NEVER touches fetchAll). Skip the online-only 409
      // override flow + stock decrement below.
      if (result.queued) {
        const optimistic = {
          id: provisional, order_key: orderKey,
          customer_name: manualName || 'Walk-up', customer_phone: manualPhone || null, customer_email: manualEmail || null,
          slot: effectiveSlot, event_date: manualEvent?.event_date ?? null, event_id: manualEvent?.id ?? null,
          van_id: null, status: 'confirmed', items: manualItems, deals: manualOrder.deals,
          subtotal: manualItemsSubtotal, total: manualTotal, notes: manualNotes || null,
          order_type: 'collection', payment_status: 'unpaid', created_at: new Date().toISOString(),
        } as unknown as Order
        onOrderPlaced(optimistic)
        showToast(`Order ${provisional} saved on this device — will sync when back online`, 'success')
        resetManual(); setShowOrderSheet(false); setLoading(false); setSubmitting(null)
        return
      }
```

## A2. Every field the "Mark paid" condition reads — and which the optimistic object sets

**The condition, `components/dashboard/OrderCard.tsx:375` and `:439`:**
```tsx
    if (effectivePaid || heldAuthorisation) { return <Btn label="Collected" … /> }
```
```tsx
        label={effectivePartPaid ? `Mark ${money(balance.balanceMinor)} paid` : 'Mark paid'}
```

| Field | Source | Set by the optimistic object? |
|---|---|---|
| `effectivePaid` | `pendingPayment==='pending_paid' ? true : … : isPaid` (`:283-285`) | **derived** |
| `isPaid` | `balance.status` ← `getOrderBalance(order, ledgerRows ?? [])` (`:225`) | **derived** |
| 🔴 `ledgerRows` | prop, from the server | 🔴 **NO — and this is the one that decides it.** Offline there are none |
| `total` / `total_minor` | the only fields `getOrderBalance` reads | ✅ **YES** — `total: manualTotal` |
| 🔴 `payment_status` | 🔴 **NOT READ BY ANYTHING IN THIS PATH** | ✅ **YES** — the line this task changes |
| `pendingPayment` | the offline payment overlay | 🔴 **NO** — the overlay filters `kind==='status'`; a create is `kind:'create'` |
| `heldAuthorisation` | prop, Stripe hold | 🔴 **NO** |
| `completionPresses` | `resolvePaidStep(truck, event)` | n/a |

🔴 **THE OBJECT SETS EXACTLY ONE OF THE FIELDS THAT MATTER — `total` — AND THAT ONE MAKES IT LOOK
UNPAID.** `payment_status` is the only other field it sets, and nothing reads it.

## A3. The value — quoted, not invented

**`lib/payments/ledger.ts:65`:**
```ts
export type PaymentStatus = 'unpaid' | 'paid' | 'part_paid' | 'refunded' | 'part_refunded' | 'refund_due' | 'failed'
```
🔴 **A union of seven string literals. The correct value when `paymentTaken` is true is `'paid'`** — the
same name `getOrderBalance` produces at `balanceMinor === 0` (`:241`), and the value the DB CHECK admits
(`supabase/migrations/20260729_orders_payment_status_widen_check.sql`).

⚠️ **`components/dashboard/types.ts:72` types the field as `payment_status?: string | null`, not
`PaymentStatus`** — so even a *typed* object would not have caught the wrong literal. The double cast
(B3) is the second reason, not the only one.

## A4. ✅ THE KDS IS CLEAR — **CONFIRMED INDEPENDENTLY, not taken from the earlier report**

**Counted in `app/dashboard/[token]/kds/page.tsx`:**

| Token | Count |
|---|---|
| `deviceQueuedOrders` | 🔴 **0** |
| `onOrderPlaced` | 🔴 **0** |
| `AddOrderPanel` | 🔴 **0** |
| `hidePayments` | 12 |

🔴 **The optimistic object has no route to the KDS: the KDS neither imports the panel that builds it nor
holds the state it lands in.** And `hidePayments` is computed there at `:888`:
```tsx
  const hidePayments = showPaidStep && showPaymentsPref !== true
```
and passed to the card at `:1353`, which OrderCard's own note describes as *"this device does not do
money: no paid chip, no pay buttons, Ready in their place."*

✅ **The earlier report was right. The KDS was not touched.**

---

# PART B — THE EDIT

## B1 / B2. One logic line changed

**BEFORE:**
```tsx
          order_type: 'collection', payment_status: 'unpaid', created_at: new Date().toISOString(),
```
**AFTER:**
```tsx
          order_type: 'collection', payment_status: manualOrder.paymentTaken ? 'paid' : 'unpaid', created_at: new Date().toISOString(),
```

✅ **Derived from `manualOrder.paymentTaken` — the exact field that was queued**, rather than from
`takePaymentRef.current`. Same value, but reading the object that was sent means **the local render and
the outbox body cannot diverge**, which is the whole defect class.
✅ **Every other field is byte-identical.** `id`, `order_key`, `customer_name`, `customer_phone`,
`customer_email`, `slot`, `event_date`, `event_id`, `van_id`, `status`, `items`, `deals`, `subtotal`,
`total`, `notes`, `order_type`, `created_at` — untouched. **The diff is one line plus a comment block.**

## B3. `as unknown as Order` — **KEPT, as instructed. Worth removing later; here is what it would surface.**

The cast is why no compiler check caught this. **Not removed here — the brief forbids it and the reason
is sound: it would cascade.** ⚠️ **What removing it would surface, INFERRED from the `Order` type:**

- **Every field the optimistic object omits** that `Order` requires — it sets 17 of them, and `Order`
  carries far more (`total_minor`, `amount_paid`, `status_before_collected`, buzzer and payment fields).
  **That is the real reason the cast exists.**
- **Nothing about `payment_status`** — it is typed `string | null` (A3), so `'unpaid'` was always
  type-valid. 🔴 **Removing the cast would NOT have caught this defect.**

✅ **Worth doing? Yes, but as its own task, and narrowing `payment_status` to `PaymentStatus` would be
worth more than removing the cast.** Neither is in scope here.

## B4. ✅ The queued payload is untouched

`manualOrder` is built at `:1040-1094` and passed to `gatedAction` at `:1102-1106` **before** the offline
branch at `:1110`. **The edit is inside `if (result.queued)`, which runs after the queue write.** It
reads `manualOrder.paymentTaken`; it does not assign to it. **No byte of the outbox body changed.**

---

# PART C — BLAST RADIUS

## C1. ✅ ONLINE: **NOTHING CHANGES. Not one pixel.**

The edited line is inside `if (result.queued) { … }`. `gatedAction` returns `queued: true` **only** on
the native offline path — `orderGate.ts:206-211`, reached when `online: isOnline()` is false. **Online,
`result.queued` is falsy, the block is never entered, and the optimistic object is never constructed.**
✅ **The online path does not execute this line at all**, so C1's stop condition is not met.

## C2. What changes for each live truck

**Pizzeria Gusto:** nothing an operator can see — offline walk-ups taken with payment now carry a
truthful `payment_status` on the device's local copy, but the card still shows "Mark paid" because that
button reads the ledger, **so the double-charge risk is unchanged until a further fix lands.**

**Tikka Tonic:** identical in every respect, and equally unchanged on screen, since the panel, the card
and the setting (C4) are the same on both.

## C3. ✅ No ledger, no accounting artefact, no customer-facing surface

- **`order_payments`** — untouched. The edit writes to a JavaScript object, never to the database.
- **`orders.payment_status`** — untouched. The server derives it via `recalcOrderPayment` from the
  ledger; **this object never reaches the server** (the queued body does, and it is unchanged).
- **Emails, receipts, reports, the customer order page** — all server-rendered from the ledger.
- **`lib/payments/`, the outbox, the gate, the drain** — **not opened for editing;** none appears in
  `git status`.

## C4. 🔴 `trucks.show_paid_step` — **LIVE-VERIFIED, and it CORRECTS my earlier report**

**The column:** `trucks.show_paid_step`, with a per-event override `truck_events.show_paid_step_override`.
**READ, `lib/payments/paid-step.ts:83`:**
```ts
  const showPaidStep = event?.show_paid_step_override ?? truck?.show_paid_step ?? false
```

**Queried read-only (a single `SELECT`; nothing was written):**

| slug | `show_paid_step` | `takes_cash` | `completion_presses` |
|---|---|---|---|
| **pizzeria-gusto** | ✅ **true** | false | **two** |
| **tikka-tonic** | ✅ **true** | false | **two** |

⚠️ **THIS CORRECTS THE PREVIOUS VERSION OF THIS REPORT**, which said that for a truck with the setting
OFF *"EVERY offline walk-up renders as unpaid"* and left open whether these two were in that state.
**They are not.** With `show_paid_step = true` the confirm bar shows **two** buttons
(`AddOrderPanel.tsx:1449`), so an operator can legitimately place an unpaid walk-up.

🔴 **So the defect affects the PAID SUBSET of offline walk-ups, not all of them** — an unpaid one renders
"Mark paid" correctly. ✅ **And `completion_presses = 'two'` explains the exact wording observed**: the
two-press branch renders **"Mark paid"** (`OrderCard.tsx:439`), where a one-press truck would have shown
"Mark paid & collected".

---

# PART D — INTEGRITY

## D1 / D2. Non-ASCII census of `AddOrderPanel.tsx`

| | Bytes | Lines | Distinct non-ASCII |
|---|---|---|---|
| **BEFORE** | 165,264 | 2,438 | **36** |
| **AFTER** | **166,576** (+1,312) | **2,451** (+13) | **36** |

**GAINED classes: NONE. LOST classes: NONE.**

| Codepoint | Before → After | Why |
|---|---|---|
| `U+1F534` 🔴 | 32 → 34 **(+2)** | two red markers in the new comment |
| `U+2014` — | 212 → 214 **(+2)** | two em dashes, matching the file's comment style |
| `U+26A0` ⚠ | 38 → 39 **(+1)** | one warning marker |
| `U+FE0F` | 37 → 38 **(+1)** | ✅ **moves in lockstep with U+26A0 — the ⚠️ pair is not half-written** |

⚠️ Every codepoint used was already present in this file (it holds 36 classes, including `£`, `⇒`, `🔒`
and `💳`). **No class was introduced.**

## D3. Byte scan — byte-level tool, never grep

| File | NUL (0x00) | Ctrl < 0x09 | Other C0 (0x0B-0x1F, 0x7F) |
|---|---|---|---|
| `components/dashboard/AddOrderPanel.tsx` | **0** | **0** | **0** |

## D4. This report — separate post-write pass

*(Run after the file was on disk; result stated in the session output.)*

## D5. `git status` and the full `git diff`

```
$ git status --porcelain
 M app/(legal)/layout.tsx
 M app/contact/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/dashboard/AddOrderPanel.tsx      <- THIS TASK
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

```diff
$ git diff -- components/dashboard/AddOrderPanel.tsx
@@ -1114,7 +1114,20 @@
           slot: effectiveSlot, event_date: manualEvent?.event_date ?? null, event_id: manualEvent?.id ?? null,
           van_id: null, status: 'confirmed', items: manualItems, deals: manualOrder.deals,
           subtotal: manualItemsSubtotal, total: manualTotal, notes: manualNotes || null,
-          order_type: 'collection', payment_status: 'unpaid', created_at: new Date().toISOString(),
+          // 🔴 DERIVED FROM THE SAME VALUE THAT WAS QUEUED, NOT A LITERAL (14 August 2026). This read
+          // `payment_status: 'unpaid'` — a hardcoded string, eight lines after `paymentTaken` was
+          // captured at :1093 and queued correctly at :1102. The payload was always right; only this
+          // object said otherwise. Reading `manualOrder.paymentTaken` means the local object and the
+          // outbox body cannot diverge, because they are now the same value.
+          // 🔴 THIS ALONE DOES NOT MAKE THE CARD RENDER AS PAID, AND MUST NOT BE READ AS THE FIX FOR
+          // THAT. OrderCard decides paid-ness from `getOrderBalance(order, ledgerRows)`, whose
+          // BalanceableOrder type is `{ total_minor?, total? }` — it never reads payment_status at all.
+          // Offline there are no ledger rows, so the balance is still the full total and "Mark paid"
+          // still renders. See docs/offline-paid-state-report.md.
+          // ⚠️ types.ts records that payment_status is a DERIVED CACHE that "must never be hand-written",
+          // and this line hand-writes it either way. It is corrected here rather than removed because
+          // removing a field from the optimistic object is a wider change than this task allows.
+          order_type: 'collection', payment_status: manualOrder.paymentTaken ? 'paid' : 'unpaid', created_at: new Date().toISOString(),
         } as unknown as Order
```

🔴 **ONE FILE, ONE LOGIC LINE.** Every other entry in `git status` is earlier work. **Nothing committed.**

## D6. ✅ `tsc --noEmit`: **EXIT 0, ZERO OUTPUT** — and here it verifies almost nothing

🔴 **TSC-CLEAN IS PARTICULARLY WORTHLESS ON THIS EDIT, AND THE BRIEF IS RIGHT ABOUT WHY.**

- The object is `as unknown as Order` — **a double cast erases every property check**, which is how
  `payment_status: 'unpaid'` compiled cleanly while being false.
- ⚠️ **And even without the cast it would still compile**: `types.ts:72` types the field as
  `string | null`, so **any** string is valid. **Two independent reasons the compiler could not help.**
- It does not know that `getOrderBalance` ignores the field, which is the fact that decides whether this
  change does anything.
- **Nothing was rendered.** No browser, no simulator, no iPad.

---

# WHAT REMAINS TRUE, AND WHAT REMAINS BROKEN

1. ✅ **The queued payload was always correct** — `paymentTaken` captured at `:1093`, queued verbatim at
   `:1102`. **The server only ever saw a paid order. No money, ledger row, email or report was wrong.**
2. ✅ **The optimistic object no longer asserts a falsehood.**
3. 🔴 **THE OPERATOR STILL SEES "MARK PAID" ON AN OFFLINE PAID WALK-UP.** The harm in the brief is
   **not** removed by this task.
4. 🔴 **The second cause is untouched, by scope:** the offline payment overlay filters
   `kind === 'status'` **and** `PAYMENT_ACTIONS.has(action)` (`orderGate.ts:115-121`), and a walk-up
   create is `kind:'create'` / `action:'manual'` — **structurally invisible to it.**
5. 🔴 **The red "PAYMENT NOT RECORDED" banner still cannot fire for these orders** — `kind` is assigned
   `isPaymentAction(action) ? 'payment' : 'status'` (`useOutboxConflicts.ts:103`), and `'manual'` is not
   a payment action. **A failed replay would show the amber "update didn't sync" bar instead.**
6. ⚠️ **Nothing was rendered or executed**; every claim about what the card shows is read from source.
7. ⚠️ **I did not audit other optimistic objects** (`kind:'edit'`, the KDS's own paths) for the same
   hand-written-`payment_status` shape.
