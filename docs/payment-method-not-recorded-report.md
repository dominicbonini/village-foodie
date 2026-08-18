# A plain paid press still shows "not recorded" — read-only diagnosis

🔴 **NOTHING WAS EDITED EXCEPT THIS FILE.** No commit, no stage, no revert, no stash, no clean; no
`git stash`, `checkout` or `restore` — `status`, `log`, `show` and `diff` only. No build, no deploy, no
SQL, no schema change.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

# 🔴 THE ANSWER: I CANNOT SETTLE IT READ-ONLY, AND THERE ARE EXACTLY THREE LIVE CANDIDATES — ONE OF WHICH IS NOT A BUG

**The write path is correct end to end.** I traced it and quote every step below; a plain `mark_paid`
from either surface on a `takes_cash = false` truck carries `method: 'card'`, and the route honours it.
**So the fault is not in the mechanism that was built.** What remains:

| # | Candidate | How it would produce exactly what you saw | Can I settle it read-only? |
|---|---|---|---|
| **1** | 🔴 **The row is OLDER THAN THE CHANGE.** The change landed in `7672bae` (17 Aug); **a ledger row written before it carries `method = NULL` for ever** — the fix only affects new presses, it does not backfill | The modal would show the NULL fallback and be **CORRECT** | ❌ **No — needs the row's `created_at`** |
| **2** | 🔴 **The order was created through the ADD-ORDER PANEL's plain "payment taken" button**, which is **NOT** one of the two covered actions and **hardcodes `paymentMethodRef.current = null`** | Same state — `confirmed` + PAID chip — and a NULL method by design | ❌ **No — needs the action-log source for that order_key** |
| **3** | ⚠️ **A per-EVENT `takes_cash_override = true`** on the event this order belongs to | `takesCash` resolves true → `plainPaidMethod` is `null` → nothing attached, honestly | ❌ **No — needs the event row** |

⚠️ **Candidates 1 and 3 are not defects. Candidate 2 is a real, named gap.** §Q1 and §Q5.

---

# Q1 — `PLAIN_PAID_ACTIONS`, AND EVERY PAYMENT PATH MEASURED AGAINST IT

```ts
/** 🔴 THE TWO PLAIN IN-PERSON PAYMENT ACTIONS — the ones whose NAME carries no method.
 *  `mark_paid_cash` / `mark_paid_card` / `collected_cash` / `collected_card` answer for themselves and
 *  are deliberately absent: the server derives their method from the string and a body field would be a
 *  second source for one fact. These two are the only names a surface may attach `method` to, and it may
 *  only do so when the truck's own `takes_cash` setting answers the question. */
export const PLAIN_PAID_ACTIONS = new Set(['mark_paid', 'collected'])
```

**Two members: `mark_paid`, `collected`.**

| Action a surface can dispatch | In the set? | Where the method comes from | Covered? |
|---|---|---|---|
| `mark_paid` | ✅ **yes** | body `method`, attached by the surface's gate | ✅ |
| `collected` | ✅ **yes** | body `method`, same gate | ✅ |
| `mark_paid_cash` / `mark_paid_card` | ❌ no | **the server derives it from the name** | ✅ (by name) |
| `collected_cash` / `collected_card` | ❌ no | the server derives it from the name | ✅ (by name) |
| 🔴 **`manual`** (Add order with payment taken) | ❌ **no, and it never could be — it is an order-creation action** | `manualOrder.paymentMethod`, sent by the panel | 🔴 **PARTIALLY — see below** |
| `undo_mark_paid`, `undo_collected`, `refund` | ❌ no | reversals; record no method | n/a |

## 🔴 THE ONE PAID-RECORDING PATH THAT IS NOT COVERED, AND IT IS NOT AN OVERSIGHT IN THE SET

**`components/dashboard/AddOrderPanel.tsx` — the walk-up panel's own take-payment buttons:**

```tsx
                onClick={() => { takePaymentRef.current = true; paymentMethodRef.current = 'cash'; void submitManual() }}
                onClick={() => { takePaymentRef.current = true; paymentMethodRef.current = 'card'; void submitManual() }}
            onClick={() => { takePaymentRef.current = true; paymentMethodRef.current = null; void submitManual() }}   // 🔴 :1589 and :1633
```
```tsx
        paymentMethod: takePaymentRef.current ? paymentMethodRef.current : null,
```

🔴 **THE PLAIN "PAYMENT TAKEN" BUTTON IN THAT PANEL HARDCODES `null`, AT BOTH ITS MOUNTS, WITH NO
`takesCash` GATE ANYWHERE NEAR IT.** The server then does exactly what it is told:

