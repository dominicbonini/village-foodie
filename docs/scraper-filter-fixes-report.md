# Three scraper filter fixes — 🔴 STOPPED AT THE STEP 1 GATE, NOTHING EDITED

**8 September 2026.** 🔴 **No fix was applied. `scripts/run-scraper.js` was not modified — its hash is unchanged and its diff is byte-identical to what it was before this session.** No database row inserted, updated or deleted. The Google Sheet was not modified. No migration written. Nothing staged, committed, pushed; `git add` not run in any form. The only file written is this report.

**Tags:** 🔎 SOURCE-READ · 🧪 EXECUTED · ⚠ qualified.

---

## 0. COUNTS AND SCOPE

| | START 13:43:39Z | END 13:45:01Z |
|---|---|---|
| `discovery_events` | **4,300** | **4,300** |
| `venues` | **559** | **559** |
| `discovery_trucks` | **231** | **231** |

**Extensions searched** (nothing scoped by extension; `scripts/run-scraper.js` is `.js` and was the subject throughout): `.avif .bat .cjs .css .csv .entitlements .example .gitignore .gradle .html .ico .iml .jar .java .jpeg .jpg .js .json .log .md .mjs .pbxproj .plist .png .pro .properties .resolved .sql .storyboard .svg .swift .toml .ts .tsx .txt .webp .xcconfig .xcprivacy .xcscheme .xml .yml`

---

# 🔴 STEP 1 — THE STOP CONDITION IS MET. I HAVE CHANGED NOTHING.

> Your gate: *"If the existing change touches any of the three lines below, STOP and report rather than editing over it."*

🧪 **It touches one of them — defect B.** Measured, not eyeballed: I reconstructed the exact set of working-tree line numbers that the uncommitted diff adds or modifies (310 lines across 41 hunks) and intersected it with each defect's region.

| Defect | Region (working-tree lines) | Lines the uncommitted change touches | Verdict |
|---|---|---|---|
| **A** — exclusion check | 845–859 | **0** | ✅ **clear** |
| 🔴 **B** — `exclusionsToAdd` append | 772–804 | **14** → `773, 774, 775, 776, 777, 779, 792, 794, 795, 796, 797, 798, 799, 802` | 🔴 **TOUCHED — GATE TRIPPED** |
| **C** — `finalVenue` stamp | 898–914 | **0** | ✅ **clear** |

⚠️ **A precise qualification, because it matters and the loose version would be wrong.** Lines **784–790 literally** — the `values.append({…})` call you cited — are **unmodified context**. What the uncommitted workstream changed is the block *around* them: the loop header at `779`, the comment at `773–777`, and the awaited upsert plus `dbWriteFailures` at `792–802`.

🔴 **That is worse for your purposes, not better, and it is the whole reason I stopped.** The guard you asked for belongs immediately after `const cleanEx = normalizeName(ex)` — working-tree line **~781**. That is **2 lines** after the modified line `779`. 🧪 **With git's default 3-line context, an insertion at 781 and the existing change at 779 fall inside the same hunk, so `git add -p` could not offer them to you separately.** Staging my guard would force you to stage the `forEach → for…of` + `await` + `dbWriteFailures` conversion with it, or neither.

**You told me you stage by hand with `git add -p` precisely to keep six workstreams apart. An edit there would have destroyed that separation for this file, silently.** So I stopped.

## 0.1 🔴 AND AN INSTRUCTION CONFLICT, WHICH YOU ASKED ME TO SURFACE RATHER THAN RESOLVE

- *"THREE DEFECTS … **Fix all three**; change nothing else."*
- *"STEP 1 — STOP CONDITION … If the existing change touches **any** of the three lines below, **STOP and report rather than editing over it**."*

**Both cannot be satisfied.** The gate says *any*, and B qualifies. Your standing rule — *"if any instruction contradicts another, STOP and ask rather than choosing"* — decides it. **I have not chosen.** §5 asks the question.

---

## 1. WHAT THE EXISTING UNCOMMITTED CHANGE DOES

🧪 `git diff --stat -- scripts/run-scraper.js`:

```
 scripts/run-scraper.js | 367 +++++++++++++++++++++++++++++++++++++++++--------
 1 file changed, 310 insertions(+), 57 deletions(-)          — 41 hunks
```

