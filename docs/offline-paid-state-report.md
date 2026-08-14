# Offline paid walk-ups no longer offer "Mark paid" — Option 2 implemented

Date: 14 August 2026 · supersedes the diagnosis and the one-line `payment_status` note of the same name
**EDITED: 1 file.** `app/dashboard/[token]/page.tsx` — **+30 / −2**, one derivation and two call sites.
**NO NEW PROP.** `tsc --noEmit`: exit 0 · **0 NUL, 0 control bytes < 0x09** · **no codepoint class gained
or lost.**

No `next dev`, no `next build`, no `cap sync`, no deploy, no commit.
**No span of the prompt arrived garbled. No instruction contradicted another.**

---

# WHAT CHANGED, IN ONE PLACE

```tsx
  const queuedPayment=useCallback((o:Order):'pending_paid'|'pending_unpaid'|undefined=>{
    const q=deviceQueuedOrders.find(x=>x.order_key===o.order_key)
    if(!q)return undefined              // not queued → online path, byte-identical to before
    return q.payment_status==='paid'?'pending_paid':'pending_unpaid'
  },[deviceQueuedOrders])
```
```diff
- pendingPayment={paymentOverlay.get(o.order_key)}
+ pendingPayment={paymentOverlay.get(o.order_key)??queuedPayment(o)}
```
**applied to BOTH `<OrderCard>` call sites, identically.**

🔴 **THE OVERLAY STILL WINS. `??` only falls through when `paymentOverlay` has no entry**, so the real
payment-op signal is never overwritten.

---

# PART A — THE MECHANISM, CONFIRMED

## A1. The prop and the short-circuit — quoted in full

**`components/dashboard/OrderCard.tsx:156-158`:**
```tsx
   *  ⚠️ IT LAYERS ON TOP OF getOrderBalance — it never replaces or re-derives it. `balance` stays the
   *  CONFIRMED state and is what every other consumer reads; this only overrides the RENDERED paid-ness. */
  pendingPayment?: 'pending_paid' | 'pending_unpaid'
```
**and the short-circuit, `:283-286`:**
```tsx
  const effectivePaid = pendingPayment === 'pending_paid' ? true
    : pendingPayment === 'pending_unpaid' ? false
    : isPaid
  const effectivePartPaid = pendingPayment ? false : isPartPaid
```
🔴 **`isPaid` — the ledger-derived value that is false offline — is only consulted when `pendingPayment`
is undefined.** That is why no new prop is needed and why nothing about `getOrderBalance` had to change.

⚠️ **`effectivePartPaid` also becomes `false` whenever `pendingPayment` is set.** For a queued order
there are no ledger rows, so `isPartPaid` was already false — **no behavioural difference**, but it is a
real consequence of using this prop and is recorded rather than discovered later.

## A2. EVERY call site — **there are exactly TWO, and both are handled identically**

```
$ grep -c "<OrderCard" app/dashboard/[token]/page.tsx
2
:3278   pendingOrders.map(o=><OrderCard … />)      "New — action needed"
:3284   confirmedOrders.map(o=><OrderCard … />)    "Confirmed"
```
**Both read, before:**
```tsx
… ledgerRows={payments[o.order_key]} heldAuthorisation={heldAuthorisations.has(o.order_key)} pendingPayment={paymentOverlay.get(o.order_key)} conflict={cardConflict(o)} …
```
✅ **The edit was applied with `replace_all`, so the two cannot drift apart.** Verified after: the new
expression appears **exactly 2** times.

⚠️ **THERE IS A THIRD ORDER LIST AND IT IS NOT A CALL SITE.** `otherOrders` (the completed section,
`:3290`) renders a **collapsed summary list behind an expander**, not `<OrderCard>`. **NOT FOUND — no
third card to keep consistent.**
🔴 **The KDS renders `OrderCard` too but passes NO `pendingPayment` at all** — see C2.

## A3. How the dashboard knows an order is queued

```tsx
:205    const[deviceQueuedOrders,setDeviceQueuedOrders]=useState<Order[]>([])
```
```tsx
:2498   const syncedKeys=new Set(orders.map(o=>o.order_key))
:2499   const pendingQueued=deviceQueuedOrders.filter(o=>!syncedKeys.has(o.order_key))
```
and the file's own note at `:2328`: *"deviceQueuedOrders is ONLY ever populated by an OFFLINE create"*.

⚠️ **I read `deviceQueuedOrders`, NOT `pendingQueued`, and deliberately.** `pendingQueued` is computed in
the render body at `:2499`, far below where a `useCallback` can live; `deviceQueuedOrders` is the state
it derives from and is in scope at `:352`. **The difference is only orders whose synced twin has already
arrived — and those carry real ledger rows, so `isPaid` is already true and the overlay value is
redundant.** ⚠️ **INFERRED, not observed:** that the redundant value is harmless in the one render
before the prune effect at `:1031` runs.

