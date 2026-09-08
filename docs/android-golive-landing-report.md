# Android go-live — the landing sweep

**5 September 2026. Branch `whatsapp-connections-s1-s3`. NOT COMMITTED, not staged, not pushed, not deployed. No cap sync, native binary untouched. `main` still `2ca66cd`. `git add -A` / `git add .` never run.**

**Method:** 🔎 SOURCE-READ · 🧪 EXECUTED. ⚠️ **No span of the prompt arrived garbled, and no instruction contradicted another.**

## 🔴 CONFIRMED: NOTHING HERE CHANGES `events.pizzeriagusto.co.uk` OR ANY CUSTOMER ORDERING PATH

🧪 **Executed.** This build touched four files. **None of them is imported by any customer surface:**

| Surface | Imports of anything this build touched |
|---|---|
| `app/domain/page.tsx` (the custom-domain page) | **0** |
| `app/o/[slug]/page.tsx` (the scan decider) | **0** |
| `app/order/[id]/page.tsx` | **0** |
| `app/api/orders/submit/route.ts` | **0** |
| `app/api/embed/events/route.ts` (what the custom-domain page fetches) | **0** |

🧪 The complete importer list for `lib/plan-features.ts` is **seven files — landing, features-PDF, compare, admin, manage, PaymentsTab and landing-table.** Every one is an operator or marketing surface. `lib/features.ts` — which `app/domain/page.tsx` *does* import, for `canAccess` — is **not modified by this build.**

---

# TASK 1 — THE CENSUS, BEFORE EDITING

**Patterns searched, repo-wide across `app/`, `components/`, `lib/`** (case-insensitive): `android` · `google play` · `play store` · `playstore` · `play\.google` · `ios` · `iphone` · `ipad` · `app store` · `appstore` · `coming soon` · `comingSoon` · `coming_soon` · `soon-inline` · `store/apps/details` · `PLAY_STORE` · `GOOGLE_PLAY_URL`.

🧪 The raw `android` sweep returned **~90 hits**. All but six are engineering internals — `useAndroidBack`, FCM, the status-bar and BLE notes, `commerce-policy`. **Six were customer-facing claims:**

| # | File:line | What it claimed | Kind |
|---|---|---|---|
| 1 | `app/landing/page.tsx:219` | tile: *"…with the iPhone and iPad app. **Android coming soon.**"* | literal |
| 2 | `app/landing/page.tsx:361` | pricing bullet: `<li>Android kitchen app <span className="soon-inline">Coming soon</span></li>` | literal |
| 3 | `lib/plan-features.ts:212` | matrix row `{ name: 'Android kitchen app', … 'coming_soon' ×3 }` | **row → derived glyph** |
| 4 | `lib/plan-features.ts:207` | matrix row `'iPhone and iPad kitchen app'` — excluded Android by omission | literal + **map key** |
| 5 | `lib/plan-features.ts:494` | footnote 3: *"…for iPhone and iPad, **with Android coming soon**…"* | literal |
| 6 | `lib/landing-table.ts:50` | `DETAIL_OVERRIDES['Offline Order Protection']` — *"…(Android coming soon)…"* | 🔴 **DERIVED** |

## 🔴 WHAT DERIVES OR MERGES RATHER THAN MATCHES — the class that got missed twice

**Five mechanisms in `lib/landing-table.ts` and `lib/plan-features.ts` produce printed text that a string search of the rendering file cannot find:**

1. 🔴 **`DETAIL_OVERRIDES`** — #6 above. The landing table **and the PDF** print this string; `lib/plan-features.ts`'s own detail for that row says nothing about Android. **A grep of `plan-features.ts` for "Android coming soon" would have come back clean while both surfaces still said it.** This is the same shape as the merged-row miss.
2. 🔴 **`cellLabel()`** — returns the literal `'Coming soon'` for a `coming_soon` cell. So the words *"Android kitchen app · Coming soon · Coming soon · Coming soon"* as printed **existed in no row definition at all**: the name came from the row, the three glyphs came from a function.
3. 🔴 **`trialFeatureValue()`** — derives the **Trial** column from `row.max`. The Android row's Trial cell was never authored; it was computed.
4. ⚠️ **`NAME_OVERRIDES`** and **`HIDDEN_ROWS`** — the two that caused the previous miss. 🧪 **Both are currently EMPTY**, verified by reading the file, so no row is silently renamed or suppressed today. **Checked rather than assumed** — an empty map is a fact about this moment, not a property.
5. 🔴 **`ROW_FEATURE_MAP` is keyed by the row's LABEL** — `FeatureRow` has no id. This does not print anything; it decides whether the parity checker *looks* at a row. See Task 2.

