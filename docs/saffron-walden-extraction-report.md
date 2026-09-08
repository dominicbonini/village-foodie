# Saffron Walden double-assignment — the mechanism, reproduced live

**8 September 2026 · READ-ONLY DIAGNOSIS.** No file changed. No database row inserted, updated or deleted. Nothing staged, committed, pushed; `git add` not run in any form. Every DB call was a `select`; the Sheet was read with the `spreadsheets.readonly` scope; the pages fetched are public. **No fix proposed.**

**Tags:** 🔎 SOURCE-READ · 🧪 EXECUTED · ⚠ qualified.

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 0. COUNTS AND SCOPE

| | START 13:23:40Z | END 13:28:10Z |
|---|---|---|
| `discovery_events` | **4,300** | **4,300** |
| `venues` | **559** | **559** |
| `discovery_trucks` | **231** | **231** |

**Extensions searched** (nothing scoped by extension; `scripts/run-scraper.js` is `.js` and was in scope throughout): `.avif .bat .cjs .css .csv .entitlements .example .gitignore .gradle .html .ico .iml .jar .java .jpeg .jpg .js .json .log .md .mjs .pbxproj .plist .png .pro .properties .resolved .sql .storyboard .svg .swift .toml .ts .tsx .txt .webp .xcconfig .xcprivacy .xcscheme .xml .yml`

⚠️ `scripts/run-scraper.js` is one of the modified files in the tree; every line number below is against the **working-tree** version, not `HEAD`.

---

# 🔴 THE CAUSE — SETTLED, AND REPRODUCED TODAY

**The same URL is listed TWICE in the Sheet's Venues tab as two separate sites. The page is therefore scraped twice per run, and each pass receives the identical flat text containing BOTH pitches' truck lists. The only thing separating them is a natural-language instruction. The venue label is then stamped from the Sheet row, unconditionally, discarding whatever the model said.**

🔎 `scripts/run-scraper.js:905-908`:
```js
if (site.sourceType === 'venue') {
    finalVenue = site.name;
    confirmedVenue = site.name;
}
```

🔴 **So when the "Railway Arms" pass fails to skip The Common's section, every truck it read is written as being at The Railway Arms.** Not because the model said so — 🔎 `:906` never consults the model's `Venue Name` for a venue-sourced site.

🧪 **Reproduced against the live page at 13:26Z today**, running both Sheet rows' real prompts through the real model:

| Pass | events returned | trucks |
|---|---|---|
| `Off The Beaten Truck - The Common` | **5** | Buffalo Joe's, Guerrilla Kitchen, Nomadough, Pizza Mondo, Tikka Tonic |
| `Off The Beaten Truck - The Railway Arms` | 🔴 **9** | **all 7 of The Common's** + The Noodle & Dumpling Bar + The Linton Kitchen |

**The page lists 7 trucks at The Common and 2 at The Railway Arms. The Railway Arms pass returned all nine and would stamp all nine "Railway Arms".** This is the fault, live, today.

---

## 1. WHAT THE PAGE ACTUALLY SERVES

🧪 `curl` with the scraper's user agent: **HTTP 200, 464,671 bytes, 34 `<script>` tags — but the content is server-rendered.** Stripping tags and scripts leaves **1,559 characters** of visible text containing both pitches, their addresses and their truck lists.

🔴 **The served HTML is NOT a shell.** `Railway Arms` and `The Common` each appear in it. ⚠️ **This matters because it rules out the client-side-rendering explanation** — the brief asked these be distinguished, and a shell would have produced the same "zero pitch association" symptom for a completely different reason.

🧪 **What the extraction actually receives** — `document.body.innerText` after `performModernScroll`, **1,542 characters, verbatim** (trimmed here only where marked):

