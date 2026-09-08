# Pimp My Fish — source investigation

**7 September 2026 · investigation and recommendation · nothing built, no table written, nothing committed**

**Marking.** 🔎 source-read · 🧪 executed. Every database call was a `select`; every network call a `GET` or a read-only GraphQL `query`. **The full scraper was not run. No table was written.**

---

## 🔴 THE ANSWER, UP FRONT: THERE IS NO SHEET EDIT TO MAKE

You asked me to tell you what to change. **Having read the site and re-read our own data, the answer is: nothing. The Sheet row is correct.**

| | |
|---|---|
| URL | ✅ `https://order.pimp-my-fish.co.uk/basket/new` — 🧪 **renders the full schedule today**, dates, times, venues **and postcodes** |
| Strategy | ✅ `scroll_lazy` — 🧪 **not empty**, and 🧪 demonstrably the right one for this page |
| Extraction | ✅ 🧪 the scraper's own prompt against that page **extracts all 9 events**, matching Hatches Up exactly |

**The configuration works. The run did not.** Details below, including two corrections to my own last report.

---

## 🔴 TWO CORRECTIONS TO `docs/hatches-up-source-report.md`

**1. "The URL is an ordering basket, not a schedule page" — WRONG, and you were right to push back.** 🧪 `https://order.pimp-my-fish.co.uk/basket/new` renders **1,302 characters** of exactly the schedule we want:

```
SEPT 08  Mandeville Hall Burwell
Tuesday 8 September, 17:00 until 19:45
Reach Road, Burwell, Cambridge CB25 0AR   Online ordering is now open
SEPT 09  Great Shelford Memorial Hall
Wednesday 9 September, 17:00 until 19:45
Woollards Ln, Great Shelford, Cambridge CB22 5LZ   Online ordering is now open
…
```

🎯 It is a trader **landing page**, not a checkout — the server returns the **same 2,388-byte SPA shell for every path** (🧪 `/` and `/basket/new` are byte-identical), and the app then renders the collection list. The path is cosmetic.

**2. "`Strategy:` is empty" — WRONG, and it was my own truncation.** 🧪 I had printed `source` cut at 60 characters, which severed the value. The full string on **155 of 177** rows is:

```
"URL: https://order.pimp-my-fish.co.uk/basket/new | Strategy: scroll_lazy"
```

🧪 And a sweep of **all 4,231 discovery events** finds **zero** trucks with an empty strategy. **The empty-strategy theory was an artefact of my own output formatting, and it drove the framing of this task.** I should have printed the full value before drawing a conclusion from it.

---

# TASK 1 — READING THE ACTUAL SITE

## 1.1 Where the schedule lives

🎯 **The exact URL listing upcoming dates and locations is `https://order.pimp-my-fish.co.uk/` — and equally `https://order.pimp-my-fish.co.uk/basket/new`, because they are the same page.**

🧪 `https://www.pimp-my-fish.co.uk/` (the marketing site, 716 KB) has **no schedule at all** — its only outbound schedule-ish link is Facebook. **The `order.` subdomain is the right source and the current row already points at it.**

## 1.2 What it is, and how the content loads

🧪 The shell carries its own identification:

```html
<script id="hatches-up-boot">window.__HATCHES_UP__ = {"apiUrl":"https://order.pimp-my-fish.co.uk",
  "environment":"production","traderId":"trader_VHJhZGVyLzI"};</script>
```

🔴 **`order.pimp-my-fish.co.uk` is a Hatches Up white-label trader site.** 🧪 Confirmed beyond doubt: the `traderId` in their boot script — `trader_VHJhZGVyLzI` — is **byte-identical** to the trader id Hatches Up's own map returns for Pimp My Fish.

- **Loading:** an **Expo / React-Native-Web SPA**. `<body>` contains only `<div id="root"></div>` and a `<noscript>`. **Server-rendered HTML contains no schedule** — a plain HTTP fetch would see nothing usable. It needs a real browser, which is what Puppeteer gives us.
- **Not lazy-loaded on scroll, not behind a click.** 🧪 The entire list is present after first render; scrolling adds nothing. `scroll_lazy` works, but its scrolling is incidental — what matters is that it waits and reads `innerText`.

## 1.3 🔴 There IS an underlying API, on their own domain

🧪 `https://order.pimp-my-fish.co.uk/graphql` returns **HTTP 200**. It serves the same `publicCollections` query as the Hatches Up platform, and 🧪 a single POST returned Pimp My Fish's forward collections with venue titles and coordinates.

