# Which icon is actually on his phone — the hunt

**READ-ONLY. Nothing changed. No asset touched — `git status` on `ios/`, `android/` and `public/` is
empty.**

---

## 🔴 THE ANSWER, UP FRONT

**You were right. The file I measured is almost certainly not the one on his screen.**

**The darker, more-saturated outline exists in the repository — but NOT in the native app icon. It is in
the three PWA / Safari web-clip icons, all regenerated on 28 August, and one of them is
`apple-touch-icon.png`, which is exactly what iOS uses for an "Add to Home Screen" web clip.**

| | Size | Modified | 🔴 Darker-than-fill pixels |
|---|---|---|---|
| **Native app icon** `AppIcon-512@2x.png` | 1024² | **15 Aug 12:26** | **0** |
| 🔴 **`public/apple-touch-icon.png`** (web clip) | 180² | **28 Aug 18:17** | **228** |
| 🔴 `public/icons/icon-512.png` | 512² | 28 Aug 18:17 | 257 |
| 🔴 `public/icons/icon-192.png` | 192² | 28 Aug 18:17 | 150 |

**And the darker ring is not a stroke anyone drew. It is RESAMPLING OVERSHOOT** — the signature of a
sharpening downscaler. §2 shows the profile.

---

## VERIFICATION

**EXECUTION.** 50 icon-shaped PNGs across `ios/`, `android/` and `public/` were located and **decoded**,
each tested for pixels **darker and more saturated** than the `#EF8B2C` fill — the opposite of last
time's test. **The SVG master was read in full.**

🔴 **I still cannot see the device.** §3 and §6 name what only the phone or Xcode can settle.

**No span of the prompt arrived garbled.**

---

## 1 · Every candidate that could reach an iOS build

**Searched: `capacitor.config.ts`, an `assets/` or `resources/` directory, `public/icons/`, everything
under `ios/App/App/` inside and outside the asset catalogue, and Android build output — including
gitignored files present on disk.**

| Location | Finding |
|---|---|
| **`capacitor.config.ts`** | ✅ **No icon or assets key.** Its only icon reference is `smallIcon` for **Android notifications** and `iconColor: '#EF8B2C'` |
| **`assets/`, `resources/`** | ❌ **DO NOT EXIST.** No `@capacitor/assets` or `cordova-res` convention directory |
| **A generation script / tool** | ❌ **None.** No icon script in `package.json`, none in `scripts/`, and **no `sharp`, `jimp`, `@capacitor/assets` or pwa-asset dependency** |
| 🔴 **Every PNG under `ios/`** | **FOUR files total**: `AppIcon-512@2x.png` (1024², **15 Aug 12:26**) and three identical `splash-2732x2732*.png` (14 Aug). **There is exactly one app icon in the whole iOS project** |
| `ios/App/App/public/` | Two **zero-byte** Cordova shims. No images |
| `android/.../build/intermediates/` | 30 generated launcher PNGs (25 Aug) — build output, Android only |
| **`public/icons/`** | `hatchgrab-icon.svg` (30 Jul), `icon-192.png` + `icon-512.png` (**28 Aug 18:17**), `icon-512-maskable.png` (30 Jul) |
| **`public/apple-touch-icon.png`** | 180², **28 Aug 18:17** |

---

## 2 · The darker-edge test — and what the profile shows

**Criterion: saturation > 0.30 AND luminance below the fill's 153.4.**

> ✅ **`AppIcon-512@2x.png`: ZERO. Confirmed again, now looking for the opposite thing.**
> 🔴 **The three 28-August web icons: 228, 257 and 150 darker pixels — a ring.**

**Values found:** `#EE841F` (lum 147.2, **−6.2**), `#EE831E` (146.5, **−6.9**), `#EE8420`, `#EE8521`,
`#EE8623`. **Darker and more saturated than `#EF8B2C` — less blue, so it reads as a deeper orange.**

### The edge profile — 🔴 this is ringing, not a drawn stroke

**`public/icons/icon-512.png`, crossing the bolt's right edge:**

```
x=312  #EF8B2C   fill
x=313  #EF8D2F   +1.6
x=314  #EE841F   -6.2   ← DARK UNDERSHOOT, inside the edge
x=315  #F8CDA4  +57.8   ← LIGHT OVERSHOOT, outside it
x=316  #FFFFFF  white
x=317  #FFFDFC  +100.0  ← a faint RIPPLE beyond the edge
x=318  #FFFFFF  white
```

**`public/apple-touch-icon.png`, left edge — the same shape mirrored:**

```
x=64   #FFFDFC   ← ripple
x=65   #FFFFFF
x=66   #FAD9BA   ← light overshoot
x=67   #EE8623   -4.4  ← DARK UNDERSHOOT
x=68   #EF8C2E   +0.9
x=69   #EF8B2C   fill
```

**Against the native icon, same test, same shape:**

```
x=629  #EF8B2C  fill
x=630  #EF8D30  +1.7
x=631  #FDF0E3  +88.4
x=632  #FFFFFF  white          ← monotonic. No undershoot. No ripple.
```

> 🔴 **Undershoot → overshoot → ripple is Gibbs ringing: the fingerprint of a sharpening resample
> (Lanczos / bicubic-sharper). Nobody drew a stroke; a downscaler manufactured one.**

---

## 3 · Which file the iOS build consumes

