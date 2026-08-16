# A KDS order-ready control: what Window/Cook already is

READ-ONLY DIAGNOSIS. **No file was edited, nothing was committed, no build was run, no deploy, no
database write, no SQL.** `lib/payments/paid-step.ts` was read and quoted and **not touched**.
`git status` is in G4. **Nothing is proposed beyond Part F, and Part F proposes no implementation.**

**No span of the prompt arrived garbled, and no instruction contradicted another.**

Every claim is marked **READ** or **INFERRED**. **Dashboard and KDS are reported separately
throughout.**

---

# 🔴 THE HEADLINE, BEFORE THE DETAIL

**The suspicion is HALF RIGHT, and the half that is wrong is the half that matters.**

✅ **RIGHT:** Window/Cook **is not a layout switch**. It changes which order **statuses** are shown
**and** which **buttons** appear. **Cook mode always has a Ready step; Window mode has none.** So a
control that determines the ready step on the KDS **does already exist**.

🔴 **WRONG — AND THIS IS THE PART THAT BLOCKS THE RENAME:** Window/Cook is **not a ready-step
on/off**. It is a **ROLE split between two devices that are meant to run at the same time**:

- **Cook** = *"I make the food"* — ends at Ready, **never sees a ready order** (`cookOrders` filters
  `'ready'` out), has **no prices and no payment action**.
- **Window** = *"I hand the food over and take the money"* — **consumes** the ready state, and when
  the truck's cooking gate is on it **cannot complete an order until someone else marks it ready**.

⚠️ **So renaming Window/Cook to an order-ready toggle would rename a role picker into a feature
switch, and the two are not the same thing.** Turning the "ready step" *off* by picking Window does
not remove a step — **it hands that step to a different device that may not exist.** D2 has the
stuck-order case.

✅ **AND THE INDEPENDENCE HE WANTS IS ALREADY TRUE.** **READ:** the KDS **never reads** the
dashboard's order-ready setting — it does not pass `effectiveOrderReady` to the card, and the card
reads that prop **only** in the dashboard's `solo` branch. **B2 has the proof. No new storage is
needed for independence; it is the state today.**

🔴 **AND THE PATTERN HE ASKED FOR ALREADY EXISTS TOO — IT IS THE PAYMENTS TOGGLE ITSELF.** **READ:**
`hidePayments` **already flips a Window device onto the cook screen's button set, Ready included.**
The control that puts a ready step on a window device **is the payments chip**, today, in production.

---

# PART A — WHAT WINDOW/COOK ACTUALLY DOES

## A1. The control, in full

**READ** — `app/dashboard/[token]/kds/page.tsx:1176-1202`, the header segmented control:

```tsx
            onClick={() => setViewOverride('window')}
            className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeView === 'window'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Window
          </button>
          {/* Stage 1: Cook tab gated on the Max-plan feature ONLY (cooking always-on; de-coupled from
              show_cooking_step — restore `&& showCookingStep` to re-add the toggle). */}
          {can('cook_screen') && (
            <button
              onClick={() => setViewOverride('cook')}
…
              Cook
            </button>
          )}
```

**It switches exactly one value**, and that value is read in three places. **READ** — `1003-1006`,
`1057`, `1083`:

```ts
  const activeView: KdsView = can('cook_screen')
    ? (viewOverride ?? (isDemo ? 'window' : kdsView))
    : 'window'
…
  const displayOrders = (activeView === 'cook' ? cookOrders : windowOrders)
…
  // KDS always uses window or cook — never solo
  const cardViewMode = activeView === 'cook' ? 'cook' : 'window'
```

⚠️ **`can('cook_screen')` is a MAX-PLAN GATE.** **READ** — `lib/plan-features.ts:284` maps it from
the plan label `'Customer-facing display'`. **A non-Max truck is FORCED to `'window'` and never sees
the Cook tab at all.** That matters for F: **anything built on this control inherits a plan gate.**

## A2. 🔴 STATED PLAINLY: statuses, buttons, AND layout — all three

**It is NOT a visual switch. It changes the order lifecycle on the screen.** Three branches, all
READ.

**(1) IT CHANGES WHICH STATUSES ARE SHOWN** — `kds/page.tsx:1036-1055`:

```ts
  // Cook view: cook's job ends at ready — hide ready orders from the kitchen screen
  const cookOrders = activeOrders.filter(o => o.status !== 'ready')
  // Window view: keep ready orders visible — window person hands over and takes payment.
…
  const windowOrders = hidePayments
    ? activeOrders.filter(o => o.status !== 'ready')
    : activeOrders
```

**(2) IT CHANGES WHICH BUTTONS APPEAR** — `components/dashboard/OrderCard.tsx:833-888`, and this is
the branch the whole task turns on:

```tsx
    if (viewMode === 'cook' || (viewMode === 'window' && hidePayments)) {
      if (['confirmed', 'modified'].includes(order.status)) {
        // Stage 1 (order-ready redesign): the cooking step is now ALWAYS on in cook mode — DE-COUPLED
        // from show_cooking_step (was `kdsMode && showCookingStep`). To re-add the "Show cooking step"
        // toggle later, restore `&& showCookingStep` here. Cook mode shows Start cooking → Ready.
        return kdsMode ? (
          <>
            <Btn label="Start cooking" colour="amber" … onClick={() => onAction('cooking', order.order_key)} />
            <Btn label="Ready"         colour="green" … onClick={() => onAction('ready', order.order_key)} />
          </>
        ) : (
          <Btn label="Ready" colour="green" … onClick={() => onAction('ready', order.order_key)} />
        )
      }
      if (order.status === 'cooking') {
        return (
          <>
            <span className="flex-1 text-amber-700 font-bold text-sm flex items-center">🔥 Cooking…</span>
            <Btn label="Ready" colour="green" … onClick={() => onAction('ready', order.order_key)} />
          </>
        )
      }
      return null
    }

    if (viewMode === 'window') {
      if (!kdsMode) {
        if (['confirmed', 'modified'].includes(order.status)) {
          return completionBtn()
        }
        if (order.status === 'ready') {
          return completionBtn()
        }
      } else {
        // Cooking gate active
        if (['confirmed', 'modified'].includes(order.status)) {
          return (
            <>
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-500">⏳ Waiting</span>
              {completionBtnDisabled()}
            </>
          )
        }
…
        if (order.status === 'ready') {
          return completionBtn()
        }
      }
    }
```

