# Replacing Window/Cook with three per-device step switches

READ-ONLY DIAGNOSIS. **No file was edited, nothing was committed, no build was run, no deploy, no
database write, no SQL.** `lib/payments/` and `app/api/dashboard/action/route.ts` were read and quoted
and **not touched**. `git status` is in G4. **Nothing is proposed beyond Part F, and Part F proposes no
implementation.**

**`docs/kds-ready-toggle-report.md` and `docs/kds-ready-step-report.md` were both read first.** Where
this report contradicts either, it says so.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

Every claim is marked **READ** or **INFERRED**. **Dashboard and KDS are reported separately.**

---

# 🔴 THE FINDING, BEFORE THE DETAIL

**The model is expressible — with ONE exception, and the exception is on the money path.**

# 🔴 "COLLECTION ON, PAYMENT OFF" CANNOT BE BUILT AS A CLIENT SWITCH, BECAUSE `collected` BOOKS MONEY ON THE SERVER.

**READ** — `app/api/dashboard/action/route.ts:481-540`. The `collected` action does not merely write a
status; it calls `recordCollectionPayment` for the **full outstanding balance**:

```ts
      // One-press completion books the SAME in-person row as mark_paid — recordCollectionPayment,
      // channel 'in_person_other', the full outstanding balance — so a held order double-charges here
      // too.
```

```ts
        const res = heldOnCollect
          ? { chargedMinor: 0 }
          : await recordCollectionPayment(supabase, { orderKey, truckId: truck.id, createdBy: actor.actorId, method: collectMethod })
```

🔴 **A device with "Payment off, Collection on" would press a button that takes money anyway.** The
only path that completes an order *without* booking anything is the `effectivePaid || heldAuthorisation`
branch, which is a property of **the order**, not a setting. **A3 and F1 carry this; it is the one thing
with no home in the new model.**

**Everything else Window/Cook does maps onto the three switches or onto layout — A2's table shows
which.**

---

# PART A — WHAT WINDOW/COOK ACTUALLY DOES, EXHAUSTIVELY

## A1. Every branch on `activeView`

**READ** — `grep -n "activeView" app/dashboard/[token]/kds/page.tsx`, complete. **Eleven references;
two are comments, one is the definition, and EIGHT are live branches.**

**THE DEFINITION:**

```ts
  const activeView: KdsView = can('cook_screen')
    ? (viewOverride ?? (isDemo ? 'window' : kdsView))
    : 'window'
```

**BRANCH 1 — which orders are on the board:**

```ts
  const displayOrders = (activeView === 'cook' ? cookOrders : windowOrders)
```

**BRANCH 2 — which button set the card renders:**

```ts
  // KDS always uses window or cook — never solo
  const cardViewMode = activeView === 'cook' ? 'cook' : 'window'
```

**BRANCHES 3 and 4 — the tab switcher's own highlighting:**

```tsx
              activeView === 'window'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
```
```tsx
                activeView === 'cook'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
```

**BRANCH 5 — the payments chip is hidden on Cook:**

```tsx
        {showPaidStep && activeView === 'window' && (
```

**BRANCH 6 — the Ready-step chip is hidden on Cook:**

```tsx
        {activeView === 'window' && !hidePayments && (
```

**BRANCH 7 — the "Open cook screen" link:**

```tsx
        {activeView === 'window' && truck.crew_mode === 'full' && (
```

**BRANCH 8 — the "To make" all-day pill bar:**

```tsx
      {allDayPills.length > 0 && activeView === 'window' && (
```

**BRANCH 9 — the "Done today" strip:**

```tsx
          {activeView === 'window' && activeLayout === 'list' && doneOrders.length > 0 && (
```

⚠️ **AND THE BOARD FILTERS THE FIRST BRANCH SELECTS BETWEEN — READ:**

```ts
  // Cook view: cook's job ends at ready — hide ready orders from the kitchen screen
  const cookOrders = activeOrders.filter(o => o.status !== 'ready')
…
  const windowOrders = hidePayments
    ? activeOrders.filter(o => o.status !== 'ready')
    : activeOrders
```

**PLUS EVERYTHING `cardViewMode` REACHES INSIDE `OrderCard` — READ, `grep -n "viewMode"`, the live
branches:**

```tsx
  const partPaidRow = (hidePayments || viewMode === 'cook' || !effectivePartPaid) ? null : (
```
```ts
  const showPrices = viewMode !== 'cook'
```
```tsx
    if (viewMode === 'cook' || (viewMode === 'window' && hidePayments)) {
```
```tsx
    if (viewMode === 'window') {
```
```tsx
      {viewMode === 'cook' ? (
        /* Cook: non-interactive two-line header, no collapse */
```
```tsx
        <div className={`w-full text-left ${viewMode === 'window' ? 'px-3 py-2' : 'px-4 py-3'} ${headerCls}`}>
```
```tsx
          {viewMode === 'cook' ? (
```
```tsx
                          className={`… ${viewMode === 'solo' || viewMode === 'window' ? 'text-sm' : 'text-base'} …`}
```

## A2. 🔴 EVERYTHING IT CONTROLS — it is not a view switch