```
By using this website, you agree to our use of cookies. …
Accept
Skip to Content
Home / Saffron Walden / Northstowe / Alconbury / Wintringham
Saffron Walden 
Street Food
Every Thursday 5 'til 8pm
THURSDAY 10 SEPTEMBER

The Common, Ashdon Road, Saffron Walden CB10 3HQ

FUNKY//LAUNCHER/BONGOS
5 'til 8PM
BUFFALO JOE'S            Chicken burgers & wings        Order Online
GUERRILLA KITCHEN        Bao Buns                       Order Online
KERIEF                   South African & Jamaican fusion Order Online
NOMADOUGH                Sourdough Flatbreads           Order Online
PIZZA MONDO              Hand-stretched Neapolitan Pizza Order Online
TIKKA TONIC              New Delhi Street Food          Order Online
JUST BAKED BY SOPHIE     Homemade Cookies & Cakes       Walk Up

Thursday 10 September

The Railway Arms, Station Road, Saffron Walden, CB11 3HQ

EASYGOING//MARGINAL//SPLASHES
WALK UPS + ORDER ONLINE
5 'til 8PM
THE NOODLE & DUMPLING BAR  Pre-order or Walk Up. … 07988 599873
THE LINTON KITCHEN         Classic Cakes & Botanic Bakes  Walk Up

Thank you so much for all your support this year …
Locations / Hours / Contact …
```

### 1.1 The structure, and why it is the whole problem

| | |
|---|---|
| Pitches listed | **2** — `The Common, Ashdon Road … CB10 3HQ` and `The Railway Arms, Station Road … CB11 3HQ` |
| Date headings | **2**, both the same day (`THURSDAY 10 SEPTEMBER`, then `Thursday 10 September`) |
| How a truck is associated with a pitch | 🔴 **By position only.** A pitch heading, then a flat run of truck names, until the next heading. |
| Any markup binding truck→pitch | 🔴 **None survives `innerText`.** It is one flat string. |

🔴 **In the text the model sees, nothing marks where The Common's list ends and The Railway Arms' begins except the address line itself.** There is no delimiter, no indentation, no numbering. **The boundary is a convention, not a structure.**

*If this proved nothing:* an empty fetch and a page with no pitch association produce the same absence of association. Ruled out — the fetch returned 1,542 characters containing both addresses and all nine trucks, so the association information **is** present positionally; what is absent is any machine-readable binding.

---

## 2. THE EXTRACTION PATH, AND WHAT THE PROMPT ASKS FOR

🔎 The site is built from the **Venues** tab, `:501-514`:
```js
if (row[9] && row[9].startsWith('http')) {
    const runStrategy = (row[11] || 'scroll_lazy').toLowerCase().trim();
    …
    sitesToScrape.push({ name: row[0], url: row[9], instructions: row[10] || "",
                         strategy: strat, sourceType: 'venue' });
}
```

🧪 **And this URL matches TWO rows** — Venues tab rows **359** and **360** — so it is pushed to `sitesToScrape` twice and fetched twice per run. 🧪 The Trucks tab contains **zero** rows for this domain, so both entries are venue-sourced.

🔎 Prompt selection, `:657-663`: `isRuleExtraction` is set only for `scrape_rules`, or when the instructions contain `weekly`/`recurring`. 🧪 **Neither instruction contains either word**, so both passes take the standard events prompt at `:711-745`. Quoting the parts that bear on this:

```
  You are extracting food truck events for: "${site.name}".
  🚨 CRITICAL USER HINT FOR THIS WEBSITE: "${site.instructions}"
  TASK 1: Extract EVERY food truck event from the provided text for the schedule shown.
  …
  5. **VENUE NAME:** Extract ONLY the Business Name (e.g., 'The Plough'). DO NOT append the village.
  8. **DOUBLE DAYS:** If a single day lists multiple locations, create a completely separate JSON object for location.
  12. **PROXIMITY REQUIREMENT:** You must ONLY extract an event if an explicit Day or Date is
      explicitly stated in the exact same sentence or list block as the venue.
```

### 2.1 🔴 Does the prompt ask for truck-to-pitch association?

**No — and this is the finding.**

- 🔎 Rule 5 asks for a **Venue Name** per event, so the model is asked *which* venue, but nothing tells it that the text contains **two** venues whose truck lists must not be mixed. Rule 8 gestures at "multiple locations" but only about creating separate objects, not about **which trucks belong to which**.
- 🔴 **And it would not matter if it did.** 🔎 `:906` overwrites `finalVenue` with `site.name` for every venue-sourced event. **The model's `Venue Name` is computed, returned, and thrown away.** 🧪 In today's run the Railway Arms pass returned `"Venue Name": "The Railway Arms"` for all nine trucks — including the seven at The Common — and `:906` would have written all nine to Railway Arms regardless of what that field said.