**(3) IT CHANGES LAYOUT TOO** — `OrderCard.tsx:743`, `976-978`:

```ts
  const showPrices = viewMode !== 'cook'
```
```tsx
      {viewMode === 'cook' ? (
        /* Cook: non-interactive two-line header, no collapse */
```

🔴 **AND THE CODE'S OWN COMMENT UNDERSTATES THIS.** **READ** — `kds/page.tsx:1243-1244`, in the
payments-chip comment:

```
            Placed beside Sound because both are per-DEVICE, and away from Window/Cook because those pick
            a LAYOUT while this decides whether the device handles money.
```

⚠️ **"Those pick a LAYOUT" is FALSE as written**, and is contradicted by `cookOrders`/`windowOrders`
15 lines above it and by the `OrderCard` branch quoted above. **INFERRED: this is very likely the
source of the impression that Window/Cook is cosmetic. It is not.** Flagged as a defect at F3.

## A3. Does Cook introduce a READY step Window lacks?

# ✅ YES — CONFIRMED, and it is unconditional.

**READ**, from the branch above:

| View | `confirmed` / `modified` | `cooking` | `ready` |
|---|---|---|---|
| **Cook** | **`Start cooking` + `Ready`** (or `Ready` alone when `kds_mode` is off) | `🔥 Cooking…` + **`Ready`** | 🔴 **not rendered — filtered off the board** |
| **Window**, payments ON, `kds_mode` ON | `⏳ Waiting` + **DISABLED** completion | `🔥 Cooking…` + **DISABLED** completion | `completionBtn()` |
| **Window**, payments ON, `kds_mode` OFF | `completionBtn()` | *(no branch — falls through, `null`)* | `completionBtn()` |
| **Window**, payments OFF | 🔴 **takes the COOK branch — `Ready`** | `🔥 Cooking…` + **`Ready`** | 🔴 **filtered off the board** |

✅ **Cook has a Ready button in every combination. Window has one in exactly one combination — when
payments are off — and in that case it is literally executing the cook branch.**

🔴 **THE CRITICAL ASYMMETRY:** Cook's Ready is **not an optional extra step** — **it is the only
action cook mode has.** A cook device with the ready step removed would have **no buttons at all**
(`return null`). ⚠️ **INFERRED, and it is decisive for F1: "ready step off" is not a meaningful state
for the cook view. The control cannot be a rename of a thing that has no off position.**

## A4. Where the choice is stored

**READ** — `kds/page.tsx:341-360`. **Per-device `localStorage`, keyed by token:**

```ts
  // Per-DEVICE KDS prefs (localStorage, keyed by token so two trucks on one device don't collide):
  // restore the saved view/layout on mount, then persist on change. A restored 'cook' still passes
  // through the activeView gate (can('cook_screen'), Max-plan only — Stage 1 de-coupled it from
  // show_cooking_step), so a non-Max device falls back to Window automatically — no extra guard needed.
  // null overrides are never written, so a first-ever-mount default isn't clobbered.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const v = localStorage.getItem(`hg_kds_view_${token}`)
    if (v === 'window' || v === 'cook') setViewOverride(v)
…
  useEffect(() => {
    if (typeof window === 'undefined' || viewOverride === null) return
    localStorage.setItem(`hg_kds_view_${token}`, viewOverride)
  }, [viewOverride, token])
```

With a URL seed underneath it — **READ**, `:76`:

```ts
  const kdsView: KdsView = searchParams.get('view') === 'cook' ? 'cook' : 'window'
```

| Question | Answer |
|---|---|
| React state? | ✅ `viewOverride`, `useState<'window' \| 'cook' \| null>(null)` (`:151`) |
| localStorage? | ✅ **`hg_kds_view_<token>`** — the durable store |
| Capacitor `Preferences`? | ❌ **NOT FOUND.** The **payments** pref uses `Preferences`; the view does not |
| `van_devices`? | ❌ **NOT FOUND** — no view column exists (E1) |
| `trucks` / `truck_vans` row? | ❌ **NOT FOUND** for the view. `display_mode` (list/grid) is truck-level; **the view is not** |
| Survives a reload? | ✅ **Yes** — restored on mount |
| Survives on a different device? | 🔴 **NO.** localStorage is per-browser-profile. **A second device starts at Window** |

⚠️ **And the resolution order means the URL seed is DEAD once a device has ever toggled**: `activeView
= viewOverride ?? kdsView`, and `viewOverride` is populated from localStorage on mount. **INFERRED: a
`?view=cook` bookmark is honoured on a fresh device only.**

---

# PART B — THE DASHBOARD'S ORDER-READY SETTING

**Reported separately from the KDS throughout, as required.**

## B1. The control and the column

**There are TWO controls writing TWO different columns, in a master-switch model.**

**(1) THE TRUCK/VAN DEFAULT — Manage → Settings.** **READ**, `app/manage/[token]/page.tsx:9834-9850`:

```tsx
              {/* Order-ready step — the TRUCK DEFAULT (order_ready_enabled). Per-event overrides live on
                  the dashboard's Menu & Stock tab. Stage 4 of the order-ready redesign. */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{SETTING_COPY.orderReady.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{SETTING_COPY.orderReady.help}</p>
                </div>
                <button
                  onClick={() => updateVanSetting(van.id, 'order_ready_enabled', !van.order_ready_enabled)}
```

**Column: `truck_vans.order_ready_enabled`.**

**(2) THE PER-EVENT OVERRIDE — the dashboard.** **READ**,
`app/dashboard/[token]/page.tsx:3926-3941`:

```tsx
            {/* Order-ready step — PER-EVENT on/off (MASTER-SWITCH model: every event has a concrete
                order_ready_override, seeded from the Settings default at creation + bulk-set when the Settings
                master switch flips). Writes order_ready_override=true|false (never null). Gates the orders-screen
                Ready button (effectiveOrderReady) — NOT the email (model A). …*/}
            {activeEvent&&(
              <div className="flex items-start justify-between gap-4 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Order-ready step{demoLockChip}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Show a &ldquo;Mark ready&rdquo; button on the orders screen and notify customers by email when their order is ready.</p>
                </div>
                <Toggle on={isDemo?false:effectiveOrderReady} onToggle={()=>{if(isDemo)return;setOrderReadyOverride(!effectiveOrderReady)}} disabled={isOffline||isDemo}/>
```

**Column: `truck_events.order_ready_override`.** **READ** — the write, `action/route.ts:2469-2475`:

```ts
    if (action === 'set_order_ready_override') {
…
      const { error } = await supabase.from('truck_events').update({ order_ready_override: value }).eq('id', eventId).eq('truck_id', truck.id)
```

**And the resolution — READ, `app/api/dashboard/route.ts:538-541`:**

```ts
      vanShowCookingStep = van?.show_cooking_step ?? false
…
      vanOrderReadyDefault = van?.order_ready_enabled ?? false
      effectiveOrderReady = (capacityEvent as any)?.order_ready_override ?? vanOrderReadyDefault
```

## B2. 🔴 Every consumer — and the KDS is NOT one of them

**READ** — `grep -rn "effectiveOrderReady"` across `app components lib`, complete:

| Site | What it does |
|---|---|
| `app/api/dashboard/route.ts:500,541,747` | resolves it and returns it in the payload |
| `app/dashboard/[token]/page.tsx:222,850,1397,1759-1768` | holds it in state, optimistic write |
| `app/dashboard/[token]/page.tsx:3461,3467,3940` | passes it to `OrderCard`; renders the toggle |
| `components/dashboard/OrderCard.tsx:96,134,895` | the prop, its default, **and its ONE read** |
| **`app/dashboard/[token]/kds/page.tsx`** | 🔴 **NOT FOUND. Zero occurrences.** |

**The single read — READ, `OrderCard.tsx:890-899`:**

```tsx
    // solo mode (default — the operator ORDERS screen). The order-READY step shows when pub mode OR the
    // resolved order-ready setting is on (effectiveOrderReady = event override ?? van default, computed in
    // /api/dashboard — stage 3 re-point off show_cooking_step). …
    const readyStepEnabled = isPub || effectiveOrderReady
    if (['confirmed', 'modified'].includes(order.status)) {
      return readyStepEnabled
        ? <Btn label={`${truck?.truck_emoji || "🍕"} Ready`} colour="green" … onClick={() => onAction('ready', order.order_key)} />
        : completionBtn()
    }
```

# 🔴 DOES THE KDS READ IT? NO. TWICE OVER.

**Two independent reasons, both READ:**

1. **The KDS never passes the prop.** The full `<OrderCard>` call at `kds/page.tsx:1470-1503` passes
   `viewMode`, `kdsMode`, `showCookingStep`, `hidePayments` and nine others — **`effectiveOrderReady`
   is absent**, so it takes its default:
   ```ts
     effectiveOrderReady = false,
   ```
2. **Even if it were passed, it is unreachable from the KDS.** `readyStepEnabled` lives **after** the
   `cook` and `window` branches have already returned. **`cardViewMode` is only ever `'cook'` or
   `'window'` (`:1083`), never `'solo'`.**

✅ **THEY ARE ALREADY INDEPENDENT TODAY. Making them independent needs NO new storage** — that
premise of the request is already satisfied. ⚠️ **What does NOT exist is a KDS-side control to vary
the KDS's own behaviour; the independence exists, the knob does not.**

## B3. The lifecycle, step ON versus OFF

**DASHBOARD (`solo`) — READ:**

| | Step ON (`isPub || effectiveOrderReady`) | Step OFF |
|---|---|---|
| `pending` | `✓ Confirm` / `✗ Reject` → `confirmed` | identical |
| `confirmed`/`modified` | **`Ready`** → **`ready`** | `completionBtn()` → **`collected`** (or `mark_paid` first) |
| `ready` | `completionBtn()` → `collected` | *(reachable only if another device set it)* |
| `collected` | `↩ Undo` | identical |

**So: ON = `confirmed → ready → collected`. OFF = `confirmed → collected`.**

**KDS — READ, and it is a different question entirely:**

- **Cook:** `confirmed → cooking → ready`, then **off this board**. There is no "off".
- **Window, payments on:** `ready → collected` — it **waits for** a ready that must come from
  elsewhere.
- **Window, payments off:** `confirmed → cooking → ready`, then off this board.

🔴 **AND THE EMAIL IS NOT GATED BY EITHER.** **READ** — `action/route.ts:428-440`:

```ts
    if (action === 'ready') {
      const { data: order } = await supabase.from('orders').select('*')…
      await supabase.from('orders').update({ status: 'ready' })…
      // RELEASE kitchen-capacity occupancy at ready (done cooking). …
      if (order.event_date) await rebuildProductionSlotUsage(supabase, truck.id, order.event_date)
      if (!body.defer_email) {
        await deliverReadyEmail(order, truck)
      }
```

⚠️ **`deliverReadyEmail` is unconditional on the setting** — the card comment says so explicitly
(*"model A: email ALWAYS fires on ready, NOT gated"*). **But BOTH toggles' copy claims otherwise:**
the dashboard says *"and notify customers by email when their order is ready"* and
`lib/settings-copy.ts:127` says *"and notify customers when their order is ready"*. **INFERRED: the
copy overstates what the toggle does — it gates the BUTTON, not the EMAIL. Reported at F3, not
fixed.**

---

# PART C — THE PAYMENTS TOGGLE, AS THE MODEL

## C1. The control, in full

**READ** — `kds/page.tsx:1237-1265`:

```tsx
        {/* ── TAKE PAYMENTS ON THIS DEVICE ──────────────────────────────────────────────────────────
            🔴 RENDERED ONLY WHEN THE TRUCK HAS THE PAID STEP ON. …
            NO PLAN GATE, deliberately: this is where the operator physically stands, not a paid tier.
            Placed beside Sound because both are per-DEVICE, and away from Window/Cook because those pick
            a LAYOUT while this decides whether the device handles money. …
            ⚠️ WINDOW VIEW ONLY. Cook view has no prices, no chip and no payment action by design (§9) and
            is UNCHANGED by this setting in every combination … */}
        {showPaidStep && activeView === 'window' && (
          <button
            onClick={() => togglePayments(hidePayments)}
            title={hidePayments
              ? 'Payments off — this screen finishes at Ready. Tap to take payment here.'
              : 'Payments on — tickets stay until paid & collected. Tap to finish at Ready instead.'}
…
            <span aria-hidden>💷</span>
            <span className="hidden sm:inline text-xs">{hidePayments ? 'No payments' : 'Payments'}</span>
```

| | |
|---|---|
| **Writes** | `Preferences` key **`hg_kds_payments_<token>`**, value `'on'` / `'off'` |
| **Stored** | **Capacitor `Preferences`** — native storage, **not** localStorage, **not** the DB |
| **Scope** | 🔴 **PER-DEVICE** |
| **Render gate** | `showPaidStep && activeView === 'window'` — **truck setting AND view** |
| **Plan gate** | 🔴 **NONE, deliberately** |

## C2. 🔴 The per-device mechanism, quoted

**READ** — `kds/page.tsx:362-382`:

```ts
  // ── LOAD + PERSIST "take payments on this device" ───────────────────────────────────────────────
  // Read ONCE on mount. Deliberately NOT a lazy useState initialiser like the localStorage prefs above —
  // Preferences.get is async and cannot be read synchronously at first render. That is not a hazard here:
  // the whole board is gated behind `loading`, … Should it ever lose that race, `null`
  // resolves to NOT-on, which withholds money UI rather than flashing it. Never the unsafe direction.
  // A read failure (plugin missing, private mode) lands on `false` = OFF = today's behaviour.
  useEffect(() => {
    let cancelled = false
    void Preferences.get({ key: `hg_kds_payments_${token}` })
      .then(({ value }) => { if (!cancelled) setShowPaymentsPref(value === 'on') })
      .catch(() => { if (!cancelled) setShowPaymentsPref(false) })
    return () => { cancelled = true }
  }, [token])

  // Write-through on toggle. State first so the board responds to the tap immediately; the persist is
  // fire-and-forget because a failed write costs the operator a re-tap next session, not this one.
  const togglePayments = useCallback((next: boolean) => {
    setShowPaymentsPref(next)
    void Preferences.set({ key: `hg_kds_payments_${token}`, value: next ? 'on' : 'off' }).catch(() => {})
  }, [token])
```

**And the two-gate resolution — READ, `:1021-1022`:**

```ts
  const { showPaidStep } = resolvePaidStep(truck, activeEvent)
  const hidePayments = showPaidStep && showPaymentsPref !== true
```

🔴 **THE PATTERN, STATED: client-only key, `Preferences`, token-scoped, default-to-safe, with a TRUCK
setting as the outer gate so the control is not even rendered where it would do nothing. It touches
NO table.**

⚠️ **THE PREMISE THAT `van_devices` ALREADY HOLDS PER-DEVICE CONFIG IS TRUE BUT NOT THE PATTERN HERE.
The payments toggle does NOT use `van_devices`.** Neither does the view, the layout, or the sound.
**All four per-device KDS prefs are client-side, keyed by token. Not one is in the database.** E1 has
what `van_devices` actually holds.

## C3. Does the dashboard have an equivalent, and do they interact?

🔴 **NO PER-DEVICE EQUIVALENT ON THE DASHBOARD. NOT FOUND.** `hidePayments` is **never passed** by
`app/dashboard/[token]/page.tsx` — both `<OrderCard>` calls (`:3461`, `:3467`) omit it, so it takes
its `false` default. **INFERRED: the dashboard is by definition the money screen; there is no
"this device doesn't take money" state for it.**

**What the dashboard DOES have is the TRUCK-level setting the KDS toggle sits under** —
`show_paid_step` + `show_paid_step_override`, resolved by the shared resolver. **READ** —
`lib/payments/paid-step.ts`:

```
//   showPaidStep = event.show_paid_step_override ?? truck.show_paid_step ?? false
//   takesCash    = event.takes_cash_override     ?? truck.takes_cash     ?? false
// `??` and not `||`: an explicit override of FALSE must be honoured, not fall through to the default.
```

**They interact in exactly one direction — READ, the same file:**

```
// 🔴 DO NOT RESOLVE THIS INLINE ANYWHERE. Two of the callers are server-side and two are client-side,
// and if they ever disagree the card offers "Mark paid" while `undo_collected` reverses both stages (or
// the reverse). That is the silent client/server divergence this codebase keeps rediscovering; a single
// resolver makes it impossible by construction rather than by discipline.
```

✅ **TRUCK GATES DEVICE; DEVICE NEVER GATES TRUCK.** With `show_paid_step` off the KDS chip is not
rendered and `hidePayments` is forced false. ⚠️ **AND THAT IS THE MODEL'S BEST PROPERTY: the
per-device control can only ever narrow what the truck already allows.**

⚠️ **RELEVANT TO ANY READY-STEP COPY: the same file records that `order_ready_override` behaves
DIFFERENTLY from the paid-step overrides, deliberately** —

```
// ⚠️ DELIBERATELY UNLIKE `order_ready_override`, WHICH THIS OTHERWISE MIRRORS.
// That column is SEEDED at event creation and BULK-WRITTEN onto every existing event when the truck
// default flips (app/api/manage/route.ts:~981, "they reset to the new value, by design"). Correct for
// the order-ready step; WRONG here.
```

---

# PART D — 🔴 THE DISAGREEMENT PROBLEM

## D1. Dashboard hides the step, a KDS device shows it, an order is marked READY on the KDS

