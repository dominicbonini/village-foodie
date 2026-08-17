# KDS step switches — STAGE 1 ONLY. P4 IS FALSE. NO CODE WAS CHANGED.

**Stage 1 was completed. Stage 2 was NOT started, because a premise is false.** Per the brief —
*"IF ANY OF P1 TO P5 IS FALSE, STOP. Write the report and make no code change."*

**No file was edited, created or deleted except this report.** Nothing committed, nothing staged,
nothing reverted, stashed or cleaned. No build, no `next dev`, no `next build`, no `cap sync`, no
deploy, no SQL, no migration, no server file touched.

**No span of the prompt arrived garbled.** ⚠️ **One instruction pair is mutually unsatisfiable as
written — I am flagging it rather than choosing.** See "THE CONTRADICTION" below.

# 🔴 P4 IS FALSE. THE WINDOW BRANCH RENDERS NO `Ready` BUTTON AT ALL.

**P4 as stated:** *"The window branch renders Ready for a determinate set of statuses, and
`readyStepOff` suppresses it."*

**READ, and it is a zero-match result:** a scan of the entire `if (viewMode === 'window') { … }` block
for `onAction('ready'` and `label="Ready"` returns **nothing**. Every `Ready` button in
`components/dashboard/OrderCard.tsx` lives in one of two other branches:

```
847:            <Btn label="Ready"         colour="green" … onClick={() => onAction('ready', order.order_key)} />   ← COOK branch
850:          <Btn label="Ready" colour="green" … onClick={() => onAction('ready', order.order_key)} />              ← COOK branch
857:            <Btn label="Ready" colour="green" … onClick={() => onAction('ready', order.order_key)} />            ← COOK branch
922:        ? <Btn label={`${truck?.truck_emoji || "🍕"} Ready`} colour="green" … />                                 ← SOLO branch
```
*(line numbers as-of-today, working tree)*

🔴 **THE SET IS EMPTY, NOT DETERMINATE.** And `readyStepOff` therefore **suppresses nothing** — it
replaces the `kdsMode` waiting treatment with an enabled `completionBtn()`.

---

# 🔴 THE CONTRADICTION THIS EXPOSES, STATED BEFORE THE EVIDENCE

The brief's third configuration says:

> `Ready on, Handover on` -> buttons: Ready, then the completion control. **This is today's window
> device.**

🔴 **IT IS NOT.** Today's window device with `kdsMode` true renders **`⏳ Waiting` + a DISABLED
completion button** on `confirmed`/`modified`, and with `kdsMode` false renders **`completionBtn()`
immediately**. **Neither shows `Ready`.**

**So configuration 3 as specified is NEW behaviour, not preserved behaviour** — which collides
head-on with:

> **INVARIANT 1 — NO DEVICE CHANGES BEHAVIOUR ON FIRST LOAD AFTER DEPLOY.** Every existing device, on
> its next load, must render the same buttons and the same board membership as it does today.

⚠️ **A window device that maps to "Ready on, Handover on" would gain a `Ready` button it does not have
today. Satisfying the configuration table breaks Invariant 1; satisfying Invariant 1 makes
configuration 3 unbuildable as described. I am not choosing between them.**

⚠️ **The brief anticipated exactly this:** *"If you cannot reproduce today's behaviour for any
combination, STOP and say which."* **The combination is `Ready on, Handover on` on a `kds_mode` truck.**

---

# STAGE 1 — THE QUOTES

## 1. `renderButtons`, COMPLETE — READ, working tree

**HEAD vs TREE: DIFFERS.** The tree adds the `readyStepOff` block (18 lines, comments included);
everything else is byte-identical, verified by `diff` of the `awk`-extracted span between
`git show HEAD:components/dashboard/OrderCard.tsx` and the working tree.

