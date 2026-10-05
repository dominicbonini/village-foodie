# Release prep: the merge into `main`, the audit, and what Pizzeria Gusto will see

**5 October 2026 · `main` at `bdf962a`, 36 commits ahead of `origin/main` · nothing pushed, nothing
deployed, no SQL run**

Part C: commit, merge locally, audit the merge three ways, re-run the whole gate on `main`, account for
every migration, write the Gusto list from the code, and give Dominic the deploy steps.

---

## 1 · THE COMMITS

The working tree held **five builds' worth** of uncommitted work. It is now two commits and the tree is
clean.

| | |
|---|---|
| `d973b52` | the code: event pricing, private events, the Places tab, the outreach composer, the preview key — 104 files |
| `bdf962a` | the six reports those builds wrote, and `combine-branches-report.md`'s one correction |

🔴 **ONE COMMIT FOR FIVE BUILDS, AND THAT IS THE HONEST SHAPE OF IT.** All five edit the same three
files — `app/manage/[token]/page.tsx`, `app/api/manage/route.ts`, `lib/features.ts`. A per-build split
means unpicking interleaved hunks inside those files, and **every intermediate commit it produced would
fail `tsc`**. A bisect that cannot build is worse than one commit that can. The commit message lists the
five pieces and names each report; the docs went separately because they are docs.

```
$ git status --porcelain | wc -l
0
```

---

## 2 · THE MERGE

### 2.1 It was a fast-forward, and the command is the assertion