**The dashboard displays it as a normal live order, in the confirmed bucket, with a GREEN header and
a working completion button. It does not break, and nothing is hidden.** Three reads:

**Bucketing — READ, `page.tsx:2695`, unconditional on the setting:**

```ts
  const confirmedOrders=eventOrders.filter(o=>['confirmed','modified','cooking','ready'].includes(o.status)).sort(sortByTimeThenId)
```

**Colour — READ, `OrderCard.tsx:719-724`, also unconditional:**

```ts
  const urgencyState = order.status === 'ready'
    ? 'ready'   as const
    : order.status === 'cooking'
    ? 'cooking' as const
    : getCombinedUrgency(slotDt, order.created_at, amberLeadMins)
  const headerCls = getHeaderStyle(urgencyState)
```

**Button — READ, `OrderCard.tsx:901-903`, outside the `readyStepEnabled` branch:**

```tsx
    if (order.status === 'ready') {
      return completionBtn()
    }
```

✅ **So the dashboard shows a green "ready" card offering the same completion button it would have
offered anyway.** ⚠️ **The only oddity: an operator who turned the step OFF sees an order in a state
their own screen cannot produce — a green card they never pressed Ready for.** **INFERRED: confusing,
not broken.**

## D2. 🔴 The reverse — the dashboard shows the step, the KDS does not. CAN AN ORDER GET STUCK?

# ✅ YES. ON THE KDS SCREEN, TODAY, WITH NO NEW SETTING.

**READ** — `OrderCard.tsx:866-875`, the Window branch under the cooking gate:

```tsx
      } else {
        // Cooking gate active
        if (['confirmed', 'modified'].includes(order.status)) {
          return (
            <>
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-500">⏳ Waiting</span>
              {completionBtnDisabled()}
            </>
          )
```

**And `completionBtnDisabled` is genuinely inert — READ, `:668-676`:**

```tsx
  const completionBtnDisabled = () => (
    <button disabled className="flex-1 bg-slate-200 text-slate-400 font-bold py-3 rounded-xl text-sm cursor-not-allowed">
…
      {effectivePaid || heldAuthorisation ? 'Collected' : completionPresses === 'one' ? 'Mark paid & collected' : effectivePartPaid ? `Mark ${money(balance.balanceMinor)} paid` : 'Mark paid'}
    </button>
  )
```

🔴 **A truck with `kds_mode` ON, running ONLY a Window KDS, cannot complete any order from that
screen.** Every confirmed order shows `⏳ Waiting` and a dead button until **something else** writes
`'ready'`. ⚠️ **The escape hatches are all off that screen: the dashboard's Ready button (if the
setting is on), a Cook device, or a Window device with payments off.**

⚠️ **THE GATE IS `truck.kds_mode`, NOT THE READY SETTING** — **READ**, `kds/page.tsx:991`:

```ts
  const kdsMode = truck?.kds_mode ?? false
```

**INFERRED: so the stuck case is reachable today by a truck that turns on `kds_mode`, runs one Window
tablet, and turns the dashboard's order-ready step off — and no control on the KDS would tell them
why the button is grey.** 🔴 **Pizzeria Gusto runs the KDS unattended; this is the shape of failure
that matters there.**

## D3. 🔴 STATED PLAINLY: can two screens disagree about an order's lifecycle?

# ✅ YES — AND IT IS DESIGNED, DOCUMENTED, AND ALREADY LIVE.

**READ** — `kds/page.tsx:1040-1052`, which says so in as many words:

```
  // ── THE LIFECYCLE HALF OF THE TOGGLE ────────────────────────────────────────────────────────────
  // 🔴 THIS IS THE POINT OF THE SETTING, AND IT IS NOT A DISPLAY RULE. A device that does not take money
  // cannot be the device that decides an order is finished — "collected" MEANS "paid and handed over",
  // and half of that is invisible here. So on such a device the ticket's life ends at READY: …
  //
  // ⚠️ THE ORDER IS NOT FINISHED — ONLY THIS SCREEN IS FINISHED WITH IT. status becomes 'ready', which is
  // NOT terminal: it stays in the dashboard's confirmedOrders bucket (page.tsx:~2219 includes 'ready')
  // and on any other KDS whose device toggle is on. Nothing is written that could hide it there — the
  // filter is a local render-time predicate over a SHARED status, so two devices disagreeing about what
  // they show is exactly the intended consequence and costs no state.
```

🔴 **THE SAFETY PROPERTY, AND IT IS THE RIGHT ONE: there is ONE status per order, in ONE column, and
every screen renders a local predicate over it. No screen writes a status another screen cannot see.**
**INFERRED: disagreement is therefore always about VISIBILITY, never about TRUTH — which is why this
has been safe so far.**

**WHAT AN OPERATOR ACTUALLY SEES, per surface:**

| Surface | An order at `'ready'` |
|---|---|
| **Dashboard**, step ON | green card, `completionBtn()` — expected |
| **Dashboard**, step OFF | 🔴 green card it could not have produced, `completionBtn()` — **works, reads as a mystery** |
| **KDS Cook** | 🔴 **gone from the board** (`cookOrders` filter) |
| **KDS Window**, payments ON | green card, `completionBtn()` — expected |
| **KDS Window**, payments OFF | 🔴 **gone from the board** (`windowOrders` filter) |

⚠️ **THE REAL RISK IS NOT THE TOGGLE — IT IS THAT "GONE FROM THE BOARD" AND "FINISHED" LOOK
IDENTICAL.** An unattended KDS whose ticket vanishes at Ready gives the operator no way to
distinguish *"handed over"* from *"waiting on a screen I am not looking at"*. **INFERRED: adding a
THIRD independent way to reach that state multiplies the combinations an operator has to hold in
their head — currently `activeView` × `hidePayments` × `kds_mode` × `effectiveOrderReady` = the
matrix in D5.**

## D4. 🔴 Capacity — does it depend on the READY transition?

# ✅ YES. CAPACITY IS FREED AT READY. CONFIRMED FROM CODE.

**READ** — `action/route.ts:432-436`:

```ts
      // RELEASE kitchen-capacity occupancy at ready (done cooking). buildUnitsFromOrders no longer counts a
      // 'ready' order, so the rebuild frees its production slot — shared with every capacity reader (the
      // orders-screen day load + the seating projection; queued/new orders can then seat into the freed
      // window). The order itself stays in the list/counts — only its capacity occupancy clears.
      if (order.event_date) await rebuildProductionSlotUsage(supabase, truck.id, order.event_date)
```

**And the single source of truth — READ, `lib/slot-bookings.ts:221-226`:**

```ts
    // Occupies the oven from placement THROUGH cooking; RELEASES at 'ready' (done cooking — sitting on
    // the counter) and at collected/cancelled/rejected. 'cooking' must be here or a rebuild fired while
    // another order is mid-cook would free it prematurely (oversell). ONE source — both the live fit-read
    // and rebuildProductionSlotUsage use this, so every reader (orders-screen day load, the seating
    // projection) inherits the release-at-ready behaviour.
    .in('status', ['pending', 'confirmed', 'modified', 'cooking'])
```

## 🔴 SO WHAT HAPPENS TO CAPACITY WHEN A DEVICE HIDES THE READY STEP?

✅ **CAPACITY IS NOT LEAKED. IT IS RELEASED LATE.** **READ, and this is the reason:** the allow-list
excludes **`'ready'` AND `'collected'` alike.** `'collected'` is equally absent, and
`lib/capacity-breach.ts:28` states the same rule:

```
// 'ready' is released, 'collected'/'cancelled'/'rejected' are terminal — none contribute load, so
```

**So `confirmed → collected` frees exactly the same capacity as `confirmed → ready → collected`.**
Skipping ready does **not** strand a production slot.

⚠️ **BUT THE RELEASE IS DELAYED BY THE WHOLE HANDOVER WINDOW.** With the step on, the oven frees when
the food comes off it. Without it, the slot stays occupied until the customer physically collects and
someone presses the completion button. **INFERRED: on a busy service that is the difference between
the capacity engine seating a new order into a window that is genuinely free and refusing it —
an UNDERSELL, never an oversell.**

⚠️ **THE ONE PLACE THIS COULD BITE: `collected` must also rebuild, or the delay becomes permanent.**
**NOT VERIFIED in this task** — the `collected` handler at `action/route.ts:467` was not read to the
end. **Stated as a gap, not a finding.**

⚠️ **AND A STALE COMMENT SITS RIGHT BESIDE IT** — **READ**, `action/route.ts:455-463`, two adjacent
comments that contradict each other:

```ts
    // Reverts status ready→confirmed (the dashboard undo). Status-only: unlike undo_collected, marking
    // ready never freed a production slot, so there is NO production_slot_usage rebuild here.
    if (action === 'undo_ready') {
…
      // RE-BOOK: 'confirmed' occupies capacity again, so rebuild to reclaim the slot ready had freed —
      // else the undo leaves an undercount (oversell). Mirrors the §-engine release-at-ready symmetry.
      if (order?.event_date) await rebuildProductionSlotUsage(supabase, truck.id, order.event_date)
```

✅ **THE CODE IS RIGHT — it does rebuild.** 🔴 **The first comment is stale and says the opposite of
both the second comment and the `'ready'` handler.** Reported at F3.

## D5. The combination matrix (INFERRED from the branches above)

| `kds_mode` | KDS view | payments | KDS terminal action | Needs another screen? |
|---|---|---|---|---|
| off | Window | on | `completionBtn()` from `confirmed` | ❌ no |
| off | Window | off | `Ready`, then gone | ✅ yes, to collect |
| on | Window | on | 🔴 **disabled until `ready`** | ✅ **YES — D2's stuck case** |
| on | Window | off | `Ready`, then gone | ✅ yes, to collect |
| any | Cook | n/a | `Ready`, then gone | ✅ **always** |

---

# PART E — WHAT INDEPENDENCE WOULD REQUIRE

## E1. A new column, or can `van_devices` carry it?

**`van_devices` in full — READ, `supabase/migrations/20260701_van_devices.sql:10-21`:**

```sql
CREATE TABLE IF NOT EXISTS van_devices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id       text NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,   -- trucks.id is TEXT (not uuid) — FK must match
  van_id         uuid REFERENCES truck_vans(id) ON DELETE SET NULL,        -- truck_vans.id IS uuid — correct as-is
  device_id      text NOT NULL UNIQUE,               -- stable client UUID (localStorage, first launch); re-bind = UPDATE
  push_token     text,                                -- APNs device token; NULL until push permission granted
  platform       text,                                -- 'ios' | 'web' | …
  default_screen text NOT NULL DEFAULT 'dashboard' CHECK (default_screen IN ('dashboard','kds')),
  notify_enabled boolean NOT NULL DEFAULT true,       -- device-level opt-out (van-level master lives in van_notification_prefs)
  last_seen      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
```

🔴 **NO READY-STEP COLUMN EXISTS. "Not found" is the answer.**

**THREE OPTIONS, reported not recommended:**

| Option | Cost | ⚠️ |
|---|---|---|
| **Nothing** — reuse Cook/payments | **zero storage** | the semantics are wrong (A3, F1) |
| **Client-side pref**, like payments/view | **zero migration** | ✅ **matches all four existing KDS prefs** |
| **`van_devices` column** | 🔴 **a migration Dominic runs by hand** | see the blocker below |

🔴 **THE `van_devices` BLOCKER, READ FROM THE SCHEMA HEADER:**

```
-- Per-device operator config (Package 3): binds a physical device to a van + its default screen +
-- push token. Keyed on device_id (per-DEVICE, not per-login — one login owns many device rows).
```

⚠️ **A row exists only for a device that has BOUND, and binding is native-only** (`/api/native/bind-device`).
**A KDS open in a browser — including any web tablet — has NO `van_devices` row at all.** **INFERRED:
storing the setting there would silently fail to apply on exactly the devices most likely to be
running as a fixed kitchen screen.**

## E2. Per-device or per-KDS-session? What happens on a second device?

