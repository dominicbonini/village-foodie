# Two refusal guards on the linking scripts

**8 September 2026.** No database row inserted, updated or deleted. No migration written or applied. Nothing staged, committed, pushed; **`git add` was not run in any form, with or without `-A` or `.`**. `lib/venue-matcher.ts` is byte-for-byte unchanged. No auto-apply added, no venue created, nothing deleted.

**Tags:** 🔎 SOURCE-READ · 🧪 EXECUTED · ⚠ qualified.

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 0. COUNTS AND SCOPE

| | START 12:29:33Z | END 12:36:05Z |
|---|---|---|
| `discovery_events` | **4,300** | **4,300** |
| `venues` | **559** | **559** |

**Extensions searched** (nothing scoped by extension anywhere in this pass; `scripts/run-scraper.js` is `.js` and was in scope): `.avif .bat .cjs .css .csv .entitlements .example .gitignore .gradle .html .ico .iml .jar .java .jpeg .jpg .js .json .log .md .mjs .pbxproj .plist .png .pro .properties .resolved .sql .storyboard .svg .swift .toml .ts .tsx .txt .webp .xcconfig .xcprivacy .xcscheme .xml .yml`

---

## 1. STEP 1 — STOP CONDITIONS: CLEAR

🧪 `git status --short -- scripts/backfill-venue-id.ts scripts/backfill-venue-id-low.ts` returned **nothing**: neither script was modified or untracked. 🧪 Both are tracked and clean at `79f1282` (2 July 2026, *"Add venue-backfill scripts"*). **Proceeded.**

⚠️ 🧪 `lib/venue-matcher.ts` **was** already modified — it carries the V1.1 matcher workstream. That is one of your six uncommitted workstreams, it is not mine, and I did not touch it. §5.

---

## 2. STEP 2 — GUARD ONE: CATEGORY-NAME TARGETS

### 2.1 The list is derived from the data, and your six were tested against the derivation

🔴 **You asked me not to accept your list, so I did not.** Two derivations were run over all 559 venues.

**(a) Exact-name duplicates, by spread** — 11 names over 23 rows:

| rows | spread | name | villages |
|---|---|---|---|
| 3 | **102.2 km** | The Bell | Kesgrave, Great Paxton, Bottisham |
| 2 | 92.4 km | Co Op | Chesterwell, Alconbury Weald |
| 2 | 90.5 km | THE VILLAGE INN | West Runton, Witchford |
| 2 | 69.8 km | The Fox | Lyng, Burwell |
| 2 | 58.8 km | The King's Head | Fen Ditton, North Lopham |
| 2 | 41.3 / 32.0 / 24.9 / 16.9 / 12.5 / 4.7 km | The Red Lion · The Plough · The Lion · The Five Bells · The Bell Inn · OTBT Wintringham | — |

🔴 **This derivation is the wrong one and I am not using it.** It catches `The Bell`, `The Fox`, `The Plough` — **real pubs** — and 🧪 `docs/arbitration-validation-report.md` §4.1 proved the link *to* `The Bell` [Bottisham] **correct**. A guard built on it would trade a wrong pin for a lost right one.

**(b) Attractor / generic-root names** — the mechanism that actually causes the harm. For each venue V, how many others W have `toks(V) ⊊ toks(W)`? 🔎 That is the same containment test the matcher itself uses at `lib/venue-matcher.ts:170-171`, so it names exactly the rows a family can collapse onto:

```
61 branches · spread 329.3 km · "THE VILLAGE INN" / "The Village Inn"
41 branches · spread 113.4 km · "Village Hall"  [Troston]
14 branches · spread  94.8 km · "The Green"     [Northstowe]
 8 branches · spread  16.9 km · "foodPark"      [Cambridge]
 6 branches · spread 469.2 km · "The Common"    [Saffron Walden]
 6 branches · spread 111.1 km · "The Street"    [Whatfield]
 6 branches · spread  50.1 km · "Off The Beaten Truck" [Northstowe]
 5 branches · spread 111.4 km · "Co-op" / "Co Op"
```