```ts
          const manualMethod: 'cash' | 'card' | null =
            manualOrder?.paymentMethod === 'cash' || manualOrder?.paymentMethod === 'card' ? manualOrder.paymentMethod : null
```

⚠️ **So on Test Kitchen — `takes_cash = false` — an order taken at the hatch through Add order and paid
at creation records `method = NULL`, while the same truck's "Mark paid" on a card records `card`. Two
paid presses on one truck, two different answers.** ✅ **The `PaymentActionsModal` has NO
record-payment control of its own** — its only money actions are `onUndoPayment` (dispatches
`undo_mark_paid`) and `onRefund`. ✅ **The "payment not recorded" repair on the order card dispatches
`mark_paid_cash` / `mark_paid_card`, which the server answers by name** — covered.

---

# Q2 — THE GATE, ITS INPUTS, AND THE LOADING QUESTION

**Dashboard** (`app/dashboard/[token]/page.tsx:1971`) and **KDS** (`kds/page.tsx:1161`) — one expression,
character-identical apart from which event object it reads:

```ts
  const plainPaidMethod:'card'|null=resolvePaidStep(truck,selectedOrDefaultEvent).takesCash?null:'card'
```
```ts
  const plainPaidMethod: 'card' | null = resolvePaidStep(truck, activeEvent).takesCash ? null : 'card'
```

**And the resolver (`lib/payments/paid-step.ts`):**

```ts
    takesCash: event?.takes_cash_override ?? truck?.takes_cash ?? false,
```

| Input | Dashboard | KDS |
|---|---|---|
| `truck` | `/api/dashboard` → `data.truck` (select `*`) | the same route, the same field |
| the event | `selectedOrDefaultEvent` | `activeEvent` |
| the override | `truck_events.takes_cash_override` — **a live per-event control on the dashboard** | same column, same event |

🔴 **CAN IT BE UNDEFINED OR STILL-LOADING AT PRESS TIME? YES — AND IT FAILS TOWARDS `'card'`, NOT AWAY
FROM IT.** The chain ends `?? false`, so a null `truck` (first paint), a truck row without the column,
or an unresolved event all resolve `takesCash` to **false**, which makes `plainPaidMethod` **`'card'`**.
✅ **The distinction you raised — `takesCash === false` versus `!takesCash` — does not arise here,
because the resolver has already collapsed `undefined`/`null` to `false` before the ternary sees it.**

🔴 **THE ONE INPUT THAT CAN LEGITIMATELY TURN THE METHOD OFF IS THE EVENT OVERRIDE.**
`takes_cash_override = true` on the event this order belongs to makes `takesCash` true **whatever
`trucks.takes_cash` says**, and then `null` is attached deliberately. **That is candidate 3, and it is
invisible from the code.**

---

# Q3 — CLICK TO DATABASE

**1. The click** — `OrderCard.tsx:381` → `onAction('mark_paid', order.order_key)`. ⚠️ **Only when
`takesCash` is FALSE**: at `:485` a `takesCash` truck renders `💷 Cash` / `💳 Card` instead, which are
the self-describing names.

