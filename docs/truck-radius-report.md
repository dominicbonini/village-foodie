# How far a truck actually travels — a measured threshold

**8 September 2026 · READ-ONLY MEASUREMENT.** No database row inserted, updated or deleted. No file changed except this report. Nothing staged, committed, pushed; `git add` not run in any form. **No code proposed.**

**Tags:** 🔎 SOURCE-READ · 🧪 EXECUTED · ⚠ qualified.

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 0. COUNTS AND SCOPE

| | START 14:52:51Z | END 14:55:49Z |
|---|---|---|
| `discovery_events` | **4,300** | **4,300** |
| `venues` | **559** | **559** |
| `discovery_trucks` | **231** | **231** |

**Extensions searched** (nothing scoped by extension; `scripts/run-scraper.js` is `.js` and was in scope): `.avif .bat .cjs .css .csv .entitlements .example .gitignore .gradle .html .ico .iml .jar .java .jpeg .jpg .js .json .log .md .mjs .pbxproj .plist .png .pro .properties .resolved .sql .storyboard .svg .swift .toml .ts .tsx .txt .webp .xcconfig .xcprivacy .xcscheme .xml .yml`

---

# 🔴 THE HEADLINE, BEFORE THE NUMBERS

**A truck-radius rule is worth having, but it is a weak second net, not a first one.** At the thresholds derived below it catches **15 of 21** testable known-bad links (71%) at a cost of **3–5%** of good links — **and it misses the very mislink V1.2 built its case on.** 🧪 `The Purple Pepper → "The Swan" [Monks Eleigh]` sits at **44.1 km**, inside the 50 km regional threshold, and is **accepted**.

🔴 **And 61% of trucks cannot be given a radius at all** — 64 have zero usable anchors, 41 have exactly one. **The rule is silent for the majority of the population it is meant to police.**

🔴 **The strongest finding is not about radii.** 🧪 **774 of the 2,229 unlinked events (35%) already carry a full UK postcode in `ai_notes`, and nothing reads it.** A postcode places a venue to ~100 m via postcodes.io. **That is a better input than any radius test, any model guess, and the matcher itself.**

---

## 1. STEP 1 — THE TRUE DISTRIBUTION

### 1.1 The gauntlet first — and it is much smaller than recorded

🧪 Applied to all 559 venues: placeholder decimals; a sentinel point derived **at runtime** (any coordinate shared by ≥5 venues); outside the UK bounding box; and >5 km from its own postcode via a live postcodes.io bulk lookup.

```
🔴 GAUNTLET FAILURES: 20 of 559
   sentinel point           12      (all on 55.3781,-3.4360 — the GB centroid, found at runtime, not told)
   >5 km from own postcode   5
   placeholder decimals      2
   no coordinate             1
⇒ usable venues: 539     postcodes resolved 339, invalid/unresolvable 20
```

🔴 **This contradicts both the manual and the brief, and the difference is that the data has been fixed.** V1.1 recorded **26 placeholder + 13 centroid**, and a bad-list of **103**; the brief says **27 placeholder + 13 GB-centroid**. 🧪 **Today it is 2 and 12.** The coordinate-correction work has landed. ⚠️ **A distribution computed over "103 known bad" would today be excluding 83 venues that are fine.**

*If this proved nothing:* a gauntlet that fails nothing would look identical to clean data. Ruled out — it does fail 20, it found the GB centroid **without being given it**, and the 5 postcode-inconsistent rows are named individually in §4.2.

### 1.2 Pooled pairwise distance per truck — before and after

🧪 Every pair of distinct venues visited by the same truck, over linked events:

| | pairs | p50 | p75 | p90 | p95 | p99 | max |
|---|---|---|---|---|---|---|---|
| **BEFORE gauntlet** | 3,548 | 28.34 | 54.99 | **200.51** | **383.22** | 468.21 | 539.9 |
| **AFTER gauntlet** | 3,281 | 27.08 | 48.43 | **99.84** | **193.66** | 300.48 | 407.6 |

🔴 **The gauntlet removes 267 pairs — 7.5% — and halves the p95, from 383 km to 194 km.** The tails were almost entirely bad coordinates: p90 fell **100.7 km**, p95 fell **189.6 km**, while the median moved **1.3 km**. **The bad data was not shifting the distribution; it was manufacturing its entire upper half.**

