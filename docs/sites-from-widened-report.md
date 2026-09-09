# `SITES_FROM` — the widened switch, and the 116/116 result

**Date:** 9 September 2026 · **Change:** `scripts/run-scraper.js`, one file, **+169 / −3**, uncommitted. **No database row inserted, updated or deleted. No Sheet cell modified. Nothing staged, committed or pushed; `git add` not run.** The default is **not** flipped, the Sheet read is **not** removed, and `aliases` is **not** touched.

**Tags:** 🔎 SOURCE-READ (file:line) · 🧪 EXECUTED (command and output quoted) · ⚠️ inference · 🔴 danger.
**Extensions searched:** none scoped. `grep -n` over `scripts/run-scraper.js` — **JavaScript** — and `.github/workflows/*.yml` by explicit path. 🧪 The workflow sweep for `SITES_FROM` returned **`0`** and **`0`** with exit 1 — a true negative, not a failed search (which exits 2).

---

## 0. Row counts and working tree — START and END

| | START 21:03:39Z | END 21:12:09Z |
|---|---|---|
| `discovery_trucks` | 231 | 231 |
| `venues` | 814 | 814 |
| `discovery_events` | 4,300 | 4,300 |
| `discovery_exclusion_terms` | 143 | 143 |
| `outreach_prospects` | 231 | 231 |
| `scraper_run_log` | 418 | 418 |

🧪 **And the Sheet, which my test runs could in principle have appended to:** Events **725**, Trucks **152**, Venues **936**, Exclusions **143** — unchanged. 🔎 Every Sheet append and DB mirror runs *after* the whole site loop; my runs were killed inside it, and `discovery_run_log` is still 404 so the per-site insert wrote nothing either.

### ⚠️ One tracked file WAS modified, and it was not me editing it

🧪 `git status` at END shows **` M DEBUG_SCRAPED_TEXT.txt`**. 🔎 `run-scraper.js:945` does `fs.writeFileSync('DEBUG_SCRAPED_TEXT.txt', cleanText)` on every site it scrapes — so running the scraper at all rewrites it. It is a tracked debug artefact (last committed in `28a2a2a`), now holding the last page my test runs read (`Aroy D Thai Food`). **I have not reverted it**, per the standing instruction not to checkout or restore. **Flagging it rather than letting you find it.**

**`git status --short` START:** 4 untracked docs/SQL paths, **`run-scraper.js` clean** (🧪 `git diff --stat` empty). `HEAD` = `origin/main` = **`9e83a5e`**. **END:** the same, plus ` M scripts/run-scraper.js` and ` M DEBUG_SCRAPED_TEXT.txt`. Nothing staged.

### Preconditions — verified, not trusted

| claim | 🧪 verified |
|---|---|
| markers nulled, 100 → 0 | **0 rows** carry `NEW FROM SCRAPER` |
| 7 real venue strategies survive | **7** rows have a `scraper_strategy`, and **7** of those are sites with `scroll_lazy` |
| La Piazza not merged | **2** rows still named `La Piazza*` |

---

## 1. The switch

🔎 Same shape as `EXCLUSIONS_FROM`, which now runs in production:

```js
const SITES_FROM_RAW = (process.env.SITES_FROM || '').trim();
const SITES_FROM = SITES_FROM_RAW.toLowerCase() === 'db' ? 'db' : 'sheet';
```

🔴 The ternary can yield only `db` or `sheet`, and only the exact string `db` (case-insensitively) yields `db` — every other value falls to `sheet` **by construction**, with a message.

**Both lists are built on every discovery run.** The unselected one cannot reach the scrape loop:

```js
const sitesToScrape = (SITES_FROM === 'db' && dbSites) ? dbSites.slice() : sheetSites.slice();
```

**The Sheet builder is byte-for-byte the code that has always run** — I renamed its target from `sitesToScrape` to `sheetSites` and changed nothing else.

---

