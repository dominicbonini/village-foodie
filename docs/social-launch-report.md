# Social media — launch prep

**10 October 2026 · not deployed · no new migration · no SQL run · one truck touched (`test-truck`)**

The brief: open Social media up by plan tier, remove the Pizza Kitchen-only gate, take the "coming
soon" labels off, check production safety, and give you a deploy checklist.

---

## 0. The short version

| Asked | Done |
|---|---|
| Remove the Pizza Kitchen-only gate everywhere it is checked | `places_posts_preview` is **gone from the product**. The TypeScript compiler found every call site; the only mentions left are tombstones explaining the removal |
| Access follows the plan tiers on the features table | **One key, `schedule_graphics`, moved from `MAX_FEATURES` to `PRO_FEATURES`** — Pro, Max and trial. Same key, same `canAccess` pattern, same `FeatureGate` component. Nothing new was invented |
| Leave the `feature_overrides` row alone — it becomes harmless | Left alone, and **proved inert**: a harness calls `canAccess` with that override and gets `false` |
| Remove the "coming soon" labels | The comparison table's two cells were the only place it lived. Both are `true`. The landing bullet never had a badge |
| Production safety | No harness switch, no fixture data, no debug flag and **no hard-coded truck id anywhere in product code** — proved by stripping comments first |
| Migrations | Six from `20261017`, plus three earlier ones the shipped code also needs. §4 lists all nine |
| Build, type check, lint, sweep | Production build **clean (exit 0)**, `tsc` clean, **0 lint errors in every file this round touched**, full sweep **98/98** |

**One thing to know before you read further.** The table row was `'coming_soon'` at `HEAD` and already
`pro: true, max: true` in your working tree when I started — so "currently marked coming soon" was true
of the last commit and not of the files. It makes no difference to where this lands, and §2.1 says so
rather than leaving you to notice the diff.

---

## 1. One key, and it follows the plan

### 1.1 What was there

Two gates, and both had to pass:

| Key | Question it asked | Plans |
|---|---|---|
| `places_posts_preview` | "is this surface finished **for this truck**?" | **None.** Absent from every plan set, so `canAccess` reached its last line and returned false for every tier. The only way to hold it was `trucks.feature_overrides`, granted to exactly one truck |
| `schedule_graphics` | "may this plan have social posts at all?" | Max and trial |

### 1.2 What is there now

**One key: `schedule_graphics`, in `PRO_FEATURES`.** `MAX_FEATURES` spreads that array and
`TRIAL_FEATURES` spreads `MAX_FEATURES`, so one entry grants pro / max / trial / tester / demo —
exactly the mechanism `private_events` uses, and the one the file's own notes describe.

Proved by **calling** `canAccess`, not by reading a comment:

| plan | `canAccess(plan, 'schedule_graphics')` |
|---|---|
| starter | **false** |
| pro | true |
| max | true |
| trial | true |
| tester | true |
| demo | true |

### 1.3 Why the preview key was removed rather than promoted

This is the decision worth recording, because promoting it was the shorter change and it would have
been wrong.

**`canAccess` consults `feature_overrides` before any plan.** Had `places_posts_preview` stayed in the
union and joined `PRO_FEATURES`, Pizza Kitchen would still have been granted by its **override** — so
the one truck you are going to use to check the launch would have been the one truck *not* exercising
the new gate. The override would also not have become harmless, which is what your brief says it
should become.

So the key is gone from the union and from every call site. The database row stays, and is inert:

```
canAccess('starter', 'schedule_graphics', { places_posts_preview: true }) === false
canAccess('pro',     'schedule_graphics', { places_posts_preview: false }) === true
```

`canAccess` only ever looks up the key it is **given**, so an override naming something that is no
longer a `Feature` can neither grant nor deny. **No UPDATE is needed and none was run.**

### 1.4 Every place the gate is checked

The compiler found these: `places_posts_preview` was typed as `Feature` at three of the four call
sites, so deleting the union member turned them into build errors. The fourth was cast with
`as never` and was found by reading.