🧪 68 trucks have ≥2 usable venues. Their own summary statistics:

```
per-truck p95: p50 41.2  p75 83.5  p90 141.1  max 370.1 km
per-truck max: p50 49.4  p75 102.3  p90 184.8  max 407.6 km
```

### 1.3 🔴 The surviving tail is NOT all bad data — and it is not all real either

**A p95 of 194 km after cleaning is not a food truck's range, so I looked at the widest pairs rather than assuming.** 🧪 The eight widest:

```
Pigs In               408 km : "Worlington Beer Festival"[Workington] ↔ "Burnt House Vineyard"[∅]
Marleys Pie & Mash    370 km : "Gillingham Swan"[Gillingham]         ↔ "Ormesby Village Fete"[Ormesby]
Phat Khao             346 km : "Isle Of Wight Festival"[∅]           ↔ "Rock N Roll Circus"[∅]
Test Kitchen          316 km : "Suffolk Distillery"[Stoke By Nayland]↔ "Ormesby Village Fete"[Ormesby]
Savannah Smoke Grill  276 km : "Gladstone Arms"[∅]                   ↔ "Beccles Food Festival"[Beccles]
Elder Street Food     272 km : "Bailey Hills Estate"[Bailey Hills]   ↔ "The Five Bells"[Colne Engaine]
```

🔴 **Two distinct things are in there.** `Worlington Beer Festival` carries the village **`Workington`** — Suffolk name, Cumbrian village, 400 km apart. `Gillingham` is Kent or Norfolk. **Those are ambiguous-village resolutions that my gauntlet cannot catch, because they have no postcode to be inconsistent with.** But `Isle Of Wight Festival ↔ Rock N Roll Circus` for a festival trader is plausibly **real travel**.

⚠️ **So the post-gauntlet distribution still measures link quality as well as truck behaviour, and I cannot fully separate them.** V1.1's own 21% ambiguity cost is the mechanism. **Every threshold below is therefore derived from data I know to be partly contaminated in the direction of making trucks look wider-ranging than they are.**

---

## 2. STEP 2 — SEGMENTED, NOT AVERAGED

### 2.1 Is it bimodal? — ⚠️ not cleanly, and n is too small to insist

🧪 Histogram of each truck's own **median** pair distance (n=68):

```
  0–5   km █████ 5
  5–10  km ███ 3
 10–15  km █████████████ 13     ← mode
 15–20  km ████████ 8
 20–25  km ████ 4
 25–30  km ████████ 8
 30–40  km ██████████████ 14    ← second mode
 40–50  km █████ 5
 50–75  km █████ 5
 75–100 km ███ 3
100+   km  0
```

⚠️ **There are two humps — 10–15 km and 30–40 km — with a dip at 20–25.** With **68 trucks** that dip is 4 trucks deep and is **well within noise**. 🔴 **I am not going to call this bimodal on n=68.** It is a right-skewed continuum with a suggestion of two modes. **Segmenting is still the right move — not because the population is bimodal, but because a single pooled number describes neither a Cambridge-only truck nor a festival tourer.**

### 2.2 By event count

| segment | n | own-p95: p50 / p90 | own-max: p50 / p90 |
|---|---|---|---|
| events ≥ 40 | 15 | 75 / 241 km | 92 / 272 km |
| events 10–39 | 25 | 45 / 111 km | 50 / 170 km |
| events 2–9 | 28 | 32 / 96 km | 32 / 112 km |

⚠️ **Busier trucks look wider-ranging — but this is confounded.** More events means more venues means more chances to have collected one bad link. **I would not set a threshold on this axis.**

### 2.3 By spread — the axis that works

🧪 Segmenting on each truck's own median pair distance, and measuring **radius from its venue centroid** (the statistic the actual rule needs):

| segment | n | share | radius-from-centroid p95: p50 / p90 / max |
|---|---|---|---|
| **COMPACT** (median ≤ 15 km) | 21 | 31% | **9 / 24 / 68 km** |
| **REGIONAL** (15–45 km) | 37 | 54% | **30 / 55 / 351 km** |
| **WIDE** (> 45 km) | 10 | 15% | **48 / 127 / 269 km** |

