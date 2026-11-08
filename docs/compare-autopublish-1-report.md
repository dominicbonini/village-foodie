# compare-autopublish-1: comparison pages publish themselves

*7 November 2026. Nothing is deployed. Five migrations were run (§9). The new code reaches the site and the checker only when main is pushed.*

## Summary

- **Built, as you decided (Q1 = C, Q2 = A + C, Q3 = A, addendum A–F):**
  - **Live rule:** a country's comparison page is live when country_settings says live, OR when auto-publish is on, the automatic evaluation says live, and you have not set it Off.
  - **Where the switch lives:** a new table, `comparison_publish`. No protected table was written.
  - **AE:** never auto-published.
- **The one-off run** used the same code the checker now runs after every run, on a read-only export, and was applied as one guarded migration.
  - **Findings:** all 5,661 pending findings of competitors on a comparison page were decided automatically: 4,289 accepted, 1,372 rejected, 0 held.
  - **Live: GB (4 competitors) and DE (2).** The other English and German countries have fewer than 2 competitors whose price both checks confirmed (§4).
- **⚠️ Nothing is public yet.** The live site runs the old code, which reads country_settings only. GB and DE go live when you push main.
- **⚠️ The semi-deep check waits for your push** (73 competitors, ≈ $5.90, at most ≈ $17.50). The code on GitHub tonight would not second-check unchanged prices, and that second check is what auto-publishing needs (§5).
- **⚠️ Addendum A applied as written:** classifications were accepted unless you had set the category. **25 competitors became restaurant tools and 7 became not relevant** (§3). That changes who is shown.
- **Live re-measure (UK, read-only):** LCP medians are better on all five pages.
  - /uk: 5.45 s → 3.02 s;
  - /about: 4.32 s → 1.89 s.
  - First byte: every response now comes from Vercel's cache (HIT or STALE). Before, it was MISS with no-store (§7).
- **Checks:**
  - `compare-autopublish-1` passes **75/75**;
  - `compare-suits-1` is re-pinned for addendum C;
  - the typecheck is clean;
  - full sweep: 196 of 201 at first. The 5 failures are explained in §8: three re-pinned for this brief's own changes, one browser timeout that passed on re-run, one flaky timing test in the ordering code (untouched here);
  - other pages: 229 of 280 byte-identical, 34 identical apart from stream order, 17 changed only as intended (§8.1).

## 1 · What was built

| Part | Where |
|---|---|
| The rules (pure): findings, a country's verdict, the weekly summary | `lib/comparison-publish.ts` |
| The run: decide and apply findings, save check pages, evaluate, mark, record, revalidate | `lib/comparison-publish-run.ts`, `lib/comparison-publish-store.ts` |
| After every checker run: failure counts, then the run; a failure is logged and never fails the run | `scripts/competitor-check/main.ts` |
| The live rule (switches) | `lib/comparison-flags.ts` flagsFromRows; `lib/marketing-cache.ts` |
| The page: automatic path, the evidence rule, the display rule, no website never shown, "Report an error" | `lib/comparison.ts`, `app/(public)/[country]/[section]/[slug]/page.tsx` |
| Admin › Countries › Comparison pages: auto-publish switch and verdict; an explicit Off is recorded | `components/admin/ComparisonStatusPanel.tsx`, `app/api/admin/countries/comparison/route.ts` |
| Admin › Pricing check: "auto-verified" shown apart from yours; "Undo verified" blocks the automatic rules | `components/admin/PricingCheckTab.tsx`, `AutomaticChecks.tsx`, `lib/admin/*` |
| Weekly summary, Mondays 08:00 UTC | `app/api/cron/comparison-summary/route.ts`, `vercel.json` |
| Semi-deep start (once, by the new code) | `lib/competitor-check/semi-deep.ts` |

### 1.1 The rules

**Findings (addendum A, B).** Only the newest pending finding of each item is decided; older ones are rejected as replaced. Nothing needs your click.

| Finding | Accepted when | Otherwise |
|---|---|---|
| Price or plan | both checks agree (second check confirmed, quote on the page), in the country's currency, a real amount | rejected; a price move over 50% is **held** (stays pending, listed in the summary) |
| Feature "yes" / "partly" | a quote found on its page, and the URL; second check not disagreeing | rejected |
| Feature "no" | the competitor's own quote saying so, **confirmed by the second check** (the existing verifier judges quote against answer: addendum B) | rejected |
| "Not mentioned" | no quote at all | a "not mentioned" carrying a quote contradicts itself: rejected (B); it never replaces an answer with evidence |
| Classification | its quote on the page | rejected when **you set the category** |
| "Not sold in X" | both checks agree | rejected |
| New page | added to check pages | rejected when you set the check pages by hand; a page is removed only by hand |
| Anything Admin verified | — | always rejected: your row is kept |

