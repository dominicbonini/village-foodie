# KDS two step switches — STAGE 1 COMPLETE, ALL SIX PREMISES HOLD. STAGE 2 STOPPED ON A CONTRADICTION.

**Stage 1 was completed in full. Every premise P1–P6 is CONFIRMED.** ✅ **The corrected mapping in this
brief is right where the previous one was wrong.**

🔴 **STAGE 2 WAS NOT STARTED, AND NOT BECAUSE OF A PREMISE.** Two Stage 2 instructions cannot both be
satisfied: **the design names THREE controls and permits exactly TWO storage keys, forbidding a
third.** Per the brief's own closing rule — *"if any instruction contradicts another, STOP and ask
rather than choosing"* — I am asking. **The question is at the end, and it is a single decision.**

**No file was edited, created or deleted except this report.** Nothing committed, staged, reverted,
stashed or cleaned. No build, no `next dev`, no `next build`, no `cap sync`, no deploy, no SQL, no
migration. **Nothing under `app/api` or `lib/payments` was touched. The `cooking` status was not
altered in any way.**

**No span of the prompt arrived garbled.**

⚠️ **`docs/kds-step-switches-report.md` was read first, as instructed.** It holds the full quoted
`renderButtons` and `completionBtn`; this report does not re-quote them at length, and says so where it
relies on them.

---

# PART 1 — WHAT IS `kdsMode`?

## 1a. The full prop chain, every producer, back to source

# ✅ `kdsMode` IS `trucks.kds_mode`. PER-TRUCK, ON THE `trucks` TABLE.

**READ — the DB column, `supabase/migrations/20260520_kds_foundation.sql`:**

```sql
-- Add KDS settings to trucks
alter table trucks
  add column if not exists kds_mode boolean default false not null,
  add column if not exists crew_mode text default 'solo' not null;
```

🔴 **`alter table trucks` — PER-TRUCK, not per-van. Default `false`, `not null`.**

**THE CHAIN — every producer, READ:**

| Hop | Code | Surface |
|---|---|---|
| DB | `trucks.kds_mode boolean default false not null` | — |
| API | `kds_mode: truck.kds_mode ?? false` *(`app/api/dashboard/route.ts`)* | both |
| KDS local | `const kdsMode = truck?.kds_mode ?? false` | KDS |
| KDS → card | `kdsMode={kdsMode}` | KDS |
| Dashboard → card | `kdsMode={truck?.kds_mode??false}` ×2 (pending + confirmed grids) | dashboard |
| Card prop | `kdsMode = false,` / `kdsMode?: boolean` | `OrderCard` |

⚠️ **THERE IS NO INTERMEDIATE.** The dashboard inlines `truck?.kds_mode??false` at both call sites
rather than binding a local; the KDS binds one. **Both resolve the same column.**

## 1b. 🔴 IS `kdsMode` `truck_vans.show_cooking_step`? **NO. THEY ARE DIFFERENT COLUMNS ON DIFFERENT TABLES.**

**THREE DISTINCT FIELDS EXIST. READ:**

| Field | Table | Scope | Type |
|---|---|---|---|
| **`kds_mode`** | 🔴 **`trucks`** | **per-TRUCK** | `boolean default false not null` |
| `crew_mode` | 🔴 **`trucks`** | per-TRUCK | `text default 'solo' not null`, `check (crew_mode in ('solo','full'))` |
| **`show_cooking_step`** | 🔴 **`truck_vans`** | **per-VAN** | boolean *(no migration found — see below)* |

**READ — `crew_mode`'s constraint, same migration:**

```sql
alter table trucks add constraint trucks_crew_mode_check
  check (crew_mode in ('solo', 'full'));
```

**READ — `show_cooking_step` is read off the VAN, `app/api/dashboard/route.ts`:**

```ts
        .select('kitchen_capacity, capacity_window_mins, name, auto_pause_on_offline, show_cooking_step, order_ready_enabled, buzzer_count')
```
```ts
      vanShowCookingStep = van?.show_cooking_step ?? false
```

**and written per-van, `app/api/manage/route.ts`:**

```ts
    if (show_cooking_step !== undefined)  updates.show_cooking_step = show_cooking_step
```