Members — COMPACT: The Travelling Friar, Perky Beans, Pig-Casso's, My Thai Chef, Howe & Co, Pizza Mondo… · REGIONAL: Eat Greek, Gino's Pizza, Village Spice, Kerief… · WIDE: Holy Loaded, Marleys Pie & Mash, Zaket Potato, Wok Wraps, Phat Khao…

---

## 3. STEP 3 — THE DEGENERATE CASE, AND IT IS THE MAJORITY

🔴 **Named before it was tested, exactly as V1.2's village-anchor failure demands.** A truck with one confirmed venue anchors every candidate against a single point; the candidate that *is* that point scores 0 km and passes. **That is the same shape as a village holding one venue anchoring to itself and passing 7 broken venues.**

🧪 Across all **173** trucks appearing in `discovery_events`:

| anchors | trucks | share | events |
|---|---|---|---|
| 🔴 **0 usable** | **64** | 37% | 141 |
| 🔴 **1 usable** | **41** | 24% | 337 |
| ✅ 2+ | 68 | 39% | 3,822 |

🔴 **61% of trucks cannot be given a measured radius at all.**

**What the rule must do for them — and it is not "accept":**

- **0 anchors → UNKNOWN. Hold, do not accept, do not reject.** There is no evidence either way, and accepting on no evidence is precisely the failure V1.2 records.
- **1 anchor → UNKNOWN, and explicitly *not* a 0 km test.** A single point cannot distinguish "the same place" from "the only place we happen to know". ⚠️ **A one-anchor truck must never be told its one venue is plausible and everything else is not** — that would freeze it at its first recorded pitch forever.
- ✅ **2+ anchors → the rule applies**, at the segment threshold in §5.

⚠️ **The event counts soften this: the 105 anchor-less trucks account for 478 events (11%), while the 68 measurable trucks carry 3,822 (89%).** **So the rule is silent for most *trucks* but applicable to most *events*.** Both framings are true and I am giving both.

---

## 4. STEP 4 — TESTED AGAINST KNOWN-BAD, WITH BOTH ERROR RATES

### 4.1 False-reject cost, measured on today's existing good links

🧪 1,865 linked events are measurable against their truck's radius:

| segment | links | radius p50 / p90 / p95 / p99 | threshold → good links rejected |
|---|---|---|---|
| **COMPACT** | 978 | 9.0 / 18.2 / 24.0 / 27.8 | 15 km → **18.7%** · 20 → 8.4% · **25 → 3.3%** · 30 → 0.5% |
| **REGIONAL** | 652 | 19.4 / 37.4 / 49.4 / 233.6 | 30 km → **21.5%** · 40 → 7.4% · **50 → 5.1%** · 60 → 4.4% |
| **WIDE** | 235 | 32.9 / 67.1 / 91.7 / 207.8 | 60 km → **14.9%** · 80 → 6.0% · **100 → 3.4%** · 130 → 2.6% |

⚠️ **These "good" links are today's links, which are themselves partly wrong** — so the false-reject figure is an **over-estimate**: some of what a threshold rejects is a mislink it should reject. **I cannot separate the two without ground truth, and I am not going to pretend the 3.3% is pure loss.**

### 4.2 Catch rate on known-bad

🧪 **21 events point at a gauntlet-failing venue whose truck has a radius.** At the recommended thresholds:

```
COMPACT   3/6  caught at  25 km
REGIONAL  7/10 caught at  50 km
WIDE      5/5  caught at 100 km
─────────────────────────────────
TOTAL    15/21 = 71%
```

⚠️ **This measures the radius rule as a SECOND net.** The gauntlet had already removed those venues from every anchor set, so the rule is being scored on damage the first net had already flagged. **It is not an independent 71%.**

### 4.3 🔴 V1.2's worked mislinks — and the rule misses the flagship one

| case | distance | segment | threshold | verdict |
|---|---|---|---|---|
| `The Purple Pepper` → "The Swan" [Monks Eleigh] | **44.1 km** | REGIONAL | 50 | 🔴 **ACCEPTED** |
| `The Purple Pepper` → "Village Hall" [Troston] | 34.3 km | REGIONAL | 50 | 🔴 **ACCEPTED** |
| `Marky D's` → "Village Hall" [Troston] | 53.1 km | COMPACT | 25 | 🟢 rejected |
| `My Thai Chef` → "Village Hall" [Troston] | 30.5 km | COMPACT | 25 | 🟢 rejected |

