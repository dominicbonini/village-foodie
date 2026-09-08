# WhatsApp landing copy — is it committed, and how to hold it back

**8 September 2026 · READ-ONLY INVESTIGATION.** **No file changed.** Nothing reverted, checked out, restored, stashed or discarded. Nothing staged, committed, pushed; **`git add` was not run in any form**. No database row written. **No fix proposed.**

**Tags:** 🔎 SOURCE-READ · 🧪 EXECUTED · ⚠ qualified.

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 0. COUNTS AND SCOPE

| | START 15:22:46Z | END (§8) |
|---|---|---|
| `discovery_events` | **4,300** | 4,300 |
| `venues` | **559** | 559 |
| `discovery_trucks` | **231** | 231 |

**Extensions searched** (nothing scoped by extension): `.avif .bat .cjs .css .csv .entitlements .example .gitignore .gradle .html .ico .iml .jar .java .jpeg .jpg .js .json .log .md .mjs .pbxproj .plist .png .pro .properties .resolved .sql .storyboard .svg .swift .toml .ts .tsx .txt .webp .xcconfig .xcprivacy .xcscheme .xml .yml`

---

# 🔴 THE ANSWER: IT IS UNCOMMITTED. NO REVERT IS NEEDED.

**Production at `origin/main` (08ac368) already shows "coming soon". The go-live copy exists only in your working tree.** You do not need to undo anything — you need to *not stage* certain hunks.

⚠️ **And the state is three-way, not two-way, which the premise did not allow for.** `HEAD` is **`6820d7b`**, three commits ahead of `origin/main`:

```
6820d7b  Track scraper reference manual (V1.1 to V1.2) and update app manual to V12.4
e024b26  Add category-name and bad-coordinate refusal guards to venue linking scripts
801de1c  Provision demo trucks with the One-page Add Order layout
```

🧪 **None of the three touches any WhatsApp landing file.** So the copy is uncommitted in the strongest sense: not in production, and not in your local commits either.

---

## 1. THE EVIDENCE FOR "UNCOMMITTED"

🧪 Side by side, `git show origin/main:<file>` against the working tree:

| file | **at `origin/main` (production)** | working tree |
|---|---|---|
| `lib/plan-features.ts` | `:282` `{ name: 'WhatsApp auto-replies', footnote: '4', … pro: 'coming_soon', max: 'coming_soon' }` | `:293` `footnote: '6', … pro: true, max: true` |
| `app/landing/page.tsx` | `:200` `<h3>Social media auto-replies — coming soon</h3>` | `:218` `<h3>WhatsApp auto-replies</h3>` |
| `app/landing/page.tsx` | `:361` `<li>WhatsApp, Messenger &amp; Instagram auto-replies <span className="soon-inline">Coming soon</span></li>` | `:390-391` split into two `<li>`, WhatsApp with **no badge** |
| `lib/landing-table.ts` | `:52`, `:57` merged-row overrides present | overrides **removed** |
| `app/manage/[token]/page.tsx` | `:8444` `const WHATSAPP_LIVE: boolean = false` | `:8506` `= true` |

🧪 **Corroborated by history search, with a control** — because a string absent from history and a string searched with the wrong wording both return zero:

```
git log -S "WhatsApp auto-replies</h3>"        --all →  0 commits
git log -S "WHATSAPP_LIVE: boolean = true"     --all →  0 commits
CONTROL: -S "Social media auto-replies — coming soon" → 1 commit   ← the OLD string IS in history
CONTROL: -S "WHATSAPP_LIVE: boolean = false"          → 2 commits  ← the OLD string IS in history
```

🔴 **The controls fire and the targets do not. The search method works; the go-live strings have never been committed.**

⚠️ **One nuance that keeps this honest.** 🧪 `git log -S "Your WhatsApp gets answered" --all` returns **3** commits — because present-tense WhatsApp copy *did* exist historically and was changed to "coming soon". 🔎 §44 records exactly this: *"This block used to read WhatsApp in the PRESENT tense … because it was expected to ship at launch."* **So the working tree is a restoration of previously-shipped wording, not new text.** That does not change the answer to your question — it is still uncommitted — but "never existed" would have been wrong.

### 1.1 🔴 The manual is out of step with production, and it is the manual that is wrong

🔎 §44's standing rule reads: *"Applied today: **WhatsApp is present tense**; Messenger and Instagram carry 'coming soon'."*

