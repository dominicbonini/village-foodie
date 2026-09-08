# Guard three — postcode disagreement, flag only

**8 September 2026.** No database row inserted, updated or deleted. No migration. The Google Sheet was not modified. Nothing staged, committed, pushed; **`git add` was not run in any form**. `lib/venue-matcher.ts` untouched. The two committed guards untouched.

**Tags:** 🔎 SOURCE-READ · 🧪 EXECUTED · ⚠ qualified.

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 0. COUNTS AND SCOPE

| | START 15:12:18Z | END 15:15:40Z |
|---|---|---|
| `discovery_events` | **4,300** | **4,300** |
| `venues` | **559** | **559** |
| `discovery_trucks` | **231** | **231** |

**Extensions searched** (nothing scoped by extension; `scripts/run-scraper.js` is `.js` and was in scope): `.avif .bat .cjs .css .csv .entitlements .example .gitignore .gradle .html .ico .iml .jar .java .jpeg .jpg .js .json .log .md .mjs .pbxproj .plist .png .pro .properties .resolved .sql .storyboard .svg .swift .toml .ts .tsx .txt .webp .xcconfig .xcprivacy .xcscheme .xml .yml`

---

## 1. STEP 1 — STOP CONDITIONS CLEAR

🧪 All three files tracked and **clean**:

```
scripts/linking-guards.ts         status=(clean) tracked=yes
scripts/backfill-venue-id.ts      status=(clean) tracked=yes
scripts/backfill-venue-id-low.ts  status=(clean) tracked=yes
```

🧪 `e024b26` — *"Add category-name and bad-coordinate refusal guards to venue linking scripts"* — exists and contains all three (`linking-guards.ts` +142, `backfill-venue-id.ts` +58, `backfill-venue-id-low.ts` +53). ⚠️ HEAD has since moved to `6820d7b`; the three files remain clean at that commit. **Proceeded.**

---

## 2. STEP 2 — THE GUARD

**Appended to `scripts/linking-guards.ts` (+99 lines, 0 removals). 🧪 Lines 1–142 — guards one and two — are byte-identical to the committed file.**

| symbol | line | what it does |
|---|---|---|
| `POSTCODE_CONFIRM_KM = 0.5`, `POSTCODE_FLAG_KM = 2` | `:167-169` | the two thresholds, named |
| `extractPostcode(text)` | `:180` | returns `{full, partial}` — 🔴 **never expands a partial** |
| `buildPostcodeIndex(texts, fetch?)` | `:195` | resolves each **distinct** full postcode once, in bulk |
| `checkPostcode(aiNotes, target, idx)` | `:230` | the verdict; **pure**, index passed in |

**The verdict type makes the four states unmergeable at the type level:**

```ts
export type PostcodeVerdict =
  | { state: 'CONFIRMED' | 'NOTED' | 'FLAGGED'; postcode: string; km: number; pcLat: number; pcLng: number }
  | { state: 'UNCHECKED'; reason: string; postcode?: string }
```

**Wiring — 🔴 purely additive.** Each script gained four things: `ai_notes` on `EventRow`, `ai_notes` in the `select`, the import, and a report block. 🧪 `+32/-1` each; the `-1` is the `select` line. **The block runs *after* the bucket loop and assigns to nothing it did not create.** 🧪 The existing outputs are unchanged: high 22 / low 199 / refused 7+2 / held 43 — identical to the pre-guard-three run.

### 2.1 🔴 Why it does not decide

🔎 The other two guards return `{ok: false}` and the caller `continue`s. **This one returns an opinion and the caller does nothing with it but write a CSV.** No refusal, no substitution, no coordinate written anywhere.

**The case that forces this design, in the code comment at `:150-155`:** 🧪 `Thirsty` [Cambridge] carries `CB11 4RY`, which resolves to **Grange Farm, Langley Upper Green** — 24 km away — while the venue's stored coordinate is **correct for Cambridge**. There the **postcode** is the wrong half. **A rule that let the postcode win would have moved a correct pin.** §5.4.

---

## 3. STEP 3 — WHAT IT MUST NOT DO

| requirement | how it is met |
|---|---|
| 🔴 never write a coordinate from a postcode | 🔎 the module has no write path; the scripts' block only builds strings and calls `writeFileSync` on a CSV |
| 🔴 never treat a missing postcode as a problem | 🔎 `UNCHECKED` with `reason: 'no postcode in ai_notes'` — not a refusal, not a flag, not counted in the confirmed rate |
| 🔴 UNCHECKED must not collapse into the others | 🔎 it is a separate union member with no `km`; 🧪 the console prints it on its own line as **"NOT a pass"** with a per-reason breakdown |
| 🔴 partials counted separately, never guessed | 🔎 `extractPostcode` returns `partial` and `checkPostcode` returns `UNCHECKED` naming it; 🧪 observed `CB1` ×14, `CB4` ×10, `CB25` ×3, `CB11` ×3 |
| do not change `venue-matcher.ts` | 🧪 hash `eb7c6014742b4f95b3f65a1ce04728be68b5fa3c`, unchanged |
| do not change the committed guards | 🧪 lines 1–142 byte-identical |

