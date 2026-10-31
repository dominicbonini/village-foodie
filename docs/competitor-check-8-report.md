# competitor-check-8 — fixing the 31 Oct scheduled run (31 October 2026)

Nothing is deployed, pushed or committed. No SQL was run, read-only included. Every query below is **NOT RUN**. The checker still logs in only with Workload Identity Federation: `ANTHROPIC_API_KEY` appears nowhere, and `main.ts` still refuses to start if it is set.

> ⚠️ **Flag: a span of the brief did not arrive.** The line "BATCH ERROR FROM THE CONSOLE (Dominic pastes, or "not available"): PASTE" still held the placeholder `PASTE`, not an error. I treated it as "not available" and followed the brief's branch for that case. If you have the console error, send it: it will confirm or correct §1.

---

## 1 · The quick pass: why every batch item failed

**The most likely cause: the batch collected on 31 Oct was the one submitted on 30 Oct with the old, refused schema.** It was not a new fault. Confidence: **high (about 85%)**, but not proven, because the per-item messages were never printed (now fixed) and no SQL was run.

The evidence:
- `docs/competitor-check-4-report.md` §3 recorded that the 30 Oct 08:33 run submitted batch **`msgbatch_01Jb6Zv1SGfDfDEsQPh49oqp`** with **40 items**. Its `record_findings` schema had 17 union parameters, against the API's limit of 16, so every item is refused with `400 invalid_request_error`. That report predicted the first run after the fix would:
  - collect it, with all 40 items errored, at $0;
  - end the pass with `error`, a red cross;
  - submit the next share with the fixed schema;
  - still let the deep and routine shares run.
- The 31 Oct log matches that exactly: "pass: 0 checked, **40 failed**, 0 findings, **$0.000** — error (Every item of the batch failed (40).)", then "deep: …" and "routine: …" still ran, then exit 1.
- The 31 Oct 02:10 run used `c7242ad8`, which is origin/main and contains the competitor-check-4, -5 and -7 fixes. The scheduled job only touches the pass in modes `pass` and `scheduled`. Nothing in the reports suggests that either mode ran between the 30 Oct fix and 02:10, so the 30 Oct batch was still waiting to be collected.

**I also checked today's batch request against the current docs, and it is valid:**
- **Batch processing page:** parameters a batch refuses are `stream: true`, `speed`, `fallbacks` and `max_tokens: 0`. The pass sends none of these (`passParams`: `model`, `max_tokens`, `system`, `messages`, `tools`, `output_config`), and the refusal fallback is already left out for Haiku.
- **Server tools:** "Tool use, including all server tools (web search, web fetch …)" can be batched. No beta header is needed.
- `custom_id` must be 1–64 characters of letters, digits, `-` and `_`; `customIdOf` gives `<uuid>_DE` / `<uuid>_class`, sliced to 64.
- `max_tokens` 128,000 is the "Max output" of Claude Haiku 5.5 (128K). A batch only requires at least 1.
- `effort: 'low'`: Haiku 5.5 takes `effort` from `low` to `max`.
- **Web fetch tool page:** `claude-haiku-5-5` is in `supportedModels`. `web_fetch_20260318` (dynamic filtering) is "available with Claude 4.6 and later models", and "You can include the web fetch tool in the Messages Batches API". `max_content_tokens` and `allowed_domains` are documented parameters.
- The strict schema is now 2 unions, after competitor-check-4. Harness section 18 guards it at ≤ 12 for every tool the checker sends.
- I checked one more Haiku 5.5 rule because the pass continues a batch answer with ordinary synchronous calls: a thinking block is only valid while everything sent before it is unchanged. The continuation sends the same system, tools and messages, with the batch answer's content passed back unmodified, so the rule is met.

**So nothing in the request needed changing.** What is fixed is the blindness:
- **Every collected batch now logs its failed items:** a header ("Quick pass: batch <id> (collected) — N of M items failed:"), the **first 5 in full** (competitor · country: error type — message), then "… and K more · by error type: invalid_request_error × 38, overloaded_error × 2".
- **The 31 Oct batch will be re-read.** Results stay readable for 29 days. Once `20261053` has run, the next pass run (modes `pass` and `scheduled`):
  - lists the workspace's batches;
  - finds every ended batch from the last 29 days with failed items that it has not yet logged;
  - reads its results and logs them the same way, labelled "(re-read — collected earlier, $0, nothing written)";
  - records the id in `pass_batches_reread`, so it is read **once**.

  It **writes and charges nothing**: no run row, no finding, no `pass_state`, no cost. An errored item is never billed, and a succeeded item was already handled when the batch was collected. Before the migration, it logs one line ("…not re-read until 20261053 runs") and waits. A batch collected by the new code is added to that list straight away, so it is not re-read.
