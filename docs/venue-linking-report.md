# Discovery venue linking — why it stopped

**GARBLED SPANS: none. No instruction contradicted another.**

⚠️ **DIAGNOSIS ONLY. No file changed, no job run, nothing triggered or restored, nothing deployed.** Reads
only. I did **not** run the linking to see what happens.

🔴 **HEADLINE: the venue linking is a MANUAL backfill script with NO scheduler. It was run by hand up to
~30 August and has not been run since; that is why the forward window is near-zero linked. The matcher is
NOT running — 76% of unlinked forward events would still match — rather than running and failing. No
linking code changed in the window.**

---

## 1. Every writer of `discovery_events.venue_id`

| Writer | File:line | Trigger | Sets venue_id? |
|---|---|---|---|
| 🔴 **Backfill (the bulk linker)** | `scripts/backfill-venue-id.ts:140` — `.from('discovery_events').update({ venue_id }).is('venue_id', null)` | **MANUAL** — `npx tsx scripts/backfill-venue-id.ts --apply`, "run by hand". **No cron, no workflow, no edge fn.** | **Yes**, high-confidence, coord-bearing only |
| Low-confidence backfill | `scripts/backfill-venue-id-low.ts` | **MANUAL** — writes SQL/CSV artifacts for review; **does not write the DB itself** (proposes `backfill-low-approved.sql` to run by hand) | Only via a hand-run of its emitted SQL |
| Inbound bridge (inline) | `app/api/inbound-schedule/route.ts:103,108` — upsert with `venue_id: venueId` | **API route**, POSTed to with `INBOUND_SCHEDULE_SECRET`. `run-scraper.js:1465` POSTs to it **only in the per-HatchGrab-truck loop** (`hgTruck`) — a small subset | Yes, but only for the HG-linked-truck subset |
| One-time sheet migration | `scripts/migrate-from-sheets.cjs:247` — insert with `venue_id: matchedVenue?.id` | **MANUAL, one-off** historical migration | Yes, historical only |
| Bulk discovery scrape | `scripts/run-scraper.js:1568` — `.from('discovery_events').upsert(batch, …)` | **Scheduled** (`daily_scrape.yml`) | 🔴 **NO** — the `batch` object has no `venue_id` field (event_date, start/end, truck_name, venue_name, village, event_notes, source, ai_notes). Creation leaves `venue_id` NULL |

🔴 **ABSENCE REPORTED AS ABSENCE: nothing links the BULK discovery feed at creation.** The scheduled
discovery scrape writes events with `venue_id` NULL; the only bulk linker is the **manual** backfill. This
matches the measured fact that newly created rows are mostly unlinked, and that late-August dates only
became 30-45% linked via a separate pass.

⚠️ The daily re-scrape's upsert (`:1568`) provides no `venue_id`, so on a conflicting (already-linked) row
its `ON CONFLICT DO UPDATE` touches only the columns in the payload (Supabase merge-duplicates) — it
**does not null out** an existing `venue_id`. So re-scrapes neither set nor wipe links; consistent with
late-August dates staying linked.

## 2. Scheduled jobs among the writers — verbatim schedules, and what they mean

🔴 **NONE of the `venue_id` writers is a scheduled job.** The backfill (the bulk linker) has no schedule at
all. The GitHub crons that *do* run only invoke the scraper, which does not link the bulk:

| Workflow | `cron:` verbatim | UTC meaning | Runs |
|---|---|---|---|
| `daily_scrape.yml` | **`'0 6 * * *'`** | **06:00 UTC, once daily** | `run-scraper.js` `SCRAPE_MODE: discovery` → bulk write, **no venue_id** |
| `hatchgrab_scrape.yml` | **`'0 * * * *'`** | **every hour on the hour, UTC** | `run-scraper.js` `SCRAPE_MODE: hatchgrab` → POSTs to inbound-schedule (HG subset only) |
| `process-next-truck.yml` | 🔴 **schedule OFF** — the file's own header: *"THE SCHEDULE IS OFF — turned off 2 September 2026"* (was `'*/30 * * * *'`), `workflow_dispatch` only | — | the menu scraper — not a venue writer anyway |

⚠️ **GitHub Actions cron is always UTC** (no timezone field), so I read the expressions directly rather
than trusting a name/comment — the manual's two-hours-out precedent. `hatchgrab_scrape.yml`'s own comment
even documents a prior cron regression ("06-28") where exact-hour matching broke; that is the scraper, not
the linker. **The point stands: no schedule runs the venue backfill.**

