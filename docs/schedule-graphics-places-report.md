# Schedule graphics, stage 1: the section shell, the plan gate, and places with their Facebook groups

**3 October 2026 · built on `6d951a5`, shipped as `d9e3484`**
**⏳ One migration is NOT applied.** `supabase/migrations/20261003_truck_places.sql` — two tables and
one column. It is in §2 and in the chat reply. **Until it is applied the tab fails closed**: the places
read errors and the tab says so. Nothing else is affected.

**Stage 2 (design upload + image generator) and stage 3 (posting checklist) are not started.** The
Design and This week sections are "Coming next" placeholders, asserted as empty by the harness.

**No SQL was run. `truck_events` and `venues` were not written, anywhere.** Nothing in this build
touches ordering, KDS, payments or the public schedule page.

> Nothing in the prompt arrived garbled, and nothing in it contradicted anything else.

---

## 1 · What was built

| | |
|---|---|
| **Section shell** | `components/manage/ScheduleGraphicsTab.tsx` — heading, three tabs, two placeholders |
| **Shared matching** | `lib/schedule-graphics/places.ts` — the normaliser, the matching, "next", the wording chain, the seed plan |
| **Tables** | `truck_places`, `truck_place_groups`, `trucks.default_group_post_wording` |
| **API** | four actions in `app/api/manage/route.ts`: `sg_places`, `sg_upsert_place`, `sg_upsert_group`, `sg_delete_group` |
| **Gate** | `Feature` `'schedule_graphics'` in `lib/features.ts` → `PRO_FEATURES` |
| **Nav** | `app/manage/[token]/page.tsx` — a tab beside Schedule |
| **Harnesses** | `scripts/schedule-graphics-places.cjs` (79 checks, 14 broken variants) · `scripts/schedule-graphics-render.cjs` (layout, two engines) |

---

## 2 · The migration

⚠️ **Not applied.** Run it when you are ready. Idempotent, so re-running is safe. **The last line is
not optional** — without it PostgREST serves its cached schema, every read returns PGRST205, and the
tab shows its load error on correct code.

```sql
set lock_timeout = '3s';

begin;

create table if not exists public.truck_places (
  id uuid primary key default gen_random_uuid(),
  truck_id text not null references public.trucks(id) on delete cascade,
  venue_id uuid references public.venues(id) on delete set null,
  name_key text not null,
  name text not null,
  short_name text,
  address text,
  postcode text,
  group_post_wording text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint truck_places_name_not_blank check (length(btrim(name)) > 0),
  constraint truck_places_key_not_blank  check (length(btrim(name_key)) > 0)
);

create unique index if not exists truck_places_truck_name_key_uidx
  on public.truck_places (truck_id, name_key);

create unique index if not exists truck_places_truck_venue_uidx
  on public.truck_places (truck_id, venue_id)
  where venue_id is not null;

create index if not exists truck_places_truck_idx on public.truck_places (truck_id);

create table if not exists public.truck_place_groups (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.truck_places(id) on delete cascade,
  truck_id text not null references public.trucks(id) on delete cascade,
  name text not null,
  url text not null,
  rules text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint truck_place_groups_name_not_blank check (length(btrim(name)) > 0),
  constraint truck_place_groups_url_not_blank  check (length(btrim(url))  > 0)
);

create index if not exists truck_place_groups_place_idx on public.truck_place_groups (place_id, sort_order);
create index if not exists truck_place_groups_truck_idx on public.truck_place_groups (truck_id);

alter table public.truck_places enable row level security;
drop policy if exists "service_role only" on public.truck_places;
create policy "service_role only" on public.truck_places
  for all to service_role using (true) with check (true);
revoke all on public.truck_places from anon, authenticated, public;

alter table public.truck_place_groups enable row level security;
drop policy if exists "service_role only" on public.truck_place_groups;
create policy "service_role only" on public.truck_place_groups
  for all to service_role using (true) with check (true);
revoke all on public.truck_place_groups from anon, authenticated, public;

alter table public.trucks
  add column if not exists default_group_post_wording text;

comment on column public.trucks.default_group_post_wording is
  'Default wording for Facebook group posts about this truck''s dates, with the tokens {place} {day} {date} {times} {order link}. NULL = use the built-in default (DEFAULT_GROUP_POST_WORDING in lib/schedule-graphics/places.ts). Overridden per place by truck_places.group_post_wording; the chain is resolved by effectiveGroupPostWording() and nowhere else.';

commit;

notify pgrst, 'reload schema';
```

