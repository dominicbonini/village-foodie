# Current state ahead of a temporary "card payments off" switch

**Date:** 11 August 2026
**READ-ONLY. No file changed, no file created except this report. No `next dev`, no `next build`. No commit, no deploy.**
**Prompt integrity:** nothing arrived garbled, and no instruction contradicted another.

---

# 🔴 THE FIVE THINGS THAT MATTER MOST

1. **The card gate reads ONE boolean and nothing else** — `operators.stripe_charges_enabled`. **No plan check, no truck column, no event column.** There is no existing hook to hang a switch on.
2. **`online_ordering_pay_at_hatch` is declared but has ZERO gate call sites.** Nothing in the codebase reads it. Pay-at-hatch is not feature-gated at all; it is simply what happens when no card is offered.
3. 🔴 **`resolvePaidStep` is the right shape to copy, and its header comment is now STALE** — it says `completion_presses` is truck-level-only with no override, while line 109 resolves `completion_presses_override`. Copy the *code*, not the comment.
4. ✅ **The webhook checks NO truck or event setting before writing the ledger.** Quoted below. Money that arrived is recorded regardless — exactly as you expected.
5. 🔴 **(Q7) The comment at `action/route.ts:1060` is FALSE.** The walk-up total is computed **in the browser** by `AddOrderPanel` and sent in the request body. It is client-supplied.

---

## 1. The gate on the customer order page

**Source: QUOTED.**

### The render gate — `app/trucks/[slug]/order/page.tsx:2319`

```tsx
              {truck?.card_payments_ready && (
                <div className="mt-4 space-y-1.5">
                  {([
                    { key: true,  label: 'Pay now by card', hint: 'Secure payment through Stripe' },
                    { key: false, label: 'Pay at the truck', hint: 'No card details needed' },
                  ] as const).map(opt => (
```

### The submit gate — `:1198`

```tsx
      if (payByCard && truck?.card_payments_ready && data.orderKey) {
```

### 🔴 The ONLY input: `operators.stripe_charges_enabled`

`card_payments_ready` is computed in exactly one place — `app/api/menu/[truckId]/route.ts:663-674`:

```ts
  let cardPaymentsReady = false
  if (truck.operator_id) {
    const { data: op, error: opErr } = await supabase
      .from('operators')
      .select('stripe_charges_enabled')
      .eq('id', truck.operator_id)
      .maybeSingle()
    if (opErr) {
      console.error('[MENU API] readiness lookup failed — falling back to Pay-at-Hatch:', opErr.message)
    }
    cardPaymentsReady = op?.stripe_charges_enabled === true
  }
```

### Every input, enumerated

| Candidate input | Read? |
|---|---|
| **`operators.stripe_charges_enabled`** | ✅ **YES — the only one** |
| `trucks.plan` / `canAccess` / `hasFeature` | 🔴 **NO** |
| Any `trucks.*` column | 🔴 **NO** (only `trucks.operator_id`, as a join key) |
| Any `truck_events.*` column | 🔴 **NO** |
| `operators.stripe_account_id` | 🔴 **NO — not at the menu layer** (it IS read at checkout, see below) |

### The server re-check — `app/api/stripe/checkout/route.ts:86-95`

```ts
    const { data: operator } = await supabase
      .from('operators')
      .select('stripe_account_id, stripe_charges_enabled')
      .eq('id', truck.operator_id)
…
    // 🔴 READINESS IS `stripe_charges_enabled`, NEVER "a row exists" and never "an account id exists".
    if (!operator?.stripe_account_id || operator.stripe_charges_enabled !== true) {
      return NextResponse.json({ error: 'Card payment is not available', notReady: true }, { status: 409 })
    }
```

⚠️ **The client flag is explicitly documented as a hint, not a gate** (`order/page.tsx:54-55`): *"A RENDERING HINT ONLY — /api/stripe/checkout re-reads readiness server-side."*

✅ **THIS IS GOOD NEWS FOR THE SWITCH.** There are exactly **two** enforcement points, and the second is authoritative. A switch added to both gives you a client that stops offering the card AND a server that refuses one already in flight.