## A4. Where the queued order's paid state lives

**`components/dashboard/AddOrderPanel.tsx:1130`** — yesterday's edit, which looked inert and is the input
this fix reads:
```tsx
          order_type: 'collection', payment_status: manualOrder.paymentTaken ? 'paid' : 'unpaid', created_at: new Date().toISOString(),
```
derived from `:1093` `paymentTaken: takePaymentRef.current` — **the operator's own button press**, the
same value the outbox body carries. **Typed `payment_status?: string | null` (`types.ts:72`).**

---

# PART B — THE DERIVATION

## B1. Queued → `'pending_paid'` / `'pending_unpaid'`

Quoted in the headline. It mirrors `cardConflict` (`:352-355`) exactly — a `useCallback` returning a
per-order value, placed immediately after it, memoised on its one input.

## B2. 🔴 PRECEDENCE — **`paymentOverlay` WINS, enforced by `??`**

```tsx
pendingPayment={paymentOverlay.get(o.order_key)??queuedPayment(o)}
```

**`??` returns the right operand only when the left is `null`/`undefined`.** `paymentOverlay` is a
`Map<string, PendingPaymentState>` (`useOfflinePaymentOverlay.ts:41`), and `Map.get` returns `undefined`
for a missing key — so:

| `paymentOverlay.get(key)` | `queuedPayment(o)` | Result |
|---|---|---|
| `'pending_paid'` | anything | 🔴 **`'pending_paid'` — the overlay** |
| `'pending_unpaid'` | anything | 🔴 **`'pending_unpaid'` — the overlay** |
| `undefined` | `'pending_paid'` | `'pending_paid'` — the new derivation |
| `undefined` | `'pending_unpaid'` | `'pending_unpaid'` — the new derivation |
| `undefined` | `undefined` | `undefined` → falls through to `isPaid`, **exactly as today** |

🔴 **WHEN BOTH HAVE A VALUE THE OVERLAY IS USED AND MY DERIVATION IS DISCARDED.** That is the correct
precedence: the overlay reflects a `mark_paid`/`undo_mark_paid` op the operator dispatched **after**
creation, which is later information than what was true at creation. ⚠️ **The case is reachable** — an
operator can create a queued walk-up unpaid and then tap "Mark paid" on it, producing a `kind:'status'`
op the overlay sees. **`undo_mark_paid` on a queued paid order resolves to `'pending_unpaid'` and
correctly re-offers the button.**

## B3. 🔴 A QUEUED UNPAID ORDER STILL SHOWS THE BUTTON

```tsx
    return q.payment_status==='paid'?'pending_paid':'pending_unpaid'
```
**The discriminator is `payment_status`, which A4 shows is `manualOrder.paymentTaken ? 'paid' : 'unpaid'`
— the operator's own button press.** Both live trucks run `show_paid_step = true`, so the confirm bar
offers two buttons and a deliberately-unpaid walk-up is a real case (`AddOrderPanel.tsx:1449`).

**Unpaid → `'pending_unpaid'` → `effectivePaid === false` → the button renders.** ✅ **Identical to
today's behaviour, said explicitly rather than reached by fall-through.**

⚠️ **THE STRICT EQUALITY IS DELIBERATE AND FAILS SAFE.** Anything that is not exactly `'paid'` —
`'unpaid'`, `undefined`, a future value, a legacy queued order written before yesterday's edit — resolves
to `'pending_unpaid'`. 🔴 **The failure direction is "the button still shows", which is today's defect,
never "an unpaid order reads paid", which loses money.** That asymmetry is the whole reason Option 2 was
chosen over Option 3.

## B4. ✅ A NON-QUEUED ORDER IS COMPLETELY UNAFFECTED

`deviceQueuedOrders` is empty except on the native offline-create path, so `.find()` returns `undefined`,
`queuedPayment` returns `undefined`, and `??` yields exactly `paymentOverlay.get(o.order_key)` — **the
expression that was there before.**

🔴 **ONLINE IS BYTE-IDENTICAL, and it is structural rather than incidental:** with an empty array the
new code cannot produce a value at all. **On the web, `deviceQueuedOrders` can never be populated** —
`gatedAction` only queues when native.

---

# PART C — THE BOUNDARIES

## C1. ✅ Nothing outside one file was touched

```
$ git diff --stat
 app/dashboard/[token]/page.tsx | 32 ++++++++++++++++++++++++++++++--
 1 file changed, 30 insertions(+), 2 deletions(-)
```
```
$ git status --porcelain lib/payments lib/native components/dashboard/OrderCard.tsx app/dashboard/[token]/kds/page.tsx lib/printing
(no output)
```
🔴 **`lib/payments/*`, `lib/native/*` (the gate, the outbox, the drain), `OrderCard.tsx`, the KDS and
`lib/printing/*` are ALL untouched — proven by `git status`, not asserted.** The `-2` is the two call-site
lines; the `+30` is the derivation plus its comment.