### Verification selects — read-only, one per block

**(a) The two tables exist with the columns above.** 🧪 Expect 11 rows for `truck_places` and 9 for
`truck_place_groups`.

```sql
select table_name, column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('truck_places', 'truck_place_groups')
 order by table_name, ordinal_position;
```

**(b) 🔴 `truck_id` IS TEXT ON BOTH.** `trucks.id` is text — live ids are slugs. 🧪 Expect two rows,
both `text`.

```sql
select table_name, column_name, data_type
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('truck_places', 'truck_place_groups')
   and column_name = 'truck_id';
```

**(c) The two unique indexes the idempotent seed depends on.** 🧪 Expect
`truck_places_truck_name_key_uidx` (unique) and `truck_places_truck_venue_uidx` (unique, partial).

```sql
select indexname, indexdef
  from pg_indexes
 where schemaname = 'public' and tablename in ('truck_places', 'truck_place_groups')
 order by tablename, indexname;
```

**(d) RLS is on and the default grants are gone.** 🧪 Expect `rowsecurity = true` for both, one
`service_role` policy each, and **no** rows for anon/authenticated in the grants query.

```sql
select c.relname, c.relrowsecurity as rowsecurity,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in ('truck_places', 'truck_place_groups');
```

```sql
select table_name, grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name in ('truck_places', 'truck_place_groups')
   and grantee in ('anon', 'authenticated', 'public')
 order by table_name, grantee;
```

**(e) The truck-level wording column.** 🧪 Expect one row, `text`, nullable, and `set_trucks = 0`
until something writes it.

```sql
select column_name, data_type, is_nullable
  from information_schema.columns
 where table_schema = 'public' and table_name = 'trucks'
   and column_name = 'default_group_post_wording';
```

```sql
select count(*) as trucks,
       count(default_group_post_wording) as set_trucks
  from public.trucks;
```

**(f) After opening the tab on Village Spice — what the seed produced.** 🧪 Expect one row per
distinct pitch in its last 12 months plus future dates, `anchored` counting those with a `venue_id`.

```sql
select p.truck_id,
       count(*)                                as places,
       count(p.venue_id)                       as anchored,
       count(*) filter (where p.venue_id is null) as name_only
  from public.truck_places p
 group by p.truck_id
 order by p.truck_id;
```

**(g) 🔴 THE DUPLICATE CHECK. This is the query that matters** — it must return **no rows**, both
before and after a refresh.

```sql
select truck_id, name_key, count(*) as rows
  from public.truck_places
 group by truck_id, name_key
having count(*) > 1;
```

**(h) `truck_events` and `venues` are untouched.** 🧪 Run before applying and after using the tab;
both numbers must be identical. Nothing in this stage writes either table.

```sql
select (select count(*) from public.truck_events) as events,
       (select max(updated_at) from public.truck_events) as events_last_updated,
       (select count(*) from public.venues) as venues;
```

---

## 3 · The access pattern, and where each decision lives

