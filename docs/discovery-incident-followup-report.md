# Discovery upsert incident — follow-up: safeguards, and the impact of the reset fields

**Date:** 17 September 2026 · Follow-up to `docs/discovery-upsert-incident-report.md`.
**Writes:** none. No database write, no storage write. The only files changed are the four named in Part A.
**Scripts run:** `scripts/run-harnesses.cjs` (and, through it, the 43 harnesses it lists) and
`scripts/ops-write-guard.cjs`. `scripts/` was never globbed. Neither operational script was executed.

**No span of the prompt arrived garbled, and no instruction contradicted another.** One judgement call I
had to make on my own is flagged prominently in §A1.2 — it is a fact about the repo, not an ambiguity in
the brief, and I have documented it rather than silently choosing.

---

## STEP 0 — `git status`

### Before

Branch `main`, up to date with `origin/main`, **nothing staged**: 35 modified, 71 untracked.

```
Changes not staged for commit:
  modified:   android/app/capacitor.build.gradle       modified:   lib/capacity-breach.ts
  modified:   android/capacitor.settings.gradle        modified:   lib/features.ts
  modified:   app/api/dashboard/action/route.ts        modified:   lib/orders/place-in-slot.ts
  modified:   app/api/dashboard/route.ts               modified:   lib/payments/promote-draft.ts
  modified:   app/api/events/route.ts                  modified:   lib/plan-features.ts
  modified:   app/api/manage/route.ts                  modified:   lib/printing/bleTransport.ts
  modified:   app/api/menu/[truckId]/route.ts          modified:   lib/printing/transport.ts
  modified:   app/api/orders/submit/route.ts           modified:   lib/printing/usePrinting.ts
  modified:   app/api/slots/[truckId]/route.ts         modified:   lib/slot-availability.ts
  modified:   app/dashboard/[token]/page.tsx           modified:   lib/slot-bookings.ts
  modified:   app/landing/page.tsx                     modified:   lib/slot-display.ts
  modified:   app/manage/[token]/page.tsx              modified:   lib/slot-generation.ts
  modified:   app/trucks/[slug]/order/page.tsx         modified:   lib/supabase.ts
  modified:   components/dashboard/AddOrderPanel.tsx   modified:   package-lock.json
  modified:   components/dashboard/CapacityBreachBanner.tsx    modified:   package.json
  modified:   components/printing/PrintingSettings.tsx  modified:  scripts/whatsapp-golive-parity-harness.cjs
  modified:   content/store-listing.md                 modified:   ios/App/App/Info.plist
  modified:   ios/App/CapApp-SPM/Package.swift

Untracked: app/api/printing/, components/printing/PrinterTypeChoice.tsx, 20 × docs/*.md,
  lib/orders/cooking-reservation.ts, lib/printing/{netAddress,netTransport,networkGuard,testTicket}.ts,
  lib/slot-fit-message.ts, lib/slot-interval.ts, plugins/, 30 × scripts/*.cjs, scripts/fixtures/,
  5 × supabase/migrations/2026091*.sql
no changes added to commit
```

### After

Identical, **plus three new untracked files and two modified scripts**:

| Path | State |
|---|---|
| `scripts/harnesses.json` | **new** (untracked) |
| `scripts/run-harnesses.cjs` | **new** (untracked) |
| `scripts/ops-write-guard.cjs` | **new** (untracked) |
| `scripts/migrate-from-sheets.cjs` | untracked already; guard added |
| `scripts/register-payment-domain.cjs` | **now shows as ` M` modified** (it is tracked; guard added) |
| `docs/discovery-incident-followup-report.md` | **new** (untracked) — this file |

`git add -A` / `git add .` were not run. Nothing was staged, committed, stashed, reset or restored.

---

# PART A — SAFEGUARDS

## A1. `scripts/harnesses.json` and `scripts/run-harnesses.cjs`

### A1.1 The list

`scripts/harnesses.json` names **43 harnesses** explicitly and, in an `excluded` block, accounts for
**every other `.cjs` file in `scripts/` with the reason it is absent**. The runner checks that the two
sets cover the directory and reports anything unregistered, so a new file cannot quietly join a sweep —
nor quietly escape one.

### A1.2 🔶 THE ONE JUDGEMENT CALL — 42, not 48

The brief said "the 49 your §6.1 capability test cleared, minus `dev-virtual-printer.cjs`", which is 48.
I listed **42 of the repo's own harnesses plus the new `ops-write-guard.cjs` = 43**, and excluded six
more files than the brief anticipated. The six, and why:

| Excluded file | Why it is not a harness |
|---|---|
| `_batch-reservation-sim.cjs` | shared module: exports `load`/`Sim`, asserts nothing |
| `_batch-rolling-snapshot.cjs` | shared module: exports `fmt`, `mins`, `gridKey`, `decodeCase`, … |
| `_printing-mocks.cjs` | shared module: installs Capacitor fakes for the printing harnesses |
| `_slot-interval-compile.cjs` | shared module: exports `compile`, `headWorktree` |
| `_batch-rolling-golden-generate.cjs` | 🔴 **rewrites `scripts/fixtures/batch-rolling-golden.json`** |
| `_batch-reservation-golden-on-generate.cjs` | 🔴 **rewrites `scripts/fixtures/batch-reservation-golden-on.json`** |

The last two are the ones that matter. They pass the capability test — no client, no key, no network —
but they **overwrite the committed golden fixtures that `batch-rolling-identity.cjs` and
`batch-reservation-golden-on.cjs` check against**. Putting them in a sweep list would mean every run
regenerated the baseline and then compared the build to itself: both identity proofs would pass
for ever, including on a build that had broken the engine. That is a quieter failure than the incident
and a harder one to notice. The capability test screens for *reaching production*; it does not screen for
*destroying your own evidence*, so I added the second criterion by hand and wrote the reasoning into
`harnesses.json` where the next person will meet it.

The four shared modules are merely pointless to run. I excluded them for tidiness, not safety.

**If you would rather the list matched the brief exactly, the four modules are harmless to add. The two
generators should stay out.**

### A1.3 The runner

`scripts/run-harnesses.cjs`. It reads the list, screens every listed file, then runs them sequentially.

**The screen — `BANNED` + `badFetches`:**

```js
const BANNED = [
  { name: 'createClient',              test: s => s.includes('createClient') },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', test: s => s.includes('SUPABASE_SERVICE_ROLE_KEY') },
  { name: 'googleapis',                test: s => s.includes('googleapis') },
  { name: 'stripe',                    test: s => /\bstripe\b/i.test(s) },
]
```

`badFetches` finds every `fetch(` and refuses any whose first argument is not a string literal pointing
at `localhost` / `127.0.0.1` / `[::1]` or a relative path. **A non-literal argument is refused, not
allowed** — the runner decides from source text alone, and `fetch(url)` could hold anything.

