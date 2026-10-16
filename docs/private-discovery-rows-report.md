# Private bookings on Village Foodie: diagnosis, fix, and a re-check of the private-event fix on live data

16 October 2026. Sources: docs/language-phase-1e-tidy-report.md (§7; "Listed for you" items 1–3) and docs/private-event-approval-fix-report.md. Nothing is pushed, deployed or committed. This work sits on top of the uncommitted Language Phase 1e tidy.

## Summary

- **Gusto's private bookings do not show today**, but only by luck: Gusto's scraped listing is `excluded`.
- **The same kind of row on any shown truck does show:**
  - **live:** Marky D's "Closed" days on **24 December and 3 January** reach Marky D's Village Foodie page, the `/venues/closed` page and, from 10 December, the home list;
  - **the cause:** every scraped row was written public. The public feed never looked at the title, and it doesn't read the `visibility` column at all.
- **Fixed in one shared helper** (`lib/discovery-private.ts`):
  - the one write path stores such rows non-public;
  - the feed skips them as a second guard.
- **Existing rows:** 14 across 4 trucks; the SQL below is NOT RUN.
- **The private-event fix (`cea794f`) still hasn't met live data.** No import has run since it went live; the only new events are 4 manual demo events. No junk exists, so no clean-up SQL.

## Garbled spans and contradictions

- **No garbled spans.**
- **One smaller choice:** the brief asks for "the existing non-public visibility value". The column it names (`discovery_events.visibility`, CHECK `'public' | 'hg_only' | 'hidden'`) is **not read by any public surface**. What the feed filters on is `show_on_vf` / `show_on_hg`. So a non-public row is written with all three columns set, using values they already allow: `visibility = 'hidden'`, `show_on_vf = false`, `show_on_hg = false`.
  - The gate already hides rows with those booleans: superseded rows, and rows of countries other than Village Foodie's.
  - Setting `visibility` alone would have changed nothing anyone sees.
  - No new value is added.
- **Correction to the tidy report.** Its "Listed for you" item 3 called these rows "visibility public" as if that published them. The real gates are below.

## 1 · Diagnosis

### Every reader of `discovery_events`, traced

| Reader | Public? | What it filters on |
|---|---|---|
| **`app/api/discovery/events`**, the feed | **Yes, the only public reader** | Row: `country = 'GB'`, `show_on_vf` (Village Foodie host) or `show_on_hg` (HatchGrab host), `event_date >= today`, `superseded_by is null`. Truck (joined, or found by name when the row has no link): not `excluded`, and its own `show_on_*` true; an unknown truck is dropped. **Nothing on the title or venue, and no `visibility`.** On the HatchGrab host the scraped leg is empty: `filteredDiscovery = isHG ? [] : …`, so operator events only. |
| ↳ `hooks/useVillageData` → the **home page** (`app/page.tsx`) | Village Foodie | List: the next 14 days by default. With the visitor's location on, a row with no coordinates is dropped (11-mile filter); without it, it is listed. Map: rows with coordinates only (`components/MapView.tsx`). |
| ↳ **truck pages** (`app/trucks/[slug]/TruckClient.tsx`) | Village Foodie (and HatchGrab, operator events only) | Every future event of that truck (`date: 'unlimited'`), as list cards; the map needs coordinates. |
| ↳ **venue pages** (`app/venues/[slug]/VenueClient.tsx`) | Village Foodie | Rows grouped by `venueGroupKey`: the linked venue's slug, else **the slug of the row's own venue name** (so "Closed" groups at `/venues/closed`). |
| ↳ **truck directory** (`app/trucks/page.tsx`) | Village Foodie | Trucks only (no event titles). |
| `app/api/embed/events`, `app/api/events` | Public | Read `truck_events`, not `discovery_events`. |
| `app/sitemap.ts` | Public | Village Foodie lists its root only; no events or venues. |
| Newsletter / weekly schedule | — | A Tally form; no code reads `discovery_events` for it. No cron reads it either. |
| Admin: `app/api/admin/outreach`, `app/api/admin/discovery-events`, `app/admin`, `components/admin/*`, `lib/schedule-match`, `lib/outreach-step` | Admin only | Outreach counts every row whatever its flags, so it is unchanged by this fix. |

