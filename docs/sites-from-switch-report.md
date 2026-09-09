# `SITES_FROM` — 🔴 STOPPED. The site list cannot move without the two config columns this pass excludes.

**Date:** 9 September 2026 · **Mode:** analysis. 🔴 **NO CODE WAS WRITTEN.** `scripts/run-scraper.js` is untouched — 🧪 `git diff --stat scripts/run-scraper.js` is empty and `git status --short` is **completely clean** at both ends. No database row inserted, updated or deleted. No Sheet cell modified. Nothing staged, committed or pushed; `git add` not run.

**Why:** the prompt's own escape clause fired. *"If they are entangled with the site-list construction such that one cannot move without the other, STOP and report that rather than moving both."* 🔎 **They are, structurally, and the entanglement is in the membership rule itself — not merely in the payload.** The evidence is §3 and §4.

**Tags:** 🔎 SOURCE-READ (file:line) · 🧪 EXECUTED · ⚠️ inference · 🔴 danger.
**Extensions searched:** none scoped. `grep -rn -I … .` with only `node_modules`/`.next`/`.git` excluded (so `.js`, `.ts`, `.tsx`, `.sql`, `.md`, `.yml` were all in scope), plus `grep -n` over `scripts/run-scraper.js` — **JavaScript** — and `scripts/geo-validate.js` by path. 🧪 The `SITES_FROM` sweep **exited 0 with hits** (six, all in docs and one comment); the field-usage sweep exited 0. No search in this report rests on an unverified empty result.

---

## 0. Row counts and working tree — START and END

| | START 20:47:37Z | END 20:50:07Z |
|---|---|---|
| `discovery_trucks` | 231 | 231 |
| `venues` | 814 | 814 |
| `discovery_events` | 4,300 | 4,300 |
| `discovery_exclusion_terms` | 143 | 143 |
| `scraper_run_log` | 418 | 418 |

**`git status --short`: EMPTY at START and EMPTY at END.** `HEAD` = `origin/main` = **`9e83a5e`**.

### Step 1 — stop conditions

✅ **`scripts/run-scraper.js` is clean.** 🧪 The `EXCLUSIONS_FROM` work deployed — commits `69c4fdd` and `9e83a5e` ("migration changes") landed it, 🧪 `git show HEAD:scripts/run-scraper.js | grep -c EXCLUSIONS_FROM` → **15**, identical to the working tree. Nothing was modified before I started and nothing is modified now.

---

## 1. Step 2 — the rule, re-derived against live data

🔎 **Today's Sheet rule** (`run-scraper.js:619-651`): `const targetUrl = row[8] || row[6] || 'about:blank'` — Schedule URL, else Website.

🧪 **Re-derived independently. Your figures reproduce exactly:**

| measure | result |
|---|---|
| DB `coalesce(schedule_url, website)` vs Sheet `row[8] \|\| row[6]` | **106 IDENTICAL · 0 MISMATCH** |
| zero-match / multi-match | **0 / 1** (`La Piazza`) |
| Sheet col I (Schedule URL) non-empty | **26** |
| DB `discovery_trucks.schedule_url` non-null | **26** |
| of the Sheet's 26, byte-identical in the DB | **26 — all** |

**How the precedence is preserved:** `coalesce(schedule_url, website)` is the exact SQL analogue of `row[8] || row[6]`. 🔴 **The distinction survives because the two values stay in two columns.** That is precisely why migration step 1 proposed **zero rows** rather than backfilling the website into `schedule_url` — collapsing them would have made "this truck has a real schedule page" (26) indistinguishable from "this truck has only a homepage" (80), and unrecoverably so.

⚠️ **One difference from `||` worth stating:** SQL `coalesce` returns the first **non-NULL**, whereas JavaScript `||` returns the first **truthy** — so an empty-string `schedule_url` would fall through in the Sheet path but be *returned* by `coalesce`. 🧪 Not reachable today (all 26 are real URLs), but the DB rule would need `coalesce(nullif(btrim(schedule_url),''), nullif(btrim(website),''))` to match the Sheet exactly.

**When both are null:** the Sheet path yields `'about:blank'`, and the row enters the list **only if `ai_instructions.length > 10`** — see §3, which is where this pass stops.

### 🔴 La Piazza — asked and answered: no duplicate, but a latent one

🧪 Two `discovery_trucks` rows normalise to `lapiazza`:

| id | name | `schedule_url` | `website` | events | `coalesce` |
|---|---|---|---|---|---|
| `fa09b6c8` | La Piazza | null | `facebook.com/Lapiazzacambridge` | **8** | **the URL** |
| `5a9bbae8` | La Piazza Street Food | null | **null** | **7** | **null** |

**A DB rule of `where coalesce(schedule_url, website) is not null` emits exactly ONE entry** — `fa09b6c8` — matching the Sheet's single row. **No duplicate today.**