| what | which pattern | file |
|---|---|---|
| **Table access** | 🔴 **RLS on + one `service_role` policy + the default grants REVOKED.** Copied from `whatsapp_alerts`, which is the most recent operator-owned table. | pattern: [`supabase/migrations/20260916_whatsapp_alerts.sql`](../supabase/migrations/20260916_whatsapp_alerts.sql) · mine: [`20261003_truck_places.sql`](../supabase/migrations/20261003_truck_places.sql) |
| **Caller authentication** | `resolveTruckAccess(req, truck)` — deny-by-default, resolves the operator's role from the session, refuses token-only access. | `app/api/manage/route.ts:137` |
| **Per-truck settings** | 🔴 **A column on `trucks`.** There is no settings blob to join: `sound_config`, `print_trigger_mode`, `completion_presses`, `hide_pricing` and `allergen_display_mode` are all columns on that table. | `trucks.default_group_post_wording` |
| **Plan gate** | `canAccess(plan, feature, overrides, trialExpiresAt)` server-side per action, `FeatureGate` in the panel. Same shape as `save_embed_setup`. | `lib/features.ts` · `components/FeatureGate.tsx` |
| **Nav** | the `allTabs` array, beside Schedule | `app/manage/[token]/page.tsx:648` |

⚠️ **The third defence is the one that does the work.** Enabling RLS alone leaves Supabase's default
grants in place, so the capability is still reachable with the anon key and merely default-denied. The
`revoke` removes it. A broken variant drops the revoke and the harness fails.

⚠️ **The actions went into `app/api/manage/route.ts`, not a sub-route.** `resolveTruckAccess`, the
staff gate and the audit actor are **local to that file and not exported**; a sub-route would have had
to duplicate the authentication, which is the one thing worth not duplicating. The embed and
custom-domain features added their actions there for the same reason.

⚠️ **`sg_places` is on the staff-blocked list even though it reads like a read** — opening the tab
seeds rows, so it is a write. The tab is owner/manager, so staff never reach it; the list is the half a
request cannot skip.

---

## 4 · The matching, and the one rule stages 2 and 3 will import

🔎 `lib/schedule-graphics/places.ts`. 🔴 **One module, because the image generator and the posting
checklist ask the same question.** A second normaliser would not throw and would not warn — events
would simply stop finding their place, and the graphic would come out with a correct heading and an
empty week. The harness asserts exactly one definition exists across `lib/`, `app/` and `components/`.

### `normalisePlaceName`

Lower-case → accents folded → `&` → ` and ` → apostrophes **deleted** → every other punctuation mark
→ a **space** → whitespace collapsed → trimmed.

⚠️ **The order is load-bearing in three places**, and each is a test:

| | why |
|---|---|
| `&` becomes ` and ` **before** punctuation is stripped | stripped first, "Bull & Butcher" → "bull butcher", which never meets "Bull and Butcher". The spaces are what make `B&B` → `b and b` rather than `band`. |
| apostrophes are **deleted**, not spaced | "Bull's Head" → `bulls head`; spaced it is `bull s head`, which matches nothing a person types |
| every other mark becomes a **space**, not nothing | "Bull-and-Butcher" and "St.Mary's Hall" are separator cases; deleting the mark gives `bullandbutcher` |

⚠️ **Accents fold** (`Café` → `cafe`). The one rule not in the brief's list: the scraper's source decides
which spelling arrives, and this can only merge names a person would call identical, never split one.

### Matching

```
event.venue_id = place.venue_id   (when both are set)
else  normalise(event.venue_name) = place.name_key
```

🔴 **The anchor wins when both sides have one — including when the ids DISAGREE, which is a deliberate
`false`.** Two venue rows that happen to share a name are two places; letting the name override the
anchor would put two villages' dates on one poster. `placeForEvent` therefore scans **anchors first**,
because a truck can have an anchored place and a hand-typed one whose names normalise identically.

### "Next"

The soonest event whose `event_date >= today` **in the truck's own timezone** and whose status is
neither `cancelled` nor `closed`.

- ⚠️ **`unconfirmed` counts.** It means "not reviewed yet", not "not happening" — which is the normal
  state of most scraped dates.
- ⚠️ **Today counts as upcoming.** The label reads "next: Tue 13 Oct"; excluding today would show the
  operator next week while they are standing at tonight's pitch.
