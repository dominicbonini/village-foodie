# Task report — Android status-bar strip fixed + statusBar.ts hygiene · 2026-07-27

**TRANSIENT.** Overwritten every task. Durable log: `docs/android.md` (append-only).
`docs/last-report.md` belongs to a separate workstream — not read, not written, not opened.

---

## 0. Prompt integrity — three garbled spots, repaired not silently fixed

| As received | Read as | Basis |
| --- | --- | --- |
| CONTEXT: *"the literal\n **ars** nowhere else in the repo"* | *"**appears** nowhere else in the repo"* | Truncated word at a line break; it restates my own §1.1 finding from the previous report. |
| item 3: *"Fix or remove the **#3literal**"* | *"the **`#354F52`** literal"* | Characters dropped mid-token; only one hex literal exists in the file. |
| item 5: *"If the platform has **alr   padded** the view"* | *"has **already** padded the view"* | Truncated word plus collapsed spacing. Recorded in `docs/android.md` in the repaired form. |

None changed the work. Nothing else was garbled.

---

## 1. Change 1 — the strip. Android theme only.

### 1.1 `android/app/src/main/res/values/colors.xml` — NEW file

```xml
<color name="hgHeaderNavy">#0F172A</color>
```

with a comment tying it to `HEADER_BG` in `lib/brand.ts` (`bg-slate-900`) and to
`AppHeader`, and instructing that both move together.

**Why a new file:** `android/app/src/main/res/values/colors.xml` did not exist — the only
colour resource in the whole project was `ic_launcher_background.xml`. The name
`hgHeaderNavy` is deliberately distinctive so it cannot collide with anything a future
`cap` regeneration adds. See §5 for a genuine oddity I found while checking this.

### 1.2 `android/app/src/main/res/values/styles.xml` — `AppTheme.NoActionBar` ONLY

```xml
<style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
    <item name="windowActionBar">false</item>
    <item name="windowNoTitle">true</item>
    <item name="android:background">@null</item>
    <item name="android:windowBackground">@color/hgHeaderNavy</item>   <!-- ← added -->
</style>
```

**Which theme, and why that one specifically** (you asked me not to change all of them
blindly — there are three, and only one is right):

| Theme | Role | Changed? |
| --- | --- | --- |
| **`AppTheme.NoActionBar`** | **THE RUNTIME THEME.** Capacitor's `BridgeActivity` applies it itself at create — `BridgeActivity.java:25-26`, `getApplication().setTheme(R.style.AppTheme_NoActionBar)` **and** `setTheme(R.style.AppTheme_NoActionBar)`. It is in force the entire time the app is on screen, so its `windowBackground` is what shows through the exposed strip. | ✅ **yes** |
| `AppTheme` | Manifest `<application android:theme>` (`AndroidManifest.xml:10`) — the default the Activity immediately overrides. Note it is **not** a parent of the other two: both declare explicit parents, which cancels the dot-notation inheritance, so setting it here would not propagate anyway. | ❌ no |
| `AppTheme.NoActionBarLaunch` | The **splash** window (`AndroidManifest.xml:16`, `parent="Theme.SplashScreen"`, `android:background` = `@drawable/splash`). Changing it would alter the splash screen, not the running app. | ❌ no |

A comment above the style records the whole causal chain: that `SystemBars` pads the
WebView's parent down on Android 15+ so the WebView cannot paint the strip; that the strip
therefore shows `windowBackground` (white under `Theme.AppCompat.DayNight` light); that
painting it navy makes the strip **continuous with the app header**; and — stated plainly —
that this is **cosmetic continuity, not true immersion**, since the WebView still begins
below the strip. It also cross-references the `statusBar.ts` note forbidding CSS padding on
top.

---

## 2. Change 2 — the `--safe-area-inset-top` prohibition, recorded inline

Held as instructed; **nothing consumes it, and nothing new reads `env()` on Android.** The
reason is written into `lib/native/statusBar.ts:37-47` so the next person does not "fix" the
remaining gap the obvious way:

> 🚫 **DO NOT ADD `env(safe-area-inset-top)` OR `--safe-area-inset-top` HANDLING FOR
> ANDROID. ONLY ONE MECHANISM MAY OWN THE INSET.** On Android 15+ Capacitor's core
> `SystemBars` plugin has ALREADY padded the WebView's parent down by the status-bar height
> and zeroed the insets it hands the WebView. Adding CSS padding on top of that pads TWICE:
> a second navy band inside the WebView, BELOW a strip we still would not have filled —
> exactly the two-band bug V8.7 removed on iOS (where `contentInset` and the CSS `env()`
> padding were both claiming the same inset). `AppHeader`'s `paddingTop:
> env(safe-area-inset-top)` is safe precisely BECAUSE `env()` resolves to 0 there. Note
> Capacitor 8 injects a CSS CUSTOM PROPERTY (`--safe-area-inset-top`), NOT `env()`, so
> nothing here reads it today. This only becomes relevant on the PASSTHROUGH branch
> (`WebView >= 140` AND `viewport-fit=cover`), where `env()` is populated natively and
> `AppHeader` already works unchanged — so even then the variable is not needed. Passthrough
> is UNVERIFIED on our devices.

---

## 3. Change 3 — `lib/native/statusBar.ts` hygiene. iOS untouched.

### 3.1 The `#354F52` literal — **removed with its call**, not recoloured

You gave two options: pass the brand navy from `lib/brand.ts`, or remove the call if it is a
no-op on the platforms we support and say so. **It is a no-op on both, so I removed it** —
and that avoided adding a hex export to `brand.ts` (a web-shared file) for a call that
cannot render anything.

- **Android:** verified no-op for API ≥ 36. `StatusBar.java:66-68` wraps the entire method
  body in `shouldSetStatusBarColor(...)`, and `:121-133` returns `false` unconditionally when
  `deviceApi > VANILLA_ICE_CREAM`. That branches on the **device** `SDK_INT`, so lowering
  `targetSdkVersion` would not bring it back.
- **iOS:** no *visible* effect in our arrangement. `setOverlaysWebView(true)` — called on
  the line above — removes the status-bar background view that `setBackgroundColor` colours
  (`StatusBar.swift:114-121`), and we never call `setOverlaysWebView(false)`.
- **The colour was wrong regardless:** `#354F52` is a slate-GREEN; the header is
  `HEADER_BG` = `bg-slate-900` = `#0F172A`.

**Precision on "iOS byte-identical":** the removed call did mutate one piece of iOS plugin
state — `StatusBar.backgroundColor` — which is read only by
`initializeBackgroundViewIfNeeded()`, reached only when overlay is set **false**. Nothing in
this codebase ever does that. So iOS rendering is unchanged; the single hypothetical delta
(if someone later disables overlay, the strip would use the plugin default `.black`
(`StatusBarConfig.swift:5`) instead of the green) is recorded inline. I would rather state
that than claim a literal byte-identity I cannot support.

### 3.2 Which calls are verified no-ops — recorded inline with evidence

`lib/native/statusBar.ts:14-35` now carries a per-call table with `file:line` citations into
`node_modules`, so a future reader cannot assume these work:

| Call | Status recorded | Evidence cited inline |
| --- | --- | --- |
| `setOverlaysWebView` | **INERT on Android 15+** — but **KEPT, load-bearing on iOS** (the V8.7 double-band fix) | `StatusBar.java:102-119` (deprecated systemUi flags only); `definitions.d.ts:197` "Not available on Android 15+"; `StatusBar.swift:114` (iOS removes the background view) |
| `setStyle` | **The only one that still works on Android**; `Style.Dark` = "Light text for dark backgrounds" → LIGHT icons, correct against navy | `StatusBar.java:42-52` (ungated `setAppearanceLightStatusBars`); `definitions.d.ts:46-52` |
| `setBackgroundColor` | **REMOVED** — no-op Android API ≥ 36, invisible on iOS under overlay, stale colour | `StatusBar.java:66-68`, `:121-133`; `StatusBar.swift:114-121`; `StatusBarConfig.swift:5` |