🧪 **Production does not do that.** At `08ac368` the landing page carries `Social media auto-replies — coming soon`, and the matrix row is `coming_soon` on both tiers. **§44 describes the working tree, not the deployed product.** The rule itself is sound; only its "applied today" example is stale.

---

## 2 & 3. BEFORE AND AFTER, VERBATIM

**`app/landing/page.tsx` — the "what it does" tile**

| | |
|---|---|
| **BEFORE** (`origin/main:200`, last held by **`3807547`** *"landing update"*, 3 Sep 2026) | `<div className="does-item"><h3>Social media auto-replies — coming soon</h3><p>“Where are you tonight?” “What desserts do you have?” Soon your WhatsApp will get answered while you’re driving to the pitch or at the grill. Messenger and Instagram to follow.</p></div>` |
| **NOW** (working tree `:218`) | `<div className="does-item"><h3>WhatsApp auto-replies</h3><p>“Where are you tonight?” “What desserts do you have?” Your WhatsApp gets answered while you’re driving to the pitch or at the grill, using your own menu and schedule. Messenger and Instagram coming soon.</p></div>` |

**`app/landing/page.tsx` — the Pro-card bullet**

| | |
|---|---|
| **BEFORE** (`origin/main:361`) | `<li>WhatsApp, Messenger &amp; Instagram auto-replies <span className="soon-inline">Coming soon</span></li>` |
| **NOW** (`:390-391`) | `<li>WhatsApp auto-replies<sup className="f-note">6</sup></li>`<br>`<li>Messenger &amp; Instagram auto-replies <span className="soon-inline">Coming soon</span></li>` |

**`lib/plan-features.ts` — the matrix row**

| | |
|---|---|
| **BEFORE** (`origin/main:282`) | `{ name: 'WhatsApp auto-replies', footnote: '4', detail: 'Auto-reply to WhatsApp enquiries about your menu and schedule.', starter: false, pro: 'coming_soon', max: 'coming_soon' }` |
| **NOW** (`:293`) | `{ name: 'WhatsApp auto-replies', footnote: '6', detail: 'Auto-reply to WhatsApp enquiries about your menu and schedule.', starter: false, pro: true, max: true }` |

**`lib/landing-table.ts` — the two overrides**

| | |
|---|---|
| **BEFORE** (`origin/main:52`, `:57`, last held by **`f4084e2`** *"pre launch"*, 2 Sep 2026) | `'WhatsApp auto-replies': 'Auto-reply to enquiries about your menu and schedule on WhatsApp, Messenger and Instagram.',`<br>`'WhatsApp auto-replies': 'WhatsApp, Messenger & Instagram auto-replies',` |
| **NOW** | both **deleted**, replaced by comment blocks at `:56-58` and `:66-71` |

**`app/manage/[token]/page.tsx` — the flag**

| | |
|---|---|
| **BEFORE** (`origin/main:8444`) | `const WHATSAPP_LIVE: boolean = false` |
| **NOW** (`:8506`) | `const WHATSAPP_LIVE: boolean = true` |

---

## 4. 🔴 THE PER-HUNK MAP — THE LIST FOR `git add -p`

**Hunk headers are against `git diff origin/main`. Three of the four files mix two workstreams.**

### `app/landing/page.tsx` — 3 hunks

| # | header | workstream | stage it? |
|---|---|---|---|
| 1 | `@@ -179,25 +179,48 @@` | 🔴 **MIXED — WhatsApp *and* Android** | see below |
| 2 | `@@ -338,8 +361,11 @@` | **Android only** — `Android kitchen app Coming soon` → `iPhone, iPad and Android kitchen app` | ✅ stage |
| 3 | `@@ -358,7 +384,18 @@` | **WhatsApp only** — the bullet split | ❌ leave |

🔴 **Hunk 1 cannot be split by `git add -p`.** 🧪 It contains **one contiguous run** of changed lines, so `s` will not divide it — the WhatsApp `<div className="does-item"><h3>WhatsApp auto-replies</h3>…` and the Android comment `🟢 "Android coming soon." REMOVED 5 September 2026` sit inside the same block with no unchanged line between them. **You will need `e` and delete the WhatsApp lines by hand.**

### `lib/plan-features.ts` — 5 hunks

