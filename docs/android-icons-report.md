# Android icon and splash assets — generated from the master SVG

**Date:** 25 August 2026
**Prompt integrity:** no span arrived garbled. **One instruction pair needed a judgement rather than a
stop — §1.7. Two conflicts are flagged rather than resolved silently — §1.7 and §4.3.**

🔴 **WHICH OF THE THREE: AN EXECUTION.** 31 PNGs were rasterised with `sharp` and every one was read
back and measured. **No typecheck was run** (nothing TypeScript changed) and 🔴 **NO GRADLE BUILD WAS
RUN — you told me not to, and I did not.**

🔴 **THESE ASSETS HAVE NOT BEEN SEEN ON A DEVICE OR AN EMULATOR.** Every property below is measured from
the file bytes. **Nothing here is a rendering observation.**

✅ **`ios/` IS UNTOUCHED** — `git status -- ios/` is empty and `AppIcon-512@2x.png` still hashes to
`eee556188b881990085dea0178069b0ee809bc8cabcdab98d36c7b46f5ac1857`, identical to the reading taken before
this task. **No alpha was added to any Apple asset.**

---

# §1 — PHASE 1: THE READS

## 1.1 SDK LEVELS

```gradle
    minSdkVersion = 24        // android/variables.gradle:2
    compileSdkVersion = 36    // android/variables.gradle:3
    targetSdkVersion = 36     // android/variables.gradle:4
```
Consumed at `android/app/build.gradle:8-9` via `rootProject.ext.*`.

🔴 **`minSdk 24` IS THE ANSWER TO ITEM 5.** Adaptive icons arrived at **API 26**, so API 24 and 25 are in
scope and **the legacy PNGs are still loaded.** Both sets are required.

## 1.2 THE MASTER SVG

**Path: `public/icons/hatchgrab-icon.svg`.** Whole file:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024"><rect width="1024" height="1024" fill="#0F172A"/><g transform="translate(374.804,153.600) scale(716.8000)"><path d="M0.3014 0 L0 0.5625 H0.185 L0.0814 1 L0.3828 0.40625 H0.1978 Z" fill="#EF8B2C"/></g></svg>
```

| | |
|---|---|
| **viewBox** | `0 0 1024 1024` |
| **Paths** | 🔴 **ONE.** A single `<path>` for the bolt, plus a `<rect>` that is the background, not the mark. |
| **Colours** | `#EF8B2C` (bolt) and `#0F172A` (background rect) |

**The mark is centred and 70% of the height** — arithmetic, not eyeballing: in unit space the bolt spans
x 0→0.3828, y 0→1; at `scale(716.8)` translated to `(374.804, 153.6)` it occupies x 374.8→649.2 and
y 153.6→870.4, giving a centre of exactly **(512, 512)** in a 1024 box. **Aspect ratio 0.3828 : 1.**

## 1.3 EVERY ICON/SPLASH ASSET BEFORE THIS TASK

| File | Dimensions | Capacitor default? |
|---|---|---|
| `drawable/splash.png` | 480×320 | 🔴 **yes** |
| `drawable-land-{m,h,xh,xxh,xxxh}dpi/splash.png` | 480×320, 800×480, 1280×720, 1600×960, 1920×1280 | 🔴 **yes** |
| `drawable-port-{m,h,xh,xxh,xxxh}dpi/splash.png` | 320×480, 480×800, 720×1280, 960×1600, 1280×1920 | 🔴 **yes** |
| `mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher.png` | 48, 72, 96, 144, 192 | 🔴 **yes** |
| `mipmap-{…}dpi/ic_launcher_round.png` | same | 🔴 **yes** |
| `mipmap-{…}dpi/ic_launcher_foreground.png` | 108, 162, 216, 324, 432 | 🔴 **yes** |
| `mipmap-anydpi-v26/ic_launcher.xml`, `ic_launcher_round.xml` | — | yes (structure kept) |
| `drawable-v24/ic_launcher_foreground.xml`, `drawable/ic_launcher_background.xml` | — | yes |
| `values/ic_launcher_background.xml` | — | `#FFFFFF` |