| # | What it controls | Cook | Window | READ at |
|---|---|---|---|---|
| 1 | **Statuses on the board** | `'ready'` **hidden** | `'ready'` shown (unless `hidePayments`) | `cookOrders` / `windowOrders` |
| 2 | **Button set** | Start cooking + **Ready** | Waiting/disabled → completion | `OrderCard:839,864` |
| 3 | **Prices** | 🔴 **HIDDEN** | shown | `showPrices = viewMode !== 'cook'` |
| 4 | **Part-paid money row** | 🔴 **HIDDEN** | shown | `partPaidRow` |
| 5 | **Payments chip** | 🔴 **NOT RENDERED** | rendered | `showPaidStep && activeView === 'window'` |
| 6 | **Ready-step chip** | 🔴 **NOT RENDERED** | rendered | `activeView === 'window' && !hidePayments` |
| 7 | **Ready tickets leave the board** | ✅ **YES** | no (unless `hidePayments`) | the two filters |
| 8 | **Card header** | non-interactive, 2-line, **no collapse** | interactive, collapsible | `OrderCard:1000` |
| 9 | **Header padding** | `px-4 py-3` | `px-3 py-2` | `OrderCard:1022` |
| 10 | **Item rendering** | grouped by category, larger type | flat list, `text-sm` | `OrderCard:1120,1212` |
| 11 | **"To make" pill bar** | 🔴 **HIDDEN** | shown | `allDayPills … && activeView === 'window'` |
| 12 | **"Done today" strip** | 🔴 **HIDDEN** | shown (list layout) | the done strip |
| 13 | **"Open cook screen" link** | hidden | shown | `crew_mode === 'full'` |
| 14 | **Plan gate** | 🔴 **Max only** (`can('cook_screen')`) | always | the definition |

## A3. 🔴 WHICH OF THOSE THE THREE SWITCHES WOULD COVER — AND WHAT IS LOST

| # | Item | Covered by | Verdict |
|---|---|---|---|
| 1 | Statuses on the board | **Ready** + **Collection** (a screen that does not do a step need not see orders past it) | ✅ derivable |
| 2 | Button set | **all three** | ⚠️ **partly — see the money hole below** |
| 3 | Prices | **Payment** | ⚠️ **INFERRED — needs an explicit decision; see A4** |
| 4 | Part-paid money row | **Payment** | ✅ already gated on `hidePayments` too |
| 5 | Payments chip | n/a — it *becomes* the Payment switch | ✅ |
| 6 | Ready-step chip | n/a — it *is* the Ready switch | ✅ |
| 7 | Ready tickets leave the board | **Ready** | ✅ derivable |
| 8 | **Card header shape** | 🔴 **NOTHING** | 🔴 **LOST** |
| 9 | **Header padding** | 🔴 **NOTHING** | 🔴 **LOST** |
| 10 | **Item rendering (category grouping, type size)** | 🔴 **NOTHING** | 🔴 **LOST** |
| 11 | **"To make" pill bar** | 🔴 **NOTHING** | 🔴 **LOST** |
| 12 | **"Done today" strip** | **Collection** (a screen that collects has a done list) | ⚠️ arguable |
| 13 | **"Open cook screen" link** | 🔴 **NOTHING — the thing it links to would not exist** | 🔴 **LOST** |
| 14 | **The Max plan gate** | 🔴 **NOTHING** | 🔴 **LOST — see F3** |

# 🔴 SIX THINGS HAVE NO HOME IN A THREE-SWITCH MODEL, AND FIVE OF THEM ARE ONE THING: THE COOK CARD IS A DIFFERENT CARD.

**INFERRED, and it is the structural point:** items 8, 9, 10 and 11 are **legibility at a grill**, not
lifecycle — big type, grouped by category, no collapse, a running "to make" count. **None of Ready,
Payment or Collection describes "this screen is read from two feet away with flour on your hands."**
⚠️ **A fourth switch, or a layout control kept alongside the three, would be needed to preserve it —
that is a design decision, not a diagnosis, so it is reported rather than proposed.**

⚠️ **Item 14 is a commercial finding, not a technical one:** `cook_screen` is a **Max-plan feature**
(`lib/plan-features.ts` maps it from `'Customer-facing display'`). Three free per-device switches
would give every plan what Max currently sells.

## A4. ⚠️ WHAT KEEPS MONEY OFF A COOK SCREEN — the Payment switch does NOT cover everything

**WHAT COOK HIDES TODAY, and by which mechanism — READ, all four:**

| Hidden thing | Mechanism today | Would the Payment switch cover it? |
|---|---|---|
| Item + total prices | `const showPrices = viewMode !== 'cook'` | 🔴 **NO — `showPrices` reads `viewMode`, NOT `hidePayments`** |
| Part-paid money row | `(hidePayments \|\| viewMode === 'cook' \|\| …)` | ✅ **YES — already gated on `hidePayments` as well** |
| Payment buttons | `if (viewMode === 'cook' \|\| (viewMode === 'window' && hidePayments))` | ✅ **YES — `hidePayments` already routes a window device to the cook button set** |
| The payments chip itself | `showPaidStep && activeView === 'window'` | ✅ **YES — it is the switch** |

# 🔴 PROOF THAT IT DOES **NOT** COVER EVERYTHING: `showPrices`.

**READ, the whole line:**

```ts
  const showPrices = viewMode !== 'cook'
```

⚠️ **IT DOES NOT MENTION `hidePayments`.** A **window** device with payments **off** shows prices
today — only `cook` hides them. **So under a three-switch model, "Payment off" would have to be
extended to also mean "no prices", which is a BEHAVIOUR CHANGE for the existing payments-off window
devices, not merely a rename.**

⚠️ **AND IT IS NOT OBVIOUSLY THE RIGHT CHANGE.** **INFERRED: a hatch device that does not take money
may still need to read the price** — to answer "how much was that?" while someone else takes the
payment. **Conflating "does not handle money" with "must not see money" is exactly the conflation
Window/Cook makes today, and the three-switch model was meant to unpick it.**

🔴 **STATED PLAINLY, AS A4 ASKS: the answer "the Payment switch covers it" is FALSE as the code stands.
It covers three of the four; prices are keyed to `viewMode` and would need a deliberate decision.**

---

# PART B — THE THREE SWITCHES

## B1. Does each already exist, and where is it stored?