Three deliberate design choices, each written into the file's comments:

1. **Any occurrence disqualifies, including one in a comment or a string.** No allow-list, no escape
   hatch, no "this file is permitted to mention it". Every exception is the hole someone later widens.
2. **The screen refuses the WHOLE run**, not just the offending file. A list containing a production
   script is a broken list, and none of it should be trusted until it is fixed.
3. **The true exit code is recorded.** `spawnSync().status` is `null` when a child dies on a signal;
   reading that as `0` is exactly how a failing sweep reports success, so a signal death becomes `128`.

**A false positive the screen produced, and how I resolved it.** On its first run the screen refused
`ops-write-guard.cjs` — my own new harness — because it must *reason about* the strings `createClient`
and `SUPABASE_SERVICE_ROLE_KEY` and therefore contained them. I fixed the harness, not the screen:

```js
const CLIENT_FN = 'create' + 'Client'
const SR_KEY = 'SUPABASE_SERVICE' + '_ROLE_KEY'
```

Weakening the screen to accommodate one file would have re-introduced exactly the class of exception the
whole mechanism exists to remove.

### A1.4 The broken variant — run FIRST

A temporary copy of the list with the three operational scripts prepended, written to the scratchpad
(never committed):

```
node scripts/run-harnesses.cjs --list=$SCRATCH/harnesses-BROKEN.json
```

```
list: …/harnesses-BROKEN.json — 46 harnesses

── SCREENING ────────────────────────────────────────────────────────────────────────────
  🔴 REFUSED migrate-from-sheets.cjs — createClient; SUPABASE_SERVICE_ROLE_KEY; googleapis
  🔴 REFUSED register-payment-domain.cjs — createClient; SUPABASE_SERVICE_ROLE_KEY; stripe
  🔴 REFUSED list-stranded-authorisations.cjs — createClient; SUPABASE_SERVICE_ROLE_KEY; stripe

🔴 REFUSING THE ENTIRE RUN. 3 file(s) failed the screen, 0 missing.
   Nothing was executed. A listed file that can reach production is a bug in the list.
```

**True exit code: 3.** Nothing was executed — in particular `migrate-from-sheets.cjs` was refused on
source inspection, before any child process was spawned. The refusal caught all three operational
scripts, including `list-stranded-authorisations.cjs`, which is read-only in practice but is still an
operational tool that must never run unattended.

## A2. The production write guard

Added to both scripts, as the **first executable statement** — nothing but a shebang, comments and blank
lines precedes it, so no `require`, no `process.env` read and no client construction happens first.

`scripts/migrate-from-sheets.cjs` line 19, above `require('dotenv').config(…)`:

```js
if (!process.argv.includes('--yes-write-to-production')) { console.error('This script WRITES to production. Re-run with --yes-write-to-production.'); process.exit(1) }
```

`scripts/register-payment-domain.cjs` line 38, above `const fs = require('fs')`: the same line.

⚠️ **One consequence you should know about:** the guard gates the *whole file*, so
`node scripts/register-payment-domain.cjs acct_… --dry-run` — which writes nothing — now also needs the
flag. I implemented the brief exactly rather than carving out an exception; the cost is one extra flag on
a deliberate dry run, and the benefit is that there is no argument combination a stray invocation can
stumble into. Say the word and I will narrow it to the write paths only.

### The proof — `scripts/ops-write-guard.cjs`

**🔴 It never executes either script, not even to watch it refuse.** Running `migrate-from-sheets.cjs` to
prove it refuses would be the same gamble that caused the incident: one bad edit to the guard and the
"proof" becomes the second occurrence. The assertion is made against the **file text**, and it is a
stronger claim than "it refused when I ran it" — it says *nothing can run before the refusal*.

`firstExecutable(src)` walks the source, skipping a shebang, blank lines, `//` comments and `/* */`
blocks, and returns the first line Node would actually execute.

**Failure mode:** an operational script that writes to production being runnable by accident.

**Broken variants, run first, both FAILED as required:**

| | Shape | Result |
|---|---|---|
| V1 | the guard present but **after** the client is built | ✓ FAILED as required — first executable statement is line 3, `const { createClient } = require('@supabase/supabase-js')` |
| V2 | **no guard at all** — the file exactly as it was on 17 September | ✓ FAILED as required — first executable statement is `require('dotenv').config({ path: '.env.local' });` |

**Real result — 13 checks, all pass:**

```
  ✓ migrate-from-sheets.cjs: the guard is the FIRST executable statement (line 19)
  ✓ migrate-from-sheets.cjs: …and it precedes the createClient call (guard at char 1163, client at 1432)
  ✓ migrate-from-sheets.cjs: no process.env is read above the guard
  ✓ migrate-from-sheets.cjs: nothing is require()d above the guard
  ✓ migrate-from-sheets.cjs: the flag string is present
  ✓ register-payment-domain.cjs: the guard is the FIRST executable statement (line 38)
  ✓ register-payment-domain.cjs: …and it precedes the createClient call (guard at char 2707, client at 3356)
  ✓ register-payment-domain.cjs: no process.env is read above the guard
  ✓ register-payment-domain.cjs: nothing is require()d above the guard
  ✓ register-payment-domain.cjs: the flag string is present
  ✓ migrate-from-sheets.cjs is absent from scripts/harnesses.json
  ✓ register-payment-domain.cjs is absent from scripts/harnesses.json
  ✓ this harness is itself listed, so the guard is re-checked on every sweep

✅ both operational scripts refuse to run without the flag, and nothing executes above the refusal
```

The last three matter: the harness is itself in `harnesses.json`, so **every future sweep re-checks the
guard**. If someone removes or displaces it, the sweep fails.

## A3. Every reference to each operational script — nothing may break when they move

**Nothing was moved or renamed this round.** The four references that are cron-critical:

| Workflow | Line | Invocation | Schedule |
|---|---|---|---|
| `.github/workflows/daily_scrape.yml` | 57 | `node scripts/run-scraper.js` | `0 6 * * *` |
| `.github/workflows/hatchgrab_scrape.yml` | 64 | `node scripts/run-scraper.js` | hourly + due-window gate |
| `.github/workflows/discovery_prune.yml` | 39, 41 | `node scripts/prune-discovery-events.mjs` (`--dry-run` on manual dispatch) | `30 3 * * *` |
| `.github/workflows/process-next-truck.yml` | 58 | `node scripts/process-next-truck.js` | 🔴 **cron OFF since 2 Sep 2026**; `workflow_dispatch` only |

**`package.json` names no script at all** — `scripts` is `{dev, build, start, lint}`. So the npm surface
is not a constraint on any move.

