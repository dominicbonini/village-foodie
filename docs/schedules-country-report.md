# Phase 2D-2 Part A — schedules by country

**10 October 2026 · branch `main` (HEAD `f4bd277` + working tree) · not committed · not pushed · not deployed · no SQL run · no live data read or written · no external API called · no email sent · Pizzeria Gusto and `outreach_templates` untouched**

## What changed

Discovery data now knows its country:
- **Where it lives.** The country is on `discovery_trucks`, `venues`, `discovery_events` and `discovery_exclusion_terms`. Venues also carry a county or state.
- **What it changes.** Every truck, venue, exclusion and HatchGrab link is matched only within one country.
- **Village Foodie stays UK.** It shows only GB rows, and every non-GB row is written hidden on both sites.

**Admin › Screenshots requires a country before it accepts anything.**
- **The prompt** is told the country and answers with the country the screenshot itself shows.
- **A confident mismatch is held.** "Check country" means nothing is written until the admin picks "Add as …" or "Keep as …".
- **Trucks and venues created from screenshots** get the chosen country.
- **Phone numbers** are read in the chosen country.

**The other prompts:**
- The operator importer gets location lines by country plus truck-context lines.
- The scraper tells each prompt its source's country.
- The dashboard geocoder now sends the truck's country.

**For the UK:**
- Every GB prompt is byte-identical apart from the two named additions (§4).
- The gate, bridge, ingest, feed and screenshot route give identical results on the fixtures (§6).

Nothing in either message arrived garbled. The first brief had one contradiction, about the GB screenshot prompt, which I raised and you answered (Q1 = A). The missing mockup was Q2 = B, so the screenshots are compared with your written description in §7.

---

## 1. Read these first

1. **Run order: `20261010_15` → deploy → `20261010_16`.** The new code upserts on (country, name) and (country, name, village), which only exist after _15. _16 drops the old global keys, which the old code still names.
   - "Deploy" means two things: the Vercel deploy, and `main` reaching GitHub Actions, because the scraper runs from the repository on its own schedule.
   - Run _16 only when both are on the new code.
2. **One unique key still has no country: `discovery_events` on (event_date, truck_name, venue_name).**
   - **The risk:** a US event with the same date, truck name and venue name as a UK one would overwrite the UK row. That key was not on the list of indexes you allowed me to change.
   - **What happens instead:** the gate refuses to write such a row. It reports it as `skipped`, and the UK row stays untouched (proved, §6 3c).
   - **If you want both rows stored,** (country, event_date, truck_name, venue_name) is the change. That's your decision.
3. **`discovery_exclusion_terms.term_key` is still unique on its own.** A term can belong to one country only. A UK term never silences a US truck (proved). The same word cannot be a term in two countries.
4. **Scraper Pass B now sends the HatchGrab truck's own id, as asked.**
   - **The change for GB:** the bridge links that exact truck rather than matching by name, including when no discovery row is linked to it yet.
   - **Why it's still GB-only:** the bridge links a truck only when `trucks.country` equals the batch's country.
5. **"Scraper Passes A, B and C."** The scraper has two passes, A and B. I read A, B and C as the audit's paths of those names: Pass A events, Pass A rules, and Pass B. All three now take the source's country. Every current source is GB.
6. **A held screenshot of type "both" (a schedule and contact details).** The hold stops everything, details included. "Add" or "Keep" re-submits the events only. To capture the details, re-upload once the country is settled.
7. **A UK-chosen screenshot carrying a +1 number:** the number is still not kept, because the UK phone rule is unchanged. A US-chosen screenshot keeps it, written the US way.
8. **A confident country we have no settings for (France, say)** is held. There is no "Add as France", only "Keep" and "Dismiss", and the row says why.
9. **A held row's log line stays in the 7-day log** as "Check country". Pressing Add or Keep adds a separate "Schedule" line for what was written.

## 2. SQL

### Run now — `supabase/migrations/20261010_15_discovery_country.sql`

