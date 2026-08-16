# iPhone added to the kitchen-app claims, and the biometric copy made true on both platforms

Scope honoured: **three files edited, copy and comments only.** No `next dev`, no `next build`, no
`cap sync`, no deploy, no commit, no package installed, no migration, no native config, **no feature
key**, no gate, no type.

**No span of the prompt arrived garbled, and no instruction contradicted another.**

Landing, manage → billing and admin are reported **separately**. Every claim is marked **READ**,
**INFERRED** or **EXECUTED** (run against the real module).

> ✅ `npx tsc --noEmit` exits 0.
> ✅ **The parity guard was EXECUTED, not reasoned about** — `findPlanParityViolations()` returns **0**.
> 🔴 **And the counterfactual was executed too: with the map key left behind it ALSO returns 0.** C3.

---

# PART A — THE KITCHEN-APP CLAIMS

## A1. The four claims, quoted BEFORE

**READ** — `lib/plan-features.ts:121`, the plan-matrix row:

```ts
      { name: 'iPad and Android kitchen app', footnote: '3', detail: 'The fullest way to run HatchGrab: a live kitchen screen, plus the only way to keep taking orders when you lose signal.', starter: true, pro: true, max: true },
```

**READ** — `app/landing/page.tsx:315`, the Starter pricing-card bullet:

```tsx
                <li>iPad and Android kitchen app</li>
```

**READ** — `lib/plan-features.ts:222`, footnote 3:

```ts
    text: 'Tablet not supplied. There are native kitchen apps for iPad and Android, and the kitchen screen also runs on any tablet with a modern browser.',
```

**READ** — `lib/plan-features.ts:261`, the `ROW_FEATURE_MAP` twin:

```ts
  'iPad and Android kitchen app': 'ipad_kds',
```

## A2. Changed — and 36 IS now the longest cell, by two

**READ, after:**

```ts
      { name: 'iPhone, iPad and Android kitchen app', footnote: '3', detail: 'The fullest way to run HatchGrab: a live kitchen screen, plus the only way to keep taking orders when you lose signal.', starter: true, pro: true, max: true },
```

```tsx
                <li>iPhone, iPad and Android kitchen app</li>
```

```ts
    text: 'Device not supplied. There are native kitchen apps for iPhone, iPad and Android, and the kitchen screen also runs on any phone or tablet with a modern browser.',
```

```ts
  'iPhone, iPad and Android kitchen app': 'ipad_kds',
```

**EXECUTED** — the real module loaded and sorted by length:

```
longest cell: "iPhone, iPad and Android kitchen app" 36
runner-up   : "Messenger & Instagram auto-replies" 34
```

✅ **CONFIRMED: it is now the longest cell, by TWO characters.** ⚠️ **That is a change of state and it
is stated rather than glossed** — before this edit the row was 28 and third-equal; the 34-character row
already renders on all three surfaces, so 36 is two characters past a width that demonstrably fits, not
two characters past anything measured to fail. **INFERRED: it fits. Nothing has been rendered since to
prove it, and that is the one claim in this report resting on inference rather than execution.**

🔴 **FOOTNOTE 3 NEEDED MORE THAN THE INSERTION, AND THE REASON IS THE ONE THE PREVIOUS REPORT
PREDICTED.** *"Tablet not supplied … also runs on any tablet"* is a paragraph built entirely around
tablets. Inserting "iPhone" into it would have produced a **phone app listed inside a tablet
footnote** — the exact incoherence flagged as the argument for leaving it alone. The caveat was never
about tablets; **it is about not supplying HARDWARE.** So `Tablet not supplied` → `Device not
supplied`, and `any tablet` → `any phone or tablet`. **The reasoning is recorded at the line:**

```ts
    // ⚠️ "Device not supplied", NOT "Tablet not supplied", AND THE CHANGE IS FORCED BY THE ROW ABOVE.
    // With iPhone named, a footnote framed entirely around tablets would list a phone app and then say
    // the fallback runs "on any tablet" — which invites the reader to ask why a phone app is in a tablet
    // footnote. The caveat is about not supplying HARDWARE; it was never about tablets specifically.
```

⚠️ **The standing editorial rule above it was READ and honoured** — *"DO NOT ADD 'coming soon' HERE…
the native apps are in the PRESENT TENSE deliberately"* — the new text keeps the present tense and adds
no tense marker.