**Surfaces enumerated from what the browser requests, not from the policy:** `/landing` (the tiles, the three pricing cards, the compare table) → `app/landing/page.tsx` → `FEATURE_SECTIONS` + `FOOTNOTES` + `lib/landing-table.ts`; `/landing/features-pdf` → 🧪 **verified to import the same five functions** (`visibleRows`, `rowName`, `rowDetail`, `cellLabel`, `trialFeatureValue`) plus `FOOTNOTES`; `/compare` → `CostComparison.tsx` → `plan-features`; and the footer via `components/landing/LandingFooter.tsx`.

---

# TASK 2 — COMBINED, NOT ADDED

| # | Before | After |
|---|---|---|
| 1 | *"Carry on taking orders with the iPhone and iPad app. **Android coming soon.**"* | *"Carry on taking orders with the **iPhone, iPad and Android app**."* |
| 2 | two bullets: `iPhone and iPad kitchen app` + `Android kitchen app` **Coming soon** | **one bullet**: `iPhone, iPad and Android kitchen app` |
| 3 | matrix row `Android kitchen app`, coming_soon ×3 | 🔴 **DELETED** |
| 4 | matrix row `iPhone and iPad kitchen app`, ✓✓✓ | renamed **`iPhone, iPad and Android kitchen app`**, ✓✓✓ |
| 5 | *"…native kitchen apps for iPhone and iPad, **with Android coming soon**, and…"* | *"…native kitchen apps for **iPhone, iPad and Android**, and…"* |
| 6 | *"The iPhone and iPad app keeps you taking orders offline **(Android coming soon)**;…"* | *"The **iPhone, iPad and Android app** keeps you taking orders offline;…"* |

🟢 **Nothing gained a line.** Two bullets became one; two matrix rows became one; three sentences absorbed the word.

🟢 **The split row's own instruction was followed exactly.** It read: *"Re-merge them the day Android ships, and not before — and if you do, **DELETE the Android row rather than renaming this one**, so the ROW_FEATURE_MAP entry below stays attached to the row that carries the real feature."* The Android row was **deleted** (it never had a map entry); the iPhone/iPad row was **renamed** and **its map key moved in the same edit**.

## 🔴 THE RENAME TOUCHED A MATRIX ROW — the map entry landed in the same edit

```ts
// the row
{ name: 'iPhone, iPad and Android kitchen app', footnote: '3', …, starter: true, pro: true, max: true }
// ROW_FEATURE_MAP, same change
'iPhone, iPad and Android kitchen app': 'ipad_kds',
```
The Feature is unchanged — `ipad_kds` — because **it is the same app.**

### 🧪 BOTH PROBES, on throwaway copies

🔴 **What these would look like if they proved nothing:** probe (a) returning **0** would mean the checker is **inert**, and then every other `0` in this report — including the real run — would be meaningless. That is why (a) is quoted first.

**(a) key re-pointed at a Feature no tier grants → EXPECT VIOLATIONS:**
```
Error: [plan-features] presentation↔gate DRIFT — advertised but not allowed:
  - "iPhone, iPad and Android kitchen app" advertised for starter but
    canAccess('starter','instagram_messenger_replies') is false
```
🟢 **It fired, and it named the renamed row.** ⚠️ It *threw at module load* rather than returning a list — the module-load guard runs first outside production. **That is stronger than a return value, not weaker: the row is demonstrably still being inspected.**

**(b) map entry DELETED, cells left `true` → EXPECT 0:**
```
violations: 0
```
🔴 **This is the hazard, reproduced.** A rename that lost its map key would have produced exactly this: a clean run, because the checker `continue`s on a row with no entry and **stops looking**. It is the reason the key moved in the same edit rather than the next one.

**Real run, against the edited modules:** 🧪 **`findPlanParityViolations(): 0 violations`.**

---

