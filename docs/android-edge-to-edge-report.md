# Android edge-to-edge — the real fix

**WHICH OF THE THREE I DID: A COMPILE AND AN EXECUTION. No parse and no `tsc` typecheck — because
this change contains no TypeScript.** The only file edited is a `.java` file, so the compiler that
matters is `javac`, invoked by `./gradlew assembleDebug` (**BUILD SUCCESSFUL**, with
`:app:compileDebugJavaWithJavac` actually executing rather than reporting UP-TO-DATE). It was then
**executed**: installed to the running emulator with `adb install -r` and driven through five
screens, with every claim below **pixel-sampled from real screenshots**, before and after.

**Deploys frozen, nothing committed, nothing pushed, nothing deployed. `ios/` untouched.**

**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**

---

## 0. Scope of the change, stated first

**One file was edited by this task:**

```
android/app/src/main/java/com/hatchgrab/app/MainActivity.java   (+291 −1)
```

⚠️ **`git status` shows other modified files. NONE of them is mine from this task**, and I am naming
that rather than letting a diff imply otherwise. `capacitor.config.ts` (mtime 10:31),
`app/layout.tsx` (14:24) and `android/app/src/main/AndroidManifest.xml` (09:54) were all already
modified in the working tree from earlier workstreams; this task began at ~16:20 and only
`MainActivity.java` (16:37) carries its fingerprint.

Verified byte-identical to `HEAD`, i.e. untouched by anyone including me:

| File | Status |
|---|---|
| `app/globals.css` | unchanged vs HEAD |
| `components/shared/AppHeader.tsx` | unchanged vs HEAD |
| `lib/native/statusBar.ts` | unchanged vs HEAD |
| `android/app/src/main/res/values/styles.xml` | unchanged vs HEAD |
| `android/app/src/main/res/values/colors.xml` | unchanged vs HEAD |
| `ios/` | `git status ios/` is empty |

**No shared CSS, no shared component, no `plugins.SystemBars` key, no `capacitor.config.ts` edit, no
`ios/` file.** The change is confined to a file that is compiled into the Android APK and nothing
else.

---

## PHASE 1 — READ AND REPORT

### 1. `insetsHandling` options, and what iOS reads from that block

`@capacitor/android/.../plugin/SystemBars.java:36-38` — **there are exactly two**, and the source
says a third is planned:

```java
    // TODO: In Cap 9, add an additional option "full"
    static final String INSETS_HANDLING_CSS = "css";
    static final String INSETS_HANDLING_DISABLE = "disable";
```

Read at line 99, defaulting to `css`, with anything else warned about and coerced back:

```java
        String configuredInsetsHandling = getConfig().getString("insetsHandling", INSETS_HANDLING_CSS);
        if (INSETS_HANDLING_CSS.equals(configuredInsetsHandling) || INSETS_HANDLING_DISABLE.equals(configuredInsetsHandling)) {
            insetsHandling = configuredInsetsHandling;
        } else {
            Logger.warn(
                "SystemBars",
                "Unknown insetsHandling value '" + configuredInsetsHandling + "'. Falling back to '" + INSETS_HANDLING_CSS + "'."
            );
```

`disable` short-circuits both the listener (`initWindowInsetsListener`, line 195-197) and the CSS
variable injection (`initSafeAreaCSSVariables`, line 177).

**🔴 Exactly which values iOS reads from `plugins.SystemBars` — the point §7 of the previous report
flagged.** `@capacitor/ios/.../Plugins/SystemBars.swift:22-34`, the whole of `load()`:

```swift
    @objc override public func load() {
        let hidden = getConfig().getBoolean("hidden", false)

        if let style = getConfig().getString("style", "DEFAULT") {
            setStyle(style: style)
        }

        if let animation = getConfig().getString("animation") {
            setAnimation(animation: animation)
        }

        setHidden(hidden: hidden)
    }
```

**iOS reads `hidden`, `style` and `animation`. It does not read `insetsHandling`, and there is no
inset code anywhere in that file** — no `setPadding`, no insets listener, no CSS injection. So
`insetsHandling` is Android-only *in effect* while `style` and `hidden` are not, and the block as a
whole is shared. **I did not use it anyway** — see item 6.