⚠️ **AND A REAL FALLBACK ALREADY EXISTS.** `order/page.tsx:1195-1215`: if `/api/stripe/checkout` fails for any reason, the page falls through to the normal confirmation and sets `cardFallbackNotice`. 🔴 **A switch that makes the checkout route return `409 notReady` would reuse this path unchanged** — the order is placed, unpaid, and the customer is told. That is the pay-at-hatch fallback you are asking for, already built and already exercised.

---

## 2. `online_ordering_pay_at_hatch` — declared, held by one plan, gated by NOTHING

**Source: QUOTED.** `lib/features.ts:12` (the union) and `:72` (membership):

```ts
  | 'online_ordering_pay_at_hatch'
```

```ts
  starter: new Set([
    'discovery_map',
    'web_dashboard',
    'ipad_kds',
    'qr_menu',
    'meal_deals',
    'upsells',
    'walkup_orders',
    'online_ordering_pay_at_hatch',
    'sold_out_toggle',
    'stock_countdown',
  ]),
```

### Which plans hold it

🔴 **ONLY `starter`. It is NOT in `PRO_FEATURES`** (`:31-51`), and therefore not in `MAX_FEATURES` (`:53-58` spreads PRO), not in `TRIAL_FEATURES` (`:60` spreads MAX), not in `tester` (`:79`), not in `demo` (`:84`).

| Plan | Holds `online_ordering_pay_at_hatch`? |
|---|---|
| `starter` | ✅ **YES** |
| `pro` / `max` / **`trial`** / `tester` / `demo` | 🔴 **NO** |

⚠️ **Pro and above hold `online_payments` instead** (`features.ts:42`) — the tiering reads as *"Starter gets pay-at-hatch ordering; Pro gets card payments."*

### 🔴 EVERY `canAccess` / `hasFeature` CALL SITE — and it is gated by NONE of them

I enumerated all 23 gate calls in the codebase. **The features actually gated are:**

`branded_qr_code`, `advance_preordering` (×6), `whatsapp_replies` (×3), `advanced_reporting`, `ticket_printing`, plus three generic wrappers (`FeatureGate.tsx:30`, `useFeatures.ts:39`, `manage/page.tsx:8262`) and one self-consistency check (`plan-features.ts:266`).

🔴 **THERE ARE NO `canAccess` OR `hasFeature` CALLS ON `online_ordering_pay_at_hatch`. NONE. ANYWHERE.** Same for `online_payments` — **also zero gate call sites.**

### Can a truck on plan `trial` offer pay-at-hatch today?

✅ **YES — plainly, yes.** And **not because the feature grants it**, which it does not:

```ts
canAccess('trial', 'online_ordering_pay_at_hatch')  →  false
```

🔴 **It works because NOTHING CHECKS.** Pay-at-hatch is not a gated capability; it is the **residual behaviour** when `card_payments_ready` is false. The order page's `else` branch (`:2346-2349`) renders *"Pay at the truck on collection"* with no feature test in sight.

⚠️ **SO THE FEATURE FLAG IS DECORATIVE.** It appears in the pricing table (`plan-features.ts:235`, `'Online ordering — Pay at Hatch'`) and in the trial's marketing description (`features.ts:148`, *"Max tier + Pay at Hatch ordering"* — which the feature set contradicts), but it enforces nothing. **If you were planning to hang the kill-switch on this flag, it currently has no wiring to reuse and its plan membership would deny it to trial trucks.**

---

## 3. `lib/payments/paid-step.ts` in full

**Source: QUOTED.** The whole file, 112 lines, unmodified — [reproduced here in the sections that matter for a fourth setting].

### The resolver itself — `:79-111`

```ts
export function resolvePaidStep(
  truck: PaidStepTruck | null | undefined,
  event: PaidStepEvent | null | undefined,
): ResolvedPaidStep {
  const showPaidStep = event?.show_paid_step_override ?? truck?.show_paid_step ?? false
  return {
    showPaidStep,
    takesCash: event?.takes_cash_override ?? truck?.takes_cash ?? false,
    …
    completionPresses:
      event?.completion_presses_override ?? truck?.completion_presses ?? (showPaidStep ? 'two' : 'one'),
  }
}
```

### The types — `:46-69`