## 2. The DB site list — reproducing the Sheet's rules

| rule | Sheet | DB path |
|---|---|---|
| **membership** | `hasUrl \|\| aiInstructions.length > 10` | identical, on `ai_instructions` |
| **url precedence** | `row[8] \|\| row[6]` | `(String(schedule_url).trim() \|\| String(website).trim()) \|\| 'about:blank'` — schedule page before homepage, the `nullif(btrim(…),'')` form |
| **venue membership** | `row[9] && row[9].startsWith('http')` | identical, on `venues.schedule_url` |
| **strategy** | `(row[15] \|\| 'scroll_lazy').toLowerCase().trim()`, comma-split, one entry per strategy | **the same helper**, `splitStrategies()`, called by both builders |

🔴 **One helper, used by both, so the strategy rule cannot drift between them.** 🧪 Zero rows carry a comma today, so the list is 1:1 — but the rule is reproduced, not assumed away. **If a comma appears, both paths emit N entries for that row** and the control compares them entry by entry; 🧪 demonstrated in scenario 5 below, where a two-strategy row produced two entries and the control reported the extra one.

### The uniqueness rule, and why it did not fire

🔴 The Sheet has one row per truck; **the DB has 231 rows for 230 normalised names**. So uniqueness moves from the source into the builder: group on `normalizeName(name)`, **ordered `created_at asc, id asc`** — 🔴 "first wins" is only deterministic if the query is ordered — and de-dup runs **after** the membership test, so if only one of a colliding pair is a site, that one is kept regardless of age.

⚠️ **It did not fire today, and the reason matters.** 🧪 No `de-dup dropped` line appeared in any run, because `5a9bbae8 "La Piazza Street Food"` has both URL columns null and no instructions — **it fails membership and is discarded before the de-dup check is reached.** The rule is present, correct and **currently unexercised**; it is what stops a second entry appearing the day that row gains a URL. **The proof it emits one entry is the control's `116 vs 116, 0 only in the SHEET`.**

⚠️ A name normalising to the **empty string** falls back to the raw name as its key — otherwise every such row would collapse into one (manual §4.1: `"The Street"` → `""`). 🧪 Zero rows do today.

---

## 3. 🔬 The control — field-level, and the result

🔴 Keyed on `sourceType :: normalizeName(name) :: strategy`, comparing **url, instructions and strategy** per entry, reporting entries in one and not the other **and** per-field mismatches for entries in both.

🧪 **On today's real data, every run:**

```
   🔬 SITE-LIST CONTROL — sheet 116 entr(ies), db 116.
      ✅ IDENTICAL on every entry and every field (name, url, instructions, strategy, sourceType).
```

**116 = 109 truck entries + 7 venue entries**, both sides, with no entry in one and not the other and no field mismatch anywhere.

### ⚠️ The venue-strategy mismatch you expected does not exist — and here is why

**Your brief said:** *"Expect a real mismatch on venue `scraper_strategy` because of the marker nulling."* 🧪 **There is none, and the control would have caught it.**

🔎 A venue is a site only if `schedule_url` starts with `http`. 🧪 **All 100 marker rows had a null `schedule_url` — none was ever a site**, which is exactly why nulling them was safe. And 🧪 all **7** venue sites carry `scroll_lazy` on **both** sides. **The nulled column and the site list do not intersect: the markers were only ever on rows neither list contains.**

🔴 **So the Sheet and the DB do now disagree on that column — on 342 Sheet rows versus 0 DB rows — and the site-list control cannot see it, correctly, because none of those rows is a site.** ⚠️ **Which side is right: the DB.** `[⚠️ NEW FROM SCRAPER]` is a provenance marker, not a strategy; `run-scraper.js:1981` still writes it to Sheet column L on every new venue, so **the Sheet will keep drifting further from the DB on that column, harmlessly, until that write is changed** — out of scope here, recorded.

---

## 4. Failure behaviour