- ⚠️ **String comparison, never `new Date(str)`.** `event_date` is a date-only column; parsing it into a
  `Date` makes it UTC midnight, which renders as the previous day west of London.

### The wording chain

`place.group_post_wording` → `trucks.default_group_post_wording` → `DEFAULT_GROUP_POST_WORDING`.
One function, `effectiveGroupPostWording`, so "blank means the truck default" is true on every surface.
**Blank means whitespace-or-empty**, not just null: an operator who selects the text and deletes it
leaves `''`, and that is the same intention.

🔴 **Stage 1 ships no editor for the truck-level default, and that is a gap worth naming.** The approved
mockup's Card 3 is the **per-place override**; it specifies no surface for the truck default. So the
column is added and read — the per-place box shows the effective default **as its placeholder**, which
is what makes "blank = the default" visible rather than a rule you have to be told — but nothing writes
it yet. It is not a dead column (it is in the resolution chain and in the response); it simply has no
UI until a stage that asks for one.

---

## 5 · Auto-creating places, and the two things that could go wrong

Opening Places & groups seeds a place per distinct pitch in **the last 12 months plus every future
date**, from the truck's own events. Seeded: `name` from `venue_name`, `address` preferring
`venue_address` over `address`, `postcode`.

### 🔴 Idempotency is the DATABASE's answer, not the code's

`unique (truck_id, name_key)` + `on conflict (truck_id, name_key) do nothing`. Two tabs opening at the
same instant **both** read nothing, **both** insert, and Postgres decides there is one row. A
check-then-insert in the route would be the classic race and would produce a duplicate place on a
double-tap. The harness runs two plans against the **same "before" state** — which is what two tabs
actually do — and asserts one row with the loser's inserts dropped.

⚠️ **`ignoreDuplicates` is what makes it `do nothing` rather than `do update`.** An update on conflict
would overwrite `name` — the operator's edit — on every refresh. A broken variant drops it.

### 🔴 An operator's edit survives because the seeder never writes those fields twice

`name` and `short_name` are written **once, on insert, and never again**. Not "only when they differ" —
never. That makes the requirement structural rather than a comparison that can be got wrong.

`address` and `postcode` are filled **only when blank**, each by its own statement with its own
`.is(col, null)`, so a combined update cannot overwrite an address because the postcode happened to be
empty.

⚠️ **The documented limit of the blank-only rule:** an operator who deliberately *clears* the postcode
will see it refilled on the next open. With only the brief's columns there is nowhere to record
"deliberately empty". The **name** is what the requirement protects and the name is never rewritten.
This is asserted in the harness so the behaviour is on the record rather than a surprise.

### 🔴 A hand-typed place the schedule later anchors is ADOPTED, not duplicated

They type "Lavenham Village Hall"; a scraped event arrives later anchored to that venue with the same
name. Without this the insert would collide on `name_key` and the anchor would be lost for ever. The
plan sets `venue_id` on the existing row — guarded by `.is('venue_id', null)` so a second tab cannot
overwrite an anchor — and their name and short name stay theirs.

### 🔴 Two venues, one name: one place stands, the other is reported

Two different `venue_id`s whose `venue_name`s normalise identically ("Village Hall" in two villages)
want one `name_key` between them. **The second is not created, by design.** A duplicate place is worse
than a missing one — stages 2 and 3 would generate two graphics and two posting rows for one pitch.
Guessing would either merge two real places or invent a suffix the operator never chose, so the
collision is logged and one place stands. Add the second by hand with a name that tells them apart.

### 🔴 Renaming a place does NOT re-derive `name_key`

The easiest thing to get wrong here. `name_key` is what the truck's **events** say; "Name on posts" is
what the operator wants the public to read. Re-keying on a rename would silently orphan every event at
that place — the list row would survive with no dates under it and no error anywhere. A broken variant
adds the re-derivation and the harness fails.

---

## 6 · The plan gate, and why no marketing row was added

