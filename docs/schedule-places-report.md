# Schedule: sub-tabs, Places on every plan, favourites, merging, and a place picker in Add event

**3 October 2026 · branch `schedule-graphics` · commit `1f98f22`**
**`git branch --show-current` → `schedule-graphics`.** `main` is untouched at `deec9f5` (the revert);
nothing was pushed to, merged into or rebased onto it.

**⏳ One migration is NOT applied** — `supabase/migrations/20261004_schedule_places_stage2.sql`. SQL in
§2 and in the chat reply. **Run `20261003_truck_places.sql` first**; this one alters what that creates.

🔴 **No SQL was run. No existing `truck_events` row was read, rewritten or backfilled.** The one change
to that table is a nullable column with no default — §3 lists every write path checked.

> Nothing in the prompt arrived garbled, and nothing in it contradicted anything else.

---

## 1 · What changed

| | |
|---|---|
| **Navigation** | The separate **Schedule graphics** tab is gone. Pills inside Schedule: **Events · Weekly post · Places**, in the URL as `?section=`. |
| **Events** | The existing component, **body unedited**. |
| **Plan gate** | `schedule_graphics` now gates **only Weekly post**. Places and the picker are on **every plan**. |
| **Facebook groups** | Gone from the code entirely — table, column, both actions, both cards, their checks. |
| **Places** | Favourites / Other places, star toggle, Next/Last line, Area, merge, hide, Show hidden. |
| **Add event** | "Copy a recent event" → a **place picker**. Picking fills five fields + both times. |
| **Data** | `truck_places` +4 columns, `truck_place_groups` dropped, `trucks.event_post_wording` renamed, `truck_events.truck_place_id` added. |

---

## 2 · The migration

⚠️ **Not applied.** Idempotent — the rename is guarded both ways and the check constraint is dropped
before being added, so re-running is safe. ⚠️ **Stage 1 must be applied first.**
⚠️ **`drop table` takes its rows with it.** If you entered Facebook groups, those rows go. That is the
instruction and the feature they belong to no longer exists, but it is not reversible.

⚠️ **The filename is dated the 4th and the work is from the 3rd.** Deliberate: migrations run in
filename order, and `20261003_schedule_…` would sort *before* `20261003_truck_places.sql` and try to
alter tables that did not exist yet.

```sql
set lock_timeout = '3s';

begin;

drop table if exists public.truck_place_groups;

alter table public.truck_places
  drop column if exists group_post_wording;

alter table public.truck_places
  add column if not exists area text,
  add column if not exists is_favourite boolean not null default false,
  add column if not exists is_hidden boolean not null default false,
  add column if not exists merged_into_id uuid references public.truck_places(id) on delete set null;

alter table public.truck_places drop constraint if exists truck_places_no_self_merge;
alter table public.truck_places add constraint truck_places_no_self_merge
  check (merged_into_id is null or merged_into_id <> id);

create index if not exists truck_places_truck_visible_idx
  on public.truck_places (truck_id, is_favourite desc, name)
  where is_hidden = false and merged_into_id is null;

comment on column public.truck_places.merged_into_id is
  'Set when this place has been merged into another: its events resolve to the target instead. Hiding is set alongside it, so a merged place leaves the list. Chains are followed by resolvePlaceMerge() in lib/schedule-graphics/places.ts with a depth cap of 10; self-merge is refused by truck_places_no_self_merge. NULL = not merged.';

comment on column public.truck_places.is_hidden is
  'Hidden from the Places list unless "Show hidden places" is on. A display decision only — a hidden place still matches its events and still counts towards Next/Last. Set to true automatically when a place is merged.';

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'trucks'
       and column_name = 'default_group_post_wording'
  ) and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'trucks'
       and column_name = 'event_post_wording'
  ) then
    alter table public.trucks rename column default_group_post_wording to event_post_wording;
  end if;
end $$;

alter table public.trucks
  add column if not exists event_post_wording text;

comment on column public.trucks.event_post_wording is
  'Template for the per-event post text, with the tokens {place} {day} {date} {times} {order link}. Renamed from default_group_post_wording on 3 October 2026 when Facebook groups were removed. NULL = not set. NOTHING READS IT YET — the per-event post UI is a later stage.';

alter table public.truck_events
  add column if not exists truck_place_id uuid references public.truck_places(id) on delete set null;

create index if not exists truck_events_truck_place_idx
  on public.truck_events (truck_place_id);

comment on column public.truck_events.truck_place_id is
  'The truck_places row the operator picked in Add event. Written ONLY on insert by that modal; never written by the scraper, the upload-schedule flow, or any edit/status path. NULL on every scraped event and every event created before 3 October 2026, which is normal — matching then falls back to venue_id and then to the normalised venue_name. on delete set null: deleting a place must never delete a trading record.';

commit;

notify pgrst, 'reload schema';
```

