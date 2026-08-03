# Buzzer numbers — BUILD 1 of 2 (online only)

**Date:** 2026-08-03 · **Branch:** main @ 31247ce (working tree) · `tsc --noEmit` clean · new files lint clean.
Nothing was run beyond `tsc` and `eslint`. No `next dev`, no `next build`, no migration executed.

---

## 0. Prompt integrity — one span flagged, not repaired

**`vans.buzzer_count` — there is no table called `vans`.** The table is **`truck_vans`** (live schema,
verified today; `s.definitions['vans']` is `false`). Everything else in that section points the same way
— "van level", "`update_van_settings` already writes van-scoped numeric settings" — and
`update_van_settings` writes `truck_vans` ([app/api/manage/route.ts:983](app/api/manage/route.ts#L983)).
I read it as shorthand and built against `truck_vans`, but I am **not** silently repairing it: if you
meant a new table, stop here, because that is a different change.

Nothing else arrived garbled. One instruction pair was in genuine tension and is reported in §1.2 —
`placed_at` on the customer path versus "do not write an RPC". I resolved it without writing an RPC and
have written down exactly what that cost.

The brief was long but actionable in one pass. It did not need splitting.

---

## 1. Migrations — written, NOT run

| # | Filename | Adds |
|---|---|---|
| 1 | [supabase/migrations/20260803_orders_buzzer_number_placed_at.sql](supabase/migrations/20260803_orders_buzzer_number_placed_at.sql) | `orders.buzzer_number smallint null`, `orders.placed_at timestamptz null` |
| 2 | [supabase/migrations/20260803_buzzer_settings.sql](supabase/migrations/20260803_buzzer_settings.sql) | `truck_vans.buzzer_count smallint null`, `truck_events.buzzer_prompt boolean null` |

Additive, nullable, **no defaults, no backfill, no unique index, no CHECK constraints**. Both end with
`notify pgrst, 'reload schema'`.

### 1.1 🔴 THESE ARE DEPLOY-COUPLED — RUN BOTH BEFORE DEPLOYING

**The failure is silent, and it is the worst one this route has had.** Three of the four columns are
added to **named selects**, and PostgREST fails the *whole statement* with 42703 when a named select
references a column it cannot see:

| Column | Named select | Consequence if the migration has not run |
|---|---|---|
| `truck_events.buzzer_prompt` | [app/api/dashboard/route.ts:132](app/api/dashboard/route.ts#L132) | **HTTP 200 with `orders: []`.** `todayEvents` comes back null, every `selectedEventId` branch is skipped, the orders query never runs. An empty board is a *supported* state here, so it wears the disguise of normal behaviour. |
| `truck_vans.buzzer_count` | [app/api/dashboard/route.ts:394](app/api/dashboard/route.ts#L394) | Degrades safely — `vanErr` is caught and every consumer has `?? <default>`, so it reads as "this van has no buzzers". |
| `truck_vans.buzzer_count` | [app/api/manage/route.ts:963](app/api/manage/route.ts#L963) | Manage → Settings renders **no vans at all**. |
| `orders.buzzer_number` / `orders.placed_at` | write paths only (`orders` is read with `select('*')`) | PGRST204 on the insert/update — walk-up creation and every buzzer write fail. |

The dashboard's own comment block at
[app/api/dashboard/route.ts:139-157](app/api/dashboard/route.ts#L139-L157) records this exact incident
happening once before, from the same named select, with two columns whose migration had not been
applied. The destructure now logs — but it still returns an empty board and still does not 500 (a
deliberate ruling recorded there: *"an operator mid-service is worse off with a dead page than with a
visibly empty one"*).

**The reverse order is safe.** All four columns are nullable with no default and nothing in the running
build names them, so applying both migrations ahead of the deploy changes nothing.

### 1.2 `placed_at` — and the one instruction I could not satisfy as written

**Operator path — as specified.** Client-minted at the tap, beside the existing `order_key`:
[components/dashboard/AddOrderPanel.tsx:891-899](components/dashboard/AddOrderPanel.tsx#L891-L899)

```ts
const orderKey = newUuid()
const provisional = isOnline() ? '' : await nextProvisionalId()
const placedAt = new Date().toISOString()
```

sent as `manualOrder.placedAt`, written through unchanged by the server at
[app/api/dashboard/action/route.ts:1063](app/api/dashboard/action/route.ts#L1063).

**Customer path — ⚠️ SERVER-MINTED, AND AS A SECOND STATEMENT.** This is the tension:

> §1 says "Also set it on the customer-facing order submit path."
> The scope note says "do not write an RPC."

The customer order is inserted by `place_order_atomic`, whose INSERT column list is **fixed SQL**
([20260728_orders_total_minor_deal_savings.sql:87-112](supabase/migrations/20260728_orders_total_minor_deal_savings.sql#L87-L112)).
A jsonb key that is not named in that list is ignored — so `placed_at` cannot reach the row through
`p_order` without a `create or replace function` body change, which is writing an RPC.

I did **not** touch the RPC. Instead: a best-effort `UPDATE` immediately after the RPC returns, inside
the existing route — [app/api/orders/submit/route.ts:930-957](app/api/orders/submit/route.ts#L930-L957).

Two consequences you should know about, both commented at the site:

- **It is server-minted, not client-minted.** That asymmetry is deliberate and I think correct: `placed_at` exists because an *offline operator* order is inserted long after it was sold and only the taking device knows when. A customer order is placed online, synchronously, in that request — request time *is* commit time, and trusting a customer's phone clock would be strictly worse than reading our own.
- **It costs one extra `UPDATE` per customer order**, and therefore one extra `updated_at` bump (via `orders_set_updated_at`) on a row no client has read yet. Harmless, but not where it belongs. Phase 2 should fold it into the RPC's INSERT and delete the block.

If you would rather that were a one-line RPC body change now, say so — it is ~2 lines in a new migration
and I deliberately did not write it.

### 1.3 Triggers on `orders` — verified, nothing overwrites `placed_at`

**There is exactly ONE trigger on `orders`, and it is `BEFORE UPDATE` only:**

[supabase/migrations/20260703_orders_updated_at_trigger.sql:30-35](supabase/migrations/20260703_orders_updated_at_trigger.sql#L30-L35)

```sql
create trigger orders_set_updated_at
  before update on public.orders
  for each row
  execute function public.set_orders_updated_at();
```

whose body assigns `new.updated_at := now()` and touches nothing else
([:24-27](supabase/migrations/20260703_orders_updated_at_trigger.sql#L24-L27)).

A grep for `create trigger` / `before insert` / `after insert` across all 80 migration files returns
**this one trigger and nothing else**. There is no `BEFORE INSERT` trigger on `orders` at all, so the
operator path's client-minted `placed_at` lands exactly as sent.

⚠️ **Verification limit, stated plainly:** PostgREST exposes no `pg_trigger` metadata and this project
has no SQL-exec RPC, so this is verified against the migration folder, not against the live database.
Given that the folder and live schema are known to have diverged once already
(`trucks.default_walkup_payment`, [docs/buzzer-diagnosis-report.md](docs/buzzer-diagnosis-report.md)
§6.4), confirm with `select tgname, tgtype from pg_trigger where tgrelid = 'orders'::regclass;` when you
run the migrations.

---

## 2. The setting — van level, in Manage

**Written to `truck_vans.buzzer_count`, never to `trucks`.**

UI — [app/manage/[token]/page.tsx:8177-8228](app/manage/[token]/page.tsx#L8177-L8228), inside the
per-van "Display settings" block, directly above Kitchen capacity. Render-and-save shape copied from the
"Order-ready step" row immediately above it and from the `show_paid_step` / `takes_cash` pair: label +
explanation left, toggle right, optimistic `setVans` then the write.

- **"Do you hand out buzzers for collection?"** — toggle. On ⇒ `buzzer_count = BUZZER_DEFAULT_COUNT`, off ⇒ `null`.
- **"How many buzzers do you have?"** — a 1–20 `<select>`, nested at `pl-4` (the same child treatment "Do you take cash?" gets under the paid step). **Conditionally rendered**, not disabled-with-a-reason: there is nothing useful to say about a count when the van has no buzzers, and a disabled select showing "10" would read as a stored value that is not stored.

Both write through `updateVanSetting(van.id, 'buzzer_count', …)`
([:7205-7212](app/manage/[token]/page.tsx#L7205-L7212)), whose field union I extended.

### ⚠️ The silent-drop allowlist — extended in this change, in BOTH places

`update_van_settings` does not use an array allowlist; it uses a **destructure**, which drops unlisted
keys just as silently. I extended it and added the warning the handler did not have:

[app/api/manage/route.ts:971-991](app/api/manage/route.ts#L971-L991)

```ts
// ── 🔴 THIS DESTRUCTURE IS AN ALLOWLIST, AND IT DROPS SILENTLY. ────────────────────────────────
// A key that is not named on the line below never reaches `updates`, the UPDATE still succeeds with
// whatever remains, and the handler returns { ok: true }. The toggle animates, the toast says saved,
// and nothing was written — with no error anywhere. This is the same failure class as update_truck's
// array allowlist (:854), which carries the same warning. ADD NEW SETTINGS IN BOTH PLACES:
// here AND in get_vans' named select above, or the value writes but never reads back.
if (action === 'update_van_settings') {
  const { vanId, …, capacity_window_mins, buzzer_count } = body
  …
  // Buzzers: null = this van has no buzzers (the toggle off), 1..20 = rack size. `!== undefined` and
  // not a truthiness test, so an explicit null CLEARS rather than being skipped.
  if (buzzer_count !== undefined)       updates.buzzer_count = buzzer_count
```

**Round-trip requires BOTH ends**, which is why the report calls it out twice:

1. **Write** — the destructure above.
2. **Read** — `get_vans`' named select, [app/api/manage/route.ts:963](app/api/manage/route.ts#L963).
3. **Type** — `interface Van`, [app/manage/[token]/page.tsx:55](app/manage/[token]/page.tsx#L55).

Miss (2) and the value writes but never reads back — the toggle springs off on reload. That is on the
verification list in §7.

⚠️ The one value I had to choose rather than derive: `BUZZER_DEFAULT_COUNT = 10`
([lib/buzzer.ts:92-95](lib/buzzer.ts#L92-L95)), the rack size set when the toggle is first turned on.
The select sits immediately beneath and shows it, so it is a visible starting point, not a hidden
default anything depends on.

---

## 3. The event override — dashboard Settings

**Writes `truck_events.buzzer_prompt` only. It cannot write the van default** — the handler's only
`.update()` targets `truck_events`.

- Server: `set_buzzer_prompt_override`, [app/api/dashboard/action/route.ts:1500-1517](app/api/dashboard/action/route.ts#L1500-L1517). Same server-confirmed contract as `set_show_paid_step_override` (`select('*')`, no `.single()`, row-absent-is-still-success).
- Client: `saveBuzzerPromptOverride`, [app/dashboard/[token]/page.tsx:1247-1269](app/dashboard/[token]/page.tsx#L1247-L1269) — `markPending` guard, optimistic set, `applyEventPatch`, revert on failure.
- UI: [app/dashboard/[token]/page.tsx:2984-3003](app/dashboard/[token]/page.tsx#L2984-L3003), **"Ask for a buzzer number after each new order?"**

**Gated exactly as instructed** — `{activeEvent && vanBuzzerCount != null && (…)}`. A van with no
buzzers never sees this control.

**Resolution uses the `resolvePaidStep` idiom**, in one place only —
[lib/buzzer.ts:78-88](lib/buzzer.ts#L78-L88):

```ts
export function resolveBuzzerPrompt(van, event): ResolvedBuzzer {
  const buzzerCount = van?.buzzer_count ?? null
  if (buzzerCount == null) return { buzzerCount: null, buzzerPrompt: false }
  return { buzzerCount, buzzerPrompt: event?.buzzer_prompt ?? true }
}
```

`??` and not `||`, so an explicit override of `false` is honoured rather than re-inheriting — the bug
[lib/payments/paid-step.ts:15-16](lib/payments/paid-step.ts#L15-L16) records. Resolved **server-side**
at [app/api/dashboard/route.ts:412-416](app/api/dashboard/route.ts#L412-L416) and shipped as
`effectiveBuzzerPrompt`, so the dashboard, the KDS and Add Order cannot disagree.

⚠️ **One decision I had to make**, since the brief did not specify it: with no override set, the
default is **on when the van has buzzers**. There is no van-level "prompt" column, so owning a rack *is*
the intent to use it; the override exists to turn it off for one service. Nothing seeds the column, so
an override expires by itself — the paid-step model, not the `order_ready_override` bulk-write model.

---

## 4. The grid — one shared component

[components/dashboard/BuzzerGrid.tsx](components/dashboard/BuzzerGrid.tsx). **Three callers, one
component**: dashboard card, KDS card, Add Order (twice — during-entry and the blocking prompt).

**Colours** ([:190-196](components/dashboard/BuzzerGrid.tsx#L190-L196)):

```
available: bg-green-50 border-green-500 text-green-900   → the number only
taken:     bg-red-50   border-red-500   text-red-900     → "7" over "· #12"
```

Both families are `getHeaderStyle`'s own — `'ready'` is `bg-green-50` + `border-t-green-500`, `'late'`
is `bg-red-50` + `border-t-red-500`
([components/dashboard/helpers.ts:151](components/dashboard/helpers.ts#L151),
[:156](components/dashboard/helpers.ts#L156)). **Nothing was taken from `lib/slot-indicator.ts`**, and
the file header says why: it calls itself "SINGLE SOURCE OF TRUTH" and has no live caller.

🔴 **The number-plus-order label is not optional and is commented as such**
([:9-16](components/dashboard/BuzzerGrid.tsx#L9-L16)): ~8% of men have red-green colour deficiency, the
grid is read at speed outdoors one-handed, and green-vs-red alone would carry the entire state for a
sighted-as-designed operator and none of it otherwise. The text is primary; colour reinforces.
The target's own number additionally gets a `ring-2 ring-slate-900` — a ring, not a third colour, so the
two-state grid stays two-state.

**Both confirms are popups**, full-width buttons at `py-3.5`
([:113-142](components/dashboard/BuzzerGrid.tsx#L113-L142)), and both name every number and order:

- *"Order **#12** has buzzer **4**. Give them buzzer **7** instead?"*
- *"Buzzer **7** is with **order #15** (Sarah). Take it for **order #12**?"*

**All-taken** ([:170-174](components/dashboard/BuzzerGrid.tsx#L170-L174)): an amber line — *"All 20
buzzers are out. Tap one to take it from another order."* The grid stays **live**; taking one back is a
legitimate move.

Cancelled and rejected orders drop their buzzer automatically — they are not in
`BUZZER_IN_USE_STATUSES`, so `buildBuzzerMap` never lists them.

---

## 5. Where it appears

**a. Order card, dashboard and KDS** — chip in **header row 1**, all three viewModes.
[components/dashboard/OrderCard.tsx:285-320](components/dashboard/OrderCard.tsx#L285-L320) defines it;
[:573](components/dashboard/OrderCard.tsx#L573) (cook), [:618](components/dashboard/OrderCard.tsx#L618)
(solo), [:655-660](components/dashboard/OrderCard.tsx#L655-L660) (window). Detail in §7.1.

**b. Add-order screen** — a full-width button below the slot selector,
[components/dashboard/AddOrderPanel.tsx:1213-1231](components/dashboard/AddOrderPanel.tsx#L1213-L1231).
Neutral `🔔 Add a buzzer — optional` when unset; `🔔 Buzzer 7` in the card's white-on-slate treatment
once set. Gated on `buzzerCount` **alone**, not on the prompt setting — an event that turned the
automatic prompt off has not stopped handing out buzzers.

**c. After a new order** — blocking modal, fired in `submitManual` at
[components/dashboard/AddOrderPanel.tsx:1039-1064](components/dashboard/AddOrderPanel.tsx#L1039-L1064):

```ts
// 🔴 FIRED HERE, AFTER THE SUCCESS TOAST AND BEFORE resetManual(), AND THE POSITION IS THE POINT.
…
if (buzzerCount != null && buzzerPromptEnabled && manualBuzzer == null && data?.orderId) {
  try {
    await new Promise<void>(resolve => {
      setBuzzerPrompt({ orderKey, orderId: String(data.orderId), resolve })
    })
  } catch { /* never block the reset on the prompt's own failure */ }
}

resetManual()
```

- **After** `showToast('Order #N confirmed')` ([:995](components/dashboard/AddOrderPanel.tsx#L995)) and **before** `resetManual()` ([:1066](components/dashboard/AddOrderPanel.tsx#L1066)) — the operator still has the order on screen.
- **Blocking**: `blocking` sets `onClick={undefined}` on the backdrop and removes the ✕ ([BuzzerGrid.tsx:148-166](components/dashboard/BuzzerGrid.tsx#L148-L166)).
- **"No buzzer"** is the only non-assigning exit ([:203-212](components/dashboard/BuzzerGrid.tsx#L203-L212)). The word **"Skip" appears nowhere** — grep confirms no skip affordance exists anywhere in the app, and the reasoning is commented at both the button and the fire site.
- **Creation only.** Nothing on the edit path calls it.
- Both exits `resolve()` the awaited promise, and a *failed* write still resolves with an error toast — the order is already placed, and trapping the operator in a modal over a buzzer write would be worse than the missing number.

---

## 6. The write

**`set_buzzer`** — [app/api/dashboard/action/route.ts:1519-1560](app/api/dashboard/action/route.ts#L1519-L1560).

🔴 **Deliberately not routed through `edit`**, and the handler says why: `edit` forces `status:'modified'`
([:735](app/api/dashboard/action/route.ts#L735)), re-books production slot capacity
([:746-768](app/api/dashboard/action/route.ts#L746-L768)) and **emails the customer**
([:770-808](app/api/dashboard/action/route.ts#L770-L808)). Handing someone a pager is none of those.

The two-row effect lives in `assignBuzzer` ([lib/buzzer.ts:139-192](lib/buzzer.ts#L139-L192)) — **clear
from the other order first, then set on the target** — called from `set_buzzer` and from the walk-up
insert path ([:1101-1119](app/api/dashboard/action/route.ts#L1101-L1119)) so there is one code path, not
two. The phase-2 note is on the function
([lib/buzzer.ts:145-153](lib/buzzer.ts#L145-L153)):

> ⚠️ PHASE 2 REPLACES THIS WITH AN RPC. Today this is TWO sequential statements from the API route… The
> clear runs FIRST for that reason. Phase 2 folds both updates into a single plpgsql function so the
> pair is atomic, following the place_order_atomic pattern.

**Not routed through `gatedAction`** on either surface, and commented as such at both call sites — phase
1 is online only, no new `OutboxKind`, no outbox changes at all.

---

## 7. Report

### 7.1 Where the chip sits — and NEITHER HEADER GREW A ROW

| viewMode | Row | Placement | Row 1 contents after the change |
|---|---|---|---|
| `cook` | **1** | after `#{id}`, time pushed right with `ml-auto` | `#12` · 🔔 7 · ⟶ `17:05 · in 4m` |
| `solo` | **1** | after `#{id} · {time}`, before the `ml-auto` offset group | `#12` · `· 17:05` · 🔔 7 · ⟶ `in 4m` |
| `window` (KDS) | **1** | left cluster with `#{id}`, inside a new `flex … min-w-0` wrapper | `#12  🔔 7` ⟷ `£14.50  PAID` |

**Row 1 in every mode, and that is load-bearing** — the reasoning is in the code at
[OrderCard.tsx:285-303](components/dashboard/OrderCard.tsx#L285-L303):

> Row 1 is the IDENTITY cluster… A buzzer number IS identity — "who is this food for" — so it belongs
> beside the order number, not in row 2 with the metadata. Row 2 is also where the crowding fixes live:
> in solo the customer NAME is the only flex-1 element and absorbs all pressure (the "Dom"→"D…" fix),
> and in window mode row 2 already carries name + Contact + time + late pill at a 240px column. Adding a
> sixth shrink-0 chip there is what would force a THIRD ROW. Row 1 has slack in every mode.

**At 240px:** the chip is `text-[10px] px-1.5 py-0.5` — the paidChip's exact metrics — and window row 1
previously held only `#12` (`text-3xl`) on the left against a right cluster, the roomiest row on the
densest card. **No third row was needed in any mode.**

**Colour:** white-on-slate (`bg-white text-slate-900 border-slate-300`), from `getHeaderStyle`'s `'ok'`
family ([helpers.ts:154](components/dashboard/helpers.ts#L154)). ⚠️ Deliberately **not** the grid's
green/red: in the grid those mean *available* and *taken*, so a green chip on a card would say "this
number is free" — the exact inverse. Neutral is also the only thing legible on all six header
backgrounds. Unset renders a muted outline `🔔`; set renders `🔔 7` — the number always spelled out, so
the icon is never a second colour-only channel.

**Rendered only when `onBuzzer` is supplied**, which both surfaces gate on `vanBuzzerCount != null`
([page.tsx:2788](app/dashboard/[token]/page.tsx#L2788), [:2794](app/dashboard/[token]/page.tsx#L2794),
[kds/page.tsx:1090](app/dashboard/[token]/kds/page.tsx#L1090)). A van with no buzzers gets the
pre-existing card exactly.

### 7.2 ✅ The in-use list is its own constant

[lib/buzzer.ts:17-39](lib/buzzer.ts#L17-L39):

```ts
export const BUZZER_IN_USE_STATUSES = [
  'pending', 'confirmed', 'modified', 'cooking', 'ready',
] as const
```

with the required comment above it, in full:

> ⚠️ DO NOT GRAFT THIS ONTO THE OCCUPYING-STATUS LIST.
> `['pending', 'confirmed', 'modified', 'cooking']` appears VERBATIM in five places — lib/slot-bookings.ts:226,
> lib/slot-bookings.ts:474, lib/capacity-breach.ts:30, lib/slot-capacity.ts:39,
> components/dashboard/AddOrderPanel.tsx:845 — and it EXCLUDES 'ready' on purpose: OVEN capacity frees
> the moment cooking finishes. That is the opposite of a buzzer, which is only just becoming useful at
> 'ready'. Reusing that list would mark a buzzer free while the customer is still holding it and hand
> the same number to the next order — two people, one number, mid-rush.

**Every file that references it — five, all through `lib/buzzer.ts`, none by literal:**

| File | Reference |
|---|---|
| [lib/buzzer.ts](lib/buzzer.ts) | declares it (`:30`), the Set (`:39`), `holdsBuzzer` (`:43`), the server `.in()` (`:173`) |
| [components/dashboard/BuzzerGrid.tsx](components/dashboard/BuzzerGrid.tsx) | via `buildBuzzerMap` (`:23`, `:82`) |
| [app/api/dashboard/action/route.ts](app/api/dashboard/action/route.ts) | via `assignBuzzer` (`:23` import) |
| [app/dashboard/[token]/page.tsx](app/dashboard/[token]/page.tsx) | via `BuzzerGrid`; named in the mount comment (`:3596`) |
| [app/dashboard/[token]/kds/page.tsx](app/dashboard/[token]/kds/page.tsx) | via `BuzzerGrid` |

**The five existing copies of the occupying list are untouched.** Verified by grep: no new literal
`['pending', 'confirmed', 'modified', 'cooking']` was introduced.

### 7.3 ✅ No unique index was created

Neither migration contains `create unique index`, `unique (`, or any `add constraint`. Grep over both
files returns only the two prose blocks explaining why there deliberely is none — the DB-level
enforcement point is empty. Uniqueness is enforced in `assignBuzzer` (clear-then-set) and pre-warned in
the grid before any write.

### 7.4 ✅ `set_buzzer` changes no status and sends no email

The handler's only mutation is `assignBuzzer`, whose entire write surface is:

```ts
.update({ buzzer_number: null })      // the clear, on the other order
.update({ buzzer_number: buzzerNumber })  // the set, on the target
```

Grepping the handler body for `status`, `email`, `sendEmail`, `rebuild` returns **only HTTP status codes
in `NextResponse.json(..., { status: 4xx })`**. No `orders.status` write, no `sendEmailUnlessDemo`, no
`rebuildProductionSlotUsage`, no ledger call, no `logAction`.

The one thing that *does* change beyond `buzzer_number` is `updated_at`, via the pre-existing
`orders_set_updated_at` BEFORE UPDATE trigger — and that is **required**, not incidental: the client
merge ([lib/orders/mergeOrders.ts:87-91](lib/orders/mergeOrders.ts#L87-L91)) only accepts a read whose
`updated_at` is newer than the local copy, so without the bump the new number would be rejected by the
version guard. Noted at the write site.

### 7.5 What to verify on screen, in priority order

**Do these in order — 1 and 2 gate everything below them.**

1. **Run both migrations, then confirm the board still loads.** Open the dashboard with an event
   selected and check orders render. A blank board with orders in the DB means a named select is
   failing — check the server log for `[dashboard] EVENTS QUERY FAILED`. *This is the only failure here
   that is invisible from the UI alone.*
2. **Manage → Settings → the van card: toggle "Do you hand out buzzers", set a count, then RELOAD.**
   The toggle must still be on and the count must still be what you set. If it springs back, the
   `get_vans` named select or the `update_van_settings` destructure is missing `buzzer_count` — the
   silent-drop failure from §2, which shows a success toast either way.
3. **Take a walk-up with the event prompt ON.** The grid must appear *after* the "Order #N confirmed"
   toast and *before* the panel clears. **Tap outside it — nothing must happen.** Then press
   "No buzzer" and confirm the panel resets and the tab switches to Orders.
4. **Assign a buzzer, then give the same number to a second order.** Confirm the popup names both
   orders and the customer, then confirm the first order's chip is now empty and the second shows it.
   This is the two-row write and the phase-1 non-atomic path.
5. **KDS at a narrow window, grid layout (240px columns).** Confirm the chip sits beside the order
   number on row 1 and that no card header has three rows — check a card that has all of: long customer
   name, Contact chip, a late pill, a PAID chip, and a buzzer.
6. **Mark a buzzered order collected**, then reopen the grid: that number must be green/available again.
   Repeat for cancel and reject.
7. **All buzzers out.** Assign every number, then open the grid: the amber "All N buzzers are out" line
   must show and the cells must still be tappable.
8. **`placed_at`:** place one walk-up and one customer order, then
   `select id, created_at, placed_at from orders order by created_at desc limit 2;` — both non-null and
   within a second or two of `created_at`. Confirm older rows are still null (no backfill happened).
9. **Event override off:** turn "Ask for a buzzer number after each new order?" off, place an order —
   no prompt — then confirm the card chip and the Add Order button are **still** present and usable.
10. **A van with buzzers off:** confirm the dashboard Settings row, the card chip and the Add Order
    button are all absent, and that the card renders exactly as it did before this change.

---

## Files changed

**New (4):**
[supabase/migrations/20260803_orders_buzzer_number_placed_at.sql](supabase/migrations/20260803_orders_buzzer_number_placed_at.sql) ·
[supabase/migrations/20260803_buzzer_settings.sql](supabase/migrations/20260803_buzzer_settings.sql) ·
[lib/buzzer.ts](lib/buzzer.ts) ·
[components/dashboard/BuzzerGrid.tsx](components/dashboard/BuzzerGrid.tsx)

**Modified (10):**
[app/api/dashboard/action/route.ts](app/api/dashboard/action/route.ts) (2 new actions + `placed_at`/`buzzer_number` on the walk-up insert) ·
[app/api/dashboard/route.ts](app/api/dashboard/route.ts) (2 named selects + 2 response fields) ·
[app/api/manage/route.ts](app/api/manage/route.ts) (`get_vans` select + `update_van_settings` destructure) ·
[app/api/orders/submit/route.ts](app/api/orders/submit/route.ts) (`placed_at`) ·
[app/dashboard/[token]/page.tsx](app/dashboard/[token]/page.tsx) ·
[app/dashboard/[token]/kds/page.tsx](app/dashboard/[token]/kds/page.tsx) ·
[app/manage/[token]/page.tsx](app/manage/[token]/page.tsx) ·
[components/dashboard/AddOrderPanel.tsx](components/dashboard/AddOrderPanel.tsx) ·
[components/dashboard/OrderCard.tsx](components/dashboard/OrderCard.tsx) ·
[components/dashboard/types.ts](components/dashboard/types.ts)

**Untouched, as scoped:** `lib/native/outbox.ts`, `lib/native/orderGate.ts`, `OutboxKind`, every existing
RPC, `lib/orders/mergeOrders.ts`, and the five existing copies of the occupying-status list.