```tsx
  const renderButtons = () => {
    if (pendingSync) {
      return (
        <div className="flex items-center gap-2 py-3 text-slate-400 text-sm justify-center">
          <span>⏳</span>
          <span>Syncing…</span>
        </div>
      )
    }

    if (order.status === 'pending') {
      return (
        <>
          <Btn label="✓ Confirm" colour="green" loading={isLoading('confirm')} onClick={() => onAction('confirm', order.order_key)} />
          <Btn label="✗ Reject"  colour="red"   loading={isLoading('reject')}  onClick={() => onAction('reject', order.order_key)} />
        </>
      )
    }

    // ── COOK'S BUTTON SET, AND WINDOW'S WHEN THIS DEVICE DOES NOT TAKE MONEY ──────────────────────
    // 🔴 REUSED, NOT DUPLICATED. A window device with payments off has exactly the cook screen's job —
    // advance the food, stop at Ready — so it gets exactly the cook screen's controls. …
    // ⚠️ EXPLICITLY `viewMode === 'window'`, never a bare `hidePayments`. Solo is the DASHBOARD's mode; …
    if (viewMode === 'cook' || (viewMode === 'window' && hidePayments)) {
      if (['confirmed', 'modified'].includes(order.status)) {
        // Stage 1 (order-ready redesign): the cooking step is now ALWAYS on in cook mode — DE-COUPLED
        // from show_cooking_step (was `kdsMode && showCookingStep`). …
        return kdsMode ? (
          <>
            <Btn label="Start cooking" colour="amber" loading={isLoading('cooking')} onClick={() => onAction('cooking', order.order_key)} />
            <Btn label="Ready"         colour="green" loading={isLoading('ready')}   onClick={() => onAction('ready', order.order_key)} />
          </>
        ) : (
          <Btn label="Ready" colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.order_key)} />
        )
      }
      if (order.status === 'cooking') {
        return (
          <>
            <span className="flex-1 text-amber-700 font-bold text-sm flex items-center">🔥 Cooking…</span>
            <Btn label="Ready" colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.order_key)} />
          </>
        )
      }
      return null
    }

    if (viewMode === 'window') {
      // ── 🔴 THIS DEVICE HAS THE ORDER-READY STEP TURNED OFF (KDS per-device chip) ──────────────────
      // … [TREE-ONLY BLOCK] …
      if (readyStepOff) {
        if (['confirmed', 'modified', 'cooking', 'ready'].includes(order.status)) {
          return completionBtn()
        }
      }
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
        if (order.status === 'cooking') {
          return (
            <>
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700">🔥 Cooking…</span>
              {completionBtnDisabled()}
            </>
          )
        }
        if (order.status === 'ready') {
          return completionBtn()
        }
      }
    }

    // solo mode (default — the operator ORDERS screen). …
    const readyStepEnabled = isPub || effectiveOrderReady
    if (['confirmed', 'modified'].includes(order.status)) {
      return readyStepEnabled
        ? <Btn label={`${truck?.truck_emoji || "🍕"} Ready`} colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.order_key)} />
        : completionBtn()
    }
    if (order.status === 'ready') {
      return completionBtn()
    }
    if (order.status === 'collected') {
      return <Btn label="↩ Undo" colour="slate" loading={isLoading('undo_collected')} onClick={() => onAction('undo_collected', order.order_key)} />
    }
    return null
  }
```

## 🔴 WHICH STATUSES RENDER `Ready` IN THE WINDOW BRANCH: **NONE.**

## Where control passes to `completionBtn` — every path, READ

| Branch | Condition | Statuses reaching `completionBtn()` |
|---|---|---|
| window, `readyStepOff` **(TREE-ONLY)** | `readyStepOff` | `confirmed`, `modified`, `cooking`, `ready` |
| window, `!kdsMode` | cooking gate off | `confirmed`, `modified`, `ready` |
| window, `kdsMode` | cooking gate on | 🔴 **`ready` ONLY** — `confirmed`/`modified`/`cooking` get `completionBtnDisabled()` |
| solo | `!readyStepEnabled` | `confirmed`, `modified` |
| solo | always | `ready` |

🔴 **A PRE-EXISTING NO-BUTTONS HOLE, FOUND WHILE QUOTING AND NOT PREVIOUSLY REPORTED IN THIS FORM.**
Window + `!kdsMode` + status `'cooking'`: the `!kdsMode` sub-block has **no `'cooking'` case**, so
control falls out of the window block entirely into solo, where `readyStepEnabled` is false on the KDS
and `'cooking'` matches none of `confirmed`/`modified`/`ready`/`collected` — reaching **`return
null`**.

⚠️ **This matters to the brief's own framing.** It says both-off is forbidden *"because `renderButtons`
ends in `return null`"* — **but that terminal `return null` is already reachable today**, on a window
device, with no switch involved, whenever another device puts an order into `'cooking'`. **Forbidding
both-off does not close it.**

## 2. The cook branch condition — READ. **HEAD and TREE: IDENTICAL.**

