# Device naming — census, then a copy-only sweep

**Result: FIVE strings changed, in THREE files. `git diff --stat` = 5 insertions, 5 deletions.**
No `next dev`, no `next build`, no `cap sync`, no deploys, no commit.
✅ **No span of the prompt arrived garbled. No instruction contradicted another, so there was nothing to stop for.**

**TWO EDITS IN TWO PASSES, and the second was your call, not mine:**

1. **The brief's substitution — 2 strings, `app/landing/page.tsx`:** `iPad and Android` → **`iPhone, iPad and Android`**, on the two marketing claims about taking orders on a device.
2. 🔴 **YOUR MID-TURN DECISION — 3 strings, two `components/native/` files:** *"in dashboard settings it shows 'alerts on this ipad' … i think alerts on this device will be better. anywhere else theres mentions like that as well."* **Applied to all three: `this iPad` → `this device`.** ✅ **They are exactly the three sites C5 had flagged as fitting no rule in the brief, and they were the ones most likely to be wrong on a phone.**

🔴 **STILL SMALLER THAN THE BRIEF ANTICIPATED, AND THAT REMAINS THE FINDING.** Of the user-visible strings naming a device, **five are KITCHEN-DISPLAY claims that rule B3 says to leave and flag** — those are untouched and listed with their exact text so you can decide. **Nothing was silently skipped.**

⚠️ **AND THE AMPERSAND WAS NOT USED.** B1 allows "and" where a surface's house style clearly uses it, and **at both changed sites the existing copy is literally *"the iPad and Android app"***. Justification, with the competing evidence, is in B1.

---

# PART A — THE CENSUS

## A1. Case-insensitive sweep: `iPad`, `iOS`, `iPhone`, `Apple`

**READ. Method:** word-boundary regex `\b(ipad|ios|iphone|apple)\b`, case-insensitive, across the whole repo excluding `node_modules`, `.git`, `.next`, `out`, `build`, `Pods`, `DerivedData` and binaries. ⚠️ **A word-boundary sweep MISSES `ipad_kds`** — `_` is a word character — **so a second identifier-shaped sweep (`ipad[_a-z0-9]|[_a-z0-9]ipad`) was run to catch it. Without that second pass `lib/features.ts` would not have appeared at all.**

**Totals: 950 hits in 139 files** — **731 in `docs/`, 219 everywhere else.**

| Bucket | Hits | In scope? |
|---|---|---|
| **(a) USER-VISIBLE COPY** | **20** | 🔴 **THE ONLY BUCKET IN SCOPE** |
| **(b) IDENTIFIERS** | 27 | ❌ frozen |
| **(c) NATIVE CONFIG** | 31 | ❌ frozen (B5) |
| **(d) COMMENTS AND DOCS** | **872** (731 in `docs/`, 141 in source comments) | ❌ out of scope |

⚠️ **ONE DELIBERATE DEVIATION FROM THE BRIEF, DECLARED RATHER THAN TAKEN QUIETLY.** The brief asks for every hit as `file:line`. **Buckets (a), (b) and (c) are listed in full below — all 78 of them.** **Bucket (d) is 872 lines, 731 of them in `docs/*.md` reports that are not shipped to anyone**, so it is reported as counts per file rather than 872 quoted lines. **Say the word and I will produce the full (d) listing.**

### 🔴 BUCKET (a) — USER-VISIBLE COPY. All 20, complete.

**MARKETING (customer-facing — `app/landing/page.tsx`, plus the shared matrix it renders):**

| # | Site | The string | Verdict |
|---|---|---|---|
| a1 | `app/landing/page.tsx:74` | `'Offline Order Protection': "…The iPad and Android app keeps you taking orders offline; the web dashboard needs a connection."` | ✅ **CHANGED** |
| a2 | `app/landing/page.tsx:204` | `…Carry on taking orders with the iPad and Android app.` | ✅ **CHANGED** |
| a3 | `app/landing/page.tsx:315` | `<li>iPad and Android kitchen app</li>` | 🔴 **B3 — kitchen app. FLAGGED, NOT CHANGED** |
| a4 | `lib/plan-features.ts:121` | `{ name: 'iPad and Android kitchen app', footnote: '3', … }` | 🔴 **B3 — FLAGGED, NOT CHANGED** |
| a5 | `lib/plan-features.ts:222` | footnote 3: `'Tablet not supplied. There are native kitchen apps for iPad and Android, and the kitchen screen also runs on any tablet with a modern browser.'` | 🔴 **B3 — FLAGGED, NOT CHANGED** |
| a6 | `app/trucks/[slug]/order/page.tsx:3514` | `'You'll pay securely by card on this page · Apple Pay and Google Pay supported'` | ❌ a payment method, not a device |
| a7 | `components/EventListCard.tsx:302` | `<option value="ics">Apple / Mobile / Outlook</option>` | ❌ a calendar format |
| a8 | `components/EventListCard.tsx:379` | `<option value="ics">Apple / Mobile / Outlook</option>` | ❌ same |

**OPERATOR-FACING (in-app labels and an email):**