| Surface | File | Before | After |
|---|---|---|---|
| The **Social media tab** (filtered out of the top bar) | `app/manage/[token]/page.tsx` | `places_posts_preview` | `schedule_graphics` |
| **"Make post"** on a Schedule › Events row | `app/manage/[token]/page.tsx` (`canPlacesPosts`) | same | same |
| **Create a post · Designs · Location settings** | `components/manage/SocialPosts.tsx` | already `schedule_graphics` via `FeatureGate` | unchanged |
| **Every action in `/api/weekly-post`** — weekly render and save, `event_post`, `event_render`, uploads, captions, the font GET | `app/api/weekly-post/route.ts` (`gated()`) | two checks, preview first | **one** check |
| **Tidy up places' tab-only write** (`sg_place_usual_type`) | `app/api/manage/route.ts` | `places_posts_preview` | `schedule_graphics` |

**What is deliberately still ungated**, because it is not this feature and never was: Add event's place
picker (`sg_places`), Tidy up places itself (`sg_upsert_place`, `sg_merge_place`), the usual-type
pre-selection (`usual_for_venue`), event types, private events and pricing. Switching one of those off
to tidy a gate is the mistake `/api/manage`'s own "no plan gate on Places" note was written to prevent,
and the harness asserts each one by name.

### 1.5 The gate is server-side on both handlers

`gated(truck)` is called once at the top of **POST** and once at the top of **GET**. The GET matters:
round 7 added the font file as a GET on this route, and a plan gate covering only POST would have
served a truck's font files to a plan that cannot have the feature. Both are asserted.

### 1.6 The plan sentence changed, and that is a correction not a tidy-up

`lib/copy/weeklyPost.ts` exists because this exact sentence was once written out twice and **both
copies were wrong the same way**: they said "Pro and Max" about a key that was in `MAX_FEATURES` alone,
so a Pro truck was told the weekly post came with their plan and then refused it. The fix pinned it to
`'The weekly post is on Max'`.

Moving the key to `PRO_FEATURES` made that sentence **the mirror image of the same bug** — it would
send a Starter truck to buy the wrong plan and tell a Pro truck the feature is not on their plan when
it is. It now reads:

> **Social media posts are on Pro and Max**

It names the row on the pricing table rather than "the weekly post", because the one key now gates the
whole tab — weekly posts, single event posts, designs and location settings — so naming one of them
would be a smaller promise than the gate makes. **Three readers, one constant**: the screen,
`/api/weekly-post` and `/api/manage`. The harness asserts the wording **and** the tiers together, which
is the point: pinning the wording alone would pass again the moment the key moved, and pinning the key
alone would pass with the wrong sentence.

### 1.7 What lower plans see — the existing pattern, unchanged

- **Starter:** no Social media tab in the top bar at all. Filtered, not greyed — which is what every
  other plan-gated **tab** on that bar does, and Billing is where a plan is changed. No "Make post" on
  an event row. Every route call answers **403** with the sentence above.
- **An expired trial:** `canAccess`'s expired branch is untouched — a past `trial_expires_at` denies
  everything, so an expired trial sees what Starter sees. That was already true of every feature and is
  not a decision this round made.

---

## 2. The "coming soon" labels

### 2.1 There was one mechanism, and it is in the cells

`'coming_soon'` as a **cell value** is the only way this table says it — your own correction on
6 October, over a tick plus a badge — and all four renderers (the landing table, `/features`, Billing
and Admin) read the cells. So launching it is a two-word change in one row:

```
{ name: 'Social media posts', …, starter: false, pro: true, max: true }
```

**At `HEAD` that row read `pro: 'coming_soon', max: 'coming_soon'`; in your working tree it already
read `true`.** Either way this is where it lands, and the harness now asserts the row contains no
`coming_soon` at all.

### 2.2 And the promise is enforced now, which it was not

This is the part that matters more than the label. The row was a hard `true` with **no
`ROW_FEATURE_MAP` entry**, so `findPlanParityViolations()` `continue`d past it — a public, indexed
pricing page promised something **no plan granted**. The file said so in as many words, and said that
adding the map entry *alone* would make the guard **throw at module load** and take out the landing,
`/features`, Billing and Admin in dev.

