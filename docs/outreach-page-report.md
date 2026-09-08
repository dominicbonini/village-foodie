# Outreach tracking — page, two tables, migration

**GARBLED SPANS: none. No instruction contradicted another** — one judgement call (editable email, §Scope)
is flagged rather than silently taken, but it is not a hard contradiction requiring a STOP.

**Four NEW files. No existing file changed** (the one `M` in `git status` is the V12.1 manual delta from the
prior task, not this one).

| File | Purpose |
|---|---|
| `supabase/migrations/20260903_outreach_tracking.sql` | Parts 1 + 2 — two tables + backfill. **NOT run** |
| `lib/outreach.ts` | The single source of truth: enums + next-action math + platform derivation |
| `app/api/admin/outreach/route.ts` | verifyAdmin-gated GET (list + derived schedule) and POST (mutations) |
| `app/admin/outreach/page.tsx` | The admin page |

🔴 **The migration was NOT run**, per instruction — it is written to a file for you to apply by hand in the
Supabase SQL editor, as every migration in this project is. Nothing was deployed.

---

## PART 1 — the tables and their security

### 🔴 Which roles can reach each table, and how I established it

| Role | `outreach_prospects` | `outreach_contacts` | How established |
|---|---|---|---|
| **service_role** | full access | full access | The service role bypasses RLS by construction; also the only named policy (`TO service_role`) |
| **anon** | 🟢 **none** | 🟢 **none** | RLS enabled + **`revoke all … from anon`** — the grant itself is removed, not just default-denied |
| **authenticated** | 🟢 **none** | 🟢 **none** | Same `revoke all … from authenticated` |
| **public** (pseudo-role) | 🟢 **none** | 🟢 **none** | `revoke all … from public`, and **no policy names `public`/`anon`/`authenticated`** |

**Three defences per table, all present — verified by grep of the migration:**
1. `alter table … enable row level security` on both.
2. The only policy on each is `create policy "service_role only" … for all to service_role` — an **explicit
   `TO service_role`**, never a bare/omitted `TO` (the exact V12.1 mistake: an omitted `TO` defaults to
   `PUBLIC`, which includes anon).
3. `revoke all on … from anon, authenticated, public` on both.

🔴 **Step 3 is the one the existing private tables in this project SKIPPED.** `whatsapp_logs`,
`action_audit_log`, `booking_locks` et al. do `enable row level security` with no policy — which
default-denies reads but **leaves anon's SELECT/INSERT/UPDATE/DELETE grants in place**, the "policy dropped,
grant intact" half-state the V12.1 sweep flagged as OPEN on seven tables. **This migration is the first in
the repo to revoke the grants explicitly**, so these two tables are closed at the grant level, not merely at
the policy level.

⚠️ **I could not run `pg_policies` to confirm the applied state**, because the tables do not exist until you
run the file (and I must not). The posture above is **read from the SQL I wrote**, not observed on a live
database. The behavioural confirmation is yours to run after applying, with the same probe the V12.1
verification used: an anon `GET /rest/v1/outreach_prospects` must return `401 / 42501 permission denied`.

### Schema, as specified

Both tables match the brief exactly. `outreach_prospects`: `discovery_truck_id` (uuid, FK, **UNIQUE, not
null**), `stage` (text default `'not_contacted'`), `platform` (text, nullable), `whatsapp_number`,
`whatsapp_confirmed` (bool default false), `next_action_at` (date), `notes`, `created_at`/`updated_at`.
`outreach_contacts`: `prospect_id` (FK **on delete cascade**), `contacted_at`, `channel`, `direction`,
`kind`, `message`, `created_at`, plus the index on **`(prospect_id, contacted_at desc)`**.

🔴 **NO CHECK CONSTRAINT** on `stage`/`channel`/`direction`/`kind`, as instructed — PostgREST exposes no
CHECK metadata, so a constraint could not be read back to build the UI. The valid values live in **one
exported constant** (`lib/outreach.ts`) that both the page and the route import, and the route validates
every write against it. The whole file runs under **`set lock_timeout = '3s'`** so the FK to
`discovery_trucks` aborts rather than queues behind a live read.