### 2. Is there a mode that passes real insets through instead of padding the parent?

**Yes, and it is NOT reachable through `insetsHandling`.** It is chosen automatically, per device,
by `SystemBars.java:200`:

```java
            boolean shouldPassthroughInsets = getWebViewMajorVersion() >= WEBVIEW_VERSION_WITH_SAFE_AREA_FIX && hasViewportCover;
```

with, at line 41:

```java
    private static final int WEBVIEW_VERSION_WITH_SAFE_AREA_FIX = 140;
```

and the passthrough body at line 206-223:

```java
            if (shouldPassthroughInsets) {
                // We need to correct for a possible shown IME
                v.setPadding(0, 0, 0, keyboardVisible ? imeInsets.bottom : 0);
                ...
                return new WindowInsetsCompat.Builder(insets)
                    .setInsets(
                        WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout(),
                        Insets.of(
                            systemBarsInsets.left,
                            systemBarsInsets.top,
                            systemBarsInsets.right,
                            getBottomInset(systemBarsInsets, keyboardVisible)
                        )
                    )
                    .build();
            }
```

**🔴 THE PREVIOUS REPORT COULD NOT OBSERVE WHICH BRANCH WAS LIVE. IT IS NOW MEASURED:**

```
  SDK_INT              : 36   (Android 16)
  WebView versionName  : 133.0.6943.137     → major 133
  screen               : 2560 x 1600, density 320 (2.0x)  → 1280 x 800 dp
  navigation mode      : [x] com.android.internal.systemui.navbar.gestural
```

**133 < 140, so this device is on the NON-passthrough branch.** The inference in
`docs/android-bottom-inset-report.md` §5 was correct, and it is now a measurement rather than a
deduction from the symptom.

**What the web layer would have to consume if passthrough were forced, and whether it already does
for iOS:** it would need `env(safe-area-inset-bottom)`. That consumption **exists for iOS only on
the consumer order page and two dev widgets** — see item 3 — and on **no operator surface at all**.
So flipping to passthrough would not fix anything by itself: it would replace a navy band with page
content sitting under the gesture bar, uncompensated, and fixing that would require adding CSS to
shared components. **That is the shared-layer change the constraint forbids, which is why the
implemented fix does not go near it.** Note also that passthrough is unreachable on this device
regardless: 133 fails the version gate no matter what is configured.

### 3. Every `env(safe-area-inset-*)` in the web layer, and the invariant

| # | File / line | Declaration | Axis | Shared or branched? |
|---|---|---|---|---|
| 1 | `components/shared/AppHeader.tsx:45` | `paddingTop: 'env(safe-area-inset-top)'` | top | **shared**, no branch |
| 2 | `app/dashboard/[token]/kds/page.tsx:1842` | `paddingTop: 'max(0.625rem, env(safe-area-inset-top))'` | top | **shared**, no branch |
| 3 | `app/trucks/[slug]/order/page.tsx:3140` | `paddingBottom: 'max(8px, env(safe-area-inset-bottom))'` | bottom | **shared**, consumer page |
| 4 | `app/trucks/[slug]/order/page.tsx:3577` | `paddingBottom: 'max(8px, env(safe-area-inset-bottom))'` | bottom | **shared**, consumer page |
| 5 | `components/native/DevOfflineToggle.tsx:45` | `bottom: 'calc(env(safe-area-inset-bottom) + 8px)'` | bottom | **shared**, dev widget |
| 6 | `components/native/DevOutboxInspector.tsx:35` | `bottom: 'calc(env(safe-area-inset-bottom) + 8px)'` | bottom | **shared**, dev widget |

**Not one of the six is branched by platform.** The only platform conditionals in the repo are
`lib/commerce-policy.ts:45`, `lib/native/push.ts:178` and `app/api/orders/submit/route.ts:1275-1276`,
and none is in inset code. The two platforms diverge structurally, not by a branch: `env()` is
populated on iOS (`contentInset:'never'` + `viewport-fit=cover`) and resolves to `0` on Android
because Capacitor zeroes the insets it hands the WebView.