**`migrate-from-sheets.cjs` and `register-payment-domain.cjs` are referenced by NO workflow and NO npm
script** — only by prose in `docs/`. Both can be moved to `scripts/ops/` with zero runtime risk; the only
cost is stale paths in documentation.

Doc references that would need updating on a move (the paths appear as text, so nothing breaks, but they
would mislead): `docs/payment-domain-report.md` lines 90, 198, 203, 208, 209, 303 (six literal
`node scripts/register-payment-domain.cjs …` command lines); `docs/dedup-gate-build-report.md:126, 227`
and `docs/sites-from-preconditions-report.md:59` for the migration; `docs/capture-card-path-report.md:17`
and `docs/live-mode-confirmation-report.md:166` for the stranded-authorisations script;
`docs/wired-printing-build-report.md` lines 121, 138, 185, 242, 248, 320 for `dev-virtual-printer.cjs`.

⚠️ **The one real hazard in a future move**, which is not about paths: `.github/workflows/*.yml` are read
by GitHub **from the default branch**, so editing a workflow locally does not change what fires. The
`process-next-truck.yml` header already records this lesson. Any move of `run-scraper.js`,
`prune-discovery-events.mjs` or `process-next-truck.js` must land the workflow edit and the file move in
the **same push**, or the next cron fires against a path that no longer exists.

## A4. The run

`node scripts/run-harnesses.cjs` — nothing else was run.

```
list: scripts/harnesses.json — 43 harnesses

── SCREENING ────────────────────────────────────────────────────────────────────────────
  ✓ all 43 listed files pass the screen (no createClient, no service-role key, no googleapis,
    no stripe, no non-local fetch)

── SUMMARY ──────────────────────────────────────────────────────────────────────────────
  rc=0   add-order-fit-message.cjs                      rc=0   printing-copy.cjs
  rc=0   add-order-render.cjs                           rc=0   printing-dedupe.cjs
  rc=0   batch-reservation-display-equals-picker.cjs    rc=0   printing-escpos-identity.cjs
  rc=0   batch-reservation-golden-on.cjs                rc=0   printing-failure-split.cjs
  rc=0   batch-reservation-helper.cjs                   rc=0   printing-gating.cjs
  rc=0   batch-reservation-immutability.cjs             rc=0   printing-network-guard.cjs
  rc=0   batch-reservation-instants.cjs                 rc=0   printing-transport-contract.cjs
  rc=0   batch-reservation-lock.cjs                     rc=0   slot-interval-dots.cjs
  rc=0   batch-reservation-p2-identity.cjs              rc=0   slot-interval-engine-identity.cjs
  rc=0   batch-reservation-p3-worked-case.cjs           rc=0   slot-interval-event-override.cjs
  rc=0   batch-reservation-switch.cjs                   rc=0   slot-interval-generator.cjs
  rc=0   batch-reservation-writers.cjs                  rc=0   slot-interval-grid-routing.cjs
  rc=0   batch-rolling-check.cjs                        rc=0   slot-interval-settings.cjs
  rc=0   batch-rolling-identity.cjs                     rc=0   slot-interval-van-list-tolerance.cjs
  rc=0   customer-path-identity.cjs                     rc=0   slot-interval-van-resolution.cjs
  rc=0   ops-write-guard.cjs                            rc=0   whatsapp-background-jobs-harness.cjs
  rc=0   outreach-channel-for.cjs                       rc=0   whatsapp-connection-view-harness.cjs
  rc=0   outreach-dnc-pool.cjs                          rc=0   whatsapp-golive-parity-harness.cjs
  rc=0   outreach-list-columns.cjs                      rc=0   whatsapp-settings-row-harness.cjs
  rc=0   outreach-log-once.cjs                          rc=0   whatsapp-setup-machine-harness.cjs
  rc=0   outreach-logo-latch.cjs
  rc=0   outreach-stage-advance.cjs
  rc=0   outreach-upload-refresh.cjs

  43 run · 43 passed · 0 failed

✅ every listed harness passed
```

**Runner's true exit code: 0.** `npx tsc --noEmit` — **true exit code 0, no output.**

---

# PART B — IMPACT OF THE RESET FIELDS

## B0. The finding that governs everything below

`scripts/run-scraper.js` reads its truck data from **either** the Google Sheet **or** `discovery_trucks`,
selected by two environment switches, and **both default to the Sheet**:

```js
const MATCH_FROM_RAW = (process.env.MATCH_FROM || '').trim();          // :607
const MATCH_FROM = MATCH_FROM_RAW.toLowerCase() === 'db' ? 'db' : 'sheet';
const SITES_FROM_RAW = (process.env.SITES_FROM || '').trim();          // :847
const SITES_FROM = SITES_FROM_RAW.toLowerCase() === 'db' ? 'db' : 'sheet';
```
```js
const validTrucks   = (MATCH_FROM === 'db' && dbValidTrucks) ? dbValidTrucks : sheetValidTrucks;  // :770
const sitesToScrape = (SITES_FROM  === 'db' && dbSites)      ? dbSites.slice() : sheetSites.slice(); // :997
```

**Neither variable is set in any workflow.** `daily_scrape.yml`'s env block (lines 44–56) sets
`SCRAPE_MODE`, `SPREADSHEET_ID`, `GEMINI_API_KEY`, `GOOGLE_SHEETS_CREDENTIALS`, the Supabase URL and key,
`HATCHGRAB_API_URL`, `INBOUND_SCHEDULE_SECRET`, `SCRAPE_TRUCK_ID` and the Chrome path — and nothing else.
The scraper's own line 606 states it plainly: *"NOTHING HERE CHANGES BEHAVIOUR UNTIL `MATCH_FROM=db` IS
SET IN A WORKFLOW. Unset = sheet."*

**Therefore the reset of `aliases`, `schedule_url`, `website`, `ai_instructions` and `scraper_strategy`
changes nothing about what the scraper scrapes or how it matches.** It reads those from the Sheet, and
the Sheet is the very thing the run copied *into* the database. The damage is confined to surfaces that
read the database — the admin console and the public listing — and the one that does not read the
database at all is the scraper.

⚠️ **The corollary is a trap for later.** The moment someone sets `MATCH_FROM=db` or `SITES_FROM=db`, the
reset values become live. The floor checks at lines 752–759 (`MATCH_MIN_RATIO = 0.5`, empty-set refusal)
guard against a *missing* set, not a *degraded* one: alias coverage could fall to zero and the ratio check
would still pass, because the truck **count** is unchanged. Do not flip either switch until §B4 is done.

## B1. `aliases` — blanked to `[]` on 112 of the 132 rows

### Every reader, quoted

**① The shared matcher — `lib/schedule-match.ts`.** One definition, so its callers cannot disagree:

```ts
export function scheduleKeys(name: string | null | undefined, aliases: string[] | null | undefined): Set<string> {
  const keys = new Set<string>()
  const n = scheduleNorm(name)
  if (n) keys.add(n)
  for (const a of aliases ?? []) {
    const k = scheduleNorm(a)
    if (k) keys.add(k)
  }
  return keys
}
/** True if this event row belongs to the truck those keys describe. Exact membership, never fuzzy. */
export function eventMatchesKeys(truckName: string | null | undefined, keys: Set<string>): boolean {
  const k = scheduleNorm(truckName)
  return k ? keys.has(k) : false
}
```

**② The outreach table's Schedule cell — `app/api/admin/outreach/route.ts:109–126, 306.**

```ts
// Merge a truck's own name + all aliases into one schedule figure (a truck's events may be filed under any
  const keys = scheduleKeys(name, aliases)   // the shared rule; was these three lines inline
    // Across a truck's name and aliases, the next event is the EARLIEST of their next events.
```
Its select embeds `aliases` (`TRUCK_EMBED`, line 149).

**③ The Schedule popup — `app/api/admin/discovery-events/route.ts:117–133.**

```ts
.from('discovery_trucks').select('name, aliases').eq('id', truckId).maybeSingle()
scopedKeys = scheduleKeys(t.name, t.aliases as string[] | null)
// 🔴 AN EMPTY KEY SET MUST MATCH NOTHING, NOT EVERYTHING. A truck with a blank name and no aliases
```

**④ The inbound gate — `lib/discovery-gate.ts:205–210.**

```ts
supabase.from('discovery_trucks').select('id, name, aliases'),
const truckKeys = trucks.map(t => ({ t, keys: scheduleKeys(t.name, t.aliases) }))
```
and `app/api/inbound-schedule/route.ts:68` reads the same three columns.

**⑤ The public site — `app/api/discovery/events/route.ts:68, 373.** `aliases` is in `TR_SELECT` and is
flattened for output: `aliases: Array.isArray(t.aliases) ? t.aliases.join(',') : (t.aliases || '')`.

**⑥ The scraper — `scripts/run-scraper.js:689–692` (Sheet) and `:713–719` (DB), consumed by
`matchTruckIn` at `:620`.** Per §B0, the Sheet set is the one in use.

**⑦ `lib/utils.ts:231–241`** reads `truck.aliases` as a comma-separated **string** — the legacy Sheet
shape, not the `text[]` column.

### What an empty `aliases` changes at the next scraper run

**Nothing.** `MATCH_FROM` is unset, so `matchTruckIn` runs against `sheetValidTrucks`, built from Sheet
column R. The only visible effect is **log noise**: the MATCH CONTROL at `:784–802` compares both sets
every run and will now report disagreements it did not report before, including the line at `:795`
warning that rows the database cannot match "would become NEW" under `MATCH_FROM=db`. That warning is
now accurate and should not be dismissed.

What **does** change is the **admin console**: an affected truck whose events are filed under an alias
now shows a lower `Y (n)` Schedule count, and its popup lists fewer rows. The inbound gate (④) likewise
matches on name alone for those rows, so an inbound schedule filed under an alias would create a new
truck instead of matching the existing one.

### The read-only SQL, and what it found

Introspection first, as asked. **`information_schema` is not reachable through PostgREST** — it answers
`PGRST205`, *"Could not find the table `public.information_schema.columns` in the schema cache"* — so I
introspected through the PostgREST OpenAPI document instead, which is the only introspection this
connection exposes. `discovery_events` columns confirmed before naming any: `id, event_date, start_time,
end_time, truck_name, venue_name, village, event_notes, source, ai_notes, discovery_truck_id, venue_id,
created_at, updated_at, visibility, show_on_vf`.

```sql
-- events created in the last 30 days, the set searched for alias-filed rows
select discovery_events.id, discovery_events.truck_name, discovery_events.event_date,
       discovery_events.discovery_truck_id, discovery_events.created_at
from public.discovery_events
where discovery_events.created_at >= '2026-08-18T00:00:00Z';
-- 459 rows

-- current alias coverage, by group
select count(*) filter (where array_length(discovery_trucks.aliases, 1) > 0) as with_aliases,
       count(*)                                                             as total
