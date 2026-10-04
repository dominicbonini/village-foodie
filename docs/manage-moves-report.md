# Two moves out of Settings — Kitchen capacity, and the Schedule question

**Branch:** `schedule-graphics` · **Date:** 4 October 2026 · **Deployed:** no · **SQL run:** none

Item 1 is built. **Item 2 is not built — its own gate says to stop and ask, and both of the gate's
conditions are met.** The question is at the end of this report and in the chat reply.

---

## 1 · Item 2 first, because it is a STOP

The brief: *"First list the section's fields in the report. If it holds more than five controls, or
anything that is not about finding the schedule, STOP and ask before moving it."*

Settings › Schedule is `<section id="schedule">` at `app/manage/[token]/page.tsx:11874`, 144 lines,
and it holds **three cards**:

| # | Card | Controls | About finding the schedule? |
|---|------|----------|------|
| 1 | **"Your schedule"** | `I'll add events myself` / `Find my events automatically` (two buttons acting as radios, writing `scraper_preference`); the `schedule_url` URL input; the **Verify** button → **4** | Yes |
| 2 | **"Import exclusions"** | one **Remove** button per excluded term — a variable list, no add control → **1 type, N buttons** | Yes |
| 3 | **`<CustomDomainSetup>`** — "YOUR SCHEDULE AT YOUR OWN ADDRESS" | 5 of its own (`components/dashboard/CustomDomainSetup.tsx`, 984 lines) → **5** | **No** — custom domain and DNS setup |

**Both conditions trip, not one:**

1. **More than five controls.** Four in the first card alone; ten before counting the exclusion list,
   which is unbounded.
2. **Something that is not about finding the schedule.** `CustomDomainSetup` is a DNS/custom-domain
   wizard. It is filed under "Schedule" because the operator's own address is *where their schedule is
   served*, not because it has anything to do with importing events.

**And a third reason the brief did not ask for, which is the one I would weigh heaviest.** That card's
position is load-bearing, and the page says so in as many words (`page.tsx:12009`):

> 🔴 IMMEDIATELY ABOVE THE QR CODE, AND THE ADJACENCY IS THE POINT (V11.49). The QR code below encodes
> a hatchgrab.com address PERMANENTLY and resolves its destination at scan time, so once this card's
> setup is finished the SAME PRINTED CODE starts sending customers to the operator's own address.
> Reading them in this order is what makes that obvious; separated, the two read as unrelated features
> and the operator assumes a new code is needed.

Moving the section into a modal would separate the custom-domain card from the QR code it was
deliberately placed above. An operator who has just set up their own address, and is not shown the QR
code next to it, concludes they need to reprint. That is a real cost on printed material.

The `ScheduleWhere` board supports the narrower reading: its own caption shows only **Website** and
**Facebook page**, marked *illustrative* — i.e. the "finding events" fields, not the domain wizard.

### The question

**Which do you want?**

- **(a) Move only the "finding the schedule" fields** — cards 1 and 2 (`scraper_preference`, the
  `schedule_url` input, Verify, and the exclusion list). That is 5 controls plus the variable list,
  it is all genuinely about finding the schedule, and `CustomDomainSetup` stays in Settings directly
  above the QR code where its comment says it must. **This is what I would build.**
- **(b) Move the whole section**, custom domain and all, accepting the QR separation.
- **(c) Leave it** until after item 1 ships.

Nothing about item 2 has been written, so (a) and (b) both start from a clean page.

---

## 2 · Item 1 · Menu › Kitchen capacity

### What moved