```tsx
    if (viewMode === 'cook' || (viewMode === 'window' && hidePayments)) {
```

## 3. `readyStepOff` — the branch, the declaration, the default. **TREE-ONLY (absent from HEAD).**

```tsx
      if (readyStepOff) {
        if (['confirmed', 'modified', 'cooking', 'ready'].includes(order.status)) {
          return completionBtn()
        }
      }
```

```tsx
  readyStepOff = false,
```

```tsx
  /** KDS PER-DEVICE order-ready step, OFF. Window view only: the screen completes an order directly
   *  instead of waiting for a Ready. Deliberately NOT the same prop as `effectiveOrderReady` — that one
   *  is the DASHBOARD's server-resolved event/van setting and is read only in solo mode, so the two
   *  surfaces stay independent by construction. Defaults false = today's behaviour everywhere. */
  readyStepOff?: boolean
```

⚠️ **Note the shape: the block does NOT `return` when the status matches none of the four. It falls
through to the `!kdsMode` / `kdsMode` blocks below.** For `'collected'` on a `readyStepOff` window
device, control reaches solo's `↩ Undo`.

## 4. `completionBtn`, COMPLETE — READ. **HEAD and TREE: IDENTICAL** (verified by `diff`).

```tsx
  const completionBtn = () => {
    if (effectivePaid || heldAuthorisation) {
      return <Btn label="Collected" colour="dark" loading={isLoading('collected')} onClick={() => onAction('collected', order.order_key)} />
    }
    if (completionPresses === 'one') {
      if (takesCash) {
        return (
          <>
            <Btn label="💷 Cash & collected" colour="money" loading={isLoading('collected_cash')}
              onClick={() => onAction('collected_cash', order.order_key)} />
            <Btn label="💳 Card & collected" colour="money" loading={isLoading('collected_card')}
              onClick={() => onAction('collected_card', order.order_key)} />
          </>
        )
      }
      return <Btn label="Mark paid & collected" colour="dark" loading={isLoading('collected')} onClick={() => onAction('collected', order.order_key)} />
    }
    if (takesCash) {
      return (
        <>
          <Btn label="💷 Cash" colour="money" loading={isLoading('mark_paid_cash')}
            onClick={() => onAction('mark_paid_cash', order.order_key)} />
          <Btn label="💳 Card" colour="money" loading={isLoading('mark_paid_card')}
            onClick={() => onAction('mark_paid_card', order.order_key)} />
        </>
      )
    }
    return (
      <Btn
        label={effectivePartPaid ? `Mark ${money(balance.balanceMinor)} paid` : 'Mark paid'}
        colour="money" loading={isLoading('mark_paid')}
        onClick={() => onAction('mark_paid', order.order_key)}
      />
    )
  }
```

## ⚠️ ON YOUR CLOSING NOTE ABOUT THE COMPLETION CONTROL — CORRECT, WITH ONE ADDITION

You wrote that a paid/collected screen *"would follow the same display as what's selected in the
dashboard for one or two presses, so they would either see 'mark paid' and 'collected' or 'mark paid
and collected'."*

✅ **CONFIRMED for `takesCash === false`, and the mechanism is exactly as you describe:**

- `completionPresses === 'one'` → **`Mark paid & collected`**, firing `collected`.
- `completionPresses === 'two'` → **`Mark paid`**, firing `mark_paid` — and then, because `mark_paid`
  makes `effectivePaid` true, the **first branch** takes over and the same card renders **`Collected`**,
  firing `collected`. **The second press is not a second button rendered beside the first; it is the
  same slot re-rendering once the order's state changes.**

⚠️ **ONE ADDITION: there are FOUR shapes, not two.** With `takesCash === true` each splits into a
cash/card pair — `💷 Cash & collected` / `💳 Card & collected` at one press, and `💷 Cash` / `💳 Card`
at two. ✅ **Nothing in the proposed change touches any of this, and the brief already forbids
touching it.**

## 5. The KDS filter chain — READ. **HEAD and TREE: IDENTICAL** (`diff` of the span returned no
differences).

