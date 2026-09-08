# Postcode arbitration — measured validation

**8 September 2026 · READ-ONLY.** No row inserted, updated or deleted. Nothing staged, committed, pushed; `git add` not run. Every database call was a `select`. The only network writes were `POST` bodies to postcodes.io's bulk lookup, which is a read API.

**Tags:** 🔎 SOURCE-READ · 🧪 EXECUTED · ⚠ qualified.

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 0. ROW COUNTS AND SCOPE

| | START 12:22:32Z | END 12:25:49Z |
|---|---|---|
| `discovery_events` | **4,300** | **4,300** |
| `venues` | **559** | **559** |
| unlinked | **2,229** | **2,229** |

**Extensions searched** (nothing scoped by extension; `scripts/run-scraper.js` is `.js` and was in scope): `.avif .bat .cjs .css .csv .entitlements .example .gitignore .gradle .html .ico .iml .jar .java .jpeg .jpg .js .json .log .md .mjs .pbxproj .plist .png .pro .properties .resolved .sql .storyboard .svg .swift .toml .ts .tsx .txt .webp .xcconfig .xcprivacy .xcscheme .xml .yml`

---

# 🔴 THE VERDICT, FIRST

**THE RULE IS NOT SAFE. NOT UNATTENDED, NOT WITH A CATEGORY HOLD LIST, NOT AT ALL IN ITS PRESENT FORM.**

On 15 independently-scoreable situations it **fixed nothing and broke eight**:

| | correct | wrong |
|---|---|---|
| `findVenue` alone | **11 / 15** | 4 |
| `findVenue` + postcode arbitration | **3 / 15** | 12 |

🧪 **Arbitration changed the answer in 10 of 15 situations. It fixed 0. It broke 8. Two changes were lateral.** And it is not a marginal rule: 🧪 across the **full** population it changes **753 of 1,011 rows (74.5%)**, including **426 that `findVenue` had called HIGH**.

⚠️ **My own `event-linking-design-report.md` §5.3 proposed this rule and called it "verified on one case". The measurement says the one case was a coincidence.** The report is wrong and this supersedes it. §6 explains exactly why the Wilbraham case passed while almost everything else fails.

---

## 1. THE SAMPLE — BUILT AND FROZEN BEFORE ANY RULE WAS RUN

### 1.1 The population

🧪 Reproducing the candidate step (🔎 `lib/venue-matcher.ts:166-173`) using the module's own exported `normName` and `toks`, over all 2,229 unlinked rows:

```
candidate set size 0 :   545
candidate set size 1 :   673
candidate set size >=2: 1,011   ← the population under test
   by size: 2×406  3×281  4×143  5×23  6×6  7×64  9×83  15×4  44×1
```

🔴 **Those 1,011 rows collapse to 186 distinct `(venue_name, village)` situations.** A situation repeated 50 times is **one** judgement, not fifty. **Scoring rows would have inflated the sample eleven-fold and let one lucky family dominate the result.** Everything below is scored per situation.

Arbitrability, measured before testing: 🧪 172 situations have ≥2 candidates carrying a postcode, 12 have exactly one, **2 have none**. ⚠️ **Of 359 distinct venue postcodes, 20 are invalid partials** (e.g. `CB21`) that postcodes.io rejects — counted, not dropped: they simply contribute no point to the arbitration, and situation 13/14 below shows what that does.

### 1.2 Selection method — pre-registered, and independent of every answer

**Order:** `sha1(venue_name + '|' + village)`, ascending. **That hash is computed from the scraped text alone** — not from any candidate, coordinate, postcode, confidence, or from what either rule answers. It was fixed before any rule ran.

**Quota, set in advance, to force family spread and to include the two families the design predicted would fail:**

| family | pool | taken |
|---|---|---|
| foodPark | 24 | **6** |
| Village Hall | 24 | **6** |
| Off The Beaten Truck | 14 | **4** |
| The Street | 3 | 2 |
| The Common | 2 | 2 |
| Co Op | 4 | 2 |
| other | 115 | **12** |
| **total** | **186** | **34 situations / 219 event rows** |

🧪 **26 distinct trucks** appear in the 34 situations. No truck contributes more than 3.

*If this sampling proved nothing:* a sample drawn from cases where the rule obviously works measures the sampling, not the rule. Three things rule that out. **(a)** The order is a hash of text that neither rule sees, so it cannot correlate with either rule's success. **(b)** The quota over-samples the families the design *predicted would fail* — if anything it is biased **against** the rule under test, and I state that rather than hiding it. **(c)** The result is not marginal — 0 fixes against 8 breaks — so no plausible re-draw reverses the sign. ⚠️ A bias **against** the rule cannot manufacture a "fixed zero" result, only exaggerate the break count; §4.2 therefore also reports the score with every category family removed.

---

