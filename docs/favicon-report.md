# One icon everywhere — the browser-facing set

**WHICH OF THE THREE I PERFORMED: ALL THREE — a PARSE, a TYPECHECK, and an EXECUTION.**
- **Parse** — every path, reference and colour quoted here is read from a file on disk.
- **Typecheck** — `npx tsc --noEmit`, clean.
- **Execution** — every raster asset was **decoded and sampled pixel by pixel** (corner, centre, and
  the orange bounding box) with `sharp`; the `.ico` containers were parsed by hand, before and after;
  the **running dev server was queried on both hosts** to see what the browser is actually told; and
  **all 49 native asset files were SHA-256 fingerprinted before and after**.

**NO DEPLOY. NO MIGRATION. NO NATIVE ASSET TOUCHED** — proven in §5.
**Nothing in the prompt arrived garbled, and I found no contradiction between instructions.**
🔴 **Two findings change the shape of the job: the declared favicon was not the bolt at all, and one
asset cannot be produced without redrawing — I stopped on it, per your item 2. §2 and §4.**

---

## 1. THE INVENTORY

### `public/` — browser-facing

| Path | Dimensions | Bytes | Variant | Referenced from |
|---|---|---|---|---|
| `favicon.ico` | 16, 32, 48 | 1,719 | 🔵 **`#0F172A`** | **nothing declared it** — served at `/` and taken as the implicit fallback |
| `apple-touch-icon.png` | 180 × 180, no alpha | 2,066 | 🔵 **`#0F172A`** | `app/layout.tsx` `icons.apple`; `manifest.json` |
| `icons/icon-192.png` | 192 × 192 | 2,337 | 🔵 **`#0F172A`** | 🔴 **nothing** |
| `icons/icon-512.png` | 512 × 512 | 7,141 | 🔵 **`#0F172A`** | 🔴 **nothing** |
| `icons/icon-512-maskable.png` | 512 × 512 | 5,832 | 🔵 **`#0F172A`** | 🔴 **nothing** |
| `icons/hatchgrab-icon.svg` | viewBox 0 0 1024 1024 | 297 | 🔵 `#0F172A` + `#EF8B2C` | 🔴 **nothing** — the "master" |
| `og.image.png` | 856 × 1328 | 232,050 | 🔵 `#0F172B` | 🔴 **nothing** |
| `logos/village-foodie logo-sharing.png` | 2397 × 1270 | **3,856,486** | dark `#161B31` | `openGraph.images` **and** `twitter.images`, **on both hosts** |
| `logos/hatchgrab-logo@1x.png` | 320 × 70 | 9,227 | transparent, navy ink | email/wordmark use |
| `logos/hatchgrab-logo-white@1x.png` | 320 × 70 | 7,814 | transparent, white ink | email/wordmark use |

### `ios/` — the app icon set (**not touched**)

| Path | Dimensions | Bytes | Variant |
|---|---|---|---|
| `Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` | **1024 × 1024, no alpha** | 16,103 | ⚪ **WHITE background**, orange bolt |
| `Assets.xcassets/Splash.imageset/splash-2732x2732*.png` ×3 | 2732 × 2732 | 57,598 each | 🔵 `#0F172A`, white centre |

### `android/` — mipmaps (**not touched**), 15 files

| Family | Dimensions | Variant |
|---|---|---|
| `ic_launcher.png` · `ic_launcher_round.png` (5 densities each) | 48 → 192 | ⚪ **WHITE background**, orange bolt |
| `ic_launcher_foreground.png` (5 densities) | 108 → 432 | **transparent**, orange bolt |
| `drawable-*/ic_stat_hatchgrab.png` (5) | notification | white-on-transparent silhouette |
| `drawable-*/splash.png` (11) | splash | 🔵 dark |

### 🔴 THERE IS NO SINGLE SOURCE, AND THE VARIANTS HAVE DRIFTED IN THREE DIRECTIONS

**Measured, not assumed** — the orange bolt's height as a fraction of its canvas:

| Asset | Background | Bolt height |
|---|---|---|
| `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` | 🔵 `#0F172A` | **66.7 – 68.8 %** |
| `icon-512-maskable.png` | 🔵 `#0F172A` | **50.4 %** |
| **iOS `AppIcon-512@2x.png`** | ⚪ **white** | **80.3 %** |
| **Android `ic_launcher.png`** | ⚪ **white** | **66.7 %** |
| Android `ic_launcher_foreground.png` | transparent | 54.2 % |

**The two native platforms moved to white; the web set never did.** The manual records the iOS move
(V11.42, 15 August 2026 — *"the iOS icon moved to a light background"*), and it supersedes the
dark-background rule in §38. **The web set is what was left behind**, and `icons/hatchgrab-icon.svg`,
the nominal master, still specifies `#0F172A`.

🔴 **AND THE TWO WHITE ONES DO NOT AGREE EITHER: iOS is 80.3 %, Android is 66.7 %.** Same artwork, same
colours, **different scale in the square.** Item 3 forbids touching either, so that drift stands.

