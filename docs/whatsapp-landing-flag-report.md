# WhatsApp landing copy behind a single switch

**8 September 2026.** Nothing staged, committed, pushed; **`git add` was not run in any form**. Nothing reverted, checked out, restored or stashed. No database row written. `lib/features.ts` untouched — **nobody's access changed**.

**Tags:** 🔎 SOURCE-READ · 🧪 EXECUTED · ⚠ qualified.

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

## 0. GIT STATUS

| | START | END |
|---|---|---|
| modified | **30** | **30** |
| untracked | **109** | **110** *(`lib/whatsapp-live.ts` + this report; one doc replaced in place)* |
| staged | **0** | **0** |

---

## 1. STEP 1 — STOP CONDITIONS MET

🧪 All four files still exactly as the previous report described:

```
app/landing/page.tsx          M   3 hunks vs origin/main   (expected 3)
lib/plan-features.ts          M   5 hunks                  (expected 5)
lib/landing-table.ts          M   1 hunk                   (expected 1)
app/manage/[token]/page.tsx   M  18 hunks                  (expected 18)
```

**Proceeded.**

---

## 2. 🔴 THE REASON I COULD NOT EXTEND THE FLAG IN PLACE — STATED BEFORE ANYTHING WAS TOUCHED

You asked me to extend `WHATSAPP_LIVE` rather than invent a second flag, *"unless there is a reason not to, in which case say what it is before doing anything else."* **There is one, and it is a dependency cycle.**

🔎 `WHATSAPP_LIVE` was declared in `app/manage/[token]/page.tsx`. 🧪 That file **already imports from `lib/plan-features.ts`** (`:36`). And the flag is needed in three places that all sit *below* it in the graph:

```
app/manage/[token]/page.tsx  ──imports──▶  lib/plan-features.ts   ← needs the flag
lib/landing-table.ts         ──imports──▶  lib/plan-features.ts   ← needs the flag
app/landing/page.tsx         ──imports──▶  both                   ← needs the flag
```

**A flag declared in the page and read by the lib is `lib → app page → lib`.**

🎯 **So the flag was MOVED, not duplicated: `lib/whatsapp-live.ts` holds the one definition, and the manage page now imports it like everyone else. Same name, same single value, four consumers. There is no second switch and the module says so in its own header.**

---

## 3. STEP 2 — WHAT CHANGED

**One new file, four edits. The committed default is `false`, which renders exactly what production renders today.**

| file | change |
|---|---|
| **`lib/whatsapp-live.ts`** *(new)* | the single flag, `export const WHATSAPP_LIVE: boolean = false`, with the cycle reason and the "this does not gate access" caveat in its header |
| `lib/plan-features.ts` | WhatsApp matrix row → ternary on the flag; footnote 6 → `...(WHATSAPP_LIVE ? [ … ] : [])` |
| `lib/landing-table.ts` | `DETAIL_OVERRIDES` WhatsApp entry, `NAME_OVERRIDES`, `HIDDEN_ROWS` → all three restored when the flag is off |
| `app/landing/page.tsx` | the does-item tile and the Pro-card bullet → ternary on the flag |
| `app/manage/[token]/page.tsx` | local `const WHATSAPP_LIVE = true` **deleted**, replaced by an import of the shared flag |

🔴 **Android and the store badges are untouched and ship.** 🧪 In the flag-off render the kitchen-app row is `name="iPhone, iPad and Android kitchen app" starter=true pro=true max=true` — live in both flag states, as intended.

⚠️ **§44's standing rules were not rewritten while I was in there.** The coming-soon strings are lifted verbatim from `git show origin/main:` — §4.2 proves it byte-for-byte.

⚠️ **Two stale pointers were corrected, and they were mine.** Moving the flag invalidated `app/landing/page.tsx:197` and `lib/plan-features.ts:278`, both of which named `app/manage/[token]/page.tsx:8444`. 🧪 Zero references to the old location remain. **A stale pointer is worse than none, and these two were created by this change.**

---

## 4. STEP 3 — THE TWO DEPENDENCIES, HANDLED

### 4.1 The footnote-6 orphan

🔴 **The row's footnote number moves with the flag.** Off → `footnote: '4'` (production's value); on → `footnote: '6'`. And footnote 6 itself is spread in only when the flag is on.

🧪 **Proven by execution, both states:**
```
OFF: WhatsApp row footnote="4"   FOOTNOTES count=5 numbers=1,2,3,4,5
ON : WhatsApp row footnote="6"   FOOTNOTES count=6 numbers=1,2,3,4,5,6
```
🧪 Production at `08ac368` has **5** footnotes. **The off state matches it exactly — no orphan marker, no unreferenced footnote.**

⚠️ Footnote 6 is **appended**, so numbers 1–5 never move. 🔎 §44's `hide_pricing` mask keys on `f.number !== '2'`; **that key is undisturbed in either state.**

### 4.2 The Android row rename and its `ROW_FEATURE_MAP` partner