## 3. Git history, 25 August – 3 September

🔴 **NO commit touched any linking file in the window.** Zero. Last content changes, all well before it:

| File | Last commit (content) |
|---|---|
| `lib/venue-matcher.ts` (the matcher) | **2026-06-12** `8555508` |
| `scripts/backfill-venue-id.ts` | **2026-07-02** `79f1282` |
| `scripts/backfill-venue-id-low.ts` | 2026-07-02 `79f1282` |
| `app/api/inbound-schedule/route.ts` | 2026-07-02 `ee31dbf` |
| `scripts/run-scraper.js` | 2026-07-27 `56b7798` |
| `daily_scrape.yml` / `hatchgrab_scrape.yml` | 2026-06-28 / 2026-07-13 |

🔴 **A commit date is not a run date, and the code did not change — so the linking LOGIC is not the
cause.** The matcher is byte-identical to 12 June. ⚠️ The backfill's local output artifacts
(`scripts/backfill-output/`, **gitignored** — runs leave no committed trace) are dated **2 July** on this
machine; late-August linking must therefore have come from a hand-run elsewhere/since, which git cannot
show. **The change is in whether the manual pass was RUN, not in any file.**

## 4. How the matcher decides a venue matches — quoted, then measured

`lib/venue-matcher.ts findVenue`: candidates by **exact normalised name** *(lowercase, strip all
non-alphanumeric)* **OR token containment** (either direction), then ranked by **village agreement**;
confidence `high` (single/exact) or `low` (best-pick):
```
if (normName(v.name) === normScraped) return true          // exact normalised name
const vSubS = [...vTok].every(t => sTok.has(t))            // venue ⊆ scraped
const sSubV = [...sTok].every(t => vTok.has(t))            // scraped ⊆ venue
return vSubS || sSubV                                       // token containment
```
🔴 **No postcode, no coordinates, no alias array are match KEYS.** (Coordinates are a downstream *filter*
in `backfill-venue-id.ts:74` — "only accept a match that carries coordinates" — not part of the match.)

**Measured over the forward window (read-only, service role):**
- Unlinked forward events: **657**; distinct `venue_name` among them: **133**.
- 🔴 **102 of 133 (76%) have an EXACT normalised match in `venues` — and all 102 of those venues carry
  coordinates.** 31 have no match.

🔴 **Most DO match. Per your own criterion, that means the matcher is NOT RUNNING** — these 102 names would
be linked (they pass `findVenue`'s exact-name test and the backfill's coord filter) the moment the backfill
is run. They are unlinked because nobody ran the pass, **not** because the matcher fails. Sample matching
(would-link) names: *Alconbury Weald, Big Bite Hadleigh, Blackpit Brewery, Brew and Basket*. The 31
non-matches are mostly non-venues (*Christening, Dionne visit, Cantly Fun Day*) or truck names in the
venue field.

## 5. Does anything log the linking pass? — an observability gap

🔴 **The backfill writes NO persistent run-log.** It logs to **console** (`HIGH: n`, `LOW: n`, `NONE: n`)
and writes **local files** to `scripts/backfill-output/` (gitignored) — nothing else. It inserts no row
into `scraper_run_log` or any table. `scraper_run_log` records *schedule scraping*, not venue linking.

The inline bridge logs one ephemeral Vercel line per POST — `[inbound-schedule] wrote N discovery rows,
bridged M to truck_events` (`route.ts:342`) — but that is the HG-subset path, not the bulk linker, and it
is not queryable after the fact.

🔴 **So there is no signal anywhere that the linking pass ran, or stopped.** Its stopping was invisible
until you queried the `venue_id` linking percentages by date — which is the only way it could have
surfaced. **That is a finding about observability, not evidence of runs.**

---

## Conclusion (no fix proposed, per instruction)

**What changed is operational, not code.** Bulk discovery events are created unlinked (`run-scraper.js:1568`,
no `venue_id`), and the only thing that links them is a **manual** backfill (`scripts/backfill-venue-id.ts
--apply`) that runs on **no schedule**. It was run by hand through ~30 August (linking those dates 30-45%)
and has not been run since, so the forward window (1 Sep onward) is near-zero linked. The matcher and
backfill code are unchanged (matcher since 12 June); 76% of the unlinked forward venue names would still
match, all coord-bearing — so the matcher is **not running**, not failing. No run-log records the pass, so
its stop was undetectable until the linking percentages were measured.

🔴 **I did not run, restore, or trigger the linking.** Nothing was written to `venue_id`.

**Nothing changed. Nothing deployed.**
