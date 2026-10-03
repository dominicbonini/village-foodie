# Van settings fully per van · "Same as Van 1" · Add event preview in the right pane

**Branch:** `schedule-graphics` (`git branch --show-current` → `schedule-graphics`)
**Commit:** `415210a` — full hash `415210a8d4d0f1ab9b283631d507969a44bef968`, pushed
**Date:** 5 October 2026
**Database:** production, read through localhost. Village Spice only. Pizzeria Gusto not touched or used for any check.
**SQL run:** none. The migration is written; you run it. Full SQL and verification selects are in §3 and in the chat reply.

---

## 1 · The root cause

`docs/settings-and-preview-report.md` §4 found it and stopped. Confirmed and fixed here:

Prep, Items and "Counts to total capacity" are rendered **inside each van's Kitchen capacity card** —
in Manage › Truck settings and on the Dashboard — but they were stored **once per truck** on
`menu_categories`. That table has **no `van_id`** anywhere: not in any migration, not in any code
path. `upsert_category` writes `from('menu_categories') … .eq('truck_id', truck.id)`.

So a truck with two kitchens could not be configured at all. Setting Van 2's prep time set Van 1's,
silently, with a green toast — and these three fields are not cosmetic: they decide **whether an
order is accepted** and **when it is ready**.

The fix is a per-van override table plus **one** resolver that every reader goes through. The
truck-level values keep their exact present meaning and become the **default** for any van that has
not been given its own.

---

## 2 · Step 1 · the diagnosis: every reader and writer, and how each knows the van

### 2.1 Readers — all five resolve through `lib/van-category-settings.ts`