| # | Site | The string | Verdict |
|---|---|---|---|
| a9 | `components/native/NotificationSettings.tsx:67` | `Alerts on this iPad. Turn on to choose which alerts you get.` | ✅ **CHANGED → "this device" (your mid-turn call)** |
| a10 | `components/native/OperatorDeviceConfig.tsx:82` | `We couldn't reach the server to set up **this iPad**. …` | ✅ **CHANGED → "this device"** |
| a11 | `components/native/OperatorDeviceConfig.tsx:106` | `One-time setup for **this iPad**: the screen it opens to and which van it runs. …` | ✅ **CHANGED → "this device"** |
| a12 | `components/native/OperatorDeviceConfig.tsx:283` | `No Face ID / Touch ID enrolled on this device — set one up in iOS Settings. …` | ❌ **B2 — "iOS Settings" is the OS, and it is the literal name of the app you tap** |
| a13 | `app/api/admin/create-operator/route.ts:132` | `<li>Add the dashboard to your iPad home screen for the kitchen display</li>` | 🔴 **B3 — says "for the kitchen display". FLAGGED, NOT CHANGED** |

**LEGAL (customer AND operator — `content/legal/`):**

| # | Site | The string | Verdict |
|---|---|---|---|
| a14 | `content/legal/privacy-policy.md:10` | `It also covers the HatchGrab mobile and tablet apps for iOS and Android.` | ❌ **B2 — "iOS" as the operating system.** ✅ **And it already says "mobile and tablet", so it is the one surface that was never iPad-only** |
| a15 | `content/legal/privacy-policy.md:106` | `\| Apple and Google \| Delivering push notifications to your device \|` | ❌ processor names in a data table |

**RENDERED-BUT-INTERNAL (admin console only, no operator or customer sees it):** a16–a20 are the same five `lib/plan-features.ts` strings re-rendered by `app/admin/page.tsx`; **counted once above, noted here so the census reconciles.**

### BUCKET (b) — IDENTIFIERS (27). 🔴 FROZEN.

`lib/features.ts:7` (`| 'ipad_kds'` — type member) · `:34` (`PRO_FEATURES`) · `:67` (`starter` set) · `lib/plan-features.ts:261` (`'iPad and Android kitchen app': 'ipad_kds'` — map key **and** value) · `app/api/orders/submit/route.ts:1279` (`.or('platform.eq.ios,platform.is.null')`) · `supabase/migrations/20260701_van_devices.sql:16` (`platform text -- 'ios' | 'web'`) · `lib/commerce-policy.ts:45` (`Capacitor.getPlatform() !== 'ios'`) · `lib/native/appLock.ts:82` (`iosFallbackTitle`) · `lib/stripe/connect.ts:502, :545, :557` (`applePay`) · `app/trucks/[slug]/order/page.tsx:1743` (`wallets: { applePay: 'auto' … }`) · `app/api/stripe/connect/route.ts:376` (`applePay=`) · `app/layout.tsx:60` (`apple: "/apple-touch-icon.png"`) · `public/manifest.json:11` · `proxy.ts:236` (matcher) · `components/EventListCard.tsx:164, :165, :235` and `app/venues/[slug]/VenueClient.tsx:50, :51` (UA sniffing + `maps.apple.com`) · `package.json:19` and 4 in `package-lock.json` (`@capacitor/ios`) · font stacks (`-apple-system`) in `lib/email.ts:374`, `lib/generateQRCode.ts:115`, `public/offline.html:10`, `app/globals.css`, `app/api/dashboard/action/route.ts:931`, `app/api/inbound-schedule/route.ts:320`, `scripts/run-scraper.js:1101`.

### BUCKET (c) — NATIVE CONFIG (31). 🔴 FROZEN BY B5.

`capacitor.config.ts` (8) · `ios/App/App/Info.plist` (4, incl. `UISupportedInterfaceOrientations~ipad`) · `ios/App/App.xcodeproj/project.pbxproj` (3, incl. `CODE_SIGN_IDENTITY = "iPhone Developer"`) · `App.entitlements` (2) · `AppRelease.entitlements` (3) · `PrivacyInfo.xcprivacy` (7) · both storyboards (6) · `ios/App/App/capacitor.config.json`, `android/app/src/main/assets/capacitor.config.json`, `Package.swift`, `AppIcon.appiconset/Contents.json`, `HGBridgeViewController.swift:303`, `ios/.gitignore`, 2 xcscheme plists.

✅ **NOT ONE BYTE OF BUCKET (b) OR (c) WAS TOUCHED — proved by `git diff --stat` at D5: one file changed, and it is a landing page.**

### BUCKET (d) — COMMENTS AND DOCS (872). Counts, per the declared deviation.

**`docs/` — 731 hits across ~62 report files.** **Source comments — 141**, the largest being `app/manage/[token]/page.tsx` (26 of its 28 hits are comments, nearly all `🔴 iOS (App Store 3.1.1/3.1.3)` gate annotations), `app/dashboard/[token]/page.tsx` (13), `lib/native/keepAwake.ts` (6), `lib/native/statusBar.ts` (5), `lib/commerce-policy.ts` (7).

## A2. 🔴 `ipad_kds` — the key and the label are in DIFFERENT FILES

**READ. `lib/features.ts` contains the KEY and NOTHING ELSE. Three occurrences, all identifier:**