## C2. ✅ The KDS cannot be affected — **two independent reasons**

1. **It has no `deviceQueuedOrders`** — `grep -c` returns **0**, along with `onOrderPlaced` (0) and
   `AddOrderPanel` (0). **An offline walk-up never appears on the KDS at all.**
2. **It passes no `pendingPayment`** — a search for `pendingPayment=` across `kds/page.tsx` returns
   **nothing**, so the prop is `undefined` there and `effectivePaid` falls through to `isPaid` exactly as
   before. **The edit is in `app/dashboard/[token]/page.tsx`, which the KDS does not import.**

## C3. What changes for each live operator

**Pizzeria Gusto:** when the iPad is offline, a walk-up taken *with* payment now shows as paid with a
"Collected" button instead of inviting a second payment — **and one taken without payment still shows
"Mark paid", exactly as now.**

**Tikka Tonic:** identical in every respect, since both run `show_paid_step = true` and
`completion_presses = 'two'` and both render the same two dashboard call sites.

## C4. ✅ No ledger, no accounting artefact, no ticket, no customer surface

- **`order_payments` / the ledger** — untouched. `getOrderBalance` still runs over the real rows and
  still produces `balance`; this only overrides one rendered boolean **downstream** of it.
- 🔴 **`lib/printing/mapOrderToTicket.ts` — UNTOUCHED, and it is the reason Option 1 was rejected.** It
  calls `getOrderBalance(order, ledgerRows ?? [])` at `:74` and **never sees `pendingPayment`**, so a
  printed ticket is byte-identical.
- **`confirmedPaid` (`page.tsx:325`) and the inline balance readouts (`:3357`, `:3376`)** — all call
  `getOrderBalance` directly and are **not** routed through this derivation.
- **Emails, receipts, reports, the customer order page** — server-rendered from the ledger; **this code
  never reaches the server.**
- **The queued payload** — unchanged; this fix reads `deviceQueuedOrders`, it does not write anything.

---

# PART D — DEVICE VERIFICATION PLAN

⚠️ **None of this has been run. The shell loads PRODUCTION, so this change is not on the device until it
is deployed.**

### 1. 🔴 Offline walk-up, PAID at creation — the defect itself
Go offline (wait ~30s for the reachability ping to flip). **+ Add order** → items → **take payment**
(cash or card).
- **PASS =** the card shows the **PAID chip** and its primary button reads **"Collected"**.
- 🔴 **FAILURE =** the button still reads **"Mark paid"** — the fix did not take. **Do not tap it.**

### 2. 🔴 Offline walk-up, NOT paid — the reversed-defect guard, and the more important test
Still offline. **+ Add order** → items → the **unpaid** button (available because `show_paid_step` is
true on both trucks).
- **PASS =** the card shows **"Mark paid"**, exactly as today.
- 🔴 **FAILURE =** it shows PAID or "Collected" — **an unpaid order reading as paid. Stop and revert:
  this is the money-losing direction and it is worse than the original defect.**

### 3. Both orders side by side
With #1 and #2 on screen together: **PASS =** they look different — one paid, one not.
**FAILURE =** both the same, whichever way.

### 4. Return-online reconciliation — must be unchanged
Reconnect and let the outbox drain.
- **PASS =** both settle to server truth; the paid one stays paid, the unpaid one still offers
  "Mark paid"; **no duplicate ledger row** (`select * from order_payments where order_key = …`).
- **FAILURE =** either flips unexpectedly, or a second charge row appears.

### 5. Online control — must be byte-identical
While **online**, place a normal walk-up with payment.
- **PASS =** exactly as before this change. **FAILURE =** any difference at all → B4 is wrong.

### 6. The KDS, for completeness
Open the KDS while offline orders are queued.
- **PASS =** the queued walk-ups **do not appear** (they never did) and nothing else changed.

---

# PART E — INTEGRITY

## E1 / E2. Non-ASCII census — `app/dashboard/[token]/page.tsx`

| | Bytes | Lines | Distinct non-ASCII |
|---|---|---|---|
| **BEFORE** | 370,177 | 4,809 | **53** |
| **AFTER** | **372,846** (+2,669) | **4,837** (+28) | **53** |

**GAINED classes: NONE. LOST classes: NONE.**

