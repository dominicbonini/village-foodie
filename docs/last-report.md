# Last report — Scraper: disable the day-of-week learner + make failures visible

**Date:** 2026-07-27 · **File touched:** `scripts/run-scraper.js` **only**
**Verification:** `node --check scripts/run-scraper.js` → clean. No `next dev`, no `next build`.

This report **overwrites** the previous one (the scheduling diagnostic of 2026-07-27).

🔴 **Blast radius, stated first.**

| Change | Effect on a truck that is currently working |
|---|---|
| **1. Learner disabled** | **YES — this changes behaviour for gusto.** It moves from ~3 scrapes/week to ~7. That is the fix, not a side effect: more scraping, never less, so nothing that works today can stop working. The costs are runner minutes and a little Gemini spend (§1). |
| **2a. `main().catch` → exit 1** | No change to a healthy run. A run that already crashed now goes red instead of silently green. |
| **2b. Secret guard / query error throw** | No change to a healthy run — both paths are only reachable when the run was already doing nothing. |
| **2c. Per-truck crash logged** | Only affects a truck that throws. **One real behaviour change: a crashing truck's due-clock now resets** (§2c). |
| **2d. `anyDue` no-op** | Log text only. Still exits 0. |

Nothing in this diff touches the Gemini prompt, extraction, the rule-detection/retry logic from the
previous diff, the workflow file, or anything outside `scripts/run-scraper.js`.

---

## 0. Prompt garbles — flagged, not silently fixed

| Item | As received | Read as |
|---|---|---|
| 1 | "a behaviour switch, **neletion**" | "**not a deletion**" |
| 2c | "If **writto** the log is what failed" | "If **writing to** the log is what failed" |

---

## 1. Day-of-week learner disabled

### The switch (`:931-947`)

```js
// 🔴 DISABLED (behaviour switch, NOT a deletion — see the call site for the full reasoning).
// Always true: the learned-day window is no longer a gate. The 23h due-window (isDueByLog) is now the
// ONLY cadence control. The body below is intentionally preserved, unreachable, together with the
// learner that writes scraper_update_day / scraper_learning_complete in recordRunAndLearn — the data
// keeps accruing and this becomes a one-line re-enable (delete the `return true`) if truck volume ever
// makes the saved page loads worth the missed-update risk.
function shouldRunToday(truck) {
  return true;

  // eslint-disable-next-line no-unreachable
  const today = new Date().getDay();
  if (!truck.scraper_learning_complete) return true;
  …
}
```

The original body is preserved verbatim below the `return true`. **Re-enabling is deleting one line.**

**The learner itself is untouched** — `recordRunAndLearn` (`:1044-1059`) still computes and writes
`scraper_update_day` and `scraper_learning_complete` on every run past day 30. The data keeps
accruing, exactly as instructed; it is simply no longer consulted.

Worth noting: because the truck now runs **every** day, the learner's future observations are drawn
from all 7 weekdays rather than only the 3 it already believed in. If it is ever re-enabled, it will
be re-enabled on *unbiased* data — the self-reinforcement described below is broken by this change,
not merely bypassed.

### The reasoning, recorded at the call site (`:1226-1241`)

```js
      //  (1) shouldRunToday — 🔴 NOW A NO-OP (hardcoded true). Kept in the chain so re-enabling is one line.
      //  (2) isDueByLog     — forgiving due-window vs scraper_run_log (~24/n−1h; 3×/day → 7h). …
      //
      // 🔴 WHY THE LEARNED-DAY WINDOW WAS DISABLED. Once scraper_learning_complete flipped, a truck was
      // eligible on only 3 days a week (learned day, +1, +2). Two trucks learned DISJOINT windows — gusto
      // Mon/Tue/Wed, test-truck Thu/Fri/Sat — so no day ever ran both and SUNDAY ran neither. Gusto
      // publishes on SUNDAY: the one day their learned window excluded. Their update sat unscraped until
      // the window reopened the next day.
      //
      // The deeper defect is that the learner is SELF-REINFORCING and cannot correct itself. It learns
      // from `events_changed` observed on days it actually ran, but it only runs on days it already
      // believes in — so a truck can never be observed publishing outside its own window, and the evidence
      // that would move the window can never be gathered. A single early coincidence becomes permanent.
      // (`indexOf(maxChanges)` also breaks ties toward the lowest-numbered weekday, so sparse history
      // decides the whole schedule.)
      //
      // Trade: we spend more page loads to stop missing updates. At 1×/day the 23h window still caps each
      // truck at one scrape per day — the cost is bounded by scrape_times_per_day, not by this gate.
```

Both call sites are covered: the `anyDue` pre-check at `:1193` and the in-loop gate at `:1248`.
Both now evaluate `shouldRunToday` to `true`, leaving `isDueByLog` as the sole pacing control.

### Added cost

The 23h window is unchanged, so **each truck is still capped at one scrape per ~23h**. The learner
was only ever removing *days*, so the delta is days-per-week, not scrapes-per-day.

Per truck: **~3 scrapes/week → ~7.3/week** (24 ÷ 23 ≈ 1.04 per calendar day).