| # | Reader | How it knows the van | Where it resolves now |
|---|---|---|---|
| 1 | **`/api/slots`** — the customer's slot grid | `todayEvent.van_id`, already resolved in this route for `kitchen_capacity` and the collection intervals | [route.ts:208](app/api/slots/[truckId]/route.ts#L208), consumed at [:211](app/api/slots/[truckId]/route.ts#L211) |
| 2 | **`/api/dashboard`** — operator board, capacity dots, **and the KDS** (which takes `catConfigs` straight from this payload, [kds/page.tsx:679](app/dashboard/[token]/kds/page.tsx#L679)) | `selectedEvent.van_id`, already used here for the van's capacity and intervals | [route.ts:498](app/api/dashboard/route.ts#L498), consumed at [:501](app/api/dashboard/route.ts#L501) |
| 3 | **`buildCatConfigs`** — order acceptance, via `/api/orders/submit` | a new `vanId` parameter, passed the van `eventKitchenCapacity` resolved | [prep-utils.ts:202](lib/prep-utils.ts#L202); call site [submit/route.ts:950](app/api/orders/submit/route.ts#L950) |
| 4 | **`/api/menu`** — the customer menu payload | `van_id` off the event the route already reads at [:246](app/api/menu/[truckId]/route.ts#L246) for the offline-protection check, hoisted into `eventVanId` | [route.ts:505](app/api/menu/[truckId]/route.ts#L505) |
| 5 | **`lib/seed-demo-orders`** — demo provisioning | `van_id` off the event; **the read was hoisted** above the line-building, because the planner uses all three fields before the point the van used to be resolved | [seed-demo-orders.ts:408](lib/seed-demo-orders.ts#L408) |

**Downstream consumers, which take the resolved values as parameters and needed no change:**
`lib/slot-availability.ts` (`buildSlotAvailability`, `projectBackwardOccupancy`, `fitOrderBackward`,
`earliestBackwardFitSlot`), `lib/slot-bookings.ts` (`placeOrderInSlotLocked`),
`components/dashboard/AddOrderPanel.tsx:976`, `app/dashboard/[token]/page.tsx:2930` (built from
`/api/slots`' van-aware payload), `app/dashboard/[token]/kds/page.tsx:202`.

**An event with `van_id` null** resolves to the `menu_categories` values. That is not a degraded
path: "no van" means "the truck default", which is what every truck reads today. `readVanCategorySettings`
does not even issue a query for a null van.

**No reader was van-blind, so the STOP condition in the brief was not met.** The one that came
closest is the customer order page's ASAP fallback
([order/page.tsx:1561](app/trucks/[slug]/order/page.tsx#L1561)): it prefers `serverCatConfigs` from
`/api/slots` (reader 1, van-aware) and only falls back to the `/api/menu` payload before that
response arrives — and `/api/menu` is reader 4, also van-aware. Both of its sources are resolved, so
the fallback needed no change of its own.

### 2.2 Writers

| Writer | Writes | Changed? |
|---|---|---|
| **Manage › Truck settings, van card** — `writeVanCat` [page.tsx:10402](app/manage/[token]/page.tsx#L10402), reading via `effectiveVanCat` [:10387](app/manage/[token]/page.tsx#L10387) | `van_category_settings` for **that van** | **Yes** — was `upsert_category` (truck-level). This was the bug. |
| **Dashboard, van card** — `updateCategoryField` [page.tsx:2439](app/dashboard/[token]/page.tsx#L2439), `toggleCatCapacityDash` [:2460](app/dashboard/[token]/page.tsx#L2460) | `van_category_settings` for `activeEvent.van_id` | **Yes** — was `update_category` (truck-level). Same bug, second surface. **No van ⇒ no write**, rather than falling back to the truck. |
| **`upsert_van_category`** [manage/route.ts:2158](app/api/manage/route.ts#L2158) | the per-van row, upserting on `(van_id, category_id)` | **New** |
| **`set_van_same_as_first`** [manage/route.ts:2230](app/api/manage/route.ts#L2230) | copies the first van, records the switch | **New** |
| **`update_van_settings`** [manage/route.ts:1984](app/api/manage/route.ts#L1984) | `truck_vans` as before, **plus the fan-out** to followers | Extended |
| **Manage › Menu tab category editor** — `updateCatField` [page.tsx:10452](app/manage/[token]/page.tsx#L10452), `toggleCatCapacity` [:10357](app/manage/[token]/page.tsx#L10357) → `upsert_category` [manage/route.ts:514](app/api/manage/route.ts#L514) | `menu_categories`, truck-scoped | **No.** Unchanged, wording untouched. |
| **Dashboard category editor** — `saveCatEdit` [page.tsx:2410](app/dashboard/[token]/page.tsx#L2410) → `update_category` [dashboard/action/route.ts:2697](app/api/dashboard/action/route.ts#L2697) | `menu_categories`, truck-scoped | **No.** Unchanged, wording untouched. |

**Where the truck-level editors are, and how they are labelled** (asked for, and deliberately not
changed): Manage › **Menu** tab → a category's edit modal, fields **"Prep"** and **"Items"** with the
"Counts toward capacity" tickbox; Dashboard → the menu drawer's category edit, same three fields.
Neither says "for every van" today. They are now the **truck default** rather than the only value,
and §10.3 flags that their labels may deserve a word — I did not add one, because the brief says not
to change their wording.

---

## 3 · Step 2 · the migration

**File:** `supabase/migrations/20261005_van_category_settings.sql`. Idempotent; re-running is safe.

### 3.1 One thing to know before you run it

`menu_categories` **predates this migrations directory**, so nothing in the repository records the
types of `id`, `prep_secs`, `batch_size` or `counts_toward_capacity`, and I may not run SQL to look.
Rather than guess — a wrong FK type either fails obscurely or, with a cast somewhere, silently never
matches — **the first statement checks all four and raises with the real type and the exact edit to
make**, before any DDL. If the assumption (`uuid`, `integer`, `integer`, `boolean`) is right it is
silent; if not, nothing is created and the error tells you what to change.

### 3.2 The migration

```sql
set lock_timeout = '3s';

-- ══ PREFLIGHT — assert the types this file assumes, BEFORE anything is created ═══════════════════
do $$
declare
  want text[] := array['id,uuid', 'prep_secs,integer', 'batch_size,integer',
                       'counts_toward_capacity,boolean'];
  spec text; col text; expect text; got text; bad text := '';
begin
  if to_regclass('public.menu_categories') is null then
    raise exception 'menu_categories does not exist — wrong database?';
  end if;
  foreach spec in array want loop
    col    := split_part(spec, ',', 1);
    expect := split_part(spec, ',', 2);
    select format_type(a.atttypid, a.atttypmod) into got
      from pg_attribute a
     where a.attrelid = 'public.menu_categories'::regclass
       and a.attname  = col and a.attnum > 0 and not a.attisdropped;
    if got is null then
      bad := bad || format('  menu_categories.%s is MISSING%s', col, chr(10));
    elsif got <> expect then
      bad := bad || format('  menu_categories.%s is %s, this file assumes %s%s', col, got, expect, chr(10));
    end if;
  end loop;
  if bad <> '' then
    raise exception E'van_category_settings: the column types below do not match what this migration assumes.\n%\nNothing was created. Edit the matching column type in 20261005_van_category_settings.sql to the type shown and re-run — the app code does not care which it is, only that the two sides agree.', bad;
  end if;
end $$;

begin;

create table if not exists public.van_category_settings (
  id uuid primary key default gen_random_uuid(),
  truck_id text not null references public.trucks(id) on delete cascade,
  van_id uuid not null references public.truck_vans(id) on delete cascade,
  category_id uuid not null references public.menu_categories(id) on delete cascade,
  prep_secs integer,
  batch_size integer,
  counts_toward_capacity boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists van_category_settings_van_cat_uidx
  on public.van_category_settings (van_id, category_id);
create index if not exists van_category_settings_van_idx   on public.van_category_settings (van_id);
create index if not exists van_category_settings_truck_idx on public.van_category_settings (truck_id);

alter table public.van_category_settings enable row level security;
drop policy if exists "service_role only" on public.van_category_settings;
create policy "service_role only" on public.van_category_settings
  for all to service_role using (true) with check (true);
revoke all on public.van_category_settings from anon, authenticated, public;

alter table public.truck_vans
  add column if not exists same_as_first_van boolean not null default false;

comment on table public.van_category_settings is
  'Per-van overrides for the three category capacity fields (prep_secs, batch_size, counts_toward_capacity). A row means "this van has its own settings for this category" and carries all three. No row = the van reads menu_categories, which is the behaviour of every truck before this table existed. Resolved by effectiveCategorySettings() in lib/van-category-settings.ts and NOWHERE ELSE.';

comment on column public.truck_vans.same_as_first_van is
  'UI state + write fan-out only. True = the operator asked this van to follow the first active van, so writes to the first van are copied here in the same request. NO READER RESOLVES THROUGH THIS COLUMN: this van''s own truck_vans fields and van_category_settings rows are always complete and authoritative, so switching it off is a no-op for ordering and keeps the copied values.';

commit;

notify pgrst, 'reload schema';
```

Key decisions, each written out in the file itself:

- **`truck_id` is `text`** — `trucks.id` is a slug (`pizzeria-gusto`). `uuid` fails outright.
- **A whole-row override, not three per-field overrides.** Per-field nullable overrides would make
  "prep inherited, batch not" representable, and every reader would need a three-way coalesce per
  field — three times the places to get wrong on the order-acceptance path. The writer seeds a new
  row from the values that van is **already** resolving, so the first write cannot change anything.
- **`unique (van_id, category_id)`** is the upsert target, so two tabs editing the same van's
  category produce one row rather than two of arbitrary precedence.
- **Cascade from van and from category.** A deleted van's overrides have no subject; a deleted
  category's override is unreachable, and `catConfigs` is keyed by category **name**, so a stale row
  whose category was deleted and whose name was later reused would apply to the wrong category.
- **RLS *and* the `revoke`.** Enabling RLS alone leaves Supabase's default grants in place, so the
  capability stays reachable with the anon key and merely default-denied.
- **No backfill, deliberately.** The table ships **empty**. A backfill would write a row per van per
  category and make every van independent immediately — a behaviour change nobody asked for, on
  every truck, which could not be undone without knowing the previous state.

### 3.3 Verification selects (read-only — run each on its own)

```sql
-- 1 · the table exists, with the types and the unique index
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'van_category_settings'
 order by ordinal_position;
```

```sql
-- 2 · the upsert target is there and is UNIQUE
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public' and tablename = 'van_category_settings'
 order by indexname;
```

```sql
-- 3 · RLS on, policy present, and anon/authenticated hold NO grants
select relrowsecurity, relforcerowsecurity
  from pg_class where oid = 'public.van_category_settings'::regclass;
```

```sql
-- 4 · …and the grants really are gone (this is the one that does the work)
select grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'van_category_settings'
 order by grantee, privilege_type;
```

```sql
-- 5 · the van column exists, defaults false, and is NOT NULL
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'truck_vans'
   and column_name = 'same_as_first_van';
```

```sql
-- 6 · THE IMPORTANT ONE: nothing was backfilled. This must return 0 immediately after the migration,
--     which is what makes "every truck behaves exactly as before" true rather than hoped.
select count(*) as per_van_rows from public.van_category_settings;
```

```sql
-- 7 · and no van is following another yet
select count(*) as vans_following_first
  from public.truck_vans where same_as_first_van is true;
```

---

## 4 · Step 3 · one resolver

`lib/van-category-settings.ts`. Every reader in §2.1 calls it; nothing else resolves these fields.

```
readVanCategorySettings(supabase, vanId)   → the van's rows, probed, keyed by category_id
resolveCategory(category, rows)            → the row if there is one, else the category itself
resolveCategories(categories, rows)        → the same over a list
effectiveCategorySettings(category, rows)  → the three fields, as the insert payload (for the writer)
resolveCategoriesForVan(supabase, vanId, categories)  → van + list in one step
```

Three design points that matter more than they look:

**It returns raw field values, not a `CatConfig`.** The four readers normalise *differently*, and
those differences are pre-existing behaviour this change must not alter:

| Reader | absent `batch_size` becomes |
|---|---|
| `/api/slots` | `1` |
| `/api/dashboard` | `1` |
| `buildCatConfigs` | **`999`** |
| `/api/menu` payload | `null` (normalised by the client) |

So `resolveCategory` hands back the category object with the three fields swapped and nothing else
touched, and every call site keeps its own expression verbatim. Returning a `CatConfig` would have
forced one of those defaults onto the other three readers. (The 1-vs-999 split is pre-existing; it is
in §10.1, not fixed here.)

**With no rows it returns the *same object*, not a copy.** That is what makes "no per-van rows ⇒
identical" structural rather than a hope about field lists — no reconstruction can drop a property
the caller also reads (`id`, `name`, `sort_order`, `allow_notes`, `default_stock` all travel through
untouched). Asserted directly: `resolveCategory(CAT, new Map()) === CAT`.

**It fails open to today's behaviour.** Any failure — migration not applied (`42703`/`42P01`), a
stale PostgREST schema cache (`PGRST205`/`PGRST204`), a dropped connection, a throw — returns an
**empty map**, and every caller then reads `menu_categories` exactly as before. A throw on the order
path would turn a degraded answer into no answer. This is the same pattern, for the same documented
reason, as `readVanIntervals` in `lib/slot-interval.ts`.

`/api/slots`' own comment called its van resolution *"one van, one resolution, four settings"*. It is
now **seven**, from the same single `todayEvent.van_id`.

---

## 5 · The equivalence proof

The brief asked for before/after equivalence proved with fixtures. It is proved by **compiling both
trees**, which is stronger than fixtures agreeing with each other:

`lib/prep-utils.ts` is compiled from a clean `git worktree` of **`719ac91`** (the commit this build
started from) *and* from the working tree. Both are driven with the same fixture categories through a
strict stub Supabase. The resulting `catConfigs` are compared **byte for byte**, then run through the
**real capacity engine** (`lib/slot-availability.ts`, untouched by this build) and compared again.

The fixture truck is Village-Spice-shaped: a cooking category (Pizza, prep 300, batch 2, counts), an
instant one that counts (Sides), and an instant one that does not (Drinks, batch 0 — which is what
exercises the 999 default).

| Case | Result |
|---|---|
| No per-van rows, old binary vs new | **byte-identical** |
| Explicit `vanId: null` (an event with no van) | **byte-identical** to the old binary |
| A van that simply has no rows of its own | **byte-identical** to the old binary |
| The **real engine** run on those inputs | **byte-identical** slots |
| A row for Van 2 (prep 600, batch 4) | Van 2's `catConfigs` **change** — `pizza.secs 600`, `pizza.batch 4` |
| …and Van 1, same truck, same moment | **byte-identical to the pre-change engine** |
| …and Van 2's other categories | Sides and Drinks **untouched** |
| The engine on Van 2's inputs | **different slots** — the override reaches the decision |
| The engine on Van 1's inputs | **byte-identical** to pre-change |
| `buildCatConfigs`' 999 batch default | **preserved** on both binaries |

The last-but-one row is the one that matters most: a build that resolved nothing at all would pass
every equivalence check and fail only there.

---

## 6 · "Same as Van 1"

### 6.1 The first-van rule

**The first van is the oldest *active* van, by `created_at` ascending.** That is not a choice made
for this feature — it is the order `get_vans` already returns
(`.eq('active', true).order('created_at', { ascending: true })`), which is the order Manage › Truck
settings renders. So "Van 1" in the label means **the van at the top of your own list**, and the rule
cannot drift from what you see. The server computes it and sends it as `firstVanId`; the client never
guesses.

Inactive vans are not candidates — a deactivated van is not in that list, so naming it "Van 1" would
name a van you cannot see.

### 6.2 A copy, never a lookup

This is the single most important decision in Part A.

Switching the switch **on** copies, in one request:

- the first van's own `truck_vans` fields (`VAN_COPY_FIELDS`), and
- its `van_category_settings` rows — **delete-then-insert**, a full replacement.

While it is on, every change to the first van is **also written** to every van with the switch on, in
the same request — both for van fields (`update_van_settings`) and for category settings
(`upsert_van_category`).

Switching **off** writes only the switch. The copied values stay, which is what "stop following Van
1" means — not "revert to something".

**No reader anywhere resolves through `same_as_first_van`**, and the harness asserts it across the
whole order path. A read-time `if (same_as_first_van) use van 1` would have: put a second van lookup
on order acceptance; given different answers depending on which van a reader happened to resolve;
and made switching the switch **off** a silent behaviour change. Because it is a copy, every van's
own row is complete and authoritative.

**Why delete-then-insert rather than merge:** if the target kept a row for a category the source does
not override, the switch would claim "same" while one category still differed. An empty source set is
correct and means "both vans inherit the truck defaults".

### 6.3 What is copied, and what is deliberately not

**Copied** — every field `update_van_settings` can write, checked by the harness against that
handler's own allowlist, so a setting added there and forgotten here fails a test rather than
silently making the switch stop meaning "same":
`auto_pause_on_offline`, `offline_protection_mode`, `offline_auto_reject_mins`, `show_cooking_step`,
`order_ready_enabled`, `kitchen_capacity`, `capacity_window_mins`, `buzzer_count`,
`collection_interval_mins`, `operator_collection_interval_mins` — plus all `van_category_settings`
rows.

**Not copied, each for a reason:**

| Field | Why not |
|---|---|
| `name` | You named this van; copying would rename it "Van 1". |
| `kds_token` | A **secret** and a device address. Two vans sharing it would point two kitchen screens at one queue. |
| `network_printer_address`, `network_print_device_id` | A physical address on a specific network and a specific device. Sharing them would print one van's tickets in the other van. The one group where "same settings" would be actively **wrong**. |
| `display_layout`, `split_screen` | Read-only on this screen; set on the KDS device itself. |
| `id`, `truck_id`, `created_at`, `active` | Identity, and whether the van exists in the list is not a setting. |

### 6.4 The first van being deleted

Handled by **not storing it**. `firstVanId` is derived on every read, so deleting the first van makes
the next-oldest active van first automatically — no stored id to fix up and no migration of state.
Vans with the switch on **keep their values and stay on**, because the switch is a write fan-out and
nothing re-resolves; they then follow the *new* first van from its next edit onwards. Asserted as a
function: remove the first van from the list and the next-oldest is returned.

The handler also refuses to let the first van follow itself (the UI only renders the switch on vans
2+, but a van fanning its own edits to itself is worth refusing in both places).

### 6.5 Nothing changes unless an operator acts

The table ships empty and every switch is false. A van gets rows **only** when someone edits that
van's card or turns the switch on. Until then it reads `menu_categories`, which is what it reads
today.

---

## 7 · Part B · the preview in the right pane

- **Desktop/iPad (≥768):** the live preview is in the **form pane, below Notes**, at the pane's full
  width, under a small muted **"Preview"** label. It still renders `components/TruckListCard` — the
  public schedule page's own component — through the adapter in
  `lib/schedule-graphics/event-preview.ts`, so it cannot drift from the card a customer sees.
- **The footer is back to Cancel and Add event.** Measured: **65px**, against **100px** with the
  preview in it. `ml-auto` keeps the buttons right-aligned now that nothing beside them is `flex-1`
  at ≥768.
- **"Filled from &lt;place&gt;"** is the muted line inside the preview card, new events only.
- **The van shows** when one is chosen, through the card's own documented `cornerAction` slot.
  Smuggling it into `truckName` or `village` would have put it in a field the public card uses for
  something else and would have surfaced wherever that field is rendered.
- **Phone: unchanged.** The pinned place card is still the preview line; the footer keeps its single
  muted line.

**Why it moved:** in the footer it shared a row with the buttons and had to be capped at
`max-h-[4.75rem] overflow-hidden`, so a long venue name was **clipped** — a preview that cannot show
the thing it previews. In the pane there is room, so the cap is gone.

---

## 8 · Harness results

### 8.1 `scripts/van-category-settings.cjs` — **new. 63 checks, 11 broken variants, all pass**

No network, no database, no browser. Sections: the migration · one resolver per reader · the switch
is never read · the writers · the resolver as a function · fail-open · the equivalence proof · the
variants.

| Variant | The bug it reinstates |
|---|---|
| V1 | `/api/slots` stops resolving per van — the customer grid uses the truck average |
| V2 | **order acceptance** stops resolving per van — the worst of the set |
| V3 | `/api/orders/submit` builds `catConfigs` without the van it already resolved |
| V4 | a truthiness test makes "counts = false" unsettable — the `buzzer_count` bug again |
| V5 | the first edit stops seeding from the effective values, so batch silently nulls |
| V6 | "Same as Van 1" **merges** instead of replacing — it claims "same" while a category differs |
| V7 | the Dashboard card writes with **no van**, which is how it edited the truck before |
| V8 | the migration gains a **backfill** — every van on every truck becomes independent at once |
| V9 | an order-path reader starts naming `same_as_first_van` |
| V10 | the resolver stops returning the same object when there are no rows (breaks equivalence at its root) |
| V11 | a missing table **throws** instead of degrading — ordering breaks before the migration |

**Two variants had to be fixed because they passed.** V10's first draft removed only the empty-map
short-circuit, and `if (!own) return category` still returned the same object; V11's first draft threw
inside the `try`, which the catch swallowed and turned back into a clean degrade. A variant that does
not reproduce its bug is worse than none, because it reports a guard as proven. Both now break the
behaviour they claim to.

### 8.2 `scripts/schedule-graphics-places.cjs` — **229 checks, 59 variants, all pass**

Part B's assertions inverted with the move: the card must now be in the pane below Notes and must
**not** be in the footer, the footer must hold only the buttons, and the van must show via
`cornerAction`.

Two guards needed honest repair rather than new entries:

- **The A.4 "nothing was built" check** asserted that `same_as_first_van` appeared nowhere. That was
  correct on 3 October and is now the opposite of the truth. It inverts: A.4 **is** built, its own
  harness exists and is registered. What it still pins is the boundary that must not move — the Menu
  tab writes the truck default.
- **The "no line was lost" guard** (added after I dropped 189 lines in the last build) was pinned at
  `197cb8c` and compared exact strings. Moving one commented block produced 21 "lost lines" that were
  all comment prose, and 11 more that were real code at a **different indentation**. It now strips
  block comments properly, compares **trimmed** lines, and is re-pinned to `719ac91`. Indentation is
  not what it protects; a line that genuinely goes still goes. The trade, stated in the file: a
  comment-only deletion is no longer caught — the 189 lines were a modal, two modals, a picker and a
  card, all code.

### 8.3 Two slot-interval harnesses — over-specific matches, intent preserved

Both broke on correct changes and were made to assert what they mean:

- `slot-interval-settings.cjs` matched the two interval fields **followed by the interface's closing
  brace**, so it broke when `Van` gained `categorySettings` and `same_as_first_van`. Now presence,
  not position.
- `slot-interval-van-list-tolerance.cjs` pinned the exact return literal
  `{ vans, intervalsAvailable: intervals.ok }`, so it broke when `get_vans` gained `firstVanId` and
  `perVanCategoriesAvailable`. Now it asserts the flag is still reported — **and**, added, that the
  per-van additions are merged *onto* that list rather than replacing it.

### 8.4 Layout, measured in **WebKit and Chromium**

| | 1440×900 | 820×1180 |
|---|---|---|
| Footer height (was 100px with the preview in it) | **65px** | **65px** |
| Preview visible without scrolling the filled form | ✓ (bottom 692, pane bottom 790) | ✓ (bottom 706, pane bottom 1056) |
| …and the pane did not have to scroll to reveal it | ✓ | ✓ |
| Preview spans the form pane | 588px of 592px | ✓ |
| Form pane not cramped | 653px | ✓ |
| Cancel / Add event in the footer, inside it | ✓ | ✓ |

Everything in the fixtures is **lifted from the real source** (`lift()` throws if a class list
changes), including the new `data-preview-pane` wrapper. The Settings sticky-bar measurements from
the previous build still pass unchanged, both depths flush at rest and the banner case not
overlapping.

### 8.5 Repo-wide

- `npx tsc --noEmit` — clean.
- ESLint on added lines — **no error on any of the 906 lines this build added.** Two `catch (e: any)`
  I had written (the file's surrounding idiom) were typed properly rather than inheriting a lint
  error.
- `node scripts/run-harnesses.cjs` — **83 run · 83 passed · 0 failed.**
- **One honest note on the sweep:** an earlier run reported `add-order-refresh.cjs` failing. It
  passes in isolation and passed on the clean re-run; that harness takes ~60s and is timing-sensitive,
  and it was competing with a concurrent ESLint run for CPU. I re-ran the sweep with nothing else
  running to get the 83/83 above, rather than reporting the first number.
- `truck_events` guarantees from `docs/schedule-places-report.md` §3 — still asserted, still passing.
- The schema census now covers `van_category_settings`, which it may because the table is created by
  a migration and therefore fully described there.

---

## 9 · Test list for localhost — Village Spice with two vans

Start at `http://localhost:3000/login`. **Village Spice only.** Do not open Pizzeria Gusto.

**Run the migration first** (§3). Without it the per-van controls still render but refuse to save and
say so, and every van reads the truck default — which is the correct pre-migration behaviour, not a
bug to chase.

1. **Add a second van.** Manage › Settings › Truck settings → **Add van**, name it "Van 2".
2. **Baseline.** Note Van 1's Prep and Items for one cooking category (say Pizza). Van 2 should show
   **the same numbers** — it has no rows of its own yet, so it is reading the truck default.
3. **Change Van 2's prep time.** Set Pizza's Prep on **Van 2** to something distinct (say 10 min).
4. **Confirm Van 1 did not move.** Scroll to **Van 1** — Pizza's Prep must be unchanged. *This is the
   bug this build exists for; if both moved, stop and tell me.*
5. **Reload the page.** Both values must persist: Van 2 at 10 min, Van 1 at its original.
6. **Confirm only that field moved on Van 2.** Van 2's Pizza **Items** and its "Counts to total
   capacity" ticks must be exactly what they were in step 2 — the row was seeded from the effective
   values, so touching Prep must not have changed the other two.
7. **The Menu tab is still the truck default.** Manage › Menu → edit a category whose Prep **no van
   has overridden** (not Pizza) and change its Prep. Both vans' cards should follow it. Then change
   Pizza's Prep in the Menu tab: **Van 2 must not move** (it has its own value), and Van 1 should.
8. **Turn on "Same as Van 1"** on Van 2. Its settings **collapse** and a line says it follows Van 1.
9. **Confirm it copied.** Turn it **off** again and check Van 2's values — Pizza's Prep should now be
   **Van 1's** value, not the 10 min from step 3. That is the copy, and it is kept. Turn it back
   **on**.
10. **Change Van 1 and confirm Van 2 follows.** With the switch still on, change Van 1's Pizza Prep
    and its **Total capacity**. Turn Van 2's switch off and check both — Van 2 should hold Van 1's new
    values.
11. **Turn it off and confirm Van 2 keeps them.** Leave it off, reload, and check Van 2 still holds
    those values. Then change Van 1 again — **Van 2 must not move** any more.
12. **Van 2's name and screen survived.** Van 2 must still be called "Van 2" (the name is not copied),
    and its KDS link must still be its own.
13. **The order path agrees — the point of all of it.** Put an event on **Van 2** today, with a prep
    time clearly different from Van 1's. Open the customer order page for that event and check the
    collection times reflect **Van 2's** prep/batch. Then switch the event to **Van 1** and confirm
    the grid changes accordingly.
14. **The Dashboard card is per van too.** Open the Dashboard on an event assigned to **Van 2**, open
    Kitchen capacity, change a Prep there, and confirm Manage shows it on **Van 2 only**.
15. **An event with no van.** Put an event on no van and confirm the customer page still offers times
    — it should read the truck defaults, exactly as today.
16. **The preview, desktop/iPad.** Schedule › Add event. The live card is in the **form pane below
    Notes**, full width, under a muted "Preview", with **no** card in the footer — just Cancel and Add
    event. Pick a place and a van: the **van appears** in the card's top-right. With the form empty it
    must read "Where are you trading?" / "Pick a date" / `--:--`, never "undefined" or "Invalid date".
17. **The preview needs no scrolling.** Fill every field at iPad width (820×1180) and confirm the
    preview is visible without scrolling the form.
18. **The preview, phone.** At 390px the pinned place card is still the preview line (place · date ·
    times · van) and there is **no** second preview in the pane.

---

## 10 · Noticed, not changed

1. **`buildCatConfigs` defaults an absent `batch_size` to 999; `/api/slots` and `/api/dashboard`
   default it to 1.** Same three columns, two different meanings for "unset", on the paths that decide
   acceptance (999) and what the customer is shown (1). Pre-existing, and preserved exactly — the
   equivalence proof asserts it. It looks like a real inconsistency worth a decision, but changing it
   would alter order acceptance, which is not this build's business.
2. **`menu_categories` has no `is_active` filter in `buildCatConfigs` or `/api/slots`,** while
   `/api/dashboard` filters `.eq('is_active', true)`. So a deactivated category still contributes prep
   and batch to acceptance but not to the board. Pre-existing; untouched.
3. **The truck-level editors are not labelled as defaults.** Manage › Menu and the Dashboard category
   editor now set the **default** for vans without their own values, and neither says so. The brief
   said not to change their wording, so I did not. A single muted line ("used by any van without its
   own settings") would make the model visible; it needs your wording.
4. **The per-van card gives no sign that a value is inherited rather than its own.** A van reading the
   truck default looks identical to one with an override of the same number. A small "inherited" hint,
   or a "reset to default" action, would make the model legible — out of scope here.
5. **`event_category_stock` keys categories by NAME, not `category_id`,** while this feature keys by
   id. Two categories renamed into each other would carry each other's per-event stock. Pre-existing
   and unrelated, but it is the hazard that made me key per-van settings by id.
6. **`app/manage/[token]/page.tsx` is ~14,900 lines** and `app/dashboard/[token]/page.tsx` is larger
   still. The van card and the Kitchen capacity grid are now duplicated between them (same controls,
   two implementations, two writers that had to be fixed separately for this build). A shared
   component for that grid would have made this a one-place change.
7. **`same_as_first_van` has no UI on the Dashboard's van card** — only in Manage. A following van
   edited from the Dashboard will drift from the first van until the first van is next edited. That is
   consistent with the switch living in Manage, but worth knowing.
8. **The two leaked `git worktree` entries** I found (`slot-head-dots-*` at `fc0fddc`, both prunable)
   were left by an earlier harness run and I pruned them. A harness that fails between
   `worktree add` and `worktree remove` leaks one; `slot-interval-dots.cjs` could remove its worktree
   in a `finally`.

---

## 11 · Standing rules observed

- Worked only on `schedule-graphics`; `git branch --show-current` → `schedule-graphics` before
  committing. Nothing pushed to, merged into, or rebased onto `main`.
- **No SQL run.** The migration is written and is applied by hand after review; §3.3 gives read-only
  verification selects, one per block.
- Village Spice only. Pizzeria Gusto not touched and not used for any check — the equivalence proof
  runs on fixtures, not on a live truck.
- No key printed.
- No local bundle build used to prove a deploy. One build was run so the render harness measured real
  Tailwind output rather than stale CSS.
- No background polls or waits.
- `docs/settings-and-preview-report.md` read first (§4 is the finding this build fixes). Every change
  from that build and from `d058162` / `719ac91` is intact, including the sub-tab bar styling, the
  Settings section order, the logo inside Truck details and the `:has()` padding rule — all still
  asserted and all still passing.