**Reading that would be more robust than rendering the page** — no browser, no scroll timing, no `innerText` parsing, no Gemini call, and it carries precise coordinates. ⚠️ It is the same third-party API discussed in the Hatches Up report, and the same commercial question applies. **Not a recommendation to adopt it here; recorded because you asked.**

## 1.4 What a scraper reading the CURRENT path actually sees

🧪 **It sees the schedule.** Loaded with Puppeteer and the `scroll_lazy` routine copied verbatim from `scripts/run-scraper.js:272-289` (module sha256 `67a5ccf7…bcbd131ed`; it cannot be imported because the file calls `main()` at import):

| URL | `innerText` | Date tokens |
|---|---|---|
| `order.pimp-my-fish.co.uk/basket/new` | **1,302 chars** | Tuesday 8 · Wednesday 9 · Thursday 10 · Friday 11 · Saturday 12 |
| `order.pimp-my-fish.co.uk/` | **1,302 chars** (identical) | same |
| `www.pimp-my-fish.co.uk/` | 2,483 chars | **none** |

Well above the scraper's 50-character floor. **It would not be skipped as an empty page.**

---

# TASK 2 — WHICH STRATEGY

🔎 The seven the pipeline supports (`scripts/run-scraper.js:34-42`):

| Strategy | What it does |
|---|---|
| `scroll_lazy` *(also `default`)* | `performModernScroll` — scrolls in 150 px steps to 1.5× page height (15 s cap), waits 3 s, returns `document.body.innerText` |
| `click_next` | `performButtonHunt` — reads the page, then clicks "next / load more / older entries" up to 4× and concatenates |
| `frames` | `performFrameDump` — `page.content()` plus every iframe's `innerText`; ⚠️ swallows all errors and can return `""` silently |
| `scrape_rules` | `performExpandAndScrape` — clicks each weekday heading in turn, accumulating state after each click; then rule-extraction |
| `manual` | **No page load at all.** The `ai_instructions` cell becomes the input; recurring rules |
| `manual_single` | Same, but one-off dates |
| *(comma-separated)* | 🔎 A cell may list several, producing one scrape entry per strategy |

🎯 **`scroll_lazy` is correct for this site, and I am saying that from the page, not from the truck record.** The content is fully present after render and there is nothing to click and no iframe; what the page needs is *time to render*, which `scroll_lazy` supplies via its 3-second post-scroll wait. 🧪 Proven: 1,302 characters of schedule returned.

⚠️ **Its correctness is incidental, though.** `scroll_lazy` succeeds here because it happens to wait, not because it scrolls. If the SPA ever renders more slowly than ~8 s, this strategy has no explicit wait-for-content and would return the shell. **A `wait_for_selector`-style strategy would be the honest fit — the pipeline has none.**

`click_next` would be wrong (nothing to click), `frames` wrong (no iframe, and it fails silently), `manual`/`manual_single` wrong (they never load the page), `scrape_rules` wrong (these are dated one-offs, not a weekly rule).

---

# TASK 3 — PROOF, BEFORE YOU CHANGE ANYTHING

## 🔴 What I could not do

**I could not run the real scraper for one truck without risking a write.** `TARGET_NAME` (`process.argv[2]`) does scope Pass A to a single Trucks-tab row, but the run then **appends to the Sheet and upserts `discovery_events`**. There is no dry-run flag. Per your instruction I stopped rather than write.

**What I did instead**, all read-only: loaded the page with Puppeteer using `performModernScroll` copied verbatim from source, then sent the result through the scraper's **own** one-off-event prompt (`run-scraper.js:617-654`) on its **own** model config (`gemini-2.5-flash-lite`, `temperature: 0`, JSON mode). No database call, no Sheet call.

## 🎯 What it extracted — 9 events

| Date | Time | Venue | Village | Notes (postcode captured) |
|---|---|---|---|---|
| 08/09 | 17:00–19:45 | Mandeville Hall | Burwell | Reach Road… **CB25 0AR** |
| 09/09 | 17:00–19:45 | Great Shelford Memorial Hall | Great Shelford | Woollards Ln… **CB22 5LZ** |
| 09/09 | 17:15–19:45 | Great Abington Post Office | Great Abington | 81 High St… **CB21 6AB** |
| 10/09 | 17:00–19:45 | Great Bradley village hall | Great Bradley | The St… **CB8 9LH** |
| 10/09 | 17:30–20:15 | Affleck Arms | Dalham | Brookside… **CB8 8TG** |
| 11/09 | 12:00–13:45 | FoodPark CB1 | Cambridge | 3/4 Station Square **CB1 2GB** |
| 11/09 | 17:00–19:45 | Fordham British Legion | Fordham | 44 Church St… **CB7 5NJ** |
| 11/09 | 17:00–19:45 | King Bill IV Pub | Histon | 8 Church St… **CB24 9EP** |
| 12/09 | 17:00–19:45 | Wylde Skye | Linton | Unit 8A, The Grip… |