| condition | `SITES_FROM=db` | `SITES_FROM=sheet` |
|---|---|---|
| DB read errors | 🔴 **THROW** | ⚠️ warn; control unavailable; run continues |
| DB yields 0 sites **and no TARGET_NAME** | 🔴 **THROW** | n/a |
| DB yields 0 sites **with a TARGET_NAME** | ✅ exits 0 — a targeted run legitimately matches nothing | ✅ exits 0 |

🔎 `assertSitesToScrape` is unchanged and still fires on whatever is in `sitesToScrape`, so it protects the DB path with no edit. The two rules above throw earlier and say why.

🧪 **Executed** (bogus service key): `SITES_FROM=db` → **exit 1**, `SCRAPER RUN FAILED: SITES_FROM=db but the site list could not be read from the database: discovery_trucks: [undefined] Invalid API key.`

### 🔴 A real bug found by running, not reading

My first version threw whenever the DB list was empty. 🧪 Tested against the Sheet path with a target matching nothing:

```
sheet + target matching nothing → exit=0     ← what has always happened
db    + target matching nothing → exit=1     ← 🔴 my rule, wrong
```

🔎 `assertSitesToScrape` is deliberately gated `RUN_DISCOVERY && !TARGET_NAME` **because a targeted run legitimately yields 0 sites** — and I had reproduced the assertion without its gate. That is a behaviour difference **between the two sources**, which is precisely what a source switch must not introduce, and it would have broken every `workflow_dispatch` targeted run under the flag. Fixed by adding `&& !TARGET_NAME`; 🧪 re-tested, **both paths now exit 0**.

---

## 5. Proof — run, not asserted

🧪 Real runs of the real script. `timeout` is not on macOS, so a `perl -e 'alarm'` deadline killed each run inside the scrape loop — 🔎 the control prints at `:801`, before `assertSitesToScrape` (`:817`) and well before `puppeteer.launch` (`:895`), and all writes happen after the loop, so nothing was written (row counts and Sheet counts in §0 confirm).

| run | result |
|---|---|
| **flag unset** | `🔀 SITES_FROM=sheet (default) → using 116 site(s) from the SHEET.` · control `116/116` · `✅ IDENTICAL` |
| **`SITES_FROM=db`** | `🔀 SITES_FROM=db → using 116 site(s) from the DATABASE.` · `✅ IDENTICAL` · scraping began `[1/116] A Taste of Jamrock (truck \| scroll_lazy)` |
| **`SITES_FROM=nonsense`** | `⚠️ SITES_FROM="nonsense" is not recognised — falling back to 'sheet'.` then `🔀 SITES_FROM=sheet` |
| 🔴 **`SCRAPE_MODE=hatchgrab` + `SITES_FROM=db`** | **exit 0** — `⏭️ Google Sheet not read` → `NO-OP: 3 truck(s) enrolled, 0 due` → `✅ scraper_run_log pruned`. **No throw.** |

🔴 **The hatchgrab test is the one the last pass taught me to run**, where an `EXCLUSIONS_FROM` failure rule threw on a set Pass B never reads. Both failure rules here are gated on `RUN_DISCOVERY` from the outset, and 🧪 the run proves it: the hourly operator job is untouched by a flag that does not apply to it.

### 🔴 `Louigi's Pizza` and `MumTas` — named, from the DB path

**The two sites that exist only because of the `ai_instructions` clause**, each proven by a targeted run of the real script with `SITES_FROM=db`:

```
🎯 TARGET MODE ACTIVE: Only scraping "louigi's pizza"
   🔀 SITES_FROM=db → using 1 site(s) from the DATABASE.
   ✅ IDENTICAL on every entry and every field
🔍 [1/1] Scraping: Louigi's Pizza (truck | manual)...

🎯 TARGET MODE ACTIVE: Only scraping "mumtas"
   🔀 SITES_FROM=db → using 1 site(s) from the DATABASE.
   ✅ IDENTICAL on every entry and every field
🔍 [1/1] Scraping: MumTas (truck | scroll_lazy)...
```