---

## PART 2 — the backfill

One `outreach_prospects` row per `discovery_trucks` row, `platform` derived from the **host** of `order_url`:
`*.hatchesup.app` (and the bare apex) → `'Hatches Up'`; any other host stored verbatim (the three own-domain
trucks); **NULL `order_url` → NULL platform** so "unknown" stays distinct from "none". Derived from the host
in SQL with `split_part`/`regexp_replace`, **not a hardcoded truck list**. `on conflict (discovery_truck_id)
do nothing` makes a re-run a no-op.

🟢 **The SQL derivation and the app's `platformFromOrderUrl()` were cross-checked to agree on every input** —
I replicated the SQL `split_part` chain and diffed it against the JS across 11 cases (subdomains, apex,
own-domains, ports, fragments, mixed case, null, blank): **all match**. So a re-derivation in the app can
never disagree with the seed.

⚠️ **Not exercised against the real `discovery_trucks`**: the "59 of 62 → Hatches Up, 3 own-domain, 114 null"
split is the manual's OBSERVED count; I did not run the INSERT (the migration is unapplied), so I cannot
report the actual seeded distribution. The logic is proven; the row counts are not re-observed.

---

## PART 3 — the page

`app/admin/outreach/page.tsx` (client) + `app/api/admin/outreach/route.ts`. **The gate is the canonical
`verifyAdmin` on the route handler** — the same pattern `app/admin/page.tsx` uses (bootstrap against a
verifyAdmin route; the gate lives on the route, never a layout). 🟢 **Verified behaviourally**: an
unauthenticated `GET` and `POST` both return **404 `Unauthorised`** — the gate fires before any DB access, so
this held even though the tables do not yet exist. The page shell returns 200.

### Columns
Truck name · email · WhatsApp · platform · schedule state · stage · last contacted · next action — all present.

### 🔴 Schedule state — derived at read time, matched on NAME not the FK
`discovery_events.discovery_truck_id` is populated on only 81 of 737 future events, so an FK join under-reports
(the manual: FK finds 9, name+alias finds 49). The route normalises `lower(btrim(truck_name))` and matches it
against the truck's **name AND every alias**, summing the future-event count and taking the max event date
across those name keys. **Both values are shown** — `"3 upcoming · last 12 Oct"`, or `"none upcoming · last
14 Jun"`, or `"no schedule"` — so a truck whose schedule stopped in June is distinguishable from one that
never had one. **Neither value is stored.**