**From the repository:** the native build takes **`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`**,
because `Contents.json` names it and **it is the only app icon in the project**. **No build step generates
the catalogue** — there is no assets config, no convention directory and no tooling dependency.

> ✅ **So the NATIVE app ships the clean file.** That is established from the repo.

🔴 **BUT THE REPO CANNOT TELL ME WHAT IS INSTALLED ON HIS PHONE**, and that is the actual question.

### What to look at, in order — the first is 10 seconds

1. 🔴 **Is it the app, or a Safari web clip?** **Long-press the icon.** A native app offers **"Delete
   App"** and **"Remove from Home Screen"**; a web clip offers **"Delete Bookmark"**. Alternatively
   **Settings → General → iPhone Storage** lists native apps only.
   ⚠️ **The label does not discriminate: `CFBundleDisplayName` is `HatchGrab` AND `siteName` for
   hatchgrab.com is `HatchGrab` (`app/layout.tsx:26`), so both read "HatchGrab".**
2. **If it is the native app:** open `ios/App/App.xcworkspace`, select the `App` target → **General → App
   Icons**, and confirm the source is `AppIcon` and not an overridden `ASSETCATALOG_COMPILER_APPICON_NAME`.
   Then check for a second `.xcassets` added outside this repo.
3. **If it is a web clip:** the icon is `apple-touch-icon.png` and §2 has already found the ring.

### Why a web clip is the strong hypothesis

**`app/layout.tsx:80` and `:84` set `apple: "/apple-touch-icon.png?v=2"`, and `public/manifest.json`
lists all three affected files.** **An "Add to Home Screen" from hatchgrab.com produces a "HatchGrab"
label and this icon — 180px shown at ~60pt on a 3× screen, i.e. very near 1:1, so the ring renders at
full strength rather than being averaged away.**

---

## 4 · The vector master — no stroke

**`public/icons/hatchgrab-icon.svg`, read in full. Every element:**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
<rect width="1024" height="1024" fill="#0F172A"/>
<g transform="translate(374.804,153.600) scale(716.8000)">
<path d="M0.3014 0 L0 0.5625 H0.185 L0.0814 1 L0.3828 0.40625 H0.1978 Z" fill="#EF8B2C"/>
```

| | |
|---|---|
| `stroke` / `stroke-width` anywhere in the file | ❌ **NO** — the string "stroke" does not appear |
| Number of `<path>` elements | **1** — no second path behind the first |
| The path's full attribute list | **`d` and `fill="#EF8B2C"`. That is all.** |

> ✅ **The master is a single filled path with no stroke.** So this is **not** the reverse situation: the
> PNG export did not drop a stroke, **it invented one.**

⚠️ **And the master's background is `#0F172A`, not white** — so none of the white-background rasters was
produced from it unchanged.

---

## 5 · Every asset with a darker outline

| Asset | Darker ring? |
|---|---|
| 🔴 `public/apple-touch-icon.png` | **YES — 228 px** |
| 🔴 `public/icons/icon-512.png` | **YES — 257 px** |
| 🔴 `public/icons/icon-192.png` | **YES — 150 px** |
| `ios/…/AppIcon-512@2x.png` | **No — 0** |
| All 45 Android launcher PNGs (`src/` and `build/`) | **No — 0 in every one** |
| `public/icons/icon-512-maskable.png` | Its "darker" pixels are the **`#0F172A` background** (254,957 of them), not a ring |

> 🔴 **THE RING IS EXACTLY AND ONLY IN THE THREE FILES DATED 28 AUGUST 18:17** — the PWA / web-clip set,
> committed in `7ee844f "ipad app post updates"`. **The shared timestamp identifies the generation
> event: they were produced together, by a tool that sharpens on downscale.**

---

## 6 · What would remove it

**Only once the device question in §3 is answered. If it is the web clip — which the pixels point to:**

1. **Regenerate all three from `public/icons/hatchgrab-icon.svg`** by **rendering the SVG directly at each
   target size** (180, 192, 512) rather than downscaling a large raster. **A vector rendered at the target
   size cannot ring, because there is no resampling step.**
2. **If a raster downscale is unavoidable, use a non-sharpening filter** (box or plain bilinear/Lanczos
   with sharpening off). ⚠️ **The sharpening is the cause; the source is not at fault.**
3. **Bump the cache-buster.** `?v=2` is already in `layout.tsx` and `manifest.json`; **it must go to `?v=3`
   or the old icon survives indefinitely — the file's own comment says exactly this**, and a home-screen
   web clip caches even harder than a favicon. 🔴 **An operator would also need to remove and re-add the
   icon.**
4. **While regenerating, settle the background.** The master is `#0F172A`; these three are white. **A
   design decision, not mine.**

**If it turns out to be the native app**, then the ring is not in any file I can see, and the next step is
Xcode's built product — **not another change to the source PNG**.

---

## What I could not establish

1. 🔴 **Whether the icon on his phone is the native app or a Safari web clip.** **This is the whole
   question, the label does not discriminate, and the long-press in §3 settles it in seconds.**
2. **What produced the 28 August files.** No script, no dependency — **done by hand with an external
   tool.** The ringing says it sharpened; it does not say which tool.
3. **Whether the installed build's compiled asset catalogue matches the repo file** — only Xcode or the
   built `.app` shows that.
4. **Whether the same ring is visible on Android**, where the same three files are irrelevant and all 45
   launcher assets are clean.
