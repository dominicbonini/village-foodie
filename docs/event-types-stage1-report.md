# Event types — stages 1 + 2

**Branch:** `event-types` (confirmed with `git branch --show-current` before every commit). Cut from
`main`; `main` and `schedule-graphics` untouched. **Nothing deployed.**
**No SQL was run.** One migration is written and is reproduced below for you to run by hand.
**Village Spice only.** Pizzeria Gusto was not touched, read or used for any check. No keys printed.

**Nothing in the brief arrived garbled, and no instruction contradicted another**, so I have not
stopped. The one place the brief named a reader that does not exist is recorded in §3.2 as a finding,
not treated as a contradiction.

**Shown in this build: the SERVICE section only.** No Prices, Items, Stock, Deals or Private tags.

---

## 1 · WHAT THIS DOES, IN ONE PARAGRAPH

A truck can create named event types and pick one when adding an event. A type supplies four service
settings for that event — the buzzer prompt, take cash, the "mark ready" step and the customer
collection grid — **unless the truck has changed that setting on that event by hand**, which always
wins. Nothing is ever copied onto an event: `truck_events.event_type_id` is the whole state, every
value is resolved at read time, and switching an event's type (including a live one) is one column
write. A truck who never creates a type is byte-identical to before, proved against the pre-build tree
rather than asserted.

---

## 2 · THE MIGRATION

`supabase/migrations/20261009_event_types.sql`. Idempotent, additive only. **NOT RUN.**

```sql
set lock_timeout = '3s';

begin;

create table if not exists public.event_types (
  id uuid primary key default gen_random_uuid(),
  truck_id text not null references public.trucks(id) on delete cascade,
  name text not null,
  sort_order smallint not null default 0,
  buzzer_prompt boolean,
  takes_cash boolean,
  order_ready boolean,
  collection_interval_mins integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_types_name_not_blank check (length(btrim(name)) > 0)
);

create unique index if not exists event_types_truck_name_uidx
  on public.event_types (truck_id, lower(name));

create index if not exists event_types_truck_idx
  on public.event_types (truck_id, sort_order);

comment on table public.event_types is
  'A named preset a truck picks when adding an event. Stages 1-2 carry SERVICE settings only (buzzer prompt, take cash, the mark-ready step, the customer collection grid); prices, items, stock, deals and private visibility are later stages and are NOT in this table yet. Every column is nullable and NULL means "same as Standard" — resolved at READ time by lib/event-types/resolve.ts as `event override ?? type ?? van/truck default`. Nothing is ever copied onto an event: truck_events.event_type_id is the whole state.';

alter table public.truck_events
  add column if not exists event_type_id uuid references public.event_types(id) on delete set null;

create index if not exists truck_events_event_type_idx
  on public.truck_events (event_type_id)
  where event_type_id is not null;

comment on column public.truck_events.event_type_id is
  'Optional event type for this event. NULL = Standard, which is the state of every row before 20261009 and of every event created by the dashboard draft, the inbound/scraper bridge and demo provisioning. When set, lib/event-types/resolve.ts supplies this event''s service settings from the type UNLESS the truck has changed that setting on this event by hand, which always wins. Nullable with NO DEFAULT deliberately: a NOT NULL DEFAULT could not express "no type". on delete set null so deleting a type never deletes events.';

alter table public.truck_events
  add column if not exists order_ready_source text;

alter table public.truck_events
  drop constraint if exists truck_events_order_ready_source_check;

alter table public.truck_events
  add constraint truck_events_order_ready_source_check
  check (order_ready_source is null or order_ready_source in ('seed', 'truck'));

comment on column public.truck_events.order_ready_source is
  'Who set truck_events.order_ready_override. ''seed'' = a creation path or the Settings master switch wrote it, so it is not a choice about THIS event and an event type outranks it. ''truck'' = the dashboard''s per-event toggle wrote it, so it outranks the type. NULL = not recorded (every row before 20261009). READ ONLY WHEN THE EVENT HAS A TYPE: with no type the resolver uses `order_ready_override ?? van default` exactly as before, so untyped events are unaffected. Exists because order_ready_override is seeded at creation and bulk-written when the van default changes, so without it a type could never win for the mark-ready step. See lib/event-types/resolve.ts and docs/event-types-stage1-report.md.';

alter table public.event_types enable row level security;
drop policy if exists "service_role only" on public.event_types;
create policy "service_role only" on public.event_types
  for all to service_role using (true) with check (true);
revoke all on public.event_types from anon, authenticated, public;

commit;

notify pgrst, 'reload schema';
```