`main`'s tip was `deec9f5` — the revert that took Schedule graphics stage 1 off production. **That same
commit is the merge base**, because the branch had already merged it and then restored the work by hand
(V13.9's note; `docs/combine-branches-report.md` §2).

```
$ git merge-base --is-ancestor main schedule-graphics && echo ancestor
ancestor
$ git log --oneline main ^schedule-graphics     # what main has that the branch does not
                                                # (nothing)
```

So `main` was an **ancestor**. I used `git merge --ff-only` deliberately: it **succeeds only if that is
true**, which makes the command itself the proof that nothing on `main` could be lost. A `--no-ff` merge
commit would have read more like a release in the log and proved nothing.

```
Updating deec9f5..bdf962a
Fast-forward
 … 273 files changed
$ git diff --stat schedule-graphics main
                       # empty — the merged tree is byte-identical to the branch tip
```

**Conflicts: none.** There was nothing to reconcile.

### 2.2 The audit was still run, and its own inputs had to be checked first

V13.9's lesson is that **a merge across a revert is a merge plus a revert, and the revert is the half
with no conflict markers**. A fast-forward cannot have that problem — but "cannot" is a claim, so I ran
the same three-way line-level audit the last combine used, over a multiset of trimmed, non-punctuation
lines across every text file in all four trees.

🔴 **AND THE FIRST RUN WAS WRONG IN A WAY THAT LOOKED RIGHT.** The script computed
`git merge-base main schedule-graphics` — *after* the merge, when `main` **is** the branch — so the base
came back as the merged tip. With that as the base, FORM 2 and FORM 3 both reduce to "the merged tree
against itself" and report nothing **for the wrong reason**. They printed `✓ nothing` and I nearly
believed them.

⛔ **A CLEAN AUDIT WHOSE INPUTS ARE WRONG LOOKS EXACTLY LIKE A CLEAN AUDIT.** The base is now a pinned
literal with an `--is-ancestor` check beside it that exits 2 if the pin is not an ancestor.

| Form | What it catches | Result |
|---|---|---|
| **1** · merged vs each tip | everything, including legitimate replacements | **530 lines**, all from `main` (= the base) |
| **2** · lines a side ADDED relative to the base that the merge dropped | unambiguous losses | **0** |
| **3** · base lines `main` removed that the branch still needs | the form that caught the two census files last time — FORM 2 cannot see them, those lines are *in* the base | **0** |
| files present on a side and absent from the result | the "deleted cleanly, with no conflict" class | **none** |

**FORM 1's 530 lines are accounted for, not waved through.** Every one of the 45 files carrying them was
touched by at least one branch commit after the base:

```
app/manage/[token]/page.tsx       236 lines rewritten · 17 branch commits
app/dashboard/[token]/page.tsx    101 lines rewritten ·  5 branch commits
lib/slot-interval.ts               31 lines rewritten ·  1 branch commit
scripts/_outreach-schema-census.cjs 18 lines rewritten · 3 branch commits
…  (41 more, none with 0)
```

Zero files with no explaining commit. These are the branch's own rewrites over 36 commits, which is
exactly the class FORM 1 exists to surface and FORM 2 exists to filter out.

### 2.3 The four classes a merge loses silently — checked by name

The brief names these, and each one lands as a clean `D` or a dropped array entry with no conflict:

| Class | Base | `main` now | Lost |
|---|---|---|---|
| `supabase/migrations/*` | 148 files | **163** | **0** |
| `scripts/harnesses.json` entries | 81 | **93** | **0** · and none registered-but-missing on disk |
| `lib/features.ts` Feature keys | 24 | **28** | **0** · added: `schedule_graphics`, `event_types`, `private_events`, `places_posts_preview` |
| the census's scoped write-payload reader | — | `declarationInScope` **present** | `soleDeclaration` survives only in the two AST helpers where it is correct, not in the payload reader |

**Two stage-1 files are absent from `main`, and both are deliberate:**

- `components/manage/ScheduleGraphicsTab.tsx` — deleted in `1f98f22` when the Schedule sub-tabs replaced
  it, and `scripts/schedule-graphics-places.cjs:889-890` **asserts it does not exist**.
- `scripts/schedule-graphics-render.cjs` — replaced by `scripts/schedule-places-render.cjs`. Referenced
  only in old reports, and not registered in `harnesses.json`.

Neither is a loss. Both were checked rather than assumed.

---

## 3 · THE GATE ON `main`

### 3.1 Compile

```
$ npx tsc --noEmit        # clean
$ npm run build           # ✓ Compiled successfully in 5.8s
```

### 3.2 ESLint, against the base measured the same way

I built a worktree at `deec9f5` and ran the same ESLint invocation in both, then diffed by **area and
rule** — because the whole-repo number moves for a reason that is not a regression.

| Area | Errors | Warnings |
|---|---|---|
| **`app/` + `lib/` + `components/`** | 772 → **779** (+7, and **+5** once `_pretest.cjs` is set aside — see below) | 225 → 273 |
| **`scripts/`** | 439 → **518** (+79) | 54 → 67 |
| **`supabase/`** | 0 → 0 | 0 → 0 |

**The `scripts/` +79 is entirely `@typescript-eslint/no-require-imports`** (+78 from the seven new
harnesses, and one more from the `require` this build added to `places-posts-gating.cjs` so it can
compile `lib/features.ts` and call `canAccess`). `require()` is the idiom every one of the 93 harnesses
uses, and the rule already had 434 hits at the base. Not a quality change.

**The src +7, by rule and file:**

| Rule | Δ | Where |
|---|---|---|
| `no-explicit-any` | +6 | `app/api/dashboard/route.ts` (+5), `app/api/discovery/events/route.ts` (+1) |
| `no-require-imports` | +2 | `_pretest.cjs` — **not part of this release, see §3.3** |
| `react-hooks/preserve-manual-memoization` | +2 | `app/dashboard/[token]/page.tsx` |
| `react-hooks/set-state-in-effect` | +1 | `app/trucks/[slug]/order/page.tsx` |
| `react/no-unescaped-entities` | **−4** | `app/dashboard/[token]/page.tsx` |

**No new rule class.** Every increase is in a rule this repository already carries in bulk (613 `any`,
61 `set-state-in-effect`), and one rule improved. Set `_pretest.cjs` aside and the real delta is **+5**.

### 3.3 A finding: `_pretest.cjs`

It is **untracked**, sits in the **repository root**, and its first two lines build a Supabase client
with `SUPABASE_SERVICE_ROLE_KEY` and then `update()` rows on `trucks` and `menu_items_db`.

⛔ **IT IS NOT IN `scripts/`, SO THE HARNESS SCREEN NEVER SEES IT.** That screen exists because a stray
script once overwrote 132 `discovery_trucks` rows with the service role (V13.5), and it refuses any
listed file that builds a client. A file outside the directory is outside the screen.

**I have not touched it** — it is not mine to delete, and being untracked it will not be pushed. It is an
open item: move it into `scripts/` (where the screen would refuse it) or delete it.

### 3.4 The full sweep, in five chunks, one at a time

```
chunk1   19 run · 19 passed · 0 failed
chunk2   19 run · 19 passed · 0 failed
chunk3   19 run · 19 passed · 0 failed
chunk4   19 run · 19 passed · 0 failed
chunk5   17 run · 17 passed · 0 failed
                  ── 93 of 93 ──
```

⚠️ **A CHUNKED RUN WARNS ABOUT THE OTHER 74 FILES.** The runner's drift check compares `scripts/` against
the list it was handed, so each chunk reports the 74 files not in *that* chunk as unaccounted. It is an
artifact of chunking. Confirmed against the full list: **0 warnings.**

### 3.5 The browser harnesses, Chromium and WebKit

| | |
|---|---|
| `HG_RENDER=1 outreach-bold-persists.cjs` | **all 78 passed (68 in a real browser)** — the operator's three bold steps, Small, Italic, Undo, B's highlight, the stubbed send both ways, and **2 variants that both go red** when the defect is restored |
| `event-types-render.cjs` | **1,790 measurements**, 0 failed — the modal, the new-type popup and the dashboard card at 1440/820/390 in both engines |
| `HG_RENDER=1 outreach-editor-toolbar.cjs` | all 104 passed (56 in a browser) |
| `HG_RENDER=1 schedule-graphics-places.cjs` | all 257 passed |
| `HG_RENDER=1 screenshot-truck-details.cjs` | layout green in every engine that ran |
| `HG_RENDER=1 places-tab.cjs` · `weekly-post.cjs` | 61 · 207 |
| `HG_RENDER=1 outreach-workspace-v3-fixes / v4 / v4-fixes · outreach-templates-layout` | 65 · 71 · 48 · 127 |

### 3.6 Five things the gate found, each fixed at its cause

**(a) 🔴 "The weekly post is on Pro and Max" was false.**

`schedule_graphics` is in `MAX_FEATURES`, not `PRO_FEATURES`. I checked by **calling the function** for
every plan rather than reading the comments:

```
schedule_graphics      starter=false  pro=false  max=true   trial=true
event_types            starter=false  pro=false  max=true
private_events         starter=false  pro=true   max=true
places_posts_preview   starter=false  pro=false  max=false   (true only via feature_overrides)
```

So a **Pro** truck was told the weekly post came with their plan and then refused it — and sent to
billing for something billing cannot sell them. The sentence was written out **twice**, in the route's
refusal and in the screen's `upgradeMessage`, **both wrong the same way**. Two copies of one claim is two
chances to be wrong about it.

Fixed as one constant in `lib/copy/weeklyPost.ts`, read by both. ⛔ The first attempt exported it from the
route and imported it into the component, which pulled the route's server-only dependencies into the
client bundle and **failed the Turbopack build with two errors out of `@vercel/og`** — a string shared
between a route and a component belongs in `lib/copy/`, which is what that directory is for.

And `scripts/places-posts-gating.cjs` now **compiles `lib/features.ts` and calls `canAccess` for all four
plans**, asserting the key's tier *alongside* the wording. Pinning the wording alone would pass again the
moment the key moved; pinning the key alone would pass with the wrong sentence.

**(b) ⚠️ Four tables this release adds were not censused.**

`event_types`, `event_item_prices`, `private_event_links`, `place_pictures`. The census exists so that "a
feature can never name a column that does not exist", and `truck_places` and `van_category_settings` were
both added to it **at creation** for exactly that reason. Four features shipped reading four uncensused
tables.

⛔ **IT MATTERS MORE ON THESE THAN ON MOST**, because every one is read by a path that degrades by design:
the pricing resolvers fall back to menu prices, the Places pin falls back to "Automatic". A column that
does not exist therefore produces the **degraded** behaviour rather than an error — the one failure mode
a census is for.

All four added. **1,565 column references across 14 tables, every one proved present in a migration**
(was 1,354 across 10). It needed two small, reasoned additions:

- a **waiver** for `readTypedPrices(column: 'event_id' | 'event_type_id')`, which passes its parameter to
  `.eq()` — a literal at every call site and never at the call. Not an exemption: both column names are
  listed in the waiver and censused like any others. It also meant teaching the waiver mechanism to cover
  a **filter** method, not only `.select()`, keyed on the method so a `.select()` waiver cannot silently
  excuse an `.eq()`.
- a third **"no `id`" exception**: `private_event_links.token` *is* the primary key, because the token is
  the identity of the link and a surrogate id would allow two rows claiming the same one.

**(c) ⚠️ The runner was warning about four unaccounted files.** Now accounted for: a new `one_off_tools`
excluded group for `_fetch-weekly-post-fonts.cjs` and `_weekly-post-examples.cjs` — both **write files
into the repository**, so sweeping them would rewrite committed bytes and could quietly change what the
weekly-post harness measures against; `_png-decode.cjs` into `shared_modules`; and
`add-order-stale-browser.cjs` into `needs_a_browser`, whose `$why` now records that it is the stricter
case (it needs the dev server, the project and an operator session, so it can never be swept).

**(d) and (e)** Two harness guards pinned to a floating HEAD were already red before this prompt and are
re-aimed, each with the reason written in: `screenshot-truck-details.cjs`'s single-string allowlist for
`/api/inbound-schedule` became a **list** whose entries expire if the line goes, and
`capacity-move-identity.cjs` asserted the two copy-field unions were **equal** when the claim was "the
split moved fields, it did not lose them" — `takes_cash` was correctly added by 20261012, and the correct
change made the check fail.

---

## 4 · MIGRATIONS

Fifteen migrations are new on `main` against the base.

| File | What it adds |
|---|---|
| `20261003_truck_places.sql` | tables `truck_places`, `truck_place_groups`; `trucks.default_group_post_wording` |
| `20261004_schedule_places_stage2.sql` | `truck_places.area/is_favourite/is_hidden/merged_into_id`; `truck_events.truck_place_id`; `trucks.event_post_wording`; **drops** `group_post_wording` |
| `20261005_van_category_settings.sql` | table `van_category_settings`; `truck_vans.same_as_first_van` |
| `20261006_truck_post_designs.sql` | table `truck_post_designs` |
| `20261007_event_post_backgrounds.sql` | table `event_post_backgrounds`; `truck_places.event_bg_path/width/height` |
| `20261008_event_post_place_layouts.sql` | `truck_places.event_layout` |
| `20261009_event_types.sql` | table `event_types`; `truck_events.event_type_id`, `order_ready_source` |
| `20261010_capacity_same_as_first_van.sql` | `truck_vans.capacity_same_as_first_van` |
| `20261010_event_types_offline.sql` | `event_types.offline_protection`, `offline_protection_mode`, `offline_auto_reject_mins` |
| `20261011_event_pricing.sql` | table `event_item_prices`; `event_types`/`truck_events` price columns |
| `20261012_van_cash_and_type_values.sql` | `truck_vans.takes_cash` |
| `20261013_event_item_prices_unique.sql` | the 42P10 fix — a non-partial unique index to upsert onto |
| `20261014_private_events.sql` | table `private_event_links`; `truck_events.is_private/private_name/private_token`; `event_types.kind` + the private-ordering columns |
| `20261015_places_tab.sql` | table `place_pictures`; `truck_places.usual_event_type_id` |
| `20261016_place_usual_standard.sql` | `truck_places.usual_type_is_standard` |

**You have stated all of `20261007` → `20261016` are applied, and that production already matches this
branch.**

⚠️ **ONE THING TO FLAG RATHER THAN ASSUME: `20261003`–`20261006` are outside the range you listed.**
`docs/combine-branches-report.md` records `20261003` as "applied to production by hand", and §12 of that
report says the schedule-graphics migrations are "unchanged and already applied by hand" — so the written
record agrees with "production already matches this branch". I have not read the database, so I am
telling you rather than concluding it. One read-only query settles it:

```sql
-- READ-ONLY. Expect every row to read `t`.
select 'truck_places.usual_type_is_standard (20261016)' as what, exists (select 1 from information_schema.columns
  where table_schema='public' and table_name='truck_places' and column_name='usual_type_is_standard') as ok
union all select 'truck_places.usual_event_type_id (20261015)', exists (select 1 from information_schema.columns
  where table_schema='public' and table_name='truck_places' and column_name='usual_event_type_id')
union all select 'place_pictures (20261015)', exists (select 1 from information_schema.tables
  where table_schema='public' and table_name='place_pictures')
union all select 'private_event_links (20261014)', exists (select 1 from information_schema.tables
  where table_schema='public' and table_name='private_event_links')
union all select 'truck_events.is_private (20261014)', exists (select 1 from information_schema.columns
  where table_schema='public' and table_name='truck_events' and column_name='is_private')
union all select 'event_types.kind (20261014)', exists (select 1 from information_schema.columns
  where table_schema='public' and table_name='event_types' and column_name='kind')
union all select 'event_item_prices (20261011)', exists (select 1 from information_schema.tables
  where table_schema='public' and table_name='event_item_prices')
union all select 'event_types.price_change_on (20261011)', exists (select 1 from information_schema.columns
  where table_schema='public' and table_name='event_types' and column_name='price_change_on')
union all select 'truck_vans.takes_cash (20261012)', exists (select 1 from information_schema.columns
  where table_schema='public' and table_name='truck_vans' and column_name='takes_cash')
union all select 'event_types (20261009)', exists (select 1 from information_schema.tables
  where table_schema='public' and table_name='event_types')
union all select 'truck_events.event_type_id (20261009)', exists (select 1 from information_schema.columns
  where table_schema='public' and table_name='truck_events' and column_name='event_type_id')
union all select 'truck_post_designs (20261006)', exists (select 1 from information_schema.tables
  where table_schema='public' and table_name='truck_post_designs')
union all select 'van_category_settings (20261005)', exists (select 1 from information_schema.tables
  where table_schema='public' and table_name='van_category_settings')
union all select 'truck_places.area (20261004)', exists (select 1 from information_schema.columns
  where table_schema='public' and table_name='truck_places' and column_name='area')
union all select 'truck_places (20261003)', exists (select 1 from information_schema.tables
  where table_schema='public' and table_name='truck_places')
union all select 'the places_posts_preview grant is on test-kitchen', exists (select 1 from public.trucks
  where id='test-kitchen' and feature_overrides->>'places_posts_preview'='true');
```

### Does the code read anything that is not in a migration?

**No, and it is proved mechanically rather than asserted.**
`scripts/outreach-schema-census.cjs` parses every `.select()`, `.insert()`, `.update()`, `.upsert()`,
`.or()` and filter call in `app/`, `lib/` and `components/` and checks each column against the DDL in
`supabase/migrations/`: **1,565 references across 14 tables, every one present.** The 14 now include all
four tables this release adds.

⚠️ **THE CENSUS COVERS 14 TABLES AND THE CODE READS 66.** The other 52 predate `supabase/migrations/` or
belong to older features; that gap is pre-existing and is not something this release should close in a
release-prep prompt. The four tables *this release* adds are covered, which is the claim §4 needs.

### If the code went live before a migration

It will not have to — all fifteen are applied. But the answer matters, so: **nothing breaks.** Every new
column is read behind a capability probe that treats `42703`/`42P01`/`PGRST204`/`PGRST205` as "not there
yet" and **degrades**:

| Absent | Behaviour |
|---|---|
| the pricing columns / `event_item_prices` | menu prices, exactly as before pricing existed |
| `truck_places.usual_event_type_id` | "Automatic" — the existing newest-event-at-this-place rule |
| `truck_places.usual_type_is_standard` | the pin read **retries naming only 20261015's column**, so pins already set are not lost |
| `event_types` / `event_type_id` | every resolver returns today's value |
| `place_pictures` | the pictures pane reports the named migration rather than erroring |

⛔ **PRIVACY IS THE EXCEPTION, DELIBERATELY: ITS PROBES FAIL CLOSED.** If `is_private` cannot be read, a
public surface **hides** the event rather than publishing it. The two errors do not cost the same.

---

## 5 · THE GUSTO LIST

Written from the code only. **I have not read or written a single row of Pizzeria Gusto's data.** Where a
difference is plan-dependent I state Pro and Max separately; the tiers are from `canAccess`, called, not
from comments.

### 5.1 Manage: the navigation and Settings (V13.8/V13.9 work, now shipping)

| | |
|---|---|
| **VISIBLE** | **Settings is one long scrolling list with sticky jump tabs** instead of separate cards: Truck details (now including the logo) · Contact · Order settings · Truck settings · Schedule · QR code · Auto-replies · Account deletion. Nothing was removed; the cancellation group moved into **Order settings** |
| **VISIBLE** | **Sub-tabs are pills.** Menu, Schedule and Settings each have a pill row that scrolls sideways on a phone while the page does not |
| **VISIBLE** | **Kitchen capacity is the second Menu pill**, not a Settings card. With more than one van there is one question — *"Same kitchen capacity for all vans?"*, default **on** |
| **VISIBLE** | **"Finding events automatically" is back in Settings › Schedule**, where it was. A modal that briefly held it was reversed before release, so this is the familiar place |
| **BEHAVIOUR-ONLY** | Four pieces of copy were removed at your request (the Settings capacity pointer, "Kitchen capacity has its own switch…", "Changes to the first van are copied here.", "⚠ Slot capacity limits still apply…"). The behaviour behind each is unchanged |

### 5.2 Schedule

| | |
|---|---|
| **VISIBLE** | **Schedule has two pills for Gusto: Events and Event types.** ⛔ **Places and Social posts are HIDDEN for them** — `places_posts_preview` is in no plan and only `test-kitchen` holds it. Filtered out, not greyed: a pill that opens a refusal is worse than no pill when no plan can buy it |
| **VISIBLE** | **No "Make post" button on any event row**, for the same reason |
| **VISIBLE** | **Add event is rebuilt**: a list of their own places down the left, a **"Tidy up places"** screen, a **type pill row** after the date, and a **live preview card** that renders the public schedule's own component |
| **BEHAVIOUR-ONLY** | Picking a place fills the venue, town, postcode and address, and **pre-selects the van** used at that place's most recent non-cancelled event. It never guesses: no history ⇒ the field is left alone |
| **BEHAVIOUR-ONLY** | Their places list **seeds itself** from the pitches already in their schedule the first time the Add event modal opens. No event row is written or changed |
| **VISIBLE** | An old `?section=places` or `?section=weekly` bookmark **lands on Events** instead of an empty pane |

### 5.3 Event types — **Max only**

| | |
|---|---|
| **VISIBLE (Max)** | A grid: **Standard** plus any types they create (Festival, Pub, Market, Private hire are name suggestions only — a new type starts exactly like Standard). One column per active van when they have more than one |
| **VISIBLE (Max)** | Rows: Collection times · Order-ready step · Do you take cash? · Offline order protection · Remind me to add a buzzer · and the **prices** rows |
| **VISIBLE (Pro)** | A Pro truck **still sees the Event types pill**, showing **Standard and Private only**. "+ New event type" and the price rows carry a **Max** badge and refuse server-side |
| **BEHAVIOUR-ONLY** | **Resolve on read.** A type never writes onto an event; the effective value is *the event's own hand change ?? the type ?? the van/truck default*. A hand change on one event **always wins** |
| **BEHAVIOUR-ONLY** | Every existing event has `event_type_id` NULL, so **every resolver returns exactly today's value** until they create a type and assign it |

### 5.4 Prices — **Max only**, and nothing changes until they set one

| | |
|---|---|
| **BEHAVIOUR-ONLY** | 🔴 **NOTHING CHANGES UNLESS THEY SET A PRICE RULE.** No type has pricing on, no event carries its own prices, and `event_item_prices` ships empty |
| **VISIBLE (Max)** | A type can change prices by a **percentage** or a **fixed amount**, rounded how they choose, with **per-item typed prices** on top. Prices may go up or down, never below £0. There is no "food only" option |
| **BEHAVIOUR-ONLY** | 🔴 **A CUSTOMER NEVER SEES A RULE.** The menu, the order page and the receipt all show one resolved figure — no "+10%", no original struck through |
| **BEHAVIOUR-ONLY** | **Orders already placed keep their prices.** The price is locked into `orders.items[].unit_price` at the moment of ordering, and nothing in this release touches the orders table |

### 5.5 Private events — **Pro and Max**

| | |
|---|---|
| **VISIBLE** | **"Private" is a type in the Add event pill row.** Choosing it opens a purple panel explaining what changes and asking for an event name guests will see |
| **VISIBLE** | The **preview card** then shows a lock and **"Private event"** in purple with the date, the times and the van — and **no venue, town or postcode**, with a line beneath saying so |
| **VISIBLE** | A private event row carries a **Private** chip and a **"Link & QR"** button — the guests' ordering link and a QR code to print |
| **VISIBLE (public)** | On their **public schedule** and on the **embed**, a private event reads **"Private event"** with the date and times. No venue, town, postcode, address, map pin or notes |
| **VISIBLE (public)** | ⛔ **It is DROPPED ENTIRELY from the map and from Village Foodie discovery** — not redacted. A row with null coordinates would still be a row |
| **VISIBLE** | ⛔ **A private event gets no social post.** The button is absent and the route refuses: a graphic is the most public thing this app makes |
| **BEHAVIOUR-ONLY** | 🔴 **Future scraped "Private Hire" rows arrive marked private, FOR APPROVAL.** Their website lists these as venue "Private Hire" with no time and no town, so the signal is already in the data. The match is a **whole word, case-insensitive** — "Private Hire", "private event", "PRIVATE PARTY" yes; "Privateer Brewery" no; **"wedding" deliberately NOT**, because a wedding fair is public trade. The type and the ordering token are set at **confirm**, never from a scraped guess |
| **BEHAVIOUR-ONLY** | ⚠️ **Their six existing `cancelled` rows are untouched.** Nothing backfills `is_private`; this affects rows created from now on |
| **BEHAVIOUR-ONLY** | A downgrade does **not** unpublish anything: an existing private event keeps its flag and its token, and the screens go read-only |

### 5.6 The dashboard

| | |
|---|---|
| **VISIBLE** | A **"This event" card** gathering every per-event setting in one place, **for this event only**: the buzzer reminder, "Do you take cash?", the order-ready step, collection times (which hands over to its existing box) and offline order protection — five controls that used to be spread across the Kitchen tab |
| **VISIBLE** | The card also carries the **event type** with a confirm, and on a private event the **private link** row |
| **BEHAVIOUR-ONLY** | Switching a **live** event's type is allowed, and the confirm says what changes: new orders use the type's settings, **orders already placed keep their prices**, and their own changes for this event stay |
| **BEHAVIOUR-ONLY** | Every value the card shows is the same resolver the ordering engine reads. A faded value means "from the type"; a solid one means "this event's own" |

### 5.7 "Do you take cash?" moves to each van

| | |
|---|---|
| **VISIBLE** | It was one truck-level question; it is now **per van**, in each van's settings |
| **BEHAVIOUR-ONLY** | **"Same as Van 1" copies it** like every other per-van setting. A van with no answer of its own follows the truck, so **today's behaviour is unchanged** until they set one |

### 5.8 Offline order protection

| | |
|---|---|
| **VISIBLE** | It reads as a **switch** with its mode beside it, and it is an event-type setting as well as a per-van one |
| **BEHAVIOUR-ONLY** | ⚠️ **The auto-reject delay is NOT a type setting** and stays per event on the dashboard. Its only consumer is a plpgsql function that cannot read the resolver — a type value would be a switch with nothing behind it |

### 5.9 Plan wording — landing page and Billing

| | |
|---|---|
| **VISIBLE** | One "**Event & festival pricing · Coming soon**" bullet on the Max card became **two built rows**, because they are two products on two tiers: **Pro** gains *"Private events with their own ordering link"*, **Max** gains *"Custom event types & pricing"*. Neither carries "Coming soon" |
| **VISIBLE** | The comparison table matches: `Private events` is **Pro and Max**, `Custom event types & pricing` is **Max**. Both are hard `true`, which **adds** two parity checks — a `coming_soon` cell is exempt from the guard that compares a cell against `canAccess` |
| **BEHAVIOUR-ONLY** | ⚠️ **"The weekly post is on Max"**, corrected this build. It said "Pro and Max" about a Max-only key, so a Pro truck was told it came with their plan and then refused it |

### 5.10 Not visible to them at all

| | |
|---|---|
| **BEHAVIOUR-ONLY** | **The outreach composer fixes are admin-only** — the bold bug, the silent Send, the past follow-up date, Undo. Nothing on any operator or customer surface |
| **BEHAVIOUR-ONLY** | **The Places tab and Social posts** exist in the code and are switched off for them |
| **BEHAVIOUR-ONLY** | `/p/<token>` and `/api/private-event` are now **rate-limited** and sent `noindex, noarchive, nosnippet`. Only reachable with a token |
| **BEHAVIOUR-ONLY** | The Places endless-spinner fix, the grid row heights, the WebKit `<select>` work, and the harness guards — all internal |

### 5.11 What is NOT changing for them, and is worth saying

Ordering, payment, slots, batching, capacity admission, printing, KDS, WhatsApp, the customer order page
and the receipt all behave exactly as they do today. The pricing engine, the paid step and the cash chain
were each proved **byte-identical** against a named parent commit across hundreds of inputs
(`event-types.cjs`, `event-pricing.cjs`, `capacity-move-identity.cjs`).

---

## 6 · DEPLOY

### 6.1 What you run

```
git push origin main
```

Vercel builds from `main`. **Nothing else:** no SQL (all fifteen migrations are applied), no environment
variable, no cron change, no storage policy. The `places_posts_preview` grant is already on
`test-kitchen`.

⚠️ `main` is **36 commits ahead** of `origin/main`, and the first of them is `cebc78e`, which is the
record of taking stage 1 off production. The push is a fast-forward on the remote too.

### 6.2 Straight afterwards, on the live site

1. **Pizza Kitchen** (`test-kitchen`) → Manage › Schedule shows **four** pills: Events · Event types ·
   **Places** · **Social posts**. Open both new ones; Places lists their pitches, Social posts loads.
2. **Any other truck** → Manage › Schedule shows **two** pills, and **no "Make post"** on any event row.
3. **A private event on a public schedule** → `/trucks/<slug>` shows it as **"Private event"** with the
   date and times, **no venue, town or postcode** — and the event is **absent from the map**.
4. **Pizzeria Gusto** → their order page loads and will take an order; their dashboard loads and shows
   today's event with the **"This event"** card.
5. **The landing page** → the **Pro** card says *"Private events with their own ordering link"*, the
   **Max** card says *"Custom event types & pricing"*, and **neither** carries "Coming soon". The
   comparison table agrees.

⛔ **If (3) shows a venue, stop and roll back.** That is the one failure in this release with a cost that
cannot be undone by a second deploy.

---

## 7 · LOCALHOST TESTS ON `main` — Pizza Kitchen only

The handful that prove the merge lost nothing. `npm run dev`, then Pizza Kitchen's Manage page.

1. **Bold.** Admin → Outreach → a prospect → Compose (email). Select all, press **B** → all bold. Select
   all, press **B** → all plain. **Click in the message body → it stays plain.** Click a few more times:
   the B button no longer flickers. Press **Cmd+Z** → the last formatting change undoes.
2. **Private event, save.** Schedule → Events → **+ Add event**. Fill a venue, a date and times, choose
   **Private** in the pill row, give it a name. The preview shows 🔒 **Private event** in purple with no
   venue. **Save.** The row appears with a **Private** chip and a **Link & QR** button.
3. **Private event, edit.** **Edit** that event. It opens with **Private** already selected and the
   preview still redacted — **no flash of the address**. Change the time, save, reopen: still private.
4. **Prices on the customer menu.** Event types → a type → turn prices on, set +10%, round to 10p. Assign
   it to today's event (dashboard → "This event"). Open `/trucks/pizza-kitchen/order`: the prices are the
   raised ones, shown as **one figure** — no rule, nothing struck through.
5. **Cash per van.** Settings → a van → **"Do you take cash?"**. With two vans, turn **"Same as Van 1"**
   on for the second and confirm it follows. The dashboard "This event" card shows the resolved value.
6. **Places and Social posts, visible only here.** Both pills are present on Pizza Kitchen and both open.
   Then open **Village Spice**'s Manage page: Schedule shows **two** pills, no "Make post" on any row, and
   `?tab=schedule&section=places` **lands on Events** with the parameter cleared.
7. **Automatic (…) and the Standard pin.** Places → a place → **Usual event type**. The first option names
   the type actually last used there, not always "Standard". Choose **Standard**, reload: it is still
   Standard. Open **Add event**, pick that place: the pill row pre-selects **Standard**.

---

## 8 · WHAT I DID NOT DO

- **Nothing pushed, nothing deployed.** `main` is local.
- **No SQL run**, of any kind.
- **No Gusto data read or written.** §5 is from the code.
- **No outreach email sent**, and no `outreach_templates` row created, edited, seeded or deactivated. The
  bold harness replaces `window.fetch` before the component mounts and **records** the send.
- **No card charge.**
- **No process killed by name.** Every background task was stopped by the id the tool returned.
- `_pretest.cjs` **left alone** (§3.3) — it is untracked and will not be pushed, but it should be dealt
  with.

## 9 · OPEN ITEMS

| Item | State |
|---|---|
| **Deploy** | yours to run — §6 |
| The pre-`20261007` migrations are outside the applied range you stated | one read-only SELECT — §4 |
| `_pretest.cjs` | untracked in the root, service-role writes, outside the harness screen |
| The census covers 14 of the 66 tables the code reads | pre-existing; the four new ones are now in |
| ESLint +5 in `app/`/`lib/` | no new rule class; §3.2 lists each one |
| `add-order-refresh-inputs.cjs` takes ~210s | the longest in the sweep; noted, not a failure |
| From V13.9 | `claim_order_for_auto_reject` cannot read event types · `offline_auto_reject_mins` has no DDL in the repo · `DemoLockChip.tsx` has no consumer · the stale-stage SQL |