| # | header | workstream | stage it? |
|---|---|---|---|
| 1 | `@@ -192,24 +192,27 @@` | **Android** — merges `iPhone and iPad` + `Android kitchen app` into one row | ✅ stage |
| 2 | `@@ -269,17 +272,25 @@` | **WhatsApp** — `footnote '4'→'6'`, `coming_soon → true` | ❌ leave |
| 3 | `@@ -483,11 +494,25 @@` | 🔴 **MIXED** — footnote **3** loses "with Android coming soon" (Android) *and* footnote **4** loses the "reply yourself" clause (WhatsApp) | `e` |
| 4 | `@@ -499,6 +524,30 @@` | **WhatsApp** — adds `number: '6'` | ❌ leave |
| 5 | `@@ -522,7 +571,10 @@` | **Android** — `ROW_FEATURE_MAP` key renamed to match hunk 1 | ✅ stage |

### `lib/landing-table.ts` — 1 hunk

| # | header | workstream | stage it? |
|---|---|---|---|
| 1 | `@@ -47,28 +47,47 @@` | 🔴 **MIXED** — `Offline Order Protection` detail gains Android (Android) *and* both WhatsApp overrides are removed (WhatsApp) | `e` |

### `app/manage/[token]/page.tsx` — 18 hunks

| # | header | workstream |
|---|---|---|
| 9 | `@@ -8441,7 +8503,7 @@` | 🔴 **WhatsApp — the `WHATSAPP_LIVE` flip** |
| 11–17 | `@@ -9168…`, `@@ -9655…`, `@@ -9676…`, `@@ -9735…`, `@@ -9763…`, `@@ -9800…` | **WhatsApp** — embedded signup, reply-cap copy, badge removal |
| 1–8, 10, 18 | `@@ -34…`, `@@ -72…`, `@@ -205…`, `@@ -317…`, `@@ -348…`, `@@ -738…`, `@@ -816…`, `@@ -7297…`, `@@ -8701…`, `@@ -9963…` | **Custom domain + venue-confidence banners + Get-the-app card** |

⚠️ **This file is the one where "WhatsApp" is not only landing copy** — hunks 11–17 are the embedded-signup feature, a separate workstream from the landing wording. **Holding back the landing copy does not require holding those.**

### `components/landing/LandingFooter.tsx` — 3 hunks

🧪 **Zero WhatsApp mentions in the file.** Pure Android / store-badge work. ✅ **Stage freely.**

---

## 5. IS IT ONLY COPY? — 🔴 NO. ONE CHANGE IS BEHAVIOURAL.

| change | kind | why |
|---|---|---|
| landing tile, bullet, `landing-table` overrides, footnote text | **textual** | rendered strings only |
| `plan-features` row `coming_soon → true` | ⚠️ **presentational, with a behavioural edge** | it feeds `isRowComingSoon()` (`app/manage/[token]/page.tsx:8508`), which drives the Messenger/Instagram badges on the Settings card. Changing the WhatsApp cell does not move those, but the two are read by the same function |
| 🔴 **`WHATSAPP_LIVE: false → true`** | 🔴 **BEHAVIOURAL** | 🔎 `:9968` `{WHATSAPP_LIVE && can('whatsapp_replies') ? (` — it gates the **editable sender input and the Connect button** on Manage → Settings. Flipping it exposes a working control |

### 5.1 🟢 The plan gate is NOT part of this change

🧪 **`lib/features.ts` has no diff against `origin/main` at all.** 🔎 `:51` already lists `'whatsapp_replies'` in `PRO_FEATURES`, and `:55` folds those into Max.

🔴 **So `canAccess('pro','whatsapp_replies')` is already `true` in production today.** The feature is not gated by plan — only the **UI** is gated, by `WHATSAPP_LIVE`. **Nothing you stage or leave changes who is allowed the feature.**

### 5.2 🟢 The module-load parity guard is safe either way — checked, not assumed

🔎 `lib/plan-features.ts:616-645` runs `findPlanParityViolations()` **at module load**, and 🔎 **throws** when `NODE_ENV !== 'production'`. Its test is `row[tier] === true && !canAccess(tier, feature)`.

🧪 **Both states pass:**
- **Working tree** — `pro: true` and `canAccess` is `true` ⇒ no violation.
- **`origin/main`** — `pro: 'coming_soon'` is not `=== true`, so the guard skips the row ⇒ no violation.