### 3.3 One extra comment-accuracy fix

The pre-existing paragraph at `:8-12` describes the OS *reserving* the strip and
`overlay:true` *stopping* it — true on iOS, **false on Android 15+**. I scoped its opening
line to **"THIS PARAGRAPH DESCRIBES iOS ONLY … see the Android note below"** rather than
leaving a comment that contradicts the code beneath it. No behavioural change.

### 3.4 What I deliberately did NOT do

- **The `// TEMP` `console.log`s at `:7`, `:51`, `:53` are still there.** My previous report
  proposed removing them, but this prompt specified *two* hygiene items — the literal and
  the no-op comments — and log removal was not among them. Left in scope-discipline; they
  are one line to delete if you want them gone (they currently fire on every mount across
  four surfaces).
- **`ios.contentInset`, `viewportFit`, `AppHeader`'s `paddingTop`** — untouched, as required.

---

## 4. What a WebView ≥ 140 device shows after this fix

**On the passthrough branch** (`shouldPassthroughInsets = getWebViewMajorVersion() >= 140 &&
hasViewportCover`, `SystemBars.java`), `SystemBars` does **not** pad the parent and passes
the real system-bar insets through, so Chromium populates `env(safe-area-inset-top)`.

**Predicted result:** `AppHeader`'s existing `paddingTop: env(safe-area-inset-top)` picks up
a real value, the WebView extends under the strip, and the navy header paints it —
i.e. **genuine immersion, identical to the working iOS arrangement, with no further code
change.** `viewport-fit=cover` is already set (`app/layout.tsx:71`), so the second
precondition is already met.

**Is the `styles.xml` change still correct there?** **Yes — correct, and redundant, in that
order.** It becomes invisible rather than wrong: if the WebView paints the whole strip, the
window background behind it is never seen. It stays valuable as a **fallback**, because the
branch is chosen per-device at runtime from the installed WebView version — the same APK can
take the padded branch on an older-WebView device and the passthrough branch on a current
one. Removing it would make the white strip reappear on exactly the devices that cannot
manage without it. The colours also agree (`#0F172A` both), so there is no seam either way.

**Verified vs inferred here:**

- **Verified from source:** the `shouldPassthroughInsets` condition and both branches; that
  the padded branch calls `v.setPadding(...)` and zeroes the insets; that
  `viewport-fit=cover` is set; that `hasViewportCover` is fed by
  `native-bridge.js:370-373` → `onDOMReady` → the meta-viewport check.
- **Inference:** the *rendered outcome* on either branch. I cannot build or run, so
  "predicted result" above is reasoning from the code, not an observation. The AVD's WebView
  version is still unmeasured — `adb shell dumpsys package com.google.android.webview | grep
  versionName` remains the one command that settles which branch you are on.

---

## 5. Flagged

- ⚠️ **`AppTheme` references three colours that are defined nowhere.**
  `styles.xml:7-9` uses `@color/colorPrimary`, `@color/colorPrimaryDark` and
  `@color/colorAccent`, and I could find **no definition for any of them** anywhere under
  `android/` — the only pre-existing colour resource was `ic_launcher_background`. An
  unresolved `@color/` reference is normally a hard AAPT error, and `AppTheme` *is*
  referenced (`AndroidManifest.xml:10`). Since your APK evidently builds, something must
  resolve them that I cannot see without building. **I did not touch this** — my new
  `colors.xml` deliberately defines only `hgHeaderNavy` and does not shadow those names.
  Worth a look next time you build; if AAPT does complain, adding the three to `colors.xml`
  is the fix.
- **`android/` tracking has changed since my last report** — `styles.xml` now shows as
  modified (`M`) rather than untracked, so the directory has been committed in between.
  Good: my edit there is now revertible. `colors.xml` is new and shows as `??`, as expected.
- **The fix is cosmetic, not immersive.** Worth being explicit: after this, the strip is
  navy and the icons are legible, but the WebView still starts below it. If you want true
  edge-to-edge on the padded branch, that is a different change (and per §2, *not* a CSS
  one).