🔴 **ALL 31 RASTER ASSETS WERE UNTOUCHED CAPACITOR DEFAULTS — the blue "X" mark.** Confirmed by decoding
`mipmap-xxxhdpi/ic_launcher_foreground.png` and `drawable/splash.png` before generating.

🔴 **NO `ic_stat*` ASSET EXISTED**, and `AndroidManifest.xml` carried no `default_notification_icon`.

## 1.4 SPLASH CONFIGURATION

`capacitor.config.ts:77-82`:
```ts
      SplashScreen: {
        launchShowDuration: 1000,
        backgroundColor: '#1C1C1E',
        showSpinner: false,
        launchAutoHide: true,
      },
```
🔴 **`@capacitor/splash-screen` IS NOT INSTALLED** — a check of `package.json` dependencies for `/splash/i`
returns nothing. **So that config block is inert**, and the splash that actually renders is the Android
theme's window background:
```xml
        <item name="android:background">@drawable/splash</item>     <!-- values/styles.xml:48 -->
```
with the file's own note at `:22-23`: *"NoActionBarLaunch is the splash window (its android:background is
@drawable/splash, so changing it would alter the splash, not the running app)."*

✅ **That is why replacing the drawable in place, under the same names, was the correct move and why no
config change was needed.**

## 1.5 ADAPTIVE ICONS — ALREADY PRESENT

```xml
<adaptive-icon …>
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
```
Both `ic_launcher.xml` and `ic_launcher_round.xml`, identical. **Background is a colour resource, so no
background PNG is needed at any density.**

## 1.6 WHAT IS REQUIRED, AND WHAT IS REDUNDANT — ✅ NOTHING SUPERFLUOUS WAS GENERATED

**Required, because `minSdk 24` < 26:**
- `mipmap-*/ic_launcher.png` and `ic_launcher_round.png` at all five densities — **the only icon API 24–25
  can load.**
- `mipmap-*/ic_launcher_foreground.png` at all five densities — the adaptive layer for API 26+.

**Redundant, and deliberately NOT touched or deleted:**
- ⚠️ **`drawable-v24/ic_launcher_foreground.xml`** — a vector the adaptive icon **does not reference**; both
  XMLs point at `@mipmap/ic_launcher_foreground`. **Dead weight, left in place because deleting was out of
  scope.**
- ⚠️ **`drawable/ic_launcher_background.xml`** — same: the adaptive icon uses `@color/…`, not `@drawable/…`.

## 1.7 🔴 TOOLING, AND THE ONE JUDGEMENT I MADE RATHER THAN STOPPING

✅ **`sharp` 0.34.5 is installed and rasterises SVG. NOTHING WAS INSTALLED and no stop was needed.**
(Also present: `sips`, `qlmanage`. Absent: ImageMagick, rsvg-convert, resvg, inkscape, cairosvg, Pillow.)

🔴 **THE BRAND BACKGROUND IS AMBIGUOUS AND THE READINGS DISAGREE. I CHOSE WHITE AND AM FLAGGING IT.**

| Source | Value |
|---|---|
| **The master SVG's `<rect>`** | `#0F172A` — dark slate |
| **The shipped iOS icon's corner pixel** | `#FFFFFF` — **decoded, not assumed** |
| **`values/ic_launcher_background.xml`** | `#FFFFFF` |
| **The existing splash PNGs** | white |
| **`SplashScreen.backgroundColor`** | `#1C1C1E` — near-black, **and inert (1.4)** |

**I used `#FFFFFF`**, because it is what **actually ships on iOS**, it is what the Android project's own
`ic_launcher_background` already declares, and V11.42 of the manual records that the "icon background must
stay very dark" rule was **overridden** when the iOS icon went light on 15 August.

⚠️ **THE MASTER SVG STILL DECLARES A DARK BACKGROUND, SO THE FILE AND THE SHIPPED ICONS NOW DISAGREE.** I
did not change the SVG — out of scope. **If dark was intended, it is one value in my generator and a
regenerate.**

---