- **What confirms or disproves the cause:** the re-read lines, or query R1 below, which reads the run's `notes` (competitor-check-4 already stored each item's message there). If the messages mention "17 parameters with type arrays or anyOf … limit: 16", that is the cause. If they say something else, that message is the cause, and the new logging will name it.

## 2 · Timeouts: 1800 s, a setting, findings kept, the next run does only the rest

**What was wrong.** The 600 s limit was a promise race. At 600 s the race rejected, but the check kept running unseen:
- every finding it had was thrown away;
- the "closed" meter then made each queued verification fail one by one (§3).

**Now the limit is a deadline the check keeps itself** (`lib/competitor-check/checker.ts`):
- **The limit is `competitor_check_settings.deep_time_limit_seconds`,** 1800 by default, allowed range 60–3600. It is read tolerantly: 1800 until `20261053` runs. Routine checks stay at 300 s.
- **No API call starts after the deadline.** A call still running 3 minutes after it is aborted through the SDK's `signal`, and that counts as running out of time.
- **A deep check that runs out of time keeps the findings of every group it finished.**
  - A features group counts as finished when every one of its keys has a finding.
  - The prices-and-terms group counts as finished once the model has moved on to a features group. Groups are recorded in order.
  - The unfinished group's findings are not written, because the next run asks for that group again. That way nothing is recorded twice.
  - The check is **INCOMPLETE**, the same as the malformed case: "ran out of time after 2 of 5 groups — 41 finding(s) from the finished groups kept, 3 from the unfinished group left; the next run asks only for the rest".
- **The groups it finished are saved** in `competitors.deep_progress`, per country (for example `{"DE": {requestedAt, at, pricesDone, keys}}`). This is a scheduling column the checker may write.
- **The next run resumes:**
  - its message starts "RESUMED CHECK: … Record ONLY the groups below";
  - it lists only the missing features, and no prices-and-terms group once that is done;
  - a repeated price or done feature is dropped.

  When the check completes, the saved progress is cleared and the check is stamped as usual. Progress only applies to the same deep request (`deep_requested_at`) and for 14 days. Before the migration the findings are still kept, but the next run re-checks every group.

**The job's own time.** The checker now gets `--job-minutes 330`, and the workflow's `timeout-minutes` goes from 240 to **350** (GitHub-hosted runners stop at 360).
- No check starts with under 10 minutes of the job left. The run stops with the new reason `time_up` ("time up" in Admin), and the rest is picked up the next night.
- Every check's deadline is also capped at 5 minutes before the job ends.

So Actions never kills a check mid-way. Before, that would have lost its findings and left its run row unfinished.

**Do the job time and the caps fit a full deep country? The sums, on the default settings.** `deep_per_day` 15, daily cap $8, monthly cap $90. Your live values are not read; query R2 shows them.

| | Sum | Fits? |
|---|---|---|
| Deep share, worst case: 15 checks × (30 min + 3 min abort grace) | **495 min** | **No.** The job has 330 min, so at most **about 9** checks that each run the full limit per night. The guard stops cleanly; the rest go the next night. |
| Same at the old limit: 15 × 10 min | 150 min | Yes, which is why 240 was enough before |
| Typical night, 31 Oct shape: 7 checks finished, 2 incomplete, 6 timeouts | 6 timeouts × 30 min = 180 min + the rest | Yes, in 330 |
| Spend, worst case: a check that runs 30 min ≈ 3 × the $0.21 that Bestelltheke cost in 10 min ≈ $0.63; 9 × $0.63 + pass batch reserve 40 × $0.045 = $1.80 + routine ≈ $0.40 | **≈ $7.9 a night** | Just under the **$8** daily cap. The guard checks 1.5 × the run's average before each competitor, so it stops rather than overruns. |
| Spend, a month of worst-case nights: about 30 × $7.9 | **≈ $237** | **No:** the **$90** monthly cap would stop the deep check part-way through a month |
| Spend, typical: 31 Oct deep $1.86 + pass about $1.20 | ≈ $3 a night, ≈ $90 a month | At the cap |