Both halves moved in one edit: the key into `PRO_FEATURES`, and

```ts
'Social media posts': 'schedule_graphics',
```

into `ROW_FEATURE_MAP`. `findPlanParityViolations()` now compares `pro: true, max: true` against
`canAccess` on every module load and **reports clean** — run, not read, in two harnesses. The recorded
exception in `lib/plan-features.ts` and the matching "STILL has no feature key" check in
`scripts/plan-feature-order.cjs` are both closed; that check's own note said when to delete it, and
this is that day.

### 2.3 Everywhere else

| Surface | State |
|---|---|
| Comparison table (landing, `/features`, Billing, Admin) | `true` / `true`, driven by the one row |
| Landing **Pro card** bullet | `<li>Social media posts</li>` — a live bullet, no badge, since 6 October. Its note no longer warns that the gate does not back it, because it does |
| Landing **Max card** | "Everything in Pro, plus" — covered by inheritance, no row of its own |
| Upgrade prompts | `FeatureGate` with `upgradeMessage={WEEKLY_POST_PLAN_REFUSAL}` — the one sentence |
| `lib/landing-table.ts` render-only overrides | Two rows only (`Online ordering — Pay at Hatch`, `SMS order alerts`); this row is not one, so **Trial follows Max** with no entry of its own |

The only remaining "coming soon" near this feature is **WhatsApp / Messenger & Instagram
auto-replies**, which is a different product and still unbuilt. Untouched.

---

## 3. Production safety

| Check | Result |
|---|---|
| **No harness or control switch in production code** | `breakScale`, `HG_RENDER`, `__HG`, `window.HG` — **zero** matches across `app/`, `components/`, `lib/`. The `?breakScale` control lives inside a template string in `scripts/live-text-place.cjs`, which is a harness file and is never bundled |
| **No test-truck special-casing** | Comments stripped first, then searched for `'test-truck'`, `'test-kitchen'`, `'pizzeria-gusto'`, `'village-spice'` as string literals in `app/`, `components/`, `lib/`: **none**. Every mention left is prose recording where a bug was observed |
| **No fixture data, no debug flag** | The only per-truck switches in product code are `feature_overrides` keys read through `canAccess` (or, for WhatsApp setup, its own documented resolver). Nothing reads a truck id |
| **The uploaded-font rule holds** | `/api/weekly-post`'s GET refuses `u:` ids — *"An uploaded font is not served to the browser."* — before it loads anything. Bundled fonts are committed open-licence files; library fonts are Google's, already public |
| **The font GET is behind the token and the plan gate** | `getTruck(token)` → `gated(truck)` → `if (blocked) return blocked`, before the `font` parameter is even read |
| **Existing saved weekly designs render exactly as before** | The dual model is intact: `if (l.days) { …new… } else { …const dy = l.rowSpacing * i… }` in `lib/weekly-post/draw.ts`. A design with no `days` key takes the legacy loop, untouched. `scripts/weekly-post.cjs` renders both and measures the difference: **5.17%** of pixels move on conversion against **11.91%** for a genuine rearrangement |

**And the stale-build hazard round 7 named is closed.** That report's §2b.8 warned that `.next/` predated
`LivePoster` and was missing `origin-top-left` — *"a Tailwind class is only as present as the last build
that scanned for it."* The fresh build carries `origin-top-left`, `inset-x-2`, `bottom-1.5`, `h-7` and
`grow`. Nothing in the product depends on that class any more (the property is inline), but the build is
current either way.

---

## 4. The migrations the shipped code depends on

**None of these was changed and no SQL was run.** Six from `20261017` as asked, plus the three earlier
ones the same code needs — listed so the tick-off is complete rather than ending at an arbitrary date.

### 4.1 From `20261017` onward