⚠️ **"Not found" is a result: no migration in `supabase/migrations/` creates `show_cooking_step`.** A
repo-wide `*.sql` scan returns nothing. **INFERRED: it predates the migrations directory. Its column
type is therefore not readable from this repository.**

## 🔴 WHICH DRIVES WHICH — AND `showCookingStep` DRIVES NOTHING AT ALL TODAY

| Field | What it drives today |
|---|---|
| **`kds_mode`** | ✅ **BOTH live behaviours** — 1c below |
| **`show_cooking_step`** | 🔴 **NOTHING. DORMANT.** |
| `crew_mode` | the "Open cook screen" link only (`truck.crew_mode === 'full'`) |

🔴 **`showCookingStep` IS A DEAD PROP.** It is fetched, held in state, and passed to the card —
`showCookingStep={showCookingStep}` — **and `OrderCard` never reads it in any branch.** Its only
appearances there are the declaration, the default, and two comments:

```
        // from show_cooking_step (was `kdsMode && showCookingStep`). To re-add the "Show cooking step"
        // toggle later, restore `&& showCookingStep` here. Cook mode shows Start cooking → Ready.
```

**Manage records the same, deliberately — READ:**

```
                  de-coupled from show_cooking_step). The show_cooking_step column, the update_van_settings
                  handler for it, and the Van.show_cooking_step field are KEPT DORMANT so re-adding this
```

✅ **So the answer to 1b is unambiguous: the cooking gate is `trucks.kds_mode`, per-truck, and the
per-van `show_cooking_step` that shares its vocabulary is inert.**

## 1c. Every UI consequence of `kdsMode`, classified

**READ — there are exactly TWO, both in `OrderCard`. The KDS itself uses `kdsMode` only to pass it on
(`grep` returns the binding and the prop, nothing else).**

### CONSEQUENCE 1 — in the COOK branch → **"PRODUCES THE COOKING STATUS"**

```tsx
        return kdsMode ? (
          <>
            <Btn label="Start cooking" colour="amber" loading={isLoading('cooking')} onClick={() => onAction('cooking', order.order_key)} />
            <Btn label="Ready"         colour="green" loading={isLoading('ready')}   onClick={() => onAction('ready', order.order_key)} />
          </>
        ) : (
          <Btn label="Ready" colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.order_key)} />
        )
```

✅ **CLASSIFICATION: produces the cooking status.** `kdsMode` true adds the `Start cooking` button —
the only control anywhere that fires `onAction('cooking', …)`.

⚠️ **AND A SECOND, DEPENDENT ONE IN THE SAME BRANCH:**

```tsx
      if (order.status === 'cooking') {
        return (
          <>
            <span className="flex-1 text-amber-700 font-bold text-sm flex items-center">🔥 Cooking…</span>
            <Btn label="Ready" colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.order_key)} />
          </>
        )
      }
```

**Not gated on `kdsMode` itself, but only reachable because `kdsMode` produced the status.**

### CONSEQUENCE 2 — in the WINDOW branch → **"MAKES THE WINDOW DEVICE WAIT"**

```tsx
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
```

✅ **CLASSIFICATION: makes the window device WAIT for a ready.** With `kdsMode` true the window screen
cannot complete a `confirmed`/`modified`/`cooking` order — it renders a chip and a **disabled**
button until some other surface writes `'ready'`.

🔴 **ONE COLUMN, TWO OPPOSITE JOBS, ON TWO DIFFERENT SCREENS.** **INFERRED, and it is the finding this
part was asked for: `trucks.kds_mode` is not "the cooking step" — it is simultaneously "the cook screen
may produce `cooking`" and "the window screen must wait". A truck cannot have one without the other.**

## 1d. Live values for pizzeria-gusto and tikka-tonic

# 🔴 NOT READABLE FROM SOURCE OR CONFIG. Database-only.

**"Not found" is the result:** a repo-wide scan of `*.ts`, `*.tsx`, `*.json` and `*.sql` for `kds_mode`
alongside `gusto`, `tikka`, `seed` or `provision` returns **nothing**, and `lib/provision-truck.ts`
sets neither `kds_mode` nor `crew_mode` — **so new trucks take the column default, `false`.**