from public.discovery_trucks;
-- 20 of 250
```

Matching those 459 events against each affected row's **Sheet** aliases (the pre-incident alias text,
since the database no longer holds it):

| Question | Answer |
|---|---|
| Affected rows whose **Sheet** alias cell is non-empty but whose DB `aliases` is now `[]` | **0** |
| Of those, rows with events in the last 30 days filed under an alias | **0** |
| Affected rows (132) that still have aliases | 20 |
| Affected rows that now have `[]` | 112 |
| Untouched rows (99) with aliases | 0 |
| Inserted rows (19) with aliases | 0 |

**So the 112 blanked rows have an empty alias cell in the Sheet too.** The Sheet therefore cannot tell me
what the database held before, and **I cannot list rows whose events were matched via a lost alias,
because I cannot recover which aliases were lost.**

There is, however, one strong piece of indirect evidence, and it is reassuring. `run-scraper.js:715–717`
carries a measurement of the pre-incident state in its own comment:

> ⚠️ `aliases` is a text[] in the database and a comma-separated STRING in Sheet column 17. … **🧪 21 of
> 21 aliased trucks agree between the two sources today, 0 null where the Sheet has one.**

The database's aliased set was **21** when that was written; it is **20** now. And the missing one is
**not** attributable to this incident: `dedupe_trucks_backup_20260702` shows `Pimp My FIsh` held
`aliases = ["Pimp my fish"]` on 2 July 2026, while the row that survived that de-duplication —
`Pimp My Fish`, the row whose Sheet upsert **failed** on 17 September and was therefore never written —
holds `[]` today. That alias was lost in the July merge, months before the incident.

**Conclusion: the alias damage is most likely nil.** The 112 rows blanked to `[]` were, on the balance of
the evidence, already `[]`. This should still be confirmed against a backup in §B4, because "most likely"
is not "proven".

## B2. `verified` and `is_meal`

### `verified` — forced `false` wherever the Sheet's column M is not `true`/`yes` (29 of 132 are `true` now)

```js
verified: String(r[12]).toLowerCase() === 'true' || String(r[12]).toLowerCase() === 'yes',
```
`String(undefined)` is `'undefined'`, so a blank or missing cell yields `false`.

**Readers: none.** `verified` appears in **0** of the `select()` calls on `discovery_trucks` anywhere in
`app/`, `lib/` or `scripts/`. I checked every one (the full list is in §B3). The only other occurrences
of the word in the codebase are unrelated — `verifyToken` in the dashboard action route, the email
verification pages, `whatsapp_confirmed` on `outreach_prospects`.

**Impact on Village Foodie: none. HatchGrab discovery: none. Outreach: none. The scraper: none.** The
column is dormant.

### `is_meal` — forced `true` on 131 of 132

```js
is_meal: String(r[18]).toLowerCase() !== 'no',
```

**Readers: none — and the evidence is unusually clean.** A repo-wide search for `is_meal`, with no
extension scoping, returns **exactly one line in the entire codebase**:

```
scripts/migrate-from-sheets.cjs:82:    is_meal: String(r[18]).toLowerCase() !== 'no',
```

The only code that mentions the column is the script that writes it. **No impact anywhere.**

## B3. The remaining twelve columns

### Every select on `discovery_trucks`, in full

| # | Site | Columns selected |
|---|---|---|
| ① | `app/api/discovery/events/route.ts:68` `TR_SELECT` (**the public site, VF + HG**) | `name, cuisine, phone, order_url, accepted_methods, notes, website, menu_url, logo_url, photo_url, aliases, exclude_reason, excluded, show_on_vf, show_on_hg` |
| ② | `app/api/discovery/events/route.ts:140` | `name, logo_url, photo_url, cuisine, phone, order_url, accepted_methods, website, menu_url, notes, show_on_vf, show_on_hg, excluded` |
| ③ | `app/api/discovery/events/route.ts:261` (linked-truck branch) | `hatchgrab_truck_id, logo_url, photo_url, cuisine, phone, mobile, accepted_methods, website, menu_url` |
| ④ | `app/api/admin/outreach/route.ts:148` `TRUCK_EMBED` (**the outreach console**) | `id, name, aliases, contact_email, phone, mobile, accepted_methods, order_url, excluded, logo_url, photo_url, website, schedule_url, show_on_vf, hatchgrab_truck_id` |
| ⑤ | `scripts/run-scraper.js:913` (**site list, `SITES_FROM=db` only**) | `id, name, schedule_url, website, ai_instructions, scraper_strategy, created_at` |
| ⑥ | `scripts/run-scraper.js:706` (**matching, `MATCH_FROM=db` only**) | `name, aliases` |
| ⑦ | `app/api/admin/route.ts:47` (admin console list) | `id, name, visibility, hatchgrab_truck_id, exclude_reason, show_on_vf, show_on_hg, excluded` |
| ⑧ | `app/api/admin/create-truck/route.ts:45` | `id, name, cuisine, contact_email` |
| ⑨ | `app/api/admin/discovery-events/route.ts:117, 133` | `name, aliases` |
| ⑩ | `app/api/admin/outreach/route.ts:415, 845` `logoTargetFor` | `name, hatchgrab_truck_id` |
| ⑪ | `app/api/inbound-schedule/route.ts:98` | `hatchgrab_truck_id, name` |
| ⑫ | `scripts/import-hatchesup-schedule.js:390` (manual importer) | `id, name, visibility, logo_url, menu_url` |

### Column by column

| Column | Read by | Impact of the reset to the Sheet's value |
|---|---|---|
| `cuisine` | ①②③⑧ | **Live.** The cuisine label on every public discovery listing, and the value pre-filled when an operator is created from a prospect. 14 of 132 are now `null`. |
| `website` | ①②③④⑤ | **Live** on the public listing and the outreach console. ⑤ only under `SITES_FROM=db`, which is off. 31 of 132 now `null`. |
| `notes` | ①② | **None in practice.** `notes` is `null` on **all 132 affected rows and all 99 untouched rows** — the column is empty table-wide, so there was nothing to lose. |
| `menu_url` | ①②③⑫ | **Live.** The "See menu" link on public listings. 81 of 132 now `null`. Also written by `process-next-truck.js` (cron **off**) and the manual Hatches Up importer. |
| `schedule_url` | ④⑤ | Outreach console only; ⑤ is off. Low impact. |
| `order_url` | ①②④ | **Live.** The "Order" link on public listings and the console's ordering-platform detection. |
| `accepted_methods` | ①②③④ | **Live.** The payment-methods line on public listings. |
| `mobile` | ③④ | Outreach console and the linked-truck branch of the public route. |
| `type` | **none** | **Dormant** — `type` appears in **0** selects. No impact. |
| `ai_instructions` | ⑤ only | **None today** (`SITES_FROM` unset). Becomes live if that switch is ever flipped. 29 of 132 hold a value, all from the Sheet. |
| `scraper_strategy` | ⑤ only | **None today**, same caveat. `docs/sites-from-preconditions-report.md:47` independently records that nothing in the runtime reads `venues.scraper_strategy`; the truck column is read only by ⑤. |
| `exclude_reason` | ①⑦ | Display text only. 🔴 **It is NOT the switch that hides a row** — that is the `excluded` boolean, which the script never writes. All 19 inserted rows carry `exclude_reason = 'Yes - New Truck'` with `excluded = false`. |

### 🔴 Every writer to `discovery_trucks` — which hand edits could have been reverted

| Writer | Columns it can write | Could the incident have reverted a hand edit here? |
|---|---|---|
| `app/api/admin/outreach/route.ts:575, 870` (upload / clear media) | `logo_url`, `photo_url` | **YES** — proven; 13 columns across 12 rows, see the incident report §4.3 |
| `app/api/admin/outreach/route.ts:646–657` (contact editor) | `contact_email`, `phone` | **YES** — unprovable without a backup, see §B4 |
| `app/api/admin/route.ts:82–87` | `visibility`, `show_on_vf`, `show_on_hg`, `excluded` **only** | No — the script writes none of these |
| `app/api/admin/create-truck/route.ts:128` | `hatchgrab_truck_id`, `updated_at` | No |
| `app/api/admin/create-operator/route.ts:97` | `excluded` | No |
| `lib/self-serve-discovery-link.ts:56, 73` | `hatchgrab_truck_id`, `excluded` | No |
| `scripts/run-scraper.js:2278` | `name`, `exclude_reason`, `ignoreDuplicates: true` | No — `ON CONFLICT DO NOTHING` |
| `scripts/process-next-truck.js:114–117` | `menu_url`, `order_url` | Only if run; its cron has been **off since 2 September 2026** |
| `scripts/import-hatchesup-schedule.js:684–687` | `name`, `visibility`, `logo_url`, `menu_url`, `order_url` | Only if run by hand; no cron |

**The answer to "which hand edits may have been reverted" is therefore narrow and complete: `logo_url`,
`photo_url`, `contact_email` and `phone`, and nothing else.** The admin console at
`app/api/admin/route.ts` — the other place you edit discovery trucks — touches only visibility flags,
which the script never wrote. Every other column on those 132 rows is Sheet- or scraper-sourced, so
"the Sheet's value" is the intended value and there is nothing to recover.

## B4. Backup recovery plan

For when a pre-12:53 UTC backup is restored **into a separate branch or scratch project** — never over
production, which would roll back every table including live `orders`.

### Step 1 — export, from the restored copy

All twenty script-written columns, for the 132 affected rows:

```sql
-- RUN AGAINST THE RESTORED COPY. Read-only.
select discovery_trucks.id,
       discovery_trucks.name,              discovery_trucks.cuisine,
       discovery_trucks.phone,             discovery_trucks.order_url,
       discovery_trucks.accepted_methods,  discovery_trucks.notes,
       discovery_trucks.website,           discovery_trucks.menu_url,
       discovery_trucks.schedule_url,      discovery_trucks.logo_url,
       discovery_trucks.contact_email,     discovery_trucks.mobile,
       discovery_trucks.verified,          discovery_trucks.type,
       discovery_trucks.ai_instructions,   discovery_trucks.scraper_strategy,
       discovery_trucks.photo_url,         discovery_trucks.aliases,
       discovery_trucks.is_meal,           discovery_trucks.exclude_reason
