# Launch screen — Capacitor's logo replaced with the HatchGrab wordmark

Date: 14 August 2026
**EDITED: 3 binary files.** `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732{,-1,-2}.png`
**NO text file was edited. The storyboard, `Contents.json` and `project.pbxproj` are untouched.**

No `next dev`, no `next build`, no `cap sync`, no deploy, no archive, no commit.
`@capacitor/splash-screen` **NOT installed**; the inert `SplashScreen` config block **left alone**.

**No span of the prompt arrived garbled.** ⚠️ **One instruction conflicts with its own stated purpose
(the background colour) and one stated fact is wrong (the brand orange). Both are set out below with
what I did and why.**

---

# 🔴 TWO CORRECTIONS BEFORE THE WORK

## 1. The brand orange is **`#EF8B2C`**, not `#EA580C` — and the difference is recorded doctrine

**The brief states: *"Manual section 27 records the brand orange as #EA580C."*** **The artwork does not
use it.** READ, from all three HatchGrab SVGs:
```
public/logos/hatchgrab-wordmark.svg        colours: #16314F #EF8B2C
public/logos/hatchgrab-wordmark-white.svg  colours: #EF8B2C #FFFFFF
public/icons/hatchgrab-icon.svg            colours: #0F172A #EF8B2C
```
**And `lib/brand.ts:36-53` settles it:**
```
// 🔴 THE AUTHORITATIVE SOURCE IS THE ARTWORK, NOT A SCREENSHOT. #EF8B2C is the literal `fill` on the
// (The companion navy is #16314F, defined here for reference only; nothing uses it yet.)
// INHERIT FROM HERE. The app's orange-600 (#ea580c, 3.56:1) is already a recorded accessibility
export const HATCHGRAB_ORANGE_HEX = '#EF8B2C'
export const HATCHGRAB_NAVY_HEX   = '#16314F'
```
🔴 **`#EA580C` IS TAILWIND `orange-600` — THE APP'S ACTION COLOUR, NOT THE BRAND MARK.** And the manual
records a prior incident of exactly this confusion (`:567`):
> *"THE HERO ILLUSTRATION WAS REPLACED TO CLOSE A TWO-ORANGE DRIFT. The previous artwork hardcoded
> `fill="#EA580C"` — the **app's** action [colour]…"*

✅ **I did not re-tint anything.** The wordmark is composited **as authored**, so its orange is `#EF8B2C`
by construction. **Had I followed the brief's figure, I would have re-created the drift that artwork
replacement was done to close.**

## 2. ⚠️ The background instruction conflicts with its own purpose. I served the purpose and am flagging it.

The brief says: *"Background: solid, **matching the app's first screen so the handoff to the WebView does
not flash**. Check what **the dashboard's page background** actually is and use that."*

**All three values, READ, not guessed:**

| Surface | Value | When it appears |
|---|---|---|
| **`/app`** — `app/app/page.tsx:80` `min-h-screen bg-slate-900` | **`#0F172A`** | 🔴 **the ACTUAL first screen on cold launch** |
| Native host view — `HGBridgeViewController` / `capacitor.config.ts:30` | `#1C1C1E` | between the launch screen and the WebView |
| **Dashboard** — `page.tsx:2596` `bg-slate-50` | `#F8FAFC` | **third**, after `/app` routes |

🔴 **The two halves of the instruction point at different colours.** Using the dashboard's `#F8FAFC`
gives near-white → `#1C1C1E` → `#0F172A` → near-white: **a flash in both directions**, which is what the
sentence says to avoid. Using `#0F172A` gives near-black → `#1C1C1E` → **identical** → light: **no flash
until the dashboard genuinely loads.**

✅ **I used `#0F172A`, and it is not a judgement call about colour: it is the ground of the existing
brand asset.** `public/icons/hatchgrab-icon.svg` is already `<rect … fill="#0F172A"/>` behind the orange
mark — **the brand system had already made this decision, so I inherited it rather than inventing one.**

