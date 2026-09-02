# Removing a truck logo, and the iOS app icon

**Part One built. 🔴 PART TWO: NOTHING CHANGED — the defect it describes is not in the assets, and §6-§8
say why, with measurements.**
**NOT deployed, NOT committed. No SQL, no migrations.**

---

## VERIFICATION

**EXECUTION.** Part Two's pixel claims come from a **PNG decoder written for this task** (zlib inflate +
per-scanline unfiltering) — every icon was **decoded and its pixels counted**, and the iOS icon was also
opened and looked at. **No claim here rests on a filename or a tool's report.**

**`npx tsc --noEmit` clean — SANITY ONLY, not verification.**
🔴 **Part One was NOT exercised**: `/manage` is behind a session I do not have (`proxy.ts:305`), so the
remove control has not been clicked.

**No span of the prompt arrived garbled. No instruction contradicted another.**

---

# PART ONE — removing a truck logo

## 1 · How the logo is stored, rendered, and what happens when it is absent

| | |
|---|---|
| **Column** | `trucks.logo_storage_path` (nullable text) |
| **Storage** | Supabase `truck-media` bucket; the public URL is `${SUPABASE_URL}/storage/v1/object/public/truck-media/<path>` |
| **Uploaded by** | `uploadLogo` (`app/manage/[token]/page.tsx:9211`) — `get_upload_url` → PUT → `setForm` **before** the write → `api('update_settings', { logo_storage_path: path })`. **Already optimistic** |
| **Resolved by** | 🔴 **`lib/truck-logo.ts:26` — `if (!logoStoragePath) return null`.** One resolver, four call sites |

### ✅ The null path is designed for, not accidental — and the file says so

**`lib/truck-logo.ts:5-14`** records that a fallback to `discovery_trucks.logo_url` **was deliberately
removed**, in its own words:

> *"That made REMOVAL IMPOSSIBLE TO SEE — an operator who cleared the logo in Settings watched the header
> keep showing one… 'Removed' and 'never uploaded' are the same row, so no fallback can honour both; the
> setting the operator can actually reach wins."*

⚠️ **So the null path was written FOR this feature — but you are right that it may never have run**, and
I could not confirm any truck has ever had a null value (that needs SQL). **What I could confirm is that
every renderer guards it — §5.**

**And the write works:** `update_settings` allowlists `logo_storage_path` (`api/manage/route.ts:1407`) and
filters on `val !== undefined` (`:1416`), so **`null` survives and is written**. Verified by reading the
filter, not assumed.

## 2 · The control, and what it does with the file

**Added `removeLogo` beside `uploadLogo`, and a "Remove logo" button in the Settings logo card — rendered
only when there is a logo to remove** (a disabled button on a truck that never had one is an affordance
with nothing behind it).

> 🔴 **IT CLEARS THE REFERENCE AND LEAVES THE FILE IN STORAGE.** Three reasons, in order:
>
> 1. **There is no delete endpoint.** `get_upload_url` (`api/manage/route.ts:1440`) mints an upload URL
>    and has no counterpart. Deleting would mean a **new server action with delete rights on
>    `truck-media`** — a wider permission than removing a logo needs.
> 2. **Clearing the column is what actually removes it everywhere**, because every surface resolves
>    through `resolveTruckLogo`.
> 3. **A delete that failed after the column was cleared would leave the same orphan anyway**, plus an
>    error the operator can do nothing about.
>
> ⚠️ **The cost, stated: an orphaned object in `truck-media` — a few KB, reachable only by someone who
> already knows its exact path. A storage sweep is a separate job.**

## 3 · The confirmation

> **Remove your logo? Customers will see your truck name without it. You can upload a new one at any
> time.**

**It names the consequence** (customers see the name alone) **and the reversibility**, so removing is a
decision rather than a reflex.

## 4 · Optimistic, no `reload()`

**Follows the §23 pattern the file already uses** — the same shape as `uploadLogo` directly below it and
`saveItemPatch`:

```
capture prev → setForm({ logo_storage_path: null })  (optimistic)
             → api('update_settings', { logo_storage_path: null })
             → onTruckUpdate({ logo_storage_path: null, logo: null })   (parent partial-merge)
   on error  → setForm({ logo_storage_path: prev })  + error toast
```