**2. The body** — `app/dashboard/[token]/page.tsx:1999` (the KDS's `:1220` is the same shape):

```ts
      const result=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action,order_key:orderKey,…,...(PLAIN_PAID_ACTIONS.has(action)&&plainPaidMethod?{method:plainPaidMethod}:{})},…})
```

⚠️ **`method` is only present when BOTH tests pass** — the action is one of the two, and
`plainPaidMethod` is truthy. **Otherwise the key is absent, not null.**

**3. `gatedAction`** — passes the body through when online; when offline it queues the body **as given**,
so the method rides along with the queued op.

**4. The route** — `app/api/dashboard/action/route.ts:2283`:

```ts
      const method: 'cash' | 'card' | null =
        action === 'mark_paid_cash' ? 'cash'
        : action === 'mark_paid_card' ? 'card'
        : (body.method === 'cash' || body.method === 'card' ? body.method : null)
```

**and `collected` at `:503`, the same shape.**

**5. `recordCollectionPayment(supabase, { orderKey, truckId, createdBy, method })` → the INSERT into
`order_payments`.**

🔴 **WHERE A METHOD COULD BE DROPPED — four places, and I can exclude three of them from source:**
✅ the client gate (excluded: the expression is correct and fails towards `card`) · ✅ the route's
validation (excluded: it accepts exactly `'cash'`/`'card'`) · ✅ the offline queue (excluded: it carries
the body verbatim) · 🔴 **NOT EXCLUDED: whether this particular row was written by this path at all** —
Q1's `manual` path and Q6's timing both bypass it.

---

# Q4 — WHAT THE MODAL READS, AND WHETHER IT COULD BE STALE

```tsx
      const methods = new Set(inPerson.map(c => c.method))
      if (methods.size === 1 && methods.has('cash')) out.push({ label: `Paid in cash${amount}` })
      else if (methods.size === 1 && methods.has('card')) out.push({ label: `Paid on your card machine${amount}` })
      else out.push({ label: `Paid in person${amount}`, hint: 'Cash or your card machine — not recorded' })
```

**The field is `order_payments.method`**, reaching the modal as:

```tsx
                      charges={rows.filter((r:any)=>r.kind==='charge').map((r:any)=>({channel:r.channel,method:r.method??null,amountMinor:r.amount_minor}))}
```

**from `payments[o.order_key]`, which is `/api/dashboard`'s `payments` map** — a live query on every poll
(`.from('order_payments').select(LEDGER_ROW_COLUMNS).in('order_key', visibleKeys)`), **not a cache and
not a snapshot taken at order time.**

🔴 **SO A CORRECTLY WRITTEN `card` COULD NOT DISPLAY AS THE NULL TEXT — with two exceptions worth
stating:** the row would have to be **outside the fetched window** (it is not; the order is on screen),
or `LEDGER_ROW_COLUMNS` would have to omit `method` — ⚠️ **and that is the one thing here I did not open;
`method` is read as `r.method` and the modal's own measured note ("165 carry method=NULL and ONE carries
'cash'") shows the column does arrive.** ✅ **Read-side stale data is effectively excluded.**

🔴 **THE `else` BRANCH ALSO CATCHES A CASE THAT IS NOT "NULL": more than one distinct method across the
in-person rows.** A part-payment recorded `card` plus a later plain press recording `null` gives
`methods.size === 2` → **the same "not recorded" sentence, with a `card` row present.** ⚠️ **Worth
knowing before reading a single row as proof of anything.**

---

# Q5 — WAS THAT ORDER PAID THROUGH A COVERED PATH?

**The state you describe — `confirmed`, PAID chip, `show_paid_step` truck, `completion_presses = 'two'`
— has TWO producers, and they are indistinguishable on screen:**

1. ✅ **`mark_paid` from the order card** — the covered path. Two-press trucks pay first and collect
   later, so the order sits at `confirmed` + paid. **Carries a method** (post-change).
2. 🔴 **The Add-order panel, order created with payment taken** — `manual` + `paymentTaken: true`. It
   produces **exactly the same state**, and per Q1 its plain button **hardcodes `paymentMethod: null`.**

🔴 **THE SCREENSHOT CANNOT SEPARATE THEM, AND NEITHER CAN THE SOURCE.** ⚠️ **If that order was placed at
the hatch through Add order rather than marked paid on the card afterwards, the NULL is expected today
and the fix never applied to it.**

---

# Q6 — IS THE CHANGE IN THE RUNNING BUILD?

**EXECUTED, and stated without assuming either way:**

- ✅ **The change is COMMITTED.** `git log -S "PLAIN_PAID_ACTIONS" -- lib/native/orderGate.ts` returns
  **exactly one commit: `7672bae "KDS fixes"`, dated 2026-08-17.**
- ✅ **It is PUSHED.** `git log origin/main..HEAD` is **empty** — the local branch is not ahead.
- ✅ **`git show HEAD:` confirms all three pieces are in that tree** — `PLAIN_PAID_ACTIONS` in
  `lib/native/orderGate.ts`, the gate and dispatch in the dashboard page, and `body.method` in the
  action route.
- 🔴 **WHAT I CANNOT SEE FROM HERE: whether Vercel has deployed `7672bae`, and when.** No deployment
  check was run — that is outside a read-only source diagnosis.
- 🔴 **AND THE DECISIVE POINT, WHICHEVER WAY THAT WENT: `order_payments` IS AN APPEND-ONLY LEDGER. A ROW
  WRITTEN BEFORE THE DEPLOY KEEPS `method = NULL` FOR EVER.** The change alters what NEW presses record;
  **it does not, and must not, rewrite history. So an order paid at any point before 17 August — or
  before the deploy of that commit — will show the NULL fallback CORRECTLY, and no amount of re-reading
  the code will change it.**

---

# Q7 — THE ONE CHEAPEST CHECK THAT SEPARATES A WRITE BUG FROM A READ BUG

🔴 **READ THE ROW FOR THAT ORDER — `order_payments`, that `order_key`: its `method` AND its
`created_at`.** (NOT PERFORMED — you run the queries.)

- `method = 'card'` → **a READ bug**, and Q4 says where to look next.
- `method = NULL` **and `created_at` before the deploy of `7672bae`** → **candidate 1: correct
  behaviour on a historical row. No defect.**
- `method = NULL` **and `created_at` after it** → **a WRITE bug**, and then the second question is which
  path wrote it: `action_log` for that `order_key` names it — `manual` (candidate 2, the uncovered
  panel path) or `mark_paid` (candidate 3, the event override, or a genuine defect in the covered path).

⚠️ **ONE QUERY ANSWERS THE FIRST FORK; ONE MORE ANSWERS THE SECOND. Nothing else is needed.**

---

# WHAT I AM NOT SAYING

**I am not saying the fix works.** ✅ **EXECUTION-verified here: the source of the gate, the dispatch,
the route's validation and the modal's read — all quoted above from the working tree, and the commit
facts from `git log`.** 🔴 **NOT verified: that any `mark_paid` press since the deploy actually wrote
`card`. No order was placed, no press was made, no row was read, and no deployment was checked.**
**Pizzeria Gusto is not implicated either way — every claim in this report is source-read or
`git`-derived, and nothing was executed against their data.**

---

# INTEGRITY

```
docs/payment-method-not-recorded-report.md   bytes 16,822
NUL 0 · <0x09 0 · 0x0B 0 · 0x0C 0 · 0x0E-0x1F 0 · 0x7F 0 · CR 0 · TAB 0
```

CARRIER-AWARE, PER EMOJI-PRESENTATION BASE. The Base column names each character by CODE POINT
and never prints the glyph, so this table cannot alter the counts it reports.

| Base | Occurrences | Paired with U+FE0F | Bare |
|---|---|---|---|
| U+1F534 (red circle) | 25 | 0 | 25 |
| U+26A0 (warning sign — TEXT presentation) | 9 | 9 | 0 |
| U+2705 (check mark button) | 19 | 0 | 19 |
| U+1F4B7 (banknote) | 1 | 0 | 1 |
| U+1F4B3 (credit card) | 1 | 0 | 1 |

U+26A0 is the only base here with TEXT presentation used as an emoji, and every occurrence is
PAIRED with U+FE0F. The rest have emoji presentation by default, so bare is correct for them.
⚠️ NO SOURCE FILE WAS EDITED, so there is no before/after census to report for one.

## Working tree

```
 M app/api/dashboard/route.ts
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/landing/landing.css
 M app/landing/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/dashboard/OrderCard.tsx
 M components/dashboard/UserMenu.tsx
 M components/shared/EventActionsModal.tsx
 M docs/privacy-manifest-report.md
 M docs/reference-manual.md
 M lib/plan-features.ts
?? components/shared/ExtraWaitModal.tsx
?? docs/add-order-overflow-fix-report.md
?? docs/add-order-overflow-report.md
?? docs/add-order-overflow-third-report.md
?? docs/event-actions-rename-report.md
?? docs/kds-copy-apply-report.md
?? docs/kds-phone-controls-final-report.md
?? docs/kds-phone-expand-final-report.md
?? docs/kds-phone-expand-report.md
?? docs/kds-phone-width-fix-report.md
?? docs/kds-screen-on-header-report.md
?? docs/kds-sound-chips-report.md
?? docs/kds-view-panel-report.md
?? docs/landing-features-move-report.md
?? docs/offline-protection-kds-fix-report.md
?? docs/offline-protection-kds-report.md
?? docs/payment-method-not-recorded-report.md
?? docs/plan-feature-order-domain-report.md
?? docs/screen-sound-alignment-report.md
?? docs/screen-sound-fix-report.md
?? docs/splice-verification-report.md
?? docs/van-name-hide-report.md
?? docs/van-name-visibility-report.md
?? lib/native/useHeartbeat.ts
```

| Entry | Pre-existing? |
|---|---|
| 🔴 `?? docs/payment-method-not-recorded-report.md` | 🔴 **THIS TASK — the only file written, and the only entry this task created** |
| every `M` entry and every other `??` | ✅ **ALL pre-existing** — earlier tasks this session (the KDS phone-header arc, the van-name field, the landing work, the manual's V11.26 update, the Add-order overflow fix). 🔴 **THIS TASK EDITED NO SOURCE FILE** |

Nothing was committed, staged, reverted, stashed or cleaned. No `git stash`, `git checkout` or
`git restore` was run at any point.
