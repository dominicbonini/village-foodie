# The shared discovery gate — build report

**Built, not applied.** No migration was applied, nothing was installed, no database write was made by any
step of this task: every proof below is a dry run, a synthetic dry run, or a read. `truck_events` was
neither read nor written by anything here.

Nothing in the brief arrived garbled and no instruction contradicted another.

---

## 🔴 WHERE MY EARLIER REPORTS WERE WRONG, RE-DERIVED

1. **R5 "village agrees" means the matcher said `high` — nothing wider.** My first cut of the gate
   re-tested `villageAgrees()` directly and accepted **39** of 71; the decided rule was measured at **38**.
   The extra row was a multi-candidate village tie the matcher had broken with `pickBest` and flagged
   `low` — a guess, not an agreement. The gate now honours the matcher's verdict and reproduces **38 of 71**
   exactly (§4).
2. **"Newest wins" cannot mean "arrived last".** A daily re-scrape re-posts an existing key, which is an
   UPDATE of that row; treating the re-post as newest would have made two sources supersede each other in
   turn, every day. Newest is now decided by `created_at`; an incoming row that is the *older* of a pair
   loses, and an already-superseded row is never resurrected. Found by the synthetic proof, fixed before
   anything shipped (§4).
3. **The prune job's first run faces 72 candidates, not 230.** 230 past-dated rows exist, but **158**
   belong to the four linked trucks, so the FK-or-name exclusion keeps them and 72 remain — under the
   88-row ceiling. My comment had said the first run would be refused; it will not. A *broken* exclusion
   sees all 230 and **is** refused (§7).
4. Live figures re-derived today: **920** rows (690 future / 230 past); created per day over the last 14
   days **4–44, mean 17.8**; `discovery_run_log` **232** rows; linked-truck rows by FK **139**, by name
   **163**, union 163 — name catches **24** the FK misses, FK catches **0** the name misses.

---

# PART ONE — PLAIN ENGLISH

**One door.** Every row that enters `discovery_events` now goes through one function,
`admitDiscoveryEvents` in `lib/discovery-gate.ts`. It matches the truck (name and aliases, the existing
matcher), resolves the venue (the existing matcher, then the R5 check — and if R5 says no, the event is
stored **with no venue** rather than a guessed one), runs the duplicate rule, and writes. The scraper no
longer touches the table; it posts to a new machine endpoint that hands rows to the gate. The screenshot
paths already went through `/api/inbound-schedule`, whose discovery write now *is* the gate.

**Not inside the bridge.** `/api/inbound-schedule` calls the gate for its discovery write and then runs its
`truck_events` bridge over the same untrimmed list it always did. The gate returns one outcome per row and
removes nothing from that list, so a row it marks as a duplicate is still offered to an operator for
approval. That is the one placement your review forbade, and this honours it.