```ts
export type Feature =
  // Core — all plans
  | 'discovery_map'
  | 'web_dashboard'
  | 'ipad_kds'                    // ← lib/features.ts:7 — TYPE MEMBER
```
```ts
const PRO_FEATURES: Feature[] = [
  …
  'ipad_kds',                     // ← lib/features.ts:34 — gate membership
```
```ts
  starter: new Set([
    …
    'ipad_kds',                   // ← lib/features.ts:67 — gate membership
```

> ## ✅ CONFIRMED: `lib/features.ts` HOLDS NO USER-VISIBLE LABEL AT ALL.
> Its only human strings are the plan names in `PLAN_META` (`'Starter'`, `'Pro'`, `'Max'`, …). **There is no `ipad_kds` label in this file to move.**

**The USER-VISIBLE LABEL lives in `lib/plan-features.ts:121`, a different file:**

```ts
      { name: 'iPad and Android kitchen app', footnote: '3', detail: 'The fullest way to run HatchGrab: a live kitchen screen, plus the only way to keep taking orders when you lose signal.', starter: true, pro: true, max: true },
```

**And the two are joined at `lib/plan-features.ts:261`, keyed on the DISPLAY NAME:**

```ts
  // ⚠️ Keyed on the ROW NAME, so renaming a row here without renaming it above silently drops that row
  // from findPlanParityViolations() — the guard stops checking and reports clean. Renamed with the merge.
  // The Feature key itself ('ipad_kds') is the ENFORCEMENT identifier in lib/features.ts and is NOT
  // renamed: it gates one KDS capability on both platforms, and changing it would need a data migration.
  'iPad and Android kitchen app': 'ipad_kds',
```

🔴 **WHICH IS WHICH, STATED PLAINLY:** **`ipad_kds` is the KEY** — a `Feature` type member and a gate identifier, referenced in `PLAN_FEATURES`, admin overrides and potentially plan data. **`'iPad and Android kitchen app'` is the LABEL** — and it is *also* a map key in `ROW_FEATURE_MAP`.

> ⚠️ **THE TRAP THE FILE ALREADY WARNS ABOUT, AND IT BINDS THIS TASK.** `ROW_FEATURE_MAP` is keyed on the **row name**. **Changing the label at `:121` WITHOUT changing the identical string at `:261` silently disables the drift guard for that row** — `findPlanParityViolations()` stops checking it and reports clean. **So the label is not a free-standing string: any rename is a TWO-SITE edit.** ✅ **Since B3 keeps the label unchanged, both sites are untouched and the guard still fires.**

## A3. Character lengths — every cell I considered

| Surface | Before | After (if changed) | Δ | Status |
|---|---|---|---|---|
| **Plan-matrix row name** `iPad and Android kitchen app` | **28** | `iPhone, iPad and Android kitchen app` = **36** | **+8 (+29%)** | 🔴 **NOT CHANGED (B3)** |
| **Pricing-card bullet** (same string, `<li>`) | **28** | **36** | +8 | 🔴 **NOT CHANGED (B3)** |
| **Footnote 3** | **142** | **150** | +8 | 🔴 **NOT CHANGED (B3)** |
| **Landing detail override** (a1) | **185** | **193** | +8 | ✅ **CHANGED** |
| **Landing "No signal" paragraph** (a2) | **157** | **165** | +8 | ✅ **CHANGED** |

**The phrase substitutions themselves:**

| From | To | Δ |
|---|---|---|
| `iPad` (4) | `iPhone, iPad` (12) | +8 |
| `iPad` (4) | `iPhone & iPad` (13) | +9 |
| `iPad and Android` (16) | `iPhone, iPad and Android` (24) | +8 |

> ## ⚠️ THE TRUNCATION QUESTION, ANSWERED HONESTLY: IT DOES NOT ARISE, BECAUSE NO MATRIX CELL WAS CHANGED.
> ✅ **Both changed strings are flowing PROSE — a table `detail` tooltip and a `<p>` inside `.does-item`. Neither is a fixed-width cell; both already wrap.** At 185 and 157 characters, eight more changes nothing about how they lay out.
> 🔴 **BUT THE MEASUREMENT MATTERS FOR THE DECISION YOU ARE BEING ASKED TO MAKE.** The row name is **+29% on a 28-character cell in a three-column comparison table**, and it is **the longest row name in its section** at 28 already (against `'Automatic schedule import'` at 25 and `'Automated stock countdown'` at 25). **At 36 it would be the longest name in the entire matrix.** ⚠️ **I have NOT measured it in a browser** — no `next dev` was run — **so whether it wraps to two lines or clips is UNVERIFIED. If you approve the B3 sites, that cell needs looking at on a narrow viewport before it ships.**

## A4. Strings shared between customer-facing and operator-facing surfaces

🔴 **YES — AND IT IS THE WHOLE PLAN MATRIX. READ, the import sites:**

| Consumer | Audience |
|---|---|
| `app/landing/page.tsx:21` — imports `FEATURE_SECTIONS`, `FOOTNOTES`, `TRANSACTION_ROWS` | 🔴 **MARKETING — public, customer-facing** |
| `app/manage/[token]/page.tsx:24` — imports the same | 🔴 **OPERATOR — the Billing tab Gusto and Tikka Tonic both see** |
| `app/admin/page.tsx:9` — imports the same | internal admin |

