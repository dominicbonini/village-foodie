# Add-order confirm sequence — pre-design diagnosis

**Date:** 2026-08-03 · **Branch:** main @ 31247ce · **Mode:** read-only, facts only, no proposals.
Companion to [docs/buzzer-diagnosis-report.md](docs/buzzer-diagnosis-report.md).

---

## 0. Prompt integrity

No span of this prompt arrived garbled. All seven sections parsed cleanly and are answered below.

One phrasing in §5 needed a distinction rather than a repair, and I have kept both readings separate
rather than picking one: *"whether any non-status single-field write currently goes through the queue"*
is answered twice — once for writes to the **`orders` row** (none), once for **single-field writes of any
kind** (five exist, all to stock tables). See §5.4. That is a disambiguation, not a correction.

---

## 1. THE POST-CONFIRM SEQUENCE

All line numbers in [components/dashboard/AddOrderPanel.tsx](components/dashboard/AddOrderPanel.tsx)
unless stated. The whole flow is one function, `submitManual`
([:747-1020](components/dashboard/AddOrderPanel.tsx#L747-L1020)), which **recurses into itself** for
every override path.

### 1.1 The tap

Which button exists depends on `showPaidStep` ([:1151](components/dashboard/AddOrderPanel.tsx#L1151)) —
see §2. All four possible confirm buttons do the same two things: set the payment refs, then call
`submitManual()` with **no arguments**.

| Button | Line | onClick |
|---|---|---|
| "Confirm order" (paid step ON) | [1153-1154](components/dashboard/AddOrderPanel.tsx#L1153-L1154) | `takePaymentRef.current = false; void submitManual()` |
| "💷 Cash" | [1165-1166](components/dashboard/AddOrderPanel.tsx#L1165-L1166) | `takePaymentRef.current = true; paymentMethodRef.current = 'cash'; void submitManual()` |
| "💳 Card" | [1174-1175](components/dashboard/AddOrderPanel.tsx#L1174-L1175) | `takePaymentRef.current = true; paymentMethodRef.current = 'card'; void submitManual()` |
| "Take payment" | [1185-1186](components/dashboard/AddOrderPanel.tsx#L1185-L1186) | `takePaymentRef.current = true; paymentMethodRef.current = null; void submitManual()` |
| "Confirm order · £X" (paid step OFF) | [1197-1198](components/dashboard/AddOrderPanel.tsx#L1197-L1198) | `submitManual()` |

All are `disabled={loading || !hasItems || !manualEvent}`.

`takePaymentRef` and `paymentMethodRef` are **refs, not state**, and the reason is stated at
[:723-725](components/dashboard/AddOrderPanel.tsx#L723-L725): *"it is set at the instant of the tap and
read inside submitManual, so it survives the override/re-submit recursion (submitManual(true, true)
retries) without threading a parameter through three call sites."*

### 1.2 Step-by-step

**Step 1 — guard and slot resolution.** [:748-749](components/dashboard/AddOrderPanel.tsx#L748-L749):

```ts
if (!hasItems) return
const effectiveSlot = manualSlot || adjustedAsapSlot?.collection_time || null
```

**Step 2 — LIVE capacity fit check.** [:761-767](components/dashboard/AddOrderPanel.tsx#L761-L767).
Gated on `!skipFitCheck && effectiveSlot && manualEvent && isOnline()`. Fires a fresh
`fetch('/api/slots/…', { cache: 'no-store' })`, then runs `projectBackwardOccupancy` +
`fitOrderBackward` ([:772-794](components/dashboard/AddOrderPanel.tsx#L772-L794)).

The whole block is wrapped in `try { … } catch { }` — [:874](components/dashboard/AddOrderPanel.tsx#L874):

```ts
} catch { /* FAIL OPEN — a flaky check must never block a manual order */ }
```

**Step 3 — the over-capacity MODAL (conditional, blocking, and the only pre-insert modal).**
If `!fit.fits`, the handler builds the modal payload and **returns without submitting** —
[:861-871](components/dashboard/AddOrderPanel.tsx#L861-L871):

```ts
setCapacityConfirm({
  slot: effectiveSlot,
  variant: bind.kind === 'lead' ? 'toosoon' : (seenTone !== 'red' && freshTone === 'red') ? 'filled' : 'over',
  windowFrom: fit.spanFromMins != null ? fmtMins(fit.spanFromMins) : null,
  bind,
  unitWord,
  contributors,
  thisOrderQty,
  override,
})
return // NOTHING is submitted — the modal's buttons decide.
```

Modal JSX at [:1698-1763](components/dashboard/AddOrderPanel.tsx#L1698-L1763). Two buttons, no dismiss —
no ✕, no backdrop-click handler (the backdrop at [:1700](components/dashboard/AddOrderPanel.tsx#L1700) is
a bare `<div>` with no `onClick`):

- **"Pick another time"** [:1743-1747](components/dashboard/AddOrderPanel.tsx#L1743-L1747) → `setManualSlot(''); setCapacityConfirm(null)`
- **"Place it anyway"** [:1748-1758](components/dashboard/AddOrderPanel.tsx#L1748-L1758) → `void submitManual(ov, true, true)` — **recursion #1**

Header comment [:1692-1697](components/dashboard/AddOrderPanel.tsx#L1692-L1697): *"INFORMED CONSENT, not
a block: the operator can always proceed… Nothing has been submitted at this point — both buttons
decide."*

**Step 4 — enter the submitting state.** [:877-878](components/dashboard/AddOrderPanel.tsx#L877-L878):

```ts
setLoading(true)
setSubmitting(takePaymentRef.current ? (paymentMethodRef.current ? `take-${paymentMethodRef.current}` as const : 'take') : 'plain')
```

Two separate flags on purpose — [:727-732](components/dashboard/AddOrderPanel.tsx#L727-L732): *"`loading`
is one shared boolean, so both confirm buttons read it and BOTH switched to 'Confirming…'. Only the
pressed one should say that."* `submitting` is a state (`'take' | 'take-cash' | 'take-card' | 'plain' |
null`, [:732](components/dashboard/AddOrderPanel.tsx#L732)); `loading` is a plain boolean
([:162](components/dashboard/AddOrderPanel.tsx#L162)).

**Step 5 — MINT THE order_key CLIENT-SIDE.** [:880-883](components/dashboard/AddOrderPanel.tsx#L880-L883):

```ts
// Client-mint the identity so an OFFLINE create is idempotent on replay (order_key) and carries a
// stable device-prefixed provisional number until the server assigns the real one.
const orderKey = newUuid()
const provisional = isOnline() ? '' : await nextProvisionalId()
```

**Step 6 — build the payload.** [:884-924](components/dashboard/AddOrderPanel.tsx#L884-L924). Reads
`takePaymentRef` / `paymentMethodRef` here, both re-gated on `showPaidStep`
([:922-923](components/dashboard/AddOrderPanel.tsx#L922-L923)):

```ts
paymentTaken: showPaidStep ? takePaymentRef.current : false,
paymentMethod: showPaidStep && takePaymentRef.current ? paymentMethodRef.current : null,
```

**Step 7 — the single POST, through the offline gate.**
[:926-930](components/dashboard/AddOrderPanel.tsx#L926-L930):

```ts
const result = await gatedAction({
  url: '/api/dashboard/action',
  kind: 'create', order_key: orderKey, provisional_id: provisional, online: isOnline(),
  body: { token, pin, action: 'manual', manualOrder },
})
```

**Step 8 — OFFLINE branch (terminal).** [:934-947](components/dashboard/AddOrderPanel.tsx#L934-L947).
Builds a synthetic `Order`, hands it up, resets, closes the sheet, returns. Nothing below runs:

```ts
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

**Step 9 — four 409 branches, each a re-entry point.** All keep the basket and return; three use a
**native `window.confirm`**, one is a toast-only retry:

| Branch | Line | UI | Accept action |
|---|---|---|---|
| `data.retry` (lock contention) | [950-953](components/dashboard/AddOrderPanel.tsx#L950-L953) | toast "Busy right now — tap Confirm again in a moment" | operator re-taps |
| `data.categoryClosed` | [957-963](components/dashboard/AddOrderPanel.tsx#L957-L963) | `window.confirm` "Add anyway (for the hatch)?" | `await submitManual(true, true)` — **recursion #2** |
| `data.stock` | [966-976](components/dashboard/AddOrderPanel.tsx#L966-L976) | `window.confirm` "Proceed anyway (oversell)?" | `await submitManual(true, true)` — **recursion #3** |
| `data.optionStock` | [979-984](components/dashboard/AddOrderPanel.tsx#L979-L984) | `window.confirm` shared-pool oversell | `await submitManual(true, true)` — **recursion #4** |

**Step 10 — web-offline branch (terminal).** [:990-993](components/dashboard/AddOrderPanel.tsx#L990-L993):

```ts
if (!isNativeApp() && !result.queued && result.status == null) {
  showToast("Couldn't reach the server — you appear to be offline. The order was NOT sent. Keep this panel open and retry when you reconnect.", 'error')
  return
}
```

Note the comment at [:987-988](components/dashboard/AddOrderPanel.tsx#L987-L988): *"the basket stays in
this panel (no resetManual on this path)"*.

**Step 11 — error throw.** [:994](components/dashboard/AddOrderPanel.tsx#L994): `if (!result.ok) throw new Error(data.error)`.

**Step 12 — SUCCESS TOAST.** [:995](components/dashboard/AddOrderPanel.tsx#L995):

```ts
showToast(`Order #${data.orderId} confirmed`)
```

The server response supplies `orderId` (the display number) — **not** `order_key`
([app/api/dashboard/action/route.ts:1214](app/api/dashboard/action/route.ts#L1214)).

**Step 13 — a SECOND, un-gated POST: `decrement_stock`.**
[:996-1007](components/dashboard/AddOrderPanel.tsx#L996-L1007). Fire-and-forget (`.catch(() => null)`),
plain `fetch`, not `gatedAction`:

```ts
await fetch('/api/dashboard/action', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ token, pin, action: 'decrement_stock', items: manualItems, categoryMap }),
}).catch(() => null)
```

**Step 14 — RESET.** [:1008-1009](components/dashboard/AddOrderPanel.tsx#L1008-L1009):
`resetManual()` then `setShowOrderSheet(false)`.

**Step 15 — refresh the slot dots.** [:1010-1012](components/dashboard/AddOrderPanel.tsx#L1010-L1012):

```ts
if (manualEvent) {
  await fetchManualSlots(manualEvent.event_date, manualEvent.start_time, manualEvent.end_time)
}
```

**Step 16 — hand back to the dashboard.** [:1013](components/dashboard/AddOrderPanel.tsx#L1013):
`onOrderPlaced()` — no argument, so the parent takes the online branch.
[app/dashboard/[token]/page.tsx:2813](app/dashboard/[token]/page.tsx#L2813):

```tsx
onOrderPlaced={(optimistic?:Order)=>{if(optimistic){setDeviceQueuedOrders(p=>[optimistic,...p])}else{fetchAll()}setActiveTab('orders')}}
```

**⚠️ The panel is left, not closed.** `setActiveTab('orders')` switches the dashboard tab; the panel is
hidden by CSS and never unmounted ([page.tsx:2790-2793](app/dashboard/[token]/page.tsx#L2790-L2793)).

**Step 17 — `finally`.** [:1016-1019](components/dashboard/AddOrderPanel.tsx#L1016-L1019):

```ts
} finally {
  setLoading(false)
  setSubmitting(null)
}
```

Runs on **every** exit path including the early 409 returns and the thrown-error catch — so the buttons
always re-enable.

### 1.3 The one screen change not in `submitManual` — the phone bottom sheet

On `md:` and below, the panel has a sticky bar with "Review order →"
([:1664-1670](components/dashboard/AddOrderPanel.tsx#L1664-L1670)) that opens a bottom sheet
([:1674-1690](components/dashboard/AddOrderPanel.tsx#L1674-L1690)) titled **"Confirm order"** containing
`cartLines` + `submitPanel`. So on phone the confirm bar lives inside a dismissible sheet (backdrop click
and a ✕ at [:1681-1682](components/dashboard/AddOrderPanel.tsx#L1681-L1682)); on desktop it is inline.
`setShowOrderSheet(false)` at steps 8 and 14 is what closes it after a successful place.

### 1.4 Condensed order

```
tap → [fit check → capacity MODAL (blocking, 2 buttons)] → setLoading/setSubmitting
    → newUuid() → gatedAction POST
    → [OFFLINE: optimistic Order + toast + reset + RETURN]
    → [409 ×4: window.confirm / toast → recurse or RETURN, basket kept]
    → [web-offline: toast + RETURN, basket kept]
    → toast "Order #N confirmed"
    → decrement_stock POST (fire-and-forget)
    → resetManual() → setShowOrderSheet(false) → fetchManualSlots() → onOrderPlaced()
    → parent: fetchAll() + setActiveTab('orders')
    → finally: setLoading(false) + setSubmitting(null)
```

There is **no post-success modal, sheet, or confirmation screen**. The only feedback after the order
lands is a toast, and the tab switches away from the panel.

---

## 2. WHERE `show_paid_step` INSERTS ITSELF

### 2.1 It is a BUTTON-SHAPE change, not a step

`show_paid_step` does not add a stage to the sequence in §1. It changes **which buttons render in the
confirm bar**, and therefore what `takePaymentRef` is set to before the single `submitManual()` call.
The number of taps is identical either way: **one**.

### 2.2 The resolution

[:717](components/dashboard/AddOrderPanel.tsx#L717):

```ts
const { showPaidStep, takesCash } = resolvePaidStep(truck, liveEvent as any)
```

⚠️ It reads `liveEvent`, **not** `manualEvent`. The reason is at
[:713-716](components/dashboard/AddOrderPanel.tsx#L713-L716): *"a walk-up added to Saturday's festival
still gets SATURDAY's setting even if the operator is looking at the dashboard on Friday, because
liveEvent preserves manualEvent's IDENTITY and only refreshes its VALUES."*

The resolver — [lib/payments/paid-step.ts:63-71](lib/payments/paid-step.ts#L63-L71):

```ts
export function resolvePaidStep(
  truck: PaidStepTruck | null | undefined,
  event: PaidStepEvent | null | undefined,
): ResolvedPaidStep {
  return {
    showPaidStep: event?.show_paid_step_override ?? truck?.show_paid_step ?? false,
    takesCash: event?.takes_cash_override ?? truck?.takes_cash ?? false,
  }
}
```

### 2.3 The gate

[:1151](components/dashboard/AddOrderPanel.tsx#L1151):

```tsx
{showPaidStep ? (
```

with a nested gate for the cash split at [:1160](components/dashboard/AddOrderPanel.tsx#L1160):
`{takesCash ? (`.

### 2.4 What the operator sees and taps

| `showPaidStep` | `takesCash` | Rendered | Line |
|---|---|---|---|
| `false` | — | ONE full-width button: `Confirm order · £X.XX` (`bg-orange-600`, `py-4`, `text-base`) | [1197-1203](components/dashboard/AddOrderPanel.tsx#L1197-L1203) |
| `true` | `false` | TWO in a row: `Confirm order` (`ORANGE_OUTLINE`) + `Take payment` / `£X.XX` (`ORANGE_SOLID`) | [1152-1159](components/dashboard/AddOrderPanel.tsx#L1152-L1159), [1185-1193](components/dashboard/AddOrderPanel.tsx#L1185-L1193) |
| `true` | `true` | THREE in a row: `Confirm order` + `💷 Cash £X.XX` + `💳 Card £X.XX` | [1152-1183](components/dashboard/AddOrderPanel.tsx#L1152-L1183) |

Design constraints recorded at [:1140-1150](components/dashboard/AddOrderPanel.tsx#L1140-L1150):

> A ROW, not a stack. Two stacked full-width primaries create a "which one is the default?" problem and
> put the second target directly under the thumb's travel from the first — a mis-tap that records money.
> … The amount is stacked under the label so it can never clip at narrow widths…
> Both actions confirm the order; only one records payment. Neither is remembered.

### 2.5 Does it block, or can it be dismissed?

**Neither.** It is not a prompt, dialog, or overlay — it is the confirm bar itself. There is nothing to
dismiss and nothing to skip: **every** variant places the order. "Confirm order" is the no-payment path
and is always present when the paid step is on.

- No modal, no `window.confirm`, no intermediate screen.
- No pre-selection. [:718-722](components/dashboard/AddOrderPanel.tsx#L718-L722): *"🔴 NO REMEMBERED
  DEFAULT — open-check semantics… the confirm bar offers TWO equal actions and the operator picks one per
  order, at the moment of sale."*
- No memory between orders. `resetManual` clears both refs —
  [:690-693](components/dashboard/AddOrderPanel.tsx#L690-L693): *"Nothing is remembered between orders by
  design — the next order presents both actions again with neither pre-selected."*

The **only** blocking overlay anywhere in this flow is the over-capacity modal (§1.2 step 3), and it fires
before any of this.

---

## 3. INSERT ORDER vs PAID STEP — where `order_key` exists

### 3.1 Short answer

The `order_key` **exists on the client before the POST is even sent**, and the row is **INSERTed before
any payment is recorded**. Both are unconditional.

### 3.2 Client side — `order_key` precedes everything

[:882](components/dashboard/AddOrderPanel.tsx#L882): `const orderKey = newUuid()` runs at the top of the
try block, *before* the payload is built and *before* `gatedAction` is called. It is passed both in
`manualOrder.order_key` ([:885](components/dashboard/AddOrderPanel.tsx#L885)) and as the gate's
`order_key` ([:928](components/dashboard/AddOrderPanel.tsx#L928)).

So a client-side buzzer prompt has a stable `order_key` available at **step 5 onward** in §1.2 — including
in the offline branch, where the optimistic `Order` already carries it
([:936](components/dashboard/AddOrderPanel.tsx#L936)).

⚠️ The server response does **not** return it —
[route.ts:1214](app/api/dashboard/action/route.ts#L1214) returns
`{ success, orderId, autoConfirmed, paymentWarning? }`. The client's own `orderKey` variable is the only
post-submit handle.

### 3.3 Server side — INSERT first, payment second

Sequence inside `action === 'manual'`
([app/api/dashboard/action/route.ts](app/api/dashboard/action/route.ts)):

1. **Display number** — `nextOrderId()` or the offline provisional, lines [1012-1023](app/api/dashboard/action/route.ts#L1012-L1023).
2. **INSERT** — lines [1032-1073](app/api/dashboard/action/route.ts#L1032-L1073). Upsert when a client key was minted, plain insert otherwise:
   ```ts
   if (clientOrderKey) insertPayload.order_key = clientOrderKey
   …
   const up = await supabase.from('orders').upsert(insertPayload, { onConflict: 'order_key', ignoreDuplicates: true }).select('order_key').maybeSingle()
   …
   manualOrderKey = manualOrderRow.order_key
   ```
   Fails **closed**: `return NextResponse.json({ error: 'Failed to save order' }, { status: 500 })` ([1069-1072](app/api/dashboard/action/route.ts#L1069-L1072)).
3. Counter advance for offline ids ([1080-1091](app/api/dashboard/action/route.ts#L1080-L1091)), `rebuildProductionSlotUsage` ([1099](app/api/dashboard/action/route.ts#L1099)), lock release ([1100-1104](app/api/dashboard/action/route.ts#L1100-L1104)).
4. Venue lookup + customer email + truck email ([1106-1183](app/api/dashboard/action/route.ts#L1106-L1183)).
5. **PAYMENT LAST** — [1194-1212](app/api/dashboard/action/route.ts#L1194-L1212):
   ```ts
   let manualPaymentWarning: string | null = null
   if ((await paidStepFor(truck, manualOrder?.event_id)).showPaidStep && manualOrder?.paymentTaken === true && manualOrderKey) {
   ```
   Fails **open** — [1189-1191](app/api/dashboard/action/route.ts#L1189-L1191): *"the order is ALREADY
   CREATED above and must stay created. An accounting failure must never undo or block order entry at the
   hatch."*

Note the server **re-resolves** the paid step via `paidStepFor` rather than trusting the client's
`paymentTaken` — matching the client-side comment at
[AddOrderPanel.tsx:919-922](components/dashboard/AddOrderPanel.tsx#L919-L922): *"the server also re-checks
show_paid_step before acting on it, so a stale client cannot book a payment on a truck that has not
enabled the flow."*

### 3.4 Timeline

```
CLIENT                                          SERVER
──────                                          ──────
newUuid() ─── order_key EXISTS here (:882)
build payload (:884)
gatedAction POST (:926) ──────────────────────► display number (:1012)
                                                INSERT orders row (:1058/:1066)  ← order_key persisted
                                                rebuild slot usage (:1099)
                                                emails (:1126, :1156)
                                                ledger row IF paymentTaken (:1195)
                              ◄──────────────── { orderId, … }
toast (:995)
decrement_stock POST (:1002)
resetManual() (:1008)
onOrderPlaced() (:1013)
```

---

## 4. WHAT RESETS THE PANEL, AND EXISTING "SKIP"-STYLE AFFORDANCES

### 4.1 `resetManual`

[:686-694](components/dashboard/AddOrderPanel.tsx#L686-L694) — the whole function:

```ts
const resetManual = () => {
  setManualName(''); setManualEmail(''); setManualPhone(''); setManualNotes('')
  setManualSlot(''); setManualItems([]); setAppliedDeals([])
  setActiveDealBundle(null)
  // Clear the per-order payment choice. Nothing is remembered between orders by design — the next
  // order presents both actions again with neither pre-selected.
  takePaymentRef.current = false
  paymentMethodRef.current = null
}
```

Eleven pieces of state; nine `setState` + two ref clears. Anything not listed here **survives** the reset
— notably `manualEvent`, `manualSlots`, `showOrderSheet` (cleared separately), and `capacityConfirm`
(cleared by its own modal buttons).

### 4.2 Every caller

| Caller | Line | Trigger |
|---|---|---|
| Offline-queued success | [945](components/dashboard/AddOrderPanel.tsx#L945) | `resetManual(); setShowOrderSheet(false); setLoading(false); setSubmitting(null)` |
| Online success | [1008](components/dashboard/AddOrderPanel.tsx#L1008) | followed by `setShowOrderSheet(false)` at [1009](components/dashboard/AddOrderPanel.tsx#L1009) |
| Controlled event changed under the panel | [554](components/dashboard/AddOrderPanel.tsx#L554) | `if (manualEvent && manualEvent.id !== controlledEvent.id) resetManual()` |
| Operator picks a different event in the picker | [1892](components/dashboard/AddOrderPanel.tsx#L1892) | `if (manualEvent && manualEvent.id !== ev.id) resetManual()` |

**It is NOT called on any failure path** — every 409 branch and the web-offline branch deliberately keep
the basket ([:962](components/dashboard/AddOrderPanel.tsx#L962), [:975](components/dashboard/AddOrderPanel.tsx#L975),
[:983](components/dashboard/AddOrderPanel.tsx#L983), [:987-988](components/dashboard/AddOrderPanel.tsx#L987-L988)).

### 4.3 What is NOT reset

No focus management, no scroll-to-top, no ref-based `.focus()` call anywhere in the panel. The panel is
not unmounted ([page.tsx:2790-2793](app/dashboard/[token]/page.tsx#L2790-L2793)), so all remaining state
persists across orders.

### 4.4 Existing "skip"-style affordances — NONE

A grep for `Skip`, `skip`, `Skip for now`, `Not now`, `Later` as user-facing button text across
`app/` and `components/` returns **no matches** (only unrelated prose, an admin debug `skipped=` counter
at [app/admin/page.tsx:1423](app/admin/page.tsx#L1423), and code comments). There is no "Skip", "Not now",
"Later", or "Don't ask again" control anywhere in this codebase.

**The four dismissal/optionality idioms that DO exist**, in this flow:

**(a) Collapsed `<details>` disclosure — the closest thing to "optional, opt in if you want".**
[:1107-1121](components/dashboard/AddOrderPanel.tsx#L1107-L1121):

```tsx
const contactDetails = (
  <details className="text-xs text-slate-400">
    <summary className="cursor-pointer select-none py-1">+ Add email / phone / notes</summary>
    <div className="mt-2 flex flex-col gap-2">
      <input type="email" placeholder="Email for receipt" value={manualEmail}
        onChange={e => setManualEmail(e.target.value)}
        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400" />
```

Three fields hidden behind one summary line; closed by default; never blocks submit.

**(b) An "— optional" placeholder on an always-visible field.**
[:1131-1137](components/dashboard/AddOrderPanel.tsx#L1131-L1137): `placeholder="Customer name — optional"`.
Blank resolves to the `'Walk-up'` sentinel server-side
([route.ts:1034](app/api/dashboard/action/route.ts#L1034)).

**(c) Two-equal-buttons, neither pre-selected** — the capacity modal ("Pick another time" / "Place it
anyway", [:1743-1758](components/dashboard/AddOrderPanel.tsx#L1743-L1758)) and the paid-step confirm bar
("Confirm order" / "Take payment", §2.4). In both, the "don't do the extra thing" option is a **peer
button that still completes the action**, not a dismissal.

**(d) Native `window.confirm` with hand-written OK/Cancel labelling** for the three override paths —
[:960](components/dashboard/AddOrderPanel.tsx#L960), [:971](components/dashboard/AddOrderPanel.tsx#L971),
[:981](components/dashboard/AddOrderPanel.tsx#L981), all of the form
`OK = proceed anyway   ·   Cancel = edit the order`.

The dashboard's own equivalent of a dismissible optional prompt is the **order card's paid chip →
remove-payment modal**, which was converted from an inline confirm to a modal precisely because the
inline version clipped ([OrderCard.tsx:247-257](components/dashboard/OrderCard.tsx#L247-L257)).

---

## 5. OFFLINE — `gatedAction`, replay, and what goes through the queue

### 5.1 How a status action is queued

[lib/native/orderGate.ts:122-154](lib/native/orderGate.ts#L122-L154) — the whole function:

```ts
export async function gatedAction(opts: {
  url: string
  body: Record<string, unknown>
  kind: OutboxKind
  order_key: string
  provisional_id?: string
  online?: boolean
  expectedFrom?: string[]   // merged into the QUEUED body only (the online attempt stays byte-identical)
}): Promise<GateResult> {
  const { url, body, kind, order_key, provisional_id, online, expectedFrom } = opts

  const queue = async (): Promise<GateResult> => {
    // expected_from rides ONLY on the replayed op → online requests are unchanged; the server guards replays.
    const queuedBody = expectedFrom ? { ...body, expected_from: expectedFrom } : body
    await enqueue({ kind, order_key, url, body: queuedBody, provisional_id })
    return { ok: false, queued: true, provisional_id, order_key }
  }

  // Native + known-offline → don't burn a timeout, queue immediately.
  if (isNativeApp() && online === false) return queue()

  try {
    const res = await post(url, body)
    const data = await res.json().catch(() => ({}))
    // A server RESPONSE (even an error) is NOT an offline case — return it as-is (web behaviour unchanged).
    return { ok: res.ok, queued: false, status: res.status, data, provisional_id, order_key }
  } catch {
    // Thrown fetch = could not reach the server. Queue on native; on web, surface as a failed (non-queued)
    // result so existing web error handling runs exactly as before.
    if (isNativeApp()) return queue()
    return { ok: false, queued: false, order_key }
  }
}
```

Three properties that matter:

- **Only native queues.** Web offline returns `{ ok: false, queued: false }` with no `status` — which is
  exactly the shape the panel's web-offline branch tests for ([AddOrderPanel.tsx:990](components/dashboard/AddOrderPanel.tsx#L990)).
- **A server error is never queued.** Any HTTP response, including 4xx/5xx, returns `queued: false`.
- **`expected_from` rides only on the queued copy** — the online request is byte-identical to a
  pre-gate `fetch`.

The status call site — [app/dashboard/[token]/page.tsx:1423](app/dashboard/[token]/page.tsx#L1423):

```ts
const result=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action,order_key:orderKey,...(action==='ready'?{defer_email:true}:{})},kind:'status',order_key:orderKey,online:isOnline(),expectedFrom:STATUS_REPLAY_EXPECTED_FROM})
```

with [lib/native/orderGate.ts:22](lib/native/orderGate.ts#L22):

```ts
export const STATUS_REPLAY_EXPECTED_FROM = ['pending', 'confirmed', 'modified', 'cooking', 'ready', 'collected']
```

### 5.2 Replay

`drainOutbox()` serialises on an in-flight promise
([orderGate.ts:162-173](lib/native/orderGate.ts#L162-L173)) then runs `drainOnce()`
([:175-227](lib/native/orderGate.ts#L175-L227)) FIFO. Per op:

1. **Malformed guard** ([:185-189](lib/native/orderGate.ts#L185-L189)) — missing `order_key`/`url`/`op_id`
   → flag `'conflict'`, skip, never post.
2. **Copy-on-write** ([:194-195](lib/native/orderGate.ts#L194-L195)) — *"the op is deserialized from
   storage and can be FROZEN/readonly in the runtime… NEVER mutate op in place."*
3. **POST** ([:198](lib/native/orderGate.ts#L198)).
4. Outcomes:
   - `res.ok` → `removeOp(op_id); synced++` ([:209-210](lib/native/orderGate.ts#L209-L210))
   - `409` → `state: 'conflict'` ([:215-217](lib/native/orderGate.ts#L215-L217))
   - other non-OK, `attempts >= MAX_ATTEMPTS` (5, [:18](lib/native/orderGate.ts#L18)) → `'conflict'`
   - other non-OK below MAX → `'pending'`, retry next drain
   - thrown fetch below MAX → `'pending'` and **`break`** (stop the whole drain — likely still offline)
   - thrown fetch at MAX → `'conflict'` and **`continue`** (poison op must not block the queue)

Idempotency, [:164-168](lib/native/orderGate.ts#L164-L168): *"server dedupes on order_key upsert /
status precondition, so a re-post of an already-applied op is a safe no-op that returns 2xx."*

**The server-side guard that makes 409 meaningful** —
[app/api/dashboard/action/route.ts:195-205](app/api/dashboard/action/route.ts#L195-L205):

```ts
// ── Offline-replay conflict guard (Phase 1) ───────────────────────────────
// A status op replayed from the offline outbox carries `expected_from` (the statuses it may apply FROM,
// incl. its target). If the order has since moved to a state NOT in that set — e.g. a customer
// cancelled/rejected it online while the operator advanced it offline — return 409 so the outbox FLAGS it
// for review instead of overwriting the cancel. Online requests omit expected_from → zero behaviour change.
if (Array.isArray(body.expected_from) && orderKey && action !== 'manual') {
  const { data: cur } = await supabase.from('orders').select('status').eq('order_key', orderKey).eq('truck_id', truck.id).single()
  if (cur && !body.expected_from.includes(cur.status)) {
    return NextResponse.json({ error: 'conflict', current_status: cur.status }, { status: 409 })
  }
}
```

⚠️ Note `action !== 'manual'` — creates are exempt from the precondition; their idempotency comes from
the `order_key` upsert instead.

### 5.3 The kinds

[lib/native/outbox.ts:53](lib/native/outbox.ts#L53):

```ts
export type OutboxKind = 'create' | 'status' | 'edit' | 'stock'
```

⚠️ **`'edit'` is declared but never used.** A grep for `gatedAction({` across `app/`, `components/` and
`lib/` returns ten call sites and none passes `kind: 'edit'`. The card's edit path uses a bare `fetch`
([app/dashboard/[token]/page.tsx:1562](app/dashboard/[token]/page.tsx#L1562)) and is therefore **not
offline-capable at all**.

### 5.4 Does any non-status single-field write go through the queue?

**Two answers, because the question separates cleanly:**

**(a) Writes to the `orders` row — NO. None.** Every `gatedAction` call that touches an order row is
`kind: 'status'` or `kind: 'create'`:

| Site | Kind | Action |
|---|---|---|
| [page.tsx:1423](app/dashboard/[token]/page.tsx#L1423) | `status` | confirm / ready / cooking / collected / undo_* |
| [page.tsx:1716](app/dashboard/[token]/page.tsx#L1716) | `status` | `cancel` (+ `cancellationReason`) |
| [page.tsx:1736](app/dashboard/[token]/page.tsx#L1736) | `status` | `reject` (+ `rejectionReason`) |
| [kds/page.tsx:449](app/dashboard/[token]/kds/page.tsx#L449) | `status` | same set, KDS |
| [AddOrderPanel.tsx:926](components/dashboard/AddOrderPanel.tsx#L926) | `create` | `manual` |

The two `cancel`/`reject` sites are the closest existing precedent — they carry an operator-typed free-text
field **as an extra key on a status action**, not as a write of their own.

**(b) Single-field writes of any kind — YES, five, all `kind: 'stock'`.**
[page.tsx:1589](app/dashboard/[token]/page.tsx#L1589), [:1596](app/dashboard/[token]/page.tsx#L1596),
[:1609](app/dashboard/[token]/page.tsx#L1609), [:1643](app/dashboard/[token]/page.tsx#L1643),
[:1649](app/dashboard/[token]/page.tsx#L1649) — `set_stock`, `set_category_stock`,
`set_category_available`, `set_modifier_option_available`, `set_modifier_option_stock`. Example:

```ts
const r=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action:'set_category_available',category,available,event_id},kind:'stock',order_key:`${event_id??'none'}:set_category_available:${category}`,online:isOnline()})
```

These write `event_item_stock` / `category_stock` / `modifier_options` — **never the `orders` table**.
They also demonstrate the queue's synthetic-key idiom: `order_key` carries
`` `${event_id}:${action}:${target}` `` for coalescing (last-write-wins), and the drain's malformed guard
explicitly whitelists it — [orderGate.ts:184](lib/native/orderGate.ts#L184): *"(A kind:'stock' op is VALID
here: it carries a SYNTHETIC key `${event_id}:${action}:${target}` in order_key, so it passes.)"*
None of them passes `expectedFrom`.

**So: a `set_buzzer`-shaped op would be the first single-field write to an `orders` row to go through the
queue.** The nearest existing patterns to borrow from are the `cancel`/`reject` extra-key-on-a-status-action
shape (order row, but not single-field) and the `kind: 'stock'` synthetic-key shape (single-field, but not
an order row).

---

## 6. TRAFFIC-LIGHT COLOURS

There are **two separate traffic lights** in this app, and they are **not** shared. Within each, the
colour expression is duplicated further.

### 6.1 Traffic light #1 — ORDER URGENCY (the card header)

**Definition:** [components/dashboard/helpers.ts:148-158](components/dashboard/helpers.ts#L148-L158) — one
function, `getHeaderStyle`, returning full Tailwind class strings:

```ts
/** Tailwind classes for the full-width ticket header bar, covering bg, text, and border. */
export function getHeaderStyle(state: HeaderState): string {
  switch (state) {
    case 'ready':   return 'bg-green-50 text-green-900 border-b border-green-200 border-t-4 border-t-green-500'
    case 'cooking': return 'bg-amber-50 text-amber-900 border-b border-amber-200 border-t-4 border-t-amber-400'
    case 'new':     return 'bg-slate-50 text-slate-900 border-b border-slate-200'
    case 'ok':      return 'bg-white text-slate-900 border-b border-slate-200'
    case 'warn':    return 'bg-amber-50 text-amber-900 border-b border-amber-200 border-t-4 border-t-amber-400'
    case 'late':    return 'bg-red-50 text-red-900 border-b border-red-200 border-t-4 border-t-red-500'
  }
}
```

Six states, five distinct treatments — `cooking` and `warn` are byte-identical amber.

**States:** `type AgeState = 'new' | 'ok' | 'warn' | 'late'`
([helpers.ts:33](components/dashboard/helpers.ts#L33)), extended to
`type HeaderState = AgeState | 'ready' | 'cooking'` ([:34](components/dashboard/helpers.ts#L34)).

**The rule** — [helpers.ts:104-109](components/dashboard/helpers.ts#L104-L109):

```ts
export function getAgeState(slotOffset: number, amberLeadMins: number = 5): AgeState {
  if (slotOffset >= 1)                       return 'late'  // overdue slot → red
  if (slotOffset >= -amberLeadMins)          return 'warn'  // within must-start window → amber (prep-aware)
  if (slotOffset >= -(amberLeadMins + 10))   return 'ok'    // approaching → white
  return 'new'                                              // far out → grey
}
```

The amber lead is prep-aware — [helpers.ts:82-90](components/dashboard/helpers.ts#L82-L90):

```ts
const AMBER_BUFFER_SECS = 120
export function cookAmberLeadMins(cookSecs: number): number {
  return Math.max(2, Math.ceil((cookSecs + AMBER_BUFFER_SECS) / 60))
}
```

Red has exactly one cause — [helpers.ts:118-119](components/dashboard/helpers.ts#L118-L119): *"RED
('late') fires ONLY when the SLOT is overdue (slotOffset >= 1) — the SOLE source of red."*

**SHARED — one place, two consumers.** `getHeaderStyle` is imported only by
[OrderCard.tsx:7](components/dashboard/OrderCard.tsx#L7) and applied at
[OrderCard.tsx:337](components/dashboard/OrderCard.tsx#L337). `getCombinedUrgency` has a second consumer,
the amber-due sound at [app/dashboard/[token]/page.tsx:1846](app/dashboard/[token]/page.tsx#L1846), which
reads the **state** and never re-derives a colour. No duplication.

⚠️ One near-miss inside the card: the lateness pill is a **separate, inline** red —
[OrderCard.tsx:573](components/dashboard/OrderCard.tsx#L573) `bg-red-600 text-white`, repeated at
[:535](components/dashboard/OrderCard.tsx#L535) and [:631](components/dashboard/OrderCard.tsx#L631) (three
inline copies, one per header variant). It is `red-600`, not the header's `red-500`/`red-50`.

### 6.2 Traffic light #2 — SLOT / OVEN LOAD (`SlotTone`)

**Type:** [lib/slot-indicator.ts:13](lib/slot-indicator.ts#L13):

```ts
export type SlotTone = 'green' | 'amber' | 'red'
```

**Where the tone is decided** — the engine, [lib/slot-availability.ts:766-786](lib/slot-availability.ts#L766-L786):

```ts
// Per-category batch tone (PREP grid) — UNCHANGED: full/over ⇒ red, partial ⇒ amber
// (worst wins, tie-break higher load).
let tone: SlotTone = 'green'
…
  const t: SlotTone = used >= batch - EPS ? 'red' : 'amber'
…
if (kitchenCapacity != null && conc >= kitchenCapacity - EPS) {
  tone = 'red'; bound_by = 'global ceiling'
}
```

**THREE independent renderings of that one tone:**

**(a) Emoji, in the slot-picker `<option>` labels** —
[lib/slot-display.ts:102](lib/slot-display.ts#L102):

```ts
const emoji = tone === 'red' ? '🔴' : tone === 'amber' ? '🟡' : '🟢'
```

Consumed at [AddOrderPanel.tsx:1047](components/dashboard/AddOrderPanel.tsx#L1047) and, for the edit
picker, [app/dashboard/[token]/page.tsx:3691](app/dashboard/[token]/page.tsx#L3691).

**(b) The SAME emoji, again, in a second file** —
[lib/slot-indicator.ts:49-53](lib/slot-indicator.ts#L49-L53):

```ts
switch (tone) {
  case 'red':   return { tone, emoji: '🔴', label: 'Full', remaining: 0 }
  case 'amber': return { tone, emoji: '🟡', label: '', remaining }
  default:      return { tone: 'green', emoji: '🟢', label: '', remaining }
}
```

⚠️ This file's header claims *"SINGLE SOURCE OF TRUTH for the slot traffic-light display"*
([slot-indicator.ts:2](lib/slot-indicator.ts#L2)), but a grep for `getSlotIndicator` finds **no live
caller** — only its own definition and two doc comments
([components/dashboard/types.ts:70](components/dashboard/types.ts#L70) and
[:73](components/dashboard/types.ts#L73)). The function that surfaces is `buildSlotIndicators` in
`lib/slot-display.ts`, which imports only the *type* from here
([slot-display.ts:11](lib/slot-display.ts#L11)). The emoji mapping is duplicated between the two, and
`slot-indicator.ts` also carries a **second, legacy tone calculation**
([:37-44](lib/slot-indicator.ts#L37-L44), `SOFT_CAP_RATIO = 0.85`, `pct >= 0.7 ? 'amber'`) that the engine
path never reaches.

**(c) Tailwind classes, in a private per-component map** —
[components/dashboard/DayLoadStrip.tsx:22-25](components/dashboard/DayLoadStrip.tsx#L22-L25):

```ts
const TONE: Record<'green' | 'amber' | 'red', { dot: string; text: string }> = {
  green: { dot: 'bg-emerald-500', text: 'text-emerald-700' },
  amber: { dot: 'bg-amber-400', text: 'text-amber-700' },
  red: { dot: 'bg-red-500', text: 'text-red-700' },
}
```

Applied at [:60](components/dashboard/DayLoadStrip.tsx#L60), [:81](components/dashboard/DayLoadStrip.tsx#L81),
[:85](components/dashboard/DayLoadStrip.tsx#L85). **Green here is `emerald`, not `green`** — a different
hue from the card header's `green-500`.

### 6.3 The action-button palette (NOT a traffic light, but shares the words)

[lib/ui-tokens.ts](lib/ui-tokens.ts) — genuinely shared, with measured contrast ratios in comments:

```ts
export const GREEN_SOLID = 'bg-green-600 hover:bg-green-700 text-white'
export const ORANGE_SOLID = 'bg-orange-600 hover:bg-orange-700 text-white'
export const ORANGE_OUTLINE = 'bg-white hover:bg-orange-50 text-orange-700 border border-orange-600'
export const DARK_SOLID  = 'bg-slate-800 hover:bg-slate-900 text-white'
```

with hex values and WCAG ratios at [:17-23](lib/ui-tokens.ts#L17-L23):
`green-600 #16a34a 3.30:1 ⚠️ BELOW AA` · `orange-600 #ea580c 3.56:1 ⚠️` ·
`orange-700 #c2410c 5.18:1 ✅` · `slate-800 #1e293b 14.63:1 ✅`.

The file exists **because** of exactly the duplication described above —
[ui-tokens.ts:2-5](lib/ui-tokens.ts#L2-L5): *"This file exists because there were TWO identical `green`
tokens… and the moment one moved for accessibility (green-600 → green-700, 3.30:1 → 5.02:1) they diverged.
Two copies that agree today are two copies that disagree tomorrow."*

Its semantics ([:7-13](lib/ui-tokens.ts#L7-L13)) — GREEN = kitchen state advancing, ORANGE = money,
SLATE = completion — deliberately assign green a **different** meaning from the urgency traffic light.

### 6.4 Summary

| Traffic light | Source of truth | Colour expression | Shared? |
|---|---|---|---|
| Order urgency | [helpers.ts:104-109](components/dashboard/helpers.ts#L104-L109) | [helpers.ts:149-158](components/dashboard/helpers.ts#L149-L158) Tailwind | ✅ one function, one consumer |
| ↳ lateness pill | — | `bg-red-600` inline ×3 ([OrderCard.tsx:535](components/dashboard/OrderCard.tsx#L535), [:573](components/dashboard/OrderCard.tsx#L573), [:631](components/dashboard/OrderCard.tsx#L631)) | ❌ triplicated |
| Slot/oven load | [slot-availability.ts:766-788](lib/slot-availability.ts#L766-L788) | emoji [slot-display.ts:102](lib/slot-display.ts#L102) | ❌ |
| Slot/oven load | — | emoji [slot-indicator.ts:50-52](lib/slot-indicator.ts#L50-L52) (dead) | ❌ duplicate |
| Slot/oven load | — | Tailwind [DayLoadStrip.tsx:22-25](components/dashboard/DayLoadStrip.tsx#L22-L25) (`emerald`) | ❌ |
| Action buttons | — | [ui-tokens.ts:30-43](lib/ui-tokens.ts#L30-L43) | ✅ |

**There is no single place that defines "green/amber/red" for this app.**

---

## 7. `truck_events` PER-EVENT BOOLEAN OVERRIDES

### 7.1 The columns — live schema

Read from the live PostgREST OpenAPI (same method as
[docs/buzzer-diagnosis-report.md](docs/buzzer-diagnosis-report.md) §6). `truck_events` has **40 columns**;
exactly **four** are nullable booleans acting as overrides:

| Column | Type | Null | Domain |
|---|---|---|---|
| `offline_protection_override` | boolean | nullable | **beyond payments** |
| `order_ready_override` | boolean | nullable | **beyond payments** |
| `show_paid_step_override` | boolean | nullable | payments |
| `takes_cash_override` | boolean | nullable | payments |

The only other booleans on the table are `auto_open` (NOT NULL, default `false`) and `auto_close`
(NOT NULL, default `true`) — event lifecycle settings, not overrides, and not nullable.

**Answer: yes — two exist beyond the payments pair.**

### 7.2 How one is read with a fallback — three different idioms

**(a) `??` chain in a shared resolver (payments)** —
[lib/payments/paid-step.ts:67-70](lib/payments/paid-step.ts#L67-L70):

```ts
return {
  showPaidStep: event?.show_paid_step_override ?? truck?.show_paid_step ?? false,
  takesCash: event?.takes_cash_override ?? truck?.takes_cash ?? false,
}
```

The `??`-not-`||` reason is documented at [:15-16](lib/payments/paid-step.ts#L15-L16): *"an explicit
override of FALSE must be honoured, not fall through to the default. `||` would treat `false` as 'unset'
and silently re-inherit — the bug this nullish chain avoids."*

**(b) `??` chain inline, server-side, falling back to the VAN (order-ready)** —
[app/api/dashboard/route.ts:404-406](app/api/dashboard/route.ts#L404-L406):

```ts
// event override ?? van global default ?? false (mirrors the offline ?? chain).
vanOrderReadyDefault = van?.order_ready_enabled ?? false
effectiveOrderReady = (capacityEvent as any)?.order_ready_override ?? vanOrderReadyDefault
```

⚠️ The fallback is `truck_vans.order_ready_enabled`, **not** a `trucks` column. Resolved server-side and
returned as one boolean — [route.ts:582](app/api/dashboard/route.ts#L582):
`effectiveOrderReady, // event override ?? van default ?? false (gates the Ready button)`. It reaches
the card as a prop ([OrderCard.tsx:121](components/dashboard/OrderCard.tsx#L121)).

**(c) An explicit null/undefined ternary, not `??` (offline protection)** —
[app/api/menu/[truckId]/route.ts:255-258](app/api/menu/[truckId]/route.ts#L255-L258):

```ts
const offlineProtectionEnabled =
  ev.offline_protection_override !== null && ev.offline_protection_override !== undefined
    ? ev.offline_protection_override
    : vanAutoPause
```

where `vanAutoPause = van?.auto_pause_on_offline ?? false`
([:253](app/api/menu/[truckId]/route.ts#L253)). Semantically identical to `??`, written longhand.

### 7.3 ⚠️ Seeding behaviour differs between them — and it is deliberate

The two idioms above are not the whole story. `order_ready_override` is **seeded at event creation and
bulk-written** when the truck default changes; the payments overrides are **not**.

[lib/payments/paid-step.ts:18-26](lib/payments/paid-step.ts#L18-L26):

> ⚠️ DELIBERATELY UNLIKE `order_ready_override`, WHICH THIS OTHERWISE MIRRORS.
> That column is SEEDED at event creation and BULK-WRITTEN onto every existing event when the truck
> default flips (app/api/manage/route.ts:~981, "they reset to the new value, by design"). Correct for
> the order-ready step; WRONG here. An operator who set Saturday's festival to take payment at order
> must not lose that because they changed their general default a week later.
> So: NO seeding at event creation, NO bulk write. Null-means-inherit gives the right behaviour for
> free — changing the truck default reaches every event that has NOT been explicitly overridden, and
> leaves the overridden ones alone. It also means an override never carries forward to the next event,
> because a new event simply has no row value. Both properties come from doing nothing.

The seeding helper for order-ready is [lib/van-utils.ts:25-43](lib/van-utils.ts#L25-L43)
(`getVanOrderReadyDefault`), whose own comment notes the null case: *"(multi-van, none given) → the event
keeps order_ready_override = null and effectiveOrderReady's ?? …"*.

The payments overrides expire by omission — [paid-step.ts:33-34](lib/payments/paid-step.ts#L33-L34):
*"Do not build an expiry mechanism; the absence of seeding IS the expiry."*

### 7.4 Where they are written

| Override | Write action | Line |
|---|---|---|
| `offline_protection_override` | `set_offline_protection` | [route.ts:1652-1658](app/api/dashboard/action/route.ts#L1652-L1658) |
| `order_ready_override` | `set_order_ready_override` | [route.ts:1670](app/api/dashboard/action/route.ts#L1670) |
| `show_paid_step_override` | `set_show_paid_step_override` | [route.ts:1498](app/api/dashboard/action/route.ts#L1498) |
| `takes_cash_override` | `set_takes_cash_override` | [route.ts:1523](app/api/dashboard/action/route.ts#L1523) |

All four are dashboard-Settings-tab actions and all four write `truck_events` **only** —
[route.ts:1495-1496](app/api/dashboard/action/route.ts#L1495-L1496): *"🔴 This writes truck_events ONLY.
The truck DEFAULT (trucks.show_paid_step) is owned by Manage → Settings."*

⚠️ **None of these four goes through `gatedAction`.** All are bare `fetch` calls
([page.tsx:1200](app/dashboard/[token]/page.tsx#L1200), [:1218](app/dashboard/[token]/page.tsx#L1218),
[:1276](app/dashboard/[token]/page.tsx#L1276), [:1296](app/dashboard/[token]/page.tsx#L1296)) using the
`markPending`/`applyPending` optimistic guard ([:203-217](app/dashboard/[token]/page.tsx#L203-L217)) with
manual revert-on-failure, e.g. [:1296](app/dashboard/[token]/page.tsx#L1296):
`setEventOrderReadyOverride(prevOverride); setEffectiveOrderReady(prevEffective) // revert optimistic on failure`.

The client reads the two non-payment overrides directly from Supabase, not via `/api/dashboard` —
[page.tsx:791-792](app/dashboard/[token]/page.tsx#L791-L792):

```ts
supabaseBrowser.from('truck_events').select('offline_protection_override, order_ready_override').eq('id',selectedEventId).single()
  .then(({data})=>{if(!cancelled){setEventOfflineOverride(data?.offline_protection_override??null);setEventOrderReadyOverride((data as any)?.order_ready_override??null)}})
```

⚠️ `truck_events` is **not** in the Supabase realtime publication and deliberately will not be added —
[page.tsx:1189](app/dashboard/[token]/page.tsx#L1189), [:1211](app/dashboard/[token]/page.tsx#L1211). Any
per-event setting propagates cross-device on the 60 s poll, not instantly.

---

## Appendix — files read for this report

| Path | Sections |
|---|---|
| [components/dashboard/AddOrderPanel.tsx](components/dashboard/AddOrderPanel.tsx) | 1, 2, 3, 4 |
| [app/api/dashboard/action/route.ts](app/api/dashboard/action/route.ts) | 3, 5, 7 |
| [app/dashboard/[token]/page.tsx](app/dashboard/[token]/page.tsx) | 1, 5, 6, 7 |
| [lib/native/orderGate.ts](lib/native/orderGate.ts) | 5 |
| [lib/native/outbox.ts](lib/native/outbox.ts) | 5 |
| [lib/payments/paid-step.ts](lib/payments/paid-step.ts) | 2, 7 |
| [components/dashboard/helpers.ts](components/dashboard/helpers.ts) | 6 |
| [lib/slot-display.ts](lib/slot-display.ts) · [lib/slot-indicator.ts](lib/slot-indicator.ts) · [lib/slot-availability.ts](lib/slot-availability.ts) | 6 |
| [components/dashboard/DayLoadStrip.tsx](components/dashboard/DayLoadStrip.tsx) · [lib/ui-tokens.ts](lib/ui-tokens.ts) | 6 |
| [app/api/dashboard/route.ts](app/api/dashboard/route.ts) · [app/api/menu/[truckId]/route.ts](app/api/menu/[truckId]/route.ts) · [lib/van-utils.ts](lib/van-utils.ts) | 7 |
| Live PostgREST OpenAPI (`$SUPABASE_URL/rest/v1/`) | 7 |