# TASK 3 — THE DOWNLOAD BUTTON

## 🔴 NO GENUINE PLAY STORE URL EXISTS ANYWHERE. NONE.

🧪 **Executed across every `.ts`, `.tsx`, `.md`, `.json` and `.css` outside `node_modules` and `.next`**, for `play.google.com`, `store/apps/details`, `PLAY_STORE`, `GOOGLE_PLAY_URL` — **zero matches.** Not in the repo, not in a doc, not in the manual. **There is nothing to quote.**

🔴 **It was not constructed, derived or guessed.** The obvious move — `…/store/apps/details?id=com.hatchgrab.app`, built from the package name in `capacitor.config.ts` — is *probably* right and has **never been opened.** A badge pointing at a 404 on a live landing page is worse than no badge.

## The constant

**`GOOGLE_PLAY_URL`, in `components/landing/LandingFooter.tsx`**, immediately below `APP_STORE_URL`, its exact counterpart. **It is `''`.**

🟢 **FINISHING STATE: the button does not render.** `{GOOGLE_PLAY_URL && (…)}` — not a dead link, not a disabled control, **absent**. The Apple badge stands alone exactly as today, so the footer is correct either way.

🔴 **TWO THINGS ARE NEEDED, NOT ONE.** The URL **and** the official badge artwork at **`GOOGLE_PLAY_BADGE_SRC`** (`/badges/GetItOnGooglePlay_Badge_Web_color_English.png`) — 🧪 **`public/badges/` holds only Apple's two SVGs.** Google's brand terms require their supplied artwork unmodified, so it cannot be drawn here. **Filling in the URL without adding the file renders a broken image.**

## Styling, label and the mobile pair