### Verification selects — read-only, one per block

**(a) `truck_place_groups` is gone and `group_post_wording` with it.** 🧪 Expect **no rows** from both.

```sql
select table_name from information_schema.tables
 where table_schema = 'public' and table_name = 'truck_place_groups';
```

```sql
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'truck_places' and column_name = 'group_post_wording';
```

**(b) The four new place columns.** 🧪 Expect 4 rows; both booleans `NO` / `false`, the other two
nullable.

```sql
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'truck_places'
   and column_name in ('area', 'is_favourite', 'is_hidden', 'merged_into_id')
 order by column_name;
```

**(c) 🔴 The self-merge CHECK.** 🧪 Expect one row.

```sql
select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid = 'public.truck_places'::regclass and conname = 'truck_places_no_self_merge';
```

**(d) The wording rename.** 🧪 Expect exactly one row, `event_post_wording`.

```sql
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'trucks'
   and column_name in ('default_group_post_wording', 'event_post_wording');
```

**(e) 🔴 `truck_events.truck_place_id` — nullable, no default, FK `SET NULL`.** 🧪 Expect
`is_nullable = YES`, `column_default` null, and `delete_rule = SET NULL`.

```sql
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'truck_events' and column_name = 'truck_place_id';
```

```sql
select rc.constraint_name, rc.delete_rule, kcu.column_name
  from information_schema.referential_constraints rc
  join information_schema.key_column_usage kcu on kcu.constraint_name = rc.constraint_name
 where kcu.table_schema = 'public' and kcu.table_name = 'truck_events'
   and kcu.column_name = 'truck_place_id';
```

**(f) 🔴 NO EXISTING EVENT WAS TOUCHED.** 🧪 Run before applying and after using the tab. `events` and
`max_updated` must be **identical**; `linked` is 0 until you add an event through the modal.

```sql
select count(*) as events,
       max(updated_at) as max_updated,
       count(truck_place_id) as linked
  from public.truck_events;
```

**(g) The duplicate check — must return no rows, before and after any refresh.**

```sql
select truck_id, name_key, count(*) as rows
  from public.truck_places
 group by truck_id, name_key
having count(*) > 1;
```

**(h) Merges resolve and no place points at itself.** 🧪 Expect no rows.

```sql
select a.id, a.name, a.merged_into_id, b.name as target, b.merged_into_id as target_merged_into
  from public.truck_places a
  left join public.truck_places b on b.id = a.merged_into_id
 where a.merged_into_id is not null
   and (b.id is null or a.merged_into_id = a.id or a.is_hidden = false);
```

---

## 3 · 🔴 Every `truck_events` write path, and the result

**The rule:** `truck_place_id` is written **only on INSERT, only by the Add event modal**. Nothing
updates it; nothing backfills.

**How it was checked.** The schema census's own AST payload reader was pointed at `truck_events`
(a new `patch.tables` option — reading a table is not censusing it; `truck_events` has no
`create table` in `supabase/migrations/`, so it must never join `TABLES`). It resolves literal
payloads exactly. **The four payloads it cannot resolve were each checked by hand and are named
below**, because a reader that cannot read a payload proves nothing about it.