**Writers.** Every insert goes through `lib/discovery-gate.ts` `admitDiscoveryEvents`:
- `scripts/run-scraper.js` and `scripts/import-hatchesup-schedule.js` post to `/api/discovery/ingest`;
- `/api/inbound-schedule` calls the gate directly.

Before this fix, the gate wrote every row `visibility: 'public'` with `show_on_vf / show_on_hg` both true for GB.

### Live data (read-only)

**Visibility values in use, with the flags that matter:**
```sql
select visibility, show_on_vf, show_on_hg, count(*) as rows,
       count(*) filter (where event_date >= current_date) as future
from public.discovery_events group by 1,2,3 order by 1,2,3;
```
| visibility | show_on_vf | show_on_hg | rows | future |
|---|---|---|---:|---:|
| hg_only | false | true | 7 | 0 |
| public | false | false | 10 | 8 |
| public | true | true | 849 | 668 |

The column's constraint: `CHECK (visibility = ANY (ARRAY['public','hg_only','hidden']))`, default `'public'`. `'hidden'` is allowed but unused.

**Generic-titled rows across all trucks** (same normalisation as `lib/generic-venue-names.json`), with the gates the feed really uses:
```sql
with g as (
  select d.*, t.name as dt_name, t.excluded as truck_excluded, t.show_on_vf as truck_vf
  from public.discovery_events d left join public.discovery_trucks t on t.id = d.discovery_truck_id
  where regexp_replace(lower(coalesce(d.venue_name,'')), '[^a-z0-9]', '', 'g') = any (array[
    'private','privateevent','privateevents','privateparty','privateparties','privatehire','privatebooking',
    'privatefunction','privatefunctions','privatecatering','corporateevent','corporatelunch',
    'closed','tbc','tba','tbd','venuetbc','venuetba','locationtbc','locationtba','event','events'])
)
select coalesce(dt_name, '(no FK) ' || truck_name) as truck, visibility, show_on_vf as row_vf, show_on_hg as row_hg,
       truck_excluded, truck_vf, (superseded_by is not null) as superseded, country,
       count(*) filter (where event_date >= current_date) as future, count(*) filter (where event_date < current_date) as past,
       string_agg(distinct venue_name, ', ') as titles
from g group by 1,2,3,4,5,6,7,8 order by 1;
```
| truck | visibility | row vf / hg | truck excluded / vf | future | past | titles |
|---|---|---|---|---:|---:|---|
| (no link) Village Spice | public | true / true | — (no discovery truck of that name) | 1 | 0 | Private Event |
| **Marky D's** | public | true / true | **false / true** | **2** | 0 | **Closed** |
| Pizzeria Gusto | public | true / true | **true / false** | 1 | 9 | Corporate Lunch, Private Event, Private Hire |
| Real Thai Food | hg_only | false / true | true / true | 0 | 1 | TBC |

All rows are GB and none is superseded. The rule's other half (the whole word "private" in the venue or notes, outside the list) matches **no** live row, so it adds no false positives today:
```sql
select d.truck_name, d.venue_name, left(d.event_notes, 120), d.event_date from public.discovery_events d
where (d.venue_name ~* '\yprivate\y' or d.event_notes ~* '\yprivate\y')
  and regexp_replace(lower(coalesce(d.venue_name,'')), '[^a-z0-9]', '', 'g') <> all (array[ …the same list… ]);
-- 0 rows
```

**The future rows:**
| date | truck | title | village · venue · coordinates | row flags |
|---|---|---|---|---|
| 2026-10-16 | Pizzeria Gusto | Private Event | none | public, true/true |
| 2026-10-16 | Village Spice | Private Event | none | public, true/true |
| **2026-12-24** | **Marky D's** | **Closed** | none | public, true/true |
| **2027-01-03** | **Marky D's** | **Closed** | none | public, true/true |

### The answer

**Yes, a member of the public sees some of these rows today, all on Village Foodie:**
- **Marky D's "Closed" (24 Dec, 3 Jan):** they pass every gate.
  - **Marky D's truck page** (`villagefoodie.co.uk/trucks/marky-ds`) lists both as event cards titled "Closed", with no time and no map pin.
  - **`/venues/closed`** lists them under a venue called "Closed".
  - **The home list** shows each from 14 days before, from 10 December, for a visitor who hasn't shared a location.
  - **Never on the map:** the rows have no coordinates.