The capacity table and the "How capacity works" explainer left Settings › Kitchen (where they were a
sub-card on **each van's card**) and became a Menu pill, in a new file:
`components/manage/KitchenCapacitySection.tsx` (306 lines).

**61 lines moved verbatim.** Measured, not asserted — see §5.

### The pill is SECOND, after Items

The brief said "after Items · Extras & upsells · Deals". **You changed this mid-build** ("move kitchen
capacity after items"), so `MENU_SECTIONS` now reads:

```
Items · Kitchen capacity · Extras & upsells · Deals
```

Nothing else keys off that array's order — `?section=` and the legacy `?tab=` map by **id** — so the
pill moved and no link changed. One harness assertion had quietly made the order load-bearing; §6 has it.

### Unchanged, deliberately

- **Every string.** The table's labels, the two explainer paragraphs (still
  `KITCHEN_CAPACITY_DESC` + `KITCHEN_CAPACITY_EXAMPLE` from `lib/kitchen-capacity.ts`), the headers.
- **Every write.** `upsert_van_category` for per-category rows, `update_van_settings` for
  `kitchen_capacity` / `capacity_window_mins`, both still through `lib/van-category-settings.ts`.
- **The cells.** Still `<KitchenCapacityCategoryRow>`, still the shared `KITCHEN_CAPACITY_GRID`.
- **The availability gate.** `perVanCategoriesAvailable` is read from the same `get_vans` field; it is
  called `available` locally, and all three places it gated are still gated (§5).

### New: the van picker and a second switch

- A **van picker** at the top, shown only when a truck has more than one van.
- For Van 2+, a **"Same capacity as <first van>"** switch — **a copy, never a lookup**. Switching it
  on copies the first van's `kitchen_capacity`, `capacity_window_mins` and `van_category_settings`
  rows into that van (delete-then-insert, never a merge); while on, a change to the first van is
  written to the followers in the same request; switching off writes only the switch and keeps the
  copied values. **No reader resolves through the flag** — proved in §4.
- On ⇒ the table is **collapsed, not disabled**. A greyed-out number invites "is that this van's or
  Van 1's?", and the answer would be "both", which no control can express.

### Why a second database flag

`same_as_first_van` has been covering capacity along with everything else. Capacity now has its own
switch, and the two must be able to disagree — a truck may want Van 2 to follow Van 1's offline
protection while giving it a smaller kitchen. One column behind two switches means each can silently
undo the other with nothing to show it happened.

So `VAN_COPY_FIELDS` gave up two fields to a new `CAPACITY_COPY_FIELDS`, each switch got its own
payload builder and its own fan-out block, the `van_category_settings` fan-out moved to the capacity
flag, and `capacitySplitIsClean()` is exported so the **disjointness is asserted rather than claimed**.

### Settings now says what it no longer covers

- Settings' "Same as Van 1" helper reads *"…the same settings, **except kitchen capacity**…"* and
  carries a second line: *"Kitchen capacity has its own switch in Menu › Kitchen capacity."*
- Settings › Kitchen keeps **one line** where the table was: *"Kitchen capacity has moved to
  **Menu › Kitchen capacity**"*, the link switching tab and pill in one click.
  ⚠️ It sits **outside** the van loop. My first attempt put it inside, which gave a three-van truck
  three identical pointers and a *following* van none at all.

### Re-pointed elsewhere

| Where | Was | Now |
|---|---|---|
| `lib/go-live-checks.ts:157` | `kitchen_capacity_unset` blocker → "Settings → Kitchen capacity" | "Menu → Kitchen capacity" |
| `page.tsx:4281` | "Counts toward capacity" chip tooltip | "Menu → Kitchen capacity" |
| `lib/walkthrough.ts` `menu` stop | "Deals, upsells and customisations live under Menu" | "…**and your kitchen capacity** live under Menu" |
| `lib/walkthrough.ts` `settings` stop | "Your truck's details, how customers pay, **and your kitchen's capacity**" | "Your truck's details and how customers pay." |
| `app/admin/page.tsx:2244` | comment: "set in Manage -> Settings -> Kitchen capacity" | "Manage -> Menu -> Kitchen capacity" |
| `page.tsx:5821` | comment: "the SAME shared constants **Settings** shows" | "…**Menu › Kitchen capacity** shows" |

**No legacy `?tab=` key needed re-pointing** — capacity never had a tab of its own; it was a sub-card
inside `?tab=settings#kitchen`, which still resolves (to the pointer).

---

## 3 · The migration — `supabase/migrations/20261010_capacity_same_as_first_van.sql`

**⛔ NOT RUN.** Nothing in this repository runs SQL. Additive and idempotent.

```sql
set lock_timeout = '3s';

begin;

-- 1 · THE COLUMN, NULLABLE FOR NOW
-- ⚠️ NO DEFAULT YET, DELIBERATELY. A default would fill new rows during this transaction and make the
-- "is null" backfill below unable to tell "not yet initialised" from "set to false on purpose".
alter table public.truck_vans
  add column if not exists capacity_same_as_first_van boolean;

-- 2 · THE BACKFILL — ONE ROW PER VAN, FROM ITS OWN OLD FLAG
-- ⚠️ SCOPED TO `is null`, which is what makes this statement safe to run twice.
update public.truck_vans
   set capacity_same_as_first_van = coalesce(same_as_first_van, false)
 where capacity_same_as_first_van is null;

-- 3 · NOW IT CAN BE NOT NULL WITH A DEFAULT
-- 🔴 AND THIS IS THE GUARD ON STEP 2. With NOT NULL in place, no row can be NULL again, so a re-run
-- finds nothing to backfill and cannot overwrite an operator's later choice.
alter table public.truck_vans
  alter column capacity_same_as_first_van set default false;

alter table public.truck_vans
  alter column capacity_same_as_first_van set not null;

comment on column public.truck_vans.capacity_same_as_first_van is
  'Does this van follow the FIRST van''s KITCHEN CAPACITY? Set and read only by Menu › Kitchen capacity. Initialised from same_as_first_van by 20261010 so every van behaved exactly as before, and independent of it from then on: Settings › Truck settings'' "Same as Van 1" now covers everything EXCEPT capacity. A COPY, NEVER A LOOKUP — switching it on copies the first van''s kitchen_capacity, capacity_window_mins and van_category_settings rows into this van, so no reader resolves through this column and switching it off keeps the copied values. The first van is the oldest ACTIVE van (firstVanId in lib/van-category-settings.ts). false on a new van: it has no relationship to Van 1 until somebody says so.';

commit;

-- 🔴 WITHOUT THIS, POSTGREST SERVES ITS CACHED SCHEMA: the column reads as absent (PGRST204 / 42703),
--    `get_vans` returns it undefined, and every van's capacity switch shows OFF on correct code —
--    which is the one state this migration's backfill exists to prevent.
notify pgrst, 'reload schema';
```

### Why the backfill exists

`same_as_first_van` has been covering capacity, so **a van following Van 1 today is following Van 1's
capacity today**. A column defaulting to `false` for everyone would silently unfollow every such van
the moment this deployed. The *values* would not change — they were copied, never looked up — but the
switch would read "set separately" where the operator had said "same", and a later change to Van 1
would stop reaching Van 2.

### Why four statements and not one

A plain `update … set capacity_same_as_first_van = same_as_first_van` is not idempotent in the way that
matters: re-run after an operator turned the capacity switch **off**, it would turn it back **on**.

- **first run** → column added (all NULL) → backfill sets every row → NOT NULL applied.
- **re-run** → column exists; **no row is NULL**, so the backfill touches **zero rows**; the default and
  the NOT NULL are already in place and both statements are no-ops.

The NOT NULL is what makes the re-run safe. That ordering is the whole design.

### Verification selects

```sql
-- 1 · the column exists, and with the shape intended
select column_name, data_type, column_default, is_nullable
  from information_schema.columns
 where table_schema = 'public'
   and table_name = 'truck_vans'
   and column_name in ('same_as_first_van', 'capacity_same_as_first_van')
 order by column_name;
-- EXPECT two rows; capacity_same_as_first_van = boolean, default false, is_nullable = NO.

-- 2 · 🔴 THE ONE THAT MATTERS: EVERY VAN'S NEW FLAG EQUALS ITS OLD ONE.
--     This is the whole claim that no van's behaviour changed.
select count(*)                                                            as vans,
       count(*) filter (where capacity_same_as_first_van = same_as_first_van)  as flags_equal,
       count(*) filter (where capacity_same_as_first_van <> same_as_first_van) as flags_differ,
       count(*) filter (where capacity_same_as_first_van is null)              as still_null
  from public.truck_vans;
-- EXPECT: flags_equal = vans, flags_differ = 0, still_null = 0.

-- 3 · the two test trucks, van by van, in first-van order
select t.name as truck, v.name as van, v.created_at, v.active,
       v.same_as_first_van, v.capacity_same_as_first_van,
       v.kitchen_capacity, v.capacity_window_mins
  from public.truck_vans v
  join public.trucks t on t.id = v.truck_id
 where t.name in ('Village Spice', 'Pizza Kitchen')
 order by t.name, v.created_at;
-- EXPECT: the two flags equal on every row; the oldest ACTIVE van per truck is the first van.

-- 4 · the comment landed, so the next person reads the model and not just the column name
select d.description
  from pg_class c
  join pg_attribute a on a.attrelid = c.oid and a.attname = 'capacity_same_as_first_van'
  left join pg_description d on d.objoid = c.oid and d.objsubid = a.attnum
 where c.relname = 'truck_vans';

-- 5 · IDEMPOTENCY, PROVED RATHER THAN ASSUMED: run the migration file a SECOND time, then re-run
--     select 2. Every number must be identical. If `flags_differ` is non-zero after a re-run, the
--     backfill has overwritten an operator's choice and the NOT NULL ordering has been broken.
```

**Deploy order does not matter.** `readVanSameAsFirst` falls the capacity flag back to the old flag
when the column is absent (`row.capacity_same_as_first_van ?? !!row.same_as_first_van`), so code-first
or migration-first, every van shows the switch it actually has.

---

## 4 · Capacity resolves identically before and after — proved

New harness: **`scripts/capacity-move-identity.cjs`** (registered in `scripts/harnesses.json`).
**25 checks, all passing.**

It does **not** re-implement the resolver and compare it to itself. It compiles
`lib/van-category-settings.ts` **twice** — once from a clean `git worktree` of HEAD ("before"), once
from the working tree ("after") — and runs **both** over the same fixture. "Identical" means two
independently compiled modules agreeing.

The fixture is one truck, two vans: Van 1 older (so the first van), Van 2 with its own stored values.
**The numbers differ on purpose** — 12 items/5 min against 6 items/10 min — so a wrong answer is visible.

| What | Result |
|---|---|
| Per-category settings, **switch ON** (rows copied from Van 1) | **identical** before/after |
| Per-category settings, **switch OFF** (Van 2 set separately) | **identical** before/after |
| No van rows at all (every single-van truck) | **identical**, and equal to the truck defaults |
| `resolveCategory`, `resolveCategories`, `effectiveCategorySettings`, `resolveCategoriesForVan`, `readVanCategorySettings` | **none names either follow flag** |
| A following van vs an independent van | resolve **differently** — each to its own stored prep (420 copied vs 600 separate) |
| A category with no row for that van | falls back to the truck default, as before |
| **Broken variant V1** — a resolver that reads the first van when the flag is on | **fails as required** |
| `VAN_COPY_FIELDS` ∪ `CAPACITY_COPY_FIELDS` | **unchanged at 10 fields** — the split moved fields, it did not lose them |
| The two lists | **disjoint** (`capacitySplitIsClean()`) |
| The two payloads | partition the van; **no overlap**; neither carries `id` or `name`; together they cover every copied field |
| `firstVanId` — two vans, reversed input order, older van retired, no vans | **identical** before/after on all four |

The first-van rule is unchanged: the **oldest ACTIVE van** by `created_at`, computed server-side and
sent to the client, never guessed. A retired older van correctly loses it.

---

## 5 · Zero lines lost

### This build, against HEAD

| | |
|---|---|
| `page.tsx` at HEAD | 12,003 lines (trimmed, block comments stripped) |
| `page.tsx` now | 11,947 — **−56** |
| Left `page.tsx` | **80** |
| → present in `KitchenCapacitySection.tsx` (**moved**) | **61** |
| → **in neither file** | **19 — each accounted for below** |
| New in `page.tsx` | 24 (the import, the mount, the fourth pill, the pointer, the two helper lines) |

The 19:

| Count | Line | Why |
|---|---|---|
| 2 | `interface Van`, `type MenuSection` | gained `capacity_same_as_first_van?` / `'capacity'` |
| 1 | `isMenuSection` | gained `'capacity'` |
| 2 | `SettingsTab` mount + signature | gained the `onOpenKitchenCapacity` prop |
| 1 | "Counts toward capacity" chip title | re-pointed to Menu |
| 2 | the "Same as Van 1" helper lines | must now say they exclude capacity |
| 1 | the card's outer `<div>` | `mt-3` dropped — it spaced the card under a sibling sub-card, and it has no sibling now |
| 1 | the heading | `SUBCARD_HEADING` is a `page.tsx` local and is not exported; the literal value is used, so it renders identically |
| 3 | `perVanCategoriesAvailable` → `available` | a local rename, fed from the same `r.perVanCategoriesAvailable !== false`; **all three gates survive** (`capDisabled`, the "Unavailable until the database is updated" title, the `onCountsChange` guard) |
| 2 | the two `onChange` handlers | `void ` added for `no-floating-promises`; the new file is linted where `page.tsx` predates it |
| 3 | three line comments | reworded in the move |

### The harness's own guard

`schedule-graphics-places.cjs` carries the multiset diff added after 189 lines once went silently. It
now ends at **0 unexplained**, and two things were tightened rather than loosened to get there:

1. **A lost line is excused only if the same line is present in the file it moved to.** A line that
   vanished from *both* still fails. Whitespace is stripped for that one comparison — the move
   reformatted to house style (`{length:20}` → `{ length: 20 }`) and that is the same code — but it is
   still the **whole line**, so a changed token is still reported.
2. **The six lines that genuinely changed are named one at a time** in a `movedEdits` table, each with
   what changed *and the new form*. A companion check fails if that new form is not in the file named —
   so "I edited this on purpose" is a claim with a test attached, and a later revert or rename starts
   failing. Adding an entry is the expensive way to silence the guard, deliberately.

**Both guards were shown to bite, not just to pass:**

- deleting a moved line from the new file (gone from both) → `LINES LOST: 1`, check **fails** ✓
- reverting a claimed edit (`void` removed) → `⛔ EDIT CLAIMED BUT NOT PRESENT`, check **fails** ✓

---

## 6 · Harness assertions updated — which, and why

Four assertions pinned the old location. None was deleted without something taking its place.

| Harness | Assertion | Why it had to change | What it says now |
|---|---|---|---|
| `slot-interval-settings.cjs` | the Collection-times slice ended at `{/* Kitchen capacity — ONE aligned grid` | that anchor left the file, so `indexOf` returned **−1** and `slice(start, -1)` meant *the rest of a 12k-line file* — **every copy check was passing against nothing** | re-anchored to the pointer comment, ending at the per-van collapse close; plus a new check that the old card marker is **absent** from `page.tsx` |
| `slot-interval-van-list-tolerance.cjs` | "Kitchen capacity renders after Collection times, as a sibling" | same −1 bug in the `box` slice, same silent widening; "after, as a sibling" has no meaning across two files | the end anchor's existence is now **itself a check**; the sibling claim is replaced by *the card is in the new file and nowhere in `page.tsx`*; **the `intervalsAvailable` check was not dropped — it followed the card** to the new file, where it could regress less visibly |
| `slot-interval-event-override.cjs` | "Manage: the same box sits directly above the same card" | the two controls are now on different **tabs** of Manage, by design; the dashboard's own capacity card did **not** move, so the dashboard adjacency above still stands on its own | Manage has the card in **exactly one place** (one copy, not two) and keeps a findable pointer where it was |
| `van-category-settings.cjs` | 4 checks: the closed `WRITE_SITES` set; the table's write/read sites; `VAN_COPY_FIELDS` vs `update_van_settings` | the write sites moved file, and the capacity fields legitimately left `VAN_COPY_FIELDS` | `WRITE_SITES` gained the new file; the write/read assertions follow it; copy coverage now takes the **union** of both field lists; new checks for `capacitySplitIsClean()` and `capacityCopyPayload`; `vanCopyPayload`'s probe moved to `buzzer_count` and now also asserts the capacity field is **not** carried |

Two more were changed because **they had made something load-bearing that is not**:

| Harness | Assertion | Why |
|---|---|---|
| `schedule-graphics-places.cjs` | `?section=` collision check matched the literal `v === 'items' \|\| v === 'extras' \|\| v === 'deals'` | that made the **pill order** load-bearing for a check about **collisions**, so moving Kitchen capacity to second broke an assertion with nothing to do with pill position. It now asserts the **value sets**: every pill id is accepted by its own guard, the counts match, and no id is accepted by both. Shown to fail on a pill the guard rejects, and on an id accepted by both. |
| `schedule-places-render.cjs` | the Menu-pill fixture hard-coded `['Items', 'Extras & upsells', 'Deals', 'Fourth section', …]` with `pillCount = 3` | when capacity became a fourth pill, **this fixture went on measuring three pills with one invented label** — a layout nobody is served, which is the exact failure the file's own header warns about. Labels and count are now **lifted from `MENU_SECTIONS`**, which matters because a pill row is measured in text and *Kitchen capacity* is the widest of the four. |

### Wording

The wording diff reported the capacity table's labels as removed from `page.tsx`. They are allowlisted
as moved **and** each is separately checked to be **present in the new file**, so "allowed to leave"
cannot become "allowed to vanish". The explainer is still the shared `lib/kitchen-capacity.ts`
constants, checked.

---

## 7 · Measured, both engines, three widths

Added to `scripts/schedule-places-render.cjs`: a Kitchen capacity fixture whose grid template, card
and switch classes are **lifted from the component and from `lib/kitchen-capacity.ts`**, so a restyle
breaks the fixture instead of leaving it measuring the old screen.

**Why measure markup that did not change:** it is in a different *box*. In Settings it sat inside a van
card inside the settings list's padded column; now it sits directly in the tab body. The mobile
template is `minmax(0,1fr)_5rem_5rem_2.5rem`, and that constant's own comment records what went wrong
once: at ~311px the fixed columns overflowed, the name column collapsed to **zero** and the ceiling
selects went off-screen. A different container is exactly how that returns.

**Chromium and WebKit** (WebKit because on iOS every browser is WebKit, and the device is an iPad at
the hatch). **582 checks**, all passing.

| Width | Category column | Counts header → | Card | Selects | Page scrolls sideways |
|---|---|---|---|---|---|
| 1440 × 900 (desktop) | **634px** | 1203 | 992 → 1216 | 8, all on screen | no |
| 820 × 1180 (iPad portrait) | **430px** | 791 | 788 → 804 | 8, all on screen | no |
| 390 × 844 (phone) | **108px** | 361 | 358 → 374 | 8, all on screen | no |
| **320 (control)** | **38px** — still non-zero | — | — | — | no |

At every width: the Category column keeps a real width (not the old collapse), no header cell overlaps
its neighbour, the Total-capacity row lines up with the table above it (the shared template doing its
job), and nothing spills past the viewport.

**The two-van layout, which did not exist before this build** (1440 and 390):

| State | Picker | Switch | Table | Result |
|---|---|---|---|---|
| Switch **OFF** | yes | yes | yes | table still usable beneath both; switch row inside the viewport; no sideways scroll |
| Switch **ON** | yes | yes | **collapsed** | the explainer **remains** — a collapsed screen is not a blank one (194px at 1440, 226px at 390) |

**Menu pills** at 1440 / 820 / 390: all **four** stay on one row and scroll rather than wrap; the row
never exceeds the viewport; no horizontal page scroll. The 320px clipping control (six pills) genuinely
overflows its row and the overflow stays **inside** it.

---

## 8 · Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **clean** |
| `npm run build` | **exit 0** |
| ESLint, **added lines only** | **1 finding, pre-existing** — `SettingsTab`'s `onSwitchTab` is unused. It is unused at HEAD too (`git show HEAD:…` — its only use, `page.tsx:8499`, is inside `ScheduleTab`); it surfaced only because I touched that line. Not introduced here, and left alone as out of scope. The new file, `lib/van-category-settings.ts`, `lib/go-live-checks.ts`, `lib/walkthrough.ts` and `app/api/manage/route.ts` report **zero**. |
| `schedule-graphics-places.cjs` | ✅ 234 |
| `schedule-places-render.cjs` | ✅ 582, Chromium + WebKit |
| `van-category-settings.cjs` | ✅ 67 |
| `capacity-move-identity.cjs` (new) | ✅ 25 |
| `slot-interval-settings.cjs` | ✅ |
| `slot-interval-event-override.cjs` | ✅ |
| `slot-interval-van-list-tolerance.cjs` | ✅ |
| `slot-interval-van-resolution.cjs` | ✅ |
| `collection-times-hint.cjs` | ✅ |
| `weekly-post.cjs` | ✅ 207 |
| `printing-network-guard.cjs` | ✅ |
| `outreach-schema-census.cjs` | ✅ 42 |
| `whatsapp-settings-row-harness.cjs` | ✅ 131 |

Those are every harness that compiles or reads a changed file, plus the four the brief named. **The
full sweep was not run**, as instructed.

---

## 9 · Test list — localhost, Village Spice or Pizza Kitchen only

⛔ **Not Pizzeria Gusto** — it trades live. The migration is **not applied**, so steps 8–13 will show
every van as "set separately" until you run it; that is the pre-migration fallback working, not a bug.

**Before the migration**

1. `?tab=menu` — the pill row reads **Items · Kitchen capacity · Extras & upsells · Deals**. Tap
   **Kitchen capacity**: the table, the explainer and the Total-capacity row, exactly as they looked in
   Settings.
2. `?tab=menu&section=capacity` — lands directly on the pill. Reload: still there, and the URL did not
   gain a history entry you have to press Back through twice.
3. `?tab=settings#kitchen` — still resolves, and shows **one** line: *"Kitchen capacity has moved to
   Menu › Kitchen capacity."* Click it: Menu opens with the capacity pill selected.
4. Set a **total capacity** and a **window**, change a category's **prep** and **batch**, tick an
   instant category's **Counts to total capacity**. Reload — every value persisted.
5. A **cooked** category (prep > 0) shows its Counts box ticked and disabled; an **instant** one is
   tickable only once a total capacity is set.
6. Settings › Truck settings — the "Same as Van 1" helper says **"except kitchen capacity"** and carries
   the line *"Kitchen capacity has its own switch in Menu › Kitchen capacity."*
7. Go-live checks: with no capacity set, the blocker points at **Menu → Kitchen capacity** and the link
   lands there.

**After you run the migration** (`20261010_capacity_same_as_first_van.sql`, then verification select 2)

8. **A one-van truck** (most of them): Menu › Kitchen capacity shows **no picker and no switch** — just
   the table, as before.
9. **A two-van truck**: a picker appears. Van 1 has **no** switch (it is the one being followed).
10. Van 2, switch **OFF**: set a capacity **different** from Van 1's. Reload — the two differ. This is
    the case the whole copy-not-lookup model exists to keep working.
11. Turn Van 2's switch **ON**: the table **disappears** (collapses, not greys out) and the explainer
    stays. Reload — still on.
12. **With it on**, change Van 1's total capacity and a category's prep. Open Van 2's Settings values /
    the dashboard: Van 2 has the **new** numbers. That is the fan-out.
13. Turn Van 2's switch **OFF** again: the table returns holding **Van 1's copied values**, not the
    numbers from step 10. Change one — Van 1 must **not** move.
14. 🔴 **The two switches are independent.** Turn Settings' "Same as Van 1" **on** for Van 2 while its
    capacity switch is **off**. Van 2's capacity must **not** change, and the capacity switch must stay
    off. Then the reverse: turn the capacity switch on and confirm Settings' switch is untouched.
15. **Phone (390) and iPad (820), Safari as well as Chrome:** the Category column is readable, all four
    ceiling/prep selects are reachable, the Total-capacity row lines up with the table, and the page
    does not scroll sideways.
16. Walkthrough: the **Menu** stop mentions kitchen capacity; the **Settings** stop no longer does.

---

## 10 · Files

| File | |
|---|---|
| `supabase/migrations/20261010_capacity_same_as_first_van.sql` | **new, not run** |
| `components/manage/KitchenCapacitySection.tsx` | **new** — 306 lines, 61 moved verbatim |
| `app/manage/[token]/page.tsx` | fourth pill (second in the row), one-line mount, the 87-line card removed, the pointer, the `onOpenKitchenCapacity` prop, two helper lines, `interface Van` |
| `app/api/manage/route.ts` | `capacity_same_as_first_van` in `get_vans`; a second fan-out over `CAPACITY_COPY_FIELDS`; the category fan-out moved to the capacity flag; new `set_van_capacity_same_as_first`; `set_van_same_as_first` no longer copies category rows |
| `lib/van-category-settings.ts` | `capacityByVanId` (with the pre-migration fallback), `CAPACITY_COPY_FIELDS`, `capacityCopyPayload()`, `capacitySplitIsClean()` |
| `lib/go-live-checks.ts` | blocker re-pointed |
| `lib/walkthrough.ts` | two stops re-pointed |
| `app/admin/page.tsx` | stale comment re-pointed |
| `scripts/capacity-move-identity.cjs` | **new harness**, registered |
| `scripts/schedule-graphics-places.cjs`, `scripts/schedule-places-render.cjs`, `scripts/van-category-settings.cjs`, `scripts/slot-interval-settings.cjs`, `scripts/slot-interval-event-override.cjs`, `scripts/slot-interval-van-list-tolerance.cjs` | assertions updated — §6 |

**Item 2 touched nothing.** Awaiting your answer on (a) / (b) / (c) in §1.
