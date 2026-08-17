# KDS: reject skips the reason modal — the pre-gate inventory

**STAGE 1 ONLY. READ-ONLY. No code was written.** Nothing was edited, created or deleted except this
report. No commit, no stage, no revert, no stash, no clean. No build, no `next dev`, no `next build`,
no `cap sync`, no deploy, no SQL, no migration.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

# ✅ THE CAUSE IS VERIFIED, NOT RE-DIAGNOSED. AND IT IS WORSE THAN "THE KDS LACKS A MODAL".

🔴 **The KDS's `handleAction` has NO pre-gate statements AT ALL — not one.** The dashboard has exactly
two, and both are the interception. **The list of what is missing is therefore short, and one item on
it is live, customer-facing and unrecoverable.**

---

# Q1 — THE DASHBOARD'S `doAction`, COMPLETE

**READ, `app/dashboard/[token]/page.tsx`, start to end — it is nine lines:**

```tsx
  const doAction=async(action:string,orderKey:string)=>{
    if(action==='cancel'){const ord=orders.find(o=>o.order_key===orderKey)??null;setCancellingOrder(ord);setShowCancelModal(true);return}
    if(action==='reject'){const ord=orders.find(o=>o.order_key===orderKey)??null;setRejectingOrder(ord);setShowRejectModal(true);return}
    setActionLoading(`${action}-${orderKey}`)
    try{
      // Offline GATE (mirrors KDS): online → normal write; offline (native) → durable outbox + queued.
      const result=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action,order_key:orderKey,...(action==='ready'?{defer_email:true}:{})},kind:'status',order_key:orderKey,online:isOnline(),expectedFrom:STATUS_REPLAY_EXPECTED_FROM})
      await handleGateResult(result,action,orderKey)
    }catch(err:any){showToast(err.message||'Failed','error')}finally{setActionLoading(null)}
  }
```

**READ — the KDS's `handleAction`, for comparison:**

```tsx
  const handleAction = useCallback(async (action: string, orderKey: string) => {
    setActionLoading(`${action}-${orderKey}`)
    try {
      const result = await gatedAction({
        url: '/api/dashboard/action',
        body: { token, pin, action, order_key: orderKey, ...(action === 'ready' ? { defer_email: true } : {}) },
        kind: 'status', order_key: orderKey, online: isOnline(), expectedFrom: STATUS_REPLAY_EXPECTED_FROM,
      })
      await handleGateResult(result, action, orderKey)
    } catch (err: any) { showToast(err.message || 'Failed', 'error') } finally { setActionLoading(null) }
  }, [token, pin, handleGateResult, showToast])
```

## Every statement before `gatedAction`, and whether the KDS has it

| # | Dashboard statement | What it does | KDS equivalent |
|---|---|---|---|
| 1 | `if(action==='cancel'){…setShowCancelModal(true);return}` | 🔴 **INTERCEPTS.** Resolves the order, opens the cancel modal, and **`return`s — the gate is never reached** | 🔴 **ABSENT** |
| 2 | `if(action==='reject'){…setShowRejectModal(true);return}` | 🔴 **INTERCEPTS.** Same shape, opens the reject modal, returns | 🔴 **ABSENT** |
| 3 | `setActionLoading(\`${action}-${orderKey}\`)` | spinner state | ✅ **PRESENT — identical** |

# ✅ THAT IS THE COMPLETE LIST. THREE STATEMENTS, TWO OF THEM THE INTERCEPTION, AND THE KDS HAS ONLY THE THIRD.

⚠️ **The post-gate half is genuinely shared** — both call `handleGateResult` from
`lib/native/useGatedActionResult.tsx`, and both `catch`/`finally` are byte-identical. **The extraction
did what it claimed; the interception was simply upstream of what it could carry.**

---

# Q2 — THE FULL PRE-GATE INVENTORY

**Every action reachable through `onAction`. EXECUTED — the complete set `OrderCard` can emit:**