## 2. WHAT WAS RECORDED, BEFORE JUDGING

For each of the 34 situations: every candidate with its stored coordinate and postcode; whether that postcode resolves; the candidate's **self-consistency** distance (its own coordinate to its own postcode); `findVenue`'s pick and confidence; and arbitration's pick. 🧪 **57 distinct postcodes resolved via postcodes.io bulk lookup; 1 unresolvable (`IP20 9AE`).**

🧪 **Arbitration abstained on 0 of 34** — every sampled set had at least one resolvable postcode.

---

## 3. GROUND TRUTH — ESTABLISHED FROM THE EVENT'S OWN EVIDENCE

**Source: the postcode the scraper extracted into `ai_notes` / `event_notes` from the truck's own published schedule** — the address the operator published, carried on the event row itself.

🔎 That field is written at `scripts/run-scraper.js:1696-1706` from the model's extraction of the source page, **before any venue matching happens**, and 🔎 neither `findVenue` (`lib/venue-matcher.ts:156-226`) nor the arbitration rule reads it. **It is genuinely independent of both rules under test.**

🧪 **15 of the 34 situations carry a full UK postcode in that field. 19 do not and are marked UNRESOLVED and excluded from the score** — not guessed.

**Scoring rule, stated in advance of the table:** a pick is **CORRECT** if it is the candidate whose identity matches the published address — operationally, the candidate nearest the ground-truth postcode, provided it is within map tolerance (≤ ~2.5 km) **or** is the unique name-and-village identity match in that address. If no candidate satisfies that, the correct answer is **"no suitable venue exists"** and any pick is WRONG.

⚠️ **Limits of this ground truth, stated plainly.** It is a postcode, so it locates the *pitch*, not the venue row's intended identity; where a correct venue row carries a sloppy coordinate (situations 6, 9, 12, 15) I scored on **identity**, which is the more generous reading **for both rules equally**. And the 19 UNRESOLVED situations are excluded, so this measures the rule only where the source published an address — ⚠️ **which may be the better-documented half of the data.**

---

## 4. THE SCORE

### 4.1 Situation by situation

| # | family | situation | GT postcode | `findVenue` | ✓/✗ | + arbitration | ✓/✗ | effect |
|---|---|---|---|---|---|---|---|---|
| 1 | foodPark | "foodPark Biomedical Campus" [Langley] | CB11 4SB | foodPark@TheGreen (low) 20.6 km | ✗ | same | ✗ | — |
| 2 | foodPark | "FoodPark Science Park" [Cambridge] | CB4 0WN | FoodPark Science Park 0.12 km | ✓ | same | ✓ | — |
| 3 | Village Hall | "Southery Village Hall" [Southery] | PE38 0NB | Village Hall [Troston] 35.6 km | ✗ | same | ✗ | — |
| 4 | Village Hall | "Sewards End Village hall" | CB10 2LG | **Sewards End Village hall 0.00 km** | ✓ | Village Hall [Troston] 47.0 km | ✗ | 🔴 **BROKE** |
| 5 | Village Hall | "Village Hall and playing field" [Newton Flotman] | NR15 1RF | Village Hall [Troston] 40.6 km | ✗ | same | ✗ | — |
| 6 | OTBT | "OTBT - Alconbury" [Alconbury Weald] | PE28 4XA | **OTBT - Alconbury 2.22 km** | ✓ | OTBT [Northstowe] 21.8 km | ✗ | 🔴 **BROKE** |
| 7 | OTBT | "OTBT - Northstowe" ×50 | CB24 1AA | OTBT - Northstowe 0.15 km | ✓ | OTBT [Northstowe] 0.57 km | ✓ | lateral |
| 8 | OTBT | "OTBT - The Railway Arms" ×41 | CB11 3HQ | **OTBT - Railway Arms 0.07 km** | ✓ | OTBT [Northstowe] 32.6 km | ✗ | 🔴 **BROKE** |
| 9 | OTBT | "Off The Beaten Truck" [Alconbury Weald] ×5 | PE28 4XA | **OTBT - Alconbury 2.22 km** | ✓ | OTBT [Northstowe] 21.8 km | ✗ | 🔴 **BROKE** |
| 10 | The Common | "Saffron Walden (The Common)" ×6 | CB10 1JH | SW (The Common) 0.50 km | ✓ | Saffron walden common 0.25 km | ✓ | lateral |
| 11 | The Common | "The Common" [Saffron Walden] ×7 | CB10 1JH | **The Common 0.27 km** | ✓ | **Bures Common 36.7 km** | ✗ | 🔴 **BROKE** |
| 12 | Co Op | "Co-op" [Alconbury Weald] ×2 | PE28 4XA | **Co-op [Alconbury Weald] 2.11 km** | ✓ | **One stop - co-op [CLAYDON] 97.4 km** | ✗ | 🔴 **BROKE** |
| 13 | other | "The Plough" [Great Chesterford] | CB10 1PL | The Plough [Birdbrook] 19.6 km | ✗ | The Plough [Shepreth] 12.7 km | ✗ | — |
| 14 | other | "The Plough" [Birdbrook] ×5 | CO9 4BJ | **The Plough [Birdbrook] 0.08 km** | ✓ | The Plough [Shepreth] 32.0 km | ✗ | 🔴 **BROKE** |
| 15 | other | "The Bell" [Bottisham] ×4 | CB25 9DA | **The Bell [Bottisham] 2.22 km** | ✓ | **The Bell [Kesgrave] 68.9 km** | ✗ | 🔴 **BROKE** |