## A3. 🔴 The row name as a map key — all five sites, and every one confirmed

**READ** — every place a feature row name is used as a key or compared, found by sweeping `row.name`
across the whole tree:

| # | Site | Kind | Contains the kitchen row? | Action |
|---|---|---|---|---|
| **1** | `lib/plan-features.ts:271` `ROW_FEATURE_MAP` | `Record<string, Feature>` keyed by row name | 🔴 **YES** | ✅ **UPDATED in the same commit** |
| **2** | `app/landing/page.tsx:73` `DETAIL_OVERRIDES` | `Record<string, string>` keyed by row name | **no** — one key, `'Offline Order Protection'` | ✅ nothing to change, confirmed by reading it |
| **3** | `app/landing/page.tsx:50-51` `trialFeatureValue` | two `row.name ===` comparisons | **no** — `'Online ordering — Pay at Hatch'`, `'SMS order alerts'` | ✅ nothing to change |
| **4** | `app/manage/[token]/page.tsx:10402` | one `row.name ===` comparison | **no** — `'Online ordering — Pay at Hatch'` | ✅ nothing to change |
| **5** | `app/admin/page.tsx:813` `isPayAtHatch` | one `row.name ===` comparison | **no** — `'Online ordering — Pay at Hatch'` | ✅ nothing to change |

⚠️ **`FOOTNOTE_TEXT_OVERRIDES` (`landing/page.tsx:67`) is keyed by FOOTNOTE NUMBER, not row name** —
one key, `'2'` — so footnote 3's text change reaches all three surfaces unmodified. **Checked because
a footnote override would have silently kept the old wording on the landing page only.**

🔴 **PROOF THAT NO MAP WAS MISSED, PARSED RATHER THAN ASSERTED.** Both files were re-parsed and the two
sets cross-checked:

```
  FEATURE_SECTIONS rows: 27 | ROW_FEATURE_MAP keys: 22
  rows with NO map entry (guard silently skips these): 5
     - 'Automatic schedule import' · 'SMS order alerts' · 'Multi-user access'
     - 'Event & festival pricing' · 'Digital loyalty stamp cards'
  map keys matching NO row (dead keys): 0
  kitchen row: 'iPhone, iPad and Android kitchen app'  -> maps to 'ipad_kds'
```

**A missed map would show up as BOTH a dead key and an unmapped row. There are zero dead keys, and the
kitchen row resolves.**

✅ **AND THE FIVE UNMAPPED ROWS ARE PRE-EXISTING, NOT COLLATERAL.** The identical parse against
`git show HEAD:lib/plan-features.ts` returns **the same five, and zero dead keys** — they are rows for
capabilities with no `Feature` enum member, which the guard has always skipped.

## A4. 🔴 The hand-written pricing-card bullet

**READ, before** — `app/landing/page.tsx:310-315`. These are literal `<li>` elements; **nothing
imports them and nothing checks them against `FEATURE_SECTIONS`:**

```tsx
                <li>Sold-out toggle &amp; stock countdown</li>
                <li>QR code &amp; discovery map listing</li>
                <li>iPad and Android kitchen app</li>
```

**READ, after — updated, with the hazard recorded at the line so the next person does not have to
rediscover it:**

```tsx
                {/* ⚠️ HAND-WRITTEN, NOT RENDERED FROM FEATURE_SECTIONS. This bullet is a literal twin of the
                    matrix row in lib/plan-features.ts and nothing checks the two against each other, so it
                    must be changed in the SAME commit or the same page shows two different claims. */}
                <li>iPhone, iPad and Android kitchen app</li>
```

⚠️ **Had this been missed, the SAME PAGE would have carried both claims** — the Starter card saying
"iPad and Android" three hundred lines above a matrix row saying "iPhone, iPad and Android". **No guard
would have reported it.**

## A5. All three renderers show the new wording

**EXECUTED** — the real `lib/plan-features.ts` module was loaded (only the `@/` path alias rewritten,
`diff` confirming the copy is otherwise byte-identical) and asked what the renderers read:

```
  row.name   = "iPhone, iPad and Android kitchen app" | footnote 3 | starter/pro/max true true true
  footnote 3 = "Device not supplied. There are native kitchen apps for iPhone, iPad and Android, and the kitchen screen also runs on any phone or tablet with a modern browser."
  parity     = 0 violations
```

**And the three render sites, READ, each reading that same value:**