| # | path | kind | result |
|---|---|---|---|
| 1 | `app/api/manage/route.ts:964` `upsert_event` → insert | insert | 🔴 **THE ONE WRITE.** `truck_place_id: resolvedPlaceId` |
| 2 | `app/api/manage/route.ts` `upsert_event` → update (edit) | update | ✅ Named columns; `truck_place_id` **not among them**. The handler destructures a **fixed list** and nothing spreads `body`. |
| 3 | `app/api/manage/route.ts:973` cancel | update | ✅ `{ status: 'cancelled' }` |
| 4 | `app/api/manage/route.ts` interval override | update | ✅ two named `*_override` columns |
| 5 | `app/api/manage/route.ts` order-ready override | update | ✅ one named column |
| 6 | `app/api/dashboard/action/route.ts` `set_paused` | update | ⚠️ **non-literal** — a ternary of **two literal objects**, neither naming it. Asserted by source. |
| 7 | `app/api/dashboard/action/route.ts` `set_offline_protection` | update | ✅ locally-built `patch`, every key a literal, nothing from `body` spread |
| 8 | `app/api/dashboard/action/route.ts` `set_extra_wait` | update | ✅ two named columns |
| 9 | `app/api/dashboard/action/route.ts` show-paid / presses / buzzer / cash | update ×4 | ✅ one named column each |
| 10 | `app/api/dashboard/action/route.ts` collection intervals | update | ✅ two named columns |
| 11 | `app/api/dashboard/action/route.ts` manual event insert | insert | ✅ unchanged; does not name it |
| 12 | `app/api/events/action/route.ts` open / close / cancel / un-cancel | update ×4 | ✅ named status columns |
| 13 | `app/api/events/action/route.ts` van backfill | update | ⚠️ **non-literal** — ternary of literals; the file contains no `truck_place_id` at all |
| 14 | `app/api/events/action/route.ts` `update` | update | ⚠️ **non-literal** — an **allowlist of 8 columns**; `truck_place_id` is not one, so a client PATCHing it is **dropped** |
| 15 | `app/api/heartbeat/route.ts` ×2 | update | ✅ one named column each |
| 16 | `app/api/inbound-schedule/route.ts:186` upload/inbound insert | insert | ✅ **unchanged** — does not name it, so scraped and uploaded events are NULL, as intended |
| 17 | `lib/provision-demo-event.ts` | insert / delete | ✅ demo trucks only; does not name it |
| 18 | `lib/demo-restart.ts` | delete | ✅ demo trucks only |
| 19 | `scripts/reresolve-event-venues.ts` | update | ⚠️ an **operational script**, not in the harness list and not run by anything. Writes `venue_id`; does not name `truck_place_id`. |

**Result: one insert writes it, zero updates anywhere.** The harness prints the finding every run.

### 🔴 The insert payload is today's plus exactly one key — proved, not claimed

The harness extracts the insert object's **key set** from the current source and from
`cebc78e:app/api/manage/route.ts` (the commit this branch started from), and asserts the difference:

```
insert keys: 12 before → 13 now · added [truck_place_id] · removed []
```

⚠️ **The key is named unconditionally** (`truck_place_id: resolvedPlaceId`) rather than spread behind a
ternary. The column is nullable with no default, so an explicit `null` and an omitted key are the same
write — and a named literal is one the AST reader can **see**, which is what makes the proof above
possible at all.

⚠️ **A place-lookup failure never fails the send.** `resolveEventPlaceId` swallows its own errors and
returns `null`, which is the state of every event in the table today. A missing table, a permission
problem or a race costs the *link*, never the event.

---

## 4 · Matching, merging, and the seeder

🔎 All in `lib/schedule-graphics/places.ts` — still **one module**, imported by the route and the page.

### `placeForEvent` order

```
1. event.truck_place_id   — the operator picked it. Nothing outranks that.
2. event.venue_id         — the scraper resolved it to a shared venues row.
3. normalise(venue_name)  — all that is left for most events.
→ then follow merged_into_id to the final place.
```

🔴 **Three passes, not one scan.** Scanning the list in array order would hand an event to whichever
row came first — a different answer on a different day for the same data.

⚠️ **A link to a place that is no longer there falls through** to the anchor and then the name, rather
than returning null. The event still happened somewhere, and the name still says where.

### Merging A into B

One write to **one row**: `A.merged_into_id = B.id`, `A.is_hidden = true`. **B gains A's events through
matching, not through a rewrite** — which is the whole reason this is safe to offer on a table live
ordering reads.

| | |
|---|---|
| **Chains** | A→B→C resolves to **C**. Nothing rewrites A when B moves, so the pointer is walked. |
| **Depth cap 10** | A cycle A→B→A is an infinite loop inside a render. At the cap it returns **the last place it reached** rather than throwing — a slightly wrong place in a list is recoverable, a 500 on the Schedule tab is not. |
| **Cycles** | Caught *before* the cap by a `seen` set, and refused *before being written* by `mergeRefusal`. |
| **Self-merge** | Refused twice: a database `CHECK`, and the shared rule. It is also exactly what a double-tap looks like. |
| **Merging into an already-merged place** | Lands on the **final** target, so the chain does not grow a step per merge. |
| **Restoring** | Un-hiding a merged place **also un-merges** it — one control, one coherent outcome. Restored while still merged, it would come back showing none of its own events. |

### The seeder