```ts
export interface PaidStepTruck {
  show_paid_step?: boolean | null
  takes_cash?: boolean | null
  completion_presses?: CompletionPresses | null
}

export type CompletionPresses = 'one' | 'two'

export interface PaidStepEvent {
  show_paid_step_override?: boolean | null
  takes_cash_override?: boolean | null
  completion_presses_override?: CompletionPresses | null
}

export interface ResolvedPaidStep {
  showPaidStep: boolean
  takesCash: boolean
  completionPresses: CompletionPresses
}
```

### 🔴 THE EXACT SHAPE, AND THE FOUR PROPERTIES A FOURTH SETTING INHERITS FREE

**The chain — `:13-16`, quoted:**

```
//   showPaidStep = event.show_paid_step_override ?? truck.show_paid_step ?? false
//   takesCash    = event.takes_cash_override     ?? truck.takes_cash     ?? false
// `??` and not `||`: an explicit override of FALSE must be honoured, not fall through to the default.
// `||` would treat `false` as "unset" and silently re-inherit — the bug this nullish chain avoids.
```

| Property | How it is achieved | Why it matters to a kill-switch |
|---|---|---|
| **`??` never `\|\|`** | `:15-16` | An operator explicitly re-enabling cards for one event must not be treated as "unset" |
| 🔴 **NO SEEDING at event creation, NO bulk write** | `:23-26`: *"Both properties come from doing nothing"* | ✅ **THE OVERRIDE EXPIRES BY ITSELF.** `:34`: *"Do not build an expiry mechanism; the absence of seeding IS the expiry."* **This is exactly the "temporary, for this incident" semantics you want, and it is free.** |
| **One resolver, both sides of the wire** | `:7-10`: *"if they ever disagree… That is the silent client/server divergence this codebase keeps rediscovering"* | Client stops offering / server stops accepting must never disagree |
| **Truck default owned by Manage, override owned by the dashboard** | enforced at each write site, e.g. `dashboard/page.tsx:1286-1287` | Matches your Manage-default + dashboard-override design exactly |

⚠️ **THE PRECEDENT FOR YOUR EXACT USE CASE IS ALREADY WRITTEN DOWN.** `:29-34`, quoted:

> *"`takes_cash` WAS truck-level only, on the reasoning that whether a truck accepts cash is a property of the BUSINESS rather than of a pitch. That reasoning was INCOMPLETE and the decision was reversed on 30 July: **if the card terminal fails mid-service the operator needs cash enabled for TONIGHT, from the dashboard, without going into Manage.** That is a real event-level need, and a time-critical one."*

🔴 **That is the same argument as yours, already accepted once.**

### ⚠️ ONE STALE COMMENT — DO NOT COPY IT

**`:42-44` says:**

```ts
// 🔴 TRUCK-LEVEL ONLY — no `completion_presses_override`, and do not add one without reading the
// reasoning in supabase/migrations/20260810_trucks_completion_presses.sql: this setting decides what
// `undo_collected` REVERSES, so flipping it mid-event can make an undo delete an hour-old payment.
```

🔴 **A `completion_presses_override` WAS SUBSEQUENTLY ADDED** — line 109 resolves it, `:100-103` describes it, `action/route.ts:1615` writes it, and the dashboard renders it at `page.tsx:3278-3305`. **The header block at `:36-44` was not updated.** The header at `:2` also still says *"`show_paid_step` AND `takes_cash` are both TRUCK DEFAULTS"* — two settings, when there are three.

⚠️ **Also worth reading before adding a fourth: `:92-107`.** The last link in the `completionPresses` chain is *the old flag, not a constant*, specifically to survive a **code-before-migration deploy** on the `trucks` side — because `trucks` is read with `select('*')` everywhere, a missing truck column arrives `undefined` rather than raising. 🔴 **The event side has no such protection** (`:100-103`): *"It is read through a NAMED select… so its column must EXIST before the code that names it deploys. Migration first, then deploy."* **That asymmetry applies to your fourth setting too.** See §5.

---

## 4. Where the three settings render

**Source: QUOTED.**

### Truck-level defaults — Manage