> ## 🔴 CHANGING `lib/plan-features.ts:121` WOULD CHANGE THE LANDING PAGE, EVERY OPERATOR'S BILLING TAB AND THE ADMIN CONSOLE IN ONE EDIT.
> **That is a live-operator surface on a handover week. It is a further reason the B3 sites are flagged rather than guessed.**

✅ **THE TWO STRINGS I DID CHANGE ARE NOT SHARED. READ, `app/landing/page.tsx:71-72`, the comment above the override map:**

> *"RENDER-ONLY feature-row description overrides for the landing table, keyed by row name. The shared FEATURE_SECTIONS details (lib/plan-features.ts) are NOT modified — **Billing/Admin keep the original text**."*

🔴 **So a1 is a LANDING-ONLY override and a2 is landing-only JSX. NEITHER APPEARS ON ANY OPERATOR SURFACE.** ⚠️ **CONSEQUENCE, stated because it is a real side effect: the landing page's Offline-Order-Protection tooltip now reads "iPhone, iPad and Android" while Billing's version of the same row still reads the shared `FEATURE_SECTIONS` text. They were already different strings by design — this widens that gap by eight characters.**

---

# PART B — THE EDIT

## B1. What changed, and why "and" rather than "&"

**Both sites, before → after:**

```diff
-  'Offline Order Protection': "If you lose signal, online ordering pauses so customers can't place orders you won't see. The iPad and Android app keeps you taking orders offline; the web dashboard needs a connection.",
+  'Offline Order Protection': "If you lose signal, online ordering pauses so customers can't place orders you won't see. The iPhone, iPad and Android app keeps you taking orders offline; the web dashboard needs a connection.",
```

```diff
-            <div className="does-item"><h3>No signal? Keep serving.</h3><p>…Carry on taking orders with the iPad and Android app.</p></div>
+            <div className="does-item"><h3>No signal? Keep serving.</h3><p>…Carry on taking orders with the iPhone, iPad and Android app.</p></div>
```

**Why these two are in scope and the others are not:** both are claims about **taking orders** on a device you own — *"keeps you taking orders offline"*, *"Carry on taking orders with"*. **Neither mentions the kitchen screen.** Every string that does is flagged in B3.

### 🔴 THE AMPERSAND WAS NOT USED, AND HERE IS THE EVIDENCE BOTH WAYS

**FOR `&` — READ, the landing pricing cards, which use it consistently in SHORT LABELS:**

```
                <li>Walk-up orders &amp; kitchen screen</li>
                <li>Menu, meal deals &amp; upsells</li>
                <li>Sold-out toggle &amp; stock countdown</li>
                <li>QR code &amp; discovery map listing</li>
                <li>Pre-orders &amp; collection times</li>
                <li>WhatsApp auto-replies (Messenger &amp; Instagram coming soon)</li>
```
**and `lib/plan-features.ts` row names:** `'Meal deals & upsells'`, `'Messenger & Instagram auto-replies'`, `'Event & festival pricing'`.

**AGAINST `&` at THESE two sites — READ, the copy being edited, which is PROSE and uses "and":**

> *"The **iPad and Android** app keeps you taking orders offline"* · *"Carry on taking orders with the **iPad and Android** app."*

**And the decisive point: the pair is not standing alone here — Android follows it.** `iPhone & iPad and Android` is not English. The alternatives were:

| Candidate | Verdict |
|---|---|
| `iPhone & iPad and Android app` | ❌ **ungrammatical — two conjunctions, one clause** |
| `iPhone, iPad & Android app` | ⚠️ compact and readable, **but it rewrites an existing "and" that the brief did not put in scope** |
| **`iPhone, iPad and Android app`** | ✅ **CHOSEN — adds one product name and touches nothing else in the sentence** |

> ## THE RULE I APPLIED, STATED SO IT CAN BE OVERRULED IN ONE LINE
> **Name the products, never the OS. Where the pair stands ALONE in a short label → `iPhone & iPad` (the card house style). Where Android follows in a list → `iPhone, iPad and Android` (the prose house style, and the style already at both sites).**
> ✅ **CONSISTENT: both changed sites are the list form and both read identically.** ⚠️ **The `&` form is therefore used NOWHERE in this diff — there was no site for it. If you want `iPhone, iPad & Android` instead, it is two more one-word edits.**

## B1b. 🔴 YOUR MID-TURN DECISION — `this iPad` → `this device`, all three sites

**You wrote:** *"in dashboard settings it shows 'alerts on this ipad' make sure this is accounted for in review. i think alerts on this device will be better. anywhere else theres mentions like that as well."*

✅ **Applied to all three, and a fresh targeted sweep (`this (iPad|iPhone)|on the iPad|your iPad` across `app/` and `components/`) confirms THREE user-visible sites and no fourth.** The only other hit is `components/dashboard/UserMenu.tsx:190`, which is **a code comment** (bucket d).