**Publishing (§3).** A competitor is publishable when all of these hold:
- it is counted;
- it has a website (E);
- it has not failed its last 2 checks;
- its plan is publishable. That means you verified it, or, unless you un-verified it, all of the following:
  - it is current and counted;
  - it is in the country's currency;
  - it has a stated price, not marked unclear;
  - its source is on its own site;
  - both checks confirmed **this** price;
  - it was checked within its interval + 30 days.

A held price change keeps the old price while that price is within its interval; after that, the competitor is hidden. The page's four-cap (pins, hides, categories) then picks who shows. **Live needs ≥ 2 shown.**

**Cells.** An automatically published competitor's answer shows only what its evidence supports: a "yes" or "no" with its quote and page; "not mentioned" without a quote ("Not listed" under absence-means-no with complete pages). Anything else shows "Doesn't say". An answer you verified shows as it is.

**Display rule.** A feature row appears only when it has been checked for every shown competitor. A check record counts, including a checked "doesn't say"; so do a price row and a feature that doesn't apply to that competitor. An unchecked row is hidden publicly and appears by itself once filled. An admin sees it, marked. "Which suits" is built from the same rows.

**Admin wins:** hide, pin, your verify, "Undo verified" (now recorded as a block the automatic rules respect), your category, your check pages, and **Off**. Setting Off in Admin › Countries is now recorded (`admin_off`) and always wins; Admins only or Live lift it.

**Addendum C:**
- "pages complete" = the features and pricing pages read; the help centre is no longer needed;
- android and ipad are out of absence-means-no.

**Addendum D:** when a check is refused its pricing or features page, or can't find it:
- the address goes into check_urls (never when you set them by hand), so the next check reads it directly;
- the prompt now asks it to list such a page, using at most one search of the competitor's own site.

**Addendum E:** a competitor without a website is never shown (in GB: Hatches Up and Eventifood; in the US: EasyEats and RapidOrderz).

### 1.2 One checker change that matters

- **What changed:** the routine check now second-checks **every monthly price**, not only changed ones. An automatically published price needs both checks to agree.
- **Cost:** one verifier call per plan per check, ≈ $0.01–0.02 per competitor.

## 2 · Your switch (§2)

- **The table:** `comparison_publish` has one row per switched-on country.
  - Auto-publish is on for 43 countries.
  - **AE is off, held off by a database check, and the switch is refused in Admin.**
- **Where you change it:** Admin › Countries › Comparison pages. That screen now lists every English- and German-language country with:
  - your status;
  - the auto-publish checkbox;
  - "Live automatically: …" or why not;
  - what the site shows.

## 3 · The one-off run (§4, Q3 = A)

- **Export:** read-only, at 20:53 UTC.
- **Run:** in memory, by `scripts/compare-autopublish-1/oneoff.ts`, using the same functions as the checker.
- **Result:** one migration, `20261081`, with 15,671 writes in one transaction. Each write is guarded: still pending, still current, exact count. It applied without error.

**Findings decided (5,661):**

| Accepted (4,289) | n | Rejected (1,372) | n |
|---|---|---|---|
| "not mentioned" on the pages read | 1,529 | replaced by a newer check | 885 |
| page could not be read: acknowledged, nothing saved | 554 | "not mentioned" carrying a quote (B) | 134 |
| "yes", quoted | 512 | a stored answer not replaced by "not stated" | 106 |
| unchanged: date moves on | 453 | price checks did not agree | 97 |
| "partly", quoted | 399 | "no" not confirmed by the second check | 75 |
| "not stated" (no stored answer) | 315 | partly / yes without a quote on the page | 26 |
| not stated on a plan: acknowledged | 259 | older-format finding | 15 |
| new check page | 170 | Best Food Trucks' seven (B, your decision) | 7 |
| classification | 34 | couldn't confirm unchanged, other | 22 |
| "no", confirmed | 23 | could not be saved (a plan edited by an earlier accept in the same run) | 5 |
| new plan (both agree) | 17 | | |
| other | 24 | | |