🔴 **So the entire defence against cross-contamination is the free-text `ai_instructions`.** There is no code path that checks a truck against a pitch.

---

## 3. WHY IT SOMETIMES WORKS — 🔴 AND THE FAILURE IS ONE-DIRECTIONAL

🧪 Every date this URL has produced, by pitch:

| date | rows | The Common | Railway Arms | in BOTH |
|---|---|---|---|---|
| 2026-06-04 | 7 | 5 | 2 | ✅ 0 |
| 2026-06-11 | 9 | 7 | 2 | ✅ 0 |
| 2026-06-18 | 6 | — | — | ✅ 0 |
| **2026-06-25** | **14** | 6 | **8** | 🔴 **6** |
| 2026-07-02 | 8 | — | — | ✅ 0 |
| 2026-07-09 | 8 | — | — | ✅ 0 |
| 2026-07-16 / 17 | 2 / 9 | — | — | ✅ 0 |
| **2026-07-23** | **18** | 8 | **10** | 🔴 **8** |
| **2026-07-30** | 8 | 5 | 3 | ⚠️ **1** |
| **2026-08-06** | **12** | 5 | **7** | 🔴 **5** |
| 2026-08-13 / 20 / 27 | 7 / 7 / 1 | — | — | ✅ 0 |
| 2026-09-03 | 6 | — | — | ✅ 0 |
| 2026-09-10 | 6 | 5 | 1 | ✅ 0 *(after the 5 deletions)* |

🔴 **On every broken date the Railway Arms list is a strict superset of The Common list.**

- **25 Jun** — Railway Arms = the same 6 as The Common **+ Just Baked by Sophie + Scotties Hot Scotch Egg**
- **23 Jul** — Railway Arms = the same 8 **+ Just Baked by Sophie + The Noodle & Dumpling Bar**
- **6 Aug** — Railway Arms = the same 5 **+ Beats 'N' Beigels + Just Baked by Sophie**

**The Common pass never leaks the other way. Not once in 16 dates.**

### 3.1 The asymmetry maps exactly onto the two instructions

🧪 Read from the Sheet, verbatim:

**Row 359 — The Common**, rule 3:
> *"LOCATION CUTOFF: You are ONLY extracting trucks for "The Common". You MUST **stop reading the text the moment you see the heading "The Railway Arms"**. Do NOT extract Kerief or Just Baked By Sophie."*

**Row 360 — The Railway Arms**, rule 1:
> *"LOCATION START POINT: You are ONLY extracting trucks for "The Railway Arms". You MUST **ignore the intro text and the entire list of trucks for "The Common"**. Only begin extracting data AFTER you see the specific address heading "The Railway Arms, Station Road"."*

🔴 **One is a STOP rule; the other is a SKIP-THE-PREFIX rule, and the prefix is the longer list.** Stopping at a marker is a prefix operation a language model does reliably. Discarding everything *before* a marker — while the discarded part is the bulk of the document and looks exactly like the part it is meant to keep — is the one that fails. **The direction of every observed failure is the direction of the harder instruction.**

🧪 **And it still fails today.** In this session's live run the Railway Arms pass returned all nine trucks; the Common pass returned only its own.

### 3.2 Is the difference in the page or the code?

**Neither, and that is the answer to the question as asked.** 🧪 The page shape is constant across all 16 dates — two pitches, flat lists, positional association. 🔎 The code is constant. **What varies is whether the model obeyed a free-text instruction on that particular run**, and the observed rate is **4 clear failures in 16 dates (25%)**, with one partial (30 Jul).

🔴 **So this is neither a page-shape problem nor a bug in the ordinary sense. It is a structural job — segmenting one document into two — delegated to a natural-language hint, with no verification downstream.** Any explanation predicting constant double-assignment is wrong, and this one does not: it predicts intermittency, and the intermittency is one-directional, which is what the data shows.