| File | What it adds | Read by |
|---|---|---|
| `20261017_post_fonts.sql` | tables `public.truck_fonts`, `public.font_library_cache`; the **private** storage bucket `post-fonts` | the font picker, uploads, `loadFontsForDesign`, the font GET |
| `20261018_place_picture_library.sql` | `place_pictures.is_main`, `.label`, `.sort_order` + index | the location picture library |
| `20261019_place_picture_slots.sql` | `truck_places.event_picture_id`, `.weekly_picture_id` | Location settings' poster and weekly picture |
| `20261020_poster_picture_tag_captions.sql` | `truck_places.picture_use` *(written by nothing now — see below)*, `truck_places.social_tag`, `truck_post_designs.caption_template` | the social tag and both caption templates |
| `20261021_weekly_only_picture.sql` | `truck_places.weekly_only_picture_id` + index | Location settings' weekly picture box |
| `20261022_three_location_pictures.sql` | `truck_places.event_photo_picture_id` + index | Location settings' event-photo box |

All six are `if not exists` throughout and all six end with a PostgREST reload (`notify pgrst, 'reload
schema'`), **which is not optional**: without it every read of a new column returns `PGRST205` and the
screens report "the design table has not been created yet".

### 4.2 Earlier, and also required

| File | Why the social code needs it |
|---|---|
| `20261015_places_tab.sql` | creates `public.place_pictures` and `place_pictures_path_uidx` (a **full** unique index on `path`, which is what makes "use the other box's picture" impossible to duplicate) |
| `20261016_place_usual_standard.sql` | the usual-type columns the Add event pre-selection reads |
| `20261008_event_post_place_layouts.sql` | the per-place event design layouts |

### 4.3 One column nothing writes

`truck_places.picture_use` (from `20261020`) is **dead and deliberately left in place** — the rules
forbid dropping a column, and nothing reads or writes it since one picture became "used wherever a
design has a space for it". It is recorded here so you do not go looking for its writer.

---

## 5. The read-only SQL

Both are `select` only. Pasted in chat as well.

### 5.1 Who will see Social media after deploy

```sql
-- Trucks that will see the Social media tab, by plan.
-- Mirrors canAccess(): pro / max / trial / tester / demo have it; starter does not;
-- and a trial whose trial_expires_at is in the PAST has nothing (a NULL expiry means "not started",
-- which GRANTS the trial set).
with seen as (
  select t.id, t.name, t.slug, t.plan, t.trial_expires_at,
         (t.plan in ('pro','max','tester','demo')
          or (t.plan = 'trial'
              and (t.trial_expires_at is null or t.trial_expires_at > now()))) as will_see
  from   public.trucks t
)
select plan,
       count(*)                                  as trucks,
       count(*) filter (where will_see)          as will_see_social,
       count(*) filter (where not will_see)      as will_not,
       string_agg(name, ', ' order by name) filter (where will_see) as names
from   seen
group  by plan
order  by plan;
```

```sql
-- The same thing as a flat list, for a quick eyeball. No tokens, no emails.
select t.name, t.slug, t.plan, t.trial_expires_at
from   public.trucks t
where  t.plan in ('pro','max','tester','demo')
   or (t.plan = 'trial' and (t.trial_expires_at is null or t.trial_expires_at > now()))
order  by t.plan, t.name;
```

### 5.2 Saved weekly designs per truck (the round-6 query, unchanged)

```sql
select t.id,
       t.name,
       t.slug,
       count(*)                                               as weekly_designs,
       max(d.updated_at)                                      as last_saved,
       count(*) filter (where d.layout -> 'days' is not null) as already_new_model,
       count(*) filter (where d.layout -> 'days' is null)     as still_old_row_model
from   public.truck_post_designs d
join   public.trucks t on t.id = d.truck_id
where  d.kind = 'week'
group  by t.id, t.name, t.slug
order  by last_saved desc nulls last;
```

`still_old_row_model` is the number that matters: those designs render through the legacy loop, pixel
for pixel as they do today, until their owner opens and saves them.

---

## 6. Deploy checklist

### 6.1 What you deploy

Branch **`main`**. Nothing else.

### 6.2 Before you deploy