**Whatever the storage, the KDS's existing precedent is per-DEVICE-per-TOKEN, and it does NOT
travel.** **READ, all four current prefs:**

| Pref | Key | Store |
|---|---|---|
| View (Window/Cook) | `hg_kds_view_<token>` | localStorage |
| Layout (List/Grid) | `hg_kds_layout_<token>` | localStorage |
| Sound | `hg_kds_sound_<token>` | localStorage |
| **Payments** | **`hg_kds_payments_<token>`** | **Capacitor `Preferences`** |

**A SECOND DEVICE OPENING THE KDS GETS THE DEFAULTS, NOT THE FIRST DEVICE'S CHOICES.** **READ** —
`activeView = viewOverride ?? (isDemo ? 'window' : kdsView)` with `viewOverride` null until
localStorage is read, so the second device lands on **Window**; and `showPaymentsPref` starts `null`,
which `hidePayments` resolves as **hide**.

⚠️ **SO "PER-KDS-SESSION" IS NOT REALLY AVAILABLE AS A CHOICE** — the same token is what identifies
the board, and every existing pref is keyed by it. **INFERRED: a new control would be per-device
whether or not that is intended, and a truck with three tablets would configure it three times, with
no screen anywhere listing what each device is set to.** 🔴 **That is already true of the payments
toggle today, and it is the thing an unattended-KDS truck would notice.**

## E3. What removing Window/Cook would break

**Every reader of the value, swept — READ:**

| Reader | Effect of removal |
|---|---|
| `kds/page.tsx:1003` `activeView` | the resolution itself |
| `kds/page.tsx:1057` `displayOrders` | 🔴 **the `cookOrders`/`windowOrders` split — a real lifecycle filter** |
| `kds/page.tsx:1083` `cardViewMode` | 🔴 **the entire `OrderCard` cook branch** |
| `kds/page.tsx:1252` payments chip | **gated on `activeView === 'window'` — would need a new gate** |
| `kds/page.tsx:1191` Cook tab | the Max-plan gate `can('cook_screen')` |
| `hg_kds_view_<token>` | **stale localStorage on every device that ever picked Cook** |
| `?view=cook` URL param (`:76`) | any saved link/bookmark stops selecting Cook |

🔴 **AND THE PERSISTED-PREFERENCE HAZARD, WHICH IS THE ONE THAT BITES SILENTLY:** the key is written
by an effect that only runs when `viewOverride !== null`, and **read unconditionally on mount**.
**INFERRED: if the control is removed but the read is left, every device that ever chose Cook keeps
booting into a mode with no way to leave it.**

⚠️ **`?view=cook` IS NOT LINKED FROM ANYWHERE.** `grep -rn "view=cook"` across `app components lib`
outside `kds/page.tsx` returns **nothing. "Not found" — stated plainly.** **INFERRED: only manually
saved bookmarks would break.**

⚠️ **AND THE COOK VIEW IS A SOLD PLAN FEATURE** — `lib/plan-features.ts:284` maps
`'Customer-facing display'` to `cook_screen`. **Removing it removes something a Max plan advertises.**

---

# PART F — THE PICTURE

## F1. 🔴 RENAME, NEW SETTING, OR BOTH?

# NEITHER, AS FRAMED — AND THAT IS THE FINDING.

**Taking the three candidate answers in turn:**

🔴 **NOT A RENAME. Window/Cook cannot become "order-ready on/off" without breaking both halves.**

- **Cook has no "off".** Ready is its **only** action; remove it and `renderButtons` returns `null`
  (A3). **A cook screen with no ready step is a screen with no buttons.**
- **Window has no "on".** Window's ready state is something it **consumes**, not something it
  produces (A2). **Renaming it "ready step off" would describe a screen that is WAITING for a ready
  step, not one without it.**
- **And the pair are meant to run SIMULTANEOUSLY on two devices**, not to be alternative settings for
  one. ⚠️ **"Window/Cook goes away as confusing" would delete a two-device workflow, a Max plan
  feature, and the payments chip's render gate.**

⚠️ **NOT A NEW SETTING FOR INDEPENDENCE EITHER — because independence already exists.** The KDS does
not read `effectiveOrderReady` and structurally cannot (B2). **A truck can already hide the ready step
on the dashboard while a KDS shows it. That is today's behaviour, not a feature request.**

✅ **WHAT IS ACTUALLY MISSING IS A NAME AND A NARROWER SCOPE.** The KDS **already has** a per-device
control that decides whether this screen ends at Ready — **it is the payments chip**, and its own
tooltip says exactly that:

```
              title={hidePayments
                ? 'Payments off — this screen finishes at Ready. Tap to take payment here.'
                : 'Payments on — tickets stay until paid & collected. Tap to finish at Ready instead.'}
```

🔴 **SO THE GAP IS: that control is invisible unless `show_paid_step` is ON — and Pizzeria Gusto is on
the default, which is OFF.** **READ**, `resolvePaidStep`: *"BOTH DEFAULTS OFF ⇒ … the state every
truck is in today"*, and the chip's own gate `{showPaidStep && activeView === 'window' && (`.
**INFERRED: Gusto has never seen this control, which is very likely why it reads as missing.**

## F2. What building it would involve — STORAGE, UI, LIFECYCLE, kept separate

**STORAGE**

- ✅ **No new column is required for independence** (B2) — it already holds.
- **If a per-device pref is wanted:** one key in the existing pattern, `Preferences` or localStorage,
  keyed by token, default-to-safe. **No migration. No `van_devices` change.**
- 🔴 **If `van_devices` is chosen instead:** a hand-run migration **and** the native-only-binding
  blocker in E1 — web KDS devices have no row.

**UI**

- One chip in the KDS header, beside Sound and Payments.
- 🔴 **Its render gate is the hard question, not its markup:** the payments chip is
  `showPaidStep && activeView === 'window'`. A ready-step chip on the **Cook** view would be a control
  that does nothing (A3) — **the exact failure the payments comment warns about**.
- **Naming collides with the dashboard's existing "Order-ready step".** Two controls, same words,
  different scope, on two screens the same operator uses.

