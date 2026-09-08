# SEO review — HatchGrab landing and the public marketing surfaces

**8 September 2026 · READ-ONLY REVIEW.** No file changed except this report. Nothing staged, committed, pushed; `git add` not run in any form. **No copy changed, no code proposed. Everything below is a recommendation.**

**Tags:** 🔎 SOURCE-READ · 🧪 EXECUTED/FETCHED · ⚠ qualified · **MEASURED** vs **JUDGEMENT** on every recommendation.

**No span of the prompt arrived garbled. No instruction contradicted another.**

⚠️ **Reviewed against the WORKING TREE, not `origin/main`** — the landing files carry the uncommitted Android go-live and the WhatsApp flag work. Where production differs, it is noted.

---

## 0. GIT STATUS

| | START | END |
|---|---|---|
| modified | **30** | **30** |
| untracked | **111** | **112** *(this report)* |
| staged | **0** | **0** |

---

# 🔴 THE HEADLINE: THE PAGE CANNOT RANK FOR ANYTHING, BECAUSE IT IS `noindex`

🔎 `app/landing/page.tsx:58`:
```ts
robots: { index: false, follow: false },
```

**Every keyword question below is downstream of that.** No metadata change, no copy change and no schema markup does anything at all while this line stands.

🔴 **And the reason given for it no longer holds.** The comment above it (`:53-57`) says:

> *"noindex RESTORED. This page is at hatchgrab.com's root but is NOT public: **the admin gate in layout.tsx is back on** while the Pizzeria Gusto testimonial is unpermissioned and the screenshots are placeholders."*

🔎 `app/landing/layout.tsx:41-45` says the opposite, and dates it:

> *"🔴 **THE GATE WAS REMOVED ON 3 SEPTEMBER 2026 — THE PAGE IS PUBLIC.** … **BOTH CONDITIONS THE GATE NAMED ARE MET**: the Pizzeria Gusto testimonial has WRITTEN PERMISSION, and the hero screenshots are REAL captures, not placeholders."*

🔴 **The two comments contradict each other, and the code agrees with the layout: there is no gate.** So the page is **public but excluded from search** — the worst of both states. Its own note says *"FLIP THIS BACK THE SAME DAY THE GATE COMES OFF, in the same commit."* **The gate came off on 3 September; the flag did not flip.**

*If this proved nothing:* a `robots` key could be overridden elsewhere in the metadata chain. 🧪 Ruled out — it is the only `robots` declaration on that route, and Next.js merges child metadata over the root layout's, so the page-level value wins.

---

## 1. STEP 1 — WHAT IS ACTUALLY ON THE PAGE

### 1.1 Indexability by route — 🧪 read from source

| route | metadata? | indexable? | note |
|---|---|---|---|
| `/landing` (= `hatchgrab.com/` via `proxy.ts`) | ✅ own | 🔴 **NO** — `index:false, follow:false` | the money page |
| `/compare` | ✅ own | 🔴 **NO** — `:51` | the cost-comparison page |
| `/contact` | ✅ own | ✅ **YES** — `:58` explicitly `index:true` | HatchGrab chrome on that host |
| `/hire` | ✅ own | ✅ yes (default) | 🔴 titled **"Hire a Food Truck \| Village Foodie"** — consumer-side |
| `/` (Village Foodie root) | ❌ **inherits root layout** | ✅ yes | 🔎 `'use client'` — **cannot export metadata at all** |
| `/trucks/[slug]` | ✅ `generateMetadata` | ✅ yes | Village Foodie brand |
| `/venues/[slug]` | ✅ `generateMetadata` | ✅ yes | Village Foodie brand |
| `/o/[slug]`, `/order/[id]`, `/domain` | ✅ | 🔴 no — correct, transactional | |

🔴 **So of the two operator-facing marketing pages, both are `noindex`. The only indexable HatchGrab-side page is `/contact`.**

### 1.2 What is missing entirely

| | |
|---|---|
| 🔴 **`sitemap.ts` / `sitemap.xml`** | 🧪 **does not exist** |
| 🔴 **`robots.ts` / `public/robots.txt`** | 🧪 **does not exist** |
| 🔴 **Structured data (JSON-LD)** | 🧪 **zero occurrences** of `application/ld+json` or `schema.org` anywhere in `app/` or `components/` |
| ⚠️ **Canonical tags** | 🧪 none declared on any route |