```tsx
// LANDING — app/landing/page.tsx:395 and :410
<span className="f-name">{row.name}{row.footnote && <sup className="f-note">{row.footnote}</sup>}</span>
// LANDING footnotes — :425
{FOOTNOTES.map(f => (

// MANAGE → BILLING — app/manage/[token]/page.tsx:10346 and :10395
                {row.name}
// billing footnotes — :10427
      {FOOTNOTES.map(f => (

// ADMIN — app/admin/page.tsx:789 and :809
                      {row.name}
// admin footnotes — :832
              {FOOTNOTES.map(f => (
```

✅ **Landing:** matrix row and footnote 3 both new; **plus** the hand-written Starter bullet (A4).
✅ **manage → billing:** matrix row and footnote 3 both new. **No override exists on this surface.**
✅ **Admin console:** matrix row and footnote 3 both new.

## A6. ✅ `ipad_kds` — byte-identical

**READ** — every occurrence, and the diff line that contains it:

```
lib/features.ts:7        "| 'ipad_kds'"
lib/features.ts:34       "'ipad_kds',"
lib/features.ts:67       "'ipad_kds',"
lib/plan-features.ts:271 "'iPhone, iPad and Android kitchen app': 'ipad_kds',"
```

```diff
-  'iPad and Android kitchen app': 'ipad_kds',
+  'iPhone, iPad and Android kitchen app': 'ipad_kds',
```

🔴 **THE KEY CHANGED; THE VALUE DID NOT.** `'ipad_kds'` appears character-for-character on both sides
of that pair. ✅ **`git diff --stat -- lib/features.ts` produces no output — the enforcement identifier's
own file is untouched**, so no gate, no allow-list and no `Feature` union member moved.

## A7. ✅ The onboarding email — untouched

**READ** — `app/api/admin/create-operator/route.ts:132`, unchanged:

```html
        <li>Add the dashboard to your iPad home screen for the kitchen display</li>
```

✅ **`git status --porcelain` for that file returns nothing.** It is an instruction to a named operator
about the device in their hand, not a claim about availability — and *"Add to Home Screen"* is Safari's
exact menu wording, so a platform-neutral rewrite would make it vaguer without making it more useful.

---

# PART B — THE BIOMETRIC COPY

## B1. The string and its render conditions

**READ, before** — `components/native/OperatorDeviceConfig.tsx:283`:

```tsx
{appLock && !bioAvailable && <p className="text-[11px] text-amber-600 -mt-1">No Face ID / Touch ID enrolled on this device — set one up in iOS Settings. Your backup PIN still works.</p>}
```

**Three conditions, all READ, all required:**

1. **The component renders at all** — `ThisDeviceSettings` (`:145`), reached from the dashboard's
   device card and the KDS's device sheet, both gated on `isNativeApp()`.
2. **`appLock`** — `isAppLockEnabled()` (`:163`), the per-device toggle, **default off**.
3. **`!bioAvailable`** — `:164`, `void isBiometricAvailable().then(setBioAvailable)`.

**READ** — and `isBiometricAvailable` is cross-platform, which is what makes the copy false:

```ts
lib/native/appLock.ts:64   const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth')
lib/native/appLock.ts:65   const info = await BiometricAuth.checkBiometry()
```

**READ** — registered in the Android build:

```
android/capacitor.settings.gradle:5   include ':aparajita-capacitor-biometric-auth'
android/capacitor.settings.gradle:6   project(':aparajita-capacitor-biometric-auth').projectDir = new File('../node_modules/@aparajita/capacitor-biometric-auth/android')
```

## B2. ✅ The whole sentence replaced — and it was not the only one

🔴 **THE SCAN FOUND THREE USER-VISIBLE APPLE-BRAND STRINGS IN THIS COMPONENT, NOT ONE.** The brief
names `:283`; **`:244` is the toggle's own label and is the most prominent of the three.** All three
are replaced, with **one shared phrase** so they cannot drift:

```diff
-        <span className="font-semibold text-slate-700">Require Face&nbsp;ID / Touch&nbsp;ID to open</span>
+        <span className="font-semibold text-slate-700">Require fingerprint or face unlock to open</span>
```