🔴 **Two of four. The `Village Hall` collapse — the one V1.1 called out as 43 rows onto a single Troston row — is caught only for compact trucks.** For a regional truck, 34 km to a village hall is entirely plausible, and the rule has nothing to say. **A radius rule cannot fix a name-collision problem.**

### 4.4 🔴 The blind spot the brief named: longitude sign flips

🧪 **171 venues sit within 0.35° of the Greenwich meridian**, where flipping the longitude sign moves a point only a few kilometres. **103 of them would move 5–30 km — and 89 of those would land INSIDE a 25 km COMPACT threshold.**

🔴 **A radius rule cannot see a sign flip.** The flipped point is still in the right county, still near the truck's other venues, still plausible. ⚠️ **This is a list of the population at risk, not a list of defects** — I have not established that any of them *is* flipped.

---

## 5. STEP 5 — THE HOLDING FILE

**A table, not a file. `discovery_venue_candidates`.**

**Why a table:** it must be re-processable when a postcode arrives later, joined against `venues` and `discovery_events` as those change, and written by a GitHub Action while being read by whatever retries it. 🔎 A file under `scripts/backfill-output/` is **gitignored** (`.gitignore:51`), so it would not survive the Action's container — the artefacts the existing backfill scripts write are local-only by construction. ⚠️ **A file is fine for a human to review once; it cannot be the store for something that must be retried.**

**What each row needs to make a retry possible — not just readable:**

| field | why |
|---|---|
| `discovery_event_id` | the row to link if the retry succeeds — without it nothing can be applied |
| `truck_name`, `venue_name`, `village` | the matcher's inputs, exactly as extracted |
| `source_url` | which page said this; lets a human check the claim |
| `ai_notes_postcode` | 🔴 **the postcode the scraper already extracted — §5.1** |
| `model_suggested_postcode` | kept **separate** from the above; they are different evidence classes |
| `rejection_reason` + `measured_km` + `threshold_km` + `segment` | so a later threshold change can re-run only the rows the old one rejected |
| `anchor_count` | distinguishes "rejected on evidence" from "held for want of anchors" — §3 |
| `first_seen_at`, `last_retried_at`, `retry_count` | a retry loop needs to know what it has already tried |
| `resolved_venue_id` | set when it succeeds; the row becomes its own audit trail |

⚠️ **`created_at`/`updated_at` must be maintained by a trigger, not by application code.** 🧪 `discovery_events.updated_at` is written at insert and never again — **zero of 4,300 rows differ from `created_at`**, including 125 rows repointed by a merge. **Do not repeat that here or the retry loop cannot tell a stale row from a fresh one.**

### 5.1 🔴 `ai_notes` IS THE BETTER INPUT — AND IT IS ALREADY THERE

🧪 **Measured across all 4,300 events:**

```
events with a full UK postcode in ai_notes : 1,104 of 4,300  (26%)
🔴 UNLINKED events with one                :   774 of 2,229  (35%)
```

Samples: `"Bishop's Stortford Cricket Club" → CM23 2SR` · `"The Crown Inn" → CM22 6DG` · `"Off The Beaten Truck - Northstowe" → CB24 1AA`.

🔴 **774 unlinked rows could be placed by postcodes.io alone — no matcher, no radius test, no model guess.** A postcode resolves to ~100 m; a radius test only ever says "not obviously wrong".

**Why it beats a model suggestion, on evidence rather than preference:** 🔎 the `ai_notes` postcode is what the **source page published**, extracted at `:1696-1706` before any matching happens. A model-suggested postcode is a guess about a place the model has only a name for — and V1.1 already demoted the model *from* geocoder *to* postcode suggester after finding 26 placeholder coordinates and 13 GB centroids. **One is a transcription; the other is an inference.**

⚠️ **Both fields belong in the table, kept apart.** ⚠️ And the postcode is not a free pass — 🧪 20 of 359 venue postcodes in `venues` are **invalid partials** that postcodes.io rejects (`CB21`), so an extracted postcode still has to resolve before it counts.

---

## 6. STEP 6 — WHAT THIS RULE CANNOT DO