⚠️ 🔎 `app/layout.tsx:43-48` records a known, deliberately-unfixed issue: `metadataBase` and `og:url` point at the **apex**, which 307s to `www`. The share image was moved to an absolute host-derived URL to dodge it; **the canonical/OG host mismatch itself is untouched and is called out in the file as out of scope.**

### 1.3 Headings — working tree

```
h1  The ordering system built for food trucks.
h2  Built for food trucks, not restaurants.
h3  Kill the queue · Never promise a time you can't hit · Works on any device
h3  Never type your schedule twice · WhatsApp auto-replies · No signal? Keep serving.
h2  Get set up and start taking orders in about 15 minutes.
h3  Build your menu · Add your schedule · Share your link
h2  Everything you need, nothing you don't.
h2  Start free. Stay free, if that's all you need.
h2  Every feature, side by side.
h2  Want to see how easy setup is?
```

✅ **One `h1`, sensible hierarchy, no skipped levels.** ⚠️ The `h1` contains the category term "food trucks" but not the *product* term a buyer searches (§2).

⚠️ 🧪 One `h2` extracts as `" — the section already has"` — that is my regex catching a JSX expression, not a real heading. **Not a defect.**

### 1.4 Title and description

🔎 `app/landing/page.tsx:52` — `title: 'HatchGrab — The ordering system built for food trucks'`
🔴 **There is no `description` on this route.** It inherits the root layout's, which is brand-generic.

### 1.5 Alt text

🧪 5 images. **3 have `alt=""`** (decorative — legitimate if truly decorative, unverified). The three screenshots have genuinely descriptive alt text, e.g. *"The HatchGrab kitchen screen, showing order tickets in cook order"*. ✅ **Better than typical.**

### 1.6 🧪 KEYWORD DENSITY — visible copy only, comments stripped

**Terms used more than twice:**
```
10 free · 9 orders · 8 coming · 8 card · 8 soon · 7 time · 7 menu · 7 everything
 6 whatsapp · 6 online · 5 month · 5 ordering · 5 take · 5 schedule · 5 auto-replies
 5 kitchen · 4 upload · 4 photo · 4 customers · 4 order · 4 payment · 4 messenger
```

**Category phrases:**
```
 2 × "food truck"          0 × "street food"        0 × "mobile catering"
 0 × "EPOS"                0 × "point of sale"      0 × "POS"
 0 × "kitchen display"     0 × "KDS"                0 × "takeaway"
 1 × "pre-order"           2 × "online ordering"    2 × "ordering system"
```

🔴 **"food truck" appears TWICE on a page about food trucks — both times in headings, never in body copy.** ⚠️ **"POS" reads as 2 hits only because my first regex matched inside "Post"/"post"; the real count is zero.** I checked rather than reporting the artefact.

🔴 **"coming" ×8 and "soon" ×8** — eight coming-soon badges on the page. ⚠️ That is a content-quality signal independent of keywords: a third of the feature bullets advertise things that do not exist yet.

---

## 2. STEP 2 — THE TERMS, RESEARCHED

### 2.1 🔴 WHAT I COULD NOT GET: SEARCH VOLUME

**I have no search-volume data and I am not going to estimate any.** 🧪 I searched explicitly for UK monthly volumes on `food truck pos` / `food truck epos`; the result was that the data sits behind Google Keyword Planner, Ahrefs, SEMrush or Moz, none of which I can query. **Every "demand" statement below is inferred from how vendors and directories phrase their own pages — which is evidence of what they believe sells, not of what people type.**

### 2.2 The terms