```diff
-          <p …>Your way in if Face / Touch ID won&apos;t work — it&apos;s the only fallback, so don&apos;t forget it (a forgotten PIN means reinstalling the app). Works offline.</p>
+          <p …>Your way in if fingerprint or face unlock won&apos;t work — it&apos;s the only fallback, so don&apos;t forget it (a forgotten PIN means reinstalling the app). Works offline.</p>
```

```diff
-      {appLock && !bioAvailable && <p …>No Face ID / Touch ID enrolled on this device — set one up in iOS Settings. Your backup PIN still works.</p>}
+      {appLock && !bioAvailable && <p …>No fingerprint or face unlock set up on this device — add one in your device settings. Your backup PIN still works.</p>}
```

⚠️ **`Face&nbsp;ID` went with it.** The non-breaking spaces existed to stop "Face ID" wrapping mid-brand;
the new label has no two-word brand to protect, so they are simply gone rather than moved.

**And the comment that documents the control was corrected too, because leaving it would have made the
file contradict itself:**

```diff
-      {/* APP-LOCK — device-level Face ID / Touch ID gate (per-device, default off). SEPARATE from login.
+      {/* APP-LOCK — device-level biometric gate (per-device, default off). SEPARATE from login.
+          NOTE: THE COPY NAMES THE CONCEPT, NOT A VENDOR. lib/native/appLock.ts uses
+          @aparajita/capacitor-biometric-auth, which is registered in android/capacitor.settings.gradle as
+          well as on iOS — so "Face ID / Touch ID" was false on every Android device, in all three strings
+          below. "fingerprint or face unlock" is the one phrase true on both, and it is used verbatim in
+          each of them so they cannot drift apart.
```

## B3. The final wording, and its length

| Site | Before | chars | After | chars |
|---|---|---|---|---|
| Toggle label `:244` | `Require Face ID / Touch ID to open` | 34 | **`Require fingerprint or face unlock to open`** | **42** |
| PIN help `:265` | `Your way in if Face / Touch ID won't work — …` | — | **`Your way in if fingerprint or face unlock won't work — …`** | — |
| Warning `:288` | `No Face ID / Touch ID enrolled on this device — set one up in iOS Settings. Your backup PIN still works.` | 104 | **`No fingerprint or face unlock set up on this device — add one in your device settings. Your backup PIN still works.`** | **115** |

**Why this wording, against B3's two requirements:**

- ✅ **It names the concept, not a vendor.** *"fingerprint or face unlock"* describes what the operator
  actually does on either platform. **"Biometric" was considered and rejected** — it is the accurate
  technical word and the wrong one for a card an operator reads once at a hatch.
- ✅ **It says what is not set up AND where to set it up.** *"add one in your device settings"* is true
  on both: iOS Settings and Android Settings are both reached that way, and neither is named.
- ⚠️ **`enrolled` → `set up`, deliberately.** "Enrolled" is Apple's and Android's internal vocabulary,
  not an operator's.
- ⚠️ **The warning grew 104 → 115 characters** in an `text-[11px]` amber paragraph that already wraps.
  **INFERRED: it wraps to one more line at most.**

## B4. Every other platform-specific string in the component

| Site | String | Now wrong? | Action |
|---|---|---|---|
| `:244` toggle label | `Require Face ID / Touch ID to open` | 🔴 **YES — false on Android** | ✅ **FIXED** (B2) |
| `:260` PIN help | `Your way in if Face / Touch ID won't work…` | 🔴 **YES — same** | ✅ **FIXED** (B2) |
| `:283` warning | `No Face ID / Touch ID… iOS Settings` | 🔴 **YES — both clauses** | ✅ **FIXED** (B2) |
| `:241` comment | `device-level Face ID / Touch ID gate` | ⚠️ incomplete | ✅ **FIXED** — it documents the control being changed |
| `:94`, `:97` | `Activate one in Settings → Vans` · `Go to Settings → Vans` | ✅ **no** | none — HatchGrab's **own** Settings tab, not an OS settings app |
| `:285` | `These settings apply to this device only — other devices are configured separately.` | ✅ **no** | none — already platform-neutral |

🔴 **AND THREE MORE OF THE SAME CLASS EXIST OUTSIDE THIS COMPONENT. REPORTED AND STOPPED, BECAUSE THE
SCOPE SAYS "in that component".**

**READ** — `components/native/AppLockGate.tsx`, the lock screen itself:

```tsx
AppLockGate.tsx:76      Can&apos;t use Face / Touch ID?
AppLockGate.tsx:95      className="text-white/50 text-xs underline">Try Face / Touch ID instead</button>
AppLockGate.tsx:2       // Biometric APP-LOCK overlay. When enabled (per-device), covers the screen and prompts Face ID / Touch ID
```

⚠️ **THIS CREATES A DRIFT I AM FLAGGING RATHER THAN HIDING: the settings card now says "fingerprint or
face unlock" while the lock screen it configures still says "Face / Touch ID".** Both are wrong on
Android in the same way, and the fix is the same two words — but `AppLockGate.tsx` is a different file
and the instruction scoped B4 to *"that component"*. 🔴 **STOPPED. It is one edit whenever you want
it**, and `lib/native/appLock.ts:5,71` carries the same phrase in two comments.

## B5. ✅ Nothing about the behaviour changed

**READ** — the diff for `OperatorDeviceConfig.tsx` touches **four `<span>`/`<p>`/comment lines and
nothing else.** No import, no state, no handler, no condition:

- `isBiometricAvailable`, `verifyIdentity`, `setAppLockPin`, `clearAppLockPin`, `setAppLockEnabled` —
  **all still imported at `:8` and called at exactly the same sites.**
- The render condition `{appLock && !bioAvailable && …}` is **character-for-character unchanged**.
- The toggle's `onChange`, the PIN-length checks and the PIN-match check are **outside the diff**.

✅ **`npx tsc --noEmit` exits 0**, and `lib/native/appLock.ts` is not in the diff.

---

# PART C — BOUNDARIES

## C1. `git diff --stat` — this task's three files

```
 app/landing/page.tsx                       |  5 ++++-
 components/native/OperatorDeviceConfig.tsx | 13 +++++++++----
 lib/plan-features.ts                       | 16 +++++++++++++---
 3 files changed, 26 insertions(+), 8 deletions(-)
```

✅ **Boundary greps against this task's diff — every one zero except the one that must not be:**

```
  ipad_kds               3   <-- the map line's VALUE, unchanged on both sides (A6)
  supabase/migrations    0
  capacitor.config       0
  Info.plist             0
  AndroidManifest        0
  package.json           0
  export type            0
  canAccess              0
```

**No gate, no feature key, no migration, no type and no native config changed.** `lib/features.ts` is
absent from the diff entirely.

## C2. What each operator sees differently

**Pizzeria Gusto (live, trading, and — per the brief — running service on PHONES):**
On the **landing page** their Starter card bullet and the comparison-table row now read *"iPhone, iPad
and Android kitchen app"* with footnote 3 saying *"Device not supplied…"* instead of *"Tablet not
supplied…"*, so the page finally names the device they actually use; in **manage → billing** the same
row and footnote change identically; in **device settings** the app-lock toggle now reads *"Require
fingerprint or face unlock to open"* instead of *"Require Face ID / Touch ID to open"* — the same
control, doing the same thing, described without a brand name.

**Tikka Tonic (handed over):**
Exactly the same three changes and nothing else — their plan, their gates and their KDS access are
untouched, because `ipad_kds` did not move and `canAccess` was not called differently; on **iPhone or
iPad specifically**, the only visible difference is that the app-lock card stops saying *"Face ID /
Touch ID"* and says *"fingerprint or face unlock"*, which is still true of Face ID and Touch ID.

## C3. 🔴 The guard passes — and it would NOT have caught a missed map

**EXECUTED, on the real module:**

```
PARITY GUARD EXECUTED. VIOLATIONS: 0
```

🔴 **AND THE COUNTERFACTUAL WAS EXECUTED TOO, BECAUSE ASSERTING THIS WOULD HAVE BEEN WORTHLESS.** A
scratch copy was made with **only** the `ROW_FEATURE_MAP` key reverted — the exact mistake the brief
warns about — and the guard re-run:

```
  WITH THE MAP KEY LEFT BEHIND -> violations: 0
  VERDICT: THE GUARD REPORTS CLEAN. It would NOT have caught it.
```

**The mechanism, READ, at `lib/plan-features.ts:284`:**

```ts
      const feature = ROW_FEATURE_MAP[row.name]
      if (!feature) continue
```

**A renamed row simply stops being looked up. `continue` skips it, the violations array stays empty,
and the module-load check that throws in dev never fires.** ⚠️ **So the guard verifies that MAPPED rows
agree with the gate; it cannot notice that a row stopped being mapped.** The file's own comment says
so, and it is now demonstrated rather than believed:

```ts
  // ⚠️ Keyed on the ROW NAME, so renaming a row here without renaming it above silently drops that row
  // from findPlanParityViolations() — the guard stops checking and reports clean.
```

🔴 **WHAT CAUGHT IT INSTEAD, AND WHAT WOULD CATCH IT NEXT TIME:** the cross-parse in A3 —
**zero dead keys** in `ROW_FEATURE_MAP` and the kitchen row resolving. **A dead key is the signature of
this exact mistake, and it is one line of code the guard does not have.** Reported, not built.

---

# PART D — INTEGRITY

## D1. Non-ASCII census BEFORE

```
lib/plan-features.ts                       12 classes  U+2500:129 U+2014:47 U+26A0:13 U+FE0F:13 U+00A3:11 U+1F534:7 U+2192:5 U+2022:3 U+2019:2 U+00A7:1 U+21D2:1 U+2194:1
app/landing/page.tsx                       19 classes  U+2500:93 U+2014:56 U+2019:22 U+2192:12 U+00A3:11 U+26A0:11 U+FE0F:11 U+1F534:6 U+00D7:6 U+201C:3 U+2713:2 U+2248:2 U+201D:2 U+2605:2 U+2728:2 U+2265:1 U+2026:1 U+00B7:1 U+00A9:1
components/native/OperatorDeviceConfig.tsx  6 classes  U+2500:311 U+2014:23 U+2192:15 U+2026:3 U+2013:2 U+2019:1
```

⚠️ **Note the shape of the risk before the edit: `app/landing/page.tsx` already carries U+2019 ×22 and
U+201C/U+201D — typographic quotes are its house style**, so a hand-typed curly apostrophe there would
have been invisible in review. **The edits to that file contain no apostrophe at all.**

## D2. Census AFTER — every difference explained

| File | Classes | Gained | Lost |
|---|---|---|---|
| `lib/plan-features.ts` | **12 → 12** | **none** | **none** |
| `app/landing/page.tsx` | **19 → 19** | **none** | **none** |
| `components/native/OperatorDeviceConfig.tsx` | **6 → 6** | **none** | **none** |

**Every count that moved, and why:**

```
plan-features.ts   U+2014  47 -> 49   em dashes in the two new comment blocks
                   U+1F534  7 ->  8   one new red header on the iPhone note
                   U+26A0  13 -> 15   two new warning notes (the 36-char note, the footnote-3 note)
                   U+FE0F  13 -> 15   tracks U+26A0 exactly
landing/page.tsx   U+26A0  11 -> 12   one new warning note on the hand-written bullet
                   U+FE0F  11 -> 12   tracks U+26A0 exactly
OperatorDeviceConfig.tsx
                   U+2014  23 -> 24   one em dash in the new comment
```

🔴 **THE AFTER-CENSUS CAUGHT A VIOLATION AND IT WAS FIXED BEFORE THIS REPORT WAS WRITTEN.** The first
draft of the app-lock comment opened with `⚠️`, which added **U+26A0 and U+FE0F — two new classes — to
a file that had neither**, taking it from 6 to 8. It was rewritten to a plain `NOTE:`. ⚠️ **This is the
ninth consecutive task where the after-census caught what reading the diff did not**, and the second
where the offending glyph was inside a comment about correctness.

✅ **No typographic apostrophe and no en dash was introduced.** The only apostrophes added are inside
`&apos;` entities carried over verbatim from the strings being replaced, and `U+2013 EN DASH` in
`OperatorDeviceConfig.tsx` stayed at **2** — both in `(4–6 digits)`, untouched.

## D3. 🔴 Carrier-aware variation-selector check

| File | U+2705 | U+1F534 | U+2500 | U+26A0 n / paired / **bare** | sum paired = FE0F? |
|---|---|---|---|---|---|
| `lib/plan-features.ts` | absent | 8, none paired | 129, none paired | 15 / 15 / **0** | ✅ 15 = 15 |
| `app/landing/page.tsx` | absent | 6, none paired | 93, none paired | 12 / 12 / **0** | ✅ 12 = 12 |
| `components/native/OperatorDeviceConfig.tsx` | absent | absent | 311, none paired | **0 / 0 / 0** | ✅ 0 = 0 |