| | |
|---|---|
| **Migrations** | Run any of the nine in §4 you have not already run, in filename order. They are all `if not exists`, so re-running one is a no-op — **except** that each ends with a PostgREST reload, which is worth letting run |
| **Env vars** | **None.** Nothing new is read. The font GET, the renders and the uploads all use `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, which are already set |
| **Storage** | The `post-fonts` bucket is created by `20261017`, **private**. If that migration has run, there is nothing to do |
| **SQL by hand** | None. Specifically: **do not** touch `trucks.feature_overrides` — the `places_posts_preview` row is inert and removing it changes nothing |

### 6.3 After you deploy

| | |
|---|---|
| **Anything to run** | No. No backfill, no cache purge, no cron change |

### 6.4 The after-deploy check, on Pizza Kitchen only

Pizza Kitchen is on the test plan tier, so it passes the new gate on its **plan** — the override is no
longer what grants it, which is the point of §1.3.

1. **Social media tab visible** — open `/manage/<token>`. "💬 Social media" sits directly after
   Schedule in the top bar.
2. **Create a post makes both posts** — Create a post → **Create post for next event** (left) gives a
   single event PNG with the caption filled; **Create weekly post** (right) gives the week's poster.
   Both carry "Powered by HatchGrab".
3. **The editor opens and moves text instantly** — Designs → Edit either design. Drag a box: the words
   move **with** it, in the same frame, with no wait. Drag a corner: the words resize with it. Change
   the font size or the colour: the words change at once. Press **👁 Preview post** to see the real PNG.
4. **Location settings pictures upload and remove** — pick a location, drop a PNG into any of the three
   boxes, check the preview is contained and the three boxes stay level, then press **Remove**. All
   three Upload boxes should sit at the same height whether the others are filled or empty.
5. **Share works** — on a finished post, Share (or Download on a desktop browser).

If any of those refuses with *"Social media posts are on Pro and Max"*, the plan gate is the thing
refusing and `trucks.plan` is what to look at.

### 6.5 What each plan sees, in plain words

| | |
|---|---|
| **A Pro truck** (and **a Max truck** like Gusto, and **any running or not-yet-started trial**) | A new **Social media** tab after Schedule, with Create a post, Designs and Location settings. A **Make post** shortcut on each event row in Schedule › Events. They upload the blank version of their own weekly graphic and their own event picture once, drag the date / place / time boxes where they want them, and from then on HatchGrab fills in the week from their schedule. Captions come filled and editable. Nothing is published until they press Create — **a truck that uploads nothing sees an invitation to set it up and nothing else changes for them** |
| **A Starter truck** | **No Social media tab.** Nothing else about their dashboard changes — Schedule still has its two pills, Add event still has its place picker, Tidy up places still works. If they reach a social URL by an old bookmark the tab is not in the bar and every route answers *"Social media posts are on Pro and Max"* |
| **An expired trial** | What Starter sees. `canAccess`'s expired branch is untouched — a past `trial_expires_at` denies every feature, which was already true and is not a decision this round made |

---

## 7. What was run

| | |
|---|---|
| `npx next build` | **clean, exit 0** — "✓ Compiled successfully", run again after the last edit. The new CSS carries `origin-top-left`, `inset-x-2`, `bottom-1.5`, `h-7`, `grow` |
| `npx tsc --noEmit` | clean |
| `eslint` on every file this round touched | **0 errors** in each of `lib/features.ts`, `lib/plan-features.ts`, `lib/copy/weeklyPost.ts`, `app/api/weekly-post/route.ts`, `app/landing/page.tsx`, `components/manage/LivePoster.tsx`, `lib/weekly-post/draw.ts`, `lib/weekly-post/live-fonts.ts`. ⚠️ `app/manage/[token]/page.tsx` and `app/api/manage/route.ts` carry **273 pre-existing** `no-explicit-any` errors between them; this round introduced **no** `any` — proved by searching the added lines of the diff |
| `scripts/places-posts-gating.cjs` | **48 passed** — rewritten for the launch; §1 is now eleven claims about the plan key, the retired key's absence, and the inert override |
| `scripts/plan-feature-order.cjs` | **29 passed** — the "no feature key" exception replaced by the positive claim, with the parity guard **run** |
| `scripts/social-posts.cjs` | **107 passed** |
| `scripts/schedule-graphics-places.cjs` | **259 passed** — the pinned consumer list went from three to **five** (§7.1) |
| `scripts/run-harnesses.cjs` | the full sweep, after the last edit — **98 run · 98 passed · 0 failed** |

### 7.1 The check that caught the launch — and was meant to

`scripts/schedule-graphics-places.cjs` pins an **exact count** of the files that name
`schedule_graphics` in code, and names each one. Its own note said *"the count is pinned at three so a
FOURTH consumer still has to be deliberate."*

The launch added **two**, so the sweep failed — which is the check working, not a problem:

| | Consumer | |
|---|---|---|
| 1 | `lib/features.ts` | the declaration, and now the `PRO_FEATURES` entry |
| 2 | `components/manage/SocialPosts.tsx` | the UI gate — still exactly **one** `FeatureGate` for all the boxes, not one per box |
| 3 | `app/api/weekly-post/route.ts` | the server; without it the feature is reachable by posting with a dashboard token and the UI gate is decoration |
| 4 | `app/manage/[token]/page.tsx` | **new** — the Social media tab and the "Make post" shortcut |
| 5 | `app/api/manage/route.ts` | **new** — the one tab-only write (`sg_place_usual_type`) |
| 6 | `lib/plan-features.ts` | the `ROW_FEATURE_MAP` entry — **data for the parity guard, not a gate** |

A second claim was added beside it: `places_posts_preview` is gone from the **code** of all six. Over
code lines only, because four of them carry a tombstone explaining the removal, and a check that
matched the prose would fail on the honest record of what happened.

**And one small thing that is worth knowing rather than hiding.** My first version of the landing-page
comment named the key in prose, which made the count **seven** — because that file's JSX comments have
no leading `*`, so the harness's line-based stripper cannot tell its prose from a gate. Rather than
loosen a shared stripper or weaken the claim, the comment now points at `lib/features.ts` instead of
repeating the literal, and says in one line why. That is the third time this round a claim about code
matched a comment about code; the rule keeps earning its place.

### 7.2 The harness that had to be turned around

`scripts/places-posts-gating.cjs` existed to prove the **opposite** of what is now true: that the key
was in no plan, that the route checked it **first**, and that the refusal said "not switched on" rather
than naming a plan. Eleven of its checks asserted that arrangement.

They were **rewritten rather than deleted**, with the old claims quoted, because the reasoning is the
record of why the preview existed. Two of them could not be asked before:

- **the promise is enforced** — the comparison row is mapped and `findPlanParityViolations()` is run;
- **the old override is inert** — `canAccess` is called with it and returns `false`.

And the one check in that file's history that caught a real shipped bug — the plan sentence against the
plan sets — is kept, pointing the other way.

---

## 8. Rules

- **Nothing was deployed and nothing was pushed.**
- **No SQL was run.** No new migration was needed; the nine in §4 are listed and unchanged. The two
  queries in §5 are `select` only and are for you to run.
- Only `test-truck` (Pizza Kitchen) was read. **No other truck was opened, called or changed** — and
  §3 proves the product contains no truck id at all.
- No `outreach_templates` row was created, edited, seeded or deactivated. No email was sent.
- No table, column or stored image was dropped or deleted. `truck_places.picture_use` is dead and
  **left in place** (§4.3).
- No process was killed.
- **No span of the brief arrived garbled, and no instruction contradicted another.** Two things are
  worth naming rather than leaving you to spot:
  1. The brief expected the table to be *"currently marked coming soon"*. It is at `HEAD` and was
     already `pro: true, max: true` in the working tree. Same destination; recorded in §2.1.
  2. The brief said *"use the SAME plan-feature key"* (singular) while the feature had **two** keys.
     The instruction resolves cleanly — one of them had to go, and the brief also says the override
     *"becomes harmless"*, which only the preview key's removal achieves. `schedule_graphics` is kept
     because it already asked "may this plan have social posts at all"; no new key was invented.
