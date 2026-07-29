# Payments phase 1b part 1 — THE PAID STEP (BUILD REPORT)

**Date:** 29 July 2026 · **Repo:** `/Users/dominicbonini/dev/village-foodie` · **Branch:** `main`
**Status: ✅ BUILT.** `tsc --noEmit` clean; 16/16 ledger-derivation + 10/10 button-state cases pass.
**Migration NOT applied. `next dev` / `next build` NOT run.** No Stripe.

> This file replaces the previous audit-log build report. That content is not preserved anywhere.

**Prompt integrity:** no span read as garbled or truncated.

---

## 🔴 CONFIRMATION: `show_paid_step = false` CHANGES NOTHING

This is the claim that matters most, so here is the evidence rather than the assertion.

- **The column defaults to `false`** and is `NOT NULL`, so every existing truck — Gusto included — reads
  false the instant the migration lands, with no backfill and no window where it is undefined.
- **Every new affordance is gated on it**, in all three surfaces: `showPaidStep` appears 6× in
  `OrderCard.tsx`, 7× in `AddOrderPanel.tsx`, and the server re-checks `truck.show_paid_step === true`
  twice before acting on any client claim.
- **The button is byte-identical when off.** `completionBtn()`'s first branch returns exactly the
  original JSX — `<Btn label="Mark paid & done" colour="dark" loading={isLoading('collected')}
  onClick={() => onAction('collected', order.order_key)} />` — for all six live call sites.
  **Asserted by harness cases 1-3**: off + unpaid and off + paid both yield `Mark paid & done`, and the
  chip is `null` even for a fully-paid order.
- **`undo_collected` keeps its phase-1a behaviour exactly** when off (reverses status *and* payment);
  only the `splitPaidStep` branch is new.
- **Add Order sends `paymentTaken: false`** when off, and the server's `manual` block is skipped
  entirely, so walk-up creation is unchanged.
- **The confirm bar renders its original label** when off — the new label branches are all
  `showPaidStep && …`.

The only unconditional changes are: two nullable-by-default columns, one extra query in the dashboard
GET, and a 4px spacing increase on the notes block in window mode (see §D-notes).

---

## DIAGNOSE-FIRST ANSWERS

### D1 — AddOrderPanel's submit path