**Duplicates are kept and hidden.** A loser gets `superseded_by` (the winner's id), which half of the rule
fired, the measured distance, the shared postcode if any, both sources and the time gap. The public feed
hides anything with `superseded_by` set; the admin table shows it, marked. This needs **one migration,
written and not applied** — the SQL is in the chat and in §5 — because the three visibility columns can
hide a row but cannot say why.

**What the dry runs found today.** Over the 690 future events the gate would link **103** unlinked rows to
a venue and refuse **222** (venue left empty), and would mark **13** rows as superseded — the same 13 the
earlier hand-run found, now produced by the shipped code. Nothing is changed until you run the backfill
with `--apply`.

**The delete job** is its own workflow: past-dated rows only; the four linked trucks kept by FK **or**
name; a count ceiling of `max(3 × mean, 2 × max, 60)` from the last 14 days (88 today); refuses and exits
red above it. Proved: a simulated broken exclusion → **exit 1, nothing deleted**; today's real run → 72
candidates, passes.

---

# PART TWO — WHAT WAS BUILT

## 1. Files

| file | status | what |
|---|---|---|
| `lib/discovery-gate.ts` | **new** | the gate: truck → venue+R5 → duplicate → write |
| `app/api/discovery/ingest/route.ts` | **new** | secret-gated POST that calls the gate; no bridge, no email, never reads `truck_events` |
| `app/api/inbound-schedule/route.ts` | modified | its enrichment + upsert replaced by one gate call; **bridge loop untouched** |
| `scripts/run-scraper.js` | modified | Pass A's direct upsert replaced by chunked POSTs to `/api/discovery/ingest` |
| `scripts/import-hatchesup-schedule.js` | modified | direct upsert replaced by POSTs to the gate |
| `app/api/discovery/events/route.ts` | modified | public feed filters `superseded_by is null`, tolerant of the column not existing yet |
| `app/api/admin/discovery-events/route.ts` | modified | SELECT carries the four superseded columns, falls back to the plain SELECT pre-migration |
| `supabase/migrations/20260911_discovery_events_superseded.sql` | **new, NOT applied** | 2,762 bytes |
| `scripts/backfill-discovery-dedup.mjs` | **new** | one-off, dry run by default, `--apply` to write |
| `scripts/prune-discovery-events.mjs` + `.github/workflows/discovery_prune.yml` | **new** | the daily delete job |

`npx tsc --noEmit` → 0 errors. Lint: `lib/discovery-gate.ts` 0, `ingest/route.ts` 0,
`inbound-schedule/route.ts` 3 (HEAD: 3), `discovery/events/route.ts` 17 (HEAD: 17),
`admin/discovery-events/route.ts` 5 (all `no-explicit-any` on pre-existing lines; line 79 is the original
`rows: any[]`). No worse than baseline.

## 2. The gate, step by step (`admitDiscoveryEvents`)

1. **Truck** — `scheduleKeys` + `eventMatchesKeys` (`lib/schedule-match`: exact after trim/lowercase over
   the name **and every alias**); if that finds nothing, the route's existing `normName` containment. Both
   are imports; no sixth normaliser exists.
2. **Venue** — `findVenue` (`lib/venue-matcher`, **unmodified**) proposes a venue and a confidence. Then
   **R5**, as an acceptance check on that output: if the scraped text carries a postcode and its *sector*
   differs from the venue's → reject; else accept if the matcher said `high`; else the venue must lie within
   15 km of the event's village anchor (median of the other venues in that village — the matcher's own
   construction, re-derived because its helper is private) → accept; otherwise reject. **A rejection leaves
   `venue_id` NULL and returns the reason.** If the matcher found no candidate at all and the row has a
   village, a venue is **created** on `(name, village)` with no coordinates — the same shape the scraper
   has always written for an un-geocodable venue — so the next scrape resolves it instead of minting it
   again.
3. **Duplicate** — same `event_date`, same truck (resolved id when both rows have one, else the scraper-
   mirror normaliser `normalizeVenue` on the name), and **either the same full postcode or venues ≤ 500 m**
   apart. Time is not tested; the start-time gap is recorded. Rows already superseded are skipped as
   counterparts. **Newest by `created_at` wins**: an incoming row whose key already exists keeps its stored
   `created_at`, so a re-scrape cannot flip a settled pair; a genuinely new key is newest by construction.
4. **Write** — upsert on the existing unique key, then mark the loser (`superseded_by`, reason, meta,
   `show_on_vf/hg = false`). A mark that fails because the migration is not yet applied is **counted and
   returned as `markFailed`, not thrown** — the scraper keeps working before the migration; nothing is
   hidden until it runs.

## 3. Placement — where the gate is, and why it is safe

`app/api/inbound-schedule/route.ts` now does, in order: parse rows → resolve venues for the bridge's own
coordinate stamps (unchanged) → **`admitDiscoveryEvents(rows…)`** → bridge loop over **`rows`**. The gate
receives a *mapped copy* of `rows` and returns outcomes; it neither mutates nor filters the array the
bridge iterates. A gate write failure is a 500 for the batch, exactly as the old upsert error was, so the
bridge never runs on rows that did not land. The scraper's Pass A posts to `/api/discovery/ingest`, which
has **no bridge and no email** — 750 discovery rows a day never enter the loop that emails operators.