🔴 **Leaving the WhatsApp hunks unstaged cannot break the build.** ⚠️ **If this proved nothing:** a guard that never fires would look identical. It is not inert — 🔎 `:283` records this row being *deliberately armed*, and `:430`/`:600` record other rows being dropped from it. **The mechanism is live; this particular row is clean in both states.**

### 5.3 🔴 TWO CROSS-HUNK DEPENDENCIES — stage these together or not at all

1. **plan-features hunk 2 needs hunk 4.** Hunk 2 points the WhatsApp row at `footnote: '6'`; hunk 4 is what *creates* footnote 6. 🧪 `origin/main` has footnotes `1,2,3,4,5`; the working tree has `1,2,3,4,5,6`. **Staging hunk 2 without hunk 4 renders a superscript 6 with no footnote behind it.** Since you are leaving both, this is fine — **but do not stage one alone.**
2. **plan-features hunk 1 needs hunk 5.** Hunk 1 renames the row to `iPhone, iPad and Android kitchen app`; hunk 5 updates `ROW_FEATURE_MAP` to match. 🔎 `:616-622` — the guard `continue`s on a row with no map entry, so **staging hunk 1 without hunk 5 silently drops that row from the parity check** rather than erroring. ⚠️ **This is the Android workstream, not WhatsApp, but it is the sharper trap of the two.**

⚠️ **And one thing you are safe on:** 🔎 §44 records `hide_pricing` masking footnote 2 by the magic string `f.number !== '2'`. 🧪 Adding footnote 6 **appends** — numbers 1–5 are unmoved — so that key is undisturbed whether or not you stage it.

---

## 6. THE SWITCH-ON PATH — WHAT EXISTS

**Two mechanisms, and only one of them is a flag.**

**A flag exists, and it governs the Manage page only.** 🔎 `app/manage/[token]/page.tsx:8506`:
```ts
const WHATSAPP_LIVE: boolean = true    // origin/main :8444 has `= false`
```
🔎 Its own comment: *"TYPED `boolean`, NOT INFERRED AS `false`, ON PURPOSE: it keeps both JSX branches type-checked… The live branch is not dead code — it is the code this flag exists to bring back."* 🧪 It is read at `:9967` and `:9968`, and both branches are present in the file. **This is a real, deliberate switch and it works.**

🔴 **But there is NO flag for the landing copy.** 🧪 The landing tile, the Pro-card bullet and the `landing-table` overrides are plain literals with no conditional. 🎯 **So switching WhatsApp on later is: flip one constant, and hand-edit the landing strings back.** There is no single toggle covering both, and I am not inventing one.

⚠️ **The cheapest sequence given that the copy is uncommitted:** stage everything except the WhatsApp hunks in §4, deploy, and keep the WhatsApp changes in your working tree as the switch-on patch. **They are already written. Nothing needs recovering later — the diff itself is the mechanism.**

⚠️ **One coupling to hold in mind:** the landing copy and `WHATSAPP_LIVE` are read by different surfaces. **Leaving both unstaged keeps them consistent. Staging one without the other would advertise on the landing page what the Settings card still calls coming soon, or the reverse** — which is the mismatch §44's standing rule exists to prevent.

---

## 7. WHAT I DID NOT ESTABLISH

- ⚠️ **Whether the WhatsApp *feature* is actually live end to end.** This report is about copy and flags; I did not test Meta approval, sending, or the embedded-signup path.
- ⚠️ **`app/manage/[token]/page.tsx` hunk classification is by first-changed-line inspection**, not a full read of all 18 hunks. The `WHATSAPP_LIVE` hunk is certain; the boundary between "WhatsApp embedded signup" and "custom domain" hunks may be imperfect.
- ⚠️ **I did not verify that the Android hunks are complete** — only that they are distinguishable from the WhatsApp ones.
- ⚠️ **`content/store-listing.md` and `app/compare/page.tsx` mention WhatsApp** but 🧪 show no diff against `origin/main`.

---

## 8. STATE AT END

🧪 Counts unchanged: `discovery_events` **4,300**, `venues` **559**, `discovery_trucks` **231**.

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

**0 staged.** `HEAD = 6820d7b`, `origin/main = 08ac368`. 🔴 **No file was changed, reverted, checked out, restored or stashed. Nothing staged, committed, pushed or added. The working tree is exactly as you left it, apart from this report.**