**THE EXACT QUERY. NOT RUN:**

```sql
-- READ-ONLY. Live values of the three fields Part 1 distinguishes.
select t.slug,
       t.name,
       t.kds_mode,
       t.crew_mode,
       v.name  as van_name,
       v.show_cooking_step,
       v.order_ready_enabled,
       v.active
from trucks t
left join truck_vans v on v.truck_id = t.id
where t.slug in ('pizzeria-gusto', 'tikka-tonic')
order by t.slug, v.name;
```

⚠️ **`kds_mode` is the value that decides which of the four mapping rows each truck's window devices
are actually in, so this query is the one that turns the mapping from a table into a prediction.**

---

# PART 2 — THE `cooking` STATUS

🔴 **FACT-FINDING ONLY. Nothing about `cooking` was merged, removed, renamed or altered.**

## Every WRITER — exactly one

**READ — `app/api/dashboard/action/route.ts`, the handler IN FULL. It is three lines:**

```ts
    if (action === 'cooking') {
      await supabase.from('orders').update({ status: 'cooking' }).eq('order_key', orderKey).eq('truck_id', truck.id)
      return NextResponse.json({ success: true, status: 'cooking' })
    }
```

**And exactly one UI producer of the action — READ:**

```tsx
            <Btn label="Start cooking" colour="amber" loading={isLoading('cooking')} onClick={() => onAction('cooking', order.order_key)} />
```

⚠️ **Plus the offline replay map, which carries the same action rather than originating it:**

```ts
const OFFLINE_STATUS_MAP: Record<string, string> = { confirm: 'confirmed', cooking: 'cooking', ready: 'ready', collected: 'collected', … }
```

## Every READER, and what each does

| Reader | What it does |
|---|---|
| `lib/slot-bookings.ts` ×2 — `.in('status', ['pending','confirmed','modified','cooking'])` | 🔴 **CAPACITY — `cooking` OCCUPIES a production slot** |
| `lib/slot-capacity.ts` — `const OCCUPYING = ['pending','confirmed','modified','cooking']` | **CAPACITY** — the offline occupancy projection |
| `lib/capacity-breach.ts` — `const OCCUPYING_STATUSES = new Set([… 'cooking'])` | **CAPACITY** — breach detection |
| `components/dashboard/helpers.ts` — `case 'cooking': return 'bg-amber-50 …'` | **URGENCY COLOUR** — the amber header |
| `OrderCard.tsx` — `: order.status === 'cooking' ? 'cooking' as const` | **URGENCY COLOUR** — feeds `getHeaderStyle` |
| `lib/printing/printWatcher.ts` — `DEFAULT_ELIGIBLE = ['confirmed','modified','cooking','ready']` | **PRINTING** — eligible for a ticket |
| `app/api/dashboard/route.ts` — `ACTIVE_STATUSES` | **BOARD** — fetched to both surfaces |
| `kds/page.tsx` — `const onScreen = orders.filter(o => [… 'cooking', 'ready'].includes(o.status)).length` | **BOARD** — an on-screen count |
| `page.tsx` — `confirmedOrders=eventOrders.filter(o=>['confirmed','modified','cooking','ready']…)` | **BOARD** — the dashboard bucket |
| `lib/buzzer.ts` — `'cooking',` | **BUZZERS** — an in-use status |
| `20260804_assign_buzzer_atomic.sql` — `v_in_use text[] := array[…'cooking','ready']` | **BUZZERS** — server-side |
| the two stranded-authorisation migrations — `o.status in (… 'cooking', …)` | **PAYMENTS SWEEP** |
| `app/api/account/request-deletion/route.ts` — `.in('status', [… 'cooking','ready'])` | **ACCOUNT DELETION** — blocks on live orders |
| `lib/native/orderGate.ts` — `STATUS_REPLAY_EXPECTED_FROM` | **OFFLINE REPLAY** guard |
| `components/dashboard/types.ts` — `COOKING: 'cooking'` | the enum |

🔴 **NO READER SENDS AN EMAIL. NO REPORT SURFACE APPEARS IN THIS LIST.**