### 4.2 Totals

```
                       correct   wrong   (of 15 scoreable; 19 UNRESOLVED excluded)
findVenue alone           11        4
findVenue + arbitration    3       12

arbitration changed the answer in 10 of 15 situations
   fixed a wrong answer:  0
   broke a correct one:   8
   lateral (both right):  2
```

🔴 **Zero fixes. Eight breaks.** The design report's own test — *"a rule that fixes five and breaks two is not a fix"* — is met in its most extreme form.

**With every category family removed** (dropping foodPark / Village Hall / OTBT / The Common / Co Op, leaving only situations 13, 14, 15): `findVenue` 2/3, arbitration 0/3, **2 breaks, 0 fixes**. ⚠️ **So the failure is not an artefact of over-sampling the category families.** It is smaller in absolute terms because that subset is small, but the sign is identical.

### 4.3 Blast radius — this is not a rare edge

🧪 Applied to the **whole** population, not the sample:

```
rows with >=2 candidates                              1,011
arbitration abstains (no resolvable postcode)            15
arbitration CHANGES findVenue's answer                  753   (74.5%)
   ...of those, findVenue had said HIGH                 426
distinct situations changed                          110 / 184
```

**A rule that overrides three quarters of the answers, including 426 HIGH-confidence ones, and is measured at 0 fixes / 8 breaks, is not a refinement. It is a replacement, and a worse one.**

---

## 5. WHY IT FAILS — the predicate, and it is structural

🔴 **The rule has no term for where the event is.** Read the formulation again: *"resolve every postcode present anywhere in the set, and prefer the candidate whose stored coordinate is nearest to a resolved point."*

The set of resolved points is **the candidates' own postcodes**. So the quantity being minimised is *"distance from some candidate's coordinate to some candidate's postcode"* — and its minimum is achieved by **whichever candidate's own coordinate best matches its own postcode**, i.e. the candidate with the smallest self-consistency error. That is a **data-hygiene score, not a location test.**

🧪 **The evidence is in the table.** The winning candidate's self-consistency in each break:

| # | arbitration's winner | its self-consistency | its distance from the actual event |
|---|---|---|---|
| 4 | Village Hall [Troston] | **0.00 km** | 47.0 km |
| 6, 9 | Off The Beaten Truck [Northstowe] | **0.00 km** | 21.8 km |
| 8 | Off The Beaten Truck [Northstowe] | **0.00 km** | 32.6 km |
| 11 | Bures Common | **0.24 km** | 36.7 km |
| 12 | One stop - co-op [CLAYDON] | **0.00 km** | **97.4 km** |
| 14 | The Plough [Shepreth] | **0.15 km** | 32.0 km |
| 15 | The Bell [Kesgrave] | **0.00 km** | 68.9 km |

🔴 **Seven of the eight breaks were won by a candidate with a self-consistency of ≤0.24 km, from an average of 40 km away.** The predicate is not merely present, it is the whole mechanism: **the tidiest row in the set wins, wherever it is.** Situation 12 is the reductio — a Claydon shop beats the actual Alconbury Weald Co-op by being 0.00 km from its own postcode, 97 km from the event.

⚠️ **And the correct answers were often the sloppy rows.** In situations 6, 9, 12 and 15 the right venue had a self-consistency of 1.06–2.11 km — precisely the rows arbitration demotes. 🔴 **The rule systematically prefers well-maintained wrong rows over poorly-maintained right ones.**

### 5.1 The three unresolved situations that corroborate the mechanism

Not scored, but they show the same signature: 🧪 "Grundisburgh Village Green" [Grundisburgh] → **THE VILLAGE INN** [West Runton, self-consistency 0.12 km]; "The Street" [Capel St. Mary] ×27 → **Beach Street, Felixstowe**; "foodPark" [Biomedical Campus] → **FoodPark CB1**. All three overrode a `findVenue` answer that named the right village.

*If this characterisation proved nothing:* a correlation between low self-consistency and winning is expected under **any** distance-minimising rule and would not, alone, prove the rule is wrong — the winner has to be near *something*. What makes it a defect rather than a description is the second column: the winner is simultaneously **far from the event**. Both columns together are what identifies the rule as measuring the wrong quantity, and I checked both.