🔴 **But it is a duplicate waiting to happen, and nothing would announce it.** The Sheet has *one* La Piazza row and the DB has *two*; the second is excluded **only because both its URL columns are null**. The moment anyone sets a website on `La Piazza Street Food`, the DB path emits **two** site entries where the Sheet emits one — the same page scraped twice, and 15 events split across two truck identities. ⚠️ The two rows collapse under `normalizeName` because it strips `street` **and** `food` (🔎 `:58`), so they are one truck to the matcher and two rows to the site list. **A DB-sourced site list needs a uniqueness rule on the normalised name that the Sheet never needed.**

---

## 2. Step 3 — everything a site-list entry carries

🔎 Both builders push an object with **exactly five fields** (`:630-635`, `:645-650`):

```js
{ name, url, instructions, strategy, sourceType }
```

| field | Sheet source | can the DB supply it? |
|---|---|---|
| `name` | Trucks `row[0]` / Venues `row[0]` | ✅ `discovery_trucks.name` / `venues.name` |
| `url` | `row[8] \|\| row[6]` / `row[9]` | ✅ `coalesce(schedule_url, website)` / `venues.schedule_url` — §1 |
| `sourceType` | literal `'truck'` / `'venue'` | ✅ from which table the row came |
| **`instructions`** | **Trucks `row[14]` / Venues `row[10]`** | 🔴 **`ai_instructions` — EXCLUDED FROM THIS PASS** |
| **`strategy`** | **Trucks `row[15]` / Venues `row[11]`**, lower-cased, comma-split, default `scroll_lazy` | 🔴 **`scraper_strategy` — EXCLUDED FROM THIS PASS** |

**These are not decoration. Every one of them is load-bearing downstream** (🧪 sweep of `site.<field>`, exit 0):

- 🔎 `:767` `STRATEGIES[site.strategy]` — **strategy dispatches which scrape function runs.**
- 🔎 `:769` strategy gates whether a page is loaded **at all**.
- 🔎 `:785-797` strategy selects the prompt shape — and for `manual` / `manual_single`, 🔴 **`site.instructions` IS the input**: `cleanText = "SYSTEM OVERRIDE: … RULES: ${site.instructions}"`. No page is fetched; the instructions are the entire payload.
- 🔎 `:824`, `:855` instructions are injected into both extraction prompts as the user hint.
- 🔎 `:1152` strategy and url are written verbatim into every event's `source` string.
- 🔎 `:1014`, `:1037`, `:1072-1074` `sourceType` decides whether the exclusion filter applies and whether the truck/venue is taken from the site list.

🔴 **So a DB path that supplied a null instruction or a default strategy would not be a switch — it would be a behaviour change.** Naming them, as asked: **42 truck sites would get the wrong strategy** (defaulting to `scroll_lazy` instead of their configured value) and **30 truck sites plus 5 venue sites would lose their instructions entirely** — including the 20 `manual` trucks, for which losing the instructions means **losing the only input they have.**

---

## 3. 🔴 Step 4/5 — WHY THIS STOPPED: the membership rule reads `ai_instructions`

**This is the finding.** 🔎 `run-scraper.js:625-628`:

```js
const hasUrl = targetUrl !== 'about:blank';
const hasInstructions = aiInstructions.length > 10;
if (hasUrl || hasInstructions) { … sitesToScrape.push(…) }
```

🔴 **Whether a truck is a site at all depends on `ai_instructions`.** It is not that the site list *carries* the config columns — it is that the config columns *decide the membership of the list*.

🧪 **Measured on live data: 2 sites exist ONLY because of this clause**, having no URL whatsoever:

| name | Sheet row | instructions | strategy |
|---|---|---|---|
| `Louigi's Pizza` | 49 | 70 chars | `manual` |
| `MumTas` | 57 | 86 chars | `scroll_lazy` |

**A DB site list built without reading `ai_instructions` yields 114 entries where the Sheet yields 116.** Those two trucks would silently stop being scraped. ⚠️ And they are `manual`-shaped — the class V1.4 §6 item 16 already records as **"10 silent `manual` trucks, UNEXPLAINED"**. Dropping two more into that bucket while investigating it would be actively unhelpful.

**A second, latent entanglement — cardinality.** 🔎 `runStrategy.split(',')` pushes **one entry per strategy**, so one Sheet row can become N sites. 🧪 **Zero rows carry a comma today** (trucks 0, venues 0), so the list is 1:1 right now — **but the rule is in the code**, and a single Sheet edit would make the DB path's row count diverge from the Sheet path's. It is dormant, not absent.

🧪 **The whole current list: 116 entries = 109 truck rows + 7 venue rows.**

### Could I have built a partial switch instead?