## 🔴 DOES `'ready'` SEND A CUSTOMER EMAIL WHERE `'cooking'` DOES NOT? **YES.**

**READ — the `ready` handler IN FULL, for direct comparison with the three-line `cooking` handler
above:**

```ts
    if (action === 'ready') {
      const { data: order } = await supabase.from('orders').select('*').eq('order_key', orderKey).eq('truck_id', truck.id).single()
      if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
      await supabase.from('orders').update({ status: 'ready' }).eq('order_key', orderKey).eq('truck_id', truck.id)
      // RELEASE kitchen-capacity occupancy at ready (done cooking). buildUnitsFromOrders no longer counts a
      // 'ready' order, so the rebuild frees its production slot …
      if (order.event_date) await rebuildProductionSlotUsage(supabase, truck.id, order.event_date)
      if (!body.defer_email) {
        await deliverReadyEmail(order, truck)
      }
      return NextResponse.json({ success: true, status: 'ready' })
    }
```

✅ **`deliverReadyEmail` has exactly two call sites, both in the `ready` path** (`action === 'ready'`
and `action === 'send_ready_email'`). **Neither is reachable from `cooking`.**

## 🔴 IS THERE ANY SIDE EFFECT OF `'ready'` THAT `'cooking'` ALSO HAS? **NO — AND ON CAPACITY THEY ARE OPPOSITE.**

| Side effect of `ready` | Does `cooking` share it? |
|---|---|
| Status write | ⚠️ **Both write a status — that is the only thing in common, and it is the action itself, not a side effect** |
| `rebuildProductionSlotUsage` — **releases** the slot | 🔴 **NO. `cooking` calls nothing** |
| Capacity membership | 🔴 **OPPOSITE.** `cooking` is IN `OCCUPYING`; `ready` is OUT of it |
| `deliverReadyEmail` | 🔴 **NO** |

✅ **STATED PLAINLY: the `cooking` handler has NO side effects at all beyond the status write. `ready`
has two — a capacity release and a customer email — and neither is shared.**

---

# PART 3 — THE PREMISES

## ✅ P1 — CONFIRMED (re-verified independently)

**READ:** a scan of the entire `if (viewMode === 'window') { … }` block for `onAction('ready'` and
`label="Ready"` returns **zero matches**. All four `Ready` buttons in the file sit in the COOK branch
(×3) or the SOLO branch (×1).

## ✅ P2 — CONFIRMED

**READ — the solo branch:**

```tsx
    const readyStepEnabled = isPub || effectiveOrderReady
    if (['confirmed', 'modified'].includes(order.status)) {
      return readyStepEnabled
        ? <Btn label={`${truck?.truck_emoji || "🍕"} Ready`} colour="green" loading={isLoading('ready')} onClick={() => onAction('ready', order.order_key)} />
        : completionBtn()
    }
    if (order.status === 'ready') {
      return completionBtn()
    }
```

✅ **The "Ready, then completion" sequence already ships on the dashboard.** ⚠️ **One detail the new
combination must decide: the solo Ready button carries `${truck?.truck_emoji || "🍕"}`; the cook
branch's does not.**

## ✅ P3 — CONFIRMED

**READ:** `const hidePayments = showPaidStep && showPaymentsPref !== true`. With `showPaidStep` false
the `&&` short-circuits to false **whatever the preference holds**, so the cook branch's second
disjunct is unreachable and **the window branch always runs.**

## ✅ P4 — CONFIRMED

**READ:** `if (viewMode === 'cook' || (viewMode === 'window' && hidePayments)) {` — a payments-off
window device enters the **cook** branch and renders the cook button set.

## ✅ P5 — CONFIRMED, with the exact decomposition stated

**READ:**

```tsx
      if (readyStepOff) {
        if (['confirmed', 'modified', 'cooking', 'ready'].includes(order.status)) {
          return completionBtn()
        }
      }
```

**The full truth table, derived by reading the branch order:**