**`trucks.id` is text**, so `truck_id` is text — declaring it uuid fails outright. `event_type_id` is
`on delete set null`, **never cascade**: deleting a type must not delete a truck's events.

Three defences on the new table, and the third is the one that does the work: enabling RLS alone leaves
Supabase's default grants in place, so the `revoke` is what removes anon reachability.

### 2.1 Verification selects (read-only — run after the migration)

The table exists with its ten columns:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'event_types'
order by ordinal_position;
```

The four service columns are all **nullable** (NULL = "same as Standard" — if any is NOT NULL the
feature cannot express "leave this alone"):

```sql
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'event_types'
  and column_name in ('buzzer_prompt', 'takes_cash', 'order_ready', 'collection_interval_mins');
```

The two new `truck_events` columns, both nullable with no default:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'truck_events'
  and column_name in ('event_type_id', 'order_ready_source');
```

The case-insensitive unique index landed:

```sql
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'event_types';
```

The foreign key is `SET NULL`, not `CASCADE` (`confdeltype` must be `n`):

```sql
select conname, confdeltype
from pg_constraint
where conrelid = 'public.truck_events'::regclass and conname like '%event_type%';
```

RLS is on and the grants are gone (`relrowsecurity` true, and no privileges for anon/authenticated):

```sql
select c.relrowsecurity, c.relforcerowsecurity,
       (select count(*) from information_schema.role_table_grants g
        where g.table_schema = 'public' and g.table_name = 'event_types'
          and g.grantee in ('anon', 'authenticated', 'PUBLIC')) as public_grants
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'event_types';
```

Nothing changed for any existing event — every row must still read NULL immediately after the
migration:

```sql
select count(*) as events, count(event_type_id) as typed, count(order_ready_source) as source_recorded
from public.truck_events;
```

The column comments landed:

```sql
select a.attname, col_description(a.attrelid, a.attnum) as comment
from pg_attribute a
where a.attrelid = 'public.truck_events'::regclass
  and a.attname in ('event_type_id', 'order_ready_source');
```

PostgREST is serving the new table (this must return 0 rows, not PGRST205):

```sql
select count(*) from public.event_types;
```

---

## 3 · STAGE 2 — THE FOUR RESOLVERS, AND EVERY READER I CHANGED

### 3.1 The rule, in one place

`lib/event-types/resolve.ts` holds one function per setting:

```
effective = the event's own hand-set override  ??  the type's value  ??  today's default
```

`??` and never `||`, every time: `false` is a real instruction ("switch this off for this type") and
`||` reads it as unset and silently re-inherits — the bug `lib/payments/paid-step.ts:15-16` records.

| Setting | Function | Chain |
|---|---|---|
| Buzzer prompt | `resolveBuzzerPromptWithType` | `event.buzzer_prompt ?? type ?? "this van has a rack"` |
| Take cash | `resolveTakesCashWithType` | `event.takes_cash_override ?? type ?? trucks.takes_cash ?? false` |
| Mark ready | `resolveOrderReadyWithType` | see §4 — it needs the source column |
| Collection grid | `resolveIntervalsWithType` | event's own pair ?? type's customer value ?? van's pair |

A van with **no buzzer rack** still wins before the type is consulted: there is nothing to hand out, so
a type cannot conjure a prompt. The operator collection grid **follows** the type's customer grid,
exactly as it follows an event override — `applyEventIntervals` explains why the mixed pair "is the one
combination no operator asked for and no screen displays".

### 3.2 Every reader, with file:line

