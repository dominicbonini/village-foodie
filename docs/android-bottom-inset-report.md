# Android bottom navigation-bar band — cause report

**READ AND REPORT ONLY. Nothing was changed.** No file in `android/`, `app/`, `components/`,
`lib/`, `capacitor.config.ts` or `ios/` was modified **by this task**. The only file this task
created or wrote is `docs/android-bottom-inset-report.md`.

⚠️ **Stated precisely, because a bare "git status is clean" would be false**: the working tree
already carries a large amount of uncommitted work from earlier workstreams — `app/api/manage/route.ts`
and the two client files from deny-by-default, `app/kds/[kds_token]/page.tsx`, `lib/auth/session-observer.ts`,
`components/auth/`, the Android icon and manifest changes, `docs/reference-manual.md`, and the other
report files. **None of that is mine from this turn**, and I touched none of it. I am naming it so the
diff is not mistaken for the product of this investigation.

**WHICH OF THE THREE I DID: NONE OF THEM.** No parse, no typecheck, no execution. This task
changed no code, so there was nothing to compile and nothing to run. What I did was **read source
text** — our `android/` resources and manifest, our web layer, and the *installed* plugin sources
in `node_modules` (`@capacitor/android`'s `SystemBars.java`, `@capacitor/status-bar`'s
`StatusBar.java`, `@capacitor/ios`'s `SystemBars.swift`) — and reason from it. Every quotation
below is from a file on disk. **Nothing here has been observed on a device or an emulator.** The
one fact that decides which of two code paths is live (the device's WebView major version) is
stated as unobserved in §1 and again in §8.

**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

---

## 0. The short version

The band is **`#0F172A`** — `@color/hgHeaderNavy`, the app's `android:windowBackground`. It is not
black, it is near-black navy, which is why it reads as black on an emulator.

It is there because **Capacitor's own `SystemBars` plugin pads the WebView's parent view on all
four sides**, bottom included, and the exposed bottom strip shows the window background. That
navy was chosen deliberately — but it was chosen for the **top** strip, to make the status-bar
strip continuous with the navy `AppHeader`. The same value paints the **bottom** strip, where
nothing above it is navy. **One decision, two strips, only one of them considered.** That is the
whole defect.

iPad reaches the bottom edge because iOS has no equivalent padding step at all: `SystemBars.swift`
contains no inset code, and `contentInset: 'never'` hands the safe area to CSS.

The empty top area you also asked about is a **separate and independent defect**, with two causes,
both confirmed by construction. It is written up in §9.

---

## 1. Is edge-to-edge enabled? (item 1)

**There is no edge-to-edge code of ours anywhere.** Grep across `android/` for
`setDecorFitsSystemWindows`, `WindowCompat`, `WindowInsets`, `navigationBarColor`, `statusBarColor`,
`enableEdgeToEdge` and `SYSTEM_UI_FLAG` returns **one hit, and it is inside an XML comment**
(`styles.xml:28`). No Java, no Kotlin, no flags.

`MainActivity.java` **in its entirety**:

```java
package com.hatchgrab.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}
```

Four lines. It sets no window flags and calls nothing.

The theme in force, `android/app/src/main/res/values/styles.xml:39-44`:

```xml
<style name="AppTheme.NoActionBar" parent="Theme.AppCompat.DayNight.NoActionBar">
    <item name="windowActionBar">false</item>
    <item name="windowNoTitle">true</item>
    <item name="android:background">@null</item>
    <item name="android:windowBackground">@color/hgHeaderNavy</item>
</style>
```

There is no `values-night/` and no `values-v3x/` directory, so this is the only definition.

**`android:windowOptOutEdgeToEdgeEnforcement` is NOT set** — grep across all of `android/` returns
nothing. That attribute is the only way to decline edge-to-edge enforcement, and we do not use it.

`android/variables.gradle:4` → `targetSdkVersion = 36`.

**So: edge-to-edge is enabled — not by us, by the platform.** At `targetSdk ≥ 35` Android enforces
edge-to-edge: the window is laid out behind the system bars, `Window.setStatusBarColor` /
`setNavigationBarColor` are ignored, and the app is expected to consume insets itself. We have
opted out of nothing, so on any Android 15+ device the window genuinely extends under both bars.

**⚠️ THAT IS NOT WHAT YOU ARE SEEING, AND THE DISTINCTION IS THE WHOLE POINT.** The *window* is
edge-to-edge. The *WebView* is not — because Capacitor re-inserts the inset in the middle. See §5.

---

## 2. Safe-area handling in the web layer, and who owns each inset (item 2)

Every `env(safe-area-inset-*)` in the repository, excluding comments:

| # | File / line | Declaration | Axis | Surface |
|---|---|---|---|---|
| 1 | `components/shared/AppHeader.tsx:45` | `paddingTop: 'env(safe-area-inset-top)'` | **top** | dashboard, manage, admin |
| 2 | `app/dashboard/[token]/kds/page.tsx:1842` | `paddingTop: 'max(0.625rem, env(safe-area-inset-top))'` | **top** | KDS only |
| 3 | `app/trucks/[slug]/order/page.tsx:3140` | `paddingBottom: 'max(8px, env(safe-area-inset-bottom))'` | bottom | **consumer** order sheet |
| 4 | `app/trucks/[slug]/order/page.tsx:3577` | `paddingBottom: 'max(8px, env(safe-area-inset-bottom))'` | bottom | **consumer** order footer |
| 5 | `components/native/DevOfflineToggle.tsx:45` | `bottom: 'calc(env(safe-area-inset-bottom) + 8px)'` | bottom | dev-only widget |
| 6 | `components/native/DevOutboxInspector.tsx:35` | `bottom: 'calc(env(safe-area-inset-bottom) + 8px)'` | bottom | dev-only widget |

`AppHeader.tsx:42-45`:

```tsx
      /* Native app: extend the dark header UP into the status-bar/safe-area inset so no page content shows
         above it. env(safe-area-inset-top) is 0 in a normal browser → web is byte-for-byte unchanged. Pairs
         with capacitor contentInset:'never' + viewport-fit=cover, which let CSS own the safe area. */
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
```

`app/dashboard/[token]/kds/page.tsx:1841-1843`:

```tsx
      <header
        className="flex flex-wrap content-start items-center gap-x-3 gap-y-2 px-4 py-2.5 bg-white border-b border-slate-200 flex-shrink-0"
        style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))' }}
      >
```

### 🔴 Does the "one owner per safe-area inset" invariant hold?

**At the top: YES, it holds, in both Capacitor code paths.** Rows 1 and 2 are two components but
they never render together — a page has exactly one header. And each of the two native branches
(§5) leaves exactly one owner:

- **non-passthrough** — Capacitor pads the parent and *zeroes* the insets handed to the WebView, so
  `env(safe-area-inset-top)` resolves to **0** and rows 1–2 add nothing. Owner: the native padding.
- **passthrough** — Capacitor pads nothing and passes the insets through, so `env()` is populated
  natively and rows 1–2 do the work. Owner: the CSS.

Exactly one owner in each. **The invariant is not violated at the top, and nothing here is
double-padding.**

**At the bottom: the invariant is not violated either — because there is NOTHING TO VIOLATE IT
WITH.** Rows 3–6 are the *only* bottom-inset handling in the codebase, and:

- rows 3 and 4 are on `app/trucks/[slug]/order/page.tsx` — the **Village Foodie consumer** order
  page, not an operator surface and not in the app shell;
- rows 5 and 6 are dev-only floating widgets.

**No operator surface — dashboard, KDS, manage, admin — consumes `env(safe-area-inset-bottom)` at
all.** Grep for `fixed bottom-0` or `bottom-0 left-0 right-0` across `app/dashboard`, `app/manage`
and `app/admin` returns **nothing**.

So the finding is the **opposite** of the top's historical bug. The top once had two owners; the
bottom has **zero CSS owners**, and one native owner painting it the wrong colour.

**Also worth stating: Capacitor injects `--safe-area-inset-bottom` and nothing reads it.**
`SystemBars.java:265-268` sets four CSS custom properties on `document.documentElement`. Grep for
`--safe-area-inset` across `app/`, `components/` and `lib/`, excluding the comment block in
`statusBar.ts` that explains it, returns **nothing**. The value is delivered on every inset change
and discarded.

---

## 3. The viewport meta tag (item 3)

There is no hand-written `<meta name="viewport">` anywhere — grep across `app/` and `components/`
for `name="viewport"` returns nothing. It comes from the Next.js `viewport` export,
`app/layout.tsx:69-76`:

```tsx
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // viewport-fit=cover lets the page extend under the device safe areas so env(safe-area-inset-*) is
  // populated (used by the operator AppHeader to fill the status-bar strip in the native app). No-op in a
  // normal browser (no safe area) → web unchanged.
  viewportFit: 'cover',
}
```

**`viewport-fit=cover` IS set**, and Next renders it into the `content` string of the emitted tag.

This matters more than it looks, because Capacitor **reads the tag back out of the DOM** and
branches on it. `SystemBars.java:45-56`:

```java
    static final String viewportMetaJSFunction = """
        function capacitorSystemBarsCheckMetaViewport() {
            const meta = document.querySelectorAll("meta[name=viewport]");
            if (meta.length == 0) {
                return false;
            }
            // get the last found meta viewport tag
            const metaContent = meta[meta.length - 1].content;
            return metaContent.includes("viewport-fit=cover");
        }
        capacitorSystemBarsCheckMetaViewport();
        """;
```

It is a substring test on the last viewport tag's `content`, and ours contains `viewport-fit=cover`.
So **`hasViewportCover` is `true`** — one of the two conditions in §5 is already satisfied.

---

## 4. How the STATUS bar is handled (item 4)

`@capacitor/status-bar` 8.0.2 is installed. The single wrapper is `lib/native/statusBar.ts`, and
the two calls it makes are lines 71-73:

```ts
    await StatusBar.setOverlaysWebView({ overlay: true })
    // Style.Dark = LIGHT glyphs, Style.Light = DARK glyphs. Inverted, hence StatusBarContent above.
    await StatusBar.setStyle({ style: content === 'dark' ? Style.Light : Style.Dark })
```

Four call sites, and the argument at each:

| Call site | Argument | Requested glyphs |
|---|---|---|
| `app/app/page.tsx:26` | `configureStatusBar()` | light |
| `app/dashboard/[token]/page.tsx:201` | `configureStatusBar()` | light |
| `app/manage/[token]/page.tsx:325` | `configureStatusBar()` | light |
| `app/dashboard/[token]/kds/page.tsx:831` | `configureStatusBar('dark')` | **dark** |

There is **no `configureNavigationBar`, no bottom-bar equivalent, and no call that touches the
navigation bar in any way.** Grep for `NavigationBar` in our web layer returns nothing.

### 🔴 The asymmetry, stated as the brief asks

**The top edge has a dedicated module, a typed API, a documented inversion, four call sites and a
per-surface argument. The bottom edge has nothing at all — not a module, not a call, not a CSS
declaration on any operator page, not a colour.** Every deliberate decision recorded in
`statusBar.ts` and `styles.xml` is about the status bar; the navigation bar is never mentioned in
either file. The bottom strip is not mishandled so much as **never handled** — it inherits whatever
falls out of the top's fix.

That is the finding item 4 asks for, and it is also the reason §5's colour is wrong: `windowBackground`
was set to navy *for the top strip*, and it silently became the bottom strip's colour too.

---

## 5. What actually creates the band, and what colour it is (items 1 and 5)

`@capacitor/android` 8.4.1 registers a core plugin, `SystemBars`, which installs an insets listener
on **the WebView's parent view**. `SystemBars.java:199-247`:

```java
        ViewCompat.setOnApplyWindowInsetsListener((View) getBridge().getWebView().getParent(), (v, insets) -> {
            boolean shouldPassthroughInsets = getWebViewMajorVersion() >= WEBVIEW_VERSION_WITH_SAFE_AREA_FIX && hasViewportCover;

            Insets systemBarsInsets = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets imeInsets = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean keyboardVisible = insets.isVisible(WindowInsetsCompat.Type.ime());

            if (shouldPassthroughInsets) {
                // We need to correct for a possible shown IME
                v.setPadding(0, 0, 0, keyboardVisible ? imeInsets.bottom : 0);
                ...
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
                // We need to correct for a possible shown IME
                v.setPadding(
                    systemBarsInsets.left,
                    systemBarsInsets.top,
                    systemBarsInsets.right,
                    keyboardVisible ? imeInsets.bottom : systemBarsInsets.bottom
                );
            }

            // Returning `WindowInsetsCompat.CONSUMED` breaks recalculation of safe area insets
            // So we have to explicitly set insets to `0`
            // See: https://issues.chromium.org/issues/461332423
            WindowInsetsCompat newInsets = new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout(), Insets.of(0, 0, 0, 0))
                .build();
```

with, at line 41:

```java
    private static final int WEBVIEW_VERSION_WITH_SAFE_AREA_FIX = 140;
```

There are exactly two branches, and `hasViewportCover` is already `true` (§3), so **the branch is
decided solely by the device's WebView major version.**

### Branch A — non-passthrough (WebView < 140)

`v.setPadding(left, top, right, bottom)` — the WebView's parent is padded on **all four sides**,
the bottom by `systemBarsInsets.bottom`, i.e. the navigation-bar height. The insets handed to the
WebView are then explicitly zeroed, so `env(safe-area-inset-*)` is `0` inside the page.

**The WebView therefore stops short of the bottom of the window, and the strip it vacates is
padding on the parent — not part of the WebView at all.** Padding shows the view hierarchy behind
it, which is the decor view, painted with the window background.

### Branch B — passthrough (WebView ≥ 140)

`v.setPadding(0, 0, 0, 0)` when the keyboard is closed. No padding, real insets passed through, and
Chromium ≥ 140 populates `env(safe-area-inset-*)` natively. The WebView fills the window.

### 🔴 Which branch is live on your emulator — an inference, not an observation

**I have not observed the emulator's WebView version, and it is the one fact that decides this.**

But the symptom decides it for us: **Branch B produces no band**, because the WebView would fill
the window and paint to the bottom edge. You have a band. **Therefore the emulator is on Branch A,
WebView < 140.** That is an inference from the reported symptom and the source, and I am flagging
it as such rather than presenting it as verified.

*(A caveat that does not change the conclusion: on Branch B with **3-button** navigation rather
than gestures, Android still draws a translucent scrim behind the buttons. That scrim is grey and
semi-transparent, and would show the page's `#F9F9F9` through it — not an opaque near-black band.
The reported appearance matches Branch A, not that.)*

### The colour — `#0F172A`, and where it comes from

`android/app/src/main/res/values/colors.xml:9`:

```xml
    <color name="hgHeaderNavy">#0F172A</color>
```

applied at `styles.xml:43`:

```xml
        <item name="android:windowBackground">@color/hgHeaderNavy</item>
```

`#0F172A` is `slate-900`. It is not black, but at emulator brightness against a light page it reads
as black — which is exactly what you described.

**Two independent mechanisms deliver it to that strip**, so there is no ambiguity about the source:

1. **The theme.** `BridgeActivity` applies `AppTheme.NoActionBar` itself on create, so
   `android:windowBackground` is in force for the whole time the app is on screen. The parent's
   padding shows it.
2. **An explicit repaint.** `SystemBars.java:299`, the last line of `setStyle`:

```java
        getActivity().getWindow().getDecorView().setBackgroundColor(getThemeColor(getContext(), android.R.attr.windowBackground));
```

   Capacitor reads `windowBackground` off the theme and force-paints the decor view with it, on
   **every** `setStyle` call.

### Ruling out the other two candidates the brief names

- **Not the body background.** `app/globals.css:19-25` sets `body { background: var(--background) }`
  with `--background: #F9F9F9` (`globals.css:5`). That is inside the WebView, and in Branch A the
  WebView does not reach the strip. If the body background were showing, the band would be
  near-white.
- **Not the WebView background.** `capacitor.config.ts:73` sets `android: { backgroundColor: '#1C1C1E' }`.
  That colours the **WebView itself**, behind the page — and the page paints over it. It is also
  near-black, so I want to be explicit about the distinction rather than lean on it: the band is in
  the parent's **padding region**, which is geometrically outside the WebView, so `#1C1C1E` cannot
  reach it. The value that reaches it is the window background, `#0F172A`.

**⚠️ ONE THING I CANNOT SETTLE FROM SOURCE:** `#0F172A` and `#1C1C1E` are both near-black and I
cannot tell them apart by eye in a description. The construction argument above is what rules out
`#1C1C1E`; a screenshot pixel-sample of the band would settle it observationally, and I have not
taken one.

### The trap in the existing comment

`styles.xml:25-33` explains the navy, and it is correct about the top strip:

```
         WHY windowBackground MATTERS AT ALL: on Android 15+ Capacitor's core SystemBars plugin pads the
         WebView's PARENT view down by the status bar height and zeroes the insets handed to the WebView
         ... The WebView therefore starts BELOW the status bar and cannot paint it,
         so the exposed strip shows the window background, which for Theme.AppCompat.DayNight in light
         mode is WHITE. ... Painting the window background with the header navy makes the strip
         CONTINUOUS WITH THE APP HEADER (AppHeader = bg-slate-900 = #0F172A) instead of a white band
         above it.
```

**It says "pads the WebView's PARENT view down by the status bar height". The code pads all four
sides.** The comment describes the top argument accurately and simply does not mention that the same
call is padding the bottom, or that the same colour is landing there against page content that is
`#F9F9F9`. The navy is right at the top and wrong at the bottom, and the note only reasons about the
top. **Changing `windowBackground` to fix the bottom would re-break the top** — it is one value
serving two strips with opposite requirements.

---

## 6. Android-only by construction, or is iOS branched? (item 6)

**Android-only by construction. There is no platform conditional in any inset handling anywhere.**

Every `getPlatform()` / platform-test in the web layer, in full:

| File / line | What it branches on | Inset-related? |
|---|---|---|
| `lib/commerce-policy.ts:45` | `Capacitor.getPlatform() !== 'ios'` | No — purchase CTA policy |
| `lib/native/push.ts:178` | `Capacitor.getPlatform() === 'android'` | No — push channel setup |
| `app/api/orders/submit/route.ts:1275-1276` | `d.platform === 'ios' \| 'android'` | No — server-side push token split |

The remaining hits are comments. **None of the three is in inset, safe-area or system-bar code.**

The only conditional anywhere near this is `lib/native/statusBar.ts:26`:

```ts
  if (!Capacitor.isNativePlatform()) return
```

which separates **native from web**, not Android from iOS.

So the two platforms diverge **structurally, not by a branch**:

- **iOS**: `contentInset: 'never'` (`capacitor.config.ts:57`) tells WKWebView not to auto-inset;
  `viewport-fit=cover` populates `env()`; the CSS in §2 rows 1–2 owns the top. `SystemBars.swift`
  — which I read in full — contains **no inset code at all**: no `setPadding`, no CSS injection, no
  window-insets listener. Its only surface is `setStyle` / `show` / `hide` / `setAnimation`. **iOS
  therefore has no equivalent of the padding step that creates the band**, which is precisely why
  the iPad reaches the bottom edge.
- **Android**: `SystemBars.java` intercepts the insets and pads the parent, per §5.

**The consequence for §2's table: rows 1 and 2 are shared code that is live on iOS and inert on
Android** (Branch A zeroes `env()`), and rows 3–6 are live on iOS and inert on Android for the same
reason. Nothing is guarded; the values simply resolve to `0` on one platform.

---

## 7. 🔴 What a bottom fix would do to iPad (item 7)

**The iOS build is in App Store review. The answer depends entirely on which lever a fix uses, and
the levers split cleanly into two groups.**

### Group 1 — Android-only. Zero iOS reach.

| Lever | Why iOS cannot see it |
|---|---|
| `android/app/src/main/res/values/styles.xml` | Not in the iOS build. No Xcode target references `android/`. |
| `android/app/src/main/res/values/colors.xml` | Same. |
| `capacitor.config.ts` → the `android: { … }` block | Read only by `@capacitor/cli` when generating the Android config. `ios:` is a separate key. |
| `plugins.SystemBars.insetsHandling` | **Read by `SystemBars.java:99` only.** `SystemBars.swift` has no `insetsHandling` — its `load()` reads `hidden`, `style` and `animation` and nothing else. An unknown key is ignored. |
| `MainActivity.java` | Android source. |

A fix confined to these **cannot regress the iPad build**, because no byte of it is compiled into,
or read by, the iOS app.

### ⚠️ One sharp edge inside Group 1, worth naming before anyone trips on it

`plugins.SystemBars` looks Android-only and **is not**. `SystemBars.swift:22-34`:

```swift
    @objc override public func load() {
        let hidden = getConfig().getBoolean("hidden", false)

        if let style = getConfig().getString("style", "DEFAULT") {
            setStyle(style: style)
        }
```

**iOS reads `style` and `hidden` from the same `plugins.SystemBars` block.** So adding
`insetsHandling` there is inert on iOS, but adding `style` or `hidden` **would change the iPad's
status bar**. The block is shared; only that one key is not.

### Group 2 — shared. Touching any of these reaches iOS.

| Lever | What breaks on iPad |
|---|---|
| `app/layout.tsx` `viewportFit: 'cover'` | Removing or changing it collapses `env()` on iOS, so `AppHeader`'s `paddingTop` goes to 0 and the header rides up under the iPad status bar — the V8.7 defect, returning. |
| `lib/native/statusBar.ts` | `setOverlaysWebView({ overlay: true })` is **inert on Android 15+ and load-bearing on iOS** — the file says so at lines 42-44, and `StatusBar.swift:114` removes the status-bar background view. Removing it as "Android dead code" re-creates the iOS double band. |
| Any `env(safe-area-inset-bottom)` CSS added to an operator page | **This is the dangerous one — see below.** |

### 🔴 The specific answer: what would change on iPad if the bottom were made edge-to-edge on Android

The tempting fix is to make Android passthrough (Branch B) and then add
`paddingBottom: env(safe-area-inset-bottom)` to the operator shells so content clears the gesture
bar. **The second half of that regresses iPad, and here is the mechanism:**

On iPad, `contentInset: 'never'` + `viewport-fit=cover` mean the WebView **already** extends to the
bottom edge and `env(safe-area-inset-bottom)` is **already non-zero** on home-indicator iPads. The
operator shells are `h-dvh flex flex-col overflow-hidden` (`app/dashboard/[token]/page.tsx:2924`;
the KDS is the same pattern). Adding bottom padding to that root or to `<main>` would:

1. **shorten the scroll region on iPad by the home-indicator height** — a visible layout shift on a
   build currently in review, on every operator screen at once;
2. **behave differently across iPad models** — `env(safe-area-inset-bottom)` is non-zero on
   home-indicator iPads and `0` on Home-button iPads, so the same code would change one and not the
   other;
3. **do nothing on Android in Branch A anyway**, since `env()` is zeroed there — so it would pay the
   entire iPad cost and buy nothing on the platform that has the bug, unless the branch is flipped
   in the same change.

**The Android-only equivalent that avoids all of this** — stated as an observation about the lever,
not as a recommendation, since the brief is report-only: Capacitor injects
**`--safe-area-inset-bottom`** (`SystemBars.java:265-268`) and **iOS never sets that custom
property** — `SystemBars.swift` has no injection code. CSS keyed to the custom property is therefore
Android-only by construction, in exactly the way CSS keyed to `env()` is not. Note this cuts against
`statusBar.ts:60`'s blanket "🚫 DO NOT ADD env(safe-area-inset-top) OR --safe-area-inset-top
HANDLING FOR ANDROID" — that prohibition is correct **for the top**, where the native padding is
already the sole owner and CSS would be the second. **At the bottom there is no owner at all**, so
the reasoning behind the prohibition does not carry across the axis. Whoever writes the fix will
have to decide that explicitly rather than read the note as covering both edges.

**Plainly, as asked: a fix limited to `android/` resources or to `plugins.SystemBars.insetsHandling`
touches no iOS code path and cannot regress the iPad. A fix that adds `env(safe-area-inset-bottom)`
to shared components will change the iPad's layout, on a build in review.**

---

## 8. What remains unobserved

**Nothing has been rendered.** No emulator, no device, no screenshot, no `adb`, no build. All of
the below is unverified:

1. **The emulator's WebView major version** — the single fact that decides Branch A vs Branch B
   (§5). I inferred Branch A from the reported symptom; I did not read the version.
2. **The band's actual pixel colour.** I identified `#0F172A` by construction and ruled out
   `#1C1C1E` geometrically. Neither was sampled.
3. **The band's height** — `systemBarsInsets.bottom`, which differs between gesture navigation and
   3-button navigation, and which I did not measure.
4. **Whether the emulator is in gesture or 3-button mode.** It changes the inset height and, in
   Branch B, whether a system scrim is drawn.
5. **Whether the iPad is on Branch-equivalent behaviour** — I read `SystemBars.swift` and confirmed
   it has no inset code, but I did not run the iOS build.
6. **The status-bar glyph colours in §9** — reasoned from the two plugins' source, never seen.
7. **`configureStatusBar`'s runtime ordering against `SystemBars.load()`** (§9, cause B) — the
   ordering is argued from where each is invoked, not from a log. The `[statusBar]` console lines at
   `statusBar.ts:29` and `:74` would show it in a Web Inspector session, which I did not run.
8. **Dark mode.** The theme is `DayNight` and there is no `values-night/`. `android:windowBackground`
   is explicitly navy in the one definition, so I expect no change — but I did not test night mode,
   and `getStyleForTheme()` (§9) returns a *different* style in night mode, so the §9 defects may
   present differently there.

---

## 9. The empty space at the top — a second, separate defect

You asked me to also look at the top, and suggested the text might be the same colour as the header.
**That is correct, and I can confirm the mechanism from source. There are two causes, and they are
independent — fixing either one alone leaves the other.**

The strip itself is not empty: in Branch A the WebView starts below the status bar, so the strip is
the parent's top padding, painted `#0F172A` navy (§5). Android draws the clock, battery and
indicators **into that strip**. So the glyphs are there. Whether you can see them depends entirely
on `setAppearanceLightStatusBars`.

### Cause A — the KDS explicitly asks for dark glyphs, and on Android they land on navy

`app/dashboard/[token]/kds/page.tsx:826-831`:

```tsx
    // 'dark' CONTENT, AND THIS IS THE ONE SURFACE THAT ASKS FOR IT. The KDS's top bar is bg-white and
    // fills the safe-area strip, so the shared default (light glyphs, correct against the dashboard's
    // navy AppHeader) rendered the clock and indicators invisible - only the battery, whose filled
    // outline survives, remained readable. The header stays white by decision; the glyphs change.
    configureStatusBar('dark')
```

**"The KDS's top bar is bg-white and fills the safe-area strip."** That premise is **true on iOS**
— `contentInset: 'never'` lets the WebView reach the strip and the header's
`paddingTop: max(0.625rem, env(safe-area-inset-top))` (line 1842) extends the white bar into it.

**On Android Branch A it is false.** `env(safe-area-inset-top)` is zeroed, so the header does **not**
extend upward, and the strip is painted **navy** by `windowBackground` — not white. But
`configureStatusBar('dark')` still runs, and `statusBar.ts:73` maps it to `Style.Light`, which
`StatusBar.java:51-52` maps to:

```java
        WindowInsetsControllerCompat windowInsetsControllerCompat = WindowCompat.getInsetsController(window, decorView);
        windowInsetsControllerCompat.setAppearanceLightStatusBars(!style.equals("DARK"));
```

`"LIGHT".equals("DARK")` is false → `setAppearanceLightStatusBars(true)` → **dark glyphs**.

**Dark glyphs on `#0F172A`. That is your hypothesis, confirmed by construction: the KDS asks for
dark text against a white header that only exists on iOS, and gets dark text on a navy strip on
Android.** Note the symmetry with the comment's own account of the original iOS bug — "only the
battery, whose filled outline survives, remained readable" — the same signature, inverted, on the
other platform.

### Cause B — two plugins each own the status-bar appearance, and Capacitor's wins on rotation

This one affects **every page**, not just the KDS.

Both plugins write `setAppearanceLightStatusBars`, and **each tracks its own idea of the current
style in its own object.**

`SystemBars.java:282-297` — Capacitor's core plugin:

```java
    private void setStyle(String style, String bar) {
        if (style.equals(STYLE_DEFAULT)) {
            style = getStyleForTheme();
        }
        ...
        if (bar.isEmpty() || bar.equals(BAR_STATUS_BAR)) {
            currentStatusBarStyle = style;
            windowInsetsControllerCompat.setAppearanceLightStatusBars(!style.equals(STYLE_DARK));
        }
```

`StatusBar.java:42-52` — the `@capacitor/status-bar` plugin we call:

```java
    public void setStyle(String style) {
        ...
        this.currentStyle = style;
```

Two fields, `SystemBars.currentStatusBarStyle` and `StatusBar.currentStyle`, on two different
objects. **Neither updates the other.** Then:

**(i) At cold launch, Capacitor goes first and picks dark glyphs.** `SystemBars.load()` runs
`initSystemBars()` (line 69), which does:

```java
        String style = getConfig().getString("style", STYLE_DEFAULT).toUpperCase(Locale.US);
        ...
        getBridge().executeOnMainThread(() -> {
            setStyle(style, "");
```

We configure **no** `plugins.SystemBars` block — grep across `capacitor.config.ts` and the generated
`capacitor.config.json` returns nothing — so `style` is `STYLE_DEFAULT`, resolved by
`getStyleForTheme()` (lines 326-332):

```java
    private String getStyleForTheme() {
        int currentNightMode = getActivity().getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        if (currentNightMode != Configuration.UI_MODE_NIGHT_YES) {
            return STYLE_LIGHT;
        }
        return STYLE_DARK;
    }
```

Light mode → `STYLE_LIGHT` → `setAppearanceLightStatusBars(true)` → **dark glyphs on the navy
strip.** This runs at plugin load, before any page JavaScript. Our `configureStatusBar()` runs later,
from a `useEffect`, and corrects it — so there is a window at every cold launch during which the
status bar is unreadable.

**🔴 And on any page that never calls `configureStatusBar`, it is never corrected.** The four call
sites are `/app`, `/dashboard/[token]`, `/dashboard/[token]/kds` and `/manage/[token]`. **`/login`,
`/admin` and `/setup` do not call it** — on those, dark-on-navy is the permanent state.

**(ii) On every configuration change, Capacitor overwrites us.** `SystemBars.java:87-93`:

```java
    @Override
    protected void handleOnConfigurationChanged(Configuration newConfig) {
        super.handleOnConfigurationChanged(newConfig);

        setStyle(currentGestureBarStyle, BAR_GESTURE_BAR);
        setStyle(currentStatusBarStyle, BAR_STATUS_BAR);
    }
```

It re-applies **its own** `currentStatusBarStyle` — still `STYLE_LIGHT`, because our call went to the
other plugin's field and never touched this one. So the status bar reverts to **dark glyphs on navy**
and stays there until the page remounts and re-runs its effect.

**This fires on a tablet constantly.** `AndroidManifest.xml:17` declares:

```xml
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"
```

Because the Activity declares these, Android **does not recreate it** — it calls
`onConfigurationChanged` instead, which is exactly the path above. Rotation, window resize,
multi-window, attaching a keyboard, a dark-mode toggle: each one silently reverts the status bar,
and none of them remounts the React tree.

### 🔴 The invariant, restated on the axis that actually fails

§2 found the "one owner per safe-area inset" invariant **holds** on the padding axis. It **fails
here, on the appearance axis**: `SystemBars` and `@capacitor/status-bar` both own
`setAppearanceLightStatusBars`, each caches its own value, and Capacitor's re-asserts itself on a
schedule our code cannot see. **The same invariant, a different property, and this time it is
genuinely violated.**

### Why "empty" rather than "wrong colour"

`#0F172A` is dark enough that dark glyphs against it have almost no contrast, so the strip reads as
blank rather than as unreadable text — which matches your description exactly. The battery outline
is the most likely survivor, as the KDS comment observed when the same failure happened in the
opposite direction on iOS.

---

## 10. Summary of findings

| # | Finding | Confidence |
|---|---|---|
| 1 | The band is `#0F172A` (`@color/hgHeaderNavy`), the `android:windowBackground` — not black, not the body background, not `android.backgroundColor` | Confirmed from source; colour not pixel-sampled |
| 2 | It exists because `SystemBars.java:226-233` pads the WebView's parent on **all four sides**, bottom included, then zeroes `env()` | Confirmed from installed plugin source |
| 3 | The navy was chosen for the **top** strip and silently became the **bottom** strip's colour; the `styles.xml` comment reasons only about the top and mis-describes the padding as top-only | Confirmed |
| 4 | The emulator is on the non-passthrough branch, i.e. WebView **< 140** | **Inferred from the symptom — not observed** |
| 5 | No operator surface consumes `env(safe-area-inset-bottom)`; the bottom inset has **zero** CSS owners | Confirmed |
| 6 | Capacitor injects `--safe-area-inset-bottom` and nothing in the repo reads it | Confirmed |
| 7 | Edge-to-edge is on by platform enforcement (`targetSdk 36`, no opt-out attribute), not by any code of ours | Confirmed |
| 8 | The status bar has a module, a typed API and four call sites; the navigation bar has nothing anywhere | Confirmed |
| 9 | iOS has no equivalent padding step (`SystemBars.swift` has no inset code) — which is why iPad reaches the bottom edge | Confirmed from source |
| 10 | A fix in `android/` or in `plugins.SystemBars.insetsHandling` cannot reach iOS; a fix adding `env(safe-area-inset-bottom)` to shared components **will** change iPad layout | Confirmed |
| 11 | `plugins.SystemBars` is **not** an Android-only config block — iOS reads `style` and `hidden` from it | Confirmed from `SystemBars.swift:22-34` |
| 12 | **Top defect A**: the KDS asks for dark glyphs on a premise ("white bar fills the strip") that is true on iOS and false on Android, so dark glyphs land on navy | Confirmed from source |
| 13 | **Top defect B**: two plugins own the status-bar appearance; Capacitor's `handleOnConfigurationChanged` re-asserts `STYLE_LIGHT` on every rotation/resize, overwriting ours | Confirmed from source |
| 14 | `/login`, `/admin` and `/setup` never call `configureStatusBar`, so dark-on-navy is permanent there | Confirmed |

**Nothing was changed. No fix was applied. No instruction required a change in order to be
satisfied, so there was nothing to stop for.**