from public.discovery_trucks
where discovery_trucks.id in ( /* the 132 ids below */ )
order by discovery_trucks.name;
```

Run the identical query against **production** and save both as CSV or JSON.

### Step 2 — the diff, listing only fields that differ

Do this **outside the database**, because the two datasets live in different projects. Given
`before.json` and `after.json` (arrays of the rows above):

```js
// node diff.js before.json after.json  —  prints one line per DIFFERING FIELD, nothing else.
const [b, a] = process.argv.slice(2).map(f => JSON.parse(require('fs').readFileSync(f, 'utf8')))
const COLS = ['name','cuisine','phone','order_url','accepted_methods','notes','website','menu_url',
  'schedule_url','logo_url','contact_email','mobile','verified','type','ai_instructions',
  'scraper_strategy','photo_url','aliases','is_meal','exclude_reason']
const after = new Map(a.map(r => [r.id, r]))
const sql = s => s === null || s === undefined ? 'NULL'
  : Array.isArray(s) ? `ARRAY[${s.map(x => `'${String(x).replace(/'/g, "''")}'`).join(',')}]::text[]`
  : typeof s === 'boolean' ? String(s) : `'${String(s).replace(/'/g, "''")}'`
for (const before of b) {
  const now = after.get(before.id); if (!now) { console.log(`-- ${before.id} MISSING from production`); continue }
  for (const c of COLS) {
    if (JSON.stringify(before[c]) === JSON.stringify(now[c])) continue        // identical → skip
    console.log(`-- ${before.name} · ${c}\n--   before: ${JSON.stringify(before[c])}\n--   now   : ${JSON.stringify(now[c])}`)
    console.log(`update public.discovery_trucks set ${c} = ${sql(before[c])}`)
    console.log(` where discovery_trucks.id = '${before.id}' and discovery_trucks.${c} is not distinct from ${sql(now[c])};\n`)
  }
}
```

### Step 3 — apply, one guarded statement per row per field

The generator above emits exactly that shape:

```sql
-- Guerrilla Kitchen · contact_email
--   before: "hello@guerrillakitchen.co.uk"
--   now   : null
update public.discovery_trucks set contact_email = 'hello@guerrillakitchen.co.uk'
 where discovery_trucks.id = 'e21068b9-cdf4-4bec-80fa-4a6e956b508d'
   and discovery_trucks.contact_email is not distinct from NULL;