| `kdsMode` | status | WITHOUT `readyStepOff` | WITH `readyStepOff` | Changed? |
|---|---|---|---|---|
| true | `confirmed`/`modified` | `⏳ Waiting` + disabled | `completionBtn()` | ✅ **yes** |
| true | `cooking` | `🔥 Cooking…` + disabled | `completionBtn()` | ✅ **yes** |
| true | `ready` | `completionBtn()` | `completionBtn()` | no |
| false | `confirmed`/`modified` | `completionBtn()` | `completionBtn()` | no |
| false | **`cooking`** | 🔴 **`null`** (falls through to solo) | `completionBtn()` | ✅ **yes** |
| false | `ready` | `completionBtn()` | `completionBtn()` | no |

✅ **Both halves of P5 hold: the Waiting/disabled substitution is `kdsMode`-true only, AND it
additionally admits `'cooking'` — which is the one row that also changes at `kdsMode` false.** ⚠️ **A
stricter reading of "ONLY when `kdsMode` is true" would fail on that row; the premise's own trailing
clause names it, so I record it as confirmed with the table rather than as a refutation.**

## ✅ P6 — CONFIRMED

**READ — the KDS:**

```ts
      const result = await gatedAction({
        url: '/api/dashboard/action',
        body: { token, pin, action, order_key: orderKey, ...(action === 'ready' ? { defer_email: true } : {}) },
        kind: 'status', order_key: orderKey, online: isOnline(), expectedFrom: STATUS_REPLAY_EXPECTED_FROM,
      })
```

**READ — the dashboard:**

```ts
      const result=await gatedAction({url:'/api/dashboard/action',body:{token,pin,action,order_key:orderKey,...(action==='ready'?{defer_email:true}:{})},kind:'status',order_key:orderKey,online:isOnline(),expectedFrom:STATUS_REPLAY_EXPECTED_FROM})
```

✅ **Same URL, same body shape, same gate, same `expectedFrom`.** ✅ **And no server branch on the
surface:** a scan of `app/api/dashboard/action/route.ts` for `isKds`, `from_kds` and `'kds'` returns
**nothing**.

# ✅ ALL SIX PREMISES HOLD. THE STOP BELOW IS NOT A PREMISE FAILURE.

---

# ✅ THE CORRECTED MAPPING IS RIGHT — VERIFIED ROW BY ROW

**Each row derived by reading the branch order, not by trusting the brief:**

| Row | Enters which branch | Buttons today | Brief says | Verdict |
|---|---|---|---|---|
| **Cook view** | cook (`viewMode === 'cook'`) | `Start cooking`+`Ready` / `Ready` | READY on, HANDOVER off | ✅ **correct** |
| **Window + payments OFF** | cook (`window && hidePayments`) | same as above | READY on, HANDOVER off | ✅ **correct** |
| **Window + payments ON** | window | `⏳ Waiting`+disabled / `completionBtn()` — 🔴 **no Ready** | READY off, HANDOVER on | ✅ **correct** |
| **Window + payments ON + no-wait chip** | window, `readyStepOff` | `completionBtn()` from `confirmed` | READY off, HANDOVER on, wait suppressed | ✅ **correct** |

✅ **The previous brief's "today's window device is READY on, HANDOVER on" was wrong; this brief's
"READY off" is right.**

⚠️ **ONE ROW IS CONDITIONAL AND THE BRIEF ALREADY ALLOWS FOR IT:** rows 1 and 2 render `Ready` alone
when `kds_mode` is **false** and `Start cooking` + `Ready` when it is **true**, exactly as
*"whatever `kdsMode` makes it"* states. **1d's query is what tells you which.**

---

# 🔴 STAGE 2 — STOPPED. THE CONTRADICTION, PRECISELY

**Stage 2 names THREE independent controls:**

1. **READY** — *"does this screen mark orders ready?"*, label *"Marks ready"*.
2. **HANDOVER** — *"does this screen take payment and hand over?"*, label *"Takes payment"*.
3. **THE WAIT CHIP** — *"RENAME THE NO-WAIT CHIP … rename it to say what it does. Proposed copy …
   'Waits for kitchen' / 'Doesn't wait'."*

**And it permits exactly TWO storage keys:**

> **KEYS.** Reuse `hg_kds_readystep_<token>` and `hg_kds_payments_<token>`. **Invent no new keys.**