✅ **No `reload()`.** `onTruckUpdate` is the partial-merge callback the §23 rule names, already threaded
into this tab — so a tab switch cannot re-seed the old logo.

## 5 · Every surface that renders a truck logo, and what it shows when null

| Surface | Renderer | With null |
|---|---|---|
| Operator header (manage + dashboard) | `components/shared/AppHeader.tsx:116` — `{truckLogoUrl && (` | ✅ Renders nothing; the name remains |
| Customer ordering page | `app/trucks/[slug]/order/page.tsx:2492` — `{truck?.logo ? (` | ✅ Guarded ternary |
| Order confirmation | Same page, via `confirmOrder.truck_logo ?? null` (`:2202`) | ✅ Same guard |
| Embed | `components/embed/EmbedParts.tsx:27` — `truckLogoUrl()` returns null | ✅ |
| Discovery / events list | `components/EventListCard.tsx:204` — `{primaryEvent.logoUrl ? (` | ✅ |
| Truck directory | `app/trucks/page.tsx:115` — `{truck.logoUrl ? (` | ✅ |
| Settings card itself | `manage:9381` — `{form.logo_storage_path ? … : <span>🚚</span>}` | ✅ Falls back to a 🚚 |
| **Branded QR code** | `lib/generateQRCode.ts:71` — `if (!logoUrl && !placeholderText) return qrDataUrl`; poster path `:204` `if (logoUrl)` | ✅ **Degrades to a plain QR** |

> ✅ **NO SURFACE BREAKS AND NONE SHOWS A BROKEN IMAGE.** Every one is a presence check, not a bare `src`.