How many competitors a full DE deep check covers is not known without SQL (R3). The data files hold 9 (compare-de-1) + 6 (global players), and discovered candidates come on top. At 15 a night and about 9 at the worst case, a 40-competitor country takes **3–5 nights**.

**Your choices (none blocking):**
- leave the caps as they are: they stop spending safely, and the deep check simply takes longer;
- raise `monthly_cap_usd` (Admin › Pricing check › Automatic checks);
- or lower `deep_time_limit_seconds` to about 1200.

## 3 · Verifier noise

Once a check is past its deadline, or its call was aborted, no verification starts. Each one not reached stays `not_run`, and **one** line is printed:

```
  Bestelltheke: 33 verifications skipped (out of time)
```

If time runs out part-way through the verifications, those already done keep their verdict and the rest are counted in the same line. A verifier that fails for another reason is still logged on its own line, as before.

## 4 · Stray `feature_key`: validated per finding, not per call

`validateRecordFindings` (`lib/competitor-check/model.ts`):
- **Stray fields are dropped, not the call.** A field that belongs to another kind of finding (`KIND_FIELDS`: `feature_key` and `feature` belong to field `feature`; `classification` to field or outcome `classification`) is set to null and counted. So is an unknown property on a finding or on the call, and an unreadable `pages_read`, `notes` or `more`. The finding stays.
- **A missing property reads as null.**
- **Only unusable findings are left out.** Examples: no valid field or outcome, a quoted outcome without its quote and URL, a feature finding without its key. The reason is kept, and the rest of the call is kept too.
- **A call is still rejected and sent back once** only when it has no usable shape (not an object, no findings array, more than 200 findings) or when **every** finding in it is unusable.
- **The log line counts what was ignored:** "  Clover · DE: 52 finding(s), 2 stray fields ignored, 1 unusable finding left out (findings[7]: …) · $0.143". The quick pass logs the same counts.

**Clover · DE and Lightspeed · DE:** an incomplete check is never stamped, so both are still pending for DE. The deep list takes pending competitors by name ("Check now" requests first), so both should be in the next deep share. To be certain, run the optional update U1 below, which puts them first.

## 5 · Exit code

A run now ends `error`, and the job exits 1, **only when a stage fails as a whole**:
- a failed login;
- a collected batch whose every item failed;
- every competitor of a run failing outright.

**A timed-out or incomplete check never does.** These are now marked `kind: 'incomplete'` and listed in the run's notes and the email. A run made only of timeouts ends `done`, exit 0. A `time_up` stop is exit 0. A night where the pass batch failed as a whole still exits 1, and the deep and routine shares still run.

---

## Files changed

- `lib/competitor-check/model.ts`: per-finding validation (`KIND_FIELDS`, `findingErrors`); `Ignored`, `addIgnored`; `mergeRecorded` sums it.
- `lib/competitor-check/checker.ts`:
  - deadlines in place of the promise race (`Meter.deadline` and `abort`, `OutOfTimeError`, `outOfTime`);
  - `DEFAULT_DEEP_TIME_LIMIT_S` 1800, `MIN_CHECK_MS`, `JOB_MARGIN_MS`, `ABORT_GRACE_MS`;
  - `finishedGroups`, `progressFor`, `DeepProgress`, and the resume in `checkCompetitor`;
  - the one-line verifier skip;
  - `FailedCheck.kind`, `allFailedOutright`, `time_up`, the job guard in `runOne`;
  - `deep_progress` in `SCHEDULE_COLUMNS`; `setPassReread` on the store interface.
- `lib/competitor-check/prompts.ts`: `groupKeys`, `TERMS_KEYS`, `findingGroups(…, { skipPrices })`, and the "RESUMED CHECK" message.
- `lib/competitor-check/pass.ts`: `itemError`, `logBatchFailures` (first 5 plus counts), `rereadFailedBatches`, `BatchApi.list`, kinds, and the ignored counts in the item line.
- `lib/competitor-check/store-supabase.ts`:
  - reads `deep_time_limit_seconds`, `pass_batches_reread` and `deep_progress`, all tolerantly;
  - `setPassReread`;
  - `setSchedule` drops `deep_progress` while its column is missing;
  - `updateRun` records `time_up` as `done` while the old constraint stands.