The file is additive and safe to run twice.
- **No row rewrite:** a constant default on a new NOT NULL column is a catalogue change, and existing rows read 'GB' through it.
- **Foreign keys:** adding them checks each table once; that's a read, not a rewrite.
- **New indexes:** the three are compatible with today's data, because today's single-column keys are stricter.
- **The 'GB' default stays on purpose:** the scraper and the Apps Script write discovery rows without a country.

```sql
set lock_timeout = '3s';

begin;

alter table public.discovery_trucks           add column if not exists country text not null default 'GB';
alter table public.venues                     add column if not exists country text not null default 'GB';
alter table public.venues                     add column if not exists region  text;
alter table public.discovery_events           add column if not exists country text not null default 'GB';
alter table public.discovery_exclusion_terms  add column if not exists country text not null default 'GB';

do $$
declare
  t text;
begin
  foreach t in array array['discovery_trucks', 'venues', 'discovery_events', 'discovery_exclusion_terms'] loop
    if not exists (
      select 1 from pg_constraint
       where conrelid = format('public.%I', t)::regclass and conname = t || '_country_fkey'
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (country) references public.country_settings (country_code)',
        t, t || '_country_fkey');
    end if;
  end loop;
end $$;

comment on column public.discovery_trucks.country is
  'ISO country the truck trades in (FK country_settings). Defaults to GB because the automated UK sources (scraper, Apps Script) write without a country; every in-repo writer that knows the country passes it. Name matching only ever compares trucks in the same country. Phase 2D-2.';
comment on column public.venues.country is
  'ISO country of the venue (FK country_settings). Defaults to GB because the automated UK sources write without a country. A venue only ever matches events from its own country. Phase 2D-2.';
comment on column public.venues.region is
  'County (GB) or two-letter state (US) when the source gave one; NULL otherwise. Phase 2D-2.';
comment on column public.discovery_events.country is
  'ISO country of the event, as the source or the admin asserted it at intake (FK country_settings). Defaults to GB because the automated UK sources write without a country. Village Foodie shows only GB rows. Phase 2D-2.';
comment on column public.discovery_exclusion_terms.country is
  'ISO country this exclusion term applies to (FK country_settings). Defaults to GB because the scraper writes terms without a country. A term silences truck names in its own country only. Phase 2D-2.';

create unique index if not exists discovery_trucks_country_name_uniq
  on public.discovery_trucks (country, name);
create unique index if not exists discovery_trucks_country_norm_name_uniq
  on public.discovery_trucks (country, (regexp_replace(lower(name), '[^a-z0-9]', '', 'g')));
create unique index if not exists venues_country_name_village_uniq
  on public.venues (country, name, village);

commit;
```

Verify it (read-only):
```sql
select table_name, column_name, is_nullable, column_default from information_schema.columns
 where table_schema = 'public' and column_name in ('country', 'region')
   and table_name in ('discovery_trucks', 'venues', 'discovery_events', 'discovery_exclusion_terms');
select indexname, indexdef from pg_indexes
 where schemaname = 'public' and indexname in ('discovery_trucks_country_name_uniq',
   'discovery_trucks_country_norm_name_uniq', 'venues_country_name_village_uniq');
select country, count(*) from public.discovery_trucks group by 1;   -- every row 'GB'
```

### Run after deploy — `supabase/migrations/20261010_16_drop_global_name_keys.sql`

This drops three keys:
- `discovery_trucks_name_key`;
- `discovery_trucks_norm_name_uniq`;
- `venues_name_village_key`. This is the venue key's exact name, from `scripts/run-scraper.js` and `docs/scraper-reference-manual.md`, where it is recorded as confirmed live.

**How it drops them:** each key was made by hand, so the file checks whether it is a constraint or a plain index and drops it the right way. It is safe to run twice. It drops no column and changes no data.

**Every writer that named these keys now names the country-scoped ones:**
- `scripts/run-scraper.js` (the truck mint and the venue mirror);
- `lib/discovery-gate.ts` (venue creation);
- the admin screenshot truck insert (a plain insert, now with a country);
- `scripts/import-hatchesup-schedule.js`;
- `scripts/process-next-truck.js`;
- `scripts/migrate-from-sheets.cjs`. Its venue upsert used to name 'name', which no key matched.