🔴 **It cannot undo a decision, structurally.** `is_hidden` and `merged_into_id` are **not in its
vocabulary** — asserted by serialising a plan and checking neither name appears. A hidden or merged
place is **found** (so never re-created) and **left alone** (not even a blank fill).

⚠️ **A retired row is not adopted either.** An anchored event whose `name_key` belongs to a hidden place
is reported as a collision, not attached: adopting would quietly put a venue anchor on a row the
operator removed from view.

- `name` and `short_name`: written **once, on insert, never again**.
- `address`, `postcode`, `area`: filled **only while blank**, each by its own statement with its own
  `.is(<literal>, null)`.
- `area` is seeded from the event's **`town`** — the same fact under the name each table uses.
- ⚠️ **The documented cost:** a field the operator deliberately *clears* is refilled next time. With
  these columns there is nowhere to record "deliberately empty". The **name** is what the requirement
  protects, and the name is never rewritten.

### What picking a place fills

`fillFromPlace(place, form)` — **a rule in the shared module, not logic in the component**, so it is
tested rather than regex-asserted.

| filled | from |
|---|---|
| Venue name · Full address · Area · Postcode | the place's `name` · `address` · `area` · `postcode` |
| Start time · End time | **the last event at that place** |

🔴 **`event_date` is not in the target type and never will be.** It is the one thing that differs every
time; pre-filling it from a past event is how tonight's pitch lands on a date in September.
⚠️ **A blank field on the place keeps what is already typed** — the same rule the existing
venue-suggestions dropdown follows. ⚠️ Every field stays editable, and nothing writes back to the place.

### `effectiveGroupPostWording` — **removed**, not renamed

The brief offered either. **Removed**, because its only caller was the per-place wording card, and a
renamed resolver with no caller is an export nothing exercises — the next person cannot tell whether it
is load-bearing. `WORDING_TOKENS` and `DEFAULT_GROUP_POST_WORDING` went with it.
⚠️ **`trucks.event_post_wording` stays and is deliberately dormant** — renamed, keeping whatever it
held, read by nothing in this build. The resolver comes back with a caller and a test when the
per-event post text ships, as a two-level chain (truck → built-in), since the per-place column is gone.

---

## 5 · Navigation, and the one thing that must not move

The sub-tabs are **pills**, not a second underlined row: the tab bar above is the app's one level of
underlined navigation. They scroll sideways inside their own row; the page does not.

🔴 **`isActive` still means "the Schedule tab is open", not "Events is showing"** — and that is the
decision worth naming. Every load in `ScheduleTab` keys off it (`loadEvents`, the vans read, the
conflict scan), and `onPendingCount` drives the **"Schedule (8)"** badge on the tab bar. Narrowing it
to the section would stop the badge updating while the operator stands on Places. **The section decides
what is rendered, never what is loaded.** The Events body is unedited.

**The URL.** `?section=places`; `events` writes **no param**, so the existing link opens where it always
did. `replaceState`, never `pushState` — pushing would make Back walk through every pill tapped. A bare
`?section=places` also selects the Schedule tab, or it would set a section nobody can see.

**The gate.** `FeatureGate` wraps **the Weekly post pane only**. Places is how an operator keeps their
own schedule tidy, which every plan pays for. `schedule_graphics` is declared in `lib/features.ts` and
consumed in exactly one file — asserted over **code lines only**, because `route.ts` still explains in a
comment that the gate used to be there, and a comment is not a gate.

⚠️ **Removing a plan gate widened which plans, never which roles.** `resolveTruckAccess` is untouched,
and `sg_places`, `sg_upsert_place`, `sg_merge_place` are still staff-blocked — `sg_places` included,
because opening the pane seeds rows and is therefore a write.

---

## 6 · Harness results

**`node scripts/run-harnesses.cjs` → 82 run · 82 passed · 0 failed.** `tsc --noEmit` clean. ESLint:
**0 new errors or warnings** in any added line (checked against the diff's added ranges; the three hits
inside my reformatted `ScheduleTab` signature — `categories` unused and two `api: any` — are present at
`cebc78e` and were verified there).

### `scripts/schedule-graphics-places.cjs` — ✅ **127 checks**