- `scripts/competitor-check/main.ts`: the abort signal passed to `messages.stream`, `batches.list`, and `--job-minutes`.
- `.github/workflows/competitor-check.yml`: `timeout-minutes: 350`, `--job-minutes 330`.
- `supabase/migrations/20261053_competitor_check_8.sql`: **NEW, NOT RUN.**
- `scripts/competitor-check-8.cjs`: **NEW** harness, registered.
- `scripts/competitor-check-1.cjs`: three checks **⚠️ RE-PINNED (competitor-check-8)**:
  - a call is rejected only when every finding is unusable;
  - a stray `feature_key` is dropped, not the call;
  - an incomplete check is not a red cross.
- `scripts/_competitor-check-1-fixtures.cjs`: the memory store maps `deep_progress`.
- `scripts/harnesses.json`: `competitor-check-8.cjs` added.

## Proof

- `npx tsc --noEmit -p .`: **clean.** `scripts/competitor-check/main.ts` bundles with esbuild, as `run.mjs` does.
- `node scripts/competitor-check-8.cjs`: **✅ 51 passed, 0 failed.** Fixture responses only: no network, no database, no API.

  | Section | What it proves |
  |---|---|
  | 1 · batch | A failed batch item with an error body is logged: header, 5 in full, "… and 2 more · by error type: invalid_request_error × 5, overloaded_error × 2". The run ends `error`, exit 1, $0. The batch is recorded as logged. An old failed batch is re-read once, within 29 days only, writing and charging nothing. Before the migration, one line. |
  | 2 · timeout mid-groups | 3 calls at 700 s each, then the deadline. The price, term and f0–f11 are kept and f12 is not. INCOMPLETE with the exact message, stopped_reason `done`, exit 0, not stamped. Progress is saved. The next run resumes with only "Features: f12, f13", writes nothing twice, completes, and clears the progress. The job time caps the deadline, and `time_up` stops the next competitor. Each call carries the abort signal; an aborted call counts as out of time. |
  | 3 · verifier | Out of time: no verification starts, all `not_run`, one line "…: 14 verifications skipped (out of time)", no "verifier failed" line. Part-way: 4 run, then "…: 12 verifications skipped (out of time)". |
  | 4 · stray fields | Stray `feature_key`, `feature` and `classification` are dropped and counted (5), one unusable finding is left out with its reason, and the call is kept. A real check with a stray `feature_key` completes in one call and logs "1 stray field ignored". An all-unusable call is still rejected. |
  | 5 · exit codes | All outright failures: exit 1. All timeouts: exit 0. Mixed: not "all failed". Batch error plus deep timeouts: exit 1. |
  | 6 · settings and files | The settings, store tolerance, workflow, `main.ts` and migration. |

- **Existing competitor-check harnesses:**

  | Harness | Result |
  |---|---|
  | `competitor-check-1` | **227/0** (the 3 re-pins above) |
  | `compare-de-1` | 93/0 |
  | `pricing-check-1` | 82/0 |

  `competitor-check-1-screens` needs a browser and was not run; nothing it renders changed.

---

## NOT RUN SQL

### M1 · `supabase/migrations/20261053_competitor_check_8.sql` (optional: the checker works without it, as described above)

```sql
begin;
alter table public.competitor_check_settings
  add column if not exists deep_time_limit_seconds integer not null default 1800,
  add column if not exists pass_batches_reread     jsonb   not null default '[]'::jsonb;
alter table public.competitor_check_settings drop constraint if exists competitor_check_settings_deep_time_limit_chk;
alter table public.competitor_check_settings add constraint competitor_check_settings_deep_time_limit_chk
  check (deep_time_limit_seconds between 60 and 3600);
alter table public.competitors add column if not exists deep_progress jsonb not null default '{}'::jsonb;
alter table public.competitor_check_runs drop constraint if exists competitor_check_runs_stopped_reason_check;
alter table public.competitor_check_runs add constraint competitor_check_runs_stopped_reason_check
  check (stopped_reason in ('done', 'daily_cap', 'monthly_cap', 'paused', 'error', 'time_up'));
commit;
```

### Read-only (NOT RUN): to confirm §1 and the sums