- **Gusto's private bookings (10 rows), not shown:** its scraped listing is `excluded = true` / `show_on_vf = false` (it graduated to HatchGrab). That is the only thing hiding them; a private booking on any shown truck would be listed like Marky D's "Closed".
- **Village Spice's "Private Event" (today), not shown:** it has no truck link and no discovery truck of that name, so the feed drops it as an unknown truck.
- **Real Thai Food "TBC":** past, already off Village Foodie.
- **The HatchGrab host shows none of them;** it serves no scraped rows at all.

**Confirmed with fixtures** (`scripts/private-discovery-rows.cjs` §4–5). The real feed route, with the new guard patched out, served a shown Pizza Kitchen listing's stored-public "Closed", "Private Hire" and private-notes rows. The real truck page rendered from that feed listed "Closed" and "Private Hire" as events.

## 2 · Fix

**One shared helper, `lib/discovery-private.ts`. It decides nothing new; it reuses two existing rules:**
- `isNonPublicDiscoveryRow(row)`: `isGenericVenueName(venue_name)` **or** `looksPrivate(venue_name, event_notes)`.
  - The first is the generic list (`lib/venue-matcher`).
  - The second is exactly the rule `/api/inbound-schedule` stores as `truck_events.is_private` (`lib/private-events/detect`: the whole word "private", case-insensitive).
- `discoveryRowVisibility(row, country)`:
  - a non-public row gets `{ visibility: 'hidden', show_on_vf: false, show_on_hg: false }`;
  - otherwise the row is unchanged: `{ visibility: 'public', ...discoveryVisibility(country) }`.

**Imports.** `lib/discovery-gate.ts` writes `...discoveryRowVisibility(row, country)` where it wrote `visibility: 'public', ...discoveryVisibility(country)`.
- This covers every writer: the scraper and the HatchesUp import (through `/api/discovery/ingest`) and the email bridge.
- A named-venue row is written byte for byte as before: same columns, same order, same values.
- `scripts/run-scraper.js` and `app/api/inbound-schedule/route.ts` need no edit: neither writes the row itself.

**Village Foodie surfaces, the second guard, in the one shared place.** `/api/discovery/events` drops a non-public row before its truck gates. Every Village Foodie surface reads only this feed, so this one line covers the home list and map, truck pages and venue pages, even for rows stored public before the fix.

**What doesn't change:**
- the bridge still turns a private row into the operator's private truck event to approve, with no venue guess;
- outreach still counts every row;
- the HatchGrab host still serves operator events only;
- the `visibility` column gains no new value.

### Existing rows — NOT RUN