⚠️ **A correction to the brief's counter-example.** It states *"on 4 June the same URL produced nine trucks at nine DISTINCT pitches, one each."* 🧪 4 June produced **7 rows / 7 trucks across 2 pitches** (5 + 2); the 9-row date is **11 June** (7 + 2). **The page has only ever had two pitches, so "nine distinct pitches" cannot be right for this URL.** The substance of the counter-example — that clean days are common — holds and is confirmed: **12 of 16 dates are clean.**

*If this proved nothing:* a superset relationship could arise if Railway Arms genuinely hosted more trucks on those days. Ruled out three ways — the surplus trucks are *exactly* The Common's list on the same date; 🧪 Hatches Up's independent data put all five checked trucks at The Common only; and 🧪 the fault reproduces **now**, on a page whose true split is 7/2, with the model returning 9 for the two-truck pitch.

---

## 4. THE `ai_instructions` FOR THIS SITE

⚠️ **The brief asks what `discovery_trucks` holds. It holds nothing for this site — this is a VENUE-tab entry, not a truck.** 🧪 `discovery_trucks` contains no row whose `schedule_url` is this URL. The instructions live in the **Sheet's Venues tab, column K (`[10]`)**, and are read at 🔎 `:509`. **Recording this rather than reporting an empty result as an absence.**

Both are quoted in full in §3.1. On the question asked — **do they address multiple pitches on one page?**

✅ **Yes, explicitly and at length.** Each has a dedicated rule (Common rule 3, Railway rule 1) doing nothing but partitioning the page, plus a rule 4 pinning the venue name. **This is a known, deliberately-handled problem, not an oversight.**

🔴 **But they are doing structural work in prose, and one of them has gone stale.** The Common's rule 3 ends: *"Do NOT extract **Kerief** or **Just Baked By Sophie**."* 🧪 **On today's page both are listed under The Common.** The instruction hard-codes a truck→pitch assignment that has since changed, so:

🧪 **The Common pass returned 5 trucks; the page lists 7. Kerief and Just Baked by Sophie were dropped — correctly per the instruction, wrongly per the page.**

🔴 **So this one URL currently produces both error directions at once: the Railway Arms pass over-extracts by 7, and the Common pass under-extracts by 2.** ⚠️ The second has not been reported before and is not the fault the reconciliation scoped.

---

## 5. IS THE VENUE-PAGE SHAPE GENERAL? — 🔴 NO. ONE URL, FOR A SPECIFIC REASON

🧪 **The Venues tab contributes 7 sites in total:**

| row | name | village | URL | pitches on the page |
|---|---|---|---|---|
| 5 | Nethergate Brewery | Long Melford | nethergate.co.uk/pages/long-melford | not fetched ⚠️ |
| 26 | The White Horse | Edwardstone | facebook.com/EdwardstoneWH/ | not fetched ⚠️ |
| **359** | **OTBT - The Common** | Saffron Walden | **…/saffron-walden** | 🔴 **2** |
| **360** | **OTBT - The Railway Arms** | Saffron Walden | **…/saffron-walden** ← **same URL** | 🔴 **2** |
| 361 | OTBT - Northstowe | Northstowe | …/northstowe | 🧪 **1** (`THE CABIN, THE GREEN, CB24 1AA`) |
| 362 | OTBT - Alconbury | Alconbury | …/alconbury | 🧪 **1** (`Swynford Coffee, Swynford Road … PE28 4XG`) |
| 363 | OTBT - Wintringham | St Neots | …/wintringham | 🧪 **1** (`PE19 0AW`) |

🔴 **`saffron-walden` is the only URL in the entire site list that appears twice**, and 🧪 it is the only Off The Beaten Truck page carrying two pitches. **The two facts are the same fact:** the operator's site gives Saffron Walden two pitches on one page, so the Sheet needed two rows pointing at it, so the page is parsed twice with prose instructions doing the splitting.

🧪 The three sibling pages are single-pitch and — consistent with that — 🧪 none shows the double-assignment shape in `discovery_events`.