## Against Hatches Up's 9

🎯 **They match — same nine events, same venues, same dates.** Times differ by up to 15 minutes (HU 16:45, site 17:00) because HU publishes the *ordering window* and the page publishes the *trading window*.

🎯 **Ours is the better record**, and I say that against my own last report: the page yields **full street addresses with postcodes**, which HU does not expose at all. Given the geocoder work, a postcode is worth more than a coordinate.

*Failure mode if this proved nothing:* if I had built my own prompt rather than the scraper's, a success would say nothing about the pipeline. The prompt and model config are copied from source, and the page text came from the scraper's own strategy routine.

---

# TASK 4 — THE SHEET EDIT

## 🔴 There isn't one. Verify, don't change.

Every value is already correct. What I would ask you to **confirm still exists** — not alter — in the **Trucks** tab, on the **Pimp My Fish** row:

| Column | Field | Value that must be there |
|---|---|---|
| **A** | Truck Name | `Pimp My FIsh` ⚠️ note the capital **I** — see below |
| **I** *(`row[8]`)* | Scrape URL | `https://order.pimp-my-fish.co.uk/basket/new` |
| **P** *(`row[15]`)* | Strategy | `scroll_lazy` |
| **O** *(`row[14]`)* | AI instructions | (may be blank — blank is fine) |

🔎 Column letters derived from the read range `Trucks!A2:T` and the indices in `run-scraper.js:466-470`.

🔴 **The single most likely cause is that this row no longer exists, or its URL cell was cleared, some time after 4 September** — because everything downstream of it demonstrably works today. **Look at the row first. If it is intact and unchanged, the fault is in the run, not the Sheet, and no edit will fix it.**

⚠️ **One genuine inconsistency worth tidying** (not the cause): the Sheet's truck name is `Pimp My FIsh` (capital I), while `discovery_trucks.name` is `Pimp My Fish`. Harmless today — every join normalises case — but it is why the two tables look like different trucks at a glance.

## 🔴 Every other truck — swept

🧪 Across all **4,231** discovery events, deriving each truck's URL and strategy from its `source` string:

**Trucks with an empty strategy: ZERO.** The defect I hypothesised does not exist anywhere.

**Trucks whose source URL is a basket/cart/checkout path: 3 — and this is the control that settles it:**

| Truck | Future events | Last created | URL |
|---|---|---|---|
| 🔴 **Pimp My FIsh** | **0** | 2026-09-04 | `order.pimp-my-fish.co.uk/basket/new` |
| ✅ **Pizza Mondo** | **3** | **2026-09-06** | `order.pizza-mondo.co.uk/basket/new` |
| ✅ **Bonnefirebox** | **8** | 2026-08-31 | `bonnefirebox.hatchesup.app/basket/new` |

🎯 **Pizza Mondo is the same platform, the same `order.<domain>/basket/new` shape, and it produced rows on 6 September with events out to 11 September.** The URL pattern is not the fault — proven by a working example, not by argument.

🔴 **And the wider picture is worse than one truck: 52 URL-scraped trucks have zero future events**, including *Naked Fish*, *Churro Boyz*, *Wok Wraps*, *Between Buns* and *Tacoman*. 🧪 Only **44 of 175** trucks with any events have a future one. **Pimp My Fish is not an isolated failure; it is the one you happened to look at.**

### SQL — the sweep, for you to run

```sql
-- Every truck's URL + strategy, parsed from its source string, with future-event counts.
-- Empty strategy, basket-style URL, and staleness all visible in one table.
WITH parsed AS (
  SELECT truck_name,
         substring(source from 'URL:\s*(\S+)')            AS url,
         btrim(substring(source from 'Strategy:\s*(.*)$')) AS strategy,
         event_date, created_at
  FROM discovery_events
  WHERE source LIKE 'URL:%'
)
SELECT truck_name,
       url,
       strategy,
       count(*)                                            AS all_events,
       count(*) FILTER (WHERE event_date >= CURRENT_DATE)  AS future_events,
       max(event_date)                                     AS last_event_date,
       max(created_at)::date                               AS last_written,
       CURRENT_DATE - max(created_at)::date                AS days_since_written,
       (strategy IS NULL OR strategy = '')                 AS empty_strategy,
       (url ~* '/(basket|cart|checkout)(/|$)')             AS basket_style_url
FROM parsed
GROUP BY truck_name, url, strategy
ORDER BY future_events ASC, days_since_written DESC;
```