⚠️ **And an outage is UNCHECKED, never agreement.** 🔎 `buildPostcodeIndex` catches a failed batch, sets `outage: true`, and leaves those postcodes unresolved — so every affected row becomes `UNCHECKED`. **It cannot fall through to "confirmed".** That is the rule `geo-validate.js` already states for postcodes.io.

---

## 4. STEP 4 — CACHING

🔎 Distinct postcodes are extracted first, then resolved in batches of 100 through the bulk endpoint.

🧪 **Whole backlog: 93 distinct postcodes across 1,684 candidate links → 1 API call.** 🧪 Script runs: 10 distinct → 1 call; 4 distinct → 1 call.

⚠️ **The 146 distinct in the brief is the count across *all* 4,300 rows; the candidate set is smaller.** At 146 it would be **2 calls**. **A full run costs 1–2 calls, not 1,104.**

---

## 5. STEP 5 — PROOF

### 5.1 Whole backlog — the expectation holds

🧪 The **real module**, imported (not retyped), over all 1,684 unlinked rows where `findVenue` returns a venue:

```
✅ CONFIRMED   307   46.7% of checked
·  NOTED       126   19.2%
🔴 FLAGGED     224   34.1%
⚠️  UNCHECKED 1027   (not a pass)
      no postcode in ai_notes ......... 952
      postcode did not resolve ........  45
      outward-only CB1/CB4/CB25/CB11 ..  30
postcodes.io: 93 distinct, 91 resolved, 1 API call, outage=false
unresolved: ["CB103HQ","CB215BQ"]
```

| | expected | observed |
|---|---|---|
| confirmed | 45.9% | **46.7%** |
| flagged (>2 km) | 33.6% | **34.1%** |

✅ **Within a point of the measurement in `docs/ai-notes-postcode-report.md`. Nothing has changed and the implementation matches.**

### 5.2 The scripts' own run — 🔴 and here the number is NOT the expected one

🧪 `backfill-venue-id.ts`: **221 candidates → CONFIRMED 12, NOTED 0, FLAGGED 4, UNCHECKED 205 (92.8%)**. `backfill-venue-id-low.ts`: 199 → 1 / 0 / 4 / 194.

🔴 **93% unchecked is nothing like 46.7%/34.1%, and I am flagging it rather than reporting it as normal.** The cause is scope, not a defect: 🔎 both scripts filter `.gte('event_date', today)` (`backfill-venue-id.ts:63`), and future events overwhelmingly lack postcodes. **Only 16 of 221 candidate links are checkable at all in the scripts' own scope.** ⚠️ **The guard is therefore near-silent where the scripts currently run, and informative only over the full backlog.**

### 5.3 The four established cases

**1) Pizza Mondo @ `foodPark` — 🟢 FLAGGED**
```
ai_notes "Unit 332, Cambridge Science Park, CB4 0WN"  →  CB4 0WN → 52.23396, 0.142344
findVenue → "foodPark" [Cambridge] (high)  stored 52.17510, 0.14150
⇒ 6.55 km  🔴 FLAGGED
```

**2) `Great Wilbraham` / `Gt Wilbraham` — 🟢 FLAGGED, and it separates the good rows from the bad**

⚠️ **The brief expected a flat "must FLAG". The truth is better and I am reporting it as it is:** the six Wilbraham rows split by which venue `findVenue` picks, and the guard tracks that split exactly.

```
"Gt Wilbraham"   → findVenue picks "Gt Wilbraham"    → CB21 5JQ  0.02 km  ✅ CONFIRMED   (×3 rows)
"Great Wilbraham"→ findVenue picks "Great Wilbraham" → CB21 5JQ  2.56 km  🔴 FLAGGED     (×3 rows)
```

🔴 **The flagged rows are precisely the ones where `findVenue` chose the venue that is 2.56 km from its own postcode.** A blanket flag on the pair would have been less useful.

**3) `Worlington` / `Workington` — 🟢 FLAGGED at 370.81 km**
```
ai_notes "Worlington Cricket Club, … " → IP28 8RU (West Suffolk)
target "Worlington Beer Festival" [Workington] stored 54.65450, −3.54560 (Cumbria)
⇒ 370.81 km  🔴 FLAGGED
```