The Feature `'schedule_graphics'` is in **`PRO_FEATURES`**, which is exactly "Pro, Max and trial":
`MAX_FEATURES` spreads that array and `TRIAL_FEATURES` spreads `MAX_FEATURES`. One entry grants all
three (and `tester`/`demo`, the internal and sandbox tiers, which also spread those sets).

🔴 **A locked plan sees the tab.** The gate wraps the panel's **content**, not the nav entry, so a
Starter truck gets the section, its three tabs, and one line: *"Schedule graphics is on Pro and Max"*.
Filtering the tab out of `allTabs` would hide the product from the only people who might buy it. The
App Store CTA suppression is inherited from `FeatureGate` rather than restated.

### 🔴 `findPlanParityViolations` does NOT require a row, and this was checked rather than assumed

The brief's instruction was conditional: *"If adding this gate makes that guard require a
marketing/comparison row, add the row…"*. **It does not.** The checker iterates `FEATURE_SECTIONS`
rows and `continue`s on any row with no `ROW_FEATURE_MAP` entry, so **a Feature with no row cannot
produce a violation**. The precedent is `embed_schedule`, which carried no row for weeks and whose
comment in `lib/features.ts` says so.

**Verified, not reasoned:** the checker was compiled and run after adding the Feature —
`findPlanParityViolations()` returns **0 violations**. So **no row was added and no marketing copy was
changed**. The gate is enforcement; the comparison table is presentation, and stage 1 ships no public
surface to advertise. When stage 2 or 3 ships something a prospect can see, the row
*"Weekly schedule graphics for social media"* (`coming_soon`) is the one to add — and it will need its
`ROW_FEATURE_MAP` entry **in the same edit**, because a row added without one is advertised and checked
by nothing.

---

## 7 · Harness results

**`node scripts/run-harnesses.cjs` → 82 run · 82 passed · 0 failed.** ESLint on every changed file:
**0 new errors, 0 new warnings** (checked line-by-line against the diff's added ranges — the two large
pre-existing files carry their own backlog, and none of it is inside my lines). `tsc --noEmit` clean.

### `scripts/schedule-graphics-places.cjs` — ✅ 79 checks, registered

| suite | covers |
|---|---|
| **1 · the normaliser and the matching** | the brief's cases, plus `B&B`, apostrophes, hyphens, accents, tabs/newlines, and the empty key that must match *nothing* rather than everything · the anchor beating the name in both directions · `placeForEvent` with the anchored place deliberately **second** in the list, so a single-pass `find` would fail · cancelled/closed/unconfirmed/today for "next" · the three-level wording chain |
| **2 · the seed, run twice** | one place per pitch · **a second run plans nothing at all**, and a third is still empty · **two tabs against the same "before" state produce one row** · an edited name, short name, address and wording all survive a re-run, and the re-run plans **no write against that place at all** · a hand-typed place is adopted · one pitch seen with and without an anchor is one place · two venues sharing a name keep one and report the other |
| **3 · the wiring** | the unique indexes · `ignoreDuplicates` · the `.is(col, null)` guards · **`truck_events` and `venues` are read-only, asserted from both the migration and the route** · the gate on all four actions · the nav entry's position, and that the existing eight tabs keep their relative order · exactly one normaliser in the tree · RLS/revoke on both tables · every write scoped by `truck_id` · stage 2/3 genuinely absent (no file input, no canvas, no checklist) |

### The broken variants — **14, each must fail**

| | |
|---|---|
| **W1–W5** | the normaliser stops collapsing whitespace · stops mapping `&` · deletes punctuation instead of spacing it · **the name beats the venue anchor** · a cancelled date is offered as "next" |
| **W6–W8** | **the seeder rewrites `name` on every run** · a hand-typed place is duplicated instead of adopted · the 12-month window is dropped |
| **W9–W14** | `ignoreDuplicates` dropped · **the unique index removed from the migration** · an action loses its plan gate · a rename re-derives `name_key` · the RLS revoke is dropped · a write loses its `truck_id` scope |