⚠️ **THE "one aggregate query, joined" CONSTRAINT — how I read it, and the trade-off.** Expressing the
name-OR-alias-**array** match as a single SQL join needs a DB **view or function**, which is outside this
task's "two new tables, change nothing else" scope. So the route instead does **two bulk reads** — all
prospects (embedded with their truck's name+aliases in one round trip) and all events (name+date, paged past
the 1000-row cap) — then a **single in-memory pass** builds the schedule index. This is **not a query per
row** (the constraint's actual purpose): a fixed number of round trips, O(events)+O(trucks). I judged this
the correct reading rather than adding a DB object outside scope; if you would prefer the literal single SQL
join, that is a new read-only view/function and I will add it on your say-so. **Flagged, not silently chosen.**

### Next-action date — from the outbound-contact count, weekend-rolled
Computed in `lib/outreach.ts` (shared by page and route): **+7 / +14 / +30 days** by the count of **OUTBOUND**
contacts in the log (not a counter column — the V12.1 log-not-timestamp rule); 3+ holds at +30. Every
suggested date is **rolled off Fri/Sat/Sun to the next Monday**. A **"Park until February"** button (1 Feb of
the next occurrence) and a **manual date picker** are always available, and any `next_action_at` in the past
is **flagged red with ⚠**. 🟢 **All of this is unit-exercised** (below).

### The rest
Logging a contact captures channel/direction/kind + optional message; **full history per prospect, newest
first** (the route orders `contacted_at desc`). Inline-editable: email, WhatsApp number, WhatsApp-confirmed,
stage, next action, notes. Default view **hides excluded** (56 of 176) with a toggle. Default sort: **Hatches
Up + has email + not-yet-contacted first**, then by rank, then name.

### Scale
The list is **paginated** (25/page, client-side over the one bulk fetch). The route issues **no query per
row** — prospects+truck in one embedded query, contacts in one paged bulk read, events in one paged bulk
read. ⚠️ At a scale far beyond 176 the next step is server-side pagination of the prospect list; the schedule
index would then need the events query scoped to the visible page (or the view/function above). Noted, not
built — 176 rows does not warrant it and the anti-N+1 requirement is met.

---

## 🔴 Scope — the one write outside the two new tables, flagged

**Editing `email` inline writes to `discovery_trucks.contact_email`**, an **existing column**. The specified
`outreach_prospects` schema has no email column, and email's canonical home is `discovery_trucks` (V12.1). I
treated "do not change any existing table" as **schema/policy**, not a data UPDATE through the service role —
every admin tool writes data to existing tables — so editing email writes back to that existing column.

**Why not the alternatives:** adding an `email` column to `outreach_prospects` would deviate from the schema
you specified and create the divergent-second-source the manual warns against; making email read-only would
contradict "editable inline: email". **I did NOT alter `discovery_trucks`' schema or policy** — only a data
value, admin-only. ⚠️ **If you consider a data write to `discovery_trucks` out of scope, say so and I will
make email read-only instead.** This is the one place the page reaches beyond its two tables, and it is
deliberate and surfaced rather than hidden. (Note: `discovery_trucks.contact_email` is already anon-readable
via that table's public-read policy — editing it here does not change that pre-existing exposure.)

---

## What I exercised, and what I did NOT

**Neither a typecheck nor a build is verification, and none is offered as such.**

### Exercised by execution
| | |
|---|---|
| `lib/outreach.ts` pure logic | ✅ every branch: platform derivation (11 cases), interval by outbound count, weekend roll-forward (all 7 weekdays), suggested-date composition, park-until-Feb, isOverdue |
| SQL ↔ JS platform parity | ✅ replicated the SQL host chain, diffed vs `platformFromOrderUrl` — **all 11 match** |
| The admin gate | ✅ unauthenticated GET **and** POST → **404** (before any DB query); page shell → 200 |
| tsc | ✅ clean (supplementary only, not verification) |

### 🔴 NOT exercised — stated plainly
- 🔴 **The migration was not run** (by instruction), so the two tables **do not exist**. Everything below
  therefore could not be tested against a live database:
  - the route's **GET data path** — the PostgREST embed of `discovery_trucks`, the schedule aggregate over
    real events, the contact grouping. Verified by **reading + the pure-logic tests only.**
  - the **mutations** (`update_prospect`, `log_contact`) — no write was issued, because there is nowhere to
    write. The validation logic is unit-covered; the DB round-trip is not.
  - the **RLS/grant posture on the live DB** — read from the SQL, not observed. **Run the anon probe after
    applying** to confirm `401 / 42501`.
  - the **backfill distribution** — the derivation is proven; the actual seeded rows are not re-counted.
- 🔴 **Nothing is deployed.** A fix in the repository is not a fix in production.
- ⚠️ **The page's rendered behaviour** (sort order, inline edits, the log form, pagination) was **not driven
  in a browser**, because a logged-in admin session against a DB with these tables was not obtainable without
  running the migration. The gate and shell render; the data-bearing UI did not run.

---

## To bring this live (your steps, in order)
1. Apply `supabase/migrations/20260903_outreach_tracking.sql` by hand in the SQL editor.
2. Confirm the schema reloaded (the file ends with `notify pgrst`).
3. **Run the anon probe**: `GET /rest/v1/outreach_prospects` with the anon key must return `401 / 42501`.
   If it returns rows, the revoke did not take — stop and re-check before trusting the page.
4. Open `/admin/outreach` as an admin and confirm the list, schedule figures, a logged contact and the
   suggested next-action date.

**Nothing committed. Nothing deployed. No migration run. No existing file changed.**