✅ **Every warning sign in every edited file is paired; ZERO are bare, and every file balances exactly.**
⚠️ **U+1F534 and U+2500 take no selector** — reporting them as unpaired would be the false positive this
method exists to prevent.

## D4. Byte scan of every edited file

Byte-level scan for NUL and every control byte below 0x09 (plus 0x0B, 0x0C, 0x0E–0x1F, 0x7F). **Never
grep.**

```
  lib/plan-features.ts                             24100 bytes offending=0 CR=0
  app/landing/page.tsx                             35192 bytes offending=0 CR=0
  components/native/OperatorDeviceConfig.tsx       18781 bytes offending=0 CR=0
  lib/features.ts                                   6402 bytes offending=0 CR=0   (control — not edited)
```

✅ **Zero offending bytes, zero CR in all four.**

## D5. Byte scan of this report

Separate pass, run after writing: **28,753 bytes, offending = 0** — no NUL, no control byte below
0x09, no CRLF, no lone CR. Its own carrier-aware check:

| Base | n | paired with U+FE0F | bare |
|---|---|---|---|
| U+2705 WHITE HEAVY CHECK MARK | 34 | 0 | 34 |
| U+1F534 LARGE RED CIRCLE | 19 | 0 | 19 |
| U+2500 BOX DRAWINGS LIGHT HORIZONTAL | 0 | 0 | 0 |
| U+26A0 WARNING SIGN | 17 | 17 | **0** |

**Every warning sign is paired; ZERO are bare.** **Sum of per-base paired = the total U+FE0F count** - no orphan, no double-count.

## D6. `git status` and `git diff --stat`

```
M app/api/orders/submit/route.ts
 M app/api/webhooks/instagram/route.ts
 M app/api/webhooks/messenger/route.ts
 M app/api/webhooks/meta/whatsapp/route.ts
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M app/landing/page.tsx
 M app/manage/[token]/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/native/OperatorDeviceConfig.tsx
 M docs/device-naming-report.md
 M docs/reference-manual.md
 M lib/plan-features.ts
?? components/shared/EventCancelModal.tsx
?? docs/android-audit-report.md
?? docs/android-back-handler-report.md
?? docs/event-cancel-holds-report.md
?? docs/event-cancel-refunds-report.md
?? docs/fcm-sender-report.md
?? docs/overlay-audit-report.md
?? docs/overlay-fixes-report.md
?? docs/whatsapp-onboarding-report.md
?? docs/whatsapp-routing-report.md
?? docs/whatsapp-signature-report.md
?? lib/fcm.ts
?? lib/meta/
?? lib/native/backHandler.ts
?? supabase/migrations/20260816_trucks_phone_number_id.sql
```

```
app/api/orders/submit/route.ts             |  66 ++-
 app/api/webhooks/instagram/route.ts        |  48 +-
 app/api/webhooks/messenger/route.ts        |  48 +-
 app/api/webhooks/meta/whatsapp/route.ts    | 173 +++++--
 app/dashboard/[token]/kds/page.tsx         |  70 ++-
 app/dashboard/[token]/page.tsx             | 117 ++++-
 app/landing/page.tsx                       |   5 +-
 app/manage/[token]/page.tsx                |  75 +--
 components/dashboard/AddOrderPanel.tsx     |  22 +
 components/native/OperatorDeviceConfig.tsx |  13 +-
 docs/device-naming-report.md               | 725 ++++++++++++++++-------------
 docs/reference-manual.md                   | 519 ++++++++++++++++++++-
 lib/plan-features.ts                       |  16 +-
 13 files changed, 1432 insertions(+), 465 deletions(-)
```

🔴 **THIS TASK'S ENTRIES ARE FOUR:** `lib/plan-features.ts`, `app/landing/page.tsx`,
`components/native/OperatorDeviceConfig.tsx` and `docs/device-naming-report.md` (a tracked file,
overwritten, so it appears as modified rather than untracked).

**Everything else is prior turns' work, uncommitted as instructed and untouched here:**
`app/api/orders/submit/route.ts`, the three Meta webhook routes, the two dashboard pages,
`app/manage/[token]/page.tsx`, `components/dashboard/AddOrderPanel.tsx`, `docs/reference-manual.md`,
and the untracked `lib/fcm.ts`, `lib/meta/`, `lib/native/backHandler.ts`,
`components/shared/EventCancelModal.tsx`, the `20260816` migration and the nine other reports.