| Setting | File | Lines | Control |
|---|---|---|---|
| **`show_paid_step`** | `app/manage/[token]/page.tsx` | **9105-9125** | `<Toggle>` — *"Take orders without payment"* |
| **`completion_presses`** | `app/manage/[token]/page.tsx` | **9126-~9200** | two radio rows — *"Completing an unpaid order"* |
| **`takes_cash`** | `app/manage/[token]/page.tsx` | **~9201-9280** | `<Toggle>` — *"Do you take cash?"* |

```tsx
9115            <div className="flex items-center justify-between gap-3 py-3">
9116              <div>
9117                <p className="text-sm font-semibold text-slate-800">Take orders without payment</p>
9118                <p className="text-xs text-slate-500 mt-0.5">Adds a Confirm button when you add an order yourself, so you can place it now and take payment later. Turn this on if you take phone or advance orders.</p>
9119                <p className="text-xs text-slate-400 mt-1">This only affects orders you add. It doesn&apos;t affect online orders.</p>
9120              </div>
9121              <Toggle
9122                on={(form as any).show_paid_step === true}
9123                onToggle={() => { const next = (form as any).show_paid_step !== true; setForm(p => ({...p, show_paid_step: next} as any)); saveSetting('show_paid_step', next) }}
9124              />
9125            </div>
```

⚠️ **All three are grouped in ONE "Order settings" card**, described at `:9092-9093`: the grouping axis is *"WHEN does the money" (`show_paid_step`) vs "HOW does it arrive" (`takes_cash`)*.

⚠️ **The comment at `:9111-9114` is directly relevant to your task:**

> *"⚠️ THE NOTE IS DELIBERATELY NOT ELABORATED. 'It doesn't affect online orders' is true whatever state online orders arrive in — **and Stripe is being integrated, after which they will arrive PAID.** A sentence describing what state they arrive in today would go stale at exactly the moment nobody remembers to come back and change it."*

🔴 **Once a kill-switch exists, that on-screen sentence — "It doesn't affect online orders" — becomes the place an operator will look for it and not find it.**

### Per-event overrides — Dashboard → Settings

| Setting | File | Lines | Control |
|---|---|---|---|
| **`show_paid_step_override`** | `app/dashboard/[token]/page.tsx` | **3259-3268** | `<Toggle on={effectivePaidStep}>` |
| **`completion_presses_override`** | `app/dashboard/[token]/page.tsx` | **3269-3305** | two radio rows |
| **`takes_cash_override`** | `app/dashboard/[token]/page.tsx` | **3306-3355** | `<Toggle on={effectiveTakesCash}>` |

All three live in one card, `:3244-3356`.

```tsx
3341              <div className="pt-3 flex items-center justify-between gap-3">
3342                <div>
3343                  <p className="text-sm font-semibold text-slate-800">Do you take cash?</p>
3344                  <p className="text-slate-500 text-xs mt-0.5">Splits the payment button into "Cash" and "Card".</p>
```

🔴 **THE HOUSE RULE FOR THIS CARD, AND A FOURTH ROW MUST FOLLOW IT** — `:3245-3255`, quoted:

> *"🔴 DO NOT ADD PER-EVENT SCOPE WORDING TO THESE ROWS. **SCOPE IS A PROPERTY OF THE SCREEN, NOT OF EACH SETTING.** Dashboard → Settings is PER-EVENT; Manage → Settings is TRUCK-WIDE… A row's description says what the setting DOES. The screen says what it applies to. This is a DESIGN DECISION, NOT AN UNCLOSED GAP."*

⚠️ **So "turn cards off for tonight" cannot say "for tonight" in its row copy.** The toast after a tap names the event instead.

### The write actions

| Setting | Action | Line |
|---|---|---|
| `show_paid_step_override` | `set_show_paid_step_override` | `action/route.ts:1591` |
| `completion_presses_override` | `set_completion_presses_override` | `action/route.ts:1615` |
| `takes_cash_override` | `set_takes_cash_override` | `action/route.ts` (~1650) |

✅ **All three follow the same contract**: reject a non-boolean, accept `null` to clear, `.update(...).select('*')`, return the updated row so the client sets state from the response. **A fourth would be a near-verbatim copy of `set_show_paid_step_override` (`:1591-1613`).**

---

## 5. Every `truck_events` query — named vs `select('*')`

**Source: QUOTED** (mechanical extraction over every `from('truck_events')` in `app/`, `lib/`, `components/`).