```diff
-          <p className="text-xs text-slate-500 mt-0.5">Alerts on this iPad. Turn on to choose which alerts you get.</p>
+          <p className="text-xs text-slate-500 mt-0.5">Alerts on this device. Turn on to choose which alerts you get.</p>
```
```diff
-              <p …>We couldn&apos;t reach the server to set up <strong>this iPad</strong>. Check the connection and try again — your orders and settings are unaffected.</p>
+              <p …>We couldn&apos;t reach the server to set up <strong>this device</strong>. Check the connection and try again — your orders and settings are unaffected.</p>
```
```diff
-              <p …>One-time setup for <strong>this iPad</strong>: the screen it opens to and which van it runs. Applies to this device only — …</p>
+              <p …>One-time setup for <strong>this device</strong>: the screen it opens to and which van it runs. Applies to this device only — …</p>
```

### ✅ THE SURROUNDING COPY ALREADY SAID "DEVICE" — `this iPad` WAS THE ODD ONE OUT

**READ, `components/native/OperatorDeviceConfig.tsx`, the strings AROUND the two that changed — none of them was ever edited:**

- `:104` heading — **"Set up this device"**
- `:94` — *"then **this device** sets up automatically — no further steps here"*
- `:106` — *"Applies to **this device** only — other devices are set separately"*
- `:109` — *"Which screen should **this device** open to?"*
- `:106` again — *the profile menu → **"This device"***

🔴 **The component's heading and four of its own sentences already said "device". Two strings said "iPad". The change makes the panel internally consistent rather than introducing a new word.** ✅ **And it matches the convention written down at `components/native/OfflineBanner.tsx:4`: *"Copy uses "device" (not "iPad") per the offline UX convention."***

⚠️ **ONE COPY OBSERVATION, REPORTED NOT ACTED ON.** `:106` now reads *"One-time setup for **this device**: … Applies to **this device** only"* — **"this device" twice in one paragraph, under a heading that already says "Set up this device".** ✅ **It is accurate and it reads fine.** **The tighter version drops the phrase entirely — *"One-time setup: the screen it opens to and which van it runs."* — but that is a rewrite rather than a substitution, so I left it. Say the word.**

## B2. `iOS` left alone where it means the operating system

✅ **Two user-visible sites, both correct as they stand:**

- `components/native/OperatorDeviceConfig.tsx:283` — *"set one up in **iOS Settings**"*. 🔴 **This is a wayfinding instruction naming the Settings app. "iPhone & iPad Settings" would be wrong on both devices.**
- `content/legal/privacy-policy.md:10` — *"the HatchGrab mobile and tablet apps for **iOS** and Android"*. ✅ **A legal document naming platforms, and it already says "mobile and tablet" — the one surface that never claimed iPad-only.**

✅ **All 141 source-comment uses of `iOS` also left alone** — comments are bucket (d).

## B3. ⚠️ KITCHEN-DISPLAY SITES — FLAGGED FOR YOUR DECISION, NOT CHANGED

**All five, with their exact text:**

| # | Site | Exact text | Why it is a kitchen claim |
|---|---|---|---|
| **1** | `lib/plan-features.ts:121` | `name: 'iPad and Android kitchen app'` | 🔴 the words **"kitchen app"**, and its `detail` is *"a live kitchen screen"* |
| **2** | `app/landing/page.tsx:315` | `<li>iPad and Android kitchen app</li>` | same phrase, on the Starter pricing card |
| **3** | `lib/plan-features.ts:222` | `'Tablet not supplied. There are native kitchen apps for iPad and Android, and the kitchen screen also runs on any tablet with a modern browser.'` | 🔴 **"Tablet not supplied"** and **"any tablet"** — the whole footnote is framed around tablets |
| **4** | `app/api/admin/create-operator/route.ts:132` | `<li>Add the dashboard to your iPad home screen for the kitchen display</li>` | 🔴 says **"for the kitchen display"** outright |
| **5** | `lib/plan-features.ts:261` | `'iPad and Android kitchen app': 'ipad_kds'` | **the map key that MUST mirror #1** (A2) |

⚠️ **NOTE ON #3 — IT IS THE STRONGEST ARGUMENT FOR LEAVING ALL FIVE.** *"Tablet not supplied … also runs on any tablet"* is a coherent paragraph **about tablets**. Inserting "iPhone" into it produces *"native kitchen apps for iPhone, iPad and Android … also runs on any tablet"* — **which invites the reader to ask why a phone app is listed in a tablet footnote.** 🔴 **That is a copy rewrite, not a substitution, and it is not mine to make.**

⚠️ **AND THE CONSISTENCY COST OF MY OWN EDIT, STATED PLAINLY: the landing page now carries BOTH forms.** The comparison table's Offline-Order-Protection tooltip says *"iPhone, iPad and Android"* while the Starter card three sections above says *"iPad and Android kitchen app"*. ✅ **Defensible — the first is about taking orders, the second about the kitchen screen — but a reader scanning one page will see two device lists.** 🔴 **If you decide the kitchen claim should also name the iPhone, sites 1, 2, 3 and 5 change together, and #5 must change in the same commit or the drift guard goes quiet.**

## B4 / B5. Nothing frozen was touched

✅ **No identifier, key, type member, column value, CSS class or filename changed.** ✅ **`Info.plist`, `capacitor.config.ts`, both `.entitlements` and `project.pbxproj` were READ during the census and NOT modified — proved at D5: the diff is one `.tsx` file.**

---

# PART C — BOUNDARIES

