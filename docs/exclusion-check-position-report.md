# Fix A — the exclusion check no longer silences a truck on its own page

**8 September 2026.** Scope: **defect A only.** B (`exclusionsToAdd` guard) and C (`finalVenue` stamp) were **not fixed, not prepared, and no scaffolding left for them**. No database row inserted, updated or deleted. The Google Sheet was not modified. No migration written. Nothing staged, committed, pushed; **`git add` was not run in any form**. `lib/venue-matcher.ts` untouched.

**Tags:** 🔎 SOURCE-READ · 🧪 EXECUTED · ⚠ qualified.

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 0. COUNTS AND SCOPE

| | START 13:48:36Z | END 13:51:38Z |
|---|---|---|
| `discovery_events` | **4,300** | **4,300** |
| `venues` | **559** | **559** |
| `discovery_trucks` | **231** | **231** |

**Extensions searched** (nothing scoped by extension; `scripts/run-scraper.js` is `.js` and was the subject): `.avif .bat .cjs .css .csv .entitlements .example .gitignore .gradle .html .ico .iml .jar .java .jpeg .jpg .js .json .log .md .mjs .pbxproj .plist .png .pro .properties .resolved .sql .storyboard .svg .swift .toml .ts .tsx .txt .webp .xcconfig .xcprivacy .xcscheme .xml .yml`

---

## 1. STEP 1 — GATE RE-CHECKED, NOTHING HAD MOVED

🧪 `git diff --stat -- scripts/run-scraper.js` **before my edit**: `310 insertions(+), 57 deletions(-)`, 41 hunks. 🧪 File hash `8ab9068441f8f3fa6a127969795360c644cb56dd` — **identical to the value recorded in the previous pass**, so nothing changed in between.

🧪 Re-derived the added/modified line set and intersected it with each defect's region:

| Defect | Region | Touched by the uncommitted diff | Verdict |
|---|---|---|---|
| **A** — exclusion check | 845–859 | **0** | ✅ **still pure context — proceed** |
| B — append | 772–804 | 14 | 🔴 out of scope, untouched |
| C — `finalVenue` | 898–914 | 0 | out of scope, untouched |

**Gate clear for A. Proceeded.**

---

## 2. STEP 2 — WHAT I CHANGED

**One file, one place: `scripts/run-scraper.js`, the fuzzy-exclusion block (working-tree `:849-870` after the edit).**

```diff
           // --- 🛡️ FUZZY EXCLUSION CHECK ---
+          // 🔴 SCOPED TO NON-TRUCK PAGES (8 Sep 2026). …
           const normRawTruck = normalizeName(truckName);
-          const isExcluded = Array.from(excludedTerms).some(ex => isFuzzyMatch(ex, normRawTruck));
+          const termHit = Array.from(excludedTerms).some(ex => isFuzzyMatch(ex, normRawTruck));
+          const isExcluded = termHit && site.sourceType !== 'truck';
           if (isExcluded) {
               console.log(`   🚫 Skipping excluded truck term: ${truckName}`);
               continue;
           }
+          if (termHit) console.log(`   ⚠️ "${truckName}" matches an Exclusions-tab term but this is its own page — set NOT applied (${site.url})`);
```

**The executable change is three lines: split the match into `termHit`, add `&& site.sourceType !== 'truck'`, and one near-miss log.**

### 2.1 Why this position is correct

🔎 The set's purpose is fixed by the prompt that fills it (`:689`, `:719`): *"explicit mentions that something is **NOT a food truck** (e.g., 'Live Music', 'Quiz Night')"*. It answers **"is this listing a food truck at all?"**

🔎 On a **truck** page that question is already settled before the check runs — `:885` sets `finalTruck = site.name` because the page *came from* the truck's own row in the site list. **There is no open question for the set to answer, so applying it can only produce a false positive**, and it did: 🧪 five real trucks silenced, Steak & Honour losing six correctly-extracted events from a page `scroll_lazy` read perfectly.

🔎 On a **venue** or aggregator page the listing genuinely may not be a truck — that is where `live music`, `quiz night`, `TBC` and `Transit Mot due` need to be dropped. **The check is unchanged there.**

### 2.2 Two choices I made, stated rather than buried