**Does "one owner per safe-area inset" hold today?** 

- **Top — YES, and it still holds after this change.** Rows 1 and 2 never render together (one header
  per page), and in the non-passthrough branch `env()` is `0`, so the native padding is the sole
  owner. **The fix preserves that exactly**: it keeps the top padding and keeps zeroing the returned
  insets, so rows 1–2 remain at their zero case and the shared CSS is not merely unedited — it is
  *inert*.
- **Bottom — it held only because there was nothing to contend with.** No operator surface consumes
  `env(safe-area-inset-bottom)`; `grep "fixed bottom-0"` across `app/dashboard`, `app/manage` and
  `app/admin` returns nothing. Rows 3–6 are the consumer order page and dev-only widgets. The bottom
  had **zero** CSS owners and one native owner painting it a fixed colour. **After the fix it has
  exactly one owner — `MainActivity` — which sets it to zero, and still zero CSS owners.**

Capacitor also injects `--safe-area-inset-top/right/bottom/left` (`SystemBars.java:265-268`) and
**nothing in the repo reads them** — `grep -- "--safe-area-inset"` across `app/`, `components/` and
`lib/`, excluding the explanatory comment in `statusBar.ts`, returns nothing.

### 4. What `android:windowBackground` is used for besides the two strips

`styles.xml:43` sets it on `AppTheme.NoActionBar`, which is the theme in force while the app is on
screen (BridgeActivity applies it itself on create). Its jobs are:

1. **The top strip** — the parent's top padding.
2. **The bottom strip** — the parent's bottom padding. *This is the defect.*
3. **The pre-paint window fill**, i.e. the frame drawn after the splash window is dismissed and
   before the WebView has content. Navy here is deliberate and correct — it matches the AppHeader
   that is about to appear.
4. **An explicit decor repaint by Capacitor**, `SystemBars.java:299`, on every `setStyle` call:

```java
        getActivity().getWindow().getDecorView().setBackgroundColor(getThemeColor(getContext(), android.R.attr.windowBackground));
```

**It is NOT the splash.** The splash window is `AppTheme.NoActionBarLaunch` (`styles.xml:47-49`),
parented on `Theme.SplashScreen` with `<item name="android:background">@drawable/splash</item>` —
a different attribute on a different theme.

**🔴 This fix does not change `windowBackground` at all**, so uses 3 and 4 are untouched and there is
no launch-flash regression to argue about. The strip colours are taken over by painting the WebView's
**parent view**, whose background can vary at runtime, which the window's cannot. Both files are
confirmed unchanged vs HEAD in §0.

### 5. `configChanges`, the re-assert, and what triggers it on a tablet

`android/app/src/main/AndroidManifest.xml:17`:

```xml
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density"
```

`SystemBars.java:87-93`:

```java
    @Override
    protected void handleOnConfigurationChanged(Configuration newConfig) {
        super.handleOnConfigurationChanged(newConfig);

        setStyle(currentGestureBarStyle, BAR_GESTURE_BAR);
        setStyle(currentStatusBarStyle, BAR_STATUS_BAR);
    }
```

`currentStatusBarStyle` is SystemBars' own field, seeded at load from `plugins.SystemBars.style`
(unconfigured → `DEFAULT`) and **stored already resolved** by `getStyleForTheme()` — so it does not
even track the theme it was resolved from. `@capacitor/status-bar` writes to `StatusBar.currentStyle`
on a **different object**; neither updates the other.

Because the Activity declares those configs, **Android does not recreate it** — it calls
`onConfigurationChanged`, the React tree never remounts, and nothing ever calls `configureStatusBar`
again. On a tablet the triggers are routine: rotation, window resize, multi-window, attaching a
keyboard, a dark-mode toggle, a density change.

**Measured, not argued** — see §Before/After below: one rotation took the status bar from 2,724
bright pixels to **zero**, and rotating back did not restore it.

### 6. 🔴 Is there a fix that touches ONLY `android/` and Android-only configuration?

**YES — and it turned out to need no configuration at all, only `android/`.**

