# The `cooking` status — what can put a REAL order into it

**READ ONLY. Nothing changed except this file.** No fix, no proposal. `next dev` / `next build` were not
run.

# 🔴 THE ANSWER: YES, A REAL ORDER CAN REACH IT — AND GUSTO IS NOT PROTECTED BY THE PLAN GATE

**One writer, one button, and a four-part conjunction. The plan is NOT part of it.**

| | |
|---|---|
| **Writers of `status = 'cooking'`** | **ONE.** `action === 'cooking'` in the dashboard action route |
| **Human actions that reach it** | **ONE.** A "Start cooking" button, on the KDS route only |
| **Plan gate** | 🔴 **NONE ANY MORE.** `can('cook_screen')` was removed from this decision. Your note is right about trial anyway — `TRIAL_FEATURES = [...MAX_FEATURES]` |
| 🔴 **The real gate** | **`truck.kds_mode` must be TRUE.** That is the only thing standing between Gusto and this status |
| **Reachable by accident?** | ⚠️ **The SCREEN, yes — a stored per-device preference lands there. The BUTTON, no, while `kds_mode` is false** |
| **The dead end you saw** | ✅ **Real, and documented in the code.** The dashboard's own branch has no `cooking` case and returns `null` |

---

## 1 · Every writer of `status = 'cooking'` — there is exactly one

**Searches run, all unfiltered:**

1. `grep -rn "status: 'cooking'\|status:'cooking'" app lib components supabase`
2. `grep -rn "'cooking'" app lib components` — every occurrence, then each classified by hand
3. `grep -rn "update orders\|insert into orders" supabase/migrations/*.sql` (from the earlier status audit)
4. `grep -n "cooking" lib/native/orderGate.ts` — the outbox replay map

**THE ONLY WRITE. READ — `app/api/dashboard/action/route.ts`:**

```ts
    if (action === 'cooking') {
      await supabase.from('orders').update({ status: 'cooking' }).eq('order_key', orderKey).eq('truck_id', truck.id)
      return NextResponse.json({ success: true, status: 'cooking' })
    }
```

✅ **No SQL function writes it** — `place_order_atomic` takes `p_status` from the submit path, which is
only ever `'confirmed'` or `'pending'`. ✅ **No seed or demo script writes it** — `lib/seed-demo-orders.ts`
writes the literal `'confirmed'`. ⚠️ **The 40 rows you are looking at came from the hand-run SQL seed
(`docs/seed-thai-kitchen-orders.sql`), which cycles statuses including `cooking`** — that file is not part
of the application and is the explanation for `test-truck`.

⚠️ **THE OUTBOX CAN REPLAY IT, BUT CANNOT ORIGINATE IT. READ:**

```ts
const OFFLINE_STATUS_MAP: Record<string, string> = { confirm: 'confirmed', cooking: 'cooking', ready: 'ready', … }
```

**That is the optimistic client-side patch for an action already tapped.** A queued `cooking` op replays as
the same `action: 'cooking'` to the same route — **so an offline replay is the same human action arriving
late, not a new source.**

## 2 · The path back to a human — one button, and everything it needs

**READ — `components/dashboard/OrderCard.tsx`:**

```tsx
    if (viewMode === 'cook' || (viewMode === 'window' && hidePayments)) {
      if (['confirmed', 'modified'].includes(order.status)) {
        return kdsMode ? (
          <>
            <Btn label="Start cooking" colour="amber" loading={isLoading('cooking')} onClick={() => onAction('cooking', order.order_key)} />
            <Btn label="Ready"         colour="green" loading={isLoading('ready')}   onClick={() => onAction('ready', order.order_key)} />
          </>
        ) : (
          <Btn label="Ready" colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.order_key)} />
        )
      }
```