## C1. `git diff --stat`

```
 app/landing/page.tsx                       | 4 ++--
 components/native/NotificationSettings.tsx | 2 +-
 components/native/OperatorDeviceConfig.tsx | 4 ++--
 3 files changed, 5 insertions(+), 5 deletions(-)
```

🔴 **THREE FILES, FIVE LINES, ALL `.tsx` PRESENTATION COMPONENTS — one page and two native UI cards.** ✅ **No file under `lib/`, `supabase/migrations/`, `ios/` or `android/` appears. `lib/features.ts` and `lib/plan-features.ts` are absent, so no plan gate and no matrix data moved.** ✅ **Insertions equal deletions on every file: five strings replaced, nothing added or removed structurally.**

## C2. `ipad_kds` — byte-identical

```
$ git diff --stat lib/features.ts lib/plan-features.ts
(no output — neither file is modified)
```

✅ **The KEY is byte-identical at all three sites** (`lib/features.ts:7, :34, :67`) **and at the map value** (`lib/plan-features.ts:261`). ✅ **The label did not move either** — B3 flagged it instead. **Nothing moved at all in either file.**

## C3. What each live operator now sees differently

⚠️ **THIS ANSWER CHANGED WITH THE SECOND PASS AND IS NO LONGER "nothing".**

**Pizzeria Gusto (trades with real money):** **On the WEB — nothing.** Their manage pages, Billing tab, plan matrix and every price and gate are byte-identical. **In the NATIVE APP, two words:** the dashboard Settings notification card now reads *"Alerts on this **device**"* instead of *"this iPad"*, and the device-setup panel says *"set up this **device**"*. 🔴 **DISPLAY-ONLY. No control, toggle, gate, price or payment path is touched — the toggles do exactly what they did.**

**Tikka Tonic (handed over):** **The same two words in the app, and nothing else.** ✅ **Their onboarding email — the one string that names the iPad in an operator-facing message — is `app/api/admin/create-operator/route.ts:132` and was flagged under B3, NOT edited.**

✅ **Neither operator sees the landing-page change unless they visit the public marketing site.**

## C4. Every changed string, before and after

| # | File:line | Before | After |
|---|---|---|---|
| 1 | `app/landing/page.tsx:74` | If you lose signal, online ordering pauses so customers can't place orders you won't see. **The iPad and Android app** keeps you taking orders offline; the web dashboard needs a connection. | If you lose signal, online ordering pauses so customers can't place orders you won't see. **The iPhone, iPad and Android app** keeps you taking orders offline; the web dashboard needs a connection. |
| 2 | `app/landing/page.tsx:204` | If you lose signal, online ordering pauses automatically so customers can't place orders you won't see. Carry on taking orders with **the iPad and Android app**. | If you lose signal, online ordering pauses automatically so customers can't place orders you won't see. Carry on taking orders with **the iPhone, iPad and Android app**. |
| 3 | `components/native/NotificationSettings.tsx:67` | Alerts on **this iPad**. Turn on to choose which alerts you get. | Alerts on **this device**. Turn on to choose which alerts you get. |
| 4 | `components/native/OperatorDeviceConfig.tsx:82` | We couldn't reach the server to set up **this iPad**. Check the connection and try again — your orders and settings are unaffected. | We couldn't reach the server to set up **this device**. Check the connection and try again — your orders and settings are unaffected. |
| 5 | `components/native/OperatorDeviceConfig.tsx:106` | One-time setup for **this iPad**: the screen it opens to and which van it runs. Applies to this device only — other devices are set separately, and you can change these later from the profile menu → "This device". | One-time setup for **this device**: the screen it opens to and which van it runs. Applies to this device only — other devices are set separately, and you can change these later from the profile menu → "This device". |

**That is the complete list. Five strings, three files. Rows 1–2 add 8 characters each; rows 3–5 add 2 characters each (`iPad` 4 → `device` 6).**

## C5. ⚠️ EVERY user-visible "iPad" I did NOT change, and why

| Site | Text | Why not |
|---|---|---|
| `lib/plan-features.ts:121` | `iPad and Android kitchen app` | **B3** — kitchen app |
| `app/landing/page.tsx:315` | `iPad and Android kitchen app` | **B3** — same string, pricing card |
| `lib/plan-features.ts:222` | footnote 3, `native kitchen apps for iPad and Android` | **B3** — a tablet-framed footnote |
| `lib/plan-features.ts:261` | `'iPad and Android kitchen app'` map key | **must mirror :121, which B3 froze** |
| `app/api/admin/create-operator/route.ts:132` | `Add the dashboard to your iPad home screen for the kitchen display` | **B3** — says "for the kitchen display" |
| `components/native/OperatorDeviceConfig.tsx:283` | `set one up in iOS Settings` | **B2** — the OS, and the literal app name |
| `content/legal/privacy-policy.md:10` | `apps for iOS and Android` | **B2** — the OS, in a legal document |

### ✅ THE THREE THAT FIT NO RULE IN THE BRIEF — RESOLVED BY YOUR MID-TURN CALL

**These were flagged here as *"not changed, and the ones I most want you to look at"*. You looked, and decided: `this iPad` → `this device`. All three are now CHANGED — see B1b and C4 rows 3–5.**