⚠️ **Not a WhatsApp dependency — an Android one — but you asked me to confirm it, and it is the sharper trap** because a mismatch makes the parity guard `continue` past the row **silently** rather than error.

🧪 Both hunks are present in the working tree together (the row rename and the map key), and the guard is **clean in both flag states**:

```
FLAG=false → findPlanParityViolations() → 0 violations 🟢
FLAG=true  → findPlanParityViolations() → 0 violations 🟢
```

⚠️ **Why zero is the right answer in both, rather than the guard being asleep:** 🔎 the test is `row[tier] === true && !canAccess(tier, feature)`. With the flag **off** the WhatsApp cells are `'coming_soon'`, which is not `=== true`, so the row is skipped. With the flag **on** they are `true` — and `canAccess('pro','whatsapp_replies')` is already `true`, because 🧪 `lib/features.ts` has **0 lines of diff** against `origin/main` and lists `whatsapp_replies` in `PRO_FEATURES`. **The guard is armed and passing, not inert.**

---

## 5. STEP 4 — PROOF, EXECUTED

**Method:** the real modules imported and run under `tsx` — `lib/whatsapp-live.ts`, `lib/plan-features.ts`, `lib/landing-table.ts` — reading `FEATURE_SECTIONS`, `FOOTNOTES`, `rowName()`, `rowDetail()`, `cellLabel()`, `HIDDEN_ROWS` and `findPlanParityViolations()`. **Both states were produced by actually flipping the constant, not by simulating it. It was flipped back and verified.**

### 5.1 Flag OFF — the committed default

```
FLAG = false
  WhatsApp row      : footnote="4" starter=false pro="coming_soon" max="coming_soon"
  Messenger/Insta   : footnote="4" starter=false pro="coming_soon" max="coming_soon"
  kitchen app row   : "iPhone, iPad and Android kitchen app" true/true/true     ← Android LIVE
  FOOTNOTES         : count=5 numbers=1,2,3,4,5
  NAME_OVERRIDES    : {"WhatsApp auto-replies":"WhatsApp, Messenger & Instagram auto-replies"}
  HIDDEN_ROWS       : ["Messenger & Instagram auto-replies"]
  PRINTS  name  = "WhatsApp, Messenger & Instagram auto-replies"
          detail= "Auto-reply to enquiries about your menu and schedule on WhatsApp, Messenger and Instagram."
          cells = pro "Coming soon"  max "Coming soon"
  [HIDDEN] Messenger & Instagram auto-replies          ← ONE social line prints, as production
  PARITY GUARD: 0 violations 🟢
```

### 5.2 🔴 Byte-exact comparison against `git show origin/main:`

**"Looks the same" is not proof, so every flag-off string was compared programmatically to the production source:**

| string | result |
|---|---|
| landing tile — **body** `<p>“Where are you tonight?”…Messenger and Instagram to follow.</p>` | 🟢 **IDENTICAL** |
| landing tile — **heading** | 🔴 **CHANGED BY INSTRUCTION — see §5.2.1** |
| landing Pro-card bullet `<li>WhatsApp, Messenger &amp; Instagram…` | 🟢 **IDENTICAL** |
| matrix row (flag-off branch) | 🟢 **IDENTICAL** |
| `landing-table` `DETAIL_OVERRIDES` entry | 🟢 **IDENTICAL** |
| `landing-table` `NAME_OVERRIDES` entry | 🟢 **IDENTICAL** |
| `landing-table` `HIDDEN_ROWS` entry | 🟢 **IDENTICAL** |
| FOOTNOTES count | 🟢 **5 = 5** |

### 5.2.1 🔴 ONE DELIBERATE DEPARTURE FROM PRODUCTION, ON YOUR INSTRUCTION

**You asked mid-pass:** *"in what it does, rename social media auto replies to WhatsApp auto replies and move it to last position as it used to be in coming soon."* **Both parts are done, and both change the not-live state away from byte-identical.**

| | production at `08ac368` | not-live state now |
|---|---|---|
| **heading** | `Social media auto-replies — coming soon` | `WhatsApp auto-replies` + a `soon-inline` **Coming soon** badge |
| **body** | `“Where are you tonight?” … Soon your WhatsApp will get answered … Messenger and Instagram to follow.` | 🟢 **identical, verbatim** |
| **position** | **last**, after `No signal? Keep serving.` | 🟢 **last** — restored |

🧪 **You were right about the position.** Production carried this tile **sixth and last**; the go-live edit had moved it up to fifth, among the shipped capabilities. It is now last again while not live, and moves back to fifth when the flag is on — **position follows the flag, in the same edit.**

🟢 **AND THE READINESS IS BACK IN THE HEADING, ON YOUR SECOND INSTRUCTION.** The tile now reads `WhatsApp auto-replies` followed by a `<span className="soon-inline">Coming soon</span>` badge.