**The assignment is forced, and it runs out:**

| Control | Key | |
|---|---|---|
| HANDOVER | `hg_kds_payments_` | 🔴 **FIXED by the brief** — *"The payments key's meaning widens to name the handover step"* |
| The wait chip | `hg_kds_readystep_` | 🔴 **FIXED by the brief** — it is the existing chip being renamed, and it already stores exactly that |
| **READY** | 🔴 **NOTHING LEFT** | |

## 🔴 WHY READY CANNOT BE DERIVED INSTEAD OF STORED

**In all four mapping rows, READY is the exact complement of HANDOVER** — so a derived
`READY = !HANDOVER` reproduces today perfectly. **But the brief also requires a combination that
breaks that identity:**

> `READY on, HANDOVER on` -> **NEW, and reachable only by deliberately turning READY on.**

✅ **A derived READY can never be on while HANDOVER is on. Reaching that combination requires READY to
have its own stored value.**

## 🔴 WHY THE WAIT CHIP CANNOT ABSORB READY

**Invariant A** — *"With READY on, the Waiting/disabled treatment must not render"* — makes READY-on
imply wait-suppressed. **So one might collapse the two into `hg_kds_readystep_`.** ⚠️ **Mapping row 4
forbids it:**

> `Window + payments ON + no-wait chip` -> **READY off**, HANDOVER on, wait suppressed

**That row is wait-suppressed with READY OFF.** ✅ **So the wait chip and READY must be independently
settable, and each needs its own storage.**

## 🔴 AND `hg_kds_readystep_` CANNOT SERVE BOTH

Today it stores one boolean whose meaning is *"this screen does not wait"*. **Row 4 needs that meaning
preserved (wait suppressed, READY off); the new combination needs a different meaning (READY on).
One boolean cannot carry both without a third state, which is a new key by another name.**

# THE QUESTION, AS ONE DECISION

**Which of these do you want? I am not choosing.**

- **(a) Permit a third key** for READY, keeping all three controls and the mapping exactly as written.
  ⚠️ This contradicts *"Invent no new keys"* only.
- **(b) Drop the wait chip** and let `hg_kds_readystep_` become READY, with Invariant A supplying the
  wait suppression. ⚠️ **This makes mapping row 4 unreachable** — a device cannot be
  wait-suppressed with READY off — **so an existing no-wait device would change behaviour, breaking
  the acceptance test.**
- **(c) Drop the "READY on, HANDOVER on" combination**, deriving `READY = !HANDOVER`. ⚠️ Two keys
  suffice and every existing device is reproduced exactly, **but the new third configuration does not
  exist**, which is the thing the brief is for.

⚠️ **I have not written a line of Stage 2 code, so any of the three is still open at zero cost.**

## What I did NOT do, explicitly

- 🔴 No file under `app/api` or `lib/payments` opened for edit — **Invariant F respected.**
- 🔴 **The `cooking` status is untouched** — **Invariant B respected**; Part 2 is fact-finding only.
- 🔴 `showPrices`, `partPaidRow`, the cook header, padding, grouping and type size **untouched** —
  **Invariant C.**
- 🔴 `completionBtn` **untouched** — **Invariant D.**
- 🔴 `hg_kds_view_` and the Window/Cook control **untouched** — **Invariant E.**
- 🔴 The window + gate-off + `'cooking'` fall-through to `return null` **left exactly as it is**, as
  instructed.

---

# VERIFICATION

🔴 **NOTHING WAS VERIFIED BY EXECUTION OF THE FEATURE, BECAUSE NO FEATURE CODE EXISTS. `tsc` was not
run either — there was no change to typecheck, and a clean typecheck would not be verification.**