```sql
-- R1 · the 31 Oct runs, with each failed item's message (competitor-check-4 stores them in notes)
select id, mode, trigger, started_at, finished_at, stopped_reason, competitors_checked, cost_usd, left(notes, 3000) as notes
from public.competitor_check_runs
where started_at >= '2026-10-30' and started_at < '2026-11-01'
order by started_at;
```
```sql
-- R2 · the batch in flight and the settings the sums depend on
select pass_requested_at, pass_per_day, pass_batch->>'id' as batch_in_flight, pass_batch->>'submittedAt' as submitted_at,
       deep_country, deep_per_day, daily_cap_usd, monthly_cap_usd
from public.competitor_check_settings;
```
```sql
-- R3 · roughly how many competitors a DE deep check covers (those with a current DE plan), and this month's spend
select (select count(distinct c.id) from public.competitors c join public.competitor_plans p on p.competitor_id = c.id
        where c.lifecycle in ('active', 'candidate') and p.country_code = 'DE' and p.superseded_at is null) as de_competitors,
       (select coalesce(sum(cost_usd), 0) from public.competitor_check_runs where started_at >= date_trunc('month', now())) as month_usd;
```

### U1 · optional: put Clover and Lightspeed first in the next deep share (check the names with a select first)

```sql
update public.competitors set check_requested_at = now()
where name in ('Clover', 'Lightspeed') and lifecycle in ('active', 'candidate');
```

---

## Your steps

1. Optionally run R1, R2 and R3 (read-only).
2. Run M1 (optional, but needed for resume, the batch re-read and the `time_up` label).
3. Commit and push this branch to `main`. A scheduled or manual run uses the code on the branch you pick, and the timer only uses the default branch.
4. Optionally run U1.
5. Trigger one manual run (below), then review Admin › Pricing check › Automatic checks.

### One manual run from GitHub Actions (Safari)

1. Open the repository on github.com and click **Actions**.
2. In the left list, click **Competitor check**.
3. Click **Run workflow** (top right of the runs list).
4. Set **Use workflow from:** to `main`, **mode** to `scheduled` (what the timer runs: the quick pass, the deep share, then the routine share), leave **competitor** and **limit** blank, and set **dry_run** to `false`.
5. Click the green **Run workflow**, refresh, open the new run, then **check** › **Check competitors**.

### What the log should look like if it worked

```
competitor-check · mode scheduled · 330 min
Quick pass: batch msgbatch_01Jb6Zv1SGfDfDEsQPh49oqp (re-read — collected earlier, $0, nothing written) — 40 of 40 items failed:
  <competitor> · DE: invalid_request_error — … 17 parameters with type arrays or anyOf … limit: 16 …
  … (4 more lines like it)
  … and 35 more · by error type: invalid_request_error × 40
  <competitor> · DE: 12 finding(s) · $0.0041            ← the batch submitted on 31 Oct, collected (if it ended)
Quick pass: submitted batch msgbatch_… — 40 checks, estimated $1.80 (collected next run).
  Clover · DE: 52 finding(s), 2 stray fields ignored · $0.143
  Bestelltheke · DE: INCOMPLETE — ran out of time after 3 of 5 groups — 38 finding(s) from the finished groups kept, 4 from the unfinished group left; the next run asks only for the rest; 38 finding(s) · $0.611
  Bestelltheke: 33 verifications skipped (out of time)
pass: 40 checked, 0 failed, … — done
deep: 13 checked, 2 failed, … — done
routine: 4 checked, 0 failed, … — done
```

Notes on reading it:
- The **re-read lines appear only after M1**. Their messages confirm the cause, or name the real one.
- **A timeout is one INCOMPLETE line plus one "verifications skipped" line**, never 30.
- On the **following** run, a timed-out competitor shows "… · DE: resuming — prices and terms and 24 feature(s) already recorded".
- **The job should end with a green tick** unless the collected batch failed as a whole. In that case the five messages say why.

---

## Undo (only if Dominic asks)

```sql
begin;
alter table public.competitor_check_runs drop constraint if exists competitor_check_runs_stopped_reason_check;
update public.competitor_check_runs set stopped_reason = 'done' where stopped_reason = 'time_up';
alter table public.competitor_check_runs add constraint competitor_check_runs_stopped_reason_check
  check (stopped_reason in ('done', 'daily_cap', 'monthly_cap', 'paused', 'error'));
alter table public.competitors drop column if exists deep_progress;
alter table public.competitor_check_settings drop constraint if exists competitor_check_settings_deep_time_limit_chk;
alter table public.competitor_check_settings drop column if exists deep_time_limit_seconds, drop column if exists pass_batches_reread;
commit;
```

For the code: `git checkout -- <files above>`, then delete `scripts/competitor-check-8.cjs` and the migration file.