| suite | covers |
|---|---|
| **matching** | the normaliser's cases · **`truck_place_id` outranks a venue anchor pointing elsewhere** · merge chains, cycles, the depth cap, self-merge, merge-into-merged · Next vs Last never both claiming today · the 365-day count excluding the future · favourites-first ordering · hidden/merged out of the list and back with `showHidden` · **`fillFromPlace`**: five fields + both times, the date never filled, a blank place field keeping what is typed |
| **seed** | second run plans nothing · two tabs → one row · edits survive · adoption · **a hidden place is not re-created and not written to** · **a merged place's pointer is never cleared** · **no plan ever names `is_hidden` or `merged_into_id`** · a favourite survives while its blank area is still filled · `area` seeded from `town` |
| **wiring** | **the `truck_events` audit** (one insert, zero updates, the four non-literal payloads each named) · **the insert key-set diff against `cebc78e`** · the migration's one nullable column, no default, `set null` not cascade · groups gone from code · the gate on Weekly post only · nav order · the picker · one normaliser in the tree |

**23 broken variants, each must fail** — including: the name beating the venue anchor · the seeder
rewriting `name` · **the seeder ignoring a hidden place** · **the seeder writing `is_hidden`** · `area`
no longer seeded · **the edit path writing `truck_place_id`** · **the allowlist admitting it** · the
insert dropping it · a place-lookup failure taking the send down · Places gated again · Weekly post
losing its gate · the migration using `cascade`.

⚠️ **Two variants had to be rewritten, and both lessons are in the file.** One produced a **syntax
error** (a variant that does not compile proves nothing); one tripped the typed `fills` array, fixed
with `Object.assign` rather than a spread literal. And the compile tag was `label.slice(0, 2)`, so
`W8a`/`W8b`/`W8c`/`W8` all reported as "W8" — a compile failure named the wrong variant.

### `scripts/schedule-places-render.cjs` — ✅ both engines, identical

Not in the sweep (needs a build and local browsers); in `harnesses.json`'s `needs_a_browser` group.

| | Chromium | WebKit |
|---|---|---|
| **1440×900** | list 288@x224 · detail 688@x528, shared top; Card 1 = 3 rows | identical |
| **820×1180** | list@104 **above** detail@550, both 788 wide | identical |
| **390×844** | list@104 **above** detail@550; Card 1 = 5 rows | identical |
| **modal 1440 / 820 / 390** | picker above the form; 8 / 8 / **9** form rows | identical |

Asserted at every width: the three pills stay on **one row**, the pill row never exceeds the viewport,
and **no horizontal page scroll**. In the modal: the picker sits where "Copy a recent event" was, the
"Filled from" line sits above the buttons, and the modal keeps its 16px gutter.

🔴 **Two controls.** (1) `grid-cols-1` in place of the responsive grid must **stack at 1440**, or the
stacking assertions would pass on a component that never had two columns. (2) **Six pills at 320px**:
content 689 in a 296 row, and the **document still does not scroll** — that is the real test of the
clipping. ⚠️ An earlier draft asserted the *three real* pills overflow at 320; they fit (296 in 296),
and the assertion failed on correct layout. The numbers are measured, not estimated.

### 🔴 Two findings from my own tooling, fixed at the cause

**(1) The schema census had become *wrong*, not merely incomplete.** Its migration reader refused to
model `drop column` / `rename column` and said so loudly — its own comment predicted the cost: *"it
would leave a column in the declared set that no longer exists"*. Stage 2 then dropped
`truck_places.group_post_wording`, and that is exactly what happened: the census still declared it, so a
select naming a dropped column **would have passed**. It models both now, applied in **filename order**
(the order Postgres will see them), with a control asserting the drop took effect, a second asserting
the rename landed on the new name only, and a broken variant (`V9c`) that re-adds the dropped column.
`truck_place_groups` also left `TABLES` — a censused table that no longer exists is a check with no
subject.

**(2) `stripComments` was eating whole regions of `page.tsx`.** It pairs each `/*` with the next `*/`
non-greedily, and that file's regex literals and strings contain those characters. It cost **three false
failures** on correct code. A line-based `codeOnly` filter replaced it where comment-blind matching is
what is wanted; it cannot eat a region. The structural checks on `page.tsx` assert on **raw** source.

**(3) A stale comment, caught by my own new assertion**, in the seeder: *"its Facebook groups are still
the right ones"* — about a feature this build deletes. Rewritten.

---

## 7 · Localhost test list — Village Spice only

🔴 **Localhost uses the PRODUCTION database** (`ffphgwonshgxamtvefcv`). Real rows. **Pizzeria Gusto must
not be touched or used for any check.**

```bash
cd ~/dev/village-foodie
git checkout schedule-graphics && git status      # expect: clean, on schedule-graphics
npm run dev
```