⚠️ **If you want the dashboard's `#F8FAFC` instead, it is one constant and a re-run** — the generator is
saved at `<scratchpad>/gen-splash.js`. **Say so and I will regenerate.**

---

# PART A — THE ASSETS

## A1. Every HatchGrab candidate in the repo

| Path | Dimensions | Format | Transparency | Modified |
|---|---|---|---|---|
| 🔴 `public/logos/hatchgrab-wordmark-white.svg` | **vector**, viewBox `21 39 1287 283` | SVG | n/a — vector | 30 Jul |
| `public/logos/hatchgrab-wordmark.svg` | **vector**, same viewBox | SVG | n/a | 30 Jul |
| `public/icons/hatchgrab-icon.svg` | **vector**, viewBox `0 0 1024 1024` | SVG | **opaque** — has its own `#0F172A` rect | 30 Jul |
| `public/logos/hatchgrab-logo.png` | 640 × 141 | PNG | ✅ **RGBA** | 30 Jul |
| `public/logos/hatchgrab-logo-white.png` | 640 × 141 | PNG | ✅ RGBA | 30 Jul |
| `public/logos/hatchgrab-logo@1x.png` | 320 × 70 | PNG | ✅ RGBA | 30 Jul |
| `public/logos/hatchgrab-logo-white@1x.png` | 320 × 70 | PNG | ✅ RGBA | 30 Jul |
| `public/apple-touch-icon.png` | 180 × 180 | PNG | ❌ RGB | — |

⚠️ **THE BRIEF SAYS "HatchGrab logo files have been uploaded to this repo. Find them" — implying a NEW
upload. THERE ISN'T ONE.** Every HatchGrab asset is dated **30 July**, and the icon **30 July 17:43**.
🔴 **NOT FOUND: any brand file newer than that.** **If you uploaded something today, it did not land in
this repo** — and what I used instead is the existing vector artwork, which is the better source anyway.

## A2. ✅ THE STOP CONDITION DOES NOT APPLY — the best source is VECTOR

**`public/logos/hatchgrab-wordmark-white.svg`.** Reasons, in order:

1. 🔴 **It is an SVG, so 2732 px is not "scaling" at all — it is rasterised at the target size.** The
   soft-when-scaled risk the brief warns about **does not arise**. Had the only candidates been the
   640×141 PNGs, **I would have stopped**, exactly as instructed: 640 → 900 px is a 1.4× upscale on a
   logo edge, and a blurry wordmark is worse than Capacitor's crisp one.
2. **White variant, because the ground is dark.** The navy variant's `#16314F` would nearly vanish on
   `#0F172A`.
3. **It is the full lockup** — the same asset `AppHeader` uses, so the launch screen and the app header
   show the same mark.

⚠️ **`hatchgrab-icon.svg` was the runner-up** and is arguably the more "app-like" choice — square, and
already designed for a tile. **I chose the wordmark because it names the product**, which is what a
reviewer opening an unfamiliar app needs. **A defensible alternative, not an obvious one.**

## A3. Mismatch flagged — see correction 1. **The logos use `#EF8B2C`; `#EA580C` appears in none of them.**

---

# PART B — THE REPLACEMENT

## B1. The storyboard's reference — quoted, and **unmodified**

```xml
<imageView key="view" userInteractionEnabled="NO" contentMode="scaleAspectFill" horizontalHuggingPriority="251" verticalHuggingPriority="251" image="Splash" id="snD-IY-ifK">
…
<image name="Splash" width="1366" height="1366"/>
```
**`image="Splash"` resolves to `ios/App/App/Assets.xcassets/Splash.imageset/`, whose `Contents.json`
names the three files:**
```json
{ "idiom": "universal", "filename": "splash-2732x2732-2.png", "scale": "1x" },
{ "idiom": "universal", "filename": "splash-2732x2732-1.png", "scale": "2x" },
{ "idiom": "universal", "filename": "splash-2732x2732.png",   "scale": "3x" }
```
⚠️ **The storyboard declares `1366 × 1366` while the files are `2732 × 2732`** — generator residue,
**cosmetically irrelevant under `scaleAspectFill`, and left alone** because B3 forbids touching the
storyboard.