🟢 **Same shape as the Apple badge:** `className="foot-badge"`, an `aria-label` naming action and destination (*"Get HatchGrab on Google Play"* against Apple's *"Download HatchGrab on the App Store"*), `alt` text carrying the badge's own words, unmodified artwork, and `height: 40px; width: auto` from `.foot-badge img` — Apple's onscreen minimum, no off-ratio scaling.

🟢 **Apple's ordering rule is satisfied by construction:** the Play `<a>` is **after** the Apple one in the DOM, and `.foot-apps` is a plain flex row with **no `order` property anywhere**, so CSS cannot re-sequence it. The Apple badge is **already black**, which Apple requires the moment another platform's badge appears — **no colour change needed**, exactly as `public/badges/README.md` predicted.

**At mobile width:** 🔎 `landing.css:542` — `.foot-apps { display: flex; flex-wrap: wrap; gap: 1.25rem; }` and `:569` — `@media (≤760px) { justify-content: center }`. **So the two badges sit side by side if they fit and stack centred if they do not**, and the 1.25rem gap satisfies Apple's clear-space rule for a pair. ⚠️ **Reasoned from the CSS, not observed** — and Google's badge has a different aspect ratio, so the pair is a look-at-it.

---

# TASK 4 — WHAT THE COPY CLAIMS

🟢 **Both apps are shipped, so both are present tense**, which is what the standing editorial rule requires: *"coming soon" is only for later additions to a shipped product.*

**Every string changed, verbatim, after:**

1. `app/landing/page.tsx` tile — *"If you lose signal, online ordering pauses automatically so customers can't place orders you won't see. Carry on taking orders with the iPhone, iPad and Android app."*
2. `app/landing/page.tsx` Starter bullet — *"iPhone, iPad and Android kitchen app"*
3. `lib/plan-features.ts` row name — *"iPhone, iPad and Android kitchen app"*
4. `lib/plan-features.ts` `ROW_FEATURE_MAP` key — `'iPhone, iPad and Android kitchen app': 'ipad_kds'`
5. `lib/plan-features.ts` footnote 3 — *"Device not supplied. There are native kitchen apps for iPhone, iPad and Android, and the kitchen screen also runs on any phone or tablet with a modern browser."*
6. `lib/landing-table.ts` detail override — *"If you lose signal, online ordering pauses so customers can't place orders you won't see. The iPhone, iPad and Android app keeps you taking orders offline; the web dashboard needs a connection."*
7. `components/landing/LandingFooter.tsx` — a note claiming *"there is no Play badge yet: Android is in review… the page's copy must keep saying 'coming soon'"* corrected; **the rule that a badge must link to a LIVE listing is kept, and is why the slot is guarded.**

🟢 **MESSENGER AND INSTAGRAM WERE NOT TOUCHED.** 🧪 The sweep surfaced `app/landing/page.tsx:391` — `<li>Messenger &amp; Instagram auto-replies <span className="soon-inline">Coming soon</span></li>` — and the matrix row behind it. **Both left exactly as they are.** They are verify-handshake stubs with no classifier wiring and no send module. Also untouched: *Take payment on your phone*, *Event & festival pricing*, *Digital loyalty stamp cards*.

---

# VERIFICATION

## 🔴 HARNESS FRESHNESS — and two of my own markers went red

```
features.ts        ✅ IDENTICAL 4040a7eea5ea5470…
plan-features.ts / landing-table.ts   non-import differences: NONE
```

⚠️ **My first marker pass reported two failures, and BOTH were my assertions being wrong, not the code.**
- *"'iPhone, iPad and Android kitchen app' — expect 3"* came back **2**. The third occurrence I predicted is a comment quoting the **old** name.
- *"'Android coming soon' must be 0"* came back **2**. Both survivors are inside **comments I wrote recording the removal**.

🔴 **Reported rather than quietly corrected — this is the third time in this workstream a marker has been mis-specified, and a marker that goes red and gets waved through is the same failure as a proof that goes green and proves nothing.** Re-run with comment lines excluded:

```
RENDERED 'Android coming soon' in plan-features / landing-table / landing page : 0 / 0 / 0
the merged row exists : 1     the map key matches it : 1
the old Android row is gone : 0     the old map key is gone : 0
```
🟢 **The must-be-0 pair is the load-bearing half: those two strings existed this morning, so a stale copy could not pass them.**

## 🧪 PROOF S — the table AS IT PRINTS, not as it reads

🔴 **What this would look like if it proved nothing:** reading the source instead of rendering — the exact failure that let a merged row advertise two unbuilt stubs. **Ruled out by walking `visibleRows` → `rowName` → `rowDetail` → `trialFeatureValue` → `cellLabel`, the same five functions the page and the PDF call**, and printing the strings that come out.

```
iPhone, iPad and Android kitchen app   trial=✓  starter=✓  pro=✓  max=✓
Offline Order Protection               trial=✓  starter=—  pro=✓  max=✓

rows the landing prints: 31
every printed row mentioning Android:
  • iPhone, iPad and Android kitchen app  [✓ | ✓ | ✓ | ✓]
  • Offline Order Protection  [✓ | — | ✓ | ✓]
      detail: …The iPhone, iPad and Android app keeps you taking orders offline;…

app-row cells printed: ["✓","✓","✓","✓"]   ✅ no "Coming soon"
app rows printed: 1 (must be 1 — combined, not two lines)

footnote 3, as printed:
  Device not supplied. There are native kitchen apps for iPhone, iPad and Android, and the
  kitchen screen also runs on any phone or tablet with a modern browser.
```

🟢 **The PDF is covered by the same run.** 🧪 `app/landing/features-pdf/route.ts` imports **exactly** `visibleRows`, `rowName`, `rowDetail`, `cellLabel`, `trialFeatureValue`, `TABLE_PLANS` and `FOOTNOTES` (lines 41-43, 122-167). Its **layout** is its own; **every table string it prints comes from the functions Proof S executed.** ⚠️ The PDF binary itself was not generated — see below.

| Check | Method | Result |
|---|---|---|
| Harness freshness (hash + corrected markers) | 🧪 Executed FIRST | ✅ (two of my markers were wrong — reported) |
| `npx tsc --noEmit` | 🧪 Executed | **exit 0** |
| **Probe (a) — checker is not inert** | 🧪 **Executed on a throwaway copy** | ✅ threw, naming the renamed row |
| **Probe (b) — silent-drop hazard is real** | 🧪 **Executed on a throwaway copy** | ✅ 0 violations |
| **`findPlanParityViolations()` on the real modules** | 🧪 Executed | **0 violations** |
| Compare table + footnote 3 as printed | 🧪 Executed (S) | ✅ one app row, no Coming soon |
| PDF prints the same strings | 🧪 Executed imports + 🔎 source-read of the loop | ✅ same five functions |
| `NAME_OVERRIDES` / `HIDDEN_ROWS` empty | 🔎 Source-read | ✅ nothing renamed or hidden |
| No customer surface imports this build | 🧪 Executed | ✅ 0 across five paths |
| Messenger/Instagram untouched | 🧪 Executed grep | ✅ |
| **Anything rendered in a browser** | ❌ **NOT DONE** | see below |

## Safari-on-macOS click-through — localhost:3000

⚠️ **I rendered none of this.** ⚠️ **`/landing` is admin-gated** (`layout.tsx` redirects non-admins to `/contact`) and `/` on `hatchgrab` rewrites to it — **so every step below needs your admin session; I cannot reach the page at all.**

1. **The tiles.** Find *"No signal? Keep serving."* **See:** *"…Carry on taking orders with the iPhone, iPad and Android app."* 🔴 **Wrong if it still ends "Android coming soon."**
2. **The Starter pricing card.** **See:** **one** bullet — *"iPhone, iPad and Android kitchen app"*. 🔴 **Wrong if there are two bullets**, or if one still carries an orange *Coming soon* pill.
3. **The other cards, unchanged.** **See:** *Messenger & Instagram auto-replies*, *Take payment on your phone*, *Event & festival pricing*, *Digital loyalty stamp cards* — **all still Coming soon.** 🔴 **Wrong if any lost its pill** — that would mean the sweep over-reached.
4. **The compare table.** **See:** **one** app row, *iPhone, iPad and Android kitchen app*, ✓ under all four columns. 🔴 **Wrong if a second row named "Android kitchen app" is still there.**
5. **Offline Order Protection's description** in the same table. **See:** *"The iPhone, iPad and Android app keeps you taking orders offline"* — **no bracketed "(Android coming soon)"**. This is the derived override; it is the one a source grep would have missed.
6. **Footnote 3** under the table. **See:** *"…native kitchen apps for iPhone, iPad and Android, and…"*.
7. **The footer, desktop.** **See:** the **black Apple badge, alone**. 🔴 **Wrong if a Play badge appears or a broken-image icon shows** — `GOOGLE_PLAY_URL` is empty, so nothing should render.
8. **The footer, mobile** (⌥⌘R → responsive, 390px). **See:** the Apple badge **centred**. Once you supply the URL **and** the badge file, re-check here first: the pair must sit side by side or stack centred, never overlap or crop.
9. **The features PDF** — `/landing/features-pdf`. **See:** the same single app row, the same footnote 3, the same Offline Order Protection sentence as the page. 🔴 **Wrong if the PDF and the page disagree anywhere** — they render from one source and a difference means something re-implemented a rule.

---

# THE TREE

🟢 **Branch `whatsapp-connections-s1-s3`. HEAD `2ca66cd`. `main` `2ca66cd` — untouched. 0 staged.**

## This build's files

```
lib/plan-features.ts                  +116 / -…   row merged, map re-keyed, footnote 3
app/landing/page.tsx                   +81 / -…   tile + one bullet instead of two
components/landing/LandingFooter.tsx   +81 / -…   GOOGLE_PLAY_URL (empty) + guarded badge slot
lib/landing-table.ts                   +55 / -…   the derived detail override
                                       4 files, 251 insertions(+), 82 deletions(-)
```

## 🔴 THE `git add -p` SET DOUBLES — FROM THREE TO SIX

**You asked whether `app/landing/page.tsx` becomes a fourth. It does — and it is not alone.** 🧪 **Measured, by counting WhatsApp-related changed lines in each file's diff:**

| # | File | Carries | New? |
|---|---|---|---|
| 1 | `lib/custom-domain/copy.ts` | custom-domain **+** pre-existing uncommitted work | |
| 2 | `app/manage/[token]/page.tsx` | custom-domain **+** WhatsApp S1–S5 | |
| 3 | `app/api/manage/route.ts` | custom-domain **+** WhatsApp S1–S5 | |
| 4 | 🆕 **`app/landing/page.tsx`** | **WhatsApp go-live copy (22 lines) + Android** | **THIS BUILD** |
| 5 | 🆕 **`lib/plan-features.ts`** | **WhatsApp go-live copy (22 lines) + Android** | **THIS BUILD** |
| 6 | 🆕 **`lib/landing-table.ts`** | **WhatsApp go-live copy (20 lines) + Android** | **THIS BUILD** |

🟢 **`components/landing/LandingFooter.tsx` does NOT join.** 🧪 Its whole diff is this build's — it was untouched before today.

## Unchanged, verified this run

| Group | Diff | Status |
|---|---|---|
| **Pre-existing five** — `app/o/[slug]/page.tsx`, `components/EventListCard.tsx`, `ios/…/project.pbxproj`, `proxy.ts`, `vercel.json` | **5 files, 46+/53−** | 🟢 **byte-for-byte unchanged** — order rename, derivation extraction, `ios/` file |
| **WhatsApp libs** — `lib/whatsapp/*` | 1 file, 113+ | 🟢 unchanged |
| **Custom-domain** — `lib/custom-host.ts`, `lib/custom-domain/*`, `components/dashboard/*`, the cron, `lib/ratelimit.ts` | 7 files, 372+/68− | 🟢 unchanged |
| `app/manage/[token]/page.tsx` · `app/api/manage/route.ts` · `app/admin/page.tsx` | 247+/54− · 127+/3− · 36+/20− | 🟢 **unchanged by this build** |
| `app/domain/page.tsx` | — | 🟢 **0 changes** |
| `lib/features.ts` | — | 🟢 **unchanged** (the file `app/domain` imports) |
| `docs/reference-manual.md` | 565+/4− | 🟢 unchanged — I did not edit the manual |
| Outreach files, `lib/outreach.ts`, `lib/whatsapp-hint.ts`, `app/order/[id]/page.tsx` | — | 🟢 still untracked, unstaged |

---

# WHAT I COULD NOT READ OR VERIFY

- 🔴 **Nothing was rendered in a browser, and I could not have been.** `/landing` is **admin-gated**, and no agent session as an admin has ever been obtainable in this project. **Every visual claim is source-read or executed-module output. You run all nine click-through steps.**
- 🔴 **The Play Store URL does not exist anywhere and I did not invent one.** The badge is built and **does not render**. Until you supply it, the footer is Apple-only.
- 🔴 **Google's badge artwork is not in the repo either.** `GOOGLE_PLAY_BADGE_SRC` points at a file that does not exist. **Both are needed; supplying only the URL renders a broken image.** I could not add the artwork — Google's terms require their supplied file, unmodified.
- 🔴 **The PDF binary was not generated.** Its route needs `verifyAdmin`. What is proven is that it imports and calls the same five presentation functions Proof S executed, plus `FOOTNOTES`. **Its layout, page breaks and rendered glyphs are unverified.**
- ⚠️ **The two-badge mobile layout is reasoned from CSS, not observed** — and Google's badge has a different aspect ratio from Apple's, so the pair is a look-at-it. Step 8.
- ⚠️ **I did not verify the Android app is live on Google Play.** Taken from your statement. Every copy change in this build rests on it.
- ⚠️ **`/compare` was not exercised.** It imports `plan-features` and will inherit the merged row; I did not walk its renderer.
- ⚠️ **Two of my own freshness markers were mis-specified** and went red on correct code. Reported above.

# FLAGS

- 🟢 **CONFIRMED: nothing changes what `events.pizzeriagusto.co.uk` serves, or any ordering path.** Zero imports across five customer surfaces.
- 🔴 **The rename touched a matrix row and the map key moved in the same edit.** Probe (a) proves the checker is still looking; probe (b) reproduces the silent-drop hazard that made it necessary.
- 🔴 **A derived string in `lib/landing-table.ts` was the sixth claim** — invisible to a grep of the file that owns the row. That is the class that got missed twice; it was found this time.
- 🔴 **The Play badge does not render, by design.** Two inputs are missing: the URL and the artwork.
- 🔴 **The `git add -p` set doubled to six files.** Three landing files now carry the WhatsApp copy workstream *and* this one.
- ⚠️ **Messenger, Instagram and the four other coming-soon items are untouched**, as instructed.
- ⚠️ **`/landing` is admin-gated — I cannot see any of this.** Code-verified only.

*Nothing committed. Nothing staged. `main` = `2ca66cd`. The live page is untouched.*