🔴 **WHY THEY NEEDED A DECISION RATHER THAN A GUESS: they are not availability claims — they are SELF-REFERENCES to the device in the operator's hand.** B1's substitution would have produced *"Alerts on this iPhone & iPad"*, which is nonsense. ⚠️ **But they were also the strings that would ACTUALLY BE WRONG on a phone:** an operator running the universal build reads *"One-time setup for this iPad"* **on the phone**. ✅ **"Device" is the only word that is true on both.**

✅ **AND THE HOUSE ANSWER WAS ALREADY WRITTEN DOWN — your instinct matched the existing convention. READ, `components/native/OfflineBanner.tsx:4`:**

> *"Copy uses **"device"** (not "iPad") per the offline UX convention."*

**Nothing user-visible now names a device where it means "the one in your hand". The only remaining user-visible `iPad` strings are the five kitchen-display claims in the table above.**

---

# PART D — INTEGRITY

## D1 / D2. Non-ASCII census of the THREE edited files, before and after

**`app/landing/page.tsx` — 34,842 → 34,858 bytes (+16), 509 → 509 lines (+0)**

| Codepoint | Name | Before | After | Δ |
|---|---|---|---|---|
| U+2500 | BOX DRAWINGS LIGHT HORIZONTAL | 93 | 93 | 0 |
| U+2014 | EM DASH | 56 | 56 | 0 |
| U+2019 | RIGHT SINGLE QUOTATION MARK | 22 | 22 | 0 |
| U+2192 | RIGHTWARDS ARROW | 12 | 12 | 0 |
| U+00A3 | POUND SIGN | 11 | 11 | 0 |
| **U+26A0** | **WARNING SIGN** | **11** | **11** | **0** |
| **U+FE0F** | **VARIATION SELECTOR-16** | **11** | **11** | **0** |
| U+1F534 | LARGE RED CIRCLE | 6 | 6 | 0 |
| U+00D7 | MULTIPLICATION SIGN | 6 | 6 | 0 |
| U+201C | LEFT DOUBLE QUOTATION MARK | 3 | 3 | 0 |
| U+2713 | CHECK MARK | 2 | 2 | 0 |
| U+2248 | ALMOST EQUAL TO | 2 | 2 | 0 |
| U+201D | RIGHT DOUBLE QUOTATION MARK | 2 | 2 | 0 |
| U+2605 | BLACK STAR | 2 | 2 | 0 |
| U+2728 | SPARKLES | 2 | 2 | 0 |
| U+2265 | GREATER-THAN OR EQUAL TO | 1 | 1 | 0 |
| U+2026 | HORIZONTAL ELLIPSIS | 1 | 1 | 0 |
| U+00B7 | MIDDLE DOT | 1 | 1 | 0 |
| U+00A9 | COPYRIGHT SIGN | 1 | 1 | 0 |

> ## 🔴 DISTINCT CLASSES 19 → 19. GAINED NONE, LOST NONE — **AND NOT ONE COUNT CHANGED EITHER.**
> **Every one of the +16 bytes is ASCII: `iPhone, ` twice, 8 characters each.** ✅ **A census where nothing at all moved is the strongest possible pass, and it is exactly what a pure ASCII insertion should produce.**

> ## ⚠️ THE PAIR CHECK, EXPLICITLY: **U+26A0 = 11, U+FE0F = 11 — PAIRED**, before and after.
> 🔴 **AND THE HAZARD D2 NAMES WAS LIVE HERE.** This file already contains **22 typographic apostrophes (U+2019)** — the sentence I edited at `:204` literally reads *"customers can't place orders you won't see"* with **curly** apostrophes. **A straight `'` typed into that copy would have been invisible on screen and a silent inconsistency in the source; a new curly one in the other string would have been a class change.** ✅ **Neither happened: U+2019 is still exactly 22, because the inserted text contains no punctuation at all.**

### `components/native/NotificationSettings.tsx` — 5,483 → 5,485 bytes (+2), 96 → 96 lines

| Codepoint | Name | Before | After | Δ |
|---|---|---|---|---|
| U+2014 | EM DASH | 6 | 6 | 0 |
| U+2022 | BULLET | 3 | 3 | 0 |
| U+2192 | RIGHTWARDS ARROW | 2 | 2 | 0 |
| U+1F514 | BELL | 1 | 1 | 0 |

🔴 **4 → 4 distinct. GAINED NONE, LOST NONE, and no count changed.** ⚠️ **U+26A0 = 0, U+FE0F = 0 — PAIRED (trivially). This file has never held a warning glyph, and the new copy adds none.**

### `components/native/OperatorDeviceConfig.tsx` — 18,309 → 18,313 bytes (+4), 288 → 288 lines

| Codepoint | Name | Before | After | Δ |
|---|---|---|---|---|
| U+2500 | BOX DRAWINGS LIGHT HORIZONTAL | 311 | 311 | 0 |
| U+2014 | EM DASH | 23 | 23 | 0 |
| U+2192 | RIGHTWARDS ARROW | 15 | 15 | 0 |
| U+2026 | HORIZONTAL ELLIPSIS | 3 | 3 | 0 |
| U+2013 | EN DASH | 2 | 2 | 0 |
| U+2019 | RIGHT SINGLE QUOTATION MARK | 1 | 1 | 0 |

