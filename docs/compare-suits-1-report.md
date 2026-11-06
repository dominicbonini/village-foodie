# compare-suits-1: at most four competitors, "not listed", and "Which suits your food truck?"

*6 November 2026. Nothing is deployed. One migration was run (§2). Every other database access was a read.*

## Status

- **Committed on `main`:**
  - the migration in `721e514f`;
  - code, translations and harnesses in `9f3a7096`;
  - this report in the commit after it.
- **Your decisions:**
  - **Q1 = A:** no new features. `options` stays exactly as Admin set it on 4 November.
  - **Q2 = B:** unverified comparison entries for GB and US, the four chosen by the new rule, and the UK screenshots from that real data, labelled "Admin preview — unverified".
  - **The checker:** it records the pages each check read, and a "no" keeps its quote and page. Existing answers gain this at their next scheduled check, with no re-check now. The help-centre read is **off**; its cost is in §4.4.

| Item | Outcome |
|---|---|
| At most four per country | Done (§3). Pin and hide per entry, and category per competitor, in Admin › Pricing check |
| GB and US entries | 16 and 22 created, unverified. Shown in the admin preview: GB Aphelios, Beat The Queue, Grafterr, Hatches Up; US Best Food Trucks (BFT), Food Truck ONE, Food Truck Pub, Goodfynd; DE gastro25, GastroDok, FoxiFood, Jamezz |
| Absence means no | Flags set (§2.2). "Not listed" is a separate state; the raw answer is never changed. **0 cells today, before and after** (§4) |
| Pages each check read | Recorded from the next check on (§4.2) |
| "Which suits your food truck?" | Generated from checked data, in all 28 language bases and en-GB (§5) |
| Methodology | The two new sentences, after every existing one (§5.4) |
| Proof | `scripts/compare-suits-1.cjs` 70/0 · 279 of 280 other pages identical, the 280th only by its per-request form token · typecheck clean · sweep 198 / 199, the one failure (tidy-1) also failing at HEAD (§8) |

## 1 · What the diagnosis found (from my first report, still true)

- **No comparison page is live.** DE is `admin` (admins only); every other country is `off`.
- **No competitor is public anywhere.** No entry, entry plan or competitor's features are verified.
- **None of the 49 stored "no" answers has a quote.** Under the new rules, none counts as a quoted "no".
- **Nothing recorded which pages a check read**, until this change.
- **No marketplace is among the competitors.** The classifier files marketplaces as not relevant, so situation 8 (commission) cannot show yet.

## 2 · The migration (`supabase/migrations/20261075_compare_suits_1.sql`, run with `scripts/db-migrate.cjs`)

> db-migrate: supabase/migrations/20261075_compare_suits_1.sql · sha256 cfd638e165dca2df · committed at 721e514f
> db-migrate: … applied — one transaction, no error

It did not refresh the live site's marketing cache: `REVALIDATE_SECRET` is not set here. That doesn't matter, because comparison pages are not cached (§5.5).

### 2.1 New columns (no protected table)

| Table | Column | Default | Who writes it |
|---|---|---|---|
| `comparison_entries` | `pinned`, `hidden` | false | Admin only |
| `competitors` | `category` (food_truck / general_pos / restaurant / marketplace), `category_by` (auto / admin) | null | Filled from the checker's focus where clear. Admin's choice is marked `admin` and never overwritten |
| `comparison_features` | `never_competitor_strength`, `absence_means_no` | false | Admin only. The importer and the checker never write them |
| `competitor_feature_checks` | `pages_checked` (jsonb) | null | The checker, from its next check |
| `competitor_check_settings` | `pass_fetch_help` | false | Admin: the help-centre read, off |

### 2.2 Settings and data

- **`never_competitor_strength` = true:** `cardfee`, `cards`, `fiscal`, `hardware`, `paymethods`, `terminal`. These are the card-fee, online card payment, certified till, supplied hardware, payment-method and card-reader rows.
- **`absence_means_no` = true:** `android`, `delivery`, `domain`, `ipad`, `kds`, `loyalty`, `perorder`, `qr`, `schedule`, `social`, `whatsapp`. Every other feature stays false.
  - **There is no gift-card feature**, so that one has nothing to attach to.
  - **`perorder` gets the flag as briefed, but it has no effect.** Its competitor side comes from the plan, not from answers.