**The mechanism.** A View holds exactly **one** `OnApplyWindowInsetsListener`:
`ViewCompat.setOnApplyWindowInsetsListener` stores it in a tag and a second call overwrites the
first. SystemBars registers its listener on the WebView's parent during `super.onCreate()`. Calling
`setOnApplyWindowInsetsListener` on that same view *after* `super.onCreate()` replaces it. That is
not a race — both run on the main thread, in that order, every launch.

**So `plugins.SystemBars.insetsHandling: 'disable'` was considered and declined.** It would have been
safe for the iPad (iOS never reads that key — item 1), but it lives in `capacitor.config.ts`, a
shared file, and would have required `npx cap sync android` to regenerate the baked config. Doing it
in `MainActivity` instead keeps **the entire change inside `android/`**, which is the strongest
guarantee available while the iOS build is in review. Item 6 asked for a plain statement; that is it,
and no shared-layer change was proposed or made.

---

## PHASE 2 — WHAT WAS BUILT

### Insets: one owner, and it is `MainActivity.installInsetOwner()`

```java
        ViewCompat.setOnApplyWindowInsetsListener(parent, (v, insets) -> {
            Insets bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
            );
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            boolean keyboardVisible = insets.isVisible(WindowInsetsCompat.Type.ime());

            v.setPadding(bars.left, bars.top, bars.right, keyboardVisible ? ime.bottom : 0);

            return new WindowInsetsCompat.Builder(insets)
                .setInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout(),
                    Insets.of(0, 0, 0, 0)
                )
                .build();
        });
```

**Where and why the ownership sits here:** it is the only place in the process that can pad the
WebView's parent, because Capacitor's listener has been replaced rather than left to compete. One
view, one listener, one method.

- **Top / left / right keep Capacitor's exact values.** The top strip stays 48px and stays navy; the
  side padding still clears a cutout or a side-mounted bar in landscape. **Nothing at the top of the
  app changed** — measured below.
- **Bottom is zero.** The WebView reaches the bottom edge, so the strip is whatever the page paints
  there. That is the requested "the bottom strip is whatever the content behind it is".
- **The IME case is preserved exactly** (`keyboardVisible ? ime.bottom : 0`), matching
  `SystemBars.java:232`, so a focused input at the foot of Manage or Add-order is not hidden.
- **The returned insets are still zeroed** — this is what keeps iOS and the shared CSS out of it.
  `env(safe-area-inset-top)` stays `0` inside the WebView, so `AppHeader.tsx:45` and
  `kds/page.tsx:1842` keep evaluating to their zero case exactly as before. Passing real insets
  through would have started applying those two declarations and changed the Android web layout
  without editing a web file. It does not.

### The top strip now takes the colour of the surface — your KDS note

You wrote mid-build: *"the KDS has a dark header. it should be white to match the rest of the screen
with android text colour inverted to whatever's best."* That is the same defect as the bottom, on the
edge that still has padding, and it is fixed the same way — **by removing the fixed colour**.

The bottom needed no colour decision: dropping the padding let the content own it. The top cannot be
solved that way (the padding has to stay, or header content slides under the clock), so the strip's
colour has to be *chosen* — and choosing one fixed value is the defect. So the strip is now painted
on the **WebView's parent view**, whose background can change at runtime, instead of inheriting the
window's, which cannot. A View draws its background across its full bounds *including padding*, which
is exactly the region needed.

```java
        boolean light = isKdsUrl(url);
        surfaceIsLight = light;
        insetParent.setBackgroundColor(light ? Color.WHITE : getResources().getColor(R.color.hgHeaderNavy, getTheme()));
        enforceSystemBarAppearance();
```

and the glyphs follow from the **same single input**, so the two cannot disagree:

```java
        if (controller.isAppearanceLightStatusBars() != surfaceIsLight) {
            controller.setAppearanceLightStatusBars(surfaceIsLight);
        }
```