⚠️ **One behaviour worth knowing, not a break:** `truck.qr_code_style` can stay `'branded'` with no logo
(the dashboard's `showBrandedQr` at `:1685` tests the plan and the style, **not** the logo). The QR then
renders **plain** rather than branded. **Correct, and silent** — the operator is not told their branded QR
has become a standard one.

---

# PART TWO — the iOS app icon

## 6 · 🔴 THE BOLT IS ALREADY ONE COLOUR. MEASURED.

**Asset:** `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` — **the only iOS icon
file**, 1024×1024, **PNG colour type 2 (RGB — no alpha channel at all)**, 16,103 B.

**Decoded and counted (every 2nd pixel):**

```
#FFFFFF  93.6%      the background
#EF8B2C   6.2%      the bolt
everything else: 212 values, all ≤ 80 px, none ≥ 0.05%
```

**Saturated pixels only (the bolt and its edge), 16,598 sampled:**

```
#EF8B2C   97.76%
#F2A256    0.48%
#EF8C2E    0.09%   ← and 118 more values, single-digit counts each
```

**A scanline straight through the bolt (y=512):**

```
W@0×380   x@380×1   O@381×249   x@630×2   W@632×392
  x=380: #FAD8B8   x=630: #EF8D30   x=631: #FDF0E3
```

> ## ✅ ONE OR TWO PIXELS OF EDGE PER SIDE, AND THEY ARE WHITE↔ORANGE BLENDS. THAT IS ANTI-ALIASING.

**Ruling out each of the four candidates you named:**

| Candidate | Verdict |
|---|---|
| **A genuine second colour** | ❌ **No.** A second colour would be a *band* — hundreds of pixels of one consistent value. The runner-up is `#F2A256` at **80 px, 0.48%**, and it is a white/orange blend |
| **A stray alpha channel** | ❌ **Impossible.** The file is **colour type 2**; it has **no alpha channel** |
| **A compression halo** | ❌ **No.** PNG is lossless — there is no mechanism. A halo would also show as a *ring* of near-orange values; the intermediates are single-digit counts |
| **Anti-aliasing** | ✅ **YES** — 1-2 px, monotonic blends toward the white background |

**And I opened the file:** a flat orange bolt on white. **No outline, no rim, no second tone.**

## 7 · The other sources — same orange everywhere

| Asset | Size | Type | Saturated distinct | Dominant |
|---|---|---|---|---|
| **iOS** `AppIcon-512@2x.png` | 1024² | RGB | 121 | **#EF8B2C 97.76%** |
| Android `mipmap-xxxhdpi/ic_launcher_foreground.png` | 432² | RGBA, **97% transparent** | **8** | **#EF8B2C 96.40%** |
| Android `mipmap-xxxhdpi/ic_launcher.png` | 192² | RGBA, opaque | 91 | **#EF8B2C 87.95%** |
| Web `public/apple-touch-icon.png` | 180² | RGB | 174 | **#EF8B2C 61.93%** |

> 🔴 **EVERY SOURCE USES THE SAME BRAND ORANGE, `#EF8B2C`. NOTHING DIFFERS IN COLOUR.**

**What differs is anti-aliasing, and it tracks size and background exactly as it should:** the Android
**foreground** has only **8** distinct saturated values because it anti-aliases into **transparency** on a
432px canvas; `apple-touch-icon` has **174** because it is the smallest (180px) and blends into white.

**The canonical original:** 🔴 **there is no vector master in the repo** — no `.svg` of the bolt (`public/`
holds only `file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`, all Next.js boilerplate). **The
highest-fidelity source present is the Android `ic_launcher_foreground.png` at 432×432 on transparency**,
which is the cleanest of the four — but it is a raster, and it is **smaller than the 1024 iOS icon**, so
regenerating from it would *lose* resolution.

## 8 · 🔴 NOTHING REGENERATED, AND THAT IS THE FINDING

**You asked me to fix it so the bolt is one colour, regenerating at every required size. I have not,
because the measurement says the premise does not hold:**

- **The bolt IS one colour** (§6). Regenerating cannot make 97.76% into more than one colour.
- **Regenerating would only change the anti-aliasing** — and any regeneration at 1024px from a 432px
  raster would be *worse*, not better.
- **iOS needs exactly one 1024×1024 file** (`Contents.json` declares one `universal` entry). **There are
  no "every required size" variants to write** — Xcode derives the rest.

> ⚠️ **I am not going to write files, report sizes, and read them back to demonstrate a fix for a defect
> that is not in the asset.** That would be activity, not work.

### What is most likely producing what you see

**Anti-aliasing against white, magnified by how iOS renders icons:** the system applies its own rounded-
rect mask and downscales 1024px to ~60px on a home screen. **A 1-2px AA ramp at 1024 becomes a visible
lighter rim at 60**, and it reads as "a slightly different colour at the edge". **Android does not show it
because its foreground anti-aliases into transparency and is composited over the background layer** —
there is no white to blend toward.

🔴 **AND ONE REAL GAP WORTH KNOWING, established by reading `Contents.json`:** it declares **one** image
and **zero `appearances` keys**. **No dark or tinted variant is supplied.** On iOS 18+ the system
**derives** them, and the derived tinted icon is a luminance mapping that will **not** preserve `#EF8B2C`.
**If what you are seeing is on iOS 18 with a tinted or dark home screen, that is the cause — and the fix
is supplying the variants, not recolouring the bolt.** ⚠️ **I have not confirmed which iOS version or
appearance mode you looked at; that would settle it.**

## 9 · Does this need a native release?

**An app icon is compiled into the binary, so yes — any icon change ships only in a new build.**

| | |
|---|---|
| **Cost** | An iOS build + App Store submission and review |
| **Can it wait?** | ✅ **Yes — and on this evidence it should.** There is nothing to fix in the asset |
| **If the dark/tinted variants are wanted** | Still a native release. **Worth bundling with the `UIBackgroundModes` change** already identified as needing one, rather than spending a release on either alone |
| 🔴 **Android** | ✅ **UNTOUCHED. No asset, no manifest, no binary.** The Play review in progress is unaffected |

---

## Scope

| | |
|---|---|
| **Files changed by this task** | 🔴 **`app/manage/[token]/page.tsx` ONLY** |
| iOS / Android / `public` assets | ✅ **UNTOUCHED** — `git status` on `ios android public` is empty |
| Brand logos on the customer ordering page | ✅ **NOT TOUCHED**, as instructed |

⚠️ Other files in `git status` are the prior tasks' uncommitted work.

---

## What I could not establish

1. 🔴 **That the remove control works.** **`/manage` needs a session I do not have.** Clicking it, and
   confirming the logo disappears from the header and the customer page, is the test.
2. 🔴 **Whether any truck has ever had a null `logo_storage_path`.** Needs SQL. **The renderers are all
   guarded (§5), but the path may still be running for the first time in production.**
3. **Which iOS version and appearance mode you saw the icon in** — §8 says why that decides it.
4. **Whether a vector master exists outside the repo.** If one does, it is the right source for any future
   regeneration; nothing in the repo is.