🔴 **THE USER BEHAVIOUR, STATED AS BEHAVIOUR:** *an operator opens the KITCHEN SCREEN at
`/dashboard/<token>/kds` on a device whose handover switch is OFF, on a truck with `kds_mode` on, and taps
**"Start cooking"** on an order that is `confirmed` or `modified`.* **There is no other tap anywhere in the
product that produces this status.**

⚠️ **AND NOTE THE `else`: with `kdsMode` FALSE the same screen renders only "Ready".** The button does not
exist to be pressed. **That is the whole of Gusto's protection today.**

## 3 · The plan gate — 🔴 THERE ISN'T ONE, AND YOUR TRIAL POINT IS CORRECT ANYWAY

**READ — `app/dashboard/[token]/kds/page.tsx`:**

```
  // ⚠️ `can('cook_screen')` NO LONGER GATES ANYTHING HERE — see the report. The making screen is now
  // reachable on every plan, because the control that was gated no longer exists.
```

🔴 **SO "MAX-ONLY" IS FALSE TWICE OVER.** It is not gated at all here — and even where `cook_screen` IS
consulted elsewhere, a trial truck has it:

```ts
const MAX_FEATURES: Feature[] = [ ...PRO_FEATURES, 'ticket_printing', 'multi_device_kds', 'cook_screen' ]
const TRIAL_FEATURES: Feature[] = [...MAX_FEATURES]
…
  trial: new Set(TRIAL_FEATURES),
```

✅ **CONFIRMED, NOT REFUTED: a `plan = 'trial'` truck holds every Max feature, `cook_screen` included.**
**"No live truck sees it" is never a valid argument in this codebase.**

## 4 · The FULL conjunction to reach a screen that can write `cooking`

| # | Condition | Where from |
|---|---|---|
| 1 | On the **KDS route** `/dashboard/[token]/kds` | a separate URL from the dashboard; the dashboard never renders `viewMode: 'cook'` |
| 2 | `boardMode === 'cook'` | `const boardMode: KdsView = handoverOn ? 'window' : 'cook'` |
| 3 | ⇐ `handoverOn === false` | `const handoverOn = handoverPref ?? !showPaidStep` |
| 4 | ⇐ **`handoverPref` stored `false`** (per-device), **or unset and `showPaidStep === true`** (the truck/event paid-step setting) | `readLocalPref('hg_kds_payments_<token>')`, dual-written to Preferences |
| 5 | 🔴 **`truck.kds_mode === true`** | `const kdsMode = truck?.kds_mode ?? false` |
| 6 | The order is `confirmed` or `modified` | the branch condition |

🔴 **CONDITION 5 IS THE ONLY ONE THAT IS A TRUCK-LEVEL SETTING AN OPERATOR MUST DELIBERATELY TURN ON.**
Everything above it is a URL plus a device preference.

⚠️ **CANNOT DETERMINE `kds_mode`'s live value.** The code comment says *"`kds_mode` is false on all
thirteen trucks"*, but that comment is dated and there are now more trucks. **What would settle it:**
`select id, name, kds_mode from trucks order by name;` — **and that single query answers "can Gusto reach
this today".**

## 5 · Accidentally? — ⚠️ THE SCREEN, YES. THE BUTTON, NO — WHILE `kds_mode` IS OFF.

**Can an operator who never chose a cook screen land on one? YES, three ways. READ:**

- 🔴 **A DEVICE PREFERENCE THEY SET ONCE, MONTHS AGO.** `handoverPref` is `hg_kds_payments_<token>` in
  localStorage, **dual-written to Capacitor Preferences so it survives a reinstall**. Turning the handover
  switch off on that device is enough, for ever.
- 🔴 **A MIGRATION FROM AN OLDER PREFERENCE.** `migrateFromCook` reads the retired `hg_kds_view_<token>`
  and, if it says `'cook'`, seeds `handoverPref = false`. **A device that chose "Cook" under the old
  two-mode control is landed on the cook board by design** — the comment says so: *"a device that chose
  Cook must not silently become a window screen."*