**The confirm button** ([AddOrderPanel.tsx:1066-1072](components/dashboard/AddOrderPanel.tsx#L1066), pre-change):

```tsx
<button onClick={() => submitManual()} disabled={loading || !hasItems || !manualEvent}
  className="w-full bg-orange-600 …">
  {loading ? 'Confirming...' : !manualEvent ? 'Select an event to confirm'
    : `Confirm order${manualTotal > 0 ? ` · £${manualTotal.toFixed(2)}` : ''}`}
</button>
```

**The handler** is `submitManual(override = false, skipFitCheck = false, capacityAck = false)`
([:680](components/dashboard/AddOrderPanel.tsx#L680)). It builds a `manualOrder` object
([:816-851](components/dashboard/AddOrderPanel.tsx#L816)) and posts through the offline gate
([:853-857](components/dashboard/AddOrderPanel.tsx#L853)):

```ts
const result = await gatedAction({
  url: '/api/dashboard/action',
  kind: 'create', order_key: orderKey, provisional_id: provisional, online: isOnline(),
  body: { token, pin, action: 'manual', manualOrder },
})
```

**Where a payment intent attaches without disturbing anything:** as one more field *inside*
`manualOrder`. That object is already the single payload the gate serialises, so a new key rides through
the outbox untouched (`enqueue` stores `body` verbatim) and replays intact. It does **not** touch the
optimistic row — that is built separately at [:862-869](components/dashboard/AddOrderPanel.tsx#L862) and
I left it alone. Adding a top-level body key instead would have been the riskier choice: the outbox's
malformed-op guard and the replay path both reason about the body's shape.

### D2 — The order card's action area

**The button**, six live sites, all identical
([OrderCard.tsx:316,319,340,354,357](components/dashboard/OrderCard.tsx#L316) + two disabled
placeholders at :327,:335):

```tsx
<Btn label="Mark paid & done" colour="dark" loading={isLoading('collected')}
     onClick={() => onAction('collected', order.order_key)} />
```

**The handler** is `doAction(action, orderKey)` in the dashboard page, which posts through `gatedAction`
([page.tsx:1222](app/dashboard/[token]/page.tsx#L1222)).

**The 7-second undo toast** ([page.tsx:1263-1264](app/dashboard/[token]/page.tsx#L1263), pre-change):

```ts
if(action==='collected'){
  showToast(`Order #${num} completed`,'success',
            {duration:7000,action:{label:'↩ Undo',run:()=>doAction('undo_collected',orderKey)}})
}
```

Undo is triggered by tapping the toast's action, and it calls `doAction('undo_collected', orderKey)` —
a normal server round-trip, not a local rollback. (Offline has a separate path: `removePendingStatusOp`
deletes the queued op instead.)

### D3 — Can `getOrderBalance` be used client-side?

**The function itself: yes, after a one-word change.** It is pure and has no I/O. But
`lib/payments/ledger.ts` opened with `import { SupabaseClient } from '@supabase/supabase-js'` — a
*value* import used only as a type, which would pull the client into the browser bundle. Changed to
`import type`. ([ledger.ts:47](lib/payments/ledger.ts#L47))

**The data: no — and this was the real finding.** `/api/dashboard` selects
`from('orders').select('*')` ([route.ts:126-139](app/api/dashboard/route.ts#L126)), so the dashboard
receives the **derived caches** (`payment_status`, `amount_paid`, `total_minor`) but **not a single
`order_payments` row**. Grep for `order_payments` in that route returned nothing.

So the card had two options, and I rejected the tempting one:

- ❌ Recompute from `amount_paid`/`total_minor` in the component. That is a *second derivation of
  payment state*, which is precisely what `lib/payments/ledger.ts` exists to prevent — and it would
  drift the moment the branch ordering changed (the `refunded`-vs-`unpaid` trap).
- ✅ **Ship the rows.** The dashboard GET now fetches `order_payments` for the visible orders in one
  extra query and returns them grouped as `payments: { [order_key]: rows[] }`
  ([route.ts:147-172](app/api/dashboard/route.ts#L147)). The card then calls the **real**
  `getOrderBalance(order, rows)`.

No second client fetch, one derivation, and the card can never disagree with `orders.payment_status`.
The query failure path is non-blocking and logs — the dashboard must render.

### D4 — The Settings tab boolean pattern

`auto_accept` is the template, and I matched it in all three layers.

**Server** ([action/route.ts](app/api/dashboard/action/route.ts)):
```ts
if (action === 'set_auto_accept') {
  const { value } = body
  await supabase.from('trucks').update({ auto_accept: !!value }).eq('id', truck.id)
  return NextResponse.json({ success: true })
}
```

**Client saver** ([page.tsx:1011-1022](app/dashboard/[token]/page.tsx#L1011)): `setSaving…(true)` →
`fetch('/api/dashboard/action', { action:'set_auto_accept', value })` → set local state → `showToast` →
`finally setSaving…(false)`.

**Render** ([page.tsx:2642-2666](app/dashboard/[token]/page.tsx#L2642)): a
`bg-white rounded-2xl shadow-sm border border-slate-200 p-4 divide-y divide-slate-100` card, a
title + `text-slate-500 text-xs` description, a `Saving…` pulse, and `<Toggle>`; the dependent
sub-option is `pt-3 pl-4` and conditionally rendered. **I copied this exactly**, including the
`${showPaidStep?'pb-3':''}` conditional padding and the `pl-4` child indent.

### D5 — Does `show_paid_step` already exist?

**No.** `grep -rn "show_paid_step|paid_step|default_walkup_payment|walkup_payment"` across `app`, `lib`,
`components` and `supabase/migrations` returns **zero matches**. Neither column exists and nothing
resembling them exists. Both are created by this pass's migration.

---

## THE NOTES / BUTTON SPACING FINDING

**You were right to ask, and window/KDS mode was worse than solo.**

- The notes block was `bg-slate-50 … px-3 py-2 mx-3 mb-2` — **8px** below it
  ([OrderCard.tsx:629](components/dashboard/OrderCard.tsx#L629)).
- The action area is `flex flex-col gap-2 mt-auto`
  ([:655](components/dashboard/OrderCard.tsx#L655)).
- **In solo mode** a ghost Edit/Cancel row sits between them
  ([:656](components/dashboard/OrderCard.tsx#L656)) — roughly 34px of button plus an 8px gap, acting as
  an accidental buffer.
- **In window/KDS mode that row is not rendered at all** — it is `viewMode === 'solo'`-gated. So the
  note sat **8px** above the completion button, with nothing between them, **in the densest layout on
  the smallest column**. That is the Square complaint's exact geometry.

**What I changed:** the notes block's bottom margin is now `mb-2` in solo (unchanged) and **`mb-3`
(12px) in window/KDS**, with a comment recording that the spacing is a safety property and must not be
reduced. A 4px change is modest — I did not want to alter card density unilaterally — so **flagging it
for your call: I would go further (16px, or reinstating a spacer row in window mode) if you want it.**

**The split button also reduces the consequence independently:** with `show_paid_step` on, the first tap
on an unpaid order now hits **"Mark paid"**, which does not move the order out of the queue and is
reversible from its own toast. A mis-reach that used to complete an order now, at worst, marks it paid.

---

## EXACT BUTTON COPY IN EVERY STATE

**Order card completion button** (`completionBtn()`,
[OrderCard.tsx:166-190](components/dashboard/OrderCard.tsx#L166)) — all ten rows harness-asserted:

| `show_paid_step` | Payment state | Label | Colour | Action fired |
|---|---|---|---|---|
| **off** | any | `Mark paid & done` | dark | `collected` |
| on | unpaid | `Mark paid` | teal | `mark_paid` |
| on | part paid | `Mark £5.50 paid` *(the outstanding balance)* | teal | `mark_paid` |
| on | paid / refunded | `Done` | dark | `collected` |

Disabled cooking-gate placeholders use the same labels with no action.

**The chip beside the price** (both the solo header and the window two-row header):

| State | Chip |
|---|---|
| off, any | *(none)* |
| on, unpaid | *(none — an unpaid order is the norm and needs no decoration)* |
| on, paid | `PAID` (green) |
| on, part paid | `£4.00 / £5.50 due` (amber) |

**Add Order confirm bar** ([AddOrderPanel.tsx:1066-1097](components/dashboard/AddOrderPanel.tsx#L1066)):

| State | Above the button | Primary button | Secondary text action |
|---|---|---|---|
| off | — | `Confirm order · £9.50` | — |
| on, taking payment | — | `Confirm and take £9.50` | `Pay at collection instead` |
| on, paying later | `Paying at collection` | `Confirm order` | `Take payment now instead` |

🔴 **No modal, no popup, no confirmation dialog** — the payment decision is a *state of the confirm
bar*, per §10's fast-tap rule. The secondary action is a quiet underlined text button, deliberately
lower-contrast than the primary.

⚠️ **The per-order flip never persists.** `setTakePaymentNow(truckDefaultTakeNow)` is called in
`resetManual()` ([:658](components/dashboard/AddOrderPanel.tsx#L658)), so the next order returns to the
truck default. A `useEffect` also re-syncs it if the truck default changes — but only while the sheet is
**closed**, so the control is never yanked out from under an operator mid-order.

---

## UNDO — TWO STAGES, TWO TOASTS

Each action carries its **own** toast that reverses **only that stage**, so a fast double tap is never
ambiguous: whichever toast is on screen belongs to the tap you just made.

| Tap | Toast | Undo label | Undo calls | Result toast |
|---|---|---|---|---|
| `mark_paid` | `Order #12 marked paid` (7s) | `↩ Undo` | `undo_mark_paid` | **`Undone — payment removed`** |
| `collected` (split on) | `Order #12 done` (7s) | `↩ Undo` | `undo_collected` | **`Undone — order not collected`** |
| `collected` (split off) | `Order #12 completed` (7s) | `↩ Undo` | `undo_collected` | *(unchanged)* |

**The server enforces the same one-stage rule**
([action/route.ts](app/api/dashboard/action/route.ts), `undo_collected`): a new `splitPaidStep` branch
means that when `show_paid_step` is **on**, undoing "Done" reverts the **status only** and leaves the
payment standing — the payment has its own undo. When **off**, it reverses both, exactly as phase 1a
did. Without this the toast would say one thing and the server would do another.

`undo_mark_paid` follows the existing rule verbatim: **audit FIRST** via `logActionOrThrow` passed as
`beforeDelete`, so a failed audit write aborts the delete and refuses the undo (**fails closed**); the
row is **deleted** rather than compensated because it is a mis-tap where no real money moved.

---

## FILES AND LINES CHANGED

| File | Change |
|---|---|
| **`supabase/migrations/20260729_trucks_paid_step_settings.sql`** *(new)* | see below |
| [lib/payments/ledger.ts:44-48](lib/payments/ledger.ts#L44) | `import` → **`import type`** for `SupabaseClient`, so `getOrderBalance` is client-importable |
| [components/dashboard/types.ts:103-106](components/dashboard/types.ts#L103) | `show_paid_step?`, `default_walkup_payment?` on `TruckData` |
| [app/api/dashboard/route.ts:124](app/api/dashboard/route.ts#L124), [:147-172](app/api/dashboard/route.ts#L147), [:509](app/api/dashboard/route.ts#L509) | `payments` map: one extra query, grouped by `order_key`, returned in the payload |
| [app/api/dashboard/action/route.ts](app/api/dashboard/action/route.ts) | `set_show_paid_step`, `set_default_walkup_payment`, **`mark_paid`** (fail-open), **`undo_mark_paid`** (fail-closed, audit-first); `undo_collected` gains the `splitPaidStep` branch; `manual` gains the paid-at-order block (fail-open) |
| [components/dashboard/OrderCard.tsx:9](components/dashboard/OrderCard.tsx#L9), [:105-155](components/dashboard/OrderCard.tsx#L105), [:157-197](components/dashboard/OrderCard.tsx#L157) | `showPaidStep` + `ledgerRows` props; `getOrderBalance` derivation; `completionBtn()` / `completionBtnDisabled()` / `paidChip`; all 8 button sites routed through the helpers; chip at both price sites; notes `mb-3` in window mode |
| [components/dashboard/AddOrderPanel.tsx:671-682](components/dashboard/AddOrderPanel.tsx#L671), [:658](components/dashboard/AddOrderPanel.tsx#L658), [:855](components/dashboard/AddOrderPanel.tsx#L855), [:1066-1097](components/dashboard/AddOrderPanel.tsx#L1066) | `takePaymentNow` state + reset; `paymentTaken` in `manualOrder`; the confirm-bar payment decision |
| [app/dashboard/[token]/page.tsx](app/dashboard/[token]/page.tsx) | 5 state vars incl. `payments`; two savers; payload hydration; both `<OrderCard>` sites get `showPaidStep`/`ledgerRows`; the Settings card; the two-stage undo toasts |

**No other file touched.** Out-of-scope confirmed absent: no KDS ticket payment display, no customer
manage page, no `paymentWarning` toast wiring, nothing Stripe, no backfill, no refund-copy edits, no
cash-vs-own-card channel split (every row is `in_person_other`).

---

## MIGRATION

**`supabase/migrations/20260729_trucks_paid_step_settings.sql` — ✅ ADDITIVE.**

Two columns on `trucks`, both `NOT NULL` with defaults that encode today's behaviour
(`show_paid_step = false`, `default_walkup_payment = 'at_order'`), plus a CHECK on the latter. Idempotent
(`add column if not exists`; the constraint is dropped-then-added so re-running converges).

**RUN ORDER: before deploying.** The Settings tab reads and writes both columns, and PostgREST rejects
an update naming a column it cannot see (PGRST204), so deploying first would break the two new toggles.
The reverse order is a no-op — the columns are defaulted and old code never reads them.

The verification block reads resulting **state**: `information_schema.columns` for types/defaults,
`pg_constraint` for the CHECK, and a `group by` proving **every existing truck reads `f | at_order`** —
i.e. that nothing changed for anyone.

---

## VERIFIED BY READING vs BY RUNNING

**By RUNNING:**
- `npx tsc --noEmit` → **exit 0**, re-run after every edit.
- **16/16 ledger-derivation cases** re-run after the `import type` change → all pass.
- **10/10 button-state cases** on logic mirroring `completionBtn()`/`paidChip`: off+unpaid, off+paid,
  off+chip-suppressed, on+unpaid, on+paid, on+part-paid label with the correct balance, on+chip states,
  and two part charges settling to `Done`.
- Greps confirming the gating counts in §Confirmation and that all 8 button sites route through the
  shared helpers.

**By READING only:** everything in D1-D5; the outbox's verbatim body handling; the `divide-y`/`Toggle`
settings pattern; the notes/ghost-button geometry (measured from Tailwind classes, **not rendered**).

---

## WHAT I COULD NOT VERIFY

- **The migration has not been applied**, so neither column exists. Every code path gated on
  `show_paid_step` is currently unreachable in the running app, and the verification block is unrun.
- **Nothing has been rendered.** No `next dev` per constraint — so the confirm bar's three-state layout,
  the chip's fit beside the price in the 240px KDS column, and the notes spacing change are **unverified
  visually**. The chip in the window header is my main visual concern: that row is already
  `#12` + `£9.50` + `✓` and a `£4.00 / £5.50 due` chip is wide. `whitespace-nowrap` will keep it on one
  line but it may push the layout.
- **No action has been executed.** `mark_paid`, `undo_mark_paid`, the `splitPaidStep` undo branch and the
  walk-up paid-at-order block have never run against Postgres.
- **The two-stage undo has not been exercised**, including the fast-double-tap case the design targets.
- ⚠️ **Offline behaviour of `mark_paid` is reasoned, not tested.** It routes through `gatedAction` with
  `kind:'status'`; `OFFLINE_STATUS_MAP` has no `mark_paid` entry, so `offlineStatusPatch` returns null
  and no optimistic status change occurs — correct, but it also means **an offline "Mark paid" shows no
  optimistic paid state** until the drain. I did not change the offline path. Worth a decision before
  Gusto enables this on a tablet that goes offline.
- **`data.truck.show_paid_step` hydration assumes the dashboard payload includes the new columns** —
  it does, because that route selects `trucks.select('*')`, but I confirmed that by reading, not by
  observing a response.
- **Nothing observed on a device**, and no real order placed on `test-truck`.