- **B, applied:** Best Food Trucks' seven contradicted findings (ahead, schedule, discovery, private, cards, cardfee, domain) are rejected, with the reason recorded.
- **F, applied:** gastro25 and Grafterr are restaurant tools now.
- **⚠️ Addendum A's classifications (34 accepted).** They change who is shown:
  - **Became restaurant tools (25, gastro25 and Grafterr by F):** Bestelltheke, Bopple, Cheerfy Shop, Choice, ChowNow, Favrit, Flipdish, FoodsHero, FoxiFood, funfo, gastro25, GASTRODIGITAL, GastroDok, Grafterr, HungryHungry, Jamezz, Menu55, Order Tiger, OrderFront, Perkss, Slerp, Storekit, Weevi, Yoello, Zay-OS.
  - **Became not relevant (7)** (no longer counted anywhere): Check, Digitaste, NOQ, PAYMEZONE, Point, Yoveletta, Where The Truck (classified a marketplace, which the existing rule treats as not relevant).
  - **Confirmed as food-truck tools:** Beau Camion, Goodfynd.
  - **To reverse any of these:** set the category in Admin › Pricing check; your choice always wins from then on.
- **D, applied:** check pages were saved for 4 competitors (§6).
- **Marked:** 18 entries and 18 plans auto-verified; 2,483 answers pass the evidence rule.
- **Recorded:** 5,685 events (the first weekly summary will list them, grouped by reason).

## 4 · Per country (English and German; the 30 other languages have no comparison page yet)

**Shown** = the four-cap's choice among the publishable competitors. **Rows** = feature rows visible publicly (§4.1 gives the totals).