🧪 And the rows behind them: **`Louigi's Pizza`** — `schedule_url` null, `website` null, `ai_instructions` **70 chars**, strategy `manual`; **`MumTas`** — both null, `ai_instructions` **86 chars**, strategy `scroll_lazy`. **Both have no URL at all and are sites purely on the instructions clause.** ⚠️ This is also why the full-run control reports `0 only in the SHEET`: had the DB path omitted that clause, these two would have been exactly the two sheet-only entries.

### 🔴 Forcing a disagreement

🔴 **Identical output when the sources agree is indistinguishable from a flag read nowhere** — and today they agree exactly. So the control block and the selection expression were **extracted verbatim from the file's source text** and driven with mutated lists:

```
EXTRACTED VERBATIM from scripts/run-scraper.js (source text, not retyped):
   normalizeName 10L · splitStrategies 3L · control block 29L
   selection: const sitesToScrape = (SITES_FROM === 'db' && dbSites) ? dbSites.slice() : sheetSites.slice();
```

| # | scenario | control said | used lists |
|---|---|---|---|
| 1 | sources agree | `✅ IDENTICAL` | same |
| 2 | 🔴 **a site injected into the DB list only** | `⚠️ 1 only in the DB: "Ghost Truck"` | 🔴 **DIVERGE** — 4 vs 5, db-only `Ghost Truck` |
| 3 | equal count, **db url changed** | `🔴 1 entr(ies) present in BOTH but differing per-field — url: sheet="https://a.example" db="https://DIFFERENT.example"` | same keys, **different URL scraped** |
| 4 | equal count, **instructions differ** | `🔴 … instructions: sheet=70 chars db=7 chars` | same keys, **different prompt** |
| 5 | **comma-split strategy** | `⚠️ 1 only in the DB` | 🔴 **DIVERGE** — one row became two entries |

**Scenario 2 is the discriminator for the flag** — a list present in one source only produces a different set of sites scraped, which a flag read nowhere could not do. ⚠️ **Scenarios 3 and 4 are the discriminator for the CONTROL:** the two lists have the *same entries* and the *same count*, so a count or key comparison would pass them — and the scrape would still use a different URL and a different prompt. **That is exactly why the control compares fields, not counts.**

---

## 6. What changed, and what has not

**One file, +169 / −3.** New: the flag, `splitStrategies`, the DB builder with its de-dup, the two failure rules, the selection, and the field-level control. Changed in existing code: the Sheet builder now fills `sheetSites` instead of `sitesToScrape` — **its rules are untouched.**

🔴 **NOTHING CHANGES UNTIL THIS IS DEPLOYED AND THE FLAG IS SET IN A WORKFLOW.** 🧪 `grep -c SITES_FROM` on both workflow files returns **0** and **0**. The scraper runs on Actions from the checked-out commit, so until this is committed and pushed the crons run the old code; once pushed, **with no flag set `SITES_FROM` defaults to `sheet` and the site list is byte-for-byte what ran this morning.** The first run to exercise it is the next `daily_scrape.yml` at `0 6 * * *`, which will print the `116/116` diff against real data.

**Explicitly not done, as instructed:** default **not** flipped · Sheet read **not** removed · `aliases` **not** touched (🔎 it still feeds `validTrucks` from Sheet column 17, and belongs with `MATCH_FROM`) · no database row and no Sheet cell written.

**Before the default can be flipped:** several 06:00 runs reporting `✅ IDENTICAL`, and ⚠️ a decision on the auto-exclusion persistence gap carried over from the last pass (a mid-run auto-exclusion still reaches the Sheet and not the database).

**No span of the prompt arrived garbled. One expectation in it — a venue-strategy mismatch — is contradicted by the data, and §3 says so with the evidence rather than reporting a mismatch that is not there.**