I considered taking `name`/`url`/`sourceType` from the DB and continuing to read `instructions`/`strategy` from the Sheet. **I rejected it, and the reason matters:**

1. **The membership rule would still need the Sheet**, so `SITES_FROM=db` would not be a DB-sourced site list.
2. **It could never let you turn the Sheet off** — which is the entire purpose of the switch (retirement plan step 5 → step 8).
3. 🔴 **Worst: the control would report "0 differences" while the DB path still depended on the Sheet** — a green light that means nothing. Exactly the failure the in-run control exists to prevent.

**So the honest outcome is to stop, which is what the prompt asked for in this case.**

---

## 4. What Steps 4, 5 and 6 would have been — recorded so the next pass starts here

**The pattern is settled and reusable** (it is working today for `EXCLUSIONS_FROM`, deployed at `9e83a5e`): flag parsed with a ternary that can only yield `db` or `sheet`, case-insensitive `db`, **any unrecognised value falls to `sheet` with a message**; both sources built every discovery run; the flag selects which is copied into the used variable; the unselected one is comparison-only.

**Step 4 — the control** would diff on `(name, url, sourceType, strategy)` per entry, keyed on normalised name + sourceType, and report **field-level equivalence**, not counts — ⚠️ because two 116-entry lists can differ entry by entry. The `EXCLUSIONS_FROM` control already demonstrates why: 🧪 it caught an equal-count/different-content case that set-size comparison would have passed.

**Step 5 — failure behaviour.** 🔎 `assertSitesToScrape` (`scripts/geo-validate.js`) is `if (!count) throw` — it fires on **whatever list is in `sitesToScrape`**, so it protects the DB path unchanged, with no edit needed. 🔎 It is called at `:657` gated `RUN_DISCOVERY && !TARGET_NAME`. On top of it, `SITES_FROM=db` would need: **DB read error → throw; 0 rows → throw** (an empty site list means the run scrapes nothing while going green).

🔴 **Step 6's hatchgrab test is the one I would not have skipped.** The `EXCLUSIONS_FROM` pass found exactly that bug — a flag throwing on a set Pass B never reads, which would have killed the hourly operator job. **Any `SITES_FROM` failure rule must be gated on `RUN_DISCOVERY`**, because 🔎 Pass B builds no Pass-A site list by design and both workflows share one env block.

---

## 5. 🔴 A landmine the next pass must clear first

🧪 **`venues.scraper_strategy` does not contain strategies.** Its distinct values across all 814 rows:

| value | rows |
|---|---|
| **`[⚠️ NEW FROM SCRAPER]`** | **100** |
| `scroll_lazy` | 7 |

🔎 This is the Sheet's Venues column L collision the scraper's own comment warns about at `:1799-1802` — *"column L is also read as the venue's scraper STRATEGY, so a marker there is read as a strategy name if a URL is ever added to the row"* — mirrored into the database by the May migration.

**It does not bite today**: 🧪 all 100 marker rows have a null `schedule_url`, so none is a site, and 🧪 **all 7 real venue sites agree perfectly with the Sheet on url, instructions AND strategy** (verified field by field). 🔴 **But the moment a venue with a marker gains a `schedule_url`, a DB-sourced site list hands `[⚠️ NEW FROM SCRAPER]` to `STRATEGIES[site.strategy]`, which falls back to `default` — silently scraping with the wrong strategy.** Clean the column before `MATCH_FROM`/config moves.

---

## 6. RECOMMENDATION — how to sequence this

**Option A — widen the pass (recommended).** Move the site list *and* its two config columns together as one switch, because they are one decision. 🧪 The data supports it: `ai_instructions` **30/30 agree**, `scraper_strategy` **41/41 agree** among resolvable rows, and the 7 venue sites agree on every field. **Preconditions:** clean `venues.scraper_strategy` (§5); settle the La Piazza duplicate rule (§1); decide `nullif`-vs-`coalesce` on empty strings.

**Option B — keep the pass narrow and rename it.** If the scope limit is firm, the switch that *can* ship alone is **`SITE_URLS_FROM`** — the DB supplies only `url` for rows the **Sheet** already says are sites. That is genuinely testable and genuinely small, but ⚠️ **it does not reduce the Sheet dependency at all**, so it buys nothing toward step 8.

**Either way, `aliases` is genuinely separable** — 🔎 it feeds `validTrucks` for truck *matching*, not the site list, and belongs with `MATCH_FROM`.

**Nothing changes until deployed and the flag is set in a workflow — and nothing was written here at all**, so as things stand the next `daily_scrape.yml` at `0 6 * * *` runs precisely what ran this morning, with `EXCLUSIONS_FROM` unset and therefore `sheet`.

**No span of the prompt arrived garbled, and no instruction contradicted another** — the scope limit and the goal were in tension, and the prompt anticipated exactly that with an instruction to stop, which is what I did.
