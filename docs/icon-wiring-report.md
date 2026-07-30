# ICON WIRING — JOB 1 BLOCKED, JOB 2 COMPLETE

**Date:** 30 July 2026 · **Repo:** `/Users/dominicbonini/dev/village-foodie` · **Branch:** `main`
**Status: 🛑 JOB 1 NOT DONE — the assets do not exist. NO EDIT WAS MADE TO ANY FILE.**
**✅ JOB 2 COMPLETE — read-only, nothing changed.**
No `next dev` / `next build` run.

**Prompt integrity:** no span read as garbled or truncated.

---

# 🔴 STOP CONDITION HIT — ASSET VERIFICATION FAILED

You said: *"FIRST verify all of these exist and report their byte sizes. If any is missing, stop."*
**Five of the six are missing, and the sixth was not replaced.**

| Expected file | Present? | Bytes |
|---|---|---|
| `public/favicon.ico` | ❌ **MISSING** | — |
| `public/apple-touch-icon.png` | ⚠️ **present, but NOT overwritten** | **7,954,151** |
| `public/icons/icon-192.png` | ❌ **MISSING** | — |
| `public/icons/icon-512.png` | ❌ **MISSING** | — |
| `public/icons/icon-512-maskable.png` | ❌ **MISSING** | — |
| `public/icons/hatchgrab-icon.svg` | ❌ **MISSING** | — |

🔴 **`public/icons/` does not exist as a directory at all.**

⚠️ **`apple-touch-icon.png` is still the OLD file.** 7,954,151 bytes / **2528 × 1696** — byte-for-byte the
size recorded in `docs/logo-audit-report.md`. The intended overwrite **did not happen**.

**I searched further before concluding:**

- Repo-wide `find` for `*hatchgrab*icon*`, `*hatchgrab*bolt*`, `icon-192*`, `icon-512*`, `favicon*`
  (excluding `node_modules`, `.git`, `.next`) → **no results.**
- `git status --porcelain public/` → **empty.** No untracked files were hand-placed under `public/`.
- `~/Downloads` (where the manual deltas land) → the only related file is
  **`hatchgrab-bolt-icon-proof.png`** (29,284 bytes, today 17:29) — a **proof image**, not any of the six
  deliverables.

**Most likely explanation:** the assets were generated (the four SVG sources are in your message and the
proof render exists) but **not written into the repo**. **I have made no edits and no files.**

---

# JOB 1 — NOT PERFORMED. ANCHORS RE-VERIFIED AND READY.

You asked me to re-verify each file:line from the audits before editing. **I did. All three match
exactly** — nothing has moved, so this is actionable the moment the assets land.

### ✅ Anchor 1 — `app/layout.tsx`, icons block at **lines 58-61** (audit said "~59" ✓)

```ts
    icons: {
      icon: "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E🚚%3C/text%3E%3C/svg%3E",
      apple: "/apple-touch-icon.png",
    },
```

### ✅ Anchor 2 — `public/manifest.json`, icons array opens at **line 9**

`"src": "/apple-touch-icon.png"` at **:11**, the false `"sizes": "180x180"` at **:12**.

### ✅ Item 3 — the sweep you asked for, run now

| Target | Occurrences |
|---|---|
| **The emoji favicon data URI** | **EXACTLY ONE** — `app/layout.tsx:59`. Removing it removes the last one |
| **`180x180`** | **EXACTLY ONE** — `public/manifest.json:12` |
| **`apple-touch-icon`** | **TWO** — `app/layout.tsx:60`, `public/manifest.json:11` |

⚠️ **A caution for whoever runs the sweep after the edit:** a naive grep for `🚚` returns **~20 hits**, and
**none of the others is an icon.** They are page copy (`hire/page.tsx:17`, `contact/page.tsx:40`), email
templates (`api/admin/create-operator/route.ts:111,150`), share text
(`trucks/[slug]/page.tsx:57,60,70`), map markers (`MapView.tsx:20`), the truck-emoji picker
(`manage/page.tsx:126`), calendar links (`lib/utils.ts:159`) and a code comment
(`components/manage/VanFilter.tsx:73`). **Only `layout.tsx:59` is a favicon.** Grep for
`data:image/svg+xml` instead — that returns the one.

**No edit was applied to either file.** Both remain exactly as quoted.

---

# JOB 2 — READ-ONLY REPORT

## 4. The Android adaptive-icon XML

### `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` (265 bytes)

```xml
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
```

### `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml` (265 bytes)

```xml
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
```

🔴 **The two files are byte-identical** (both 265 bytes, same content). Android round-masks
`ic_launcher_round` itself; the XML does not differ.