| # | Reader | File:line | What changed |
|---|---|---|---|
| 1 | The buzzer resolver | `lib/buzzer.ts:92` | gained an **optional** third argument; omitted ⇒ identical |
| 2 | The paid-step resolver | `lib/payments/paid-step.ts:88` | optional `type`, reaching **`takesCash` only** |
| 3 | The interval resolver | `lib/slot-interval.ts:238` | `applyEventIntervals` delegates to `resolveIntervalsWithType` |
| 4 | …and its async form | `lib/slot-interval.ts:291` | `resolveIntervalsFor` adds one probed `readEventType` |
| 5 | Dashboard, mark-ready | `app/api/dashboard/route.ts:638` | **was inline**; now the resolver |
| 6 | Dashboard, buzzers | `app/api/dashboard/route.ts:652` | passes the type |
| 7 | Dashboard, the type read | `app/api/dashboard/route.ts:~570` | one probed `readEventType` per poll |
| 8 | Dashboard action, `paidStepFor` | `app/api/dashboard/action/route.ts:114` | reads the type, passes it to `resolvePaidStep` |
| 9 | Dashboard client | `app/dashboard/[token]/page.tsx:~3180` | `resolvePaidStep(truck, activeEvent, eventType)` |
| 10 | The public events feed | `app/api/events/route.ts:~128` | publishes the **type's** customer grid, batched |

**Readers I deliberately did not change, with the reason:**

- **The KDS** (`app/dashboard/[token]/kds/page.tsx:1730`) destructures `showPaidStep` only, and no type
  sets the paid step. Asserted in the harness so the omission is on record rather than overlooked.
- **`/api/slots`**, **`/api/orders/submit`** and **`lib/seed-demo-orders.ts`** all call
  `resolveIntervalsFor`, which is now type-aware — so they were reached **without being edited**.
- 🔴 **The brief names "the checkout's cash option and the submit route" as `takes_cash` readers.
  Neither exists.** `takes_cash` is read only by `app/api/dashboard/route.ts`,
  `app/api/dashboard/action/route.ts`, `app/dashboard/[token]/page.tsx` and the KDS — all
  operator-side. Its own migration says why: it "adds a BUTTON", is for till reconciliation, and
  "nothing in the fee engine may ever read it"
  (`20260730_takes_cash_and_payment_method.sql:19-28`). There is no customer surface and no money
  effect, which is also what makes it safe in a stage that does no pricing. I did not invent a reader
  to match the brief.

### 3.3 The client and the server must agree

The dashboard resolves `takesCash` **twice** — once in `paidStepFor` for collect/undo-collect, once on
the page for the toggle. Passing the type to one and not the other would show the operator one cash
setting while every collection used another, which is the divergence `resolvePaidStep` exists to
prevent. Both now receive it. The effective values the client *draws* are the server's; only the type's
**name** and the "THIS EVENT" flags are new payload.

---

## 4 · 🔴 THE `order_ready_override` PROBLEM, AND THE FIX

### The problem

`order_ready_override` is unlike every other per-event override:

- **seeded at creation** by all three real creation paths (`app/api/manage/route.ts:872`,
  `app/api/dashboard/action/route.ts:1209`, `app/api/inbound-schedule/route.ts:182`);
- **bulk-written onto every event** when the van default flips
  (`app/api/manage/route.ts:1981-1988` — *"including events previously toggled on the dashboard (they
  reset to the new value, by design)"*).

So it is never null in practice, and under `override ?? type ?? default` **a type could never win for
the mark-ready step**. It would be offered on the type screen and silently do nothing.

### The fix, and why it is safe

**Record who set the value.** `truck_events.order_ready_source text` — `'seed'` | `'truck'` | NULL.

- All three creation paths keep seeding **the same value from the same van lookup** and now also write
  `'seed'`. One exception: **Add event does not seed it at all when a type was chosen**, leaving the
  column NULL so the type can supply it.
- The **dashboard toggle** writes `'truck'` — the only writer that does, asserted in the harness.
- The **master switch** writes `'seed'`, which is the truth about that statement: it already overwrites
  per-event choices by design, so after it runs no event's value is a choice any more.

**Two rules keep today's trucks exactly as they are:**

1. **No type ⇒ the source column is not read at all.** The resolver returns `override ?? vanDefault`
   via a separate early return, which is character-for-character the pre-build expression. An untyped
   event cannot be affected **whatever its source column says** — and the harness drives all three
   values of that column against the pre-build expression to prove it.
2. **A type with `source` NULL ⇒ the stored value is inferred.** A pre-build dashboard toggle is
   genuinely indistinguishable from a seed. If the stored value **differs** from the van's current
   default, somebody chose it and it wins; if it **equals** the default it cannot be told from a seed
   and the type wins.