🧪 **All six of your starting names appear in this derivation**, and it adds `The Village Inn` (61 branches, 329 km) and `The Green` (14 branches, 94.8 km) that your list did not have. ⚠️ **But it also still catches `The Swan`, `The Lion`, `The Fox` and `The Plough`** — again, real pubs.

### 2.2 🔴 The discriminator: the village must be able to tell the head from its branches

Neither derivation alone separates *"generic category"* from *"common pub name"*, because on name tokens they have the same shape. What separates them is whether the **village** can do the job:

- 🧪 `foodPark` [Cambridge] has **7 of its 8 more-specific branches in Cambridge** — Science Park, CB1, Biomedical, Cambridge North, Eddington, West Cambridge. **Village agreement cannot pick a branch, so the matcher lands on the head, and the head is not a place.** That is exactly the Pizza Mondo 5.64 km error, which the 15 km ceiling passed without comment.
- 🧪 `The Bell` [Bottisham]'s only more-specific sibling is `Buxhall Bell` [Ipswich]. **A different village, so village agreement already separates them** — and the arbitration validation proved that link correct.

🔎 **The implemented rule** (`scripts/linking-guards.ts:56-79`, `buildCategoryIndex`): refuse when the target's token set is a **proper** subset of ≥1 other venue's **and at least one of those more-specific branches shares the target's village.** Structural, derived at runtime from the live table, no threshold to tune, no statistics.

🧪 **It identifies 23 category roots today**, including `foodPark` (8 branches, 7 same-village), `Off The Beaten Truck` (6/1), `The Common` (6/3) and `Wintringham` (5/2).

### 2.3 🔴 WHAT THIS GUARD DOES **NOT** COVER — stated, not glossed

🧪 **Three of your six are covered: `foodPark`, `Off The Beaten Truck`, `The Common`. Three are not: `Village Hall`, `The Street`, `Co Op`** — their branches are scattered across different villages, so `sameVillage` is empty and the guard does not fire.

🧪 **The uncovered set is 10 roots**: `THE VILLAGE INN`, `Village Hall` [Troston], `The Green`, `Village Green`, `The Street`, `Co Op` ×2, `The Swan`, `The Lion` ×2. 🧪 **Residual exposure: 6 HIGH and 74 LOW links survive the guards pointing at one of them.**

⚠️ **I deliberately did not close it, and the reason is measured.** Closing it needs a spread threshold (`≥3 branches, >25 km`), and that same threshold refuses `The Swan` [Monks Eleigh] and `The Lion` ×2 — real pubs. **The arbitration validation already demonstrated what refusing real pubs costs.** I am not adding a rule that trades a measured wrong-pin class for an unmeasured lost-link class on my own judgement.

⚠️ **Partial mitigation that already exists, and I checked it rather than assuming it:** 🧪 the `Village Hall` [Troston] links do not reach the approved SQL, because the low script's pre-existing village-mismatch triage sends them to `review-suspicious.csv` — 🧪 the run shows exactly that for `freethorpe village hall`, `Little Thetford Village Hall` and `Ridgewell Village Hall`. **That is a partial cover, not the guard, and 6 HIGH links remain uncovered. OPEN.**

### 2.4 The refusal is loud

🔎 Every refused row is printed to stdout with the event, the target, the confidence and the reason; written to `guard-refusals.csv` with all of that; and aggregated into `create-candidates.csv`. 🔴 **A silent skip is indistinguishable from a no-match, so nothing is dropped silently.** ⚠️ Create-candidates are **reported only** — no venue is created (§4).

---

## 3. STEP 3 — GUARD TWO: BAD-COORDINATE TARGETS

🔎 `scripts/linking-guards.ts:92-129`. Three checks, all on the target:

| Check | How |
|---|---|
| **Placeholder decimals** | identical short decimal fractions on both axes (`52.1234, 0.1234`) |
| **Sentinel point** | ⚠️ **built at runtime** from the table — any point shared by ≥5 venues cannot be a real address |
| **Outside the UK box** | lat/lng bounds |