```
cancel · collected · collected_card · collected_cash · confirm · cooking · mark_paid ·
mark_paid_card · mark_paid_cash · ready · reject · undo_collected · undo_mark_paid
```

| Action | Pre-gate step on the DASHBOARD | Pre-gate step on the KDS | Reachable on the KDS? |
|---|---|---|---|
| 🔴 **`reject`** | 🔴 **PRESENT — modal, mandatory reason** | 🔴 **ABSENT** | 🔴 **YES — THE LIVE DEFECT** |
| **`cancel`** | ✅ **PRESENT — modal, reason + refund decision** | 🔴 **ABSENT** | ⚠️ **NO — see below** |
| `confirm` | ABSENT — straight to the gate | ABSENT | ✅ yes — **parity** |
| `ready` | ABSENT | ABSENT | ✅ yes — **parity** |
| `cooking` | ABSENT | ABSENT | ⚠️ yes, but unproducible (`kds_mode` false everywhere) |
| `mark_paid` · `mark_paid_cash` · `mark_paid_card` | ABSENT | ABSENT | ✅ yes — **parity** |
| `collected` · `collected_cash` · `collected_card` | ABSENT | ABSENT | ✅ yes — **parity** |
| `undo_collected` | ABSENT | ABSENT | ✅ yes — **parity** |
| **`undo_mark_paid`** | ✅ **`PaymentActionsModal`** | ✅ **`PaymentActionsModal`** | ✅ **PARITY — see below** |
| **`edit`** | ✅ **PRESENT — `startEdit` opens the edit modal** | ⚠️ **N-A — `onEdit={() => {}}`, a no-op** | ✗ **the control is inert** |
| **refund** | ✅ **PRESENT — `onRefund={submitRefund}`** | ⚠️ **N-A — the prop is not passed** | ✗ |
| `modify` | ⚠️ **N-A — NO SUCH ACTION.** ✅ EXECUTED: zero occurrences server-side; the edit path is `action === 'edit'` on its own route call | — | — |

# 🔴 SO THE ANSWER TO "HOW MANY PRE-GATE STEPS ARE MISSING" IS **ONE THAT MATTERS, AND ONE THAT IS LATENT.**

## ✅ `undo_mark_paid` IS ALREADY GUARDED ON BOTH — the guard is inside the card

**READ, `components/dashboard/OrderCard.tsx`:**

```tsx
  const removePaymentModal = (
    <PaymentActionsModal
      open={confirmRemovePayment}
      onClose={() => setConfirmRemovePayment(false)}
…
      onUndoPayment={() => onAction('undo_mark_paid', order.order_key)}
```

⚠️ **THIS IS THE SHAPE THAT WORKED, AND IT IS WORTH NAMING: the guard lives in the SHARED COMPONENT, so
`onAction('undo_mark_paid')` is only ever dispatched from inside a modal that has already been
confirmed.** ✅ **Both surfaces render `OrderCard`, so both inherit it. No page-level interception was
needed.**

## ⚠️ `cancel` IS INTERCEPTED BUT UNREACHABLE ON THE KDS — SEE Q4

## 🔴 `reject` IS REACHABLE, AND HERE IS WHY

**READ — the `pending` button pair sits BEFORE every `viewMode` branch in `renderButtons`:**

```tsx
    if (order.status === 'pending') {
      return (
        <>
          <Btn label="✓ Confirm" colour="green" loading={isLoading('confirm')} onClick={() => onAction('confirm', order.order_key)} />
          <Btn label="✗ Reject"  colour="red"   loading={isLoading('reject')}  onClick={() => onAction('reject', order.order_key)} />
        </>
      )
    }
```

**and `pending` is on the KDS board — READ:**

```tsx
  const activeOrders = overlayedOrders.filter(o =>
    !['collected', 'cancelled', 'rejected'].includes(o.status)
  )
```