**Why rule 2 is acceptable, stated as the judgement it is.** Where the stored value equals the van
default, "the truck chose the default" and "nobody chose anything" give the same answer for every
untyped event; and for a typed event, having accepted the default some weeks ago is a weaker statement
about today's festival than the type the truck just picked for it. It is the only judgement in the
file and it is commented as one. **No backfill** — writing `'seed'` onto existing rows would assert
something unknown about them, the error `20260730_takes_cash_and_payment_method.sql` refused to make
about `order_payments.method`.

**Alternatives rejected.** (a) *Stop seeding altogether* — changes untyped events, since the master
switch's reach depends on the column being concrete. (b) *Treat every NULL as a seed* — lets a newly
assigned type silently overrule a real pre-build choice. (c) *Have the type write the column* — breaks
decision 1 and the inherit chain the paid-step migration protects.

---

## 5 · THE SCREENS

All three live in `components/manage/EventTypes.tsx`, so every shared file gets **one line**.

### 5.1 The panel (Main board)

A full-screen panel from an **"Event types" button in the Schedule header**. Columns side by side:
**Standard first, read-only** ("Your normal setup", "Change these in Settings, not here"), then one
column per type. A setting matching Standard shows **grey**, and shows **Standard's value** rather than
a dash — "same as Standard" is only useful if you can see what that is. Where the vans disagree it says
**"Set per van"** rather than picking one and presenting it as the truck's setup.

Each type has rename, reorder (← →), delete-with-confirm, and **"Used by: N upcoming events"**. The
delete confirm says its events go back to Standard and that per-event changes stay — true because
`event_type_id` is `on delete set null` and no event is written to.

**On a phone: one column at a time with a type picker above**, at the grid's own `md:` breakpoint.

### 5.2 "+ New event type" (NewType board)

Four suggestions — Festival, Pub, Market, **Private hire** — then a custom name, and *"New types start
as a copy of Standard. Change anything after."*

🔴 **No suggestion promises anything this build cannot do.** The board's Festival line reads "Shorter
menu, prices up, buzzers on"; menus and prices are later stages, so the descriptions name only the four
settings that resolve. **Private hire is still offered by name** — a truck who does private hires wants
the type now for its service settings — but its description says "Buzzers off, take cash off", not
"private". Asserted in the harness.

### 5.3 The Add event picker (AddEventType board)

One `<select>` labelled **Event type**, defaulting to the usual type for the venue, with the
**"(usual for this place)"** hint and a one-line summary. **New events only** — an edit cannot move an
event's type from the form, and `upsert_event`'s update path names no such column, so it could not.
**It renders nothing for a truck with no types.**

"Usual for this place" (decision 5) is the type of the truck's most recent event at the same normalised
venue name, worked out on demand with **no defaults table**. ⚠️ It uses **main's own**
`normalizeVenue` (`lib/venue-signature.ts`), not a new normaliser. That is *not* the function
`truck_places.name_key` uses — `normalisePlaceName` lives on schedule-graphics — and **at the merge
this should key on `truck_place_id` instead**, which removes the question rather than answering it
twice.

### 5.4 The dashboard control (Dashboard board)

An **"Event type ▾"** select on the event card, above the per-event settings it explains, with
**"N settings changed for this event only."** The switch confirm says all three things:

> • New orders use Pub's service settings.
> • Orders already placed keep their prices.
> • Your 2 changes for this event stay.
> ☐ Clear my changes and use Pub exactly

All three are true of the implementation: the first because resolvers run at request time; the second
because price-lock is the stored `orders.items[].unit_price` and **nothing in this build touches the
orders table** (§6.3); the third because a hand change outranks the type everywhere.

**"Clear my changes"** clears **exactly** the columns a type can set, derived from `SERVICE_KEYS`:
`buzzer_prompt`, `takes_cash_override`, `order_ready_override` (+ its source) and the collection pair.
The pause, the extra wait, the paid step, the completion presses and the offline rules are left alone —
asserted, with a list of forbidden columns.

---

## 6 · ZERO CHANGE FOR UNTYPED TRUCKS

### 6.1 Proved against the pre-build tree, not against a remembered expression

`scripts/event-types.cjs` §1 uses `headWorktree` to put **the commit this build started from** on disk,
compiles it, and compares outputs:

```
✓ the before tree genuinely predates this build — it has no event-types module
✓ resolveBuzzerPrompt is byte-identical across 12 inputs
✓ resolvePaidStep is byte-identical across 27 inputs — all three of its values
✓ applyEventIntervals is byte-identical across 67 inputs
✓ the pre-build tree really did resolve the mark-ready step inline (the premise of 1d)
✓ the mark-ready step is byte-identical across 36 inputs — INCLUDING every value of the new source column
```

The matrices are **exhaustive over the inputs that decide**, not sampled.

### 6.2 The control that makes §6.1 mean something

Every assertion above is "these are the same", so without a control they would all pass on a resolver
that ignored its type argument:

```
✓ CONTROL: a TYPED fixture differs on all four settings — so "identical" above is a real finding
```

### 6.3 The brief's four surfaces

The brief asks for the menu API payload, the slots, the dashboard settings and the submit route's
priced arrays / payment options, before and after. Those are route handlers needing a database and
Stripe; **a harness that mocked them would be proving something about the mock.** What I did instead,
which is stronger for the money path:

```
✓ THE PRICE PATH IS UNCHANGED — repricing, the calculator and the submit route, byte-for-byte
✓ …and the submit route does not so much as import event types
```

`lib/order-repricing.ts`, `lib/order-calculations.ts` and `app/api/orders/submit/route.ts` are compared
**byte-for-byte** against the pre-build tree, with `lib/payments/paid-step.ts` named as the one allowed
difference. **If that assertion ever fails, something has reached the money path.** The slots and the
dashboard settings flow through the four resolvers, which §6.1 compares exhaustively; the menu API is
not touched by this build at all (it is not in `git diff --name-only HEAD`).

### 6.4 The plan gate

```
✓ event_types is MAX only, so Max and the trial set — and nothing else
✓ an EXPIRED trial loses it, and a not-yet-started trial keeps it
✓ a per-truck override still wins both ways
⛔ no OTHER feature changed plan when the key was added
```

🔴 **No second enable column, deliberately, unlike `embed_schedule`.** That feature needed one because
it *publishes* a surface the moment it is on. This one publishes nothing: a truck that never creates a
type has `event_types` empty and every `event_type_id` NULL, so every resolver returns today's value.
The feature is inert until the truck acts, so a second switch would have nothing behind it. Checked
server-side on **every action but `load`**, by exclusion rather than by a list, so a new action added
later is refused by default.

**On a downgrade** (decision 4): `load` stays open so existing types keep resolving — otherwise a
downgrade would silently change the service settings of events already in the diary — and it returns
`readOnly: true` so the panel shows the upgrade line instead of controls.

---

## 7 · THE CHECKS

### `scripts/event-types.cjs` — 66 checks, 10 broken variants, all 10 fail as required

| | What it breaks | Caught by |
|---|---|---|
| V1 | the type is ignored for buzzers — offered and does nothing | §2 |
| V2 | the type overrules a change the truck made on this event | §2 |
| V3 | an **untyped** event stops resolving the way it does today | §1 matrix |
| V4 | a seeded `order_ready` read as a hand change — no type can ever set the mark-ready step | §4 |
| V5 | a pre-build per-event toggle discarded in favour of the type | §4 |
| V6 | `||` replaces `??` — a type that switches cash **off** is ignored | §2 |
| V7 | the type overrules the event's own collection grid | §2 |
| V8 | a type conjures a buzzer prompt for a van with no buzzers | §2 |
| V9 | the feature key leaves `MAX_FEATURES` and Max loses the feature | §1f |
| V10 | "clear my changes" would wipe the paid step, which no type sets | §3 |

The brief's four named variants are V1 (type ignored), V2 (type beats a hand change), V3 (untyped truck
changed) and V4 (seeded `order_ready` treated as a hand change).

### `scripts/event-types-render.cjs` — the panel, the picker and the control in both engines

Chromium and WebKit, 1440 / 820 / 390. **A panel with six types** (the wide case) at every width:

```
panel 1440×900  grid 1567px in scroller 1392px · doc 1440 vs 1440
panel  820×1180 grid 1567px in scroller  772px · doc 820 vs 820
panel  390×844  (phone column; the grid is hidden)
picker 1440×900 field 624px · modal 672px · hint clipped: false
picker  390×844 field 318px · modal 358px · hint clipped: false
dash   390×844  select 129px · own-line clipped: false
```