🧪 **The runtime derivation earned its keep in this run.** It found the sentinel `55.3781,-3.4360` (the GB centroid) **without being told about it** — and it also refused two links onto `52.2595,-0.2595`, a **placeholder that was not in the list of 14 I had previously measured.** 🔴 A hard-coded list would have found the centroid and missed that one.

### 3.1 Three states, kept distinct

🔎 `coordState()` returns exactly three values and the caller keeps three buckets:

| State | Meaning | Action |
|---|---|---|
| **GOOD** | coordinate present, passes every check, **and has a postcode** so it could be checked against an outside witness | eligible for the `.sql` |
| **BAD** | placeholder / sentinel / outside the box / no coordinate | 🔴 **REFUSED**, into `guard-refusals.csv` |
| **UNCHECKABLE** | passes the checks but has **no postcode**, so nothing outside the row corroborates it | ⚠️ **HELD** into its own file, `held-uncheckable-coord.csv` |

🔴 **UNCHECKABLE is not folded into GOOD, and that is the point of the third bucket.** V1.1 records the village-anchor check reporting zero problems on 7 genuinely broken venues because a village holding one venue anchors to itself — **absence of evidence read as a pass.** Treating "no postcode" as clean is the same mistake in a different costume, so these rows are held and counted, never approved as verified.

⚠️ **The cost of that choice is real and I am reporting it, not hiding it: 🧪 130 links are held this way across the backlog, 56 of them HIGH.** That is a policy decision you can relax by moving `heldUncheckable` back into the approved set; it is one line and it is marked.

---

## 4. STEP 4 — WHAT WAS NOT CHANGED

| Constraint | Status |
|---|---|
| `lib/venue-matcher.ts` unchanged | ✅ 🧪 **`git hash-object` = `eb7c6014742b4f95b3f65a1ce04728be68b5fa3c` at START and at END — identical.** ⚠️ `git diff --stat` shows 121 insertions on that file, which is **your pre-existing V1.1 workstream against HEAD, not this pass.** The hash comparison is what proves this pass changed nothing. |
| No auto-apply | ✅ 🔎 The `--apply` path at `backfill-venue-id.ts:137` is untouched and still opt-in; the guards run before it, so they filter it too. Nothing new writes. |
| No venue creation | ✅ Refusals emit `create-candidates.csv`. 🔴 Nothing inserts. |
| Nothing deleted | ✅ No delete verb added anywhere. |
| Guards sit around the matcher | ✅ 🔎 They consume `findVenue`'s output and refuse it; they never alter candidate selection, village agreement or the ceiling. |

⚠️ **One deviation from the literal instruction, flagged rather than taken silently.** You said "add two guards to the existing scripts". I put the shared implementation in **one new file, `scripts/linking-guards.ts`**, imported by both, instead of pasting ~90 lines into each. **Reason:** V1.2 §5.6 records what a hand-maintained byte-mirror costs (`lib/venue-signature.ts` vs `run-scraper.js`), and two copies of a refusal rule that must agree is that hazard by construction. **If you prefer it inlined, that is a mechanical change and I will make it.**

---

## 5. STEP 5 — PROOF

### 5.1 Both scripts run, report-only

🧪 `npx tsx scripts/backfill-venue-id.ts` (no `--apply`) and `npx tsx scripts/backfill-venue-id-low.ts`, both in their existing emit-only mode. 🧪 **`npx tsc --noEmit -p tsconfig.json` → 0 errors across the whole project.**

⚠️ **An earlier typecheck of mine reported 2 errors and proved nothing** — I had invoked `tsc` on the files directly without the project config, so `strict: true` was off and discriminated-union narrowing did not apply. **Re-run under the repo's own `tsconfig.json`, which is the compiler setting that actually governs this code, it is clean.** A typecheck with the wrong flags is not a typecheck.

### 5.2 Before / after — the scripts' own scope (future events, 316 rows)