```ts
  const overlayedOrders = kdsOverlay.size
    ? orders.map(o => { const ov = kdsOverlay.get(o.order_key); return ov ? ({ ...o, ...ov } as Order) : o })
    : orders

  // Base: exclude terminal statuses for all views
  const activeOrders = overlayedOrders.filter(o =>
    !['collected', 'cancelled', 'rejected'].includes(o.status)
  )

  // Cook view: cook's job ends at ready — hide ready orders from the kitchen screen
  const cookOrders = activeOrders.filter(o => o.status !== 'ready')
…
  const windowOrders = hidePayments
    ? activeOrders.filter(o => o.status !== 'ready')
    : activeOrders

  const displayOrders = (activeView === 'cook' ? cookOrders : windowOrders)
    .slice()
    .sort((a, b) => {
      const ta = a.slot ? new Date(`1970-01-01T${a.slot}`).getTime() : 0
      const tb = b.slot ? new Date(`1970-01-01T${b.slot}`).getTime() : 0
      return ta - tb
    })

  const MAX_GRID_VISIBLE = activeLayout === 'grid' ? 8 : 6
  const visibleOrders = activeLayout === 'grid'
    ? displayOrders.slice(0, MAX_GRID_VISIBLE)
    : displayOrders
  const overflowCount = activeLayout === 'grid'
    ? Math.max(0, displayOrders.length - MAX_GRID_VISIBLE)
    : 0

  // Done orders: last 5 collected (window view only)
  const doneOrders = overlayedOrders
    .filter(o => o.status === 'collected')
    .slice(0, 5)
```

## 6. `hidePayments`, `resolvePaidStep`, and the `readyStepOn` initialiser — READ

**`hidePayments` — HEAD and TREE: IDENTICAL:**

```ts
  const { showPaidStep } = resolvePaidStep(truck, activeEvent)
  const hidePayments = showPaidStep && showPaymentsPref !== true
```

**`resolvePaidStep` — `lib/payments/paid-step.ts`, not in the diff, so HEAD and TREE identical:**

```ts
export function resolvePaidStep(
  truck: PaidStepTruck | null | undefined,
  event: PaidStepEvent | null | undefined,
): ResolvedPaidStep {
  const showPaidStep = event?.show_paid_step_override ?? truck?.show_paid_step ?? false
  return {
    showPaidStep,
    takesCash: event?.takes_cash_override ?? truck?.takes_cash ?? false,
```

**`readyStepOn` — 🔴 TREE-ONLY:**

```ts
  const [readyStepOn, setReadyStepOn] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem(`hg_kds_readystep_${token}`) !== 'off'
  })
```

## 7. Every read and write of the two device keys — READ

**`hg_kds_payments_<token>` — HEAD and TREE: IDENTICAL. Two sites, both Capacitor `Preferences`:**

```ts
    void Preferences.get({ key: `hg_kds_payments_${token}` })
      .then(({ value }) => { if (!cancelled) setShowPaymentsPref(value === 'on') })
      .catch(() => { if (!cancelled) setShowPaymentsPref(false) })
```
```ts
    void Preferences.set({ key: `hg_kds_payments_${token}`, value: next ? 'on' : 'off' }).catch(() => {})
```

**`hg_kds_readystep_<token>` — 🔴 TREE-ONLY. Two sites, both `localStorage`:**

```ts
    return localStorage.getItem(`hg_kds_readystep_${token}`) !== 'off'
```
```ts
    localStorage.setItem(`hg_kds_readystep_${token}`, readyStepOn ? 'on' : 'off')
```

🔴 **NEITHER KEY IS DUAL-WRITTEN TODAY. They use different mechanisms — payments on `Preferences`,
ready-step on `localStorage` — and neither writes the other's store.**

## 8. Both call sites of `can('cook_screen')` — READ. **HEAD and TREE: IDENTICAL.**

```ts
  const activeView: KdsView = can('cook_screen')
    ? (viewOverride ?? (isDemo ? 'window' : kdsView))
    : 'window'
```
```tsx
          {can('cook_screen') && (
```

**The first gates whether Cook is reachable at all (false forces `'window'`); the second gates the Cook
tab button. No other call site exists in the repo.**

---

# THE PREMISE VERDICTS

## ✅ P1 — CONFIRMED

**READ:** the KDS's only producer is `const cardViewMode = activeView === 'cook' ? 'cook' : 'window'`,
passed as `viewMode={cardViewMode}`; a repo-wide scan for `viewMode=` finds no other producer. The
dashboard passes `effectiveOrderReady={effectiveOrderReady}` ×2 and **neither `viewMode=` nor
`readyStepOff=`** — no matches in `app/dashboard/[token]/page.tsx`.