🔴 **A radius tells you a location is PLAUSIBLE for that truck. It never tells you it is RIGHT.** Everything below is outside what any distance-from-centroid test can reach:

1. 🔴 **Two pitches a few km apart.** Both inside the radius; only one is correct. 🧪 This is the live Saffron Walden case — `The Common` and `The Railway Arms` are **0.9 km apart**, and a radius rule accepts either for every truck on that page. **The double-assignment defect is completely invisible to this rule.**
2. 🔴 **Name collisions inside the range.** 🧪 `The Purple Pepper → "Village Hall" [Troston]` at 34.3 km is accepted. 43 village halls within a regional truck's range are all plausible.
3. 🔴 **Longitude sign flips.** §4.4 — 89 of 103 land inside a compact threshold.
4. 🔴 **A generic venue standing in for a specific branch.** `foodPark` and `foodPark Cambridge North` are **5.6 km** apart; both plausible for a Cambridge truck.
5. 🔴 **A wrong link to a venue the truck genuinely uses.** Right venue, wrong event — zero distance error.
6. ⚠️ **Anything about 61% of trucks** (§3).
7. ⚠️ **New territory.** A truck's first booking 40 km away is indistinguishable from a mislink. **The rule is structurally conservative against genuine expansion**, and every threshold below therefore has a real cost in suppressed legitimate growth.

---

## 7. RECOMMENDED THRESHOLDS

**Radius from the truck's venue centroid, applied only where the truck has ≥2 gauntlet-passing anchors.**

| segment | truck's median pair distance | **threshold** | false-reject on today's links | catch on known-bad |
|---|---|---|---|---|
| **COMPACT** | ≤ 15 km | **25 km** | **3.3%** (32 of 978) | 3/6 |
| **REGIONAL** | 15–45 km | **50 km** | **5.1%** (33 of 652) | 7/10 |
| **WIDE** | > 45 km | **100 km** | **3.4%** (8 of 235) | 5/5 |
| 🔴 **0 or 1 anchor** | — | **no threshold — HOLD** | n/a | n/a |

**Why these and not the neighbouring values:** each sits at the knee. 🧪 COMPACT at 20 km costs 8.4% and at 15 km costs 18.7% — for one extra catch. REGIONAL at 40 km costs 7.4%, at 30 km costs 21.5%. WIDE at 80 km costs 6.0%. **In each segment, tightening by one step roughly doubles or triples the false-reject rate for a marginal gain in catch.**

**The cost of each, stated plainly:**

- **False accept:** ~29% of known-bad passes (6 of 21), plus every error class in §6 — which is most of them. 🔴 **This rule will not stop the mislink V1.2 was written about.**
- **False reject:** 3–5% of correct links held for review, and 🔴 **a systematic bias against a truck's first booking in new territory** (§6.7). ⚠️ Rejections must go to the §5 holding table for retry, **never be silently dropped** — a held row is recoverable, a dropped one is not.

🔴 **My recommendation on how to use it: as a REVIEW trigger, not an auto-reject.** At 3–5% false-reject and 71% catch on already-flagged data, it is not accurate enough to discard rows unattended — but it is a cheap, well-calibrated way to decide which links a human should look at first. ⚠️ **And it should run behind the postcode path in §5.1, not in front of it: 774 rows do not need a plausibility test, they need a lookup.**

---

## 8. WHAT REMAINS UNKNOWN

- 🔴 **The distribution is still contaminated** by ambiguous-village coordinates the gauntlet cannot catch (`Workington` for `Worlington`). Every threshold is therefore biased **wide**.
- 🔴 **No ground truth.** "False reject" is measured against today's links, which are partly wrong.
- ⚠️ **21 known-bad events is a small test set**, and they were already caught by the gauntlet.
- ⚠️ **Segment assignment is circular for a new truck** — you need venues to know its segment, and the segment to judge its venues. Default for an unsegmented truck is unaddressed here.
- ⚠️ **No sign flip has been confirmed**; §4.4 measures exposure only.
- ⚠️ **The 20 invalid venue postcodes** were not repaired or investigated.

---

## 9. STATE AT END

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

**0 staged.** `HEAD = 801de1c`, `origin/main = 08ac368`. **No database row written, no file changed but this report, nothing staged, committed, pushed or added. No code proposed.**