| | before | after |
|---|---|---|
| HIGH into `backfill-venue-id.sql` | 25 | **22** |
| LOW into review | 202 | **199** |
| 🔴 refused — category | — | **7** (all `foodPark`) |
| 🔴 refused — bad coordinate | — | **2** (`52.2595,-0.2595`) |
| ⚠️ held — uncheckable | — | **43** |
| create-candidates emitted | — | 3 |

Low script: 🧪 199 triaged → 193 approve / 6 suspicious, **plus** 7 category refusals, 2 bad-coord refusals, 40 held uncheckable.

### 5.3 Before / after — the whole backlog (2,229 rows), so the guards can be judged at scale

⚠️ Both scripts are scoped to future events (🔎 `backfill-venue-id.ts:62`). Measured across **all** unlinked rows, which is what the design report's figures referred to:

```
BEFORE   HIGH 1,057   LOW 627   NONE 545
AFTER    HIGH   888   LOW 463
  🔴 REFUSED — category      149   (HIGH 112 / LOW  37)
  🔴 REFUSED — bad coordinate  54   (HIGH   1 / LOW  53)
  ⚠️  HELD  — uncheckable     130   (HIGH  56 / LOW  74)
```

🧪 **The bad-coord figure is exactly the 54 the design report predicted.** The category guard refuses **112 HIGH** links — more than the 50 generic-`foodPark` links, because it also covers `Off The Beaten Truck`, `The Common` and `Wintringham`.

### 5.4 🔴 RULING OUT "A GUARD THAT REFUSES EVERYTHING"

**A guard that blocked all 1,057 HIGH links would also report zero wrong pins.** Three independent checks say that is not what happened:

1. 🧪 **84.0% of HIGH survives** (888 of 1,057). A refuse-everything guard reads 100% refused; this reads **10.7%**.
2. 🧪 **The refusals are concentrated, not spread.** All 7 category refusals in the scripts' own scope are the *same* target (`foodPark`); across the backlog they fall on **23 identified roots** out of 559 venues. A guard firing indiscriminately would scatter across the whole table.
3. 🧪 **Both guards fire on rows with an independently-known defect.** The bad-coord refusals all land on one venue whose coordinate is a **placeholder** — a property of that row, established without reference to any link. The category refusals all land on rows with same-village branches, listed explicitly in §2.2.

⚠️ **And the converse check:** a guard that refused *nothing* would show 1,057 → 1,057. It shows 1,057 → 888. **Neither degenerate reading survives.**

### 5.5 Ten largest distance errors prevented

**Category guard** — distance from the event's village anchor to the refused target:

| km | date | truck | event venue | refused target | conf |
|---|---|---|---|---|---|
| **20.24** | 2026-06-05 | Pizza Mondo | "Off The Beaten Truck" [Wintringham] | Off The Beaten Truck | low |
| **18.06** | 2026-08-20 | Nomadough | "foodPark" [Saffron Walden] | foodPark | low |
| 11.68 | 2026-06-11 | Nomadough | "foodPark" [Milton] | foodPark | low |
| 11.68 | 2026-06-25 | Nomadough | "foodPark" [Milton] | foodPark | low |
| 11.68 | 2026-07-23 | Nomadough | "foodPark" [Milton] | foodPark | low |
| 11.68 | 2026-07-09 | Nomadough | "foodPark" [Milton] | foodPark | low |
| 11.68 | 2026-08-13 | Nomadough | "foodPark" [Milton] | foodPark | low |
| 11.68 | 2026-09-03 | Nomadough | "foodPark" [Milton] | foodPark | low |
| 11.68 | 2026-09-10 | Nomadough | "foodPark" [Milton] | foodPark | low |
| 3.49 | 2026-06-24 | Nomadough | "FoodPark Biomedical" [Cambridge] | FoodPark Biomedical | **high** |

**Bad-coordinate guard** — all ten largest are the same placeholder target, `Off The Beaten Truck, Wintringham` at `52.2595,-0.2595`, **4.65 km** each, across Pizza Mondo, Nomadough, Perky Beans and Pig-Casso's; one is **HIGH**. 🧪 **0 bad-coord refusals had no measurable distance.**