### What each drawable resolves to

| Reference | Type | Resolves to |
|---|---|---|
| `@color/ic_launcher_background` | **COLOUR RESOURCE** | `android/app/src/main/res/values/ic_launcher_background.xml` → **`#FFFFFF`** |
| `@mipmap/ic_launcher_foreground` | **PNG set** (5 densities, **not** a vector) | `android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher_foreground.png` |

**There is no `drawable/` vector anywhere in the icon path** — no `ic_launcher_foreground.xml`, no
`VectorDrawable`. The foreground is raster only.

## 5. The background colour resource

**`android/app/src/main/res/values/ic_launcher_background.xml`** (120 bytes), verbatim:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#FFFFFF</color>
</resources>
```

🔴 **Current hex: `#FFFFFF` — pure white.**

⚠️ **That is the Capacitor scaffold default and it does not match the new artwork**, whose SVGs both set
`<rect … fill="#0F172A"/>`. It also does not match `capacitor.config.ts`'s
`android.backgroundColor: '#1C1C1E'`. **Three different "background" values are in play across the native
layer today.** *(Reported, not resolved.)*

⚠️ Note this file is **separate from** `res/values/colors.xml` (569 bytes), which exists alongside it and
defines unrelated colours. The launcher background has its own file.

## 6. Legacy launcher PNGs — every density

| Density | `ic_launcher.png` | `ic_launcher_round.png` | `ic_launcher_foreground.png` |
|---|---|---|---|
| **mdpi** | 1,869 B · 48×48 | 2,725 B · 48×48 | 2,110 B · 108×108 |
| **hdpi** | 2,786 B · 72×72 | 4,341 B · 72×72 | 3,450 B · 162×162 |
| **xhdpi** | 3,981 B · 96×96 | 6,593 B · 96×96 | 5,036 B · 216×216 |
| **xxhdpi** | 6,644 B · 144×144 | 10,455 B · 144×144 | 9,793 B · 324×324 |
| **xxxhdpi** | 9,441 B · 192×192 | 15,916 B · 192×192 | 15,529 B · 432×432 |

**15 PNGs, 5 densities × 3 roles.** Sizes are textbook Android density ratios (48/72/96/144/192 for the
legacy icons; 108/162/216/324/432 for the adaptive foreground).

### ✅ Yes — they ARE referenced from outside `mipmap-anydpi-v26`

**`android/app/src/main/AndroidManifest.xml`:**

| Line | Attribute |
|---|---|
| **6** | `android:icon="@mipmap/ic_launcher"` |
| **8** | `android:roundIcon="@mipmap/ic_launcher_round"` |

🔴 **This is the load-bearing detail for question 8.** `@mipmap/ic_launcher` is **ambiguous by design**:
on **API 26+** Android resolves it to `mipmap-anydpi-v26/ic_launcher.xml` (the adaptive icon); on
**API 25 and below** it resolves to the **legacy PNG** in the density folder. **Both paths are live.**
So `ic_launcher.png` / `ic_launcher_round.png` are **not dead files** — they are the pre-Oreo fallback,
and replacing only the adaptive icon would leave old devices on the Capacitor placeholder.

*(No `.gradle` file references them; the manifest is the only referrer.)*

## 7. iOS `AppIcon.appiconset/Contents.json` — verbatim

```json
{
  "images" : [
    {
      "filename" : "AppIcon-512@2x.png",
      "idiom" : "universal",
      "platform" : "ios",
      "size" : "1024x1024"
    }
  ],
  "info" : {
    "author" : "xcode",
    "version" : 1
  }
}
```

### ✅ The single 1024×1024 universal entry IS the only image the project expects.

**No other sizes are required at build time.** Reasons, in order of strength:

1. **This is the modern single-size asset catalog format.** Xcode 14+ accepts one `"idiom": "universal"`
   entry at 1024×1024 and **generates every required size itself** at build. The older format needed
   ~18 explicit entries with `scale` and per-device `idiom`; this catalog has none, which is the marker
   of the new format, not of an incomplete one.
2. **The build setting points at it and nothing else** —
   `ios/App/App.xcodeproj/project.pbxproj:297` and `:320`:
   `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;` (once per configuration, Debug + Release).
3. **The directory contains exactly two files** — `AppIcon-512@2x.png` (110,522 B, **1024×1024**,
   **no alpha**) and `Contents.json` (218 B). Nothing is referenced but missing.

⚠️ **`hasAlpha: no` matters and is correct** — the App Store rejects app icons containing an alpha
channel. **Any replacement must be flattened**, which the new `hatchgrab-icon.svg` naturally is (it has an
opaque `<rect>` background).