| term | who searches it | intent | evidence |
|---|---|---|---|
| **food truck EPOS** | 🟢 **OPERATOR** | **buying** | 🧪 `whatepos.co.uk` runs *"The Ultimate Guide to Food Truck EPOS Systems"*; `rstepos.com/food-truck-epos` is a dedicated URL |
| **food truck POS** | 🟢 **OPERATOR** | **buying** | 🧪 Epos Now's page title is literally **"Food truck POS System \| Point of Sale \| Epos Now"**; GetApp UK runs a *"Food Truck POS Systems"* directory |
| **mobile catering EPOS / POS** | 🟢 **OPERATOR** | **buying** | 🧪 `whatepos.co.uk` *"Ultimate Guide to Mobile Catering EPOS Systems"*; `ycr.co.uk` *"Mobile catering POS explained: Streamline UK vendor operations"* |
| **kitchen display system / KDS** | 🟢 **OPERATOR** | **buying**, narrower | 🧪 Grafterr, Kobas, Lightspeed, Toast, Fresh KDS all run dedicated KDS pages; Fresh KDS names food trucks explicitly |
| **online ordering / pre-order** | 🟡 **BOTH** | ambiguous | ⚠️ an operator buying it and a diner placing one type nearly the same words |
| **takeaway ordering** | 🔴 **CUSTOMER** | eating | consumer-dominated |
| **street food** | 🔴 **CUSTOMER** | eating | §3 |
| **mobile catering** *(alone)* | 🟡 **MIXED** | 🧪 `kkcatering.co.uk` sells **van hire**; NCASS uses it for **starting a business** | ambiguous — see §3 |

### 2.3 🔴 EPOS vs POS — checked, not assumed

**Both are in live UK commercial use, and the market does not choose.** 🧪 Epos Now — a UK company — titles its page **"Food truck POS System | Point of Sale"** while its own brand name is EPOS. 🧪 `rstepos.com` uses **"Food Truck EPOS & POS Systems"** — both, in one H1. 🧪 `whatepos.co.uk` uses EPOS throughout.

⚠️ **So the safe answer is not "EPOS is the UK spelling, use that" — it is that a page targeting this category should contain both,** because UK vendors themselves hedge. **The page currently contains neither.**

---

## 3. STEP 3 — 🔴 THE TRAP, AND IT IS REAL

**"Street food" is a consumer search. Ranking for it would bring diners to a page selling software.**

🧪 The evidence is in how the phrase is used commercially: `britisheventcatering.co.uk/street-food-catering/` sells **catering to event organisers**; `togather.com` is *"the UK's leading destination for finding street food"* — **for people who want to eat**; NCASS uses it for people **starting a business**. 🧪 And the general intent research is unambiguous: consumer food searches carry location and immediacy signals ("near me", "best … in [city]"), while B2B software buyers use solution-specific terms.

| term | brings | belongs on |
|---|---|---|
| food truck POS / EPOS · mobile catering EPOS · KDS for food trucks | 🟢 **operators buying software** | **HatchGrab** |
| food truck ordering system · pre-order system for food trucks | 🟢 **operators** | **HatchGrab** |
| street food · street food near me · food trucks near me | 🔴 **diners** | 🔴 **Village Foodie — never HatchGrab** |
| hire a food truck / food truck catering | 🔴 **event bookers** | 🔴 **Village Foodie `/hire`** — 🧪 which already exists and is already titled for it |
| mobile catering *(unqualified)* | 🟡 **mixed** | qualify it: *"mobile catering EPOS"* → HatchGrab; bare → avoid |

🎯 **The brand split is already correct and nobody needs to change it.** 🧪 `/hire` is titled *"Hire a Food Truck | Village Foodie"* and `/trucks/[slug]`, `/venues/[slug]` are Village Foodie. **The consumer terms already have a home. The operator terms have a `noindex` page.**

⚠️ **One caution I will not overstate:** the claim that consumer traffic would "dilute" the page is a **JUDGEMENT**, not measured. High bounce from mismatched intent is a widely-held SEO belief; I have no analytics for this site to demonstrate it. **What is measured is only that the term is consumer-dominated.**

---

## 4. STEP 4 — COMPETITORS

🧪 Fetched directly:

| product | page title | H1 | terms used |
|---|---|---|---|
| **Epos Now** (UK) | *Food truck POS System \| Point of Sale \| Epos Now* | *"Stay mobile with an all-in-one food truck POS system"* | POS ✓ EPOS ✓ till ✓ food truck ✓ kitchen display ✓ online ordering ✓ |
| **Grafterr** (UK) | *Kitchen Display System for Restaurants & Takeaways \| Grafterr UK* | *"Kitchen Display Systems"* | KDS ✓ EPOS ✓ — 🔴 **no** food truck, **no** street food |
| **Hatches Up** (UK) | — | — | 🔴 *"Street food app for vendors, food trucks & vans, event organisers, collectives & customers"* |
| **StreetDots / Togather / Feast It** | — | — | pitch booking and event catering — **adjacent, not competitors for this page** |