- **Category:**
  - filled: 60 `food_truck`, 6 `general_pos`, 64 `restaurant`;
  - **78 left null because unsure:** Hotplate (pop-up), the 5 street-food-market operators, and 72 with no focus, mostly candidates.
  - **The 3 null competitors with entries are Eventifood (GB), EasyEats and RapidOrderz (US).** They rank after restaurant tools until you set them.
- **GB and US entries:** 16 (GB) and 22 (US), unverified.
  - Each shows the competitor's cheapest current priced plan with status "counted", else its first current plan.
  - Sort order is alphabetical, from 101.

### 2.3 The verify query, as run (read-only)

| Check | Result |
|---|---|
| entries per country | DE=8, GB=16, US=22 |
| pinned / hidden | 0 pinned, 0 hidden |
| never_competitor_strength | cardfee, cards, fiscal, hardware, paymethods, terminal |
| absence_means_no | android, delivery, domain, ipad, kds, loyalty, perorder, qr, schedule, social, whatsapp |
| category | food_truck=60, general_pos=6, restaurant=64, null=78 |
| pass_fetch_help | false |
| feature checks with pages | 0 of 3230 (they gain them at their next check) |
| GB/US entries without a plan | 0 |

## 3 · At most four per country

**The rule** (`lib/comparison-selection.ts`, one function used by the page, both twins, Admin and the harness):
1. hidden never shows;
2. pinned first;
3. then verified pricing (the entry's plan is verified);
4. then category: food_truck, then general_pos, then marketplace, then restaurant, then not known;
5. ties go by the number of verified answers in that country, then the entry order, then the name;
6. **four at most.**

The rest stay on the list and are still checked by the checker; they are only not shown.

**Public versus admin:**
- **The public view** applies the rule to entries that are already public: entry, plan and features verified, the existing rule. A pinned but unverified entry is still not public.
- **An admin's full view** applies the rule to every entry, so it shows the four the page will show once they are verified.

**Shown sets, before and after:**

| Country | Public, before → after | Admin view, before | Admin view, after |
|---|---|---|---|
| GB | 0 → 0 | no entries | Aphelios, Beat The Queue, Grafterr, Hatches Up |
| US | 0 → 0 | no entries | Best Food Trucks (BFT), Food Truck ONE (Food Truck OS), Food Truck Pub, Goodfynd |
| DE | 0 → 0 | all 8 | gastro25, GastroDok, FoxiFood, Jamezz |

- **Why these four:** today nothing is pinned or verified, so the rule falls through to category. All four are food-truck tools, and among food-truck tools the tie goes to the entry order, which is alphabetical for GB and US.
- **To choose differently,** pin the ones you want.

**Admin › Pricing check › a country › Comparison page:**
- each entry has **Pin** and **Hide** checkboxes, a **category** select ("(from the check)" marks an automatic one), and an "In the four shown / Not shown (beyond four) / Hidden" badge;
- the rule is stated in one line above the list;
- pin and hide do not take an entry's verification away, unlike editing its text or plan;
- **Feature list:** each feature has **Absence means no** and **Never a competitor strength** checkboxes.

**On the page:** an admin's banner names every entry the cap leaves out, for example "Not on the page (at most four are shown): Grafterr (beyond the four)". The public never sees that line.

## 4 · "Absence means no", and the pages each check read

### 4.1 What may say "Not listed"

A competitor's `not_mentioned` answer shows as **"Not listed"** only when all of these hold:
- the feature is `absence_means_no`;
- **the check that last asked about that feature in that country** fetched the competitor's **features page AND pricing page**;
- **and** either read its **help centre**, or saw none;
- **and** no newer finding about that feature is waiting for your review.

A failed fetch, a page not asked for, or a help centre that was linked but not read all leave it **not mentioned**.

**The raw answer is never changed:**
- `competitor_feature_values` keeps `not_mentioned`; "Not listed" is worked out from the stored page record each time.
- So changing the flag or a later check changes the cell, and nothing is lost.
- The JSON twin shows `value: "not_listed"`, `raw: "not_mentioned"`, and the pages and help-centre answer behind it.

**How it reads:**

| State | Table | "Which suits" wording |
|---|---|---|
| Quoted no | No | "doesn't offer" |
| Not listed | **Not listed** (DE: Nicht aufgeführt), shown in grey, distinct from a red quoted No | "doesn't list <feature> on its website", never "doesn't have" or "doesn't offer" |
| Not mentioned | Not mentioned on their website | "website doesn't say" |

**Before and after:** the cells that say "Not listed" are **0 in GB, US and DE, both before and after**. No check has recorded its pages yet. The first ones that do will be the next scheduled checks.

### 4.2 What each check now records

The checker records this for the quick pass, the routine check and the deep check alike:
- **The model's report:** its `record_findings` tool has two new required fields:
  - `pages_checked`: each page read, with its kind (features / pricing / help / other);
  - `help_centre`: fetched / linked_not_fetched / none_found.
- **The code's check:** it compares those with what the API actually fetched in that conversation. A page the model names but never fetched is recorded as not fetched; a fetched page it did not name is "other".
- **The stored record,** on every feature that check asked about (`competitor_feature_checks.pages_checked`):
  - per page: URL, kind, ok, status, fetched_at;
  - the help-centre answer;
  - when.

**What status means:** "fetched", or the API's error code (for example `url_not_accessible`). **The web fetch tool does not give an HTTP status code**, so none can be stored. This is the one part of your request that cannot be met as worded.

**The prompts:** every check is told to read the features page and the pricing page for the country, within the existing fetch limit, and to report the help centre.

### 4.3 Every "no" keeps its quote and page

- **From the checker:** a "no" was already refused unless it carried its verbatim quote and the page it came from. Accepting a finding stores both. The harness now proves each half fails without the other.
- **The 49 older "no"s** came without quotes. They stay as they are and are treated as not known in the answers. They gain a quote only if a later check finds one.
- **A "no" set by hand** in the Admin matrix still saves without a quote. It counts as unquoted, which is never a "quoted no".

### 4.4 The help-centre read: off, and what turning it on would cost

**Last 30 days:** quick pass $1.65 (196 checks, 6.7 pages each), routine $2.22, deep $10.50. That is **$14.37 in total**, against a monthly cap of $90.

**One extra page per check, worst case:**

| Check | Extra cost per check | Checks per month | Extra per month |
|---|---|---|---|
| Quick pass | ~$0.002 (≤6,000 tokens, re-read for ~3 turns, Haiku $0.10/M input) | ≤1,200 (40 a day) | ~$2.40 |
| Deep | ~$0.007 (≤12,000 tokens, ~6 turns) | ≤450 (15 a day) | ~$3.20 |
| Routine | small | ~30 | small |
| **All** | | | **up to about $6 a month** |

- That is about 40% more than today, and still well under the cap.
- **Until it is on,** a competitor whose pages link a help centre can never be "not listed". Only those where the check saw no help centre can.
- **To turn it on:** set `competitor_check_settings.pass_fetch_help` to true. It is a setting row, not a protected table; I did not change it.

## 5 · "Which suits your food truck?"

### 5.1 How it is built

- **Placement:** below the comparison table and above the methodology, in the existing styles.
- **Layout:** the question, a one- or two-sentence answer, and "Checked <date> · Evidence".
  - The evidence opens to the rows behind the answer: each product's answer, its source link, the quote, the pages checked and the help centre.
  - For a price answer, it opens to the calculation.
- **Markup:** plain headings and paragraphs, server-rendered. **No QAPage or FAQPage** for this section; the existing FAQ's FAQPage is unchanged.
- **The twins:** the same answers appear in the Markdown twin and in the JSON twin (`suits.answers[]`, with products, date, evidence and the evidence lines).

**Which situations, and from which data:**

| # | Situation | From | Shows only when |
|---|---|---|---|
| 1 | Order ahead, pick a collection time | `preorder` row | every shown competitor is yes / quoted no / not listed / doesn't say; HatchGrab yes or no |
| 2 | Swamped at peak times | `capacity` row | same as 1 |
| 3 | Where am I? WhatsApp | `whatsapp` row | yes / quoted no / not listed only |
| 4 | Weekly location posts | `social` row | same as 3 |
| 5 | Somewhere different most days | `schedule` row | same as 3 |
| 6 | A few days a month: lowest cost | Pricing check model at **150 orders a month** | every shown column's cost is known |
| 7 | Festivals, busy events: lowest cost | Pricing check model at **2,000 orders a month** | same as 6; Unlimited is "a flat price with no per-order fee from HatchGrab" |
| 8 | No commission per order | each side's per-order fee | a marketplace is shown |
| 9 | Signal drops | HatchGrab's `offline_protection` plan switch; competitors' `offline` row | HatchGrab's switch says yes; only quoted "no"s compared, "doesn't say" allowed |
| 10 | Competitor strengths | every shown row | a shown competitor is yes and HatchGrab is no. Never a `never_competitor_strength` row, and never a price row (a set-up fee or a minimum term is not a strength). No cap |

**General rules:**
- At least one competitor must be shown for every situation except 9.
- A "partly", "not stated" or **unquoted** "no" anywhere hides the answer.
- HatchGrab appears as "HatchGrab (from Pro)" when only some plans have the feature. It is **never named as having something its data says it doesn't.**

**Situation 9's wording** is "HatchGrab **can** pause online ordering automatically when the truck loses signal". It is a van setting, off by default (`auto_pause_on_offline`), so "can" is the true sentence.

**The price answers:**
- They reuse `lib/pricing-check.ts` (Admin › Pricing check's model), with no second model.
- The volumes are its own: 150 and 2,000 orders a month, at each country's meal price × 1.3.
- **/compare's calculator** prices HatchGrab only; the competitor's fee is whatever the visitor types, so it cannot price a competitor's stored plan.
- **Included:** subscription, set-up ÷ 12, the fees the truck pays per order, extra orders.
- **Excluded,** on both sides, and stated: card processing and fees customers pay.
- **Unknown, which hides the answer:** a plan whose platform fee is inside a bundled card rate, a hidden price, or an unclear plan.
- Each calculation is in the evidence and the JSON twin: country, currency, volume, every product's plan and components, the result and the date. It is worked out per request from the stored prices, not saved to a table.

### 5.2 The wording rules, and where they are enforced

- **The words:** every sentence is a message pattern (`comparisonSuits.*`, 68 keys); names, numbers and dates are tokens.
- **The rules are in the patterns:**
  - "doesn't offer" appears only in the quoted-no patterns;
  - "doesn't list … on its website" only in the not-listed pattern;
  - "the best fit among the products compared" is the only "best";
  - "none of the other products compared lists it" only when every other shown product is a quoted or inferred no.
- **`scripts/compare-suits-1.cjs` tests each rule** (§7), in every language.
- **Languages:**
  - en-GB, plus all **28 language bases**, translated with back-translations in `docs/i18n/back/`;
  - `translation-check`: **0 structural problems** in every base;
  - **"Not listed"** in the table is `comparison.cell.not_listed`, in en-GB and de-DE, the only languages with comparison pages.

### 5.3 Rendered output: real data, admin preview, every column unverified

How these were made:
- `scripts/compare-suits-1-render.cjs` ran the **real page route and twins** on a **read-only export of the real rows**.
- GB, US and DE were set to `admin` **in the in-memory stand-in only**. In the real database GB and US are still `off`.
- **Public view of all three:** HatchGrab alone. Nothing is verified.

**GB** (page `/uk/comparison/food-truck-ordering-system`; columns Aphelios, Beat The Queue, Grafterr, Hatches Up). Only situation 9 can show: almost every GB answer is "not stated", so no comparison situation has its inputs.

> ### What happens to online orders if my signal drops?
> HatchGrab can pause online ordering automatically when the truck loses signal, so customers can’t place orders the kitchen won’t receive.
> *Checked 6 November 2026 · Evidence*: HatchGrab — Online ordering paused when the signal drops: yes, from HatchGrab’s own plans.

**US** (columns Best Food Trucks (BFT), Food Truck ONE (Food Truck OS), Food Truck Pub, Goodfynd): the two price answers and situation 9.

> ### I only trade a few days a month — which system costs the least?
> At 150 online orders a month, Best Food Trucks (BFT), Food Truck ONE (Food Truck OS), Food Truck Pub, and Goodfynd have the lowest monthly software cost among the products compared: $0 a month each. This includes the subscription, the fees charged to the truck on each order, any charge for extra orders and any set-up fee spread over 12 months; card-processing fees are not included.
> *Evidence:* 150 orders at $26 ($3,900 in sales). HatchGrab (Pro) $29; each of the four's free plan $0 (all components $0, from their stored plans).
>
> ### I do festivals and busy events — which system costs the least?
> At 2,000 online orders a month, the same four have the lowest cost, $0 a month each. HatchGrab (Unlimited) is $69.

- **Read this as unverified.** These four plans are stored as free with no fees to the truck. If any of them takes a fee the research missed, verifying its plan will change this answer.

**DE** (columns gastro25, GastroDok, FoxiFood, Jamezz), in German:

> ### Mit welchem Bestellsystem können meine Kunden vorbestellen und eine Abholzeit wählen?
> HatchGrab, gastro25, GastroDok, FoxiFood und Jamezz lassen Kunden vorbestellen und eine Abholzeit wählen.
> *Geprüft am 24. Oktober 2026 · Nachweise*
>
> ### Was passiert mit Online-Bestellungen, wenn mein Empfang abbricht?
> HatchGrab kann Online-Bestellungen automatisch pausieren, wenn der Foodtruck keinen Empfang hat, damit Kunden keine Bestellungen aufgeben können, die in der Küche nicht ankommen.

- **Not-listed cells:** 0 in all three, before and after. **Not-mentioned cells shown:** 0; the real "not mentioned" answers belong to competitors outside the four.
- **The full outputs** (page HTML, Markdown and JSON for each country, admin and public): `docs/compare-suits-1/real/`.

### 5.4 Methodology

Every existing sentence is kept. Added after them, in every language:
- "It covers up to four alternatives chosen for their relevance to food trucks and the availability of verifiable public information — not every product on the market."
- "“Not listed” means we checked the product’s features, pricing and help pages and it isn’t mentioned, for features companies normally advertise. “Doesn’t say” means not confirmed either way."

**"HatchGrab publishes this comparison." was not added,** because it is already there: "HatchGrab runs this page and is one of the vendors compared", and the byline says "Made by HatchGrab".

### 5.5 Recompute

- **No new cache.** The page and its twins read the comparison data on every request (`force-dynamic`). They are not in perf-1's tagged cache.
- **So the answers change on the next request** after any comparison change.
- **A live twin** keeps its existing one-hour CDN cache.

### 5.6 Screenshots (UK, admin preview — unverified, real data)

`docs/compare-suits-1/`:
- `uk-suits-390.png`, `uk-suits-1280.png`: the section, with the "Admin preview — unverified" label;
- `uk-table-390.png`, `uk-table-1280.png`: the table, four columns, each badged "not verified · hidden from the public". At 1280 it scrolls sideways inside its own box, as designed;
- `uk-admin-390.png`, `uk-admin-1280.png`: the full page.

## 6 · Making the UK, US and DE pages publicly live with their four

**What "verified" requires today** (`lib/comparison.ts` entryIsPublic). For each competitor:
1. **its entry** is verified ("Mark entry verified");
2. **the plan the entry shows** is verified ("Mark plan verified");
3. **its features in that country** are verified ("Mark features verified"). This stamps the competitor, and stamps every stated answer it has there in the same click;
4. and the competitor is counted: active, and not a candidate still waiting for its features check. All 12 are.

**Then the page itself:**
- Admin › Countries must set the country's comparison status to `live` (GB and US are `off`, DE `admin`);
- the page's checklist wants at least 2 verified competitors, both app flags on, no placeholder text, the VAT line, and for DE an Impressum decision.

**How much review it takes, for the four shown:**

| Country | Clicks | Stated answers to read first | Answers still "not stated" |
|---|---|---|---|
| UK | 12 (4 entries, 4 plans, 4 features) | **4** (Aphelios 0, Beat The Queue 3, Grafterr 1, Hatches Up 0) | ~88 |
| US | 12 | **6** (BFT 2, Food Truck ONE 1, Food Truck Pub 2, Goodfynd 1) | ~82 |
| DE | 12 | **11** (FoxiFood 3, gastro25 2, GastroDok 2, Jamezz 4) | ~85 |

- "Stated answers" means yes, no, partly or not mentioned on a shown feature. "Not stated" cells need no review; they show as "Not stated", which is true.
- **The plan shown is the one to check against the pricing page.**

**Quickest way:**
1. Open Admin › Pricing check, choose the country, and open its **Comparison page** panel.
2. For each of the four in the badge "In the four shown": read its answers in the matrix under the panel, which shows the stated ones with their sources.
3. Open the plan's pricing page from the plan line.
4. Click **Mark entry verified · Mark plan verified · Mark features verified**.
5. Then Admin › Countries → **live**.

That is about 15 minutes a country.

**Worth knowing:**
- **The page will mostly say "Not stated"** until the deep check reaches these competitors.
- **Pinning the four you want before verifying is cheaper** than verifying and then re-choosing.

## 7 · Proof: `scripts/compare-suits-1.cjs` (70 passed, 0 failed; registered)

1. **Selection:**
   - pinned first, then verified pricing, then category, then verified features;
   - hidden never shows, even when pinned;
   - unknown category last; never more than four;
   - the category from focus.
2. **Page record:**
   - a fetched page with its time; a failed fetch with its error code; a page named but not fetched; an unnamed page as "other";
   - the schema's two fields; the validator drops malformed pages and an unknown help-centre value;
   - an older answer without the fields is never complete; two calls merge;
   - the prompts ask for the features and pricing pages, and the help centre only when it is on;
   - a "no" without its quote, or without its page, is refused; the store and both checkers write the pages; accepting a finding keeps its quote and page.
3. **"Not listed":**
   - complete evidence gives "not listed" (with no help centre, and with one that was read);
   - each failure keeps it "not mentioned": flag off, features failed, pricing not fetched, help linked but not read, help claimed but not fetched, no record, a pending finding;
   - **the raw answer is unchanged**;
   - quoted and unquoted "no" are told apart; the country's own check wins over the every-country one.
4. **Answers:**
   - the wording per state;
   - "none of the other products compared lists it" and "best fit" only when every other is a no;
   - ties name every product;
   - unknown, partly or unquoted "no" hide the answer; none without a competitor;
   - HatchGrab is never named when its data says no; "HatchGrab (from Pro)";
   - "doesn't say" only in 1, 2 and 9;
   - situation 9 shows with HatchGrab alone, never when its switch is off, and leaves out yes and partly;
   - strengths: never a `never_competitor_strength` row or a price row; "doesn't yet" for coming soon;
   - price answers: the volume, the inclusions, card processing excluded, the Unlimited wording, a hidden answer when a cost is unknown, and the evidence components;
   - commission only with a marketplace;
   - the evidence's date and lines.
5. **Every language:**
   - every key in all 28 bases and en-GB, with en-GB's ICU arguments;
   - **no card reader, card machine, till, payment terminal or POS word in any language,** from 29 word lists supplied by the translators, matched as whole words or word starts;
   - no plain apostrophe;
   - the English never says "best overall", "the only", "doesn't have" or "unlimited capacity";
   - "doesn't offer" only in the quoted-no patterns;
   - the two methodology sentences and "Not listed".
6. **The real page route, on fixture data:**
   - at most four columns;
   - **"Nicht aufgeführt"** in the table;
   - the section between the table and the methodology;
   - no QAPage, and one FAQPage (the existing FAQ's);
   - the methodology keeps every sentence and adds the two after them;
   - the JSON twin has `not_listed` with raw `not_mentioned` and the pages;
   - the twins carry the page's questions;
   - the public view names no entry beyond the four.

## 8 · Checks

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| ESLint on every new and changed file | clean |
| `translation-check`, all 28 bases | 0 structural problems each |
| `split-messages --check` | in step (119 namespaces) |
| Every other page | **identical.** 280 pages: every country's landing, features, FAQ, compare, privacy and terms; /about, /contact and the legal pages; login, signup and the account pages; /llms.txt, the sitemap, robots; and Village Foodie. HEAD's build and this one were snapshotted against the same database. **279 are identical** once build names (chunk hashes, the build id) are set aside. **/contact differs only in its per-request form token,** which differs on every load, HEAD included. **All 8 stylesheets are byte-identical:** one Tailwind class I first used in Admin (`md:col-span-4`) would have added a rule to the shared stylesheet, so I removed it. No status or redirect changed. |
| Full sweep (`node scripts/run-harnesses.cjs`, 199 listed, this build) | **198 passed, 1 failed.** The failure, `tidy-1`, also fails at HEAD with this work stashed: its dead-code check finds `is_test` reads in the outreach routes that partners-1 changed. The first sweep's other five failures were this work's, and are fixed or re-pinned (§9) |

## 9 · Files

- **Migration:** `supabase/migrations/20261075_compare_suits_1.sql`.
- **New:**
  - `lib/comparison-selection.ts` (the four);
  - `lib/comparison-suits.ts` (the answers);
  - `scripts/compare-suits-1.cjs` (harness), `scripts/_compare-suits-1-words.cjs` (the word lists), `scripts/compare-suits-1-render.cjs` (by hand: renders from an export);
  - `lib/i18n/catalog/comparisonSuits.ts` and `messages/ns/*/comparisonSuits.json` (generated).
- **Comparison:**
  - `lib/comparison.ts` (selection, states, the section, twins);
  - `lib/comparison-features.ts` (flags, page record, states);
  - `lib/comparison-server.ts` (the page records, pending findings, benchmarks);
  - `app/[country]/[section]/[slug]/page.tsx` and `comparison.css`;
  - the twin route.
- **Admin:** `components/admin/PricingCheckTab.tsx`, `lib/admin/pricing-check-actions.ts` / `-store.ts`, `lib/admin/feature-actions.ts`, `lib/admin/competitor-check-actions.ts` (category from focus, never over Admin's), `lib/pricing-check.ts` (types).
- **Checker:** `lib/competitor-check/model.ts`, `core.ts`, `prompts.ts`, `pass.ts`, `checker.ts`, `store-supabase.ts`.
- **Words:** `messages/*.json`:
  - en-GB and the 28 bases;
  - de-DE also has `comparison.cell.not_listed` and the admin banner's three `comparison.admin.*` keys (en-GB too);
  - de-CH overrides two German questions to write "ss" for "ß", as Swiss German does.
  - `docs/i18n/back/*.json` holds the back-translations.
- **Re-pinned harnesses,** each marked "RE-PINNED (compare-suits-1)" and allowing only this change:
  - `_messages-parity-1e.cjs`: `comparisonSuits` is new wording, named as a namespace, as earlier namespaces were;
  - `compare-de-1.cjs`: an admin sees a competitor beyond the four in the banner's "not on the page" line;
  - `competitor-features-2.cjs`: cells are found by their column header, not their position; the store's upsert may sit further from the function name;
  - `faq-3.cjs`: the comparison pages may change, but must still render with their metadata; their 404s and every other page stay byte-identical. The page's only other `<details>` is the answers' evidence.
- **Evidence:** `docs/compare-suits-1/` (the six UK screenshots) and `docs/compare-suits-1/real/` (GB, US and DE page HTML, Markdown and JSON, admin and public, plus a summary).
- **Not touched:** the landing, /features, /faq and every other public page; `outreach_templates`; trucks, orders and payments; any `.env*` file.