✅ **`'pending'` is not excluded, so a pending order renders on the KDS with a live Reject button and no
interception.** 🔴 **This is the observed defect, confirmed by reading rather than assumed.**

---

# Q3 — THE REJECT FLOW ON THE DASHBOARD, END TO END

## What opens the modal

```tsx
    if(action==='reject'){const ord=orders.find(o=>o.order_key===orderKey)??null;setRejectingOrder(ord);setShowRejectModal(true);return}
```

## The modal, and the reason options — READ, in full

```tsx
      {/* Reject order modal — REQUIRED reason (shown to the customer). Mirrors the cancel modal. */}
      {showRejectModal&&rejectingOrder&&(
```
```tsx
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Reason — required (shown to the customer)</label>
              <select value={rejectReason} onChange={e=>setRejectReason(e.target.value)} className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm">
                <option value="">Select a reason</option>
                <option value="Sold out of an item">Sold out of an item</option>
                <option value="Too busy — can't make it in time">Too busy — can&apos;t make it in time</option>
                <option value="Closing soon">Closing soon</option>
                <option value="Other">Other</option>
              </select>
```

| Option |
|---|
| `Sold out of an item` |
| `Too busy — can't make it in time` |
| `Closing soon` |
| `Other` — ⚠️ **promotes the free-text note to required** |

## 🔴 IS THE REASON MANDATORY? **YES — AND IT IS ENFORCED TWICE.**

**Enforcement 1 — the button is disabled until valid. READ:**

```tsx
              <button onClick={()=>confirmRejectOrder()} disabled={!((rejectReason!==''&&rejectReason!=='Other')||rejectNote.trim()!=='')} className="…disabled:opacity-50 disabled:cursor-not-allowed">Reject order</button>
```

**Enforcement 2 — the handler refuses anyway. READ:**

```tsx
  const confirmRejectOrder=async()=>{
    if(!rejectingOrder) return
    const note=rejectNote.trim()
    // REQUIRED reason: a concrete preset → preset (+ optional note); "Other" or no preset → the note
    // (mandatory). fullReason is never empty (the confirm button is also disabled until valid).
    const fullReason=(rejectReason&&rejectReason!=='Other')?[rejectReason,note].filter(Boolean).join(' — '):note
    if(!fullReason) return
```

✅ **NOT SKIPPABLE ON THE DASHBOARD. There is no path through that modal that sends an empty reason.**

## The request, and where the reason rides

```tsx
      const result=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action:'reject',order_key:orderKey,rejectionReason:fullReason},kind:'status',order_key:orderKey,online:isOnline(),expectedFrom:STATUS_REPLAY_EXPECTED_FROM})
```

🔴 **`confirmRejectOrder` CALLS `gatedAction` ITSELF — it does not route back through `doAction`.** ⚠️ **So
it also bypasses `handleGateResult`: it has its own `result.queued` / `!result.ok` handling and its own
toasts. That is a second, older copy of the post-gate shape that the parity extraction did not absorb.**

## The column

```ts
      await supabase.from('orders').update({ status: 'rejected', rejection_reason: rejectionReason || null }).eq('order_key', orderKey).eq('truck_id', truck.id)
```

⚠️ **`orders.rejection_reason` — a dedicated column, and the code comment says why:** *"NOT
cancellation_reason — a rejected order isn't cancelled"*.

## 🔴 WHAT THE CUSTOMER RECEIVES — AND THE BRANCH THAT OMITS THE REASON

**READ, `app/api/dashboard/action/route.ts`, the `reject` handler's email block in full:**