This covers every truck: **14 rows across 4 trucks** (Gusto 10, Marky D's 2, Village Spice 1, Real Thai Food 1). The preview below returned 14, of which 4 are future and all 14 are flagged on.

**Gusto's 10 rows are included,** because the brief asks for every truck. It changes only their flags, which already have no effect on Gusto, since its listing is excluded. If you'd rather leave Gusto's rows untouched, add `and coalesce(truck_name,'') <> 'Pizzeria Gusto'` to the three `where` clauses.

```sql
-- NOT RUN — run now (safe before or after the deploy; the deploy's feed guard already hides these rows)
-- 1. backup, locked down
create table public.discovery_events_private_backup_20261016 as
  select * from public.discovery_events
  where regexp_replace(lower(coalesce(venue_name,'')), '[^a-z0-9]', '', 'g') = any (array[
      'private','privateevent','privateevents','privateparty','privateparties','privatehire','privatebooking',
      'privatefunction','privatefunctions','privatecatering','corporateevent','corporatelunch',
      'closed','tbc','tba','tbd','venuetbc','venuetba','locationtbc','locationtba','event','events'])
     or coalesce(venue_name,'') ~* '\yprivate\y' or coalesce(event_notes,'') ~* '\yprivate\y';
alter table public.discovery_events_private_backup_20261016 enable row level security;
revoke all on public.discovery_events_private_backup_20261016 from anon, authenticated;

-- 2. preview — expect 14 rows (4 future), 4 trucks
select count(*) as rows, count(*) filter (where event_date >= current_date) as future,
       count(distinct coalesce(discovery_truck_id::text, truck_name)) as trucks
from public.discovery_events_private_backup_20261016;

-- 3. hide them: the existing non-public values, these rows only
update public.discovery_events d
set visibility = 'hidden', show_on_vf = false, show_on_hg = false, updated_at = now()
where d.id in (select id from public.discovery_events_private_backup_20261016)
  and (d.visibility <> 'hidden' or d.show_on_vf or d.show_on_hg);

-- 4. verify — expect 0 still public, 14 hidden, and every other row untouched
select count(*) filter (where d.visibility <> 'hidden' or d.show_on_vf or d.show_on_hg) as still_public,
       count(*) filter (where d.visibility = 'hidden' and not d.show_on_vf and not d.show_on_hg) as hidden
from public.discovery_events d
where d.id in (select id from public.discovery_events_private_backup_20261016);
select count(*) as rows_changed_outside_the_backup
from public.discovery_events d
where d.updated_at >= now() - interval '10 minutes'
  and d.id not in (select id from public.discovery_events_private_backup_20261016);
```

**Undo:** restore the three columns from the backup by `id`. The backup can be dropped once you're happy:
```sql
-- NOT RUN — undo only if needed
update public.discovery_events d set visibility = b.visibility, show_on_vf = b.show_on_vf, show_on_hg = b.show_on_hg, updated_at = b.updated_at
from public.discovery_events_private_backup_20261016 b where b.id = d.id;
```

## 3 · Re-check of the private-event fix on live data

**Q1–Q4 from the tidy report §7, re-run read-only:**
```sql
select 'Q1 generic-named venues' as q, count(*)::text as result
from public.venues
where regexp_replace(lower(coalesce(name,'')), '[^a-z0-9]', '', 'g') = any (array[ …the generic list… ])
union all
select 'Q2 Gusto truck_events changed since fix', count(*)::text from public.truck_events
where truck_id = 'pizzeria-gusto' and (created_at >= '2026-10-16 13:02:29+00' or updated_at >= '2026-10-16 13:02:29+00')
union all
select 'Q2b Gusto private events from 14 Oct with any venue guess', count(*)::text from public.truck_events
where truck_id = 'pizzeria-gusto' and is_private and event_date >= '2026-10-14'
  and (venue_id is not null or venue_match_confidence is not null or latitude is not null)
union all
select 'Q3 Gusto discovery rows since fix', count(*)::text from public.discovery_events d
join public.discovery_trucks t on t.id = d.discovery_truck_id
where t.hatchgrab_truck_id = 'pizzeria-gusto' and (d.created_at >= '2026-10-16 13:02:29+00' or d.updated_at >= '2026-10-16 13:02:29+00')
union all
select 'Q4a truck_events since fix (all)', count(*)::text || ' latest ' || coalesce(max(created_at)::text,'-') from public.truck_events where created_at >= '2026-10-16 13:02:29+00'
union all
select 'Q4b discovery_events since fix (all)', count(*)::text || ' latest ' || coalesce(max(created_at)::text,'-') from public.discovery_events where created_at >= '2026-10-16 13:02:29+00'
union all
select 'Q4c venues since fix (all)', count(*)::text || ' latest ' || coalesce(max(created_at)::text,'-') from public.venues where created_at >= '2026-10-16 13:02:29+00'
union all
select 'Q4d any truck_event since fix with a scraper venue guess', count(*)::text from public.truck_events
where created_at >= '2026-10-16 13:02:29+00' and venue_match_confidence is not null and venue_id_source = 'scraper';
```
| q | result |
|---|---|
| Q1 generic-named venues | **0** |
| Q2 Gusto truck_events changed since fix | 0 |
| Q2b Gusto private events from 14 Oct with any venue guess | **0** |
| Q3 Gusto discovery rows since fix | 0 |
| Q4a truck_events since fix (all trucks) | 4, latest 2026-10-16 15:28:39 UTC |
| Q4b discovery_events since fix (all trucks) | **0** |
| Q4c venues since fix (all) | **0** |
| Q4d any truck_event since fix with a scraper venue guess | 0 |

The 4 new truck events are all manual `Demo event` rows on `demo-…` trucks (14:47, 14:51, 14:56 and 15:28 UTC; `source = 'manual'`, `is_private = false`, no venue).

**Verdict:**
- **No import has run since `cea794f`** (2026-10-16 13:02:29 UTC; the deploy time isn't visible to me). No generic venue was created, and no private event got a venue guess.
- **No junk exists,** so no clean-up SQL is needed.
- **The fix still hasn't met live data.** The first scraper or email import after the deploy is its first real test; re-run this block afterwards.

## Proof

### `scripts/private-discovery-rows.cjs` (new, in the sweep): 34 passed, 0 failed

**Method:** it runs the real modules (the gate, the email bridge, the feed route, the public truck page) on the in-memory database. Fixtures only: Pizza Kitchen's scraped listing and the HatchGrab test truck `test-truck`. Nothing live.

1. **The rule:**
   - non-public: "Private Event", "Private Hire", "private party", "Closed", "TBC", "Event", "Corporate Lunch", "The Barn — private party", and a real venue with "Private booking" in its notes;
   - public: "Red Lion", "Party In The Park", "Privateer Brewery", "Closed Shop Cafe", "TBC Black Dog Music Project";
   - the visibility values for GB non-public, GB named and US named.
2. **The gate:**
   - "Private Event", "Closed" and the private-notes row are stored `hidden`, `show_on_vf/hg false`;
   - "Red Lion" is stored `public`, true/true, venue linked, exactly as before;
   - a US row is unchanged.
3. **The email bridge (HatchGrab unchanged):**
   - "Private Hire" still becomes a private truck event with no venue guess, and "Red Lion" a normal one;
   - the private discovery row is stored hidden.
4. **The feed, both hosts, rows stored public before the fix:**
   - **Village Foodie:** BEFORE (the real route with the guard patched out) served all five; AFTER serves only the two Red Lion events. Everything else is **byte-identical**: event ids, trucks, fields.
   - **HatchGrab:** no scraped row before or after (unchanged).
5. **The public truck page** (`/trucks/pizza-kitchen`, rendered from each feed): BEFORE lists "Closed" and "Private Hire" as events; AFTER lists the Red Lion events and none of the others.

### The other checks

| Check | Result |
|---|---|
| Full sweep `node scripts/run-harnesses.cjs` | **130 run · 130 passed · 0 failed** |
| `generic-venue-guess`, `schedules-country-parity` (feed and gate writes vs its BEFORE), `private-events` | 33/33, 73/73, 206/206 |
| `npx tsc --noEmit -p .` | clean |
| `next build` | **exit 0** |
| eslint on touched files vs their previous versions | **no rule count grew.** `lib/discovery-gate.ts` 0 → 0; `app/api/discovery/events/route.ts` 18 `no-explicit-any` → 18 (none added); `lib/discovery-private.ts` (new) 0. The new harness carries only `no-require-imports`, as every `.cjs` script does. |

## Decisions recorded

1. **Non-public means all three columns,** using values they already allow (see the contradictions section).
2. **The rule is the two existing rules combined** (generic list OR `truck_events.is_private`'s rule), in one helper used at the one write path and the one public read path.
3. **The feed guard drops the row whatever its stored flags,** so the 14 existing rows are hidden as soon as this deploys, before the SQL runs. The SQL makes the stored data agree.
4. **"Closed", "TBC" and the like are hidden like private bookings.** The brief's "generic private list" is `lib/generic-venue-names.json`, and none of them names a place a customer can go.

## Listed for you

1. **Run the NOT RUN SQL** whenever suits. Until then the deploy's feed guard keeps the rows off Village Foodie; the SQL only makes the stored flags agree.
2. **Re-run §3 after the next import.** The private-event fix and this one both meet live data for the first time then.
3. **Village Spice has a scraped row but no discovery truck of that name;** its rows are dropped as unknown. If it is a real truck you want listed, it needs a discovery truck row. Not changed.
4. **The live "Closed" rows are Marky D's days off (24 Dec, 3 Jan).** With this fix they're simply not listed. Showing "closed" days on a truck's page would be a separate feature.

## Files

- **New:**
  - `lib/discovery-private.ts`;
  - `scripts/private-discovery-rows.cjs`.
- **Changed:**
  - `lib/discovery-gate.ts` (the write);
  - `app/api/discovery/events/route.ts` (the guard);
  - `scripts/harnesses.json` (adds the harness).