```sql
-- The Pimp My Fish class on its own: URL-scraped, nothing upcoming, and how stale.
WITH parsed AS (
  SELECT truck_name, substring(source from 'URL:\s*(\S+)') AS url, event_date, created_at
  FROM discovery_events WHERE source LIKE 'URL:%'
)
SELECT truck_name, url, count(*) AS all_events,
       max(event_date) AS last_event_date,
       max(created_at)::date AS last_written,
       CURRENT_DATE - max(created_at)::date AS days_since_written
FROM parsed
GROUP BY truck_name, url
HAVING count(*) FILTER (WHERE event_date >= CURRENT_DATE) = 0
ORDER BY days_since_written ASC, all_events DESC;
```

---

# TASK 5 — WHY NOTHING TOLD US

🔎 The discovery pass (Pass A) **writes no run log at all**. `scraper_run_log` is written only by Pass B (`recordRunAndLearn`, `recordRunFailure`), which covers the three HatchGrab operator trucks. So for the ~175 discovery trucks there is **no per-truck record of a run, a success, a failure, or a count** — everything goes to stdout in a GitHub Actions log nobody reads, and every per-site failure is caught and `continue`d.

⚠️ 🔎 My uncommitted change adds a systemic guard — the run goes red if *no* site extracts anything — but **it would not have caught this**: 23 other trucks produced rows on 6 September, so the run was healthy by that measure while Pimp My Fish silently produced nothing.

## 🎯 Recommendation — one thing: a per-truck Pass-A run log

Write one `scraper_run_log`-shaped row per site per discovery run: truck name, URL, strategy, page-text length, events extracted, events new after dedup, and a reason string on every skip path. **Build nothing now** — but that single table turns all of the following from invisible into a SQL query:

- A truck that was scraped but extracted zero → *"the page changed."*
- A truck that extracted events but added none → *"dedup; the Sheet already has them and the database does not"* — the failure mode that hid the venue outage for three months.
- A truck absent from the log entirely → *"it is no longer in the Trucks tab"* — which is my leading hypothesis here and which **nothing in the current system can distinguish from a quiet week.**

**Why this over the alternatives.** A per-truck zero-events alert is the obvious candidate, but it is a *notification* built on data that does not exist, and it would fire constantly — 52 trucks have no future events right now, most of them legitimately. A "last written" staleness query needs no new writes but 🧪 cannot tell "not scraped" from "scraped, nothing new". **The log is the thing that makes every other detector possible, and it is a handful of lines in the site loop.**

---

# THE TREE

🧪 `HEAD = 08ac368` = `origin/main`. **0 staged · 0 committed · nothing pushed · nothing deployed.** `git add -A` / `git add .` not run. **No file in the repository was created or edited except this report.** Tree: **26 modified / 85 untracked**, otherwise unchanged. **No table was written; every database call was a `select`.** Puppeteer and Gemini calls read only; working files went to `/tmp` and the session scratchpad.

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **The Google Sheet — and it is the one thing that would settle this.** Whether the Pimp My Fish row still exists, still holds that URL, and whether its Events tab already contains the 8–12 September events (which would mean dedup is suppressing them and the database can never catch up). **My "no edit needed" conclusion rests on the row being intact; I could not confirm that.**
- 🔴 **The GitHub Actions log for the 6 September run.** Every per-site failure prints there and nowhere else. Whether Pimp My Fish was scraped and failed, or was never in the site list, is recorded **only** there.
- 🔴 **Therefore I cannot name the cause** — only rule out the URL, the path, the strategy, the page, and the extraction, each by execution.
- ⚠️ **I could not run the real scraper for one truck**, because there is no dry-run mode and it writes. The proof is the scraper's strategy routine and prompt, copied verbatim and hash-anchored, not the module itself.
- ⚠️ **Why rows created 3–4 September carry same-day event dates** while August rows carry 3–5 days forward. It may be ordinary dedup or the start of the failure; distinguishing them needs the Sheet.
- ⚠️ **Whether the other 51 zero-future trucks are broken or simply idle.** They are listed for you; I did not investigate them individually.
- ⚠️ **Whether `order.pimp-my-fish.co.uk/graphql` is intended for third-party use.** Same unresolved commercial question as the Hatches Up report.