```ts
      if (order.customer_email) {
        // Mirrors the cancel email's reasonLine — the operator's reason, escaped, shown to the customer.
        const reasonLine = rejectionReason ? `<p style="color:#475569">Reason: ${escapeHtml(rejectionReason)}</p>` : ''
        await notifyCustomer(truck, order.customer_email, `Order #${order.id} update`,
          `<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px">
            <h2>Order update</h2>
            <p>Unfortunately <strong>${truck.name}</strong> is unable to fulfil order #${order.id}.</p>
            ${reasonLine}
            <p>Please order at the truck on arrival. Sorry for the inconvenience.</p>
            <p style="color:#64748b;font-size:13px">Powered by HatchGrab · hatchgrab.com</p>
          </body>`)
      }
```

**Email path: `notifyCustomer(truck, order.customer_email, …)`, fired inline in the reject handler.**

# 🔴 `const reasonLine = rejectionReason ? … : ''` — THIS IS THE BRANCH.

⚠️ **The server does not refuse a reasonless reject. It silently drops the line.** **So a KDS rejection
produces an email that reads, in full:**

> **Order update** — Unfortunately **{truck}** is unable to fulfil order #N. Please order at the truck
> on arrival. Sorry for the inconvenience.

🔴 **No reason, no recourse, and `rejection_reason` is NULL in the row — so nothing after the fact can
reconstruct what the operator meant.** ⚠️ **The email fires whenever `order.customer_email` is set; there
is no `defer_email` flag on this path and no undo action, unlike `ready`.**

---

# Q4 — CANCEL

## What the dashboard does that the KDS does not

**The cancel interception opens a modal that collects THREE things the reject modal does not:**

```tsx
      const result=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action:'cancel',order_key:orderKey,cancellationReason:fullReason||null,refunded_minor:refundedMinor,refund_declined:refundableMinor>0&&!cancelRefund},…})