**Apply the §2 migration first** (and stage 1's, if it is not already applied). Then
**`http://localhost:3000/login`** — sign in; the manage token alone is not enough — and open
`http://localhost:3000/manage/<Village Spice token>`.

1. **Schedule** now shows three pills: **Events · Weekly post · Places**. Events is selected and looks
   exactly as it did. **There is no separate "Schedule graphics" tab.**
2. Tap **Places**, then **reload the page**. It comes back on Places (`?section=places` in the URL).
   Press **Back** once — you leave the page, you do not walk back through the pills.
3. **Places loads with a list**, each row showing **`Next: …`** or **`Last: …`**. Tap a **star** — the
   row moves into **FAVOURITES** and stays there after a refresh.
4. 🔴 **Refresh Places twice, then open it in a second tab.** No duplicate places. Run query **(g)** —
   **no rows**.
5. **Pick a place.** Card 1 has **Name on posts · Short name · Address · Area · Postcode**; Card 2
   reads **"Next: … · 17:00–20:00"** and **"Last: … · n times in the last year"**.
6. **Rename it** and set a **Short name**, then refresh — **both survive**.
7. **Hide this place.** It leaves the list; **"Show hidden places (n)"** appears at the bottom. Turn it
   on, select the place, press **Restore this place** — it comes back.
8. 🔴 **Merge** a place into another. The merged one leaves the list, the target is selected, and its
   **Last/count go up** — the merged place's events are now under it. Run query **(f)**: `events` and
   `max_updated` are **unchanged**.
9. **Weekly post** shows "Coming next". On a Starter truck it shows **"The weekly post is on Pro and
   Max"** — a line, not an error — while **Places still works**.
10. 🔴 **Events → + Add event.** Where "Copy a recent event" was there is a **Place** search box, then
    **FAVOURITES** with "Last time: Tue 6 Oct · 17:00–20:00", then **Show all places (n)** and
    **+ New place**.
11. **Select a place.** It highlights; **Venue name, Full address, Area, Postcode, Start time and End
    time fill in**; the **date stays empty**; one muted line reads **"Filled from … Change anything for
    this date only."** Change the end time, then save. The event is added with your edited time.
12. 🔴 **Edit that event** — change its time and save. Go back to Places: it is **still under the same
    place**. Then run query **(f)**: `linked` has gone up by exactly the number of events you added
    through the modal, and by nothing else.
13. **+ New place** in the modal, type a venue that is not in the list, save. Go to **Places** — it is
    there, with your typed Area and Postcode.
14. **Upload schedule** still works unchanged (photo/PDF/text), and events it creates have **no place
    link** — that is intended.
15. 📱 **On a phone:** the three pills **scroll sideways**, the page does **not**; in Places the list is
    **above** the detail; in the modal every field is on its own row.
16. `node scripts/schedule-graphics-places.cjs` → **127 passed**; `node scripts/run-harnesses.cjs` →
    **82/82**.

---

## 8 · Noticed, not changed

- **`scripts/reresolve-event-venues.ts`** is an operational script that updates `truck_events.venue_id`
  by hand. Not in the harness list, not run by anything, and it does not name `truck_place_id` — but it
  is the one file in the tree that would happily rewrite event rows if someone ran it.
- **`truck_events` and `venues` still have no `create table` in `supabase/migrations/`** — they predate
  the directory, so the schema census cannot cover them. A non-existent column named in a select on
  either is still invisible to it. Backfilling their definitions is a separate piece of work.
- **`scripts/_outreach-schema-census.cjs` is now named far more narrowly than its contents** — it
  covers `truck_places`, models drops and renames, and serves two feature areas. Renaming it touches
  three harnesses and three reports.
- **`trucks.event_post_wording` is dormant** — renamed, read by nothing. Intended by the brief; worth
  knowing it will look like a dead column until the per-event post text ships.
- **No place picker in the event *edit* form**, by design: an edit must not move a pitch's history. The
  consequence is that an event linked to the wrong place can only be re-pointed by deleting and
  re-adding it, or by merging the two places.
- **`sort_order` on places does not exist** — the list is favourites-then-alphabetical. Manual
  reordering is not in the mockup.
- **A merged place's own name still matches its old events** (that is how B gains them). If the operator
  later *restores* A, those events return to A, not to B. Correct, and worth knowing.
- **The 390px modal is tall** — 9 form rows plus the picker — so the operator scrolls inside it to reach
  **Add event**. Measured as fitting the viewport with its gutter; shortening it is a design decision.