- **`!== 'truck'`, not `=== 'venue'`.** 🔎 Only two source types exist today (`:495` truck, `:526` venue), so they are equivalent now. They differ for a source type added later: `!== 'truck'` keeps the filter **on** by default. **Over-filtering announces itself — a truck goes quiet and someone asks. Under-filtering does not.** That is the manual's own rule applied to this line.
- 🔴 **The near-miss log is an addition beyond the minimum, and here is why.** Without it the fix is **invisible**: a poisoned term simply stops biting, and nobody ever learns the Exclusions tab still contains a truck name. 🧪 All three currently-blocked trucks return `termHit=true` — so this line fires on the next run and names them. **It is the only signal that the tab needs cleaning, and it costs one line.** ⚠️ It is *not* scaffolding for B: it writes nothing and guards nothing; it reports.

### 2.3 What I did not touch — verified, not asserted

| | |
|---|---|
| `normalizeName` / `isFuzzyMatch` | 🧪 `diff` of lines 55–90 before/after: **byte-identical** |
| `:772-805` (B's block) | 🧪 `diff` of that range before/after: **byte-identical** |
| `finalVenue = site.name` (C) | 🧪 still at `:920`, region shows **0** lines added by me |
| `lib/venue-matcher.ts` | 🧪 hash `eb7c6014742b4f95b3f65a1ce04728be68b5fa3c`, unchanged |
| the Google Sheet | not written — all reads used `spreadsheets.readonly` |

🧪 My edit adds **15 lines** (325 total added, up from 310); 12 are comment. ⚠️ **The comment is longer than the defect.** That is deliberate: the previous position looked correct to five readers, and a bare `&& site.sourceType !== 'truck'` invites someone to "simplify" it back.

🧪 `node --check scripts/run-scraper.js` → **parses**. ⚠️ **That is a syntax check, not verification.** The verification is §3.

---

## 3. STEP 3 — PROOF, RUN AGAINST LIVE DATA

**Method, stated so you can judge it.** I could not run the scraper itself: it writes to the Sheet and to `discovery_events`, both forbidden here. Instead the harness **slices `normalizeName`, `isFuzzyMatch` and the decision lines out of the shipped file as source text and evaluates them** — from `run-scraper.js` for the AFTER, and from a pre-edit copy for the BEFORE. **Nothing is retyped; if those bytes change, the harness changes with them.** The exclusion set is built by the file's own rule (`:453`) from the **live** Exclusions tab, and the site list by the file's own rules (`:483-499`, `:501-514`) from the **live** Trucks and Venues tabs.

🧪 Live inputs: **143** normalised terms, **116** sites (109 truck, 7 venue).

### 3.1 The three blocked trucks — the events they now keep

| Truck | `sourceType` | BEFORE | AFTER | effect |
|---|---|---|---|---|
| **Axle & Hop** | truck | `isExcluded=true` | `isExcluded=false` | 🟢 every event on its page now kept |
| **Dessert MK** | truck | `isExcluded=true` | `isExcluded=false` | 🟢 every event now kept |
| **The Linton Kitchen** | truck | `isExcluded=true` | `isExcluded=false` | 🟢 every event now kept |

🔴 **A count of events "previously discarded" cannot be given, and I will not estimate one.** 🔎 The discard at `:857` is a `continue` with a `console.log` and no counter reaching any store; `discovery_run_log.events_filtered` would have held exactly this and **its migration is still unapplied**. The only trace was a GitHub Actions log under its own retention.

🔴 **AND THE HONEST CAVEAT: on the next run these three will probably still yield zero events, for an unrelated reason.** 🧪 I fetched all three pages with the real `performModernScroll`:

```
Axle & Hop          1,682 chars · login-wall markers YES · 0 day/date tokens
Dessert MK          2,306 chars · login-wall markers YES · 2 day/date tokens
The Linton Kitchen  2,320 chars · login-wall markers YES · 1 day/date token
```

**All three are Facebook, and all three return a logged-out wall** — the separate capture failure in `docs/scroll-lazy-silence-report.md` §4.2. **Fix A removes the exclusion barrier; the Facebook barrier is still there and is not this fix's job.** ⚠️ **So do not read "three trucks unblocked" as "three trucks will start producing events."** The trucks this protects in practice are ones with readable pages whose names reach the tab in future — Steak & Honour was exactly that case.

### 3.2 Non-event terms are still filtered on a venue page

🧪 Page: **`Off The Beaten Truck - The Common`**, `https://www.offthebeatentruck.co.uk/saffron-walden`, `sourceType=venue`.

| extracted listing | BEFORE | AFTER | |
|---|---|---|---|
| `live music` | true | **true** | 🚫 dropped |
| `quiz nights` | true | **true** | 🚫 dropped |
| `TBC` | true | **true** | 🚫 dropped |
| `Transit Mot due` | true | **true** | 🚫 dropped |
| `Private Party` | true | **true** | 🚫 dropped |
| `FUNKY//LAUNCHER/BONGOS` | false | false | ✅ kept (not in the set) |
| `Buffalo Joe's` | false | false | ✅ kept |

**Not one venue-page verdict changed.**

### 3.3 🔴 What it would look like if the fix were doing NOTHING — and how I ruled that out

**A run on a quiet day is indistinguishable from a fix that works and a fix that does nothing.** So I forced both branches with the **same** term rather than waiting for one to occur:

```
"Dessert MK" on a VENUE page → termHit=true, isExcluded=true   ⇒ 🚫 dropped
"Dessert MK" on a TRUCK page → termHit=true, isExcluded=false  ⇒ 🟢 kept, near-miss logged
```

🔴 **Same term, same matching logic, opposite outcomes, decided only by `sourceType`.** A fix doing nothing would give `isExcluded=true` in both rows; a fix that deleted the check would give `false` in both. **Neither is what the real sliced code produces.**

### 3.4 🔴 What it would look like if it had gone TOO FAR — and how I ruled that out

I fed **every one of the 143 tab terms** back in as an extracted name, against both source types:

```
on a VENUE page → excluded 143/143   🟢 the set is FULLY INTACT
on a TRUCK page → excluded   0/143   🟢 correctly never applied
```

🔴 **143/143 is the number that rules out a disabled check.** If the edit had weakened the set, that figure would be below 143 — and `live music`, `quiz nights`, `TBC` and `Transit Mot due` are all inside those 143, still excluded, shown individually in §3.2.

### 3.5 Blast radius

🧪 **3 of 116 sites change verdict: `Axle & Hop`, `Dessert MK`, `The Linton Kitchen`.** No venue site changes; no other truck site changes. ⚠️ This measures each site's **own name** against the set — a truck-page event whose *extracted* name differs from the site name could also change, and that is not enumerable without running the scraper.

### 3.6 Limits of this proof, stated plainly

- ⚠️ **The scraper was not executed.** The decision lines are real and live-fed; the surrounding loop, the model call and the writes were not exercised.
- ⚠️ **`node --check` is a parse, not a test.** The behavioural evidence is §3.1–3.4.
- ⚠️ **No count of historically discarded events exists** (§3.1).
- 🔴 **This takes effect only when deployed.** The change is in an uncommitted working tree. It reaches production only after you stage it, commit, push, and **the `daily_scrape.yml` 06:00 cron fires — that cron is the first thing that will exercise it**, and the near-miss line in §2.2 is what will show it fired.

---

## 4. WHAT REMAINS OPEN

- 🔴 **B and C are unfixed**, deliberately. B's guard still cannot be staged separately from the awaited-writes hunk at `:779`.
- 🔴 **The Exclusions tab still contains truck names** — `Axle & Hop` (as `AXLE + HOP`), `Dessert MK`, `The Linton Kitchen`, plus business-shaped entries not currently in the site list. **A stops them silencing a truck; it does not clean the tab.** Yours to remove by hand.
- 🔴 **The Facebook capture failure** (§3.1) blocks these same three trucks by a different mechanism.
- ⚠️ **Nothing prevents a new truck name reaching the tab** — that is B.
- ⚠️ Whether an extracted name that differs from its site name can still be wrongly excluded on a truck page: **it cannot** (the check no longer runs there at all), but the reverse — a genuine non-truck listing on a truck's own page now passing through — is a real consequence. 🧪 Zero of the 143 terms fire on truck pages, so nothing is being let through today, **but a truck page that lists a quiz night will now keep it.** Recorded as the accepted cost of this position.

---

## 5. STATE AT END

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

**0 staged.** `HEAD = 801de1c`, `origin/main = 08ac368`. `scripts/run-scraper.js` now shows `325 insertions(+), 58 deletions(-)` — **the 310/57 that were yours, plus my 15 added and 1 replaced.** ⚠️ My change sits at `:849-870`; the nearest pre-existing change is at `:802`, **47 lines away**, so `git add -p` will offer it as a separate hunk.