```
  NAMED SELECTS   : 50
  SELECT *        :  7
  NO SELECT (write):19
  ────────────────────
  TOTAL           : 76
```

🔴 **50 of 57 reads are NAMED. Adding a column to a named select is DEPLOY-COUPLED — the migration must land first, or PostgREST returns 42703 and fails the whole statement.**

### The 7 `select('*')` — SAFE to add a column to

| Site | Note |
|---|---|
| `app/api/dashboard/action/route.ts:1607` | `set_show_paid_step_override` — the update's returning clause |
| `app/api/dashboard/action/route.ts:1639` | `set_completion_presses_override` |
| `app/api/dashboard/action/route.ts:1658` | `set_takes_cash_override` |
| `app/api/dashboard/action/route.ts:1750` | another override setter |
| `app/api/manage/route.ts:101` | 🔴 **Manage's whole event list** |
| `app/api/events/manage/route.ts:26` | `` `*, event_deals ( … )` `` |
| `app/api/cron/demo-cleanup/route.ts:185` | `head: true` count only |

### The 50 NAMED reads — the deploy-coupling surface

**The three that would actually need the new column** (everything else names unrelated columns and is unaffected):

| 🔴 Site | Current select | Why it matters |
|---|---|---|
| **`app/api/dashboard/action/route.ts:47`** (`paidStepFor`) | `'show_paid_step_override, takes_cash_override, completion_presses_override'` | **The server-side resolver.** Its own comment `:41-46` calls it *"DEPLOY-COUPLED, IN ONE DIRECTION ONLY"* |
| **`app/api/dashboard/route.ts:140`** | `'id, start_time, …, show_paid_step_override, takes_cash_override, completion_presses_override, buzzer_prompt'` | 🔴 **THE SILENT-EMPTY-BOARD SITE.** `:147-155` records that a 42703 here returned **HTTP 200 with `orders: []`** and *"the bug wore the disguise of normal behaviour — no error, no failed request, nothing in any log"* |
| **`app/dashboard/[token]/page.tsx:899`** | `'offline_protection_override, order_ready_override'` | Client-side named read; would need the column if the dashboard reads it directly |

**Plus one more, if the customer path must honour an event-level switch:**

| ⚠️ Site | Current select |
|---|---|
| `app/api/orders/submit/route.ts:568` and `:579` | `eventCols = 'id, start_time, end_time, venue_name, town, postcode, van_id'` |

⚠️ **And note `/api/menu/[truckId]/route.ts:232` names `'van_id, paused_until, online_paused_until, offline_protection_override, extra_wait_mins, extra_wait_started_at, start_time, end_time, event_date'`** — 🔴 **an event-level card switch would have to be added HERE for the customer page to see it**, and this is the hottest customer endpoint in the product.

### 🔴 THE ASYMMETRY YOU MUST DESIGN AROUND

| Side | Read with | Missing column behaves as | Deploy order |
|---|---|---|---|
| **`trucks.<new_column>`** | 🔴 **`select('*')` everywhere** (`paid-step.ts:93-95`) | `undefined` → falls through the `??` chain | ✅ **Tolerant** — code can ship first |
| **`truck_events.<new_override>`** | 🔴 **NAMED selects** (3-5 sites) | **42703 → the WHOLE statement fails** | 🔴 **STRICT — migration first, then deploy** |

✅ **This is exactly what `paid-step.ts:92-107` already documents, and the same discipline applies unchanged.**

---

## 6. A Checkout session in flight when the switch flips

**Source: QUOTED. ✅ YOUR EXPECTATION IS CORRECT — the webhook checks NOTHING.**

`app/api/webhooks/stripe/route.ts:327-396` is the entire `payment_intent.succeeded` branch. **Every guard in it, in order:**

| # | Guard | Line | Reads |
|---|---|---|---|
| 1 | `if (livemode !== false)` | 328 | the Stripe event |
| 2 | `if (!orderKey)` | 348 | `pi.metadata.order_key` |
| 3 | `if (!piId \|\| amountReceived === null \|\| amountReceived <= 0)` | 353 | the Stripe payload |
| 4 | `if (!order?.truck_id)` | 371 | `orders` — **`select('order_key, truck_id')` only** |