*(Sibling: `Splash.imageset/` declares three entries at scales 1x/2x/3x pointing at
`splash-2732x2732-2.png`, `-1.png` and `.png` — which are **byte-identical, 41,273 B each**.)*

## 8. What would need to change — DESCRIBED, NOT DONE

### Android adaptive icon

| # | File | Change |
|---|---|---|
| 1 | `res/values/ic_launcher_background.xml` | `#FFFFFF` → the brand navy (`#0F172A` per the new SVGs). **One line.** ⚠️ Or drop the colour and point `<background>` at a drawable instead — a decision, not a mechanic |
| 2 | `res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher_foreground.png` | **5 files replaced** with the bolt at 108/162/216/324/432 px. ⚠️ **The bolt must occupy only the inner ~66% safe zone** — Android crops adaptive foregrounds to the mask, and the outer ~1/3 of each edge can be clipped on some launchers |
| 3 | `res/mipmap-{5 densities}/ic_launcher.png` | **5 files** — the **pre-Oreo legacy** icon (bolt on navy, pre-composited, square) at 48/72/96/144/192 px |
| 4 | `res/mipmap-{5 densities}/ic_launcher_round.png` | **5 files** — same, circular, at 48/72/96/144/192 px |
| — | `mipmap-anydpi-v26/ic_launcher.xml`, `ic_launcher_round.xml` | **NO CHANGE** — they already point at the right names |
| — | `AndroidManifest.xml` | **NO CHANGE** — `@mipmap/ic_launcher` / `@mipmap/ic_launcher_round` are correct |

**Total: 1 XML line + 15 PNGs**, all at fixed names and sizes. ⚠️ **Skipping rows 3-4 leaves API ≤25
devices on the Capacitor placeholder** — that is exactly what the manifest's dual resolution means.

**Alternative, mechanically different:** convert the foreground to a **VectorDrawable**
(`res/drawable/ic_launcher_foreground.xml`) and change `ic_launcher.xml`'s `@mipmap/` to `@drawable/`.
The bolt is a single closed path, so it converts cleanly and **replaces 5 PNGs with 1 XML** — but it does
**not** cover rows 3-4, which must stay raster.

### iOS app icon

| # | File | Change |
|---|---|---|
| 1 | `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` | **Replace this ONE file.** 1024×1024, **no alpha**, no transparency, square, no rounding (iOS masks it) |
| — | `AppIcon.appiconset/Contents.json` | **NO CHANGE** — the single universal entry already describes it, and the filename is unchanged |
| — | `project.pbxproj` | **NO CHANGE** — `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon` already correct |

**Total: 1 file.** iOS is by far the smaller job.

### Both platforms

⚠️ **Neither is picked up until a rebuild.** `npx cap sync ios` / `npx cap sync android` copies web assets
and plugin config — **it does not regenerate native icons**, and there is **no `@capacitor/assets`
installed and no `resources/` directory** to generate from (per `docs/logo-audit-report.md`). Every file
above is a **manual replacement at a fixed path** unless that tooling is added first.

⚠️ **Out of scope but adjacent, so you know it exists:** the iOS splash (3 identical 2732×2732 PNGs) is
still scaffold artwork, and `capacitor.config.ts` configures a `SplashScreen` plugin that **is not
installed**. Not touched, not proposed.

---

## What I could NOT verify

- 🔴 **I could not verify the new assets at all — they do not exist.** Everything in Job 1 is
  anchor-verification only. **Nothing was written.**
- **Nothing was built or rendered.** No `next dev`/`next build`, no Xcode build, no Gradle build. The
  claim that iOS needs only the single 1024×1024 entry is from the catalog format, the pbxproj setting
  and the directory contents — **not from a successful build.**
- ⚠️ **The Android ~66% safe-zone figure is the platform guideline**, asserted from knowledge, not
  measured against these specific PNGs. I did not inspect how much padding the current placeholder
  foreground uses.
- **I did not open the Android PNGs as images this pass** — densities and byte sizes are from `stat`/`sips`.
  The "Capacitor placeholder" characterisation carries over from `docs/logo-audit-report.md`, where I did
  view them.
- **`ic_launcher_round.png` is listed as required for pre-Oreo**, but I did not confirm the minSdk of this
  project — if `minSdkVersion` is already 26+, rows 3-4 would be dead weight. **Worth checking
  `android/app/build.gradle` before doing that work.**
- **I did not check whether `res/values/colors.xml` also defines a launcher-related colour** beyond
  confirming `ic_launcher_background` is defined in its own separate file.