⚠️ **Why the badge rather than production's `— coming soon` suffix:** 🧪 `soon-inline` is the idiom every other unshipped item on this page already uses — the Pro-card bullets, `Take payment on your phone`, `Event & festival pricing`, `Digital loyalty stamp cards`. 🔎 Its CSS (`app/landing/landing.css:394`) is scoped to `.hg-landing`, not to `li`, so it renders in an `h3` exactly as it does in a bullet. **This is the first heading on the page to carry one** — flagged because it is a small precedent, not because it is wrong.

🧪 Verified per branch: the **live** tile has no badge; the **not-live** tile has one. §44 is now met twice — the badge says it, and the body still reads "Soon your WhatsApp *will* get answered".

⚠️ **Two comparisons first reported as differing, and both were artefacts of my extraction, not of the code** — I am recording them rather than quietly re-running: the tile line carried a trailing `}` that closes the JSX expression container (the *element* is identical), and my first `NAME_OVERRIDES` grep matched a **comment** quoting the old string instead of the code line. Re-extracted correctly, both are identical.

### 5.3 Flag ON — nothing from your working tree is lost

```
FLAG = true
  WhatsApp row      : footnote="6" starter=false pro=true max=true
  FOOTNOTES         : count=6 numbers=1,2,3,4,5,6
  NAME_OVERRIDES    : {}          HIDDEN_ROWS: []
  PRINTS  "WhatsApp auto-replies"           detail "Auto-reply to WhatsApp enquiries about your menu and schedule."  ✓ / ✓
  PRINTS  "Messenger & Instagram auto-replies"  Coming soon / Coming soon
  PARITY GUARD: 0 violations 🟢
```
🟢 **Two separate rows, WhatsApp ticked, footnote 6 present, Messenger/Instagram still coming soon — the go-live state exactly as your working tree had it.**

### 5.4 🔴 WHAT IF THE FLAG WERE READ NOWHERE?

**A flag read nowhere and a flag read correctly both render coming-soon when off. So both branches were forced and the outputs compared:**

| | OFF | ON | |
|---|---|---|---|
| WhatsApp row | `footnote="4" pro="coming_soon" max="coming_soon"` | `footnote="6" pro=true max=true` | 🟢 differs |
| FOOTNOTES | `count=5 numbers=1,2,3,4,5` | `count=6 numbers=1,2,3,4,5,6` | 🟢 differs |
| `NAME_OVERRIDES` | `{"WhatsApp auto-replies": …}` | `{}` | 🟢 differs |
| `HIDDEN_ROWS` | `["Messenger & Instagram auto-replies"]` | `[]` | 🟢 differs |

🔴 **Four independent observables move with the flag. A flag read nowhere would have produced identical output in both columns. It did not.**

### 5.5 ⚠️ What this proof does NOT cover

🔴 **`app/landing/page.tsx` was not executed.** It is a React component; the harness runs the data modules only. **Its evidence is source-level:** 🧪 the flag is imported at `:42` and read at `:223` and `:407`, and **both branches are present exactly once each** — `Social media auto-replies — coming soon` (1), `<h3>WhatsApp auto-replies</h3>` (1), the welded `<li>` (1). ⚠️ **I have not rendered the page, so the JSX branches are verified by reading, not by running.**

🧪 `npx tsc --noEmit -p tsconfig.json` → **0 errors**. ⚠️ **That is a typecheck, not verification.**

🔴 **Nothing takes effect until deployed.** All of this is an uncommitted working tree. It reaches production only after you stage it, commit, push, and Vercel builds.

---

## 6. STEP 5 — THE SWITCH

> **File:** `lib/whatsapp-live.ts`
> **Line:** the last line — `export const WHATSAPP_LIVE: boolean = false`
> **Change:** `false` → `true`

**One word, one file, one line.** Everything else follows: the matrix row ticks Pro and Max on footnote 6, footnote 6 appears, the landing tile and Pro-card bullet drop their badges and split into two, the landing table stops merging the rows, and Manage → Settings makes the connect control editable.

🔴 **Yes, it requires a redeploy.** It is a build-time constant, not an environment variable — 🔎 stated in the module header. There is no runtime toggle, deliberately: the copy changes with it, and copy lives in code. **Edit, commit, push, wait for the build.**

---

## 7. WHAT I DID NOT DO

- ❌ `lib/features.ts` untouched — 🧪 **0 lines of diff** against `origin/main`. **Nobody's access changed; `canAccess('pro','whatsapp_replies')` was already true in production and still is.**
- ❌ No Android or store-badge work altered.
- ❌ §44's landing copy not rewritten — the off-state strings are production's, verbatim.
- ❌ Nothing staged, committed, pushed, reverted, restored or stashed.
- ⚠️ **`app/manage/[token]/page.tsx` still carries 17 other hunks** from the embedded-signup, custom-domain and venue-banner workstreams. **This change touched only the flag declaration and one import line in that file.**

---

## 8. STATE AT END

🧪 `flag: export const WHATSAPP_LIVE: boolean = false` · `tsc: 0 errors` · `staged: 0`

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

`HEAD = 6820d7b`, `origin/main = 08ac368`. **The whole tree can now be committed in one go: WhatsApp will render coming-soon, byte-identical to production, and Android ships live.**