🔴 **NOT ONE READ OF `trucks`, `truck_events` OR `operators` IN THE WHOLE BRANCH.** The only database read before the ledger write is:

```ts
    // 🔴 THE ORDER ROW IS THE AUTHORITY FOR truck_id, not the metadata. Metadata is ours and therefore
    // trustworthy, but the ledger's truck_id drives per-truck money rollups — so it is read from the
    // row that owns it. This also proves the order still exists before writing money against it.
    const { data: order } = await supabase
      .from('orders')
      .select('order_key, truck_id')
      .eq('order_key', orderKey)
      .maybeSingle()
```

**And then, unconditionally:**

```ts
      const { inserted, balance } = await recordOnlineCardPayment(supabase, {
        orderKey: order.order_key,
        truckId: order.truck_id,
        amountMinor: amountReceived,
        paymentIntentId: piId,
        livemode,
        currency: typeof pi?.currency === 'string' ? pi.currency.toUpperCase() : undefined,
      })
```

**The file states the principle itself, `:313-315`:**

```ts
  // This is the ONLY place an online payment becomes true. The customer's browser returning from
  // Stripe is not evidence — they can close the tab, lose signal, or never come back — so the money is
  // recorded from the event and nowhere else.
```

⚠️ **Note guard 4's failure branch, `:371-379` — the ONE case where money lands unrecorded:**

```ts
      console.error(
        `[webhook/stripe] 🔴 payment_intent.succeeded FOR AN UNKNOWN ORDER — pi=${piId} order_key=${orderKey} ` +
        `amount_received=${amountReceived}. The customer HAS been charged. Reconcile by hand.`,
      )
```

### 🔴 SO: WHAT ACTUALLY HAPPENS TO AN IN-FLIGHT SESSION

**INFERRED, from the quoted guards:**

1. The customer is on Stripe's hosted page. **The switch flips.**
2. They pay. Stripe emits `payment_intent.succeeded`.
3. 🔴 **The webhook records it in `order_payments` — no setting is consulted, so the switch is invisible here.**
4. `recalcOrderPayment` rewrites `orders.payment_status` / `amount_paid` from the ledger.
5. The customer returns to `/order/{key}/manage` and sees a paid order.

✅ **CORRECT, AND THE ONLY DEFENSIBLE BEHAVIOUR.** ⚠️ **DO NOT ADD A SETTING CHECK TO THIS BRANCH** — it would mean real money arriving with no ledger row, which `:317-321` names as *"the one mistake that cannot be undone."*

⚠️ **Where the switch SHOULD bite is one step earlier: `app/api/stripe/checkout/route.ts`, before `stripe.checkout.sessions.create`.** A switch checked there returns `409 notReady`, the order page falls through to `cardFallbackNotice` (§1), and no session is ever created. 🔴 **The window is therefore only as wide as one customer's time on Stripe's page — it cannot be closed to zero, and it should not be.**

⚠️ **`checkout/route.ts` sets no `expires_at`** (established in an earlier audit), so a stale session's default lifetime is Stripe's, **not established** here.

---

## 7. SEPARATE QUESTION — where `finalTotal` really comes from

**Source: QUOTED at every step.**

### The comment under test — `action/route.ts:1060-1061`

```ts
          // §4a — pence, derived here from the server-held total. Never client-supplied.
          total_minor: toMinor(finalTotal),
```

### Step 1 — `finalTotal`, `:1049`

```ts
        const finalTotal = passedTotal || total
```

### Step 2 — `passedTotal` is the REQUEST BODY, `:834`

```ts
      const { customerName, customerPhone, customerEmail, slot, items, notes, discountAmt, dealSavings, total: passedTotal, subtotal, event_date: passedEventDate, event_id: passedEventId } = manualOrder
```

**and `manualOrder` is destructured straight off the wire, `:181`:**

```ts
    const { token, pin, action, order_key: orderKey, manualOrder, itemName, available, editedOrder } = body
```

### Step 3 — the fallback `total` is ALSO client-priced, `:965`

```ts
      const total = (items || []).reduce((s: number, i: any) => s + (parseFloat(i.unit_price) * parseInt(i.quantity)), 0)
```