**LIFECYCLE**

- 🔴 **This is the expensive part and the only part that touches Pizzeria Gusto's service.** Every new
  combination multiplies D5's matrix, and the KDS is unattended.
- The `'ready'` write, the capacity release, and the customer email are **one transition** — the email
  is **not** gated by any of these settings (B3). **A new control that suppresses Ready on one device
  changes when a customer gets emailed, via which device the operator happens to use.**
- **No status semantics need to change.** One column, local predicates (D3) — the existing safety
  property.

## F3. 🔴 THE RISKS

**1. 🔴 THE STUCK WINDOW SCREEN — D2, AND IT EXISTS TODAY.** `kds_mode` on + a lone Window device +
payments on = every order shows `⏳ Waiting` and a **disabled** completion button, forever, unless
another surface writes `'ready'`. **On an unattended KDS this is a service-stopping state with no
on-screen explanation.** ⚠️ **Any new ready-step control adds a fourth way to enter it.**

**2. 🔴 "GONE FROM THE BOARD" AND "FINISHED" ARE INDISTINGUISHABLE — D3.** Cook mode and
payments-off Window mode both remove a ticket at Ready. That is deliberate and documented, and it is
still the state an unattended screen communicates worst.

**3. ⚠️ CAPACITY RELEASES LATE, NOT NEVER — D4.** Both `'ready'` and `'collected'` are outside the
allow-list, so hiding the step **delays** the oven freeing until collection rather than stranding it.
**Undersell, never oversell.** 🔴 **Unverified gap: I did not read the `collected` handler to
confirm it rebuilds. If it does not, the delay becomes permanent.**

**4. ⚠️ DEFECT — the code comment that says Window/Cook picks "a LAYOUT"** (`kds/page.tsx:1243`) is
false, and is contradicted 190 lines above it and by the whole `OrderCard` branch. **INFERRED: the
most likely origin of the belief that this is cosmetic.**

**5. ⚠️ DEFECT — the stale `undo_ready` comment** (`action/route.ts:456-457`) claims *"marking ready
never freed a production slot, so there is NO production_slot_usage rebuild here"* immediately before
a rebuild, and directly contradicts the `'ready'` handler. **The code is correct; the comment is
not.**

**6. ⚠️ DEFECT — both order-ready toggles' copy overstates them.** The dashboard says *"and notify
customers by email when their order is ready"*; `lib/settings-copy.ts:127` says the same. **The email
is NOT gated** (B3) — it fires on every `'ready'` write from any surface. **An operator who turns the
step off to stop the emails will still send them.**

**7. ⚠️ NO SCREEN SHOWS WHAT EACH DEVICE IS SET TO — E2.** Already true of payments; a second
per-device control doubles it.

**8. ⚠️ PLAN COUPLING — E3.** Cook is gated on `can('cook_screen')`, a Max feature. Anything built on
Window/Cook inherits that gate; the payments chip deliberately has none.

**NO IMPLEMENTATION IS PROPOSED. Nothing was changed.**

---

# PART G — INTEGRITY

## G1. Byte scan — every file opened

Byte-level scan for NUL and every control byte below 0x09 (plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F). **Never
grep.**

```
  components/dashboard/OrderCard.tsx                     87,216 bytes  offending=0  CR=0
  app/dashboard/[token]/kds/page.tsx                    109,046 bytes  offending=0  CR=0
  app/dashboard/[token]/page.tsx                        390,162 bytes  offending=0  CR=0
  app/api/dashboard/action/route.ts                     174,041 bytes  offending=0  CR=0
  app/api/dashboard/route.ts                             49,584 bytes  offending=0  CR=0
  app/api/manage/route.ts                                78,884 bytes  offending=0  CR=0
  app/manage/[token]/page.tsx                           782,627 bytes  offending=0  CR=0
  lib/slot-bookings.ts                                   24,528 bytes  offending=0  CR=0
  lib/payments/paid-step.ts                               7,971 bytes  offending=0  CR=0
  lib/settings-copy.ts                                   10,392 bytes  offending=0  CR=0
  lib/capacity-breach.ts                                  6,194 bytes  offending=0  CR=0
  supabase/migrations/20260701_van_devices.sql            2,629 bytes  offending=0  CR=0
TOTAL OFFENDING ACROSS ALL FILES: 0
```

✅ **Zero offending bytes, zero CR. All opened READ-ONLY.**

## G2. Byte scan of this report

Separate pass, run after writing: **48,465 bytes, offending = 0, CR = 0** — no NUL, no control
byte below 0x09, no CRLF, no lone CR.

## G3. 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 23 | 0 | 23 |
| U+1F534 LARGE RED CIRCLE | 54 | 0 | 54 |
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 171 | 0 | 171 |
| U+26A0 WARNING SIGN | 36 | **36** | **0** |

**Every warning sign is paired; ZERO are bare — 36 of 36.** Total U+FE0F in the file = **36**, which
accounts for all of them, so no other base carries one. ⚠️ **The three unpaired bases are the
carrier-correct state, not a defect:** each is internally consistent (0 of 23, 0 of 54, 0 of 171), so
no base is split across two renderings. **20 distinct non-ASCII classes**, all of which appear in the
source files this report quotes.

## G4. `git status` — proof nothing changed

```
$ git status --porcelain
?? docs/kds-ready-step-report.md
```

🔴 **NO FILE WAS CREATED, MODIFIED OR DELETED BY THIS TASK EXCEPT THIS REPORT.** The working tree is
otherwise clean and the single untracked entry is this file.

⚠️ **NOTE, SINCE IT CHANGED BETWEEN TASKS AND THE PREVIOUS REPORT RECORDS OTHERWISE:** at the start of
the previous task the tree carried four modified files (`kds/page.tsx`, `OrderCard.tsx`,
`reference-manual.md`, `statusBar.ts`) plus two untracked reports. **They are no longer in
`git status`, so they were committed outside this session.** **Not one was touched by this
diagnosis** — this task opened twelve files and edited none of them.