# §2 — PHASE 2: WHAT WAS WRITTEN

**31 PNGs, all from the single master path, all centred by arithmetic.** The generator emits an SVG per
target and rasterises it — **the bolt path is copied verbatim from the master, never re-traced.**

## 2.1 (a) LAUNCHER

| File | px | Alpha | Corner RGBA |
|---|---|---|---|
| `mipmap-mdpi/ic_launcher.png` | 48×48 | yes | `(255,255,255,255)` |
| `mipmap-hdpi/ic_launcher.png` | 72×72 | yes | `(255,255,255,255)` |
| `mipmap-xhdpi/ic_launcher.png` | 96×96 | yes | `(255,255,255,255)` |
| `mipmap-xxhdpi/ic_launcher.png` | 144×144 | yes | `(255,255,255,255)` |
| `mipmap-xxxhdpi/ic_launcher.png` | 192×192 | yes | `(255,255,255,255)` |
| `mipmap-{m,h,xh,xxh,xxxh}dpi/ic_launcher_round.png` | 48/72/96/144/192 | yes | `(255,255,255,255)` |
| `mipmap-mdpi/ic_launcher_foreground.png` | 108×108 | yes | 🔴 `(0,0,0,0)` |
| `mipmap-hdpi/ic_launcher_foreground.png` | 162×162 | yes | 🔴 `(0,0,0,0)` |
| `mipmap-xhdpi/ic_launcher_foreground.png` | 216×216 | yes | 🔴 `(0,0,0,0)` |
| `mipmap-xxhdpi/ic_launcher_foreground.png` | 324×324 | yes | 🔴 `(0,0,0,0)` |
| `mipmap-xxxhdpi/ic_launcher_foreground.png` | 432×432 | yes | 🔴 `(0,0,0,0)` |

✅ **THE FOREGROUND LAYERS ARE TRANSPARENT AT THE CORNER, AS THEY MUST BE** — the background comes from
`@color/ic_launcher_background`, and an opaque foreground would defeat the adaptive mask.

### 🔴 THE SAFE ZONE — WHY 0.55 AND NOT 0.66

You asked for *"roughly the centre 66%"*. **66/108 is the safe-zone DIAMETER, and the zone is a CIRCLE.**
The bolt is tall and narrow, so **height is the binding dimension**: a mark 0.66 of the layer's height has
a bounding diagonal of `sqrt(0.66² + (0.3828×0.66)²) = 0.707`, which **exceeds the 0.611 circle and would
be clipped top and bottom on a circular mask.**

**At 0.55 the diagonal is `sqrt(0.55² + 0.2105²) = 0.589 < 0.611`** — inside the circle with margin.
⚠️ **I took the geometry over the literal number; if you want it visually larger, 0.58 is the ceiling
before a round mask starts biting.**

## 2.2 (b) SPLASH — ✅ SAME NAMES, SAME DIMENSIONS, NOTHING RENAMED

All eleven replaced **in place**, at byte-for-byte the same dimensions as the Capacitor originals
(§1.3): `drawable/splash.png` 480×320 · land `mdpi 480×320, hdpi 800×480, xhdpi 1280×720,
xxhdpi 1600×960, xxxhdpi 1920×1280` · port `mdpi 320×480, hdpi 480×800, xhdpi 720×1280, xxhdpi 960×1600,
xxxhdpi 1280×1920`.

**Every one: alpha present, corner `(255,255,255,255)`.** Bolt centred on both axes, sized to 30% of the
**shorter** side so portrait and landscape render the mark at the same physical size.

✅ **`capacitor.config.ts` WAS NOT MODIFIED** — `git diff` on it is empty. **Item (b) strictly required
no config change, because the splash resolves through `values/styles.xml`, not through the plugin.**

## 2.3 (c) NOTIFICATION — ✅ AND THE WHITENESS IS PROVEN, NOT ASSERTED