## B2. What was generated

| Property | Value |
|---|---|
| Canvas | **2732 × 2732**, RGBA |
| Background | **`#0F172A`** solid, edge to edge — verified by pixel probe at two opposite corners |
| Logo | `hatchgrab-wordmark-white.svg` rasterised at **900 × 198** |
| Position | **centred** — placed at `(916, 1267)`, so the box spans x 916-1816, y 1267-1465 |
| Text | **none** beyond the lockup itself |

🔴 **THE CROP MATHS, so "central third" is a measured claim and not a hope.** With `scaleAspectFill` on
an iPad 10th gen (1180 × 820 pt), the square is scaled to 1180 × 1180 and **69.5% of the other axis
survives in both orientations** — the guaranteed-visible region is the central **~69.5%**. The logo box
occupies **33.0% of the width and 7.2% of the height, centred**, so it sits **well inside** that region
on every device and orientation. ✅ **Nothing is near an edge.**

**Verification by pixel probe, not by eye:**
```
  corner (10,10)      : #0F172A
  corner (2722,2722)  : #0F172A
  centre (1366,1366)  : #FFFFFF   <- inside the logo lockup
  channels: 4   size: 2732x2732
```

## B3. ✅ The storyboard was NOT modified. Only the three image files changed.

## B4. Before and after

| File | Before | After |
|---|---|---|
| `splash-2732x2732.png` | 41,273 bytes · 2732×2732 · **RGB** · sha `1b5002b74a55` | **57,598 bytes · 2732×2732 · RGBA · sha `50e8f0aeee9b`** |
| `splash-2732x2732-1.png` | 41,273 · identical | **57,598 · identical** |
| `splash-2732x2732-2.png` | 41,273 · identical | **57,598 · identical** |

✅ **All three remain byte-identical to each other**, as they were before — the imageset lists the same
file at 1x/2x/3x, which is how Capacitor's generator emits it and how the storyboard expects it.
⚠️ **+16,325 bytes each (+40%)** — a larger PNG because a dark field with anti-aliased type compresses
less well than a white field with a small mark. **Trivial at 57 KB.**

---

# PART C — WILL IT SHIP?

## C1. ✅ REFERENCED **AND** IN THE TARGET — both halves checked

1. **Referenced:** the storyboard names `Splash`; `Contents.json` names the three files; **the filenames
   did not change**, so the reference cannot have broken.
2. 🔴 **In the build — the half that failed for the privacy manifest, checked the same way:**
```
:16    504EC30F1FED79650016851F /* Assets.xcassets in Resources */ = {isa = PBXBuildFile; …};
:154            504EC30F1FED79650016851F /* Assets.xcassets in Resources */,
```
✅ **`Assets.xcassets` has both a `PBXBuildFile` and an entry in `PBXResourcesBuildPhase`** — the whole
catalogue ships, so a replaced file inside it ships with it. **No project change was needed, which is
why none was made.**

## C2. ✅ NOTHING ELSE IN `ios/App` CHANGED

```
$ git status --porcelain ios/
 M ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png
 M ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png
 M ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png
```
🔴 **Three PNGs. Nothing else.** And the file carrying the four hand-authored privacy-manifest lines:
```
$ shasum -a 256 ios/App/App.xcodeproj/project.pbxproj  →  37ab01848404c6ee…   (unchanged)
```
✅ **`project.pbxproj` is byte-identical.** `Contents.json` and `LaunchScreen.storyboard` are both absent
from `git status`.

## C3. 🔴 A `cap sync` AND A REBUILD ARE REQUIRED, AND NOTHING HAS BEEN VERIFIED BY BUILDING

**The device is running the binary built earlier today, which contains the Capacitor splash.** The new
PNGs are on disk only.