No horizontal page scroll anywhere; the grid scrolls **inside its own box** so Done stays reachable;
the "(usual for this place)" hint and the "N settings changed" line are never cut off.

### 🔴 One real defect the measurement found: Safari and `min-height` on a `<select>`

The dashboard control carried `min-h-[40px]`. **Chromium rendered 40px; WebKit rendered 23px** — Safari
sizes a `<select>` from its own appearance and ignores `min-height`. Operators use iPads, and 23px is
not a target you hit one-handed mid-service. Changed to `h-10` (and `h-11`, 44px, on the phone
selects), verified at 40/40 and 44/44 in both engines. **A grep could not have found this**; only
rendering in both engines did.

### Checks of mine that were wrong before they were right

1. **Two source checks matched my own comments.** A note saying "`order_ready_source: 'truck'` is what
   makes this a hand change" counted as a second writer. A check that forbids writing down *why* is a
   worse check, so a `codeOf()` stripper was added and the **code** is counted.
2. **V3 crashed the harness.** Removing the early return makes an untyped event reach `type.order_ready`
   on a null type — a throw *is* detection, but an uncaught one ended the run before V4–V10 could
   report. Now caught and counted as a difference.
3. **The scroll probe measured the wrong thing.** `scrollWidth > clientWidth` is true for a plain block
   with `overflow: visible` too, so the broken variant "passed" the control. It now **tries to scroll**
   — set `scrollLeft`, see if it moved — which is the reachability question actually being asked.
4. **The control asserted the wrong consequence.** It expected the page to widen without
   `overflow-x-auto`; it does not, because the panel is `fixed inset-0` and its body clips instead. The
   real difference is reachability, so that is what it now asserts.
5. **A nonsense assertion** (`d.ctl.bottom <= d.settings_bottom ?? true`) compared against a field the
   probe never returned, and `<=` binds tighter than `??` — it failed on correct markup at every width.
6. **The ESLint parse error** in the harness came from `const T = (o) => ({...})`; renamed to a plain
   function, which also reads better.

### An existing harness caught a real problem in my code

`scripts/slot-interval-van-list-tolerance.cjs` refuses any `truck_vans` select that names
`collection_interval_mins` **alongside other van fields**, because one 42703 on the interval column
would fail the whole statement and take the other fields with it. My first draft of the `load` handler
selected all three together. **Fixed** by splitting: a plain select for `order_ready_enabled` and
`buzzer_count`, and `readVanIntervalsForTruck` — the one sanctioned probed reader — for the grid.

### Stale assertions updated after a correct change

- `scripts/screenshot-truck-details.cjs:409` asserted `app/api/inbound-schedule/route.ts` was
  **byte-identical to a floating HEAD**, meaning "that build did not touch the scraped-event bridge".
  My one-line `order_ready_source: 'seed'` addition broke it. **Narrowed, not dropped**: it now allows
  exactly that one line (comments excluded) and still fails on any other difference. 173 checks pass.
- `lib/slot-interval.ts` imports were trimmed to what it still uses locally, since the vocabulary moved
  out (§8).

### Harnesses run (not the full sweep, as instructed)

| Harness | Result |
|---|---|
| `event-types.cjs` *(new)* | ✅ 66 passed · 10/10 variants failed as required |
| `event-types-render.cjs` *(new)* | ✅ both engines, three widths |
| `slot-interval-event-override.cjs` | ✅ |
| `slot-interval-grid-routing.cjs` | ✅ |
| `slot-interval-settings.cjs` | ✅ |
| `slot-interval-van-resolution.cjs` | ✅ |
| `slot-interval-van-list-tolerance.cjs` | ✅ *(after the fix above)* |
| `collection-times-hint.cjs` | ✅ |
| `batch-reservation-edit-lock.cjs` / `-switch` / `-writers` | ✅ |
| `printing-gating.cjs`, `printing-network-guard.cjs` | ✅ |
| `customer-path-identity.cjs` | ✅ |
| `screenshot-truck-details.cjs` | ✅ 173 *(after the narrowing above)* |

Both new harnesses are registered in `scripts/harnesses.json` (83 total).