**Census of every insert/upsert into `discovery_events`** (grep over `app`, `lib`, `scripts`, `supabase`,
no extension filter, exit 0 = found):

| site | verdict |
|---|---|
| `lib/discovery-gate.ts:210` — the gate's upsert | the one write path |
| `scripts/migrate-from-sheets.cjs:150` — `.insert(batch)` | ⚠️ **a direct insert survives**: the May 2026 one-off Sheets migration. Referenced by **no** workflow and no `package.json` script (grep exit 1). Left as-is rather than edited: it is a historical artefact that nothing runs. Stated here so the census is honest. |

Updates/deletes: the gate's mark, the admin editor's `update`/`delete` by id (unchanged), the backfill's
`update`s, the prune job's `delete`, `backfill-venue-id.ts`'s `venue_id` update (emit-only by default).
None inserts.

## 4. Proofs — executed against the shipped code

**R5 on the decided subset.** The gate's `r5Accept`, run over the 75 unlinked rows that sit in same-day
same-truck pairs: the matcher returns a venue with coordinates for **71**; **R5 accepts 38, rejects 33**
(4 have a candidate with no coordinates). Matches the decision exactly.

**Synthetic dry run through `admitDiscoveryEvents` (`dryRun: true`; row count 920 before and after):**

| incoming row | truck | venue | duplicate verdict |
|---|---|---|---|
| Elder Street Food · 17 Sep · `The Common` | alias-exact | `high` → linked | supersedes the OTBT row: **postcode CB10 1JH · 0 m · gap 0 min** |
| Perky Beans · 25 Sep · `The Bull Pub [Great Paxton]` | alias-exact | **R5-rejected → NULL** (36.3 km from the Great Paxton anchor) | none |
| Elder Street Food · 17 Sep · `Off The Beaten Truck - The Common` (key already exists) | alias-exact | `high` → linked | **SELF is the loser** — its stored `created_at` is older than `The Common` row's: `SELF-by-89729d1d…` · postcode · 47 m |

Rows 1 and 3 are the two halves of one real pair and they agree on a single winner in both directions —
that is the no-ping-pong property. Row 2 is the guard the whole design exists for.

**The backfill's own dry run (`node scripts/backfill-discovery-dedup.mjs`, writes nothing):**

```
🧪 DRY RUN · future events 690 · trucks 231 · venues 819
── STEP 1 · R5 enrichment: would set venue_id on 103 rows · rejects 222 ──
── STEP 2 · duplicate rule: would mark 13 rows superseded · unjudgeable pairs 29 ──
```

Step 1 runs over **all 326** unlinked future rows, not only the 71 in pairs — hence 103, not 38. The top
rejects are the ones you would expect: Perky Beans × 42 (36.3 km), Blackpit Brewery × 29 and Church View
× 27 (villages with no anchor), The Railway Tavern × 9 (24 km), The Bull [Bottisham] × 9 (26.9 km). The 13
marks are the Pig-Casso's Biomedical trio (26 m) and their `foodPark` postcode matches (CB2 0AA, 512 m),
Gusto `Wickhambrook MSC`/`MSC` (0 m), the three Nomadough Langley/Biomedical pairs, Elder Street Food
(CB10 1JH), Nomadough `IVO Brewery`/`Burleigh Hill Farm` (PE27 3LY), and Marky D's Lingwood hall
(NR13 4AZ, 2,553 m — a bad coordinate on one row, caught by the postcode half).

**The flag is `--apply`.** Nothing else enables writing — not an env var, not a prompt.

## 5. Superseded rows — the migration

`visibility` / `show_on_vf` / `show_on_hg` **can hide but cannot explain**: none can record which row won,
which rule fired, the distance, the sources or the time gap, and `hidden` already means "operator
suppressed". The gate flips `show_on_*` off on a loser *as well*, but the record needs its own columns.