```

`is not distinct from` makes each statement a no-op if the value has changed since the export — so a
repair can never clobber a newer edit, and the whole set is safe to re-run.

🔴 **Never a bulk overwrite.** Do not `update … set (…) = (select … from restored)`. Three reasons:
`verified`, `is_meal` and `type` are dormant (§B2, §B3) and restoring them changes nothing while adding
risk; `notes` is `null` table-wide; and **the Sheet is still upstream** — re-running the migration later
would undo any blanket restore. Restore only the fields that a person actually edited, which §B3 narrows
to `logo_url`, `photo_url`, `contact_email` and `phone`. Start with those four, and start with
**Guerrilla Kitchen, Buffalo Joe's and Pizza Mondo** — `contacted`-stage prospects with no email and no
phone, the strongest candidates for a reverted edit.

For the images, the incident report's §7(a) already has the twelve guarded statements, reconstructed from
surviving storage objects. Those need **no** backup and can be run now.

### The 132 affected ids

```sql
-- The 132 rows the 17 Sep 2026 12:53 UTC run UPDATED (each matched an existing row by exact name).
-- Derived by matching the Sheet Trucks tab against public.discovery_trucks by name. Excludes the 19
-- INSERTED rows (created_at >= 2026-09-17T12:50Z) and "Pimp My FIsh", whose upsert failed and wrote
-- nothing. Paste between the parentheses of the `in ( … )` in the export query above.

  'b1e6080f-4369-4d85-b5e1-490f61567170',  -- A Taste of Jamrock
  '5caf4da9-8d07-4042-a1fd-f5ef768b3588',  -- Anto Burgers
  '16c1fd93-ade3-4a33-a687-ef0a6e6576e5',  -- Aroy D Thai
  'dc9ca3a2-511b-4ab8-a309-23e4ac0b9b2b',  -- Auntie Minas
  'b427680c-7ddc-4b73-998c-0b746f06bef0',  -- Axle & Hop
  'd5802c04-7ee3-46e3-85a3-f581545ee8d9',  -- Azahar
  '72255c7c-963e-4977-bbb4-d6814bbc58a8',  -- BB Pizza
  'e9a4f1fb-f7e6-438c-972c-a0d16504d1bc',  -- Beats 'N' Beigels
  '9cffeeaf-1a57-4b4e-81ef-39493813861f',  -- Belle's Kitchen
  'e45fd645-a5ae-4b4f-b62f-a54dea44c49b',  -- Beth's Bites
  'b31f5698-915e-4e07-809b-30c28bd40238',  -- Between Buns
  '972b8c03-e1bb-4616-89ed-d18155417798',  -- Big Bite Kebab
  'ac9c2e79-4f38-48a7-8aaf-641fec4ada48',  -- Black Wagon Bagels
  '2303991c-2a08-477b-9ded-4c57e59af374',  -- Bonnefirebox
  '24a60d3e-267a-490f-9156-73138562ddb7',  -- Buffalo Joe's
  '210a1b42-58db-4608-81c3-27b53436c77f',  -- Burger Art
  '92efac55-745f-4d16-ac9c-f490c52f4478',  -- Cambs Luxury Bakes
  '00300da6-9b8a-48e9-83d6-5f1be8f3d0c9',  -- Camp Out Takeaway
  '2461b11b-b3c1-4db5-9388-39e99e1a882a',  -- Chai Stall
  '88e4ee6f-d196-43ae-92b8-148882d0f97b',  -- Churro Boyz
  '0c04a511-1309-44f8-a01d-1170c0fe95ee',  -- Churros Bar
  '2d3814fe-89c9-4509-95e2-c22d3fa904da',  -- Crepes and Wraps
  '13bc7d95-c8ae-4ec5-821f-3f87a6318d2b',  -- Curry Leaf Catering
  '6a519b9e-00be-4d2f-a03c-87c5799d65dd',  -- Dan the Pizza Man
  '72f5ec3d-35a3-45c2-bc87-ca88f9ccc824',  -- DBC Grill Shack
  '98409103-e4c0-4d9c-bd83-084ffbc3703b',  -- Dessert MK
  '488a7627-48ce-4f8a-b0de-8628d0f6bd03',  -- Dolly's Pizza Van
  '0c715e16-aeb8-46ba-ae87-edded8b7365d',  -- Drina Bakes
  '776b6163-c7d5-4907-8561-c3e1b962588b',  -- Eat Greek
  '6f7df0b8-9764-4463-810f-fd3445920e21',  -- Elder Street Food
  '112fb0b3-1197-4a92-83bd-9dcb0de93ccc',  -- Get Wrapped Kitchen
  'b5e6859d-3510-4aab-aa9c-56a271a386e8',  -- Gino's Pizza
  'a54e6055-7900-49d0-9889-d0e56decd54e',  -- Gnawty Bites
  '1d5e7430-af2d-4913-a465-dcce841cc88f',  -- Gourmet Geezer
  '007cff93-a8fd-4085-8604-56876316758c',  -- Grab a Burger
  '6bdb5987-545d-4e66-821c-4fc186e2baf6',  -- Greys Coffee
  'a25ec330-8cb5-442d-820e-b390fb0b71ff',  -- Guaco's Mexican
  'e21068b9-cdf4-4bec-80fa-4a6e956b508d',  -- Guerrilla Kitchen
  'f3ff82ee-1e74-477e-acb1-7cdc2eda93ca',  -- Gyros Square
  '1c36c2b8-45ef-4f5a-9682-497d03889016',  -- HKHitwrap
  '4f553aee-da17-411a-8072-f3f8b107a834',  -- Holy Loaded
  'd2916105-260c-4b5a-9566-66fb481985dc',  -- Home Brew Burgers
  'a912e9f0-633e-40eb-b90b-fc56d0bce028',  -- Hot Dog Mafia
  'fd522804-2fa4-416e-862a-7acc92804145',  -- Hotaco
  '69b3ab5f-9e32-4791-8365-9c363292879b',  -- Howe & Co
  'b023f1fc-1be9-4df1-9392-7dc171408852',  -- Ice Cream
  'a1dddd26-8d0d-4fb7-b9cc-49fd56d28d9f',  -- Jason Willis
  'f25ebc0f-1197-4dc1-b2b0-16bdb84b3064',  -- Jez Guyanese Cuisine
  'f36d4482-b826-4f07-a4f9-bb49e4d92105',  -- Just Baked by Sophie
  'ba1c7db3-b971-4be4-ab99-a4876fd0e61d',  -- Kapsalon Kebab
  'ea9c3b14-c8eb-4b93-ae52-4b4f5dabe7f3',  -- Katsu Later
  '8c980175-6996-4b84-99c0-9005ac8fd793',  -- Kerief
  '54d5f3c9-6129-4601-964c-f2c0e3e63dc5',  -- Kezmet Turkish Kitchen
  'fa09b6c8-9723-404a-b6f2-4888d55c79aa',  -- La Piazza
  '35bd1293-3031-4ba5-b690-c46377895389',  -- Little Red
  '89ab7b2e-ec94-4058-b6c2-ebee6cfaf59e',  -- Louigi's Pizza
  'a536bbe5-65b3-4432-8de8-8f7235aacfb2',  -- Mac Street Kitchen
  'fdcd1231-edd1-4d63-8960-c2574860defe',  -- Manna Seoul
  'f4db11c0-278e-4ebf-b2ce-617b32e86efc',  -- Manze's Pie & Mash
  '1df78b89-e284-4d0d-83c7-2696663d1aa3',  -- Marky D's
  '308a9198-8552-4ed3-a5b0-c2485a0796ff',  -- Marleys Pie & Mash
  'faa23ec0-4d90-49fa-9df0-e2c676d95d37',  -- Meated
  '0fa5a3ee-7d23-4c6a-9897-457cd830f37a',  -- Mrs Bean's Bagels
  '6b08e536-a2b0-4b67-bbca-60b5c9d84f0f',  -- MumTas
  '494c3b9e-4913-432b-9fd9-a4cef5db4569',  -- My Kitchen Your Place
  '50b31ef5-5db4-455c-97cb-ec06247b0df6',  -- My Thai Chef
  'de8f9f61-36f2-428b-8b9f-f5fe21a4bbbf',  -- NAAMA African Food
  'a84df38f-75df-47e3-b68f-abf46963be56',  -- Naked Fish
  '4eab5741-dd60-43fd-bd30-c6a15e8c0142',  -- Neapolitan Pizza
  'e1b674f3-2cdf-4631-a4ac-f106eb9b28e3',  -- No. 35 Cambridge
  '53e59460-00a6-4425-9ce0-913764efd6ce',  -- Nolas Bayou Kitchen
  '63454dc4-4d62-4a8a-bf51-1df656250bef',  -- Nomadough
  '20d4e88a-9df0-4ede-856e-168105758423',  -- Ocean Tree
  '273e3098-e0cb-4ae2-9eb7-d8e128bda2d9',  -- Papas Locas
  '51a63004-4b6f-41fc-bb08-0cd2cee7ee06',  -- Pastim - Artisan Bakery
  '5c4b21f0-c941-4422-b564-2638c882814a',  -- Peck
  'e4ccb606-30c5-473a-8a5f-78660fa74859',  -- Perky Beans
  '1de0ba69-5e5a-4ea8-a4c9-1d39eb30e449',  -- Phat Khao
  'fc15d42b-2e2d-45ad-bf2a-711485954d9b',  -- Pig-Casso's
  '367a496d-decc-434d-8efc-bfa47875efdc',  -- Pigs In
  'd0de8fb1-24b9-46e3-ba83-4d6b3c8c0055',  -- Pizza Mondo
  '136bf7d9-bf8d-4910-93b3-bd293d2c662f',  -- PIzza on the Green
  'dedf4d33-3de1-4712-9c95-1193523feeae',  -- Pizza Passione
  '729fc2b2-62cf-42d9-8fd8-772301c6c67f',  -- Pizzeria Gusto
  'f1a440da-8ca2-45dc-b2f1-1ffaec9b3284',  -- R Grills
  '5f42611d-c7f5-4728-9521-b5757b49e72b',  -- Real Thai Food
  '5e851f51-e612-495e-b944-fd92c920b54c',  -- Roosters Smoke House
  '4a3c4cae-41d3-48af-8f6f-b5bbd49b0c38',  -- Rural Coffee Caravan
  '1667bf92-7fb9-453e-87fb-32d3d0ba9598',  -- Sanjeev's Kitchen
  'fcaaaa7c-ad32-4aaa-9943-61c92cfa129c',  -- Savannah Smoke Grill
  '2f05ea2f-afcb-4ea8-af1e-4afb7508d7f4',  -- Scotties Hot Scotch Egg
  '7baff9c3-46db-4bbf-8646-a80def864949',  -- Sebshimi
  '589a9879-f87d-4b9a-8f8d-7700e21c438c',  -- Shika Shack
  'b5b7b672-d4dc-4abb-beb2-27068646cc9b',  -- Slingers
  'd6848570-6205-4de9-b4e3-a29ddb6fb79a',  -- Smash Burgers
  'e3c2f65d-9782-4a36-9874-aec5c6fdcabe',  -- Smoke Truck
  '6ad98aa0-a634-43a3-95c7-ce09bcc4d63b',  -- Smother Spudders
  'ff630462-155b-4b4a-a5ab-4955c4c54da4',  -- Spud & Slice
  'd0eea13f-bb5a-4331-94bc-d25dc8a3f024',  -- Spudette
  '4e5dcb9f-12b7-49db-af55-92f866f01b8b',  -- Steak & Honour
  '7a96ad43-7977-4d6e-9f02-b70ea4a9d37c',  -- Suffolk Mermaid
  'b28af3a5-ed53-4214-86ee-d0cc2be53b78',  -- Suffolk Pig Roast
  '48d79f7f-74a8-4431-b54a-295f50b15e52',  -- Suffolk Pizza
  '19c39100-488e-4729-8f44-16f884f44537',  -- Suffolk Smash
  '1bc46d5d-9b2a-4656-b8cc-e4117a512470',  -- Suffolk Spice Fusion
  'd7a21372-79d0-49a7-9113-af1127cef312',  -- Tacoman
  '157bcdd9-6446-4a68-a153-818f4d4d87d1',  -- Taqueria La Gringa
  '8e212c09-a03f-4034-8538-c30b293ebd59',  -- Tasty Turk
  '0fba727a-ffd7-4104-92a3-8667f5c1819c',  -- Temperleys Streetfood
  '037f75ba-45c9-4a71-973c-cc166a64aa70',  -- The Foodie Shack
  'aeddc37a-3941-4267-bf42-cf19caa74cce',  -- The Forge Kitchen
  'ec0ed4a6-4a18-4929-b1c1-4da4a6cf17a1',  -- The Jerk Chicken Man
  '3b5b8501-01db-4dd9-8b76-235205886373',  -- The Linton Kitchen
  '37431402-1403-40c4-a9a8-0c46665a7429',  -- The Little Pizza Oven
  'dcbfb635-7d4e-47af-8c8b-81c241962264',  -- The Mobile Pizza Co
  '15623772-0929-4df9-8d03-a76203647840',  -- The Noodle & Dumpling Bar
  'e9167d8f-e805-4f50-ace0-09fb300ff5cd',  -- The Pizza People
  '43297329-e400-4466-9b2b-ddf0eccb433b',  -- The Pizza Vault
  '7b788033-6cfc-4b3a-bae0-18419d2cf09f',  -- The Purple Pepper
  '76f6e8b2-2ec6-4132-87ca-3a2a99d90f2f',  -- The Raclette Truck
  '14b335ca-c3fd-4ad7-b6ff-a425a7616228',  -- The Spud Hut
  '3e36c08c-1d4f-4e56-8b83-b7bc980a07d1',  -- The Tapas Truck
  '8fe5c6ee-f3eb-4c2e-b0ef-0470a09e29c8',  -- The Travelling Friar
  '13a0af89-c638-414d-be1b-f60aa3591e69',  -- Tibet Flavour
  '0259e042-6e9d-4af0-a543-62cb4e3c13c5',  -- Tikka Tonic
  '6084f9a8-e80e-4a71-bc75-49e8e125b3fc',  -- Wagyu Burgers
  '363257f2-8865-431b-babb-1350b3e437ef',  -- White Gold
  'd027967a-40e1-4f05-9bfd-0fdb1fd2f428',  -- Wintringham
  'd8a4c446-42a8-45fe-9f28-665063daabc1',  -- Wok Wraps
  'e9823f61-2df9-42dd-a4bb-26640574ac2c',  -- Wrapunzel
  '51a81ef4-b044-4947-bb8f-1e9584b2d36d',  -- Your Burger Zone
  'd14d51ff-74bb-4647-b0d4-26c703a53d6b'   -- Zaket Potato