### The rest

- `npx tsc --noEmit` — clean.
- `npm run build` — compiled successfully.
- **ESLint on added lines** — **0 errors, 0 warnings** across `lib/event-types/`,
  `components/manage/EventTypes.tsx`, `app/api/event-types/route.ts`, `lib/slot-interval-core.ts`,
  `lib/buzzer.ts`, `lib/payments/paid-step.ts`, `lib/slot-interval.ts`, `lib/features.ts`.
  `page.tsx` + the dashboard page: **471 problems (368 errors, 103 warnings) before and after,
  identical** — all pre-existing. The harness `.cjs` keeps 4 `require()`-style errors, which every
  harness in this repo has.
- **Line-level multiset diff on `app/manage/[token]/page.tsx`: 0 lines lost.**

---

## 8 · ONE REFACTOR I HAD TO MAKE: AN IMPORT CYCLE

`lib/slot-interval.ts` now resolves an event's type, so it imports `lib/event-types/resolve.ts` — which
needs `normaliseInterval` and `VanIntervals` from it. That is a cycle.

A cycle between two modules that only call each other inside function bodies happens to work, **and
that is exactly why it was not left**: it works until something evaluates one of those consts at module
scope, and then a `normaliseInterval` that is `undefined` at the moment of use silently becomes a
5-minute grid on a van configured for 15.

**`lib/slot-interval-core.ts`** is a new leaf with **no imports of its own**, holding
`INTERVAL_CHOICES`, `IntervalChoice`, `DEFAULT_INTERVAL`, `isIntervalChoice`, `normaliseInterval`,
`VanIntervals` and `NO_VAN_INTERVALS`. **Every name is re-exported by `lib/slot-interval.ts`**, so all
ten existing import sites are unchanged and nothing moved. Verified: the leaf has zero imports and
`lib/event-types/` no longer imports `lib/slot-interval`.

---

## 9 · THE MERGE WITH `schedule-graphics`

Per the investigation report's §8.2, this feature owns its own files and touches shared files only in
one-line mounts:

| New file | Lines |
|---|---|
| `lib/event-types/types.ts`, `resolve.ts`, `read.ts` | the shape, the four resolvers, the probed reads |
| `components/manage/EventTypes.tsx` | all three screens |
| `app/api/event-types/route.ts` | its own route |
| `lib/slot-interval-core.ts` | the leaf (§8) |
| `scripts/event-types.cjs`, `scripts/event-types-render.cjs` | the harnesses |
| `supabase/migrations/20261009_event_types.sql` | the migration |

**Shared-file edits — the whole merge cost:**

| File | Edit |
|---|---|
| `lib/features.ts` | one `Feature` key + one `MAX_FEATURES` entry |
| `app/manage/[token]/page.tsx` | one import, two state lines, the Event types button, one `<EventTypeSelect>` mount, one `<EventTypesPanel>` mount, one spread on save |
| `app/dashboard/[token]/page.tsx` | one import, two state lines, one mount, one argument on `resolvePaidStep` |
| `app/api/manage/route.ts` | one helper + three keys on one insert + one key on the bulk update |
| `app/api/dashboard/route.ts` | one import, one read, the resolver calls, the payload fields |
| `app/api/dashboard/action/route.ts` | one read in `paidStepFor`, one key on two writes |
| `app/api/inbound-schedule/route.ts` | one key |
| `app/api/events/route.ts` | one read, one argument |
| `lib/buzzer.ts`, `lib/payments/paid-step.ts`, `lib/slot-interval.ts` | one optional argument each |

**The panel is a button, not a sub-tab**, precisely because main's Schedule tab has no sub-tab bar and
schedule-graphics adds one. Promoting it to a third pill after the merge is one `SCHEDULE_SECTIONS`
entry plus the same one line. Nothing was added inside the Add event modal beyond a single `<select>`
mount, which is the most-rewritten region on that branch.

---

## 10 · WHAT TO TEST ON LOCALHOST — VILLAGE SPICE

Run the migration first. Localhost uses the production database, so this is Village Spice only.

**No truck has upcoming events, so start by making some.**