| Fleet | Scrapes/day before | Scrapes/day after | Added/day |
|---|---|---|---|
| **2 trucks (today)** | ~0.86 | ~2.1 | **~+1.2** |
| **15 trucks** | ~6.4 | ~15.6 | **~+9.2** |

What one scrape costs:

- **1 Puppeteer page load** — 30s nav budget (`:1198`) + 3s settle + up to 15s scroll → **~35-50s
  worst case**, typically far less. Two page loads only on a truck's first-ever run (dual detection).
- **1 Gemini call — only when the page text actually changed.** The pre-Gemini text-hash skip
  (`:1281-1285`) means an unchanged page costs a page load and nothing else. This is the important
  economics: the extra days are cheap precisely because most of them find nothing new, and the one
  day that *does* change is the one we were missing.

**At 2 trucks the added cost is ~1 extra page load per day — roughly a minute of runner time.**
Negligible.

**At 15 trucks**, the loop is serial (`for...of` with `await`, `:1231`), so a fire where all 15 are
due would run ~15 × ~45s ≈ **11-15 minutes** in one job. Two things worth knowing before that point:
they would naturally spread across different hourly fires (each truck's window opens at its own
run_at + 23h), and the workflow has **no `timeout-minutes`**, so it would fall back to the Actions
default 6h job limit. Neither is a problem at 15; both are worth revisiting at ~50.

Actions minutes overall are **unchanged** — the hourly cron still fires 24×/day regardless; this
diff only changes how many of those fires do work.

---

## 2. Failures made visible

### 2a. `main()` now exits non-zero (`:1632-1638`)

```js
// 🔴 A bare `main()` left every rejection unhandled: the run could die at any point — a missing credential
// throw, a puppeteer.launch failure, a DB read error — and the only trace was stderr. Catch explicitly and
// exit NON-ZERO so the GitHub Actions run goes RED instead of silently reporting success.
main().catch(err => {
  console.error('\n💥 SCRAPER RUN FAILED:', err?.message || err);
  if (err?.stack) console.error(err.stack);
  process.exit(1);
});
```

This also covers the pre-existing throws that were previously unhandled rejections — the credentials
check at `:411` and the un-tried `puppeteer.launch` at `:1196` — so a Chrome-launch failure, the
strongest candidate for the two multi-day outages, is now a red run.

### 2b. Missing secrets and DB errors now fail

**Secret guard** (`:1509-1516`) — was `console.log(…skipping…)` + exit 0:

```js
} else if (RUN_HATCHGRAB) {
  // 🔴 A MISSING SECRET IS A FAILURE, NOT A NO-OP. This used to console.log and exit 0 — the job went
  // green while scraping nothing, so a cleared/rotated secret could silence every truck indefinitely with
  // no red run anywhere. Throw → main()'s catch → exit 1 → red in Actions.
  throw new Error(
    `HatchGrab scraping requested (SCRAPE_MODE=${MODE || 'unset'}) but required secrets are missing: ` +
    `${!HATCHGRAB_API_URL ? 'HATCHGRAB_API_URL ' : ''}${!INBOUND_SECRET ? 'INBOUND_SCHEDULE_SECRET' : ''}`.trim()
  );
}
```

The message names *which* secret is missing.

**Query error** (`:1164-1173`) — the error is now destructured and checked:

```js
  const { data: hgTrucks, error: hgTrucksError } = await hgQuery;
  if (hgTrucksError) {
    throw new Error(`Could not read trucks for scraping (database error, NOT "no trucks"): ${hgTrucksError.message}`);
  }
```

**The required distinction is preserved and now structural**, not incidental:

| Case | Before | After |
|---|---|---|
| Query **errored** (DB down, expired key) | `hgTrucks = null` → "No HatchGrab trucks with auto-scraping enabled" → **exit 0, green** | **throw → exit 1, red** |
| Query **OK, zero rows** (nothing enrolled) | same message, exit 0 | exit 0 — message now reads `(query OK, zero rows)` (`:1501`) |

The `else` branch at `:1498-1501` is now reachable *only* on a successful empty query, since an error
throws above it — so its message can finally be trusted.

### 2c. Per-truck crashes are recorded in SQL

New helper beside `recordRunAndLearn` (`:1065-1094`):

```js
async function recordRunFailure(supabase, truck, notes) {
  try {
    const { error } = await supabase.from('scraper_run_log').insert({
      truck_id: truck.id,
      run_at: new Date().toISOString(),
      day_of_week: new Date().getDay(),
      events_found: 0,
      events_changed: false,
      rule_used: truck.scraper_rule || null,
      notes,
    });
    if (error) console.error(`   ⚠️  Could not log failure row for ${truck.name}: ${error.message}`);
  } catch (logErr) {
    console.error(`   ⚠️  Could not log failure row for ${truck.name}: ${logErr.message}`);
  }
}
```

Called from the per-truck catch (`:1484-1488`):