🔎 Read from the diff itself, this is the **V1.1 "every silent failure presents as success" workstream**, and it is four things bundled:

| # | What it does | Evidence in the diff |
|---|---|---|
| 1 | **Turns eight silent-success paths into hard failures.** | `+import { assertSheetTabsLoaded, assertSitesToScrape, assertSomeSiteSucceeded, assertInboundOk, assertNoWriteFailures }`, plus `getTabData` now `throw`s instead of `catch { return [] }`, and `assertSitesToScrape(sitesToScrape.length)` |
| 2 | **Awaits every previously fire-and-forget DB write** and collects failures. | `dbWriteFailures` ×8, `+ const { error: exErr } = await supabase…`, `assertNoWriteFailures` |
| 3 | **Adds per-site run logging.** | `DISCOVERY_RUN_ID`, `randomUUID`, `discovery_run_log` ×6, `siteLog.{outcome,extracted,filtered,new,duplicates,pageChars,error,notes}` — ⚠️ writing to a table whose **migration is still not applied** |
| 4 | **Replaces the geocoder with a validated resolver.** | `resolveCoordinates`, `throw new Error('Geocode reply was not a JSON array…')`, a sentinel census that throws on read failure, `venueWriteFailures` |

⚠️ **None of that overlaps defects A or C.** It overlaps B only in the way described above.

---

## 2. THE THREE DEFECTS — CONFIRMED AGAINST THE WORKING TREE, NOT RE-DERIVED FROM THE REPORTS

I re-read each line rather than trusting the earlier reports.

### A — `:851`, the exclusion check is applied to the truck itself

🔎 Working tree:
```
:850   const normRawTruck = normalizeName(truckName);          ← the model's EXTRACTED name
:851   const isExcluded = Array.from(excludedTerms).some(ex => isFuzzyMatch(ex, normRawTruck));
:852-855   if (isExcluded) { console.log(`   🚫 Skipping excluded truck term: ${truckName}`); continue; }
…
:870-872   if (site.sourceType === 'truck') { finalTruck = site.name; }
```
✅ **Confirmed, and untouched by the uncommitted change.**

**What I would change, and why that position is correct:** scope the check to `site.sourceType === 'venue'`. 🔎 On a truck page `finalTruck` is `site.name` by construction (`:871`), so the truck's identity is *already known from the site list* — the set has no question to answer there. On a venue or aggregator page the listing genuinely may not be a food truck, which is exactly what `live music` / `quiz night` / `TBC` exist to catch. 🧪 **All five trucks silenced by this were `sourceType: 'truck'`, so scoping alone fixes every observed case while leaving the set's real job intact.** ⚠️ Deleting the check would not be equivalent and I would not do it.

### B — `:778-790`, `exclusionsToAdd` is unguarded

🔎 The complete guard today is `if (ex && typeof ex === 'string')`, `const cleanEx = normalizeName(ex)`, and a fuzzy not-already-present test. 🔎 `validTrucks` is built at `:455` and **is in scope at this point** — nothing consults it.
✅ **Confirmed.** 🔴 **Gate tripped — not edited.**

### C — `:906`, `finalVenue = site.name` discards the model's venue

🔎 Working tree:
```
:902   let finalVenue = venueName || "Unknown";
:905   if (site.sourceType === 'venue') {
:906       finalVenue = site.name;
:907       confirmedVenue = site.name;
:908   } else { …postcode/fuzzy venue resolution… }
```
✅ **Confirmed, and untouched.** The model's `venueName` is computed at the top of the loop and then overwritten unconditionally for every venue-sourced site.

---

## 3. WHAT C WOULD AFFECT — MEASURED, SINCE YOU ASKED FOR THE BLAST RADIUS

⚠️ This is the one part of Step 4 I can answer without editing anything, because it is a property of the site list and the data, not of the fix.

🧪 The Venues tab contributes **7 sites**; `finalVenue = site.name` applies to **all 7**:

| Sheet row | site name | URL | pitches on the page | would C change its output? |
|---|---|---|---|---|
| 359 | Off The Beaten Truck - The Common | …/saffron-walden | 🔴 **2** | 🔴 **YES** |
| 360 | Off The Beaten Truck - The Railway Arms | …/saffron-walden ← **same URL** | 🔴 **2** | 🔴 **YES** |
| 361 | Off The Beaten Truck - Northstowe | …/northstowe | 1 | no — one pitch, so model and site name agree |
| 362 | Off The Beaten Truck - Alconbury | …/alconbury | 1 | no |
| 363 | Off The Beaten Truck - Wintringham | …/wintringham | 1 | no |
| 5 | Nethergate Brewery | nethergate.co.uk/pages/long-melford | ⚠️ **UNREAD** | ⚠️ unknown |
| 26 | The White Horse | facebook.com/EdwardstoneWH/ | ⚠️ **UNREAD** | ⚠️ unknown |

🔴 **Saffron Walden is the only multi-pitch site established, and it is the only URL listed twice.** 🧪 On the live page today the Railway Arms pass returns **9** trucks when the true split is **7 at The Common / 2 at The Railway Arms** — so C would correct **7 of 9** rows on that pass, per run, indefinitely.

⚠️ **Two venue sites were never fetched**, so "C affects only Saffron Walden" is **not** established. **Those two reads are outstanding.**

🔴 **And a caution about C that the brief's framing understates.** *"Use the model's venue when it is present and resolves to a known venue"* — 🧪 on today's page the Railway Arms pass returned `"Venue Name": "The Railway Arms"` for **all nine** trucks, including the seven at The Common. **The model's field was uniformly wrong on that pass, so C would not have corrected those seven; it would have relabelled all nine "The Railway Arms" just the same.** C fixes the case where the model *does* distinguish the pitches and the code throws it away — which is a real case — **but it is not a complete fix for Saffron Walden, and I would not have claimed it was.** The double-listing in the Sheet is the root, and that is yours to remove by hand.

---

## 4. 🔴 WHAT I DID NOT DO, STATED PLAINLY

- ❌ No fix applied. **A and C were clear and I still did not apply them**, because your gate says *any* of the three tripping means stop.
- ❌ **No Step 4 proof exists**, and I will not present one. You asked for before/after from the **real code path**; with no edit there is no "after". 🔴 **Presenting a simulation as proof would be the exact failure your brief guards against** — *"A that silences nothing and A that silences everything both produce a clean run on a day with no exclusions proposed."*
- ❌ `lib/venue-matcher.ts` untouched. ❌ Sheet untouched — Venues rows 359/360 and the "Do NOT extract Kerief or Just Baked By Sophie" clause are as they were. ❌ No link applied, no venue created, nothing deleted.
- 🧪 `scripts/run-scraper.js` diff is **still `310 insertions(+), 57 deletions(-)`** — identical to before this session.

⚠️ **And the standing fact regardless of what happens next: none of this takes effect until deployed. These changes live in an uncommitted working tree, and the first thing that would exercise them is the `daily_scrape.yml` 06:00 cron — after a commit, a push, and that cron firing.**

---

## 5. THE QUESTION — HOW DO YOU WANT B HANDLED?

A and C are separable from your workstream and I can apply them on your word. B is the one that needs your decision:

1. **Apply A and C only**, leave B for after you have staged the awaited-writes workstream. **Cleanest — B's guard then lands on committed code and is trivially separable.**
2. **Apply all three**, accepting that B's guard and the `forEach → for…of` conversion will arrive in one `git add -p` hunk for this file.
3. **Apply none** until you have staged the existing change; then all three land clean.

⚠️ **My recommendation is (1) or (3)**, on the evidence in §0: 🧪 the tab's three poisoned rows have already been removed by hand, and 🧪 only **3** site-list trucks are currently blocked (`Axle & Hop`, `Dessert MK`, `The Linton Kitchen`) — **all three of which fix A resolves, since all are `sourceType: 'truck'`.** 🔴 **B guards against recurrence, not against present damage, so it is the least urgent of the three despite being the root cause of the class.**

---

## 6. STATE AT END

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

**0 staged.** `HEAD = 801de1c`, `origin/main = 08ac368`. **The only change to the tree is this report. `scripts/run-scraper.js` is exactly as you left it.**