🔴 **Hatches Up is the closest positional competitor and it is already in this codebase** — 🧪 `run-scraper.js` scrapes `*.hatchesup.app` schedule pages, and 5 sites in the Sheet are Hatches Up pages. **They market to "vendors, food trucks & vans, event organisers, collectives AND customers" — both audiences on one brand. HatchGrab/Village Foodie splits them, which is the stronger structure.**

**Language competitors use that this page does not:** `POS`, `EPOS`, `point of sale`, `till`, `kitchen display system`, `KDS`, `takeaway`, `contactless`, `stock control`, `offline`.

⚠️ **This is four pages fetched, not a competitive audit.** I have not checked their rankings, their backlinks, or whether their terminology is working for them.

---

## 5. STEP 5 — RECOMMENDATIONS

### 5.1 🔴 TIER 0 — DO THIS FIRST, OR NOTHING ELSE MATTERS

| # | change | why | confidence |
|---|---|---|---|
| **0.1** | 🔴 **Decide whether `/landing` should be indexed, and make the code and its comment agree.** `app/landing/page.tsx:58` says `index:false` on the grounds the gate is on; `layout.tsx:41` says the gate came off on 3 September. **One of them is wrong.** | Nothing below has any effect while this stands | **MEASURED** — both lines quoted |
| **0.2** | Same decision for `/compare` (`:51`) | its own comment ties it to the landing embargo | **MEASURED** |
| **0.3** | Add `app/robots.ts` and `app/sitemap.ts` | 🧪 neither exists; crawlers have no map of the site | **MEASURED** (absence) |

⚠️ **0.1 is a business decision, not an SEO one** — the page shows real prices with no mask and carries a named customer testimonial. **I am not recommending you index it; I am recommending you decide, because right now it is public and unindexed by an argument that has expired.**

### 5.2 TIER 1 — METADATA (cheap, no visible copy change)

| # | change | to | why | confidence |
|---|---|---|---|---|
| 1.1 | landing `title` | `HatchGrab — Food truck ordering & kitchen display system \| UK` | 🧪 adds two operator category terms the page has zero of; keeps the brand first | **JUDGEMENT** informed by competitor titles |
| 1.2 | add a landing `description` | ~150 chars naming: food truck / mobile catering, online ordering, pre-orders, kitchen display, UK | 🔴 **there is currently none** — it inherits a brand-generic one | **MEASURED** (absence) |
| 1.3 | add `alternates: { canonical }` | the `www` host actually served | 🔎 `app/layout.tsx:43-48` records the apex→www 307; canonical would pin it | **MEASURED** (the redirect is documented in-file) |
| 1.4 | `/compare` title | include `food truck POS comparison` or `EPOS` | 🧪 it is the natural landing page for comparison searches | **JUDGEMENT** |

🔴 **1.1 and 1.2 must NOT mention WhatsApp.** 🔎 It is `coming soon` behind `WHATSAPP_LIVE=false` (`lib/whatsapp-live.ts`). §44's standing rule and the flag both forbid presenting it as live — **and metadata is the easiest place to leak an unshipped claim, because nobody re-reads it when the flag flips.**

### 5.3 TIER 2 — HEADING AND BODY COPY

⚠️ 🔎 §44 governs this copy, and it records a claim already removed for being *"a preference stated as a finding"*. **Every suggestion here is additive vocabulary, not a new claim.**

