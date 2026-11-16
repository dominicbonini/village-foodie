# trial-column-1: a free-trial column in the plan table

*16 November 2026.*

- **Words: committed.** `d839ac46` (2 new keys in en-GB and all 48 language bases) and `1661ebe5` (Finnish fix). They were committed straight away, as the brief asked, while `messages/` was clean.
- **Code: committed** in `40a66e5e` after your approval (16 November 2026), with this report and the screenshots in the next commit. Nothing is pushed or deployed.
- **No migration and no data change.** The column reads today's `plans` and `plan_features` rows.

| # | Item | Outcome |
|---|---|---|
| 1 | Where the table renders | **3 places:** /features, Manage › Billing (both today's tab and the new Billing screen), and the plans PDF. It is not on the landing pricing section, /compare or any upgrade prompt (§1). |
| 2 | When trial info left the table | **20 October 2026, Stage B** (`755c284c`). The new table showed only public plans, and the trial plan is not public (§1). |
| 3 | What a trial includes today | **3 months, every feature, in every country.** It costs nothing a month and no online order is charged a HatchGrab fee (§1). |
| 4 | The column | **Built in the shared table, from the data.** "Free trial · 3 months" is the first column. Its ticks come from the trial's own feature switches, and its money rows from the billing rule (§2). |
| 5 | Manage, a truck on its trial | **The trial column is highlighted and reads "Ends 31 Dec 2026".** Any other truck sees the same table with its own plan highlighted (§2). |
| 6 | The plans PDF | **It gets the column too** (your decision: the same table everywhere). An existing check also requires Billing and the PDF to print the same table (§2). |
| 7 | 390px and RTL | **Checked in WebKit and Chromium, in 28 languages.** No sideways scroll, and no text runs out of its column. Arabic mirrors correctly. One limit remains in 3 languages (§3). |
| 8 | Words | **2 new keys,** short and the same everywhere they appear. en-GB and fr-FR are below; all 48 bases have structural 0 in translation-check (§4). |
| 9 | Checks | **New harness `scripts/trial-column-1.cjs`:** 45/0, or 633/0 with `--shots`. 10 older harness files were re-pinned for the planned change (§5). |

## 1 · Diagnosis

**One table, one source.**
- The rows come from `lib/feature-table.ts`.
- The cells come from `lib/plan-offer.ts`, which reads only `plans`, `plan_prices` and `plan_features` through `lib/plans.ts`.
- `components/pricing/PlanTable.tsx` renders it.

**Where it renders:**
- **/<country>/features:** the `features` look (`app/(public)/(site)/features/page.tsx`).
- **Manage › Billing:** the card look. It appears in both today's Billing tab and the new Billing screen, which share one block (`compareBlock` in `app/(app)/manage/[token]/page.tsx`).
- **The plans PDF:** `lib/plans-pdf.ts`. It builds the same rows from the same data, as print HTML.

**Not there:**
- The landing pricing section shows cards; the table left the landing page on 6 October.
- /compare is a calculator plus a competitor grid.
- The upgrade prompts name one plan.
- Admin's plans table is a different, internal table.

**When trial info left, and why.**
- Before 20 October, Billing showed a "Free trial" column only to a truck on a trial, and /features had a trial column built from the old Starter/Pro/Max matrix.
- Stage B (`755c284c`, 20 October, `docs/pricing-pages-report.md`) rebuilt the table from the new data with "columns = the public plans".
- The trial plan has `is_public = false`, so it dropped out. The report says so: "a trial highlights nothing, since a trial has no column".
- **None of the old cells were brought back.** The plans and their switches have changed since then.

**What a trial includes today** (read live, 16 November):
- **Plan row:** `trial`, named "Free trial", 3 months (`trial_months`).
- **Who gets it:** it is the signup default, so every new truck starts on it, in every country (`lib/provision-truck.ts`).
- **Features:** `plan_features` has no rows for `trial`, so every feature is on. Only `payg` has switches off (`event_types`, `instagram_messenger_replies`, `schedule_graphics`, `whatsapp_replies`).
- **Price:** no `plan_prices` rows anywhere.
- **What it pays:** while trialling, a truck pays no plan fee and none of its orders is billed (`lib/billing/rules.ts` `planLevelAt`: monthly 0, no price row).
- **Per country:** no difference. Only what the trial ends into differs (Unlimited in the 165 countries that offer only Unlimited, Pay as you go elsewhere).

## 2 · What was built

**The column (one place: `lib/plan-offer.ts` `tableColumns`).**
- The trial comes first, then the plans offered in the country, as before.
- The trial is the signup-default trial plan (`offerTrialPlan`, the same rule as the trial length on every page).
- Its **feature cells** come from `tableCell`, exactly as every plan's do. So a switch turned off for the trial would show "—" there.
- Its **money cells** come from the billing rule: "Unlimited" online orders, "0%" HatchGrab fee, walk-up "Free". `scripts/trial-column-1.cjs` checks this against `planLevelAt`, so the two can't drift apart.
- There is no column when there is no trial plan, when it is inactive, or when a country offers no plan.

**The header:** the plan's name from the data ("Free trial", translated through `planNames`), then its length ("3 months"). There is no price line.

**Manage › Billing:**
- A truck on its trial has the trial as its effective plan, so that column is highlighted (the same tint and orange name the plans get).
- Its line reads **"Ends 31 Dec 2026"**: the trial end date from the plan card, in the truck's date style, with a short month so it fits the phone's column.
- A trial with no end date yet is highlighted with its length.
- Every other truck sees the same table with its own plan highlighted. The trial column shows its length.

**The PDF:** the table has the same five columns. Its cards, its banner and the "cheapest plan" bar are unchanged (still the three plans).

**The copy date:** `MARKETING_COPY_UPDATED` → 2026-11-16 (manual 35.ah-8: "part of any copy change"). It only moves the landing and /features sitemap `lastmod`.

**Files:**
- `lib/plan-offer.ts`, `components/pricing/PlanTable.tsx`, `components/pricing/plan-table.css`
- `app/(public)/(site)/landing/landing.css` (the /features table's rules only)
- `app/(app)/manage/[token]/page.tsx` (one line and its comment)
- `lib/plans-pdf.ts` (the table section)
- `lib/marketing-meta.ts`

## 3 · Phones (390px) and right-to-left

**Why the layout had to change.**
- The table is deliberately never in a sideways-scrolling box: its sticky header would stop pinning (landing.css explains why). So the brief's "horizontal behaviour" isn't available; four columns have to fit.
- The grid now lets plan columns shrink only when the row runs out of room. Where three columns fitted before, they are the same width as before.
- At 390px each column is about 63px. The name column keeps 104px (6.5rem; it was 130px on /features with three columns).

**What narrow columns needed** (all below 480px in Billing, 620px on /features; desktop and tablet are unchanged):
- **Long single words:** a word wider than its column is hyphenated in the page's language ("Unbe-grenzt", "Obegrän-sad") instead of running into the next column or off the screen.
  - English row names and cells never hyphenate; they fit whole.
  - Group headings hyphenate only long words.
- **Amounts never split inside the digits.** A break is allowed only between number and currency ("1 500 000 / Ft", "HK$ / 15,000", "329 kr/ / månad"), using invisible break marks in the text.
  - GB and US text gets no marks at all: "£29 / month" already has spaces, and "£4,000" has a one-character symbol.
- **The fee sentence** ("0.99% above £4,000") keeps its amount whole and balances its lines.
- **Smaller type:** Billing's header names and cells are a pixel smaller on phones, so "Unlimited" fits whole.

**Measured** (`scripts/trial-column-1.cjs --shots`; WebKit and Chromium; 390 and 1280; 28 languages; LTR and Arabic):
- no sideways scroll;
- no header or cell text wider than its column;
- the name column at least 100px;
- no word of the trial's own line split;
- in English, no word split anywhere.

**Screenshots:** `docs/trial-column-1/` (WebKit). /features and Billing at 390 and 1280 for GB, FR, DE, MY (Unlimited only) and AE (Arabic, right-to-left); Billing on its trial and on Pro.

**The logo in the first screenshots was a harness artefact, not the live page.**
- **What showed:** the earlier `features-*-390.png` had a white nav and "HatchGrab" as alt text in a box.
- **The cause:** the harness lays pages out from `file://`. The logo's root path (`/logos/hatchgrab-wordmark-white.svg`) pointed at the disk's root, and the nav's colour (Tailwind `bg-slate-900`) wasn't loaded.
- **The live page is right.** Deployed /uk/features (WebKit, 390px, 16 November) serves the same markup; the logo answers 200 `image/svg+xml` (8,163 bytes, the repo's file) and draws on the dark nav.
- **Fixed in the harness:** it now compiles `app/(public)/public.css` and reads root-relative assets from `public/`. The screenshots in `docs/trial-column-1/` were retaken.

**Right-to-left:** the grid mirrors on its own. In Arabic the trial column is on the right, first in reading order. Arabic and Hebrew "Ends" agree with the column's name (تنتهي, מסתיים).

⚠️ **The one limit: Bulgarian, Latvian and Lithuanian.**
- Browsers have no hyphenation dictionary for these languages.
- At 390px a few cell words wider than 63px break without a hyphen ("Безплатн / о", "Неограни / чено").
- Today's three columns (84px) fit them. Only wider columns or shorter words would cure it, and shorter words would mean rewording other keys.

## 4 · The words

Two keys in `planTable`, and both are the same everywhere they appear (/features, Billing and the PDF):

| | en-GB | fr-FR |
|---|---|---|
| `planTable.trial.length` | "{months, plural, one {# month} other {# months}}" → **3 months** | "{months, plural, one {# mois} many {# de mois} other {# mois}}" → **3 mois** |
| `planTable.trial.ends` | "Ends {date}" → **Ends 31 Dec 2026** | "Jusqu’au {date}" → **Jusqu’au 31 déc. 2026** |

- **The column's name** is the plan's own ("Free trial"; French "Essai gratuit"), already translated in every base.
- **French:** I chose "Jusqu’au" ("until") over "Se termine le": it is natural and short, and fits the phone's column.
- **Other languages:**
  - Each language's "# months" reuses that language's existing plural forms from `comparison.cell.trial`.
  - "Ends" follows each language's existing `manageBilling.trialEnds`.
  - Finnish is "3 kk": the header already says "/ kk", and "kuukautta" doesn't fit 63px.
- **Back-translations:** in `docs/i18n/back/`.
- **translation-check:** structural 0 in all 48 bases, and no flag on the new keys.
- **Insertions only:** 488 lines added and 0 removed across 146 files, so no other key moved.
- **Languages still to come:** the languages-world-3 session was told that its incoming languages need these two keys. Its handover file predates them.

## 5 · Checks

**`scripts/trial-column-1.cjs` (new): 45/0. With `--shots`: 633/0.**
- **The columns:** order, length, money, feature switches, and the cases with no trial or no plan.
- **The billing agreement:** the money cells against `planLevelAt`.
- **The real pages:** /features in GB, FR, DE, MY and AE, Billing on trial and on Pro, French and Arabic Billing.
- **The PDF:** trial column first, cards unchanged.
- **The layout:** see §3.

**Re-pinned for the planned change** (each marked "⚠️ RE-PINNED (trial-column-1)"; the shared module is `scripts/_lp-trial-column-1.cjs` with `scripts/fixtures/trial-column-1-code-edits.json`):
- `pricing-pages`: 145/0. Its expectations now include the trial's cells, and Billing for a trial truck now expects the trial column highlighted.
- `faq-4`: 100/0. With the column taken out (`tableBack`, precise), **/uk/features and /de/features are byte-identical to the old commit**, which proves nothing else on /features changed.
- `plans-data-model`: 154/0. /features through the same `tableBack`; the copy date 2026-11-16.
- `cwv-1`: 27/0; `site-chrome-1`: 35/0. landing.css edits put back exactly; the copy date re-pinned to "on or after".
- `cwv-2`: 44/0, through `_moved-paths.cjs`. The Manage edit is put back before billing-1's reverse patch.
- `country-settings-parity`: passes. Billing's table equals the PDF's (rule B3), which is why the PDF has the column.
- `language-phase-1e`: 1022/0; `language-phase-1e-tidy`: 61/0.
  - The sitemap item is registered after site-chrome-1's, in `_lp1e-named.cjs` and in 1e-tidy's own list.
  - /features' proof (`_lp-stage-b.cjs` `featuresCheck`) takes the column out first.
- `schedule-graphics-places`: 270/0. Its "no line of Manage lost" guard allowlists the old one-line `<PlanTable … />`, and its two pinned forms now end at `px={cardPx}` (the tag continues with `trialEnds`).
- `trial-column-1.cjs` itself checks that every recorded edit is still there exactly once, and that the column comes back out of /uk/features cleanly. So the anchors can't go stale unnoticed.

**Other checks:**
- **tsc:** 0 errors.
- **eslint:** clean on the changed files.
- **Related harnesses: 107 run, no failure caused by this work.** These are every registered harness that reads the table, /features, Billing, the PDF, the sitemap, landing.css or the Manage page, directly or through a shared module.
  - **101 pass** (with the re-pins above).
  - **5 fail on missing kk-KZ legal pages** (contact-1, paperwork-1, legal-languages-1, world-countries-3, tidy-1). The languages session has those in progress.
  - **1 fails as built: event-types-render.** It measures the event-types screens from a production build (`npx next build` first, as its header says), and that build is stale. It touches nothing of the plan table.

**Registered:** `trial-column-1.cjs` is in `scripts/harnesses.json`'s list and `_lp-trial-column-1.cjs` in its shared modules (after admin-speed-1 committed the file). The runner's screen passes all 225 listed files.

## 6 · Your decisions (16 November 2026)

1. **Commit:** yes. Committed in `40a66e5e`.
2. **The plans PDF:** keep the trial column, the same table everywhere.
3. **Trucks on a paid plan:** keep the trial column, with their own plan highlighted.
4. **Bulgarian, Latvian and Lithuanian at 390px:** acceptable as is.