**⚠️ THE HONEST COST, STATED PLAINLY.** The surface is identified from the WebView's URL, read
natively, because the only alternative is a signal from the web layer and every web file is shared
code the iOS build would also execute. **That puts route knowledge in a second place.**
`/kds/<kds_token>` and `/dashboard/<token>/kds` are defined in `app/`, and `MainActivity` now also
has to know them. If a KDS route is renamed, the strip silently goes navy again and nothing fails
loudly. It was accepted because the constraint left no other input, **not because it is the better
design** — once the iOS build is out of review, a shared per-surface signal should replace it.

### The status-bar legibility defect

Both causes are fixed, and the fix for (A) is now *agreement* rather than override:

- **(A) The KDS asked for dark glyphs on an iOS-only premise.** `kds/page.tsx:831` calls
  `configureStatusBar('dark')` because "the KDS's top bar is bg-white and fills the safe-area strip".
  On Android it could not — the strip was navy. **Now the KDS strip IS white, so that request is
  finally correct on this platform**, and the guard arrives at the same answer from the strip colour.
- **(B) Capacitor re-asserted its own cached style on every configuration change.** Handled in
  `onConfigurationChanged` (re-asserting after `super`, which is what puts us last) and backstopped
  by a pre-draw guard, which is the only hook that also covers (A)'s arrival from JavaScript and
  client-side routing.

**On cost:** each frame reads two booleans and returns; the setters run only on an actual drift. The
URL — the one non-trivial read — is throttled to 4×/second and then compared, so a settled screen
issues no window calls at all. This matters because the KDS runs unattended for a whole service.

**The navigation bar had to ship with this.** With the page now behind the gesture bar and every
operator surface light there, a light pill would be invisible on its own background.
`setAppearanceLightNavigationBars(true)` means **dark** icons for a light background — the same
inverted naming as the status-bar API.

---

## 🔴 PIXEL MEASUREMENTS — before and after

Method: `adb exec-out screencap -p` to a real PNG, decoded to raw RGB with `sharp`, sampled at nine
evenly-spaced x positions per row plus a walk up from the bottom edge and down from the top edge.
The **web layer is byte-identical across every pair below** — production is frozen and no web file
was edited — so every difference is attributable to the native change and to nothing else.

### The band, BEFORE — five screens, five different page contents, one identical band

| Screen | bottom 20 rows | band height | top strip |
|---|---|---|---|
| `/admin`, truck table | **`#0F172A`** rgb(15,23,42) | 28 px (14 dp) | `#0F172A`, 48 px |
| Dashboard, Orders tab | **`#0F172A`** | 28 px | `#0F172A`, 48 px |
| Dashboard, `bg-black/50` scrim open | **`#0F172A`** | 28 px | `#0F172A`, 48 px |
| Dashboard, portrait | **`#0F172A`** | 28 px | `#0F172A`, 48 px |
| KDS (white header) | **`#0F172A`** | 28 px | `#0F172A`, 48 px → `#FFFFFF` at y=48 |

**`#0F172A` = `@color/hgHeaderNavy`, measured. The previous report established that by construction;
this measures it.** And the strongest single fact here: **the band did not change when the content
behind it changed.** With the modal scrim open, the page at x=400,y=1500 sampled `#7C7D7E` while the
bottom 28px stayed `#0F172A`. A strip that ignores five different backgrounds is a fixed colour.

### The band, AFTER

| Screen | bottom 20 rows | was |
|---|---|---|
| Dashboard, Orders tab | **`#F8FAFC`** rgb(248,250,252) — `bg-slate-50` | `#0F172A` |
| KDS | **`#F8FAFC`** | `#0F172A` |
| KDS, portrait | **`#F8FAFC`** | `#0F172A` |
| Dashboard, `bg-black/50` scrim open | **`#7C7D7E`** rgb(124,125,126), **to y=1599** | `#0F172A` |

The scrim row is the decisive one: **the same coordinates that read `#0F172A` before now read
`#7C7D7E`, which is exactly what the page paints there.** The strip takes the colour of the content
on a light screen and on a dark one. The gesture pill measured `#636465` — dark, from
`setAppearanceLightNavigationBars(true)`, where before it was a light pill on navy.

### Status-bar glyphs, BEFORE