| File | px | Alpha | Corner RGBA | Fully transparent | 🔴 Non-white non-transparent px |
|---|---|---|---|---|---|
| `drawable-mdpi/ic_stat_hatchgrab.png` | 24×24 | yes | `(0,0,0,0)` | **88.02%** | **0** |
| `drawable-hdpi/ic_stat_hatchgrab.png` | 36×36 | yes | `(0,0,0,0)` | **89.81%** | **0** |
| `drawable-xhdpi/ic_stat_hatchgrab.png` | 48×48 | yes | `(0,0,0,0)` | **90.49%** | **0** |
| `drawable-xxhdpi/ic_stat_hatchgrab.png` | 72×72 | yes | `(0,0,0,0)` | **91.32%** | **0** |
| `drawable-xxxhdpi/ic_stat_hatchgrab.png` | 96×96 | yes | `(0,0,0,0)` | **91.68%** | **0** |

✅ **EVERY NON-TRANSPARENT PIXEL IN ALL FIVE FILES IS PURE WHITE — measured by walking every pixel of
every file, not sampled.** A coloured pixel here renders as a grey blob; **there are none.**

⚠️ **The partial-alpha pixels are the antialiased edge** (54 / 87 / 118 / 181 / 238 respectively) and are
white too — they carry the shape in alpha, which is the only channel Android reads.

**The manifest entry, added before `</application>`:**
```xml
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_icon"
            android:resource="@drawable/ic_stat_hatchgrab" />
```

---

# §3 — SCOPE

| Contract | Result |
|---|---|
| `ios/` unmodified | ✅ **empty `git status`, hash unchanged** |
| Web bundle unmodified | ✅ **`app/`, `lib/`, `components/`, `public/` carry only the unrelated WhatsApp-cap changes from an earlier task** |
| `capacitor.config.ts` | ✅ **unchanged — item (b) needed nothing** |
| Gradle build | ✅ **not run** |
| Packages installed | ✅ **none — `sharp` was already present** |
| Anything deleted | ✅ **nothing** |

**Changed by this task:** 27 modified files under `android/app/src/main/res/` + `AndroidManifest.xml`, and
5 new `drawable-*dpi/` directories holding the notification icon.

---

# §4 — 🔴 WHAT REMAINS BROKEN, WRONG OR UNSEEN

## 4.1 NOT SEEN ON ANY DEVICE

🔴 **Nothing here has been rendered.** No emulator, no handset, no `gradle`. **The launcher mask, the
splash at real aspect ratios, and the status-bar tint are all unverified.**

## 4.2 🔴 THE LOCAL-NOTIFICATION ICON IS STILL BROKEN, AND I LEFT IT DELIBERATELY

```ts
      LocalNotifications: {
        smallIcon: 'ic_stat_icon_config_sample',    // capacitor.config.ts:84
        iconColor: '#F5A623',
      },
```
🔴 **`ic_stat_icon_config_sample` DOES NOT EXIST — it never did, and it still does not.** My manifest entry
covers **Firebase/FCM push only**. **Local notifications will still fail to resolve their small icon.**

🔴 **I DID NOT FIX IT, BECAUSE YOU RESTRICTED `capacitor.config` CHANGES TO WHAT ITEM (b) REQUIRES, AND
ITEM (b) IS THE SPLASH.** The fix is one string — `smallIcon: 'ic_stat_hatchgrab'`. ⚠️ **It is your call,
and the asset it would point at now exists.**

## 4.3 OTHER MISMATCHES FOUND, NOT ACTED ON

- ⚠️ **`SplashScreen.backgroundColor: '#1C1C1E'`** (near-black) against a **white** splash drawable. Inert
  today because the plugin is not installed — **but it becomes a visible flash the day it is.**
- ⚠️ **`iconColor: '#F5A623'`** is a different orange from the brand `#EF8B2C`. Only tints the notification
  silhouette; **noted because it is one character-run from being consistent.**
- ⚠️ **The master SVG still declares `#0F172A`** while everything shipped is white (§1.7).
- ⚠️ **`drawable-v24/ic_launcher_foreground.xml` and `drawable/ic_launcher_background.xml` are unreferenced**
  (§1.6) and still carry Capacitor's artwork. **Harmless, but they are dead assets that read as live ones.**