| # | change | why | confidence |
|---|---|---|---|
| 2.1 | 🟢 **Use "food truck" more than twice in body copy** — it appears only in two headings | the page's own category term is nearly absent from its prose | **MEASURED** |
| 2.2 | 🟢 Name the kitchen screen as a **"kitchen display system (KDS)"** once, where it is already described | 🧪 the product genuinely has one — 🔎 `app/dashboard/[token]/kds/page.tsx` exists and the h3 already says *"kitchen screen"*. **This is a synonym for a shipped feature, not a new claim** | **MEASURED** (feature exists) |
| 2.3 | 🟡 Add **"mobile catering"** once as an alternative to "food trucks" | 🧪 UK operators use it; NCASS and vendors both do | **JUDGEMENT** |
| 2.4 | 🔴 **Do NOT add "POS" / "EPOS" to body copy as a product claim** | ⚠️ **the product is not a till.** It does not take card payments at the counter today (Stripe walk-ups are "coming soon"). Calling it an EPOS in prose would be **exactly the overstatement §44 exists to stop** | **MEASURED** — the page's own coming-soon badges say so |
| 2.5 | ❌ **Do NOT add "street food"** | §3 — consumer term | **MEASURED** |

🔴 **2.4 is the sharpest tension in this review.** The highest-intent operator search terms are `food truck POS` and `food truck EPOS`, and **the honest answer is that HatchGrab is not one yet.** ⚠️ **Metadata (1.1) can name the category it competes in; body copy should not claim a capability the product lacks.** If you disagree with that line, it is a judgement call and it is yours — **but the difference between "ordering system" and "EPOS" is a real one that an operator will notice on day one.**

### 5.4 TIER 3 — STRUCTURAL

| # | change | why | confidence |
|---|---|---|---|
| 3.1 | `SoftwareApplication` JSON-LD on `/landing` | 🧪 zero structured data on the site; price and category are already on the page | **MEASURED** (absence) |
| 3.2 | `LocalBusiness` / `FoodEstablishment` JSON-LD on `/trucks/[slug]` and `/venues/[slug]` | 🟢 **the highest-value structural item on the Village Foodie side** — these are already indexable, already per-entity, and are exactly what rich results are for | **JUDGEMENT**, well-supported |
| 3.3 | A comparison page per competitor (`/compare/epos-now`) | 🧪 competitors run these; `/compare` already exists as a shell | **JUDGEMENT** |
| 3.4 | ⚠️ Give `/` (Village Foodie root) its own metadata | 🔎 it is `'use client'` so it **cannot export any** — it needs a server wrapper or a `layout.tsx`. **A structural change, not a metadata one** | **MEASURED** (the constraint is real) |

---

## 6. STEP 6 — WHAT THIS REVIEW CANNOT ESTABLISH

🔴 **I have no analytics and no Search Console access, and I did not infer performance from the page's contents.**

- ❌ **Current rankings** — unknown. Moot for `/landing` and `/compare`, which are `noindex`.
- ❌ **Actual traffic** — unknown. 🧪 PostHog is wired (`app/page.tsx` imports `usePostHog`) but I did not query it, and 🔎 V12.3 records session recording disabled and visitor postcodes no longer sent.
- ❌ **Which terms convert** — unknowable without conversion tracking tied to search terms.
- ❌ **Search volume** — §2.1. **Not estimated.**
- ❌ **Backlinks, domain authority, crawl coverage, index status** — all Search Console questions.
- ⚠️ **Whether the three `alt=""` images are genuinely decorative** — not verified.
- ⚠️ **Competitor rankings** — four pages fetched for their *language*, not their performance.

🔴 **So every recommendation is about what the page SAYS and whether a crawler can SEE it. None is about what the page currently EARNS, because I cannot see that.**

---

## 7. THE ONE-LINE SUMMARY OF THE WHOLE REVIEW

**The page is well-structured, honestly written, and invisible.** One `robots` line makes every other finding hypothetical, and the argument written next to that line expired on 3 September.

---

## 8. STATE AT END

`git status --short`:

```
 M .gitignore
 M app/admin/page.tsx
 M app/api/cron/custom-domain-check/route.ts
 M app/api/manage/route.ts
 M app/landing/page.tsx
 M app/manage/[token]/page.tsx
 M app/o/[slug]/page.tsx
 M components/EventListCard.tsx
 M components/dashboard/CustomDomainSetup.tsx
 M components/dashboard/DemoWelcome.tsx
 M components/dashboard/types.ts
 M components/landing/LandingFooter.tsx
 M docs/manual-update-report.md
 M ios/App/App.xcodeproj/project.pbxproj
 M lib/custom-domain/copy.ts
 M lib/custom-domain/dns.ts
 M lib/custom-host.ts
 M lib/landing-table.ts
 M lib/meta/webhook-signature.ts
 M lib/plan-features.ts
 M lib/ratelimit.ts
 M lib/venue-matcher.ts
 M lib/whatsapp/connection-state.ts
 M proxy.ts
 M public/badges/README.md
 M scripts/backfill-venue-id-low.ts
 M scripts/backfill-venue-id.ts
 M scripts/linking-guards.ts
 M scripts/run-scraper.js
 M vercel.json
?? app/admin/outreach/
?? app/api/admin/outreach/
?? app/api/manage/whatsapp-signup/
?? app/order/[id]/page.tsx
?? components/StoreBadges.tsx
?? components/dashboard/CopyButton.tsx
?? docs/ai-notes-postcode-report.md
?? docs/android-golive-landing-report.md
?? docs/arbitration-validation-report.md
?? docs/copy-button-report.md
?? docs/custom-domain-404-report.md
?? docs/custom-domain-fixes-report.md
?? docs/custom-domain-verification-report.md
?? docs/deletion-rules-report.md
?? docs/demo-provisioning-report.md
?? docs/event-linking-design-report.md
?? docs/exclusion-check-position-report.md
?? docs/exclusions-provenance-report.md
?? docs/geocoder-validation-report.md
?? docs/hatches-up-comparison-report.md
?? docs/hatches-up-import-report.md
?? docs/hatches-up-recheck-report.md
?? docs/hatches-up-reconciliation-report.md
?? docs/hatches-up-source-report.md
?? docs/hatchesup-events.csv
?? docs/hatchesup-online-ordering.csv
?? docs/hatchesup-online-ordering.md
?? docs/hatchesup-ordering.csv
?? docs/hatchesup-trucks-tagged.md
?? docs/hu-columns-build-report.md
?? docs/hu-columns-report.md
?? docs/hu-reconciliation-report.md
?? docs/landing-seo-review-report.md
?? docs/linking-guards-report.md
?? docs/local-dev-host-report.md
?? docs/order-link-outage-report.md
?? docs/order-route-rename-report.md
?? docs/order-url-routes-report.md
?? docs/outreach-manual-dates-report.md
?? docs/outreach-modal-report.md
?? docs/outreach-modal-v2-report.md
?? docs/outreach-page-report.md
?? docs/outreach-phone-and-sort-report.md
?? docs/outreach-phone-column-report.md
?? docs/outreach-platform-edit-report.md
?? docs/outreach-tab-report.md
?? docs/outreach-ui-fixes-report.md
?? docs/pimp-my-fish-manual-events-report.md
?? docs/pimp-my-fish-source-report.md
?? docs/platform-detection-report.md
?? docs/postcode-flag-guard-report.md
?? docs/pricing-suppression-report.md
?? docs/privacy-policy-processors-report.md
?? docs/rls-policy-report.md
?? docs/rls-verification-report.md
?? docs/saffron-walden-extraction-report.md
?? docs/scraper-audit-report.md
?? docs/scraper-diagnosis-queries.sql
?? docs/scraper-diagnosis-report.md
?? docs/scraper-filter-fixes-report.md
?? docs/scroll-lazy-silence-report.md
?? docs/sheet-migration-audit-report.md
?? docs/sql/
?? docs/store-badges-report.md
?? docs/truck-radius-report.md
?? docs/trucklist.txt
?? docs/venue-consolidation-report.md
?? docs/venue-coords-and-run-log-report.md
?? docs/venue-creation-diagnosis-report.md
?? docs/venue-creation-fix-report.md
?? docs/venue-link-apply-report.md
?? docs/venue-linking-report.md
?? docs/venue-linking-scope-report.md
?? docs/venue-matcher-fix-report.md
?? docs/venue-pipeline-report.md
?? docs/vf-map-events-report.md
?? docs/whatsapp-connections-build-report.md
?? docs/whatsapp-connections-fk-fix-report.md
?? docs/whatsapp-embedded-signup-s4-s5-report.md
?? docs/whatsapp-embedded-signup-scope-report.md
?? docs/whatsapp-embedded-signup-v4-report.md
?? docs/whatsapp-extraction-report.md
?? docs/whatsapp-golive-build-report.md
?? docs/whatsapp-golive-copy-report.md
?? docs/whatsapp-golive-decision-report.md
?? docs/whatsapp-golive-heading-report.md
?? docs/whatsapp-landing-flag-report.md
?? docs/whatsapp-landing-revert-report.md
?? docs/whatsapp-threshold-report.md
?? docs/whatsapp-token-expiry-report.md
?? docs/whatsapp-token-issued-at-report.md
?? docs/whatsapp-v4-landed-report.md
?? lib/app-badges.ts
?? lib/clipboard.ts
?? lib/custom-domain/alert.ts
?? lib/custom-domain/check.ts
?? lib/outreach.ts
?? lib/whatsapp-hint.ts
?? lib/whatsapp-live.ts
?? lib/whatsapp/connection-read.ts
?? lib/whatsapp/embedded-signup.ts
?? lib/whatsapp/token-crypto.ts
?? public/badges/GetItOnGooglePlay_Badge_Web_color_English.svg
?? scripts/geo-validate.js
?? supabase/migrations/20260903_hu_presence_flags.sql
?? supabase/migrations/20260903_outreach_contact_name.sql
?? supabase/migrations/20260903_outreach_dnc_entity.sql
?? supabase/migrations/20260903_outreach_tracking.sql
?? supabase/migrations/20260903_whatsapp_confirmed_nullable.sql
?? supabase/migrations/20260904_whatsapp_connections.sql
?? supabase/migrations/20260904_whatsapp_connections_token_issued_at.sql
?? supabase/migrations/20260907_discovery_run_log.sql
```