🔴 **6 → 6 distinct. GAINED NONE, LOST NONE, and no count changed.** ⚠️ **U+26A0 = 0, U+FE0F = 0 — PAIRED.**

> ## 🔴 ALL THREE EDITED FILES: NOT ONE CODEPOINT COUNT MOVED IN ANY OF THEM.
> **+16, +2 and +4 bytes, every byte of it ASCII** — `iPhone, ` twice, and `iPad` → `device` three times. ✅ **This file carries an em dash AND an en dash one line apart (`:82` and elsewhere); a substitution that reached for the wrong dash would show here as a count change. None did.**

## D3. Byte scan — byte-level, never `grep`

```
app/landing/page.tsx                          34,858 bytes   NUL 0   control none
components/native/NotificationSettings.tsx     5,485 bytes   NUL 0   control none
components/native/OperatorDeviceConfig.tsx    18,313 bytes   NUL 0   control none
```

✅ **Clean.** **Three files were edited, so three files are scanned.**

## D4. Byte scan of this report — separate pass, AFTER writing

```
docs/device-naming-report.md   37,355 bytes
  NUL (0x00)                                     : 0
  control bytes < 0x09, plus 0x0B 0x0C 0x0E-0x1F : none
  distinct non-ASCII classes                     : 12
  U+26A0 = 23, U+FE0F = 23                         : PAIRED
```

✅ **Clean.** Byte-level, never `grep`, run as its own pass after the file was written.

## D5. `git status` and `git diff --stat`

```
$ git status --porcelain
 M app/landing/page.tsx
 M components/native/NotificationSettings.tsx
 M components/native/OperatorDeviceConfig.tsx
?? docs/device-naming-report.md
```

⚠️ **THIS CHANGED UNDER ME MID-TASK, AND IT IS WORTH RECORDING RATHER THAN QUIETLY RESTATING.** An earlier draft of this section listed `capacitor.config.ts`, `lib/payments/refund.ts`, `docs/reference-manual.md` and four report files as modified/untracked — the previous turns' work. **They are gone from `git status` because you committed them while this task was running:**

```
$ git log --oneline -3
ccc5a2d ipad again
15e0020 ipad fixes
52adca0 ipad
```

✅ **So the working tree above is now EXACTLY this task's five copy edits and this report — nothing else is outstanding.** 🔴 **I did not commit anything: all three commits are yours.**

```
$ git diff --stat        (this task's three files)
 app/landing/page.tsx                       | 4 ++--
 components/native/NotificationSettings.tsx | 2 +-
 components/native/OperatorDeviceConfig.tsx | 4 ++--
 3 files changed, 5 insertions(+), 5 deletions(-)
```

⚠️ **`capacitor.config.ts`, `lib/payments/refund.ts` and `docs/reference-manual.md` are EARLIER TURNS' work and were not touched today** — the `allowNavigation` entry, the refund fee comment and the V11.18 manual update. **Nothing is committed.**

## D6. `tsc`

```
$ npx tsc --noEmit ; echo "tsc exit=$?"
tsc exit=0
```

✅ **Clean, no output.**

> ## 🔴 AND `tsc`-CLEAN IS NOT VERIFICATION OF A COPY CHANGE. EVERY STRING COMPILES.
> **A typo, a wrong product name, a clipped table cell and a sentence that contradicts the footnote three sections below it are all `tsc`-clean.** ⚠️ **The real checks for this change are: read C4's before/after as prose, and — for the B3 sites if you approve them — look at the 36-character row name in a narrow viewport.** 🔴 **NOTHING WAS RENDERED. No `next dev`, no `next build`, so no string in this report has been seen on a screen.**

---

# PROVENANCE

**READ** — the full four-term census (two passes: word-boundary, then identifier-shaped) · the follow-up targeted sweep `this (iPad|iPhone)|on the iPad|your iPad` · all 78 bucket (a)/(b)/(c) hits listed above · `lib/features.ts:1-75` and `:140-150` · `lib/plan-features.ts:110-135, 205-265` · `app/landing/page.tsx:60-80, 200-210, 305-335` · `components/native/OperatorDeviceConfig.tsx:82, 106, 283` · `components/native/NotificationSettings.tsx:67` · `components/native/OfflineBanner.tsx:4` · `app/api/admin/create-operator/route.ts:132` · `content/legal/privacy-policy.md:10, 106` · the three `plan-features` import sites · both censuses · the byte scan · `git status`, `git diff`, `git diff --stat` · `tsc`.

**INFERRED** — that the flagged strings are kitchen-display claims (read from their own wording, not from product intent) · that a 36-character row name is the longest in the matrix (measured in characters, **not rendered**).

**NOT VERIFIED** — 🔴 **nothing was rendered in a browser or on a device.** The truncation answer in A3 rests on the changed strings being flowing prose, read from the markup, **not observed**. ✅ **The two `components/native/` cards render ONLY inside the native app** (both self-gate on `isNativeApp()`), **so their new copy cannot be checked in a browser at all — it needs the device.** ⚠️ **`device` is two characters longer than `iPad`, inside `<p className="text-xs">` paragraphs that already wrap, so no clipping is expected — but expected is not seen.**