⚠️ **Two venue sites were NOT fetched** (Nethergate Brewery, The White Horse). **Neither is listed twice**, so neither can produce this shape by this mechanism; whether either page lists multiple pitches is **UNREAD**.

🔴 **The 27 truck-page URLs / 580 rows are a different fault and are not touched here**, as the reconciliation report scoped and the brief instructed. Those are one truck's own page emitting the same pitch under two venue names — a naming problem. **This is one page's two pitches being merged into one list — a segmentation problem.** ⚠️ They share a symptom in the data (a truck at two venues, same time) and nothing else.

---

## 6. THE CAUSE, NAMED

**The reads settle it. Stated as a chain, each link source-read or executed:**

1. 🧪 One URL, two Sheet rows (Venues 359, 360) ⇒ 🔎 `:501-514` pushes two sites ⇒ the page is fetched and parsed twice per run.
2. 🧪 Both passes receive the identical 1,542-character flat `innerText` containing **both** pitches' truck lists (🔎 `:288` returns `document.body.innerText`).
3. 🔎 The prompt (`:711-745`) never asks the model to partition the page; the partition is delegated entirely to free-text `ai_instructions`.
4. 🔴 🔎 `:906` then stamps `finalVenue = site.name` unconditionally, **discarding the model's own venue field**, so any truck the pass returned is written to that pass's pitch.
5. 🧪 The Railway Arms instruction is a skip-the-prefix rule over the longer list; when it is not obeyed, the pass returns The Common's trucks and step 4 mislabels every one. **Observed on 4 of 16 dates and reproduced live today.**

**No further read is needed to establish the cause.** ⚠️ The one thing not established is **why compliance varies run to run** at `temperature: 0` — the page content differs weekly, so the input is never identical, and 🔎 no run log records the model's raw response. **The single read that would settle that: `discovery_run_log` capturing the per-site raw model output — the migration exists at `supabase/migrations/20260907_discovery_run_log.sql` and is still not applied.**

---

## 7. WHAT REMAINS UNREAD

- ⚠️ Why model compliance varies between runs; no raw responses are retained.
- ⚠️ Nethergate Brewery and The White Horse pages — not fetched.
- ⚠️ Whether the 30 July single overlap (Kerief) is a partial leak or a genuine two-pitch day.
- ⚠️ The 40 surviving June–August rows were classified by shape here, not re-read individually against the pages as they were on those dates — **and those pages are gone.**
- 🔴 The Common pass's stale hard-coded exclusion of Kerief and Just Baked by Sophie is **currently costing 2 rows per week** and has not been quantified historically.

---

## 8. STATE AT END

Counts END = START: `discovery_events` **4,300**, `venues` **559**, `discovery_trucks` **231**.

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
 M scripts/run-scraper.js
 M vercel.json
?? app/admin/outreach/
?? app/api/admin/outreach/
?? app/api/manage/whatsapp-signup/
?? app/order/[id]/page.tsx
?? components/StoreBadges.tsx
?? components/dashboard/CopyButton.tsx
?? docs/android-golive-landing-report.md
?? docs/arbitration-validation-report.md
?? docs/copy-button-report.md
?? docs/custom-domain-404-report.md
?? docs/custom-domain-fixes-report.md
?? docs/custom-domain-verification-report.md
?? docs/deletion-rules-report.md
?? docs/demo-provisioning-report.md
?? docs/event-linking-design-report.md
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
?? docs/pricing-suppression-report.md
?? docs/privacy-policy-processors-report.md
?? docs/rls-policy-report.md
?? docs/rls-verification-report.md
?? docs/saffron-walden-extraction-report.md
?? docs/scraper-audit-report.md
?? docs/scraper-diagnosis-queries.sql
?? docs/scraper-diagnosis-report.md
?? docs/scroll-lazy-silence-report.md
?? docs/sheet-migration-audit-report.md
?? docs/sql/
?? docs/store-badges-report.md
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

**27 modified, 101 untracked, 0 staged** — identical to START apart from this report. `HEAD = 801de1c`, `origin/main = 08ac368`. **No file changed, no database row written, nothing staged, committed, pushed or added. No fix proposed.**