| Item | Method |
|---|---|
| Every quote in Parts 1–3 | 🔴 **SOURCE READ ONLY** |
| "No `Ready` in the window branch" (P1) | ✅ **EXECUTED** — `awk` span extraction + pattern scan, zero matches |
| `kdsMode` producer set (1a) | ✅ **EXECUTED** — repo-wide `kdsMode=` scan, three producers |
| `show_cooking_step` has no migration (1b) | ✅ **EXECUTED** — repo-wide `*.sql` scan, zero matches |
| `showCookingStep` unread in `OrderCard` (1b) | ✅ **EXECUTED** — scan returns declaration, default, two comments |
| Writers/readers of `'cooking'` (Part 2) | ✅ **EXECUTED** — repo-wide scans |
| `deliverReadyEmail` call sites (Part 2) | ✅ **EXECUTED** — two, both in the `ready` path |
| P3's short-circuit | 🔴 **SOURCE READ ONLY** — reasoning about `&&`, not observed |
| P5's truth table | 🔴 **SOURCE READ ONLY** — derived from branch order, **not run** |
| Live `kds_mode` for either truck (1d) | 🔴 **NOT DETERMINED** — database-only; the query is quoted, unrun |
| Each combination renders its stated button set | 🔴 **NOT VERIFIED — not built** |
| All four mapping rows render identically to today | 🔴 **NOT VERIFIED BY EXECUTION** — derived by reading branch order only |
| Both-off unreachable through the UI | 🔴 **NOT VERIFIED — not built** |
| With READY on, the Waiting treatment does not render | 🔴 **NOT VERIFIED — not built** |
| First paint after a cleared localStorage | 🔴 **NOT VERIFIED — not built** |

---

# INTEGRITY

## Byte-level scan — NUL and every control byte below 0x09, plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F

**Byte-level tool, never grep. Every file opened, plus this report in a SEPARATE pass.**

```
  components/dashboard/OrderCard.tsx                     89,194  offending=0  CR=0
  app/dashboard/[token]/kds/page.tsx                    122,095  offending=0  CR=0
  app/dashboard/[token]/page.tsx                        391,343  offending=0  CR=0
  app/api/dashboard/action/route.ts                     174,041  offending=0  CR=0
  app/api/dashboard/route.ts                             49,584  offending=0  CR=0
  app/api/manage/route.ts                                78,884  offending=0  CR=0
  app/manage/[token]/page.tsx                           785,187  offending=0  CR=0
  lib/payments/paid-step.ts                               7,971  offending=0  CR=0
  lib/slot-bookings.ts                                   24,528  offending=0  CR=0
  supabase/migrations/20260520_kds_foundation.sql         1,401  offending=0  CR=0
  docs/kds-step-switches-report.md                       25,421  offending=0  CR=0
  docs/kds-two-switches-report.md   (SEPARATE PASS)       29,189  offending=0  CR=0
TOTAL OFFENDING ACROSS ALL FILES: 0
```

⚠️ **Every source file above was opened READ-ONLY. None was written.**

## 🔴 Carrier-aware variation-selector check on this report

**Per emoji-presentation base: how many occurrences are FOLLOWED by U+FE0F. A raw total is not
reported, because it cannot distinguish a bare warning sign from a paired selector on another base.**

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 53 | 0 | 53 |
| U+1F534 LARGE RED CIRCLE | 48 | 0 | 48 |
| U+26A0 WARNING SIGN | 17 | **17** | **0** |
| U+1F525 FIRE | 3 | 0 | 3 |
| U+23F3 HOURGLASS WITH FLOWING SAND | 3 | 0 | 3 |

**Every warning sign is paired; ZERO are bare — 17 of 17.** The file's total U+FE0F count is **17**,
which accounts for all of them and leaves none attached to any other base. ⚠️ **The four unpaired
bases are each internally consistent (0 of 53, 0 of 48, 0 of 3, 0 of 3), so no base is split across
two renderings** — the fire and hourglass glyphs are quoted verbatim from `OrderCard` and are bare
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
?? docs/kds-two-switches-report.md
```

🔴 **NOTHING WAS CHANGED BY THIS TASK EXCEPT `docs/kds-two-switches-report.md`.**

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
| `?? docs/kds-step-switches-report.md` | ✅ pre-existing |
| `?? docs/kds-steps-model-report.md` | ✅ pre-existing |
| `?? docs/kds-toggles-review-report.md` | ✅ pre-existing |
| 🔴 `?? docs/kds-two-switches-report.md` | 🔴 **THIS TASK — the only new entry** |