### READY — ✅ **EXISTS**

**READ** — `app/dashboard/[token]/kds/page.tsx`:

```ts
  const [readyStepOn, setReadyStepOn] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem(`hg_kds_readystep_${token}`) !== 'off'
  })
```
```ts
    localStorage.setItem(`hg_kds_readystep_${token}`, readyStepOn ? 'on' : 'off')
```

**Storage: `localStorage`, key `hg_kds_readystep_<token>`. Gated to `activeView === 'window' && !hidePayments`.**

### PAYMENT — ✅ **EXISTS**

**READ:**

```ts
    void Preferences.get({ key: `hg_kds_payments_${token}` })
      .then(({ value }) => { if (!cancelled) setShowPaymentsPref(value === 'on') })
      .catch(() => { if (!cancelled) setShowPaymentsPref(false) })
```
```ts
    void Preferences.set({ key: `hg_kds_payments_${token}`, value: next ? 'on' : 'off' }).catch(() => {})
```
```ts
  const hidePayments = showPaidStep && showPaymentsPref !== true
```

🔴 **Storage: Capacitor `Preferences`, key `hg_kds_payments_<token>` — NOT localStorage.** ⚠️ **And it
carries a TRUCK-level outer gate (`showPaidStep`) that the other two do not.**

### COLLECTION — 🔴 **NOT FOUND. Stated plainly.**

**READ** — no per-device collection switch exists anywhere. `grep` for a collection preference in
`app/dashboard` and `components/dashboard` returns nothing. **What exists instead is TRUCK-level:**

```ts
  const { takesCash, completionPresses } = resolvePaidStep(truck, event)
```

⚠️ **`completion_presses` is `'one' | 'two'` and is TRUCK-LEVEL WITH NO EVENT OVERRIDE**, and
`lib/payments/paid-step.ts` says why in terms that matter here:

```
// 🔴 TRUCK-LEVEL ONLY — no `completion_presses_override`, and do not add one without reading the
// reasoning in supabase/migrations/20260810_trucks_completion_presses.sql: this setting decides what
// `undo_collected` REVERSES, so flipping it mid-event can make an undo delete an hour-old payment.
```

🔴 **THAT WARNING APPLIES DIRECTLY TO A PER-DEVICE COLLECTION SWITCH.** **INFERRED: if the switch
changed what `collected` does, changing it mid-service could make an undo reverse the wrong thing —
the exact hazard that ruling exists to prevent.**

## B2. 🔴 ALL EIGHT COMBINATIONS

**Derived by READING `renderButtons` and the `collected` handler. `R` = Ready, `P` = Payment,
`C` = Collection. Order state assumed `confirmed`, unpaid, no card hold — the ordinary case.**