**The Apps Script** (`docs/apps-script/village-foodie-v6.57.js`) writes no `discovery_trucks` or `venues` row directly. It posts to `/api/inbound-schedule`, so nothing outside the repo depends on these keys. No STOP was needed.

Check before running (read-only), and expect three rows with `indisvalid = true`:
```sql
select c.relname, i.indisvalid from pg_index i join pg_class c on c.oid = i.indexrelid
 where c.relname in ('discovery_trucks_country_name_uniq', 'discovery_trucks_country_norm_name_uniq',
                     'venues_country_name_village_uniq');
```

```sql
set lock_timeout = '3s';

begin;

do $$
declare
  k record;
begin
  for k in
    select * from (values
      ('discovery_trucks', 'discovery_trucks_name_key'),
      ('discovery_trucks', 'discovery_trucks_norm_name_uniq'),
      ('venues',           'venues_name_village_key')
    ) as v(tbl, key_name)
  loop
    if exists (
      select 1 from pg_constraint
       where conrelid = format('public.%I', k.tbl)::regclass and conname = k.key_name
    ) then
      execute format('alter table public.%I drop constraint %I', k.tbl, k.key_name);
    elsif exists (
      select 1 from pg_indexes where schemaname = 'public' and tablename = k.tbl and indexname = k.key_name
    ) then
      execute format('drop index public.%I', k.key_name);
    end if;
  end loop;
end $$;

commit;
```

Verify it (read-only); expect zero rows from both:
```sql
select conname from pg_constraint where conname in ('discovery_trucks_name_key', 'venues_name_village_key');
select indexname from pg_indexes where schemaname = 'public'
   and indexname in ('discovery_trucks_name_key', 'discovery_trucks_norm_name_uniq', 'venues_name_village_key');
```

### The Apps Script newsletter (outside the repo) — one line to add

In `runEmailJob`'s query (reference copy `v6.57.js:874-878`), add this after the `?select=…` line:
```
      "&country=eq.GB" +
```

**If you don't add it:** US events would be read too. They sit thousands of miles from every UK subscriber, so the newsletter's own distance filter drops them, and nobody would get one. The line makes the query say what it means.

## 3. Matching within one country (audit §4)

| # | Matcher | Now |
|---|---|---|
| 1 | Gate `lib/discovery-gate.ts` | Takes the batch's country. Trucks, venues, R5 anchors and duplicates come from that country only. Venues and events are written with it. Non-GB events are written `show_on_vf = show_on_hg = false`. A same key in another country is `skipped` (§1.2) |
| 2 | Bridge `/api/inbound-schedule` | Takes `country` (absent means GB) and an optional `hatchgrab_truck_id`. Linked trucks are limited to that country, and a HatchGrab truck is used only if `trucks.country` matches. The email is re-checked against the country |
| 3 | Scraper `run-scraper.js` | Pass A reads, matches, scrapes and writes GB rows only (`SOURCE_COUNTRY`). Pass B selects `trucks.country` and sends it with the truck id |
| 4 | Unique keys | Country-scoped (§2) |
| 5 | Feed orphan fallback | GB rows only |
| 6 | Village Foodie name gate and slugs | They read the feed, which is GB only |
| 7 | Graduation (`create-operator`) | Excludes the shadow in the truck's own country |
| 8 | Outreach schedule tokens | Keyed by country and name |
| 9 | Admin orphan flag and Schedule popup | Compare within the event's or truck's country |
| 10 | Screenshot → prospect | Only prospects whose truck is in the chosen country; phones compare in it |
| 11 | Screenshot exclusions | The chosen country's terms only |
| 12 | Hatches Up importer | GB reads and writes, `onConflict 'country,name'` |
| — | `findVenue` (`lib/venue-matcher.ts`) | Takes a country (default GB) and only ever considers that country's venues. A row without the column counts as GB, so the offline UK backfills behave as before |