```

| Field | Meaning |
|---|---|
| `cancellationReason` | the operator's reason — ⚠️ **`||null`, so unlike reject it IS optional here** |
| `refunded_minor` | 🔴 **money.** Only set when a refund actually SETTLED |
| `refund_declined` | 🔴 **that a refund was OFFERED and the operator kept the money** |

**READ — the refund is issued BEFORE the cancel, inside the same handler:**

```tsx
    if(cancelRefund&&refundableMinor>0){
      if(!cancelReason){setCancelError('Choose a reason for the refund.');return}
      setCancelBusy(true);setCancelError(null)
      const res=await submitRefund({orderKey,amountMinor:refundableMinor,reason:cancelReason,note:fullReason||'',context:'cancellation'})
```

⚠️ **And the comment states why none of it can be inferred server-side:** *"WHAT THE OPERATOR DECIDED
TRAVELS WITH THE CANCELLATION … Neither is inferred server-side — only this modal knows."*

## 🔴 BUT THE KDS CANNOT DISPATCH `cancel` — THE CONTROL IS SOLO-GATED

**READ, `OrderCard.tsx`:**

```tsx
            {viewMode === 'solo' && (['pending', 'confirmed', 'modified'].includes(order.status) || ['confirmed', 'modified', 'ready'].includes(order.status)) && (
```
```tsx
                  <button onClick={() => onAction('cancel', order.order_key)} disabled={isLoading('cancel')}
```

# ✅ THE GHOST Edit/Cancel ROW IS INSIDE `viewMode === 'solo'`, WHICH THE KDS NEVER RENDERS.

🔴 **So `cancel` on the KDS is LATENT, not live: the interception is missing, but no control dispatches
it.** ⚠️ **THE ASYMMETRY IS THE POINT: `reject` renders on every surface because its button sits ABOVE
the `viewMode` branching; `cancel` renders on one because its button sits INSIDE it. The two
interceptions were written as a pair and only one of them is load-bearing today.**

⚠️ **It is one prop-change away from becoming live.** If a future task surfaces Cancel on the KDS — and
the status-badge and Cook work has been moving elements out of `solo`-only branches all session — a
KDS cancel would fire with **no reason, no refund decision and no `refund_declined` flag**, which is a
money artefact rather than a copy one.

## Which modal — NOT `EventCancelModal`

✅ **`EventCancelModal` is the EVENT-level gate**, shared by the dashboard, the KDS and manage. **The
order-level cancel is a SEPARATE inline modal** in the dashboard page, driven by `showCancelModal` /
`cancellingOrder` / `cancelReason` / `cancelNote` / `cancelRefund`. **They are unrelated, and the KDS
already has the event one.**

---

# Q5 — IS THE REJECT MODAL SHARED? **NO. IT IS INLINE IN THE DASHBOARD PAGE.**

**READ — the markup lives at `app/dashboard/[token]/page.tsx`, in the page's JSX:**

```tsx
      {showRejectModal&&rejectingOrder&&(
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 flex flex-col gap-4">
```

✅ **EXECUTED — `components/shared/` contains `AppHeader`, `BrandHomeLink`, `CuisinePicker`,
`EventActionsModal`, `EventCancelModal`, `EventFinishTimeModal`. There is no reject modal there.**

## What extracting it would touch — ON GUSTO'S LIVE MONEY PATH

| State it owns | Line |
|---|---|
| `showRejectModal` | `:586` |
| `rejectingOrder` | `:587` |
| `rejectReason` | `:588` |
| `rejectNote` | (same block) |
| `resetRejectModal()` | `:608-609` |
| `confirmRejectOrder()` | `:2230-2248` |
| the Android back-handler registration | `:2378` — `[showRejectModal && !!rejectingOrder, resetRejectModal]` |
| the markup | `:4611-4637` |

⚠️ **THE BACK-HANDLER ENTRY IS THE NON-OBVIOUS ONE.** The modal is registered with the native back
stack; an extraction that moves the markup without moving that registration leaves the Android back
button dismissing the wrong overlay. **READ, it is a tuple in a list, not a prop.**

✅ **THE PRECEDENT FITS EXACTLY.** `EventActionsModal` and `EventFinishTimeModal` are shared with
per-surface callbacks, and an omitted callback hides that item — the same shape would let one modal
serve both surfaces while each keeps its own `confirmRejectOrder`.

🔴 **WHAT IT WOULD COST ON THE DASHBOARD, STATED BECAUSE YOU ASKED: the dashboard is the reference
rendering for a modal that gates a customer-facing email. Any extraction has to leave its markup,
its two-layer enforcement and its back-handler registration character-identical** — the same bar the
`useGatedActionResult` and `hideAmounts` extractions were held to.

**NAMING OPTIONS ONLY, AS INSTRUCTED — I am not recommending between them:**

1. **Extract to `components/shared/RejectOrderModal.tsx`** and mount on both, each passing its own
   confirm callback. **Touches the dashboard.**
2. **Add the two-line interception to the KDS and duplicate the modal there.** **Does not touch the
   dashboard — and is the sixth duplicated block the post-gate task was written to stop.**
3. **Move the interception INTO `OrderCard`** so the Reject button opens a card-owned modal, the way
   `PaymentActionsModal` already guards `undo_mark_paid`. **Touches the shared card, which both
   surfaces render.**

---

# Q6 — OFFLINE

# 🔴 THE REASON IS CAPTURED BEFORE THE GATE ON THE DASHBOARD, AND NOT AT ALL ON THE KDS.

**Dashboard — the reason is in the body handed TO `gatedAction`, so the outbox stores it:**

```tsx
      const result=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action:'reject',order_key:orderKey,rejectionReason:fullReason},…})
```

⚠️ **The comment says exactly this:** *"reason in the body for faithful replay"*. ✅ **A dashboard reject
queued offline replays WITH its reason, because `enqueue` persists the whole body.**

**KDS — the body is the generic one, and carries no reason:**

```tsx
        body: { token, pin, action, order_key: orderKey, ...(action === 'ready' ? { defer_email: true } : {}) },
```

| | Dashboard | KDS |
|---|---|---|
| reason captured | ✅ **before the gate** | 🔴 **never** |
| queued op carries it | ✅ yes | 🔴 **no** |
| **can a reason be added later?** | n/a | 🔴 **NO — the op is a frozen body in Preferences; nothing edits a queued op** |
| replay result | reason reaches the customer | 🔴 **reasonless email, `rejection_reason` NULL** |

⚠️ **AND THE OFFLINE CASE IS STRICTLY WORSE THAN THE ONLINE ONE: online, the operator at least sees the
rejection happen. A queued reject fires its email minutes later on reconnect, from a device whose
operator has moved on.** 🔴 **`reject` is in `OFFLINE_STATUS_MAP` (`reject: 'rejected'`), so the card
disappears from the board immediately and there is no surviving prompt to attach a reason to.**

---

# Q7 — OTHER GUARDS, REJECT-RELATED OR NOT

| Control | Dashboard | KDS | Verdict |
|---|---|---|---|
| **Order reject** | modal, mandatory reason | 🔴 **nothing** | 🔴 **THE DEFECT** |
| **Order cancel** | modal + refund decision | 🔴 nothing | ⚠️ latent — no control |
| **Undo payment** | `PaymentActionsModal` | ✅ same | ✅ **parity, via the shared card** |
| **Event cancel** | `EventCancelModal` | ✅ same shared modal | ✅ parity |
| **Event finish** | styled confirm | ✅ same | ✅ parity |
| **Switch event** | `window.confirm` naming both venues | ✅ `window.confirm` — ⚠️ **KDS's also names the affected order count** | ✅ both guarded |
| 🔴 **PAUSE ORDERS** | ✅ **MODAL — 10 / 20 / 30 min or "Until I turn it back on"** | 🔴 **`window.confirm`, then a HARDCODED 2 HOURS** | 🔴 **DIVERGENT — see below** |
| **Offline-protection toggle** | `window.confirm` ×2 | ⚠️ N-A — not on the KDS | — |
| **Edit order** | full edit modal | ⚠️ `onEdit={() => {}}` — inert | — |

## 🔴 THE PAUSE DIVERGENCE — NOT REJECT-RELATED, AND YOU ASKED FOR IT ANYWAY

**READ — the KDS:**

```tsx
      const confirmed = window.confirm('Pause orders? Customers will see "Not accepting orders" until you resume.')
      if (!confirmed) return
    }
    const paused_until = isPaused
      ? null
      : new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
```

**READ — the dashboard offers four durations instead:**

```tsx
              {[{label:'10 minutes',mins:10},{label:'20 minutes',mins:20},{label:'30 minutes',mins:30}].map(({label,mins})=>(
```
```tsx
              <button onClick={()=>{const until=new Date('2099-01-01').toISOString();…}}>Until I turn it back on</button>
```

⚠️ **A KDS pause is TWO HOURS with no way to choose, and its confirm text does not say so** — it says
*"until you resume"*, which is true of the dashboard's indefinite option and not of the two-hour
default. 🔴 **This is customer-facing too: customers see "Not accepting orders" for the whole window.**
**Reported, not diagnosed further.**

## ⚠️ ONE MORE, RECORDED BECAUSE IT IS THE SHAPE YOU NAMED

🔴 **`confirmRejectOrder` and `confirmCancelOrder` each call `gatedAction` DIRECTLY and each carry their
own `result.queued` / `!result.ok` / toast handling.** ✅ **Neither goes through `handleGateResult`.**
⚠️ **So the post-gate parity extraction covers `doAction`'s path only — these two are a second copy of
the same shape, on the dashboard, today.** **Any reject work will land on top of that; naming it now so
it is not discovered mid-change.**

---

# 🔴 VERIFICATION

| Claim | Method |
|---|---|
| The dashboard's `doAction` has exactly three pre-gate statements | ✅ **EXECUTED** — the whole function read, start to end |
| The KDS's `handleAction` has one | ✅ **EXECUTED** — same |
| The complete `onAction` set is thirteen names | ✅ **EXECUTED** — scan of `OrderCard.tsx`, de-duplicated |
| `reject` renders on every surface; `cancel` is solo-gated | ✅ **EXECUTED** — both branches read at their positions |
| `'pending'` is on the KDS board | ✅ **EXECUTED** — `activeOrders` read |
| The reason is mandatory, enforced twice | ✅ **EXECUTED** — the `disabled` expression and the `if(!fullReason) return` |
| `reasonLine` omits the reason when falsy | ✅ **EXECUTED** — the handler read in full |
| `rejection_reason` is the column | ✅ **EXECUTED** |
| The reject modal is inline, not shared | ✅ **EXECUTED** — `components/shared/` listed |
| `undo_mark_paid` is guarded on both via the shared card | ✅ **EXECUTED** |
| There is no `modify` action | ✅ **EXECUTED** — zero server-side occurrences; the path is `action === 'edit'` |
| The KDS pause is a hardcoded two hours | ✅ **EXECUTED** |
| **That a KDS rejection actually sends a reasonless email in production** | 🔴 **SOURCE READ ONLY** — traced from the button to the `reasonLine` branch. **No order was rejected and no mailbox was checked** |
| **That a queued KDS reject replays reasonless** | 🔴 **SOURCE READ ONLY** — from the body shape and `enqueue`'s persistence. **Not executed** |
| **That extracting the modal would leave the dashboard identical** | 🔴 **PREDICTIVE** — it describes code that does not exist |

🔴 **NOTHING WAS OBSERVED RUNNING. No browser, no device, no order, no email.**

---

# INTEGRITY

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. A SEPARATE pass over this report AFTER writing. It is the only file
this task wrote.**

```
  docs/kds-reject-parity-report.md   (SEPARATE PASS)    25,885  offending=0  CR=0
TOTAL OFFENDING: 0
```

## 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 56 | 0 | 56 |
| U+1F534 LARGE RED CIRCLE | 46 | 0 | 46 |
| **U+26A0 WARNING SIGN** | **29** | **29** | ✅ **0** |
| U+2717 BALLOT X | 4 | 0 | 4 |
| U+2713 CHECK MARK | 2 | 0 | 2 |

# ✅ EVERY WARNING SIGN IN THIS REPORT IS PAIRED — 29 OF 29, ZERO BARE.

⚠️ **The source strings this report quotes carry no bare `U+26A0`** — the two conflict markers that
supply one in the OrderCard reports are not on the reject path — **so 0 is the correct number here
rather than a suppressed one.**

✅ **The report's total `U+FE0F` count is 29, which exactly accounts for the 29 paired warning signs and
leaves none attached to any other base.** ✅ **The four unpaired bases are internally consistent — 0 of
56, 0 of 46, 0 of 4, 0 of 2 — so no base is split across two renderings.** ⚠️ **`U+2717` and `U+2713`
are bare because every occurrence is inside a verbatim quote of the card's own `✗ Reject` and
`✓ Confirm` button labels, which the source writes bare.

## `git status --porcelain`

```
$ git status --porcelain
 M docs/reference-manual.md
 M lib/apns.ts
?? docs/apns-key-fix-report.md
?? docs/kds-reject-parity-report.md
?? docs/push-diagnosis-report.md
```

**Which entries were already there before this pass began:**

| Entry | Pre-existing? |
|---|---|
| 🔴 **`?? docs/kds-reject-parity-report.md`** | 🔴 **THIS PASS — the only new entry, and the only file written** |
| `M docs/reference-manual.md` | ✅ pre-existing — the V11.23 update |
| `M lib/apns.ts` · `?? docs/apns-key-fix-report.md` | ✅ pre-existing — the APNs key task |
| `?? docs/push-diagnosis-report.md` | ✅ pre-existing — the push diagnosis |

✅ **Two modified and two untracked before; two modified and three untracked after. The single delta is
this report.**