**0 staged.** `HEAD = 6820d7b`, `origin/main = 08ac368`. **No file changed but this report. No copy edited, no code proposed, nothing staged, committed, pushed or added.**

---

## Sources

- [5 Best POS Systems for Food Trucks in the UK (2026 Guide) — TechBullion](https://techbullion.com/5-best-pos-systems-for-food-trucks-in-the-uk-2026-guide/)
- [The Ultimate Guide to Food Truck EPOS Systems — What Epos](https://www.whatepos.co.uk/the-ultimate-guide-to-food-truck-epos-systems-everything-you-need-to-succeed-in-2026/)
- [The Ultimate Guide to Mobile Catering EPOS Systems — What Epos](https://www.whatepos.co.uk/the-ultimate-guide-to-mobile-catering-epos-systems-everything-you-need-to-succeed/)
- [Food Truck EPOS & POS Systems — RST EPOS UK & Ireland](http://www.rstepos.com/food-truck-epos)
- [Food truck POS System | Point of Sale — Epos Now](https://www.eposnow.com/uk/systems/hospitality-pos/food-truck/)
- [Food Truck POS Systems — GetApp UK 2026](https://www.getapp.co.uk/directory/2619/food-truck-pos-systems/software)
- [Kitchen Display System for Restaurants & Takeaways — Grafterr UK](https://www.grafterr.com/uk/products/kitchen-display-system)
- [Kitchen Display System (KDS) — Kobas](https://www.kobas.co.uk/products/kitchen-display-system/)
- [Kitchen Display System for Restaurants — Fresh KDS](https://www.fresh.technology/)
- [Mobile catering POS explained: Streamline UK vendor operations — YCR](https://www.ycr.co.uk/mobile-catering-pos-uk-vendor-operations/)
- [How to Start Your Own Street Food or Mobile Catering Business — NCASS](https://ncass.org.uk/mobile-catering-home/mobile-catering-types/street-food-catering)
- [Street food app for vendors, food trucks & vans — Hatches Up](https://hatchesup.co.uk/vendors/)
- [StreetDots: The number one platform for outdoor street trading](https://www.streetdots.co.uk/)
- [We Are Togather](https://togather.com/)
- [Street Food Catering Services — British Event Catering](https://britisheventcatering.co.uk/street-food-catering/)
- [Mobile Catering Units | Food Vans for Hire — KK Catering](https://kkcatering.co.uk/units/)
- [Buyer Intent Keywords — Keyword Insights](https://www.keywordinsights.ai/blog/buyer-intent-keywords/)