- ⚠️ **NO PREFERENCE AT ALL, plus the truck's paid step ON.** `handoverPref ?? !showPaidStep` → a truck
  with `show_paid_step` true and a fresh device lands on **cook** without anyone choosing anything.

✅ **BUT THE BUTTON STILL NEEDS `kds_mode`.** An operator on the cook board with `kds_mode` false sees
**Ready** and nothing else, and `cooking` is unreachable. ⚠️ **A DEEP LINK OR SHARED KDS URL GETS SOMEBODY
ONTO THE BOARD, NOT ONTO THE BUTTON.**

## 6 · The dead end — `cooking` is ABSENT, not excluded

**READ — the dashboard's own branch (`viewMode` solo, the ORDERS screen), in full:**

```tsx
    const readyStepEnabled = isPub || effectiveOrderReady
    if (['confirmed', 'modified'].includes(order.status)) {
      return readyStepEnabled
        ? <Btn label={`${truck?.truck_emoji || "🍕"} Ready`} … />
        : completionBtn()
    }
    if (order.status === 'ready') {
      return completionBtn()
    }
    if (order.status === 'collected') {
      return <Btn label="↩ Undo" … />
    }
    return null
```

🔴 **THERE IS NO `cooking` CASE. IT FALLS THROUGH TO `return null` — no Ready, no Mark paid, no buttons at
all.** ✅ **Exactly what you saw.** **It is an ABSENCE, not an explicit exclusion** — nobody wrote "not
cooking"; the status simply never appears.

⚠️ **AND THE CODE ALREADY KNOWS. READ, from the window branch a few lines above:**

> *"⚠️ 'cooking' IS LISTED so a truck whose cooking gate is on can still advance an order this screen (or
> a cook screen) put into it — without it, such an order would fall past the window block into the solo
> block, **which has no 'cooking' case, and reach `return null`.**"*

**The gap was identified while writing the window branch and fixed there, and not on the dashboard.**

**What an operator can do with such an order from the ORDERS SCREEN ALONE:** ⚠️ **the action row is empty,
but the CARD is not inert.** Edit, Cancel and the refund control are card-level affordances rendered
outside `renderButtons`, and the customer-name contact control is too. ⚠️ **CANNOT DETERMINE from this
read whether every one of those is enabled for `cooking`** — I read `renderButtons` in full and did not
trace each surrounding control's own gate. **What would settle it: open a `cooking` order's card on the
orders screen.** ✅ **What IS certain: no status-advancing control and no payment control.** **The order
cannot be moved forward or completed from that screen.**

## 7 · What else treats `cooking` specially

| Consumer | Treatment | Would it break if `cooking` were never written? |
|---|---|---|
| `lib/slot-bookings.ts` ×2 | `.in('status', ['pending','confirmed','modified','cooking'])` — **occupies capacity** | ❌ No. `confirmed` is in the same list |
| `lib/slot-capacity.ts` | `OCCUPYING = [… 'cooking']` | ❌ No |
| `lib/capacity-breach.ts` | `OCCUPYING_STATUSES` | ❌ No |
| `lib/buzzer.ts` | in-use statuses — a buzzer is held through cooking | ❌ No |
| `lib/printing/printWatcher.ts` | `DEFAULT_ELIGIBLE = ['confirmed','modified','cooking','ready']` | ❌ No |
| `app/api/dashboard/route.ts` | `ACTIVE_STATUSES` | ❌ No |
| `app/api/account/request-deletion/route.ts` | blocks deletion while active | ❌ No |
| `find_stranded_authorisations` | in the capture allow-list | ❌ No |
| dashboard `confirmedOrders` | grouped WITH confirmed on the board | ❌ No |
| `components/dashboard/helpers.ts` | its own amber header treatment | ❌ No |
| 🔴 **the customer status page** | **falls through to *"This order can no longer be cancelled."*, and the Payment row still says *"Pay at the truck"*** | ❌ No — **and for `cooking` both are TRUE and appropriate** |