### 5.2 Why the Wilbraham case passed

🧪 In that pair, `Gt Wilbraham` was **both** the most self-consistent candidate (0.02 km from CB21 5JQ) **and** the correct venue. **The two properties coincided.** The rule was validated on a case where its failure mode was invisible. ⚠️ **This is exactly the hazard the brief named — one anecdote is not a measurement — and it caught me.**

### 5.3 Where the signal actually is — an observation, not a proposal

🧪 The ground truth in this report came from a postcode **on the event row**, present on **400 of the 1,011** rows in this population. A rule keyed on the event's own published address would have scored 15/15 here by construction, because that is what defined ground truth — **so this observation cannot be treated as a validated alternative, only as a statement of where the independent information sits.** ⚠️ **It is available for at most 40% of the population and would need its own blind test.** I am not proposing it as a replacement rule.

---

## 6. VERDICT

🔴 **NOT SAFE. Do not run it unattended, and a category-name hold list does not rescue it** — §4.2 shows the same sign with every category family removed, and situations 14 and 15 (`The Plough`, `The Bell`) are ordinary pub names that no category list would catch.

**The rule should be withdrawn from `docs/event-linking-design-report.md` §5.3, not gated.** It does not need a threshold or an exception list; it measures the wrong quantity.

### 6.1 Is the sample strong enough to say that?

**For "not safe": yes.** 15 scoreable situations, 0 fixes, 8 breaks, corroborated by a 74.5% override rate across the full 1,011 rows. ⚠️ A rule that were merely neutral would have to have produced roughly as many fixes as breaks; **the probability of drawing 8 breaks and 0 fixes from a genuinely neutral rule is negligible**, and the mechanism in §5 explains the sign independently of the count. **The direction is not in doubt.**

**For a precision figure: no, and I will not give one.** 🔴 **15 of 34 situations scored is 44%, and the 19 UNRESOLVED are excluded rather than assumed.** Quoting "arbitration is 20% precise" from 15 situations would be the underpowered-sample-reported-as-validation the brief warns against. **What this sample supports is a sign and a mechanism, not a rate.**

### 6.2 What this says about `findVenue`

⚠️ 🧪 **11 of 15 — and its 4 failures are all the same shape**: the correct venue **did not exist** (situations 1, 3, 5, 13 — Southery, Newton Flotman, Great Chesterford, Langley), and it linked to a category row rather than returning `none`. 🔴 **That is the real defect in this data, and arbitration does not address it** — in all four, arbitration picked a wrong venue too. **The problem worth solving is "recognise that no venue exists", not "choose better between wrong ones".**

⚠️ Note also that `findVenue` marked situations 1 and 13 **low**, so two of its four errors would already have been held by the confidence gate. Its HIGH-tier record on this sample is **11 correct / 2 wrong** (situations 3 and 5).

---

## 7. WHAT REMAINS UNKNOWN

- 🔴 **19 of 34 situations are UNRESOLVED** — no published address on the event row. Whether the rule behaves differently where sources document less is **unmeasured**.
- ⚠️ **Ground truth is a postcode, not a venue identity.** Where a right row carries a sloppy coordinate I scored on identity; a stricter reading would lower **both** scores, not change their order.
- ⚠️ **20 of 359 venue postcodes are invalid partials.** Situations 13 and 14 show the effect — the only resolvable postcode in the set belonged to the wrong candidate, so arbitration was decided by a single point with nothing to check it against.
- 🔴 **No blind test of an event-postcode rule has been run.** §5.3 deliberately stops at an observation.
- ⚠️ **`findVenue`'s own precision** is 11/15 here and 7/9 on the Pizza Mondo sample — 🧪 **18/24 combined, on two small samples with different ground-truth methods.** Still not a validation set.

---

## 8. STATE AT END

Row counts END = START: `discovery_events` **4,300**, `venues` **559**, unlinked **2,229**.

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
?? supabase/migrations/20260903_hu_presence_flags.sql
?? supabase/migrations/20260903_outreach_contact_name.sql
?? supabase/migrations/20260903_outreach_dnc_entity.sql
?? supabase/migrations/20260903_outreach_tracking.sql
?? supabase/migrations/20260903_whatsapp_confirmed_nullable.sql
?? supabase/migrations/20260904_whatsapp_connections.sql
?? supabase/migrations/20260904_whatsapp_connections_token_issued_at.sql
?? supabase/migrations/20260907_discovery_run_log.sql
```

**0 staged.** `HEAD = 801de1c`, `origin/main = 08ac368`, local ahead 1 with the previously-committed demo-layout change, still unpushed. **No database row written. No migration. No code file changed. The only change to the tree is this report.**