⚠️ **One variant had to be rewritten.** W8's first form wrapped the window filter in `true || (` and
produced a **syntax error** — which `buildLib` exits on, so the harness reported a compile failure
instead of proving anything. A variant must still compile to be a variant; it neuters the comparison
instead.

### `scripts/schedule-graphics-render.cjs` — ✅ layout measured in **both** engines

Not in the sweep — it needs a completed build and local browsers, and a sweep that silently skipped
when either was missing would report green for a layout nobody measured. It is in
`harnesses.json`'s `needs_a_browser` group with the other render harnesses, and is run by hand.

🔴 **WebKit as well as Chromium, because the device is an iPad and the browser is Safari.** Chromium
from puppeteer, WebKit from Playwright. **Both ran. They agree to the pixel:**

| viewport | Chromium | WebKit |
|---|---|---|
| **1440×900** | list 288@x224 · detail 688@x528, shared top edge | identical |
| **820×1180** (iPad portrait) | list@89 (788) **above** detail@487 (788) | identical |
| **390×844** (phone) | list@89 (358) **above** detail@487 · cards 487 → 797 → 1151 | identical |

Asserted in both: no horizontal page scroll at any width; the three add-group inputs **stacked one per
row on a phone** and three across from `sm`; the four identity fields one per row on a phone and two
rows of two on desktop; the section tabs never widen the page.

⚠️ **`lg:` not `md:` — measured, not assumed.** An iPad in portrait is 820px and therefore **stacks**,
deliberately: the detail pane carries a three-input add row and 820px is not enough for it beside a
288px list. "md or lg" is exactly the kind of decision that is right in the source and wrong on the
device, so it is a measurement.

🔴 **And a control.** The same fixture with the responsive grid replaced by a plain `grid-cols-1` must
**stack at 1440** in both engines. Without it the three stacking assertions would pass on a component
that never had a two-column layout, and the file would be measuring that one column is one column.
There is also a staleness guard: if the compiled CSS has no `grid-cols-[18rem_1fr]` rule, the harness
**throws** rather than measuring against a build that predates the component.

### 🔴 A problem I hit, and its root cause

**The schema census flagged `truck_places.website` — a column no write names.**

**Root cause:** the census's write-payload reader (`payloadKeys` in
`scripts/_outreach-schema-census.cjs`) resolved an identifier payload by scanning **the whole file**
with a regex for `<name>.<prop> =`. `app/api/manage/route.ts` has **five** locals called `patch`, so
the embed handler's `patch.website = url` (line 1027) was attributed to the schedule-graphics
`truck_places` update 1,600 lines away.

**Fixed at the cause**, not worked around by renaming my variable: the declaration is resolved by
**scope** — nearest enclosing, walking outward from the use site, not descending into nested functions
— and the assignments are collected off the **AST** within that scope only.

🔴 **A false positive is as bad as a miss here.** The census's whole value is that a finding means
something; one that cries wolf on correct code is one that gets waived, and the waiver is where the
next real `preview` hides. **Both halves are proved** (`scripts/outreach-schema-census.cjs`, now 40
checks): a **new broken variant V9b** puts a bad column in a `patch.<col> =` whose declaration is one
of five in the file and the census must catch it; and a **control** asserts that no sibling handler's
`patch` leaks `website` / `embed_enabled` / `preorder_enabled` onto `truck_places`, while the
schedule-graphics update's own six keys **are** read — so the reader is scoped, not blind.

⚠️ **The two new tables were added to the census at creation**, so this feature has never had a column
named in a select that does not exist. Only tables whose `create table` is in `supabase/migrations/`
may be added — `trucks`, `truck_events` and `venues` predate the directory, so adding one would report
every column it names as missing.

---

## 8 · What to check on Village Spice after deploy

🔴 **Village Spice only. Pizzeria Gusto must not be touched** — it is a live trading truck, and opening
this tab on it would write place rows.