⚠️ **Two corrections to my own earlier report.** (a) There are **two** rows, not one: the 29 Aug event carries `CA14 3YH` and village `Workington` and is **genuinely in Cumbria** — the guard returns **NOTED, 1.06 km**, correctly. Only the 30 Aug Suffolk event is wrong. **`docs/ai-notes-postcode-report.md` described this as a single mislocated venue; it is one venue serving two different places.** (b) 🔴 **Both rows are already LINKED**, so the guard as wired — which only sees unlinked candidates — **would never reach them.** §6.

**4) `Thirsty` [Cambridge] — 🟢 FLAGGED, and the postcode is the wrong half**
```
20 Thirsty rows: CB4 1EN ×13, none ×5, CB11 4RY ×2
CB4 1EN  "46 Chesterton Rd, Cambridge"        → 0.71 km  ·  NOTED
CB11 4RY "GRANGE FARM, LANGLEY UPPER GREEN"   → 24.14 km 🔴 FLAGGED
```

🔴 **The venue coordinate is correct for Cambridge. The postcode was lifted from elsewhere on the page. The guard flags it and says nothing about which half is wrong — that is the design, and this is the case that proves it.** ⚠️ **Anyone reviewing this flag must be able to conclude "the postcode is wrong", and the CSV gives them both coordinates to do so.**

### 5.4 🔴 Forcing both branches

**A guard flagging zero and a day where every postcode agrees are indistinguishable. So both branches were forced against a fixed target venue:**

```
a postcode 100+ km away      → FLAGGED (468.22 km)
outward-only "CB1"           → UNCHECKED — cannot place a point
no postcode at all           → UNCHECKED — no postcode in ai_notes
unresolvable full CB10 3HQ   → UNCHECKED — did not resolve at postcodes.io
```

⚠️ The agreeing case could not be forced on that target (it has no postcode of its own) — **but it is demonstrated by real data instead: 307 CONFIRMED rows and the Wilbraham 0.02 km case.** 🔴 **All four states are therefore observed, three synthetically and one at scale.** A guard doing nothing would show 0 FLAGGED and 0 CONFIRMED; a guard that flagged everything would show 0 CONFIRMED. **It shows 307 / 126 / 224 / 1,027.**

### 5.5 What is not verification

🧪 `npx tsc --noEmit -p tsconfig.json` → **0 errors**. ⚠️ **That is a typecheck, not verification.** The behavioural evidence is §5.1–5.4.

🔴 **None of this takes effect anywhere until the scripts are run by hand.** Both are emit-only (`--apply` unchanged and untouched), neither is invoked by any cron or workflow — 🧪 the three GitHub workflows and the six Vercel crons reference neither. **The guard runs when a human runs `npx tsx scripts/backfill-venue-id.ts`, and not before.**

---

## 6. LIMITATIONS

- 🔴 **The guard only sees unlinked candidates.** Damage already committed — `Worlington`, and the linked `Great Wilbraham` row — is invisible to it as wired. **Auditing existing links would need a separate pass over `venue_id IS NOT NULL`, which I have not built.**
- 🔴 **93% unchecked in the scripts' own scope** (§5.2). The guard is currently near-silent where it runs.
- ⚠️ **UNCHECKED is 61% of the whole backlog** and cannot be improved by better parsing — `Drive Screenshot`, `hg_scraper`, `hatchesup_scraper` and `Manual Entry` produce no postcodes at all.
- ⚠️ **`CB10 3HQ` does not exist** and 45 candidate rows carry it — the Off The Beaten Truck page publishes an invalid postcode.
- ⚠️ **224 flags is a review queue nobody has time for.** No triage order is proposed here; the CSV is sorted by nothing in particular.
- ⚠️ **The 2 km threshold is inherited from the measurement, not derived here.** A rural pitch legitimately far from its postcode centroid will flag.

---

## 7. STATE AT END

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

**0 staged.** `HEAD = 6820d7b`, `origin/main = 08ac368`. **Files this pass changed, and only these:**

| file | change |
|---|---|
| `scripts/linking-guards.ts` | **+99 / −0** — appended below line 142; guards one and two byte-identical |
| `scripts/backfill-venue-id.ts` | **+32 / −1** — `ai_notes` on the type and select, one import, one report block |
| `scripts/backfill-venue-id-low.ts` | **+32 / −1** — the same four |
| `docs/postcode-flag-guard-report.md` | this report |

⚠️ `lib/venue-matcher.ts` shows ` M` — that is your **pre-existing** V1.1 workstream; 🧪 its hash is unchanged at `eb7c6014742b4f95b3f65a1ce04728be68b5fa3c`. **No database row written, no migration, the Sheet not modified, nothing staged, committed, pushed or added.**