---

## 2. 🔴 THE DECLARED FAVICON WAS NOT THE BOLT — IT WAS A TRUCK EMOJI

`app/layout.tsx` declared, on **both** hosts:

```ts
icon: "data:image/svg+xml;utf8,…%3Ctext y='.9em' font-size='90'%3E🚚%3C/text%3E…",
```

**Confirmed against the running server** — that data URI was the only `rel="icon"` emitted.

**So what were you seeing?** `public/favicon.ico` — the blue bolt. It is served at `/` whatever the
metadata says, and browsers fall back to it whenever the declared icon fails to render; **an SVG
data-URI favicon is exactly the case Safari does not handle.** 🔴 **Fixing either one alone would have
changed nothing**: replacing the emoji leaves `favicon.ico` as the fallback; replacing `favicon.ico`
leaves the emoji winning where it does render. **Both were replaced.**

### ⚠️ AND THE ICON WAS SHARED BETWEEN TWO BRANDS

`generateMetadata` already branches on the host for the name, description, base URL and OG data — but
**not for icons.** A 🚚 is right for Village Foodie, a consumer directory of food trucks, and wrong for
HatchGrab. **Making one icon serve both would have put HatchGrab's mark on villagefoodie.co.uk.**

**So `icons` now branches too, following the pattern the file already uses.** Village Foodie keeps the
emoji; HatchGrab gets the bolt.

⚠️ **ONE CROSS-BRAND LEAK SURVIVES AND IS NOT NEW.** `/favicon.ico` and `/apple-touch-icon.png` are
static files at the root of **both** hosts. A browser that falls back to the implicit `/favicon.ico` on
villagefoodie.co.uk gets the HatchGrab bolt — as it got the blue bolt before. **The colour changed; the
leak did not.** Closing it needs per-host static routing, which is outside this brief.

---

## 3. WHAT CHANGED

**Source: `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`** — 1024 × 1024, white,
no alpha. **Read only; never written to.** It is the white mark you named, and the only white asset
large enough that **every size needed is a downscale** — no upscaling, no redraw, no recolour.

| File | Before | After |
|---|---|---|
| `public/favicon.ico` | 16/32/48, corner `rgb(15,23,42)`, 1,719 B | **16/32/48, corner `#ffffff`, 1,860 B** |
| `public/apple-touch-icon.png` | 180 × 180, `#0f172a` | **180 × 180, `#ffffff`, 3,161 B** |
| `public/icons/icon-192.png` | 192 × 192, `#0f172a` | **192 × 192, `#ffffff`, 3,367 B** |
| `public/icons/icon-512.png` | 512 × 512, `#0f172a` | **512 × 512, `#ffffff`, 10,352 B** |
| `public/icons/icon-512-maskable.png` | 512 × 512, `#0f172a` | 🔴 **UNCHANGED — §4** |

**Every reference, before and after:**

| Reference | Before | After |
|---|---|---|
| `layout.tsx` `icons.icon` (HatchGrab) | 🚚 emoji data URI | `/favicon.ico?v=2`, `/icons/icon-192.png?v=2`, `/icons/icon-512.png?v=2` |
| `layout.tsx` `icons.icon` (Village Foodie) | 🚚 emoji data URI | **unchanged — 🚚 emoji** |
| `layout.tsx` `icons.apple` (both) | `/apple-touch-icon.png` | `/apple-touch-icon.png?v=2` |
| `manifest.json` `icons` | one entry, `/apple-touch-icon.png` 180 | **three**: `icon-192`, `icon-512`, `apple-touch-icon`, all `?v=2`, `purpose: any` |
| `app/domain/page.tsx` `icons.icon` | the **truck's own** logo | **unchanged** — correct and deliberate |

**Executed, from the running server:**

```
HATCHGRAB   <link rel="icon" href="/favicon.ico?v=2" sizes="16x16 32x32 48x48" type="image/x-icon"/>
            <link rel="icon" href="/icons/icon-192.png?v=2" sizes="192x192" type="image/png"/>
            <link rel="icon" href="/icons/icon-512.png?v=2" sizes="512x512" type="image/png"/>
            <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2"/>
VILLAGE FOODIE  <link rel="icon" href="data:image/svg+xml;…🚚…"/>   ← unchanged
```

**The new `.ico` decoded entry by entry** — a valid 3-image PNG-in-ICO container:

```
  16×16  white 87%  orange 4%      32×32  white 90%  orange 5%      48×48  white 92%  orange 6%
```

---

## 4. 🔴 THE MASKABLE ICON — I STOPPED, AS YOUR ITEM 2 INSTRUCTS

`icon-512-maskable.png` carries the bolt at **50.4 %**, not the full-bleed 66-80 %, because a maskable
icon is cropped to a circle by the OS and needs a safe zone. **The white mark does not exist at that
composition anywhere in the repo.**