- **Nothing here is device-verified** — no gradle, no build, no adb. Treat as **BUILT,
  LIVE-TEST PENDING**.
- **Still open from earlier in this workstream:** Fix 4 (the demo dashboard has no escape at
  ≥640px), the notification lying-toggles, and the cook-screen session claim.

---

## 6. Verification

`npx tsc --noEmit` → **exit 0, zero output.** Run twice (after the code edits, and again
after the comment-scoping edit).

Note `tsc` covers only `lib/native/statusBar.ts` — **the two Android XML files are not
type-checked or compiled by anything I am permitted to run**, so their correctness rests on
review, not on a tool. They are small, and the resource reference (`@color/hgHeaderNavy` →
`colors.xml`) is the only thing that could break; it matches.

**Files changed:**

| File | Change |
| --- | --- |
| `android/app/src/main/res/values/colors.xml` | **NEW** — `hgHeaderNavy` `#0F172A` |
| `android/app/src/main/res/values/styles.xml` | `android:windowBackground` on `AppTheme.NoActionBar` + explanatory comment |
| `lib/native/statusBar.ts` | `setBackgroundColor` removed; no-op/evidence comments; inset-ownership prohibition; iOS-scoping of the old paragraph |
| `docs/android.md` | **Appended** 627 → 725 lines, nothing overwritten |
| `docs/android-report.md` | This file, overwritten |

**Not touched:** `app/layout.tsx`, `components/shared/AppHeader.tsx`, `capacitor.config.ts`,
`AndroidManifest.xml`, `docs/reference-manual.md`.

---

## 7. `docs/android.md` — appended

New entry `### 2026-07-27 — White status-bar strip on Android: window-background fix +
statusBar.ts hygiene`: symptom, the verified root cause (SystemBars padding, the API-36
guard, the one call that still works), what was built including which theme and why, the
iOS-byte-identical statement, the tsc result, and the held `--safe-area-inset-top` decision.

Then both invariant candidates for **manual §35** (`reference-manual.md:4327`), recorded
verbatim as dictated:

1. **"Only one mechanism may own a safe-area inset. If the platform has already padded the
   view, additionally padding via CSS double-pads."** — logged with the note that this is
   the **third** instance of the shape: iOS `contentInset` + `scrollEnabled` vs the CSS
   `env()` padding (V8.7's double band), then the missing `setOverlaysWebView` with the OS
   reserving *and* the CSS padding, and now Android. Each time the fix was to decide **who
   owns the inset** and make the other side contribute zero — which is exactly why
   `AppHeader`'s `env()` padding must be left resolving to 0 on Android.
2. **"`lib/native/statusBar.ts` carried three calls that are no-ops on modern Android plus a
   colour matching nothing in the brand. A native helper written for one platform must be
   re-verified against the other, not assumed."** — logged with the sibling helpers worth
   the same audit (`keepAwake.ts`, printing, the notification helpers already flagged on 26
   July) and the sharpened audit question: *the answer must come from the installed plugin
   source, not the docs — the docs describe an API that exists; the source shows the API
   doing nothing.*

---

## 8. What I could not do / did not do

- **Could not build, run, or measure** — no gradle, builds, `cap`, dev servers, `adb`,
  installs. The XML is unvalidated by any tool; §4's rendering predictions are inference.
- **Did not consume `--safe-area-inset-top` or add Android `env()` handling** — held, with
  the reason recorded inline.
- **Did not touch iOS** — `ios.contentInset`, `viewportFit`, `AppHeader.paddingTop`, and
  `setOverlaysWebView` all unchanged.
- **Did not remove the `// TEMP` console logs** — not among the two hygiene items specified
  (§3.4).
- **Did not resolve the missing `colorPrimary`/`colorPrimaryDark`/`colorAccent`
  definitions** — flagged in §5, deliberately untouched.
- **Did not edit `docs/reference-manual.md`** — the two §35 candidates sit in
  `docs/android.md` for you to fold by hand.
- **Did not touch `docs/last-report.md`** — not read, not written, not opened.