🔴 **`items` here IS `manualOrder.items` from the request body.** It sums the **client's** `unit_price` × the **client's** `quantity`. **There is no menu lookup.** So both branches of `passedTotal || total` are client-derived.

### Step 4 — the client computes it in the browser

`components/dashboard/AddOrderPanel.tsx:955`:

```tsx
        total: manualTotal,
```

`:320-327`:

```tsx
  const calculation = useMemo(() => calculateOrderTotal(
    manualItems.map(item => ({ name: item.name, price: item.unit_price, quantity: item.quantity })),
    appliedDeals,
    truckMenu?.items || [],
    null,
  ), [manualItems, appliedDeals, truckMenu])

  const { itemsTotal: manualItemsSubtotal, dealSavings, total: manualTotal } = calculation
```

🔴 **`calculateOrderTotal` runs IN THE BROWSER, over `manualItems[].unit_price` — client state — and `appliedDeals`, whose `price` is `d.bundle.bundle_price` (`:945`), also client state.**

### 🔴 THE PLAIN ANSWER

**The walk-up order total is SUPPLIED BY THE ADD ORDER PANEL IN THE REQUEST BODY. It is NOT computed on the server from database prices.**

**The full chain, unbroken:**

```
AddOrderPanel state (manualItems[].unit_price, appliedDeals)
  → calculateOrderTotal() IN THE BROWSER          [AddOrderPanel.tsx:320]
  → manualOrder.total                              [AddOrderPanel.tsx:955]
  → POST body                                      [AddOrderPanel.tsx:984]
  → passedTotal                                    [action/route.ts:834]
  → finalTotal = passedTotal || total              [action/route.ts:1049]
  → orders.total          AND  total_minor         [action/route.ts:1057, 1061]
```

🔴 **THE COMMENT IS FALSE.** The only true reading of *"derived here from the server-held total"* is the narrow one — that `total_minor` is derived **in this route** from the `total` variable, rather than being sent as its own separate field. ⚠️ **But "server-held" implies server-*computed*, and it is not. "Never client-supplied" is wrong: the number it converts came from the browser.**

⚠️ **This is the same defect the third-pass audit found on the customer path**, reached by a different route — there via `place_order_atomic`'s `round(p_order.total × 100)`, here via `toMinor(finalTotal)`. **Both derive pence server-side from a client-supplied pounds figure.**

⚠️ **AND THERE IS NO VALIDATION ON THIS PATH AT ALL.** `validateOrderTotals` has exactly one call site — `submit/route.ts:525` — so the walk-up path does not even attempt the comparison the customer path attempts (and which is itself inert).

✅ **BY CONTRAST, THE EDIT PATH IS GENUINELY SERVER-AUTHORITATIVE** — `action/route.ts:605` calls `repriceOrder` with a database price book and writes `total_minor: newTotalMinor` at `:692`. 🔴 **So within one file, two handlers, one comment each claiming server authority, and only one of them has it.**

---

## Quoted vs inferred

| § | Status |
|---|---|
| 1 | **QUOTED** — both gates, the readiness computation, the checkout re-check. The "two enforcement points" conclusion is **INFERRED** from the quoted code |
| 2 | **QUOTED** — the declaration, the plan sets, and an **exhaustive** enumeration of all 23 gate call sites. "Zero gate sites" is a **QUOTED negative search** |
| 3 | **QUOTED** — resolver, types, chain, and the stale comment |
| 4 | **QUOTED** — all six render sites with line ranges and the house rules |
| 5 | **QUOTED** — mechanical classification of all 76 `truck_events` queries |
| 6 | **QUOTED** — every guard in the branch. The in-flight sequence is **INFERRED** from those guards |
| 7 | **QUOTED** at every one of the five steps |

## Not established

- Whether an in-flight Checkout Session expires, and after how long — `checkout/route.ts` sets no `expires_at`; Stripe's default was not read.
- Whether `trucks` is read with `select('*')` on **every** path — `paid-step.ts:93-95` asserts it and I did not re-verify every truck read for this pass.
- Whether the `select('*')` at `app/api/manage/route.ts:101` is what hydrates the Manage event editor's per-event controls, or whether another named read does — I classified it, I did not trace its consumers.
- What `action/route.ts:1750`'s `select('*')` override setter writes — classified as `select('*')`, not opened.