| # | R | P | C | Buttons on a `confirmed` order | Can it reach a terminal status? |
|---|---|---|---|---|---|
| 1 | ✅ | ✅ | ✅ | `Ready` → then `Mark paid` → `Collected` (or one-press `Mark paid & collected`) | ✅ **YES** |
| 2 | ✅ | ✅ | ❌ | `Ready`, then a paid-but-uncollected order with **no completion button** | 🔴 **NO — stops at `ready`/paid** |
| 3 | ✅ | ❌ | ✅ | `Ready` → `Collected` | ⚠️ **YES, BUT THE SERVER BOOKS THE MONEY ANYWAY** |
| 4 | ✅ | ❌ | ❌ | `Ready` only — ticket leaves the board at `ready` | 🔴 **NO on this device** (today's cook screen) |
| 5 | ❌ | ✅ | ✅ | `Mark paid` → `Collected` (or one-press) | ✅ **YES** |
| 6 | ❌ | ✅ | ❌ | `Mark paid` only — order paid, never collected | 🔴 **NO** |
| 7 | ❌ | ❌ | ✅ | `Collected` | ⚠️ **YES, BUT THE SERVER BOOKS THE MONEY ANYWAY** |
| 8 | ❌ | ❌ | ❌ | 🔴 **NONE** | 🔴 **NO — THE CARD HAS NO BUTTONS** |

🔴 **ROWS 3 AND 7 ARE THE HOLE.** `collected` is a single server action that writes the status **and**
books the balance:

```ts
        const res = heldOnCollect
          ? { chargedMinor: 0 }
          : await recordCollectionPayment(supabase, { orderKey, truckId: truck.id, createdBy: actor.actorId, method: collectMethod })
```

⚠️ **A client-side "Payment off" cannot suppress that.** The only no-money completion is
`effectivePaid || heldAuthorisation`, which is a fact about the ORDER:

```tsx
    if (effectivePaid || heldAuthorisation) {
      return <Btn label="Collected" colour="dark" … onClick={() => onAction('collected', order.order_key)} />
    }
```

⚠️ **Rows 2 and 6 are the mirror hole:** the card has no "collect without completing" action, because
`completionBtn` *is* the collection action. **A paid, uncollected order simply has nothing to press.**

## B3. 🔴 CAN ALL THREE BE OFF? YES — AND THE CARD RENDERS NOTHING.

**Row 8. READ the fall-through: `renderButtons` handles `pending` first, then the cook branch, then
window, then solo, and its last statement is:**

```tsx
    return null
```

# 🔴 THE MODEL NEEDS A FLOOR. STATED PLAINLY.

**Not one of the eight combinations is safe on its own terms — FOUR of them (2, 4, 6, 8) leave an
order unable to reach a terminal status on that device.** ⚠️ **Rows 2 and 4 are ACCEPTABLE TODAY
because they describe a cook screen: the ticket is handed to another device, and the KDS's own comment
says so explicitly:**

```
  // ⚠️ THE ORDER IS NOT FINISHED — ONLY THIS SCREEN IS FINISHED WITH IT. status becomes 'ready', which is
  // NOT terminal: it stays in the dashboard's confirmedOrders bucket … and on any other KDS whose device
  // toggle is on.
```

🔴 **ROW 8 IS NOT ACCEPTABLE UNDER ANY READING: a screen with no buttons and no other screen implied.**

**WHICH FLOOR — reported, not chosen.** Three candidates, each with a cost:

- **"At least one switch on"** — blocks row 8 only. ⚠️ Still permits rows 2, 4 and 6, which strand an
  order unless another device exists.
- **"Collection on, or Ready on"** — guarantees the ticket at least LEAVES this board. ⚠️ Permits row
  2 (paid, uncollected, stuck).
- **"Collection always on unless Ready is on"** — the closest to today's actual rule. ⚠️ The most
  restrictive, and it makes Collection not fully independent, which is the premise of the change.

⚠️ **INFERRED, and worth weighing: a floor enforced in the UI is a floor an operator can still defeat
by configuring two devices badly. Today's model prevents that structurally, because a role implies its
steps.**

## B4. Which combinations a real truck would use — reported, not chosen

| # | R/P/C | Real-world reading | Plausible? |
|---|---|---|---|
| 1 | ✅✅✅ | One screen does everything — a solo trader's single tablet | ✅ **the common case** |
| 5 | ❌✅✅ | Hatch that takes money and hands over, no ready step — **today's `readyStepOff` window device** | ✅ **already built** |
| 4 | ✅❌❌ | **Today's cook screen**, exactly | ✅ **the second most common** |
| 3 | ✅❌✅ | Cook marks ready then hands over, money taken elsewhere | ⚠️ **plausible, but rows 3's money hole blocks it** |
| 7 | ❌❌✅ | A runner who only hands food over | ⚠️ **same money hole** |
| 2 | ✅✅❌ | Marks ready and takes money, someone else hands over | ⚠️ **unusual; strands the order here** |
| 6 | ❌✅❌ | Takes money only — a till with no kitchen role | ⚠️ **rare** |
| 8 | ❌❌❌ | A read-only board | 🔴 **B3's floor case** |

⚠️ **Row 8 has one honest use — a display screen for the queue that nobody touches — which is an
argument for making it a NAMED mode rather than an accidental combination.** **Reported.**

---

# PART C — PER-DEVICE INDEPENDENCE

## C1. How per-device settings persist today — 🔴 TWO MECHANISMS, NOT ONE

**THE PATTERN — READ, `keepScreenOn`:**

```ts
  const [keepScreenOn, setKeepScreenOn] = useState(() => {
    if (typeof window === 'undefined') return !isDemo
    const pref = localStorage.getItem(`hg_keepawake_${token}`)
    return isDemo ? pref === 'on' : pref !== 'off'
  })
```

**EVERY PER-DEVICE KDS KEY — READ, `grep -rn "hg_kds_\|hg_keepawake\|hg_soundcfg"`, complete:**

| Pref | Key | Mechanism | Lazy initialiser? |
|---|---|---|---|
| Keep screen on | `hg_keepawake_<token>` | `localStorage` | ✅ |
| View (Window/Cook) | `hg_kds_view_<token>` | `localStorage` | ✅ |
| Layout (List/Grid) | `hg_kds_layout_<token>` | `localStorage` | ✅ |
| Sound | `hg_kds_sound_<token>` | `localStorage` | ✅ |
| Sound config | `hg_soundcfg_<token>` | `localStorage` | ✅ |
| **Ready step** | `hg_kds_readystep_<token>` | `localStorage` | ✅ |
| 🔴 **Payments** | `hg_kds_payments_<token>` | 🔴 **Capacitor `Preferences`** | 🔴 **NO — async** |

# 🔴 "CONFIRM ONE MECHANISM, NOT TWO" — I CANNOT. THERE ARE TWO, AND IT IS DELIBERATE.

**READ — the reasoning, in the file:**

```
  // ⚠️ CAPACITOR PREFERENCES, NOT localStorage, UNLIKE the view/layout/sound prefs beside it. Those
  // predate the native shell. Preferences persists to UserDefaults on iOS, which survives the hard
  // navigations and cold-kills that can hand a WKWebView a fresh localStorage (the reasoning is written
  // out in lib/native/preferencesStorage.ts). On web the plugin falls back to localStorage, so a browser
  // KDS persists too. This toggle changes which orders LEAVE THE BOARD, so losing it silently is worse
  // than losing a list/grid preference.
```

⚠️ **AND THE TWO CANNOT BE UNIFIED WITHOUT A TRADE:** `Preferences.get` is **async** and cannot run in
a `useState` initialiser, so the durable mechanism is exactly the one that **cannot** restore on the
first frame. **INFERRED: three switches on one mechanism means choosing between first-frame restore
(localStorage) and surviving a WKWebView cold-kill (Preferences) — for all three, not per switch.**

🔴 **Payments today resolves its one-frame gap SAFELY (`null` → hide money). Ready and Collection would
have to pick a safe direction too, and for Collection the safe direction is not obvious: hiding a
completion button strands an operator at the hatch, showing one prematurely could book money.**

## C2. 🔴 CAN KDS VALUES LEAK INTO THE DASHBOARD? NO — VERIFIED TWO WAYS.

**READ — `grep -n "hg_kds_" app/dashboard/[token]/page.tsx`:**

```
NOT FOUND
```

🔴 **THE DASHBOARD READS NO `hg_kds_*` KEY AT ALL.** The only keys it shares with the KDS are
`hg_keepawake_<token>` and `hg_soundcfg_<token>`, neither of which is one of the three switches.

**AND WHAT THE DASHBOARD READS INSTEAD — READ, all server-resolved:**

```ts
      vanOrderReadyDefault = van?.order_ready_enabled ?? false
      effectiveOrderReady = (capacityEvent as any)?.order_ready_override ?? vanOrderReadyDefault
```
```ts
  const { takesCash, completionPresses } = resolvePaidStep(truck, event)
```

**AND THE STRUCTURAL GUARANTEE — READ, `OrderCard`, the only read of `effectiveOrderReady`:**

```ts
    const readyStepEnabled = isPub || effectiveOrderReady
```

⚠️ **It sits AFTER the `cook` and `window` branches have returned, and `cardViewMode` is only ever
`'cook' | 'window'` — so the dashboard's `solo` path and the KDS's paths cannot reach each other's
settings.** ✅ **Navigating KDS → dashboard → KDS changes nothing: the dashboard never reads the KDS
keys, and the KDS never writes the dashboard's columns.**

⚠️ **ONE THING TO WATCH IF THE MODEL CHANGES: `readyStepOff` is a NEW prop on the SHARED `OrderCard`.
It defaults `false` and the dashboard does not pass it. If a future change passed it from both
surfaces, that guarantee would be gone.** **INFERRED, and it is the only realistic leak path.**

## C3. A device with nothing stored

| Switch | Nothing stored | READ |
|---|---|---|
| **Ready** | `getItem(...) !== 'off'` → 🔴 **ON** | the initialiser |
| **Payment** | `showPaymentsPref` starts `null` → `hidePayments = showPaidStep && null !== true` → **money hidden if the truck splits the paid step** | `:1092` |
| **Collection** | 🔴 **does not exist; the card always offers completion** | B1 |
| View | `null` → `kdsView` → **`'window'`** | `:1090` |
| Layout | `null` → the truck's `display_mode` | `:1093` |

✅ **DO THESE MATCH TODAY'S BEHAVIOUR? YES, for a fresh device: Window view, ready step on, money hidden
until the operator opts in, completion always available.** ⚠️ **INFERRED: that is the same as today
only because "Collection" has no stored value to be missing. Introduce it and a fresh tablet gains a
default that did not exist before — and a default of OFF would ship a tablet that cannot finish an
order.**

## C4. `van_devices` — belongs there, or not?

**READ — the whole table:**

```sql
CREATE TABLE IF NOT EXISTS van_devices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id       text NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  van_id         uuid REFERENCES truck_vans(id) ON DELETE SET NULL,
  device_id      text NOT NULL UNIQUE,
  push_token     text,
  platform       text,
  default_screen text NOT NULL DEFAULT 'dashboard' CHECK (default_screen IN ('dashboard','kds')),
  notify_enabled boolean NOT NULL DEFAULT true,
  last_seen      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
```

🔴 **NO STEP COLUMNS EXIST. "Not found."**

| Choice | Costs |
|---|---|
| **`localStorage` / `Preferences`** (today) | ✅ no migration, ✅ first-frame restore, ✅ works on web. 🔴 **invisible to anyone but that device — no screen anywhere lists what each tablet is set to**; lost on a browser-data clear |
| **`van_devices`** | ✅ auditable and remotely visible; ✅ survives a data clear. 🔴 **needs a hand-run migration**; 🔴 **async, so NO first-frame restore — the exact defect the lazy initialiser exists to prevent**; 🔴 **rows exist only for NATIVE devices that have BOUND** |

🔴 **THE BINDING BLOCKER, READ FROM THE TABLE'S OWN HEADER:**

```
-- Per-device operator config (Package 3): binds a physical device to a van + its default screen +
-- push token. Keyed on device_id (per-DEVICE, not per-login — one login owns many device rows).
```

⚠️ **A KDS open in a browser has NO `van_devices` row** — binding happens through
`/api/native/bind-device`. **INFERRED: storing the three switches there would silently fail to apply on
exactly the web tablets most likely to be running as a fixed kitchen screen.**

---

# PART D — THE LIFECYCLE

## D1. The full progression, and which switch owns each step

**READ — the statuses, from the handlers in `app/api/dashboard/action/route.ts`:**

```
draft → pending → confirmed ─┬─→ cooking ──→ ready ──→ collected
                             └─────────────────────────↗
         (reject)  (cancel)
```

| Transition | Action | Switch that would own it |
|---|---|---|
| `pending → confirmed` | `confirm` | 🔴 **NONE — always available** (`renderButtons` handles `pending` before every branch) |
| `confirmed → cooking` | `cooking` | 🔴 **NONE — gated on `truck.kds_mode`, a TRUCK setting** |
| `confirmed`/`cooking` `→ ready` | `ready` | ✅ **READY** |
| *(money booked)* | `mark_paid*` | ✅ **PAYMENT** |
| `* → collected` | `collected*` | ⚠️ **COLLECTION — but the action books money too (B2)** |
| `collected → confirmed/ready` | `undo_collected` | 🔴 **NONE** |

⚠️ **TWO TRANSITIONS HAVE NO SWITCH: `confirm` and `cooking`.** `cooking` is controlled by
`truck.kds_mode`, a truck-level flag — **INFERRED: a fourth axis the three-switch model does not
describe, and the reason row 4 of B2 still shows "Start cooking" on some trucks and not others.**

## D2. 🔴 CAPACITY WITH READY OFF — LATE, NOT NEVER

**READ — `lib/slot-bookings.ts`, the allow-list, at BOTH sites (`:226` and `:474`):**

```ts
    .in('status', ['pending', 'confirmed', 'modified', 'cooking'])
```

# ✅ `'ready'` AND `'collected'` ARE **BOTH** ABSENT. THE SLOT FREES LATE, NEVER NEVER.

- **Ready ON:** the oven frees at `ready` — when the food comes off it.
- **Ready OFF:** the oven frees at `collected` — when the customer takes it.

⚠️ **INFERRED: the cost is a delayed release across the handover window — the capacity engine may
refuse a new order for a slot that is genuinely free. UNDERSELL, never oversell, never a stranded
slot.**

🔴 **BUT COMBINE IT WITH COLLECTION OFF AND THE ANSWER CHANGES.** Rows 2, 4 and 6 of B2 never reach
`collected` **on that device**. **INFERRED: the slot then frees only when some OTHER device or the
dashboard collects the order — so "late" becomes "as late as the slowest surface", and if no surface
collects it, never.** ⚠️ **That is not a new risk (today's cook screen has it), but the three-switch
model makes it reachable by configuration rather than by role.**

## D3. With COLLECTION off, what marks an order finished?

🔴 **NOTHING ON THAT DEVICE. "Not found" is the answer.**

**READ — `collected` is the only terminal transition the card offers, and it comes from exactly one
place:**

```tsx
  const completionBtn = () => {
…
    if (effectivePaid || heldAuthorisation) {
      return <Btn label="Collected" … onClick={() => onAction('collected', order.order_key)} />
    }
```

**Remove it and the remaining actions are `confirm`, `reject`, `cooking`, `ready` and
`undo_collected` — none terminal except `reject`.** ⚠️ **So a Collection-off device depends entirely
on another surface: another KDS, or the dashboard's own orders screen.** **INFERRED: this is
acceptable ONLY if the model guarantees such a surface exists, and nothing in the product checks
that.**

## D4. 🔴 CAN TWO DEVICES DISAGREE ABOUT ONE ORDER? YES — BY DESIGN, AND IT IS DOCUMENTED

**READ — the KDS says so itself:**

```
  // ⚠️ THE ORDER IS NOT FINISHED — ONLY THIS SCREEN IS FINISHED WITH IT. status becomes 'ready', which is
  // NOT terminal: it stays in the dashboard's confirmedOrders bucket (page.tsx:~2219 includes 'ready')
  // and on any other KDS whose device toggle is on. Nothing is written that could hide it there — the
  // filter is a local render-time predicate over a SHARED status, so two devices disagreeing about what
  // they show is exactly the intended consequence and costs no state.
```

**WHAT EACH SURFACE SHOWS FOR ONE ORDER, per status — READ:**

| Status | Cook device | Window, payments ON | Window, payments OFF | Dashboard |
|---|---|---|---|---|
| `confirmed` | `Start cooking` + `Ready` | `⏳ Waiting` + **disabled** completion | `Start cooking` + `Ready` | `Ready` or completion, per its OWN setting |
| `cooking` | `🔥 Cooking…` + `Ready` | `🔥 Cooking…` + **disabled** completion | `🔥 Cooking…` + `Ready` | green card, completion |
| `ready` | 🔴 **gone from the board** | completion | 🔴 **gone from the board** | green card, completion |
| `collected` | gone | in "Done today" | gone | `↩ Undo` |

✅ **THE SAFETY PROPERTY, AND IT IS THE RIGHT ONE: ONE status column, and every screen renders a LOCAL
PREDICATE over it. Disagreement is always about VISIBILITY, never about TRUTH.**

# 🔴 DOES THE NEW MODEL FIX THE STUCK-WINDOW-TABLET STATE, OR REPRODUCE IT? **BOTH.**

**THE STUCK STATE TODAY — READ, `OrderCard`:**

```tsx
        if (['confirmed', 'modified'].includes(order.status)) {
          return (
            <>
              <span className="text-xs font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-500">⏳ Waiting</span>
              {completionBtnDisabled()}
            </>
          )
        }
```

✅ **FIXED, for the case that prompted it:** the existing Ready switch already resolves it —

```tsx
      if (readyStepOff) {
        if (['confirmed', 'modified', 'cooking', 'ready'].includes(order.status)) {
          return completionBtn()
        }
      }
```

🔴 **REPRODUCED, THREE NEW WAYS:** B2 rows 2, 6 and 8 each produce a device that cannot finish an
order — **and unlike today's version, which is reachable only by a truck-level `kds_mode` plus a
particular device configuration, these are reachable by tapping switches on the screen itself.**
⚠️ **On an unattended KDS, that is the difference between a misconfiguration an operator has to work
at and one they can do by accident.**

## D5. Does anything OUTSIDE the KDS depend on `activeView`?

# ✅ NO. "Not found", and it is a clean result.

**READ — `grep -rn "activeView" app components lib`, excluding the KDS page:**

```
NOT FOUND outside kds/page.tsx
```

| Consumer | Depends on `activeView`? |
|---|---|
| **Dashboard** (`app/dashboard/[token]/page.tsx`) | ❌ **NO** — renders `viewMode` `'solo'` and never passes `cardViewMode` |
| **Capacity engine** (`lib/slot-bookings.ts`) | ❌ **NO** — filters on `status` only |
| **Emails** (`deliverReadyEmail`, `formatConfirmationEmail`) | ❌ **NO** — server-side, fired by the `ready`/`confirm` handlers |
| **Reports / takings** | ❌ **NO** — the ledger and `orders` rows carry no view |
| **Printing** (`lib/printing/printWatcher.ts`) | ❌ **NO** — `DEFAULT_ELIGIBLE` is a status list |
| **`van_devices`** | ❌ **NO** — no column references it |

⚠️ **THE ONE OUTWARD LINK IS `cardViewMode` → `OrderCard`'s `viewMode` prop**, which is shared with the
dashboard — **but the dashboard passes `'solo'`, so removing `'cook'` and `'window'` would touch a
component the money screen also renders.** **INFERRED: that is the blast radius to plan for, and it is
the only one.**

---

# PART E — MIGRATION

## E1. What happens to a stored Window/Cook value

**READ — where it comes from and where it goes:**

```ts
  const [viewOverride, setViewOverride] = useState<'window' | 'cook' | null>(() => {
    if (typeof window === 'undefined') return null
    const v = localStorage.getItem(`hg_kds_view_${token}`)
    return v === 'window' || v === 'cook' ? v : null
  })
```
```ts
    localStorage.setItem(`hg_kds_view_${token}`, viewOverride)
```

🔴 **IF `activeView` IS REMOVED AND THE KEY IS LEFT UNREAD, EVERY DEVICE SILENTLY LOSES ITS ROLE** —
the value stays in `localStorage`, referenced by nothing, and the device adopts whatever the new
defaults are. ⚠️ **A cook screen would become a window screen on the next load, with prices and payment
buttons on a grill.**

**WHAT EACH VALUE SHOULD MAP TO — derived by READING what each role does today (A2):**

| Stored value | Ready | Payment | Collection | Why |
|---|---|---|---|---|
| `'cook'` | ✅ **ON** | 🔴 **OFF** | 🔴 **OFF** | Ready is its only action; it shows no prices and no completion (B2 row 4) |
| `'window'` + payments ON | per `hg_kds_readystep_<token>` | ✅ **ON** | ✅ **ON** | today's hatch (B2 rows 1 / 5) |
| `'window'` + payments OFF | ✅ **ON** | 🔴 **OFF** | 🔴 **OFF** | 🔴 **it already runs the COOK button set — identical to `'cook'`** |
| nothing stored | ✅ ON | truck default | ✅ ON | matches C3 |

⚠️ **THE THIRD ROW IS THE ONE TO NOTICE: a payments-off window device and a cook device map to the
SAME three-switch state, yet they render differently today** (prices, header shape, item grouping, the
"To make" bar). **A3's lost items are exactly that difference.**

## E2. What removing `activeView` would break

| Thing | Broken? | READ |
|---|---|---|
| `hg_kds_view_<token>` | 🔴 **orphaned — see E1** | the initialiser + writer |
| **The `?view=cook` URL param** | 🔴 **YES** — `const kdsView: KdsView = searchParams.get('view') === 'cook' ? 'cook' : 'window'` | `:76` |
| **The "Open cook screen" link** | 🔴 **YES** — it builds that URL: `href={\`/dashboard/${token}/kds?view=cook${pin ? \`&pin=${pin}\` : ''}\`}` | the header |
| `van_devices` | ✅ **NO** — no column references the view | the migration |
| The Max plan gate `cook_screen` | ⚠️ **orphaned** — `lib/plan-features.ts:284` maps `'Customer-facing display'` to it | READ |
| `OrderCard`'s `ViewMode` type | 🔴 **YES** — `export type ViewMode = 'solo' \| 'window' \| 'cook'` is shared with the dashboard | `OrderCard.tsx:14` |

⚠️ **`?view=cook` IS LINKED FROM EXACTLY ONE PLACE — the KDS's own header — and from nowhere else in the
repo.** **INFERRED: only manually saved bookmarks would break beyond that link.**

---

# PART F — THE PICTURE

## F1. 🔴 CAN THE NEW MODEL EXPRESS EVERYTHING WINDOW/COOK DOES? NO.

**Two things are lost outright and one cannot be built as specified.**

🔴 **LOST 1 — THE COOK CARD ITSELF.** Not one of Ready/Payment/Collection describes the grill screen's
**legibility**: the non-interactive two-line header, the wider padding, category-grouped items at
larger type, and the "To make" pill bar. **READ, the four branches:**
`viewMode === 'cook' ? (…non-interactive header…)`, `${viewMode === 'window' ? 'px-3 py-2' : 'px-4 py-3'}`,
`{viewMode === 'cook' ? (…grouped items…)`, and `allDayPills.length > 0 && activeView === 'window'`.

🔴 **LOST 2 — PRICE HIDING IS NOT THE PAYMENT SWITCH.** `const showPrices = viewMode !== 'cook'` does
not mention `hidePayments` (A4). Making Payment cover it changes behaviour for existing payments-off
window devices.

🔴 **CANNOT BE BUILT AS SPECIFIED — COLLECTION INDEPENDENT OF PAYMENT.** The `collected` action books
the outstanding balance server-side, so "Collection on, Payment off" takes money anyway (B2 rows 3
and 7). **A truly independent Collection switch would need a server change, not a client switch.**

⚠️ **ALSO NOT COVERED, though arguably out of scope: the `confirm` and `cooking` transitions have no
switch (D1), and `cooking` is governed by the truck-level `kds_mode`.**

## F2. What building it would involve — STORAGE, UI, LIFECYCLE separated

**STORAGE**

- ✅ **Ready and Payment already persist per device.** Only **Collection** is new.
- 🔴 **One mechanism or two must be decided (C1):** `localStorage` restores on the first frame but does
  not survive a WKWebView cold-kill; `Preferences` is durable but async.
- ⚠️ **A migration step for `hg_kds_view_<token>` (E1), or every device silently loses its role.**
- 🔴 **`van_devices` is available but costs a hand-run migration, loses first-frame restore, and has no
  row for web devices (C4).**

**UI**

- Three chips where two exist; the Window/Cook tab pair removed; the List/Grid pair kept.
- 🔴 **A replacement for the cook CARD LAYOUT (F1) — a fourth control, or a rule deriving it.**
- ⚠️ **A floor mechanism (B3), and a way to show why a combination is refused.**
- ⚠️ **The "Open cook screen" link and `?view=cook` need a destination or removal (E2).**

**LIFECYCLE**

- 🔴 **The server side of Collection**: `collected` currently books money. Separating them is a change
  to `app/api/dashboard/action/route.ts` on the money path, governed by the `completion_presses`
  ruling quoted at B1.
- ⚠️ **`OrderCard`'s `ViewMode` union is shared with the dashboard** — the only component both money
  surfaces render.
- ✅ **No status semantics change.** One column, local predicates (D4) — the existing safety property
  survives.

## F3. 🔴 EVERY RISK

**1. 🔴 ROW 8 — ALL THREE OFF, NO BUTTONS (B3).** `renderButtons` ends in `return null`. **A screen
that cannot finish an order, reachable by three taps, on a board that runs unattended.**

**2. 🔴 THE MONEY HOLE (B2 rows 3 and 7).** `collected` books the balance server-side. A device
configured "no payments, yes collection" **takes money at the hatch anyway** — and the operator has
been told this screen does not handle money. ⚠️ **On Pizzeria Gusto this is real money, and the
mismatch is between what the setting SAYS and what the server DOES.**

**3. 🔴 THREE NEW STUCK STATES (D4).** Rows 2, 6 and 8 each strand an order on that device. Today's
single stuck state needs a truck-level flag plus a device configuration; these need only a tap.

**4. 🔴 THE COOK CARD IS LOST (F1).** Prices, header shape, item grouping and the "To make" bar have no
switch. **A grill screen would become a hatch screen with the money hidden — not the same thing.**

**5. ⚠️ CAPACITY CAN FREE LATE-OR-NEVER (D2).** With Ready off the slot frees at `collected`, which is
late but safe — **unless Collection is also off on every device, in which case nothing frees it.**

**6. ⚠️ TWO PERSISTENCE MECHANISMS (C1).** Unifying them forces a choice between first-frame restore
and surviving a cold-kill. **The first-frame requirement exists because a Cook device once painted a
Window board with prices on it for one frame.**

**7. ⚠️ A FRESH TABLET GAINS A DEFAULT THAT DID NOT EXIST (C3).** Collection defaulting OFF would ship
a device that cannot finish an order.

**8. ⚠️ THE MAX PLAN GATE IS ORPHANED (A3 item 14, E2).** `cook_screen` is sold as
`'Customer-facing display'`; three free per-device switches give every plan what Max charges for.

**9. ⚠️ `OrderCard` IS SHARED WITH THE DASHBOARD (D5, F2).** Changing its `ViewMode` union touches the
component the money screen renders. **The KDS's own `activeView` reaches nothing else — that part is
clean.**

**10. ⚠️ NO SCREEN LISTS WHAT EACH DEVICE IS SET TO (C4).** Already true of Payments; three switches
across several tablets triples it, with no remote view.

## F4. No implementation is proposed and no order is recommended.

**This report states what the code does and what the model would and would not cover. The decisions —
the floor, the price rule, the storage mechanism, whether Collection justifies a server change — are
yours.**

---

# PART G — INTEGRITY

## G1. Byte scan — every file opened

Byte-level scan for NUL and every control byte below 0x09 (plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F). **Never
grep.**

```
  app/dashboard/[token]/kds/page.tsx                     122,128  offending=0  CR=0
  components/dashboard/OrderCard.tsx                      89,194  offending=0  CR=0
  app/dashboard/[token]/page.tsx                         390,423  offending=0  CR=0
  app/api/dashboard/action/route.ts                      174,041  offending=0  CR=0
  lib/slot-bookings.ts                                    24,528  offending=0  CR=0
  lib/sound-prefs.ts                                       6,676  offending=0  CR=0
  supabase/migrations/20260701_van_devices.sql             2,629  offending=0  CR=0
  docs/kds-ready-toggle-report.md                         38,559  offending=0  CR=0
  docs/kds-ready-step-report.md                           48,465  offending=0  CR=0
  components/shared/EventActionsModal.tsx                  7,492  offending=0  CR=0
  components/shared/EventFinishTimeModal.tsx              11,230  offending=0  CR=0
TOTAL OFFENDING ACROSS ALL FILES: 0
```

✅ **Zero offending bytes, zero CR.** ⚠️ **All opened READ-ONLY.**

## G2. Byte scan of this report

Separate pass, run after writing: **42,728 bytes, offending = 0, CR = 0** — no NUL, no control byte
below 0x09, no CRLF, no lone CR.

## G3. 🔴 Carrier-aware variation-selector check on this report

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 70 | 0 | 70 |
| U+1F534 LARGE RED CIRCLE | 95 | 0 | 95 |
| U+26A0 WARNING SIGN | 59 | **59** | **0** |

**Every warning sign in this report is paired; ZERO are bare — 59 of 59**, and the file's total U+FE0F
count is **59**, which accounts for all of them and leaves none attached to any other base. ⚠️ **The
two unpaired bases are internally consistent (0 of 70, 0 of 95), so neither is split across two
renderings.** ✅ **U+2500 does not appear in this report at all.**

## G4. `git status` — proof nothing changed

```
$ git status --porcelain
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/manage/[token]/page.tsx
 M components/DemoGetStarted.tsx
 M components/dashboard/OrderCard.tsx
?? components/shared/CuisinePicker.tsx
?? components/shared/EventActionsModal.tsx
?? components/shared/EventFinishTimeModal.tsx
?? docs/cuisine-field-report.md
?? docs/finish-time-dry-report.md
?? docs/kds-ready-toggle-report.md
?? docs/kds-steps-model-report.md
```

🔴 **NO FILE WAS CREATED, MODIFIED OR DELETED BY THIS TASK EXCEPT THIS REPORT.**
⚠️ **Every other entry listed was ALREADY there before this diagnosis began — four earlier tasks' work,
still uncommitted (the ready-step toggle, the cuisine dropdown, the finish-time extraction and the
shared Event actions menu). Not one was touched here.**