```js
      } catch (err) {
        // A per-truck crash used to be recorded NOWHERE — the truck simply vanished from scraper_run_log
        // with no trace outside the Actions console. Now it leaves a row so it is findable in SQL.
        console.error(`   ❌ Error scraping ${hgTruck.name}:`, err.message);
        await recordRunFailure(supabase, hgTruck,
          `crash; rule=${hgTruck.scraper_rule || 'none'}; err=${(err.message || 'unknown').slice(0, 160)}`);
      }
```

Three deliberate choices:

1. **Never throws.** Both the `{ error }` return and a thrown exception are caught and downgraded to
   stdout — the database being unreachable is a plausible *cause* of the crash being recorded, so
   logging must not become a second failure. The loop continues to the next truck either way.
2. **Direct insert, not `recordRunAndLearn`.** A crash must not stamp `trucks.scraper_last_run_at`
   nor feed the day-of-week learner a junk observation.
3. **`notes` reuses the previous diff's convention** — `crash; rule=…; err=…`, message truncated to
   160 chars, so it sits alongside `zero_events`, `unchanged_text`, `ai_error`, `empty_page` and is
   greppable the same way:

```sql
select run_at, rule_used, events_found, notes
from scraper_run_log
where notes like 'crash%' order by run_at desc;
```

**⚠️ The one real behaviour change, documented in the helper's docblock:** writing this row **resets
that truck's 23h due-window**, because `isDueByLog` reads the most recent `run_at` regardless of
outcome. Previously a crashing truck wrote nothing, stayed permanently due, and was retried *every
hour* — invisibly. It now backs off to one attempt per window. That is a genuine trade: visibility
and no hammering, in exchange for slower recovery from a transient crash (next window rather than
next hour). Flagged rather than assumed; it is reversible by inserting with a back-dated `run_at`,
which I have not done because it would put a false timestamp in the log.

### 2d. `anyDue` false — still exits 0, now unambiguous (`:1493-1497`)

```js
  } else if (hgTrucks && hgTrucks.length > 0) {
    // LEGITIMATE no-op — the hourly cron firing with nothing inside its due window is the designed
    // steady state (most fires). Exit 0 deliberately. Logged with counts so it is unmistakably a
    // "nothing was due" run rather than a "something went wrong" run.
    console.log(`   ⏭️  NO-OP: ${hgTrucks.length} truck(s) enrolled, 0 due this run (23h due-window) — no browser launched, nothing scraped, nothing failed.`);
```

Exit code unchanged (0), as instructed. The message now states the enrolled count and explicitly
that nothing failed, so it can't be mistaken for the silent-failure messages it used to resemble.

---

## 3. Failure-visibility matrix (before → after)

| Failure | Before | After |
|---|---|---|
| Missing `GOOGLE_SHEETS_CREDENTIALS` / `GEMINI_API_KEY` (`:411`) | unhandled rejection, stderr only | **exit 1, red** |
| Missing `HATCHGRAB_API_URL` / `INBOUND_SCHEDULE_SECRET` | log + **exit 0, green** | **exit 1, red**, names the secret |
| Truck query errored (DB outage) | "no trucks" + **exit 0, green** | **exit 1, red**, says "NOT no trucks" |
| `puppeteer.launch` fails | unhandled rejection, stderr only | **exit 1, red** |
| Per-truck crash | nothing anywhere | **`scraper_run_log` row, `notes` = `crash; …`** |
| Nothing due | exit 0, terse log | exit 0, explicit NO-OP log |
| Query OK, zero trucks enrolled | exit 0 | exit 0, "(query OK, zero rows)" |

No notification channel was added — out of scope for this diff, as instructed.

---

## 4. Not done / caveats

- **No notification channel** (email, Slack, `if: failure()` step). Scope was Actions + SQL only.
- **Workflow file untouched** — cadence, `timeout-minutes` and failure steps are all unchanged.
- **The learner still writes** `scraper_update_day` / `scraper_learning_complete`. Intentional: the
  data stays intact and unused. If you would rather it stop accruing, that is a separate one-line
  change in `recordRunAndLearn` — I did not make it, because the brief said keep the data.
- **`process.exit(1)` can truncate in-flight fire-and-forget writes** — the Brevo empty-schedule
  email (`:1117`) and the `discovery_trucks`/`venues` mirrors are un-awaited. On a failure path that
  is acceptable, but it means a crash can drop a queued email. Noted rather than changed.
- **`git diff --stat` shows 217 insertions / 43 deletions**, which is *cumulative* over the previous
  (uncommitted) rule-detection diff plus this one. This change alone is the five edits quoted above.
- **The script was not executed.** It needs live credentials and would hit real trucks and the real
  inbound endpoint. Verification is `node --check` plus line-by-line reasoning.

**Recommended before trusting the hourly cron:** `workflow_dispatch` on `hatchgrab_scrape.yml` with
`scrape_truck_id` blank, so the full gated path runs. Expect gusto and test-truck both to become
eligible on the same day for the first time since 18 July (whichever are inside their 23h window),
and confirm afterwards:

```sql
select truck_id, date(run_at) d, count(*), max(notes)
from scraper_run_log where run_at > now() - interval '3 days'
group by 1,2 order by 2 desc;
```

Both trucks appearing on the same date is the signal that fix 1 took effect.