**Apply the migration first (§2); the tab fails closed without it.**

1. **Open Manage → Schedule graphics.** The heading and three tabs are there; **Design** and **This
   week** both read "Coming next".
2. **Places & groups loads with a list.** One row per place in Village Spice's last 12 months plus
   future dates. Each row shows the name and either *"No groups yet"* in orange or *"n groups · next:
   Tue 13 Oct"*.
3. 🔴 **Refresh the page twice.** The list must be **identical** — same places, same count, no
   duplicates. Then run verification query **(g)**: it must return **no rows**.
4. 🔴 **Open the tab in two browser tabs at once**, both on Village Spice. Still no duplicates; query
   **(g)** still empty.
5. 🔴 **Rename a place** ("Name on posts") and give it a **Short name**, then refresh. **Both survive.**
   This is the one that would fail silently if the seeder wrote names twice.
6. **Add a Facebook group** — paste a link, give it a name, add *"Business posts Fridays only"* as
   rules. It appears with **Open** and **Edit**. Press **Open**: it opens the group in a new tab.
7. **Press Edit** on that group: the same three fields appear in place, with **Save**, **Cancel** and
   **Remove**. ⚠️ *Remove lives inside Edit on purpose* — the mockup's row carries Open and Edit only,
   and a delete button beside an Open button is one mis-tap from losing a group.
8. **Paste something that is not a link** into the group link box and press Add. It is **refused** with
   *"That doesn't look like a link"* — nothing is stored.
9. **Card 3, "Wording for group posts":** the empty box shows the **default wording as placeholder
   text**, and the token line under it reads `{place} · {day} · {date} · {times} · {order link}`. Type
   your own wording, refresh — it is still there. Clear it — the placeholder returns.
10. **"+ New place"**, typing the name of a place **already in the list**. It must select that place
    rather than showing an error or creating a second row.
11. 📱 **On a phone.** The list is **above** the selected place's cards, the three add-group inputs are
    one per row, and there is **no sideways scrolling**.
12. 📲 **On the iPad, portrait.** Also stacked (list above detail) — that is intended at 820px, not a
    bug. Rotate to landscape: the two panes go side by side.
13. **Plan gate.** On a Starter truck the tab is **still listed** and shows *"Schedule graphics is on
    Pro and Max"* — a message, not an error page.
14. **Nothing else moved.** Query **(h)** before and after all of the above: the `truck_events` and
    `venues` counts and `events_last_updated` must be **identical**.

---

## 9 · Noticed, not changed

- **`lib/plan-features.ts:606` names a "schedule generator" as a marketing-only row.** There is no such
  row in `FEATURE_SECTIONS` — the nearest is *"Automatic schedule import"*, which is the scraper. The
  comment is stale. Left alone: the brief says not to change marketing copy, and this is a comment
  about rows rather than a row.
- **`truck_events` and `venues` have no `create table` in `supabase/migrations/`.** They predate the
  directory, so the schema census cannot cover them — which means a non-existent column named in a
  select on either is still invisible to it. Backfilling their definitions is a real piece of work and
  a separate change.
- **`scripts/_outreach-schema-census.cjs` is now named more narrowly than its contents** (it covers two
  schedule-graphics tables). Renaming it means touching two harnesses and two reports.
- **`app/manage/[token]/page.tsx` is 13,924 lines** and carries 283 pre-existing ESLint errors; the
  tab components are being extracted into `components/manage/` one at a time (Payments is done, and
  this feature went straight there). None of that backlog is inside this build's lines.
- **No place picker in the event form**, and nothing changed about how events are created or edited —
  out of scope, as stated. The consequence worth knowing: a pitch typed into the schedule with a
  slightly different name becomes a **second place** until someone merges them by hand, because the
  name is the only identity an unanchored event has.
- **`sort_order` on `truck_place_groups` is written but never reordered** — groups are appended and
  read in insertion order. A drag-to-reorder control is not in the mockup.