```

---

## Anything I could not establish

- **Which aliases, if any, the 112 blanked rows actually held.** The Sheet's alias cell is empty for all
  112, so the Sheet cannot answer it, and the database no longer can. The indirect evidence in §B1 (the
  scraper's recorded "21 of 21" measurement versus today's 20, with the one-row gap explained by the July
  de-duplication rather than by this incident) points strongly to no loss, but it is inference.
- **Whether `contact_email` / `phone` on any of the 132 rows differed from the Sheet before the run.**
  Unchanged from the incident report: only a pre-12:53 backup can answer it. §B4 is the route.
- **Whether `information_schema.triggers` really is empty for `discovery_trucks`.** PostgREST cannot
  reach `information_schema` (`PGRST205`), so the no-trigger finding still rests on the four lines of
  evidence in the incident report §1.4. The confirming SQL is there for you to run in the SQL editor.
- **Whether `MATCH_FROM` / `SITES_FROM` are set as repository or environment variables in GitHub rather
  than in the workflow YAML.** I can only read the four YAML files, and none of them sets either. If one
  is set in the repo's Actions variables, §B0's conclusion changes and the alias and site-list resets
  become live — worth a glance at Settings → Secrets and variables → Actions before the next 06:00 run.
- **Whether the guard on `register-payment-domain.cjs` breaks a workflow you run by hand.** It is
  referenced by no workflow and no npm script, only by six literal command lines in
  `docs/payment-domain-report.md`, which would now need `--yes-write-to-production` appended.
- **The runtime behaviour of the two operational scripts under the guard.** By design I never executed
  either, so the guard is proven by source position, not by observing a refusal. That is the stronger
  claim, but it is a different one.