| Condition | bright pixels in the top 48 rows | verdict |
|---|---|---|
| `/admin` (cold-launch chain) | 2,722 (2.215%) | legible |
| Dashboard | 2,724 (2.217%) | legible |
| **After ONE rotation** | **0 (0.000%)** | **illegible** |
| After rotating back | **0** | **still illegible** — no remount, no recovery |
| After night-mode on, then off | **0** | **still illegible** |
| **Cold launch straight into the KDS, no rotation** | **0** | **illegible** — cause (A), isolated |

Luminance in the broken cases: min 8.9 / max 22.7 against a background of 22.7 — a flat near-black
block where the clock, wifi and battery should be. **Both causes reproduced and measured.**

### Status-bar glyphs and the top strip, AFTER

| Condition | strip colour | contrasting pixels | verdict |
|---|---|---|---|
| Dashboard | `#0F172A` navy, 48 px | 2,660 (2.165%) | **legible** — light on navy |
| **KDS** | **`#FFFFFF` white, 72 px unbroken into the header** | **2,485 (2.022%)**, lum min 102 vs bg 255 | **legible** — dark on white |
| KDS, rotated | `#FFFFFF` | 2,433 (3.168%) | **legible** |
| Dashboard, rotated | `#0F172A` | 2,747 | **legible** |
| Dashboard, +4 further config changes | `#0F172A` | 2,747 | **legible** |
| Round trip KDS → dashboard | back to `#0F172A` | 2,660 | **legible** |

The KDS's 72 px of unbroken `#FFFFFF` from y=0 is the measurement that answers your note directly:
the 48 px strip and the first 24 px of the white KDS header are now **one continuous white surface**,
with the clock and battery drawn dark on it. The dashboard's strip is unchanged at 48 px of
`#0F172A`, confirming no top regression.

### 🔴 A correction to `docs/android-bottom-inset-report.md`

That report claimed `/login`, `/admin` and `/setup` are **permanently** dark-on-navy because they
never call `configureStatusBar`. **Measured, that is too strong.** `/admin` showed 2,722 bright
pixels — legible — because the appearance is a **window-level flag that survives in-WebView
navigation**: the app cold-launched at `/app`, which does call it, and `/admin` inherited the result.
The correct statement is that such a page is dark-on-navy only when it is the **first** surface after
a cold launch, or after any configuration change. The defect is real; its trigger is narrower than
stated. The fix covers both readings regardless.

---

## What this widens, and what remains unobserved

**⚠️ The WebView is now ~28 px (14 dp) taller, so `100dvh` grew.** The operator shells are
`h-dvh flex flex-col overflow-hidden` with only `<main>` scrolling, so the last 14 dp of that scroll
region now sits behind the gesture bar at the end of its travel. **This is inherent to the requested
target** — content behind the bar is what edge-to-edge means, and it is the standard Android 15+
look for gesture navigation, where the bar is a thin translucent pill. **No web file was changed to
achieve it**; the viewport simply got bigger. No operator surface has a `fixed bottom-0` element, so
nothing is permanently hidden.

**Not observed — stated so nothing here reads as more verified than it is:**

1. **3-button navigation.** The emulator is gestural (measured). With 3-button the bottom inset is
   ~48 dp rather than 14 dp and the occlusion above would be correspondingly larger. **Untested.**
2. **The keyboard / IME path.** The code preserves Capacitor's `ime.bottom` behaviour, but I did not
   open a keyboard on a focused input and measure it.
3. **A physical device.** Everything is an emulator, `sdk_gphone64_arm64`, Android 16, WebView 133.
4. **A WebView ≥ 140 device**, where Capacitor would have taken the passthrough branch. Our listener
   replaces it in both cases, so behaviour should be identical — **reasoned, not measured.**
5. **`/login` and `/setup`** were not visited; that would have required signing the session out.
6. **The iOS build was not rebuilt or run.** The argument that it cannot regress is structural — no
   file it compiles or reads was edited — not empirical.
7. **A release build.** Only `assembleDebug` was run.
8. **Long-run cost of the pre-draw guard.** Argued from what it does per frame, not profiled.