Producing one means **taking the white icon and re-compositing the bolt smaller on a larger white
field.** That is not a resize — it is a redraw of the layout, and the 52 % figure is a design decision
recorded in §38, not something to re-derive. **Your item 2 says say so and stop rather than generate
one, so I did.**

**Consequence, stated: the file is unchanged and still blue — but nothing references it.** It was
referenced by nothing before, and I did not add it to the manifest. **No surface shows it.** ⚠️ Android
will therefore mask the `purpose: "any"` 512 icon itself when a PWA is installed, and may clip the
bolt's corners. **One instruction from you and I will produce the maskable.**

---

## 5. 🔴 PROOF THAT NO NATIVE APP ICON CHANGED

All 49 files under `ios/App/App/Assets.xcassets` and `android/app/src/main/res` were SHA-256
fingerprinted **before** any edit and re-verified **after**:

```
  files fingerprinted: 49
  49 OK        ← every one byte-identical
```

That covers the **iOS asset catalogue** (`AppIcon-512@2x.png`, all three splash images, every
`Contents.json`) and **all 15 Android mipmaps** plus the notification icons, splash drawables and
`ic_launcher` XML. **The iOS icon was opened for reading only, as the source.**

⚠️ `git status` shows `ios/App/App/Info.plist`, `ios/.../project.pbxproj`, the `ic_stat_hatchgrab`
PNGs and `android/SIGNING.md` as modified or untracked. **All are pre-existing from earlier sessions**
and none is an app icon; the fingerprint check above is what proves this workstream changed none of
them.

### Do the natives match the white mark? — reported, not changed

| | Background | Bolt scale | Matches the new web set? |
|---|---|---|---|
| **iOS `AppIcon-512@2x.png`** | ⚪ white | 80.3 % | ✅ **it IS the source** |
| **Android `ic_launcher`** | ⚪ white | **66.7 %** | ⚠️ same artwork and colours, **smaller in the square** |
| Android `ic_launcher_foreground` | transparent | 54.2 % | ⚠️ adaptive; correct for its purpose |
| Both splash screens | 🔵 `#0F172A` | — | ⚠️ still dark. Not an icon; out of scope |

---

## 6. CACHING — WHAT I DID, AND WHAT YOU MUST DO

**A favicon is among the most aggressively cached things a browser holds** — often for the life of the
profile, and independently of a normal reload.

**What I did:** every metadata- and manifest-referenced icon carries **`?v=2`**. A changed URL is the
only reliable cache bust; a same-name replacement is not. **The files themselves are also replaced**,
because the implicit `/favicon.ico` request the browser makes at the root carries no query string and
there is nowhere to put a version in it.

**To see it locally:**
1. Restart `npm run dev` — Next caches static metadata output.
2. Visit **`http://hatchgrab.localhost:3000/`** (`localhost` alone renders Village Foodie — see the
   earlier landing-page note).
3. **A hard reload is not enough for a favicon.** Either open the icon directly —
   `http://hatchgrab.localhost:3000/favicon.ico?v=2` — and reload **that** tab, or open a private
   window, or clear site data for the host in DevTools → Application → Storage.
4. ⚠️ **The tab may keep the old icon for a while regardless.** Chrome holds favicons in a separate
   database that survives a normal cache clear.

---

## 7. WHAT REMAINS UNOBSERVED

1. 🔴 **NO BROWSER TAB WAS LOOKED AT.** I have proven what the server sends, what the files contain
   pixel by pixel, and that the `.ico` decodes at all three sizes. **I have not seen the icon render.**
   The one thing this workstream is about is a visual outcome, and it is the one thing I cannot check.
2. 🔴 **THE 16 × 16 IS THE RISK, AND IT IS UNVERIFIED.** The source is 1024 × 1024 downscaled 64×. At
   16 px the bolt is roughly 4 % of the pixels and the white ground is 87 %. §38 warns that the
   wordmark failed at this size for exactly this reason. **Look at the 16 px before trusting it** — if
   it reads as a smudge, it needs a hand-tuned small size, which is a redraw and outside this brief.
3. ⚠️ **The maskable is unchanged and still dark.** §4.
4. ⚠️ **`icons/hatchgrab-icon.svg`, the nominal master, still says `#0F172A`** and now disagrees with
   every raster derived from it. **Changing it is a recolour, which item 2 forbids** — so it is
   reported. Nothing references it.
5. ⚠️ **HatchGrab's link previews still show the Village Foodie logo.** `openGraph.images` and
   `twitter.images` point at `logos/village-foodie logo-sharing.png` on **both** hosts — a 3.86 MB file.
   Not a favicon, so out of scope, but it is the link-preview image your item 1 asked me to enumerate.
6. ⚠️ **`manifest.json` is titled "Village Foodie Kitchen" / "VF Kitchen" on both hosts**, so an
   installed HatchGrab PWA is named for the other brand. Out of scope; recorded.
7. **`og.image.png` (232 KB, dark) is referenced by nothing** and may be dead.