**`supabase/migrations/20260911_discovery_events_superseded.sql` — 2,762 bytes, written, NOT applied.**
The full SQL is in the chat. After running it: **`notify pgrst, 'reload schema';`** — it is the last line
of the file, and without it PostgREST answers PGRST204 for the new columns and every mark fails.

Until it is applied: the gate's marks fail and are counted (`markFailed`), fresh inserts are unaffected;
the public feed's `.is('superseded_by', null)` is rejected with **42703** (proved live today) and the feed
retries without it, logging once; the admin table falls back to its plain SELECT. Nothing breaks, nothing
hides.

## 6. The scraper — auth, outages, partial failure

- **Auth:** `INBOUND_SCHEDULE_SECRET` in the POST body, the secret both workflows already hold; a wrong or
  missing secret is 401 and nothing is written.
- **Order kept:** the Sheet append is awaited *before* the POST, so an endpoint outage never loses the
  Sheet row. Recovery now needs the app up (a Vercel deploy), not only Supabase.
- **Endpoint down:** every chunk's `fetch` throws or returns non-2xx → `assertInboundOk` throws → the
  message is pushed into `dbWriteFailures` → `assertNoWriteFailures` exits **1** at the end of the run.
  Red, with the chunk range and the HTTP status named. An unset `HATCHGRAB_API_URL` is recorded the same
  way rather than silently skipping.
- **Partial failure:** the ingest route answers **207** when even one row of a chunk did not land, and
  `assertInboundOk` treats 207 as failure. A day where 3 rows of 750 failed is a red run.
- Chunks of 100 (the old batch size); the route refuses more than 200 in one request.

## 7. The delete job

`.github/workflows/discovery_prune.yml` — its own cron (03:30, clear of the 06:00 scrape), its own job, its
own exit code. A manual dispatch defaults to `--dry-run`. `scripts/prune-discovery-events.mjs`:

- resolves the four trucks' discovery ids **from the live table by `hatchgrab_truck_id`** — if fewer than
  four resolve, it refuses;
- a past-dated row is kept if its `discovery_truck_id` is one of those **or** its name contains / is
  contained by one of the four names — both tests, every run;
- ceiling = `max(3 × mean, 2 × max, 60)` of rows created per day over the last 14 days = **88** today;
  candidates above it → **exit 1, nothing deleted**; `ALLOW_BACKLOG=<n>` raises it once, deliberately;
- `discovery_run_log` pruning is a **separate step with its own ceiling** (rows older than 30 days, refuse
  above 60 runs' worth), so a successful log prune can never mask a refused event prune.

| run | result |
|---|---|
| `--dry-run` today | 230 past · **158 kept** as linked · **72 candidates** · ceiling 88 → would delete 72, exit 0 |
| `--simulate-broken-exclusion` | 230 candidates > 88 → **REFUSED, exit 1**, nothing deleted |
| `ALLOW_BACKLOG=1 --dry-run` (floor forced low) | 72 > 1 → **REFUSED, exit 1** |

**`discovery_run_log`: yes, prune it here** — 232 rows in two days at 116 per run, no retention anywhere
else — but as the separate guarded step above, never in the same statement as the events.

---

# HOW I CHECKED

**Compiler-confirmed:** `tsc --noEmit` 0 errors after every edit; lint counts against HEAD for the tracked
files. **Executed:** the gate's `r5Accept` over the 71 (38/33); `admitDiscoveryEvents` in dry-run mode
with three synthetic rows; the backfill's dry run over the live table; the prune script's three runs with
node's own exit codes; the live 42703 on the feed filter; the write census. **Structural:** that the bridge
iterates `rows` and the gate never filters it; that `migrate-from-sheets.cjs` is referenced by nothing.
**Not done:** no migration applied, no `--apply`, no scrape, no deletion, no build.