| Codepoint | Before → After | Why |
|---|---|---|
| `U+2500` ─ | 1850 → 1860 **(+10)** | the comment block's box rule, in the file's house style |
| `U+2014` — | 480 → 484 **(+4)** | four em dashes in the comment |
| `U+1F534` 🔴 | 66 → 70 **(+4)** | four red markers |
| `U+26A0` ⚠ | 55 → 57 **(+2)** | two warning markers |
| `U+FE0F` | 53 → 55 **(+2)** | ✅ **lockstep with U+26A0 — no half-written ⚠️** |
| `U+2192` → | 111 → 112 **(+1)** | the inline `// not queued → online path` comment |

⚠️ Every codepoint was already present in this file (53 classes). **No class introduced.**

## E3. Byte scan — byte-level tool, never grep

| File | NUL (0x00) | Ctrl < 0x09 | Other C0 (0x0B-0x1F, 0x7F) |
|---|---|---|---|
| `app/dashboard/[token]/page.tsx` | **0** | **0** | **0** |

## E4. This report — separate post-write pass

*(Run after the file was on disk; result stated in the session output.)*

## E5. `git status` and `git diff`

```
$ git status --porcelain
 M app/(legal)/layout.tsx
 M app/contact/page.tsx
 M app/dashboard/[token]/page.tsx      <- THIS TASK
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

```diff
$ git diff -- app/dashboard/[token]/page.tsx        (this task's hunks)
+  // ── 🔴 AN OFFLINE WALK-UP PAID AT CREATION MUST NOT BE OFFERED "Mark paid" (14 August 2026) ────────
+  // …
+  const queuedPayment=useCallback((o:Order):'pending_paid'|'pending_unpaid'|undefined=>{
+    const q=deviceQueuedOrders.find(x=>x.order_key===o.order_key)
+    if(!q)return undefined              // not queued → online path, byte-identical to before
+    return q.payment_status==='paid'?'pending_paid':'pending_unpaid'
+  },[deviceQueuedOrders])

-  … pendingPayment={paymentOverlay.get(o.order_key)} conflict={cardConflict(o)} …    (pendingOrders)
+  … pendingPayment={paymentOverlay.get(o.order_key)??queuedPayment(o)} conflict={cardConflict(o)} …

-  … pendingPayment={paymentOverlay.get(o.order_key)} conflict={cardConflict(o)} …    (confirmedOrders)
+  … pendingPayment={paymentOverlay.get(o.order_key)??queuedPayment(o)} conflict={cardConflict(o)} …
```
⚠️ **The two card lines are ~1,000 characters each and are reproduced above with the unchanged props
elided (`…`); the ONLY difference on each is `??queuedPayment(o)`.** `git diff --stat` confirms the
whole change is **+30 / −2 in one file**. ⚠️ **Every other entry in `git status` is earlier work.**
**Nothing committed.**

## E6. ✅ `tsc --noEmit`: **EXIT 0, ZERO OUTPUT** — and it is not verification

🔴 **THE DOUBLE CAST IS WHY THIS DEFECT SURVIVED, AND IT IS STILL THERE.** The optimistic object is
`as unknown as Order` (`AddOrderPanel.tsx:1131`), so **the compiler cannot check that
`payment_status` is set, spelled correctly, or one of the seven `PaymentStatus` values** — and
`types.ts:72` types it `string | null` anyway, so even without the cast any string would pass.

**What tsc DID check here:** that `queuedPayment` returns the union `pendingPayment` accepts, and that
`??` yields a compatible type. **What it did not and cannot check:** that `'paid'` is the value the
queued object actually carries, that the precedence is the right way round, or that anything renders.
**Nothing was run on a device.**

---

# WHAT REMAINS

1. ✅ **The queued payload was always correct.** The server only ever saw a paid order; **no money,
   ledger row, email or report was ever wrong.** That has not changed.
2. ✅ **The symptom is addressed on the dashboard** — the surface where it was observed and the only one
   that receives queued orders.
3. 🔴 **THE ROOT CAUSE IS STILL OPEN, BY CHOICE.** The offline payment overlay still filters
   `kind === 'status'` **and** `PAYMENT_ACTIONS.has(action)` (`orderGate.ts:115-121`), so money riding
   inside a `kind:'create'` op remains invisible to it. **Option 3 in
   `docs/paid-button-options-report.md` is what closes that.**
4. 🔴 **There are now TWO answers to "is this order pending-paid?"** — the overlay, and this derivation.
   `orderGate.ts:100-102` claims `isPaymentAction` is *"the one predicate that owns that decision"*.
   ⚠️ **That claim is now inaccurate**, and it is the known cost of choosing the safe-failure option.
5. 🔴 **The red "PAYMENT NOT RECORDED" banner still cannot fire for a failed paid create** —
   `useOutboxConflicts.ts:103` classifies by `isPaymentAction(action)`, and `'manual'` is not one. **A
   failed replay shows the amber "update didn't sync" bar instead.** Unchanged by this task.
6. ⚠️ **Nothing was rendered.** Every claim about what the card shows is read from source.