## ✅ P2 — CONFIRMED

**READ:** a scan of the whole filter span for `payment_status`, `amount_paid`, `ledger`, `balance`,
`getOrderBalance` and `payments[` returns **no matches**. ⚠️ `windowOrders` reads `hidePayments`, which
is a truck/event setting AND a device preference — **configuration, never a money value.**

## ✅ P3 — CONFIRMED

**READ:** `const hidePayments = showPaidStep && showPaymentsPref !== true`. With `showPaidStep` false
the `&&` short-circuits, so `hidePayments` is false **whatever the preference holds** — the payments
key has **no effect** on such trucks today.

## 🔴 P4 — **REFUTED**

**READ:** zero `Ready` buttons in the window branch. The set is empty, not determinate, and
`readyStepOff` suppresses nothing — it substitutes an enabled `completionBtn()` for the `kdsMode`
waiting treatment.

## ✅ P5 — CONFIRMED

**READ — the KDS:**

```ts
      const result = await gatedAction({
        url: '/api/dashboard/action',
        // 'ready' defers the customer email so the undo toast can cancel it (mirrors the dashboard).
        body: { token, pin, action, order_key: orderKey, ...(action === 'ready' ? { defer_email: true } : {}) },
        kind: 'status', order_key: orderKey, online: isOnline(), expectedFrom: STATUS_REPLAY_EXPECTED_FROM,
      })
```

**READ — the dashboard:**

```ts
      const result=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action,order_key:orderKey,...(action==='ready'?{defer_email:true}:{})},kind:'status',order_key:orderKey,online:isOnline(),expectedFrom:STATUS_REPLAY_EXPECTED_FROM})
```

✅ **Same endpoint, same body shape, same gate, same `expectedFrom`.** ✅ **And no KDS-specific server
branch:** a scan of `app/api/dashboard/action/route.ts` for `isKds`, `from_kds`, `'kds'` returns
**nothing**.

**SCORE: four confirmed, one refuted. STAGE 2 NOT STARTED.**

---

# WHAT WOULD BE NEEDED TO PROCEED — REPORTED, NOT PROPOSED

**The brief's own words are the blocker, so the resolution is yours, not mine.** Two of its statements
cannot both be true of the same code:

1. *"`Ready on, Handover on` -> buttons: Ready, then the completion control. **This is today's window
   device.**"*
2. *"**INVARIANT 1** … Every existing device, on its next load, must render the same buttons … as it
   does today."*

⚠️ **A decision on which one governs would unblock Stage 2.** ⚠️ **A second, smaller discrepancy sits
under it: the brief's first configuration says `Ready on, Handover off -> Ready only … This is today's
cook button set`, but the cook branch renders `Start cooking` AND `Ready` when `kdsMode` is true —
`Ready only` is the `kdsMode === false` shape.**

⚠️ **AND THE PRE-EXISTING `return null` HOLE (window + `!kdsMode` + `'cooking'`) is unaddressed by the
both-off prohibition**, because it is reachable without any switch.

**Nothing above is a recommendation. No design, scope or implementation is offered.**

---

# VERIFICATION — WHAT WAS VERIFIED HOW

🔴 **NOTHING WAS VERIFIED BY EXECUTION. NO CODE WAS CHANGED, SO THERE WAS NOTHING TO EXECUTE.**

| Check | Method |
|---|---|
| Every quote in Stage 1 | 🔴 **SOURCE READ ONLY** |
| HEAD vs TREE for `renderButtons`, `completionBtn`, the filter chain | ✅ **EXECUTED** — `git show HEAD:` piped through `awk` and compared with `diff` |
| "No `Ready` in the window branch" | ✅ **EXECUTED** — `awk` span extraction + pattern scan, zero matches |
| P1, P2, P5 scans | ✅ **EXECUTED** — repo-wide pattern scans returning counts |
| P3 short-circuit | 🔴 **SOURCE READ ONLY** — reasoning about `&&`, not observed |
| The three configurations rendering their stated button sets | 🔴 **NOT VERIFIED — not built** |
| Both-off unreachable through the UI | 🔴 **NOT VERIFIED — not built** |
| Unset defaults rendering identically to today | 🔴 **NOT VERIFIED — not built** |
| First paint after a cleared localStorage | 🔴 **NOT VERIFIED — not built** |

⚠️ **`tsc` was NOT run either, because nothing was changed. A clean typecheck would not have been
verification of anything here in any case.**

---

# INTEGRITY

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. Every file opened, plus this report in a SEPARATE pass.**

```
  components/dashboard/OrderCard.tsx                     89,194  offending=0  CR=0
  app/dashboard/[token]/kds/page.tsx                    122,095  offending=0  CR=0
  app/dashboard/[token]/page.tsx                        391,343  offending=0  CR=0
  lib/payments/paid-step.ts                               7,971  offending=0  CR=0
  app/api/dashboard/action/route.ts                     174,041  offending=0  CR=0
  docs/kds-step-switches-report.md   (SEPARATE PASS)      25,421  offending=0  CR=0