| Country | Live? | Shown | Rows | Held back, and why |
|---|---|---|---|---|
| **GB** | **live** | Aphelios, Ordea, Storekit, Flipdish | 28 | Beat The Queue, Weevi, What The Truck: price marked unclear · Grafterr, Order Tiger, Perkss, Slerp: price not confirmed by both checks · Yoello: plan hidden · NOQ: not relevant · Hatches Up, Eventifood: no website |
| **DE** | **live** | GASTRODIGITAL, GastroDok | 29 | gastro25, FoxiFood, Bestelltheke, FoodsHero: price not confirmed by both checks · OrderFront, Jamezz: plan hidden |
| US | no: 1 publishable | (Food Truck ONE) | 27 (preview) | 15 with the price not confirmed by both checks (BFT, ChowNow, Food Truck Pub, Goodfynd, Homegrown, Hotplate, Menufy, Moonrise, Outbites, Owner.com, The Foody Gram, Where's The Foodtruck, Zay-OS…) · 7 plans hidden · EasyEats, RapidOrderz: no website |
| AU | no: 1 | (Bopple) | — | 4 plans hidden · Ordering.co: price in USD · Where The Truck: not relevant |
| IE | no: 0 | — | — | Click & Collection, Flipdish, Order Tiger: not confirmed · GloriaFood: plan closed |
| CA | no: 0 | — | — | Food Truck Pub: price in USD · 3 plans hidden |
| NZ | no: 0 | — | — | Bopple, HungryTrucks: not confirmed · 2 plans hidden |
| SG | no: 0 | — | — | Klikit, Oddle: not confirmed · Take App: price in USD |
| AT | no: 0 | — | — | GASTRODIGITAL: not confirmed in AT · GastroOnline & Winorder: plan hidden |
| CH, LI, GI, MT | no | — | — | 1, 1, 0 and 0 competitors: they wait for competitors (Q2) |
| AE | never | — | — | never auto-published |

**The main blocker is "price not confirmed by both checks".**
- Only 90 confirmed price findings exist, because the routine check never second-checked an unchanged price.
- The semi-deep check runs on the new code, which second-checks every monthly price, so most of these should qualify within one to three nights of your push.
- "Plan hidden" and "price in USD" are data matters for Admin.

### 4.1 The rendered public pages (after the one-off)

- **How they were rendered:** by the real page route and twins from a read-only export, with nothing overridden (`scripts/compare-autopublish-1-render.cjs`; output in the scratchpad).
- **What appears on each:** the "Report an error" link and the new methodology.

| Country | View | Shown | Rows | "Which suits" answers |
|---|---|---|---|---|
| GB | **public (anonymous visitor)** | HatchGrab, Aphelios, Ordea, Storekit, Flipdish | 28 of 29 (hidden: "allergens", which no check has asked about yet) | 2: offline, strength (delivery) |
| DE | **public (anonymous visitor)** | HatchGrab, GASTRODIGITAL, GastroDok | 29 of 30 (hidden: "allergens") | 4: price at low and high volume, offline, strength (delivery) |
| US | not live (404); shown: admin preview's public view | HatchGrab, Food Truck ONE | 27 of 28 (hidden: "allergens") | 5 |

GB public table, as rendered before the page's tie-break was aligned with the evaluation's (columns HatchGrab | Aphelios | Ordea | Flipdish | Storekit; Storekit and Flipdish now swap places; first rows):

```
preorder   Yes | Not stated | Not stated | Not mentioned on their website | Not stated
capacity   Yes | Not stated | Yes, per-slot capacity limits | Not mentioned on their website | Yes, slot limits set by the business …
monthly    Yes, £0 to £69 a month | Yes, £29.99 a month | Yes, £0 a month | Yes, £139 a month excl. VAT | Yes, £0 a month excl. VAT
perorder   Yes, 0.99% … | No, none | Yes, 3% per order | No, none | No, none
trial      Yes, 3 months free | Yes, 14-day free trial | Partly, free plan … | Not mentioned on their website | Not mentioned on their website
```

**Seen in the render, not changed:**
- **English notes on the German page:** many competitor notes are in English (e.g. GastroDok's), as the checker writes them.
- **US plans marked "excl. VAT".** Some US plans say "excl. VAT".

Both predate this work.

## 5 · The semi-deep check (Q2 = A + C)

- **The list:** 73 competitors, being each switched-on country's shown four except the UAE's, ordered GB, US, IE, AU, CA, NZ, then SG, DE, AT, LI, then the rest by code. It is stored in `competitor_check_settings.semi_deep` (migration `20261082`, status "waiting").
- **It starts by itself** on the checker's first run after your push. It sets ordinary "Check now" requests one second apart, in that order, and makes their core and commercial features due where the last check has no page record. After that come the normal routine run, queue and $8 daily cap.
- **Why it waits:**
  - the checker runs whatever is on GitHub main;
  - tonight's code would not second-check unchanged prices, so the semi-deep check would not make prices publishable;
  - nothing extra is checked tonight.
- **Cost:**
  - **likely:** 73 × ($0.061 routine average + ≈ $0.02 price second checks) **≈ $5.90**;
  - **worst case:** ≈ $17.50, using the dearest run's $0.209 a check;
  - both under $25;
  - at the $8 daily cap: one night likely, at most three. This month's spend so far is $15.36 of $90.
- **The actual cost per night** will be in the checker's run rows and its email. I could not measure it before the push.
- ⚠️ Migration `20261082` ran twice. My first command cut off its success line, so I ran it again. The second run rewrote the same 73-item list with a new timestamp; nothing else changed.

## 6 · Reaching the right pages (addendum D)

| Competitor | Saved to check pages | Complete pages possible next check? |
|---|---|---|
| Beat The Queue | /features, /pricing (both were refused) | yes, both pages now fetchable directly |
| Best Food Trucks | /features, /pricing (both refused) | yes, if the site serves them (its homepage was refused as `url_not_allowed`) |
| Jamezz | /pricing (refused; its features pages were read) | yes |
| QRico (MX) | /precios | MX has no comparison page yet |

- **Cost change:** one or two more pages read per check for these, a cent or less each. A search to find a missing page is at most one, within the existing search budget.
- **Help-centre reads stay off.**

## 7 · Live re-measure, UK (§6, read-only)

**Lighthouse, mobile, median of 3 cold runs** (PostHog sends blocked), against cwv-2's live "before":

| Page | LCP before | LCP now | FCP now | CLS | Performance (3 runs) |
|---|---|---|---|---|---|
| /uk | 5.45 s | **3.02 s** | 1.22 s | 0 | 80, 94, 96 |
| /uk/features | 2.94 s | **2.57 s** | 1.22 s | 0 | 97, 83, 99 |
| /uk/faq | 2.85 s | **2.71 s** | 1.21 s | 0 | 96, 96, 99 |
| /about | 4.32 s | **1.89 s** | 1.07 s | 0 | 98, 99, 100 |
| /contact | 4.46 s | **3.99 s** | 1.67 s | 0 | 87, 95, 87 |

- **FCP** was about 1.9 s on every page before; it is now 1.07–1.67 s.
- **The LCP element:** the hero heading on /uk. Its delay is mostly render delay; first byte is about 70 ms.

**First byte, curl, with x-vercel-cache:**

| Sample | /uk now | /uk before (cwv-2) | /uk/faq now | /uk/faq before |
|---|---|---|---|---|
| cold 1 | 0.11 s HIT | 1.03 s MISS | 0.10 s HIT | 0.66 s MISS |
| cold 2 | 0.68 s HIT | 1.25 s MISS | 0.09 s STALE | 0.49 s MISS |
| cold 3 | 0.27 s STALE | 1.34 s MISS | 0.12 s STALE | 0.54 s MISS |
| cold 4 | 0.35 s STALE | 0.78 s MISS | 0.10 s STALE | 0.30 s MISS |
| cold 5 | 1.38 s STALE | 0.53 s MISS | 0.26 s STALE | 0.22 s MISS |
| **cold median** | **0.35 s** | 1.03 s | **0.10 s** | 0.49 s |
| warm (5) | 0.07, 0.12, 0.08, 0.07, 0.08 s (HIT) · median **0.08 s** | — | 0.08, 0.07, 0.11, 0.09, 0.24 s · median **0.09 s** | — |

- **Before:** every response was MISS with private, no-store.
- **Now:** every response is served from Vercel's edge cache (HIT, or STALE while it refreshes), `public, max-age=0, must-revalidate`.
- **Sampling:** the cold samples were meant to be 15 minutes apart. The machine slept between some of them: they were taken at 20:42, 21:22, 21:45, 23:01 and 03:05 UTC. The one slow STALE (1.38 s at 03:05) came after the longest gap.

## 8 · Proofs (§7)

- **`scripts/compare-autopublish-1.cjs`: 75/75.** It covers:
  - every finding rule;
  - each publish rule;
  - ≥ 2 to go live;
  - AE never live;
  - no website never shown;
  - both take-downs;
  - the held price;
  - Admin's verify, undo, pin, hide, category and Off winning;
  - the switches;
  - the evidence and display rules;
  - pages complete (C);
  - the run on in-memory stores (applied through acceptFinding, check pages saved, marks, revalidate called on a change and not otherwise);
  - the weekly summary (and skipped when nothing changed);
  - the real page route on fixtures (auto-published DE page public, unchecked row hidden, "Fehler melden", methodology, twins, Off → 404);
  - the source checks.
- **Newer check wins:** `compare-suits-1` (re-pinned in §1 of this brief, both directions).
- **Re-pinned for this brief only:**
  - `scripts/compare-suits-1.cjs`: two help-centre tests now expect "Not listed" (addendum C);
  - `scripts/_render-kit.cjs`: the stand-in's `.range()` now pages (it was a no-op, so a read of more than 1,000 rows looped). Identical for every fixture under 1,000 rows.
- **Typecheck:** clean.
- **Full sweep** (`node scripts/run-harnesses.cjs`, 201 listed): **196 passed, 5 failed.** The 5:

| Harness | Why | Now |
|---|---|---|
| `compare-de-1` | its fixtures have no check records, so the display rule hid their rows | **re-pinned:** `_compare-de-1-fixtures.cjs` gives each fixture competitor a check record for every feature. 93/93 |
| `cwv-2` | it compares every language file with its baseline commit; this brief's words changed 29 files | **re-pinned:** this brief's keys are ignored there (and the check made faster). 43/43 |
| `contact-1` | the form now has 4 topics, 31 form keys, and the email's English topic names include the new one | **re-pinned:** 191/191 |
| `partners-1` | a browser `waitForFunction` timeout | passed on re-run, unchanged |
| `add-order-refresh-inputs` | a timing-based "broken variant must fail" test: a different variant slipped through on each run (V3, then V2) | **still failing, on different checks each run** (a third, idle run failed four real-order assertions). Neither its helpers nor the components it compiles changed in this brief, and nothing it loads imports what changed. It passed in the 6 November sweep. Flagged, not re-pinned |

The harnesses that use the changed fixture were re-run: compare-suits-1 72/72, competitor-features-2 79/79, faq-3, tidy-2 44/44, plus messages-split and messages-parity. All pass.

### 8.1 Other pages, before and after (built and served)

- **Method:** the 280 public pages, plus their stylesheets, were saved from a production build of the code before this brief (the work stashed) and from one with it. Both were served locally against the same database.
- **Stylesheets:** identical.
- **Statuses and redirects:** identical.

| Result | Pages |
|---|---|
| Byte-identical (build names aside) | 229 |
| Identical apart from the order Next streams its page data | 34 |
| Changed, only as intended | 17 |

The 17, each checked:
- **/uk, /uk/features, /uk/faq, /uk/compare, /about, /privacy, /terms, /country-terms:** one addition, the footer's "Compare · Ordering system comparison" column, because the UK page is now live.
- **The six /de pages:** the same, "Vergleich · Bestellsystem-Vergleich".
- **/contact:** that footer column, and the new topic option "A correction to a comparison page".
- **/sitemap.xml and /llms.txt:** the two live comparison pages added.

- **Response times:** on the new build, /sitemap.xml answers in 3.7 s and /llms.txt in 1.2 s.
- **The two pages for an anonymous visitor:**
  - /uk/comparison/food-truck-ordering-system answers 200 in 1.0 s;
  - /de/vergleich/foodtruck-bestellsystem answers 200 in 0.65 s.

## 9 · Migrations (SQL and verify results were shown in chat when run)

| File | What | Verified |
|---|---|---|
| `20261078_compare_autopublish_1.sql` | `comparison_publish`, `comparison_publish_events`; `auto_verified_at` on plans, answers and entries; finding `auto_reviewed`/`auto_reason`; competitor `check_failures`, `check_urls_by`; android and ipad out of absence-means-no; publish rows; 108 entries for 34 countries (guard 108) | 44 rows (AE only off); 154 entries in 37 countries; country_settings unchanged |
| `20261079_…_blocked.sql` | `auto_blocked` on entries, plans and answers | 3 columns, default false |
| `20261080_…_contact_topic.sql` | contact_messages.topic may be 'comparison' | the check lists question, account, comparison, other |
| `20261081_…_oneoff.sql` | the one-off run (generated, 15,671 guarded writes) | 4,289 accepted + 1,372 rejected automatically, 0 pending in scope, GB and DE live, 18 / 18 / 2,483 marks |
| `20261082_…_semi_deep.sql` | the semi-deep list | 73, waiting; only 1 competitor requested (Hatches Up, from before) |

## 10 · Things you need to do or know

1. **Push main** to make GB and DE public and start the semi-deep check. Until then the site shows nothing new.
2. **Add `REVALIDATE_SECRET` as a GitHub Actions secret** (repository secrets do not have it).
   - Without it, the checker's publish step logs a warning and the pages catch up within 5 minutes.
   - I did not read the value: it is in your local env file, which I may not open.
3. **Review §3's classifications.** Addendum A applied them all; set a category in Admin to keep any competitor where you want it.
4. **"Plan hidden" and "price in USD"** competitors (§4) can only be fixed in Admin.
5. **The first weekly summary will be long** (5,661 findings, grouped by reason). After that it covers one week's changes.

## 11 · Files and commits

| Commit | What |
|---|---|
| `a54f0ddc`, `0b92e6e4`, `3c716047`, `9672eddf`, `f41360b3` | the five migrations |
| this commit | the code, words and harnesses (below) and this report |

- **Code:**
  - `lib/comparison-publish*.ts`, `lib/comparison*.ts`;
  - `lib/competitor-check/{checker,prompts,semi-deep}.ts`;
  - `lib/admin/{pricing-check-actions,pricing-check-store,feature-actions}.ts`;
  - `lib/{pricing-check,contact,contact-server,marketing-cache}.ts`;
  - `scripts/competitor-check/main.ts`;
  - the page;
  - the Admin countries route;
  - the cron route;
  - three Admin components;
  - `vercel.json`;
  - the workflow.
- **Words:**
  - `contactPage.form.topics.comparison` and `comparisonSuits.method.notListed` in 29 language files, with back-translations;
  - the comparison methodology and admin words (en, de);
  - `messages/ns/*` regenerated.
- **Harnesses:**
  - `scripts/compare-autopublish-1.cjs` (and `compare-autopublish-1/{memory,oneoff}.ts`);
  - `scripts/compare-autopublish-1-render.cjs`;
  - `harnesses.json`.
- **Re-pinned:** `scripts/compare-suits-1.cjs`, `scripts/_compare-de-1-fixtures.cjs`, `scripts/cwv-2.cjs`, `scripts/contact-1.cjs`, `scripts/_render-kit.cjs` (`.range()`).

No truck, order, payment or `outreach_templates` row was touched, and no `.env*` file was opened. No span of the brief arrived garbled.