## 4. Prompts

**The GB screenshot prompt — named difference 1 (Q1 = A).**
- It gains exactly two things:
  - the one line `These screenshots are from United Kingdom (GB), as the person uploading them says. In "Country" give …`;
  - `"Country": "GB", "CountryConfidence": "high|medium|low", "CountryReasons": "short words",` at the top of the JSON.
- Every location line and every other line is unchanged.
- **zip_state countries** get these lines instead:
  - the city in "Village";
  - the two-letter state in "State";
  - ZIP codes "like 78701".
- **mdy countries** gain one line: numbers-only dates are month first.
- **The hold rule** (`shouldHoldForCountry`): another country with high or medium confidence is held. Low confidence, no answer, or the same country goes through.

**The operator importer — named difference 2.**
- **A GB truck** gets a TRUCK CONTEXT block after the first line. It holds the truck's name, "Based in: town, region", the country name, and the distinct towns of its last 15 confirmed events (statuses confirmed, open and closed). Every UK location line is unchanged.
- **A zip_state truck** gets its own location lines (city, two-letter state, ZIP, US examples) and month-first numeric dates. The output stays DD/MM/YYYY, because that's the importer's contract.
- **Where it's built:** `lib/schedule-context.ts`, used by `process-schedule` and `verify-schedule-url`. This follows the Apps Script vendor-email prompt, which injects prior events.

**The scraper:**
- **Where the prompts live:** all three moved, unchanged, to `scripts/scraper-prompts.js`, so they can be compared byte for byte with what was sent before.
- **For GB,** all three are identical.
- **Pass B for a zip_state truck** uses city, state and ZIP lines.

**The geocoder:**
- **The client:** it now sends the truck's country short name (falling back to its full name), so a UK truck sends "UK" and its prompt is byte-identical.
- **The route:** unchanged until Part B.

## 5. The screenshot panel

**The picker:** "These screenshots are from" plus the button (`components/admin/ScreenshotCountryPicker.tsx`).
- **The list:** every country in `country_settings`, switched on or not, with flag images. They come from the route's GET, so flags stay server-side.
- **Storage:** the choice is kept in `sessionStorage`, so it survives the panel unmounting on a tab switch.
- **The reset:** 30 minutes without an upload, a decision or a change. It is checked every 15 seconds, and the "Resets at HH:MM" time is shown in UK time.

**The drop zone:**
- **Until a country is chosen,** it is greyed and its input disabled.
- **One guard covers every way in:** `add()` refuses drop, pick and paste.

**Uploads and the held row:**
- **Each queued file** is stamped with the country at enqueue and sends it. The route refuses an upload with no country.
- **A held row** gets an amber 2px border, the "Check country" chip, the reason, "N events found:" with the first three, then Add / Keep / Dismiss.
- **Add and Keep** post `country_confirm` with the returned events. The server re-reads them through the parser, filters them with that country's exclusion terms, and only then sends them to the bridge. Dismiss sends nothing.
- **The decide() 409:** the country decision is handled before the social-column probe, which used to answer 409 for every action.

**Plumbing:** `held_country` is added to `SCREENSHOT_OUTCOMES`, `OUTCOME_CHIP` ("Check country"), `chipCounts`, `CHIP_CLASS` and `FILTERS` (after Schedule). `screenshot_log.outcome` has no CHECK (your Q7), so no SQL is needed.

## 6. Proof