1. **Create two test events.** Manage → Schedule → **+ Add event**. Make one for **tomorrow** at
   `Bures Music Festival` (area Bures, 10:00–22:00, assign a van) and one for the **day after** at
   `The Five Bells` (17:00–20:00, same van). Note there is **no Event type field yet** — correct: the
   truck has no types.
2. **Open the panel.** Schedule → **Event types**. Only **Standard** is listed, read-only, showing your
   normal setup: Buzzers (On if the van has a rack), Take cash, "Mark ready" step, Collection times. If
   Village Spice has two active vans configured differently, a row reads **"Set per van"**.
3. **Create a type from a suggestion.** **+ New event type → Festival → Add**. A Festival column
   appears with *Buzzers On*, *"Mark ready" step On*, *Collection times Every 10 min* in **black**, and
   *Take cash* in **grey** showing Standard's value. "Used by: 0 upcoming events".
4. **Create a custom type.** **+ New event type**, type `School fete`, **Create**. Every setting is
   grey — it is a copy of Standard and changes nothing yet. Change its *Take cash* to **On**.
5. **Rename and reorder.** Rename `School fete` to `Fete`; move it left of Festival with ←. Reload: the
   order sticks.
6. **The picker appears now.** **+ Add event** → the **Event type** field is there, defaulting to
   **Standard**, with the summary "Your normal setup". Choose **Festival** → the summary reads
   "buzzers on · mark-ready step on · collection every 10 min".
7. **"Usual for this place".** Type `Bures Music Festival` into Venue name on a **new** event. After a
   moment the type should pre-select the type used by your existing Bures event (Standard at first).
   Now **set your existing Bures event to Festival** (step 9), then add another Bures event — the
   picker should pre-select **Festival** and show **"(usual for this place)"**.
8. **Add a typed event.** Create a third event at `Bures Music Festival` for next week with type
   **Festival**. The panel's Festival column now reads "Used by: 1 upcoming event".
9. **Switch a type from the dashboard.** Open the dashboard for the Bures event. The **Event type ▾**
   control is on the "This event" card. Switch it to **Festival** → the confirm lists the three lines
   and you have made no per-event changes, so it says so. Confirm. **Buzzers** and **"Mark ready"
   step** should now read On, and the collection grid should be every 10 minutes.
10. **A hand change wins.** On that same event, switch **Buzzers off** with the per-event toggle. Now
    switch the type to **Fete** and back to **Festival**: the confirm says "Your 1 change for this event
    stays", and buzzers stay **off** afterwards.
11. **"Clear my changes and use Festival exactly."** Switch type again, tick the box, confirm. Buzzers
    return to the type's value (On). ⚠️ Check that your **paid step** and **extra wait** settings on
    that event were **not** touched.
12. **The mark-ready step is the one to watch.** This is the setting the schema change exists for. On a
    typed event with Festival's *"Mark ready" step On*, the orders screen should show the **Ready**
    button. Then switch that one event's mark-ready **off** from the dashboard and confirm it stays off
    through a type switch — that is `order_ready_source = 'truck'` winning.
13. **Delete a type.** Panel → **Delete** on `Fete` → the confirm names how many upcoming events go
    back to Standard. Confirm, then check those events resolve to your normal setup and any per-event
    change you made on them is still there.
14. **An untyped truck is unchanged.** Any event you left as Standard must behave exactly as before —
    same buzzers, same cash button, same Ready button, same collection grid.
15. **On a phone (390px).** Open the panel: it is **one column with a type picker above**, no sideways
    scroll. The Add event picker's hint wraps rather than being cut off. The dashboard's Event type
    select is a comfortable tap target (this is the Safari fix — check it on an iPad or iPhone, not just
    a narrowed desktop window).
16. **With six types**, the panel grid scrolls **sideways inside its own box** and the **Done** button
    stays on screen.

---

## 11 · WHAT I DID NOT DO

- **No SQL was run.** The migration is yours to apply.
- **Not deployed, not pushed to main, nothing merged or rebased.** `schedule-graphics` untouched.
- **No full sweep** — you asked to be consulted first. Everything that compiles a file I changed was
  run (§7).
- **No prices, items, stock, deals or private visibility** — not in the data model, not on the screens,
  not in a suggestion's wording.
- **No food-only option anywhere**, per decision 6.
- **No operator collection interval on a type** — a type sets the customer grid, and the operator grid
  follows it exactly as it follows an event override.