✅ **YOUR MANUAL IS CONFIRMED FROM THE CODE: `cooking` occupies a capacity slot and frees at `ready`.**
`ready` is absent from every occupying list and present in the printing and active lists.

🔴 **AND THE ANSWER TO "WHAT WOULD BREAK": NOTHING.** Every list that contains `cooking` also contains
`confirmed`, which is where such an order would otherwise sit. **The status is additive to the board's
vocabulary, not load-bearing for capacity, printing, buzzers or money.** ⚠️ **The one thing that would
change is the operator's view: no amber header, no "🔥 Cooking…" on the cook board, and no way to tell a
started order from a waiting one.**

## 8 · Is the value constrained? — YES, at three layers

**DATABASE. READ — `supabase/migrations/20260520_kds_foundation.sql`:**

```sql
alter table orders add constraint orders_status_check
  check (status in (
    'pending','confirmed','rejected','modified','cancelled','cooking','ready','collected'
  ));
```

✅ **The database would NOT accept an arbitrary string** — eight values, `cooking` among them.

**TYPESCRIPT.** `components/dashboard/types.ts` carries `COOKING: 'cooking'` in its status map, and
`HeaderState` in `helpers.ts` includes `'cooking'`. ⚠️ **But `orders.status` is read as a plain `string`
on the row type — the constants are a vocabulary, not an enforced union.**

**ROUTE.** The action name is matched exactly (`action === 'cooking'`), so no other action can produce it.

---

## Marking summary

| Claim | Status |
|---|---|
| One writer only; the four searches | ✅ **READ** — all quoted, all searches named |
| The one button and its four conditions | ✅ **READ** |
| `can('cook_screen')` no longer gates the cook board | ✅ **READ** — the comment quoted |
| A trial truck holds every Max feature | ✅ **READ** — `TRIAL_FEATURES = [...MAX_FEATURES]` |
| 🔴 `kds_mode` is the only remaining barrier | ✅ **READ** — the `kdsMode ? … : …` ternary |
| **Whether Gusto's `kds_mode` is on** | ⚠️ **CANNOT DETERMINE.** `select id, name, kds_mode from trucks;` settles it — **this is the query that answers your real question** |
| Three accidental routes onto the cook board | ✅ **READ** — the preference, the migration, the unset default |
| The dashboard has no `cooking` case and returns `null` | ✅ **READ** — the whole branch quoted |
| Whether Edit/Cancel remain usable on such a card | ⚠️ **CANNOT DETERMINE** — I read `renderButtons`, not every surrounding control |
| Nothing breaks if `cooking` stopped being written | ⚠️ **INFERRED** — every list containing it also contains `confirmed` |
| The CHECK constraint | ✅ **READ** |
| **That the seed rows are the ones you saw** | ⚠️ **TAKEN FROM YOUR BRIEF, NOT OBSERVED.** No SQL was run |

**Surfaces, kept apart:** `components/dashboard/OrderCard.tsx` is **shared** by the dashboard and the KDS
and its branches were read per `viewMode`; `app/dashboard/[token]/kds/page.tsx` is the **KDS** and
`app/dashboard/[token]/page.tsx` the **dashboard**, each read on its own; the customer status page is a
third and was read separately.

**No instruction contradicted another, and no span of the prompt arrived garbled.**

---

# Integrity census

Byte-level pass (`open(path,'rb')`, integer comparison) run as a **separate pass after** this file was
written — never grep. Flagged set: `0x00–0x08`, `0x0B`, `0x0C`, `0x0E–0x1F`, `0x7F`. ⚠️ **This report is
the only file written**, so there is no source census — nothing else was touched. The result, the
non-ASCII census and the carrier-aware per-base variation-selector figures are in the chat reply.

⚠️ **Self-reference caveat:** this report cannot print its own byte length inside itself — writing the
number changes it. The digit-stable figure is the flagged count: **zero**.