**Nothing was run:** no `cap sync`, no `xcodebuild`, no install, no archive. ⚠️ **I looked at the
generated PNG and it is correct as an image; I have not seen it on a device, at any size, in either
orientation.** 🔴 **A crop that looks safe in arithmetic is not a crop that has been observed.**

⚠️ **And §36's standing warning applies to the next sync:** re-check that the four
`PrivacyInfo.xcprivacy` lines in `project.pbxproj` still resolve afterwards.

---

# PART D — INTEGRITY

## D1. The binary tool, and the guarantee that no text processing touched the bytes

**`sharp` 0.34.5** (already a dependency — **nothing was installed**), driven by a small Node script.
**The critical properties:**
```js
  const svg = fs.readFileSync(SRC)                    // read as a Buffer, never as a string
  const logo = await sharp(svg, { density: 600 }).resize({ width: LOGO_W }).png().toBuffer()
  const out  = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: BG } })
    .composite([{ input: logo, left, top }])
    .png({ compressionLevel: 9 })
    .toBuffer()
  for (const f of FILES) fs.writeFileSync(path.join(OUT_DIR, f), out)
```
🔴 **`readFileSync` with no encoding returns a Buffer; every intermediate is a Buffer; `writeFileSync`
writes a Buffer.** **At no point is image data a JavaScript string**, so no encoding, newline
translation or codepoint substitution can occur. ⚠️ **No shell redirection, no `sed`, no `cat`, no
heredoc touched these files** — which is the failure mode this rule exists to prevent.

✅ **A byte-identical backup of the three originals is in `<scratchpad>/splash-backup/`.**

## D2. 🔴 **NO TEXT FILE WAS EDITED. Stated explicitly, as required.**

The storyboard, `Contents.json` and `project.pbxproj` were **read and not written** — all three are
absent from `git status`. **There is therefore no text file to byte-scan for NUL bytes.**

⚠️ **For completeness, the three binaries are PNGs and DO contain NUL bytes by format** — a PNG header
begins `89 50 4E 47 0D 0A 1A 0A` and IHDR length fields are NUL-padded. **That is correct and expected;
the NUL rule is about text files, where a NUL makes the file invisible to grep.** **Scanning a PNG for
NULs would be a category error, so it was not done.**

## D3. This report — separate post-write pass

*(Run after the file was on disk; result stated in the session output.)*

## D4. `git status` and `git diff --stat`

```
$ git status --porcelain
 M app/dashboard/[token]/kds/page.tsx
 M app/dashboard/[token]/page.tsx
 M components/dashboard/AddOrderPanel.tsx
 M components/native/OfflineBanner.tsx
 M docs/reference-manual.md
 M ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-1.png    <- THIS TASK
 M ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-2.png    <- THIS TASK
 M ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png      <- THIS TASK
?? docs/offline-messaging-report.md
?? docs/offline-order-number-report.md
?? docs/refund-investigation-report.md
```
**`git diff --stat` reports the three PNGs as `Bin 41273 -> 57598 bytes` each; the text files listed
above are earlier tasks'. Nothing committed.**

---

# WHAT REMAINS UNVERIFIED

1. 🔴 **Never seen on a device.** The crop safety is arithmetic (B2); the colour handoff is reasoned from
   three READ values. **Neither has been observed.**
2. ⚠️ **The background colour is the one open decision** (correction 2). `#0F172A` serves the stated
   purpose and matches the existing brand icon; `#F8FAFC` is what the instruction's second sentence
   names. **One constant, one re-run.**
3. ⚠️ **The logo occupies 33% of the width** — literally "the central third". **On a device it may read
   as small.** Widening it is the same one-line change, and the crop budget (69.5%) leaves plenty of
   room.
4. **No newly-uploaded brand file was found** (A1). If one was intended, it is not in this repo.
5. **The storyboard's `1366 × 1366` declaration is still wrong** and still harmless. **Out of scope.**
6. **`@capacitor/splash-screen` remains uninstalled and the config block untouched**, so
   `launchShowDuration: 1000` remains inert — **the splash still disappears as soon as the first frame
   is ready, which is what we want.**