TOTAL OFFENDING ACROSS ALL FILES: 0
```

⚠️ **Every one of those files was opened READ-ONLY. None was written.**

## 🔴 Carrier-aware variation-selector check on this report

**Per emoji-presentation base: how many occurrences are FOLLOWED by U+FE0F. A raw total is not
reported, because a raw total cannot distinguish a bare warning sign from a paired selector on a
different base.**

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 27 | 0 | 27 |
| U+1F534 LARGE RED CIRCLE | 24 | 0 | 24 |
| U+26A0 WARNING SIGN | 15 | **15** | **0** |
| U+1F4B7 BANKNOTE WITH POUND SIGN | 4 | 0 | 4 |
| U+1F4B3 CREDIT CARD | 4 | 0 | 4 |

**Every warning sign is paired; ZERO are bare — 15 of 15.** The file's total U+FE0F count is **15**,
which accounts for all of them and leaves none attached to any other base. ⚠️ **The four unpaired
bases are each internally consistent (0 of 27, 0 of 24, 0 of 4, 0 of 4), so no base is split across
two renderings** — the banknote and credit-card glyphs are quoted from `completionBtn` and are bare
there too.

## `git status --porcelain`

```
$ git status --porcelain
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/DemoGetStarted.tsx
 M components/dashboard/OrderCard.tsx
 M docs/reference-manual.md
?? components/shared/CuisinePicker.tsx
?? components/shared/EventActionsModal.tsx
?? components/shared/EventFinishTimeModal.tsx
?? docs/cuisine-field-report.md
?? docs/extend-removal-report.md
?? docs/finish-time-dry-report.md
?? docs/kds-exit-point-report.md
?? docs/kds-ready-toggle-report.md
?? docs/kds-step-switches-report.md
?? docs/kds-steps-model-report.md
?? docs/kds-toggles-review-report.md
```

🔴 **NOTHING WAS CHANGED BY THIS TASK EXCEPT `docs/kds-step-switches-report.md`.**

**Which entries were already there before this task began — ALL OF THEM EXCEPT THIS REPORT:**

| Entry | Pre-existing? |
|---|---|
| `M app/dashboard/[token]/kds/page.tsx` | ✅ pre-existing — ready-step toggle, finish-time extraction, shared Event actions menu, extend removal |
| `M app/dashboard/[token]/page.tsx` | ✅ pre-existing — finish-time extraction, shared menu, extend removal |
| `M app/manage/[token]/page.tsx` | ✅ pre-existing — cuisine dropdown |
| `M components/DemoGetStarted.tsx` | ✅ pre-existing — cuisine dropdown |
| `M components/dashboard/OrderCard.tsx` | ✅ pre-existing — the ready-step toggle |
| `M docs/reference-manual.md` | ✅ pre-existing — the V11.22 update |
| `?? components/shared/CuisinePicker.tsx` | ✅ pre-existing |
| `?? components/shared/EventActionsModal.tsx` | ✅ pre-existing |
| `?? components/shared/EventFinishTimeModal.tsx` | ✅ pre-existing |
| `?? docs/cuisine-field-report.md` | ✅ pre-existing |
| `?? docs/extend-removal-report.md` | ✅ pre-existing |
| `?? docs/finish-time-dry-report.md` | ✅ pre-existing |
| `?? docs/kds-exit-point-report.md` | ✅ pre-existing |
| `?? docs/kds-ready-toggle-report.md` | ✅ pre-existing |
| `?? docs/kds-steps-model-report.md` | ✅ pre-existing |
| `?? docs/kds-toggles-review-report.md` | ✅ pre-existing |
| 🔴 `?? docs/kds-step-switches-report.md` | 🔴 **THIS TASK — the only new entry** |