| Check | Result |
|---|---|
| `schedules-country-parity` (new, 73 checks; BEFORE captured on the unchanged code, `scripts/fixtures/schedules-country-before.json`) | ✅ **GB prompts:** the screenshot prompt with no country is identical, and with GB it equals BEFORE plus named difference 1. Classifier and details prompts are identical. The importer is identical without context, and with GB context equals BEFORE plus named difference 2. All three scraper prompts are identical. The geocoder prompt is identical, including when the client sends "UK". **GB behaviour:** gate outcomes, bridge response, writes and its one email, ingest, the feed on both hosts, and the screenshot route end to end (response, writes, email, prompts) are identical once the explicit `country: 'GB'` on each write is set aside. The one wording change is the venue-created reason naming the country key (named difference 3). **Cross-country:** the US "Pizzeria Gusto" and US "Red Lion" checks are listed below. Held: high and medium confidence write nothing (no gate, bridge, prospect or email), low confidence goes through, and France is held with no "Add as". Add as US writes US rows without bridging; Keep as UK writes GB; an unknown country is refused. Pins cover the 409 order, the GB-only feed, the importer context, graduation, outreach tokens, orphan flag, findVenue, exclusions and Pass B |
| `schedules-country-screenshots` (new, 26 checks, 1440×900, a real browser, fixture API, fake clock) | ✅ Before choosing: the zone is closed with its two lines and icon, the button is amber (exact 2px #d97706 on #fffbeb) with its hint, the input is disabled, and a real drop and paste send nothing. Both countries are listed with flags. After choosing: a flag, a neutral border, "Resets at 15:42 unless you upload again.", and an open zone naming **the United Kingdom**. The choice is kept in sessionStorage and survives a reload. A file keeps its enqueue country (two queued as GB stay GB after the switch to US, and the next is US). The reset doesn't fire at 20 minutes but does at 30½, clearing storage. The held row has its exact look, words, events and buttons, and the chips are All 6 · Schedule 3 · Check country 1 · …. Add sends US with 5 events, Keep sends GB, Dismiss sends nothing. No sideways scroll, no page errors |
| Existing harnesses | ✅ All pass, `phone-parity` and `time-dates-parity` included |
| Client bundles after `next build` | ✅ None of `country_settings`, the loader functions, `address_format`, `default_timezone`, `card_fee_online_pct`, `GEMINI_API_KEY`, `INBOUND_SCHEDULE_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_MAPS_API_KEY`, the Places host or key header, or any flag SVG |
| `tsc --noEmit` | ✅ clean |
| eslint, the 25 files this part touched, vs HEAD | ✅ No rule grew in any file. Errors 335 → 334, warnings 95 → 95. Every new file is clean. The first pass found four warnings in the new `scripts/scraper-prompts.js` (an unused parameter, and disable comments for a rule this config doesn't load); all four are fixed |
| `next build` | ✅ exit 0 |
| Harness sweep (`scripts/run-harnesses.cjs`, 106 files) | ✅ **106 / 106 passed.** The first full run failed three existing harnesses that pin what this part changed on purpose (`scraper-invented-village`, `screenshot-truck-details`, `schedule-graphics-places`). Each was re-pinned with this build named, as listed below, and the whole sweep re-run clean |

**The cross-country checks, in full:**
- **A US "Pizzeria Gusto" screenshot:**
  - does not attach to the UK discovery row;
  - bridges nothing and sends no email;
  - is written hidden.
- **The bridge:**
  - refuses a US batch even when it carries the UK truck's own id;
  - with the id on a GB batch, links that truck whatever the name says.
- **A US "Red Lion, Cambridge"** creates its own US venue (region MA), and its event points at it.
- **A US event with the same key as a UK one** is skipped, and the UK row is untouched.
- **A same-named US truck** gets its own row once _16 has run. Between _15 and _16 the old key still refuses it, which is why _16 exists.
- **Old upsert targets:** an `onConflict 'name'` write fails with 42P10 after _16, and no writer still names one.
- **Matching and phones:**
  - a US name-only screenshot matches no UK prospect;
  - phones are read in the chosen country.
- **Village Foodie** never shows a US event (even one marked visible), a US truck, a US orphan or a US operator event, and truck pages show UK events only.
- **Exclusions:** a UK term does not silence a US truck.
- **The US importer prompt** uses city, state and ZIP lines with month-first dates, and no UK lines.

**Harness changes:**
- **New:** `scripts/_fake-pg.cjs`, an in-memory database with real unique keys and Postgres onConflict behaviour, including 42P10 and NULLS DISTINCT. It is a shared module.
- **Registered:** `schedules-country-parity.cjs`.
- **Run by hand (`needs_a_browser`):** `schedules-country-screenshots.cjs`, plus `signup-landing-screenshots.cjs`. That one was left unregistered in Phase 2D-1, and the runner was warning about it.
- **Re-pinned, because this part changed what they guard:**
  - `scraper-invented-village` reads the two VILLAGE prompt rules from `scripts/scraper-prompts.js`, where they now live (text unchanged).
  - `screenshot-truck-details` guards three files against HEAD (the screenshot lib, the bridge and the operator importer), and this part is now its fifth named build. Its changed lines are listed in `scripts/fixtures/screenshot-truck-details-2d2-lines.json`. Each added line must still be present, each removed line must be gone, and every other difference still fails. Two Phase 2B lines this part changed are recorded as superseded. Its POST-body and gate pins follow the call into `sendToBridge()`. One reader bug was fixed along the way: a removed line whose own text starts with "-" was being skipped as if it were the `---` file header.
  - `schedule-graphics-places`, the "no line of the Manage page lost" guard, names the five old geocoder lines, with a companion check that all three calls now send the country.

## 7. The screenshots against the approved description, item by item

The images are `docs/screenshots/schedules-country-1440-picker-before.png`, `-picker-after.png` and `-held-row.png`.

**Before a country is chosen**

| Item | Built |
|---|---|
| The existing intro line stays | ✓ The existing text is kept as it is in the app. Your description quoted it shorter ("Drop, paste or pick screenshots of truck pages…"); I followed "the existing intro line stays" |
| Bold "These screenshots are from", then a "Choose a country" button with a chevron, 2px #d97706 border on #fffbeb | ✓ Measured: rgb(217,119,6), 2px, rgb(255,251,235) |
| Amber "Choose before uploading. It resets after 30 minutes without an upload." | ✓ |
| Greyed drop zone (light dashed border, pale background) with a picture icon, bold "Choose a country first", "Then drop, paste or pick screenshots here" | ✓ |
| Drop, paste and pick all do nothing until a country is chosen | ✓ Proven with a real drop and a real paste |

**After a country is chosen**

| Item | Built |
|---|---|
| Flag, "United Kingdom" and chevron, neutral border | ✓ |
| Grey "Resets at 15:42 unless you upload again.", 30 minutes after the last upload, in UK time | ✓ |
| The zone reads "Drop, paste or pick screenshots from the United Kingdom", the name in bold | ✓ "the United Kingdom" is bold |
| The status line and chips stay, plus "Check country N" | ✓ Placed right after Schedule. ⚠️ The chips that already existed keep their order, so "Nothing new" comes before "Needs a look" (your example listed them the other way round) |

**A held row**

| Item | Built |
|---|---|
| 2px amber border, pale amber background | ✓ Measured |
| Truck name, amber "Check country" chip, file name | ✓ |
| Dark amber: "This looks like the United States, not the United Kingdom: prices in $, "Austin, TX", dates written 10/12. Nothing has been added yet." (reasons from CountryReasons) | ✓ Word for word with the fixture's reasons |
| "5 events found:" then the first few | ✓ The first three, then "and 2 more" |
| "Add as United States" (primary, dark), "Keep as United Kingdom" (outlined), "Dismiss" (plain text) | ✓ |
| Nothing written until Add or Keep | ✓ Proven server-side (§6) and in the browser (Dismiss sends nothing) |
| Other rows keep their look | ✓ |

## 8. Rules kept

| Rule | |
|---|---|
| main as checked out; never push or deploy; no process killed | ✓ |
| No SQL run; SQL in this report and in chat; nothing dropped except the three keys allowed, in _16, after deploy | ✓ _15 and _16 written, not run; no column dropped |
| No `.env*` opened; no external API (Gemini and Google stubbed; fixtures only) | ✓ |
| No live writes; Pizzeria Gusto (fixtures only, by name) and `outreach_templates` untouched; no emails | ✓ The email module is a recorder in every harness |
| UK unchanged apart from what the brief names | ✓ Three named differences (§4, §6), each proven to be the only one |