⚠️ **Honest reading of these magnitudes.** Most are 11–20 km, not the 5.64 km Pizza Mondo case — because the village anchor is a proxy for the event's true position, not the truth. ⚠️ **The anchor understates error where the village holds one venue** (V1.2 §5.1), so these figures are indicative, not exact. **What is exact is which target was refused and why.**

### 5.6 🔴 THIS HAS NO EFFECT UNTIL DEPLOYED, AND THESE SCRIPTS ARE RUN BY HAND

**Nothing in this pass changes production.** 🔎 Both scripts are emit-only by default and are invoked manually (`npx tsx …`); 🧪 no cron, no GitHub Actions workflow and no Vercel cron invokes either — the three workflows are `daily_scrape.yml`, `hatchgrab_scrape.yml`, `process-next-truck.yml`, and none mentions them. **The guards take effect the next time a human runs a script, and only then.** Nothing is committed, so they are not even on `main`.

⚠️ 🧪 Running the scripts wrote seven files into `scripts/backfill-output/`, which is **gitignored** (`.gitignore:51`), so the working tree is not dirtied by the run itself.

---

## 6. WHAT REMAINS OPEN

- 🔴 **The dispersed-generic gap: 10 roots, 6 HIGH and 74 LOW surviving links** (§2.3). `Village Hall`, `The Street` and `Co Op` from your starting six are **not covered**. Deliberately not closed, because the threshold that closes it also refuses real pubs.
- ⚠️ **130 held UNCHECKABLE links (56 HIGH)** — the cost of not treating "no postcode" as clean. A policy dial, marked in the code.
- ⚠️ **Distance figures in §5.5 are village-anchor estimates**, and the anchor is degenerate for single-venue villages.
- ⚠️ **The guards are unvalidated against ground truth.** They are structural refusals, which is why they need no statistical validation to be *safe* — but **how many of the 149 category refusals would have been correct links is unmeasured.** A refusal costs a lost link, and that cost is not zero.
- 🔎 `scripts/linking-guards.ts` is **new and untracked**; it will not run for anyone until you stage it with the two scripts. **All three must be staged together** — the two scripts import it and will not compile without it.

---

## 7. STATE AT END

Counts END = START: `discovery_events` **4,300**, `venues` **559**.

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
 M docs/reference-manual.md
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
?? docs/scraper-audit-report.md
?? docs/scraper-diagnosis-queries.sql
?? docs/scraper-diagnosis-report.md
?? docs/scraper-reference-manual.md
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
?? scripts/linking-guards.ts
?? supabase/migrations/20260903_hu_presence_flags.sql
?? supabase/migrations/20260903_outreach_contact_name.sql
?? supabase/migrations/20260903_outreach_dnc_entity.sql
?? supabase/migrations/20260903_outreach_tracking.sql
?? supabase/migrations/20260903_whatsapp_confirmed_nullable.sql
?? supabase/migrations/20260904_whatsapp_connections.sql
?? supabase/migrations/20260904_whatsapp_connections_token_issued_at.sql
?? supabase/migrations/20260907_discovery_run_log.sql
```

**0 staged.** `HEAD = 801de1c`, `origin/main = 08ac368`. **Files this pass changed — and only these:**

| file | state | note |
|---|---|---|
| `scripts/backfill-venue-id.ts` | ` M` | guards wired in |
| `scripts/backfill-venue-id-low.ts` | ` M` | guards wired in |
| `scripts/linking-guards.ts` | `??` | **new** — the shared implementation |
| `docs/linking-guards-report.md` | ` M` | this report |

⚠️ `scripts/run-scraper.js` (` M`) and `scripts/geo-validate.js` (`??`) were **already** modified/untracked before this pass and were not touched. 🧪 `lib/venue-matcher.ts` hash is identical at START and END.

**No database row written. No migration. Nothing staged, committed, pushed or added.**
